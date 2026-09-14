/**
 * 헤드리스 봇 정책 — **게임 규칙이 아니라 봇의 습관**이다. 여기 상수는 사람의 박자
 * (예비비·하루 한 번 결정) 이고, 게임 값에서 유도할 수 있는 것은 유도한다.
 * Phaser 없이 Node 에서 돈다 (불변식 1 의 실증). 골든 테스트와 `tools/bot.ts` 가 같은 정책을 쓴다.
 */
import { FACILITY_DEFS, ITEM_DEFS, SEASON_TABLES, INVEST_DEFS, FEATURES, type Game } from './game.js';
import { FLOOR, inRect } from './grid.js';
import { Rng } from './rng.js';
import { seasonOf, TICKS_PER_DAY, TICKS_PER_HOUR } from './clock.js';
import { scoreOf } from './endgame.js';
import { EVENT_DEFS } from './random-events.js';
import type { PoolColor, Condition } from '../data/schema.js';

export interface BotOptions {
  /** 예비비 — 이 아래로는 안 쓴다 */
  reserve: number;
  /** 하루에 파는 최대 칸 */
  digPerDay: number;
  /** 풀 하나의 목표 크기 — 넘으면 새 풀을 판다 */
  poolTarget: number;
  /** 풀 타일 이만큼마다 시설 하나 (G3) */
  facilityPerTiles: number;
  /** 계절에 맞는 아이템을 넣는가 */
  useItems: boolean;
  /** 성향 (G13) — 판당 하나. 결정마다 뽑지 않는다(스트림이 밀린다) */
  persona: BotPersona;
}

/**
 * 봇 성향 3종 — 「어떤 플레이어든 128일을 살아남고 콘텐츠에 닿는가」를 재는 눈.
 * balanced 가 골든·게이트의 정본이고, 나머지는 밸런스 스윕 대조군이다.
 *  · pool       풀만 키운다 — 시설은 드문드문, 아이템은 풀마다 10개, 투자 안 함
 *  · restaurant 식당 위주 — 풀 4칸마다 시설 하나, 식당 먼저, 하루 두 번 요리, 재료를 먼저 산다
 *  · cert       인증 사냥 — 신청 가능한 인증의 부족 조건을 소원처럼 좇고, 예비비를 낮춘다
 */
export type BotPersona = 'balanced' | 'pool' | 'restaurant' | 'cert';

export const BOT_DEFAULTS: BotOptions = { reserve: 3000, digPerDay: 4, poolTarget: 24, facilityPerTiles: 6, useItems: true, persona: 'balanced' };

export const BOT_PERSONAS: Record<BotPersona, BotOptions> = {
  balanced: BOT_DEFAULTS,
  pool: { ...BOT_DEFAULTS, digPerDay: 8, poolTarget: 48, facilityPerTiles: 12, persona: 'pool' },
  restaurant: { ...BOT_DEFAULTS, facilityPerTiles: 4, persona: 'restaurant' },
  cert: { ...BOT_DEFAULTS, reserve: 1500, persona: 'cert' },
};

export class Bot {
  private busArea(g: Game): string | undefined {
    const count = new Map<string, number>();
    for (const { friend } of g.sns.activeWishes()) { const a = g.sns.friendDef(friend.id)?.area; if (a) count.set(a, (count.get(a) ?? 0) + 1); }
    let best: string | undefined; let bestN = -1;
    for (const a of g.sns.areas) { const n = count.get(a) ?? 0; if (n > bestN) { bestN = n; best = a; } }
    return best;
  }
  private readonly rng: Rng;
  constructor(
    private readonly game: Game,
    private opts: BotOptions = BOT_DEFAULTS,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
  }

  /** 열린 사건에 답한다 (G39) — 비용이 예비비 안이면 첫 선택지(대개 「수락」), 아니면 공짜 선택지 */
  private answerEvent(spendable: () => number): void {
    const g = this.game;
    if (!g.events.pending) return;
    const def = EVENT_DEFS.get(g.events.pending);
    if (!def) { g.resolveEvent(0); return; }
    const k = def.choices.findIndex((c) => (c.cost ?? 0) <= Math.max(0, spendable()));
    g.resolveEvent(k >= 0 ? k : def.choices.length - 1);
  }

  /** 하루 개장 직후 한 번 — 풀 → 시설 → 아이템 순 (풀이 유입의 뿌리라 먼저) */
  decideDay(): void {
    const g = this.game;
    const spendable = (): number => g.money - this.opts.reserve;
    this.answerEvent(spendable);
    if (spendable() >= g.b.poolTileCost) {
      const n = Math.min(this.opts.digPerDay, Math.floor(spendable() / g.b.poolTileCost));
      const tiles = this.pickDigTiles(n);
      // ⚠ 한꺼번에 파면 흩어진 칸들의 합집합이 입구 도달을 끊어 통째로 거절된다 (실측: pool 성향이 52칸에서 영영 멈췄다) — 한 칸씩
      let dug = 0;
      for (const t of tiles) if (g.digPool([t]).ok) dug++;
      // 기존 풀 옆이 전부 막혔으면 새 풀 2×2
      if (dug === 0 && tiles.length > 0) { const fresh = this.pickDigTiles(4, true); if (fresh.length > 0) g.digPool(fresh); }
    }
    // 시설 — 풀 타일 수에 비례해 하나씩, 해금된 것 중 가장 싼 것부터 돌아가며
    const want = Math.floor(g.pools.totalTiles() / this.opts.facilityPerTiles);
    if (g.facilities.all.length < want) {
      const defs = [...FACILITY_DEFS.values()].filter((d) => g.isUnlocked(d.id) && d.capacity > 0).sort((a, b) => a.cost - b.cost);
      // 식당 성향: 식당이 열려 있으면 둘에 하나는 식당
      const rest = this.opts.persona === 'restaurant' && g.facilities.all.length % 2 === 0 ? defs.filter((d) => d.class === 'restaurant') : [];
      const pool = rest.length > 0 ? rest : defs;
      const pick = pool[g.facilities.all.length % Math.max(1, pool.length)];
      if (pick && spendable() >= pick.cost) this.tryPlace(pick.id);
    }
    // 직원 (G20) — 손님이 늘면 청소부, 풀이 크면 안전요원, 식당이 셋 이상이면 요리사. 사람의 박자: 하루 하나
    {
      const roles = g.staff.all.map((s) => s.role);
      const want: string | null = g.pools.totalTiles() >= 24 && !roles.includes('cleaner') ? 'cleaner'
        : g.pools.totalTiles() >= 48 && !roles.includes('lifeguard') ? 'lifeguard'
        : g.facilities.all.filter((f) => g.facilities.defOf(f).menuSlots > 0).length >= 3 && !roles.includes('cook') ? 'cook'
        : g.sns.totalLikes >= 3000 && !roles.includes('mascot') ? 'mascot'
        : g.staff.cleanliness < 50 && roles.filter((r) => r === 'cleaner').length < 3 ? 'cleaner' : null;
      if (FEATURES.staff && want && spendable() > 5000 && g.canHire(want).ok) g.hireStaff(want);
    }
    // 투자 — 여유가 크면 열린 트랙의 다음 단계 (놀이시설 우선)
    if (spendable() > 12000 && this.opts.persona !== 'pool') {
      const next = INVEST_DEFS.filter((d) => g.canInvest(d.id).ok).sort((a, b) => a.cost - b.cost)[0];
      if (next && spendable() - next.cost >= 6000) g.invest(next.id);
    }
    // 캠페인 — 주말 전날(dayInSeason 2)에 전단지, 여유 크면 버스
    if (g.day % 4 === 2) {
      for (const id of ['bus', 'flyer']) {
        const d = g.campaigns.defs.get(id);
        if (!d || spendable() - d.cost < 8000) continue;
        // 버스는 열린 소원이 가장 많은 지역으로 (없으면 첫 지역) — 원작 공략: 「요망이 있는 지역 or 티켓이 비싼 지역」
        const area = d.kind === 'bus' ? this.busArea(g) : undefined;
        if (g.campaigns.canStart(id, g.day, g.money, area).ok) { g.campaign(id, area); break; }
      }
    }
    // 인증 (R4, G51) — **아직 안 넘은 인증부터** (사다리를 오른다), 넘은 것은 재료가 필요할 때(같은 등급 재수상)만. 그 안에서 싼 것부터
    if (!g.certs.state.applied) {
      const cands = [...g.certs.defs.values()].filter((d) => g.certs.canApply(d.id, g.day, g.money - this.opts.reserve).ok);
      const passed = (id: string): number => g.certs.state.passed[id] ?? 0;
      const ready = cands.map((d) => ({ d, ex: g.expectedCert(d.id) })).filter((x) => x.ex && x.ex.base >= x.ex.pass).sort((a, b) => (passed(a.d.id) - passed(b.d.id)) || (a.d.fee - b.d.fee))[0];
      if (ready) g.applyCert(ready.d.id);
      else {
        // 못 넘는 인증 중 가장 싼 미통과 것의 부족 조건을 소원처럼 좇는다 — 인증 성향은 전부, 나머지는 신청료 2,500 이하만
        const target = cands.filter((d) => passed(d.id) === 0 && (this.opts.persona === 'cert' || d.fee <= 2500)).sort((a, b) => a.fee - b.fee)[0];
        if (target) for (const { cond } of target.conditions) this.pursue(cond, spendable);
      }
    }
    // 상점 — 여유가 크면 진열 중 가장 싼 것 하나 (해금 = 다음 소원의 재료)
    if (spendable() > 4000) {
      const cheapest = g.shopStock().sort((a, b) => a.price - b.price)[0];
      if (cheapest && spendable() - cheapest.price >= 2000) g.buyShop(cheapest.id);
    }
    // 후반 큰 지출 (G37) — 돈이 남아돌면 사람이 하듯 ① 풀을 좋은 타일로 갈고 ② 호화 상품을 산다
    if (spendable() > 60000) {
      const best = [...g.unlocked.tiles].map((id) => g.tileDef(id)).filter((t): t is NonNullable<typeof t> => !!t).sort((a, b) => b.pop - a.pop)[0];
      const pool = [...g.pools.all].sort((a, b) => b.tiles.length - a.tiles.length).find((p) => best && g.retileCost(p.id, best.id) <= spendable() - 20000 && g.retilePool(p.id, best.id).ok);
      if (!pool && spendable() > 80000) {
        const lux = g.shopStock().filter((e) => e.price <= spendable() - 30000).sort((a, b) => b.price - a.price)[0];
        if (lux) g.buyShop(lux.id);
      }
    }
    // 메뉴 — 식당마다 빈 칸에 아는 레시피를 (궁합 좋은 것 · 새 카테고리 우선)
    for (const f of g.facilities.all) {
      const def = g.facilities.defOf(f);
      if (def.menuSlots === 0) continue;
      const slots = g.menus.slotsOf(f.uid);
      const empty = slots.indexOf(null);
      if (empty < 0) continue;
      const have = new Set(g.menus.equipped(f.uid).map((r) => r.cat));
      // ⚠ Set 순서는 스냅샷 왕복 뒤 달라진다 — id 로 정렬해야 결정론이 산다
      const best = [...g.cooking.known].sort().map((id) => g.menus.recipes.get(id)).filter((r): r is NonNullable<typeof r> => !!r && !slots.includes(r.id))
        .map((r) => ({ r, score: r.pop * (g.menus.compatOf(def.id, r.id) === 'good' ? 1.5 : g.menus.compatOf(def.id, r.id) === 'bad' ? 0.5 : 1) + (have.has(r.cat) ? 0 : 3) }))
        .sort((a, b) => b.score - a.score)[0];
      if (best) g.setMenu(f.uid, empty, best.r.id);
    }
    // 요리 — 2년차부터 하루 한 번, 가진 재료로 아직 안 해 본 조합 (도감의 미발견 키를 그대로 노리지 않고 재료 2~4개 무작위)
    if (g.cookingOpen && spendable() > 2000) {
      const owned = [...g.cooking.owned].sort();
      if (owned.length >= 2) {
        // 봇의 습관: 절반은 「가진 재료로 되는 미발견 레시피」를 노린다(사람이 위키를 보듯), 절반은 무작위 2~4개
        const reachable = [...g.cooking.recipes.values()].filter((r) => !g.cooking.known.has(r.id) && r.unlock !== 'fail' && !r.unlock.startsWith('level') && g.cooking.fillFor(r.id) !== null).sort((a, b) => a.id.localeCompare(b.id));
        let ids: string[];
        if (reachable.length > 0 && this.rng.chance(0.5)) ids = g.cooking.fillFor((reachable[this.rng.int(reachable.length)] as { id: string }).id) ?? [];
        else {
          const n = 2 + this.rng.int(3);
          ids = [];
          for (let k = 0; k < n; k++) ids.push(owned[this.rng.int(owned.length)] as string);
        }
        if (g.canCook(ids).ok) g.cook(ids);
        if (this.opts.persona === 'restaurant' && reachable.length > 1 && spendable() > 2000) {
          const again = g.cooking.fillFor((reachable[this.rng.int(reachable.length)] as { id: string }).id) ?? [];
          if (g.canCook(again).ok) g.cook(again);
        }
      }
      // 재료 — 여유가 크면 상점 재료 하나
      if (spendable() > (this.opts.persona === 'restaurant' ? 2500 : 6000)) {
        const ing = [...g.cooking.ingredients.values()].filter((i) => i.unlock === 'shop' && !g.cooking.owned.has(i.id)).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
        if (ing) g.buyIngredient(ing.id);
      }
    }
    // 소원 추적 — 열린 소원의 조건을 하나씩 노린다 (PSS 의 핵심 루프: 소원을 들어줘야 친구·지역이 는다)
    // R3 (G48): 창이 임박한 소원부터 — 만료 3:1 을 학습으로 바꾼다
    for (const { wish } of [...g.sns.activeWishes()].sort((a, b) => a.friend.windowUntilDay - b.friend.windowUntilDay)) this.pursue(wish.condition, spendable);
    // 선물 — 예비비 위 여유가 크면 별이 낮은 친구에게 시작 선물 하나 (돈 → 진행 교환창)
    if (spendable() > 5000) {
      const target = g.sns.unlockedFriends.filter((f) => f.stars < 3 && f.activeWish === null).sort((a, b) => a.exp - b.exp)[0];
      const gift = [...g.unlocked.gifts].map((id) => g.sns.giftsById.get(id)).filter((x): x is NonNullable<typeof x> => !!x && !!target && !target.gifts.includes(x.id)).sort((a, b) => a.price - b.price)[0];
      if (target && gift && spendable() >= gift.price) g.giveGift(target.id, gift.id);
    }
    // 아이템 — 계절 보너스가 가장 큰 색을 가진 해금 아이템을 풀마다 하나
    if (this.opts.useItems) this.itemPass(spendable, 1);
  }

  /** 아이템 넣기 — 풀마다 `perPool` 개까지 (G37: 낮에 다시 채운다 — 아이템은 2~4시간이면 사라지니 원작의 상시 지출이 이것이다) */
  itemPass(spendable: () => number, perPool: number): void {
    const g = this.game;
    const season = seasonOf(g.day);
    const cap = this.opts.persona === 'pool' ? 10 : 6;
    for (const p of g.pools.all) {
      const st = g.poolState(p.id);
      if (!st) continue;
      const best = [...ITEM_DEFS.values()]
        .filter((d) => g.isItemUnlocked(d.id) && d.color !== null)
        .map((d) => ({ d, bonus: SEASON_TABLES.colors[d.color as PoolColor]?.[season] ?? 0 }))
        .sort((a, b) => b.bonus - a.bonus)[0];
      if (!best || best.bonus <= 0) continue;
      for (let k = 0; k < perPool && p.items.length < cap && spendable() >= best.d.price; k++) if (!g.putItem(p.id, best.d.id).ok) break;
    }
  }

  /** 낮 보충 (G37) — 돈이 남으면 12시·15시에 풀마다 셋까지 다시 넣는다. 사람이 하는 「풀 색 유지」 */
  decideMidday(): void {
    this.answerEvent(() => this.game.money - this.opts.reserve);
    if (!this.opts.useItems) return;
    const spendable = (): number => this.game.money - this.opts.reserve - 20000;
    if (spendable() <= 0) return;
    this.itemPass(spendable, 3);
  }

  /** 조건 하나를 향해 오늘 할 수 있는 일 하나 — 색·향·온도는 아이템, 시설은 배치, 크기는 파기 목표 상향 */
  private pursue(c: Condition, spendable: () => number): void {
    const g = this.game;
    if (c.kind === 'all' || c.kind === 'any') {
      for (const sub of c.of) if (!g.evaluateCondition(sub).met) { this.pursue(sub, spendable); if (c.kind === 'any') break; }
      return;
    }
    if (g.evaluateCondition(c).met) return;
    const biggest = [...g.pools.all].sort((a, b) => b.tiles.length - a.tiles.length)[0];
    // 색·향·온도 조건은 **작은 풀**에서 채운다 (원작 팁: 큰 풀은 농도가 안 오른다 — 1칸 풀로 소원을 채운다). 크기 조건이 있으면 그 이상 중 가장 작은 풀
    const needSize = c.kind === 'pool' ? (c.sizeMin ?? 1) : 1;
    const target = [...g.pools.all].filter((p) => p.tiles.length >= needSize).sort((a, b) => a.tiles.length - b.tiles.length)[0] ?? biggest;
    const items = [...ITEM_DEFS.values()].filter((d) => g.isItemUnlocked(d.id));
    const put = (pick: (d: (typeof items)[number]) => boolean, n = 2): void => {
      if (!target) return;
      const cands = items.filter(pick).sort((a, b) => a.price - b.price);
      const d = cands[0];
      if (!d) return;
      // 농도는 강도 × 주된 색 비중 — 풀이 클수록 더 넣어야 한다 (강도 = 100·Σw / (2√size))
      const need = Math.max(n, Math.ceil(0.5 * Math.sqrt(target.tiles.length)));
      for (let k = 0; k < need && spendable() >= d.price && g.canPutItem(target.id, d.id).ok; k++) g.putItem(target.id, d.id);
    };
    switch (c.kind) {
      case 'pool': {
        if (c.sizeMin !== undefined && (biggest?.tiles.length ?? 0) < c.sizeMin) this.opts = { ...this.opts, poolTarget: Math.max(this.opts.poolTarget, c.sizeMin + 2) };
        const st = target ? g.poolState(target.id) : null;
        if (c.color !== undefined && st?.color !== c.color) {
          if (c.color === 'rainbow') put((d) => d.color !== null, 8);
          else put((d) => d.color === c.color, 3);
        }
        if (c.scent !== undefined && st?.scent !== c.scent) put((d) => d.scent === c.scent, 2);
        if (c.tempMin !== undefined && (st?.temp ?? 0) < c.tempMin) put((d) => d.tempDelta > 0, 3);
        if (c.tempMax !== undefined && (st?.temp ?? 99) > c.tempMax) put((d) => d.tempDelta < 0, 3);
        break;
      }
      case 'item':
        put((d) => d.id === c.id, c.count ?? 1);
        break;
      case 'facility': {
        const def = FACILITY_DEFS.get(c.id);
        if (def && g.isUnlocked(c.id) && spendable() >= def.cost) this.tryPlace(c.id);
        break;
      }
      case 'facilityAdjacent': {
        const def = FACILITY_DEFS.get(c.ids[0]);
        if (def && g.isUnlocked(c.ids[0]) && spendable() >= def.cost) this.tryPlace(c.ids[0], c.ids[1]);
        break;
      }
      case 'facilityClass': {
        const def = [...FACILITY_DEFS.values()].filter((d) => d.class === c.class && g.isUnlocked(d.id)).sort((a, b) => a.cost - b.cost)[0];
        if (def && spendable() >= def.cost) this.tryPlace(def.id);
        break;
      }
      default:
        break; // 인기·좋아요·크기 합계 등은 성장이 자연히 채운다
    }
  }

  /** 풀 옆 빈 칸에 놓아 본다 — 인접해야 향·SE 가 풀에 간다. `nextTo` 를 주면 그 시설 옆 */
  private tryPlace(defId: string, nextTo?: string): boolean {
    const g = this.game;
    const cands: { i: number; j: number }[] = [];
    if (nextTo) {
      for (const f of g.facilities.all) {
        if (f.defId !== nextTo) continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
          if (g.canPlace(defId, f.i + di, f.j + dj).ok) cands.push({ i: f.i + di, j: f.j + dj });
        }
      }
      if (cands.length === 0) return false;
      const at = cands[this.rng.int(cands.length)] as { i: number; j: number };
      return g.placeFacility(defId, at.i, at.j).ok;
    }
    for (const p of g.pools.all) {
      for (const k of p.tiles) {
        const i = k % g.grid.w;
        const j = Math.floor(k / g.grid.w);
        for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]] as const) {
          if (g.canPlace(defId, i + di, j + dj).ok) cands.push({ i: i + di, j: j + dj });
        }
      }
    }
    if (cands.length === 0) return false;
    const at = cands[this.rng.int(cands.length)] as { i: number; j: number };
    return g.placeFacility(defId, at.i, at.j).ok;
  }

  /** 기존 풀 옆으로 자라거나(목표 크기 미만), 아니면 새 2×2 자리 */
  private pickDigTiles(n: number, forceNew = false): { i: number; j: number }[] {
    const g = this.game;
    const land = g.land;
    const out: { i: number; j: number }[] = [];
    const small = forceNew ? undefined : g.pools.all.find((p) => p.tiles.length < this.opts.poolTarget);
    if (small) {
      const cands: { i: number; j: number }[] = [];
      const seen = new Set<number>();
      for (const k of small.tiles) {
        const i = k % g.grid.w;
        const j = Math.floor(k / g.grid.w);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di;
          const nj = j + dj;
          const nk = nj * g.grid.w + ni;
          if (seen.has(nk) || !g.canDig(ni, nj).ok) continue;
          seen.add(nk);
          cands.push({ i: ni, j: nj });
        }
      }
      while (out.length < n && cands.length > 0) {
        const at = this.rng.int(cands.length);
        out.push(cands.splice(at, 1)[0] as { i: number; j: number });
      }
      // 한 번에 파면 원자성 검사가 통과해야 한다 — 하나씩 시험 파기
      const ok = out.filter((t) => g.canDig(t.i, t.j).ok);
      // ⚠ 사방이 시설로 막혀 후보가 0 이면 여기서 멈추지 말고 새 풀로 (실측: pool 성향이 balanced 보다 풀을 덜 팠다)
      if (ok.length > 0) return ok;
    }
    // 새 풀 — 토지 안 무작위 2×2, 입구 열은 피한다
    for (let tries = 0; tries < 30; tries++) {
      const i = land.i0 + 1 + this.rng.int(Math.max(1, land.w - 3));
      const j = land.j0 + 1 + this.rng.int(Math.max(1, land.h - 4));
      const sq = [{ i, j }, { i: i + 1, j }, { i, j: j + 1 }, { i: i + 1, j: j + 1 }];
      if (sq.every((t) => inRect(land, t.i, t.j) && g.grid.at(t.i, t.j) === FLOOR.grass && g.canDig(t.i, t.j).ok)) return sq.slice(0, Math.max(1, n));
    }
    return out;
  }
}

export interface RunMetrics {
  seed: number;
  days: number;
  money: number;
  visitors: number;
  poolTiles: number;
  pools: number;
  facilities: number;
  popularity: number;
  certs: number;
  rank: number;
  recipes: number;
  cookLevel: number;
  food: number;
  invests: number;
  campaigns: number;
  /** 128일 방문 중 버스로 온 몫 (G40 밴드) */
  busGuestsShare: number;
  /** ★3·★5 에 닿은 연차 (못 닿으면 99) — 계획 §2.6 「★3 ≤Y3 · ★5 는 Y6~Y7」 (G45 밴드) */
  rank3Year: number;
  rank5Year: number;
  /** 수입 중 매점 몫 (G45 밴드, 원작: 「수입 대부분은 입장료 + 매점」) */
  foodShare: number;
  /** 만료 소원 / 성립 소원 (G48 밴드 — 근접 실패가 학습이 되나) */
  wishExpireRatio: number;
  /** 서로 다른 인증 통과 수 · 통과한 계열 수 (G51 밴드 — 사다리를 실제로 오르나) */
  certsDistinct: number;
  certFamilies: number;
  /** 주말 평균 방문 / 평일 평균 방문 */
  weekendRatio: number;
  /** 여름 평균 방문 / 겨울 평균 방문 */
  summerWinterRatio: number;
  likes: number;
  areas: number;
  friends: number;
  wishes: number;
  /** 둘째 지역이 열린 날 (없으면 -1) */
  area2Day: number;
  /** 엔딩 점수식 (G11) — 성향 비교의 한 줄 요약 */
  score: number;
  perYear: { year: number; money: number; visitors: number; poolTiles: number; wishes: number; likes: number; spent: number; rank: number }[];
  /** 5~8년차 지출 / 전체 지출 (G30 — 후반에도 돈을 쓰는가) */
  lateSpendRatio: number;
  snapshotHash: number;
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** 스냅샷 해시 — 결정론 대조용 (문자열 FNV-1a) */
export function hashSnapshot(s: unknown): number {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function runBot(game: Game, days: number, opts: BotOptions = BOT_DEFAULTS): RunMetrics {
  const bot = new Bot(game, opts, game.seed ^ 0x5eed);
  const perYear: RunMetrics['perYear'] = [];
  const ticksPerDay = TICKS_PER_DAY;
  let area2Day = -1;
  const wishesDone = (): number => game.sns.unlockedFriends.reduce((n, f) => n + f.done.length, 0);
  for (let d = 0; d < days && !game.clock.ended; d++) {
    bot.decideDay();
    // 낮 보충 두 번 (12시 · 15시) — 아이템이 사라지는 박자에 맞춘 상시 지출
    game.step(TICKS_PER_HOUR * 4);
    bot.decideMidday();
    game.step(TICKS_PER_HOUR * 3);
    bot.decideMidday();
    game.step(ticksPerDay - TICKS_PER_HOUR * 7);
    game.drainFx();
    game.drainEvents();
    if (area2Day < 0 && game.sns.areas.length >= 2) area2Day = game.day;
    if (game.day % 16 === 0) perYear.push({ year: game.day / 16, money: game.money, visitors: game.stats.visitors, poolTiles: game.pools.totalTiles(), wishes: wishesDone(), likes: game.sns.totalLikes, spent: game.stats.spent ?? 0, rank: game.rank });
  }
  return {
    seed: game.seed,
    days,
    money: game.money,
    visitors: game.stats.visitors,
    poolTiles: game.pools.totalTiles(),
    pools: game.pools.all.length,
    facilities: game.facilities.all.length,
    popularity: game.parkPopularity(),
    certs: game.certs.passes(),
    rank: game.rank,
    recipes: game.cooking.known.size,
    cookLevel: game.cooking.level,
    food: game.stats.food,
    invests: game.investDone.size,
    campaigns: Object.keys(game.campaigns.state.cooldownUntil).length,
    busGuestsShare: game.stats.visitors > 0 ? (game.stats.busGuests ?? 0) / game.stats.visitors : 0,
    wishExpireRatio: (game.stats.wishExpired ?? 0) / Math.max(1, game.stats.wishDone ?? 0),
    certsDistinct: Object.entries(game.certs.state.passed).filter(([, n]) => n > 0).length,
    certFamilies: new Set(Object.entries(game.certs.state.passed).filter(([, n]) => n > 0).map(([id]) => game.certs.defs.get(id)?.family)).size,
    rank3Year: perYear.find((p) => p.rank >= 3)?.year ?? 99,
    rank5Year: perYear.find((p) => p.rank >= 5)?.year ?? 99,
    foodShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0)) > 0 ? (game.stats.food ?? 0) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0)) : 0,
    // ⚠ 실현 방문은 동시 상한(48)에 포화돼 평평하다 — 유입 **목표**로 곡선을 잰다
    weekendRatio: avg(game.stats.days.filter((d) => d.day % 4 === 3).map((d) => d.target ?? d.visitors)) / Math.max(1, avg(game.stats.days.filter((d) => d.day % 4 !== 3).map((d) => d.target ?? d.visitors))),
    summerWinterRatio: avg(game.stats.days.filter((d) => Math.floor(d.day / 4) % 4 === 1).map((d) => d.target ?? d.visitors)) / Math.max(1, avg(game.stats.days.filter((d) => Math.floor(d.day / 4) % 4 === 3).map((d) => d.target ?? d.visitors))),
    likes: game.sns.totalLikes,
    areas: game.sns.areas.length,
    friends: game.sns.unlockedFriends.length,
    wishes: wishesDone(),
    area2Day,
    score: scoreOf(game).total,
    perYear,
    lateSpendRatio: ((): number => { const total = game.stats.spent ?? 0; const y4 = perYear.find((p) => p.year === 4)?.spent ?? total; return total > 0 ? (total - y4) / total : 0; })(),
    snapshotHash: hashSnapshot(game.toSnapshot()),
  };
}

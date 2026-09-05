/**
 * 헤드리스 봇 정책 — **게임 규칙이 아니라 봇의 습관**이다. 여기 상수는 사람의 박자
 * (예비비·하루 한 번 결정) 이고, 게임 값에서 유도할 수 있는 것은 유도한다.
 * Phaser 없이 Node 에서 돈다 (불변식 1 의 실증). 골든 테스트와 `tools/bot.ts` 가 같은 정책을 쓴다.
 */
import { FACILITY_DEFS, ITEM_DEFS, SEASON_TABLES, INVEST_DEFS, FEATURES, type Game } from './game.js';
import { FLOOR, RIVER } from './grid.js';
import { Rng } from './rng.js';
import { seasonOf, TICKS_PER_DAY, TICKS_PER_HOUR } from './clock.js';
import { scoreOf } from './endgame.js';
import { EVENT_DEFS } from './random-events.js';
import { courseEquipment, firstFreeDock } from './course/course.js';
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
export type BotPersona = 'balanced' | 'pool' | 'restaurant' | 'cert' | 'course';

/** 데크 링 16칸 값 (P15) — 봇이 수역 하나를 만드는 데 드는 돈 */
const DECK_RING_COST = 16 * 60;
export const BOT_DEFAULTS: BotOptions = { reserve: 3000, digPerDay: 4, poolTarget: 24, facilityPerTiles: 6, useItems: true, persona: 'balanced' };

export const BOT_PERSONAS: Record<BotPersona, BotOptions> = {
  balanced: BOT_DEFAULTS,
  pool: { ...BOT_DEFAULTS, digPerDay: 8, poolTarget: 48, facilityPerTiles: 12, persona: 'pool' },
  restaurant: { ...BOT_DEFAULTS, facilityPerTiles: 4, persona: 'restaurant' },
  cert: { ...BOT_DEFAULTS, reserve: 1500, persona: 'cert' },
  /** P13 — 코스 성향: 선착장을 일찍, 수역마다 코스를 하나 더, 공방을 매일 */
  course: { ...BOT_DEFAULTS, digPerDay: 6, poolTarget: 32, persona: 'course' },
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
    this.layStreets(spendable); // P16: 손님은 길만 걷는다 — 가로 산책로가 없으면 식당까지 너무 멀다
    this.ensureSeats(g, spendable); // P17: 팀 손님이 서성이면 평상을 더 놓는다
    this.ensureLodging(g, spendable); // P18: 랭크 2 부터 숙박 시설을 하나, 32일마다 하나 더
    this.ensureUpgrades(g, spendable); // 후반 소비처 진단용 — `features.facilityLevels` 가 켜져 있을 때만 (기본 OFF, G22)
    // P15 D22 — 수영 구역은 데크로 둘러싸서 만든다(플레이어와 같은 규칙). 목표 칸 수까지 물가에 데크 링을 하나씩
    // 큰 수역 하나(인증 「수역 50·80칸」)가 먼저 — 가장 큰 링을 두 열 넓히고, 안 되면 새 링
    if (spendable() >= DECK_RING_COST) {
      // 큰 수역 하나는 인증(50·80칸)용으로 계속 넓히고, 작은 수역들은 물빛·분위기 소원용으로 랭크마다 둘씩 — 둘 다 하루 한 번
      const big = Math.max(0, ...g.pools.all.map((p) => p.tiles.length));
      if (big < 100) this.widenRing();
      if (spendable() >= DECK_RING_COST && g.pools.all.length < 3 + 3 * g.rank) this.layDeckRing();
    }
    this.ensureCourse(spendable);
    // 시설 — 풀 타일 수에 비례해 하나씩, 해금된 것 중 가장 싼 것부터 돌아가며
    const want = Math.floor(g.pools.totalTiles() / this.opts.facilityPerTiles);
    if (g.facilities.all.length < want) {
      const defs = [...FACILITY_DEFS.values()].filter((d) => g.isUnlocked(d.id) && d.capacity > 0).sort((a, b) => a.cost - b.cost);
      // 식당 성향: 식당이 열려 있으면 둘에 하나는 식당
      // 식당 성향은 둘에 하나, 나머지 성향도 셋에 하나는 식당 (P16: 길만 걷는 세계에서 원작의 「입장료 + 매점」 비율을 지키려면 식당이 더 촘촘해야 한다 — 매점 몫 0.21 → 0.25 실측)
      const every = this.opts.persona === 'restaurant' ? 2 : 3;
      const rest = g.facilities.all.length % every === 0 ? defs.filter((d) => d.class === 'restaurant') : [];
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
    // 알바 (P8) — 여유가 있으면 하루 하나: 매점 → 선착장 → 편의 순, 청결이 70 아래면 편의부터
    // ⚠ 시설 건설 예산(예비비 + 20,000)을 침범하지 않는다 — P8 첫 시도(3,000)는 먼 둑 시설 건설을 굶겼다(p3.test 실측)
    if (spendable() > 23000) {
      const order = g.cleanliness < 70 ? ['utility', 'restaurant', 'attraction'] : ['restaurant', 'attraction', 'utility'];
      const cand = g.facilities.all.filter((f) => !f.staff && g.canStaff(f.uid).ok).sort((a, b) => order.indexOf(g.facilities.defOf(a).class) - order.indexOf(g.facilities.defOf(b).class) || a.uid - b.uid)[0];
      if (cand && g.staffedCount() < Math.max(2, Math.floor(g.facilities.all.length / 3))) g.setStaffed(cand.uid, true);
    }
    // 기구 공방 (P7) — 선착장이 있고 여유가 있으면 하루 한 번: 가진 부품으로 되는 미발견 기구를 노린다(요리 정책과 같은 습관)
    if (g.facilities.all.some((f) => f.defId === 'dock') && spendable() > (this.opts.persona === 'course' ? 12000 : 22500)) {
      const ownedParts = [...g.workshop.owned].sort();
      if (ownedParts.length >= 2) {
        const reachable = [...g.workshop.recipes.values()].filter((r) => !g.workshop.known.has(r.id) && r.unlock !== 'fail' && !r.unlock.startsWith('level') && g.workshop.fillFor(r.id) !== null).sort((a, b) => a.id.localeCompare(b.id));
        let ids: string[];
        if (reachable.length > 0 && this.rng.chance(0.6)) ids = g.workshop.fillFor((reachable[this.rng.int(reachable.length)] as { id: string }).id) ?? [];
        else { const n = 2 + this.rng.int(3); ids = []; for (let k = 0; k < n; k++) ids.push(ownedParts[this.rng.int(ownedParts.length)] as string); }
        if (g.canCraft(ids).ok) g.craft(ids);
      }
      if (spendable() > 25000) {
        const part = [...g.workshop.ingredients.values()].filter((i) => i.unlock === 'shop' && !g.workshop.owned.has(i.id)).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
        if (part) g.buyPart(part.id);
      }
    }
    // 소원 추적 — 열린 소원의 조건을 하나씩 노린다 (PSS 의 핵심 루프: 소원을 들어줘야 친구·지역이 는다)
    // R3 (G48): 창이 임박한 소원부터 — 만료 3:1 을 학습으로 바꾼다
    this.wishPools.clear(); // P21: 오늘 소원이 노리는 풀 — 계절 아이템 투입이 그 풀의 색을 덮지 않게
    for (const { friend, wish } of [...g.sns.activeWishes()].sort((a, b) => a.friend.windowUntilDay - b.friend.windowUntilDay)) this.pursue(wish.condition, spendable, friend.id);
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
      if (this.wishPools.has(p.id)) continue; // P21 소원 풀은 소원 색을 지킨다
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
  /** P21 — 잠긴 시설을 열어 본다: 장날에 진열돼 있으면 사고, 투자로 열리는 것이면 그 단계에 투자한다 (둘 다 예비비 위에서만). 열렸으면 true */
  private unlockFacility(id: string, spendable: () => number): boolean {
    const g = this.game;
    if (g.isUnlocked(id)) return true;
    const def = FACILITY_DEFS.get(id);
    if (!def) return false;
    const entry = [...g.shop.entries.values()].find((e) => e.kind === 'facility' && e.ref === id && g.shop.state.stock.includes(e.id));
    if (entry && spendable() >= entry.price + def.cost) return g.buyShop(entry.id).ok;
    if (def.unlock.source === 'invest' && def.unlock.ref) {
      const inv = INVEST_DEFS.find((d) => d.id === def.unlock.ref);
      if (inv && g.canInvest(inv.id).ok && spendable() >= inv.cost + 6000) g.invest(inv.id); // 내일 열린다
    }
    return false;
  }

  /** P21 — 소원 조건(색·향·온도)을 채우는 중인 풀. `itemPass` 가 건너뛴다 (실측: 핑크·트로피컬 소원 76건 성립 0 — 계절 색이 덮었다) */
  private readonly wishPools = new Set<number>();

  private pursue(c: Condition, spendable: () => number, friendId?: string): void {
    const g = this.game;
    if (c.kind === 'all' || c.kind === 'any') {
      for (const sub of c.of) if (!g.evaluateCondition(sub).met) { this.pursue(sub, spendable, friendId); if (c.kind === 'any') break; }
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
      this.wishPools.add(target.id);
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
        if (def && this.unlockFacility(c.id, spendable) && spendable() >= def.cost) this.tryPlace(c.id); // P21: 잠겨 있으면 먼저 연다
        break;
      }
      case 'facilityAdjacent': {
        const def = FACILITY_DEFS.get(c.ids[0]);
        if (def && this.unlockFacility(c.ids[0], spendable) && spendable() >= def.cost) this.tryPlace(c.ids[0], c.ids[1]);
        break;
      }
      case 'gift': {
        // P21: 선물 소원 — 그 친구에게 바로 그 선물을 (없으면 장날에서 사 온다). 전에는 「별이 낮은 친구에게 시작 선물」만 줘서 성립 0 이었다
        const who = c.friendId ?? friendId;
        if (!who) break;
        const gift = g.sns.giftsById.get(c.id);
        if (!gift) break;
        if (!g.unlocked.gifts.has(c.id)) {
          const entry = [...g.shop.entries.values()].find((e) => e.kind === 'gift' && e.ref === c.id && g.shop.state.stock.includes(e.id));
          if (!entry || spendable() < entry.price + gift.price || !g.buyShop(entry.id).ok) break;
        }
        if (spendable() >= gift.price) g.giveGift(who, c.id);
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

  /**
   * 데크 다리 (P3, 재플레이 실측: 먼 강둑이 토지에 들어와도 봇이 못 건너 비어 있었다) — 랭크 ≥2 면 토지 안 열 하나에
   * 강을 가로지르는 데크를 아래 뭍에서 위로 한 칸씩 잇는다 (한 번에 한 줄, 돈이 되는 만큼).
   */
  /**
   * 견인 코스 (P4-A) — 선착장이 있고 가장 싼 소유 기구 값이 예비비 위에 있으면 코스를 놓는다.
   * 목표 수는 **수역 60칸마다 하나, 최대 3** (사람의 박자 — 작은 수역 하나에 코스 셋은 겹친다).
   * 빈 선착장이 없으면 수역 옆(데크 우선)에 선착장을 하나 짓는다 — 안 그러면 두 번째 코스가 구조적으로 안 생긴다.
   * 초안은 게임의 `suggestCourse` 그대로이고 막는 것은 `placeCourse` 판정이다 (봇이 규칙을 복제하지 않는다).
   */
  private ensureCourse(spendable: () => number): void {
    const g = this.game;
    const target = Math.min(3, 1 + Math.floor(g.pools.totalTiles() / 60));
    if (g.courses.count >= target + (this.opts.persona === 'course' ? 1 : 0)) return;
    // ⚠ Set 순서는 스냅샷 왕복 뒤 달라진다 — 값·id 로 정렬해야 결정론이 산다
    const cheapest = [...g.courses.ownedEquipment].map((id) => courseEquipment(id)).filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => a.vehicleCost - b.vehicleCost || a.id.localeCompare(b.id))[0];
    if (!cheapest || spendable() < cheapest.vehicleCost) return;
    const docks = g.dockChoices();
    // 빈 선착장을 **전부** 시도한다 — 첫 빈 선착장이 뭍에 갇힌 것이면(물이 부표 안으로 바뀜) 둘째 선착장이 살아 있어도 못 봤다 (실측)
    for (let k = 0; k < docks.length; k++) {
      if (firstFreeDock(docks.slice(k, k + 1), g.courses.all) < 0) continue;
      const d = docks[k] as (typeof docks)[number];
      const s = g.suggestCourse({ i: d.tip.x, j: d.tip.y }, { equipId: cheapest.id, vehicles: 1 });
      if (s.ok && g.placeCourse(s.draft).ok) return;
    }
    // P20: 쓸 수 있는 빈 선착장이 없다 → **트인 강 옆**에 하나 (P15: 코스는 부표 안 물을 못 지난다 — 옛 「코스 없는 가장 큰 수역 옆」은 부표 안이라 매일 선착장만 늘렸다). 선착장 ≤ 코스 + 2
    const dockDef = FACILITY_DEFS.get('dock');
    const dockCount = g.facilities.all.filter((f) => f.defId === 'dock').length;
    if (!dockDef || !g.isUnlocked('dock') || dockCount >= g.courses.count + 3 || spendable() < cheapest.vehicleCost + dockDef.cost) return;
    const land = g.land;
    const cands: { i: number; j: number; deck: boolean; far: number }[] = [];
    for (let j = land.j0 + land.h - 2; j <= g.waterMax; j++) for (let i = land.i0; i < land.i0 + land.w; i++) {
      if (!g.canPlace('dock', i, j).ok) continue;
      const open = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([di, dj]) => g.isOpenWater(i + di, j + dj));
      if (!open) continue;
      const far = Math.min(99, ...g.facilities.all.filter((f) => f.defId === 'dock').map((f) => Math.max(Math.abs(f.i - i), Math.abs(f.j - j))));
      if (far < 6) continue;
      cands.push({ i, j, deck: g.grid.at(i, j) === FLOOR.deck, far });
    }
    const at = cands.sort((a, b) => Number(b.deck) - Number(a.deck) || b.j - a.j || a.i - b.i)[0];
    if (!at || !g.placeFacility('dock', at.i, at.j).ok) return;
    if (spendable() < cheapest.vehicleCost) return;
    const pin = { i: at.i, j: at.j };
    const s = g.suggestCourse(pin, { equipId: cheapest.id, vehicles: 1 });
    if (s.ok) g.placeCourse(s.draft);
  }

  /** 풀 옆 빈 칸에 놓아 본다 — 인접해야 향·SE 가 풀에 간다. `nextTo` 를 주면 그 시설 옆 */
  private tryPlace(defId: string, nextTo?: string): boolean {
    const g = this.game;
    const cands: { i: number; j: number }[] = [];
    // P15: 실내 전용(사우나·찜질방)은 실내 바닥을 먼저 깐다 — 발자국 + 둘레 1칸의 잔디 블록을 찾아 칠하고 그 안에 놓는다
    const def = FACILITY_DEFS.get(defId);
    if (def?.indoorOnly && !g.canPlace(defId, g.gate.i, g.gate.j + 2).ok) {
      const land = g.land;
      const w = def.w + 2, d = def.d + 2;
      outer: for (let j = land.j0 + 2; j + d < land.j0 + land.h - 2; j += 2) for (let i = land.i0; i + w <= land.i0 + land.w; i += 2) {
        const block: { i: number; j: number }[] = [];
        for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) block.push({ i: i + a, j: j + b });
        if (!block.every((t) => g.grid.at(t.i, t.j) === FLOOR.grass && !g.facilities.occupied(t.i, t.j) && g.canPaintIndoor(t.i, t.j).ok)) continue;
        if (!g.paintIndoor(block).ok) continue;
        if (g.canPlace(defId, i + 1, j + 1).ok) { cands.push({ i: i + 1, j: j + 1 }); break outer; }
      }
    }
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
    // P16: 식당은 손님이 모이는 물가 산책로 쪽(아래 8줄)을 먼저 — 길만 걷는 세계에서 먼 식당은 안 팔린다
    if (def?.class === 'restaurant') {
      const land = g.land;
      const shore = cands.filter((c) => c.j >= land.j0 + land.h - 8);
      if (shore.length > 0) { const at = shore[this.rng.int(shore.length)] as { i: number; j: number }; return g.placeFacility(defId, at.i, at.j).ok; }
      for (let j = land.j0 + land.h - 8; j < land.j0 + land.h - 1; j++) for (let i = land.i0; i < land.i0 + land.w; i += 2) if (g.canPlace(defId, i, j).ok) cands.push({ i, j });
      if (cands.length > 0) { const at = cands[this.rng.int(cands.length)] as { i: number; j: number }; return g.placeFacility(defId, at.i, at.j).ok; }
    }
    // P0-B: 경사 지형에서는 풀 둘레가 단이 섞여 후보가 비기 쉽다 — 그때는 토지 전체에서 평지(2칸 간격 표본)를 찾는다
    if (cands.length === 0) {
      const land = g.land;
      for (let j = land.j0; j < land.j0 + land.h; j += 2) for (let i = land.i0; i < land.i0 + land.w; i += 2) {
        if (g.canPlace(defId, i, j).ok) cands.push({ i, j });
      }
    }
    if (cands.length === 0) return false;
    const at = cands[this.rng.int(cands.length)] as { i: number; j: number };
    return g.placeFacility(defId, at.i, at.j).ok;
  }

  /** 기존 풀 옆으로 자라거나(목표 크기 미만), 아니면 새 2×2 자리 */
  /**
   * 산책로 (P16) — 토지 안에 6줄마다 가로 길(입구 열과 이어짐)을 깐다. 자동 길은 나뭇가지라 손님이 멀리 못 가고 식당 매출이 빠졌다(밴드 실측 0.21).
   * 하루에 한 줄, 랭크가 올라 토지가 넓어지면 그 줄을 늘린다.
   */
  /** 시설 개선 — 스위치가 켜져 있고 여유가 크면 가장 많이 쓰인 시설 하나를 한 단계 (하루 하나). 꺼져 있으면 아무 것도 안 한다 */
  private ensureUpgrades(g: Game, spendable: () => number): void {
    if (!FEATURES.facilityLevels || spendable() < 30000) return;
    const cand = [...g.facilities.all].filter((f) => g.canUpgrade(f.uid).ok).sort((a, b) => b.usesTotal - a.usesTotal || a.uid - b.uid)[0];
    if (!cand) return;
    const cost = g.canUpgrade(cand.uid).cost ?? Infinity;
    if (spendable() >= cost + 20000) g.upgradeFacility(cand.uid);
  }

  /** P18 — 숙박: 랭크 ≥ 2 이면 가장 싼 숙박 시설을 1 + day/32 개까지 (사람의 박자: 하루 하나) */
  private ensureLodging(g: Game, spendable: () => number): void {
    if (g.rank < 2) return;
    const have = g.facilities.all.filter((f) => g.facilities.defOf(f).lodging === true).length;
    if (have >= 1 + Math.floor(g.day / 32)) return;
    const defs = [...FACILITY_DEFS.values()].filter((d) => d.lodging === true && g.isUnlocked(d.id)).sort((a, b) => a.cost - b.cost);
    const pick = defs[0];
    if (pick && spendable() >= pick.cost) this.tryPlace(pick.id);
  }
  private seatlessSeen = 0;
  private unseatedSeen = 0;
  /** P17 — 어제까지 「자리가 없네…」 가 3건 넘게 늘었으면 가장 싼 평상류를 하나 더 놓는다 (사람의 박자: 하루 하나) */
  private ensureSeats(g: Game, spendable: () => number): void {
    const now = g.stats.seatless ?? 0;
    const unseated = (g.stats.teamGuests ?? 0) - (g.stats.teamSeated ?? 0);
    if (now - this.seatlessSeen <= 3 && unseated - this.unseatedSeen <= 8) return; // 서성임 3건 또는 자리 못 잡은 팀 손님 8명이 늘면
    this.seatlessSeen = now; this.unseatedSeen = unseated;
    const defs = [...FACILITY_DEFS.values()].filter((d) => d.class === 'lounging' && g.isUnlocked(d.id) && d.capacity > 0).sort((a, b) => a.cost - b.cost);
    const pick = defs[0];
    if (pick && spendable() >= pick.cost) this.tryPlace(pick.id);
  }

  private layStreets(spendable: () => number): void {
    const g = this.game;
    const land = g.land;
    const lines: { i: number; j: number }[][] = [];
    for (let j = land.j0 + 6; j < land.j0 + land.h - 2; j += 6) { const t: { i: number; j: number }[] = []; for (let i = land.i0; i < land.i0 + land.w; i++) if (g.canPaintPath(i, j).ok) t.push({ i, j }); lines.push(t); }
    for (let i = land.i0 + 4; i < land.i0 + land.w - 1; i += 8) { const t: { i: number; j: number }[] = []; for (let j = land.j0 + 1; j < land.j0 + land.h - 2; j++) if (g.canPaintPath(i, j).ok) t.push({ i, j }); lines.push(t); }
    for (const tiles of lines) {
      if (tiles.length < 3) continue;
      if (spendable() < tiles.length * 20) return;
      g.paintPath(tiles);
      return; // 하루 한 줄
    }
  }

  /**
   * 링 넓히기 (P15) — 가장 큰 수역의 오른쪽(안 되면 왼쪽) 벽을 두 열 밖으로 옮긴다: 새 바닥 벽·새 옆 벽을 먼저 깔아 밀폐를 유지한 뒤 옛 옆 벽을 걷으면
   * 안쪽이 자동으로 합쳐진다(+2열 × 깊이). 옛 벽 위에 선착장이 있으면 그쪽은 못 걷는다 → 반대쪽.
   */
  private widenRing(): boolean {
    const g = this.game;
    const p = [...g.pools.all].sort((a, b) => b.tiles.length - a.tiles.length)[0];
    if (!p) return false;
    const is = p.tiles.map((k) => k % g.grid.w), js = p.tiles.map((k) => Math.floor(k / g.grid.w));
    const minI = Math.min(...is), maxI = Math.max(...is), minJ = Math.min(...js), maxJ = Math.max(...js);
    const bottom = maxJ + 1;
    const water = (i: number, j: number): boolean => { const f = g.grid.at(i, j); return (f === FLOOR.river || f === FLOOR.shallow) && !g.facilities.occupied(i, j); };
    // ① 아래(강 쪽)로 두 줄 — 링이 물가를 따라 붙어 있어 옆은 막히기 쉽다. 허가 줄 안이어야 한다
    if (bottom + 2 <= g.waterMax) {
      let ok = true;
      for (let i = minI; i <= maxI && ok; i++) if (!water(i, bottom + 1) || !water(i, bottom + 2)) ok = false;
      for (let j = bottom; j <= bottom + 2 && ok; j++) { const l = g.grid.at(minI - 1, j), r = g.grid.at(maxI + 1, j); if (!(l === FLOOR.deck || water(minI - 1, j)) || !(r === FLOOR.deck || water(maxI + 1, j))) ok = false; }
      for (let i = minI; i <= maxI && ok; i++) if (g.facilities.occupied(i, bottom)) ok = false;
      if (ok) {
        // 옆 벽 연장(위→아래) → 새 바닥 벽 → 옛 바닥 벽 걷기
        for (let j = bottom + 1; j <= bottom + 2; j++) for (const i of [minI - 1, maxI + 1]) if (g.grid.at(i, j) !== FLOOR.deck && !g.paintDeck([{ i, j }]).ok) return false;
        for (let i = minI; i <= maxI; i++) if (!g.paintDeck([{ i, j: bottom + 2 }]).ok) return false;
        const old: { i: number; j: number }[] = [];
        for (let i = minI; i <= maxI; i++) old.push({ i, j: bottom });
        return g.unpaintDeck(old).ok;
      }
    }
    for (const dir of [1, -1] as const) {
      const oldWall = dir === 1 ? maxI + 1 : minI - 1;
      const c1 = oldWall + dir, c2 = oldWall + 2 * dir; // 새 안쪽 열 · 새 벽 열
      if (g.grid.at(oldWall, minJ) !== FLOOR.deck) continue;
      let ok = true;
      for (let j = minJ; j <= maxJ && ok; j++) if (!water(c1, j) || !water(c2, j)) ok = false;
      if (!ok || !water(c1, bottom) || !water(c2, bottom)) continue;
      for (let j = minJ; j <= maxJ; j++) if (g.facilities.occupied(oldWall, j)) { ok = false; break; }
      if (!ok) continue;
      // 새 바닥 벽 → 새 옆 벽(아래서 위로) → 옛 옆 벽 걷기
      if (!g.paintDeck([{ i: c1, j: bottom }]).ok || !g.paintDeck([{ i: c2, j: bottom }]).ok) return false;
      for (let j = maxJ; j >= minJ; j--) if (!g.paintDeck([{ i: c2, j }]).ok) return false;
      const old: { i: number; j: number }[] = [];
      for (let j = minJ; j <= maxJ; j++) old.push({ i: oldWall, j });
      return g.unpaintDeck(old).ok;
    }
    return false;
  }

  /**
   * 데크 링 (P15) — 물가(여울 26)에서 아래로 6줄, 폭 6칸의 ㄷ자 데크(왼 열·먼 줄·오른 열 = 16칸)를 깔면 안쪽 4×5 가 자동 수영 구역이 된다.
   * 자리는 토지 안 물가를 왼쪽부터 7칸 간격으로 훑어 링 칸이 전부 트인 강인 첫 곳. 한 칸씩 깐다(이어서 규칙).
   */
  private layDeckRing(): boolean {
    const g = this.game;
    const land = g.land;
    // 허가 줄이 늘면 물가에서 한 단 더 먼 줄(6줄씩)에도 링을 놓는다 — 앞 링의 바닥 벽을 빌려 이어진다
    for (let tier = 0; tier < 3; tier++) {
    const top = RIVER.j0 + tier * 6, bottom = top + 5;
    if (bottom > g.waterMax) break;
    // 링 벽은 이미 있는 데크를 빌려도 된다(킷 링에 이어 붙이기) — 자리는 왼쪽부터 한 열씩 훑는다
    for (let c = land.i0; c + 5 < land.i0 + land.w; c++) {
      const ring: { i: number; j: number }[] = [];
      for (let j = top; j <= bottom; j++) ring.push({ i: c, j });
      for (let i = c + 1; i <= c + 4; i++) ring.push({ i, j: bottom });
      for (let j = bottom; j >= top; j--) ring.push({ i: c + 5, j });
      const water = (t: { i: number; j: number }): boolean => { const f = g.grid.at(t.i, t.j); return (f === FLOOR.river || f === FLOOR.shallow) && !g.facilities.occupied(t.i, t.j); };
      const wall = (t: { i: number; j: number }): boolean => water(t) || g.grid.at(t.i, t.j) === FLOOR.deck;
      let ok = ring.every(wall) && ring.some(water);
      for (let i = c + 1; i <= c + 4 && ok; i++) for (let j = top; j < bottom; j++) if (!water({ i, j })) { ok = false; break; }
      if (!ok) continue;
      for (const t of ring) { if (g.grid.at(t.i, t.j) === FLOOR.deck) continue; if (!g.paintDeck([t]).ok) return false; }
      return true;
    }
    }
    return false;
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
  /** 코스 탑승 (P4-C) — 128일 누적 */
  courseRiders: number;
  /** ★3·★5 에 닿은 연차 (못 닿으면 99) — 계획 §2.6 「★3 ≤Y3 · ★5 는 Y6~Y7」 (G45 밴드) */
  rank3Year: number;
  rank5Year: number;
  /** 수입 중 매점 몫 (G45 밴드, 원작: 「수입 대부분은 입장료 + 매점」) */
  foodShare: number;
  /** P17 팀 손님 중 자리를 잡은 비율 · 패키지 매출 비중 */
  teamSeatShare: number;
  pkgShare: number;
  /** P18 자고 간 손님 누계 · 숙박 매출 비중 */
  overnight: number;
  lodgingShare: number;
  /** P19 4년차까지 발견한 기구 레시피 수 (발견 페이싱 — 128일 중반에 다 찾으면 공방이 죽는다) */
  gearsKnownY4: number;
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
  /** 128일 뒤 놓인 견인 코스 수 (P4-A 밴드) */
  courses: number;
  /** 소유 기구 수 (P7 공방) — 시작 2, 공방·구입으로 는다 */
  gearsDistinct: number;
  /** 알바 슬롯 수 (P8) · 마지막 날 청결 */
  staffed: number;
  cleanliness: number;
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
  let gearsKnownY4 = 0; // P19 — 4년차(64일) 시점 공방 발견 수
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
    if (game.day === 64) gearsKnownY4 = game.workshop.known.size;
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
    courseRiders: game.stats.courseRiders ?? 0,
    wishExpireRatio: (game.stats.wishExpired ?? 0) / Math.max(1, game.stats.wishDone ?? 0),
    certsDistinct: Object.entries(game.certs.state.passed).filter(([, n]) => n > 0).length,
    certFamilies: new Set(Object.entries(game.certs.state.passed).filter(([, n]) => n > 0).map(([id]) => game.certs.defs.get(id)?.family)).size,
    rank3Year: perYear.find((p) => p.rank >= 3)?.year ?? 99,
    rank5Year: perYear.find((p) => p.rank >= 5)?.year ?? 99,
    foodShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0)) > 0 ? (game.stats.food ?? 0) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0)) : 0,
    overnight: game.stats.overnight ?? 0,
    gearsKnownY4,
    lodgingShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0) + (game.stats.lodging ?? 0)) > 0 ? (game.stats.lodging ?? 0) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0) + (game.stats.lodging ?? 0)) : 0,
    teamSeatShare: (game.stats.teamGuests ?? 0) > 0 ? (game.stats.teamSeated ?? 0) / (game.stats.teamGuests ?? 1) : 1,
    pkgShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0)) > 0 ? (game.stats.pkg ?? 0) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0)) : 0,
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
    courses: game.courses.count,
    gearsDistinct: game.courses.ownedEquipment.size,
    staffed: game.staffedCount(),
    cleanliness: game.cleanliness,
    snapshotHash: hashSnapshot(game.toSnapshot()),
  };
}

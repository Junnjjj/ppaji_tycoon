import { COURSE_DOCK_IDS } from './course/ride.js';
/**
 * 헤드리스 봇 정책 — **게임 규칙이 아니라 봇의 습관**이다. 여기 상수는 사람의 박자
 * (예비비·하루 한 번 결정) 이고, 게임 값에서 유도할 수 있는 것은 유도한다.
 * Phaser 없이 Node 에서 돈다 (불변식 1 의 실증). 골든 테스트와 `tools/bot.ts` 가 같은 정책을 쓴다.
 */
import { FACILITY_DEFS, INVEST_DEFS, FEATURES, Game } from './game.js';
import { FLOOR, isIndoorCode, shoreRow } from './grid.js';
import { CHAIN_BASE, CHAIN_CAP, PATH_COMPLETE_MIN, RIG_SETS, isShore } from './rig.js';
import { FacilityStore } from './facility.js';
import { RIG_UPGRADES } from './rig-upgrade.js';
import { Rng } from './rng.js';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './clock.js';
import { scoreOf } from './endgame.js';
import { EVENT_DEFS } from './random-events.js';
import { courseEquipment, firstFreeDock } from './course/course.js';
import type { Condition } from '../data/schema.js';

/** P53-a — 기구 조건 종류. 인증 9 · 소원 20 이 이것을 든다 */
export const RIG_COND_KINDS: ReadonlySet<string> = new Set(['rigCount', 'rigPath', 'rigGrade', 'rigGuarded', 'rigSet', 'rigPathComplete']); // P60-c: 세트(set_f/d/b) · P60-d: rigChain → rigPath(경로 길이) + rigPathComplete
export function hasRigCond(c: Condition | undefined): boolean {
  if (!c) return false;
  if (c.kind === 'all' || c.kind === 'any') return c.of.some(hasRigCond);
  return RIG_COND_KINDS.has(c.kind);
}
export function certHasRigCond(def: { conditions: { cond: Condition }[] } | undefined): boolean {
  return !!def && def.conditions.some((w) => hasRigCond(w.cond));
}

export interface BotOptions {
  /** P49-a1 — 축 스위치(대조군). a1 은 파싱만 하고 축을 내는 페이즈(P50-a·P51·P52-a·P54)가 읽는다 */
  noRig?: boolean; noConvert?: boolean; noVest?: boolean; noNight?: boolean;
  /** P60-c — `--no-set` 대조군: `attachRigs` 의 「세트 완성 후보 우선」을 끈다 */
  noSet?: boolean;
  /** P60-d — `--no-path` 대조군: `attachRigs` 의 「입수구 거리 오름차순 · 휴식 계열 마지막」 정렬을 끈다(세트 우선은 그대로) */
  noPath?: boolean;
  /** P60-e — `--no-court` 대조군: `growFoodCourt`(서서 > 0.3 이면 식탁 +1 블록) · 「반경 안 카테고리 다양성」 한 줄을 끈다 */
  noCourt?: boolean;
  /** 예비비 — 이 아래로는 안 쓴다 */
  reserve: number;
  /** 하루에 파는 최대 칸 */
  digPerDay: number;
  /** 풀 하나의 목표 크기 — 넘으면 새 풀을 판다 */
  poolTarget: number;
  /** 풀 타일 이만큼마다 시설 하나 (G3) */
  facilityPerTiles: number;
  /** 성향 (G13) — 판당 하나. 결정마다 뽑지 않는다(스트림이 밀린다) */
  persona: BotPersona;
}

/**
 * 봇 성향 3종 — 「어떤 플레이어든 128일을 살아남고 콘텐츠에 닿는가」를 재는 눈.
 * balanced 가 골든·게이트의 정본이고, 나머지는 밸런스 스윕 대조군이다.
 *  · pool       풀만 키운다 — 시설은 드문드문, 투자 안 함
 *  · restaurant 식당 위주 — 풀 4칸마다 시설 하나, 식당 먼저, 하루 두 번 요리, 재료를 먼저 산다
 *  · cert       인증 사냥 — 신청 가능한 인증의 부족 조건을 소원처럼 좇고, 예비비를 낮춘다
 */
export type BotPersona = 'balanced' | 'pool' | 'restaurant' | 'cert' | 'course';

/** 데크 링 16칸 값 (P15) — 봇이 수역 하나를 만드는 데 드는 돈 */
const DECK_RING_COST = 16 * 60;
export const BOT_DEFAULTS: BotOptions = { reserve: 3000, digPerDay: 4, poolTarget: 24, facilityPerTiles: 3, /* P47: 6 → 3 — 8년차 마당이 비어 보였다(재플레이). 수역 447칸이면 목표 149채, 돈은 남는다 */ persona: 'balanced' };

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
  /** P60-e — 마지막으로 푸드코트를 넓힌 날(주 1회 = 4일 상한) */
  private courtGrowDay = -99;
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
    // P47: `layStreets`(가로·세로 산책로 격자, P16 「길만 걷는다」 시절)는 지웠다 — 마당은 어디든 걷고(D52), 격자 길이 8년차 판을 주차장처럼 만들었다(재플레이 실측)
    this.ensureSeats(g, spendable); // P17: 팀 손님이 서성이면 평상을 더 놓는다
    this.ensureLodging(g, spendable); // P18: 랭크 2 부터 숙박 시설을 하나, 32일마다 하나 더
    this.ensureGarden(g, spendable); // P22: 평상 옆에 꽃밭 두 칸 — 조경 자리 값
    this.ensureHallShops(g, spendable); // P45-b D63: 복도 곁 점포 — 랭크마다 하나씩(최대 4)
    if (!this.opts.noCourt) this.growFoodCourt(g, spendable); // P60-e B2: 어제 서서 먹은 몫 > 0.3 이면 식탁 3×2 블록 하나(주 1회)
    this.ensureUpgrades(g, spendable); // 후반 소비처 진단용 — `features.facilityLevels` 가 켜져 있을 때만 (기본 OFF, G22)
    // P15 D22 — 수영 구역은 데크로 둘러싸서 만든다(플레이어와 같은 규칙). 목표 칸 수까지 물가에 데크 링을 하나씩
    // 큰 수역 하나(인증 「수역 50·80칸」)가 먼저 — 가장 큰 링을 두 열 넓히고, 안 되면 새 링
    if (spendable() >= DECK_RING_COST) {
      // 큰 수역 하나는 인증(50·80칸)용으로 계속 넓히고, 작은 수역들은 물빛·분위기 소원용으로 랭크마다 둘씩 — 둘 다 하루 한 번
      const big = Math.max(0, ...g.pools.all.map((p) => p.tiles.length));
      if (big < 100) this.growPpaji(spendable);
      if (spendable() >= DECK_RING_COST && g.pools.all.length < 3 + 3 * g.rank) this.growPpaji(spendable);
    }
    if (!this.opts.noRig) { this.attachRigs(g, spendable); this.chainRigs(g, spendable); }
    if (!this.opts.noConvert) { this.upgradeRig(g, spendable); this.buyRigParts(g, spendable); }
    this.ensureWatchtower(g, spendable); this.briefCourses(g); // P52-b §3.9: 딥 기구가 있으면 망루 + 알바, 코스는 브리핑 // P51 §3.9: 빠지 → 공방 — 도감을 보고 개조를 찾고, 아는 개조를 놓인 기구에 적용, 값싼 부품부터 산다 · `--no-convert` 대조군 // P50-b1 §3.9: 빠지 → 공방 순서 — 종 우선으로 붙이고, 같은 계열 사슬 끝을 늘린다(사슬 8 까지). ⚠ P50-b2 에서 「등급 0 수역마다 기구 셋」(spreadRigs)을 재 봤다 — 인기 4,200 은 넘지만 공짜 이용이 0.45 → 0.70 으로 늘어 친구·★4 가 오히려 늦었다. 팔찌(P52-a) 뒤에 다시 잰다
    this.ensureCourse(spendable);
    // 시설 — 풀 타일 수에 비례해 하나씩, 해금된 것 중 가장 싼 것부터 돌아가며
    const want = Math.floor(g.pools.totalTiles() / this.opts.facilityPerTiles);
    // P47: 하루 하나(옛 박자)는 128일에 100채가 상한이라 8년차 마당이 비었다 — 돈이 넉넉하면(예비비 위 3만) 하루 둘. 사람의 박자 상한은 둘
    for (let round = 0; round < 2 && g.facilities.all.length < want; round++) {
      if (round === 1 && spendable() < 30000) break;
      const defs = [...FACILITY_DEFS.values()].filter((d) => d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id) && d.capacity > 0 && d.class !== 'rig' && d.onRing !== true).sort((a, b) => a.cost - b.cost); // P50-b1: 기구·링 시설은 `attachRigs`/`chainRigs` 가 놓는다(뭍 시설 박자와 섞이면 기구가 판을 덮었다 — 실측 이용 몫 0.73) · `--no-rig` 는 그 둘을 끈다
      // 식당 성향: 식당이 열려 있으면 둘에 하나는 식당
      // 식당 성향은 둘에 하나, 나머지 성향도 셋에 하나는 식당 (P16: 길만 걷는 세계에서 원작의 「입장료 + 매점」 비율을 지키려면 식당이 더 촘촘해야 한다 — 매점 몫 0.21 → 0.25 실측)
      const every = this.opts.persona === 'restaurant' ? 2 : 3;
      const rest = g.facilities.all.length % every === 0 ? defs.filter((d) => d.class === 'restaurant') : [];
      const pool = rest.length > 0 ? rest : defs;
      const pick = pool[g.facilities.all.length % Math.max(1, pool.length)];
      if (!pick || spendable() < pick.cost || !this.tryPlace(pick.id)) break;
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
      const pool = null; // P49-a2: 물빛 갈기 삭제 — 후반 큰 지출은 호화 상품(기구 개조는 P51 이 봇에 넣는다)
      if (!pool && spendable() > 80000) {
        const lux = g.shopStock().filter((e) => e.price <= spendable() - 30000).sort((a, b) => b.price - a.price)[0];
        if (lux) g.buyShop(lux.id);
      }
    }
    // 메뉴 — 식당마다 빈 칸 하나씩 (P23: 점수는 Game.autoEquipMenus 가 갖는다 — 봇과 플레이어가 같은 규칙)
    for (const f of g.facilities.all) if (g.facilities.defOf(f).menuSlots > 0) g.autoEquipMenus(f.uid, 1);
    if (!this.opts.noCourt) this.diversifyCourtMenus(g); // P60-e B4: 영역 반경 안 점포가 같은 카테고리만 걸었으면 빠진 카테고리 하나를 건다(하루 하나)
    // 요리 — 2년차부터 하루 한 번, 가진 재료로 아직 안 해 본 조합 (도감의 미발견 키를 그대로 노리지 않고 재료 2~4개 무작위)
    if (g.cookingOpen && spendable() > 2000) {
      const owned = [...g.cooking.owned].filter((id) => g.cooking.has(id)).sort(); // P56-c: 재고가 있는 것만(시작 재료는 무한)
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
      // 재료 — 여유가 크면 하루 둘: 재고가 떨어진 열쇠 재료부터(값싼 것), 없으면 아직 안 산 장날 재료 (P56-c 재고)
      if (spendable() > (this.opts.persona === 'restaurant' ? 2500 : 6000)) this.restock(g.cooking, (id) => g.buyIngredient(id), spendable, 2);
    }
    // 알바 (P8) — 여유가 있으면 하루 하나: 매점 → 선착장 → 편의 순, 청결이 70 아래면 편의부터
    // ⚠ 시설 건설 예산(예비비 + 20,000)을 침범하지 않는다 — P8 첫 시도(3,000)는 먼 둑 시설 건설을 굶겼다(p3.test 실측)
    if (spendable() > 23000) {
      const order = g.cleanliness < 70 ? ['utility', 'restaurant', 'attraction'] : ['restaurant', 'attraction', 'utility'];
      const cand = g.facilities.all.filter((f) => !f.staff && g.canStaff(f.uid).ok).sort((a, b) => order.indexOf(g.facilities.defOf(a).class) - order.indexOf(g.facilities.defOf(b).class) || a.uid - b.uid)[0];
      if (cand && g.staffedCount() < Math.max(2, Math.floor(g.facilities.all.length / 3))) g.setStaffed(cand.uid, true);
    }
    // 기구 공방 (P7) — 선착장이 있고 여유가 있으면 하루 한 번: 가진 부품으로 되는 미발견 기구를 노린다(요리 정책과 같은 습관)
    if (g.facilities.all.some((f) => COURSE_DOCK_IDS.has(f.defId)) && spendable() > (this.opts.persona === 'course' ? 12000 : 22500)) {
      const ownedParts = [...g.workshop.owned].filter((id) => g.workshop.has(id)).sort(); // P56-c: 재고가 있는 것만
      if (ownedParts.length >= 2) {
        const reachable = [...g.workshop.recipes.values()].filter((r) => !g.workshop.known.has(r.id) && r.unlock !== 'fail' && !r.unlock.startsWith('level') && g.workshop.fillFor(r.id) !== null).sort((a, b) => a.id.localeCompare(b.id));
        let ids: string[];
        if (reachable.length > 0 && this.rng.chance(0.6)) ids = g.workshop.fillFor((reachable[this.rng.int(reachable.length)] as { id: string }).id) ?? [];
        else { const n = 2 + this.rng.int(3); ids = []; for (let k = 0; k < n; k++) ids.push(ownedParts[this.rng.int(ownedParts.length)] as string); }
        if (g.canCraft(ids).ok) g.craft(ids);
      }
      if (spendable() > 25000) this.restock(g.workshop, (id) => g.buyPart(id), spendable, 2); // P56-c: 재고 떨어진 부품부터 하루 둘
    }
    // 소원 추적 — 열린 소원의 조건을 하나씩 노린다 (PSS 의 핵심 루프: 소원을 들어줘야 친구·지역이 는다)
    // R3 (G48): 창이 임박한 소원부터 — 만료 3:1 을 학습으로 바꾼다
    for (const { friend, wish } of [...g.sns.activeWishes()].sort((a, b) => a.friend.windowUntilDay - b.friend.windowUntilDay)) this.pursue(wish.condition, spendable, friend.id);
    // 선물 — 예비비 위 여유가 크면 별이 낮은 친구에게 시작 선물 하나 (돈 → 진행 교환창)
    if (spendable() > 5000) {
      const target = g.sns.unlockedFriends.filter((f) => f.stars < 3 && f.activeWish === null).sort((a, b) => a.exp - b.exp)[0];
      const gift = [...g.unlocked.gifts].map((id) => g.sns.giftsById.get(id)).filter((x): x is NonNullable<typeof x> => !!x && !!target && !target.gifts.includes(x.id)).sort((a, b) => a.price - b.price)[0];
      if (target && gift && spendable() >= gift.price) g.giveGift(target.id, gift.id);
    }
  }

  /** 낮 결정 (12시 · 15시) — 사건 답만. P60-a: 소품 보충은 없다(소품 삭제, D71) */
  decideMidday(): void {
    this.answerEvent(() => this.game.money - this.opts.reserve);
  }

  /** 조건 하나를 향해 오늘 할 수 있는 일 하나 — 시설은 배치, 크기는 파기 목표 상향 */
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

  private pursue(c: Condition, spendable: () => number, friendId?: string): void {
    const g = this.game;
    if (c.kind === 'all' || c.kind === 'any') {
      for (const sub of c.of) if (!g.evaluateCondition(sub).met) { this.pursue(sub, spendable, friendId); if (c.kind === 'any') break; }
      return;
    }
    if (g.evaluateCondition(c).met) return;
    const biggest = [...g.pools.all].sort((a, b) => b.tiles.length - a.tiles.length)[0];
    switch (c.kind) {
      case 'pool': {
        if (c.sizeMin !== undefined && (biggest?.tiles.length ?? 0) < c.sizeMin) this.opts = { ...this.opts, poolTarget: Math.max(this.opts.poolTarget, c.sizeMin + 2) };
        // P60-a: 색·향은 사라졌고 수온은 계절·인접 시설(족욕·사우나 heat)에서 파생 — 소품으로 맞출 수 없다
        break;
      }
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
        const def = [...FACILITY_DEFS.values()].filter((d) => d.class === c.class && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id)).sort((a, b) => a.cost - b.cost)[0];
        if (def && spendable() >= def.cost) this.tryPlace(def.id);
        break;
      }
      case 'seatGrade': {
        // P28: 등급 높은 자리를 하나 더 — 평상류 후보 중 등급 순 (tryPlace 의 lounging 분기가 그렇게 고른다)
        const def = [...FACILITY_DEFS.values()].filter((d) => d.class === 'lounging' && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id) && d.lodging !== true).sort((a, b) => a.cost - b.cost)[0];
        if (def && spendable() >= def.cost) this.tryPlace(def.id);
        break;
      }
      case 'seatsFed': {
        // P28: 그 시설을 자리 곁에 — 있으면 평상을 그 옆에, 없으면 시설을 자리 옆에
        const have = g.facilities.all.find((f) => f.defId === c.id);
        if (have) { const seat = [...FACILITY_DEFS.values()].filter((d) => d.class === 'lounging' && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id) && d.lodging !== true).sort((a, b) => a.cost - b.cost)[0]; if (seat && spendable() >= seat.cost) this.tryPlace(seat.id, c.id); }
        else { const def = FACILITY_DEFS.get(c.id); if (def && this.unlockFacility(c.id, spendable) && spendable() >= def.cost) this.tryPlace(c.id, 'pyeongsang_row'); }
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
    const dockDef = FACILITY_DEFS.get('boarding_dock');
    const dockCount = g.facilities.all.filter((f) => COURSE_DOCK_IDS.has(f.defId)).length;
    if (!dockDef || !g.isUnlocked('boarding_dock') || dockCount >= g.courses.count + 3 || spendable() < cheapest.vehicleCost + dockDef.cost) return;
    const land = g.land;
    const cands: { i: number; j: number; deck: boolean; far: number }[] = [];
    for (let j = land.j0; j < g.grid.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) { // P48-b3: 물가가 S 라 행 범위 대신 전부 훑고 canPlace 가 거른다
      if (j < shoreRow(i) - 2) continue;
      if (!g.canPlace('boarding_dock', i, j).ok) continue;
      const open = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([di, dj]) => g.isOpenWater(i + di, j + dj));
      if (!open) continue;
      const far = Math.min(99, ...g.facilities.all.filter((f) => COURSE_DOCK_IDS.has(f.defId)).map((f) => Math.max(Math.abs(f.i - i), Math.abs(f.j - j))));
      if (far < 6) continue;
      cands.push({ i, j, deck: g.grid.at(i, j) === FLOOR.deck, far });
    }
    // P32 실측: 1순위 후보가 데크 외길 위라 「손님 길이 막힙니다」로 거절되면 하루를 통째로 잃었다(시드 2 가 128일 코스 1) — 상위 8개를 차례로 시도한다(자리 후보와 같은 규칙)
    cands.sort((a, b) => Number(b.deck) - Number(a.deck) || b.j - a.j || a.i - b.i);
    let at: { i: number; j: number } | null = null;
    for (const c of cands.slice(0, 8)) if (g.placeFacility('boarding_dock', c.i, c.j).ok) { at = c; break; }
    if (!at) return;
    if (spendable() < cheapest.vehicleCost) return;
    const pin = { i: at.i, j: at.j };
    const s = g.suggestCourse(pin, { equipId: cheapest.id, vehicles: 1 });
    if (s.ok) g.placeCourse(s.draft);
  }

  /** 풀 옆 빈 칸에 놓아 본다 — 인접해야 향·SE 가 풀에 간다. `nextTo` 를 주면 그 시설 옆 */
  private tryPlace(defId: string, nextTo?: string): boolean {
    { const d0 = FACILITY_DEFS.get(defId); if (this.opts.noRig && d0 && (d0.class === 'rig' || d0.onRing === true)) return false; } // P52-b: `--no-rig` 대조군은 해금 후보 경로(랭크 보상 다이빙대)로도 기구를 안 놓는다
    const g = this.game;
    const cands: { i: number; j: number }[] = [];
    // P38 D48: 실내 전용은 건물 바닥을 먼저 깐다 — 기존 실내 바닥에 붙여 넓힌다(없으면 내 땅 잔디에 새로). 발자국 + 둘레 1칸
    const def = FACILITY_DEFS.get(defId);
    if (def?.indoorOnly) { const hs = this.hallSpot(defId); if (hs) cands.push(hs); } // P45-b: 복도 곁부터
    if (def?.indoorOnly && cands.length === 0) {
      const land = g.land;
      const w = def.w + 2, d = def.d + 2;
      const near = (i: number, j: number): boolean => { for (let b = -1; b <= d; b++) for (let a = -1; a <= w; a++) if (isIndoorCode(g.grid.at(i + a, j + b))) return true; return false; };
      const spots: { i: number; j: number; adj: boolean }[] = [];
      for (let j = land.j0; j + d < land.j0 + land.h - 2; j++) for (let i = land.i0; i + w <= land.i0 + land.w; i++) {
        const block: { i: number; j: number }[] = [];
        for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) block.push({ i: i + a, j: j + b });
        if (!block.every((t) => (g.grid.at(t.i, t.j) === FLOOR.grass || g.grid.at(t.i, t.j) === FLOOR.indoor) && !g.facilities.occupied(t.i, t.j) && (g.grid.at(t.i, t.j) === FLOOR.indoor || g.canPaintIndoor(t.i, t.j).ok))) continue;
        spots.push({ i, j, adj: near(i, j) });
      }
      spots.sort((a, b) => Number(b.adj) - Number(a.adj) || a.j - b.j || a.i - b.i);
      for (const sp of spots.slice(0, 6)) {
        const tiles: { i: number; j: number }[] = [];
        for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) if (g.grid.at(sp.i + a, sp.j + b) !== FLOOR.indoor) tiles.push({ i: sp.i + a, j: sp.j + b });
        if (tiles.length > 0 && !g.paintIndoor(tiles).ok) continue;
        if (g.canPlace(defId, sp.i + 1, sp.j + 1).ok) { cands.push({ i: sp.i + 1, j: sp.j + 1 }); break; }
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
    // P27: 평상류(자리)는 물가 8줄에서 **등급이 가장 높은 칸**에 — 수역 둘레 ±2칸 후보는 금방 소진돼 자리가 16일에 2개씩만 늘었다(실측 7 → 29). 등급이 곧 팀의 선택이다(P24)
    if (def?.class === 'lounging') {
      const land = g.land;
      const best: { i: number; j: number; gr: number }[] = [];
      // 잔디 칸만 — 물가 산책로(포장) 위는 canPlace 는 통과해도 placeFacility 가 「길이 막힌다」로 거절한다(실측: 등급 5 후보가 전부 길 위). 상위 후보를 차례로 시도한다
      const grassOk = (i: number, j: number): boolean => g.grid.at(i, j) === FLOOR.grass && g.canPlace(defId, i, j).ok;
      // P48-b1: 물굽이가 물가를 세 배로 늘려 등급 높은 칸이 선착장·숙소에서 먼 곳에 넘친다 — 아직 못 본 패키지(기구·1박)의 원천 반경 안이면 +1 (사람도 「어디에 두면 뭐가 열리나」를 본다)
      const missGear = !g.packagesSeen.has('gear'), missStay = !g.packagesSeen.has('stay');
      const src = g.facilities.all.filter((f) => (missGear && (COURSE_DOCK_IDS.has(f.defId) || f.defId === 'gear_rack')) || (missStay && g.facilities.defOf(f).lodging === true));
      const bonus = (i: number, j: number): number => (src.some((f) => Math.max(Math.abs(f.i - i), Math.abs(f.j - j)) <= Game.SEAT_RADIUS) ? 1 : 0);
      for (let j = land.j0 + land.h - 9; j < land.j0 + land.h - 1; j++) for (let i = land.i0; i < land.i0 + land.w; i++) if (grassOk(i, j)) best.push({ i, j, gr: g.seatGradeAt(def, i, j, 0).grade + bonus(i, j) });
      if (best.length === 0) for (let j = land.j0 + 2; j < land.j0 + land.h - 9; j += 2) for (let i = land.i0; i < land.i0 + land.w; i += 2) if (grassOk(i, j)) best.push({ i, j, gr: g.seatGradeAt(def, i, j, 0).grade + bonus(i, j) });
      best.sort((a, b) => b.gr - a.gr || b.j - a.j || a.i - b.i);
      for (const at of best.slice(0, 8)) if (g.placeFacility(defId, at.i, at.j).ok) return true;
      if (best.length > 0) return false;
    }
    // P33: 식당은 **자리를 가장 많이 먹이는 칸**(seatsFedAt, 물가·먹거리 블록 안)을 먼저 — 데크(수역 둘레)가 먼저 잡히면 자리에서 4~6칸 떨어져 매점 몫이 0.29 → 0.18 (실측). 데크는 뭍에 자리가 없을 때만
    if (def?.class === 'restaurant') {
      const fed: { i: number; j: number; n: number }[] = [];
      const land = g.land;
      for (let j = land.j0; j < land.j0 + land.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) if (g.ownsTile(i, j) && g.canPlace(defId, i, j).ok) fed.push({ i, j, n: g.seatsFedAt(def, i, j, 0) });
      fed.sort((a, b) => b.n - a.n || b.j - a.j || a.i - b.i);
      for (const at of fed.slice(0, 6)) if (at.n > 0 && g.placeFacility(defId, at.i, at.j).ok) return true;
    }
    // P16: 식당은 손님이 모이는 물가 산책로 쪽(아래 8줄)을 먼저 — 길만 걷는 세계에서 먼 식당은 안 팔린다
    if (def?.class === 'restaurant') {
      const land = g.land;
      const shore = cands.filter((c) => c.j >= land.j0 + land.h - 8);
      if (shore.length > 0) { const at = shore[this.rng.int(shore.length)] as { i: number; j: number }; return g.placeFacility(defId, at.i, at.j).ok; }
      for (let j = land.j0 + land.h - 8; j < land.j0 + land.h - 1; j++) for (let i = land.i0; i < land.i0 + land.w; i += 2) if (g.canPlace(defId, i, j).ok) cands.push({ i, j });
      if (cands.length > 0) { const at = cands[this.rng.int(cands.length)] as { i: number; j: number }; return g.placeFacility(defId, at.i, at.j).ok; }
    }
    // P26 D32: 화장실류(noisy dirty)는 자리 반경 안에 놓으면 등급을 깎는다 — 후보에서 자리 3칸 안을 뺀다 (남는 후보가 없으면 그대로)
    if (def?.noisy === 'dirty') {
      const seats = g.facilities.all.filter((f) => g.facilities.defOf(f).class === 'lounging');
      const clean = cands.filter((c) => !seats.some((sf) => Math.max(Math.abs(sf.i - c.i), Math.abs(sf.j - c.j)) <= Game.SEAT_RADIUS));
      if (clean.length > 0) { const at = clean[this.rng.int(clean.length)] as { i: number; j: number }; return g.placeFacility(defId, at.i, at.j).ok; }
    }
    // P47 조밀 배치(§13 D58 짝): 슬라이드(물가) 말고는 **마당 전체**를 후보로 놓고 「4칸 안 이웃 시설 수」가 큰 칸부터 — 시설 곁에 붙여 채워 마당이 들판으로 남지 않게. 간격은 canPlace(P46)가 지킨다.
    // 재플레이 실측: 봇이 93개를 지어도 전부 물가에 몰려 8년차 마당 가운데가 잔디뿐이었다
    if (def && def.class !== 'slide') {
      const land = g.land; const gt = g.gate;
      const facs = g.facilities.all.map((f) => ({ i: f.i, j: f.j }));
      const scored: { i: number; j: number; s: number }[] = [];
      for (let j = land.j0; j < land.j0 + land.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) {
        if (g.grid.at(i, j) !== FLOOR.grass || !g.canPlace(defId, i, j).ok) continue;
        let near = 0; for (const f of facs) if (Math.max(Math.abs(f.i - i), Math.abs(f.j - j)) <= 4) near++;
        const door = { i: gt.i, j: gt.j + 21 }; // 출입동 마당 문 바로 아래 — 여기서부터 남쪽으로 채운다(손님 동선의 축)
        scored.push({ i, j, s: near * 1.5 - (Math.abs(i - door.i) + Math.abs(j - door.j)) * 0.25 });
      }
      if (scored.length > 0) {
        scored.sort((a, b) => b.s - a.s || a.j - b.j || a.i - b.i);
        const top = scored.slice(0, 4);
        const at = top[this.rng.int(top.length)] as { i: number; j: number };
        if (g.placeFacility(defId, at.i, at.j).ok) return true;
      }
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
  /** P22 조경 — 여유가 있으면 아직 조경이 없는 평상 하나의 둘레 잔디 두 칸에 꽃밭을 깐다 (하루 하나) */
  /** P45-b D63 — 복도(hall) 곁의 놓을 수 있는 자리: 복도 칸 오른쪽(i+1) → 왼쪽(i−w) 순, 위에서 아래로. 없으면 실내 아무 데나 */
  private hallSpot(defId: string): { i: number; j: number } | null {
    const g = this.game; const def = FACILITY_DEFS.get(defId); if (!def) return null;
    for (let j = 0; j < g.grid.h; j++) for (let i = 0; i < g.grid.w; i++) {
      if (g.grid.at(i, j) !== FLOOR.hall) continue;
      for (const [ci, cj] of [[i + 1, j], [i - def.w, j]] as const) if (g.canPlace(defId, ci, cj, 0).ok) return { i: ci, j: cj };
    }
    for (let j = 0; j < g.grid.h; j++) for (let i = 0; i < g.grid.w; i++) if (g.grid.at(i, j) === FLOOR.indoor && g.canPlace(defId, i, j, 0).ok) return { i, j };
    return null;
  }
  /** P45-b D63 — 복도 곁 점포: 지나가며 사는 시설(`passBy`)이 `min(4, 1 + 랭크)` 미만이면 해금된 것 중 가장 싼 것부터 하나. 하루 하나 */
  private ensureHallShops(g: Game, spendable: () => number): void {
    const have = g.facilities.all.filter((f) => FACILITY_DEFS.get(f.defId)?.passBy).length;
    if (have >= Math.min(4, 1 + g.rank)) return;
    const defs = [...FACILITY_DEFS.values()].filter((d) => d.passBy && d.indoorOnly && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id) && !g.facilities.all.some((f) => f.defId === d.id) && !(this.opts.noVest && d.id === 'rental_tube')).sort((a, b) => (a.id === 'rental_tube' ? -1 : b.id === 'rental_tube' ? 1 : 0) || a.cost - b.cost || a.id.localeCompare(b.id)); // P52-a: 대여소가 먼저(하루권 정본) · `--no-vest` 대조군은 대여소 없이(창구 ⓑ 만)
    for (const d of defs) {
      if (spendable() < d.cost + 3000) return;
      const sp = this.hallSpot(d.id); if (!sp) continue;
      if (g.placeFacility(d.id, sp.i, sp.j, 0).ok) return;
    }
  }
  /**
   * P60-e B2 — 어제 결산(`stats.days` 끝)의 서서 먹은 몫 > 0.3 이면 푸드코트를 3×2 블록 하나만큼 넓힌다(기존 영역을 통째로 덮는 확장 → 안 되면 새 3×2). 주 1회(4일) · 60G/칸.
   * 새 영역은 점포(menuSlots>0)가 반경 3 안에 있는 실내 바닥부터 — 반경 밖 식탁은 손님이 안 잡는다(`SEAT_REACH`)
   */
  private growFoodCourt(g: Game, spendable: () => number): void {
    const y = g.stats.days[g.stats.days.length - 1]; if (!y || !(y.eats ?? 0)) return;
    if ((y.standEats ?? 0) / (y.eats ?? 1) <= 0.3) return;
    if (g.day - this.courtGrowDay < 4) return;
    const tryRect = (r: { i0: number; j0: number; w: number; h: number }): boolean => { const c = g.canMakeFoodCourt(r); if (!c.ok || (c.cost ?? 0) > spendable()) return false; if (!g.makeFoodCourt(r).ok) return false; this.courtGrowDay = g.day; return true; };
    for (const c of [...g.foodcourts.all]) {
      for (const r of [{ i0: c.i0, j0: c.j0, w: c.w + 3, h: c.h }, { i0: c.i0 - 3, j0: c.j0, w: c.w + 3, h: c.h }, { i0: c.i0, j0: c.j0, w: c.w, h: c.h + 2 }, { i0: c.i0, j0: c.j0 - 2, w: c.w, h: c.h + 2 }]) if (tryRect(r)) return;
    }
    // 새 영역 — 점포 반경 3 안 실내 바닥 3×2 부터(점포 수 내림차순), 없으면 아무 실내 바닥
    const shops = g.facilities.all.filter((f) => g.facilities.defOf(f).menuSlots > 0);
    const cands: { i: number; j: number; n: number }[] = [];
    for (let j = 0; j < g.grid.h - 1; j++) for (let i = 0; i < g.grid.w - 2; i++) {
      if (g.grid.at(i, j) !== FLOOR.indoor || !g.canMakeFoodCourt({ i0: i, j0: j, w: 3, h: 2 }).ok) continue;
      cands.push({ i, j, n: shops.filter((f) => Math.max(Math.abs(f.i - (i + 1)), Math.abs(f.j - j)) <= Game.SEAT_RADIUS + 1).length });
    }
    cands.sort((a, b) => b.n - a.n || a.j - b.j || a.i - b.i);
    for (const c of cands.slice(0, 4)) if (tryRect({ i0: c.i, j0: c.j, w: 3, h: 2 })) return;
  }
  /** P60-e B4 — 영역 반경 안 점포에 빈 칸이 있고 구색이 4 미만이면, 아는 레시피 중 빠진 카테고리(인기 순 · 궁합 △ 제외) 하나를 건다. 하루 하나 */
  private diversifyCourtMenus(g: Game): void {
    for (const c of g.foodcourts.all) {
      const have = g.courtMenuCatsOf(c.id); if (have.size >= 4) continue;
      for (const f of g.courtShopsOf(c.id)) {
        const slots = g.menus.slotsOf(f.uid); const empty = slots.indexOf(null); if (empty < 0) continue;
        const pick = [...g.cooking.known].sort().map((id) => g.menus.recipes.get(id)).filter((r): r is NonNullable<typeof r> => !!r && !have.has(r.cat) && !slots.includes(r.id) && g.menus.compatOf(f.defId, r.id) !== 'bad').sort((a, b) => b.pop - a.pop || a.id.localeCompare(b.id))[0];
        if (pick && g.setMenu(f.uid, empty, pick.id).ok) return;
      }
    }
  }
  private ensureGarden(g: Game, spendable: () => number): void {
    if (spendable() < 8000) return; // P27: 자리·숙박에 돈이 먼저 가서 2만 문턱이면 조경이 굶었다(실측 중앙 2칸)
    const seat = g.facilities.all.filter((f) => g.facilities.defOf(f).class === 'lounging' && g.facilities.defOf(f).derived !== true && !g.seatValueOf(f.uid).landscaped) /* P58-a: 식탁(실내·파생)은 꽃밭 대상이 아니다 — 잡으면 잔디 후보 0 으로 조경이 영영 안 된다 */.sort((a, b) => b.usesTotal - a.usesTotal || a.uid - b.uid)[0];
    if (!seat) return;
    const def = g.facilities.defOf(seat);
    const cands: { i: number; j: number }[] = [];
    for (let j = seat.j - 2; j <= seat.j + def.d + 1 && cands.length < 2; j++) for (let i = seat.i - 2; i <= seat.i + def.w + 1 && cands.length < 2; i++) if (g.grid.at(i, j) === FLOOR.grass && g.canPaintGround(i, j, 'flowerbed').ok) cands.push({ i, j }); // 둘레 2칸(등급의 조경 반경과 같다)
    if (cands.length === 2 && spendable() >= g.groundCost(cands, 'flowerbed')) g.paintGround(cands, 'flowerbed');
  }

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
    const defs = [...FACILITY_DEFS.values()].filter((d) => d.lodging === true && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id)).sort((a, b) => a.cost - b.cost);
    const pick = defs[0];
    if (!pick || spendable() < pick.cost) return;
    // P27: 1박은 등급 ≥ 2 자리에서만 성립한다(P24) — 물가(아래 8줄)에서 등급이 2 이상인 칸을 고른다. 아무 데나 놓으면 0박(실측 camp_site 등급 0)
    const cands: { i: number; j: number; gr: number }[] = [];
    const land = g.land;
    for (let j = land.j0 + land.h - 9; j < land.j0 + land.h - 1; j++) for (let i = land.i0; i < land.i0 + land.w; i += 2) if (g.canPlace(pick.id, i, j).ok) { const gr = g.seatGradeAt(pick, i, j, 0).grade; if (gr >= 2) cands.push({ i, j, gr }); }
    if (cands.length === 0) return;
    cands.sort((a, b) => b.gr - a.gr || a.j - b.j || a.i - b.i);
    const at = cands[0] as { i: number; j: number };
    g.placeFacility(pick.id, at.i, at.j);
  }
  private teamSeqAtDayStart = 0;
  /** P17 — 어제까지 「자리가 없네…」 가 3건 넘게 늘었으면 가장 싼 평상류를 하나 더 놓는다 (사람의 박자: 하루 하나) */
  private ensureSeats(g: Game, spendable: () => number): void {
    // P27: 팀은 자리를 하루(파크에 있는 동안) 통째로 잡는다 — 자리 수가 곧 「앉을 수 있는 팀 수」다. 어제 온 팀 수의 0.8 만큼 자리를 갖춘다 (하루 최대 3, 정원/값이 좋은 것부터)
    const teamsYesterday = g.teamSeq - this.teamSeqAtDayStart;
    this.teamSeqAtDayStart = g.teamSeq;
    const seats = g.facilities.all.filter((f) => g.facilities.defOf(f).class === 'lounging').length;
    const target = Math.max(2, Math.round(teamsYesterday * 0.8));
    if (seats >= target) return;
    const defs = [...FACILITY_DEFS.values()].filter((d) => d.class === 'lounging' && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id) && d.capacity > 0 && d.lodging !== true).sort((a, b) => b.capacity / b.cost - a.capacity / a.cost || a.cost - b.cost);
    const pick = defs[0];
    if (!pick) return;
    for (let k = 0; k < 3 && seats + k < target && spendable() >= pick.cost; k++) if (!this.tryPlace(pick.id)) break;
  }


  /** P50-b1 §3.9 — 물 위 기구 후보 칸: 내 빠지 안 물 중 데크(링)나 켜진 기구 발자국에 4이웃으로 닿는 칸(놓으면 켜진다) */
  private litWaterSpots(g: Game): { i: number; j: number }[] {
    const out: { i: number; j: number }[] = [];
    for (const p of g.pools.all) for (const k of p.tiles) {
      const i = k % g.grid.w, j = Math.floor(k / g.grid.w);
      if (g.facilities.occupied(i, j)) continue;
      const near = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => g.grid.at(i + a, j + b) === FLOOR.deck || g.facilities.isWalkOn(i + a, j + b));
      if (near) out.push({ i, j });
    }
    return out;
  }
  /** `attachRigs` — 아직 안 놓은 **종**을 먼저(등급은 종 수로 오른다), 하루 하나. 후보 시도 ≤ 8 */
  private attachRigs(g: Game, spendable: () => number): boolean {
    const have = new Set(g.facilities.all.map((f) => baseKind(f.defId))); // 개조판은 원래 종으로 센다 — 아니면 개조 뒤 같은 종을 또 놓는다(실측 종 4·개조 118)
    // 아직 안 놓은 종만 — 종이 다 놓였으면 붙이지 않는다(붙이기가 곧 사슬 도배가 됐다: 실측 최장 사슬 21~28). 사슬은 `chainRigs` 가 계열 값으로만 늘린다
    // P60-c §3.6 — 「멤버 2/3 이 이미 켜진 세트를 완성하는 후보 우선」: 그 종은 이미 다른 수역에 있어도 다시 후보에 들고(세트는 수역 단위다) 앞에 서며, 그 자리는 켜진 멤버 발자국의 4이웃부터(안 그러면 헤드리스가 세트 축을 안 잰다 — K36·P2-C·K52 와 같은 함정). `--no-set` 대조군은 종 우선·값 순 그대로
    const completes = this.opts.noSet ? new Map<string, { near2: Set<number>; near1: Set<number> }>() : this.setCompleters(g);
    const done = (id: string): boolean => (completes.get(id)?.near2.size ?? 0) > 0; // 놓으면 성립
    // 순서: 성립 후보 → 새 종(값 순) → 세트를 쌓는 둘째 사본(값 순). 둘째 사본은 세트 멤버 곁에만 서므로 8세트 × 2 가 상한이고, 새 종보다 뒤라 종 수를 안 깎는다
    // P60-d §10.4 — 새 종 안에서는 **휴식 계열을 마지막에**(코스의 끝), 그 앞은 스릴 오름차순(경로의 스릴이 비감소여야 완성). 세트 완성 > 입수구 거리 — 우선순위 둘을 합친 것. `--no-path` 는 옛 값 순
    const tier = (d: { id: string }): number => (done(d.id) ? 0 : !have.has(d.id) ? 1 : 2);
    const restLast = (d: { chain?: string | null; thrill?: number }): number => (this.opts.noPath ? 0 : d.chain === 'rest' ? 100 : (d.thrill ?? 0));
    const defs = [...FACILITY_DEFS.values()].filter((d) => d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id) && ((d.class === 'rig' && d.onRing !== true && (!have.has(d.id) || completes.has(d.id))) || (d.onRing === true && completes.has(d.id)))).sort((a, b) => tier(a) - tier(b) || restLast(a) - restLast(b) || a.cost - b.cost); // 링 위 종은 세트 자리에서만 · P60-d: 휴식 계열은 새 종 중 맨 뒤·먼 자리(⚠ 휴식을 `capCourse` 에만 맡겨 봤다 — 초반 값싼 기구 둘이 빠져 밤 파티가 94 → 17~44 일로 늦어져 되돌렸다)
    const spots0 = this.litWaterSpots(g);
    const usePath = !this.opts.noPath; // P60-d: 입수구 거리(경로 BFS 거리) — 가까운 자리부터(휴식은 먼 자리부터)
    if (usePath && this.capCourse(g, spendable, spots0)) return true; // P60-d: 경로 ≥3 이 스릴 순으로 서 있는데 끝이 휴식이 아니면 휴식 하나를 끝에 — 「마지막엔 rest」
    // P60-d 자리 값 — ① 세트 자리 ② 켜진 기구가 많은 수역부터(등급 3·밤 파티가 「한 수역에 9~14」를 요구한다 — 입수구 거리만 보면 수역마다 흩어져 밤이 0 이었다, 실측) ③ 스릴 순서 벌점(그 수역에서 스릴이 더 낮은 기구보다 입수구에 가까우면 뒤로 — 경로의 스릴 비감소) ④ 입수구 거리
    const poolPri = (pid: number): number => -(g.rigState.byPool.get(pid)?.length ?? 0);
    for (const d of defs) {
      if (spendable() < d.cost) continue;
      let tried = 0;
      const near = completes.get(d.id);
      if (d.onRing === true && near) { // 링 위 멤버 — 켜진 멤버 곁의 데크 칸에만
        for (const k of [...near.near2, ...(have.has(d.id) ? [] : [...near.near1])]) { const i = k % g.grid.w, j = Math.floor(k / g.grid.w); if (g.grid.at(i, j) !== FLOOR.deck) continue; for (const facing of [0, 1] as const) if (g.placeFacility(d.id, i, j, facing).ok) return true; }
        continue;
      }
      // 세트 자리부터(성립 자리 → 쌓는 자리 → 나머지) — 이미 다른 수역에 있는 종은 **성립 자리에만**(아무 데나 두면 세트 없는 중복이 되어 종 수·기구 지출이 무너진다: 실측 rigsDistinct 18 → 12)
      const rankOf = (sp: { i: number; j: number }): number => { const k = sp.j * g.grid.w + sp.i; return near?.near2.has(k) ? 0 : near?.near1.has(k) ? 1 : 2; };
      const levelOf = (sp: { i: number; j: number }): number => (usePath ? this.pathLevelAt(g, sp.i, sp.j) : Infinity);
      const distOf = (sp: { i: number; j: number }): number => { const v = levelOf(sp); return d.chain === 'rest' && Number.isFinite(v) ? -v : v; }; // 휴식은 먼 자리부터(경로 끝), 경로에 안 닿는 자리는 맨 뒤
      const keyOf = (sp: { i: number; j: number }): number[] => {
        if (!usePath) return [rankOf(sp)];
        const pid = g.pools.ownerIdAt(sp.i, sp.j);
        return [rankOf(sp), poolPri(pid), distOf(sp)]; // 세트 자리 > 큰 수역(입수구 거리만 보면 수역마다 흩어져 밤 파티(한 수역 9)가 0 이 됐다 — 실측) > 입수구 거리. ⚠ 「스릴 순서가 맞는 자리」(pathFit) 벌점도 재 봤다 — 완성 몫이 대조군과 같은 0.20 이고 밤만 94 → 56 으로 줄어 뺐다
      };
      const cmp = (x: { i: number; j: number }, y: { i: number; j: number }): number => { const a = keyOf(x), b = keyOf(y); for (let k = 0; k < a.length; k++) if ((a[k] as number) !== (b[k] as number)) return (a[k] as number) - (b[k] as number); return 0; };
      const spots = near ? (have.has(d.id) ? spots0.filter((sp) => rankOf(sp) <= (done(d.id) ? 0 : 1)) : [...spots0].sort(cmp)) : usePath ? [...spots0].sort(cmp) : spots0;
      for (const sp of spots) {
        if (tried >= 60) break; // 발자국이 큰 종(거북섬 8×6·해먹 3×2)은 자리가 드물다 — 후보를 넉넉히(킷 빠지가 차면 봇의 다음 빠지까지 훑는다)
        for (const facing of [0, 1] as const) { const r = g.placeFacility(d.id, sp.i, sp.j, facing); if (r.ok) return true; }
        tried++;
      }
    }
    return false;
  }
  /**
   * P60-d — 코스 마감: 경로가 3 이상이고 끝의 휴식을 뺀 앞부분이 스릴 비감소인데 마지막이 휴식이 아닌 수역에, 값싼 휴식 기구 하나를 마지막 기구 곁(입수구에서 더 먼 쪽)에 붙인다.
   * 경로 긴 수역부터 하루 하나. 이미 완성이거나 끝이 휴식이면(경로가 그 뒤로 자란 것) 안 붙인다 — 휴식 도배 방지
   */
  private capCourse(g: Game, spendable: () => number, spots0: { i: number; j: number }[]): boolean {
    const have = new Set(g.facilities.all.map((f) => baseKind(f.defId)));
    const rests = [...FACILITY_DEFS.values()].filter((d) => d.class === 'rig' && d.onRing !== true && d.chain === 'rest' && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id)).sort((a, b) => Number(have.has(a.id)) - Number(have.has(b.id)) || a.cost - b.cost); // 아직 없는 휴식 종부터(종 수), 그다음 값
    if (rests.length === 0) return false;
    const w = g.grid.w;
    for (const p of [...g.pools.all].sort((a, b) => g.pathOf(b.id).length - g.pathOf(a.id).length || a.id - b.id)) {
      const path = g.pathOf(p.id);
      if (path.length < PATH_COMPLETE_MIN || g.pathCompleteOf(p.id)) continue; // P61-b: 옛 3 은 규칙(길이 ≥ 2)보다 엄해서, 값싼 휴식 기구가 사라진 카탈로그에선 마감이 한 번도 안 떴다
      const defs = path.map((u) => g.facilities.defOf(g.facilities.byUid(u)!));
      if (defs.some((d) => d.chain === 'rest')) continue; // 휴식이 이미 있는데 완성이 아니면(뒤로 자랐거나 중간에 끼었다) 더 안 붙인다 — 휴식 도배 방지
      let mono = true; for (let k = 1; k < defs.length; k++) if ((defs[k]!.thrill ?? 0) < (defs[k - 1]!.thrill ?? 0)) { mono = false; break; }
      if (!mono) continue;
      const last = g.facilities.byUid(path[path.length - 1]!)!, lastFp = FacilityStore.footprint(defs[defs.length - 1]!, last.i, last.j, last.facing);
      const maxDist = Math.max(...path.map((u) => g.rigState.pathDist.get(u) ?? 0));
      const adj = new Set<number>(); for (const t of lastFp) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) adj.add((t.j + b) * w + t.i + a);
      const spots = spots0.filter((sp) => adj.has(sp.j * w + sp.i) && this.pathLevelAt(g, sp.i, sp.j) >= maxDist).sort((x, y) => this.pathLevelAt(g, y.i, y.j) - this.pathLevelAt(g, x.i, x.j)); // 마지막 기구 곁 · 모든 기구보다 멀거나 같은 거리(같으면 uid 로 뒤)
      for (const d of rests) {
        if (spendable() < d.cost) continue;
        for (const sp of spots) for (const facing of [0, 1] as const) if (g.placeFacility(d.id, sp.i, sp.j, facing).ok) return true;
      }
    }
    return false;
  }
  /**
   * P60-d — 후보 칸에 기구를 놓으면 경로에서 어느 BFS 거리에 서는가: 입수구 칸에 4이웃으로 닿으면 0, 경로 위 기구에 닿으면 그 거리 +1, 아니면 ∞(켜져도 경로 밖).
   * 경로 순서는 (거리, uid) 라 같은 거리의 기존 기구 뒤에 선다 — `pathFit` 이 이 가정으로 잰다
   */
  private pathLevelAt(g: Game, i: number, j: number): number {
    const w = g.grid.w, entry = new Set(g.rigState.entryTiles.get(g.pools.ownerIdAt(i, j)) ?? []);
    let best = Infinity;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (entry.has((j + b) * w + i + a)) return 0;
      const f = g.facilities.at(i + a, j + b); const d = f ? g.rigState.pathDist.get(f.uid) : undefined;
      if (d !== undefined) best = Math.min(best, d + 1);
    }
    return best;
  }
  /** P60-d — 입수구가 0 인 수역(뭍에 안 닿은 링)이 있으면 라인 조각 하나로 링을 뭍에 잇는다. 링 데크 칸마다 네 방향 × 길이 셋을 `canPlaceLine` 으로 훑어 조각이 뭍에 4이웃으로 닿는 첫 자리 */
  private ensureEntry(g: Game, spendable: () => number): boolean {
    const w = g.grid.w, N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (const p of g.pools.all) {
      if (g.entriesOf(p.id) > 0) continue;
      const ring = new Set<number>();
      for (const k of p.tiles) { const i = k % w, j = Math.floor(k / w); for (const [a, b] of N4) if (g.grid.at(i + a, j + b) === FLOOR.deck) ring.add((j + b) * w + i + a); }
      for (const k of [...ring].sort((x, y) => x - y)) {
        const i = k % w, j = Math.floor(k / w);
        for (const len of g.b.ppajiLineLens) for (const [i0, j0, facing] of [[i + 1, j, 0], [i - len, j, 0], [i, j + 1, 1], [i, j - len, 1]] as const) {
          const c = g.canPlaceLine(len, i0, j0, facing);
          if (!c.ok || (c.cost ?? 0) > spendable()) continue;
          if (!g.lineTiles(len, i0, j0, facing).some((t) => N4.some(([a, b]) => isShore(g.grid, g.facilities, t.i + a, t.j + b)))) continue;
          if (g.placeLine(len, i0, j0, facing).ok) return true;
        }
      }
    }
    return false;
  }
  /**
   * P60-c — 세트 친화 자리: 어느 수역에 켜진 멤버가 있는 세트의 **빠진 종** → 그 멤버 발자국의 4이웃 칸 키. `near2` 는 멤버 둘이 켜진 수역(놓으면 성립),
   * `near1` 은 하나뿐인 수역(둘째 멤버 — 세트를 쌓는 자리). 종을 수역마다 하나씩 흩어 놓으면 셋째가 설 자리가 없다(실측 128일 세트 1) — 그래서 둘째부터 곁에 둔다
   */
  private setCompleters(g: Game): Map<string, { near2: Set<number>; near1: Set<number> }> {
    const out = new Map<string, { near2: Set<number>; near1: Set<number> }>();
    const w = g.grid.w;
    for (const [pid, uids] of g.rigState.byPool) {
      const lit = uids.map((u) => g.facilities.byUid(u)).filter((f): f is NonNullable<typeof f> => !!f);
      const kinds = new Set(lit.flatMap((f) => [f.defId, baseKind(f.defId)])); // 개조판은 원종으로도(`computeRigs` 와 같은 규칙)
      for (const s of RIG_SETS) {
        if ((g.rigState.sets.get(pid) ?? []).includes(s.id)) continue;
        const missing = s.members.filter((m) => !kinds.has(m));
        if (missing.length === 0 || missing.length === 3) continue;
        const keys = new Set<number>();
        for (const f of lit) { if (!s.members.includes(baseKind(f.defId)) && !s.members.includes(f.defId)) continue; for (const t of FacilityStore.footprint(g.facilities.defOf(f), f.i, f.j, f.facing)) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) keys.add((t.j + b) * w + t.i + a); }
        for (const m of missing) {
          const def = FACILITY_DEFS.get(m);
          if (!def || !(def.class === 'rig' || def.onRing === true)) continue; // 링 위 멤버(플로팅 바·슬라이드 도크)도 — 그 자리는 같은 4이웃 중 데크 칸
          const e = out.get(m) ?? { near2: new Set<number>(), near1: new Set<number>() };
          for (const k of keys) (missing.length === 1 ? e.near2 : e.near1).add(k);
          out.set(m, e);
        }
      }
    }
    return out;
  }
  /** P51 `upgradeRig` — ① 가진 부품으로 닿는 미발견 개조를 하나 찾고(도감을 본다 — 아는 조합은 다시 안 섞는다) ② 아는 개조를 놓인 `from` 기구 하나에 적용. 하루 하나씩 */
  private upgradeRig(g: Game, spendable: () => number): void {
    const st = g.rigs;
    if (spendable() >= st.words.cost) {
      const reach = [...st.recipes.values()].filter((r) => !st.known.has(r.id) && st.fillFor(r.id) !== null).sort((a, b) => a.id.localeCompare(b.id));
      const pick = reach[0];
      if (pick) { const ids = st.fillFor(pick.id); if (ids && g.canCraftRig(ids).ok) g.craftRig(ids); }
    }
    if ((g.stats.converts ?? 0) >= Math.floor(g.day / 6)) return; // 사람의 박자: 엿새에 하나(128일 21 · 64일 10) — 매일이면 118건에 종이 4 로 무너졌다(실측)
    for (const f of g.facilities.all) {
      const ups = st.upgradesFor(f.defId);
      if (ups.length === 0) continue;
      if (f.usesTotal === 0) continue; // 손님이 써 본 기구부터
      const pv = g.convertPreview(f.uid, (ups[0] as { to: string }).to);
      if (!pv.ok || (pv.cost ?? 0) > spendable()) continue;
      if (g.convertFacility(f.uid, (ups[0] as { to: string }).to).ok) return;
    }
  }
  /** `buyRigParts` — 장날 부품(진열 랭크 안) 재고가 떨어진 것부터 값싼 순, 하루 둘 (P56-c 재고) */
  private buyRigParts(g: Game, spendable: () => number): void {
    this.restock(g.rigs, (id) => g.buyRigPart(id), () => spendable() - 2000, 2, (p) => ((p as { rank?: number }).rank ?? 0) <= g.rank);
  }
  /**
   * P56-c 재고 정책(요리·공방·개조 공통) — 사람이 장날에서 하는 일: ① 열쇠는 있는데 재고가 0 인 재료를 값싼 것부터 채운다
   * ② 그런 게 없으면 아직 안 산 장날 재료를 값싼 것부터 하나. 하루 `max` 번, 예비비 위에서만. 시작 재료(무한)는 안 산다
   */
  private restock(store: { ingredients: ReadonlyMap<string, { id: string; unlock: string; price?: number }>; owned: ReadonlySet<string>; stockOf(id: string): number | null }, buy: (id: string) => { ok: boolean }, spendable: () => number, max: number, okDef: (d: { id: string }) => boolean = () => true): void {
    const defs = [...store.ingredients.values()].filter((d) => d.unlock !== 'start' && d.price !== undefined && okDef(d));
    const empty = defs.filter((d) => store.owned.has(d.id) && (store.stockOf(d.id) ?? 1) === 0).sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || a.id.localeCompare(b.id));
    const fresh = defs.filter((d) => d.unlock === 'shop' && !store.owned.has(d.id)).sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || a.id.localeCompare(b.id));
    let n = 0;
    for (const d of [...empty, ...fresh]) {
      if (n >= max) break;
      if (spendable() < (d.price ?? 0)) break;
      if (buy(d.id).ok) n++;
    }
  }
  /** P52-b `ensureWatchtower` — 켜진 딥 기구가 있는데 알바 있는 망루의 반경 안이 아니면, 그 기구 가까운 링 데크에 망루 하나 + 알바 */
  private ensureWatchtower(g: Game, spendable: () => number): void {
    if (!g.isUnlocked('watchtower')) return;
    const deep = g.facilities.all.filter((f) => { const d = g.facilities.defOf(f); return d.class === 'rig' && d.depth === 'deep' && g.rigState.lit.has(f.uid); });
    for (const f of deep) {
      const d = g.facilities.defOf(f);
      if (g.accidentContext(d, f.i, f.j, f.facing, f.uid).guarded) continue;
      const tower = g.facilities.all.find((o) => o.defId === 'watchtower' && o.staff !== 1 && g.accidentContext(d, f.i, f.j, f.facing, f.uid).guarded === false && Math.max(Math.abs(o.i - f.i), Math.abs(o.j - f.j)) <= 6);
      if (tower) { g.setStaffed(tower.uid, true); return; }
      const wt = FACILITY_DEFS.get('watchtower')!;
      if (spendable() < wt.cost + 2000) return;
      for (let r = 1; r <= 5; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = f.i + di, j = f.j + dj;
        if (g.grid.at(i, j) !== FLOOR.deck) continue;
        const p = g.placeFacility('watchtower', i, j, 0);
        if (p.ok) { g.setStaffed(p.uid!, true); return; }
      }
      return;
    }
  }
  /** P52-b `briefCourses` — 코스마다 브리핑을 켠다(사고 ×0.7, 값 0) */
  private briefCourses(g: Game): void { for (const c of g.courses.all) if (c.safetyBriefing !== true) g.setCourseBriefing(c.handle, true); }
  /** `chainRigs` — 같은 계열의 켜진 사슬 끝에 같은 계열 기구를 붙인다(정원 × chainScale). 하루 최대 3 */
  private chainRigs(g: Game, spendable: () => number): number {
    let placed = 0;
    const kinds = new Map<string, { i: number; j: number }[]>();
    const CHAIN_FULL = CHAIN_BASE * CHAIN_CAP * CHAIN_CAP; // 8 — 그 위로는 정원이 안 는다(chainScale 상한). 게임 값에서 유도(POOL_TARGET_TILES 선례)
    const usePath = !this.opts.noPath; // P60-d: 수역 경로가 8 이면 더 안 잇는다(정원 배율 상한)
    for (const f of g.facilities.all) {
      const d = g.facilities.defOf(f); if (d.class !== 'rig' || d.onRing === true || !d.chain || !g.rigState.lit.has(f.uid)) continue;
      if ((g.rigState.chainLen.get(f.uid) ?? 1) >= CHAIN_FULL) continue; // 사슬 도배 방지 — 실측 21
      const pid = g.poolOfFacility(f.uid);
      if (usePath && pid !== null && g.pathOf(pid).length >= CHAIN_FULL) continue; // P60-d: chainLen 이 경로 순번이라 앞쪽 기구는 언제나 8 미만 — 수역 경로 길이로 막는다(실측: 징검돌 11 도배)
      const arr = kinds.get(d.chain) ?? []; arr.push({ i: f.i, j: f.j }); kinds.set(d.chain, arr);
    }
    // P60-c — 세트 자리 예약: 쌓다 만 세트의 빠진 종이 설 칸(멤버 곁)은 사슬로 덮지 않는다(사슬이 수역을 다 채워 셋째 멤버가 설 자리가 없었다 — 실측 20칸 수역에 기구 15). `--no-set` 대조군은 예약 0
    const reserved = new Set<number>(); if (!this.opts.noSet) for (const e of this.setCompleters(g).values()) { for (const k of e.near2) reserved.add(k); for (const k of e.near1) reserved.add(k); }
    for (const [chain, ends] of kinds) {
      const defs0 = [...FACILITY_DEFS.values()].filter((d) => d.class === 'rig' && d.onRing !== true && d.chain === chain && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id)).sort((a, b) => a.cost - b.cost);
      for (const e of ends) {
        if (placed >= 3) return placed;
        const defs = defs0;
        for (const d of defs) {
          if (spendable() < d.cost) continue;
          let ok = false;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
            for (const facing of [0, 1] as const) {
              const fp = FacilityStore.footprint(d, e.i + di, e.j + dj, facing);
              if (fp.some((t) => reserved.has(t.j * g.grid.w + t.i))) continue;
              if (g.placeFacility(d.id, e.i + di, e.j + dj, facing).ok) { ok = true; break; }
            }
            if (ok) break;
          }
          if (ok) { placed++; break; }
        }
      }
    }
    return placed;
  }
  /**
   * 빠지 키우기 (P49-b, §3.9 `growPpaji`) — 옛 링 깔기·링 넓히기 대신 **사각형 붓 하나**. 물가(열마다 다르다)를 따라 6×7 바깥 사각형을 훑어 첫 되는 자리에
   * 두르고, 이미 빠지가 있으면 그 오른쪽에 붙여(겹치는 링은 0G) 병합·확장한다. 규칙은 게임의 `makePpaji` 그대로 — 봇은 자리만 고른다.
   */
  private growPpaji(spendable: () => number): boolean {
    const g = this.game, land = g.land;
    if (this.ensureEntry(g, spendable)) return true; // P60-d: 뭍에 안 닿은 링부터 잇는다 — 입수구 0 이면 경로가 없고 기구가 전부 「경로 밖」
    const sizes: [number, number][] = g.permitLeft >= 48 ? [[10, 8], [6, 7], [8, 7], [6, 9]] : [[6, 7], [8, 7], [6, 9]]; // P51: 허가가 넉넉하면 안 8×6(거북섬 8×6 이 들어간다 — 종 수 밴드) 먼저
    /*
     * P61-b — **코스를 끝낼 자리**를 먼저 만든다. 지금 카탈로그에서 휴식 기구는 `turtle_island`(8×6) 하나뿐이라,
     * 8×6 이 겨우 들어가는 수역(안 48칸)에 놓으면 장애물이 설 자리가 없어 경로가 2 를 못 넘고 완성이 영영 0 이 된다.
     * 그래서 휴식 기구가 열렸는데 그걸 **끝에 붙일 수 있는** 수역이 하나도 없으면, 안이 (w+2)×(d+2) 인 링을 먼저 두른다
     * (8×6 → 안 10×8 = 80칸: 휴식 48 + 장애물 사슬 자리). 허가가 모자라면 안 두른다 — 못 놓을 자리를 사지 않는다.
     * `--no-path` 대조군은 옛 크기 순 그대로다(이 줄이 그 축의 음성 대조군이다).
     */
    if (!this.opts.noPath) {
      const rest = [...FACILITY_DEFS.values()].filter((d) => d.class === 'rig' && d.onRing !== true && d.chain === 'rest' && d.deprecated !== true && d.buildable !== false && g.isUnlocked(d.id)).sort((a, b) => a.w * a.d - b.w * b.d)[0];
      // 「지금 어디에도 못 놓는다」를 **canPlace 로 직접** 묻는다 — 칸 수로 어림하면 모양 때문에 안 들어가는 수역을 「있다」고 센다
      const fits = rest !== undefined && this.litWaterSpots(g).slice(0, 80).some((sp) => ([0, 1] as const).some((facing) => g.canPlace(rest.id, sp.i, sp.j, facing).ok));
      if (rest && !fits && g.permitLeft >= (rest.w + 2) * (rest.d + 2)) sizes.unshift([rest.w + 4, rest.d + 4]);
    }
    for (const [w, h] of sizes) {
      for (let c = land.i0; c + w <= land.i0 + land.w; c++) {
        let top = 0; for (let x = c; x < c + w; x++) top = Math.max(top, shoreRow(x));
        const r = { i0: c, j0: top - 1, w, h }; // 윗줄은 물가 뭍(둑 0G) 또는 물
        const can = g.canMakePpaji(r);
        if (!can.ok || (can.enclose ?? 0) <= 0 || (can.cost ?? 0) > spendable()) continue; // 새 수역이 0 이면(이미 있는 링을 다시 두르는 것) 건너뛴다 — 아니면 매일 같은 자리를 0G 로 「만들고」 끝난다
        return g.makePpaji(r).ok;
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
  /** P52-c 밴드 — 가을 ÷ 여름 야외 입수 */
  offSeasonSwim: number;
  /** P52-b 밴드 — 방문당 사고 · 알바 망루가 지키는 딥 기구 몫 */
  accidentsPerVisit: number;
  guardedShare: number;
  /** P52-a 밴드 3 — 팔찌 낀 기구 이용 몫 · 빠지 패키지 매출 몫 · 빠지 직접 매출 몫 */
  vestShare: number;
  ppajiPkgShare: number;
  ppajiRevShare: number;
  /** P51 밴드 4 — 개조 수 · 4년차 개조 수 · 산 부품 수 · 빠지 지출 중 개조 몫 · measure 재탑승 비율 */
  rigUpgrades: number;
  rigUpgradesY4: number;
  rigPartsBought: number;
  /** P56-c — 재고 구입 수(요리 재료 + 공방 부품 + 개조 부품) */
  stockBuys: number;
  ppajiConvertShare: number;
  rigRepeatRatio: number;
  /** P50-b1 밴드 7 — 기구 종 수 · 최장 사슬 · 최고 등급 · 이용 몫 · 빠지 지출 몫 · 데크/기구 지출 구성 */
  rigsDistinct: number;
  /** P60-d — 뜻이 경로 순번: 128일 끝 최장 경로(= 어느 기구의 chainLen 최대) */
  rigChainMax: number;
  /** P60-d — 128일 끝 수역별 최장 경로 길이 · 경로 있는 수역 중 코스 완성 몫 · 수역별 입수구 수 중앙 */
  rigPathLen: number;
  rigPathCompleteShare: number;
  ringEntries: number;
  /** P60-c — 128일 동안 발견한 세트 수(`setsSeen`) / 8 */
  rigSetsFound: number;
  rigGradeMax: number;
  rigUseShare: number;
  ppajiSpendShare: number;
  ppajiDeckShare: number;
  ppajiRigShare: number;
  /** P49-b — 1년차(16일) 말 수역 칸 (허가 밴드: ★2 예산 160 안) */
  poolTilesY1: number;
  /** P49-b — 128일 끝 남은 허가 칸 (요약 줄) */
  permitLeft: number;
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
  /** P45-b — 방문당 「지나가며 산」 횟수(입장+퇴장) */
  passByShare: number;
  /** P18 자고 간 손님 누계 · 숙박 매출 비중 */
  overnight: number;
  lodgingShare: number;
  /** P27 1년차(16일) 팀 손님 중 자리를 잡은 비율 — 걸어온 팀이 첫해부터 자리를 쓰는가 */
  teamSeatY1: number;
  /** P26 경관 인기 합(장식이 시설에 붙은 양) */
  sceneryPop: number;
  /** P25 판에서 발견한 패키지 종류 수 (배치가 패키지를 만드는가) */
  pkgKinds: number;
  /** P24 4년차 자리 등급 중앙(0~5) — 봇이 자리를 물가·먹거리 옆에 놓는가 */
  seatGradeY4: number;
  /** P22 조경 지면 칸 수 (지면 붓이 봇 세계에 산다) */
  decorGround: number;
  /** P19 4년차까지 발견한 기구 레시피 수 (발견 페이싱 — 128일 중반에 다 찾으면 공방이 죽는다) */
  gearsKnownY4: number;
  /** 만료 소원 / 성립 소원 (G48 밴드 — 근접 실패가 학습이 되나) */
  wishExpireRatio: number;
  /** 서로 다른 인증 통과 수 · 통과한 계열 수 (G51 밴드 — 사다리를 실제로 오르나) */
  certsDistinct: number;
  certFamilies: number;
  /** P53-a — 기구 조건(rigCount/rigChain/rigGrade/rigGuarded)을 든 인증 중 통과한 서로 다른 수 (9 중) */
  rigCertsPassed: number;
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
  /** P53-c — 이름 있는 사건(랭크·인증·달력·비트·해금 모달)이 있는 날 사이 최대 간격(일): 1~4년차 · 5~8년차 (§4.5 「여름·가을 ≤4.5분 = 1.3일」 을 하루 눈금으로 4·6) */
  /** P54 — 밤이 열린 날 수 · 밤 매출(야간권+링 매점 저녁+자리 이용료 저녁) ÷ 총수입 */
  nightNights: number;
  nightRevShare: number;
  unlockGapMaxY1_4: number;
  unlockGapMaxY5_8: number;
  /** P53-c 해금 8×3 — 연차별 랭크업·인증 합격·달력 사건 수 */
  unlocksByYear: { year: number; rank: number; cert: number; calendar: number }[];
  /** 5~8년차 지출 / 전체 지출 (G30 — 후반에도 돈을 쓰는가) */
  lateSpendRatio: number;
  /** P60-e B2·B4 — 128일 서서 먹은 몫(standEats ÷ eats) · 푸드코트 총 좌석 · 3년차 말(48일) 영역 구색 최댓값(0~4) */
  standShare: number;
  courtSeats: number;
  courtMenuKindsY3: number;
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

/** P51 — 개조판 → 원래 종(2단이면 두 번 거슬러) */
export const baseKind = (defId: string): string => { let id = defId; for (let k = 0; k < 4; k++) { const up = RIG_UPGRADES.find((r) => r.to === id); if (!up) break; id = up.from; } return id; };
/** P51 — 빠지 지출 = 데크 + 기구 + 개조(부품·발견·개조비) */
const ppajiSpent = (game: Game): number => (game.stats.spentDeck ?? 0) + (game.stats.spentRig ?? 0) + (game.stats.spentConvert ?? 0);
export function runBot(game: Game, days: number, opts: BotOptions = BOT_DEFAULTS): RunMetrics {
  const bot = new Bot(game, opts, game.seed ^ 0x5eed);
  if (opts.noNight) game.nightEnabled = false; // P54 `--no-night` 대조군 — 밤이 안 열리면 `rng.night` 뽑기 0회
  const perYear: RunMetrics['perYear'] = [];
  let gearsKnownY4 = 0; // P19 — 4년차(64일) 시점 공방 발견 수
  let convertsY4 = 0; // P51 — 4년차 시점 개조 수
  let seatGradeY4 = 0; // P24 — 4년차 자리 등급 중앙
  let teamSeatY1 = 1; // P27 — 1년차 팀 자리 비율
  let courtMenuKindsY3 = 0; // P60-e — 3년차 말 구색
  const ticksPerDay = TICKS_PER_DAY;
  let area2Day = -1;
  const wishesDone = (): number => game.sns.unlockedFriends.reduce((n, f) => n + f.done.length, 0);
  // P53-c — 이름 있는 사건이 있던 날 · 연차별 해금 수(랭크·인증·달력)
  const eventDays: number[] = [];
  const unlocksByYear: RunMetrics['unlocksByYear'] = [];
  let lastRank = game.rank, lastCerts = game.certs.passes(), lastCal = game.calendarGiven.size;
  for (let d = 0; d < days && !game.clock.ended; d++) {
    bot.decideDay();
    // 낮 결정 두 번 (12시 · 15시) — 사건 답(P60-a: 소품 보충은 없다)
    game.step(TICKS_PER_HOUR * 4);
    bot.decideMidday();
    game.step(TICKS_PER_HOUR * 3);
    bot.decideMidday();
    game.step(ticksPerDay - TICKS_PER_HOUR * 7);
    game.drainFx();
    if (game.inbox.all.some((e) => e.day === game.day - 1 || e.day === game.day ? (e.priority === 'modal' || e.priority === 'strip' || e.kind === 'story') : false)) eventDays.push(d); // 오늘 이름 있는 사건이 있었나 (drain 전에 본다)
    game.drainEvents();
    if (area2Day < 0 && game.sns.areas.length >= 2) area2Day = game.day;
    if (game.day === 16) teamSeatY1 = game.teamSeq > 0 ? (game.stats.teamsSeated ?? 0) / game.teamSeq : 1;
    if (game.day === 48) courtMenuKindsY3 = game.courtMenuKindsMax(); // P60-e
    if (game.day === 64) { convertsY4 = game.stats.converts ?? 0; gearsKnownY4 = game.workshop.known.size; const gr = game.facilities.all.filter((f) => game.facilities.defOf(f).class === 'lounging').map((f) => game.seatGradeOf(f.uid).grade).sort((x, y) => x - y); seatGradeY4 = gr.length ? (gr[Math.floor(gr.length / 2)] as number) : 0; }
    if (game.day % 16 === 0) { unlocksByYear.push({ year: game.day / 16, rank: game.rank - lastRank, cert: game.certs.passes() - lastCerts, calendar: game.calendarGiven.size - lastCal }); lastRank = game.rank; lastCerts = game.certs.passes(); lastCal = game.calendarGiven.size; }
    if (game.day % 16 === 0) perYear.push({ year: game.day / 16, money: game.money, visitors: game.stats.visitors, poolTiles: game.pools.totalTiles(), wishes: wishesDone(), likes: game.sns.totalLikes, spent: game.stats.spent ?? 0, rank: game.rank });
  }
  const gapMax = (lo: number, hi: number): number => { const ds = [lo - 1, ...eventDays.filter((x) => x >= lo && x < hi), Math.min(hi, days) - 1]; let m = 0; for (let k = 1; k < ds.length; k++) m = Math.max(m, (ds[k] as number) - (ds[k - 1] as number)); return m; };
  return {
    seed: game.seed,
    days,
    nightNights: game.stats.nightNights ?? 0,
    nightRevShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkgPpaji ?? 0)) > 0 ? ((game.stats.nightPkg ?? 0) + (game.stats.nightFood ?? 0) + (game.stats.nightFee ?? 0)) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkgPpaji ?? 0)) : 0,
    unlockGapMaxY1_4: gapMax(0, 64),
    unlockGapMaxY5_8: gapMax(64, 128),
    unlocksByYear,
    money: game.money,
    visitors: game.stats.visitors,
    poolTiles: game.pools.totalTiles(),
    poolTilesY1: perYear[0]?.poolTiles ?? game.pools.totalTiles(),
    rigsDistinct: new Set(game.facilities.all.filter((f) => game.facilities.defOf(f).class === 'rig').map((f) => baseKind(f.defId))).size, // P51: 개조판은 원래 종
    rigChainMax: Math.max(0, ...game.facilities.all.map((f) => game.rigState.chainLen.get(f.uid) ?? 0)),
    rigPathLen: Math.max(0, ...game.pools.all.map((p) => game.pathOf(p.id).length)), // P60-d
    rigPathCompleteShare: (() => { const withPath = game.pools.all.filter((p) => game.pathOf(p.id).length > 0); return withPath.length > 0 ? withPath.filter((p) => game.pathCompleteOf(p.id)).length / withPath.length : 0; })(),
    ringEntries: (() => { const xs = game.pools.all.map((p) => game.entriesOf(p.id)).sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)] ?? 0; })(),
    rigSetsFound: game.setsSeen.size, // P60-c
    rigGradeMax: Math.max(0, ...game.pools.all.map((p) => game.ppajiGradeOf(p.id))),
    rigUseShare: (() => { let rig = 0, all = 0; for (const f of game.facilities.all) { const d = game.facilities.defOf(f); all += f.usesTotal; if (d.class === 'rig' || d.onRing === true) rig += f.usesTotal; } return all > 0 ? rig / all : 0; })(),
    ppajiSpendShare: (game.stats.spent ?? 0) > 0 ? ((game.stats.spentDeck ?? 0) + (game.stats.spentRig ?? 0) + (game.stats.spentConvert ?? 0)) / (game.stats.spent ?? 1) : 0,
    ppajiDeckShare: ppajiSpent(game) > 0 ? (game.stats.spentDeck ?? 0) / ppajiSpent(game) : 0,
    ppajiRigShare: ppajiSpent(game) > 0 ? (game.stats.spentRig ?? 0) / ppajiSpent(game) : 0,
    ppajiConvertShare: ppajiSpent(game) > 0 ? (game.stats.spentConvert ?? 0) / ppajiSpent(game) : 0,
    offSeasonSwim: (game.stats.swimsBySeason?.[1] ?? 0) > 0 ? (game.stats.swimsBySeason?.[2] ?? 0) / (game.stats.swimsBySeason?.[1] ?? 1) : 0,
    accidentsPerVisit: game.stats.visitors > 0 ? (game.stats.accidents ?? 0) / game.stats.visitors : 0,
    guardedShare: (() => { const deep = game.facilities.all.filter((f) => { const d = game.facilities.defOf(f); return d.class === 'rig' && d.depth === 'deep'; }); return deep.length > 0 ? deep.filter((f) => game.accidentContext(game.facilities.defOf(f), f.i, f.j, f.facing, f.uid).guarded).length / deep.length : 1; })(),
    vestShare: (game.stats.rigUses ?? 0) > 0 ? (game.stats.rigUsesBand ?? 0) / (game.stats.rigUses ?? 1) : 0,
    ppajiPkgShare: ((game.stats.pkg ?? 0) + (game.stats.pkgPpaji ?? 0)) > 0 ? (game.stats.pkgPpaji ?? 0) / ((game.stats.pkg ?? 0) + (game.stats.pkgPpaji ?? 0)) : 0,
    ppajiRevShare: (() => { const total = game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0) + (game.stats.lodging ?? 0) + (game.stats.pkgPpaji ?? 0); return total > 0 ? (game.stats.pkgPpaji ?? 0) / total : 0; })(),
    rigUpgrades: game.stats.converts ?? 0,
    rigUpgradesY4: convertsY4,
    rigPartsBought: game.stats.rigPartsBought ?? 0, // 산 것만(인증·소원 보상은 빼고)
    stockBuys: game.stats.stockBuys ?? 0, // P56-c 재고 구입(재료+부품+개조 부품)
    rigRepeatRatio: (game.stats.rigUses ?? 0) > 0 ? (game.stats.rigRepeats ?? 0) / (game.stats.rigUses ?? 1) : 0, // 같은 기구를 그날 다시 탄 몫(사슬을 건너는 것은 재탑승이 아니다)
    permitLeft: game.permitLeft,
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
    rigCertsPassed: Object.entries(game.certs.state.passed).filter(([id, n]) => n > 0 && certHasRigCond(game.certs.defs.get(id))).length,
    certFamilies: new Set(Object.entries(game.certs.state.passed).filter(([, n]) => n > 0).map(([id]) => game.certs.defs.get(id)?.family)).size,
    rank3Year: perYear.find((p) => p.rank >= 3)?.year ?? 99,
    rank5Year: perYear.find((p) => p.rank >= 5)?.year ?? 99,
    foodShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0)) > 0 ? (game.stats.food ?? 0) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0)) : 0,
    overnight: game.stats.overnight ?? 0,
    gearsKnownY4,
    seatGradeY4,
    pkgKinds: game.packagesSeen.size,
    sceneryPop: game.sceneryPopularity(),
    teamSeatY1,
    decorGround: game.decorGroundTiles(),
    lodgingShare: (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0) + (game.stats.lodging ?? 0)) > 0 ? (game.stats.lodging ?? 0) / (game.stats.tickets + game.stats.fees + (game.stats.food ?? 0) + (game.stats.pkg ?? 0) + (game.stats.lodging ?? 0)) : 0,
    teamSeatShare: game.teamSeq > 0 ? (game.stats.teamsSeated ?? 0) / game.teamSeq : 1, // P27: 팀 단위 — 자리를 하나라도 잡은 팀 ÷ 전체 팀(버스+걸어온 무리)
    passByShare: ((game.stats.passByEnter ?? 0) + (game.stats.passByLeave ?? 0)) / Math.max(1, game.stats.visitors),
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
    standShare: (game.stats.eats ?? 0) > 0 ? (game.stats.standEats ?? 0) / (game.stats.eats ?? 1) : 0, // P60-e
    courtSeats: game.courtSeatsTotal(),
    courtMenuKindsY3,
    courses: game.courses.count,
    gearsDistinct: game.courses.ownedEquipment.size,
    staffed: game.staffedCount(),
    cleanliness: game.cleanliness,
    snapshotHash: hashSnapshot(game.toSnapshot()),
  };
}

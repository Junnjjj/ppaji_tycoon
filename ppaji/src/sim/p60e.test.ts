import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { FOODCOURT_SEAT_DEF } from './foodcourt.js';
import { SEAT_REACH, SEAT_REACH_STEPS, STAND_EAT_TICKS, EAT_TICKS } from './guest.js';
import { runBot, BOT_DEFAULTS } from './bot.js';
import { evaluate } from './condition.js';
import { TICKS_PER_DAY } from './clock.js';
import type { FoodCategory } from '../data/schema.js';

/**
 * P60-e 좌석 vs 서서 + 구색 (D73 B2·B4·B5, docs/plan-ppaji-rig-foodcourt.md §10.5 · §4.1).
 * B2 — 산 곳(매점)에서 걷기 SEAT_REACH×3 안의 빈 좌석(파생 식탁 포함)만 잡고, 없으면 서서 먹는다(`standEats` · 8tick · 만족 +0). `eats` 는 사서 들고 자리를 정한 손님(사서 곧장 나간 손님은 밖).
 * B4 — 영역 반경 3 점포의 메뉴 카테고리 수 k → 자리 등급 +⌊k/2⌋ · 4/4 는 「풀코스 푸드코트」 발견 1회. B5 — 밤 집합에 식탁.
 */
const ARRIVAL = { arrival: true } as const;
const fresh = (seed = 1): Game => new Game(seed, undefined, ARRIVAL);
const seatsOf = (g: Game) => g.facilities.all.filter((f) => f.defId === FOODCOURT_SEAT_DEF);
/** 킷의 라운지를 전부 걷는다(영역째) — 「좌석 0」 판 */
function clearSeats(g: Game): void {
  for (const c of [...g.foodcourts.all]) expect(g.removeFoodCourt(c.id).ok).toBe(true);
  for (const f of [...g.facilities.all]) if (g.facilities.defOf(f).class === 'lounging') g.facilities.remove(f.uid);
  expect(g.facilities.all.some((f) => g.facilities.defOf(f).class === 'lounging')).toBe(false);
}
/** 킷 영역 반경 3 안에 점포 하나 (하네스 행 3 과 같은 탐색) */
function placeShopNearCourt(g: Game): { uid: number; i: number; j: number } {
  const c = g.foodcourts.all[0]!;
  for (const id of ['indoor_shop', 'vending_out']) for (let j = c.j0 - 3; j <= c.j0 + c.h + 2; j++) for (let i = c.i0 - 3; i <= c.i0 + c.w + 2; i++) {
    if (g.foodcourts.ownerAt(i, j) !== null) continue;
    const r = g.placeFacility(id, i, j, 0);
    if (r.ok) return { uid: r.uid!, i, j };
  }
  throw new Error('점포 자리 없음');
}
/** 카테고리마다 레시피 하나 (시작 레시피 우선) */
function recipeByCat(g: Game): Record<FoodCategory, string> {
  const out = {} as Record<FoodCategory, string>;
  for (const r of [...g.menus.recipes.values()].sort((a, b) => a.id.localeCompare(b.id))) if (!out[r.cat] || (r.unlock === 'start' && g.menus.recipes.get(out[r.cat])!.unlock !== 'start')) out[r.cat] = r.id;
  return out;
}
/** 손님 하나를 매점으로 보내 사고 나올 때까지 돌린다 — 서서 먹기(`eat`)에 들어갔는지 · 그 손님이 목표로 잡은 좌석 */
function sendToShop(g: Game, shopUid: number, maxSteps = 60, teamId: number | null = null): { seenEat: boolean; seatTargets: number[]; eatTicks: number; carryAtSeat: boolean[] } {
  const gu = g.guests.spawn(); gu.teamId = teamId; gu.target = { kind: 'facility', uid: shopUid }; gu.state = 'walk'; gu.stateTicks = 0;
  const uid = gu.uid; let seenEat = false; let eatTicks = 0; const seatTargets: number[] = []; const carryAtSeat: boolean[] = [];
  for (let k = 0; k < maxSteps * 10; k++) {
    g.step(1);
    const x = g.guests.all.find((q) => q.uid === uid); if (!x) break;
    if (x.state === 'eat') { seenEat = true; eatTicks++; }
    if (x.target?.kind === 'facility' && x.target.uid !== shopUid && g.facilities.defOf(g.facilities.byUid(x.target.uid)!).class === 'lounging' && !seatTargets.includes(x.target.uid)) { seatTargets.push(x.target.uid); carryAtSeat.push(x.carry); }
    if (seenEat && x.state !== 'eat') break;
    if (x.carry === false && x.uses > 0 && x.state === 'wander') break;
  }
  return { seenEat, seatTargets, eatTicks, carryAtSeat };
}

describe('P60-e B2 좌석 vs 서서', () => {
  it('상수 — 반경은 Game.SEAT_RADIUS 와 같고 걷기 상한은 ×3 · 서서 8tick < 앉을 때 12', () => {
    expect(SEAT_REACH).toBe(Game.SEAT_RADIUS);
    expect(SEAT_REACH_STEPS).toBe(9);
    expect(STAND_EAT_TICKS).toBe(8); expect(EAT_TICKS).toBe(12);
  });
  it('좌석 0(영역·라운지 전부 걷음)이면 하루 식사가 전부 서서 — standEats === eats > 0 · courtEats 0 · DayReport 에 같은 수', () => {
    const g = fresh(); clearSeats(g);
    g.step(TICKS_PER_DAY);
    expect(g.stats.eats ?? 0).toBeGreaterThan(0);
    expect(g.stats.standEats).toBe(g.stats.eats);
    expect(g.stats.courtEats ?? 0).toBe(0);
    expect(g.stats.days[0]).toMatchObject({ eats: g.stats.eats, standEats: g.stats.standEats });
  }, 60000);
  it('킷 4석 — 첫날 서서 ≥ 1 이면서 앉아 먹은 손님도 있다(킷 실내 매점 → 식탁 걷기 4~8 ≤ 9) · 서서 몫 < 1', () => {
    const g = fresh();
    g.step(TICKS_PER_DAY);
    expect(g.stats.standEats ?? 0).toBeGreaterThanOrEqual(1);
    expect(g.stats.standEats ?? 0).toBeLessThan(g.stats.eats ?? 0);
    expect(g.stats.courtEats ?? 0).toBeGreaterThan(0);
  }, 60000);
  it('반경 밖 좌석은 안 잡는다 — 먼 평상 하나만 있는 판에서 매점 손님이 서서 먹고(standEats +1 · 8tick) 그 평상을 목표로 잡지 않는다 · 옛 규칙(상한 없음)이면 잡았을 거리', () => {
    const g = fresh(); g.money = 1e6; g.unlocked.facilities.add('pyeongsang_row'); clearSeats(g);
    const shop = g.facilities.all.find((f) => f.defId === 'indoor_shop')!;
    // 매점에서 먼 마당 잔디 — 체비쇼프 ≥ 20 인 첫 자리
    let far: { uid: number } | null = null;
    for (let j = g.gate.j + 20; j < g.grid.h && !far; j++) for (let i = 2; i < g.grid.w - 4 && !far; i++) { if (Math.max(Math.abs(i - shop.i), Math.abs(j - shop.j)) < 20) continue; const r = g.placeFacility('pyeongsang_row', i, j, 0); if (r.ok) far = { uid: r.uid! }; }
    expect(far).not.toBeNull();
    const seat = g.facilities.byUid(far!.uid)!;
    const probe = g.guests.spawn(); probe.i = shop.i; probe.j = shop.j + 2; // 매점 앞 칸
    expect(g.guests.seatDistForTest(probe, seat)).toBeGreaterThan(SEAT_REACH_STEPS);
    expect(g.guests.seatWithinForTest(probe)).toBeNull();
    g.guests.flush(undefined, (x) => x.uid !== probe.uid); // 탐침 손님만 걷는다(새 판 tick 0 — 다른 손님 없음)
    const s0 = g.stats.standEats ?? 0, e0 = g.stats.eats ?? 0;
    const r = sendToShop(g, shop.uid);
    expect(r.seenEat).toBe(true);
    expect(r.eatTicks).toBe(STAND_EAT_TICKS);
    expect(r.seatTargets).toEqual([]);
    expect((g.stats.standEats ?? 0) - s0).toBe(1); expect((g.stats.eats ?? 0) - e0).toBe(1);
    // P27 짝: 자리 없는 팀 손님도 먹는 자리는 반경 안(서서) — 다 먹은 뒤 **빈손으로** 먼 평상을 잡으러 간다(팀 착석 축은 산다)
    const t = sendToShop(g, shop.uid, 60, 777);
    expect(t.seenEat).toBe(true);
    expect(t.seatTargets).toEqual([seat.uid]); expect(t.carryAtSeat).toEqual([false]);
    expect((g.stats.standEats ?? 0) - s0).toBe(2);
  }, 60000);
  it('걷기 9 안의 식탁은 잡는다 — 킷 식탁이 있는 판에서 같은 손님은 서지 않고 식탁을 목표로 잡는다', () => {
    const g = fresh();
    const shop = g.facilities.all.find((f) => f.defId === 'indoor_shop')!;
    const probe = g.guests.spawn(); probe.i = shop.i; probe.j = shop.j + 2;
    const within = g.guests.seatWithinForTest(probe);
    expect(within?.defId).toBe(FOODCOURT_SEAT_DEF);
    g.guests.flush(undefined, (x) => x.uid !== probe.uid); // 탐침 손님만 걷는다(새 판 tick 0 — 다른 손님 없음)
    const r = sendToShop(g, shop.uid);
    expect(r.seenEat).toBe(false);
    expect(r.seatTargets.map((u) => g.facilities.byUid(u)?.defId)).toEqual([FOODCOURT_SEAT_DEF]);
  }, 60000);
});

describe('P60-e B4 구색', () => {
  it('킷은 0/4(실내 매점은 영역 반경 밖) · 점포 하나에 카테고리 1 이면 등급 +0(foodKinds 1 · food true) · 4 면 +2 · courtMenuKindsOf/Max · courtSeatsTotal 4 · 인증 조건 courtSeats/courtMenuKinds', () => {
    const g = fresh(); g.money = 1e6;
    const court = g.foodcourts.all[0]!; const seat = seatsOf(g)[0]!; const sd = g.facilities.defOf(seat);
    const grade = () => ({ of: g.seatGradeOf(seat.uid).grade, at: g.seatGradeAt(sd, seat.i, seat.j, seat.facing, seat.uid) });
    expect(g.courtMenuKindsOf(court.id)).toBe(0);
    const g0 = grade(); expect(g0.at.foodKinds).toBe(0); expect(g0.at.food).toBe(false);
    const shop = placeShopNearCourt(g);
    for (let k = 0; k < 5; k++) g.setMenu(shop.uid, k, null);
    const by = recipeByCat(g); expect(Object.keys(by).sort()).toEqual(['dessert', 'drink', 'meal', 'snack']);
    for (const id of Object.values(by)) g.cooking.known.add(id);
    expect(g.setMenu(shop.uid, 0, by.snack).ok).toBe(true);
    const g1 = grade(); expect(g1.at.foodKinds).toBe(1); expect(g1.at.food).toBe(true); expect(g1.of - g0.of).toBe(0); expect(g1.at.grade - g0.at.grade).toBe(0);
    expect(g.courtMenuKindsOf(court.id)).toBe(1);
    expect(g.inbox.all.filter((e) => /풀코스/.test(e.title)).length).toBe(0);
    expect(g.setMenu(shop.uid, 1, by.drink).ok).toBe(true);
    expect(grade().of - g0.of).toBe(1);
    expect(g.setMenu(shop.uid, 2, by.meal).ok).toBe(true); expect(g.setMenu(shop.uid, 3, by.dessert).ok).toBe(true);
    const g4 = grade(); expect(g4.at.foodKinds).toBe(4); expect(g4.of - g0.of).toBe(2); expect(g4.at.grade - g0.at.grade).toBe(2);
    expect(g.courtMenuKindsOf(court.id)).toBe(4); expect(g.courtMenuKindsMax()).toBe(4); expect(g.courtSeatsTotal()).toBe(4);
    expect(evaluate({ kind: 'courtSeats', min: 4 }, g.conditionWorld())).toMatchObject({ met: true, actual: 4 });
    expect(evaluate({ kind: 'courtMenuKinds', min: 4 }, g.conditionWorld())).toMatchObject({ met: true, actual: 4 });
    expect(evaluate({ kind: 'courtSeats', min: 8 }, g.conditionWorld()).progress).toBeCloseTo(0.5);
    expect(g.expectedCert('court_f')).not.toBeNull();
  });
  it('「풀코스 푸드코트」 발견 — 4/4 가 처음 생길 때 축하 모달 1회, 다시 걸어도 1회 · 스냅샷 fullCourtSeen 은 참일 때만 실린다 · 매출 배수는 없다(recipePrice 경로 무변경)', () => {
    const g = fresh(); g.money = 1e6;
    expect('fullCourtSeen' in g.toSnapshot()).toBe(false);
    const shop = placeShopNearCourt(g); for (let k = 0; k < 5; k++) g.setMenu(shop.uid, k, null);
    const by = recipeByCat(g); for (const id of Object.values(by)) g.cooking.known.add(id);
    Object.values(by).forEach((id, k) => expect(g.setMenu(shop.uid, k, id).ok).toBe(true));
    const found = g.inbox.all.filter((e) => /풀코스/.test(e.title));
    expect(found.length).toBe(1); expect(found[0]!.priority).toBe('modal');
    expect(g.setMenu(shop.uid, 4, by.snack).ok).toBe(true);
    g.step(10);
    expect(g.inbox.all.filter((e) => /풀코스/.test(e.title)).length).toBe(1);
    const s = JSON.parse(JSON.stringify(g.toSnapshot())); expect(s.fullCourtSeen).toBe(true);
    const h = Game.fromSnapshot(s); expect(h.fullCourtSeen).toBe(true); expect(h.courtMenuKindsMax()).toBe(4);
  });
});

describe('P60-e B5 밤 식탁 · D4 파생 좌석 술어', () => {
  it('밤 집합에 킷 식탁 둘이 든다(실내 놀이 0 인 새 판에서 집합 = 식탁뿐) · 영역을 걷으면 빠진다', () => {
    const g = fresh();
    const ids = seatsOf(g).map((f) => f.uid).sort();
    expect([...g.nightForTest()].sort()).toEqual(ids);
    for (const c of [...g.foodcourts.all]) g.removeFoodCourt(c.id);
    expect(g.nightForTest()).toEqual([]);
  });
  it('파생 식탁은 팀 자리가 아니다 — 팀 손님이 식탁을 써도 seatUid·teamSeated 가 안 움직인다(claimSeat 제외) · 봇 조경(ensureGarden) 대상 아님 · seatsFedAt 은 먹여 주는 자리로 센다(현행)', () => {
    const g = fresh();
    const seat = seatsOf(g)[0]!;
    const gu = g.guests.spawn(); gu.teamId = 4242; gu.target = { kind: 'facility', uid: seat.uid }; gu.state = 'walk'; gu.stateTicks = 0;
    const t0 = g.stats.teamSeated ?? 0;
    for (let k = 0; k < 400 && (g.guests.all.find((q) => q.uid === gu.uid)?.uses ?? 1) === 0; k++) g.step(1);
    expect(gu.uses).toBeGreaterThan(0); expect(gu.seatUid).toBeNull(); expect(g.stats.teamSeated ?? 0).toBe(t0);
    expect(g.seatsFedAt(FACILITY_DEFS.get('vending_out')!, seat.i - 2, seat.j, 0)).toBe(2);
    // 봇의 꽃밭 대상 필터(bot.ts ensureGarden)와 같은 술어 — 파생은 제외
    expect(g.facilities.all.filter((f) => g.facilities.defOf(f).class === 'lounging' && g.facilities.defOf(f).derived !== true).length).toBe(0);
  });
});

describe('P60-e 봇·밴드', () => {
  it('noCourt 대조군 — 8일 해시가 기본 봇과 다르고 좌석은 킷 4 그대로 · 기본 봇은 서서 > 0.3 에 블록을 더해 좌석 > 4 · RunMetrics 에 standShare/courtSeats/courtMenuKindsY3', () => {
    const a = runBot(fresh(), 8), b = runBot(fresh(), 8, { ...BOT_DEFAULTS, noCourt: true });
    expect(a.snapshotHash).not.toBe(b.snapshotHash);
    expect(b.courtSeats).toBe(4); expect(a.courtSeats).toBeGreaterThan(4);
    expect(a.standShare).toBeGreaterThan(0); expect(a.standShare).toBeLessThan(1);
    expect(typeof a.courtMenuKindsY3).toBe('number');
  }, 60000);
});

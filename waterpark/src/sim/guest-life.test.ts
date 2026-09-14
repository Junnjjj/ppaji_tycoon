import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { FacilityStore } from './facility.js';
import { buildOf, FLOAT_KINDS, type Guest } from './guest.js';

/** G26 손님 생활 — 슬라이드 탑승 경로 · 튜브 · 사서 앉기(R3) · 체형 */
function fresh(seed = 5): Game {
  const g = new Game(seed, undefined, { kit: false });
  g.money = 1_000_000;
  for (const id of ['stripy_slide', 'cafe', 'deck_chair']) g.unlocked.facilities.add(id);
  return g;
}

function runUntil(g: Game, pred: () => boolean, max = 4000): boolean {
  for (let n = 0; n < max; n++) { g.step(); if (pred()) return true; }
  return false;
}

describe('G26 슬라이드 탑승', () => {
  it('climb → ride 가 활강로 칸을 전부 지나 출구 다음 풀에 착수한다', () => {
    const g = fresh();
    const gt = g.gate;
    // 슬라이드 (facing 0, 활강로 +I) 와 그 출구 앞 풀
    const si = gt.i - 6, sj = gt.j - 8;
    const def = FACILITY_DEFS.get('stripy_slide')!;
    expect(g.placeFacility('stripy_slide', si, sj, 0).ok).toBe(true);
    const fac = g.facilities.all[0]!;
    const lane = FacilityStore.lane(def, si, sj, 0);
    const exit = lane[lane.length - 1]!;
    const pool = [] as { i: number; j: number }[];
    for (let b = -1; b <= 1; b++) for (let a = 1; a <= 2; a++) pool.push({ i: exit.i + a, j: exit.j + b });
    expect(g.digPool(pool).ok).toBe(true);
    // 손님을 슬라이드로 강제 유도하고 활강 칸을 기록한다
    const visited = new Set<string>();
    let rider: Guest | null = null;
    let landedInPool = false;
    const ok = runUntil(g, () => {
      for (const gu of g.guests.all) {
        if (gu.state === 'wander' && !rider) { gu.target = { kind: 'facility', uid: fac.uid }; gu.state = 'walk'; gu.stateTicks = 0; rider = gu; }
        if (gu === rider && gu.state === 'ride') visited.add(`${gu.i},${gu.j}`);
        if (gu === rider && gu.state === 'swim' && gu.target?.kind === 'pool') landedInPool = true;
      }
      return landedInPool;
    }, 3000);
    expect(ok).toBe(true);
    for (const t of lane) expect(visited.has(`${t.i},${t.j}`)).toBe(true);
    expect(FacilityStore.slideTop(def, si, sj, 0)).toEqual({ i: si + def.w - 1, j: sj + Math.floor(def.d / 2) });
  });
});

describe('G26 튜브·체형·사서 앉기', () => {
  it('튜브는 0~6 · 체형은 나이에서 파생 · 스냅샷 왕복 보존', () => {
    const g = fresh(9);
    g.digPool([{ i: g.gate.i - 2, j: g.gate.j - 4 }, { i: g.gate.i - 1, j: g.gate.j - 4 }, { i: g.gate.i - 2, j: g.gate.j - 5 }, { i: g.gate.i - 1, j: g.gate.j - 5 }]);
    // 작은 풀 판은 동시 손님이 5명 안팎 — 시간에 걸쳐 본 손님 전원의 튜브를 모은다
    const seen = new Map<number, number>();
    runUntil(g, () => { for (const x of g.guests.all) seen.set(x.uid, x.float); return seen.size >= 20; }, 4000);
    const floats = [...seen.values()];
    expect(floats.every((f) => f >= 0 && f <= FLOAT_KINDS)).toBe(true);
    expect(floats.some((f) => f > 0)).toBe(true);
    expect(buildOf({ age: 8 })).toBe('kid');
    expect(buildOf({ age: 30 })).toBe('adult');
    expect(buildOf({ age: 60 })).toBe('old');
    const snap = JSON.parse(JSON.stringify(g.toSnapshot()));
    const h = Game.fromSnapshot(snap);
    expect(h.guests.all.map((x) => [x.float, x.rideIdx, x.carry])).toEqual(g.guests.all.map((x) => [x.float, x.rideIdx, x.carry]));
  });

  it('식당에서 사면 라운지로 가서 앉고, 라운지가 없으면 서서 먹는다 (R3)', () => {
    // 라운지 없음 → eat
    const a = fresh(3);
    const gt = a.gate;
    expect(a.placeFacility('cafe', gt.i + 2, gt.j - 4, 0).ok).toBe(true);
    const cafe = a.facilities.all[0]!;
    const recipe = [...a.cooking.known][0]!;
    expect(a.menus.setSlot(cafe.uid, 0, recipe)).toBe(true);
    let ate = false;
    runUntil(a, () => {
      for (const gu of a.guests.all) {
        if (gu.state === 'wander') { gu.target = { kind: 'facility', uid: cafe.uid }; gu.state = 'walk'; gu.stateTicks = 0; }
        if (gu.state === 'eat') ate = true;
      }
      return ate;
    }, 2500);
    expect(ate).toBe(true);
    // 라운지 있음 → 들고 가서 앉는다
    const b = fresh(3);
    expect(b.placeFacility('cafe', gt.i + 2, gt.j - 4, 0).ok).toBe(true);
    expect(b.placeFacility('deck_chair', gt.i - 3, gt.j - 4, 0).ok).toBe(true);
    const cafe2 = b.facilities.all[0]!;
    const chair = b.facilities.all[1]!;
    expect(b.menus.setSlot(cafe2.uid, 0, recipe)).toBe(true);
    let sat = false;
    let stoodEating = false;
    runUntil(b, () => {
      for (const gu of b.guests.all) {
        if (gu.state === 'wander' && !gu.carry) { gu.target = { kind: 'facility', uid: cafe2.uid }; gu.state = 'walk'; gu.stateTicks = 0; }
        if (gu.state === 'eat') stoodEating = true;
        if (gu.carry && gu.state === 'use' && gu.target?.kind === 'facility' && gu.target.uid === chair.uid) sat = true;
      }
      return sat;
    }, 2500);
    expect(sat).toBe(true);
    expect(stoodEating).toBe(false);
  });
});

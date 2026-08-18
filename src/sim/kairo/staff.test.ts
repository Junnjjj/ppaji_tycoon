import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';
import { assessRisk } from './risk.js';
import {
  STAFF_ROLES,
  STAFF_TUNING,
  StaffStore,
  validateStaff,
  neededFor,
  coverageOf,
  demandFor,
} from './staff.js';

/**
 * 직원 5직종 — 스펙 §11. 여섯 동사 중 "사람을 쓴다".
 *
 * 지키려는 성질: **인건비는 고정비이고, 부족은 절벽이 아니라 비율로 나타난다.**
 */

const GATE = { i: 2, j: 2 };

function park(n = 8): {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  g: GuestStore;
} {
  const t = new KairoTerrain(40, 32);
  for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
  const w = new WallGrid(40, 32);
  const p = new PlacementGrid(40, 32);
  for (let k = 0; k < n; k++) p.place(t, w, GATE, 'shop', 6 + (k % 8) * 3, 8 + Math.floor(k / 8) * 3);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  g.invalidate();
  return { t, w, p, g };
}

describe('직원 데이터', () => {
  it('5직종이다', () => {
    expect(STAFF_ROLES.length).toBe(5);
    expect(validateStaff()).toEqual([]);
  });

  it('직종마다 효과가 다르다 — 겹치면 하나는 이름표일 뿐이다', () => {
    expect(new Set(STAFF_ROLES.map((r) => r.effect)).size).toBe(5);
  });

  it('주급이 주간 손익을 통째로 먹지 않는다 — 문서 값(40만)을 우리 경제로 축소했다', () => {
    // 주간 손익 중앙 30~55만. 한 명이 그 10% 를 넘으면 "고용한다"가 선택이 아니게 된다
    for (const r of STAFF_ROLES) expect(r.wage).toBeLessThan(50_000);
  });
});

describe('충족도', () => {
  it('대상이 없으면 1 — 없는 걸 못 덮었다고 벌하지 않는다', () => {
    const { p } = park(0);
    for (const r of STAFF_ROLES) expect(coverageOf(r, 0, p)).toBe(1);
  });

  it('필요 인원이 담당 수로 정해진다', () => {
    const { p } = park(12);
    const cleaner = STAFF_ROLES.find((r) => r.id === 'cleaner')!;
    expect(demandFor(cleaner, p)).toBe(12);
    expect(neededFor(cleaner, p)).toBe(Math.ceil(12 / cleaner.per));
    expect(coverageOf(cleaner, neededFor(cleaner, p), p)).toBe(1);
  });

  it('절반만 고용하면 충족도도 절반쯤이다 — 절벽이 아니다', () => {
    const { p } = park(24);
    const cleaner = STAFF_ROLES.find((r) => r.id === 'cleaner')!;
    const need = neededFor(cleaner, p);
    const half = coverageOf(cleaner, Math.floor(need / 2), p);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
  });
});

describe('효과', () => {
  it('인건비가 인원에 비례한다', () => {
    const st = new StaffStore();
    expect(st.weeklyWage()).toBe(0);
    st.hire('cleaner', 3);
    const cleaner = STAFF_ROLES.find((r) => r.id === 'cleaner')!;
    expect(st.weeklyWage()).toBe(cleaner.wage * 3);
    expect(st.total).toBe(3);
  });

  it('청소부가 없으면 만족도가 내려가고, 채우면 0 이 된다', () => {
    const { p } = park(24);
    const none = new StaffStore().effects(p);
    expect(none.satisfactionDelta).toBe(-STAFF_TUNING.cleanPenaltyMax);
    const full = new StaffStore();
    const cleaner = STAFF_ROLES.find((r) => r.id === 'cleaner')!;
    full.set('cleaner', neededFor(cleaner, p));
    expect(full.effects(p).satisfactionDelta).toBe(0);
  });

  it('매점직원이 없으면 식음 배율이 떨어진다 — 0 이 되지는 않는다', () => {
    const { p } = park(24);
    const e = new StaffStore().effects(p);
    expect(e.foodMult).toBeLessThan(1);
    expect(e.foodMult).toBeGreaterThan(0);
  });

  it('안전요원이 위험도를 실제로 내린다 — 시설과 같은 축이어야 한다', () => {
    const { p, g } = park(10);
    const before = assessRisk(p, g);
    const st = new StaffStore();
    st.set('lifeguard', 4);
    const after = assessRisk(p, g, { staffSafety: st.effects(p).safetyPoints });
    expect(after.safetyPoints).toBeGreaterThan(before.safetyPoints);
    expect(after.ratio).toBeLessThanOrEqual(before.ratio);
  });
});

describe('선 시설', () => {
  it('정비공이 충분하면 고장이 없다 — 순수 확률이면 "정비공을 왜 쓰나"가 된다', () => {
    const { p } = park(20);
    const st = new StaffStore();
    for (const r of STAFF_ROLES) st.set(r.id, neededFor(r, p));
    for (let seed = 0; seed < 20; seed++) {
      expect(st.idleHandles(p, new Rng(seed)).size).toBe(0);
    }
  });

  it('정비공이 없으면 일부가 선다 — 전부는 아니다', () => {
    const { p } = park(20);
    const st = new StaffStore();
    const operator = STAFF_ROLES.find((r) => r.id === 'operator')!;
    st.set('operator', neededFor(operator, p)); // 운영요원은 채워 원인을 분리한다
    let total = 0;
    for (let seed = 0; seed < 20; seed++) total += st.idleHandles(p, new Rng(seed)).size;
    const avg = total / 20;
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThan(20);
  });

  it('같은 시드는 같은 고장 — 결정론', () => {
    const { p } = park(20);
    const st = new StaffStore();
    const a = [...st.idleHandles(p, new Rng(9))].sort();
    const b = [...st.idleHandles(p, new Rng(9))].sort();
    expect(a).toEqual(b);
  });
});

describe('주 진행에 실제로 영향을 준다', () => {
  const run = (staffFull: boolean): ReturnType<WeekRunner['run']> => {
    const { t, p, g } = park(12);
    const st = new StaffStore();
    if (staffFull) for (const r of STAFF_ROLES) st.set(r.id, neededFor(r, p));
    const eff = st.effects(p);
    return new WeekRunner(t, p, g).run(new Rng(606), {
      season: 'summer',
      staff: {
        wages: eff.wages,
        satisfactionDelta: eff.satisfactionDelta,
        foodMult: eff.foodMult,
        idle: st.idleHandles(p, new Rng(1)),
      },
    });
  };

  it('인건비가 손익에서 빠진다 — 고정비다', () => {
    const full = run(true);
    expect(full.wages).toBeGreaterThan(0);
    expect(full.profit).toBe(full.revenue - full.upkeep - full.wages);
    expect(run(false).wages).toBe(0);
  });

  it('직원을 다 쓰면 만족도가 높다', () => {
    expect(run(true).exitSatisfaction).toBeGreaterThan(run(false).exitSatisfaction);
  });

  it('선 시설은 공급에서 빠진다 — 있는데 왜 부족하냐가 되면 안 된다', () => {
    const { t, p, g } = park(12);
    const runner = new WeekRunner(t, p, g);
    const all = runner.supply();
    const someIdle = new Set([p.all()[0]!.handle, p.all()[1]!.handle]);
    const less = runner.supply(someIdle);
    const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);
    expect(sum(less)).toBeLessThan(sum(all));
  });

  it('손님이 선 시설로 가지 않는다', () => {
    const { t, w, p } = park(6);
    const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
    g.invalidate();
    const idle = new Set(p.all().map((x) => x.handle));
    g.setIdle(idle);
    expect(g.idleCount).toBe(6);
    const rng = new Rng(77);
    for (let k = 0; k < 20; k++) g.spawn(rng, 'summer');
    for (let tick = 0; tick < 200; tick++) g.tick(rng);
    // 전부 서 있으면 아무도 이용을 못 한다 → 완료가 0
    expect(g.takeFinished().count).toBe(0);
  });
});

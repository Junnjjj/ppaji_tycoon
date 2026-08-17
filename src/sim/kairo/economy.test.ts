import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, MAX_LEVEL, LEVEL_FEE_STEP, facilityDef } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { WeekRunner, priceSatisfaction } from './week.js';

/**
 * 값을 매긴다 · 시설을 개선한다 — 여섯 동사 중 마지막으로 비어 있던 것과,
 * 후반(확장이 등급 상한에 막힌 구간)의 성장 수단.
 *
 * 지키려는 성질: **후반에 돈 쓸 곳과 만족도를 올릴 지렛대가 있다.**
 * 없으면 80주 중 58주가 "지을 게 없다"가 된다 (실측).
 */

const GATE = { i: 2, j: 2 };

function park(n = 10): { t: KairoTerrain; w: WallGrid; p: PlacementGrid; g: GuestStore } {
  const t = new KairoTerrain(40, 32);
  for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'lawn');
  const w = new WallGrid(40, 32);
  const p = new PlacementGrid(40, 32);
  for (let k = 0; k < n; k++) {
    p.place(t, w, GATE, 'shop', 6 + (k % 8) * 3, 8 + Math.floor(k / 8) * 3);
  }
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  g.invalidate();
  return { t, w, p, g };
}

const runWeek = (
  fixture: ReturnType<typeof park>,
  opts: { priceMult?: number } = {},
): ReturnType<WeekRunner['run']> =>
  new WeekRunner(fixture.t, fixture.p, fixture.g).run(new Rng(4321), {
    season: 'summer',
    ...opts,
  });

describe('값을 매긴다 (§15.9)', () => {
  it('정가에서는 만족도가 안 움직인다', () => {
    expect(priceSatisfaction(1)).toBe(0);
  });

  it('비싸면 만족도가 깎이고 싸면 오른다', () => {
    expect(priceSatisfaction(1.3)).toBeLessThan(0);
    expect(priceSatisfaction(0.8)).toBeGreaterThan(0);
  });

  it('⚠ 비대칭이다 — 대칭이면 "항상 최대로 올린다"가 정답이 되기 쉽다', () => {
    expect(Math.abs(priceSatisfaction(1.3))).toBeGreaterThan(Math.abs(priceSatisfaction(0.7)));
  });

  it('요금을 올리면 매출이 오르고 만족도가 내려간다 — 그게 이 동사의 전부다', () => {
    const base = runWeek(park());
    const pricey = runWeek(park(), { priceMult: 1.35 });
    expect(pricey.revenue).toBeGreaterThan(base.revenue);
    expect(pricey.exitSatisfaction).toBeLessThan(base.exitSatisfaction);
  });

  it('요금을 내리면 반대다', () => {
    const base = runWeek(park());
    const cheap = runWeek(park(), { priceMult: 0.75 });
    expect(cheap.revenue).toBeLessThan(base.revenue);
    expect(cheap.exitSatisfaction).toBeGreaterThan(base.exitSatisfaction);
  });
});

describe('시설 개선 (§15.9 업그레이드)', () => {
  it('단계는 1에서 시작해 최고 단계까지', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    expect(p.levelOf(h)).toBe(1);
    for (let k = 1; k < MAX_LEVEL; k++) expect(p.upgrade(h)).toBe(true);
    expect(p.levelOf(h)).toBe(MAX_LEVEL);
    expect(p.upgrade(h)).toBe(false); // 최고에서 더 안 올라간다
  });

  it('비용이 단계마다 가팔라진다 — 평평하면 "전부 최고"가 절차가 된다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    const costs: number[] = [];
    for (let k = 1; k < MAX_LEVEL; k++) {
      costs.push(p.upgradeCost(h));
      p.upgrade(h);
    }
    for (let k = 1; k < costs.length; k++) {
      expect(costs[k]!).toBeGreaterThan(costs[k - 1]!);
    }
    expect(p.upgradeCost(h)).toBe(0); // 최고 단계는 비용이 없다
  });

  it('최고 단계가 3보다 크다 — 3 이면 후반에 돈 쓸 곳이 40주에 떨어진다', () => {
    // 실측: MAX_LEVEL 3 에서 312주 중 281주가 "지을 게 없다"이고 현금이 1.5억 쌓였다
    expect(MAX_LEVEL).toBeGreaterThan(3);
  });

  it('요금이 단계만큼 오른다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    const base = facilityDef('shop')!.fee;
    expect(p.feeOf(h)).toBe(base);
    p.upgrade(h);
    expect(p.feeOf(h)).toBe(Math.round(base * (1 + LEVEL_FEE_STEP)));
  });

  it('⚠ 정원은 안 늘린다 — 등급 상한에 막힌 상태에서 정원은 아무 효과가 없다', () => {
    const { p } = park(4);
    const before = p.totalCapacity();
    for (const it of p.all()) {
      for (let k = 1; k < MAX_LEVEL; k++) p.upgrade(it.handle);
    }
    expect(p.totalCapacity()).toBe(before);
  });

  it('개선하면 매출과 만족도가 함께 오른다 — 후반의 유일한 성장 축', () => {
    const plain = park();
    const better = park();
    for (const it of better.p.all()) {
      for (let k = 1; k < MAX_LEVEL; k++) better.p.upgrade(it.handle);
    }
    const a = runWeek(plain);
    const b = runWeek(better);
    expect(b.revenue).toBeGreaterThan(a.revenue);
    expect(b.exitSatisfaction).toBeGreaterThan(a.exitSatisfaction);
  });

  it('평균 단계가 스냅샷을 왕복해도 남는다', () => {
    const { p } = park(4);
    p.upgrade(p.all()[0]!.handle);
    const back = PlacementGrid.fromSnapshot(JSON.parse(JSON.stringify(p.toSnapshot())));
    expect(back.averageLevel()).toBeCloseTo(p.averageLevel(), 6);
    expect(back.levelOf(p.all()[0]!.handle)).toBe(2);
  });
});

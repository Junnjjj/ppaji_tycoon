import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore } from './guests.js';
import {
  WeekRunner,
  TICKS_PER_WEEK,
  summarizeWeek,
  type WeekReport,
  type WeekSnapshot,
} from './week.js';

/**
 * Phase 5 결산 계약.
 *
 * 이 파일은 수치를 보기 좋게 다시 계산하는 UI 테스트가 아니다. WeekRunner가 만든 정본
 * 회계와 저장 요약을 그대로 받아, 전주 비교·표시 구획만 바꾸는지를 고정한다.
 */

function runner(seed = 20260825): WeekRunner {
  const terrain = KairoTerrain.generate(40, 32, new Rng(seed));
  const walls = new WallGrid(40, 32);
  const placement = new PlacementGrid(40, 32);
  return new WeekRunner(
    terrain,
    placement,
    new GuestStore(terrain, walls, placement, { i: 2, j: 2 }),
  );
}

function finish(r: WeekRunner, seed = 7): WeekReport {
  r.begin(new Rng(seed), { season: 'summer', playbackEvery: 0 });
  r.step(TICKS_PER_WEEK);
  return r.finish();
}

describe('Phase 5 영업 회계와 투자 지출', () => {
  it('건설·개선·메뉴 개발비는 현금을 줄이되 영업 손익에는 섞지 않는다', () => {
    const base = runner();
    const paid = runner();

    paid.begin(new Rng(7), { season: 'summer', playbackEvery: 0 });
    expect(paid.spend(120_000, 'building')).toBe(true);
    expect(paid.spend(80_000, 'upgrades')).toBe(true);
    expect(paid.spend(30_000, 'menuDevelopment')).toBe(true);
    paid.step(TICKS_PER_WEEK);

    const actual = paid.finish();
    const control = finish(base);
    expect(actual.profit).toBe(control.profit);
    expect(actual.investment).toEqual({
      building: 120_000,
      upgrades: 80_000,
      menuDevelopment: 30_000,
    });
    expect(paid.cash).toBe(base.cash - 230_000);
  });

  it('주 마감 뒤 투자 누계가 비워져 다음 주에 이월되지 않는다', () => {
    const r = runner(9);
    r.begin(new Rng(1), { season: 'summer', playbackEvery: 0 });
    r.spend(50_000, 'building');
    r.step(TICKS_PER_WEEK);
    expect(r.finish().investment.building).toBe(50_000);
    expect(finish(r, 2).investment).toEqual({ building: 0, upgrades: 0, menuDevelopment: 0 });
  });
});

describe('Phase 5 저장 경계', () => {
  it('다음 비교 요약은 히트맵·장부 없이 필요한 소형 필드만 담는다', () => {
    const rep = finish(runner(13), 6);
    rep.menuPurchaseCount = 2;
    rep.regularVisits = 1;
    rep.regularPurchases = 1;
    expect(Object.keys(summarizeWeek(rep)).sort()).toEqual([
      'exitSatisfaction',
      'menuPurchaseCount',
      'profit',
      'regularPurchases',
      'regularVisits',
      'turnedAway',
      'visitors',
    ]);
  });

  it('구 v7 WeekSnapshot은 투자 필드가 없어도 결정적으로 0으로 복원된다', () => {
    const old: WeekSnapshot = { week: 4, cash: 1_234_567 };
    const a = runner(14);
    const b = runner(14);
    a.restore(JSON.parse(JSON.stringify(old)) as WeekSnapshot);
    b.restore(JSON.parse(JSON.stringify(old)) as WeekSnapshot);

    const ra = finish(a, 99);
    const rb = finish(b, 99);
    expect(ra.investment).toEqual({ building: 0, upgrades: 0, menuDevelopment: 0 });
    expect(rb).toEqual(ra);
    expect(b.cash).toBe(a.cash);
  });
});

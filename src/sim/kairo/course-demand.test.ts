import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';
import { realizeCourseWeek, type CourseWeekPotential } from './course.js';

const POTENTIAL: CourseWeekPotential = {
  potentialRiders: 12,
  potentialRevenue: 12_000,
  upkeep: 800,
};

function openWorld(): WeekRunner {
  const terrain = new KairoTerrain(24, 24);
  for (let j = 0; j < 24; j++) {
    for (let i = 0; i < 24; i++) terrain.paint(i, j, 'path_stone');
  }
  const walls = new WallGrid(24, 24);
  const placement = new PlacementGrid(24, 24);
  const guests = new GuestStore(terrain, walls, placement, { i: 0, j: 0 }, OPEN_GATE_DEFAULTS);
  guests.invalidate();
  return new WeekRunner(terrain, placement, guests);
}

describe('코스 실현 수요', () => {
  it('실제 탑승은 코스를 원하는 입장객과 잠재 처리량 중 작은 값이다', () => {
    expect(realizeCourseWeek(POTENTIAL, 3)).toEqual({ riders: 3, revenue: 3_000 });
    expect(realizeCourseWeek(POTENTIAL, 100)).toEqual({ riders: 12, revenue: 12_000 });
  });

  it('코스 수요가 0이면 처리량이 남아도 매출은 0이다', () => {
    expect(realizeCourseWeek(POTENTIAL, 0)).toEqual({ riders: 0, revenue: 0 });

    const report = openWorld().run(new Rng(17), {
      courses: POTENTIAL,
      modifiers: {
        arrivalMult: 0,
        revenueMult: 1,
        crowdMult: 1,
        satisfactionDelta: 0,
        reputationDelta: 0,
        accidentMult: 1,
        closed: false,
      },
    });
    expect(report.visitors).toBe(0);
    expect(report.courseDemand).toBe(0);
    expect(report.coursePotentialRiders).toBe(POTENTIAL.potentialRiders);
    expect(report.courseRiders).toBe(0);
    expect(report.courseRevenue).toBe(0);
  });

  it('실제 주간 결과도 입장객 중 코스 수요와 잠재 처리량을 넘지 않는다', () => {
    const report = openWorld().run(new Rng(23), { courses: POTENTIAL });
    expect(report.visitors).toBeGreaterThan(0);
    expect(report.courseDemand).toBeLessThanOrEqual(report.visitors);
    expect(report.courseRiders).toBeLessThanOrEqual(report.courseDemand);
    expect(report.courseRiders).toBeLessThanOrEqual(POTENTIAL.potentialRiders);
    expect(report.courseRevenue).toBe(report.courseRiders * 1_000);
  });
});

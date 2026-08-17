import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';
import { seasonShares } from './groups.js';
import {
  MAP_TYPES,
  SCENARIOS,
  mapType,
  scenarioDef,
  unlockedScenarios,
  scenarioStatus,
  scenarioProgress,
  shiftedShares,
  validateScenarioData,
} from './scenario.js';

/**
 * 맵 타입 · 시나리오 (§4.5) — **2회차를 하는 이유.**
 *
 * 지키려는 성질: **맵이 다르면 최적 빌드가 달라진다.** 지형만 바뀌고 손님 구성이 같으면
 * "구획마다 강폭이 다름" 수준이라 두 번째 판을 할 이유가 없다.
 */

describe('데이터', () => {
  it('맵 3종 · 시나리오 6종', () => {
    expect(MAP_TYPES.length).toBe(3);
    expect(SCENARIOS.length).toBe(6);
    expect(validateScenarioData()).toEqual([]);
  });

  it('맵마다 손님 구성이 다르다 — 같으면 "맵 특성"이 이름표다', () => {
    const sigs = MAP_TYPES.map((m) => JSON.stringify(m.groupShift));
    expect(new Set(sigs).size).toBe(3);
  });

  it('북한강형은 친구, 계곡형은 커플, 호수형은 가족이 많다', () => {
    const base = seasonShares('summer');
    const bukhan = shiftedShares(base, mapType('bukhan'));
    const valley = shiftedShares(base, mapType('valley'));
    const lake = shiftedShares(base, mapType('lake'));
    expect(bukhan.friends).toBeGreaterThan(valley.friends);
    expect(valley.couple).toBeGreaterThan(bukhan.couple);
    expect(lake.family).toBeGreaterThan(bukhan.family);
  });

  it('비중은 다시 정규화된다 — 안 하면 맵이 난이도 조절이 된다', () => {
    const base = seasonShares('summer');
    for (const m of MAP_TYPES) {
      const s = shiftedShares(base, m);
      const total = Object.values(s).reduce((a, b) => a + b, 0);
      expect(total, m.id).toBeCloseTo(1, 9);
    }
  });

  it('처음부터 할 수 있는 시나리오가 있고, 등급이 오르면 늘어난다', () => {
    expect(unlockedScenarios(1).length).toBeGreaterThanOrEqual(1);
    expect(unlockedScenarios(5).length).toBe(6);
    expect(unlockedScenarios(1).length).toBeLessThan(unlockedScenarios(5).length);
  });
});

describe('지형이 맵대로 만들어진다', () => {
  const waterCount = (t: KairoTerrain): number => {
    let n = 0;
    for (let i = 0; i < t.width; i++) for (let j = 0; j < t.height; j++) if (t.isWater(i, j)) n++;
    return n;
  };

  it('북한강형은 물이 넓고 계곡형은 좁다', () => {
    const rng = () => new Rng(2026);
    const bukhan = KairoTerrain.generate(40, 32, rng(), mapType('bukhan'));
    const valley = KairoTerrain.generate(40, 32, rng(), mapType('valley'));
    expect(waterCount(bukhan)).toBeGreaterThan(waterCount(valley) * 1.5);
  });

  it('호수형은 물가가 더 불규칙하다', () => {
    const shoreRows = (t: KairoTerrain): number => {
      const rows = new Set<number>();
      for (let i = 0; i < t.width; i++) {
        for (let j = 0; j < t.height; j++) {
          if (t.isWater(i, j)) {
            rows.add(j);
            break;
          }
        }
      }
      return rows.size;
    };
    const lake = KairoTerrain.generate(40, 32, new Rng(7), mapType('lake'));
    const valley = KairoTerrain.generate(40, 32, new Rng(7), mapType('valley'));
    expect(shoreRows(lake)).toBeGreaterThan(shoreRows(valley));
  });

  it('어느 맵이든 걸을 땅과 물이 둘 다 있다 — 한쪽이 0 이면 판이 성립 안 한다', () => {
    for (const m of MAP_TYPES) {
      const t = KairoTerrain.generate(40, 32, new Rng(1), m);
      let land = 0;
      for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) if (t.isWalkable(i, j)) land++;
      expect(land, m.id).toBeGreaterThan(100);
      expect(waterCount(t), m.id).toBeGreaterThan(100);
    }
  });
});

describe('맵이 결과를 바꾼다', () => {
  const runOn = (mapId: string): ReturnType<WeekRunner['run']> => {
    const m = mapType(mapId);
    const t = KairoTerrain.generate(40, 32, new Rng(555), m);
    const w = new WallGrid(40, 32);
    const p = new PlacementGrid(40, 32);
    let placed = 0;
    for (let j = 0; j < 32 && placed < 6; j++) {
      for (let i = 0; i < 40 && placed < 6; i++) {
        if (p.place(t, w, { i: 0, j: 0 }, 'shop', i, j).ok) placed++;
      }
    }
    const g = new GuestStore(t, w, p, { i: 0, j: 0 }, GUEST_DEFAULTS);
    g.invalidate();
    return new WeekRunner(t, p, g).run(new Rng(777), {
      season: 'summer',
      mapShares: shiftedShares(seasonShares('summer'), m),
      mapSceneryBonus: m.sceneryBonus,
    });
  };

  it('맵마다 손님 구성이 실제로 다르게 나온다', () => {
    const b = runOn('bukhan');
    const l = runOn('lake');
    expect(b.byGroup.friends + b.byGroup.family).toBeGreaterThan(0);
    // 호수형이 가족 비중이 높다
    const bRatio = b.byGroup.family / Math.max(1, b.visitors);
    const lRatio = l.byGroup.family / Math.max(1, l.visitors);
    expect(lRatio).toBeGreaterThan(bRatio);
  });

  it('경관 보너스가 만족도에 반영된다', () => {
    const valley = runOn('valley');
    const bukhan = runOn('bukhan');
    expect(mapType('valley').sceneryBonus).toBeGreaterThan(mapType('bukhan').sceneryBonus);
    expect(valley.exitSatisfaction).toBeGreaterThan(0);
    expect(bukhan.exitSatisfaction).toBeGreaterThan(0);
  });
});

describe('시나리오 판정', () => {
  const three = scenarioDef('three_years');

  it('기본 시나리오는 끝나지 않는다 — 자유 플레이', () => {
    const s = scenarioDef('inherited');
    expect(scenarioStatus(s, { week: 999, grade: 1, accidents: 5 })).toBe('playing');
    expect(scenarioProgress(s, { week: 1, grade: 1, accidents: 0 })).toBe('자유 플레이');
  });

  it('목표 등급에 닿으면 이긴다', () => {
    expect(scenarioStatus(three, { week: 100, grade: 3, accidents: 0 })).toBe('won');
  });

  it('마감 주를 넘기면 진다', () => {
    expect(scenarioStatus(three, { week: 156, grade: 2, accidents: 0 })).toBe('lost');
    expect(scenarioStatus(three, { week: 155, grade: 2, accidents: 0 })).toBe('playing');
  });

  it('⚠ 같은 주에 둘 다 성립하면 **승리가 먼저다** — 이겼는데 졌다가 되면 안 된다', () => {
    expect(scenarioStatus(three, { week: 156, grade: 3, accidents: 0 })).toBe('won');
  });

  it('사고 없이 시나리오는 사고 1회로 진다', () => {
    const s = scenarioDef('no_accident');
    expect(scenarioStatus(s, { week: 10, grade: 1, accidents: 0 })).toBe('playing');
    expect(scenarioStatus(s, { week: 10, grade: 1, accidents: 1 })).toBe('lost');
  });

  it('진행 상황이 "얼마나 남았나"를 말한다', () => {
    const text = scenarioProgress(three, { week: 100, grade: 2, accidents: 0 });
    expect(text).toContain('3등급');
    expect(text).toContain('56주');
  });

  it('절반의 예산은 시작 자금이 실제로 절반이다', () => {
    expect(scenarioDef('half_budget').startCash).toBeLessThan(scenarioDef('inherited').startCash);
  });
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { Terrain } from './terrain.js';
import { requireEquipmentDef } from './course.js';
import { TICKS_PER_HOUR } from './clock.js';
import type { Vec2 } from './spline.js';

/**
 * 코스 운행 검증.
 *
 * 가장 중요한 것: 플레이어에게 보여준 "처리량 N명/h"가 실제 운행과 맞는가.
 * 어긋나면 지표 패널이 거짓말이 되고, 코스 설계라는 게임의 핵심이 무의미해진다.
 */

/**
 * 위쪽은 육지, 물가를 지나면 곧바로 넓은 수역인 맵.
 * (계획서 §2.2 — 넓은 수역이 물가에 붙어 있으면 제트스키·플라이피쉬가 유리한 지형)
 */
function lakeGame(seed = 1, size = 60): Game {
  const g = new Game({ seed, width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y < 10) g.world.set(x, y, Terrain.Plain);
      else if (y < 12) g.world.set(x, y, Terrain.Shore);
      else g.world.set(x, y, Terrain.OpenWater);
    }
  }
  g.nav.markDirty();
  return g;
}

function circle(n: number, r: number, cx: number, cy: number): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

/**
 * 게이트 + 선착장이 갖춰진 기본 빠지.
 * 선착장(2×4)은 y=10~13 을 차지한다 — 위쪽 y=9 가 육지라 인접 조건을 만족하고,
 * 아래 끝이 물속으로 뻗어 코스가 닿을 수 있다.
 */
function readyPark(seed = 1, dockX = 29): Game {
  const g = lakeGame(seed);
  g.placeFacility('gate', dockX - 1, 3, 0);
  const dock = g.placeFacility('dock', dockX, 10, 0);
  if (!dock) throw new Error('테스트 준비 실패: 선착장을 놓지 못했습니다');
  return g;
}

/**
 * 편의시설까지 갖춘 정상 빠지.
 *
 * 편의시설이 없으면 모든 손님이 굶어서 퇴장 임계값(만족도 25)에 붙어 나가버려,
 * 무엇을 비교하든 차이가 안 보인다. 코스의 효과를 재려면 기본 욕구는 채워져야 한다.
 */
function fullPark(seed = 1, dockX = 29): Game {
  const g = readyPark(seed, dockX);
  g.placeFacility('shop', dockX - 6, 5, 0);
  g.placeFacility('restroom', dockX + 4, 5, 0);
  g.placeFacility('shower', dockX - 6, 8, 0);
  g.placeFacility('shade', dockX + 4, 8, 0);
  return g;
}

/** 선착장 끝에 닿으면서 전부 넓은 수역 위를 도는 코스 */
function courseNear(dockX: number, r = 9): Vec2[] {
  return circle(4, r, dockX + 1, 13 + r + 2);
}

describe('코스 생성', () => {
  it('선착장이 없으면 코스를 만들 수 없다', () => {
    const g = lakeGame();
    expect(g.createCourse('banana', circle(4, 10, 30, 30), 2)).toBeNull();
  });

  it('선착장에 닿으면 코스가 만들어진다', () => {
    const g = readyPark();
    const c = g.createCourse('banana', courseNear(29, 10), 2);
    expect(c).not.toBeNull();
    expect(c!.vehicles).toHaveLength(2);
    expect(c!.dockIid).toBeGreaterThan(0);
    expect(c!.metrics.length).toBeGreaterThan(0);
    expect(c!.metrics.throughput).toBeGreaterThan(0);
  });

  it('육지를 지나는 코스는 거부된다', () => {
    const g = readyPark();
    expect(g.createCourse('banana', circle(4, 22, 30, 14), 2)).toBeNull();
  });

  it('코스를 제거할 수 있다', () => {
    const g = readyPark();
    const c = g.createCourse('banana', courseNear(29), 1)!;
    expect(g.removeCourse(c.iid)).toBe(true);
    expect(g.courses.count).toBe(0);
  });

  it('장비 대수를 바꾸면 지표가 다시 계산된다', () => {
    const g = readyPark();
    const c = g.createCourse('banana', courseNear(29), 1)!;
    const before = c.metrics.throughput;
    g.courses.setVehicleCount(c.iid, 4);
    expect(c.vehicles).toHaveLength(4);
    expect(c.metrics.throughput).toBeCloseTo(before * 4, 4);
  });
});

describe('실제 처리량이 예측 지표와 맞는가 — 지표가 거짓말이면 안 된다', () => {
  it('충분한 손님이 있을 때 실측 처리량이 예측치의 ±20% 안이다', () => {
    const g = readyPark(7);
    // 손님이 항상 넘치도록
    g.arrivals = { ticksPerGroup: 4, maxGuests: 400 };

    const c = g.createCourse('banana', courseNear(29), 3)!;
    const predicted = c.metrics.throughput;
    expect(predicted).toBeGreaterThan(0);

    // 워밍업 — 손님이 차고 코스가 정상 가동될 때까지
    g.run(9000);
    const servedStart = c.served;
    const tickStart = g.clock.tick;

    // 3시간치 운행
    g.run(TICKS_PER_HOUR * 3);

    const hours = (g.clock.tick - tickStart) / TICKS_PER_HOUR;
    const measured = (c.served - servedStart) / hours;

    expect(measured).toBeGreaterThan(0);
    expect(Math.abs(measured - predicted) / predicted).toBeLessThan(0.2);
  });

  it('장비를 2배로 하면 실측 처리량도 대략 2배가 된다', () => {
    const measure = (vehicles: number): number => {
      const g = readyPark(11);
      g.arrivals = { ticksPerGroup: 4, maxGuests: 400 };
      const c = g.createCourse('banana', courseNear(29), vehicles)!;
      g.run(9000);
      const s0 = c.served;
      g.run(TICKS_PER_HOUR * 3);
      return (c.served - s0) / 3;
    };
    const one = measure(1);
    const two = measure(2);
    expect(one).toBeGreaterThan(0);
    expect(two / one).toBeGreaterThan(1.6);
    expect(two / one).toBeLessThan(2.4);
  });
});

describe('손님이 코스를 탄다', () => {
  it('코스가 있으면 손님이 걸어와 타고, 탑승 수가 쌓인다', () => {
    const g = readyPark(3);
    g.arrivals = { ticksPerGroup: 8, maxGuests: 200 };
    const c = g.createCourse('banana', courseNear(29), 2)!;

    let sawRiding = false;
    for (let i = 0; i < 20000; i++) {
      g.step();
      if (g.stats().riding > 0) {
        sawRiding = true;
        break;
      }
    }
    expect(sawRiding, '타고 있는 손님이 있어야 한다').toBe(true);
    expect(c.served).toBeGreaterThan(0);
  });

  it('장비가 없으면 아무도 타지 않는다', () => {
    const g = readyPark(3);
    g.arrivals = { ticksPerGroup: 8, maxGuests: 200 };
    const c = g.createCourse('banana', courseNear(29), 0)!;
    g.run(12000);
    expect(c.served).toBe(0);
    expect(g.stats().riding).toBe(0);
  });

  it('빈 배는 출발하지 않는다 (손님 없이 헛돌지 않음)', () => {
    const g = readyPark(5);
    g.arrivals = { ticksPerGroup: 100000, maxGuests: 0 }; // 손님 없음
    const c = g.createCourse('banana', courseNear(29), 2)!;
    g.run(3000);
    expect(c.served).toBe(0);
    for (const v of c.vehicles) expect(v.state).toBe('boarding');
  });

  it('처리량이 충분한 코스는 퇴장 만족도를 올린다', () => {
    // 편의시설이 갖춰진 빠지에서 손님 30명 · 장비 6대 → 공급이 수요를 감당한다
    const withCourse = fullPark(21);
    withCourse.arrivals = { ticksPerGroup: 30, maxGuests: 30 };
    withCourse.createCourse('banana', courseNear(29), 6);
    withCourse.run(60000);

    const without = fullPark(21);
    without.arrivals = { ticksPerGroup: 30, maxGuests: 30 };
    without.run(60000);

    expect(withCourse.stats().departed).toBeGreaterThan(0);
    expect(without.stats().departed).toBeGreaterThan(0);
    expect(withCourse.stats().avgExitHappiness).toBeGreaterThan(
      without.stats().avgExitHappiness,
    );
  });

  it('탑승한 손님이 요금을 내고 코스 매출이 쌓인다', () => {
    const g = readyPark(9);
    g.arrivals = { ticksPerGroup: 8, maxGuests: 150 };
    const c = g.createCourse('banana', courseNear(29), 2)!;

    g.run(18000);

    expect(c.served).toBeGreaterThan(0);
    expect(c.revenue).toBeGreaterThan(0);
    // 평균 결제액이 요금 근처여야 한다 (지갑이 빈 손님은 덜 낸다)
    expect(c.revenue / c.served).toBeGreaterThan(c.fee * 0.5);
    expect(c.revenue / c.served).toBeLessThanOrEqual(c.fee);
  });
});

describe('코스 결정론·세이브', () => {
  function scenario(seed: number): Game {
    const g = readyPark(seed);
    g.arrivals = { ticksPerGroup: 8, maxGuests: 150 };
    g.createCourse('banana', courseNear(29), 2);
    g.run(15000);
    return g;
  }

  it('같은 시드·같은 코스는 같은 결과를 낸다', () => {
    const a = scenario(42);
    const b = scenario(42);
    expect(a.stats()).toEqual(b.stats());
    expect([...a.courses.all].map((c) => c.served)).toEqual(
      [...b.courses.all].map((c) => c.served),
    );
  });

  it('세이브 왕복 후에도 코스와 결정론이 유지된다', () => {
    const a = scenario(13);
    const snap = JSON.parse(JSON.stringify(a.toSnapshot()));
    const b = Game.fromSnapshot(snap);

    expect(b.courses.count).toBe(a.courses.count);
    const ca = [...a.courses.all][0]!;
    const cb = [...b.courses.all][0]!;
    expect(cb.points).toEqual(ca.points);
    expect(cb.metrics.throughput).toBeCloseTo(ca.metrics.throughput, 6);
    expect(cb.served).toBe(ca.served);

    a.run(3000);
    b.run(3000);
    expect(b.stats()).toEqual(a.stats());
  });
});

describe('편집 중 미리보기', () => {
  it('점을 추가할수록 지표가 갱신된다', () => {
    const g = readyPark();
    const three = g.courses.preview(circle(3, 8, 30, 24), 'banana', 2);
    const six = g.courses.preview(circle(6, 14, 30, 30), 'banana', 2);
    expect(six.length).toBeGreaterThan(three.length);
  });

  it('점이 3개 미만이면 지표가 0', () => {
    const g = readyPark();
    const m = g.courses.preview([{ x: 30, y: 22 }], 'banana', 1);
    expect(m.length).toBe(0);
    expect(m.throughput).toBe(0);
  });

  it('검증 결과가 편집기에 문제 지점을 알려준다', () => {
    const g = readyPark();
    const v = g.courses.validate(circle(4, 22, 30, 14), 'banana');
    expect(v.ok).toBe(false);
    expect(v.badSamples.length).toBeGreaterThan(0);
  });
});

describe('코스끼리 교차하면 안전도가 떨어진다', () => {
  it('겹치는 코스를 추가하면 기존 코스의 안전도가 내려간다', () => {
    const g = readyPark();
    const a = g.createCourse('banana', courseNear(29), 2)!;
    const safeAlone = a.metrics.safety;

    g.createCourse('jetski', courseNear(29), 2);
    expect(a.metrics.safety).toBeLessThan(safeAlone);
  });

  it('멀리 떨어진 코스는 서로 영향이 없다', () => {
    // 선착장 두 개를 맵 양쪽 끝에 두고, 각자 자기 쪽에서 도는 코스
    const g = readyPark(1, 42);
    g.placeFacility('dock', 12, 10, 0);

    const a = g.createCourse('banana', courseNear(42), 2)!;
    const before = a.metrics.safety;
    const b = g.createCourse('jetski', courseNear(12), 2);

    expect(b, '두 번째 코스가 만들어져야 한다').not.toBeNull();
    expect(a.metrics.safety).toBeCloseTo(before, 6);
  });
});

describe('장비 정의', () => {
  it('요금 기본값이 장비 정의에서 온다', () => {
    const g = readyPark();
    const c = g.createCourse('jetski', courseNear(29), 1)!;
    expect(c.fee).toBe(requireEquipmentDef('jetski').fee);
  });

  it('요금을 조절할 수 있다', () => {
    const g = readyPark();
    const c = g.createCourse('banana', courseNear(29), 1)!;
    g.courses.setFee(c.iid, 30000);
    expect(c.fee).toBe(30000);
    g.courses.setFee(c.iid, -5);
    expect(c.fee).toBe(0);
  });
});

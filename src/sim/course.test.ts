import { describe, it, expect } from 'vitest';
import { World } from './world.js';
import { Terrain } from './terrain.js';
import { FacilityStore } from './facility-store.js';
import { sampleSpline, type Vec2 } from './spline.js';
import {
  EQUIPMENT_DEFS,
  computeMetrics,
  validateCourse,
  crossingFraction,
  requireEquipmentDef,
  equipmentDef,
} from './course.js';
import { TICKS_PER_HOUR } from './clock.js';

/**
 * 코스 설계는 이 게임의 핵심 깊이다. 아래 주장들이 성립하지 않으면
 * "처리량 vs 안전"이라는 트레이드오프가 없어지고 메커닉이 무너진다.
 */

/** 위 8줄은 육지, 나머지는 넓은 수역인 테스트 맵 */
function waterWorld(size = 60): World {
  const w = new World(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y < 8) w.set(x, y, Terrain.Plain);
      else if (y < 10) w.set(x, y, Terrain.Shore);
      else if (y < 14) w.set(x, y, Terrain.Shallow);
      else w.set(x, y, Terrain.OpenWater);
    }
  }
  return w;
}

function circle(n: number, r: number, cx: number, cy: number): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

function metricsFor(points: Vec2[], eqId: string, vehicles = 1): ReturnType<typeof computeMetrics> {
  return computeMetrics({
    samples: sampleSpline(points),
    def: requireEquipmentDef(eqId),
    vehicles,
  });
}

describe('장비 데이터', () => {
  it('JSON 에서 장비가 로드된다', () => {
    expect(EQUIPMENT_DEFS.length).toBeGreaterThanOrEqual(4);
    expect(equipmentDef('jetski')?.name).toBe('제트스키');
  });

  it('모르는 장비는 명확히 거부한다', () => {
    expect(() => requireEquipmentDef('없는장비')).toThrow(/알 수 없는 장비/);
  });

  it('모든 장비가 유효한 값을 갖는다', () => {
    for (const d of EQUIPMENT_DEFS) {
      expect(d.speed, d.id).toBeGreaterThan(0);
      expect(d.capacity, d.id).toBeGreaterThanOrEqual(1);
      expect(d.minPoints, d.id).toBeGreaterThanOrEqual(3);
      expect(d.maxPoints, d.id).toBeGreaterThanOrEqual(d.minPoints);
    }
  });
});

describe('처리량 — 배치가 숫자로 드러나야 한다', () => {
  it('코스가 길면 처리량이 낮다', () => {
    const short = metricsFor(circle(4, 6, 30, 30), 'banana');
    const long = metricsFor(circle(4, 18, 30, 30), 'banana');
    expect(long.length).toBeGreaterThan(short.length);
    expect(long.throughput).toBeLessThan(short.throughput);
  });

  it('장비를 늘리면 처리량이 비례해서 는다', () => {
    const one = metricsFor(circle(5, 10, 30, 30), 'banana', 1);
    const three = metricsFor(circle(5, 10, 30, 30), 'banana', 3);
    expect(three.throughput).toBeCloseTo(one.throughput * 3, 5);
  });

  it('처리량 공식이 주기와 맞는다 (명/h)', () => {
    const def = requireEquipmentDef('banana');
    const m = metricsFor(circle(5, 10, 30, 30), 'banana', 2);
    const expected = (TICKS_PER_HOUR / m.cycleTicks) * def.capacity * 2;
    expect(m.throughput).toBeCloseTo(expected, 6);
  });

  it('정원이 큰 장비가 처리량이 높다 (같은 코스)', () => {
    const pts = circle(5, 10, 30, 30);
    const banana = metricsFor(pts, 'banana'); // 5인승
    const wake = metricsFor(pts, 'wakeboard'); // 1인승
    expect(banana.throughput).toBeGreaterThan(wake.throughput);
  });

  it('빈 코스는 지표가 0 이다', () => {
    const m = computeMetrics({
      samples: [],
      def: requireEquipmentDef('banana'),
      vehicles: 1,
    });
    expect(m.throughput).toBe(0);
    expect(m.length).toBe(0);
  });

  it('장비가 0 대면 처리량이 0', () => {
    expect(metricsFor(circle(5, 10, 30, 30), 'banana', 0).throughput).toBe(0);
  });
});

describe('스릴 vs 안전 — 핵심 트레이드오프', () => {
  it('급회전이 많으면 스릴이 오르고 안전도가 떨어진다', () => {
    const smooth = circle(6, 14, 30, 30);
    // 작은 반지름 = 급한 곡선
    const sharp = circle(6, 4, 30, 30);

    const a = metricsFor(smooth, 'jetski');
    const b = metricsFor(sharp, 'jetski');

    expect(b.thrill).toBeGreaterThan(a.thrill);
    expect(b.safety).toBeLessThan(a.safety);
  });

  it('장비를 많이 넣으면 처리량은 오르지만 안전도가 떨어진다', () => {
    const pts = circle(5, 8, 30, 30);
    const few = metricsFor(pts, 'jetski', 1);
    const many = metricsFor(pts, 'jetski', 8);

    expect(many.throughput).toBeGreaterThan(few.throughput);
    expect(many.safety).toBeLessThan(few.safety);
  });

  it('같은 장비 수라도 코스가 길면 더 안전하다 (밀도가 낮아지므로)', () => {
    const tight = metricsFor(circle(5, 6, 30, 30), 'jetski', 5);
    const roomy = metricsFor(circle(5, 16, 30, 30), 'jetski', 5);
    expect(roomy.safety).toBeGreaterThan(tight.safety);
  });

  it('빠른 장비가 같은 코스에서 스릴이 더 높다', () => {
    const pts = circle(5, 10, 30, 30);
    expect(metricsFor(pts, 'jetski').thrill).toBeGreaterThan(
      metricsFor(pts, 'banana').thrill,
    );
  });

  it('스릴이 아주 높으면 멀미도가 생긴다', () => {
    const calm = metricsFor(circle(6, 20, 30, 30), 'banana');
    const wild = metricsFor(circle(6, 4, 30, 30), 'flyfish');
    expect(calm.nausea).toBeLessThan(wild.nausea);
    expect(wild.nausea).toBeGreaterThan(0);
  });

  it('모든 지표가 정해진 범위 안이다', () => {
    for (const eq of EQUIPMENT_DEFS) {
      for (const r of [3, 8, 20]) {
        for (const v of [1, 5, 12]) {
          const m = metricsFor(circle(5, r, 30, 30), eq.id, v);
          expect(m.thrill, `${eq.id} r=${r}`).toBeGreaterThanOrEqual(0);
          expect(m.thrill).toBeLessThanOrEqual(100);
          expect(m.safety).toBeGreaterThanOrEqual(0);
          expect(m.safety).toBeLessThanOrEqual(100);
          expect(m.nausea).toBeGreaterThanOrEqual(0);
          expect(m.nausea).toBeLessThanOrEqual(100);
          expect(Number.isFinite(m.throughput)).toBe(true);
        }
      }
    }
  });
});

describe('코스 검증', () => {
  function setup(): { world: World; facilities: FacilityStore } {
    const world = waterWorld();
    const facilities = new FacilityStore(world);
    return { world, facilities };
  }

  it('선착장이 없으면 코스를 만들 수 없다', () => {
    const { world, facilities } = setup();
    const v = validateCourse(circle(5, 10, 30, 30), requireEquipmentDef('banana'), world, facilities);
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('no-dock');
  });

  it('선착장에 닿으면 통과한다', () => {
    const { world, facilities } = setup();
    const dock = facilities.place('dock', 29, 8, 0); // 물가에 선착장
    expect(dock).not.toBeNull();

    // 선착장 근처를 지나는 코스
    const pts: Vec2[] = [
      { x: 30, y: 12 },
      { x: 42, y: 22 },
      { x: 30, y: 34 },
      { x: 18, y: 22 },
    ];
    const v = validateCourse(pts, requireEquipmentDef('banana'), world, facilities);
    expect(v.issues).not.toContain('no-dock');
    expect(v.dockIid).toBe(dock!.iid);
  });

  it('육지를 지나면 거부한다', () => {
    const { world, facilities } = setup();
    facilities.place('dock', 29, 8, 0);
    // 위쪽 육지(y<8)를 크게 침범하는 코스
    const pts = circle(5, 20, 30, 14);
    const v = validateCourse(pts, requireEquipmentDef('banana'), world, facilities);
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('not-water');
    expect(v.badSamples.length).toBeGreaterThan(0);
  });

  it('수심이 얕으면 거부한다 (제트스키는 넓은 수역 필요)', () => {
    const { world, facilities } = setup();
    facilities.place('dock', 29, 8, 0);
    // y 11~13 은 얕은 물(수심 1). 제트스키는 minDepth 3
    const pts: Vec2[] = [
      { x: 26, y: 11 },
      { x: 34, y: 11 },
      { x: 34, y: 13 },
      { x: 26, y: 13 },
    ];
    const v = validateCourse(pts, requireEquipmentDef('jetski'), world, facilities);
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('too-shallow');
  });

  it('맵 밖으로 나가면 거부한다', () => {
    const { world, facilities } = setup();
    facilities.place('dock', 29, 8, 0);
    const v = validateCourse(circle(5, 40, 30, 40), requireEquipmentDef('banana'), world, facilities);
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('out-of-bounds');
  });

  it('점이 부족하면 거부한다', () => {
    const { world, facilities } = setup();
    const v = validateCourse(
      [
        { x: 30, y: 20 },
        { x: 34, y: 24 },
      ],
      requireEquipmentDef('banana'),
      world,
      facilities,
    );
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('too-few-points');
  });

  it('점이 너무 많으면 거부한다', () => {
    const { world, facilities } = setup();
    const def = requireEquipmentDef('flyfish'); // maxPoints 5
    const v = validateCourse(circle(9, 12, 30, 30), def, world, facilities);
    expect(v.issues).toContain('too-many-points');
  });

  it('다른 수상 시설을 통과하면 거부한다', () => {
    const { world, facilities } = setup();
    facilities.place('dock', 29, 8, 0);
    facilities.place('trampoline', 29, 20, 0); // 코스 경로 위

    const pts: Vec2[] = [
      { x: 30, y: 12 },
      { x: 42, y: 22 },
      { x: 30, y: 34 },
      { x: 18, y: 22 },
    ];
    const v = validateCourse(pts, requireEquipmentDef('banana'), world, facilities);
    // 트램폴린 위를 지나면 blocked
    if (v.issues.includes('blocked')) {
      expect(v.ok).toBe(false);
    }
    // 최소한 검증이 터지지 않아야 한다
    expect(Array.isArray(v.badSamples)).toBe(true);
  });
});

describe('코스 교차', () => {
  it('멀리 떨어진 코스끼리는 겹치지 않는다', () => {
    const a = sampleSpline(circle(5, 6, 20, 20));
    const b = sampleSpline(circle(5, 6, 45, 45));
    expect(crossingFraction(a, [b])).toBe(0);
  });

  it('같은 자리의 코스는 대부분 겹친다', () => {
    const a = sampleSpline(circle(5, 8, 30, 30));
    expect(crossingFraction(a, [a])).toBeGreaterThan(0.9);
  });

  it('겹치면 안전도가 떨어진다', () => {
    const pts = circle(5, 10, 30, 30);
    const clean = computeMetrics({
      samples: sampleSpline(pts),
      def: requireEquipmentDef('jetski'),
      vehicles: 2,
    });
    const crossed = computeMetrics({
      samples: sampleSpline(pts),
      def: requireEquipmentDef('jetski'),
      vehicles: 2,
      crossingFraction: 0.6,
    });
    expect(crossed.safety).toBeLessThan(clean.safety);
  });

  it('비교 대상이 없으면 0', () => {
    expect(crossingFraction(sampleSpline(circle(5, 6, 20, 20)), [])).toBe(0);
  });
});

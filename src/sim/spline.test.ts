import { describe, it, expect } from 'vitest';
import {
  sampleSpline,
  splineLength,
  sampleAtDistance,
  curvatureAt,
  pointAt,
  type Vec2,
} from './spline.js';

/** 반지름 r 인 원 위에 균등하게 놓인 n 개 점 */
function circlePoints(n: number, r: number, cx = 0, cy = 0): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

describe('스플라인 — 알려진 도형으로 수치 검증', () => {
  it('원 위의 점들을 지나는 곡선의 길이가 2πr 에 가깝다', () => {
    const r = 10;
    const samples = sampleSpline(circlePoints(8, r));
    const len = splineLength(samples);
    const expected = 2 * Math.PI * r;
    expect(Math.abs(len - expected) / expected).toBeLessThan(0.02);
  });

  it('점이 많을수록 원에 더 가까워진다', () => {
    const r = 10;
    const exact = 2 * Math.PI * r;
    const err = (n: number): number =>
      Math.abs(splineLength(sampleSpline(circlePoints(n, r))) - exact) / exact;
    expect(err(12)).toBeLessThanOrEqual(err(5));
  });

  it('원의 곡률이 1/r 에 가깝다', () => {
    const r = 8;
    const pts = circlePoints(12, r);
    const samples = sampleSpline(pts);
    const avg = samples.reduce((s, x) => s + x.curvature, 0) / samples.length;
    expect(Math.abs(avg - 1 / r) / (1 / r)).toBeLessThan(0.1);
  });

  it('반지름이 커지면 곡률이 작아진다', () => {
    const k = (r: number): number => {
      const s = sampleSpline(circlePoints(10, r));
      return s.reduce((a, x) => a + x.curvature, 0) / s.length;
    };
    expect(k(20)).toBeLessThan(k(5));
  });

  it('제어점을 실제로 지난다 (보간 곡선)', () => {
    const pts = circlePoints(6, 7);
    for (let i = 0; i < pts.length; i++) {
      const p = pointAt(pts, i, 0);
      expect(p.x).toBeCloseTo((pts[i] as Vec2).x, 6);
      expect(p.y).toBeCloseTo((pts[i] as Vec2).y, 6);
    }
  });

  it('찌그러진 코스가 원보다 최대 곡률이 크다 (급회전 = 스릴)', () => {
    const round = circlePoints(6, 10);
    const spiky: Vec2[] = [
      { x: 0, y: 0 },
      { x: 12, y: 1 },
      { x: 13, y: 2 },
      { x: 2, y: 12 },
      { x: 1, y: 11 },
    ];
    const maxK = (p: Vec2[]): number =>
      Math.max(...sampleSpline(p).map((s) => s.curvature));
    expect(maxK(spiky)).toBeGreaterThan(maxK(round) * 2);
  });
});

describe('스플라인 — 샘플링', () => {
  it('점이 3개 미만이면 샘플이 없다', () => {
    expect(sampleSpline([])).toEqual([]);
    expect(sampleSpline([{ x: 0, y: 0 }])).toEqual([]);
    expect(
      sampleSpline([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([]);
  });

  it('누적 거리가 단조 증가한다', () => {
    const s = sampleSpline(circlePoints(7, 9));
    for (let i = 1; i < s.length; i++) {
      expect((s[i] as { distance: number }).distance).toBeGreaterThanOrEqual(
        (s[i - 1] as { distance: number }).distance,
      );
    }
  });

  it('구간당 샘플 수만큼 점이 나온다', () => {
    expect(sampleSpline(circlePoints(5, 4), 10)).toHaveLength(50);
  });

  it('거리로 위치를 찾으면 그 지점의 누적 거리가 맞는다', () => {
    const pts = circlePoints(8, 12);
    const s = sampleSpline(pts);
    const total = splineLength(s);

    for (const u of [0, 0.25, 0.5, 0.75, 0.99]) {
      const found = sampleAtDistance(s, total, u);
      expect(found).not.toBeNull();
      expect(found!.distance).toBeGreaterThanOrEqual(0);
      expect(Math.abs(found!.distance - u * total)).toBeLessThan(total / 20);
    }
  });

  it('진행도 u 는 1 을 넘어도 순환한다 (닫힌 루프)', () => {
    const s = sampleSpline(circlePoints(6, 5));
    const total = splineLength(s);
    const a = sampleAtDistance(s, total, 0.3);
    const b = sampleAtDistance(s, total, 1.3);
    const c = sampleAtDistance(s, total, -0.7);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('빈 코스에서 위치 조회는 null', () => {
    expect(sampleAtDistance([], 0, 0.5)).toBeNull();
  });

  it('진행 방향이 곡선을 따라 돈다', () => {
    // 원을 한 바퀴 돌면 heading 이 2π 만큼 변한다
    const s = sampleSpline(circlePoints(10, 8));
    let turned = 0;
    for (let i = 1; i < s.length; i++) {
      let d =
        (s[i] as { heading: number }).heading - (s[i - 1] as { heading: number }).heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turned += d;
    }
    expect(Math.abs(Math.abs(turned) - Math.PI * 2)).toBeLessThan(0.5);
  });
});

describe('스플라인 — 퇴화 입력', () => {
  it('같은 점이 겹쳐도 터지지 않는다', () => {
    const pts: Vec2[] = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const s = sampleSpline(pts);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      expect(Number.isFinite(x.curvature)).toBe(true);
      expect(Number.isFinite(x.pos.x)).toBe(true);
    }
    expect(splineLength(s)).toBeCloseTo(0, 6);
  });

  it('일직선 위의 점들은 곡률이 0 에 가깝다', () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    // 구간 1 (가운데)은 직선이므로 곡률 0
    expect(curvatureAt(pts, 1, 0.5)).toBeCloseTo(0, 6);
  });
});

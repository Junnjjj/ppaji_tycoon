/**
 * Catmull-Rom 닫힌 루프 스플라인 — 코스 설계의 기반.
 *
 * 플레이어가 물 위에 점 3~6개를 찍으면 이 곡선이 코스가 되고,
 * 여기서 길이·소요시간·스릴·처리량·안전도가 전부 파생된다.
 * (계획서 §2.4 — RCT 의 트랙 설계에 대응하는 이 게임의 핵심 깊이)
 *
 * 순수 수학이다. 좌표는 타일 단위.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** 코스는 선착장에서 나갔다 돌아오므로 항상 닫힌 루프다. */
export const CLOSED = true;

/** 구간당 샘플 수. 길이·곡률 적분의 정밀도를 결정한다. */
const SAMPLES_PER_SEGMENT = 24;

function at(points: readonly Vec2[], i: number): Vec2 {
  const n = points.length;
  return points[((i % n) + n) % n] as Vec2;
}

/**
 * 구간 i 의 매개변수 t(0..1) 위치.
 * 표준 Catmull-Rom (tension 0.5).
 */
export function pointAt(points: readonly Vec2[], i: number, t: number): Vec2 {
  const p0 = at(points, i - 1);
  const p1 = at(points, i);
  const p2 = at(points, i + 1);
  const p3 = at(points, i + 2);
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/** 1차 도함수 (접선). 진행 방향과 속도. */
export function tangentAt(points: readonly Vec2[], i: number, t: number): Vec2 {
  const p0 = at(points, i - 1);
  const p1 = at(points, i);
  const p2 = at(points, i + 1);
  const p3 = at(points, i + 2);
  const t2 = t * t;

  return {
    x:
      0.5 *
      (-p0.x +
        p2.x +
        2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t +
        3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    y:
      0.5 *
      (-p0.y +
        p2.y +
        2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t +
        3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t2),
  };
}

/** 2차 도함수. 곡률 계산용. */
function secondAt(points: readonly Vec2[], i: number, t: number): Vec2 {
  const p0 = at(points, i - 1);
  const p1 = at(points, i);
  const p2 = at(points, i + 1);
  const p3 = at(points, i + 2);

  return {
    x:
      0.5 *
      (2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) +
        6 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t),
    y:
      0.5 *
      (2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) +
        6 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t),
  };
}

/**
 * 곡률 κ = |x'y'' − y'x''| / (x'² + y'²)^1.5
 * 값이 클수록 급회전. 스릴과 위험을 동시에 만든다.
 */
export function curvatureAt(points: readonly Vec2[], i: number, t: number): number {
  const d1 = tangentAt(points, i, t);
  const d2 = secondAt(points, i, t);
  const speed2 = d1.x * d1.x + d1.y * d1.y;
  if (speed2 < 1e-9) return 0;
  return Math.abs(d1.x * d2.y - d1.y * d2.x) / Math.pow(speed2, 1.5);
}

export interface SplineSample {
  pos: Vec2;
  /** 시작점부터의 누적 길이 (타일) */
  distance: number;
  curvature: number;
  /** 진행 방향 (라디안) */
  heading: number;
}

/**
 * 곡선 전체를 등매개변수로 샘플링한다.
 * 길이·곡률 통계와 렌더링, 그리고 "이 코스가 물 위에 있는가" 검사에 모두 쓰인다.
 */
export function sampleSpline(
  points: readonly Vec2[],
  samplesPerSegment = SAMPLES_PER_SEGMENT,
): SplineSample[] {
  if (points.length < 3) return [];

  const out: SplineSample[] = [];
  let distance = 0;
  let prev: Vec2 | null = null;

  for (let i = 0; i < points.length; i++) {
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const pos = pointAt(points, i, t);
      if (prev) distance += Math.hypot(pos.x - prev.x, pos.y - prev.y);
      const tan = tangentAt(points, i, t);
      out.push({
        pos,
        distance,
        curvature: curvatureAt(points, i, t),
        heading: Math.atan2(tan.y, tan.x),
      });
      prev = pos;
    }
  }

  // 루프를 닫는 마지막 조각
  const first = out[0];
  if (first && prev) {
    distance += Math.hypot(first.pos.x - prev.x, first.pos.y - prev.y);
  }

  return out;
}

/** 닫힌 루프의 총 길이 (타일) */
export function splineLength(samples: readonly SplineSample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1] as SplineSample;
  const first = samples[0] as SplineSample;
  return last.distance + Math.hypot(last.pos.x - first.pos.x, last.pos.y - first.pos.y);
}

/**
 * 총 길이 대비 진행도 u(0..1) 위치를 찾는다.
 * 장비가 코스를 "일정한 속도로" 도는 데 쓴다 — 매개변수 t 로 그냥 돌면
 * 점 간격이 넓은 구간에서 빨라져서 부자연스럽다.
 */
export function sampleAtDistance(
  samples: readonly SplineSample[],
  totalLength: number,
  u: number,
): SplineSample | null {
  if (samples.length === 0 || totalLength <= 0) return null;

  const target = ((u % 1) + 1) % 1 * totalLength;

  // 등간격 샘플이므로 이분 탐색이 가능하다
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((samples[mid] as SplineSample).distance < target) lo = mid + 1;
    else hi = mid;
  }
  return samples[lo] as SplineSample;
}

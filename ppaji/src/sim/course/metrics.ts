/**
 * 코스 지표 — 빠지 `src/sim/course.ts` 에서 `CourseMetrics`·`EMPTY_METRICS`·`MetricsInput`·
 * `computeMetrics` 만 발췌했다 (P4-A). 스펙 §7.6 공식 그대로이고, v1 의 자유 스플라인·
 * 세계(world/terrain/facility-store) 의존은 가져오지 않았다 — 순수 함수 하나다.
 *
 * 스릴은 급회전에서 나오고, 안전도는 같은 급회전에서 깎인다. 그래서 플레이어는
 * "얼마나 험하게 그릴 것인가"를 고민하게 된다 — 이게 코스 설계의 핵심.
 *
 * ⚠ 처리량의 시계: 부모 v1 은 시간당 360 tick 이었고 카이로는 주간 tick 으로 다시 셌다.
 * ppaji 는 `TICKS_PER_HOUR`(140) 를 기본으로 받는다 — 속도(타일/tick)는 같은 축이라
 * 주기(cycleTicks)는 그대로 쓰고 **시간당 tick 수만** 이 세계 것이다.
 */
import { TICKS_PER_HOUR } from '../clock.js';
import { splineLength, type SplineSample } from './spline.js';

export interface CourseMetrics {
  /** 타일 단위 길이 */
  length: number;
  /** 1회 왕복 tick (주행 + 승하차) */
  cycleTicks: number;
  /** 0~100 */
  thrill: number;
  /** 시간당 처리 인원 */
  throughput: number;
  /** 0~100. 낮으면 사고 확률이 올라간다 */
  safety: number;
  /** 0~100. 스릴이 과하면 일부 손님이 불쾌해한다 */
  nausea: number;
  /** 안전 곡률을 넘은 샘플 비율 0~1 */
  sharpFraction: number;
}

export const EMPTY_METRICS: CourseMetrics = {
  length: 0,
  cycleTicks: 0,
  thrill: 0,
  throughput: 0,
  safety: 0,
  nausea: 0,
  sharpFraction: 0,
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 지표 계산에 필요한 장비 성질만 — 전체 `CourseEquipment` 를 요구하면 프리셋 기본 스릴을 못 끼운다 */
export interface MetricsEquipment {
  /** 타일/tick */
  speed: number;
  /** 1대에 타는 인원 */
  capacity: number;
  /** 승하차에 걸리는 tick */
  boardTicks: number;
  /** 기본 스릴 (카이로 규칙: 프리셋 기본값이 들어온다 — 장비 몫은 속도계수·스릴계수로 따로) */
  thrillBase: number;
  /** 이 곡률을 넘으면 위험 구간 */
  safeCurvature: number;
}

export interface MetricsInput {
  samples: readonly SplineSample[];
  def: MetricsEquipment;
  vehicles: number;
  /** 다른 코스와 겹치는 샘플 비율 0~1 */
  crossingFraction?: number;
  /** 시간당 tick — 기본은 이 세계의 시계 */
  ticksPerHour?: number;
}

/**
 * 코스 지표를 계산한다.
 *
 * 스릴은 급회전에서 나오고, 안전도는 같은 급회전에서 깎인다.
 */
export function computeMetrics(input: MetricsInput): CourseMetrics {
  const { samples, def, vehicles } = input;
  if (samples.length === 0 || vehicles <= 0) return { ...EMPTY_METRICS };

  const length = splineLength(samples);
  if (length <= 0) return { ...EMPTY_METRICS };

  const cycleTicks = length / def.speed + def.boardTicks;

  // ── 급회전 통계 ──
  const curvatures = samples.map((s) => s.curvature).sort((a, b) => b - a);
  const topCount = Math.max(1, Math.floor(curvatures.length * 0.2));
  const topMean = curvatures.slice(0, topCount).reduce((a, b) => a + b, 0) / topCount;
  const sharpFraction = samples.filter((s) => s.curvature > def.safeCurvature).length / samples.length;

  // ── 스릴: 기본값 + 급회전 + 속도 ──
  const speedFactor = def.speed / 0.3;
  const thrill = clamp(def.thrillBase + topMean * 90 * speedFactor, 0, 100);

  // ── 처리량 ──
  const throughput = ((input.ticksPerHour ?? TICKS_PER_HOUR) / cycleTicks) * def.capacity * vehicles;

  // ── 안전도 ──
  // 코스가 짧은데 장비가 많으면 서로 붙어 다녀 위험하다.
  const densityPenalty = clamp((vehicles / Math.max(1, length / 12) - 1) * 28, 0, 45);
  const sharpPenalty = sharpFraction * 55;
  const crossPenalty = (input.crossingFraction ?? 0) * 40;
  const safety = clamp(100 - sharpPenalty - densityPenalty - crossPenalty, 0, 100);

  // ── 멀미: 스릴이 임계를 넘는 만큼 ──
  const nausea = clamp((thrill - 62) * 1.6 + sharpFraction * 25, 0, 100);

  return { length, cycleTicks, thrill, throughput, safety, nausea, sharpFraction };
}

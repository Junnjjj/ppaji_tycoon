import rawData from '../data/equipment.json' with { type: 'json' };
import { TICKS_PER_HOUR } from './clock.js';
import { depthLevel, isWater } from './terrain.js';
import type { World } from './world.js';
import { footprint, requireFacilityDef } from './facility.js';
import type { FacilityStore, PlacedFacility } from './facility-store.js';
import { sampleSpline, splineLength, type SplineSample, type Vec2 } from './spline.js';

/**
 * 수상 코스 — 계획서 §2.4. 이 게임의 핵심 깊이.
 *
 * 수상 놀이기구는 "시설"이 아니라 "경로"를 설계한다.
 * 물 위에 점 3~6개를 찍으면 스플라인이 생기고, 거기서
 * 길이 · 소요시간 · 스릴 · 처리량(명/h) · 안전도가 파생된다.
 *
 * 핵심 트레이드오프는 장비 대수다:
 *   대수↑ → 처리량↑, 그러나 코스 밀도↑ → 안전도↓, 비용↑
 */

export interface EquipmentDef {
  id: string;
  name: string;
  sprite: string;
  /** 타일/tick */
  speed: number;
  /** 1대에 타는 인원 */
  capacity: number;
  /** 승하차에 걸리는 tick */
  boardTicks: number;
  /** 필요한 최소 수심 등급 */
  minDepth: number;
  fee: number;
  vehicleCost: number;
  upkeep: number;
  thrillBase: number;
  /** 이 곡률을 넘으면 위험 구간 */
  safeCurvature: number;
  minPoints: number;
  maxPoints: number;
  desc: string;
}

const parsedEquipment = (rawData as unknown as { equipment: EquipmentDef[] }).equipment;

const equipmentById = new Map<string, EquipmentDef>();
for (const e of parsedEquipment) {
  if (equipmentById.has(e.id)) throw new Error(`장비 ID 중복: '${e.id}'`);
  if (e.speed <= 0) throw new Error(`장비 '${e.id}': speed 는 양수여야 합니다`);
  if (e.capacity < 1) throw new Error(`장비 '${e.id}': capacity 는 1 이상이어야 합니다`);
  if (e.minPoints < 3) throw new Error(`장비 '${e.id}': minPoints 는 3 이상이어야 합니다`);
  equipmentById.set(e.id, e);
}

export const EQUIPMENT_DEFS: readonly EquipmentDef[] = parsedEquipment;

export function equipmentDef(id: string): EquipmentDef | undefined {
  return equipmentById.get(id);
}

export function requireEquipmentDef(id: string): EquipmentDef {
  const d = equipmentById.get(id);
  if (!d) throw new Error(`알 수 없는 장비 ID: '${id}'`);
  return d;
}

// ─────────────────────────────────────────────────────────────
// 지표
// ─────────────────────────────────────────────────────────────

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

export interface MetricsInput {
  samples: readonly SplineSample[];
  def: EquipmentDef;
  vehicles: number;
  /** 다른 코스와 겹치는 샘플 비율 0~1 */
  crossingFraction?: number;
}

/**
 * 코스 지표를 계산한다.
 *
 * 스릴은 급회전에서 나오고, 안전도는 같은 급회전에서 깎인다.
 * 그래서 플레이어는 "얼마나 험하게 그릴 것인가"를 고민하게 된다 — 이게 코스 설계의 핵심.
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
  const topMean =
    curvatures.slice(0, topCount).reduce((a, b) => a + b, 0) / topCount;
  const sharpFraction =
    samples.filter((s) => s.curvature > def.safeCurvature).length / samples.length;

  // ── 스릴: 기본값 + 급회전 + 속도 ──
  const speedFactor = def.speed / 0.3;
  const thrill = clamp(def.thrillBase + topMean * 90 * speedFactor, 0, 100);

  // ── 처리량 ──
  const throughput = (TICKS_PER_HOUR / cycleTicks) * def.capacity * vehicles;

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

// ─────────────────────────────────────────────────────────────
// 검증
// ─────────────────────────────────────────────────────────────

export type CourseIssue =
  | 'too-few-points'
  | 'too-many-points'
  | 'out-of-bounds'
  | 'not-water'
  | 'too-shallow'
  | 'no-dock'
  | 'blocked';

export const COURSE_ISSUE_MESSAGES: Record<CourseIssue, string> = {
  'too-few-points': '점이 부족합니다',
  'too-many-points': '점이 너무 많습니다',
  'out-of-bounds': '맵 밖으로 나갑니다',
  'not-water': '물 위로만 지날 수 있습니다',
  'too-shallow': '수심이 얕습니다',
  'no-dock': '선착장에 연결해야 합니다',
  blocked: '시설을 통과합니다',
};

export interface CourseValidation {
  ok: boolean;
  issues: CourseIssue[];
  /** 문제가 있는 샘플 인덱스 — 편집기가 빨갛게 표시한다 */
  badSamples: number[];
  /** 연결된 선착장. 없으면 -1 */
  dockIid: number;
}

/**
 * 코스가 선착장에 닿았다고 보는 거리 (타일).
 *
 * 너무 좁으면 물가의 짧은 선착장에서 코스를 낼 수가 없다 —
 * 선착장은 4타일밖에 뻗지 않는데 손님을 태우려면 배가 그 근처에 서면 된다.
 */
export const DOCK_REACH = 3;

function dockTiles(f: PlacedFacility): Vec2[] {
  const def = requireFacilityDef(f.defId);
  const [w, h] = footprint(def, f.rot);
  const out: Vec2[] = [];
  for (let y = f.y; y < f.y + h; y++) {
    for (let x = f.x; x < f.x + w; x++) out.push({ x: x + 0.5, y: y + 0.5 });
  }
  return out;
}

/**
 * 코스가 성립하는지 검사한다.
 *
 * 물 위여야 하고, 장비가 요구하는 수심을 만족해야 하고,
 * 반드시 선착장에 연결되어야 한다 (손님이 탈 곳이 있어야 하므로).
 */
export function validateCourse(
  points: readonly Vec2[],
  def: EquipmentDef,
  world: World,
  facilities: FacilityStore,
  samples?: readonly SplineSample[],
): CourseValidation {
  const issues = new Set<CourseIssue>();
  const badSamples: number[] = [];

  if (points.length < def.minPoints) issues.add('too-few-points');
  if (points.length > def.maxPoints) issues.add('too-many-points');

  if (points.length < 3) {
    return { ok: false, issues: [...issues], badSamples, dockIid: -1 };
  }

  const pts = samples ?? sampleSpline(points);

  for (let i = 0; i < pts.length; i++) {
    const s = pts[i] as SplineSample;
    const tx = Math.floor(s.pos.x);
    const ty = Math.floor(s.pos.y);

    if (!world.inBounds(tx, ty)) {
      issues.add('out-of-bounds');
      badSamples.push(i);
      continue;
    }
    const terrain = world.at(tx, ty);
    if (!isWater(terrain)) {
      issues.add('not-water');
      badSamples.push(i);
      continue;
    }
    if (depthLevel(terrain) < def.minDepth) {
      issues.add('too-shallow');
      badSamples.push(i);
      continue;
    }
    // 선착장은 지나도 되지만 다른 수상 시설은 막는다
    const f = facilities.facilityAt(tx, ty);
    if (f && f.defId !== 'dock') {
      issues.add('blocked');
      badSamples.push(i);
    }
  }

  // ── 선착장 연결 ──
  let dockIid = -1;
  let bestDist = Infinity;
  for (const f of facilities.all) {
    if (f.defId !== 'dock') continue;
    for (const t of dockTiles(f)) {
      for (const s of pts) {
        const d = Math.hypot(s.pos.x - t.x, s.pos.y - t.y);
        if (d < bestDist) {
          bestDist = d;
          if (d <= DOCK_REACH) dockIid = f.iid;
        }
      }
      if (dockIid !== -1) break;
    }
    if (dockIid !== -1) break;
  }
  if (dockIid === -1) issues.add('no-dock');

  return { ok: issues.size === 0, issues: [...issues], badSamples, dockIid };
}

/**
 * 다른 코스와 겹치는 비율. 안전도 감점에 쓴다.
 * 코스가 서로 가로지르면 실제 빠지에서도 사고 위험이 커진다.
 */
export function crossingFraction(
  samples: readonly SplineSample[],
  others: ReadonlyArray<readonly SplineSample[]>,
  radius = 1.2,
): number {
  if (samples.length === 0 || others.length === 0) return 0;
  let hits = 0;
  const r2 = radius * radius;

  for (const s of samples) {
    let crossed = false;
    for (const other of others) {
      for (const o of other) {
        const dx = s.pos.x - o.pos.x;
        const dy = s.pos.y - o.pos.y;
        if (dx * dx + dy * dy < r2) {
          crossed = true;
          break;
        }
      }
      if (crossed) break;
    }
    if (crossed) hits++;
  }
  return hits / samples.length;
}

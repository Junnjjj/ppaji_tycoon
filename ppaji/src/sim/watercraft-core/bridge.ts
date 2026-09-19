/**
 * 게임 ↔ 운항 모듈 다리 — 에셋 워크트리의 `runtime/core/game-bridge.mjs` 를 그대로 옮겼다.
 *
 * ⚠ 사고 확률식은 **주입받는다**. 여기에 복제하면 밸런스가 두 벌이 된다 (인계 §5) —
 *   호스트는 `sim/accident.ts` 의 `accidentChance` 를 그대로 넘긴다.
 */
import { courseAccidentInput, effectiveSpeed, IncidentLedger, type AccidentContext, type CourseMetricsLike, type Decision, type RideAccidentInput, type RideGuest, type RouteSample } from './incidents.js';
import type { Boat, Dock, Vec3, WaterWorld } from './recovery.js';

export interface CourseRidePlan {
  version: 1;
  rideId: string;
  /** 타일/tick — `equipment.speed × boat.speedMult` 를 **한 번만** 적용한 값 */
  speed: number;
  safety: number;
  thrill: number;
  probabilities: Record<string, number>;
  decision: Decision;
  /** 옛 선착장 고정 뽑기(`safe: 2`)는 이 운항의 승객에게 **적용하지 않는다** */
  legacyDockAccidentPolicy: 'SKIP_FOR_THIS_RIDE';
}

export function createCourseRide<B>(input: {
  rideId: string;
  seed: number | string;
  equipment: { speed: number };
  boat?: { speedMult: number } | null;
  courseResult: CourseMetricsLike;
  guests: readonly RideGuest[];
  contextForGuest: (guest: RideGuest) => AccidentContext;
  balance: B;
  accidentChance: (x: RideAccidentInput, b: B) => number;
  samples: readonly RouteSample[];
  ledger?: IncidentLedger;
  forced?: boolean;
  injuryProbability?: number;
}): CourseRidePlan {
  const { rideId, seed, equipment, boat, courseResult, guests, contextForGuest, balance, accidentChance, samples, ledger = new IncidentLedger(), forced = false, injuryProbability = 0 } = input;
  if (typeof accidentChance !== 'function' || typeof contextForGuest !== 'function') throw new TypeError('Host accident function/context required');
  const probabilities = Object.fromEntries(guests.map((g) => [g.id, accidentChance(courseAccidentInput(courseResult, contextForGuest(g)), balance)]));
  return {
    version: 1,
    rideId,
    speed: effectiveSpeed(equipment, boat),
    safety: courseResult.safety,
    thrill: courseResult.thrill,
    probabilities,
    decision: ledger.decide({ rideId, seed, guests, probabilities, samples, forced, injuryProbability }),
    legacyDockAccidentPolicy: 'SKIP_FOR_THIS_RIDE',
  };
}

/** Game +I = world X · Game +J = world −Y (인계 §2) */
export function gameToWorld({ i, j, height = 0 }: { i: number; j: number; height?: number }): Vec3 {
  return [i, -j, height];
}

export function worldToGame([x, y, z = 0]: Vec3): { i: number; j: number; height: number } {
  return { i: x, j: -y, height: z };
}

export function worldFromGame(input: {
  bounds: WaterWorld['bounds'];
  cellSize?: number;
  isWaterTile: (i: number, j: number) => boolean;
  docks: { id: string; active?: boolean; water: { i: number; j: number; height?: number }; land: { i: number; j: number; height?: number } }[];
  revision: string | number;
  boatsAt?: WaterWorld['boatsAt'];
}): WaterWorld {
  const { bounds, cellSize = 0.5, isWaterTile, docks, revision, boatsAt } = input;
  const out: WaterWorld = {
    bounds,
    cellSize,
    revision,
    isWater: (x, y) => isWaterTile(Math.floor(x), Math.floor(-y)),
    docks: docks.map((d): Dock => ({ id: d.id, ...(d.active === undefined ? {} : { active: d.active }), water: gameToWorld(d.water), land: gameToWorld(d.land) })),
  };
  if (boatsAt) out.boatsAt = boatsAt;
  return out;
}

/** 수영 중인 손님 앞을 지나가는 보트는 **선다** — 권고일 뿐 충돌 물리 엔진이 아니다 (인계 §8) */
export function fleetYieldCommands(
  boats: readonly Boat[],
  swimmers: readonly { position: Vec3 }[],
  { lookAhead = 1.2, clearance = 0.6 }: { lookAhead?: number; clearance?: number } = {},
): { boatId: string; speedMultiplier: 0 | 1; reason: 'SWIMMER_PRIORITY' | null }[] {
  return boats.map((b) => {
    const end = [b.position[0] + (b.velocity?.[0] ?? 0) * lookAhead, b.position[1] + (b.velocity?.[1] ?? 0) * lookAhead];
    const dx = (end[0] as number) - b.position[0], dy = (end[1] as number) - b.position[1];
    const obstructed = swimmers.some((s) => {
      const u = Math.max(0, Math.min(1, ((s.position[0] - b.position[0]) * dx + (s.position[1] - b.position[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(s.position[0] - b.position[0] - u * dx, s.position[1] - b.position[1] - u * dy) < b.radius + clearance;
    });
    return { boatId: b.id, speedMultiplier: obstructed ? 0 : 1, reason: obstructed ? 'SWIMMER_PRIORITY' : null };
  });
}

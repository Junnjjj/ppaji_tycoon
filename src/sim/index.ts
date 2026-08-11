/**
 * sim/ 의 공개 표면.
 *
 * render·ui·tools 는 이 파일을 통해서만 sim 에 접근한다.
 * 의존 방향은 항상 render → sim 이며, 그 역은 ESLint 로 차단되어 있다.
 */
export { Rng } from './rng.js';
export { Clock, TICK_HZ, MS_PER_TICK } from './clock.js';
export type { SpeedLevel } from './clock.js';
export {
  Terrain,
  TERRAIN_NAMES,
  TERRAIN_BY_KEY,
  terrainFromKey,
  isWater,
  isLand,
  isWalkable,
  isBlocked,
  depthLevel,
} from './terrain.js';
export { World } from './world.js';
export { generateWorld } from './worldgen.js';
export type { WorldGenOptions } from './worldgen.js';

export {
  FACILITY_DEFS,
  facilityDef,
  requireFacilityDef,
  footprint,
} from './facility.js';
export type { FacilityDef, FacilityLayer, NeedKind, PlacementRule } from './facility.js';

export { FacilityStore, PLACE_FAILURE_MESSAGES } from './facility-store.js';
export type { PlacedFacility, Rotation, PlaceCheck, PlaceFailure } from './facility-store.js';

export { FlowField, UNREACHABLE } from './pathfield.js';
export { Navigation } from './navigation.js';

export {
  sampleSpline,
  splineLength,
  sampleAtDistance,
  pointAt,
  tangentAt,
  curvatureAt,
} from './spline.js';
export type { Vec2, SplineSample } from './spline.js';

export {
  EQUIPMENT_DEFS,
  equipmentDef,
  requireEquipmentDef,
  computeMetrics,
  validateCourse,
  crossingFraction,
  COURSE_ISSUE_MESSAGES,
  EMPTY_METRICS,
} from './course.js';
export type {
  EquipmentDef,
  CourseMetrics,
  CourseIssue,
  CourseValidation,
} from './course.js';

export { CourseStore } from './course-store.js';
export type { Course, Vehicle, VehicleState } from './course-store.js';

export { GuestStore, DEFAULT_TUNABLES, NEEDS, NEED_COUNT } from './guest.js';
export type { Guest, GuestState, GuestTunables, GuestEvents, Facing } from './guest.js';

export { Game, RngStream, TICKS_PER_DAY, DEFAULT_ARRIVALS } from './game.js';
export type { GameOptions, GameStats, GameSnapshot, ArrivalTunables } from './game.js';

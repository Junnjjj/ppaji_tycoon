/**
 * 실제 운항 (P61-a) — 견인 코스의 탑승 → 주행 → 낙수 → 복귀 → 하선.
 *
 * 왜 따로 두는가: 선착장 이용이 **즉시 요금 + 즉시 사고 뽑기**였다. 보트는 렌더러가 벽시계로
 * 돌리는 장식이었고, 사고는 코스 안전도와 무관한 `safe: 2` 고정값이었다. 이제 운항이 상태를 갖고,
 * 요금은 출항 때 **한 번**, 사고는 코스의 실제 안전도(0~100 → 0~4)로 `IncidentLedger` 가 결정한다.
 *
 * 소유 경계 (인계 §4·§5·§6):
 *   - 이 모듈은 **운항 상태**만 소유한다. 돈·통계·하루 사고 상한·부상 처리는 호스트(`Game`)가 한다.
 *   - 사고 확률식은 `sim/accident.ts` 를 **주입받는다** — 여기에 복제하지 않는다.
 *   - 속도는 `equipment.speed × boat.speedMult` 를 `effectiveSpeed` 로 **한 번만** 곱한다.
 *   - 스릴에 이미 들어간 속도를 위험 확률에 다시 곱하지 않는다.
 *
 * 결정론 (불변식 2): `Rng` 를 한 번도 안 쓴다. 낙수 결정은 `stableRandom(seed, rideId+열쇠)` 이므로
 * 손님을 하나 더 태워도 날씨·사고 스트림이 밀리지 않고, 저장·복원 뒤에도 같은 답이 나온다.
 *
 * 저장: 운항은 **설정 + 경과 tick** 만 싣는다. 경로·속도표는 불러올 때 같은 설정에서 다시 만든다
 * (같은 함수 · 같은 입력 = 같은 표). 업그레이드는 다음 출항부터 반영된다 — 뜬 운항은 자기 설정을 쥔다.
 */
import { TICK_MS } from '../clock.js';
import { accidentChance, riskLevel, type AccidentBalance, type RiskLevel } from '../accident.js';
import { sampleCourse, splineLength, type CourseEquipment, type PlacedCourse, type TowBoatDef, type Vec2 } from './course.js';
import type { CourseResult } from './course.js';
import {
  IncidentLedger,
  advanceRecovery,
  createCourseRide,
  createRecovery,
  gameToWorld,
  fleetYieldCommands,
  restoreRecovery,
  worldFromGame,
  worldToGame,
  type AccidentContext,
  type Boat,
  type Decision,
  type LedgerSnapshot,
  type RecoveryState,
  type RouteSample,
  type WaterWorld,
} from '../watercraft-core/index.js';
import type { RidePassengerView, RideScene, RideSwimmerView, RideVehicleView, RideView, Vec2f } from './ride-view.js';

// ─────────────────────────────────────────────────────────────
// 상수 — 왜 이 값인지를 적는다 (임의 상한은 두지 않는다)
// ─────────────────────────────────────────────────────────────

/** 복귀는 실시간 초로 적분한다 — 시연(공중 0.8초·착수 0.45초·상륙 1.2초)의 박자를 그대로 보려면 1 tick = 125ms */
export const RECOVERY_SECONDS_PER_TICK = TICK_MS / 1000;
/**
 * 헤엄 속도 (world 단위/초). 0.3 타일/tick — 기구 기본 속도대와 같은 눈금이라
 * "물을 건너오는 데 얼마나 걸리나"가 코스 길이와 같은 축에서 읽힌다.
 */
export const RECOVERY_SWIM_SPEED = 2.4;
/**
 * 복귀는 **낮 동안에는 절대 중간에 접지 않는다** — 화면에서 손님이 사라지는 것은 텔레포트와 같다.
 * 닿을 선착장이 없으면 보이는 채로 계속 헤엄치고, 정리는 폐장(`endOfDay`, 화면 밖)에서만 한다.
 * 그래서 "한 손님의 방문은 하루 안에 끝난다"(불변식)가 여전히 성립한다.
 */
export const RECOVERY_DAY_END_ONLY = true;
/** 보트가 헤엄치는 손님을 피하는 반경 (타일) */
export const BOAT_CLEAR_RADIUS = 1;
/**
 * 한 운항이 연속으로 양보할 수 있는 최대 tick. 넘으면 비켜 돌아간다.
 * ⚠ 없으면 **교착**이 난다: 닿을 선착장이 없어 제자리에 뜬 손님(`rescue-wait`) 앞에서 보트가 영원히 선다.
 */
export const MAX_YIELD_TICKS = 40;
/** 견인선이 기구보다 앞서 가는 거리 (타일) — 시연 revision4 의 gap */
export const ROPE_GAP = 5.85;
/** 정박 → 항로 합류는 승선의 마지막 40% 동안. 출항 순간에 기구가 튀지 않게 한다 */
export const CAST_OFF_FRACTION = 0.4;
/** 코스가 뻗을 수 있는 선착장 시설 id — 2×1 승선장이 들어오면 여기 한 줄만 는다 */
export const COURSE_DOCK_IDS: ReadonlySet<string> = new Set(['dock', 'boarding_dock', 'boarding_dock2x1']);

/** 에셋 16방향 색인 (h0 = +J · h4 = +I). 렌더러의 `craftHeading(cos h, sin h)` 와 같은 값이어야 한다 */
export function nativeHeading(heading: number): number {
  return ((Math.round((Math.PI / 2 - heading) / (Math.PI / 8)) % 16) + 16) % 16;
}

/** 캐노니컬 좌석 접점 (`approved-watercraft/manifest.json` 의 `seats`). sim 은 에셋을 import 할 수 없어 **평문으로 주입**받는다 */
export interface SeatSpec {
  /** [x, y, z] 타일 — manifest 의 `seats[].position` 을 그대로 받는다 */
  position: readonly number[];
  heading: number;
}

/** 좌석 접점을 양자화한 방향으로 회전한 **게임 공간 오프셋** — 렌더러의 `local()` 과 같은 식이다 */
export function seatOffset(spec: SeatSpec, heading: number): { di: number; dj: number; z: number } {
  const a = nativeHeading(heading) * (Math.PI / 8);
  const x = spec.position[0] ?? 0, y = spec.position[1] ?? 0, z = spec.position[2] ?? 0;
  return { di: x * Math.cos(a) - y * Math.sin(a), dj: -(x * Math.sin(a) + y * Math.cos(a)), z };
}
/** 곡률이 안전 곡률의 두 배면 속도가 바닥(0.6배)이다 — 굽이에서 느리고 직선에서 빠르다 */
export const SPEED_FLOOR = 0.6;
/**
 * 낙수가 곧 부상인가. 1 = 옛 규칙과 같다 (선착장 뽑기 한 번 = 사고 한 번).
 * ⚠ core 는 운항당 최대 1명으로 자르므로 다인승에서 기대 사고 수가 **조금 준다** — 0 으로 두면
 *   사고가 아예 사라지고 밸런스가 통째로 움직인다. 이 값을 내리려면 밸런스를 다시 잴 것 (인계 §6).
 */
export const RIDE_INJURY_PROBABILITY = 1;

/** 반동 6종 (시연 `experiments.mjs` 의 `motionProfiles` 그대로) */
export const BOUNCE_PROFILES: Readonly<Record<string, { height: number; period: number; splash: number }>> = {
  banana: { height: 0.25, period: 2.3, splash: 0.65 },
  flyfish: { height: 0.45, period: 2.7, splash: 1 },
  rocket_tube: { height: 0.22, period: 2.1, splash: 0.6 },
  watersled: { height: 0.16, period: 2.6, splash: 0.5 },
  swing: { height: 0.2, period: 2.5, splash: 0.6 },
  skyfly: { height: 0.38, period: 3, splash: 0.9 },
};
/** 낙수 9종 (시연 `fallProfiles`. `peanut_3` 는 이 게임의 `peanut` 이다) */
export const FALL_EQUIPMENT: ReadonlySet<string> = new Set(['peanut', 'banana', 'rocket_tube', 'watersled', 'jjinppang', 'honeycomb', 'hexa', 'lotus', 'twinpang']);

// ─────────────────────────────────────────────────────────────
// 호스트 계약
// ─────────────────────────────────────────────────────────────

export interface RideDock {
  uid: number;
  /** 선착장 시설 칸 */
  tile: Vec2;
  /** 손님이 물에서 올라오는 물 칸 */
  water: Vec2;
  /** 올라와서 서는 뭍(또는 데크) 칸 */
  land: Vec2;
}

export interface RideHost {
  /** 게임 시드 — 낙수 결정의 시드 */
  seed(): number;
  balance(): AccidentBalance;
  gridSize(): { w: number; h: number };
  /** 손님이 헤엄칠 수 있는 물인가 (시설·데크는 물이 아니다) */
  isWaterTile(i: number, j: number): boolean;
  /** 지금 살아 있는 선착장들 */
  docks(): readonly RideDock[];
  /** 이 손님·이 선착장의 사고 문맥 (조끼·망루·구조정·수온·혼잡) */
  accidentContext(guestUid: number, dockUid: number): AccidentContext;
  /** 이 기구의 좌석 접점. 비어 있으면 선체 중심 폴백 (에셋 주입 전에도 게임은 돈다) */
  seatSpecs(equipId: string): readonly SeatSpec[];
  /** 손님이 아직 판에 있나 */
  guestAlive(uid: number): boolean;
  /** 손님을 실제 자세로 옮긴다 — 매 tick 연속이라 텔레포트가 아니다 */
  placeGuest(uid: number, i: number, j: number, heading: number): void;
  /** 부상 하나. 하루 상한에 걸리면 false — 그러면 낙수 연출도 통계도 일어나지 않는다 (인계 §7) */
  applyInjury(uid: number, dockUid: number, what: string): boolean;
  /** 낙수가 실제로 일어났다 (연출·소식) */
  onFall(uid: number, at: Vec2, injured: boolean): void;
  /** 물에서 뭍으로 올라왔다. 부상이면 여기서 **처음** 의무실 목표를 준다 (인계 §7) */
  onReturn(uid: number, land: Vec2, injured: boolean): void;
  /** 닿을 선착장이 끝내 없었다 — 구조대가 데리고 나간다 */
  onRescueGiveUp(uid: number, at: Vec2): void;
  /** 운항이 끝나 손님이 내렸다 (만족·체력·연출) */
  onDisembark(uid: number, dockUid: number, thrill: number): void;
}

// ─────────────────────────────────────────────────────────────
// 저장 형태
// ─────────────────────────────────────────────────────────────

export interface RidePassengerSave {
  uid: number;
  seat: number;
  fallen: boolean;
}

export interface RideSave {
  rideId: string;
  handle: number;
  dockUid: number;
  dock: Vec2;
  /** 물쪽 정박 칸 — 승하선 중 기구가 뜨는 자리 */
  moor: Vec2;
  /** 손님이 배에 오르는 뭍 칸 */
  boardFrom: Vec2;
  handles: Vec2[];
  equipId: string;
  towBoatId: string | null;
  presetId: string;
  vehicles: number;
  vehicle: number;
  safetyBriefing: boolean;
  thrill: number;
  safety: number;
  satisfactionMult: number;
  elapsed: number;
  /** 연속 양보 tick — `MAX_YIELD_TICKS` 를 넘으면 비켜 돌아간다 (교착 방지). 저장한다 */
  yieldTicks: number;
  passengers: RidePassengerSave[];
  decision: Decision | null;
  fallDone: boolean;
  fallEventId: string | null;
}

export interface RideStoreSnapshot {
  version: 1;
  seq: number;
  rides: RideSave[];
  swimmers: { uid: number; dockUid: number; age: number; state: RecoveryState }[];
  ledger: LedgerSnapshot;
}

// ─────────────────────────────────────────────────────────────
// 내부 상태
// ─────────────────────────────────────────────────────────────

interface Schedule {
  /** 표본 위치 (루프 닫힘 포함) */
  pos: Vec2[];
  heading: number[];
  /** 출항(주행 시작)부터의 tick */
  time: number[];
  /** 0..1 */
  progress: number[];
  /** 타일/tick */
  speed: number[];
  peakSpeed: number;
  /** `equipment.speed × boat.speedMult` — 한 번만 곱한 실효 속도 */
  base: number;
  length: number;
  travelTicks: number;
  boardTicks: number;
}

interface Ride extends RideSave {
  schedule: Schedule;
}

interface Swimmer {
  uid: number;
  dockUid: number;
  age: number;
  state: RecoveryState;
}

const nearlyZero = 1e-9;

/** 굽이에서 느리고 직선에서 빠른 속도 프로파일. 한 바퀴 시간은 `length / effectiveSpeed` 그대로다 */
function buildSchedule(course: { dock: Vec2; handles: readonly Vec2[] }, equip: CourseEquipment, boat: TowBoatDef | null): Schedule {
  const raw = sampleCourse(course.dock, course.handles);
  const length = splineLength(raw);
  const base = equip.speed * (boat?.speedMult ?? 1);
  const pos: Vec2[] = [];
  const heading: number[] = [];
  const shape: number[] = [];
  const dist: number[] = [];
  for (const s of raw) {
    pos.push({ x: s.pos.x, y: s.pos.y });
    heading.push(s.heading);
    dist.push(s.distance);
    const f = equip.safeCurvature > 0 ? Math.max(SPEED_FLOOR, Math.min(1, 1 - s.curvature / (2 * equip.safeCurvature))) : 1;
    shape.push(f);
  }
  // 루프를 닫는 마지막 조각 — 첫 표본으로 돌아온다
  if (pos.length > 0) {
    pos.push({ ...(pos[0] as Vec2) });
    heading.push(heading[0] as number);
    shape.push(shape[0] as number);
    dist.push(length);
  }
  if (pos.length < 2 || length <= 0 || base <= 0) {
    return { pos: pos.length ? pos : [{ ...course.dock }], heading: heading.length ? heading : [0], time: [0], progress: [0], speed: [0], peakSpeed: 0, base, length: Math.max(0, length), travelTicks: 0, boardTicks: Math.max(0, equip.boardTicks) };
  }
  // v_k = base · f_k · c, c = (Σ Δd/f) / length → 한 바퀴 시간이 정확히 length/base 다
  let inv = 0;
  for (let k = 1; k < pos.length; k++) inv += (dist[k] as number) - (dist[k - 1] as number) > 0 ? ((dist[k] as number) - (dist[k - 1] as number)) / ((shape[k] as number) || 1) : 0;
  const c = inv > nearlyZero ? inv / length : 1;
  const speed = shape.map((f) => base * f * c);
  const time: number[] = [0];
  for (let k = 1; k < pos.length; k++) {
    const dd = (dist[k] as number) - (dist[k - 1] as number);
    const v = ((speed[k] as number) + (speed[k - 1] as number)) / 2;
    time.push((time[k - 1] as number) + (v > nearlyZero ? dd / v : 0));
  }
  return {
    pos,
    heading,
    time,
    progress: dist.map((d) => (length > 0 ? d / length : 0)),
    speed,
    peakSpeed: Math.max(...speed),
    base,
    length,
    travelTicks: time[time.length - 1] as number,
    boardTicks: Math.max(0, equip.boardTicks),
  };
}

function scheduleAt(s: Schedule, t: number): { pos: Vec2; heading: number; speed: number; progress: number } {
  const n = s.time.length;
  if (n === 0) return { pos: { x: 0, y: 0 }, heading: 0, speed: 0, progress: 0 };
  const clamped = Math.max(0, Math.min(s.travelTicks, t));
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((s.time[mid] as number) < clamped) lo = mid + 1;
    else hi = mid;
  }
  const k = Math.max(1, lo);
  const t0 = s.time[k - 1] as number, t1 = s.time[k] as number;
  const u = t1 - t0 > nearlyZero ? (clamped - t0) / (t1 - t0) : 0;
  const a = s.pos[k - 1] as Vec2, b = s.pos[k] as Vec2;
  return {
    pos: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
    heading: s.heading[u < 0.5 ? k - 1 : k] as number,
    speed: (s.speed[k - 1] as number) + ((s.speed[k] as number) - (s.speed[k - 1] as number)) * u,
    progress: (s.progress[k - 1] as number) + ((s.progress[k] as number) - (s.progress[k - 1] as number)) * u,
  };
}

/** Arc-length lead, preserving continuous motion through turns. */
function scheduleAhead(s: Schedule, t: number, gapTiles: number): { pos: Vec2; heading: number } {
  if (s.length <= 0) return { pos: s.pos[0] ?? { x: 0, y: 0 }, heading: 0 };
  const here = scheduleAt(s, t), target = (here.progress + gapTiles / s.length) % 1;
  let lo = 0, hi = s.progress.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s.progress[mid]! < target) lo = mid + 1; else hi = mid; }
  const k = Math.max(1, lo), p0=s.progress[k-1]!,p1=s.progress[k]!,u=p1-p0>nearlyZero?(target-p0)/(p1-p0):0;
  const a=s.pos[k-1]!,b=s.pos[k]!;
  return {pos:{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u},heading:s.heading[k]!};
}

/** 주행 구간의 경로 표본 — `eligibleForFall` 이 여기서 낙수 가능 구간을 고른다 */
function routeSamples(s: Schedule): RouteSample[] {
  const out: RouteSample[] = [];
  for (let k = 0; k < s.time.length; k++) {
    out.push({ time: s.boardTicks / 2 + (s.time[k] as number), phase: 'towing', progress: s.progress[k] as number, speed: s.speed[k] as number, peakSpeed: s.peakSpeed });
  }
  return out;
}

export class CourseRideStore {
  private rides: Ride[] = [];
  private swimmers: Swimmer[] = [];
  private ledger = new IncidentLedger();
  private seq = 0;
  private rev = 1;
  private world: WaterWorld | null = null;
  private worldRev = -1;

  constructor(private readonly host: RideHost) {}

  /** 세계·코스·선착장이 바뀌었다 — 물길과 선착장 목록을 다시 만든다 */
  bumpRevision(): void {
    this.rev++;
    this.world = null;
  }

  get revision(): number {
    return this.rev;
  }

  /** 지금 운항 중인(또는 탑승 중인) 손님인가 — 손님 FSM 이 걷지 않게 한다 */
  isRiding(uid: number): boolean {
    return this.rides.some((r) => r.passengers.some((p) => p.uid === uid && !p.fallen)) || this.swimmers.some((s) => s.uid === uid);
  }

  activeCount(handle: number): number {
    return this.rides.filter((r) => r.handle === handle).length;
  }

  /**
   * 탑승. 자리가 없으면 `false` — 그러면 호스트는 **요금을 받지 않는다**.
   * 같은 코스에 동시에 뜨는 운항은 `course.vehicles` 대까지다 (그래서 `potentialDailyRiders` 가 뜻을 갖는다).
   */
  board(guestUid: number, course: PlacedCourse, equip: CourseEquipment, boat: TowBoatDef | null, result: CourseResult, dock: RideDock): boolean {
    if (this.isRiding(guestUid)) return false;
    const open = this.rides.find((r) => r.handle === course.handle && r.decision === null && r.passengers.length < equip.capacity);
    if (open) {
      open.passengers.push({ uid: guestUid, seat: open.passengers.length, fallen: false });
      return true;
    }
    if (this.activeCount(course.handle) >= Math.max(1, course.vehicles)) return false;
    const schedule = buildSchedule({dock:dock.water,handles:course.handles}, equip, boat);
    if (schedule.travelTicks <= 0) return false;
    this.seq++;
    this.rides.push({
      rideId: `r${course.handle}-${this.seq}`,
      handle: course.handle,
      dockUid: dock.uid,
      dock: { ...course.dock },
      moor: { ...dock.water },
      boardFrom: { ...dock.land },
      handles: course.handles.map((h) => ({ ...h })),
      equipId: equip.id,
      towBoatId: boat?.id ?? null,
      presetId: course.presetId,
      vehicles: Math.max(1, course.vehicles),
      vehicle: Array.from({length:Math.max(1,course.vehicles)},(_,k)=>k).find(k=>!this.rides.some(r=>r.handle===course.handle&&r.vehicle===k)) ?? 0,
      safetyBriefing: course.safetyBriefing === true,
      thrill: result.thrill,
      safety: result.safety,
      satisfactionMult: result.satisfactionMult,
      elapsed: 0,
      yieldTicks: 0,
      passengers: [{ uid: guestUid, seat: 0, fallen: false }],
      decision: null,
      fallDone: false,
      fallEventId: null,
      schedule,
    });
    return true;
  }

  // ── 세계 ──────────────────────────────────────────────────

  private waterWorld(): WaterWorld {
    if (this.world && this.worldRev === this.rev) return this.world;
    const { w, h } = this.host.gridSize();
    const docks = this.host.docks();
    const yielding = this.yieldingBoats();
    this.world = worldFromGame({
      bounds: [-0.5, -h + 0.5, w - 0.5, 0.5],
      // 타일 한 칸이 한 격자점 — 물 판정과 같은 해상도라 "물인데 못 지난다"가 생기지 않는다
      cellSize: 1,
      isWaterTile: (i, j) => this.host.isWaterTile(i, j),
      docks: docks.map((d) => ({ id: String(d.uid), water: { i: d.water.x, j: d.water.y }, land: { i: d.land.x, j: d.land.y } })),
      revision: this.rev,
      boatsAt: () => this.boats().filter((b) => !yielding.has(b.id)),
    });
    // Game render coordinates denote tile centres; recovery grid centres must use the same origin.
    this.world.isWater = (x,y) => this.host.isWaterTile(Math.round(x),Math.round(-y));
    this.worldRev = this.rev;
    return this.world;
  }

  /** 지금 물 위에 있는 보트·기구 — 헤엄치는 손님과의 교통 규칙에 쓴다 */
  private boats(): Boat[] {
    const out: Boat[] = [];
    for (const r of this.rides) {
      const t = r.elapsed - r.schedule.boardTicks / 2;
      if (t < 0 || t > r.schedule.travelTicks) continue;
      const here = scheduleAt(r.schedule, t);
      const prev = scheduleAt(r.schedule, Math.max(0, t - 1));
      const v: [number, number] = [here.pos.x - prev.pos.x, -(here.pos.y - prev.pos.y)];
      out.push({ id: `${r.rideId}:rig`, position: gameToWorld({ i: here.pos.x, j: here.pos.y }), velocity: v, radius: BOAT_CLEAR_RADIUS });
      if (r.towBoatId) {
        const ahead = this.towPose(r.schedule, t);
        out.push({ id: `${r.rideId}:boat`, position: gameToWorld({ i: ahead.pos.x, j: ahead.pos.y }), velocity: v, radius: BOAT_CLEAR_RADIUS });
      }
    }
    return out;
  }

  private yieldSet = new Set<string>();
  private yieldingBoats(): ReadonlySet<string> {
    return this.yieldSet;
  }

  // ── 한 tick ────────────────────────────────────────────────

  step(): void {
    if (this.rides.length === 0 && this.swimmers.length === 0) return; // 판의 99%는 여기서 끝난다 — 빈 tick 에 선착장을 훑지 않는다
    // ① 헤엄치는 손님이 앞에 있으면 보트가 선다 (인계 §8). 선 보트는 손님의 대기 판정에서 빠진다 — 둘이 서로 기다리면 영원히 안 끝난다
    const swimmerPoints = this.swimmers.filter((s) => s.state.status !== 'done').map((s) => ({ position: s.state.position }));
    this.yieldSet = swimmerPoints.length === 0 ? new Set() : new Set(fleetYieldCommands(this.boats(), swimmerPoints).filter((c) => c.speedMultiplier === 0).map((c) => c.boatId));
    this.world = null; // boatsAt 가 이번 tick 의 양보를 봐야 한다

    for (const r of [...this.rides]) this.stepRide(r);
    this.stepSwimmers();
  }

  private stepRide(r: Ride): void {
    r.passengers = r.passengers.filter((p) => p.fallen || this.host.guestAlive(p.uid));
    if (r.passengers.length === 0) {
      this.finish(r);
      return;
    }
    const half = r.schedule.boardTicks / 2;
    const yielded = (this.yieldSet.has(`${r.rideId}:rig`) || this.yieldSet.has(`${r.rideId}:boat`)) && r.yieldTicks < MAX_YIELD_TICKS;
    r.yieldTicks = yielded ? r.yieldTicks + 1 : 0;
    if (!yielded || r.elapsed < half) r.elapsed++;
    const t = r.elapsed - half;

    if (r.decision === null && r.elapsed >= half) this.depart(r);
    if (t >= 0 && t <= r.schedule.travelTicks && !r.fallDone) this.maybeFall(r, t);

    // 손님 위치 — 승하선 중에는 선착장 뭍 칸(배 위가 아니다), 주행 중에는 기구를 따라간다
    const riding = r.passengers.filter((p) => !p.fallen);
    const pose = this.craftPose(r, t);
    if (t < 0 || t > r.schedule.travelTicks) {
      for (const p of riding) this.host.placeGuest(p.uid, r.boardFrom.x, r.boardFrom.y, pose.heading);
      if (t > r.schedule.travelTicks && t >= r.schedule.travelTicks + half) {
        for (const p of riding) this.host.onDisembark(p.uid, r.dockUid, r.thrill);
        this.finish(r);
      }
    } else {
      for (const p of riding) this.host.placeGuest(p.uid, pose.pos.x, pose.pos.y, pose.heading);
    }
  }

  /** 출항 — 여기서 운항 id·설정·확률이 고정된다. 이 뒤의 업그레이드는 다음 출항부터다 */
  private depart(r: Ride): void {
    const equip = { speed: r.schedule.base };
    const outer = this.outerSeats(r.equipId);
    // 좌석 접점이 주입됐으면 **바깥쪽 좌석**만 후보다 (안쪽 승객은 안 떨어진다 — 시연과 같은 규칙)
    const guests = r.passengers.map((p) => (outer.size > 0 && !outer.has(p.seat) ? { id: String(p.uid), canFall: false } : { id: String(p.uid) }));
    const plan = createCourseRide({
      rideId: r.rideId,
      seed: this.host.seed(),
      equipment: equip,
      courseResult: { thrill: r.thrill, safety: r.safety },
      guests,
      contextForGuest: (g) => {
        const cx = this.host.accidentContext(Number(g.id), r.dockUid);
        return { ...cx, briefed: r.safetyBriefing };
      },
      balance: this.host.balance(),
      accidentChance,
      samples: FALL_EQUIPMENT.has(r.equipId) ? routeSamples(r.schedule) : [],
      ledger: this.ledger,
      injuryProbability: RIDE_INJURY_PROBABILITY,
    });
    r.decision = plan.decision;
  }

  private maybeFall(r: Ride, t: number): void {
    const event = r.decision?.event;
    if (!event) return;
    if (r.elapsed < event.time) return;
    r.fallDone = true;
    const seat = r.passengers.find((p) => String(p.uid) === event.guestId && !p.fallen);
    if (!seat) return;
    const consumed = this.ledger.consume(event);
    if (!consumed) return;
    // 하루 사고 상한에 걸리면 **연출도 통계도 없다** — 둘을 일치시킨다 (인계 §7)
    if (consumed.applyInjury && !this.host.applyInjury(seat.uid, r.dockUid, '코스')) return;
    const here = this.craftPose(r, t);
    const mount = this.seatAt(r, seat.seat, here, this.bounceOf(r, t));
    const landing = this.splashPoint(mount.pos, here.heading, this.host.seatSpecs(r.equipId)[seat.seat]?.position[0] ?? 0);
    seat.fallen = true;
    r.fallEventId = event.id;
    this.swimmers.push({
      uid: seat.uid,
      dockUid: r.dockUid,
      age: 0,
      state: createRecovery({
        guestId: String(seat.uid),
        start: gameToWorld({ i: mount.pos.x, j: mount.pos.y, height: mount.height }),
        landing: gameToWorld({ i: landing.x, j: landing.y }),
        originDockId: String(r.dockUid),
        injured: consumed.applyInjury,
        swimSpeed: RECOVERY_SWIM_SPEED,
      }),
    });
    this.host.onFall(seat.uid, { x: mount.pos.x, y: mount.pos.y }, consumed.applyInjury);
  }

  /**
   * 지금 기구·보트 자세. 승하선 중에는 **물쪽 정박 칸**에 뜨고, 승선의 마지막 40% 에 항로로 미끄러져 나간다 —
   * 출항 순간에 배가 나타나거나 한 칸 튀지 않는다. 보트는 언제나 `ROPE_GAP` 앞이다.
   */
  private craftPose(r: Ride, t: number): { pos: Vec2; heading: number; speed: number; progress: number; boat: { pos: Vec2; heading: number } | null } {
    const half = r.schedule.boardTicks / 2;
    const start = scheduleAt(r.schedule, 0);
    const towing = t >= 0 && t <= r.schedule.travelTicks;
    let pos: Vec2, heading: number, speed: number, progress: number;
    if (towing) {
      const here = scheduleAt(r.schedule, t);
      pos = here.pos; heading = here.heading; speed = here.speed; progress = here.progress;
    } else {
      // 승선: 정박 → 항로. 하선: 항로 → 정박 (닫힌 루프라 끝점이 곧 시작점이다)
      const u = half <= 0 ? 1 : t < 0 ? (t + half) / half : Math.min(1, (t - r.schedule.travelTicks) / half);
      const cast = t < 0 ? Math.max(0, (u - (1 - CAST_OFF_FRACTION)) / CAST_OFF_FRACTION) : 1 - Math.min(1, u / CAST_OFF_FRACTION);
      const e = cast * cast * (3 - 2 * cast); // smoothstep — 정박에서 스르르 나간다
      pos = { x: r.moor.x + (start.pos.x - r.moor.x) * e, y: r.moor.y + (start.pos.y - r.moor.y) * e };
      heading = start.heading; speed = 0; progress = t < 0 ? 0 : 1;
    }
    const ahead = this.towPose(r.schedule, Math.max(0,Math.min(r.schedule.travelTicks,t)));
    return { pos, heading, speed, progress, boat: r.towBoatId ? ahead : null };
  }

  /** Keep hulls apart at a tight turn where the water permits it; never switch route branches. */
  private towPose(schedule:Schedule,t:number):{pos:Vec2;heading:number} {
    const ahead=scheduleAhead(schedule,t,ROPE_GAP),here=scheduleAt(schedule,t);
    const dx=ahead.pos.x-here.pos.x,dy=ahead.pos.y-here.pos.y,d=Math.hypot(dx,dy),clearance=3.5;
    if(d>1e-6&&d<clearance){
      const pos={x:here.pos.x+dx/d*clearance,y:here.pos.y+dy/d*clearance};
      if(this.host.isWaterTile(Math.round(pos.x),Math.round(pos.y)))return {...ahead,pos};
    }
    return ahead;
  }

  /** 좌석 접점 — 에셋이 주입됐으면 실제 접점, 아니면 선체 중심 */
  private seatAt(r: Ride, seat: number, craft: { pos: Vec2; heading: number }, bounce: number): { pos: Vec2; height: number } {
    const spec = this.host.seatSpecs(r.equipId)[seat];
    if (!spec) return { pos: { ...craft.pos }, height: bounce };
    const o = seatOffset(spec, craft.heading);
    return { pos: { x: craft.pos.x + o.di, y: craft.pos.y + o.dj }, height: bounce + o.z };
  }

  /** 바깥쪽 좌석만 낙수 후보 — 시연과 같은 규칙(운전자 제외 · 안쪽 승객은 안 떨어진다) */
  private outerSeats(equipId: string): ReadonlySet<number> {
    const specs = this.host.seatSpecs(equipId);
    const out = new Set<number>();
    if (specs.length === 0) return out;
    const max = Math.max(...specs.map((sp) => Math.abs(sp.position[0] ?? 0)));
    specs.forEach((sp, k) => { if (Math.abs(sp.position[0] ?? 0) >= max - 0.15) out.add(k); });
    return out;
  }

  /** 기구 바깥쪽 물로 떨어진다 — 물이 아니면 반대쪽, 그래도 아니면 제자리(코스는 물 위다) */
  private splashPoint(pos: Vec2, heading: number, localSide: number): Vec2 {
    const nx = -Math.sin(heading), ny = Math.cos(heading);
    for (const side of (localSide >= 0 ? [-1, 1] : [1, -1])) {
      const p = { x: pos.x + nx * 1.2 * side, y: pos.y + ny * 1.2 * side };
      if (this.host.isWaterTile(Math.floor(p.x), Math.floor(p.y))) return p;
    }
    return { ...pos };
  }

  private finish(r: Ride): void {
    this.rides = this.rides.filter((x) => x !== r);
    this.ledger.forget(r.rideId);
  }

  private stepSwimmers(): void {
    if (this.swimmers.length === 0) return;
    const world = this.waterWorld();
    for (const s of [...this.swimmers]) {
      if (!this.host.guestAlive(s.uid)) {
        this.swimmers = this.swimmers.filter((x) => x !== s);
        continue;
      }
      s.age++;
      advanceRecovery(s.state, RECOVERY_SECONDS_PER_TICK, world);
      const at = worldToGame(s.state.position);
      this.host.placeGuest(s.uid, at.i, at.j, s.state.heading);
      if (s.state.status === 'done') {
        this.swimmers = this.swimmers.filter((x) => x !== s);
        this.host.onReturn(s.uid, { x: at.i, y: at.j }, s.state.injured);
        continue;
      }
      // 낮에는 접지 않는다 (`RECOVERY_DAY_END_ONLY`) — 닿을 선착장이 없으면 보이는 채로 계속 헤엄친다
    }
  }

  /** 폐장 — 뜬 운항과 복귀를 정리한다. 한 손님의 방문은 하루 안에 끝나야 한다(불변식) */
  endOfDay(): void {
    for (const r of [...this.rides]) {
      for (const p of r.passengers) {
        if (p.fallen || !this.host.guestAlive(p.uid)) continue;
        this.host.placeGuest(p.uid, r.dock.x, r.dock.y, 0);
        this.host.onDisembark(p.uid, r.dockUid, r.thrill);
      }
      this.finish(r);
    }
    for (const s of [...this.swimmers]) {
      this.swimmers = this.swimmers.filter((x) => x !== s);
      if (!this.host.guestAlive(s.uid)) continue;
      const dock = this.host.docks().find((d) => String(d.uid) === s.state.targetDock) ?? this.host.docks().find((d) => String(d.uid) === s.state.originDockId) ?? this.host.docks()[0];
      if (dock) {
        this.host.placeGuest(s.uid, dock.land.x, dock.land.y, 0);
        this.host.onReturn(s.uid, { ...{ x: dock.land.x, y: dock.land.y } }, s.state.injured);
      } else {
        const at = worldToGame(s.state.position);
        this.host.onRescueGiveUp(s.uid, { x: at.i, y: at.j });
      }
    }
  }

  /** One launch berth per course, using exactly the first boarding pose. Extra fleet vehicles wait off scene. */
  mooredView(course: PlacedCourse, equip: CourseEquipment, boat: TowBoatDef | null, dock: RideDock): RideView {
    const schedule = buildSchedule({ dock: dock.water, handles: course.handles }, equip, boat);
    const start = scheduleAt(schedule, 0), ahead = this.towPose(schedule, 0);
    return {
      rideId: `moored-${course.handle}`, courseHandle: course.handle, equipId: equip.id,
      towBoatId: boat?.id ?? null, dockUid: dock.uid, phase: 'boarding', progress: 0,
      boardProgress: 0, unboardProgress: 0, speed: 0, peakSpeed: schedule.peakSpeed,
      thrill: 0, safety: 100, riskLevel: 0, fallEventId: null,
      vehicles: [{ vehicle: 0, pos: { i: dock.water.x, j: dock.water.y }, heading: start.heading,
        bounce: 0, boat: boat ? { pos: { i: ahead.pos.x, j: ahead.pos.y }, heading: ahead.heading } : null,
        ropeLength: boat ? Math.hypot(ahead.pos.x-dock.water.x,ahead.pos.y-dock.water.y) : 0,
        speed: 0, passengers: [] }],
    };
  }

  // ── 표시 ───────────────────────────────────────────────────

  scene(paths: ReadonlyMap<number, readonly Vec2f[]>, timeSec = 0): RideScene {
    const rides: RideView[] = [];
    for (const r of this.rides) {
      const half = r.schedule.boardTicks / 2;
      const t = r.elapsed - half;
      const towing = t >= 0 && t <= r.schedule.travelTicks;
      const bounce = towing ? this.bounceOf(r, t) : 0;
      const here = this.craftPose(r, t);
      const phase = t < 0 ? 'boarding' : towing ? 'towing' : 'unboarding';
      const boardProgress = half <= 0 ? 1 : t < 0 ? Math.max(0, Math.min(1, (t + half) / half)) : 1;
      const unboardProgress = half <= 0 || t <= r.schedule.travelTicks ? 0 : Math.max(0, Math.min(1, (t - r.schedule.travelTicks) / half));
      const passengers: RidePassengerView[] = r.passengers.map((p) => {
        const mount = this.seatAt(r, p.seat, here, bounce);
        return {
          guestUid: p.uid,
          seat: p.seat,
          pose: (p.fallen ? 'fall' : towing ? 'ride' : 'board') as RidePassengerView['pose'],
          pos: { i: mount.pos.x, j: mount.pos.y },
          origin: { i: r.boardFrom.x, j: r.boardFrom.y },
          height: mount.height,
          heading: here.heading,
          fallen: p.fallen,
          injured: r.decision?.event?.injured === true && String(p.uid) === r.decision?.event?.guestId,
        };
      });
      const vehicle: RideVehicleView = {
        vehicle: r.vehicle,
        pos: { i: here.pos.x, j: here.pos.y },
        heading: here.heading,
        bounce,
        boat: here.boat ? { pos: { i: here.boat.pos.x, j: here.boat.pos.y }, heading: here.boat.heading } : null,
        ropeLength: here.boat ? Math.hypot(here.boat.pos.x - here.pos.x, here.boat.pos.y - here.pos.y) : 0,
        speed: here.speed,
        passengers,
      };
      rides.push({
        rideId: r.rideId,
        courseHandle: r.handle,
        equipId: r.equipId,
        towBoatId: r.towBoatId,
        dockUid: r.dockUid,
        phase,
        progress: here.progress,
        boardProgress,
        unboardProgress,
        speed: here.speed,
        peakSpeed: r.schedule.peakSpeed,
        thrill: r.thrill,
        safety: r.safety,
        riskLevel: this.riskOf(r),
        fallEventId: r.fallEventId,
        vehicles: [vehicle],
      });
    }
    const swimmers: RideSwimmerView[] = this.swimmers.map((s) => {
      const at = worldToGame(s.state.position);
      const dock = this.host.docks().find((d) => String(d.uid) === s.state.targetDock);
      return {
        guestUid: s.uid,
        pos: { i: at.i, j: at.j },
        height: Math.max(0, at.height),
        heading: s.state.heading,
        status: s.state.status,
        pose: s.state.pose,
        injured: s.state.injured,
        targetDockUid: dock ? dock.uid : null,
        path: (s.state.path ?? []).slice(s.state.pathIndex).map((p) => {
          const g = worldToGame(p);
          return { i: g.i, j: g.j };
        }),
      };
    });
    return { revision: this.rev, timeSec, rides, swimmers, paths };
  }

  /** 위험 단계는 **자리의 위험**과 같은 눈금이다 — 조끼 있음·만석 기준 (accident.ts 의 `riskOf` 와 같은 관점) */
  private riskOf(r: Ride): RiskLevel {
    const first = r.passengers[0];
    if (!first) return 0;
    const cx = this.host.accidentContext(first.uid, r.dockUid);
    return riskLevel(accidentChance({ thrill: r.thrill / 25, safe: r.safety / 25, vest: true, guarded: cx.guarded, rescued: cx.rescued, briefed: r.safetyBriefing, cold: cx.cold, busy: cx.cap, cap: cx.cap }, this.host.balance()));
  }

  private bounceOf(r: Ride, t: number): number {
    const profile = BOUNCE_PROFILES[r.equipId];
    if (!profile || t <= 0) return 0;
    const age = t * RECOVERY_SECONDS_PER_TICK;
    const endAge = r.schedule.travelTicks * RECOVERY_SECONDS_PER_TICK;
    const u = ((age / profile.period) % 1 + 1) % 1;
    const envelope = Math.min(1, age / 3, (endAge - age) / 3);
    return profile.height * Math.sin(Math.PI * u) ** 2 * Math.max(0, envelope);
  }

  // ── 저장 ───────────────────────────────────────────────────

  toSnapshot(): RideStoreSnapshot {
    return {
      version: 1,
      seq: this.seq,
      rides: this.rides.map(({ schedule: _schedule, ...rest }) => structuredClone(rest)),
      swimmers: this.swimmers.map((s) => ({ uid: s.uid, dockUid: s.dockUid, age: s.age, state: structuredClone(s.state) })),
      ledger: this.ledger.snapshot(),
    };
  }

  /**
   * 불러오기. **모르는 버전은 명시적으로 거절한다** (인계 §9) — 조용히 빈 상태로 시작하면
   * 뜬 운항의 손님이 영원히 얼어붙는다. 필드가 아예 없는 구 세이브는 빈 상태가 맞다.
   */
  fromSnapshot(snapshot: RideStoreSnapshot | undefined, lookup: (save: RideSave) => { equip: CourseEquipment; boat: TowBoatDef | null } | undefined): void {
    this.rides = [];
    this.swimmers = [];
    this.ledger = new IncidentLedger();
    this.seq = 0;
    this.bumpRevision();
    if (!snapshot) return;
    if (snapshot.version !== 1) throw new Error(`Unsupported ride save: ${String(snapshot.version)}`);
    this.seq = snapshot.seq;
    this.ledger = new IncidentLedger(snapshot.ledger);
    for (const save of snapshot.rides) {
      const found = lookup(save);
      // 이미 출항한 운항은 코스 편집·삭제와 무관하게 저장된 장비와 경로로 복원한다.
      if (!found) continue;
      const schedule = buildSchedule({ dock: save.moor ?? save.dock, handles: save.handles }, found.equip, found.boat);
      if (schedule.travelTicks <= 0) continue;
      this.rides.push({ ...structuredClone(save), yieldTicks: save.yieldTicks ?? 0, schedule });
    }
    for (const s of snapshot.swimmers) this.swimmers.push({ uid: s.uid, dockUid: s.dockUid, age: s.age, state: restoreRecovery(s.state) });
  }

  /** 검사 전용 — 운항 목록을 읽는다 */
  ridesForTest(): readonly RideSave[] {
    return this.rides;
  }
  swimmersForTest(): readonly { uid: number; age: number; state: RecoveryState }[] {
    return this.swimmers;
  }
}

import { Clock, TICKS_PER_DAY } from './clock.js';
import { Rng } from './rng.js';
import { World } from './world.js';
import { generateWorld } from './worldgen.js';
import { FacilityStore, type PlacedFacility, type Rotation } from './facility-store.js';
import { Navigation } from './navigation.js';
import { GuestStore, NEED_COUNT, type Guest } from './guest.js';
import { CourseStore, type Course } from './course-store.js';
import type { Vec2 } from './spline.js';

/**
 * 시뮬레이션 루트.
 *
 * 아키텍처 불변식 1: 이 모듈(및 sim/ 전체)은 Phaser·DOM·렌더러를 모른다.
 * 따라서 Node 에서 헤드리스로 그대로 돌아간다 (npm run sim).
 */

/** RNG 스트림 분리용 salt. 서브시스템끼리 난수 소비가 서로를 밀지 않게 한다. */
export const RngStream = {
  Weather: 0x5745_4148,
  Guests: 0x4755_4553,
  Incidents: 0x494e_4344,
} as const;

export interface GameOptions {
  seed: number;
  width?: number;
  height?: number;
}

export interface GameStats {
  tick: number;
  day: number;
  seed: number;
  guests: number;
  facilities: number;
  courses: number;
  avgHappiness: number;
  /** 퇴장 시점 평균 만족도 — 빠지의 실제 품질 척도 (Phase 3 평판의 기반) */
  avgExitHappiness: number;
  departed: number;
  queued: number;
  riding: number;
}

export { TICKS_PER_DAY } from './clock.js';

/** 손님 유입 조절. Phase 3 에서 평판·날씨가 이 값을 움직인다. */
export interface ArrivalTunables {
  /** 몇 tick 마다 한 그룹이 들어오는가 */
  ticksPerGroup: number;
  /** 동시 체류 인원 상한 */
  maxGuests: number;
}

export const DEFAULT_ARRIVALS: ArrivalTunables = {
  ticksPerGroup: 25,
  maxGuests: 300,
};

export interface GameSnapshot {
  seed: number;
  tick: number;
  world: { width: number; height: number; tiles: number[] };
  rng: { weather: number; guest: number; incident: number };
  facilities: PlacedFacility[];
  guests: SerializedGuest[];
  courses: ReturnType<CourseStore['toSnapshot']>;
  /** 유입 설정도 저장한다 — 빠뜨리면 복원 후 손님 수가 달라져 결정론이 깨진다 */
  arrivals: ArrivalTunables;
  /** 퇴장 통계 — 평판의 기반이므로 함께 저장한다 */
  exitStats: { departed: number; happinessSum: number };
}

type SerializedGuest = Omit<Guest, 'needs'> & { needs: number[] };

export class Game {
  readonly seed: number;
  readonly world: World;
  readonly clock = new Clock();

  readonly facilities: FacilityStore;
  readonly nav: Navigation;
  readonly guests: GuestStore;
  readonly courses: CourseStore;

  /** 서브시스템별 독립 스트림 */
  readonly weatherRng: Rng;
  readonly guestRng: Rng;
  readonly incidentRng: Rng;

  arrivals: ArrivalTunables = { ...DEFAULT_ARRIVALS };

  constructor(opts: GameOptions) {
    this.seed = opts.seed;
    this.world = generateWorld({
      seed: opts.seed,
      ...(opts.width !== undefined ? { width: opts.width } : {}),
      ...(opts.height !== undefined ? { height: opts.height } : {}),
    });

    const root = new Rng(opts.seed);
    this.weatherRng = root.fork(RngStream.Weather);
    this.guestRng = root.fork(RngStream.Guests);
    this.incidentRng = root.fork(RngStream.Incidents);

    this.facilities = new FacilityStore(this.world);
    this.nav = new Navigation(this.world, this.facilities);
    this.courses = new CourseStore(this.world, this.facilities);
    this.guests = new GuestStore(this.facilities, this.nav, this.guestRng, undefined, {
      // 코스 매출 집계. Phase 3 의 경제 모듈이 이걸 받아간다.
      onRideSpend: (_g, course, amount) => {
        course.revenue += amount;
      },
    });
    this.guests.setCourses(this.courses);
  }

  // ── 코스 조작 ──

  createCourse(defId: string, points: readonly Vec2[], vehicles = 1): Course | null {
    return this.courses.create(defId, points, vehicles);
  }

  removeCourse(iid: number): boolean {
    return this.courses.remove(iid);
  }

  // ── 시설 조작 (거리장 무효화를 잊지 않도록 여기로 감싼다) ──

  placeFacility(defId: string, x: number, y: number, rot: Rotation = 0): PlacedFacility | null {
    const f = this.facilities.place(defId, x, y, rot);
    if (f) this.nav.markDirty();
    return f;
  }

  removeFacility(iid: number): boolean {
    const ok = this.facilities.remove(iid);
    if (ok) this.nav.markDirty();
    return ok;
  }

  /** 시뮬레이션 1 tick */
  step(): void {
    this.clock.advance(1);

    if (
      this.clock.tick % this.arrivals.ticksPerGroup === 0 &&
      this.guests.count < this.arrivals.maxGuests
    ) {
      this.guests.spawnGroup();
    }

    this.courses.step();
    this.guests.step();
  }

  /** 여러 tick 을 한 번에. 헤드리스 러너·배속용. */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  get day(): number {
    return Math.floor(this.clock.tick / TICKS_PER_DAY);
  }

  stats(): GameStats {
    const s = this.guests.summary();
    return {
      tick: this.clock.tick,
      day: this.day,
      seed: this.seed,
      guests: s.count,
      facilities: this.facilities.count,
      courses: this.courses.count,
      avgHappiness: s.avgHappiness,
      avgExitHappiness: this.guests.avgExitHappiness,
      departed: this.guests.departedCount,
      queued: s.queued,
      riding: s.riding,
    };
  }

  toSnapshot(): GameSnapshot {
    return {
      seed: this.seed,
      tick: this.clock.tick,
      world: {
        width: this.world.width,
        height: this.world.height,
        tiles: Array.from(this.world.tiles),
      },
      rng: {
        weather: this.weatherRng.state,
        guest: this.guestRng.state,
        incident: this.incidentRng.state,
      },
      facilities: this.facilities.toSnapshot(),
      guests: [...this.guests.all].map((g) => ({ ...g, needs: Array.from(g.needs) })),
      courses: this.courses.toSnapshot(),
      arrivals: { ...this.arrivals },
      exitStats: this.guests.exitStats,
    };
  }

  /**
   * 스냅샷에서 복원한다.
   *
   * 지형을 시드로 재생성하지 않고 저장된 타일을 그대로 쓴다 —
   * 나중에 토지 매입·지형 변경이 생겨도 세이브가 깨지지 않게.
   */
  static fromSnapshot(s: GameSnapshot): Game {
    const g = new Game({ seed: s.seed, width: s.world.width, height: s.world.height });
    g.world.tiles.set(s.world.tiles);
    g.clock.tick = s.tick;
    if (s.arrivals) g.arrivals = { ...s.arrivals };
    g.restoreRng(s.rng);
    g.facilities.restore(s.facilities ?? []);
    g.courses.restore(s.courses ?? []);
    g.nav.markDirty();
    g.guests.restoreExitStats(s.exitStats);
    g.guests.restore(
      (s.guests ?? []).map((sg) => {
        const needs = new Float64Array(NEED_COUNT);
        needs.set(sg.needs.slice(0, NEED_COUNT));
        return { ...sg, needs } as Guest;
      }),
    );
    return g;
  }

  private restoreRng(state: GameSnapshot['rng']): void {
    // 객체를 갈아끼우지 않고 상태만 덮어쓴다.
    // GuestStore 가 guestRng 를 이미 참조하고 있어서, 교체하면 옛 객체를 계속 쓰게 된다.
    this.weatherRng.setState(state.weather);
    this.guestRng.setState(state.guest);
    this.incidentRng.setState(state.incident);
  }
}

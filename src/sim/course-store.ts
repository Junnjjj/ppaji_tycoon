import type { World } from './world.js';
import type { FacilityStore } from './facility-store.js';
import { sampleSpline, splineLength, type SplineSample, type Vec2 } from './spline.js';
import {
  computeMetrics,
  crossingFraction,
  requireEquipmentDef,
  validateCourse,
  EMPTY_METRICS,
  type CourseMetrics,
  type CourseValidation,
} from './course.js';

/**
 * 코스 운행 — 장비가 스플라인을 돌고, 선착장에서 손님을 태우고 내린다.
 *
 * 지표(course.ts)가 예측한 처리량이 실제 운행과 일치해야 한다.
 * 어긋나면 플레이어에게 보여준 "처리량 34명/h"가 거짓말이 되므로,
 * 테스트에서 예측치와 실측치를 맞춰본다.
 */

export type VehicleState = 'boarding' | 'running' | 'unloading';

export interface Vehicle {
  /** 코스 진행도 0..1 */
  u: number;
  state: VehicleState;
  /** 현재 상태가 끝나기까지 남은 tick */
  timer: number;
  riders: number;
}

export interface Course {
  iid: number;
  /** 장비 종류 */
  defId: string;
  points: Vec2[];
  /** 연결된 선착장. -1 이면 미연결 */
  dockIid: number;
  fee: number;
  vehicles: Vehicle[];
  /** 대기 중인 손님 수 */
  queue: number;
  /** 누적 탑승객 — 실측 처리량 확인용 */
  served: number;
  /** 누적 매출 */
  revenue: number;

  // ── 파생 (points 가 바뀌면 다시 계산) ──
  samples: SplineSample[];
  length: number;
  metrics: CourseMetrics;
}

/** 하차에 걸리는 tick */
const UNLOAD_TICKS = 8;

export class CourseStore {
  private readonly items = new Map<number, Course>();
  private nextIid = 1;

  constructor(
    private readonly world: World,
    private readonly facilities: FacilityStore,
  ) {}

  get all(): Iterable<Course> {
    return this.items.values();
  }

  get count(): number {
    return this.items.size;
  }

  byIid(iid: number): Course | undefined {
    return this.items.get(iid);
  }

  /** 편집 중인 코스를 미리 검증한다 (배치 전 미리보기용) */
  validate(points: readonly Vec2[], defId: string): CourseValidation {
    return validateCourse(
      points,
      requireEquipmentDef(defId),
      this.world,
      this.facilities,
    );
  }

  /** 편집 중인 코스의 지표를 미리 계산한다 */
  preview(points: readonly Vec2[], defId: string, vehicles: number): CourseMetrics {
    if (points.length < 3) return { ...EMPTY_METRICS };
    const samples = sampleSpline(points);
    return computeMetrics({
      samples,
      def: requireEquipmentDef(defId),
      vehicles,
      crossingFraction: crossingFraction(samples, this.otherSamples(-1)),
    });
  }

  /** 코스를 만든다. 검증에 실패하면 null. */
  create(defId: string, points: readonly Vec2[], vehicles = 1): Course | null {
    const def = requireEquipmentDef(defId);
    const v = validateCourse(points, def, this.world, this.facilities);
    if (!v.ok) return null;

    const course: Course = {
      iid: this.nextIid++,
      defId,
      points: points.map((p) => ({ ...p })),
      dockIid: v.dockIid,
      fee: def.fee,
      vehicles: [],
      queue: 0,
      served: 0,
      revenue: 0,
      samples: [],
      length: 0,
      metrics: { ...EMPTY_METRICS },
    };
    this.items.set(course.iid, course);
    this.setVehicleCount(course.iid, vehicles);
    this.recomputeAll();
    return course;
  }

  remove(iid: number): boolean {
    const ok = this.items.delete(iid);
    if (ok) this.recomputeAll();
    return ok;
  }

  /** 장비 대수 조절 — 처리량 vs 안전의 핵심 다이얼 */
  setVehicleCount(iid: number, n: number): void {
    const c = this.items.get(iid);
    if (!c) return;
    const target = Math.max(0, Math.floor(n));

    while (c.vehicles.length > target) c.vehicles.pop();
    while (c.vehicles.length < target) {
      // 새 장비는 코스에 고르게 흩어 놓는다 (한 뭉치로 몰리지 않게)
      c.vehicles.push({
        u: c.vehicles.length / Math.max(1, target),
        state: 'boarding',
        timer: requireEquipmentDef(c.defId).boardTicks,
        riders: 0,
      });
    }
    this.recompute(c);
  }

  setFee(iid: number, fee: number): void {
    const c = this.items.get(iid);
    if (c) c.fee = Math.max(0, Math.round(fee));
  }

  private otherSamples(exceptIid: number): SplineSample[][] {
    const out: SplineSample[][] = [];
    for (const c of this.items.values()) {
      if (c.iid !== exceptIid && c.samples.length > 0) out.push(c.samples);
    }
    return out;
  }

  private recompute(c: Course): void {
    c.samples = sampleSpline(c.points);
    c.length = splineLength(c.samples);
    c.metrics = computeMetrics({
      samples: c.samples,
      def: requireEquipmentDef(c.defId),
      vehicles: c.vehicles.length,
      crossingFraction: crossingFraction(c.samples, this.otherSamples(c.iid)),
    });
  }

  /** 코스가 추가·제거되면 서로의 교차율이 바뀌므로 전부 다시 계산한다 */
  recomputeAll(): void {
    for (const c of this.items.values()) this.recompute(c);
  }

  // ── 손님 탑승 ──

  /**
   * 지금 탈 수 있는 자리가 있으면 태우고, 이용에 걸릴 tick 을 돌려준다.
   * 자리가 없으면 -1.
   *
   * GuestStore 가 대기 중인 손님마다 호출한다.
   */
  tryBoard(iid: number): number {
    const c = this.items.get(iid);
    if (!c) return -1;
    const def = requireEquipmentDef(c.defId);

    for (const v of c.vehicles) {
      if (v.state !== 'boarding' || v.riders >= def.capacity) continue;
      v.riders++;
      c.served++;
      const travelTicks = c.length / def.speed;
      // 남은 승선 시간 + 주행 + 하차
      return Math.max(1, Math.round(v.timer + travelTicks + UNLOAD_TICKS));
    }
    return -1;
  }

  /** 시뮬레이션 1 tick */
  step(): void {
    for (const c of this.items.values()) {
      const def = requireEquipmentDef(c.defId);
      if (c.length <= 0) continue;
      const travelTicks = c.length / def.speed;

      for (const v of c.vehicles) {
        v.timer--;

        switch (v.state) {
          case 'boarding':
            // 만석이거나 승선 시간이 끝나면 출발.
            // 빈 배로는 나가지 않는다 — 손님이 없으면 계속 기다린다.
            if (v.riders >= def.capacity || (v.timer <= 0 && v.riders > 0)) {
              v.state = 'running';
              v.timer = travelTicks;
              v.u = 0;
            } else if (v.timer <= 0) {
              v.timer = def.boardTicks;
            }
            break;

          case 'running':
            v.u = 1 - Math.max(0, v.timer) / travelTicks;
            if (v.timer <= 0) {
              v.state = 'unloading';
              v.timer = UNLOAD_TICKS;
              v.u = 0;
            }
            break;

          case 'unloading':
            if (v.timer <= 0) {
              v.riders = 0;
              v.state = 'boarding';
              v.timer = def.boardTicks;
            }
            break;
        }
      }
    }
  }

  /** 세이브용 (파생값은 복원 때 다시 계산한다) */
  toSnapshot(): Array<Omit<Course, 'samples' | 'length' | 'metrics'>> {
    return [...this.items.values()].map((c) => ({
      iid: c.iid,
      defId: c.defId,
      points: c.points.map((p) => ({ ...p })),
      dockIid: c.dockIid,
      fee: c.fee,
      vehicles: c.vehicles.map((v) => ({ ...v })),
      queue: c.queue,
      served: c.served,
      revenue: c.revenue,
    }));
  }

  restore(list: ReadonlyArray<Omit<Course, 'samples' | 'length' | 'metrics'>>): void {
    this.items.clear();
    this.nextIid = 1;
    for (const s of list) {
      const c: Course = {
        ...s,
        points: s.points.map((p) => ({ ...p })),
        vehicles: s.vehicles.map((v) => ({ ...v })),
        samples: [],
        length: 0,
        metrics: { ...EMPTY_METRICS },
      };
      this.items.set(c.iid, c);
      this.nextIid = Math.max(this.nextIid, c.iid + 1);
    }
    this.recomputeAll();
  }
}

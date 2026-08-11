import type { Rng } from './rng.js';
import type { NeedKind } from './facility.js';
import { requireFacilityDef } from './facility.js';
import type { FacilityStore, PlacedFacility } from './facility-store.js';
import type { Navigation } from './navigation.js';
import type { Course, CourseStore } from './course-store.js';

/**
 * 손님 — 계획서 §2.5.
 *
 * 통계가 아니라 개체 단위 에이전트다. 이 게임 전체가 "배치가 결과를 바꾼다"를
 * 눈으로 확인하는 데 걸려 있기 때문에, 대기줄과 병목이 연출이 아니라 실제여야 한다.
 *
 * 길찾기는 손님이 하지 않는다. 시설별 거리장(Navigation)에서 다음 한 칸을 읽을 뿐이다 — 손님당 O(1).
 */

export const NEEDS = ['hunger', 'thirst', 'toilet', 'heat', 'rest', 'fun'] as const;
export const NEED_COUNT = NEEDS.length;

const NEED_INDEX: Readonly<Record<NeedKind, number>> = {
  hunger: 0,
  thirst: 1,
  toilet: 2,
  heat: 3,
  rest: 4,
  fun: 5,
};

export type GuestState = 'seeking' | 'queuing' | 'using' | 'riding' | 'leaving' | 'done';

/** 방향 — 스프라이트 선택용 */
export type Facing = 'down' | 'up' | 'left' | 'right';

export interface Guest {
  id: number;
  groupId: number;

  /** 현재 타일 */
  cx: number;
  cy: number;
  /** 다음 타일 (이동 중이 아니면 현재 타일과 같음) */
  nx: number;
  ny: number;
  /** 현재→다음 진행도 0..1. 렌더가 보간에 쓴다. */
  p: number;
  facing: Facing;
  /** 걸음 애니메이션 위상 */
  anim: number;

  state: GuestState;
  /** 향하는 시설 인스턴스. 없으면 -1. 코스를 타러 갈 때는 그 코스의 선착장 */
  targetIid: number;
  /** 타려는 코스. 시설이 목표면 -1 */
  courseIid: number;
  /** using·riding 남은 tick, 또는 queuing 중 남은 인내 tick */
  timer: number;

  palette: number;
  /** 타일/tick */
  speed: number;
  wallet: number;
  /** 0(휴식 선호) ~ 1(스릴 선호) */
  thrillPref: number;
  happiness: number;
  /** 줄 서서 견딜 수 있는 tick */
  patience: number;
  /** 이 손님이 방향을 고를 때 쓰는 편향. 모두가 한 줄로 뭉치지 않게 한다. */
  tieBreak: number;

  needs: Float64Array;
}

/**
 * 밸런싱 손잡이. 헤드리스 러너가 이 값을 바꿔가며 시즌을 돌린다.
 * (계획서 §5.2 — 밸런싱을 눈이 아니라 숫자로)
 */
export interface GuestTunables {
  /** tick 당 욕구 증가량 */
  needGrowth: Readonly<Record<NeedKind, number>>;
  /** 이 값을 넘으면 해소하러 간다 */
  needThreshold: number;
  /** 대기줄 한 명당 매력도 감점 */
  queuePenalty: number;
  /** 거리 한 칸당 매력도 감점 */
  distancePenalty: number;
  /** 욕구가 방치될 때 tick 당 기분 하락 */
  unmetNeedMoodLoss: number;
  /** 기분이 이 아래로 떨어지면 집에 간다 */
  leaveHappiness: number;
  baseSpeed: number;
  basePatience: number;
  startWalletMin: number;
  startWalletMax: number;
}

export const DEFAULT_TUNABLES: GuestTunables = {
  needGrowth: {
    hunger: 0.0012,
    thirst: 0.0022,
    toilet: 0.0009,
    heat: 0.0018,
    rest: 0.0011,
    fun: 0.0030,
  },
  needThreshold: 0.45,
  queuePenalty: 0.06,
  distancePenalty: 0.004,
  unmetNeedMoodLoss: 0.02,
  leaveHappiness: 25,
  baseSpeed: 0.08,
  basePatience: 600,
  startWalletMin: 30_000,
  startWalletMax: 120_000,
};

export interface GuestEvents {
  /** 손님이 요금을 냈다. 경제 모듈이 받는다. */
  onSpend?: (guest: Guest, facility: PlacedFacility, amount: number) => void;
  /** 코스 이용료를 냈다 */
  onRideSpend?: (guest: Guest, course: Course, amount: number) => void;
  onLeave?: (guest: Guest) => void;
}

export class GuestStore {
  private readonly guests = new Map<number, Guest>();
  private nextId = 1;
  private nextGroupId = 1;
  private departed = 0;
  private departedHappinessSum = 0;

  /** 수상 코스. Game 이 배선한다. 없으면 손님은 육지 시설만 이용한다. */
  private courses: CourseStore | null = null;

  constructor(
    private readonly facilities: FacilityStore,
    private readonly nav: Navigation,
    private readonly rng: Rng,
    tunables: GuestTunables | undefined = DEFAULT_TUNABLES,
    private readonly events: GuestEvents = {},
  ) {
    this.tunables = tunables ?? DEFAULT_TUNABLES;
  }

  tunables: GuestTunables;

  setCourses(courses: CourseStore): void {
    this.courses = courses;
  }

  get all(): Iterable<Guest> {
    return this.guests.values();
  }

  get count(): number {
    return this.guests.size;
  }

  /** 입장 게이트. 없으면 손님이 들어올 수 없다. */
  private gate(): PlacedFacility | undefined {
    for (const f of this.facilities.all) {
      if (requireFacilityDef(f.defId).unique && f.defId === 'gate') return f;
    }
    return undefined;
  }

  /** 그룹 하나를 게이트 앞에 들여보낸다. 자리가 없으면 0명. */
  spawnGroup(size?: number): number {
    const gate = this.gate();
    if (!gate) return 0;

    const entrances = this.nav.entrancesOf(gate);
    if (entrances.length === 0) return 0;

    const n = size ?? this.rng.intRange(2, 5);
    const groupId = this.nextGroupId++;
    let spawned = 0;

    for (let i = 0; i < n; i++) {
      const spot = this.rng.pick(entrances);
      const g = this.makeGuest(groupId, spot[0], spot[1]);
      this.guests.set(g.id, g);
      spawned++;
    }
    return spawned;
  }

  private makeGuest(groupId: number, x: number, y: number): Guest {
    const t = this.tunables;
    return {
      id: this.nextId++,
      groupId,
      cx: x,
      cy: y,
      nx: x,
      ny: y,
      p: 0,
      facing: 'down',
      anim: this.rng.next() * 10,
      state: 'seeking',
      targetIid: -1,
      courseIid: -1,
      timer: 0,
      palette: this.rng.int(8),
      speed: t.baseSpeed * this.rng.range(0.8, 1.25),
      wallet: this.rng.intRange(t.startWalletMin, t.startWalletMax),
      thrillPref: this.rng.next(),
      happiness: this.rng.range(60, 85),
      patience: t.basePatience * this.rng.range(0.7, 1.4),
      tieBreak: this.rng.int(4),
      needs: new Float64Array(NEED_COUNT),
    };
  }

  /** 시뮬레이션 1 tick */
  step(): void {
    const t = this.tunables;

    for (const g of this.guests.values()) {
      this.growNeeds(g, t);

      switch (g.state) {
        case 'seeking':
          this.stepSeeking(g, t);
          break;
        case 'queuing':
          this.stepQueuing(g);
          break;
        case 'using':
          this.stepUsing(g);
          break;
        case 'riding':
          this.stepRiding(g);
          break;
        case 'leaving':
          this.stepLeaving(g);
          break;
        case 'done':
          break;
      }
    }

    // 나간 손님 정리
    for (const [id, g] of this.guests) {
      if (g.state === 'done') {
        this.departed++;
        this.departedHappinessSum += g.happiness;
        this.events.onLeave?.(g);
        this.guests.delete(id);
      }
    }
  }

  /**
   * 퇴장 시점 만족도 — 빠지가 실제로 어땠는지의 척도.
   *
   * "현재 손님 평균 만족도"는 오해를 부른다: 할 게 없는 빠지는 손님이 빨리 나가고
   * 새 손님으로 교체되어 평균이 오히려 높게 유지된다. 평판은 나가는 손님이 결정한다.
   * (Phase 3 평판 계산이 이 값을 쓴다)
   */
  get avgExitHappiness(): number {
    return this.departed > 0 ? this.departedHappinessSum / this.departed : 0;
  }

  get departedCount(): number {
    return this.departed;
  }

  /** 퇴장 통계 (세이브용). 빠뜨리면 복원 후 평판 계산이 어긋난다. */
  get exitStats(): { departed: number; happinessSum: number } {
    return { departed: this.departed, happinessSum: this.departedHappinessSum };
  }

  restoreExitStats(s: { departed: number; happinessSum: number } | undefined): void {
    this.departed = s?.departed ?? 0;
    this.departedHappinessSum = s?.happinessSum ?? 0;
  }

  private growNeeds(g: Guest, t: GuestTunables): void {
    let unmet = 0;
    for (let i = 0; i < NEED_COUNT; i++) {
      const kind = NEEDS[i] as NeedKind;
      const v = Math.min(1, (g.needs[i] as number) + t.needGrowth[kind]);
      g.needs[i] = v;
      if (v > 0.85) unmet++;
    }
    if (unmet > 0) {
      g.happiness = Math.max(0, g.happiness - t.unmetNeedMoodLoss * unmet);
    }
  }

  private stepSeeking(g: Guest, t: GuestTunables): void {
    if (g.happiness <= t.leaveHappiness || g.wallet <= 0) {
      g.state = 'leaving';
      g.targetIid = -1;
      return;
    }

    if (g.targetIid === -1) {
      const pick = this.chooseTarget(g, t);
      if (pick.facilityIid === -1) {
        // 갈 곳이 없다 — 제자리에서 서성인다
        this.advance(g, null);
        return;
      }
      g.targetIid = pick.facilityIid;
      g.courseIid = pick.courseIid;
    }

    const field = this.nav.fieldFor(g.targetIid);
    if (!field) {
      // 시설이 사라졌거나 길이 끊겼다
      g.targetIid = -1;
      return;
    }

    if (field.arrived(g.cx, g.cy) && g.p === 0) {
      g.state = 'queuing';
      g.timer = g.patience;
      if (g.courseIid !== -1) {
        const c = this.courses?.byIid(g.courseIid);
        if (c) c.queue++;
        else this.abandonQueue(g, 0);
      } else {
        const f = this.facilities.byIid(g.targetIid);
        if (f) f.queue++;
      }
      return;
    }

    this.advance(g, field.next(g.cx, g.cy, g.tieBreak));
  }

  private stepQueuing(g: Guest): void {
    // ── 코스를 기다리는 중 ──
    if (g.courseIid !== -1) {
      const course = this.courses?.byIid(g.courseIid);
      if (!course) {
        this.abandonQueue(g, 0);
        return;
      }
      const rideTicks = this.courses!.tryBoard(g.courseIid);
      if (rideTicks >= 0) {
        course.queue = Math.max(0, course.queue - 1);
        g.state = 'riding';
        g.timer = rideTicks;
        return;
      }
      g.timer--;
      if (g.timer <= 0) {
        course.queue = Math.max(0, course.queue - 1);
        this.abandonQueue(g, 8);
      }
      return;
    }

    // ── 시설을 기다리는 중 ──
    const f = this.facilities.byIid(g.targetIid);
    if (!f) {
      this.abandonQueue(g, 0);
      return;
    }

    const def = requireFacilityDef(f.defId);
    if (f.inUse < def.capacity) {
      f.queue = Math.max(0, f.queue - 1);
      f.inUse++;
      g.state = 'using';
      g.timer = def.serviceTicks;
      return;
    }

    g.timer--;
    if (g.timer <= 0) {
      // 못 참고 떠난다 — 대기줄이 긴 배치는 여기서 벌을 받는다
      f.queue = Math.max(0, f.queue - 1);
      this.abandonQueue(g, 8);
    }
  }

  private abandonQueue(g: Guest, moodLoss: number): void {
    if (moodLoss > 0) g.happiness = Math.max(0, g.happiness - moodLoss);
    g.state = 'seeking';
    g.targetIid = -1;
    g.courseIid = -1;
  }

  private stepRiding(g: Guest): void {
    g.timer--;
    if (g.timer > 0) return;

    const course = this.courses?.byIid(g.courseIid);
    g.courseIid = -1;
    g.targetIid = -1;
    g.state = 'seeking';
    if (!course) return;

    g.needs[NEED_INDEX.fun] = 0;
    g.needs[NEED_INDEX.heat] = Math.max(0, (g.needs[NEED_INDEX.heat] as number) - 0.5);

    const fee = Math.min(course.fee, g.wallet);
    if (fee > 0) {
      g.wallet -= fee;
      this.events.onRideSpend?.(g, course, fee);
    }

    // 스릴 선호와 맞으면 크게 만족하고, 안 맞으면 멀미로 깎인다.
    // 그래서 "무조건 험한 코스"가 정답이 아니게 된다.
    const m = course.metrics;
    const thrillMatch = 1 - Math.abs(m.thrill / 100 - g.thrillPref);
    const nauseaHit = (m.nausea / 100) * (1 - g.thrillPref) * 26;
    g.happiness = Math.min(100, Math.max(0, g.happiness + 24 * thrillMatch - nauseaHit));
  }

  private stepUsing(g: Guest): void {
    const f = this.facilities.byIid(g.targetIid);
    if (!f) {
      g.state = 'seeking';
      g.targetIid = -1;
      return;
    }

    g.timer--;
    if (g.timer > 0) return;

    const def = requireFacilityDef(f.defId);
    f.inUse = Math.max(0, f.inUse - 1);

    // 욕구 해소
    for (const need of def.needs) {
      g.needs[NEED_INDEX[need]] = 0;
    }

    // 요금
    const fee = Math.min(def.fee, g.wallet);
    if (fee > 0) {
      g.wallet -= fee;
      this.events.onSpend?.(g, f, fee);
    }

    // 만족: 기본 기여 + 스릴 선호 일치도
    const thrillMatch = 1 - Math.abs(def.thrill / 100 - g.thrillPref);
    g.happiness = Math.min(100, g.happiness + def.satisfaction * (0.6 + 0.4 * thrillMatch));

    g.state = 'seeking';
    g.targetIid = -1;
  }

  private stepLeaving(g: Guest): void {
    const gate = this.gate();
    if (!gate) {
      g.state = 'done';
      return;
    }
    const field = this.nav.fieldFor(gate.iid);
    if (!field) {
      g.state = 'done';
      return;
    }
    if (field.arrived(g.cx, g.cy) && g.p === 0) {
      g.state = 'done';
      return;
    }
    this.advance(g, field.next(g.cx, g.cy, g.tieBreak));
  }

  /**
   * 다음 타일로 한 걸음. next 가 null 이면 제자리.
   * 타일 사이 진행도 p 를 렌더가 보간에 쓴다.
   */
  private advance(g: Guest, next: readonly [number, number] | null): void {
    if (g.p === 0) {
      if (!next) return;
      g.nx = next[0];
      g.ny = next[1];
      const dx = g.nx - g.cx;
      const dy = g.ny - g.cy;
      if (dx !== 0) g.facing = dx > 0 ? 'right' : 'left';
      else if (dy !== 0) g.facing = dy > 0 ? 'down' : 'up';
    }

    g.p += g.speed;
    g.anim += g.speed * 6;

    if (g.p >= 1) {
      g.cx = g.nx;
      g.cy = g.ny;
      g.p = 0;
    }
  }

  /**
   * 갈 시설을 고른다.
   *
   * 매력도 = 욕구 절박함 − 대기줄 − 거리 − 지갑 부담
   * 대기줄과 거리가 점수를 깎기 때문에, 배치가 나쁘면 손님이 실제로 다른 데로 간다.
   */
  private chooseTarget(
    g: Guest,
    t: GuestTunables,
  ): { facilityIid: number; courseIid: number } {
    let best = { facilityIid: -1, courseIid: -1 };
    let bestScore = 0;

    // ── 육지·수상 시설 ──
    for (const f of this.facilities.all) {
      const def = requireFacilityDef(f.defId);
      if (def.needs.length === 0) continue;
      if (def.fee > g.wallet) continue;

      const field = this.nav.fieldFor(f.iid);
      if (!field) continue;
      const dist = field.distAt(g.cx, g.cy);
      if (dist < 0) continue;

      // 이 시설이 풀어주는 욕구 중 가장 절박한 것
      let urgency = 0;
      for (const need of def.needs) {
        urgency = Math.max(urgency, g.needs[NEED_INDEX[need]] as number);
      }
      if (urgency < t.needThreshold) continue;

      const thrillMatch = 1 - Math.abs(def.thrill / 100 - g.thrillPref);
      const score =
        urgency * 100 +
        thrillMatch * 15 -
        f.queue * (t.queuePenalty * 100) -
        dist * (t.distancePenalty * 100);

      if (score > bestScore) {
        bestScore = score;
        best = { facilityIid: f.iid, courseIid: -1 };
      }
    }

    // ── 수상 코스 ──
    // 손님은 코스가 아니라 그 코스의 선착장으로 걸어간다.
    const funNeed = g.needs[NEED_INDEX.fun] as number;
    if (this.courses && funNeed >= t.needThreshold) {
      for (const c of this.courses.all) {
        if (c.vehicles.length === 0) continue;
        if (c.fee > g.wallet) continue;
        if (c.dockIid === -1) continue;

        const field = this.nav.fieldFor(c.dockIid);
        if (!field) continue;
        const dist = field.distAt(g.cx, g.cy);
        if (dist < 0) continue;

        // 스릴 취향이 안 맞으면 애초에 타러 가지 않는다
        const thrillMatch = 1 - Math.abs(c.metrics.thrill / 100 - g.thrillPref);
        if (thrillMatch < 0.35) continue;

        const score =
          funNeed * 100 +
          thrillMatch * 45 -
          (c.metrics.nausea / 100) * (1 - g.thrillPref) * 40 -
          c.queue * (t.queuePenalty * 100) -
          dist * (t.distancePenalty * 100);

        if (score > bestScore) {
          bestScore = score;
          best = { facilityIid: c.dockIid, courseIid: c.iid };
        }
      }
    }

    return best;
  }

  /** 통계 — 헤드리스 리포트와 HUD 용 */
  summary(): {
    count: number;
    avgHappiness: number;
    queued: number;
    using: number;
    riding: number;
  } {
    let sum = 0;
    let queued = 0;
    let using = 0;
    let riding = 0;
    for (const g of this.guests.values()) {
      sum += g.happiness;
      if (g.state === 'queuing') queued++;
      else if (g.state === 'using') using++;
      else if (g.state === 'riding') riding++;
    }
    return {
      count: this.guests.size,
      avgHappiness: this.guests.size > 0 ? sum / this.guests.size : 0,
      queued,
      using,
      riding,
    };
  }

  clear(): void {
    this.guests.clear();
  }

  /** 세이브 복원. id 카운터를 이어받아 새 손님과 번호가 충돌하지 않게 한다. */
  restore(list: readonly Guest[]): void {
    this.guests.clear();
    this.nextId = 1;
    this.nextGroupId = 1;
    for (const g of list) {
      this.guests.set(g.id, g);
      this.nextId = Math.max(this.nextId, g.id + 1);
      this.nextGroupId = Math.max(this.nextGroupId, g.groupId + 1);
    }
  }
}

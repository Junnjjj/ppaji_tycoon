/**
 * 직원 (G20) — 카이로의 「사람을 쓴다」: 고용비를 내고 월급을 매일 낸다. 레벨 1~5(하루 EXP +1, 8마다 승급), 효과 +10%/단.
 * 직원은 판 위를 걸어 다닌다(보이는 것이 중요하다) — 위치는 결정론 난수(rng.world)로 잔디·포장 위를 떠돈다.
 * 청결은 파크 상태(0~100): 손님이 더럽히고 청소부가 되돌린다. 낮으면 만족 배율이 준다.
 */
import staffJson from '../data/staff.json';
import type { Rng } from './rng.js';

export interface StaffRole { id: string; name: string; salary: number; hireCost: number; palette: number; desc: string; effect: { hpMul?: number; satMul?: number; clean?: number; photoMul?: number; likeMul?: number; menuMul?: number } }
export interface Staff { uid: number; role: string; name: string; level: number; exp: number; i: number; j: number; fromI: number; fromJ: number; progress: number; facing: 0 | 1 | 2 | 3; rest: number }
export interface StaffSnapshot { nextUid: number; list: Staff[]; cleanliness: number }

const DATA = staffJson as { roles: StaffRole[]; names: string[] };
export const STAFF_ROLES: ReadonlyMap<string, StaffRole> = new Map(DATA.roles.map((r) => [r.id, r]));
export const STAFF_MAX_LEVEL = 5;
export const STAFF_EXP_PER_LEVEL = 8;
export const MAX_STAFF = 12;

export class StaffStore {
  private list: Staff[] = [];
  private nextUid = 1;
  /** 청결 0..100 — 시작 100 */
  cleanliness = 100;

  constructor(private readonly rng: Rng, private readonly walkable: (i: number, j: number) => boolean, private readonly land: () => { i0: number; j0: number; w: number; h: number }) {}

  get all(): readonly Staff[] { return this.list; }

  roleOf(s: Staff): StaffRole { return STAFF_ROLES.get(s.role) as StaffRole; }
  levelMul(s: Staff): number { return 1 + 0.1 * (s.level - 1); }

  hire(roleId: string, at: { i: number; j: number }): Staff | null {
    const role = STAFF_ROLES.get(roleId);
    if (!role || this.list.length >= MAX_STAFF) return null;
    const s: Staff = { uid: this.nextUid++, role: roleId, name: DATA.names[this.rng.int(DATA.names.length)] ?? '직원', level: 1, exp: 0, i: at.i, j: at.j, fromI: at.i, fromJ: at.j, progress: 1, facing: 3, rest: 0 };
    this.list.push(s);
    return s;
  }

  fire(uid: number): boolean {
    const at = this.list.findIndex((s) => s.uid === uid);
    if (at < 0) return false;
    this.list.splice(at, 1);
    return true;
  }

  /** 역할별 효과 합 — 여럿이면 곱한다 (배율) / 더한다 (청결) */
  mul(key: 'hpMul' | 'satMul' | 'photoMul' | 'likeMul' | 'menuMul'): number {
    let m = 1;
    for (const s of this.list) {
      const e = this.roleOf(s).effect[key];
      if (e === undefined) continue;
      m *= 1 + (e - 1) * this.levelMul(s);
    }
    return m;
  }
  cleanPerDay(): number {
    return this.list.reduce((n, s) => n + (this.roleOf(s).effect.clean ?? 0) * this.levelMul(s), 0);
  }
  salaryPerDay(): number {
    return this.list.reduce((n, s) => n + this.roleOf(s).salary, 0);
  }
  /** 청결이 만족에 주는 배율 — 100 이면 1, 0 이면 0.6 */
  cleanSatMul(): number {
    return 0.6 + 0.4 * (this.cleanliness / 100);
  }

  /** 하루 마감 — 월급(부르는 쪽이 뺀다)·EXP·청결 */
  closeDay(visitors: number): { salary: number; leveled: Staff[] } {
    const leveled: Staff[] = [];
    for (const s of this.list) {
      s.exp++;
      if (s.level < STAFF_MAX_LEVEL && s.exp >= STAFF_EXP_PER_LEVEL * s.level) { s.level++; leveled.push(s); }
    }
    this.cleanliness = Math.max(0, Math.min(100, this.cleanliness - visitors * 0.15 + this.cleanPerDay() + 4));
    return { salary: this.salaryPerDay(), leveled };
  }

  /** 걸음 — 4tick 에 한 칸, 잠깐 쉰다. 결정론(rng.world) */
  step(): void {
    for (const s of this.list) {
      if (s.progress < 1) { s.progress = Math.min(1, s.progress + 0.25); continue; }
      if (s.rest > 0) { s.rest--; continue; }
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
      const [di, dj] = dirs[this.rng.int(4)] as readonly [number, number];
      const l = this.land();
      const ni = s.i + di; const nj = s.j + dj;
      if (ni < l.i0 || nj < l.j0 || ni >= l.i0 + l.w || nj >= l.j0 + l.h || !this.walkable(ni, nj)) { s.rest = 2; continue; }
      s.fromI = s.i; s.fromJ = s.j; s.i = ni; s.j = nj; s.progress = 0;
      s.facing = di === 1 ? 0 : di === -1 ? 2 : dj === 1 ? 3 : 1;
      if (this.rng.chance(0.3)) s.rest = 4;
    }
  }

  toSnapshot(): StaffSnapshot { return { nextUid: this.nextUid, list: this.list.map((s) => ({ ...s })), cleanliness: this.cleanliness }; }
  fromSnapshot(s: StaffSnapshot | undefined): void {
    if (!s) { this.list = []; this.nextUid = 1; this.cleanliness = 100; return; }
    this.nextUid = s.nextUid; this.list = s.list.map((x) => ({ ...x })); this.cleanliness = s.cleanliness;
  }
}

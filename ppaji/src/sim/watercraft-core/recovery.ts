/**
 * 물길 찾기 + 고정 tick 복귀 — 에셋 워크트리의 `runtime/core/recovery.mjs` 를 그대로 옮겼다.
 * 세계 기하(물인가·선착장이 어디인가)는 **호스트가 준다** (`WaterWorld`).
 *
 * ⚠ 좌표는 world 축이다 — `gameToWorld`/`worldToGame` 로만 드나든다 (game +J = world −Y).
 * ⚠ 텔레포트가 없다: 손님은 실제 물 위를 헤엄쳐 선착장에 닿고 거기서 뭍으로 오른다.
 */

export type Vec3 = [number, number, number];

export interface Dock {
  id: string;
  active?: boolean;
  water: Vec3;
  land: Vec3;
}

export interface Boat {
  id: string;
  position: Vec3;
  velocity?: [number, number];
  radius: number;
}

export interface WaterWorld {
  bounds: [number, number, number, number];
  cellSize: number;
  revision: string | number;
  isWater: (x: number, y: number) => boolean;
  docks: Dock[];
  boatsAt?: (time: number) => Boat[];
}

export type RecoveryStatus = 'air' | 'splash' | 'swim' | 'traffic-wait' | 'rescue-wait' | 'climb' | 'done';

export interface RecoveryState {
  version: 1;
  guestId: string;
  start: Vec3;
  landing: Vec3;
  originDockId: string;
  eventTime: number;
  injured: boolean;
  swimSpeed: number;
  time: number;
  carry: number;
  position: Vec3;
  heading: number;
  status: RecoveryStatus;
  pose: string;
  path: Vec3[] | null;
  pathIndex: number;
  targetDock: string | null;
  revision: string | number | null;
  climbAge: number;
  retryAt: number;
  climbOrigin?: Vec3;
  nextAction?: 'infirmary' | 'resume';
}

/** 복귀는 30Hz 고정 걸음으로 적분한다 — 프레임률·배속이 결과를 바꾸지 않는다 */
export const STEP = 1 / 30;

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: Vec3, b: Vec3, u: number): Vec3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const valid = (p: unknown): p is Vec3 => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v));

/** 두 점 사이가 **전부** 물인가 — 벽을 가로지르는 지름길을 구조적으로 막는다 */
export function segmentWater(a: Vec3, b: Vec3, world: WaterWorld): boolean {
  const steps = Math.max(1, Math.ceil(dist(a, b) / (world.cellSize / 3)));
  for (let k = 0; k <= steps; k++) {
    const p = lerp(a, b, k / steps);
    if (!world.isWater(p[0], p[1])) return false;
  }
  return true;
}

export function waterPath(start: Vec3, goal: Vec3, world: WaterWorld): Vec3[] | null {
  const h = world.cellSize;
  const [x0, y0, x1, y1] = world.bounds;
  if (![h, x0, y0, x1, y1].every(Number.isFinite) || !(h > 0) || !(x1 > x0 && y1 > y0)) throw new Error('Finite bounded water grid required');
  const cols = Math.ceil((x1 - x0) / h), rows = Math.ceil((y1 - y0) / h);
  if (cols * rows > 100000) throw new Error('Water grid exceeds 100000 cells');
  const cell = (p: Vec3): [number, number] => [Math.floor((p[0] - x0) / h), Math.floor((p[1] - y0) / h)];
  const center = ([x, y]: [number, number]): Vec3 => [x0 + (x + 0.5) * h, y0 + (y + 0.5) * h, 0];
  const key = ([x, y]: [number, number]): number => y * cols + x;
  const inside = ([x, y]: [number, number]): boolean => x >= 0 && y >= 0 && x < cols && y < rows;
  const first = cell(start), last = cell(goal);
  if (!inside(first) || !inside(last) || !world.isWater(start[0], start[1]) || !world.isWater(goal[0], goal[1]) || !segmentWater(start, center(first), world) || !segmentWater(center(last), goal, world)) return null;
  const queue: [number, number][] = [first];
  const parents = new Map<number, [number, number] | null>([[key(first), null]]);
  let found = false;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head] as [number, number];
    if (key(c) === key(last)) { found = true; break; }
    for (const d of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const n: [number, number] = [c[0] + d[0], c[1] + d[1]];
      if (!inside(n) || parents.has(key(n)) || !segmentWater(center(c), center(n), world)) continue;
      parents.set(key(n), c);
      queue.push(n);
    }
  }
  if (!found) return null;
  const rev: Vec3[] = [];
  let c: [number, number] | null | undefined = last;
  while (c) { rev.push(center(c)); c = parents.get(key(c)); }
  const raw: Vec3[] = [start, ...rev.reverse(), goal];
  // 일직선으로 이어진 중간 칸만 지운다 — 벽을 가로지르는 지름길은 절대 만들지 않는다.
  const out: Vec3[] = [raw[0] as Vec3];
  for (let i = 1; i < raw.length - 1; i++) {
    const a = out[out.length - 1] as Vec3, b = raw[i] as Vec3, cc = raw[i + 1] as Vec3;
    if (Math.abs((b[0] - a[0]) * (cc[1] - b[1]) - (b[1] - a[1]) * (cc[0] - b[0])) < 1e-8 && segmentWater(a, cc, world)) continue;
    out.push(b);
  }
  out.push(goal);
  return out;
}

/** 출발 선착장 우선 → 물길이 짧은 순 → id. 결정론이다 */
function chooseDock(state: RecoveryState, world: WaterWorld): { dock: Dock; path: Vec3[] } | undefined {
  const options = world.docks
    .filter((d) => d.active !== false)
    .map((d) => ({ dock: d, path: waterPath(state.position, d.water, world) }))
    .filter((x): x is { dock: Dock; path: Vec3[] } => x.path !== null);
  const len = (path: Vec3[]): number => path.reduce((n, p, i) => n + (i ? dist(p, path[i - 1] as Vec3) : 0), 0);
  options.sort((a, b) => Number(b.dock.id === state.originDockId) - Number(a.dock.id === state.originDockId) || len(a.path) - len(b.path) || String(a.dock.id).localeCompare(String(b.dock.id)));
  return options[0];
}

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return dist(p, [a[0] + u * dx, a[1] + u * dy, 0]);
}

export function createRecovery({ guestId, start, landing, originDockId, eventTime = 0, injured = false, swimSpeed = 0.8 }: { guestId: string; start: Vec3; landing: Vec3; originDockId: string; eventTime?: number; injured?: boolean; swimSpeed?: number }): RecoveryState {
  if (!guestId || !valid(start) || !valid(landing) || !(swimSpeed > 0) || !Number.isFinite(eventTime)) throw new TypeError('Invalid recovery');
  return { version: 1, guestId, start: [...start], landing: [...landing], originDockId, eventTime, injured, swimSpeed, time: 0, carry: 0, position: [...start], heading: 0, status: 'air', pose: 'jump', path: null, pathIndex: 1, targetDock: null, revision: null, climbAge: 0, retryAt: 0 };
}

export function restoreRecovery(snapshot: RecoveryState): RecoveryState {
  if (snapshot.version !== 1 || !valid(snapshot.position) || !Number.isFinite(snapshot.time) || !Number.isFinite(snapshot.carry)) throw new Error('Invalid recovery snapshot');
  return structuredClone(snapshot);
}

export function advanceRecovery(state: RecoveryState, dt: number, world: WaterWorld): RecoveryState {
  if (!Number.isFinite(dt) || dt < 0 || dt > 60) throw new RangeError('Recovery dt must be 0..60');
  state.carry += dt;
  while (state.carry + 1e-9 >= STEP) {
    state.carry = Math.max(0, state.carry - STEP);
    state.time += STEP;
    const t = state.time;
    if (state.status === 'done') continue;
    if (t < 0.8) { state.status = 'air'; state.pose = 'jump'; state.position = lerp(state.start, state.landing, t / 0.8); state.position[2] += 0.65 * Math.sin((Math.PI * t) / 0.8); continue; }
    if (t < 1.25) { state.status = 'splash'; state.pose = 'swim'; state.position = [...state.landing]; continue; }
    if (state.status === 'air' || state.status === 'splash') { state.position = [...state.landing]; state.status = 'swim'; state.pose = 'swim'; }
    const dock = world.docks.find((d) => d.id === state.targetDock && d.active !== false);
    if (state.status === 'climb' && dock) {
      state.climbAge += STEP;
      const u = Math.min(1, state.climbAge / 1.2);
      state.position = lerp(dock.water, dock.land, u);
      state.pose = u < 1 ? 'walk' : 'idle';
      if (u === 1) { state.status = 'done'; state.nextAction = state.injured ? 'infirmary' : 'resume'; }
      continue;
    }
    if (state.status === 'climb' && !dock) { state.status = 'swim'; state.pose = 'swim'; state.path = null; }
    if (!state.path || !dock || world.revision !== state.revision) {
      if (t < state.retryAt && world.revision === state.revision) continue;
      const chosen = chooseDock(state, world);
      state.revision = world.revision;
      if (!chosen) { state.status = 'rescue-wait'; state.pose = 'swim'; state.path = null; state.retryAt = t + 1; continue; }
      state.targetDock = chosen.dock.id;
      state.path = chosen.path;
      state.pathIndex = 1;
      state.status = 'swim';
      state.retryAt = 0;
    }
    const goal = state.path[state.pathIndex];
    if (!goal) { state.status = 'climb'; state.climbAge = 0; state.climbOrigin = [...state.position]; continue; }
    const length = dist(state.position, goal);
    const next: Vec3 = length < 1e-9 ? [...goal] : lerp(state.position, goal, Math.min(1, (state.swimSpeed * STEP) / length));
    if (!segmentWater(state.position, next, world)) { state.path = null; continue; }
    const boats = world.boatsAt?.(state.eventTime + t) ?? [];
    if (boats.some((b) => segmentDistance(b.position, state.position, next) < b.radius + 0.35)) { state.status = 'traffic-wait'; state.pose = 'swim'; continue; }
    state.status = 'swim';
    state.heading = Math.atan2(goal[1] - state.position[1], goal[0] - state.position[0]);
    state.position = next;
    state.pose = 'swim';
    if (dist(next, goal) < 1e-7) state.pathIndex++;
  }
  return state;
}

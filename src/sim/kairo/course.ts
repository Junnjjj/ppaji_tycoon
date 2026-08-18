import rawCourses from '../../data/kairo-courses.json' with { type: 'json' };
import rawEquipment from '../../data/kairo-equipment.json' with { type: 'json' };
import { sampleSpline, splineLength, type Vec2, type SplineSample } from '../spline.js';
import { computeMetrics, type CourseMetrics } from '../course.js';
import type { KairoTerrain } from './terrain.js';

/**
 * 수상 코스 — 스펙 §7. **여섯 동사 중 "코스를 그린다".**
 *
 * ## 왜 프리셋인가
 *
 * v1 은 자유 스플라인(탭으로 점 찍기), v3 초안은 조각 8종 조합이었다. 둘 다 폰에서
 * 탭이 너무 많았다 (조각 방식 10~15회). **프리셋 탭 1번 + 핸들 2~4개 조정 + 확정 = 5회.**
 *
 * 깊이는 다른 데서 온다: **프리셋 6 × 장비 19 = 114 조합의 적합도** (§7.8).
 * 적합도가 없으면 "왕복=처리량, 급선회=스릴"을 파악한 순간 코스가 끝난다.
 *
 * ## 스플라인·곡률 수학은 **그대로 쓴다**
 *
 * `src/sim/spline.ts` 와 `src/sim/course.ts` 의 `computeMetrics` 는 v1 에서 이미 구현·검증했고
 * 스펙 §7.6 공식 그대로다. 폐기된 것은 **조작 방식**이지 수학이 아니다 — 다시 짜면
 * 검증된 것을 버리고 같은 버그를 다시 만든다.
 */

export type FitRating = 'best' | 'ok' | 'poor' | 'no';

export interface PresetDef {
  id: string;
  name: string;
  /** 핸들(터닝포인트) 개수 */
  handles: number;
  /** 형태가 주는 기본 스릴 */
  thrillBase: number;
  /** 이 형태를 놓으려면 필요한 물 타일 수 */
  waterNeed: number;
  /** 열리는 등급 */
  grade: number;
  shape: 'out-and-back' | 'loop' | 'cross' | 'zigzag' | 'hairpin';
  desc: string;
}

export interface CourseEquipment {
  id: string;
  name: string;
  kind: 'tow' | 'power';
  sprite: string;
  speed: number;
  capacity: number;
  boardTicks: number;
  fee: number;
  vehicleCost: number;
  upkeep: number;
  /** 장비의 스릴 배율 (§7.4 스릴계수) */
  thrillCoef: number;
  thrillBase: number;
  safeCurvature: number;
  desc: string;
}

interface FitEffect {
  thrill: number;
  satisfaction: number;
}

const COURSE_DATA = rawCourses as unknown as {
  presets: PresetDef[];
  fit: Record<string, Record<string, FitRating>>;
  effects: Record<string, FitEffect | null>;
};

export const PRESETS: readonly PresetDef[] = COURSE_DATA.presets;
export const COURSE_EQUIPMENT: readonly CourseEquipment[] = (
  rawEquipment as unknown as { equipment: CourseEquipment[] }
).equipment;

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
const EQUIP_BY_ID = new Map(COURSE_EQUIPMENT.map((e) => [e.id, e]));

export function presetDef(id: string): PresetDef | undefined {
  return PRESET_BY_ID.get(id);
}

export function courseEquipment(id: string): CourseEquipment | undefined {
  return EQUIP_BY_ID.get(id);
}

/** 장비 × 프리셋 적합도. 표에 없으면 '적합'으로 본다 (새 장비가 조용히 막히지 않게) */
export function fitOf(equipId: string, presetId: string): FitRating {
  return COURSE_DATA.fit[equipId]?.[presetId] ?? 'ok';
}

export function fitEffect(rating: FitRating): FitEffect | null {
  return COURSE_DATA.effects[rating] ?? null;
}

/** 그 조합을 아예 못 고르는가 */
export function fitBlocked(equipId: string, presetId: string): boolean {
  return fitOf(equipId, presetId) === 'no';
}

/**
 * 선착장 후보 — **잔교 하나가 후보 하나다** (K33).
 *
 * ## 왜 필요했나 (실측)
 *
 * 지금까지 코스의 시작점은 `main.ts` 가 "물 위/밟고 지나가는 **첫 시설**"을 집어서 줬다.
 * 플레이어가 고를 수 없었고, 뻗는 방향은 `{x:0, y:1}` 로 **하드코딩**돼 있었다 —
 * 물이 +j 쪽이 아닌 맵에서는 코스가 육지로 뻗는다.
 *
 * ## 왜 묶나
 *
 * 데크는 **칸 단위 시설**이다. 3칸짜리 잔교 하나가 후보 3개로 나오면 고르는 의미가 없다.
 * 4-이웃으로 묶어 잔교 하나를 후보 하나로 만든다.
 *
 * ## `tip` 과 `dir`
 *
 * `tip` 은 **게이트에서 가장 먼 칸** — 잔교 끝이고, 코스는 거기서 시작한다.
 * `dir` 은 뭍쪽 끝(게이트에서 가장 가까운 칸)에서 `tip` 으로 향하는 방향이다.
 * 잔교가 뻗은 쪽이 곧 물이므로, 이게 `defaultHandles` 의 하드코딩을 대신한다.
 * 한 칸짜리 잔교는 방향을 알 수 없어 게이트 반대쪽을 쓴다.
 *
 * 순수 함수다 — 격자도 지형도 안 본다. 데크 좌표 목록과 게이트만 받는다.
 */
export interface DockChoice {
  /** 잔교 끝 — 코스 시작점 */
  tip: Vec2;
  /** 뭍 → 끝 방향 (정규화 안 함. `defaultHandles` 가 정규화한다) */
  dir: Vec2;
  /** 이 잔교의 칸 수 — UI 가 "3칸" 처럼 보여준다 */
  tiles: number;
}

export function dockCandidates(decks: readonly Vec2[], gate: Vec2): DockChoice[] {
  if (decks.length === 0) return [];

  const key = (v: Vec2): string => `${v.x},${v.y}`;
  const pool = new Map<string, Vec2>();
  for (const d of decks) pool.set(key(d), { x: d.x, y: d.y });

  const d2 = (v: Vec2): number => (v.x - gate.x) ** 2 + (v.y - gate.y) ** 2;

  const out: DockChoice[] = [];
  const seen = new Set<string>();
  /*
   * ⚠ 순회 순서를 `decks` 그대로 쓴다 — 입력이 결정론적이면 출력도 결정론적이다.
   * `pool` 의 삽입 순서에 기대면 중복 좌표가 섞였을 때 갈린다.
   */
  for (const start of decks) {
    if (seen.has(key(start))) continue;
    const group: Vec2[] = [];
    const stack: Vec2[] = [start];
    seen.add(key(start));
    while (stack.length > 0) {
      const c = stack.pop() as Vec2;
      group.push(c);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = { x: c.x + dx, y: c.y + dy };
        const k = key(n);
        if (!pool.has(k) || seen.has(k)) continue;
        seen.add(k);
        stack.push(n);
      }
    }

    let tip = group[0] as Vec2;
    let root = group[0] as Vec2;
    for (const g of group) {
      if (d2(g) > d2(tip)) tip = g;
      if (d2(g) < d2(root)) root = g;
    }
    // 한 칸짜리면 뻗은 방향이 없다 — 게이트 반대쪽으로 나간다
    const dir =
      tip.x === root.x && tip.y === root.y
        ? { x: tip.x - gate.x, y: tip.y - gate.y }
        : { x: tip.x - root.x, y: tip.y - root.y };
    out.push({
      tip: { ...tip },
      dir: dir.x === 0 && dir.y === 0 ? { x: 0, y: 1 } : dir,
      tiles: group.length,
    });
  }

  // 게이트에서 가까운 잔교 순 — 기본 선택이 곧 첫 번째다
  out.sort((a, b) => d2(a.tip) - d2(b.tip) || a.tip.x - b.tip.x || a.tip.y - b.tip.y);
  return out;
}

/**
 * 프리셋의 기본 핸들 배치. 선착장(`dock`)을 기준으로 물 쪽(`dir`)으로 펼친다.
 *
 * 여기서 나온 점은 **제안**이다 — 플레이어가 끌어 옮긴다. 그래서 유효하지 않은 자리에
 * 놓여도 되고, `validate` 가 판정한다. 처음부터 유효한 자리만 주려 하면 좁은 강에서
 * 프리셋이 통째로 안 나오고, 플레이어는 이유를 모른다.
 */
export function defaultHandles(preset: PresetDef, dock: Vec2, dir: Vec2, span = 10): Vec2[] {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const f = { x: dir.x / len, y: dir.y / len }; // 앞
  const r = { x: -f.y, y: f.x }; // 오른쪽
  const at = (fwd: number, side: number): Vec2 => ({
    x: dock.x + f.x * fwd + r.x * side,
    y: dock.y + f.y * fwd + r.y * side,
  });

  switch (preset.shape) {
    case 'out-and-back':
      return [at(span * 0.6, 0), at(span * 1.4, 0)];
    case 'loop':
      return preset.id === 'ellipse'
        ? [at(span * 0.8, span * 0.5), at(span * 2.0, 0), at(span * 0.8, -span * 0.5)]
        : [at(span * 0.7, span * 0.6), at(span * 1.5, 0), at(span * 0.7, -span * 0.6)];
    case 'cross':
      return [
        at(span * 0.6, span * 0.6),
        at(span * 1.6, -span * 0.6),
        at(span * 1.6, span * 0.6),
        at(span * 0.6, -span * 0.6),
      ];
    case 'zigzag':
      return [
        at(span * 0.5, span * 0.7),
        at(span * 1.0, -span * 0.7),
        at(span * 1.5, span * 0.7),
        at(span * 2.0, -span * 0.7),
      ];
    case 'hairpin':
      return [
        at(span * 0.5, span * 0.35),
        at(span * 0.9, -span * 0.35),
        at(span * 0.6, -span * 0.7),
        at(span * 0.3, -span * 0.3),
      ];
  }
}

export type CourseIssueKind =
  | 'not-water'
  | 'too-narrow'
  | 'far-from-dock'
  | 'blocked-combo'
  | 'locked-preset'
  | 'no-equipment';

export const COURSE_ISSUE_TEXT: Record<CourseIssueKind, string> = {
  'not-water': '물 위가 아닙니다',
  'too-narrow': '이 형태를 놓기엔 수면이 좁습니다',
  'far-from-dock': '선착장에서 너무 멉니다',
  'blocked-combo': '이 장비로는 이 형태를 못 탑니다',
  'locked-preset': '아직 안 열린 형태입니다',
  'no-equipment': '장비를 고르세요',
};

/** 선착장에서 코스 시작점까지 허용 거리 (§7.7 "3타일 이내"를 격자 단위로) */
export const DOCK_REACH_TILES = 4;

/** 필요 수면을 잴 때 코스 경계 상자에 두는 여유 (타일) */
export const WATER_MARGIN = 3;

export interface CourseValidation {
  ok: boolean;
  issues: CourseIssueKind[];
  /** 유효하지 않은 핸들 번호 — UI 가 빨갛게 칠한다 */
  badHandles: number[];
  /** 코스 주변의 물 타일 수 */
  waterTiles: number;
}

/**
 * 코스 판정. **핸들별로** 무엇이 잘못됐는지 돌려준다 — "안 됩니다"만 주면 플레이어가
 * 어느 핸들을 옮겨야 하는지 모른다 (§7.3 "핸들이 빨개지고 지표에 사유 표시").
 */
export function validateCourse(
  terrain: KairoTerrain,
  handles: readonly Vec2[],
  dock: Vec2,
  preset: PresetDef,
  equipId: string | null,
  grade: number,
): CourseValidation {
  const issues: CourseIssueKind[] = [];
  const badHandles: number[] = [];

  if (equipId === null) issues.push('no-equipment');
  else if (fitBlocked(equipId, preset.id)) issues.push('blocked-combo');
  if (grade < preset.grade) issues.push('locked-preset');

  for (let k = 0; k < handles.length; k++) {
    const h = handles[k] as Vec2;
    const i = Math.round(h.x);
    const j = Math.round(h.y);
    if (!terrain.isWater(i, j)) badHandles.push(k);
  }
  if (badHandles.length > 0) issues.push('not-water');

  // 선착장 근접 — 가장 가까운 핸들 기준
  const nearest = handles.reduce(
    (best, h) => Math.min(best, Math.hypot(h.x - dock.x, h.y - dock.y)),
    Infinity,
  );
  if (nearest > DOCK_REACH_TILES + 8) issues.push('far-from-dock');

  /*
   * 수면 넓이 — 코스 경계 상자 **주변**의 물 타일 수.
   *
   * ⚠ 여유(`WATER_MARGIN`) 없이 재면 안 된다. 왕복처럼 **직선인 코스는 경계 상자가 선**이라
   * 물이 거의 안 잡히고, 넓은 호수 한가운데서도 "수면이 좁다"가 나온다 (실측: 봇이 코스를
   * 한 개도 못 놓았다). 필요 수면이 묻는 것은 "이 형태를 돌릴 만한 물이 **주변에** 있나"다.
   */
  const xs = handles.map((h) => h.x).concat(dock.x);
  const ys = handles.map((h) => h.y).concat(dock.y);
  const i0 = Math.max(0, Math.floor(Math.min(...xs)) - WATER_MARGIN);
  const i1 = Math.min(terrain.width - 1, Math.ceil(Math.max(...xs)) + WATER_MARGIN);
  const j0 = Math.max(0, Math.floor(Math.min(...ys)) - WATER_MARGIN);
  const j1 = Math.min(terrain.height - 1, Math.ceil(Math.max(...ys)) + WATER_MARGIN);
  let waterTiles = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) if (terrain.isWater(i, j)) waterTiles++;
  }
  if (waterTiles < preset.waterNeed) issues.push('too-narrow');

  return { ok: issues.length === 0, issues, badHandles, waterTiles };
}

/** 스플라인 표본. 선착장을 시작점으로 넣어 "선착장에서 출발한다"가 형태에 반영된다 */
export function sampleCourse(dock: Vec2, handles: readonly Vec2[]): SplineSample[] {
  return sampleSpline([dock, ...handles], 12);
}

export interface CourseResult extends CourseMetrics {
  fit: FitRating;
  /** 주간 탑승객 — **카이로 시계 기준**. `throughput`(명/h)은 v1 시계라 여기 쓰면 안 된다 */
  weeklyRiders: number;
  /** 적합도 반영 후 만족도 배율 */
  satisfactionMult: number;
  /** 주간 매출 (요금 × 처리량 × 운영시간) */
  weeklyRevenue: number;
  weeklyUpkeep: number;
}

/**
 * ⚠ **처리량은 카이로 시계로 다시 센다.**
 *
 * `computeMetrics` 의 `throughput` 은 v1 시계(하루 3,600 tick · 영업 10시간 → 시간당
 * 360 tick)를 기준으로 한 "명/h" 다. 카이로의 하루는 **120 tick** 이라 그대로 쓰면
 * 30배가 부풀고, 실제로 코스 하나가 주매출 59만으로 **공원 전체 매출을 넘었다** (실측).
 *
 * 속도(타일/tick)는 두 시계에서 같은 축이다 — 손님이 4 tick 에 한 칸 걷는 것과 같은 눈금.
 * 그래서 주기(cycleTicks)는 그대로 쓰고 **주간 tick 수만** 카이로 것으로 바꾼다.
 */
const KAIRO_TICKS_PER_WEEK = 7 * 120;

/**
 * 지표를 계산하고 **적합도를 반영**한다.
 *
 * 적합도는 스릴과 만족도만 건드린다 — 처리량·안전까지 건드리면 "부적합"이 그냥
 * 전면 하향이 되어 고를 이유가 사라진다. 스릴↑ 만족↑ 는 좋고 스릴↓ 만족↓ 는 나쁘되,
 * **처리량이라는 다른 축은 남아 있어야** "부적합이지만 대수로 민다"가 가능하다.
 */
export function evaluateCourse(
  dock: Vec2,
  handles: readonly Vec2[],
  equip: CourseEquipment,
  presetId: string,
  vehicles: number,
): CourseResult {
  const samples = sampleCourse(dock, handles);
  const preset = presetDef(presetId);
  const base = computeMetrics({
    samples,
    def: {
      id: equip.id,
      name: equip.name,
      sprite: equip.sprite,
      speed: equip.speed,
      capacity: equip.capacity,
      boardTicks: equip.boardTicks,
      minDepth: 1,
      fee: equip.fee,
      vehicleCost: equip.vehicleCost,
      upkeep: equip.upkeep,
      /*
       * ⚠ 장비 기본값을 **더하면 안 된다.** 스펙 §7.6 은
       *   스릴 = clamp(프리셋기본 + 최대곡률×90×속도계수) × 장비 스릴계수
       * 이고, 장비의 몫은 **속도계수와 스릴계수**로 이미 두 번 들어간다. 셋을 다 더했더니
       * 6 프리셋 × 3 장비 중 10칸이 100 에 붙어 지표가 구분을 못 했다 (실측).
       */
      thrillBase: preset?.thrillBase ?? 0,
      safeCurvature: equip.safeCurvature,
      minPoints: 3,
      maxPoints: 8,
      desc: equip.desc,
    },
    vehicles,
  });

  const fit = fitOf(equip.id, presetId);
  const eff = fitEffect(fit);
  const thrill = Math.max(
    0,
    Math.min(100, base.thrill * equip.thrillCoef * (eff?.thrill ?? 1)),
  );
  const cycles = base.cycleTicks > 0 ? KAIRO_TICKS_PER_WEEK / base.cycleTicks : 0;
  const weeklyRiders = Math.round(cycles * equip.capacity * vehicles);
  return {
    ...base,
    thrill,
    fit,
    satisfactionMult: eff?.satisfaction ?? 1,
    weeklyRiders,
    weeklyRevenue: weeklyRiders * equip.fee,
    weeklyUpkeep: equip.upkeep * vehicles,
  };
}

export interface PlacedCourse {
  handle: number;
  presetId: string;
  equipId: string;
  vehicles: number;
  dock: Vec2;
  handles: Vec2[];
}

export interface CourseSnapshot {
  courses: PlacedCourse[];
  nextHandle: number;
}

/**
 * 놓인 코스들. 시설과 따로 두는 이유는 **점유 격자가 다르기** 때문이다 —
 * 코스는 물 위의 곡선이라 타일을 점유하지 않는다 (손님은 선착장으로 간다).
 */
export class CourseStore {
  private readonly items: PlacedCourse[] = [];
  private nextHandle = 1;

  get all(): readonly PlacedCourse[] {
    return this.items;
  }

  get count(): number {
    return this.items.length;
  }

  add(c: Omit<PlacedCourse, 'handle'>): PlacedCourse {
    const item: PlacedCourse = { ...c, handle: this.nextHandle++, handles: [...c.handles] };
    this.items.push(item);
    return item;
  }

  remove(handle: number): boolean {
    const k = this.items.findIndex((c) => c.handle === handle);
    if (k < 0) return false;
    this.items.splice(k, 1);
    return true;
  }

  /** 이번 주 코스 합계 — 결산이 이걸 더한다 */
  weekly(): { revenue: number; upkeep: number; thrill: number; safety: number; riders: number } {
    let revenue = 0;
    let upkeep = 0;
    let thrillSum = 0;
    let safetySum = 0;
    let riders = 0;
    for (const c of this.items) {
      const equip = courseEquipment(c.equipId);
      if (!equip) continue;
      const r = evaluateCourse(c.dock, c.handles, equip, c.presetId, c.vehicles);
      revenue += r.weeklyRevenue;
      upkeep += r.weeklyUpkeep;
      thrillSum += r.thrill;
      safetySum += r.safety;
      riders += r.weeklyRiders;
    }
    const n = Math.max(1, this.items.length);
    return {
      revenue,
      upkeep,
      thrill: thrillSum / n,
      safety: safetySum / n,
      riders,
    };
  }

  toSnapshot(): CourseSnapshot {
    return {
      courses: this.items.map((c) => ({ ...c, dock: { ...c.dock }, handles: c.handles.map((h) => ({ ...h })) })),
      nextHandle: this.nextHandle,
    };
  }

  static fromSnapshot(s: CourseSnapshot): CourseStore {
    const st = new CourseStore();
    for (const c of s.courses) {
      st.items.push({ ...c, dock: { ...c.dock }, handles: c.handles.map((h) => ({ ...h })) });
    }
    st.nextHandle = s.nextHandle;
    return st;
  }
}

/** 데이터 검증 */
export function validateCourseData(): string[] {
  const problems: string[] = [];
  if (PRESETS.length !== 6) problems.push(`프리셋이 6종이 아니다: ${PRESETS.length}`);
  if (COURSE_EQUIPMENT.length !== 19) {
    problems.push(`장비가 19종이 아니다: ${COURSE_EQUIPMENT.length}`);
  }
  for (const p of PRESETS) {
    if (p.handles < 2 || p.handles > 4) problems.push(`${p.id} — 핸들이 2~4개가 아니다`);
  }
  for (const e of COURSE_EQUIPMENT) {
    const row = COURSE_DATA.fit[e.id];
    if (!row) {
      problems.push(`${e.id} — 적합도 행이 없다`);
      continue;
    }
    for (const p of PRESETS) {
      if (!row[p.id]) problems.push(`${e.id} × ${p.id} — 적합도가 없다`);
    }
    // 전부 '✕' 면 그 장비는 어디에도 못 쓴다
    if (PRESETS.every((p) => row[p.id] === 'no')) problems.push(`${e.id} — 쓸 수 있는 형태가 없다`);
  }
  for (const p of PRESETS) {
    if (COURSE_EQUIPMENT.every((e) => fitOf(e.id, p.id) === 'no')) {
      problems.push(`${p.id} — 탈 수 있는 장비가 없다`);
    }
  }
  return problems;
}

export { splineLength, type Vec2, type SplineSample };

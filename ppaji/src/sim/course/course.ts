/**
 * 견인 코스 — 빠지 `src/sim/kairo/course.ts` 이식 (P4-A, `docs/plan-ppaji-story.md` §2.2 「코스 = RCT 식 루트」).
 *
 * ## 무엇이 그대로인가
 * 프리셋 6 · 기구 19 · 견인 보트 2 · 적합도 19×6 · 핸들 기본 배치 · 판정(`validateCourse`) ·
 * 겹침/잔교 점유/루트 차단 · 기본 제안 · 지표(`evaluateCourse`) · `CourseStore` 와 편집 트랜잭션
 * (`confirmEdit` — 검증 → 결제 → 교체 한 경계).
 *
 * ## 무엇이 바뀌었나 (D12 「코스는 수역(부표) 안에만」)
 * - 지형은 `KairoTerrain` 이 아니라 **`CourseTerrain` 셋 인터페이스**다. `Game` 이 붙이는 어댑터는
 *   `isWater(i,j) = grid.at(i,j) === FLOOR.pool` — **부표로 친 수역 칸만 물**이다. 부표 밖 강은
 *   코스가 지날 수 없다 (`not-water`). 부표가 곧 허가 면적이라 코스와 수역 상태가 같은 회계를 쓴다.
 * - `waterNeed` 는 경계 상자 안의 **수역 칸 수**다 — 데이터가 그 눈금으로 다시 적혀 있다.
 * - 기본 제안(`suggestCourse`)은 지형을 받으면 **수역에 맞춰 본다**: 방향·폭·옆 밀기를 훑어 형태가
 *   통째로 들어가는 자리를 찾고, 없으면 핸들을 가장 가까운 수역 칸으로 **끌어다 놓는다**. 부모는
 *   넓은 강을 전제로 「제안은 제안, 막는 것은 판정」이었지만, 4×5 수역 옆 선착장에서 기본 기하는
 *   어떤 폭으로도 안 들어간다 (계산해 봤다 — 왕복의 0.6:1.4 비율이 4칸 폭을 못 지난다).
 *   그래도 「처음부터 유효한 자리만」은 아니다 — 끌어도 못 놓으면 판정이 이유를 말한다.
 * - 시계는 **하루**다 (주간 결산이 없다): `potentialDailyRiders`·`dailyUpkeep`.
 * - 등급은 ppaji 랭크 + 1 이다 (부르는 쪽이 넘긴다).
 */
import rawCourses from '../../data/courses.json';
import rawEquipment from '../../data/equipment.json';
import rawTowBoats from '../../data/tow-boats.json';
import { TICKS_PER_DAY } from '../clock.js';
import { sampleSpline, splineLength, type Vec2, type SplineSample } from './spline.js';
import { computeMetrics, type CourseMetrics } from './metrics.js';

/** 코스가 보는 지형 — `Game` 은 수역(D12)으로, 단위 검사는 손으로 만든 격자로 붙인다 */
export interface CourseTerrain {
  width: number;
  height: number;
  isWater(i: number, j: number): boolean;
}

export type FitRating = 'best' | 'ok' | 'poor' | 'no';

export interface PresetDef {
  id: string;
  name: string;
  /** 핸들(터닝포인트) 개수 */
  handles: number;
  /** 형태가 주는 기본 스릴 */
  thrillBase: number;
  /** 이 형태를 놓으려면 필요한 수역 칸 수 (경계 상자 + 여유 안) */
  waterNeed: number;
  /** 열리는 등급 (= 랭크 + 1) */
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
  /** 탑승 1회 요금 (G) */
  fee: number;
  /** 1대 값 (G) */
  vehicleCost: number;
  /** 1대 **하루** 유지비 (G) */
  upkeep: number;
  /** 장비의 스릴 배율 (§7.4 스릴계수) */
  thrillCoef: number;
  thrillBase: number;
  safeCurvature: number;
  desc: string;
  /** 새 판에서 이미 갖고 있는가 — 물려받은 둘. 셋 이상 주면 상점의 첫 결정이 사라진다 */
  start?: boolean;
}

/** 견인 기구 15종이 공유하는 보트 profile — 기구×프리셋 수제 조합표가 아니다 */
export interface TowBoatDef {
  id: string;
  name: string;
  role: 'work' | 'sport';
  speedMult: number;
  thrillMult: number;
  thrillCap: number;
  safetyBase: number;
  sharpSafetyPenalty: number;
  upkeepMult: number;
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
export const COURSE_EQUIPMENT: readonly CourseEquipment[] = (rawEquipment as unknown as { equipment: CourseEquipment[] }).equipment;
export const TOW_BOATS: readonly TowBoatDef[] = (rawTowBoats as unknown as { boats: TowBoatDef[] }).boats;
export const DEFAULT_TOW_BOAT_ID = 'work';

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
const EQUIP_BY_ID = new Map(COURSE_EQUIPMENT.map((e) => [e.id, e]));
const TOW_BOAT_BY_ID = new Map(TOW_BOATS.map((boat) => [boat.id, boat]));

export function presetDef(id: string): PresetDef | undefined {
  return PRESET_BY_ID.get(id);
}

export function courseEquipment(id: string): CourseEquipment | undefined {
  return EQUIP_BY_ID.get(id);
}

export function towBoatDef(id: string): TowBoatDef | undefined {
  return TOW_BOAT_BY_ID.get(id);
}

/** 새 판이 물려받는 기구 id — `start: true` (둘) */
export function startEquipmentIds(): string[] {
  return COURSE_EQUIPMENT.filter((e) => e.start === true).map((e) => e.id);
}

/** 자체동력 기구는 어떤 선택값이 와도 견인선을 쓰지 않는다 */
export function towBoatForEquipment(equip: CourseEquipment, towBoatId?: string): TowBoatDef | null {
  if (equip.kind === 'power') return null;
  return towBoatDef(towBoatId ?? DEFAULT_TOW_BOAT_ID) ?? towBoatDef(DEFAULT_TOW_BOAT_ID) ?? null;
}

/** 기구 × 프리셋 적합도. 표에 없으면 '적합'으로 본다 (새 기구가 조용히 막히지 않게) */
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

// ─────────────────────────────────────────────────────────────
// 선착장 후보
// ─────────────────────────────────────────────────────────────

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * 선착장 후보 — **선착장 무리 하나가 후보 하나다** (앵커 모드, 빠지 K33 → Q10).
 *
 * `tip` 은 코스 시작점(선착장 칸 중 게이트에서 가장 먼 칸), `dir` 은 게이트 반대쪽 — 게이트는 언제나
 * 뭍에 있으므로 그 반대가 곧 물이다. `claim` 은 선착장 무리 ∪ 이어진 데크 칸들 — `dockTaken` 이
 * 「이 후보에 코스가 있나」를 점이 아니라 이 영역으로 잰다.
 *
 * 앵커를 생략하면 잔교 모드다 — 4이웃으로 묶은 데크 무리 하나가 후보 하나 (지형 단위 검사 호환).
 * 순수 함수다 — 격자도 지형도 안 본다.
 */
export interface DockChoice {
  /** 코스 시작점 — 앵커 모드에서는 선착장 시설의 칸 */
  tip: Vec2;
  /** 뭍 → 물 방향 (정규화 안 함. `defaultHandles` 가 정규화한다) */
  dir: Vec2;
  /** 이 후보의 칸 수 — UI 가 "3칸" 처럼 보여준다 */
  tiles: number;
  /** 이 후보의 영역 (앵커 모드만) — 선착장 무리 ∪ 이어진 데크 */
  claim?: Vec2[];
}

/** P20 선착장 claim 이 데크를 따라 뻗는 한계(칸) */
export const PIER_CLAIM_RADIUS = 3;

export function dockCandidates(decks: readonly Vec2[], gate: Vec2, anchors?: readonly Vec2[]): DockChoice[] {
  const key = (v: Vec2): string => `${v.x},${v.y}`;
  const d2 = (v: Vec2): number => (v.x - gate.x) ** 2 + (v.y - gate.y) ** 2;

  if (anchors !== undefined) {
    const pool = new Map<string, Vec2>();
    for (const a of anchors) pool.set(key(a), { x: a.x, y: a.y });
    const deckSet = new Map<string, Vec2>();
    for (const d of decks) deckSet.set(key(d), { x: d.x, y: d.y });

    const out: DockChoice[] = [];
    const seen = new Set<string>();
    for (const start of anchors) {
      if (seen.has(key(start))) continue;
      // 선착장 무리 (4-이웃)
      const group: Vec2[] = [];
      const stack: Vec2[] = [start];
      seen.add(key(start));
      while (stack.length > 0) {
        const c = stack.pop() as Vec2;
        group.push(c);
        for (const [dx, dy] of N4) {
          const n = { x: c.x + dx, y: c.y + dy };
          if (!pool.has(key(n)) || seen.has(key(n))) continue;
          seen.add(key(n));
          stack.push(n);
        }
      }
      // 이어진 데크 — 무리에 붙은 데크에서 flood (claim 에 쓴다). 선착장 자신은 데크가 아니다
      const pier: Vec2[] = [];
      const pierSeen = new Set<string>();
      const pierStack: Vec2[] = [];
      for (const g of group) {
        for (const [dx, dy] of N4) {
          const n = { x: g.x + dx, y: g.y + dy };
          const k = key(n);
          if (!deckSet.has(k) || pool.has(k) || pierSeen.has(k)) continue;
          pierSeen.add(k);
          pierStack.push(n);
        }
      }
      // P20: 데크는 선착장 무리에서 **3칸까지만** 잔교로 친다 — 빠지의 데크 링(P15)은 전부 이어져 있어 제한이 없으면 모든 선착장이 한 claim 이 되고 둘째 코스가 영영 「이미 코스 있음」이 된다 (봇 실측: 8시드 전부 코스 1)
      const nearGroup = (v: Vec2): boolean => group.some((g) => Math.max(Math.abs(g.x - v.x), Math.abs(g.y - v.y)) <= PIER_CLAIM_RADIUS);
      while (pierStack.length > 0) {
        const c = pierStack.pop() as Vec2;
        pier.push(c);
        for (const [dx, dy] of N4) {
          const n = { x: c.x + dx, y: c.y + dy };
          const k = key(n);
          if (!deckSet.has(k) || pool.has(k) || pierSeen.has(k) || !nearGroup(n)) continue;
          pierSeen.add(k);
          pierStack.push(n);
        }
      }

      let tip = group[0] as Vec2;
      for (const g of group) if (d2(g) > d2(tip)) tip = g;
      const dir = { x: tip.x - gate.x, y: tip.y - gate.y };
      out.push({
        tip: { ...tip },
        dir: dir.x === 0 && dir.y === 0 ? { x: 0, y: 1 } : dir,
        tiles: group.length + pier.length,
        claim: [...group, ...pier].map((v) => ({ ...v })),
      });
    }
    out.sort((a, b) => d2(a.tip) - d2(b.tip) || a.tip.x - b.tip.x || a.tip.y - b.tip.y);
    return out;
  }

  // ── 잔교 모드 (앵커 생략) ──
  if (decks.length === 0) return [];
  const pool = new Map<string, Vec2>();
  for (const d of decks) pool.set(key(d), { x: d.x, y: d.y });

  const out: DockChoice[] = [];
  const seen = new Set<string>();
  // 순회 순서를 `decks` 그대로 쓴다 — 입력이 결정론적이면 출력도 결정론적이다
  for (const start of decks) {
    if (seen.has(key(start))) continue;
    const group: Vec2[] = [];
    const stack: Vec2[] = [start];
    seen.add(key(start));
    while (stack.length > 0) {
      const c = stack.pop() as Vec2;
      group.push(c);
      for (const [dx, dy] of N4) {
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
 * 여기서 나온 점은 **제안**이다 — 플레이어가 끌어 옮긴다. 유효하지 않은 자리에 놓여도 되고,
 * `validateCourse` 가 판정한다.
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
      return [at(span * 0.6, span * 0.6), at(span * 1.6, -span * 0.6), at(span * 1.6, span * 0.6), at(span * 0.6, -span * 0.6)];
    case 'zigzag':
      return [at(span * 0.5, span * 0.7), at(span * 1.0, -span * 0.7), at(span * 1.5, span * 0.7), at(span * 2.0, -span * 0.7)];
    case 'hairpin':
      return [at(span * 0.5, span * 0.35), at(span * 0.9, -span * 0.35), at(span * 0.6, -span * 0.7), at(span * 0.3, -span * 0.3)];
  }
}

// ─────────────────────────────────────────────────────────────
// 판정
// ─────────────────────────────────────────────────────────────

export type CourseIssueKind =
  | 'not-water'
  | 'too-narrow'
  | 'far-from-dock'
  | 'blocked-combo'
  | 'locked-preset'
  | 'no-equipment'
  /** 산 적 없는 기구 — 고를 수는 있어도 확정은 못 한다 */
  | 'not-owned'
  | 'dock-taken'
  /** 루트가 물 위 시설을 가로지른다 */
  | 'route-blocked'
  | 'overlap';

/** 거절 메시지는 **방법까지** 말한다 — "안 됩니다"만 주면 플레이어는 무엇을 고쳐야 하는지 모른다 */
export const COURSE_ISSUE_TEXT: Record<CourseIssueKind, string> = {
  'not-water': '수역 위가 아닙니다 — 부표로 친 물 안에만 그릴 수 있습니다',
  'too-narrow': '이 형태를 놓기엔 수역이 좁습니다 — 부표를 더 치세요',
  'far-from-dock': '선착장에서 너무 멉니다',
  'blocked-combo': '이 기구로는 이 형태를 못 탑니다',
  'locked-preset': '아직 안 열린 형태입니다 — 랭크를 올리세요',
  'no-equipment': '기구를 고르세요',
  'not-owned': '아직 없는 기구입니다 — 상점에서 사세요',
  'dock-taken': '이 선착장에 이미 코스가 있습니다 — 다른 선착장을 고르거나 지으세요',
  'route-blocked': '루트가 시설을 지나갑니다 — 핸들을 옮겨 피하세요',
  overlap: '기존 코스와 너무 가깝습니다 — 핸들을 옮겨 떨어뜨리세요',
};

/** 선착장에서 코스 시작점까지 허용 거리 (§7.7 "3타일 이내"를 격자 단위로) */
export const DOCK_REACH_TILES = 4;

/** 필요 수면을 잴 때 코스 경계 상자에 두는 여유 (타일) */
export const WATER_MARGIN = 3;

/**
 * 코스끼리 떨어져 있어야 하는 거리 (타일). 3칸인 이유: 견인 기구의 항적과 손님이 오가는 폭이
 * 대략 그만큼이다. 더 크게 잡으면 좁은 수역에 코스를 둘 놓을 수 없다.
 */
export const COURSE_CLEAR_TILES = 3;

/** 같은 칸인가 — 핸들은 소수 좌표를 갖지만 선착장은 칸이다 */
function sameTile(a: Vec2, b: Vec2): boolean {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

/**
 * 그 후보에서 시작하는 코스가 이미 있는가. `claim`(선착장 ∪ 이어진 데크) 안이거나 그 8-이웃이면
 * 「이 후보의 코스」로 본다. `claim` 이 없으면(잔교 모드) 점 비교다.
 */
export function dockTaken(tip: Vec2, others: readonly PlacedCourse[], claim?: readonly Vec2[]): boolean {
  if (claim === undefined || claim.length === 0) {
    return others.some((o) => sameTile(o.dock, tip));
  }
  return others.some((o) => claim.some((c) => Math.abs(o.dock.x - c.x) <= 1 && Math.abs(o.dock.y - c.y) <= 1));
}

/** 코스가 없는 첫 선착장. 전부 찼으면 −1. `dockCandidates` 는 게이트에서 가까운 순이다 */
export function firstFreeDock(docks: readonly DockChoice[], others: readonly PlacedCourse[]): number {
  for (let k = 0; k < docks.length; k++) {
    const d = docks[k] as DockChoice;
    if (!dockTaken(d.tip, others, d.claim)) return k;
  }
  return -1;
}

export interface CourseGap {
  /** 기존 코스까지의 최소 거리 (타일). 기존 코스가 없으면 `Infinity` */
  gap: number;
  /** 기존 코스와 가까운 핸들 번호 — UI 가 빨갛게 칠한다 */
  nearHandles: number[];
}

/** 이 코스와 기존 코스들 사이의 거리. **판정과 기본 제안이 같은 자를 쓴다** */
export function courseGap(dock: Vec2, handles: readonly Vec2[], others: readonly PlacedCourse[]): CourseGap {
  const mine = sampleCourse(dock, handles);
  if (mine.length === 0 || others.length === 0) return { gap: Infinity, nearHandles: [] };

  let gap = Infinity;
  const near = new Set<number>();
  for (const o of others) {
    const theirs = sampleCourse(o.dock, o.handles);
    if (theirs.length === 0) continue;
    for (const a of mine) {
      for (const b of theirs) {
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        if (d < gap) gap = d;
      }
    }
    for (let k = 0; k < handles.length; k++) {
      const h = handles[k] as Vec2;
      for (const b of theirs) {
        if (Math.hypot(h.x - b.pos.x, h.y - b.pos.y) < COURSE_CLEAR_TILES) {
          near.add(k);
          break;
        }
      }
    }
  }
  return { gap, nearHandles: [...near].sort((a, b) => a - b) };
}

export interface CourseValidation {
  ok: boolean;
  issues: CourseIssueKind[];
  /** 유효하지 않은 핸들 번호 — UI 가 빨갛게 칠한다 */
  badHandles: number[];
  /** 코스 주변의 수역 칸 수 */
  waterTiles: number;
}

/** 핸들이 전부 수역 칸 위인가 (반올림 칸) */
function handlesOnWater(terrain: CourseTerrain, handles: readonly Vec2[]): boolean {
  return handles.every((h) => terrain.isWater(Math.round(h.x), Math.round(h.y)));
}

/** 코스(선착장 + 핸들) 경계 상자 + 여유 안의 수역 칸 수 — 판정과 제안이 같은 자를 쓴다 */
export function waterAround(terrain: CourseTerrain, dock: Vec2, handles: readonly Vec2[]): number {
  const xs = handles.map((h) => h.x).concat(dock.x);
  const ys = handles.map((h) => h.y).concat(dock.y);
  const i0 = Math.max(0, Math.floor(Math.min(...xs)) - WATER_MARGIN);
  const i1 = Math.min(terrain.width - 1, Math.ceil(Math.max(...xs)) + WATER_MARGIN);
  const j0 = Math.max(0, Math.floor(Math.min(...ys)) - WATER_MARGIN);
  const j1 = Math.min(terrain.height - 1, Math.ceil(Math.max(...ys)) + WATER_MARGIN);
  let n = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (terrain.isWater(i, j)) n++;
  return n;
}

/**
 * 코스 판정. **핸들별로** 무엇이 잘못됐는지 돌려준다.
 *
 * `others` 는 이미 놓인 코스, `owned` 는 가진 기구, `blocked` 는 갈 수 없는 칸(시설 발자국),
 * `dockClaim` 은 고른 후보의 영역 — 전부 optional 이라 안 넘기면 안 본다 (지형 단위 검사 호환).
 * ⚠ production(`Game`)은 넷을 **반드시** 넘긴다 — 안 넘기면 「산 적 없는 기구로 코스를 세운다」·
 * 「시설을 뚫는 보트」가 조용히 돌아온다.
 */
export function validateCourse(
  terrain: CourseTerrain,
  handles: readonly Vec2[],
  dock: Vec2,
  preset: PresetDef,
  equipId: string | null,
  grade: number,
  others: readonly PlacedCourse[] = [],
  excludeHandle?: number,
  owned?: ReadonlySet<string>,
  blocked?: ReadonlySet<string>,
  dockClaim?: readonly Vec2[],
): CourseValidation {
  const issues: CourseIssueKind[] = [];
  const badHandles: number[] = [];

  if (equipId === null) issues.push('no-equipment');
  else {
    if (fitBlocked(equipId, preset.id)) issues.push('blocked-combo');
    // 소유는 적합도와 **다른 축**이다 — 맞는 기구인데 아직 없을 수 있다
    if (owned !== undefined && !owned.has(equipId)) issues.push('not-owned');
  }
  if (grade < preset.grade) issues.push('locked-preset');

  for (let k = 0; k < handles.length; k++) {
    const h = handles[k] as Vec2;
    if (!terrain.isWater(Math.round(h.x), Math.round(h.y))) badHandles.push(k);
  }
  if (badHandles.length > 0) issues.push('not-water');

  // 선착장 근접 — 가장 가까운 핸들 기준
  const nearest = handles.reduce((best, h) => Math.min(best, Math.hypot(h.x - dock.x, h.y - dock.y)), Infinity);
  if (nearest > DOCK_REACH_TILES + 8) issues.push('far-from-dock');

  /*
   * 수역 넓이 — 코스 경계 상자 **주변**의 수역 칸 수. 여유 없이 재면 왕복처럼 직선인 코스는
   * 경계 상자가 선이라 물이 거의 안 잡힌다 (부모 실측: 봇이 코스를 한 개도 못 놓았다).
   */
  const waterTiles = waterAround(terrain, dock, handles);
  if (waterTiles < preset.waterNeed) issues.push('too-narrow');

  /*
   * ── 겹침 — 자기 자신의 문제를 먼저 본 뒤다. 같은 선착장이면 겹침은 반드시 나므로
   * `dock-taken` 하나만 말한다 — 옮겨야 하는 것은 핸들이 아니라 선착장이다.
   */
  const comparisonCourses = excludeHandle === undefined ? others : others.filter((course) => course.handle !== excludeHandle);
  if (comparisonCourses.length > 0) {
    if (dockTaken(dock, comparisonCourses, dockClaim)) issues.push('dock-taken');
    else {
      const near = courseGap(dock, handles, comparisonCourses);
      if (near.gap < COURSE_CLEAR_TILES) {
        issues.push('overlap');
        for (const k of near.nearHandles) if (!badHandles.includes(k)) badHandles.push(k);
        badHandles.sort((a, b) => a - b);
      }
    }
  }

  // ── 루트 차단 — 표본이 시설 발자국을 지나면 안 된다. 시작점 주변(1.6칸)은 출발지가 곧 선착장이라 건너뛴다
  if (blocked !== undefined && blocked.size > 0) {
    const samples = sampleCourse(dock, handles);
    let hit = false;
    for (const sample of samples) {
      const sp = sample.pos;
      if (Math.hypot(sp.x - dock.x, sp.y - dock.y) < 1.6) continue;
      if (!blocked.has(`${Math.round(sp.x)},${Math.round(sp.y)}`)) continue;
      hit = true;
      let bestK = 0;
      let bestD = Infinity;
      for (let k = 0; k < handles.length; k++) {
        const h = handles[k] as Vec2;
        const dd = (h.x - sp.x) ** 2 + (h.y - sp.y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          bestK = k;
        }
      }
      if (!badHandles.includes(bestK)) badHandles.push(bestK);
    }
    if (hit) {
      issues.push('route-blocked');
      badHandles.sort((a, b) => a - b);
    }
  }

  return { ok: issues.length === 0, issues, badHandles, waterTiles };
}

/** 놓인 코스들의 **루트 칸** — 겹침·차단 검사와 같은 표본을 쓴다. 자가 둘이면 반드시 어긋난다 */
export function courseRouteTiles(courses: readonly PlacedCourse[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const c of courses) {
    for (const sample of sampleCourse(c.dock, c.handles)) out.add(`${Math.round(sample.pos.x)},${Math.round(sample.pos.y)}`);
  }
  return out;
}

/** 스플라인 표본. 선착장을 시작점으로 넣어 "선착장에서 출발한다"가 형태에 반영된다 */
export function sampleCourse(dock: Vec2, handles: readonly Vec2[]): SplineSample[] {
  return sampleSpline([dock, ...handles], 12);
}

/** 지도 탭이 운행 중인 코스를 가리키는지 — 정본 스플라인 표본으로. 거리가 같으면 저장 순서의 첫 handle */
export function courseAtTile(courses: readonly PlacedCourse[], tile: Vec2, tolerance = 1.35): number | null {
  let hit: number | null = null;
  let best = tolerance;
  for (const course of courses) {
    for (const sample of sampleCourse(course.dock, course.handles)) {
      const distance = Math.hypot(sample.pos.x - tile.x, sample.pos.y - tile.y);
      if (distance < best) {
        best = distance;
        hit = course.handle;
      }
    }
  }
  return hit;
}

// ─────────────────────────────────────────────────────────────
// 기본 제안
// ─────────────────────────────────────────────────────────────

/** 핸들 전체를 선착장의 **옆 방향**으로 민다 — 앞뒤로 밀면 코스가 선착장에서 멀어진다 */
function shiftHandles(handles: readonly Vec2[], dir: Vec2, amount: number): Vec2[] {
  if (amount === 0) return handles.map((h) => ({ ...h }));
  const len = Math.hypot(dir.x, dir.y) || 1;
  const r = { x: -dir.y / len, y: dir.x / len };
  return handles.map((h) => ({ x: h.x + r.x * amount, y: h.y + r.y * amount }));
}

export interface CourseSuggestion {
  /** 고른 선착장 번호. 후보가 없으면 −1 */
  dockIndex: number;
  handles: Vec2[];
  /** 옆으로 민 칸 수 — 0 이면 기본 자리 그대로 */
  shift: number;
  /**
   * 지형을 받았을 때 어떻게 맞췄나 — `shape` 는 형태가 통째로 들어갔다, `snapped` 는 핸들을 수역 칸으로
   * 끌어다 놓았다, `none` 은 못 맞춰 기본 자리 그대로다 (판정이 막는다). 지형이 없으면 `none`
   */
  fit: 'shape' | 'snapped' | 'none';
}

/** 옆으로 밀어 보는 순서 — 좌우 번갈아 (한쪽만 보면 강가에서 늘 뭍으로 민다) */
const SHIFT_STEPS = [0, 1, -1, 2, -2, 3, -3];

/** 형태를 맞춰 볼 방향 — 후보의 방향을 먼저, 그다음 22.5° 간격 16 방향 */
function directionCandidates(dir: Vec2): Vec2[] {
  const out: Vec2[] = [{ ...dir }];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    out.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return out;
}

/**
 * 핸들마다 가장 가까운 수역 칸으로 끌어다 놓는다 (반경 안 · 이미 쓴 칸은 피한다). 못 찾으면 그대로.
 * 반경은 「선착장에서 너무 멀다」 문턱과 같다 — 그 밖의 물은 어차피 판정이 막는다.
 */
function snapToWater(terrain: CourseTerrain, handles: readonly Vec2[], radius = DOCK_REACH_TILES + 8): { handles: Vec2[]; moved: number } {
  const used = new Set<string>();
  const out: Vec2[] = [];
  let moved = 0;
  for (const h of handles) {
    const ci = Math.round(h.x);
    const cj = Math.round(h.y);
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let j = cj - radius; j <= cj + radius; j++) {
      for (let i = ci - radius; i <= ci + radius; i++) {
        if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) continue;
        if (!terrain.isWater(i, j) || used.has(`${i},${j}`)) continue;
        const d = (i - h.x) ** 2 + (j - h.y) ** 2;
        // 거리 → i → j 순 — 결정론 (스캔 순서가 곧 동점 규칙이다)
        if (d < bestD) {
          bestD = d;
          best = { x: i, y: j };
        }
      }
    }
    if (best === null) {
      out.push({ ...h });
      continue;
    }
    used.add(`${best.x},${best.y}`);
    if (best.x !== h.x || best.y !== h.y) moved++;
    out.push(best);
  }
  return { handles: out, moved };
}

/**
 * 기본 제안 — **빈 선착장을 먼저 고르고**, 필요하면 옆으로 밀어 본다.
 *
 * `pinned` 는 플레이어가 지도에서 직접 고른 선착장이다 — 그때는 찼더라도 그 선착장을 쓴다
 * (판정이 "다른 선착장을 고르세요"라고 말해 준다). 안 그러면 탭이 무시된 것처럼 보인다.
 *
 * `terrain` 을 주면 (D12) 수역에 맞춘다: ① 방향 × 폭 × 옆 밀기를 훑어 핸들 전부가 수역 위이고
 * 수역 칸 수가 `waterNeed` 를 넘고 기존 코스와 안 겹치는 자리 → ② 없으면 기본 기하의 핸들을
 * 가장 가까운 수역 칸으로 끌어다 놓는다 → ③ 그것도 안 되면 부모 규칙 그대로(밀어만 두고 판정에 맡긴다).
 */
export function suggestCourse(
  preset: PresetDef,
  docks: readonly DockChoice[],
  others: readonly PlacedCourse[],
  opts: { span?: number; dockIndex?: number; pinned?: boolean; terrain?: CourseTerrain } = {},
): CourseSuggestion {
  if (docks.length === 0) return { dockIndex: -1, handles: [], shift: 0, fit: 'none' };
  const span = opts.span ?? 8;
  const cur = Math.max(0, Math.min(docks.length - 1, opts.dockIndex ?? 0));
  const free = firstFreeDock(docks, others);
  const pick = opts.pinned === true ? cur : free >= 0 ? free : cur;
  const choice = docks[pick] as DockChoice;
  const step = COURSE_CLEAR_TILES + 1;
  const clearOf = (handles: readonly Vec2[]): boolean => others.length === 0 || courseGap(choice.tip, handles, others).gap >= COURSE_CLEAR_TILES;

  const terrain = opts.terrain;
  if (terrain !== undefined) {
    // ① 형태 통째로 — 큰 폭부터 (같은 폭이면 후보의 방향, 그다음 나침반 16 방향, 그 안에서 옆 밀기)
    for (let s = span; s >= 3; s--) {
      for (const dir of directionCandidates(choice.dir)) {
        const base = defaultHandles(preset, choice.tip, dir, s);
        for (const k of SHIFT_STEPS) {
          const moved = shiftHandles(base, dir, k * step);
          if (!handlesOnWater(terrain, moved)) continue;
          if (waterAround(terrain, choice.tip, moved) < preset.waterNeed) continue;
          if (!clearOf(moved)) continue;
          return { dockIndex: pick, handles: moved, shift: k, fit: 'shape' };
        }
      }
    }
    // ② 끌어다 놓기 — 기본 기하에서 출발해 핸들마다 가장 가까운 수역 칸으로. 옆 밀기도 같이 본다
    for (const k of SHIFT_STEPS) {
      const base = shiftHandles(defaultHandles(preset, choice.tip, choice.dir, span), choice.dir, k * step);
      const snapped = snapToWater(terrain, base);
      if (!handlesOnWater(terrain, snapped.handles)) continue;
      if (!clearOf(snapped.handles)) continue;
      return { dockIndex: pick, handles: snapped.handles, shift: k, fit: 'snapped' };
    }
  }

  // ③ 부모 규칙 — 겹침만 피해 옆으로 민다. 막는 것은 판정이 한다
  const base = defaultHandles(preset, choice.tip, choice.dir, span);
  if (others.length === 0) return { dockIndex: pick, handles: base, shift: 0, fit: 'none' };
  for (const k of SHIFT_STEPS) {
    const moved = shiftHandles(base, choice.dir, k * step);
    if (courseGap(choice.tip, moved, others).gap >= COURSE_CLEAR_TILES) return { dockIndex: pick, handles: moved, shift: k, fit: 'none' };
  }
  const stacked = others.filter((o) => sameTile(o.dock, choice.tip)).length || 1;
  return { dockIndex: pick, handles: shiftHandles(base, choice.dir, stacked * step), shift: stacked, fit: 'none' };
}

// ─────────────────────────────────────────────────────────────
// 지표
// ─────────────────────────────────────────────────────────────

export interface CourseResult extends CourseMetrics {
  fit: FitRating;
  /** 선택된 견인선. 자체동력 기구면 null */
  towBoatId: string | null;
  /** 수요가 충분할 때 가능한 **하루** 탑승객 (실제 탑승은 P4-C) */
  potentialDailyRiders: number;
  /** 적합도 반영 후 만족도 배율 */
  satisfactionMult: number;
  /** 수요가 충분할 때 가능한 하루 매출 (G) */
  potentialDailyRevenue: number;
  /** 하루 유지비 (G) — `Game.dailyMaintenance` 가 더한다 */
  dailyUpkeep: number;
}

/**
 * 지표를 계산하고 **적합도를 반영**한다. 적합도는 스릴과 만족도만 건드린다 — 처리량·안전까지
 * 건드리면 "부적합"이 그냥 전면 하향이 되어 고를 이유가 사라진다.
 */
export function evaluateCourse(dock: Vec2, handles: readonly Vec2[], equip: CourseEquipment, presetId: string, vehicles: number, towBoatId?: string): CourseResult {
  const samples = sampleCourse(dock, handles);
  const preset = presetDef(presetId);
  const boat = towBoatForEquipment(equip, towBoatId);
  const base = computeMetrics({
    samples,
    def: {
      speed: equip.speed * (boat?.speedMult ?? 1),
      capacity: equip.capacity,
      boardTicks: equip.boardTicks,
      /*
       * ⚠ 기구 기본값을 **더하면 안 된다.** 스릴 = clamp(프리셋기본 + 최대곡률×90×속도계수) × 기구 스릴계수
       * 이고, 기구의 몫은 속도계수와 스릴계수로 이미 두 번 들어간다 (부모 실측: 셋을 다 더하니 10칸이 100 에 붙었다).
       */
      thrillBase: preset?.thrillBase ?? 0,
      safeCurvature: equip.safeCurvature,
    },
    vehicles,
  });

  const fit = fitOf(equip.id, presetId);
  const eff = fitEffect(fit);
  const thrill = Math.max(0, Math.min(boat?.thrillCap ?? 100, base.thrill * equip.thrillCoef * (eff?.thrill ?? 1) * (boat?.thrillMult ?? 1)));
  const safety = Math.max(0, Math.min(100, base.safety + (boat?.safetyBase ?? 0) - base.sharpFraction * (boat?.sharpSafetyPenalty ?? 0)));
  const cycles = base.cycleTicks > 0 ? TICKS_PER_DAY / base.cycleTicks : 0;
  const potentialDailyRiders = Math.round(cycles * equip.capacity * vehicles);
  return {
    ...base,
    thrill,
    safety,
    fit,
    towBoatId: boat?.id ?? null,
    satisfactionMult: eff?.satisfaction ?? 1,
    potentialDailyRiders,
    potentialDailyRevenue: potentialDailyRiders * equip.fee,
    dailyUpkeep: Math.round(equip.upkeep * vehicles * (boat?.upkeepMult ?? 1)),
  };
}

// ─────────────────────────────────────────────────────────────
// 보관
// ─────────────────────────────────────────────────────────────

export interface PlacedCourse {
  handle: number;
  presetId: string;
  equipId: string;
  vehicles: number;
  dock: Vec2;
  handles: Vec2[];
  /** 견인 기구의 보트 profile. 없으면 작업형이며, 자체동력 기구는 무시한다 */
  towBoatId?: string;
}

export type CourseEditDraft = Omit<PlacedCourse, 'handle'>;

export interface CourseEdit {
  handle: number;
  original: PlacedCourse;
  draft: CourseEditDraft;
}

export interface CourseEditResult {
  course: PlacedCourse;
  /** 기구 자산 증가분. 다운그레이드는 환불하지 않으므로 0 아래로 내려가지 않는다 */
  charge: number;
}

export interface CourseSnapshot {
  courses: PlacedCourse[];
  nextHandle: number;
  /** 산 기구. optional — 없으면 `start` ∪ 놓인 코스의 기구로 채운다 (안 그러면 로드 직후 코스가 `not-owned` 가 된다) */
  owned?: string[];
}

export interface CourseDayPotential {
  potentialRiders: number;
  potentialRevenue: number;
  upkeep: number;
  /** 코스 평균 */
  thrill: number;
  safety: number;
}

/**
 * 놓인 코스들. 시설과 따로 두는 이유는 **점유 격자가 다르기** 때문이다 — 코스는 물 위의 곡선이라
 * 타일을 점유하지 않는다 (손님은 선착장으로 간다).
 */
export class CourseStore {
  private items: PlacedCourse[] = [];
  private nextHandle = 1;
  /** 산 기구 — `unlocked` 집합에 얹지 않는다 (그건 시설·아이템의 해금 상태다) */
  private readonly owned = new Set<string>(startEquipmentIds());
  /** 편집 세대 — 캐시 키가 본다 */
  version = 0;

  get all(): readonly PlacedCourse[] {
    return this.items;
  }

  get count(): number {
    return this.items.length;
  }

  byHandle(handle: number): PlacedCourse | undefined {
    return this.items.find((c) => c.handle === handle);
  }

  /** 지금 가진 기구 — `validateCourse` 가 이걸 받아 `not-owned` 를 낸다 */
  get ownedEquipment(): ReadonlySet<string> {
    return this.owned;
  }

  /** 상점이 부른다. 이미 가진 것이면 `false` (돈이 두 번 나가면 안 된다) */
  grantEquipment(id: string): boolean {
    if (!courseEquipment(id) || this.owned.has(id)) return false;
    this.owned.add(id);
    this.version++;
    return true;
  }

  add(c: CourseEditDraft): PlacedCourse {
    const item: PlacedCourse = { ...c, handle: this.nextHandle++, dock: { ...c.dock }, handles: c.handles.map((h) => ({ ...h })) };
    this.items.push(item);
    this.version++;
    return item;
  }

  remove(handle: number): boolean {
    const k = this.items.findIndex((c) => c.handle === handle);
    if (k < 0) return false;
    this.items.splice(k, 1);
    this.version++;
    return true;
  }

  /** 저장소와 참조를 공유하지 않는 편집 초안. 열기만 해서는 상태가 한 바이트도 안 바뀐다 */
  beginEdit(handle: number): CourseEdit | null {
    const found = this.items.find((course) => course.handle === handle);
    if (!found) return null;
    const original = clonePlacedCourse(found);
    const { handle: stableHandle, ...draft } = clonePlacedCourse(found);
    return { handle: stableHandle, original, draft };
  }

  /** 취소는 명시적인 no-op 이며 원본 사본을 돌려준다 */
  cancelEdit(edit: CourseEdit): PlacedCourse {
    return clonePlacedCourse(edit.original);
  }

  /** 같은 초안은 같은 교체와 같은 차액을 만든다 */
  confirmEdit(edit: CourseEdit): CourseEditResult;
  /** 검증 → 결제 → 교체를 한 동기 경계에서 수행한다. 결제 거절이면 null */
  confirmEdit(edit: CourseEdit, spend: (amount: number) => boolean): CourseEditResult | null;
  confirmEdit(edit: CourseEdit, spend?: (amount: number) => boolean): CourseEditResult | null {
    const index = this.items.findIndex((course) => course.handle === edit.handle);
    if (index < 0) throw new Error(`편집할 코스가 없습니다: ${edit.handle}`);
    if (JSON.stringify(this.items[index]) !== JSON.stringify(edit.original)) {
      throw new Error(`편집 중 코스가 바뀌었습니다: ${edit.handle}`);
    }
    const next = clonePlacedCourse({ handle: edit.handle, ...edit.draft });
    const charge = Math.max(0, courseInvestment(next) - courseInvestment(edit.original));
    // 검증이 모두 끝난 뒤, 실제 교체 직전에만 결제한다 — 이 사이에는 외부 콜백이 없고 마지막 쓰기는 배열 한 칸 교체뿐이다
    if (spend && !spend(charge)) return null;
    this.items[index] = next;
    this.version++;
    return { course: clonePlacedCourse(next), charge };
  }

  /** 오늘 코스 합계 — 유지비는 `Game.dailyMaintenance` 가, 잠재 탑승·매출은 P4-C 가 쓴다 */
  daily(): CourseDayPotential {
    let potentialRevenue = 0;
    let upkeep = 0;
    let thrillSum = 0;
    let safetySum = 0;
    let potentialRiders = 0;
    for (const c of this.items) {
      const equip = courseEquipment(c.equipId);
      if (!equip) continue;
      const r = evaluateCourse(c.dock, c.handles, equip, c.presetId, c.vehicles, c.towBoatId);
      potentialRevenue += r.potentialDailyRevenue;
      upkeep += r.dailyUpkeep;
      thrillSum += r.thrill;
      safetySum += r.safety;
      potentialRiders += r.potentialDailyRiders;
    }
    const n = Math.max(1, this.items.length);
    return { potentialRevenue, upkeep, thrill: thrillSum / n, safety: safetySum / n, potentialRiders };
  }

  toSnapshot(): CourseSnapshot {
    // 파생 가능하면 안 쓴다 — `owned` 가 `start` ∪ 놓인 코스의 기구와 같으면 필드를 뺀다 (옛 세이브 바이트 보존)
    const derived = new Set<string>(startEquipmentIds());
    for (const c of this.items) derived.add(c.equipId);
    const extra = [...this.owned].some((id) => !derived.has(id));
    return {
      courses: this.items.map(clonePlacedCourse),
      nextHandle: this.nextHandle,
      ...(extra ? { owned: [...this.owned].sort() } : {}),
    };
  }

  /** 스냅샷을 이 저장소에 싣는다 (다른 스토어와 같은 인스턴스 방식) */
  fromSnapshot(s: CourseSnapshot): void {
    this.items = s.courses.map(clonePlacedCourse);
    this.nextHandle = s.nextHandle;
    // 옛 세이브 방어 — `owned` 가 없으면 놓인 코스의 기구를 전부 넣는다 (`start` 는 생성자가 이미 넣었다)
    for (const id of s.owned ?? this.items.map((c) => c.equipId)) if (courseEquipment(id)) this.owned.add(id);
    this.version++;
  }

  static fromSnapshot(s: CourseSnapshot): CourseStore {
    const st = new CourseStore();
    st.fromSnapshot(s);
    return st;
  }
}

function clonePlacedCourse(course: PlacedCourse): PlacedCourse {
  return { ...course, dock: { ...course.dock }, handles: course.handles.map((handle) => ({ ...handle })) };
}

function courseInvestment(course: PlacedCourse): number {
  const equipment = courseEquipment(course.equipId);
  return equipment ? equipment.vehicleCost * Math.max(0, course.vehicles) : 0;
}

/** 데이터 검증 — 빠짐없는 적합도 · 쓸 수 있는 형태/기구 · 돈 눈금(G) */
export function validateCourseData(): string[] {
  const problems: string[] = [];
  if (PRESETS.length !== 6) problems.push(`프리셋이 6종이 아니다: ${PRESETS.length}`);
  if (COURSE_EQUIPMENT.length !== 30) problems.push(`기구가 30종이 아니다: ${COURSE_EQUIPMENT.length}`);
  if (TOW_BOATS.length !== 2) problems.push(`견인 보트가 2종이 아니다: ${TOW_BOATS.length}`);
  if (!towBoatDef(DEFAULT_TOW_BOAT_ID)) problems.push('기본 견인 보트가 없다');
  for (const boat of TOW_BOATS) {
    if (boat.speedMult <= 0 || boat.upkeepMult <= 0) problems.push(`${boat.id} — profile 배율이 0 이하`);
  }
  for (const p of PRESETS) {
    if (p.handles < 2 || p.handles > 4) problems.push(`${p.id} — 핸들이 2~4개가 아니다`);
    if (p.waterNeed <= 0) problems.push(`${p.id} — waterNeed 가 0 이하`);
    if (p.grade < 1 || p.grade > 6) problems.push(`${p.id} — grade 는 랭크+1 (1~6) 이어야 한다`);
  }
  const ids = new Set<string>();
  for (const e of COURSE_EQUIPMENT) {
    if (ids.has(e.id)) problems.push(`${e.id} — id 중복`);
    ids.add(e.id);
    if (e.speed <= 0 || e.capacity < 1 || e.boardTicks < 0) problems.push(`${e.id} — 성능값이 이상하다`);
    // 돈 눈금(G): 화장실 800G · 대형 슬라이드 13,500G 와 같은 축 — 부모 ₩/10 값이 섞이면 한 항목이 100배가 된다
    if (e.vehicleCost < 1000 || e.vehicleCost > 30000) problems.push(`${e.id} — vehicleCost ${e.vehicleCost} 가 G 눈금 밖`);
    if (e.fee < 20 || e.fee > 200) problems.push(`${e.id} — fee ${e.fee} 가 G 눈금 밖 (탑승 1회 20~200G)`);
    if (e.upkeep < 5 || e.upkeep > 300) problems.push(`${e.id} — upkeep ${e.upkeep} 가 하루 G 눈금 밖`);
    const row = COURSE_DATA.fit[e.id];
    if (!row) {
      problems.push(`${e.id} — 적합도 행이 없다`);
      continue;
    }
    for (const p of PRESETS) if (!row[p.id]) problems.push(`${e.id} × ${p.id} — 적합도가 없다`);
    if (PRESETS.every((p) => row[p.id] === 'no')) problems.push(`${e.id} — 쓸 수 있는 형태가 없다`);
  }
  const starts = startEquipmentIds();
  if (starts.length !== 2) problems.push(`시작 기구가 둘이 아니다: ${starts.join(',')}`);
  for (const p of PRESETS) {
    if (COURSE_EQUIPMENT.every((e) => fitOf(e.id, p.id) === 'no')) problems.push(`${p.id} — 탈 수 있는 기구가 없다`);
  }
  return problems;
}

export { splineLength, type Vec2, type SplineSample };

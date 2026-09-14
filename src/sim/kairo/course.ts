import rawCourses from '../../data/kairo-courses.json' with { type: 'json' };
import rawEquipment from '../../data/kairo-equipment.json' with { type: 'json' };
import rawTowBoats from '../../data/kairo-tow-boats.json' with { type: 'json' };
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
  /**
   * 새 판에서 **이미 갖고 있는가** (P3). 물려받은 빠지가 굴리던 **둘**이다.
   *
   * ⚠ 처음엔 하나였다. 그러면 초반 내내 요금 900·정원 3 짜리 하나로만 코스를 돌게 되어
   * **코스 매출이 14% → 9% 로 눌렸다** (`--no-shop` 대조군이 상점이 아니라 이 게이트가
   * 원인이라고 말했다). 둘째를 **가장 싼 축**(요금 1,000·정원 4)으로 준 것은 게이트를
   * 열려는 게 아니라 **바닥을 한 칸 올리려는** 것이다 — 좋은 장비는 여전히 사야 한다.
   * ⚠ 셋 이상 주면 상점의 첫 결정(「무엇부터 살까」)이 첫 주에 사라진다.
   */
  start?: boolean;
}

/** 견인 장비 15종이 공유하는 보트 profile — 장비×프리셋 수제 조합표가 아니다. */
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
export const COURSE_EQUIPMENT: readonly CourseEquipment[] = (
  rawEquipment as unknown as { equipment: CourseEquipment[] }
).equipment;
export const TOW_BOATS: readonly TowBoatDef[] = (
  rawTowBoats as unknown as { boats: TowBoatDef[] }
).boats;
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

/** 자체동력 장비는 어떤 선택값이 와도 견인선을 쓰지 않는다. */
export function towBoatForEquipment(
  equip: CourseEquipment,
  towBoatId?: string,
): TowBoatDef | null {
  if (equip.kind === 'power') return null;
  return towBoatDef(towBoatId ?? DEFAULT_TOW_BOAT_ID) ?? towBoatDef(DEFAULT_TOW_BOAT_ID) ?? null;
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
  /** 코스 시작점 — 앵커 모드에서는 **선착장 시설의 칸**이다 (Q10) */
  tip: Vec2;
  /** 뭍 → 끝 방향 (정규화 안 함. `defaultHandles` 가 정규화한다) */
  dir: Vec2;
  /** 이 후보의 칸 수 — UI 가 "3칸" 처럼 보여준다 (앵커 모드: 선착장 + 이어진 잔교) */
  tiles: number;
  /**
   * 이 후보의 **영역** (Q10, 앵커 모드만) — 선착장 무리 ∪ 이어진 잔교 칸들.
   *
   * ⚠ 왜 필요한가: 코스는 자기 `dock` 좌표를 저장하는데, 물려받은 코스는 그 좌표가
   * **잔교 끝**이고 새 후보의 `tip` 은 **선착장 칸**이라 정확히 일치하지 않는다.
   * 「이 후보에 코스가 있나」를 점 하나로 재면 옛 코스가 전부 「빈 후보」로 보인다 —
   * `dockTaken` 이 이 영역으로 잰다.
   */
  claim?: Vec2[];
}

export function dockCandidates(
  decks: readonly Vec2[],
  gate: Vec2,
  /**
   * 선착장(견인 스테이션) 시설의 발자국 칸들 (K45 → Q10).
   *
   * ## Q10 — **선착장이 곧 시작점이다**
   *
   * ⚠ K45 의 배선은 절반이었다: 선착장은 잔교의 **필터**일 뿐이고 코스는 여전히
   * **잔교 끝**에서 시작했다. 그래서 ① 잔교가 길면 코스가 선착장에서 멀리 떨어진
   * 데크 끝에서 출발하고, ② 플로팅덱을 이어 붙이면 잔교 무리가 합쳐져 **끝이 옮겨지고**,
   * ③ 「선착장에서 견인이든 수상기구든 띄운다」는 구조가 화면에서 안 읽혔다
   * (사용자 지적, 2026-09-01).
   *
   * 이제 앵커가 주어지면 **선착장 무리 하나가 후보 하나**다 — `tip` 은 선착장 칸이고,
   * 잔교는 걸어가는 길일 뿐이다. dock 시설 note("견인 프리셋 루프 시작점")의 원래 뜻이다.
   * 생략하면 예전처럼 모든 잔교가 후보다 (기존 테스트 호환).
   */
  anchors?: readonly Vec2[],
): DockChoice[] {
  const key = (v: Vec2): string => `${v.x},${v.y}`;
  const d2 = (v: Vec2): number => (v.x - gate.x) ** 2 + (v.y - gate.y) ** 2;

  if (anchors !== undefined) {
    // ── 앵커 모드 (production) — 선착장 무리 하나 = 후보 하나 ──
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
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: c.x + dx, y: c.y + dy };
          if (!pool.has(key(n)) || seen.has(key(n))) continue;
          seen.add(key(n));
          stack.push(n);
        }
      }
      // 이어진 잔교 — 무리에 붙은 데크에서 flood (claim 과 방향에 쓴다)
      const pier: Vec2[] = [];
      const pierSeen = new Set<string>();
      const pierStack: Vec2[] = [];
      for (const g of group) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: g.x + dx, y: g.y + dy };
          const k = key(n);
          // ⚠ 선착장 자신(layer water)도 decks 목록에 섞여 온다 — 앵커는 잔교가 아니다
          if (!deckSet.has(k) || pool.has(k) || pierSeen.has(k)) continue;
          pierSeen.add(k);
          pierStack.push(n);
        }
      }
      while (pierStack.length > 0) {
        const c = pierStack.pop() as Vec2;
        pier.push(c);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: c.x + dx, y: c.y + dy };
          const k = key(n);
          if (!deckSet.has(k) || pool.has(k) || pierSeen.has(k)) continue;
          pierSeen.add(k);
          pierStack.push(n);
        }
      }

      let tip = group[0] as Vec2;
      for (const g of group) if (d2(g) > d2(tip)) tip = g;
      /*
       * 방향 — **게이트 반대쪽** 하나다 (예전 「한 칸 잔교」 규칙의 일반화).
       *
       * ⚠ 처음엔 「잔교에서 멀어지는 쪽」으로 했다가 되돌렸다: 선착장은 잔교 **옆면**에도
       * 붙는다 (시작 킷이 실제로 di=±1~5 로 옆에 놓는다). 그때 「잔교 반대쪽」은 물이
       * 아니라 **강기슭과 나란한 방향**이라, 제안 핸들이 뭍에 떨어져 `물 위가 아닙니다`
       * 가 났다 (게이트 실측). 게이트는 언제나 뭍에 있으므로 그 반대가 곧 물이다.
       */
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

  // ── 잔교 모드 (앵커 생략 — 기존 테스트 호환) ──
  if (decks.length === 0) return [];
  const groupAnchored = (_group: readonly Vec2[]): boolean => true;
  const pool = new Map<string, Vec2>();
  for (const d of decks) pool.set(key(d), { x: d.x, y: d.y });

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
    if (groupAnchored(group)) {
      out.push({
        tip: { ...tip },
        dir: dir.x === 0 && dir.y === 0 ? { x: 0, y: 1 } : dir,
        tiles: group.length,
      });
    }
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
  | 'no-equipment'
  /** 산 적 없는 장비 (P3) — 고를 수는 있어도 확정은 못 한다 */
  | 'not-owned'
  | 'dock-taken'
  /** 루트가 물 위 시설(덱·선착장…)을 가로지른다 (Q10) */
  | 'route-blocked'
  | 'overlap';

/**
 * 거절 메시지는 **방법까지** 말한다 (저장소 규칙 — "자리 없음 · 건물을 넓히세요").
 * "안 됩니다"만 주면 플레이어는 무엇을 고쳐야 하는지 모른다.
 */
export const COURSE_ISSUE_TEXT: Record<CourseIssueKind, string> = {
  'not-water': '물 위가 아닙니다',
  'too-narrow': '이 형태를 놓기엔 수면이 좁습니다',
  'far-from-dock': '선착장에서 너무 멉니다',
  'blocked-combo': '이 장비로는 이 형태를 못 탑니다',
  'locked-preset': '아직 안 열린 형태입니다',
  'no-equipment': '장비를 고르세요',
  'not-owned': '아직 없는 장비입니다 — 상점에서 사세요',
  'dock-taken': '이 잔교에 이미 코스가 있습니다 — 다른 잔교를 고르세요',
  'route-blocked': '루트가 물 위 시설을 지나갑니다 — 핸들을 옮겨 피하세요',
  overlap: '기존 코스와 너무 가깝습니다 — 핸들을 옮겨 떨어뜨리세요',
};

/** 선착장에서 코스 시작점까지 허용 거리 (§7.7 "3타일 이내"를 격자 단위로) */
export const DOCK_REACH_TILES = 4;

/** 필요 수면을 잴 때 코스 경계 상자에 두는 여유 (타일) */
export const WATER_MARGIN = 3;

/**
 * 코스끼리 떨어져 있어야 하는 거리 (타일).
 *
 * ## 왜 필요했나 (실측)
 *
 * 판정이 **자기 자신만** 봤다 — 물인가, 선착장에서 가까운가, 수면이 넓은가. "이미 코스가
 * 있는 물"은 안 봤다. 그래서 현금만 있으면 같은 잔교·같은 좌표에 코스가 무한히 쌓였고
 * (실측: 잔교 43,32 에 넷), 플레이어에게는 "장비를 19종 바꿔도 위치가 안 변한다"로 보였다.
 *
 * 3칸인 이유: 견인 장비의 항적과 손님이 오가는 폭이 대략 그만큼이다. 더 크게 잡으면
 * 좁은 강에서 코스를 둘 놓을 수 없다.
 */
export const COURSE_CLEAR_TILES = 3;

/** 같은 칸인가 — 핸들은 소수 좌표를 갖지만 잔교는 칸이다 */
function sameTile(a: Vec2, b: Vec2): boolean {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

/**
 * 그 후보에서 시작하는 코스가 이미 있는가.
 *
 * ⚠ **Q10 부터 `claim` 영역으로 잰다.** 앵커 모드의 `tip` 은 선착장 칸인데, 물려받은
 * 코스의 저장된 `dock` 은 **잔교 끝 좌표**라 점 비교로는 절대 안 맞는다 — 옛 코스가
 * 전부 「빈 후보」로 보여 제안이 찬 잔교를 다시 가리킨다 (K37 이 고친 그 버그의 재발 형태).
 * `claim`(선착장 ∪ 이어진 잔교) 안이거나 그 8-이웃이면 「이 후보의 코스」로 본다.
 * `claim` 이 없으면(잔교 모드) 예전처럼 점 비교다.
 */
export function dockTaken(
  tip: Vec2,
  others: readonly PlacedCourse[],
  claim?: readonly Vec2[],
): boolean {
  if (claim === undefined || claim.length === 0) {
    return others.some((o) => sameTile(o.dock, tip));
  }
  return others.some((o) =>
    claim.some(
      (c) => Math.abs(o.dock.x - c.x) <= 1 && Math.abs(o.dock.y - c.y) <= 1,
    ),
  );
}

/** 코스가 없는 첫 잔교. 전부 찼으면 −1. `docks()` 는 게이트에서 가까운 순이다 */
export function firstFreeDock(
  docks: readonly DockChoice[],
  others: readonly PlacedCourse[],
): number {
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

/**
 * 이 코스와 기존 코스들 사이의 거리. **판정과 기본 제안이 같은 자를 쓴다** —
 * 다른 자를 쓰면 "제안한 자리가 곧바로 판정에 막힌다"가 된다.
 *
 * 순수 함수다. 기존 코스 목록은 부르는 쪽이 넘긴다 (`CourseStore` 를 여기서 읽으면
 * 테스트가 상태를 세워야 한다).
 */
export function courseGap(
  dock: Vec2,
  handles: readonly Vec2[],
  others: readonly PlacedCourse[],
): CourseGap {
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
    // 어느 핸들을 옮기면 되는지까지 말한다 (§7.3 "핸들이 빨개지고 지표에 사유 표시")
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
  /** 코스 주변의 물 타일 수 */
  waterTiles: number;
}

/**
 * 코스 판정. **핸들별로** 무엇이 잘못됐는지 돌려준다 — "안 됩니다"만 주면 플레이어가
 * 어느 핸들을 옮겨야 하는지 모른다 (§7.3 "핸들이 빨개지고 지표에 사유 표시").
 *
 * `others` 는 **이미 놓인 코스**다. 안 넘기면 예전과 똑같이 동작한다 (하위호환) —
 * 넘기는 쪽이 정한다. 여기서 `CourseStore` 를 읽지 않는 이유는 판정을 순수하게 두기
 * 위해서다. 편집 중이라면 부르는 쪽이 **자기 자신을 빼서** 넘긴다.
 */
export function validateCourse(
  terrain: KairoTerrain,
  handles: readonly Vec2[],
  dock: Vec2,
  preset: PresetDef,
  equipId: string | null,
  grade: number,
  others: readonly PlacedCourse[] = [],
  /** 기존 코스 편집 때 자기 자신을 비교 대상에서 빼는 stable handle */
  excludeHandle?: number,
  /**
   * 지금 **가진** 장비 (P3). 안 넘기면 소유를 안 본다 — 옛 호출부와 지형 단위 검사가
   * 그대로 돌아야 하기 때문이다.
   *
   * ⚠ **production 은 반드시 넘긴다.** 안 넘기면 「산 적 없는 장비로 코스를 세운다」가
   * 조용히 돌아온다 — 그래서 `course-ownership.test.ts` 의 정적 검사가 호출부를 지킨다.
   */
  owned?: ReadonlySet<string>,
  /**
   * **갈 수 없는 물 칸** (Q10) — 물 위 시설(플로팅덱·선착장·트램펄린…)의 발자국.
   *
   * ⚠ 안 넘기면 안 본다 (지형 단위 검사 호환). **production 은 반드시 넘긴다** —
   * 안 넘기면 코스가 덱 위를 지나가고 보트가 시설을 뚫는다 (사용자 지적: 플로팅덱으로
   * 루트를 막을 수 있었다). 정적 검사가 호출부를 지킨다.
   */
  blocked?: ReadonlySet<string>,
  /**
   * 지금 고른 후보의 영역 (Q10, `DockChoice.claim`). 물려받은 코스는 `dock` 이 잔교 끝이라
   * 후보 tip(선착장 칸)과 점으로는 안 맞는다 — 영역으로 재야 `dock-taken` 이 제 이름으로
   * 나온다 (안 재면 `overlap` 으로 흘러 처방이 「핸들을 옮겨라」가 된다 — 실측).
   */
  dockClaim?: readonly Vec2[],
): CourseValidation {
  const issues: CourseIssueKind[] = [];
  const badHandles: number[] = [];

  if (equipId === null) issues.push('no-equipment');
  else {
    if (fitBlocked(equipId, preset.id)) issues.push('blocked-combo');
    // 소유는 적합도와 **다른 축**이다 — 맞는 장비인데 아직 없을 수 있다
    if (owned !== undefined && !owned.has(equipId)) issues.push('not-owned');
  }
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

  /*
   * ── 겹침 (K37) ──
   *
   * ⚠ **자기 자신의 문제를 먼저 본다.** 물이 아닌 코스에 "다른 잔교를 고르세요"라고
   * 말하면 플레이어는 엉뚱한 데를 고친다. 위 판정들이 먼저 `issues` 에 들어간다.
   *
   * ⚠ 같은 잔교면 겹침은 **반드시** 난다 (시작점이 같은 점이다). 둘을 같이 말하면
   * 처방이 흐려지므로 `dock-taken` 하나만 말한다 — 옮겨야 하는 것은 핸들이 아니라 잔교다.
   */
  const comparisonCourses =
    excludeHandle === undefined ? others : others.filter((course) => course.handle !== excludeHandle);
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

  /*
   * ── 루트 차단 (Q10) — 표본이 물 위 시설을 지나면 안 된다 ──
   *
   * ⚠ 핸들만 보면 안 된다: 핸들 둘이 다 물인데 그 **사이 곡선**이 덱을 가로지를 수 있다.
   * 그래서 겹침 검사와 같은 표본(`sampleCourse`)으로 잰다.
   * ⚠ 시작점 주변(1.6칸)은 건너뛴다 — 출발지가 곧 선착장 칸이다.
   */
  if (blocked !== undefined && blocked.size > 0) {
    const samples = sampleCourse(dock, handles);
    let hit = false;
    for (const sample of samples) {
      const sp = sample.pos;
      if (Math.hypot(sp.x - dock.x, sp.y - dock.y) < 1.6) continue;
      if (!blocked.has(`${Math.round(sp.x)},${Math.round(sp.y)}`)) continue;
      hit = true;
      // 가장 가까운 핸들을 빨갛게 — 어느 쪽을 옮길지 화면이 말할 수 있어야 한다
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

/**
 * 놓인 코스들의 **루트 칸** (Q10) — 배치가 코스를 막지 못하게 `placement.check` 에 넘긴다.
 * 겹침·차단 검사와 같은 표본을 쓴다 — 자가 둘이면 반드시 어긋난다.
 */
export function courseRouteTiles(courses: readonly PlacedCourse[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const c of courses) {
    for (const sample of sampleCourse(c.dock, c.handles)) {
      out.add(`${Math.round(sample.pos.x)},${Math.round(sample.pos.y)}`);
    }
  }
  return out;
}

/** 스플라인 표본. 선착장을 시작점으로 넣어 "선착장에서 출발한다"가 형태에 반영된다 */
export function sampleCourse(dock: Vec2, handles: readonly Vec2[]): SplineSample[] {
  return sampleSpline([dock, ...handles], 12);
}

/**
 * 지도 탭이 운행 중인 코스(또는 그 위의 차량)를 가리키는지 판정한다.
 *
 * 힌트 테스트나 렌더 바운딩박스를 쓰지 않고 정본 스플라인 표본을 쓴다. 따라서 보트가
 * 어디에 그려지든 탭의 뜻은 sim 경로와 같다. 거리가 같으면 저장 순서의 첫 handle이다.
 */
export function courseAtTile(
  courses: readonly PlacedCourse[],
  tile: Vec2,
  tolerance = 1.35,
): number | null {
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

/** 핸들 전체를 잔교의 **옆 방향**으로 민다 — 앞뒤로 밀면 코스가 잔교에서 멀어진다 */
function shiftHandles(handles: readonly Vec2[], dir: Vec2, amount: number): Vec2[] {
  if (amount === 0) return handles.map((h) => ({ ...h }));
  const len = Math.hypot(dir.x, dir.y) || 1;
  const r = { x: -dir.y / len, y: dir.x / len };
  return handles.map((h) => ({ x: h.x + r.x * amount, y: h.y + r.y * amount }));
}

export interface CourseSuggestion {
  /** 고른 잔교 번호. 후보가 없으면 −1 */
  dockIndex: number;
  handles: Vec2[];
  /** 옆으로 민 칸 수 — 0 이면 기본 자리 그대로 */
  shift: number;
}

/** 옆으로 밀어 보는 순서 — 좌우 번갈아 (한쪽만 보면 강가에서 늘 뭍으로 민다) */
const SHIFT_STEPS = [0, 1, -1, 2, -2, 3, -3];

/**
 * 기본 제안 — **빈 잔교를 먼저 고르고**, 필요하면 옆으로 밀어 본다.
 *
 * ## 왜 (실측)
 *
 * 예전 `resetHandles()` 는 `defaultHandles(preset, tip, dir, 8)` 하나였다. 기존 코스를
 * 모르니 이미 코스가 있는 잔교를 다시 고르고, 이미 쓰는 물을 다시 제안했다. 프리셋·장비를
 * 아무리 바꿔도 좌표가 같았고, 확정하면 앞의 것 위에 겹쳤다.
 *
 * ⚠ **처음부터 유효한 자리만 주려고 하지 않는다** (`defaultHandles` 의 원칙 그대로).
 * 몇 번 밀어 보고 못 찾으면 그냥 제안하고 판정이 막게 둔다 — 좁은 강에서 프리셋이 통째로
 * 안 나오면 플레이어는 이유를 모른다. 대신 밀어는 둔다: 겹친 채로 겹쳐 보이면 화면에서
 * 무엇이 문제인지 안 읽힌다.
 *
 * `pinned` 는 **플레이어가 지도에서 직접 고른 잔교**다 — 그때는 찼더라도 그 잔교를 쓴다
 * (판정이 "다른 잔교를 고르세요"라고 말해 준다). 안 그러면 탭이 무시된 것처럼 보인다.
 */
export function suggestCourse(
  preset: PresetDef,
  docks: readonly DockChoice[],
  others: readonly PlacedCourse[],
  opts: { span?: number; dockIndex?: number; pinned?: boolean } = {},
): CourseSuggestion {
  if (docks.length === 0) return { dockIndex: -1, handles: [], shift: 0 };
  const span = opts.span ?? 8;
  const cur = Math.max(0, Math.min(docks.length - 1, opts.dockIndex ?? 0));
  const free = firstFreeDock(docks, others);
  const pick = opts.pinned === true ? cur : free >= 0 ? free : cur;
  const choice = docks[pick] as DockChoice;
  const base = defaultHandles(preset, choice.tip, choice.dir, span);
  if (others.length === 0) return { dockIndex: pick, handles: base, shift: 0 };

  const step = COURSE_CLEAR_TILES + 1;
  for (const k of SHIFT_STEPS) {
    const moved = shiftHandles(base, choice.dir, k * step);
    if (courseGap(choice.tip, moved, others).gap >= COURSE_CLEAR_TILES) {
      return { dockIndex: pick, handles: moved, shift: k };
    }
  }
  // 못 찾았다 — 기존 코스 수만큼 옆으로 밀어 제안하고, 막는 것은 판정에 맡긴다
  const stacked = others.filter((o) => sameTile(o.dock, choice.tip)).length || 1;
  return {
    dockIndex: pick,
    handles: shiftHandles(base, choice.dir, stacked * step),
    shift: stacked,
  };
}

export interface CourseResult extends CourseMetrics {
  fit: FitRating;
  /** 선택된 견인선. 자체동력 장비면 null */
  towBoatId: string | null;
  /** 수요가 충분할 때 가능한 주간 탑승객 */
  potentialWeeklyRiders: number;
  /** @deprecated 잠재 처리량의 기존 이름. 실제 탑승은 `WeekReport.courseRiders` 다. */
  weeklyRiders: number;
  /** 적합도 반영 후 만족도 배율 */
  satisfactionMult: number;
  /** 수요가 충분할 때 가능한 주간 매출 */
  potentialWeeklyRevenue: number;
  /** @deprecated 잠재 매출의 기존 이름. 실제 매출은 `WeekReport.courseRevenue` 다. */
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
  towBoatId?: string,
): CourseResult {
  const samples = sampleCourse(dock, handles);
  const preset = presetDef(presetId);
  const boat = towBoatForEquipment(equip, towBoatId);
  const base = computeMetrics({
    samples,
    def: {
      id: equip.id,
      name: equip.name,
      sprite: equip.sprite,
      speed: equip.speed * (boat?.speedMult ?? 1),
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
    Math.min(
      boat?.thrillCap ?? 100,
      base.thrill * equip.thrillCoef * (eff?.thrill ?? 1) * (boat?.thrillMult ?? 1),
    ),
  );
  const safety = Math.max(
    0,
    Math.min(
      100,
      base.safety +
        (boat?.safetyBase ?? 0) -
        base.sharpFraction * (boat?.sharpSafetyPenalty ?? 0),
    ),
  );
  const cycles = base.cycleTicks > 0 ? KAIRO_TICKS_PER_WEEK / base.cycleTicks : 0;
  const potentialWeeklyRiders = Math.round(cycles * equip.capacity * vehicles);
  const potentialWeeklyRevenue = potentialWeeklyRiders * equip.fee;
  return {
    ...base,
    thrill,
    safety,
    fit,
    towBoatId: boat?.id ?? null,
    satisfactionMult: eff?.satisfaction ?? 1,
    potentialWeeklyRiders,
    weeklyRiders: potentialWeeklyRiders,
    potentialWeeklyRevenue,
    weeklyRevenue: potentialWeeklyRevenue,
    weeklyUpkeep: Math.round(equip.upkeep * vehicles * (boat?.upkeepMult ?? 1)),
  };
}

/** 코스가 한 주 동안 제공할 수 있는 잠재 공급. 입장객과 만나기 전 값이다. */
export interface CourseWeekPotential {
  potentialRiders: number;
  potentialRevenue: number;
  upkeep: number;
}

export interface RealizedCourseWeek {
  riders: number;
  revenue: number;
}

/**
 * 잠재 공급과 실제 수요를 결합한다. 평균 요금은 `잠재매출 / 잠재탑승` 한 벌에서만
 * 파생하므로 코스가 여러 개여도 결정론적이며, 수요 0이면 매출도 반드시 0이다.
 */
export function realizeCourseWeek(
  potential: CourseWeekPotential,
  wantingGuests: number,
): RealizedCourseWeek {
  const capacity = Math.max(0, Math.floor(potential.potentialRiders));
  const demand = Math.max(0, Math.floor(wantingGuests));
  const riders = Math.min(capacity, demand);
  if (riders === 0 || capacity === 0) return { riders: 0, revenue: 0 };
  const maximumRevenue = Math.max(0, potential.potentialRevenue);
  return { riders, revenue: Math.round((maximumRevenue * riders) / capacity) };
}

export interface PlacedCourse {
  handle: number;
  presetId: string;
  equipId: string;
  vehicles: number;
  dock: Vec2;
  handles: Vec2[];
  /** 견인 장비의 보트 profile. 없으면 작업형이며, 자체동력 장비는 무시한다 (v7 optional). */
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
  /** 장비 자산 증가분. 다운그레이드는 환불하지 않으므로 0 아래로 내려가지 않는다. */
  charge: number;
}

export interface CourseSnapshot {
  courses: PlacedCourse[];
  nextHandle: number;
  /**
   * 산 장비 (P3). **optional 이라 마이그레이션이 없다** — `visitorsTotal`·`specialty` 선례다.
   * 없으면 `fromSnapshot` 이 **지금 놓인 코스의 장비 ∪ `start` 장비**로 채운다:
   * 안 그러면 바나나보트로 돌던 코스가 로드 직후 무효가 된다.
   */
  owned?: string[];
}

/**
 * 놓인 코스들. 시설과 따로 두는 이유는 **점유 격자가 다르기** 때문이다 —
 * 코스는 물 위의 곡선이라 타일을 점유하지 않는다 (손님은 선착장으로 간다).
 */
export class CourseStore {
  private readonly items: PlacedCourse[] = [];
  private nextHandle = 1;
  /**
   * 산 장비 (P3). **`UnlockStore` 에 얹지 않는다** — 그 파일은 「시설의 해금 상태」이고
   * `unlock-graph.test.ts` 가 「없는 시설:」로 장비 id 를 잡을 위험이 있다.
   */
  private readonly owned = new Set<string>(
    COURSE_EQUIPMENT.filter((e) => e.start === true).map((e) => e.id),
  );

  get all(): readonly PlacedCourse[] {
    return this.items;
  }

  get count(): number {
    return this.items.length;
  }

  /** 지금 가진 장비 — `validateCourse` 가 이걸 받아 `not-owned` 를 낸다 */
  get ownedEquipment(): ReadonlySet<string> {
    return this.owned;
  }

  /** 상점이 부른다. 이미 가진 것이면 `false` (돈이 두 번 나가면 안 된다) */
  grantEquipment(id: string): boolean {
    if (!courseEquipment(id) || this.owned.has(id)) return false;
    this.owned.add(id);
    return true;
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

  /** 저장소와 참조를 공유하지 않는 편집 초안. 열기만 해서는 상태가 한 바이트도 안 바뀐다. */
  beginEdit(handle: number): CourseEdit | null {
    const found = this.items.find((course) => course.handle === handle);
    if (!found) return null;
    const original = clonePlacedCourse(found);
    const { handle: stableHandle, ...draft } = clonePlacedCourse(found);
    return { handle: stableHandle, original, draft };
  }

  /** 취소는 명시적인 no-op이며 원본 사본을 돌려준다. */
  cancelEdit(edit: CourseEdit): PlacedCourse {
    return clonePlacedCourse(edit.original);
  }

  /** 같은 초안은 같은 교체와 같은 차액을 만든다. */
  confirmEdit(edit: CourseEdit): CourseEditResult;
  /** 검증 → 결제 → 교체를 한 동기 경계에서 수행한다. 결제 거절이면 null. */
  confirmEdit(edit: CourseEdit, spend: (amount: number) => boolean): CourseEditResult | null;
  confirmEdit(
    edit: CourseEdit,
    spend?: (amount: number) => boolean,
  ): CourseEditResult | null {
    const index = this.items.findIndex((course) => course.handle === edit.handle);
    if (index < 0) throw new Error(`편집할 코스가 없습니다: ${edit.handle}`);
    if (JSON.stringify(this.items[index]) !== JSON.stringify(edit.original)) {
      throw new Error(`편집 중 코스가 바뀌었습니다: ${edit.handle}`);
    }
    const next = clonePlacedCourse({ handle: edit.handle, ...edit.draft });
    const charge = Math.max(0, courseInvestment(next) - courseInvestment(edit.original));
    /*
     * 검증이 모두 끝난 뒤, 실제 교체 직전에만 결제한다. 이 사이에는 await도 외부 콜백도
     * 없고 마지막 쓰기는 배열 한 칸 교체뿐이라 confirm 실패가 현금만 남길 수 없다.
     */
    if (spend && !spend(charge)) return null;
    this.items[index] = next;
    return { course: clonePlacedCourse(next), charge };
  }

  /** 이번 주 코스 합계 — 결산이 이걸 더한다 */
  weekly(): CourseWeekPotential & { thrill: number; safety: number } {
    let potentialRevenue = 0;
    let upkeep = 0;
    let thrillSum = 0;
    let safetySum = 0;
    let potentialRiders = 0;
    for (const c of this.items) {
      const equip = courseEquipment(c.equipId);
      if (!equip) continue;
      const r = evaluateCourse(c.dock, c.handles, equip, c.presetId, c.vehicles, c.towBoatId);
      potentialRevenue += r.potentialWeeklyRevenue;
      upkeep += r.weeklyUpkeep;
      thrillSum += r.thrill;
      safetySum += r.safety;
      potentialRiders += r.potentialWeeklyRiders;
    }
    const n = Math.max(1, this.items.length);
    return {
      potentialRevenue,
      upkeep,
      thrill: thrillSum / n,
      safety: safetySum / n,
      potentialRiders,
    };
  }

  toSnapshot(): CourseSnapshot {
    /*
     * ⚠ **파생 가능하면 안 쓴다.** `owned` 가 `start` 장비 ∪ 놓인 코스의 장비와 같으면
     * `fromSnapshot` 이 그대로 복원하므로 필드를 넣을 이유가 없다 — 그리고 넣으면
     * 아무것도 안 산 옛 v7 세이브가 **바이트 보존을 잃는다** (검사가 그걸 고정한다).
     * `visitorsTotal`·`specialty` 가 optional 인 것과 같은 규칙이다.
     */
    const derived = new Set<string>(
      COURSE_EQUIPMENT.filter((e) => e.start === true).map((e) => e.id),
    );
    for (const c of this.items) derived.add(c.equipId);
    const extra = [...this.owned].some((id) => !derived.has(id));
    return {
      courses: this.items.map((c) => ({ ...c, dock: { ...c.dock }, handles: c.handles.map((h) => ({ ...h })) })),
      nextHandle: this.nextHandle,
      ...(extra ? { owned: [...this.owned].sort() } : {}),
    };
  }

  static fromSnapshot(s: CourseSnapshot): CourseStore {
    const st = new CourseStore();
    for (const c of s.courses) {
      st.items.push({ ...c, dock: { ...c.dock }, handles: c.handles.map((h) => ({ ...h })) });
    }
    st.nextHandle = s.nextHandle;
    /*
     * 옛 세이브 방어 — `owned` 가 없으면 **지금 놓인 코스의 장비**를 전부 넣는다.
     * 안 하면 바나나보트로 돌던 코스가 로드 직후 `not-owned` 로 무효가 된다.
     * (`start` 장비는 생성자가 이미 넣었다.)
     */
    for (const id of s.owned ?? st.items.map((c) => c.equipId)) {
      if (courseEquipment(id)) st.owned.add(id);
    }
    return st;
  }
}

function clonePlacedCourse(course: PlacedCourse): PlacedCourse {
  return {
    ...course,
    dock: { ...course.dock },
    handles: course.handles.map((handle) => ({ ...handle })),
  };
}

function courseInvestment(course: PlacedCourse): number {
  const equipment = courseEquipment(course.equipId);
  return equipment ? equipment.vehicleCost * Math.max(0, course.vehicles) : 0;
}

/** 데이터 검증 */
export function validateCourseData(): string[] {
  const problems: string[] = [];
  if (PRESETS.length !== 6) problems.push(`프리셋이 6종이 아니다: ${PRESETS.length}`);
  if (COURSE_EQUIPMENT.length !== 19) {
    problems.push(`장비가 19종이 아니다: ${COURSE_EQUIPMENT.length}`);
  }
  if (TOW_BOATS.length !== 2) problems.push(`견인 보트가 2종이 아니다: ${TOW_BOATS.length}`);
  if (!towBoatDef(DEFAULT_TOW_BOAT_ID)) problems.push('기본 견인 보트가 없다');
  for (const boat of TOW_BOATS) {
    if (boat.speedMult <= 0 || boat.upkeepMult <= 0) {
      problems.push(`${boat.id} — profile 배율이 0 이하`);
    }
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

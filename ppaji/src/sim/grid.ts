/**
 * 격자 — 워터파크의 땅.
 *
 * **96×72** 타일 (P43 — 레거시 카이로 씬 K36 과 같은 크기). 위 8줄은 도시 띠(가로수·차도 2·정류장·광장),
 * 그 아래 42줄이 마당(내 땅 — 입구 열 48 을 중심으로 좌우로 자란다), 마지막 22줄이 강이다.
 * PSS 실측(1280px 화면에 타일 40개, 32×16 텍셀)과 같은 밀도로 폰 393px·배율 1 에서 가로 12타일이 보인다.
 * 토지 밖은 같은 스케일의 장식 지형으로 덮는다(하늘·지도 경계 없음 — PSS 문법).
 *
 * `floor` 는 지면 종류 한 바이트다. 풀 타일의 **종류**(표준·핑크·카이로…)는 G1 이
 * (P49-a2) 물빛 종류 배열은 지웠다 — "여기가 풀인가"는 floor 코드 하나가 답한다.
 */
export const GRID_W = 96;
export const GRID_H = 72;

/** 지면 종류 코드. 순서를 바꾸면 세이브가 깨진다 — 끝에만 더할 것 */
export const FLOOR = {
  sand: 0,
  grass: 1,
  path: 2,
  indoor: 3,
  pool: 4,
  /** 빠지 스토리(P0): 강 · 여울(강가, 걸을 수 있음) · 데크(물 위 바닥) */
  river: 5,
  shallow: 6,
  deck: 7,
  /** P22 D28 지면 붓 — 걷는 포장 셋 · 조경 둘 (grounds.json 과 이름이 같다) */
  sandpath: 8,
  sidewalk: 9,
  woodpath: 10,
  flowerbed: 11,
  gravel: 12,
  /** P43 도시 띠의 차도 — 못 걷고 못 짓는다(격자 안이지만 내 땅 밖) */
  road: 13,
  /** P44 절벽 테두리 암반 — 잔디처럼 걷고 짓는다(레거시 K38: 짓는 자리를 줄이면 높이가 벌점이 된다), 그림만 다르다 */
  rock: 14,
  /** P45-a D63 — 실내 복도: 실내 덩어리의 일부(벽·덩어리 판정은 실내)이면서 걷는 통로. 복도가 건물 밖 통로에 닿는 변마다 문이 난다. 시설은 못 놓는다(복도는 비워 둔다) */
  hall: 15,
} as const;
export type FloorKind = keyof typeof FLOOR;
export type FloorCode = (typeof FLOOR)[FloorKind];

export const FLOOR_NAMES: readonly FloorKind[] = ['sand', 'grass', 'path', 'indoor', 'pool', 'river', 'shallow', 'deck', 'sandpath', 'sidewalk', 'woodpath', 'flowerbed', 'gravel', 'road', 'rock', 'hall'];
/** P22 — 손님이 걷는 포장 지면(길과 같은 규칙) · 조경 지면(못 걷는다, 자리 값) */
export const WALK_GROUNDS: ReadonlySet<number> = new Set([FLOOR.sandpath, FLOOR.sidewalk, FLOOR.woodpath]);
export const DECOR_GROUNDS: ReadonlySet<number> = new Set([FLOOR.flowerbed, FLOOR.gravel]);
export function isGround(c: number): boolean { return WALK_GROUNDS.has(c) || DECOR_GROUNDS.has(c); }
/** 길처럼 걷는 바닥 — 길·실내·데크·포장 지면 */
/** P40 D52 — 마당(내 땅의 잔디)은 어디든 걷는다(워터파크 스토리: 마당 바닥 전부가 걷는 바닥). 길·지면은 「바닥 바꾸기」다. 바깥은 모래라 안 걷는다 */
/** 실내 판정 — 실내 바닥과 복도 (P45-a) */
export function isIndoorCode(c: number): boolean { return c === FLOOR.indoor || c === FLOOR.hall; }
export function isWalkFloor(c: number): boolean { return c === FLOOR.grass || c === FLOOR.rock || c === FLOOR.hall || c === FLOOR.path || c === FLOOR.indoor || c === FLOOR.deck || WALK_GROUNDS.has(c); }
/** P44-c — 통로: 실내로 드는 문은 이 바닥이 닿은 변에만 난다(잔디는 아니다 — 「실내는 매표소와 이어진 통로로만」) */
export function isCorridorFloor(c: number): boolean { return c === FLOOR.path || c === FLOOR.deck || WALK_GROUNDS.has(c); }
/** 뭍의 마른 바닥(잔디·길·지면) — 시설을 놓거나 길을 잇는 후보 */
export function isLandFloor(c: number): boolean { return c === FLOOR.grass || c === FLOOR.rock || c === FLOOR.path || isGround(c); }

/** 강 띠(P0, D11 곧은 강 하나) — 지도를 가로지르는 8줄. 양 끝 줄은 여울. ★0 토지(j 32~47)가 아래 두 줄(32 강 · 33 여울)에 닿는다 */
/**
 * 물 (P14 D18 → P15 D21, 레거시 카이로 씬 그대로): 입구가 **위(강변 위쪽)**, 지도 **아래 22줄(46%)이 강**이다 — 건물 정면이 물을 본다.
 * 첫 줄(j = 26)만 여울(데크가 서는 물가), 아래는 전부 강. 건너편 둑은 없다.
 */
export const RIVER = { j0: 50, h: 22 } as const;
/**
 * 도시 띠 (P43, 레거시 K36 `CITY_BAND`): 마당 위 8줄. 0 가로수 · 1~2 차도 · 3 정류장(보도) · 4~7 진입 광장.
 * 걷지도 짓지도 못한다 — 손님은 입구 칸에 나타난다. 붙여 놓으면 「밖에서 안으로」가 안 읽힌다.
 */
export const CITY_BAND = 8;
export const ROAD_ROWS: readonly number[] = [1, 2];
export const STOP_ROW = 3;
/** 입구 열 — 지도 가로 한가운데. 랭크와 무관하게 고정이라 확장해도 손님 동선이 안 바뀐다 */
export const GATE_I = GRID_W / 2;
export function isRiverRow(j: number): boolean {
  return j >= RIVER.j0 && j < RIVER.j0 + RIVER.h;
}

/**
 * 물굽이 (P48-b1 → P48-b2 개정, §14 W1·W2) — 시드 없는 고정 기하. 출입동 남문 두 줄 아래 **만(灣)** 에서 왼쪽 아래 본류로 내려가는 S 자 수로.
 * P48-b2: 사용자 「자연스러운 S — 튀어나온 데는 지워도 된다」 → 네모 못 + 수로 두 조각을 **스플라인 한 관**으로 바꿨다: 제어점을 Catmull-Rom 으로 잇고
 * 표본마다 타원(가로 r · 세로 0.8r)을 찍는다. 만은 관의 위쪽 끝(둥근 마개)이고 `head` 는 킷 링이 앉는 6×6 자리표(서안·북안에 붙는다 — 그 칸들은 물이어야
 * 한다, p48b1.test 가 지킨다). 수로가 입구 열(48)을 끊는다 — 다리는 없다(W3). 마당 뭍은 동쪽 회랑으로 전부 닿는다(불변식 ④⑥). 안쪽 기슭 2칸·바깥 1칸이
 * 여울(깊이 = 지형, W2). RNG 0 · 순수 · 세이브 필드 0.
 */
export const BEND = {
  head: { i0: GATE_I + 2, j0: 24, w: 6, h: 6 },          // 킷 링 자리 — 열 50~55 · 행 24~29 (북안 행 23 은 뭍)
  pts: [[GATE_I + 6.5, 24.5], [GATE_I + 6.5, 29.5], [GATE_I + 11, 33.5], [GATE_I + 2, 38.5], [GATE_I - 8, 42.5], [GATE_I - 11, 46], [GATE_I - 6, 49.5]], // (열, 행) 위 → 본류 — 열이 동 → 서 → 동으로 흔들려야 화면에서 S 로 읽힌다(한 방향 굽이는 J 자였다, 사용자 스크린샷)
  half: [5.4, 5.0, 4.8, 3.8, 3.8, 4.4, 5.2],                   // 제어점마다 반폭 — 만 넓게 · 허리 좁게 · 어귀 넓게
  samples: 400,
  rimInner: 2, rimOuter: 1,                                // 여울 띠 폭 (안쪽 기슭 · 바깥 기슭)
} as const;
export type Bend = { head: { i0: number; j0: number; w: number; h: number }; pts: readonly (readonly [number, number])[]; half: readonly number[]; samples: number; rimInner: number; rimOuter: number };
/** Catmull-Rom(균일) — t∈[0,1] 을 제어점 사슬 위의 (열, 행) 으로 */
function bendPoint(t: number, b: Bend): [number, number] {
  const n = b.pts.length - 1;
  const u = Math.min(Math.max(t, 0), 1) * n, s = Math.min(Math.floor(u), n - 1), f = u - s;
  const P = (k: number): readonly [number, number] => b.pts[Math.min(Math.max(k, 0), n)]!;
  const p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2);
  const cr = (a: number, c: number, d: number, e: number): number => 0.5 * ((2 * c) + (-a + d) * f + (2 * a - 5 * c + 4 * d - e) * f * f + (-a + 3 * c - 3 * d + e) * f * f * f);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
}
/** 표본 t(0 위 … 1 본류)의 중심 열 */
export function bendCenter(t: number, b: Bend = BEND): number { return bendPoint(t, b)[0]; }
/** 표본 t 의 행 */
export function bendRow(t: number, b: Bend = BEND): number { return bendPoint(t, b)[1]; }
/** 표본 t 의 반폭 — 제어점 사이를 부드럽게(smoothstep) 잇는다 */
export function bendHalf(t: number, b: Bend = BEND): number {
  const n = b.pts.length - 1, u = Math.min(Math.max(t, 0), 1) * n, s = Math.min(Math.floor(u), n - 1), f = u - s, k = f * f * (3 - 2 * f);
  return (b.half[s] ?? 4) + ((b.half[s + 1] ?? b.half[s] ?? 4) - (b.half[s] ?? 4)) * k;
}
function bendCurv(t: number, b: Bend, h = 1 / b.samples): number { return bendCenter(t + h, b) - 2 * bendCenter(t, b) + bendCenter(t - h, b); }
/** 2회차 지도 — 입구 열(48) 기준 좌우 반전 (미결 ① 권고: 만든다). 거울은 `m(i) = 2·GATE_I − i` 이고 링 자리는 `m(i0+w−1)` 이 새 i0 (한 칸 오차 주의) */
export function bendVariant(v: 0 | 1): Bend {
  if (v === 0) return BEND;
  const m = (i: number): number => 2 * GATE_I - i;
  return { ...BEND, head: { ...BEND.head, i0: m(BEND.head.i0 + BEND.head.w - 1) }, pts: BEND.pts.map(([i, j]) => [m(i), j] as const) };
}

/**
 * 본류 (P48-b3, 사용자 빨간 선) — 본류 띠 자체가 S 다. 북안 행 `mainBank(i)` 는 열의 함수(Catmull-Rom): 왼쪽은 행 50(옛 자리) →
 * 건물 앞(열 46~58)에서 행 23 까지 올라와 정면을 따라 흐르고 → 오른쪽에서 다시 행 50 으로 내려간다. 띠 폭은 `width` 줄로 일정하고
 * 그 아래는 건너편 뭍(언덕이 얹힌다). 어귀 굽이(BEND)는 이제 안 판다 — 본류가 곧 만이다. `BEND.head` 는 킷 링 자리표로만 남는다.
 */
export const MAIN = {
  pts: [[-6, 50], [20, 50], [30, 42], [38, 28], [42, 25], [45, 24], [48, 24], [56, 24], [59, 24], [64, 25], [70, 32], [77, 43], [85, 50], [102, 50]] as readonly (readonly [number, number])[], // (열, 북안 행)
  width: 22, // 양끝에서 행 50~71 = 옛 강 띠 그대로(지도 밖 Surround 와 이음새 없음)
} as const;
/** 열 i 의 북안 행(실수) — 제어점 열 사이 Catmull-Rom */
export function mainBank(i: number): number {
  const P = MAIN.pts, n = P.length - 1;
  let s = 0; while (s < n - 1 && i >= P[s + 1]![0]) s++;
  const p1 = P[s]!, p2 = P[s + 1]!, p0 = P[Math.max(s - 1, 0)]!, p3 = P[Math.min(s + 2, n)]!;
  const f = Math.min(Math.max((i - p1[0]) / (p2[0] - p1[0]), 0), 1);
  const a = p0[1], c = p1[1], d = p2[1], e = p3[1];
  return 0.5 * ((2 * c) + (-a + d) * f + (2 * a - 5 * c + 4 * d - e) * f * f + (-a + 3 * c - 3 * d + e) * f * f * f);
}
/** 열 i 의 북안(물가) 정수 행 — 이 행부터 물 */
export function shoreRow(i: number): number { return Math.min(RIVER.j0, Math.round(mainBank(i))); } // 양끝 평지에서 스플라인이 살짝 넘치는 것을 옛 물가 행(50)으로 자른다
/** 물인가 (강·여울·풀) — 지형만 본다 */
export function isWaterCode(code: number): boolean {
  return code === FLOOR.pool || code === FLOOR.river || code === FLOOR.shallow;
}

export interface Rect {
  i0: number;
  j0: number;
  w: number;
  h: number;
}

/**
 * 랭크별 토지 (★0~★5). 게이트(입구)는 **아래 변(+J 쪽) 중앙**에 고정이고 토지는
 * 거기서 위·좌우로 자란다 — 확장할 때마다 입구 위치가 옮겨지면 손님 동선이 전부 바뀐다.
 */
export const LAND_BY_RANK: readonly (readonly [number, number])[] = [
  [40, 42], // P43: ★0 32 → P45-a 40(출입동 20×30 이 정문 가운데 들어간다) · ★1 44 · ★2 56 · ★3 72 · ★4 84 · ★5 96(지도 전폭). 둘째 값은 안 쓴다(높이는 도시 띠~물가 42 고정) // P40 D51: 마당 ★0 = 28×26(워터파크 1년차 마당 12×10 의 5.6배) — 확장은 랭크 사건, 울타리가 통째로 넓어진다 — ★0 열 24~39(블록 2 + 거리) · ★1 18~45(4) · ★2 12~51(6) · ★3 6~57(8) · ★4·★5 0~63(10). 옛 20·28·36·44·54 는 ★2 에서 온전한 블록이 0 이었다
  [44, 42],
  [56, 42],
  [72, 42],
  [84, 42],
  [96, 42],
];

/** 토지(뭍) 윗변 (P15 D21) — 입구가 있는 지도 위쪽. 토지는 뭍 26줄(0~25) 고정, 폭만 좌우로 자란다. `land` 는 뭍만 가리킨다 */
export const LAND_J0 = CITY_BAND;
/** 수면 허가 (P15 D23, 레거시 permitArea 의 자리) — 랭크 0 은 물가 8줄, 랭크마다 3줄씩 더 멀리. ★5 면 강 전부(47) */
export function waterRowMax(rank: number): number {
  return Math.min(RIVER.j0 + RIVER.h - 1, RIVER.j0 + 7 + Math.max(0, rank) * 3);
}
/** 수면 허가 **깊이** (P48-b3) — 내 물가에서 물 위로 몇 칸까지가 내 앞 수면인가. 옛 `waterRowMax` 의 「행 50 + 7 + 3·랭크」를 거리로 옮긴 것(본류가 S 라 행으로 못 잰다) */
export function permitDepth(rank: number): number {
  return Math.min(RIVER.h - 1, 7 + Math.max(0, rank) * 3);
}
/**
 * 뭍 토지이거나 내 앞 수면 — 시설·데크 판정이 쓴다 (P48-b2, §14 W5).
 * 내 물 = 물 코드 ∧ 토지 열 안 ∧ 도시 띠 아래 ∧ (굽이 `j < RIVER.j0` 는 언제나 · 본류는 허가 창 `j ≤ waterMax` 안). 굽이는 마당 안이라 처음부터 내 물이다(W5)
 */
export function inLandOrWater(grid: Grid, land: Rect, i: number, j: number, depth: number): boolean {
  const c = grid.naturalAt(i, j); // 자연 바닥이 물이면(데크·수역으로 덮여 있어도) 내 앞 수면 — 잔교 위 선착장이 여기 선다
  if (!isWaterCode(c)) return inRect(land, i, j) && grid.yardAt(land, i, j); // P48-b3: 사각형 안이라도 강 건너편(입구에서 뭍으로 못 닿는 땅)은 내 땅이 아니다
  if (i < land.i0 || i >= land.i0 + land.w || j < LAND_J0) return false;
  const d = grid.shoreDist(land, i, j);
  return d > 0 && d <= depth;
}

export function landRect(rank: number): Rect {
  const idx = Math.max(0, Math.min(LAND_BY_RANK.length - 1, rank));
  const [w] = LAND_BY_RANK[idx] as readonly [number, number];
  const i0 = Math.max(0, Math.min(GRID_W - w, GATE_I - Math.floor(w / 2))); // 입구 열(48)이 언제나 가운데
  const j0 = LAND_J0;
  return { i0, j0, w, h: RIVER.j0 - j0 };
}

export function inRect(r: Rect, i: number, j: number): boolean {
  return i >= r.i0 && j >= r.j0 && i < r.i0 + r.w && j < r.j0 + r.h;
}

/** 입구 칸 — 토지 **위** 변의 중앙 (P15 D21, 레거시: 도로가 위, 강이 아래). 랭크와 무관하게 같은 열이다 */
export function gateTile(rank: number): { i: number; j: number } {
  void rank; // P43: 랭크와 무관 — 입구 열은 고정
  return { i: GATE_I, j: LAND_J0 };
}

/** 높이 (P0-B, D17 — 빠지 K37/K38 이식): 단 0~3, 한 단 = 8텍셀. 물은 영구 0. 플레이어는 깎지 않는다 */
export const MAX_LEVEL = 3;
/** 한 단이 차지하는 등고 간격(칸) (P14 → P44 봉우리 거리 기준) */
export const TERRACE_COLS = 5;
/** P44 언덕 봉우리 — 지도 양옆 바깥 조금 · 위쪽(도시 띠 근처)에 두어 강가는 평평한 모래밭이 된다. `HILL_TOP` 안쪽은 최고 단 · 세로로 `HILL_STRETCH` 배 늘인 타원 */
export const HILL_PEAKS: readonly { i: number; j: number }[] = [{ i: -12, j: 18 }, { i: GRID_W + 11, j: 18 }];
export const HILL_TOP = 12;
export const HILL_STRETCH = 2.4;
/** @deprecated P0-B 이름 — 지금은 열 기준 */
export const TERRACE_ROWS = TERRACE_COLS;

export class Grid {
  readonly floor: Uint8Array;
  /** 단 (0~MAX_LEVEL). 물 칸은 `set()` 이 0 으로 고정한다 */
  readonly levels: Uint8Array;
  /**
   * 자연 바닥 평면 (P48-a, §14 W4) — 월드젠이 끝난 직후의 바닥(잔디·암반·모래·강·여울). 편집은 `floor` 만 바꾸고 이 평면은
   * 안 건드린다. 폰툰을 걷거나 수역을 지우거나 길·실내를 걷으면 **줄 공식이 아니라 여기로** 돌아간다 — 옛 `riverFloorFor(j)` 는
   * 「강은 50~71줄」 가정이라 S 자 굽이(P48-b1)에서 뜻이 없다. 세이브에 왕복한다(없으면 `newPark` 의 값 — 랭크와 무관).
   */
  readonly natural: Uint8Array;

  constructor(
    readonly w = GRID_W,
    readonly h = GRID_H,
  ) {
    this.floor = new Uint8Array(w * h);
    this.levels = new Uint8Array(w * h);
    this.natural = new Uint8Array(w * h);
  }

  /** 자연 바닥 — 격자 밖이면 모래(광장과 같은 「아무것도 아님」) */
  naturalAt(i: number, j: number): FloorCode {
    return this.inside(i, j) ? (this.natural[j * this.w + i] as FloorCode) : FLOOR.sand;
  }
  /** 월드젠·세이브 전용 — 편집 경로에서 부르지 말 것 */
  setNatural(i: number, j: number, code: FloorCode): void {
    if (this.inside(i, j)) { this.natural[j * this.w + i] = code; this.shoreCache = null; }
  }
  /** 지금 `floor` 를 자연 바닥으로 찍는다 — `newPark` 이 언덕·암반 뒤, 포장 앞에 한 번 부른다 */
  snapshotNatural(): void { this.natural.set(this.floor); this.shoreCache = null; }

  /**
   * 마당·물가 거리 (P48-b3) — 토지 사각형 안 자연 뭍 중 **입구에서 뭍으로 닿는 것**이 마당(`yardAt`), 마당에 4이웃한 자연 물이 거리 1,
   * 거기서 자연 물 위로 BFS 한 것이 `shoreDist`(마당이 아니면 −1). 토지 사각형마다 한 번 계산해 둔다 — 자연 바닥은 새 판에서만 바뀐다
   */
  private shoreCache: { key: string; yard: Uint8Array; dist: Int32Array } | null = null;
  private shoreField(land: Rect): { yard: Uint8Array; dist: Int32Array } {
    const key = `${land.i0},${land.j0},${land.w},${land.h}`;
    if (this.shoreCache && this.shoreCache.key === key) return this.shoreCache;
    const n = this.w * this.h, yard = new Uint8Array(n), dist = new Int32Array(n).fill(-1);
    const water = (i: number, j: number): boolean => isWaterCode(this.naturalAt(i, j));
    const q: number[] = [];
    const g0 = { i: GATE_I, j: LAND_J0 };
    if (inRect(land, g0.i, g0.j) && !water(g0.i, g0.j)) { yard[g0.j * this.w + g0.i] = 1; q.push(g0.j * this.w + g0.i); }
    for (let h = 0; h < q.length; h++) { const k = q[h]!, i = k % this.w, j = Math.floor(k / this.w); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const x = i + a, y = j + b; if (!inRect(land, x, y) || water(x, y)) continue; const kk = y * this.w + x; if (yard[kk]) continue; yard[kk] = 1; q.push(kk); } }
    const wq: number[] = [];
    for (let k = 0; k < n; k++) { if (!yard[k]) continue; const i = k % this.w, j = Math.floor(k / this.w); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const x = i + a, y = j + b; if (!this.inside(x, y) || !water(x, y)) continue; const kk = y * this.w + x; if (dist[kk] !== -1) continue; dist[kk] = 1; wq.push(kk); } }
    for (let h = 0; h < wq.length; h++) { const k = wq[h]!, i = k % this.w, j = Math.floor(k / this.w), d = dist[k]!; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const x = i + a, y = j + b; if (!this.inside(x, y) || !water(x, y)) continue; const kk = y * this.w + x; if (dist[kk] !== -1) continue; dist[kk] = d + 1; wq.push(kk); } }
    this.shoreCache = { key, yard, dist };
    return this.shoreCache;
  }
  /** 마당인가 — 토지 사각형 안 자연 뭍 중 입구에서 뭍으로 닿는 칸 */
  yardAt(land: Rect, i: number, j: number): boolean { return this.inside(i, j) && this.shoreField(land).yard[j * this.w + i] === 1; }
  /** 마당 물가에서의 물 위 거리 (물가 첫 칸 = 1 · 마당 물이 아니면 −1) */
  shoreDist(land: Rect, i: number, j: number): number { return this.inside(i, j) ? (this.shoreField(land).dist[j * this.w + i] ?? -1) : -1; }

  levelAt(i: number, j: number): number {
    return this.inside(i, j) ? (this.levels[j * this.w + i] ?? 0) : 0;
  }

  /** 월드젠·세이브 전용 — 물은 0, 나머지는 0..MAX 클램프 */
  setLevel(i: number, j: number, z: number): void {
    if (!this.inside(i, j)) return;
    const k = j * this.w + i;
    this.levels[k] = isWaterCode(this.floor[k] ?? 0) ? 0 : Math.max(0, Math.min(MAX_LEVEL, Math.round(z)));
  }

  /** 4이웃 중 단이 다른 칸이 있나 (격자 밖 = 0) */
  isCliff(i: number, j: number): boolean {
    const z = this.levelAt(i, j);
    return this.levelAt(i + 1, j) !== z || this.levelAt(i - 1, j) !== z || this.levelAt(i, j + 1) !== z || this.levelAt(i, j - 1) !== z;
  }

  /** 발자국 전 칸이 같은 단이고 격자 안인가 — 배치 판정의 유일한 출처 */
  levelUniform(i: number, j: number, w: number, d: number): boolean {
    if (!this.inside(i, j) || !this.inside(i + w - 1, j + d - 1)) return false;
    const z = this.levelAt(i, j);
    for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) if (this.levelAt(i + a, j + b) !== z) return false;
    return true;
  }

  /** 걸어 넘을 수 있는 단차 — 1 까지 */
  // ── P39 D49 — 벽은 실내 바닥의 외곽선이고 문은 덩어리마다 하나(부모 K27 모델 이식). 플레이어는 벽을 그리지 않는다 ──
  private blobCacheRev = -1;
  private blobIds = new Int32Array(0);
  private blobDoors = new Map<number, { i: number; j: number; oi: number; oj: number }[]>();
  /** P42 D53 — 「입구」 시설이 선 실내 칸(key j*w+i). 그 칸의 바깥 변이 그 덩어리의 문이 된다 */
  private forcedDoorKeys = new Set<number>();
  setForcedDoors(keys: Iterable<number>): void { this.forcedDoorKeys = new Set(keys); this.rev++; }
  /** 실내 덩어리 id (4방 연결). 실내가 아니면 0 */
  private ensureBlobs(): void {
    if (this.blobCacheRev === this.rev && this.blobIds.length === this.w * this.h) return;
    this.blobCacheRev = this.rev;
    const ids = new Int32Array(this.w * this.h);
    let next = 0;
    const q: number[] = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const k = j * this.w + i;
      if (!isIndoorCode(this.floor[k] ?? 0) || ids[k] !== 0) continue;
      next++; ids[k] = next; q.length = 0; q.push(k);
      let head = 0;
      while (head < q.length) {
        const c = q[head++] as number; const ci = c % this.w, cj = Math.floor(c / this.w);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = ci + di, nj = cj + dj; if (!this.inside(ni, nj)) continue;
          const nk = nj * this.w + ni;
          if (isIndoorCode(this.floor[nk] ?? 0) && ids[nk] === 0) { ids[nk] = next; q.push(nk); }
        }
      }
    }
    this.blobIds = ids;
    // 문 (P39 → P45-a D63): ① **복도(hall)가 건물 밖 통로에 닿는 변은 전부 문**(복도 설계가 곧 출입구) ② 복도 출구가 하나도 없으면
    // 통로가 닿은 변 중 입구에 가장 가까운 것 하나(P39 폴백) ③ 「입구」 시설이 선 칸의 바깥 변(P42) — ①에 더한다
    this.blobDoors = new Map();
    const hallDoors = new Map<number, { i: number; j: number; oi: number; oj: number }[]>();
    const best = new Map<number, { i: number; j: number; oi: number; oj: number; d: number }>();
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const id = ids[j * this.w + i] as number; if (!id) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const oi = i + di, oj = j + dj; if (!this.inside(oi, oj)) continue;
        const c = this.floor[oj * this.w + oi] as number;
        if (isIndoorCode(c) || !isCorridorFloor(c)) continue; // 통로(포장·데크·걷는 지면)가 닿은 변에만 — 「실내는 통로로만」
        if (this.floor[j * this.w + i] === FLOOR.hall) { const arr = hallDoors.get(id) ?? []; arr.push({ i, j, oi, oj }); hallDoors.set(id, arr); continue; }
        const d = Math.abs(oi - GATE_I) + oj;
        const cur = best.get(id);
        if (!cur || d < cur.d || (d === cur.d && (oj < cur.oj || (oj === cur.oj && oi < cur.oi)))) best.set(id, { i, j, oi, oj, d });
      }
    }
    for (const [id, arr] of hallDoors) this.blobDoors.set(id, arr);
    for (const [id, b] of best) if (!this.blobDoors.has(id)) this.blobDoors.set(id, [{ i: b.i, j: b.j, oi: b.oi, oj: b.oj }]);
    for (const k of this.forcedDoorKeys) {
      const i = k % this.w, j = Math.floor(k / this.w); const id = ids[k] as number; if (!id) continue;
      let pick: { oi: number; oj: number; d: number } | null = null;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const oi = i + di, oj = j + dj; if (!this.inside(oi, oj)) continue; const c = this.floor[oj * this.w + oi] as number; if (isIndoorCode(c) || !isWalkFloor(c)) continue; const d = Math.abs(oi - GATE_I) + oj; if (!pick || d < pick.d) pick = { oi, oj, d }; }
      if (!pick) continue;
      const list = (hallDoors.get(id) ?? []).slice(); // 강제 문은 폴백 문을 대신하고 복도 출구엔 더한다
      list.push({ i, j, oi: pick.oi, oj: pick.oj });
      this.blobDoors.set(id, list);
    }
  }
  blobAt(i: number, j: number): number { this.ensureBlobs(); return this.inside(i, j) ? (this.blobIds[j * this.w + i] as number) : 0; }
  doors(): { i: number; j: number; oi: number; oj: number }[] { this.ensureBlobs(); return [...this.blobDoors.values()].flat(); }
  /** 두 칸 사이에 벽이 있나 — 실내/바깥 경계는 벽, 그 덩어리의 문 변만 예외 */
  wallBetween(i: number, j: number, ni: number, nj: number): boolean {
    const a = isIndoorCode(this.at(i, j)), b = isIndoorCode(this.at(ni, nj));
    if (a === b) return false;
    this.ensureBlobs();
    const inI = a ? i : ni, inJ = a ? j : nj, outI = a ? ni : i, outJ = a ? nj : j;
    const ds = this.blobDoors.get(this.blobIds[inJ * this.w + inI] as number);
    return !(ds && ds.some((d) => d.i === inI && d.j === inJ && d.oi === outI && d.oj === outJ));
  }
  /** 이동 가능 — 단차 ≤ 1 이고 벽이 없다. 거리장·도달 검사·손님 걸음이 전부 이걸 본다 */
  canCross(i: number, j: number, ni: number, nj: number): boolean {
    return this.levelPassable(i, j, ni, nj) && !this.wallBetween(i, j, ni, nj);
  }
  levelPassable(i: number, j: number, ni: number, nj: number): boolean {
    return Math.abs(this.levelAt(i, j) - this.levelAt(ni, nj)) <= 1;
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.h;
  }

  at(i: number, j: number): FloorCode {
    return (this.inside(i, j) ? this.floor[j * this.w + i] : FLOOR.sand) as FloorCode;
  }

  /** 바닥이 바뀔 때마다 +1 — 실내 덩어리·문 캐시의 열쇠 (P39) */
  rev = 0;
  set(i: number, j: number, code: FloorCode): void {
    if (!this.inside(i, j)) return;
    this.rev++;
    this.floor[j * this.w + i] = code;
    if (isWaterCode(code)) this.levels[j * this.w + i] = 0; // 물은 영구 0 (P0-B)
  }

  /** 랭크업 — 새 토지의 모래를 잔디로 (이미 뭔가 있는 칸은 그대로) */
  openLand(rank: number): number {
    const r = landRect(rank);
    let n = 0;
    for (let j = r.j0; j < r.j0 + r.h; j++) for (let i = r.i0; i < r.i0 + r.w; i++) {
      if (this.at(i, j) === FLOOR.sand) { this.set(i, j, FLOOR.grass); n++; }
    }
    return n;
  }

  /** 새 판 — 토지는 잔디, 입구에서 위로 한 줄 포장, 나머지는 모래 */
  static newPark(rank = 0, variant: 0 | 1 = 0): Grid {
    const g = new Grid();
    const land = landRect(rank);
    // P44: 마당 밖 뭍도 잔디(모래 사막이 아니라 들판 — 숲·언덕은 씬과 raiseHills 가 얹는다). 광장(4~7)만 모래라 손님이 못 나간다
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) g.set(i, j, j > STOP_ROW && j < LAND_J0 ? FLOOR.sand : FLOOR.grass);
    }
    void land;
    // 도시 띠 (P43) — 차도 두 줄 · 정류장 보도 한 줄. 가로수는 씬이 심는다
    for (let i = 0; i < g.w; i++) { for (const j of ROAD_ROWS) g.set(i, j, FLOOR.road); g.set(i, STOP_ROW, FLOOR.sidewalk); }
    // 강 (P0 → P14 D18) — 지형이라 플레이어가 깎지 않는다. 지도 위 22줄이 통째로 물, 마지막 줄만 여울
    Grid.carveMain(g); // P48-b3: 본류 S 띠 — 언덕 앞(물 씨앗이 되어 둑이 테라스로 내려온다), 포장 앞. 어귀 굽이는 안 판다
    void variant; // 2회차 거울은 본류 띠에 다시 붙인다(미결)
    const gate = gateTile(rank);
    Grid.raiseHills(g, gate.i);
    Grid.rockRims(g);
    // P48-a: 자연 바닥은 언덕·암반 **뒤**, 포장 **앞** — 길을 걷으면 잔디가 아니라 그 자리의 자연 바닥(암반이면 암반)으로 돌아간다.
    // 포장을 암반 뒤로 옮겨도 최종 floor·levels 는 바이트 동일이다(rockRims 는 잔디만 보고, 포장이 그 칸을 덮는다 — p48a.test 가 지킨다)
    g.snapshotNatural();
    // 물가 (레거시 `shore` 의 석재 보도): 여울 바로 위 두 줄(24·25)은 포장 — 「강변 산책로」가 읽히고 손님이 물가까지 걷는다
    for (let i = 0; i < g.w; i++) { const jn = shoreRow(i); for (let dj = 1; dj <= 2; dj++) if (inRect(land, i, jn - dj) && !isWaterCode(g.at(i, jn - dj))) g.set(i, jn - dj, FLOOR.path); } // P48-b3: 물가 산책로가 S 를 따라간다
    for (let j = gate.j; j < shoreRow(gate.i); j++) if (!isWaterCode(g.at(gate.i, j))) g.set(gate.i, j, FLOOR.path); // 입구(위)에서 물가까지 한 줄 포장
    return g;
  }

  /**
   * 언덕 (P0-B → P44, 레거시 K38): 지도 **양옆 바깥 조금**에 둔 봉우리 둘에서의 타원 거리로 단을 정한다 — 열까지의 거리로만 하면
   * 등고선이 세로 직선이 되어 계단식 논처럼 보인다(P43 실측). 저주파 사인으로 등고선을 흔들고, 0 고정 집합(물 · 도시 띠 · 입구 열 · 격자
   * 가장자리 한 줄)에서 4이웃 BFS 거리와 min 을 취해 **단차 ≤1 을 성질로 보장**한다 (1-Lipschitz 둘의 min). 가장자리를 0 으로 눌러
   * 언덕이 능선이 되고, 지도 바깥의 평평한 들판으로 내려간다 — 절벽으로 잘린 섬이 아니다.
   */
  static raiseHills(g: Grid, gateI: number): void {
    const raw = new Uint8Array(g.w * g.h);
    const dist = new Int32Array(g.w * g.h).fill(-1);
    const queue: number[] = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        let best = Infinity;
        for (const pk of HILL_PEAKS) {
          const dx = i - pk.i, dy = (j - pk.j) / HILL_STRETCH;
          const wob = 1.4 * Math.sin(j * 0.31 + i * 0.07) + 0.9 * Math.sin(j * 0.11 - i * 0.05);
          best = Math.min(best, Math.sqrt(dx * dx + dy * dy) + wob);
        }
        const z = isWaterCode(g.floor[j * g.w + i] ?? 0) || j < LAND_J0 ? 0 : Math.max(0, Math.min(MAX_LEVEL, MAX_LEVEL - Math.floor((best - HILL_TOP) / TERRACE_COLS))); // P48-b1: 물이면(본류든 굽이든) 0
        const k = j * g.w + i;
        raw[k] = z;
        const edge = i === 0 || i === g.w - 1;
        if (z === 0 || i === gateI || j < LAND_J0 || edge || isWaterCode(g.floor[k] ?? 0)) { dist[k] = 0; queue.push(k); }
      }
    }
    let head = 0;
    while (head < queue.length) {
      const k = queue[head++] as number;
      const i = k % g.w; const j = Math.floor(k / g.w); const d = dist[k] as number;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di; const nj = j + dj;
        if (!g.inside(ni, nj)) continue;
        const nk = nj * g.w + ni;
        if (dist[nk] !== -1) continue;
        dist[nk] = d + 1; queue.push(nk);
      }
    }
    for (let k = 0; k < raw.length; k++) g.setLevel(k % g.w, Math.floor(k / g.w), Math.min(raw[k] as number, dist[k] as number));
  }

  /** P44 — 암반: 절벽 테두리(남·동 이웃보다 높은 잔디 칸)만 바위 그림으로. 걷고 짓는 성질은 잔디와 같다 */
  /**
   * 물굽이를 판다 (P48-b1) — 2패스. ① 발자국: 못 사각형 전부 + 표본마다 `|i−ci| ≤ r ∧ |j−jc| ≤ 0.8r`. 처음 찍힌 표본의 곡률 부호가
   * 그 칸의 기슭 쪽(안/바깥)을 정한다. ② 깊이: 발자국 밖을 씨앗 0 으로 4이웃 BFS 거리 d 를 재어 `d ≤ (안쪽 ? rimInner : rimOuter)` 면
   * 여울, 아니면 강. 깊이를 칸마다 한 번 정하므로 두 정수가 여울:강 비율을 직접 조종한다. `j ≥ RIVER.j0` · `j ≤ LAND_J0` 은 건너뛴다.
   */
  /** 본류 S 띠 (P48-b3) — 열마다 북안 행부터 width 줄이 물. 뭍에 4이웃한 물은 여울(북안은 두 줄) */
  static carveMain(g: Grid): void {
    for (let i = 0; i < g.w; i++) { const jn = shoreRow(i); for (let j = jn; j < jn + MAIN.width; j++) if (g.inside(i, j) && j > LAND_J0) g.set(i, j, FLOOR.river); }
    const rim: number[] = [];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      if (g.at(i, j) !== FLOOR.river) continue;
      const land = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => g.inside(i + a, j + b) && !isWaterCode(g.at(i + a, j + b)));
      if (land) rim.push(j * g.w + i);
      else if (j === shoreRow(i) + 1) rim.push(j * g.w + i); // 북안 둘째 줄도 여울 — 손님이 서는 물가
    }
    for (const k of rim) g.set(k % g.w, Math.floor(k / g.w), FLOOR.shallow);
  }

  static carveBend(g: Grid, b: Bend = BEND): void {
    const side = new Int8Array(g.w * g.h); // 0 밖 · +1 안쪽 기슭 · −1 바깥 기슭 · +2 못
    const foot = new Uint8Array(g.w * g.h);
    for (let sIdx = 0; sIdx <= b.samples; sIdx++) {
      const t = sIdx / b.samples;
      const ci = bendCenter(t, b), jc = bendRow(t, b), r = bendHalf(t, b);
      const inner = -Math.sign(bendCurv(t, b)) || 1;
      for (let j = Math.floor(jc - 0.8 * r); j <= Math.ceil(jc + 0.8 * r); j++) {
        if (j >= RIVER.j0 || j <= LAND_J0 || j < b.head.j0) continue; // 북안(행 head.j0−1)은 곧다 — 산책로·평상 자리
        for (let i = Math.floor(ci - r); i <= Math.ceil(ci + r); i++) {
          const di = (i - ci) / r, dj = (j - jc) / (0.8 * r);
          if (!g.inside(i, j) || di * di + dj * dj > 1) continue; // 타원 — 네모 표본은 가장자리가 계단·상자로 읽힌다
          const k = j * g.w + i;
          if (foot[k]) continue;
          foot[k] = 1; side[k] = Math.sign((i - ci) * inner) >= 0 ? 1 : -1;
        }
      }
    }
    // ② 깊이 — 발자국 밖(뭍·본류)이 씨앗 0
    const dist = new Int32Array(g.w * g.h).fill(-1);
    const queue: number[] = [];
    for (let k = 0; k < foot.length; k++) if (!foot[k]) { dist[k] = 0; queue.push(k); }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q] as number, i = k % g.w, j = Math.floor(k / g.w), d = dist[k] as number;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const a = i + di, c = j + dj; if (!g.inside(a, c)) continue;
        const kk = c * g.w + a; if (dist[kk] !== -1) continue;
        dist[kk] = d + 1; queue.push(kk);
      }
    }
    for (let k = 0; k < foot.length; k++) {
      if (!foot[k]) continue;
      const rim = side[k] === -1 ? b.rimOuter : b.rimInner;
      g.set(k % g.w, Math.floor(k / g.w), (dist[k] as number) <= rim ? FLOOR.shallow : FLOOR.river);
    }
  }

  static rockRims(g: Grid): void {
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      if (g.at(i, j) !== FLOOR.grass) continue;
      const z = g.levelAt(i, j); if (z <= 0) continue;
      if ((g.inside(i, j + 1) && g.levelAt(i, j + 1) < z) || (g.inside(i + 1, j) && g.levelAt(i + 1, j) < z)) g.set(i, j, FLOOR.rock);
    }
  }
}

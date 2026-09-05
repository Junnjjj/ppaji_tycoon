/**
 * 격자 — 워터파크의 땅.
 *
 * **64×48** 타일. PSS 실측(1280px 화면에 타일 40개, 32×16 텍셀)과 같은 밀도로
 * 폰 393px·배율 1 에서 가로 12타일이 보인다. 랭크마다 `landRect` 가 넓어지고
 * 토지 밖은 같은 스케일의 장식 지형으로 덮는다(하늘·지도 경계 없음 — PSS 문법).
 *
 * `floor` 는 지면 종류 한 바이트다. 풀 타일의 **종류**(표준·핑크·카이로…)는 G1 이
 * `poolTile` 배열로 따로 든다 — 종류가 바뀌어도 "여기가 풀인가"는 이 배열 하나가 답한다.
 */
export const GRID_W = 64;
export const GRID_H = 48;

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
} as const;
export type FloorKind = keyof typeof FLOOR;
export type FloorCode = (typeof FLOOR)[FloorKind];

export const FLOOR_NAMES: readonly FloorKind[] = ['sand', 'grass', 'path', 'indoor', 'pool', 'river', 'shallow', 'deck'];

/** 강 띠(P0, D11 곧은 강 하나) — 지도를 가로지르는 8줄. 양 끝 줄은 여울. ★0 토지(j 32~47)가 아래 두 줄(32 강 · 33 여울)에 닿는다 */
/**
 * 물 (P14 D18 → P15 D21, 레거시 카이로 씬 그대로): 입구가 **위(강변 위쪽)**, 지도 **아래 22줄(46%)이 강**이다 — 건물 정면이 물을 본다.
 * 첫 줄(j = 26)만 여울(데크가 서는 물가), 아래는 전부 강. 건너편 둑은 없다.
 */
export const RIVER = { j0: 26, h: 22 } as const;
export function isRiverRow(j: number): boolean {
  return j >= RIVER.j0 && j < RIVER.j0 + RIVER.h;
}
/** 강 띠의 원래 지면 — 양끝 줄은 여울 (부표를 걷거나 데크를 뜯으면 여기로 돌아간다) */
export function riverFloorFor(j: number): FloorCode {
  return j === RIVER.j0 ? FLOOR.shallow : FLOOR.river;
}
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
  [20, 42],
  [28, 42],
  [36, 42],
  [44, 42],
  [54, 42],
  [64, 42],
];
/** 토지(뭍) 윗변 (P15 D21) — 입구가 있는 지도 위쪽. 토지는 뭍 26줄(0~25) 고정, 폭만 좌우로 자란다. `land` 는 뭍만 가리킨다 */
export const LAND_J0 = 0;
/** 수면 허가 (P15 D23, 레거시 permitArea 의 자리) — 랭크 0 은 물가 8줄, 랭크마다 3줄씩 더 멀리. ★5 면 강 전부(47) */
export function waterRowMax(rank: number): number {
  return Math.min(RIVER.j0 + RIVER.h - 1, RIVER.j0 + 7 + Math.max(0, rank) * 3);
}
/** 뭍 토지이거나 내 앞 수면(토지 열 안 · 허가 줄 안의 물) — 시설·데크 판정이 쓴다 */
export function inLandOrWater(land: Rect, i: number, j: number, waterMax: number = RIVER.j0 + RIVER.h - 1): boolean {
  return inRect(land, i, j) || (isRiverRow(j) && j <= waterMax && i >= land.i0 && i < land.i0 + land.w);
}

export function landRect(rank: number): Rect {
  const idx = Math.max(0, Math.min(LAND_BY_RANK.length - 1, rank));
  const [w] = LAND_BY_RANK[idx] as readonly [number, number];
  const i0 = Math.floor((GRID_W - w) / 2);
  const j0 = LAND_J0;
  return { i0, j0, w, h: RIVER.j0 - j0 };
}

export function inRect(r: Rect, i: number, j: number): boolean {
  return i >= r.i0 && j >= r.j0 && i < r.i0 + r.w && j < r.j0 + r.h;
}

/** 입구 칸 — 토지 **위** 변의 중앙 (P15 D21, 레거시: 도로가 위, 강이 아래). 랭크와 무관하게 같은 열이다 */
export function gateTile(rank: number): { i: number; j: number } {
  const r = landRect(rank);
  return { i: r.i0 + Math.floor(r.w / 2), j: r.j0 };
}

/** 높이 (P0-B, D17 — 빠지 K37/K38 이식): 단 0~3, 한 단 = 8텍셀. 물은 영구 0. 플레이어는 깎지 않는다 */
export const MAX_LEVEL = 3;
/** 지도 좌우 가장자리에서 몇 열마다 한 단 내려오나 (P14 — 레거시 `TERRACE_WIDTH 7`: 골짜기 가운데는 평지, 양옆 산기슭이 테라스) */
export const TERRACE_COLS = 6;
/** @deprecated P0-B 이름 — 지금은 열 기준 */
export const TERRACE_ROWS = TERRACE_COLS;

export class Grid {
  readonly floor: Uint8Array;
  /** 단 (0~MAX_LEVEL). 물 칸은 `set()` 이 0 으로 고정한다 */
  readonly levels: Uint8Array;
  /** 풀 타일 종류 인덱스 (tiles.json 순서, 0 = 표준). floor 가 pool 일 때만 뜻이 있다 */
  readonly poolTile: Uint8Array;

  constructor(
    readonly w = GRID_W,
    readonly h = GRID_H,
  ) {
    this.floor = new Uint8Array(w * h);
    this.poolTile = new Uint8Array(w * h);
    this.levels = new Uint8Array(w * h);
  }

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
  levelPassable(i: number, j: number, ni: number, nj: number): boolean {
    return Math.abs(this.levelAt(i, j) - this.levelAt(ni, nj)) <= 1;
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.h;
  }

  at(i: number, j: number): FloorCode {
    return (this.inside(i, j) ? this.floor[j * this.w + i] : FLOOR.sand) as FloorCode;
  }

  set(i: number, j: number, code: FloorCode, poolTile = 0): void {
    if (!this.inside(i, j)) return;
    this.floor[j * this.w + i] = code;
    this.poolTile[j * this.w + i] = code === FLOOR.pool ? poolTile : 0;
    if (isWaterCode(code)) this.levels[j * this.w + i] = 0; // 물은 영구 0 (P0-B)
  }

  poolTileAt(i: number, j: number): number {
    return this.inside(i, j) ? (this.poolTile[j * this.w + i] as number) : 0;
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
  static newPark(rank = 0): Grid {
    const g = new Grid();
    const land = landRect(rank);
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) g.set(i, j, inRect(land, i, j) ? FLOOR.grass : FLOOR.sand);
    }
    // 강 (P0 → P14 D18) — 지형이라 플레이어가 깎지 않는다. 지도 위 22줄이 통째로 물, 마지막 줄만 여울
    for (let j = RIVER.j0; j < RIVER.j0 + RIVER.h; j++) {
      for (let i = 0; i < g.w; i++) g.set(i, j, riverFloorFor(j));
    }
    // 물가 (레거시 `shore` 의 석재 보도): 여울 바로 위 두 줄(24·25)은 포장 — 「강변 산책로」가 읽히고 손님이 물가까지 걷는다
    for (let i = 0; i < g.w; i++) for (let dj = 1; dj <= 2; dj++) if (inRect(land, i, RIVER.j0 - dj)) g.set(i, RIVER.j0 - dj, FLOOR.path);
    const gate = gateTile(rank);
    for (let j = gate.j; j < RIVER.j0; j++) g.set(gate.i, j, FLOOR.path); // 입구(위)에서 물가까지 한 줄 포장
    Grid.raiseBanks(g, gate.i);
    return g;
  }

  /**
   * 강 계곡 (P0-B) — 강에서 멀어질수록 `TERRACE_ROWS` 줄마다 한 단. 0 고정 집합(물 · 입구 열)에서 4이웃 BFS 거리와
   * min 을 취해 **단차 ≤1 을 성질로 보장**한다 (1-Lipschitz 둘의 min 은 1-Lipschitz — 빠지 K38). 입구 열이 0 이라
   * 입구에서 강까지 평지 길이 나고 좌우로 테라스가 오른다.
   */
  static raiseBanks(g: Grid, gateI: number): void {
    const raw = new Uint8Array(g.w * g.h);
    const dist = new Int32Array(g.w * g.h).fill(-1);
    const queue: number[] = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        // P14: 단은 지도 좌우 가장자리(산기슭)에서 온다 — 가운데 골짜기(입구 열 둘레 16칸)는 평지, 물은 0
        const d = Math.min(i, g.w - 1 - i);
        const z = isRiverRow(j) ? 0 : Math.max(0, MAX_LEVEL - Math.floor(d / TERRACE_COLS));
        const k = j * g.w + i;
        raw[k] = z;
        if (z === 0 || i === gateI || isWaterCode(g.floor[k] ?? 0)) { dist[k] = 0; queue.push(k); }
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
}

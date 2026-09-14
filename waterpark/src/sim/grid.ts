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
} as const;
export type FloorKind = keyof typeof FLOOR;
export type FloorCode = (typeof FLOOR)[FloorKind];

export const FLOOR_NAMES: readonly FloorKind[] = ['sand', 'grass', 'path', 'indoor', 'pool'];

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
  [20, 16],
  [28, 20],
  [36, 26],
  [44, 32],
  [54, 40],
  [64, 48],
];

export function landRect(rank: number): Rect {
  const idx = Math.max(0, Math.min(LAND_BY_RANK.length - 1, rank));
  const [w, h] = LAND_BY_RANK[idx] as readonly [number, number];
  const i0 = Math.floor((GRID_W - w) / 2);
  const j0 = GRID_H - h;
  return { i0, j0, w, h };
}

export function inRect(r: Rect, i: number, j: number): boolean {
  return i >= r.i0 && j >= r.j0 && i < r.i0 + r.w && j < r.j0 + r.h;
}

/** 입구 칸 — 토지 아래 변의 중앙. 랭크와 무관하게 같은 열이다 */
export function gateTile(rank: number): { i: number; j: number } {
  const r = landRect(rank);
  return { i: r.i0 + Math.floor(r.w / 2), j: r.j0 + r.h - 1 };
}

export class Grid {
  readonly floor: Uint8Array;
  /** 풀 타일 종류 인덱스 (tiles.json 순서, 0 = 표준). floor 가 pool 일 때만 뜻이 있다 */
  readonly poolTile: Uint8Array;

  constructor(
    readonly w = GRID_W,
    readonly h = GRID_H,
  ) {
    this.floor = new Uint8Array(w * h);
    this.poolTile = new Uint8Array(w * h);
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
    const gate = gateTile(rank);
    for (let j = gate.j; j >= land.j0; j--) g.set(gate.i, j, FLOOR.path);
    return g;
  }
}

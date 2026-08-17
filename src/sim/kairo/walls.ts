import type { KairoTerrain } from './terrain.js';

/**
 * 벽·문 격자 — **시뮬 소유**. 스펙 §3.
 *
 * ## 결정: 벽은 타일을 점유한다
 *
 * 타일 경계에 얹는 방식(에지 벽)이 아니다. 카이로 정석이고, 사용자가 고른 방식이다.
 * 벽 타일은 못 걷고 문 타일은 걷는다.
 *
 * ## 방 타입 시스템이 없다
 *
 * 사우나 공간·매점 공간을 벽으로 나누는 건 플레이어의 표현이고, 게임은 "무슨 방인지"
 * 판정하지 않는다. 유일한 규칙은 **밀폐 차단**이다.
 *
 * ## 왜 밀폐를 막나
 *
 * 손님이 못 들어가는 공간이 생기면 그 안의 시설은 영구히 죽는다. 플레이어는 왜 매출이
 * 안 나는지 알 수 없다 — "내 선택 때문에 실패했다"가 성립하지 않는 실패다.
 * 그래서 배치 순간에 거절한다: **게이트에서 flood fill 해서 도달 가능하던 칸이
 * 하나라도 도달 불가가 되면 그 벽은 못 놓는다.**
 */

export const WALL_NONE = 0;
export const WALL_SOLID = 1;
/** 문 — 걸을 수 있다. 런 방향은 이웃에서 파생하므로 별도 값이 필요 없다 */
export const WALL_DOOR = 2;

export type WallCell = typeof WALL_NONE | typeof WALL_SOLID | typeof WALL_DOOR;

/** 4방 이웃 비트 — 스프라이트 마스크와 같은 순서 */
export const BIT_I_PLUS = 1;
export const BIT_J_PLUS = 2;
export const BIT_I_MINUS = 4;
export const BIT_J_MINUS = 8;

export interface WallSnapshot {
  w: number;
  h: number;
  cells: number[];
}

export type PlaceReason = 'ok' | 'outside' | 'not-walkable' | 'occupied' | 'would-seal';

export interface PlaceResult {
  ok: boolean;
  reason: PlaceReason;
  /** `would-seal` 일 때, 갇히는 칸 몇 개인지 — UI 가 "3칸이 갇힙니다" 로 보여준다 */
  sealed?: number;
}

export class WallGrid {
  private readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height);
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.width && j < this.height;
  }

  at(i: number, j: number): WallCell {
    return this.inside(i, j) ? ((this.cells[j * this.width + i] as WallCell) ?? WALL_NONE) : WALL_NONE;
  }

  /** 벽·문 중 하나라도 있나 (렌더가 그림을 그릴지 판단) */
  has(i: number, j: number): boolean {
    return this.at(i, j) !== WALL_NONE;
  }

  /** 못 걷는가 — 벽은 막고 문은 통과 */
  blocks(i: number, j: number): boolean {
    return this.at(i, j) === WALL_SOLID;
  }

  /**
   * 4방 이웃 비트마스크. **문도 이웃으로 센다** — 안 그러면 문 옆 벽이 끝단으로 그려져
   * 벽선이 끊겨 보인다.
   */
  mask(i: number, j: number): number {
    let m = 0;
    if (this.has(i + 1, j)) m |= BIT_I_PLUS;
    if (this.has(i, j + 1)) m |= BIT_J_PLUS;
    if (this.has(i - 1, j)) m |= BIT_I_MINUS;
    if (this.has(i, j - 1)) m |= BIT_J_MINUS;
    return m;
  }

  /** 문의 런 방향 — 이웃이 I 축으로 이어지면 'x', J 축이면 'z' */
  doorRun(i: number, j: number): 'x' | 'z' {
    const m = this.mask(i, j);
    const alongI = (m & (BIT_I_PLUS | BIT_I_MINUS)) !== 0;
    return alongI ? 'x' : 'z';
  }

  /** 검사 없이 놓는다 — 프리셋 발자국(펜션)처럼 이미 검증된 경우에만 */
  setRaw(i: number, j: number, cell: WallCell): void {
    if (this.inside(i, j)) this.cells[j * this.width + i] = cell;
  }

  count(cell: WallCell): number {
    let n = 0;
    for (let k = 0; k < this.cells.length; k++) if (this.cells[k] === cell) n++;
    return n;
  }

  toSnapshot(): WallSnapshot {
    return { w: this.width, h: this.height, cells: Array.from(this.cells) };
  }

  static fromSnapshot(s: WallSnapshot): WallGrid {
    const g = new WallGrid(s.w, s.h);
    for (let k = 0; k < g.cells.length && k < s.cells.length; k++) {
      g.cells[k] = s.cells[k] as number;
    }
    return g;
  }
}

/**
 * 게이트에서 걸어서 닿는 칸 — flood fill.
 *
 * 4방 이동만 허용한다. 대각선을 허용하면 벽 두 장이 X 로 교차한 곳을 손님이 비집고
 * 지나가 "닫았는데 새는" 상태가 된다.
 */
export function reachable(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
): Uint8Array {
  const w = terrain.width;
  const h = terrain.height;
  const seen = new Uint8Array(w * h);
  const passable = (i: number, j: number): boolean =>
    terrain.inside(i, j) && terrain.isWalkable(i, j) && !walls.blocks(i, j);

  if (!passable(gate.i, gate.j)) return seen;

  // 명시적 스택 — 재귀는 40×32 에서도 깊이가 1,000 을 넘어 위험하다
  const stack: number[] = [gate.j * w + gate.i];
  seen[stack[0] as number] = 1;
  while (stack.length > 0) {
    const k = stack.pop() as number;
    const i = k % w;
    const j = (k - i) / w;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (!passable(ni, nj)) continue;
      const nk = nj * w + ni;
      if (seen[nk]) continue;
      seen[nk] = 1;
      stack.push(nk);
    }
  }
  return seen;
}

/** 걸을 수 있고 벽이 아닌 칸의 개수 — 도달 검사의 분모 */
export function passableCount(terrain: KairoTerrain, walls: WallGrid): number {
  let n = 0;
  for (let j = 0; j < terrain.height; j++) {
    for (let i = 0; i < terrain.width; i++) {
      if (terrain.isWalkable(i, j) && !walls.blocks(i, j)) n++;
    }
  }
  return n;
}

/**
 * 벽(또는 문)을 놓을 수 있는가.
 *
 * `would-seal` 판정: 놓은 뒤에도 **놓기 전에 도달 가능했던 칸이 전부** 도달 가능해야
 * 한다. 빈 공간을 둘러싸는 것도 막힌다 — 문을 하나 남기라는 뜻이고, 그게 규칙이다.
 */
export function canPlaceWall(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  i: number,
  j: number,
  cell: WallCell = WALL_SOLID,
): PlaceResult {
  if (!walls.inside(i, j)) return { ok: false, reason: 'outside' };
  if (!terrain.isWalkable(i, j)) return { ok: false, reason: 'not-walkable' };
  if (walls.has(i, j)) return { ok: false, reason: 'occupied' };
  if (i === gate.i && j === gate.j) return { ok: false, reason: 'occupied' };

  // 문은 걸을 수 있으니 막을 수 없다 — 도달 검사를 건너뛴다
  if (cell === WALL_DOOR) return { ok: true, reason: 'ok' };

  const before = reachable(terrain, walls, gate);
  walls.setRaw(i, j, cell);
  const after = reachable(terrain, walls, gate);
  walls.setRaw(i, j, WALL_NONE);

  let sealed = 0;
  for (let k = 0; k < before.length; k++) {
    // 놓은 자리 자체는 벽이 되므로 제외한다
    if (k === j * walls.width + i) continue;
    if (before[k] && !after[k]) sealed++;
  }
  return sealed > 0 ? { ok: false, reason: 'would-seal', sealed } : { ok: true, reason: 'ok' };
}

/** 검사 후 놓는다. 실패 이유를 그대로 돌려준다 */
export function placeWall(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  i: number,
  j: number,
  cell: WallCell = WALL_SOLID,
): PlaceResult {
  const r = canPlaceWall(terrain, walls, gate, i, j, cell);
  if (r.ok) walls.setRaw(i, j, cell);
  return r;
}

/** 벽·문을 지운다. 지우는 건 도달성을 늘리기만 하므로 항상 허용 */
export function removeWall(walls: WallGrid, i: number, j: number): boolean {
  if (!walls.has(i, j)) return false;
  walls.setRaw(i, j, WALL_NONE);
  return true;
}

export const PLACE_MESSAGES: Record<PlaceReason, string> = {
  ok: '',
  outside: '격자 밖입니다',
  'not-walkable': '물 위에는 벽을 세울 수 없습니다',
  occupied: '이미 무언가 있습니다',
  'would-seal': '이렇게 닫으면 손님이 못 들어갑니다 — 문을 남기세요',
};

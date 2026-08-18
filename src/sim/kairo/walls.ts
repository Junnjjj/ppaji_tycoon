import type { KairoTerrain } from './terrain.js';

/**
 * 벽·문 — **타일 경계에 선다** (K25 에서 바꿈). 시뮬 소유.
 *
 * ## 왜 타일 점유를 버렸나
 *
 * 예전에는 벽이 타일 하나를 통째로 먹었다. 그러면 두 가지가 나쁘다:
 *   1. **두껍게 보인다.** 아이소 다이아몬드 전체가 벽이라 방이 아니라 성벽처럼 읽힌다
 *   2. **바닥을 먹는다.** 20칸짜리 실내동을 만들면 벽에만 20칸 가까이 쓴다
 *
 * 이제 벽은 **두 칸 사이의 경계**에 있다. 칸은 그대로 살아 있고, 벽은 지나갈 수 있는지
 * 없는지만 정한다.
 *
 * ## 표현 — 각 타일이 자기 `+I`·`+J` 경계를 소유한다
 *
 * 경계는 두 칸이 공유하므로 한쪽이 소유해야 중복이 없다. (i,j) 와 (i−1,j) 사이의 경계는
 * **(i−1,j) 의 +I 경계**다. 이 규칙을 안 정하면 같은 경계가 두 곳에 저장돼 서로 어긋난다.
 *
 * ## 방 타입 시스템은 여전히 없다
 *
 * 벽으로 나눈 공간이 "무슨 방"인지 게임은 판정하지 않는다. 유일한 규칙은 **밀폐 차단**이다 —
 * 손님이 못 들어가는 공간이 생기면 그 안의 시설은 영구히 죽고, 플레이어는 왜 매출이 안
 * 나는지 알 수 없다. "내 선택 때문에 실패했다"가 성립하지 않는 실패다.
 */

export const EDGE_NONE = 0;
export const EDGE_SOLID = 1;
/** 문 — 지나갈 수 있다 */
export const EDGE_DOOR = 2;

export type EdgeKind = typeof EDGE_NONE | typeof EDGE_SOLID | typeof EDGE_DOOR;

/** 방향 — 렌더 마스크와 같은 순서 */
export const DIR_I_PLUS = 0;
export const DIR_J_PLUS = 1;
export const DIR_I_MINUS = 2;
export const DIR_J_MINUS = 3;
export type Dir = 0 | 1 | 2 | 3;

/** 마스크 비트 (렌더용) */
export const BIT_I_PLUS = 1;
export const BIT_J_PLUS = 2;
export const BIT_I_MINUS = 4;
export const BIT_J_MINUS = 8;

const DI = [1, 0, -1, 0] as const;
const DJ = [0, 1, 0, -1] as const;

export interface WallSnapshot {
  w: number;
  h: number;
  /** `+I` 경계들 */
  ei: number[];
  /** `+J` 경계들 */
  ej: number[];
}

export type PlaceReason =
  | 'ok'
  | 'outside'
  | 'not-walkable'
  | 'occupied'
  | 'would-seal'
  | 'no-door';

export interface PlaceResult {
  ok: boolean;
  reason: PlaceReason;
  /** `would-seal` 일 때, 갇히는 칸 몇 개인지 — UI 가 "3칸이 갇힙니다" 로 보여준다 */
  sealed?: number;
}

export class WallGrid {
  /**
   * 경계 배열 — **(w+1)×(h+1)** 이고 인덱스가 1 밀려 있다.
   *
   * ## 왜 격자보다 한 칸 큰가
   *
   * (0,j) 의 `-I` 경계는 규칙상 **(−1,j) 의 `+I` 경계**다. 배열이 w×h 면 그 자리가 없어
   * `setEdge` 가 조용히 버린다 — 격자 가장자리에 지은 건물의 바깥쪽 벽이 통째로
   * 사라졌다 (K25 검토에서 실측: 가장자리 3×3 의 외곽선이 12 가 아니라 9).
   *
   * 그래서 i·j 를 −1 부터 담는다. 인덱스는 `(j+1)·(w+1) + (i+1)`.
   */
  private readonly ei: Uint8Array;
  private readonly ej: Uint8Array;
  private readonly stride: number;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.stride = width + 1;
    this.ei = new Uint8Array(this.stride * (height + 1));
    this.ej = new Uint8Array(this.stride * (height + 1));
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.width && j < this.height;
  }

  /** 경계를 저장할 수 있는 범위 — 격자보다 한 칸 넓다 (위 주석) */
  private slot(i: number, j: number): number {
    if (i < -1 || j < -1 || i >= this.width || j >= this.height) return -1;
    return (j + 1) * this.stride + (i + 1);
  }

  /**
   * (i,j) 의 `dir` 쪽 경계.
   *
   * `-I`·`-J` 는 이웃이 소유하므로 이웃에게 물어본다 — 그게 "경계는 한쪽이 소유한다"의
   * 실제 구현이다.
   */
  edgeAt(i: number, j: number, dir: Dir): EdgeKind {
    if (dir === DIR_I_MINUS) return this.edgeAt(i - 1, j, DIR_I_PLUS);
    if (dir === DIR_J_MINUS) return this.edgeAt(i, j - 1, DIR_J_PLUS);
    const k = this.slot(i, j);
    if (k < 0) return EDGE_NONE;
    const a = dir === DIR_I_PLUS ? this.ei : this.ej;
    return (a[k] as EdgeKind) ?? EDGE_NONE;
  }

  setEdge(i: number, j: number, dir: Dir, kind: EdgeKind): void {
    if (dir === DIR_I_MINUS) {
      this.setEdge(i - 1, j, DIR_I_PLUS, kind);
      return;
    }
    if (dir === DIR_J_MINUS) {
      this.setEdge(i, j - 1, DIR_J_PLUS, kind);
      return;
    }
    const k = this.slot(i, j);
    if (k < 0) return;
    if (dir === DIR_I_PLUS) this.ei[k] = kind;
    else this.ej[k] = kind;
  }

  /** 두 이웃 칸 사이의 경계 종류. 이웃이 아니면 `EDGE_NONE` */
  between(i: number, j: number, ni: number, nj: number): EdgeKind {
    if (ni === i + 1 && nj === j) return this.edgeAt(i, j, DIR_I_PLUS);
    if (ni === i - 1 && nj === j) return this.edgeAt(i, j, DIR_I_MINUS);
    if (nj === j + 1 && ni === i) return this.edgeAt(i, j, DIR_J_PLUS);
    if (nj === j - 1 && ni === i) return this.edgeAt(i, j, DIR_J_MINUS);
    return EDGE_NONE;
  }

  /**
   * 두 칸 사이를 지나갈 수 없는가.
   *
   * **이게 벽의 전부다** — 칸을 막는 게 아니라 이동을 막는다. 거리장·도달검사가 전부
   * 이 함수를 통과해야 한다.
   */
  blocksMove(i: number, j: number, ni: number, nj: number): boolean {
    return this.between(i, j, ni, nj) === EDGE_SOLID;
  }

  /** 이 칸의 경계 중 벽·문이 하나라도 있나 — 벽부착 시설 판정과 렌더가 쓴다 */
  hasAnyEdge(i: number, j: number): boolean {
    return this.mask(i, j) !== 0;
  }

  /**
   * 4방 경계 비트마스크. **문도 포함한다** — 안 그러면 문 옆 벽이 끝단으로 그려져
   * 벽선이 끊겨 보인다.
   */
  mask(i: number, j: number): number {
    let m = 0;
    if (this.edgeAt(i, j, DIR_I_PLUS) !== EDGE_NONE) m |= BIT_I_PLUS;
    if (this.edgeAt(i, j, DIR_J_PLUS) !== EDGE_NONE) m |= BIT_J_PLUS;
    if (this.edgeAt(i, j, DIR_I_MINUS) !== EDGE_NONE) m |= BIT_I_MINUS;
    if (this.edgeAt(i, j, DIR_J_MINUS) !== EDGE_NONE) m |= BIT_J_MINUS;
    return m;
  }

  /** 그 종류의 경계 수 — `+I`·`+J` 만 세므로 중복이 없다 */
  count(kind: EdgeKind): number {
    let n = 0;
    for (let k = 0; k < this.ei.length; k++) {
      if (this.ei[k] === kind) n++;
      if (this.ej[k] === kind) n++;
    }
    return n;
  }

  /** 전부 지운다 — 건물 외곽선을 다시 만들 때 쓴다 */
  clear(): void {
    this.ei.fill(EDGE_NONE);
    this.ej.fill(EDGE_NONE);
  }

  toSnapshot(): WallSnapshot {
    return { w: this.width, h: this.height, ei: Array.from(this.ei), ej: Array.from(this.ej) };
  }

  static fromSnapshot(s: WallSnapshot): WallGrid {
    const g = new WallGrid(s.w, s.h);
    const ei = s.ei ?? [];
    const ej = s.ej ?? [];
    /*
     * 길이가 다르면 **버린다.** 배열이 (w+1)×(h+1) 로 바뀐 적이 있어(가장자리 벽 수정),
     * 옛 길이를 그대로 밀어 넣으면 벽이 한 칸씩 어긋난 채 복원된다 — 빈 벽보다 나쁘다.
     * 건물 영역이 정본이므로 세이브를 불러올 때 어차피 다시 굽는다.
     */
    if (ei.length !== g.ei.length || ej.length !== g.ej.length) return g;
    for (let k = 0; k < g.ei.length; k++) {
      g.ei[k] = (ei[k] as number) ?? EDGE_NONE;
      g.ej[k] = (ej[k] as number) ?? EDGE_NONE;
    }
    return g;
  }
}

/**
 * 게이트에서 걸어서 닿는 칸 — flood fill.
 *
 * 4방 이동만 허용한다. 대각선을 허용하면 벽 두 장이 X 로 교차한 곳을 손님이 비집고
 * 지나가 "닫았는데 새는" 상태가 된다.
 *
 * 경계 벽이므로 **칸이 아니라 이동**을 막는다 — `blocksMove` 를 통과해야 한다.
 */
export function reachable(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  /**
   * 손님이 **설 수 있는** 칸인가. 기본값은 지형만 본다.
   *
   * ⚠ 시설이 놓인 칸은 지형상 걸을 수 있어도 손님은 못 지나간다. 그 차이를 무시했더니
   * 건물 문이 **시설로 막힌 칸에 뚫렸다** — 검사는 통과하는데 손님은 못 들어간다
   * (K25 검토에서 실측). 부르는 쪽이 손님과 **같은 판정**을 넘겨야 한다
   * (`guestWalkable`).
   */
  walkable?: (i: number, j: number) => boolean,
): Uint8Array {
  const w = terrain.width;
  const h = terrain.height;
  const seen = new Uint8Array(w * h);
  const can = walkable ?? ((i: number, j: number): boolean => terrain.isWalkable(i, j));
  const standable = (i: number, j: number): boolean => terrain.inside(i, j) && can(i, j);

  if (!standable(gate.i, gate.j)) return seen;

  // 명시적 스택 — 재귀는 큰 격자에서 깊이가 수천을 넘어 위험하다
  const stack: number[] = [gate.j * w + gate.i];
  seen[stack[0] as number] = 1;
  while (stack.length > 0) {
    const k = stack.pop() as number;
    const i = k % w;
    const j = (k - i) / w;
    for (let d = 0; d < 4; d++) {
      const ni = i + (DI[d] as number);
      const nj = j + (DJ[d] as number);
      if (!standable(ni, nj)) continue;
      if (walls.blocksMove(i, j, ni, nj)) continue;
      const nk = nj * w + ni;
      if (seen[nk]) continue;
      seen[nk] = 1;
      stack.push(nk);
    }
  }
  return seen;
}

/** 걸을 수 있는 칸의 개수 — 도달 검사의 분모. 벽은 칸을 막지 않으므로 지형만 본다 */
export function passableCount(terrain: KairoTerrain, _walls: WallGrid): number {
  let n = 0;
  for (let j = 0; j < terrain.height; j++) {
    for (let i = 0; i < terrain.width; i++) {
      if (terrain.isWalkable(i, j)) n++;
    }
  }
  return n;
}

/**
 * 경계에 벽을 놓을 수 있는가.
 *
 * `would-seal` 판정: 놓은 뒤에도 **놓기 전에 도달 가능했던 칸이 전부** 도달 가능해야
 * 한다. 문을 하나 남기라는 뜻이고, 그게 규칙이다.
 */
export function canPlaceEdge(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  i: number,
  j: number,
  dir: Dir,
  kind: EdgeKind = EDGE_SOLID,
): PlaceResult {
  if (!walls.inside(i, j)) return { ok: false, reason: 'outside' };
  const ni = i + (DI[dir] as number);
  const nj = j + (DJ[dir] as number);
  // 격자 밖과의 경계는 어차피 못 지나가므로 벽을 세울 이유가 없다
  if (!walls.inside(ni, nj)) return { ok: false, reason: 'outside' };
  if (walls.edgeAt(i, j, dir) !== EDGE_NONE) return { ok: false, reason: 'occupied' };

  // 문은 지나갈 수 있으니 막을 수 없다 — 도달 검사를 건너뛴다
  if (kind === EDGE_DOOR) return { ok: true, reason: 'ok' };

  const before = reachable(terrain, walls, gate);
  walls.setEdge(i, j, dir, kind);
  const after = reachable(terrain, walls, gate);
  walls.setEdge(i, j, dir, EDGE_NONE);

  let sealed = 0;
  for (let k = 0; k < before.length; k++) if (before[k] && !after[k]) sealed++;
  return sealed > 0 ? { ok: false, reason: 'would-seal', sealed } : { ok: true, reason: 'ok' };
}

/** 검사 후 놓는다. 실패 이유를 그대로 돌려준다 */
export function placeEdge(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  i: number,
  j: number,
  dir: Dir,
  kind: EdgeKind = EDGE_SOLID,
): PlaceResult {
  const r = canPlaceEdge(terrain, walls, gate, i, j, dir, kind);
  if (r.ok) walls.setEdge(i, j, dir, kind);
  return r;
}

/** 경계의 벽·문을 지운다. 지우는 건 도달성을 늘리기만 하므로 항상 허용 */
export function removeEdge(walls: WallGrid, i: number, j: number, dir: Dir): boolean {
  if (walls.edgeAt(i, j, dir) === EDGE_NONE) return false;
  walls.setEdge(i, j, dir, EDGE_NONE);
  return true;
}

export const PLACE_MESSAGES: Record<PlaceReason, string> = {
  ok: '',
  outside: '격자 밖입니다',
  'not-walkable': '물 위에는 벽을 세울 수 없습니다',
  occupied: '이미 벽이 있습니다',
  'would-seal': '이렇게 닫으면 손님이 못 들어갑니다 — 문을 남기세요',
  'no-door': '문이 하나도 없습니다 — 손님이 못 들어갑니다',
};

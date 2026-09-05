/**
 * 길찾기 — 목표 집합에서 4이웃 BFS 거리장. 손님은 거리가 줄어드는 이웃으로 한 칸씩 간다.
 * 거리장은 격자가 바뀔 때만 다시 계산한다 (`invalidate`).
 */
import { Grid } from './grid.js';

export const UNREACHABLE = 0xffff;

export type Walkable = (i: number, j: number) => boolean;

export class DistanceField {
  readonly dist: Uint16Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.dist = new Uint16Array(w * h).fill(UNREACHABLE);
  }

  at(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return UNREACHABLE;
    return this.dist[j * this.w + i] as number;
  }

  /** 거리가 가장 작은 이웃. 없으면 null (이미 목표거나 고립) */
  next(i: number, j: number): { i: number; j: number } | null {
    const here = this.at(i, j);
    let best: { i: number; j: number } | null = null;
    let bestD = here;
    for (const [di, dj] of NEIGHBORS) {
      const d = this.at(i + di, j + dj);
      if (d < bestD) {
        bestD = d;
        best = { i: i + di, j: j + dj };
      }
    }
    return best;
  }
}

export const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** `targets` 에서 시작해 `walkable` 칸을 넓힌다. 목표 칸 자체는 걸을 수 없어도 된다(풀·시설) */
export function buildField(grid: Grid, targets: readonly { i: number; j: number }[], walkable: Walkable): DistanceField {
  const f = new DistanceField(grid.w, grid.h);
  const queue: number[] = [];
  for (const t of targets) {
    if (!grid.inside(t.i, t.j)) continue;
    const k = t.j * grid.w + t.i;
    if (f.dist[k] !== UNREACHABLE) continue;
    f.dist[k] = 0;
    queue.push(k);
  }
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++] as number;
    const i = k % grid.w;
    const j = Math.floor(k / grid.w);
    const d = f.dist[k] as number;
    for (const [di, dj] of NEIGHBORS) {
      const ni = i + di;
      const nj = j + dj;
      if (!grid.inside(ni, nj) || !walkable(ni, nj) || !grid.levelPassable(i, j, ni, nj)) continue; // P0-B: 단차 2 이상은 벽
      const nk = nj * grid.w + ni;
      if (f.dist[nk] !== UNREACHABLE) continue;
      f.dist[nk] = d + 1;
      queue.push(nk);
    }
  }
  return f;
}

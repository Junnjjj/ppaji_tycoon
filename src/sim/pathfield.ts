/**
 * Flow field 길찾기 — 계획서 §2.5.
 *
 * 목적지마다 "여기서 목적지까지 몇 걸음"인 거리장을 BFS 로 한 번 만들어 둔다.
 * 손님은 매 tick 이웃 타일 중 거리가 가장 작은 쪽으로 한 칸 갈 뿐이다 — 손님당 O(1).
 *
 * 손님 200명이 각자 A* 를 돌리면 배치를 바꿀 때마다 프레임이 튄다.
 * 거리장은 건설 시점에 한 번만 계산하면 되고, 손님이 몇 명이든 비용이 같다.
 */

export const UNREACHABLE = -1;

/** 4방향. 대각선을 빼면 시설 모서리를 뚫고 지나가는 문제가 없다. */
const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

export class FlowField {
  readonly width: number;
  readonly height: number;
  private readonly dist: Int32Array;
  private readonly queue: Int32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.dist = new Int32Array(width * height);
    this.queue = new Int32Array(width * height);
  }

  /**
   * 거리장을 다시 만든다. 시설이 바뀔 때만 호출한다.
   *
   * @param walkable 그 타일을 지나갈 수 있는가
   * @param targets  거리 0 이 되는 목적지 타일들
   */
  build(
    walkable: (x: number, y: number) => boolean,
    targets: Iterable<readonly [number, number]>,
  ): void {
    this.dist.fill(UNREACHABLE);

    let head = 0;
    let tail = 0;

    for (const [tx, ty] of targets) {
      if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
      const i = ty * this.width + tx;
      if (this.dist[i] !== UNREACHABLE) continue;
      this.dist[i] = 0;
      this.queue[tail++] = i;
    }

    while (head < tail) {
      const i = this.queue[head++] as number;
      const d = (this.dist[i] as number) + 1;
      const x = i % this.width;
      const y = (i / this.width) | 0;

      for (let k = 0; k < 4; k++) {
        const nx = x + (DX[k] as number);
        const ny = y + (DY[k] as number);
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;

        const ni = ny * this.width + nx;
        if (this.dist[ni] !== UNREACHABLE) continue;
        if (!walkable(nx, ny)) continue;

        this.dist[ni] = d;
        this.queue[tail++] = ni;
      }
    }
  }

  /** 목적지까지 걸음 수. 못 가면 UNREACHABLE. */
  distAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return UNREACHABLE;
    return this.dist[y * this.width + x] as number;
  }

  reachable(x: number, y: number): boolean {
    return this.distAt(x, y) !== UNREACHABLE;
  }

  arrived(x: number, y: number): boolean {
    return this.distAt(x, y) === 0;
  }

  /**
   * 다음에 밟을 타일. 이미 도착했거나 길이 없으면 null.
   *
   * 동점일 때는 tieBreak(0~3)로 방향을 고른다. 손님마다 다른 값을 주면
   * 모두가 같은 한 줄로 뭉치지 않고 자연스럽게 퍼진다.
   */
  next(x: number, y: number, tieBreak = 0): readonly [number, number] | null {
    const here = this.distAt(x, y);
    if (here === UNREACHABLE || here === 0) return null;

    let best: readonly [number, number] | null = null;
    let bestDist = here;

    for (let k = 0; k < 4; k++) {
      const dir = (k + tieBreak) & 3;
      const nx = x + (DX[dir] as number);
      const ny = y + (DY[dir] as number);
      const d = this.distAt(nx, ny);
      if (d === UNREACHABLE) continue;
      if (d < bestDist) {
        bestDist = d;
        best = [nx, ny];
      }
    }
    return best;
  }
}

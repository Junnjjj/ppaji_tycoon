import { DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS, type Dir } from './walls.js';

/**
 * 플레이어가 **놓은 출입구** (K36-B).
 *
 * ## 왜 "희망"인가
 *
 * 벽은 실내 바닥에서 파생된다 (K27 — `terrain.isIndoor` 가 정본). 문도 지금까지 파생이었다:
 * `bakeIndoorWalls` 가 덩어리마다 하나씩 자동으로 골랐다. 그래서 **건물은 언제나 막다른
 * 곳**이었고, 공원 한복판에 지으면 손님이 빙 돌아갔다.
 *
 * 사용자가 원한 것은 "건물을 통과하는 통로". 그러려면 문이 둘 이상이어야 하고, 어디에 낼지는
 * 플레이어가 정해야 한다.
 *
 * 그런데 문을 **상태**로 만들면 정본이 둘이 된다 (지형과 문). 바닥을 지웠는데 문이 남으면
 * 지형과 어긋난다. 그래서 이건 상태가 아니라 **희망**이다 — "여기 문을 원한다"만 담고,
 * 그 경계가 실제로 외곽선인지는 매번 `bakeIndoorWalls` 가 판단한다. 외곽선이 아니게 되면
 * 조용히 무시되고, 바닥을 다시 깔면 되살아난다.
 *
 * ## 정규형으로만 담는다
 *
 * `-I`·`-J` 경계는 이웃이 소유한다 (K25). 한 경계를 두 형태로 담으면 **반드시 어긋난다** —
 * 지우려는데 다른 형태로 남아 있는 식이다. 그래서 들어올 때 `+I`/`+J` 로 정규화한다.
 * `WallGrid.setEdge` 가 하는 것과 같은 변환이다.
 */

/** 정규형 방향 — 저장은 `+I`/`+J` 만 */
export type DoorDir = typeof DIR_I_PLUS | typeof DIR_J_PLUS;

export interface DoorSnapshot {
  /** `i,j,dir` 을 이어붙인 키 목록 */
  keys: string[];
}

/** `(i,j,dir)` → 소유자 기준 정규형. `-I`·`-J` 는 이웃에게 넘긴다 */
export function canonical(i: number, j: number, dir: Dir): { i: number; j: number; dir: DoorDir } {
  if (dir === DIR_I_MINUS) return { i: i - 1, j, dir: DIR_I_PLUS };
  if (dir === DIR_J_MINUS) return { i, j: j - 1, dir: DIR_J_PLUS };
  return { i, j, dir: dir as DoorDir };
}

function key(i: number, j: number, dir: DoorDir): string {
  return `${i},${j},${dir}`;
}

export class DoorSet {
  private readonly wanted = new Set<string>();

  get count(): number {
    return this.wanted.size;
  }

  has(i: number, j: number, dir: Dir): boolean {
    const c = canonical(i, j, dir);
    return this.wanted.has(key(c.i, c.j, c.dir));
  }

  add(i: number, j: number, dir: Dir): void {
    const c = canonical(i, j, dir);
    this.wanted.add(key(c.i, c.j, c.dir));
  }

  remove(i: number, j: number, dir: Dir): boolean {
    const c = canonical(i, j, dir);
    return this.wanted.delete(key(c.i, c.j, c.dir));
  }

  /** 이 칸이 소유하거나 이웃이 소유한 문 방향들 — 렌더·검증이 읽는다 */
  dirsAt(i: number, j: number): Dir[] {
    const out: Dir[] = [];
    for (const d of [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS] as Dir[]) {
      if (this.has(i, j, d)) out.push(d);
    }
    return out;
  }

  clear(): void {
    this.wanted.clear();
  }

  toSnapshot(): DoorSnapshot {
    // 정렬해서 내보낸다 — 세이브가 결정론적이어야 diff 가 읽힌다
    return { keys: [...this.wanted].sort() };
  }

  static fromSnapshot(s: DoorSnapshot | undefined): DoorSet {
    const d = new DoorSet();
    for (const k of s?.keys ?? []) {
      const [i, j, dir] = k.split(',').map(Number);
      if (i === undefined || j === undefined || dir === undefined) continue;
      if (dir !== DIR_I_PLUS && dir !== DIR_J_PLUS) continue; // 정규형이 아니면 버린다
      d.wanted.add(key(i, j, dir));
    }
    return d;
  }
}

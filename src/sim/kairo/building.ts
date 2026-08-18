import type { KairoTerrain } from './terrain.js';
import {
  WallGrid,
  EDGE_SOLID,
  EDGE_DOOR,
  EDGE_NONE,
  DIR_I_PLUS,
  DIR_J_PLUS,
  DIR_I_MINUS,
  DIR_J_MINUS,
  reachable,
  type Dir,
} from './walls.js';

/**
 * 건물 — **사각 영역을 지정하면 외곽 벽이 자동으로 생긴다** (K25, 카이로 방식).
 *
 * ## 왜 개별 벽 배치를 버렸나
 *
 * 실내 시설 9종(화장실·샤워실·탈의실·세면대·락커·수유실 …)이 전부 벽부착이고, 위생 수요는
 * **벽 없이는 아예 못 채운다.** 그래서 예전 방식에서는 게임을 시작하자마자 벽을 스무 칸쯤
 * 손으로 찍어야 했다 — 그게 첫 할 일이면 안 된다.
 *
 * 이제 영역만 지정한다. 벽은 **결과**이지 작업이 아니다:
 *   · 영역을 넓히면 옛 외곽선이 사라지고 새 외곽선이 생긴다
 *   · 두 건물이 붙으면 맞닿은 벽은 사라진다 (합쳐진 한 덩어리의 외곽선만 남는다)
 *   · 문은 **게이트에서 가장 가까운 외곽 경계**에 자동으로 하나 뚫린다
 *
 * ## 벽은 항상 다시 계산한다
 *
 * 부분 갱신을 하면 "넓혔는데 옛 벽이 남아 있다" 같은 상태가 생긴다. 건물이 바뀔 때마다
 * **전부 지우고 다시 그린다** — 격자가 96×72 여도 외곽선 계산은 셀 수천 개 순회라 싸다.
 */

export interface BuildingRect {
  i: number;
  j: number;
  w: number;
  h: number;
}

export interface Building {
  handle: number;
  rect: BuildingRect;
}

export interface BuildingSnapshot {
  items: Building[];
  next: number;
}

export type BuildingFail =
  | 'too-small'
  | 'outside'
  | 'not-land'
  | 'covers-gate'
  | 'no-door'
  | 'unreachable';

export const BUILDING_FAIL_MESSAGES: Record<BuildingFail, string> = {
  'too-small': '건물은 최소 2×2 입니다',
  outside: '격자 밖입니다',
  'not-land': '물 위에는 건물을 지을 수 없습니다',
  'covers-gate': '입구를 덮을 수 없습니다',
  'no-door': '문을 낼 자리가 없습니다 — 한 면이 열려 있어야 합니다',
  unreachable: '손님이 걸어올 수 없는 자리입니다',
};

/** 건물 최소 크기 — 1×1 은 벽 네 장이 한 칸을 감싸 안이 없다 */
export const MIN_BUILDING = 2;

function cellsOf(rect: BuildingRect): [number, number][] {
  const out: [number, number][] = [];
  for (let j = rect.j; j < rect.j + rect.h; j++) {
    for (let i = rect.i; i < rect.i + rect.w; i++) out.push([i, j]);
  }
  return out;
}

export class BuildingStore {
  private readonly items: Building[] = [];
  private nextHandle = 1;

  get all(): readonly Building[] {
    return this.items;
  }

  get count(): number {
    return this.items.length;
  }

  /** 그 칸이 어느 건물 안인가 */
  at(i: number, j: number): Building | undefined {
    return this.items.find(
      (b) =>
        i >= b.rect.i && i < b.rect.i + b.rect.w && j >= b.rect.j && j < b.rect.j + b.rect.h,
    );
  }

  /** 건물 안의 칸인가 — 벽부착·실내 판정이 쓴다 */
  isIndoor(i: number, j: number): boolean {
    return this.at(i, j) !== undefined;
  }

  /**
   * 놓거나 넓힐 수 있는가.
   *
   * 겹치는 건물이 있으면 **넓히기**로 본다 (그 건물을 새 사각형으로 교체). 그래서
   * "특정 영역을 넣으면 기존 벽이 사라지고 새 외곽선이 생긴다"가 성립한다.
   */
  check(
    terrain: KairoTerrain,
    gate: { i: number; j: number },
    rect: BuildingRect,
  ): { ok: boolean; fail?: BuildingFail; replaces?: number[] } {
    if (rect.w < MIN_BUILDING || rect.h < MIN_BUILDING) return { ok: false, fail: 'too-small' };
    for (const [i, j] of cellsOf(rect)) {
      if (!terrain.inside(i, j)) return { ok: false, fail: 'outside' };
      if (!terrain.isWalkable(i, j)) return { ok: false, fail: 'not-land' };
      if (i === gate.i && j === gate.j) return { ok: false, fail: 'covers-gate' };
    }
    const replaces = this.items
      .filter((b) => overlaps(b.rect, rect))
      .map((b) => b.handle);
    return { ok: true, replaces };
  }

  /**
   * 영역을 확정한다. 겹치는 건물은 **흡수한다** — 넓히기가 곧 새 사각형이다.
   *
   * 벽을 다시 그린 뒤 도달 검사를 하고, 실패하면 통째로 되돌린다. 되돌리기가 있어야
   * "지었더니 손님이 못 들어오는데 취소도 안 된다"가 안 생긴다.
   */
  place(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
    rect: BuildingRect,
  ): { ok: boolean; fail?: BuildingFail; building?: Building } {
    const c = this.check(terrain, gate, rect);
    if (!c.ok) return { ok: false, ...(c.fail ? { fail: c.fail } : {}) };

    const snapshot = this.toSnapshot();
    for (const h of c.replaces ?? []) this.removeSilent(h);
    const building: Building = { handle: this.nextHandle++, rect: { ...rect } };
    this.items.push(building);

    const applied = this.applyWalls(terrain, walls, gate);
    if (!applied.ok) {
      const back = BuildingStore.fromSnapshot(snapshot);
      this.items.length = 0;
      this.items.push(...back.all.map((b) => ({ ...b, rect: { ...b.rect } })));
      this.nextHandle = snapshot.next;
      this.applyWalls(terrain, walls, gate);
      return { ok: false, ...(applied.fail ? { fail: applied.fail } : {}) };
    }
    return { ok: true, building };
  }

  private removeSilent(handle: number): void {
    const k = this.items.findIndex((b) => b.handle === handle);
    if (k >= 0) this.items.splice(k, 1);
  }

  /** 건물을 없앤다 — 벽도 같이 사라진다 */
  remove(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
    handle: number,
  ): boolean {
    const k = this.items.findIndex((b) => b.handle === handle);
    if (k < 0) return false;
    this.items.splice(k, 1);
    this.applyWalls(terrain, walls, gate);
    return true;
  }

  /**
   * 건물들의 **외곽선**을 벽으로 굽는다. 안쪽 경계는 지운다.
   *
   * 두 건물이 맞닿으면 그 경계는 양쪽 다 실내라 외곽선이 아니다 — 그래서 자동으로
   * 사라진다. "붙이면 벽이 없어진다"가 규칙이 아니라 **정의에서 따라 나온다.**
   */
  applyWalls(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
  ): { ok: boolean; fail?: BuildingFail; doors: number } {
    walls.clear();
    if (this.items.length === 0) return { ok: true, doors: 0 };

    const dirs: Dir[] = [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS];
    const D = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const;

    /** 외곽 경계들 — 안쪽은 실내, 바깥쪽은 실외 */
    const outline: { i: number; j: number; dir: Dir; oi: number; oj: number }[] = [];
    for (const b of this.items) {
      for (const [i, j] of cellsOf(b.rect)) {
        for (let d = 0; d < 4; d++) {
          const oi = i + (D[d]![0] as number);
          const oj = j + (D[d]![1] as number);
          if (this.isIndoor(oi, oj)) continue; // 실내끼리 맞닿은 면 — 벽이 아니다
          if (!terrain.inside(oi, oj)) continue; // 격자 밖 — 어차피 못 지나간다
          outline.push({ i, j, dir: dirs[d] as Dir, oi, oj });
        }
      }
    }

    for (const e of outline) walls.setEdge(e.i, e.j, e.dir, EDGE_SOLID);

    /*
     * 문 — **게이트에서 가장 가까운 외곽 경계**에 하나. 바깥쪽 칸이 게이트에서 걸어올 수
     * 있어야 의미가 있다 (물가 쪽에 뚫으면 아무도 못 온다).
     */
    const reach = reachable(terrain, walls, gate);
    let doors = 0;
    for (const b of this.items) {
      const mine = outline.filter(
        (e) =>
          e.i >= b.rect.i &&
          e.i < b.rect.i + b.rect.w &&
          e.j >= b.rect.j &&
          e.j < b.rect.j + b.rect.h,
      );
      const usable = mine.filter(
        (e) =>
          terrain.isWalkable(e.oi, e.oj) &&
          !this.isIndoor(e.oi, e.oj) &&
          reach[e.oj * terrain.width + e.oi] === 1,
      );
      if (usable.length === 0) return { ok: false, fail: 'no-door', doors };
      usable.sort(
        (a, b2) =>
          Math.abs(a.oi - gate.i) +
          Math.abs(a.oj - gate.j) -
          (Math.abs(b2.oi - gate.i) + Math.abs(b2.oj - gate.j)),
      );
      const door = usable[0] as { i: number; j: number; dir: Dir };
      walls.setEdge(door.i, door.j, door.dir, EDGE_DOOR);
      doors++;
    }

    // 문을 뚫은 뒤에도 실내가 전부 닿아야 한다
    const after = reachable(terrain, walls, gate);
    for (const b of this.items) {
      for (const [i, j] of cellsOf(b.rect)) {
        if (after[j * terrain.width + i] !== 1) return { ok: false, fail: 'unreachable', doors };
      }
    }
    return { ok: true, doors };
  }

  toSnapshot(): BuildingSnapshot {
    return {
      items: this.items.map((b) => ({ handle: b.handle, rect: { ...b.rect } })),
      next: this.nextHandle,
    };
  }

  static fromSnapshot(s: BuildingSnapshot): BuildingStore {
    const st = new BuildingStore();
    for (const b of s.items ?? []) st.items.push({ handle: b.handle, rect: { ...b.rect } });
    st.nextHandle = s.next ?? 1;
    return st;
  }
}

function overlaps(a: BuildingRect, b: BuildingRect): boolean {
  return a.i < b.i + b.w && b.i < a.i + a.w && a.j < b.j + b.h && b.j < a.j + a.h;
}

export { EDGE_NONE };

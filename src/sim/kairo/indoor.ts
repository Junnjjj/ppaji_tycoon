import type { KairoTerrain } from './terrain.js';
import {
  WallGrid,
  EDGE_SOLID,
  EDGE_DOOR,
  DIR_I_PLUS,
  DIR_J_PLUS,
  DIR_I_MINUS,
  DIR_J_MINUS,
  reachable,
  type Dir,
} from './walls.js';

/**
 * 실내 — **바닥을 깔면 그게 방이다** (K27, 카이로 방식).
 *
 * ## 왜 사각형 건물을 버렸나
 *
 * K25 에서 "영역을 두 번 탭하면 외곽선이 벽이 된다"를 만들었다. 결과 화면은 비슷했지만
 * 모델이 카이로와 달랐고, **그 모델에서만 생기는 문제가 여섯 개** 나왔다:
 * 맞닿은 두 채가 문이 둘 · 겹치면 흡수하는데 인접은 안 함 · 1×1 거절 · 미리보기 없음 ·
 * 취소가 에러로 뜸 · 철거 확인 없음.
 *
 * Pool Slide Story 의 규칙은 한 줄이다:
 *
 * > "Any indoor tile created will make an indoor area, which requires an Entrance."
 *
 * 플레이어의 동사는 **"바닥을 산다"** 하나다. 사각형이 없으니 위 여섯 개가 전부 사라진다.
 * 넓히기는 그냥 옆에 한 칸 더 까는 것이고, 취소는 다른 바닥으로 덮는 것이다.
 *
 * ## 그래서 이 파일은 저장소가 아니라 함수다
 *
 * 실내 여부는 지형이 이미 알고 있다 (`terrain.isIndoor`). 따로 들고 있으면 지형과
 * 어긋날 수 있다. 여기서는 **읽어서 벽을 굽기만** 한다.
 */

export type IndoorFail = 'no-door' | 'unreachable';

export const INDOOR_FAIL_MESSAGES: Record<IndoorFail, string> = {
  'no-door': '문을 낼 자리가 없습니다 — 실내 한쪽이 바깥과 닿아야 합니다',
  unreachable: '손님이 걸어올 수 없는 실내가 생깁니다',
};

export interface BakeResult {
  ok: boolean;
  fail?: IndoorFail;
  /** 실내 덩어리 수 — 떨어져 있으면 각자 문을 하나씩 갖는다 */
  areas: number;
  doors: number;
}

const DIRS: Dir[] = [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS];
const DI = [1, 0, -1, 0] as const;
const DJ = [0, 1, 0, -1] as const;

/**
 * 실내 칸들을 **이어진 덩어리**로 나눈다.
 *
 * 덩어리마다 문이 하나씩 필요하다. 이걸 안 하면 떨어진 방 두 개 중 하나에만 문이 나서
 * 나머지가 통째로 죽는다. 반대로 붙어 있는 방 두 개에 문을 둘 내면 **한 공간에 현관이
 * 둘**이 된다 — 사각형 모델에서 실제로 그랬다.
 */
export function indoorAreas(terrain: KairoTerrain): Int32Array {
  const w = terrain.width;
  const h = terrain.height;
  const area = new Int32Array(w * h).fill(-1);
  let next = 0;
  for (let j0 = 0; j0 < h; j0++) {
    for (let i0 = 0; i0 < w; i0++) {
      if (!terrain.isIndoor(i0, j0) || area[j0 * w + i0] !== -1) continue;
      const id = next++;
      const stack = [j0 * w + i0];
      area[stack[0] as number] = id;
      while (stack.length > 0) {
        const k = stack.pop() as number;
        const i = k % w;
        const j = (k - i) / w;
        for (let d = 0; d < 4; d++) {
          const ni = i + (DI[d] as number);
          const nj = j + (DJ[d] as number);
          if (!terrain.inside(ni, nj) || !terrain.isIndoor(ni, nj)) continue;
          const nk = nj * w + ni;
          if (area[nk] !== -1) continue;
          area[nk] = id;
          stack.push(nk);
        }
      }
    }
  }
  return area;
}

/** 실내 덩어리 개수 */
export function indoorAreaCount(area: Int32Array): number {
  let max = -1;
  for (const v of area) if (v > max) max = v;
  return max + 1;
}

/**
 * 실내 바닥에서 벽을 굽는다 — **매번 전부 다시** 그린다.
 *
 * 부분 갱신은 "바닥을 지웠는데 옛 벽이 남았다"를 만든다. 격자 64×48 이어도 순회는
 * 셀 3천 개라 싸다.
 *
 * 실패하면 **벽을 통째로 지운다** — 반쯤 적용된 벽이 남는 것이 최악이다. 부르는 쪽이
 * 지형을 되돌리고 다시 부른다.
 */
export function bakeIndoorWalls(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  /** 손님이 설 수 있는 칸 (`guestWalkable`). 안 넘기면 지형만 본다 */
  walkable?: (i: number, j: number) => boolean,
): BakeResult {
  const canStand = walkable ?? ((i: number, j: number): boolean => terrain.isWalkable(i, j));
  walls.clear();

  const area = indoorAreas(terrain);
  const areas = indoorAreaCount(area);
  if (areas === 0) return { ok: true, areas: 0, doors: 0 };

  const w = terrain.width;

  /** 외곽선 — 안쪽은 실내, 바깥쪽은 실내가 아니다 */
  const outline: { i: number; j: number; dir: Dir; oi: number; oj: number; area: number }[] = [];
  for (let j = 0; j < terrain.height; j++) {
    for (let i = 0; i < w; i++) {
      if (!terrain.isIndoor(i, j)) continue;
      for (let d = 0; d < 4; d++) {
        const oi = i + (DI[d] as number);
        const oj = j + (DJ[d] as number);
        if (terrain.isIndoor(oi, oj)) continue; // 실내끼리 맞닿은 면 — 벽이 아니다
        /*
         * ⚠ 격자 밖 이웃도 외곽선이다. 건너뛰었더니 가장자리에 붙인 방의 그쪽 면이
         * 통째로 뚫린 채 지어졌다 (K26 ③). `WallGrid` 가 (w+1)×(h+1) 인 이유이기도 하다.
         */
        outline.push({ i, j, dir: DIRS[d] as Dir, oi, oj, area: area[j * w + i] as number });
      }
    }
  }
  for (const e of outline) walls.setEdge(e.i, e.j, e.dir, EDGE_SOLID);

  /*
   * 문 — 덩어리마다 하나, **게이트에서 가장 가까운** 외곽 경계에.
   *
   * 양쪽 다 설 수 있어야 한다. 바깥칸만 보면 문이 시설로 꽉 찬 실내 칸으로 열려
   * 손님이 들어오자마자 갈 곳이 없다 (K26 에서 실측).
   */
  const reach = reachable(terrain, walls, gate, canStand);
  let doors = 0;
  for (let a = 0; a < areas; a++) {
    const usable = outline.filter(
      (e) =>
        e.area === a &&
        terrain.inside(e.oi, e.oj) &&
        canStand(e.oi, e.oj) &&
        canStand(e.i, e.j) &&
        !terrain.isIndoor(e.oi, e.oj) &&
        reach[e.oj * w + e.oi] === 1,
    );
    if (usable.length === 0) {
      walls.clear();
      return { ok: false, fail: 'no-door', areas, doors };
    }
    usable.sort(
      (x, y) =>
        Math.abs(x.oi - gate.i) +
        Math.abs(x.oj - gate.j) -
        (Math.abs(y.oi - gate.i) + Math.abs(y.oj - gate.j)),
    );
    const door = usable[0] as { i: number; j: number; dir: Dir };
    walls.setEdge(door.i, door.j, door.dir, EDGE_DOOR);
    doors++;
  }

  /*
   * 문을 뚫은 뒤에도 실내가 닿아야 한다.
   *
   * ⚠ **설 수 없는 칸은 건너뛴다.** 시설이 놓인 칸은 막힌 게 아니라 쓰이는 중이다.
   * 이걸 빼먹었더니 시설이 든 방을 넓힐 수 없었다 (K26).
   */
  const after = reachable(terrain, walls, gate, canStand);
  for (let j = 0; j < terrain.height; j++) {
    for (let i = 0; i < w; i++) {
      if (!terrain.isIndoor(i, j) || !canStand(i, j)) continue;
      if (after[j * w + i] !== 1) {
        walls.clear();
        return { ok: false, fail: 'unreachable', areas, doors };
      }
    }
  }
  return { ok: true, areas, doors };
}

/**
 * 한 칸을 칠하고 벽을 다시 굽는다. 실패하면 **지형까지 되돌린다.**
 *
 * 되돌리기가 여기 있어야 "칠했더니 손님이 못 들어오는데 취소도 안 된다"가 안 생긴다.
 */
export function paintFloor(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  i: number,
  j: number,
  kind: string,
  walkable?: (i: number, j: number) => boolean,
): { ok: boolean; fail?: IndoorFail; changed: boolean } {
  const before = terrain.kindAt(i, j);
  if (before === null) return { ok: false, changed: false };
  if (before === kind) return { ok: true, changed: false };
  if (!terrain.paint(i, j, kind)) return { ok: false, changed: false };

  const r = bakeIndoorWalls(terrain, walls, gate, walkable);
  if (!r.ok) {
    terrain.paint(i, j, before);
    bakeIndoorWalls(terrain, walls, gate, walkable);
    return { ok: false, ...(r.fail ? { fail: r.fail } : {}), changed: false };
  }
  return { ok: true, changed: true };
}

/**
 * 사각 블록을 한 번에 칠한다 (K32) — 건물 바닥 2×2 · 4×4 붓.
 *
 * ⚠ 칸마다 `paintFloor` 를 부르면 안 된다. 중간 상태에서 문이 잠깐 사라져 `no-door` 로
 * 되돌아가는 일이 생긴다. **전부 칠한 뒤 한 번 굽고, 실패하면 통째로 되돌린다.**
 *
 * 물·격자 밖·이미 같은 바닥인 칸은 건너뛴다 — 그래서 4×4 라고 늘 16칸이 아니다.
 * 값은 **실제로 바뀐 칸 수**(`changed`)대로 받아야 한다.
 */
export function paintFloorBlock(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  i0: number,
  j0: number,
  bw: number,
  bh: number,
  kind: string,
  walkable?: (i: number, j: number) => boolean,
): { ok: boolean; fail?: IndoorFail; changed: number } {
  const before: [number, number, string][] = [];
  for (let j = j0; j < j0 + bh; j++) {
    for (let i = i0; i < i0 + bw; i++) {
      if (!terrain.inside(i, j) || terrain.isWater(i, j)) continue;
      const k = terrain.kindAt(i, j);
      if (k === null || k === kind) continue;
      before.push([i, j, k]);
    }
  }
  if (before.length === 0) return { ok: true, changed: 0 };

  for (const [i, j] of before) terrain.paint(i, j, kind);
  const r = bakeIndoorWalls(terrain, walls, gate, walkable);
  if (!r.ok) {
    for (const [i, j, k] of before) terrain.paint(i, j, k);
    bakeIndoorWalls(terrain, walls, gate, walkable);
    return { ok: false, ...(r.fail ? { fail: r.fail } : {}), changed: 0 };
  }
  return { ok: true, changed: before.length };
}

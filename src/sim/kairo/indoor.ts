import type { KairoTerrain } from './terrain.js';
import { facilityDef, type PlacementGrid } from './placement.js';
import type { DoorSet } from './doors.js';
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

export type IndoorFail = 'no-door' | 'unreachable' | 'would-strand' | 'not-buildable';

export const INDOOR_FAIL_MESSAGES: Record<IndoorFail, string> = {
  /*
   * K32-B: 포장한 바닥만 걷게 되면서 이 메시지가 거짓말이 됐다. "바깥과 닿아 있는데"
   * 거절당하기 때문이다 — 닿은 바깥이 잔디면 문이 못 난다. 무엇을 하면 되는지 말한다.
   */
  'no-door': '입구를 낼 수 없습니다 — 건물에 길을 붙이세요',
  unreachable: '손님이 걸어올 수 없는 실내가 생깁니다',
  /*
   * K32-B: 포장한 바닥만 걷게 되면서 **길 한 칸을 지우면 리조트가 죽는** 일이 생겼다.
   * 시설 배치의 `would-strand`, 벽의 `would-seal` 과 같은 방식 — 이미 있는 기계
   * (`reachable` 전후 비교)를 쓴다. 되돌릴 수 있는 실수는 막는 것이 낫다.
   */
  'would-strand': '길이 끊겨 손님이 못 가는 시설이 생깁니다',
  'not-buildable': '공원 밖입니다 — 도로·보도에는 깔 수 없습니다',
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
  /**
   * 플레이어가 놓은 출입구 (K36-B). **희망이지 상태가 아니다** — 여기 담긴 경계가
   * 실제로 외곽선이고 쓸 수 있을 때만 문이 된다.
   */
  doors?: DoorSet,
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
   * 문 — **플레이어가 놓은 것이 먼저, 없으면 자동으로 하나** (K36-B).
   *
   * 자동을 없애지 않는 이유: 문이 없으면 방이 죽고, 이 함수는 실패하면 벽을 통째로
   * 지운다. 플레이어가 아직 문을 안 놓은 새 방이 조용히 죽으면 안 된다. 자동은 **보험**이다.
   *
   * 양쪽 다 설 수 있어야 한다. 바깥칸만 보면 문이 시설로 꽉 찬 실내 칸으로 열려
   * 손님이 들어오자마자 갈 곳이 없다 (K26 에서 실측).
   */
  const reach = reachable(terrain, walls, gate, canStand);
  let doorCount = 0;
  for (let a = 0; a < areas; a++) {
    /*
     * ⚠ **자동 문과 플레이어 문의 조건이 다르다.**
     *
     * 자동 문은 "이미 게이트에서 닿는 바깥"으로 나야 한다 — 아무 데나 뚫으면 방이
     * 닿지 않는 주머니로 열려 손님이 못 온다.
     *
     * 플레이어 문은 그 조건을 **빼야 한다.** 문의 목적이 새 길을 여는 것이기 때문이다:
     * 건물이 통로를 가로막고 있을 때 반대편은 아직 안 닿으므로, `reach` 를 요구하면
     * **통과용 문을 영원히 못 고른다** (실측: 두 번째 문이 조용히 무시됐다).
     */
    const onOutline = outline.filter(
      (e) =>
        e.area === a &&
        terrain.inside(e.oi, e.oj) &&
        canStand(e.oi, e.oj) &&
        canStand(e.i, e.j) &&
        !terrain.isIndoor(e.oi, e.oj),
    );
    const usable = onOutline.filter((e) => reach[e.oj * w + e.oi] === 1);
    const wanted = doors ? onOutline.filter((e) => doors.has(e.i, e.j, e.dir)) : [];
    if (usable.length === 0 && wanted.length === 0) {
      walls.clear();
      return { ok: false, fail: 'no-door', areas, doors: doorCount };
    }
    if (wanted.length > 0) {
      for (const e of wanted) {
        walls.setEdge(e.i, e.j, e.dir, EDGE_DOOR);
        doorCount++;
      }
      continue;
    }
    usable.sort(
      (x, y) =>
        Math.abs(x.oi - gate.i) +
        Math.abs(x.oj - gate.j) -
        (Math.abs(y.oi - gate.i) + Math.abs(y.oj - gate.j)),
    );
    const door = usable[0] as { i: number; j: number; dir: Dir };
    walls.setEdge(door.i, door.j, door.dir, EDGE_DOOR);
    doorCount++;
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
        return { ok: false, fail: 'unreachable', areas, doors: doorCount };
      }
    }
  }
  return { ok: true, areas, doors: doorCount };
}

/**
 * 게이트에서 걸어 닿는 시설의 수 — **바닥을 지우기 전후로 비교**한다.
 *
 * 시설 칸 자체는 손님이 못 서는 칸이므로(점유), 발자국에 **인접한** 칸 중 하나라도
 * 닿으면 그 시설은 살아 있다. `placement.check` 의 `unreachable` 과 같은 기준이다.
 */
export function servedFacilities(
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
  placement: PlacementGrid,
  walkable?: (i: number, j: number) => boolean,
): number {
  const reach = reachable(terrain, walls, gate, walkable);
  const w = terrain.width;
  let n = 0;
  for (const f of placement.all()) {
    const size = facilityDef(f.defId)?.size ?? [1, 1];
    const sw = size[0] as number;
    const sh = size[1] as number;
    let ok = false;
    for (let dj = -1; dj <= sh && !ok; dj++) {
      for (let di = -1; di <= sw && !ok; di++) {
        const inI = di >= 0 && di < sw;
        const inJ = dj >= 0 && dj < sh;
        if (inI && inJ) continue; // 발자국 자신
        if (!inI && !inJ) continue; // 대각선
        const ni = f.i + di;
        const nj = f.j + dj;
        if (!terrain.inside(ni, nj)) continue;
        if (reach[nj * w + ni] === 1) ok = true;
      }
    }
    if (ok) n++;
  }
  return n;
}

/**
 * 이 실내 칸에 **문을 낼 수 있는 방향들** (K36-B). 앞쪽이 더 좋은 자리다.
 *
 * "쓸 수 있는"의 기준은 `bakeIndoorWalls` 와 **같아야 한다** — 다르면 UI 가 놓으라고
 * 해 놓고 굽기가 무시하는 상태가 된다 (K26 ② 의 `guestWalkable` 과 같은 종류의 사고).
 * 그래서 판정을 여기 한 곳에 두고 양쪽이 부른다.
 *
 * 정렬: **포장이 닿은 쪽**이 먼저다. 길이 곧 입구라는 K32-B 의 규칙과 같은 방향이고,
 * 그다음은 게이트에서 가까운 쪽이다.
 */
export function doorCandidates(
  terrain: KairoTerrain,
  gate: { i: number; j: number },
  i: number,
  j: number,
  walkable?: (i: number, j: number) => boolean,
): Dir[] {
  if (!terrain.isIndoor(i, j)) return [];
  const canStand = walkable ?? ((x: number, y: number): boolean => terrain.isWalkable(x, y));
  const out: { dir: Dir; paved: boolean; dist: number }[] = [];
  for (let d = 0; d < 4; d++) {
    const oi = i + (DI[d] as number);
    const oj = j + (DJ[d] as number);
    if (!terrain.inside(oi, oj)) continue;
    if (terrain.isIndoor(oi, oj)) continue; // 실내끼리 맞닿은 면은 외곽선이 아니다
    if (!canStand(oi, oj) || !canStand(i, j)) continue;
    /*
     * ⚠ 여기서 `reach` 를 보지 않는다 — `bakeIndoorWalls` 의 **플레이어 문** 조건과
     * 같아야 한다. 통과용 문은 아직 안 닿는 쪽으로 나는 것이 목적이다.
     */
    out.push({
      dir: DIRS[d] as Dir,
      paved: terrain.isGuestWalkable(oi, oj),
      dist: Math.abs(oi - gate.i) + Math.abs(oj - gate.j),
    });
  }
  out.sort((a, b) => Number(b.paved) - Number(a.paved) || a.dist - b.dist);
  return out.map((x) => x.dir);
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
  /** 넘기면 **끊기는 시설이 생기는 칠을 거절**한다 (K32-B) */
  placement?: PlacementGrid,
  /** 놓아 둔 출입구 (K36-B) — 안 넘기면 다시 구울 때 자동 하나로 되돌아간다 */
  doors?: DoorSet,
): { ok: boolean; fail?: IndoorFail; changed: boolean } {
  const before = terrain.kindAt(i, j);
  if (before === null) return { ok: false, changed: false };
  if (before === kind) return { ok: true, changed: false };
  // 도시 띠는 못 칠한다 (K36) — sim 에서 막아야 봇·테스트도 같이 지킨다
  if (!terrain.isBuildable(i, j)) return { ok: false, fail: 'not-buildable', changed: false };
  const servedBefore =
    placement === undefined ? 0 : servedFacilities(terrain, walls, gate, placement, walkable);
  if (!terrain.paint(i, j, kind)) return { ok: false, changed: false };

  const r = bakeIndoorWalls(terrain, walls, gate, walkable, doors);
  const strands =
    r.ok &&
    placement !== undefined &&
    servedFacilities(terrain, walls, gate, placement, walkable) < servedBefore;
  if (!r.ok || strands) {
    terrain.paint(i, j, before);
    bakeIndoorWalls(terrain, walls, gate, walkable, doors);
    const fail: IndoorFail = strands ? 'would-strand' : (r.fail as IndoorFail);
    return { ok: false, fail, changed: false };
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
  /** 넘기면 **끊기는 시설이 생기는 칠을 거절**한다 (K32-B) */
  placement?: PlacementGrid,
  /** 놓아 둔 출입구 (K36-B) — 안 넘기면 다시 구울 때 자동 하나로 되돌아간다 */
  doors?: DoorSet,
): { ok: boolean; fail?: IndoorFail; changed: number } {
  const before: [number, number, string][] = [];
  for (let j = j0; j < j0 + bh; j++) {
    for (let i = i0; i < i0 + bw; i++) {
      // 물·도시 띠는 건너뛴다 — 그래서 4×4 라고 늘 16칸이 아니다
      if (!terrain.inside(i, j) || terrain.isWater(i, j) || !terrain.isBuildable(i, j)) continue;
      const k = terrain.kindAt(i, j);
      if (k === null || k === kind) continue;
      before.push([i, j, k]);
    }
  }
  if (before.length === 0) return { ok: true, changed: 0 };

  const servedBefore =
    placement === undefined ? 0 : servedFacilities(terrain, walls, gate, placement, walkable);
  for (const [i, j] of before) terrain.paint(i, j, kind);
  const r = bakeIndoorWalls(terrain, walls, gate, walkable, doors);
  const strands =
    r.ok &&
    placement !== undefined &&
    servedFacilities(terrain, walls, gate, placement, walkable) < servedBefore;
  if (!r.ok || strands) {
    for (const [i, j, k] of before) terrain.paint(i, j, k);
    bakeIndoorWalls(terrain, walls, gate, walkable, doors);
    const fail: IndoorFail = strands ? 'would-strand' : (r.fail as IndoorFail);
    return { ok: false, fail, changed: 0 };
  }
  return { ok: true, changed: before.length };
}

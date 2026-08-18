import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import type { Dir } from './walls.js';
import {
  WallGrid,
  EDGE_DOOR,
  DIR_I_PLUS,
  DIR_J_PLUS,
  DIR_I_MINUS,
  DIR_J_MINUS,
  reachable,
} from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { bakeIndoorWalls, doorCandidates } from './indoor.js';
import { DoorSet, canonical } from './doors.js';

/**
 * K36-B — **건물을 통과한다.**
 *
 * 지금까지 문은 덩어리마다 하나씩 자동으로 났다. 그래서 건물은 언제나 막다른 곳이었고,
 * 공원 한복판에 지으면 손님이 빙 돌아갔다. 문을 둘 이상 놓을 수 있으면 **건물 자체가
 * 통로**가 된다 — `blocksMove` 는 `EDGE_SOLID` 만 막으므로 길찾기는 손댈 것이 없다.
 */

const W = 24;
const H = 24;
const GATE = { i: 8, j: 0 };

/**
 * **세로 통로 한 줄**(i=8..13) 위에 방이 통로를 가로막고 있다 (j=8..10).
 *
 * ⚠ 처음엔 판 전체를 포장하고 그 한가운데 방을 뒀는데, 판이 뚫려 있으니 **돌아가도 거리가
 * 같았다** (21 vs 21) — 검사가 아무것도 안 봤다. 통로가 아니면 "통과"에 뜻이 없다.
 *
 * 통로 밖은 잔디다 — K32-B 부터 손님은 포장한 바닥만 지나간다.
 */
function world(): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) t.paint(i, j, 'lawn');
  for (let j = 0; j < H; j++) for (let i = 8; i < 14; i++) t.paint(i, j, 'path_stone');
  for (let j = 8; j < 11; j++) for (let i = 8; i < 14; i++) t.paint(i, j, 'floor_indoor');
  return { t, w: new WallGrid(W, H), p: new PlacementGrid(W, H) };
}

/** 게이트에서 (i,j) 까지 몇 걸음인가 — 못 가면 −1 */
function steps(t: KairoTerrain, w: WallGrid, p: PlacementGrid, i: number, j: number): number {
  const stand = guestWalkable(t, p);
  const dist = new Int32Array(W * H).fill(-1);
  dist[GATE.j * W + GATE.i] = 0;
  const q = [GATE.j * W + GATE.i];
  for (let h = 0; h < q.length; h++) {
    const k = q[h] as number;
    const ci = k % W;
    const cj = (k - ci) / W;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!t.inside(ni, nj) || !stand(ni, nj)) continue;
      if (w.blocksMove(ci, cj, ni, nj)) continue;
      const nk = nj * W + ni;
      if (dist[nk] !== -1) continue;
      dist[nk] = (dist[k] as number) + 1;
      q.push(nk);
    }
  }
  return dist[j * W + i] as number;
}

describe('정규형 — 한 경계를 두 형태로 담으면 반드시 어긋난다 (K25)', () => {
  it('−I 는 이웃의 +I 와 같은 경계다', () => {
    expect(canonical(5, 5, DIR_I_MINUS)).toEqual({ i: 4, j: 5, dir: DIR_I_PLUS });
    expect(canonical(5, 5, DIR_J_MINUS)).toEqual({ i: 5, j: 4, dir: DIR_J_PLUS });
  });

  it('어느 형태로 넣어도 같은 문이다 — 넣고 반대 형태로 지우면 지워진다', () => {
    const d = new DoorSet();
    d.add(5, 5, DIR_I_PLUS);
    expect(d.count).toBe(1);
    expect(d.has(6, 5, DIR_I_MINUS)).toBe(true);
    expect(d.remove(6, 5, DIR_I_MINUS)).toBe(true);
    expect(d.count).toBe(0);
  });

  it('스냅샷을 오가도 같다 — 정규형이 아닌 값은 버린다', () => {
    const d = new DoorSet();
    d.add(3, 4, DIR_J_MINUS);
    const back = DoorSet.fromSnapshot(d.toSnapshot());
    expect(back.has(3, 4, DIR_J_MINUS)).toBe(true);
    expect(DoorSet.fromSnapshot({ keys: ['1,1,2'] }).count).toBe(0);
  });
});

describe('★ 문을 두 개 놓으면 건물이 통로가 된다', () => {
  /** 방 아래쪽 바로 밖 — 위에서 오려면 방을 지나거나 옆으로 돌아야 한다 */
  const BELOW = { i: 10, j: 11 };

  it('⚠ 음성 대조군 — 문이 하나(자동)면 건물 너머로 **못 간다**', () => {
    const { t, w, p } = world();
    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    expect(r.ok).toBe(true);
    expect(r.doors).toBe(1);
    // 방 안까지는 간다 (문 하나로 들어간다) — 하지만 건너편으로는 못 나온다
    expect(steps(t, w, p, 10, 9)).toBeGreaterThan(0);
    expect(steps(t, w, p, BELOW.i, BELOW.j)).toBe(-1);
  });

  it('위아래로 문을 내면 **지나갈 수 있다** — 건물이 통로가 된다', () => {
    const { t, w, p } = world();
    const doors = new DoorSet();
    doors.add(10, 8, DIR_J_MINUS); // 방 위쪽 면
    doors.add(10, 10, DIR_J_PLUS); // 방 아래쪽 면
    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors);
    expect(r.ok).toBe(true);
    expect(r.doors).toBe(2);

    const through = steps(t, w, p, BELOW.i, BELOW.j);
    // 곧장 내려온다 — 통로를 그대로 지난다 (게이트에서 맨해튼 거리)
    expect(through).toBe(Math.abs(BELOW.i - GATE.i) + Math.abs(BELOW.j - GATE.j));
  });

  it('자동 문은 **보험으로 남는다** — 희망이 없는 방은 여전히 하나가 난다', () => {
    const { t, w, p } = world();
    /*
     * 다른 방을 하나 더 만든다. 희망은 첫 방에만 놓는다.
     * ⚠ 첫 방이 통로를 막고 있으므로 두 번째 방을 그 **위쪽**에 둔다 — 아래에 두면
     * 게이트에서 안 닿아 자동 문도 못 난다 (그건 자동의 문제가 아니라 배치의 문제다).
     */
    for (let j = 3; j < 6; j++) for (let i = 9; i < 13; i++) t.paint(i, j, 'floor_indoor');
    const doors = new DoorSet();
    doors.add(10, 8, DIR_J_MINUS);
    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors);
    expect(r.ok).toBe(true);
    expect(r.areas).toBe(2);
    // 희망 1 + 자동 1
    expect(r.doors).toBe(2);
  });
});

describe('희망은 상태가 아니다 — 지형이 정본이다 (K27)', () => {
  it('바닥을 지워 외곽선이 아니게 되면 조용히 무시되고, 다시 깔면 되살아난다', () => {
    const { t, w, p } = world();
    const doors = new DoorSet();
    doors.add(10, 8, DIR_J_MINUS);
    doors.add(10, 10, DIR_J_PLUS);
    expect(bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors).doors).toBe(2);

    // 방을 통째로 지운다 — 문 희망은 그대로 두는데
    for (let j = 8; j < 11; j++) for (let i = 8; i < 14; i++) t.paint(i, j, 'path_stone');
    const gone = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors);
    expect(gone.ok).toBe(true);
    expect(gone.areas).toBe(0);
    expect(w.count(EDGE_DOOR)).toBe(0);
    expect(doors.count).toBe(2); // 희망은 남아 있다

    // 다시 깔면 되살아난다
    for (let j = 8; j < 11; j++) for (let i = 8; i < 14; i++) t.paint(i, j, 'floor_indoor');
    expect(bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors).doors).toBe(2);
  });

  it('쓸 수 없는 희망은 무시된다 — 실내끼리 맞닿은 면에는 문이 안 난다', () => {
    const { t, w, p } = world();
    const doors = new DoorSet();
    doors.add(10, 9, DIR_I_PLUS); // 방 **안쪽** 경계 — 외곽선이 아니다
    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors);
    expect(r.ok).toBe(true);
    expect(r.doors).toBe(1); // 자동으로 하나만
    expect(w.edgeAt(10, 9, DIR_I_PLUS)).not.toBe(EDGE_DOOR);
  });
});

describe('doorCandidates — UI 와 굽기가 같은 판정을 쓴다', () => {
  it('실내 칸의 바깥 면들을 돌려주고, 포장된 쪽이 먼저다', () => {
    const { t, w, p } = world();
    bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    /*
     * 방 왼쪽 위 모서리. **왼쪽은 후보가 아니다** — 통로 밖은 잔디고 손님이 못 선다
     * (K32-B). 위쪽 포장만 후보다.
     */
    const c = doorCandidates(t, GATE, 8, 8, guestWalkable(t, p));
    expect(c).toContain(DIR_J_MINUS);
    expect(c).not.toContain(DIR_I_MINUS);
    // 방 한가운데는 위·아래만 바깥이다
    const mid = doorCandidates(t, GATE, 10, 9, guestWalkable(t, p));
    expect(mid).not.toContain(DIR_I_PLUS);
  });

  it('실내가 아닌 칸은 후보가 없다 — 문은 건물에만 난다', () => {
    const { t, p } = world();
    expect(doorCandidates(t, GATE, 2, 2, guestWalkable(t, p))).toEqual([]);
  });

  it('★ 후보로 나온 방향은 실제로 문이 된다 — 판정이 갈리면 UI 가 거짓말이 된다', () => {
    const { t, w, p } = world();
    const stand = guestWalkable(t, p);
    /*
     * ⚠ 후보 하나만 놓고 구우면 실패할 수 있다 — 그 문이 아직 안 닿는 쪽으로 나면
     * 방 전체가 닿지 않게 되기 때문이다. 그건 후보가 틀린 게 아니라 **문이 하나뿐**이라
     * 그렇다. 그래서 게이트 쪽 문 하나를 같이 놓고 본다 (실제 플레이도 그렇다).
     */
    const anchor = doorCandidates(t, GATE, 10, 8, stand)[0];
    expect(anchor).toBeDefined();
    for (const dir of doorCandidates(t, GATE, 11, 10, stand)) {
      const doors = new DoorSet();
      doors.add(10, 8, anchor as Dir);
      doors.add(11, 10, dir);
      const r = bakeIndoorWalls(t, w, GATE, stand, doors);
      expect(r.ok, `dir=${dir}`).toBe(true);
      expect(w.edgeAt(11, 10, dir), `dir=${dir}`).toBe(EDGE_DOOR);
    }
  });
});

describe('길찾기는 손댈 것이 없다 — 문은 원래 통과 가능하다', () => {
  it('문 경계는 이동을 막지 않는다', () => {
    const { t, w, p } = world();
    const doors = new DoorSet();
    // 위쪽 문이 있어야 방이 게이트에서 닿는다 — 아래 문 하나만으로는 굽기가 실패한다
    doors.add(10, 8, DIR_J_MINUS);
    doors.add(10, 10, DIR_J_PLUS);
    bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors);
    expect(w.blocksMove(10, 10, 10, 11)).toBe(false);
    // 옆의 순수 벽은 막는다
    expect(w.blocksMove(9, 10, 9, 11)).toBe(true);
  });

  it('두 문 사이가 실제로 이어진다 — 도달 검사로', () => {
    const { t, w, p } = world();
    const doors = new DoorSet();
    doors.add(10, 8, DIR_J_MINUS);
    doors.add(10, 10, DIR_J_PLUS);
    bakeIndoorWalls(t, w, GATE, guestWalkable(t, p), doors);
    const seen = reachable(t, w, GATE, guestWalkable(t, p));
    expect(seen[10 * W + 10]).toBe(1); // 방 안
    expect(seen[11 * W + 10]).toBe(1); // 방 아래 바깥
  });
});

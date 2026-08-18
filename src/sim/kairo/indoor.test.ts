import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
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
} from './walls.js';
import {
  bakeIndoorWalls,
  paintFloor,
  indoorAreas,
  indoorAreaCount,
  INDOOR_FAIL_MESSAGES,
  type IndoorFail,
} from './indoor.js';
import { PlacementGrid, guestWalkable } from './placement.js';

/**
 * 실내 — **바닥을 깔면 그게 방이다** (K27, 카이로 방식).
 *
 * 지켜야 할 성질:
 *   · 외곽선만 벽이다 — 실내끼리 맞닿은 면은 벽이 아니다
 *   · 이어진 한 덩어리에는 문이 **하나**다 (붙여 깔면 자동으로 하나가 된다)
 *   · 떨어진 덩어리는 각자 문을 갖는다
 *   · 실패하면 벽을 통째로 지운다 — 반쯤 적용된 벽이 남지 않는다
 */

const GATE = { i: 0, j: 0 };

function flat(w = 14, h = 14): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'path_stone');
  return t;
}

/** 실내 바닥을 사각형만큼 깐다 — 플레이어가 붓으로 칠하는 것과 같다 */
function room(t: KairoTerrain, i0: number, j0: number, w: number, h: number): void {
  for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) t.paint(i, j, 'floor_indoor');
}

function setup(w = 14, h = 14): { t: KairoTerrain; w: WallGrid } {
  return { t: flat(w, h), w: new WallGrid(w, h) };
}

describe('바닥이 곧 방이다', () => {
  it('3×3 을 깔면 외곽 12 경계만 생긴다 — 안쪽은 뚫려 있다', () => {
    const { t, w } = setup();
    room(t, 4, 4, 3, 3);
    const r = bakeIndoorWalls(t, w, GATE);
    expect(r.ok).toBe(true);
    expect(r.areas).toBe(1);
    expect(r.doors).toBe(1);
    expect(w.count(EDGE_SOLID)).toBe(11);
    expect(w.count(EDGE_DOOR)).toBe(1);
    // 실내끼리 맞닿은 면은 벽이 아니다
    expect(w.edgeAt(4, 4, DIR_I_PLUS)).toBe(EDGE_NONE);
    expect(w.edgeAt(6, 4, DIR_I_PLUS)).toBe(EDGE_SOLID);
  });

  it('실내가 전부 걸어갈 수 있다 — 문 하나로 충분하다', () => {
    const { t, w } = setup();
    room(t, 4, 4, 4, 3);
    bakeIndoorWalls(t, w, GATE);
    const seen = reachable(t, w, GATE);
    for (let j = 4; j < 7; j++) for (let i = 4; i < 8; i++) expect(seen[j * 14 + i]).toBe(1);
  });

  it('바닥을 지우면 벽도 사라진다', () => {
    const { t, w } = setup();
    room(t, 4, 4, 3, 3);
    bakeIndoorWalls(t, w, GATE);
    room(t, 4, 4, 3, 3); // 같은 자리를…
    for (let j = 4; j < 7; j++) for (let i = 4; i < 7; i++) t.paint(i, j, 'path_stone');
    const r = bakeIndoorWalls(t, w, GATE);
    expect(r.areas).toBe(0);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(0);
  });
});

describe('넓히기 — 옆에 한 칸 더 깔면 끝이다', () => {
  it('붙여 깔면 **한 덩어리 · 문 하나**가 된다 — 사각형 모델의 "문이 둘"이 사라졌다', () => {
    const { t, w } = setup();
    room(t, 3, 3, 3, 3);
    room(t, 6, 3, 3, 3); // 바로 오른쪽에 붙임
    const r = bakeIndoorWalls(t, w, GATE);
    expect(r.areas).toBe(1);
    expect(r.doors).toBe(1); // ← 사각형 건물이었을 때는 2 였다
    // 맞닿은 면에는 벽이 없다
    for (let j = 3; j < 6; j++) expect(w.edgeAt(5, j, DIR_I_PLUS)).toBe(EDGE_NONE);
    // 합쳐진 6×3 덩어리의 외곽선만: (6+3)*2 = 18
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(18);
  });

  it('떨어져 있으면 각자 문을 갖는다', () => {
    const { t, w } = setup();
    room(t, 2, 2, 2, 2);
    room(t, 9, 9, 2, 2);
    const r = bakeIndoorWalls(t, w, GATE);
    expect(r.areas).toBe(2);
    expect(r.doors).toBe(2);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(16);
  });

  it('한 칸만 더 깔아도 넓어진다 — 절차가 없다', () => {
    const { t, w } = setup();
    room(t, 4, 4, 3, 3);
    bakeIndoorWalls(t, w, GATE);
    const before = w.count(EDGE_SOLID) + w.count(EDGE_DOOR);
    expect(paintFloor(t, w, GATE, 7, 4, 'floor_indoor').ok).toBe(true);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(before + 2); // 둘레가 2 늘었다
    expect(indoorAreaCount(indoorAreas(t))).toBe(1);
  });
});

describe('거절과 되돌리기', () => {
  it('실내가 바깥과 안 닿으면 문을 못 낸다 — 벽을 통째로 지운다', () => {
    const { t, w } = setup();
    // 게이트를 물로 가둬 아무 데도 못 가게 한다
    for (let i = 0; i < 14; i++) t.paint(i, 1, 'water_edge');
    room(t, 4, 4, 3, 3);
    const r = bakeIndoorWalls(t, w, GATE);
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('no-door');
    // 반쯤 적용된 벽이 남으면 안 된다
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(0);
  });

  it('paintFloor 는 실패하면 지형까지 되돌린다', () => {
    const { t, w } = setup();
    for (let i = 0; i < 14; i++) t.paint(i, 1, 'water_edge');
    const r = paintFloor(t, w, GATE, 5, 5, 'floor_indoor');
    expect(r.ok).toBe(false);
    expect(t.kindAt(5, 5)).toBe('path_stone'); // 되돌아갔다
  });

  it('같은 바닥을 다시 칠하면 아무 일도 안 한다 — 값을 두 번 받지 않게', () => {
    const { t, w } = setup();
    expect(paintFloor(t, w, GATE, 5, 5, 'path_stone')).toEqual({ ok: true, changed: false });
  });

  it('모든 실패 이유에 사람이 읽을 메시지가 있다', () => {
    for (const f of ['no-door', 'unreachable'] as IndoorFail[]) {
      expect(INDOOR_FAIL_MESSAGES[f].length).toBeGreaterThan(0);
    }
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────
 * K26 검토에서 잡은 세 가지. 모델이 바뀌어도 **성질은 그대로 지켜야 한다.**
 * ─────────────────────────────────────────────────────────────────────────
 */

describe('① 실내 시설은 실내 바닥 위에만', () => {
  it('방 바깥에서 벽에 접한 칸은 거절된다 — 경계는 두 칸이 공유한다', () => {
    const { t, w } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    room(t, 6, 6, 4, 4);
    bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));

    /*
     * 맨 아랫줄에 놓는다. 가운데 줄을 가로지르면 방이 갈려 `would-strand` 로 거절된다
     * (K30) — 4칸 방을 4칸 시설이 가로막으면 위아래가 끊긴다.
     */
    expect(p.check(t, w, GATE, 'shower_row', 6, 9).ok).toBe(true); // 방 안 (6..9)
    expect(w.hasAnyEdge(10, 7)).toBe(true); // 바깥칸도 벽에 접해 있다
    expect(t.isIndoor(10, 7)).toBe(false);
    expect(p.check(t, w, GATE, 'shower_row', 10, 7).fail).toBe('needs-indoor');
  });

  it('발자국이 한 칸이라도 밖으로 나가면 거절 — 반만 실내인 시설은 없다', () => {
    const { t, w } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    room(t, 6, 6, 4, 4);
    bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    expect(p.check(t, w, GATE, 'shower_row', 7, 7).fail).toBe('needs-indoor');
  });
});

describe('② 문은 손님이 실제로 설 수 있는 칸에만', () => {
  it('게이트 쪽이 시설로 막혀 있으면 열린 면으로 문이 간다', () => {
    const { t, w } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    for (let i = 5; i <= 9; i++) p.place(t, w, GATE, 'vending_out', i, 5);
    for (let j = 6; j <= 9; j++) p.place(t, w, GATE, 'vending_out', 5, j);

    room(t, 6, 6, 4, 4);
    expect(bakeIndoorWalls(t, w, GATE, guestWalkable(t, p)).ok).toBe(true);

    let door: { i: number; j: number; dir: number } | null = null;
    for (let j = 6; j < 10; j++)
      for (let i = 6; i < 10; i++)
        for (const d of [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS] as const)
          if (w.edgeAt(i, j, d) === EDGE_DOOR) door = { i, j, dir: d };
    expect(door).not.toBeNull();
    const oi =
      door!.dir === DIR_I_PLUS ? door!.i + 1 : door!.dir === DIR_I_MINUS ? door!.i - 1 : door!.i;
    const oj =
      door!.dir === DIR_J_PLUS ? door!.j + 1 : door!.dir === DIR_J_MINUS ? door!.j - 1 : door!.j;
    expect(p.blocksWalk(oi, oj)).toBe(false);
    expect(reachable(t, w, GATE, guestWalkable(t, p))[7 * 20 + 7]).toBe(1);
  });

  it('지형만 보는 도달 검사와 손님 판정이 실제로 갈린다 — 검사가 유의미한가', () => {
    const t = flat(20, 20);
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    for (let i = 0; i < 20; i++) p.place(t, w, GATE, 'vending_out', i, 4);
    expect(reachable(t, w, GATE)[10 * 20 + 10]).toBe(1);
    expect(reachable(t, w, GATE, guestWalkable(t, p))[10 * 20 + 10]).toBe(0);
  });

  it('시설이 든 방도 넓힐 수 있다 — 시설 칸은 막힌 게 아니라 쓰이는 중이다', () => {
    const { t, w } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    /*
     * 방을 3줄로 잡는다. **문이 난 줄은 비워 둬야 한다** — K30 에서 "문 앞은 비운다"가
     * 규칙이 됐다 (문 앞칸을 시설이 덮으면 방이 조용히 죽는다).
     */
    room(t, 4, 4, 5, 3);
    expect(bakeIndoorWalls(t, w, GATE, guestWalkable(t, p)).ok).toBe(true);
    expect(p.place(t, w, GATE, 'shower_row', 4, 5).ok).toBe(true);
    expect(p.place(t, w, GATE, 'locker_row', 4, 6).ok).toBe(true);

    room(t, 4, 7, 5, 3); // 아래로 이어 깐다
    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    expect(r.ok, r.fail).toBe(true);
    expect(r.areas).toBe(1);
  });

  it('문 앞을 시설로 막을 수 없다 — 막으면 방이 조용히 죽는다 (K30)', () => {
    const { t, w } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    room(t, 5, 5, 4, 3);
    expect(bakeIndoorWalls(t, w, GATE, guestWalkable(t, p)).ok).toBe(true);

    // 문이 난 경계를 찾아 그 양쪽 칸에 시설을 놓아 본다
    let inside: { i: number; j: number } | null = null;
    for (let j = 5; j < 8 && !inside; j++) {
      for (let i = 5; i < 9; i++) {
        for (const d of [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS] as const) {
          if (w.edgeAt(i, j, d) === EDGE_DOOR) {
            inside = { i, j };
            break;
          }
        }
        if (inside) break;
      }
    }
    expect(inside).not.toBeNull();
    expect(p.check(t, w, GATE, 'vending_in', inside!.i, inside!.j).fail).toBe('blocks-door');
  });
});

describe('③ 격자 가장자리에도 벽이 선다', () => {
  it('가장자리 3×3 의 외곽선이 12 다 — 뚫린 면이 없다', () => {
    const { t, w } = setup(20, 20);
    room(t, 0, 3, 3, 3);
    expect(bakeIndoorWalls(t, w, GATE).ok).toBe(true);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(12);
    expect(w.edgeAt(0, 3, DIR_I_MINUS)).toBe(EDGE_SOLID);
  });

  it('네 모서리 전부 — 게이트가 (0,0) 이라 초반 방이 가장자리에 몰린다', () => {
    for (const [i0, j0] of [
      [17, 0],
      [0, 17],
      [17, 17],
    ] as const) {
      const { t, w } = setup(20, 20);
      room(t, i0, j0, 3, 3);
      expect(bakeIndoorWalls(t, w, GATE).ok).toBe(true);
      expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(12);
    }
  });
});

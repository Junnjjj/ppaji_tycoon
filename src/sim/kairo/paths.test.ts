import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { WallGrid, EDGE_DOOR, reachable } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { bakeIndoorWalls, paintFloor, paintFloorBlock } from './indoor.js';

/**
 * K32-B — **포장한 바닥만 걷는다. 그래서 길이 곧 입구다.**
 *
 * 그전까지 잔디도 걸을 수 있었다. 그러면 길을 깔 이유가 없고, 문은 아무 데나 났다.
 * 손님이 포장된 칸으로만 다니면 **문도 포장된 칸으로만 날 수 있다** — 플레이어가 길을
 * 어디로 내느냐가 곧 입구의 위치와 방향을 정한다. 새 저장 상태 없이 동사 하나가 둘을 한다.
 */

const W = 20;
const H = 20;
const GATE = { i: 0, j: 0 };

/** 전부 잔디 — 육지지만 손님은 못 지나간다 */
function lawnWorld(): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) t.paint(i, j, 'lawn');
  return { t, w: new WallGrid(W, H), p: new PlacementGrid(W, H) };
}

describe('★ 잔디로는 못 가고, 포장하면 간다', () => {
  it('게이트에서 잔디만 건너 있는 칸에는 손님이 못 간다', () => {
    const { t, w, p } = lawnWorld();
    const seen = reachable(t, w, GATE, guestWalkable(t, p));
    expect(seen[10 * W + 10]).toBe(0);
  });

  it('⚠ 음성 대조군 — 잔디는 "육지"이고 지형만 보면 닿는다 (막은 것이 손님 판정인가)', () => {
    /*
     * 이걸 안 넣으면 위 검사가 "원래 못 가던 곳"을 본 것과 구분이 안 된다.
     * 같은 판에서 지형 판정으로는 닿아야 한다 — 즉 차이는 오직 `guestWalk` 다.
     */
    const { t, w } = lawnWorld();
    expect(t.isWalkable(10, 10)).toBe(true);
    expect(t.isGuestWalkable(10, 10)).toBe(false);
    expect(reachable(t, w, GATE)[10 * W + 10]).toBe(1);
  });

  it('석재로 이어 깔면 그 칸까지 간다 — 길을 내는 것이 곧 동선 설계다', () => {
    const { t, w, p } = lawnWorld();
    for (let i = 0; i <= 10; i++) t.paint(i, 0, 'path_stone');
    for (let j = 0; j <= 10; j++) t.paint(10, j, 'path_stone');
    const seen = reachable(t, w, GATE, guestWalkable(t, p));
    expect(seen[10 * W + 10]).toBe(1);
    // 길 옆 잔디는 여전히 못 간다 — "깐 만큼만" 이어야 한다
    expect(seen[10 * W + 11]).toBe(0);
  });
});

describe('★ 문은 포장이 닿은 쪽에 난다 — 입구 방향을 플레이어가 정한다', () => {
  /** 잔디 한가운데 방 하나 (4×3), 게이트까지 길은 없다 */
  function room(): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
    const world = lawnWorld();
    for (let j = 8; j < 11; j++) for (let i = 8; i < 12; i++) world.t.paint(i, j, 'floor_indoor');
    return world;
  }

  it('둘레가 전부 잔디면 문을 못 낸다', () => {
    const { t, w, p } = room();
    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('no-door');
    // 반쯤 적용된 벽이 남으면 안 된다
    expect(w.count(EDGE_DOOR)).toBe(0);
  });

  it('한쪽에 길을 붙이면 **그쪽으로** 문이 난다', () => {
    const { t, w, p } = room();
    // 게이트에서 방의 **아래쪽**으로 돌아 들어오는 길
    for (let j = 0; j <= 12; j++) t.paint(0, j, 'path_stone');
    for (let i = 0; i <= 9; i++) t.paint(i, 12, 'path_stone');
    t.paint(9, 11, 'path_stone'); // 방 아래 면에 붙는 마지막 한 칸

    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    expect(r.ok).toBe(true);
    expect(r.doors).toBe(1);

    // 문은 길을 붙인 그 면에 난다
    let doorAt: { i: number; j: number } | null = null;
    for (let j = 8; j < 11; j++) {
      for (let i = 8; i < 12; i++) {
        for (const d of [0, 1, 2, 3] as const) {
          if (w.edgeAt(i, j, d) === EDGE_DOOR) doorAt = { i, j };
        }
      }
    }
    expect(doorAt).toEqual({ i: 9, j: 10 });
  });

  it('길을 반대쪽에 붙이면 문도 반대쪽에 난다 — 위치가 길을 따라온다', () => {
    const { t, w, p } = room();
    // 이번엔 방의 **왼쪽** 면으로 들어오는 길
    for (let j = 0; j <= 9; j++) t.paint(0, j, 'path_stone');
    for (let i = 0; i <= 7; i++) t.paint(i, 9, 'path_stone');

    const r = bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));
    expect(r.ok).toBe(true);
    let doorAt: { i: number; j: number } | null = null;
    for (let j = 8; j < 11; j++) {
      for (let i = 8; i < 12; i++) {
        for (const d of [0, 1, 2, 3] as const) {
          if (w.edgeAt(i, j, d) === EDGE_DOOR) doorAt = { i, j };
        }
      }
    }
    expect(doorAt).toEqual({ i: 8, j: 9 });
  });
});

describe('★ 배치 검사도 손님 판정으로 잰다 — "검사는 통과하는데 손님은 못 온다"를 막는다', () => {
  it('잔디 한복판은 거절된다', () => {
    const { t, w, p } = lawnWorld();
    const r = p.check(t, w, GATE, 'shop', 10, 10);
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('unreachable');
  });

  it('길을 이어 깔면 같은 자리가 통과한다', () => {
    const { t, w, p } = lawnWorld();
    for (let i = 0; i <= 10; i++) t.paint(i, 0, 'path_stone');
    for (let j = 0; j <= 10; j++) t.paint(9, j, 'path_stone');
    expect(p.check(t, w, GATE, 'shop', 10, 10).ok).toBe(true);
  });
});

describe('★ 길을 지우면 거절된다 — 되돌릴 수 있는 실수는 막는다', () => {
  /** 게이트 → (10,0) 한 줄 길 끝에 매점 하나 */
  function corridor(): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
    const { t, w, p } = lawnWorld();
    for (let i = 0; i <= 10; i++) t.paint(i, 0, 'path_stone');
    expect(p.place(t, w, GATE, 'shop', 10, 1).ok).toBe(true);
    return { t, w, p };
  }

  it('유일한 길 한 칸을 잔디로 되돌리면 막힌다', () => {
    const { t, w, p } = corridor();
    const r = paintFloor(t, w, GATE, 5, 0, 'lawn', guestWalkable(t, p), p);
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('would-strand');
    expect(t.kindAt(5, 0)).toBe('path_stone'); // 지형까지 되돌아갔다
  });

  it('⚠ 음성 대조군 — placement 를 안 넘기면 그대로 지워진다 (막은 것이 이 검사인가)', () => {
    const { t, w, p } = corridor();
    expect(paintFloor(t, w, GATE, 5, 0, 'lawn', guestWalkable(t, p)).ok).toBe(true);
    expect(t.kindAt(5, 0)).toBe('lawn');
  });

  it('시설이 안 끊기는 칸은 그대로 지워진다 — 전부 막으면 되돌리기가 사라진다', () => {
    const { t, w, p } = corridor();
    t.paint(5, 1, 'path_stone'); // 길 옆 곁가지 — 지워도 아무도 안 끊긴다
    const r = paintFloor(t, w, GATE, 5, 1, 'lawn', guestWalkable(t, p), p);
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(true);
  });

  it('블록 붓도 같은 규칙을 쓴다 — 한 칸씩만 막으면 4×4 로 우회된다', () => {
    const { t, w, p } = corridor();
    const r = paintFloorBlock(t, w, GATE, 4, 0, 4, 4, 'lawn', guestWalkable(t, p), p);
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('would-strand');
    expect(t.kindAt(4, 0)).toBe('path_stone');
  });
});

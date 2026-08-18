import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain, groundIndex } from './terrain.js';
import {
  WallGrid,
  EDGE_NONE,
  EDGE_SOLID,
  EDGE_DOOR,
  DIR_I_PLUS,
  DIR_J_PLUS,
  DIR_I_MINUS,
  DIR_J_MINUS,
  BIT_I_PLUS,
  BIT_J_PLUS,
  BIT_I_MINUS,
  BIT_J_MINUS,
  reachable,
  passableCount,
  canPlaceEdge,
  placeEdge,
  removeEdge,
  PLACE_MESSAGES,
  type PlaceReason,
} from './walls.js';

/**
 * 벽 — **타일 경계에 선다** (K25). 스펙 §3.
 *
 * 예전에는 벽이 타일을 점유했다. 지키려는 성질이 통째로 바뀌었다:
 *   · 벽은 **칸을 막지 않는다** — 이동을 막는다
 *   · 경계는 **한쪽이 소유한다** — (i,j)와 (i−1,j) 사이는 (i−1,j) 의 +I 경계
 *   · 밀폐 차단은 그대로 — 손님이 못 들어가는 공간이 생기면 안 된다
 */

const GATE = { i: 0, j: 0 };

function flat(w = 8, h = 8): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'lawn');
  return t;
}

describe('경계 소유 — 한 경계는 한 곳에만 저장된다', () => {
  it('(i,j) 의 −I 경계는 (i−1,j) 의 +I 경계와 같은 것이다', () => {
    const g = new WallGrid(8, 8);
    g.setEdge(3, 3, DIR_I_PLUS, EDGE_SOLID);
    expect(g.edgeAt(4, 3, DIR_I_MINUS)).toBe(EDGE_SOLID);
    // 반대로 써도 같은 자리
    g.setEdge(5, 3, DIR_I_MINUS, EDGE_DOOR);
    expect(g.edgeAt(4, 3, DIR_I_PLUS)).toBe(EDGE_DOOR);
  });

  it('J 축도 마찬가지다', () => {
    const g = new WallGrid(8, 8);
    g.setEdge(2, 2, DIR_J_PLUS, EDGE_SOLID);
    expect(g.edgeAt(2, 3, DIR_J_MINUS)).toBe(EDGE_SOLID);
  });

  it('between 은 이웃이 아니면 없음을 돌려준다', () => {
    const g = new WallGrid(8, 8);
    g.setEdge(2, 2, DIR_I_PLUS, EDGE_SOLID);
    expect(g.between(2, 2, 3, 2)).toBe(EDGE_SOLID);
    expect(g.between(2, 2, 4, 2)).toBe(EDGE_NONE); // 두 칸 떨어짐
    expect(g.between(2, 2, 3, 3)).toBe(EDGE_NONE); // 대각선
  });
});

describe('벽은 칸이 아니라 이동을 막는다', () => {
  it('벽이 있어도 두 칸 모두 설 수 있다 — 바닥을 안 먹는다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    g.setEdge(3, 3, DIR_I_PLUS, EDGE_SOLID);
    expect(t.isWalkable(3, 3)).toBe(true);
    expect(t.isWalkable(4, 3)).toBe(true);
    // 바닥 총량이 벽 때문에 줄지 않는다
    expect(passableCount(t, g)).toBe(64);
  });

  it('벽은 그 경계를 못 지나게 하고, 문은 지나게 한다', () => {
    const g = new WallGrid(8, 8);
    g.setEdge(3, 3, DIR_I_PLUS, EDGE_SOLID);
    expect(g.blocksMove(3, 3, 4, 3)).toBe(true);
    expect(g.blocksMove(4, 3, 3, 3)).toBe(true); // 양방향
    expect(g.blocksMove(3, 3, 3, 4)).toBe(false); // 다른 방향은 열려 있다
    g.setEdge(3, 3, DIR_I_PLUS, EDGE_DOOR);
    expect(g.blocksMove(3, 3, 4, 3)).toBe(false);
  });
});

describe('마스크 — 렌더가 어느 면을 그릴지', () => {
  it('경계가 없으면 0', () => {
    expect(new WallGrid(8, 8).mask(3, 3)).toBe(0);
  });

  it('네 방향 비트가 각각 맞다', () => {
    const g = new WallGrid(8, 8);
    g.setEdge(3, 3, DIR_I_PLUS, EDGE_SOLID);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS);
    g.setEdge(3, 3, DIR_J_PLUS, EDGE_SOLID);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS | BIT_J_PLUS);
    g.setEdge(3, 3, DIR_I_MINUS, EDGE_SOLID);
    g.setEdge(3, 3, DIR_J_MINUS, EDGE_SOLID);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS | BIT_J_PLUS | BIT_I_MINUS | BIT_J_MINUS);
  });

  it('문도 마스크에 센다 — 안 그러면 문 옆 벽선이 끊겨 보인다', () => {
    const g = new WallGrid(8, 8);
    g.setEdge(3, 3, DIR_I_PLUS, EDGE_DOOR);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS);
    expect(g.hasAnyEdge(3, 3)).toBe(true);
  });

  it('마스크가 0..15 안이다', () => {
    const g = new WallGrid(6, 6);
    const rng = new Rng(9);
    for (let k = 0; k < 60; k++) {
      g.setEdge(rng.int(6), rng.int(6), rng.int(4) as 0 | 1 | 2 | 3, EDGE_SOLID);
    }
    for (let j = 0; j < 6; j++) {
      for (let i = 0; i < 6; i++) {
        const m = g.mask(i, j);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('도달 검사', () => {
  it('벽이 없으면 전부 닿는다', () => {
    const t = flat();
    const seen = reachable(t, new WallGrid(8, 8), GATE);
    expect([...seen].filter((x) => x === 1)).toHaveLength(64);
  });

  it('물은 못 걷는다', () => {
    const t = flat();
    for (let i = 0; i < 8; i++) t.paint(i, 7, 'water_edge');
    const seen = reachable(t, new WallGrid(8, 8), GATE);
    expect([...seen].filter((x) => x === 1)).toHaveLength(56);
  });

  it('게이트가 물 위면 아무 곳도 못 닿는다', () => {
    const t = flat();
    t.paint(0, 0, 'water_edge');
    expect([...reachable(t, new WallGrid(8, 8), GATE)].filter((x) => x === 1)).toHaveLength(0);
  });

  it('경계를 둘러싸면 안이 끊긴다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    // (4,4) 를 네 경계로 완전히 감싼다
    g.setEdge(4, 4, DIR_I_PLUS, EDGE_SOLID);
    g.setEdge(4, 4, DIR_J_PLUS, EDGE_SOLID);
    g.setEdge(4, 4, DIR_I_MINUS, EDGE_SOLID);
    g.setEdge(4, 4, DIR_J_MINUS, EDGE_SOLID);
    const seen = reachable(t, g, GATE);
    expect(seen[4 * 8 + 4]).toBe(0);
    expect([...seen].filter((x) => x === 1)).toHaveLength(63);
  });

  it('대각선으로는 못 지난다 — X 교차를 비집고 새면 "닫았는데 새는" 상태가 된다', () => {
    const t = flat(4, 4);
    const g = new WallGrid(4, 4);
    // (0,0) 만 남기고 나머지에서 끊는다
    g.setEdge(0, 0, DIR_I_PLUS, EDGE_SOLID);
    g.setEdge(0, 0, DIR_J_PLUS, EDGE_SOLID);
    const seen = reachable(t, g, GATE);
    expect([...seen].filter((x) => x === 1)).toHaveLength(1);
  });
});

describe('밀폐 차단 — 손님이 못 들어가는 공간을 못 만든다', () => {
  it('한 칸을 완전히 둘러싸는 마지막 경계는 거절된다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    expect(placeEdge(t, g, GATE, 4, 4, DIR_I_PLUS).ok).toBe(true);
    expect(placeEdge(t, g, GATE, 4, 4, DIR_J_PLUS).ok).toBe(true);
    expect(placeEdge(t, g, GATE, 4, 4, DIR_I_MINUS).ok).toBe(true);
    const last = placeEdge(t, g, GATE, 4, 4, DIR_J_MINUS);
    expect(last.ok).toBe(false);
    expect(last.reason).toBe('would-seal');
    expect(last.sealed).toBe(1);
  });

  it('문으로 열어 두면 같은 자리에 놓을 수 있다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    g.setEdge(4, 4, DIR_I_PLUS, EDGE_SOLID);
    g.setEdge(4, 4, DIR_J_PLUS, EDGE_SOLID);
    g.setEdge(4, 4, DIR_I_MINUS, EDGE_SOLID);
    expect(placeEdge(t, g, GATE, 4, 4, DIR_J_MINUS, EDGE_DOOR).ok).toBe(true);
    expect(reachable(t, g, GATE)[4 * 8 + 4]).toBe(1);
  });

  it('여러 칸이 갇히면 개수를 알려준다 — UI 가 "N칸이 갇힙니다" 로 보여준다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    // 오른쪽 아래 2×2 를 잘라내기 직전까지 두른다
    for (let j = 6; j < 8; j++) g.setEdge(5, j, DIR_I_PLUS, EDGE_SOLID);
    g.setEdge(6, 6, DIR_J_MINUS, EDGE_SOLID);
    const last = canPlaceEdge(t, g, GATE, 7, 6, DIR_J_MINUS);
    expect(last.ok).toBe(false);
    expect(last.sealed).toBe(4);
  });

  it('격자 밖 경계는 거절 — 어차피 못 지나간다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    expect(placeEdge(t, g, GATE, 7, 3, DIR_I_PLUS).reason).toBe('outside');
    expect(placeEdge(t, g, GATE, 9, 3, DIR_I_PLUS).reason).toBe('outside');
  });

  it('이미 있는 경계는 거절', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    expect(placeEdge(t, g, GATE, 3, 3, DIR_I_PLUS).ok).toBe(true);
    expect(placeEdge(t, g, GATE, 3, 3, DIR_I_PLUS).reason).toBe('occupied');
  });

  it('지우는 건 항상 된다 — 도달성을 늘리기만 한다', () => {
    const t = flat();
    const g = new WallGrid(8, 8);
    placeEdge(t, g, GATE, 3, 3, DIR_I_PLUS);
    expect(removeEdge(g, 3, 3, DIR_I_PLUS)).toBe(true);
    expect(removeEdge(g, 3, 3, DIR_I_PLUS)).toBe(false);
    expect(g.edgeAt(3, 3, DIR_I_PLUS)).toBe(EDGE_NONE);
  });

  it('모든 실패 이유에 사람이 읽을 메시지가 있다', () => {
    const reasons: PlaceReason[] = [
      'ok',
      'outside',
      'not-walkable',
      'occupied',
      'would-seal',
      'no-door',
    ];
    for (const r of reasons) expect(typeof PLACE_MESSAGES[r]).toBe('string');
    for (const r of reasons.filter((x) => x !== 'ok')) {
      expect(PLACE_MESSAGES[r].length).toBeGreaterThan(0);
    }
  });
});

describe('스냅샷', () => {
  it('두 축의 경계가 모두 왕복한다', () => {
    const g = new WallGrid(6, 6);
    g.setEdge(1, 1, DIR_I_PLUS, EDGE_SOLID);
    g.setEdge(2, 2, DIR_J_PLUS, EDGE_DOOR);
    const back = WallGrid.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(back.edgeAt(1, 1, DIR_I_PLUS)).toBe(EDGE_SOLID);
    expect(back.edgeAt(2, 2, DIR_J_PLUS)).toBe(EDGE_DOOR);
    expect(back.count(EDGE_SOLID)).toBe(1);
    expect(back.count(EDGE_DOOR)).toBe(1);
  });

  it('전부 지우기', () => {
    const g = new WallGrid(6, 6);
    g.setEdge(1, 1, DIR_I_PLUS, EDGE_SOLID);
    g.clear();
    expect(g.count(EDGE_SOLID)).toBe(0);
  });
});

describe('지형 계약', () => {
  it('지면 인덱스는 여전히 유효하다 — 지형 계약이 깨지면 벽도 못 놓는다', () => {
    expect(groundIndex('lawn')).toBeGreaterThanOrEqual(0);
    expect(groundIndex('water_edge')).toBeGreaterThanOrEqual(0);
  });
});

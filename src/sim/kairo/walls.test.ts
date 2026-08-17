import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain, groundIndex } from './terrain.js';
import {
  WallGrid,
  WALL_NONE,
  WALL_SOLID,
  WALL_DOOR,
  BIT_I_PLUS,
  BIT_J_PLUS,
  BIT_I_MINUS,
  BIT_J_MINUS,
  reachable,
  passableCount,
  canPlaceWall,
  placeWall,
  removeWall,
  PLACE_MESSAGES,
} from './walls.js';

/** 전부 걸을 수 있는 평지 — 벽 규칙만 보게 지형 변수를 없앤다 */
function flat(w: number, h: number): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'lawn');
  return t;
}

const GATE = { i: 0, j: 0 };

describe('비트마스크', () => {
  it('이웃 없으면 0 (독립 기둥)', () => {
    const g = new WallGrid(8, 8);
    g.setRaw(3, 3, WALL_SOLID);
    expect(g.mask(3, 3)).toBe(0);
  });

  it('네 방향 비트가 각각 맞다', () => {
    const g = new WallGrid(8, 8);
    g.setRaw(3, 3, WALL_SOLID);
    g.setRaw(4, 3, WALL_SOLID);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS);
    g.setRaw(3, 4, WALL_SOLID);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS | BIT_J_PLUS);
    g.setRaw(2, 3, WALL_SOLID);
    g.setRaw(3, 2, WALL_SOLID);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS | BIT_J_PLUS | BIT_I_MINUS | BIT_J_MINUS);
  });

  it('문도 이웃으로 센다 — 안 그러면 문 옆 벽선이 끊겨 보인다', () => {
    const g = new WallGrid(8, 8);
    g.setRaw(3, 3, WALL_SOLID);
    g.setRaw(4, 3, WALL_DOOR);
    expect(g.mask(3, 3)).toBe(BIT_I_PLUS);
  });

  it('마스크가 0..15 안이다 — 스프라이트 16장과 대응', () => {
    const g = new WallGrid(6, 6);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) g.setRaw(i, j, WALL_SOLID);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const m = g.mask(i, j);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(15);
      }
    }
  });

  it('문 런 방향 — I 축으로 이어지면 x, 아니면 z', () => {
    const g = new WallGrid(8, 8);
    g.setRaw(3, 3, WALL_DOOR);
    g.setRaw(2, 3, WALL_SOLID);
    g.setRaw(4, 3, WALL_SOLID);
    expect(g.doorRun(3, 3)).toBe('x');
    const h = new WallGrid(8, 8);
    h.setRaw(3, 3, WALL_DOOR);
    h.setRaw(3, 2, WALL_SOLID);
    h.setRaw(3, 4, WALL_SOLID);
    expect(h.doorRun(3, 3)).toBe('z');
  });
});

describe('통행', () => {
  it('벽은 막고 문은 통과한다', () => {
    const g = new WallGrid(8, 8);
    g.setRaw(1, 1, WALL_SOLID);
    g.setRaw(2, 2, WALL_DOOR);
    expect(g.blocks(1, 1)).toBe(true);
    expect(g.blocks(2, 2)).toBe(false);
    expect(g.has(2, 2)).toBe(true);
  });
});

describe('도달 검사 — flood fill', () => {
  it('벽이 없으면 전부 닿는다', () => {
    const t = flat(6, 6);
    const g = new WallGrid(6, 6);
    const r = reachable(t, g, GATE);
    expect(r.reduce((a, b) => a + b, 0)).toBe(36);
    expect(passableCount(t, g)).toBe(36);
  });

  it('물은 못 걷는다', () => {
    const t = flat(6, 6);
    t.paint(3, 3, 'water_edge');
    const g = new WallGrid(6, 6);
    expect(reachable(t, g, GATE)[3 * 6 + 3]).toBe(0);
  });

  it('게이트가 물 위면 아무 곳도 못 닿는다', () => {
    const t = flat(6, 6);
    t.paint(0, 0, 'water_edge');
    const r = reachable(t, new WallGrid(6, 6), GATE);
    expect(r.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('대각선으로는 못 지난다 — X 교차 벽을 비집고 새면 "닫았는데 새는" 상태가 된다', () => {
    const t = flat(5, 5);
    const g = new WallGrid(5, 5);
    // (1,0),(0,1) 을 막아 (0,0) 을 코너에 가둔다. 대각선 허용이면 (1,1) 로 새어나간다
    g.setRaw(1, 0, WALL_SOLID);
    g.setRaw(0, 1, WALL_SOLID);
    const r = reachable(t, g, GATE);
    expect(r[0]).toBe(1);
    expect(r[1 * 5 + 1]).toBe(0);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('밀폐 차단 — 이 게임에서 벽의 유일한 규칙', () => {
  it('한 칸을 완전히 둘러싸는 마지막 벽은 거절된다', () => {
    const t = flat(7, 7);
    const g = new WallGrid(7, 7);
    // (3,3) 을 둘러싸는 네 벽 중 세 개는 놓인다
    expect(placeWall(t, g, GATE, 2, 3).ok).toBe(true);
    expect(placeWall(t, g, GATE, 4, 3).ok).toBe(true);
    expect(placeWall(t, g, GATE, 3, 2).ok).toBe(true);
    // 마지막 하나가 (3,3) 을 가둔다
    const r = placeWall(t, g, GATE, 3, 4);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('would-seal');
    expect(r.sealed).toBe(1);
    expect(g.at(3, 4)).toBe(WALL_NONE); // 실패하면 놓이지 않는다
  });

  it('문으로 열어 두면 같은 자리에 놓을 수 있다', () => {
    const t = flat(7, 7);
    const g = new WallGrid(7, 7);
    g.setRaw(2, 3, WALL_SOLID);
    g.setRaw(4, 3, WALL_SOLID);
    g.setRaw(3, 2, WALL_SOLID);
    // 문은 걸을 수 있으니 가두지 않는다
    const r = placeWall(t, g, GATE, 3, 4, WALL_DOOR);
    expect(r.ok).toBe(true);
    expect(g.at(3, 4)).toBe(WALL_DOOR);
    expect(reachable(t, g, GATE)[3 * 7 + 3]).toBe(1);
  });

  it('방을 만들고 문을 남기면 안이 닿는다', () => {
    const t = flat(9, 9);
    const g = new WallGrid(9, 9);
    // 4×4 방 둘레를 세운다 (한 칸은 문으로)
    const ring: [number, number][] = [];
    for (let i = 2; i <= 6; i++) {
      ring.push([i, 2], [i, 6]);
    }
    for (let j = 3; j <= 5; j++) {
      ring.push([2, j], [6, j]);
    }
    let ok = 0;
    for (const [i, j] of ring) {
      // 마지막을 닫는 벽만 문으로
      const r = placeWall(t, g, GATE, i, j);
      if (r.ok) ok++;
      else {
        const d = placeWall(t, g, GATE, i, j, WALL_DOOR);
        expect(d.ok).toBe(true);
      }
    }
    expect(ok).toBeGreaterThan(10);
    // 방 안이 여전히 닿는다
    const r = reachable(t, g, GATE);
    for (let i = 3; i <= 5; i++) {
      for (let j = 3; j <= 5; j++) expect(r[j * 9 + i], `방 안 (${i},${j})`).toBe(1);
    }
  });

  it('여러 칸이 갇히면 개수를 알려준다 — UI 가 "N칸이 갇힙니다" 로 보여준다', () => {
    const t = flat(8, 8);
    const g = new WallGrid(8, 8);
    // 오른쪽 아래 2×2 를 막는 ㄱ자 벽. 마지막 한 칸이 4칸을 가둔다
    for (let i = 5; i <= 7; i++) g.setRaw(i, 5, WALL_SOLID);
    for (let j = 6; j <= 7; j++) g.setRaw(5, j, WALL_SOLID);
    // 지금은 (6..7, 6..7) 4칸이 갇혀 있다 → 이미 갇힌 상태이므로 새 벽을 세워도 sealed 0
    // 대신 처음부터 검사로 놓아 본다
    const g2 = new WallGrid(8, 8);
    for (let i = 5; i <= 7; i++) {
      const r = placeWall(t, g2, GATE, i, 5);
      expect(r.ok).toBe(true);
    }
    const r1 = placeWall(t, g2, GATE, 5, 6);
    expect(r1.ok).toBe(true);
    const r2 = placeWall(t, g2, GATE, 5, 7);
    expect(r2.ok).toBe(false);
    expect(r2.sealed).toBe(4); // (6,6),(7,6),(6,7),(7,7)
  });

  it('게이트 위에는 못 놓는다', () => {
    const t = flat(6, 6);
    const g = new WallGrid(6, 6);
    expect(canPlaceWall(t, g, GATE, GATE.i, GATE.j).reason).toBe('occupied');
  });

  it('물 위에는 못 세운다', () => {
    const t = flat(6, 6);
    t.paint(3, 3, 'water_edge');
    expect(canPlaceWall(t, new WallGrid(6, 6), GATE, 3, 3).reason).toBe('not-walkable');
  });

  it('격자 밖은 거절', () => {
    const t = flat(6, 6);
    expect(canPlaceWall(t, new WallGrid(6, 6), GATE, -1, 0).reason).toBe('outside');
  });

  it('이미 있는 자리는 거절', () => {
    const t = flat(6, 6);
    const g = new WallGrid(6, 6);
    g.setRaw(2, 2, WALL_SOLID);
    expect(canPlaceWall(t, g, GATE, 2, 2).reason).toBe('occupied');
  });

  it('지우는 건 항상 된다 — 도달성을 늘리기만 한다', () => {
    const g = new WallGrid(6, 6);
    g.setRaw(2, 2, WALL_SOLID);
    expect(removeWall(g, 2, 2)).toBe(true);
    expect(removeWall(g, 2, 2)).toBe(false);
    expect(g.at(2, 2)).toBe(WALL_NONE);
  });

  it('모든 실패 이유에 사람이 읽을 메시지가 있다', () => {
    for (const k of ['outside', 'not-walkable', 'occupied', 'would-seal'] as const) {
      expect(PLACE_MESSAGES[k].length).toBeGreaterThan(0);
    }
  });
});

describe('실제 지형에서', () => {
  it('생성된 지형에 벽을 두르고 문을 남기면 통과한다', () => {
    const t = KairoTerrain.generate(40, 32, new Rng(5));
    const g = new WallGrid(40, 32);
    const gate = { i: 0, j: 0 };
    expect(t.isWalkable(gate.i, gate.j)).toBe(true);
    let placed = 0;
    for (let i = 5; i <= 12; i++) {
      if (placeWall(t, g, gate, i, 5).ok) placed++;
    }
    expect(placed).toBe(8);
    expect(g.count(WALL_SOLID)).toBe(8);
  });

  it('스냅샷 왕복', () => {
    const g = new WallGrid(10, 10);
    g.setRaw(1, 1, WALL_SOLID);
    g.setRaw(2, 1, WALL_DOOR);
    const s = g.toSnapshot();
    const back = WallGrid.fromSnapshot(s);
    expect(back.toSnapshot()).toEqual(s);
    expect(back.at(2, 1)).toBe(WALL_DOOR);
  });

  it('지면 인덱스는 여전히 유효하다 — 지형 계약이 깨지면 벽도 못 놓는다', () => {
    expect(groundIndex('lawn')).toBeGreaterThanOrEqual(0);
  });
});

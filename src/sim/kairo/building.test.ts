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
import { BuildingStore, BUILDING_FAIL_MESSAGES, MIN_BUILDING, type BuildingFail } from './building.js';

/**
 * 건물 영역 — **사각형을 지정하면 외곽 벽이 결과로 생긴다** (K25).
 *
 * 지켜야 할 성질:
 *   · 외곽선만 벽이다 — 안쪽 경계는 없다
 *   · 두 건물이 맞닿으면 그 경계는 **자동으로 사라진다** (양쪽 다 실내라 외곽선이 아니다)
 *   · 넓히면 옛 외곽선이 사라지고 새 외곽선이 생긴다
 *   · 문은 게이트에서 가장 가까운 곳에 자동으로 하나
 *   · 실패하면 통째로 되돌아간다 — 반쯤 적용된 벽이 남지 않는다
 */

const GATE = { i: 0, j: 0 };

function flat(w = 12, h = 12): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'lawn');
  return t;
}

function setup(w = 12, h = 12) {
  return { t: flat(w, h), w: new WallGrid(w, h), s: new BuildingStore() };
}

describe('영역 지정 → 외곽 벽', () => {
  it('3×3 을 지으면 외곽 12 경계만 생긴다 — 안쪽은 뚫려 있다', () => {
    const { t, w, s } = setup();
    expect(s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 }).ok).toBe(true);
    // 외곽 12 = 벽 11 + 문 1
    expect(w.count(EDGE_SOLID)).toBe(11);
    expect(w.count(EDGE_DOOR)).toBe(1);
    // 안쪽 경계 — (4,4)|(5,4) 는 둘 다 실내라 벽이 아니다
    expect(w.edgeAt(4, 4, DIR_I_PLUS)).toBe(EDGE_NONE);
    expect(w.edgeAt(4, 4, DIR_J_PLUS)).toBe(EDGE_NONE);
    // 바깥 경계는 벽
    expect(w.edgeAt(6, 4, DIR_I_PLUS)).toBe(EDGE_SOLID);
  });

  it('실내가 전부 걸어갈 수 있다 — 문 하나로 충분하다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 4, j: 4, w: 4, h: 3 });
    const seen = reachable(t, w, GATE);
    for (let j = 4; j < 7; j++) for (let i = 4; i < 8; i++) expect(seen[j * 12 + i]).toBe(1);
  });

  it('문은 게이트 쪽에 난다 — 반대편에 뚫으면 손님이 빙 돌아야 한다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 5, j: 5, w: 3, h: 3 });
    // 게이트가 (0,0) 이니 문은 −I 또는 −J 면 (즉 i=5 또는 j=5 줄)
    let doorAt: { i: number; j: number; dir: number } | undefined;
    for (let j = 5; j < 8; j++) {
      for (let i = 5; i < 8; i++) {
        for (const d of [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS] as const) {
          if (w.edgeAt(i, j, d) === EDGE_DOOR) doorAt = { i, j, dir: d };
        }
      }
    }
    expect(doorAt).toBeDefined();
    const outI = doorAt!.dir === DIR_I_PLUS ? doorAt!.i + 1 : doorAt!.dir === DIR_I_MINUS ? doorAt!.i - 1 : doorAt!.i;
    const outJ = doorAt!.dir === DIR_J_PLUS ? doorAt!.j + 1 : doorAt!.dir === DIR_J_MINUS ? doorAt!.j - 1 : doorAt!.j;
    // 문 바깥칸은 건물의 게이트 쪽 모서리(4 또는 4) 근처여야 한다
    expect(outI + outJ).toBeLessThanOrEqual(10);
  });
});

describe('맞닿으면 벽이 사라진다', () => {
  it('두 건물이 붙으면 맞닿은 면에 벽이 없다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 3, j: 3, w: 3, h: 3 });
    s.place(t, w, GATE, { i: 6, j: 3, w: 3, h: 3 }); // 바로 오른쪽에 붙임
    // (5,3)|(6,3) 은 양쪽 다 실내 → 벽 없음
    for (let j = 3; j < 6; j++) expect(w.edgeAt(5, j, DIR_I_PLUS)).toBe(EDGE_NONE);
    // 합쳐진 6×3 덩어리의 외곽선만 남는다: 둘레 = (6+3)*2 = 18, 문 2개
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(18);
  });

  it('떨어져 있으면 각자 외곽선을 갖는다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 2, j: 2, w: 2, h: 2 });
    s.place(t, w, GATE, { i: 7, j: 7, w: 2, h: 2 });
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(16); // 8 + 8
    expect(w.count(EDGE_DOOR)).toBe(2);
    expect(s.count).toBe(2);
  });
});

describe('넓히기 — 겹치면 흡수한다', () => {
  it('겹치는 영역을 다시 지정하면 옛 벽이 사라지고 새 외곽선이 생긴다', () => {
    const { t, w, s } = setup();
    const first = s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 });
    expect(first.ok).toBe(true);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(12);

    const grown = s.place(t, w, GATE, { i: 4, j: 4, w: 5, h: 4 });
    expect(grown.ok).toBe(true);
    expect(s.count).toBe(1); // 흡수됐다 — 두 채가 아니다
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(18); // (5+4)*2
    // 옛 외곽선 자리가 지워졌다
    expect(w.edgeAt(6, 5, DIR_I_PLUS)).toBe(EDGE_NONE);
  });

  it('check 가 흡수될 건물을 미리 알려준다 — UI 가 "확장" 이라고 보여줄 수 있다', () => {
    const { t, w, s } = setup();
    const a = s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 });
    const c = s.check(t, GATE, { i: 5, j: 5, w: 4, h: 4 });
    expect(c.ok).toBe(true);
    expect(c.replaces).toEqual([a.building!.handle]);
  });
});

describe('거절', () => {
  it('1×1 은 안 된다 — 벽 넷이 한 칸을 감싸면 안이 없다', () => {
    const { t, w, s } = setup();
    expect(s.place(t, w, GATE, { i: 4, j: 4, w: 1, h: 1 }).fail).toBe('too-small');
    expect(MIN_BUILDING).toBe(2);
  });

  it('격자 밖은 안 된다', () => {
    const { t, w, s } = setup();
    expect(s.place(t, w, GATE, { i: 10, j: 10, w: 4, h: 4 }).fail).toBe('outside');
  });

  it('물 위는 안 된다', () => {
    const { t, w, s } = setup();
    for (let i = 0; i < 12; i++) t.paint(i, 9, 'water_edge');
    expect(s.place(t, w, GATE, { i: 4, j: 8, w: 3, h: 3 }).fail).toBe('not-land');
  });

  it('입구를 덮을 수 없다', () => {
    const { t, w, s } = setup();
    expect(s.place(t, w, GATE, { i: 0, j: 0, w: 3, h: 3 }).fail).toBe('covers-gate');
  });

  it('실패해도 옛 상태가 그대로다 — 반쯤 적용된 벽이 남지 않는다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 });
    const before = w.count(EDGE_SOLID) + w.count(EDGE_DOOR);
    expect(s.place(t, w, GATE, { i: 20, j: 20, w: 3, h: 3 }).ok).toBe(false);
    expect(s.count).toBe(1);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(before);
  });

  it('모든 실패 이유에 사람이 읽을 메시지가 있다', () => {
    const all: BuildingFail[] = [
      'too-small',
      'outside',
      'not-land',
      'covers-gate',
      'no-door',
      'unreachable',
    ];
    for (const f of all) expect(BUILDING_FAIL_MESSAGES[f].length).toBeGreaterThan(0);
  });
});

describe('철거·조회', () => {
  it('없애면 벽도 같이 사라진다', () => {
    const { t, w, s } = setup();
    const b = s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 });
    expect(s.remove(t, w, GATE, b.building!.handle)).toBe(true);
    expect(w.count(EDGE_SOLID)).toBe(0);
    expect(w.count(EDGE_DOOR)).toBe(0);
    expect(s.count).toBe(0);
  });

  it('isIndoor 는 실내 판정 — 벽부착 시설이 안에 들어갔는지 본다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 });
    expect(s.isIndoor(5, 5)).toBe(true);
    expect(s.isIndoor(7, 5)).toBe(false);
    expect(s.at(4, 4)).toBeDefined();
  });
});

describe('스냅샷', () => {
  it('왕복하면 같은 벽이 다시 구워진다 — 세이브에 벽을 따로 안 담아도 된다', () => {
    const { t, w, s } = setup();
    s.place(t, w, GATE, { i: 3, j: 3, w: 3, h: 3 });
    s.place(t, w, GATE, { i: 7, j: 7, w: 2, h: 2 });

    const back = BuildingStore.fromSnapshot(JSON.parse(JSON.stringify(s.toSnapshot())));
    const w2 = new WallGrid(12, 12);
    expect(back.applyWalls(t, w2, GATE).ok).toBe(true);
    expect(w2.toSnapshot()).toEqual(w.toSnapshot());
  });
});

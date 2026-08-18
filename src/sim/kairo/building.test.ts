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
import { PlacementGrid, guestWalkable } from './placement.js';

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

/*
 * ─────────────────────────────────────────────────────────────────────────
 * K25 검토에서 잡은 세 가지. 셋 다 **"실내"와 "손님이 설 수 있는 칸"이 없어서** 생겼다.
 * 값이 아니라 규칙을 못박는다 — 되돌아가면 여기서 걸린다.
 * ─────────────────────────────────────────────────────────────────────────
 */

describe('① 실내 시설은 방 안에만 — 벽에 접했다고 되는 게 아니다', () => {
  it('건물 바깥에서 벽에 접한 칸은 거절된다', () => {
    const { t, w, s } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    s.place(t, w, GATE, { i: 6, j: 6, w: 4, h: 4 }, guestWalkable(t, p));
    const opts = { indoor: (i: number, j: number) => s.isIndoor(i, j) };

    expect(p.check(t, w, GATE, 'shower_row', 6, 7, opts).ok).toBe(true); // 방 안 (6..9)
    // 바깥 칸도 **경계는 공유**한다 — 그래서 "벽에 접했나"로는 통과했었다
    expect(w.hasAnyEdge(10, 7)).toBe(true);
    expect(p.check(t, w, GATE, 'shower_row', 10, 7, opts).fail).toBe('needs-indoor');
  });

  it('발자국이 한 칸이라도 밖으로 나가면 거절 — 반만 실내인 시설은 없다', () => {
    const { t, w, s } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    s.place(t, w, GATE, { i: 6, j: 6, w: 4, h: 4 }, guestWalkable(t, p));
    const opts = { indoor: (i: number, j: number) => s.isIndoor(i, j) };
    // 4칸짜리를 7 에서 시작하면 10 이 밖이다
    expect(p.check(t, w, GATE, 'shower_row', 7, 7, opts).fail).toBe('needs-indoor');
  });
});

describe('② 문은 손님이 실제로 설 수 있는 칸에만 뚫린다', () => {
  it('게이트 쪽이 시설로 막혀 있으면 열린 면으로 문이 간다', () => {
    const { t, w, s } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    // 건물이 들어설 자리의 게이트 쪽(위·왼쪽)을 시설로 완전히 두른다
    for (let i = 5; i <= 9; i++) p.place(t, w, GATE, 'vending_out', i, 5);
    for (let j = 6; j <= 9; j++) p.place(t, w, GATE, 'vending_out', 5, j);

    expect(s.place(t, w, GATE, { i: 6, j: 6, w: 4, h: 4 }, guestWalkable(t, p)).ok).toBe(true);

    let door: { i: number; j: number; dir: number } | null = null;
    for (let j = 6; j < 10; j++)
      for (let i = 6; i < 10; i++)
        for (const d of [DIR_I_PLUS, DIR_J_PLUS, DIR_I_MINUS, DIR_J_MINUS] as const)
          if (w.edgeAt(i, j, d) === EDGE_DOOR) door = { i, j, dir: d };
    expect(door).not.toBeNull();
    const oi = door!.dir === DIR_I_PLUS ? door!.i + 1 : door!.dir === DIR_I_MINUS ? door!.i - 1 : door!.i;
    const oj = door!.dir === DIR_J_PLUS ? door!.j + 1 : door!.dir === DIR_J_MINUS ? door!.j - 1 : door!.j;
    // 문 바깥칸이 시설로 막혀 있으면 손님은 못 들어온다
    expect(p.blocksWalk(oi, oj)).toBe(false);
    // 손님과 **같은** 판정으로 실내가 닿아야 한다
    expect(reachable(t, w, GATE, guestWalkable(t, p))[7 * 20 + 7]).toBe(1);
  });

  it('지형만 보는 도달 검사와 손님 판정이 실제로 갈린다 — 검사가 유의미한가', () => {
    const t = flat(20, 20);
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    for (let i = 0; i < 20; i++) p.place(t, w, GATE, 'vending_out', i, 4); // 가로로 완전 차단
    expect(reachable(t, w, GATE)[10 * 20 + 10]).toBe(1); // 지형만 보면 닿는다
    expect(reachable(t, w, GATE, guestWalkable(t, p))[10 * 20 + 10]).toBe(0); // 손님은 못 간다
  });
});

describe('③ 격자 가장자리에도 벽이 선다', () => {
  it('가장자리 3×3 의 외곽선이 12 다 — 뚫린 면이 없다', () => {
    const { t, w, s } = setup(20, 20);
    expect(s.place(t, w, GATE, { i: 0, j: 3, w: 3, h: 3 }).ok).toBe(true);
    expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(12);
    // 왼쪽 면(−I)은 격자 밖과 맞닿지만 벽이다
    expect(w.edgeAt(0, 3, DIR_I_MINUS)).toBe(EDGE_SOLID);
  });

  it('네 모서리 전부 — 위·왼쪽 가장자리가 특히 위험하다 (게이트가 (0,0) 이라 초반 건물이 몰린다)', () => {
    for (const rect of [
      { i: 0, j: 0, w: 3, h: 3 },
      { i: 17, j: 0, w: 3, h: 3 },
      { i: 0, j: 17, w: 3, h: 3 },
      { i: 17, j: 17, w: 3, h: 3 },
    ]) {
      const t = flat(20, 20);
      const w = new WallGrid(20, 20);
      const s = new BuildingStore();
      const r = s.place(t, w, GATE, rect);
      if (rect.i === 0 && rect.j === 0) {
        expect(r.fail).toBe('covers-gate'); // 입구를 덮는 건 따로 막는다
        continue;
      }
      expect(r.ok).toBe(true);
      expect(w.count(EDGE_SOLID) + w.count(EDGE_DOOR)).toBe(12);
    }
  });
});

describe('시설이 든 방도 넓힐 수 있다', () => {
  /*
   * ⚠ ② 를 고치면서 만든 버그를 헤드리스 밸런싱이 잡았다. 실내 도달 검사가 손님 판정을
   * 쓰게 되자 **시설이 놓인 칸까지 "못 닿는다"** 로 셌고, 그래서 시설이 하나라도 든 방은
   * 확장이 통째로 막혔다 (봇의 `place-unreachable` 33건). 시설이 놓인 칸은 막힌 게
   * 아니라 쓰이는 중이다.
   */
  it('실내 시설을 채운 방을 넓혀도 거절되지 않는다', () => {
    const { t, w, s } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    const stand = guestWalkable(t, p);
    expect(s.place(t, w, GATE, { i: 4, j: 4, w: 5, h: 2 }, stand).ok).toBe(true);

    const opts = { indoor: (i: number, j: number) => s.isIndoor(i, j) };
    expect(p.place(t, w, GATE, 'shower_row', 4, 4, opts).ok).toBe(true);
    expect(p.place(t, w, GATE, 'locker_row', 4, 5, opts).ok).toBe(true);

    // 방이 꽉 찼다 — 넓히는 것이 유일한 수단이다
    const grown = s.place(t, w, GATE, { i: 4, j: 4, w: 5, h: 5 }, guestWalkable(t, p));
    expect(grown.ok, grown.fail).toBe(true);
    expect(s.count).toBe(1);
  });

  it('그래도 진짜로 갇히면 거절한다 — 검사가 무력해지지 않았나', () => {
    const { t, w, s } = setup(20, 20);
    const p = new PlacementGrid(20, 20);
    // 게이트를 물로 둘러싸 아무 데도 못 가게 만든다
    for (let i = 0; i < 20; i++) t.paint(i, 1, 'water_edge');
    const r = s.place(t, w, GATE, { i: 4, j: 4, w: 3, h: 3 }, guestWalkable(t, p));
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('no-door');
  });
});

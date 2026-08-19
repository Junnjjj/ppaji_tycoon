import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { poolZones, riverZones, permitUsed, deckKey, POOL_MIN_TILES } from './swim.js';

/**
 * 수영 구역 (S1) — "바닥이 곧 방"의 물 버전.
 *
 * 지켜야 할 성질:
 *   · 수영장 = pool_water 덩어리 4칸+. 3칸은 장식 웅덩이 (음성)
 *   · 강 구역 = 덱으로 **밀폐된** 물. 열린 강에 닿으면 구역이 아니다 (음성: ㄷ자)
 *   · 구역은 저장이 아니라 파생 — 덱 하나를 빼면 사라지고 다시 놓으면 되살아난다
 *   · 허가 회계: 강 구역만 permitArea 를 소비하고, 넘기는 밀폐는 거절된다
 */

const GATE = { i: 0, j: 0 };

/** 위 8줄 땅(포장) + 아래 8줄 물. 물이 아래 가장자리에 닿아 "열린 강"이다 */
function shore(w = 16, h = 16): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) t.paint(i, j, j < 8 ? 'path_stone' : 'water_edge');
  }
  return t;
}

function pool(t: KairoTerrain, i0: number, j0: number, w: number, h: number): void {
  for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) t.paint(i, j, 'pool_water');
}

const alwaysStand = (): boolean => true;

describe('수영장 (땅) — pool_water 덩어리', () => {
  it('4칸 덩어리가 수영장이고 인접 포장이 입수점이다', () => {
    const t = shore();
    pool(t, 4, 3, 2, 2);
    const p = new PlacementGrid(t.width, t.height);
    const zones = poolZones(t, guestWalkable(t, p));
    expect(zones).toHaveLength(1);
    expect(zones[0]?.kind).toBe('pool');
    expect(zones[0]?.area).toBe(4);
    // 사방이 포장이라 입수점이 있다 — 문이 포장 닿은 쪽에 나는 규칙과 같다 (K32-B)
    expect(zones[0]?.entries.length).toBeGreaterThan(0);
  });

  it(`음성 — ${POOL_MIN_TILES - 1}칸은 장식 웅덩이다`, () => {
    const t = shore();
    pool(t, 4, 3, 3, 1);
    expect(poolZones(t, alwaysStand)).toHaveLength(0);
  });

  it('음성 — 잔디로 둘러싸이면 입수점이 없다 (no-entry 처방 대상)', () => {
    const t = shore();
    // 수영장 주변을 잔디(guestWalk: false)로
    for (let j = 2; j < 7; j++) for (let i = 3; i < 8; i++) t.paint(i, j, 'lawn');
    pool(t, 4, 3, 2, 2);
    const p = new PlacementGrid(t.width, t.height);
    const zones = poolZones(t, guestWalkable(t, p));
    expect(zones).toHaveLength(1);
    expect(zones[0]?.entries).toHaveLength(0);
  });

  it('떨어진 덩어리는 각자 수영장이다', () => {
    const t = shore();
    pool(t, 2, 2, 2, 2);
    pool(t, 8, 2, 2, 3);
    const zones = poolZones(t, alwaysStand);
    expect(zones.map((z) => z.area).sort()).toEqual([4, 6]);
  });
});

/** (4..7, 8..11) 테두리에 덱 12장 — 안쪽 (5..6, 9..10) 2×2 가 밀폐된다 */
function ringKeys(skip?: [number, number]): Set<number> {
  const out = new Set<number>();
  for (let i = 4; i <= 7; i++) {
    for (const j of [8, 11]) {
      if (skip && skip[0] === i && skip[1] === j) continue;
      out.add(deckKey(i, j));
    }
  }
  for (const j of [9, 10]) {
    for (const i of [4, 7]) {
      if (skip && skip[0] === i && skip[1] === j) continue;
      out.add(deckKey(i, j));
    }
  }
  return out;
}

describe('수영 구역 (강) — 덱 밀폐', () => {
  it('덱 고리로 둘러싸면 안쪽 물이 구역이 된다', () => {
    const t = shore();
    const zones = riverZones(t, ringKeys(), alwaysStand);
    expect(zones).toHaveLength(1);
    expect(zones[0]?.kind).toBe('river');
    expect(zones[0]?.area).toBe(4);
    // 입수점 = 구역에 인접한 덱 (2×2 의 사방 테두리 중 변에 접한 8장)
    expect(zones[0]?.entries.length).toBeGreaterThan(0);
  });

  it('음성 — 한 장이 빠지면(ㄷ자) 열린 강과 이어져 구역이 아니다', () => {
    const t = shore();
    expect(riverZones(t, ringKeys([5, 11]), alwaysStand)).toHaveLength(0);
  });

  it('파생 왕복 — 덱을 빼면 사라지고 다시 놓으면 되살아난다 (희망 ≠ 상태)', () => {
    const t = shore();
    const broken = ringKeys([5, 11]);
    expect(riverZones(t, broken, alwaysStand)).toHaveLength(0);
    broken.add(deckKey(5, 11));
    expect(riverZones(t, broken, alwaysStand)).toHaveLength(1);
  });

  it('허가 회계 — 강 구역만 소비하고 수영장은 소비하지 않는다', () => {
    const t = shore();
    pool(t, 2, 2, 2, 2);
    const river = riverZones(t, ringKeys(), alwaysStand);
    const land = poolZones(t, alwaysStand);
    expect(permitUsed([...river, ...land])).toBe(4);
  });
});

describe('permit-over — 밀폐를 완성하는 배치가 허가를 넘으면 거절 (S1)', () => {
  /** 고리의 마지막 한 장(6,11)만 남기고 전부 실제로 놓는다 */
  function ringAllButLast(t: KairoTerrain): { p: PlacementGrid; w: WallGrid } {
    const p = new PlacementGrid(t.width, t.height);
    const w = new WallGrid(t.width, t.height);
    const order: [number, number][] = [
      // 윗줄부터 — 뭍(j=7)에 접해 requiresShoreOrDeck 를 사슬로 만족시킨다
      [4, 8], [5, 8], [6, 8], [7, 8],
      [4, 9], [7, 9], [4, 10], [7, 10],
      [4, 11], [5, 11], [7, 11],
    ];
    for (const [i, j] of order) {
      const r = p.place(t, w, GATE, 'float_deck', i, j);
      expect(r.ok, `덱 (${i},${j})`).toBe(true);
    }
    return { p, w };
  }

  it('허가가 모자라면 마지막 한 장이 거절된다 — 처방은 등급', () => {
    const t = shore();
    const { p, w } = ringAllButLast(t);
    const r = p.check(t, w, GATE, 'float_deck', 6, 11, { permitArea: 3 });
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('permit-over');
  });

  it('허가가 충분하면 같은 배치가 통과한다 (음성 대조군)', () => {
    const t = shore();
    const { p, w } = ringAllButLast(t);
    expect(p.check(t, w, GATE, 'float_deck', 6, 11, { permitArea: 4 }).ok).toBe(true);
  });

  it('밀폐를 만들지 않는 덱은 허가 0 이어도 통과한다', () => {
    const t = shore();
    const p = new PlacementGrid(t.width, t.height);
    const w = new WallGrid(t.width, t.height);
    expect(p.check(t, w, GATE, 'float_deck', 10, 8, { permitArea: 0 }).ok).toBe(true);
  });

  it('permitArea 를 안 주면 기존 동작 그대로다 (하위호환)', () => {
    const t = shore();
    const { p, w } = ringAllButLast(t);
    expect(p.check(t, w, GATE, 'float_deck', 6, 11).ok).toBe(true);
  });
});

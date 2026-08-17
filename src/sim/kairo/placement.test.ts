import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, WALL_SOLID, placeWall } from './walls.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  PLACE_FAIL_MESSAGES,
  type PlaceFail,
} from './placement.js';

const GATE = { i: 0, j: 0 };

/** 전부 걸을 수 있는 평지 — 배치 규칙만 보게 지형 변수를 없앤다 */
function flat(w: number, h: number): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'lawn');
  return t;
}

function withWater(w: number, h: number, fromJ: number): KairoTerrain {
  const t = flat(w, h);
  for (let i = 0; i < w; i++) for (let j = fromJ; j < h; j++) t.paint(i, j, 'water_edge');
  return t;
}

describe('시설 정의 — 시뮬이 아는 것만 있다', () => {
  it('73종', () => {
    expect(allFacilityDefs()).toHaveLength(73);
  });

  it('렌더 전용 필드가 없다 — 불변식 1', () => {
    for (const d of allFacilityDefs()) {
      expect(d).not.toHaveProperty('canvas');
      expect(d).not.toHaveProperty('slots');
      expect(d).not.toHaveProperty('bodyH');
    }
  });

  it('발자국이 모두 1 이상이다', () => {
    for (const d of allFacilityDefs()) {
      expect(d.size[0]).toBeGreaterThan(0);
      expect(d.size[1]).toBeGreaterThan(0);
    }
  });

  it('벽부착 시설이 9종이다', () => {
    expect(allFacilityDefs().filter((d) => d.placement.requiresWallAdjacent)).toHaveLength(9);
  });

  it('없는 시설은 undefined', () => {
    expect(facilityDef('nope')).toBeUndefined();
  });
});

describe('발자국', () => {
  it('w×d 타일을 덮는다', () => {
    const def = facilityDef('shower_row')!; // 4×1
    const tiles = PlacementGrid.footprintTiles(def, 5, 7);
    expect(tiles).toHaveLength(4);
    expect(tiles).toEqual([
      [5, 7],
      [6, 7],
      [7, 7],
      [8, 7],
    ]);
  });

  it('점유 격자가 발자국 전체를 담는다', () => {
    const t = flat(20, 20);
    const w = new WallGrid(20, 20);
    const g = new PlacementGrid(20, 20);
    const r = g.place(t, w, GATE, 'shop', 5, 5); // 2×2, 벽부착 아님
    expect(r.ok).toBe(true);
    for (const [i, j] of [
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
    ] as const) {
      expect(g.handleAt(i, j)).toBe(r.placed!.handle);
    }
    expect(g.handleAt(7, 5)).toBe(0);
  });
});

describe('배치 거절 이유 — 전부 플레이어가 고칠 수 있어야 한다', () => {
  it('격자 밖', () => {
    const t = flat(10, 10);
    const g = new PlacementGrid(10, 10);
    expect(g.check(t, new WallGrid(10, 10), GATE, 'toilet', 9, 9).fail).toBe('outside');
  });

  it('화장실은 벽부착 시설이다 — 벽 없이는 못 놓는다', () => {
    const t = flat(14, 14);
    const g = new PlacementGrid(14, 14);
    expect(facilityDef('toilet')!.placement.requiresWallAdjacent).toBe(true);
    expect(g.check(t, new WallGrid(14, 14), GATE, 'toilet', 5, 5).fail).toBe('needs-wall');
  });

  it('물 위에 육상 시설을 놓으면 지형 오류', () => {
    const t = withWater(12, 12, 8);
    const g = new PlacementGrid(12, 12);
    expect(g.check(t, new WallGrid(12, 12), GATE, 'toilet', 3, 9).fail).toBe('wrong-terrain');
  });

  it('땅 위에 물 시설을 놓으면 지형 오류', () => {
    const t = withWater(12, 12, 8);
    const g = new PlacementGrid(12, 12);
    expect(g.check(t, new WallGrid(12, 12), GATE, 'float_deck', 3, 2).fail).toBe('wrong-terrain');
  });

  it('물 시설은 물 위에 놓인다', () => {
    const t = withWater(12, 12, 8);
    const g = new PlacementGrid(12, 12);
    expect(g.place(t, new WallGrid(12, 12), GATE, 'float_deck', 3, 9).ok).toBe(true);
  });

  it('겹치면 거절', () => {
    const t = flat(14, 14);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    expect(g.place(t, w, GATE, 'shop', 5, 5).ok).toBe(true);
    expect(g.check(t, w, GATE, 'shop', 6, 6).fail).toBe('occupied');
  });

  it('벽이 지나가면 거절', () => {
    const t = flat(14, 14);
    const w = new WallGrid(14, 14);
    w.setRaw(6, 5, WALL_SOLID);
    const g = new PlacementGrid(14, 14);
    expect(g.check(t, w, GATE, 'toilet', 5, 5).fail).toBe('blocked-by-wall');
  });

  it('게이트 위는 거절', () => {
    const t = flat(14, 14);
    const g = new PlacementGrid(14, 14);
    expect(g.check(t, new WallGrid(14, 14), GATE, 'toilet', 0, 0).fail).toBe('occupied');
  });

  it('벽부착 시설은 벽이 없으면 거절, 붙이면 통과', () => {
    const t = flat(16, 16);
    const w = new WallGrid(16, 16);
    const g = new PlacementGrid(16, 16);
    // 샤워실 연립은 wallMount
    expect(facilityDef('shower_row')!.placement.requiresWallAdjacent).toBe(true);
    expect(g.check(t, w, GATE, 'shower_row', 5, 5).fail).toBe('needs-wall');
    expect(placeWall(t, w, GATE, 5, 4).ok).toBe(true);
    expect(g.check(t, w, GATE, 'shower_row', 5, 5).ok).toBe(true);
  });

  it('손님이 닿을 수 없는 자리는 거절 — 놓고 나서 매출 0 을 발견하는 것보다 낫다', () => {
    const t = flat(12, 12);
    const w = new WallGrid(12, 12);
    const g = new PlacementGrid(12, 12);
    // 오른쪽 아래 구석을 벽으로 잘라낸다 (밀폐 검사를 피해 setRaw 로 직접)
    for (let i = 8; i < 12; i++) w.setRaw(i, 8, WALL_SOLID);
    for (let j = 9; j < 12; j++) w.setRaw(8, j, WALL_SOLID);
    // 잘린 안쪽 (10,10) 은 게이트에서 못 온다
    expect(g.check(t, w, GATE, 'vending_out', 10, 10).fail).toBe('unreachable');
    // 열린 쪽은 된다
    expect(g.check(t, w, GATE, 'vending_out', 3, 3).ok).toBe(true);
  });

  it('물 시설은 도달 검사를 건너뛴다 — 플로팅덱 연결이 K6 소관이다', () => {
    const t = withWater(14, 14, 6);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    // 물 한가운데라 걸어서는 못 오지만 배치는 된다
    expect(g.place(t, w, GATE, 'float_deck', 7, 11).ok).toBe(true);
  });

  it('알 수 없는 시설', () => {
    const t = flat(10, 10);
    const g = new PlacementGrid(10, 10);
    expect(g.check(t, new WallGrid(10, 10), GATE, 'nope', 2, 2).fail).toBe('unknown-def');
  });

  it('모든 실패 이유에 사람이 읽을 메시지가 있다', () => {
    const all: PlaceFail[] = [
      'outside',
      'wrong-terrain',
      'occupied',
      'blocked-by-wall',
      'needs-wall',
      'unreachable',
      'unknown-def',
    ];
    for (const f of all) expect(PLACE_FAIL_MESSAGES[f].length).toBeGreaterThan(0);
  });
});

describe('제거·용량·스냅샷', () => {
  it('제거하면 칸이 비고 다시 놓을 수 있다', () => {
    const t = flat(14, 14);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    const r = g.place(t, w, GATE, 'shop', 5, 5);
    expect(g.count).toBe(1);
    expect(g.remove(r.placed!.handle)).toBe(true);
    expect(g.count).toBe(0);
    expect(g.handleAt(5, 5)).toBe(0);
    expect(g.place(t, w, GATE, 'shop', 5, 5).ok).toBe(true);
  });

  it('없는 handle 제거는 false', () => {
    expect(new PlacementGrid(6, 6).remove(999)).toBe(false);
  });

  it('용량은 시설 정의의 합이다 — 결산에서 병목을 읽는 근거', () => {
    const t = flat(20, 20);
    const w = new WallGrid(20, 20);
    const g = new PlacementGrid(20, 20);
    expect(g.place(t, w, GATE, 'shop', 2, 2).ok).toBe(true);
    expect(g.place(t, w, GATE, 'cafe', 6, 2).ok).toBe(true);
    expect(g.totalCapacity()).toBe(
      (facilityDef('shop')?.capacity ?? 0) + (facilityDef('cafe')?.capacity ?? 0),
    );
  });

  it('스냅샷 왕복 — 점유 격자까지 복원된다', () => {
    const t = flat(20, 20);
    const w = new WallGrid(20, 20);
    const g = new PlacementGrid(20, 20);
    // shower_row 는 벽부착이라 벽을 먼저 세운다
    for (let i = 3; i <= 6; i++) placeWall(t, w, GATE, i, 2);
    expect(g.place(t, w, GATE, 'shower_row', 3, 3).ok).toBe(true);
    expect(g.place(t, w, GATE, 'cafe', 8, 8).ok).toBe(true);
    const s = g.toSnapshot();
    const back = PlacementGrid.fromSnapshot(s);
    expect(back.count).toBe(2);
    expect(back.toSnapshot().items).toEqual(s.items);
    // 점유 격자가 살아났나
    expect(back.handleAt(4, 3)).toBe(back.handleAt(3, 3));
    expect(back.handleAt(3, 3)).not.toBe(0);
  });

  it('스냅샷이 평문이다', () => {
    const s = new PlacementGrid(4, 4).toSnapshot();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('실제 지형에서 73종을 다 놓아본다', () => {
  it('각 시설이 적어도 한 자리에는 놓인다 — 못 놓는 시설이 있으면 데이터 오류다', () => {
    const t = KairoTerrain.generate(40, 32, new Rng(9));
    const walls = new WallGrid(40, 32);
    // 벽부착 시설을 위해 벽 한 줄
    for (let i = 2; i < 30; i++) placeWall(t, walls, GATE, i, 2);

    const unplaceable: string[] = [];
    for (const def of allFacilityDefs()) {
      const g = new PlacementGrid(40, 32);
      let ok = false;
      for (let j = 0; j < 32 - def.size[1] && !ok; j++) {
        for (let i = 0; i < 40 - def.size[0]; i++) {
          if (g.check(t, walls, GATE, def.id, i, j).ok) {
            ok = true;
            break;
          }
        }
      }
      if (!ok) unplaceable.push(`${def.id}(${def.size[0]}×${def.size[1]}/${def.layer})`);
    }
    expect(unplaceable).toEqual([]);
  });
});

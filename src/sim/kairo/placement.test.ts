import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, EDGE_SOLID, DIR_I_PLUS, DIR_J_MINUS } from './walls.js';
import {
  bakeIndoorWalls,
  paintFloor,
  paintFloorBlock,
  INDOOR_FAIL_MESSAGES,
} from './indoor.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  guestWalkable,
  ticketsServed,
  GATE_FACILITY_ID,
  PLACE_FAIL_MESSAGES,
  type PlaceFail,
} from './placement.js';
import { TICKET_DEF_ID } from './guests.js';

const GATE = { i: 0, j: 0 };

/** 실내 바닥을 사각형만큼 깐다 — **바닥이 곧 방**이다 (K27) */
function room(t: KairoTerrain, i0: number, j0: number, w: number, h: number): void {
  for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) t.paint(i, j, 'floor_indoor');
}

/**
 * 전부 걸을 수 있는 평지 — 배치 규칙만 보게 지형 변수를 없앤다.
 *
 * ⚠ 잔디가 아니라 **석재 보도**다. K32-B 부터 잔디는 손님이 못 지나간다 —
 * 이 헬퍼의 의도는 "통행 가능한 평지"이지 "잔디"가 아니었다.
 */
function flat(w: number, h: number): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'path_stone');
  return t;
}

function withWater(w: number, h: number, fromJ: number): KairoTerrain {
  const t = flat(w, h);
  for (let i = 0; i < w; i++) for (let j = fromJ; j < h; j++) t.paint(i, j, 'water_edge');
  return t;
}

describe('시설 정의 — 시뮬이 아는 것만 있다', () => {
  it('75종', () => {
    expect(allFacilityDefs()).toHaveLength(75);
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
    expect(allFacilityDefs().filter((d) => d.placement.requiresIndoor)).toHaveLength(9);
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
    expect(facilityDef('toilet')!.placement.requiresIndoor).toBe(true);
    expect(g.check(t, new WallGrid(14, 14), GATE, 'toilet', 5, 5).fail).toBe('needs-indoor');
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

  it('플로팅덱은 물가에 붙으면 놓인다 — 육지에 이어져야 한다 (결정 11)', () => {
    const t = withWater(12, 12, 8);
    const g = new PlacementGrid(12, 12);
    // (3,8) 은 물이고 (3,7) 은 육지 → 이어진다
    expect(g.place(t, new WallGrid(12, 12), GATE, 'float_deck', 3, 8).ok).toBe(true);
  });

  it('물 한가운데 덱은 거절된다 — 이어지지 않으면 손님이 못 온다', () => {
    const t = withWater(14, 14, 6);
    const g = new PlacementGrid(14, 14);
    expect(g.check(t, new WallGrid(14, 14), GATE, 'float_deck', 7, 11).fail).toBe(
      'deck-not-connected',
    );
  });

  it('덱을 이어 붙이면 물 안쪽으로 뻗어 나간다', () => {
    const t = withWater(14, 14, 6);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    // 물가에서 시작해 한 칸씩
    for (let j = 6; j <= 10; j++) {
      expect(g.place(t, w, GATE, 'float_deck', 7, j).ok, `덱 (7,${j})`).toBe(true);
    }
    // 이어진 덱은 손님이 밟을 수 있다
    expect(g.isWalkOn(7, 10)).toBe(true);
    expect(g.blocksWalk(7, 10)).toBe(false);
  });

  it('인플레이터블은 덱에 붙어야 한다', () => {
    const t = withWater(14, 14, 6);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    // 덱 없이 트램폴린 → 거절
    expect(g.check(t, w, GATE, 'trampoline_w', 5, 8).fail).toBe('needs-deck');
    // 덱을 깔면 통과
    for (let j = 6; j <= 9; j++) g.place(t, w, GATE, 'float_deck', 4, j);
    expect(g.check(t, w, GATE, 'trampoline_w', 5, 7).ok).toBe(true);
  });

  it('겹치면 거절', () => {
    const t = flat(14, 14);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    expect(g.place(t, w, GATE, 'shop', 5, 5).ok).toBe(true);
    expect(g.check(t, w, GATE, 'shop', 6, 6).fail).toBe('occupied');
  });

  it('⚠ 벽 위에도 시설을 놓을 수 있다 — 벽이 경계로 옮겨갔다 (K25)', () => {
    /*
     * 예전에는 벽이 타일을 점유해서 "벽이 지나가면 거절"이었다. 이제 벽은 두 칸 **사이**에
     * 있으므로 칸을 막지 않는다 — 벽에 붙여 시설을 놓는 것이 오히려 정상이다.
     */
    const t = flat(14, 14);
    const w = new WallGrid(14, 14);
    room(t, 4, 4, 4, 4);
    bakeIndoorWalls(t, w, GATE);
    const g = new PlacementGrid(14, 14);
    expect(g.check(t, w, GATE, 'toilet', 5, 5).ok).toBe(true);
  });

  it('게이트 위는 거절', () => {
    const t = flat(14, 14);
    const g = new PlacementGrid(14, 14);
    expect(g.check(t, new WallGrid(14, 14), GATE, 'toilet', 0, 0).fail).toBe('occupied');
  });

  it('실내 시설은 실내 바닥 위에만 — 벽에 접했다고 되는 게 아니다', () => {
    const t = flat(16, 16);
    const w = new WallGrid(16, 16);
    const g = new PlacementGrid(16, 16);
    expect(facilityDef('shower_row')!.placement.requiresIndoor).toBe(true);
    expect(g.check(t, w, GATE, 'shower_row', 5, 5).fail).toBe('needs-indoor');

    room(t, 4, 4, 6, 3);
    bakeIndoorWalls(t, w, GATE);
    expect(g.check(t, w, GATE, 'shower_row', 5, 5).ok).toBe(true);

    /*
     * ⚠ 여기가 K26 ① 이 잡은 자리다. 경계는 **두 칸이 공유**하므로 방 바깥에서 벽에
     * 접한 칸도 `hasAnyEdge` 로는 통과했다 — 샤워실이 야외 잔디에 놓였다.
     */
    expect(w.hasAnyEdge(10, 5)).toBe(true); // 방 오른쪽 바깥, 벽에 접함
    expect(t.isIndoor(10, 5)).toBe(false);
    expect(g.check(t, w, GATE, 'shower_row', 10, 5).fail).toBe('needs-indoor');
  });

  it('손님이 닿을 수 없는 자리는 거절 — 놓고 나서 매출 0 을 발견하는 것보다 낫다', () => {
    const t = flat(12, 12);
    const w = new WallGrid(12, 12);
    const g = new PlacementGrid(12, 12);
    // 오른쪽 아래 구석을 경계 벽으로 잘라낸다 (밀폐 검사를 피해 직접 세운다)
    for (let i = 8; i < 12; i++) w.setEdge(i, 9, DIR_J_MINUS, EDGE_SOLID);
    for (let j = 9; j < 12; j++) w.setEdge(8, j, DIR_I_PLUS, EDGE_SOLID);
    // 잘린 안쪽 (10,10) 은 게이트에서 못 온다
    expect(g.check(t, w, GATE, 'vending_out', 10, 10).fail).toBe('unreachable');
    // 열린 쪽은 된다
    expect(g.check(t, w, GATE, 'vending_out', 3, 3).ok).toBe(true);
  });

  it('시설은 손님의 길을 막는다 — 막지 않으면 배치가 동선에 영향을 주지 않는다', () => {
    const t = flat(14, 14);
    const w = new WallGrid(14, 14);
    const g = new PlacementGrid(14, 14);
    const r = g.place(t, w, GATE, 'shop', 5, 5);
    expect(r.ok).toBe(true);
    expect(g.blocksWalk(5, 5)).toBe(true);
    expect(g.isWalkOn(5, 5)).toBe(false);
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
      'needs-indoor',
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
    // shower_row 는 실내 시설이라 바닥을 먼저 깐다
    room(t, 2, 2, 7, 3);
    bakeIndoorWalls(t, w, GATE);
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
    /*
     * 육지를 통째로 포장한다 — K32-B 부터 잔디는 손님이 못 지나가고,
     * `unreachable` 이 손님 판정을 쓴다. 이 테스트가 보려는 것은 "73종이 데이터상 놓이는가"
     * 이지 "길이 깔렸는가"가 아니다. 길 규칙 자체는 walls/guests 테스트가 본다.
     */
    for (let j = 0; j < 32; j++) {
      for (let i = 0; i < 40; i++) if (t.isWalkable(i, j)) t.paint(i, j, 'path_stone');
    }
    const walls = new WallGrid(40, 32);
    // 실내 시설을 위해 실내 바닥 한 덩어리 (지형이 육지인 위쪽 띠에)
    room(t, 2, 2, 28, 4);
    bakeIndoorWalls(t, walls, GATE);

    // 물 위 시설을 위해 **잔교 한 줄**을 낸다 — 물 전체에 덱을 깔면 자리가 없어진다
    let pier: { i: number; j: number } | null = null;
    for (let i = 1; i < 39 && !pier; i++) {
      for (let j = 1; j < 31; j++) {
        if (t.isWalkable(i, j) && !t.isWalkable(i, j + 1)) {
          pier = { i, j: j + 1 };
          break;
        }
      }
    }
    expect(pier).not.toBeNull();

    const unplaceable: string[] = [];
    for (const def of allFacilityDefs()) {
      const g = new PlacementGrid(40, 32);
      if (def.layer === 'water' && pier) {
        // 물가에서 물 안쪽으로 덱 한 줄
        for (let k = 0; k < 12; k++) {
          if (!t.inside(pier.i, pier.j + k) || t.isWalkable(pier.i, pier.j + k)) break;
          g.place(t, walls, GATE, 'float_deck', pier.i, pier.j + k);
        }
      }
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

describe('회전 (K45)', () => {
  const GATE45 = { i: 0, j: 0 };
  function flat45(size = 20): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
    const t = new KairoTerrain(size, size);
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'path_stone');
    return { t, w: new WallGrid(size, size), p: new PlacementGrid(size, size) };
  }

  it('facing 1 은 발자국을 w↔h 로 바꾼다 — 판정·점유·철거·복원까지', () => {
    const { t, w, p } = flat45();
    // 평상 4×1 을 세로(1×4)로
    const r = p.place(t, w, GATE45, 'pyeongsang_row', 5, 5, { facing: 1 });
    expect(r.ok).toBe(true);
    expect(p.at(5, 8)?.defId).toBe('pyeongsang_row'); // 세로로 뻗었다
    expect(p.at(8, 5)).toBeUndefined(); // 가로가 아니다
    // 겹침 판정도 회전 발자국으로
    expect(p.place(t, w, GATE45, 'parasol', 5, 7).ok).toBe(false);
    expect(p.place(t, w, GATE45, 'parasol', 7, 5).ok).toBe(true);
    // 스냅샷 왕복 — facing 이 살아남고 점유가 같다
    const back = PlacementGrid.fromSnapshot(p.toSnapshot());
    expect(back.at(5, 8)?.facing).toBe(1);
    // 철거가 회전 발자국을 비운다
    const handle = p.at(5, 5)?.handle as number;
    p.remove(handle);
    expect(p.at(5, 8)).toBeUndefined();
  });

  it('정사각은 회전해도 같다 — 판정이 안 갈라진다', () => {
    const { t, w, p } = flat45();
    expect(p.place(t, w, GATE45, 'pingpong', 3, 3, { facing: 1 }).ok).toBe(true);
    expect(p.at(4, 4)?.defId).toBe('pingpong');
  });
});

/**
 * 입구를 봉하는 배치 (P3-B).
 *
 * ⚠ **실제 크기 판**에서만 잴 수 있다. 정류장(`KairoTerrain.busStop()`)이 상수 좌표라
 * 축소판에서는 격자 밖으로 떨어져 아무것도 안 재는 검사가 된다.
 */
describe('입구 봉쇄 — blocks-gate (P3-B)', () => {
  const PARK_GATE = KairoTerrain.parkGate();
  /** 매표소 3×2 의 왼쪽 위. 아래 통로들이 (48,19) 에서 닿는다 */
  const TICKET_AT = { i: KairoTerrain.ENTRY_I - 1, j: 20 };

  /**
   * 정류장 → 공원 → 매표소로 이어지는 **포장 통로만** 있는 판.
   * `lanes` 는 통로 열의 개수 — 1 이면 외길, 2 면 우회로가 있다.
   */
  function corridor(lanes: number): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
    const t = new KairoTerrain(KairoTerrain.WIDTH, KairoTerrain.HEIGHT);
    const w = new WallGrid(KairoTerrain.WIDTH, KairoTerrain.HEIGHT);
    const p = new PlacementGrid(KairoTerrain.WIDTH, KairoTerrain.HEIGHT);
    // 도시 띠: 정류장에서 공원 입구까지 한 열
    for (let j = KairoTerrain.STOP_ROW; j < KairoTerrain.CITY_BAND; j++) {
      t.paint(KairoTerrain.ENTRY_I, j, 'sidewalk');
    }
    // 공원 안: 통로 열 (나머지는 잔디 — 손님이 못 지나간다)
    for (let lane = 0; lane < lanes; lane++) {
      for (let j = KairoTerrain.CITY_BAND; j < TICKET_AT.j; j++) {
        t.paint(KairoTerrain.ENTRY_I + lane, j, 'path_stone');
      }
    }
    return { t, w, p };
  }

  function withTicket(lanes: number): ReturnType<typeof corridor> {
    const b = corridor(lanes);
    expect(b.p.place(b.t, b.w, PARK_GATE, 'ticket', TICKET_AT.i, TICKET_AT.j).ok).toBe(true);
    return b;
  }

  it('★ 매표소로 가는 마지막 길을 막으면 거절된다', () => {
    const { t, w, p } = withTicket(1);
    const r = p.check(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I, 15);
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('blocks-gate');
    // 사유에 처방이 있다 ("길을 한 칸 남기세요")
    expect(PLACE_FAIL_MESSAGES['blocks-gate']).toContain('길');
  });

  it('음성 대조군 — 우회로가 있으면 거절되지 않는다', () => {
    const { t, w, p } = withTicket(2);
    expect(p.check(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I, 15).ok).toBe(true);
    // 남은 한 열까지 막으면 그때 거절된다 — 같은 판, 같은 시설
    expect(p.place(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I, 15).ok).toBe(true);
    expect(p.check(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I + 1, 15).fail).toBe(
      'blocks-gate',
    );
  });

  it('매표소가 없는 새 판에서는 아무것도 막지 않는다', () => {
    const { t, w, p } = corridor(1);
    expect(p.check(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I, 15).ok).toBe(true);
  });

  it('이미 끊긴 판을 잠그지 않는다 — 전후 비교다', () => {
    const { t, w, p } = withTicket(1);
    // 통로를 잔디로 되돌려 매표소를 이미 고립시킨다
    t.paint(KairoTerrain.ENTRY_I, 12, 'lawn');
    expect(ticketsServed(t, w, p, guestWalkable(t, p))).toBe(false);
    // 그래도 나머지 통로에는 놓을 수 있다 (아니면 되돌릴 방법까지 막힌다)
    expect(p.check(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I, 15).fail).not.toBe(
      'blocks-gate',
    );
  });

  it('음성 대조군 — 길 옆 잔디는 그대로 놓인다 (과잉 차단 없음)', () => {
    const { t, w, p } = withTicket(1);
    // 손님이 원래 못 서던 칸이라 도달 집합이 안 바뀐다 — 조기 반환이 여기서 돈다
    expect(p.check(t, w, PARK_GATE, 'parasol', KairoTerrain.ENTRY_I - 1, 15).ok).toBe(true);
  });

  it('매표소가 둘이면 하나만 닿아도 된다', () => {
    const t = new KairoTerrain(KairoTerrain.WIDTH, KairoTerrain.HEIGHT);
    const w = new WallGrid(KairoTerrain.WIDTH, KairoTerrain.HEIGHT);
    const p = new PlacementGrid(KairoTerrain.WIDTH, KairoTerrain.HEIGHT);
    const E = KairoTerrain.ENTRY_I;
    for (let j = KairoTerrain.STOP_ROW; j < KairoTerrain.CITY_BAND; j++) t.paint(E, j, 'sidewalk');
    // 줄기 하나에서 좌우로 갈라지는 두 가지 — 가지마다 매표소가 하나씩
    for (let j = KairoTerrain.CITY_BAND; j <= 12; j++) t.paint(E, j, 'path_stone');
    for (let i = E - 4; i <= E + 4; i++) t.paint(i, 12, 'path_stone');
    for (let j = 12; j < 20; j++) {
      t.paint(E - 4, j, 'path_stone');
      t.paint(E + 4, j, 'path_stone');
    }
    expect(p.place(t, w, PARK_GATE, 'ticket', E - 5, 20).ok).toBe(true); // 왼쪽 가지
    expect(p.place(t, w, PARK_GATE, 'ticket', E + 3, 20).ok).toBe(true); // 오른쪽 가지
    // 왼쪽 가지를 끊어도 오른쪽 매표소가 살아 있으면 입장이 죽지 않는다
    expect(p.check(t, w, PARK_GATE, 'parasol', E - 4, 15).ok).toBe(true);
    // 줄기를 끊으면 둘 다 죽는다
    expect(p.check(t, w, PARK_GATE, 'parasol', E, 10).fail).toBe('blocks-gate');
  });

  it('입구 시설 id 가 손님 쪽과 같다 — 정의가 갈라지면 검사가 헛돈다', () => {
    expect(GATE_FACILITY_ID).toBe(TICKET_DEF_ID);
  });

  /*
   * ⚠ 바닥 붓도 같은 규칙을 받아야 한다. 시설만 막고 바닥을 열어 두면 **포장을 지워**
   * 똑같이 입구를 봉할 수 있다 — K32·K36 에서 두 번 겪은 구멍이다.
   */
  it('★ 바닥을 지워 마지막 길을 끊는 것도 막힌다', () => {
    const { t, w, p } = withTicket(1);
    const r = paintFloor(
      t,
      w,
      PARK_GATE,
      KairoTerrain.ENTRY_I,
      15,
      'lawn',
      guestWalkable(t, p),
      p,
    );
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('blocks-gate');
    // 되돌렸다 — 지형이 그대로다
    expect(t.kindAt(KairoTerrain.ENTRY_I, 15)).toBe('path_stone');
    expect(INDOOR_FAIL_MESSAGES['blocks-gate']).toBe(PLACE_FAIL_MESSAGES['blocks-gate']);
  });

  it('음성 대조군 — 우회로가 있으면 바닥을 지울 수 있다', () => {
    const { t, w, p } = withTicket(2);
    const r = paintFloor(
      t,
      w,
      PARK_GATE,
      KairoTerrain.ENTRY_I,
      15,
      'lawn',
      guestWalkable(t, p),
      p,
    );
    expect(r).toEqual({ ok: true, changed: true });
  });

  it('블록 붓도 같은 판정이다 — 한 번에 두 열을 지워도 막힌다', () => {
    const { t, w, p } = withTicket(2);
    const r = paintFloorBlock(
      t,
      w,
      PARK_GATE,
      KairoTerrain.ENTRY_I,
      15,
      2,
      2,
      'lawn',
      guestWalkable(t, p),
      p,
    );
    expect(r.fail).toBe('blocks-gate');
    expect(r.changed).toBe(0);
    expect(t.kindAt(KairoTerrain.ENTRY_I + 1, 16)).toBe('path_stone');
  });
});

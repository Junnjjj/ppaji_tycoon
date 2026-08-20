import { describe, it, expect, afterEach } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  setRideFaultForTest,
} from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';

const GATE = { i: 0, j: 0 };

/** 앞쪽 절반이 물인 지형 — `aqua.test.ts` 와 같은 축소판 */
function shore(w: number, h: number, waterFrom: number): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) t.paint(i, j, j >= waterFrom ? 'water_edge' : 'path_stone');
  }
  return t;
}

/**
 * 물가에서 뻗어 나간 덱 한 줄 — `aqua.test.ts` 와 같은 기반이다.
 * 슬라이드는 `requiresDeck`(덱에 **접함**)이라 발자국 자체는 빈 물이어야 한다.
 */
function deckedWorld(): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = shore(32, 32, 10);
  const w = new WallGrid(32, 32);
  const p = new PlacementGrid(32, 32);
  for (let j = 10; j < 20; j++) p.place(t, w, GATE, 'float_deck', 4, j);
  return { t, w, p };
}

const RIDES = allFacilityDefs().filter((d) => d.ride);

afterEach(() => setRideFaultForTest(false));

describe('슬라이드 입출구는 회전을 탄다 (K51)', () => {
  it('★ 회전 버그 재현 — 옛 산수는 입구를 발자국 밖으로 보낸다', () => {
    /*
     * 고치기 전의 세계다. `guests.ts` 가 `item.i + def.ride.entryTile[0]` 로 **원본
     * 오프셋을 그대로** 썼는데, 발자국은 `sizeOf` 가 w↔h 를 바꾼다. `slide_large`
     * 는 4×5 · 입구 `[3,4]` 라 회전하면 발자국이 5×4 이고 `dj=4` 는 밖이다.
     *
     * ⚠ 이 검사가 **대조군을 켜야만** 통과한다는 것이 요지다 — 켜지 않으면(=고친 코드)
     * 입구가 발자국 안이라 아래 `not.toContain` 이 실패한다.
     */
    setRideFaultForTest(true);
    const def = facilityDef('slide_large')!;
    const foot = PlacementGrid.footprintTiles(def, 5, 11, 1).map((t) => `${t[0]},${t[1]}`);
    const bad = PlacementGrid.rideTilesOf(def, 5, 11, 1)!;
    expect(foot).not.toContain(`${bad.entry[0]},${bad.entry[1]}`);
    // 회전 가능 조건이 `size[0] !== size[1]` 이라 영향 범위는 비정사각 슬라이드 둘이다
    const rotatable = RIDES.filter((d) => d.size[0] !== d.size[1]).map((d) => d.id);
    expect(rotatable.sort()).toEqual(['slide_large', 'snow_sled']);
  });

  it('★ 변환된 입출구는 4종 × 2방향 전부 발자국 안이다', () => {
    expect(RIDES).toHaveLength(4);
    for (const def of RIDES) {
      for (const facing of [0, 1] as const) {
        const foot = new Set(
          PlacementGrid.footprintTiles(def, 7, 9, facing).map((t) => `${t[0]},${t[1]}`),
        );
        const r = PlacementGrid.rideTilesOf(def, 7, 9, facing)!;
        expect(foot.has(`${r.entry[0]},${r.entry[1]}`), `${def.id} f${facing} 입구`).toBe(true);
        expect(foot.has(`${r.exit[0]},${r.exit[1]}`), `${def.id} f${facing} 출구`).toBe(true);
        // 입구와 출구는 서로 다른 칸이어야 표시가 뜻을 갖는다
        expect(r.entry).not.toEqual(r.exit);
      }
    }
  });

  it('대조군을 켜면 그 검사가 실제로 깨진다 — 정사각을 뺀 둘에서', () => {
    setRideFaultForTest(true);
    const outside: string[] = [];
    for (const def of RIDES) {
      const foot = new Set(
        PlacementGrid.footprintTiles(def, 7, 9, 1).map((t) => `${t[0]},${t[1]}`),
      );
      const r = PlacementGrid.rideTilesOf(def, 7, 9, 1)!;
      if (!foot.has(`${r.entry[0]},${r.entry[1]}`)) outside.push(def.id);
    }
    expect(outside.sort()).toEqual(['slide_large', 'snow_sled']);
  });

  it('회전은 전치다 — 그림의 flipX 와 같은 변환이어야 한다', () => {
    for (const def of RIDES) {
      const r0 = PlacementGrid.rideTilesOf(def, 0, 0, 0)!;
      const r1 = PlacementGrid.rideTilesOf(def, 0, 0, 1)!;
      expect([r1.entry[1], r1.entry[0]]).toEqual([r0.entry[0], r0.entry[1]]);
      expect([r1.exit[1], r1.exit[0]]).toEqual([r0.exit[0], r0.exit[1]]);
    }
  });

  it('ride 가 없는 시설은 null 이다 — 표식이 아무 데나 뜨면 안 된다', () => {
    expect(PlacementGrid.rideTilesOf(facilityDef('float_deck')!, 3, 3, 0)).toBeNull();
  });
});

describe('손님이 화면에 표시된 그 칸으로 들어간다 (K51)', () => {
  /**
   * ⚠ **상수끼리 비교하지 않는다** (K38·P2-C 규칙: 화면에 올라간 것에서 읽는다).
   * `rideTilesOf` 를 두 번 불러 같은지 보는 검사는 산수가 통째로 틀려도 통과한다 —
   * 손님을 실제로 태워서 `rideFrom`/`rideTo` 를 읽는다.
   */
  function rideOf(facing: 0 | 1, fault: boolean): { from: string[]; to: string[] } {
    setRideFaultForTest(fault);
    const { t, w, p } = deckedWorld();
    const r = p.place(t, w, GATE, 'slide_large', 5, 11, { facing });
    expect(r.ok, '슬라이드가 놓인다').toBe(true);
    const g = new GuestStore(t, w, p, GATE, {
      ...OPEN_GATE_DEFAULTS,
      wantUses: 1,
      useTicks: 3,
      patienceTicks: 900,
    });
    const rng = new Rng(51);
    const from = new Set<string>();
    const to = new Set<string>();
    for (let k = 0; k < 1500; k++) {
      if (k % 10 === 0) g.spawn(rng);
      g.tick(rng);
      for (const x of g.all) {
        if (x.rideTotal > 0 && x.pose === 'ride') {
          from.add(`${x.rideFrom[0]},${x.rideFrom[1]}`);
          to.add(`${x.rideTo[0]},${x.rideTo[1]}`);
        }
      }
    }
    return { from: [...from], to: [...to] };
  }

  it('★ 회전하지 않은 슬라이드 — 손님의 입출구가 표시와 같다', () => {
    const seen = rideOf(0, false);
    const mark = PlacementGrid.rideTilesOf(facilityDef('slide_large')!, 5, 11, 0)!;
    expect(seen.from).toEqual([`${mark.entry[0]},${mark.entry[1]}`]);
    expect(seen.to).toEqual([`${mark.exit[0]},${mark.exit[1]}`]);
  });

  it('★ 회전한 슬라이드 — 손님이 발자국 안에서 타고 표시와 같다', () => {
    const seen = rideOf(1, false);
    const def = facilityDef('slide_large')!;
    const mark = PlacementGrid.rideTilesOf(def, 5, 11, 1)!;
    const foot = new Set(PlacementGrid.footprintTiles(def, 5, 11, 1).map((t) => `${t[0]},${t[1]}`));
    expect(seen.from.length, '탑승이 실제로 일어났다').toBeGreaterThan(0);
    expect(seen.from).toEqual([`${mark.entry[0]},${mark.entry[1]}`]);
    expect(seen.to).toEqual([`${mark.exit[0]},${mark.exit[1]}`]);
    for (const k of [...seen.from, ...seen.to]) expect(foot.has(k), k).toBe(true);
  });

  it('대조군 — 옛 산수로 되돌리면 손님이 발자국 밖에서 탄다', () => {
    const seen = rideOf(1, true);
    const def = facilityDef('slide_large')!;
    const foot = new Set(PlacementGrid.footprintTiles(def, 5, 11, 1).map((t) => `${t[0]},${t[1]}`));
    expect(seen.from.length, '탑승이 실제로 일어났다').toBeGreaterThan(0);
    // 입구가 시설 밖이다 — 손님이 허공에서 미끄럼틀을 탄 상태
    for (const k of seen.from) expect(foot.has(k), k).toBe(false);
  });
});

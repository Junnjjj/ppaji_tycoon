import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain, GROUND_KINDS } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, facilityDef, allFacilityDefs } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';

const GATE = { i: 0, j: 0 };

/** 앞쪽 절반이 물인 지형 — 강변 파노라마의 축소판 */
function shore(w: number, h: number, waterFrom: number): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) t.paint(i, j, j >= waterFrom ? 'water_edge' : 'lawn');
  }
  return t;
}

describe('수심이 없다 — 결정 10', () => {
  it('물 종류가 하나뿐이다', () => {
    const water = GROUND_KINDS.filter((k) => !k.walkable);
    expect(water).toHaveLength(1);
    expect(water[0]?.id).toBe('water_edge');
  });

  it('시설 데이터에 수심 필드가 없다', () => {
    for (const d of allFacilityDefs()) {
      expect(d).not.toHaveProperty('minDepth');
      expect(d.placement).not.toHaveProperty('minDepth');
    }
  });
});

describe('플로팅덱이 물 위 유일 기반 — 결정 11', () => {
  it('물 위 시설 16종 중 덱·선착장만 walkOn 이다', () => {
    const water = allFacilityDefs().filter((d) => d.layer === 'water');
    expect(water).toHaveLength(16);
    const walkOn = water.filter((d) => d.walkOn).map((d) => d.id);
    expect(walkOn.sort()).toEqual(['dock', 'float_deck']);
  });

  it('덱·선착장은 이어짐을 요구하고 나머지는 덱을 요구한다', () => {
    for (const d of allFacilityDefs().filter((x) => x.layer === 'water')) {
      if (d.walkOn) {
        expect(d.placement.requiresShoreOrDeck, d.id).toBe(true);
        expect(d.placement.requiresDeck, d.id).toBeUndefined();
      } else {
        expect(d.placement.requiresDeck, d.id).toBe(true);
      }
    }
  });

  it('덱을 잔교처럼 이어 뻗을 수 있다', () => {
    const t = shore(16, 16, 8);
    const w = new WallGrid(16, 16);
    const g = new PlacementGrid(16, 16);
    for (let j = 8; j < 14; j++) {
      expect(g.place(t, w, GATE, 'float_deck', 5, j).ok, `(5,${j})`).toBe(true);
    }
    // 끊긴 자리는 거절
    expect(g.check(t, w, GATE, 'float_deck', 10, 13).fail).toBe('deck-not-connected');
  });

  it('덱 위는 손님이 걷고, 다른 물 시설은 못 걷는다', () => {
    const t = shore(16, 16, 8);
    const w = new WallGrid(16, 16);
    const g = new PlacementGrid(16, 16);
    for (let j = 8; j < 12; j++) g.place(t, w, GATE, 'float_deck', 5, j);
    expect(g.place(t, w, GATE, 'trampoline_w', 6, 8).ok).toBe(true);
    expect(g.isWalkOn(5, 10)).toBe(true);
    expect(g.blocksWalk(5, 10)).toBe(false);
    expect(g.isWalkOn(6, 8)).toBe(false);
    expect(g.blocksWalk(6, 8)).toBe(true);
  });

  it('손님이 덱을 밟고 물 위 시설까지 간다 — 덱이 없으면 못 간다', () => {
    const t = shore(20, 20, 10);
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    // 잔교를 내고 그 옆에 트램폴린
    for (let j = 10; j < 15; j++) expect(p.place(t, w, GATE, 'float_deck', 5, j).ok).toBe(true);
    const ride = p.place(t, w, GATE, 'trampoline_w', 6, 11);
    expect(ride.ok).toBe(true);

    const g = new GuestStore(t, w, p, GATE, {
      ...GUEST_DEFAULTS,
      wantUses: 1,
      useTicks: 5,
      patienceTicks: 900,
    });
    const rng = new Rng(21);
    for (let k = 0; k < 1200; k++) {
      if (k % 10 === 0) g.spawn(rng);
      g.tick(rng);
    }
    // 덱을 통해 도달했으므로 포기한 손님이 적어야 한다
    const s = g.stats();
    expect(s.exited).toBeGreaterThan(3);
    expect(s.gaveUp / s.exited).toBeLessThan(0.5);
  });
});

describe('슬라이드 입출구 — 미끄럼틀 로직이 자연스러워야 한다', () => {
  it('슬라이드 4종이 입출구와 통과 시간을 갖는다', () => {
    const rides = allFacilityDefs().filter((d) => d.ride);
    expect(rides).toHaveLength(4);
    for (const d of rides) {
      expect(d.ride!.entryTile).not.toEqual(d.ride!.exitTile);
      expect(d.ride!.traverseTicks).toBeGreaterThan(0);
      // 입출구가 발자국 안이어야 한다
      for (const t of [d.ride!.entryTile, d.ride!.exitTile]) {
        expect(t[0], d.id).toBeGreaterThanOrEqual(0);
        expect(t[1], d.id).toBeGreaterThanOrEqual(0);
        expect(t[0], d.id).toBeLessThan(d.size[0]);
        expect(t[1], d.id).toBeLessThan(d.size[1]);
      }
    }
  });

  it('손님이 입구로 들어가 출구로 나온다', () => {
    const t = shore(24, 24, 10);
    const w = new WallGrid(24, 24);
    const p = new PlacementGrid(24, 24);
    for (let j = 10; j < 16; j++) p.place(t, w, GATE, 'float_deck', 4, j);
    const r = p.place(t, w, GATE, 'slide_small', 5, 11); // 3×3
    expect(r.ok).toBe(true);
    const def = facilityDef('slide_small')!;
    const entry = [5 + def.ride!.entryTile[0], 11 + def.ride!.entryTile[1]];
    const exit = [5 + def.ride!.exitTile[0], 11 + def.ride!.exitTile[1]];

    const g = new GuestStore(t, w, p, GATE, {
      ...GUEST_DEFAULTS,
      wantUses: 1,
      useTicks: 3,
      patienceTicks: 900,
    });
    const rng = new Rng(22);
    let sawEntry = false;
    let sawRide = false;
    let sawExit = false;
    for (let k = 0; k < 1500; k++) {
      if (k % 10 === 0) g.spawn(rng);
      g.tick(rng);
      for (const x of g.all) {
        if (x.pose === 'ride') sawRide = true;
        if (x.i === entry[0] && x.j === entry[1] && x.pose === 'ride') sawEntry = true;
        if (x.i === exit[0] && x.j === exit[1] && x.rideTotal > 0) sawExit = true;
      }
    }
    expect(sawRide, '탑승 포즈').toBe(true);
    expect(sawEntry, '입구 통과').toBe(true);
    expect(sawExit, '출구 도착').toBe(true);
  });

  it('탑승 중에는 실제로 움직인다 — 서 있기만 하면 로직이 아니다', () => {
    const t = shore(24, 24, 10);
    const w = new WallGrid(24, 24);
    const p = new PlacementGrid(24, 24);
    for (let j = 10; j < 16; j++) p.place(t, w, GATE, 'float_deck', 4, j);
    p.place(t, w, GATE, 'slide_large', 5, 11); // 4×5
    const g = new GuestStore(t, w, p, GATE, {
      ...GUEST_DEFAULTS,
      wantUses: 1,
      useTicks: 3,
      patienceTicks: 900,
    });
    const rng = new Rng(23);
    const seen = new Set<string>();
    for (let k = 0; k < 1500; k++) {
      if (k % 10 === 0) g.spawn(rng);
      g.tick(rng);
      for (const x of g.all) if (x.pose === 'ride') seen.add(`${x.i},${x.j}`);
    }
    // 탑승 중 두 칸 이상을 지나야 한다
    expect(seen.size).toBeGreaterThan(1);
  });
});

import { describe, it, expect } from 'vitest';
import { Grid, FLOOR, MAX_LEVEL, landRect, gateTile, isLandFloor, isWaterCode, shoreRow } from './grid.js';
import { Game, FACILITY_DEFS } from './game.js';

/** P0-B — 높이: 강 계곡 · 단차 ≤1 · 물 0 · 경사 배치 거절 · 왕복 */
describe('P0-B 높이', () => {
  it('새 판의 모든 4이웃 단차는 1 이하 · P57-h 부터 새 판은 평지(능선 끔 — 최고 단 0; HILLS_ENABLED 로 되돌린다)', () => {
    for (const rank of [0, 3, 5]) {
      const g = Grid.newPark(rank);
      let maxZ = 0;
      for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
        const z = g.levelAt(i, j); maxZ = Math.max(maxZ, z);
        if (i + 1 < g.w) expect(Math.abs(z - g.levelAt(i + 1, j))).toBeLessThanOrEqual(1);
        if (j + 1 < g.h) expect(Math.abs(z - g.levelAt(i, j + 1))).toBeLessThanOrEqual(1);
      }
      expect(maxZ).toBe(0); // P57-h
    }
    expect(MAX_LEVEL).toBe(3); // 단 체계 자체는 남아 있다(setLevel·level-mixed)
  });

  it('강·여울은 언제나 0 이고 입구 열은 강까지 평지다', () => {
    const g = Grid.newPark(0);
    const gate = gateTile(0);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (isWaterCode(g.naturalAt(i, j))) expect(g.levelAt(i, j)).toBe(0); // P48-b3: 본류가 S 라 행이 아니라 물 칸 전부
    for (let j = gate.j; j < shoreRow(gate.i); j++) expect(g.levelAt(gate.i, j)).toBe(0); // 입구 열은 물가까지 평지
    // 물을 칠하면 단이 0 으로 내려간다
    const land = landRect(0);
    const i = 3, j = land.j0 + 6; g.setLevel(i, j, 1); // P57-h: 새 판이 평지라 단을 하나 만들어 잰다
    expect(g.levelAt(i, j)).toBeGreaterThan(0);
    g.set(i, j, FLOOR.pool);
    expect(g.levelAt(i, j)).toBe(0);
  });

  it('단이 섞인 발자국에는 시설을 못 놓는다 (level-mixed)', () => {
    const g = new Game(5, undefined, { kit: false });
    g.money = 100000;
    const grid = g.grid;
    // 2×2 자리 중 단이 섞인 첫 자리를 찾는다 (토지 안, 잔디)
    g.rank = 5; g.openLand(5); // P14: 산기슭(지도 양옆)이 토지 안에 들어오게 5랭크로 연다
    const land = landRect(5);
    grid.setLevel(land.i0 + 4, land.j0 + 6, 1); // P57-h: 새 판이 평지라 2×2 안에 단차를 하나 만든다
    let found: { i: number; j: number } | null = null;
    for (let j = land.j0 + 2; j < land.j0 + land.h - 2 && !found; j++) for (let i = land.i0; i < land.i0 + land.w - 2 && !found; i++) {
      const tiles = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const;
      if (tiles.every(([a, b]) => isLandFloor(grid.at(a, b)) && !g.facilities.occupied(a, b)) && !grid.levelUniform(i, j, 2, 2)) found = { i, j }; // P44: 절벽 테두리는 암반(잔디와 같은 성질)
    }
    expect(found).not.toBeNull();
    const sq = [...FACILITY_DEFS.values()].find((d) => d.w === 2 && d.d === 2 && !d.indoorOnly)!;
    g.unlocked.facilities.add(sq.id);
    const r = g.canPlace(sq.id, found!.i, found!.j, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('경사');
    // 평지 2×2 는 놓인다
    let flat: { i: number; j: number } | null = null;
    for (let j = land.j0 + 2; j < land.j0 + land.h - 2 && !flat; j++) for (let i = land.i0; i < land.i0 + land.w - 2 && !flat; i++) {
      if (grid.levelUniform(i, j, 2, 2) && g.canPlace(sq.id, i, j, 0).ok) flat = { i, j };
    }
    expect(flat).not.toBeNull();
  });

  it('높이는 스냅샷을 왕복한다', () => {
    const g = new Game(9);
    const s = JSON.parse(JSON.stringify(g.toSnapshot()));
    expect(s.grid.levels.length).toBe(g.grid.levels.length);
    const h = Game.fromSnapshot(s);
    expect(Array.from(h.grid.levels)).toEqual(Array.from(g.grid.levels));
  });

  it('시작 킷 시설은 전부 놓이고 입구에서 닿는다', () => {
    const g = new Game(1);
    expect(g.facilities.all.length).toBe(7); // P45-a D57: 매표 창구·분식·화장실(실내) · 자판기 · 평상 2 · 선착장 — 킷은 거의 안 준다
    g.step(600);
    expect(g.guests.all.length).toBeGreaterThan(0);
  });
});

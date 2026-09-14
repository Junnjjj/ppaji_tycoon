import { describe, it, expect } from 'vitest';
import { GRID_W, GRID_H, FLOOR, Grid, landRect, gateTile, inRect, LAND_BY_RANK } from './grid.js';

describe('격자·토지', () => {
  it('64×48 이고 토지는 랭크마다 단조 증가한다', () => {
    expect(GRID_W).toBe(64);
    expect(GRID_H).toBe(48);
    for (let r = 1; r < LAND_BY_RANK.length; r++) {
      const a = landRect(r - 1);
      const b = landRect(r);
      expect(b.w).toBeGreaterThan(a.w);
      expect(b.h).toBeGreaterThan(a.h);
      // 아래 변이 격자 아래 변에 붙어 있다 — 입구가 옮겨지지 않는 근거
      expect(a.j0 + a.h).toBe(GRID_H);
      expect(b.j0 + b.h).toBe(GRID_H);
    }
    expect(landRect(5)).toEqual({ i0: 0, j0: 0, w: 64, h: 48 });
  });

  it('입구 열이 랭크와 무관하게 같다', () => {
    const cols = new Set(LAND_BY_RANK.map((_, r) => gateTile(r).i));
    expect(cols.size).toBe(1);
    for (let r = 0; r < LAND_BY_RANK.length; r++) expect(inRect(landRect(r), gateTile(r).i, gateTile(r).j)).toBe(true);
  });

  it('새 판은 토지 안 잔디 · 밖 모래 · 입구에서 위로 포장 한 줄', () => {
    const g = Grid.newPark(0);
    const land = landRect(0);
    const gate = gateTile(0);
    expect(g.at(gate.i, gate.j)).toBe(FLOOR.path);
    expect(g.at(gate.i, land.j0)).toBe(FLOOR.path);
    expect(g.at(land.i0, land.j0)).toBe(FLOOR.grass);
    expect(g.at(0, 0)).toBe(FLOOR.sand);
    expect(g.at(-1, 0)).toBe(FLOOR.sand); // 격자 밖은 모래로 답한다
  });
});

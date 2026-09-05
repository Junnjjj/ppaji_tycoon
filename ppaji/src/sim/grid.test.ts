import { describe, it, expect } from 'vitest';
import { GRID_W, GRID_H, FLOOR, Grid, landRect, gateTile, inRect, LAND_BY_RANK, RIVER } from './grid.js';

describe('격자·토지', () => {
  it('64×48 이고 토지는 랭크마다 단조 증가한다', () => {
    expect(GRID_W).toBe(64);
    expect(GRID_H).toBe(48);
    for (let r = 1; r < LAND_BY_RANK.length; r++) {
      const a = landRect(r - 1);
      const b = landRect(r);
      expect(b.w).toBeGreaterThan(a.w);
      expect(b.h).toBe(a.h); // P14: 토지는 폭만 자란다 (레거시)
      // 아래 변이 격자 아래 변에 붙어 있다 — 입구가 옮겨지지 않는 근거
      expect(a.j0 + a.h).toBe(RIVER.j0); // P15: 토지 아래 변이 물가
      expect(b.j0 + b.h).toBe(RIVER.j0);
    }
    expect(landRect(5)).toEqual({ i0: 0, j0: 0, w: 64, h: 26 }); // P15: 뭍 26줄(위), 아래 22줄은 물
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
    // P15: 입구(위)에서 물가까지 포장 한 줄, 토지 아래는 물(여울 26 · 강 27), 물가 두 줄(24·25)은 석재 보도
    expect(g.at(gate.i, land.j0 + land.h)).toBe(FLOOR.shallow);
    expect(g.at(gate.i, land.j0 + land.h + 1)).toBe(FLOOR.river);
    expect(g.at(gate.i + 3, land.j0 + land.h - 1)).toBe(FLOOR.path);
    expect(g.at(gate.i + 3, land.j0 + land.h - 2)).toBe(FLOOR.path);
    expect(g.at(gate.i + 3, land.j0 + 2)).toBe(FLOOR.grass);
    expect(g.at(land.i0, land.j0 + 2)).toBe(FLOOR.grass);
    expect(g.at(0, 0)).toBe(FLOOR.sand); // 토지 밖 뭍은 모래
    expect(g.at(0, 47)).toBe(FLOOR.river); // P15: 지도 아래는 강
    expect(g.at(-1, 0)).toBe(FLOOR.sand); // 격자 밖은 모래로 답한다
  });
});

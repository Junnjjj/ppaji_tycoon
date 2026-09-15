import { describe, it, expect } from 'vitest';
import { GRID_W, GRID_H, FLOOR, Grid, landRect, gateTile, inRect, LAND_BY_RANK, RIVER, CITY_BAND, GATE_I, ROAD_ROWS, STOP_ROW, shoreRow } from './grid.js';

describe('격자·토지', () => {
  it('P43 96×72 — 도시 띠 8 · 마당 42 · 강 22, 토지는 랭크마다 줄지 않고 폭만 자란다', () => {
    expect(GRID_W).toBe(96);
    expect(GRID_H).toBe(72);
    expect(CITY_BAND + 42 + RIVER.h).toBe(GRID_H);
    expect(RIVER.j0).toBe(CITY_BAND + 42);
    for (let r = 1; r < LAND_BY_RANK.length; r++) {
      const a = landRect(r - 1);
      const b = landRect(r);
      expect(b.w).toBeGreaterThan(a.w);
      expect(b.h).toBe(a.h); // 토지는 폭만 자란다 (레거시)
      expect(a.j0 + a.h).toBe(RIVER.j0); // 토지 아래 변이 물가
      expect(b.j0).toBe(CITY_BAND); // 위 변은 도시 띠 바로 아래
    }
    expect(landRect(0)).toEqual({ i0: 28, j0: 8, w: 40, h: 42 }); // P45-a: ★0 40 — 출입동 20×30 이 정문 가운데
    expect(landRect(5)).toEqual({ i0: 0, j0: 8, w: 96, h: 42 }); // ★5 = 지도 전폭
  });

  it('입구 열이 랭크와 무관하게 가운데(48)다', () => {
    const cols = new Set(LAND_BY_RANK.map((_, r) => gateTile(r).i));
    expect(cols.size).toBe(1);
    expect(gateTile(3).i).toBe(GATE_I);
    for (let r = 0; r < LAND_BY_RANK.length; r++) expect(inRect(landRect(r), gateTile(r).i, gateTile(r).j)).toBe(true);
  });

  it('새 판은 도시 띠(차도 2·정류장·모래 광장) · 마당 안팎 잔디 · 입구에서 물가까지 포장 한 줄', () => {
    const g = Grid.newPark(0);
    const land = landRect(0);
    const gate = gateTile(0);
    expect(g.at(gate.i, gate.j)).toBe(FLOOR.path);
    for (const j of ROAD_ROWS) { expect(g.at(0, j)).toBe(FLOOR.road); expect(g.at(gate.i, j)).toBe(FLOOR.road); }
    expect(g.at(gate.i, STOP_ROW)).toBe(FLOOR.sidewalk);
    expect(g.at(gate.i, gate.j - 1)).toBe(FLOOR.sand); // 광장은 걷지 않는다 — 손님은 입구 칸에 나타난다
    expect(g.at(gate.i, shoreRow(gate.i))).toBe(FLOOR.shallow); // P48-b3: 물가는 열마다 다르다 — 입구 열은 행 24
    expect(g.at(gate.i, shoreRow(gate.i) + 2)).toBe(FLOOR.river);
    expect(g.at(gate.i + 3, shoreRow(gate.i + 3) - 1)).toBe(FLOOR.path);
    expect(g.at(gate.i + 3, shoreRow(gate.i + 3) - 2)).toBe(FLOOR.path);
    expect(g.at(gate.i + 3, land.j0 + 2)).toBe(FLOOR.grass);
    expect(g.at(land.i0, land.j0 + 2)).toBe(FLOOR.grass);
    expect([FLOOR.grass, FLOOR.rock]).toContain(g.at(land.i0 - 1, land.j0 + 2)); // P44: 토지 밖 뭍은 들판(잔디, 절벽 테두리는 암반)
    expect(g.at(0, GRID_H - 1)).toBe(FLOOR.river); // 지도 아래는 강
    expect(g.at(-1, 0)).toBe(FLOOR.sand); // 격자 밖은 모래로 답한다
  });

  it('P44 언덕 → P57-h 평지(능선 끔: 암반 0 · 최고 단 0) — 울타리는 없다(P44-c)', () => {
    const g = Grid.newPark(0);
    const land = landRect(0);
    expect(g.canCross(land.i0, land.j0 + 5, land.i0 - 1, land.j0 + 5)).toBe(true);
    let rock = 0, maxZ = 0;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { if (g.at(i, j) === FLOOR.rock) rock++; maxZ = Math.max(maxZ, g.levelAt(i, j)); expect(g.levelAt(i, j) * (i === 0 || i === g.w - 1 ? 1 : 0)).toBe(0); }
    expect(rock).toBe(0); // P57-h
    expect(maxZ).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { Grid, FLOOR, RIVER, LAND_J0, GATE_I, landRect, isWalkFloor, isWaterCode, MAIN, shoreRow, mainBank, BEND } from './grid.js';

/**
 * P48-b1 → P48-b3 — 본류 S 띠 (사용자 빨간 선, 2026-09-07). 북안 `shoreRow(i)` 가 왼쪽 행 50 → 건물 앞 행 24 → 오른쪽 행 50 이고 띠 폭은 `MAIN.width`.
 * 마당 = 토지 사각형 안 뭍 중 입구에서 뭍으로 닿는 칸(`yardAt`) — 띠 아래 가운데 뭍은 건너편이다. 다리는 없다(W3).
 */
const bfsFrom = (g: Grid, start: { i: number; j: number }): Map<number, number> => {
  const dist = new Map<number, number>(); const q: [number, number][] = [[start.i, start.j]]; dist.set(start.j * g.w + start.i, 0);
  for (let h = 0; h < q.length; h++) { const [i, j] = q[h]!; const d = dist.get(j * g.w + i)!; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as const) { if (!g.inside(a, b) || !isWalkFloor(g.at(a, b)) || !g.canCross(i, j, a, b)) continue; const k = b * g.w + a; if (dist.has(k)) continue; dist.set(k, d + 1); q.push([a, b]); } }
  return dist;
};

describe('P48-b3 본류 S 띠', () => {
  const g = Grid.newPark(0);
  const land = landRect(0);
  it('북안 — 양끝은 행 50(옛 자리) · 건물 앞(열 45~59)은 행 24 로 편평 · 양옆은 단조롭게 내려간다 · 띠 폭은 열마다 정확히 width', () => {
    expect(shoreRow(0)).toBe(RIVER.j0); expect(shoreRow(g.w - 1)).toBe(RIVER.j0);
    for (let i = 45; i <= 59; i++) expect(shoreRow(i)).toBe(24);
    for (let i = 1; i < 45; i++) expect(shoreRow(i)).toBeLessThanOrEqual(shoreRow(i - 1));
    for (let i = 60; i < g.w; i++) expect(shoreRow(i)).toBeGreaterThanOrEqual(shoreRow(i - 1));
    for (let i = 0; i < g.w; i++) { let n = 0, first = -1; for (let j = LAND_J0 + 1; j < g.h; j++) if (isWaterCode(g.naturalAt(i, j))) { n++; if (first < 0) first = j; } expect(first).toBe(shoreRow(i)); expect(n).toBe(Math.min(MAIN.width, g.h - shoreRow(i))); }
    expect(Math.abs(mainBank(52) - 24)).toBeLessThan(0.5);
  });
  it('여울 — 뭍에 닿은 물은 여울이고 북안은 두 줄 · 물 칸은 단 0 · 도시 띠 위 물 0 · 격자 변의 물은 행 50~71 뿐(지도 밖 Surround 무변경)', () => {
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const c = g.naturalAt(i, j); if (!isWaterCode(c)) continue;
      expect(g.levelAt(i, j)).toBe(0); expect(j).toBeGreaterThan(LAND_J0);
      const land4 = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => g.inside(i + a, j + b) && !isWaterCode(g.naturalAt(i + a, j + b)));
      if (land4 || j === shoreRow(i) + 1) expect(c).toBe(FLOOR.shallow);
      if (i === 0 || i === g.w - 1) { expect(j).toBeGreaterThanOrEqual(RIVER.j0); expect(j).toBeLessThan(RIVER.j0 + RIVER.h); }
    }
  });
  it('입구 열(48) — 정문에서 물가(행 23)까지 포장, 행 24 부터 width 줄 물 · 다리는 없다(W3) · 킷 링 자리 6×6 은 전부 물이고 그 위 행 23 은 뭍', () => {
    for (let j = LAND_J0; j < shoreRow(GATE_I); j++) expect(g.at(GATE_I, j)).toBe(FLOOR.path);
    for (let j = shoreRow(GATE_I); j < shoreRow(GATE_I) + MAIN.width; j++) expect(isWaterCode(g.at(GATE_I, j))).toBe(true);
    for (let j = BEND.head.j0; j < BEND.head.j0 + BEND.head.h; j++) for (let i = BEND.head.i0; i < BEND.head.i0 + BEND.head.w; i++) expect(isWaterCode(g.at(i, j))).toBe(true);
    for (let i = BEND.head.i0; i < BEND.head.i0 + BEND.head.w; i++) expect(isWaterCode(g.at(i, BEND.head.j0 - 1))).toBe(false);
  });
  it('마당 — 사각형 안 뭍 중 yardAt 인 칸은 입구에서 전부 닿고(④), 건너편(띠 아래 가운데)은 yardAt 이 아니다 · 마당 ≥ 450칸 · 물가 뭍(마당 ∧ 물에 4이웃) ≥ 40', () => {
    const d = bfsFrom(g, { i: GATE_I, j: LAND_J0 });
    let yard = 0, reach = 0, far = 0, shore = 0;
    for (let j = land.j0; j < land.j0 + land.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) {
      if (isWaterCode(g.naturalAt(i, j))) continue;
      if (g.yardAt(land, i, j)) { yard++; if (d.has(j * g.w + i)) reach++; if (([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => isWaterCode(g.naturalAt(i + a, j + b)))) shore++; }
      else { far++; expect(d.has(j * g.w + i)).toBe(false); }
    }
    expect(reach).toBe(yard); expect(yard).toBeGreaterThanOrEqual(450); expect(far).toBeGreaterThan(50); expect(shore).toBeGreaterThanOrEqual(40);
    expect(g.yardAt(land, 50, 47)).toBe(false); // 옛 남쪽 평상 자리 — 이제 건너편
  });
  it('물가 거리 — 북안 첫 물 칸은 1, 한 줄 아래는 2, 건너편에 닿은 물이라도 마당에서 잰다 · 토지 열 밖 물은 −1', () => {
    expect(g.shoreDist(land, GATE_I, 24)).toBe(1); expect(g.shoreDist(land, GATE_I, 25)).toBe(2); expect(g.shoreDist(land, GATE_I, 31)).toBe(8);
    expect(g.shoreDist(land, 10, 55)).toBeGreaterThan(0); // 토지 밖이라도 물 위 거리는 잰다 — 소유는 inLandOrWater 가 열로 거른다
    expect(g.shoreDist(land, 30, 20)).toBe(-1);
  });
});

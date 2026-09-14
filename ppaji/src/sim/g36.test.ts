import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { FacilityStore } from './facility.js';
import { DAYS_PER_SEASON } from './clock.js';
import { makeTestPpaji } from './test-helpers.js';

function fresh(seed: number): Game { const g = new Game(seed, undefined, { kit: false }); g.money = 500000; return g; }

describe('G36 계절 벡터 · 실내 전용 · AB 출구', () => {
  it('사우나의 계절 벡터가 파크 인기에 계절마다 다르게 더해진다', () => {
    const g = fresh(51);
    g.grid.levels.fill(0); // 온수 족욕 3×1 이 테라스에 걸린다 — 이 검사는 계절 벡터만 본다
    const gt = g.gate;
    g.unlocked.facilities.add('footbath');
    expect(g.placeFacility('footbath', gt.i + 2, gt.j + 4, 0).ok).toBe(true);
    const def = FACILITY_DEFS.get('footbath')!;
    const byDay = (day: number): number => { g.day = day; return g.parkPopularity(); };
    const spring = byDay(0); const winter = byDay(3 * DAYS_PER_SEASON);
    expect(winter - spring).toBe((def.season[3] ?? 0) - (def.season[0] ?? 0));
  });
  it('실내 전용 시설은 실내 바닥 밖에 못 놓는다', () => {
    const g = fresh(52);
    g.grid.levels.fill(0); // 사우나 3×3 이 테라스에 걸린다 — 이 검사는 실내 규칙만 본다
    const gt = g.gate;
    g.unlocked.facilities.add('sauna');
    const r = g.canPlace('sauna', gt.i + 2, gt.j + 4, 0);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain('실내');
    const def = FACILITY_DEFS.get('sauna')!;
    const fp = FacilityStore.footprint(def, gt.i + 2, gt.j + 6, 0);
    expect(g.paintIndoor(fp).ok).toBe(true);
    expect(g.canPlace('sauna', gt.i + 2, gt.j + 6, 0).ok).toBe(true);
  });
  it('슬라이드 AB 는 출구 다음 칸이 그 풀일 때만', () => {
    const g = fresh(53);
    g.grid.levels.fill(0); // P0-B: 이 검사는 착수 규칙만 본다 — 경사는 평탄화
    const gt = g.gate;
    g.rank = 2; g.openLand(2); g.unlocked.facilities.add('stripy_slide');
    const def = FACILITY_DEFS.get('stripy_slide')!;
    const L = def.slide!.length;
    // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로. 풀은 강 위 데크 링 안에만 있으므로 두 빠지를 나란히 두고 슬라이드를 그 데크 위에 놓는다:
    //  · 착수 빠지(pp1): 링 서쪽 열이 입구 열(gt.i) — 활강로(+I, 길이 L) 의 출구가 그 열의 데크에 서고, 출구 다음 칸(+I) 이 pp1 의 안 물이다
    //  · 옆 빠지(pp2): 링 윗줄(물가 행)이 활강로가 달리는 줄 — 안 물이 활강로 바로 아래 줄이라 인접하지만 출구 다음 칸은 아니다
    //  탑(2×2)은 pp2 윗줄 위 뭍 한 줄 + 윗줄 데크 한 줄에 걸친다. (pp2 윗줄·pp1 서쪽 열·뭍 사이의 물도 저절로 밀폐돼 셋째 수역이 하나 더 생긴다 — 이 검사와 무관)
    const pp1 = makeTestPpaji(g, 4, 5, L - 8);
    const pp2 = makeTestPpaji(g, L - 1, 2, -9);
    expect(pp1.id).not.toBeNull(); expect(pp2.id).not.toBeNull(); expect(pp1.id).not.toBe(pp2.id);
    const laneRow = pp2.ring[0]!.j; // pp2 링 윗줄 = 활강로 줄
    const si = gt.i - 9, sj = laneRow - 1;
    const placed = g.placeFacility('stripy_slide', si, sj, 0);
    expect(placed.ok).toBe(true);
    const lane = FacilityStore.lane(def, si, sj, 0);
    const exit = lane[lane.length - 1]!;
    expect(lane.every((t) => t.j === laneRow)).toBe(true);
    // 착수: 출구 다음 칸(+I) 이 pp1 안 물 — 옆: pp2 안 물이 활강로 칸 바로 아래(+J) 라 인접하되 출구 다음 칸은 아니다
    expect(pp1.tiles.some((t) => t.i === exit.i + 1 && t.j === exit.j)).toBe(true);
    expect(pp2.tiles.some((t) => t.i === exit.i + 1 && t.j === exit.j)).toBe(false);
    expect(lane.some((l) => pp2.tiles.some((t) => t.i === l.i && t.j === l.j + 1))).toBe(true);
    const landing = g.pools.at(pp1.tiles[0]!.i, pp1.tiles[0]!.j)!;
    const beside = g.pools.at(pp2.tiles[0]!.i, pp2.tiles[0]!.j)!;
    expect(landing.id).not.toBe(beside.id);
    // 인접 판정이 실제로 둘 다 슬라이드를 보고 있어야 「옆은 0」이 공허하지 않다
    expect(g.facilities.adjacentTo(new Set(landing.tiles)).some((f) => f.uid === placed.uid)).toBe(true);
    expect(g.facilities.adjacentTo(new Set(beside.tiles)).some((f) => f.uid === placed.uid)).toBe(true);
    expect(g.poolState(landing.id)!.ab).toBeGreaterThan(0);
    expect(g.poolState(beside.id)!.ab).toBe(0);
  });
});

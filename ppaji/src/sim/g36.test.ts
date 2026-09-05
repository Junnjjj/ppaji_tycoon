import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { FacilityStore } from './facility.js';
import { DAYS_PER_SEASON } from './clock.js';

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
    g.rank = 2; g.grid.openLand(2); g.unlocked.facilities.add('stripy_slide'); // P16: 레인이 입구 열(유일한 길)을 끊지 않게 오른쪽에 둔다
    const def = FACILITY_DEFS.get('stripy_slide')!;
    const si = gt.i + 2, sj = gt.j + 9;
    expect(g.placeFacility('stripy_slide', si, sj, 0).ok).toBe(true);
    const lane = FacilityStore.lane(def, si, sj, 0);
    const exit = lane[lane.length - 1]!;
    // 착수 풀 (출구 다음 칸 포함)
    const land = [] as { i: number; j: number }[];
    for (let a = 1; a <= 2; a++) for (let b = 0; b <= 1; b++) land.push({ i: exit.i + a, j: exit.j + b });
    expect(g.digPool(land).ok).toBe(true);
    // 활강로 옆에 붙은 풀 (착수 아님)
    const side = [] as { i: number; j: number }[];
    for (let k = 1; k <= 2; k++) side.push({ i: lane[k]!.i, j: lane[k]!.j - 2 }, { i: lane[k]!.i, j: lane[k]!.j - 3 });
    // 활강로 j = sj+1 이므로 j-2 = sj-1 은 활강로와 인접하지 않는다 → 인접하게 j-1
    const side2 = side.map((t) => ({ i: t.i, j: t.j + 1 }));
    expect(g.digPool(side2).ok).toBe(true);
    const pools = g.pools.all;
    const landing = pools.find((p) => p.tiles.includes(land[0]!.j * g.grid.w + land[0]!.i))!;
    const beside = pools.find((p) => p.tiles.includes(side2[0]!.j * g.grid.w + side2[0]!.i))!;
    expect(landing.id).not.toBe(beside.id);
    expect(g.poolState(landing.id)!.ab).toBeGreaterThan(0);
    expect(g.poolState(beside.id)!.ab).toBe(0);
  });
});

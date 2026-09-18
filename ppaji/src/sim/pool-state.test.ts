import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { makeTestPpaji } from './test-helpers.js';
import { sizeScale } from './pool-state.js';

/** P60-a (D71): 색·향·소품은 게임에서 뺐다 — 남는 파생 상태는 크기·인기·유지비·SE/AB·계절 수온 */
describe('풀 파생 상태', () => {
  it('sizeScale — √size, 상한 6', () => {
    expect(sizeScale(1)).toBe(1);
    expect(sizeScale(4)).toBe(2);
    expect(sizeScale(16)).toBe(4);
    expect(sizeScale(100)).toBe(6);
  });
  it('수온은 계절 기온에서 파생되고 이상 수온·적합도가 같이 나온다 (색·향 필드는 없다)', () => {
    const g = new Game(1, undefined, { kit: false });
    const pp = makeTestPpaji(g, 2, 2);
    const id = pp.id!;
    const st = g.poolState(id)!;
    expect(st.size).toBe(4);
    expect(st.temp).toBeGreaterThanOrEqual(0);
    expect(st.temp).toBeLessThanOrEqual(50);
    expect(st.detail.idealTemp).toBeGreaterThan(0);
    expect(st.detail.tempFit).toBeGreaterThanOrEqual(0);
    expect(st.detail.tempFit).toBeLessThanOrEqual(1);
    expect(st.seasonBonus).toBe(0);
    expect('color' in st).toBe(false);
    expect('scent' in st).toBe(false);
  });
  it('인접한 족욕탕이 SE 를, 두 번째 족욕탕이 열을 준다', () => {
    const g = new Game(1, undefined, { kit: false });
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    const id = pp.id!;
    const base = g.poolState(id)!;
    // P49-b D59: 인접 시설은 링(데크) 위에 — 안 물에 4이웃으로 닿는 칸은 링뿐이다(뭍은 링 윗줄 너머라 안 닿는다). 윗줄은 뭍에 붙어 있어 3×1 을 놓아도 링이 안 끊긴다
    const { i: a, j: b } = pp.tiles[0]!; // 안 물 좌상단 — 윗줄 b−1 · 아랫줄 b+5
    g.unlocked.facilities.add('footbath'); // P49-a1: 다이빙대는 rig(데크 위에만)가 됐다 — SE 를 주는 시설은 족욕탕(se 5)
    expect(g.placeFacility('footbath', a, b - 1).ok).toBe(true); // 윗줄(링) 위 3×1
    const withJet = g.poolState(id)!;
    expect(withJet.se).toBeGreaterThan(base.se);
    g.unlocked.facilities.add('footbath');
    expect(g.placeFacility('footbath', a, b + 5).ok).toBe(true); // 아랫줄(링) 위 3×1 — 양 끝 칸이 남아 옆 벽으로 이어진다
    expect(g.poolState(id)!.temp).toBe(withJet.temp + 4);
  });
});

import { describe, it, expect } from 'vitest';
import { TICKS_PER_DAY } from './clock.js';
import { Game, ITEM_DEFS } from './game.js';
import { landRect } from './grid.js';
import { sizeScale } from './pool-state.js';

const sq = (i: number, j: number, n = 2) => {
  const out: { i: number; j: number }[] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) out.push({ i: i + a, j: j + b });
  return out;
};

describe('풀 파생 상태', () => {
  it('sizeScale — √size, 상한 6', () => {
    expect(sizeScale(1)).toBe(1);
    expect(sizeScale(4)).toBe(2);
    expect(sizeScale(16)).toBe(4);
    expect(sizeScale(100)).toBe(6);
  });
  it('딸기를 넣으면 핑크 · 베리 · 온도 −2 · 봄이라 인기 보너스', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    g.digPool(sq(l.i0 + 4, l.j0 + 4));
    const id = g.pools.all[0]!.id;
    const before = g.poolState(id)!;
    expect(before.color).toBe('clear');
    expect(g.putItem(id, 'strawberry').ok).toBe(true);
    const st = g.poolState(id)!;
    expect(st.color).toBe('pink');
    expect(st.scent).toBe('berry');
    expect(st.temp).toBe(before.temp + (ITEM_DEFS.get('strawberry')!.tempDelta));
    expect(st.popularity).toBeGreaterThan(before.popularity); // 봄: pink 5 + berry 2
    expect(st.seasonBonus).toBe(7);
  });
  it('아이템은 시간이 지나면 사라진다', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    g.digPool(sq(l.i0 + 4, l.j0 + 4));
    const id = g.pools.all[0]!.id;
    g.putItem(id, 'lemon');
    const days = ITEM_DEFS.get('lemon')!.days;
    g.step(days * TICKS_PER_DAY); // 7일째 폐장까지 산다
    expect(g.pools.byId(id)!.items.length).toBe(1);
    g.step(TICKS_PER_DAY);
    expect(g.pools.byId(id)!.items.length).toBe(0);
    expect(g.poolState(id)!.color).toBe('clear');
  });
  it('20개 상한 · 잠긴 아이템 거절', () => {
    const g = new Game(1, undefined, { kit: false });
    g.money = 1_000_000;
    const l = landRect(0);
    g.digPool(sq(l.i0 + 4, l.j0 + 4));
    const id = g.pools.all[0]!.id;
    expect(g.putItem(id, 'coconut').ok).toBe(false);
    for (let k = 0; k < 20; k++) expect(g.putItem(id, 'lemon').ok).toBe(true);
    expect(g.putItem(id, 'lemon').ok).toBe(false);
  });
  it('인접한 제트풀이 SE 를, 핫텁이 열을 준다', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    g.digPool(sq(l.i0 + 4, l.j0 + 4));
    const id = g.pools.all[0]!.id;
    const base = g.poolState(id)!;
    g.unlocked.facilities.add('jetted_pool'); // ★1 보상 (G43)
    expect(g.placeFacility('jetted_pool', l.i0 + 6, l.j0 + 4).ok).toBe(true);
    const withJet = g.poolState(id)!;
    expect(withJet.se).toBeGreaterThan(base.se);
    g.unlocked.facilities.add('hot_tub');
    expect(g.placeFacility('hot_tub', l.i0 + 3, l.j0 + 4).ok).toBe(true);
    expect(g.poolState(id)!.temp).toBe(withJet.temp + 4);
  });
});

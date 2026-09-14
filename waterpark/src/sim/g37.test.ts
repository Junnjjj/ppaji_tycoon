import { describe, it, expect } from 'vitest';
import { Game, EMERGENCY_FUND } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

describe('G37 타일 갈기 · 비상 자금', () => {
  it('retilePool — 해금한 타일로 풀 전체를 갈면 인기가 오르고 비용이 나간다, 같은 타일이면 거절', () => {
    const g = new Game(61, undefined, { kit: false });
    g.money = 100000;
    const gt = g.gate;
    g.digPool([{ i: gt.i - 2, j: gt.j - 4 }, { i: gt.i - 1, j: gt.j - 4 }, { i: gt.i - 2, j: gt.j - 5 }, { i: gt.i - 1, j: gt.j - 5 }]);
    const p = g.pools.all[0]!;
    const pop0 = g.poolState(p.id)!.popularity;
    expect(g.retilePool(p.id, 'kairo').ok).toBe(false); // 미해금
    g.unlocked.tiles.add('kairo');
    const m0 = g.money;
    expect(g.retilePool(p.id, 'kairo').ok).toBe(true);
    expect(m0 - g.money).toBe(g.retileCost(p.id, 'kairo'));
    expect(g.poolState(p.id)!.popularity).toBeGreaterThan(pop0);
    expect(g.retilePool(p.id, 'kairo').ok).toBe(false); // 이미 그 타일
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.poolState(p.id)!.popularity).toBe(g.poolState(p.id)!.popularity);
  });
  it('폐장에 잔고가 음수면 2,000G 로 채우고 횟수를 센다', () => {
    const g = new Game(62, undefined, { kit: false });
    g.money = 10;
    g.unlocked.facilities.add('toilet');
    g.money = 5000; g.placeFacility('toilet', g.gate.i + 2, g.gate.j - 3, 0); g.money = 10;
    g.tick = TICKS_PER_DAY - 1;
    g.step();
    expect(g.money).toBe(EMERGENCY_FUND);
    expect(g.stats.bailouts).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot } from './bot.js';

function fresh(seed = 11): Game {
  const g = new Game(seed, undefined, { kit: false });
  g.money = 200000;
  return g;
}

describe('G30 후반 곡선', () => {
  it('유지비는 랭크마다 ×maintRankMul · 티켓은 만족 레벨로 오른다 · 지출이 누적된다', () => {
    const g = fresh();
    g.grid.levels.fill(0); // 화장실 2×2 가 입구 옆 테라스에 걸린다 — 이 검사는 유지비만 본다
    const gt = g.gate;
    g.unlocked.facilities.add('toilet');
    g.placeFacility('toilet', gt.i + 2, gt.j + 3, 0);
    const m0 = g.dailyMaintenance();
    g.rank = 3;
    expect(g.dailyMaintenance()).toBe(Math.round(m0 * Math.pow(g.b.maintRankMul ?? 1, 3)));
    g.rank = 0;
    expect(g.ticketFor(null)).toBe(g.b.ticketBase);
    g.prevSatAvg = 100;
    expect(g.ticketFor(null)).toBe(Math.round((g.b.ticketBase * (1 + 3 * (g.b.ticketSatStep ?? 0))) / 10) * 10);
    expect(g.stats.spent).toBeGreaterThan(0);
    const snap = JSON.parse(JSON.stringify(g.toSnapshot()));
    const h = Game.fromSnapshot(snap);
    expect(h.stats.spent).toBe(g.stats.spent);
    expect(h.prevSatAvg).toBe(100);
  });
  it('봇 128일 — 후반(5~8년차) 지출 비율이 잡힌다', () => {
    const m = runBot(new Game(2), 128);
    expect(m.lateSpendRatio).toBeGreaterThan(0.1);
    expect(m.lateSpendRatio).toBeLessThan(0.95);
  }, 60000);
});

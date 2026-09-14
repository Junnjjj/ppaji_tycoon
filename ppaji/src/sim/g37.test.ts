import { describe, it, expect } from 'vitest';
import { Game, EMERGENCY_FUND } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

describe('G37 비상 자금 (타일 갈기는 P49-a2 에 물빛과 함께 삭제)', () => {
  it('폐장에 잔고가 음수면 2,000G 로 채우고 횟수를 센다', () => {
    const g = new Game(62, undefined, { kit: false });
    g.grid.levels.fill(0); // 화장실 2×2 가 테라스에 걸린다
    g.money = 10;
    g.unlocked.facilities.add('toilet');
    g.money = 5000; g.placeFacility('toilet', g.gate.i + 2, g.gate.j + 3, 0); g.money = 10;
    g.tick = TICKS_PER_DAY - 1;
    g.step();
    expect(g.money).toBe(EMERGENCY_FUND);
    expect(g.stats.bailouts).toBe(1);
  });
});

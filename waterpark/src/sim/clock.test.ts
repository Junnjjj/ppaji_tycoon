import { describe, it, expect } from 'vitest';
import { clockView, isWeekend, seasonOf, yearOf, TICKS_PER_DAY, TOTAL_DAYS, SHOP_RESTOCK_TICK, JUDGE_TICK } from './clock.js';

describe('시계', () => {
  it('하루 1,680 tick (210초) · 08:00 개장 · 17:00 입고 · 15:00 심사', () => {
    expect(TICKS_PER_DAY).toBe(1680);
    expect(clockView(0, 0).clock).toBe('AM 08:00');
    expect(clockView(0, SHOP_RESTOCK_TICK).clock).toBe('PM 05:00');
    expect(clockView(0, JUDGE_TICK).clock).toBe('PM 03:00');
    expect(clockView(0, 1679).clock).toBe('PM 07:59');
  });
  it('계절 4일(평일 3 + 주말) · 1년 16일 · 128일 종료', () => {
    expect([0, 1, 2, 3].map(isWeekend)).toEqual([false, false, false, true]);
    expect(seasonOf(0)).toBe(0);
    expect(seasonOf(4)).toBe(1);
    expect(seasonOf(15)).toBe(3);
    expect(yearOf(15)).toBe(1);
    expect(yearOf(16)).toBe(2);
    expect(TOTAL_DAYS).toBe(128);
    expect(clockView(127, 0).ended).toBe(false);
    expect(clockView(128, 0).ended).toBe(true);
    expect(clockView(127, 0).seasonName).toBe('겨울');
    expect(clockView(127, 0).year).toBe(8);
  });
  it('일과 라벨', () => {
    expect(clockView(0, 0).daypart).toBe('평일 1/3');
    expect(clockView(3, 0).daypart).toBe('주말');
  });
});

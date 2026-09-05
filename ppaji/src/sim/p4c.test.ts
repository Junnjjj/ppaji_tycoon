import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

/** P4-C — 선착장 이용 = 코스 탑승: 요금·만족·통계 · 왕복 */
describe('P4-C 승선', () => {
  it('코스가 있는 선착장을 손님이 쓰면 탑승 수와 코스 매출이 늘고 스냅샷을 왕복한다', () => {
    const g = new Game(1);
    g.money = 100000;
    const s = g.suggestCourse();
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(g.placeCourse(s.draft).ok).toBe(true);
    g.step(TICKS_PER_DAY * 2);
    expect(g.stats.courseRiders ?? 0).toBeGreaterThan(0);
    expect(g.stats.courseRevenue ?? 0).toBeGreaterThan(0);
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.stats.courseRiders).toBe(g.stats.courseRiders);
    expect(h.courses.count).toBe(1);
  });

  it('코스가 없는 선착장은 요금을 안 받는다', () => {
    const g = new Game(1);
    g.step(TICKS_PER_DAY);
    expect(g.stats.courseRiders ?? 0).toBe(0);
    expect(g.courseValidation({ presetId: 'shuttle', equipId: 'peanut', vehicles: 1, dock: { x: 0, y: 0 }, handles: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })).not.toBeNull();
  });
});

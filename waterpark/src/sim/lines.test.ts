import { describe, it, expect } from 'vitest';
import { FRIEND_DEFS, Game, CALENDAR_EVENTS } from './game.js';
import { firstVisitLine, templateIndex } from './lines.js';
import { runBot } from './bot.js';

describe('G27 첫 방문 대사', () => {
  it('친구 71명 전원에게 한 줄이 나오고, 템플릿 6종이 전부 쓰인다', () => {
    expect(FRIEND_DEFS.length).toBeGreaterThanOrEqual(71);
    const used = new Set<number>();
    for (const f of FRIEND_DEFS) {
      const line = firstVisitLine(f);
      expect(line.length, f.id).toBeGreaterThan(4);
      expect(line, f.id).toMatch(/[가-힣]/);
      used.add(templateIndex(f.id));
    }
    expect(used.size).toBe(6);
  });
});

describe('G27 달력 24건', () => {
  it('봇 128일에 달력 사건이 전부 발동한다 (조건부 2건 포함)', () => {
    expect(CALENDAR_EVENTS.length).toBe(32);
    const g = new Game(1);
    runBot(g, 128);
    const missing = CALENDAR_EVENTS.filter((e) => !g.calendarGiven.has(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  }, 30000);
});

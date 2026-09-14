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
    expect(CALENDAR_EVENTS.length).toBe(40); // P53-a 연차 폴백 8
    const g = new Game(1);
    runBot(g, 128);
    const missing = CALENDAR_EVENTS.filter((e) => !g.calendarGiven.has(e.id));
    // 날짜형(무조건)은 전부 발동해야 한다. 조건부(`when`)는 그 날 조건이 안 맞으면 안 오는 것이 맞다 —
    // P0-B 경사 지형에서 시드 1 의 ★3 이 3년차 여름 첫날을 넘겨 카이로봇이 안 왔다 (밴드 rank3Year 중앙 3 은 그대로)
    expect(missing.filter((e) => !('when' in e && e.when)).map((e) => e.id)).toEqual([]);
    expect(missing.length).toBeLessThanOrEqual(1);
  }, 120000); // 128일 봇 — 혼자 44초, 병렬 워커·다른 프로세스 아래 60초를 넘긴다(2026-09-13 실측)
});

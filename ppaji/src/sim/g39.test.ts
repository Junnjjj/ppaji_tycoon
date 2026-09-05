import { describe, it, expect } from 'vitest';
import { Game, FEATURES } from './game.js';
import { runBot } from './bot.js';
import { EVENT_DEFS } from './random-events.js';

describe('G39 랜덤 이벤트', () => {
  it('기능이 켜져 있고, 강제 이벤트 → 선택 → 비용·버프·좋아요가 적용된다', () => {
    expect(FEATURES.randomEvents).toBe(true);
    const g = new Game(81, undefined, { kit: false });
    g.money = 10000;
    expect(g.forceEvent('tv_crew')).toBe(true);
    expect(g.events.pending).toBe('tv_crew');
    const likes0 = g.sns.totalLikes;
    expect(g.resolveEvent(0).ok).toBe(true);
    expect(g.events.pending).toBeNull();
    expect(g.money).toBe(8000);
    expect(g.sns.totalLikes - likes0).toBe(200);
    expect(g.events.arrivalMul(g.day)).toBeCloseTo(1.4, 5);
  });
  it('봇 64일 — 사건이 뜨고, 뜬 사건은 (마지막 하나를 빼면) 전부 답했다', () => {
    const g = new Game(82);
    runBot(g, 64);
    const names = new Set([...EVENT_DEFS.values()].map((e) => e.name));
    const asked = g.inbox.all.filter((e) => e.kind === 'choice').length;
    const answered = g.inbox.all.filter((e) => e.kind === 'system' && e.priority === 'toast' && names.has(e.title)).length;
    expect(asked).toBeGreaterThan(0);
    expect(asked - answered).toBeLessThanOrEqual(1);
  }, 30000);
});

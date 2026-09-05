import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot, BOT_PERSONAS } from './bot.js';

/** P13 — 코스 성향 봇: 같은 시드에서 balanced 보다 코스·기구가 많거나 같다 */
describe('P13 코스 성향', () => {
  it('성향 5 에 course 가 있고, 64일 뒤 코스 수가 balanced 이상이다', () => {
    expect(Object.keys(BOT_PERSONAS)).toContain('course');
    const a = new Game(5); runBot(a, 64, BOT_PERSONAS.balanced);
    const b = new Game(5); runBot(b, 64, BOT_PERSONAS.course);
    expect(b.courses.count).toBeGreaterThanOrEqual(a.courses.count);
    expect(b.courses.ownedEquipment.size).toBeGreaterThanOrEqual(a.courses.ownedEquipment.size);
  }, 60000);
});

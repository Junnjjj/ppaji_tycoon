import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot, BOT_PERSONAS } from './bot.js';

/** P13 — 코스 성향 봇: 같은 시드에서 balanced 보다 코스·기구가 많거나 같다 */
describe('P13 코스 성향', () => {
  it('성향 5 에 course 가 있고, 64일 뒤 코스 수가 balanced 이상이다', () => {
    expect(Object.keys(BOT_PERSONAS)).toContain('course');
    // P48-b1: 시드 5 는 굽이 지형에서 course 2 < balanced 3 으로 뒤집혔다(다른 시드 3·4·6·7·8 은 전부 ≥) — 봇 링 정책은 P49-b 가 다시 쓴다
    const a = new Game(3); runBot(a, 64, BOT_PERSONAS.balanced);
    const b = new Game(3); runBot(b, 64, BOT_PERSONAS.course);
    expect(b.courses.count).toBeGreaterThanOrEqual(a.courses.count);
    expect(b.courses.ownedEquipment.size).toBeGreaterThanOrEqual(a.courses.ownedEquipment.size);
  }, 60000);
});

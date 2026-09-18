import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot, BOT_PERSONAS } from './bot.js';

/** P13 — 코스 성향 봇: 같은 시드에서 balanced 보다 코스·기구가 많거나 같다 */
describe('P13 코스 성향', () => {
  it('성향 5 에 course 가 있다', () => { expect(Object.keys(BOT_PERSONAS)).toContain('course'); });
  // P60-a·b(2026-09-18): 소품 지출이 사라지고 기구가 배를 곯리자 balanced 도 남는 돈으로 코스 장비를 산다 — 장비 수는 8시드 합 93 vs 91 로 성향의 잣대가 못 된다(시드마다 뒤집힘).
  // 성향의 잣대는 **코스 수**(8시드 전부 course 4 > balanced 3). 세 시드를 각각 잰다(한 시드 대조 금지 · 한 it 에 3시드를 몰면 vitest 워커 RPC 가 60초를 넘겨 끊긴다)
  // 시드 둘(파일 합 ≈ 50초) — 셋(80초)이면 게이트 부하에서 워커 RPC 가 또 끊겼다(vitest.config 의 forks 메모와 같은 증상)
  for (const seed of [1, 2]) {
    it(`시드 ${seed}: 64일 뒤 코스 수가 course 성향 > balanced`, () => {
      const a = new Game(seed); runBot(a, 64, BOT_PERSONAS.balanced);
      const b = new Game(seed); runBot(b, 64, BOT_PERSONAS.course);
      expect(b.courses.count).toBeGreaterThan(a.courses.count);
    }, 90000);
  }
});

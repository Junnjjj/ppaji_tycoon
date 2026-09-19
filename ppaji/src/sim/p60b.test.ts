import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot } from './bot.js';
import defaultBalance from '../data/balance.json';

/** P60-b (D73 B1, docs/plan-ppaji-rig-foodcourt.md §10.2) — 기구도 배를 곯린다 */
describe('P60-b 기구 배고픔', () => {
  it('balance.hungerPerRig 가 있고(12) 0 이면 동작 0 — 골든 시드 1 의 16일 해시가 배고픔 없는 판의 고정값과 같다(대조군)', () => {
    expect(defaultBalance.hungerPerRig).toBe(12);
    const off = runBot(new Game(1, { ...defaultBalance, hungerPerRig: 0 }, { arrival: true }), 16);
    expect(off.snapshotHash).toBe(2711473840); // 2026-09-19: standalone module catalog, hunger-off control remeasured.
  }, 20000);
  it('16일 뒤 매점 매출 몫이 늘거나 같다 — 기구를 탄 손님이 배고파진다 (3시드 합계)', () => {
    let on = 0, off = 0;
    for (const seed of [1, 2, 3]) {
      on += runBot(new Game(seed, undefined, { arrival: true }), 16).food ?? 0;
      off += runBot(new Game(seed, { ...defaultBalance, hungerPerRig: 0 }, { arrival: true }), 16).food ?? 0;
    }
    expect(on).toBeGreaterThanOrEqual(off);
  }, 40000);
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot } from './bot.js';
import defaultBalance from '../data/balance.json';

/** P60-b (D73 B1, docs/plan-ppaji-rig-foodcourt.md §10.2) — 기구도 배를 곯린다 */
describe('P60-b 기구 배고픔', () => {
  it('balance.hungerPerRig 가 있고(12) 0 이면 동작 0 — 골든 시드 1 의 16일 해시가 배고픔 없는 판의 고정값과 같다(대조군)', () => {
    expect(defaultBalance.hungerPerRig).toBe(12);
    const off = runBot(new Game(1, { ...defaultBalance, hungerPerRig: 0 }, { arrival: true }), 16);
    expect(off.snapshotHash).toBe(4117665311); // P60-e 재베이크(2026-09-18, 2037537433 → 4117665311 — 좌석 vs 서서(산 곳에서 걷기 9 안 좌석만·서서 8tick) · 구색 등급 ⌊k/2⌋ · 봇 growFoodCourt/diversifyCourtMenus · 스냅샷 stats.eats/standEats) · P60-d 재베이크(2026-09-18, 775479838 → 2037537433 — 봇 자리 정렬(입수구 거리·휴식 뒤·capCourse)과 코스 완성 수역 만족 ×1.25) · P60-c 재베이크(2026-09-18) — 봇 `attachRigs` 세트 후보 우선·사슬 예약으로 순서가 바뀌어 P60-a 값(2498538397)과는 다르다. 키 0 은 「배고픔이 없는 최종 봇」의 고정값 — 골든 표(키 12)와 달라야 배고픔이 실제로 동작한다
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

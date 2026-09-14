import { describe, it, expect } from 'vitest';
import { Game } from './game.js';

/** P34 D43 — 실내동: 매표소가 정원 · 비 오는 날 실내로 피한다 */
describe('P34 실내동', () => {
  it('정원 = 32 + 랭크×12 + 매표소×8 — 킷(매표소 1)은 옛 40 그대로, 건물 바닥을 깔고 매표소를 하나 더 두면 +8 · 잔디엔 못 둔다', () => {
    const g = new Game(34); g.money = 100000; g.unlocked.facilities.add('ticket'); g.unlocked.facilities.add('office'); // 매표소는 ★1 해금 — 킷 것은 물려받은 것
    expect(g.maxGuests()).toBe(40);
    const b = { i0: g.gate.i + 12, j0: g.gate.j + 8 }; // P45-a: 출입동(정문 가운데 20×30) 오른쪽 빈 잔디
    const tiles = []; for (let j = b.j0; j < b.j0 + 4; j++) for (let i = b.i0; i < b.i0 + 5; i++) tiles.push({ i, j });
    expect(g.paintIndoor(tiles).ok).toBe(true); // D48: 건물은 바닥을 깔아 넓힌다
    expect(g.placeFacility('ticket', b.i0 + 1, b.j0 + 1, 0).ok).toBe(true);
    expect(g.maxGuests()).toBe(48);
    expect(g.canPlace('office', g.gate.i + 10, g.gate.j + 14, 0).ok).toBe(false); // 사무실은 잔디 위엔 못 둔다(실내 전용) — 정문 부스는 울타리에 선다(P40)
  });
  it('비 — 실내 시설이 있으면 나가려던 손님 일부가 실내로 향한다(실내 유무 A/B, 같은 시드)', () => {
    const run = (indoor: boolean): number => {
      const g = new Game(34); g.money = 100000; g.weather = 'rain';
      if (!indoor) for (const f of g.facilities.all.filter((x) => g.grid.at(x.i, x.j) === 3)) g.removeFacility(f.uid);
      g.step(900);
      return g.stats.rainRefuge ?? 0;
    };
    expect(run(true)).toBeGreaterThan(0);
    expect(run(false)).toBe(0);
  }, 60000);
});

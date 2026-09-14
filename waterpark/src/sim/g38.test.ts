import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { carryoverOf, applyCarryover, NG_TICKET_STEP } from './endgame.js';

describe('G38 NG+ 누적 · 활성 아이템만', () => {
  it('회차마다 티켓 가산이 누적되고 5회차에서 멈춘다', () => {
    const g = new Game(71, undefined, { kit: false });
    const step = NG_TICKET_STEP(g.b.ticketBase);
    let c = carryoverOf(g, null);
    expect(c.ticketBase).toBe(g.b.ticketBase + step);
    c = carryoverOf(g, c);
    expect(c.ticketBase).toBe(g.b.ticketBase + step * 2);
    for (let k = 0; k < 10; k++) c = carryoverOf(g, c);
    expect(c.ticketBase).toBe(g.b.ticketBase + step * 5);
    expect(c.runs).toBe(12);
    const h = new Game(72, undefined, { kit: false });
    applyCarryover(h, c);
    expect(h.ticketBonus).toBe(step * 5);
  });
  it('조건 평가의 풀 아이템은 만료된 것을 빼고 센다', () => {
    const g = new Game(73, undefined, { kit: false });
    g.money = 10000;
    g.digPool([{ i: g.gate.i - 2, j: g.gate.j - 4 }, { i: g.gate.i - 1, j: g.gate.j - 4 }, { i: g.gate.i - 2, j: g.gate.j - 5 }, { i: g.gate.i - 1, j: g.gate.j - 5 }]);
    const p = g.pools.all[0]!;
    g.unlocked.items.add('strawberry');
    expect(g.putItem(p.id, 'strawberry').ok).toBe(true);
    expect(g.evaluateCondition({ kind: 'item', id: 'strawberry' }).met).toBe(true);
    p.items[0]!.expiresTick = 0; // 만료 (아직 안 치워진 상태)
    g.pools.bump(); // 조건 월드 캐시는 풀 버전을 본다 — 실제로는 매시 expireItems 가 지운다
    expect(g.evaluateCondition({ kind: 'item', id: 'strawberry' }).met).toBe(false);
  });
});

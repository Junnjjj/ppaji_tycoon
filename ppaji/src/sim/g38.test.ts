import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { carryoverOf, applyCarryover, NG_TICKET_STEP } from './endgame.js';

describe('G38 NG+ 누적', () => {
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
});

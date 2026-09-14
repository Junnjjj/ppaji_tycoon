import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { CLOSING_TICK } from './clock.js';
import { QUEUE_MAX, QUEUE_PATIENCE } from './guest.js';

function fresh(seed: number): Game {
  const g = new Game(seed, undefined, { kit: false });
  g.money = 200000;
  return g;
}

describe('G34 대기 줄', () => {
  it('정원 1 시설에 여럿을 보내면 하나는 쓰고 나머지는 줄(순번 0·1)을 서며, 참을성이 다하면 포기한다', () => {
    const g = fresh(31);
    const gt = g.gate;
    g.unlocked.facilities.add('deck_chair');
    expect(g.placeFacility('deck_chair', gt.i + 2, gt.j - 4, 0).ok).toBe(true);
    const chair = g.facilities.all[0]!;
    let maxQueue = 0; const positions = new Set<number>(); let gaveUp = false;
    for (let n = 0; n < 2500; n++) {
      g.step();
      for (const gu of g.guests.all) {
        if (gu.state === 'wander' && gu.stateTicks === 0) { gu.target = { kind: 'facility', uid: chair.uid }; gu.state = 'walk'; }
        if (gu.state === 'queue') { positions.add(gu.queuePos); if (gu.stateTicks >= QUEUE_PATIENCE - 1) gaveUp = true; }
      }
      maxQueue = Math.max(maxQueue, g.guests.queueAt(chair));
      if (maxQueue >= 2 && gaveUp) break;
    }
    expect(maxQueue).toBeGreaterThanOrEqual(2);
    expect(maxQueue).toBeLessThanOrEqual(QUEUE_MAX);
    expect(positions.has(0) && positions.has(1)).toBe(true);
  });
});

describe('G34 폐장·비', () => {
  it('폐장 1시간 전부터 새 손님이 안 오고, 남은 손님은 입구로 간다', () => {
    const g = fresh(32);
    g.digPool([{ i: g.gate.i - 2, j: g.gate.j - 4 }, { i: g.gate.i - 1, j: g.gate.j - 4 }, { i: g.gate.i - 2, j: g.gate.j - 5 }, { i: g.gate.i - 1, j: g.gate.j - 5 }]);
    for (let n = 0; n < 600; n++) g.step();
    expect(g.guests.count).toBeGreaterThan(0);
    g.tick = CLOSING_TICK;
    const entered = g.guests.enteredToday;
    for (let n = 0; n < 60; n++) g.step();
    expect(g.guests.enteredToday).toBe(entered);
    expect(g.guests.all.every((gu) => gu.state === 'leave' || gu.state === 'use' || gu.state === 'climb' || gu.state === 'ride' || gu.state === 'swim' || gu.state === 'gone')).toBe(true);
  });
  it('비 오는 날엔 「비 오네…」 하고 돌아가는 손님이 생긴다', () => {
    const g = fresh(33);
    g.digPool([{ i: g.gate.i - 2, j: g.gate.j - 4 }, { i: g.gate.i - 1, j: g.gate.j - 4 }, { i: g.gate.i - 2, j: g.gate.j - 5 }, { i: g.gate.i - 1, j: g.gate.j - 5 }]);
    g.weather = 'rain';
    let rainy = 0;
    for (let n = 0; n < 900; n++) { g.step(); for (const gu of g.guests.all) if (gu.say === '비 오네…') { rainy++; gu.say = null; } }
    expect(rainy).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { EVENT_DEFS } from './random-events.js';
import { Game } from './game.js';
import { carryoverOf, applyCarryover } from './endgame.js';

/** P11 — 사건 21 · 이월에 기구와 공방 EXP */
describe('P11', () => {
  it('사건은 21 이고 새 사건 7 의 효과가 눈금 안이다', () => {
    expect(EVENT_DEFS.size).toBe(21);
    for (const id of ['jangma_rapids', 'smelt_fest', 'mt_season', 'army_leave', 'yt_challenge', 'typhoon', 'fireworks_sponsor']) expect(EVENT_DEFS.has(id), id).toBe(true);
    for (const e of EVENT_DEFS.values()) {
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(1);
      for (const c of e.choices) {
        const f = c.effect;
        if (f.arrivalMul !== undefined) { expect(f.arrivalMul).toBeGreaterThanOrEqual(0.3); expect(f.arrivalMul).toBeLessThanOrEqual(2); expect(f.days ?? 0, `${e.id} 배율엔 days`).toBeGreaterThan(0); }
        if (f.days !== undefined) expect(f.days).toBeLessThanOrEqual(4);
        expect(c.cost ?? 0).toBeLessThanOrEqual(3000);
      }
    }
  });

  it('이월은 기구·공방 EXP 를 담고, 새 판에 적용하면 기구를 다시 갖는다 (옛 프로필엔 없어도 된다)', () => {
    const g = new Game(1);
    g.money = 50000;
    const parts = [...g.workshop.ingredients.values()].filter((p) => p.unlock === 'shop').sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    for (const p of parts.slice(0, 8)) g.buyPart(p.id);
    const target = [...g.workshop.recipes.values()].find((r) => r.unlock === 'cook' && g.workshop.fillFor(r.id));
    expect(target).toBeTruthy();
    if (!target) return;
    expect(g.craft(g.workshop.fillFor(target.id) as string[]).ok).toBe(true);
    const c = carryoverOf(g, null);
    expect(c.gears).toContain(target.id);
    expect(c.workshopExp).toBe(g.workshop.exp);
    const h = new Game(2);
    expect(h.courses.ownedEquipment.has(target.id)).toBe(false);
    applyCarryover(h, c);
    expect(h.courses.ownedEquipment.has(target.id)).toBe(true);
    expect(h.workshop.exp).toBe(g.workshop.exp);
    const old = { ...c }; delete old.gears; delete old.workshopExp;
    const k = new Game(3);
    applyCarryover(k, old);
    expect(k.courses.ownedEquipment.size).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from './game.js';
import { applyArrivalLayout, arrivalRoom, arrivalRoute, canAdoptArrival } from './arrival-layout.js';
import { FLOOR, isIndoorCode } from './grid.js';
import { FacilityStore } from './facility.js';

describe('approved initial arrival layout', () => {
  const create = () => new Game(20260902, undefined, { arrival: true });
  it('reuses the authored layout data exactly, with two working indoor doors', () => {
    expect(readFileSync('src/data/arrival-presentation.json').equals(readFileSync('../src/data/kairo-arrival-presentation.json'))).toBe(true);
    const g = create();
    expect(arrivalRoom(g.gate)).toEqual({ i0: 42, j0: 11, w: 13, h: 8 });
    expect(Array.from(g.grid.floor).filter(isIndoorCode)).toHaveLength(104);
    expect(g.grid.doors()).toEqual([{ i: 48, j: 11, oi: 48, oj: 10 }, { i: 48, j: 18, oi: 48, oj: 19 }]);
    expect(g.money).toBe(12000);
    expect(g.facilities.all.some(f => ['pyeongsang_row', 'pingpong'].includes(f.defId))).toBe(false);
    expect(g.facilities.all.filter(f => f.defId.startsWith('env_'))).toHaveLength(22);
  });
  it('reserves actual decoration footprints while keeping the 3-cell patio aisle open', () => {
    const g = create(); const occupied = new Set<string>();
    for (const f of g.facilities.all) for (const t of FacilityStore.footprint(g.facilities.defOf(f), f.i, f.j, f.facing)) {
      const key = `${t.i},${t.j}`; expect(occupied.has(key)).toBe(false); occupied.add(key);
      if (f.defId.startsWith('env_')) { expect(isIndoorCode(g.grid.at(t.i, t.j))).toBe(false); expect(g.facilities.occupied(t.i, t.j)).toBe(true); }
    }
    for (let j = 19; j <= 21; j++) for (let i = 47; i <= 49; i++) { expect(g.grid.at(i, j)).toBe(FLOOR.path); expect(g.guests.walkable(i, j)).toBe(true); }
    expect(g.canPlace('env_flower_pot', 48, 12).ok).toBe(false);
    expect(g.guests.walkable(48, 9)).toBe(true); expect(g.facilities.occupied(48, 9)).toBe(true);
    expect(g.guests.walkable(47, 9)).toBe(false);
  });
  it('preserves the system shoreline, heights, pools and dock', () => {
    const g = create(), old = new Game(g.seed);
    expect(g.grid.natural).toEqual(old.grid.natural); expect(g.grid.levels).toEqual(old.grid.levels);
    expect(g.pools.toSnapshot()).toEqual(old.pools.toSnapshot());
    expect(g.facilities.all.find(f => f.defId === 'dock')).toEqual(old.facilities.all.find(f => f.defId === 'dock'));
  });
  it('walks every ticket/indoor cell in order on entry and exit without teleporting', () => {
    const g = create(), guest = g.guests.spawn(), visited: string[] = [];
    let prev = { i: guest.i, j: guest.j };
    for (let tick = 0; tick < 200 && guest.state !== 'wander'; tick++) {
      g.guests.step(); expect(Math.abs(guest.i - prev.i) + Math.abs(guest.j - prev.j)).toBeLessThanOrEqual(1);
      if (guest.progress === 1 && visited.at(-1) !== `${guest.i},${guest.j}`) visited.push(`${guest.i},${guest.j}`);
      prev = { i: guest.i, j: guest.j };
    }
    expect(guest.state).toBe('wander'); expect(visited).toEqual(arrivalRoute(g.gate).map(t => `${t.i},${t.j}`));
    guest.state = 'leave';
    for (let tick = 0; tick < 220 && g.guests.count; tick++) {
      g.guests.step(); expect(Math.abs(guest.i - prev.i) + Math.abs(guest.j - prev.j)).toBeLessThanOrEqual(1); prev = { i: guest.i, j: guest.j };
    }
    expect(g.guests.count).toBe(0); expect([guest.i, guest.j]).toEqual([48, 8]);
  });
  it('round-trips an in-flight entry and keeps the same simulation trajectory', () => {
    const g = create(); g.guests.spawn(); for (let n = 0; n < 15; n++) g.guests.step();
    const restored = Game.fromSnapshot(g.toSnapshot());
    for (let n = 0; n < 100; n++) { g.guests.step(); restored.guests.step(); }
    expect(restored.guests.toSnapshot()).toEqual(g.guests.toSnapshot());
    expect(restored.toSnapshot().arrivalRevision).toBe(2);
    expect(restored.guests.walkable(48, 9)).toBe(true);
  });
  it('adopts only an untouched baseline and leaves edited or occupied parks alone', () => {
    const original = new Game(1), g = Game.fromSnapshot(original.toSnapshot());
    g.money = 82902; g.day = 7; expect(canAdoptArrival(g, original)).toBe(true);
    applyArrivalLayout(g); expect(g.money).toBe(82902); expect(g.day).toBe(7);
    const once = g.toSnapshot(); applyArrivalLayout(g); expect(g.toSnapshot()).toEqual(once);
    const edited = new Game(1); edited.grid.set(40, 10, FLOOR.path); expect(canAdoptArrival(edited, original)).toBe(false);
    const live = new Game(1); live.guests.spawn(); expect(canAdoptArrival(live, original)).toBe(false);
    const upgraded = new Game(1); upgraded.facilities.all[0]!.level = 2; expect(canAdoptArrival(upgraded, original)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import type { FacilityDef } from '../data/schema.js';

const variants = [...FACILITY_DEFS.values()].filter(d => d.variantOf);
function place(g: Game, id: string, facing: 0 | 1): number {
  for (let j = 8; j < 24; j++) for (let i = 20; i < 76; i++) {
    const r = g.placeFacility(id, i, j, facing);
    if (r.ok) return r.uid!;
  }
  throw Error(`No valid site: ${id}/${facing}`);
}
describe('authored rest facility variants', () => {
  it('six variants inherit unlocks and economy without expanding legacy saved facilities', () => {
    expect(variants).toHaveLength(6);
    const base = new Game(1); base.money = 1e7; base.openLand(5);
    const snapshot = base.toSnapshot();
    for (const d of variants) for (const facing of [0, 1] as const) {
      const g = Game.fromSnapshot(snapshot), source = FACILITY_DEFS.get(d.variantOf!)!;
      g.unlocked.facilities.delete(d.id); g.unlocked.facilities.delete(source.id);
      expect(g.isUnlocked(d.id)).toBe(false);
      g.unlocked.facilities.add(source.id);
      expect(g.isUnlocked(d.id)).toBe(true);
      for (const key of ['cost', 'maint', 'capacity', 'useTicks', 'pop', 'usageFee', 'unlock'] as const) {
        expect(d[key], `${d.id}/${key}`).toEqual(source[key as keyof FacilityDef]);
      }
      const old = place(g, source.id, facing), savedOld = { ...g.facilities.byUid(old)! };
      const terrain = [...g.grid.floor], levels = [...g.grid.levels];
      const fresh = place(g, d.id, facing);
      expect(g.facilities.byUid(old)).toEqual(savedOld);
      const restored = Game.fromSnapshot(g.toSnapshot());
      expect(restored.facilities.byUid(old)).toEqual(savedOld);
      expect(restored.facilities.byUid(fresh)).toEqual(g.facilities.byUid(fresh));
      expect(restored.isUnlocked(d.id)).toBe(true);
      expect([...restored.grid.floor]).toEqual(terrain);
      expect([...restored.grid.levels]).toEqual(levels);
      expect([source.w, source.d]).not.toEqual([d.w, d.d]);
    }
  });
});

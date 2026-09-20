import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from '../../sim/game.js';
import { currentBuildCatalog, BUILD_TABS } from './build.js';

const families = [
  { parent: 'pension', ids: ['pension_1f', 'pension_2f', 'pension'], tab: 'lodging' },
  { parent: 'cafe', ids: ['cafe', 'cafe_lv2', 'cafe_lv3'], tab: 'food' },
] as const;
function place(g: Game, id: string, facing: 0 | 1): number {
  for (let j = 0; j < g.grid.h; j++) for (let i = 0; i < g.grid.w; i++) {
    const r = g.placeFacility(id, i, j, facing);
    if (r.ok) return r.uid!;
  }
  throw Error(`No valid site: ${id}/${facing}`);
}
describe('same-footprint lodging and cafe stages', () => {
  it('all stages remain in the correct construction tab alongside the parent', () => {
    const rows = currentBuildCatalog([...FACILITY_DEFS.values()]);
    for (const family of families) {
      const source = FACILITY_DEFS.get(family.parent)!;
      for (const id of family.ids) {
        const d = rows.find(r => r.id === id)!;
        expect(d, id).toBeDefined();
        expect([d.w, d.d]).toEqual([source.w, source.d]);
        expect(BUILD_TABS.find(t => t.id === family.tab)!.match(d)).toBe(true);
      }
    }
  });
  it('new visual stages inherit unlocks and economy while old placements and terrain survive save reload', () => {
    const base = new Game(1); base.money = 1e7; base.openLand(5);
    for (const family of families) for (const id of family.ids) {
      if (id === family.parent) continue;
      const d = FACILITY_DEFS.get(id)!, source = FACILITY_DEFS.get(family.parent)!;
      for (const key of ['cost', 'maint', 'capacity', 'useTicks', 'pop', 'usageFee', 'unlock'] as const) expect(d[key]).toEqual(source[key]);
      for (const facing of [0, 1] as const) {
        const g = Game.fromSnapshot(base.toSnapshot());
        g.unlocked.facilities.delete(family.parent); g.unlocked.facilities.delete(id);
        expect(g.isUnlocked(id)).toBe(false); g.unlocked.facilities.add(family.parent); expect(g.isUnlocked(id)).toBe(true);
        const old = place(g, family.parent, facing), saved = { ...g.facilities.byUid(old)! };
        const terrain = [...g.grid.floor], levels = [...g.grid.levels];
        const fresh = place(g, id, facing), restored = Game.fromSnapshot(g.toSnapshot());
        expect(restored.facilities.byUid(old)).toEqual(saved);
        expect(restored.facilities.byUid(fresh)).toEqual(g.facilities.byUid(fresh));
        expect([...restored.grid.floor]).toEqual(terrain); expect([...restored.grid.levels]).toEqual(levels);
      }
    }
  });
});

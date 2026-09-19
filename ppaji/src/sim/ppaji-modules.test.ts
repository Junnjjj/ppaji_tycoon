import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { capacityOf } from './facility.js';
import { makeTestPpaji } from './test-helpers.js';
import modules from '../data/ppaji-modules.json';

describe('standalone authored ppaji modules', () => {
  it('all 14 unlock, place in both game facings and survive a save without changing legacy footprints', () => {
    const base = new Game(1); base.money = 1e7; base.openLand(5);
    makeTestPpaji(base, 22, 12, -12);
    const snapshot = base.toSnapshot();
    for (const m of modules) for (const facing of [0, 1] as const) {
      const g = Game.fromSnapshot(snapshot);
      expect(g.isUnlocked(m.id), m.id).toBe(true);
      let placed: number | undefined;
      const reasons = new Set<string>();
      for (let j = 30; j <= 44 && placed === undefined; j++) for (let i = 36; i <= 59 && placed === undefined; i++) {
        if (m.id === 'module_rig_led_buoy' && (g.aimPreview(m.id, i, j, facing)?.poolId ?? null) === null) continue;
        const r = g.placeFacility(m.id, i, j, facing);
        if (r.ok) placed = r.uid; else if(r.reason) reasons.add(r.reason);
      }
      expect(placed, `${m.id}/${facing}: ${[...reasons]}`).toBeDefined();
      if (m.id === 'module_rig_led_buoy') {
        const pool = g.poolOfFacility(placed!); expect(pool).not.toBeNull();
        g.nightPool = pool; g.nightOn = true;
        expect(g.nightSalesMul()).toBeGreaterThan(1);
        g.nightOn = false; expect(g.nightSalesMul()).toBe(1);
      }
      const saved = g.toSnapshot(), restored = Game.fromSnapshot(saved);
      expect(restored.facilities.byUid(placed!)).toEqual(g.facilities.byUid(placed!));
      expect([...restored.grid.levels]).toEqual([...g.grid.levels]);
      const def = FACILITY_DEFS.get(m.id)!;
      expect([def.w, def.d]).toEqual(m.size);
      expect(capacityOf(def, { level: 5, chainLen: 100 })).toBe(def.capacity);
    }
    expect(FACILITY_DEFS.get('rig_roller')!.w).toBe(1);
    expect(FACILITY_DEFS.get('module_rig_roller')!.w).toBe(2);
    expect(FACILITY_DEFS.get('module_rig_led_buoy')!.capacity).toBe(0);
  });
});

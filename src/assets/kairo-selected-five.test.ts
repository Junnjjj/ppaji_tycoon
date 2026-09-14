import { describe, expect, it } from 'vitest';
import { allSimFacilities, facilitySpriteId, validateContracts } from './kairo-contract.js';
import { PlacementGrid, facilityDef } from '../sim/kairo/placement.js';

describe('selected five facility integration', () => {
  it('has exact selected footprints, four directional sprites and rotated access outside each footprint', () => {
    for (const [id, n] of [['sauna', 3], ['jjimjilbang', 4], ['bungalow', 3], ['shade_net', 2], ['mongol_tent', 3]] as const) {
      const def = facilityDef(id)!;
      expect(def.size).toEqual([n, n]);
      expect(allSimFacilities().find((f) => f.id === id)?.facings).toBe(4);
      for (const facing of [0, 1, 2, 3] as const) {
        expect(facilitySpriteId(id, facing)).toBe(`facility/${id}:d${facing}`);
        const footprint = new Set(PlacementGrid.footprintTiles(def, 10, 10, facing).map(String));
        const entry = PlacementGrid.entryTilesOf(def, 10, 10, facing);
        expect(entry.length).toBeGreaterThan(0);
        for (const tile of entry) expect(footprint.has(String(tile))).toBe(false);
      }
    }
    expect(validateContracts()).toEqual([]);
  });
});

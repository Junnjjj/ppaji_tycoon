import { describe, expect, it } from 'vitest';
import { migrateFacilityFootprints } from './kairo-facility-footprints.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid } from '../sim/kairo/walls.js';
import { PlacementGrid, facilityDef, type PlacementSnapshot } from '../sim/kairo/placement.js';

function flat(n: number): KairoTerrain {
  const t = new KairoTerrain(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) t.paint(i, j, 'path_stone');
  return t;
}

describe('expanded facility save restoration', () => {
  it('moves an obstructed expansion deterministically, preserving other facilities and handles', () => {
    const s: PlacementSnapshot = { w: 12, h: 12, next: 3, items: [
      { handle: 1, defId: 'shade_net', i: 3, j: 3, level: 2 },
      { handle: 2, defId: 'vending_out', i: 3, j: 4 },
    ] };
    const input = JSON.stringify(s);
    const run = () => migrateFacilityFootprints(s, flat(12), new WallGrid(12, 12), { i: 0, j: 0 });
    const result = run();
    expect(result).toEqual(run());
    expect(JSON.stringify(s)).toBe(input);
    expect(result.items[1]).toEqual(s.items[1]);
    expect(result.items[0]).toMatchObject({ handle: 1, level: 2 });
    expect([result.items[0]!.i, result.items[0]!.j]).not.toEqual([3, 3]);
    const occupied = result.items.flatMap((item) => PlacementGrid.footprintTiles(facilityDef(item.defId)!, item.i, item.j, item.facing ?? 0).map(String));
    expect(new Set(occupied).size).toBe(occupied.length);
    expect(migrateFacilityFootprints(result, flat(12), new WallGrid(12, 12), { i: 0, j: 0 })).toBe(result);
  });

  it('fails without modifying the original when the expanded footprint cannot fit', () => {
    const s: PlacementSnapshot = { w: 1, h: 1, next: 2, items: [{ handle: 1, defId: 'mongol_tent', i: 0, j: 0 }] };
    const before = JSON.stringify(s);
    expect(() => migrateFacilityFootprints(s, flat(1), new WallGrid(1, 1), { i: 0, j: 0 })).toThrow('원본 저장');
    expect(JSON.stringify(s)).toBe(before);
  });
});

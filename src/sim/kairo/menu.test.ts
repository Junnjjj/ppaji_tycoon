import { describe, expect, it } from 'vitest';
import {
  INGREDIENTS,
  RECIPES,
  MenuStore,
  menuSlotsForLevel,
  pairKey,
} from './menu.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, facilityDef } from './placement.js';

const SIZE = 24;
const GATE = { i: 0, j: 0 };

function shopWorld(defId: 'shop' | 'cafe' = 'shop'): {
  placement: PlacementGrid;
  handle: number;
} {
  const terrain = new KairoTerrain(SIZE, SIZE);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) terrain.paint(i, j, 'path_stone');
  }
  const placement = new PlacementGrid(SIZE, SIZE);
  const placed = placement.place(
    terrain,
    new WallGrid(SIZE, SIZE),
    GATE,
    defId,
    6,
    6,
  ).placed;
  if (!placed) throw new Error(`${defId} placement failed`);
  return { placement, handle: placed.handle };
}

describe('Phase 3 menu data', () => {
  it('keeps the vertical slice to eight ingredients and eight existing menu names', () => {
    expect(INGREDIENTS).toHaveLength(8);
    expect(RECIPES).toHaveLength(8);
    expect(RECIPES.filter((r) => r.facilityId === 'shop')).toHaveLength(4);
    expect(RECIPES.filter((r) => r.facilityId === 'cafe')).toHaveLength(4);

    const names = new Set(
      ['shop', 'cafe'].flatMap((id) => facilityDef(id)?.menu?.map((m) => m.name) ?? []),
    );
    expect(RECIPES.every((r) => names.has(r.name))).toBe(true);
    expect(new Set(RECIPES.map((r) => pairKey(...r.ingredients))).size).toBe(RECIPES.length);
  });

  it('treats ingredient order as irrelevant and every failed paid try leaves progress', () => {
    const store = new MenuStore();
    let spent = 0;
    const fail = store.develop('shop', ['ice', 'milk'], (cost) => {
      spent += cost;
      return true;
    });
    expect(fail.kind).toBe('failed');
    expect(fail.cost).toBeGreaterThan(0);
    expect(fail.clue.length).toBeGreaterThan(4);
    expect(fail.progress).toBeGreaterThan(0);
    expect(spent).toBe(fail.cost);

    const repeat = store.develop('shop', ['milk', 'ice'], () => {
      throw new Error('the same failed pair must not charge twice');
    });
    expect(repeat.kind).toBe('failed');
    expect(repeat.cost).toBe(0);
    expect(repeat.clue).toBe(fail.clue);

    store.unlockIngredient('broth');
    const success = store.develop('shop', ['broth', 'noodle'], () => true);
    const reverse = store.develop('shop', ['noodle', 'broth'], () => true);
    expect(success.kind).toBe('discovered');
    expect(reverse.kind).toBe('known');
    expect(success.recipe?.id).toBe(reverse.recipe?.id);
  });

  it('grows per-instance menu slots 1 -> 2 -> 3 at facility levels 1/3/5', () => {
    expect([1, 2, 3, 4, 5].map(menuSlotsForLevel)).toEqual([1, 1, 2, 2, 3]);
    const { placement, handle } = shopWorld();
    const store = MenuStore.fromSnapshot({
      ingredients: INGREDIENTS.map((x) => x.id),
      discovered: RECIPES.map((x) => x.id),
      failures: {},
    });

    expect(placement.menuSlotCount(handle)).toBe(1);
    expect(store.equip(placement, handle, 'shop_gimbap', 1)).toBe(false);
    while (placement.levelOf(handle) < 3) placement.upgrade(handle);
    expect(placement.menuSlotCount(handle)).toBe(2);
    expect(store.equip(placement, handle, 'shop_gimbap', 1)).toBe(true);
    while (placement.levelOf(handle) < 5) placement.upgrade(handle);
    expect(placement.menuSlotCount(handle)).toBe(3);
    expect(store.equip(placement, handle, 'shop_snack', 2)).toBe(true);
    expect(placement.menuIdsOf(handle)).toEqual([
      expect.any(String),
      'shop_gimbap',
      'shop_snack',
    ]);

    const second = shopWorld().placement;
    expect(second.menuIdsOf(1)).not.toEqual(placement.menuIdsOf(handle));
  });

  it('restores development state deterministically and sanitizes removed ids', () => {
    const raw = {
      ingredients: ['ice', 'coffee', 'removed-ingredient'],
      discovered: ['cafe_americano', 'removed-recipe'],
      failures: {
        'shop|ice+milk': {
          clue: '우유 힌트',
          progress: 0.25,
        },
      },
    };
    const a = MenuStore.fromSnapshot(structuredClone(raw));
    const b = MenuStore.fromSnapshot(structuredClone(raw));
    expect(a.toSnapshot()).toEqual(b.toSnapshot());
    expect(a.toSnapshot().ingredients).not.toContain('removed-ingredient');
    expect(a.toSnapshot().discovered).not.toContain('removed-recipe');
    expect(a.toSnapshot().failures['shop|ice+milk']?.clue).toBe('우유 힌트');
  });
});

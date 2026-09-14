import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { menuLabModel } from './kairo-menu-lab.js';
import { MenuStore } from '../sim/kairo/menu.js';
import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function placement(): PlacementGrid {
  const raw: PlacementSnapshot = {
    w: 20,
    h: 20,
    next: 2,
    items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }],
  };
  return PlacementGrid.fromSnapshot(raw);
}

describe('Phase 3 menu lab mobile surface', () => {
  it('renders authoritative ingredients, attempt progress, and per-instance slots in one model', () => {
    const menus = new MenuStore();
    menus.develop('shop', ['ice', 'milk'], () => true);
    const model = menuLabModel(menus, placement(), 1);
    expect(model?.facilityId).toBe('shop');
    expect(model?.ingredients.length).toBeGreaterThanOrEqual(6);
    expect(model?.slots).toEqual(['shop_can_drink']);
    expect(model?.clues.length).toBe(1);
    expect(model?.clues[0]?.progress).toBeGreaterThan(0);
  });

  it('uses named controls and the shared 44px touch token', () => {
    const source = readFileSync(new URL('./kairo-menu-lab.ts', import.meta.url), 'utf8');
    expect(source).toContain('kairo-menu-develop');
    expect(source).toContain('kairo-menu-ingredient');
    expect(source).toContain('kairo-menu-slot');
    expect(source).toContain('메뉴 개발');
    expect(source).toContain('바로 장착');
    expect(css).toMatch(/\.kmenu-lab[\s\S]*?min-height:\s*var\(--tap\)/);
  });
});

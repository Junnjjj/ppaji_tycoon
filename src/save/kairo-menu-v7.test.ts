import { describe, expect, it } from 'vitest';
import { KAIRO_SAVE_VERSION, packKairo, restoreKairo, type KairoSaveInput } from './kairo.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid } from '../sim/kairo/walls.js';
import { ProgressStore } from '../sim/kairo/progress.js';
import { MenuStore, menuFacilityOperability } from '../sim/kairo/menu.js';
import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';
import { WishStore, type WishSnapshot } from '../sim/kairo/wishes.js';

const LEGACY_PLACEMENT: PlacementSnapshot = {
  w: 20,
  h: 20,
  next: 2,
  items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }],
};

describe('Phase 3 deterministic legacy-v7 restoration', () => {
  it('v8에서도 legacy craft facility 시작 슬롯을 결정적으로 파생한다', () => {
    expect(KAIRO_SAVE_VERSION).toBe(8);
    const a = PlacementGrid.fromSnapshot(structuredClone(LEGACY_PLACEMENT));
    const b = PlacementGrid.fromSnapshot(structuredClone(LEGACY_PLACEMENT));
    expect(a.menuIdsOf(1)).toEqual(['shop_can_drink']);
    expect(a.toSnapshot()).toEqual(b.toSnapshot());
  });

  it('복원한 stale 레시피를 버리고 메뉴 없는 craft 시설을 운영 불가로 판정한다', () => {
    const stale: PlacementSnapshot = {
      ...structuredClone(LEGACY_PLACEMENT),
      items: [{ handle: 1, defId: 'shop', i: 4, j: 4, menuIds: ['deleted_recipe'] }],
    };
    const placement = PlacementGrid.fromSnapshot(stale);
    expect(placement.menuIdsOf(1)).toEqual([]);
    expect(menuFacilityOperability('shop', 'craft', placement.menuIdsOf(1), () => true)).toEqual({
      operable: false,
      menuIds: [],
    });
  });

  it('derives missing menu and regular state without persisting transient guests', () => {
    const menusA = MenuStore.fromSnapshot(undefined).toSnapshot();
    const menusB = MenuStore.fromSnapshot(undefined).toSnapshot();
    expect(menusA).toEqual(menusB);

    const oldWish: WishSnapshot = {
      exp: {},
      active: ['minji', 'sooyeon'],
      stage: {},
      open: [],
    };
    const restored = WishStore.fromSnapshot(oldWish).toSnapshot();
    expect(restored.regular?.minji).toEqual({ stage: 0, affinity: 0 });
    expect(restored.regular?.sooyeon).toEqual({ stage: 0, affinity: 0 });
    expect(JSON.stringify(restored)).not.toMatch(/guest|agent/i);
  });

  it('round-trips only named/menu development state and mounted facility menus', () => {
    const terrain = new KairoTerrain(20, 20);
    const walls = new WallGrid(20, 20);
    const placement = PlacementGrid.fromSnapshot(structuredClone(LEGACY_PLACEMENT));
    const menus = new MenuStore();
    menus.develop('shop', ['rice', 'seaweed'], () => true);
    expect(menus.equip(placement, 1, 'shop_gimbap', 0)).toBe(true);
    const wishes = new WishStore();
    wishes.settleRegularPurchases([
      {
        purchaseId: '1:7:shop_can_drink:0',
        week: 1,
        guestId: 7,
        characterId: 'minji',
        menuId: 'shop_can_drink',
        facilityHandle: 1,
        amount: 700,
      },
    ]);
    const input: KairoSaveInput = {
      seed: 17,
      gate: { i: 1, j: 1 },
      terrain,
      walls,
      placement,
      progress: new ProgressStore(),
      week: { week: 1, cash: 4_000_000 },
      weekRngState: 31,
      season: 'summer',
      lastSummary: null,
      menus: menus.toSnapshot(),
      wishes: wishes.toSnapshot(),
    };
    const round = restoreKairo(JSON.parse(JSON.stringify(packKairo(input, 1234))));

    expect(round.menus).toEqual(menus.toSnapshot());
    expect(round.wishes?.regular?.minji).toEqual({ stage: 1, affinity: 20 });
    expect(round.placement.menuIdsOf(1)).toEqual(['shop_gimbap']);
    expect(JSON.stringify(round)).not.toMatch(/regularQueue|guestId|agent/i);
  });
});

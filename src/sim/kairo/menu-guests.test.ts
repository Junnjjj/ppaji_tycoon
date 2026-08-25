import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import { MenuStore } from './menu.js';
import { PlacementGrid } from './placement.js';
import { GRADES, admissionLimit } from './progress.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { WeekRunner, TICKS_PER_WEEK } from './week.js';
import { WishStore } from './wishes.js';

function world(): {
  terrain: KairoTerrain;
  walls: WallGrid;
  placement: PlacementGrid;
  guests: GuestStore;
  runner: WeekRunner;
  menu: MenuStore;
  shop: number;
} {
  const terrain = new KairoTerrain(30, 30);
  for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) terrain.paint(i, j, 'path_stone');
  const walls = new WallGrid(30, 30);
  const placement = new PlacementGrid(30, 30);
  const placed = placement.place(terrain, walls, { i: 0, j: 0 }, 'shop', 6, 6).placed;
  if (!placed) throw new Error('shop placement failed');
  const menu = new MenuStore();
  const guests = new GuestStore(terrain, walls, placement, { i: 0, j: 0 }, OPEN_GATE_DEFAULTS);
  guests.setMenuStore(menu);
  return {
    terrain,
    walls,
    placement,
    guests,
    runner: new WeekRunner(terrain, placement, guests),
    menu,
    shop: placed.handle,
  };
}

describe('named regulars buy from authoritative facility menus', () => {
  it('puts a named character on a real guest agent and links its purchase to the week report', () => {
    const w = world();
    const wishes = new WishStore();
    // Minji's first request is the shop starting menu, so this proves the full initial path.
    const visits = wishes.regularVisitsForWeek(1);
    const rep = w.runner.run(new Rng(41), {
      season: 'summer',
      arrivalBaseTicks: 1,
      regularVisits: visits,
    });

    expect(rep.regularVisits).toBeGreaterThan(0);
    const purchase = rep.menuPurchases.find((p) => p.characterId === 'minji');
    expect(purchase?.menuId).toBe('shop_can_drink');
    expect(purchase?.facilityHandle).toBe(w.shop);
    expect(purchase?.amount).toBeGreaterThan(0);
    expect(rep.sales).toBeGreaterThanOrEqual(purchase?.amount ?? 0);
  });

  it('does not simulate food use or purchases when a craft facility has no equipped menu', () => {
    const w = world();
    const shops = [w.shop];
    for (const [i, j] of [[10, 6], [14, 6], [18, 6], [22, 6]] as const) {
      const placed = w.placement.place(w.terrain, w.walls, { i: 0, j: 0 }, 'shop', i, j).placed;
      if (!placed) throw new Error('extra shop placement failed');
      shops.push(placed.handle);
    }
    for (const handle of shops) expect(w.placement.setMenuIds(handle, [])).toBe(true);
    expect(w.placement.totalCapacity()).toBeGreaterThan(5);
    const rep = w.runner.run(new Rng(41), {
      season: 'summer',
      arrivalBaseTicks: 1,
      regularVisits: new WishStore().regularVisitsForWeek(1),
      grade: GRADES[0]!,
      buildable: ['shop'],
    });
    expect(rep.menuPurchases).toEqual([]);
    expect(rep.sales).toBe(0);
    expect(w.runner.supply().food ?? 0).toBe(0);
    expect(w.placement.operationalCapacity((id) => w.menu.hasRecipe(id))).toBe(0);
    expect(rep.admissionCap?.limit).toBe(admissionLimit(GRADES[0]!, 0));
    expect(rep.admissionCap?.limit).toBeLessThan(admissionLimit(GRADES[0]!, w.placement.totalCapacity()));
    expect(rep.bottleneck).toMatchObject({ need: 'food', supply: 0, missing: true });
  });

  it('never buys a mounted recipe that is not discovered in the authoritative menu store', () => {
    const w = world();
    w.placement.upgrade(w.shop);
    w.placement.upgrade(w.shop); // level 3 => two slots
    expect(w.placement.setMenuIds(w.shop, ['shop_can_drink', 'shop_gimbap'])).toBe(true);
    expect(w.menu.hasRecipe('shop_gimbap')).toBe(false);
    const rep = w.runner.run(new Rng(42), {
      season: 'summer',
      arrivalBaseTicks: 1,
      // Week 2 is Sooyeon, whose first request is the still-undiscovered gimbap.
      regularVisits: new WishStore().regularVisitsForWeek(2),
    });
    expect(rep.menuPurchases.some((p) => p.menuId === 'shop_gimbap')).toBe(false);
  });

  it('keeps named purchase output identical for run and arbitrarily split stepping', () => {
    const a = world();
    const b = world();
    const visits = new WishStore().regularVisitsForWeek(1);
    const opts = { season: 'summer' as const, arrivalBaseTicks: 1, regularVisits: visits };
    const direct = a.runner.run(new Rng(77), opts);
    b.runner.begin(new Rng(77), opts);
    while (!b.runner.liveProgress()?.done) b.runner.step(37);
    const split = b.runner.finish();
    expect(JSON.stringify(split)).toBe(JSON.stringify(direct));
    expect(b.runner.week).toBe(1);
    expect(b.runner.liveProgress()).toBeNull();
    expect(TICKS_PER_WEEK).toBeGreaterThan(37);
  });
});

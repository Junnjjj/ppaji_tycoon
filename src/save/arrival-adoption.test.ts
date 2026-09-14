import { expect, it } from 'vitest';
import legacy from './__fixtures__/main-85019e1.json';
import { restoreKairo } from './kairo.js';
import { adoptArrival, type ArrivalAdoptionInput } from '../sim/kairo/arrival-adoption.js';
import { mapType } from '../sim/kairo/scenario.js';
import { PlacementGrid, facilityDef } from '../sim/kairo/placement.js';
import { bakeIndoorWalls } from '../sim/kairo/indoor.js';
import { guestWalkable } from '../sim/kairo/placement.js';
import { DoorSet } from '../sim/kairo/doors.js';
import { GuestStore } from '../sim/kairo/guests.js';
import { Rng } from '../sim/rng.js';

function world(clearLeisure = true) {
  const w = restoreKairo(structuredClone(legacy));
  if (clearLeisure) for (const f of w.placement.all())
    if (['pingpong', 'pyeongsang_row'].includes(f.defId)) w.placement.remove(f.handle);
  bakeIndoorWalls(w.terrain, w.walls, w.gate, guestWalkable(w.terrain, w.placement), DoorSet.fromSnapshot(w.doors));
  return { ...w, map: mapType('bukhan'), doors: w.doors ?? { keys: [] } };
}
const snapshot = (w: ArrivalAdoptionInput) => JSON.stringify({
  terrain: w.terrain.toSnapshot(), walls: w.walls.toSnapshot(), placement: w.placement.toSnapshot(), doors: w.doors,
});

it('adopts an actual main save with omitted booth facing, preserving heights and handles', () => {
  const w = world(), before = snapshot(w), r = adoptArrival(w);
  expect(r.changed, r.reason).toBe(true);
  expect(r.placement.all().find(f => f.defId === 'ticket')).toMatchObject({ handle: 1, i: 46, j: 9, facing: 0 });
  expect(r.arrivalPresentationRevision).toBe(2);
  expect(r.placement.all().find(f => f.defId === 'ticket')?.legacyAdmission).toBeUndefined();
  expect(r.terrain.toSnapshot().levels).toEqual(w.terrain.toSnapshot().levels);
  expect(snapshot(w)).toBe(before);
  const again = adoptArrival(r);
  expect(again.changed).toBe(false);
  expect(again.placement).toBe(r.placement);
});

it('preserves the complete main starter layout if its leisure facilities block enlargement', () => {
  const w = world(false), before = snapshot(w), r = adoptArrival(w);
  expect(r.changed).toBe(false);
  expect(snapshot(r)).toBe(before);
  expect(r.placement.all()).toHaveLength(7);
  expect(r.indoorTicketEntryConnected).toBe(false);
  expect(r.parkArrivalLayoutApplied).toBe(false);
  expect(r.arrivalPresentationRevision).toBe(0);
  const guests = new GuestStore(r.terrain, r.walls, r.placement, r.gate), rng = new Rng(42);
  expect(guests.spawn(rng)).toBeTruthy();
  let admitted = 0;
  for (let tick=0;tick<400;tick++) { guests.tick(rng); admitted += guests.takeAdmitted().count; }
  expect(admitted).toBe(1);
});

it('rolls back earlier ticket/room changes when final enlargement encounters a user building', () => {
  const w = world(), s = w.placement.toSnapshot();
  w.placement = PlacementGrid.fromSnapshot({ ...s, next: s.next + 1,
    items: [...s.items, { handle: s.next, defId: 'shop', i: 42, j: 17 }] });
  const before = snapshot(w), r = adoptArrival(w);
  expect(r.changed).toBe(false);
  expect(snapshot(r)).toBe(before);
  expect(r.arrivalPresentationRevision).toBe(0);
});

it('does not relocate user facilities inside the room', () => {
  const w = world(), s = w.placement.toSnapshot();
  w.placement = PlacementGrid.fromSnapshot({ ...s, next: s.next + 1,
    items: [...s.items, { handle: s.next, defId: 'toilet', i: 46, j: 11 }] });
  const r = adoptArrival(w);
  expect(r.changed).toBe(false);
  expect(r.reason).toContain('실내');
  expect(r.placement).toBe(w.placement);
});

it('preserves unmarked player decoration and fences and never overlaps newly authored props', () => {
  const w = world(), s = w.placement.toSnapshot();
  const props = [{ handle: 80, defId: 'env_bench', i: 58, j: 23 },
    { handle: 81, defId: 'env_wood_fence', i: 35, j: 10 }];
  w.placement = PlacementGrid.fromSnapshot({ ...s, next: 82, items: [...s.items, ...props] });
  const r = adoptArrival(w);
  expect(r.changed, r.reason).toBe(true);
  for (const f of props) expect(r.placement.all().find(x => x.handle === f.handle)).toEqual(f);
  const tiles = r.placement.all().flatMap(f => PlacementGrid.footprintTiles(facilityDef(f.defId)!, f.i, f.j, f.facing ?? 0).map(String));
  expect(new Set(tiles).size).toBe(tiles.length);
});

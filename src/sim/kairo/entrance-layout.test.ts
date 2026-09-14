import { expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { reachable, WallGrid } from './walls.js';
import { applyStartKit } from './startkit.js';
import { MAP_TYPES, mapType } from './scenario.js';
import { arrangeInheritedEntrance, removeInheritedBoundaryFences, connectInheritedIndoorEntry, removeInheritedLeisure } from './entrance-layout.js';

function world(map = mapType('bukhan'), seed = 20260818) {
  const terrain = KairoTerrain.generate(96, 72, new Rng(seed), map);
  const walls = new WallGrid(96, 72), placement = new PlacementGrid(96, 72);
  const gate = KairoTerrain.parkGate();
  applyStartKit({ terrain, walls, placement, gate, map });
  return { terrain, walls, placement, gate, map };
}
it('moves the inherited booth without changing elevations, room, facilities or their handles across maps', () => {
  for (const map of MAP_TYPES) for (const seed of [1, 42, 20260818]) {
    const w = world(map, seed), before = w.terrain.toSnapshot();
    const r = arrangeInheritedEntrance(w);
    expect(r.changed, `${map.id}/${seed}: ${r.reason}`).toBe(true);
    expect(r.terrain.toSnapshot().levels).toEqual(before.levels);
    expect(w.terrain.toSnapshot()).toEqual(before);
    for (const f of w.placement.all().filter(f => f.defId !== 'ticket'))
      expect(r.placement.all().find(x => x.handle === f.handle)).toEqual(f);
    const ticket = r.placement.all().find(f => f.defId === 'ticket')!;
    expect(ticket.j).toBe(9);
    expect(ticket.facing).toBe(0);
    const reach = reachable(r.terrain, w.walls, w.gate, guestWalkable(r.terrain, r.placement));
    for (const y of [8, 9, 10, 11]) expect(reach[y * 96 + ticket.i + 2]).toBe(1);
    for (let j = 0; j < 72; j++) for (let i = 0; i < 96; i++)
      if (w.terrain.isIndoor(i, j)) { expect(r.terrain.isIndoor(i, j)).toBe(true); expect(reach[j * 96 + i]).toBe(1); }
    expect(r.placement.all().filter(f => f.defId.startsWith('env_wood_fence')).length).toBe(0);
    const again = arrangeInheritedEntrance({ ...w, terrain: r.terrain, placement: r.placement });
    expect(again.changed).toBe(false);
    expect(again.placement.toSnapshot()).toEqual(r.placement.toSnapshot());
  }
});
it('keeps a conflicting saved layout intact instead of overwriting another building', () => {
  const w = world();
  const s = w.placement.toSnapshot();
  w.placement = PlacementGrid.fromSnapshot({ ...s, next: s.next + 1, items: [...s.items,
    { handle: s.next, defId: 'env_village_house', i: 54, j: 9 }] });
  const before = JSON.stringify([w.terrain.toSnapshot(), w.placement.toSnapshot()]);
  const r = arrangeInheritedEntrance(w);
  expect(r.changed).toBe(false);
  expect(r.reason).toBeTruthy();
  expect(JSON.stringify([r.terrain.toSnapshot(), r.placement.toSnapshot()])).toBe(before);
});

it('removes saved perimeter fences while preserving terrain, booth and fences elsewhere', () => {
  const w = world(), r = arrangeInheritedEntrance(w), snapshot = r.placement.toSnapshot();
  const fences = [{handle: 90, defId: 'env_wood_fence', i: 35, j: 10},
    {handle: 91, defId: 'env_wood_fence_corner', i: 60, j: 8},
    {handle: 92, defId: 'env_wood_fence', i: 40, j: 20}];
  const p = PlacementGrid.fromSnapshot({...snapshot, next: 93, items: [...snapshot.items, ...fences]});
  const before = r.terrain.toSnapshot();
  expect(removeInheritedBoundaryFences(r.terrain, p)).toBe(2);
  expect(p.all()).toEqual([...snapshot.items, fences[2]]);
  expect(r.terrain.toSnapshot()).toEqual(before);
  expect(removeInheritedBoundaryFences(r.terrain, p)).toBe(0);
});

it('requires passing through the ticket lane to reach the room, preserving terrain heights and other facilities', () => {
  for (const map of MAP_TYPES) for (const seed of [1, 42, 20260818]) {
    const w = world(map, seed), relocated = arrangeInheritedEntrance(w);
    removeInheritedLeisure(relocated.placement, map);
    const r = connectInheritedIndoorEntry({ ...w, ...relocated });
    expect(r.changed, `${map.id}/${seed}: ${r.reason}`).toBe(true);
    expect(r.terrain.toSnapshot().levels).toEqual(w.terrain.toSnapshot().levels);
    expect(r.placement.all().some(f => ['pingpong', 'pyeongsang_row'].includes(f.defId))).toBe(false);
    const ticket = r.placement.all().find(f => f.defId === 'ticket')!;
    const walk = guestWalkable(r.terrain, r.placement);
    const open = reachable(r.terrain, r.walls, w.gate, walk);
    const blocked = Object.assign((i: number, j: number) => !(i === ticket.i && j === ticket.j + 2) && walk(i, j), { canCross: walk.canCross });
    const closed = reachable(r.terrain, r.walls, w.gate, blocked);
    for (let j = 0; j < 72; j++) for (let i = 0; i < 96; i++) if (r.terrain.isIndoor(i, j)) {
      expect(open[j * 96 + i]).toBe(1);
      expect(closed[j * 96 + i]).toBe(0);
    }
    for (const f of w.placement.all().filter(f => !['ticket', 'pingpong', 'pyeongsang_row'].includes(f.defId)))
      expect(r.placement.all().find(x => x.handle === f.handle)).toEqual(f);
  }
});

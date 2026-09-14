import { KairoTerrain } from './terrain.js';
import { PlacementGrid, facilityDef, guestWalkable } from './placement.js';
import { reachable, WallGrid } from './walls.js';
import type { MapType } from './scenario.js';
import { DoorSet, type DoorSnapshot } from './doors.js';
import { bakeIndoorWalls } from './indoor.js';
import { isSlopeKind } from './slopes.js';

/** Move only the inherited booth; retain terrain elevations, room, rides and handles. */
export function arrangeInheritedEntrance(input: {
  terrain: KairoTerrain; placement: PlacementGrid; walls: WallGrid;
  gate: { i: number; j: number }; map: MapType;
}): { terrain: KairoTerrain; placement: PlacementGrid; changed: boolean; reason?: string } {
  const { map, gate, walls } = input;
  const original = { terrain: input.terrain, placement: input.placement, changed: false };
  const yardI = KairoTerrain.ENTRY_I - Math.floor(map.start.yard[0] / 2);
  const old = input.placement.all().find(f => f.defId === 'ticket'
    && f.i === yardI + 1 && f.j === KairoTerrain.CITY_BAND + map.start.indoor[1] + 2
    && (f.facing === undefined || f.facing === 0 || f.facing === 1));
  // A saved player layout, or an already adopted layout, stays where its owner put it.
  if (!old) return original;
  const terrain = KairoTerrain.fromSnapshot(input.terrain.toSnapshot());
  const snapshot = input.placement.toSnapshot();
  let placement = PlacementGrid.fromSnapshot({ ...snapshot, items: snapshot.items.filter(f => f.handle !== old.handle) });
  const i = yardI + map.start.indoor[0] + 2, j = KairoTerrain.CITY_BAND + 1;
  const lane = i + 2, bottom = KairoTerrain.CITY_BAND + map.start.yard[1] - 1;
  const paint = (x: number, y: number): boolean => {
    if (!terrain.isBuildable(x, y) || !terrain.isWalkable(x, y) || terrain.isIndoor(x, y)
      || terrain.levelAt(x, y) !== 0 || isSlopeKind(terrain.kindAt(x, y))) return false;
    const handle = placement.handleAt(x, y);
    if (handle && placement.blocksWalk(x, y)) return false;
    if (terrain.kindAt(x, y) === 'lawn') terrain.paint(x, y, 'path_stone');
    return true;
  };
  // Existing gate → rear approach → clear booth lane → existing yard, around the room.
  const path: [number, number][] = [];
  for (let x = gate.i; x <= lane; x++) path.push([x, gate.j]);
  for (let y = gate.j; y <= bottom; y++) path.push([lane, y]);
  for (let x = yardI + map.start.yard[0] - 1; x <= lane; x++) path.push([x, bottom]);
  for (const [x, y] of path) if (!paint(x, y)) return { ...original, reason: `입구 연결 공간 충돌 (${x}, ${y})` };
  const check = placement.check(terrain, walls, gate, 'ticket', i, j, { facing: 0 });
  if (!check.ok) return { ...original, reason: `매표소 이동 불가: ${check.fail}` };
  placement = PlacementGrid.fromSnapshot({ ...snapshot, items: snapshot.items.map(f => f.handle === old.handle ? { ...f, i, j, facing: 0 } : f) });

  const reach = reachable(terrain, walls, gate, guestWalkable(terrain, placement));
  const def = facilityDef('ticket')!;
  for (const [x, y] of PlacementGrid.footprintTiles(def, i, j, 0).filter(([x]) => x === lane)) {
    if (!reach[y * terrain.width + x]) return { ...original, reason: '매표소 통과 경로 연결 실패' };
  }
  return { terrain, placement, changed: true };
}

/** Remove the previously supplied plot fence from saved games as well as new games. */
export function removeInheritedBoundaryFences(terrain: KairoTerrain, placement: PlacementGrid): number {
  const left = KairoTerrain.ENTRY_I - 13, right = KairoTerrain.ENTRY_I + 12;
  let removed = 0;
  for (const f of placement.all()) {
    if (f.defId !== 'env_wood_fence' && f.defId !== 'env_wood_fence_corner') continue;
    const onBoundary = (f.j === KairoTerrain.CITY_BAND && f.i >= left && f.i <= right)
      || (f.j > KairoTerrain.CITY_BAND && (f.i === left || f.i === right));
    if (onBoundary && terrain.kindAt(f.i, f.j) === 'lawn' && placement.remove(f.handle)) removed++;
  }
  return removed;
}

/** Only the inherited leisure facilities, not facilities the player built later. */
export function removeInheritedLeisure(placement: PlacementGrid, map: MapType): void {
  const i = KairoTerrain.ENTRY_I - Math.floor(map.start.yard[0] / 2) + 1;
  for (const f of placement.all()) {
    if (f.i === i && ((f.handle === map.start.deck + 3 && f.defId === 'pingpong')
      || (f.handle === map.start.deck + 4 && f.defId === 'pyeongsang_row'))) placement.remove(f.handle);
  }
}

/** The room's only entrance meets the exit of the physical ticket lane. */
export function connectInheritedIndoorEntry(input: {
  terrain: KairoTerrain; placement: PlacementGrid; walls: WallGrid; doors?: DoorSnapshot;
  gate: { i: number; j: number }; map: MapType;
}) {
  const original = { terrain: input.terrain, placement: input.placement, walls: input.walls,
    doors: input.doors ?? { keys: [] }, changed: false, reason: '' };
  const yardI = KairoTerrain.ENTRY_I - Math.floor(input.map.start.yard[0] / 2);
  const room = { i: yardI + 1, j: KairoTerrain.CITY_BAND + 1,
    w: input.map.start.indoor[0], h: input.map.start.indoor[1] };
  const right = room.i + room.w - 1;
  const booth = input.placement.all().find(f => f.defId === 'ticket'
    && f.i === right + 2 && f.j === room.j && (f.facing ?? 0) === 0);
  if (!booth) return original;
  for (let j = room.j; j < room.j + room.h; j++) for (let i = room.i; i <= right; i++) {
    if (!input.terrain.isIndoor(i, j)) return { ...original, reason: '기존 실내가 편집되어 입구 자동 연결을 보류했습니다' };
  }
  const terrain = KairoTerrain.fromSnapshot(input.terrain.toSnapshot());
  const walls = WallGrid.fromSnapshot(input.walls.toSnapshot());
  const s = input.placement.toSnapshot();
  let placement = PlacementGrid.fromSnapshot({ ...s, items: s.items.filter(f => f.handle !== booth.handle) });
  const i = right + 1, j = room.j, laneJ = j + 2;
  // The right-facing approach enters from +I and exits directly into the indoor tile.
  for (let y = input.gate.j; y <= laneJ; y++) {
    if (!terrain.isBuildable(i + 2, y) || terrain.levelAt(i + 2, y) !== 0
      || terrain.isIndoor(i + 2, y) || placement.blocksWalk(i + 2, y)
      || !terrain.isWalkable(i + 2, y)) return { ...original, reason: '매표소 진입로에 다른 시설이나 지형이 있습니다' };
    if (terrain.kindAt(i + 2, y) === 'lawn') terrain.paint(i + 2, y, 'path_stone');
  }
  const check = placement.check(terrain, walls, input.gate, 'ticket', i, j, { facing: 3 });
  if (!check.ok) return { ...original, reason: `매표소 연결 불가: ${check.fail}` };
  placement = PlacementGrid.fromSnapshot({ ...s, items: s.items.map(f => f.handle === booth.handle ? { ...f, i, j, facing: 3 } : f) });
  const doors = DoorSet.fromSnapshot(input.doors);
  // Replace doors belonging to this room; keep doors in other indoor areas.
  for (let y = room.j; y < room.j + room.h; y++) for (let x = room.i; x <= right; x++)
    for (const dir of [0, 1, 2, 3] as const) doors.remove(x, y, dir);
  doors.add(right, laneJ, 0);
  const walkable = guestWalkable(terrain, placement);
  const baked = bakeIndoorWalls(terrain, walls, input.gate, walkable, doors);
  if (!baked.ok) return { ...original, reason: `실내 연결 불가: ${baked.fail}` };
  // Negative control: blocking the ticket lane must disconnect this entire room.
  const blocked = Object.assign((x: number, y: number) => !(x === i && y === laneJ) && walkable(x, y),
    { canCross: walkable.canCross });
  const bypass = reachable(terrain, walls, input.gate, blocked);
  for (let y = room.j; y < room.j + room.h; y++) for (let x = room.i; x <= right; x++)
    if (bypass[y * terrain.width + x]) return { ...original, reason: '매표소를 우회하는 실내 입구가 남아 있습니다' };
  return { terrain, walls, placement, doors: doors.toSnapshot(), changed: true, reason: '' };
}

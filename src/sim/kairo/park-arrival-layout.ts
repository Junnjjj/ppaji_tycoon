import { KairoTerrain } from './terrain.js';
import { PlacementGrid, facilityDef, guestWalkable } from './placement.js';
import { WallGrid, reachable } from './walls.js';
import { DoorSet, type DoorSnapshot } from './doors.js';
import { bakeIndoorWalls } from './indoor.js';
import type { MapType } from './scenario.js';

export function arrangeParkArrival(input: {
  terrain: KairoTerrain; walls: WallGrid; placement: PlacementGrid;
  gate: { i: number; j: number }; doors?: DoorSnapshot; map: MapType;
}) {
  const original = { ...input, doors: input.doors ?? { keys: [] }, changed: false, reason: '' };
  const { gate, map } = input;
  const yardI = KairoTerrain.ENTRY_I - Math.floor(map.start.yard[0] / 2);
  const room = { i: yardI + 1, j: 9, w: map.start.indoor[0], h: map.start.indoor[1] };
  const right = room.i + room.w - 1, bottom = room.j + room.h + 1;
  const insideRoom = (i: number, j: number) => i >= room.i && i <= right && j >= room.j && j < room.j + room.h;
  const ticket = input.placement.all().find(f => f.defId === 'ticket' && f.j === 9 && f.i === right + 1 && f.facing === 3);
  if (!ticket) return { ...original, reason: '현재 매표소 배치를 찾지 못했습니다' };
  for (let j = room.j; j < room.j + room.h; j++) for (let i = room.i; i <= right; i++)
    if (!input.terrain.isIndoor(i, j)) return { ...original, reason: '편집된 실내 바닥을 보존했습니다' };
  const terrain = KairoTerrain.fromSnapshot(input.terrain.toSnapshot());
  const walls = WallGrid.fromSnapshot(input.walls.toSnapshot());
  const source = input.placement.toSnapshot();
  const items = source.items.map(f => f.handle === ticket.handle ? { ...f, i: gate.i - 2, j: gate.j + 1, facing: 0 as const }
    : insideRoom(f.i, f.j) ? { ...f, j: f.j + 2 } : { ...f });
  const occupied = new Set<string>();
  for (const f of items) {
    const def = facilityDef(f.defId)!;
    for (const [i, j] of PlacementGrid.footprintTiles(def, f.i, f.j, f.facing ?? 0)) {
      const key = `${i},${j}`;
      if (occupied.has(key)) return { ...original, reason: '실내 이동 위치에 다른 시설이 있습니다' };
      occupied.add(key);
    }
  }
  for (let j = room.j; j <= bottom; j++) for (let i = room.i; i <= right; i++) {
    if (terrain.levelAt(i, j) !== 0 || !terrain.isBuildable(i, j) || !terrain.isWalkable(i, j))
      return { ...original, reason: '실내 이동에 필요한 평지가 없습니다' };
    if (j >= room.j + room.h && input.placement.handleAt(i, j))
      return { ...original, reason: '실내 아래에 다른 시설이 있습니다' };
    terrain.paint(i, j, j >= room.j + 2 ? 'floor_indoor' : 'path_stone');
  }
  const placement = PlacementGrid.fromSnapshot({ ...source, items });
  // Retire the short approach laid for the rejected side-facing booth.
  for (let j = 9; j < bottom; j++) for (let i = right + 1; i <= right + 4; i++) {
    if (!placement.handleAt(i, j) && terrain.kindAt(i, j) === 'path_stone') terrain.paint(i, j, 'lawn');
  }

  // The old side approach must not bypass the north ticket lane.
  for (let i = yardI - 1; i <= right + 4; i++) {
    if (i === gate.i || placement.handleAt(i, gate.j + 1)) continue;
    if (terrain.kindAt(i, gate.j + 1) === 'path_stone') terrain.paint(i, gate.j + 1, 'lawn');
  }
  for (let j = gate.j; j <= room.j + 1; j++) terrain.paint(gate.i, j, 'path_stone');
  // Southern indoor door → outdoor terrace → original shore path.
  for (let i = yardI; i <= gate.i; i++) {
    if (placement.blocksWalk(i, bottom + 1) || !terrain.isWalkable(i, bottom + 1)
      || terrain.levelAt(i, bottom + 1) !== 0) return { ...original, reason: '실내 아래 통로가 막혀 있습니다' };
    terrain.paint(i, bottom + 1, 'path_stone');
  }
  const doors = DoorSet.fromSnapshot(input.doors);
  for (let j = room.j; j <= bottom; j++) for (let i = room.i; i <= right; i++)
    for (const d of [0, 1, 2, 3] as const) doors.remove(i, j, d);
  doors.add(gate.i, room.j + 2, 3);
  doors.add(gate.i, bottom, 1);
  const walk = guestWalkable(terrain, placement);
  const baked = bakeIndoorWalls(terrain, walls, gate, walk, doors);
  if (!baked.ok) return { ...original, reason: `실내 통로 연결 실패: ${baked.fail}` };
  const blocked = Object.assign((i: number, j: number) => !(i === gate.i && j === gate.j + 1) && walk(i, j), { canCross: walk.canCross });
  const bypass = reachable(terrain, walls, gate, blocked);
  if (bypass[(room.j + 2) * terrain.width + gate.i] || bypass[(bottom + 1) * terrain.width + gate.i])
    return { ...original, reason: '매표소 우회 경로가 남아 있습니다' };
  return { ...input, terrain, walls, placement, doors: doors.toSnapshot(), changed: true, reason: '' };
}

/** Authored decoration clusters; keep the central aisle and original shoreline open. */
export function decorateParkArrival(terrain: KairoTerrain, walls: WallGrid, placement: PlacementGrid, gate: {i: number; j: number}) {
  const plan: [string, number, number, 0 | 1 | 2 | 3][] = [
    ['flower_pot', -4, 0, 0], ['flower_pot', 2, 0, 0],
    ['pine', -10, 3, 0], ['shrubs', -7, 4, 0], ['long_flowerbed', -6, 5, 1],
    ['deciduous', 8, 3, 0], ['shrubs', 7, 5, 0], ['long_flowerbed', 6, 6, 1],
    ['flower_pot', -5, 8, 0], ['flower_pot', 4, 8, 0],
    ['street_lamp', -6, 9, 0], ['street_lamp', 5, 9, 0],
    ['bench', -4, 10, 0], ['long_flowerbed', -4, 11, 0],
    ['bench', 2, 10, 0], ['long_flowerbed', 2, 11, 0],
    ['deciduous', -10, 11, 0], ['shrubs', -8, 13, 0], ['rocks', -11, 14, 0],
    ['pine', 9, 10, 0], ['shrubs', 8, 12, 0], ['rocks', 9, 13, 0],
    ['willow', -9, 17, 0], ['shrubs', -7, 18, 0], ['bench', -4, 17, 0],
    ['willow', 6, 17, 0], ['shrubs', 8, 19, 0], ['bench', 3, 17, 0],
    ['flower_pot', -4, 15, 0], ['flower_pot', 3, 15, 0],
    ['street_lamp', -6, 16, 0], ['street_lamp', 5, 16, 0],
    ['deciduous', 0, 14, 0], ['shrubs', 2, 15, 0],
    ['pine', -24, 3, 0], ['deciduous', -20, 6, 0], ['shrubs', -22, 7, 0],
    ['pine', -17, 11, 0], ['rocks', -20, 13, 0], ['deciduous', -27, 12, 0],
    ['shrubs', -25, 15, 0], ['pine', -32, 8, 0], ['rocks', -29, 6, 0],
    ['pine', 20, 3, 0], ['deciduous', 25, 6, 0], ['shrubs', 23, 8, 0],
    ['pine', 17, 11, 0], ['rocks', 20, 13, 0], ['deciduous', 29, 12, 0],
    ['shrubs', 27, 15, 0], ['pine', 32, 8, 0], ['rocks', 29, 6, 0],
  ];
  let added = 0;
  for (const [name, di, dj, facing] of plan) {
    const i = gate.i + di, j = gate.j + dj, defId = `env_${name}`, def = facilityDef(defId)!;
    if (PlacementGrid.footprintTiles(def, i, j, facing).some(([x,y]) => terrain.kindAt(x,y) !== 'lawn' && !(name === 'flower_pot' && terrain.kindAt(x,y) === 'path_stone'))) continue;
    const result = placement.check(terrain, walls, gate, defId, i, j, { facing });
    if (!result.ok && result.fail !== 'unreachable') continue;
    // Decorations on grass occupy real cells but do not require a guest service approach.
    {
      // Rebuild only the placement snapshot; no terrain edits or invisible collision overlays.
      const s = placement.toSnapshot();
      const restored = PlacementGrid.fromSnapshot({ ...s, next: s.next + 1,
        items: [...s.items, { handle: s.next, defId, i, j, facing, arrivalDecoration: {defId,i,j,facing} }] });
      placement = restored;
      added++;
    }
  }
  return { placement, added };
}

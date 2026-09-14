import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';
import type { KairoTerrain } from '../sim/kairo/terrain.js';
import type { WallGrid } from '../sim/kairo/walls.js';

const EXPANDED = new Set(['jjimjilbang', 'shade_net', 'mongol_tent']);

/** Old saves retain handles, upgrades and menus; only expanded footprints may move. */
export function migrateFacilityFootprints(
  snapshot: PlacementSnapshot,
  terrain: KairoTerrain,
  walls: WallGrid,
  gate: { i: number; j: number },
): PlacementSnapshot {
  if ((snapshot.footprintRevision ?? 0) >= 1) return snapshot;
  const pending = snapshot.items.filter((item) => EXPANDED.has(item.defId));
  if (!pending.length) return { ...snapshot, footprintRevision: 1 };
  const kept = snapshot.items.filter((item) => !EXPANDED.has(item.defId));
  const moved = new Map<number, (typeof snapshot.items)[number]>();
  for (const item of [...pending].sort((a, b) => a.handle - b.handle)) {
    const grid = PlacementGrid.fromSnapshot({ ...snapshot, items: kept });
    const positions: [number, number][] = [];
    for (let j = 0; j < snapshot.h; j++) {
      for (let i = 0; i < snapshot.w; i++) positions.push([i, j]);
    }
    positions.sort((a, b) =>
      (Math.abs(a[0] - item.i) + Math.abs(a[1] - item.j)) -
      (Math.abs(b[0] - item.i) + Math.abs(b[1] - item.j)) || a[1] - b[1] || a[0] - b[0]);
    const position = positions.find(([i, j]) =>
      grid.check(terrain, walls, gate, item.defId, i, j, { facing: item.facing ?? 0 }).ok);
    if (!position) {
      throw new Error(`${item.defId}: 새 설치 크기를 배치할 공간이 없어 저장 복원을 중단했습니다. 원본 저장은 유지됩니다.`);
    }
    const next = { ...item, i: position[0], j: position[1] };
    kept.push(next);
    moved.set(item.handle, next);
  }
  return { ...snapshot, footprintRevision: 1, items: snapshot.items.map((item) => moved.get(item.handle) ?? item) };
}

import { describe, expect, it } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { PlacementGrid, allFacilityDefs, guestWalkable } from './placement.js';
import { WallGrid, reachable } from './walls.js';
import { bakeIndoorWalls, cycleIndoorPassage } from './indoor.js';
import { DoorSet } from './doors.js';
import { requiredGrade } from './progress.js';

describe('가평 경계와 독립 장식', () => {
  it('29개 환경 배치 항목은 손님을 수용하지 않는 4방향 장식이고 처음부터 건설 가능하다', () => {
    const defs = allFacilityDefs().filter(d => d.id.startsWith('env_'));
    expect(defs).toHaveLength(29);
    for (const d of defs) {
      expect(d.facings, d.id).toBe(4);
      expect(d.capacity, d.id).toBe(0);
      expect(d.slots, d.id).toEqual([]);
      expect(requiredGrade(d.id), d.id).toBe(1);
    }
  });
  it('울타리·화분은 별도 칸을 차지하고 저장 복원 후에도 통로 양쪽을 막을 수 없다', () => {
    const t = new KairoTerrain(24, 24), w = new WallGrid(24, 24), p = new PlacementGrid(24, 24), doors = new DoorSet();
    const gate = { i: 10, j: 2 };
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) t.paint(i, j, 'path_stone');
    for (let j = 8; j <= 10; j++) for (let i = 8; i <= 13; i++) t.paint(i, j, 'floor_indoor');
    expect(bakeIndoorWalls(t, w, gate, guestWalkable(t, p)).ok).toBe(true);
    expect(cycleIndoorPassage(t, w, gate, doors, 10, 11, p).ok).toBe(true);
    expect(p.place(t, w, gate, 'env_wood_fence', 15, 10, { facing: 2 }).ok).toBe(true);
    expect(p.place(t, w, gate, 'env_flower_pot', 14, 10).ok).toBe(true);
    const restored = PlacementGrid.fromSnapshot(p.toSnapshot());
    expect(restored.at(15, 10)?.facing).toBe(2);
    expect(restored.blocksWalk(15, 10)).toBe(true);
    expect(restored.blocksWalk(14, 10)).toBe(true);
    expect(reachable(t, w, gate, guestWalkable(t, restored))[11 * 24 + 10]).toBe(1);
    for (const j of [10, 11]) expect(restored.check(t, w, gate, 'env_flower_pot', 10, j)).toMatchObject({ ok: false, fail: 'blocks-door' });
  });
});

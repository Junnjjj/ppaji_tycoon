import { describe, expect, it } from 'vitest';
import { allFacilityDefs, PlacementGrid } from '../sim/kairo/placement.js';
import {
  EXPECTED_REVIEW_FACILITIES,
  fourDirectionReviewLayout,
} from './kairo-asset-review.js';

describe('4방향 시설 실제 맵 리뷰 배치', () => {
  it('승인된 20종을 d0~d3로 한 번씩 배치한다', () => {
    const groups = fourDirectionReviewLayout(allFacilityDefs());
    expect(groups).toHaveLength(EXPECTED_REVIEW_FACILITIES);
    expect(groups.flatMap((group) => group.placements)).toHaveLength(80);
    for (const group of groups) {
      expect(group.placements.map((placement) => placement.facing)).toEqual([0, 1, 2, 3]);
    }
  });

  it('모든 발자국이 96×72 격자 안에 있고 서로 겹치지 않는다', () => {
    const defs = new Map(allFacilityDefs().map((def) => [def.id, def]));
    const groups = fourDirectionReviewLayout([...defs.values()]);
    const occupied = new Set<string>();
    for (const placement of groups.flatMap((group) => group.placements)) {
      const def = defs.get(placement.defId)!;
      for (const [i, j] of PlacementGrid.footprintTiles(
        def,
        placement.i,
        placement.j,
        placement.facing,
      )) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(96);
        expect(j).toBeGreaterThanOrEqual(8);
        expect(j).toBeLessThan(72);
        const key = `${i},${j}`;
        expect(occupied.has(key), `발자국 중복 ${key}`).toBe(false);
        occupied.add(key);
      }
    }
  });
});

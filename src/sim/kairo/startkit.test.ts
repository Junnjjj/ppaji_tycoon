import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, reachable } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { CourseStore } from './course.js';
import { MAP_TYPES, mapType } from './scenario.js';
import { applyStartKit } from './startkit.js';
import { GRADES, landRect } from './progress.js';

/**
 * 물려받은 빠지 (K30).
 *
 * **이 테스트의 이유:** 빈 땅에서 시작하면 위생 시설 9종이 전부 `needs-indoor` 로
 * 막히는데 첫 의뢰가 "기본 위생 3개"였다. 실측으로 확인한 버그다.
 */

const GRID_W = 64;
const GRID_H = 48;
const GATE = { i: 0, j: 0 };
const SEEDS = [1, 7, 42, 100, 2026, 31337, 777, 5];

function world(mapId: string, seed: number): {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  c: CourseStore;
  map: ReturnType<typeof mapType>;
} {
  const map = mapType(mapId);
  const t = KairoTerrain.generate(GRID_W, GRID_H, new Rng(seed).fork(1), map);
  return { t, w: new WallGrid(GRID_W, GRID_H), p: new PlacementGrid(GRID_W, GRID_H), c: new CourseStore(), map };
}

function kit(mapId: string, seed: number): ReturnType<typeof applyStartKit> & {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  c: CourseStore;
} {
  const { t, w, p, c, map } = world(mapId, seed);
  const r = applyStartKit({ terrain: t, walls: w, placement: p, gate: GATE, map, courses: c });
  return { ...r, t, w, p, c };
}

describe('★ 위생 시설을 놓을 수 있다 — 이게 이 킷의 이유다', () => {
  it('킷을 적용하면 화장실·샤워실이 놓인다 (맵 3종 × 시드 8개)', () => {
    const bad: string[] = [];
    for (const m of MAP_TYPES) {
      for (const seed of SEEDS) {
        const k = kit(m.id, seed);
        const land = landRect(GRADES[0]!);
        let toilet = false;
        let shower = false;
        for (let j = 0; j < land.h && !(toilet && shower); j++) {
          for (let i = 0; i < land.w; i++) {
            if (!toilet && k.p.check(k.t, k.w, GATE, 'toilet', i, j, { land }).ok) toilet = true;
            if (!shower && k.p.check(k.t, k.w, GATE, 'shower_row', i, j, { land }).ok) shower = true;
          }
        }
        if (!toilet || !shower) bad.push(`${m.id}/${seed} 화장실 ${toilet} 샤워 ${shower}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('⚠ 음성 대조군 — 킷이 없으면 막힌다 (검사가 유의미한가)', () => {
    /*
     * 이걸 안 넣으면 "원래 되는 것"과 구분이 안 된다. 실제로 빈 땅에서는
     * `needs-indoor` 로 전부 거절된다 — 그게 이 작업의 출발점이었다.
     */
    for (const m of MAP_TYPES) {
      const { t, w, p } = world(m.id, 42);
      const land = landRect(GRADES[0]!);
      let any = false;
      for (let j = 0; j < land.h && !any; j++) {
        for (let i = 0; i < land.w; i++) {
          if (p.check(t, w, GATE, 'toilet', i, j, { land }).ok) {
            any = true;
            break;
          }
        }
      }
      expect(any, `${m.id} — 킷 없이도 놓인다면 이 킷은 필요 없다`).toBe(false);
      expect(p.check(t, w, GATE, 'toilet', 3, 3, { land }).fail).toBe('needs-indoor');
    }
  });
});

describe('킷이 온전히 들어간다', () => {
  it('맵 3종 × 시드 8개에서 빠진 것이 없다', () => {
    const bad: string[] = [];
    for (const m of MAP_TYPES) {
      for (const seed of SEEDS) {
        const k = kit(m.id, seed);
        if (k.skipped.length > 0) bad.push(`${m.id}/${seed}: ${k.skipped.join(',')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('실내 칸과 시설이 실제로 생긴다', () => {
    for (const m of MAP_TYPES) {
      const k = kit(m.id, 42);
      expect(k.indoorTiles, `${m.id} 실내 칸`).toBeGreaterThan(0);
      expect(k.facilities, `${m.id} 시설`).toBeGreaterThan(0);
      // 실내 칸 수가 데이터와 맞는다
      expect(k.indoorTiles).toBe(m.start.indoor[0] * m.start.indoor[1]);
    }
  });

  it('코스는 맵 데이터가 시킨 대로만 생긴다 — 계곡형은 넓은 수역이 없다', () => {
    for (const m of MAP_TYPES) {
      const k = kit(m.id, 42);
      expect(k.course, `${m.id}`).toBe(m.start.course);
      expect(k.c.count).toBe(m.start.course ? 1 : 0);
    }
  });
});

describe('손님이 물려받은 빠지를 쓸 수 있다', () => {
  it('실내 전 칸에 게이트에서 걸어 닿는다', () => {
    for (const m of MAP_TYPES) {
      for (const seed of [1, 42, 2026]) {
        const k = kit(m.id, seed);
        const seen = reachable(k.t, k.w, GATE, guestWalkable(k.t, k.p));
        for (let j = 0; j < GRID_H; j++) {
          for (let i = 0; i < GRID_W; i++) {
            if (!k.t.isIndoor(i, j)) continue;
            if (k.p.blocksWalk(i, j)) continue; // 시설이 놓인 칸은 막힌 게 아니라 쓰이는 중
            expect(seen[j * GRID_W + i], `${m.id}/${seed} (${i},${j})`).toBe(1);
          }
        }
      }
    }
  });

  it('보고한 시설 수가 실제로 놓인 수와 같다 — 조용히 빠지면 못 찾는다', () => {
    for (const m of MAP_TYPES) {
      const k = kit(m.id, 42);
      expect(k.p.count, m.id).toBe(k.facilities);
    }
  });
});

describe('결정론 — 같은 맵·같은 시드는 같은 배치', () => {
  it('두 번 돌려도 지형·벽·시설이 같다', () => {
    for (const m of MAP_TYPES) {
      const a = kit(m.id, 2026);
      const b = kit(m.id, 2026);
      expect(a.t.toSnapshot()).toEqual(b.t.toSnapshot());
      expect(a.w.toSnapshot()).toEqual(b.w.toSnapshot());
      expect(a.p.toSnapshot()).toEqual(b.p.toSnapshot());
      expect(a.c.toSnapshot()).toEqual(b.c.toSnapshot());
    }
  });

  it('맵마다 배치가 실제로 다르다 — 같으면 "맵마다"가 이름표다', () => {
    const sigs = MAP_TYPES.map((m) => JSON.stringify(kit(m.id, 2026).p.toSnapshot()));
    expect(new Set(sigs).size).toBe(MAP_TYPES.length);
  });
});

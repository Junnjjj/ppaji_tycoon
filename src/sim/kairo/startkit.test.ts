import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, reachable } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { CourseStore } from './course.js';
import { MAP_TYPES, mapType } from './scenario.js';
import { applyStartKit } from './startkit.js';
import { paintFloor } from './indoor.js';
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

/*
 * ─────────────────────────────────────────────────────────────────────────
 * K31 — **처음 세 개를 연달아 놓을 수 있어야 한다.**
 *
 * 직접 플레이하다 막혔다: 화장실을 놓으면 샤워실 자리가 없었다. 5×3 방에서는 화장실
 * 하나 뒤 실내 시설 9종 중 **4종만** 남았고, 4칸짜리(샤워·락커)는 즉시 사라졌다.
 * 넓히는 것이 게임이지, 못 놓는 것이 게임은 아니다.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** 방 안에서 놓을 수 있는 첫 자리에 놓는다 */
function placeIndoor(
  k: { t: KairoTerrain; w: WallGrid; p: PlacementGrid },
  defId: string,
): boolean {
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) {
      if (!k.t.isIndoor(i, j)) continue;
      if (k.p.place(k.t, k.w, GATE, defId, i, j).ok) return true;
    }
  }
  return false;
}

describe('★ 시작 방에 처음 세 개가 연달아 들어간다', () => {
  const FIRST_THREE = ['toilet', 'shower_row', 'locker_row'];

  it('맵 3종 × 시드 8개에서 화장실 → 샤워실 → 락커가 이어진다', () => {
    const bad: string[] = [];
    for (const m of MAP_TYPES) {
      for (const seed of SEEDS) {
        const k = kit(m.id, seed);
        const placed = FIRST_THREE.filter((id) => placeIndoor(k, id));
        if (placed.length < FIRST_THREE.length) {
          bad.push(`${m.id}/${seed}: ${placed.join('→') || '없음'}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('⚠ 음성 대조군 — 방이 5×3 이면 둘째부터 막힌다 (검사가 유의미한가)', () => {
    /*
     * 안 넣으면 "원래 되는 것"과 구분이 안 된다. 5×3 은 K31 이전 값이고, 실측으로
     * 화장실 하나 뒤 9종 중 4종만 남았다.
     */
    const { t, w, p, map } = world('bukhan', 42);
    const small = { ...map, start: { ...map.start, indoor: [5, 3] as const } };
    applyStartKit({ terrain: t, walls: w, placement: p, gate: GATE, map: small });
    const k = { t, w, p };
    expect(placeIndoor(k, 'toilet')).toBe(true);
    expect(placeIndoor(k, 'shower_row'), '5×3 인데 샤워실이 들어가면 이 검사는 무의미하다').toBe(
      false,
    );
  });

  it('방이 차면 못 놓고, 바닥을 더 깔면 다시 놓인다 — 이게 확장 루프다', () => {
    const k = kit('bukhan', 42);
    // 들어갈 때까지 계속 놓아 방을 채운다
    let n = 0;
    while (n < 20 && placeIndoor(k, 'washbasin_row')) n++;
    expect(n).toBeGreaterThan(0);
    expect(placeIndoor(k, 'washbasin_row')).toBe(false); // 이제 자리가 없다

    /*
     * 방을 넓힌다 — 아래쪽 가장자리 **바깥**에 한 줄 더 깐다.
     * (첫 실내 칸 아래는 아직 방 안이라 아무 일도 안 일어난다 — 처음에 그렇게 짜서 0 이 나왔다)
     */
    let grown = 0;
    for (let i = 0; i < GRID_W && grown < 6; i++) {
      let bottom = -1;
      for (let j = 0; j < GRID_H; j++) if (k.t.isIndoor(i, j)) bottom = j;
      if (bottom < 0) continue;
      if (
        paintFloor(k.t, k.w, GATE, i, bottom + 1, 'floor_indoor', guestWalkable(k.t, k.p)).changed
      ) {
        grown++;
      }
    }
    expect(grown, '방을 넓히지 못하면 확장 루프가 성립하지 않는다').toBeGreaterThan(0);
    expect(placeIndoor(k, 'washbasin_row')).toBe(true);
  });
});

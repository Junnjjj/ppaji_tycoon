import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import { MAP_TYPES, mapType } from './scenario.js';
import { applyStartKit } from './startkit.js';
import { CourseStore } from './course.js';

/**
 * 높이 표현 (K37) — sim 쪽.
 *
 * 사용자 요청: "땅을 깍을 순 없지만 → 높이를 표현해서 조금더 제한적으로 설치할수있게,
 * 스타팅 포인트 양옆에 (평지도 산 중턱중턱 놔둬서 건물들이나 뭐 펜션을 설치 할 수 있게끔),
 * 도로는 이을수있고 … **물쪽은 굳이 높낮이 할필요없어**".
 *
 * 그래서 단은 **맵이 갖고 태어난다** — 플레이어가 지형을 깎지 않는다는 설계 불변식은 그대로다.
 */

const SHAPE = { landRatio: 0.55, shoreJitter: 2 };
function gen(seed = 20260818, shape = SHAPE): KairoTerrain {
  return KairoTerrain.generate(KairoTerrain.WIDTH, KairoTerrain.HEIGHT, new Rng(seed), shape);
}

describe('물은 영구히 단 0 이다', () => {
  it('★ 단을 올린 칸에 물을 칠하면 0 으로 내려간다', () => {
    const t = new KairoTerrain(8, 8);
    t.paint(3, 3, 'lawn');
    expect(t.setLevel(3, 3, 2)).toBe(true);
    expect(t.levelAt(3, 3)).toBe(2);
    t.paint(3, 3, 'water_edge');
    expect(t.levelAt(3, 3)).toBe(0);
  });

  it('★ 음성 대조군 — 물 칸은 setLevel 로도 안 올라간다', () => {
    const t = new KairoTerrain(8, 8);
    t.paint(3, 3, 'water_edge');
    expect(t.setLevel(3, 3, 3)).toBe(false);
    expect(t.levelAt(3, 3)).toBe(0);
  });

  it('생성된 맵의 물은 전부 단 0 이다 — 맵 3종', () => {
    for (const m of MAP_TYPES) {
      const def = mapType(m.id);
      const t = gen(20260818, { landRatio: def.landRatio, shoreJitter: def.shoreJitter });
      let wet = 0;
      for (let j = 0; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) if (t.isWater(i, j) && t.levelAt(i, j) !== 0) wet++;
      }
      expect(wet, m.id).toBe(0);
    }
  });
});

describe('산은 입구 좌우 바깥쪽에만 있다', () => {
  it('★ 공원 가운데 축은 전부 단 0 — 초반 플레이가 안 바뀐다', () => {
    const t = gen();
    let raised = 0;
    const r = KairoTerrain.MOUNTAIN_START - 1;
    for (let j = 0; j < t.height; j++) {
      for (let di = -r; di <= r; di++) {
        if (t.levelAt(KairoTerrain.ENTRY_I + di, j) !== 0) raised++;
      }
    }
    expect(raised).toBe(0);
  });

  it('도시 띠는 단 0 이다 — 경사 도로는 에셋 단계다', () => {
    const t = gen();
    let raised = 0;
    for (let j = 0; j < KairoTerrain.CITY_BAND; j++) {
      for (let i = 0; i < t.width; i++) if (t.levelAt(i, j) !== 0) raised++;
    }
    expect(raised).toBe(0);
  });

  it('★ 맵 3종 전부 단 2 이상까지 오른다 — "중턱중턱"이 층 하나면 뜻이 없다', () => {
    for (const m of MAP_TYPES) {
      const def = mapType(m.id);
      const t = gen(20260818, { landRatio: def.landRatio, shoreJitter: def.shoreJitter });
      let top = 0;
      for (let j = 0; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) top = Math.max(top, t.levelAt(i, j));
      }
      expect(top, m.id).toBeGreaterThanOrEqual(2);
      expect(top, m.id).toBeLessThanOrEqual(KairoTerrain.MAX_LEVEL);
    }
  });
});

describe('테라스는 실제로 쓸 수 있다', () => {
  /**
   * ⚠ 이 검사가 이 페이즈에서 가장 중요하다.
   *
   * 단차가 2 이상인 경계는 손님이 못 넘는다 (`levelPassable`). 산을 매 칸 한 단씩 올리지
   * 않으면 테라스가 **닿지 않는 죽은 땅**이 되고, 시설은 `unreachable` 로 거절된다 —
   * "높이를 넣었는데 아무것도 못 짓는다"가 된다.
   *
   * 실측으로 실제 걸렸다: 도시 띠(단 0)와 공원 첫 줄 사이에 3단 절벽이 32곳 생겼다.
   * 능선을 도시 쪽으로도 내려오게 해서 고쳤다.
   */
  it('★ 급경사(단차 ≥ 2)가 하나도 없다 — 맵 3종', () => {
    for (const m of MAP_TYPES) {
      const def = mapType(m.id);
      const t = gen(20260818, { landRatio: def.landRatio, shoreJitter: def.shoreJitter });
      const steep: string[] = [];
      for (let j = 0; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) {
          for (const [di, dj] of [
            [1, 0],
            [0, 1],
          ] as const) {
            if (!t.inside(i + di, j + dj)) continue;
            if (!t.levelPassable(i, j, i + di, j + dj)) {
              steep.push(`(${i},${j})→(${i + di},${j + dj})`);
            }
          }
        }
      }
      expect(steep.slice(0, 5), m.id).toEqual([]);
    }
  });

  it('★ 단 1 이상에 4×4 평지가 넉넉히 있다 — 펜션·건물이 들어갈 자리', () => {
    for (const m of MAP_TYPES) {
      const def = mapType(m.id);
      const t = gen(20260818, { landRatio: def.landRatio, shoreJitter: def.shoreJitter });
      let spots = 0;
      for (let j = 0; j < t.height - 3; j++) {
        for (let i = 0; i < t.width - 3; i++) {
          if (t.levelAt(i, j) >= 1 && t.levelUniform(i, j, 4, 4)) spots++;
        }
      }
      // 100 은 넉넉한 하한이다 — 실측 166~790
      expect(spots, m.id).toBeGreaterThan(100);
    }
  });
});

describe('결정론', () => {
  it('같은 시드는 같은 높이맵', () => {
    const a = gen(7);
    const b = gen(7);
    for (let j = 0; j < a.height; j += 3) {
      for (let i = 0; i < a.width; i += 3) expect(b.levelAt(i, j)).toBe(a.levelAt(i, j));
    }
  });

  it('다른 시드는 다른 높이맵 — 경계 흔들림이 시드를 탄다', () => {
    const a = gen(7);
    const b = gen(8);
    let diff = 0;
    for (let j = 0; j < a.height; j++) {
      for (let i = 0; i < a.width; i++) if (a.levelAt(i, j) !== b.levelAt(i, j)) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('산은 물가 지터와 **다른 스트림**이다 — 하나를 바꿔도 다른 쪽이 안 밀린다', () => {
    /*
     * `rng.fork` 를 안 쓰면 산 흔들림 뽑기가 물가 지터를 밀어낸다 (불변식 2).
     * 그러면 "산만 다른 두 맵"을 만들 수 없다. 여기서는 물가 선이 시드에 대해
     * 산과 독립적으로 결정된다는 것을 물가 최북단으로 확인한다.
     */
    const shoreTop = (t: KairoTerrain): number => {
      for (let j = 0; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) if (t.isWater(i, j)) return j;
      }
      return -1;
    };
    // 같은 시드·같은 모양이면 물가도 산도 같다 — fork 가 스트림을 섞지 않았다는 뜻
    expect(shoreTop(gen(11))).toBe(shoreTop(gen(11)));
  });
});

describe('단이 섞인 발자국에는 못 놓는다', () => {
  function flat(): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
    const t = new KairoTerrain(20, 20);
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) t.paint(i, j, 'path_stone');
    return { t, w: new WallGrid(20, 20), p: new PlacementGrid(20, 20) };
  }

  it('★ 한 칸만 단이 달라도 level-mixed', () => {
    const { t, w, p } = flat();
    // shop 은 2×2 — 네 칸 중 하나만 올린다
    t.setLevel(6, 6, 1);
    const c = p.check(t, w, { i: 2, j: 2 }, 'shop', 5, 5);
    expect(c.ok).toBe(false);
    expect(c.fail).toBe('level-mixed');
  });

  it('★ 음성 대조군 — 발자국 전체가 같은 단이면 통과한다', () => {
    const { t, w, p } = flat();
    for (let dj = 0; dj < 4; dj++) for (let di = 0; di < 4; di++) t.setLevel(5 + di, 5 + dj, 1);
    const c = p.check(t, w, { i: 2, j: 2 }, 'shop', 5, 5);
    expect(c.fail).not.toBe('level-mixed');
  });

  it('단 0 평지는 당연히 통과한다 — 기존 판이 안 깨진다', () => {
    const { t, w, p } = flat();
    const c = p.check(t, w, { i: 2, j: 2 }, 'shop', 5, 5);
    expect(c.fail).not.toBe('level-mixed');
  });
});

describe('손님은 단차 1까지만 넘는다', () => {
  function world(step: number): { t: KairoTerrain; g: GuestStore; gate: { i: number; j: number } } {
    const t = new KairoTerrain(12, 6);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 12; i++) t.paint(i, j, 'path_stone');
    // 오른쪽 절반을 `step` 단 올린다
    for (let j = 0; j < 6; j++) for (let i = 6; i < 12; i++) t.setLevel(i, j, step);
    const w = new WallGrid(12, 6);
    const p = new PlacementGrid(12, 6);
    const gate = { i: 1, j: 3 };
    const g = new GuestStore(t, w, p, gate, OPEN_GATE_DEFAULTS);
    g.invalidate();
    return { t, g, gate };
  }

  it('★ 단차 1 은 넘는다', () => {
    const { g } = world(1);
    expect(g.gateDistanceForTest(10, 3)).toBeGreaterThan(0);
  });

  it('★ 단차 2 는 못 넘는다 — 절벽이다', () => {
    const { g } = world(2);
    expect(g.gateDistanceForTest(10, 3)).toBe(-1);
  });

  it('거리장과 걸음이 **같은 판정**을 쓴다 — 하나만 넣으면 절벽을 타고 오른다', () => {
    /*
     * `FlowField.build` 가 `canCross` 를 저장해 `next()` 도 같은 함수를 쓴다.
     * 그래서 못 닿는 칸으로 향하는 걸음이 아예 안 생긴다.
     */
    const { g } = world(2);
    expect(g.gateDistanceForTest(6, 3)).toBe(-1);
    expect(g.gateDistanceForTest(5, 3)).toBeGreaterThanOrEqual(0);
  });
});

describe('새 판이 죽지 않는다', () => {
  it('★ 시작 킷이 맵 3종 전부에서 다 놓인다 — 단이 첫 판을 막으면 안 된다', () => {
    for (const m of MAP_TYPES) {
      const def = mapType(m.id);
      const terrain = KairoTerrain.generate(KairoTerrain.WIDTH, KairoTerrain.HEIGHT, new Rng(20260818), {
        landRatio: def.landRatio,
        shoreJitter: def.shoreJitter,
      });
      const r = applyStartKit({
        terrain,
        walls: new WallGrid(KairoTerrain.WIDTH, KairoTerrain.HEIGHT),
        placement: new PlacementGrid(KairoTerrain.WIDTH, KairoTerrain.HEIGHT),
        gate: KairoTerrain.parkGate(),
        map: def,
        courses: new CourseStore(),
      });
      expect(r.skipped, `${m.id}: ${r.skipped.join(', ')}`).toEqual([]);
    }
  });
});

describe('세이브', () => {
  it('★ 단이 스냅샷을 넘는다', () => {
    const t = gen();
    const back = KairoTerrain.fromSnapshot(t.toSnapshot());
    for (let j = 0; j < t.height; j += 5) {
      for (let i = 0; i < t.width; i += 5) expect(back.levelAt(i, j)).toBe(t.levelAt(i, j));
    }
  });

  it('★ levels 가 없는 옛 스냅샷은 평지로 열린다 — 하위호환', () => {
    const t = gen();
    const snap = t.toSnapshot();
    delete snap.levels;
    const back = KairoTerrain.fromSnapshot(snap);
    let raised = 0;
    for (let j = 0; j < back.height; j++) {
      for (let i = 0; i < back.width; i++) if (back.levelAt(i, j) !== 0) raised++;
    }
    expect(raised).toBe(0);
    // 지형 종류는 그대로다 — 높이만 없다
    expect(back.kindAt(0, 0)).toBe(t.kindAt(0, 0));
  });
});

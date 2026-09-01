import { describe, it, expect, afterEach } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  guestWalkable,
  setEntryFaultForTest,
} from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';

/**
 * 손님이 **앞면으로 들어간다** (K52 4단계 — 거리장 목적지 좁히기).
 *
 * `rebuildFields()` 가 시설마다 발자국 4이웃 전부를 목적지로 두던 것을 **앞 두 면**
 * (`entryTilesOf`)으로 좁혔다. `dist === 0` 이 곧 도착이므로 그전에는 면·방향 구분이
 * 아예 없었고 손님이 건물 뒷면으로 들어갔다.
 *
 * ⚠ **손님을 실제로 굴려서 잰다** (`ride.test.ts` 와 같은 방식). `entryTilesOf` 를 두 번
 * 불러 같은지 보는 검사는 배선이 통째로 빠져도 통과한다 — 도착 칸은 **손님에게서** 읽는다.
 */

const GATE = { i: 0, j: 0 };
const SIZE = 24;

interface World {
  t: KairoTerrain;
  walls: WallGrid;
  p: PlacementGrid;
}

/** 사방이 포장된 평지 — 걸을 수 있는 칸이 격자 전체라 "면"만이 변수다 */
function paved(): World {
  const t = new KairoTerrain(SIZE, SIZE);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) t.paint(i, j, 'path_stone');
  }
  return { t, walls: new WallGrid(SIZE, SIZE), p: new PlacementGrid(SIZE, SIZE) };
}

const key = (t: readonly [number, number]): string => `${t[0]},${t[1]}`;

/** 발자국 4이웃 — 좁히기 **이전**의 목적지 집합 (폴백이 되돌아가는 그 집합) */
function allNeighborKeys(defId: string, i: number, j: number, facing: 0 | 1): Set<string> {
  const def = facilityDef(defId)!;
  const out = new Set<string>();
  const foot = new Set(PlacementGrid.footprintTiles(def, i, j, facing).map(key));
  for (const [ti, tj] of PlacementGrid.footprintTiles(def, i, j, facing)) {
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = key([ti + di, tj + dj]);
      if (!foot.has(k)) out.add(k);
    }
  }
  return out;
}

/**
 * 손님이 `'using'` 으로 넘어가기 **직전에 서 있던 칸**을 모은다.
 *
 * ⚠ **전이 직후의 `(i,j)` 를 읽으면 안 된다** (K52 5단계). 손님은 이제 이용을 시작하는
 * 그 tick 에 **슬롯 칸으로 옮겨 앉으므로**(`enterFacility`), 전이 후의 칸은 발자국 **안**
 * 이다 — 예전엔 제자리에 서 있어서 우연히 같았다. 우리가 재려는 것은 **어디로 들어갔나**
 * 이지 어디에 앉았나가 아니다.
 *
 * 전이가 일어나는 tick 에는 걸음이 없다 (`field.arrived` 면 `next()` 를 안 부른다) —
 * 그래서 tick 직전의 칸이 곧 도착 칸이다.
 */
function arrivalTiles(world: World, defId: string, i: number, j: number, facing: 0 | 1): string[] {
  const { t, walls, p } = world;
  const r = p.place(t, walls, GATE, defId, i, j, { facing });
  expect(r.ok, `${defId} 가 놓인다 (${JSON.stringify(r)})`).toBe(true);

  const g = new GuestStore(t, walls, p, GATE, {
    ...OPEN_GATE_DEFAULTS,
    wantUses: 1,
    useTicks: 3,
    patienceTicks: 900,
  });
  const rng = new Rng(52);
  const seen = new Set<string>();
  const was = new Map<number, string>();
  const wasAt = new Map<number, string>();
  for (let k = 0; k < 2400; k++) {
    if (k % 8 === 0) g.spawn(rng);
    for (const x of g.all) {
      was.set(x.id, x.state);
      wasAt.set(x.id, `${x.i},${x.j}`);
    }
    g.tick(rng);
    for (const x of g.all) {
      if (x.state === 'using' && was.get(x.id) !== 'using') seen.add(wasAt.get(x.id) as string);
    }
  }
  return [...seen].sort();
}

afterEach(() => setEntryFaultForTest(false));

describe('손님이 앞면으로 들어간다 (K52)', () => {
  it('★ 사방이 뚫린 평지의 cafe 3×2 — 도착 칸이 전부 앞 두 면이다', () => {
    const want = new Set(PlacementGrid.entryTilesOf(facilityDef('cafe')!, 10, 10, 0).map(key));
    const seen = arrivalTiles(paved(), 'cafe', 10, 10, 0);

    expect(seen.length, '이용이 실제로 일어났다').toBeGreaterThan(0);
    for (const k of seen) expect(want.has(k), `${k} 가 입구 칸이 아니다`).toBe(true);
    // 좁혔다는 것의 실질 — 옛 집합은 두 배다
    expect(allNeighborKeys('cafe', 10, 10, 0).size).toBe(2 * want.size);
  });

  it('★ 회전판 — facing=1 에서도 도착 칸이 전부 앞 두 면이다 (전치가 반영됐다)', () => {
    const want = new Set(PlacementGrid.entryTilesOf(facilityDef('cafe')!, 10, 10, 1).map(key));
    const seen = arrivalTiles(paved(), 'cafe', 10, 10, 1);

    expect(seen.length, '이용이 실제로 일어났다').toBeGreaterThan(0);
    for (const k of seen) expect(want.has(k), `${k} 가 입구 칸이 아니다`).toBe(true);
    // 회전이 실제로 다른 칸을 낸다 — 같으면 위 검사가 아무것도 안 재는 것이 된다
    const f0 = new Set(PlacementGrid.entryTilesOf(facilityDef('cafe')!, 10, 10, 0).map(key));
    expect([...want].some((k) => !f0.has(k))).toBe(true);
  });

  it('★ 음성 대조군 — 고장 스위치를 켜면 뒷면 칸이 섞여 나온다', () => {
    const want = new Set(PlacementGrid.entryTilesOf(facilityDef('cafe')!, 10, 10, 0).map(key));
    setEntryFaultForTest(true);
    const seen = arrivalTiles(paved(), 'cafe', 10, 10, 0);

    expect(seen.length, '이용이 실제로 일어났다').toBeGreaterThan(0);
    // 첫 검사가 **실패한다** — 그래야 그 검사가 정말 앞 두 면을 재고 있는 것이다
    const back = seen.filter((k) => !want.has(k));
    expect(back.length, '뒷면 칸이 하나도 안 나왔다').toBeGreaterThan(0);
  });
});

describe('폴백 — 앞면이 막힌 배치에서도 기존 판이 안 죽는다 (K52)', () => {
  /**
   * cafe 3×2 @ (10,10) 의 앞 두 면을 물로 지운다.
   * 앞칸이 하나도 안 남으므로 목적지가 **옛 집합(4이웃 전부)** 으로 되돌아가야 한다.
   */
  function frontBlocked(): World {
    const w = paved();
    for (const [ti, tj] of PlacementGrid.entryTilesOf(facilityDef('cafe')!, 10, 10, 0)) {
      w.t.paint(ti, tj, 'water_edge');
    }
    return w;
  }

  it('★ 앞면이 전부 막히면 뒷면으로 들어간다 — 시설이 죽지 않는다', () => {
    const front = new Set(PlacementGrid.entryTilesOf(facilityDef('cafe')!, 10, 10, 0).map(key));
    const all = allNeighborKeys('cafe', 10, 10, 0);
    const seen = arrivalTiles(frontBlocked(), 'cafe', 10, 10, 0);

    expect(seen.length, '앞면이 막혀도 손님이 도달한다').toBeGreaterThan(0);
    for (const k of seen) {
      expect(front.has(k), `${k} 는 물이라 설 수 없다`).toBe(false);
      expect(all.has(k), `${k} 가 발자국 이웃이 아니다`).toBe(true);
    }
  });

  it('앞면이 안 막힌 같은 배치와 도착 칸이 다르다 — 폴백이 실제로 갈라진다', () => {
    const blocked = new Set(arrivalTiles(frontBlocked(), 'cafe', 10, 10, 0));
    const open = new Set(arrivalTiles(paved(), 'cafe', 10, 10, 0));
    expect([...blocked].some((k) => !open.has(k))).toBe(true);
  });
});

describe('배치 검사와의 정합 — "놓을 수 있었으면 반드시 갈 수 있다" (K52)', () => {
  /** 잔디 섬·물 웅덩이가 섞인 판 — 앞칸이 막히는 배치가 실제로 나오게 한다 */
  function patchy(): World {
    const w = paved();
    for (let i = 4; i < SIZE; i += 5) {
      for (let j = 4; j < SIZE; j += 5) {
        w.t.paint(i, j, 'lawn');
        w.t.paint(i + 1, j, 'water_edge');
        w.t.paint(i, j + 1, 'lawn');
      }
    }
    return w;
  }

  const CANDIDATES = allFacilityDefs().filter(
    (d) =>
      !d.walkOn &&
      d.layer !== 'water' &&
      !d.placement.requiresIndoor &&
      !d.placement.requiresDeck &&
      (d.capacity ?? 0) > 0,
  );

  it('★ check() 가 ok 를 준 자리는 게이트에서 반드시 도달 가능하다 (무작위 200회)', () => {
    expect(CANDIDATES.length).toBeGreaterThan(20);
    const rng = new Rng(4242);
    let placed = 0;
    let fellBack = 0;
    const dead: string[] = [];

    for (let trial = 0; trial < 200; trial++) {
      const { t, walls, p } = patchy();
      const def = CANDIDATES[rng.int(CANDIDATES.length)]!;
      const facing = rng.int(2) as 0 | 1;
      const i = 1 + rng.int(SIZE - 8);
      const j = 1 + rng.int(SIZE - 8);
      if (!p.check(t, walls, GATE, def.id, i, j, { facing }).ok) continue;
      const r = p.place(t, walls, GATE, def.id, i, j, { facing });
      if (!r.ok || !r.placed) continue;
      placed++;

      const g = new GuestStore(t, walls, p, GATE, OPEN_GATE_DEFAULTS);
      const handle = r.placed.handle;
      if (g.facilityDistanceForTest(handle, GATE.i, GATE.j) < 0) {
        dead.push(`${def.id} f${facing} @${i},${j}`);
      }

      // 폴백이 실제로 타는 배치였나 — 앞칸 중 설 수 있고 게이트에서 닿는 것이 없는 경우
      const stand = guestWalkable(t, p);
      const frontOk = PlacementGrid.entryTilesOf(def, i, j, facing).filter(
        ([ni, nj]) => stand(ni, nj) && g.gateDistanceForTest(ni, nj) >= 0,
      );
      if (frontOk.length === 0) fellBack++;
    }

    expect(placed, '놓인 배치가 충분히 많다').toBeGreaterThan(40);
    expect(dead, '놓았는데 손님이 못 가는 시설').toEqual([]);
    // 폴백이 죽은 가지가 아니라는 증거 — 실제로 타는 배치가 이 판에 존재한다
    expect(fellBack, '폴백이 한 번도 안 탔다면 이 검사는 아무것도 안 지킨다').toBeGreaterThan(0);
  });
});

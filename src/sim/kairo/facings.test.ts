import { describe, it, expect, afterEach } from 'vitest';
import {
  PlacementGrid,
  allFacilityDefs,
  facilityDef,
  facingsOf,
  canRotate,
  nextFacing,
  setRideFaultForTest,
  type FacilityFacing,
  type KairoFacilityDef,
} from './placement.js';

/**
 * **4방향 배선** (K53) — 발자국 변환이 `facing 0|1` 에서 `0|1|2|3` 로 넓어졌다.
 *
 * 이 파일이 지키는 것은 셋이다:
 *   ① **켜기 전에는 오늘과 완전히 같다** (`facings` 기본값 2). 데이터에 4가 하나도
 *      없는 상태가 정상이고, 그래서 골든·헤드리스가 바이트 단위로 안 움직인다
 *   ② **켜면 2·3 도 발자국 안이다.** K51 이 데인 자리(전치)를 4방향으로 넓혔으므로
 *      같은 모양의 두 번째 사고(뒤집기 누락)를 여기서 잡는다 — 75종 × 4방향 전수
 *   ③ **세이브가 v7 그대로다.** `0 = w×d`, `1 = d×w` 의 뜻을 보존했으므로 `facing: 1`
 *      인 옛 스냅샷이 같은 발자국으로 열린다
 */

const DEFS = allFacilityDefs();
const FACINGS: FacilityFacing[] = [0, 1, 2, 3];

/** 데이터를 건드리지 않고 "4방향인 척" — 전역 상태를 안 만든다 (골든이 같은 프로세스에 산다) */
function asFourWay(def: KairoFacilityDef): KairoFacilityDef {
  return { ...def, facings: 4 };
}

const key = (t: readonly [number, number]): string => `${t[0]},${t[1]}`;

/** 발자국 격자 좌표 집합 */
function footprint(def: KairoFacilityDef, i: number, j: number, f: FacilityFacing): Set<string> {
  return new Set(PlacementGrid.footprintTiles(def, i, j, f).map(key));
}

describe('① 데이터가 켜기 전 — 동작이 오늘과 같다', () => {
  it('75종 전부 `facings` 가 없다 (이번 커밋은 배선만이다)', () => {
    const four = DEFS.filter((d) => facingsOf(d) === 4).map((d) => d.id);
    expect(four).toEqual([]);
  });

  it('그래서 회전은 0↔1 뿐이고 2·3 은 UI 가 절대 못 만든다', () => {
    for (const def of DEFS) {
      expect(facingsOf(def), def.id).toBe(2);
      expect(nextFacing(def, 0), def.id).toBe(1);
      expect(nextFacing(def, 1), def.id).toBe(0);
    }
  });

  it('`↻` 는 여전히 비정사각에만 뜬다 (2방향의 옛 규칙)', () => {
    for (const def of DEFS) {
      expect(canRotate(def), def.id).toBe(def.size[0] !== def.size[1]);
    }
  });

  it('`sizeOf` 가 facing 0·1 에서 옛 산수(`=== 1`)와 같다', () => {
    for (const def of DEFS) {
      expect(PlacementGrid.sizeOf(def, 0), def.id).toEqual([def.size[0], def.size[1]]);
      expect(PlacementGrid.sizeOf(def, 1), def.id).toEqual([def.size[1], def.size[0]]);
    }
  });
});

describe('② 켜면 — 75종 × 4방향 전수', () => {
  /*
   * ⚠ 여기서 `facings: 4` 를 주입하는 이유는 **회전 UI 를 흉내내기 위해서가 아니다.**
   * 변환 자체(`footprintTileOf`)는 `facings` 를 안 보므로 2·3 을 그냥 넣으면 된다 —
   * 주입은 `nextFacing`/`canRotate`/스프라이트 ID 처럼 **데이터를 읽는 쪽**에만 쓴다.
   */
  it('발자국 사각형은 홀수 방향에서만 w↔d 를 맞바꾼다', () => {
    for (const def of DEFS) {
      const [w, d] = def.size;
      expect(PlacementGrid.sizeOf(def, 2), def.id).toEqual([w, d]);
      expect(PlacementGrid.sizeOf(def, 3), def.id).toEqual([d, w]);
    }
  });

  it('ride 입출구가 네 방향 전부 발자국 안이다 (K51 을 4방향으로)', () => {
    const rides = DEFS.filter((d) => d.ride);
    expect(rides.length).toBeGreaterThan(0);
    for (const def of rides) {
      for (const f of FACINGS) {
        const foot = footprint(def, 7, 9, f);
        const r = PlacementGrid.rideTilesOf(def, 7, 9, f)!;
        expect(foot.has(key(r.entry)), `${def.id} f${f} entry`).toBe(true);
        expect(foot.has(key(r.exit)), `${def.id} f${f} exit`).toBe(true);
      }
    }
  });

  it('슬롯이 네 방향 전부 발자국 안이고, 한 방향 안에서 서로 안 겹친다', () => {
    for (const def of DEFS) {
      if (!def.slots || def.slots.length === 0) continue;
      for (const f of FACINGS) {
        const foot = footprint(def, 7, 9, f);
        const seen = new Set<string>();
        for (let k = 0; k < def.slots.length; k++) {
          const s = PlacementGrid.slotTileOf(def, 7, 9, f, k)!;
          expect(foot.has(key(s.tile)), `${def.id} f${f} slot${k}`).toBe(true);
          seen.add(key(s.tile));
        }
        // 데이터의 슬롯 칸이 서로 다르면 변환 뒤에도 달라야 한다 — 전단사여야 한다는 뜻
        expect(seen.size, `${def.id} f${f}`).toBe(new Set(def.slots.map((s) => key(s.tile))).size);
      }
    }
  });

  it('입구는 네 방향 전부 발자국 밖 · 발자국에 인접하다', () => {
    for (const def of DEFS) {
      for (const f of FACINGS) {
        const foot = footprint(def, 7, 9, f);
        const es = PlacementGrid.entryTilesOf(def, 7, 9, f);
        expect(es.length, `${def.id} f${f}`).toBeGreaterThan(0);
        for (const e of es) {
          expect(foot.has(key(e)), `${def.id} f${f} ${key(e)} 가 발자국 안`).toBe(false);
          const touching = ([
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const).some(([di, dj]) => foot.has(key([e[0] + di, e[1] + dj])));
          expect(touching, `${def.id} f${f} ${key(e)} 가 발자국에 안 붙음`).toBe(true);
        }
      }
    }
  });

  it('입구 면이 **뒤로 돈다** — 2·3 은 0·1 과 겹치는 칸이 하나도 없다', () => {
    /*
     * 이것이 4방향의 존재 이유다 (K52-④): `facing 1` 은 전치라 앞면이 앞면끼리 맞바뀔
     * 뿐이라 "매표소를 정류장 쪽으로 돌린다"가 게임에 없는 동작이었다.
     */
    for (const def of DEFS) {
      if (def.ride) continue; // 슬라이드는 데이터가 모서리 하나를 골라 놨다 (다른 규칙)
      const front = new Set([
        ...PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key),
        ...PlacementGrid.entryTilesOf(def, 7, 9, 1).map(key),
      ]);
      for (const f of [2, 3] as FacilityFacing[]) {
        for (const e of PlacementGrid.entryTilesOf(def, 7, 9, f)) {
          expect(front.has(key(e)), `${def.id} f${f} ${key(e)}`).toBe(false);
        }
      }
    }
  });

  it('점유 격자가 네 방향 전부 발자국과 정확히 같다 (배치·철거가 따라온다)', () => {
    // `sizeOf` 하나가 관문이라는 주장의 실증 — 판정·점유·복원이 전부 이걸 거친다
    for (const def of DEFS.slice(0, 12)) {
      for (const f of FACINGS) {
        const g = PlacementGrid.fromSnapshot({
          w: 40,
          h: 40,
          next: 2,
          items: [{ handle: 1, defId: def.id, i: 10, j: 12, facing: f }],
        });
        const cells = new Set<string>();
        for (let j = 0; j < 40; j++) {
          for (let i = 0; i < 40; i++) if (g.handleAt(i, j) === 1) cells.add(`${i},${j}`);
        }
        expect(cells, `${def.id} f${f}`).toEqual(footprint(def, 10, 12, f));
      }
    }
  });
});

describe('② 음성 대조군 — `setRideFaultForTest` 가 4방향에서도 걸린다', () => {
  afterEach(() => setRideFaultForTest(false));

  it('고장을 켜면 회전한 입출구가 facing 0 의 칸으로 돌아온다', () => {
    const rides = DEFS.filter((d) => d.ride);
    let differed = 0;
    for (const def of rides) {
      const base = PlacementGrid.rideTilesOf(def, 7, 9, 0)!;
      for (const f of [1, 2, 3] as FacilityFacing[]) {
        setRideFaultForTest(false);
        const good = PlacementGrid.rideTilesOf(def, 7, 9, f)!;
        setRideFaultForTest(true);
        const bad = PlacementGrid.rideTilesOf(def, 7, 9, f)!;
        // 고장은 "회전을 안 준 것처럼" 군다 — 그것이 K51 이전의 세계다
        expect(bad, `${def.id} f${f}`).toEqual(base);
        if (key(good.entry) !== key(bad.entry) || key(good.exit) !== key(bad.exit)) differed++;
      }
    }
    // 대조군이 실제로 무언가를 가르는지 — 전부 같으면 이 검사는 아무것도 안 재는 것이다
    expect(differed).toBeGreaterThan(0);
  });

  it('고장 상태에서 facing 3 의 입구가 **발자국 밖으로** 나가는 시설이 있다', () => {
    // K51 의 원래 증상: `slide_large` 4×5 의 입구 [3,4] 가 회전한 발자국 5×4 밖으로 나갔다
    const def = facilityDef('slide_large')!;
    setRideFaultForTest(true);
    const bad = PlacementGrid.rideTilesOf(def, 5, 11, 3)!;
    expect(footprint(def, 5, 11, 3).has(key(bad.entry))).toBe(false);
  });
});

describe('③ 세이브 — v7 그대로', () => {
  it('`facing: 1` 인 옛 스냅샷이 같은 발자국으로 열린다', () => {
    // 4×1 짜리 — 뜻이 바뀌면 즉시 드러난다
    const def = DEFS.find((d) => d.size[0] !== d.size[1])!;
    const g = PlacementGrid.fromSnapshot({
      w: 30,
      h: 30,
      next: 2,
      items: [{ handle: 1, defId: def.id, i: 4, j: 6, facing: 1 }],
    });
    const cells = new Set<string>();
    for (let j = 0; j < 30; j++) {
      for (let i = 0; i < 30; i++) if (g.handleAt(i, j) === 1) cells.add(`${i},${j}`);
    }
    // 옛 뜻: facing 1 = d×w (전치). 그대로다
    const want = new Set<string>();
    for (let di = 0; di < def.size[1]; di++) {
      for (let dj = 0; dj < def.size[0]; dj++) want.add(`${4 + di},${6 + dj}`);
    }
    expect(cells).toEqual(want);
    expect(g.all()[0]!.facing).toBe(1);
  });

  it('`facing: 0` 은 계속 **생략**된다 — 옛 세이브와 같은 크기', () => {
    const snap = PlacementGrid.fromSnapshot({
      w: 30,
      h: 30,
      next: 2,
      items: [{ handle: 1, defId: DEFS[0]!.id, i: 4, j: 6 }],
    }).toSnapshot();
    expect(Object.prototype.hasOwnProperty.call(snap.items[0]!, 'facing')).toBe(false);
  });
});

describe('④ 회전 UI 는 `facings` 를 따른다', () => {
  it('2방향은 0↔1, 4방향은 0→1→2→3→0', () => {
    const two = facilityDef('shop')!;
    expect([nextFacing(two, 0), nextFacing(two, 1)]).toEqual([1, 0]);
    const four = asFourWay(two);
    expect([
      nextFacing(four, 0),
      nextFacing(four, 1),
      nextFacing(four, 2),
      nextFacing(four, 3),
    ]).toEqual([1, 2, 3, 0]);
  });

  it('정사각 시설은 4방향이 되어야 비로소 `↻` 가 산다', () => {
    const square = DEFS.find((d) => d.size[0] === d.size[1])!;
    expect(canRotate(square)).toBe(false);
    expect(canRotate(asFourWay(square))).toBe(true);
  });

  it('비정사각은 2방향에서도 원래 돌아간다 (되돌아가지 않았다)', () => {
    const rect = DEFS.find((d) => d.size[0] !== d.size[1])!;
    expect(canRotate(rect)).toBe(true);
  });
});

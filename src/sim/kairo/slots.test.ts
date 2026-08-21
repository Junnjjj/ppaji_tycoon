import { describe, it, expect, afterEach } from 'vitest';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  setEntryFaultForTest,
  setRideFaultForTest,
} from './placement.js';

/**
 * 슬롯 자리와 입구 칸 — **순수 파생 함수 둘** (K52 토대).
 *
 * 여기서 재는 것은 **함수의 산수**뿐이다. 손님이 실제로 그 칸에 서는지는
 * `seating.test.ts` 가 **손님을 굴려서** 잰다 (K52 5단계에서 배선했다) — 두 파일이
 * 갈라져 있는 것이 요지다. 산수만 맞고 배선이 빠진 상태가 이 파일만으로는 안 보인다.
 *
 * ⚠ 여기서 재는 것은 **발자국 기준의 기하**이지 통행 가능 여부가 아니다.
 * `guestWalkable` 은 한 글자도 안 건드린다 (이 저장소가 세 번 사고 난 자리).
 */

const DEFS = allFacilityDefs();
const WITH_SLOTS = DEFS.filter((d) => (d.slots?.length ?? 0) > 0);
const NO_SLOTS = DEFS.filter((d) => (d.slots?.length ?? 0) === 0);
const RIDES = DEFS.filter((d) => d.ride);

/** 발자국 칸 집합 — 문자열 키로 (테스트끼리 같은 표기를 쓴다) */
function foot(def = DEFS[0]!, i = 0, j = 0, facing: 0 | 1 = 0): Set<string> {
  return new Set(PlacementGrid.footprintTiles(def, i, j, facing).map((t) => `${t[0]},${t[1]}`));
}

const key = (t: readonly [number, number]): string => `${t[0]},${t[1]}`;

afterEach(() => {
  setEntryFaultForTest(false);
  setRideFaultForTest(false);
});

describe('슬롯 자리 — 손님이 서는 칸', () => {
  it('데이터가 61종에 있고 14종에 없다 — 정원 0 인 분위기·기반 시설', () => {
    expect(WITH_SLOTS).toHaveLength(61);
    expect(NO_SLOTS).toHaveLength(14);
    // 슬롯이 없는 것은 정확히 정원 0 인 것들이다 (`validateContracts` 와 같은 규칙)
    expect(NO_SLOTS.every((d) => d.capacity === 0)).toBe(true);
  });

  it('슬롯이 없으면 null 이다 — 부르는 쪽이 폴백을 고를 수 있게 던지지 않는다', () => {
    for (const def of NO_SLOTS) {
      expect(PlacementGrid.slotTileOf(def, 5, 7, 0, 0), def.id).toBeNull();
      expect(PlacementGrid.slotTileOf(def, 5, 7, 1, 3), def.id).toBeNull();
    }
    expect(PlacementGrid.slotTileOf(facilityDef('float_deck')!, 3, 3, 0, 0)).toBeNull();
  });

  it('★ 슬롯 타일이 61종 × 2방향 전부 발자국 **안**이다', () => {
    for (const def of WITH_SLOTS) {
      for (const facing of [0, 1] as const) {
        const f = foot(def, 7, 9, facing);
        for (let k = 0; k < def.slots!.length; k++) {
          const s = PlacementGrid.slotTileOf(def, 7, 9, facing, k)!;
          expect(f.has(key(s.tile)), `${def.id} f${facing} k${k} → ${key(s.tile)}`).toBe(true);
        }
      }
    }
  });

  it('★ 회전은 전치다 — 그림의 flipX 와 같은 변환 (`ride` 와 같은 규칙)', () => {
    for (const def of WITH_SLOTS) {
      for (let k = 0; k < def.slots!.length; k++) {
        const a = PlacementGrid.slotTileOf(def, 0, 0, 0, k)!;
        const b = PlacementGrid.slotTileOf(def, 0, 0, 1, k)!;
        expect([b.tile[1], b.tile[0]], `${def.id} k${k}`).toEqual([a.tile[0], a.tile[1]]);
      }
    }
  });

  it('회전하면 방향이 **가로 거울**로 뒤집힌다 — +Z↔+X, -Z↔-X', () => {
    // 실측: 지금 데이터의 슬롯 방향은 185개 전부 `+Z` 다
    const raw = new Set(WITH_SLOTS.flatMap((d) => d.slots!.map((s) => s.facing)));
    expect([...raw]).toEqual(['+Z']);

    for (const def of WITH_SLOTS) {
      expect(PlacementGrid.slotTileOf(def, 0, 0, 0, 0)!.facing, def.id).toBe('+Z');
      expect(PlacementGrid.slotTileOf(def, 0, 0, 1, 0)!.facing, def.id).toBe('+X');
    }
  });

  it('비정사각 4종의 회전이 손으로 센 값과 맞는다', () => {
    // (i,j)=(0,0) 에 놓으면 슬롯 타일이 곧 발자국 오프셋이다
    const cases: [string, [number, number][]][] = [
      ['shower_row', [[0, 0], [1, 0], [2, 0], [3, 0]]], // 4×1 연립
      ['cafe', [[0, 0], [1, 0], [0, 1], [1, 1]]], // 2×3 (앞줄 j=2 를 비운다)
      ['icecream', [[0, 0]]], // 1×2
      ['pool_lazy', undefined as unknown as [number, number][]], // 6×3 — 아래에서 채운다
    ];
    cases[3]![1] = facilityDef('pool_lazy')!.slots!.map((s) => [s.tile[0], s.tile[1]]);

    for (const [id, tiles] of cases) {
      const def = facilityDef(id)!;
      for (let k = 0; k < tiles.length; k++) {
        expect(PlacementGrid.slotTileOf(def, 0, 0, 0, k)!.tile, `${id} f0 k${k}`).toEqual(tiles[k]);
        expect(PlacementGrid.slotTileOf(def, 0, 0, 1, k)!.tile, `${id} f1 k${k}`).toEqual([
          tiles[k]![1],
          tiles[k]![0],
        ]);
      }
    }
  });

  it('★ 정원 초과분은 modulo 로 감고 포즈가 idle 이 된다 — 회전 특화 최대 +2', () => {
    /*
     * `capacityOf` 는 회전 특화(P1.5)로 `def.capacity + 1~2` 가 되는데 슬롯 배열은
     * 데이터 고정이다. 거절하면 "정원을 올렸는데 아무도 안 들어온다"가 되므로
     * 같은 칸에 세우고 **붐비는 것이 보이게** 한다.
     */
    const def = facilityDef('sunbed_row')!; // 4×1 · 슬롯 4 · 포즈 lie
    const n = def.slots!.length;
    expect(n).toBeGreaterThan(1);

    for (let k = 0; k < n; k++) {
      // 정원 안이면 데이터가 정한 자세 그대로
      expect(PlacementGrid.slotTileOf(def, 2, 3, 0, k)!.pose).toBe(def.slots![k]!.pose);
    }
    for (const over of [0, 1]) {
      const a = PlacementGrid.slotTileOf(def, 2, 3, 0, over)!;
      const b = PlacementGrid.slotTileOf(def, 2, 3, 0, n + over)!;
      expect(b.tile, `k=${n + over}`).toEqual(a.tile);
      expect(b.pose, `k=${n + over}`).toBe('idle');
    }
    // ⚠ 데이터의 자세가 `idle` 이 아닌 시설에서 재야 이 검사가 뜻을 갖는다
    expect(def.slots![0]!.pose).not.toBe('idle');
  });
});

describe('입구 칸 — 발자국에서 파생한다 (데이터 0줄)', () => {
  it('★ 75종 × 2방향 전부 발자국 **밖**이다', () => {
    for (const def of DEFS) {
      for (const facing of [0, 1] as const) {
        const f = foot(def, 7, 9, facing);
        const es = PlacementGrid.entryTilesOf(def, 7, 9, facing);
        expect(es.length, `${def.id} f${facing} 입구 0개`).toBeGreaterThan(0);
        for (const e of es) expect(f.has(key(e)), `${def.id} f${facing} → ${key(e)}`).toBe(false);
      }
    }
  });

  it('★ ride 가 없으면 정확히 앞 두 면(+I·+J)이다 — 모서리는 뺀다', () => {
    for (const def of DEFS) {
      if (def.ride) continue;
      for (const facing of [0, 1] as const) {
        const [w, d] = PlacementGrid.sizeOf(def, facing);
        const want = new Set<string>();
        for (let dj = 0; dj < d; dj++) want.add(`${7 + w},${9 + dj}`);
        for (let di = 0; di < w; di++) want.add(`${7 + di},${9 + d}`);
        const got = new Set(PlacementGrid.entryTilesOf(def, 7, 9, facing).map(key));
        expect(got, `${def.id} f${facing}`).toEqual(want);
        // 모서리 (i+w, j+d) 는 어느 면에도 안 붙는다
        expect(got.has(`${7 + w},${9 + d}`)).toBe(false);
        expect(got.size).toBe(w + d);
      }
    }
  });

  it('★ 뒤 두 면(−I·−J)은 입구가 아니다 — "앞으로 들어간다"의 실질', () => {
    for (const def of DEFS) {
      if (def.ride) continue;
      const got = new Set(PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key));
      const [w, d] = PlacementGrid.sizeOf(def, 0);
      for (let dj = 0; dj < d; dj++) expect(got.has(`${6},${9 + dj}`), def.id).toBe(false);
      for (let di = 0; di < w; di++) expect(got.has(`${7 + di},${8}`), def.id).toBe(false);
    }
  });

  it('ride 4종은 **선언된 입구 칸**의 바깥 이웃만 쓴다', () => {
    expect(RIDES).toHaveLength(4);
    for (const def of RIDES) {
      for (const facing of [0, 1] as const) {
        const r = PlacementGrid.rideTilesOf(def, 7, 9, facing)!;
        const f = foot(def, 7, 9, facing);
        const want = new Set(
          (
            [
              [r.entry[0] + 1, r.entry[1]],
              [r.entry[0], r.entry[1] + 1],
              [r.entry[0] - 1, r.entry[1]],
              [r.entry[0], r.entry[1] - 1],
            ] as [number, number][]
          )
            .filter((t) => !f.has(key(t)))
            .map(key),
        );
        const got = new Set(PlacementGrid.entryTilesOf(def, 7, 9, facing).map(key));
        expect(got, `${def.id} f${facing}`).toEqual(want);
        // 발자국 전체의 앞 두 면보다 좁아야 "기구마다 입구"가 뜻을 갖는다
        const [w, d] = PlacementGrid.sizeOf(def, facing);
        expect(got.size).toBeLessThan(w + d);
      }
    }
  });

  it('★ 회전이 공짜다 — 입구 집합도 전치된다 (새 산수 0줄)', () => {
    for (const def of DEFS) {
      const a = PlacementGrid.entryTilesOf(def, 0, 0, 0).map((t) => `${t[1]},${t[0]}`);
      const b = PlacementGrid.entryTilesOf(def, 0, 0, 1).map(key);
      expect(new Set(b), def.id).toEqual(new Set(a));
    }
  });
});

describe('고장 스위치 — 좁히기 이전과 다른 답을 낸다', () => {
  it('★ 켜면 네 면 전부가 입구가 된다 (= 방향 구분이 없던 옛 동작)', () => {
    const def = facilityDef('cafe')!; // 2×3
    const narrow = new Set(PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key));
    setEntryFaultForTest(true);
    const wide = new Set(PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key));

    expect(narrow.size).toBe(2 + 3); // 앞 두 면
    expect(wide.size).toBe(2 * (2 + 3)); // 네 면
    for (const t of narrow) expect(wide.has(t)).toBe(true);
    // 뒤쪽 칸이 새로 들어온다 — 이것이 "좁히기 이전"의 실질이다
    expect(narrow.has('6,9')).toBe(false);
    expect(wide.has('6,9')).toBe(true);
  });

  it('★ 켜면 "정확히 앞 두 면" 검사가 실제로 깨진다 — 75종 전부에서', () => {
    setEntryFaultForTest(true);
    const same: string[] = [];
    for (const def of DEFS) {
      const [w, d] = PlacementGrid.sizeOf(def, 0);
      const want = new Set<string>();
      for (let dj = 0; dj < d; dj++) want.add(`${7 + w},${9 + dj}`);
      for (let di = 0; di < w; di++) want.add(`${7 + di},${9 + d}`);
      const got = new Set(PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key));
      if (got.size === want.size && [...want].every((t) => got.has(t))) same.push(def.id);
    }
    expect(same).toEqual([]);
  });

  it('끄면 원래대로 돌아온다 — 스위치가 전역 상태라 잔해가 남으면 안 된다', () => {
    const def = facilityDef('cafe')!;
    const before = PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key);
    setEntryFaultForTest(true);
    setEntryFaultForTest(false);
    expect(PlacementGrid.entryTilesOf(def, 7, 9, 0).map(key)).toEqual(before);
  });

  it('K51 대조군이 여전히 걸린다 — `put()` 을 공유해도 전치가 한 벌이다', () => {
    /*
     * `rideTilesOf` 와 `slotTileOf` 가 이제 같은 `footprintTileOf` 를 쓴다.
     * 전치 산수가 두 벌이 되면 K51 이 재발하므로, 그 대조군이 계속 잡는지를 여기서도 본다
     * (`ride.test.ts` 와 같은 판정 — 자리를 옮겨도 규칙이 하나임을 고정한다).
     */
    setRideFaultForTest(true);
    const outside: string[] = [];
    for (const def of RIDES) {
      const f = foot(def, 7, 9, 1);
      const r = PlacementGrid.rideTilesOf(def, 7, 9, 1)!;
      if (!f.has(key(r.entry))) outside.push(def.id);
    }
    expect(outside.sort()).toEqual(['slide_large', 'snow_sled']);

    setRideFaultForTest(false);
    for (const def of RIDES) {
      const f = foot(def, 7, 9, 1);
      const r = PlacementGrid.rideTilesOf(def, 7, 9, 1)!;
      expect(f.has(key(r.entry)), def.id).toBe(true);
    }
  });

  it('스위치는 입구만 건드린다 — 슬롯은 안 움직인다', () => {
    const def = facilityDef('cafe')!;
    const before = PlacementGrid.slotTileOf(def, 7, 9, 1, 2)!;
    setEntryFaultForTest(true);
    expect(PlacementGrid.slotTileOf(def, 7, 9, 1, 2)).toEqual(before);
  });
});

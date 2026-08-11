import { describe, it, expect, beforeEach } from 'vitest';
import { World } from './world.js';
import { Terrain } from './terrain.js';
import { FACILITY_DEFS, facilityDef, requireFacilityDef, footprint } from './facility.js';
import { FacilityStore } from './facility-store.js';

/** 위쪽 절반은 평지, 아래쪽 절반은 물인 테스트 맵 */
function testWorld(w = 20, h = 20): World {
  const world = new World(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < h / 2) world.set(x, y, Terrain.Plain);
      else if (y < h / 2 + 2) world.set(x, y, Terrain.Shore);
      else if (y < h / 2 + 5) world.set(x, y, Terrain.Shallow);
      else world.set(x, y, Terrain.Deep);
    }
  }
  return world;
}

describe('시설 정의 (불변식 3 — 데이터 주도)', () => {
  it('JSON 을 읽어 시설이 로드된다', () => {
    expect(FACILITY_DEFS.length).toBeGreaterThan(0);
  });

  it('ID 로 조회된다', () => {
    expect(facilityDef('shop')?.name).toBe('매점');
    expect(facilityDef('없는시설')).toBeUndefined();
  });

  it('모르는 ID 는 명확히 거부한다', () => {
    expect(() => requireFacilityDef('없는시설')).toThrow(/알 수 없는 시설/);
  });

  it('모든 시설에 유효한 값이 있다', () => {
    for (const d of FACILITY_DEFS) {
      expect(d.size[0], d.id).toBeGreaterThan(0);
      expect(d.size[1], d.id).toBeGreaterThan(0);
      expect(d.placement.terrain.length, d.id).toBeGreaterThan(0);
      expect(d.cost, d.id).toBeGreaterThanOrEqual(0);
      expect(d.sprite, d.id).toBeTruthy();
    }
  });

  it('회전하면 가로세로가 바뀐다', () => {
    const dock = requireFacilityDef('dock'); // 2×4
    expect(footprint(dock, 0)).toEqual([2, 4]);
    expect(footprint(dock, 1)).toEqual([4, 2]);
    expect(footprint(dock, 2)).toEqual([2, 4]);
    expect(footprint(dock, 3)).toEqual([4, 2]);
  });
});

describe('배치 규칙', () => {
  let world: World;
  let store: FacilityStore;

  beforeEach(() => {
    world = testWorld();
    store = new FacilityStore(world);
  });

  it('평지에 매점을 놓을 수 있다', () => {
    expect(store.canPlace(requireFacilityDef('shop'), 3, 3, 0).ok).toBe(true);
    expect(store.place('shop', 3, 3, 0)).not.toBeNull();
    expect(store.count).toBe(1);
  });

  it('물 위에는 육지 시설을 놓을 수 없다', () => {
    const check = store.canPlace(requireFacilityDef('shop'), 3, 15, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('bad-terrain');
  });

  it('육지 위에는 수상 시설을 놓을 수 없다', () => {
    const check = store.canPlace(requireFacilityDef('trampoline'), 3, 2, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('bad-terrain');
  });

  it('겹치면 거부한다', () => {
    store.place('shop', 3, 3, 0); // 2×2 → (3,3)~(4,4)
    const check = store.canPlace(requireFacilityDef('shop'), 4, 4, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('overlap');
  });

  it('바로 옆에는 놓을 수 있다', () => {
    store.place('shop', 3, 3, 0);
    expect(store.canPlace(requireFacilityDef('shop'), 5, 3, 0).ok).toBe(true);
  });

  it('맵 밖으로 나가면 거부한다', () => {
    const check = store.canPlace(requireFacilityDef('shop'), 19, 3, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('out-of-bounds');
  });

  it('음수 좌표를 거부한다', () => {
    expect(store.canPlace(requireFacilityDef('shop'), -1, 3, 0).ok).toBe(false);
  });

  it('unique 시설은 하나만 놓인다', () => {
    expect(store.place('gate', 2, 2, 0)).not.toBeNull();
    const check = store.canPlace(requireFacilityDef('gate'), 8, 2, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('already-exists');
  });

  it('수변 시설은 육지에 닿아야 한다', () => {
    // 물 시작이 y=10. 선착장(2×4)을 y=10 에 놓으면 위쪽(y=9)이 육지 → OK
    expect(store.canPlace(requireFacilityDef('dock'), 5, 10, 0).ok).toBe(true);

    // 육지에서 멀리 떨어진 깊은 물 → 실패
    const far = store.canPlace(requireFacilityDef('dock'), 5, 15, 0);
    expect(far.ok).toBe(false);
    expect(far.reason).toBe('needs-land-adjacent');
  });

  it('회전한 채로도 판정이 맞는다', () => {
    // 4×2 로 눕힌 선착장. y=10 이면 위가 육지
    expect(store.canPlace(requireFacilityDef('dock'), 5, 10, 1).ok).toBe(true);
  });
});

describe('점유 격자', () => {
  let store: FacilityStore;

  beforeEach(() => {
    store = new FacilityStore(testWorld());
  });

  it('점유한 타일에서 시설을 찾을 수 있다', () => {
    const f = store.place('shop', 3, 3, 0);
    expect(f).not.toBeNull();
    for (const [x, y] of [
      [3, 3],
      [4, 3],
      [3, 4],
      [4, 4],
    ] as const) {
      expect(store.facilityAt(x, y)?.iid, `(${x},${y})`).toBe(f!.iid);
    }
    expect(store.facilityAt(5, 3)).toBeUndefined();
  });

  it('제거하면 점유가 풀린다', () => {
    const f = store.place('shop', 3, 3, 0)!;
    expect(store.remove(f.iid)).toBe(true);
    expect(store.facilityAt(3, 3)).toBeUndefined();
    expect(store.count).toBe(0);
    // 같은 자리에 다시 놓을 수 있다
    expect(store.place('shop', 3, 3, 0)).not.toBeNull();
  });

  it('없는 시설 제거는 false', () => {
    expect(store.remove(999)).toBe(false);
  });

  it('경계 밖 조회는 안전하다', () => {
    expect(store.facilityAt(-1, -1)).toBeUndefined();
    expect(store.facilityAt(9999, 9999)).toBeUndefined();
  });
});

describe('시설 스냅샷', () => {
  it('저장·복원하면 점유 격자까지 되살아난다', () => {
    const world = testWorld();
    const a = new FacilityStore(world);
    a.place('gate', 2, 2, 0);
    a.place('shop', 6, 3, 0);
    a.place('dock', 5, 10, 0);

    const b = new FacilityStore(world);
    b.restore(JSON.parse(JSON.stringify(a.toSnapshot())));

    expect(b.count).toBe(a.count);
    expect(b.facilityAt(6, 3)?.defId).toBe('shop');
    expect(b.facilityAt(5, 10)?.defId).toBe('dock');
    // 복원 후에도 겹침 판정이 살아 있어야 한다
    expect(b.canPlace(requireFacilityDef('shop'), 6, 3, 0).ok).toBe(false);
  });

  it('복원 후 새 시설의 iid 가 충돌하지 않는다', () => {
    const world = testWorld();
    const a = new FacilityStore(world);
    const f1 = a.place('shop', 3, 3, 0)!;

    const b = new FacilityStore(world);
    b.restore(a.toSnapshot());
    const f2 = b.place('shop', 6, 3, 0)!;
    expect(f2.iid).not.toBe(f1.iid);
  });
});

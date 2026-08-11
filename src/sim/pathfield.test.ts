import { describe, it, expect } from 'vitest';
import { FlowField, UNREACHABLE } from './pathfield.js';
import { World } from './world.js';
import { Terrain } from './terrain.js';
import { FacilityStore } from './facility-store.js';
import { Navigation } from './navigation.js';

describe('FlowField', () => {
  const open = (): (() => boolean) => () => true;

  it('목적지는 거리 0', () => {
    const f = new FlowField(10, 10);
    f.build(open(), [[5, 5]]);
    expect(f.distAt(5, 5)).toBe(0);
    expect(f.arrived(5, 5)).toBe(true);
  });

  it('맨해튼 거리가 나온다 (4방향 이동)', () => {
    const f = new FlowField(10, 10);
    f.build(open(), [[0, 0]]);
    expect(f.distAt(3, 0)).toBe(3);
    expect(f.distAt(0, 4)).toBe(4);
    expect(f.distAt(3, 4)).toBe(7);
  });

  it('막힌 타일은 도달 불가', () => {
    const f = new FlowField(10, 10);
    // x=5 열 전체를 벽으로 → 오른쪽 절반은 못 감
    f.build((x) => x !== 5, [[0, 0]]);
    expect(f.distAt(4, 0)).toBe(4);
    expect(f.distAt(5, 0)).toBe(UNREACHABLE);
    expect(f.distAt(9, 0)).toBe(UNREACHABLE);
    expect(f.reachable(9, 0)).toBe(false);
  });

  it('벽을 우회한다', () => {
    const f = new FlowField(10, 10);
    // y=0..7 만 벽인 x=5 열 → 아래로 돌아가야 함
    f.build((x, y) => !(x === 5 && y < 8), [[0, 0]]);
    // (6,0) 까지는 우회 경로: 오른쪽으로 갔다가 아래로 8, 옆으로, 위로 8
    const d = f.distAt(6, 0);
    expect(d).toBeGreaterThan(6); // 직선 거리보다 멀다
    expect(d).not.toBe(UNREACHABLE);
  });

  it('next 는 거리가 줄어드는 쪽을 고른다', () => {
    const f = new FlowField(10, 10);
    f.build(open(), [[0, 0]]);
    let x = 7;
    let y = 6;
    let steps = 0;
    while (!f.arrived(x, y) && steps < 100) {
      const n = f.next(x, y);
      expect(n).not.toBeNull();
      const [nx, ny] = n!;
      expect(f.distAt(nx, ny)).toBeLessThan(f.distAt(x, y));
      x = nx;
      y = ny;
      steps++;
    }
    expect(f.arrived(x, y)).toBe(true);
    expect(steps).toBe(13);
  });

  it('도착했으면 next 는 null', () => {
    const f = new FlowField(10, 10);
    f.build(open(), [[3, 3]]);
    expect(f.next(3, 3)).toBeNull();
  });

  it('도달 불가 지점에서 next 는 null', () => {
    const f = new FlowField(10, 10);
    f.build((x) => x !== 5, [[0, 0]]);
    expect(f.next(8, 0)).toBeNull();
  });

  it('목적지가 여러 개면 가장 가까운 쪽 기준', () => {
    const f = new FlowField(20, 20);
    f.build(open(), [
      [0, 0],
      [19, 0],
    ]);
    expect(f.distAt(18, 0)).toBe(1);
    expect(f.distAt(1, 0)).toBe(1);
  });

  it('tieBreak 이 다르면 동점에서 다른 방향을 고를 수 있다', () => {
    const f = new FlowField(10, 10);
    f.build(open(), [[0, 0]]);
    // (3,3) 에서 위·왼쪽 둘 다 거리 5 로 동점
    const a = f.next(3, 3, 0);
    const b = f.next(3, 3, 3);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toEqual(b);
  });

  it('목적지가 없으면 전부 도달 불가', () => {
    const f = new FlowField(10, 10);
    f.build(open(), []);
    expect(f.distAt(5, 5)).toBe(UNREACHABLE);
  });
});

describe('Navigation — 통행 가능성과 시설 입구', () => {
  function setup(): { world: World; facilities: FacilityStore; nav: Navigation } {
    const world = new World(20, 20);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) world.set(x, y, y < 12 ? Terrain.Plain : Terrain.Deep);
    const facilities = new FacilityStore(world);
    return { world, facilities, nav: new Navigation(world, facilities) };
  }

  it('평지는 걸을 수 있고 물은 못 걷는다', () => {
    const { nav } = setup();
    expect(nav.walkable(5, 5)).toBe(true);
    expect(nav.walkable(5, 15)).toBe(false);
  });

  it('시설이 놓인 타일은 막힌다', () => {
    const { facilities, nav } = setup();
    facilities.place('shop', 5, 5, 0);
    expect(nav.walkable(5, 5)).toBe(false);
    expect(nav.walkable(6, 5)).toBe(false);
    expect(nav.walkable(7, 5)).toBe(true);
  });

  it('길은 밟고 지나갈 수 있다', () => {
    const { facilities, nav } = setup();
    facilities.place('path', 5, 5, 0);
    expect(nav.walkable(5, 5)).toBe(true);
  });

  it('시설 입구는 점유 영역에 맞닿은 걸을 수 있는 타일', () => {
    const { facilities, nav } = setup();
    const f = facilities.place('shop', 5, 5, 0)!; // 2×2
    const entrances = nav.entrancesOf(f);
    // 2×2 둘레 = 8칸, 전부 평지
    expect(entrances).toHaveLength(8);
    for (const [x, y] of entrances) {
      expect(nav.walkable(x, y)).toBe(true);
    }
  });

  it('시설로 향하는 거리장이 만들어진다', () => {
    const { facilities, nav } = setup();
    const f = facilities.place('shop', 10, 5, 0)!;
    nav.markDirty();
    const field = nav.fieldFor(f.iid);
    expect(field).toBeDefined();
    expect(field!.reachable(2, 2)).toBe(true);
    // 입구에 도달하면 거리 0
    expect(field!.distAt(9, 5)).toBe(0);
  });

  it('걸어서 닿을 수 없는 시설은 거리장이 만들어지지 않는다', () => {
    const { world, facilities, nav } = setup();
    // 아래 절반은 깊은 물(걸을 수 없음). 물 한가운데 트램폴린을 띄우면
    // 둘레가 전부 물이라 입구가 하나도 없다.
    world.set(9, 15, Terrain.Shallow); // 트램폴린 설치 조건(shallow/deep) 충족용
    const f = facilities.place('trampoline', 8, 15, 0)!;

    expect(nav.entrancesOf(f)).toHaveLength(0);

    nav.markDirty();
    nav.rebuild();
    expect(nav.fieldFor(f.iid)).toBeUndefined();
    expect(nav.fieldCount).toBe(0);
  });

  it('시설 둘레를 다른 시설로 막으면 입구가 줄어든다', () => {
    const { facilities, nav } = setup();
    const f = facilities.place('shop', 5, 5, 0)!; // (5,5)~(6,6)
    const before = nav.entrancesOf(f).length;
    expect(before).toBe(8);

    // 바로 위에 딱 붙여 놓으면 위쪽 두 칸이 막힌다
    expect(facilities.place('shop', 5, 3, 0)).not.toBeNull(); // (5,3)~(6,4)
    expect(nav.entrancesOf(f)).toHaveLength(before - 2);
  });

  it('시설이 바뀌면 거리장이 갱신된다', () => {
    const { facilities, nav } = setup();
    const shop = facilities.place('shop', 10, 5, 0)!;
    nav.markDirty();
    expect(nav.fieldFor(shop.iid)).toBeDefined();
    expect(nav.fieldCount).toBe(1);

    facilities.place('restroom', 3, 3, 0);
    nav.markDirty();
    nav.rebuild();
    expect(nav.fieldCount).toBe(2);
  });
});

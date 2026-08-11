import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { Terrain } from './terrain.js';
import { requireFacilityDef } from './facility.js';

/**
 * Phase 1 의 핵심 주장을 검증한다:
 *   "손님이 걸어와 줄을 서고, 배치를 바꾸면 결과가 달라진다"
 *
 * 이게 사실이 아니면 배치 최적화라는 게임의 기둥이 성립하지 않는다.
 */

/** 전부 평지인 맵으로 갈아끼운 게임 (지형 변수를 제거하고 배치만 본다) */
function flatGame(seed = 1, size = 40): Game {
  const g = new Game({ seed, width: size, height: size });
  g.world.tiles.fill(Terrain.Plain);
  g.nav.markDirty();
  return g;
}

describe('손님 유입', () => {
  it('게이트가 없으면 손님이 들어오지 않는다', () => {
    const g = flatGame();
    g.run(2000);
    expect(g.guests.count).toBe(0);
  });

  it('게이트가 있으면 손님이 들어온다', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    g.run(500);
    expect(g.guests.count).toBeGreaterThan(0);
  });

  it('동시 체류 인원 상한을 지킨다', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    g.arrivals = { ticksPerGroup: 2, maxGuests: 40 };
    g.run(5000);
    expect(g.guests.count).toBeLessThanOrEqual(40 + 5); // 그룹 단위라 약간의 초과 허용
  });

  it('그룹 단위로 들어온다', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    g.arrivals = { ticksPerGroup: 1000, maxGuests: 300 };
    g.run(1001);
    const groups = new Set([...g.guests.all].map((x) => x.groupId));
    expect(g.guests.count).toBeGreaterThanOrEqual(2);
    expect(groups.size).toBe(1);
  });
});

describe('손님이 시설로 걸어가 줄을 선다', () => {
  it('매점을 놓으면 손님이 찾아와 이용한다', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    const shop = g.placeFacility('shop', 15, 15, 0)!;

    let sawQueue = false;
    let sawUse = false;
    for (let i = 0; i < 6000; i++) {
      g.step();
      for (const guest of g.guests.all) {
        if (guest.state === 'queuing' && guest.targetIid === shop.iid) sawQueue = true;
        if (guest.state === 'using' && guest.targetIid === shop.iid) sawUse = true;
      }
      if (sawQueue && sawUse) break;
    }

    expect(sawQueue, '줄 서는 손님이 있어야 한다').toBe(true);
    expect(sawUse, '이용하는 손님이 있어야 한다').toBe(true);
  });

  it('손님이 실제로 이동한다 (제자리에 머물지 않는다)', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    g.placeFacility('shop', 25, 25, 0);
    g.run(300);

    const start = [...g.guests.all].map((x) => ({ id: x.id, cx: x.cx, cy: x.cy }));
    expect(start.length).toBeGreaterThan(0);
    g.run(600);

    let moved = 0;
    for (const s of start) {
      const now = [...g.guests.all].find((x) => x.id === s.id);
      if (now && (now.cx !== s.cx || now.cy !== s.cy)) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('시설 정원을 넘겨 동시에 이용하지 않는다', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    const shop = g.placeFacility('shop', 12, 12, 0)!;
    const cap = requireFacilityDef('shop').capacity;

    for (let i = 0; i < 8000; i++) {
      g.step();
      const f = g.facilities.byIid(shop.iid)!;
      expect(f.inUse).toBeLessThanOrEqual(cap);
    }
  });

  it('대기줄 인원이 음수가 되지 않는다', () => {
    const g = flatGame();
    g.placeFacility('gate', 5, 5, 0);
    const shop = g.placeFacility('shop', 12, 12, 0)!;
    for (let i = 0; i < 5000; i++) {
      g.step();
      expect(g.facilities.byIid(shop.iid)!.queue).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('배치가 결과를 바꾼다 — 게임의 기둥', () => {
  it('시설이 가까우면 만족도가 더 높다', () => {
    const near = flatGame(7);
    near.placeFacility('gate', 5, 5, 0);
    near.placeFacility('shop', 8, 5, 0);
    near.placeFacility('restroom', 5, 8, 0);
    near.run(12000);

    const far = flatGame(7);
    far.placeFacility('gate', 5, 5, 0);
    far.placeFacility('shop', 36, 36, 0);
    far.placeFacility('restroom', 36, 30, 0);
    far.run(12000);

    expect(near.stats().avgHappiness).toBeGreaterThan(far.stats().avgHappiness);
  });

  it('시설이 아예 없으면 만족도가 바닥으로 간다', () => {
    const g = flatGame(3);
    g.placeFacility('gate', 5, 5, 0);
    g.run(15000);
    // 욕구가 방치되어 기분이 떨어지고 결국 집에 간다
    expect(g.stats().avgHappiness).toBeLessThan(70);
  });

  it('길이 막히면 손님이 도달하지 못한다', () => {
    const g = flatGame(5, 24);
    // 물로 완전히 갈라진 맵: 위쪽에 게이트, 아래쪽에 매점
    for (let y = 10; y < 14; y++)
      for (let x = 0; x < 24; x++) g.world.set(x, y, Terrain.Deep);
    g.nav.markDirty();

    g.placeFacility('gate', 5, 5, 0);
    const shop = g.placeFacility('shop', 5, 18, 0)!;
    g.run(4000);

    // 도달 불가이므로 아무도 이용하지 못한다
    const f = g.facilities.byIid(shop.iid)!;
    expect(f.inUse).toBe(0);
    expect(f.queue).toBe(0);
  });
});

describe('결정론 (헤드리스 밸런싱의 전제)', () => {
  function scenario(seed: number): Game {
    const g = flatGame(seed);
    g.placeFacility('gate', 5, 5, 0);
    g.placeFacility('shop', 15, 10, 0);
    g.placeFacility('restroom', 10, 15, 0);
    g.run(8000);
    return g;
  }

  it('같은 시드·같은 배치는 같은 결과를 낸다', () => {
    const a = scenario(99);
    const b = scenario(99);
    expect(a.stats()).toEqual(b.stats());

    const ga = [...a.guests.all].map((x) => [x.id, x.cx, x.cy, x.state]);
    const gb = [...b.guests.all].map((x) => [x.id, x.cx, x.cy, x.state]);
    expect(ga).toEqual(gb);
  });

  it('다른 시드는 다른 결과를 낸다', () => {
    expect(scenario(1).stats()).not.toEqual(scenario(2).stats());
  });
});

describe('세이브 왕복 (손님 포함)', () => {
  it('손님까지 복원되고 이어서 결정론이 유지된다', () => {
    const a = flatGame(21);
    a.placeFacility('gate', 5, 5, 0);
    a.placeFacility('shop', 14, 9, 0);
    a.run(3000);
    expect(a.guests.count).toBeGreaterThan(0);

    const snap = JSON.parse(JSON.stringify(a.toSnapshot()));
    const b = Game.fromSnapshot(snap);

    expect(b.stats()).toEqual(a.stats());

    a.run(1500);
    b.run(1500);
    expect(b.stats()).toEqual(a.stats());
  });

  it('시설도 복원된다', () => {
    const a = flatGame(4);
    a.placeFacility('gate', 5, 5, 0);
    a.placeFacility('shop', 14, 9, 0);
    a.run(100);

    const b = Game.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    expect(b.facilities.count).toBe(2);
    expect(b.facilities.facilityAt(14, 9)?.defId).toBe('shop');
  });
});

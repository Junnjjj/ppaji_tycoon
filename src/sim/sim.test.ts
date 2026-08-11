import { describe, it, expect } from 'vitest';
import { Rng } from './rng.js';
import { Clock, MS_PER_TICK } from './clock.js';
import { Game } from './game.js';
import { generateWorld } from './worldgen.js';
import { Terrain, isWater, isLand, depthLevel } from './terrain.js';

describe('Rng — 결정론 (아키텍처 불변식 2)', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const r1 = new Rng(999);
    const r2 = new Rng(999);
    for (let i = 0; i < 200; i++) expect(r1.next()).toBe(r2.next());
  });

  it('다른 시드는 다른 수열을 낸다', () => {
    const r1 = new Rng(1);
    const r2 = new Rng(2);
    const diff = Array.from<unknown, number>({ length: 50 }, () =>
      r1.next() === r2.next() ? 0 : 1,
    );
    expect(diff.reduce((a, b) => a + b, 0)).toBeGreaterThan(45);
  });

  it('출력이 [0,1) 범위 안이다', () => {
    const r = new Rng(42);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('대략 균등 분포다', () => {
    const r = new Rng(7);
    const buckets = new Array<number>(10).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) buckets[Math.floor(r.next() * 10)]!++;
    for (const b of buckets) {
      expect(b).toBeGreaterThan(N / 10 - N * 0.01);
      expect(b).toBeLessThan(N / 10 + N * 0.01);
    }
  });

  it('state 로 왕복하면 이어서 같은 값이 나온다 (세이브/로드)', () => {
    const r = new Rng(555);
    for (let i = 0; i < 37; i++) r.next();
    const restored = Rng.fromState(r.state);
    for (let i = 0; i < 50; i++) expect(restored.next()).toBe(r.next());
  });

  it('fork 스트림은 서로 독립적이다', () => {
    // 한 스트림을 많이 소비해도 다른 스트림의 수열은 그대로여야 한다.
    const baseline = new Rng(2024).fork(0xaa);
    const baselineSeq = Array.from({ length: 20 }, () => baseline.next());

    const root = new Rng(2024);
    const a = root.fork(0xaa);
    const b = root.fork(0xbb);
    for (let i = 0; i < 1000; i++) b.next(); // b 를 마구 소비

    const aSeq = Array.from({ length: 20 }, () => a.next());
    expect(aSeq).toEqual(baselineSeq);
  });

  it('intRange 는 양끝을 포함한다', () => {
    const r = new Rng(3);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 2000; i++) {
      const v = r.intRange(5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
      if (v === 5) sawMin = true;
      if (v === 8) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });
});

describe('Clock — 고정 timestep', () => {
  it('일시정지(speed 0)면 tick 이 나오지 않는다', () => {
    const c = new Clock();
    c.speed = 0;
    expect(c.pump(1000)).toBe(0);
  });

  it('1배속에서 1초는 정확히 TICK_HZ 만큼', () => {
    const c = new Clock();
    expect(c.pump(1000)).toBe(10);
  });

  it('배속은 tick 수를 곱한다 (tick 크기를 바꾸지 않는다)', () => {
    const c1 = new Clock();
    c1.speed = 1;
    const c3 = new Clock();
    c3.speed = 3;
    expect(c3.pump(1000)).toBe(c1.pump(1000) * 3);
  });

  it('나머지를 누적해 장기적으로 어긋나지 않는다', () => {
    const c = new Clock();
    let total = 0;
    // 16.67ms 프레임 60번 ≈ 1초
    for (let i = 0; i < 60; i++) total += c.pump(1000 / 60);
    expect(total).toBe(10);
  });

  it('긴 정지 뒤에도 tick 이 폭주하지 않는다 (죽음의 나선 방지)', () => {
    const c = new Clock();
    expect(c.pump(60_000)).toBeLessThanOrEqual(60);
  });

  it('alpha 는 [0,1) 이다', () => {
    const c = new Clock();
    c.pump(MS_PER_TICK * 2.5);
    expect(c.alpha).toBeGreaterThanOrEqual(0);
    expect(c.alpha).toBeLessThan(1);
  });
});

describe('Terrain', () => {
  it('물/육지 분류가 배타적이다', () => {
    for (const t of Object.values(Terrain)) {
      expect(isWater(t)).toBe(!isLand(t));
    }
  });

  it('육지의 수심은 0, 물은 1 이상이다', () => {
    for (const t of Object.values(Terrain)) {
      if (isLand(t)) expect(depthLevel(t)).toBe(0);
      else expect(depthLevel(t)).toBeGreaterThan(0);
    }
  });
});

describe('worldgen — 결정론', () => {
  it('같은 시드는 완전히 같은 맵을 만든다', () => {
    const a = generateWorld({ seed: 777, width: 64, height: 64 });
    const b = generateWorld({ seed: 777, width: 64, height: 64 });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
  });

  it('다른 시드는 다른 맵을 만든다', () => {
    const a = generateWorld({ seed: 1, width: 64, height: 64 });
    const b = generateWorld({ seed: 2, width: 64, height: 64 });
    expect(Array.from(a.tiles)).not.toEqual(Array.from(b.tiles));
  });

  it('육지와 물이 둘 다 충분히 있다', () => {
    const w = generateWorld({ seed: 42, width: 64, height: 64 });
    let land = 0;
    let water = 0;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (w.isWaterAt(x, y)) water++;
        else land++;
      }
    }
    expect(land).toBeGreaterThan(w.tiles.length * 0.2);
    expect(water).toBeGreaterThan(w.tiles.length * 0.2);
  });

  it('건설 가능한 평지가 존재한다', () => {
    const w = generateWorld({ seed: 42, width: 64, height: 64 });
    const plains = w.histogram().get(Terrain.Plain) ?? 0;
    expect(plains).toBeGreaterThan(w.tiles.length * 0.1);
  });

  it('물은 육지보다 아래(y가 큼)에 있다 — 강변 구조', () => {
    const w = generateWorld({ seed: 9, width: 64, height: 64 });
    // 각 열에서 첫 물 타일 아래로는 육지가 다시 나오지 않아야 한다
    for (let x = 0; x < w.width; x++) {
      let firstWater = -1;
      for (let y = 0; y < w.height; y++) {
        if (w.isWaterAt(x, y)) {
          firstWater = y;
          break;
        }
      }
      expect(firstWater).toBeGreaterThan(0);
      for (let y = firstWater; y < w.height; y++) {
        expect(w.isWaterAt(x, y)).toBe(true);
      }
    }
  });

  it('경계 밖 조회는 Rock 을 돌려준다', () => {
    const w = generateWorld({ seed: 1, width: 32, height: 32 });
    expect(w.at(-1, 0)).toBe(Terrain.Rock);
    expect(w.at(0, -1)).toBe(Terrain.Rock);
    expect(w.at(32, 0)).toBe(Terrain.Rock);
    expect(w.at(0, 32)).toBe(Terrain.Rock);
  });
});

describe('Game — 결정론 (헤드리스 밸런싱의 전제)', () => {
  it('같은 시드로 같은 tick 을 돌리면 같은 상태다', () => {
    const a = new Game({ seed: 31337, width: 48, height: 48 });
    const b = new Game({ seed: 31337, width: 48, height: 48 });
    a.run(5000);
    b.run(5000);
    expect(a.stats()).toEqual(b.stats());
    expect(Array.from(a.world.tiles)).toEqual(Array.from(b.world.tiles));
  });

  it('tick 이 하루 단위로 환산된다', () => {
    const g = new Game({ seed: 1, width: 32, height: 32 });
    expect(g.day).toBe(0);
    g.run(3600);
    expect(g.day).toBe(1);
  });
});

/**
 * K39 항등 검사 — `run()` ≡ `begin() + 임의 분할 step() + finish()`.
 *
 * 흐름 모드(프레임마다 step 몇 개)가 헤드리스·골든과 **같은 세계**를 재는지가 이 검사
 * 하나에 걸려 있다. 어긋나는 순간 밸런싱·결정론·골든이 전부 다른 게임을 재게 되므로,
 * 이 검사가 빨간불이면 흐름 모드 작업을 멈춘다 (docs/plan-live-unlock.md §0).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { GuestStore } from './guests.js';
import { WeekRunner, TICKS_PER_WEEK, type WeekOptions, type WeekReport } from './week.js';
import { applyStartKit } from './startkit.js';
import { CourseStore } from './course.js';
import { mapType, DEFAULT_MAP } from './scenario.js';
import { bakeIndoorWalls } from './indoor.js';

interface World {
  runner: WeekRunner;
  place: (defId: string, i: number, j: number) => boolean;
}

function makeWorld(seed: number): World {
  const W = KairoTerrain.WIDTH;
  const H = KairoTerrain.HEIGHT;
  const map = mapType(DEFAULT_MAP);
  const terrain = KairoTerrain.generate(W, H, new Rng(seed), {
    landRatio: map.landRatio,
    shoreJitter: map.shoreJitter,
  });
  const walls = new WallGrid(W, H);
  const placement = new PlacementGrid(W, H);
  const gate = KairoTerrain.parkGate();
  const courses = new CourseStore();
  applyStartKit({ terrain, walls, placement, gate, map, courses });
  bakeIndoorWalls(terrain, walls, gate, guestWalkable(terrain, placement));
  const guests = new GuestStore(terrain, walls, placement, gate);
  guests.invalidate();
  return {
    runner: new WeekRunner(terrain, placement, guests),
    place: (defId, i, j) => placement.place(terrain, walls, gate, defId, i, j).ok,
  };
}

/** 결산 비교용 — JSON 직렬화로 깊은 동일성 (playback 포함) */
function key(r: WeekReport): string {
  return JSON.stringify(r);
}

/** 사고·평판·요금·재생 기록까지 켠 옵션 — 분기들을 최대한 밟는다 */
const OPTS: WeekOptions = {
  season: 'summer',
  playbackEvery: 6,
  reputation: 1.2,
  priceMult: 1.1,
  accidentChance: 0.1,
};

/**
 * 분할 크기 순환 — 1(최소) · 7(반나절 미만) · 113(소수, 하루 경계와 어긋남) ·
 * 120(정확히 하루) · 840(한 번에). 하루 경계(120)와 안 맞는 크기가 섞여야
 * "하루 열기/닫기"가 tick 소비와 분리되어 있음을 실제로 검증한다.
 */
const SPLITS = [1, 7, 113, 120, 840];

describe('주 항등 — run ≡ 분할 step', () => {
  it('4시드 × 6주, 결산이 완전히 같다 (재생 기록 포함)', () => {
    for (const seed of [11, 42, 777, 20260819]) {
      const a = makeWorld(seed).runner;
      const b = makeWorld(seed).runner;
      for (let wk = 0; wk < 6; wk++) {
        const ra = a.run(new Rng(seed * 1000 + wk), OPTS);

        b.begin(new Rng(seed * 1000 + wk), OPTS);
        let i = wk; // 주마다 다른 크기로 시작 — 같은 패턴 반복을 피한다
        while (!b.liveProgress()?.done) {
          b.step(SPLITS[i++ % SPLITS.length] as number);
        }
        const rb = b.finish();

        expect(key(rb), `seed ${seed} week ${wk}`).toBe(key(ra));
      }
      // 세계 상태(현금·주차)도 같이 흘러야 한다 — 결산만 같고 잔액이 갈리면 소용없다
      expect(b.cash).toBe(a.cash);
      expect(b.week).toBe(a.week);
    }
  });

  it('음성 대조군 — 위반을 주입하면 어긋난다 (검사가 정말 비교하고 있다)', () => {
    const seed = 42;
    const a = makeWorld(seed).runner;
    const b = makeWorld(seed).runner;
    const ra = a.run(new Rng(seed), OPTS);

    b.setIdentityFaultForTest(true);
    b.begin(new Rng(seed), OPTS);
    while (!b.liveProgress()?.done) b.step(113);
    const rb = b.finish();

    expect(key(rb)).not.toBe(key(ra));
  });

  it('주 중간 건설이 그 주 결산에 반영된다 — 흐르는 낮의 요점', () => {
    /*
     * 흐름 모드에서는 주가 도는 **중에** 짓는다 (K39). 4일째에 시설을 하나 세우면
     * 남은 사흘의 유지비가 결산에 들어와야 한다 — 안 들어오면 "놓자마자 반응이 보인다"
     * 가 거짓이 된다. 경계에만 지은 판(봇·골든의 방식)과 유지비가 달라야 정상이다.
     */
    const base = makeWorld(42).runner;
    const mid = makeWorld(42);
    const repBase = base.run(new Rng(9), OPTS);

    mid.runner.begin(new Rng(9), OPTS);
    mid.runner.step(480); // 4일째 한복판
    let placed = false;
    outer: for (let j = 10; j < 40; j++) {
      for (let i = 30; i < 70; i++) {
        if (mid.place('parasol', i, j)) {
          placed = true;
          break outer;
        }
      }
    }
    expect(placed, '주중 건설 자리를 찾는다').toBe(true);
    while (!mid.runner.liveProgress()?.done) mid.runner.step(97);
    const repMid = mid.runner.finish();

    // 유지비: 남은 사흘치만큼 더 나와야 한다 (하루 단위로 나눠 물리므로 > 0 차이)
    expect(repMid.upkeep).toBeGreaterThan(repBase.upkeep);
  });

  it('수명 가드 — 순서를 어기면 조용히 썩는 대신 던진다', () => {
    const r = makeWorld(7).runner;
    expect(() => r.step(1)).toThrow(); // begin 전 step
    expect(() => r.finish()).toThrow(); // begin 전 finish
    r.begin(new Rng(1), OPTS);
    expect(() => r.begin(new Rng(2), OPTS)).toThrow(); // 겹친 주
    r.step(10);
    expect(() => r.finish()).toThrow(); // 덜 돈 주
    r.step(TICKS_PER_WEEK); // 남은 만큼만 소비된다
    expect(r.liveProgress()?.done).toBe(true);
    expect(() => r.finish()).not.toThrow();
    expect(r.liveProgress()).toBeNull(); // 마감 후엔 진행 상태가 없다
  });
});

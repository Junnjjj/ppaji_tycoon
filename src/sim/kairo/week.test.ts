import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, allFacilityDefs, facilityDef } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import {
  WeekRunner,
  DAYS_PER_WEEK,
  TICKS_PER_DAY,
  TICKS_PER_WEEK,
  DAY_NAMES,
  WEATHER_DEMAND,
  SEASON_PROFILE,
  type Season,
  type NeedKind,
} from './week.js';

const GATE = { i: 0, j: 0 };

interface World {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  g: GuestStore;
  r: WeekRunner;
}

function world(size = 24, facilities: [string, number, number][] = []): World {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'lawn');
  const w = new WallGrid(size, size);
  const p = new PlacementGrid(size, size);
  for (const [id, i, j] of facilities) p.place(t, w, GATE, id, i, j);
  const g = new GuestStore(t, w, p, GATE, {
    ...GUEST_DEFAULTS,
    wantUses: 2,
    useTicks: 8,
    patienceTicks: 200,
  });
  g.invalidate();
  return { t, w, p, g, r: new WeekRunner(t, p, g) };
}

describe('시설 경제 데이터', () => {
  it('73종 전부 요금·유지비·건설비·수요 종류를 갖는다', () => {
    for (const d of allFacilityDefs()) {
      const x = d as unknown as { fee: number; upkeep: number; cost: number; need: string };
      expect(x.fee, d.id).toBeGreaterThan(0);
      expect(x.upkeep, d.id).toBeGreaterThan(0);
      expect(x.cost, d.id).toBeGreaterThan(0);
      expect(x.need, d.id).toBeTruthy();
    }
  });

  it('큰 시설이 더 비싸다 — 최소한 이 단조성은 지킨다', () => {
    const small = facilityDef('vending_out') as unknown as { cost: number };
    const big = facilityDef('turtle_island') as unknown as { cost: number };
    expect(big.cost).toBeGreaterThan(small.cost);
  });
});

describe('주 단위 구조', () => {
  it('한 주는 7일이고 하루는 120 tick 이다', () => {
    expect(DAYS_PER_WEEK).toBe(7);
    expect(TICKS_PER_DAY).toBe(120);
    expect(TICKS_PER_WEEK).toBe(840);
    expect(DAY_NAMES).toHaveLength(7);
  });

  it('결산이 요일 7개를 낸다', () => {
    const { r } = world(20, [['shop', 4, 4]]);
    const rep = r.run(new Rng(1));
    expect(rep.days).toHaveLength(7);
    expect(rep.days.map((d) => d.name)).toEqual([...DAY_NAMES]);
    expect(rep.week).toBe(1);
  });

  it('주를 거듭하면 주차가 올라간다', () => {
    const { r } = world(20, [['shop', 4, 4]]);
    const rng = new Rng(2);
    r.run(rng);
    const second = r.run(rng);
    expect(second.week).toBe(2);
  });
});

describe('날씨는 배수가 아니라 수요 구성을 바꾼다 — v4 결정', () => {
  it('비는 food·warm·rest 를 올리고 thrill·play 를 내린다', () => {
    const rain = WEATHER_DEMAND['rain'];
    expect(rain['food']).toBeGreaterThan(1);
    expect(rain['warm']).toBeGreaterThan(1);
    expect(rain['rest']).toBeGreaterThan(1);
    expect(rain['thrill']).toBeLessThan(1);
    expect(rain['play']).toBeLessThan(1);
  });

  it('추위는 warm 을 크게 올린다', () => {
    expect(WEATHER_DEMAND['cold']['warm']).toBeGreaterThan(1.4);
  });

  it('어떤 날씨도 모든 종류를 한꺼번에 깎지 않는다 — 그건 RNG 세금이다', () => {
    for (const [name, mods] of Object.entries(WEATHER_DEMAND)) {
      const vals = Object.values(mods);
      if (vals.length === 0) continue;
      expect(Math.max(...vals), name).toBeGreaterThanOrEqual(1);
    }
  });

  it('계절마다 방문객 기준과 날씨 후보가 다르다 — 여름이 주력', () => {
    const seasons = Object.keys(SEASON_PROFILE) as Season[];
    expect(seasons).toHaveLength(4);
    expect(SEASON_PROFILE['summer'].arrivalBase).toBeGreaterThan(
      SEASON_PROFILE['winter'].arrivalBase,
    );
    for (const s of seasons) expect(SEASON_PROFILE[s].weather.length).toBeGreaterThan(0);
  });
});

describe('결산이 병목을 보여준다 — 숫자 표만이면 엑셀 게임이 된다', () => {
  it('혼잡 히트맵이 격자 크기와 같고 손님이 지난 곳에 값이 쌓인다', () => {
    const { r } = world(20, [['shop', 6, 6]]);
    const rep = r.run(new Rng(3));
    expect(rep.heatW).toBe(20);
    expect(rep.heatH).toBe(20);
    expect(rep.heat).toHaveLength(400);
    expect(rep.heat.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(rep.hotspot).not.toBeNull();
    expect(rep.hotspot!.value).toBeGreaterThan(0);
  });

  it('게이트 근처가 가장 붐빈다 — 모든 손님이 지나는 곳', () => {
    const { r } = world(20, [['shop', 8, 8]]);
    const rep = r.run(new Rng(4));
    const hs = rep.hotspot!;
    // 게이트에서 멀지 않아야 한다
    expect(Math.abs(hs.i - GATE.i) + Math.abs(hs.j - GATE.j)).toBeLessThan(20);
  });

  it('시설이 없으면 병목이 없다', () => {
    const { r } = world(16);
    const rep = r.run(new Rng(5));
    expect(rep.bottleneck).toBeNull();
  });

  it('한 종류만 지으면 다른 종류가 병목으로 나온다', () => {
    const { r } = world(24, [
      ['shop', 4, 4],
      ['snackbar', 8, 4],
      ['sauna', 4, 8],
    ]);
    const rep = r.run(new Rng(6));
    expect(rep.bottleneck).not.toBeNull();
    const needs = new Set<NeedKind>(['food', 'warm']);
    expect(needs.has(rep.bottleneck!.need)).toBe(true);
  });
});

describe('돈', () => {
  it('시설이 있으면 매출이 생긴다', () => {
    const { r } = world(20, [['shop', 5, 5]]);
    const rep = r.run(new Rng(7));
    expect(rep.revenue).toBeGreaterThan(0);
    expect(rep.upkeep).toBeGreaterThan(0);
    expect(rep.profit).toBe(rep.revenue - rep.upkeep);
  });

  it('시설이 없으면 매출 0 이고 유지비도 0 이다', () => {
    const { r } = world(16);
    const rep = r.run(new Rng(8));
    expect(rep.revenue).toBe(0);
    expect(rep.upkeep).toBe(0);
  });

  it('현금이 이익만큼 움직인다', () => {
    const { r } = world(20, [['shop', 5, 5]]);
    const before = r.cash;
    const rep = r.run(new Rng(9));
    expect(r.cash).toBe(before + rep.profit);
  });

  it('유지비만 있고 손님이 못 오면 적자다', () => {
    const { t, w, p, g } = world(20);
    // 시설을 놓고 벽으로 완전히 봉한다 (손님이 못 온다)
    expect(p.place(t, w, GATE, 'shop', 10, 10).ok).toBe(true);
    for (let i = 8; i < 14; i++) {
      w.setRaw(i, 8, 1);
      w.setRaw(i, 13, 1);
    }
    for (let j = 8; j < 14; j++) {
      w.setRaw(8, j, 1);
      w.setRaw(13, j, 1);
    }
    g.invalidate();
    const r = new WeekRunner(t, p, g);
    const rep = r.run(new Rng(10));
    expect(rep.revenue).toBe(0);
    expect(rep.profit).toBeLessThan(0);
  });
});

describe('압축 연출용 기록 — 계산이 빠른 것과 안 보여주는 것은 다르다', () => {
  it('기록 간격을 주면 프레임이 쌓인다', () => {
    const { r } = world(20, [['shop', 5, 5]]);
    const rep = r.run(new Rng(11), { playbackEvery: 20 });
    expect(rep.playback.length).toBe(Math.ceil(TICKS_PER_WEEK / 20));
    expect(rep.playback[0]?.tick).toBe(0);
  });

  it('기록 간격 0 이면 기록하지 않는다 — 헤드리스 밸런싱에서 메모리를 아낀다', () => {
    const { r } = world(20, [['shop', 5, 5]]);
    expect(r.run(new Rng(12)).playback).toHaveLength(0);
  });

  it('프레임에 손님 위치·포즈·방향이 들어간다', () => {
    const { r } = world(20, [['shop', 5, 5]]);
    const rep = r.run(new Rng(13), { playbackEvery: 10 });
    const withGuests = rep.playback.find((f) => f.guests.length > 0);
    expect(withGuests).toBeDefined();
    const g0 = withGuests!.guests[0]!;
    expect(typeof g0.i).toBe('number');
    expect(typeof g0.pose).toBe('string');
    expect(typeof g0.facing).toBe('string');
  });
});

describe('결정론', () => {
  it('같은 시드·같은 배치는 같은 결산을 낸다', () => {
    const shot = (seed: number): string => {
      const { r } = world(24, [
        ['shop', 5, 5],
        ['cafe', 10, 5],
      ]);
      const rep = r.run(new Rng(seed));
      return JSON.stringify({
        v: rep.visitors,
        rev: rep.revenue,
        days: rep.days.map((d) => [d.weather, d.visitors, d.revenue]),
        hot: rep.hotspot,
      });
    };
    expect(shot(42)).toBe(shot(42));
  });

  it('다른 시드는 다른 결산을 낸다', () => {
    const shot = (seed: number): string => {
      const { r } = world(24, [['shop', 5, 5]]);
      const rep = r.run(new Rng(seed));
      return JSON.stringify(rep.days.map((d) => d.weather));
    };
    expect(shot(42)).not.toBe(shot(4242));
  });

  it('sim 은 Math.random·Date 를 쓰지 않는다', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/sim/kairo/week.ts', 'utf8');
    expect(src).not.toContain('Math.random');
    expect(src).not.toContain('Date.now');
    expect(src).not.toContain('new Date');
  });
});

describe('주말이 성수기다', () => {
  it('토·일에 **오려는** 손님이 평일보다 많다', () => {
    const { r } = world(24, [
      ['shop', 4, 4],
      ['cafe', 9, 4],
      ['snackbar', 4, 9],
    ]);
    const rep = r.run(new Rng(77));
    const weekday = rep.days.slice(0, 5).reduce((a, d) => a + d.arrivals, 0) / 5;
    const weekend = rep.days.slice(5).reduce((a, d) => a + d.arrivals, 0) / 2;
    expect(weekend).toBeGreaterThan(weekday);
  });

  it('정원이 차면 돌려보낸 손님이 기록된다 — 시설을 늘려야 한다는 신호', () => {
    // 정원을 아주 작게 두면 곧바로 만석이 된다
    const t = new KairoTerrain(20, 20);
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) t.paint(i, j, 'lawn');
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    p.place(t, w, GATE, 'shop', 5, 5);
    const g = new GuestStore(t, w, p, GATE, {
      ...GUEST_DEFAULTS,
      maxGuests: 3,
      useTicks: 60,
      wantUses: 9,
      patienceTicks: 900,
    });
    g.invalidate();
    const rep = new WeekRunner(t, p, g).run(new Rng(78));
    expect(rep.turnedAway).toBeGreaterThan(0);
    expect(rep.arrivals).toBe(rep.visitors + rep.turnedAway);
  });

  it('오려는 손님 = 들어온 손님 + 돌려보낸 손님', () => {
    const { r } = world(24, [['shop', 5, 5]]);
    const rep = r.run(new Rng(79));
    expect(rep.arrivals).toBe(rep.visitors + rep.turnedAway);
    for (const d of rep.days) expect(d.arrivals).toBe(d.visitors + d.turnedAway);
  });
});

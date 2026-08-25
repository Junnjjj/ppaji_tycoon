import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, EDGE_SOLID, DIR_I_PLUS, DIR_I_MINUS, DIR_J_PLUS, DIR_J_MINUS } from './walls.js';
import { PlacementGrid, allFacilityDefs, facilityDef } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
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
import { GRADES, admissionLimit } from './progress.js';

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
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'path_stone');
  const w = new WallGrid(size, size);
  const p = new PlacementGrid(size, size);
  for (const [id, i, j] of facilities) p.place(t, w, GATE, id, i, j);
  // 입장 수속은 `admission.test.ts` 가 본다 — 여기서는 주 루프의 숫자만 잰다
  const g = new GuestStore(t, w, p, GATE, {
    ...OPEN_GATE_DEFAULTS,
    wantUses: 2,
    useTicks: 8,
    patienceTicks: 200,
  });
  g.invalidate();
  return { t, w, p, g, r: new WeekRunner(t, p, g) };
}

describe('시설 경제 데이터', () => {
  it('75종 전부 요금·유지비·건설비·수요 종류를 갖는다', () => {
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

  it('시설이 하나도 없으면 그 자체가 병목이다 — 없는 것이 가장 큰 부족이다', () => {
    const { r } = world(16);
    const rep = r.run(new Rng(5));
    // 예전에는 여기서 null 이었다. `supply` 가 비어 후보가 하나도 없었기 때문이지,
    // 부족한 것이 없어서가 아니었다 — 빈 공원의 조언이 "없음"이면 결산이 침묵한다
    expect(rep.bottleneck).not.toBeNull();
    expect(rep.bottleneck!.supply).toBe(0);
    expect(rep.bottleneck!.missing).toBe(true);
  });

  it('한 종류만 지으면 아직 없는 종류가 병목으로 나온다', () => {
    const { r } = world(24, [
      ['shop', 4, 4],
      ['snackbar', 8, 4],
      ['sauna', 4, 8],
    ]);
    const rep = r.run(new Rng(6));
    expect(rep.bottleneck).not.toBeNull();
    // 먹거리·온열은 지었다 — 병목은 그 밖의 **하나도 없는** 종류여야 한다
    expect(rep.bottleneck!.supply).toBe(0);
    expect(new Set<NeedKind>(['food', 'warm']).has(rep.bottleneck!.need)).toBe(false);
  });
});

/*
 * P3-B — **하나도 없는 종류를 가리킬 수 있어야 한다.**
 *
 * 예전 계산은 `Object.keys(lw.supply)` 를 순회했다. `supply` 는 지어진 시설에서
 * 만들어지므로 **공급 0 인 종류는 키 자체가 없다** → 후보에 안 든다. 실측: 봇이 스릴
 * 시설 0개로 52주를 도는 동안 병목이 한 번도 스릴을 안 가리켰다.
 */
describe('병목은 하나도 없는 종류를 가리킬 수 있다 (P3-B)', () => {
  /** 먹거리·온열만 지은 판. 스릴은 0개다 */
  const noThrill = (): World =>
    world(24, [
      ['shop', 4, 4],
      ['snackbar', 8, 4],
      ['sauna', 4, 8],
    ]);
  /** 지금 지을 수 있는 것 — 먹거리·온열·스릴만 열려 있다고 본다 */
  const OPEN = ['shop', 'snackbar', 'vending_out', 'sauna', 'footbath', 'diving'];

  it('★ 스릴이 0개인 판에서 병목이 스릴을 가리킨다', () => {
    const { r } = noThrill();
    const rep = r.run(new Rng(11), { buildable: OPEN });
    expect(rep.bottleneck!.need).toBe('thrill');
    expect(rep.bottleneck!.supply).toBe(0);
    expect(rep.bottleneck!.missing).toBe(true);
  });

  it('음성 대조군 — 예전 로직(지어진 종류만)으로 되돌리면 스릴이 절대 안 뽑힌다', () => {
    const { r } = noThrill();
    r.setBottleneckFaultForTest(true);
    const rep = r.run(new Rng(11), { buildable: OPEN });
    expect(rep.bottleneck!.need).not.toBe('thrill');
    // 되돌린 쪽은 **지어진 종류**만 후보다 — 그게 정확히 옛 버그의 모양이다
    expect(new Set<NeedKind>(['food', 'warm']).has(rep.bottleneck!.need)).toBe(true);
    expect(rep.bottleneck!.supply).toBeGreaterThan(0);
  });

  it('처방이 방법까지 말한다 — 지금 지을 수 있는 것 중 가장 싼 후보를 준다', () => {
    const { r } = noThrill();
    const rep = r.run(new Rng(12), { buildable: OPEN });
    expect(rep.bottleneck!.example).toBe('diving');
  });

  it('해금 안 된 종류는 안 가리킨다 — 막다른 길 금지', () => {
    const { r } = noThrill();
    // 숙박(최소 3등급)·스릴은 안 열렸다. 열린 것은 먹거리·온열뿐
    const rep = r.run(new Rng(13), { buildable: ['shop', 'snackbar', 'sauna'] });
    expect(new Set<NeedKind>(['food', 'warm']).has(rep.bottleneck!.need)).toBe(true);
    expect(rep.bottleneck!.missing).toBe(false);
  });

  it('지을 수 있는 것이 하나도 없으면 조언도 없다 — 빈 배열과 미지정은 다르다', () => {
    const { r } = noThrill();
    expect(r.run(new Rng(14), { buildable: [] }).bottleneck).toBeNull();
    // 미지정 = "해금을 안 본다" (기존 호출자 호환)
    expect(r.run(new Rng(14)).bottleneck).not.toBeNull();
  });

  it('사고로 쉬는 시설은 "하나도 없다"가 아니다 — 있고, 이번 주에 닫혔을 뿐이다', () => {
    // 시설이 사우나 하나뿐이라 사고는 반드시 그것을 맞춘다
    const { r } = world(20, [['sauna', 6, 6]]);
    const rep = r.run(new Rng(16), { buildable: ['sauna'], accidentChance: 1 });
    expect(rep.accident).not.toBeNull();
    expect(rep.bottleneck!.need).toBe('warm');
    expect(rep.bottleneck!.supply).toBe(0); // 이번 주 공급은 0 이 맞다
    expect(rep.bottleneck!.missing).toBe(false); // 그래도 "하나도 없다"는 거짓말이다
  });

  it('계절에 안 도는 종류는 안 가리킨다 — 겨울의 "스릴이 없습니다"는 소음이다', () => {
    const { r } = world(24, [['shop', 4, 4]]);
    const winter = new Set<NeedKind>(['food', 'stay', 'service', 'hygiene', 'warm']);
    for (let k = 0; k < 4; k++) {
      const rep = r.run(new Rng(20 + k), { season: 'winter' });
      expect(winter.has(rep.bottleneck!.need), rep.bottleneck!.need).toBe(true);
    }
  });

  it('공급이 있는 것끼리는 예전 성질 그대로 — 수요/공급 비가 가장 나쁜 쪽', () => {
    // 먹거리 정원 2 (매점 하나) vs 온열 정원 12 (사우나 셋). 둘 다 공급이 있다
    const { r } = world(28, [
      ['snackbar', 4, 4],
      ['sauna', 8, 4],
      ['sauna', 12, 4],
      ['sauna', 16, 4],
    ]);
    const rep = r.run(new Rng(15), { buildable: ['snackbar', 'sauna'] });
    expect(rep.bottleneck!.missing).toBe(false);
    expect(rep.bottleneck!.need).toBe('food');
  });
});

/**
 * 결산이 입장 상한을 안다 (P3-C).
 *
 * 입장은 `min(등급 maxGuests, 공급×1.5)` 다. 공급×1.5 가 등급 천장을 넘으면 시설을 더 지어도
 * 손님은 한 명도 안 늘고 유지비만 는다 — 그런데 병목은 수요/공급만 봐서 그 구간에서도
 * "○○이 부족합니다"를 계속 말했다. 봇은 `capped` 로 이 상태를 이미 알았고 **게임 UI 만
 * 몰랐다** (`docs/research/late-game-cap-proposal.md` §1.7).
 *
 * ⚠ 아래 두 it 이 **서로의 음성 대조군**이다. 하나만 두면 "언제나 true 를 내는 판정"도 통과한다.
 */
describe('결산이 정원이 찼는지 안다 (P3-C)', () => {
  // 1등급 = maxGuests 40. 공급×1.5 ≥ 40 이면 상한에 걸린다 → 정원 27 이상
  const grade1 = GRADES[0]!;

  it('공급이 등급 천장을 넘으면 capped 다 — 지어도 한 명도 더 안 들어온다', () => {
    /*
     * 정원을 상한 위로 올린다. 시설 종류가 아니라 **정원 합**이 문제이므로 무엇을 놓든
     * 상관없다 — 실제로 봇의 후반 판이 이 상태다 (시설 75종 한 채씩 = 정원 185 > 40).
     */
    const { p, r } = world(40, [
      ['pool_warm', 2, 2],
      ['pool_warm', 8, 2],
      ['pool_warm', 14, 2],
      ['pool_lazy', 20, 2],
      ['pool_kids', 2, 10],
      ['bbq_zone', 8, 10],
      ['playground', 14, 10],
    ]);
    expect(Math.ceil(p.totalCapacity() * 1.5)).toBeGreaterThanOrEqual(grade1.maxGuests);
    const rep = r.run(new Rng(21), { grade: grade1 });
    expect(rep.admissionCap).not.toBeNull();
    expect(rep.admissionCap!.capped).toBe(true);
    expect(rep.admissionCap!.gradeMax).toBe(grade1.maxGuests);
    // 상한에 걸렸으니 적용된 상한이 곧 등급 천장이다
    expect(rep.admissionCap!.limit).toBe(grade1.maxGuests);
  });

  it('⚠ 음성 대조군 — 공급이 천장 아래면 capped 가 아니다 (예전 병목 문구가 맞다)', () => {
    const { p, r } = world(24, [['snackbar', 4, 4]]);
    expect(Math.ceil(p.totalCapacity() * 1.5)).toBeLessThan(grade1.maxGuests);
    const rep = r.run(new Rng(21), { grade: grade1 });
    expect(rep.admissionCap!.capped).toBe(false);
    expect(rep.admissionCap!.limit).toBeLessThan(grade1.maxGuests);
    // 이 구간에서는 병목이 여전히 처방이다
    expect(rep.bottleneck).not.toBeNull();
  });

  it('등급을 안 주는 호출자(봇·옛 테스트)에게는 null — 기존 호출자 호환', () => {
    const { r } = world(24, [['snackbar', 4, 4]]);
    expect(r.run(new Rng(21)).admissionCap).toBeNull();
  });

  it('판정은 admissionLimit 하나가 소유한다 — 같은 답이 나와야 한다', () => {
    /*
     * ⚠ 규칙을 두 벌로 두면 결산만 옛 규칙으로 남는다. 여기서는 결산이 낸 `limit` 이
     * 정본 함수의 값과 같은지를 직접 대조한다 — 갈라지면 이 줄이 먼저 빨개진다.
     */
    const { p, r } = world(40, [
      ['pool_warm', 2, 2],
      ['pool_kids', 8, 2],
      ['snackbar', 2, 10],
    ]);
    const rep = r.run(new Rng(22), { grade: grade1 });
    expect(rep.admissionCap!.limit).toBe(admissionLimit(grade1, p.totalCapacity()));
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
    // 시설을 놓고 경계 벽으로 완전히 봉한다 (손님이 못 온다)
    expect(p.place(t, w, GATE, 'shop', 10, 10).ok).toBe(true);
    for (let i = 8; i < 14; i++) {
      w.setEdge(i, 8, DIR_J_MINUS, EDGE_SOLID);
      w.setEdge(i, 13, DIR_J_PLUS, EDGE_SOLID);
    }
    for (let j = 8; j < 14; j++) {
      w.setEdge(8, j, DIR_I_MINUS, EDGE_SOLID);
      w.setEdge(13, j, DIR_I_PLUS, EDGE_SOLID);
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

  it('★ 프레임에 출발 칸(fromI/fromJ)이 들어간다 — 렌더가 깊이를 두 칸으로 잡는다 (K37)', () => {
    const { r } = world(20, [['shop', 5, 5]]);
    const rep = r.run(new Rng(13), { playbackEvery: 10 });
    const withGuests = rep.playback.find((f) => f.guests.length > 0);
    expect(withGuests).toBeDefined();
    for (const g of withGuests!.guests) {
      expect(Number.isInteger(g.fromI)).toBe(true);
      expect(Number.isInteger(g.fromJ)).toBe(true);
      // 출발 칸은 목적 칸의 이웃이거나 같은 칸이다 (한 걸음이 한 칸이다)
      expect(Math.abs(g.i - g.fromI) + Math.abs(g.j - g.fromJ)).toBeLessThanOrEqual(1);
    }
    // 실제로 **걷는** 손님이 있어야 검사가 유의미하다 (전부 제자리면 조용히 통과한다)
    const walking = rep.playback
      .flatMap((f) => f.guests)
      .filter((g) => g.i !== g.fromI || g.j !== g.fromJ);
    expect(walking.length).toBeGreaterThan(0);
    // 그중 **위로** 걷는 손님(i+j 가 주는 쪽)이 있어야 이 버그가 재현되는 상황이다
    const upward = walking.filter((g) => g.i + g.j < g.fromI + g.fromJ);
    expect(upward.length).toBeGreaterThan(0);
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
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) t.paint(i, j, 'path_stone');
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    p.place(t, w, GATE, 'shop', 5, 5);
    const g = new GuestStore(t, w, p, GATE, {
      ...OPEN_GATE_DEFAULTS,
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

/**
 * 콤보 → 주간 경제 배선 (S5).
 *
 * 콤보 73종은 오랫동안 조건 판정·도감 표시용이었고 **현금·만족도에 전혀 닿지 않았다**
 * (`permitArea` 가 S1 전까지 그랬던 것과 같은 죽은 축). 여기 검사는 배선이 살아 있는지,
 * 그리고 **끊으면 정말 죽는지**(음성 대조군)를 같은 판으로 잰다.
 */
describe('콤보 보너스가 주간 경제에 실린다 (S5)', () => {
  /** 같은 시드·같은 배치로 한 주를 돌린다 — 콤보 옵션만 바꿔 대조한다 */
  const runWith = (combos?: { satisfactionDelta: number; revenueMult: number }) => {
    const { r } = world(24, [
      ['shop', 5, 5],
      ['cafe', 9, 5],
      ['snackbar', 5, 9],
    ]);
    return r.run(new Rng(4242), combos ? { combos } : {});
  };

  it('매출 배율이 매출을 올린다', () => {
    const base = runWith();
    const boosted = runWith({ satisfactionDelta: 0, revenueMult: 1.2 });
    expect(base.revenue).toBeGreaterThan(0);
    expect(boosted.revenue).toBeGreaterThan(base.revenue);
  });

  it('만족 보너스가 퇴장 만족도를 올린다', () => {
    const base = runWith();
    const boosted = runWith({ satisfactionDelta: 8, revenueMult: 1 });
    expect(base.exitSatisfaction).toBeGreaterThan(0);
    expect(boosted.exitSatisfaction).toBeCloseTo(base.exitSatisfaction + 8, 6);
  });

  it('음성 대조군 — 배선을 끊으면(옵션 미전달) 수치가 한 톨도 안 움직인다', () => {
    /*
     * 이 검사가 없으면 위 둘은 "옵션을 주면 달라진다"만 본다. 배선이 실제로 콤보에서
     * 온다는 것은 호출자 쪽 정적 검사가 보고, 여기서는 **중립값이 정확히 중립**인지를
     * 본다 — 중립이 아니면 콤보가 없는 판이 조용히 벌점을 받는다.
     */
    const none = runWith();
    const neutral = runWith({ satisfactionDelta: 0, revenueMult: 1 });
    expect(neutral.revenue).toBe(none.revenue);
    expect(neutral.exitSatisfaction).toBe(none.exitSatisfaction);
    expect(neutral.profit).toBe(none.profit);
  });

  it('매출 배율은 **입장료에 안 붙는다** — 표값은 플레이어 슬라이더 소관', () => {
    const base = runWith();
    const boosted = runWith({ satisfactionDelta: 0, revenueMult: 1.5 });
    expect(base.admission).toBeGreaterThanOrEqual(0);
    expect(boosted.admission).toBe(base.admission);
    // 공원 매출(입장료 제외)만 정확히 1.5배
    expect(boosted.revenue - boosted.admission).toBe(
      Math.round((base.revenue - base.admission - base.courseRevenue) * 1.5) + base.courseRevenue,
    );
  });

  it('매출 배율은 **코스 매출에도 안 붙는다** — 코스는 적합도라는 제 축이 있다', () => {
    const withCourse = (mult: number) => {
      const { r } = world(24, [['shop', 5, 5]]);
      return r.run(new Rng(31), {
        courses: { potentialRevenue: 100_000, upkeep: 0, potentialRiders: 10 },
        combos: { satisfactionDelta: 0, revenueMult: mult },
      });
    };
    const a = withCourse(1);
    const b = withCourse(2);
    expect(a.courseRevenue).toBeGreaterThan(0);
    expect(b.courseRevenue).toBe(a.courseRevenue);
  });

  it('결정론 — 같은 시드·같은 콤보면 같은 결산', () => {
    const shot = () =>
      JSON.stringify(
        runWith({ satisfactionDelta: 3.7, revenueMult: 1.043 }).days.map((d) => [
          d.revenue,
          d.visitors,
        ]),
      );
    expect(shot()).toBe(shot());
  });

  it('호출자 둘이 **같은 함수**로 넘긴다 — 헤드리스와 실제 판이 갈라지면 안 된다', async () => {
    /*
     * 이 저장소가 여러 번 겪은 사고다 (토지 해금·ensurePath). 한쪽만 넘기면 밸런싱이
     * 실제 판과 다른 세계를 잰다. 정적 검사라도 있는 편이 낫다 — 없으면 다음 사람이
     * `main.ts` 만 고치고 봇을 잊는다.
     */
    const fs = await import('node:fs/promises');
    for (const path of ['src/main.ts', 'tools/kairo-sim.ts']) {
      const src = await fs.readFile(path, 'utf8');
      expect(src, path).toContain('comboEffect(');
      // zone 콤보 3종은 구역을 안 주면 조용히 0 이 된다
      expect(src, path).toMatch(/comboEffect\(\s*evaluateCombos\([^)]*swimZones\(\)/);
    }
  });
});

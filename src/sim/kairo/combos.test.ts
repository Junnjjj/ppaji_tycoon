import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';

import { PlacementGrid, allFacilityDefs } from './placement.js';
import {
  COMBOS,
  DIMINISHING,
  comboDef,
  diminishingScale,
  evaluateCombos,
  previewCombos,
  zoneAreaScale,
  comboEffect,
  saturate,
  COMBO_ECONOMY,
  type ComboDef,
  type ComboTier,
} from './combos.js';
import type { SwimZone } from './swim.js';

const GATE = { i: 0, j: 0 };

/**
 * 콤보 시험판. 실내 시설 9종을 아무 데나 놓을 수 있도록 **안쪽을 전부 실내 바닥**으로 깐다.
 *
 * 실내는 곧 바닥이다 (K27) — 방을 "짓는" 절차가 따로 없다. 콤보는 거리만 보므로
 * 바닥 종류가 판정을 바꾸지 않는다.
 */
function flat(size = 30): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      t.paint(i, j, i > 0 && j > 0 && i < size - 1 && j < size - 1 ? 'floor_indoor' : 'path_stone');
    }
  }
  return { t, w: new WallGrid(size, size), p: new PlacementGrid(size, size) };
}

describe('콤보 데이터', () => {
  it('73종 3티어 — 소 40 · 중 22 · 대 11 (S4 에서 zone 3종)', () => {
    expect(COMBOS).toHaveLength(73);
    const by: Record<string, number> = {};
    for (const c of COMBOS) by[c.tier] = (by[c.tier] ?? 0) + 1;
    expect(by).toEqual({ small: 40, medium: 22, large: 11 });
  });

  it('ID 가 유일하다', () => {
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length);
  });

  it('참조하는 시설이 전부 존재한다', () => {
    const ids = new Set(allFacilityDefs().map((d) => d.id));
    for (const c of COMBOS) {
      for (const r of c.requires) {
        if (r.facility) expect(ids.has(r.facility), `${c.id} → ${r.facility}`).toBe(true);
      }
    }
  });

  it('보너스가 전부 양수다', () => {
    for (const c of COMBOS) {
      expect((c.bonus.satisfaction ?? 0) + (c.bonus.revenue ?? 0), c.id).toBeGreaterThan(0);
    }
  });

  it('티어가 올라갈수록 보너스가 크다', () => {
    const avg = (t: ComboTier): number => {
      const list = COMBOS.filter((c) => c.tier === t);
      return list.reduce((a, c) => a + (c.bonus.revenue ?? 0), 0) / list.length;
    };
    expect(avg('medium')).toBeGreaterThan(avg('small'));
    expect(avg('large')).toBeGreaterThan(avg('medium'));
  });
});

describe('체감 — 최적 콤보 도배를 막는다 (v4 결정)', () => {
  it('중형은 30% → 15% → 5% 로 준다', () => {
    expect(DIMINISHING.medium).toEqual([0.3, 0.15, 0.05]);
    expect(diminishingScale('medium', 0)).toBe(0.3);
    expect(diminishingScale('medium', 1)).toBe(0.15);
    expect(diminishingScale('medium', 2)).toBe(0.05);
    // 그 이후는 마지막 값이 계속
    expect(diminishingScale('medium', 9)).toBe(0.05);
  });

  it('대형은 리조트당 1회다', () => {
    expect(diminishingScale('large', 0)).toBe(1);
    expect(diminishingScale('large', 1)).toBe(0);
    expect(diminishingScale('large', 5)).toBe(0);
  });

  it('소형은 중복해도 온전히 준다 — 붙여 놓으라는 힌트 정도라 판이 안 망가진다', () => {
    expect(diminishingScale('small', 0)).toBe(1);
    expect(diminishingScale('small', 3)).toBe(1);
  });
});

/**
 * 면적 비례 (P1-A). 구역은 파생 데이터라 (`swim.ts`) 여기선 **평문으로 만들어** 쓴다 —
 * 지형을 실제로 파는 통합 검사는 `swim.test.ts` 에 있다. 둘 다 있어야 하는 이유:
 * 여기선 면적을 원하는 만큼 키울 수 있고, 거기선 "실제로 파생되는 값이 맞나"를 본다.
 */
function fakeZone(kind: 'pool' | 'river', area: number, i0 = 10, j0 = 10): SwimZone {
  const tiles: { x: number; y: number }[] = [];
  for (let k = 0; k < area; k++) tiles.push({ x: i0 + (k % 4), y: j0 + Math.floor(k / 4) });
  return { kind, tiles, entries: [], area };
}

/** 풀 파티 하나의 만족 보너스 — 없으면 0 */
function poolPartyBonus(zones: readonly SwimZone[]): number {
  const { t, w, p } = flat();
  expect(p.place(t, w, GATE, 'dj_booth', 11, 11).ok).toBe(true);
  const hits = evaluateCombos(p, undefined, zones).active.filter(
    (c) => c.id === 'medium_pool_party',
  );
  return hits[0]?.satisfaction ?? 0;
}

describe('면적 비례 (P1-A) — 큰 구역 하나를 만들 이유', () => {
  const PARTY = comboDef('medium_pool_party') as ComboDef;

  it('곡선 = clamp(sqrt(area/base), 1, cap) — 면적 4배에 배율 2배', () => {
    expect(PARTY.areaScale).toEqual({ base: 8, cap: 2 });
    expect(zoneAreaScale(PARTY, 8)).toBeCloseTo(1, 6); // 기준 면적
    expect(zoneAreaScale(PARTY, 18)).toBeCloseTo(1.5, 6);
    expect(zoneAreaScale(PARTY, 32)).toBeCloseTo(2, 6); // 4배 면적 → 2배
  });

  it('작은 구역은 예전과 같다 — 면적은 보상 축이지 벌점 축이 아니다', () => {
    // 최소 규격 4칸은 base(8) 미만인데도 깎이지 않는다
    expect(zoneAreaScale(PARTY, 4)).toBe(1);
    expect(zoneAreaScale(PARTY, 1)).toBe(1);
    expect(zoneAreaScale(PARTY, 0)).toBe(1);
  });

  it('상한에서 멈춘다 — 잔디 전체를 물로 칠하는 것이 정답이 되면 안 된다', () => {
    expect(zoneAreaScale(PARTY, 32)).toBeCloseTo(2, 6);
    expect(zoneAreaScale(PARTY, 200)).toBe(2);
    expect(zoneAreaScale(PARTY, 5000)).toBe(2);
  });

  it('음성 대조군 — areaScale 을 빼면 큰 구역과 작은 구역이 같아진다', () => {
    const constant: ComboDef = { ...PARTY };
    delete constant.areaScale;
    expect(zoneAreaScale(constant, 4)).toBe(1);
    expect(zoneAreaScale(constant, 400)).toBe(1);
    expect(zoneAreaScale(constant, 4)).toBe(zoneAreaScale(constant, 400));
  });

  it('zone 콤보 3종이 전부 areaScale 을 갖는다 — 빠지면 조용히 상수로 회귀한다', () => {
    const zoneCombos = COMBOS.filter((c) => c.kind === 'zone');
    expect(zoneCombos).toHaveLength(3);
    for (const c of zoneCombos) {
      expect(c.areaScale, c.id).toBeDefined();
      expect(c.areaScale!.base, c.id).toBeGreaterThan(0);
      expect(c.areaScale!.cap, c.id).toBeGreaterThan(1);
    }
  });

  it('발동 보너스가 면적을 탄다 — 작은 풀 < 큰 풀 = 상한', () => {
    const small = poolPartyBonus([fakeZone('pool', 4)]);
    const mid = poolPartyBonus([fakeZone('pool', 18)]);
    const big = poolPartyBonus([fakeZone('pool', 32)]);
    const huge = poolPartyBonus([fakeZone('pool', 400)]);
    expect(small).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(small);
    expect(big).toBeGreaterThan(mid);
    expect(huge).toBe(big); // 상한
    // 최소 규격은 예전 상수 그대로: 만족 5 × 중형 첫 발동 0.3
    expect(small).toBeCloseTo(5 * 0.3, 6);
    expect(big).toBeCloseTo(5 * 0.3 * 2, 6);
  });

  it('체감과 곱해져도 30/15/5 가 살아 있다 — 같은 크기 둘이면 두 번째가 절반', () => {
    const zones = [fakeZone('pool', 32, 10, 10), fakeZone('pool', 32, 12, 12)];
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'dj_booth', 11, 11).ok).toBe(true);
    const hits = evaluateCombos(p, undefined, zones).active.filter(
      (c) => c.id === 'medium_pool_party',
    );
    expect(hits).toHaveLength(2);
    expect(hits[0]!.areaScale).toBe(2);
    expect(hits[1]!.areaScale).toBe(2);
    // 면적 배율은 같으니 비율은 순수하게 티어 체감이다
    expect(hits[1]!.satisfaction / hits[0]!.satisfaction).toBeCloseTo(0.15 / 0.3, 6);
    expect(hits[0]!.scale).toBeCloseTo(0.3 * 2, 6);
    expect(hits[1]!.scale).toBeCloseTo(0.15 * 2, 6);
  });

  it('큰 구역이 첫 체감 슬롯을 가져간다 — 스캔 순서(좌상단)가 아니라 면적 순', () => {
    // 작은 구역을 **먼저** 준다. 정렬이 없으면 이쪽이 30% 를 먹는다
    const zones = [fakeZone('pool', 4, 10, 10), fakeZone('pool', 32, 12, 12)];
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'dj_booth', 11, 11).ok).toBe(true);
    const hits = evaluateCombos(p, undefined, zones).active.filter(
      (c) => c.id === 'medium_pool_party',
    );
    expect(hits).toHaveLength(2);
    expect(hits[0]!.areaScale).toBe(2); // 큰 구역이 index 0
    expect(hits[1]!.areaScale).toBe(1);
    expect(hits[0]!.satisfaction).toBeGreaterThan(hits[1]!.satisfaction);
  });

  it('대형은 면적이 커도 리조트당 1회다 — 면적이 중복을 되살리지 않는다', () => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'stage_river', 11, 11).ok).toBe(true);
    expect(p.place(t, w, GATE, 'dj_booth', 11, 13).ok).toBe(true);
    const zones = [fakeZone('river', 48, 10, 10), fakeZone('river', 48, 12, 12)];
    const hits = evaluateCombos(p, undefined, zones).active.filter(
      (c) => c.id === 'large_river_festa',
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.areaScale).toBe(2);
    expect(hits[0]!.scale).toBe(2); // 대형 체감 1.0 × 면적 2
  });

  it('zone 이 아닌 콤보는 면적 배율 1 이다 — 곱해도 아무것도 안 바뀐다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shower_row', 5, 5);
    p.place(t, w, GATE, 'locker_row', 5, 6);
    const hit = evaluateCombos(p).active.find((c) => c.id === 'small_shower_locker');
    expect(hit?.areaScale).toBe(1);
    expect(hit?.scale).toBe(1);
  });
});

describe('소형 — 붙여 놓으면 터진다', () => {
  it('샤워실 옆 락커를 놓으면 발동한다', () => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'shower_row', 5, 5).ok).toBe(true);
    expect(evaluateCombos(p).active.some((c) => c.id === 'small_shower_locker')).toBe(false);
    expect(p.place(t, w, GATE, 'locker_row', 5, 6).ok).toBe(true);
    const r = evaluateCombos(p);
    expect(r.active.some((c) => c.id === 'small_shower_locker')).toBe(true);
    expect(r.satisfaction).toBeGreaterThan(0);
  });

  it('멀리 떨어뜨리면 안 터진다 — 거리가 판단이다', () => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'shower_row', 3, 2).ok).toBe(true);
    expect(p.place(t, w, GATE, 'locker_row', 20, 2).ok).toBe(true);
    expect(evaluateCombos(p).active.some((c) => c.id === 'small_shower_locker')).toBe(false);
  });

  it('A 하나에 B 셋을 붙여도 콤보는 하나다 — 쌍을 한 번씩만 센다', () => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'shop', 10, 10).ok).toBe(true);
    // 평상 연립 4×1 을 세 개 붙인다
    expect(p.place(t, w, GATE, 'pyeongsang_row', 6, 12).ok).toBe(true);
    expect(p.place(t, w, GATE, 'pyeongsang_row', 6, 13).ok).toBe(true);
    expect(p.place(t, w, GATE, 'pyeongsang_row', 6, 14).ok).toBe(true);
    const hits = evaluateCombos(p).active.filter((c) => c.id === 'small_shop_pyeongsang');
    expect(hits).toHaveLength(1);
  });
});

describe('중형 — 한 구역에 여러 수요', () => {
  it('먹거리·먹거리·쉼터가 모이면 먹거리 골목이 터진다', () => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'shop', 10, 10).ok).toBe(true);
    expect(p.place(t, w, GATE, 'snackbar', 13, 10).ok).toBe(true);
    const before = evaluateCombos(p).active.some((c) => c.id === 'medium_food_court');
    expect(before).toBe(false);
    expect(p.place(t, w, GATE, 'sunbed_row', 10, 13).ok).toBe(true);
    expect(evaluateCombos(p).active.some((c) => c.id === 'medium_food_court')).toBe(true);
  });

  it('중복 발동은 체감된다 — 두 번째는 첫 번째보다 작다', () => {
    const { t, w, p } = flat(40);
    // 같은 구성을 두 군데에
    const build = (oi: number, oj: number): void => {
      p.place(t, w, GATE, 'shop', oi, oj);
      p.place(t, w, GATE, 'snackbar', oi + 3, oj);
      p.place(t, w, GATE, 'sunbed_row', oi, oj + 3);
    };
    build(5, 5);
    build(25, 25);
    const hits = evaluateCombos(p).active.filter((c) => c.id === 'medium_food_court');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.satisfaction).toBeGreaterThan(hits[1]!.satisfaction);
    expect(hits[1]!.scale).toBe(0.15);
  });
});

describe('대형 — 리조트 전체 구성', () => {
  it('위생 6개면 청결 리조트가 터지고 한 번만 터진다', () => {
    const { t, w, p } = flat(40);
    let placed = 0;
    const ids = ['shower_row', 'changing_row', 'locker_row', 'washbasin_row', 'toilet', 'nursing'];
    let j = 2;
    for (const id of ids) {
      for (let i = 2; i < 34; i += 6) {
        if (p.place(t, w, GATE, id, i, j).ok) {
          placed++;
          break;
        }
      }
      j += 3;
    }
    expect(placed).toBe(6);
    const hits = evaluateCombos(p).active.filter((c) => c.id === 'large_clean_resort');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.scale).toBe(1);
  });
});

describe('놓기 전 미리보기 — 배치 판단을 만든다', () => {
  it('놓으면 터질 콤보를 미리 알려준다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shower_row', 5, 5);
    const pv = previewCombos(p, 'locker_row', 5, 6);
    expect(pv.gained.some((c) => c.id === 'small_shower_locker')).toBe(true);
    expect(pv.satisfaction).toBeGreaterThan(0);
    // 실제로 놓지는 않았다
    expect(p.count).toBe(1);
  });

  it('멀리 놓으면 아무것도 안 터진다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shower_row', 3, 2);
    const pv = previewCombos(p, 'locker_row', 22, 2);
    expect(pv.gained.some((c) => c.id === 'small_shower_locker')).toBe(false);
  });

  it('미리보기가 상태를 바꾸지 않는다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 10, 10);
    const before = JSON.stringify(p.toSnapshot());
    previewCombos(p, 'pyeongsang_row', 10, 12);
    expect(JSON.stringify(p.toSnapshot())).toBe(before);
  });
});

describe('미리보기는 콤보만 본다 — 배치 가능성은 호출자가 따로 확인한다', () => {
  it('배치가 거절될 자리에도 콤보 계산은 답을 낸다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 10, 10);
    const pv = previewCombos(p, 'locker_row', 10, 12);
    expect(Array.isArray(pv.gained)).toBe(true);
    // 배치 가능성은 별도 검사다 — 실내 바닥이 아닌 자리는 실내 시설을 거절한다
    t.paint(10, 12, 'lawn');
    expect(p.check(t, w, GATE, 'locker_row', 10, 12).fail).toBe('needs-indoor');
  });
});

describe('알 수 없는 ID', () => {
  it('없는 콤보는 undefined', () => {
    expect(comboDef('nope')).toBeUndefined();
  });
});

/**
 * 총합 상한 (S5) — 콤보를 주간 경제에 실을 때 **반드시 필요한 제동**.
 *
 * 73종이고 소형 40종은 중복 발동이 무제한이라(`diminishing.small = [1]`) 원점수 합은
 * 후반에 수백 점까지 자란다. 그대로 더하면 만족도가 100 에 붙박이고 매출 배율이 폭주한다.
 */
describe('콤보 총합 상한 (S5)', () => {
  it('포화 곡선은 단조 증가하고 상한을 절대 넘지 않는다', () => {
    let prev = -1;
    for (const raw of [0, 1, 10, 45, 90, 200, 500, 5000, 1e9]) {
      const v = saturate(raw, 10, 90);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThan(10);
      prev = v;
    }
  });

  it('half 에서 정확히 상한의 절반이다 — 계수의 뜻이 데이터에서 읽혀야 한다', () => {
    expect(saturate(90, 10, 90)).toBeCloseTo(5, 9);
    expect(saturate(150, 18, 150)).toBeCloseTo(9, 9);
  });

  it('한 개 더 붙이면 **언제나** 조금 더 준다 — 하드 상한이면 그 위로는 죽은 축이다', () => {
    /*
     * `min(raw, cap)` 을 썼다면 cap 을 넘는 순간 콤보가 전부 무가치해진다. 그게 정확히
     * 이번에 고치려던 상태(죽은 축)의 후반부 버전이라 포화 곡선을 골랐다.
     */
    for (const raw of [50, 200, 400, 1000]) {
      const a = comboEffect({ satisfaction: raw, revenue: raw });
      const b = comboEffect({ satisfaction: raw + 3, revenue: raw + 4 });
      expect(b.satisfactionDelta).toBeGreaterThan(a.satisfactionDelta);
      expect(b.revenueMult).toBeGreaterThan(a.revenueMult);
    }
  });

  it('음성 대조군 — 상한을 걷어내면(선형) 판이 터진다', () => {
    /*
     * 상한이 정말 무는지 보려면 **없는 세계**를 옆에 두고 재야 한다. 콤보를 전부 깔면
     * 원점수가 몇 백이고, 선형이면 만족도가 100 스케일을 통째로 넘고 매출이 몇 배가 된다.
     */
    const raw = fullSetRaw();
    expect(raw.satisfaction).toBeGreaterThan(200);
    const linear = { sat: raw.satisfaction, revPct: raw.revenue };
    expect(linear.sat).toBeGreaterThan(100); // 만족도 스케일(0~100)을 통째로 넘는다
    expect(linear.revPct).toBeGreaterThan(100); // 매출이 2배를 넘는다

    const capped = comboEffect(raw);
    expect(capped.satisfactionDelta).toBeLessThan(COMBO_ECONOMY.satCap);
    expect(capped.revenueMult - 1).toBeLessThan(COMBO_ECONOMY.revCap / 100);
    // 그래도 봇이 실제로 내는 값(중앙 raw≈38)보다는 확실히 크다 — 축이 살아 있다
    expect(capped.satisfactionDelta).toBeGreaterThan(
      comboEffect({ satisfaction: 38, revenue: 47 }).satisfactionDelta * 1.5,
    );
  });

  it('중립 입력은 정확히 중립을 낸다 — 콤보 0 개인 판이 벌점을 받으면 안 된다', () => {
    const e = comboEffect({ satisfaction: 0, revenue: 0 });
    expect(e.satisfactionDelta).toBe(0);
    expect(e.revenueMult).toBe(1);
  });

  it('음수 원점수는 0 으로 본다 — 감점 축은 아직 데이터에 없다 (P1-B 미착수)', () => {
    const e = comboEffect({ satisfaction: -50, revenue: -50 });
    expect(e.satisfactionDelta).toBe(0);
    expect(e.revenueMult).toBe(1);
  });

  it('satCap 은 **등급 문턱 한 칸**과 같다 — 콤보로 두 등급을 넘기면 안 된다', async () => {
    /*
     * 상한을 "적당히 10" 으로 두면 다음 사람이 아무 근거 없이 15 로 올린다. 문턱에
     * 묶어 두면 근거가 코드에 남는다 — 등급표를 바꾸면 이 검사가 같이 깨진다.
     */
    const { GRADES } = await import('./progress.js');
    const steps = GRADES.slice(1).map(
      (g, k) => g.reqExitSatisfaction - (GRADES[k] as { reqExitSatisfaction: number }).reqExitSatisfaction,
    );
    const step = Math.min(...steps.filter((n) => n > 0));
    expect(COMBO_ECONOMY.satCap).toBe(step);
    // 상한은 점근선이라 **절대 도달하지 않는다** — 실제로도 한 칸을 못 넘긴다
    expect(comboEffect({ satisfaction: 1e6, revenue: 0 }).satisfactionDelta).toBeLessThan(step);
  });

  it('revCap 은 요금 슬라이더 폭보다 작다 — 콤보가 "값을 매긴다"를 덮으면 안 된다', () => {
    // 슬라이더는 70~140 (kairo-staff.ts) — 정가 대비 -30%~+40%
    expect(COMBO_ECONOMY.revCap).toBeLessThan(30);
  });

  it('계수는 데이터가 갖는다 (불변식 3)', () => {
    for (const k of ['satCap', 'satHalf', 'revCap', 'revHalf'] as const) {
      expect(COMBO_ECONOMY[k], k).toBeGreaterThan(0);
    }
  });
});

/** 모든 콤보가 한 번씩 터졌을 때의 원점수 — 상한 대조군의 재료 */
function fullSetRaw(): { satisfaction: number; revenue: number } {
  let satisfaction = 0;
  let revenue = 0;
  for (const c of COMBOS) {
    const s = diminishingScale(c.tier, 0);
    satisfaction += (c.bonus.satisfaction ?? 0) * s;
    revenue += (c.bonus.revenue ?? 0) * s;
  }
  return { satisfaction, revenue };
}

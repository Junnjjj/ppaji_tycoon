import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';

import { PlacementGrid, allFacilityDefs } from './placement.js';
import {
  COMBOS,
  DIMINISHING,
  CONFLICTS,
  CONFLICT_RADIUS,
  CONFLICT_ECONOMY,
  comboDef,
  diminishingScale,
  evaluateCombos,
  evaluateConflicts,
  previewCombos,
  zoneAreaScale,
  comboEffect,
  saturate,
  COMBO_ECONOMY,
  type ComboDef,
  type ComboTier,
} from './combos.js';
import { NEED_KINDS } from './week.js';
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

  it('가점 쪽 음수 입력은 여전히 0 이다 — 감점은 별도 칸으로 들어온다 (P4)', () => {
    /*
     * P4 에서 감점 축이 생겼지만 이 클램프는 **남겼다.** 감점은 `penaltySatisfaction`
     * 이라는 자기 칸으로 들어온다 — 한 숫자에 부호를 겹쳐 실으면 "감점이 어디서 왔나"를
     * 잃고, 두 축을 각자 포화시키는 일(아래 검사)도 못 한다.
     */
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

/**
 * 상성 감점 (P4, △).
 *
 * 검사가 지켜야 하는 것 다섯:
 *   ① 붙이면 내려간다 · ② **떼면 안 내려간다**(음성 대조군) · ③ 데이터를 비우면
 *   P4 이전과 **완전히 같다**(되돌리기) · ④ 무효(◯)가 다수다(도배 방지) ·
 *   ⑤ 음수 총합의 처리가 정해진 규칙대로다
 */
describe('상성 감점 (P4) — 나쁜 조합을 피하는 제약 만족 문제', () => {
  /** 화장실(위생)과 매점(먹거리)을 `d` 만큼 띄워 놓았을 때의 판정 */
  const clashAt = (d: number): ReturnType<typeof evaluateCombos> => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'toilet', 5, 5).ok).toBe(true);
    expect(p.place(t, w, GATE, 'shop', 5, 6 + d).ok).toBe(true);
    return evaluateCombos(p);
  };

  it('① 감점 쌍이 붙어 있으면 총점이 내려간다', () => {
    const near = clashAt(1);
    expect(near.conflicts.map((c) => c.id)).toContain('clash_hygiene_food');
    expect(near.penaltySatisfaction).toBeGreaterThan(0);
    const fx = comboEffect(near);
    expect(fx.satisfactionDelta).toBeLessThan(0);
    expect(fx.revenueMult).toBeLessThan(1);
  });

  it('② 음성 대조군 — 떨어뜨려 놓으면 안 내려간다', () => {
    const far = clashAt(2);
    expect(far.conflicts).toHaveLength(0);
    expect(far.penaltySatisfaction).toBe(0);
    const fx = comboEffect(far);
    expect(fx.satisfactionDelta).toBe(0);
    expect(fx.revenueMult).toBe(1);
  });

  it('②b 감점 반경(1)이 가점 반경(2)보다 좁다 — 처방이 언제나 있다', () => {
    /*
     * 같은 반경이면 "붙이면 터지고 붙이면 깎이는" 자리가 겹쳐 배치가 지뢰밭이 된다.
     * 좁혀 두면 **두 칸 띄우는 순간 가점은 살아 있고 감점만 꺼진다** — 그게 이 축의 답이다.
     */
    expect(CONFLICT_RADIUS).toBe(1);
    const small = COMBOS.filter((c) => c.kind === 'adjacent').map((c) => c.radius ?? 2);
    expect(Math.min(...small)).toBeGreaterThan(CONFLICT_RADIUS);

    // 실물로 확인: 가점 쌍(샤워+락커, radius 2)은 두 칸 띄워도 살아 있다
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'shower_row', 5, 5).ok).toBe(true);
    expect(p.place(t, w, GATE, 'locker_row', 5, 7).ok).toBe(true);
    const r = evaluateCombos(p);
    expect(r.active.some((c) => c.id === 'small_shower_locker')).toBe(true);
    expect(r.conflicts).toHaveLength(0);
  });

  it('②c 가점 `adjacent` 와 감점이 **같은 쌍**을 물지 않는다 — 모순을 데이터가 못 담게', () => {
    /*
     * 붙이면 +3 이고 동시에 −5 인 쌍이 있으면 플레이어가 배우는 규칙이 자기모순이 된다.
     * ⚠ `cluster`·`resort` 는 **일부러 겹친다**: 아이 구역(놀이+위생+먹거리, 반경 4)은
     * "같은 구역에 두되 서로 붙이지는 마라"가 되어 오히려 이 축의 핵심 퍼즐이다.
     * 금지는 **거리로 값을 매기는 티어**(adjacent, 반경 2)에만 건다.
     */
    const needOfDef = new Map(
      allFacilityDefs().map((d) => [d.id, (d as { need?: string }).need]),
    );
    const banned = new Set(CONFLICTS.map((c) => [...c.needs].sort().join('|')));
    for (const c of COMBOS) {
      if (c.kind !== 'adjacent') continue;
      const needs = c.requires
        .map((r) => r.need ?? needOfDef.get(r.facility ?? ''))
        .filter((n): n is string => !!n);
      for (let a = 0; a < needs.length; a++) {
        for (let b = a + 1; b < needs.length; b++) {
          const key = [needs[a], needs[b]].sort().join('|');
          expect(banned.has(key), `${c.id} = ${key}`).toBe(false);
        }
      }
    }
  });

  it('③ 되돌리기 — 감점 데이터를 비우면 P4 이전과 완전히 같다', () => {
    const near = clashAt(1);
    // 판정 자체가 사라진다
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'toilet', 5, 5);
    p.place(t, w, GATE, 'shop', 5, 7);
    expect(evaluateConflicts(p.all(), [])).toHaveLength(0);
    // 경제도 P4 이전 식(포화 곡선 하나)과 **정확히** 같다
    const empty = comboEffect({ satisfaction: near.satisfaction, revenue: near.revenue });
    expect(empty.satisfactionDelta).toBeCloseTo(
      saturate(near.satisfaction, COMBO_ECONOMY.satCap, COMBO_ECONOMY.satHalf),
      12,
    );
    expect(empty.revenueMult).toBeCloseTo(
      1 + saturate(near.revenue, COMBO_ECONOMY.revCap, COMBO_ECONOMY.revHalf) / 100,
      12,
    );
  });

  it('③b 가점 총합은 감점이 손대지 않는다 — active 는 의뢰·심사가 세는 목록이다', () => {
    /*
     * 감점을 `active` 나 `satisfaction` 에 섞으면 **나쁜 배치가 조건을 채워 주거나**
     * (음수 콤보도 한 개), 반대로 좋은 배치의 조건이 조용히 미달이 된다.
     */
    const near = clashAt(1);
    const far = clashAt(2);
    expect(near.satisfaction).toBe(far.satisfaction);
    expect(near.revenue).toBe(far.revenue);
    expect(near.active.length).toBe(far.active.length);
  });

  it('④ 무효(◯)가 다수다 — 9×9 중 감점 셀이 15% 이하 (도배 방지)', () => {
    /*
     * PSS 대표 10행 260셀의 △ 비율이 약 14% 다. 감점 도배는 퍼즐이 아니라 스트레스라
     * 그 자릿수를 상한으로 못 박는다. 지금은 4쌍 × 2(대칭) = 8칸 / 81 = 9.9%.
     */
    const cells = CONFLICTS.length * 2;
    const total = NEED_KINDS.length * NEED_KINDS.length;
    expect(cells / total).toBeLessThanOrEqual(0.15);
    expect(cells).toBe(8);
    expect(total).toBe(81);
  });

  it('④b 감점은 need 쌍이다 — 시설 ID 쌍(75종²)이면 표를 외우게 된다', () => {
    const kinds = new Set<string>(NEED_KINDS);
    const seen = new Set<string>();
    for (const c of CONFLICTS) {
      expect(c.needs, c.id).toHaveLength(2);
      for (const n of c.needs) expect(kinds.has(n), `${c.id} → ${n}`).toBe(true);
      // 같은 수요끼리는 안 문다 — 시작 킷이 위생 시설을 한 방에 몰아 준다
      expect(c.needs[0], c.id).not.toBe(c.needs[1]);
      // 쌍은 대칭이라 한 번만 적는다 — 두 번 적으면 그 쌍만 두 배로 문다
      const key = [...c.needs].sort().join('|');
      expect(seen.has(key), `${c.id} 중복`).toBe(false);
      seen.add(key);
      expect((c.penalty.satisfaction ?? 0) + (c.penalty.revenue ?? 0), c.id).toBeGreaterThan(0);
      // 데이터는 **양수 크기**만 담는다 — 부호는 comboEffect 가 붙인다
      expect(c.penalty.satisfaction ?? 0, c.id).toBeGreaterThanOrEqual(0);
      expect(c.penalty.revenue ?? 0, c.id).toBeGreaterThanOrEqual(0);
      expect(c.id.startsWith('clash_'), c.id).toBe(true);
    }
    expect(new Set(CONFLICTS.map((c) => c.id)).size).toBe(CONFLICTS.length);
  });

  it('⑤ 총합이 음수면 매출 배율이 1 아래로 내려간다 — 가점을 켠 사람만 벌주면 안 된다', () => {
    const e = comboEffect({
      satisfaction: 0,
      revenue: 0,
      penaltySatisfaction: 20,
      penaltyRevenue: 20,
    });
    expect(e.satisfactionDelta).toBeLessThan(0);
    expect(e.revenueMult).toBeLessThan(1);
    // 감점도 상한이 있다 — 가점 상한과 **같은 크기**까지만 (축이 서로를 지우는 데서 멈춘다)
    const huge = comboEffect({
      satisfaction: 0,
      revenue: 0,
      penaltySatisfaction: 1e6,
      penaltyRevenue: 1e6,
    });
    expect(huge.satisfactionDelta).toBeGreaterThan(-CONFLICT_ECONOMY.satCap);
    expect(huge.revenueMult).toBeGreaterThan(1 - CONFLICT_ECONOMY.revCap / 100);
    expect(CONFLICT_ECONOMY.satCap).toBe(COMBO_ECONOMY.satCap);
    expect(CONFLICT_ECONOMY.revCap).toBe(COMBO_ECONOMY.revCap);
  });

  it('⑤b 감점은 후반에도 안 씻긴다 — 두 축을 따로 포화시킨 이유', () => {
    /*
     * ⚠ 가점과 감점을 **더한 뒤 한 번** 포화시키면, 후반 raw 300 짜리 판에서 곡선 기울기가
     * 0.006/점이라 감점 20점이 −0.12점으로 사라진다. 그러면 "나쁜 조합을 피한다"가
     * 후반에 없어져 이 축을 넣은 이유가 통째로 무너진다. 아래가 그 대조다.
     */
    const late = { satisfaction: 300, revenue: 400 };
    const clean = comboEffect(late);
    const dirty = comboEffect({ ...late, penaltySatisfaction: 20, penaltyRevenue: 20 });
    const drop = clean.satisfactionDelta - dirty.satisfactionDelta;
    expect(drop).toBeGreaterThan(1.5); // 한 통에 넣었으면 0.12 였다
    expect(clean.revenueMult - dirty.revenueMult).toBeGreaterThan(0.03);
  });

  it('가점과 같은 짝짓기다 — A 하나에 B 셋을 붙여도 감점은 하나', () => {
    const { t, w, p } = flat();
    expect(p.place(t, w, GATE, 'toilet', 10, 10).ok).toBe(true);
    expect(p.place(t, w, GATE, 'vending_out', 10, 12).ok).toBe(true);
    expect(p.place(t, w, GATE, 'vending_out', 11, 12).ok).toBe(true);
    expect(p.place(t, w, GATE, 'vending_out', 12, 12).ok).toBe(true);
    const hits = evaluateCombos(p).conflicts.filter((c) => c.id === 'clash_hygiene_food');
    expect(hits).toHaveLength(1);
  });

  it('감점 쌍이 여럿이면 각각 따로 난다 — 총합이 쌓인다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'toilet', 10, 10);
    p.place(t, w, GATE, 'shop', 10, 12); // 위생 × 먹거리
    p.place(t, w, GATE, 'lookout', 12, 10); // 위생 × 경관
    const ids = evaluateCombos(p).conflicts.map((c) => c.id);
    expect(ids).toContain('clash_hygiene_food');
    expect(ids).toContain('clash_hygiene_scenery');
  });

  it('미리보기가 **새로 나는** 감점을 알려준다 — 실패는 내 선택 때문이어야 (v4)', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'toilet', 5, 5);
    const bad = previewCombos(p, 'shop', 5, 7);
    expect(bad.clashed.map((c) => c.id)).toContain('clash_hygiene_food');
    expect(bad.penaltySatisfaction).toBeGreaterThan(0);
    // 두 칸 띄우면 안 난다
    const good = previewCombos(p, 'shop', 5, 8);
    expect(good.clashed).toHaveLength(0);
    expect(good.penaltySatisfaction).toBe(0);
    // 미리보기는 상태를 안 바꾼다
    expect(p.count).toBe(1);
  });

  it('이미 나던 감점은 새 자리 탓이 아니다 — 차집합이다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'toilet', 5, 5);
    p.place(t, w, GATE, 'shop', 5, 7);
    // 이미 한 건 나 있다. 멀리 놓는 시설은 그것을 물려받지 않는다
    const pv = previewCombos(p, 'sunbed_row', 20, 20);
    expect(pv.clashed).toHaveLength(0);
    expect(pv.penaltySatisfaction).toBe(0);
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

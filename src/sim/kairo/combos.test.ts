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
  type ComboTier,
} from './combos.js';

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
  it('70종 3티어 — 소 40 · 중 20 · 대 10', () => {
    expect(COMBOS).toHaveLength(70);
    const by: Record<string, number> = {};
    for (const c of COMBOS) by[c.tier] = (by[c.tier] ?? 0) + 1;
    expect(by).toEqual({ small: 40, medium: 20, large: 10 });
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

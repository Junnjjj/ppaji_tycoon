import { describe, it, expect } from 'vitest';
import { comboBreakdown } from './kairo-report.js';
import type { ActiveCombo } from '../sim/kairo/combos.js';
import type { SwimZone } from '../sim/kairo/swim.js';

/**
 * 결산의 콤보 줄 (P2-B).
 *
 * ⚠ 여기서 재는 것은 **표시 자료를 고르는 규칙**뿐이다 (순위·면적·몫). 실제로 화면에
 * 그려지는지는 브라우저 검사가 본다 — DOM 을 흉내내면 "규칙은 맞는데 화면은 그대로"를
 * 놓친다 (`panels.test.ts` 와 같은 경계).
 */

function combo(over: Partial<ActiveCombo> = {}): ActiveCombo {
  return {
    id: 'x',
    name: '이름',
    tier: 'small',
    index: 0,
    scale: 1,
    areaScale: 1,
    satisfaction: 3,
    revenue: 4,
    at: null,
    ...over,
  };
}

describe('콤보 결산 줄', () => {
  it('기여가 큰 순으로 상위 3개만 낸다 — 전체 목록은 도감 소관', () => {
    const active = [
      combo({ id: 'a', name: '작은 것', satisfaction: 3, revenue: 4 }),
      combo({ id: 'b', name: '큰 것', satisfaction: 10, revenue: 12 }),
      combo({ id: 'c', name: '중간', satisfaction: 5, revenue: 6 }),
      combo({ id: 'd', name: '아주 작은 것', satisfaction: 1, revenue: 1 }),
    ];
    const view = comboBreakdown(active);
    expect(view.count).toBe(4);
    expect(view.top.map((t) => t.name)).toEqual(['큰 것', '중간', '작은 것']);
    // 몫은 **원점수 합** 기준 — (10+12) / (7+22+11+2)
    expect(view.top[0]?.share).toBeCloseTo(22 / 42, 5);
  });

  it('같은 콤보의 중복 발동은 **한 줄로 묶되** 개수는 그대로 센다', () => {
    const active = [combo({ index: 0 }), combo({ index: 1 }), combo({ index: 2 })];
    const view = comboBreakdown(active);
    expect(view.count).toBe(3);
    // ⚠ 줄은 하나다 — 발동마다 한 줄이면 같은 이름이 세 줄 늘어선다 (실측)
    expect(view.top).toHaveLength(1);
    expect(view.top[0]?.count).toBe(3);
    expect(view.top[0]?.share).toBeCloseTo(1, 5);
  });

  it('묶인 줄의 면적은 **가장 크게 터진 곳**이다', () => {
    const zones: SwimZone[] = [
      { kind: 'pool', tiles: [{ x: 1, y: 1 }], entries: [], area: 8 },
      { kind: 'pool', tiles: [{ x: 9, y: 9 }], entries: [], area: 32 },
    ];
    const view = comboBreakdown(
      [
        combo({ id: 'z', name: '풀 파티', areaScale: 1.1, at: { i: 1, j: 1 } }),
        combo({ id: 'z', name: '풀 파티', areaScale: 2, at: { i: 9, j: 9 } }),
      ],
      zones,
    );
    expect(view.top).toHaveLength(1);
    expect(view.top[0]).toMatchObject({ count: 2, areaScale: 2, area: 32 });
  });

  it('면적 배율이 붙은 zone 콤보는 그 구역의 칸 수를 찾아 붙인다', () => {
    const zones: SwimZone[] = [
      {
        kind: 'pool',
        // 구역엔 중심이 없어서 `ActiveCombo.at` 이 **첫 타일**이다 (combos.ts findZone)
        tiles: [{ x: 5, y: 7 }, { x: 6, y: 7 }],
        entries: [],
        area: 32,
      },
    ];
    const view = comboBreakdown(
      [combo({ name: '풀 파티', areaScale: 1.8, at: { i: 5, j: 7 } })],
      zones,
    );
    expect(view.top[0]).toMatchObject({ name: '풀 파티', areaScale: 1.8, area: 32 });
  });

  it('면적 배율이 1 이면 칸 수를 안 붙인다 — 시설 중심이 우연히 구역 첫 타일과 겹칠 수 있다', () => {
    const zones: SwimZone[] = [
      { kind: 'pool', tiles: [{ x: 5, y: 7 }], entries: [], area: 32 },
    ];
    // adjacent 콤보의 `at` 은 시설 중심이다 — 같은 좌표라도 그 구역의 칸 수가 아니다
    const view = comboBreakdown([combo({ at: { i: 5, j: 7 } })], zones);
    expect(view.top[0]?.area).toBeNull();
  });

  it('음성 대조군 — 구역을 안 넘기면 면적이 조용히 사라진다', () => {
    /*
     * `zones` 를 안 주면 zone 콤보가 조용히 0 이 되는 `evaluateCombos` 의 함정이
     * 여기에도 그대로 있다 (칸 수가 null 이 된다). 배율은 남으므로 줄은 보인다 —
     * 어느 쪽이 깨졌는지 이 대조군이 갈라 준다.
     */
    const view = comboBreakdown([combo({ areaScale: 1.8, at: { i: 5, j: 7 } })]);
    expect(view.top[0]?.areaScale).toBe(1.8);
    expect(view.top[0]?.area).toBeNull();
  });

  it('0개인 주는 빈 목록이다 — 줄을 감추는 판단은 화면 쪽이 한다', () => {
    const view = comboBreakdown([]);
    expect(view).toEqual({ count: 0, top: [] });
  });
});

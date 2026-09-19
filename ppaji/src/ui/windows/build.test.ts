import { describe, it, expect } from 'vitest';
import { BUILD_TABS, hallGroup } from './build.js';
import { FACILITY_DEFS } from '../../sim/game.js';

/** P45-b D63 — 건설 분류는 「어디에 놓나」로 가른다 */
describe('건설 분류', () => {
  it('건설 분류 9 — 실내 탭은 실내 전용만, 「빠지」 가 둘째(P50-a R9: 기구 10 + 링 위 시설 11 = 21), 입장 → 둘 다 → 퇴장 → 밤 순 · 야외 식당은 먹거리 탭', () => {
    expect(BUILD_TABS.map((t) => t.id)).toEqual(['indoor', 'ppaji', 'seat', 'lodging', 'food', 'play', 'slide', 'utility', 'decor']);
    // 2026-09-19 승인 조합(정본 29 폐기): 33 − 폐기 14 + 조합 2 = 21. 개수 대신 **목록**을 박는다 —
    // 폐기 시설이 목록에 새어 들어오거나 조합이 빠지면 바로 잡힌다 (정의는 남지만 건설 목록엔 없어야 한다)
    expect([...FACILITY_DEFS.values()].filter((d) => BUILD_TABS[1]!.match(d)).map((d) => d.id)).toEqual([
      'boarding_dock', 'rent_sup', 'diving', 'rent_duck', 'rent_pedal', 'rent_kayak', 'slide_tube', 'turtle_island',
      'ppaji_slide', 'airbounce', 'float_deck', 'rig_bridge', 'rig_stepstone', 'watchtower', 'rig_blob', 'rig_rack',
      'rig_float_bar', 'rescue_dock', 'rig_iceberg', 'rig_jump_tower', 'ppaji_playground',
    ]);
    for (const d of [...FACILITY_DEFS.values()].filter((x) => BUILD_TABS[1]!.match(x))) expect(d.deprecated, d.id).toBeUndefined();
    const defs = [...FACILITY_DEFS.values()];
    const indoor = defs.filter((d) => BUILD_TABS[0]!.match(d));
    expect(indoor.every((d) => d.indoorOnly)).toBe(true);
    expect(indoor.length).toBeGreaterThanOrEqual(20);
    expect(hallGroup(FACILITY_DEFS.get('rental_tube')!)).toBeLessThan(hallGroup(FACILITY_DEFS.get('indoor_shop')!));
    expect(hallGroup(FACILITY_DEFS.get('indoor_shop')!)).toBeLessThan(hallGroup(FACILITY_DEFS.get('shower_row')!));
    expect(hallGroup(FACILITY_DEFS.get('shower_row')!)).toBeLessThan(hallGroup(FACILITY_DEFS.get('room_ondol')!));
    expect(BUILD_TABS.find((t) => t.id === 'food')!.match(FACILITY_DEFS.get('shop')!)).toBe(true);
    for (const t of BUILD_TABS) for (const d of defs) if (t.match(d)) expect(BUILD_TABS.filter((u) => u.match(d)).length).toBe(1); // 한 시설은 한 탭에만
  });
});

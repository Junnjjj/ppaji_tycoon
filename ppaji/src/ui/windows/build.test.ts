import { describe, it, expect } from 'vitest';
import { BUILD_TABS, hallGroup } from './build.js';
import { FACILITY_DEFS } from '../../sim/game.js';

/** P45-b D63 — 건설 분류는 「어디에 놓나」로 가른다 */
describe('건설 분류', () => {
  it('건설 분류 9 — 실내 탭은 실내 전용만, 「빠지」 가 둘째(P50-a R9: 기구 + 링 위 시설 33), 입장 → 둘 다 → 퇴장 → 밤 순 · 야외 식당은 먹거리 탭', () => {
    expect(BUILD_TABS.map((t) => t.id)).toEqual(['indoor', 'ppaji', 'seat', 'lodging', 'food', 'play', 'slide', 'utility', 'decor']);
    expect([...FACILITY_DEFS.values()].filter((d) => BUILD_TABS[1]!.match(d)).length).toBe(33);
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

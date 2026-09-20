import modules from '../../data/ppaji-modules.json';
import { describe, it, expect } from 'vitest';
import { BUILD_TABS, hallGroup, currentBuildCatalog } from './build.js';
import { FACILITY_DEFS } from '../../sim/game.js';

/** P45-b D63 — 건설 분류는 「어디에 놓나」로 가른다 */
describe('건설 분류', () => {
  it('건설 분류 7 — 화장실·탁구대는 실내로 분류, 「빠지」 가 둘째(P50-a R9: 기구 10 + 링 위 시설 11 = 21), 입장 → 둘 다 → 퇴장 → 밤 순 · 야외 식당은 먹거리 탭', () => {
    expect(BUILD_TABS.map((t) => t.id)).toEqual(['indoor', 'ppaji', 'seat', 'lodging', 'food', 'play', 'decor']);
    // 2026-09-19 승인 조합(정본 29 폐기): 33 − 폐기 14 + 조합 2 = 21. 개수 대신 **목록**을 박는다 —
    // 폐기 시설이 목록에 새어 들어오거나 조합이 빠지면 바로 잡힌다 (정의는 남지만 건설 목록엔 없어야 한다)
    expect([...FACILITY_DEFS.values()].filter((d) => BUILD_TABS[1]!.match(d)).map((d) => d.id)).toEqual([
      'boarding_dock', 'rent_sup', 'diving', 'rent_duck', 'rent_pedal', 'rent_kayak', 'slide_tube', 'turtle_island',
      'ppaji_slide', 'airbounce', 'float_deck', 'rig_bridge', 'rig_stepstone', 'watchtower', 'rig_blob', 'rig_rack',
      'rig_float_bar', 'rescue_dock', 'rig_iceberg', 'rig_jump_tower', 'ppaji_playground', ...modules.map(m => m.id),
    ]);
    for (const d of [...FACILITY_DEFS.values()].filter((x) => BUILD_TABS[1]!.match(x))) expect(d.deprecated, d.id).toBeUndefined();
    const defs = [...FACILITY_DEFS.values()];
    const indoor = defs.filter((d) => BUILD_TABS[0]!.match(d));
    expect(indoor.every((d) => d.indoorOnly || ['toilet', 'pingpong'].includes(d.id))).toBe(true);
    expect(indoor.length).toBeGreaterThanOrEqual(20);
    expect(hallGroup(FACILITY_DEFS.get('rental_tube')!)).toBeLessThan(hallGroup(FACILITY_DEFS.get('indoor_shop')!));
    expect(hallGroup(FACILITY_DEFS.get('indoor_shop')!)).toBeLessThan(hallGroup(FACILITY_DEFS.get('shower_row')!));
    expect(hallGroup(FACILITY_DEFS.get('shower_row')!)).toBeLessThan(hallGroup(FACILITY_DEFS.get('room_ondol')!));
    expect(BUILD_TABS.find((t) => t.id === 'food')!.match(FACILITY_DEFS.get('shop')!)).toBe(true);
    for (const t of BUILD_TABS) for (const d of defs) if (t.match(d)) expect(BUILD_TABS.filter((u) => u.match(d)).length).toBe(1); // 한 시설은 한 탭에만
  });
});

// Catalog retirement must survive later asset/system integration; save definitions remain valid.
it('삭제 요청 시설은 해금 여부와 관계없이 건설 목록에서 제외하고 기존 저장 정의는 보존한다', () => {
  const retired = ['nursing', 'storage', 'gear_rack', 'office', 'souvenir', 'room_ondol', 'takeout', 'room_tatami', 'stage_hall', 'entrance', 'rent_sup', 'rent_duck', 'rent_pedal', 'rent_kayak', 'slide_tube', 'rig_rack', 'rig_float_bar', 'rescue_dock', 'airbounce', 'pension_duplex', 'dock', 'lifering', 'lifeguard_chair', 'washbasin_row', 'ticket', 'parking', 'jump_cushion', 'mongol_tent', 'stage_river', 'performing_kairobot', 'footvolley'];
  const visible = new Set(currentBuildCatalog([...FACILITY_DEFS.values()]).map(d => d.id));
  for (const id of retired) {
    expect(FACILITY_DEFS.has(id), id).toBe(true);
    expect(visible.has(id), id).toBe(false);
  }
  expect(visible.has('rental_tube')).toBe(true);
  expect(visible.has('dry_room')).toBe(true);
  for (const id of ['watchtower', 'ppaji_slide', 'ppaji_playground', 'float_deck']) expect(visible.has(id), id).toBe(true);
  expect(visible.has('foodcourt_seat')).toBe(false); // 영역에서 자동 생성, 개별 건설 불가
  for (const d of FACILITY_DEFS.values()) if (d.class === 'slide') expect(visible.has(d.id), d.id).toBe(false);
  expect(visible.has('entrance')).toBe(false); // 고정 배치 입구는 개별 건설하지 않음
});

it('요청한 이동 시설은 정확히 한 탭에만 나타나고 기존 게임 분류는 보존한다', () => {
  for (const [id, tab] of Object.entries({ toilet: 'indoor', pingpong: 'indoor', footbath: 'seat', authored_footbath: 'seat', merlion: 'decor', stage_river: 'play' })) {
    const d = FACILITY_DEFS.get(id)!;
    expect(BUILD_TABS.filter(t => t.match(d)).map(t => t.id), id).toEqual([tab]);
  }
  expect(FACILITY_DEFS.get('stage_river')!.class).toBe('decor');
  expect(FACILITY_DEFS.get('pingpong')!.class).toBe('attraction');
});

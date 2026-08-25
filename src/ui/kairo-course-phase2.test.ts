import { describe, expect, it } from 'vitest';
import {
  courseProjection,
  courseTrialPlan,
  equipmentWindow,
} from './kairo-course.js';
import { defaultHandles, presetDef, type CourseEditDraft, type PlacedCourse } from '../sim/kairo/course.js';

const dock = { x: 8, y: 12 };
const handles = defaultHandles(presetDef('circle')!, dock, { x: 1, y: 0 }, 7);
const current: PlacedCourse = {
  handle: 41,
  presetId: 'circle',
  equipId: 'banana',
  vehicles: 1,
  towBoatId: 'work',
  dock,
  handles,
};

function draft(change: Partial<CourseEditDraft> = {}): CourseEditDraft {
  return {
    presetId: current.presetId,
    equipId: current.equipId,
    vehicles: current.vehicles,
    dock: { ...current.dock },
    handles: current.handles.map((handle) => ({ ...handle })),
    ...(current.towBoatId ? { towBoatId: current.towBoatId } : {}),
    ...change,
  };
}

describe('Phase 2B 코스 투영', () => {
  it('현재→예상 스릴·안전·처리량·실제 탑승·이익을 같은 평가기로 낸다', () => {
    const result = courseProjection(current, draft({ vehicles: 3, towBoatId: 'sport' }), 9);

    expect(result.current.throughput).toBeGreaterThan(0);
    expect(result.projected.throughput).toBeGreaterThan(result.current.throughput);
    expect(result.projected.actualRiders).toBeLessThanOrEqual(9);
    expect(result.projected.actualRiders).toBeLessThanOrEqual(result.projected.throughput);
    expect(result.projected.profit).toBe(result.projected.revenue - result.projected.upkeep);
    expect(result.projected.thrill).not.toBe(result.current.thrill);
  });

  it('수요가 0이면 투영 실제 탑승과 코스 매출은 0이다', () => {
    const result = courseProjection(current, draft(), 0);
    expect(result.projected.actualRiders).toBe(0);
    expect(result.projected.revenue).toBe(0);
  });

  it('장비 섹션은 선택과 추천·인접 후보만 최대 5개 낸다', () => {
    const choices = equipmentWindow('banana', 'circle');
    expect(choices.length).toBeLessThanOrEqual(5);
    expect(choices.some((choice) => choice.id === 'banana')).toBe(true);
    expect(choices.some((choice) => choice.recommended)).toBe(true);
  });
});

describe('Phase 2D 시험 운행', () => {
  it('4초·4유형 반응을 같은 코스에 항상 같게 예약한다', () => {
    const first = courseTrialPlan(draft({ towBoatId: 'sport' }), 12);
    const second = courseTrialPlan(draft({ towBoatId: 'sport' }), 12);

    expect(first).toEqual(second);
    expect(first.durationMs).toBe(4_000);
    expect(first.reactions).toHaveLength(4);
    expect(first.reactions.map((reaction) => reaction.groupId)).toEqual([
      'family',
      'couple',
      'friends',
      'company',
    ]);
    expect(first.metrics.actualRiders).toBeLessThanOrEqual(12);
  });
});

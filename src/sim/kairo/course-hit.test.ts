import { describe, expect, it } from 'vitest';
import { courseAtTile, defaultHandles, presetDef, type PlacedCourse } from './course.js';

function placed(handle: number, dockX: number): PlacedCourse {
  const dock = { x: dockX, y: 10 };
  return {
    handle,
    presetId: 'shuttle',
    equipId: 'banana',
    vehicles: 1,
    dock,
    handles: defaultHandles(presetDef('shuttle')!, dock, { x: 1, y: 0 }, 6),
  };
}

describe('지도의 기존 코스/차량 탭', () => {
  it('스플라인 위 타일은 stable course handle로 히트한다', () => {
    const courses = [placed(71, 5), placed(92, 28)];
    expect(courseAtTile(courses, { x: 9, y: 10 })).toBe(71);
    expect(courseAtTile(courses, { x: 32, y: 10 })).toBe(92);
  });

  it('코스와 먼 타일은 히트하지 않는다', () => {
    expect(courseAtTile([placed(71, 5)], { x: 5, y: 25 })).toBeNull();
  });
});

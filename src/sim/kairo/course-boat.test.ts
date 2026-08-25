import { describe, expect, it } from 'vitest';
import {
  defaultHandles,
  evaluateCourse,
  courseEquipment,
  presetDef,
  type Vec2,
} from './course.js';

const DOCK: Vec2 = { x: 6, y: 16 };
const DIR: Vec2 = { x: 1, y: 0 };

describe('견인 보트 profile', () => {
  it('스포츠형은 급선회에서 더 빠르고 짜릿하지만 더 비싸고 덜 안전하다', () => {
    const preset = presetDef('hairpin')!;
    const equip = courseEquipment('banana')!;
    const handles = defaultHandles(preset, DOCK, DIR, 8);
    const work = evaluateCourse(DOCK, handles, equip, preset.id, 2, 'work');
    const sport = evaluateCourse(DOCK, handles, equip, preset.id, 2, 'sport');
    expect(sport.potentialWeeklyRiders).toBeGreaterThan(work.potentialWeeklyRiders);
    expect(sport.thrill).toBeGreaterThan(work.thrill);
    expect(sport.safety).toBeLessThan(work.safety);
    expect(sport.weeklyUpkeep).toBeGreaterThan(work.weeklyUpkeep);
  });

  it('자체동력 장비는 견인 보트를 쓰지 않는다', () => {
    const preset = presetDef('circle')!;
    const equip = courseEquipment('jetski')!;
    const handles = defaultHandles(preset, DOCK, DIR, 8);
    const none = evaluateCourse(DOCK, handles, equip, preset.id, 2);
    const work = evaluateCourse(DOCK, handles, equip, preset.id, 2, 'work');
    const sport = evaluateCourse(DOCK, handles, equip, preset.id, 2, 'sport');
    expect(none.towBoatId).toBeNull();
    expect(work).toEqual(none);
    expect(sport).toEqual(none);
  });
});

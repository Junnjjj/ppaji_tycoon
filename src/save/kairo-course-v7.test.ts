import { describe, expect, it } from 'vitest';
import { KAIRO_SAVE_VERSION } from './kairo.js';
import { CourseStore, type CourseSnapshot } from '../sim/kairo/course.js';

const LEGACY_V7: CourseSnapshot = {
  nextHandle: 2,
  courses: [
    {
      handle: 1,
      presetId: 'shuttle',
      equipId: 'peanut',
      vehicles: 1,
      dock: { x: 4, y: 31 },
      handles: [
        { x: 4, y: 35 },
        { x: 4, y: 40 },
      ],
    },
  ],
};

describe('코스 보트 선택은 구 v7에서도 optional 필드다', () => {
  it('옛 v7 snapshot을 보트 필드 없이 바이트 보존한다', () => {
    expect(KAIRO_SAVE_VERSION).toBe(8);
    const restored = CourseStore.fromSnapshot(JSON.parse(JSON.stringify(LEGACY_V7)));
    expect(restored.toSnapshot()).toEqual(LEGACY_V7);
    expect(restored.toSnapshot().courses[0]).not.toHaveProperty('towBoatId');
  });

  it('새 towBoatId는 같은 코스 snapshot에서 왕복한다', () => {
    const snapshot = structuredClone(LEGACY_V7);
    snapshot.courses[0]!.towBoatId = 'sport';
    const restored = CourseStore.fromSnapshot(snapshot);
    expect(restored.toSnapshot().courses[0]!.towBoatId).toBe('sport');
  });
});

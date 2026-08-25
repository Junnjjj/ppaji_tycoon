import { describe, expect, it } from 'vitest';
import { KairoTerrain } from './terrain.js';
import {
  CourseStore,
  courseEquipment,
  defaultHandles,
  presetDef,
  validateCourse,
  type PlacedCourse,
  type Vec2,
} from './course.js';

const DOCK: Vec2 = { x: 5, y: 12 };
const DIR: Vec2 = { x: 1, y: 0 };

function lake(): KairoTerrain {
  const terrain = new KairoTerrain(40, 32);
  for (let j = 0; j < terrain.height; j++) {
    for (let i = 0; i < terrain.width; i++) terrain.paint(i, j, 'water_edge');
  }
  return terrain;
}

function store(): { courses: CourseStore; original: PlacedCourse } {
  const courses = new CourseStore();
  const preset = presetDef('circle')!;
  const original = courses.add({
    presetId: preset.id,
    equipId: 'banana',
    vehicles: 1,
    dock: DOCK,
    handles: defaultHandles(preset, DOCK, DIR, 8),
  });
  return { courses, original };
}

describe('기존 코스 편집', () => {
  it('편집 검증은 자기 handle을 dock-taken/overlap 비교에서 제외한다', () => {
    const { courses, original } = store();
    const result = validateCourse(
      lake(),
      original.handles,
      original.dock,
      presetDef(original.presetId)!,
      original.equipId,
      5,
      courses.all,
      original.handle,
    );
    expect(result.issues).not.toContain('dock-taken');
    expect(result.issues).not.toContain('overlap');
  });

  it('취소는 원본 snapshot을 바이트 단위로 보존한다', () => {
    const { courses, original } = store();
    const before = JSON.stringify(courses.toSnapshot());
    const edit = courses.beginEdit(original.handle)!;
    edit.draft.dock.x += 4;
    edit.draft.handles[0]!.y += 3;
    edit.draft.vehicles = 4;
    courses.cancelEdit(edit);
    expect(JSON.stringify(courses.toSnapshot())).toBe(before);
  });

  it('확정은 handle을 보존하고 장비 투자 증가분만 청구한다', () => {
    const { courses, original } = store();
    const edit = courses.beginEdit(original.handle)!;
    edit.draft.vehicles = 3;
    edit.draft.handles[0] = { x: 12, y: 18 };

    const confirmed = courses.confirmEdit(edit);
    const unit = courseEquipment('banana')!.vehicleCost;
    expect(confirmed.charge).toBe(unit * 2);
    expect(confirmed.course.handle).toBe(original.handle);
    expect(confirmed.course.dock).toEqual(original.dock);
    expect(confirmed.course.handles[0]).toEqual({ x: 12, y: 18 });
    expect(courses.all[0]).toEqual(confirmed.course);
    expect(CourseStore.fromSnapshot(courses.toSnapshot()).all[0]).toEqual(confirmed.course);
  });

  it('같은 snapshot과 변경은 같은 결과를 낸다', () => {
    const original = store().courses.toSnapshot();
    const update = () => {
      const courses = CourseStore.fromSnapshot(JSON.parse(JSON.stringify(original)));
      const edit = courses.beginEdit(original.courses[0]!.handle)!;
      edit.draft.equipId = 'peanut';
      edit.draft.vehicles = 2;
      const result = courses.confirmEdit(edit);
      return { result, snapshot: courses.toSnapshot() };
    };
    expect(update()).toEqual(update());
  });

  it('stale 편집은 결제 전에 검증해 현금과 코스 상태가 갈라지지 않는다', () => {
    const { courses, original } = store();
    const stale = courses.beginEdit(original.handle)!;
    const concurrent = courses.beginEdit(original.handle)!;
    concurrent.draft.vehicles = 2;
    courses.confirmEdit(concurrent);
    let charged = 0;

    expect(() =>
      courses.confirmEdit(stale, (amount) => {
        charged += amount;
        return true;
      }),
    ).toThrow(/편집 중 코스가 바뀌었습니다/);
    expect(charged).toBe(0);
    expect(courses.all[0]?.vehicles).toBe(2);
  });

  it('원자적 편집 결제가 거절되면 코스를 바꾸지 않는다', () => {
    const { courses, original } = store();
    const edit = courses.beginEdit(original.handle)!;
    edit.draft.vehicles = 3;
    const before = courses.toSnapshot();

    const result = courses.confirmEdit(edit, () => false);

    expect(result).toBeNull();
    expect(courses.toSnapshot()).toEqual(before);
  });
});

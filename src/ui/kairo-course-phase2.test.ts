import { describe, expect, it } from 'vitest';
import {
  courseDeltaCells,
  courseDockActions,
  courseProjection,
  courseTrialPlan,
  equipmentWindow,
  type CoursePhase,
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

describe('Phase 2 v2 코스 액션 독', () => {
  const projection = courseProjection(current, draft({ vehicles: 3, towBoatId: 'sport' }), 9);

  it('정보 상태는 현재값만 보여 주고 화살표를 쓰지 않는다', () => {
    const cells = courseDeltaCells(projection, false);
    expect(cells.map((cell) => cell.key)).toEqual(['thrill', 'safety', 'riders', 'profit']);
    expect(cells.map((cell) => cell.label)).toEqual(// UI v4 — 라벨이 뜻을 말한다 (UX 감사 P1-9): `실제`가 무엇의 실제인지, 단위가 어디 있는지
      ['스릴', '안전', '탑승/주', '손익/주']);
    for (const cell of cells) expect(cell.text).not.toContain('→');
  });

  it('편집 상태는 네 지표를 현재→예상 한 문자열로 낸다', () => {
    const cells = courseDeltaCells(projection, true);
    for (const cell of cells) expect(cell.text).toContain('→');
    expect(cells[0]!.text).toBe(
      `${Math.round(projection.current.thrill)}→${Math.round(projection.projected.thrill)}`,
    );
    expect(cells[2]!.text).toBe(
      `${projection.current.actualRiders}→${projection.projected.actualRiders}`,
    );
    // 손익은 만원 눈금에 부호를 붙이고 단위는 라벨에 한 번만 쓴다.
    expect(cells[3]!.text).toMatch(/^[+-]?\d+(\.\d)?→[+-]?\d+(\.\d)?$/);
  });

  it('지표 문자열은 393px 독 한 칸에 들어갈 만큼 짧다', () => {
    for (const cell of courseDeltaCells(projection, true)) {
      expect(cell.text.length).toBeLessThanOrEqual(13);
      expect(cell.label.length).toBeLessThanOrEqual(5);
    }
  });

  it('상태마다 한글 버튼 정체가 정확히 정해져 있다', () => {
    const ids = (
      phase: CoursePhase,
      o: { canTrial: boolean; trialPassed: boolean },
    ): string[] => courseDockActions(phase, { ...o, noop: false }).map((a) => `${a.id}:${a.label}`);

    expect(ids('info', { canTrial: false, trialPassed: false })).toEqual([
      'cancel:닫기',
      'primary:루트 조정',
    ]);
    expect(ids('edit', { canTrial: true, trialPassed: false })).toEqual([
      'settings:설정',
      'cancel:취소',
      'primary:시험 운행',
    ]);
    expect(ids('create', { canTrial: true, trialPassed: false })).toEqual([
      'settings:설정',
      'cancel:취소',
      'primary:시험 운행',
    ]);
    expect(ids('trial', { canTrial: false, trialPassed: false })).toEqual([
      'cancel:취소',
      'primary:시험 운행 중',
    ]);
    // Task 6: 이름이 **무엇을** 적용하는지 말한다. 모호한 `적용` 은 계약이 아니다.
    expect(ids('review', { canTrial: true, trialPassed: true })).toEqual([
      'settings:다시 조정',
      'primary:이 설정 적용',
    ]);
    expect(ids('applied', { canTrial: false, trialPassed: false })).toEqual([
      'settings:다시 조정',
      'cancel:닫기',
    ]);
  });

  it('영문 라벨이 하나도 없고 못 하는 행동만 비활성이다', () => {
    const o = { canTrial: false, trialPassed: false, noop: false };
    for (const phase of ['create', 'info', 'edit', 'trial', 'review', 'applied'] as const) {
      for (const action of courseDockActions(phase, o)) {
        expect(action.label).not.toMatch(/[A-Za-z]/);
      }
    }
    expect(courseDockActions('edit', o).find((a) => a.id === 'primary')?.disabled).toBe(true);
    expect(courseDockActions('review', { ...o, canTrial: true })
      .find((a) => a.id === 'primary')?.disabled).toBe(true);
    expect(courseDockActions('trial', { ...o, canTrial: true })
      .find((a) => a.id === 'primary')?.disabled).toBe(true);
    expect(courseDockActions('info', o).find((a) => a.id === 'primary')?.disabled).toBe(false);
    // 적용 완료에서 막힌 행동은 없다 — 닫든 다시 조정하든 둘 다 열려 있다
    expect(courseDockActions('applied', o).every((a) => !a.disabled)).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  GoalFoldState,
  createGoalSlots,
  inheritedCourseGoal,
  type GoalSlotInput,
} from './kairo-hud.js';

function slot(label: string, action: () => void): GoalSlotInput {
  return { icon: '•', label, detail: `${label} 설명`, progress: 0.5, action };
}

describe('카이로식 A/B/C 목표', () => {
  it('즉시·중기·장기 목표를 정확히 한 칸씩, 고정된 순서로 낸다', () => {
    const goals = createGoalSlots({
      immediate: slot('지금 할 일', () => undefined),
      mid: slot('단골·운영', () => undefined),
      long: slot('성장', () => undefined),
    });

    expect(goals.map((goal) => [goal.role, goal.badge, goal.label])).toEqual([
      ['immediate', 'A', '지금 할 일'],
      ['mid', 'B', '단골·운영'],
      ['long', 'C', '성장'],
    ]);
  });

  it('기둥 전체가 아니라 각 목표가 자신의 직접 행동 callback을 실행한다', () => {
    const actions = [vi.fn(), vi.fn(), vi.fn()];
    const goals = createGoalSlots({
      immediate: slot('A', actions[0]!),
      mid: slot('B', actions[1]!),
      long: slot('C', actions[2]!),
    });

    goals[1]!.action();
    expect(actions[0]).not.toHaveBeenCalled();
    expect(actions[1]).toHaveBeenCalledOnce();
    expect(actions[2]).not.toHaveBeenCalled();
  });

  it('초기 A는 별도 저장 상태 없이 기존 첫 코스 handle에서 파생된다', () => {
    const open = vi.fn<(handle?: number) => void>();
    const goal = inheritedCourseGoal([{ handle: 73 }, { handle: 91 }], open);

    expect(goal).toMatchObject({
      role: 'immediate',
      badge: 'A',
      label: '물려받은 코스 시험 운행',
    });
    goal.action();
    expect(open).toHaveBeenCalledWith(73);
  });

  it('코스가 없는 판은 같은 A 슬롯에서 새 코스 경로로 안전하게 폴백한다', () => {
    const open = vi.fn<(handle?: number) => void>();
    const goal = inheritedCourseGoal([], open);

    expect(goal.label).toBe('첫 코스 만들기');
    goal.action();
    expect(open).toHaveBeenCalledWith(undefined);
  });
});

describe('목표 자동 접기/복원 상태', () => {
  it('편집을 시작하면 자동으로 접고 끝나면 펼친 사용자 상태로 복원한다', () => {
    const state = new GoalFoldState();
    expect(state.folded).toBe(false);

    state.beginEditing();
    expect(state.folded).toBe(true);
    state.endEditing();
    expect(state.folded).toBe(false);
  });

  it('원래 접어 둔 사용자의 선택은 편집 종료 뒤에도 유지한다', () => {
    const state = new GoalFoldState();
    state.toggleUser();
    expect(state.folded).toBe(true);

    state.beginEditing();
    state.endEditing();
    expect(state.folded).toBe(true);
  });

  it('편집 중 사용자가 바꾼 선택도 종료 뒤 복원 상태에 반영한다', () => {
    const state = new GoalFoldState();
    state.beginEditing();
    state.toggleUser();
    expect(state.folded).toBe(true);

    state.endEditing();
    expect(state.folded).toBe(true);
  });
});

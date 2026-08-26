import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  GoalSurfaceState,
  createGoalSlots,
  currentActionView,
  homeGoalChips,
  inheritedCourseGoal,
  menuGoalChips,
  recommendedActionGoal,
  type GoalSlotInput,
} from './kairo-hud.js';

const hudSource = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

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

  it('미완료 온보딩의 sim 추천을 규칙 재계산 없이 홈 A 행동으로 옮긴다', () => {
    const run = vi.fn();
    const goal = recommendedActionGoal(
      { icon: '♥', label: '기본 메뉴 확인', detail: '장착 메뉴를 확인하세요' },
      run,
    );

    expect(goal).toMatchObject({
      role: 'immediate',
      badge: 'A',
      icon: '♥',
      label: '기본 메뉴 확인',
      detail: '장착 메뉴를 확인하세요',
    });
    goal.action();
    expect(run).toHaveBeenCalledOnce();
  });
});

/**
 * UI v3 — 홈은 "지금 할 일 한 줄"이다 (계획 §1.1).
 *
 * ⚠ v2 의 A/B/C 한 밴드에서 B/C 는 하트·별 **아이콘만** 남았다 (label/detail 을 CSS 가
 * `display:none` 처리). 접근성 이름만 있고 화면에는 아이콘뿐인 주요 행동은 금지다
 * (§1.3) — 그래서 중·장기는 홈에서 빼고 메뉴의 `목표` 절로 옮긴다.
 */
describe('홈 현재 행동 한 줄', () => {
  const chips = createGoalSlots({
    immediate: slot('물려받은 코스 시험 운행', () => undefined),
    mid: slot('민지의 메뉴 요청', () => undefined),
    long: slot('3등급까지', () => undefined),
  });

  it('홈에는 즉시 목표 하나만 남고 중·장기는 메뉴로 간다', () => {
    expect(homeGoalChips(chips).map((chip) => chip.role)).toEqual(['immediate']);
    expect(menuGoalChips(chips).map((chip) => chip.role)).toEqual(['mid', 'long']);
  });

  it('둘을 합치면 원래 세 목표라 — 어느 목표도 조용히 사라지지 않는다', () => {
    expect([...homeGoalChips(chips), ...menuGoalChips(chips)]).toEqual(chips);
  });

  it('현재 행동은 아이콘이 아니라 읽는 글 셋(안내·이름·상세)을 낸다', () => {
    const view = currentActionView(chips[0]!);
    expect(view).toEqual({
      kicker: '다음 할 일',
      icon: '•',
      label: '물려받은 코스 시험 운행',
      detail: '물려받은 코스 시험 운행 설명',
    });
    expect(view.label.length).toBeGreaterThan(0);
  });

  it('상세가 없어도 이름은 남는다 — 뜻을 아이콘에만 두지 않는다', () => {
    const bare = currentActionView({
      role: 'immediate', badge: 'A', icon: '🚤', label: '첫 코스 만들기', progress: 0,
      action: () => undefined,
    });
    expect(bare.detail).toBe('');
    expect(bare.label).toBe('첫 코스 만들기');
  });

  it('홈 DOM 에서 B/C 축약 카드와 그 감추기 규칙을 걷어낸다', () => {
    expect(hudSource).not.toContain("el('div', 'kgoal-secondary')");
    expect(cssSource).not.toMatch(/\.kgoal-secondary \.kgoal-label/);
    expect(hudSource).toContain("el('div', 'kgoal-kicker'");
  });
});

describe('홈 목표 표면 상태', () => {
  it('홈에서만 목표를 보이고 메뉴·건설·패널·코스에서는 숨긴다', () => {
    const state = new GoalSurfaceState();
    expect(state.mode).toBe('home');
    expect(state.visible).toBe(true);

    for (const mode of ['menu', 'build', 'panel', 'course'] as const) {
      state.set(mode);
      expect(state.mode).toBe(mode);
      expect(state.visible).toBe(false);
    }
  });

  it('다른 표면을 닫으면 같은 경계로 홈 목표를 복원한다', () => {
    const state = new GoalSurfaceState();
    state.set('course');
    state.set('home');
    expect(state.visible).toBe(true);
  });
});

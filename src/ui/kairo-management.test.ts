import { describe, expect, it } from 'vitest';
import { todayRecommendation, type ManagementState } from '../sim/kairo/meta.js';
import {
  managementActionForToday,
  runManagementAction,
  type ManagementMenuAction,
} from './kairo-management.js';

function state(onboardingStep: ManagementState['onboardingStep']): ManagementState {
  return {
    onboardingStep,
    reportUnread: false,
    staffShortages: 0,
    risk: 'safe',
    endingReady: false,
    examReady: false,
    regularReady: false,
  };
}

describe('Phase 7 경영 행동 배선', () => {
  it('Today 추천이 온보딩 단계마다 실제 코스/의뢰 행동을 실행한다', () => {
    const ran: string[] = [];
    const actions: ManagementMenuAction[] = [
      { id: 'course', label: '코스', run: () => ran.push('course') },
      { id: 'quests', label: '의뢰', run: () => ran.push('quests') },
    ];

    for (const step of ['open-course', 'drag-route', 'test-run', 'apply-course'] as const) {
      const action = managementActionForToday(actions, todayRecommendation(state(step)));
      expect(action?.id).toBe('course');
      if (action) runManagementAction(action);
    }
    const food = managementActionForToday(actions, todayRecommendation(state('build-food')));
    expect(food?.id).toBe('quests');
    if (food) runManagementAction(food);

    expect(ran).toEqual(['course', 'course', 'course', 'course', 'quests']);
  });

  it('시트 내부 이동만 전파를 멈추고 모든 행동은 정확히 한 번 실행한다', () => {
    let runs = 0;
    let stops = 0;
    const event = { stopPropagation: () => { stops++; } };
    runManagementAction({ id: 'regular', label: '단골', stayOpen: true, run: () => { runs++; } }, event);
    runManagementAction({ id: 'course', label: '코스', run: () => { runs++; } }, event);
    expect({ runs, stops }).toEqual({ runs: 2, stops: 1 });
  });

  it('없는 Today 행동은 실행 가능한 행동으로 가장하지 않는다', () => {
    expect(
      managementActionForToday([], todayRecommendation(state('open-course'))),
    ).toBeUndefined();
  });
});

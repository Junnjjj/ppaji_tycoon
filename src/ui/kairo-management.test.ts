import { describe, expect, it } from 'vitest';
import { todayRecommendation, type ManagementState } from '../sim/kairo/meta.js';
import {
  managementActionDetail,
  managementActionForToday,
  managementTodayPresentation,
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
  it('Today 추천이 온보딩 단계마다 실제 코스/의뢰/단골/결산 행동을 실행한다', () => {
    const ran: string[] = [];
    const actions: ManagementMenuAction[] = [
      { id: 'course', label: '코스', run: () => ran.push('course') },
      { id: 'quests', label: '의뢰', run: () => ran.push('quests') },
      { id: 'regular', label: '단골', run: () => ran.push('regular') },
      { id: 'report', label: '결산', run: () => ran.push('report') },
    ];

    for (const step of ['open-course', 'drag-route', 'test-run', 'apply-course'] as const) {
      const action = managementActionForToday(actions, todayRecommendation(state(step)));
      expect(action?.id).toBe('course');
      if (action) runManagementAction(action);
    }
    const food = managementActionForToday(actions, todayRecommendation(state('build-food')));
    expect(food?.id).toBe('quests');
    if (food) runManagementAction(food);

    for (const step of ['equip-menu', 'regular-purchase'] as const) {
      const action = managementActionForToday(actions, todayRecommendation(state(step)));
      expect(action?.id).toBe('regular');
      if (action) runManagementAction(action);
    }
    const report = managementActionForToday(actions, todayRecommendation(state('open-report')));
    expect(report?.id).toBe('report');
    if (report) runManagementAction(report);

    expect(ran).toEqual([
      'course', 'course', 'course', 'course', 'quests', 'regular', 'regular', 'report',
    ]);
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

  it('Today는 기존 추천의 action/source에서 아이콘·이유·상세를 파생한다', () => {
    const today = todayRecommendation(state('open-course'));
    expect(managementTodayPresentation(today)).toEqual({
      icon: '🚤',
      reason: '첫 운영 안내',
      label: '물려받은 코스 시험 운행',
      detail: '물려받은 코스를 열어 보세요',
    });
  });

  it('그룹 항목은 UI adapter의 현재 상태 보조값을 정적 설명보다 우선한다', () => {
    const action: ManagementMenuAction = {
      id: 'price',
      label: '가격',
      detail: '요금·예상 만족',
      run: () => undefined,
    };
    expect(managementActionDetail(action, { price: '현재 요금 100%' })).toBe('현재 요금 100%');
    expect(managementActionDetail(action, {})).toBe('요금·예상 만족');
  });
});

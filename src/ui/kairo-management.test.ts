import { describe, expect, it, vi } from 'vitest';
import { todayRecommendation, type ManagementState } from '../sim/kairo/meta.js';
import { createGoalSlots, type GoalSlotInput } from './kairo-hud.js';
import {
  managementActionDetail,
  managementActionForToday,
  managementGoalRows,
  managementTodayPresentation,
  runManagementAction,
  settingsItemView,
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

function slot(label: string, action: () => void): GoalSlotInput {
  return { icon: '•', label, detail: `${label} 설명`, progress: 0.5, action };
}

/**
 * UI v3 — 홈에서 뺀 중·장기 목표의 새 집 (계획 §1.1, §1.4 `성장 — 목표, 심사, 단골`).
 *
 * ⚠ 홈 밴드에서 B/C 는 하트·별 **아이콘만** 남아 뜻을 말하지 못했다. 메뉴로 옮기는
 * 것만으로는 부족하고, 옮긴 자리에서 **이름·기간·진행률**을 글로 읽혀야 한다.
 */
describe('메뉴 v3 목표 절', () => {
  const chips = createGoalSlots({
    immediate: slot('물려받은 코스 시험 운행', () => undefined),
    mid: slot('민지의 메뉴 요청', () => undefined),
    long: slot('3등급까지', () => undefined),
  });

  it('중·장기 목표를 이름·기간·진행률로 낸다 — 아이콘만 남기지 않는다', () => {
    const rows = managementGoalRows(chips);
    expect(rows.map((row) => [row.role, row.term, row.label])).toEqual([
      ['mid', '중기', '민지의 메뉴 요청'],
      ['long', '장기', '3등급까지'],
    ]);
    expect(rows.every((row) => row.detail.length > 0)).toBe(true);
    expect(rows.map((row) => row.percent)).toEqual([50, 50]);
  });

  it('즉시 목표는 메뉴로 내려오지 않는다 — 홈 한 줄이 정본이다', () => {
    expect(managementGoalRows(chips).some((row) => row.label.includes('물려받은'))).toBe(false);
  });

  it('각 행은 자기 목적지를 직접 연다 (진행률만 보여 주지 않는다)', () => {
    const actions = [vi.fn(), vi.fn()];
    const rows = managementGoalRows(
      createGoalSlots({
        immediate: slot('A', () => undefined),
        mid: slot('B', actions[0]!),
        long: slot('C', actions[1]!),
      }),
    );
    rows[1]!.run();
    expect(actions[0]).not.toHaveBeenCalled();
    expect(actions[1]).toHaveBeenCalledOnce();
  });

  it('진행률은 0~100%로 가둔다 — 파생값이 튀어도 막대가 안 넘친다', () => {
    const rows = managementGoalRows(
      createGoalSlots({
        immediate: slot('A', () => undefined),
        mid: { icon: '•', label: 'B', progress: 2, action: () => undefined },
        long: { icon: '•', label: 'C', progress: -1, action: () => undefined },
      }),
    );
    expect(rows.map((row) => row.percent)).toEqual([100, 0]);
    // 상세가 없어도 기간과 이름은 남는다 (뜻을 아이콘에만 두지 않는다)
    expect(rows[0]!.detail).toBe('');
    expect(rows[0]!.term).toBe('중기');
  });
});

/**
 * `새 판`을 정상 운영 버튼에서 분리한다 (계획 §1.4).
 *
 * ⚠ 예전엔 `배속`과 `새 판`이 `.kmanage-utility` 한 줄에 **같은 위계**로 나란히 있었다.
 * 하나는 세션 선호이고 다른 하나는 자동 저장을 덮는 파괴적 행동이라, 같은 크기·같은
 * 모양으로 두면 실수 한 번이 몇 시간을 지운다.
 */
describe('설정 IA와 파괴적 행동', () => {
  it('파괴적 항목은 결과를 글로 말하고 정체를 따로 표시한다', () => {
    expect(
      settingsItemView({
        id: 'newgame',
        label: '새 게임 시작',
        detail: '지금 판을 지우고 처음부터 시작합니다 · 되돌릴 수 없습니다',
        destructive: true,
        run: () => undefined,
      }),
    ).toEqual({
      label: '새 게임 시작',
      detail: '지금 판을 지우고 처음부터 시작합니다 · 되돌릴 수 없습니다',
      destructive: true,
    });
  });

  it('현재값이 있는 항목은 정적 설명 대신 read()를 읽는다', () => {
    const item = {
      id: 'speed',
      label: '배속',
      detail: '진행 속도',
      read: () => '현재 2× · 탭하면 1×',
      run: () => undefined,
    };
    expect(settingsItemView(item).detail).toBe('현재 2× · 탭하면 1×');
  });

  it('보통 항목은 파괴적으로 가장하지 않는다', () => {
    expect(
      settingsItemView({ id: 'speed', label: '배속', detail: '진행 속도', run: () => undefined })
        .destructive,
    ).toBe(false);
  });
});

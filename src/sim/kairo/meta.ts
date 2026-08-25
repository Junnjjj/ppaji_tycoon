import type { ScenarioStatus } from './scenario.js';

/** Phase 7 경영 시트의 정보 구조. 이 순서가 모바일의 읽기 순서다. */
export const MANAGEMENT_GROUPS = [
  { id: 'operations', label: '운영', items: ['price', 'staff', 'course'] },
  { id: 'growth', label: '성장', items: ['exam', 'regular', 'quests', 'codex'] },
  { id: 'records', label: '기록', items: ['report', 'view', 'certs', 'ending'] },
] as const;

export type ManagementGroup = (typeof MANAGEMENT_GROUPS)[number]['id'];
export type ManagementAction = (typeof MANAGEMENT_GROUPS)[number]['items'][number];

export type OnboardingStep =
  | 'open-course'
  | 'drag-route'
  | 'test-run'
  | 'apply-course'
  | 'build-food'
  | 'done';

export type OnboardingEvent =
  | 'course-opened'
  | 'route-dragged'
  | 'trial-started'
  | 'course-applied'
  | 'food-built';

const ONBOARDING_FLOW: readonly {
  step: Exclude<OnboardingStep, 'done'>;
  event: OnboardingEvent;
  next: OnboardingStep;
}[] = [
  { step: 'open-course', event: 'course-opened', next: 'drag-route' },
  { step: 'drag-route', event: 'route-dragged', next: 'test-run' },
  { step: 'test-run', event: 'trial-started', next: 'apply-course' },
  { step: 'apply-course', event: 'course-applied', next: 'build-food' },
  { step: 'build-food', event: 'food-built', next: 'done' },
];

export interface OnboardingSnapshot {
  version: 1;
  step: OnboardingStep;
}

/**
 * 실행형 온보딩은 잠금 장치가 아니라 관찰자다. 플레이어는 언제든 다른 건설·경영 행동을
 * 할 수 있고, 실제 production 사건이 순서대로 도착했을 때만 다음 한 줄로 이동한다.
 */
export class OnboardingStore {
  private current: OnboardingStep;

  constructor(step: OnboardingStep = 'open-course') {
    this.current = step;
  }

  get step(): OnboardingStep {
    return this.current;
  }

  get done(): boolean {
    return this.current === 'done';
  }

  observe(event: OnboardingEvent): boolean {
    const transition = ONBOARDING_FLOW.find((item) => item.step === this.current);
    if (!transition || transition.event !== event) return false;
    this.current = transition.next;
    return true;
  }

  /** 온보딩은 어떤 자유 플레이 행동도 막지 않는다. */
  blocks(_action: string): false {
    return false;
  }

  toSnapshot(): OnboardingSnapshot {
    return { version: 1, step: this.current };
  }

  static fromSnapshot(snapshot?: Partial<OnboardingSnapshot> | null): OnboardingStore {
    const steps: readonly OnboardingStep[] = [
      'open-course',
      'drag-route',
      'test-run',
      'apply-course',
      'build-food',
      'done',
    ];
    return new OnboardingStore(steps.includes(snapshot?.step as OnboardingStep) ? snapshot!.step! : 'open-course');
  }
}

export interface ManagementState {
  onboardingStep: OnboardingStep;
  reportUnread: boolean;
  staffShortages: number;
  risk: 'safe' | 'watch' | 'caution' | 'danger';
  endingReady: boolean;
  examReady: boolean;
  regularReady: boolean;
}

export interface TodayRecommendation {
  action: ManagementAction;
  label: string;
  detail: string;
  source: 'onboarding' | 'milestone' | 'operation' | 'growth' | 'record';
}

const ONBOARDING_RECOMMENDATIONS: Record<Exclude<OnboardingStep, 'done'>, TodayRecommendation> = {
  'open-course': {
    action: 'course',
    label: '시작 코스 열기',
    detail: '물려받은 코스를 열어 보세요',
    source: 'onboarding',
  },
  'drag-route': {
    action: 'course',
    label: '코스 핸들 끌기',
    detail: '지도 위 핸들을 끌어 루트를 바꾸세요',
    source: 'onboarding',
  },
  'test-run': {
    action: 'course',
    label: '시험 운행',
    detail: '바뀐 루트를 4초 동안 확인하세요',
    source: 'onboarding',
  },
  'apply-course': {
    action: 'course',
    label: '코스 적용',
    detail: '시험 결과를 보고 적용하세요',
    source: 'onboarding',
  },
  'build-food': {
    action: 'quests',
    label: '먹거리 시설 짓기',
    detail: '건설에서 매점이나 카페를 놓으세요',
    source: 'onboarding',
  },
};

/** 상태에서 하나만 파생한다. 경고를 추천에 섞지 않아 우선순위가 매번 뒤집히지 않는다. */
export function todayRecommendation(state: ManagementState): TodayRecommendation {
  if (state.onboardingStep !== 'done') return ONBOARDING_RECOMMENDATIONS[state.onboardingStep];
  if (state.endingReady) {
    return { action: 'ending', label: '첫 엔딩 보기', detail: '성장 마일스톤을 달성했습니다', source: 'milestone' };
  }
  if (state.reportUnread) {
    return { action: 'report', label: '새 결산 보기', detail: '지난주의 결과와 병목을 확인하세요', source: 'record' };
  }
  if (state.staffShortages > 0) {
    return { action: 'staff', label: '직원 배치 점검', detail: `${state.staffShortages}개 역할이 부족합니다`, source: 'operation' };
  }
  if (state.examReady) {
    return { action: 'exam', label: '등급 심사 확인', detail: '조건과 예상 점수를 확인하세요', source: 'growth' };
  }
  if (state.regularReady) {
    return { action: 'regular', label: '단골 요청 확인', detail: '다음 메뉴 요청을 준비하세요', source: 'growth' };
  }
  return { action: 'quests', label: '다음 의뢰 확인', detail: '가장 가까운 목표부터 진행하세요', source: 'growth' };
}

/** 추천 아래의 보조 정보. 심각도 순으로만 정렬하고 행동 하나를 대신하지 않는다. */
export function managementWarnings(state: ManagementState): string[] {
  const warnings: string[] = [];
  if (state.risk === 'danger') warnings.push('위험도가 위험입니다');
  else if (state.risk === 'caution') warnings.push('위험도가 주의입니다');
  if (state.staffShortages > 0) warnings.push(`직원 ${state.staffShortages}개 역할이 부족합니다`);
  if (state.reportUnread) warnings.push('새 결산이 도착했습니다');
  return warnings;
}

/**
 * 첫 엔딩은 52주 목표가 아니라 첫 장기 마일스톤이다. 2026-08-25의 24시드×52주
 * 분포는 인증 6종 이상 19/24, 5등급 0/24였다. 따라서 인증 6종은 성장의 중간값을
 * 요구하고, 실제 장기 문턱은 의도대로 5등급 심사가 맡는다.
 */
export const ENDING_GRADE_THRESHOLD = 5;
export const ENDING_CERT_THRESHOLD = 6;

export interface EndingMilestoneState {
  grade: number;
  certs: number;
  scenario: ScenarioStatus;
}

export interface EndingMilestone {
  ready: boolean;
  gradeReady: boolean;
  certReady: boolean;
  scenarioReady: boolean;
  progress: number;
}

export function endingMilestone(state: EndingMilestoneState): EndingMilestone {
  const gradeReady = state.grade >= ENDING_GRADE_THRESHOLD;
  const certReady = state.certs >= ENDING_CERT_THRESHOLD;
  const scenarioReady = state.scenario !== 'lost';
  return {
    ready: gradeReady && certReady && scenarioReady,
    gradeReady,
    certReady,
    scenarioReady,
    progress: Math.min(
      1,
      (Math.min(1, state.grade / ENDING_GRADE_THRESHOLD) +
        Math.min(1, state.certs / ENDING_CERT_THRESHOLD) +
        Number(scenarioReady)) /
        3,
    ),
  };
}


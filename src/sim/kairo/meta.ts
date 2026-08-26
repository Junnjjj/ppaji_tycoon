import type { ScenarioStatus } from './scenario.js';
import type { KairoFacilityDef } from './placement.js';
import type { MenuFacilityOperability } from './menu.js';

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
  | 'equip-menu'
  | 'regular-purchase'
  | 'open-report'
  | 'done';

export type OnboardingEvent =
  | 'course-opened'
  | 'route-dragged'
  | 'trial-started'
  | 'course-applied'
  | 'food-built'
  | 'menu-equipped'
  | 'regular-purchased'
  | 'report-opened';

const ONBOARDING_FLOW: readonly {
  step: Exclude<OnboardingStep, 'done'>;
  event: OnboardingEvent;
  next: OnboardingStep;
}[] = [
  { step: 'open-course', event: 'course-opened', next: 'drag-route' },
  { step: 'drag-route', event: 'route-dragged', next: 'test-run' },
  { step: 'test-run', event: 'trial-started', next: 'apply-course' },
  { step: 'apply-course', event: 'course-applied', next: 'build-food' },
  { step: 'build-food', event: 'food-built', next: 'equip-menu' },
  { step: 'equip-menu', event: 'menu-equipped', next: 'regular-purchase' },
  { step: 'regular-purchase', event: 'regular-purchased', next: 'open-report' },
  { step: 'open-report', event: 'report-opened', next: 'done' },
];

export interface OnboardingSnapshot {
  version: 2;
  step: OnboardingStep;
}

type OnboardingV1Step = Exclude<OnboardingStep, 'equip-menu' | 'regular-purchase' | 'open-report'>;

interface OnboardingSnapshotV1 {
  version: 1;
  step: OnboardingV1Step;
}

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'open-course',
  'drag-route',
  'test-run',
  'apply-course',
  'build-food',
  'equip-menu',
  'regular-purchase',
  'open-report',
  'done',
];

const ONBOARDING_V1_STEPS: readonly OnboardingV1Step[] = [
  'open-course',
  'drag-route',
  'test-run',
  'apply-course',
  'build-food',
  'done',
];

/**
 * 운영 세이브 자체는 v8을 유지하지만, 그 안의 온보딩 커서 의미는 v2로 확장됐다.
 * 이미 v1에서 `done`이던 플레이어는 절대 되돌리지 않고, 미완료 커서는 같은 이름의
 * v2 단계에서 이어진다. 알 수 없는 값은 자유 행동을 막지 않는 첫 단계로 복구한다.
 */
export function migrateOnboardingSnapshot(snapshot: unknown): OnboardingSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return { version: 2, step: 'open-course' };
  }
  const candidate = snapshot as Partial<OnboardingSnapshot | OnboardingSnapshotV1>;
  if (candidate.version === 2 && ONBOARDING_STEPS.includes(candidate.step as OnboardingStep)) {
    return { version: 2, step: candidate.step as OnboardingStep };
  }
  if (candidate.version === 1 && ONBOARDING_V1_STEPS.includes(candidate.step as OnboardingV1Step)) {
    return { version: 2, step: candidate.step as OnboardingV1Step };
  }
  return { version: 2, step: 'open-course' };
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
    return { version: 2, step: this.current };
  }

  static fromSnapshot(snapshot?: unknown): OnboardingStore {
    return new OnboardingStore(migrateOnboardingSnapshot(snapshot).step);
  }
}

/**
 * 첫 먹거리 안내는 "배가 차는 아무 시설"이 아니라 다음 단계에서 실제 메뉴를 열 수 있는
 * craft 시설의 완공을 관찰한다. 분식·자판기처럼 고정 판매만 하는 시설이 커서를 넘기면
 * equip-menu A 행동이 열 목적지를 잃는다.
 */
export function observeOnboardingBuild(
  onboarding: OnboardingStore,
  facility: Pick<KairoFacilityDef, 'menuMode'> | undefined,
): boolean {
  return onboardingMenuFacility(facility) && onboarding.observe('food-built');
}

/**
 * 건설과 메뉴 확인이 공유하는 craft 시설 경계. `need`는 손님 수요 분류라 카페처럼
 * craft지만 food가 아닌 시설을 배제할 수 있으므로 온보딩 종류 판정에 쓰지 않는다.
 */
function onboardingMenuFacility(
  facility: Pick<KairoFacilityDef, 'menuMode'> | undefined,
): boolean {
  return facility?.menuMode === 'craft';
}

/** 실제 장착 메뉴 확인은 craft 정의와 sim의 단일 운영 판정을 모두 통과해야 전진한다. */
export function observeOnboardingMenu(
  onboarding: OnboardingStore,
  facility: Pick<KairoFacilityDef, 'menuMode'> | undefined,
  operability: MenuFacilityOperability,
): boolean {
  return onboardingMenuFacility(facility) && operability.operable &&
    onboarding.observe('menu-equipped');
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
    label: '물려받은 코스 시험 운행',
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
    detail: '건설에서 1등급 매점을 놓으세요',
    source: 'onboarding',
  },
  'equip-menu': {
    action: 'regular',
    label: '기본 메뉴 확인',
    detail: '방금 지은 먹거리 시설의 장착 메뉴를 확인하세요',
    source: 'onboarding',
  },
  'regular-purchase': {
    action: 'regular',
    label: '민지의 실제 구매 기다리기',
    detail: '요청 메뉴를 산 이름 있는 단골 기록을 확인하세요',
    source: 'onboarding',
  },
  'open-report': {
    action: 'report',
    label: '첫 결산 열기',
    detail: '단골 구매와 KPI·처방을 실제 결산에서 확인하세요',
    source: 'onboarding',
  },
};

/** HUD와 경영 시트가 같은 sim 추천을 쓰도록 미완료 온보딩 규칙만 공개한다. */
export function onboardingRecommendation(step: OnboardingStep): TodayRecommendation | null {
  return step === 'done' ? null : ONBOARDING_RECOMMENDATIONS[step];
}

/** 상태에서 하나만 파생한다. 경고를 추천에 섞지 않아 우선순위가 매번 뒤집히지 않는다. */
export function todayRecommendation(state: ManagementState): TodayRecommendation {
  const onboarding = onboardingRecommendation(state.onboardingStep);
  if (onboarding) return onboarding;
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

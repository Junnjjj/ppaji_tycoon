import type { ScenarioStatus } from './scenario.js';
import type { KairoFacilityDef } from './placement.js';
import type { MenuFacilityOperability } from './menu.js';

/**
 * 밴드의 정보 구조 (P1). 이 순서가 곧 화면 오른쪽 밴드의 위→아래 순서다.
 *
 * ## 왜 「운영/성장/기록」에서 바뀌었나
 *
 * 옛 넷은 **"어떤 종류의 것인가"** 로 나눈 것이라 "지금 뭘 할지"가 안 읽혔다 (사용자 판정).
 * 회전초밥스토리의 메뉴 골격(건설/요리/구입/컨설/경영/정보/시스템)을 빠지로 번역해
 * **"무슨 동사인가"** 로 다시 나눴다 — 정본은 `docs/plan-commission-axis.md` §2.2.
 *
 * ⚠ **`설정` 은 여기 없다.** 넣으면 `todayRecommendation` 이 "새 게임을 시작하세요"를
 * 오늘 할 일로 고를 수 있다. 설정은 `정보` 화면의 마지막 줄이고 표현 계층의 것이다.
 * `건설` 도 없다 — 밴드의 **네이티브 칸**이라 그룹에 안 들어간다 (아래 `ManagementAction` 참고).
 *
 * ⚠ **항목이 하나인 그룹은 밴드에서 바로 그 행동을 연다** (코스·요리). 한 줄짜리 목록
 * 화면을 한 겹 끼우면 탭이 공짜로 하나 는다.
 */
export const MANAGEMENT_GROUPS = [
  { id: 'course', label: '코스', items: ['course'] },
  { id: 'kitchen', label: '요리', items: ['recipe'] },
  { id: 'store', label: '상점', items: ['shop', 'commission'] },
  { id: 'manage', label: '경영', items: ['price', 'staff', 'exam'] },
  { id: 'goals', label: '목표', items: ['quests', 'regular', 'certs', 'wishes'] },
  { id: 'records', label: '정보', items: ['report', 'codex', 'view', 'ending'] },
] as const;

export type ManagementGroup = (typeof MANAGEMENT_GROUPS)[number]['id'];

/**
 * 밴드 그룹 밖에 사는 **네이티브 행동**.
 *
 * `build` 를 유니언에 더하는 이유: 온보딩의 `build-food` 단계가 `action: 'quests'` 인데 실제
 * `run` 은 건설 시트를 열었다 — **이름과 행동이 갈려 있었다.** 여기서 맞춘다.
 * `actionsForRoute` 는 그룹의 `items` 만 보므로 어느 목적지에도 안 뜬다.
 */
export type ManagementAction =
  | (typeof MANAGEMENT_GROUPS)[number]['items'][number]
  | 'build';

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

/** 밴드 한 칸의 id — `build` 만 그룹 밖의 네이티브 칸이다 */
export type BandCellId = 'build' | ManagementGroup;

export interface BandUnlockState {
  onboardingStep: OnboardingStep;
  /** 진행 중인 주차 (1부터) */
  week: number;
  /** craft 시설을 하나라도 지었나 */
  craftBuilt: boolean;
  /** 심사를 한 번이라도 통과했나 */
  examPassed: boolean;
  /** 열린 의뢰가 있나 */
  questsOpen: boolean;
}

/**
 * 밴드 칸이 언제 열리나 (P1).
 *
 * ## 왜 잠그나
 *
 * 카이로는 튜토리얼을 따로 만들지 않고 **메뉴 칸을 잠가 뒀다가 하나씩 열어서** 가르친다.
 * 우리는 정반대였다 — 온보딩 8단계가 `OnboardingStore` 커서로만 존재하고 **화면에는 아무
 * 흔적이 없으며** 메뉴는 처음부터 전부 열려 있었다. 첫 플레이어가 일곱 칸을 다 보고도
 * 뭘 눌러야 할지 모른다.
 *
 * ## ⚠ 주차 안전망이 반드시 있어야 한다
 *
 * 각 조건에 **주차 폴백**을 OR 로 건다. 온보딩은 비차단 관찰자라 플레이어가 그 순서를
 * 무시할 수 있는데, 해금을 온보딩에만 걸면 그 사람은 **영원히 못 여는 칸**이 생긴다.
 * PSS 의 재료 입수 경로 넷 중 하나가 「연차 도달 — 무조건 진행」인 것과 같은 장치다.
 *
 * ⚠ `build` 와 `records` 는 **언제나 열려 있다.** 첫 판에서 아무 데도 못 가면 판이 잠긴다.
 */
export function bandUnlocks(state: BandUnlockState): BandCellId[] {
  const past = (step: OnboardingStep): boolean => {
    const order = ONBOARDING_STEPS.indexOf(state.onboardingStep);
    const at = ONBOARDING_STEPS.indexOf(step);
    return order > at;
  };
  const open: BandCellId[] = ['build', 'records'];
  if (past('apply-course') || state.week >= 2) open.push('course');
  if (state.craftBuilt || state.week >= 3) open.push('kitchen');
  if (state.questsOpen || state.week >= 2) open.push('goals');
  if (state.week >= 2) open.push('store');
  if (state.examPassed || state.week >= 5) open.push('manage');
  return open;
}

/**
 * 잠긴 칸을 눌렀을 때의 **여는 방법**.
 *
 * ⚠ 이유에서 끝내지 않는다 — 「잠김 문구는 방법까지 말한다」가 이 저장소의 규칙이다.
 */
export const BAND_UNLOCK_HINTS: Record<BandCellId, string> = {
  build: '',
  records: '',
  course: '물려받은 코스를 한 번 적용하면 열립니다',
  kitchen: '매점이나 카페를 지으면 열립니다',
  goals: '첫 의뢰가 도착하면 열립니다',
  store: '첫 주 결산을 보면 열립니다',
  manage: '첫 등급 심사를 통과하면 열립니다',
};

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
  /**
   * **누가 말하나** (Q8) — 없으면 화자 없는 안내다.
   *
   * ## 왜 모달이 아니라 화자인가
   *
   * 사용자 요청은 *"처음에 들어올 때, 사용자에게 뭘 시킬지 시키는 것도 하나의 방법일 것
   * 같아 카이로소프트처럼"* 이었다. 처음엔 **부팅 모달**로 만들었다가 **되돌렸다**:
   *
   * · 이 저장소의 사건 채널 계약은 **모달 = 축하**(시간 멈춤) · 티커 = 뉴스 ·
   *   토스트 = 내 행동의 대답 셋이고, 「다음에 뭘 해라」는 그 셋 중 어디도 아니다.
   *   그건 **상태 밴드**의 자리다 (P1).
   * · 실측이 그 계약을 숫자로 확인해 줬다 — 부팅 모달을 두니 **하네스 컨텍스트 넷이
   *   연달아 죽었다** (홈 셸 3건 · 코스 절 · 캔버스 터치 절 · HUD 예산 절). 모달이 지도를
   *   덮기 때문이고, 그건 사람에게도 똑같이 일어난다.
   *
   * 그래서 **밴드에 화자를 붙인다** — 모달 없이 「사람이 시킨다」가 된다.
   */
  speaker?: string;
}

const ONBOARDING_RECOMMENDATIONS: Record<Exclude<OnboardingStep, 'done'>, TodayRecommendation> = {
  'open-course': {
    speaker: '민지',
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
    speaker: '민지',
    action: 'build',
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
    return { action: 'staff', label: '직원 배치 점검', detail: `역할 ${state.staffShortages}개가 부족합니다`, source: 'operation' };
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
  if (state.staffShortages > 0) warnings.push(`직원 역할 ${state.staffShortages}개가 부족합니다`);
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

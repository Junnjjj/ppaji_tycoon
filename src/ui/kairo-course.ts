import {
  PRESETS,
  COURSE_EQUIPMENT,
  presetDef,
  courseEquipment,
  sampleCourse,
  fitOf,
  fitBlocked,
  defaultHandles,
  suggestCourse,
  validateCourse,
  evaluateCourse,
  realizeCourseWeek,
  COURSE_ISSUE_TEXT,
  TOW_BOATS,
  type CourseEdit,
  type CourseEditDraft,
  type CourseStore,
  type DockChoice,
  type PlacedCourse,
  type Vec2,
} from '../sim/kairo/course.js';
import { GROUPS, type GroupId } from '../sim/kairo/groups.js';
import type { KairoTerrain } from '../sim/kairo/terrain.js';
import type { KairoScene } from '../render/scenes/KairoScene.js';
import { el } from './dom.js';
import { panelHost } from './panels.js';
import { won } from './money.js';

/**
 * 코스 편집 — 스펙 §7.3, §A(S11) UI.
 *
 * ## 탭 5회
 *
 * **프리셋 탭 1 + 핸들 드래그 2~4 + 확정 1 ≈ 5회.** 조각 조합 방식은 10~15회였다.
 * 핸들은 화면에서 직접 끈다 (`KairoScene.setCourseOverlay`) — 이 패널은 형태·장비·대수만
 * 고르고, 위치는 지도에서 손가락으로 정한다.
 *
 * ## ⚠ 그 문장이 오래 거짓말이었다 (K33 에서 고침)
 *
 * "핸들은 화면에서 직접 끈다"고 적어 두고, 정작 열어 보면 핸들의 화면 좌표가
 * **x = −284, −380** 이었다. 화면 밖이라 끌 게 없었다. 게다가 패널이 화면의 49% 를
 * 먹고 하단 바까지 덮었다. 브라우저 검사 5건이 통과하고 있었는데, 그 검사들이
 * `moveHandleForTest` 로 **좌표를 직접 넣어서** — 손가락이 닿는지는 아무도 안 물었다.
 *
 * 그래서 K33 에서 셋을 바꿨다:
 * 1. 열면 **카메라가 코스를 잡는다** (`scene.frameCourse`) — 가려진 만큼 위로 올려서
 * 2. 패널은 **슬림 바**가 기본이다. 펼치는 건 ▲ 를 눌렀을 때만
 * 3. 선착장을 **지도에서 탭해** 고른다 — 예전엔 코드가 찾은 첫 데크로 고정이었다
 *
 * ## 적합도를 표로 읽히지 않는다 (§B)
 *
 * 19×6 표를 보여주면 아무도 안 읽는다. **장비를 고르면 프리셋 탭에 배지가 붙는다** —
 * ◎ 최적 · ○ 적합 · △ 부적합 · ✕ 불가(회색). 그래서 "이 장비엔 이 형태"가 조작 중에 보인다.
 *
 * ## 표면은 `style.css` 가 소유한다
 *
 * 예전엔 인라인 스타일 22곳 · 하드코딩 색 35개였다. `tools/check-ui-surface.mjs` 는
 * `style.css` 의 K28 마커 아래만 보므로 이 패널은 검사 **밖**에 있었다. 이제 `.kcourse*`
 * 클래스만 쓰고, 그 클래스가 검사 안에 들어와 있다.
 */

const FIT_BADGE: Record<string, string> = { best: '◎', ok: '○', poor: '△', no: '✕' };

export interface CourseProjectedMetric {
  thrill: number;
  safety: number;
  /** 수요를 만나기 전의 주간 잠재 처리량 */
  throughput: number;
  actualRiders: number;
  revenue: number;
  upkeep: number;
  profit: number;
}

export interface CourseProjection {
  current: CourseProjectedMetric;
  projected: CourseProjectedMetric;
}

const EMPTY_PROJECTION: CourseProjectedMetric = {
  thrill: 0,
  safety: 0,
  throughput: 0,
  actualRiders: 0,
  revenue: 0,
  upkeep: 0,
  profit: 0,
};

function projectOne(course: CourseEditDraft, wantingGuests: number): CourseProjectedMetric {
  const equipment = courseEquipment(course.equipId);
  if (!equipment) return { ...EMPTY_PROJECTION };
  const result = evaluateCourse(
    course.dock,
    course.handles,
    equipment,
    course.presetId,
    course.vehicles,
    course.towBoatId,
  );
  const realized = realizeCourseWeek(
    {
      potentialRiders: result.potentialWeeklyRiders,
      potentialRevenue: result.potentialWeeklyRevenue,
      upkeep: result.weeklyUpkeep,
    },
    wantingGuests,
  );
  return {
    thrill: result.thrill,
    safety: result.safety,
    throughput: result.potentialWeeklyRiders,
    actualRiders: realized.riders,
    revenue: realized.revenue,
    upkeep: result.weeklyUpkeep,
    profit: realized.revenue - result.weeklyUpkeep,
  };
}

/** 현재 코스와 편집 초안을 모두 `evaluateCourse` + 실현 수요 공식으로 비교한다. */
export function courseProjection(
  current: PlacedCourse | null,
  draft: CourseEditDraft,
  wantingGuests: number,
): CourseProjection {
  return {
    current: current ? projectOne(current, wantingGuests) : { ...EMPTY_PROJECTION },
    projected: projectOne(draft, wantingGuests),
  };
}

/**
 * 코스 독의 여섯 상태. 라벨·비활성 규칙은 아래 순수 함수 하나가 소유한다.
 *
 * `applied` 는 Task 6 이 더한 **끝 상태**다. 예전에는 확정 성공이 곧 `hide()` 였고,
 * 증거는 2.6초 뒤 사라지는 토스트뿐이었다 (2026-08-26 실측) — 무엇이 적용됐는지
 * 확인할 자리가 화면에 하나도 없었다. 이제 나가는 문은 `닫기` 하나다.
 */
export type CoursePhase = 'create' | 'info' | 'edit' | 'trial' | 'review' | 'applied';

export interface CourseDeltaCell {
  key: 'thrill' | 'safety' | 'riders' | 'profit';
  label: string;
  /** `18→24` (편집) 또는 `18` (정보). 393px 독 한 칸에서 잘리지 않을 길이다. */
  text: string;
  tone: '' | 'good' | 'warn' | 'bad';
}

/** 만원 눈금 + 부호. 단위(`만`)는 라벨에 한 번만 붙는다 — 값에 붙이면 15px에서 칸을 넘친다. */
function manNumber(n: number): string {
  const v = Math.round(n / 1000) / 10;
  return `${v > 0 ? '+' : ''}${v}`;
}

/**
 * 하단 독의 네 지표 — **`courseProjection()` 결과만** 쓴다.
 *
 * 예전 요약 줄(`.kcourse-chips`)은 `white-space: nowrap` 한 줄이라 393px 에서
 * `스릴 18 · 안전 100 · 실제 0…` 로 잘렸다. 현재→예상이 핵심 화면의 전부인데
 * 그게 첫 화면에서 안 읽혔다. 네 칸 격자로 나누면 각 칸이 자기 폭을 갖는다.
 */
export function courseDeltaCells(
  projection: CourseProjection,
  showDelta: boolean,
): CourseDeltaCell[] {
  const { current, projected } = projection;
  const pair = (a: string, b: string): string => (showDelta ? `${a}→${b}` : b);
  return [
    {
      key: 'thrill',
      label: '스릴',
      text: pair(String(Math.round(current.thrill)), String(Math.round(projected.thrill))),
      tone: projected.thrill > 75 ? 'warn' : '',
    },
    {
      key: 'safety',
      label: '안전',
      text: pair(String(Math.round(current.safety)), String(Math.round(projected.safety))),
      tone: projected.safety < 60 ? 'bad' : 'good',
    },
    {
      key: 'riders',
      /*
       * `실제` 는 **무엇의 실제인지** 화면 어디에도 없었다 (UX 감사 P1-9). 값은
       * `actualRiders` — 이번 주 실제로 탈 손님 수다. 같은 줄의 `스릴 18`·`안전 100` 은
       * 100점 척도라 눈금이 섞였다.
       */
      label: '탑승/주',
      text: pair(String(current.actualRiders), String(projected.actualRiders)),
      tone: '',
    },
    {
      key: 'profit',
      /* 단위는 **값**이 갖는다 — 라벨에 넣으면 열이 좁아질 때 라벨만 잘려 단위가 사라진다 */
      label: '손익/주',
      text: pair(manNumber(current.profit), manNumber(projected.profit)),
      tone: projected.profit < 0 ? 'bad' : projected.profit > 0 ? 'good' : '',
    },
  ];
}

export interface CourseDockAction {
  id: 'settings' | 'cancel' | 'primary';
  label: string;
  disabled: boolean;
  /**
   * "지금 눌러야 할 것" — 상태마다 다르다. 조정·시험은 `시험 운행` 이 주버튼이지만
   * **적용 완료에서는 `닫기` 가 주버튼**이다 (그것이 이 화면을 끝내는 행동이라서).
   * 클래스를 버튼에 박아 두면 그 차이를 표현할 수 없다.
   */
  emphasis: boolean;
}

/**
 * 후보가 **정본 현재 코스와 같은가** (Task 6, 계획 §1.6).
 *
 * 참조가 아니라 내용으로 본다 — 편집 초안은 `beginEdit` 가 만든 사본이라 참조는
 * 언제나 다르다. 같으면 적용이 뜻 없는 행동이므로 주버튼이 `변경 없음` 으로 잠긴다.
 *
 * ⚠ 새 코스 생성(`current === null`)은 언제나 변경이다 — 비교 대상이 없다.
 */
export function courseDraftUnchanged(
  current: PlacedCourse | null,
  draft: CourseEditDraft | null,
): boolean {
  if (!current || !draft) return false;
  return courseShape(current) === courseShape(draft);
}

/** 코스의 뜻을 정하는 값만 — `handle` 처럼 정체가 아닌 필드는 비교에서 뺀다. */
function courseShape(c: CourseEditDraft): string {
  return JSON.stringify({
    presetId: c.presetId,
    equipId: c.equipId,
    vehicles: c.vehicles,
    towBoatId: c.towBoatId ?? null,
    dock: { x: c.dock.x, y: c.dock.y },
    handles: c.handles.map((handle) => ({ x: handle.x, y: handle.y })),
  });
}

export interface CourseReceiptLine {
  key: 'head' | 'spend' | 'trial' | 'record' | 'saved';
  text: string;
}

/**
 * 적용 완료 영수증 (Task 6) — **무엇을 · 얼마에 · 기록까지** 한 벌로 낸다.
 *
 * ⚠ 값이 0이어도 줄을 지우지 말 것. 자리가 사라지면 "돈이 안 나갔다"와 "못 읽었다"를
 * 구분할 수 없다 — 결산의 "콤보 0개인 주에도 줄을 감추지 않는다"와 같은 규칙이다.
 * 시험 줄만은 시험을 안 거친 경로(생성·도구 확정)에서 정직하게 빠진다.
 */
export function courseAppliedLines(o: {
  presetName: string;
  equipName: string;
  vehicles: number;
  charge: number;
  trial: { thrill: number; safety: number } | null;
  record: { thrill: number } | null;
}): CourseReceiptLine[] {
  const lines: CourseReceiptLine[] = [
    { key: 'head', text: `적용 완료 · ${o.presetName} · ${o.equipName} ${o.vehicles}대` },
    { key: 'spend', text: o.charge > 0 ? `차감 −${won(o.charge)}` : '추가 비용 없음' },
  ];
  if (o.trial) {
    lines.push({
      key: 'trial',
      text: `시험 운행 완료 · 스릴 ${Math.round(o.trial.thrill)} · 안전 ${Math.round(o.trial.safety)}`,
    });
  }
  lines.push({
    key: 'record',
    text: o.record ? `코스 신기록 · 스릴 ${Math.round(o.record.thrill)}` : '신기록 없음',
  });
  lines.push({ key: 'saved', text: '저장 완료' });
  return lines;
}

/**
 * 상태별 버튼 정체 (§3.3) — 정보 `닫기/루트 조정` · 편집 `설정/취소/시험 운행` ·
 * 시험 `취소/시험 운행 중` · 리뷰 `다시 조정/이 설정 적용` · 완료 `다시 조정/닫기`.
 *
 * ⚠ 라벨을 `refresh()` 안에서 다시 대입하지 말 것. 한때 `Settings` 가 영문으로 남아
 * 있었던 이유가 바로 그 흩어진 대입이었다 — 정체가 한 곳에 있으면 검사가 잰다.
 *
 * ⚠ `적용` 은 **무엇을** 적용하는지 안 말한다. 핸들을 안 움직여도 시험 뒤에 떠서
 * "무엇이 적용됐는가"를 더 흐렸다 (2026-08-26 실측) — 이름은 `이 설정 적용` 이고,
 * 바꾼 것이 없으면 `변경 없음` 으로 잠긴다.
 */
export function courseDockActions(
  phase: CoursePhase,
  o: { canTrial: boolean; trialPassed: boolean; noop: boolean },
): CourseDockAction[] {
  if (phase === 'info') {
    return [
      { id: 'cancel', label: '닫기', disabled: false, emphasis: false },
      { id: 'primary', label: '루트 조정', disabled: false, emphasis: true },
    ];
  }
  if (phase === 'trial') {
    return [
      { id: 'cancel', label: '취소', disabled: false, emphasis: false },
      { id: 'primary', label: '시험 운행 중', disabled: true, emphasis: true },
    ];
  }
  if (phase === 'review') {
    return [
      { id: 'settings', label: '다시 조정', disabled: false, emphasis: false },
      {
        id: 'primary',
        label: o.noop ? '변경 없음' : '이 설정 적용',
        disabled: o.noop || !o.trialPassed,
        emphasis: true,
      },
    ];
  }
  if (phase === 'applied') {
    return [
      { id: 'settings', label: '다시 조정', disabled: false, emphasis: false },
      { id: 'cancel', label: '닫기', disabled: false, emphasis: true },
    ];
  }
  return [
    { id: 'settings', label: '설정', disabled: false, emphasis: false },
    { id: 'cancel', label: '취소', disabled: false, emphasis: false },
    { id: 'primary', label: '시험 운행', disabled: !o.canTrial, emphasis: true },
  ];
}

export interface EquipmentChoice {
  id: string;
  recommended: boolean;
}

/**
 * 모바일 장비 섹션은 19종 전체를 밀어 넣지 않는다. 선택 장비, 좌우 인접 장비,
 * 현재 루트에 최적인 추천을 데이터 순서로 최대 5개만 낸다.
 */
export function equipmentWindow(equipId: string, presetId: string): EquipmentChoice[] {
  const selected = Math.max(0, COURSE_EQUIPMENT.findIndex((equipment) => equipment.id === equipId));
  const recommended = COURSE_EQUIPMENT.filter((equipment) => fitOf(equipment.id, presetId) === 'best');
  const candidates = [
    COURSE_EQUIPMENT[selected],
    ...recommended,
    COURSE_EQUIPMENT[selected - 1],
    COURSE_EQUIPMENT[selected + 1],
    COURSE_EQUIPMENT[selected - 2],
    COURSE_EQUIPMENT[selected + 2],
  ];
  const seen = new Set<string>();
  const out: EquipmentChoice[] = [];
  for (const equipment of candidates) {
    if (!equipment || seen.has(equipment.id) || fitBlocked(equipment.id, presetId)) continue;
    seen.add(equipment.id);
    out.push({
      id: equipment.id,
      recommended: fitOf(equipment.id, presetId) === 'best',
    });
    if (out.length === 5) break;
  }
  return out;
}

export interface CourseTrialReaction {
  groupId: GroupId;
  text: string;
  /** 코스 스플라인 위치 0..1 */
  progress: number;
}

export interface CourseTrialPlan {
  durationMs: number;
  metrics: CourseProjectedMetric;
  reactions: CourseTrialReaction[];
}

function courseRiskSegments(draft: CourseEditDraft): { a: Vec2; b: Vec2 }[] {
  const equipment = courseEquipment(draft.equipId);
  if (!equipment) return [];
  const samples = sampleCourse(draft.dock, draft.handles);
  const segments: { a: Vec2; b: Vec2 }[] = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (previous.curvature <= equipment.safeCurvature && current.curvature <= equipment.safeCurvature) continue;
    segments.push({ a: { ...previous.pos }, b: { ...current.pos } });
  }
  return segments;
}

/**
 * 시험 운행은 별도 RNG를 소비하지 않는 결정론적 리플레이다. 반응은 손님 데이터의
 * 스릴 선호 구간과 평가 결과를 결합하며, 지표는 반드시 정본 `evaluateCourse`를 거친다.
 */
export function courseTrialPlan(draft: CourseEditDraft, wantingGuests: number): CourseTrialPlan {
  const metrics = projectOne(draft, wantingGuests);
  const thrill = metrics.thrill / 100;
  const reactions = GROUPS.map((group, index): CourseTrialReaction => {
    const [low, high] = group.thrill;
    const text =
      metrics.safety < 55
        ? `${group.name}: 조금 무서워요`
        : thrill < low
          ? `${group.name}: 좀 더 신나게!`
          : thrill > high
            ? `${group.name}: 너무 짜릿해요`
            : `${group.name}: 딱 좋아요`;
    return { groupId: group.id, text, progress: (index + 1) / (GROUPS.length + 1) };
  });
  return { durationMs: 4_000, metrics, reactions };
}

function sectionHeading(label: string): HTMLDivElement {
  return el('div', 'kcourse-section', label);
}

export interface CoursePanelDeps {
  terrain: KairoTerrain;
  scene: KairoScene;
  courses: CourseStore;
  /**
   * 선착장 후보 — **잔교 하나가 후보 하나다** (`dockCandidates`).
   *
   * 예전엔 `dock: () => Vec2` 하나였고 부르는 쪽이 "첫 번째 데크"를 골라 줬다.
   * 플레이어가 못 골랐고, 뻗는 방향도 `{x:0,y:1}` 하드코딩이라 물이 +j 쪽이 아닌
   * 맵에서는 코스가 육지로 뻗었다.
   */
  docks: () => DockChoice[];
  grade: () => number;
  cash: () => number;
  /** 이번 주 코스를 원한 입장객. 없으면 실제 탑승/매출도 0이다. */
  courseDemand: () => number;
  spend: (n: number) => boolean;
  onChange: () => void;
  /**
   * 코스 화면이 주인공인 동안 (v2 §3.3) — 정보·편집·시험·리뷰 전부 포함한다.
   *
   * HUD는 편집 상태를 저장하지 않고 공개 API로 목표 표면만 바꾼다. 예전 이름은
   * `onEditingChange` 였고 **편집일 때만** 참이라, 코스를 열어 놓고 정보를 볼 때는
   * 목표 표면이 `panel` 로 남아 "코스 모드"를 정체로 잴 수 없었다.
   */
  onCourseModeChange: (active: boolean) => void;
  /** 실제 지도 핸들이 움직인 순간. 실행형 온보딩은 이 production 사건만 본다. */
  onRouteDragged: () => void;
  onTrialStarted: () => void;
  onRecord: (record: {
    presetId: string;
    equipmentId: string;
    thrill: number;
  }) => void;
  /**
   * 확정이 성공한 순간 (K46-④) — 확정 후 편집기가 초기화되어 "됐는지 안 됐는지"가
   * 안 보였다 (사용자 지적). main 이 토스트+효과음으로 답한다.
   */
  onConfirmed: (text: string) => void;
}

export class KairoCoursePanel {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  /** 현재→예상 네 지표. 잘리는 한 줄 요약(`.kcourse-chips`)을 대체한다 (v2 §3.3). */
  private readonly deltasEl: HTMLDivElement;
  /** 적용 완료 영수증 (Task 6). 끝 상태에서만 자리를 차지한다 */
  private readonly receiptEl: HTMLDivElement;
  private readonly whyEl: HTMLDivElement;
  private readonly actsEl: HTMLDivElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly presetBar: HTMLDivElement;
  private readonly equipmentBar: HTMLDivElement;
  private readonly boatBar: HTMLDivElement;
  private readonly vehiclesEl: HTMLDivElement;
  private readonly metricsEl: HTMLDivElement;
  private readonly trialEl: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly confirmBtn: HTMLButtonElement;
  /** 시험 운행에서 나온 기록 후보. 실제 커리어 반영은 코스 적용 성공 뒤 한 번만 한다. */
  private pendingRecord: Parameters<CoursePanelDeps['onRecord']>[0] | null = null;

  private presetId = PRESETS[0]!.id;
  private equipId = COURSE_EQUIPMENT[0]!.id;
  private towBoatId: string | undefined = TOW_BOATS[0]?.id;
  private vehicles = 2;
  private handles: Vec2[] = [];
  /** 고른 선착장 후보 번호. 후보가 없으면 −1 */
  private dockIndex = 0;
  /**
   * 플레이어가 **지도에서 직접 고른** 잔교인가 (K37).
   *
   * 안 고정하면 기본 제안(빈 잔교 우선)이 탭을 덮어써서 "탭했는데 안 옮겨진다"가 된다.
   * 열 때와 확정한 뒤에는 풀린다 — 방금 코스를 놓은 잔교에 계속 붙어 있을 이유가 없다.
   */
  private dockPinned = false;
  private phase: CoursePhase = 'create';
  private edit: CourseEdit | null = null;
  private selectedHandle: number | null = null;
  private editingNotified = false;
  private trialTimers: number[] = [];
  private trialPassed = false;
  /** 방금 끝난 시험의 지표 — 영수증이 "무엇을 확인하고 적용했나"를 말하는 재료다 */
  private trialResult: { thrill: number; safety: number } | null = null;
  /** 확정이 남긴 영수증. `applied` 상태에서만 채워져 있다 */
  private receipt: CourseReceiptLine[] = [];

  constructor(
    parent: HTMLElement,
    private readonly deps: CoursePanelDeps,
  ) {
    this.root = el('div', 'kcourse');
    this.root.id = 'kairo-course';
    this.root.hidden = true;

    /*
     * ── 액션 독 (v2 §3.3) ────────────────────────────────────────────────
     *
     * 코스가 화면의 주인공이므로 독은 **지표 1행 + 버튼 1행**이 전부다 (≤112px).
     * 예전 슬림 바는 요약을 한 줄 `nowrap` 으로 밀어 넣어 393px 에서
     * `스릴 18 · 안전 100 · 실제 0…` 로 잘렸다 — 현재→예상이 이 화면의 전부인데
     * 그게 안 읽혔다. 프리셋·장비·보트는 `설정` 뒤로 물러난다.
     */
    const dock = el('div', 'kcourse-dock');
    this.titleEl = el('div', 'kcourse-title');
    this.deltasEl = el('div', 'kcourse-deltas');
    this.deltasEl.id = 'kairo-course-deltas';
    this.receiptEl = el('div', 'kcourse-receipt');
    this.receiptEl.id = 'kairo-course-receipt';
    this.receiptEl.hidden = true;
    this.whyEl = el('div', 'kcourse-why');

    this.toggleBtn = el('button', 'kbtn');
    this.toggleBtn.id = 'kairo-course-toggle';
    this.toggleBtn.setAttribute('aria-label', '코스 설정');
    this.toggleBtn.addEventListener('click', () => {
      // 완료·리뷰의 `다시 조정` — 같은 버튼이 상태에 따라 다른 문을 연다 (라벨이 말한다)
      if (this.phase === 'applied' || this.phase === 'review') {
        this.readjust();
        return;
      }
      this.setExpanded(this.bodyEl.hidden);
    });

    this.closeBtn = el('button', 'kbtn');
    this.closeBtn.id = 'kairo-course-close';
    this.closeBtn.addEventListener('click', () => this.hide());
    this.confirmBtn = el('button', 'kbtn');
    this.confirmBtn.id = 'kairo-course-confirm';
    this.confirmBtn.addEventListener('click', () => this.primaryAction());
    this.actsEl = el('div', 'kcourse-acts');
    dock.append(this.titleEl, this.deltasEl, this.receiptEl, this.whyEl, this.actsEl);

    // ── 펼침 본문 ──
    this.bodyEl = el('div', 'kcourse-body');
    this.bodyEl.id = 'kairo-course-body';
    this.bodyEl.hidden = true;

    const hint = el(
      'div',
      'kcourse-hint',
      '선착장은 지도에서 탭해 고르고, 코스는 핸들을 끌어 만듭니다',
    );

    /*
     * 세 행(루트·장비·보트)이 **같은 구조**여야 한다 (UX 감사 P0-1). 예전에는 장비만
     * `.kcourse-row` 로 감싸여 살아남았고 나머지 둘은 직속이라 2px 로 접혔다.
     */
    this.presetBar = el('div', 'kcourse-presets');
    this.presetBar.id = 'kairo-course-presets';
    const presetRow = el('div', 'kcourse-row');
    presetRow.append(this.presetBar);

    this.equipmentBar = el('div', 'kcourse-options');
    this.equipmentBar.id = 'kairo-course-equip';
    const equipRow = el('div', 'kcourse-row');
    equipRow.append(this.equipmentBar);

    this.boatBar = el('div', 'kcourse-options');
    this.boatBar.id = 'kairo-course-boats';
    const boatRow = el('div', 'kcourse-row');
    boatRow.append(this.boatBar);

    const vehRow = el('div', 'kcourse-row');
    this.vehiclesEl = el('div', 'kcourse-veh');
    this.vehiclesEl.dataset['vehicles'] = '';
    for (const d of [-1, 1]) {
      const b = el('button', 'kbtn', d < 0 ? '−' : '+');
      b.dataset['veh'] = String(d);
      b.addEventListener('click', () => {
        this.vehicles = Math.max(1, Math.min(12, this.vehicles + d));
        this.refresh();
      });
      if (d < 0) vehRow.append(b, this.vehiclesEl);
      else vehRow.append(b);
    }

    this.metricsEl = el('div', 'kstats');
    this.metricsEl.id = 'kairo-course-metrics';

    this.trialEl = el('div', 'kcourse-trial');
    this.trialEl.id = 'kairo-course-trial';

    this.listEl = el('div', 'kcourse-list');

    this.bodyEl.append(
      hint,
      sectionHeading('루트'),
      presetRow,
      sectionHeading('장비'),
      equipRow,
      vehRow,
      sectionHeading('보트'),
      boatRow,
      this.metricsEl,
      this.trialEl,
      this.listEl,
    );
    this.root.append(dock, this.bodyEl);
    parent.append(this.root);

    // 핸들을 끌면 지표가 실시간으로 갱신된다 (§7.3)
    this.deps.scene.onCourseHandleMove = (index, i, j) => {
      const h = this.handles[index];
      if (!h || (this.phase !== 'create' && this.phase !== 'edit')) return;
      h.x = i;
      h.y = j;
      this.deps.onRouteDragged();
      this.refresh(false);
    };
    // 지도에서 선착장을 탭하면 코스가 그쪽으로 옮겨진다 (K33)
    this.deps.scene.onCourseDockPick = (index) => {
      // 기존 코스의 선착장은 편집으로 바꾸지 않는 의미 계약이다.
      if (!this.visible || this.selectedHandle !== null || index === this.dockIndex) return;
      this.dockIndex = index;
      this.dockPinned = true; // 탭한 잔교는 찼더라도 그대로 쓴다 — 판정이 사유를 말한다
      this.resetHandles();
      this.refresh();
      this.frame();
    };
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(handle?: number): void {
    // 한 번에 하나 (K37)
    if (!panelHost.open(this)) return;
    this.clearTrial();
    this.clearReceipt();
    this.pendingRecord = null;
    this.trialResult = null;
    this.root.hidden = false;
    this.setExpanded(false);
    const existing = handle === undefined ? undefined : this.deps.courses.all.find((c) => c.handle === handle);
    if (existing) {
      this.selectedHandle = existing.handle;
      this.edit = null;
      this.phase = 'info';
      // 정보도 코스 모드다 — 홈 목표는 코스가 보이는 내내 숨는다.
      this.notifyEditing(true);
      this.loadCourse(existing);
      this.refresh();
      this.frame();
      return;
    }
    this.selectedHandle = null;
    this.edit = null;
    this.phase = 'create';
    this.trialPassed = false;
    this.notifyEditing(true);
    // 후보가 줄었을 수 있다 (잔교를 철거하면) — 범위 밖이면 첫 번째로
    const n = this.deps.docks().length;
    if (this.dockIndex >= n) this.dockIndex = n > 0 ? 0 : -1;
    // 열 때는 늘 **빈 잔교**부터 제안한다 (K37) — 지난번에 고른 것을 붙들지 않는다
    this.dockPinned = false;
    this.resetHandles();
    this.refresh();
    this.frame();
  }

  hide(): void {
    this.clearTrial();
    this.clearReceipt();
    this.pendingRecord = null;
    this.trialResult = null;
    if (this.edit) this.deps.courses.cancelEdit(this.edit);
    this.edit = null;
    this.root.hidden = true;
    panelHost.closed(this);
    this.deps.scene.setCourseOverlay([], [], null);
    this.deps.scene.setDockChoices([], -1);
    this.notifyEditing(false);
  }

  /**
   * `다시 조정` — 리뷰·적용 완료에서 조정 상태로 되돌아간다 (Task 6).
   *
   * ⚠ 완료에서 오면 정본은 **방금 적용된 코스**다. 새 편집 트랜잭션을 다시 열어야
   * 저장소의 stale 검사가 성립한다 — 이미 확정으로 소비된 옛 `edit` 을 재사용하면
   * 원본이 어긋나 `confirmEdit` 이 던진다.
   */
  private readjust(): void {
    this.clearReceipt();
    this.trialPassed = false;
    this.trialResult = null;
    this.pendingRecord = null;
    if (this.phase === 'applied' && this.selectedHandle !== null) {
      this.beginRouteEdit();
      return;
    }
    this.phase = this.selectedHandle === null ? 'create' : 'edit';
    this.refresh();
  }

  private clearReceipt(): void {
    this.receipt = [];
    this.receiptEl.replaceChildren();
    this.receiptEl.hidden = true;
  }

  private notifyEditing(active: boolean): void {
    if (active === this.editingNotified) return;
    this.editingNotified = active;
    this.deps.onCourseModeChange(active);
  }

  private loadCourse(course: PlacedCourse): void {
    this.presetId = course.presetId;
    this.equipId = course.equipId;
    this.towBoatId = course.towBoatId;
    this.vehicles = course.vehicles;
    this.handles = course.handles.map((handle) => ({ ...handle }));
    const index = this.deps.docks().findIndex(
      (dock) => Math.round(dock.tip.x) === Math.round(course.dock.x) && Math.round(dock.tip.y) === Math.round(course.dock.y),
    );
    if (index >= 0) this.dockIndex = index;
  }

  private beginRouteEdit(): void {
    if (this.selectedHandle === null) return;
    const edit = this.deps.courses.beginEdit(this.selectedHandle);
    if (!edit) return;
    this.edit = edit;
    this.phase = 'edit';
    this.trialPassed = false;
    this.loadCourse({ handle: edit.handle, ...edit.draft });
    this.notifyEditing(true);
    /*
     * ⚠ 예전엔 여기서 `setExpanded(true)` 였다 — 편집을 시작하자마자 설정 본문이
     * 열려 화면의 46%를 먹었고, 정작 끌어야 할 핸들이 그 아래로 숨었다.
     * 편집 상태의 기본은 **독만**이다. 프리셋을 바꾸고 싶으면 `설정`을 누른다.
     */
    this.setExpanded(false);
    this.refresh();
    this.frame();
  }

  /**
   * 카메라가 코스를 잡는다 — **가려진 높이만큼 위로 올려서** (K33).
   *
   * 가림 높이는 재서 쓴다. 상수로 박으면 슬림 바가 두 줄이 되는 순간(경고 문구가 뜰 때)
   * 어긋난다. `getBoundingClientRect` 는 동기라 방금 보이게 한 뒤에도 값이 나온다.
   */
  private frame(): void {
    const dock = this.dock();
    if (!dock) return;
    const r = this.root.getBoundingClientRect();
    const inset = Math.max(0, window.innerHeight - r.top);
    this.deps.scene.frameCourse(dock, this.handles, inset);
  }

  private setExpanded(on: boolean): void {
    this.bodyEl.hidden = !on;
    this.toggleBtn.setAttribute('aria-label', on ? '코스 설정 접기' : '코스 설정 펼치기');
    this.toggleBtn.setAttribute('aria-expanded', String(on));
    /*
     * 펼치면 패널 상단이 올라가 **핸들이 가려질 수 있다.** 접을 때도 마찬가지로 여백이
     * 생긴다 — 가림 높이가 바뀌었으니 다시 잡는다. `show()` 에서 부를 땐 핸들이 아직
     * 없으므로 `frame()` 이 스스로 빠진다.
     */
    if (this.visible && this.handles.length > 0) this.frame();
  }

  /** 고른 선착장. 후보가 없으면 `null` — 그러면 코스를 만들 수 없다 */
  private dock(): Vec2 | null {
    if (this.edit) return { ...this.edit.original.dock };
    if (this.selectedHandle !== null) {
      const current = this.deps.courses.all.find((course) => course.handle === this.selectedHandle);
      if (current) return { ...current.dock };
    }
    const list = this.deps.docks();
    const c = list[this.dockIndex] ?? list[0];
    return c ? c.tip : null;
  }

  /**
   * 이미 놓인 코스 — 판정과 제안이 이걸 본다 (K37).
   *
   * 편집 모드는 아직 없다. 확정은 언제나 **새 코스**다 — 편집이 생기면 여기서
   * 자기 자신을 빼야 한다 (안 빼면 자기 자신과 겹쳤다고 자기를 막는다).
   */
  private others(): readonly PlacedCourse[] {
    return this.deps.courses.all;
  }

  private current(): PlacedCourse | null {
    if (this.selectedHandle === null) return null;
    return this.deps.courses.all.find((course) => course.handle === this.selectedHandle) ?? null;
  }

  private draft(): CourseEditDraft | null {
    const dock = this.dock();
    if (!dock) return null;
    return {
      presetId: this.presetId,
      equipId: this.equipId,
      vehicles: this.vehicles,
      dock,
      handles: this.handles.map((handle) => ({ ...handle })),
      ...(courseEquipment(this.equipId)?.kind === 'tow' && this.towBoatId
        ? { towBoatId: this.towBoatId }
        : {}),
    };
  }

  /**
   * 프리셋을 고르면 핸들이 자동 배치된다 — 그게 탭 1번의 내용이다.
   *
   * K37: **기존 코스를 본다.** 예전엔 `defaultHandles` 하나라 이미 코스가 있는 잔교를
   * 다시 고르고 같은 물을 다시 제안했다 — 그래서 장비를 19종 바꿔도 좌표가 안 변했고,
   * 확정하면 앞의 것 위에 겹쳤다 (실측: 한 잔교에 넷).
   */
  private resetHandles(): void {
    const preset = presetDef(this.presetId);
    const list = this.deps.docks();
    if (!preset || list.length === 0) {
      this.handles = [];
      return;
    }
    if (this.selectedHandle !== null) {
      const dock = this.dock();
      const choice = list.find(
        (candidate) => dock !== null && candidate.tip.x === dock.x && candidate.tip.y === dock.y,
      );
      if (dock) this.handles = defaultHandles(preset, dock, choice?.dir ?? { x: 0, y: 1 }, 8);
      return;
    }
    // 방향은 **잔교가 뻗은 쪽**이다 — 예전 `{x:0,y:1}` 하드코딩은 맵을 하나만 가정했다
    const s = suggestCourse(preset, list, this.others(), {
      span: 8,
      dockIndex: this.dockIndex,
      pinned: this.dockPinned,
    });
    if (s.dockIndex >= 0) this.dockIndex = s.dockIndex;
    this.handles = s.handles;
  }

  private renderPresets(): void {
    this.presetBar.replaceChildren();
    const grade = this.deps.grade();
    for (const p of PRESETS) {
      const fit = fitOf(this.equipId, p.id);
      const blocked = fitBlocked(this.equipId, p.id) || grade < p.grade;
      const b = el('button', `kcourse-item${this.presetId === p.id ? ' on' : ''}`);
      b.dataset['preset'] = p.id;
      b.dataset['fit'] = fit;
      b.disabled = blocked || (this.phase !== 'create' && this.phase !== 'edit');
      const nm = el('div', 'kcourse-item-name', p.name);
      const badge = el(
        'div',
        `kcourse-badge ${fit}`,
        grade < p.grade ? `★${p.grade} 필요` : (FIT_BADGE[fit] ?? ''),
      );
      b.append(nm, badge);
      b.addEventListener('click', () => {
        this.presetId = p.id;
        this.resetHandles();
        this.refresh();
        this.frame();
      });
      this.presetBar.append(b);
    }
  }

  private renderEquipment(): void {
    this.equipmentBar.replaceChildren();
    for (const choice of equipmentWindow(this.equipId, this.presetId)) {
      const equipment = courseEquipment(choice.id);
      if (!equipment) continue;
      const button = el('button', `kcourse-item compact${choice.id === this.equipId ? ' on' : ''}`);
      button.dataset['equip'] = choice.id;
      button.disabled = this.phase !== 'create' && this.phase !== 'edit';
      button.append(
        el('div', 'kcourse-item-name', equipment.name),
        el('div', 'kcourse-badge', choice.recommended ? '추천' : `${equipment.capacity}인`),
      );
      button.addEventListener('click', () => {
        this.equipId = choice.id;
        if (equipment.kind === 'tow') this.towBoatId ??= TOW_BOATS[0]?.id;
        else this.towBoatId = undefined;
        this.refresh();
      });
      this.equipmentBar.append(button);
    }
  }

  private renderBoats(): void {
    this.boatBar.replaceChildren();
    const equipment = courseEquipment(this.equipId);
    if (!equipment || equipment.kind === 'power') {
      this.boatBar.append(el('div', 'kcourse-note', '자체동력 장비 · 견인선 없음'));
      return;
    }
    for (const boat of TOW_BOATS.slice(0, 3)) {
      const button = el('button', `kcourse-item compact${boat.id === this.towBoatId ? ' on' : ''}`);
      button.dataset['boat'] = boat.id;
      button.disabled = this.phase !== 'create' && this.phase !== 'edit';
      button.append(
        el('div', 'kcourse-item-name', boat.name),
        el('div', 'kcourse-badge', boat.role === 'work' ? '안전 추천' : '스릴 추천'),
      );
      button.addEventListener('click', () => {
        this.towBoatId = boat.id;
        this.refresh();
      });
      this.boatBar.append(button);
    }
  }

  private refresh(rebuildPresets = true): void {
    if (rebuildPresets) {
      this.renderPresets();
      this.renderEquipment();
      this.renderBoats();
    }
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    if (!preset || !equip) return;

    // CSS 와 하네스가 같은 값을 읽는다 — 상태 정체를 두 벌로 만들지 않는다
    this.root.dataset['coursePhase'] = this.phase;
    this.renderReceipt();

    const docks = this.deps.docks();
    const dock = this.dock();
    const editing = this.phase === 'create' || this.phase === 'edit';
    this.deps.scene.setDockChoices(
      this.selectedHandle === null && editing ? docks.map((d) => d.tip) : [],
      this.selectedHandle === null && docks.length > 0 ? Math.min(this.dockIndex, docks.length - 1) : -1,
    );

    this.vehiclesEl.textContent = `${this.vehicles}대`;
    const draft = this.draft();
    const cost = draft ? this.chargeFor(draft) : 0;
    const boat = equip.kind === 'tow' ? TOW_BOATS.find((b) => b.id === this.towBoatId) : undefined;
    this.titleEl.textContent =
      `${preset.name} · ${equip.name} ${this.vehicles}대` + (boat ? ` · ${boat.name}` : '');

    if (!dock) {
      // 선착장이 없으면 코스도 없다 — 무엇을 하면 되는지 말한다
      this.deps.scene.setCourseOverlay([], [], null);
      this.deltasEl.replaceChildren();
      this.whyEl.textContent = '선착장이 없습니다 — 물가에 플로팅덱을 놓으세요';
      this.renderDock(false, false);
      this.metricsEl.replaceChildren();
      this.renderList();
      return;
    }

    const v = validateCourse(
      this.deps.terrain,
      this.handles,
      dock,
      preset,
      this.equipId,
      this.deps.grade(),
      this.others(),
      this.selectedHandle ?? undefined,
    );
    this.deps.scene.setCourseOverlay(this.handles, v.badHandles, dock, {
      interactive: editing,
      riskSegments: courseRiskSegments(draft ?? {
        presetId: this.presetId,
        equipId: this.equipId,
        vehicles: this.vehicles,
        dock,
        handles: this.handles,
      }),
    });

    if (!draft) return;
    const projection = courseProjection(this.current(), draft, this.deps.courseDemand());
    const r = projection.projected;
    /*
     * 정보 상태는 **현재값**이다 — 아직 아무것도 안 바꿨는데 `18→18` 이 뜨면
     * "무엇이 달라지나"라는 화살표의 뜻이 닳는다.
     *
     * 적용 완료도 같은 이유로 현재값이다. 다만 여기서는 그 값이 **방금 갱신된 정본**이라
     * (확정 뒤 `selectedHandle` 이 확정된 코스를 가리킨다) 화살표가 아니라 결과다.
     */
    const showDelta = this.phase !== 'info' && this.phase !== 'applied';
    this.deltasEl.replaceChildren(
      ...courseDeltaCells(projection, showDelta).map((c) => {
        const d = el('div', 'kcourse-delta');
        d.dataset['metric'] = c.key;
        d.append(
          el('div', 'kcourse-delta-label', c.label),
          el('div', `kcourse-delta-value${c.tone ? ` ${c.tone}` : ''}`, c.text),
        );
        return d;
      }),
    );

    // 설정 본문에는 독에 안 들어가는 상세만 남긴다 — 같은 숫자를 두 번 적지 않는다.
    const cell = (label: string, current: number, projected: number, suffix = ''): HTMLElement => {
      const d = el('div', 'kstat');
      d.append(
        el('div', 'kstat-label', label),
        el('div', 'kstat-value', `${Math.round(current)} → ${Math.round(projected)}${suffix}`),
      );
      return d;
    };
    this.metricsEl.replaceChildren(
      cell('처리량', projection.current.throughput, r.throughput, '명'),
      cell('주간 매출', projection.current.revenue, r.revenue, '원'),
      cell('유지비', projection.current.upkeep, r.upkeep, '원'),
    );

    /*
     * 처방은 **가능한 것**을 말해야 한다 (K37).
     *
     * `dock-taken` 의 기본 문구는 "다른 잔교를 고르세요"인데, 잔교가 하나뿐인 새 판에서는
     * 그게 **막다른 길**이다 (실측: 시작 킷이 유일한 잔교에 코스를 하나 놓고 시작하므로
     * 새 판의 두 번째 코스는 언제나 이 상태다). 고를 잔교가 없으면 지으라고 말한다.
     */
    const docksAll = this.deps.docks();
    const used = new Set(this.others().map((c) => `${c.dock.x},${c.dock.y}`));
    const freeDocks = docksAll.filter((d) => !used.has(`${d.tip.x},${d.tip.y}`)).length;
    const issues = v.issues.map((i) =>
      i === 'dock-taken' && freeDocks === 0
        ? '이 잔교에 이미 코스가 있습니다 — 선착장을 더 지으세요'
        : COURSE_ISSUE_TEXT[i],
    );
    if (cost > this.deps.cash()) issues.push(`변경비 ${won(cost)} — 현금이 부족합니다`);
    /*
     * 선착장이 하나도 없으면 (K45 — 코스는 선착장이 붙은 잔교에서만) 다른 처방은
     * 전부 소음이다 — 첫 걸음 하나만 말한다.
     */
    if (docksAll.length === 0) {
      issues.length = 0;
      issues.push('선착장이 없습니다 — 잔교 옆에 선착장 시설을 지으세요');
    }
    /*
     * 적용 완료에서는 이유 줄을 비운다 — 그 자리의 주인은 영수증이고, 방금 확정한
     * 코스에 대고 "변경비가 부족합니다" 를 말하면 무엇이 끝났는지가 흐려진다.
     */
    this.whyEl.textContent = this.phase === 'applied' ? '' : issues.join(' · ');
    const canPlace = v.ok && cost <= this.deps.cash();
    this.renderDock(canPlace, courseDraftUnchanged(this.current(), draft));
    if (this.phase === 'info') {
      this.trialEl.textContent = '운행 중 · 지도 코스나 차량을 탭해 연 정보입니다';
    } else if (this.phase === 'trial') {
      this.trialEl.textContent = '대표 손님 반응을 확인하는 중…';
    } else if (this.phase === 'review') {
      this.trialEl.textContent =
        cost > 0 ? `시험 완료 · 변경비 ${won(cost)} · 적용하거나 다시 조정하세요`
          : '시험 완료 · 적용하거나 다시 조정하세요';
    } else {
      this.trialEl.textContent = '';
    }

    this.renderList();
  }

  /**
   * 독의 버튼 줄 — 정체는 `courseDockActions` 하나가 소유한다.
   *
   * 한 상태에 필요 없는 버튼은 **DOM 에서 뺀다** (숨기는 게 아니라). 감춰 두면
   * 하네스의 `button, [role="button"]` 계수 검사가 안 보이는 것까지 세고,
   * 사람도 44px 자리를 못 쓴다.
   */
  private renderDock(canTrial: boolean, noop: boolean): void {
    const buttons: Record<CourseDockAction['id'], HTMLButtonElement> = {
      settings: this.toggleBtn,
      cancel: this.closeBtn,
      primary: this.confirmBtn,
    };
    const actions = courseDockActions(this.phase, {
      canTrial,
      trialPassed: this.trialPassed,
      noop,
    });
    this.actsEl.replaceChildren();
    for (const action of actions) {
      const button = buttons[action.id];
      button.textContent = action.label;
      button.disabled = action.disabled;
      /*
       * 강조도 `courseDockActions` 가 정한다 — 적용 완료의 주버튼은 `닫기` 이지
       * `confirmBtn` 이 아니다. 클래스를 생성 시점에 박아 두면 그 차이를 못 낸다.
       */
      button.classList.toggle('primary', action.emphasis);
      /*
       * `settings` 슬롯은 상태에 따라 **다른 문**을 연다: 조정 중에는 설정 본문을
       * 펼치고(`aria-expanded` 가 뜻이 있다), 리뷰·완료에서는 `다시 조정` 이다.
       * 접힘/펼침 라벨을 그대로 두면 화면은 `다시 조정` 인데 스크린리더는
       * "코스 설정 펼치기" 라고 읽는다 — 이름이 둘이 된다.
       */
      if (action.id === 'settings') {
        const expands = this.phase !== 'review' && this.phase !== 'applied';
        if (expands) {
          button.setAttribute('aria-expanded', String(!this.bodyEl.hidden));
          button.setAttribute(
            'aria-label',
            this.bodyEl.hidden ? '코스 설정 펼치기' : '코스 설정 접기',
          );
        } else {
          button.removeAttribute('aria-expanded');
          button.setAttribute('aria-label', action.label);
        }
      }
      this.actsEl.append(button);
    }
  }

  /** 적용 완료 영수증 — `applied` 에서만 자리를 차지한다 (그 밖에는 `hidden`) */
  private renderReceipt(): void {
    if (this.phase !== 'applied' || this.receipt.length === 0) {
      this.receiptEl.replaceChildren();
      this.receiptEl.hidden = true;
      return;
    }
    this.receiptEl.hidden = false;
    this.receiptEl.replaceChildren(
      ...this.receipt.map((line) => {
        const d = el(
          'div',
          line.key === 'head' ? 'kcourse-receipt-head' : 'kcourse-receipt-line',
          line.text,
        );
        d.dataset['receipt'] = line.key;
        return d;
      }),
    );
  }

  private chargeFor(draft: CourseEditDraft): number {
    const next = courseEquipment(draft.equipId);
    if (!next) return 0;
    const nextInvestment = next.vehicleCost * draft.vehicles;
    const current = this.current();
    if (!current) return nextInvestment;
    const previous = courseEquipment(current.equipId);
    return Math.max(0, nextInvestment - (previous?.vehicleCost ?? 0) * current.vehicles);
  }

  private renderList(): void {
    this.listEl.replaceChildren();
    /*
     * 머리글 (K46-④) — 철거 버튼이 목록 안에 있는데 목록이 뭔지 안 보여서
     * "철거할 구조가 없다"로 읽혔다 (사용자 지적). 운행 중임을 먼저 말한다.
     */
    const n = this.deps.courses.all.length;
    if (n > 0) {
      this.listEl.append(el('div', 'kcaption', `운행 중인 코스 ${n}`));
    }
    // 지도에서 탭한 잔교의 코스가 어느 것인지 — 철거하려면 특정할 수 있어야 한다 (K46-④)
    const cur = this.dock();
    for (const c of this.deps.courses.all) {
      const equip = courseEquipment(c.equipId);
      const preset = presetDef(c.presetId);
      const row = el('div', 'kcourse-listrow');
      row.dataset['course'] = String(c.handle);
      const mine = cur !== null && c.dock.x === cur.x && c.dock.y === cur.y;
      if (mine) row.classList.add('on');
      row.append(
        el(
          'span',
          undefined,
          `${preset?.name ?? c.presetId} · ${equip?.name ?? c.equipId} ${c.vehicles}대` +
            (mine ? ' · 고른 잔교' : ''),
        ),
      );
      const del = el('button', 'kbtn', '철거');
      del.addEventListener('click', () => {
        this.deps.courses.remove(c.handle);
        this.deps.onChange();
        this.refresh();
      });
      row.append(del);
      this.listEl.append(row);
    }
  }

  private primaryAction(): void {
    if (this.phase === 'info') {
      this.beginRouteEdit();
      return;
    }
    // 적용 완료의 주버튼은 `닫기`(closeBtn)라 여기까지 오지 않는다 — 와도 아무 일이 없다
    if (this.phase === 'applied') return;
    if (this.phase === 'review') {
      /*
       * ⚠ 비활성 라벨(`변경 없음`)만으로는 부족하다. 버튼의 disabled 는 화면의 사실이고
       * 이 판정은 **규칙**이다 — 규칙을 화면에만 두면 다른 입구(하네스·키보드)가 뜻 없는
       * 적용을 통과시킨다.
       */
      if (courseDraftUnchanged(this.current(), this.draft())) return;
      this.commit('applied');
      return;
    }
    if (this.phase === 'create' || this.phase === 'edit') this.startTrial();
  }

  private validation(): ReturnType<typeof validateCourse> | null {
    const preset = presetDef(this.presetId);
    const dock = this.dock();
    if (!preset || !dock) return null;
    return validateCourse(
      this.deps.terrain,
      this.handles,
      dock,
      preset,
      this.equipId,
      this.deps.grade(),
      this.others(),
      this.selectedHandle ?? undefined,
    );
  }

  private startTrial(): void {
    const draft = this.draft();
    const validation = this.validation();
    if (!draft || !validation?.ok || this.chargeFor(draft) > this.deps.cash()) return;
    this.clearTrial();
    this.clearReceipt();
    this.pendingRecord = null;
    this.trialResult = null;
    const plan = courseTrialPlan(draft, this.deps.courseDemand());
    this.phase = 'trial';
    this.trialPassed = false;
    this.deps.onTrialStarted();
    this.deps.scene.startCourseTrial(
      sampleCourse(draft.dock, draft.handles).map((sample) => sample.pos),
      plan.durationMs,
      plan.reactions,
    );
    this.refresh(false);
    const timer = window.setTimeout(() => {
      this.trialTimers = this.trialTimers.filter((id) => id !== timer);
      if (!this.visible || this.phase !== 'trial') return;
      this.phase = 'review';
      this.trialPassed = true;
      const current = courseProjection(this.current(), draft, this.deps.courseDemand());
      // 영수증이 "무엇을 확인하고 적용했나"를 말하려면 시험 결과가 확정까지 살아 있어야 한다
      this.trialResult = { thrill: current.projected.thrill, safety: current.projected.safety };
      if (current.projected.thrill > current.current.thrill) {
        this.deps.scene.playCourseRecord(draft.dock, `NEW ${Math.round(current.projected.thrill)}`);
        this.pendingRecord = {
          presetId: draft.presetId,
          equipmentId: draft.equipId,
          thrill: current.projected.thrill,
        };
      }
      this.refresh(false);
    }, plan.durationMs);
    this.trialTimers.push(timer);
  }

  private clearTrial(): void {
    for (const timer of this.trialTimers) window.clearTimeout(timer);
    this.trialTimers = [];
    this.deps.scene.clearCourseTrial();
  }

  /**
   * 확정 — 검증 · 결제 · 교체는 그대로고 **끝나는 자리만** 둘이다 (Task 6).
   *
   * · `applied` — 사람이 누른 경로. 패널을 닫지 않고 영수증 상태로 남는다
   * · `next` — 도구(`confirmForTest`) 경로. 기존 생성 흐름처럼 다음 빈 선착장을 준비한다
   *
   * ⚠ 여기서 `hide()` 를 부르지 말 것. 성공의 증거가 2.6초 토스트뿐이 된다
   *   (2026-08-26 실측 — 3초 뒤에는 "적용됨"이 화면에 하나도 안 남았다).
   * ⚠ 결제·stale·기록 보장은 손대지 않았다 — `confirmEdit` 이 실패하면 여기서
   *   **그 자리에 되돌아가고** 영수증도 기록도 안 생긴다.
   */
  private commit(exit: 'applied' | 'next'): void {
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    const draft = this.draft();
    const validation = this.validation();
    if (!preset || !equip || !draft || !validation?.ok) return;
    /** 실제로 나간 돈. 편집은 저장소가 계산한 차액이 정본이다 */
    let charge = 0;
    let applied: PlacedCourse | null = null;
    if (this.edit) {
      this.edit.draft = draft;
      /*
       * 저장소가 stale 원본 검증 → 차액 계산 → 결제 → 교체를 한 경계에서 수행한다.
       * UI가 먼저 spend하면 confirmEdit 예외 뒤에 현금만 빠진 상태가 남는다.
       */
      const result = this.deps.courses.confirmEdit(this.edit, this.deps.spend);
      if (!result) return;
      charge = result.charge;
      applied = result.course;
    } else {
      charge = this.chargeFor(draft);
      if (!this.deps.spend(charge)) return;
      applied = this.deps.courses.add(draft);
    }
    const record = this.pendingRecord;
    const trial = this.trialResult;
    this.pendingRecord = null;
    this.deps.onChange();
    if (record) this.deps.onRecord(record);
    this.deps.onConfirmed(
      `코스 적용 — ${preset.name} · ${equip.name} ${this.vehicles}대 운행`,
    );
    this.clearTrial();
    this.edit = null;
    this.trialPassed = false;
    if (exit === 'next') {
      // 하네스 직접 확정은 기존 생성 흐름처럼 다음 빈 선착장을 준비한다.
      this.trialResult = null;
      this.clearReceipt();
      this.selectedHandle = null;
      this.phase = 'create';
      this.dockPinned = false;
      this.resetHandles();
      this.refresh();
      return;
    }
    /*
     * 확정한 코스가 곧 **현재**다. 생성 경로도 여기서 handle 을 잡아야 갱신된 현재값이
     * 뜨고, `다시 조정` 이 그 코스를 대상으로 새 편집 트랜잭션을 열 수 있다.
     */
    this.selectedHandle = applied.handle;
    this.dockPinned = false;
    this.loadCourse(applied);
    this.phase = 'applied';
    this.receipt = courseAppliedLines({
      presetName: preset.name,
      equipName: equip.name,
      vehicles: this.vehicles,
      charge,
      trial,
      record: record ? { thrill: record.thrill } : null,
    });
    this.trialResult = null;
    this.setExpanded(false);
    this.refresh();
    this.frame();
  }

  /**
   * 도구용 — 화면을 거치지 않고 확정한다. 사람이 쓰는 경로와 같은 `confirm` 을 탄다.
   *
   * ⚠ 이 문 때문에 "핸들이 화면 밖"이 오래 안 잡혔다. sim 이 맞는지 보는 데는 쓰되,
   * **화면이 되는지는 진짜 터치로 봐야 한다** (`verify-kairo.ts` 의 K33 절).
   */
  confirmForTest(): number {
    const before = this.deps.courses.count;
    this.commit('next');
    return this.deps.courses.count - before;
  }

  /** 도구용 — 핸들을 옮긴다 (드래그 대신) */
  moveHandleForTest(index: number, i: number, j: number): boolean {
    const h = this.handles[index];
    if (!h) return false;
    h.x = i;
    h.y = j;
    this.refresh(false);
    return true;
  }

  get state(): {
    presetId: string;
    equipId: string;
    vehicles: number;
    handles: Vec2[];
    dockIndex: number;
    dock: Vec2 | null;
    expanded: boolean;
    phase: CoursePhase;
    selectedHandle: number | null;
    trialPassed: boolean;
    /** 후보가 정본과 같은가 — 리뷰의 `변경 없음` 이 이 값을 읽는다 */
    noop: boolean;
    /** 적용 완료 영수증. 그 밖의 상태에서는 빈 배열이다 */
    receipt: CourseReceiptLine[];
  } {
    return {
      presetId: this.presetId,
      equipId: this.equipId,
      vehicles: this.vehicles,
      handles: this.handles.map((h) => ({ ...h })),
      dockIndex: this.dockIndex,
      dock: this.dock(),
      expanded: !this.bodyEl.hidden,
      phase: this.phase,
      selectedHandle: this.selectedHandle,
      trialPassed: this.trialPassed,
      noop: courseDraftUnchanged(this.current(), this.draft()),
      receipt: this.receipt.map((line) => ({ ...line })),
    };
  }

  select(presetId: string, equipId: string): void {
    this.presetId = presetId;
    this.equipId = equipId;
    this.towBoatId = courseEquipment(equipId)?.kind === 'tow' ? (this.towBoatId ?? TOW_BOATS[0]?.id) : undefined;
    this.resetHandles();
    this.refresh();
  }
}

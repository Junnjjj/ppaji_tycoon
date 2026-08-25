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

function won(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000) / 10}만`;
  return n.toLocaleString('ko-KR');
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
  /** HUD는 편집 상태를 저장하지 않고 공개 API로 접기/복원만 한다. */
  onEditingChange: (editing: boolean) => void;
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
  private readonly chipsEl: HTMLDivElement;
  private readonly whyEl: HTMLDivElement;
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
  private phase: 'create' | 'info' | 'edit' | 'trial' | 'review' = 'create';
  private edit: CourseEdit | null = null;
  private selectedHandle: number | null = null;
  private editingNotified = false;
  private trialTimers: number[] = [];
  private trialPassed = false;

  constructor(
    parent: HTMLElement,
    private readonly deps: CoursePanelDeps,
  ) {
    this.root = el('div', 'kcourse');
    this.root.id = 'kairo-course';
    this.root.hidden = true;

    // ── 슬림 바 — 접힘 상태의 전부 ──
    const bar = el('div', 'kcourse-bar');
    const sum = el('div', 'kcourse-sum');
    this.titleEl = el('div', 'kcourse-title');
    this.chipsEl = el('div', 'kcourse-chips');
    this.whyEl = el('div', 'kcourse-why');
    sum.append(this.titleEl, this.chipsEl, this.whyEl);

    this.toggleBtn = el('button', 'kbtn');
    this.toggleBtn.id = 'kairo-course-toggle';
    this.toggleBtn.textContent = 'Settings';
    this.toggleBtn.setAttribute('aria-label', '코스 설정');
    this.toggleBtn.addEventListener('click', () => {
      if (this.phase === 'review') {
        this.phase = this.selectedHandle === null ? 'create' : 'edit';
        this.trialPassed = false;
        this.refresh();
        return;
      }
      this.setExpanded(this.bodyEl.hidden);
    });

    const acts = el('div', 'kcourse-acts');
    this.closeBtn = el('button', 'kbtn', '취소');
    this.closeBtn.id = 'kairo-course-close';
    this.closeBtn.addEventListener('click', () => this.hide());
    this.confirmBtn = el('button', 'kbtn primary', '시험 운행');
    this.confirmBtn.id = 'kairo-course-confirm';
    this.confirmBtn.addEventListener('click', () => this.primaryAction());
    acts.append(this.closeBtn, this.confirmBtn);
    bar.append(sum, this.toggleBtn, acts);

    // ── 펼침 본문 ──
    this.bodyEl = el('div', 'kcourse-body');
    this.bodyEl.id = 'kairo-course-body';
    this.bodyEl.hidden = true;

    const hint = el(
      'div',
      'kcourse-hint',
      '선착장은 지도에서 탭해 고르고, 코스는 핸들을 끌어 만듭니다',
    );

    this.presetBar = el('div', 'kcourse-presets');
    this.presetBar.id = 'kairo-course-presets';

    this.equipmentBar = el('div', 'kcourse-options');
    this.equipmentBar.id = 'kairo-course-equip';
    const equipRow = el('div', 'kcourse-row');
    equipRow.append(this.equipmentBar);

    this.boatBar = el('div', 'kcourse-options');
    this.boatBar.id = 'kairo-course-boats';

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
      this.presetBar,
      sectionHeading('장비'),
      equipRow,
      vehRow,
      sectionHeading('보트'),
      this.boatBar,
      this.metricsEl,
      this.trialEl,
      this.listEl,
    );
    this.root.append(bar, this.bodyEl);
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
    this.pendingRecord = null;
    this.root.hidden = false;
    this.setExpanded(false);
    const existing = handle === undefined ? undefined : this.deps.courses.all.find((c) => c.handle === handle);
    if (existing) {
      this.selectedHandle = existing.handle;
      this.edit = null;
      this.phase = 'info';
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
    this.pendingRecord = null;
    if (this.edit) this.deps.courses.cancelEdit(this.edit);
    this.edit = null;
    this.root.hidden = true;
    panelHost.closed(this);
    this.deps.scene.setCourseOverlay([], [], null);
    this.deps.scene.setDockChoices([], -1);
    this.notifyEditing(false);
  }

  private notifyEditing(editing: boolean): void {
    if (editing === this.editingNotified) return;
    this.editingNotified = editing;
    this.deps.onEditingChange(editing);
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
    this.setExpanded(true);
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
    this.toggleBtn.textContent = 'Settings';
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
    this.titleEl.textContent = `${preset.name} · ${equip.name} ${this.vehicles}대`;

    if (!dock) {
      // 선착장이 없으면 코스도 없다 — 무엇을 하면 되는지 말한다
      this.deps.scene.setCourseOverlay([], [], null);
      this.chipsEl.textContent = '';
      this.whyEl.textContent = '선착장이 없습니다 — 물가에 플로팅덱을 놓으세요';
      this.confirmBtn.disabled = true;
      this.confirmBtn.textContent = '시험 운행';
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
    const thrillCls = r.thrill > 75 ? 'warn' : '';
    const safeCls = r.safety < 60 ? 'bad' : 'good';
    this.chipsEl.replaceChildren(
      el('span', thrillCls, `스릴 ${Math.round(r.thrill)}`),
      document.createTextNode(' · '),
      el('span', safeCls === 'bad' ? 'bad' : '', `안전 ${Math.round(r.safety)}`),
      document.createTextNode(` · 실제 ${r.actualRiders}명 · 이익 ${won(r.profit)}`),
    );

    const cell = (label: string, current: number, projected: number, suffix = '', cls = ''): HTMLElement => {
      const d = el('div', 'kstat');
      d.append(
        el('div', 'kstat-label', label),
        el('div', `kstat-value ${cls}`, `${Math.round(current)} → ${Math.round(projected)}${suffix}`),
      );
      return d;
    };
    this.metricsEl.replaceChildren(
      cell('스릴', projection.current.thrill, r.thrill, '', thrillCls),
      cell('안전', projection.current.safety, r.safety, '', safeCls),
      cell('처리량', projection.current.throughput, r.throughput, '명'),
      cell('실제 탑승', projection.current.actualRiders, r.actualRiders, '명'),
      cell('주간 이익', projection.current.profit, r.profit, '원'),
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
    this.whyEl.textContent = issues.join(' · ');
    const canPlace = v.ok && cost <= this.deps.cash();
    this.closeBtn.textContent = this.phase === 'info' ? '닫기' : '취소';
    this.toggleBtn.textContent = this.phase === 'review' ? '다시 조정' : 'Settings';
    if (this.phase === 'info') {
      this.confirmBtn.disabled = false;
      this.confirmBtn.textContent = '루트 조정';
      this.trialEl.textContent = '운행 중 · 지도 코스나 차량을 탭해 연 정보입니다';
    } else if (this.phase === 'trial') {
      this.confirmBtn.disabled = true;
      this.confirmBtn.textContent = '시험 운행 4초';
      this.trialEl.textContent = '대표 손님 반응을 확인하는 중…';
    } else if (this.phase === 'review') {
      this.confirmBtn.disabled = !this.trialPassed;
      this.confirmBtn.textContent = '적용';
      this.trialEl.textContent = '시험 완료 · 적용하거나 다시 조정하세요';
    } else {
      this.confirmBtn.disabled = !canPlace;
      this.confirmBtn.textContent = canPlace ? '시험 운행' : '시험 운행';
      this.trialEl.textContent = '';
    }

    this.renderList();
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
    if (this.phase === 'review') {
      this.commit(true);
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
    this.pendingRecord = null;
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

  private commit(closeAfter: boolean): void {
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    const draft = this.draft();
    const validation = this.validation();
    if (!preset || !equip || !draft || !validation?.ok) return;
    if (this.edit) {
      this.edit.draft = draft;
      /*
       * 저장소가 stale 원본 검증 → 차액 계산 → 결제 → 교체를 한 경계에서 수행한다.
       * UI가 먼저 spend하면 confirmEdit 예외 뒤에 현금만 빠진 상태가 남는다.
       */
      if (!this.deps.courses.confirmEdit(this.edit, this.deps.spend)) return;
    } else {
      const charge = this.chargeFor(draft);
      if (!this.deps.spend(charge)) return;
      this.deps.courses.add(draft);
    }
    const record = this.pendingRecord;
    this.pendingRecord = null;
    this.deps.onChange();
    if (record) this.deps.onRecord(record);
    this.deps.onConfirmed(
      `코스 적용 — ${preset.name} · ${equip.name} ${this.vehicles}대 운행`,
    );
    this.clearTrial();
    this.edit = null;
    if (closeAfter) {
      this.hide();
      return;
    }
    // 하네스 직접 확정은 기존 생성 흐름처럼 다음 빈 선착장을 준비한다.
    this.selectedHandle = null;
    this.phase = 'create';
    this.trialPassed = false;
    this.dockPinned = false;
    this.resetHandles();
    this.refresh();
  }

  /**
   * 도구용 — 화면을 거치지 않고 확정한다. 사람이 쓰는 경로와 같은 `confirm` 을 탄다.
   *
   * ⚠ 이 문 때문에 "핸들이 화면 밖"이 오래 안 잡혔다. sim 이 맞는지 보는 데는 쓰되,
   * **화면이 되는지는 진짜 터치로 봐야 한다** (`verify-kairo.ts` 의 K33 절).
   */
  confirmForTest(): number {
    const before = this.deps.courses.count;
    this.commit(false);
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
    phase: 'create' | 'info' | 'edit' | 'trial' | 'review';
    selectedHandle: number | null;
    trialPassed: boolean;
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

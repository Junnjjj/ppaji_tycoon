import { MANAGEMENT_GROUPS, type ManagementAction, type TodayRecommendation } from '../sim/kairo/meta.js';
import { el } from './dom.js';
import type { GoalChip, GoalRole } from './kairo-hud.js';
import type { GrowthEvent, GrowthList, GrowthRow } from './kairo-growth.js';

export interface ManagementMenuAction {
  id: ManagementAction;
  /** 기존 브라우저/접근성 손잡이를 보존한다. */
  domId?: string;
  label: string;
  detail?: string;
  run: () => void;
  /** 의뢰·단골·인증처럼 같은 시트 안에서 이동하는 행동은 시트를 닫지 않는다. */
  stayOpen?: boolean;
}

export interface ManagementMenuState {
  today: TodayRecommendation;
  warnings: readonly string[];
  /** 시뮬 규칙을 복제하지 않고 현재 값을 붙이는 UI adapter 출력. */
  details?: Partial<Record<ManagementAction, string>>;
  /** L1 라우터 네 줄의 부제 — "이 안에 지금 무엇이 있나"를 열기 전에 말한다 */
  routeDetails?: Partial<Record<ManageRouteId, string>>;
  /** 판 설정 한 줄 (`북한강형 · 물려받은 빠지`) */
  context?: string;
}

/**
 * 화면 하나의 정체.
 *
 * ⚠ **개수가 아니라 이름이 계약이다** (K47-② 「개수를 세는 검사는 조용히 죽는다」).
 * 게이트는 `data-manage-screen` · `data-manage-route` 를 이름으로 읽는다.
 */
export type ManageRouteId = 'operations' | 'growth' | 'records' | 'settings';
export type ManageListId = 'quests' | 'wishes' | 'certs' | 'regulars';
export type ManageScreenId = 'index' | ManageRouteId | ManageListId;

interface ScreenDef {
  id: ManageScreenId;
  title: string;
  /** `‹ 뒤로` 가 가는 곳. `null` 이면 뒤로가 없다 (인덱스) */
  back: ManageScreenId | null;
}

/**
 * 화면 지도 — **깊이는 최대 3이다** (`홈 → 메뉴 인덱스 → 목적지 → 목록`).
 *
 * 목록 넷(의뢰·소원·인증·단골)만 3단이고, 그 셋은 전부 `성장` 아래다.
 * 4단이 필요해지면 그 상세는 잘못된 자리에 있는 것이다.
 */
export const MANAGE_SCREENS: readonly ScreenDef[] = [
  { id: 'index', title: '메뉴', back: null },
  { id: 'operations', title: '운영', back: 'index' },
  { id: 'growth', title: '성장', back: 'index' },
  { id: 'records', title: '기록', back: 'index' },
  { id: 'settings', title: '설정', back: 'index' },
  { id: 'quests', title: '의뢰', back: 'growth' },
  { id: 'wishes', title: '소원', back: 'growth' },
  { id: 'certs', title: '인증', back: 'growth' },
  { id: 'regulars', title: '단골', back: 'growth' },
];

export function manageScreen(id: ManageScreenId): ScreenDef {
  return MANAGE_SCREENS.find((s) => s.id === id) ?? MANAGE_SCREENS[0]!;
}

/** L1 라우터 네 줄. `설정` 은 **마지막**이다 — 예측 가능한 자리여야 찾는다 */
export const MANAGE_ROUTES: readonly { id: ManageRouteId; label: string; hint: string }[] = [
  { id: 'operations', label: '운영', hint: '지금 돌아가는 것을 조정합니다' },
  { id: 'growth', label: '성장', hint: '다음 목표와 진행을 봅니다' },
  { id: 'records', label: '기록', hint: '지난 일과 성취를 다시 봅니다' },
  { id: 'settings', label: '설정', hint: '판 자체를 다룹니다' },
];

/**
 * `성장` 아래 목록 넷의 라우터 줄.
 *
 * ⚠ **`설정` 을 `MANAGEMENT_GROUPS` 에 넣지 않는다** — 넣으면 `todayRecommendation` 이
 * "새 게임을 시작하세요"를 추천할 수 있다. 설정은 표현 계층의 네 번째 행이다.
 */
export const MANAGE_LISTS: readonly { id: ManageListId; label: string }[] = [
  { id: 'quests', label: '의뢰' },
  { id: 'wishes', label: '소원' },
  { id: 'certs', label: '인증' },
  { id: 'regulars', label: '단골' },
];

/**
 * 어느 경영 행동이 어느 목적지에 사는가.
 *
 * `MANAGEMENT_GROUPS` (sim 상수)가 정본이고 여기서는 **없는 것을 만들지 않는다** —
 * 라우터는 그 배열을 그대로 읽어 화면으로 나눈다.
 */
export function actionsForRoute(
  route: ManageRouteId,
  actions: readonly ManagementMenuAction[],
): ManagementMenuAction[] {
  const group = MANAGEMENT_GROUPS.find((g) => g.id === route);
  if (!group) return [];
  const order = new Map(group.items.map((id, index) => [id, index]));
  return actions
    .filter((a) => order.has(a.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * 홈에서 뺀 중·장기 목표 한 행 (UI v3).
 *
 * ⚠ 새 상태가 아니다 — 홈이 이미 파생한 `GoalChip` 을 **읽는 자리만 바꾼** 것이다.
 */
export interface ManagementGoalRow {
  role: Exclude<GoalRole, 'immediate'>;
  /** 화면에 보이는 기간 — `B`/`C` 같은 글자나 하트·별로 줄이지 않는다 */
  term: string;
  icon: string;
  label: string;
  detail: string;
  /** 0~100 정수. 막대 폭은 데이터라 인라인으로 남지만 값은 여기서 가둔다 */
  percent: number;
  run: () => void;
}

const GOAL_TERMS: Record<Exclude<GoalRole, 'immediate'>, string> = {
  mid: '중기',
  long: '장기',
};

/**
 * 홈 밴드에서 뺀 목표를 메뉴가 읽을 행으로 옮긴다.
 *
 * 즉시 목표는 홈의 현재 행동 한 줄이 정본이므로 여기 내려오지 않는다.
 */
export function managementGoalRows(chips: readonly GoalChip[]): ManagementGoalRow[] {
  const rows: ManagementGoalRow[] = [];
  for (const chip of chips) {
    if (chip.role === 'immediate') continue;
    rows.push({
      role: chip.role,
      term: GOAL_TERMS[chip.role],
      icon: chip.icon,
      label: chip.label,
      detail: chip.detail ?? '',
      percent: Math.round(Math.max(0, Math.min(1, chip.progress)) * 100),
      run: chip.action,
    });
  }
  return rows;
}

/**
 * 설정 항목 — 배속·알림 같은 세션 선호와, 자동 저장을 덮는 파괴적 행동이 같이 산다.
 */
export interface ManagementSettingsItem {
  id: string;
  /** 기존 브라우저/접근성 손잡이를 보존한다 (`kairo-newgame-open` 등) */
  domId?: string;
  label: string;
  detail: string;
  /** 현재값이 있으면 정적 설명 대신 이걸 읽는다 */
  read?: () => string;
  /** 되돌릴 수 없는 행동 — 표면과 문구가 그 사실을 말해야 한다 */
  destructive?: boolean;
  /** 아직 못 쓰는 항목 — 회색으로 죽이되 **왜인지 말한다** */
  disabled?: boolean;
  run: () => void;
}

export interface ManagementSettingsSection {
  id: string;
  label: string;
  items: readonly ManagementSettingsItem[];
}

export interface ManagementSettingsView {
  label: string;
  detail: string;
  destructive: boolean;
}

/** 설정 한 행의 표시 모델. DOM 이 파괴성 규칙이나 현재값 우선순위를 다시 추론하지 않는다. */
export function settingsItemView(item: ManagementSettingsItem): ManagementSettingsView {
  return {
    label: item.label,
    detail: item.read ? item.read() : item.detail,
    destructive: item.destructive === true,
  };
}

export interface ManagementTodayPresentation {
  icon: string;
  reason: string;
  label: string;
  detail: string;
}

const ACTION_ICONS: Record<ManagementAction, string> = {
  price: '◎', staff: '👥', course: '🚤', exam: '⭐', regular: '♥', quests: '✓',
  codex: '▣', report: '▤', view: '◉', certs: '◆', ending: '🏁',
};

const SOURCE_REASONS: Record<TodayRecommendation['source'], string> = {
  onboarding: '첫 운영 안내',
  milestone: '성장 마일스톤',
  operation: '운영 점검',
  growth: '다음 성장',
  record: '새 운영 기록',
};

/** Today의 새 표현은 기존 추천 action/source만 번역하며 새 우선순위 규칙을 만들지 않는다. */
export function managementTodayPresentation(today: TodayRecommendation): ManagementTodayPresentation {
  return {
    icon: ACTION_ICONS[today.action],
    reason: SOURCE_REASONS[today.source],
    label: today.label,
    detail: today.detail,
  };
}

export function managementActionDetail(
  action: ManagementMenuAction,
  details: Partial<Record<ManagementAction, string>>,
): string | undefined {
  return details[action.id] ?? action.detail;
}

type StopEvent = Pick<Event, 'stopPropagation'>;

/** 일반 버튼과 Today 버튼이 공유하는 실행 경계. */
export function runManagementAction(
  action: ManagementMenuAction,
  event?: StopEvent,
): void {
  if (action.stayOpen) event?.stopPropagation();
  action.run();
}

/** Today 추천이 가리킨 실제 경영 행동을 찾는다. */
export function managementActionForToday(
  actions: readonly ManagementMenuAction[],
  today: TodayRecommendation,
): ManagementMenuAction | undefined {
  return actions.find((action) => action.id === today.action);
}

export interface ManagementMenuOptions {
  /**
   * 성장 목록 넷이 사는 노드 (`#kairo-quests`).
   *
   * ⚠ **DOM 에서 빼지 않는다.** 하네스가 시트가 닫힌 채로 이 노드의 textContent 를 읽는다
   * (`verify-kairo` 두 곳). 화면 전환은 `hidden` 으로만 하고 내용은 늘 채워 둔다 —
   * `textContent` 는 `hidden` 을 무시하므로 게이트가 그대로 산다.
   */
  listHost?: HTMLElement;
  /** 목록 화면의 빈 상태 버튼이 누를 곳 */
  onListAction?: (id: ManageListId) => void;
  /**
   * 목록의 한 행을 누르면 **삽화 사건 상자**가 뜬다 (카이로 문법).
   *
   * 목록은 훑는 곳이고 상세는 장면으로 읽는다 — 발견 · 수락 · 완료가 전부 같은 상자다.
   */
  onRowOpen?: (list: ManageListId, event: GrowthEvent) => void;
}

/**
 * 메뉴를 **짧은 L1 라우터**로 만든다 (IA 재설계 §4).
 *
 * ## 무엇이 바뀌었나
 *
 * 예전 메뉴는 한 스크롤에 34항목 1,893px 였다 (세로 5.2화면 · 가로 11.8화면). 그 안에서
 * 위계는 색과 글자 크기로만 표현됐고, `새 게임 시작` 은 전체 스크롤의 66% 지점에 있어
 * 바닥까지 내려가면 설정이 아니라 **인증 12행**이 나왔다.
 *
 * 이제 메뉴는 **인덱스 한 장**이다: 판 설정 · 오늘 할 일 · 경고 · 그리고 목적지 넷
 * (`운영`·`성장`·`기록`·`설정`). 여기서 끝나는 행동은 오늘 할 일 하나뿐이고, 나머지는
 * 전부 "어디로 갈지"만 고른다.
 *
 * ## 왜 새 패널이 아닌가
 *
 * `PanelHost` 의 "한 번에 하나"를 안 늘리려고, 화면 전환은 **시트 하나 안**에서 일어난다
 * (`register` 호출 수 0 증가). 머리는 `[‹ 뒤로] [제목] [N/M]` 한 줄이고 `닫기` 는 시트
 * 머리가 이미 갖고 있다.
 */
export class KairoManagementMenu {
  private readonly actionById: Map<ManagementAction, ManagementMenuAction>;
  private readonly actions: readonly ManagementMenuAction[];
  private readonly todayButton: HTMLButtonElement;
  private readonly warningBox: HTMLDivElement;
  private readonly contextLine: HTMLDivElement;
  private readonly detailById = new Map<ManagementAction, HTMLSpanElement>();
  private readonly routeDetailById = new Map<ManageRouteId, HTMLSpanElement>();
  private readonly goalBox: HTMLDivElement;
  private readonly goalSection: HTMLElement;
  private readonly settingDetails: { item: ManagementSettingsItem; node: HTMLSpanElement }[] = [];
  private readonly screens = new Map<ManageScreenId, HTMLElement>();
  private readonly listSections = new Map<ManageListId, HTMLElement>();
  private readonly listHost: HTMLElement | null;
  private readonly backBtn: HTMLButtonElement;
  private readonly titleEl: HTMLDivElement;
  private readonly countEl: HTMLDivElement;
  private readonly opts: ManagementMenuOptions;
  private current: ManageScreenId = 'index';
  private readonly versionLine: HTMLElement;
  private readonly headEl: HTMLDivElement;
  private lists = new Map<ManageListId, GrowthList>();

  constructor(
    host: HTMLElement,
    actions: readonly ManagementMenuAction[],
    private readonly read: () => ManagementMenuState,
    settings: readonly ManagementSettingsSection[] = [],
    opts: ManagementMenuOptions = {},
  ) {
    this.actions = actions;
    this.opts = opts;
    this.actionById = new Map(actions.map((action) => [action.id, action]));
    host.replaceChildren();
    host.className = 'kmanage';
    this.listHost = opts.listHost ?? null;
    this.versionLine = el('small', 'kcaption kmanage-version');
    this.versionLine.dataset['buildIdentity'] = '';

    // ── 머리: 뒤로 · 제목 · 개수 ─────────────────────────────────────────
    const head = el('div', 'kmanage-head');
    this.headEl = head;
    this.backBtn = el('button', 'kbtn kmanage-back', '‹ 뒤로') as HTMLButtonElement;
    this.backBtn.id = 'kairo-manage-back';
    this.backBtn.dataset['manageBack'] = '';
    this.backBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.back();
    });
    this.titleEl = el('div', 'kmanage-title', '메뉴');
    this.countEl = el('div', 'kmanage-count');
    head.append(this.backBtn, this.titleEl, this.countEl);

    // ── 인덱스 ───────────────────────────────────────────────────────────
    const index = el('section', 'kmanage-screen');
    index.dataset['manageScreen'] = 'index';
    this.contextLine = el('div', 'kmanage-context');
    const today = el('div', 'kmanage-today');
    today.append(el('div', 'kmanage-kicker', '오늘 할 일'));
    this.todayButton = el('button', 'kmanage-action primary') as HTMLButtonElement;
    today.append(this.todayButton);
    this.warningBox = el('div', 'kmanage-warnings');
    this.warningBox.setAttribute('aria-live', 'polite');
    const routes = el('div', 'kmanage-routes');
    for (const route of MANAGE_ROUTES) {
      routes.append(this.routeButton(route.id, route.label, route.hint));
    }
    index.append(this.contextLine, today, this.warningBox, routes);
    this.screens.set('index', index);

    // ── L2 넷 ────────────────────────────────────────────────────────────
    this.goalSection = el('div', 'kmanage-subgroup');
    this.goalSection.dataset['manageSub'] = 'goals';
    this.goalSection.append(el('h4', undefined, '목표'));
    this.goalBox = el('div', 'kmanage-goals');
    this.goalSection.append(this.goalBox);
    this.goalSection.hidden = true;

    for (const route of MANAGE_ROUTES) {
      const screen = el('section', 'kmanage-screen');
      screen.dataset['manageScreen'] = route.id;
      /*
       * `data-manage-group` 을 남긴다 — 이 목적지가 `MANAGEMENT_GROUPS` 의 어느 그룹인지
       * 계속 이름으로 읽혀야 한다 (게이트·접근성 둘 다).
       */
      screen.dataset['manageGroup'] = route.id;
      if (route.id === 'settings') {
        for (const section of settings) screen.append(this.settingsSection(section));
        screen.append(this.versionLine);
      } else {
        if (route.id === 'growth') screen.append(this.goalSection);
        const list = el('div', 'kmanage-list');
        for (const action of actionsForRoute(route.id, actions)) {
          // 의뢰·단골·인증은 바로 아래 전용 목록 라우터가 유일한 입구다.
          if (route.id === 'growth' && ['quests', 'regular', 'certs'].includes(action.id)) continue;
          list.append(this.actionButton(action));
        }
        screen.append(list);
        if (route.id === 'growth') screen.append(this.growthRoutes());
      }
      this.screens.set(route.id, screen);
    }

    // ── L3 목록 넷 ───────────────────────────────────────────────────────
    for (const list of MANAGE_LISTS) {
      const screen = el('section', 'kmanage-screen kmanage-listscreen');
      screen.dataset['manageScreen'] = list.id;
      this.screens.set(list.id, screen);
    }

    const body = el('div', 'kmanage-body');
    for (const screen of this.screens.values()) body.append(screen);
    /*
     * 목록 호스트(`#kairo-quests`)는 **한 곳에만** 산다 — 화면마다 옮기면 id 가 순간
     * 사라지고 하네스가 그 프레임을 읽으면 조용히 실패한다. 대신 목록 화면이 열릴 때
     * 이 노드를 보이게만 한다.
     */
    if (this.listHost) {
      this.listHost.classList.add('kgrowth');
      for (const list of MANAGE_LISTS) {
        const section = el('section', 'kgrowth-section');
        section.dataset['growthList'] = list.id;
        section.hidden = true;
        this.listSections.set(list.id, section);
        this.listHost.append(section);
      }
      body.append(this.listHost);
    }

    host.append(head, body);
    this.show('index');
  }

  private routeButton(id: ManageRouteId, label: string, hint: string): HTMLButtonElement {
    const button = el('button', 'kmanage-action kmanage-route') as HTMLButtonElement;
    button.dataset['manageRoute'] = id;
    button.id = `kairo-manage-${id}`;
    button.append(el('span', 'kmanage-label', label));
    const detail = el('span', 'kmanage-detail', hint) as HTMLSpanElement;
    this.routeDetailById.set(id, detail);
    button.append(detail, el('span', 'kmanage-chev', '〉'));
    button.setAttribute('aria-label', `${label}, ${hint}`);
    button.addEventListener('click', (event) => {
      // 라우터는 시트 안에서 화면만 바꾼다 — 시트를 닫으면 목적지가 사라진다
      event.stopPropagation();
      this.show(id);
    });
    return button;
  }

  /** `성장` 아래 목록 넷으로 가는 줄. 여기가 의뢰·소원·인증·단골의 유일한 입구다 */
  private growthRoutes(): HTMLElement {
    const box = el('div', 'kmanage-subgroup');
    box.dataset['manageSub'] = 'lists';
    box.append(el('h4', undefined, '진행 목록'));
    const list = el('div', 'kmanage-list');
    for (const item of MANAGE_LISTS) {
      const button = el('button', 'kmanage-action kmanage-route') as HTMLButtonElement;
      button.dataset['manageRoute'] = item.id;
      button.id = `kairo-manage-${item.id}`;
      button.append(el('span', 'kmanage-label', item.label));
      const detail = el('span', 'kmanage-detail', '') as HTMLSpanElement;
      button.append(detail, el('span', 'kmanage-chev', '〉'));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.show(item.id);
      });
      this.listRouteDetails.set(item.id, { button, detail, label: item.label });
      list.append(button);
    }
    box.append(list);
    return box;
  }

  private readonly listRouteDetails = new Map<
    ManageListId,
    { button: HTMLButtonElement; detail: HTMLSpanElement; label: string }
  >();

  private settingsSection(section: ManagementSettingsSection): HTMLElement {
    const sub = el('div', 'kmanage-subgroup');
    sub.dataset['manageSub'] = section.id;
    sub.append(el('h4', undefined, section.label));
    const list = el('div', 'kmanage-list');
    for (const item of section.items) list.append(this.settingButton(item));
    sub.append(list);
    return sub;
  }

  private settingButton(item: ManagementSettingsItem): HTMLButtonElement {
    const view = settingsItemView(item);
    const button = el(
      'button',
      `kmanage-action${view.destructive ? ' danger' : ''}`,
    ) as HTMLButtonElement;
    if (item.domId) button.id = item.domId;
    button.dataset['settingsAction'] = item.id;
    button.append(el('span', 'kmanage-label', view.label));
    const detail = el('span', 'kmanage-detail', view.detail) as HTMLSpanElement;
    this.settingDetails.push({ item, node: detail });
    button.append(detail);
    button.setAttribute('aria-label', `${view.label}, ${view.detail}`);
    if (item.disabled) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }
    button.addEventListener('click', (event) => {
      // 설정은 시트 안에서 끝나거나(배속) 자기 화면을 연다(새 게임) — 시트를 닫지 않는다
      event.stopPropagation();
      item.run();
    });
    return button;
  }

  /**
   * 홈에서 뺀 중·장기 목표를 그린다.
   *
   * 새 저장소를 만들지 않는다 — `main.ts` 가 이미 파생한 `GoalChip` 을 그대로 받는다.
   */
  setGoals(chips: readonly GoalChip[]): void {
    const rows = managementGoalRows(chips);
    this.goalBox.replaceChildren();
    this.goalSection.hidden = rows.length === 0;
    for (const row of rows) {
      const button = el('button', 'kmanage-action kmanage-goal') as HTMLButtonElement;
      button.dataset['goalRole'] = row.role;
      const head = el('span', 'kmanage-goal-head');
      head.append(
        el('span', 'kmanage-goal-term', row.term),
        el('span', 'kmanage-label', row.label),
      );
      button.append(head, el('span', 'kmanage-detail', row.detail));
      const bar = el('span', 'kprog');
      const fill = document.createElement('i');
      // 폭은 데이터라 인라인으로 남는다 (색은 `style.css` 가 소유한다)
      fill.style.width = `${row.percent}%`;
      bar.append(fill);
      button.append(bar);
      button.setAttribute('aria-label', `${row.term} 목표, ${row.label}, ${row.percent}%`);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        row.run();
      });
      this.goalBox.append(button);
    }
  }

  private actionButton(action: ManagementMenuAction): HTMLButtonElement {
    const button = el('button', 'kmanage-action') as HTMLButtonElement;
    if (action.domId) button.id = action.domId;
    button.dataset['manageAction'] = action.id;
    button.append(el('span', 'kmanage-label', action.label));
    const detail = el('span', 'kmanage-detail', action.detail ?? '') as HTMLSpanElement;
    this.detailById.set(action.id, detail);
    button.append(detail);
    button.addEventListener('click', (event) => {
      runManagementAction(action, event);
    });
    return button;
  }

  /** 지금 화면 — 하네스와 `main` 이 읽는다 */
  get screen(): ManageScreenId {
    return this.current;
  }

  /**
   * 화면을 바꾼다. **패널이 아니라 시트 안의 화면**이므로 `PanelHost` 는 안 부른다.
   */
  show(id: ManageScreenId): void {
    const def = manageScreen(id);
    this.current = def.id;
    for (const [screenId, node] of this.screens) node.hidden = screenId !== def.id;
    const list = MANAGE_LISTS.find((item) => item.id === def.id);
    if (this.listHost) {
      this.listHost.hidden = list === undefined;
      for (const [sectionId, node] of this.listSections) node.hidden = sectionId !== def.id;
    }
    /*
     * 인덱스에서는 **머리를 안 그린다** — 시트 머리가 이미 `메뉴` + `닫기` 를 갖고 있고
     * 뒤로도 없다. 두 머리를 겹치면 가로(852×393)에서 244px 시트의 **118px** 이 머리가
     * 되어 본문이 116px 만 남는다 (실측). 목적지로 들어가야 `‹ 뒤로 · 제목` 이 필요하다.
     */
    this.headEl.hidden = def.id === 'index';
    this.backBtn.hidden = def.back === null;
    this.titleEl.textContent = def.title;
    this.countEl.textContent = list ? (this.lists.get(list.id)?.count ?? '') : '';
    this.countEl.hidden = this.countEl.textContent === '';
    /*
     * 화면을 바꾸면 **본문 스크롤을 처음으로** 되돌린다. 안 그러면 앞 화면에서 내려간
     * 위치가 남아 새 화면이 중간부터 보인다 — 옛 메뉴가 `scrollIntoView` 로 1,000px 를
     * 튀던 그 느낌이 그대로 재현된다.
     */
    const body = this.screens.get(def.id)?.parentElement;
    if (body) body.scrollTop = 0;
  }

  /** `‹ 뒤로` — 한 단계만 돌아간다. `닫기`(시트 머리)는 언제나 홈으로 간다 */
  back(): void {
    const def = manageScreen(this.current);
    if (def.back) this.show(def.back);
  }

  /** 시트를 다시 열 때 인덱스로 되돌린다 — 목적지에서 시작하면 "어디였지"가 된다 */
  reset(): void {
    this.show('index');
  }

  /**
   * 빌드 정체 한 줄 — **설정 화면 안**에 산다.
   *
   * 인덱스 아래에 두면 플레이어가 매번 커밋 SHA 를 본다 (UX 감사 P2-27). 하네스가 읽는
   * `data-build-identity` 손잡이는 그대로 남는다.
   */
  setVersionLine(text: string): void {
    this.versionLine.textContent = text;
  }

  /**
   * 성장 목록 넷을 그린다.
   *
   * ⚠ **화면에 안 보여도 그린다.** 하네스가 닫힌 시트에서 `#kairo-quests` 의 textContent 를
   * 읽으므로, "보일 때만 그린다"로 바꾸면 그 게이트가 조용히 빈 문자열을 읽는다.
   */
  setLists(lists: readonly GrowthList[]): void {
    for (const list of lists) {
      this.lists.set(list.id, list);
      const section = this.listSections.get(list.id);
      if (!section) continue;
      section.replaceChildren();
      const head = el('div', 'kgrowth-head');
      head.id = LIST_HEAD_ID[list.id];
      head.textContent = list.id === 'quests' ? '달성 여부와 보상 시점' : `${list.title} 진행 상황`;
      section.append(head);
      if (list.rows.length === 0) {
        section.append(this.emptyBlock(list));
      } else {
        for (const row of list.rows) {
          section.append(
            growthRowNode(row, () => this.opts.onRowOpen?.(list.id, row.event)),
          );
        }
      }
      const route = this.listRouteDetails.get(list.id);
      if (route) {
        route.detail.textContent = list.rows.length === 0 ? list.empty.fact : list.count;
        route.button.setAttribute('aria-label', `${route.label}, ${route.detail.textContent}`);
      }
    }
    if (this.current in LIST_HEAD_ID) {
      this.countEl.textContent = this.lists.get(this.current as ManageListId)?.count ?? '';
      this.countEl.hidden = this.countEl.textContent === '';
    }
  }

  /**
   * 빈 상태 — **사실 한 줄 + 방법 한 줄 + (막다른 길이 아니면) 버튼**.
   *
   * `없음` 한 단어나 빈 상자를 내지 않는다 (§8.1 규격). 결산 처방·건설 카드·심사가
   * 이미 "이유 + 방법"을 쓰고 있었고, 이 규칙을 전역화하는 것뿐이다.
   */
  private emptyBlock(list: GrowthList): HTMLElement {
    const box = el('div', 'kgrowth-empty');
    box.dataset['emptyFor'] = list.id;
    box.append(
      el('div', 'kgrowth-empty-fact', list.empty.fact),
      el('div', 'kgrowth-empty-how', list.empty.how),
    );
    if (list.empty.actionLabel) {
      const button = el('button', 'kbtn', list.empty.actionLabel) as HTMLButtonElement;
      button.dataset['emptyAction'] = list.id;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.opts.onListAction?.(list.id);
      });
      box.append(button);
    }
    return box;
  }

  refresh(): void {
    const state = this.read();
    const action = managementActionForToday(this.actions, state.today);
    const today = managementTodayPresentation(state.today);
    this.contextLine.textContent = state.context ?? '';
    this.contextLine.hidden = this.contextLine.textContent === '';
    this.todayButton.replaceChildren(
      el('span', 'kmanage-today-icon', today.icon),
      el('span', 'kmanage-today-copy'),
    );
    const copy = this.todayButton.lastElementChild as HTMLSpanElement;
    copy.append(
      el('span', 'kmanage-reason', today.reason),
      el('span', 'kmanage-label', today.label),
      el('span', 'kmanage-detail', today.detail),
    );
    this.todayButton.dataset['manageAction'] = state.today.action;
    this.todayButton.setAttribute('aria-label', `오늘 할 일, ${today.label}, ${today.detail}`);
    this.todayButton.onclick = (event) => {
      if (action) runManagementAction(action, event);
    };
    for (const item of this.actionById.values()) {
      const detail = this.detailById.get(item.id);
      if (detail) detail.textContent = managementActionDetail(item, state.details ?? {}) ?? '';
    }
    for (const [id, node] of this.routeDetailById) {
      const text = state.routeDetails?.[id];
      if (text) node.textContent = text;
    }
    for (const entry of this.settingDetails) {
      entry.node.textContent = settingsItemView(entry.item).detail;
    }
    this.warningBox.replaceChildren(
      ...state.warnings.map((warning) => el('div', 'kmanage-warning', `⚠ ${warning}`)),
    );
    this.warningBox.hidden = state.warnings.length === 0;
  }
}

/**
 * 옛 앵커 id 를 **그대로** 옮긴다.
 *
 * ⚠ `kairo-regular-list` 는 예전에 **소원** 머리였다 (버튼 이름은 `단골` 인데 목적지가
 * `소원` 이라 낱말이 갈렸다 — UX 감사 P0-2). 이제 이름과 목적지가 맞고, 소원은 자기
 * 머리(`kairo-wish-list`)를 갖는다. 두 머리 다 **언제나 존재한다** — 예전에는 소원이
 * 있을 때만 만들어져서 `단골` 버튼이 조용한 no-op 이었다.
 */
const LIST_HEAD_ID: Record<ManageListId, string> = {
  quests: 'kairo-quests-list',
  wishes: 'kairo-wish-list',
  certs: 'kairo-cert-list',
  regulars: 'kairo-regular-list',
};

/**
 * 목록 한 행. 네 목록이 같은 모양을 쓴다 — 새 표면을 만들지 않는다.
 *
 * ⚠ `<button>` 이다 — 44px 타깃·키보드·`aria` 를 공짜로 얻고, 하네스의
 * `button, select, input, [role="button"]` 감사에도 자동으로 들어간다.
 */
function growthRowNode(row: GrowthRow, onOpen: () => void): HTMLElement {
  const node = el('button', `kgrowth-row${row.done ? ' done' : ''}`) as HTMLButtonElement;
  node.dataset['growthRow'] = row.id;
  node.setAttribute('aria-label', `${row.name}, ${row.percent}%`);
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen();
  });
  const head = el('div', 'kgrowth-row-head');
  head.append(el('span', 'kgrowth-icon', row.icon), el('span', 'kgrowth-name', row.name));
  node.append(head);
  const bar = el('div', row.done ? 'kprog done' : 'kprog');
  const fill = document.createElement('i');
  // 폭은 **데이터**다 — 색은 클래스가 갖는다 (K34)
  fill.style.width = `${row.percent}%`;
  bar.append(fill);
  node.append(bar);
  for (const line of row.lines) node.append(el('div', 'kgrowth-line', line));
  if (row.reward) node.append(el('div', 'kgrowth-reward', row.reward));
  return node;
}

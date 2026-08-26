import { MANAGEMENT_GROUPS, type ManagementAction, type TodayRecommendation } from '../sim/kairo/meta.js';
import { el } from './dom.js';

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

/** 메뉴의 평면 버튼 격자를 Today → 보조 경고 → 운영/성장/기록으로 재조립한다. */
export class KairoManagementMenu {
  private readonly actionById: Map<ManagementAction, ManagementMenuAction>;
  private readonly todayButton: HTMLButtonElement;
  private readonly warningBox: HTMLDivElement;
  private readonly detailById = new Map<ManagementAction, HTMLSpanElement>();

  constructor(
    host: HTMLElement,
    actions: readonly ManagementMenuAction[],
    private readonly read: () => ManagementMenuState,
  ) {
    this.actionById = new Map(actions.map((action) => [action.id, action]));
    host.replaceChildren();
    host.className = 'kmanage';

    const today = el('div', 'kmanage-today');
    today.append(el('div', 'kmanage-kicker', 'Today'));
    this.todayButton = el('button', 'kmanage-action primary') as HTMLButtonElement;
    today.append(this.todayButton);

    this.warningBox = el('div', 'kmanage-warnings');
    this.warningBox.setAttribute('aria-live', 'polite');

    const groups = el('div', 'kmanage-groups');
    for (const definition of MANAGEMENT_GROUPS) {
      const group = el('section', 'kmanage-group');
      group.dataset['manageGroup'] = definition.id;
      group.append(el('h3', undefined, definition.label));
      const grid = el('div', 'kmanage-grid');
      for (const id of definition.items) {
        const action = this.actionById.get(id);
        if (!action) continue;
        grid.append(this.actionButton(action));
      }
      group.append(grid);
      groups.append(group);
    }
    host.append(today, this.warningBox, groups);
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

  refresh(): void {
    const state = this.read();
    const action = managementActionForToday([...this.actionById.values()], state.today);
    const today = managementTodayPresentation(state.today);
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
    this.todayButton.onclick = (event) => {
      if (action) runManagementAction(action, event);
    };
    for (const item of this.actionById.values()) {
      const detail = this.detailById.get(item.id);
      if (detail) detail.textContent = managementActionDetail(item, state.details ?? {}) ?? '';
    }
    this.warningBox.replaceChildren(
      ...state.warnings.map((warning) => el('div', 'kmanage-warning', `⚠ ${warning}`)),
    );
    this.warningBox.hidden = state.warnings.length === 0;
  }
}

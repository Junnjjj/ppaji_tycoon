import type { EndingMilestone } from '../sim/kairo/meta.js';
import { el } from './dom.js';
import { panelHost } from './panels.js';

export const ENDING_CHOICES = ['continue', 'new-region', 'view'] as const;

export interface EndingViewState {
  milestone: EndingMilestone;
  grade: number;
  certs: number;
  title: string;
}

export interface EndingActions {
  continue: () => void;
  newRegion: () => void;
  view: () => void;
}

export interface EndingChoiceAction {
  id: (typeof ENDING_CHOICES)[number];
  label: string;
  run: () => void;
}

/** 기록 시트와 첫 엔딩 축하 모달이 공유하는 세 갈래. */
export function endingChoiceActions(actions: EndingActions): EndingChoiceAction[] {
  return [
    { id: 'continue', label: '계속 운영', run: actions.continue },
    { id: 'new-region', label: '새 지역', run: actions.newRegion },
    { id: 'view', label: '리조트 감상', run: actions.view },
  ];
}

/** 첫 엔딩 마일스톤과 이후 세 갈래를 보여 주는 기록 시트. */
export class KairoEndingPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly actions: EndingActions) {
    this.root = el('div', 'ksheet kending');
    this.root.id = 'kairo-ending';
    this.root.hidden = true;
    const head = el('div', 'ksheet-head');
    head.append(el('div', 'ksheet-title', '엔딩 기록'));
    const close = el('button', 'kbtn', '닫기');
    close.id = 'kairo-ending-close';
    close.addEventListener('click', () => this.hide());
    head.append(close);
    this.body = el('div', 'ksheet-body kstack');
    this.root.append(head, this.body);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(state: EndingViewState): void {
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
    const milestone = state.milestone;
    const title = el('div', milestone.ready ? 'kending-title won' : 'kending-title');
    title.textContent = milestone.ready ? state.title : '첫 엔딩까지';
    const requirements = el('div', 'kstack compact');
    requirements.append(
      el('div', milestone.gradeReady ? 'done' : undefined, `${milestone.gradeReady ? '✓' : '·'} 5등급 (현재 ${state.grade})`),
      el('div', milestone.certReady ? 'done' : undefined, `${milestone.certReady ? '✓' : '·'} 인증 6종 (현재 ${state.certs})`),
      el('div', milestone.scenarioReady ? 'done' : 'warn', `${milestone.scenarioReady ? '✓' : '·'} 시나리오 비실패`),
    );
    const progress = el('div', 'kprog');
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(milestone.progress * 100)}%`;
    progress.append(fill);
    this.body.replaceChildren(title, requirements, progress);
    if (!milestone.ready) return;

    const choices = el('div', 'kending-choices');
    for (const { id, label, run } of endingChoiceActions(this.actions)) {
      const button = el('button', 'kbtn');
      button.dataset['endingChoice'] = id;
      button.textContent = label;
      button.addEventListener('click', run);
      choices.append(button);
    }
    this.body.append(choices);
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }
}

/**
 * 창 — 흰 몸통 + 파란 틀 + 타일 무늬 제목 띠 + 우상단 닫기 (D70 원작 문법). 톤은 둘(D67): blue(기본) · gold(결산·축하·심사 결과).
 * 자리는 늘 같다(D67) — 내용이 짧으면 높이만 준다. 옛 `kfit`(짧은 창을 가운데로)는 폐기.
 * `PanelHost` 를 거치므로 한 번에 하나, 열리면 소유권이 `window` 로 넘어가 홈 입력층이 내려간다.
 */
import { el } from './dom.js';
import { iconEl } from './icons.js';
import { panelHost, setUiSurface, type Panel } from './panels.js';

export class WindowPanel implements Panel {
  readonly root: HTMLDivElement;
  readonly body: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly scrim: HTMLDivElement;
  onClose?: () => void;

  constructor(parent: HTMLElement, id: string, title: string, tone: 'blue' | 'gold' = 'blue', opts?: { modal?: boolean }) {
    this.scrim = el('div', 'kscrim');
    this.scrim.hidden = true;
    this.scrim.addEventListener('click', () => this.hide());
    this.root = el('div', `kwin ${tone}`);
    this.root.id = id;
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', `${id}-title`);
    const head = el('div', 'kwin-head');
    this.titleEl = el('div', 'kwin-title', title);
    this.titleEl.id = `${id}-title`;
    const close = el('button', 'kwin-close');
    close.type = 'button';
    close.setAttribute('aria-label', '닫기');
    close.append(iconEl('close'));
    close.addEventListener('click', () => this.hide());
    head.append(this.titleEl, close);
    this.body = el('div', 'kwin-body');
    this.root.append(head, this.body);
    parent.append(this.scrim, this.root);
    panelHost.register(this, opts?.modal ? { modal: true } : {});
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  setTitle(t: string): void {
    this.titleEl.textContent = t;
  }

  show(): boolean {
    if (!panelHost.open(this)) return false;
    this.root.hidden = false;
    this.scrim.hidden = false;
    setUiSurface('window');
    return true;
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.scrim.hidden = true;
    panelHost.closed(this);
    if (!panelHost.anyOpen) setUiSurface('home');
    this.onClose?.();
  }
}

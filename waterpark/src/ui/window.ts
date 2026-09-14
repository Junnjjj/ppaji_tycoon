/**
 * 창 — 크림 몸통 + 제목 띠(보라/파랑) + 우상단 닫기. PSS 의 창 문법 하나로 모든 화면이 선다.
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
  private fitObserver: MutationObserver | null = null;

  constructor(parent: HTMLElement, id: string, title: string, tone: 'purple' | 'blue' | 'pink' | 'green' | 'gold' = 'blue', opts?: { modal?: boolean }) {
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
    this.fit();
    requestAnimationFrame(() => { if (!this.root.hidden) this.fit(); });
    // 내용이 show() 뒤에 채워지는 창(건설·SNS…)도 다음 프레임에 다시 잰다
    if (!this.fitObserver) { this.fitObserver = new MutationObserver(() => { if (!this.root.hidden) requestAnimationFrame(() => { if (!this.root.hidden) this.fit(); }); }); this.fitObserver.observe(this.body, { childList: true, subtree: true }); }
    return true;
  }

  /** G54 — 내용이 짧은 창은 위에 붙이지 않고 가운데에 (카이로 창은 내용 크기다). `kcompact`/`kdialog` 는 제 자리 규칙이 있다 */
  private fit(): void {
    if (this.root.classList.contains('kcompact') || this.root.classList.contains('kdialog')) return;
    this.root.classList.remove('kfit');
    const h = this.root.getBoundingClientRect().height;
    const avail = window.innerHeight - 140;
    if (h > 0 && h < avail * 0.55) this.root.classList.add('kfit');
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

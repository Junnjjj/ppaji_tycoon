import { el } from './dom.js';
import { portraitEl } from './portraits.js'; // P56-b2: 스토리 인물은 그림 초상(없으면 코드 초상)

/**
 * 대사 Strip (G16) — 바닥 흰 대사 띠 + 초상 + 화자 이름. 카이로 문법의 「인물이 말을 건다」.
 * 큐로 받아 한 대사씩, 탭하면 다음 줄. 모달이 아니다 — 지도·HUD 는 그대로 눌린다 (팝업 과다 대응).
 * 창(`data-ui-surface` ≠ home)이 열리면 CSS 가 숨긴다.
 */
export const TUT_KEY = 'pj.tut';

export interface Speech {
  speakerId: string;
  name: string;
  palette: number;
  hair: number;
  lines: readonly string[];
}

export class DialogueStrip {
  readonly root: HTMLDivElement;
  private readonly portrait = el('span', 'kportrait');
  private readonly who = el('span', 'ktut-name', '');
  private readonly text = el('span', 'ktut-text', '');
  private readonly hint = el('span', 'ktut-hint', '탭');
  private queue: Speech[] = [];
  private cur: Speech | null = null;
  private at = 0;

  constructor(parent: HTMLElement, private readonly onDone?: () => void) {
    this.root = el('div', 'ktut');
    this.root.id = 'tut-strip';
    this.root.setAttribute('role', 'button');
    this.root.setAttribute('aria-label', '대사 다음');
    this.root.tabIndex = 0;
    this.root.classList.add('khide');
    const body = el('span', 'ktut-body');
    body.append(this.who, this.text);
    this.root.append(this.portrait, body, this.hint);
    this.root.addEventListener('click', () => this.next());
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains('khide');
  }

  /** 큐에 넣고, 아무것도 안 떠 있으면 바로 띄운다 */
  enqueue(sp: Speech): void {
    if (sp.lines.length === 0) return;
    this.queue.push(sp);
    if (!this.cur) this.advance();
  }

  /** 옛 API — 이름 없는 화자 */
  start(lines: readonly string[]): void {
    this.enqueue({ speakerId: 'president', name: '', palette: 5, hair: 2, lines });
  }

  next(): void {
    if (!this.cur) return;
    this.at++;
    if (this.at >= this.cur.lines.length) { this.advance(); return; }
    this.render();
  }

  private advance(): void {
    this.cur = this.queue.shift() ?? null;
    this.at = 0;
    if (!this.cur) { this.finish(); return; }
    this.portrait.replaceChildren(portraitEl(this.cur.speakerId, 'happy', { palette: this.cur.palette, hair: this.cur.hair }));
    this.who.textContent = this.cur.name;
    this.root.classList.remove('khide');
    this.render();
  }

  private render(): void {
    if (!this.cur) return;
    this.text.textContent = this.cur.lines[this.at] ?? '';
    const last = this.at === this.cur.lines.length - 1 && this.queue.length === 0;
    this.hint.textContent = last ? '닫기' : `${this.at + 1}/${this.cur.lines.length} 탭`;
  }

  finish(): void {
    this.root.classList.add('khide');
    this.cur = null;
    try { localStorage.setItem(TUT_KEY, '1'); } catch { /* 저장 불가 환경 */ }
    this.onDone?.();
  }

  static seen(): boolean {
    try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; }
  }
}
export { DialogueStrip as TutorialStrip };

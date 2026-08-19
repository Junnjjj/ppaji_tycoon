/**
 * 해금 셀레브레이션 (K41, 스펙 §3.6) — **큰 사건은 모달로 축하한다.**
 *
 * 카이로는 해금·승급을 모달 + 이펙트로 띄운다. 우리 두 급 규칙:
 * 모달 급 = 시설 해금 · 등급 승급 · (K43) 인물 등장 · 숨은 콤보. 진척류는 토스트 급.
 *
 * 판정은 주 경계 tick 에서 나고(결정론), **연출은 다음 날 아침에 도착한다** (A6) —
 * 도착 큐는 main 이 들고 흐름이 아침에 닿으면 하나씩 띄운다. 모달이라 뜨는 동안
 * 시간이 멈춘다 (PanelHost 규칙 그대로).
 *
 * 표면은 카드와 같은 `.kover.dialog` — 새 패널 표면을 만들지 않는다 (표면 셋 규칙).
 * 반짝임은 CSS `.fx-pop` (transform/opacity 만, reduced-motion 가드).
 */
import { el } from './dom.js';
import { panelHost, type Panel } from './panels.js';
import { audio } from '../audio/index.js';

export interface Celebration {
  /** '새 시설 해금!' · 'N등급 승급!' 같은 머리 */
  title: string;
  /** 시설·등급 이름 */
  name: string;
  /** 어디서 왔나 — '의뢰 「먹거리를 갖추자」 보상' */
  sub?: string;
  /** 썸네일용 계약 ID */
  sprite?: string;
}

export interface UnlockViewOptions {
  thumbFor?: (spriteId: string) => HTMLCanvasElement | null;
  /** 닫힌 뒤 — main 이 다음 도착분을 이어서 띄운다 */
  onClose?: () => void;
}

export class KairoUnlockView implements Panel {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly thumbEl: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly opts: UnlockViewOptions;

  constructor(parent: HTMLElement, opts: UnlockViewOptions) {
    this.opts = opts;
    this.root = el('div', 'kover dialog');
    this.root.id = 'kairo-unlock';
    this.root.hidden = true;

    const box = el('div', 'kdialog-box kunlock');
    this.titleEl = el('div', 'kunlock-title');
    this.thumbEl = el('div', 'kunlock-thumb fx-pop');
    this.nameEl = el('div', 'kunlock-name');
    this.subEl = el('div', 'kcaption');
    const ok = el('button', 'kbtn primary', '좋아!');
    ok.id = 'kairo-unlock-close';
    ok.addEventListener('click', () => {
      this.hide();
      this.opts.onClose?.();
    });
    box.append(this.titleEl, this.thumbEl, this.nameEl, this.subEl, ok);
    this.root.append(box);
    parent.append(this.root);

    // 카드와 같은 모달 — 선택(확인) 전에 밀려나면 도착이 조용히 증발한다
    panelHost.register(this, { modal: true });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(c: Celebration): void {
    if (!panelHost.open(this)) return; // 다른 모달(카드)이 떠 있으면 다음 아침에 다시 온다
    this.titleEl.textContent = c.title;
    this.nameEl.textContent = c.name;
    this.subEl.textContent = c.sub ?? '';
    this.thumbEl.replaceChildren();
    const src = c.sprite !== undefined ? (this.opts.thumbFor?.(c.sprite) ?? null) : null;
    if (src) {
      const cv = document.createElement('canvas');
      cv.width = src.width;
      cv.height = src.height;
      cv.getContext('2d')?.drawImage(src, 0, 0);
      this.thumbEl.append(cv);
    } else {
      this.thumbEl.textContent = '🎁';
    }
    // 반짝 재시작 — 클래스를 뗐다 붙여야 애니메이션이 다시 돈다
    this.thumbEl.classList.remove('fx-pop');
    void this.thumbEl.offsetWidth;
    this.thumbEl.classList.add('fx-pop');
    this.root.hidden = false;
    audio.play('sfx/unlock');
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }
}

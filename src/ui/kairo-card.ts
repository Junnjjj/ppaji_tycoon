import type { CardDef, CardOption } from '../sim/kairo/cards.js';
import { optionCash } from '../sim/kairo/cards.js';

/**
 * 주간 의사결정 카드 화면 — 스펙 §A (S11).
 *
 * ## 왜 전면인가
 *
 * 스펙이 정한 것: **전면 카드, 선택지는 전폭 버튼 2~3개, 각 56px.** 폰에서 오독이 없어야
 * 하고, 5초 안에 읽고 고를 분량이어야 한다. 작은 팝업으로 띄우면 스크롤 중에 잘못 눌린다.
 *
 * ## 여러 장이면 한 장씩
 *
 * 동시에 안 띄운다 (스펙). 두 장을 나란히 놓으면 둘을 비교하게 되는데, 카드는 서로 무관한
 * 사건이라 비교할 것이 없다. 한 장 고르면 다음 장.
 *
 * ## 왜 DOM 인가
 *
 * `ui/` 결정 그대로 — 에셋 0장, 선명, 다크모드 공짜, 폰 텍스트 크기 정책을 따른다.
 */

function won(n: number): string {
  const v = Math.abs(Math.round(n));
  if (v >= 10000) return `${n < 0 ? '−' : '+'}${Math.round(v / 10000)}만`;
  return `${n < 0 ? '−' : '+'}${v}`;
}

export interface CardChoice {
  card: CardDef;
  optionIndex: number;
}

export class KairoCardView {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly descEl: HTMLDivElement;
  private readonly countEl: HTMLDivElement;
  private readonly optionsEl: HTMLDivElement;
  private queue: CardDef[] = [];
  private index = 0;
  private onDone: ((choices: CardChoice[]) => void) | null = null;
  private choices: CardChoice[] = [];
  /** 현금이 모자란 선택지를 회색으로 — 얼마나 있는지는 호출자가 안다 */
  private cash = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'kairo-card';
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;' +
      'background:rgba(6,14,20,.86);padding:16px;font:14px/1.5 system-ui,sans-serif;color:#e8f4ff';

    const box = document.createElement('div');
    box.style.cssText =
      'width:100%;max-width:420px;background:#12212c;border:1px solid #2b4658;border-radius:14px;' +
      'padding:18px 16px;box-shadow:0 12px 40px rgba(0,0,0,.5)';

    this.countEl = document.createElement('div');
    this.countEl.style.cssText = 'font-size:11px;color:#7fa8c4;margin-bottom:6px';

    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = 'font-size:19px;font-weight:700;margin-bottom:8px';

    this.descEl = document.createElement('div');
    this.descEl.style.cssText = 'font-size:14px;color:#c2d8e6;margin-bottom:16px';

    this.optionsEl = document.createElement('div');
    this.optionsEl.style.cssText = 'display:flex;flex-direction:column;gap:10px';

    box.append(this.countEl, this.titleEl, this.descEl, this.optionsEl);
    this.root.append(box);
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  /** 남은 카드 수 — 검증 도구가 진행 상태를 본다 */
  get remaining(): number {
    return Math.max(0, this.queue.length - this.index);
  }

  show(cards: CardDef[], cash: number, onDone: (choices: CardChoice[]) => void): void {
    if (cards.length === 0) {
      onDone([]);
      return;
    }
    this.queue = cards;
    this.index = 0;
    this.cash = cash;
    this.choices = [];
    this.onDone = onDone;
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(): void {
    const card = this.queue[this.index];
    if (!card) return;
    this.countEl.textContent =
      this.queue.length > 1 ? `이번 주 결정 ${this.index + 1} / ${this.queue.length}` : '이번 주 결정';
    this.titleEl.textContent = card.name;
    this.descEl.textContent = card.desc;
    this.optionsEl.replaceChildren();

    card.options.forEach((opt, oi) => {
      const cash = optionCash(opt);
      const tooPoor = cash < 0 && -cash > this.cash;
      const btn = document.createElement('button');
      // ★ 56px — 스펙이 정한 최소 터치 타깃. 이보다 작으면 폰에서 오독이 난다
      btn.style.cssText =
        'min-height:56px;width:100%;border-radius:10px;border:1px solid #35617e;text-align:left;' +
        `padding:9px 12px;background:${tooPoor ? '#1a2731' : '#1d3b4e'};` +
        `color:${tooPoor ? '#6b8296' : '#eaf6ff'};font:inherit;` +
        (tooPoor ? 'cursor:not-allowed' : 'cursor:pointer');
      btn.disabled = tooPoor;
      btn.dataset['option'] = String(oi);

      const label = document.createElement('div');
      label.style.cssText = 'font-size:15px;font-weight:600';
      label.textContent = opt.label + (cash !== 0 ? ` (${won(cash)})` : '');

      const detail = document.createElement('div');
      detail.style.cssText = 'font-size:12px;color:#9dbdd2;margin-top:2px';
      detail.textContent = tooPoor ? `${opt.detail} — 현금이 부족합니다` : opt.detail;

      btn.append(label, detail);
      btn.addEventListener('click', () => this.pick(card, oi));
      this.optionsEl.append(btn);
    });
  }

  private pick(card: CardDef, optionIndex: number): void {
    this.choices.push({ card, optionIndex });
    this.index += 1;
    if (this.index >= this.queue.length) {
      this.hide();
      const done = this.onDone;
      this.onDone = null;
      done?.(this.choices);
      return;
    }
    this.render();
  }

  /**
   * 도구용 — 화면을 거치지 않고 고른다. 검증 하네스가 카드 흐름을 통과할 때 쓴다.
   * 사람이 쓰는 경로와 **같은 `pick`** 을 태운다 (다른 경로면 검증이 다른 걸 재게 된다).
   */
  pickForTest(optionIndex: number): boolean {
    const card = this.queue[this.index];
    if (!card || !this.visible) return false;
    const opt = card.options[optionIndex] as CardOption | undefined;
    if (!opt) return false;
    this.pick(card, optionIndex);
    return true;
  }
}

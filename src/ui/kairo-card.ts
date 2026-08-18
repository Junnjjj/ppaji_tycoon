import { el } from './dom.js';
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
    this.root = el('div', 'kover dialog');
    this.root.id = 'kairo-card';
    this.root.hidden = true;

    const box = el('div', 'kdialog-box');
    this.countEl = el('div', 'kcaption');
    this.titleEl = el('div', 'kcard-title');
    this.descEl = el('div', 'kcard-desc');
    this.optionsEl = el('div', 'kstack');
    this.optionsEl.style.setProperty('--stack-gap', '10px');

    box.append(this.countEl, this.titleEl, this.descEl, this.optionsEl);
    this.root.append(box);
    parent.append(this.root);
  }

  /*
   * ⚠ **`hidden` 을 읽어야 한다.** 예전엔 인라인 `display` 를 읽었는데, 표면을 클래스로
   * 옮기면서 그대로 뒀으면 `pickForTest()` 가 조용히 `false` 를 돌려줬을 것이다 —
   * 카드 검사가 통과한 채 아무것도 안 고르는 상태가 된다 (K34 조사에서 미리 잡았다).
   */
  get visible(): boolean {
    return !this.root.hidden;
  }

  /** 남은 카드 수 — 검증 도구가 진행 상태를 본다 */
  get remaining(): number {
    return Math.max(0, this.queue.length - this.index);
  }

  /**
   * 지금 보여주는 카드 — 검증 도구가 **무엇을 고를지 판단**할 수 있어야 한다.
   *
   * 없으면 도구가 "0번을 고른다"밖에 못 하는데, 방송 촬영 카드의 0번은 그 주 폐쇄라
   * 그 뒤 검사들이 손님 0명인 주를 보게 된다 (실측으로 겪었다).
   */
  get currentCard(): CardDef | null {
    return this.queue[this.index] ?? null;
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
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
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
      // ★ 56px — `.kitem.wide` 가 지킨다. 새 판 시나리오·도감 항목과 같은 모양이다
      const btn = el('button', 'kitem wide');
      btn.disabled = tooPoor;
      btn.dataset['option'] = String(oi);
      btn.append(
        el('div', 'kitem-name', opt.label + (cash !== 0 ? ` (${won(cash)})` : '')),
        el(
          'div',
          'kitem-sub',
          tooPoor ? `${opt.detail} — 현금이 부족합니다` : opt.detail,
        ),
      );
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

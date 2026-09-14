import { el } from './dom.js';
import type { CardDef, CardOption, CardTheme } from '../sim/kairo/cards.js';
import { optionCash, optionCertainCash } from '../sim/kairo/cards.js';
import { panelHost } from './panels.js';
import {
  composeEventScene,
  createSceneSurface,
  eventScenePlan,
  type EventSpriteSource,
} from './kairo-event-art.js';
import {
  createEventShell,
  renderEventShell,
  type EventShellNodes,
} from './kairo-event-shell.js';
import { won } from './money.js';

/**
 * 주간 의사결정 카드 화면 — 스펙 §A (S11).
 *
 * ## 왜 전면인가
 *
 * Phase 6 규칙: 393px 카드에 **테마 이미지 슬롯 하나 + 선택지 2~3개 한 줄**.
 * 선택지는 짧은 동사/핵심 효과로 읽고 44px 터치 토큰을 쓴다. 작은 팝업으로 띄우면
 * 스크롤 중에 잘못 눌린다.
 *
 * ## 왜 DOM 인가
 *
 * 테마 슬롯은 `event/<theme>` 계약 ID를 달고 CSS가 절차적으로 그린다. 나중에 실물 아트로
 * 교체해도 데이터 ID·레이아웃·터치 규칙은 바뀌지 않는다.
 *
 * ## 삽화 (Task 6)
 *
 * 그 CSS 색면은 **표시**지 장면이 아니었다. 이제 `kairo-event-art.ts` 가 **이미 있는
 * 논리 스프라이트**를 조합해 테마별 미니 장면을 캔버스로 합성하고, 그림을 못 얻으면
 * `null` 이 와서 **기존 CSS 슬롯이 그대로 폴백**으로 남는다 (새 아트 팩 0장).
 */

const CARD_THEME_PRESENTATION: Record<
  CardTheme,
  { label: string; mark: string; sprite: `event/${CardTheme}` }
> = {
  crowd: { label: '단체·혼잡', mark: '40', sprite: 'event/crowd' },
  weather: { label: '날씨', mark: '☂', sprite: 'event/weather' },
  safety: { label: '안전', mark: '+', sprite: 'event/safety' },
  publicity: { label: '홍보·방송', mark: '▶', sprite: 'event/publicity' },
  staff: { label: '직원', mark: '人', sprite: 'event/staff' },
  market: { label: '경영·거래', mark: '₩', sprite: 'event/market' },
  facility: { label: '시설·장비', mark: '▦', sprite: 'event/facility' },
  environment: { label: '환경', mark: '↺', sprite: 'event/environment' },
};

/**
 * 선택지의 **돈 한 줄** — 지금 나가는 돈인지, 확률에 걸린 돈인지, 없는지를 말한다.
 *
 * ⚠ 실측(UX 감사 P0-6): 카드 데이터가 `주급 25만원` 이라고 적어 놓고 효과는
 * `cash: -250000` **한 번**이었다. 게임의 실제 주급은 4,000~6,000원이라 같은 세션에서 두
 * 화면을 보면 **40배** 어긋났다. 그래서 규칙을 시설(`desc`)과 똑같이 만든다:
 * **데이터는 돈을 다시 적지 않고, 화면이 실효값에서 만든다.**
 */
export function optionMoneyText(opt: CardOption, tooPoor: boolean): string {
  const certain = optionCertainCash(opt);
  const total = optionCash(opt);
  if (certain !== 0) {
    return `${won(certain, { signed: true })} · 한 번${tooPoor ? ' · 현금 부족' : ''}`;
  }
  if (total !== 0 && opt.chance !== undefined) {
    return `${Math.round(opt.chance * 100)}% 확률로 ${won(total, { signed: true })}`;
  }
  return '돈이 들지 않습니다';
}

export interface CardChoice {
  card: CardDef;
  optionIndex: number;
}

export interface CardViewOptions {
  /**
   * 논리 ID → 그림. `main` 이 에셋 프로바이더(+손님 한 칸)를 묶어 넘긴다.
   * 없으면 삽화 없이 CSS 폴백만 쓴다 — 카드 뷰는 에셋을 직접 모른다.
   */
  spriteFor?: EventSpriteSource;
}

export class KairoCardView {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly descEl: HTMLDivElement;
  /** 셸의 kicker 를 빌린다 — `이번 주 결정 1 / 2` */
  private readonly countEl: HTMLDivElement;
  private readonly visualEl: HTMLDivElement;
  private readonly visualMarkEl: HTMLSpanElement;
  private readonly visualLabelEl: HTMLSpanElement;
  private readonly sceneEl: HTMLDivElement;
  private readonly shell: EventShellNodes;
  private readonly opts: CardViewOptions;
  private readonly optionsEl: HTMLDivElement;
  private queue: CardDef[] = [];
  private index = 0;
  private onDone: ((choices: CardChoice[]) => void) | null = null;
  private choices: CardChoice[] = [];
  /** 현금이 모자란 선택지를 회색으로 — 얼마나 있는지는 호출자가 안다 */
  private cash = 0;

  constructor(parent: HTMLElement, opts: CardViewOptions = {}) {
    this.opts = opts;
    this.root = el('div', 'kover dialog');
    this.root.id = 'kairo-card';
    this.root.hidden = true;

    /*
     * 주간 카드도 **공용 사건 상자**를 쓴다 (UI v4) — 무대 · 제목 · 본문 · 아래 선택지 줄.
     *
     * 옛 손잡이는 전부 보존한다: 무대가 `.kcard-visual`(테마 배경 CSS 가 여기 걸린다) ·
     * 장면 슬롯이 `.kcard-scene-slot` · 제목이 `.kcard-title` · 선택지가 `[data-option]`.
     * 선택지 줄만 카드가 소유한다 — **한 줄에 N열**이 카드의 계약이기 때문이다
     * (게이트 두 곳이 `oneRow` 를 잰다).
     */
    const box = el('div', 'kdialog-box kcard-dialog');
    this.shell = createEventShell();
    this.visualEl = this.shell.stage;
    this.visualEl.classList.add('kcard-visual');
    this.sceneEl = this.shell.artSlot;
    this.sceneEl.classList.add('kcard-scene-slot');
    this.visualMarkEl = el('span', 'kcard-visual-mark');
    this.visualLabelEl = el('span', 'kcard-visual-label');
    this.visualEl.append(this.visualMarkEl, this.visualLabelEl);
    this.countEl = this.shell.kicker;
    this.countEl.classList.add('kcaption');
    this.titleEl = this.shell.title;
    this.titleEl.classList.add('kcard-title');
    this.descEl = this.shell.body;
    this.descEl.classList.add('kcard-desc');
    this.optionsEl = el('div', 'kcard-options');

    box.append(this.shell.root);
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
    // 카드는 모달이다 (K37) — 다른 패널이 못 밀어낸다. 열려는 쪽이 없으니 항상 열린다
    panelHost.open(this);
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }

  private render(): void {
    const card = this.queue[this.index];
    if (!card) return;
    const theme = CARD_THEME_PRESENTATION[card.theme];
    this.optionsEl.replaceChildren();
    this.optionsEl.style.setProperty('--card-options', String(card.options.length));

    card.options.forEach((opt, oi) => {
      /*
       * 살 수 있나는 **확정 지출**로 본다 (K37). 확률에 걸린 선택지(예: "무시한다" —
       * 35% 로 과태료)는 지금 내는 돈이 아니다. `optionCash` 로 재면 도박을 못 하게
       * 막는데, `safety_check`·`typhoon` 은 선택지가 둘 다 돈이 들어서 현금이 마르면
       * **아무것도 못 고르고** 카드는 모달이라 메뉴도 안 열린다 — 판이 잠긴다.
       */
      const certain = optionCertainCash(opt);
      const tooPoor = certain < 0 && -certain > this.cash;
      // ★ 44px — 한 줄 2~3열이라 공용 전폭 항목(56px)과 분리한다.
      const btn = el('button', 'kitem kcard-choice');
      btn.disabled = tooPoor;
      btn.dataset['option'] = String(oi);
      btn.append(
        el('div', 'kitem-name', opt.label),
        el('div', 'kitem-sub kcard-money', optionMoneyText(opt, tooPoor)),
        el('div', 'kitem-sub', opt.detail),
      );
      btn.addEventListener('click', () => this.pick(card, oi));
      this.optionsEl.append(btn);
    });

    renderEventShell(this.shell, {
      kind: 'week-card',
      mood: 'decision',
      scene: card.theme,
      kicker:
        this.queue.length > 1
          ? `이번 주 결정 ${this.index + 1} / ${this.queue.length}`
          : '이번 주 결정',
      title: card.name,
      body: card.desc,
      showFigure: false,
      // 카드는 **선택 전에는 못 닫는다** — 그 규칙을 화면이 말한다 (예전엔 아무 데도 없었다)
      note: '시간이 멈춰 있습니다 — 하나를 고르면 이번 주가 이어집니다',
      choices: [],
      choicesNode: this.optionsEl,
    });
    this.visualEl.dataset['theme'] = card.theme;
    this.visualEl.dataset['sprite'] = theme.sprite;
    this.visualEl.setAttribute('aria-label', `${theme.label} 사건 삽화`);
    this.visualMarkEl.textContent = theme.mark;
    this.visualLabelEl.textContent = theme.label;
    this.paintScene(card.theme);
  }

  /**
   * 테마 미니 장면. **못 그리면 조용히 폴백**이다 — 삽화가 카드를 막으면 안 된다
   * (카드는 모달이라 안 뜨면 주가 안 넘어간다).
   */
  private paintScene(theme: CardTheme): void {
    // `renderEventShell` 이 이미 `artSlot` 을 비웠다 — 여기서는 얹기만 한다
    this.visualEl.classList.remove('has-scene');
    const resolve = this.opts.spriteFor;
    if (!resolve) return;
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = composeEventScene(eventScenePlan(theme), resolve, createSceneSurface);
    } catch {
      canvas = null;
    }
    if (!canvas) return;
    this.sceneEl.append(canvas);
    this.visualEl.classList.add('has-scene');
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

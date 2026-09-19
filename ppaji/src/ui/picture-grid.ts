/**
 * 카드 격자 (P56-a D2) — 원작 카탈로그 문법 하나를 요리·공방·개조·장날·투자·보상이 공유한다.
 *   카드 = 큰 그림 + 좌하 `×N`(보유/놓인 수) + 우하 가격 + 우상 배지(잠금·NEW·SOLD OUT) · 선택은 노란 채움(`.on`)
 *   격자 아래 **두 줄 고정**(D5): 「이름 · 분류 칩 · No. N」 + 설명 한 줄 — 카드를 탭하면 이 두 줄만 바뀐다.
 *   탭 = 선택 + 실행(`onTap`). 돈이 드는 실행은 호출부가 확인 대화를 연다 — 격자는 모른다.
 */
import { el } from './dom.js';

export interface PictureCard {
  id: string;
  name: string;
  /** 그림 자리 — `pictureEl`/`canvasPictureEl`/썸네일 캔버스 */
  art: HTMLElement;
  /** 좌하 `×N` — 없으면 안 그린다 */
  count?: number | string;
  /** 우하 가격 글자(「600G」) — 없으면 안 그린다 */
  price?: string;
  /** 우상 배지: lock(자물쇠) · new · soldout(띠) · text */
  badge?: 'lock' | 'new' | 'soldout' | { text: string };
  /** 잠금·품절 — 눌러도 실행 안 되고 가라앉는다(숨기지 않는다, G5) */
  disabled?: boolean;
  /** 아래 줄 둘 */
  sub?: string;
  desc?: string;
  /** `data-*` 훅(하네스·검사) — 키는 dataset 이름 */
  data?: Record<string, string>;
  /** 실루엣만(미발견 도감) */
  silhouette?: boolean;
}

export interface PictureGridOptions {
  /** 격자 `data-grid` 이름(검사용) */
  name: string;
  /** 탭 = 선택 + 실행 */
  onTap?: (card: PictureCard) => void;
  /** 아래 두 줄을 안 그린다(슬롯 줄처럼 작은 격자) */
  noFooter?: boolean;
  /** 열 수 — 기본 3 (원작) */
  cols?: 2 | 3 | 4;
  /** 「No.」 대신 쓸 낱말(「보유」·「놓음」) */
  countLabel?: string;
  /** D69(K40): 잠긴 카드(`badge: 'lock'`)는 앞 N 장만 — 티저. 없으면 전부 */
  teaser?: number;
}

export class PictureGrid {
  readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly footName: HTMLSpanElement;
  private readonly footSub: HTMLSpanElement;
  private readonly footCount: HTMLSpanElement;
  private readonly footDesc: HTMLDivElement;
  private readonly foot: HTMLDivElement;
  private cards: PictureCard[] = [];
  private selectedId: string | null = null;

  constructor(private readonly opts: PictureGridOptions) {
    this.root = el('div', 'kpgrid-wrap');
    this.root.dataset['grid'] = opts.name;
    this.grid = el('div', `kpgrid cols-${opts.cols ?? 3}`);
    this.foot = el('div', 'kpfoot');
    this.footName = el('span', 'kpfoot-name', '');
    this.footSub = el('span', 'kpfoot-sub', '');
    this.footCount = el('span', 'kpfoot-count', '');
    this.footDesc = el('div', 'kpfoot-desc', '');
    const line = el('div', 'kpfoot-line');
    line.append(this.footName, this.footSub, this.footCount);
    this.foot.append(line, this.footDesc);
    this.root.append(this.grid);
    if (!opts.noFooter) this.root.append(this.foot);
  }

  get selected(): string | null { return this.selectedId; }

  render(input: readonly PictureCard[], options: { showAllLocked?: boolean } = {}): void {
    let cards = [...input];
    if (!options.showAllLocked && this.opts.teaser !== undefined) { let left = this.opts.teaser; cards = cards.filter((c) => c.badge !== 'lock' || left-- > 0); } // D69: 해금분 + 티저 N
    this.cards = cards;
    this.grid.replaceChildren();
    if (this.selectedId !== null && !cards.some((c) => c.id === this.selectedId)) this.selectedId = null;
    if (this.selectedId === null && cards.length > 0 && !this.opts.noFooter) this.selectedId = cards[0]?.id ?? null; // D69: 아래 줄은 비지 않는다 — 원작처럼 첫 카드가 골라져 있다
    for (const c of cards) {
      const b = el('button', 'kpcard');
      b.type = 'button';
      b.dataset['card'] = c.id;
      if (c.data) for (const [k, v] of Object.entries(c.data)) b.dataset[k] = v;
      if (c.disabled) { b.classList.add('locked'); b.disabled = true; } // 잠금·품절은 진짜 disabled — 하네스·접근성이 그렇게 읽는다
      if (c.silhouette) b.classList.add('silhouette');
      if (c.id === this.selectedId) b.classList.add('on');
      b.setAttribute('aria-label', c.name);
      const art = el('span', 'kpcard-art');
      art.append(c.art);
      // 원작 카드: `×N`·가격은 그림 위 좌하·우하에 얹히고 이름은 그 아래 — 겹치지 않는다
      if (c.count !== undefined) art.append(el('span', 'kpcard-n', `×${c.count}`));
      if (c.price !== undefined) art.append(el('span', 'kpcard-cost', c.price));
      b.append(art);
      if (c.badge) {
        if (c.badge === 'soldout') b.append(el('span', 'kpcard-ribbon', 'SOLD OUT'));
        else b.append(el('span', `kpcard-badge ${c.badge === 'lock' ? 'lock' : c.badge === 'new' ? 'new' : ''}`, c.badge === 'lock' ? '잠김' : c.badge === 'new' ? 'NEW' : c.badge.text));
      }
      b.append(el('span', 'kpcard-name', c.name));
      b.addEventListener('click', () => {
        this.select(c.id);
        if (!c.disabled) this.opts.onTap?.(c);
      });
      this.grid.append(b);
    }
    this.renderFoot();
  }

  select(id: string | null): void {
    this.selectedId = id;
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>('.kpcard')) b.classList.toggle('on', b.dataset['card'] === id);
    this.renderFoot();
  }

  private renderFoot(): void {
    const c = this.cards.find((x) => x.id === this.selectedId) ?? null;
    this.footName.textContent = c ? c.name : '';
    this.footSub.textContent = c?.sub ?? '';
    this.footCount.textContent = c && c.count !== undefined ? `${this.opts.countLabel ?? 'No.'} ${c.count}` : '';
    this.footDesc.textContent = c?.desc ?? '';
    this.foot.classList.toggle('khide', !c); // D69: 고른 것이 없으면(카드 0) 줄 자체를 안 그린다
  }

  get count(): number { return this.cards.length; }
}

/** 5칸 게이지 — 강도·맛·스릴 같은 0~5 값 (원작 강도 게이지) */
export function gaugeEl(value: number, max = 5, extraClass?: string): HTMLSpanElement {
  const g = el('span', extraClass ? `kgauge ${extraClass}` : 'kgauge');
  const n = Math.max(0, Math.min(max, Math.round(value)));
  g.dataset['value'] = String(n);
  g.setAttribute('role', 'img');
  g.setAttribute('aria-label', `${n}/${max}`);
  for (let k = 0; k < max; k++) g.append(el('span', k < n ? 'kgauge-cell on' : 'kgauge-cell'));
  return g;
}

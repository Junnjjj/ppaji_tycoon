/**
 * 장날(Pumpkin Products) — 17:00 입고 6칸. 사면 종류가 해금된다.
 * P56-a D6 (원작 G5): **빈 상태가 없다** — 17시 전엔 오늘 올 수 있는 후보가 전부 잠긴 카드로 서고, 진열된 것만 살 수 있다.
 * 카드 = 그림(시설 스프라이트 · 선물 등록부) + 가격 + 잠금/SOLD OUT. 탭 = 확인 대화 → 구입.
 */
import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import { canvasPictureEl, pictureEl, pictureId } from '../pictures.js';
import type { Game } from '../../sim/game.js';
import type { ShopEntry } from '../../data/schema.js';

const KIND_KO: Readonly<Record<string, string>> = { facility: '시설', gift: '선물', ingredient: '재료' }; // P60-a: 아이템 진열은 없다 — 빈 자리는 재료 진열(P56-c 재고 문법)

export class ShopWindow {
  private readonly win: WindowPanel;
  private readonly head = el('div', 'krow-sub kfac-hint'); // W-4: 행이 아니라 한 줄
  private readonly grid: PictureGrid;
  private readonly sold = new Set<string>();

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void; name(kind: ShopEntry['kind'], ref: string): string; sprite(facId: string): HTMLCanvasElement | null }) {
    this.win = new WindowPanel(parent, 'win-shop', '장날', 'blue');
    this.grid = new PictureGrid({ name: 'shop', onTap: (c) => this.tap(c) });
    this.win.body.append(this.head, this.grid.root);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  private art(e: ShopEntry): HTMLElement {
    if (e.kind === 'facility') return canvasPictureEl(this.host.sprite(e.ref), 'build');
    if (e.kind === 'ingredient') return pictureEl(pictureId('ingredient', e.ref), 'fruit');
    return pictureEl(pictureId('gift', e.ref), 'gift');
  }

  render(): void {
    const g = this.game();
    this.head.replaceChildren();
    const stocked = g.shop.state.restockDay >= 0;
    this.head.textContent = !stocked ? '17:00 입고 — 잠긴 카드가 오늘의 후보' : `${g.shop.state.restockDay + 1}일차 17:00 입고 · 랭크 ${g.rank} 진열`;
    const stock = g.shopStock();
    const stockIds = new Set(stock.map((e) => e.id));
    const cards: PictureCard[] = [];
    for (const e of stock) {
      const name = this.host.name(e.kind, e.ref);
      cards.push({ id: e.id, name, art: this.art(e), sub: `${KIND_KO[e.kind] ?? e.kind} · 티어 ${e.tier}`, price: `${e.price.toLocaleString('ko-KR')}G`, desc: e.price > g.money ? '돈이 모자란다' : '탭하면 산다 — 사면 종류가 열린다', disabled: e.price > g.money, data: { shop: e.id } });
    }
    for (const id of this.sold) {
      const e = g.shop.entries.get(id);
      if (!e || stockIds.has(id)) continue;
      cards.push({ id: e.id, name: this.host.name(e.kind, e.ref), art: this.art(e), sub: `${KIND_KO[e.kind] ?? e.kind} · 티어 ${e.tier}`, price: `${e.price.toLocaleString('ko-KR')}G`, badge: 'soldout', disabled: true, desc: '오늘 산 것', data: { shopSold: e.id } });
    }
    // 잠긴 후보 — 진열에 없는 랭크 이하 후보 전부 (G5: 빈 상태 대신 「입고 대기」)
    for (const e of g.shopCandidates()) {
      if (stockIds.has(e.id) || this.sold.has(e.id)) continue;
      cards.push({ id: e.id, name: this.host.name(e.kind, e.ref), art: this.art(e), sub: `${KIND_KO[e.kind] ?? e.kind} · 티어 ${e.tier}`, price: `${e.price.toLocaleString('ko-KR')}G`, badge: 'lock', disabled: true, desc: stocked ? '오늘 진열엔 없다 — 내일 17시 뽑기' : '17시 입고를 기다린다', data: { shopLocked: e.id } });
    }
    this.grid.render(cards);
  }

  private tap(c: PictureCard): void {
    const g = this.game();
    if (!c.data?.['shop']) return;
    const e = g.shop.entries.get(c.id);
    if (!e) return;
    const name = this.host.name(e.kind, e.ref);
    confirmDialog({ title: `${name} 을 살까요?`, body: `${KIND_KO[e.kind] ?? e.kind} · 티어 ${e.tier}`, cost: e.price, onYes: () => {
      const r = g.buyShop(e.id);
      this.host.toast(r.ok ? `${name} 구입 · −${e.price.toLocaleString('ko-KR')}G` : r.reason, r.ok);
      if (r.ok) { this.sold.add(e.id); this.host.onChanged(); }
      this.render();
    } });
  }
}

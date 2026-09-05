import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';

const KIND_KO = { facility: '시설', item: '아이템', gift: '선물' } as const;

/** 상점(Pumpkin Products) — 17:00 입고 6칸. 사면 종류가 해금된다 */
export class ShopWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void; name(kind: 'facility' | 'item' | 'gift', ref: string): string }) {
    this.win = new WindowPanel(parent, 'win-shop', '장날', 'green');
    this.win.body.append(this.body);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    this.body.replaceChildren();
    const head = el('div', 'krow');
    head.append(el('span', 'krow-k', '입고'), el('span', 'krow-v', g.shop.state.restockDay < 0 ? '첫 입고는 17:00' : `${g.shop.state.restockDay + 1}일차 17:00 · 랭크 ${g.rank} 진열`));
    this.body.append(head);
    const stock = g.shopStock();
    if (stock.length === 0) {
      const empty = el('div', 'krow');
      empty.append(el('span', 'krow-k', '진열이 비었다 — 17시에 새로 들어온다'));
      this.body.append(empty);
    }
    for (const e of stock) {
      const row = el('button', 'krow kcard-row');
      row.type = 'button';
      row.dataset['shop'] = e.id;
      row.disabled = e.price > g.money;
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', this.host.name(e.kind, e.ref)), el('span', 'krow-sub', `${KIND_KO[e.kind]} · 티어 ${e.tier}`));
      row.append(text, el('span', 'krow-v', `${e.price.toLocaleString('ko-KR')}G`));
      row.addEventListener('click', () => confirmDialog({ title: `${this.host.name(e.kind, e.ref)} 을 살까요?`, body: `${KIND_KO[e.kind]} · 티어 ${e.tier}`, cost: e.price, onYes: () => {
        const r = g.buyShop(e.id);
        this.host.toast(r.ok ? `${this.host.name(e.kind, e.ref)} 구입 · −${e.price.toLocaleString('ko-KR')}G` : r.reason, r.ok);
        if (r.ok) this.host.onChanged();
        this.render();
      } }));
      this.body.append(row);
    }
  }
}

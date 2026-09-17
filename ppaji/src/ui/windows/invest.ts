/**
 * 투자 창 — 탭 2(놀이시설·라운지). P56-a: 단계마다 **해금되는 시설 그림 카드**(스프라이트) · 비용 · 완료는 도장 배지. 탭 = 확인 대화 → 투자.
 */
import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import { canvasPictureEl } from '../pictures.js';
import type { Game } from '../../sim/game.js';
import { INVEST_DEFS, FACILITY_DEFS } from '../../sim/game.js';

export class InvestWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs');
  private readonly grid: PictureGrid;
  private track: 'attraction' | 'lounge' = 'attraction';

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void; sprite(facId: string): HTMLCanvasElement | null }) {
    this.win = new WindowPanel(parent, 'win-invest', '투자', 'blue');
    for (const [id, label] of [['attraction', '물놀이 기구'], ['lounge', '평상·방갈로']] as const) {
      const b = el('button', 'ktab', label);
      b.type = 'button';
      b.dataset['tab'] = id;
      b.addEventListener('click', () => { this.track = id; this.render(); });
      this.tabs.append(b);
    }
    this.grid = new PictureGrid({ name: 'invest', onTap: (c) => this.tap(c), teaser: 2 }); // W-2: 다음 단계 둘만 보인다
    this.win.body.append(this.tabs, this.grid.root);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.track);
    const cards: PictureCard[] = [];
    for (const d of INVEST_DEFS.filter((x) => x.track === this.track).sort((a, b) => a.order - b.order)) {
      const done = g.investDone.has(d.id);
      const can = g.canInvest(d.id);
      const first = d.unlocks[0];
      const names = d.unlocks.map((u) => FACILITY_DEFS.get(u)?.name ?? u).join(' · ');
      const card: PictureCard = {
        id: d.id, name: d.name, art: canvasPictureEl(first ? this.host.sprite(first) : null, 'build'),
        sub: names ? `해금: ${names}` : '다음 단계', disabled: done || !can.ok,
        desc: done ? '투자 완료' : can.ok ? '탭하면 투자 — 내일 개장에 해금' : can.reason,
        data: { invest: d.id },
      };
      if (!done) card.price = `${d.cost.toLocaleString('ko-KR')}G`;
      if (done) card.badge = { text: '완료' }; else if (!can.ok) card.badge = 'lock';
      cards.push(card);
    }
    this.grid.render(cards);
  }

  private tap(c: PictureCard): void {
    const g = this.game();
    const d = INVEST_DEFS.find((x) => x.id === c.id);
    if (!d) return;
    const names = d.unlocks.map((u) => FACILITY_DEFS.get(u)?.name ?? u).join(' · ');
    confirmDialog({ title: `${d.name}에 투자할까요?`, body: names ? `내일 개장에 해금: ${names}` : '다음 단계가 열린다', cost: d.cost, onYes: () => {
      const r = g.invest(d.id);
      this.host.toast(r.ok ? `${d.name} · 내일 해금` : r.reason, r.ok);
      if (r.ok) this.host.onChanged();
      this.render();
    } });
  }
}

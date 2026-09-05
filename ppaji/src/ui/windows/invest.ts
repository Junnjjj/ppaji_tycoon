import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { INVEST_DEFS, FACILITY_DEFS } from '../../sim/game.js';

/** 투자 창 — 탭 2(놀이시설·라운지). 행 = 단계 · 비용 · 해금 시설 · 투자 버튼. 완료 행은 도장 */
export class InvestWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs');
  private readonly body = el('div', 'krows');
  private track: 'attraction' | 'lounge' = 'attraction';

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-invest', '투자', 'blue');
    for (const [id, label] of [['attraction', '물놀이 기구'], ['lounge', '평상·방갈로']] as const) {
      const b = el('button', 'ktab', label);
      b.type = 'button';
      b.dataset['tab'] = id;
      b.addEventListener('click', () => { this.track = id; this.render(); });
      this.tabs.append(b);
    }
    this.win.body.append(this.tabs, this.body);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.track);
    this.body.replaceChildren();
    for (const d of INVEST_DEFS.filter((x) => x.track === this.track).sort((a, b) => a.order - b.order)) {
      const done = g.investDone.has(d.id);
      const can = g.canInvest(d.id);
      const row = el('button', 'krow kcard-row');
      row.type = 'button';
      row.dataset['invest'] = d.id;
      row.disabled = done || !can.ok;
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', `${d.name}${done ? ' — 완료' : ''}`), el('span', 'krow-sub', d.unlocks.length ? `해금: ${d.unlocks.map((u) => FACILITY_DEFS.get(u)?.name ?? u).join(' · ')}` : '다음 단계로'));
      if (!done && !can.ok) text.append(el('span', 'krow-sub', can.reason));
      row.append(text, el('span', 'krow-v', done ? '완료' : `${d.cost.toLocaleString('ko-KR')}G`));
      row.addEventListener('click', () => confirmDialog({ title: `${d.name}에 투자할까요?`, body: d.unlocks.length ? `내일 개장에 해금: ${d.unlocks.map((u) => FACILITY_DEFS.get(u)?.name ?? u).join(' · ')}` : '다음 단계가 열린다', cost: d.cost, onYes: () => {
        const r = g.invest(d.id);
        this.host.toast(r.ok ? `${d.name} · 내일 해금` : r.reason, r.ok);
        if (r.ok) this.host.onChanged();
        this.render();
      } }));
      this.body.append(row);
    }
  }
}

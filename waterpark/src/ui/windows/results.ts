/**
 * 결산 카드 (G19) — 카이로의 「오늘의 결과」·「시즌 결산」·「연말 결산·수상」. 하루 끝(20:00)에 뜬다 (시간은 창이 열린 동안 멈춘다).
 * sim 의 `day-summary`/`season-summary`/`year-summary` 사건 `data` 를 그대로 그린다 — 여기서 숫자를 다시 계산하지 않는다.
 */
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { DayReport, PeriodReport } from '../../sim/game.js';

export type DayCard = DayReport & { popularity: number; rankPos: number; cleanliness?: number; salary?: number };

const G = (n: number): string => `${n.toLocaleString('ko-KR')}G`;

export class ResultsWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');
  private readonly okBtn: HTMLButtonElement;
  /** 마지막으로 그린 카드 종류 — 하네스가 읽는다 */
  kind: 'day' | 'season' | 'year' | null = null;

  constructor(parent: HTMLElement, private readonly onClosed: () => void = () => undefined) {
    this.win = new WindowPanel(parent, 'win-results', '오늘의 결과', 'gold', { modal: true });
    this.okBtn = el('button', 'kbtn primary', '확인');
    this.okBtn.type = 'button';
    this.okBtn.id = 'win-results-ok';
    this.okBtn.addEventListener('click', () => this.win.hide());
    this.win.body.append(this.body, this.okBtn);
    this.win.onClose = () => this.onClosed();
  }

  get visible(): boolean { return this.win.visible; }

  private row(k: string, v: string, cls = ''): void {
    const r = el('div', `krow${cls ? ` ${cls}` : ''}`);
    r.append(el('span', 'krow-k', k), el('span', 'krow-v', v));
    this.body.append(r);
  }

  private head(t: string): void {
    this.body.append(el('div', 'kresult-head', t));
  }

  /** 큰 숫자 타일 (G46, 카이로 결산의 「방문 · 수입 · 순이익」 요약) */
  private tiles(items: { k: string; v: string; cls?: string }[]): void {
    const box = el('div', `kstats${items.length === 2 ? ' two' : ''}`);
    for (const it of items) {
      const t = el('div', `kstat${it.cls ? ` ${it.cls}` : ''}`);
      t.dataset['stat'] = it.k;
      t.append(el('span', 'kstat-k', it.k), el('span', 'kstat-v', it.v));
      box.append(t);
    }
    this.body.append(box);
  }

  showDay(title: string, d: DayCard): void {
    this.kind = 'day';
    this.win.setTitle(title);
    this.body.replaceChildren();
    const income = d.tickets + d.fees + d.food;
    this.tiles([{ k: '방문', v: `${d.visitors}명` }, { k: '순이익', v: `${d.net >= 0 ? '+' : ''}${G(d.net)}`, cls: d.net >= 0 ? 'kgood' : 'kbad' }]);
    this.row('방문', `${d.visitors}명`);
    this.row('입장료', G(d.tickets));
    if (d.food) this.row('식당 매출', G(d.food));
    if (d.fees) this.row('라운지 대여', G(d.fees));
    this.row('유지비' + (d.salary ? ' · 월급' : ''), `−${G(d.maintenance)}`);
    if (d.cleanliness !== undefined) this.row('청결', `${d.cleanliness} / 100`);
    this.row('순이익', `${d.net >= 0 ? '+' : ''}${G(d.net)}`, d.net >= 0 ? 'kgood' : 'kbad');
    this.row('퇴장 만족', `${d.satisfaction ?? 0} / 100`);
    this.row('좋아요', `+${d.likes ?? 0}`);
    this.row('파크 인기', d.rankPos > 0 ? `${d.popularity} · 전국 ${d.rankPos}위` : `${d.popularity}`);
    if (d.topFacility) this.row('오늘의 시설', `${d.topFacility.name} · ${G(d.topFacility.income)} · ${d.topFacility.uses}명`);
    if (d.topMenu) this.row('오늘의 메뉴', `${d.topMenu.name} · ${d.topMenu.sales}개`);
    void income;
    this.win.show();
  }

  showPeriod(title: string, p: PeriodReport): void {
    this.kind = p.kind;
    this.win.setTitle(title);
    this.body.replaceChildren();
    this.tiles([{ k: '방문', v: `${p.visitors.toLocaleString('ko-KR')}명` }, { k: '수입', v: G(p.income) }, { k: '순이익', v: `${p.net >= 0 ? '+' : ''}${G(p.net)}`, cls: p.net >= 0 ? 'kgood' : 'kbad' }]);
    this.head(p.kind === 'year' ? '올해의 성적' : '이번 계절');
    this.row('방문', `${p.visitors.toLocaleString('ko-KR')}명`);
    this.row('수입', G(p.income));
    this.row('순이익', `${p.net >= 0 ? '+' : ''}${G(p.net)}`, p.net >= 0 ? 'kgood' : 'kbad');
    this.row('좋아요', `+${p.likes.toLocaleString('ko-KR')}`);
    this.row('퇴장 만족 평균', `${p.satisfaction} / 100`);
    if (p.topFacilities.length) { this.head('시설 수입 TOP'); p.topFacilities.forEach((f, k) => this.row(`${k + 1}. ${f.name}`, `${G(f.income)} · ${f.uses.toLocaleString('ko-KR')}명`)); }
    if (p.topMenus.length) { this.head('메뉴 판매 TOP'); p.topMenus.forEach((m, k) => this.row(`${k + 1}. ${m.name}`, `${m.sales}개`)); }
    if (p.rankPos > 0) {
      this.head(`전국 워터파크 순위 — ${p.rankPos}위`);
      const all = [...p.rivals.map((r) => ({ name: r.name, pop: r.pop, me: false })), { name: '내 워터파크', pop: p.popularity, me: true }].sort((a, b) => b.pop - a.pop);
      all.forEach((r, k) => this.row(`${k + 1}. ${r.name}`, `인기 ${r.pop.toLocaleString('ko-KR')}`, r.me ? 'kme' : ''));
    } else this.row('파크 인기', `${p.popularity}`);
    if (p.awards && p.awards.length) { this.head('수상'); for (const a of p.awards) this.row(a.title, a.name, 'kaward'); }
    this.win.show();
  }

  hide(): void { this.win.hide(); }
}

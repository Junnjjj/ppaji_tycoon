/**
 * 랭킹 창 (G19) — 카이로의 「랭킹」 화면: 시설(수입·이용) · 메뉴(판매) · 손님(친구 만족) · 라이벌 · 기록.
 * 전부 sim 의 누적값을 읽기만 한다.
 */
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import { iconEl } from '../icons.js';
import { drawPortrait } from '../../assets/draw/portrait.js';
import { FEATURES, type Game } from '../../sim/game.js';

type Tab = 'facility' | 'menu' | 'guest' | 'rival' | 'record';
const TABS: { id: Tab; label: string }[] = [
  { id: 'facility', label: '시설' }, { id: 'menu', label: '메뉴' }, { id: 'guest', label: '손님' }, { id: 'rival', label: '라이벌' }, { id: 'record', label: '기록' },
];
const G = (n: number): string => `${n.toLocaleString('ko-KR')}G`;

export class RankingsWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs');
  private readonly body = el('div', 'krows');
  private tab: Tab = 'facility';

  constructor(parent: HTMLElement, private readonly game: () => Game) {
    this.win = new WindowPanel(parent, 'win-rankings', '랭킹', 'purple');
    for (const t of TABS) {
      const b = el('button', 'ktab', t.label);
      b.type = 'button';
      b.dataset['tab'] = t.id;
      b.addEventListener('click', () => { this.tab = t.id; this.render(); });
      this.tabs.append(b);
    }
    this.win.body.append(this.tabs, this.body);
  }

  show(tab?: Tab): void {
    if (tab) this.tab = tab;
    this.render();
    this.win.show();
  }

  private row(k: string, v: string, lead?: HTMLElement): void {
    const r = el('div', 'krow');
    if (lead) r.append(lead);
    r.append(el('span', 'krow-k', k), el('span', 'krow-v', v));
    this.body.append(r);
  }

  private render(): void {
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) { b.classList.toggle('on', b.dataset['tab'] === this.tab); b.classList.toggle('khide', b.dataset['tab'] === 'rival' && !FEATURES.rivals); }
    if (this.tab === 'rival' && !FEATURES.rivals) this.tab = 'facility';
    this.body.replaceChildren();
    const g = this.game();
    if (this.tab === 'facility') {
      const list = [...g.facilities.all].sort((a, b) => b.incomeTotal - a.incomeTotal || b.usesTotal - a.usesTotal).slice(0, 12);
      if (list.length === 0) this.body.append(el('div', 'krow-sub', '아직 시설이 없다'));
      list.forEach((f, k) => this.row(`${k + 1}. ${g.facilities.defOf(f).name}${FEATURES.facilityLevels ? ` Lv${f.level}` : ''}`, `${G(f.incomeTotal)} · ${f.usesTotal.toLocaleString('ko-KR')}명 · 인기 ${g.facilityPop(f)}`));
    } else if (this.tab === 'menu') {
      const list = Object.entries(g.stats.menuSales).sort((a, b) => b[1] - a[1]).slice(0, 12);
      if (list.length === 0) this.body.append(el('div', 'krow-sub', '아직 팔린 메뉴가 없다'));
      list.forEach(([id, n], k) => this.row(`${k + 1}. ${g.menus.recipes.get(id)?.name ?? id}`, `${n.toLocaleString('ko-KR')}개`));
    } else if (this.tab === 'guest') {
      const list = [...g.sns.unlockedFriends].sort((a, b) => b.stars - a.stars || b.exp - a.exp).slice(0, 12);
      list.forEach((st, k) => {
        const def = g.sns.friendDef(st.id);
        if (!def) return;
        const face = el('span', 'kportrait');
        face.append(drawPortrait(def.palette, def.palette % 5, st.stars >= 2 ? 'happy' : 'calm'));
        const stars = el('span', 'kstars');
        for (let s = 0; s < 3; s++) { const ic = iconEl('star'); ic.dataset['on'] = s < st.stars ? '1' : '0'; stars.append(ic); }
        const r = el('div', 'krow kfriend');
        r.append(face, el('span', 'krow-k', `${k + 1}. ${def.name}`), stars, el('span', 'krow-v', `방문 ${st.visits} · EXP ${st.exp}`));
        this.body.append(r);
      });
    } else if (this.tab === 'rival') {
      const mine = g.parkPopularity();
      const all = [...g.rivalPops().map((r) => ({ ...r, me: false })), { name: '내 빠지', pop: mine, me: true }].sort((a, b) => b.pop - a.pop);
      all.forEach((r, k) => { const rr = el('div', `krow${r.me ? ' kme' : ''}`); rr.append(el('span', 'krow-k', `${k + 1}. ${r.name}`), el('span', 'krow-v', `인기 ${r.pop.toLocaleString('ko-KR')}`)); this.body.append(rr); });
    } else {
      const days = g.stats.days;
      const best = (f: (d: (typeof days)[number]) => number): number => days.reduce((m, d) => Math.max(m, f(d)), 0);
      this.row('누적 방문', `${g.stats.visitors.toLocaleString('ko-KR')}명`);
      this.row('누적 입장료', G(g.stats.tickets));
      this.row('누적 식당 매출', G(g.stats.food));
      this.row('최다 방문일', `${best((d) => d.visitors)}명`);
      this.row('최고 순이익', G(best((d) => d.net)));
      this.row('총 좋아요', `${g.sns.totalLikes.toLocaleString('ko-KR')}`);
      this.row('인증 통과', `${g.certs.passes()}회`);
      this.row('레시피', `${g.cooking.known.size}종 · 요리 Lv${g.cooking.level}`);
      this.row('영업일', `${days.length}일`);
    }
  }
}

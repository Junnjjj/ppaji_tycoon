/**
 * 엔딩 창 — 8년차 겨울 끝. 점수 6항목이 순차로 뜨고(`--stagger`) 총점 → `이어하기` / `뉴게임+`(이월 목록).
 * 모달 — 시간은 `haltedForEnding` 이 이미 멈춰 있다.
 */
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { scoreOf, carryoverOf, type Carryover } from '../../sim/endgame.js';

const LABEL: Record<keyof Omit<ReturnType<typeof scoreOf>, 'total'>, string> = { popularity: '인기도 ×10', visitors: '총 방문', likes: '총 좋아요', friends: 'SNS 친구 ×10', certs: '인증 합격 ×10', recipes: '레시피 ×5' };

export class EndingWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { continueGame(): void; newGamePlus(c: Carryover): void; profile(): Carryover | null }) {
    this.win = new WindowPanel(parent, 'win-ending', '8년차 겨울 — 본편 종료', 'purple', { modal: true });
    this.win.body.append(this.body);
  }

  get visible(): boolean {
    return this.win.visible;
  }

  show(): void {
    const g = this.game();
    const s = scoreOf(g);
    this.body.replaceChildren();
    (Object.keys(LABEL) as (keyof typeof LABEL)[]).forEach((k, idx) => {
      const r = el('div', 'krow kscore-row');
      r.style.setProperty('--row-index', String(idx)); // 순차 등장 지연 — 값은 데이터, 움직임은 CSS
      r.dataset['score'] = k;
      r.append(el('span', 'krow-k', LABEL[k]), el('span', 'krow-v', s[k].toLocaleString('ko-KR')));
      this.body.append(r);
    });
    const total = el('div', 'krow kscore-total');
    total.dataset['total'] = String(s.total);
    total.append(el('span', 'krow-name', '총점'), el('span', 'krow-v', s.total.toLocaleString('ko-KR')));
    this.body.append(total);
    const prev = this.host.profile();
    if (prev) {
      const best = el('div', 'krow');
      best.append(el('span', 'krow-k', `최고 기록 (${prev.runs}회차까지)`), el('span', 'krow-v', prev.bestScore.toLocaleString('ko-KR')));
      this.body.append(best);
    }
    const c = carryoverOf(g, prev);
    const carry = el('div', 'krow-sub');
    carry.textContent = `뉴게임+ 이월: 레시피 ${c.recipes.length} · 요리 EXP ${c.cookingExp} · 시설 종류 ${c.facilities.length} · 선물 ${c.gifts.length} · 타일 ${c.tiles.length} · 티켓 ${c.ticketBase}G (돈·풀·손님·지역은 새로)`;
    this.body.append(carry);
    const row = el('div', 'kdock-row');
    const cont = el('button', 'kbtn', '이어하기');
    cont.type = 'button';
    cont.id = 'win-ending-continue';
    cont.addEventListener('click', () => { this.win.hide(); this.host.continueGame(); });
    const ng = el('button', 'kbtn primary', '뉴게임+');
    ng.type = 'button';
    ng.id = 'win-ending-ngplus';
    ng.addEventListener('click', () => { this.win.hide(); this.host.newGamePlus(c); });
    row.append(cont, ng);
    this.body.append(row);
    this.win.show();
  }
}

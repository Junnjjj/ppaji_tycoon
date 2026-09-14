import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { rewardArt } from '../reward-art.js'; // P56-b3: 물건이 딸린 소식(합격 상품·편지·랭크 보상)은 그림 한 칸

/** 알림함 (G27) — 인박스 사건 최근 50건, 안 읽은 것은 점 표시. 열면 전부 읽음 처리 */
export class InboxWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly onRead: () => void) {
    this.win = new WindowPanel(parent, 'win-inbox', '알림함', 'blue');
    this.win.body.append(this.body);
  }

  show(): void {
    this.render();
    this.win.show();
    const g = this.game();
    for (const e of g.inbox.all) if (!e.read) g.inbox.markRead(e.id);
    this.onRead();
  }

  render(): void {
    const g = this.game();
    this.body.replaceChildren();
    const list = [...g.inbox.all].reverse().filter((e) => e.priority !== 'strip');
    if (list.length === 0) {
      const empty = el('div', 'krow');
      empty.append(el('span', 'krow-k', '아직 소식이 없다'));
      this.body.append(empty);
      return;
    }
    for (const e of list) {
      const row = el('div', `krow kinbox${e.read ? '' : ' unread'}`);
      row.dataset['inbox'] = String(e.id);
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', e.title), el('span', 'krow-sub', `${e.day + 1}일차 · ${e.body}`));
      row.append(e.read ? el('span', 'kdot') : iconEl('star'), text);
      if (e.pic) { const a = el('span', 'kreward-art'); a.append(rewardArt(e.pic)); a.dataset['inboxPic'] = `${e.pic.kind}/${e.pic.id}`; row.append(a); }
      this.body.append(row);
    }
  }
}

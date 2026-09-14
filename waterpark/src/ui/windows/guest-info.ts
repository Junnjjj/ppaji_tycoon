import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import { iconEl } from '../icons.js';
import { drawPortrait } from '../../assets/draw/portrait.js';
import type { Guest } from '../../sim/guest.js';
import type { Game } from '../../sim/game.js';

const STATE_KO: Record<Guest['state'], string> = {
  enter: '입장 중', wander: '둘러보는 중', walk: '풀로 가는 중', swim: '수영 중', use: '시설 이용 중', leave: '나가는 중', climb: '슬라이드 오르는 중', ride: '슬라이드 타는 중', eat: '서서 먹는 중', queue: '줄 서는 중', gone: '떠남',
};
const COLOR_KO: Record<string, string> = { orange: '주황', yellow: '노랑', lime: '라임', green: '초록', blue: '파랑', purple: '보라', pink: '분홍', red: '빨강', white: '흰색' };
const SCENT_KO: Record<string, string> = { citrus: '시트러스', floral: '플로럴', pine: '솔', fruity: '과일', tropical: '트로피컬', berry: '베리', marine: '바다', cookie: '쿠키', spices: '향신료', milky: '밀크', coffee: '커피', money: '머니' };

/** 손님 카드 (G19) — 초상·이름·나이·동네·체력/만족 게이지·취향·오늘 쓴 돈. 친구면 ☆와 열린 소원 */
export class GuestInfoWindow {
  private readonly win: WindowPanel;
  private readonly head = el('div', 'kguest-head');
  private readonly rows = el('div', 'krows');
  private readonly gifts = el('div', 'kchips kwrap');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host?: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-guest', '손님', 'blue');
    this.win.body.append(this.head, this.rows, this.gifts);
  }

  show(g: Guest): void {
    const game = this.game();
    const friend = g.friendId ? game.sns.friends.get(g.friendId) : undefined;
    this.win.setTitle(g.friendId ? `SNS 친구 · ${g.name}` : `손님 · ${g.name}`);
    this.head.replaceChildren();
    this.gifts.replaceChildren();
    // 원작: 손님 정보 화면 왼쪽 아래 「수영복」「튜브」로 바로 선물 (G43) — 친구만, 해금된 선물만
    if (friend && g.friendId) {
      const fid = g.friendId;
      for (const d of game.giftDefs) {
        if (friend.gifts.includes(d.id)) continue;
        const b = el('button', 'kchip kgift', `${d.kind === 'float' ? '튜브' : '수영복'} 선물 · ${d.name} ${d.price.toLocaleString('ko-KR')}G`);
        b.type = 'button';
        b.dataset['gift'] = d.id;
        const can = game.unlocked.gifts.has(d.id) && d.price <= game.money;
        b.disabled = !can;
        if (!game.unlocked.gifts.has(d.id)) b.title = '아직 구할 수 없는 선물';
        b.addEventListener('click', () => confirmDialog({ title: `${g.name}에게 ${d.name}을 줄까요?`, body: `만족 +${Math.round(d.price / 8)}`, cost: d.price, onYes: () => {
          const r = game.giveGift(fid, d.id);
          this.host?.toast(r.ok ? `${g.name}에게 ${d.name} 선물 · −${d.price.toLocaleString('ko-KR')}G` : r.reason, r.ok);
          if (r.ok) { this.host?.onChanged(); this.show(g); }
        } }));
        this.gifts.append(b);
      }
    }
    const face = el('span', 'kportrait big');
    face.append(drawPortrait(g.palette, g.palette % 5, g.sat >= 60 ? 'happy' : 'calm'));
    const info = el('div', 'kguest-id');
    info.append(el('div', 'krow-name', `${g.name} · ${g.age}세 ${g.gender === 'F' ? '여' : '남'}`));
    info.append(el('div', 'krow-sub', `${g.home}에서 왔다 · ${STATE_KO[g.state]}`));
    if (friend) {
      const stars = el('span', 'kstars');
      for (let k = 0; k < 3; k++) { const ic = iconEl('star'); ic.dataset['on'] = k < friend.stars ? '1' : '0'; stars.append(ic); }
      info.append(stars);
    }
    this.head.append(face, info);
    this.rows.replaceChildren();
    const bar = (k: string, v: number, cls: string): void => {
      const r = el('div', 'krow');
      const track = el('span', 'kbar');
      const fill = el('span', `kbar-fill ${cls}`);
      fill.style.width = `${Math.max(0, Math.min(100, Math.round(v)))}%`;
      track.append(fill);
      r.append(el('span', 'krow-k', k), track, el('span', 'krow-v', `${Math.round(v)}`));
      this.rows.append(r);
    };
    const row = (k: string, v: string): void => {
      const r = el('div', 'krow');
      r.append(el('span', 'krow-k', k), el('span', 'krow-v', v));
      this.rows.append(r);
    };
    bar('체력', g.hp, 'khp');
    bar('만족', g.sat, 'ksat');
    row('오늘 쓴 돈', `${g.spentToday.toLocaleString('ko-KR')}G`);
    row('수영 · 시설', `${g.swims}회 · ${g.uses}회`);
    row('좋아하는 수온', `${g.prefTemp}°C`);
    if (g.favColor || g.favScent) row('취향', `${g.favColor ? COLOR_KO[g.favColor] ?? g.favColor : '-'} 풀 · ${g.favScent ? SCENT_KO[g.favScent] ?? g.favScent : '-'} 향`);
    if (friend) {
      const w = friend.activeWish !== null ? game.sns.wishesByFriend.get(friend.id)?.[friend.activeWish] ?? null : null;
      row('소원', w ? w.line : friend.stars >= 3 ? '전부 들어줬다' : '다음 소원을 준비 중');
      row('방문', `${friend.visits}회 · EXP ${friend.exp}`);
    }
    this.win.show();
  }
}

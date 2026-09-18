import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import { iconEl } from '../icons.js';
import { npcPortrait } from '../portraits.js'; // NPC v8(2026-09-18): 손님 초상 = 지도 위 같은 v8 룩(uid)
import { pictureEl, pictureId } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import type { Guest } from '../../sim/guest.js';
import { PACKAGES, type Game } from '../../sim/game.js';

const STATE_KO: Record<Guest['state'], string> = {
  enter: '입장 중', wander: '둘러보는 중', walk: '풀로 가는 중', swim: '수영 중', use: '시설 이용 중', leave: '나가는 중', climb: '슬라이드 오르는 중', ride: '슬라이드 타는 중', eat: '서서 먹는 중', queue: '줄 서는 중', gone: '떠남',
};

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
      // P56-b3 — 선물은 그림 카드 격자(장날과 같은 문법): 그림 · 값 · 못 구한 것은 잠금 · 돈이 모자라면 가라앉음. 탭 = 확인 뒤 선물
      const cards: PictureCard[] = [];
      for (const d of game.giftDefs) {
        if (friend.gifts.includes(d.id)) continue;
        const unlocked = game.unlocked.gifts.has(d.id);
        const can = unlocked && d.price <= game.money;
        const card: PictureCard = { id: d.id, name: d.name, art: pictureEl(pictureId('gift', d.id), 'gift'), price: `${d.price.toLocaleString('ko-KR')}G`, sub: d.kind === 'float' ? '튜브' : '수영복', desc: !unlocked ? '아직 구할 수 없는 선물' : d.price > game.money ? '돈이 모자란다' : `탭하면 선물 — 만족 +${Math.round(d.price / 8)}`, disabled: !can, data: { gift: d.id } };
        if (!unlocked) card.badge = 'lock';
        cards.push(card);
      }
      const grid = new PictureGrid({ name: 'guest-gifts', countLabel: '선물', onTap: (c) => {
        const d = game.giftDefs.find((x) => x.id === c.id);
        if (!d) return;
        confirmDialog({ title: `${g.name}에게 ${d.name}을 줄까요?`, body: `만족 +${Math.round(d.price / 8)}`, cost: d.price, onYes: () => {
          const r = game.giveGift(fid, d.id);
          this.host?.toast(r.ok ? `${g.name}에게 ${d.name} 선물 · −${d.price.toLocaleString('ko-KR')}G` : r.reason, r.ok);
          if (r.ok) { this.host?.onChanged(); this.show(g); }
        } });
      } });
      grid.render(cards);
      this.gifts.append(grid.root);
    }
    const face = el('span', 'kportrait big');
    face.append(npcPortrait(g.uid, g.sat >= 60 ? 'happy' : 'calm'));
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
    if (g.teamId !== null) row('팀', `#${g.teamId} · ${g.seatUid !== null ? '자리 있음' : '자리 찾는 중'}`); // P17
    if (g.stays) row('1박', '오늘 밤 여기서 잔다 — 내일 이어서 논다'); // P18
    if (g.pkg) row('패키지', `${PACKAGES.find((p) => p.id === g.pkg)?.name ?? g.pkg}${g.pkgUsed ? ' · 사용' : ' · 아직'}`);
    row('수영 · 시설', `${g.swims}회 · ${g.uses}회`);
    row('좋아하는 수온', `${g.prefTemp}°C`);
    if (friend) {
      const w = friend.activeWish !== null ? game.sns.wishesByFriend.get(friend.id)?.[friend.activeWish] ?? null : null;
      row('소원', w ? w.line : friend.stars >= 3 ? '전부 들어줬다' : '다음 소원을 준비 중');
      row('방문', `${friend.visits}회 · EXP ${friend.exp}`);
    }
    this.win.show();
  }
}

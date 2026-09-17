/**
 * SNS 창 — 탭 3: 타임라인(글·좋아요 버튼) · 메시지(소원: 조건 진행·보상) · 친구(별·방문·취향 + 지역 진행).
 * PSS 의 SNS 화면 문법 그대로. 좋아요·소원 도착은 **절대 모달이 아니다** — 여기서 읽는다.
 */
import { el } from '../dom.js';
import { COLOR_KO, SCENT_KO } from '../../sim/lines.js';
import { confirmDialog } from '../dialog.js';
import { drawPortrait } from '../../assets/draw/portrait.js';
import { iconEl } from '../icons.js';
import { WindowPanel } from '../window.js';
import { rewardArt, type SpriteFn } from '../reward-art.js';
import { pictureEl, pictureId } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import type { Game } from '../../sim/game.js';
import { ITEM_DEFS } from '../../sim/game.js';
import type { Post } from '../../sim/sns.js';

export type SnsTab = 'timeline' | 'messages' | 'friends';


export class SnsWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs');
  private readonly body = el('div', 'krows');
  private tab: SnsTab = 'timeline';
  /** 상자를 연 소원 (G27) — 표현 상태라 세이브가 아니라 localStorage */
  private readonly opened = new Set<string>(((): string[] => { try { return JSON.parse(localStorage.getItem('pj.wishOpened') ?? '[]') as string[]; } catch { return []; } })());
  private persistOpened(): void { try { localStorage.setItem('pj.wishOpened', JSON.stringify([...this.opened])); } catch { /* 저장 불가 환경 */ } }
  /** 검사용 — 아직 안 연 상자 수 */
  unopenedForTest(): number { const g = this.game(); let n = 0; for (const st of g.sns.unlockedFriends) for (const idx of st.done) if (!this.opened.has(`${st.id}:${idx}`)) n++; return n; }

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { thumb(post: Post): HTMLCanvasElement | null; toast(t: string, ok: boolean): void; onChanged(): void; celebrate?(text: string): void; sprite?: SpriteFn }) {
    this.win = new WindowPanel(parent, 'win-sns', 'SNS', 'blue');
    for (const [id, label] of [['timeline', '타임라인'], ['messages', '메시지'], ['friends', '친구']] as const) {
      const b = el('button', 'ktab');
      b.append(iconEl(id === 'timeline' ? 'timeline' : id === 'messages' ? 'message' : 'friends'), el('span', undefined, label));
      b.type = 'button';
      b.dataset['tab'] = id;
      b.addEventListener('click', () => { this.tab = id; this.render(); });
      this.tabs.append(b);
    }
    this.win.body.append(this.tabs, this.body);
  }

  get visible(): boolean {
    return this.win.visible;
  }

  show(tab?: SnsTab): void {
    if (tab) this.tab = tab;
    this.render();
    this.win.show();
  }

  hide(): void {
    this.win.hide();
  }

  render(): void {
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.tab);
    this.body.replaceChildren();
    if (this.tab === 'timeline') this.renderTimeline();
    else if (this.tab === 'messages') this.renderMessages();
    else this.renderFriends();
  }

  private renderTimeline(): void {
    const g = this.game();
    g.sns.markPostsSeen();
    const posts = [...g.sns.allPosts].reverse().slice(0, 40);
    const head = el('div', 'krow');
    head.append(el('span', 'krow-k', '총 좋아요'), el('span', 'krow-v', `${g.sns.totalLikes.toLocaleString('ko-KR')}`));
    this.body.append(head);
    if (posts.length === 0) {
      const empty = el('div', 'krow');
      empty.append(el('span', 'krow-k', '아직 글이 없다 — 손님이 놀고 나면 사진을 올린다'));
      this.body.append(empty);
      return;
    }
    for (const p of posts) {
      const row = el('div', 'krow kpost');
      row.dataset['post'] = String(p.id);
      const who = p.friendId ? (g.sns.friendDef(p.friendId)?.name ?? p.friendId) : '손님';
      const shot = el('span', 'kshot');
      const tc = this.host.thumb(p);
      if (tc) shot.append(tc); else shot.classList.add('kshot-empty');
      const face = el('span', 'kportrait');
      face.append(drawPortrait(p.palette ?? 0, (p.palette ?? 0) % 5, 'happy'));
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', `${who} · ${g.sns.areasById.get(p.areaId)?.name ?? p.areaId}`));
      text.append(el('span', 'krow-sub', `${p.subject.name} 에서 · ${p.day + 1}일차`));
      const like = el('button', `kchip klike${p.playerLiked ? ' on' : ''}`);
      like.type = 'button';
      like.dataset['like'] = String(p.id);
      like.append(iconEl('heart'), el('span', undefined, ` ${p.likes}`));
      like.setAttribute('aria-label', `좋아요 ${p.likes}`);
      like.addEventListener('click', () => {
        const r = g.likePost(p.id);
        this.host.toast(r.ok ? (r.friend ? `좋아요 +5 · ${r.friend.name} 소원 진행 +${r.friend.exp}` : '좋아요 +5') : r.reason, r.ok);
        if (r.ok) this.host.onChanged();
        this.render();
      });
      row.append(shot, face, text, like);
      this.body.append(row);
    }
  }

  private renderMessages(): void {
    const g = this.game();
    const active = g.sns.activeWishes();
    if (active.length === 0) {
      const empty = el('div', 'krow');
      empty.append(el('span', 'krow-k', '열린 소원이 없다 — 친구가 놀고 만족하면 부탁이 온다'));
      this.body.append(empty);
    }
    for (const { friend, wish } of active) {
      const v = g.evaluateCondition(wish.condition);
      const row = el('div', 'krow kwish');
      row.dataset['wish'] = `${friend.id}:${wish.idx}`;
      const fd = g.sns.friendDef(friend.id);
      const face = el('span', 'kportrait');
      face.append(drawPortrait(fd?.palette ?? 0, (fd?.palette ?? 0) % 5, 'calm'));
      const text = el('span', 'krow-text');
      const nameEl = el('span', 'krow-name', `${fd?.name ?? friend.id} `);
      for (let k = 0; k < 3; k++) { const ic = iconEl('star'); ic.dataset['on'] = k <= wish.idx ? '1' : '0'; nameEl.append(ic); }
      nameEl.append(el('span', undefined, ` — ${wish.line}`));
      text.append(nameEl);
      text.append(el('span', 'krow-sub', `${v.label} · ${v.met ? '충족 (오늘 마감에 달성)' : `진행 ${Math.round(v.progress * 100)}%`} · 창 ${Math.max(0, friend.windowUntilDay - g.day)}일 남음`));
      const reward = el('span', 'krow-v', rewardLabel(g, wish.reward) + invitedLabel(g, friend.id, wish.idx + 1));
      const art = el('span', 'kreward-art'); art.append(rewardArt(wish.reward, this.host.sprite)); // P56-a2 D8: 보상은 그림 카드
      row.append(face, text, art, reward);
      this.body.append(row);
    }
    // 완료된 소원 (기록)
    for (const st of g.sns.unlockedFriends) {
      for (const idx of st.done) {
        const wish = g.sns.wishesByFriend.get(st.id)?.[idx];
        if (!wish) continue;
        const row = el('div', 'krow kwish done');
        const key = `${st.id}:${idx}`;
        const doneArt = el('span', 'kreward-art'); doneArt.append(rewardArt(wish.reward, this.host.sprite));
        row.append(el('span', 'krow-k', `${g.sns.friendDef(st.id)?.name ?? st.id} 소원 ${idx + 1}단계 달성`), doneArt, el('span', 'krow-v', rewardLabel(g, wish.reward)));
        if (!this.opened.has(key)) {
          // 「받기」 연출 (G27) — 보상은 이미 sim 이 줬다. 상자를 여는 것은 표현이다 (모달 아님)
          const b = el('button', 'kbtn primary kopen', '상자 열기');
          b.type = 'button';
          b.dataset['open'] = key;
          b.addEventListener('click', () => { this.opened.add(key); this.persistOpened(); this.host.celebrate?.(rewardLabel(g, wish.reward)); this.render(); });
          row.append(b);
        }
        this.body.append(row);
      }
    }
  }

  private renderFriends(): void {
    const g = this.game();
    const prog = g.sns.areaProgress();
    const next = g.sns.nextArea();
    const head = el('div', 'krow');
    head.append(el('span', 'krow-k', `${prog ? g.sns.areasById.get(prog.areaId)?.name ?? prog.areaId : '-'} 좋아요`), el('span', 'krow-v', prog ? (next ? `${prog.likes.toLocaleString('ko-KR')} / ${prog.need.toLocaleString('ko-KR')} → ${next.name}` : `${prog.likes.toLocaleString('ko-KR')} · 전 지역 개방`) : '-'));
    this.body.append(head);
    // P5 — 출신지 소개 + 그 출신지에서 오는 버스 (좋아요가 문턱을 넘기면 아침에 온다)
    const cur = prog ? g.sns.areasById.get(prog.areaId) : undefined;
    const intro = el('div', 'krow');
    intro.id = 'sns-area-intro';
    intro.append(el('span', 'krow-k', cur ? cur.name : ''), el('span', 'krow-v', cur?.bus ? `${cur.bus} · 좋아요 ${(cur.busEvery ?? 0).toLocaleString('ko-KR')}마다` : '')); // P57-f: 설명은 아래 줄로 — 열쇠에 붙이면 값이 두 줄로 밀린다
    this.body.append(intro);
    if (cur?.desc) this.body.append(el('div', 'krow-sub', cur.desc)); // 행 밖 한 줄 — 행 안에 두면 열쇠·값을 민다
    if (next) {
      const nx = el('div', 'krow');
      nx.id = 'sns-area-next';
      nx.append(el('span', 'krow-k', `다음 출신지 · ${next.name}`), el('span', 'krow-v', next.bus ?? '')); // P57-f
      this.body.append(nx);
      if (next.desc) this.body.append(el('div', 'krow-sub', next.desc));
    }
    for (const st of g.sns.unlockedFriends) {
      const def = g.sns.friendDef(st.id);
      if (!def) continue;
      const row = el('div', 'krow kfriend');
      row.dataset['friend'] = st.id;
      const face = el('span', 'kportrait');
      face.append(drawPortrait(def.palette, def.palette % 5, st.stars >= 2 ? 'happy' : 'calm'));
      const text = el('span', 'krow-text');
      const nameRow = el('span', 'krow-name', `${def.name} `);
      const stars = el('span', 'kstars');
      for (let k = 0; k < 3; k++) { const ic = iconEl('star'); ic.dataset['on'] = k < st.stars ? '1' : '0'; stars.append(ic); }
      nameRow.append(stars);
      text.append(nameRow);
      text.append(el('span', 'krow-sub', `${g.sns.areasById.get(def.area)?.name ?? def.area} · ${def.age}대 · 좋아하는 물빛 ${COLOR_KO[def.fav.color] ?? def.fav.color} · 분위기 ${SCENT_KO[def.fav.scent] ?? def.fav.scent} · 방문 ${st.visits}`));
      const giftBtn = el('button', 'kchip', '선물');
      giftBtn.type = 'button';
      giftBtn.dataset['gift'] = st.id;
      giftBtn.addEventListener('click', () => this.renderGiftPicker(st.id));
      row.append(face, text, giftBtn);
      this.body.append(row);
    }
  }

  private renderGiftPicker(friendId: string): void {
    const g = this.game();
    this.body.replaceChildren();
    const back = el('button', 'kbtn', '← 친구 목록');
    back.type = 'button';
    back.addEventListener('click', () => this.render());
    this.body.append(back);
    const name = g.sns.friendDef(friendId)?.name ?? friendId;
    const st = g.sns.friends.get(friendId);
    // P56-b3 — 선물 고르기는 그림 카드 격자(손님 창과 같은 문법)
    const cards: PictureCard[] = [];
    for (const gift of g.sns.giftsById.values()) {
      if (!g.unlocked.gifts.has(gift.id)) continue;
      const given = st?.gifts.includes(gift.id) ?? false;
      const card: PictureCard = { id: gift.id, name: gift.name, art: pictureEl(pictureId('gift', gift.id), 'gift'), price: `${gift.price}G`, sub: gift.kind === 'float' ? '튜브' : '수영복', desc: given ? '이미 줬다' : gift.price > g.money ? '돈이 모자란다' : `탭하면 선물 — 만족 +${Math.round(gift.price / 8)} · 소원이 빨리 열린다`, disabled: given || gift.price > g.money, data: { giftId: gift.id } };
      if (given) card.badge = { text: '줬음' };
      cards.push(card);
    }
    const grid = new PictureGrid({ name: 'sns-gifts', countLabel: '선물', onTap: (c) => {
      const gift = g.sns.giftsById.get(c.id);
      if (!gift) return;
      confirmDialog({ title: `${name}에게 ${gift.name}을 줄까요?`, body: `만족 +${Math.round(gift.price / 8)} · 소원이 빨리 열린다`, cost: gift.price, onYes: () => {
        const r = g.giveGift(friendId, gift.id);
        this.host.toast(r.ok ? `${name}에게 ${gift.name} 선물 · −${gift.price}G` : r.reason, r.ok);
        if (r.ok) this.host.onChanged();
        this.tab = 'friends';
        this.render();
      } });
    } });
    grid.render(cards);
    this.body.append(grid.root);
  }
}

export function rewardLabel(g: Game, r: { kind: string; id?: string; amount?: number }): string {
  if (r.kind === 'money') return `${(r.amount ?? 0).toLocaleString('ko-KR')}G`;
  if (r.kind === 'facility') return `시설: ${g.facilities.def(r.id ?? '')?.name ?? r.id}`;
  if (r.kind === 'gift') return `선물: ${g.sns.giftsById.get(r.id ?? '')?.name ?? r.id}`;
  if (r.kind === 'ingredient') return `재료: ${g.cooking.ingredients.get(r.id ?? '')?.name ?? r.id}`;
  if (r.kind === 'item') return `아이템: ${ITEM_DEFS.get(r.id ?? '')?.name ?? r.id}`;
  return `${r.kind}: ${r.id ?? ''}`;
}

/** ☆ 달성으로 초대되는 친구 — 원작의 「실루엣」 보상 (G49 R2). 아직 안 온 친구는 이름을 가린다 */
function invitedLabel(g: Game, friendId: string, star: number): string {
  const inv = [...g.sns.friendsById.values()].filter((f) => f.invitedBy && f.invitedBy.friend === friendId && f.invitedBy.star === star);
  if (inv.length === 0) return '';
  return ' + 새 손님 ' + inv.map((f) => (g.sns.friends.has(f.id) ? f.name : '???')).join('·');
}

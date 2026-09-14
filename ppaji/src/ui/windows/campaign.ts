import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { iconEl, type IconName } from '../icons.js';
import { pictureEl } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';

/** 캠페인 종류 → 계열 아이콘 폴백 (그림 등록부 id `pic/campaign/<id>` 가 오면 그것) */
const KIND_ICON: Record<string, IconName> = { bus: 'friends', ad: 'sns', event: 'star', sale: 'coin' };

/** 캠페인 창 (P56-a2) — 카드 격자: 효과·비용·쿨다운 · 탭 = 확인 뒤 실행. 버스는 지역 고르기 행이 아래에 선다 */
export class CampaignWindow {
  private readonly win: WindowPanel;
  private readonly head = el('div', 'krow');
  private readonly grid: PictureGrid;
  private readonly areas = el('div', 'krows');
  private pickArea: string | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-campaign', '캠페인', 'blue');
    this.grid = new PictureGrid({ name: 'campaign', onTap: (c) => this.tap(c) });
    this.win.body.append(this.head, this.grid.root, this.areas);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    this.head.replaceChildren();
    const a = g.campaigns.state.active;
    this.head.append(el('span', 'krow-k', '진행 중'), el('span', 'krow-v', a && g.day < a.untilDay ? `${g.campaigns.defs.get(a.id)?.name ?? a.id} · ${a.untilDay - g.day}일 남음 (×${g.campaigns.mul(g.day)})` : '없음'));
    const cards: PictureCard[] = [];
    for (const d of g.campaigns.defs.values()) {
      const can = d.kind === 'bus' ? g.campaigns.canStart(d.id, g.day, g.money, g.sns.areas[0]) : g.campaigns.canStart(d.id, g.day, g.money);
      const card: PictureCard = {
        id: d.id, name: d.name, art: pictureEl(`pic/campaign/${d.id}`, KIND_ICON[d.kind ?? ''] ?? 'sns'),
        price: `${d.cost.toLocaleString('ko-KR')}G`, sub: d.kind === 'bus' ? '버스 · 지역 고르기' : '캠페인',
        desc: can.ok ? d.desc : can.reason, disabled: !can.ok, data: { campaign: d.id },
      };
      if (!can.ok) card.badge = 'lock';
      if (this.pickArea === d.id) card.badge = { text: '지역 선택' };
      cards.push(card);
    }
    this.grid.render(cards);
    if (this.pickArea !== null) this.grid.select(this.pickArea);
    this.areas.replaceChildren();
    if (this.pickArea !== null) this.renderAreas(this.pickArea);
  }

  private tap(c: PictureCard): void {
    const g = this.game();
    const d = g.campaigns.defs.get(c.id);
    if (!d) return;
    if (d.kind === 'bus') { this.pickArea = this.pickArea === d.id ? null : d.id; this.render(); return; }
    confirmDialog({ title: `${d.name}을 시작할까요?`, body: d.desc, cost: d.cost, onYes: () => {
      const r = g.campaign(d.id);
      this.host.toast(r.ok ? `${d.name} 시작!` : r.reason, r.ok);
      if (r.ok) this.host.onChanged();
      this.render();
    } });
  }

  /** 버스를 보낼 지역 (G33) — 열린 지역마다 친구 수 · 열린 소원 · 내일 올 버스 수 (원작 지역 선택 화면) */
  private renderAreas(campaignId: string): void {
    const g = this.game();
    const wishes = new Map<string, number>();
    for (const { friend } of g.sns.activeWishes()) { const a = g.sns.friendDef(friend.id)?.area; if (a) wishes.set(a, (wishes.get(a) ?? 0) + 1); }
    for (const areaId of g.sns.areas) {
      const def = g.sns.areasById.get(areaId);
      const friends = g.sns.unlockedFriends.filter((f) => g.sns.friendDef(f.id)?.area === areaId).length;
      const b = el('button', 'krow kcard-row karea');
      b.type = 'button';
      b.dataset['area'] = areaId;
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', `${def?.name ?? areaId}`), el('span', 'krow-sub', `친구 ${friends} · 열린 소원 ${wishes.get(areaId) ?? 0} · 내일 버스 ${g.busesPlannedFor(areaId)}대`));
      b.append(iconEl('friends'), text);
      b.addEventListener('click', () => confirmDialog({ title: `${def?.name ?? areaId}에서 버스를 부를까요?`, body: `내일부터 2일간 매일 아침 12명`, cost: g.campaigns.defs.get(campaignId)?.cost ?? 0, onYes: () => {
        const r = g.campaign(campaignId, areaId);
        this.host.toast(r.ok ? `${def?.name ?? areaId}행 버스 예약!` : r.reason, r.ok);
        if (r.ok) { this.pickArea = null; this.host.onChanged(); }
        this.render();
      } }));
      this.areas.append(b);
    }
  }
}

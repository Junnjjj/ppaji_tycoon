import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { iconEl } from '../icons.js';

/** 캠페인 창 — 카드 셋: 효과·비용·쿨다운 바 · 실행 */
export class CampaignWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-campaign', '캠페인', 'blue');
    this.win.body.append(this.body);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    this.body.replaceChildren();
    const a = g.campaigns.state.active;
    const head = el('div', 'krow');
    head.append(el('span', 'krow-k', '진행 중'), el('span', 'krow-v', a && g.day < a.untilDay ? `${g.campaigns.defs.get(a.id)?.name ?? a.id} · ${a.untilDay - g.day}일 남음 (×${g.campaigns.mul(g.day)})` : '없음'));
    this.body.append(head);
    for (const d of g.campaigns.defs.values()) {
      const can = g.campaigns.canStart(d.id, g.day, g.money);
      const row = el('button', 'krow kcard-row');
      row.type = 'button';
      row.dataset['campaign'] = d.id;
      row.disabled = !can.ok;
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', d.name), el('span', 'krow-sub', can.ok ? d.desc : can.reason));
      row.append(text, el('span', 'krow-v', `${d.cost.toLocaleString('ko-KR')}G`));
      row.addEventListener('click', () => {
        if (d.kind === 'bus') { this.pickArea = this.pickArea === d.id ? null : d.id; this.render(); return; }
        confirmDialog({ title: `${d.name}을 시작할까요?`, body: d.desc, cost: d.cost, onYes: () => {
          const r = g.campaign(d.id);
          this.host.toast(r.ok ? `${d.name} 시작!` : r.reason, r.ok);
          if (r.ok) this.host.onChanged();
          this.render();
        } });
      });
      if (d.kind === 'bus') row.disabled = !g.campaigns.canStart(d.id, g.day, g.money, g.sns.areas[0]).ok;
      this.body.append(row);
      if (d.kind === 'bus' && this.pickArea === d.id) this.renderAreas(d.id);
    }
  }

  private pickArea: string | null = null;

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
      this.body.append(b);
    }
  }
}

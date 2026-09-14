import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { FACILITY_MAX_LEVEL } from '../../sim/facility.js';
import { FEATURES } from '../../sim/game.js';

/** 시설 정보 카드 — 지도에서 시설 탭. 지표 + `철거` */
export class FacilityInfoWindow {
  private readonly win: WindowPanel;
  private readonly rows = el('div', 'krows');
  private readonly removeBtn: HTMLButtonElement;
  private uid: number | null = null;

  private readonly menuBtn: HTMLButtonElement;
  private readonly upBtn: HTMLButtonElement;
  private readonly moveBtn: HTMLButtonElement;

  private readonly thumb = el('div', 'kthumb');
  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly onRemoved: () => void, private readonly toast: (t: string, ok: boolean) => void, private readonly onMenu: (uid: number) => void = () => undefined, private readonly thumbOf: (defId: string) => HTMLCanvasElement | null = () => null, private readonly onMove: (uid: number) => void = () => undefined) {
    this.win = new WindowPanel(parent, 'win-facility', '시설', 'blue');
    this.removeBtn = el('button', 'kbtn', '철거');
    this.removeBtn.type = 'button';
    this.removeBtn.id = 'win-facility-remove';
    this.removeBtn.addEventListener('click', () => {
      if (this.uid === null) return;
      const r = this.game().removeFacility(this.uid);
      this.toast(r.ok ? '철거했다' : r.reason, r.ok);
      if (r.ok) { this.win.hide(); this.onRemoved(); }
    });
    this.menuBtn = el('button', 'kbtn primary', '메뉴 편집');
    this.menuBtn.type = 'button';
    this.menuBtn.id = 'win-facility-menu';
    this.menuBtn.addEventListener('click', () => { if (this.uid !== null) { const u = this.uid; this.win.hide(); this.onMenu(u); } });
    this.upBtn = el('button', 'kbtn', '개선');
    this.upBtn.type = 'button';
    this.upBtn.id = 'win-facility-upgrade';
    this.upBtn.addEventListener('click', () => {
      if (this.uid === null) return;
      const r = this.game().upgradeFacility(this.uid);
      this.toast(r.ok ? `개선 완료 — Lv${this.game().facilities.byUid(this.uid)?.level ?? '?'}` : r.reason, r.ok);
      if (r.ok) { this.onRemoved(); this.show(this.uid); }
    });
    // G52: 이동 (원작 이동 도구 — 없으면 이유가 버튼에 적힌다)
    this.moveBtn = el('button', 'kbtn', '이동');
    this.moveBtn.type = 'button';
    this.moveBtn.id = 'win-facility-move';
    this.moveBtn.addEventListener('click', () => { if (this.uid !== null) { const u = this.uid; this.win.hide(); this.onMove(u); } });
    const actions = el('div', 'kdock-row');
    actions.append(this.upBtn, this.moveBtn, this.menuBtn, this.removeBtn);
    this.win.body.append(this.thumb, this.rows, actions);
  }

  show(uid: number): void {
    const f = this.game().facilities.byUid(uid);
    if (!f) return;
    const def = this.game().facilities.defOf(f);
    this.uid = uid;
    const all = this.game().facilities.all;
    const idx = all.findIndex((x) => x.uid === uid);
    this.win.setTitle(`시설 정보 ${idx + 1}/${all.length}`);
    this.rows.replaceChildren();
    // 페이지 넘김 (원작 「시설정보 8/19」 ◀ ▶) + 이름 띠
    const nav = el('div', 'kfac-nav');
    const prev = el('button', 'kbtn', '◀'); prev.type = 'button'; prev.dataset['prev'] = '1'; prev.setAttribute('aria-label', '이전 시설');
    const next = el('button', 'kbtn', '▶'); next.type = 'button'; next.dataset['next'] = '1'; next.setAttribute('aria-label', '다음 시설');
    prev.disabled = all.length < 2; next.disabled = all.length < 2;
    prev.addEventListener('click', () => { const t = all[(idx - 1 + all.length) % all.length]; if (t) this.show(t.uid); });
    next.addEventListener('click', () => { const t = all[(idx + 1) % all.length]; if (t) this.show(t.uid); });
    nav.append(prev, el('span', 'krow-name', FEATURES.facilityLevels ? `${def.name} Lv${f.level}` : def.name), next);
    this.rows.append(nav);
    const ICON: Record<string, IconName> = { '인기': 'star', '정원': 'friends', '유지비': 'coin', '오늘 이용 · 수입': 'coin', '누적 이용 · 수입': 'coin', '이용료': 'coin', '메뉴': 'restaurant' };
    const row = (k: string, v: string): void => {
      const r = el('div', 'krow');
      const ic = ICON[k];
      if (ic) r.append(iconEl(ic));
      r.append(el('span', 'krow-k', k), el('span', ic && k !== '메뉴' ? 'krow-v knum' : 'krow-v', v));
      this.rows.append(r);
    };
    this.thumb.replaceChildren();
    const tc = this.thumbOf(def.id);
    if (tc) this.thumb.append(tc);
    const g = this.game();
    row('인기', `${g.facilityPop(f)}${f.level > 1 ? ` (기본 ${def.pop})` : ''}`);
    if (def.capacity > 0) row('정원', `${g.facilityCapacity(f)}명`);
    row('유지비', `${def.maint}G / 일`);
    row('오늘 이용 · 수입', `${f.usesToday}명 · ${f.incomeToday.toLocaleString('ko-KR')}G`);
    row('누적 이용 · 수입', `${f.usesTotal.toLocaleString('ko-KR')}명 · ${f.incomeTotal.toLocaleString('ko-KR')}G`);
    const up = g.canUpgrade(uid);
    this.upBtn.textContent = f.level >= FACILITY_MAX_LEVEL ? '최고 단계' : `개선 Lv${f.level + 1} · ${(up.cost ?? 0).toLocaleString('ko-KR')}G`;
    this.upBtn.disabled = !up.ok;
    this.upBtn.classList.toggle('khide', !FEATURES.facilityLevels);
    if (def.usageFee) row('이용료', `${def.usageFee}G / 일${f.rentedBy !== null ? ' · 대여 중' : ''}`);
    if (def.scent) row('향', `${def.scent} (${def.scentPower})`);
    if (def.heat) row('열', `${def.heat > 0 ? '+' : ''}${def.heat}°C`);
    if (def.se || def.ab) row('풀 보너스', `SE ${def.se} · AB ${def.ab}`);
    if (def.menuSlots > 0) {
      const eq = this.game().menus.equipped(uid);
      row('메뉴', eq.length ? `${eq.map((r) => r.name).join(' · ')} (+${this.game().menus.menuPopularity(uid, def.id)})` : '비어 있다');
    }
    this.rows.append(el('div', 'krow-sub kfac-desc', def.desc));
    this.menuBtn.classList.toggle('khide', def.menuSlots === 0);
    const canMove = this.game().tools.has('move');
    this.moveBtn.disabled = !canMove;
    this.moveBtn.textContent = canMove ? '이동' : '이동 · 도구 필요';
    this.win.show();
  }
}

import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';
import { FacilityStore } from '../../sim/facility.js';
import { RIG_UPGRADES } from '../../sim/rig-upgrade.js';
import { Game } from '../../sim/game.js';
import { FACILITY_MAX_LEVEL } from '../../sim/facility.js';
import { PART_TIMER_WAGE, staffable } from '../../sim/facility.js';
import { FEATURES } from '../../sim/game.js';
import { canvasPictureEl, pictureEl, pictureId } from '../pictures.js';
import { sceneCard } from '../scene-card.js';

/** 시설 정보 카드 — 지도에서 시설 탭. 지표 + `철거` */
export class FacilityInfoWindow {
  /** P30 — 정보 창을 닫은 뒤 반경 표시가 남는 시간. 실측: 창이 지도를 덮어 열려 있는 동안은 링이 안 보였다 */
  static readonly OVERLAY_LINGER_MS = 5000;
  private overlaySeq = 0;
  private readonly win: WindowPanel;
  private readonly rows = el('div', 'krows');
  private readonly removeBtn: HTMLButtonElement;
  private readonly courtBtn: HTMLButtonElement;
  private uid: number | null = null;

  private readonly menuBtn: HTMLButtonElement;
  private readonly upBtn: HTMLButtonElement;
  private readonly moveBtn: HTMLButtonElement;
  private readonly staffBtn: HTMLButtonElement;

  private readonly thumb = el('div', 'kthumb');
  /** P56-a — 개조 「전 → 후」 카드의 시설 그림. main 이 넣는다 */
  sprite: (facId: string) => HTMLCanvasElement | null = () => null;
  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly onRemoved: () => void, private readonly toast: (t: string, ok: boolean) => void, private readonly onMenu: (uid: number) => void = () => undefined, private readonly thumbOf: (defId: string) => HTMLCanvasElement | null = () => null, private readonly onMove: (uid: number) => void = () => undefined, private readonly onSelect: (tiles: readonly { i: number; j: number }[]) => void = () => undefined) {
    this.win = new WindowPanel(parent, 'win-facility', '시설', 'blue');
    // P30 D38: 창이 지도를 덮으므로 링은 창을 닫은 뒤에 보인다 — 닫고 나서 OVERLAY_LINGER_MS 동안 남기고 걷는다 (그 사이 다른 선택이 오면 그쪽이 이긴다)
    this.win.onClose = () => { const tok = ++this.overlaySeq; window.setTimeout(() => { if (tok === this.overlaySeq) this.onSelect([]); }, FacilityInfoWindow.OVERLAY_LINGER_MS); };
    this.removeBtn = el('button', 'kbtn', '철거');
    this.courtBtn = el('button', 'kbtn', '푸드코트 지우기'); this.courtBtn.id = 'win-facility-court-remove'; // P58-a: 파생 시설(식탁)은 영역째 지운다
    this.courtBtn.addEventListener('click', () => { const g = this.game(); if (this.uid === null) return; const id = g.foodCourtOfSeat(this.uid); if (id === null) return; const r = g.removeFoodCourt(id); this.toast(r.ok ? '푸드코트를 지웠다' : r.reason, r.ok); if (r.ok) { this.onRemoved(); this.win.hide(); } });
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
    // P8 (D14): 알바 슬롯 — 직원 창 대신 시설 정보 창의 버튼 하나
    this.staffBtn = el('button', 'kbtn', '알바');
    this.staffBtn.type = 'button';
    this.staffBtn.id = 'win-facility-staff';
    this.staffBtn.addEventListener('click', () => {
      if (this.uid === null) return;
      const g = this.game();
      const f = g.facilities.byUid(this.uid);
      if (!f) return;
      const r = g.setStaffed(this.uid, !f.staff);
      this.toast(r.ok ? (f.staff ? `알바 고용 · ${PART_TIMER_WAGE}G/일` : '알바를 내보냈다') : r.reason, r.ok);
      if (r.ok) { this.onRemoved(); this.show(this.uid); }
    });
    const actions = el('div', 'kdock-row kwrap'); // P57-f: 버튼 5개 — 글자 대신 행이 접힌다
    actions.append(this.upBtn, this.staffBtn, this.moveBtn, this.menuBtn, this.removeBtn, this.courtBtn);
    this.win.body.append(this.thumb, this.rows);
    const foot = el('div', 'kwin-foot'); foot.append(actions); this.win.root.append(foot); // P57-f: 버튼 행은 스크롤 본문 밖 하단 고정 — 두 줄로 접혀도 화면 밖으로 안 밀린다(「버튼 줄은 절대 안 잘린다」)
  }

  /** 하네스 전용 — 남은 링을 즉시 걷는다 (타이머를 기다리지 않게) */
  clearOverlayForTest(): void { this.overlaySeq++; this.onSelect([]); }

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
    row('유지비', `${def.maint + (f.staff ? PART_TIMER_WAGE : 0)}G / 일${f.staff ? ` (알바 ${PART_TIMER_WAGE} 포함)` : ''}`);
    { const v = g.viewOf(f); if (['lounging', 'restaurant', 'attraction'].includes(def.class)) row('뷰', v > 0 ? `${v}/4 · 강이 보인다 (인기 +${g.viewBonusOf(f)})` : '0/4 · 강이 안 보인다 — 물가 쪽에 두면 인기가 오른다'); } // S4: 글리프 리터럴 대신 숫자
    { const cs = g.combosOf(uid); if (cs.length) row('콤보', cs.map((c) => c.def.name).join(' · ')); }
    if (def.class !== 'decor') { const sc = g.sceneryOf(uid); row('경관', sc > 0 ? `+${sc} — 인기 +${Math.min(20, Math.floor(sc / 6))}${def.menuSlots > 0 ? ` · 판매가 +${Math.min(10, Math.floor(sc / 4))}%` : ''}` : '0 — 반경 2 에 꽃·나무·지면을 두면 오른다'); } // P26 D32
    if (def.class === 'rig' && def.onRing !== true) { // P50-b2 facility-info 3행 + 오버레이(같은 사슬 발자국)
      const lit = g.rigState.lit.has(uid), len = g.rigState.chainLen.get(uid) ?? 0, kinds = g.rigState.chainKinds.get(uid) ?? 0;
      row('켜짐', lit ? '켜짐 — 링에 이어져 손님이 탄다' : '꺼짐 — 링(데크)이나 켜진 기구에 4이웃으로 닿아야 켜진다');
      row('사슬', lit && def.chain ? `${def.chain} 계열 ${len}개 · 종 ${kinds} · 정원 ×${Math.min(2, Math.max(1, Math.sqrt(len / 2))).toFixed(2)}` : def.chain ? `${def.chain} 계열 — 켜지면 잇는다` : '계열 없음(정원 ×1)');
      { const pid = g.poolOfFacility(uid); row('소속 빠지', pid === null ? '—' : `${g.pools.byId(pid)?.name ?? `수역 #${pid}`} · 등급 ${g.ppajiGradeOf(pid)}`); }
      if (lit) { const tiles: { i: number; j: number }[] = []; for (const o of g.facilities.all) { const od = g.facilities.defOf(o); if (od.class === 'rig' && od.onRing !== true && g.rigState.lit.has(o.uid) && (od.chain ?? null) === (def.chain ?? null) && def.chain && (g.rigState.chainLen.get(o.uid) ?? 0) === len) tiles.push(...FacilityStore.footprint(od, o.i, o.j, o.facing)); } this.onSelect(tiles); }
    } else row('길', g.facilityHasPath(uid) ? '입구에서 닿는다' : '길이 안 닿는다 — 수역 독 「길」 탭으로 잔디에 길을 이으세요'); // P16 · P50-a: 기구는 자동 길 면제
    if (staffable(def)) row('알바', f.staff ? (def.class === 'restaurant' ? '있음 — 손님 만족·기운 +20%' : def.class === 'utility' ? '있음 — 청결 +10/일' : '있음 — 안전요원, 덜 지친다') : '없음');
    row('오늘 이용 · 수입', `${f.usesToday}명 · ${f.incomeToday.toLocaleString('ko-KR')}G`);
    row('누적 이용 · 수입', `${f.usesTotal.toLocaleString('ko-KR')}명 · ${f.incomeTotal.toLocaleString('ko-KR')}G`);
    if (def.class === 'rig' || def.onRing === true) { // P51 개조 — 아는 레시피마다 버튼 하나(미리보기 네 값 + 개조비) · 모르면 「기구 개조」 안내
      row('어제 수입', f.incomeYest === undefined ? '—' : `${f.incomeYest.toLocaleString('ko-KR')}G`);
      const ups = g.rigs.upgradesFor(def.id);
      const all = RIG_UPGRADES.filter((r) => r.from === def.id);
      if (all.length === 0) row('개조', '개조판 없음');
      else if (ups.length === 0) row('개조', `아직 모른다 — 메뉴 「기구 개조」에서 부품을 섞어 ${all.map((r) => r.name).join('·')}을(를) 찾자`);
      for (const up of ups) {
        // P56-a D4: 「전 → 후」 장면 카드 — 두 그림(스프라이트)과 지표 차이 세 줄, 그 아래 「개조 착수」 한 버튼
        const pv = g.convertPreview(uid, up.to);
        const to = g.facilities.defById(up.to);
        const d = (a: number, b: number): string => a === b ? '' : `${b - a > 0 ? '+' : ''}${b - a} UP`;
        const nt = pv.ok ? (pv.thrill ?? 0) : (to?.thrill ?? 0), nc = pv.ok ? (pv.capacity ?? 0) : (to?.capacity ?? 0), ns = pv.ok ? (pv.safe ?? 0) : (to?.safe ?? 0);
        const wrap = el('div', 'kpconvert');
        wrap.dataset['convertCard'] = up.to;
        wrap.append(sceneCard({
          art: canvasPictureEl(this.sprite(def.id), 'build'), artAfter: canvasPictureEl(this.sprite(up.to), 'build'), title: `${def.name} → ${up.name}`,
          score: { label: '개조비', value: pv.ok ? `${(pv.cost ?? 0).toLocaleString('ko-KR')}G` : '—' },
          axes: [
            { label: '스릴', icon: 'attraction', value: String(nt), gauge: Math.min(5, nt), note: d(def.thrill ?? 0, nt) },
            { label: '정원', icon: 'friends', value: `${nc}인`, gauge: Math.min(5, Math.ceil(nc / 2)), note: d(def.capacity, nc) },
            { label: '안전', icon: 'check', value: String(ns), gauge: Math.min(5, ns), note: d(def.safe ?? 0, ns) },
          ],
          mood: pv.ok ? 'happy' : 'calm',
        }));
        const b = el('button', 'kbtn primary', pv.ok ? `개조 착수 · ${(pv.cost ?? 0).toLocaleString('ko-KR')}G` : `개조 불가 · ${pv.reason}`);
        b.type = 'button'; b.dataset['convert'] = up.to; b.disabled = !pv.ok || (pv.cost ?? 0) > g.money;
        b.addEventListener('click', () => { const r = g.convertFacility(uid, up.to); this.toast(r.ok ? `개조 완료 — ${up.name} −${(r.cost ?? 0).toLocaleString('ko-KR')}G` : (r.reason ?? ''), r.ok); if (r.ok) { this.onRemoved(); this.show(uid); } });
        wrap.append(b);
        this.rows.append(wrap);
      }
    }
    const up = g.canUpgrade(uid);
    this.upBtn.textContent = f.level >= FACILITY_MAX_LEVEL ? '최고 단계' : `개선 Lv${f.level + 1} · ${(up.cost ?? 0).toLocaleString('ko-KR')}G`;
    this.upBtn.disabled = !up.ok;
    this.upBtn.classList.toggle('khide', !FEATURES.facilityLevels);
    if (def.usageFee) row('이용료', `${def.usageFee}G / 일${f.rentedBy !== null ? (f.rentedBy < 0 ? ` · 팀 #${-1 - f.rentedBy} 자리` : ' · 대여 중') : ''}`);
    if (def.lodging) row('숙박', `${g.guests.all.filter((x) => x.stays && x.seatUid === uid).length}명 잔다 · 1박 ${def.usageFee}G/인 — 폐장 뒤에도 남아 내일 이어서 논다`); // P18
    if (def.class === 'lounging') { const sg = g.seatGradeOf(uid); const plus = [sg.water ? '물 +2' : null, sg.shade ? '그늘' : null, sg.view ? '뷰' : null, sg.garden ? '조경' : null, sg.food ? '먹거리' : null].filter(Boolean).join(' · '); const minus = [sg.dirty ? '화장실 −1' : null, sg.loud ? '소음 −1' : null].filter(Boolean).join(' · '); const stars = el('span', 'kstars'); for (let k = 0; k < 5; k++) { const st = iconEl('star'); st.classList.toggle('kdim', k >= sg.grade); stars.append(st); } const line = el('span'); line.append(stars, ` ${sg.grade}/5 — ${plus || '맨 자리'}${minus ? ` / ${minus}` : ''}`); row('등급', ''); this.rows.lastElementChild?.lastElementChild?.replaceChildren(line); } // P24 D29
    // P30 D38 — 상시 오버레이: 평상은 반경 3 과 「빠진 것」, 매점·샤워장은 먹여 주는 자리를 지도에 켠다 (조준 중에만 보이던 링을 탭에도)
    if (def.class === 'lounging') {
      const sg = g.seatGradeOf(uid);
      const miss = [sg.shade ? null : '그늘', sg.food ? null : '먹거리', sg.garden ? null : '조경', sg.dirty ? '화장실 −1' : null, sg.loud ? '소음 −1' : null].filter((x): x is string => x !== null);
      row('빠진 것', miss.length ? `${miss.join(' · ')} — 반경 ${Game.SEAT_RADIUS} 안에 두면 등급이 오른다` : '없음 — 다 갖췄다');
      this.onSelect(g.seatRadiusTiles(def, f.i, f.j, f.facing));
    } else if (def.menuSlots > 0 || def.id === 'shower_row') {
      this.onSelect(g.seatsFedTiles(def, f.i, f.j, f.facing, uid)); // 「먹여 주는 자리 n곳」 행과 같은 규칙
    } else this.onSelect([]);
    if (def.class === 'lounging') { const pks = g.seatPackages(uid); row('패키지', pks.length ? pks.map((p) => p.name).join(' · ') : '없음 — 반경 3 에 먹거리·물·선착장을 두면 생긴다'); } // P25 D31
    if (def.menuSlots > 0 || def.id === 'shower_row') row('먹여 주는 자리', `${g.seatsFedAt(def, f.i, f.j, f.facing, uid)}곳 (반경 ${Game.SEAT_RADIUS})`); // P24 D33
    if (def.scent) row('향', `${def.scent} (${def.scentPower})`);
    if (def.heat) row('열', `${def.heat > 0 ? '+' : ''}${def.heat}°C`);
    if (def.se || def.ab) row('풀 보너스', `SE ${def.se} · AB ${def.ab}`);
    if (def.menuSlots > 0) {
      const eq = this.game().menus.equipped(uid);
      row('메뉴', eq.length ? `${eq.map((r) => r.name).join(' · ')} (+${this.game().menus.menuPopularity(uid, def.id)})` : '비어 있다');
      if (eq.length) { const pics = el('span', 'kmenu-pics'); for (const r of eq) { const a = el('span', 'kmenu-pic'); a.append(pictureEl(pictureId('recipe', r.id), 'cook')); a.dataset['menuPic'] = r.id; pics.append(a); } this.rows.lastElementChild?.querySelector('.krow-v')?.prepend(pics); this.rows.lastElementChild?.classList.add('kfac-menu-row'); } // P56-b3: 걸린 메뉴 그림은 같은 줄 안에 — 새 줄을 끼우면 아래 버튼(메뉴 편집·알바)이 화면 밖으로 밀려 실터치가 빗나간다(G6·P8 실측)
    }
    this.rows.append(el('div', 'krow-sub kfac-desc', def.desc));
    this.menuBtn.classList.toggle('khide', def.menuSlots === 0);
    { const derived = def.derived === true; this.courtBtn.classList.toggle('khide', !derived); this.removeBtn.classList.toggle('khide', derived); this.moveBtn.classList.toggle('khide', derived); this.upBtn.classList.toggle('khide', derived); this.staffBtn.classList.toggle('khide', derived); } // P58-a: 식탁은 영역이 놓은 것 — 개별 이동·철거·개선·알바 없음
    const canStaff = staffable(def);
    this.staffBtn.classList.toggle('khide', !canStaff);
    this.staffBtn.textContent = f.staff ? '알바 해고' : `알바 고용 · ${PART_TIMER_WAGE}G/일`;
    const canMove = this.game().tools.has('move');
    this.moveBtn.disabled = !canMove;
    this.moveBtn.textContent = canMove ? '이동' : '이동 · 도구 필요';
    this.win.show();
  }
}

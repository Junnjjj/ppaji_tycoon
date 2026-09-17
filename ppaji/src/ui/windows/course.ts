/**
 * 코스 독 (P4-C, 빠지 `.kcourse` 를 워터파크 독 문법으로) — 하단 바 자리를 대신 차지한다.
 * 문법: 선착장(지도 표식 탭으로 고름) → 형태 칩 → 기구 칩(◎○△ 적합도) → 지도에서 핸들을 끈다 → 지표 한 줄 → 시험 운행(4초) → 적용.
 * 놓인 코스는 칩으로 골라 정보를 보고 철거한다. 시간은 독이 떠 있는 동안 멈추지 않는다(수역 독과 같다).
 */
import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { pictureEl, pictureId } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js'; // W-17
import { setUiSurface } from '../panels.js';
import type { Game } from '../../sim/game.js';
import { PRESETS, COURSE_EQUIPMENT, fitOf, presetDef, courseEquipment, type CourseEditDraft, type DockChoice } from '../../sim/course/course.js';

export interface CourseDockHost {
  scene: {
    setCourseOverlay(handles: readonly { x: number; y: number }[], bad: readonly number[], dock: { x: number; y: number } | null, options?: { interactive?: boolean }): void;
    setDockChoices(tips: readonly { x: number; y: number; claim?: { x: number; y: number }[] }[], selected: number): void;
    frameCourse(dock: { x: number; y: number } | null, handles: readonly { x: number; y: number }[], bottomInsetCss?: number): void;
    startCourseTrial(path: readonly { x: number; y: number }[], durationMs: number, reactions: readonly { progress: number; text: string }[]): void;
    clearCourseTrial(): void;
  };
  toast(text: string, ok: boolean): void;
  onChanged(): void;
}

const FIT_MARK: Record<string, string> = { best: '◎', ok: '○', poor: '△', no: '×' };

export class CourseDock {
  readonly root: HTMLDivElement;
  private readonly modeLabel = el('span', 'kdock-mode', '코스 그리기');
  private readonly costLabel = el('span', 'kdock-cost', '');
  private readonly status = el('div', 'kdock-status', '');
  private readonly presets = el('div', 'kchips');
  private readonly equipGrid = new PictureGrid({ name: 'course-gear', onTap: (c) => this.tapEquip(c), noFooter: true, cols: 4 }); // W-17: 튜브는 카드 격자(팔찌 창과 같은 문법) — 칩 33 가로 스크롤 폐기
  private readonly equips = this.equipGrid.root;
  private equipCtx: { d: { presetId: string; equipId: string; dock: { x: number; y: number } }; editing: boolean } | null = null;
  private readonly list = el('div', 'kchips');
  private readonly applyBtn: HTMLButtonElement;
  private readonly trialBtn: HTMLButtonElement;
  /** P52-b — 안전 브리핑 토글(보는 코스에서만) */
  private readonly briefBtn: HTMLButtonElement;
  private readonly removeBtn: HTMLButtonElement;
  private draft: CourseEditDraft | null = null;
  private docks: DockChoice[] = [];
  private dockIndex = -1;
  private viewing: number | null = null; // 놓인 코스를 보는 중이면 그 handle
  private active = false;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: CourseDockHost) {
    this.root = el('div', 'kdock');
    this.root.id = 'dock-course';
    this.root.hidden = true;
    const row1 = el('div', 'kdock-row'); row1.append(this.modeLabel, this.costLabel);
    const actions = el('div', 'kdock-row');
    const cancel = el('button', 'kbtn', '닫기'); cancel.type = 'button'; cancel.id = 'dock-course-cancel'; cancel.addEventListener('click', () => this.exit());
    this.trialBtn = el('button', 'kbtn', '시험 운행'); this.trialBtn.type = 'button'; this.trialBtn.id = 'dock-course-trial'; this.trialBtn.addEventListener('click', () => this.trial());
    this.removeBtn = el('button', 'kbtn', '철거'); this.removeBtn.type = 'button'; this.removeBtn.id = 'dock-course-remove'; this.removeBtn.addEventListener('click', () => this.remove());
    this.applyBtn = el('button', 'kbtn primary', ''); this.applyBtn.append(iconEl('check'), el('span', undefined, ' 적용')); this.applyBtn.type = 'button'; this.applyBtn.id = 'dock-course-apply'; this.applyBtn.addEventListener('click', () => this.apply());
    this.briefBtn = el('button', 'kbtn khide', '브리핑'); this.briefBtn.type = 'button'; this.briefBtn.id = 'dock-course-brief'; this.briefBtn.addEventListener('click', () => { if (this.viewing === null) return; const g = this.game(); const c = g.courses.byHandle(this.viewing); const r = g.setCourseBriefing(this.viewing, !(c?.safetyBriefing === true)); this.host.toast(r.ok ? (c?.safetyBriefing ? '브리핑 켜짐 — 사고 ×0.7' : '브리핑 끔') : (r.reason ?? ''), r.ok); this.refresh(); }); // P52-b
    actions.append(cancel, this.trialBtn, this.briefBtn, this.removeBtn, this.applyBtn);
    this.root.append(row1, this.status, this.list, this.presets, this.equips, actions);
    parent.append(this.root);
  }

  get isActive(): boolean { return this.active; }
  get currentDraft(): CourseEditDraft | null { return this.draft ? { ...this.draft, handles: this.draft.handles.map((h) => ({ ...h })), dock: { ...this.draft.dock } } : null; }

  /** 진입 — 선착장이 없으면 이유만 말한다. handle 을 주면 놓인 코스를 본다 */
  enter(handle?: number): boolean {
    const g = this.game();
    this.docks = g.dockChoices();
    if (this.docks.length === 0) { this.host.toast('선착장이 없습니다 — 데크 위에 선착장을 지으세요', false); return false; }
    this.active = true;
    this.root.hidden = false;
    setUiSurface('build');
    if (handle !== undefined && g.courseFor(handle)) this.view(handle);
    else this.newDraft();
    return true;
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.draft = null; this.viewing = null;
    this.root.hidden = true;
    this.host.scene.clearCourseTrial();
    this.host.scene.setCourseOverlay([], [], null);
    this.host.scene.setDockChoices([], -1);
    setUiSurface('home');
  }

  private newDraft(presetId?: string, equipId?: string, dockTip?: { i: number; j: number }): void {
    const g = this.game();
    this.viewing = null;
    const s = g.suggestCourse(dockTip, { ...(presetId ? { presetId } : {}), ...(equipId ? { equipId } : {}) });
    if (!s.ok) { this.draft = null; this.dockIndex = -1; this.status.textContent = s.reason; this.host.scene.setCourseOverlay([], [], null); this.host.scene.setDockChoices(this.docks.map((d) => ({ x: d.tip.x, y: d.tip.y, ...(d.claim ? { claim: d.claim } : {}) })), -1); this.refresh(); return; }
    this.draft = s.draft; this.dockIndex = s.dockIndex;
    this.host.scene.frameCourse(this.draft.dock, this.draft.handles, 150);
    this.refresh();
  }

  private view(handle: number): void {
    const c = this.game().courseFor(handle);
    if (!c) return;
    this.viewing = handle;
    this.draft = { presetId: c.presetId, equipId: c.equipId, vehicles: c.vehicles, dock: { ...c.dock }, handles: c.handles.map((h) => ({ ...h })), ...(c.towBoatId ? { towBoatId: c.towBoatId } : {}) };
    this.dockIndex = this.docks.findIndex((d) => (d.claim ?? [d.tip]).some((t) => Math.abs(t.x - c.dock.x) <= 1 && Math.abs(t.y - c.dock.y) <= 1));
    this.host.scene.frameCourse(c.dock, c.handles, 150);
    this.refresh();
  }

  /** 씬이 부른다 — 핸들을 끌었다 */
  onHandleMove(index: number, i: number, j: number): void {
    if (!this.draft || this.viewing !== null) return;
    const h = this.draft.handles[index];
    if (!h) return;
    h.x = i; h.y = j;
    this.refresh(false);
  }

  /** W-17 — 기구 카드 탭: 안 가진 것은 사고 나서 고른다 */
  private tapEquip(c: PictureCard): void {
    const ctx = this.equipCtx; if (!ctx || !ctx.editing) return;
    const g = this.game();
    const e = COURSE_EQUIPMENT.find((x) => x.id === c.id); if (!e) return;
    if (!g.courses.ownedEquipment.has(e.id)) { const r = g.buyEquipment(e.id); this.host.toast(r.ok ? `${e.name} 구입 · −${e.vehicleCost.toLocaleString('ko-KR')}G` : r.reason, r.ok); if (!r.ok) return; this.host.onChanged(); }
    this.newDraft(ctx.d.presetId, e.id, { i: ctx.d.dock.x, j: ctx.d.dock.y });
  }

  /** 씬이 부른다 — 선착장 표식을 탭했다 */
  onDockPick(index: number): void {
    const d = this.docks[index];
    if (!d || !this.draft) return;
    this.newDraft(this.draft.presetId, this.draft.equipId, { i: d.tip.x, j: d.tip.y });
  }

  private refresh(redraw = true): void {
    const g = this.game();
    const d = this.draft;
    this.list.replaceChildren();
    for (const c of g.courses.all) {
      const b = el('button', `kchip${this.viewing === c.handle ? ' on' : ''}`, `${presetDef(c.presetId)?.name ?? c.presetId} · ${courseEquipment(c.equipId)?.name ?? c.equipId}`);
      b.type = 'button'; b.dataset['course'] = String(c.handle);
      b.addEventListener('click', () => this.view(c.handle));
      this.list.append(b);
    }
    const fresh = el('button', `kchip${this.viewing === null ? ' on' : ''}`, '+ 새 코스'); fresh.type = 'button'; fresh.id = 'dock-course-new'; fresh.addEventListener('click', () => this.newDraft()); this.list.append(fresh);
    this.presets.replaceChildren();
    this.removeBtn.classList.toggle('khide', this.viewing === null);
    this.applyBtn.classList.toggle('khide', this.viewing !== null);
    if (!d) { this.modeLabel.textContent = '코스 그리기'; this.costLabel.textContent = ''; this.trialBtn.disabled = true; this.applyBtn.disabled = true; return; }
    const editing = this.viewing === null;
    for (const p of PRESETS) {
      if (p.grade > g.rank + 1) continue;
      const b = el('button', `kchip${p.id === d.presetId ? ' on' : ''}`, `${p.name} · 핸들 ${p.handles}`); b.type = 'button'; b.dataset['preset'] = p.id; b.disabled = !editing;
      b.addEventListener('click', () => this.newDraft(p.id, d.equipId, { i: d.dock.x, j: d.dock.y }));
      this.presets.append(b);
    }
    this.equipCtx = { d: { presetId: d.presetId, equipId: d.equipId, dock: { x: d.dock.x, y: d.dock.y } }, editing };
    const gearCards: PictureCard[] = COURSE_EQUIPMENT.map((e) => {
      const owned = g.courses.ownedEquipment.has(e.id);
      const fit = fitOf(e.id, d.presetId);
      const card: PictureCard = { id: e.id, name: `${FIT_MARK[fit] ?? ''} ${e.name}`, art: pictureEl(pictureId('gear', e.id), 'attraction'), disabled: !editing || fit === 'no', data: { equip: e.id } };
      if (!owned) { card.price = `${e.vehicleCost.toLocaleString('ko-KR')}G`; card.badge = { text: '구입' }; }
      return card;
    });
    this.equipGrid.render(gearCards);
    this.equipGrid.select(d.equipId);
    const v = g.courseValidation(d, this.viewing ?? undefined);
    const res = g.evaluateDraft(d);
    const eq = courseEquipment(d.equipId);
    this.modeLabel.textContent = editing ? `코스 그리기 · ${presetDef(d.presetId)?.name ?? ''}` : `코스 #${this.viewing}`;
    this.costLabel.textContent = editing && eq ? `${(eq.vehicleCost * d.vehicles).toLocaleString('ko-KR')}G` : eq ? `요금 ${eq.fee}G` : '';
    if (!editing && this.viewing !== null) { const c = g.courses.byHandle(this.viewing); this.briefBtn.classList.remove('khide'); this.briefBtn.textContent = c?.safetyBriefing ? '브리핑 켜짐 (사고 ×0.7)' : '브리핑 끄기 → 켜기'; this.briefBtn.classList.toggle('on', c?.safetyBriefing === true); } else this.briefBtn.classList.add('khide'); // P52-b
    const can = editing ? g.canPlaceCourse(d) : { ok: true as const };
    if (!can.ok) this.status.textContent = can.reason;
    else if (res) this.status.textContent = `길이 ${Math.round(res.length)}칸 · 스릴 ${Math.round(res.thrill)} · 요금 ${eq?.fee ?? 0}G · 하루 예상 ${Math.round(res.potentialDailyRiders)}명 / ${Math.round(res.potentialDailyRevenue).toLocaleString('ko-KR')}G · 유지 ${Math.round(res.dailyUpkeep)}G/일${editing ? ' — 지도의 핸들을 끌어 모양을 바꾼다' : ''}`;
    this.applyBtn.disabled = !can.ok;
    this.trialBtn.disabled = !v || !v.ok;
    if (redraw) this.host.scene.setDockChoices(this.docks.map((x) => ({ x: x.tip.x, y: x.tip.y, ...(x.claim ? { claim: x.claim } : {}) })), this.dockIndex);
    this.host.scene.setCourseOverlay(d.handles, v ? v.badHandles : [], d.dock, { interactive: editing });
  }

  private trial(): void {
    const d = this.draft; if (!d) return;
    const res = this.game().evaluateDraft(d);
    const thrill = res?.thrill ?? 20;
    const lines = thrill >= 60 ? ['우와아!', '더 빨리!', '최고다!'] : thrill >= 35 ? ['신난다~', '오, 괜찮은데', '재밌다!'] : ['잔잔하네', '음, 편안해', '한 바퀴 더?'];
    this.host.scene.startCourseTrial([d.dock, ...d.handles], 4000, [{ progress: 0.25, text: lines[0] as string }, { progress: 0.55, text: lines[1] as string }, { progress: 0.85, text: lines[2] as string }]);
  }

  private apply(): void {
    const d = this.draft; if (!d || this.viewing !== null) return;
    const g = this.game();
    const r = g.placeCourse(d);
    this.host.toast(r.ok ? `코스 적용 · −${((courseEquipment(d.equipId)?.vehicleCost ?? 0) * d.vehicles).toLocaleString('ko-KR')}G` : r.reason, r.ok);
    if (!r.ok) { this.refresh(); return; }
    this.host.onChanged();
    if (r.handle !== undefined) this.view(r.handle);
  }

  private remove(): void {
    if (this.viewing === null) return;
    const r = this.game().removeCourse(this.viewing);
    this.host.toast(r.ok ? '코스를 철거했다 (기구 값은 안 돌아온다)' : r.reason, r.ok);
    if (!r.ok) return;
    this.host.onChanged();
    this.newDraft();
  }
}

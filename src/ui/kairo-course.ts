import {
  PRESETS,
  COURSE_EQUIPMENT,
  presetDef,
  courseEquipment,
  fitOf,
  fitBlocked,
  defaultHandles,
  validateCourse,
  evaluateCourse,
  COURSE_ISSUE_TEXT,
  type CourseStore,
  type Vec2,
} from '../sim/kairo/course.js';
import type { KairoTerrain } from '../sim/kairo/terrain.js';
import type { KairoScene } from '../render/scenes/KairoScene.js';

/**
 * 코스 편집 — 스펙 §7.3, §A(S11) UI.
 *
 * ## 탭 5회
 *
 * **프리셋 탭 1 + 핸들 드래그 2~4 + 확정 1 ≈ 5회.** 조각 조합 방식은 10~15회였다.
 * 핸들은 화면에서 직접 끈다 (`KairoScene.setCourseOverlay`) — 이 패널은 형태·장비·대수만
 * 고르고, 위치는 지도에서 손가락으로 정한다.
 *
 * ## 적합도를 표로 읽히지 않는다 (§B)
 *
 * 19×6 표를 보여주면 아무도 안 읽는다. **장비를 고르면 프리셋 탭에 배지가 붙는다** —
 * ◎ 최적 · ○ 적합 · △ 부적합 · ✕ 불가(회색). 그래서 "이 장비엔 이 형태"가 조작 중에 보인다.
 */

const FIT_BADGE: Record<string, string> = { best: '◎', ok: '○', poor: '△', no: '✕' };
const FIT_COLOR: Record<string, string> = {
  best: '#7fd0a8',
  ok: '#9dbdd2',
  poor: '#e0a05a',
  no: '#6b8296',
};

function won(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000) / 10}만`;
  return n.toLocaleString('ko-KR');
}

export interface CoursePanelDeps {
  terrain: KairoTerrain;
  scene: KairoScene;
  courses: CourseStore;
  /** 선착장 위치 (타일) */
  dock: () => Vec2;
  grade: () => number;
  cash: () => number;
  spend: (n: number) => boolean;
  onChange: () => void;
}

export class KairoCoursePanel {
  private readonly root: HTMLDivElement;
  private readonly presetBar: HTMLDivElement;
  private readonly equipSel: HTMLSelectElement;
  private readonly vehiclesEl: HTMLDivElement;
  private readonly metricsEl: HTMLDivElement;
  private readonly issuesEl: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly confirmBtn: HTMLButtonElement;

  private presetId = PRESETS[0]!.id;
  private equipId = COURSE_EQUIPMENT[0]!.id;
  private vehicles = 2;
  private handles: Vec2[] = [];

  constructor(
    parent: HTMLElement,
    private readonly deps: CoursePanelDeps,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'kairo-course';
    this.root.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:20;display:none;flex-direction:column;' +
      'gap:8px;background:#12212c;border-top:1px solid #2b4658;padding:10px 12px 14px;' +
      'font:13px/1.4 system-ui,sans-serif;color:#e8f4ff;max-height:66vh;overflow-y:auto';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    const title = document.createElement('div');
    title.textContent = '코스';
    title.style.cssText = 'font-size:16px;font-weight:700';
    const close = document.createElement('button');
    close.id = 'kairo-course-close';
    close.textContent = '닫기';
    close.style.cssText =
      'min-height:44px;min-width:64px;border-radius:8px;border:none;background:#24445a;color:#eaf6ff';
    close.addEventListener('click', () => this.hide());
    head.append(title, close);

    this.presetBar = document.createElement('div');
    this.presetBar.id = 'kairo-course-presets';
    this.presetBar.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding-bottom:2px';

    this.equipSel = document.createElement('select');
    this.equipSel.id = 'kairo-course-equip';
    this.equipSel.style.cssText =
      'min-height:44px;border-radius:8px;background:#1d3b4e;color:#eaf6ff;border:1px solid #35617e;' +
      'padding:0 8px;font-size:13px;flex:1;min-width:0';
    for (const e of COURSE_EQUIPMENT) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = `${e.name} · ${e.capacity}인 · ${won(e.vehicleCost)}`;
      this.equipSel.append(o);
    }
    this.equipSel.addEventListener('change', () => {
      this.equipId = this.equipSel.value;
      this.refresh();
    });

    const vehRow = document.createElement('div');
    vehRow.style.cssText = 'display:flex;align-items:center;gap:8px';
    this.vehiclesEl = document.createElement('div');
    this.vehiclesEl.dataset['vehicles'] = '';
    this.vehiclesEl.style.cssText = 'min-width:72px;text-align:center';
    for (const d of [-1, 1]) {
      const b = document.createElement('button');
      b.textContent = d < 0 ? '−' : '+';
      b.dataset['veh'] = String(d);
      b.style.cssText =
        'min-width:44px;min-height:44px;border-radius:8px;border:none;background:#2a5674;' +
        'color:#eaf6ff;font-size:20px;line-height:1';
      b.addEventListener('click', () => {
        this.vehicles = Math.max(1, Math.min(12, this.vehicles + d));
        this.refresh();
      });
      if (d < 0) vehRow.append(b, this.vehiclesEl);
      else vehRow.append(b);
    }

    const equipRow = document.createElement('div');
    equipRow.style.cssText = 'display:flex;gap:8px;align-items:center';
    equipRow.append(this.equipSel);

    this.metricsEl = document.createElement('div');
    this.metricsEl.id = 'kairo-course-metrics';
    this.metricsEl.style.cssText =
      'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:12px';

    this.issuesEl = document.createElement('div');
    this.issuesEl.style.cssText = 'font-size:12px;color:#ffcf8a;min-height:16px';

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.id = 'kairo-course-confirm';
    this.confirmBtn.textContent = '코스 확정';
    this.confirmBtn.style.cssText =
      'min-height:52px;border-radius:10px;border:none;background:#2f7fc0;color:#fff;' +
      'font-size:15px;font-weight:600';
    this.confirmBtn.addEventListener('click', () => this.confirm());

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px';

    this.root.append(
      head,
      this.presetBar,
      equipRow,
      vehRow,
      this.metricsEl,
      this.issuesEl,
      this.confirmBtn,
      this.listEl,
    );
    parent.append(this.root);

    // 핸들을 끌면 지표가 실시간으로 갱신된다 (§7.3)
    this.deps.scene.onCourseHandleMove = (index, i, j) => {
      const h = this.handles[index];
      if (!h) return;
      h.x = i;
      h.y = j;
      this.refresh(false);
    };
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  show(): void {
    this.root.style.display = 'flex';
    this.resetHandles();
    this.refresh();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.deps.scene.setCourseOverlay([], [], null);
  }

  /** 프리셋을 고르면 핸들이 자동 배치된다 — 그게 탭 1번의 내용이다 */
  private resetHandles(): void {
    const preset = presetDef(this.presetId);
    if (!preset) return;
    const dock = this.deps.dock();
    // 물 쪽 방향 — 지형이 앞(j 큰 쪽)이 물이므로 기본은 +j
    this.handles = defaultHandles(preset, dock, { x: 0, y: 1 }, 8);
  }

  private renderPresets(): void {
    this.presetBar.replaceChildren();
    const grade = this.deps.grade();
    for (const p of PRESETS) {
      const fit = fitOf(this.equipId, p.id);
      const blocked = fitBlocked(this.equipId, p.id) || grade < p.grade;
      const b = document.createElement('button');
      b.dataset['preset'] = p.id;
      b.dataset['fit'] = fit;
      b.disabled = blocked;
      // ★ 44px — 폰 터치 타깃
      b.style.cssText =
        'min-height:44px;min-width:88px;border-radius:8px;font-size:12px;' +
        `border:2px solid ${this.presetId === p.id ? '#7ad0ff' : 'transparent'};` +
        `background:${blocked ? '#1a2731' : '#1d3b4e'};` +
        `color:${blocked ? '#6b8296' : '#eaf6ff'}`;
      const nm = document.createElement('div');
      nm.textContent = p.name;
      const badge = document.createElement('div');
      badge.textContent = grade < p.grade ? `★${p.grade} 필요` : FIT_BADGE[fit] ?? '';
      badge.style.cssText = `font-size:12px;color:${FIT_COLOR[fit] ?? '#9dbdd2'}`;
      b.append(nm, badge);
      b.addEventListener('click', () => {
        this.presetId = p.id;
        this.resetHandles();
        this.refresh();
      });
      this.presetBar.append(b);
    }
  }

  private refresh(rebuildPresets = true): void {
    if (rebuildPresets) this.renderPresets();
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    if (!preset || !equip) return;

    const dock = this.deps.dock();
    const v = validateCourse(
      this.deps.terrain,
      this.handles,
      dock,
      preset,
      this.equipId,
      this.deps.grade(),
    );
    this.deps.scene.setCourseOverlay(this.handles, v.badHandles, dock);

    const r = evaluateCourse(dock, this.handles, equip, this.presetId, this.vehicles);
    const cost = equip.vehicleCost * this.vehicles;
    this.vehiclesEl.textContent = `${this.vehicles}대`;

    const cell = (label: string, value: string, color = '#eaf6ff'): HTMLElement => {
      const d = document.createElement('div');
      d.style.cssText = 'background:#182b38;border-radius:6px;padding:4px 6px';
      const l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = 'font-size:10px;color:#9dbdd2';
      const val = document.createElement('div');
      val.textContent = value;
      val.style.cssText = `font-weight:700;color:${color}`;
      d.append(l, val);
      return d;
    };
    this.metricsEl.replaceChildren(
      cell('스릴', String(Math.round(r.thrill)), r.thrill > 75 ? '#ffcf8a' : '#eaf6ff'),
      cell('안전', String(Math.round(r.safety)), r.safety < 60 ? '#ff9d8a' : '#7fd0a8'),
      // 주간 탑승 — "명/h"는 v1 시계 기준이라 카이로에서는 뜻이 없다
      cell('주간 탑승', `${r.weeklyRiders}명`),
      cell('주매출', won(r.weeklyRevenue)),
    );

    const issues = v.issues.map((i) => COURSE_ISSUE_TEXT[i]);
    if (cost > this.deps.cash()) issues.push(`장비값 ${won(cost)} — 현금이 부족합니다`);
    this.issuesEl.textContent = issues.join(' · ');
    const canPlace = v.ok && cost <= this.deps.cash();
    this.confirmBtn.disabled = !canPlace;
    this.confirmBtn.textContent = canPlace ? `코스 확정 (−${won(cost)})` : '코스 확정';
    this.confirmBtn.style.background = canPlace ? '#2f7fc0' : '#24445a';

    this.renderList();
  }

  private renderList(): void {
    this.listEl.replaceChildren();
    for (const c of this.deps.courses.all) {
      const equip = courseEquipment(c.equipId);
      const preset = presetDef(c.presetId);
      const row = document.createElement('div');
      row.dataset['course'] = String(c.handle);
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;background:#182b38;border-radius:6px;padding:4px 8px';
      const t = document.createElement('div');
      t.style.cssText = 'flex:1';
      t.textContent = `${preset?.name ?? c.presetId} · ${equip?.name ?? c.equipId} ${c.vehicles}대`;
      const del = document.createElement('button');
      del.textContent = '철거';
      del.style.cssText =
        'min-height:44px;min-width:56px;border-radius:8px;border:none;background:#5a2a2a;color:#ffd9d0';
      del.addEventListener('click', () => {
        this.deps.courses.remove(c.handle);
        this.deps.onChange();
        this.refresh();
      });
      row.append(t, del);
      this.listEl.append(row);
    }
  }

  private confirm(): void {
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    if (!preset || !equip) return;
    const dock = this.deps.dock();
    const v = validateCourse(
      this.deps.terrain,
      this.handles,
      dock,
      preset,
      this.equipId,
      this.deps.grade(),
    );
    if (!v.ok) return;
    const cost = equip.vehicleCost * this.vehicles;
    if (!this.deps.spend(cost)) return;
    this.deps.courses.add({
      presetId: this.presetId,
      equipId: this.equipId,
      vehicles: this.vehicles,
      dock,
      handles: this.handles.map((h) => ({ ...h })),
    });
    this.deps.onChange();
    this.resetHandles();
    this.refresh();
  }

  /** 도구용 — 화면을 거치지 않고 확정한다. 사람이 쓰는 경로와 같은 `confirm` 을 탄다 */
  confirmForTest(): number {
    const before = this.deps.courses.count;
    this.confirm();
    return this.deps.courses.count - before;
  }

  /** 도구용 — 핸들을 옮긴다 (드래그 대신) */
  moveHandleForTest(index: number, i: number, j: number): boolean {
    const h = this.handles[index];
    if (!h) return false;
    h.x = i;
    h.y = j;
    this.refresh(false);
    return true;
  }

  get state(): { presetId: string; equipId: string; vehicles: number; handles: Vec2[] } {
    return {
      presetId: this.presetId,
      equipId: this.equipId,
      vehicles: this.vehicles,
      handles: this.handles.map((h) => ({ ...h })),
    };
  }

  select(presetId: string, equipId: string): void {
    this.presetId = presetId;
    this.equipId = equipId;
    this.equipSel.value = equipId;
    this.resetHandles();
    this.refresh();
  }
}

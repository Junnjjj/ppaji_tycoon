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
  type DockChoice,
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
 * ## ⚠ 그 문장이 오래 거짓말이었다 (K33 에서 고침)
 *
 * "핸들은 화면에서 직접 끈다"고 적어 두고, 정작 열어 보면 핸들의 화면 좌표가
 * **x = −284, −380** 이었다. 화면 밖이라 끌 게 없었다. 게다가 패널이 화면의 49% 를
 * 먹고 하단 바까지 덮었다. 브라우저 검사 5건이 통과하고 있었는데, 그 검사들이
 * `moveHandleForTest` 로 **좌표를 직접 넣어서** — 손가락이 닿는지는 아무도 안 물었다.
 *
 * 그래서 K33 에서 셋을 바꿨다:
 * 1. 열면 **카메라가 코스를 잡는다** (`scene.frameCourse`) — 가려진 만큼 위로 올려서
 * 2. 패널은 **슬림 바**가 기본이다. 펼치는 건 ▲ 를 눌렀을 때만
 * 3. 선착장을 **지도에서 탭해** 고른다 — 예전엔 코드가 찾은 첫 데크로 고정이었다
 *
 * ## 적합도를 표로 읽히지 않는다 (§B)
 *
 * 19×6 표를 보여주면 아무도 안 읽는다. **장비를 고르면 프리셋 탭에 배지가 붙는다** —
 * ◎ 최적 · ○ 적합 · △ 부적합 · ✕ 불가(회색). 그래서 "이 장비엔 이 형태"가 조작 중에 보인다.
 *
 * ## 표면은 `style.css` 가 소유한다
 *
 * 예전엔 인라인 스타일 22곳 · 하드코딩 색 35개였다. `tools/check-ui-surface.mjs` 는
 * `style.css` 의 K28 마커 아래만 보므로 이 패널은 검사 **밖**에 있었다. 이제 `.kcourse*`
 * 클래스만 쓰고, 그 클래스가 검사 안에 들어와 있다.
 */

const FIT_BADGE: Record<string, string> = { best: '◎', ok: '○', poor: '△', no: '✕' };

function won(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000) / 10}만`;
  return n.toLocaleString('ko-KR');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface CoursePanelDeps {
  terrain: KairoTerrain;
  scene: KairoScene;
  courses: CourseStore;
  /**
   * 선착장 후보 — **잔교 하나가 후보 하나다** (`dockCandidates`).
   *
   * 예전엔 `dock: () => Vec2` 하나였고 부르는 쪽이 "첫 번째 데크"를 골라 줬다.
   * 플레이어가 못 골랐고, 뻗는 방향도 `{x:0,y:1}` 하드코딩이라 물이 +j 쪽이 아닌
   * 맵에서는 코스가 육지로 뻗었다.
   */
  docks: () => DockChoice[];
  grade: () => number;
  cash: () => number;
  spend: (n: number) => boolean;
  onChange: () => void;
}

export class KairoCoursePanel {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly chipsEl: HTMLDivElement;
  private readonly whyEl: HTMLDivElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly presetBar: HTMLDivElement;
  private readonly equipSel: HTMLSelectElement;
  private readonly vehiclesEl: HTMLDivElement;
  private readonly metricsEl: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly confirmBtn: HTMLButtonElement;

  private presetId = PRESETS[0]!.id;
  private equipId = COURSE_EQUIPMENT[0]!.id;
  private vehicles = 2;
  private handles: Vec2[] = [];
  /** 고른 선착장 후보 번호. 후보가 없으면 −1 */
  private dockIndex = 0;

  constructor(
    parent: HTMLElement,
    private readonly deps: CoursePanelDeps,
  ) {
    this.root = el('div', 'kcourse');
    this.root.id = 'kairo-course';
    this.root.hidden = true;

    // ── 슬림 바 — 접힘 상태의 전부 ──
    const bar = el('div', 'kcourse-bar');
    const sum = el('div', 'kcourse-sum');
    this.titleEl = el('div', 'kcourse-title');
    this.chipsEl = el('div', 'kcourse-chips');
    this.whyEl = el('div', 'kcourse-why');
    sum.append(this.titleEl, this.chipsEl, this.whyEl);

    this.toggleBtn = el('button', 'kbtn');
    this.toggleBtn.id = 'kairo-course-toggle';
    this.toggleBtn.textContent = '▲';
    this.toggleBtn.setAttribute('aria-label', '코스 설정 펼치기');
    this.toggleBtn.addEventListener('click', () => this.setExpanded(this.bodyEl.hidden));

    const acts = el('div', 'kcourse-acts');
    const close = el('button', 'kbtn', '취소');
    close.id = 'kairo-course-close';
    close.addEventListener('click', () => this.hide());
    this.confirmBtn = el('button', 'kbtn primary', '확정');
    this.confirmBtn.id = 'kairo-course-confirm';
    this.confirmBtn.addEventListener('click', () => this.confirm());
    acts.append(close, this.confirmBtn);
    bar.append(sum, this.toggleBtn, acts);

    // ── 펼침 본문 ──
    this.bodyEl = el('div', 'kcourse-body');
    this.bodyEl.id = 'kairo-course-body';
    this.bodyEl.hidden = true;

    const hint = el(
      'div',
      'kcourse-hint',
      '선착장은 지도에서 탭해 고르고, 코스는 핸들을 끌어 만듭니다',
    );

    this.presetBar = el('div', 'kcourse-presets');
    this.presetBar.id = 'kairo-course-presets';

    this.equipSel = el('select', 'kcourse-equip');
    this.equipSel.id = 'kairo-course-equip';
    for (const e of COURSE_EQUIPMENT) {
      const o = el('option');
      o.value = e.id;
      o.textContent = `${e.name} · ${e.capacity}인 · ${won(e.vehicleCost)}`;
      this.equipSel.append(o);
    }
    this.equipSel.addEventListener('change', () => {
      this.equipId = this.equipSel.value;
      this.refresh();
    });
    const equipRow = el('div', 'kcourse-row');
    equipRow.append(this.equipSel);

    const vehRow = el('div', 'kcourse-row');
    this.vehiclesEl = el('div', 'kcourse-veh');
    this.vehiclesEl.dataset['vehicles'] = '';
    for (const d of [-1, 1]) {
      const b = el('button', 'kbtn', d < 0 ? '−' : '+');
      b.dataset['veh'] = String(d);
      b.addEventListener('click', () => {
        this.vehicles = Math.max(1, Math.min(12, this.vehicles + d));
        this.refresh();
      });
      if (d < 0) vehRow.append(b, this.vehiclesEl);
      else vehRow.append(b);
    }

    this.metricsEl = el('div', 'kcourse-metrics');
    this.metricsEl.id = 'kairo-course-metrics';

    this.listEl = el('div', 'kcourse-list');

    this.bodyEl.append(hint, this.presetBar, equipRow, vehRow, this.metricsEl, this.listEl);
    this.root.append(bar, this.bodyEl);
    parent.append(this.root);

    // 핸들을 끌면 지표가 실시간으로 갱신된다 (§7.3)
    this.deps.scene.onCourseHandleMove = (index, i, j) => {
      const h = this.handles[index];
      if (!h) return;
      h.x = i;
      h.y = j;
      this.refresh(false);
    };
    // 지도에서 선착장을 탭하면 코스가 그쪽으로 옮겨진다 (K33)
    this.deps.scene.onCourseDockPick = (index) => {
      if (!this.visible || index === this.dockIndex) return;
      this.dockIndex = index;
      this.resetHandles();
      this.refresh();
      this.frame();
    };
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.setExpanded(false);
    // 후보가 줄었을 수 있다 (잔교를 철거하면) — 범위 밖이면 첫 번째로
    const n = this.deps.docks().length;
    if (this.dockIndex >= n) this.dockIndex = n > 0 ? 0 : -1;
    this.resetHandles();
    this.refresh();
    this.frame();
  }

  hide(): void {
    this.root.hidden = true;
    this.deps.scene.setCourseOverlay([], [], null);
    this.deps.scene.setDockChoices([], -1);
  }

  /**
   * 카메라가 코스를 잡는다 — **가려진 높이만큼 위로 올려서** (K33).
   *
   * 가림 높이는 재서 쓴다. 상수로 박으면 슬림 바가 두 줄이 되는 순간(경고 문구가 뜰 때)
   * 어긋난다. `getBoundingClientRect` 는 동기라 방금 보이게 한 뒤에도 값이 나온다.
   */
  private frame(): void {
    const dock = this.dock();
    if (!dock) return;
    const r = this.root.getBoundingClientRect();
    const inset = Math.max(0, window.innerHeight - r.top);
    this.deps.scene.frameCourse(dock, this.handles, inset);
  }

  private setExpanded(on: boolean): void {
    this.bodyEl.hidden = !on;
    this.toggleBtn.textContent = on ? '▼' : '▲';
    this.toggleBtn.setAttribute('aria-label', on ? '코스 설정 접기' : '코스 설정 펼치기');
    /*
     * 펼치면 패널 상단이 올라가 **핸들이 가려질 수 있다.** 접을 때도 마찬가지로 여백이
     * 생긴다 — 가림 높이가 바뀌었으니 다시 잡는다. `show()` 에서 부를 땐 핸들이 아직
     * 없으므로 `frame()` 이 스스로 빠진다.
     */
    if (this.visible && this.handles.length > 0) this.frame();
  }

  /** 고른 선착장. 후보가 없으면 `null` — 그러면 코스를 만들 수 없다 */
  private dock(): Vec2 | null {
    const list = this.deps.docks();
    const c = list[this.dockIndex] ?? list[0];
    return c ? c.tip : null;
  }

  /** 프리셋을 고르면 핸들이 자동 배치된다 — 그게 탭 1번의 내용이다 */
  private resetHandles(): void {
    const preset = presetDef(this.presetId);
    const list = this.deps.docks();
    const choice = list[this.dockIndex] ?? list[0];
    if (!preset || !choice) {
      this.handles = [];
      return;
    }
    // 방향은 **잔교가 뻗은 쪽**이다 — 예전 `{x:0,y:1}` 하드코딩은 맵을 하나만 가정했다
    this.handles = defaultHandles(preset, choice.tip, choice.dir, 8);
  }

  private renderPresets(): void {
    this.presetBar.replaceChildren();
    const grade = this.deps.grade();
    for (const p of PRESETS) {
      const fit = fitOf(this.equipId, p.id);
      const blocked = fitBlocked(this.equipId, p.id) || grade < p.grade;
      const b = el('button', `kcourse-item${this.presetId === p.id ? ' on' : ''}`);
      b.dataset['preset'] = p.id;
      b.dataset['fit'] = fit;
      b.disabled = blocked;
      const nm = el('div', 'kcourse-item-name', p.name);
      const badge = el(
        'div',
        `kcourse-badge ${fit}`,
        grade < p.grade ? `★${p.grade} 필요` : (FIT_BADGE[fit] ?? ''),
      );
      b.append(nm, badge);
      b.addEventListener('click', () => {
        this.presetId = p.id;
        this.resetHandles();
        this.refresh();
        this.frame();
      });
      this.presetBar.append(b);
    }
  }

  private refresh(rebuildPresets = true): void {
    if (rebuildPresets) this.renderPresets();
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    if (!preset || !equip) return;

    const docks = this.deps.docks();
    const dock = this.dock();
    this.deps.scene.setDockChoices(
      docks.map((d) => d.tip),
      docks.length > 0 ? Math.min(this.dockIndex, docks.length - 1) : -1,
    );

    this.vehiclesEl.textContent = `${this.vehicles}대`;
    const cost = equip.vehicleCost * this.vehicles;
    this.titleEl.textContent = `${preset.name} · ${equip.name} ${this.vehicles}대`;

    if (!dock) {
      // 선착장이 없으면 코스도 없다 — 무엇을 하면 되는지 말한다
      this.deps.scene.setCourseOverlay([], [], null);
      this.chipsEl.textContent = '';
      this.whyEl.textContent = '선착장이 없습니다 — 물가에 플로팅덱을 놓으세요';
      this.confirmBtn.disabled = true;
      this.confirmBtn.textContent = '확정';
      this.metricsEl.replaceChildren();
      this.renderList();
      return;
    }

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

    const thrillCls = r.thrill > 75 ? 'warn' : '';
    const safeCls = r.safety < 60 ? 'bad' : 'good';
    // 접힌 채로도 판단이 되게 — 스릴·안전·주매출은 바에 남긴다
    this.chipsEl.replaceChildren(
      el('span', thrillCls, `스릴 ${Math.round(r.thrill)}`),
      document.createTextNode(' · '),
      el('span', safeCls === 'bad' ? 'bad' : '', `안전 ${Math.round(r.safety)}`),
      document.createTextNode(` · 주 ${won(r.weeklyRevenue)}`),
    );

    const cell = (label: string, value: string, cls = ''): HTMLElement => {
      const d = el('div', 'kcourse-metric');
      d.append(el('div', 'kcourse-metric-label', label), el('div', `kcourse-metric-value ${cls}`, value));
      return d;
    };
    this.metricsEl.replaceChildren(
      cell('스릴', String(Math.round(r.thrill)), thrillCls),
      cell('안전', String(Math.round(r.safety)), safeCls),
      // 주간 탑승 — "명/h"는 v1 시계 기준이라 카이로에서는 뜻이 없다
      cell('주간 탑승', `${r.weeklyRiders}명`),
      cell('주매출', won(r.weeklyRevenue)),
    );

    const issues = v.issues.map((i) => COURSE_ISSUE_TEXT[i]);
    if (cost > this.deps.cash()) issues.push(`장비값 ${won(cost)} — 현금이 부족합니다`);
    this.whyEl.textContent = issues.join(' · ');
    const canPlace = v.ok && cost <= this.deps.cash();
    this.confirmBtn.disabled = !canPlace;
    this.confirmBtn.textContent = canPlace ? `확정 −${won(cost)}` : '확정';

    this.renderList();
  }

  private renderList(): void {
    this.listEl.replaceChildren();
    for (const c of this.deps.courses.all) {
      const equip = courseEquipment(c.equipId);
      const preset = presetDef(c.presetId);
      const row = el('div', 'kcourse-listrow');
      row.dataset['course'] = String(c.handle);
      row.append(
        el(
          'span',
          undefined,
          `${preset?.name ?? c.presetId} · ${equip?.name ?? c.equipId} ${c.vehicles}대`,
        ),
      );
      const del = el('button', 'kbtn', '철거');
      del.addEventListener('click', () => {
        this.deps.courses.remove(c.handle);
        this.deps.onChange();
        this.refresh();
      });
      row.append(del);
      this.listEl.append(row);
    }
  }

  private confirm(): void {
    const preset = presetDef(this.presetId);
    const equip = courseEquipment(this.equipId);
    const dock = this.dock();
    if (!preset || !equip || !dock) return;
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

  /**
   * 도구용 — 화면을 거치지 않고 확정한다. 사람이 쓰는 경로와 같은 `confirm` 을 탄다.
   *
   * ⚠ 이 문 때문에 "핸들이 화면 밖"이 오래 안 잡혔다. sim 이 맞는지 보는 데는 쓰되,
   * **화면이 되는지는 진짜 터치로 봐야 한다** (`verify-kairo.ts` 의 K33 절).
   */
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

  get state(): {
    presetId: string;
    equipId: string;
    vehicles: number;
    handles: Vec2[];
    dockIndex: number;
    dock: Vec2 | null;
    expanded: boolean;
  } {
    return {
      presetId: this.presetId,
      equipId: this.equipId,
      vehicles: this.vehicles,
      handles: this.handles.map((h) => ({ ...h })),
      dockIndex: this.dockIndex,
      dock: this.dock(),
      expanded: !this.bodyEl.hidden,
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

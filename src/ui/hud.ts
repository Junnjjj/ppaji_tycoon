import {
  EQUIPMENT_DEFS,
  FACILITY_DEFS,
  type EquipmentDef,
  type FacilityDef,
  type GameStats,
  type SpeedLevel,
} from '../sim/index.js';
import { LOD_NAMES, type Lod } from '../render/constants.js';
import type { PlacementState } from '../render/placement.js';
import type { CourseEditState } from '../render/course-editor.js';
import type { EntityStats } from '../render/entities.js';

/**
 * HUD 는 캔버스가 아니라 DOM/CSS 다 — 계획서 §3.
 * 에셋 0장, 어느 해상도에서도 선명, 안전영역·다크모드가 공짜.
 *
 * 모바일 최우선: 모든 조작 버튼은 44px 이상, 하단은 안전영역을 피한다.
 */

export interface HudCallbacks {
  onSpeedChange(speed: SpeedLevel): void;
  onBeginPlacement(defId: string): void;
  onConfirmPlacement(): void;
  onRotatePlacement(): void;
  onCancelPlacement(): void;
  onBeginCourse(defId: string): void;
  onUndoCoursePoint(): void;
  onChangeCourseVehicles(delta: number): void;
  onConfirmCourse(): void;
  onCancelCourse(): void;
}

export interface HudState {
  fps: number;
  zoom: number;
  lod: Lod;
  simMs: number;
  stats: GameStats;
  entities: EntityStats;
}

const SPEEDS: readonly SpeedLevel[] = [0, 1, 2, 3];
const SPEED_LABELS: Record<SpeedLevel, string> = { 0: '❚❚', 1: '▶', 2: '▶▶', 3: '▶▶▶' };

/** 팔레트에 보여줄 시설 아이콘 (에셋 교체 전까지의 임시 표기) */
const FACILITY_ICONS: Record<string, string> = {
  gate: '🎟️',
  shop: '🏪',
  restroom: '🚻',
  shower: '🚿',
  changing: '🚪',
  shade: '⛱️',
  path: '🛤️',
  dock: '🛶',
  slide: '🛝',
  trampoline: '🤸',
  pool: '🛟',
};

const EQUIPMENT_ICONS: Record<string, string> = {
  banana: '🍌',
  jetski: '🚤',
  flyfish: '🐟',
  wakeboard: '🏄',
};

/** 하단 팔레트 탭 */
type PaletteTab = 'facility' | 'course';

const won = (n: number): string => `₩${n.toLocaleString()}`;

export class Hud {
  private root: HTMLElement;

  private elDay!: HTMLElement;
  private elGuests!: HTMLElement;
  private elHappy!: HTMLElement;
  private elFps!: HTMLElement;
  private elPerfSub!: HTMLElement;

  private speedBar!: HTMLElement;
  private tabBar!: HTMLElement;
  private paletteWrap!: HTMLElement;
  private facilityPalette!: HTMLElement;
  private coursePalette!: HTMLElement;
  private placeBar!: HTMLElement;
  private elPlaceLabel!: HTMLElement;
  private btnConfirm!: HTMLButtonElement;

  private courseBar!: HTMLElement;
  private elCourseTitle!: HTMLElement;
  private elCourseHint!: HTMLElement;
  private elVehicleCount!: HTMLElement;
  private metricEls = new Map<string, HTMLElement>();
  private btnCourseConfirm!: HTMLButtonElement;

  private elHint!: HTMLElement;
  private speedButtons = new Map<SpeedLevel, HTMLButtonElement>();
  private tabButtons = new Map<PaletteTab, HTMLButtonElement>();
  private speed: SpeedLevel = 1;

  constructor(
    parent: HTMLElement,
    private cb: HudCallbacks,
  ) {
    this.root = el('div', 'hud');
    this.buildTop();
    this.buildPerf();
    this.buildBottom();
    parent.append(this.root);
    this.setSpeed(1);
    this.showPlacementBar(null);
  }

  // ── 상단 ──

  private buildTop(): void {
    const top = el('div', 'hud-top');

    this.elDay = el('span', 'pill-value');
    top.append(pill('☀️', this.elDay));

    this.elGuests = el('span', 'pill-value');
    top.append(pill('👥', this.elGuests));

    this.elHappy = el('span', 'pill-value');
    top.append(pill('😊', this.elHappy));

    this.root.append(top);
  }

  private buildPerf(): void {
    const perf = el('div', 'hud-perf');
    this.elFps = el('span', 'perf-fps');
    this.elPerfSub = el('span', 'perf-sub');
    perf.append(this.elFps, this.elPerfSub);
    this.root.append(perf);

    // 아직 아무것도 안 지었을 때의 안내
    this.elHint = el('div', 'hint');
    this.elHint.textContent = '아래에서 🎟️ 입장 게이트를 골라 설치하면 손님이 들어옵니다';
    this.root.append(this.elHint);
  }

  // ── 하단 ──

  private buildBottom(): void {
    const bottom = el('div', 'hud-bottom');

    // 배치 중 컨트롤 (평소엔 숨김)
    this.placeBar = el('div', 'place-bar');
    this.elPlaceLabel = el('div', 'place-label');
    const row = el('div', 'place-buttons');
    const btnCancel = button('✕ 취소', 'place-btn cancel', () => this.cb.onCancelPlacement());
    const btnRotate = button('↻ 회전', 'place-btn', () => this.cb.onRotatePlacement());
    this.btnConfirm = button('✓ 설치', 'place-btn confirm', () => this.cb.onConfirmPlacement());
    row.append(btnCancel, btnRotate, this.btnConfirm);
    this.placeBar.append(this.elPlaceLabel, row);

    // 코스 편집 패널
    this.courseBar = this.buildCourseBar();

    // 팔레트 탭
    this.tabBar = el('div', 'tab-bar');
    for (const [tab, label] of [
      ['facility', '🏗️ 시설'],
      ['course', '🌊 수상 코스'],
    ] as Array<[PaletteTab, string]>) {
      const b = button(label, 'tab-btn', () => this.setTab(tab));
      this.tabButtons.set(tab, b);
      this.tabBar.append(b);
    }

    // 팔레트
    this.facilityPalette = el('div', 'palette');
    for (const def of FACILITY_DEFS) this.facilityPalette.append(this.paletteItem(def));

    this.coursePalette = el('div', 'palette');
    for (const def of EQUIPMENT_DEFS) this.coursePalette.append(this.courseItem(def));

    this.paletteWrap = el('div', 'palette-wrap');
    this.paletteWrap.append(this.facilityPalette, this.coursePalette);

    // 배속
    this.speedBar = el('div', 'speed-bar');
    for (const s of SPEEDS) {
      const b = button(SPEED_LABELS[s], 'speed-btn', () => this.setSpeed(s));
      b.setAttribute('aria-label', s === 0 ? '일시정지' : `${s}배속`);
      this.speedButtons.set(s, b);
      this.speedBar.append(b);
    }

    bottom.append(this.placeBar, this.courseBar, this.tabBar, this.paletteWrap, this.speedBar);
    this.root.append(bottom);
    this.setTab('facility');
  }

  /** 코스 편집 패널 — 지표가 실시간으로 갱신되는 곳 */
  private buildCourseBar(): HTMLElement {
    const bar = el('div', 'course-bar');

    this.elCourseTitle = el('div', 'course-title');
    this.elCourseHint = el('div', 'course-hint');

    const metrics = el('div', 'metrics');
    for (const [key, label] of [
      ['throughput', '처리량'],
      ['thrill', '스릴'],
      ['safety', '안전도'],
      ['length', '길이'],
    ] as Array<[string, string]>) {
      const cell = el('div', 'metric');
      const l = el('div', 'metric-label');
      l.textContent = label;
      const v = el('div', 'metric-value');
      v.textContent = '–';
      cell.append(l, v);
      this.metricEls.set(key, v);
      metrics.append(cell);
    }

    // 장비 대수 — 처리량 vs 안전의 핵심 다이얼
    const vrow = el('div', 'vehicle-row');
    const vlabel = el('span', 'vehicle-label');
    vlabel.textContent = '장비';
    this.elVehicleCount = el('span', 'vehicle-count');
    vrow.append(
      vlabel,
      button('−', 'vehicle-btn', () => this.cb.onChangeCourseVehicles(-1)),
      this.elVehicleCount,
      button('+', 'vehicle-btn', () => this.cb.onChangeCourseVehicles(1)),
    );

    const row = el('div', 'place-buttons');
    this.btnCourseConfirm = button('✓ 완성', 'place-btn confirm', () =>
      this.cb.onConfirmCourse(),
    );
    row.append(
      button('✕', 'place-btn cancel', () => this.cb.onCancelCourse()),
      button('↩ 되돌리기', 'place-btn', () => this.cb.onUndoCoursePoint()),
      this.btnCourseConfirm,
    );

    bar.append(this.elCourseTitle, this.elCourseHint, metrics, vrow, row);
    return bar;
  }

  private setTab(tab: PaletteTab): void {
    for (const [k, b] of this.tabButtons) b.classList.toggle('on', k === tab);
    this.facilityPalette.classList.toggle('hidden', tab !== 'facility');
    this.coursePalette.classList.toggle('hidden', tab !== 'course');
  }

  private paletteItem(def: FacilityDef): HTMLElement {
    const b = document.createElement('button');
    b.className = 'palette-item';
    b.type = 'button';

    const icon = el('div', 'palette-icon');
    icon.textContent = FACILITY_ICONS[def.id] ?? '🏗️';

    const name = el('div', 'palette-name');
    name.textContent = def.name;

    const meta = el('div', 'palette-meta');
    meta.textContent = `${def.size[0]}×${def.size[1]} · ${def.cost >= 10000 ? `${Math.round(def.cost / 10000)}만` : won(def.cost)}`;

    b.append(icon, name, meta);
    b.title = def.desc;
    b.addEventListener('click', () => this.cb.onBeginPlacement(def.id));
    return b;
  }

  private courseItem(def: EquipmentDef): HTMLElement {
    const b = document.createElement('button');
    b.className = 'palette-item';
    b.type = 'button';

    const icon = el('div', 'palette-icon');
    icon.textContent = EQUIPMENT_ICONS[def.id] ?? '🌊';

    const name = el('div', 'palette-name');
    name.textContent = def.name;

    const meta = el('div', 'palette-meta');
    meta.textContent = `${def.capacity}인 · 스릴 ${def.thrillBase}`;

    b.append(icon, name, meta);
    b.title = def.desc;
    b.addEventListener('click', () => this.cb.onBeginCourse(def.id));
    return b;
  }

  // ── 상태 갱신 ──

  setSpeed(s: SpeedLevel): void {
    this.speed = s;
    for (const [k, b] of this.speedButtons) b.classList.toggle('on', k === s);
    this.cb.onSpeedChange(s);
  }

  get currentSpeed(): SpeedLevel {
    return this.speed;
  }

  /** 배치 모드 진입/종료에 따라 하단 UI 를 바꾼다 */
  showPlacementBar(state: PlacementState | null): void {
    const placing = state !== null;
    this.placeBar.classList.toggle('on', placing);
    this.setPaletteHidden(placing);

    if (!state) return;

    this.elPlaceLabel.textContent = state.valid
      ? `${state.def.name} · ${won(state.def.cost)} — 드래그로 옮기고 ✓`
      : `${state.def.name} · ${state.reason}`;
    this.elPlaceLabel.classList.toggle('bad', !state.valid);
    this.btnConfirm.disabled = !state.valid;
  }

  /** 코스 편집 패널 — 점을 찍을 때마다 지표가 즉시 갱신된다 */
  showCourseBar(state: CourseEditState | null): void {
    const editing = state !== null;
    this.courseBar.classList.toggle('on', editing);
    this.setPaletteHidden(editing);

    if (!state) return;

    const m = state.metrics;
    this.elCourseTitle.textContent = `${state.def.name} 코스 · 점 ${state.points.length}/${state.def.maxPoints}`;
    this.elCourseHint.textContent = state.reason || '완성할 수 있습니다';
    this.elCourseHint.classList.toggle('bad', !state.valid);

    this.setMetric('throughput', m.throughput > 0 ? `${Math.round(m.throughput)}명/h` : '–');
    this.setMetric('thrill', m.length > 0 ? String(Math.round(m.thrill)) : '–', m.thrill, true);
    this.setMetric('safety', m.length > 0 ? String(Math.round(m.safety)) : '–', m.safety);
    this.setMetric('length', m.length > 0 ? `${Math.round(m.length * 4)}m` : '–');

    this.elVehicleCount.textContent = `${state.vehicles}대`;
    this.btnCourseConfirm.disabled = !state.valid;
  }

  /** 편집·배치 중에는 팔레트를 접어 지도를 탭할 공간을 확보한다 */
  private setPaletteHidden(hidden: boolean): void {
    this.paletteWrap.classList.toggle('hidden', hidden);
    this.tabBar.classList.toggle('hidden', hidden);
  }

  /**
   * 지표 한 칸 갱신. 안전도는 낮을수록, 스릴은 높을수록 경고색이 된다.
   * (스릴이 과하면 멀미로 손님이 떠나므로)
   */
  private setMetric(key: string, text: string, value?: number, higherIsRisky = false): void {
    const el2 = this.metricEls.get(key);
    if (!el2) return;
    el2.textContent = text;
    el2.classList.remove('good', 'warn', 'bad');
    if (value === undefined) return;
    const risk = higherIsRisky ? value : 100 - value;
    el2.classList.add(risk > 72 ? 'bad' : risk > 48 ? 'warn' : 'good');
  }

  update(st: HudState): void {
    const s = st.stats;

    // 게이트가 서기 전까지만 안내를 띄운다
    this.elHint.classList.toggle('on', s.facilities === 0);

    const week = Math.floor(s.day / 7) + 1;
    this.elDay.textContent = `7월 ${week}주 · ${s.day}일차`;
    const extra: string[] = [];
    if (s.queued > 0) extra.push(`대기 ${s.queued}`);
    if (s.riding > 0) extra.push(`탑승 ${s.riding}`);
    this.elGuests.textContent = `${s.guests}명${extra.length ? ` (${extra.join(' · ')})` : ''}`;
    this.elHappy.textContent = `${Math.round(s.avgHappiness)}%`;
    this.elHappy.classList.toggle('bad', s.avgHappiness < 40);
    this.elHappy.classList.toggle('warn', s.avgHappiness >= 40 && s.avgHappiness < 60);

    const fps = Math.round(st.fps);
    this.elFps.textContent = `${fps} FPS`;
    this.elFps.classList.toggle('warn', fps < 50 && fps >= 30);
    this.elFps.classList.toggle('bad', fps < 30);

    this.elPerfSub.textContent =
      `줌 ${st.zoom.toFixed(1)}× ${LOD_NAMES[st.lod]}\n` +
      `sim ${st.simMs.toFixed(2)}ms\n` +
      `스프라이트 ${st.entities.guestSprites + st.entities.facilitySprites}`;
  }
}

// ── 작은 도우미들 ──

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function pill(icon: string, value: HTMLElement): HTMLElement {
  const p = el('div', 'pill');
  const i = el('span', 'pill-icon');
  i.textContent = icon;
  p.append(i, value);
  return p;
}

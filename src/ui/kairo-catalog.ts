import { COMBOS, evaluateCombos, type ComboTier } from '../sim/kairo/combos.js';
import { allFacilityDefs } from '../sim/kairo/placement.js';
import { COURSE_EQUIPMENT } from '../sim/kairo/course.js';
import type { PlacementGrid } from '../sim/kairo/placement.js';
import type { CourseStore } from '../sim/kairo/course.js';
import { requiredGrade } from '../sim/kairo/progress.js';

/**
 * 도감 — 스펙 §15.8, §D. **발견·수집이 이 게임의 훅이다** (§0 재미의 축).
 *
 * ## 스크롤 지옥을 피한다
 *
 * 콤보 70 + 시설 73 + 장비 19 = 162 항목이다. 한 줄에 다 늘어놓으면 아무도 안 본다.
 *   · **티어 탭**으로 나눈다 (소형/중형/대형)
 *   · **기본은 미발견만** — 할 일이 보여야 도감이 목표가 된다
 *   · 한 항목 **56px** — 스크롤이 빨리 지나간다
 *
 * ## 미발견은 힌트만
 *
 * 잠긴 항목은 이름을 가리고 **조건 일부만** 보여준다 (`매점 + ? + ?`). 전부 보여주면
 * 발견이 아니라 체크리스트가 되고, 전부 가리면 힌트가 아니라 벽이 된다.
 */

const TIER_NAME: Record<ComboTier, string> = { small: '소형', medium: '중형', large: '대형' };
const TIERS: ComboTier[] = ['small', 'medium', 'large'];

type Tab = 'combo' | 'facility' | 'equipment';

export interface CatalogDeps {
  placement: PlacementGrid;
  courses: CourseStore;
  grade: () => number;
  /** 이미 발견한 콤보 id — 결산에서 누적한다 */
  discovered: () => ReadonlySet<string>;
}

export class KairoCatalog {
  private readonly root: HTMLDivElement;
  private readonly tabBar: HTMLDivElement;
  private readonly filterBtn: HTMLButtonElement;
  private readonly listEl: HTMLDivElement;
  private readonly countEl: HTMLDivElement;
  private tab: Tab = 'combo';
  private tier: ComboTier | 'all' = 'all';
  /** 기본은 미발견만 — 할 일이 보이게 (§D) */
  private undiscoveredOnly = true;

  constructor(
    parent: HTMLElement,
    private readonly deps: CatalogDeps,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'kairo-catalog';
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:25;display:none;flex-direction:column;gap:8px;' +
      'background:#0d1a23;padding:12px 12px 16px;font:13px/1.4 system-ui,sans-serif;' +
      'color:#e8f4ff;overflow-y:auto';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    const title = document.createElement('div');
    title.textContent = '도감';
    title.style.cssText = 'font-size:17px;font-weight:700';
    const close = document.createElement('button');
    close.id = 'kairo-catalog-close';
    close.textContent = '닫기';
    close.style.cssText =
      'min-height:44px;min-width:64px;border-radius:8px;border:none;background:#24445a;color:#eaf6ff';
    close.addEventListener('click', () => this.hide());
    head.append(title, close);

    this.countEl = document.createElement('div');
    this.countEl.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;font-size:12px';

    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText = 'display:flex;gap:6px;overflow-x:auto';

    this.filterBtn = document.createElement('button');
    this.filterBtn.id = 'kairo-catalog-filter';
    this.filterBtn.style.cssText =
      'min-height:44px;border-radius:8px;border:1px solid #35617e;background:#1d3b4e;color:#eaf6ff';
    this.filterBtn.addEventListener('click', () => {
      this.undiscoveredOnly = !this.undiscoveredOnly;
      this.render();
    });

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    this.root.append(head, this.countEl, this.tabBar, this.filterBtn, this.listEl);
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  show(): void {
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** 발견 수 — 검증·요약이 읽는다 */
  counts(): { combo: [number, number]; facility: [number, number]; equipment: [number, number] } {
    const disc = this.deps.discovered();
    const built = new Set(this.deps.placement.all().map((x) => x.defId));
    const used = new Set(this.deps.courses.all.map((c) => c.equipId));
    return {
      combo: [disc.size, COMBOS.length],
      facility: [built.size, allFacilityDefs().length],
      equipment: [used.size, COURSE_EQUIPMENT.length],
    };
  }

  private row(
    found: boolean,
    title: string,
    detail: string,
    key: string,
  ): HTMLElement {
    const d = document.createElement('div');
    d.dataset['entry'] = key;
    d.dataset['found'] = found ? '1' : '0';
    // ★ 56px — 스펙이 정한 한 항목 높이. 스크롤이 빨리 지나간다
    d.style.cssText =
      'min-height:56px;display:flex;flex-direction:column;justify-content:center;' +
      `padding:6px 10px;border-radius:8px;background:${found ? '#182b38' : '#141f28'}`;
    const t = document.createElement('div');
    t.textContent = `${found ? '✅' : '🔒'} ${title}`;
    t.style.cssText = `font-weight:600;color:${found ? '#e8f4ff' : '#7fa0b4'}`;
    const s = document.createElement('div');
    s.textContent = detail;
    s.style.cssText = 'font-size:11px;color:#9dbdd2';
    d.append(t, s);
    return d;
  }

  private render(): void {
    const c = this.counts();
    this.countEl.replaceChildren();
    const chips: [Tab, string, [number, number]][] = [
      ['combo', '콤보', c.combo],
      ['facility', '시설', c.facility],
      ['equipment', '장비', c.equipment],
    ];
    for (const [id, name, [got, all]] of chips) {
      const b = document.createElement('button');
      b.dataset['tab'] = id;
      b.textContent = `${name} ${got}/${all}`;
      b.style.cssText =
        'min-height:44px;padding:0 10px;border-radius:8px;font-size:12px;' +
        `border:2px solid ${this.tab === id ? '#7ad0ff' : 'transparent'};` +
        'background:#1d3b4e;color:#eaf6ff';
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.countEl.append(b);
    }

    // 티어 탭은 콤보에만 의미가 있다
    this.tabBar.replaceChildren();
    this.tabBar.style.display = this.tab === 'combo' ? 'flex' : 'none';
    if (this.tab === 'combo') {
      const disc = this.deps.discovered();
      for (const t of ['all', ...TIERS] as const) {
        const inTier = t === 'all' ? COMBOS : COMBOS.filter((x) => x.tier === t);
        const got = inTier.filter((x) => disc.has(x.id)).length;
        const b = document.createElement('button');
        b.dataset['tier'] = t;
        b.textContent = t === 'all' ? `전체 ${got}/${inTier.length}` : `${TIER_NAME[t]} ${got}/${inTier.length}`;
        b.style.cssText =
          'min-height:44px;padding:0 10px;border-radius:8px;font-size:12px;white-space:nowrap;' +
          `border:2px solid ${this.tier === t ? '#7ad0ff' : 'transparent'};` +
          'background:#182b38;color:#eaf6ff';
        b.addEventListener('click', () => {
          this.tier = t;
          this.render();
        });
        this.tabBar.append(b);
      }
    }

    this.filterBtn.textContent = this.undiscoveredOnly ? '🔍 미발견만' : '🔍 전체 보기';

    this.listEl.replaceChildren();
    if (this.tab === 'combo') this.renderCombos();
    else if (this.tab === 'facility') this.renderFacilities();
    else this.renderEquipment();
  }

  private renderCombos(): void {
    const disc = this.deps.discovered();
    const pool = this.tier === 'all' ? COMBOS : COMBOS.filter((x) => x.tier === this.tier);
    for (const combo of pool) {
      const found = disc.has(combo.id);
      if (this.undiscoveredOnly && found) continue;
      /*
       * 미발견은 **힌트만**. 전부 보여주면 발견이 아니라 체크리스트가 되고,
       * 전부 가리면 힌트가 아니라 벽이 된다 — 첫 조건 하나만 남긴다.
       */
      const parts = combo.requires.map((r) => r.facility ?? r.need ?? '?');
      const hint =
        parts.length > 0
          ? [parts[0], ...parts.slice(1).map(() => '?')].join(' + ')
          : '?';
      const boost = [
        combo.bonus.satisfaction ? `만족 +${combo.bonus.satisfaction}` : '',
        combo.bonus.revenue ? `매출 +${Math.round(combo.bonus.revenue * 100)}%` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      this.listEl.append(
        this.row(
          found,
          found ? combo.name : '? ? ?',
          found
            ? `${TIER_NAME[combo.tier]} · ${boost}`
            : `${TIER_NAME[combo.tier]} · ${hint}`,
          combo.id,
        ),
      );
    }
    if (this.listEl.children.length === 0) {
      this.listEl.append(this.row(true, '전부 발견했습니다', '이 티어는 비었습니다', 'empty'));
    }
  }

  private renderFacilities(): void {
    const built = new Set(this.deps.placement.all().map((x) => x.defId));
    const grade = this.deps.grade();
    for (const def of allFacilityDefs()) {
      const found = built.has(def.id);
      if (this.undiscoveredOnly && found) continue;
      const need = requiredGrade(def.id);
      this.listEl.append(
        this.row(
          found,
          def.name,
          found
            ? `${def.size[0]}×${def.size[1]} · 정원 ${def.capacity}`
            : need > grade
              ? `${need}등급에 열립니다`
              : `아직 안 지음 · ${def.size[0]}×${def.size[1]}`,
          def.id,
        ),
      );
    }
    if (this.listEl.children.length === 0) {
      this.listEl.append(this.row(true, '전부 지었습니다', '', 'empty'));
    }
  }

  private renderEquipment(): void {
    const used = new Set(this.deps.courses.all.map((c) => c.equipId));
    for (const e of COURSE_EQUIPMENT) {
      const found = used.has(e.id);
      if (this.undiscoveredOnly && found) continue;
      this.listEl.append(
        this.row(
          found,
          e.name,
          found ? `정원 ${e.capacity} · 스릴 ×${e.thrillCoef}` : '아직 안 써봄',
          e.id,
        ),
      );
    }
    if (this.listEl.children.length === 0) {
      this.listEl.append(this.row(true, '전부 써봤습니다', '', 'empty'));
    }
  }

  /** 도구용 — 탭·필터를 직접 바꾼다 */
  setForTest(tab: Tab, undiscoveredOnly: boolean, tier: ComboTier | 'all' = 'all'): void {
    this.tab = tab;
    this.undiscoveredOnly = undiscoveredOnly;
    this.tier = tier;
    this.render();
  }
}

/** 지금 발동 중인 콤보 id — 결산이 이걸 누적해 "발견"으로 삼는다 */
export function activeComboIds(placement: PlacementGrid): string[] {
  return evaluateCombos(placement).active.map((c) => c.id);
}

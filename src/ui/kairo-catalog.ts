import { COMBOS, evaluateCombos, type ComboTier } from '../sim/kairo/combos.js';
import { allFacilityDefs } from '../sim/kairo/placement.js';
import { COURSE_EQUIPMENT } from '../sim/kairo/course.js';
import type { PlacementGrid } from '../sim/kairo/placement.js';
import type { CourseStore } from '../sim/kairo/course.js';
import type { SwimZone } from '../sim/kairo/swim.js';
import { requiredGrade } from '../sim/kairo/progress.js';
import { el, button } from './dom.js';
import { panelHost } from './panels.js';

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
    this.root = el('div', 'kover');
    this.root.id = 'kairo-catalog';
    this.root.hidden = true;

    const head = el('div', 'ksheet-head');
    head.append(el('div', 'ksheet-title', '도감'));
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-catalog-close';
    head.append(close);

    this.countEl = el('div', 'kchips wrap');
    this.tabBar = el('div', 'kchips');

    this.filterBtn = button('kbtn', '', () => {
      this.undiscoveredOnly = !this.undiscoveredOnly;
      this.render();
    });
    this.filterBtn.id = 'kairo-catalog-filter';

    this.listEl = el('div', 'kstack');
    this.listEl.style.setProperty('--stack-gap', '4px');

    this.root.append(head, this.countEl, this.tabBar, this.filterBtn, this.listEl);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    // 한 번에 하나 (K37) — 모달이 떠 있으면 열지 않는다
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
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
    /*
     * ★ 56px — 스펙이 정한 한 항목 높이. `.kitem.wide` 가 지킨다.
     * 미발견은 `disabled` 로 둔다 — 색을 따로 칠하지 않아도 `.kitem[disabled]` 가
     * 가라앉은 표면·흐린 글씨를 준다 (새 판의 잠긴 시나리오와 같은 모양).
     */
    const d = el('button', 'kitem wide');
    d.dataset['entry'] = key;
    d.dataset['found'] = found ? '1' : '0';
    d.disabled = !found;
    d.append(
      el('div', 'kitem-name', `${found ? '✅' : '🔒'} ${title}`),
      el('div', 'kitem-sub', detail),
    );
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
      const b = button(`kbtn${this.tab === id ? ' on' : ''}`, `${name} ${got}/${all}`, () => {
        this.tab = id;
        this.render();
      });
      b.dataset['tab'] = id;
      this.countEl.append(b);
    }

    // 티어 탭은 콤보에만 의미가 있다
    this.tabBar.replaceChildren();
    this.tabBar.hidden = this.tab !== 'combo';
    if (this.tab === 'combo') {
      const disc = this.deps.discovered();
      for (const t of ['all', ...TIERS] as const) {
        const inTier = t === 'all' ? COMBOS : COMBOS.filter((x) => x.tier === t);
        const got = inTier.filter((x) => disc.has(x.id)).length;
        const b = button(
          `kbtn${this.tier === t ? ' on' : ''}`,
          t === 'all' ? `전체 ${got}/${inTier.length}` : `${TIER_NAME[t]} ${got}/${inTier.length}`,
          () => {
            this.tier = t;
            this.render();
          },
        );
        b.dataset['tier'] = t;
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
      // 숨은 콤보(K43)는 힌트조차 없다 — 놓아 봐야 아는 것이 발견의 재미다 (MMS 준거)
      const hint = combo.hidden
        ? '???'
        : parts.length > 0
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

/**
 * 지금 발동 중인 콤보 id — 결산이 이걸 누적해 "발견"으로 삼는다.
 *
 * ⚠ `zones` 를 안 넘기면 **zone 콤보 3종이 실게임에서 영원히 발견되지 않는다** —
 * 봇은 `swimZones()` 를 넘기므로 헤드리스와 실제 판이 갈라진다. `evaluateCombos` 의
 * 규칙과 같다: 모든 호출부가 같은 zones 를 받아야 한다.
 */
export function activeComboIds(
  placement: PlacementGrid,
  zones: readonly SwimZone[] = [],
): string[] {
  return evaluateCombos(placement, undefined, zones).active.map((c) => c.id);
}

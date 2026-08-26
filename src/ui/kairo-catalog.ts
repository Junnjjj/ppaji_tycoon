import { COMBOS, CONFLICTS, evaluateCombos, type ComboTier } from '../sim/kairo/combos.js';
import { allFacilityDefs } from '../sim/kairo/placement.js';
import { COURSE_EQUIPMENT } from '../sim/kairo/course.js';
import type { PlacementGrid } from '../sim/kairo/placement.js';
import type { SwimZone } from '../sim/kairo/swim.js';
import { requiredGrade } from '../sim/kairo/progress.js';
import { el, button } from './dom.js';
import { ingredientName, REPUTATION_NAME } from './kairo-terms.js';
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
 *
 * ## ⚠ 발견은 한 번 보면 영구다 (P3-C)
 *
 * 세 탭의 판정이 서로 달랐다: 콤보만 영구 `discovered` Set 이고, **시설은 지금 서 있어야**
 * (`placement.all()`), **장비는 지금 쓰고 있어야** (`courses.all`) 발견으로 쳤다.
 * 그래서 철거하면 도감에서 사라졌고 — 도감이 아니라 **현황판**이었다 — 코스 장비 19종은
 * 코스를 동시에 19개 놓을 수 없으니 **구조적으로 완성 불가**였다.
 *
 * 이제 셋 다 **누적 집합**을 주입받는다. 지금 배치를 훑는 일이 이 파일에 남으면 안 된다 —
 * 규칙이 두 벌이 되면 한쪽만 고쳐진다.
 */

const TIER_NAME: Record<ComboTier, string> = { small: '소형', medium: '중형', large: '대형' };
const TIERS: ComboTier[] = ['small', 'medium', 'large'];

type Tab = 'combo' | 'facility' | 'equipment';

export interface CatalogDeps {
  grade: () => number;
  /** 이미 발견한 콤보 id — 결산에서 누적한다 */
  discovered: () => ReadonlySet<string>;
  /** **한 번이라도 지은** 시설 id (P3-C). 철거해도 안 줄어든다 */
  builtEver: () => ReadonlySet<string>;
  /** **한 번이라도 써본** 코스 장비 id (P3-C). 코스를 지워도 안 줄어든다 */
  equipEver: () => ReadonlySet<string>;
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
    return {
      combo: [disc.size, COMBOS.length],
      facility: [this.deps.builtEver().size, allFacilityDefs().length],
      equipment: [this.deps.equipEver().size, COURSE_EQUIPMENT.length],
    };
  }

  private row(
    found: boolean,
    title: string,
    detail: string,
    key: string,
    /** 앞머리 표식. 기본은 발견 여부(✅/🔒) — 감점 줄만 ⚠ 로 갈린다 (P4) */
    icon?: string,
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
      el('div', 'kitem-name', `${icon ?? (found ? '✅' : '🔒')} ${title}`),
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

  /**
   * 상성 감점 4쌍 (P4) — **발견 대상이 아니라 상시 참조표**다.
   *
   * ⚠ 그래서 "미발견만" 필터에서는 **숨긴다.** 이유 둘:
   *   · 뜻이 맞는다 — 감점은 발견해서 모으는 것이 아니라 피하는 규칙이다
   *   · 하네스가 기본 상태에서 **발견 항목 0개 노출**을 요구한다 (`verify:kairo`).
   *     `data-found="1"` 인 줄을 기본 목록에 끼우면 그 검사가 깨진다
   *
   * 티어 필터를 걸었을 때도 안 보인다 — 감점엔 티어가 없다.
   */
  private renderClashes(): void {
    if (this.undiscoveredOnly || this.tier !== 'all') return;
    for (const c of CONFLICTS) {
      const cost = [
        c.penalty.satisfaction ? `${REPUTATION_NAME} −${c.penalty.satisfaction}` : '',
        c.penalty.revenue ? `매출 −${c.penalty.revenue}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      this.listEl.append(
        // `상성`(相性)은 일본어 차용이라 한국어 게임에서 잘 안 쓴다 (UX 감사 P2-33)
        this.row(true, c.name, `궁합 감점 · ${cost} · 두 칸 띄우면 꺼집니다`, c.id, '⚠'),
      );
    }
  }

  private renderCombos(): void {
    this.renderClashes();
    const disc = this.deps.discovered();
    const pool = this.tier === 'all' ? COMBOS : COMBOS.filter((x) => x.tier === this.tier);
    for (const combo of pool) {
      const found = disc.has(combo.id);
      if (this.undiscoveredOnly && found) continue;
      /*
       * 미발견은 **힌트만**. 전부 보여주면 발견이 아니라 체크리스트가 되고,
       * 전부 가리면 힌트가 아니라 벽이 된다 — 첫 조건 하나만 남긴다.
       */
      /*
       * ⚠ **영문 내부 ID 를 화면에 내지 않는다** (UX 감사 P0-4).
       *
       * 실측: 새 판의 도감은 73/73 이 전부 미발견이라 **언제나** 이 힌트 목록으로 처음
       * 열리는데, 거기 `shower_row + ?` · `thrill + ? + ?` 같은 sim 키가 37종 떴다.
       * 한글 이름은 이미 데이터(`kairo-facilities.json` 의 `name`)와 `NEED_NAME` 에 있다 —
       * `ingredientName` 이 그 둘을 묶는다.
       */
      const facilityName = (id: string): string | undefined =>
        allFacilityDefs().find((d) => d.id === id)?.name;
      const parts = combo.requires.map((r) => {
        const token = r.facility ?? r.need;
        return token === undefined ? '?' : ingredientName(token, facilityName);
      });
      // 숨은 콤보(K43)는 힌트조차 없다 — 놓아 봐야 아는 것이 발견의 재미다 (MMS 준거)
      const hint = combo.hidden
        ? '???'
        : parts.length > 0
          ? [parts[0], ...parts.slice(1).map(() => '?')].join(' + ')
          : '?';
      const boost = [
        combo.bonus.satisfaction ? `${REPUTATION_NAME} +${combo.bonus.satisfaction}` : '',
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
    // ⚠ 지금 서 있는 것이 아니라 **한 번이라도 지은 것** (P3-C)
    const built = this.deps.builtEver();
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
    // ⚠ 지금 쓰는 것이 아니라 **한 번이라도 써본 것** (P3-C). 코스를 19개 동시에 놓을 수는 없다
    const used = this.deps.equipEver();
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
/**
 * 발견 누적 — **합집합만** 하고, **이번에 처음 본 것**을 돌려준다 (P3-C).
 *
 * ⚠ 예전 도감은 이 함수 없이 `new Set(placement.all()…)` 을 **매번 새로 만들었다.**
 * 그래서 철거하면 발견이 사라졌고 (도감이 아니라 현황판), 코스 장비 19종은 코스를 동시에
 * 19개 놓을 수 없어 **완성이 구조적으로 불가능**했다. "지금 있는 것"으로 되돌리지 말 것 —
 * 발견은 한 번 보면 영구다.
 *
 * 돌려주는 목록이 **첫 발견 보상의 유일한 근거**다 (숨은 콤보의 `discoverCash`). 이미 있는
 * id 는 절대 안 들어가므로 같은 콤보가 계속 발동해도 보상이 두 번 나가지 않는다.
 */
export function noteSeen(seen: Set<string>, present: Iterable<string>): string[] {
  const fresh: string[] = [];
  for (const id of present) {
    if (seen.has(id)) continue;
    seen.add(id);
    fresh.push(id);
  }
  return fresh;
}

export function activeComboIds(
  placement: PlacementGrid,
  zones: readonly SwimZone[] = [],
): string[] {
  return evaluateCombos(placement, undefined, zones).active.map((c) => c.id);
}

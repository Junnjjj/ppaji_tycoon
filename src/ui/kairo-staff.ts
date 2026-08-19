import { el, button } from './dom.js';
import {
  STAFF_ROLES,
  type StaffRole,
  type StaffRoleId,
  type StaffStore,
} from '../sim/kairo/staff.js';
import type { PlacementGrid } from '../sim/kairo/placement.js';
import { neededFor } from '../sim/kairo/staff.js';
import {
  facilityDef,
  FACILITY_MAX_LEVEL,
  PlacementGrid as PlacementGridClass,
  SPECIALTY_LABELS,
  SPECIALTY_LEVEL,
  type FacilitySpecialty,
} from '../sim/kairo/placement.js';
import { priceSatisfaction } from '../sim/kairo/week.js';
import { panelHost } from './panels.js';

/**
 * 경영 패널 — 스펙 §15.9. **탭 3개: 가격 · 직원 · 개선.**
 *
 * 셋을 한 화면에 묶는 이유는 전부 **매주 다시 판단하는 것**이라서다. 시설은 한 번 지으면
 * 끝이지만 값·인원·개선은 상황이 바뀌면 다시 본다. 버튼을 따로 두면 화면 가장자리가
 * 버튼으로 덮인다 (실측: 우측에 이미 5개가 쌓였다).
 *
 * ## 직원 (§11) — 여섯 동사 중 "사람을 쓴다"
 *
 * ## 무엇을 보여줘야 하나
 *
 * 판단에 필요한 것은 셋이다: **지금 몇 명 / 몇 명이 필요한가 / 주급이 얼마인가.**
 * "필요 인원"이 없으면 몇 명을 써야 할지 알 방법이 없고, 그러면 이 동사는 추측이 된다.
 * 부족하면 그 줄이 주황으로 뜬다 — 결산의 병목 표시와 같은 규칙이다.
 *
 * ## 왜 시트인가
 *
 * 매주 만지는 것이 아니라 **가끔** 만지는 화면이다 (시설 구성이 바뀔 때). 상시 표시하면
 * 폰 화면을 잡아먹는다. 버튼 하나로 열고 닫는다.
 */

function won(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000) / 10}만`;
  return `${n.toLocaleString('ko-KR')}`;
}

export interface ManageDeps {
  /** 요금 배율을 읽고 쓴다 (§15.9 "값을 매긴다") */
  price: () => number;
  setPrice: (v: number) => void;
  cash: () => number;
  spend: (n: number) => boolean;
}

export class KairoStaffPanel {
  private readonly root: HTMLDivElement;
  private readonly rows = new Map<StaffRoleId, { count: HTMLElement; row: HTMLElement }>();
  private readonly totalEl: HTMLDivElement;
  private readonly tabBar: HTMLDivElement;
  private readonly priceBox: HTMLDivElement;
  private readonly priceSlider: HTMLInputElement;
  private readonly priceLabel: HTMLDivElement;
  private readonly priceHint: HTMLDivElement;
  private readonly staffBox: HTMLDivElement;
  private readonly upgradeBox: HTMLDivElement;
  private tab: 'price' | 'staff' | 'upgrade' = 'staff';
  private staff: StaffStore | null = null;
  private placement: PlacementGrid | null = null;
  private manage: ManageDeps | null = null;
  private onChange: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    /*
     * ⚠ 예전엔 `bottom:0; z-index:20` 이라 **하단 바를 통째로 덮었다** (K33 에서 코스
     * 패널이 같은 버그로 고쳐졌다). `.ksheet` 로 가면 바 위에 얹히고 세이프에어리어도
     * 자동으로 맞는다 — 시트 하나가 세 가지를 한꺼번에 해결한다.
     */
    this.root = el('div', 'ksheet');
    this.root.id = 'kairo-staff';
    this.root.hidden = true;

    const head = el('div', 'ksheet-head');
    head.append(el('div', 'ksheet-title', '경영'));
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-staff-close';

    this.tabBar = el('div', 'kchips');
    for (const [id, name] of [
      ['price', '가격'],
      ['staff', '직원'],
      ['upgrade', '개선'],
    ] as const) {
      const b = button('kbtn', name, () => {
        this.tab = id;
        this.refresh();
      });
      b.dataset['manage'] = id;
      this.tabBar.append(b);
    }
    // 닫기는 **맨 오른쪽**이다 — 탭 사이에 끼면 탭처럼 읽힌다 (스크린샷에서 잡았다)
    head.append(this.tabBar, close);

    const body = el('div', 'ksheet-body kstack');
    this.totalEl = el('div', 'kcaption');

    this.priceBox = el('div', 'kstack');
    this.priceSlider = el('input', 'kslider');
    this.priceSlider.id = 'kairo-price';
    this.priceSlider.type = 'range';
    this.priceSlider.min = '70';
    this.priceSlider.max = '140';
    this.priceSlider.step = '5';
    this.priceSlider.value = '100';
    this.priceSlider.addEventListener('input', () => {
      this.manage?.setPrice(Number(this.priceSlider.value) / 100);
      this.refresh();
      this.onChange?.();
    });
    this.priceLabel = el('div');
    this.priceHint = el('div', 'kcaption');
    this.priceBox.append(this.priceLabel, this.priceSlider, this.priceHint);

    this.staffBox = el('div', 'kstack');
    for (const role of STAFF_ROLES) this.staffBox.append(this.roleRow(role));

    this.upgradeBox = el('div', 'kstack');
    this.upgradeBox.style.setProperty('--stack-gap', '4px');

    body.append(this.totalEl, this.priceBox, this.staffBox, this.upgradeBox);
    this.root.append(head, body);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private roleRow(role: StaffRole): HTMLElement {
    const row = el('div', 'krow');
    row.dataset['role'] = role.id;

    const info = el('div', 'krow-main');
    info.append(
      el('div', 'kitem-name', `${role.name} · 주급 ${won(role.wage)}`),
      el('div', 'kitem-sub', role.short),
    );

    const minus = el('button', 'kbtn step', '−');
    minus.dataset['role'] = role.id;
    minus.dataset['delta'] = '-1';
    const count = el('div', 'kcount');
    count.dataset['count'] = role.id;
    const plus = el('button', 'kbtn step', '+');
    plus.dataset['role'] = role.id;
    plus.dataset['delta'] = '1';
    // ★ 44px — `.kbtn` 이 지킨다 (CLAUDE.md 의 모바일 검증 항목)
    for (const b of [minus, plus]) {
      b.addEventListener('click', () => {
        this.staff?.hire(role.id, Number(b.dataset['delta']));
        this.refresh();
        this.onChange?.();
      });
    }

    row.append(info, minus, count, plus);
    this.rows.set(role.id, { count, row });
    return row;
  }

  show(
    staff: StaffStore,
    placement: PlacementGrid,
    onChange: () => void,
    manage?: ManageDeps,
  ): void {
    this.staff = staff;
    this.placement = placement;
    this.manage = manage ?? null;
    this.onChange = onChange;
    // 한 번에 하나 (K37)
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
    this.refresh();
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }

  refresh(): void {
    const staff = this.staff;
    const placement = this.placement;
    if (!staff || !placement) return;

    for (const b of Array.from(this.tabBar.querySelectorAll('button'))) {
      b.classList.toggle('on', b.dataset['manage'] === this.tab);
    }
    this.priceBox.hidden = this.tab !== 'price';
    this.staffBox.hidden = this.tab !== 'staff';
    this.upgradeBox.hidden = this.tab !== 'upgrade';

    if (this.tab === 'price' && this.manage) {
      const mult = this.manage.price();
      this.priceSlider.value = String(Math.round(mult * 100));
      const delta = priceSatisfaction(mult);
      this.priceLabel.textContent = `요금 ${Math.round(mult * 100)}% (정가 100%)`;
      /*
       * 만족도 영향을 **숫자로** 보여준다. 슬라이더만 주면 "얼마나 올려도 되나"를
       * 알 방법이 없고, 그러면 값 매기기가 도박이 된다.
       */
      this.priceHint.textContent =
        delta === 0
          ? '정가 — 만족도에 영향 없음'
          : delta > 0
            ? `만족도 +${delta} (싸게 받아 호감을 산다)`
            : `만족도 ${delta} (비싸면 불만이 는다 — 내리는 쪽보다 영향이 크다)`;
      this.priceHint.classList.toggle('warn', delta < -6);
    }

    if (this.tab === 'upgrade') this.renderUpgrades();
    for (const role of STAFF_ROLES) {
      const cell = this.rows.get(role.id);
      if (!cell) continue;
      const have = staff.count(role.id);
      const need = neededFor(role, placement);
      cell.count.textContent = `${have} / ${need}`;
      // 부족하면 주황 — 결산의 병목 표시와 같은 규칙
      cell.row.classList.toggle('warn', have < need);
      cell.count.classList.toggle('warn', have < need);
    }
    this.totalEl.textContent =
      `${staff.total}명 · 주급 합계 ${won(staff.weeklyWage())} ` +
      '(고정비 — 손님이 없어도 나갑니다)';
  }

  /**
   * 개선 목록 (§15.9). **확장이 등급 상한에 막힌 뒤의 유일한 성장 수단**이라,
   * 낮은 단계부터 위에 놓는다 — 어디에 돈을 쓸지가 바로 보여야 한다.
   *
   * ## 특화 (P1.5)
   *
   * 3단계에 닿은 시설은 **돈을 쓰는 줄이 아니라 고르는 줄**이 된다 — 비용 버튼 대신
   * 갈림길 셋. 그래서 고를 것이 있는 줄을 **맨 위**로 올린다: 개선은 미뤄도 되지만
   * 특화는 안 고르면 그 시설이 계속 예전 성능으로 남는다 (조용한 손해).
   *
   * ⚠ 새 패널·새 버튼 클래스를 만들지 않는다 — `.krow.kstack` + `.kchips.wrap` +
   * `.kbtn` 으로 충분했다 (CLAUDE.md "표면 셋 · 속은 한 벌").
   */
  private renderUpgrades(): void {
    const placement = this.placement;
    const manage = this.manage;
    this.upgradeBox.replaceChildren();
    if (!placement) return;
    const items = placement
      .all()
      .filter(
        (it) =>
          placement.levelOf(it.handle) < FACILITY_MAX_LEVEL ||
          // 최고 단계라도 특화를 고른 시설은 남긴다 — 고른 것이 어디에도 안 보이면 안 된다
          placement.specialtyOf(it.handle) !== null ||
          placement.canChooseSpecialty(it.handle),
      )
      .sort(
        (a, b) =>
          Number(placement.canChooseSpecialty(b.handle)) -
            Number(placement.canChooseSpecialty(a.handle)) ||
          placement.levelOf(a.handle) - placement.levelOf(b.handle) ||
          a.handle - b.handle,
      )
      .slice(0, 12);
    if (items.length === 0) {
      this.upgradeBox.append(el('div', 'kcaption', '전부 최고 단계입니다'));
      return;
    }
    for (const it of items) {
      const def = facilityDef(it.defId);
      const level = placement.levelOf(it.handle);
      const spec = placement.specialtyOf(it.handle);
      const choosing = placement.canChooseSpecialty(it.handle);
      const name = def?.name ?? it.defId;

      const row = el('div', choosing ? 'krow kstack' : 'krow');
      row.dataset['upgrade'] = String(it.handle);
      row.dataset['level'] = String(level);
      if (spec) row.dataset['specialty'] = spec;

      const main = el('div', 'krow-main');
      main.append(
        el(
          'div',
          'kitem-name',
          level >= FACILITY_MAX_LEVEL
            ? `${name} · ${level}단계 (최고)`
            : `${name} · ${level}단계 → ${level + 1}단계`,
        ),
      );
      if (spec) {
        const lab = SPECIALTY_LABELS[spec];
        main.append(
          el(
            'div',
            'kitem-sub',
            `특화 ${lab.name} · ${lab.effect}` + (level >= FACILITY_MAX_LEVEL ? ' ×2' : ''),
          ),
        );
      } else if (choosing) {
        main.append(el('div', 'kitem-sub', '특화를 고르세요 — 한 번 고르면 못 바꿉니다'));
      } else if (level < SPECIALTY_LEVEL && PlacementGridClass.specialtiesFor(it.defId).length > 0) {
        /*
         * ⚠ 특화가 **없는** 시설(플로팅덱·화단 등 정원 0)에는 이 줄을 안 붙인다.
         * 붙이면 영영 안 오는 갈림길을 기다리게 된다.
         */
        main.append(el('div', 'kitem-sub', `${SPECIALTY_LEVEL}단계에서 특화를 고릅니다`));
      }
      row.append(main);

      if (choosing) {
        /*
         * 데이터가 허용한 것만 (불변식 3). 매표소처럼 하나뿐인 시설도 있어서
         * 목록을 그대로 돌린다 — UI 가 셋을 고정하면 데이터의 필터가 무의미해진다.
         */
        const chips = el('div', 'kchips wrap');
        for (const s of PlacementGridClass.specialtiesFor(it.defId) as FacilitySpecialty[]) {
          const lab = SPECIALTY_LABELS[s];
          const b = el('button', 'kbtn', `${lab.name} · ${lab.effect}`);
          b.dataset['specialtyPick'] = s;
          b.addEventListener('click', () => {
            if (!placement.chooseSpecialty(it.handle, s)) return;
            this.refresh();
            this.onChange?.();
          });
          chips.append(b);
        }
        row.append(chips);
      } else if (level < FACILITY_MAX_LEVEL) {
        const cost = placement.upgradeCost(it.handle);
        const b = el('button', 'kbtn', won(cost));
        const poor = !manage || cost > manage.cash();
        b.disabled = poor;
        b.addEventListener('click', () => {
          if (!manage || !manage.spend(cost)) return;
          placement.upgrade(it.handle);
          this.refresh();
          this.onChange?.();
        });
        row.append(b);
      }
      this.upgradeBox.append(row);
    }
  }
}

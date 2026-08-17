import {
  STAFF_ROLES,
  type StaffRole,
  type StaffRoleId,
  type StaffStore,
} from '../sim/kairo/staff.js';
import type { PlacementGrid } from '../sim/kairo/placement.js';
import { neededFor } from '../sim/kairo/staff.js';
import { facilityDef, MAX_LEVEL } from '../sim/kairo/placement.js';
import { priceSatisfaction } from '../sim/kairo/week.js';

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
    this.root = document.createElement('div');
    this.root.id = 'kairo-staff';
    this.root.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:20;display:none;flex-direction:column;' +
      'gap:6px;background:#12212c;border-top:1px solid #2b4658;padding:12px 12px 16px;' +
      'font:13px/1.4 system-ui,sans-serif;color:#e8f4ff;max-height:70vh;overflow-y:auto';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    const title = document.createElement('div');
    title.textContent = '경영';
    title.style.cssText = 'font-size:16px;font-weight:700';
    const close = document.createElement('button');
    close.id = 'kairo-staff-close';
    close.textContent = '닫기';
    close.style.cssText =
      'min-height:44px;min-width:64px;border-radius:8px;border:none;background:#24445a;color:#eaf6ff';
    close.addEventListener('click', () => this.hide());
    head.append(title, close);

    this.totalEl = document.createElement('div');
    this.totalEl.style.cssText = 'font-size:12px;color:#9dbdd2';

    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText = 'display:flex;gap:6px';
    for (const [id, name] of [
      ['price', '가격'],
      ['staff', '직원'],
      ['upgrade', '개선'],
    ] as const) {
      const b = document.createElement('button');
      b.dataset['manage'] = id;
      b.textContent = name;
      b.style.cssText =
        'flex:1;min-height:44px;border-radius:8px;font-size:13px;background:#1d3b4e;color:#eaf6ff;' +
        'border:2px solid transparent';
      b.addEventListener('click', () => {
        this.tab = id;
        this.refresh();
      });
      this.tabBar.append(b);
    }

    this.priceBox = document.createElement('div');
    this.priceBox.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    this.priceSlider = document.createElement('input');
    this.priceSlider.id = 'kairo-price';
    this.priceSlider.type = 'range';
    this.priceSlider.min = '70';
    this.priceSlider.max = '140';
    this.priceSlider.step = '5';
    this.priceSlider.value = '100';
    // ★ 44px — 슬라이더도 터치 타깃이다
    this.priceSlider.style.cssText = 'width:100%;height:44px';
    this.priceSlider.addEventListener('input', () => {
      this.manage?.setPrice(Number(this.priceSlider.value) / 100);
      this.refresh();
      this.onChange?.();
    });
    this.priceLabel = document.createElement('div');
    this.priceLabel.style.cssText = 'font-size:13px';
    this.priceHint = document.createElement('div');
    this.priceHint.style.cssText = 'font-size:11px;color:#9dbdd2';
    this.priceBox.append(this.priceLabel, this.priceSlider, this.priceHint);

    this.staffBox = document.createElement('div');
    this.staffBox.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    for (const role of STAFF_ROLES) this.staffBox.append(this.roleRow(role));

    this.upgradeBox = document.createElement('div');
    this.upgradeBox.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    this.root.append(head, this.tabBar, this.totalEl, this.priceBox, this.staffBox, this.upgradeBox);
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  private roleRow(role: StaffRole): HTMLElement {
    const row = document.createElement('div');
    row.dataset['role'] = role.id;
    row.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#182b38';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    const name = document.createElement('div');
    name.textContent = `${role.name} · 주급 ${won(role.wage)}`;
    name.style.cssText = 'font-weight:600';
    const desc = document.createElement('div');
    desc.textContent = role.short;
    desc.style.cssText = 'font-size:11px;color:#9dbdd2';
    info.append(name, desc);

    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.dataset['role'] = role.id;
    minus.dataset['delta'] = '-1';
    const count = document.createElement('div');
    count.dataset['count'] = role.id;
    count.style.cssText = 'min-width:56px;text-align:center;font-variant-numeric:tabular-nums';
    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.dataset['role'] = role.id;
    plus.dataset['delta'] = '1';
    // ★ 44px — 폰 터치 타깃 하한 (CLAUDE.md 의 모바일 검증 항목)
    for (const b of [minus, plus]) {
      b.style.cssText =
        'min-width:44px;min-height:44px;border-radius:8px;border:none;background:#2a5674;' +
        'color:#eaf6ff;font-size:20px;line-height:1';
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
    this.root.style.display = 'flex';
    this.refresh();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  refresh(): void {
    const staff = this.staff;
    const placement = this.placement;
    if (!staff || !placement) return;

    for (const b of Array.from(this.tabBar.querySelectorAll('button'))) {
      const on = (b as HTMLElement).dataset['manage'] === this.tab;
      (b as HTMLElement).style.borderColor = on ? '#7ad0ff' : 'transparent';
    }
    this.priceBox.style.display = this.tab === 'price' ? 'flex' : 'none';
    this.staffBox.style.display = this.tab === 'staff' ? 'flex' : 'none';
    this.upgradeBox.style.display = this.tab === 'upgrade' ? 'flex' : 'none';

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
      this.priceHint.style.color = delta < -6 ? '#ffcf8a' : '#9dbdd2';
    }

    if (this.tab === 'upgrade') this.renderUpgrades();
    for (const role of STAFF_ROLES) {
      const cell = this.rows.get(role.id);
      if (!cell) continue;
      const have = staff.count(role.id);
      const need = neededFor(role, placement);
      cell.count.textContent = `${have} / ${need}`;
      // 부족하면 주황 — 결산의 병목 표시와 같은 규칙
      cell.row.style.background = have < need ? 'rgba(240,160,60,.18)' : '#182b38';
      cell.count.style.color = have < need ? '#ffcf8a' : '#e8f4ff';
    }
    this.totalEl.textContent =
      `${staff.total}명 · 주급 합계 ${won(staff.weeklyWage())} ` +
      '(고정비 — 손님이 없어도 나갑니다)';
  }

  /**
   * 개선 목록 (§15.9). **확장이 등급 상한에 막힌 뒤의 유일한 성장 수단**이라,
   * 낮은 단계부터 위에 놓는다 — 어디에 돈을 쓸지가 바로 보여야 한다.
   */
  private renderUpgrades(): void {
    const placement = this.placement;
    const manage = this.manage;
    this.upgradeBox.replaceChildren();
    if (!placement) return;
    const items = placement
      .all()
      .filter((it) => placement.levelOf(it.handle) < MAX_LEVEL)
      .sort((a, b) => placement.levelOf(a.handle) - placement.levelOf(b.handle) || a.handle - b.handle)
      .slice(0, 12);
    if (items.length === 0) {
      const d = document.createElement('div');
      d.textContent = '전부 최고 단계입니다';
      d.style.cssText = 'padding:10px;color:#9dbdd2';
      this.upgradeBox.append(d);
      return;
    }
    for (const it of items) {
      const def = facilityDef(it.defId);
      const cost = placement.upgradeCost(it.handle);
      const row = document.createElement('div');
      row.dataset['upgrade'] = String(it.handle);
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#182b38';
      const t = document.createElement('div');
      t.style.cssText = 'flex:1;min-width:0';
      t.textContent =
        `${def?.name ?? it.defId} · ${placement.levelOf(it.handle)}단계 → ` +
        `${placement.levelOf(it.handle) + 1}단계`;
      const b = document.createElement('button');
      b.textContent = won(cost);
      const poor = !manage || cost > manage.cash();
      b.disabled = poor;
      b.style.cssText =
        'min-height:44px;min-width:80px;border-radius:8px;border:none;font-size:13px;' +
        `background:${poor ? '#1a2731' : '#2a5674'};color:${poor ? '#6b8296' : '#eaf6ff'}`;
      b.addEventListener('click', () => {
        if (!manage || !manage.spend(cost)) return;
        placement.upgrade(it.handle);
        this.refresh();
        this.onChange?.();
      });
      row.append(t, b);
      this.upgradeBox.append(row);
    }
  }
}

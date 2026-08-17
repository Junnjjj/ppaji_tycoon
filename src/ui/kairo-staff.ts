import {
  STAFF_ROLES,
  type StaffRole,
  type StaffRoleId,
  type StaffStore,
} from '../sim/kairo/staff.js';
import type { PlacementGrid } from '../sim/kairo/placement.js';
import { neededFor } from '../sim/kairo/staff.js';

/**
 * 직원 패널 — 스펙 §11. **여섯 동사 중 "사람을 쓴다".**
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

export class KairoStaffPanel {
  private readonly root: HTMLDivElement;
  private readonly rows = new Map<StaffRoleId, { count: HTMLElement; row: HTMLElement }>();
  private readonly totalEl: HTMLDivElement;
  private staff: StaffStore | null = null;
  private placement: PlacementGrid | null = null;
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
    title.textContent = '직원';
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

    this.root.append(head, this.totalEl);
    for (const role of STAFF_ROLES) this.root.append(this.roleRow(role));
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

  show(staff: StaffStore, placement: PlacementGrid, onChange: () => void): void {
    this.staff = staff;
    this.placement = placement;
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
}

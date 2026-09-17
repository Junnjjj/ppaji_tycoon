/**
 * 직원 창 (G20) — 고용(역할 4 · 비용·월급·효과) / 직원 목록(초상·이름·역할·Lv·EXP 게이지·해고) / 청결.
 */
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import { npcPortrait } from '../portraits.js'; // 과제 B
import { staffNpcSeed } from '../../assets/npc-v8.js'; // 역할 seed — 씬 `syncStaff` 와 같은 얼굴
import { STAFF_ROLES, STAFF_EXP_PER_LEVEL, STAFF_MAX_LEVEL } from '../../sim/staff.js';
import type { Game } from '../../sim/game.js';

export class StaffWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs');
  private readonly body = el('div', 'krows');
  private tab: 'hire' | 'list' = 'list';

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-staff', '직원', 'blue');
    for (const t of [{ id: 'list', label: '직원' }, { id: 'hire', label: '고용' }] as const) {
      const b = el('button', 'ktab', t.label);
      b.type = 'button';
      b.dataset['tab'] = t.id;
      b.addEventListener('click', () => { this.tab = t.id; this.render(); });
      this.tabs.append(b);
    }
    this.win.body.append(this.tabs, this.body);
  }

  show(tab?: 'hire' | 'list'): void {
    if (tab) this.tab = tab;
    else if (this.game().staff.all.length === 0) this.tab = 'hire';
    this.render();
    this.win.show();
  }

  private render(): void {
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.tab);
    this.body.replaceChildren();
    const g = this.game();
    const head = el('div', 'krow');
    const clean = g.staff.cleanliness;
    const track = el('span', 'kbar'); const fill = el('span', 'kbar-fill kclean'); fill.style.width = `${Math.round(clean)}%`; track.append(fill);
    head.append(el('span', 'krow-k', '파크 청결'), track, el('span', 'krow-v', `${Math.round(clean)}`));
    this.body.append(head);
    const sub = el('div', 'krow-sub', `월급 합계 ${g.staff.salaryPerDay().toLocaleString('ko-KR')}G / 일 · 직원 ${g.staff.all.length}명`);
    this.body.append(sub);
    if (this.tab === 'hire') {
      for (const role of STAFF_ROLES.values()) {
        const row = el('button', 'krow kcard-row');
        row.type = 'button';
        row.dataset['hire'] = role.id;
        const face = el('span', 'kportrait');
        face.append(npcPortrait(staffNpcSeed(role.id), 'happy'));
        const text = el('span', 'krow-text');
        text.append(el('span', 'krow-name', `${role.name} — 고용 ${role.hireCost.toLocaleString('ko-KR')}G`));
        text.append(el('span', 'krow-sub', `월급 ${role.salary}G/일 · ${role.desc}`));
        row.append(face, text);
        row.disabled = !g.canHire(role.id).ok;
        row.addEventListener('click', () => {
          const r = g.hireStaff(role.id);
          this.host.toast(r.ok ? `${role.name}을(를) 고용했다` : r.reason, r.ok);
          if (r.ok) { this.host.onChanged(); this.tab = 'list'; this.render(); }
        });
        this.body.append(row);
      }
    } else {
      if (g.staff.all.length === 0) this.body.append(el('div', 'krow-sub', '아직 직원이 없다 — 「고용」 탭에서 뽑자'));
      for (const st of g.staff.all) {
        const role = g.staff.roleOf(st);
        const row = el('div', 'krow kfriend');
        row.dataset['staff'] = String(st.uid);
        const face = el('span', 'kportrait');
        face.append(npcPortrait(staffNpcSeed(role.id), 'calm'));
        const text = el('span', 'krow-text');
        text.append(el('span', 'krow-name', `${st.name} · ${role.name} Lv${st.level}`));
        const need = STAFF_EXP_PER_LEVEL * st.level;
        text.append(el('span', 'krow-sub', st.level >= STAFF_MAX_LEVEL ? '최고 레벨' : `EXP ${st.exp} / ${need} · 효과 ×${(1 + 0.1 * (st.level - 1)).toFixed(1)}`));
        const fire = el('button', 'kchip', '해고');
        fire.type = 'button';
        fire.dataset['fire'] = String(st.uid);
        fire.addEventListener('click', () => { const r = g.fireStaff(st.uid); this.host.toast(r.ok ? `${st.name}을(를) 내보냈다` : r.reason, r.ok); this.host.onChanged(); this.render(); });
        row.append(face, text, fire);
        this.body.append(row);
      }
    }
  }
}

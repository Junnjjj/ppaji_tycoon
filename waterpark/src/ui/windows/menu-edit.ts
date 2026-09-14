/**
 * 식당 메뉴 창 — 위 5칸(카테고리·궁합 표시) · 아래 도감 레시피 목록(카테고리 필터). 행 탭 → 빈 칸에 · 칸 탭 → 뺀다.
 * 4카테고리를 다 채우면 칸 줄에 보너스 표시.
 */
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import type { FoodCategory } from '../../data/schema.js';
import { recipePrice } from '../../sim/restaurant.js';

const CAT_KO: Record<FoodCategory, string> = { drink: '음료', snack: '스낵', meal: '식사', dessert: '디저트' };
const COMPAT_KO = { good: '◎', neutral: '○', bad: '△' } as const;

export class MenuEditWindow {
  private readonly win: WindowPanel;
  private readonly slotsEl = el('div', 'kslots');
  private readonly filter = el('div', 'kchips');
  private readonly list = el('div', 'krows');
  private uid: number | null = null;
  private cat: FoodCategory | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-menu', '메뉴', 'blue');
    this.win.body.append(this.slotsEl, this.filter, this.list);
  }

  show(uid: number): void {
    this.uid = uid;
    const f = this.game().facilities.byUid(uid);
    if (f) this.win.setTitle(`${this.game().facilities.defOf(f).name} 메뉴`);
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    const uid = this.uid;
    if (uid === null) return;
    const f = g.facilities.byUid(uid);
    if (!f) return;
    const slots = g.menus.slotsOf(uid);
    this.slotsEl.replaceChildren();
    const cats = g.menus.categories(uid);
    const head = el('div', 'krow');
    head.append(el('span', 'krow-k', `메뉴 인기 +${g.menus.menuPopularity(uid, f.defId)}`), el('span', 'krow-v', `카테고리 ${cats}/4${cats === 4 ? ' · 보너스!' : ''}`));
    this.slotsEl.append(head);
    const row = el('div', 'kchips');
    slots.forEach((id, k) => {
      const r = id ? g.menus.recipes.get(id) : undefined;
      const b = el('button', `kchip kslot${r ? ' on' : ''}`, r ? `${r.name} ${COMPAT_KO[g.menus.compatOf(f.defId, r.id)]}` : `+ ${k + 1}`);
      b.type = 'button';
      b.dataset['slot'] = String(k);
      b.addEventListener('click', () => {
        if (!r) return;
        g.setMenu(uid, k, null);
        this.host.onChanged();
        this.render();
      });
      row.append(b);
    });
    this.slotsEl.append(row);
    this.filter.replaceChildren();
    for (const [c, label] of [[null, '전체'], ['drink', '음료'], ['snack', '스낵'], ['meal', '식사'], ['dessert', '디저트']] as const) {
      const b = el('button', `kchip${this.cat === c ? ' on' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', () => { this.cat = c; this.render(); });
      this.filter.append(b);
    }
    this.list.replaceChildren();
    const known = [...g.cooking.known].map((id) => g.menus.recipes.get(id)).filter((r): r is NonNullable<typeof r> => !!r).filter((r) => this.cat === null || r.cat === this.cat);
    for (const r of known) {
      const equipped = slots.includes(r.id);
      const compat = g.menus.compatOf(f.defId, r.id);
      const b = el('button', 'krow kcard-row');
      b.type = 'button';
      b.dataset['recipe'] = r.id;
      b.disabled = equipped || !slots.includes(null);
      const text = el('span', 'krow-text');
      const mul = g.cooking.mult;
      // G53 (v3 잔여): 실패작도 걸 수 있다 — 원작처럼 값싼 「실패작」 으로 표시
      text.append(el('span', 'krow-name', `${COMPAT_KO[compat]} ${r.name}${r.unlock === 'fail' ? ' · 실패작' : ''}`), el('span', 'krow-sub', `${CAT_KO[r.cat]} · 맛 ${Math.round(r.taste * mul)} · 외관 ${r.look} · 인기 ${Math.round(r.pop * mul)}${mul > 1 ? ` (Lv${g.cooking.level})` : ''}${compat === 'bad' ? ' · 이 가게와 안 맞다 (인기 −50%)' : compat === 'good' ? ' · 잘 맞는다 (+50%)' : ''}`));
      b.append(text, el('span', 'krow-v', `${Math.round(recipePrice(r) * g.cooking.mult)}G`));
      b.addEventListener('click', () => {
        const empty = slots.indexOf(null);
        if (empty < 0) return;
        const res = g.setMenu(uid, empty, r.id);
        this.host.toast(res.ok ? `${r.name} 을 ${empty + 1}번 칸에` : res.reason, res.ok);
        if (res.ok) this.host.onChanged();
        this.render();
      });
      this.list.append(b);
    }
    if (known.length === 0) {
      const e = el('div', 'krow');
      e.append(el('span', 'krow-k', '아는 레시피가 없다 — 요리 개발에서 만들자'));
      this.list.append(e);
    }
  }
}

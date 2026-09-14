/**
 * 요리 개발 창 — 재료 칩(≤5, 중복 가능) → 개발. 결과는 창 안 한 줄(발견/실패+힌트). 아래 도감 + 재료 사기.
 * 정답표는 없다 — 카테고리 힌트만.
 */
import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { COOK_COST, COOK_MAX_INGREDIENTS, COOK_UNLOCK_RANK } from '../../sim/cooking.js';
import type { FoodCategory } from '../../data/schema.js';

const CAT_KO: Record<FoodCategory, string> = { drink: '음료', snack: '스낵', meal: '식사', dessert: '디저트' };

const ING_ICON: Record<string, IconName> = { fruit: 'fruit', base: 'base', sweet: 'sweet', dairy: 'dairy', seafood: 'seafood', grain: 'grain', veg: 'veg', meat: 'meat', nut: 'nut' };
const ingIcon = (cls: string | undefined): IconName => ING_ICON[cls ?? ''] ?? 'cook';

export class CookWindow {
  private readonly win: WindowPanel;
  private readonly head = el('div', 'krow');
  private readonly picked = el('div', 'kchips kpicked');
  private readonly chips = el('div', 'kchips kwrap');
  private readonly result = el('div', 'krow kresult');
  private readonly cookBtn: HTMLButtonElement;
  private readonly codex = el('div', 'krows');
  private readonly shopList = el('div', 'krows');
  private sel: string[] = [];

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-cook', '요리 개발', 'purple');
    this.cookBtn = el('button', 'kbtn primary', `개발하기 · ${COOK_COST}G`);
    this.cookBtn.type = 'button';
    this.cookBtn.id = 'win-cook-go';
    this.cookBtn.addEventListener('click', () => this.cook());
    this.result.classList.add('khide');
    this.win.body.append(this.head, this.picked, this.chips, this.cookBtn, this.result, el('div', 'krow-name', '도감'), this.codex, el('div', 'krow-name', '재료 사기'), this.shopList);
  }

  show(): void {
    this.sel = []; // 열 때마다 빈 칸에서 시작 (원작과 같다)
    this.result.classList.add('khide');
    this.render();
    this.win.show();
  }

  private render(): void {
    const g = this.game();
    const c = g.cooking;
    this.head.replaceChildren();
    const next = c.expToNext();
    this.head.append(el('span', 'krow-k', `요리 Lv${c.level} · 레시피 ${c.known.size}/${c.recipes.size}`), el('span', 'krow-v', next ? `EXP ${next.cur}/${next.need}` : 'MAX'));
    this.picked.replaceChildren();
    for (let k = 0; k < COOK_MAX_INGREDIENTS; k++) {
      const id = this.sel[k];
      const ing = id ? c.ingredients.get(id) : undefined;
      const b = el('button', `kchip${id ? ' on' : ''}`, '');
      if (ing) b.append(iconEl(ingIcon(ing.class)), el('span', undefined, ` ${ing.name}`)); else b.textContent = `빈 칸 ${k + 1}`;
      b.type = 'button';
      b.dataset['picked'] = String(k);
      b.addEventListener('click', () => { if (id) { this.sel.splice(k, 1); this.render(); } });
      this.picked.append(b);
    }
    this.chips.replaceChildren();
    for (const ing of c.ingredients.values()) {
      if (!c.owned.has(ing.id)) continue;
      // G54: 재료 칩에 계열 아이콘 (원작의 재료 그림 자리)
      const b = el('button', 'kchip', '');
      b.append(iconEl(ingIcon(ing.class)), el('span', undefined, ` ${ing.name}`));
      b.type = 'button';
      b.dataset['ingredient'] = ing.id;
      b.disabled = this.sel.length >= COOK_MAX_INGREDIENTS;
      b.addEventListener('click', () => { this.sel.push(ing.id); this.render(); });
      this.chips.append(b);
    }
    const can = g.canCook(this.sel);
    this.cookBtn.disabled = !can.ok;
    this.cookBtn.textContent = can.ok ? `개발하기 · ${COOK_COST}G` : !g.cookingOpen ? `개발은 랭크 ${COOK_UNLOCK_RANK} 부터` : can.reason;
    this.codex.replaceChildren();
    for (const r of c.recipes.values()) {
      if (r.unlock === 'fail') continue;
      const known = c.known.has(r.id);
      const row = el('div', 'krow');
      row.dataset['codex'] = r.id;
      row.append(el('span', 'krow-k', known ? `${r.name} (${CAT_KO[r.cat]})` : '???'), el('span', 'krow-v', known ? `맛 ${r.taste} 외관 ${r.look} 인기 ${r.pop}` : ''));
      if (known) {
        // 원작 「레시피 → 설정」 — 재료 칩을 그 레시피로 채운다 (G41)
        const fill = c.fillFor(r.id);
        const b = el('button', 'kchip kset', '설정');
        b.type = 'button';
        b.dataset['setRecipe'] = r.id;
        b.disabled = !fill;
        b.addEventListener('click', () => { const f = c.fillFor(r.id); if (f) { this.sel = f; this.render(); } });
        row.append(b);
      }
      this.codex.append(row);
    }
    // 실패작 절 — 만들어 본 것만 (원작 「카이로봇 레시피」: 야채 찌꺼기·탄 빵)
    const fails = c.failDishes.filter((r) => c.known.has(r.id));
    if (fails.length) {
      this.codex.append(el('div', 'krow-name', '실패작'));
      for (const r of fails) {
        const row = el('div', 'krow kfail');
        row.dataset['codex'] = r.id;
        row.append(el('span', 'krow-k', `${r.name} (${CAT_KO[r.cat]})`), el('span', 'krow-v', `맛 ${r.taste} 외관 ${r.look} 인기 ${r.pop}`));
        this.codex.append(row);
      }
    }
    this.shopList.replaceChildren();
    for (const ing of c.ingredients.values()) {
      if (ing.unlock !== 'shop' || c.owned.has(ing.id)) continue;
      const b = el('button', 'krow kcard-row');
      b.type = 'button';
      b.dataset['buyIngredient'] = ing.id;
      b.disabled = (ing.price ?? 0) > g.money;
      b.append(el('span', 'krow-name', ing.name), el('span', 'krow-v', `${(ing.price ?? 0).toLocaleString('ko-KR')}G`));
      b.addEventListener('click', () => {
        const r = g.buyIngredient(ing.id);
        this.host.toast(r.ok ? `${ing.name} 구입` : r.reason, r.ok);
        if (r.ok) this.host.onChanged();
        this.render();
      });
      this.shopList.append(b);
    }
  }

  private cook(): void {
    const g = this.game();
    const r = g.cook(this.sel);
    this.result.classList.remove('khide');
    this.result.replaceChildren();
    this.result.dataset['outcome'] = r.ok ? (r.via === 'fail' ? 'fail' : r.first ? 'new' : 'known') : 'blocked';
    if (r.ok && r.via === 'fail') {
      const hint = g.cooking.hintFor(this.sel);
      this.result.append(el('span', 'krow-name', `${r.recipe.name}이 됐다…`), el('span', 'krow-v', hint ? `힌트: ${CAT_KO[hint]} 쪽` : ''));
      this.host.toast(`${r.recipe.name} — 실패작도 요리다`, false);
    } else if (r.ok) {
      const title = r.via === 'upgrade' ? `강화! ${r.from?.name ?? ''} → ${r.recipe.name}` : r.first ? `발견! ${r.recipe.name}` : `${r.recipe.name} — 이미 아는 요리`;
      this.result.append(el('span', 'krow-name', title), el('span', 'krow-v', `${CAT_KO[r.recipe.cat]} · 맛 ${r.recipe.taste} 외관 ${r.recipe.look} 인기 ${r.recipe.pop}`));
      this.host.toast(r.first ? `새 레시피 ${r.recipe.name}!` : `${r.recipe.name} 을 다시 만들었다`, true);
    } else {
      this.result.append(el('span', 'krow-name', r.reason));
      this.host.toast(r.reason, false);
    }
    this.host.onChanged();
    this.sel = [];
    this.render();
  }
}

/**
 * 식당 메뉴 창 — 위 5칸(카테고리·궁합 표시) · 아래 도감 레시피 목록(카테고리 필터). 행 탭 → 빈 칸에 · 칸 탭 → 뺀다.
 * 4카테고리를 다 채우면 칸 줄에 보너스 표시.
 */
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import type { FoodCategory } from '../../data/schema.js';
import { recipePrice } from '../../sim/restaurant.js';
import { pictureEl, pictureId } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';

const CAT_KO: Record<FoodCategory, string> = { drink: '음료', snack: '스낵', meal: '식사', dessert: '디저트' };
const COMPAT_KO = { good: '◎', neutral: '○', bad: '△' } as const;

export class MenuEditWindow {
  private readonly win: WindowPanel;
  private readonly slotsEl = el('div', 'kslots');
  private readonly filter = el('div', 'kchips');
  private readonly list = el('div', 'krows');
  /** P56-b3 — 레시피 그림 카드 격자 */
  private readonly grid = new PictureGrid({ name: 'menu-recipes', onTap: (c) => this.tapRecipe(c) });
  private uid: number | null = null;
  private cat: FoodCategory | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-menu', '메뉴', 'blue');
    this.win.body.append(this.slotsEl, this.filter, this.grid.root, this.list);
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
    // P56-b3 — 칸은 그림 슬롯(요리 창과 같은 `.kpslot`): 그림 + 이름 + 궁합. 빈 칸은 점선 「+ N」
    const row = el('div', 'kpslots kpicked');
    slots.forEach((id, k) => {
      const r = id ? g.menus.recipes.get(id) : undefined;
      const b = el('button', `kpslot kslot${r ? ' on' : ''}`, '');
      if (r) b.append(pictureEl(pictureId('recipe', r.id), 'cook'), el('span', undefined, `${r.name} ${COMPAT_KO[g.menus.compatOf(f.defId, r.id)]}`)); else b.textContent = `+ ${k + 1}`;
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
    // P56-b3 — 아는 레시피는 그림 카드 격자(요리 창 도감과 같은 문법): 그림 · 값 · 「걸림」 배지 · 아래 두 줄에 궁합·맛·외관·인기
    const known = [...g.cooking.known].map((id) => g.menus.recipes.get(id)).filter((r): r is NonNullable<typeof r> => !!r).filter((r) => this.cat === null || r.cat === this.cat);
    const mul = g.cooking.mult;
    const cards: PictureCard[] = known.map((r) => {
      const equipped = slots.includes(r.id);
      const compat = g.menus.compatOf(f.defId, r.id);
      // G53 (v3 잔여): 실패작도 걸 수 있다 — 원작처럼 값싼 「실패작」 으로 표시
      const stats = `${CAT_KO[r.cat]} · 맛 ${Math.round(r.taste * mul)} · 외관 ${r.look} · 인기 ${Math.round(r.pop * mul)}${mul > 1 ? ` (Lv${g.cooking.level} 배수 ×${mul.toFixed(2)})` : ''}`;
      const card: PictureCard = {
        id: r.id, name: `${COMPAT_KO[compat]} ${r.name}${r.unlock === 'fail' ? ' · 실패작' : ''}`, art: pictureEl(pictureId('recipe', r.id), 'cook'),
        price: `${Math.round(recipePrice(r) * mul)}G`, sub: stats, desc: equipped ? '이미 걸려 있다 — 위 칸을 탭하면 뺀다' : !slots.includes(null) ? '빈 칸이 없다 — 위 칸을 탭해 빼자' : `탭하면 빈 칸에 건다 · 궁합 ${COMPAT_KO[compat]}`,
        disabled: equipped || !slots.includes(null), data: { recipe: r.id, stats },
      };
      if (equipped) card.badge = { text: '걸림' };
      return card;
    });
    this.grid.render(cards);
    this.list.replaceChildren();
    if (known.length === 0) {
      const e = el('div', 'krow');
      e.append(el('span', 'krow-k', '아는 레시피가 없다 — 요리 개발에서 만들자'));
      this.list.append(e);
    }
  }

  private tapRecipe(card: PictureCard): void {
    const g = this.game();
    const uid = this.uid;
    if (uid === null) return;
    const r = g.menus.recipes.get(card.id);
    const slots = g.menus.slotsOf(uid);
    const empty = slots.indexOf(null);
    if (!r || empty < 0) return;
    const res = g.setMenu(uid, empty, r.id);
    this.host.toast(res.ok ? `${r.name} 을 ${empty + 1}번 칸에` : res.reason, res.ok);
    if (res.ok) this.host.onChanged();
    this.render();
  }
}

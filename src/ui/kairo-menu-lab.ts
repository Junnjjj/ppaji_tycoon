import { button, el } from './dom.js';
import { panelHost } from './panels.js';
import {
  INGREDIENTS,
  RECIPES,
  ingredientDef,
  recipeDef,
  type IngredientDef,
  type MenuDevelopmentResult,
  type MenuStore,
  type RecipeDef,
} from '../sim/kairo/menu.js';
import { facilityDef, type PlacementGrid } from '../sim/kairo/placement.js';

export interface MenuLabModel {
  handle: number;
  facilityId: string;
  facilityName: string;
  ingredients: IngredientDef[];
  discovered: RecipeDef[];
  slots: string[];
  slotCount: number;
  clues: { key: string; clue: string; progress: number }[];
}

/** DOM이 읽는 것은 이 sim 상태 파생 모델 하나뿐이다. */
export function menuLabModel(
  menus: MenuStore,
  placement: PlacementGrid,
  handle: number,
): MenuLabModel | null {
  const item = placement.all().find((x) => x.handle === handle);
  const def = item ? facilityDef(item.defId) : undefined;
  if (!item || !def || def.menuMode !== 'craft') return null;
  const ingredients = menus
    .ingredientIds()
    .map((id) => ingredientDef(id))
    .filter((x): x is IngredientDef => x !== undefined);
  const discovered = menus
    .discoveredIds()
    .map((id) => recipeDef(id))
    .filter((x): x is RecipeDef => x !== undefined && x.facilityId === item.defId);
  return {
    handle,
    facilityId: item.defId,
    facilityName: def.name,
    ingredients,
    discovered,
    slots: placement.menuIdsOf(handle),
    slotCount: placement.menuSlotCount(handle),
    clues: menus.failureEntries(item.defId),
  };
}

export interface MenuLabActions {
  spend: (cost: number) => boolean;
  cash: () => number;
  onChanged: (result: MenuDevelopmentResult | null) => void;
  onClose?: () => void;
}

/**
 * 매점·카페 시설 안에서 여는 메뉴 개발 시트. 선택·발견·장착 규칙은
 * `MenuStore`·`PlacementGrid`가 소유하고 이 클래스는 재렌더만 한다.
 */
export class KairoMenuLab {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private selected: string[] = [];
  private last: MenuDevelopmentResult | null = null;
  private closer: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ksheet kmenu-lab');
    this.root.id = 'kairo-menu-lab';
    this.root.hidden = true;
    const head = el('div', 'ksheet-head');
    this.title = el('div', 'ksheet-title', '메뉴 개발');
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-menu-lab-close';
    head.append(this.title, close);
    this.body = el('div', 'ksheet-body kstack');
    this.root.append(head, this.body);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(
    menus: MenuStore,
    placement: PlacementGrid,
    handle: number,
    actions: MenuLabActions,
  ): void {
    if (!menuLabModel(menus, placement, handle) || !panelHost.open(this)) return;
    this.selected = [];
    this.last = null;
    this.closer = actions.onClose ?? null;
    this.root.hidden = false;
    this.render(menus, placement, handle, actions);
  }

  hide(): void {
    this.root.hidden = true;
    const close = this.closer;
    this.closer = null;
    close?.();
    panelHost.closed(this);
  }

  private render(
    menus: MenuStore,
    placement: PlacementGrid,
    handle: number,
    actions: MenuLabActions,
  ): void {
    const model = menuLabModel(menus, placement, handle);
    if (!model) {
      this.hide();
      return;
    }
    this.title.textContent = `${model.facilityName} · 메뉴 개발`;
    this.root.dataset['handle'] = String(handle);
    this.body.replaceChildren();

    this.body.append(el('div', 'kcaption', '재료 두 개를 고르세요 — 순서는 상관없습니다'));
    const ingredients = el('div', 'kchips wrap');
    ingredients.id = 'kairo-menu-ingredients';
    for (const ing of model.ingredients) {
      const selected = this.selected.includes(ing.id);
      const pick = button(`kbtn${selected ? ' selected' : ''}`, ing.name, () => {
        if (selected) this.selected = this.selected.filter((id) => id !== ing.id);
        else if (this.selected.length < 2) this.selected.push(ing.id);
        else this.selected = [this.selected[1] as string, ing.id];
        this.render(menus, placement, handle, actions);
      });
      pick.dataset['kairoMenuIngredient'] = ing.id;
      pick.classList.add('kairo-menu-ingredient');
      ingredients.append(pick);
    }
    this.body.append(ingredients);

    const develop = button('kbtn primary', '메뉴 개발', () => {
      if (this.selected.length !== 2) return;
      this.last = menus.develop(
        model.facilityId,
        [this.selected[0] as string, this.selected[1] as string],
        actions.spend,
      );
      if (this.last.recipe && (this.last.kind === 'discovered' || this.last.kind === 'known')) {
        const ids = placement.menuIdsOf(handle);
        const slot = Math.min(ids.length, placement.menuSlotCount(handle) - 1);
        menus.equip(placement, handle, this.last.recipe.id, slot);
      }
      actions.onChanged(this.last);
      this.render(menus, placement, handle, actions);
    });
    develop.id = 'kairo-menu-develop';
    develop.disabled = this.selected.length !== 2 || actions.cash() <= 0;
    this.body.append(develop);

    if (this.last) {
      const result = el('div', 'kcallout', this.last.clue);
      result.dataset['result'] = this.last.kind;
      this.body.append(result);
    }

    const slotHead = el(
      'div',
      'kitem-name',
      `장착 메뉴 ${model.slots.filter((id) => id !== '').length}/${model.slotCount}`,
    );
    this.body.append(slotHead);
    const slots = el('div', 'kstack');
    slots.id = 'kairo-menu-slots';
    for (let slot = 0; slot < model.slotCount; slot++) {
      const id = model.slots[slot];
      const recipe = recipeDef(id);
      const row = el('div', 'krow');
      row.classList.add('kairo-menu-slot');
      row.dataset['slot'] = String(slot);
      const main = el('div', 'krow-main');
      main.append(
        el('div', 'kitem-name', recipe?.name ?? '빈 칸'),
        el('div', 'kcaption', recipe ? `₩${recipe.price.toLocaleString('ko-KR')} · ${recipe.tags.join(' · ')}` : '발견한 메뉴를 장착하세요'),
      );
      row.append(main);
      slots.append(row);
    }
    this.body.append(slots);

    const available = el('div', 'kchips wrap');
    for (const recipe of model.discovered) {
      const equip = button('kbtn', `${recipe.name} 바로 장착`, () => {
        const ids = placement.menuIdsOf(handle);
        const empty = Array.from({ length: model.slotCount }, (_, i) => i).find((i) => !ids[i]);
        const slot = empty ?? 0;
        if (!menus.equip(placement, handle, recipe.id, slot)) return;
        actions.onChanged(null);
        this.render(menus, placement, handle, actions);
      });
      equip.dataset['recipe'] = recipe.id;
      available.append(equip);
    }
    this.body.append(available);

    if (model.clues.length > 0) {
      this.body.append(el('div', 'kitem-name', '연구 힌트'));
      for (const clue of model.clues) {
        const line = el('div', 'kcaption', `${clue.clue} · ${Math.round(clue.progress * 100)}%`);
        line.dataset['progress'] = String(clue.progress);
        this.body.append(line);
      }
    }
  }
}

// 데이터가 빌드에서 트리 쉐이크되지 않게 계약을 드러낸다 (검증용).
export const MENU_LAB_COUNTS = { ingredients: INGREDIENTS.length, recipes: RECIPES.length } as const;

/**
 * **요리 화면** (P2) — 시설을 뒤지지 않고 **요리부터** 연다.
 *
 * ## 왜 시설 독립인가
 *
 * 예전에는 지도에서 매점을 찾아 탭해야 메뉴 개발이 열렸다. 시설이 2종일 때는 그게
 * "그 가게의 주방"으로 읽혔지만 craft 가 **5종**이 되자 "어느 가게였더라"를 지도에서
 * 헤매는 일이 됐다 (D8: 시설이 늘어도 화면은 하나).
 *
 * 그래서 화면의 주인은 **요리**이고 시설은 그 안의 **탭**이다. `handle` 은 이제 입구가
 * 아니라 결과의 목적지일 뿐이다 — 지도에서 열 때는 그 시설 탭이 미리 골라져 열린다.
 *
 * ## 두 동사
 *
 * | | 무엇 | 결정 |
 * |---|---|---|
 * | **조합** | 재료 둘 → 새 요리 | **넓힌다** |
 * | **강화** | 가진 요리 + 재료 하나 | **키운다** |
 *
 * 슬롯은 1~3칸뿐인데 요리가 60종이다. 키우는 축이 없으면 "뭘 넣지"가 스트레스가 되고,
 * 있으면 그게 **"넓힐까 키울까"** 라는 결정이 된다 (시설 개선의 특화 3갈래와 같은 문법).
 *
 * ## ⚠ 칸은 **말없이 안 바뀐다**
 *
 * 예전 코드는 두 자리에서 걸린 메뉴를 묻지도 않고 덮어썼다 (발견 직후 `slotCount-1` 번 칸 ·
 * 「바로 장착」 칩의 `empty ?? 0`). 플레이어가 올려 둔 메뉴가 조용히 사라졌고, 그것이
 * 「슬롯이 1칸이라 음식 축이 잠겼다」는 진단을 절반 틀리게 만들었다 — 팔 수는 있는데
 * **그 교환이 결정으로 안 보였을** 뿐이다. 이제 빈 칸이 없으면 §2.6 의 사건 상자가
 * **무엇과 바꿀지**를 묻는다.
 */
import { attachSheetHandle } from './kairo-sheet-handle.js';
import { button, el } from './dom.js';
import { panelHost } from './panels.js';
import {
  INGREDIENTS,
  RECIPES,
  enhancementsOf,
  ingredientsForFacility,
  recipeDef,
  type IngredientDef,
  type MenuDevelopmentResult,
  type MenuStore,
  type RecipeDef,
  ingredientTaste,
  pairAffinity,
} from '../sim/kairo/menu.js';
import { allFacilityDefs, facilityDef, type PlacementGrid } from '../sim/kairo/placement.js';
import type { CelebrationDelta } from './kairo-event-shell.js';

/** 지어진 craft 시설 한 채 — 요리가 실제로 걸릴 자리 */
export interface KitchenTarget {
  handle: number;
  defId: string;
  /** `매점 2` — 같은 종류가 여럿일 때 어느 채인지 */
  label: string;
  slotCount: number;
  slots: (RecipeDef | undefined)[];
  emptySlot: number | null;
}

export interface KitchenFacility {
  defId: string;
  name: string;
  /** 이 시설에서 쓸 수 있는 **해금한** 재료 — 데이터가 좁힌 후보 그대로다 */
  ingredients: IngredientDef[];
  /** 이 시설의 발견한 요리 (기본 + 강화) */
  discovered: RecipeDef[];
  /** 발견한 요리 중 **아직 더 키울 수 있는** 것 */
  growable: RecipeDef[];
  clues: { key: string; clue: string; progress: number }[];
  targets: KitchenTarget[];
}

export interface KitchenModel {
  facilities: KitchenFacility[];
  active: KitchenFacility;
}

const craftDefIds = (): string[] =>
  allFacilityDefs()
    .filter((d) => (d as { menuMode?: string }).menuMode === 'craft')
    .map((d) => d.id);

/**
 * DOM 이 읽는 것은 이 sim 상태 파생 모델 하나뿐이다.
 *
 * ⚠ **지어진 시설만** 담는다. 안 지은 시설의 요리를 개발하게 두면 걸 곳이 없는 요리가
 * 쌓이고, 그건 `menuFacilityOperability` 가 재는 「빈 그릇」의 반대쪽 짝이다.
 */
export function kitchenModel(
  menus: MenuStore,
  placement: PlacementGrid,
  activeDefId?: string,
): KitchenModel | null {
  const placed = placement.all();
  const facilities: KitchenFacility[] = [];
  for (const defId of craftDefIds()) {
    const items = placed.filter((x) => x.defId === defId);
    if (items.length === 0) continue;
    const def = facilityDef(defId);
    if (!def) continue;
    const discovered = menus
      .discoveredIds()
      .map((id) => recipeDef(id))
      .filter((x): x is RecipeDef => x !== undefined && x.facilityId === defId);
    facilities.push({
      defId,
      name: def.name,
      ingredients: ingredientsForFacility(defId).filter((x) => menus.hasIngredient(x.id)),
      discovered,
      growable: discovered.filter((r) =>
        enhancementsOf(r.id).some((next) => !menus.hasRecipe(next.id)),
      ),
      clues: menus.failureEntries(defId),
      targets: items.map((item, index) => {
        const slotCount = placement.menuSlotCount(item.handle);
        const ids = placement.menuIdsOf(item.handle);
        const slots = Array.from({ length: slotCount }, (_, i) => recipeDef(ids[i]));
        return {
          handle: item.handle,
          defId,
          label: items.length > 1 ? `${def.name} ${index + 1}` : def.name,
          slotCount,
          slots,
          emptySlot: slots.findIndex((x) => x === undefined) < 0
            ? null
            : slots.findIndex((x) => x === undefined),
        };
      }),
    });
  }
  if (facilities.length === 0) return null;
  const active = facilities.find((f) => f.defId === activeDefId) ?? facilities[0]!;
  return { facilities, active };
}

/** 이 요리를 걸 수 있는 시설들 — 종류가 맞는 인스턴스 전부 */
export function equipTargets(
  menus: MenuStore,
  placement: PlacementGrid,
  recipeId: string,
): KitchenTarget[] {
  const facilityId = recipeDef(recipeId)?.facilityId;
  if (facilityId === undefined) return [];
  const model = kitchenModel(menus, placement, facilityId);
  // ⚠ 그 종류가 **안 지어졌으면** 활성 탭이 다른 시설로 떨어진다 — 그때는 걸 자리가 없다
  if (!model || model.active.defId !== facilityId) return [];
  return model.active.targets;
}

/**
 * **묻지 않고 걸어도 되는 자리**. 없으면 `null` — 그때는 무엇과 바꿀지 물어야 한다.
 *
 * ⚠ 이미 걸려 있으면 그 자리를 돌려준다 (멱등). 안 그러면 "이미 파는 요리"를 또 발견했을 때
 * 멀쩡한 칸을 하나 더 먹는다.
 */
export function autoEquipTarget(
  menus: MenuStore,
  placement: PlacementGrid,
  recipeId: string,
): { handle: number; slot: number } | null {
  for (const target of equipTargets(menus, placement, recipeId)) {
    const already = target.slots.findIndex((x) => x?.id === recipeId);
    if (already >= 0) return { handle: target.handle, slot: already };
  }
  for (const target of equipTargets(menus, placement, recipeId)) {
    if (target.emptySlot !== null) return { handle: target.handle, slot: target.emptySlot };
  }
  return null;
}

/**
 * 사건 상자의 **회수 줄** (§2.6). 순수 함수라 단위 검사가 sim 실효값과 직접 대조한다.
 *
 * ⚠ 발견과 강화는 **다른 것을 잰다**. 발견은 새 물건의 성질이라 절대값(글자)이고,
 * 강화는 가진 것의 변화라 `900 → 1,150` 이다 — 강화만 카운트업이 도는 이유다.
 */
export function menuDeltas(recipe: RecipeDef, previous?: RecipeDef | null): CelebrationDelta[] {
  const tags = (r: RecipeDef): string => r.tags.join(' · ');
  if (!previous) {
    return [
      { label: '가격', to: `₩${recipe.price.toLocaleString('ko-KR')}` },
      { label: '만족', to: `+${recipe.satisfaction}` },
      { label: '손님층', to: tags(recipe) },
    ];
  }
  return [
    { label: '가격', from: previous.price, to: recipe.price },
    { label: '만족', from: previous.satisfaction, to: recipe.satisfaction },
    {
      label: '손님층',
      ...(tags(previous) === tags(recipe) ? {} : { from: tags(previous) }),
      to: tags(recipe),
    },
  ];
}

/** 발견·강화가 화면에 요구하는 것 — 모달을 여는 것은 부르는 쪽이다 */
export interface MenuDiscovery {
  recipe: RecipeDef;
  /** 강화면 키우기 전 요리 — 델타 줄이 `900 → 1,150` 이 된다 */
  previous: RecipeDef | null;
  deltas: CelebrationDelta[];
  /** 묻지 않고 걸린 자리. `null` 이면 **무엇과 바꿀지 물어야 한다** */
  equipped: { handle: number; slot: number } | null;
  /** 물어야 할 때의 선택지 — 지금 걸려 있는 것들 */
  occupied: { handle: number; slot: number; label: string; current: RecipeDef }[];
}

export interface MenuLabActions {
  spend: (cost: number) => boolean;
  cash: () => number;
  onChanged: (result: MenuDevelopmentResult | null) => void;
  /** 발견·강화의 **즉시 모달** (§2.6) — 내가 방금 누른 것이므로 상한이 없다 */
  onDiscovered?: (found: MenuDiscovery) => void;
  onClose?: () => void;
}

type Mode = 'combine' | 'enhance';

/**
 * 요리 시트. 선택·발견·장착 규칙은 `MenuStore`·`PlacementGrid` 가 소유하고
 * 이 클래스는 재렌더만 한다.
 */
/** 재료 성격의 낱말 — sim 은 `TasteTag` 만 알고 화면 어휘는 여기 산다 */
const TASTE_LABEL: Record<string, string> = {
  cool: '시원한 쪽',
  warm: '따뜻한 쪽',
  sweet: '달콤한 쪽',
  savory: '감칠맛 쪽',
  hearty: '든든한 쪽',
  light: '가벼운 쪽',
};

/**
 * 궁합 한 줄. ⚠ **결과를 약속하지 않는다** — `good` 이어도 재료 하나가 실제로 들어가는
 * 요리가 있어야 발견된다 (`menu.ts` 의 Q2 절). 「잘 어울린다」까지만 말한다.
 */
const AFFINITY_TEXT: Record<string, string> = {
  good: '잘 어울립니다 — 빗나가도 가까운 요리를 알게 될 수 있습니다',
  ok: '무난합니다 — 맞히면 그 요리를, 아니면 힌트를 얻습니다',
  bad: '서로 미는 맛입니다 — 맞히기 어렵습니다',
};

export class KairoMenuLab {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private selected: string[] = [];
  private mode: Mode = 'combine';
  private growTarget: string | null = null;
  private activeDefId: string | null = null;
  private last: MenuDevelopmentResult | null = null;
  private closer: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ksheet kmenu-lab');
    this.root.id = 'kairo-menu-lab';
    this.root.hidden = true;
    const head = el('div', 'ksheet-head');
    this.title = el('div', 'ksheet-title', '요리');
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-menu-lab-close';
    head.append(this.title, close);
    attachSheetHandle(this.root, head, () => this.hide());
    this.body = el('div', 'ksheet-body kstack');
    this.root.append(head, this.body);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /**
   * @param focus 지도에서 그 시설을 탭해 들어온 경우의 `handle`. 그 종류 탭이 골라져 열린다.
   *   없으면 첫 craft 시설이다 — **요리 화면은 시설 없이도 열린다**.
   */
  show(
    menus: MenuStore,
    placement: PlacementGrid,
    focus: number | null,
    actions: MenuLabActions,
  ): void {
    const focused = focus === null
      ? undefined
      : placement.all().find((x) => x.handle === focus)?.defId;
    this.activeDefId = focused ?? null;
    if (!kitchenModel(menus, placement, focused) || !panelHost.open(this)) return;
    this.selected = [];
    this.mode = 'combine';
    this.growTarget = null;
    this.last = null;
    this.closer = actions.onClose ?? null;
    this.root.hidden = false;
    this.render(menus, placement, actions);
  }

  hide(): void {
    this.root.hidden = true;
    const close = this.closer;
    this.closer = null;
    close?.();
    panelHost.closed(this);
  }

  /** 발견·강화 뒤 부르는 쪽이 슬롯을 바꿨을 때 — 열려 있으면 다시 그린다 */
  refresh(menus: MenuStore, placement: PlacementGrid, actions: MenuLabActions): void {
    if (this.visible) this.render(menus, placement, actions);
  }

  private discovery(
    menus: MenuStore,
    placement: PlacementGrid,
    recipe: RecipeDef,
    previous: RecipeDef | null,
  ): MenuDiscovery {
    const equipped = autoEquipTarget(menus, placement, recipe.id);
    if (equipped) menus.equip(placement, equipped.handle, recipe.id, equipped.slot);
    const occupied = equipped
      ? []
      : equipTargets(menus, placement, recipe.id).flatMap((target) =>
          target.slots.flatMap((current, slot) =>
            current === undefined
              ? []
              : [{ handle: target.handle, slot, label: target.label, current }],
          ),
        );
    return { recipe, previous, deltas: menuDeltas(recipe, previous), equipped, occupied };
  }

  private finish(
    menus: MenuStore,
    placement: PlacementGrid,
    actions: MenuLabActions,
    result: MenuDevelopmentResult,
    previous: RecipeDef | null,
  ): void {
    this.last = result;
    if (result.recipe && (result.kind === 'discovered' || result.kind === 'known')) {
      const found = this.discovery(menus, placement, result.recipe, previous);
      actions.onChanged(result);
      this.render(menus, placement, actions);
      // ⚠ 모달은 **마지막**이다 — 열리는 순간 이 시트가 배타 규칙에 밀려 닫힌다
      if (result.kind === 'discovered') actions.onDiscovered?.(found);
      return;
    }
    actions.onChanged(result);
    this.render(menus, placement, actions);
  }

  private render(menus: MenuStore, placement: PlacementGrid, actions: MenuLabActions): void {
    const model = kitchenModel(menus, placement, this.activeDefId ?? undefined);
    if (!model) {
      this.hide();
      return;
    }
    const facility = model.active;
    this.activeDefId = facility.defId;
    this.title.textContent = '요리';
    // 하네스가 이 값으로 "어느 시설을 보고 있나"를 읽는다 (K52 이후 손잡이)
    this.root.dataset['handle'] = String(facility.targets[0]?.handle ?? -1);
    this.root.dataset['facility'] = facility.defId;
    this.body.replaceChildren();

    if (model.facilities.length > 1) {
      const tabs = el('div', 'kchips wrap');
      tabs.id = 'kairo-kitchen-facilities';
      for (const f of model.facilities) {
        const on = f.defId === facility.defId;
        const pick = button(`kbtn${on ? ' on' : ''}`, f.name, () => {
          this.activeDefId = f.defId;
          this.selected = [];
          this.growTarget = null;
          this.last = null;
          this.render(menus, placement, actions);
        });
        pick.dataset['kitchenFacility'] = f.defId;
        tabs.append(pick);
      }
      this.body.append(tabs);
    }

    const modes = el('div', 'kchips');
    for (const [id, label] of [['combine', '조합'], ['enhance', '강화']] as const) {
      const on = this.mode === id;
      const pick = button(`kbtn${on ? ' on' : ''}`, label, () => {
        this.mode = id;
        this.selected = [];
        this.last = null;
        this.render(menus, placement, actions);
      });
      pick.dataset['menuMode'] = id;
      modes.append(pick);
    }
    this.body.append(modes);

    const want = this.mode === 'combine' ? 2 : 1;
    if (this.mode === 'enhance') {
      this.body.append(el('div', 'kcaption', '키울 요리를 고르세요'));
      const bases = el('div', 'kchips wrap');
      bases.id = 'kairo-menu-bases';
      if (facility.growable.length === 0) {
        bases.append(el('div', 'kcaption', '더 키울 수 있는 요리가 아직 없습니다'));
      }
      for (const recipe of facility.growable) {
        const on = this.growTarget === recipe.id;
        const pick = button(`kbtn${on ? ' on' : ''}`, recipe.name, () => {
          this.growTarget = on ? null : recipe.id;
          this.render(menus, placement, actions);
        });
        pick.dataset['menuBase'] = recipe.id;
        bases.append(pick);
      }
      this.body.append(bases);
    }

    this.body.append(
      el(
        'div',
        'kcaption',
        this.mode === 'combine'
          ? '재료 두 개를 고르세요 — 순서는 상관없습니다'
          : '더 넣을 재료 하나를 고르세요',
      ),
    );
    const ingredients = el('div', 'kchips wrap');
    ingredients.id = 'kairo-menu-ingredients';
    const grow = recipeDef(this.growTarget);
    for (const ing of facility.ingredients) {
      // 강화는 **이미 든 재료**를 또 넣을 수 없다 — sim 이 거절하므로 화면에서 미리 죽인다
      if (this.mode === 'enhance' && grow?.ingredients.includes(ing.id)) continue;
      const selected = this.selected.includes(ing.id);
      const pick = button(`kbtn${selected ? ' selected' : ''}`, ing.name, () => {
        if (selected) this.selected = this.selected.filter((id) => id !== ing.id);
        else if (this.selected.length < want) this.selected.push(ing.id);
        else this.selected = [...this.selected.slice(1 - want), ing.id];
        this.render(menus, placement, actions);
      });
      pick.dataset['kairoMenuIngredient'] = ing.id;
      pick.classList.add('kairo-menu-ingredient');
      /*
       * ⚠ **재료의 성격을 칩에 적는다** (Q2). 이게 없으면 조합은 여전히 **찍기**다 —
       * 궁합 규칙을 sim 에 넣어도 플레이어가 못 읽으면 규칙이 아니라 숨은 주사위가 된다.
       * 「이 재료는 시원한 쪽」을 알면 두 번째 재료 고르기가 **읽는 일**이 된다.
       */
      const taste = ingredientTaste(ing.id);
      if (taste) {
        pick.dataset['taste'] = taste;
        pick.title = `${ing.name} — ${TASTE_LABEL[taste]}`;
      }
      ingredients.append(pick);
    }
    this.body.append(ingredients);
    /*
     * 지금 고른 둘의 궁합을 **누르기 전에** 말한다 (BBS 의 compatibility 를 화면으로).
     * 값은 sim 이 정하고(`pairAffinity`) 여기는 낱말만 붙인다.
     */
    if (this.mode === 'combine' && this.selected.length === 2) {
      const [x, y] = this.selected as [string, string];
      const aff = pairAffinity(x, y);
      const line = el('div', `kcaption kmenu-affinity ${aff}`, AFFINITY_TEXT[aff]);
      line.dataset['affinity'] = aff;
      line.id = 'kairo-menu-affinity';
      this.body.append(line);
    }

    const develop = button(
      'kbtn primary',
      this.mode === 'combine' ? '메뉴 개발' : '요리 강화',
      () => {
        if (this.selected.length !== want) return;
        if (this.mode === 'combine') {
          this.finish(
            menus,
            placement,
            actions,
            menus.develop(
              facility.defId,
              [this.selected[0] as string, this.selected[1] as string],
              actions.spend,
            ),
            null,
          );
          return;
        }
        const base = recipeDef(this.growTarget);
        if (!base) return;
        this.finish(
          menus,
          placement,
          actions,
          menus.enhance(base.id, this.selected[0] as string, actions.spend),
          base,
        );
      },
    );
    develop.id = 'kairo-menu-develop';
    develop.disabled =
      this.selected.length !== want ||
      actions.cash() <= 0 ||
      (this.mode === 'enhance' && this.growTarget === null);
    this.body.append(develop);

    if (this.last) {
      const result = el('div', 'kcallout', this.last.clue);
      result.dataset['result'] = this.last.kind;
      this.body.append(result);
    }

    const slots = el('div', 'kstack');
    slots.id = 'kairo-menu-slots';
    for (const target of facility.targets) {
      const filled = target.slots.filter((x) => x !== undefined).length;
      slots.append(el('div', 'kitem-name', `${target.label} · 장착 ${filled}/${target.slotCount}`));
      for (let slot = 0; slot < target.slotCount; slot++) {
        const recipe = target.slots[slot];
        const row = el('div', 'krow');
        row.classList.add('kairo-menu-slot');
        row.dataset['slot'] = String(slot);
        row.dataset['handle'] = String(target.handle);
        const main = el('div', 'krow-main');
        main.append(
          el('div', 'kitem-name', recipe?.name ?? '빈 칸'),
          el(
            'div',
            'kcaption',
            recipe
              ? `₩${recipe.price.toLocaleString('ko-KR')} · ${recipe.tags.join(' · ')}`
              : '발견한 메뉴를 걸어 보세요',
          ),
        );
        row.append(main);
        slots.append(row);
      }
    }
    this.body.append(slots);

    const available = el('div', 'kchips wrap');
    for (const recipe of facility.discovered) {
      const equip = button('kbtn', `${recipe.name} 걸기`, () => {
        const found = this.discovery(menus, placement, recipe, null);
        actions.onChanged(null);
        this.render(menus, placement, actions);
        // 걸 자리가 없으면 **무엇과 바꿀지 묻는다** — 말없이 덮어쓰지 않는다
        if (!found.equipped) actions.onDiscovered?.(found);
      });
      equip.dataset['recipe'] = recipe.id;
      available.append(equip);
    }
    this.body.append(available);

    if (facility.clues.length > 0) {
      this.body.append(el('div', 'kitem-name', '연구 힌트'));
      for (const clue of facility.clues) {
        const line = el('div', 'kcaption', `${clue.clue} · ${Math.round(clue.progress * 100)}%`);
        line.dataset['progress'] = String(clue.progress);
        this.body.append(line);
      }
    }
  }
}

// 데이터가 빌드에서 트리 쉐이크되지 않게 계약을 드러낸다 (검증용).
export const MENU_LAB_COUNTS = { ingredients: INGREDIENTS.length, recipes: RECIPES.length } as const;

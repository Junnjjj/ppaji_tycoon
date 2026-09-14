/**
 * Phase 3 메뉴 개발 규칙. UI는 이 상태를 그리기만 한다.
 *
 * 재료는 수량 없는 영구 해금 키이고, 발견한 레시피도 영구다. 소모·발주·
 * 유통기한·새 화폐를 만들지 않는다. 실패는 돈만 없애지 않고 다음 조합을
 * 좁히는 힌트와 진행률을 남긴다.
 */
import rawIngredients from '../../data/kairo-ingredients.json' with { type: 'json' };
import rawRecipes from '../../data/kairo-recipes.json' with { type: 'json' };
import type { GroupId } from './groups.js';
import type { PlacementGrid } from './placement.js';

export type TasteTag = 'cool' | 'warm' | 'sweet' | 'savory' | 'hearty' | 'light';

export interface IngredientDef {
  id: string;
  name: string;
  start?: boolean;
}

export interface RecipeDef {
  id: string;
  name: string;
  facilityId: 'shop' | 'cafe';
  ingredients: readonly [string, string];
  tags: readonly TasteTag[];
  price: number;
  satisfaction: number;
  developmentCost: number;
  start?: boolean;
}

export const INGREDIENTS: readonly IngredientDef[] = (
  rawIngredients as unknown as { ingredients: IngredientDef[] }
).ingredients;
export const RECIPES: readonly RecipeDef[] = (
  rawRecipes as unknown as { recipes: RecipeDef[] }
).recipes;

const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((x) => [x.id, x]));
const RECIPE_BY_ID = new Map(RECIPES.map((x) => [x.id, x]));

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

export function recipeDef(id: string | null | undefined): RecipeDef | undefined {
  return id ? RECIPE_BY_ID.get(id) : undefined;
}

export function ingredientDef(id: string | null | undefined): IngredientDef | undefined {
  return id ? INGREDIENT_BY_ID.get(id) : undefined;
}

export function recipesForFacility(facilityId: string): readonly RecipeDef[] {
  return RECIPES.filter((x) => x.facilityId === facilityId);
}

export function isRecipeForFacility(recipeId: string, facilityId: string): boolean {
  return RECIPE_BY_ID.get(recipeId)?.facilityId === facilityId;
}

export interface MenuFacilityOperability {
  /** 손님 목적지·주간 공급·입장 정원에 포함해도 되는가. */
  operable: boolean;
  /** 시설에 맞고 현재 발견 저장소에도 존재하는 장착 메뉴만 남긴 정본 목록. */
  menuIds: string[];
}

/**
 * 메뉴형 시설의 운영 가능 여부 정본.
 *
 * craft 시설은 "메뉴 슬롯이 있다"가 아니라 **시설에 맞는 발견 메뉴가 실제로 장착돼
 * 있다**가 운영 조건이다. 세이브에서 레시피가 사라졌거나, 발견 전 메뉴 ID가 남았거나,
 * 장착을 전부 해제한 경우를 손님·공급·입장 정원이 서로 다르게 해석하지 않도록 한 곳에서
 * 걸러 낸다. 메뉴형이 아닌 정상 시설은 메뉴와 무관하게 운영 가능하다.
 */
export function menuFacilityOperability(
  facilityId: string | undefined,
  menuMode: 'craft' | 'fixed' | undefined,
  mountedMenuIds: readonly string[],
  recipeAvailable: (recipeId: string) => boolean = () => true,
): MenuFacilityOperability {
  if (facilityId === undefined) return { operable: false, menuIds: [] };
  if (menuMode !== 'craft') return { operable: true, menuIds: [] };
  const menuIds = mountedMenuIds.filter(
    (id, index) =>
      mountedMenuIds.indexOf(id) === index &&
      isRecipeForFacility(id, facilityId) &&
      recipeAvailable(id),
  );
  return { operable: menuIds.length > 0, menuIds };
}

/** 시설 개선 단계가 열어 주는 메뉴 칸 수의 유일한 규칙. */
export function menuSlotsForLevel(level: number): 1 | 2 | 3 {
  return level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

export interface MenuFailure {
  clue: string;
  progress: number;
}

export interface MenuSnapshot {
  ingredients: string[];
  discovered: string[];
  failures: Record<string, MenuFailure>;
}

export type MenuDevelopmentResult = {
  kind: 'discovered' | 'known' | 'failed' | 'unavailable';
  cost: number;
  clue: string;
  progress: number;
  recipe?: RecipeDef;
};

export interface MenuPurchase {
  purchaseId: string;
  week: number;
  guestId: number;
  characterId?: string;
  menuId: string;
  facilityHandle: number;
  amount: number;
}

/** 주간 루프에 넘기는 이름 있는 실제 방문 계획. 저장 상태가 아니다. */
export interface RegularVisit {
  characterId: string;
  group: GroupId;
  requestedRecipeId: string;
  prefer: readonly TasteTag[];
  avoid: readonly TasteTag[];
}

const GROUP_TAGS: Readonly<Record<GroupId, readonly TasteTag[]>> = {
  family: ['sweet', 'hearty'],
  couple: ['sweet', 'light'],
  friends: ['cool', 'savory'],
  company: ['warm', 'hearty'],
};

/** 같은 입력은 언제나 같은 메뉴를 고른다. RNG를 소비하지 않는다. */
export function chooseMenu(
  menuIds: readonly string[],
  group: GroupId,
  requestedRecipeId?: string,
  prefer: readonly TasteTag[] = [],
  avoid: readonly TasteTag[] = [],
): RecipeDef | null {
  if (requestedRecipeId && menuIds.includes(requestedRecipeId)) {
    return recipeDef(requestedRecipeId) ?? null;
  }
  const wanted = new Set<TasteTag>([...GROUP_TAGS[group], ...prefer]);
  const denied = new Set<TasteTag>(avoid);
  const scored = menuIds
    .map((id) => recipeDef(id))
    .filter((x): x is RecipeDef => x !== undefined)
    .map((recipe) => ({
      recipe,
      score:
        recipe.tags.reduce((n, tag) => n + (wanted.has(tag) ? 2 : 0), 0) -
        recipe.tags.reduce((n, tag) => n + (denied.has(tag) ? 3 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
  return scored[0]?.recipe ?? null;
}

export class MenuStore {
  private readonly ingredients = new Set<string>(
    INGREDIENTS.filter((x) => x.start).map((x) => x.id),
  );
  private readonly discovered = new Set<string>(RECIPES.filter((x) => x.start).map((x) => x.id));
  private readonly failures = new Map<string, MenuFailure>();

  ingredientIds(): string[] {
    return INGREDIENTS.filter((x) => this.ingredients.has(x.id)).map((x) => x.id);
  }

  discoveredIds(): string[] {
    return RECIPES.filter((x) => this.discovered.has(x.id)).map((x) => x.id);
  }

  failureEntries(facilityId?: string): { key: string; clue: string; progress: number }[] {
    return [...this.failures]
      .filter(([key]) => facilityId === undefined || key.startsWith(`${facilityId}|`))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ key, clue: v.clue, progress: v.progress }));
  }

  hasIngredient(id: string): boolean {
    return this.ingredients.has(id);
  }

  hasRecipe(id: string): boolean {
    return this.discovered.has(id);
  }

  unlockIngredient(id: string): boolean {
    if (!INGREDIENT_BY_ID.has(id) || this.ingredients.has(id)) return false;
    this.ingredients.add(id);
    return true;
  }

  unlockRecipe(id: string): boolean {
    if (!RECIPE_BY_ID.has(id) || this.discovered.has(id)) return false;
    this.discovered.add(id);
    return true;
  }

  develop(
    facilityId: string,
    ingredients: readonly [string, string],
    spend: (cost: number) => boolean,
  ): MenuDevelopmentResult {
    const [a, b] = ingredients;
    if (a === b || !this.ingredients.has(a) || !this.ingredients.has(b)) {
      return {
        kind: 'unavailable',
        cost: 0,
        clue: '해금한 서로 다른 재료 두 개를 고르세요',
        progress: 0,
      };
    }
    const key = `${facilityId}|${pairKey(a, b)}`;
    const exact = RECIPES.find(
      (x) => x.facilityId === facilityId && pairKey(...x.ingredients) === pairKey(a, b),
    );
    if (exact) {
      if (this.discovered.has(exact.id)) {
        return { kind: 'known', cost: 0, clue: '이미 알고 있는 메뉴입니다', progress: 1, recipe: exact };
      }
      if (!spend(exact.developmentCost)) {
        return { kind: 'unavailable', cost: 0, clue: '개발비가 부족합니다', progress: 0 };
      }
      this.discovered.add(exact.id);
      return {
        kind: 'discovered',
        cost: exact.developmentCost,
        clue: `${exact.name} 발견!`,
        progress: 1,
        recipe: exact,
      };
    }

    const old = this.failures.get(key);
    if (old) return { kind: 'failed', cost: 0, ...old };
    const pool = recipesForFacility(facilityId);
    if (pool.length === 0) {
      return { kind: 'unavailable', cost: 0, clue: '메뉴를 개발할 수 없는 시설입니다', progress: 0 };
    }
    const cost = Math.round(Math.min(...pool.map((x) => x.developmentCost)) * 0.2);
    if (!spend(cost)) {
      return { kind: 'unavailable', cost: 0, clue: '연구비가 부족합니다', progress: 0 };
    }
    const previous = this.failureEntries(facilityId).length;
    const target = pool
      .filter((x) => !this.discovered.has(x.id))
      .sort((x, y) => x.id.localeCompare(y.id))[previous % Math.max(1, pool.length)];
    const missing = target?.ingredients.find((id) => id !== a && id !== b);
    const clue = target
      ? missing
        ? `${target.name} 힌트: ${ingredientDef(missing)?.name ?? missing}가 필요합니다`
        : `${target.name}의 조합은 아닙니다 — 후보에서 제외했습니다`
      : '이 조합은 아닙니다 — 후보 하나를 제외했습니다';
    const failure = { clue, progress: Math.min(0.95, (previous + 1) / pool.length) };
    this.failures.set(key, failure);
    return { kind: 'failed', cost, ...failure };
  }

  /** 발견·시설 호환·슬롯을 모두 sim에서 검증한다. */
  equip(placement: PlacementGrid, handle: number, recipeId: string, slot: number): boolean {
    if (!this.discovered.has(recipeId)) return false;
    const item = placement.all().find((x) => x.handle === handle);
    if (!item || !isRecipeForFacility(recipeId, item.defId)) return false;
    if (slot < 0 || slot >= placement.menuSlotCount(handle)) return false;
    const next = [...placement.menuIdsOf(handle)];
    const duplicate = next.indexOf(recipeId);
    if (duplicate >= 0 && duplicate !== slot) next[duplicate] = '';
    while (next.length <= slot) next.push('');
    next[slot] = recipeId;
    return placement.setMenuIds(handle, next);
  }

  toSnapshot(): MenuSnapshot {
    return {
      ingredients: this.ingredientIds(),
      discovered: this.discoveredIds(),
      failures: Object.fromEntries(
        [...this.failures]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, { ...value }]),
      ),
    };
  }

  static fromSnapshot(snapshot: MenuSnapshot | undefined): MenuStore {
    const store = new MenuStore();
    if (!snapshot) return store;
    store.ingredients.clear();
    for (const id of snapshot.ingredients ?? []) if (INGREDIENT_BY_ID.has(id)) store.ingredients.add(id);
    // 시작 재료는 데이터의 현재 기본값이다. 구 스냅샷에서 누락돼도 판을 잠그지 않는다.
    for (const x of INGREDIENTS) if (x.start) store.ingredients.add(x.id);
    store.discovered.clear();
    for (const id of snapshot.discovered ?? []) if (RECIPE_BY_ID.has(id)) store.discovered.add(id);
    for (const x of RECIPES) if (x.start) store.discovered.add(x.id);
    store.failures.clear();
    for (const [key, value] of Object.entries(snapshot.failures ?? {})) {
      if (!key.includes('|') || typeof value?.clue !== 'string') continue;
      store.failures.set(key, {
        clue: value.clue,
        progress: Math.max(0, Math.min(1, Number(value.progress) || 0)),
      });
    }
    return store;
  }
}

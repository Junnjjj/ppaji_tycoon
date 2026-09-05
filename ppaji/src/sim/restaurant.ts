/**
 * 식당 메뉴 — 시설당 5칸. 식당 인기 = 시설 인기 + Σ 슬롯 레시피 인기 × 궁합(⊚1.5 · ◯1 · △0.5) × 다양성(카테고리 1:1.0 · 2:1.1 · 3:1.2 · 4:1.4).
 * 손님은 `look` 가중으로 슬롯 하나를 골라 산다 — 지불 = 가격, HP += taste, 만족 += pop×0.3.
 * 무엇이 도감에 있나는 `CookingStore` 가 안다. 여기는 「무엇이 걸려 있나」만.
 */
import type { RecipeDef, CompatDef, FoodCategory } from '../data/schema.js';

export const MENU_SLOTS = 5;
export const COMPAT_GOOD = 1.5;
export const COMPAT_BAD = 0.5;
export const DIVERSITY: readonly number[] = [1, 1, 1.1, 1.2, 1.4];
/** 스탯합 × 8 — 20 이면 식당 매출이 입장료의 1.5배(61%)로 물놀이를 덮는다 (봇 실측) */
export const PRICE_PER_STAT = 8;

export type Compat = 'good' | 'neutral' | 'bad';

export interface MenuSnapshot {
  slots: Record<string, (string | null)[]>;
}

export function recipePrice(r: RecipeDef): number {
  return (r.taste + r.look + r.pop) * PRICE_PER_STAT;
}

export class MenuStore {
  private readonly slots = new Map<number, (string | null)[]>();
  readonly recipes: ReadonlyMap<string, RecipeDef>;
  private readonly compat: ReadonlyMap<string, CompatDef>;

  constructor(recipes: readonly RecipeDef[], compat: readonly CompatDef[]) {
    this.recipes = new Map(recipes.map((r) => [r.id, r]));
    this.compat = new Map(compat.map((c) => [c.restaurant, c]));
  }

  compatOf(restaurantId: string, recipeId: string): Compat {
    const c = this.compat.get(restaurantId);
    if (!c) return 'neutral';
    if (c.good.includes(recipeId)) return 'good';
    if (c.bad.includes(recipeId)) return 'bad';
    return 'neutral';
  }

  slotsOf(uid: number): (string | null)[] {
    let s = this.slots.get(uid);
    if (!s) {
      s = Array.from({ length: MENU_SLOTS }, () => null);
      this.slots.set(uid, s);
    }
    return s;
  }

  setSlot(uid: number, slot: number, recipeId: string | null): boolean {
    if (slot < 0 || slot >= MENU_SLOTS) return false;
    if (recipeId !== null && !this.recipes.has(recipeId)) return false;
    this.slotsOf(uid)[slot] = recipeId;
    return true;
  }

  /** 시설이 철거되면 메뉴도 버린다 */
  drop(uid: number): void {
    this.slots.delete(uid);
  }

  /** 걸린 레시피들 (빈 칸 제외) */
  equipped(uid: number): RecipeDef[] {
    return this.slotsOf(uid).map((id) => (id ? this.recipes.get(id) : undefined)).filter((r): r is RecipeDef => r !== undefined);
  }

  categories(uid: number): number {
    return new Set(this.equipped(uid).map((r) => r.cat)).size;
  }

  /** 메뉴가 더하는 인기 (시설 자체 인기는 제외) */
  menuPopularity(uid: number, restaurantId: string): number {
    const eq = this.equipped(uid);
    if (eq.length === 0) return 0;
    const div = DIVERSITY[this.categories(uid)] ?? 1;
    const sum = eq.reduce((s, r) => {
      const c = this.compatOf(restaurantId, r.id);
      return s + r.pop * (c === 'good' ? COMPAT_GOOD : c === 'bad' ? COMPAT_BAD : 1);
    }, 0);
    return Math.round(sum * div);
  }

  /** 손님이 고르는 슬롯 — look 가중 추첨 (rng 0..1 을 받는다: 스트림은 부르는 쪽 소유) */
  pick(uid: number, roll: number): RecipeDef | null {
    const eq = this.equipped(uid);
    if (eq.length === 0) return null;
    const total = eq.reduce((s, r) => s + r.look, 0);
    let r = roll * total;
    for (const rec of eq) {
      r -= rec.look;
      if (r <= 0) return rec;
    }
    return eq[eq.length - 1] ?? null;
  }

  catOf(id: string): FoodCategory | null {
    return this.recipes.get(id)?.cat ?? null;
  }

  toSnapshot(): MenuSnapshot {
    return { slots: Object.fromEntries([...this.slots].map(([uid, s]) => [String(uid), [...s]])) };
  }

  fromSnapshot(s: MenuSnapshot): void {
    this.slots.clear();
    for (const [k, v] of Object.entries(s.slots)) this.slots.set(Number(k), Array.from({ length: MENU_SLOTS }, (_, i) => v[i] ?? null));
  }
}

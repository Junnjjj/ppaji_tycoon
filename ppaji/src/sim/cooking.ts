/**
 * 요리 개발 — 재료 ≤5(중복 허용) → 정렬 키 → 레시피 조회. **정답표는 없다**: 실패하면 EXP 조금과 힌트(겹침 ≥60% 인
 * 미발견 레시피의 카테고리). 레벨업은 **기존 레시피 전부 스탯 상승**(소급 배수). 재료는 영구 열쇠다.
 * **★2 랭크업**으로 열린다(G41, 원작). 결정은 `cook` 스트림(힌트 선택)만 쓴다.
 *
 * G41 매칭 순서(원작 「과일」 슬롯·「재료를 더 넣으면 상위 요리」·「실패해도 요리가 나온다」):
 *   ① 정확 키 → ② 와일드카드 키(`@fruit` = 그 등급 아무거나, 여러 개 맞으면 재료가 많은 쪽) →
 *   ③ 강화 사슬(아는 기본 레시피 재료 ⊂ 넣은 것, 남는 재료가 `add` 와 맞으면 상위) → ④ 실패작(재료 등급으로 분류).
 *   `cook()` 은 언제나 요리를 돌려준다 — 실패는 재료·돈 부족뿐.
 */
import type { IngredientDef, RecipeDef, FoodCategory } from '../data/schema.js';

/** 발견 문법이 요구하는 최소 모양 (P7) — 요리(RecipeDef/IngredientDef)와 공방(GearDef/PartDef)이 같이 쓴다 */
export interface RecipeLike { id: string; name: string; cat: string; key: string; unlock: string; upgradeOf?: { base: string; add: string[] }[] }
export interface IngredientLike { id: string; name: string; unlock: string; class?: string }
/** 실패작 고르기 — 넣은 재료의 계열 목록에서 실패작 id 를 정한다 */
export type FailPicker = (classes: readonly string[]) => string;
/** 요리의 실패작 규칙 — 채소만 = 야채 찌꺼기 · 곡물만 = 탄 빵 · 고기가 있으면 쓰쿠네 · 그 외 수상한 주스 */
export const COOK_FAIL_PICK: FailPicker = (classes) => {
  const all = (c: string): boolean => classes.every((x) => x === c);
  return all('veg') ? 'veg_scraps' : all('grain') ? 'burnt_bread' : classes.includes('meat') ? 'tsukune' : 'mystery_juice';
};
import type { Rng } from './rng.js';

export const COOK_MAX_INGREDIENTS = 5;
export const COOK_MIN_INGREDIENTS = 2;
export const COOK_COST = 300;
/** 요리 개발이 열리는 랭크 (원작: ★2 랭크업 보상) */
export const COOK_UNLOCK_RANK = 2;
export const EXP_FAIL_DISH = 8;
export const EXP_UPGRADE = 20;
export const LEVEL_EXP: readonly number[] = [0, 40, 100, 200, 340, 520, 760, 1060, 1420, 1840, 2320];
export const LEVEL_MULT = 0.05;
export const EXP_DISCOVER = 30;
export const EXP_FAIL = 4;

export interface CookingSnapshot {
  exp: number;
  known: string[];
  owned: string[];
  attempts: number;
}

export type CookResultOf<R extends RecipeLike> =
  | { ok: true; recipe: R; first: boolean; via: 'exact' | 'wildcard' | 'upgrade' | 'fail'; from?: R }
  | { ok: false; reason: string; hint?: FoodCategory };
export type CookResult = CookResultOf<RecipeDef>;

/** 문구·비용을 갈아 끼우는 자리 (P7) — 요리 창과 공방 창이 같은 저장소를 다른 낱말로 부른다 */
export interface DiscoveryWords { item: string; cost: number; minCount: number; maxCount: number; unlockRank: number; unlockLabel: string }
export const COOK_WORDS: DiscoveryWords = { item: '재료', cost: 300, minCount: 2, maxCount: 5, unlockRank: 2, unlockLabel: '요리 개발' };

/** `@fruit` 같은 와일드카드 파트인가 */
export function isWildcard(part: string): boolean {
  return part.startsWith('@');
}

export function recipeKey(ids: readonly string[]): string {
  return [...ids].sort().join('+');
}

export class CookingStore<R extends RecipeLike = RecipeDef, I extends IngredientLike = IngredientDef> {
  readonly recipes: ReadonlyMap<string, R>;
  readonly byKey: ReadonlyMap<string, R>;
  readonly ingredients: ReadonlyMap<string, I>;
  exp = 0;
  readonly known = new Set<string>();
  readonly owned = new Set<string>();
  attempts = 0;

  constructor(recipes: readonly R[], ingredients: readonly I[], private readonly rng: Rng, readonly words: DiscoveryWords = COOK_WORDS, private readonly failPick: FailPicker = COOK_FAIL_PICK) {
    this.recipes = new Map(recipes.map((r) => [r.id, r]));
    this.byKey = new Map(recipes.filter((r) => r.unlock !== 'fail').map((r) => [r.key, r]));
    this.ingredients = new Map(ingredients.map((i) => [i.id, i]));
    for (const r of recipes) if (r.unlock === 'start') this.known.add(r.id);
    for (const i of ingredients) if (i.unlock === 'start') this.owned.add(i.id);
  }

  get level(): number {
    let lv = 1;
    for (let k = 1; k < LEVEL_EXP.length; k++) if (this.exp >= (LEVEL_EXP[k] as number)) lv = k + 1;
    return Math.min(10, lv);
  }

  /** 레벨 배수 — 기존 레시피 전부에 소급 */
  get mult(): number {
    return 1 + LEVEL_MULT * (this.level - 1);
  }

  expToNext(): { cur: number; need: number } | null {
    const lv = this.level;
    if (lv >= 10) return null;
    return { cur: this.exp - (LEVEL_EXP[lv - 1] as number), need: (LEVEL_EXP[lv] as number) - (LEVEL_EXP[lv - 1] as number) };
  }

  grantIngredient(id: string): boolean {
    if (!this.ingredients.has(id) || this.owned.has(id)) return false;
    this.owned.add(id);
    return true;
  }

  /** 레벨 게이트 — `level:N` 레시피는 N 이상에서만 발견된다 */
  private levelOk(r: R): boolean {
    if (!r.unlock.startsWith('level:')) return true;
    return this.level >= Number(r.unlock.slice('level:'.length));
  }

  classOf(id: string): string {
    return this.ingredients.get(id)?.class ?? 'base';
  }

  /** 레시피 키가 넣은 재료와 맞나 (와일드카드 허용). 정확 키는 문자열 비교로 이미 걸렀으므로 여기는 등급 매칭 */
  private matchesKey(key: string, ids: readonly string[]): boolean {
    const parts = key.split('+');
    if (parts.length !== ids.length) return false;
    const pool = [...ids];
    // 구체 재료부터 소비하고 와일드카드는 남은 것에서 등급으로
    for (const p of parts.filter((x) => !isWildcard(x))) { const at = pool.indexOf(p); if (at < 0) return false; pool.splice(at, 1); }
    for (const p of parts.filter(isWildcard)) { const cls = p.slice(1); const at = pool.findIndex((id) => this.classOf(id) === cls); if (at < 0) return false; pool.splice(at, 1); }
    return pool.length === 0;
  }

  /** 강화 사슬 — 아는 기본 레시피의 재료가 전부 들어 있고, 남는 재료가 add 와 맞는 상위 요리 */
  private matchUpgrade(ids: readonly string[]): { recipe: R; from: R } | null {
    for (const r of [...this.recipes.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!r.upgradeOf || !this.levelOk(r)) continue;
      for (const u of r.upgradeOf) {
        const base = this.recipes.get(u.base);
        if (!base || !this.known.has(base.id)) continue;
        const pool = [...ids];
        let ok = true;
        for (const p of base.key.split('+')) { const at = isWildcard(p) ? pool.findIndex((id) => this.classOf(id) === p.slice(1)) : pool.indexOf(p); if (at < 0) { ok = false; break; } pool.splice(at, 1); }
        if (!ok) continue;
        for (const p of u.add) { const at = isWildcard(p) ? pool.findIndex((id) => this.classOf(id) === p.slice(1)) : pool.indexOf(p); if (at < 0) { ok = false; break; } pool.splice(at, 1); }
        if (ok && pool.length === 0) return { recipe: r, from: base };
      }
    }
    return null;
  }

  /** 실패작 분류 — 규칙은 `failPick` (요리: 채소만 = 야채 찌꺼기 · 곡물만 = 탄 빵 · 고기가 있으면 쓰쿠네 · 그 외 수상한 주스) */
  private failDish(ids: readonly string[]): R {
    const classes = ids.map((id) => this.classOf(id));
    const pick = this.failPick(classes);
    const r = this.recipes.get(pick) ?? [...this.recipes.values()].find((x) => x.unlock === 'fail');
    // 실패작 데이터가 없는 축소 데이터(단위 검사)에서도 요리는 나온다
    return r ?? ({ id: 'mystery_dish', name: '수상한 요리', cat: 'snack', key: '@fail+any', taste: 1, look: 1, pop: 1, unlock: 'fail' } as unknown as R);
  }

  /** 도감에서 「설정」 — 레시피 키를 가진 재료로 채운다 (와일드카드는 그 등급의 첫 재료). 못 채우면 null */
  fillFor(recipeId: string): string[] | null {
    const r = this.recipes.get(recipeId);
    if (!r || r.unlock === 'fail') return null;
    const out: string[] = [];
    const ownedSorted = [...this.owned].sort();
    for (const p of r.key.split('+')) {
      if (isWildcard(p)) { const hit = ownedSorted.find((id) => this.classOf(id) === p.slice(1)); if (!hit) return null; out.push(hit); }
      else { if (!this.owned.has(p)) return null; out.push(p); }
    }
    return out;
  }

  canCook(ids: readonly string[], rank: number, money: number): { ok: true } | { ok: false; reason: string } {
    const w = this.words;
    if (rank < w.unlockRank) return { ok: false, reason: `${w.unlockLabel}은 ★${w.unlockRank} 부터` };
    if (ids.length < w.minCount) return { ok: false, reason: `${w.item}는 ${w.minCount}개 이상` };
    if (ids.length > w.maxCount) return { ok: false, reason: `${w.item}는 ${w.maxCount}개까지` };
    for (const id of ids) if (!this.owned.has(id)) return { ok: false, reason: `${this.ingredients.get(id)?.name ?? id} 은 아직 없다` };
    if (money < w.cost) return { ok: false, reason: `개발비 ${w.cost}G 가 부족합니다` };
    return { ok: true };
  }

  /** 개발 — 부르는 쪽이 canCook 을 통과시키고 돈을 뺀다 */
  cook(ids: readonly string[]): CookResultOf<R> {
    this.attempts++;
    const found = (recipe: R, via: 'exact' | 'wildcard' | 'upgrade' | 'fail', from?: R): CookResultOf<R> => {
      const first = !this.known.has(recipe.id);
      this.known.add(recipe.id);
      this.exp += via === 'fail' ? EXP_FAIL_DISH : first ? (via === 'upgrade' ? EXP_UPGRADE : EXP_DISCOVER) : Math.floor(EXP_DISCOVER / 3);
      return from ? { ok: true, recipe, first, via, from } : { ok: true, recipe, first, via };
    };
    // ① 정확 키
    const hit = this.byKey.get(recipeKey(ids));
    if (hit && hit.unlock !== 'fail' && this.levelOk(hit)) return found(hit, 'exact');
    // ② 와일드카드 키 — 여러 개면 재료가 많은 쪽, 같으면 id 순 (결정론)
    const wild = [...this.recipes.values()].filter((r) => r.unlock !== 'fail' && r.key.includes('@') && this.levelOk(r) && this.matchesKey(r.key, ids))
      .sort((a, b) => b.key.split('+').length - a.key.split('+').length || a.id.localeCompare(b.id))[0];
    if (wild) return found(wild, 'wildcard');
    // ③ 강화 사슬
    const up = this.matchUpgrade(ids);
    if (up) return found(up.recipe, 'upgrade', up.from);
    // ④ 실패작 — 그래도 요리는 나온다. 힌트는 재료가 60% 이상 겹치는 미발견 레시피의 카테고리 (cook 스트림, 뽑기 1회 고정)
    const mine = new Set(ids);
    const near = [...this.recipes.values()].filter((r) => r.unlock !== 'fail' && !this.known.has(r.id) && this.levelOk(r)).filter((r) => {
      const parts = r.key.split('+');
      const overlap = parts.filter((p) => mine.has(p) || (isWildcard(p) && ids.some((id) => this.classOf(id) === p.slice(1)))).length;
      return overlap / parts.length >= 0.6;
    });
    const roll = this.rng.int(Math.max(1, near.length));
    const dish = this.failDish(ids);
    const res = found(dish, 'fail');
    void near[roll];
    return res;
  }

  /** 실패작 힌트 — 마지막 개발의 재료로 재계산하는 대신 창이 부른다 (뽑기 없음, 결정론) */
  hintFor(ids: readonly string[]): R['cat'] | null {
    const mine = new Set(ids);
    const near = [...this.recipes.values()].filter((r) => r.unlock !== 'fail' && !this.known.has(r.id) && this.levelOk(r)).filter((r) => {
      const parts = r.key.split('+');
      const overlap = parts.filter((p) => mine.has(p) || (isWildcard(p) && ids.some((id) => this.classOf(id) === p.slice(1)))).length;
      return overlap / parts.length >= 0.6;
    }).sort((a, b) => a.id.localeCompare(b.id));
    return near[0]?.cat ?? null;
  }

  /** 실패작 목록 (도감 「실패작」 절) */
  get failDishes(): R[] {
    return [...this.recipes.values()].filter((r) => r.unlock === 'fail');
  }

  toSnapshot(): CookingSnapshot {
    return { exp: this.exp, known: [...this.known].sort(), owned: [...this.owned].sort(), attempts: this.attempts };
  }

  fromSnapshot(s: CookingSnapshot): void {
    this.exp = s.exp;
    this.known.clear();
    for (const id of s.known) if (this.recipes.has(id)) this.known.add(id);
    this.owned.clear();
    for (const id of s.owned) if (this.ingredients.has(id)) this.owned.add(id);
    this.attempts = s.attempts;
  }
}

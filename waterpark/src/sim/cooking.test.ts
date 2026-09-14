import { describe, it, expect } from 'vitest';
import { CookingStore, recipeKey, LEVEL_EXP } from './cooking.js';
import { MenuStore, recipePrice, MENU_SLOTS } from './restaurant.js';
import { Rng } from './rng.js';
import type { RecipeDef, IngredientDef, CompatDef } from '../data/schema.js';

const ING: IngredientDef[] = [
  { id: 'milk', name: '우유', unlock: 'start' }, { id: 'egg', name: '계란', unlock: 'start' }, { id: 'flour', name: '밀가루', unlock: 'start' },
  { id: 'choco', name: '초코', unlock: 'shop', price: 500 },
];
const REC: RecipeDef[] = [
  { id: 'pancake', name: '팬케이크', cat: 'snack', key: recipeKey(['egg', 'flour', 'milk']), taste: 4, look: 3, pop: 3, unlock: 'cook' },
  { id: 'choco_pancake', name: '초코 팬케이크', cat: 'dessert', key: recipeKey(['egg', 'flour', 'milk', 'choco']), taste: 6, look: 6, pop: 6, unlock: 'level:3' },
  { id: 'milk_drink', name: '우유', cat: 'drink', key: recipeKey(['milk', 'milk']), taste: 2, look: 1, pop: 1, unlock: 'start' },
];
const COMPAT: CompatDef[] = [{ restaurant: 'cafe', good: ['choco_pancake'], bad: ['milk_drink'] }];

describe('요리 개발', () => {
  it('키는 정렬 다중집합 — 순서·중복이 같으면 같은 레시피', () => {
    expect(recipeKey(['milk', 'egg', 'flour'])).toBe('egg+flour+milk');
    expect(recipeKey(['milk', 'milk'])).not.toBe(recipeKey(['milk']));
  });
  it('시작 레시피는 알고 있고, 개발로 발견하면 EXP · 재료가 없으면 못 만든다 · 2년차부터', () => {
    const c = new CookingStore(REC, ING, new Rng(1));
    expect(c.known.has('milk_drink')).toBe(true);
    expect(c.canCook(['egg', 'flour', 'milk'], 1, 1000).ok).toBe(false);
    expect(c.canCook(['egg', 'flour', 'milk'], 2, 1000).ok).toBe(true);
    expect(c.canCook(['egg', 'choco'], 2, 1000).ok).toBe(false);
    const r = c.cook(['milk', 'flour', 'egg']);
    expect(r.ok && r.first && r.recipe.id).toBe('pancake');
    expect(c.exp).toBe(30);
    const again = c.cook(['milk', 'flour', 'egg']);
    expect(again.ok && !again.first).toBe(true);
  });
  it('실패해도 요리(실패작)가 나온다 — EXP 8, 힌트는 겹침 60% 이상인 미발견 레시피의 카테고리 (G41)', () => {
    const c = new CookingStore(REC, ING, new Rng(1));
    c.grantIngredient('choco');
    const r = c.cook(['egg', 'flour', 'choco']); // 팬케이크와 2/3 겹침
    expect(r.ok && r.via).toBe('fail');
    expect(c.hintFor(['egg', 'flour', 'choco'])).toBe('snack');
    expect(c.exp).toBe(8);
  });
  it('레벨 게이트 — level:3 레시피는 레벨 3 전엔 안 나온다, 레벨업은 배수를 소급한다', () => {
    const c = new CookingStore(REC, ING, new Rng(1));
    c.grantIngredient('choco');
    const before = c.cook(['egg', 'flour', 'milk', 'choco']);
    expect(before.ok && before.via).toBe('fail');
    c.exp = LEVEL_EXP[2] as number;
    expect(c.level).toBe(3);
    expect(c.mult).toBeCloseTo(1.1, 5);
    const after = c.cook(['egg', 'flour', 'milk', 'choco']);
    expect(after.ok && after.via).toBe('exact');
  });
  it('스냅샷 왕복', () => {
    const c = new CookingStore(REC, ING, new Rng(1));
    c.cook(['egg', 'flour', 'milk']);
    const s = JSON.parse(JSON.stringify(c.toSnapshot()));
    const d = new CookingStore(REC, ING, new Rng(1));
    d.fromSnapshot(s);
    expect(d.toSnapshot()).toEqual(s);
  });
});

describe('식당 메뉴', () => {
  it('5칸 · 궁합 ⊚1.5/△0.5 · 다양성 배수 · 가격 = 스탯합×8', () => {
    const m = new MenuStore(REC, COMPAT);
    expect(MENU_SLOTS).toBe(5);
    m.setSlot(1, 0, 'choco_pancake');
    expect(m.menuPopularity(1, 'cafe')).toBe(9); // 6 × 1.5
    m.setSlot(1, 1, 'milk_drink');
    expect(m.menuPopularity(1, 'cafe')).toBe(Math.round((9 + 0.5) * 1.1));
    expect(m.categories(1)).toBe(2);
    expect(recipePrice(REC[0]!)).toBe(80);
    expect(m.compatOf('cafe', 'pancake')).toBe('neutral');
  });
  it('손님 추첨은 look 가중', () => {
    const m = new MenuStore(REC, COMPAT);
    m.setSlot(1, 0, 'choco_pancake'); // look 6
    m.setSlot(1, 1, 'milk_drink'); // look 1
    expect(m.pick(1, 0.1)?.id).toBe('choco_pancake');
    expect(m.pick(1, 0.95)?.id).toBe('milk_drink');
    expect(m.pick(2, 0.5)).toBeNull();
  });
});

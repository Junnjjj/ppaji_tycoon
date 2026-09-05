import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { COOK_UNLOCK_RANK } from './cooking.js';

/** G41 — 요리 = ★2 · 와일드카드 · 강화 사슬 · 실패작 · 설정 */
function kitchen(seed = 31): Game {
  const g = new Game(seed, undefined, { kit: false });
  g.money = 100000;
  g.rank = COOK_UNLOCK_RANK;
  return g;
}

describe('G41 요리 = ★2', () => {
  it('★1 에선 못 하고 ★2 부터 된다 (연차 무관)', () => {
    const g = new Game(30, undefined, { kit: false });
    g.money = 100000;
    expect(g.canCook(['egg', 'flour']).ok).toBe(false);
    expect(g.cookingOpen).toBe(false);
    g.rank = 2;
    expect(g.cookingOpen).toBe(true);
    expect(g.canCook(['egg', 'flour']).ok).toBe(true);
  });
});

describe('G41 와일드카드 · 강화 · 실패작', () => {
  it('밀가루+달걀+우유+아무 과일 = 과일 크레페 (오렌지도 레몬도)', () => {
    const g = kitchen();
    const a = g.cook(['flour', 'egg', 'milk', 'orange_fruit']);
    expect(a.ok && a.recipe.id).toBe('fruit_crepe');
    const b = g.cook(['lemon_fruit', 'flour', 'egg', 'milk']);
    expect(b.ok && b.recipe.id).toBe('fruit_crepe');
    expect(b.ok && b.first).toBe(false);
  });
  it('정확 키가 와일드카드보다 먼저 — 딸기+얼음+설탕은 눈꽃빙수, 오렌지+얼음+설탕은 과일 셔벗', () => {
    const g = kitchen();
    const a = g.cook(['strawberry_fruit', 'ice', 'sugar']);
    expect(a.ok && a.recipe.id).toBe('snow_cone');
    const b = g.cook(['orange_fruit', 'ice', 'sugar']);
    expect(b.ok && b.recipe.id).toBe('orange_sorbet'); // 정확 키
    const c = g.cook(['lemon_fruit', 'ice', 'sugar']);
    expect(c.ok && c.recipe.id).toBe('lemon_shaved_ice');
    g.cooking.grantIngredient('kiwi_fruit');
    const d = g.cook(['kiwi_fruit', 'ice', 'sugar']);
    expect(d.ok && d.recipe.id).toBe('fruit_sorbet');
    expect(d.ok && d.via).toBe('wildcard');
  });
  it('디럭스 크레페 = 밀가루+달걀+과일 3 (레벨 5 전엔 과일 크레페도 아니고 실패작)', () => {
    const g = kitchen();
    const early = g.cook(['flour', 'egg', 'orange_fruit', 'lemon_fruit', 'strawberry_fruit']);
    expect(early.ok && early.via).toBe('fail');
    g.cooking.exp = 10000; // Lv10
    const r = g.cook(['flour', 'egg', 'orange_fruit', 'lemon_fruit', 'strawberry_fruit']);
    expect(r.ok && r.recipe.id).toBe('deluxe_crepe');
  });
  it('강화 사슬 — 아는 크레페 + 과일 = 과일 크레페(강화), 도넛 + 초콜릿 = 초코 도넛', () => {
    const g = kitchen();
    expect(g.cooking.known.has('crepe')).toBe(true);
    const r = g.cook(['egg', 'flour', 'milk', 'sugar', 'strawberry_fruit']); // crepe 키 + 과일
    expect(r.ok && r.recipe.id).toBe('fruit_crepe');
    expect(r.ok && r.via).toBe('upgrade');
    expect(r.ok && r.from?.id).toBe('crepe');
    g.cooking.grantIngredient('chocolate_bar');
    const d = g.cook(['egg', 'flour', 'flour', 'sugar', 'chocolate_bar']);
    expect(d.ok && d.recipe.id).toBe('chocolate_donut');
  });
  it('실패해도 요리가 나온다 — 채소만 야채 찌꺼기 · 곡물만 탄 빵 · 고기 들어가면 쓰쿠네 · 그 외 수상한 주스', () => {
    const g = kitchen();
    for (const id of ['cabbage', 'tomato', 'rice', 'chicken', 'beef']) g.cooking.grantIngredient(id);
    expect((g.cook(['cabbage', 'tomato']) as { recipe: { id: string } }).recipe.id).toBe('veg_scraps');
    expect((g.cook(['flour', 'rice']) as { recipe: { id: string } }).recipe.id).toBe('burnt_bread');
    expect((g.cook(['chicken', 'beef', 'ice']) as { recipe: { id: string } }).recipe.id).toBe('tsukune');
    expect((g.cook(['ice', 'ice']) as { recipe: { id: string } }).recipe.id).toBe('mystery_juice');
    expect(g.cooking.known.has('veg_scraps')).toBe(true);
    expect(g.cooking.failDishes.length).toBe(4);
  });
  it('「설정」 — 레시피 키를 가진 재료로 채운다, 없는 재료면 null', () => {
    const g = kitchen();
    expect(g.cooking.fillFor('fruit_crepe')).toEqual(['lemon_fruit', 'egg', 'flour', 'milk']);
    expect(g.cooking.fillFor('salmon_sushi')).toBeNull();
    expect(g.cooking.fillFor('veg_scraps')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  INGREDIENTS,
  RECIPES,
  MenuStore,
  menuSlotsForLevel,
  pairKey,
  ingredientTaste,
  pairAffinity,
  type RecipeDef,
} from './menu.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, facilityDef } from './placement.js';

const SIZE = 24;
const GATE = { i: 0, j: 0 };

function shopWorld(defId: 'shop' | 'cafe' = 'shop'): {
  placement: PlacementGrid;
  handle: number;
} {
  const terrain = new KairoTerrain(SIZE, SIZE);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) terrain.paint(i, j, 'path_stone');
  }
  const placement = new PlacementGrid(SIZE, SIZE);
  const placed = placement.place(
    terrain,
    new WallGrid(SIZE, SIZE),
    GATE,
    defId,
    6,
    6,
  ).placed;
  if (!placed) throw new Error(`${defId} placement failed`);
  return { placement, handle: placed.handle };
}

describe('Phase 3 menu data', () => {
  /*
   * ⚠ P2 가 수직 슬라이스(재료 8 · 레시피 8 · craft 2종)를 넓혔다.
   * **기존 매점·카페 8종은 한 글자도 안 건드렸다** — 골든이 그 값에 걸려 있다.
   */
  it('기존 매점·카페 8종이 그대로 있고 조합이 시설 안에서 유일하다', () => {
    /*
     * ⚠ **기본 요리만 센다** — P2 후반이 2단 강화 사슬을 얹었고, 강화판은 기본과 같은
     * 재료 쌍을 담는다. 전부 세면 아래 「쌍이 시설 안에서 유일하다」가 반드시 깨지는데,
     * 그건 데이터 결함이 아니라 **강화의 정의**다 (`develop` 은 기본만 후보로 본다).
     */
    const base = RECIPES.filter((r) => r.base === undefined);
    expect(base.filter((r) => r.facilityId === 'shop').length).toBeGreaterThanOrEqual(4);
    expect(base.filter((r) => r.facilityId === 'cafe')).toHaveLength(4);
    // 매점·카페의 원래 네 이름이 시설 `menu` 배열에서 올라온 그대로다
    const names = new Set(
      ['shop', 'cafe'].flatMap((id) => facilityDef(id)?.menu?.map((m) => m.name) ?? []),
    );
    const original = ['shop_cup_ramen', 'shop_snack', 'shop_can_drink', 'shop_gimbap',
      'cafe_americano', 'cafe_latte', 'cafe_bingsu', 'cafe_cake'];
    for (const id of original) {
      const r = RECIPES.find((x) => x.id === id);
      expect(r, id).toBeDefined();
      expect(names.has(r!.name), r!.name).toBe(true);
    }
    /*
     * ⚠ **조합은 시설 안에서만 유일하면 된다.** 전역 유일을 요구하면 서로 다른 시설이
     * 같은 재료 쌍을 못 쓰는데, 그건 게임 규칙이 아니다 — `develop` 이 `facilityId|pair` 로
     * 찾으므로 다른 시설의 같은 쌍은 서로를 안 가린다.
     */
    for (const facilityId of new Set(base.map((r) => r.facilityId))) {
      const pairs = base.filter((r) => r.facilityId === facilityId)
        .map((r) => pairKey(...r.ingredients));
      expect(new Set(pairs).size, facilityId).toBe(pairs.length);
    }
  });

  it('treats ingredient order as irrelevant and every failed paid try leaves progress', () => {
    const store = new MenuStore();
    /*
     * ⚠ **Q4 부터 재료는 4종만 시작 해금이다** (`ice`·`seaweed`·`rice`·`noodle`).
     * 이 검사가 재려는 것은 「순서 무관 · 실패에도 진행」이지 「처음부터 다 있다」가 아니므로,
     * 필요한 재료를 **명시적으로 푼다**. 안 그러면 `unavailable` 이 돌아와 검사가 다른 것을 잰다.
     */
    for (const ing of INGREDIENTS) store.unlockIngredient(ing.id);
    let spent = 0;
    const fail = store.develop('shop', ['ice', 'milk'], (cost) => {
      spent += cost;
      return true;
    });
    expect(fail.kind).toBe('failed');
    expect(fail.cost).toBeGreaterThan(0);
    expect(fail.clue.length).toBeGreaterThan(4);
    expect(fail.progress).toBeGreaterThan(0);
    expect(spent).toBe(fail.cost);

    const repeat = store.develop('shop', ['milk', 'ice'], () => {
      throw new Error('the same failed pair must not charge twice');
    });
    expect(repeat.kind).toBe('failed');
    expect(repeat.cost).toBe(0);
    expect(repeat.clue).toBe(fail.clue);

    store.unlockIngredient('broth');
    const success = store.develop('shop', ['broth', 'noodle'], () => true);
    const reverse = store.develop('shop', ['noodle', 'broth'], () => true);
    expect(success.kind).toBe('discovered');
    expect(reverse.kind).toBe('known');
    expect(success.recipe?.id).toBe(reverse.recipe?.id);
  });

  it('grows per-instance menu slots 1 -> 2 -> 3 at facility levels 1/3/5', () => {
    expect([1, 2, 3, 4, 5].map(menuSlotsForLevel)).toEqual([1, 1, 2, 2, 3]);
    const { placement, handle } = shopWorld();
    const store = MenuStore.fromSnapshot({
      ingredients: INGREDIENTS.map((x) => x.id),
      discovered: RECIPES.map((x) => x.id),
      failures: {},
    });

    expect(placement.menuSlotCount(handle)).toBe(1);
    expect(store.equip(placement, handle, 'shop_gimbap', 1)).toBe(false);
    while (placement.levelOf(handle) < 3) placement.upgrade(handle);
    expect(placement.menuSlotCount(handle)).toBe(2);
    expect(store.equip(placement, handle, 'shop_gimbap', 1)).toBe(true);
    while (placement.levelOf(handle) < 5) placement.upgrade(handle);
    expect(placement.menuSlotCount(handle)).toBe(3);
    expect(store.equip(placement, handle, 'shop_snack', 2)).toBe(true);
    expect(placement.menuIdsOf(handle)).toEqual([
      expect.any(String),
      'shop_gimbap',
      'shop_snack',
    ]);

    const second = shopWorld().placement;
    expect(second.menuIdsOf(1)).not.toEqual(placement.menuIdsOf(handle));
  });

  it('restores development state deterministically and sanitizes removed ids', () => {
    const raw = {
      ingredients: ['ice', 'coffee', 'removed-ingredient'],
      discovered: ['cafe_americano', 'removed-recipe'],
      failures: {
        'shop|ice+milk': {
          clue: '우유 힌트',
          progress: 0.25,
        },
      },
    };
    const a = MenuStore.fromSnapshot(structuredClone(raw));
    const b = MenuStore.fromSnapshot(structuredClone(raw));
    expect(a.toSnapshot()).toEqual(b.toSnapshot());
    expect(a.toSnapshot().ingredients).not.toContain('removed-ingredient');
    expect(a.toSnapshot().discovered).not.toContain('removed-recipe');
    expect(a.toSnapshot().failures['shop|ice+milk']?.clue).toBe('우유 힌트');
  });
});

/**
 * ── Q2: 잘 어울리는 실험은 빈손으로 안 끝난다 ──────────────────────────────
 *
 * 근거는 Burger Bistro Story 다 — 궁합이 맞으면 보너스, 안 맞으면 감점, 관계없으면 변화
 * 없음이고 **「실패」라는 결과가 없다**. 우리는 요리가 전부 손으로 만든 데이터라 즉석
 * 요리를 만들 수 없으므로, 보상을 **「가까운 요리의 발견」**으로 옮겼다.
 */
describe('Q2 — 재료 궁합', () => {
  it('대표 성격이 데이터에서 나온다 — 손으로 안 적는다', () => {
    // 얼음은 시원한 요리에만 들어간다 · 국물은 따뜻한 쪽이다
    expect(ingredientTaste('ice')).toBe('cool');
    expect(ingredientTaste('broth')).toBe('warm');
  });

  it('같은 성격은 good · 미는 성격은 bad · 나머지는 ok', () => {
    expect(pairAffinity('ice', 'coffee')).toBe('good'); // 둘 다 cool
    expect(pairAffinity('ice', 'broth')).toBe('bad'); // cool ↔ warm
    expect(pairAffinity('ice', 'rice')).toBe('ok'); // cool vs savory — 관계 없음
  });

  it('★ 궁합이 상수가 아니다 — good 이 전체의 절반을 안 넘는다', () => {
    const ids = INGREDIENTS.map((x) => x.id);
    let good = 0;
    let total = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        total += 1;
        if (pairAffinity(ids[i] as string, ids[j] as string) === 'good') good += 1;
      }
    }
    /*
     * ⚠ 첫 시안은 「태그를 하나라도 공유하면 good」이라 **81%** 였다 (실측). 궁합이 81% 면
     * 그건 궁합이 아니라 상수다 — 그래서 대표 성격 하나로 좁혔다. 이 검사가 그 회귀를 막는다.
     */
    expect(good / total).toBeLessThan(0.5);
    expect(good).toBeGreaterThan(0); // 0 이면 축이 죽은 것이다
  });

  it('★ good 이면서 재료가 하나 겹치면 — 빗나가도 발견한다', () => {
    /*
     * ⚠ **쌍을 하드코딩하지 않는다.** 처음엔 `ice + coffee` 를 박았는데 매점에서 `ice` 가
     * 들어가는 요리는 시작 메뉴 하나뿐이라(이미 발견 상태) 전제가 성립하지 않았다 —
     * 데이터가 바뀌면 검사가 조용히 아무것도 안 재게 되는 형태다. 조건에 맞는 쌍을 **찾아서** 잰다.
     */
    const menus = new MenuStore();
    for (const ing of INGREDIENTS) menus.unlockIngredient(ing.id);
    const base = RECIPES.filter((r) => r.facilityId === 'shop' && r.base === undefined);
    const exactPairs = new Set(base.map((r) => pairKey(...r.ingredients)));
    const ids = INGREDIENTS.map((x) => x.id);
    let found = false;
    for (let i = 0; i < ids.length && !found; i++) {
      for (let j = i + 1; j < ids.length && !found; j++) {
        const a = ids[i] as string;
        const b = ids[j] as string;
        if (pairAffinity(a, b) !== 'good') continue;
        if (exactPairs.has(pairKey(a, b))) continue; // 정확히 맞은 경로는 이 검사가 아니다
        const near = base.find(
          (r) => !menus.hasRecipe(r.id) && (r.ingredients.includes(a) || r.ingredients.includes(b)),
        );
        if (!near) continue;
        const out = menus.develop('shop', [a, b], () => true);
        expect(out.kind).toBe('discovered');
        expect(out.recipe?.id).toBe(near.id);
        found = true;
      }
    }
    // 그런 쌍이 데이터에 없으면 이 검사는 **아무것도 안 잰다** — 그것을 드러낸다
    expect(found).toBe(true);
  });

  it('⚠ 재료가 하나도 안 겹치면 good 이어도 발견이 아니다 — 만능 열쇠가 아니다', () => {
    const menus = new MenuStore();
    for (const ing of INGREDIENTS) menus.unlockIngredient(ing.id);
    // 매점 요리에 둘 다 안 들어가는 good 쌍을 찾는다
    const shopRecipes = RECIPES.filter((r) => r.facilityId === 'shop' && r.base === undefined);
    const used = new Set(shopRecipes.flatMap((r) => [...r.ingredients]));
    const ids = INGREDIENTS.map((x) => x.id).filter((id) => !used.has(id));
    let checked = 0;
    for (let i = 0; i < ids.length && checked === 0; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i] as string;
        const b = ids[j] as string;
        if (pairAffinity(a, b) !== 'good') continue;
        const out = menus.develop('shop', [a, b], () => true);
        expect(out.kind).not.toBe('discovered');
        checked = 1;
        break;
      }
    }
    // 그런 쌍이 데이터에 없으면 이 검사는 아무것도 안 잰다 — 그것을 드러낸다
    expect(checked).toBe(1);
  });

  it('정확히 맞힌 조합은 그대로다 — 겨냥이 여전히 최선이다', () => {
    const menus = new MenuStore();
    for (const ing of INGREDIENTS) menus.unlockIngredient(ing.id);
    const exact = RECIPES.find(
      (r) => r.facilityId === 'shop' && r.base === undefined && !menus.hasRecipe(r.id),
    );
    expect(exact).toBeDefined();
    const pair = (exact as RecipeDef).ingredients;
    const out = menus.develop('shop', [pair[0], pair[1]], () => true);
    expect(out.kind).toBe('discovered');
    expect(out.recipe?.id).toBe(exact?.id);
  });
});

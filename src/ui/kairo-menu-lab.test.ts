import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  autoEquipTarget,
  equipTargets,
  kitchenModel,
  menuDeltas,
} from './kairo-menu-lab.js';
import { MenuStore, recipeDef } from '../sim/kairo/menu.js';
import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function placement(items: PlacementSnapshot['items']): PlacementGrid {
  return PlacementGrid.fromSnapshot({ w: 20, h: 20, next: 9, items });
}

const oneShop = (): PlacementGrid => placement([{ handle: 1, defId: 'shop', i: 4, j: 4 }]);

describe('요리 화면은 시설에 안 매인다 (P2)', () => {
  it('지어진 craft 시설 전부가 한 모델에 담기고 활성 탭만 고른다', () => {
    const menus = new MenuStore();
    const grid = placement([
      { handle: 1, defId: 'shop', i: 4, j: 4 },
      { handle: 2, defId: 'cafe', i: 8, j: 4 },
    ]);
    const model = kitchenModel(menus, grid);
    expect(model?.facilities.map((f) => f.defId)).toEqual(['shop', 'cafe']);
    expect(model?.active.defId).toBe('shop');
    expect(kitchenModel(menus, grid, 'cafe')?.active.defId).toBe('cafe');
    // 안 지은 시설은 안 담긴다 — 걸 곳 없는 요리가 쌓이지 않는다
    expect(model?.facilities.some((f) => f.defId === 'snackbar')).toBe(false);
  });

  it('craft 시설이 하나도 없으면 모델 자체가 없다', () => {
    expect(kitchenModel(new MenuStore(), placement([]))).toBeNull();
  });

  it('재료 후보는 시설이 좁힌다 — 해금한 것 전부를 깔지 않는다', () => {
    const menus = new MenuStore();
    /*
     * ⚠ **Q4 부터 시작 재료가 4종이고 넷 다 매점 후보다.** 그대로 재면 「좁혔다」와
     * 「원래 전부가 매점 것이다」를 구분 못 해 검사가 공허해진다 — 카페 전용 재료를
     * 하나 풀어서 **좁혀지는 것이 실제로 보이게** 한다.
     */
    menus.unlockIngredient('milk');
    const model = kitchenModel(menus, oneShop());
    const ids = model?.active.ingredients.map((x) => x.id) ?? [];
    expect(ids).toContain('rice');
    // ⚠ 우유는 카페 재료다. 예전 모델은 해금한 재료를 전부 깔아서 매점에도 떴다
    expect(ids).not.toContain('milk');
    expect(ids.length).toBeLessThan(menus.ingredientIds().length);
  });

  it('실패 힌트와 인스턴스별 슬롯이 같은 모델에서 나온다', () => {
    const menus = new MenuStore();
    menus.develop('shop', ['ice', 'noodle'], () => true);
    const model = kitchenModel(menus, oneShop());
    expect(model?.active.targets[0]?.slots.map((r) => r?.id)).toEqual(['shop_can_drink']);
    expect(model?.active.clues.length).toBe(1);
    expect(model?.active.clues[0]?.progress).toBeGreaterThan(0);
  });
});

describe('칸은 말없이 안 바뀐다 (§2.6)', () => {
  it('빈 칸이 있으면 묻지 않고 그 자리를 준다', () => {
    const menus = new MenuStore();
    const grid = placement([{ handle: 1, defId: 'shop', i: 4, j: 4 }]);
    grid.upgrade(1); // 3단계 = 슬롯 2칸
    grid.upgrade(1);
    menus.develop('shop', ['rice', 'seaweed'], () => true);
    expect(autoEquipTarget(menus, grid, 'shop_gimbap')).toEqual({ handle: 1, slot: 1 });
  });

  it('⚠ 칸이 다 차면 null 이다 — 예전 코드는 여기서 말없이 덮어썼다', () => {
    const menus = new MenuStore();
    const grid = oneShop(); // 1단계 = 슬롯 1칸, 시작 메뉴가 이미 들어 있다
    menus.develop('shop', ['rice', 'seaweed'], () => true);
    expect(grid.menuIdsOf(1)).toEqual(['shop_can_drink']);
    expect(autoEquipTarget(menus, grid, 'shop_gimbap')).toBeNull();
    // 그리고 그때 무엇과 바꿀지 물을 재료가 모델에 있다
    expect(equipTargets(menus, grid, 'shop_gimbap')[0]?.slots[0]?.id).toBe('shop_can_drink');
  });

  it('이미 걸린 요리는 칸을 하나 더 안 먹는다 (멱등)', () => {
    const menus = new MenuStore();
    const grid = placement([{ handle: 1, defId: 'shop', i: 4, j: 4 }]);
    grid.upgrade(1);
    grid.upgrade(1);
    expect(autoEquipTarget(menus, grid, 'shop_can_drink')).toEqual({ handle: 1, slot: 0 });
  });

  it('안 지은 시설의 요리는 걸 자리가 없다', () => {
    expect(equipTargets(new MenuStore(), oneShop(), 'cafe_latte')).toEqual([]);
    expect(autoEquipTarget(new MenuStore(), oneShop(), 'cafe_latte')).toBeNull();
  });
});

describe('회수 줄은 sim 실효값에서 나온다 (§2.6)', () => {
  it('발견은 새 물건의 성질을, 강화는 변화를 낸다', () => {
    const gimbap = recipeDef('shop_gimbap')!;
    const egg = recipeDef('shop_gimbap_egg')!;
    const found = menuDeltas(gimbap);
    expect(found.map((d) => d.label)).toEqual(['가격', '만족', '손님층']);
    // 절대값이라 `from` 이 없다 — 카운트업이 안 돈다
    expect(found.every((d) => d.from === undefined)).toBe(true);
    expect(found[0]?.to).toBe(`₩${gimbap.price.toLocaleString('ko-KR')}`);

    const grown = menuDeltas(egg, gimbap);
    expect(grown[0]).toEqual({ label: '가격', from: gimbap.price, to: egg.price });
    expect(grown[1]).toEqual({
      label: '만족',
      from: gimbap.satisfaction,
      to: egg.satisfaction,
    });
    // ⚠ 하드코딩 문자열 0 — 데이터가 바뀌면 이 줄도 같이 바뀐다
    expect(egg.price).toBeGreaterThan(gimbap.price);
  });

  it('손님층이 안 바뀐 강화는 `→` 를 안 그린다', () => {
    const base = recipeDef('shop_gimbap')!;
    const grown = recipeDef('shop_gimbap_egg')!;
    const row = menuDeltas(grown, base).find((d) => d.label === '손님층');
    expect(base.tags.join(' · ')).toBe(grown.tags.join(' · '));
    expect(row?.from).toBeUndefined();
  });
});

describe('요리 화면 표면', () => {
  it('하네스 손잡이와 44px 토큰이 그대로다', () => {
    const source = readFileSync(new URL('./kairo-menu-lab.ts', import.meta.url), 'utf8');
    for (const handle of [
      'kairo-menu-lab',
      'kairo-menu-develop',
      'kairo-menu-ingredient',
      'kairo-menu-slot',
      "dataset['recipe']",
    ]) {
      expect(source, handle).toContain(handle);
    }
    expect(source).toContain('메뉴 개발');
    expect(source).toContain('요리 강화');
    expect(css).toMatch(/\.kmenu-lab[\s\S]*?min-height:\s*var\(--tap\)/);
  });
});

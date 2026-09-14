import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';

/** P26 (D32) — 경관 전염: 장식·조경 지면이 반경 2 안 시설의 인기와 판매가에 붙는다. 화장실은 자리 등급을 깎는다(P24) */
describe('P26 경관 전염', () => {
  it('장식 22종 전부 scenery 4~16 (인기에서 유도)', () => {
    const decor = [...FACILITY_DEFS.values()].filter((d) => d.class === 'decor');
    expect(decor.length).toBe(22);
    for (const d of decor) { expect(d.scenery).toBeGreaterThanOrEqual(4); expect(d.scenery).toBeLessThanOrEqual(16); }
    expect(FACILITY_DEFS.get('waterfall')!.scenery).toBe(16);
    expect(FACILITY_DEFS.get('flowerbed')!.scenery).toBe(5);
  });
  it('매점 옆 해바라기·갈대 → 경관 합 · 인기 · 판매가 % 가 오른다, 멀면 0', () => {
    const g = new Game(26); g.money = 100000; g.rank = 2; g.openLand(2); g.unlocked.facilities.add('pine');
    const gt = g.gate;
    const sd = FACILITY_DEFS.get('shop')!;
    const shop = g.placeFacility('shop', gt.i + 20, gt.j + 10, 0); expect(shop.ok).toBe(true);
    expect(g.sceneryOf(shop.uid!)).toBe(0);
    const pop0 = g.parkPopularity();
    const a = g.placeFacility('sunflower', gt.i + 20 - 2, gt.j + 10, 0); expect(a.ok).toBe(true); // 왼쪽 2칸 — 반경 안
    const b = g.placeFacility('aloe', gt.i + 20 + sd.w + 1, gt.j + 10, 0); expect(b.ok).toBe(true); // 오른쪽 — 반경 안
    const sc = g.sceneryOf(shop.uid!);
    expect(sc).toBe(FACILITY_DEFS.get('sunflower')!.scenery! + FACILITY_DEFS.get('aloe')!.scenery!);
    expect(g.parkPopularity()).toBeGreaterThan(pop0 + FACILITY_DEFS.get('sunflower')!.pop + FACILITY_DEFS.get('aloe')!.pop - 1); // 장식 인기 + 경관 인기
    const c = g.placeFacility('pine', gt.i + 20, gt.j + 10 + sd.d + 4, 0); expect(c.ok).toBe(true); // 4칸 떨어짐 — 안 붙는다
    expect(g.sceneryOf(shop.uid!)).toBe(sc);
  });
  it('조경 지면은 경관 ×2 — 꽃밭 3칸이면 +6 → 인기 +1', () => {
    const g = new Game(26); g.money = 100000; g.rank = 2; g.openLand(2);
    const gt = g.gate;
    const shop = g.placeFacility('shop', gt.i + 20, gt.j + 10, 0); expect(shop.ok).toBe(true);
    const pop0 = g.parkPopularity();
    expect(g.paintGround([{ i: gt.i + 19, j: gt.j + 12 }, { i: gt.i + 20, j: gt.j + 12 }, { i: gt.i + 21, j: gt.j + 12 }], 'flowerbed').ok).toBe(true);
    expect(g.sceneryOf(shop.uid!)).toBe(6);
    expect(g.parkPopularity()).toBe(pop0 + 1);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Game, INGREDIENT_DEFS, RIG_PART_DEFS } from './game.js';
import { PART_DEFS } from './workshop.js';
import { runBot, BOT_DEFAULTS } from './bot.js';
import { CookingStore, REWARD_STOCK, LEGACY_STOCK, type CookingSnapshot } from './cooking.js';
import { Rng } from './rng.js';

/**
 * P56-c 재고(U1, D10) — 재료·부품은 열쇠(owned) + 재고(stock). 시작 재료는 무한 · 장날 +1 · 보상 ×3 · 조합 −1(돈을 낸 시도만) ·
 * 한 번 얻은 보상 재료는 장날 값으로 다시 산다 · 스냅샷 optional `stock`(없으면 옛 세이브 → 보유마다 LEGACY_STOCK).
 */
const rich = (seed = 1): Game => { const g = new Game(seed); g.money = 1e6; g.rank = 2; return g; };

describe('P56-c 재고(U1)', () => {
  it('저장소 — 시작 재료는 무한(stockOf null) · 보상 ×3 · 두 번 받으면 ×6 · consume 은 슬롯당 −1 · has(id, n) 이 개수를 본다', () => {
    const c = new CookingStore([], INGREDIENT_DEFS, new Rng(1));
    const start = INGREDIENT_DEFS.find((i) => i.unlock === 'start')!;
    const wish = INGREDIENT_DEFS.find((i) => i.unlock === 'wish')!;
    expect(c.stockOf(start.id)).toBeNull(); expect(c.has(start.id, 99)).toBe(true);
    expect(c.owned.has(wish.id)).toBe(false); expect(c.stockOf(wish.id)).toBe(0); expect(c.has(wish.id)).toBe(false);
    expect(c.grantIngredient(wish.id)).toBe(true); expect(c.stockOf(wish.id)).toBe(REWARD_STOCK);
    expect(c.grantIngredient(wish.id)).toBe(false); expect(c.stockOf(wish.id)).toBe(REWARD_STOCK * 2); // 두 번째는 「처음」이 아니지만 재고는 는다
    expect(c.has(wish.id, 6)).toBe(true); expect(c.has(wish.id, 7)).toBe(false);
    c.consume([wish.id, wish.id, start.id]);
    expect(c.stockOf(wish.id)).toBe(4); expect(c.stockOf(start.id)).toBeNull();
    c.consume([wish.id, wish.id, wish.id, wish.id, wish.id]);
    expect(c.stockOf(wish.id)).toBe(0); expect(c.owned.has(wish.id)).toBe(true); // 열쇠는 남는다
    expect(c.canCook([wish.id, start.id], 2, 1e6).ok).toBe(false);
    expect((c.canCook([wish.id, start.id], 2, 1e6) as { reason: string }).reason).toContain('재고');
  });

  it('canCook·fillFor 가 같은 재료 두 개를 재고로 센다 — ×1 이면 [x, x] 거절 · fillFor 는 재고 남은 것만 고른다', () => {
    const x = INGREDIENT_DEFS.find((i) => i.unlock === 'shop')!.id; // 시작 재료는 무한이라 셀 게 없다 — 장날 재료로
    const c = new CookingStore([{ id: 'r', name: 'r', cat: 'snack', key: `${x}+${x}`, unlock: 'cook' } as unknown as never], INGREDIENT_DEFS, new Rng(1));
    c.grantIngredient(x, 1);
    expect(c.canCook([x, x], 2, 1e6).ok).toBe(false);
    expect(c.fillFor('r')).toBeNull();
    c.grantIngredient(x, 1);
    expect(c.canCook([x, x], 2, 1e6).ok).toBe(true);
    expect(c.fillFor('r')).toEqual([x, x]);
  });

  it('Game — 장날 재료는 몇 번이고 +1 · 조합이 −1 · 보상 재료는 받은 뒤 같은 값에 다시 산다 · 시작 재료는 안 판다 · 안 받은 보상 재료는 못 산다', () => {
    const g = rich();
    const shop = INGREDIENT_DEFS.find((i) => i.unlock === 'shop')!;
    const wish = INGREDIENT_DEFS.find((i) => i.unlock === 'wish')!;
    const start = INGREDIENT_DEFS.find((i) => i.unlock === 'start')!;
    expect(g.buyIngredient(start.id).ok).toBe(false);
    expect(g.buyIngredient(wish.id).ok).toBe(false); // 열쇠가 없다
    expect(g.buyIngredient(shop.id).ok).toBe(true); expect(g.buyIngredient(shop.id).ok).toBe(true);
    expect(g.cooking.stockOf(shop.id)).toBe(2); expect(g.stats.stockBuys).toBe(2);
    const m0 = g.money;
    expect(g.cook([shop.id, start.id]).ok).toBe(true); // 실패작이어도 요리는 나온다 — 돈과 재고가 든다
    expect(g.money).toBeLessThan(m0); expect(g.cooking.stockOf(shop.id)).toBe(1);
    g.grant({ kind: 'ingredient', id: wish.id });
    expect(g.cooking.stockOf(wish.id)).toBe(REWARD_STOCK);
    const m1 = g.money;
    expect(g.buyIngredient(wish.id).ok).toBe(true); expect(g.cooking.stockOf(wish.id)).toBe(REWARD_STOCK + 1);
    expect(m1 - g.money).toBe(wish.price ?? -1);
  });

  it('부품 — 공방 조합·개조 발견이 재고를 쓴다 · 개조 「미발견」은 돈도 부품도 안 든다 · 연차 부품은 받은 뒤 재구매', () => {
    const g = rich();
    const part = PART_DEFS.find((p) => p.unlock === 'shop')!;
    expect(g.buyPart(part.id).ok).toBe(true); expect(g.buyPart(part.id).ok).toBe(true); expect(g.workshop.stockOf(part.id)).toBe(2);
    const start = PART_DEFS.find((p) => p.unlock === 'start')!;
    g.craft([part.id, start.id]);
    expect(g.workshop.stockOf(part.id)).toBe(1); expect(g.workshop.stockOf(start.id)).toBeNull();
    for (const id of ['slip_wax', 'float_drum', 'pump_motor', 'safety_net']) g.rigs.grantIngredient(id);
    const m0 = g.money;
    const miss = g.craftRig(['safety_net', 'pump_motor']); expect(miss.ok).toBe(false);
    expect(g.money).toBe(m0); expect(g.rigs.stockOf('safety_net')).toBe(REWARD_STOCK);
    const hit = g.craftRig(['slip_wax', 'pump_motor', 'float_drum']); expect(hit.ok).toBe(true);
    expect(g.rigs.stockOf('slip_wax')).toBe(REWARD_STOCK - 1);
    const year = RIG_PART_DEFS.find((p) => p.unlock === 'year')!;
    expect(g.buyRigPart(year.id).ok).toBe(false);
    g.rigs.grantIngredient(year.id);
    expect(g.buyRigPart(year.id).ok).toBe(true); expect(g.rigs.stockOf(year.id)).toBe(REWARD_STOCK + 1);
  });

  it('스냅샷 — `stock` 왕복 · 시작 재료는 안 싣는다 · `stock` 없는 옛 세이브는 보유마다 LEGACY_STOCK', () => {
    const g = rich();
    const shop = INGREDIENT_DEFS.find((i) => i.unlock === 'shop')!;
    g.buyIngredient(shop.id); g.buyIngredient(shop.id);
    const s = g.cooking.toSnapshot();
    expect(s.stock).toEqual({ [shop.id]: 2 });
    for (const id of Object.keys(s.stock ?? {})) expect(g.cooking.infinite(id)).toBe(false);
    const h = new Game(1); h.cooking.fromSnapshot(s);
    expect(h.cooking.stockOf(shop.id)).toBe(2);
    const legacy: CookingSnapshot = { exp: 0, known: [], owned: [shop.id, 'ice'], attempts: 0 };
    const k = new Game(1); k.cooking.fromSnapshot(legacy);
    expect(k.cooking.stockOf(shop.id)).toBe(LEGACY_STOCK); expect(k.cooking.stockOf('ice')).toBeNull();
  });

  it('소비는 돈을 낸 세 경계에서만 — game.ts 의 consume 호출 3(cook·craft·craftRig) · 데이터: start 아닌 재료·부품 전부에 price', () => {
    const src = readFileSync(resolve(__dirname, 'game.ts'), 'utf8');
    expect((src.match(/this\.cooking\.consume\(ids\)/g) ?? []).length).toBe(1);
    expect((src.match(/this\.workshop\.consume\(ids\)/g) ?? []).length).toBe(1);
    expect((src.match(/this\.rigs\.consume\(ids\)/g) ?? []).length).toBe(1);
    for (const i of INGREDIENT_DEFS) expect(i.price !== undefined, i.id).toBe(i.unlock !== 'start');
    for (const p of PART_DEFS) expect(p.price !== undefined, p.id).toBe(p.unlock !== 'start');
    for (const p of RIG_PART_DEFS) expect(p.price > 0, p.id).toBe(true);
  });

  it('봇 — 64일 판에서 재고 구입이 있고(restock 이 돈다) 레시피 발견이 산다 · 결정론', () => {
    const a = runBot(new Game(2), 64, BOT_DEFAULTS), b = runBot(new Game(2), 64, BOT_DEFAULTS);
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.stockBuys).toBeGreaterThan(0);
    expect(a.recipes).toBeGreaterThan(5);
  });
});

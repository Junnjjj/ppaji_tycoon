import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

/** P23 (D34) — 식당은 놓이는 순간 메뉴 3개가 걸리고, 새 판 첫날부터 매출이 난다 (전: 슬롯 0 · 3일 매출 0) */
describe('P23 기본 메뉴 자동', () => {
  it('새 판의 킷 식당(자판기)에 메뉴 3개가 걸려 있고, 새 매점을 놓으면 궁합 좋은 메뉴 3개가 자동으로 걸린다', () => {
    const g = new Game(23); g.money = 50000;
    const vend = g.facilities.all.find((f) => f.defId === 'vending_out')!;
    expect(g.menus.slotsOf(vend.uid).filter((x) => x !== null).length).toBe(3);
    const gt = g.gate;
    const r = g.placeFacility('shop', gt.i - 16, gt.j + 20, 0); expect(r.ok).toBe(true); // P48-b3: 서쪽 잔디(열 32 · 행 28)
    const slots = g.menus.slotsOf(r.uid!).filter((x): x is string => x !== null);
    expect(slots.length).toBe(3);
    expect(slots.some((id) => g.menus.compatOf('shop', id) === 'good')).toBe(true);
    expect(new Set(slots.map((id) => g.menus.recipes.get(id)!.cat)).size).toBeGreaterThanOrEqual(2); // 카테고리 다양성 +3
  });
  it('첫날 매출 > 0 · 첫 판매 토스트 한 번 · 결산 요약에 「매점 n건 (최다 …)」', () => {
    const g = new Game(23);
    g.step(TICKS_PER_DAY + 2);
    expect(g.stats.food).toBeGreaterThan(0);
    const items = (g.inbox as unknown as { items?: { title: string; body: string; kind: string }[]; all?: { title: string; body: string; kind: string }[] });
    const list = items.items ?? items.all ?? [];
    expect(list.filter((x) => x.title.startsWith('첫 판매')).length).toBe(1);
    const sum = list.filter((x) => x.kind === 'day-summary').slice(-1)[0]!;
    expect(sum.body).toMatch(/매점 \d+건 \(최다 /);
    const h = Game.fromSnapshot(g.toSnapshot());
    expect(h.firstSaleSeen).toBe(true);
  });
});

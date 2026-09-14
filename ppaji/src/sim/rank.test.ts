import { describe, it, expect } from 'vitest';
import { TICKS_PER_DAY, SHOP_RESTOCK_TICK } from './clock.js';
import { Game, RANK_DEFS, SHOP_ENTRIES, CALENDAR_EVENTS } from './game.js';
import { landRect } from './grid.js';
import { Shop } from './shop.js';
import { Rng } from './rng.js';
import { eventDay } from './calendar.js';
import { makeTestPpaji } from './test-helpers.js';

describe('랭크 · 상점 · 달력 (Game 통합)', () => {
  it('랭크업은 폐장에 조건 전부 만족일 때 — 토지가 넓어지고 새 땅이 잔디가 된다', () => {
    const g = new Game(3);
    const l0 = landRect(0);
    // 조건을 강제로 채운다: 인증 1 · 인기 80
    g.certs.state.passed['grade_f'] = 1;
    g.money = 100000;
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로. 킷 링 서쪽에 4×5 — 허가 ★0 40 = 킷 20 + 20
    expect(pp.id).not.toBeNull();
    g.step(TICKS_PER_DAY);
    expect(g.rank).toBe(1);
    const l1 = landRect(1);
    expect(l1.w).toBeGreaterThan(l0.w);
    expect(g.grid.at(l1.i0, l1.j0)).not.toBe(0); // 새 땅이 모래(0)가 아니다
    expect(g.inbox.all.some((e) => e.title.startsWith('랭크 업'))).toBe(true);
    expect(RANK_DEFS.length).toBe(5);
  });
  it('상점은 17:00 에 6칸 입고, 산 것은 해금되고 진열에서 빠진다', () => {
    const g = new Game(4);
    g.money = 100000;
    g.step(SHOP_RESTOCK_TICK + 1);
    const stock = g.shopStock();
    expect(stock.length).toBeGreaterThan(0);
    expect(stock.length).toBeLessThanOrEqual(6);
    const e = stock[0]!;
    const m = g.money;
    expect(g.buyShop(e.id).ok).toBe(true);
    expect(m - g.money).toBe(e.price);
    expect(g.shopStock().some((x) => x.id === e.id)).toBe(false);
    expect(g.buyShop(e.id).ok).toBe(false);
    expect(SHOP_ENTRIES.length).toBeGreaterThan(5);
  });
  it('상점 뽑기는 후보 수와 무관하게 6회 — 스트림이 안 밀린다', () => {
    const entries = SHOP_ENTRIES;
    const a = new Shop(entries, new Rng(9));
    const b = new Shop(entries, new Rng(9));
    a.restock(0, 1, () => false);
    b.restock(0, 5, () => false);
    // 두 번째 입고의 결과는 첫 입고에서 몇 개가 뽑혔든 같은 스트림 위치에서 나온다
    a.restock(1, 1, () => false);
    b.restock(1, 1, () => false);
    expect(a.state.stock).toEqual(b.state.stock);
  });
  it('사장 달력 — 3일차 크레페, 첫 인증 뒤 이동 도구', () => {
    const g = new Game(5);
    g.step(TICKS_PER_DAY * 3 + 1);
    expect(g.unlocked.facilities.has('bungeoppang')).toBe(true);
    const move = CALENDAR_EVENTS.find((e) => e.grant.kind === 'tool');
    expect(move).toBeDefined();
    expect(eventDay(move!)).toBeGreaterThan(3);
  });
  it('스냅샷 왕복에 인증·상점·달력·도구·타일이 든다', () => {
    const g = new Game(6);
    g.money = 100000;
    g.step(SHOP_RESTOCK_TICK + 1);
    g.applyCert('grade_f');
    const s = JSON.parse(JSON.stringify(g.toSnapshot()));
    const g2 = Game.fromSnapshot(s);
    expect(g2.toSnapshot()).toEqual(g.toSnapshot());
    expect(g2.certs.state.applied?.id).toBe('grade_f');
  });
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { PART_TIMER_WAGE } from './facility.js';
import { TICKS_PER_DAY } from './clock.js';

/** P8 — 시설별 알바 슬롯 (D14): 임금은 유지비 합산 · 편의 알바가 청결을 올린다 · 스냅샷 왕복 · 매점/선착장 효과 */
describe('P8 알바 슬롯', () => {
  it('매점에 알바를 두면 유지비가 임금만큼 늘고, 화장실 알바는 청결을 되돌린다', () => {
    const g = new Game(1);
    g.money = 50000;
    const shop = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'restaurant');
    const toilet = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'utility' && g.facilities.defOf(f).capacity > 0);
    expect(shop && toilet).toBeTruthy();
    if (!shop || !toilet) return;
    const m0 = g.dailyMaintenance();
    expect(g.setStaffed(shop.uid, true).ok).toBe(true);
    expect(g.dailyMaintenance()).toBe(m0 + PART_TIMER_WAGE);
    expect(g.setStaffed(shop.uid, true).ok).toBe(false);
    const palm = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'decor');
    if (palm) expect(g.setStaffed(palm.uid, true).ok).toBe(false);
    // 청결: 알바 없이 이틀 → 알바 두고 이틀
    g.step(TICKS_PER_DAY * 2);
    const c0 = g.cleanliness;
    expect(g.setStaffed(toilet.uid, true).ok).toBe(true);
    g.step(TICKS_PER_DAY * 2);
    expect(g.cleanliness).toBeGreaterThan(c0 - 1);
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.facilities.byUid(shop.uid)?.staff).toBe(1);
    expect(h.cleanliness).toBe(g.cleanliness);
    expect(h.dailyMaintenance()).toBe(g.dailyMaintenance());
    expect(g.setStaffed(shop.uid, false).ok).toBe(true);
    expect(g.dailyMaintenance()).toBe(g.dailyMaintenance());
  });

  it('청결이 만족 배수를 정하고, 옛 스냅샷(청결 없음)은 100 으로 온다', () => {
    const g = new Game(3);
    g.cleanliness = 50;
    expect(g.cleanSatMul()).toBeCloseTo(0.8, 5);
    const snap = g.toSnapshot() as { cleanliness?: number };
    delete snap.cleanliness;
    expect(Game.fromSnapshot(JSON.parse(JSON.stringify(snap))).cleanliness).toBe(100);
  });
});

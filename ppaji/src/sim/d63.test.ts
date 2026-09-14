import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import defaultBalance from '../data/balance.json';
import { TICKS_PER_DAY } from './clock.js';

/** P45-b D63 — 「지나가며 산다」: 복도 곁 점포는 입장·퇴장 손님이 들른다. 같은 시드 A/B 로 켜고 끈다 */
describe('D63 동선 몰', () => {
  it('킷 실내 매점은 복도 곁(입장·퇴장 집합에 든다) · 하루 뒤 지나가며 산 횟수 > 0 · 끄면 0 · 야외 식당은 실내에 못 놓는다', () => {
    const run = (on: boolean): Game => {
      const b = on ? defaultBalance : { ...defaultBalance, passByEnterMul: 1, passByLeaveChance: 0 };
      const g = new Game(63, b); g.money = 100000;
      const gt = g.gate;
      expect(g.placeFacility('shower_row', gt.i + 1, gt.j + 12, 0).ok).toBe(true); // 복도 오른쪽, 퇴장 점포
      g.step(TICKS_PER_DAY);
      return g;
    };
    const a = run(true), z = run(false);
    const sets = a.passByForTest();
    const shop = a.facilities.all.find((f) => f.defId === 'indoor_shop')!;
    expect(sets.enter).toContain(shop.uid); expect(sets.leave).toContain(shop.uid);
    expect((a.stats.passByEnter ?? 0) + (a.stats.passByLeave ?? 0)).toBeGreaterThan(0);
    expect((z.stats.passByEnter ?? 0) + (z.stats.passByLeave ?? 0)).toBe(0);
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    expect(h.stats.passByEnter).toBe(a.stats.passByEnter);
    const gt = a.gate;
    const bad = a.canPlace('shop', gt.i - 6, gt.j + 10, 0); expect(bad.ok).toBe(false); if (!bad.ok) expect(bad.reason).toContain('야외');
    expect(a.canPlace('indoor_shop', gt.i + 12, gt.j + 30, 0).ok).toBe(false); // 실내 전용은 잔디에 못
  }, 60000);
});

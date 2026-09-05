import { describe, it, expect } from 'vitest';
import { Game } from './game.js';

/** G33 — 요리 레벨이 맛·인기에 소급 · 좋아요가 유입에 더해진다(포화) */
describe('G33', () => {
  it('요리 레벨 배수가 구매 HP·만족에 곱해진다', () => {
    const run = (exp: number): { hp: number; sat: number } => {
      const g = new Game(21, undefined, { kit: false });
      g.grid.levels.fill(0); // 시설 발자국이 커져 입구 옆 테라스에 걸린다 — 이 검사는 경사를 안 본다
      g.money = 100000;
      g.cooking.exp = exp;
      const gt = g.gate;
      g.unlocked.facilities.add('cafe');
      expect(g.placeFacility('cafe', gt.i + 2, gt.j + 4, 0).ok).toBe(true);
      const cafe = g.facilities.all[0]!;
      g.menus.setSlot(cafe.uid, 0, [...g.cooking.known][0]!);
      let seen: { hp: number; sat: number } | null = null;
      for (let n = 0; n < 2500 && !seen; n++) {
        g.step();
        for (const gu of g.guests.all) {
          if (gu.state === 'wander' && !gu.carry) { gu.target = { kind: 'facility', uid: cafe.uid }; gu.state = 'walk'; gu.stateTicks = 0; gu.hp = 50; gu.sat = 0; }
          if (gu.carry && !seen) seen = { hp: gu.hp, sat: gu.sat };
        }
      }
      expect(seen).not.toBeNull();
      return seen!;
    };
    const lv1 = run(0);
    const lv10 = run(1_000_000);
    expect(lv10.sat).toBeGreaterThan(lv1.sat);
    expect(lv10.hp).toBeGreaterThanOrEqual(lv1.hp);
  });
  it('좋아요가 유입 목표를 올리되 상한에서 포화한다', () => {
    const g = new Game(22, undefined, { kit: false });
    const t0 = g.dailyTarget();
    const cap = g.b.arrivalLikesCap ?? 0;
    const per = g.b.arrivalPerLike ?? 0;
    expect(cap).toBeGreaterThan(0);
    const base = g.dailyTarget();
    g.sns.totalLikes = 1000;
    const mid = g.dailyTarget();
    g.sns.totalLikes = 1_000_000;
    const top = g.dailyTarget();
    expect(mid).toBeGreaterThan(base);
    expect(top - base).toBeCloseTo(cap * (mid - base) / Math.min(cap, 1000 * per), 3);
    expect(t0).toBeLessThanOrEqual(base);
  });
});

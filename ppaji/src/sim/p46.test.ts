import { describe, it, expect } from 'vitest';
import { Game } from './game.js';

/** P46 D58 — 건물류끼리 야외에서 변이 닿으면 거절 「한 칸 띄우세요」. 자리·장식·놀이·실내는 자유 */
describe('P46 간격 규칙', () => {
  it('야외 화장실 옆에 매점을 붙이면 거절, 한 칸 띄우면 허용 · 평상·꽃은 붙어도 된다 · 실내 락커 열은 붙어도 된다 · 이동도 같은 규칙(자기 자신은 예외)', () => {
    const g = new Game(46); g.money = 200000; g.rank = 1; g.openLand(1); g.tools.add('move');
    for (const id of ['toilet', 'shop', 'pyeongsang_row', 'sunflower', 'locker_row', 'shower_row']) g.unlocked.facilities.add(id);
    const gt = g.gate;
    const t = g.placeFacility('toilet', gt.i - 18, gt.j + 14, 0); expect(t.ok).toBe(true); // 2×2: 30..31 × 22..23 // P48-b3: 본류가 S 라 무리를 서쪽 잔디로 옮겼다
    const bad = g.canPlace('shop', gt.i - 16, gt.j + 14, 0); expect(bad.ok).toBe(false); if (!bad.ok) expect(bad.reason).toContain('한 칸');
    expect(g.canPlace('shop', gt.i - 15, gt.j + 14, 0).ok).toBe(true); // 한 칸 띄움
    expect(g.canPlace('shop', gt.i - 16, gt.j + 16, 0).ok).toBe(true); // 대각선(모서리)만 닿음 — 허용
    expect(g.placeFacility('pyeongsang_row', gt.i - 18, gt.j + 16, 0).ok).toBe(true); // 자리는 붙어도 된다
    expect(g.placeFacility('sunflower', gt.i + 13, gt.j + 14, 0).ok).toBe(true); // 장식도
    const l1 = g.placeFacility('locker_row', gt.i - 8, gt.j + 3, 0); expect(l1.ok).toBe(true);
    expect(g.placeFacility('shower_row', gt.i - 8, gt.j + 4, 0).ok).toBe(true); // 실내 가구는 붙는다
    const s2 = g.placeFacility('shop', gt.i + 20, gt.j + 14, 0); expect(s2.ok).toBe(true);
    g.tools.add('move');
    const mv = g.canMoveFacility(s2.uid!, gt.i - 16, gt.j + 14, 0); expect(mv.ok).toBe(false);
    expect(g.canMoveFacility(t.uid!, gt.i - 18, gt.j + 13, 0).ok).toBe(true); // 한 줄 위로 — 옛 자리(자기 자신)와 겹쳐도 예외(같은 자리 그대로는 「같은 자리」 거절)
  });
});

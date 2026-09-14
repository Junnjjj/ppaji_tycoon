import { describe, it, expect } from 'vitest';
import { Game, DECK_COST } from './game.js';
import { TICKS_PER_DAY } from './clock.js';
import { landRect, gateTile, FLOOR } from './grid.js';
import { makeTestPpaji } from './test-helpers.js';

const sq = (i: number, j: number, n = 2) => {
  const out: { i: number; j: number }[] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) out.push({ i: i + a, j: j + b });
  return out;
};

describe('Game — 풀 파기 · 손님 · 하루', () => {
  it('토지 안 잔디에는 풀을 못 판다(D59) · 강에 데크 링을 두르면 안 물이 풀 하나, 돈은 링 물 칸 × 데크값', () => {
    // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로. 옛 「잔디 2×2 = 400G」 는 이제 거절 사유가 정답이다
    const g = new Game(42, undefined, { kit: false });
    const l = landRect(0);
    const land = sq(l.i0 + 4, l.j0 + 4);
    for (const t of land) expect(g.grid.at(t.i, t.j)).toBe(FLOOR.grass);
    const refused = g.digPool(land);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain('뭍에는 풀을 파지 않습니다');
    expect(g.pools.all.length).toBe(0);
    expect(g.money).toBe(12000);
    const pp = makeTestPpaji(g);
    expect(pp.id).not.toBeNull();
    expect(g.pools.all.length).toBe(1);
    for (const t of pp.ring) expect(g.grid.at(t.i, t.j)).toBe(FLOOR.deck);
    expect(g.money).toBe(12000 - pp.ring.length * DECK_COST); // 링은 전부 물 위 → 칸마다 데크값. 데크는 길을 자동으로 안 잇는다
    expect(g.poolState(pp.id!)).toMatchObject({ size: pp.tiles.length });
  });
  it('거절 — 토지 밖 · 입구 · 뭍 · 이미 수역 · 돈 부족은 아무것도 안 바꾼다', () => {
    const g = new Game(42, undefined, { kit: false });
    expect(g.digPool([{ i: 0, j: 0 }]).ok).toBe(false);
    const gate = gateTile(0);
    expect(g.digPool([gate]).ok).toBe(false);
    const l = landRect(0);
    expect(g.digPool(sq(l.i0 + 4, l.j0 + 4)).ok).toBe(false); // P49-b D59: 뭍 풀 금지
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    const before = g.toSnapshot();
    expect(g.grid.at(pp.tiles[0]!.i, pp.tiles[0]!.j)).toBe(FLOOR.pool);
    expect(g.digPool([pp.tiles[0]!]).ok).toBe(false); // 이미 수역 (⚠ canDig 는 pool 칸을 물로 안 세어 「내 땅이 아닙니다」 를 먼저 낸다 — 거절만 잰다)
    // 돈 부족 — 링 오른쪽의 트인 여울(내 앞 수면) 한 칸: 사유가 돈이어야 뭍·소유 거절과 구분된다
    const open = { i: Math.max(...pp.ring.map((t) => t.i)) + 2, j: pp.ring[0]!.j + 1 };
    expect(g.grid.at(open.i, open.j)).toBe(FLOOR.shallow);
    g.money = 50;
    const poor = g.digPool([open]);
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reason).toContain('돈이 부족');
    g.money = before.money;
    expect(g.toSnapshot()).toEqual(before);
  });
  it('하루를 돌리면 손님이 오고 입장료가 들어오고 마감 요약이 인박스에 쌓인다', () => {
    const g = new Game(7, undefined, { kit: false });
    makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    g.step(TICKS_PER_DAY);
    expect(g.day).toBe(1);
    expect(g.tick).toBe(0);
    expect(g.stats.visitors).toBeGreaterThan(0);
    expect(g.stats.days.length).toBe(1);
    expect(g.stats.days[0]!.tickets).toBe(g.stats.visitors * 200);
    expect(g.stats.days[0]!.maintenance).toBeGreaterThan(0);
    expect(g.guests.count).toBe(0); // 폐장 flush
    expect(g.inbox.all.some((e) => e.kind === 'day-summary')).toBe(true);
  });
  it('손님이 실제로 수영한다', () => {
    const g = new Game(7, undefined, { kit: false });
    makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    let swam = 0;
    for (let k = 0; k < 400; k++) {
      g.step(1);
      for (const fx of g.drainFx()) if (fx.kind === 'splash') swam++;
    }
    expect(swam).toBeGreaterThan(0);
  });
  it('결정론 — 같은 시드 같은 조작이면 스냅샷이 같다', () => {
    const run = () => {
      const g = new Game(99, undefined, { kit: false });
      makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
      g.step(900);
      g.drainFx();
      g.drainEvents();
      return g.toSnapshot();
    };
    expect(run()).toEqual(run());
  });
  it('스냅샷 왕복 뒤 이어 돌려도 같다', () => {
    const g = new Game(5, undefined, { kit: false });
    makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    g.step(300);
    const s = JSON.parse(JSON.stringify(g.toSnapshot()));
    const g2 = Game.fromSnapshot(s);
    expect(g2.toSnapshot()).toEqual(g.toSnapshot());
    g.step(200);
    g2.step(200);
    g.drainFx(); g2.drainFx(); g.drainEvents(); g2.drainEvents();
    expect(g2.toSnapshot()).toEqual(g.toSnapshot());
  });
});

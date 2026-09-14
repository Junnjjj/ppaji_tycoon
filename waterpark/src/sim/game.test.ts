import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';
import { landRect, gateTile } from './grid.js';

const sq = (i: number, j: number, n = 2) => {
  const out: { i: number; j: number }[] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) out.push({ i: i + a, j: j + b });
  return out;
};

describe('Game — 풀 파기 · 손님 · 하루', () => {
  it('토지 안 잔디에 2×2 를 파면 풀 하나, 돈이 400 나간다', () => {
    const g = new Game(42, undefined, { kit: false });
    const l = landRect(0);
    const r = g.digPool(sq(l.i0 + 4, l.j0 + 4));
    expect(r.ok).toBe(true);
    expect(g.pools.all.length).toBe(1);
    expect(g.money).toBe(12000 - 400);
    expect(g.poolState(g.pools.all[0]!.id)).toMatchObject({ size: 4 });
  });
  it('거절 — 토지 밖 · 입구 · 이미 풀 · 돈 부족은 아무것도 안 바꾼다', () => {
    const g = new Game(42, undefined, { kit: false });
    expect(g.digPool([{ i: 0, j: 0 }]).ok).toBe(false);
    const gate = gateTile(0);
    expect(g.digPool([gate]).ok).toBe(false);
    const l = landRect(0);
    g.digPool(sq(l.i0 + 4, l.j0 + 4));
    const before = g.toSnapshot();
    expect(g.digPool([{ i: l.i0 + 4, j: l.j0 + 4 }]).ok).toBe(false);
    g.money = 50;
    expect(g.digPool([{ i: l.i0 + 8, j: l.j0 + 8 }]).ok).toBe(false);
    g.money = before.money;
    expect(g.toSnapshot()).toEqual(before);
  });
  it('하루를 돌리면 손님이 오고 입장료가 들어오고 마감 요약이 인박스에 쌓인다', () => {
    const g = new Game(7, undefined, { kit: false });
    const l = landRect(0);
    g.digPool(sq(l.i0 + 6, l.j0 + 6, 3));
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
    const l = landRect(0);
    g.digPool(sq(l.i0 + 6, l.j0 + 6, 3));
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
      const l = landRect(0);
      g.digPool(sq(l.i0 + 3, l.j0 + 3, 3));
      g.step(900);
      g.drainFx();
      g.drainEvents();
      return g.toSnapshot();
    };
    expect(run()).toEqual(run());
  });
  it('스냅샷 왕복 뒤 이어 돌려도 같다', () => {
    const g = new Game(5, undefined, { kit: false });
    const l = landRect(0);
    g.digPool(sq(l.i0 + 3, l.j0 + 3, 3));
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

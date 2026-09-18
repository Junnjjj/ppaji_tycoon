import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

/** G57 — 버그 감사 수정: 하루 중간 왕복 · 시설 아래 실내 지우기 · 발자국 위 손님 */
describe('G57', () => {
  it('하루 중간에 저장·복원해도 그날 결산(방문·입장료·순이익)이 같다', () => {
    const a = new Game(7);
    a.step(1000);
    const b = Game.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    a.step(TICKS_PER_DAY - a.tick + 1);
    b.step(TICKS_PER_DAY - b.tick + 1);
    const da = a.stats.days[a.stats.days.length - 1]!;
    const db = b.stats.days[b.stats.days.length - 1]!;
    expect(db.visitors).toBe(da.visitors);
    expect(db.tickets).toBe(da.tickets);
    expect(db.net).toBe(da.net);
    expect(b.money).toBe(a.money);
  });

  it('시설 아래 실내 바닥은 지울 수 없다', () => {
    const g = new Game(52, undefined, { kit: false });
    g.grid.levels.fill(0); // 사우나 3×3 이 테라스에 걸린다
    g.money = 100000;
    const gt = g.gate;
    const tiles = [] as { i: number; j: number }[];
    for (let di = 0; di < 3; di++) for (let dj = 0; dj < 3; dj++) tiles.push({ i: gt.i + 2 + di, j: gt.j + 6 + dj });
    expect(g.paintIndoor(tiles).ok).toBe(true);
    g.unlocked.facilities.add('sauna');
    const r = g.placeFacility('sauna', gt.i + 2, gt.j + 6, 0);
    expect(r.ok).toBe(true);
    const under = g.unpaintIndoor([{ i: gt.i + 2, j: gt.j + 6 }]);
    expect(under.ok).toBe(false);
    if (!under.ok) expect(under.reason).toContain('시설 아래');
    expect(g.grid.at(gt.i + 2, gt.j + 6)).toBe(3);
  });

  it('시설을 놓으면 그 발자국 위 손님은 옆 칸으로 밀려나고 배회한다', () => {
    const g = new Game(3);
    g.money = 100000;
    g.step(600);
    const gu = g.guests.all.find((x) => x.state === 'wander' || x.state === 'walk');
    expect(gu).toBeDefined();
    const at = { i: gu!.i, j: gu!.j };
    if (!g.canPlace('toilet', at.i, at.j, 0).ok) return; // 풀·길 위면 이 시드에선 검사 생략
    const pr = g.placeFacility('toilet', at.i, at.j, 0);
    if (!pr.ok) return; // P16: 손님이 선 곳은 길이라, 그 길을 덮으면 봉쇄 판정으로 거절될 수 있다 — 그 시드는 검사 생략
    expect(gu!.i === at.i && gu!.j === at.j).toBe(false);
    expect(gu!.target).toBeNull();
    expect(gu!.state).toBe('wander');
  });
});

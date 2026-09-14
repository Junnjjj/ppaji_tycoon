import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

/** G40 버스 — 캠페인 버스 2일 × 12명 · 좋아요 사다리 버스 · 안 본 글 배지 · 스냅샷 왕복 */
function fresh(seed = 21): Game {
  const g = new Game(seed, undefined, { kit: false });
  g.money = 200000;
  const gt = g.gate;
  g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]); // P48-a 허용목록: 풀 좌표를 아래서 다시 읽는다 — P49-b 에서 물로
  return g;
}

describe('G40 버스 송영', () => {
  it('지역을 골라 시작하면 2일간 매일 아침 버스 한 대 — 좌석 12 만큼 손님이 더 온다', () => {
    const g = fresh();
    expect(g.campaign('bus').ok).toBe(false); // 지역 없이 못 시작
    const area = g.sns.areas[0]!;
    expect(g.campaign('bus', area).ok).toBe(true);
    const before = g.stats.visitors;
    // 오늘은 이미 개장했으므로 내일부터 — 오늘 남은 tick + 이틀
    g.step(TICKS_PER_DAY - g.tick);
    g.step(TICKS_PER_DAY * 2);
    expect(g.stats.busGuests).toBe(24);
    expect(g.stats.visitors - before).toBeGreaterThanOrEqual(24);
    expect(g.busState).toBeNull();
  });

  it('지역 좋아요가 사다리를 넘기면 다음날 아침 버스 1대 + 주민 선물, 같은 문턱은 두 번 안 온다', () => {
    const g = fresh(22);
    const area = g.sns.areas[0]!;
    g.sns.addBonusLikes(720); // 350·700 두 문턱을 한 번에
    g.step(TICKS_PER_DAY - g.tick); // 폐장 → 큐
    expect(g.busesPlannedFor(area)).toBe(0); // 오늘 아침 것은 이미 옮겨졌다
    expect(g.busesLeftToday()).toBe(2);
    const b0 = g.stats.busGuests ?? 0;
    g.step(TICKS_PER_DAY);
    expect((g.stats.busGuests ?? 0) - b0).toBe(24);
    expect(g.inbox.all.some((e) => e.title.includes('좋아요 350 돌파'))).toBe(true);
    g.step(TICKS_PER_DAY);
    expect((g.stats.busGuests ?? 0) - b0).toBe(24); // 더 안 온다
  });

  it('스냅샷 왕복 — 내일 버스 큐와 도로 위 버스가 보존된다', () => {
    const g = fresh(23);
    g.sns.addBonusLikes(360);
    g.step(TICKS_PER_DAY - g.tick);
    g.step(70); // 08:30 — 버스가 들어오는 중
    expect(g.busState).not.toBeNull();
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.busState).toEqual(g.busState);
    g.step(200); h.step(200);
    expect(h.stats.busGuests).toBe(g.stats.busGuests);
  });

  it('SNS 배지 = 안 본 글 수, 타임라인을 보면 0', () => {
    const g = fresh(24);
    expect(g.sns.unseenPosts).toBe(0);
    g.step(TICKS_PER_DAY);
    const n = g.sns.allPosts.length;
    expect(g.sns.unseenPosts).toBe(n);
    g.sns.markPostsSeen();
    expect(g.sns.unseenPosts).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot, BOT_PERSONAS } from './bot.js';
import { dockCandidates, firstFreeDock, PIER_CLAIM_RADIUS, type PlacedCourse } from './course/course.js';
import { FLOOR, shoreRow } from './grid.js';

/** P20 — 봇의 둘째 코스: 데크 링이 이어져도 선착장 claim 은 3칸까지 · 선착장은 트인 강 옆 · 빈 선착장을 전부 시도 */
describe('P20 코스 축(봇 계측기 수리)', () => {
  it('이어진 데크 위 선착장 둘은 서로 다른 claim 이고, 한쪽에 코스가 있어도 다른 쪽은 빈 선착장이다', () => {
    const decks = Array.from({ length: 30 }, (_, k) => ({ x: 10 + k, y: 20 })); // 한 줄로 이어진 데크 30칸
    const anchors = [{ x: 12, y: 21 }, { x: 36, y: 21 }];
    const docks = dockCandidates(decks, { x: 24, y: 0 }, anchors);
    expect(docks.length).toBe(2);
    for (const d of docks) expect((d.claim ?? []).length).toBeLessThanOrEqual(1 + (2 * PIER_CLAIM_RADIUS + 1));
    const taken = [{ dock: { x: 12, y: 21 } } as unknown as PlacedCourse];
    expect(firstFreeDock(docks, taken)).toBe(1);
  });

  it('isOpenWater — 부표 안 물(pool)은 아니고, 허가 안 트인 강은 맞다', () => {
    const g = new Game(20);
    const gt = g.gate;
    const pool = g.pools.all[0]!;
    const k = pool.tiles[0]!;
    expect(g.grid.at(k % g.grid.w, Math.floor(k / g.grid.w))).toBe(FLOOR.pool);
    expect(g.isOpenWater(k % g.grid.w, Math.floor(k / g.grid.w))).toBe(false);
    expect(g.isOpenWater(gt.i + 10, shoreRow(gt.i + 10) + 5)).toBe(true); // 킷 선착장 아래 트인 강 (P48-b3)
    expect(g.isOpenWater(gt.i - 10, gt.j + 13)).toBe(false); // 뭍
  });

  it('봇 128일 — 코스 2 이상 · 선착장 ≤ 코스 + 2 (전: 8시드 전부 코스 1 · 선착장 3~4)', () => {
    const g = new Game(1);
    runBot(g, 128, BOT_PERSONAS.balanced);
    expect(g.courses.count).toBeGreaterThanOrEqual(2);
    expect(g.facilities.all.filter((f) => f.defId === 'dock').length).toBeLessThanOrEqual(g.courses.count + 2);
  }, 120000); // 128일 봇 — 혼자 44초, 병렬 워커·다른 프로세스 아래 60초를 넘긴다(2026-09-13 실측, 전 30.0초)
});

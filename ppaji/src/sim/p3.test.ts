import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot } from './bot.js';
import { FLOOR, isWaterCode } from './grid.js';

/** P3 — 봇 데크 다리 (물빛/분위기 낱말 절은 P60-a 에서 삭제) */
describe('P3', () => {
  it('봇은 128일 동안 수역을 넓히고(≥40칸) 데크를 늘린다 — P14 뒤 건너편 둑·다리는 없다', () => {
    const g = new Game(3);
    runBot(g, 128);
    let deck = 0;
    for (let k = 0; k < g.grid.floor.length; k++) if (g.grid.floor[k] === FLOOR.deck) deck++;
    expect(g.rank).toBeGreaterThanOrEqual(2);
    expect(deck).toBeGreaterThanOrEqual(8);
    expect(g.pools.totalTiles()).toBeGreaterThanOrEqual(40);
    expect(g.facilities.all.every((f) => !isWaterCode(g.grid.naturalAt(f.i, f.j)) || g.grid.at(f.i, f.j) === FLOOR.deck || (g.facilities.defOf(f).class === 'rig' && g.grid.at(f.i, f.j) === FLOOR.pool))).toBe(true); // 시설은 뭍 아니면 데크 위 (P48-b3: 자연 바닥으로) · P50-a: 물 위 기구만 빠지 안 물 위
    expect(g.facilities.all.some((f) => g.facilities.defOf(f).class === 'rig' && g.grid.at(f.i, f.j) === FLOOR.pool)).toBe(true); // P50-a: 봇이 물 위 기구를 실제로 놓는다
  }, 60000);
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot } from './bot.js';
import { FLOOR, RIVER } from './grid.js';
import { COLOR_KO, SCENT_KO } from './lines.js';

/** P3 — 봇 데크 다리 · 물빛/분위기 낱말 */
describe('P3', () => {
  it('봇은 128일 동안 수역을 넓히고(≥40칸) 데크를 늘린다 — P14 뒤 건너편 둑·다리는 없다', () => {
    const g = new Game(3);
    runBot(g, 128);
    let deck = 0;
    for (let k = 0; k < g.grid.floor.length; k++) if (g.grid.floor[k] === FLOOR.deck) deck++;
    expect(g.rank).toBeGreaterThanOrEqual(2);
    expect(deck).toBeGreaterThanOrEqual(8);
    expect(g.pools.totalTiles()).toBeGreaterThanOrEqual(40);
    expect(g.facilities.all.every((f) => f.j < RIVER.j0 || g.grid.at(f.i, f.j) === FLOOR.deck)).toBe(true); // 시설은 뭍 아니면 데크 위
  }, 60000);

  it('물빛·분위기 낱말은 색 11 · 향 12 를 전부 덮고 한 곳에서 온다', () => {
    for (const c of ['orange', 'yellow', 'lime', 'green', 'blue', 'purple', 'pink', 'red', 'white', 'rainbow', 'clear']) expect(COLOR_KO[c]).toBeTruthy();
    for (const s of ['citrus', 'floral', 'pine', 'fruity', 'tropical', 'berry', 'marine', 'cookie', 'spices', 'milky', 'coffee', 'money']) expect(SCENT_KO[s]).toBeTruthy();
    expect(COLOR_KO['pink']).toContain('핑크');
    expect(COLOR_KO['clear']).toBe('맑음');
  });
});

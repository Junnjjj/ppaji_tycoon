import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Grid, FLOOR } from '../sim/grid.js';
import { Game } from '../sim/game.js';
import { SAVE_VERSION, MIGRATIONS, migrate } from './save.js';

/** P48-b1 — 세이브 v4 · 성능 벤치 (sim/ 밖: 불변식 1·2 의 lint 가 sim 검사에서 save import 와 performance.now 를 막는다) */
describe('P48-b1 세이브 v4 · 벤치', () => {
  it('세이브 v5(P60-a 뒤) — MIGRATIONS.length === SAVE_VERSION−1 · v3 세이브는 새 판(null) · v4 fixture 스냅샷 로드 · 킷 출입동 20×13(실내 247 · 복도 12 · 마당 문 (48,20))', () => {
    expect(SAVE_VERSION).toBe(5); expect(MIGRATIONS.length).toBe(SAVE_VERSION - 1);
    expect(migrate({ version: 3, savedAt: 'x', game: { grid: { w: 96, h: 72 } } })).toBeNull();
    const fx = JSON.parse(readFileSync(new URL('../save/__fixtures__/v4-p48b.json', import.meta.url), 'utf8')) as Parameters<typeof Game.fromSnapshot>[0];
    const h = Game.fromSnapshot(fx); expect(h.toSnapshot().grid.natural).toEqual(fx.grid.natural);
    const game = new Game(1); let indoor = 0, hall = 0; for (let j = 0; j < game.grid.h; j++) for (let i = 0; i < game.grid.w; i++) { const c = game.grid.at(i, j); if (c === FLOOR.indoor) indoor++; if (c === FLOOR.hall) hall++; }
    expect(indoor).toBe(247); expect(hall).toBe(12);
    expect(game.grid.doors().some((d) => d.i === 48 && d.j === 20 && d.oi === 48 && d.oj === 21)).toBe(true);
  });
  it('성능 — carveBend ≤1.0ms · newPark ≤2.0ms (dev 실측 0.19 · 1.18, 폰 ×5 예산 안)', () => {
    // 최선값(best-of-N) — vitest 가 파일을 병렬로 돌려 평균은 부하에 끌린다. 문턱은 §3.10(폰 ×5 예산)
    let np = Infinity, cb = Infinity;
    for (let k = 0; k < 10; k++) { const t0 = performance.now(); Grid.newPark(0); np = Math.min(np, performance.now() - t0); }
    const gg = Grid.newPark(0);
    for (let k = 0; k < 10; k++) { const t1 = performance.now(); Grid.carveBend(gg); cb = Math.min(cb, performance.now() - t1); }
    expect(cb).toBeLessThanOrEqual(1.0); expect(np).toBeLessThanOrEqual(2.0);
  });
});

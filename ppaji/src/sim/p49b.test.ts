import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Game, DECK_COST } from './game.js';
import { Grid, FLOOR, shoreRow } from './grid.js';
import { PoolStore } from './pool.js';

/** P49-b 사각형 붓 — 물가(열마다 다르다)에 윗줄을 얹은 바깥 사각형. `top` = 여섯 열 물가 중 가장 아래 행 */
const rectAt = (c: number, w = 6, h = 7): { i0: number; j0: number; w: number; h: number } => { let top = 0; for (let x = c; x < c + w; x++) top = Math.max(top, shoreRow(x)); return { i0: c, j0: top - 1, w, h }; };
const why = (r: { ok: boolean; reason?: string }): string => (r.ok ? '' : r.reason ?? '');
const fresh = (rank = 0): Game => { const g = new Game(1); g.money = 1_000_000; g.rank = rank; return g; };

describe('P49-b 빠지 = 사각형 붓 · 라인 조각 · 뭍 풀 삭제', () => {
  it('canMakePpaji — 거절 아홉 가지가 각각 한 번씩 그 문장으로 난다 (크기 · 격자 밖 · 내 수면 · 링 바닥 · 안 뭍 · 시설 · 이어서 · 허가 · 돈)', () => {
    const g = fresh(0);
    const A = rectAt(41);
    expect(why(g.canMakePpaji({ ...A, w: 5, h: 6 }))).toContain('안쪽이 너무 작습니다 — 최소 4×5(20칸)');
    expect(why(g.canMakePpaji({ i0: -1, j0: A.j0, w: 6, h: 7 }))).toBe('격자 밖입니다');
    expect(why(g.canMakePpaji({ ...A, j0: A.j0 + 12 }))).toBe('내 앞 수면이 아닙니다 — 랭크를 올리면 넓어집니다'); // 물가에서 허가 깊이(★0 7) 밖
    expect(why(g.canMakePpaji({ i0: g.land.i0 - 10, j0: g.gate.j + 14, w: 6, h: 7 }))).toMatch(/^링 칸에 놓을 수 없는 바닥입니다 — \(\d+,\d+\)$/); // 내 땅 밖 잔디
    expect(why(g.canMakePpaji({ i0: g.land.i0 + 2, j0: g.gate.j + 14, w: 6, h: 7 }))).toBe('안에 뭍이 있습니다 — 빠지 안은 물이어야 합니다'); // 마당 잔디
    expect(why(g.canMakePpaji(rectAt(56)))).toBe('먼저 철거하세요 — 선착장'); // 본류 잔교 끝 선착장이 안에 든다
    const floating = { i0: 43, j0: rectAt(43).j0 + 2, w: 6, h: 7 }; // 물가에서 두 줄 떨어진 사각형 — 뭍·데크에 안 닿는다(★4 허가 깊이 19 라 「내 수면」은 통과)
    expect(why(fresh(4).canMakePpaji(floating))).toBe('뭍이나 데크에 이어서 두르세요');
    expect(g.makePpaji(A).ok).toBe(true); // 킷 20 + 20 = ★0 허가 40 을 다 쓴다
    expect(why(g.canMakePpaji(rectAt(58)))).toBe('수면 허가를 넘습니다 — 남은 0칸에 20칸 · 랭크를 올리면 90칸까지');
    const poor = fresh(0); poor.money = 100;
    expect(why(poor.makePpaji(A))).toBe('돈이 부족합니다 — 1,200G 필요');
    expect(readFileSync(join(process.cwd(), 'src/sim/game.ts'), 'utf8')).toContain("reason: '손님 길이 막힙니다 — 입구에서 닿지 않는 곳이 생깁니다'"); // breaksAccess 분기 — 기하로 만들기 어려워 문장만 고정
  });

  it('makePpaji — 물 위 링만 값을 낸다(둑 0G · 데크 0G), 안쪽 데크는 자연 바닥으로 돌아가고, 겹치는 사각형은 수역을 합친다', () => {
    const g = fresh(4);
    const A = rectAt(41);
    const m0 = g.money, rev0 = g.grid.rev;
    const rA = g.makePpaji(A);
    expect(rA).toEqual({ ok: true, cost: 20 * DECK_COST });
    expect(m0 - g.money).toBe(20 * DECK_COST);
    expect(g.grid.rev).toBeGreaterThan(rev0);
    const pa = g.pools.at(A.i0 + 1, A.j0 + 1); expect(pa?.tiles.length).toBe(20);
    expect(g.grid.at(A.i0 + 5, A.j0 + 2)).toBe(FLOOR.deck); // 동쪽 링
    // 같은 자리를 다시 두르면 0G · 새 수역 0 (봇은 이것을 건너뛴다)
    expect(g.canMakePpaji(A)).toEqual({ ok: true, cost: 0, enclose: 0, ringWater: 0 });
    // A 를 품는 12칸 폭 사각형 — A 의 동쪽 링(열 46)·킷 서쪽 링(열 50)이 안쪽이 되어 물로 돌아가고, 킷 수역은 열 52 링에 잘려 둘로
    const F = rectAt(41, 12, 7);
    const c = g.canMakePpaji(F); expect(c.ok).toBe(true); expect(c.ringWater).toBe(15); expect(c.enclose).toBe(20);
    const rF = g.makePpaji(F); expect(rF.ok).toBe(true);
    expect(g.grid.at(46, A.j0 + 2)).not.toBe(FLOOR.deck); expect(g.grid.at(50, A.j0 + 2)).not.toBe(FLOOR.deck);
    const big = g.pools.at(A.i0 + 1, A.j0 + 1); expect(big?.tiles.length).toBe(50);
    expect(g.pools.all.map((p) => p.tiles.length).sort((a, b) => a - b)).toEqual([10, 50]);
    expect(g.pools.ownerIdAt(46, A.j0 + 2)).toBe(big!.id);
  });

  it('PoolStore.recompute — 두 수역 사이 벽을 걷으면 합쳐지고 {keptId, keptName, goneNames} 로 말한다 · state() 는 없다', () => {
    const g = new Grid(30, 30); for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) g.set(i, j, FLOOR.grass);
    const ps = new PoolStore(g);
    const box = (i0: number, i1: number) => { for (let j = 10; j <= 16; j++) for (let i = i0; i <= i1; i++) g.set(i, j, i === i0 || i === i1 || j === 10 || j === 16 ? FLOOR.deck : FLOOR.pool); };
    box(5, 10); box(10, 15);
    expect(ps.recompute()).toEqual([]);
    expect(ps.all.length).toBe(2);
    const left = ps.at(6, 11)!, right = ps.at(14, 11)!; left.name = '왼쪽';
    for (let j = 11; j <= 15; j++) g.set(10, j, FLOOR.pool);
    const merges = ps.recompute();
    expect(ps.all.length).toBe(1);
    expect(merges.length).toBe(1);
    const kept = ps.all[0]!;
    expect(merges[0]!.keptId).toBe(kept.id);
    expect([left.id, right.id]).toContain(kept.id);
    expect(merges[0]!.goneNames.length).toBe(1);
    expect(ps.ownerIdAt(10, 12)).toBe(kept.id);
    expect(ps.ownerIdAt(0, 0)).toBe(-1);
    expect((ps as unknown as { state?: unknown }).state).toBeUndefined();
  });

  it('라인 조각 — 1×2·4·6 만, 회전은 세로, 뭍·데크에 이어서, 값은 칸 × 데크값', () => {
    const g = fresh(4);
    const A = rectAt(41); expect(g.makePpaji(A).ok).toBe(true);
    const below = A.j0 + A.h; // 링 아랫줄 바로 아래 물
    expect(why(g.canPlaceLine(3, A.i0 + 1, below, 0))).toBe('라인은 2·4·6칸만 있습니다');
    expect(g.lineTiles(4, 10, 20, 0)).toEqual([{ i: 10, j: 20 }, { i: 11, j: 20 }, { i: 12, j: 20 }, { i: 13, j: 20 }]);
    expect(g.lineTiles(2, 10, 20, 1)).toEqual([{ i: 10, j: 20 }, { i: 10, j: 21 }]);
    expect(why(g.canPlaceLine(4, A.i0 + 1, below + 3, 0))).toBe('뭍이나 데크에 이어서 깔아야 합니다');
    const c = g.canPlaceLine(4, A.i0 + 1, below, 0); expect(c).toEqual({ ok: true, cost: 4 * DECK_COST });
    const m = g.money; expect(g.placeLine(4, A.i0 + 1, below, 0).ok).toBe(true); expect(m - g.money).toBe(4 * DECK_COST);
    for (let a = 0; a < 4; a++) expect(g.grid.at(A.i0 + 1 + a, below)).toBe(FLOOR.deck);
    expect(g.placeLine(6, A.i0 + 1, below + 1, 1).ok).toBe(true); // 세로 6 — 가로 라인에 이어서
    for (let b = 0; b < 6; b++) expect(g.grid.at(A.i0 + 1, below + 1 + b)).toBe(FLOOR.deck);
    expect(why(g.canPlaceLine(2, A.i0 + 1, below, 0))).toBe('이미 데크입니다');
  });

  it('D59 — 뭍(잔디·길)에는 풀을 파지 않는다 · 강 위 직접 파기는 남는다 · production 에서 digPool 을 부르는 곳은 0(game 정의 · 검사 헬퍼뿐, 봇·UI 0)', () => {
    const g = fresh(0);
    expect(why(g.canDig(g.land.i0 + 3, g.gate.j + 15))).toBe('뭍에는 풀을 파지 않습니다 — 빠지는 물 위에 데크로 두르세요');
    expect(g.canDig(45, shoreRow(45)).ok).toBe(true);
    const files: string[] = [];
    const walk = (d: string): void => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts')) files.push(p); } };
    walk(join(process.cwd(), 'src'));
    const callers = files.filter((p) => /\bdigPool\(/.test(readFileSync(p, 'utf8'))).map((p) => p.slice(p.indexOf('src/'))).sort();
    expect(callers).toEqual(['src/sim/game.ts', 'src/sim/test-helpers.ts']); // UI 치기 탭 분기도 지웠다(P15 부터 숨김) — API·하네스 원시로만 남는다
  });

  it('wouldEnclose 는 쓰기 0 (grid.rev 불변) · 한 번에 0.6ms 아래', () => {
    const g = fresh(0);
    const rev = g.grid.rev;
    const edit = [{ i: 44, j: rectAt(44).j0 + 8, code: FLOOR.deck }];
    for (let k = 0; k < 5; k++) g.wouldEnclose(edit);
    const t0 = process.hrtime.bigint(); // 불변식 2 는 sim 코드의 시계를 막는다 — 검사의 재는 자는 hrtime
    for (let k = 0; k < 50; k++) g.wouldEnclose(edit);
    const per = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
    expect(g.grid.rev).toBe(rev);
    expect(per).toBeLessThan(0.6 * 4); // CI 여유 ×4 (실측 0.39ms)
  });
});

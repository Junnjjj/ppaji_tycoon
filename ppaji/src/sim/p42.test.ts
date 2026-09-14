import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { kitIndoorRect } from './startkit.js';

/** P42 D53 → P45-a — 「입구」 시설(0G, ★1): 건물 바닥 가장자리 칸에 두면 그 변이 문이 된다. 복도 출구 문(D63)에 더해진다 */
describe('P42 입구', () => {
  it('킷 출입동의 파생 문은 복도 양 끝(정문 변·마당 변) · 서쪽 가장자리에 입구를 두면 문이 하나 더 · 안쪽 칸엔 못 둔다 · 걷으면 둘로 돌아간다', () => {
    const g = new Game(42); g.money = 100000; g.openLand(1); g.unlocked.facilities.add('entrance'); // ★1 랭크 업이 준다(사장 대사) — 검사는 직접 연다
    const gt = g.gate; const room = kitIndoorRect(gt);
    const main = { i: gt.i, j: gt.j + 1, oi: gt.i, oj: gt.j };
    const yard = { i: gt.i, j: room.j0 + room.h - 1, oi: gt.i, oj: room.j0 + room.h };
    expect(g.grid.doors()).toContainEqual(main); expect(g.grid.doors()).toContainEqual(yard); expect(g.grid.doors().length).toBe(2);
    const inner = g.canPlace('entrance', room.i0 + 5, room.j0 + 4, 0); expect(inner.ok).toBe(false); if (!inner.ok) expect(inner.reason).toContain('가장자리');
    const ei = room.i0, ej = room.j0 + 6; // 서쪽 가장자리
    const r = g.placeFacility('entrance', ei, ej, 0); expect(r.ok).toBe(true);
    const d = g.grid.doors().find((x) => x.i === ei && x.j === ej)!;
    expect(d).toBeTruthy(); expect(d.oi === ei - 1 || d.oj === ej + 1).toBe(true);
    expect(g.grid.doors().length).toBe(3); // 복도 출구 둘 + 입구
    expect(g.grid.wallBetween(d.i, d.j, d.oi, d.oj)).toBe(false);
    for (const id of ['indoor_shop', 'toilet']) expect(g.facilityHasPath(g.facilities.all.find((x) => x.defId === id)!.uid)).toBe(true);
    expect(g.removeFacility(r.uid!).ok).toBe(true);
    expect(g.grid.doors().length).toBe(2); // 입구를 걷으면 복도 출구 둘로
  });
});

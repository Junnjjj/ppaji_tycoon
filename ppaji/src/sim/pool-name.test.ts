import { describe, it, expect } from 'vitest';
import { Game } from './game.js';

/** G47 — 풀 이름 · 예고 태그 */
describe('G47 풀 이름', () => {
  it('12자까지 붙이고, 스냅샷·병합을 살아남고, 비우면 기본 이름', () => {
    const g = new Game(61, undefined, { kit: false });
    g.money = 100000;
    const gt = g.gate;
    g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }]);
    const id = g.pools.all[0]!.id;
    expect(g.poolName(id)).toBe(`수역 #${id}`);
    expect(g.renamePool(id, ' 시트러스초록풀장입니다정말 ').ok).toBe(true);
    expect(g.poolName(id)).toBe('시트러스초록풀장입니다정말'.slice(0, 12));
    g.digPool([{ i: gt.i - 2, j: gt.j + 5 }]); // 이어 붙여도 이름 유지
    expect(g.poolName(id)).toBe('시트러스초록풀장입니다정말'.slice(0, 12));
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.poolName(id)).toBe(g.poolName(id));
    expect(g.renamePool(id, '   ').ok).toBe(true);
    expect(g.poolName(id)).toBe(`수역 #${id}`);
  });
  it('심사를 신청하면 예고 태그가 「N일 뒤 15시 심사」', () => {
    const g = new Game(62);
    expect(g.eventTag()).toBeNull();
    g.money = 100000;
    g.certs.state.applied = { id: 'grade_f', judgeDay: g.day + 3 };
    expect(g.eventTag()).toBe('3일 뒤 15시 심사');
  });
});

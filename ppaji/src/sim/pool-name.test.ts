import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { makeTestPpaji } from './test-helpers.js';

/** G47 — 풀 이름 · 예고 태그 */
describe('G47 풀 이름', () => {
  it('12자까지 붙이고, 스냅샷·병합을 살아남고, 비우면 기본 이름', () => {
    const g = new Game(61, undefined, { kit: false });
    g.money = 100000;
    const pp = makeTestPpaji(g, 2, 2); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로. 안 물 2×2
    const id = pp.id!;
    expect(g.poolName(id)).toBe(`수역 #${id}`);
    expect(g.renamePool(id, ' 시트러스초록풀장입니다정말 ').ok).toBe(true);
    expect(g.poolName(id)).toBe('시트러스초록풀장입니다정말'.slice(0, 12));
    // 이어 붙여도 이름 유지 — 링을 아래로 넓혀(안 물 2칸이 새 수역이 된다) 사이 벽을 걷으면 둘이 합쳐지고, 타일 겹침이 큰 쪽(원래 수역)이 id·이름을 지킨다
    const { i: a, j: b } = pp.tiles[0]!; // 안 물 좌상단 — 아래 벽은 b+2
    expect(g.paintDeck([{ i: a - 1, j: b + 3 }, { i: a + 2, j: b + 3 }, { i: a - 1, j: b + 4 }, { i: a, j: b + 4 }, { i: a + 1, j: b + 4 }, { i: a + 2, j: b + 4 }]).ok).toBe(true);
    expect(g.pools.all.length).toBe(2);
    expect(g.unpaintDeck([{ i: a, j: b + 2 }, { i: a + 1, j: b + 2 }]).ok).toBe(true);
    expect(g.pools.all.length).toBe(1);
    expect(g.pools.ownerIdAt(a, b + 3)).toBe(id);
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

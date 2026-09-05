import { describe, it, expect } from 'vitest';
import { Game } from './game.js';

/** G52 — 시설 이동(원작 이동 도구)과 아이템 투입 효과 미리보기 */
describe('G52', () => {
  it('이동은 도구가 있어야 하고, 자리만 바꾸며 uid·단계·메뉴를 보존한다 (0G)', () => {
    const g = new Game(52, undefined, { kit: false });
    g.grid.levels.fill(0); // 화장실 2×2 가 테라스에 걸린다 — 이 검사는 이동 규칙만 본다
    g.money = 100000;
    const gt = g.gate;
    const r = g.placeFacility('toilet', gt.i + 2, gt.j + 4, 0);
    expect(r.ok).toBe(true);
    const uid = r.uid!;
    const f = g.facilities.byUid(uid)!;
    f.level = 3;
    // 도구 없음 → 거절
    const denied = g.canMoveFacility(uid, gt.i + 4, gt.j + 4, 0);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toContain('이동 도구');
    g.tools.add('move');
    // 같은 자리 → 거절(canMove 단계, G55), 자기 발자국과 겹치는 한 칸 옆 → 허용 (자기 자신은 겹침이 아니다)
    expect(g.canMoveFacility(uid, gt.i + 2, gt.j + 4, 0).ok).toBe(false);
    expect(g.moveFacility(uid, gt.i + 2, gt.j + 4, 0).ok).toBe(false);
    expect(g.canMoveFacility(uid, gt.i + 3, gt.j + 4, 0).ok).toBe(true);
    const money = g.money;
    expect(g.moveFacility(uid, gt.i + 4, gt.j + 4, 0, { autoPath: false }).ok).toBe(true); // P16: 길 값은 따로 — 이동 자체는 0G
    expect(g.money).toBe(money);
    const moved = g.facilities.byUid(uid)!;
    expect([moved.i, moved.j, moved.level]).toEqual([gt.i + 4, gt.j + 4, 3]);
    expect(g.facilities.at(gt.i + 2, gt.j + 4)).toBeUndefined();
    expect(g.facilities.at(gt.i + 4, gt.j + 4)?.uid).toBe(uid);
    // 옛 자리에 다른 시설을 놓을 수 있다 (occ 가 비었다)
    expect(g.canPlace('toilet', gt.i + 2, gt.j + 4, 0).ok).toBe(true);
    // 다른 시설 위로는 못 옮긴다
    const r2 = g.placeFacility('toilet', gt.i - 3, gt.j + 4, 0);
    expect(r2.ok).toBe(true);
    expect(g.canMoveFacility(uid, gt.i - 3, gt.j + 4, 0).ok).toBe(false);
  });

  it('미리보기는 전후 풀 상태를 함께 주고, 실제 상태는 바꾸지 않는다', () => {
    const g = new Game(7, undefined, { kit: false });
    g.money = 100000;
    const gt = g.gate;
    expect(g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]).ok).toBe(true);
    const p = g.pools.all[0]!;
    const pv = g.previewItem(p.id, 'strawberry')!;
    expect(pv.states.before.color).toBe('clear');
    expect(pv.states.after.color).toBe('pink');
    expect(pv.states.after.scent).toBe('berry');
    expect(pv.states.after.detail.intensityBars).toBeGreaterThan(0);
    expect(g.poolState(p.id)!.color).toBe('clear');
    expect(p.items.length).toBe(0);
    // G55: 4칸 풀은 딸기 1개로 핑크, 12칸 시작 킷 풀은 2개 이상 — 힌트 「핑크까지 N개」의 근거
    expect(g.itemsToColor(p.id, 'strawberry')).toBe(1);
    expect(g.itemsToColor(p.id, 'ice_block')).toBeNull();
    const g2 = new Game(7);
    const big = g2.pools.all[0]!;
    expect(big.tiles.length).toBeGreaterThanOrEqual(12);
    expect(g2.itemsToColor(big.id, 'strawberry')).toBeGreaterThanOrEqual(2);
  });
});

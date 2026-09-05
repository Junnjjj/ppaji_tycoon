import { describe, it, expect } from 'vitest';
import { Game, PATH_COST } from './game.js';
import { FLOOR, landRect } from './grid.js';
import { COMBO_DEFS } from './combos.js';
import { TICKS_PER_DAY } from './clock.js';

/** P16 — 길·뷰·콤보 (D24) */
describe('P16 길', () => {
  it('손님은 길·데크·실내만 걷는다 — 길 없는 시설엔 손님이 안 오고, API 자동 길이 이으면 온다', () => {
    const g = new Game(7, undefined, { kit: false });
    g.money = 100000;
    const l = landRect(0);
    expect(g.guests.walkable(l.i0 + 3, l.j0 + 10)).toBe(false); // 잔디
    expect(g.guests.walkable(g.gate.i, g.gate.j + 3)).toBe(true); // 입구 열 포장
    const far = g.placeFacility('vending_out', l.i0 + 2, l.j0 + 12, 0, { autoPath: false });
    expect(far.ok).toBe(true);
    expect(g.facilityHasPath(far.uid!)).toBe(false);
    const m0 = g.money;
    const paved = g.ensurePath(far.uid!);
    expect(paved).toBeGreaterThan(0);
    expect(g.money).toBe(m0 - paved * PATH_COST);
    expect(g.facilityHasPath(far.uid!)).toBe(true);
    // 길 붓: 잔디에만, 입구 열은 못 걷는다
    expect(g.canPaintPath(l.i0 + 1, l.j0 + 20).ok).toBe(true);
    expect(g.canPaintPath(g.gate.i, g.gate.j + 1).ok).toBe(false); // 이미 길
    expect(g.unpaintPath([{ i: g.gate.i, j: g.gate.j + 1 }]).ok).toBe(false); // 유일한 길 — 끊긴다
    expect(g.paintPath([{ i: l.i0 + 1, j: l.j0 + 20 }]).ok).toBe(true);
    expect(g.grid.at(l.i0 + 1, l.j0 + 20)).toBe(FLOOR.path);
    expect(g.unpaintPath([{ i: l.i0 + 1, j: l.j0 + 20 }]).ok).toBe(true);
  });

  it('시작 킷은 시설 7 전부 길이 닿고 하루 안에 손님이 시설을 쓴다', () => {
    const g = new Game(1);
    for (const f of g.facilities.all) expect(g.facilityHasPath(f.uid), f.defId).toBe(true);
    g.step(Math.floor(TICKS_PER_DAY * 0.7));
    expect(g.facilities.all.reduce((n, f) => n + f.usesToday, 0)).toBeGreaterThan(0);
  });
});

describe('P16 뷰', () => {
  it('물가에 붙은 평상은 뷰가 있고 인기가 오르며, 멀리 있는 평상은 0 이다', () => {
    const g = new Game(2, undefined, { kit: false });
    g.money = 100000;
    const l = landRect(0);
    const near = g.placeFacility('pyeongsang_row', l.i0 + 2, l.j0 + l.h - 3, 0); // 정면 앞이 물가 보도 → 그 아래 여울
    const far = g.placeFacility('pyeongsang_row', l.i0 + 2, l.j0 + 6, 0);
    expect(near.ok && far.ok).toBe(true);
    const fn = g.facilities.byUid(near.uid!)!, ff = g.facilities.byUid(far.uid!)!;
    expect(g.viewOf(fn)).toBeGreaterThan(0);
    expect(g.viewOf(ff)).toBe(0);
    expect(g.facilityPop(fn)).toBeGreaterThan(g.facilityPop(ff));
  });
});

describe('P16 콤보', () => {
  it('매점 앞 평상 — 둘이 2칸 안이면 발동·발견되고 스냅샷을 왕복한다', () => {
    const g = new Game(3, undefined, { kit: false });
    g.money = 200000;
    g.unlocked.facilities.add('shop'); g.unlocked.facilities.add('pyeongsang_row');
    const l = landRect(0);
    expect(COMBO_DEFS.some((c) => c.id === 'small_shop_pyeongsang')).toBe(true);
    expect(g.placeFacility('shop', l.i0 + 4, l.j0 + 10, 0).ok).toBe(true);
    expect(g.combos().length).toBe(0);
    expect(g.placeFacility('pyeongsang_row', l.i0 + 4, l.j0 + 13, 0).ok).toBe(true); // 매점 아래 한 칸 띄워
    expect(g.combos().map((c) => c.def.id)).toContain('small_shop_pyeongsang');
    expect(g.combosSeen.has('small_shop_pyeongsang')).toBe(true);
    expect(g.inbox.all.some((e) => e.title.includes('콤보 발견'))).toBe(true);
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.combosSeen.has('small_shop_pyeongsang')).toBe(true);
    expect(h.combos().length).toBe(g.combos().length);
  });
});

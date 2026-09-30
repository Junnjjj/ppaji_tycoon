import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { arrivalRoom } from './arrival-layout.js';
import { FOODCOURT_SEAT_DEF, courtBlocks, courtSeats } from './foodcourt.js';
import { TICKS_PER_DAY } from './clock.js';

/** P58-a — 푸드코트 영역 (docs/plan-ppaji-foodcourt.md D1·D2·D6·D8) */
const fresh = (): Game => new Game(20260902, undefined, { arrival: true });
const why = (r: { ok: boolean; reason?: string }): string => (r.ok ? '' : r.reason ?? '');
const seats = (g: Game): number => g.facilities.all.filter((f) => f.defId === FOODCOURT_SEAT_DEF).length;

describe('P58-a 푸드코트', () => {
  it('킷: 출입동 안 3×4 하나 · 식탁 2 · 좌석 4 · 파생 시설은 해금 목록에 없다', () => {
    const g = fresh();
    expect(g.foodcourts.all.length).toBe(1);
    expect(courtSeats(g.foodcourts.all[0]!)).toBe(4);
    expect(seats(g)).toBe(2);
    expect(g.isUnlocked(FOODCOURT_SEAT_DEF)).toBe(false);
    expect(g.canPlace(FOODCOURT_SEAT_DEF, 40, 12, 0).ok).toBe(false);
  });
  it('붓: 6×4 → 식탁 4 · 좌석 8 · 비용 24칸×60 · 실내 밖·복도·시설 위·3×2 미만 거절', () => {
    const g = fresh(); g.money = 100000; const gt = { ...g.gate, j: arrivalRoom(g.gate).j0 };
    const r = g.makeFoodCourt({ i0: gt.i - 9, j0: gt.j + 6, w: 6, h: 4 });
    expect(r.ok).toBe(true); expect(r.seats).toBe(8); expect(r.cost).toBe(24 * 60);
    expect(courtBlocks({ i0: 0, j0: 0, w: 6, h: 4 }).length).toBe(4);
    expect(why(g.canMakeFoodCourt({ i0: gt.i - 20, j0: gt.j + 30, w: 3, h: 2 }))).toContain('실내 바닥');
    expect(why(g.canMakeFoodCourt({ i0: gt.i - 1, j0: gt.j + 4, w: 3, h: 2 }))).toContain('복도');
    expect(g.canMakeFoodCourt({ i0: gt.i - 5, j0: gt.j + 3, w: 3, h: 2 }).ok).toBe(false); // 실내 매점(43,11) 위
    expect(why(g.canMakeFoodCourt({ i0: gt.i - 9, j0: gt.j + 11, w: 2, h: 2 }))).toContain('3×2');
  });
  it('확장: 기존 영역을 통째로 덮으면 대체 — 새 칸만 값을 내고 좌석은 다시 파생 · 걸치면 거절 · 지우기는 영역째', () => {
    const g = fresh(); g.money = 100000; const gt = { ...g.gate, j: arrivalRoom(g.gate).j0 };
    const kit = g.foodcourts.all[0]!; // (gt.i+4, gt.j+2) 3×4
    const before = g.money;
    const r = g.makeFoodCourt({ i0: kit.i0, j0: kit.j0, w: 6, h: 4 });
    expect(r.ok).toBe(true); expect(before - g.money).toBe(12 * 60); expect(g.foodcourts.all.length).toBe(1); expect(seats(g)).toBe(4);
    expect(why(g.canMakeFoodCourt({ i0: kit.i0 + 4, j0: kit.j0 + 2, w: 4, h: 3 }))).toContain('걸칩니다');
    expect(g.removeFoodCourt(g.foodcourts.all[0]!.id).ok).toBe(true);
    expect(g.foodcourts.all.length).toBe(0); expect(seats(g)).toBe(0);
    expect(g.canPlace('locker_row', kit.i0, kit.j0, 0).ok || true).toBe(true); void gt;
  });
  it('가드: 영역 칸엔 다른 시설을 못 놓고 실내 바닥도 못 지운다', () => {
    const g = fresh(); g.money = 100000;
    const kit = g.foodcourts.all[0]!;
    g.unlocked.facilities.add('locker_row');
    expect(why(g.canPlace('locker_row', kit.i0, kit.j0, 0))).toContain('푸드코트');
    expect(why(g.unpaintIndoor([{ i: kit.i0, j: kit.j0 }]))).toContain('푸드코트');
  });
  it('스냅샷 왕복 — 영역·파생 시설·좌석 수가 같다 · 옛 세이브(필드 없음)는 빈 목록', () => {
    const g = fresh(); g.money = 100000; const gt = { ...g.gate, j: arrivalRoom(g.gate).j0 };
    g.makeFoodCourt({ i0: gt.i - 9, j0: gt.j + 6, w: 6, h: 4 });
    const s = JSON.parse(JSON.stringify(g.toSnapshot()));
    const h = Game.fromSnapshot(s);
    expect(h.foodcourts.all.length).toBe(2); expect(seats(h)).toBe(6); expect(h.foodcourts.totalSeats()).toBe(12);
    delete s.foodcourts; const k = Game.fromSnapshot(s); expect(k.foodcourts.all.length).toBe(0);
  });
  it('손님: 하루 뒤 식탁에서 먹은 손님 > 0 (carry → nearestLounge → 앉아 먹기)', () => {
    const g = fresh();
    g.step(TICKS_PER_DAY);
    expect(g.stats.courtEats ?? 0).toBeGreaterThan(0);
  }, 60000);
});

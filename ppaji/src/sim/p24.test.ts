import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';

/** P24 (D29·D30) — 자리 등급 0~5: 그늘·뷰·조경·먹거리 +1 · 물 +2 · 화장실·소음 −1. 킷 평상은 물가라 4·5, 뭍 안쪽 맨 자리는 0 */
describe('P24 자리 반경·등급', () => {
  it('킷 평상 둘은 물가(+2)·뷰라 등급 3·3 — 먹거리·그늘·조경은 비어 있다 (P29 D37: 첫 판의 자리는 미완성)', () => {
    const g = new Game(24);
    const seats = g.facilities.all.filter((f) => f.defId === 'pyeongsang_row').map((f) => g.seatGradeOf(f.uid));
    expect(seats.map((s) => s.grade).sort()).toEqual([3, 3]);
    expect(seats.every((s) => !s.food && !s.shade && !s.garden && s.water && s.view)).toBe(true);
  });
  it('뭍 안쪽 평상은 0 · 화장실 옆이면 −1 은 0 아래로 안 간다 · 파라솔은 그늘 +1 · 오락기(loud) 옆이면 −1', () => {
    const g = new Game(24); g.money = 100000; g.rank = 2; g.openLand(2);
    g.unlocked.facilities.add('parasol'); g.unlocked.facilities.add('performing_kairobot');
    const gt = g.gate;
    const a = g.placeFacility('pyeongsang_row', gt.i - 18, gt.j + 14, 0); expect(a.ok).toBe(true); // P48-b3: 북서 잔디 — 물 반경 3 밖 // 블록(5,2) — 접한 블록에 매점이 없다(P35: (5,1)은 킷 먹거리 블록(4,1)과 거리 건너 접한다) // P48-b1: 마당 가운데가 물굽이 — 무리를 서쪽 안쪽(물 반경 3 밖)으로 옮겼다
    expect(g.seatGradeOf(a.uid!).grade).toBe(0);
    const t = g.placeFacility('toilet', gt.i - 18, gt.j + 16, 0); expect(t.ok).toBe(true); // P48-b3: 평상 바로 아래
    expect(g.seatGradeOf(a.uid!)).toMatchObject({ grade: 0, dirty: true });
    const p = g.placeFacility('parasol', gt.i - 12, gt.j + 13, 0); expect(p.ok).toBe(true); // P48-b3: 북서 잔디(물·화장실 반경 밖)
    expect(g.seatGradeOf(p.uid!)).toMatchObject({ grade: 1, shade: true });
    const ar = g.placeFacility('performing_kairobot', gt.i - 11, gt.j + 15, 0); expect(ar.ok).toBe(true);
    expect(FACILITY_DEFS.get('performing_kairobot')!.noisy).toBe('loud');
    expect(g.seatGradeOf(p.uid!)).toMatchObject({ grade: 0, loud: true });
  });
  it('가상 배치 — seatGradeAt · seatsFedAt · 반경 링 칸 (조준 라벨의 재료)', () => {
    const g = new Game(24);
    const gt = g.gate;
    const def = FACILITY_DEFS.get('pyeongsang_row')!;
    expect(g.seatGradeAt(def, gt.i + 6, gt.j + 39, 0).water).toBe(true);
    expect(g.seatGradeAt(def, gt.i + 6, gt.j + 8, 0).water).toBe(false);
    const vend = FACILITY_DEFS.get('vending_out')!;
    expect(g.placeFacility('pyeongsang_row', gt.i + 8, gt.j + 13, 0).ok).toBe(true); // P48-b2: 킷 평상 둘은 멀어(못 북안·남쪽 물가) 북안에 하나 더 놓고 사이를 잰다
    expect(g.seatsFedAt(vend, gt.i + 6, gt.j + 14, 0)).toBe(2);
    expect(g.seatsFedAt(vend, gt.i + 6, gt.j + 4, 0)).toBe(0);
    const ring = g.seatRadiusTiles(def, gt.i + 6, gt.j + 10, 0);
    expect(ring.length).toBeGreaterThan(20);
    expect(ring.every((t) => Math.abs(t.i - (gt.i + 6 + 1.5)) >= 3 || Math.abs(t.j - (gt.j + 10)) >= 3)).toBe(true);
  });
  it('1박은 등급 ≥ 2 에서만 — 뭍 안쪽 캠핑은 체크인이 안 된다', () => {
    const g = new Game(24); g.money = 200000; g.rank = 2; g.openLand(2); g.unlocked.facilities.add('camp_site');
    const gt = g.gate;
    const far = g.placeFacility('camp_site', gt.i + 12, gt.j + 6, 0); expect(far.ok).toBe(true);
    expect(g.seatGradeOf(far.uid!).grade).toBeLessThan(2);
    const s = g.guests.spawn(); s.teamId = 999; s.target = { kind: 'facility', uid: far.uid! }; s.state = 'walk'; s.stateTicks = 0;
    g.step(300);
    expect(s.stays).toBe(false);
  });
});

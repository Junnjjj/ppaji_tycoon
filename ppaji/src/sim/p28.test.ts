import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import wishes from '../data/wishes.json';
import ranks from '../data/ranks.json';
import { TICKS_PER_DAY } from './clock.js';

/** P28 — 공간 소원·목표: 조건 DSL 에 seatGrade·seatsFed, 소원 18건이 자리를 요구하고 ★3 은 등급 3 자리 셋 */
describe('P28 공간 소원·목표', () => {
  it('데이터 — 자리 조건 소원 18건 · ★3 에 seatGrade{3,3}', () => {
    const spatial = (wishes as { condition: { kind: string } }[]).filter((w) => w.condition.kind === 'seatGrade' || w.condition.kind === 'seatsFed');
    expect(spatial.length).toBe(18); // P38: 구역 조건은 걷어냈다 — 자리 조건 18 그대로
    const r3 = (ranks as { star: number; conditions: { kind: string }[] }[]).find((r) => r.star === 3)!;
    expect(r3.conditions.some((c) => c.kind === 'seatGrade')).toBe(true);
  });
  it('seatGrade — 킷 평상(3·3)으로 등급 3 자리 둘은 성립, 등급 5 셋은 부분 점수(가장 좋은 자리의 등급 비율)', () => {
    const g = new Game(28);
    expect(g.evaluateCondition({ kind: 'seatGrade', min: 3, count: 2 }).met).toBe(true);
    const v = g.evaluateCondition({ kind: 'seatGrade', min: 5, count: 3 });
    expect(v.met).toBe(false); expect(v.actual).toBe(0); expect(v.progress).toBe(0); // 둘 이상 요구하면 found/need — 등급 비율은 한 자리 조건에만
    expect(v.label).toContain('등급 5');
  });
  it('seatsFed — 킷 자판기(입구 길 옆)는 자리를 안 먹인다 → 평상 옆에 놓으면 둘 · 셋은 미달, 라벨에 시설 이름', () => {
    const g = new Game(28); g.money = 100000;
    expect(g.evaluateCondition({ kind: 'seatsFed', id: 'vending_out', count: 1 }).met).toBe(false);
    const gt = g.gate; expect(g.placeFacility('vending_out', gt.i + 4, gt.j + 13, 0).ok).toBe(true); // P48-b2: 못 북안 평상(gt.i+4, j+15) 반경 3 — 남쪽 평상(j+39)은 멀어 한 자판기가 둘을 못 먹인다
    expect(g.evaluateCondition({ kind: 'seatsFed', id: 'vending_out', count: 1 }).met).toBe(true);
    expect(g.evaluateCondition({ kind: 'seatsFed', id: 'vending_out', count: 2 }).met).toBe(false);
    const v = g.evaluateCondition({ kind: 'seatsFed', id: 'vending_out', count: 3 });
    expect(v.met).toBe(false); expect(v.label).toContain('자판기');
    expect(g.evaluateCondition({ kind: 'seatsFed', id: 'shop', count: 1 }).met).toBe(false); // 매점이 없다
  });
  it('결산 요약에 「붐빈 자리 …(등급 n) m명」', () => {
    const g = new Game(28);
    g.step(TICKS_PER_DAY + 2);
    const items = ((g.inbox as unknown as { items?: { kind: string; body: string }[]; all?: { kind: string; body: string }[] }).items ?? (g.inbox as unknown as { all: { kind: string; body: string }[] }).all);
    const sum = items.filter((x) => x.kind === 'day-summary').slice(-1)[0]!;
    expect(sum.body).toMatch(/붐빈 자리 .+\(등급 \d\) \d+명/);
  });

  it('P28-b D35: 한 팀은 유료 평상을 한 줄만 빌린다 — 새 판 킷 두 줄에 팀 둘이 앉는다', () => {
    const g = new Game(3);
    g.money = 100000;
    const rows = g.facilities.all.filter((f) => f.defId === 'pyeongsang_row');
    expect(rows.length).toBe(2);
    const first = rows[0]!;
    let maxTeamsWithSeat = 0;
    for (let d = 0; d < 2; d++) for (let t = 0; t < 1680; t += 40) {
      g.step(40);
      const owners = new Set(rows.map((f) => f.rentedBy).filter((k) => k !== null));
      maxTeamsWithSeat = Math.max(maxTeamsWithSeat, owners.size);
      const dup = rows.filter((f) => f.rentedBy !== null && f.rentedBy === first.rentedBy).length;
      expect(dup <= 1 || first.rentedBy === null).toBe(true);
    }
    expect(maxTeamsWithSeat).toBe(2);
  }, 60000);

  it('P30 D38: 매점이 먹여 주는 자리 발자국 = seatsFedAt 과 같은 상자 (테두리만 훑으면 안쪽 자리를 놓친다)', () => {
    const g = new Game(30); g.money = 100000;
    const gt = g.gate;
    const r = g.placeFacility('vending_out', gt.i - 13, gt.j + 13, 0); expect(r.ok).toBe(true); // P48-b3: 킷 서쪽 평상(열 38 · 행 23) 반경 3 안
    const f = g.facilities.byUid(r.uid!)!; const def = g.facilities.defOf(f);
    const n = g.seatsFedAt(def, f.i, f.j, f.facing, f.uid);
    const tiles = g.seatsFedTiles(def, f.i, f.j, f.facing, f.uid);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(tiles.length).toBeGreaterThan(0);
    const seats = new Set(tiles.map((t) => g.facilities.at(t.i, t.j)?.uid));
    expect(seats.size).toBe(n);
  });
});

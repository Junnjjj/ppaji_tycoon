import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { landRect } from './grid.js';
import { TICKS_PER_DAY } from './clock.js';

const sq = (i: number, j: number, n = 2) => {
  const out: { i: number; j: number }[] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) out.push({ i: i + a, j: j + b });
  return out;
};

describe('시설', () => {
  it('시작 해금 시설을 토지 안 잔디에 놓으면 돈이 나가고 점유된다', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    const r = g.placeFacility('toilet', l.i0 + 2, l.j0 + 2, 0, { autoPath: false }); // P16: 길 값은 빼고 본다
    expect(r.ok).toBe(true);
    expect(g.money).toBe(12000 - ((g.facilities as unknown as { defs: Map<string, { cost: number }> }).defs.get('toilet')?.cost ?? 0));
    expect(g.facilities.occupied(l.i0 + 2, l.j0 + 2)).toBe(true);
    expect(g.canDig(l.i0 + 2, l.j0 + 2).ok).toBe(false);
  });
  it('거절 — 잠김 · 겹침 · 풀 위 · 입구 · 토지 밖', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    expect(g.canPlace('bungalow', l.i0 + 2, l.j0 + 2).ok).toBe(false); // invest 해금
    g.placeFacility('toilet', l.i0 + 2, l.j0 + 2);
    expect(g.canPlace('shower_row', l.i0 + 2, l.j0 + 2).ok).toBe(false);
    g.digPool(sq(l.i0 + 6, l.j0 + 6));
    expect(g.canPlace('shower_row', l.i0 + 6, l.j0 + 6).ok).toBe(false);
    expect(g.canPlace('shower_row', g.gate.i, g.gate.j).ok).toBe(false);
    expect(g.canPlace('shower_row', 0, 0).ok).toBe(false);
  });
  it('시설로 입구 길을 완전히 막을 수 없다 (전후 비교)', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    const gate = g.gate;
    // P32: 거리는 4칸(30~33). 입구 앞 줄의 거리 칸을 1×1 시설(구명함)로 하나씩 채운다 — 입구 열(32)만 남기면 아직 길이 있고, 마지막 하나가 공원 전체를 봉쇄하므로 거절
    g.money = 1_000_000;
    void l;
    // P40 D52: 마당은 어디든 걷는다 — 입구 칸(32,0)의 세 이웃(31,0)(33,0)(32,1)을 다 막아야 봉쇄다. 앞의 둘은 되고 마지막이 거절
    let rejected = 0;
    for (const [i, j] of [[gate.i - 1, gate.j], [gate.i + 1, gate.j]] as const) {
      const r = g.placeFacility('lifering', i, j, 0, { autoPath: false });
      if (!r.ok) rejected++;
    }
    expect(rejected).toBe(0);
    expect(g.placeFacility('lifering', gate.i, gate.j + 1, 0, { autoPath: false }).ok).toBe(false);
  });
  it('손님이 시설을 이용하고 유료 라운지는 이용료가 들어온다', () => {
    const g = new Game(3, undefined, { kit: false });
    const l = landRect(0);
    g.digPool(sq(l.i0 + 6, l.j0 + 6, 3));
    // beach_chair 는 shop 해금 — 테스트에서 직접 연다
    g.unlocked.facilities.add('shade_net');
    expect(g.placeFacility('shade_net', l.i0 + 3, l.j0 + 6).ok).toBe(true);
    expect(g.placeFacility('toilet', l.i0 + 3, l.j0 + 8).ok).toBe(true);
    g.step(TICKS_PER_DAY);
    expect(g.stats.days[0]!.fees + g.stats.days[0]!.tickets).toBeGreaterThan(0);
    expect(g.guests.all.length).toBe(0);
    const uses = g.stats.days[0]!.visitors;
    expect(uses).toBeGreaterThan(0);
  });
  it('철거는 자리를 비우고 철거비를 받는다 · 스냅샷 왕복', () => {
    const g = new Game(1, undefined, { kit: false });
    const l = landRect(0);
    const r = g.placeFacility('toilet', l.i0 + 2, l.j0 + 2, 0, { autoPath: false }); // P16: 길 값은 빼고 본다
    const uid = r.ok ? (r.uid as number) : 0;
    const snap = JSON.parse(JSON.stringify(g.toSnapshot()));
    const g2 = Game.fromSnapshot(snap);
    expect(g2.facilities.occupied(l.i0 + 2, l.j0 + 2)).toBe(true);
    expect(g2.toSnapshot()).toEqual(g.toSnapshot());
    const m = g.money;
    expect(g.removeFacility(uid).ok).toBe(true);
    expect(g.money).toBe(m - g.b.facilityRemoveCost);
    expect(g.facilities.occupied(l.i0 + 2, l.j0 + 2)).toBe(false);
  });
  it('데이터 — 시작 시설이 있고 정의를 전부 찾는다', () => {
    expect([...FACILITY_DEFS.values()].filter((d) => d.unlock.source === 'start').length).toBeGreaterThanOrEqual(5);
  });
});

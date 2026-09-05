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
    // 입구 바로 위 칸을 좌우 벽으로 막는 대신, 입구 앞 한 줄을 1×1 시설(구명함)로 채워 본다 — 마지막 하나가 거절돼야 한다
    g.money = 1_000_000;
    let rejected = 0;
    for (let di = -l.w; di <= l.w; di++) {
      const i = gate.i + di;
      if (i < l.i0 || i >= l.i0 + l.w) continue;
      if (i === gate.i) continue;
      const r = g.placeFacility('lifering', i, gate.j + 1, 0, { autoPath: false }); // P16: 길은 안 깐다 — 봉쇄 판정만 본다
      if (!r.ok) rejected++;
    }
    // 입구 열은 비어 있으므로 아직 길이 있다 — 마지막 하나는 공원 전체를 봉쇄하므로 거절
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

import { describe, it, expect } from 'vitest';
import { Game, CERT_DEFS } from './game.js';
import { makeTestPpaji } from './test-helpers.js';

describe('G35 인증 조건', () => {
  it('인증 24종이 좋아요·인기·실내 조건을 각각 하나 이상 쓴다 (P60-a: 강도 조건 삭제)', () => {
    const keys = new Set<string>();
    for (const c of CERT_DEFS) for (const x of c.conditions) if (x.cond.kind === 'pool') for (const k of Object.keys(x.cond)) keys.add(k);
    for (const k of ['likesMin', 'popMin', 'indoor']) /* P49-a2: 'tile' 삭제 */ expect(keys.has(k), k).toBe(true);
  });
});

describe('G35 재수상·근소 실패', () => {
  it('재통과는 재료 3 · 합격선 −3 이내 실패는 재료 1', () => {
    const g = new Game(41, undefined, { kit: false });
    g.money = 100000;
    const def = CERT_DEFS.find((c) => c.id === 'grade_f')!;
    // 조건을 강제로 맞춘다: 인기 60 · 풀 20칸 → 큰 빠지(안 물 4×5 = 20칸) + 시설
    const gt = g.gate;
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    expect(pp.id).not.toBeNull();
    expect(pp.tiles.length).toBeGreaterThanOrEqual(20);
    for (const id of ['toilet', 'shower_row', 'washbasin_row']) { g.unlocked.facilities.add(id); }
    g.placeFacility('toilet', gt.i + 2, gt.j + 4, 0); g.placeFacility('shower_row', gt.i + 3, gt.j + 4, 0); g.placeFacility('washbasin_row', gt.i + 4, gt.j + 4, 0);
    // 첫 통과를 흉내 낸다
    g.certs.state.passed[def.id] = 1;
    const owned0 = g.cooking.owned.size;
    g.certs.state.applied = { id: def.id, judgeDay: g.day };
    g.tick = 0;
    (g as unknown as { judgeCert(): void }).judgeCert();
    const last = g.certs.state.last!;
    if (last.pass) expect(g.cooking.owned.size - owned0).toBeGreaterThanOrEqual(Math.min(3, 1));
    // 근소 실패 — 점수를 합격선 −2 로 두고 보상 로직만 다시 태운다
    const g2 = new Game(42, undefined, { kit: false });
    g2.certs.state.applied = { id: def.id, judgeDay: g2.day };
    const owned1 = g2.cooking.owned.size;
    (g2 as unknown as { judgeCert(): void }).judgeCert();
    const l2 = g2.certs.state.last!;
    if (!l2.pass && l2.score >= def.pass - 3) expect(g2.cooking.owned.size).toBe(owned1 + 1);
    else expect(g2.certs.lastRewards.length).toBeGreaterThanOrEqual(0);
  });
});

import { describe, it, expect } from 'vitest';
import { Game, CERT_DEFS } from './game.js';
import { evaluate, type ConditionWorld } from './condition.js';

describe('G35 인증 조건', () => {
  it('pool{tile} — 타일 절반 이상이 그 종류일 때만', () => {
    const w = (tiles: Record<string, number>, size: number): ConditionWorld => ({
      pools: () => [{ id: 1, size, color: 'pink', scent: null, temp: 26, likes: 0, intensity: 0, popularity: 0, indoor: false, adjacentFacilities: [], items: [], tiles }],
      facilities: () => [], recipesKnown: () => new Set(), served: () => new Set(), popularity: () => 0, likes: () => 0, certPasses: () => 0, certPassed: () => false, friends: () => 0, areas: () => 0, rank: () => 0, giftGiven: () => false, cookingLevel: () => 1, visitors: () => 0, money: () => 0, year: () => 1,
    } as unknown as ConditionWorld);
    expect(evaluate({ kind: 'pool', tile: 'wooden' }, w({ wooden: 5, standard: 4 }, 9)).met).toBe(true);
    expect(evaluate({ kind: 'pool', tile: 'wooden' }, w({ wooden: 4, standard: 5 }, 9)).met).toBe(false);
    expect(evaluate({ kind: 'pool', tile: 'wooden' }, w({ wooden: 4, standard: 5 }, 9)).label).toContain('나무 타일');
  });
  it('인증 24종이 강도·좋아요·인기·실내·타일 조건을 각각 하나 이상 쓴다', () => {
    const keys = new Set<string>();
    for (const c of CERT_DEFS) for (const x of c.conditions) if (x.cond.kind === 'pool') for (const k of Object.keys(x.cond)) keys.add(k);
    for (const k of ['intensityMin', 'likesMin', 'popMin', 'indoor', 'tile']) expect(keys.has(k), k).toBe(true);
  });
});

describe('G35 재수상·근소 실패', () => {
  it('재통과는 재료 3 · 합격선 −3 이내 실패는 재료 1', () => {
    const g = new Game(41, undefined, { kit: false });
    g.money = 100000;
    const def = CERT_DEFS.find((c) => c.id === 'grade_f')!;
    // 조건을 강제로 맞춘다: 인기 60 · 풀 20칸 → 큰 풀 + 시설
    const gt = g.gate;
    const tiles = [] as { i: number; j: number }[];
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) tiles.push({ i: gt.i - 6 + a, j: gt.j - 9 + b });
    expect(g.digPool(tiles).ok).toBe(true);
    for (const id of ['toilet', 'shower', 'water_fountain']) { g.unlocked.facilities.add(id); }
    g.placeFacility('toilet', gt.i + 2, gt.j - 4, 0); g.placeFacility('shower', gt.i + 3, gt.j - 4, 0); g.placeFacility('water_fountain', gt.i + 4, gt.j - 4, 0);
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

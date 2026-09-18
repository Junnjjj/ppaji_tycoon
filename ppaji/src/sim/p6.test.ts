import { describe, it, expect } from 'vitest';
import { evaluate, type ConditionWorld } from './condition.js';
import { CertStore, JUDGE_BIAS, JUDGES } from './cert.js';
import { Rng } from './rng.js';
import { Game } from './game.js';

const world = (thrills: number[]): ConditionWorld => ({
  pools: () => [], facilities: () => [], popularity: () => 0, likes: () => 0, certPasses: () => 0, certPassed: () => false,
  friends: () => 0, areas: () => 0, rank: () => 0, hasGift: () => false, recipeKnown: () => false, recipeCount: () => 0,
  cookingLevel: () => 0, visitors: () => 0, money: () => 0, year: () => 1, courseThrills: () => thrills, seatGrades: () => [], ppajiGrades: () => [], rigPaths: () => [], rigs: () => [], /* P49-a1 */ seatsFedMax: () => 0,
});

/** P6 — 스릴 조건 kind · 심사 편향 0(D15) · 실제 판의 코스가 조건 세계에 닿는다 */
describe('P6 인증', () => {
  it('courseThrill: 문턱 이상 코스 개수로 판정하고, 하나짜리는 최고 스릴로 부분 점수를 준다', () => {
    expect(evaluate({ kind: 'courseThrill', min: 80 }, world([40, 85])).met).toBe(true);
    const v = evaluate({ kind: 'courseThrill', min: 90 }, world([40, 85]));
    expect(v.met).toBe(false);
    expect(v.progress).toBeCloseTo(85 / 90, 5);
    const two = evaluate({ kind: 'courseThrill', min: 50, count: 2 }, world([60]));
    expect(two.met).toBe(false);
    expect(two.progress).toBe(0.5);
    expect(evaluate({ kind: 'courseThrill', min: 50 }, world([])).progress).toBe(0);
  });

  it('심사 편향은 0 이고 심사는 cert 스트림을 한 번도 안 뽑는다 — 세 심사위원 점수가 같다', () => {
    expect(JUDGE_BIAS).toBe(0);
    const rng = new Rng(7);
    const def = { id: 'x', name: 'x', family: 'grade' as const, grade: 'F' as const, pass: 15, requires: null, fee: 500, conditions: [{ cond: { kind: 'year' as const, min: 1 }, weight: 1 as const }], reward: { kind: 'rigPart' as const, id: 'slip_wax' } };
    const s = new CertStore([def], rng);
    const before = rng.state;
    expect(s.canApply('x', 0, 1000).ok).toBe(true);
    s.apply('x', 0, 1000);
    const res = s.judge(3, (c) => evaluate(c, world([])));
    expect(rng.state).toBe(before);
    expect(res?.judges).toHaveLength(JUDGES);
    expect(new Set(res?.judges).size).toBe(1);
  });

  it('실제 판: 코스를 놓으면 조건 세계의 courseThrills 가 그 스릴을 낸다', () => {
    const g = new Game(1);
    g.money = 100000;
    expect(g.conditionWorld().courseThrills()).toEqual([]);
    const s = g.suggestCourse();
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(g.placeCourse(s.draft).ok).toBe(true);
    const ts = g.conditionWorld().courseThrills();
    expect(ts).toHaveLength(1);
    expect(ts[0]).toBeGreaterThan(0);
  });
});

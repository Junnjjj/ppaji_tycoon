import { describe, it, expect } from 'vitest';
import { evaluate, CONDITION_KINDS, type ConditionWorld, type PoolView, type FacilityView } from './condition.js';
import type { Condition } from '../data/schema.js';

const pool = (o: Partial<PoolView>): PoolView => ({ id: 1, size: 4, color: 'clear', scent: null, temp: 24, likes: 0, intensity: 0, popularity: 16, indoor: false, adjacentFacilities: [], items: [], ...o });
const fac = (o: Partial<FacilityView>): FacilityView => ({ uid: 1, id: 'toilet', class: 'utility', adjacentPool: false, adjacentFacilities: [], ...o });
const world = (o: Partial<{ pools: PoolView[]; facilities: FacilityView[]; pop: number; likes: number; friends: number; areas: number; rank: number; gifts: string[]; money: number; year: number }>): ConditionWorld => ({
  pools: () => o.pools ?? [],
  facilities: () => o.facilities ?? [],
  popularity: () => o.pop ?? 0,
  likes: () => o.likes ?? 0,
  certPasses: () => 0,
  certPassed: () => false,
  friends: () => o.friends ?? 0,
  areas: () => o.areas ?? 1,
  rank: () => o.rank ?? 0,
  hasGift: (id) => (o.gifts ?? []).includes(id),
  recipeKnown: () => false,
  recipeCount: () => 0,
  cookingLevel: () => 0,
  visitors: () => 0,
  money: () => o.money ?? 0,
  year: () => o.year ?? 1, courseThrills: () => [], seatGrades: () => [], ppajiGrades: () => [], rigChains: () => [], rigs: () => [], /* P49-a1 */ seatsFedMax: () => 0,
});

describe('조건 DSL — 한 평가기', () => {
  it('pool sizeMin — 진행률은 가장 큰 풀 기준', () => {
    const c: Condition = { kind: 'pool', sizeMin: 20 };
    const v = evaluate(c, world({ pools: [pool({ size: 10 }), pool({ id: 2, size: 5 })] }));
    expect(v.met).toBe(false);
    expect(v.progress).toBeCloseTo(0.5, 5);
    expect(evaluate(c, world({ pools: [pool({ size: 24 })] })).met).toBe(true);
    expect(v.label).toBe('20칸 이상');
  });
  it('pool color ×2 — count 를 센다', () => {
    const c: Condition = { kind: 'pool', color: 'pink', count: 2 };
    expect(evaluate(c, world({ pools: [pool({ color: 'pink' })] })).met).toBe(false);
    expect(evaluate(c, world({ pools: [pool({ color: 'pink' }), pool({ id: 2, color: 'pink' })] })).met).toBe(true);
  });
  it('pool 복합 — 야외 + 커피향 + 32°C+', () => {
    const c: Condition = { kind: 'pool', outdoor: true, scent: 'coffee', tempMin: 32 };
    expect(evaluate(c, world({ pools: [pool({ scent: 'coffee', temp: 33 })] })).met).toBe(true);
    expect(evaluate(c, world({ pools: [pool({ scent: 'coffee', temp: 33, indoor: true })] })).met).toBe(false);
    expect(evaluate(c, world({ pools: [pool({ scent: 'pine', temp: 33 })] })).progress).toBeCloseTo(2 / 3, 5);
  });
  it('facility · facilityAdjacent · item · popularity · likes · gift · all/any', () => {
    const w = world({
      pools: [pool({ items: ['apple', 'apple'] })],
      facilities: [fac({ id: 'pingpong', adjacentFacilities: ['pingpong'] }), fac({ uid: 2, id: 'pingpong', adjacentFacilities: ['pingpong'] }), fac({ uid: 3, id: 'sauna', adjacentPool: true })],
      pop: 120, likes: 300, gifts: ['red_tube'],
    });
    expect(evaluate({ kind: 'facility', id: 'sauna', adjacentPool: true }, w).met).toBe(true);
    expect(evaluate({ kind: 'facilityAdjacent', ids: ['pingpong', 'pingpong'] }, w).met).toBe(true);
    expect(evaluate({ kind: 'item', id: 'apple', count: 2 }, w).met).toBe(true);
    expect(evaluate({ kind: 'item', id: 'apple', count: 3 }, w).progress).toBeCloseTo(2 / 3, 5);
    expect(evaluate({ kind: 'popularity', min: 100 }, w).met).toBe(true);
    expect(evaluate({ kind: 'likes', min: 400 }, w).progress).toBe(0.75);
    expect(evaluate({ kind: 'gift', id: 'red_tube' }, w).met).toBe(true);
    expect(evaluate({ kind: 'all', of: [{ kind: 'popularity', min: 100 }, { kind: 'likes', min: 400 }] }, w).met).toBe(false);
    expect(evaluate({ kind: 'any', of: [{ kind: 'popularity', min: 100 }, { kind: 'likes', min: 400 }] }, w).met).toBe(true);
  });
  it('모든 kind 가 switch 에 있다 (throw 없이 답한다)', () => {
    const w = world({});
    for (const kind of CONDITION_KINDS) {
      const c = ({ pool: { kind }, poolTotalSize: { kind, min: 1 }, facility: { kind, id: 'x' }, facilityAdjacent: { kind, ids: ['a', 'b'] }, facilityClass: { kind, class: 'utility' }, item: { kind, id: 'x' }, recipe: { kind, id: 'x' }, recipeCount: { kind, min: 1 }, popularity: { kind, min: 1 }, likes: { kind, min: 1 }, certPasses: { kind, min: 1 }, certPassed: { kind, id: 'x' }, friends: { kind, min: 1 }, areas: { kind, min: 1 }, rank: { kind, min: 1 }, gift: { kind, id: 'x' }, cookingLevel: { kind, min: 1 }, visitors: { kind, min: 1 }, money: { kind, min: 1 }, year: { kind, min: 1 }, all: { kind, of: [] }, any: { kind, of: [] } } as Record<string, unknown>)[kind] as Condition;
      const v = evaluate(c, w);
      expect(typeof v.met).toBe('boolean');
      expect(v.progress).toBeGreaterThanOrEqual(0);
      expect(v.progress).toBeLessThanOrEqual(1);
    }
  });
});

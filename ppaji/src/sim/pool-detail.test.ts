import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

/** G42 — 풀 상세(농도·부족한 색·이상 온도) · 아이템 7일 규칙 · 색·향 심사 만점 = 농도 */
function withPool(seed = 41, n = 2): { g: Game; id: number } {
  const g = new Game(seed, undefined, { kit: false });
  g.money = 200000;
  const gt = g.gate; const t = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) t.push({ i: gt.i - 4 + a, j: gt.j + 6 + b });
  g.digPool(t);
  for (const id of ['strawberry', 'blueberry', 'lemon', 'apple', 'grapes', 'grapefruit', 'melon', 'kiwi', 'pineapple']) g.unlocked.items.add(id);
  return { g, id: g.pools.all[0]!.id };
}

describe('G42 풀 상세', () => {
  it('같은 색만 넣으면 농도가 오르고, 다른 색이 섞이면 내려간다 · 부족한 무지개 색을 센다', () => {
    const { g, id } = withPool();
    g.putItem(id, 'strawberry');
    const a = g.poolState(id)!.detail;
    expect(a.intensityBars).toBeGreaterThanOrEqual(1);
    expect(a.colorMix[0]!.color).toBe('pink');
    expect(a.missingForRainbow.length).toBe(7); // 8색 중 핑크만 있다
    for (let k = 0; k < 3; k++) g.putItem(id, 'strawberry');
    const b = g.poolState(id)!.detail.intensityBars;
    expect(b).toBeGreaterThan(a.intensityBars);
    g.putItem(id, 'blueberry'); g.putItem(id, 'blueberry');
    expect(g.poolState(id)!.detail.colorMix.length).toBe(2);
  });
  it('무지개 8색을 다 넣으면 부족한 색이 0', () => {
    const { g, id } = withPool(42, 3);
    for (const it of ['lemon', 'apple', 'blueberry', 'grapefruit', 'grapes', 'melon', 'kiwi', 'strawberry']) expect(g.putItem(id, it).ok).toBe(true);
    const d = g.poolState(id)!.detail;
    expect(d.missingForRainbow.length).toBeLessThanOrEqual(1);
  });
  it('이상 수온과의 거리가 체류 배율(0.7~1.0)이 된다', () => {
    const { g, id } = withPool(43);
    const d = g.poolState(id)!.detail;
    expect(d.idealTemp).toBe(27); // 봄
    expect(d.tempFit).toBeGreaterThan(0.5);
    for (let k = 0; k < 3; k++) g.putItem(id, 'lemon'); // 레몬은 온도 0 — 색만
    g.unlocked.items.add('ice_block');
    g.putItem(id, 'ice_block');
    expect(g.poolState(id)!.detail.tempFit).toBeLessThan(d.tempFit);
  });
});

describe('G42 아이템 7일 규칙', () => {
  it('둘째 아이템은 첫째의 만료를 물려받는다 — 개수가 늘어도 안 길어진다', () => {
    const { g, id } = withPool(44);
    g.putItem(id, 'strawberry');
    const first = g.pools.byId(id)!.items[0]!.expiresTick;
    g.step(TICKS_PER_DAY * 3);
    g.putItem(id, 'strawberry');
    const second = g.pools.byId(id)!.items[1]!.expiresTick;
    expect(second).toBe(first);
    expect(g.itemDaysLeft(id)).toBe(5); // 오늘 포함 (7일째 폐장까지)
  });
});

describe('G42 심사 만점 = 농도', () => {
  it('핑크 조건은 충족해도 농도 5 라야 만점 진행률 1', () => {
    const { g, id } = withPool(45, 2);
    g.putItem(id, 'strawberry');
    const v1 = g.evaluateCondition({ kind: 'pool', color: 'pink' });
    expect(v1.met).toBe(true);
    expect(v1.full?.actual).toBeLessThan(5);
    expect(v1.progress).toBeLessThan(1);
    for (let k = 0; k < 8; k++) g.putItem(id, 'strawberry');
    const v2 = g.evaluateCondition({ kind: 'pool', color: 'pink' });
    expect(v2.full?.actual).toBe(5);
    expect(v2.progress).toBe(1);
  });
});

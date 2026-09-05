import { describe, it, expect } from 'vitest';
import gears from './gears.json';
import parts from './parts.json';

/** P19 — 공방 발견 페이싱: 연차 부품(3~7년차)이 실제 레시피에 쓰여 발견이 8년에 걸쳐 퍼진다 (실측 전: 4년차에 26/30 을 다 찾았다) */
describe('P19 공방 페이싱 데이터', () => {
  const yearOf = new Map((parts as { id: string; unlock: string; year?: number }[]).filter((p) => p.unlock === 'year').map((p) => [p.id, p.year ?? 0]));
  const cook = (gears as { id: string; unlock: string; key: string }[]).filter((g) => g.unlock === 'cook');
  const maxYear = (key: string): number => Math.max(0, ...key.split('+').map((x) => yearOf.get(x) ?? 0));
  it('cook 레시피 22 중 연차 부품을 쓰는 것이 10 이상이고, 3·4·5·6·7년차마다 하나 이상이다', () => {
    const gated = cook.filter((g) => maxYear(g.key) >= 3);
    expect(gated.length).toBeGreaterThanOrEqual(10);
    for (const y of [3, 4, 5, 6, 7]) expect(gated.some((g) => maxYear(g.key) === y), `year ${y}`).toBe(true);
  });
  it('4년차 안(연차 ≤ 4 부품만)으로 만들 수 있는 cook 레시피는 2/3 이하다 (실측 14/22 — 4년차 발견 18~19/30)', () => {
    expect(cook.filter((g) => maxYear(g.key) <= 4).length).toBeLessThanOrEqual(Math.ceil((cook.length * 2) / 3));
  });
  it('레시피 키는 정렬된 다중집합이고 서로 다르다', () => {
    const keys = (gears as { key: string }[]).map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k.split('+').slice().sort().join('+')).toBe(k);
  });
});

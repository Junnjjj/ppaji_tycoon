import { describe, it, expect } from 'vitest';
import { mixColor, RAINBOW_MIN_COLORS } from './color.js';
import { pickScent } from './scent.js';

describe('풀 색 혼합', () => {
  it('아이템이 없으면 clear, 강도 0', () => {
    expect(mixColor([], 4)).toMatchObject({ color: 'clear', intensity: 0 });
  });
  it('딸기(핑크) 하나면 핑크, 큰 풀에서는 옅어져 clear', () => {
    expect(mixColor([{ color: 'pink', weight: 1 }], 1).color).toBe('pink');
    expect(mixColor([{ color: 'pink', weight: 1 }], 100).color).toBe('clear');
  });
  it('노랑 + 파랑 = 초록 계열 (RGB 평균 최근접)', () => {
    const r = mixColor([{ color: 'yellow', weight: 1 }, { color: 'blue', weight: 1 }], 1);
    expect(['green', 'lime']).toContain(r.color);
  });
  it('서로 다른 8색 등량 = 무지개, 7색이면 아니다', () => {
    const eight = ['orange', 'yellow', 'lime', 'green', 'blue', 'purple', 'pink', 'red'] as const;
    expect(mixColor(eight.map((c) => ({ color: c, weight: 1 })), 1).color).toBe('rainbow');
    expect(mixColor(eight.slice(0, 7).map((c) => ({ color: c, weight: 1 })), 1).color).not.toBe('rainbow');
    expect(RAINBOW_MIN_COLORS).toBe(8);
  });
  it('한 색이 압도하면 무지개가 아니다 (비중 8% 미만은 안 센다)', () => {
    const eight = ['orange', 'yellow', 'lime', 'green', 'blue', 'purple', 'pink', 'red'] as const;
    const items = eight.map((c) => ({ color: c, weight: c === 'blue' ? 40 : 1 }));
    expect(mixColor(items, 1).color).toBe('blue');
  });
});

describe('풀 향 — 가장 센 것 하나', () => {
  it('아이템과 시설 중 센 쪽, 동률은 아이템', () => {
    expect(pickScent([{ scent: 'berry', power: 2, fromItem: true }, { scent: 'pine', power: 3, fromItem: false }]).scent).toBe('pine');
    expect(pickScent([{ scent: 'berry', power: 3, fromItem: true }, { scent: 'pine', power: 3, fromItem: false }]).scent).toBe('berry');
    expect(pickScent([{ scent: null, power: 9, fromItem: true }]).scent).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { uiZoom } from './ui-scale.js';

describe('P57-g UI 배율', () => {
  it('폰 393×852 = 1 · 아이패드 세로 820×1180 ≈ 1.36 · 가로 1180×820 ≈ 1.36 · 1209×975 ≈ 1.5 · 1920×850 은 세로 상한 1.42 · 상한 2', () => {
    expect(uiZoom(393, 852)).toBe(1);
    expect(uiZoom(360, 780)).toBe(1); // 작은 폰도 1 아래로 안 간다
    expect(uiZoom(820, 1180)).toBeCloseTo(1.36, 2);
    expect(uiZoom(1180, 820)).toBeCloseTo(1.36, 2);
    expect(uiZoom(1209, 975)).toBeCloseTo(1.5, 1);
    expect(uiZoom(1920, 850)).toBeCloseTo(850 / 600, 2);
    expect(uiZoom(2560, 1600)).toBe(2);
  });
});

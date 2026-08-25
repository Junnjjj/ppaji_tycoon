import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { surroundDecorationPlan } from './surround.js';

const scene = readFileSync(new URL('../scenes/KairoScene.ts', import.meta.url), 'utf8');

describe('Phase 7 저위험 주변 장식', () => {
  it('기존 deco 계약 ID만 소수 배치하고 전부 플레이 격자 밖이다', () => {
    const plan = surroundDecorationPlan(96, 72);
    expect(plan.length).toBeGreaterThanOrEqual(4);
    expect(plan.length).toBeLessThanOrEqual(12);
    expect(plan.every((item) => ['deco/banner', 'deco/planter_row', 'deco/sculpture'].includes(item.id))).toBe(true);
    expect(plan.every((item) => item.i < 0 || item.j < 0 || item.i >= 96 || item.j >= 72)).toBe(true);
  });

  it('그림 배경이 아니라 기존 surround 굽기에 한 번만 합성한다', () => {
    const bake = scene.slice(scene.indexOf('private bakeSurroundTexture'), scene.indexOf('private buildSurround'));
    expect(bake).toContain('surroundDecorationPlan');
    expect(bake).toContain('deco/');
    expect(bake).not.toContain('setInterval');
    expect(bake).not.toContain('refreshTile');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KairoTerrain } from '../../sim/kairo/terrain.js';
import { kairoSpriteIndex } from '../../assets/kairo-contract.js';
import { SURROUND_DECOR_KINDS, surroundDecorationPlan } from './surround.js';

const scene = readFileSync(new URL('../scenes/KairoScene.ts', import.meta.url), 'utf8');
const source = readFileSync(new URL('./surround.ts', import.meta.url), 'utf8');

const W = KairoTerrain.WIDTH;
const H = KairoTerrain.HEIGHT;
const outside = (item: { i: number; j: number }): boolean =>
  item.i < 0 || item.j < 0 || item.i >= W || item.j >= H;

describe('Phase 7 지도 밖 생활 장식', () => {
  it('7종 이하 · 인스턴스 12개 이하 · 전부 플레이 격자 밖', () => {
    const plan = surroundDecorationPlan(W, H);
    expect(plan.length).toBeGreaterThanOrEqual(8);
    expect(plan.length).toBeLessThanOrEqual(12);
    expect(SURROUND_DECOR_KINDS.length).toBeLessThanOrEqual(7);
    expect(new Set(plan.map((item) => item.kind)).size).toBe(SURROUND_DECOR_KINDS.length);
    expect(plan.every(outside)).toBe(true);
  });

  it('표지 세 종 복제가 아니라 주택·상점·차량·조명·안내판·화단·수풀이 산다', () => {
    expect([...SURROUND_DECOR_KINDS].sort()).toEqual(
      ['car', 'flowerbed', 'house', 'lamp', 'shop', 'shrub', 'sign'].sort(),
    );
  });

  it('새 에셋 팩을 만들지 않는다 — 전부 이미 있는 계약 ID 다', () => {
    const index = kairoSpriteIndex();
    for (const item of surroundDecorationPlan(W, H)) {
      expect(index.has(item.id), `${item.kind}: ${item.id}`).toBe(true);
    }
  });

  it('지형 문맥을 따른다 — 도로 옆에 차량·조명·상점, 입구 위에 안내판·화단', () => {
    const plan = surroundDecorationPlan(W, H);
    const roadside = plan.filter((item) => ['car', 'lamp', 'shop'].includes(item.kind));
    expect(roadside.length).toBeGreaterThanOrEqual(3);
    // 도시 띠(도로·정류장 줄)의 바깥 연장선에만 선다
    expect(
      roadside.every((item) => item.j >= 0 && item.j < KairoTerrain.CITY_BAND && (item.i < 0 || item.i >= W)),
    ).toBe(true);

    const gateside = plan.filter((item) => ['sign', 'flowerbed'].includes(item.kind));
    expect(gateside.length).toBeGreaterThanOrEqual(2);
    expect(gateside.every((item) => item.j < 0 && Math.abs(item.i - KairoTerrain.ENTRY_I) <= 14)).toBe(true);

    const living = plan.filter((item) => ['house', 'shrub'].includes(item.kind));
    expect(living.length).toBeGreaterThanOrEqual(3);
    // 주거는 도로 연장선을 피한다 — 차도 한가운데 집이 서면 문맥이 깨진다
    expect(living.every((item) => item.j < 0 || item.j >= KairoTerrain.CITY_BAND)).toBe(true);
    /*
     * ⚠ 남쪽(`j >= height`)에는 아무것도 두지 않는다 — 거긴 강이라 굽기의 물 판정에
     * 걸려 **조용히 안 그려진다** (실측 12개 중 3개 증발, 종류 6/7).
     */
    expect(plan.every((item) => item.j < H)).toBe(true);
  });

  it('좌표는 맵 크기에서 결정론적으로 파생한다', () => {
    expect(surroundDecorationPlan(W, H)).toEqual(surroundDecorationPlan(W, H));
    const small = surroundDecorationPlan(64, 48);
    expect(small.every((item) => item.i < 0 || item.j < 0 || item.i >= 64 || item.j >= 48)).toBe(true);
    expect(small).not.toEqual(surroundDecorationPlan(W, H));
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(body).not.toContain('Math.random');
  });

  it('같은 칸에 둘을 겹쳐 놓지 않는다', () => {
    const plan = surroundDecorationPlan(W, H);
    expect(new Set(plan.map((item) => `${item.i},${item.j}`)).size).toBe(plan.length);
  });

  it('그림 배경이 아니라 기존 surround 굽기에 한 번만 합성한다', () => {
    const bake = scene.slice(scene.indexOf('private bakeSurroundTexture'), scene.indexOf('private buildSurround'));
    expect(bake).toContain('surroundDecorationPlan');
    expect(bake).not.toContain('setInterval');
    expect(bake).not.toContain('refreshTile');
    // 런타임 Phaser 오브젝트 0 — 캔버스에만 그린다
    expect(bake).toContain('ctx.drawImage');
    expect(bake).not.toContain('this.add.image');
  });

  it('굽기가 계획을 접두사로 거르지 않는다 — 주택·상점이 조용히 빠지면 안 된다', () => {
    const bake = scene.slice(scene.indexOf('private bakeSurroundTexture'), scene.indexOf('private buildSurround'));
    const loop = bake.slice(bake.indexOf('for (const item of surroundDecorationPlan'));
    expect(loop).not.toContain("item.id.startsWith('deco/')");
    // 프로바이더가 아는 ID 만 그린다 — 없는 그림은 알아서 빠진다
    expect(loop).toContain('this.opts.provider.has(item.id)');
    // 화면에 올라간 것을 하네스가 읽을 수 있어야 한다 (계획만 재면 조용히 통과한다)
    expect(loop).toContain('surroundDecorDrawn');
    expect(scene).toContain('surroundDecorForTest');
  });
});

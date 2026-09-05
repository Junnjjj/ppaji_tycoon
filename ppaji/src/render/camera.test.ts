import { describe, it, expect } from 'vitest';
import { viewport, integerDpr, stepUpscale, violatesDotGrid, UPSCALE_STEPS, UPSCALE_DEFAULT } from './upscale.js';
import { Camera, worldBounds, BACKDROP_ABOVE, BACKDROP_BELOW } from './camera.js';
import { STEP_X, STEP_Y, GRID_W, GRID_H } from './iso.js';

describe('업스케일 — 비정수 배율을 표현 불가능하게', () => {
  it('사다리가 정수뿐이고 축소 없음', () => {
    for (const s of UPSCALE_STEPS) expect(Number.isInteger(s)).toBe(true);
    expect(Math.min(...UPSCALE_STEPS)).toBe(1);
  });
  it('DPR 정수 반올림', () => {
    expect(integerDpr(2.625)).toBe(3);
    expect(integerDpr(0.5)).toBe(1);
    expect(integerDpr(4)).toBe(3);
  });
  it('393×852 · S=2 는 1px 넘친다', () => {
    const v = viewport(393, 852, 2, 3);
    expect(v.bufferW).toBe(197);
    expect(v.overflowX).toBe(1);
  });
  it('주요 폰 크기 전부 도트 격자 유지', () => {
    for (const s of UPSCALE_STEPS) for (const [w, h] of [[393, 852], [390, 844], [360, 800], [412, 915]] as const)
      for (const dpr of [1, 2, 2.625, 2.75, 3]) expect(violatesDotGrid(viewport(w, h, s, dpr), s)).toEqual([]);
  });
  it('사다리 밖으로 안 나간다', () => {
    expect(stepUpscale(1, -1)).toBe(1);
    expect(stepUpscale(2, 1)).toBe(2);
  });
});

describe('월드 경계', () => {
  it('맵 다이아몬드 + 여백', () => {
    const b = worldBounds();
    expect(b.minX).toBe(-GRID_H * STEP_X);
    expect(b.maxX).toBe(GRID_W * STEP_X);
    expect(b.minY).toBe(-BACKDROP_ABOVE);
    expect(b.maxY).toBe((GRID_W + GRID_H) * STEP_Y + BACKDROP_BELOW);
    expect(b.maxX - b.minX).toBe(1792);
    expect(b.maxY - b.minY).toBeGreaterThan(852); // 세로도 팬한다
  });
});

describe('카메라', () => {
  const mk = (): Camera => {
    const c = new Camera();
    c.setScreenSize(393, 852);
    return c;
  };
  it('기본 배율 1', () => expect(mk().upscale).toBe(UPSCALE_DEFAULT));
  it('view 는 항상 정수', () => {
    const c = mk();
    for (let k = 0; k < 40; k++) {
      c.pan(0.4, -0.3);
      const v = c.view();
      expect(Number.isInteger(v.scrollX) && Number.isInteger(v.scrollY)).toBe(true);
    }
  });
  it('소수 드래그가 누적된다', () => {
    const c = mk();
    const before = c.rawCenter().x;
    for (let k = 0; k < 10; k++) c.pan(0.4, 0);
    expect(c.rawCenter().x).toBeCloseTo(before - 4, 5);
  });
  it('팬이 경계 안으로 확정된다', () => {
    const c = mk();
    for (let k = 0; k < 500; k++) c.pan(-50, -50);
    c.release();
    const v = c.view();
    const b = worldBounds();
    expect(v.scrollX + 393).toBeLessThanOrEqual(b.maxX + 1);
    expect(v.scrollY + 852).toBeLessThanOrEqual(b.maxY + 1);
  });
  it('업스케일이 클수록 같은 드래그가 적게 움직인다', () => {
    const a = mk();
    const b = mk();
    b.setUpscale(2);
    const a0 = a.rawCenter().x;
    const b0 = b.rawCenter().x;
    a.pan(100, 0);
    b.pan(100, 0);
    expect(Math.abs(a.rawCenter().x - a0)).toBeCloseTo(100, 5);
    expect(Math.abs(b.rawCenter().x - b0)).toBeCloseTo(50, 5);
  });
  it('앵커 줌 — 찍은 텍셀이 거의 안 움직인다', () => {
    const c = mk();
    const t = c.screenToTexel(120, 300);
    c.setUpscale(2, t);
    const after = c.screenToTexel(120, 300);
    expect(Math.abs(after.x - t.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - t.y)).toBeLessThanOrEqual(1);
  });
  it('버퍼 크기가 배율에서 파생된다', () => {
    const c = mk();
    expect(c.bufferSize()).toEqual({ w: 393, h: 852 });
    c.setUpscale(2);
    expect(c.bufferSize()).toEqual({ w: 197, h: 426 });
  });
  it('뷰가 월드보다 커도 튀지 않는다', () => {
    const c = new Camera(4, 4);
    c.setScreenSize(1600, 1200);
    c.pan(999, 999);
    c.release();
    expect(Number.isFinite(c.view().scrollX)).toBe(true);
  });
  it('centerOn — 준 텍셀이 보이는 영역 중앙에 온다 (inset 반영)', () => {
    const c = mk();
    const b = worldBounds();
    const t = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    c.centerOn(t, 0);
    const plain = t.y - c.view().scrollY;
    c.centerOn(t, 100); // 세로 여유가 작은 판이라 inset 은 클램프 안에 들어갈 만큼만
    const lifted = t.y - c.view().scrollY;
    expect(Math.abs(plain - lifted - 50)).toBeLessThanOrEqual(1);
    expect(c.fits({ w: 50, h: 50 })).toBe(true);
    expect(c.fits({ w: 500, h: 50 })).toBe(false);
  });
});

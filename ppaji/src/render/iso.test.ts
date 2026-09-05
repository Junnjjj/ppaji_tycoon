import { describe, it, expect } from 'vitest';
import {
  TILE_W, TILE_H, STEP_X, STEP_Y, GRID_W, GRID_H,
  gridToScreen, tileCenter, screenToTile, depthKey, footprintAnchor, footprintCanvas, canvasAnchor,
  gridExtent, inGrid, snapCamera, tileRowSpan, tileMaskArea, tileOffsetInCanvas, spanDepthKey,
  Z_GROUND, Z_WATER, Z_FACILITY, Z_GUEST, Z_FACE, Z_EMOTE, Z_GHOST, Z_FX, Z_BAND,
  DEPTH_AIM_MARK, DEPTH_LAND_MARK, DEPTH_SCREEN_FX,
} from './iso.js';

describe('투영이 정수로 떨어진다', () => {
  it('격자 한 걸음이 정확히 (16, 8) 텍셀', () => {
    const o = gridToScreen(0, 0);
    expect(gridToScreen(1, 0)).toEqual({ x: o.x + 16, y: o.y + 8 });
    expect(gridToScreen(0, 1)).toEqual({ x: o.x - 16, y: o.y + 8 });
  });
  it('타일 다이아몬드가 32×16', () => {
    const v = [gridToScreen(0, 0), gridToScreen(1, 0), gridToScreen(0, 1), gridToScreen(1, 1)];
    const xs = v.map((p) => p.x);
    const ys = v.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(TILE_W);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(TILE_H);
  });
  it('격자 전체에서 정수', () => {
    for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) {
      const p = gridToScreen(i, j);
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    }
  });
  it('STEP 은 타일의 절반', () => {
    expect(STEP_X).toBe(TILE_W / 2);
    expect(STEP_Y).toBe(TILE_H / 2);
  });
});

describe('역변환', () => {
  it('타일 중심 왕복', () => {
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const c = tileCenter(i, j);
      expect(screenToTile(c.x, c.y)).toEqual({ i, j });
    }
  });
  it('타일 안 어디를 찍어도 그 타일', () => {
    const c = tileCenter(5, 7);
    for (const [dx, dy] of [[0, 0], [6, 0], [-6, 0], [0, 3], [0, -3]] as const) {
      expect(screenToTile(c.x + dx, c.y + dy)).toEqual({ i: 5, j: 7 });
    }
  });
});

describe('그리기 순서', () => {
  it('i+j 가 큰 타일이 앞', () => {
    expect(depthKey(0, 0)).toBeLessThan(depthKey(1, 0));
    expect(depthKey(3, 1)).toBeLessThan(depthKey(2, 3));
  });
  it('같은 i+j 는 i 로 안정 정렬', () => {
    expect(depthKey(1, 3)).toBeLessThan(depthKey(3, 1));
  });
  it('격자 전체에서 키가 유일', () => {
    const seen = new Set<number>();
    for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) seen.add(depthKey(i, j));
    expect(seen.size).toBe(GRID_W * GRID_H);
  });
  it('띠가 순서대로이고 Z_BAND 안', () => {
    const band = [Z_GROUND, Z_WATER, Z_FACILITY, Z_GUEST, Z_FACE, Z_EMOTE, Z_GHOST, Z_FX];
    for (let k = 1; k < band.length; k++) expect(band[k]!).toBeGreaterThan(band[k - 1]!);
    for (const z of band) expect(z).toBeLessThan(Z_BAND);
    expect(depthKey(0, 1) - depthKey(0, 0)).toBe(Z_BAND);
  });
  it('힌트 층은 가장 먼 칸의 가장 높은 띠보다 위', () => {
    const worldMax = depthKey(GRID_W - 1, GRID_H - 1) + Z_FX;
    for (const d of [DEPTH_AIM_MARK, DEPTH_LAND_MARK, DEPTH_SCREEN_FX]) expect(d).toBeGreaterThan(worldMax);
    expect(new Set([DEPTH_AIM_MARK, DEPTH_LAND_MARK, DEPTH_SCREEN_FX]).size).toBe(3);
  });
  it('걷는 손님은 두 칸 중 가까운 쪽 — 목적 칸만 쓰면 출발 칸 지면에 파묻힌다', () => {
    const from = depthKey(5, 5);
    expect(spanDepthKey(5, 5, 5, 4) + Z_GUEST).toBe(from + Z_GUEST);
    expect(depthKey(5, 4) + Z_GUEST).toBeLessThan(from + Z_GROUND);
    expect(spanDepthKey(5, 4, 5, 5)).toBe(depthKey(5, 5));
  });
});

describe('앵커', () => {
  it('정사각 발자국에서는 앵커 x 가 최하단 꼭지점 x 와 같다', () => {
    for (const n of [1, 2, 3, 4]) {
      const a = footprintAnchor(0, 0, n, n);
      expect(a).toEqual(gridToScreen(n, n));
    }
  });
  it('비정사각 4×1 은 최하단 꼭지점과 24텍셀 어긋난다', () => {
    const a = footprintAnchor(0, 0, 4, 1);
    expect(gridToScreen(4, 1).x - a.x).toBe(24);
  });
  it('캔버스 앵커는 bottom-center, 크기는 파생 수식', () => {
    expect(footprintCanvas(2, 2, 20)).toEqual({ x: 64, y: 52 });
    expect(canvasAnchor(2, 2, 20)).toEqual({ x: 32, y: 52 });
  });
  it('발자국 안 타일 오프셋이 캔버스 안', () => {
    const c = footprintCanvas(4, 1, 20);
    for (let i = 0; i < 4; i++) {
      const o = tileOffsetInCanvas(i, 0, 1, 20);
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x + TILE_W).toBeLessThanOrEqual(c.x);
      expect(o.y + TILE_H).toBeLessThanOrEqual(c.y);
    }
  });
});

describe('격자·마스크', () => {
  it('64×48 은 1792×896 텍셀, 2:1 가로형', () => {
    expect(gridExtent()).toEqual({ x: 1792, y: 896 });
    expect(inGrid(63, 47)).toBe(true);
    expect(inGrid(64, 0)).toBe(false);
  });
  it('스냅', () => {
    expect(snapCamera({ x: 10.4, y: -3.6 })).toEqual({ x: 10, y: -4 });
  });
  it('마스크 면적 256 = 기본 영역 면적', () => {
    expect(tileMaskArea()).toBe(256);
    expect(tileRowSpan(0)).toEqual({ x0: 15, x1: 17 });
    expect(tileRowSpan(7)).toEqual({ x0: 1, x1: 31 });
  });
  it('격자로 깔면 겹침 0 · 틈 0', () => {
    const cov = new Map<string, number>();
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
      const ox = STEP_X * (di - dj) - STEP_X;
      const oy = STEP_Y * (di + dj);
      for (let y = 0; y < TILE_H; y++) {
        const s = tileRowSpan(y);
        for (let x = s.x0; x < s.x1; x++) {
          const k = `${ox + x},${oy + y}`;
          cov.set(k, (cov.get(k) ?? 0) + 1);
        }
      }
    }
    for (let y = 8; y < 24; y++) for (let x = 0; x < 32; x++) expect(cov.get(`${x},${y}`) ?? 0).toBe(1);
  });
});

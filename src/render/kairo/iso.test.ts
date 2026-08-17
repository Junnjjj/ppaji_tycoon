import { describe, it, expect } from 'vitest';
import {
  TILE_W,
  TILE_H,
  STEP_X,
  STEP_Y,
  GRID_W,
  GRID_H,
  GRID_SUM_MAX,
  gridToScreen,
  tileCenter,
  screenToTile,
  depthKey,
  footprintAnchor,
  footprintCanvas,
  canvasAnchor,
  gridExtent,
  inGrid,
  snapCamera,
  tileRowSpan,
  tileMaskArea,
  tileOffsetInCanvas,
} from './iso.js';

describe('투영이 정수로 떨어진다 — 스케일 계약의 근거', () => {
  it('격자 한 걸음이 정확히 (16, 8) 텍셀이다', () => {
    const o = gridToScreen(0, 0);
    expect(gridToScreen(1, 0)).toEqual({ x: o.x + 16, y: o.y + 8 });
    expect(gridToScreen(0, 1)).toEqual({ x: o.x - 16, y: o.y + 8 });
  });

  it('타일 다이아몬드가 32×16 이다', () => {
    // 타일 (0,0) 의 네 꼭지점
    const v = [gridToScreen(0, 0), gridToScreen(1, 0), gridToScreen(0, 1), gridToScreen(1, 1)];
    const xs = v.map((p) => p.x);
    const ys = v.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(TILE_W);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(TILE_H);
  });

  it('격자 좌표를 몇 번 더해도 정수를 벗어나지 않는다', () => {
    // 소수 누적이 없다는 것이 "반 픽셀 밀림 불가능"의 근거다
    for (let i = 0; i < GRID_W; i++) {
      for (let j = 0; j < GRID_H; j++) {
        const p = gridToScreen(i, j);
        expect(Number.isInteger(p.x)).toBe(true);
        expect(Number.isInteger(p.y)).toBe(true);
      }
    }
  });

  it('STEP 은 타일 크기의 절반이다', () => {
    expect(STEP_X).toBe(TILE_W / 2);
    expect(STEP_Y).toBe(TILE_H / 2);
  });
});

describe('역변환', () => {
  it('타일 중심을 되돌리면 같은 타일이 나온다', () => {
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        const c = tileCenter(i, j);
        expect(screenToTile(c.x, c.y)).toEqual({ i, j });
      }
    }
  });

  it('타일 안 어디를 찍어도 그 타일이 나온다', () => {
    // 다이아몬드 안쪽 네 점 (꼭지점 근처는 부동소수 경계라 제외)
    const c = tileCenter(5, 7);
    const probes: readonly (readonly [number, number])[] = [
      [0, 0],
      [6, 0],
      [-6, 0],
      [0, 3],
      [0, -3],
    ];
    for (const [dx, dy] of probes) {
      expect(screenToTile(c.x + dx, c.y + dy)).toEqual({ i: 5, j: 7 });
    }
  });
});

describe('그리기 순서', () => {
  it('i+j 가 큰 타일이 나중에(앞에) 그려진다', () => {
    expect(depthKey(0, 0)).toBeLessThan(depthKey(1, 0));
    expect(depthKey(3, 1)).toBeLessThan(depthKey(2, 3));
  });

  it('i+j 가 같으면 i 로 안정 정렬된다 — 안 그러면 겹친 스프라이트가 깜빡인다', () => {
    expect(depthKey(1, 3)).toBeLessThan(depthKey(3, 1));
    expect(depthKey(2, 2)).not.toBe(depthKey(3, 1));
  });

  it('격자 전체에서 키가 유일하다', () => {
    const seen = new Set<number>();
    for (let i = 0; i < GRID_W; i++) {
      for (let j = 0; j < GRID_H; j++) seen.add(depthKey(i, j));
    }
    expect(seen.size).toBe(GRID_W * GRID_H);
  });
});

describe('앵커 — 두 정의를 섞으면 안 된다', () => {
  it('정사각 발자국에서는 앵커 x 가 최하단 꼭지점 x 와 같다', () => {
    for (const n of [1, 2, 3, 4]) {
      const a = footprintAnchor(0, 0, n, n);
      const bottomVertex = gridToScreen(n, n);
      expect(a.x).toBe(bottomVertex.x);
      expect(a.y).toBe(bottomVertex.y);
    }
  });

  it('비정사각에서는 두 정의가 어긋난다 — 4×1 은 24텍셀', () => {
    const a = footprintAnchor(0, 0, 4, 1);
    const bottomVertex = gridToScreen(4, 1);
    expect(a.y).toBe(bottomVertex.y); // y 는 같다
    expect(bottomVertex.x - a.x).toBe(24); // x 가 1.5 타일 어긋난다
  });

  it('앵커 x 는 발자국 바운딩박스의 가로 중심이다', () => {
    for (const [w, d] of [
      [1, 1],
      [4, 1],
      [2, 4],
      [6, 3],
      [8, 6],
    ] as const) {
      const xs: number[] = [];
      for (let i = 0; i <= w; i++) for (let j = 0; j <= d; j++) xs.push(gridToScreen(i, j).x);
      const center = (Math.max(...xs) + Math.min(...xs)) / 2;
      expect(footprintAnchor(0, 0, w, d).x).toBe(center);
    }
  });

  it('캔버스 안 앵커는 항상 bottom-center 다', () => {
    for (const [w, d, h] of [
      [1, 1, 8],
      [4, 1, 20],
      [6, 3, 0],
      [8, 6, 28],
    ] as const) {
      const c = footprintCanvas(w, d, h);
      expect(canvasAnchor(w, d, h)).toEqual({ x: c.x / 2, y: c.y });
    }
  });

  it('캔버스 크기가 스펙 파생 수식과 같다', () => {
    expect(footprintCanvas(2, 2, 20)).toEqual({ x: 64, y: 52 });
    expect(footprintCanvas(6, 3, 0)).toEqual({ x: 144, y: 72 });
    expect(footprintCanvas(1, 1, 8)).toEqual({ x: 32, y: 24 });
  });

  it('앵커 화면 좌표와 캔버스 내부 앵커가 일관된다', () => {
    // 캔버스 왼쪽 끝 = 앵커 화면 x − 캔버스 앵커 x = 발자국 bbox 최소 x
    for (const [w, d] of [
      [4, 1],
      [2, 4],
      [3, 3],
    ] as const) {
      const a = footprintAnchor(2, 5, w, d);
      const left = a.x - canvasAnchor(w, d, 20).x;
      const xs: number[] = [];
      for (let i = 2; i <= 2 + w; i++) for (let j = 5; j <= 5 + d; j++) xs.push(gridToScreen(i, j).x);
      expect(left).toBe(Math.min(...xs));
    }
  });
});

describe('격자', () => {
  it('아이소 바운딩박스는 항상 2:1 가로형이다 — 세로 폰에 전체가 안 들어가는 이유', () => {
    for (const [gw, gh] of [
      [40, 32],
      [10, 10],
      [8, 40],
    ] as const) {
      const e = gridExtent(gw, gh);
      expect(e.x).toBe(e.y * 2);
    }
  });

  it('40×32 격자는 1152×576 텍셀이다', () => {
    expect(gridExtent()).toEqual({ x: 1152, y: 576 });
  });

  it('격자 합이 상한 안이다 — 넘으면 세로도 팬해야 한다', () => {
    expect(GRID_W + GRID_H).toBeLessThanOrEqual(GRID_SUM_MAX);
  });

  it('경계 판정', () => {
    expect(inGrid(0, 0)).toBe(true);
    expect(inGrid(GRID_W - 1, GRID_H - 1)).toBe(true);
    expect(inGrid(-1, 0)).toBe(false);
    expect(inGrid(GRID_W, 0)).toBe(false);
    expect(inGrid(0, GRID_H)).toBe(false);
  });
});

describe('카메라 스냅', () => {
  it('정수로 반올림한다', () => {
    expect(snapCamera({ x: 10.4, y: -3.6 })).toEqual({ x: 10, y: -4 });
  });

  it('이미 정수면 그대로다', () => {
    expect(snapCamera({ x: 16, y: 8 })).toEqual({ x: 16, y: 8 });
  });
});

describe('타일 마스크 — 이음새 0 의 근거', () => {
  it('마스크 픽셀 수가 격자 기본 영역 면적(256)과 같다', () => {
    // 격자 (16,8)·(−16,8) 의 행렬식 = |16·8 − 8·(−16)| = 256
    expect(Math.abs(STEP_X * STEP_Y - STEP_Y * -STEP_X)).toBe(256);
    expect(tileMaskArea()).toBe(256);
  });

  it('행 구간이 위아래 대칭이고 가운데 두 행이 가장 넓다', () => {
    for (let y = 0; y < TILE_H; y++) {
      const a = tileRowSpan(y);
      const b = tileRowSpan(TILE_H - 1 - y);
      expect(a).toEqual(b);
    }
    expect(tileRowSpan(0)).toEqual({ x0: 15, x1: 17 });
    expect(tileRowSpan(7)).toEqual({ x0: 1, x1: 31 });
    expect(tileRowSpan(8)).toEqual({ x0: 1, x1: 31 });
  });

  it('격자로 깔면 겹침 0 · 틈 0 이다 — 1px 이음새의 직접적 반증', () => {
    const cov = new Map<string, number>();
    // 중앙을 충분히 둘러싸도록 이웃까지 깐다
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
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
    }
    // 중앙 영역은 정확히 1번씩 덮여야 한다 (가장자리는 이웃이 없어 제외)
    let checked = 0;
    for (let y = 8; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        expect(cov.get(`${x},${y}`) ?? 0, `(${x},${y})`).toBe(1);
        checked++;
      }
    }
    expect(checked).toBe(32 * 16);
  });

  it('발자국 안 타일 오프셋이 정수이고 캔버스 안에 들어간다', () => {
    for (const [w, d, h] of [
      [1, 1, 0],
      [4, 1, 20],
      [6, 3, 0],
      [8, 6, 28],
    ] as const) {
      const c = footprintCanvas(w, d, h);
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
          const o = tileOffsetInCanvas(i, j, d, h);
          expect(Number.isInteger(o.x)).toBe(true);
          expect(Number.isInteger(o.y)).toBe(true);
          expect(o.x).toBeGreaterThanOrEqual(0);
          expect(o.y).toBeGreaterThanOrEqual(0);
          expect(o.x + TILE_W).toBeLessThanOrEqual(c.x);
          expect(o.y + TILE_H).toBeLessThanOrEqual(c.y);
        }
      }
    }
  });
});

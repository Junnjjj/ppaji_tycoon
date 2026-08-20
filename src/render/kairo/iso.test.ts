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
  spanDepthKey,
  Z_GROUND,
  Z_WALL_BACK,
  Z_FACILITY,
  Z_WALL_FRONT,
  Z_GUEST,
  Z_FACE,
  Z_EMOTE,
  Z_GHOST,
  Z_FLOAT,
  Z_BAND,
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

  it('96×72 격자는 2688×1344 텍셀이다 (K36 확대)', () => {
    expect(gridExtent()).toEqual({ x: 2688, y: 1344 });
  });

  it('⚠ 격자 합이 상한을 넘는다 — K25 부터 세로도 팬한다', () => {
    // 상한은 "세로 팬이 필요없다"는 편의였다. 넘은 것을 못박아 두어야 되돌림이 보인다
    expect(GRID_W + GRID_H).toBe(168);
    expect(GRID_W + GRID_H).toBeGreaterThan(GRID_SUM_MAX);
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

describe('깊이 띠 — 칸 하나 안의 순서 (K37)', () => {
  it('★ 띠가 순서대로이고 전부 칸 간격(4096) 안에 들어간다', () => {
    const band = [
      ['지면', Z_GROUND],
      ['뒤쪽 벽', Z_WALL_BACK],
      ['시설', Z_FACILITY],
      ['앞쪽 벽', Z_WALL_FRONT],
      ['손님', Z_GUEST],
      ['표정', Z_FACE],
      ['이모트', Z_EMOTE],
      ['고스트', Z_GHOST],
      ['떠오르는 숫자', Z_FLOAT],
    ] as const;
    for (let k = 1; k < band.length; k++) {
      const [prevName, prev] = band[k - 1] as readonly [string, number];
      const [name, cur] = band[k] as readonly [string, number];
      expect(cur, `${prevName} < ${name}`).toBeGreaterThan(prev);
    }
    // 띠가 4096 을 넘으면 다음 칸을 침범해 아이소 정렬이 통째로 뒤집힌다
    for (const [name, z] of band) {
      expect(z, name).toBeGreaterThanOrEqual(0);
      expect(z, name).toBeLessThan(Z_BAND);
    }
  });

  it('칸 간격이 실제로 Z_BAND 다 — 띠 상한의 근거', () => {
    // (i+j) 가 한 칸 늘면 depthKey 는 정확히 Z_BAND 만큼 뛴다
    expect(depthKey(0, 1) - depthKey(0, 0)).toBe(Z_BAND);
    expect(depthKey(1, 0) - depthKey(0, 0)).toBe(Z_BAND + 1);
  });

  it('★ 앞쪽 벽이 같은 칸 시설보다 앞이고, 다음 칸 시설보다는 뒤다', () => {
    for (const [i, j] of [
      [0, 0],
      [5, 7],
      [40, 30],
    ] as const) {
      const wallFront = depthKey(i, j) + Z_WALL_FRONT;
      const facility = depthKey(i, j) + Z_FACILITY;
      const wallBack = depthKey(i, j) + Z_WALL_BACK;
      // ① 같은 칸: 앞쪽 벽 > 시설 > 뒤쪽 벽 > 지면
      expect(wallFront).toBeGreaterThan(facility);
      expect(facility).toBeGreaterThan(wallBack);
      expect(wallBack).toBeGreaterThan(depthKey(i, j) + Z_GROUND);
      // ② 다음 칸의 시설은 여전히 더 앞이다 (벽이 다음 칸을 넘어 덮지 않는다)
      expect(depthKey(i + 1, j) + Z_FACILITY).toBeGreaterThan(wallFront);
      expect(depthKey(i, j + 1) + Z_FACILITY).toBeGreaterThan(wallFront);
      // ③ K29 계약 — 손님은 앞쪽 벽보다 앞이다 (유리로 만든 이유)
      expect(depthKey(i, j) + Z_GUEST).toBeGreaterThan(wallFront);
    }
  });

  it('음성 대조군 — 앞쪽 벽이 시설과 같은 띠면 동률이 되어 삽입 순서에 맡겨진다', () => {
    // K37 이전 값: 앞쪽 벽도 시설도 `depthKey + 2` 였다
    const OLD_WALL_FRONT = 2;
    expect(depthKey(5, 5) + OLD_WALL_FRONT).toBe(depthKey(5, 5) + Z_FACILITY);
    // 지금 값은 동률이 아니다
    expect(depthKey(5, 5) + Z_WALL_FRONT).not.toBe(depthKey(5, 5) + Z_FACILITY);
  });
});

describe('손님 깊이는 두 칸 중 가까운 쪽 (K37)', () => {
  it('★ 위로 걸을 때 출발 칸 깊이를 쓴다 — 목적 칸을 쓰면 출발 칸 지면에 파묻힌다', () => {
    // (5,5) → (5,4): 목적지가 더 먼 칸이다 (i+j 가 준다)
    const from = depthKey(5, 5);
    const to = depthKey(5, 4);
    expect(to).toBeLessThan(from);

    const good = spanDepthKey(5, 5, 5, 4) + Z_GUEST;
    expect(good).toBe(from + Z_GUEST);
    // 출발 칸의 지면보다 앞이다 → 안 파묻힌다
    expect(good).toBeGreaterThan(from + Z_GROUND);

    // 음성 대조군 — 목적 칸 깊이를 쓰면 출발 칸 **지면**보다도 뒤가 된다
    const bad = to + Z_GUEST;
    expect(bad).toBeLessThan(from + Z_GROUND);
    expect(from + Z_GROUND - bad).toBe(4092); // 4096 − Z_GUEST
  });

  it('아래로 걸을 때는 목적 칸이 곧 가까운 칸이다 (버그가 안 보였던 방향)', () => {
    expect(spanDepthKey(5, 4, 5, 5)).toBe(depthKey(5, 5));
    expect(spanDepthKey(5, 5, 6, 5)).toBe(depthKey(6, 5));
  });

  it('멈춰 있으면 두 칸이 같아 예전 값과 똑같다', () => {
    expect(spanDepthKey(9, 3, 9, 3)).toBe(depthKey(9, 3));
  });

  it('같은 i+j 안에서는 i 가 큰 쪽 — 안정 정렬이 유지된다', () => {
    // (6,4) → (5,5) 는 화면 높이가 같다. i 로 갈리므로 (6,4) 가 가깝다
    expect(spanDepthKey(6, 4, 5, 5)).toBe(depthKey(6, 4));
    expect(spanDepthKey(5, 5, 6, 4)).toBe(depthKey(6, 4));
  });
});

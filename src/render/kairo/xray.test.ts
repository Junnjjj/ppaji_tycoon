import { describe, it, expect } from 'vitest';
import {
  depthKey,
  Z_FACILITY,
  Z_WALL_FRONT,
  Z_WALL_BACK,
  Z_GHOST,
  Z_GROUND,
  LEVEL_H,
} from './iso.js';
import { overlaps, occludes, footprintRect, XRAY_ALPHA, type Rect } from './xray.js';

/** 시설 스프라이트의 대략적인 화면 사각형 — 바닥 마름모 위로 `bodyH` 만큼 솟는다 */
function facilityRect(i: number, j: number, w: number, d: number, bodyH: number, dy = 0): Rect {
  const f = footprintRect(i, j, w, d, dy);
  return { ...f, y0: f.y0 - bodyH };
}

/** 발자국 w×d 가 (i,j) 에 놓인 시설/고스트의 깊이 — 씬과 같은 규칙(가장 앞 타일) */
function footDepth(i: number, j: number, w: number, d: number, band: number): number {
  return depthKey(i + w - 1, j + d - 1) + band;
}

describe('겹침 판정', () => {
  const a: Rect = { x0: 0, y0: 0, x1: 10, y1: 10 };

  it('안쪽으로 물린 사각형은 겹친다', () => {
    expect(overlaps(a, { x0: 5, y0: 5, x1: 15, y1: 15 })).toBe(true);
    expect(overlaps({ x0: 5, y0: 5, x1: 15, y1: 15 }, a)).toBe(true);
  });

  it('경계가 맞닿기만 하면 겹침이 아니다 — 옆 칸 건물이 흐려지면 판이 뿌예진다', () => {
    expect(overlaps(a, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(overlaps(a, { x0: 0, y0: 10, x1: 10, y1: 20 })).toBe(false);
  });

  it('한 축만 겹치면 겹침이 아니다', () => {
    expect(overlaps(a, { x0: 5, y0: 20, x1: 15, y1: 30 })).toBe(false);
    expect(overlaps(a, { x0: 20, y0: 5, x1: 30, y1: 15 })).toBe(false);
  });

  it('완전히 품은 것도 겹친다 — 큰 건물이 고스트를 삼키는 경우가 정확히 이것이다', () => {
    expect(overlaps(a, { x0: -5, y0: -5, x1: 20, y1: 20 })).toBe(true);
    expect(overlaps({ x0: -5, y0: -5, x1: 20, y1: 20 }, a)).toBe(true);
  });
});

describe('발자국 화면 사각형', () => {
  it('1×1 은 타일 하나 크기다', () => {
    expect(footprintRect(4, 4, 1, 1)).toEqual({ x0: -16, y0: 64, x1: 16, y1: 80 });
  });

  it('비정사각은 가로·세로가 따로 자란다 (w↔d 를 헷갈리면 24텍셀 밀린다)', () => {
    const r = footprintRect(4, 4, 3, 1);
    expect(r.x1 - r.x0).toBe((3 + 1) * 16);
    expect(r.y1 - r.y0).toBe((3 + 1) * 8);
    // +I 로 긴 발자국은 오른쪽으로 뻗는다 — 왼쪽 끝은 d 만 따라간다
    expect(r.x0).toBe(-16);
    expect(r.x1).toBe(48);
  });

  it('단 리프트를 탄다 — 안 태우면 산 위 조준에서 판정이 어긋난다', () => {
    const flat = footprintRect(6, 6, 2, 2, 0);
    const up = footprintRect(6, 6, 2, 2, -3 * LEVEL_H);
    expect(up.y0).toBe(flat.y0 - 24);
    expect(up.y1).toBe(flat.y1 - 24);
    expect(up.x0).toBe(flat.x0);
  });
});

describe('가림 판정 — 조준 중 무엇을 투명하게 하나', () => {
  /* 고스트: (10,10) 에 2×2. 깊이는 발자국 앞 타일 기준 */
  const gi = 10;
  const gj = 10;
  const ghostDepth = footDepth(gi, gj, 2, 2, Z_GHOST);
  const ghostRect = facilityRect(gi, gj, 2, 2, 40);

  it('★ 앞에 있고 겹치는 시설은 가린다', () => {
    // (11,11) — i+j 가 2 크다. 3×3 이라 고스트를 화면에서 덮는다
    const depth = footDepth(11, 11, 3, 3, Z_FACILITY);
    const rect = facilityRect(11, 11, 3, 3, 48);
    expect(depth).toBeGreaterThan(ghostDepth);
    expect(overlaps(ghostRect, rect)).toBe(true);
    expect(occludes(ghostDepth, ghostRect, depth, rect)).toBe(true);
  });

  it('음성 대조군 ① — 뒤에 있으면 겹쳐도 안 가린다 (고스트가 이미 이긴다)', () => {
    // (8,8) — 고스트보다 뒤. 키가 커서 화면에서는 겹친다
    const depth = footDepth(8, 8, 3, 3, Z_FACILITY);
    const rect = facilityRect(8, 8, 3, 3, 96);
    expect(depth).toBeLessThan(ghostDepth);
    expect(overlaps(ghostRect, rect)).toBe(true); // 겹침은 실제로 있다
    expect(occludes(ghostDepth, ghostRect, depth, rect)).toBe(false);
  });

  it('음성 대조군 ② — 앞에 있어도 화면에서 안 겹치면 그대로다', () => {
    // (30,30) — 훨씬 앞이지만 화면상 한참 아래
    const depth = footDepth(30, 30, 2, 2, Z_FACILITY);
    const rect = facilityRect(30, 30, 2, 2, 48);
    expect(depth).toBeGreaterThan(ghostDepth);
    expect(overlaps(ghostRect, rect)).toBe(false);
    expect(occludes(ghostDepth, ghostRect, depth, rect)).toBe(false);
  });

  it('음성 대조군 ③ — 같은 칸의 앞벽은 고스트보다 낮다 (띠 상수가 그렇게 정해져 있다)', () => {
    const wall = depthKey(gi, gj) + Z_WALL_FRONT;
    const rect = footprintRect(gi, gj, 1, 1);
    expect(occludes(ghostDepth, ghostRect, wall, rect)).toBe(false);
  });

  it('앞 칸의 벽은 앞벽·뒷벽 가리지 않고 가린다 — 깊이 하나로만 가른다', () => {
    const front = depthKey(gi + 2, gj + 2) + Z_WALL_FRONT;
    const back = depthKey(gi + 2, gj + 2) + Z_WALL_BACK;
    // 벽 스프라이트는 10텍셀 — 칸 위로 솟아 고스트 아랫자락과 겹친다
    const rect = facilityRect(gi + 2, gj + 2, 1, 1, 10);
    expect(overlaps(ghostRect, rect)).toBe(true);
    expect(occludes(ghostDepth, ghostRect, front, rect)).toBe(true);
    expect(occludes(ghostDepth, ghostRect, back, rect)).toBe(true);
  });

  it('지면은 대상이 아니다 — 같은 칸 지면 띠는 고스트보다 한참 낮다', () => {
    expect(Z_GROUND).toBeLessThan(Z_GHOST);
    const ground = depthKey(gi, gj) + Z_GROUND;
    expect(occludes(ghostDepth, ghostRect, ground, footprintRect(gi, gj, 1, 1))).toBe(false);
  });

  it('깊이가 정확히 같으면 안 가린다 — 동률은 Phaser 가 삽입 순서로 그려 불안정하다', () => {
    expect(occludes(ghostDepth, ghostRect, ghostDepth, ghostRect)).toBe(false);
  });
});

describe('알파 값', () => {
  it('"살짝"이다 — 실루엣이 남고 안이 비치는 대역', () => {
    expect(XRAY_ALPHA).toBeGreaterThanOrEqual(0.35);
    expect(XRAY_ALPHA).toBeLessThanOrEqual(0.5);
  });

  it('고스트 자신(0.62)보다 낮다 — 같으면 어느 쪽이 앞인지 안 읽힌다', () => {
    expect(XRAY_ALPHA).toBeLessThan(0.62);
  });
});

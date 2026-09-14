/**
 * 2:1 다이메트릭 투영 — **이 파일이 스케일의 유일한 출처다.** 화면 좌표를 직접 계산하는
 * 코드를 다른 데 만들지 말 것 (부모 `src/render/kairo/iso.ts` 의 수식을 그대로 가져왔다).
 *
 * yaw 45°·elev 30° 에서 타일 다이아몬드 32×16 텍셀이면 격자 한 걸음의 화면 이동이
 *     +I → (+16, +8)   +J → (−16, +8)
 * 정확한 정수다. 소수 누적이 없어 스프라이트가 반 픽셀 밀려 흐려지는 사고가 구조적으로 없다.
 * 단위는 전부 **텍셀**이다. 화면 CSS px 는 정수 업스케일 S 하나가 정한다 (`upscale.ts`).
 */
import { GRID_W, GRID_H } from '../sim/grid.js';

export { GRID_W, GRID_H };

export const TILE_W = 32;
export const TILE_H = 16;
export const STEP_X = TILE_W / 2; // 16
export const STEP_Y = TILE_H / 2; // 8

export interface Vec2 {
  x: number;
  y: number;
}

/** 격자 꼭지점 (i, j) → 화면 텍셀 */
export function gridToScreen(i: number, j: number): Vec2 {
  return { x: STEP_X * (i - j), y: STEP_Y * (i + j) };
}

/** 타일 (i, j) 의 중심 화면 텍셀 */
export function tileCenter(i: number, j: number): Vec2 {
  return gridToScreen(i + 0.5, j + 0.5);
}

/** 화면 텍셀 → 타일 (내림) — `gridToScreen` 의 역행렬 */
export function screenToTile(x: number, y: number): { i: number; j: number } {
  const a = x / (2 * STEP_X);
  const b = y / (2 * STEP_Y);
  return { i: Math.floor(a + b), j: Math.floor(b - a) };
}

/** 그리기 순서 키 — `i+j` 가 클수록 앞. 같은 값은 `i` 로 안정 정렬 */
export function depthKey(i: number, j: number): number {
  return (i + j) * Z_BAND + i;
}

/**
 * 칸 하나 안의 하위 깊이 띠. 전부 `Z_BAND` 미만이어야 다음 칸을 침범하지 않는다.
 * 순서: 지면 → 풀 수면 → 시설 → 손님 → 표정 → 말풍선 표식 → 고스트 → 떠오르는 연출.
 */
export const Z_BAND = 4096;
export const Z_GROUND = 0;
export const Z_WATER = 1;
export const Z_FACILITY = 2;
export const Z_GUEST = 4;
export const Z_FACE = 5;
export const Z_EMOTE = 6;
export const Z_GHOST = 7;
export const Z_FX = 8;

/** 세계 물체가 아닌 **힌트 층** — 어떤 칸보다도 위. 값이 아니라 순서가 계약이다 */
export const DEPTH_AIM_MARK = 9_000_000;
export const DEPTH_LAND_MARK = 9_000_001;
export const DEPTH_SCREEN_FX = 9_000_100;

/** 한 단(슬라이드 층)의 화면 높이 — `STEP_Y` 와 같아 한 단 = 한 칸 뒤로 물러난 양 */
export const LEVEL_H = 8;

export function lift(level: number): number {
  return -level * LEVEL_H;
}

/** 두 칸에 걸친 것(걷는 손님)의 깊이 기준 — 가까운 쪽. 목적 칸만 쓰면 출발 칸 지면에 파묻힌다 */
export function spanDepthKey(fromI: number, fromJ: number, toI: number, toJ: number): number {
  return Math.max(depthKey(fromI, fromJ), depthKey(toI, toJ));
}

/**
 * 발자국 w×d 가 (i, j) 에 놓였을 때의 앵커 화면 텍셀 —
 * x = 발자국 bbox 가로 중심, y = 최하단 꼭지점. 비정사각에서 최하단 꼭지점의 x 를 쓰면 24텍셀 밀린다.
 */
export function footprintAnchor(i: number, j: number, w: number, d: number): Vec2 {
  return { x: STEP_X * (i - j) + (STEP_X * (w - d)) / 2, y: STEP_Y * (i + j + w + d) };
}

/** 발자국 w×d 스프라이트의 캔버스 크기 */
export function footprintCanvas(w: number, d: number, bodyH: number): Vec2 {
  return { x: (w + d) * STEP_X, y: (w + d) * STEP_Y + bodyH };
}

/** 캔버스 내부 앵커 — 항상 bottom-center */
export function canvasAnchor(w: number, d: number, bodyH: number): Vec2 {
  const c = footprintCanvas(w, d, bodyH);
  return { x: c.x / 2, y: c.y };
}

export function gridExtent(gw = GRID_W, gh = GRID_H): Vec2 {
  return { x: (gw + gh) * STEP_X, y: (gw + gh) * STEP_Y };
}

export function inGrid(i: number, j: number, gw = GRID_W, gh = GRID_H): boolean {
  return i >= 0 && j >= 0 && i < gw && j < gh;
}

/** 카메라 텍셀 스냅 — 그리기 직전에 정수로. 반올림 전 값은 따로 누적한다 */
export function snapCamera(v: Vec2): Vec2 {
  return { x: Math.round(v.x), y: Math.round(v.y) };
}

/**
 * 타일 다이아몬드의 정수 스캔라인 마스크. `fill()` 의 안티에일리어싱이 만드는 1px 이음새를
 * 구조적으로 없앤다 — 격자 (16,8)·(−16,8) 로 평면을 겹침 0·틈 0 으로 덮는다 (면적 256).
 */
export function tileRowSpan(y: number): { x0: number; x1: number } {
  const hw = 1 + 2 * Math.min(y, TILE_H - 1 - y);
  return { x0: TILE_W / 2 - hw, x1: TILE_W / 2 + hw };
}

export function tileMaskArea(): number {
  let n = 0;
  for (let y = 0; y < TILE_H; y++) {
    const s = tileRowSpan(y);
    n += s.x1 - s.x0;
  }
  return n;
}

/** 발자국 안 타일 (i, j) 의 캔버스 좌상단 오프셋 */
export function tileOffsetInCanvas(i: number, j: number, d: number, bodyH = 0): Vec2 {
  return { x: STEP_X * (i - j) + STEP_X * d - STEP_X, y: STEP_Y * (i + j) + bodyH };
}

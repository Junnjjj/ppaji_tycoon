/**
 * 카이로 2:1 아이소메트릭 투영 — 스펙 §1.
 *
 * **이 파일이 스케일의 유일한 출처다.** 화면 좌표를 직접 계산하는 코드를 다른 데
 * 만들지 말 것 — 여기서만 나가야 한다.
 *
 * ## 왜 (16, 8) 인가
 *
 * yaw 45° · elev 30° 에서 `sin30 = 0.5` 이므로 지면축의 화면 기울기가 정확히 1:2 다.
 * 타일 다이아몬드를 32×16 텍셀로 잡으면 격자 한 걸음의 화면 이동이
 *
 *     +I 한 걸음 → ( +16, +8 )
 *     +J 한 걸음 → ( -16, +8 )
 *
 * **정확한 정수**가 된다. 소수 누적이 없으니 격자 좌표를 몇 번 더해도 텍셀 격자를
 * 벗어나지 않는다 — 스프라이트가 반 픽셀 밀려 흐려지는 사고가 구조적으로 불가능하다.
 *
 * ## 단위
 *
 * 전부 **텍셀**이다. 월드 단위·CSS 픽셀 같은 중간 단위를 두지 않는다.
 * 화면에 실제로 몇 CSS px 인지는 정수 업스케일 S 하나가 결정한다 (스펙 §1.4).
 * 예전에 텍셀·월드·화면 세 단위를 섞어 쓰다 스프라이트가 1.9배로 커진 사고가 있었다.
 */

/** 타일 다이아몬드 — 카이로 실측 (레퍼런스 업스케일 2.5배를 나눈 값. 스펙 §1.2) */
export const TILE_W = 32;
export const TILE_H = 16;

/** 격자 한 걸음의 화면 이동. `TILE_W/2`, `TILE_H/2` 지만 이름을 줘서 의도를 남긴다 */
export const STEP_X = TILE_W / 2; // 16
export const STEP_Y = TILE_H / 2; // 8

/**
 * 격자 크기 — 스펙 §1.6, **K25 에서 40×32 → 64×48 로 넓혔다**.
 *
 * 40×32 는 한 화면에 거의 다 들어와서 "지도를 넓힌다"는 감각이 없었다. 이제 전체는
 * 세로로도 팬해야 보이고, 처음부터 다 쓸 수 있는 것도 아니다 — 등급마다 게이트 쪽
 * 사각형이 넓어진다 (`landRect`). 넓힌 땅이 곧 다음 목표가 된다.
 */
export const GRID_W = 64;
export const GRID_H = 48;

/**
 * 격자 합 상한. 넘으면 세로로도 팬해야 한다 (852 / STEP_Y = 106.5).
 *
 * ⚠ K25 에서 이 선을 **의도적으로 넘었다** (64+48 = 112). 세로 팬은 카메라가 이미
 * 지원한다 (`KairoCamera.range()` 의 `tallEnough`). 상한은 "세로 팬이 필요없다"는
 * 편의였지 정확성 조건이 아니었다. 값은 남겨 둔다 — 얼마나 넘었는지가 보여야 한다.
 */
export const GRID_SUM_MAX = 100;

export interface Vec2 {
  x: number;
  y: number;
}

/** 격자 꼭지점 (i, j) → 화면 텍셀. i·j 는 타일 경계이므로 정수면 결과도 정수다 */
export function gridToScreen(i: number, j: number): Vec2 {
  return { x: STEP_X * (i - j), y: STEP_Y * (i + j) };
}

/** 타일 (i, j) 의 중심 화면 텍셀 — 꼭지점이 아니라 칸 가운데 */
export function tileCenter(i: number, j: number): Vec2 {
  return gridToScreen(i + 0.5, j + 0.5);
}

/**
 * 화면 텍셀 → 격자 타일 좌표 (내림). 탭 판정에 쓴다.
 *
 * `gridToScreen` 의 역행렬이다:
 *   i = x / (2·STEP_X) + y / (2·STEP_Y)
 *   j = y / (2·STEP_Y) - x / (2·STEP_X)
 */
export function screenToTile(x: number, y: number): { i: number; j: number } {
  const a = x / (2 * STEP_X);
  const b = y / (2 * STEP_Y);
  return { i: Math.floor(a + b), j: Math.floor(b - a) };
}

/**
 * 그리기 순서 키. 작을수록 먼저(뒤에) 그린다.
 *
 * 아이소메트릭에서 `i + j` 가 같은 타일들은 화면 같은 높이에 있어 겹치지 않는다.
 * 같은 값 안에서는 `i` 로 안정 정렬해 프레임마다 순서가 뒤집히지 않게 한다
 * (뒤집히면 겹친 스프라이트가 깜빡인다).
 */
export function depthKey(i: number, j: number): number {
  return (i + j) * 4096 + i;
}

/**
 * 발자국 w×d 가 (i, j) 에 놓였을 때의 **앵커 화면 텍셀**.
 *
 * ⚠ 앵커는 두 값의 조합이고, 이 둘은 **정사각 발자국에서만 같은 점**이다:
 *   x = 발자국 바운딩박스의 가로 중심   (= 캔버스 가로 중심)
 *   y = 발자국 최하단(카메라 쪽) 꼭지점
 *
 * 비정사각에서 최하단 꼭지점의 x 는 `STEP_X·(i−j) + TILE_W·(w−d)/2` 가 아니라
 * `STEP_X·(i−j+w−d)` 라서 최대 24텍셀(1.5타일) 어긋난다. 발자국 73종 중 32종이
 * 비정사각이다. 이 혼동으로 건물이 제 타일에서 밀려나는 버그를 두 번 겪었다.
 */
export function footprintAnchor(i: number, j: number, w: number, d: number): Vec2 {
  return {
    x: STEP_X * (i - j) + (STEP_X * (w - d)) / 2,
    y: STEP_Y * (i + j + w + d),
  };
}

/** 발자국 w×d 의 스프라이트 캔버스 크기 — 스펙 §4 파생 수식 */
export function footprintCanvas(w: number, d: number, bodyH: number): Vec2 {
  return { x: (w + d) * STEP_X, y: (w + d) * STEP_Y + bodyH };
}

/**
 * 발자국 w×d 스프라이트의 **캔버스 내부** 앵커 위치.
 * 항상 `bottom-center` 다 — 기존 에셋 레이어의 `Anchor` 타입이 그대로 쓰인다.
 */
export function canvasAnchor(w: number, d: number, bodyH: number): Vec2 {
  const c = footprintCanvas(w, d, bodyH);
  return { x: c.x / 2, y: c.y };
}

/** 격자 전체가 화면에서 차지하는 크기 (텍셀). 아이소 바운딩박스는 항상 2:1 가로형이다 */
export function gridExtent(gw = GRID_W, gh = GRID_H): Vec2 {
  return { x: (gw + gh) * STEP_X, y: (gw + gh) * STEP_Y };
}

/** 타일이 격자 안인가 */
export function inGrid(i: number, j: number, gw = GRID_W, gh = GRID_H): boolean {
  return i >= 0 && j >= 0 && i < gw && j < gh;
}

/**
 * 카메라 텍셀 스냅 — 스펙 §1.5.
 *
 * 팬으로 카메라가 소수 좌표에 놓이면 **모든** 스프라이트가 반 픽셀 밀려 흐려진다.
 * 그리기 직전에 정수로 반올림한다. 반올림 **전** 값을 따로 들고 있어야 관성이
 * 끊기지 않는다 — 반올림된 값을 다시 누적하면 느린 드래그가 아예 안 먹는다.
 */
export function snapCamera(v: Vec2): Vec2 {
  return { x: Math.round(v.x), y: Math.round(v.y) };
}

/**
 * 타일 다이아몬드의 **정수 스캔라인 마스크**.
 *
 * 다이아몬드를 캔버스 `fill()` 로 그리면 경계가 안티에일리어싱되어 **타일 사이에
 * 1px 이음새**가 보인다 (K1 스크린샷에서 격자 무늬로 드러났다). 픽셀아트에서는 경계를
 * 정수로 딱 끊어야 한다.
 *
 * 행 `y` 의 채우는 구간은 `[TILE_W/2 − hw, TILE_W/2 + hw)`, `hw = 1 + 2·min(y, H−1−y)`.
 *
 * 이 마스크는 격자 `(16,8)`·`(−16,8)` 로 평면을 **겹침 0 · 틈 0** 으로 덮는다.
 * 근거: 그 격자의 기본 영역 면적이 `|16·8 − 8·(−16)| = 256` 이고 마스크가 정확히
 * 256 픽셀이다. 검증은 `iso.test.ts` 가 격자 산술로 직접 한다.
 */
export function tileRowSpan(y: number): { x0: number; x1: number } {
  const hw = 1 + 2 * Math.min(y, TILE_H - 1 - y);
  return { x0: TILE_W / 2 - hw, x1: TILE_W / 2 + hw };
}

/** 마스크의 픽셀 수 — 기본 영역 면적과 같아야 한다 */
export function tileMaskArea(): number {
  let n = 0;
  for (let y = 0; y < TILE_H; y++) {
    const s = tileRowSpan(y);
    n += s.x1 - s.x0;
  }
  return n;
}

/**
 * 발자국 안의 타일 (i, j) 의 **캔버스 좌상단 오프셋**.
 *
 * 캔버스 왼쪽 끝은 발자국 bbox 의 최소 x(= −STEP_X·d)이므로 `d` 만 필요하고 `w` 는
 * 쓰이지 않는다. `bodyH` 는 다이아몬드가 캔버스 하단에 앉게 아래로 미는 양이다.
 */
export function tileOffsetInCanvas(i: number, j: number, d: number, bodyH = 0): Vec2 {
  return {
    x: STEP_X * (i - j) + STEP_X * d - STEP_X,
    y: STEP_Y * (i + j) + bodyH,
  };
}

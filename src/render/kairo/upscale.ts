/**
 * 정수 업스케일 — 스펙 §1.4.
 *
 * "도트 느낌이 안 난다"의 원인이 세 번 다 **비정수 배율**이었다 (논리 320 → 캔버스 393
 * = ×1.228). 확대를 **정수 S** 하나로 제한해 비정수 배율을 표현 불가능하게 만든다.
 *
 *     버퍼(텍셀) = 캔버스 내부 해상도 = ceil(CSS / S)
 *     캔버스 CSS(px)                = 버퍼 × S     ← 화면보다 최대 S−1 px 넘친다
 *     텍셀 1개가 차지하는 디바이스 픽셀 = S × round(DPR)
 *
 * ## ⚠ 카메라 줌을 쓰지 않는 이유 (실측)
 *
 * Phaser 의 `camera.setZoom(2)` 는 줌을 카메라 중점 기준으로 걸기 때문에 worldView 가
 * `width·(1−1/z)/2` 만큼 밀린다. 화면 393px 에서 그 값이 **98.25px** — 우리가 없애려던
 * 반 픽셀이 정확히 여기서 다시 들어온다. 그래서 **카메라 줌은 1 에 고정**하고,
 * 확대는 캔버스 전체(ScaleManager)를 정수배로 늘려서 한다. 내부 해상도가 줄어들 뿐
 * 좌표계는 항상 텍셀 1:1 이다.
 *
 * ## DPR
 *
 * 캔버스 백킹은 버퍼 크기 그대로 두고 CSS 크기만 S 배로 늘린다. 브라우저가 거기에 DPR 을
 * 곱하므로 텍셀 하나는 `S × round(DPR)` 개의 디바이스 픽셀이 된다. **DPR 을 정수로
 * 반올림**해야 이 값이 정수로 남는다 — 안드로이드의 2.625·2.75 를 그대로 쓰면
 * S 를 정수로 묶은 의미가 사라진다.
 *
 * 넘치는 S−1 px 는 `overflow: hidden` 으로 자른다. 반대로 버퍼를 내림하면 화면 끝에
 * 배경색 띠가 생긴다 — 자르는 쪽이 낫다.
 */

/** 허용 업스케일 단. 확대만 있고 축소는 없다 (전체 조망은 팬으로 한다) */
export const UPSCALE_STEPS = [1, 2] as const;
export type Upscale = (typeof UPSCALE_STEPS)[number];

export const UPSCALE_DEFAULT: Upscale = 1;

export interface Viewport {
  /** 렌더 버퍼 = 캔버스 내부 해상도 (텍셀) */
  bufferW: number;
  bufferH: number;
  /** 캔버스 CSS 크기 — 화면보다 최대 S−1 px 크다 */
  cssW: number;
  cssH: number;
  /** 실제 적용된 정수 DPR */
  dpr: number;
  /** 텍셀 1개가 차지하는 디바이스 픽셀 수. 정수여야 한다 */
  deviceScale: number;
  /** 화면을 넘치는 양 (CSS px). overflow:hidden 이 자른다 */
  overflowX: number;
  overflowY: number;
}

/** DPR 을 정수로 — 2.625·2.75 같은 값이 비정수 배율을 만든다 */
export function integerDpr(raw: number): number {
  return Math.max(1, Math.min(3, Math.round(raw)));
}

export function viewport(cssW: number, cssH: number, s: Upscale, rawDpr: number): Viewport {
  const dpr = integerDpr(rawDpr);
  const bufferW = Math.ceil(cssW / s);
  const bufferH = Math.ceil(cssH / s);
  const outW = bufferW * s;
  const outH = bufferH * s;
  return {
    bufferW,
    bufferH,
    cssW: outW,
    cssH: outH,
    dpr,
    deviceScale: s * dpr,
    overflowX: outW - cssW,
    overflowY: outH - cssH,
  };
}

/** 다음/이전 업스케일 단. 사다리 밖으로 나가지 않는다 */
export function stepUpscale(cur: Upscale, dir: 1 | -1): Upscale {
  const i = UPSCALE_STEPS.indexOf(cur);
  const next = Math.max(0, Math.min(UPSCALE_STEPS.length - 1, i + dir));
  return UPSCALE_STEPS[next]!;
}

/**
 * 이 뷰포트가 도트 격자를 지키는가. 테스트와 런타임 자기진단이 쓴다.
 * 어긋나면 스프라이트 텍셀이 화면 픽셀과 1:정수로 매핑되지 않는다.
 */
export function violatesDotGrid(v: Viewport, s: Upscale): string[] {
  const bad: string[] = [];
  if (!Number.isInteger(s)) bad.push(`업스케일이 정수가 아니다: ${s}`);
  if (!Number.isInteger(v.dpr)) bad.push(`DPR 이 정수가 아니다: ${v.dpr}`);
  if (v.cssW !== v.bufferW * s) bad.push('CSS 폭이 버퍼×S 가 아니다');
  if (!Number.isInteger(v.deviceScale)) bad.push(`텍셀당 디바이스픽셀이 정수가 아니다: ${v.deviceScale}`);
  if (v.deviceScale !== s * v.dpr) bad.push('디바이스 배율이 S×DPR 이 아니다');
  if (v.overflowX < 0 || v.overflowX > s - 1) bad.push(`가로 넘침 ${v.overflowX} 이 0..${s - 1} 밖`);
  if (v.overflowY < 0 || v.overflowY > s - 1) bad.push(`세로 넘침 ${v.overflowY} 이 0..${s - 1} 밖`);
  return bad;
}

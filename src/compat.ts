/**
 * 모바일 브라우저 호환 보정.
 *
 * 최우선 목표가 "폰에서 돌아가는 것"이므로, 한 API 때문에 부팅이 통째로 죽는
 * 상황을 없앤다. main.ts 가 가장 먼저 import 한다.
 */

/**
 * CanvasRenderingContext2D.roundRect — Safari 16.4(2023-03) 이상에서만 있다.
 * 없으면 스프라이트를 굽는 도중 TypeError 가 나면서 화면이 통째로 검게 남는다.
 */
function polyfillRoundRect(): boolean {
  const proto = globalThis.CanvasRenderingContext2D?.prototype as
    | (CanvasRenderingContext2D & { roundRect?: unknown })
    | undefined;
  if (!proto || typeof proto.roundRect === 'function') return false;

  proto.roundRect = function roundRect(
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | number[] = 0,
  ): void {
    const r = Math.min(
      Array.isArray(radii) ? (radii[0] ?? 0) : radii,
      Math.abs(w) / 2,
      Math.abs(h) / 2,
    );
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
  };
  return true;
}

/** 적용된 보정 목록. 자가진단 페이지가 보여준다. */
export const APPLIED_POLYFILLS: string[] = [];

export function installCompat(): void {
  if (polyfillRoundRect()) APPLIED_POLYFILLS.push('CanvasRenderingContext2D.roundRect');
}

installCompat();

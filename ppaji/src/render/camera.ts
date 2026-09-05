/**
 * 카메라 — 팬 + 정수 업스케일. Phaser 에 의존하지 않는 **순수 상태 기계**다
 * (부모 `kairo-camera.ts` 그대로. import 한 줄만 이 폴더의 iso 로 바꿨다).
 *
 * `center` 는 소수로 누적하고 `view()` 가 정수로 반올림해 내보낸다 — 반올림값을 다시
 * 누적하면 느린 드래그가 아예 안 먹는다. 축소는 없다: 전체 조망은 팬으로 한다.
 */
import { STEP_X, STEP_Y, GRID_W, GRID_H, snapCamera, type Vec2 } from './iso.js';
import { UPSCALE_DEFAULT, stepUpscale, type Upscale } from './upscale.js';

/** 지도 바깥으로 더 볼 수 있는 여백 — 바깥도 지형이라 하늘은 어디서도 안 보인다 */
export const BACKDROP_ABOVE = 48;
export const BACKDROP_BELOW = 48;

const ELASTIC = 40;
const RESIST = 0.35;

export interface CameraView {
  scrollX: number;
  scrollY: number;
  scale: Upscale;
}

export function worldBounds(gw = GRID_W, gh = GRID_H): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: -gh * STEP_X,
    maxX: gw * STEP_X,
    minY: -BACKDROP_ABOVE,
    maxY: (gw + gh) * STEP_Y + BACKDROP_BELOW,
  };
}

export class Camera {
  private center: Vec2;
  private scale: Upscale = UPSCALE_DEFAULT;
  private cssW = 0;
  private cssH = 0;

  constructor(
    private readonly gw = GRID_W,
    private readonly gh = GRID_H,
  ) {
    const b = worldBounds(gw, gh);
    this.center = { x: (b.minX + b.maxX) / 2, y: (this.gw + this.gh) * STEP_Y * 0.35 };
  }

  setScreenSize(cssW: number, cssH: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.clampHard();
  }

  private get viewW(): number {
    return Math.ceil(this.cssW / this.scale);
  }

  private get viewH(): number {
    return Math.ceil(this.cssH / this.scale);
  }

  bufferSize(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }

  get upscale(): Upscale {
    return this.scale;
  }

  /** 화면 픽셀 드래그량 → 텍셀 이동 */
  pan(dxScreenPx: number, dyScreenPx: number): void {
    this.center.x -= dxScreenPx / this.scale;
    this.center.y -= dyScreenPx / this.scale;
    this.clampSoft();
  }

  /** 이 텍셀을 화면(보이는 영역) 중앙에 놓는다 — `bottomInsetCss` 만큼 아래가 UI 에 가려졌다고 친다 */
  centerOn(t: Vec2, bottomInsetCss = 0): void {
    this.center.x = t.x;
    this.center.y = t.y + bottomInsetCss / this.scale / 2;
    this.clampHard();
  }

  fits(box: { w: number; h: number }, bottomInsetCss = 0): boolean {
    return box.w <= this.viewW && box.h <= this.viewH - bottomInsetCss / this.scale;
  }

  release(): void {
    this.clampHard();
  }

  /** 업스케일 변경. `anchorTexel` 을 주면 그 지점이 화면에서 안 움직이게 보정한다 */
  setUpscale(s: Upscale, anchorTexel?: Vec2): void {
    if (s === this.scale) return;
    if (anchorTexel) {
      const k = this.scale / s;
      this.center.x = anchorTexel.x + (this.center.x - anchorTexel.x) * k;
      this.center.y = anchorTexel.y + (this.center.y - anchorTexel.y) * k;
    }
    this.scale = s;
    this.clampHard();
  }

  step(dir: 1 | -1, anchorTexel?: Vec2): void {
    this.setUpscale(stepUpscale(this.scale, dir), anchorTexel);
  }

  screenToTexel(px: number, py: number): Vec2 {
    const v = this.view();
    return { x: v.scrollX + px / this.scale, y: v.scrollY + py / this.scale };
  }

  view(): CameraView {
    const s = snapCamera({ x: this.center.x - this.viewW / 2, y: this.center.y - this.viewH / 2 });
    return { scrollX: s.x, scrollY: s.y, scale: this.scale };
  }

  rawCenter(): Vec2 {
    return { ...this.center };
  }

  private clampSoft(): void {
    const r = this.range();
    this.center.x = soft(this.center.x, r.minCx, r.maxCx);
    this.center.y = soft(this.center.y, r.minCy, r.maxCy);
  }

  private clampHard(): void {
    const r = this.range();
    this.center.x = clamp(this.center.x, r.minCx, r.maxCx);
    this.center.y = clamp(this.center.y, r.minCy, r.maxCy);
  }

  private range(): { minCx: number; maxCx: number; minCy: number; maxCy: number } {
    const b = worldBounds(this.gw, this.gh);
    const halfW = this.viewW / 2;
    const halfH = this.viewH / 2;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const wideEnough = b.maxX - b.minX >= this.viewW;
    const tallEnough = b.maxY - b.minY >= this.viewH;
    return {
      minCx: wideEnough ? b.minX + halfW : cx,
      maxCx: wideEnough ? b.maxX - halfW : cx,
      minCy: tallEnough ? b.minY + halfH : cy,
      maxCy: tallEnough ? b.maxY - halfH : cy,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function soft(v: number, lo: number, hi: number): number {
  if (v < lo) return Math.max(lo - ELASTIC, lo + (v - lo) * RESIST);
  if (v > hi) return Math.min(hi + ELASTIC, hi + (v - hi) * RESIST);
  return v;
}

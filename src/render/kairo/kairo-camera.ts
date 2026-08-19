/**
 * 카이로 카메라 — 팬 + 정수 업스케일. 스펙 §1.4~1.6.
 *
 * Phaser 에 의존하지 않는 **순수 상태 기계**다. 씬은 `view()` 결과를 카메라에 그대로
 * 꽂기만 한다. 이렇게 두면 팬 경계·스냅·앵커 줌을 브라우저 없이 단위 테스트할 수 있다 —
 * 예전에 카메라 로직을 씬 안에 섞어 놔서 회귀를 스크린샷으로만 잡을 수 있었다.
 *
 * ## 두 좌표를 따로 든다
 *
 * `center` 는 **소수**로 누적하고, `view()` 가 **정수로 반올림**해서 내보낸다.
 * 반올림된 값을 다시 누적하면 느린 드래그가 아예 안 먹는다 (매 프레임 0.4텍셀씩
 * 움직이면 계속 0 으로 반올림된다).
 *
 * ## 왜 축소가 없나
 *
 * 아이소 맵의 바운딩 박스는 항상 2:1 가로형이라 세로 폰에 전체가 안 들어간다.
 * 축소로 억지로 넣으면 텍셀이 반 픽셀로 깨진다. 그래서 전체 조망은 **팬**으로 한다 —
 * 사용자가 요구한 "배경은 위로 스캔했을 때 전체가 보이게"가 정확히 이 방식이다.
 */

import { STEP_X, STEP_Y, GRID_W, GRID_H, snapCamera, type Vec2 } from './iso.js';
import { UPSCALE_DEFAULT, stepUpscale, type Upscale } from './upscale.js';

/**
 * 맵 바깥으로 더 볼 수 있는 여백 (K38 에서 뜻이 바뀌었다).
 *
 * 예전엔 "위쪽에 그려진 능선을 넣을 대역"이었다. 그런데 실제 게임들은 **그림 배경을
 * 안 쓴다** — Pool Slide Story 는 경계를 아예 안 보여 주고, Terra Nil 은 플레이 영역
 * 밖을 **같은 스케일 지형**으로 덮는다 (`art-reference/competitor/README.md`).
 * 그려진 배경은 눈이 곧 "무대 뒤에 세운 벽"으로 읽는다.
 *
 * 그래서 지금은 **지형이 화면을 채우는 폭**이다. 지도 바깥도 지형이라(K38) 여백만큼
 * 더 봐도 계속 땅이고, 하늘은 어디서도 안 보인다. 0 이 아니라 조금 두는 이유는
 * 고무줄(`ELASTIC`)로 끌릴 때 가장자리가 비지 않게 하기 위해서다.
 */
export const BACKDROP_ABOVE = 48;
export const BACKDROP_BELOW = 48;

/** 팬 경계를 넘어 끌릴 수 있는 최대치와 저항 — 손맛용 */
const ELASTIC = 40;
const RESIST = 0.35;

export interface CameraView {
  /** 화면 좌상단이 가리키는 텍셀 좌표 (정수). Phaser 의 scroll 에 그대로 넣는다 */
  scrollX: number;
  scrollY: number;
  scale: Upscale;
}

/** 맵 + 배경 여백이 차지하는 텍셀 범위 */
export function worldBounds(gw = GRID_W, gh = GRID_H): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: -gh * STEP_X,
    maxX: gw * STEP_X,
    minY: -BACKDROP_ABOVE,
    maxY: (gw + gh) * STEP_Y + BACKDROP_BELOW,
  };
}

export class KairoCamera {
  /** 화면 중심이 보는 텍셀 좌표 — **소수로 누적한다** */
  private center: Vec2;
  private scale: Upscale = UPSCALE_DEFAULT;
  /** 화면 CSS 크기. **뷰(텍셀) 크기는 배율에서 파생한다** — 배율이 바뀔 때 같이 안 바꾸면
   *  앵커 줌이 어긋난다 (실제로 겪었다) */
  private cssW = 0;
  private cssH = 0;

  constructor(
    private readonly gw = GRID_W,
    private readonly gh = GRID_H,
  ) {
    const b = worldBounds(gw, gh);
    // 시작 위치 — 맵 다이아몬드의 가로 중앙, 세로는 위쪽 1/3
    this.center = { x: (b.minX + b.maxX) / 2, y: (this.gw + this.gh) * STEP_Y * 0.35 };
  }

  /** 화면 CSS 크기를 알려준다. 리사이즈마다 부른다 */
  setScreenSize(cssW: number, cssH: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.clampHard();
  }

  /** 현재 배율에서 화면이 담는 텍셀 수 — 스펙 §1.4 의 `ceil(CSS / S)` */
  private get viewW(): number {
    return Math.ceil(this.cssW / this.scale);
  }

  private get viewH(): number {
    return Math.ceil(this.cssH / this.scale);
  }

  /** 렌더 버퍼 크기 (텍셀) */
  bufferSize(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }

  get upscale(): Upscale {
    return this.scale;
  }

  /** 화면 픽셀 드래그량 → 텍셀 이동. 업스케일이 클수록 손가락 1px 이 적게 움직인다 */
  pan(dxScreenPx: number, dyScreenPx: number): void {
    this.center.x -= dxScreenPx / this.scale;
    this.center.y -= dyScreenPx / this.scale;
    this.clampSoft();
  }

  /**
   * 이 텍셀을 **화면 중앙에 놓는다** (K33).
   *
   * ## 왜 있어야 했나
   *
   * 중심을 직접 옮길 수단이 없어서 `KairoScene.focusTile` 은 "가고 싶은 스크롤과 지금
   * 스크롤의 차이만큼 팬한다"로 우회했다. 팬은 `clampSoft`(고무줄)를 타므로 가장자리
   * 근처에서 목표를 못 맞추고, 배율이 섞이면 왕복이 필요했다. 중심을 그냥 쓰면 된다.
   *
   * ## `bottomInsetCss`
   *
   * 화면 아래 `bottomInsetCss` 픽셀이 UI 에 가려져 있다고 치고, **보이는 영역의**
   * 중앙에 오게 올린다. 코스 편집에서 핸들이 슬림 바 밑으로 숨는 것을 막는다.
   */
  centerOn(t: Vec2, bottomInsetCss = 0): void {
    this.center.x = t.x;
    // 보이는 영역의 중앙 = 버퍼 중앙보다 inset 의 절반만큼 위 → 중심은 그만큼 아래로
    this.center.y = t.y + bottomInsetCss / this.scale / 2;
    this.clampHard();
  }

  /**
   * 경계상자가 **보이는 영역 안에 들어가나** (K33). 안 들어가면 부르는 쪽이 배율을 낮춘다.
   * 허용 배율이 `[1, 2]` 뿐이라 한 단이 전부다.
   */
  fits(box: { w: number; h: number }, bottomInsetCss = 0): boolean {
    return box.w <= this.viewW && box.h <= this.viewH - bottomInsetCss / this.scale;
  }

  /** 손을 뗐을 때 — 경계 밖이면 안으로 되돌린다 */
  release(): void {
    this.clampHard();
  }

  /**
   * 업스케일 변경. `anchorTexel` 을 주면 그 지점이 화면에서 안 움직이게 중심을 보정한다
   * (더블탭한 곳이 커지는 느낌). 안 주면 화면 중심 기준.
   */
  setUpscale(s: Upscale, anchorTexel?: Vec2): void {
    if (s === this.scale) return;
    if (anchorTexel) {
      // 앵커에서 중심까지의 거리는 배율에 반비례해 줄어든다
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

  /** 화면 좌표(캔버스 CSS px) → 텍셀 좌표 */
  screenToTexel(px: number, py: number): Vec2 {
    const v = this.view();
    return { x: v.scrollX + px / this.scale, y: v.scrollY + py / this.scale };
  }

  /** 그리기용 값 — **정수로 반올림해서** 내보낸다 (§1.5) */
  view(): CameraView {
    const s = snapCamera({ x: this.center.x - this.viewW / 2, y: this.center.y - this.viewH / 2 });
    return { scrollX: s.x, scrollY: s.y, scale: this.scale };
  }

  /** 디버그·테스트용 — 반올림 전 중심 */
  rawCenter(): Vec2 {
    return { ...this.center };
  }

  /** 드래그 중 경계 — 넘을수록 무거워지되 ELASTIC 까지만 */
  private clampSoft(): void {
    const r = this.range();
    this.center.x = soft(this.center.x, r.minCx, r.maxCx);
    this.center.y = soft(this.center.y, r.minCy, r.maxCy);
  }

  /** 손을 뗀 뒤·줌 뒤 — 경계 안으로 확정 */
  private clampHard(): void {
    const r = this.range();
    this.center.x = clamp(this.center.x, r.minCx, r.maxCx);
    this.center.y = clamp(this.center.y, r.minCy, r.maxCy);
  }

  /**
   * 허용 중심 범위. 뷰가 월드보다 크면 (축소가 없으니 드물다) 월드를 화면 중앙에 둔다 —
   * 안 그러면 clamp 의 min > max 가 되어 카메라가 튄다.
   */
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

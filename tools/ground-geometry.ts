/**
 * 접지 기하 실측 — 게이트 4 (`tools/kairo-gate.ts`).
 *
 * ## 왜 필요한가
 *
 * 게이트 3 은 PNG **헤더의 폭·높이만** 읽는다 (`pngSize`, 디코딩조차 안 한다).
 * 그래서 캔버스 크기만 맞으면 **어떤 각도로 그려져도 통과**했고, 실제로 화면에서
 * "다른 에셋이랑 붙으면 각도가 어긋난다"가 됐다 (사용자 지적).
 *
 * 이 저장소는 같은 사고를 이미 한 번 겪고 **숫자로 진단한 적이 있다** —
 * `tools/yaw20-check.py` + `assets/generated/YAW20-RESPEC.md`: shop 실측
 * `bottomFrac 0.64`(기대 0.267)로 "좌우가 뒤집힌 관습적 아이소가 나왔다"를 잡아내고
 * 가이드를 3D 상자 이미지로 바꿔 0.268 로 맞췄다. 그 스크립트는 `YAW=20` 하드코딩이고
 * (prototype-3d 카메라) npm 에 안 물려 있다. 여기서 **카이로 2:1 투영으로** 다시 세운다.
 *
 * ## 기대값은 손으로 정하지 않는다 — 계약에서 유도된다
 *
 * 발자국 `w×d` 가 (0,0) 에 놓였을 때 네 꼭짓점의 화면 텍셀 (`iso.ts` 의 `gridToScreen`):
 *
 *     (0,0) → (      0,        0 )   최상단
 *     (w,0) → (   16w,      8w   )   최우단
 *     (w,d) → ( 16(w−d), 8(w+d) )    **최하단** ← 스프라이트 밑변
 *     (0,d) → (  −16d,      8d   )   최좌단
 *
 * 캔버스는 그 바운딩박스 + 몸통 (`footprintCanvas`):
 *     `W = (w+d)·16` · `H = (w+d)·8 + bodyH`
 * 이고 접지 다이아몬드는 캔버스 **하단 `(w+d)·8` 텍셀 구간**에 정확히 들어간다.
 *
 * 따라서 계약이 세 기대값을 **계산으로** 준다:
 *
 *   ① 아래 두 변의 기울기 = 왼쪽 **+0.5** · 오른쪽 **−0.5** (2:1 이므로 정확히 반)
 *      왼쪽 변: (0,d)→(w,d) 는 dx=+16w, dy=+8w  →  +1/2
 *      오른쪽 변: (w,d)→(w,0) 은 dx=+16d, dy=−8d →  −1/2
 *   ② 최하단 꼭짓점의 x / 캔버스 폭 = `16w / 16(w+d)` = **`w/(w+d)`**
 *      ⚠ **0.5 가 아니다.** 정사각 발자국에서만 0.5 이고 4×1 은 0.8 이다.
 *      (`footprintAnchor` 주석이 경고하는 바로 그 혼동 — 앵커의 x 는 bbox 가운데인데
 *       최하단 꼭짓점의 x 는 아니다.)
 *   ③ 접지 마스크 자체 — `tileRowSpan()` 으로 정본 다이아몬드를 깔아 IoU 를 잰다
 *
 * ⚠ **기대값을 상수로 적지 않는다.** 정본 마스크를 굽고 **똑같은 추정기**로 재서
 * 기대값을 얻는다 (`measureCanonical`). 그래서 투영이 바뀌면 기대값도 같이 움직이고,
 * "검사만 옛 규칙으로 남는" 상태가 구조적으로 불가능하다. 위 ①②의 닫힌 식은
 * **문서이자 대조군**이다 — `ground-geometry.test.ts` 가 둘이 일치하는지 본다.
 */

import { TILE_H, tileRowSpan, tileOffsetInCanvas, footprintCanvas } from '../src/render/kairo/iso.js';
import type { Raster } from './png.js';

/** 알파가 이 값 이상이면 "그림이 있다". 픽셀아트라 사실상 0/255 다 */
export const ALPHA_SOLID = 128;

export interface GroundMeasure {
  /** 접지 밴드가 시작되는 캔버스 y (= `bodyH`). 이 아래가 접지 다이아몬드 구간 */
  bandTop: number;
  /** 열별 최하단 윤곽. 밴드 안에 그림이 없는 열은 `null` */
  contour: (number | null)[];
  /** 최하단 꼭짓점 x / 캔버스 폭 — 픽셀 중심 기준 `(meanX+0.5)/W` */
  bottomFrac: number | null;
  /** 왼쪽 아래 변의 최소자승 기울기 (기대 +0.5) */
  slopeLeft: number | null;
  /** 오른쪽 아래 변의 최소자승 기울기 (기대 −0.5) */
  slopeRight: number | null;
  /**
   * 밴드 안에서 윤곽이 잡힌 열의 비율.
   *
   * ⚠ **판정에는 안 들어간다** (`geomVerdict` 가 안 읽는다). `--geom` 표와 면제 사유
   * (`GEOM_HOLDOUT` 의 `why`)를 사람이 쓰기 위한 근거일 뿐이다 — 파라솔 88% 는 접지가
   * 아니라 대부분 차양이다. 문턱을 걸고 싶어지면 그것이 새 축이지 이 필드가 아니다.
   */
  cover: number;
  /** 정본 접지 마스크와의 **여백 쐐기** IoU (아래 주석) */
  wedgeIoU: number;
}

/**
 * 정본 접지 마스크 — 발자국 `w×d` 의 타일 다이아몬드를 캔버스에 깐 것.
 *
 * `tileRowSpan()`(렌더가 실제로 지면을 그리는 정수 스캔라인)과
 * `tileOffsetInCanvas()` 를 그대로 쓴다. `tools/process-kairo-sheet.py` 의
 * `diamond_mask()` 에도 같은 코드가 있지만 저쪽은 파이썬 후처리라 공유가 안 된다 —
 * **게이트는 게임이 쓰는 함수로 잰다** (K38: "깊이는 화면에 올라간 오브젝트에서 읽는다").
 */
export function canonicalGroundMask(w: number, d: number, bodyH: number): boolean[] {
  const c = footprintCanvas(w, d, bodyH);
  const mask = new Array<boolean>(c.x * c.y).fill(false);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const off = tileOffsetInCanvas(i, j, d, bodyH);
      for (let y = 0; y < TILE_H; y++) {
        const s = tileRowSpan(y);
        const cy = off.y + y;
        if (cy < 0 || cy >= c.y) continue;
        for (let x = s.x0; x < s.x1; x++) {
          const cx = off.x + x;
          if (cx < 0 || cx >= c.x) continue;
          mask[cy * c.x + cx] = true;
        }
      }
    }
  }
  return mask;
}

/**
 * 열별 최하단 윤곽 — **게이트가 보는 것은 이것 하나**다 (세 축이 전부 여기서 나온다).
 * 밴드 위(몸통)는 안 본다: 시설 그림은 지붕·간판이 제각각이라 몸통을 재면 각도가 아니라
 * 취향을 재게 된다.
 */
function contourOf(solid: (x: number, y: number) => boolean, W: number, H: number, bandTop: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let x = 0; x < W; x++) {
    let bot: number | null = null;
    for (let y = H - 1; y >= bandTop; y--) {
      if (solid(x, y)) {
        bot = y;
        break;
      }
    }
    out.push(bot);
  }
  return out;
}

/**
 * 최소자승 기울기. 점이 `min` 개 미만이면 `null`.
 *
 * ⚠ **`min` 은 사실상 판정 문턱이다.** `null` 은 "모르겠다"가 아니라 `geomVerdict` 에서
 * **위반**으로 센다 (그 함수의 ⚠ 참조) — 즉 이 수를 올리면 짧은 변을 가진 그림이
 * 더 많이 빨개지고, 내리면 톱니 몇 점으로 뽑은 기울기가 판정에 들어온다.
 * 실측으로 이 경로를 타는 것은 `ticket`(오른쪽 변, 출력에 `기울기 0.150/—`)이다.
 * 건드리려면 `--geom` 전후를 비교해서 무엇이 바뀌는지 먼저 볼 것.
 */
function lsqSlope(pts: { x: number; y: number }[], min = 6): number | null {
  if (pts.length < min) return null;
  const n = pts.length;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  return den === 0 ? null : num / den;
}

/**
 * 윤곽에서 세 값을 뽑는다.
 *
 * ⚠ **기울기에 중앙값을 쓰지 말 것.** 2:1 선은 열마다 y 델타가 `1,0,1,0` 이라
 * 중앙값이 0 이나 1 로 튄다 (기대 0.5 인데 실측이 0/1). 최소자승은 그 톱니를
 * 평균으로 흡수한다.
 *
 * 좌·우 구간은 **최하단 꼭짓점**을 기준으로 가른다. 꼭짓점 자체와 그 양옆 한 텍셀은
 * 두 변이 만나는 자리라 어느 쪽에도 안 넣는다 — 넣으면 짧은 변(1칸짜리)에서 꼭짓점
 * 한 점이 기울기를 통째로 끌어당긴다.
 */
function fromContour(contour: (number | null)[], W: number): {
  bottomFrac: number | null;
  slopeLeft: number | null;
  slopeRight: number | null;
} {
  let maxY = -1;
  for (const v of contour) if (v !== null && v > maxY) maxY = v;
  if (maxY < 0) return { bottomFrac: null, slopeLeft: null, slopeRight: null };

  const bottomXs: number[] = [];
  for (let x = 0; x < contour.length; x++) if (contour[x] === maxY) bottomXs.push(x);
  const meanX = bottomXs.reduce((a, b) => a + b, 0) / bottomXs.length;
  const xLo = bottomXs[0]!;
  const xHi = bottomXs[bottomXs.length - 1]!;

  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let x = 0; x < contour.length; x++) {
    const y = contour[x];
    if (y === null || y === undefined) continue;
    if (x < xLo - 1) left.push({ x, y });
    else if (x > xHi + 1) right.push({ x, y });
  }

  return {
    // 픽셀 중심 기준. 이렇게 해야 정본 마스크에서 정확히 `w/(w+d)` 가 나온다
    bottomFrac: (meanX + 0.5) / W,
    slopeLeft: lsqSlope(left),
    slopeRight: lsqSlope(right),
  };
}

/**
 * ## 쐐기 IoU — 각도·크기·위치를 **한 숫자**로
 *
 * 접지 밴드(= 다이아몬드의 바운딩박스)에서 다이아몬드를 빼면 삼각형 넷이 남는다.
 * 그중 **아래 둘**(좌하·우하 쐐기)은 열별 최하단 윤곽만으로 정해진다:
 *
 *     쐐기(x) = { y ∈ [bandTop, H) : y > 윤곽(x) }
 *
 * 면적은 `64(w²+d²)` 이고 (좌하 `64w²` + 우하 `64d²` — 두 삼각형의 다리가
 * `16w×8w`, `16d×8d`), 밴드의 25% 안팎이라 충분히 크다.
 *
 * ⚠ **다이아몬드 쪽으로 IoU 를 재면 안 된다.** 밴드 안에서 윤곽 **위쪽** 영역은
 * 정본 다이아몬드보다 언제나 크다 (윗 삼각형 둘이 몸통으로 채워져 있으니까) —
 * 완벽한 그림에서도 IoU 가 2×2 기준 0.667 로 떨어져 아무것도 못 가른다 (산수로 확인).
 * 쐐기로 재면 **완벽한 그림 = 1.0** 이다.
 */
function wedgeMask(contour: (number | null)[], W: number, H: number, bandTop: number): boolean[] {
  const mask = new Array<boolean>(W * (H - bandTop)).fill(false);
  for (let x = 0; x < W; x++) {
    const bot = contour[x];
    const from = bot === null || bot === undefined ? bandTop : bot + 1;
    for (let y = from; y < H; y++) mask[(y - bandTop) * W + x] = true;
  }
  return mask;
}

function iou(a: boolean[], b: boolean[]): number {
  let inter = 0;
  let uni = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k]!;
    const y = b[k]!;
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni === 0 ? 1 : inter / uni;
}

/** 정본 마스크를 **같은 추정기**로 잰다 — 기대값의 출처 */
export function measureCanonical(w: number, d: number, bodyH: number): GroundMeasure {
  const c = footprintCanvas(w, d, bodyH);
  const mask = canonicalGroundMask(w, d, bodyH);
  const solid = (x: number, y: number): boolean => mask[y * c.x + x] === true;
  const contour = contourOf(solid, c.x, c.y, bodyH);
  const wedge = wedgeMask(contour, c.x, c.y, bodyH);
  return {
    bandTop: bodyH,
    contour,
    ...fromContour(contour, c.x),
    cover: contour.filter((v) => v !== null).length / c.x,
    wedgeIoU: iou(wedge, wedge),
  };
}

/**
 * 실제 스프라이트를 잰다. 캔버스 크기는 게이트 3 이 이미 검사한 뒤라고 가정한다.
 *
 * ⚠ 그 가정이 깨지면 **던지지 않고 조용히 틀린 IoU** 를 낸다: 기대 쐐기(`wantWedge`)를
 * 정본 윤곽(길이 `c.x`)으로 만들면서 폭은 실측 `r.w` 로 재색인하기 때문이다.
 * 게이트 3 을 게이트 4 **앞에서** 빼지 말 것 (`kairo-gate.ts` 의 실행 순서).
 */
export function measureSprite(r: Raster, w: number, d: number, bodyH: number): GroundMeasure {
  const solid = (x: number, y: number): boolean => r.data[(y * r.w + x) * 4 + 3]! >= ALPHA_SOLID;
  const contour = contourOf(solid, r.w, r.h, bodyH);
  const canonical = measureCanonical(w, d, bodyH);
  const wedge = wedgeMask(contour, r.w, r.h, bodyH);
  const wantWedge = wedgeMask(canonical.contour, r.w, r.h, bodyH);
  return {
    bandTop: bodyH,
    contour,
    ...fromContour(contour, r.w),
    cover: contour.filter((v) => v !== null).length / r.w,
    wedgeIoU: iou(wedge, wantWedge),
  };
}

// ───────────────────────── 음성 대조군 (합성 스프라이트) ─────────────────────────

/**
 * 합성 스프라이트 — **음성 대조군**.
 *
 * 정본 접지 마스크의 열별 최하단 윤곽을 그대로 가져와, 최하단 꼭짓점을 축으로
 * **세로로 전단(shear)** 한다:
 *
 *     새윤곽(x) = YB + (정본윤곽(x) − YB) × slopeMul
 *
 * `slopeMul = 1` 이면 **열별 최하단 윤곽이** 정본과 픽셀 단위로 같다 (양성 대조군 —
 * 게이트가 자기 기대값을 통과시키는지 확인). ⚠ 래스터 전체가 같은 것은 **아니다** —
 * 아래에 적었듯 실루엣은 윤곽 위를 다 채운 상자다. 게이트가 보는 것이 윤곽뿐이라
 * 그것으로 충분하다. 축이 최하단 꼭짓점이라 기울여도 캔버스 밖으로 안 나가고
 * 꼭짓점 위치도 안 변한다 — 그래서 **기울기만 따로** 시험할 수 있다.
 *
 * · `slopeMul = 2/√3 ≈ 1.1547` → 아래 두 변이 `tan30°`. 관습적인 30° 아이소다
 *   (계획서가 지정한 대조군).
 * · `mirror` → 좌우 반전. `YAW20-RESPEC.md` 가 실제로 겪은 사고 형태이고
 *   (shop `bottomFrac 0.64` vs 기대 0.267), 비정사각에서 `w/(w+d)` 가 `d/(w+d)` 로 뒤집힌다.
 * · `shiftX` → 통째로 옆으로 민 그림 (앵커 어긋남).
 * · `scale` → 접지면만 작게(크게) 그린 것. **최하단 꼭짓점을 축으로** 닮음 변환하므로
 *   **IoU 축만** 잡을 수 있는 결함이다. 축 하나가 통째로 죽어도 다른 축이 대신 잡아 주면
 *   모르기 때문에, 축마다 이런 대조군이 있어야 한다.
 *   ⚠ 정확히는 **꼭짓점만** 불변이다 (실측 `--selftest` 0.8배: 꼭짓점 0.500/0.800/0.333/
 *   0.500 그대로). 기울기는 래스터화 반올림만큼 움직인다 (실측 최대 이탈 0.021 <
 *   문턱 0.0625) — "안 변한다"고 적어 두면 그 여유가 얼마인지를 다음 사람이 못 본다.
 *
 * 실루엣은 윤곽 위를 전부 채운 **꽉 찬 상자**다. 게이트가 보는 것이 최하단 윤곽
 * 하나이므로 몸통 모양은 판정에 안 들어간다 — 대조군이 재는 축을 흐리지 않는다.
 */
export function synthSprite(
  w: number,
  d: number,
  bodyH: number,
  opts: { slopeMul?: number; shiftX?: number; mirror?: boolean; scale?: number } = {},
): Raster {
  const slopeMul = opts.slopeMul ?? 1;
  const shiftX = opts.shiftX ?? 0;
  const scale = opts.scale ?? 1;
  const c = footprintCanvas(w, d, bodyH);
  const data = new Uint8Array(c.x * c.y * 4);

  const base = measureCanonical(w, d, bodyH).contour;
  const YB = c.y - 1; // 최하단 꼭짓점 y = 캔버스 마지막 줄
  // 최하단 꼭짓점의 열 — 닮음 변환의 축
  let XB = 0;
  for (let x = 0; x < c.x; x++) if (base[x] === YB) XB = x;

  for (let x = 0; x < c.x; x++) {
    const u = Math.round(XB + (x - XB) / scale);
    const idx = opts.mirror ? c.x - 1 - u : u;
    const src = idx >= 0 && idx < c.x ? base[idx] : null;
    if (src === null || src === undefined) continue;
    const bot = Math.round(YB + (src - YB) * slopeMul * scale);
    const px = x + shiftX;
    if (px < 0 || px >= c.x) continue;
    for (let y = 0; y <= Math.min(c.y - 1, bot); y++) {
      const k = (y * c.x + px) * 4;
      data[k] = 90;
      data[k + 1] = 140;
      data[k + 2] = 200;
      data[k + 3] = 255;
    }
  }

  return { w: c.x, h: c.y, data };
}

// ───────────────────────────── 판정 ─────────────────────────────

/**
 * 정본 쐐기(좌하+우하 삼각형)의 면적. 닫힌 식은 `64(w²+d²)` 이지만
 * **마스크를 세어서** 낸다 — `tileRowSpan` 의 실제 래스터화와 어긋날 자리를 없앤다
 * (`ground-geometry.test.ts` 가 둘을 대조한다).
 */
export function canonicalWedgeArea(w: number, d: number, bodyH: number): number {
  const c = footprintCanvas(w, d, bodyH);
  let diamond = 0;
  for (const v of canonicalGroundMask(w, d, bodyH)) if (v) diamond++;
  return (c.x * (c.y - bodyH) - diamond) / 2;
}

/** 판정 축 셋 — 면제도 축 단위로 준다 */
export type GeomAxis = 'vertex' | 'slope' | 'iou';

/**
 * ## 문턱 — 전부 **"이음새에서 1텍셀"** 하나에서 유도된다
 *
 * 화면에서 실제로 보이는 결함은 "옆 시설과 붙였을 때 접지선이 안 맞는다"이다
 * (사용자 지적 그대로). 접지선의 기울기가 1/2 이므로 가로 오차 Δx 는 이음새에서
 * `Δx/2` 의 세로 어긋남이 된다. 픽셀아트는 정수 배율로 확대되므로 **1텍셀이면 보인다.**
 * 그래서 예산은 **가로 2텍셀 = 세로 1텍셀** 하나이고, 세 축은 그 예산을 각자의
 * 단위로 옮긴 것뿐이다:
 *
 * · **꼭짓점** `|Δ bottomFrac| × 캔버스폭 ≤ 2텍셀`
 *   → 발자국마다 문턱이 다르다 (1×1 은 0.063, 8×6 은 0.0089). 상수로 적으면
 *     큰 발자국이 사실상 무검사가 된다
 * · **기울기** `|기울기 ∓ 0.5| ≤ 1/16 = 0.0625`
 *   → 한 칸(가로 16텍셀)을 달리는 동안 1텍셀 어긋나는 기울기. 타일 하나가 이 검사의
 *     최소 단위이므로 "한 칸당 1텍셀"이 곧 예산이다
 *   ⚠ 30° 관습 아이소(`tan30`)의 이탈이 **0.080** 이다 — 문턱이 이보다 커지면
 *     음성 대조군이 안 잡힌다. 0.0625 는 그 아래이므로 여유가 0.018 있다
 * · **쐐기 IoU** `A / (A + E)`, `A` = 정본 쐐기 면적 · `E = 2텍셀 × 캔버스폭`
 *   → 윤곽이 **전 구간에서 2텍셀** 어긋났을 때의 IoU. 같은 예산의 면적 환산이다.
 *     교집합 `A`, 합집합 `A+E` — 어긋남이 한쪽 방향일 때의 값이다.
 *   ⚠ `(A−E)/(A+E)` 로 적으면 **예산을 두 배로 쓴 것**이 된다 (2×2 기준 0.80 → 0.60).
 *     실측으로 걸렸다: 그 값이면 "가로 6텍셀 밀린 그림"이 IoU 축에 안 걸린다
 *
 * ⚠ **IoU 는 순수한 기울기 오차에 둔하다** (실측: 30° 대조군이 0.88 로, 실제 75종의
 * 중앙값 0.73 보다 오히려 높다). 셋은 서로를 대체하지 않는다 — 기울기는 각도를,
 * 꼭짓점은 좌우 위치를, IoU 는 모양·크기를 잡는다. 하나만 남기지 말 것.
 */
export const SLOPE_TOL = 1 / 16;
export const VERTEX_TOL_TEXELS = 2;
/** 윤곽이 전 구간에서 이만큼 어긋난 것을 IoU 문턱으로 환산한다 */
export const IOU_ERROR_TEXELS = 2;

/**
 * **가로 8텍셀** — 이만큼 밀리면 그림이 **다른 타일에 앉아 보인다**.
 *
 * ⚠ 이것을 "반 칸"이라고 부르지 말 것. 비교 대상인 `vertexTexels` 는
 * `|Δ bottomFrac| × 캔버스폭` 이라 **가로** 텍셀인데 `TILE_W = 32` 이므로 8 은 **1/4 칸**
 * 이다 (가로 반 칸은 16). 접지선 기울기가 1/2 이라 이음새에서는 세로 4텍셀 어긋남이
 * 되고, `VERTEX_TOL_TEXELS = 2`(세로 1텍셀 예산)의 정확히 **네 배**다.
 * ⚠ 한때 `docs/asset-regen-order.md` 가 이 값을 "꼭짓점 반 칸 이상 이탈"이라 불렀는데
 * 그 표현은 이 정의와 어긋난다 — 숫자를 옮길 때 같이 고칠 것.
 *
 * 경고 **65건**(면제 적용 후 — `kairo-gate.ts` 의 게이트 4 주석)을 재생성 순서로 줄 세우는
 * 데 쓴다 — **판정 문턱이 아니다.**
 */
export const SEVERE_VERTEX_TEXELS = 8;

export interface GeomVerdict {
  /** 위반 축 (면제 제외) */
  bad: GeomAxis[];
  /** 면제로 건너뛴 축 */
  exempt: GeomAxis[];
  /** 꼭짓점 오차 (텍셀) */
  vertexTexels: number | null;
  slopeErrLeft: number | null;
  slopeErrRight: number | null;
  iouMin: number;
  /** 가로 8텍셀(= 타일 폭의 1/4) 이상 밀렸다 — 재생성 우선순위. ⚠ "반 칸"이 아니다 (위 `SEVERE_VERTEX_TEXELS` 주석) */
  severe: boolean;
  /**
   * 실측 꼭짓점이 `w/(w+d)` 보다 **`d/(w+d)` 에 가깝다** = 발자국 두 축이 바뀐 그림.
   *
   * `YAW20-RESPEC.md` 가 겪은 바로 그 사고다 (shop 실측 0.64, 기대 0.267 →
   * "좌우가 뒤집힌 관습적 아이소"). 정사각 발자국에서는 두 기대값이 같아 판정 불가라
   * `null` 이다. 처방이 "다시 뽑아라"가 아니라 **"가이드를 뒤집어서 다시 뽑아라"** 로
   * 갈리므로 게이트가 말해 주는 편이 낫다.
   */
  axesSwapped: boolean | null;
}

/**
 * ## 면제 표 — `ATLAS_HOLDOUT` 선례
 *
 * ⚠ 여기 넣을 때는 **왜**와 **무엇이 고쳐지면 빼는지**를 같이 적을 것.
 * 그리고 **축 단위로** 면제한다: "접지가 다이아몬드가 아니다"는 기울기·IoU 를
 * 무의미하게 만들지만 **꼭짓점은 여전히 유효하다** — 타일 한가운데 선 물건이라면
 * 실루엣 최하단은 그 타일의 최하단 꼭짓점에 와야 한다. 통째로 면제하면 "타일 밖으로
 * 밀려 그려진 파라솔"을 아무도 안 보게 된다.
 *
 * ⚠ 면제가 20종을 넘으면 게이트가 아무것도 안 재는 것에 가깝다. 지금 7종이다.
 *
 * ⚠ 계획서는 예로 **화단**도 들었지만 실측은 반대였다 — `flowerbed` 는 IoU **0.708** 로
 * 문턱 **0.667** 을 넘긴다 (여유 0.041). 어긋나는 것은 **꼭짓점(2.5텍셀)과 기울기**이지
 * 접지 모양이 아니다 — 화단은 접지가 진짜 다이아몬드다.
 * 짐작으로 면제하지 말고 **재고 나서** 넣을 것.
 *
 * ⚠ 위 문턱을 **0.333 이라고 적지 말 것.** 그것은 폐기된 `(A−E)/(A+E)` 식의 값이고
 * (같은 그림이 0.667 ⇔ 0.333), 그 식은 예산을 두 배 써서 "6텍셀 밀린 그림"을 IoU 축이
 * 못 잡게 만든다 — `IOU_ERROR_TEXELS` 주석의 ⚠ 가 그 사고를 적어 둔 자리다.
 */
export const GEOM_HOLDOUT: readonly { id: string; axes: readonly GeomAxis[]; why: string }[] = [
  {
    id: 'parasol',
    axes: ['slope', 'iou'],
    why: '기둥 하나 + 차양. 접지가 **점**이라 아래 두 변이 아예 없다 (실측 덮임 88% 인데 그 대부분이 차양). 파라솔을 접지 있는 물건으로 바꿀 일은 없으므로 이 면제는 영구다 — 대신 꼭짓점은 잰다 (기둥이 타일 가운데 서야 한다).',
  },
  {
    id: 'lifering',
    axes: ['slope', 'iou'],
    why: '구명함 스탠드. 다리 둘이라 접지가 점 둘이다 (실측 덮임 63%). 위와 같은 이유로 영구.',
  },
  {
    id: 'shade_net',
    axes: ['slope', 'iou'],
    why: '그늘막 — 기둥 넷에 천을 씌운 것. 접지는 기둥 발 넷이지 다이아몬드가 아니다.',
  },
  {
    id: 'photozone',
    axes: ['slope', 'iou'],
    why: '세워 놓은 액자. 접지가 발 둘이다 (실측 덮임 66% — `vending_in`·`lifering` 의 63% 와 함께 최저권 셋). 프레임을 받침대 있는 형태로 다시 그리면 이 줄을 지운다.',
  },
  {
    id: 'vending_in',
    axes: ['slope', 'iou'],
    why: '자판기 — 타일보다 **작은 상자**다. 1×1 발자국을 꽉 채우면 오히려 손님 통로가 없어 보인다 (실측 덮임 63%). 접지가 작은 것이 의도다.',
  },
  {
    id: 'vending_out',
    axes: ['slope', 'iou'],
    why: '`vending_in` 과 같은 물건의 야외판 — 타일보다 작은 상자라 접지가 다이아몬드가 아니다. 같은 이유로 같이 면제한다 (한쪽만 면제하면 같은 그림에서 판정이 갈린다).',
  },
  {
    id: 'arcade',
    axes: ['slope', 'iou'],
    why: '오락기 한 대 — 타일보다 작은 상자. `vending_*` 와 같은 이유.',
  },
];

const holdoutFor = (id: string): readonly GeomAxis[] =>
  GEOM_HOLDOUT.find((h) => h.id === id)?.axes ?? [];

/**
 * 실측 + 기대값 → 판정. 기대값은 **정본 마스크를 같은 추정기로 잰 값**이다.
 *
 * ⚠ **못 잰 축(`null`)은 위반으로 센다.** 접지가 아예 없거나 변이 짧아 기울기를 못 내는
 * 그림이 "측정 불가"로 조용히 통과하면 게이트가 없는 것과 같다 — 이 저장소가 반복해
 * 겪은 "검사가 조용히 통과"의 정확한 반대편 결정이다. 실제로 발동한다: `ticket` 은
 * 오른쪽 변의 점이 `lsqSlope` 의 최소 개수에 못 미쳐 이 경로로 빨간불이 되고, 표에도
 * `기울기 0.150/—` 로 뜬다. 통과시켜야 하는 종은 `GEOM_HOLDOUT` 에 **왜와 함께** 적는다.
 */
export function geomVerdict(
  id: string,
  m: GroundMeasure,
  want: GroundMeasure,
  canvasW: number,
  wedgeArea: number,
  footprint?: readonly [number, number],
): GeomVerdict {
  const exempt = holdoutFor(id);
  const bad: GeomAxis[] = [];

  const vertexTexels =
    m.bottomFrac === null || want.bottomFrac === null
      ? null
      : Math.abs(m.bottomFrac - want.bottomFrac) * canvasW;
  const slopeErrLeft = m.slopeLeft === null ? null : Math.abs(m.slopeLeft - 0.5);
  const slopeErrRight = m.slopeRight === null ? null : Math.abs(m.slopeRight + 0.5);
  const e = IOU_ERROR_TEXELS * canvasW;
  const iouMin = wedgeArea / (wedgeArea + e);

  const take = (axis: GeomAxis, violated: boolean): void => {
    if (violated && !exempt.includes(axis)) bad.push(axis);
  };
  /*
   * ⚠ 부동소수 여유. `bottomFrac` 은 나눗셈 두 번을 거치므로 정확히 문턱인 값이
   * **문턱보다 아주 조금 큰 수**로 나온다 — 실측으로 걸렸다 (`slide_small` 이 표시상
   * 오차 2.0 인데 빨간불이었다). 문턱을 느슨하게 하는 게 아니라 **같은 값을 같은 값으로**
   * 보는 것이다. (구체적 자릿수는 그림이 바뀌면 달라지므로 적지 않는다.)
   */
  const EPS = 1e-9;
  take('vertex', vertexTexels === null || vertexTexels > VERTEX_TOL_TEXELS + EPS);
  take(
    'slope',
    slopeErrLeft === null ||
      slopeErrLeft > SLOPE_TOL + EPS ||
      slopeErrRight === null ||
      slopeErrRight > SLOPE_TOL + EPS,
  );
  take('iou', m.wedgeIoU < iouMin - EPS);

  let axesSwapped: boolean | null = null;
  if (footprint && footprint[0] !== footprint[1] && m.bottomFrac !== null && want.bottomFrac !== null) {
    const swapped = footprint[1] / (footprint[0] + footprint[1]);
    axesSwapped = Math.abs(m.bottomFrac - swapped) < Math.abs(m.bottomFrac - want.bottomFrac);
  }

  return {
    bad,
    exempt: [...exempt],
    vertexTexels,
    slopeErrLeft,
    slopeErrRight,
    iouMin,
    severe: vertexTexels === null || vertexTexels >= SEVERE_VERTEX_TEXELS,
    axesSwapped,
  };
}

/** 사람이 읽는 한 줄 요약 */
export function formatMeasure(m: GroundMeasure, want: GroundMeasure): string {
  const f = (v: number | null): string => (v === null ? '  —  ' : v.toFixed(3));
  return (
    `바닥꼭짓점 ${f(m.bottomFrac)}(기대 ${f(want.bottomFrac)}) · ` +
    `기울기 ${f(m.slopeLeft)}/${f(m.slopeRight)}(기대 ${f(want.slopeLeft)}/${f(want.slopeRight)}) · ` +
    `IoU ${m.wedgeIoU.toFixed(3)} · 덮임 ${(m.cover * 100).toFixed(0)}%`
  );
}

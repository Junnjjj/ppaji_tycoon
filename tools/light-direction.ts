/**
 * 광원 방향 실측 — 게이트 5 (`tools/kairo-gate.ts`).
 *
 * ## 왜 필요한가 — 4방향을 뽑기 전에 만드는 "자"
 *
 * 스타일 계약은 *"LIGHTING. Single light from the upper left."* 다
 * (`docs/asset-prompts.md` §SHARED STYLE BLOCK, 34시트 축자 동일). **광원은 화면에
 * 고정**이지 물체에 붙어 있지 않다 — 물체를 90° 돌려도 **화면 왼쪽 면이 밝아야 한다.**
 *
 * 4방향 그림을 받기 전에 이 자가 필요한 이유는 이미 뽑아 둔 표본이 답을 냈기 때문이다.
 * `assets/generated/sprites/facility-shop-d{0,1,2,3}/final-quantized.png` 를 아래 지표로
 * 재면 **d0 +57.5 · d1 −43.2 · d2 −16.3 · d3 +16.3** 이다. 네 장 중 둘이 음수 —
 * **생성이 "d1 = d0 을 좌우 반전"으로 만들면서 광원까지 같이 뒤집었다.** 그림을 돌리면
 * 실루엣은 뒤집혀도 **광원은 그대로여야 한다**는 것이 이 게이트가 재는 전부다.
 *
 * ⚠ 스킬 문서(`.claude/skills/ppaji-pixel-asset/SKILL.md`)는 "광원은 네 방향 모두
 * 좌상단 유지(생성이 지켜줌)"라고 적어 두었는데 **이 표본에서 성립하지 않는다.**
 *
 * ## 무엇을 재나 — **접지선 바로 위의 벽 띠**, 왼쪽 면 vs 오른쪽 면
 *
 * 2:1 다이메트릭에서 물체의 보이는 수직면은 둘이다 (`docs/asset-prompts.md` 의 FOOTPRINT
 * 문단): 법선이 화면 **왼쪽 아래**를 향하는 면(+D 쪽)과 **오른쪽 아래**를 향하는 면(+W 쪽).
 * 좌상단 광원이면 **왼쪽 면이 밝고 오른쪽 면이 어둡다.** 두 면은 접지 다이아몬드의
 * 아래 두 변 위에 각각 서 있고, 그 두 변은 **최하단 꼭짓점**에서 만난다.
 *
 * 그래서 **열마다** 실루엣의 맨 아래(접지선)에서 위로 몇 텍셀을 떠서 그 열의 밝기로 쓰고,
 * 최하단 꼭짓점 열을 기준으로 **왼쪽 열들의 중앙값 − 오른쪽 열들의 중앙값**을 점수로
 * 삼는다 (휘도 0~255 단위, 왼쪽이 밝으면 양수).
 *
 * ### 왜 "좌−우 전체 평균"이 아닌가 (사용자가 처음 쓴 거친 지표)
 *
 * 전체 평균은 **모양과 내용에 오염된다.** 4×1 발자국은 그림 무게가 한쪽으로 쏠려 있고,
 * 어두운 개구부(매점 카운터·창문)가 한쪽에만 있으면 광원과 무관하게 부호가 뒤집힌다.
 * 벽 띠는 **두 옆면만** 보므로 지붕·차양·간판·개구부가 판정에서 빠진다.
 *
 * ### 왜 "줄마다 좌우 끝"이 아닌가 (여기서 한 번 갈아탔다)
 *
 * 처음엔 **줄(row)** 마다 실루엣 좌우 끝의 띠를 비교했다. 대칭적이고 구현도 쉽지만
 * **가로로 긴 발자국에서 구조적으로 편향된다**: 4×1 은 왼쪽 모서리 `(0,d)` 가 오른쪽
 * 모서리 `(w,0)` 보다 24텍셀 위에 있어서, 같은 줄인데 **한쪽은 윗면·다른 쪽은 옆면**을
 * 읽는다. 합성 대조군으로 잡혔다 — 명암을 **완전히 없앤** 4×1 상자가 `−17.9` (뒤집힘)로
 * 나왔다. 광원이 아니라 윗면/옆면 밝기 차를 잰 것이다.
 * 열(column) 기준으로 바꾸면 **어느 발자국에서도** 정본 `+21.9` · 미러 `−21.9` ·
 * 무음영 `0.0` 이 정확히 나온다 (10가지 발자국 실측, `kairo-gate.ts --selftest`).
 *
 * ### 뺀 것 셋과 근거
 *
 * · **아웃라인** — 계약이 *"every object carries a baked 1-pixel dark warm outline"* 라고
 *   못 박은 **상수**다. 실루엣 둘레에 비례해 들어오므로 광원이 아니라 모양을 잰다.
 *   띠는 아웃라인이 **아닌** 화소만 모은다 (팔레트 `윤곽` 계열 최근접).
 * · **최하단 꼭짓점 열** — 두 면이 만나는 자리라 어느 쪽도 아니다.
 * · **위쪽 전부** — 지붕·차양·간판. 옆면만 보는 것이 이 지표의 정의다.
 *
 * ### 좌우 대칭인 물체는 어떻게 되나
 *
 * **기하 대칭은 명암 대칭이 아니다.** 분수처럼 좌우 대칭인 물건도 좌상단 광원이면
 * 왼쪽 면이 밝다 (실측 `fountain +15.0`). 그래도 대칭 물체는 신호가 작을 수 있으므로
 * **사각지대**를 둔다 — 아래 `LIGHT_TOL`. 사각지대 안은 위반이 아니라
 * **`평탄`**(방향을 읽을 수 없다)으로 따로 센다. "위반 아님"과 "못 쟀음"을 같은 통에
 * 넣으면 그게 이 저장소가 아홉 번 겪은 "검사가 조용히 통과"다.
 *
 * ## 지표는 flipX 에 대해 **정확히 홀함수**다
 *
 * 좌우를 뒤집으면 열 순서가 뒤집히고 최하단 꼭짓점 열도 같이 뒤집히므로 왼쪽 집합과
 * 오른쪽 집합이 통째로 맞바뀐다 — 점수는 **부호만** 바뀐다. 근사가 아니라 항등이다
 * (실측: `fishing −60.2` → flipX `+60.2`). 그래서 음성 대조군(정본을 flipX)이 반드시
 * 잡히고, 잡히지 않으면 구현이 깨진 것이다 (`kairo-gate.ts --selftest`).
 */

import { readFileSync } from 'node:fs';
import type { Raster } from './png.js';
import { canonicalGroundMask } from './ground-geometry.js';
import { footprintCanvas } from '../src/render/kairo/iso.js';

/** 알파가 이 값 이상이면 "그림이 있다" — `ground-geometry.ts` 의 `ALPHA_SOLID` 와 같은 값 */
export const ALPHA_SOLID = 128;

/** ITU-R BT.709 휘도 */
export const luminance = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

// ───────────────────────────── 팔레트 ─────────────────────────────

/**
 * 팔레트 정본. `tools/quantize-fixed-palette.py` 가 쓰는 그 파일이다 —
 * 여기서 다시 적으면 팔레트를 고칠 때 한쪽만 남는다.
 */
export const PALETTE_PATH = 'art-reference/palette-proposed-39.json';

const hexRgb = (c: string): readonly [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

export const PALETTE: ReadonlyMap<string, readonly (readonly [number, number, number])[]> =
  new Map(
    Object.entries(JSON.parse(readFileSync(PALETTE_PATH, 'utf8')) as Record<string, string[]>).map(
      ([fam, cs]) => [fam, cs.map(hexRgb)] as const,
    ),
  );

/** 팔레트에서 아웃라인 계열의 이름 — 그림에서 빼는 유일한 계열 */
export const OUTLINE_FAMILY = '윤곽';

/**
 * 최근접 팔레트 계열. 거리는 **양자화기와 같은 가중치**(2,4,3)를 쓴다
 * (`tools/quantize-fixed-palette.py` 의 `nearest`) — 두 벌이 되면 "양자화기는 윤곽으로
 * 보냈는데 게이트는 목재로 읽는" 화소가 생긴다.
 */
const familyCache = new Map<number, string>();
export function nearestFamily(r: number, g: number, b: number): string {
  const key = (r << 16) | (g << 8) | b;
  const hit = familyCache.get(key);
  if (hit !== undefined) return hit;
  let best = OUTLINE_FAMILY;
  let bd = Infinity;
  for (const [fam, cs] of PALETTE) {
    for (const c of cs) {
      const d = 2 * (r - c[0]) ** 2 + 4 * (g - c[1]) ** 2 + 3 * (b - c[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = fam;
      }
    }
  }
  familyCache.set(key, best);
  return best;
}

const isOutline = (r: number, g: number, b: number): boolean =>
  nearestFamily(r, g, b) === OUTLINE_FAMILY;

/** 0~360 원형 거리 */
function hueOf(c: readonly [number, number, number]): number {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * **톤 사다리** — 한 색상 안에서 밝기만 다른 계열. 팔레트에서 기계로 고른다
 * (계열 안 두 색의 최대 색상 거리 < 30°).
 *
 * ⚠ 이름으로 고르지 않는 이유: `지붕`·`장비` 는 **여러 색상의 모음**이라 (빨강·초록·
 * 파랑·노랑) 인접 밝기 차가 2.5 까지 떨어진다. 그걸 "한 톤 단계"라고 부르면 사각지대가
 * 1.25 가 되어 아무 잡음이나 판정에 들어온다. 지금 걸리는 계열은
 * **잔디·모래·물·목재·벽·피부·폰툰 7종**이고, 검사가 그 집합을 대조한다 (분류기가
 * 조용히 흔들리면 문턱이 같이 흔들린다).
 */
export const HUE_SPAN_MAX_DEG = 30;
export function toneLadders(): string[] {
  const out: string[] = [];
  for (const [fam, cs] of PALETTE) {
    if (fam === OUTLINE_FAMILY || cs.length < 2) continue;
    const hues = cs.map(hueOf);
    let span = 0;
    for (const a of hues) for (const b of hues) span = Math.max(span, hueDist(a, b));
    if (span < HUE_SPAN_MAX_DEG) out.push(fam);
  }
  return out;
}

/**
 * **한 톤 단계** — 같은 재질의 두 톤이 갈리는 **가장 좁은** 간격 (휘도).
 *
 * 계약이 *"Two tones per material only — a base tone and one shadow tone"* 이므로
 * 명암의 최소 단위는 팔레트가 정한다. 사다리 계열들의 인접 밝기 차 중 **최소**를 쓴다 —
 * 이보다 작은 차이는 **어느 재질에서도** 톤이 갈렸다고 말할 수 없다.
 * 실측 `12.4` (모래 `#f0dcae` 220.9 → `#e8cf9a` 208.5).
 */
export const TONE_STEP: number = (() => {
  let min = Infinity;
  for (const fam of toneLadders()) {
    const ls = (PALETTE.get(fam) ?? []).map((c) => luminance(c[0], c[1], c[2])).sort((a, b) => b - a);
    for (let i = 1; i < ls.length; i++) min = Math.min(min, ls[i - 1]! - ls[i]!);
  }
  return min;
})();

/**
 * ## 사각지대 — **반 톤 단계**
 *
 * 점수는 "왼쪽 띠와 오른쪽 띠의 평균 밝기 차"이므로 단위가 휘도다. 두 면이 **한 톤**
 * 갈렸을 때가 계약이 요구하는 최소 명암이고, 띠 평균은 부분적으로만 갈린 줄에서 그보다
 * 작게 나온다. 그래서 **한 단계의 절반**을 "방향이 읽힌다"의 하한으로 둔다:
 *
 *     LIGHT_TOL = TONE_STEP / 2 = 6.2
 *
 * ⚠ **"지금 팩이 통과하도록" 맞춘 값이 아니다.** 팔레트에서만 유도했다. 뒤에 팩으로
 * 확인은 했다 — 띠 높이를 2·3·4 로 흔들었을 때 판정(뒤집힘/평탄/통과)이 갈리는 종이
 * **4/75**(`cafe`·`lookout`·`minigolf`·`pension`)이고 전부 |점수| ≤ 14.5 로 사각지대
 * 언저리에 몰려 있다. 강한 신호는 흔들리지 않는다.
 *
 * ⚠ 이 문턱을 넘겼다고 그림이 좋다는 뜻이 **아니다.** 게이트 4 의 ⚠ 와 같은 성질이다 —
 * 왼쪽 면 전체를 한 톤 밝게 칠하기만 해도 통과한다. 게이트는 **방향**만 본다.
 *
 * ⚠ 팔레트를 고치면 이 값이 **같이 움직인다.** 상수로 적지 말 것.
 */
export const LIGHT_TOL: number = TONE_STEP / 2;

// ───────────────────────────── 측정 ─────────────────────────────

/**
 * 벽 띠의 높이 — 접지선에서 위로 **3텍셀** (아웃라인은 건너뛰고 센다).
 *
 * ⚠ 크게 잡을수록 지붕·차양으로 새어 올라가고, 작게 잡을수록 얼룩 하나에 흔들린다.
 * 위로는 계약이 막는다 — `bodyH` 는 `parking`·`footvolley` 의 **4** 부터
 * `slide_large` 의 72 까지이고 (실내 풀 셋은 아예 0), 몸통 높이에 비례시키면 납작한
 * 종에서 0 이 된다. 그래서 **고정 3텍셀**이다: 아웃라인 1텍셀 위에 얹히고, `bodyH 4`
 * 짜리 바닥판에도 들어간다.
 * 아래로는 잡음이 막는다 — 실측으로 K 를 2·3·4·6 으로 흔들면 판정(뒤집힘/평탄/통과)이
 * 갈리는 종이 **4/75** 이고, K=2 는 열마다 표본이 둘뿐이라 `pingpong` 이 −78 로 튄다.
 * K 를 6 까지 올리면 짧은 몸통에서 벽을 벗어나 역전이 **7/75** 로 는다
 * (`glamping` −26 → +21 · `office` +18.9 → −15.8).
 */
export const BAND_TEXELS = 3;

/**
 * 한쪽 면에 이만큼 열이 안 잡히면 **측정 불가**다. 중앙값이 한두 열로 정해지면
 * 얼룩 하나가 판정이 된다 — 실측으로 `fishing` 이 오른쪽 **1열**로 −60 을 냈다.
 */
export const MIN_COLUMNS = 4;

export interface LightMeasure {
  /** 왼쪽 면에서 잡힌 열 수 */
  left: number;
  /** 오른쪽 면에서 잡힌 열 수 */
  right: number;
  /** 왼쪽 열 중앙값 − 오른쪽 열 중앙값 (휘도). 열이 모자라면 `null` */
  score: number | null;
}

export type LightVerdict = 'upper-left' | 'flipped' | 'flat' | 'unmeasurable';

/**
 * 열마다 "접지선 바로 위 `BAND_TEXELS` 텍셀의 평균 휘도"를 구하고, 최하단 꼭짓점 열을
 * 기준으로 좌·우로 가른다. `measureLight` 의 속이자 표를 그리는 도구가 쓸 수 있게 노출한다.
 *
 * ⚠ **좌우 대칭 구현**: 꼭짓점 열은 실측(최하단 윤곽의 최댓값을 갖는 열들의 가운데)이지
 * 계약값이 아니다. 계약의 `w/(w+d)` 를 쓰면 그림을 뒤집어도 가르는 자리가 안 따라와서
 * **홀함수가 깨진다** — 음성 대조군이 통과해 버린다.
 */
export function wallColumns(r: Raster): { left: number[]; right: number[] } {
  const solid = (x: number, y: number): boolean => r.data[(y * r.w + x) * 4 + 3]! >= ALPHA_SOLID;
  const at = (x: number, y: number): readonly [number, number, number] => {
    const k = (y * r.w + x) * 4;
    return [r.data[k]!, r.data[k + 1]!, r.data[k + 2]!];
  };

  // 열별 최하단 윤곽 — 게이트 4 (`ground-geometry.ts`) 가 재는 그 윤곽과 같은 정의다
  const bottom: number[] = [];
  for (let x = 0; x < r.w; x++) {
    let b = -1;
    for (let y = r.h - 1; y >= 0; y--) {
      if (solid(x, y)) {
        b = y;
        break;
      }
    }
    bottom.push(b);
  }
  let maxB = -1;
  for (const b of bottom) if (b > maxB) maxB = b;
  const ties: number[] = [];
  for (let x = 0; x < r.w; x++) if (bottom[x] === maxB) ties.push(x);
  if (ties.length === 0) return { left: [], right: [] };
  const vertexX = (ties[0]! + ties[ties.length - 1]!) / 2;

  const left: number[] = [];
  const right: number[] = [];
  for (let x = 0; x < r.w; x++) {
    const b = bottom[x]!;
    if (b < 0) continue;
    let sum = 0;
    let n = 0;
    for (let y = b; y >= 0 && n < BAND_TEXELS; y--) {
      if (!solid(x, y)) break; // 구멍을 만나면 그 열은 거기서 끝이다
      const c = at(x, y);
      if (isOutline(c[0], c[1], c[2])) continue;
      sum += luminance(c[0], c[1], c[2]);
      n++;
    }
    if (n < BAND_TEXELS) continue;
    if (x < vertexX) left.push(sum / n);
    else if (x > vertexX) right.push(sum / n);
  }
  return { left, right };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function measureLight(r: Raster): LightMeasure {
  const { left, right } = wallColumns(r);
  if (left.length < MIN_COLUMNS || right.length < MIN_COLUMNS) {
    return { left: left.length, right: right.length, score: null };
  }
  return { left: left.length, right: right.length, score: median(left) - median(right) };
}

export function lightVerdict(m: LightMeasure): LightVerdict {
  if (m.score === null) return 'unmeasurable';
  if (m.score >= LIGHT_TOL) return 'upper-left';
  if (m.score <= -LIGHT_TOL) return 'flipped';
  return 'flat';
}

export const VERDICT_NAME: Record<LightVerdict, string> = {
  'upper-left': '좌상단',
  flipped: '뒤집힘',
  flat: '평탄',
  unmeasurable: '측정불가',
};

// ─────────────────── 대조군용 합성 스프라이트 ───────────────────

/** 팔레트에서 색 하나 꺼내기 — 대조군이 실제 재질 톤을 쓰게 (계약 밖 색을 만들지 않는다) */
function tone(fam: string, i: number): readonly [number, number, number] {
  const cs = PALETTE.get(fam);
  if (!cs || !cs[i]) throw new Error(`팔레트에 ${fam}[${i}] 가 없다 — ${PALETTE_PATH} 를 볼 것`);
  return cs[i];
}

/**
 * 합성 스프라이트 — **대조군**. 발자국 `w×d` 의 정본 접지 다이아몬드
 * (`canonicalGroundMask`, = 게이트 4 가 재는 그 마스크) 위에 `bodyH` 만큼 상자를 세우고,
 * **왼쪽 면에 base 톤 · 오른쪽 면에 shadow 톤**을 칠한다. 재질은 목재
 * (`#dcb079` → `#c49a6a`, 한 단계 21.9 — 사각지대 6.2 의 3.5배).
 *
 * · `mirror` — 좌우 반전. **음성 대조군**: 반드시 `flipped` 로 잡혀야 한다
 * · `flat` — 두 면을 같은 톤으로. **`평탄` 축의 대조군**: 이게 `upper-left` 나
 *   `flipped` 로 나오면 사각지대가 죽은 것이다
 *
 * ⚠ `tools/make-kairo-guide.ts` 의 `drawGuide` 를 대조군으로 쓸 수 없다 — 배경이
 * 크로마 마젠타로 **불투명하게** 깔려 있어 실루엣이 캔버스 전체다. 기하는 같은
 * `canonicalGroundMask` 에서 나오므로 모양은 그 가이드와 동일하다.
 */
export function synthLitSprite(
  w: number,
  d: number,
  bodyH: number,
  opts: { mirror?: boolean; flat?: boolean } = {},
): Raster {
  const c = footprintCanvas(w, d, bodyH);
  const mask = canonicalGroundMask(w, d, bodyH);
  const data = new Uint8Array(c.x * c.y * 4);

  const TOP = tone('모래', 2); // #f0dcae — 윗면이 가장 밝다
  const LEFT = tone('목재', 0); // #dcb079 base
  const RIGHT = opts.flat === true ? LEFT : tone('목재', 1); // #c49a6a shadow
  const OUT = tone(OUTLINE_FAMILY, 0); // #4a3826

  const put = (x: number, y: number, col: readonly [number, number, number]): void => {
    const px = opts.mirror === true ? c.x - 1 - x : x;
    if (px < 0 || px >= c.x || y < 0 || y >= c.y) return;
    const k = (y * c.x + px) * 4;
    data[k] = col[0];
    data[k + 1] = col[1];
    data[k + 2] = col[2];
    data[k + 3] = 255;
  };

  // 열별 접지 윤곽 + 최하단 꼭짓점 (좌·우 면의 경계)
  const bot: (number | null)[] = [];
  for (let x = 0; x < c.x; x++) {
    let b: number | null = null;
    for (let y = 0; y < c.y; y++) if (mask[y * c.x + x] === true) b = y;
    bot.push(b);
  }
  let xB = 0;
  let yB = -1;
  for (let x = 0; x < c.x; x++) {
    const b = bot[x];
    if (b !== null && b !== undefined && b > yB) {
      yB = b;
      xB = x;
    }
  }

  // 옆면 둘
  for (let x = 0; x < c.x; x++) {
    const b = bot[x];
    if (b === null || b === undefined) continue;
    const col = x <= xB ? LEFT : RIGHT;
    for (let y = Math.max(0, b - bodyH + 1); y <= b; y++) put(x, y, col);
  }
  // 윗면
  for (let x = 0; x < c.x; x++) {
    for (let y = 0; y < c.y; y++) if (mask[y * c.x + x] === true) put(x, y - bodyH, TOP);
  }
  if (bodyH === 0) {
    for (let x = 0; x < c.x; x++) {
      for (let y = 0; y < c.y; y++) if (mask[y * c.x + x] === true) put(x, y, TOP);
    }
  }
  // 1텍셀 아웃라인 — 계약대로 구워 넣는다. 게이트가 이걸 빼는지 확인하는 몫도 한다
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < c.x && y < c.y && data[(y * c.x + x) * 4 + 3]! >= ALPHA_SOLID;
  const edge: [number, number][] = [];
  for (let y = 0; y < c.y; y++) {
    for (let x = 0; x < c.x; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
        edge.push([x, y]);
      }
    }
  }
  // ⚠ `put` 은 `mirror` 를 한 번 더 적용하므로 여기서는 직접 쓴다 (이미 뒤집힌 좌표다)
  for (const [x, y] of edge) {
    const k = (y * c.x + x) * 4;
    data[k] = OUT[0];
    data[k + 1] = OUT[1];
    data[k + 2] = OUT[2];
    data[k + 3] = 255;
  }

  return { w: c.x, h: c.y, data };
}

/** 래스터를 좌우 반전 — 팩의 정본을 뒤집어 넣는 대조군에 쓴다 */
export function flipX(r: Raster): Raster {
  const data = new Uint8Array(r.data.length);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const s = (y * r.w + x) * 4;
      const t = (y * r.w + (r.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) data[t + k] = r.data[s + k]!;
    }
  }
  return { w: r.w, h: r.h, data };
}

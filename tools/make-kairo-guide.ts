/**
 * 카이로 시설 스프라이트용 **3D 상자 가이드 이미지** 생성기 (계획서 4-B).
 *
 *   npx tsx tools/make-kairo-guide.ts --all                     75종 전부
 *   npx tsx tools/make-kairo-guide.ts --id shop --id cafe       골라서
 *   npx tsx tools/make-kairo-guide.ts --all --out /tmp/guides   출력 폴더
 *   npx tsx tools/make-kairo-guide.ts --table                   그림 없이 규격표만
 *
 * 기본 출력은 `art-reference/guides/kairo/facility__<id>.png` (생성물 이름 규칙과 같은 꼴).
 *
 * ## 왜 프롬프트 문장이 아니라 그림인가
 *
 * `assets/generated/YAW20-RESPEC.md` 가 이미 답을 냈다 (2026-08-17). 바닥 평행사변형만
 * 첨부했을 때 shop 실측 `bottomFrac 0.64` — **좌우가 뒤집힌 관습적 아이소**가 나왔다
 * (기대 0.267). 가이드를 **세워 올린 3D 상자**(바닥 + 보이는 두 옆면 + 윗면 + 접지
 * 모서리 굵은 선 + 타일 눈금)로 바꾸자 실측 **0.268** 로 맞았다.
 *
 * ⚠ 그때 쓴 `tools/make-diamond-guide.py` 는 **prototype-3d 의 yaw20 카메라**용이다
 * (`(fw·cos20 + fh·sin20)×16`). 카이로는 2:1 다이메트릭이라 수식도 모양도 다르다 —
 * 그 스크립트를 카이로 시트에 쓰면 안 된다. 이 파일이 카이로판이다.
 *
 * ## 기하를 다시 유도하지 않는다
 *
 * 바닥면은 `canonicalGroundMask()`(= 게이트 4 가 재는 그 마스크, = 렌더가 실제로
 * 지면을 그리는 `tileRowSpan()`)를 **그대로 쓴다.** 윗면은 그것을 `bodyH` 만큼 위로
 * 옮긴 것이고, 옆면 둘은 두 윤곽 사이를 채운 것이다. 그래서 **가이드가 게이트를
 * 100% 통과하는 것이 구조적으로 보장된다** — 가이드와 게이트가 서로 다른 기하를
 * 갖는 순간 "가이드대로 그렸는데 게이트가 빨갛다"가 된다.
 *
 * ⚠ 새 의존성 0. PNG 는 `tools/png.ts` 가 굽는다 (PIL·sharp 없음).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allSimFacilities, renderSpec, assetIdToFile } from '../src/assets/kairo-contract.js';
import { footprintCanvas, gridToScreen, STEP_X, STEP_Y } from '../src/render/kairo/iso.js';
import { canonicalGroundMask } from './ground-geometry.js';
import { encodePng } from './png.js';
import type { Raster } from './png.js';

/** 생성 해상도 배율. 1텍셀 = N px — 모델이 32×16 짜리 그림을 못 읽는다 */
export const SCALE = 8;

/**
 * 색. **크로마 배경은 `#FF00FF`** — 기존 파이프라인(`tools/process-kairo-sheet.py`)이
 * 쓰는 키와 같아야 한다. ⚠ 소재에 분홍이 섞이면 키와 충돌한다 (YAW20-RESPEC "파이프라인
 * 함정"), 그래서 상자는 무채색만 쓴다.
 */
const BG: RGB = [255, 0, 255];
const TOP: RGB = [214, 214, 214]; // 윗면 — 가장 밝다
const FACE_J: RGB = [186, 186, 186]; // +J 면 (왼쪽 아래로 향한 면)
const FACE_I: RGB = [150, 150, 150]; // +I 면 (오른쪽 아래로 향한 면) — 더 어둡다
const EDGE: RGB = [40, 40, 40]; // 접지 모서리 — 굵고 진하게
const GRID: RGB = [110, 110, 110]; // 타일 눈금

type RGB = readonly [number, number, number];

function blank(w: number, h: number): Raster {
  const data = new Uint8Array(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    data[k * 4] = BG[0];
    data[k * 4 + 1] = BG[1];
    data[k * 4 + 2] = BG[2];
    data[k * 4 + 3] = 255;
  }
  return { w, h, data };
}

function put(r: Raster, x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
  const k = (y * r.w + x) * 4;
  r.data[k] = c[0];
  r.data[k + 1] = c[1];
  r.data[k + 2] = c[2];
  r.data[k + 3] = 255;
}

/** 텍셀 하나를 SCALE×SCALE 블록으로 찍는다 — 확대는 언제나 NEAREST 정수배 */
function putTexel(r: Raster, tx: number, ty: number, c: RGB): void {
  for (let dy = 0; dy < SCALE; dy++) {
    for (let dx = 0; dx < SCALE; dx++) put(r, tx * SCALE + dx, ty * SCALE + dy, c);
  }
}

/** 텍셀 좌표계의 굵은 선 (브레젠험 + 두께) */
function lineTexel(r: Raster, x0: number, y0: number, x1: number, y1: number, c: RGB, wide = 2): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    for (let o = 0; o < wide; o++) putTexel(r, x, y + o, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export interface GuideSpec {
  id: string;
  sprite: string;
  w: number;
  d: number;
  bodyH: number;
}

/**
 * 상자 가이드 한 장.
 *
 * 바닥 마스크 `M` 하나에서 전부 파생한다:
 *   · 윗면   = `M` 을 위로 `bodyH`
 *   · 옆면   = 열마다 `M` 의 최하단과 그 위 `bodyH` 사이
 *   · 접지선 = `M` 의 최하단 윤곽 (굵게)
 * 좌·우 옆면은 **최하단 꼭짓점**을 기준으로 갈라 명암을 다르게 준다 — 그 경계가
 * 곧 "카메라 쪽 모서리"라, 모델이 어느 쪽이 앞인지 읽는 단서가 된다.
 */
export function drawGuide(g: GuideSpec): Raster {
  const { w, d, bodyH } = g;
  const c = footprintCanvas(w, d, bodyH);
  const mask = canonicalGroundMask(w, d, bodyH);
  const img = blank(c.x * SCALE, c.y * SCALE);

  // 열별 바닥 윤곽 (최상단·최하단)
  const top: (number | null)[] = [];
  const bot: (number | null)[] = [];
  for (let x = 0; x < c.x; x++) {
    let t: number | null = null;
    let b: number | null = null;
    for (let y = 0; y < c.y; y++) {
      if (mask[y * c.x + x] === true) {
        if (t === null) t = y;
        b = y;
      }
    }
    top.push(t);
    bot.push(b);
  }

  let xB = 0; // 최하단 꼭짓점 열
  let yB = -1;
  for (let x = 0; x < c.x; x++) {
    const b = bot[x];
    if (b !== null && b !== undefined && b > yB) {
      yB = b;
      xB = x;
    }
  }

  // 옆면 — 바닥 윤곽에서 위로 bodyH
  for (let x = 0; x < c.x; x++) {
    const b = bot[x];
    if (b === null || b === undefined) continue;
    const face = x <= xB ? FACE_J : FACE_I;
    for (let y = Math.max(0, b - bodyH + 1); y <= b; y++) putTexel(img, x, y, face);
  }

  // 윗면 — 바닥 마스크를 통째로 위로 bodyH
  for (let x = 0; x < c.x; x++) {
    for (let y = 0; y < c.y; y++) {
      if (mask[y * c.x + x] === true) putTexel(img, x, y - bodyH, TOP);
    }
  }
  // bodyH 가 0 이면 상자가 아니라 바닥판이다 — 그때는 바닥을 윗면 색으로 보여 준다
  if (bodyH === 0) {
    for (let x = 0; x < c.x; x++) {
      for (let y = 0; y < c.y; y++) if (mask[y * c.x + x] === true) putTexel(img, x, y, TOP);
    }
  }

  /*
   * 타일 눈금 — 발자국이 몇 칸인지, 어느 축이 어느 쪽인지 읽히게.
   * 격자 꼭지점을 `gridToScreen` 으로 그대로 옮긴다 (좌표를 손으로 세지 않는다):
   *   아래 왼쪽 모서리 = (k, d), k = 0..w      아래 오른쪽 모서리 = (w, k), k = 0..d
   * 캔버스 원점 보정은 `+STEP_X·d` (가로) · `+bodyH` (세로).
   */
  const toCanvas = (i: number, j: number): { x: number; y: number } => {
    const s = gridToScreen(i, j);
    return { x: s.x + STEP_X * d, y: s.y + bodyH };
  };
  // ① 옆면의 세로 눈금 — **길이를 `bodyH` 로 자른다.** 안 자르면 눈금이 윗면 위로
  //    올라와서 "이게 면 위의 선인지 상자 밖의 선인지" 모르게 된다 (실측: 4×1 bodyH 8)
  if (bodyH >= 3) {
    for (let k = 1; k < w; k++) {
      const p = toCanvas(k, d);
      lineTexel(img, p.x, p.y - bodyH + 1, p.x, p.y - 1, GRID, 1);
    }
    for (let k = 1; k < d; k++) {
      const p = toCanvas(w, k);
      lineTexel(img, p.x, p.y - bodyH + 1, p.x, p.y - 1, GRID, 1);
    }
  }
  // ② 윗면의 타일 격자 — 발자국이 몇 칸인지 여기서 확정된다 (bodyH 0 인 종의 유일한 단서)
  for (let k = 1; k < w; k++) {
    const a = toCanvas(k, 0);
    const b = toCanvas(k, d);
    lineTexel(img, a.x, a.y - bodyH, b.x, b.y - bodyH, GRID, 1);
  }
  for (let k = 1; k < d; k++) {
    const a = toCanvas(0, k);
    const b = toCanvas(w, k);
    lineTexel(img, a.x, a.y - bodyH, b.x, b.y - bodyH, GRID, 1);
  }

  // 접지선 — 아래 두 변. 이 그림에서 **모델이 반드시 따라야 하는 선**이다
  for (let x = 0; x < c.x; x++) {
    const b = bot[x];
    if (b === null || b === undefined) continue;
    putTexel(img, x, b, EDGE);
    if (b - 1 >= 0) putTexel(img, x, b - 1, EDGE);
  }
  // 윗면 외곽선 (얇게) — 상자의 부피가 읽히게
  for (let x = 0; x < c.x; x++) {
    const t = top[x];
    const b = bot[x];
    if (t === null || t === undefined || b === null || b === undefined) continue;
    putTexel(img, x, t - bodyH, GRID);
    if (bodyH > 0) putTexel(img, x, b - bodyH, GRID);
  }

  return img;
}

/** 프롬프트에 붙일 수 있는 규격 한 줄 — 게이트 4 가 재는 값 그대로 */
export function guideSpecLine(g: GuideSpec): string {
  const { w, d, bodyH } = g;
  const c = footprintCanvas(w, d, bodyH);
  return (
    `${g.id.padEnd(16)} ${`${w}×${d}`.padEnd(6)} canvas ${`${c.x}×${c.y}`.padEnd(9)} ` +
    `접지밴드 하단 ${(w + d) * STEP_Y}텍셀 · 바닥꼭짓점 x/폭 ${(w / (w + d)).toFixed(3)} ` +
    `(= ${w}/${w + d}) · 아래 두 변 기울기 +0.500/−0.500 · bodyH ${bodyH}`
  );
}

function specs(): GuideSpec[] {
  const out: GuideSpec[] = [];
  for (const s of allSimFacilities()) {
    const r = renderSpec(s.sprite);
    if (!r) continue;
    out.push({ id: s.id, sprite: s.sprite, w: s.size[0], d: s.size[1], bodyH: r.bodyH });
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const table = argv.includes('--table');
  const ids = argv.flatMap((a, i) => (a === '--id' ? [argv[i + 1] ?? ''] : []));
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? (argv[outIdx + 1] ?? '') : 'art-reference/guides/kairo';

  const chosen = specs().filter((g) => all || ids.includes(g.id));
  if (chosen.length === 0) {
    console.error('대상이 없다. --all 이나 --id <시설id> 를 줄 것');
    process.exit(1);
  }

  if (table) {
    for (const g of chosen) console.log(guideSpecLine(g));
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const g of chosen) {
    const png = encodePng(drawGuide(g));
    const file = assetIdToFile(g.sprite);
    writeFileSync(join(outDir, file), png);
  }
  console.log(`가이드 ${chosen.length}장 → ${outDir}/  (1텍셀 = ${SCALE}px, 크로마 #FF00FF)`);
  console.log('  시트 프롬프트에 --ref 로 첨부하고, 아래 규격을 글로도 같이 박을 것:');
  for (const g of chosen.slice(0, 3)) console.log(`    ${guideSpecLine(g)}`);
  if (chosen.length > 3) console.log(`    … (--table 로 전체)`);
}

// 라이브러리로 import 될 때는 안 돈다 (검사가 `drawGuide` 만 부를 수 있게)
if (process.argv[1]?.endsWith('make-kairo-guide.ts') === true) main();

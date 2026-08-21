/**
 * 카이로 아틀라스 굽기 — Phase G.
 *
 *   npm run bake:atlas
 *
 * `assets/generated/kairo/*.png` (144장) → `public/assets/kairo-atlas.png` + `.json`.
 *
 * ## 왜 굽나
 *
 * `assets/generated/` 는 `.gitignore` 대상이고 807M 짜리 작업 폴더다. 게임이 그걸
 * 직접 읽을 수는 없다. 그리고 144번 요청하면 폰에서 첫 프레임이 늦는다 — 한 장 + 색인
 * 하나면 요청이 **둘**이다.
 *
 * ## 왜 새 의존성이 없나
 *
 * `sharp`·`canvas` 를 붙이는 대신 Node 의 `zlib` 로 PNG 를 직접 읽고 쓴다 (`tools/png.ts`).
 * 입력이 전부 **RGBA8 · 인터레이스 없음**임을 실측으로 확인했고 (144/144), 그렇지
 * 않은 파일이 섞이면 **죽는다**. `make-icons.ts` 는 Playwright 로 그렸지만 여기서는
 * 브라우저를 안 쓴다 — 캔버스를 거치면 색 관리·프리멀티플라이가 픽셀을 건드릴 수
 * 있는데, 픽셀아트에서 그건 조용한 손실이다.
 *
 * ## ⚠ 이 도구는 위반을 발견하면 죽는다
 *
 * 조용히 넘어가면 "아틀라스는 있는데 절반이 플레이스홀더"가 된다. 죽는 조건:
 *   · 계약(`kairoAssetSizes`)에 없는 ID · 같은 ID 의 파일이 둘
 *   · PNG 실측 크기 ≠ 계약 캔버스 · 계약에 있는데 그림이 없는 ID
 *   · RGBA8·비인터레이스가 아닌 PNG
 */

import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kairoAssetSizes, assetFileToId } from '../src/assets/kairo-contract.js';
import { decodePng, encodePng } from './png.js';
import type { Raster } from './png.js';

/** 프레임 사이 여백. NEAREST + 정수 잘라내기라 번짐은 없지만, 눈으로 볼 때 경계가 읽힌다 */
const PAD = 1;

const SRC_DIR = 'assets/generated/kairo';
const OUT_PNG = 'public/assets/kairo-atlas.png';
const OUT_JSON = 'public/assets/kairo-atlas.json';

// ────────────────────────────── 포장 ──────────────────────────────

interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 선반(shelf) 포장. 높이 내림차순으로 세우면 선반마다 낭비가 작다.
 *
 * 정렬 키에 **ID 를 마지막으로** 넣는다 — 같은 크기끼리 순서가 파일시스템 나열 순서에
 * 좌우되면 같은 입력에서 다른 아틀라스가 나온다. 굽기는 결정론적이어야 diff 가 읽힌다.
 */
function pack(items: { id: string; w: number; h: number }[], width: number): {
  placed: Placed[];
  height: number;
} {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : 1));
  const placed: Placed[] = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const it of sorted) {
    if (x + it.w + PAD > width) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    placed.push({ id: it.id, x, y, w: it.w, h: it.h });
    x += it.w + PAD;
    if (it.h > rowH) rowH = it.h;
  }
  return { placed, height: y + rowH + PAD };
}

// ────────────────────────────── 본문 ──────────────────────────────

function main(): void {
  const sizes = kairoAssetSizes();
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.png'));
  const bad: string[] = [];
  const byId = new Map<string, { file: string; raster: Raster }>();

  for (const file of files.sort()) {
    const id = assetFileToId(file);
    if (!id || !sizes.has(id)) {
      bad.push(`계약에 없는 산출물: ${file}${id ? ` (→ ${id})` : ' (이름 규칙 위반)'}`);
      continue;
    }
    if (byId.has(id)) {
      bad.push(`같은 ID 의 파일이 둘: ${id} — ${byId.get(id)!.file} · ${file}`);
      continue;
    }
    const raster = decodePng(join(SRC_DIR, file));
    const want = sizes.get(id)!;
    if (raster.w !== want[0] || raster.h !== want[1]) {
      bad.push(`${id}: 실측 ${raster.w}×${raster.h} ≠ 계약 ${want[0]}×${want[1]} (${file})`);
      continue;
    }
    byId.set(id, { file, raster });
  }

  for (const id of sizes.keys()) if (!byId.has(id)) bad.push(`팩에 그림이 없다: ${id}`);

  if (bad.length > 0) {
    console.error(`아틀라스를 굽지 않았다 — 위반 ${bad.length}건`);
    for (const b of bad) console.error(`  ✕ ${b}`);
    process.exit(1);
  }

  const items = [...byId].map(([id, v]) => ({ id, w: v.raster.w, h: v.raster.h }));
  /*
   * 폭 1024 로 먼저 시도한다. 실측 총 799,040px 은 1024×1024 안에 들 것처럼 보이지만,
   * 512×200 짜리 배경 3장이 선반을 통째로 먹어서 **높이 1146** 이 나온다. 그때는 2048
   * 로 넓힌다 — 493 높이라 픽셀 수는 오히려 같고 (2048×512), WebGL1 최소 보장
   * 텍스처 크기가 2048 이라 폰에서도 안전하다.
   */
  let width = 1024;
  let { placed, height } = pack(items, width);
  if (height > 1024) {
    width = 2048;
    ({ placed, height } = pack(items, width));
  }

  const atlas: Raster = { w: width, h: height, data: new Uint8Array(width * height * 4) };
  for (const p of placed) {
    const src = byId.get(p.id)!.raster;
    for (let y = 0; y < p.h; y++) {
      const s = y * p.w * 4;
      const d = ((p.y + y) * width + p.x) * 4;
      atlas.data.set(src.data.subarray(s, s + p.w * 4), d);
    }
  }

  const index: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const p of [...placed].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    index[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h };
  }

  mkdirSync('public/assets', { recursive: true });
  const png = encodePng(atlas);
  writeFileSync(OUT_PNG, png);
  writeFileSync(OUT_JSON, `${JSON.stringify(index, null, 1)}\n`);

  const used = placed.reduce((n, p) => n + p.w * p.h, 0);
  console.log(`카이로 아틀라스 — ${placed.length}장`);
  console.log(
    `  ${OUT_PNG}  ${width}×${height} · ${(png.length / 1024).toFixed(0)}KB · ` +
      `채움 ${Math.round((used / (width * height)) * 100)}%`,
  );
  console.log(`  ${OUT_JSON} ${Object.keys(index).length}개 프레임`);
}

main();

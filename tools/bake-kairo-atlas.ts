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
 * `sharp`·`canvas` 를 붙이는 대신 Node 의 `zlib` 로 PNG 를 직접 읽고 쓴다.
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

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { kairoAssetSizes, assetFileToId } from '../src/assets/kairo-contract.js';

const SRC_DIR = 'assets/generated/kairo';
const OUT_PNG = 'public/assets/kairo-atlas.png';
const OUT_JSON = 'public/assets/kairo-atlas.json';

/** 프레임 사이 여백. NEAREST + 정수 잘라내기라 번짐은 없지만, 눈으로 볼 때 경계가 읽힌다 */
const PAD = 1;

interface Raster {
  w: number;
  h: number;
  /** RGBA8, w*h*4 */
  data: Uint8Array;
}

// ────────────────────────────── PNG ──────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Paeth 예측자 — PNG 명세 그대로 */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePng(path: string): Raster {
  const buf = readFileSync(path);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`PNG 가 아니다: ${path}`);
  }
  let off = 8;
  let ihdr: { w: number; h: number } | null = null;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      const w = body.readUInt32BE(0);
      const h = body.readUInt32BE(4);
      const depth = body.readUInt8(8);
      const color = body.readUInt8(9);
      const interlace = body.readUInt8(12);
      if (depth !== 8 || color !== 6 || interlace !== 0) {
        throw new Error(
          `${path}: RGBA8·비인터레이스만 굽는다 (실측 depth ${depth} · colorType ${color} · ` +
            `interlace ${interlace}). 색 유형을 바꾸려면 이 디코더부터 늘릴 것`,
        );
      }
      ihdr = { w, h };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (!ihdr) throw new Error(`${path}: IHDR 없음`);

  const { w, h } = ihdr;
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  if (raw.length < h * (stride + 1)) throw new Error(`${path}: IDAT 가 짧다`);

  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[src + x]!;
      const a = x >= bpp ? out[dst + x - bpp]! : 0;
      const b = y > 0 ? out[up + x]! : 0;
      const c = x >= bpp && y > 0 ? out[up + x - bpp]! : 0;
      let v: number;
      switch (ft) {
        case 0:
          v = rawByte;
          break;
        case 1:
          v = rawByte + a;
          break;
        case 2:
          v = rawByte + b;
          break;
        case 3:
          v = rawByte + ((a + b) >> 1);
          break;
        case 4:
          v = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`${path}: 알 수 없는 필터 ${ft}`);
      }
      out[dst + x] = v & 0xff;
    }
  }
  return { w, h, data: out };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/**
 * RGBA8 래스터를 PNG 로 굽는다. 줄마다 필터 다섯을 다 해 보고 **절대값 합이 가장 작은
 * 것**을 고른다 (PNG 명세가 권하는 표준 휴리스틱) — 필터 0 고정보다 파일이 훨씬 작다.
 */
function encodePng(r: Raster): Buffer {
  const bpp = 4;
  const stride = r.w * bpp;
  const filtered = Buffer.alloc(r.h * (stride + 1));
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));

  for (let y = 0; y < r.h; y++) {
    const dst = y * stride;
    const up = dst - stride;
    const score = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = r.data[dst + x]!;
      const a = x >= bpp ? r.data[dst + x - bpp]! : 0;
      const b = y > 0 ? r.data[up + x]! : 0;
      const c = x >= bpp && y > 0 ? r.data[up + x - bpp]! : 0;
      const vals = [v, v - a, v - b, v - ((a + b) >> 1), v - paeth(a, b, c)];
      for (let f = 0; f < 5; f++) {
        const byte = vals[f]! & 0xff;
        cand[f]![x] = byte;
        score[f]! += byte < 128 ? byte : 256 - byte;
      }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (score[f]! < score[best]!) best = f;
    filtered[y * (stride + 1)] = best;
    Buffer.from(cand[best]!.buffer, 0, stride).copy(filtered, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.w, 0);
  ihdr.writeUInt32BE(r.h, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

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

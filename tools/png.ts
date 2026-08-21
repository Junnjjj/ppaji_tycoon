/**
 * 의존성 0 PNG 코덱 — RGBA8 · 비인터레이스 전용.
 *
 * ⚠ **이 파일이 도구 쪽 PNG 의 정본이다.** 원래 `tools/bake-kairo-atlas.ts` 안에만
 * 있었는데, 각도 게이트(게이트 4)가 알파를 읽어야 해서 같은 디코더가 필요해졌다.
 * 복사해 두 벌을 만들면 "굽기는 되는데 게이트는 못 읽는" 종류가 조용히 생긴다 —
 * 이 저장소가 `guestWalkable`·`capacityOf`·`admissionLimit` 에서 세 번 겪은 실패다.
 *
 * `sharp`·`canvas` 를 안 쓰는 이유는 `bake-kairo-atlas.ts` 머리말 그대로다: 캔버스를
 * 거치면 색 관리·프리멀티플라이가 픽셀을 건드리는데 픽셀아트에서 그건 조용한 손실이다.
 */

import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

export interface Raster {
  w: number;
  h: number;
  /** RGBA8, w*h*4 */
  data: Uint8Array;
}

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

export function decodePng(path: string): Raster {
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
          `${path}: RGBA8·비인터레이스만 읽는다 (실측 depth ${depth} · colorType ${color} · ` +
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
export function encodePng(r: Raster): Buffer {
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

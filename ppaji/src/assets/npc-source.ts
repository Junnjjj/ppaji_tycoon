/// <reference types="vite/client" />
/** Source-resolution V8 provider. No simulation or global appearance mutation. */
import { sha256Bytes } from '../../assets/npc-source/sha256.mjs';
import manifestData from '../../assets/npc-source/manifest.json';
import types from '../../assets/npc-source/types.json';
import displayData from '../../assets/npc-source/display-spec.json';
import type { AssetProvider, SpriteSpec } from './types.js';

type Rect = { x: number; y: number; w: number; h: number };
type Display = { logicalDrawSize: number; offset: number[]; root: number[]; frameRects: Rect[] };
export type NpcSourceAppearance = { body: string; hair: string; hairColor: string; outfit: string; outfitColor: string };
const display: Record<string, Display> = displayData;
const manifest = manifestData as { rgbaSources: Record<string, { file: string; width: number; height: number; sha256: string }>; parts: Record<string, string>; roleVariants: Record<string, Record<string, string>>; outfitRoles: Record<string, string>; guardByOutfit: Record<string, string> };
const sourceUrls = import.meta.glob('../../assets/npc-source/rgba/**/*.gz.bin', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const looks = new Map(types.presets.map(t => [t.id, t]));
export const NPC_SOURCE_DENSITY = 4;
export const npcSourceMetadata = Object.freeze({ density: 4, textureCell: 160, logicalCell: 40, sourceCell: 64, states: 22, framesPerLook: 30, combinations: 324, defaultLooks: Object.freeze(types.presets.map(t => t.id)), maxCachedFrames: 256 });

export function npcSourceFrame(id: string) {
  const m = /^guest\/v8\/(guest-\d+)\/([a-z_]+)\/([01])\/([a-z_]+)\/(\d+)\/(calm|happy|annoyed|tired)$/.exec(id);
  if (!m || !looks.has(m[1]!)) return null;
  const state = m[2]!, index = Number(m[5]), d = display[state];
  if (!Object.hasOwn(display, state) || !d || !Number.isSafeInteger(index) || !d.frameRects[index]) return null;
  return { look: m[1]!, state, index, mirror: m[3] === '1', cacheKey: `${m[1]}/${state}/${m[3]}/${index}`, display: d };
}
/** Key-local selection only; caller decides whether customization is allowed. */
export function npcSourceKeyWithLook(id: string, look: string): string | null {
  return npcSourceFrame(id) && looks.has(look) ? id.replace(/^guest\/v8\/guest-\d+\//, `guest/v8/${look}/`) : null;
}

// Byte-for-byte algorithm from approved v2/npc/rgba.mjs (straight integer RGBA).
function over(dst: Uint8ClampedArray, src: Uint8ClampedArray) {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3]!; if (!sa) continue;
    if (sa === 255 || !dst[i + 3]) { dst.set(src.subarray(i, i + 4), i); continue; }
    const da = dst[i + 3]!, back = da * (255 - sa), a = sa * 255 + back;
    for (let c = 0; c < 3; c++) dst[i + c] = Math.floor((src[i + c]! * sa * 255 + dst[i + c]! * back + a / 2) / a);
    dst[i + 3] = Math.floor((a + 127) / 255);
  }
}
function exact(dst: Uint8ClampedArray, src: Uint8ClampedArray) {
  for (let i = 0; i < dst.length; i += 4) if (src[i + 3]) dst.set(src.subarray(i, i + 4), i);
}
export type NpcSourceCells = ReadonlyMap<string, ReadonlyMap<string, Uint8ClampedArray>>;
/** Exact approved 324-combination composer; no Canvas rounding until final upload. */
export function composeNpcSource(cells: NpcSourceCells, state: string, index: number, t: NpcSourceAppearance): Uint8ClampedArray {
  if (t.body !== 'base-v1' || !types.hairShapes.includes(t.hair) || !types.outfitShapes.includes(t.outfit) || !types.hairColors.some(c => c.id === t.hairColor) || !types.outfitColors.some(c => c.id === t.outfitColor)) throw Error('Unsupported appearance');
  if (!Object.hasOwn(display, state) || !display[state]?.frameRects[index]) throw Error('Unsupported frame');
  const sample = (p: string) => { const v = cells.get(p)?.get(`${state}/${index}`); if (!v) throw Error('Missing source ' + p); return v; };
  const hair = manifest.roleVariants['hair_' + t.hair]![t.hairColor]!;
  const cloth = manifest.roleVariants[manifest.outfitRoles[t.outfit]!]![t.outfitColor]!;
  const out = new Uint8ClampedArray(64 * 64 * 4);
  for (const p of [hair, manifest.parts.body!, manifest.parts.head_skin!, cloth]) over(out, sample(p));
  exact(out, sample(manifest.parts[manifest.guardByOutfit[t.outfit]!]!));
  if (state.endsWith('_swim')) { const head = new Uint8ClampedArray(out.length); over(head, sample(hair)); over(head, sample(manifest.parts.head_skin!)); exact(out, head); }
  return out;
}

export class NpcSourceProvider implements AssetProvider {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  constructor(private readonly cells: NpcSourceCells) {}
  ids(): readonly string[] { return []; }
  spec(id: string): SpriteSpec | null {
    const f = npcSourceFrame(id); if (!f) return null;
    return { id, w: 160, h: 160, ax: (f.mirror ? 40 - f.display.root[0]! : f.display.root[0]!) * 4, ay: f.display.root[1]! * 4, density: NPC_SOURCE_DENSITY, source: 'art' };
  }
  canvas(id: string): HTMLCanvasElement | null {
    const f = npcSourceFrame(id); if (!f) return null;
    const hit = this.cache.get(f.cacheKey);
    if (hit) { this.cache.delete(f.cacheKey); this.cache.set(f.cacheKey, hit); return hit; }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    if (f.mirror) {
      // Mirror the already sampled entire canvas, guaranteeing true reversed pixels.
      const normal = this.canvas(id.replace(/\/1\/([a-z_]+)\/(\d+)\/(calm|happy|annoyed|tired)$/, '/0/$1/$2/$3'));
      if (!normal) return null;
      ctx.translate(160, 0); ctx.scale(-1, 1); ctx.imageSmoothingEnabled = false; ctx.drawImage(normal, 0, 0);
    } else {
      const source = document.createElement('canvas'); source.width = source.height = 64;
      const g = source.getContext('2d'); if (!g) return null;
      g.putImageData(new ImageData(new Uint8ClampedArray(composeNpcSource(this.cells, f.state, f.index, looks.get(f.look)!)), 64, 64), 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; // bilinear, no 40px intermediate
      const d = f.display;
      ctx.drawImage(source, d.offset[0]! * 4, d.offset[1]! * 4, d.logicalDrawSize * 4, d.logicalDrawSize * 4);
    }
    this.cache.set(f.cacheKey, canvas);
    while (this.cache.size > npcSourceMetadata.maxCachedFrames) this.cache.delete(this.cache.keys().next().value!);
    return canvas;
  }
}

export async function loadNpcSource(): Promise<AssetProvider | null> {
  if (new URLSearchParams(location.search).get('npc') === '0') return null;
  try {
    const cells = new Map<string, Map<string, Uint8ClampedArray>>();
    // Sequential decompression bounds transient sheet memory; retain only 30 occupied cells.
    for (const [p, meta] of Object.entries(manifest.rgbaSources)) {
      const url = sourceUrls['../../assets/npc-source/' + meta.file + '.bin']; if (!url) throw Error('Missing bundled RGBA');
      const response = await fetch(url); if (!response.ok || !response.body) throw Error('RGBA fetch failed');
      const bytes = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const hash = await sha256Bytes(bytes);
      if (bytes.byteLength !== meta.width * meta.height * 4 || hash !== meta.sha256) throw Error('RGBA integrity failed');
      const data = new Uint8ClampedArray(bytes), frames = new Map<string, Uint8ClampedArray>();
      for (const [state, d] of Object.entries(display)) d.frameRects.forEach((r, index) => {
        const out = new Uint8ClampedArray(r.w * r.h * 4);
        for (let y = 0; y < r.h; y++) out.set(data.subarray(((r.y + y) * meta.width + r.x) * 4, ((r.y + y) * meta.width + r.x + r.w) * 4), y * r.w * 4);
        frames.set(`${state}/${index}`, out);
      });
      cells.set(p, frames);
    }
    return new NpcSourceProvider(cells);
  } catch (error) { console.warn('NPC source provider unavailable', error); return null; }
}

/** Native 16-heading authored watercraft. Heading zero travels toward game +J. */
import type { AssetProvider, SpriteSpec } from './types.js';
export interface CraftSpec { logical_size: number; capacity: number; camera_target_z_tiles: number; full_bounds_tiles?: number[][]; tow_socket?: number[]; stern?: number[]; seats: { position: [number, number, number]; pose: string; heading: number }[] }
export interface CraftManifest { revision: number; equipment: Record<string, CraftSpec> }
export function craftHeading(di: number, dj: number): number {
  return ((Math.round(Math.atan2(di, dj) / (Math.PI / 8)) % 16) + 16) % 16;
}
export class WatercraftProvider implements AssetProvider {
  readonly depths = new Map<string, Float32Array>();
  readonly pixels = new Map<string, ImageData>();
  depthOffsets: Record<string, {depth_offset?:number}> = {};
  private frames = new Map<string, HTMLCanvasElement>();
  constructor(readonly manifest: CraftManifest) {}
  ids(): readonly string[] { return [...this.frames.keys()]; }
  spec(id: string): SpriteSpec | null {
    const m = /^watercraft\/([^/]+)\/(\d+)$/.exec(id);
    const craft = m && this.manifest.equipment[m[1]!];
    if (!craft) return null;
    const size = craft.logical_size;
    return { id, w: size, h: size, ax: size / 2, ay: size / 2 + (craft.camera_target_z_tiles ?? .65) * Math.sqrt(512) * Math.cos(Math.PI / 6), source: 'art' };
  }
  canvas(id: string): HTMLCanvasElement | null { return this.frames.get(id) ?? null; }
  async load(base: string): Promise<void> {
    this.depthOffsets = await (await fetch(`${base}/depth-origins.json`)).json() as Record<string,{depth_offset?:number}>;
    await Promise.all(Object.keys(this.manifest.equipment).map(async id => {
      await Promise.all(Array.from({length:16}, async (_,h) => {
        const image = new Image(); image.src = `${base}/${id}/B/native-h${String(h).padStart(2,'0')}.png`;
        await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d'); if (!ctx) throw Error('Watercraft canvas unavailable');
        ctx.drawImage(image,0,0); const key = `watercraft/${id}/${h}`; this.frames.set(key,c);
        this.pixels.set(key,ctx.getImageData(0,0,c.width,c.height));
        const response = await fetch(`${base}/${id}/B/depth-h${String(h).padStart(2,'0')}.bin`);
        if (!response.ok) throw Error(`Missing depth: ${id}/${h}`);
        const z = new Float32Array(await response.arrayBuffer());
        if (z.length !== c.width*c.height) throw Error(`Wrong depth size: ${id}/${h}`);
        this.depths.set(key,z);
      }));
    }));
  }
}
export async function loadWatercraft(base = './assets/approved-watercraft'): Promise<WatercraftProvider> {
  const response = await fetch(`${base}/manifest.json`);
  if (!response.ok) throw Error(`Approved watercraft manifest: ${response.status}`);
  const provider = new WatercraftProvider(await response.json() as CraftManifest);
  await provider.load(base); return provider;
}

/** Approved V8 pixels and contact anchors; simulation coordinates remain authoritative. */
import presentation from '../data/npc-presentation.json';
import type { GuestPose, GuestMoodId } from './draw/guest.js';
import type { AssetProvider, SpriteSpec } from './types.js';

export type NpcV8Pose = GuestPose | 'jump';
export type NpcAtlas = { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
const states = presentation.states as Record<string, { frames: number; fps: number; origin: number[] }>;
const facings = ['+X', '+Z', '-X', '-Z'] as const;

export function npcV8Key(uid: number, facing: number, pose: NpcV8Pose, timeMs: number, mood: GuestMoodId): string {
  const direction = presentation.facings[facings[facing] ?? '+X'];
  const state = `${direction.side}_${pose === 'jump' ? 'jump' : presentation.poses[pose]}`;
  const timing = states[state]!;
  const frame = Math.floor(Math.max(0, timeMs) * timing.fps / 1000) % timing.frames;
  const look = presentation.looks[Math.abs(uid - 1) % presentation.looks.length];
  return `guest/v8/${look}/${state}/${Number(direction.mirror)}/${pose}/${frame}/${mood}`;
}

export function npcV8Frame(id: string): { frame: string; ax: number; ay: number } | null {
  const m = id.match(/^guest\/v8\/(guest-\d+)\/([a-z_]+)\/([01])\/([a-z]+)\/(\d+)\/(calm|happy|annoyed|tired)$/);
  if (!m) return null;
  const state = states[m[2]!];
  if (!state || Number(m[5]) >= state.frames) return null;
  return { frame: `${m[1]}/${m[2]}/${m[3]}/${m[5]}`, ax: m[3] === '1' ? 1 - state.origin[0]! : state.origin[0]!, ay: state.origin[1]! };
}

export class NpcV8Provider implements AssetProvider {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  constructor(private readonly image: HTMLImageElement, private readonly atlas: NpcAtlas) {}
  ids(): readonly string[] { return []; }
  spec(id: string): SpriteSpec | null {
    const m = npcV8Frame(id);
    const f = m && this.atlas.frames[m.frame]?.frame;
    return m && f ? { id, w: f.w, h: f.h, ax: m.ax * f.w, ay: m.ay * f.h, source: 'art' } : null;
  }
  canvas(id: string): HTMLCanvasElement | null {
    const m = npcV8Frame(id);
    const f = m && this.atlas.frames[m.frame]?.frame;
    if (!m || !f) return null;
    const cached = this.cache.get(m.frame);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = f.w; canvas.height = f.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    this.cache.set(m.frame, canvas);
    return canvas;
  }
}

export async function loadNpcV8(): Promise<NpcV8Provider | null> {
  if (new URLSearchParams(location.search).get('npc') === '0') return null;
  try {
    const response = await fetch('./assets/kairo-npc-v8/atlas.json');
    if (!response.ok) return null;
    const atlas = await response.json() as NpcAtlas;
    const image = new Image();
    image.src = './assets/kairo-npc-v8/atlas.png';
    await image.decode();
    return new NpcV8Provider(image, atlas);
  } catch { return null; }
}

/** 직원 역할 순번 — 역할마다 v8 룩이 고정된다 (같은 역할 = 같은 얼굴). 씬(`syncStaff`)과 직원 창 초상이 같은 seed 를 쓴다 */
export const STAFF_ROLE_ORDER: readonly string[] = ['lifeguard', 'cleaner', 'mascot', 'cook'];
export function staffNpcSeed(role: string): number {
  const ix = STAFF_ROLE_ORDER.indexOf(role);
  return 1000 + (ix < 0 ? STAFF_ROLE_ORDER.length : ix) * 7 + 1;
}

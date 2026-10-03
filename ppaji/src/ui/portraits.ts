/**
 * 인물 초상 (P56-b2) — 이름 있는 인물(사장·알바·심사위원 셋)은 등록부 그림 `pic/portrait/<id>_<mood>`(32px), 없으면 코드 초상(`drawPortrait`).
 * 손님·친구·직원은 **v8 도트의 머리**(`npcPortrait`) — 씬의 손님 스프라이트(`npcV8Key`)와 같은 룩이라 지도의 얼굴과 창의 얼굴이 같다.
 * v8 아틀라스가 없으면(`?npc=0`) 코드 초상으로 떨어진다.
 */
import { drawPortrait } from '../assets/draw/portrait.js';
import { npcV8Key } from '../assets/npc-v8.js';
import { hasPicture, pictureEl, pictureId } from './pictures.js';
import portraitsJson from '../data/portraits.json';

export interface PortraitDef { id: string; name: string; palette: number; hair: number }
export const PORTRAITS: ReadonlyMap<string, PortraitDef> = new Map((portraitsJson as PortraitDef[]).map((p) => [p.id, p]));

/** 심사위원 셋의 id — `cert.ts`·`cert-result.ts` 가 같은 순서로 쓴다 (군청 공무원 · 해경 · 유튜버) */
export const JUDGE_IDS = ['judge', 'coastguard', 'youtuber'] as const;

export function portraitEl(id: string, mood: 'calm' | 'happy', fallback?: { palette: number; hair: number }): HTMLElement {
  const pid = pictureId('portrait', `${id}_${mood}`);
  if (hasPicture(pid)) return pictureEl(pid, 'friends', 'kportrait-pic');
  const def = PORTRAITS.get(id);
  const pal = fallback?.palette ?? def?.palette ?? 0;
  const hair = fallback?.hair ?? def?.hair ?? pal % 5;
  return drawPortrait(pal, hair, mood);
}

/** v8 프레임 공급자 — `main.ts` 가 provider 를 만든 뒤 `setNpcFrameSource((id) => provider.canvas(id))` 로 잇는다. 없으면 코드 초상 폴백 */
export let npcFrameSource: ((id: string) => HTMLCanvasElement | null) | null = null;
let npcFrameDensity:(id:string)=>number=()=>1;
export function setNpcFrameSource(fn: ((id: string) => HTMLCanvasElement | null) | null,density:(id:string)=>number=()=>1): void { npcFrameSource = fn;npcFrameDensity=density;headRects.clear(); }

export const NPC_PORTRAIT = 32;
/** 머리 = 불투명 영역의 위 55% */
const HEAD_RATIO = 0.55;
/** 프레임마다 잘라 낼 머리 사각형 (불투명 픽셀 bbox 에서 유도) — 프레임 키로 캐시 */
const headRects = new Map<string, { x: number; y: number; w: number; h: number } | null>();

function headRectOf(key: string, src: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const hit = headRects.get(key);
  if (hit !== undefined) return hit;
  const g = src.getContext('2d');
  if (!g) return null;
  const { width: w, height: h } = src;
  const px = g.getImageData(0, 0, w, h).data;
  let top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((px[(y * w + x) * 4 + 3] ?? 0) < 8) continue;
    if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x;
  }
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  if (bottom >= top) {
    const headH = Math.max(1, Math.round((bottom - top + 1) * HEAD_RATIO));
    const side = NPC_PORTRAIT / 2 * npcFrameDensity(key); // 2배 확대라 원본에서 16 칸
    const cx = Math.round((left + right + 1) / 2);
    rect = { x: cx - side / 2, y: top, w: side, h: Math.min(headH, side) };
  }
  headRects.set(key, rect);
  return rect;
}

/**
 * 손님·친구·직원 초상 — `npcV8Key(seed, 0, 'idle', 0, mood)` 프레임의 머리(위 55%)를 2배로 키워 32×32 에 그린다.
 * `seed` 는 손님 uid·친구 팔레트·직원 역할 seed(`staffNpcSeed`) 등 룩을 정하는 정수. 프레임이 없으면 코드 초상.
 */
export function npcPortrait(seed: number, mood: 'calm' | 'happy'): HTMLCanvasElement {
  const key = npcV8Key(seed, 0, 'idle', 0, mood);
  const src = npcFrameSource?.(key) ?? null;
  const rect = src ? headRectOf(key, src) : null;
  if (!src || !rect) return drawPortrait(seed % 8, seed % 5, mood);
  const c = document.createElement('canvas');
  c.width = NPC_PORTRAIT; c.height = NPC_PORTRAIT;
  c.dataset['npc'] = key;
  const g = c.getContext('2d');
  if (!g) return c;
  const density=npcFrameDensity(key);g.imageSmoothingEnabled = density>1;
  const dw = rect.w * 2/density, dh = rect.h * 2/density;
  g.drawImage(src, rect.x, rect.y, rect.w, rect.h, Math.round((NPC_PORTRAIT - dw) / 2), Math.round((NPC_PORTRAIT - dh) / 2), dw, dh);
  return c;
}

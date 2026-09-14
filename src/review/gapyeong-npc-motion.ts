import { spanDepthKey, Z_GUEST } from '../render/kairo/iso.js';

/** Authored front faces screen ↘, back faces ↗; mirrors supply the other two diagonals. */
export function npcWalkFacing(di: number, dj: number): { direction: 'front' | 'back'; mirror: boolean } {
  const sx = di - dj, sy = di + dj;
  return { direction: sy >= 0 ? 'front' : 'back', mirror: sx < 0 };
}

/** Use the same two-tile depth as live guests, never an interpolated terrain depth. */
export function npcWalkDepth(i: number, j: number): number {
  return spanDepthKey(Math.floor(i), Math.floor(j), Math.ceil(i), Math.ceil(j)) + Z_GUEST;
}

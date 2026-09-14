import type { KairoTerrain } from './terrain.js';

/** Physical root rotations: +I, -J, -I, +J. Heights are terrain levels, not pixels. */
export const SLOPE_UP = [[1, 0], [0, -1], [-1, 0], [0, 1]] as const;
export type SlopeFacing = 0 | 1 | 2 | 3;
export interface SlopeShape { facing: SlopeFacing; base: number; di: number; dj: number }
export const isSlopeKind = (kind: string | null): boolean => kind === 'path_ramp' || kind === 'path_steps';

/** A full low tile connects to one higher neighbour, with a low landing opposite. */
export function slopeShapeAt(t: KairoTerrain, i: number, j: number): SlopeShape | null {
  if (!t.inside(i, j) || !t.isBuildable(i, j) || t.isWater(i, j)) return null;
  const base = t.levelAt(i, j);
  const highs = SLOPE_UP.flatMap(([di, dj], facing) =>
    t.inside(i + di, j + dj) && t.levelAt(i + di, j + dj) === base + 1
      ? [{ facing: facing as SlopeFacing, base, di, dj }] : []);
  if (highs.length !== 1) return null;
  const s = highs[0]!;
  for (const sign of [-1, 1]) {
    const x = i + s.di * sign, y = j + s.dj * sign;
    if (!t.inside(x, y) || t.isWater(x, y) || t.isIndoor(x, y) || !t.isBuildable(x, y)
      || t.levelAt(x, y) !== base + (sign === 1 ? 1 : 0)) return null;
  }
  return s;
}

export function slopeAt(t: KairoTerrain, i: number, j: number): SlopeShape | null {
  return isSlopeKind(t.kindAt(i, j)) ? slopeShapeAt(t, i, j) : null;
}

/** Side access is allowed only between parallel, equally elevated ramp tiles. */
export function slopeCrossable(t: KairoTerrain, ai: number, aj: number, bi: number, bj: number): boolean {
  for (const [i, j, ni, nj] of [[ai, aj, bi, bj], [bi, bj, ai, aj]]) {
    if (!isSlopeKind(t.kindAt(i!, j!))) continue;
    const s = slopeAt(t, i!, j!);
    if (!s) return false;
    const dot = (ni! - i!) * s.di + (nj! - j!) * s.dj;
    if (dot !== 0) {
      if (t.levelAt(ni!, nj!) !== s.base + (dot > 0 ? 1 : 0) || t.isIndoor(ni!, nj!)) return false;
      const next = slopeAt(t, ni!, nj!);
      if (next && next.facing !== s.facing) return false;
    } else {
      const next = slopeAt(t, ni!, nj!);
      if (!next || next.facing !== s.facing || next.base !== s.base || t.kindAt(i!, j!) !== t.kindAt(ni!, nj!)) return false;
    }
  }
  return true;
}

/** Tile-centre foot elevation; ramp/landing contact is exact, stair risers are eased. */
export function surfaceLevel(t: KairoTerrain, x: number, y: number): number {
  const i = Math.floor(x + .5), j = Math.floor(y + .5), s = slopeAt(t, i, j);
  if (!s) return t.levelAt(i, j);
  const u = Math.max(0, Math.min(1, .5 + (x - i) * s.di + (y - j) * s.dj));
  if (t.kindAt(i, j) !== 'path_steps') return s.base + u;
  // Ease the foot over each riser instead of jumping 4px at floor() boundaries.
  let rise = 0;
  for (let step = 0; step < 4; step++) {
    const p = Math.max(0, Math.min(1, (u - step / 4) / .125));
    rise += p * p * (3 - 2 * p) / 4;
  }
  return s.base + rise;
}

export function movementLevel(t: KairoTerrain, ai: number, aj: number, bi: number, bj: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (isSlopeKind(t.kindAt(Math.round(ai), Math.round(aj))) || isSlopeKind(t.kindAt(bi, bj))) {
    return surfaceLevel(t, ai + (bi - ai) * p, aj + (bj - aj) * p);
  }
  // Preserve pre-existing saved paths which crossed a one-level edge before explicit ramps existed.
  return t.levelAt(Math.round(ai), Math.round(aj)) * (1 - p) + t.levelAt(bi, bj) * p;
}

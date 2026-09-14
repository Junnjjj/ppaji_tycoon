import type { KairoTerrain } from '../../sim/kairo/terrain.js';
import { slopeAt } from '../../sim/kairo/slopes.js';
import { depthKey, gridToScreen, screenToTile } from './iso.js';

/** Pick the visible top surface, rather than the level-zero tile underneath it. */
export function heightTileAt(t: KairoTerrain, x: number, y: number, levelHeight: number): { i: number; j: number } {
  const candidates = new Map<string, { i: number; j: number }>();
  for (let z = 0; z <= 3; z += .25) {
    const c = screenToTile(x, y + z * levelHeight);
    for (const [di, dj] of [[0, 0], [-1, 0], [0, -1]]) {
      const i = c.i + di!, j = c.j + dj!;
      if (t.inside(i, j)) candidates.set(`${i},${j}`, { i, j });
    }
  }
  const found = [...candidates.values()].sort((a, b) => depthKey(b.i, b.j) - depthKey(a.i, a.j));
  for (const { i, j } of found) {
    const slope = slopeAt(t, i, j);
    const poly = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
      const p = gridToScreen(i + u!, j + v!);
      const height = t.levelAt(i, j) + (slope ? .5 + (u! - .5) * slope.di + (v! - .5) * slope.dj : 0);
      return { x: p.x, y: p.y - height * levelHeight };
    });
    if (x < Math.min(...poly.map(p => p.x)) - .001 || x > Math.max(...poly.map(p => p.x)) + .001
      || y < Math.min(...poly.map(p => p.y)) - .001 || y > Math.max(...poly.map(p => p.y)) + .001) continue;
    let pos = false, neg = false;
    for (let n = 0; n < 4; n++) {
      const a = poly[n]!, b = poly[(n + 1) % 4]!;
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cross > .001) pos = true;
      if (cross < -.001) neg = true;
    }
    if (!(pos && neg)) return { i, j };
  }
  return screenToTile(x, y);
}

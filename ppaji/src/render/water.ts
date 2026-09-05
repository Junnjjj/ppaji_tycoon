/**
 * 물 반짝임 (ambient) — 풀 타일 위에 흰 3×1 획이 `x + 2y ≡ phase (mod 18)` 띠로 밀린다.
 * Graphics 한 장이라 깊이는 하나다: 모든 지면보다 위, 힌트 층보다 아래. 손님이 수면 획 아래에
 * 깔리는 경우가 있지만 획이 1텍셀이라 안 보인다. 6프레임에 한 번만 다시 그린다.
 */
import type Phaser from 'phaser';
import { gridToScreen, depthKey, Z_WATER, GRID_W, GRID_H, TILE_H, tileRowSpan } from './iso.js';
import { cssColorInt } from '../ui/tokens.js';

export const DEPTH_WATER_GLINT = depthKey(GRID_W - 1, GRID_H - 1) + Z_WATER + 1;
const PERIOD = 18;
const REDRAW_EVERY = 6;

export class WaterGlint {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private frame = 0;
  private tiles: readonly number[] = [];
  private w = GRID_W;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(DEPTH_WATER_GLINT);
  }

  setTiles(tiles: readonly number[], w: number): void {
    this.tiles = tiles;
    this.w = w;
    this.frame = -1;
  }

  update(reduced: boolean): void {
    this.frame++;
    if (this.frame % REDRAW_EVERY !== 0 && this.frame !== 0) return;
    const phase = reduced ? 0 : Math.floor(this.frame / REDRAW_EVERY) % PERIOD;
    this.gfx.clear();
    if (this.tiles.length === 0) return;
    this.gfx.fillStyle(cssColorInt('--water-glint'), 0.7);
    for (const k of this.tiles) {
      const i = k % this.w;
      const j = Math.floor(k / this.w);
      const p = gridToScreen(i, j);
      const ox = p.x - 16;
      for (let y = 2; y < TILE_H - 2; y += 2) {
        const s = tileRowSpan(y);
        for (let x = s.x0 + 1; x < s.x1 - 3; x++) {
          const gx = ox + x;
          const gy = p.y + y;
          if ((((gx + 2 * gy - phase) % PERIOD) + PERIOD) % PERIOD === 0) this.gfx.fillRect(gx, gy, 3, 1);
        }
      }
    }
  }
}

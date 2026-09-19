/**
 * 물 반짝임 (ambient) — 풀 타일 위에 흰 3×1 획이 `x + 2y ≡ phase (mod 18)` 띠로 밀린다.
 * 대각 타일 행마다 깊이를 나눠 선체·데크·손님 위로 물결이 비치지 않게 한다.
 * 6프레임에 한 번만 다시 그린다.
 */
import type Phaser from 'phaser';
import { gridToScreen, Z_BAND, Z_WATER, GRID_W, TILE_H, tileRowSpan } from './iso.js';
import { cssColorInt } from '../ui/tokens.js';

export function waterGlintDepth(row: number, width: number): number { return row * Z_BAND + width - 1 + Z_WATER; }
const PERIOD = 18;
const REDRAW_EVERY = 6;

export class WaterGlint {
  private readonly rows = new Map<number, Phaser.GameObjects.Graphics>();
  private frame = 0;
  private tiles: readonly number[] = [];
  private w = GRID_W;

  constructor(private readonly scene: Phaser.Scene) {}

  setTiles(tiles: readonly number[], w: number): void {
    this.tiles = tiles;
    this.w = w;
    this.frame = -1;
  }

  update(reduced: boolean): void {
    this.frame++;
    if (this.frame % REDRAW_EVERY !== 0 && this.frame !== 0) return;
    const phase = reduced ? 0 : Math.floor(this.frame / REDRAW_EVERY) % PERIOD;
    for (const gfx of this.rows.values()) gfx.clear();
    if (this.tiles.length === 0) return;
    const color=cssColorInt('--water-glint');
    for (const k of this.tiles) {
      const i = k % this.w;
      const j = Math.floor(k / this.w);
      const row=i+j;let gfx=this.rows.get(row);if(!gfx){gfx=this.scene.add.graphics().setDepth(waterGlintDepth(row,this.w));this.rows.set(row,gfx);}gfx.fillStyle(color,0.7);
      const p = gridToScreen(i, j);
      const ox = p.x - 16;
      for (let y = 2; y < TILE_H - 2; y += 2) {
        const s = tileRowSpan(y);
        for (let x = s.x0 + 1; x < s.x1 - 3; x++) {
          const gx = ox + x;
          const gy = p.y + y;
          if ((((gx + 2 * gy - phase) % PERIOD) + PERIOD) % PERIOD === 0) gfx.fillRect(gx, gy, 3, 1);
        }
      }
    }
  }
}

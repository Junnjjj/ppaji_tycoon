/**
 * 지도 바깥 (P44 — 레거시 K38 「지도 바깥을 게임의 지면으로 덮는다」의 가벼운 판).
 * 격자 밖은 **같은 타일 텍스처를 이어 붙인 큰 TileSprite** 넷이다 — 잔디 바탕 · 강 띠(강 줄을 좌우로 잇고 아래로 몇 줄 더) ·
 * 차도 띠 · 정류장 보도 띠. 각 띠는 격자 줄 번호로 자른 평행사변형 마스크를 쓴다. 그림 파일이 아니라 지면 타일이라 경계에서 결이 안 어긋난다.
 * 캔버스 한 장으로 굽지 않는다 — 폰 텍스처 상한(4096)을 넘긴다. TileSprite 는 32×16 한 장을 GPU 가 반복한다.
 */
import Phaser from 'phaser';
import { STEP_X, STEP_Y, TILE_W, TILE_H } from './iso.js';
import { worldBounds } from './camera.js';
import { RIVER, ROAD_ROWS, STOP_ROW, CITY_BAND } from '../sim/grid.js';

/** 아이소 마름모 한 장을 32×16 직사각 반복 텍스처로 — 가운데 한 장 + 네 귀퉁이 반 장씩 */
export function tileableFromDiamond(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_W; c.height = TILE_H;
  const g = c.getContext('2d');
  if (!g) return c;
  for (const [dx, dy] of [[0, 0], [-STEP_X, -STEP_Y], [STEP_X, -STEP_Y], [-STEP_X, STEP_Y], [STEP_X, STEP_Y]] as const) g.drawImage(src, dx, dy);
  return c;
}

/** 격자 줄 j 의 경계선 y (x 에서) — 연속 좌표에서 j = y/16 − x/32 */
function rowLineY(j: number, x: number): number { return TILE_H * j + x / 2; }

export interface SurroundBands { water: number; road: [number, number]; stop: number; band: number }
export const SURROUND_WATER_EXTRA = 0; // P48-b3: 본류가 S 라 격자 안 아래쪽(행 45~71 가운데)은 건너편 뭍이다 — 격자 아래 바깥도 뭍이어야 이어진다. 양옆 바깥은 옛 띠(행 50~71)가 곧게 이어진다

export class Surround {
  private sprites: Phaser.GameObjects.TileSprite[] = [];
  private masks: Phaser.GameObjects.Graphics[] = [];
  constructor(private readonly scene: Phaser.Scene, private readonly canvasOf: (id: string) => HTMLCanvasElement | null, private readonly depth: number) {}

  build(): void {
    this.destroy();
    const b = worldBounds();
    const pad = 96;
    // 바탕 위치는 격자 격자무늬와 맞아야 한다: x ≡ 16 (mod 32) · y ≡ 0 (mod 16)
    const x0 = Math.floor((b.minX - pad) / TILE_W) * TILE_W + STEP_X;
    const y0 = Math.floor((b.minY - pad) / TILE_H) * TILE_H;
    const w = b.maxX + pad - x0, h = b.maxY + pad - y0;
    const add = (id: string, key: string, rows: [number, number] | null): void => {
      const src = this.canvasOf(id); if (!src) return;
      if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, tileableFromDiamond(src));
      const ts = this.scene.add.tileSprite(x0, y0, w, h, key).setOrigin(0, 0).setDepth(this.depth);
      if (rows) {
        const xl = x0 - 64, xr = x0 + w + 64;
        const m = this.scene.make.graphics({ x: 0, y: 0 }, false);
        m.fillStyle(0xffffff, 1);
        m.fillPoints([
          new Phaser.Geom.Point(xl, rowLineY(rows[0], xl)), new Phaser.Geom.Point(xr, rowLineY(rows[0], xr)),
          new Phaser.Geom.Point(xr, rowLineY(rows[1], xr)), new Phaser.Geom.Point(xl, rowLineY(rows[1], xl)),
        ], true);
        ts.setMask(m.createGeometryMask());
        this.masks.push(m);
      }
      this.sprites.push(ts);
    };
    add('tile/grass', 'surround/grass', null);
    add('tile/river:0', 'surround/river', [RIVER.j0, RIVER.j0 + RIVER.h + SURROUND_WATER_EXTRA]);
    add('tile/road', 'surround/road', [ROAD_ROWS[0] as number, (ROAD_ROWS[ROAD_ROWS.length - 1] as number) + 1]);
    add('tile/sidewalk', 'surround/sidewalk', [STOP_ROW, STOP_ROW + 1]);
    add('tile/sand', 'surround/sand', [STOP_ROW + 1, CITY_BAND]);
  }
  count(): number { return this.sprites.length; }
  destroy(): void {
    for (const s of this.sprites) s.destroy();
    for (const m of this.masks) m.destroy();
    this.sprites = []; this.masks = [];
  }
}

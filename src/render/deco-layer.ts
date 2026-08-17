import type Phaser from 'phaser';
import { Terrain, type Game as Sim } from '../sim/index.js';
import { variantId } from '../assets/index.js';
import { TILE_SIZE } from './constants.js';

/**
 * 절차 데코 산포 — v5 밀도 레이어 (design-v5-draft §공간 문법 ④).
 *
 * 빈 타일에 나무·파라솔·정박 보트를 결정론 해시로 흩뿌린다. 시각 전용이다 —
 * sim 은 데코를 모르고(불변식 1 역방향: 렌더도 sim 상태를 바꾸지 않는다),
 * 시드가 같으면 항상 같은 자리에 난다. 시설이 있는 타일은 비켜 간다.
 */

function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export function scatterDeco(scene: Phaser.Scene, sim: Sim): number {
  const world = sim.world;
  const seed = sim.seed ^ 0x5eed;
  let count = 0;

  const put = (key: string, x: number, y: number, jx: number, jy: number): void => {
    if (!scene.textures.exists(key)) return;
    const px = x * TILE_SIZE + TILE_SIZE / 2 + jx;
    const py = y * TILE_SIZE + TILE_SIZE - 1 + jy;
    scene.add.image(px, py, key).setOrigin(0.5, 1).setDepth(py);
    count++;
  };

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (sim.facilities.facilityAt(x, y)) continue;
      const t = world.at(x, y);
      const r = hash2(x, y, seed);
      const alt = Math.floor(hash2(x, y, seed ^ 0x77) * 3);
      const jx = Math.floor(hash2(x, y, seed ^ 0xaa) * 8) - 4;
      const jy = Math.floor(hash2(x, y, seed ^ 0xbb) * 4) - 2;

      if (t === Terrain.Forest && r < 0.16) {
        put(variantId('prop/tree', { alt }), x, y, jx, jy);
      } else if (t === Terrain.Plain && r < 0.05) {
        put(variantId('prop/tree', { alt }), x, y, jx, jy);
      } else if (t === Terrain.Slope && r < 0.08) {
        put(variantId('prop/tree', { alt }), x, y, jx, jy);
      } else if (t === Terrain.Sand && r < 0.025) {
        put(variantId('prop/parasol', { alt: alt % 2 }), x, y, jx, 0);
      } else if ((t === Terrain.Deep || t === Terrain.OpenWater) && r < 0.008) {
        // 정박 보트 — 외곽 수역의 생활감
        put(alt === 0 ? 'vehicle/banana' : 'vehicle/jetski', x, y, jx, jy);
      }
    }
  }
  return count;
}

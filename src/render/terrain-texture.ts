import type { World } from '../sim/index.js';
import { Terrain } from '../sim/index.js';
import { variantId, type AssetProvider } from '../assets/index.js';
import { TILE_SIZE } from './constants.js';

/**
 * 지형 전체를 캔버스 한 장에 한 번만 구워둔다.
 *
 * 매 프레임 타일 수천 개를 그리는 대신 이미지 하나를 그린다.
 * 프로토타입에서 배경 캐시로 검증한 방식이며, 지형이 바뀌면 해당 영역만 다시 굽는다.
 */

const TERRAIN_SPRITE: Record<Terrain, string> = {
  [Terrain.Plain]: 'terrain/plain',
  [Terrain.Sand]: 'terrain/sand',
  [Terrain.Forest]: 'terrain/forest',
  [Terrain.Slope]: 'terrain/slope',
  [Terrain.Rock]: 'terrain/rock',
  [Terrain.Roadside]: 'terrain/roadside',
  [Terrain.Shore]: 'terrain/shore',
  [Terrain.Shallow]: 'terrain/shallow',
  [Terrain.Deep]: 'terrain/deep',
  [Terrain.OpenWater]: 'terrain/openwater',
  [Terrain.Current]: 'terrain/current',
};

const ALT_COUNT = 3;

/** 타일 좌표에서 결정론적으로 변주를 고른다 — 같은 자리는 항상 같은 모습. */
function altFor(x: number, y: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) % ALT_COUNT;
}

export interface TerrainTexture {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  /** 일부 영역만 다시 굽는다 (토지 매입·지형 변경 시). 타일 좌표, x1·y1 은 미포함. */
  redraw(world: World, x0: number, y0: number, x1: number, y1: number): void;
}

export function buildTerrainTexture(world: World, provider: AssetProvider): TerrainTexture {
  const widthPx = world.width * TILE_SIZE;
  const heightPx = world.height * TILE_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('지형 텍스처: 2D 컨텍스트를 얻지 못했습니다');
  g.imageSmoothingEnabled = false;

  function stamp(w: World, x0: number, y0: number, x1: number, y1: number): void {
    const ctx = g as CanvasRenderingContext2D;
    const xs = Math.max(0, x0);
    const ys = Math.max(0, y0);
    const xe = Math.min(w.width, x1);
    const ye = Math.min(w.height, y1);
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        const id = variantId(TERRAIN_SPRITE[w.at(x, y)], { alt: altFor(x, y) });
        ctx.drawImage(provider.get(id), x * TILE_SIZE, y * TILE_SIZE);
      }
    }
  }

  stamp(world, 0, 0, world.width, world.height);

  return {
    canvas,
    widthPx,
    heightPx,
    redraw: (w, x0, y0, x1, y1) => stamp(w, x0, y0, x1, y1),
  };
}

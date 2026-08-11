import { Terrain, isWater, isLand } from './terrain.js';

/**
 * 타일맵. 지형만 담는다.
 * 시설·손님 등 동적인 것은 별도 모듈이 소유하고, 여기는 정적인 땅만 안다.
 */
export class World {
  readonly width: number;
  readonly height: number;
  /** row-major, 길이 width*height */
  readonly tiles: Uint8Array;

  constructor(width: number, height: number, tiles?: Uint8Array) {
    this.width = width;
    this.height = height;
    if (tiles) {
      if (tiles.length !== width * height) {
        throw new Error(
          `World: 타일 길이 불일치 (기대 ${width * height}, 실제 ${tiles.length})`,
        );
      }
      this.tiles = tiles;
    } else {
      this.tiles = new Uint8Array(width * height);
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** 경계 밖은 Rock 으로 취급해 호출부의 경계 검사를 줄인다. */
  at(x: number, y: number): Terrain {
    if (!this.inBounds(x, y)) return Terrain.Rock;
    return this.tiles[y * this.width + x] as Terrain;
  }

  set(x: number, y: number, t: Terrain): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.width + x] = t;
  }

  isWaterAt(x: number, y: number): boolean {
    return isWater(this.at(x, y));
  }

  isLandAt(x: number, y: number): boolean {
    return isLand(this.at(x, y));
  }

  /** 지형별 타일 수. 헤드리스 리포트·검증용. */
  histogram(): Map<Terrain, number> {
    const h = new Map<Terrain, number>();
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i] as Terrain;
      h.set(t, (h.get(t) ?? 0) + 1);
    }
    return h;
  }
}

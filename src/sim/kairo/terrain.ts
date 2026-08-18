import rawGround from '../../data/kairo-ground.json' with { type: 'json' };
import { Rng } from '../rng.js';

/**
 * 카이로 지면 격자 — **시뮬 소유**.
 *
 * 왜 렌더가 아니라 sim 인가: K3 의 밀폐 도달 검사와 K5 의 flow field 길찾기가
 * "걸을 수 있는 칸"을 알아야 한다. 그 정보가 `render/` 나 `assets/` 에 있으면
 * 불변식 1(sim 은 바깥을 모른다)이 깨지고 헤드리스 러너에서 길찾기를 못 돌린다.
 *
 * 렌더는 이 격자를 **읽기만** 한다 (`kindAt`). 어떤 그림을 쓸지는 렌더 계약이 정한다.
 *
 * 결정론: 기본 지형 생성은 주입된 `Rng` 만 쓴다. `Math.random` 금지 (불변식 2).
 */

export interface GroundKindDef {
  id: string;
  name: string;
  walkable: boolean;
  default: boolean;
  /** 1칸을 까는 값 (K27). 카이로의 `Tiling` — 바닥은 편집기 도구가 아니라 **사는 것**이다 */
  cost: number;
  /** 실내 바닥인가. **이 칸들이 곧 방이다** — 벽은 그 외곽선으로 자동 생성된다 */
  indoor: boolean;
}

const DATA = rawGround as unknown as {
  kinds: readonly GroundKindDef[];
  bridges: readonly { id: string; name: string; walkable: boolean }[];
};

export const GROUND_KINDS: readonly GroundKindDef[] = DATA.kinds;
export const BRIDGE_KINDS = DATA.bridges;

const INDEX = new Map(GROUND_KINDS.map((k, i) => [k.id, i]));

export function groundIndex(id: string): number {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`알 수 없는 지면 종류: ${id}`);
  return i;
}

export function groundDef(index: number): GroundKindDef {
  const d = GROUND_KINDS[index];
  if (!d) throw new Error(`지면 인덱스 범위 밖: ${index}`);
  return d;
}

export interface TerrainSnapshot {
  w: number;
  h: number;
  /** 종류 인덱스 배열 — 세이브에 그대로 들어간다 */
  kinds: number[];
}

export class KairoTerrain {
  private readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height);
  }

  /**
   * 시드에서 기본 지형을 만든다 — 강이 가로로 흐르는 파노라마 (스펙 §1.6).
   * `j` 가 클수록 카메라 쪽이므로 뒤(작은 j)를 육지, 앞을 물로 둔다.
   */
  static generate(
    width: number,
    height: number,
    rng: Rng,
    /**
     * 맵 타입 (§4.5). 육지 비율과 물가 흔들림을 바꾼다 —
     * 북한강형은 물이 넓고, 계곡형은 육지가 넓고, 호수형은 물가가 불규칙하다.
     */
    shape: { landRatio: number; shoreJitter: number } = { landRatio: 0.55, shoreJitter: 2 },
  ): KairoTerrain {
    const t = new KairoTerrain(width, height);
    const lawn = groundIndex('lawn');
    const sand = groundIndex('path_sand');
    const stone = groundIndex('path_stone');
    const water = groundIndex('water_edge');
    const base = Math.max(3, Math.min(height - 4, Math.floor(height * shape.landRatio)));
    for (let i = 0; i < width; i++) {
      // 물가 선을 살짝 흔든다 — 직선이면 인공적으로 보인다
      const shore = base + rng.intRange(0, Math.max(0, shape.shoreJitter));
      for (let j = 0; j < height; j++) {
        let k = lawn;
        if (j > shore) k = water;
        else if (j === shore) k = sand;
        else if (j > shore - 3) k = stone;
        t.cells[j * width + i] = k;
      }
    }
    return t;
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.width && j < this.height;
  }

  /** 종류 인덱스. 격자 밖은 −1 */
  at(i: number, j: number): number {
    return this.inside(i, j) ? (this.cells[j * this.width + i] as number) : -1;
  }

  kindAt(i: number, j: number): string | null {
    const k = this.at(i, j);
    return k < 0 ? null : groundDef(k).id;
  }

  /**
   * 물인가.
   *
   * 카이로 전환에서 **수심을 없앴다** — 물은 하나고 `water_edge` 가 그것이다
   * (`docs/kairo-pivot-decisions.md`). 코스·수상 시설이 "물 위인가"를 물을 때 종류 문자열을
   * 직접 비교하면, 나중에 물 종류가 늘 때 부르는 쪽을 전부 고쳐야 한다.
   */
  isWater(i: number, j: number): boolean {
    return this.kindAt(i, j) === 'water_edge';
  }

  /**
   * 실내인가 — **바닥이 곧 방이다** (K27, 카이로 방식).
   *
   * Pool Slide Story 의 규칙 그대로다: "Any indoor tile created will make an indoor area,
   * which requires an Entrance for customers to access." 플레이어는 사각형을 그리지 않는다.
   * 실내 바닥을 깔면 그 자리가 실내가 되고, 벽은 그 결과로 그려진다.
   *
   * 그래서 "실내"를 따로 저장하지 않는다 — 지형이 이미 답이다. 별도 저장소를 두면
   * 지형과 어긋날 수 있고, 실제로 사각형 모델일 때 그 어긋남이 문제를 여섯 개 만들었다.
   */
  isIndoor(i: number, j: number): boolean {
    const k = this.at(i, j);
    return k < 0 ? false : groundDef(k).indoor;
  }

  /** 지면만 보고 걸을 수 있는가. 벽·시설 점유는 K3·K4 가 따로 얹는다 */
  isWalkable(i: number, j: number): boolean {
    const k = this.at(i, j);
    return k < 0 ? false : groundDef(k).walkable;
  }

  paint(i: number, j: number, kindId: string): boolean {
    if (!this.inside(i, j)) return false;
    this.cells[j * this.width + i] = groundIndex(kindId);
    return true;
  }

  /** 직선 경로를 칠한다 — 배치 UI 가 드래그로 길을 낼 때 쓴다 */
  paintLine(i0: number, j0: number, i1: number, j1: number, kindId: string): number {
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
    let painted = 0;
    for (let s = 0; s <= n; s++) {
      const t = n === 0 ? 0 : s / n;
      const i = Math.round(i0 + (i1 - i0) * t);
      const j = Math.round(j0 + (j1 - j0) * t);
      if (this.paint(i, j, kindId)) painted++;
    }
    return painted;
  }

  countWalkable(): number {
    let n = 0;
    for (let k = 0; k < this.cells.length; k++) {
      if (groundDef(this.cells[k] as number).walkable) n++;
    }
    return n;
  }

  toSnapshot(): TerrainSnapshot {
    return { w: this.width, h: this.height, kinds: Array.from(this.cells) };
  }

  static fromSnapshot(s: TerrainSnapshot): KairoTerrain {
    const t = new KairoTerrain(s.w, s.h);
    for (let k = 0; k < t.cells.length && k < s.kinds.length; k++) {
      t.cells[k] = s.kinds[k] as number;
    }
    return t;
  }
}

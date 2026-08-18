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
  /**
   * 손님이 **지나갈 수 있나** (K32-B). `walkable` 과 다르다.
   *
   * `walkable` 은 "육지인가" — 잔디에도 시설을 **지을 수는** 있다.
   * `guestWalk` 는 "손님이 다니나" — 잔디는 못 다닌다. 길을 까는 것이 곧 동선 설계이고,
   * 건물 입구도 **길이 닿은 쪽**에 난다.
   */
  guestWalk: boolean;
  /**
   * 플레이어가 **여기에 지을 수 있나** (K36). 앞의 둘과 또 다른 축이다.
   *
   * 공원 바깥의 도시 띠(도로·보도·가로수)는 걸을 수는 있어도 못 짓는다. 이게 있어야
   * "여기까지가 내 땅"이 성립하고, 손님이 어디서 오는지가 화면에 남는다.
   *
   * ⚠ `landRect`(등급별 해금)로 표현하지 않는 이유: 토지는 (0,0) 에 붙은 사각형이라
   * 바깥 테두리를 낼 수 없다. 지형 플래그면 막을 곳이 **둘**뿐이다
   * (`placement.check` · 바닥 붓).
   */
  buildable: boolean;
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
  /**
   * 공원 위쪽의 **도시 띠** 높이 (K36).
   *
   * 설계 §4.4 가 처음부터 "도로 (맵 상단 가장자리 지형)" 이라고 적어 뒀다 —
   * 접근 방향을 고정해야 동선 판단이 된다.
   *
   * ⚠ 처음엔 3줄(차도·보도·가로수)이었는데 **너무 붙어 있었다.** 버스가 서는 곳과
   * 공원 입구가 붙어 있으면 "밖에서 안으로 들어온다"가 안 읽힌다. 8줄로 벌려
   * 정류장에서 입구까지 **다섯 칸을 걸어 내려오게** 한다.
   *
   * 줄 구성 (위 → 아래):
   *   0     가로수  — 도시 가장자리. 배경 산과 이어진다
   *   1~2   차도    — 두 줄이라 버스가 실제로 도로 위에 있어 보인다
   *   3     보도    — **정류장.** 손님이 여기서 내린다
   *   4~7   가로수  — 진입 광장. 입구 열만 보도로 뚫려 있다
   */
  static readonly CITY_BAND = 8;

  /** 버스가 다니는 줄들 (차도) */
  static readonly ROAD_ROWS: readonly number[] = [1, 2];

  /** 정류장이 있는 보도 줄 */
  static readonly STOP_ROW = 3;

  /**
   * 격자 크기 — **게임 상수다** (K36 에서 render 에서 옮겨 왔다).
   *
   * 예전엔 `render/kairo/iso.ts` 에만 있었다. sim 은 크기를 생성자로 받으므로 문제가
   * 없었지만, **세이브 마이그레이션이 새 크기를 알아야 했다** — `save/` 가 `render/` 를
   * import 하면 의존 방향이 뒤집힌다. 크기는 렌더 사정이 아니라 게임 사정이다.
   *
   * `iso.ts` 는 여기서 다시 내보낸다 (render → sim 은 허용 방향).
   */
  static readonly WIDTH = 96;
  static readonly HEIGHT = 72;

  /**
   * 입구가 뚫린 열 (K36). 가로수 줄에 이 열만 보도로 뚫어 공원과 이어 준다.
   *
   * 가로수는 `guestWalk: false` 라 손님이 못 넘는다 — 뚫린 열이 없으면 도시 띠와 공원이
   * 통행상 완전히 끊긴다. **입구가 하나뿐이어야** "손님이 어디로 들어오는가"가 고정되고,
   * 설계 §4.4 가 말한 "접근 방향을 고정"이 성립한다.
   *
   * ⚠ **가로 한가운데**다 (K36). 처음엔 왼쪽 끝(4)에 뒀는데, 그러면 토지가 한쪽으로만
   * 자라고 "좌우로 넓혀 간다"가 성립하지 않는다. 입구가 가운데라야 해금이 양옆으로
   * 퍼지고, 리조트가 입구를 중심으로 자란다.
   */
  static readonly ENTRY_I = Math.floor(96 / 2);

  /** 버스가 서는 보도 칸 — 손님이 여기서 내린다 */
  static busStop(): { i: number; j: number } {
    return { i: KairoTerrain.ENTRY_I, j: KairoTerrain.STOP_ROW };
  }

  /** 공원 쪽 입구 칸 — 게이트다. 거리장·문 고르기·도달 검사의 기준점 */
  static parkGate(): { i: number; j: number } {
    return { i: KairoTerrain.ENTRY_I, j: KairoTerrain.CITY_BAND };
  }

  /**
   * 해금된 토지 — **입구를 중심으로 좌우로 자란다** (K36).
   *
   * 예전엔 `(0,0)` 에 붙은 사각형이었다. 입구가 왼쪽 끝이었으니 그래도 됐지만, 입구가
   * 가운데로 오면 한쪽으로만 자라는 사각형은 뜻이 없다. 세로 시작점은 항상 도시 띠
   * 바로 아래다 — 띠는 어차피 못 짓는다.
   */
  static landRectAt(w: number, h: number): { i0: number; j0: number; w: number; h: number } {
    const width = KairoTerrain.WIDTH;
    const ww = Math.min(w, width);
    const i0 = Math.max(0, Math.min(width - ww, KairoTerrain.ENTRY_I - Math.floor(ww / 2)));
    const j0 = KairoTerrain.CITY_BAND;
    const hh = Math.min(h, KairoTerrain.HEIGHT - j0);
    return { i0, j0, w: ww, h: hh };
  }

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
    const road = groundIndex('road');
    const walk = groundIndex('sidewalk');
    const verge = groundIndex('verge');
    const band = KairoTerrain.CITY_BAND;
    /*
     * 물가 계산은 **공원 부분에서만** 한다. 도시 띠까지 넣어 비율을 재면 맵마다
     * 물가가 세 줄씩 밀린다 — 띠는 공원이 아니라 액자다.
     */
    const parkH = height - band;
    const base =
      band + Math.max(3, Math.min(parkH - 4, Math.floor(parkH * shape.landRatio)));
    for (let i = 0; i < width; i++) {
      // 물가 선을 살짝 흔든다 — 직선이면 인공적으로 보인다
      const shore = base + rng.intRange(0, Math.max(0, shape.shoreJitter));
      for (let j = 0; j < height; j++) {
        let k = lawn;
        if (j < band) {
          // 차도 두 줄 · 정류장 보도 한 줄 · 나머지는 가로수(진입 광장)
          k = KairoTerrain.ROAD_ROWS.includes(j)
            ? road
            : j === KairoTerrain.STOP_ROW
              ? walk
              : verge;
          /*
           * 정류장 아래로 **입구 열 하나만** 보도로 뚫는다 — 여기로만 들어온다.
           * 가로수는 `guestWalk:false` 라, 뚫린 열이 없으면 도시와 공원이 통행상 끊긴다.
           */
          if (j > KairoTerrain.STOP_ROW && i === KairoTerrain.ENTRY_I) k = walk;
        } else if (j > shore) k = water;
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

  /**
   * 손님이 지나갈 수 있는 지면인가 (K32-B) — **잔디는 아니다.**
   *
   * `isWalkable`(육지인가)과 갈라 둔 이유: 잔디에도 지을 수는 있어야 하는데 손님이
   * 잔디를 가로지르면 길을 깔 이유가 없어진다. 카이로에서 길을 내는 것은 플레이의 한 축이다.
   * 시설 점유는 `guestWalkable`(placement.ts)이 얹는다 — 정의는 거기 하나다.
   */
  isGuestWalkable(i: number, j: number): boolean {
    const k = this.at(i, j);
    return k < 0 ? false : groundDef(k).guestWalk;
  }

  /** 플레이어가 여기에 지을 수 있는 지면인가 (K36) — 도시 띠는 못 짓는다 */
  isBuildable(i: number, j: number): boolean {
    const k = this.at(i, j);
    return k < 0 ? false : groundDef(k).buildable;
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

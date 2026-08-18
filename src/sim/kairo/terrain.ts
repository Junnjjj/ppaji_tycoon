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
  /**
   * 플레이어가 **이 종류를 칠할 수 있나** (K37). 없으면 `true` 다.
   *
   * `buildable` 과 또 다른 축이다: 암반은 시설을 **지을 수는 있지만**(테라스 테두리를
   * 못 짓게 하면 높이가 보상이 아니라 벌점이 된다) **칠할 수는 없다** — 맵이 갖고 태어난
   * 지형이고, 플레이어가 지형을 깎지 않는다는 설계 불변식과 같은 방향이다.
   *
   * ⚠ 이 플래그가 없어서 암반이 바닥 붓 팔레트에 조용히 새어 들어갔다 (실측: 12개 → 13개).
   * 플레이어가 깔 수 없는 것을 목록에 두면 눌러 보고 거절당한다.
   */
  paintable?: boolean;
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
  /**
   * 단(높이) 배열 (K37). 없으면 **전부 0** — 옛 세이브는 평지로 열린다.
   *
   * 종류와 **나란한** 배열이다. 따로 저장하는 이유는 종류와 높이가 직교하기 때문이다
   * (잔디도 산 중턱에 있을 수 있고, 길도 경사를 오른다).
   */
  levels?: number[];
}

export class KairoTerrain {
  private readonly cells: Uint8Array;
  /**
   * 칸마다의 **단** (K37). 0 이 기준면이고 `MAX_LEVEL` 까지 오른다.
   *
   * 사용자 요청: "땅을 깍을 순 없지만 → 높이를 표현해서 조금더 제한적으로 설치할수있게,
   * 스타팅 포인트 양옆에 (평지도 산 중턱중턱 놔둬서 건물들이나 뭐 펜션을 설치할 수 있게끔)".
   * 그래서 단은 **맵이 갖고 태어난다** — 플레이어가 지형을 깎지 않는다는 설계 불변식은
   * 그대로다 (design.md).
   */
  private readonly levels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height);
    this.levels = new Uint8Array(width * height);
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
   * 단의 상한 (K37). 3 이면 산 중턱이 세 층이다.
   *
   * 더 올리면 절벽 치마가 화면을 먹는다 — 한 단이 8텍셀이고 타일 높이가 16 이라,
   * 4단이면 32텍셀(타일 두 칸 높이)이 위로 자라 뒤쪽 칸을 가린다.
   */
  static readonly MAX_LEVEL = 3;

  /**
   * 산이 시작되는 **입구로부터의 거리** (K37).
   *
   * 사용자 요청: "스타팅 포인트 양옆에". 공원 가운데(입구 → 물 축)는 단 0 으로 두어야
   * 초반 플레이가 안 바뀐다 — 물려받은 빠지와 첫 의뢰가 그 평지 위에 있다.
   *
   * ⚠ 이 값이 1등급 토지(가로 26칸, 즉 입구에서 좌우 **13칸**)보다 넓어야 새 판이 평지다.
   * 좁히면 첫 판부터 절벽이 나와 시작 킷이 `level-mixed` 로 막힌다. 15 는 그 13 에
   * 두 칸 여유다 — 더 넓히면 산이 맵 가장자리로 밀려 테라스가 좁아진다.
   */
  static readonly MOUNTAIN_START = 15;

  /** 한 단이 몇 칸마다 오르나 — 크면 완만하고 테라스가 넓다 */
  static readonly TERRACE_WIDTH = 7;

  /**
   * 물가로 내려가는 계단의 **세로 깊이** (K37).
   *
   * 산이 강까지 벽처럼 서 있으면 물가에 잔교·데크를 놓을 자리가 없다. 4 이상이어야
   * 테라스가 세로로도 안 쪼개진다 (넓은 시설은 5×4 까지 있다).
   */
  static readonly TERRACE_DEPTH = 6;

  /**
   * 등고선이 굽기 전에 **몇 줄을 유지하나** (K37).
   *
   * 1 이면 매 줄 한 칸씩 밀려 테라스가 톱니가 된다 (실측: 산이 계단 블록 덩어리로 보였다).
   * 4 면 등고선이 자연스럽게 굽으면서도 평지가 남는다.
   */
  static readonly CONTOUR_RUN = 4;

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
    KairoTerrain.raiseMountains(t, rng);
    return t;
  }

  /**
   * 입구 **좌우 바깥쪽**에 계단식 산을 올린다 (K37).
   *
   * 사용자 요청 그대로다: "스타팅 포인트 양옆에, (평지도 산 중턱중턱 놔둬서 건물들이나
   * 뭐 펜션을 나중에 설치 할 수 있게끔)". 그래서 각 단은 **평지 테라스**여야 한다 —
   * 매 칸 오르는 경사면 넓은 시설이 아무데도 못 들어간다 (`levelUniform`).
   *
   * 규칙 셋:
   *   ① **공원 가운데는 단 0** — 입구에서 좌우 `MOUNTAIN_START` 칸까지. 초반 플레이가
   *      안 바뀌어야 한다 (물려받은 빠지와 첫 의뢰가 여기 있다)
   *   ② **물과 물가는 단 0** — 사용자가 명시적으로 뺐다. `setLevel` 이 물을 거부하므로
   *      자동으로 지켜지지만, 물가(모래) 줄도 같이 눌러 절벽이 물에 잠기지 않게 한다
   *   ③ **도시 띠는 단 0** — 경사 도로는 에셋 단계다 ("나중에 에셋만들때")
   *
   * 흔들림은 `rng.fork` 로 뽑는다 — 물가 지터와 스트림을 나눠야, 산을 바꿔도 물가가
   * 안 밀린다 (불변식 2).
   */
  private static raiseMountains(t: KairoTerrain, rng: Rng): void {
    const jr = rng.fork(0x4237);
    const band = KairoTerrain.CITY_BAND;
    const entry = KairoTerrain.ENTRY_I;
    const W = t.width;
    const MAX = KairoTerrain.MAX_LEVEL;

    /*
     * 물가 최북단 — 산은 여기서 **두 칸 위**까지만 내려온다. 물가에 바로 붙으면 절벽이
     * 물에 잠긴 것처럼 보이고, 잔교를 놓을 자리가 사라진다.
     */
    let shoreTop = t.height;
    for (let i = 0; i < W; i++) {
      for (let j = band; j < t.height; j++) {
        if (t.isWater(i, j) || t.kindAt(i, j) === 'path_sand') {
          if (j < shoreTop) shoreTop = j;
          break;
        }
      }
    }
    const maxJ = Math.max(band, shoreTop - 2);
    if (maxJ - band < 4) return; // 육지가 너무 얕으면 산을 안 세운다

    /*
     * ## 봉우리 둘 — 입구 좌우
     *
     * 사용자 요청: "스타팅 포인트 양옆에". 예전엔 단을 **열까지의 거리**로만 정해서
     * 등고선이 세로 직선이 됐다 — 계단식 논처럼 보였다 (실측 스크린샷). 봉우리에서의
     * **타원 거리**로 정하면 등고선이 둥글게 감겨 산으로 읽힌다.
     *
     * `j` 를 늘려 재는 이유: 쓸 수 있는 깊이(육지 폭)가 가로보다 훨씬 좁다. 같은 배율로
     * 재면 산이 세로로 눌린 타원이 되어 물가까지 내려온다.
     */
    const midJ = (band + maxJ) / 2;
    const jStretch = Math.max(1.4, (W * 0.25) / Math.max(4, maxJ - band));
    /*
     * 봉우리는 **맵 밖 조금**이다. 안쪽(입구 쪽)에 두면 최고 단이 공원 절반을 덮어
     * "왼쪽 1/3 이 전부 3단"이 된다 (실측). 가장자리보다 살짝 밖에 두면 최고 단이
     * 잘려 나가 **정상이 화면 밖으로 이어지는 산맥**이 되고 — 배경 산 3겹과 이어져
     * 읽힌다 — 공원 쪽에는 테라스만 남는다.
     */
    const peaks = [
      { i: -4, j: midJ },
      { i: W + 3, j: midJ },
    ];
    /** 정상 평지의 반지름 — 0 이면 정상이 한 점이라 최고 단 테라스가 안 생긴다 */
    const R0 = 5;
    /*
     * 한 단의 두께. 산이 쓸 수 있는 가로 폭(입구 제한선 ~ 맵 가장자리)을 단 수로 나눈다 —
     * 고정값이면 격자 크기를 바꿀 때 산이 공원을 먹거나 사라진다.
     */
    const span = Math.max(8, W / 2 - KairoTerrain.MOUNTAIN_START);
    const STEP = Math.max(2, Math.floor((span - R0) / MAX));

    /*
     * 등고선 흔들림 — **몇 줄마다** 한 칸씩. 줄마다 바꾸면 경계가 매 줄 밀려 테라스가
     * 톱니가 된다 (실측). 여기서는 거리에 더하는 오프셋이라 등고선 전체가 굽는다.
     */
    const walk: number[] = [];
    {
      let off = 0;
      for (let j = 0; j < t.height; j++) {
        if (j % KairoTerrain.CONTOUR_RUN === 0) {
          off += jr.intRange(0, 2) - 1;
          off = Math.max(-2, Math.min(2, off));
        }
        walk.push(off);
      }
    }

    /*
     * ## 1단계 — 원시 높이
     *
     * 봉우리에서 멀어질수록 낮다. `STEP ≥ 2` 이고 한 걸음이 거리를 최대 `jStretch`(< 2)
     * 만큼 바꾸므로, `floor(d / STEP)` 은 이웃 사이에서 **최대 1** 만 바뀐다 — 그래서
     * 이 자체로 이미 통행 가능하다.
     */
    const raw = new Int16Array(W * t.height);
    for (let j = band; j < maxJ; j++) {
      for (let i = 0; i < W; i++) {
        let best = 0;
        for (const p of peaks) {
          const dx = i - p.i;
          const dy = (j - p.j) * jStretch;
          const d = Math.hypot(dx, dy) + (walk[j] as number);
          const lv = MAX - Math.floor(Math.max(0, d - R0) / STEP);
          if (lv > best) best = lv;
        }
        raw[j * W + i] = Math.max(0, Math.min(MAX, best));
      }
    }

    /*
     * ## 2단계 — **0 이어야 하는 칸**을 못 박는다
     *
     * ① 공원 가운데(입구 좌우 `MOUNTAIN_START` 칸) — 초반 플레이가 안 바뀌어야 한다
     * ② 도시 띠 · 물가 아래 — 경사 도로는 에셋 단계고, 물은 사용자가 명시적으로 뺐다
     * ③ 물·물가 칸 — `setLevel` 이 거부하지만 **0 집합에는 넣어야** 아래 3단계가 산다
     */
    const zero: number[] = [];
    for (let j = 0; j < t.height; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const outOfPark = j < band || j >= maxJ;
        const nearEntry = Math.abs(i - entry) < KairoTerrain.MOUNTAIN_START;
        const wet = t.isWater(i, j) || t.kindAt(i, j) === 'path_sand';
        if (outOfPark || nearEntry || wet) {
          raw[k] = 0;
          zero.push(k);
        }
      }
    }

    /*
     * ## 3단계 — 통행을 **증명한다**
     *
     * 2단계가 특정 칸을 0 으로 눌렀으므로 그 경계에서 단차가 2 이상 날 수 있다. 그러면
     * 테라스가 **닿지 않는 죽은 땅**이 되고 시설이 `unreachable` 로 거절된다 (실측으로
     * 도시 띠 경계에 3단 절벽이 32곳 생겼다).
     *
     * 0 집합에서 BFS 거리를 재서 그 값으로 상한을 둔다. BFS 거리는 이웃 사이에서 정확히
     * 1 만 바뀌고, **1-Lipschitz 함수 둘의 min 도 1-Lipschitz** 이므로 결과 전체가
     * 단차 1 이하다 — 손으로 맞추는 것이 아니라 성질로 보장된다.
     */
    const dist = new Int16Array(W * t.height).fill(-1);
    const queue: number[] = [];
    for (const k of zero) {
      if (dist[k] === -1) {
        dist[k] = 0;
        queue.push(k);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      const j = Math.floor(k / W);
      const i = k - j * W;
      const d = (dist[k] as number) + 1;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= t.height) continue;
        const nk = nj * W + ni;
        if (dist[nk] !== -1) continue;
        dist[nk] = d;
        queue.push(nk);
      }
    }

    for (let j = band; j < maxJ; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const cap = dist[k] as number;
        t.setLevel(i, j, Math.min(raw[k] as number, cap < 0 ? 0 : cap));
      }
    }
    KairoTerrain.dressMountains(t);
  }

  /**
   * 산에 **암반**을 입힌다 (K37).
   *
   * 계단만으로는 "잔디 계단"으로 읽혔다 (사용자: "산처럼 표현되는 부분이 있다던지").
   * 산이 산으로 읽히는 것은 **테두리와 정상이 바위**이기 때문이다:
   *
   * - **절벽 테두리** — 단이 이웃과 다른 칸. 여기가 실제로 깎여 있는 자리다
   *
   * ⚠ 처음엔 **최고 단 전체**도 암반으로 덮었는데, 정상 평지가 17칸 폭이라 회색 덩어리가
   * 됐다 (실측). 테두리만 칠하면 계단 윤곽이 또렷해지면서 평지는 초원으로 남는다.
   *
   * ⚠ 테라스 **안쪽은 잔디로 남긴다.** 전부 바위로 덮으면 "펜션을 놓고 싶은 초원"이
   * 사라지고, 사용자가 원한 것은 중턱의 **평지**였다.
   *
   * ⚠ 암반은 잔디와 **플래그가 같다** (`buildable: true`). 짓는 자리를 줄이면 높이가
   * 보상이 아니라 벌점이 된다 — 이 게임에서 실패는 내 선택 때문이어야 한다.
   *
   * ⚠ 잔디만 덮는다. 물·물가·포장·도시 띠를 덮으면 물가가 바위가 되고 진입 광장이
   * 끊긴다 (도시 띠는 애초에 단 0 이라 여기 안 걸리지만, 명시해 둔다).
   */
  private static dressMountains(t: KairoTerrain): void {
    for (let j = KairoTerrain.CITY_BAND; j < t.height; j++) {
      for (let i = 0; i < t.width; i++) {
        const z = t.levelAt(i, j);
        if (z === 0) continue;
        if (t.kindAt(i, j) !== 'lawn') continue;
        if (t.isCliff(i, j)) t.paint(i, j, 'mountain_rock');
      }
    }
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
    /*
     * ⚠ 물을 칠하면 **단을 0 으로 내린다** (K37).
     *
     * 사용자가 명시적으로 뺐다: "물쪽은 굳이 높낮이 할필요없어". 그리고 물에 높이를
     * 허용하면 정본이 둘이 된다 (지형 종류와 단) — 이 저장소는 "실내 여부를 따로 저장하지
     * 말 것, `terrain.isIndoor` 가 정본이다"로 같은 사고를 이미 겪었다.
     */
    if (this.isWater(i, j)) this.levels[j * this.width + i] = 0;
    return true;
  }

  /** 이 칸의 단. 격자 밖은 0 */
  levelAt(i: number, j: number): number {
    return this.inside(i, j) ? (this.levels[j * this.width + i] as number) : 0;
  }

  /**
   * 단을 세운다. **물은 안 올라간다** (K37 — 위 `paint` 주석 참고).
   *
   * 이건 월드젠과 세이브 복원이 쓴다. **플레이어는 부르지 않는다** — 지형을 깎지 않는다는
   * 설계 불변식(design.md)이 그대로다.
   */
  setLevel(i: number, j: number, level: number): boolean {
    if (!this.inside(i, j)) return false;
    if (this.isWater(i, j)) return false;
    const v = Math.max(0, Math.min(KairoTerrain.MAX_LEVEL, Math.round(level)));
    this.levels[j * this.width + i] = v;
    return true;
  }

  /**
   * 이웃과 단이 달라 **절벽면이 있는** 칸인가. 렌더가 치마를 그릴지 판단한다.
   *
   * 격자 밖은 기준면(0)으로 본다 — 맵 가장자리의 높은 칸도 치마를 그려야 떠 보이지 않는다.
   */
  isCliff(i: number, j: number): boolean {
    const z = this.levelAt(i, j);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (this.levelAt(i + di, j + dj) !== z) return true;
    }
    return false;
  }

  /**
   * 발자국 w×d 가 **전부 같은 단**인가 (K37).
   *
   * 이것이 "산 중턱 평지"가 게임이 되는 지점이다 — 넓은 시설은 테라스를 찾아야 하고,
   * 경사에는 못 놓는다. 사용자 요청의 "조금더 제한적으로 설치할수있게"가 이 규칙이다.
   */
  levelUniform(i: number, j: number, w: number, d: number): boolean {
    const z = this.levelAt(i, j);
    for (let dj = 0; dj < d; dj++) {
      for (let di = 0; di < w; di++) {
        if (!this.inside(i + di, j + dj)) return false;
        if (this.levelAt(i + di, j + dj) !== z) return false;
      }
    }
    return true;
  }

  /**
   * 두 칸 사이를 걸어 오르내릴 수 있나 — **단차 1까지**.
   *
   * 2 이상은 절벽이라 못 지나간다. 그래서 산으로 올라가는 길은 계단식으로 이어야 하고,
   * 그것이 "도로는 이을수있고"(사용자)의 sim 쪽 규칙이다. 경사 스프라이트는 에셋 단계다.
   */
  levelPassable(ai: number, aj: number, bi: number, bj: number): boolean {
    return Math.abs(this.levelAt(ai, aj) - this.levelAt(bi, bj)) <= 1;
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
    return {
      w: this.width,
      h: this.height,
      kinds: Array.from(this.cells),
      levels: Array.from(this.levels),
    };
  }

  static fromSnapshot(s: TerrainSnapshot): KairoTerrain {
    const t = new KairoTerrain(s.w, s.h);
    for (let k = 0; k < t.cells.length && k < s.kinds.length; k++) {
      t.cells[k] = s.kinds[k] as number;
    }
    /*
     * 단은 **없어도 된다** — 옛 세이브(v5 이하)는 `levels` 가 없고, 그때는 전부 0 이라
     * 평지로 열린다. 이게 하위호환의 전부다 (K37).
     *
     * ⚠ 종류를 먼저 채운 뒤에 단을 넣는다 — `setLevel` 이 물을 거부하므로 순서가 뒤바뀌면
     * 물이 아닌 것으로 판정돼 단이 남는다.
     */
    const lv = s.levels;
    if (lv) {
      for (let k = 0; k < t.levels.length && k < lv.length; k++) {
        const j = Math.floor(k / t.width);
        const i = k - j * t.width;
        t.setLevel(i, j, lv[k] as number);
      }
    }
    return t;
  }
}

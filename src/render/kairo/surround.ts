import { KairoTerrain } from '../../sim/kairo/terrain.js';
import { facilitySpriteId } from '../../assets/kairo-contract.js';

/**
 * 지도 **바깥**의 생활 장식 (Phase 7 / Task 7).
 *
 * ## 왜 격자 밖인가
 *
 * 안쪽은 sim 이 소유한다 — 시설·충돌·세이브가 걸린다. 여기 놓이는 것은 **그림뿐**이라
 * 좌표가 격자 밖이면 sim 은 그 자리를 아예 모른다 (플래그로 막는 게 아니라 존재하지 않는다,
 * K38). 그래서 이 계획은 시뮬 상태·충돌·세이브를 **한 바이트도** 만들지 않는다.
 *
 * ## 왜 표지 세 종이 아니라 일곱 종인가
 *
 * 이전 구현은 현수막·화분열·조형물 **셋을 두 개씩** 놓은 것이었다. 그건 "지도 밖에도
 * 뭔가 있다"가 아니라 **같은 표지를 복제한 것**으로 읽힌다. 도시 띠 바깥으로 상점·주차
 * 차량·가로등이 이어지고, 공원 뒤로 집과 수풀이, 입구 위로 안내판·화단이 있어야
 * "공원이 동네 안에 있다"가 된다.
 *
 * ## 규칙
 *
 * · **7종 · 12개 이하** — 굽기 한 번에 얹는 값이라 늘리면 캔버스 비용이 는다.
 * · **결정론** — 좌표는 맵 크기에서 파생한다 (난수 금지, 불변식 2 와 같은 태도).
 * · **문맥** — 도로 연장선에는 차량·가로등·상점, 입구 위에는 안내판·화단,
 *   그 밖 가장자리에는 주택·수풀. 차도 한가운데 집이 서면 문맥이 깨진다.
 * · **기존 계약 ID 만** — 새 아트 팩을 만들지 않는다 (사건 삽화와 같은 규칙).
 */
export const SURROUND_DECOR_KINDS = [
  'house',
  'shop',
  'car',
  'lamp',
  'sign',
  'flowerbed',
  'shrub',
] as const;

export type SurroundDecorKind = (typeof SURROUND_DECOR_KINDS)[number];

export interface SurroundDecoration {
  kind: SurroundDecorKind;
  /** 논리 스프라이트 ID — 이미 계약에 있는 것만 쓴다 */
  id: string;
  i: number;
  j: number;
}

/**
 * 종류 → 그림. 도시 띠 밖 풍경이라 **시설 스프라이트를 빌려 쓴다** — 지도 밖에 짓는
 * 것이 아니라 같은 세계의 같은 그림을 쓰는 것이다 (다른 붓으로 그리면 경계에서 결이
 * 어긋나 "여기부터는 딴 그림"이 된다, K38).
 */
const DECOR_SPRITE: Record<SurroundDecorKind, string> = {
  house: 'facility/bungalow',
  shop: facilitySpriteId('shop', 0),
  car: 'facility/parking',
  lamp: 'deco/night_light',
  sign: 'deco/safety_sign',
  flowerbed: 'facility/flowerbed',
  shrub: 'deco/planter_row',
};

/** 도시 띠의 어느 줄에 서는가 — 차도 옆(정류장 줄)과 가로수 줄 */
const ROAD_ROW = KairoTerrain.STOP_ROW;
const VERGE_ROW = Math.min(KairoTerrain.CITY_BAND - 1, ROAD_ROW + 2);

export function surroundDecorationPlan(width: number, height: number): SurroundDecoration[] {
  const entry = Math.min(Math.max(0, KairoTerrain.ENTRY_I), width - 1);
  const at = (kind: SurroundDecorKind, i: number, j: number): SurroundDecoration => ({
    kind,
    id: DECOR_SPRITE[kind],
    i,
    j,
  });

  /*
   * 좌표는 전부 **맵 크기·입구·도시 띠에서 파생**한다. 상수 좌표를 박으면 맵이 커질 때
   * 장식만 옛 자리에 남아 격자 안으로 들어온다 (K36 격자 확장에서 실제로 겪은 종류).
   */
  const left = -3;
  const right = width + 2;
  const band = KairoTerrain.CITY_BAND;
  /** 옆구리 줄은 공원 세로 길이의 비율로 잡는다 — 맵이 커지면 같이 내려간다 */
  const side = (frac: number): number => band + Math.round((height - band) * frac);
  return [
    // 도로 연장선 — 차도 옆 줄에만 선다. 여기가 버스가 들어오는 쪽이다
    at('car', left, ROAD_ROW),
    at('car', right, ROAD_ROW),
    at('shop', left, VERGE_ROW),
    at('lamp', right, VERGE_ROW),
    // 입구 위 — 안내판과 화단이 "여기가 입구다"를 밖에서 말한다
    at('sign', entry - 6, -2),
    at('flowerbed', entry + 6, -2),
    at('sign', entry + 12, -4),
    /*
     * 동네 — 도로 연장선을 피해 위쪽과 **좌우 옆구리**에 집과 수풀.
     *
     * ⚠ 아래쪽(`j > height`)에는 두지 않는다. 남쪽은 강이라 굽기의 물 판정에 걸려
     * **조용히 안 그려진다** (실측: 12개 중 3개가 그렇게 사라져 종류가 6/7 이었다).
     * 계획이 지형을 못 읽으므로(순수 함수) 물이 없을 자리를 고르는 쪽이 맞다.
     */
    at('house', entry - 20, -5),
    at('house', entry + 22, -5),
    at('house', left, side(0.15)),
    at('shrub', left, side(0.3)),
    at('shrub', right, side(0.22)),
  ];
}

/**
 * 지형 타입.
 *
 * 계획서 §2.2 — 플레이어는 지형을 깎지 않는다. 주어진 지형을 활용해 짓는다.
 * 시설마다 설치 가능한 지형이 다르고, 일부 지형은 보너스를 준다.
 */
export const Terrain = {
  // ─── 육지 ───
  Plain: 0, // 평지 — 대부분의 육지 시설
  Sand: 1, // 모래 — 백사장. 파라솔·평상
  Forest: 2, // 숲 — 건설 불가, 그늘 보너스
  Slope: 3, // 경사지 — 대형 슬라이드 보너스
  Rock: 4, // 바위 — 건설 불가
  Roadside: 5, // 도로인접 — 주차장·매표소 접근성 보너스

  // ─── 물 ─── (Shore 이상이 물)
  Shore: 6, // 강변 — 선착장·진입계단
  Shallow: 7, // 얕은 물 — 수상놀이터, 아이용
  Deep: 8, // 깊은 물 — 바나나보트·웨이크보드
  OpenWater: 9, // 넓은 수역 — 제트스키·플라이피쉬
  Current: 10, // 유속 구간 — 위험, 안전도 페널티
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** 물 지형의 시작 인덱스. isWater 판정의 기준. */
const FIRST_WATER = Terrain.Shore;

export function isWater(t: Terrain): boolean {
  return t >= FIRST_WATER;
}

export function isLand(t: Terrain): boolean {
  return t < FIRST_WATER;
}

/** 손님이 걸어다닐 수 있는 지형인가 (시설·길과 별개로 지형 자체의 통행 가능성) */
export function isWalkable(t: Terrain): boolean {
  return t === Terrain.Plain || t === Terrain.Sand || t === Terrain.Roadside;
}

/** 지형 자체가 건설을 막는가 */
export function isBlocked(t: Terrain): boolean {
  return t === Terrain.Forest || t === Terrain.Rock;
}

/**
 * 수심 등급 (0 = 육지). 수상 시설·코스의 최소 수심 제약에 쓰인다.
 */
export function depthLevel(t: Terrain): 0 | 1 | 2 | 3 {
  switch (t) {
    case Terrain.Shore:
      return 1;
    case Terrain.Shallow:
      return 1;
    case Terrain.Deep:
      return 2;
    case Terrain.OpenWater:
      return 3;
    case Terrain.Current:
      return 3;
    default:
      return 0;
  }
}

/** 데이터 파일에서 쓰는 문자열 키 → Terrain. data/*.json 이 지형을 이름으로 지정할 수 있게. */
export const TERRAIN_BY_KEY: Readonly<Record<string, Terrain>> = {
  plain: Terrain.Plain,
  sand: Terrain.Sand,
  forest: Terrain.Forest,
  slope: Terrain.Slope,
  rock: Terrain.Rock,
  roadside: Terrain.Roadside,
  shore: Terrain.Shore,
  shallow: Terrain.Shallow,
  deep: Terrain.Deep,
  openwater: Terrain.OpenWater,
  current: Terrain.Current,
};

export function terrainFromKey(key: string): Terrain | undefined {
  return TERRAIN_BY_KEY[key];
}

export const TERRAIN_NAMES: Record<Terrain, string> = {
  [Terrain.Plain]: '평지',
  [Terrain.Sand]: '모래',
  [Terrain.Forest]: '숲',
  [Terrain.Slope]: '경사지',
  [Terrain.Rock]: '바위',
  [Terrain.Roadside]: '도로인접',
  [Terrain.Shore]: '강변',
  [Terrain.Shallow]: '얕은물',
  [Terrain.Deep]: '깊은물',
  [Terrain.OpenWater]: '넓은수역',
  [Terrain.Current]: '유속',
};

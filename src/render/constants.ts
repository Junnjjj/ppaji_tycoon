import { TILE_SIZE } from '../assets/index.js';

export { TILE_SIZE };

/**
 * 줌 단계. 픽셀아트는 정수 배율에서 가장 선명하므로 정수만 쓴다.
 * 계획서 §2.2 의 LOD 단계와 대응한다.
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_DEFAULT = 2;

/**
 * LOD 단계 — 줌에 따라 표현 밀도를 바꾼다.
 * 성능 대책이자, 축소했을 때 "내 빠지가 이만큼 컸구나"를 보여주는 연출.
 */
export const Lod = {
  /** 최소 줌 — 경영 지도 뷰 */
  Map: 0,
  /** 축소 — 손님 축약, 시설·보트 위주 */
  Far: 1,
  /** 기본 플레이 */
  Normal: 2,
  /** 확대 — 애니메이션·말풍선·대기열 전부 */
  Near: 3,
} as const;

export type Lod = (typeof Lod)[keyof typeof Lod];

export function lodForZoom(zoom: number): Lod {
  if (zoom <= 1) return Lod.Map;
  if (zoom < 2) return Lod.Far;
  if (zoom < 3) return Lod.Normal;
  return Lod.Near;
}

export const LOD_NAMES: Record<Lod, string> = {
  [Lod.Map]: '지도',
  [Lod.Far]: '축소',
  [Lod.Normal]: '기본',
  [Lod.Near]: '확대',
};

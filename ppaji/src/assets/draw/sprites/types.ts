import type { PixMap, Slots } from '../pix.js';

export interface FacTemplate {
  rows: PixMap;
  /** 간판 아이콘이 들어갈 좌상단 (없으면 아이콘 없음) */
  icon?: { x: number; y: number };
  /** 바닥 기준 보정 — 양수면 더 아래로 */
  dy?: number;
}

export interface FacArt {
  tpl: string;
  slots?: Slots;
  icon?: string;
}

// 주제색 조합 — 카이로 파스텔 (1 기본 · 2 밝음 · 3 어두움 · 4 보조)
export const RED: Slots = { '1': 'r', '2': 'R', '3': '!' };
export const BLUE: Slots = { '1': 'b', '2': 'B', '3': 'n' };
export const GREEN: Slots = { '1': 'g', '2': 'G', '3': 'd' };
export const YELLOW: Slots = { '1': 'y', '2': 'Y', '3': '$' };
export const PINK: Slots = { '1': 'p', '2': 'P', '3': '@' };
export const ORANGE: Slots = { '1': 'o', '2': 'O', '3': '#' };
export const PURPLE: Slots = { '1': 'u', '2': 'U', '3': '%' };
export const WOOD: Slots = { '1': 'm', '2': 'M', '3': 'e' };
export const WHITE: Slots = { '1': 'w', '2': 'w', '3': 'S' };
export const CREAM: Slots = { '1': 'W', '2': 'w', '3': '&' };
export const GRAY: Slots = { '1': 's', '2': 'S', '3': 'x' };
export const BLACK: Slots = { '1': 'x', '2': 's', '3': 'q' };
export const GOLD: Slots = { '1': 'h', '2': 'H', '3': '=' };
export const AQUA: Slots = { '1': 'a', '2': 'C', '3': '~' };
export const WATER: Slots = { '1': 'c', '2': 'C', '3': '^' };

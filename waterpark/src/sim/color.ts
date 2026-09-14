/**
 * 풀 색 — 아이템의 색을 가중 RGB 평균해 9색 팔레트 최근접으로 양자화한다.
 * **무지개** = 서로 다른 기본색 ≥ 8 이고 각 비중 ≥ 8% (PSS: 8색 등량). 강도(intensity) 는
 * `100·Σw / (2√size)` — 큰 풀은 같은 아이템으로 옅어진다.
 */
import type { PoolColor } from '../data/schema.js';

export type PoolColorOrNone = PoolColor | 'rainbow' | 'clear';

/** 팔레트 기준색 — 양자화 전용 (화면 색은 CSS 토큰이 소유한다) */
export const COLOR_RGB: Record<PoolColor, [number, number, number]> = {
  orange: [255, 140, 40],
  yellow: [250, 220, 60],
  lime: [170, 230, 70],
  green: [60, 180, 80],
  blue: [50, 110, 230],
  purple: [140, 70, 200],
  pink: [255, 120, 190],
  red: [230, 50, 60],
  white: [245, 245, 245],
};

export const RAINBOW_MIN_COLORS = 8;
export const RAINBOW_MIN_SHARE = 0.08;
export const INTENSITY_CLEAR = 20;

export interface ColorInput {
  color: PoolColor | null;
  weight: number;
}

export interface ColorResult {
  color: PoolColorOrNone;
  intensity: number;
  /** 색별 비중 (0..1) — 풀 상세 창 (G42) */
  shares: Partial<Record<PoolColor, number>>;
}
/** 무지개 재료 8색 (흰색 제외, 원작 「白以外」) */
export const RAINBOW_COLORS: readonly PoolColor[] = ['orange', 'yellow', 'lime', 'green', 'blue', 'purple', 'pink', 'red'];

export function mixColor(items: readonly ColorInput[], poolSize: number): ColorResult {
  const colored = items.filter((it): it is { color: PoolColor; weight: number } => it.color !== null && it.weight > 0);
  const total = colored.reduce((s, it) => s + it.weight, 0);
  // 2×2 풀에 아이템 하나면 25 — 색이 든다. 16칸이면 둘부터. 36칸에 20개면 상한
  const intensity = Math.min(100, Math.round((100 * total) / (2 * Math.sqrt(Math.max(1, poolSize)))));
  const share = new Map<PoolColor, number>();
  for (const it of colored) share.set(it.color, (share.get(it.color) ?? 0) + it.weight / (total || 1));
  const shares = Object.fromEntries(share) as Partial<Record<PoolColor, number>>;
  if (total === 0 || intensity < INTENSITY_CLEAR) return { color: 'clear', intensity, shares };
  const distinct = [...share.values()].filter((v) => v >= RAINBOW_MIN_SHARE).length;
  if (distinct >= RAINBOW_MIN_COLORS) return { color: 'rainbow', intensity, shares };
  const rgb: [number, number, number] = [0, 0, 0];
  for (const it of colored) {
    const c = COLOR_RGB[it.color];
    const w = it.weight / total;
    rgb[0] += c[0] * w;
    rgb[1] += c[1] * w;
    rgb[2] += c[2] * w;
  }
  let best: PoolColor = 'white';
  let bestD = Infinity;
  for (const [name, c] of Object.entries(COLOR_RGB) as [PoolColor, [number, number, number]][]) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return { color: best, intensity, shares };
}

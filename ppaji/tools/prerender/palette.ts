/** `--px-*` 토큰을 읽어 팔레트 배열로 — 양자화의 유일한 색 출처 (색은 style.css 가 소유) */
import { cssVar } from '../../src/ui/tokens.js';

export const PX_TOKENS = [
  'ink', 'white', 'cream', 'red', 'red-lt', 'pink', 'pink-lt', 'orange', 'orange-lt', 'yellow', 'yellow-lt', 'green', 'green-lt', 'green-dk',
  'blue', 'blue-lt', 'blue-dk', 'water', 'water-lt', 'purple', 'purple-lt', 'wood', 'wood-lt', 'wood-dk', 'tan', 'tan-lt', 'gray', 'gray-lt', 'gray-dk',
  'gold', 'gold-lt', 'black', 'aqua', 'red-dk', 'pink-dk', 'orange-dk', 'yellow-dk', 'purple-dk', 'water-dk', 'cream-dk', 'aqua-dk', 'gold-dk', 'sky',
];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function palette(): { name: string; hex: string; rgb: [number, number, number] }[] {
  return PX_TOKENS.map((name) => { const hex = cssVar(`--px-${name}`); return { name, hex, rgb: hexToRgb(hex) }; });
}

export function color(name: string): string {
  return cssVar(`--px-${name}`);
}

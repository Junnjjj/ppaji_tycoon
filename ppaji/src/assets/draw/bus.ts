/**
 * 버스 도트 (G33) — 44×26, 옆모습(아이소 도로를 따라 좌→우). 색은 토큰. 창에 손님 실루엣.
 */
import { cssVar } from '../../ui/tokens.js';

export const BUS_W = 44;
export const BUS_H = 26;
const ROWS = [
  '....kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk....',
  '...kBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBk...',
  '..kBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBk..',
  '..kBBkkkkkkkBBkkkkkkkBBkkkkkkkBBkkkkkkkBBk..',
  '..kBBkwwwwwkBBkwwwwwkBBkwwwwwkBBkwwwwwkBBk..',
  '..kBBkwwgwwkBBkwwgwwkBBkwwwwwkBBkwwgwwkBBk..',
  '..kBBkwgggwkBBkwgggwkBBkwwwwwkBBkwgggwkBBk..',
  '..kBBkwwwwwkBBkwwwwwkBBkwwwwwkBBkwwwwwkBBk..',
  '..kBBkkkkkkkBBkkkkkkkBBkkkkkkkBBkkkkkkkBBk..',
  '..kyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyk..',
  '..kyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyk..',
  '..kyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyk..',
  '..kYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYk..',
  '..kYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYk..',
  '..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
  '.....kkkk......................kkkk.........',
  '....kkddkk....................kkddkk........',
  '....kdddddk..................kdddddk........',
  '....kkddkk....................kkddkk........',
  '.....kkkk......................kkkk.........',
];

export function drawBus(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = BUS_W; c.height = BUS_H;
  const g = c.getContext('2d');
  if (!g) return c;
  const color: Record<string, string> = { k: cssVar('--guest-outline'), B: cssVar('--bus-top'), w: cssVar('--bus-window'), g: cssVar('--guest-skin-1'), y: cssVar('--bus-body'), Y: cssVar('--bus-body-dk'), d: cssVar('--bus-tire') };
  ROWS.forEach((row, j) => [...row].forEach((ch, i) => { const col = color[ch]; if (!col) return; g.fillStyle = col; g.fillRect(i, j + 3, 1, 1); }));
  return c;
}

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


/** P44-d — 정류장 표지 10×22: 기둥 + 네모 표지 */
export function drawBusStop(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 22;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = cssVar('--guest-outline'); g.fillRect(0, 0, 10, 9);
  g.fillStyle = cssVar('--bus-top'); g.fillRect(1, 1, 8, 7);
  g.fillStyle = cssVar('--bus-window'); g.fillRect(2, 3, 6, 2);
  g.fillStyle = cssVar('--wall-top'); g.fillRect(4, 9, 2, 13);
  return c;
}

/** P44-d — 가로등 8×26: 기둥 + 갓 */
export function drawLamp(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 26;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = cssVar('--wall-top'); g.fillRect(3, 4, 2, 22);
  g.fillStyle = cssVar('--guest-outline'); g.fillRect(1, 0, 6, 5);
  g.fillStyle = cssVar('--lamp-glow'); g.fillRect(2, 1, 4, 3);
  return c;
}

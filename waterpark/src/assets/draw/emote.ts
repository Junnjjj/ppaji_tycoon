/**
 * 손님 머리 위 이모트 10×10 (G17) — 하트·음표·zz·화남·카메라·별. 색은 토큰.
 */
import { cssVar } from '../../ui/tokens.js';
import type { GuestEmote } from '../../sim/guest.js';

const MAPS: Record<GuestEmote, readonly string[]> = {
  heart: ['..........', '..rr..rr..', '.rrrrrrrr.', '.rrrrrrrr.', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....', '..........', '..........'],
  note: ['..........', '.....kk...', '.....kkk..', '.....k.kk.', '.....k....', '.....k....', '...kkk....', '..kkkk....', '...kk.....', '..........'],
  zz: ['..........', '....kkkk..', '......k...', '.....k....', '....kkkk..', '..........', '.kkk......', '..k.......', '.kkk......', '..........'],
  grr: ['..........', '....rr....', '....rr....', '....rr....', '....rr....', '....rr....', '..........', '....rr....', '....rr....', '..........'],
  camera: ['..........', '...kkkk...', '.kkkkkkkk.', '.kwwkkwwk.', '.kwkkkkwk.', '.kwwkkwwk.', '.kkkkkkkk.', '..........', '..........', '..........'],
  star: ['....yy....', '....yy....', '.yyyyyyyy.', '..yyyyyy..', '...yyyy...', '..yyyyyy..', '..yy..yy..', '..........', '..........', '..........'],
};

export function drawEmote(kind: GuestEmote): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 10;
  const g = c.getContext('2d');
  if (!g) return c;
  const color: Record<string, string> = { k: cssVar('--guest-outline'), r: cssVar('--fx-heart'), y: cssVar('--fx-star'), w: cssVar('--fac-white') };
  MAPS[kind].forEach((row, j) => [...row].forEach((ch, i) => { const col = color[ch]; if (!col) return; g.fillStyle = col; g.fillRect(i, j, 1, 1); }));
  return c;
}


/** 만족 게이지 14×5 (G23) — 별 + 막대(0~10) */
export function drawGauge(level: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 6;
  const g = c.getContext('2d');
  if (!g) return c;
  const ink = cssVar('--guest-outline'); const star = cssVar('--fx-star'); const fill = cssVar('--gauge-fill'); const bg = cssVar('--gauge-bg');
  ['.yy..', 'yyyy.', '.yy..'].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'y') { g.fillStyle = star; g.fillRect(i, j + 1, 1, 1); } }));
  g.fillStyle = ink; g.fillRect(5, 1, 11, 4);
  g.fillStyle = bg; g.fillRect(6, 2, 9, 2);
  g.fillStyle = fill; g.fillRect(6, 2, Math.round(9 * level / 10), 2);
  return c;
}

/** HP 배터리 아이콘 12×7 (G26, R4) — 빨간 칸 하나 남은 배터리. HP < 30 손님 머리 위 */
export function drawBattery(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 12; c.height = 7;
  const g = c.getContext('2d');
  if (!g) return c;
  const ink = cssVar('--guest-outline'); const bg = cssVar('--gauge-bg'); const hp = cssVar('--fx-hp');
  g.fillStyle = ink; g.fillRect(0, 0, 11, 7); g.fillRect(11, 2, 1, 3);
  g.fillStyle = bg; g.fillRect(1, 1, 9, 5);
  g.fillStyle = hp; g.fillRect(2, 2, 2, 3);
  return c;
}

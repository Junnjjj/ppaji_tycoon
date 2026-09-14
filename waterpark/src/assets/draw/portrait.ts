/**
 * 초상 24×24 (G16) — 손님 머리 도트(`guest.ts` HEAD)를 2배로 키워 얼굴만 잘라 낸다.
 * SNS 친구·시나리오 인물·티커 화자가 같은 얼굴 문법을 쓴다. 색은 `--guest-*` 토큰.
 */
import { cssVar } from '../../ui/tokens.js';
import { HEAD } from './guest.js';

export const PORTRAIT = 24;

export function drawPortrait(palette: number, hair: number, mood: 'calm' | 'happy' = 'calm'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PORTRAIT; c.height = PORTRAIT;
  const g = c.getContext('2d');
  if (!g) return c;
  const color: Record<string, string> = {
    k: cssVar('--guest-outline'), e: cssVar('--guest-eye'), p: cssVar('--guest-blush'), H: cssVar('--guest-hair-lt'),
    f: cssVar(`--guest-skin-${palette % 4}`), h: cssVar(`--guest-hair-${hair % 5}`),
  };
  const rows = HEAD[hair % 5] ?? HEAD[0] as readonly string[];
  // 머리 맵 18×12 중 가로 3..14 (12칸) 를 2배 → 24×24
  rows.forEach((row, j) => {
    for (let i = 3; i < 15; i++) {
      const ch = row[i] ?? '.';
      const col = color[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect((i - 3) * 2, j * 2, 2, 2);
    }
  });
  const px = (ch: string, x: number, y: number, w = 1, h = 1): void => { g.fillStyle = color[ch] ?? color['k'] as string; g.fillRect((x - 3) * 2, y * 2, w * 2, h * 2); };
  px('e', 6, 6, 1, 2); px('e', 11, 6, 1, 2);
  if (mood === 'happy') { px('k', 6, 9); px('k', 11, 9); px('k', 7, 10, 4, 1); px('p', 4, 8, 2, 1); px('p', 12, 8, 2, 1); }
  else px('k', 8, 10, 2, 1);
  return c;
}

/**
 * 기둥 텍스처 (P0-B, 빠지 K38 이식) — 단이 있는 칸은 윗면 다이아몬드 + 아래로 z×8 텍셀 치마를 **한 장**으로 굽는다.
 * 치마를 별 오브젝트로 두면 같은 칸 안에서 윗면과 깊이가 동률이 되어 K37 버그의 형태가 된다.
 * 왼쪽 면은 어둡게, 오른쪽 면은 조금 어둡게 — 색은 윗면 중앙 픽셀에서 뽑는다 (지면 종류마다 다시 적지 않는다).
 */
import { LEVEL_H, TILE_W, TILE_H } from './iso.js';

const shade = (r: number, g: number, b: number, k: number): string => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

export function drawColumn(top: HTMLCanvasElement, z: number): HTMLCanvasElement {
  const h = z * LEVEL_H;
  const c = document.createElement('canvas');
  c.width = TILE_W;
  c.height = TILE_H + h;
  const g = c.getContext('2d');
  if (!g) return c;
  const tg = top.getContext('2d');
  const px = tg ? tg.getImageData(TILE_W / 2, TILE_H / 2, 1, 1).data : new Uint8ClampedArray([160, 140, 100, 255]);
  const left = shade(px[0] ?? 0, px[1] ?? 0, px[2] ?? 0, 0.62);
  const right = shade(px[0] ?? 0, px[1] ?? 0, px[2] ?? 0, 0.8);
  const edge = shade(px[0] ?? 0, px[1] ?? 0, px[2] ?? 0, 0.45);
  // 면 — 다이아몬드 아랫변(왼쪽: (0,8)→(16,16) · 오른쪽: (16,16)→(32,8)) 을 z×8 아래로 밀어 그 사이를 채운다
  for (let x = 0; x < TILE_W; x++) {
    const yTop = x < TILE_W / 2 ? TILE_H / 2 + x / 2 : TILE_H / 2 + (TILE_W - x) / 2;
    g.fillStyle = x < TILE_W / 2 ? left : right;
    g.fillRect(x, Math.floor(yTop), 1, h);
    // 맨 아래 한 텍셀은 더 어둡게 — 바닥과의 경계
    g.fillStyle = edge;
    g.fillRect(x, Math.floor(yTop) + h - 1, 1, 1);
  }
  // 세로 모서리(가운데) 한 줄
  g.fillStyle = edge;
  g.fillRect(TILE_W / 2, TILE_H - 1, 1, h);
  g.drawImage(top, 0, 0);
  return c;
}

import Phaser from 'phaser';
import { viewport } from './upscale.js';
import { cssVar } from '../ui/tokens.js';

/**
 * Phaser 부팅 — Scale.NONE. Scene에서 논리 좌표와 별도로 고해상도 버퍼를 설정한다.
 * 레거시 NPC 텍스처는 nearest를 유지하며, HD 시설/지면만 개별 LINEAR 필터를 쓴다.
 * DetailCamera가 원점 기준 확대와 worldView를 함께 관리한다.
 *
 * `?px=1` 이면 프레임버퍼를 보존한다 — 검증 도구의 `readPixels` 용. 안 켜고 읽으면 검은색이
 * 돌아와 **검사가 조용히 통과한다**.
 */
export function bootPhaser(parent: HTMLElement | string, scene: Phaser.Scene): Phaser.Game {
  const v = viewport(window.innerWidth, window.innerHeight, 1, window.devicePixelRatio || 1);
  const preserve = new URLSearchParams(location.search).get('px') === '1';
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: cssVar('--tile-grass'), // P44: 지도 바깥은 들판(Surround 가 덮는다 — 이 색은 안전망)
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, width: v.bufferW, height: v.bufferH, zoom: 1 },
    input: { activePointers: 3 },
    ...(preserve ? { render: { preserveDrawingBuffer: true } } : {}),
    scene: [scene],
  });
}

import Phaser from 'phaser';
import { viewport } from './upscale.js';
import { cssVar } from '../ui/tokens.js';

/**
 * Phaser 부팅 — `Scale.NONE` + 캔버스 정수 확대. RESIZE 를 쓰면 CSS 크기가 내부 해상도가 되어
 * 텍셀 1:1 이 깨진다. 카메라 줌은 영구히 1 이다 (부모 실측: 393px 에서 worldView 가 98.25px 밀린다).
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

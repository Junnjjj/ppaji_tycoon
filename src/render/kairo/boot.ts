import Phaser from 'phaser';
import { KairoScene, type KairoSceneStats } from '../scenes/KairoScene.js';
import { KairoProceduralProvider } from '../../assets/kairo-procedural.js';
import { viewport } from './upscale.js';

/**
 * 카이로 씬 부팅.
 *
 * 기존 `boot()` 와 따로 둔다 — 스케일 모드가 완전히 다르기 때문이다.
 * v1 씬은 `Scale.RESIZE` + 카메라 줌을 쓰고, 카이로는 `Scale.NONE` + 캔버스 정수 확대다.
 * 한 설정으로 둘 다 하려다 보면 반 픽셀이 어디서 들어왔는지 못 찾는다.
 */
export interface KairoBootOptions {
  parent: HTMLElement | string;
  onFrame?: (s: KairoSceneStats) => void;
  onTapTile?: (i: number, j: number) => void;
}

export interface KairoHandle {
  game: Phaser.Game;
  scene: KairoScene;
  provider: KairoProceduralProvider;
}

export function bootKairo(opts: KairoBootOptions): KairoHandle {
  const provider = new KairoProceduralProvider();
  const scene = new KairoScene({
    provider,
    ...(opts.onFrame ? { onFrame: opts.onFrame } : {}),
    ...(opts.onTapTile ? { onTapTile: opts.onTapTile } : {}),
  });

  const v = viewport(window.innerWidth, window.innerHeight, 1, window.devicePixelRatio || 1);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    backgroundColor: '#7ab8d4',
    pixelArt: true,
    roundPixels: true,
    scale: {
      // ★ NONE — 내부 해상도를 우리가 정한다. RESIZE 를 쓰면 Phaser 가 CSS 크기를
      //   내부 해상도로 써서 텍셀 1:1 이 깨진다
      mode: Phaser.Scale.NONE,
      width: v.bufferW,
      height: v.bufferH,
      zoom: 1,
    },
    input: { activePointers: 3 },
    scene: [scene],
  });

  return { game, scene, provider };
}

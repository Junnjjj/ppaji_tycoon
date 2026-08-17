import Phaser from 'phaser';
import { KairoScene, type KairoSceneStats } from '../scenes/KairoScene.js';
import { KairoProceduralProvider } from '../../assets/kairo-procedural.js';
import { viewport } from './upscale.js';
import { KairoTerrain } from '../../sim/kairo/terrain.js';
import { WallGrid } from '../../sim/kairo/walls.js';
import { PlacementGrid } from '../../sim/kairo/placement.js';
import { Rng } from '../../sim/rng.js';
import { GRID_W, GRID_H } from './iso.js';

/**
 * 카이로 씬 부팅.
 *
 * 기존 `boot()` 와 따로 둔다 — 스케일 모드가 완전히 다르기 때문이다.
 * v1 씬은 `Scale.RESIZE` + 카메라 줌을 쓰고, 카이로는 `Scale.NONE` + 캔버스 정수 확대다.
 * 한 설정으로 둘 다 하려다 보면 반 픽셀이 어디서 들어왔는지 못 찾는다.
 */
export interface KairoBootOptions {
  parent: HTMLElement | string;
  /** 없으면 시드에서 만든다 */
  terrain?: KairoTerrain;
  walls?: WallGrid;
  placement?: PlacementGrid;
  seed?: number;
  onFrame?: (s: KairoSceneStats) => void;
  onTapTile?: (i: number, j: number) => void;
}

export interface KairoHandle {
  game: Phaser.Game;
  scene: KairoScene;
  provider: KairoProceduralProvider;
  terrain: KairoTerrain;
  walls: WallGrid;
  placement: PlacementGrid;
}

export function bootKairo(opts: KairoBootOptions): KairoHandle {
  const provider = new KairoProceduralProvider();
  const terrain =
    opts.terrain ?? KairoTerrain.generate(GRID_W, GRID_H, new Rng(opts.seed ?? 20260818));
  const walls = opts.walls ?? new WallGrid(GRID_W, GRID_H);
  const placement = opts.placement ?? new PlacementGrid(GRID_W, GRID_H);
  const scene = new KairoScene({
    provider,
    terrain,
    walls,
    placement,
    ...(opts.onFrame ? { onFrame: opts.onFrame } : {}),
    ...(opts.onTapTile ? { onTapTile: opts.onTapTile } : {}),
  });

  const v = viewport(window.innerWidth, window.innerHeight, 1, window.devicePixelRatio || 1);

  /**
   * `?px=1` 이면 프레임버퍼를 보존한다 — 검증 도구가 `readPixels` 로 실제 렌더 픽셀을
   * 읽어 타일링 이음새를 검사하려면 필요하다. 기본은 끈다 (성능 비용이 있다).
   *
   * 이걸 안 켜고 readPixels 하면 **검은색이 돌아와 검사가 조용히 통과한다** — 실측으로
   * 겪었다. 검사가 무효인 것보다 없는 게 낫다.
   */
  const preserve = new URLSearchParams(location.search).get('px') === '1';

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
    ...(preserve ? { render: { preserveDrawingBuffer: true } } : {}),
    scene: [scene],
  });

  return { game, scene, provider, terrain, walls, placement };
}

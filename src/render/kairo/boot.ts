import Phaser from 'phaser';
import { KairoScene, type KairoSceneStats } from '../scenes/KairoScene.js';
import { KairoProceduralProvider } from '../../assets/kairo-procedural.js';
import type { AssetProvider } from '../../assets/types.js';
import { viewport } from './upscale.js';
import { KairoTerrain } from '../../sim/kairo/terrain.js';
import { WallGrid } from '../../sim/kairo/walls.js';
import { PlacementGrid } from '../../sim/kairo/placement.js';
import { GuestStore } from '../../sim/kairo/guests.js';
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
  /**
   * 에셋 공급자. 없으면 절차 플레이스홀더 (Phase G 이전과 **완전히 같은 동작**).
   *
   * ⚠ 여기서 아틀라스를 직접 로드하지 않는다 — `bootKairo` 는 동기 함수여야 한다.
   * 비동기 로드는 부르는 쪽이 boot **앞**에서 끝낸다 (`createKairoAssetProvider`).
   */
  provider?: AssetProvider;
  /** 없으면 시드에서 만든다 */
  terrain?: KairoTerrain;
  walls?: WallGrid;
  placement?: PlacementGrid;
  /** 손님 게이트 — K4 에서 매표소 배치로 대체된다 */
  gate?: { i: number; j: number };
  seed?: number;
  onFrame?: (s: KairoSceneStats) => void;
  onTapTile?: (i: number, j: number) => void;
}

export interface KairoHandle {
  game: Phaser.Game;
  scene: KairoScene;
  /** 구상 클래스가 아니라 **인터페이스**다 (Phase G) — 아틀라스로 갈아끼워도 같은 자리 */
  provider: AssetProvider;
  terrain: KairoTerrain;
  walls: WallGrid;
  placement: PlacementGrid;
  guests: GuestStore;
  gate: { i: number; j: number };
}

export function bootKairo(opts: KairoBootOptions): KairoHandle {
  const provider = opts.provider ?? new KairoProceduralProvider();
  const terrain =
    opts.terrain ?? KairoTerrain.generate(GRID_W, GRID_H, new Rng(opts.seed ?? 20260818));
  const walls = opts.walls ?? new WallGrid(GRID_W, GRID_H);
  const placement = opts.placement ?? new PlacementGrid(GRID_W, GRID_H);
  // 기본값도 **공원 입구**다 (K36). (0,0) 은 도시 띠의 차도라 손님이 설 수 없다
  const gate = opts.gate ?? KairoTerrain.parkGate();
  const guests = new GuestStore(terrain, walls, placement, gate);
  const scene = new KairoScene({
    provider,
    terrain,
    walls,
    placement,
    guests,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
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

  return { game, scene, provider, terrain, walls, placement, guests, gate };
}

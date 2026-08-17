import Phaser from 'phaser';
import {
  GRID_W,
  GRID_H,
  TILE_W,
  TILE_H,
  tileCenter,
  depthKey,
  screenToTile,
  inGrid,
} from '../kairo/iso.js';
import { KairoCamera } from '../kairo/kairo-camera.js';
import { viewport, violatesDotGrid, type Upscale } from '../kairo/upscale.js';
import { KairoProceduralProvider } from '../../assets/kairo-procedural.js';
import { variantId } from '../../assets/types.js';

/**
 * 카이로 씬 — 2:1 아이소메트릭 격자.
 *
 * ## 카메라 줌을 쓰지 않는다
 *
 * `camera.setZoom` 은 줌을 카메라 중점 기준으로 걸어 worldView 를 `width·(1−1/z)/2`
 * 만큼 민다. 폰 393px 에서 그게 98.25px — 반 픽셀이 정확히 여기서 들어온다.
 * 그래서 **카메라 줌은 영구히 1** 이고, 확대는 `ScaleManager` 로 캔버스 전체를
 * 정수배 늘린다. 씬 좌표계는 항상 텍셀 1:1 이다.
 *
 * ## 왜 타일마다 Image 를 만드나
 *
 * 40×32 = 1,280 타일이면 Phaser 이미지 1,280개다. 폰에서 이 정도는 문제가 없다
 * (Phase 1 에서 손님 1,200명을 0.6ms/frame 로 돌린 실측이 있다). 타일맵 대신 이미지를
 * 쓰는 이유는 **깊이 정렬**이다 — 시설·손님·벽이 지면과 같은 정렬 축(i+j)에 섞여야 한다.
 * 타일맵 레이어로 지면을 따로 그리면 그 축이 끊긴다.
 */

/** 지면 종류 — K2 에서 배치 도구가 이걸 칠한다. K1 은 기본 지형만 깐다 */
export type GroundKind =
  | 'path_stone'
  | 'path_deck'
  | 'path_sand'
  | 'lawn'
  | 'water_edge'
  | 'floor_indoor';

export interface KairoSceneStats {
  fps: number;
  upscale: Upscale;
  bufferW: number;
  bufferH: number;
  scrollX: number;
  scrollY: number;
  tiles: number;
  /** 도트 격자 위반 — 비어 있어야 한다 */
  dotGridViolations: readonly string[];
}

export interface KairoSceneOptions {
  provider: KairoProceduralProvider;
  onFrame?: (s: KairoSceneStats) => void;
  /** 탭한 타일 (격자 밖이면 안 부른다) */
  onTapTile?: (i: number, j: number) => void;
}

export class KairoScene extends Phaser.Scene {
  private readonly opts: KairoSceneOptions;
  private readonly cam = new KairoCamera();
  /** 타일 지면 종류 — 결정론적으로 채운다 (K2 가 편집 기능을 붙인다) */
  private readonly ground: GroundKind[] = [];
  private tileImages: Phaser.GameObjects.Image[] = [];
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };
  private lastTapAt = 0;
  private violations: readonly string[] = [];

  constructor(opts: KairoSceneOptions) {
    super({ key: 'kairo' });
    this.opts = opts;
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) this.ground.push(defaultGround(i, j));
    }
  }

  preload(): void {
    // 프로바이더의 캔버스를 Phaser 텍스처로 등록. AtlasProvider 로 갈아끼워도 같은 경로다
    for (const id of this.opts.provider.ids) {
      if (this.textures.exists(id)) continue;
      this.textures.addCanvas(id, this.opts.provider.get(id));
    }
  }

  create(): void {
    this.cameras.main.setZoom(1); // ★ 영구히 1
    this.cameras.main.setBackgroundColor('#7ab8d4');
    this.cameras.main.setRoundPixels(true);

    this.buildGround();
    this.applyScale(this.cam.upscale);
    this.wireInput();

    this.scale.on('resize', () => this.applyScale(this.cam.upscale));
  }

  /** 타일 이미지를 한 번 만들어 두고 이후엔 위치만 갱신하지 않는다 (지면은 안 움직인다) */
  private buildGround(): void {
    for (const img of this.tileImages) img.destroy();
    this.tileImages = [];
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        const kind = this.ground[j * GRID_W + i]!;
        // 변형은 좌표로 결정 — 같은 타일은 항상 같은 그림 (결정론)
        const alt = (i * 7 + j * 13) % 3;
        const id = variantId(`ground/${kind}`, { alt });
        const c = tileCenter(i, j);
        const img = this.add.image(c.x, c.y + TILE_H / 2, id);
        img.setOrigin(0.5, 1); // bottom-center — 계약 앵커
        img.setDepth(depthKey(i, j));
        this.tileImages.push(img);
      }
    }
  }

  /**
   * 뷰포트 재계산 + 캔버스 정수 확대 적용.
   *
   * ⚠ `scale.resize()` 를 **크기가 실제로 바뀔 때만** 부른다. 같은 값으로 불러도
   * ScaleManager 가 refresh → RESIZE 이벤트를 다시 쏘고, 그 리스너가 또 resize 를 불러
   * 부팅 중 루프가 시작되지 못한다 (실측: `loop.started === false`, `frame === 0`).
   */
  private applyScale(s: Upscale): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const v = viewport(cssW, cssH, s, window.devicePixelRatio || 1);
    this.violations = violatesDotGrid(v, s);
    this.cam.setScreenSize(cssW, cssH);
    if (this.scale.width !== v.bufferW || this.scale.height !== v.bufferH) {
      this.scale.resize(v.bufferW, v.bufferH);
    }
    if (this.scale.zoom !== s) this.scale.setZoom(s);
    this.syncCamera();
  }

  private syncCamera(): void {
    const view = this.cam.view();
    this.cameras.main.setScroll(view.scrollX, view.scrollY);
  }

  private wireInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.lastPointer = { x: p.x, y: p.y };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      // p.x 는 **씬 좌표(텍셀)** 다. 팬은 화면 픽셀 기준이라 S 를 곱해 되돌린다
      const dx = (p.x - this.lastPointer.x) * this.cam.upscale;
      const dy = (p.y - this.lastPointer.y) * this.cam.upscale;
      this.lastPointer = { x: p.x, y: p.y };
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.cam.pan(dx, dy);
      this.syncCamera();
    });

    const end = (p: Phaser.Input.Pointer): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.cam.release();
      this.syncCamera();

      if (this.dragMoved >= 12) return; // 드래그였다
      const now = this.time.now;
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      if (now - this.lastTapAt < 320) {
        // 더블탭 — 찍은 지점을 앵커로 확대/축소 토글
        this.lastTapAt = 0;
        const next: Upscale = this.cam.upscale === 1 ? 2 : 1;
        this.cam.setUpscale(next, { x: world.x, y: world.y });
        this.applyScale(next);
        return;
      }
      this.lastTapAt = now;
      const t = screenToTile(world.x, world.y - TILE_H / 2);
      if (inGrid(t.i, t.j)) this.opts.onTapTile?.(t.i, t.j);
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);

    // 데스크톱 휠 — 한 단씩
    this.input.on(
      'wheel',
      (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        const world = this.cameras.main.getWorldPoint(p.x, p.y);
        const next: Upscale = dy < 0 ? 2 : 1;
        if (next === this.cam.upscale) return;
        this.cam.setUpscale(next, { x: world.x, y: world.y });
        this.applyScale(next);
      },
    );
  }

  override update(): void {
    const view = this.cam.view();
    const buf = this.cam.bufferSize();
    this.opts.onFrame?.({
      fps: Math.round(this.game.loop.actualFps),
      upscale: this.cam.upscale,
      bufferW: buf.w,
      bufferH: buf.h,
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      tiles: this.tileImages.length,
      dotGridViolations: this.violations,
    });
  }

  /** 테스트·도구용 — 카메라를 직접 놓는다 */
  focusTile(i: number, j: number): void {
    const c = tileCenter(i, j);
    const buf = this.cam.bufferSize();
    this.cam.pan(0, 0);
    // center 를 직접 옮길 수단이 없으므로 스크롤 차이만큼 팬한다
    const view = this.cam.view();
    const wantX = c.x - buf.w / 2;
    const wantY = c.y - buf.h / 2;
    this.cam.pan((view.scrollX - wantX) * this.cam.upscale, (view.scrollY - wantY) * this.cam.upscale);
    this.cam.release();
    this.syncCamera();
  }
}

/**
 * 기본 지형 — 강이 가로로 흐르는 파노라마 (스펙 §1.6).
 * `j` 가 클수록 카메라 쪽이므로, 뒤(작은 j)를 육지, 앞을 물로 둔다.
 */
function defaultGround(i: number, j: number): GroundKind {
  const shore = Math.floor(GRID_H * 0.55) + ((i * 5) % 3); // 물가 라인을 살짝 흔든다
  if (j > shore) return 'water_edge';
  if (j === shore) return 'path_sand';
  if (j > shore - 3) return 'path_stone';
  return 'lawn';
}

/** 타일 다이아몬드 크기를 밖에서도 쓸 수 있게 */
export const KAIRO_TILE = { w: TILE_W, h: TILE_H };

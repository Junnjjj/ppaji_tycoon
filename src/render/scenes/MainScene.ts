import Phaser from 'phaser';
import {
  EQUIPMENT_DEFS,
  FACILITY_DEFS,
  isWalkable,
  type Game as Sim,
  type GameStats,
} from '../../sim/index.js';
import { expandSpec, specForBase, type AssetProvider } from '../../assets/index.js';
import { buildTerrainTexture, type TerrainTexture } from '../terrain-texture.js';
import { registerTextures } from '../textures.js';
import { EntityLayer, type EntityStats } from '../entities.js';
import { PlacementController, type PlacementState } from '../placement.js';
import { CourseLayer } from '../course-layer.js';
import { CourseEditor, type CourseEditState } from '../course-editor.js';
import { CameraController } from '../camera.js';
import { scatterDeco } from '../deco-layer.js';
import { TILE_SIZE, ZOOM_DEFAULT, lodForZoom, type Lod } from '../constants.js';

const TERRAIN_TEXTURE_KEY = 'terrain';

export interface MainSceneDeps {
  sim: Sim;
  provider: AssetProvider;
  onFrame?: (info: FrameInfo) => void;
  onPlacementChange?: (state: PlacementState | null) => void;
  onCourseEditChange?: (state: CourseEditState | null) => void;
}

export interface FrameInfo {
  fps: number;
  zoom: number;
  lod: Lod;
  simMs: number;
  stats: GameStats;
  entities: EntityStats;
}

export class MainScene extends Phaser.Scene {
  private sim: Sim;
  private provider: AssetProvider;
  private onFrame: ((info: FrameInfo) => void) | undefined;
  private onPlacementChange: ((s: PlacementState | null) => void) | undefined;
  private onCourseEditChange: ((s: CourseEditState | null) => void) | undefined;

  private terrain!: TerrainTexture;
  private camCtl!: CameraController;
  private entities!: EntityLayer;
  private placementCtl!: PlacementController;
  private courses!: CourseLayer;
  private courseEditor!: CourseEditor;
  private lastSimMs = 0;

  constructor(deps: MainSceneDeps) {
    super({ key: 'main' });
    this.sim = deps.sim;
    this.provider = deps.provider;
    this.onFrame = deps.onFrame;
    this.onPlacementChange = deps.onPlacementChange;
    this.onCourseEditChange = deps.onCourseEditChange;
  }

  preload(): void {
    // v5 배경 레이어 — 파일이 없으면 로드 실패 후 create 가 조용히 생략한다.
    this.load.image('bg-far', 'assets/backdrop/bg-far.png');
    this.load.image('bg-near', 'assets/backdrop/bg-near.png');
  }

  create(): void {
    const world = this.sim.world;

    // ── v5 배경: 맵 위쪽에 산·숲 원경 (가로 타일링, 지형 위 트리라인 오버행) ──
    // 서빙본은 4× NEAREST 로 미리 확대돼 있다 (선형 샘플링이 걸려도 도트가 유지되게).
    let bgTop = 0;
    const BG_SCALE = 0.5;
    if (this.textures.exists('bg-far') && this.textures.exists('bg-near')) {
      const mapW = world.width * TILE_SIZE;
      const far = this.textures.get('bg-far').getSourceImage();
      const near = this.textures.get('bg-near').getSourceImage();
      // TileSprite 는 WebGL 에서 자체 샘플링을 하므로 pixelArt 전역 설정과 별개로 NEAREST 를 명시한다.
      this.textures.get('bg-far').setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.textures.get('bg-near').setFilter(Phaser.Textures.FilterMode.NEAREST);
      const nearH = near.height * BG_SCALE;
      const farH = far.height * BG_SCALE;
      // 트리라인이 맵 상단 숲 띠 위로 살짝 겹치고, 원경은 트리라인의 투명 상단 뒤까지 내려와
      // 하늘색 틈이 생기지 않게 한다 (트리라인 수관은 자기 높이의 ~40% 지점에서 시작).
      const nearY = -nearH + TILE_SIZE * 2.5;
      const farY = nearY - farH + nearH * 0.6;
      bgTop = farY;
      this.add
        .tileSprite(0, farY, mapW / BG_SCALE, far.height, 'bg-far')
        .setOrigin(0, 0)
        .setScale(BG_SCALE)
        .setDepth(-1_000_002);
      this.add
        .tileSprite(0, nearY, mapW / BG_SCALE, near.height, 'bg-near')
        .setOrigin(0, 0)
        .setScale(BG_SCALE)
        .setDepth(-999_999);
      this.cameras.main.setBackgroundColor(0x5fb4dc);
    }

    // ── 지형: 통짜 텍스처로 한 번만 굽는다 ──
    this.terrain = buildTerrainTexture(world, this.provider);
    if (this.textures.exists(TERRAIN_TEXTURE_KEY)) {
      this.textures.remove(TERRAIN_TEXTURE_KEY);
    }
    this.textures.addCanvas(TERRAIN_TEXTURE_KEY, this.terrain.canvas);
    this.add.image(0, 0, TERRAIN_TEXTURE_KEY).setOrigin(0, 0).setDepth(-1_000_000);

    // ── 스프라이트 텍스처 등록 (손님 96종 + 시설) ──
    const guestSpec = specForBase('guest/body');
    if (guestSpec) registerTextures(this, this.provider, expandSpec(guestSpec));
    registerTextures(this, this.provider, [
      ...FACILITY_DEFS.map((d) => d.sprite),
      ...EQUIPMENT_DEFS.map((d) => d.sprite),
    ]);
    // v5 데코 소품 (나무·파라솔) — 절차 산포 레이어가 쓴다
    for (const base of ['prop/tree', 'prop/parasol']) {
      const spec = specForBase(base);
      if (spec) registerTextures(this, this.provider, expandSpec(spec));
    }

    // ── 카메라 ── (배경 레이어가 있으면 위쪽 경계를 그만큼 연다)
    const cam = this.cameras.main;
    cam.setBounds(0, bgTop, this.terrain.widthPx, this.terrain.heightPx - bgTop);
    cam.setZoom(ZOOM_DEFAULT);
    cam.setRoundPixels(true);
    cam.centerOn(this.terrain.widthPx / 2, world.height * 0.42 * TILE_SIZE);

    this.camCtl = new CameraController(this, cam);

    // ── 데코 산포 (정적, 1회) ──
    scatterDeco(this, this.sim);

    // ── 엔티티 ──
    this.entities = new EntityLayer(this, this.sim);
    this.courses = new CourseLayer(this, this.sim);

    // ── 배치 ──
    this.placementCtl = new PlacementController(this, this.sim);
    this.placementCtl.onChange = (s) => this.onPlacementChange?.(s);
    this.camCtl.onSingleDrag = (dx, dy) => this.placementCtl.dragBy(dx, dy);

    // ── 코스 편집 ──
    this.courseEditor = new CourseEditor(this, this.sim);
    this.courseEditor.onChange = (s) => this.onCourseEditChange?.(s);

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (!this.camCtl.wasTap) return;
      const w = cam.getWorldPoint(p.x, p.y);

      // 코스 편집 중이면 탭이 제어점을 찍는다
      if (this.courseEditor.isActive) {
        this.courseEditor.tapAt(w.x, w.y);
        return;
      }
      if (this.placementCtl.isActive) return;

      const tx = Math.floor(w.x / TILE_SIZE);
      const ty = Math.floor(w.y / TILE_SIZE);
      const f = this.sim.facilities.facilityAt(tx, ty);
      console.log(
        `[탭] (${tx},${ty}) 지형=${this.sim.world.at(tx, ty)} 걸을수있음=${isWalkable(
          this.sim.world.at(tx, ty),
        )}${f ? ` 시설=${f.defId} 대기=${f.queue} 이용중=${f.inUse}` : ''}`,
      );
    });
  }

  override update(_time: number, delta: number): void {
    const ticks = this.sim.clock.pump(delta);
    if (ticks > 0) {
      const t0 = performance.now();
      this.sim.run(ticks);
      this.lastSimMs = performance.now() - t0;
    }

    const lod = lodForZoom(this.cameras.main.zoom);
    this.entities.update(lod);
    this.courses.update(lod, delta / 1000);

    this.onFrame?.({
      fps: this.game.loop.actualFps,
      zoom: this.cameras.main.zoom,
      lod,
      simMs: this.lastSimMs,
      stats: this.sim.stats(),
      entities: this.entities.stats,
    });
  }

  // ── UI 가 부르는 표면 ──

  beginPlacement(defId: string): void {
    this.placementCtl.begin(defId);
    this.camCtl.panEnabled = false;
  }

  cancelPlacement(): void {
    this.placementCtl.cancel();
    this.camCtl.panEnabled = true;
  }

  rotatePlacement(): void {
    this.placementCtl.rotate();
  }

  confirmPlacement(): boolean {
    const ok = this.placementCtl.confirm();
    if (ok && !this.placementCtl.isActive) this.camCtl.panEnabled = true;
    return ok;
  }

  get isPlacing(): boolean {
    return this.placementCtl.isActive;
  }

  // ── 코스 편집 ──

  beginCourse(defId: string): void {
    this.cancelPlacement();
    this.courseEditor.begin(defId);
  }

  cancelCourse(): void {
    this.courseEditor.cancel();
  }

  undoCoursePoint(): void {
    this.courseEditor.undo();
  }

  changeCourseVehicles(delta: number): void {
    this.courseEditor.addVehicle(delta);
  }

  confirmCourse(): boolean {
    return this.courseEditor.confirm();
  }

  get isEditingCourse(): boolean {
    return this.courseEditor.isActive;
  }

  get cameraController(): CameraController {
    return this.camCtl;
  }
}

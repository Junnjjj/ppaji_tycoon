import { applyNpcDensity } from './npc-density';
import { woodlandLayout, type WoodlandPlant } from './woodland-layout.js';
import { TOWN_LOTS, TOWN_BUILDINGS, TOWN_CROSSINGS, townWalkingLoop, trafficGreen, advanceTownVehicle } from './town-layout.js';
import { exteriorTile } from './exterior.js';
import { DetailCamera } from './detail-camera.js';
import { imagegenArt } from '../assets/imagegen-art.js';
import type { ImageGenGround } from './imagegen-ground.js';
import { PreparationRenderer } from './preparation.js';
import { prepPosition } from '../sim/preparation.js';
import { reservedBounds } from '../sim/facility-spacing.js';
import { compactBoundaryLayers, type BoundaryAssets, type BoundaryWall } from './compact-boundary.js';
import { portalHidden, portalPosition } from '../sim/facility-portal.js';
import { approvedPivot, approvedAnchor, type ApprovedFacilityProvider } from '../assets/approved-facilities.js';
import { StaticFacilityRenderer, type StaticDepth } from './static-facilities.js';
import { CourseRideRenderer } from './course-rides.js';
import type { RideScene } from '../sim/course/ride-view.js';
import type { WatercraftProvider } from '../assets/watercraft.js';
import type { PlacedCourse } from '../sim/course/course.js';
import { npcV8Key, staffNpcSeed } from '../assets/npc-v8.js';
/**
 * 워터파크 씬 — 지면 타일·(G1 부터) 풀·손님·FX 를 한 `i+j` 깊이 축 위에 그린다.
 * 타일 하나에 Image 하나 (3,072). 타일맵을 안 쓰는 이유는 지면·시설·손님이 **같은 깊이 축**을
 * 써야 해서다.
 *
 * 입력: 한 손가락 드래그 = 팬 · 두 손가락 = 핀치(1↔2) · 더블탭 = 앵커 확대 토글 · 휠 = 한 단.
 * 카메라 상태는 `Camera`(순수)가 들고 씬은 `view()` 를 꽂기만 한다.
 */
import Phaser from 'phaser';
import type { AssetProvider } from '../assets/types.js';
import { Grid, FLOOR, FLOOR_NAMES, ROAD_ROWS, STOP_ROW, CITY_BAND, GRID_W as GW, gateTile, landRect, isIndoorCode, type FloorCode, isWaterCode } from '../sim/grid.js';
import { Camera } from './camera.js';
import { gridToScreen, screenToTile, depthKey, spanDepthKey, inGrid, tileCenter, groundDepth, Z_GUEST, Z_FACILITY, Z_WALL_BACK, Z_WALL_FRONT, Z_GHOST, DEPTH_AIM_MARK, DEPTH_SCREEN_FX, TILE_W, TILE_H, GRID_W, GRID_H , lift, DEPTH_COURSE_MARK } from './iso.js';
import { drawColumn } from './column.js';
import { WaterGlint } from './water.js';
import { GUEST_ANCHOR, GUEST_FRAMES, GUEST_H, GUEST_W, guestTextureKey, type GuestPose } from '../assets/draw/guest.js';
import { drawEmote, drawBattery } from '../assets/draw/emote.js';
import { drawBus, BUS_W, BUS_H, drawBusStop, drawLamp } from '../assets/draw/bus.js';
import type { Landscape } from '../assets/landscape.js';
import { Surround } from './surround.js';
import type { BusState } from '../sim/game.js';
import type { Staff } from '../sim/staff.js';
import { drawGauge } from '../assets/draw/emote.js';
import { WATER_FRAMES } from '../assets/draw/tiles.js';
import { moodOf, buildOf, type Guest } from '../sim/guest.js';
import type { PlacedFacility } from '../sim/facility.js';
import type { FacilityDef } from '../data/schema.js';
import { facilityCanvasSize } from '../assets/draw/facility.js';
import { footprintAnchor, canvasAnchor, DEPTH_LAND_MARK } from './iso.js';
import { FacilityStore } from '../sim/facility.js';
import { BODY_H } from '../assets/draw/facility.js';
import { cssColorInt, cssVar } from '../ui/tokens.js';
import { viewport, violatesDotGrid, type Upscale } from './upscale.js';
import { playFx, type FxName, type FxTarget, type FxHandle } from './fx/registry.js';

/** P60-d — 고스트 손님 주행의 v8 룩 씨앗(직원 `staffNpcSeed` 와 겹치지 않는 값) */
const PATH_WALK_SEED = 4242;

export interface SceneStats {
  fps: number;
  sprites: number;
  scale: Upscale;
  scrollX: number;
  scrollY: number;
  violations: string[];
}

export interface SceneDeps {
  imagegenGround?: ImageGenGround;
  provider: AssetProvider;
  compactArrival?: () => boolean;
  compactBoundary?: BoundaryAssets;
  watercraft?: WatercraftProvider;
  approved?: ApprovedFacilityProvider | null;
  staticDepth?: StaticDepth | null;
  rideScene?: () => RideScene;
  rideTime?: () => number;
  grid: Grid;
  camera: Camera;
  rank: () => number;
  /** 첫 화면이 볼 칸 — 새 판은 토지 중앙. 안 주면 월드 중앙 */
  startTile?: { i: number; j: number; bottomInsetCss?: number };
  onFrame?: (s: SceneStats) => void;
  onTapTile?: (i: number, j: number) => void;
  /**
   * 조준 배치(레거시 K47-③) — `setAimCenter(true)` 인 동안 화면 중앙(확정 바 위 영역의 가운데) 칸이
   * **바뀔 때마다** 부른다. 팬하면 고스트가 그 칸을 따라간다 — 손가락이 고스트를 안 가린다
   */
  onAimCenter?: (i: number, j: number) => void;
  /** P4-B: 핸들을 끌 때마다 (지표 실시간 갱신 신호) · 선착장 후보 탭 */
  onCourseHandleMove?: (index: number, i: number, j: number) => void;
  onCourseDockPick?: (index: number) => void;
  /** P57-b — 북쪽 바깥 풍경 띠(먼 산·가까운 숲). null 이면 안 그린다 */
  landscape?: Landscape | null;
}

const TAP_MOVE_PX = 12;
const DOUBLE_TAP_MS = 320;

/** P39/P40 — 벽·울타리 높이(텍셀). 손님(24)보다 낮다 — 부모 K25 「벽은 손님보다 낮다」 */
const WALL_H = 12;

export class WaterparkScene extends Phaser.Scene {
  private readonly tiles: Phaser.GameObjects.Image[] = [];
  private violations: string[] = [];
  private dragging = false;
  private dragMoved = 0;
  private lastTapAt = 0;
  private pinchStart: number | null = null;
  private pinchScale: Upscale = 1;
  private frames = 0;
  private fpsAt = 0;
  private fps = 0;
  /** 검증 도구가 화면을 얼릴 때 내린다 — 시간 흐름이 이걸 본다 */
  tickingEnabled = true;
  /** 조준 배치 켜짐 — 켜진 동안 카메라가 움직이면 화면 중앙 칸을 `onAimCenter` 로 보낸다 (K47-③) */
  aimCenterOn = false;
  private aimInsetCss = 0;
  private aimLastView: { scrollX: number; scrollY: number; scale: Upscale } | null = null;
  private aimLastTile: { i: number; j: number } | null = null;
  private water: WaterGlint | null = null;
  private pendingPoolTiles: readonly number[] = [];
  readonly guestImgs = new Map<number, Phaser.GameObjects.Image>();
  private guestsRef: readonly Guest[] = [];
  private selection: Phaser.GameObjects.Graphics | null = null;
  private tint: Phaser.GameObjects.Rectangle | null = null;
  private weatherGfx: Phaser.GameObjects.Graphics | null = null;
  private laneGfx: Phaser.GameObjects.Graphics | null = null;
  /** P44-b — 벽·울타리·문은 칸마다 뒤/앞 층 하나씩(깊이 띠 Z_WALL_BACK/FRONT). 한 Graphics 에 다 그리면 어떤 깊이든 틀린다(P43: 전부 위에 떠서 「쌓인 띠」로 보였다) */
  private wallLayers = new Map<string, Phaser.GameObjects.Graphics>();
  private wallsReady = false;

  private season = 0;
  private weatherKind: 'rain' | 'snow' | null = null;
  private drops: { x: number; y: number; v: number }[] = [];
  private animFrame = 0;
  readonly facImgs = new Map<number, Phaser.GameObjects.Image>();
  /** P50-b2 — 꺼진 물 위 기구 uid(틴트 `--rig-dim`) · 링 데크 칸 → 등급 폰툰 색 · 이음쇠 변 */
  private dimUids = new Set<number>();
  private ringTint = new Map<number, number>();
  private rigLinkGfx: Phaser.GameObjects.Graphics | null = null;
  private rigLinks: readonly { i: number; j: number; dir: 0 | 1 }[] = [];
  private facilitiesRef: readonly PlacedFacility[] = [];
  private staffRef: readonly Staff[] = [];
  private readonly staffImgs = new Map<number, Phaser.GameObjects.Image>();
  private facDefOf: ((f: PlacedFacility) => FacilityDef) | null = null;
  ghost: Phaser.GameObjects.Image | null = null;
  /** 조준 화살표 4 + 가격표 (G47, 원작 배치 화면) */
  private aimGfx: Phaser.GameObjects.Graphics | null = null;
  private aimLabelText: string | null = null;
  /** P60-c D72 B — 조준 중 세트가 성립할 이웃 기구 위 별(FX `set-star` 핸들). 고스트가 지워지면 같이 지운다 */
  private setStars: FxHandle[] = [];
  /** P60-d D72 A — 조준 중 고스트 손님 주행(FX `path-walk`) 핸들 + 마지막 점열 키(같은 조준 칸이면 다시 안 걷는다) · 링 입수구 표식(FX `entry-mark`) 핸들. 고스트가 지워지면 같이 지운다 */
  private pathWalk: FxHandle | null = null;
  private pathWalkKey = '';
  private entryMark: FxHandle | null = null;
  private poolTint = new Map<number, number>();
  private readonly ambient: { i: number; j: number; kind: 'steam' | 'frost' | 'spray'; nextAt: number }[] = [];
  private readonly emoteImgs = new Map<number, Phaser.GameObjects.Image>();
  private readonly gaugeImgs = new Map<number, Phaser.GameObjects.Image>();
  /** HP 배터리 (G26) — hp < 30 인 손님 */
  private readonly hpImgs = new Map<number, Phaser.GameObjects.Image>();
  static readonly HP_ICON_BELOW = 30;
  /** 동시 이모트 상한 — 말풍선 3 과 같은 이유 (전부 띄우면 아무도 안 보인다) */
  static readonly MAX_EMOTES = 8;

  /** 새 판(뉴게임+·newGame)이 격자를 갈아끼울 때 (G57 — 옛 판 격자를 계속 그리던 버그) */
  setGrid(grid: Grid): void {
    (this.deps as { grid: Grid }).grid = grid;
  }

  gridForTest(): Grid {
    return this.deps.grid;
  }

  constructor(private readonly deps: SceneDeps) {
    super('waterpark');
  }

  get cam(): Camera {
    return this.deps.camera;
  }

  /** Two raster samples per logical pixel; ?render=pixel keeps the old comparison. */
  private readonly renderDensity = new URLSearchParams(location.search).get('render') === 'pixel' ? 1 : 2;

  create(): void {
    const oldCamera = this.cameras.main;
    this.cameras.addExisting(new DetailCamera(this.scale.width, this.scale.height), true);
    this.cameras.remove(oldCamera);
    for (const id of this.deps.provider.ids()) {
      // facilityTexture() uploads a building only when it is placed or previewed.
      if (id.startsWith('fac/')) continue;
      const c = this.deps.provider.canvas(id);
      if (c && !this.textures.exists(id)) this.textures.addCanvas(id, c);
    }
    this.buildGround();
    this.water = new WaterGlint(this);
    this.water.setTiles(this.pendingPoolTiles, this.deps.grid.w);
    this.selection = this.add.graphics();
    this.selection.setDepth(DEPTH_AIM_MARK);
    this.tint = this.add.rectangle(0, 0, 4, 4, 0, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH_SCREEN_FX - 1);
    this.weatherGfx = this.add.graphics().setScrollFactor(0).setDepth(DEPTH_SCREEN_FX - 2);
    this.laneGfx = this.add.graphics().setDepth(DEPTH_LAND_MARK - 3);
    this.wallsReady = true;
    this.surround = new Surround(this, this.deps.grid, (floor,i,j,level)=>{
      const hd=this.deps.imagegenGround;
      const key=hd?.key(this,FLOOR_NAMES[floor]??'grass',i,j,level);
      let tint=floor===FLOOR.grass?(cssColorInt(`--grass-season-${this.season}`)||0xffffff):0xffffff;
      if(j>=CITY_BAND&&!isWaterCode(floor)&&floor!==FLOOR.deck)tint=(Math.round(((tint>>16)&255)*.82)<<16)|(Math.round(((tint>>8)&255)*.82)<<8)|Math.round((tint&255)*.82);
      if(key)return {...hd!.resolve(key),scale:1/hd!.density,tint};
      const fallback=this.tileKey(floor,false);
      if(!this.textures.exists(fallback)){const c=this.deps.provider.canvas(fallback);if(c)this.textures.addCanvas(fallback,c);}
      return {key:fallback,scale:1};
    }); // P44 지도 바깥
    this.surround.build(this.deps.compactArrival?.() ?? false,this.season);
    this.buildLandscape();
    this.buildTraffic();
    this.applyScale(this.cam.upscale);
    const bootAt = performance.now();
    const st = this.deps.startTile;
    if (st) this.focusTile(st.i, st.j, st.bottomInsetCss ?? 0);
    this.scale.on('resize', () => this.applyScale(this.cam.upscale));
    window.addEventListener('resize', () => {
      this.applyScale(this.cam.upscale);
      // 부팅 5초 안의 리사이즈(폰 주소창·회전·에뮬레이션)면 시작 칸을 다시 비춘다 — 첫 화면이 풀이 아니라 모래 구석이던 P2 (G43)
      if (st && performance.now() - bootAt < 5000) this.focusTile(st.i, st.j, st.bottomInsetCss ?? 0);
    });
    this.wireInput();
    this.fpsAt = this.time.now;
  }

  private prepRenderer: PreparationRenderer | null = null;
  private lastUpdateAt = 0;
  override update(): void {
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer && this.game.renderer.contextLost) return;
    this.stepTown(this.game.loop.delta);
    this.stepTraffic(this.game.loop.delta); // P44-d 도로 위 버스 한 대(장식)
    this.frames++;
    { const now = this.time.now; const dt = this.lastUpdateAt ? Math.min(100, now - this.lastUpdateAt) : 16; this.lastUpdateAt = now; this.tickCourseTrial(dt); this.tickCourseBoats(dt); } // P4-B 시험 운행 · P4-C 보트 시계 (트윈 대신)
    if (this.deps.approved && this.deps.staticDepth) {
      this.staticRenderer ??= new StaticFacilityRenderer(this, this.deps.approved, this.deps.provider, this.deps.staticDepth);
      this.staticRenderer.update(this.facilitiesRef,this.guestsRef,this.deps.rideTime?.() ?? 0,this.facDefOf??undefined,(i,j)=>this.liftAt(i,j));
    }
    if(this.deps.compactBoundary && this.deps.compactArrival?.()){
      this.prepRenderer ??= new PreparationRenderer(this,this.deps.compactBoundary,this.deps.provider);
      this.prepRenderer.update(this.facilitiesRef,this.guestsRef,(this.deps.rideTime?.() ?? this.time.now/1000)*1000);
    }
    this.animFrame++;
    this.tickWater();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.deps.imagegenGround) this.water?.update(reduced);
    this.syncGuests();
    this.syncFacilities();
    this.refreshImagegenSprites();
    if (!reduced) this.tickAmbient();
    this.drawWeather(reduced);
    const now = this.time.now;
    if (now - this.fpsAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    const v = this.cam.view();
    if (this.aimCenterOn && (!this.aimLastView || this.aimLastView.scrollX !== v.scrollX || this.aimLastView.scrollY !== v.scrollY || this.aimLastView.scale !== v.scale)) this.pushAimCenter(v); // 카메라가 움직인 프레임에만 (칸이 바뀔 때만 콜백)
    this.deps.onFrame?.({
      fps: this.fps,
      sprites: this.children.length,
      scale: v.scale,
      scrollX: v.scrollX,
      scrollY: v.scrollY,
      violations: this.violations,
    });
  }

  /**
   * 조준 배치(레거시 K47-③) 켜기/끄기. 켜면 곧바로 한 번 화면 중앙 칸을 계산해 `onAimCenter` 를 부르고,
   * 그 뒤로는 `update()` 가 카메라 scroll·scale 이 지난 프레임과 다를 때만 다시 센다.
   * `bottomInsetCss` — 확정 바(#dock-place)가 가린 아래쪽 높이. 중앙은 그 위 영역의 가운데다
   */
  setAimCenter(on: boolean, bottomInsetCss: number): void {
    this.aimCenterOn = on;
    this.aimInsetCss = bottomInsetCss;
    this.aimLastView = null;
    this.aimLastTile = null;
    if (on) this.pushAimCenter(this.cam.view());
  }

  /** 화면 중앙(css) → 월드 텍셀 → 칸. 격자 안이고 지난 칸과 다를 때만 콜백 */
  private pushAimCenter(v: { scrollX: number; scrollY: number; scale: Upscale }): void {
    this.aimLastView = { scrollX: v.scrollX, scrollY: v.scrollY, scale: v.scale };
    const css = this.cam.screenCss;
    const p = this.cam.screenToTexel(css.w / 2, (css.h - this.aimInsetCss) / 2);
    const t = screenToTile(p.x, p.y);
    if (!inGrid(t.i, t.j)) return;
    if (this.aimLastTile && this.aimLastTile.i === t.i && this.aimLastTile.j === t.j) return;
    this.aimLastTile = t;
    this.deps.onAimCenter?.(t.i, t.j);
  }

  /** 지면 전부. 타일 텍스처 키는 `tile/<kind>`, 입구 칸만 `tile/gate` */
  private buildGround(): void {
    const g = this.deps.grid;
    const gate = this.deps.compactArrival?.() ? { i: gateTile(this.deps.rank()).i, j: 0 } : gateTile(this.deps.rank());
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const p = gridToScreen(i, j);
        const key=this.columnKey(g.at(i,j),i===gate.i&&j===gate.j,i,j),texture=this.deps.imagegenGround?.resolve(key)??{key};
        const img = this.add.image(p.x, p.y + this.liftAt(i, j),texture.key,texture.frame);
        this.setGroundOrigin(img, g.at(i, j));
        this.deps.imagegenGround?.setWaterTile(this,img,FLOOR_NAMES[g.at(i,j)]??'sand',i,j,this.noLiftForTest?0:g.levelAt(i,j),FLOOR_NAMES[g.natural[j*g.w+i]!]??'sand');
        img.setDepth(groundDepth(i, j, this.noLiftForTest ? 0 : g.levelAt(i, j)));
        this.tiles[j * g.w + i] = img;
      }
    }
    this.deps.imagegenGround?.flush();
  }

  private setGroundOrigin(img: Phaser.GameObjects.Image, floor: FloorCode): void {
    if (img.texture.key.startsWith('imagegen-ground/')) { img.setOrigin(.5, 0).setScale(1 / this.deps.imagegenGround!.density); return; }
    img.setScale(img.texture.key==='imagegen/tile/deck'?.25:1);
    const s = floor === FLOOR.deck && this.deps.approved?.spec('tile/deck');
    img.setOrigin(s ? s.ax / s.w : .5, s ? s.ay / s.h : 0);
  }

  private waterFrame = 0;
  private copingGfx: Phaser.GameObjects.Graphics | null = null;

  /** 단 높이 → 화면 y 보정 (P0-B). 결함 주입이 켜지면 0 */
  liftAt(i: number, j: number): number {
    return this.noLiftForTest ? 0 : lift(this.deps.grid.levelAt(i, j));
  }
  private noLiftForTest = false;
  /** 음성 대조군 — 리프트를 끄면 단 위 오브젝트가 지면에 파묻힌다 */
  setLiftFaultForTest(on: boolean): void {
    this.noLiftForTest = on;
    for (let j = 0; j < this.deps.grid.h; j++) for (let i = 0; i < this.deps.grid.w; i++) this.refreshTile(i, j);
    this.syncFacilities();
    this.refreshImagegenSprites();
  }
  tileYForTest(i: number, j: number): number {
    return this.tiles[j * this.deps.grid.w + i]?.y ?? 0;
  }

  /** 단이 있는 칸의 텍스처 — 윗면 + 치마 한 장 (`<tileKey>|z<n>`), 없으면 구워 둔다 */
  private columnKey(code: FloorCode, isGate: boolean, i: number, j: number): string {
    const base = this.tileKey(code, isGate);
    const candidate = !isGate && this.deps.imagegenGround?.key(this, FLOOR_NAMES[code] ?? 'sand', i, j, this.noLiftForTest ? 0 : this.deps.grid.levelAt(i,j));
    if (candidate) return candidate;
    if(base==='tile/deck'){const hd=imagegenArt.get(base);if(hd){const key='imagegen/tile/deck';if(!this.textures.exists(key))this.textures.addCanvas(key,hd)?.setFilter(Phaser.Textures.FilterMode.LINEAR);return key;}}
    // Flat water/hall tiles also need lazy atlas frames before their first Image is created.
    if (!this.textures.exists(base)) { const c0 = this.deps.provider.canvas(base); if (c0) this.textures.addCanvas(base, c0); }
    const z = this.noLiftForTest ? 0 : this.deps.grid.levelAt(i, j);
    if (z <= 0) return base;
    const key = `${base}|z${z}`;
    if (!this.textures.exists(key)) {
      const top = this.deps.provider.canvas(base);
      if (top) this.textures.addCanvas(key, drawColumn(top, z));
      else return base;
    }
    return key;
  }

  private tileKey(code: FloorCode, isGate: boolean): string {
    if (isGate) return 'tile/gate';
    if (code === FLOOR.pool) return `tile/pool:${this.waterFrame}`;
    if (code === FLOOR.river) return `tile/river:${this.waterFrame}`; // P0: 강도 흐른다
    return `tile/${FLOOR_NAMES[code] ?? 'sand'}`;
  }

  /** 물결 — 20프레임마다 풀 타일의 텍스처를 다음 프레임으로 (G18). 타일 이미지 하나당 setTexture 한 번 */
  private tickWater(): void {
    if (this.deps.imagegenGround) { this.deps.imagegenGround.tick(this.time.now, !this.tickingEnabled || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches); return; }
    if (this.animFrame % 20 !== 0) return;
    this.waterFrame = (this.waterFrame + 1) % WATER_FRAMES;
    const key = `tile/pool:${this.waterFrame}`;
    const riverKey = `tile/river:${this.waterFrame}`;
    for (const k of [key, riverKey]) if (!this.textures.exists(k)) { const c = this.deps.provider.canvas(k); if (c) this.textures.addCanvas(k, c); }
    const g = this.deps.grid;
    for (let k = 0; k < this.tiles.length; k++) {
      const f = g.floor[k];
      if (f === FLOOR.pool) this.tiles[k]?.setTexture(key);
      else if (f === FLOOR.river) this.tiles[k]?.setTexture(riverKey);
    }
  }

  /** 풀 코핑 (G18) — 풀 덩어리의 바깥 변에 밝은 테두리. 지면이 바뀔 때만 다시 그린다 */
  drawCoping(): void {
    if (!this.copingGfx) this.copingGfx = this.add.graphics().setDepth(DEPTH_LAND_MARK - 4);
    const g = this.copingGfx;
    g.clear();
    const grid = this.deps.grid;
    const isPool = (a: number, b: number): boolean => a >= 0 && b >= 0 && a < grid.w && b < grid.h && grid.at(a, b) === FLOOR.pool;
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        if (!isPool(i, j)) continue;
        const p = gridToScreen(i, j);
        // PSS 코핑 = 흰 타일 띠(굵게) + 물 쪽 진한 선 (R6)
        // P1: 강 위 수역은 코핑이 아니라 **부표 줄**(주황·흰 점선). 뭍의 인공 풀은 흰 코핑 그대로
        const buoy = isWaterCode(grid.naturalAt(i, j)); // P48-b1: 자연 바닥이 물이면(본류든 굽이든) 부표 줄, 뭍 풀만 코핑
        const lz = this.liftAt(i, j);
        const edge = (x0: number, y0: number, x1: number, y1: number): void => {
          if (buoy) {
            g.lineStyle(2, cssColorInt('--buoy-line'), 1); g.beginPath(); g.moveTo(x0, y0 + lz); g.lineTo(x1, y1 + lz); g.strokePath();
            const n = 4;
            for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 0.5) / n; g.lineStyle(2, cssColorInt('--buoy-line-alt'), 1); g.beginPath(); g.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0 + lz); g.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1 + lz); g.strokePath(); }
            return;
          }
          g.lineStyle(3, cssColorInt('--pool-coping'), 1); g.beginPath(); g.moveTo(x0, y0 + lz); g.lineTo(x1, y1 + lz); g.strokePath();
          g.lineStyle(1, cssColorInt('--pool-coping-edge'), 0.9); g.beginPath(); g.moveTo(x0, y0 + 1 + lz); g.lineTo(x1, y1 + 1 + lz); g.strokePath();
        };
        // P45-a 부표 정리: 강 위 수역의 부표 줄은 **트인 강·여울과 만나는 변에만** — 데크 변은 데크가 곧 경계라 그리면 두 겹으로 겹친다(사용자). 뭍 인공 풀의 코핑은 그대로 네 변
        const open = (a: number, b: number): boolean => !isPool(a, b) && (!buoy || grid.at(a, b) === FLOOR.river || grid.at(a, b) === FLOOR.shallow);
        if (open(i - 1, j)) edge(p.x, p.y, p.x - TILE_W / 2, p.y + TILE_H / 2);
        if (open(i, j - 1)) edge(p.x, p.y, p.x + TILE_W / 2, p.y + TILE_H / 2);
        if (open(i + 1, j)) edge(p.x + TILE_W / 2, p.y + TILE_H / 2, p.x, p.y + TILE_H);
        if (open(i, j + 1)) edge(p.x - TILE_W / 2, p.y + TILE_H / 2, p.x, p.y + TILE_H);
      }
    }
  }

  /** 격자 한 칸을 다시 그린다 (G1 의 풀 파기가 부른다) */
  refreshTile(i: number, j: number): void {
    const img = this.tiles[j * this.deps.grid.w + i];
    if (!img) return;
    const gate = this.deps.compactArrival?.() ? { i: gateTile(this.deps.rank()).i, j: 0 } : gateTile(this.deps.rank());
    const key=this.columnKey(this.deps.grid.at(i,j),i===gate.i&&j===gate.j,i,j),texture=this.deps.imagegenGround?.resolve(key)??{key};
    img.setTexture(texture.key,texture.frame);this.deps.imagegenGround?.flush();
    img.setDepth(groundDepth(i, j, this.noLiftForTest ? 0 : this.deps.grid.levelAt(i, j)));
    img.setY(gridToScreen(i, j).y + this.liftAt(i, j)); // P0-B: 풀을 파면 단이 0 으로 내려간다
    const tint = this.poolTint.get(j * this.deps.grid.w + i);
    const floor = this.deps.grid.at(i, j);
    this.setGroundOrigin(img, floor);
    this.deps.imagegenGround?.setWaterTile(this,img,FLOOR_NAMES[floor]??'sand',i,j,this.noLiftForTest?0:this.deps.grid.levelAt(i,j),FLOOR_NAMES[this.deps.grid.natural[j*this.deps.grid.w+i]!]??'sand');
    if (tint !== undefined && floor === FLOOR.pool) img.setTint(tint);
    else if (floor === FLOOR.deck && !this.deps.approved?.spec('tile/deck') && this.ringTint.has(j * this.deps.grid.w + i)) img.setTint(this.ringTint.get(j * this.deps.grid.w + i) as number); // P50-b2 등급별 폰툰 색
    else if (floor === FLOOR.indoor && this.courtTiles.has(j * this.deps.grid.w + i)) img.setTint(cssColorInt('--tile-foodcourt-tint') || 0xffffff); // P58-a: 식탁 영역은 실내 바닥에 아주 연하게 칠한 느낌
    else if (floor === FLOOR.grass) img.setTint(cssColorInt(`--grass-season-${this.season}`) || 0xffffff);
    else img.clearTint();
    { const land = this.landForTint ?? landRect(this.deps.rank()); const out = j >= CITY_BAND && !isWaterCode(floor) && floor !== FLOOR.deck && !(i >= land.i0 && i < land.i0 + land.w && j >= land.j0 && j < land.j0 + land.h); if (out) { const t = img.tintTopLeft; const r = Math.round(((t >> 16) & 255) * 0.82), g2 = Math.round(((t >> 8) & 255) * 0.82), b = Math.round((t & 255) * 0.82); img.setTint((r << 16) | (g2 << 8) | b); } }
  }

  /** 이 칸의 시설 uid — 탭 판정 */
  facilityAt(i: number, j: number): PlacedFacility | null {
    return this.facilitiesRef.find((f) => {
      const def = this.facDefOf?.(f);
      if (!def) return false;
      const w = f.facing === 1 ? def.d : def.w;
      const d = f.facing === 1 ? def.w : def.d;
      return i >= f.i && j >= f.j && i < f.i + w && j < f.j + d;
    }) ?? null;
  }

  /** 검증용 — 타일 하나의 텍스처 키 */
  tileTextureAt(i: number, j: number): string | null {
    return this.tiles[j * this.deps.grid.w + i]?.texture.key ?? null;
  }

  /** 타일의 화면(캔버스 CSS px) 사각형 — 하네스가 진짜 터치 좌표를 만들 때 쓴다 */
  tileScreenRect(i: number, j: number): { x: number; y: number; w: number; h: number } {
    const v = this.cam.view();
    const p = gridToScreen(i, j);
    const s = v.scale;
    return { x: (p.x - 16 - v.scrollX) * s, y: (p.y + this.liftAt(i, j) - v.scrollY) * s, w: 32 * s, h: 16 * s }; // P0-B: 올라간 칸은 위에 있다
  }

  focusTile(i: number, j: number, bottomInsetCss = 0): void {
    this.cam.centerOn(tileCenter(i, j), bottomInsetCss);
    this.syncCamera();
  }

  setUpscale(s: Upscale): void {
    this.cam.setUpscale(s);
    this.applyScale(s);
  }

  fx(name: FxName, t: FxTarget): void {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    playFx({ scene: this, reduced }, name, t);
  }

  // ── G1: 풀 · 손님 · 선택 · 낮밤 ─────────────────────────────────

  /** 풀 타일 집합이 바뀌었다 — 물 반짝임이 그 위에만 그려진다 */
  setPoolTiles(tiles: readonly number[]): void {
    // P0: 강 칸도 반짝인다 — 풀 목록에 강·여울 칸을 더해 한 층으로 그린다
    const g = this.deps.grid;
    const river: number[] = [];
    for (let k = 0; k < g.floor.length; k++) if (g.floor[k] === FLOOR.river) river.push(k);
    const all = river.length ? [...tiles, ...river] : tiles;
    this.pendingPoolTiles = all;
    this.water?.setTiles(all, g.w);
  }

  /** 손님 목록 참조 — 매 프레임 여기서 읽어 스프라이트를 맞춘다 */
  setStaff(list: readonly Staff[]): void {
    this.staffRef = list;
  }

  /** 직원 (G20) — v8 손님 도트를 **역할마다 고정 룩**(`staffNpcSeed`)으로 빌려 그린다 (걷기/서기). 머리 위엔 별 배지. v8 이 없으면 옛 절차 도트 */
  private syncStaff(): void {
    const keep = new Set<number>();
    const palOf: Record<string, number> = { lifeguard: 0, cleaner: 3, mascot: 2, cook: 7 };
    for (const s of this.staffRef) {
      keep.add(s.uid);
      const moving = s.progress < 1;
      const v8 = npcV8Key(staffNpcSeed(s.role), s.facing, moving ? 'walk' : 'idle', this.time.now, 'happy');
      const frame = moving ? Math.floor(this.animFrame / 7) % 2 : 0;
      const key = this.deps.provider.spec(v8) ? v8 : `guest/body:${palOf[s.role] ?? 1}/${moving ? 'walk' : 'idle'}/${frame}/happy`;
      if (!this.textures.exists(key)) { const c = this.deps.provider.canvas(key); if (c) this.textures.addCanvas(key, c); }
      let img = this.staffImgs.get(s.uid);
      if (!img) { img = this.add.image(0, 0, key).setOrigin(GUEST_ANCHOR.x / GUEST_W, GUEST_ANCHOR.y / GUEST_H); this.staffImgs.set(s.uid, img); }
      else if (img.texture.key !== key) img.setTexture(key);
      const native = key.startsWith('guest/v8/');
      const spec = native ? this.deps.provider.spec(key) : null; // v8 프레임은 원점이 spec.ax/ay — GUEST_ANCHOR 고정 원점이 아니다
      img.setOrigin(spec ? spec.ax / spec.w : GUEST_ANCHOR.x / GUEST_W, spec ? spec.ay / spec.h : GUEST_ANCHOR.y / GUEST_H);applyNpcDensity(img,spec);
      const a = tileCenter(s.fromI, s.fromJ); const b = tileCenter(s.i, s.j);
      img.setPosition(Math.round(a.x + (b.x - a.x) * s.progress), Math.round(a.y + (b.y - a.y) * s.progress + this.liftAt(s.i, s.j)));
      img.setFlipX(!native && (s.facing === 1 || s.facing === 2)); // v8 키는 mirror 를 키에 담는다
      img.setDepth(spanDepthKey(s.fromI, s.fromJ, s.i, s.j) + Z_GUEST);
    }
    for (const [uid, img] of this.staffImgs) { if (keep.has(uid)) continue; img.destroy(); this.staffImgs.delete(uid); }
  }

  setGuests(list: readonly Guest[]): void {
    this.guestsRef = list;
  }

  /** 포즈는 상태 + 서 있는 시설에서 파생한다 (G26): 라운지 = lie(의자류)/sit(테이블·소파) · 슬라이드 = ride · 탑 위 = idle */
  private guestPose(g: Guest): GuestPose {
    if(g.prep)return g.prep.phase==='using' || g.prep.phase==='approach' && g.progress>=1?'idle':'walk';
    if(g.state==='enter' && (g.arrivalStep??0)>=3 && (g.preparationStep??0)<3 && g.progress>=1)return 'idle';
    if (g.portal && g.portal.phase !== 'inside') return 'walk';
    if (g.state === 'swim') return 'swim';
    if (g.state === 'ride') return 'ride';
    if ((g.state === 'wander' && g.progress < 1) || g.state === 'walk' || g.state === 'leave' || (g.state === 'enter' && g.arrivalStep !== undefined)) return 'walk';
    if (g.state === 'use' && this.facDefOf) {
      const tg = g.target;
    const f = tg && tg.kind === 'facility' ? this.facilitiesRef.find((x) => x.uid === tg.uid) : undefined;
      const def = f ? this.facDefOf(f) : null;
      if (def && def.class === 'lounging') return /chair|cabana|parasol|pyeongsang|sunbed|shade_net|camp_site|hammock/.test(def.id) ? 'lie' : 'sit'; // P14: 레거시 평상·선베드·그늘막·캠핑은 눕는다
    }
    return 'idle';
  }

  private guestKey(g: Guest): string {
    const pose = this.guestPose(g);
    // Keep the approved identity through age, rental equipment and activity changes.
    const native = npcV8Key(g.uid, g.facing, pose, this.time.now, moodOf(g));
    if (this.deps.provider.spec(native)) return native;
    const frames = GUEST_FRAMES[pose];
    const frame = frames === 1 ? 0 : Math.floor(this.animFrame / (pose === 'swim' ? 14 : pose === 'ride' ? 5 : 7)) % frames;
    return guestTextureKey(g.palette, buildOf(g), pose === 'swim' || pose === 'ride' ? g.float : 0, pose, frame, moodOf(g));
  }

  /** 슬라이드 위 높이 — 탑(levels×8)에서 활강로를 따라 0 까지 내려온다 (drawLanes 와 같은 식) */
  private slideLift(g: Guest): number {
    if ((g.state !== 'climb' && g.state !== 'ride') || !this.facDefOf) return 0;
    const tg = g.target;
    const f = tg && tg.kind === 'facility' ? this.facilitiesRef.find((x) => x.uid === tg.uid) : undefined;
    const def = f ? this.facDefOf(f) : null;
    if (!f || !def || !def.slide) return 0;
    const drop = def.slide.levels * 8;
    const n = FacilityStore.lane(def, f.i, f.j, f.facing).length;
    if (g.state === 'climb') return Math.round(drop * g.progress);
    const from = drop * (1 - g.rideIdx / (n + 1));
    const to = drop * (1 - (g.rideIdx + 1) / (n + 1));
    return Math.round(from + (to - from) * g.progress);
  }

  private guestWorld(g: Guest): { x: number; y: number } {
    if(g.prep && g.prep.phase!=='approach'){const p=prepPosition(g.prep);return gridToScreen(p[0],p[1]);}
    if (g.portal) {
      const pose = portalPosition(g.portal), p = gridToScreen(pose.i, pose.j);
      const f = this.facilitiesRef.find(f => f.uid === g.portal!.uid);
      return { x: p.x, y: p.y - pose.z * Math.sqrt(512) * Math.cos(Math.PI / 6) + this.liftAt(f?.i ?? g.i, f?.j ?? g.j) };
    }
    const a = tileCenter(g.fromI, g.fromJ);
    const b = tileCenter(g.i, g.j);
    const t = g.progress;
    const contactLift = (i: number, j: number): number => this.liftAt(i, j) - (this.deps.approved?.spec('tile/deck') && this.deps.grid.at(i, j) === FLOOR.deck ? .22 * Math.sqrt(512) * Math.cos(Math.PI / 6) : 0);
    const lz = contactLift(g.fromI, g.fromJ) + (contactLift(g.i, g.j) - contactLift(g.fromI, g.fromJ)) * t; // P0-B: 두 칸 사이 보간
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - this.slideLift(g) + lz };
  }

  private guestDepth(g: Guest): number {
    if(g.prep && g.prep.phase!=='approach'){
      const f=this.facilitiesRef.find(f=>f.uid===g.prep!.uid);
      // Locker art is a single long facade; all four contacts are on its front apron.
      if(f?.defId==='compact_locker')return depthKey(f.i+3,f.j+1)+Z_GUEST;
      const p=prepPosition(g.prep);return depthKey(p[0]-.5,p[1]-.5)+Z_GUEST;
    }
    // The whole facade sorts at the footprint front corner; exterior actors and
    // their overlays must share that plane until hidden at the door threshold.
    const f = g.portal && this.facilitiesRef.find(f => f.uid === g.portal!.uid);
    const def = f && this.facDefOf?.(f);
    const depth = f && def
      ? depthKey(f.i + (f.facing ? def.d : def.w) - 1, f.j + (f.facing ? def.w : def.d) - 1)
      : spanDepthKey(g.fromI, g.fromJ, g.i, g.j);
    return depth + Z_GUEST;
  }

  private guestHidden(g: Guest): boolean {
    return !!this.prepRenderer?.hiddenGuestIds.has(g.uid) || portalHidden(g) || !!this.rideRenderer?.hiddenGuestIds.has(g.uid) || !!this.staticRenderer?.hiddenGuestIds.has(g.uid);
  }

  private syncGuests(): void {
    const seen = new Set<number>();
    for (const g of this.guestsRef) {
      if (this.guestHidden(g)) { seen.add(g.uid); this.guestImgs.get(g.uid)?.setVisible(false); continue; }
      this.guestImgs.get(g.uid)?.setVisible(true);
      seen.add(g.uid);
      let img = this.guestImgs.get(g.uid);
      const key = this.guestKey(g);
      if (!this.textures.exists(key)) {
        const c = this.deps.provider.canvas(key);
        if (c) this.textures.addCanvas(key, c);
      }
      if (!img) {
        img = this.add.image(0, 0, key).setOrigin(GUEST_ANCHOR.x / GUEST_W, GUEST_ANCHOR.y / GUEST_H);
        this.guestImgs.set(g.uid, img);
      } else if (img.texture.key !== key) {
        img.setTexture(key);
      }
      const native = key.startsWith('guest/v8/');
      const spec = native ? this.deps.provider.spec(key) : null;
      img.setOrigin(spec ? spec.ax / spec.w : GUEST_ANCHOR.x / GUEST_W, spec ? spec.ay / spec.h : GUEST_ANCHOR.y / GUEST_H);applyNpcDensity(img,spec);
      const p = this.guestWorld(g);
      // 대기 줄 (G34) — 같은 칸에 선 사람들을 뒤로 한 명씩 비켜 세운다
      const qx = g.state === 'queue' ? -6 * g.queuePos : 0; const qy = g.state === 'queue' ? 4 * g.queuePos : 0;
      img.setPosition(Math.round(p.x + qx), Math.round(p.y + qy + (native ? 0 : g.state === 'swim' ? 4 : g.state === 'use' && !g.portal && g.progress >= 1 ? -2 : 0)));
      img.setFlipX(!native && (g.facing === 1 || g.facing === 2));
      img.setDepth(this.guestDepth(g) + (g.state === 'climb' || g.state === 'ride' ? 1 : 0));
    }
    for (const [uid, img] of this.guestImgs) {
      if (seen.has(uid)) continue;
      img.destroy();
      this.guestImgs.delete(uid);
    }
    this.syncEmotes();
    this.syncGauges();
    this.syncHp();
    this.syncStaff();
  }

  /** HP 배터리 (G26, R4) — hp < 30 이면 머리 위. 이모트·게이지가 있으면 그 위로 밀린다 */
  private syncHp(): void {
    const keep = new Set<number>();
    const key = 'icon/hp-low';
    for (const g of this.guestsRef) {
      if (this.guestHidden(g) || g.hp >= WaterparkScene.HP_ICON_BELOW || g.state === 'leave') continue;
      keep.add(g.uid);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawBattery());
      let img = this.hpImgs.get(g.uid);
      if (!img) { img = this.add.image(0, 0, key).setOrigin(0.5, 1); this.hpImgs.set(g.uid, img); }
      const p = this.guestWorld(g);
      const lift = (g.emote && g.emoteTtl > 0 ? 12 : 0) + (g.friendId ? 8 : 0);
      img.setPosition(Math.round(p.x), Math.round(p.y - GUEST_ANCHOR.y - 2 - lift));
      img.setDepth(this.guestDepth(g) + 1);
    }
    for (const [uid, img] of this.hpImgs) { if (keep.has(uid)) continue; img.destroy(); this.hpImgs.delete(uid); }
  }

  private busImg: Phaser.GameObjects.Image | null = null;
  private busRef: BusState | null = null;
  private busRoad: { i0: number; i1: number; iStop: number; j: number } | null = null;
  /** 도로 띠 — 토지 아래 두 칸, 게이트 앞에 선다 (G33). 토지가 바뀌면 다시 준다 */
  setBusRoad(gate: { i: number; j: number }, land: { i0: number; w: number }): void {
    void land; this.busRoad = { i0: -3, i1: GW + 2, iStop: gate.i, j: this.deps.compactArrival?.() ? -1 : ROAD_ROWS[1] as number }; // P43: 도시 띠의 차도(둘째 줄) — 지도 전폭을 달린다
  }
  setBus(state: BusState | null): void {
    this.busRef = state;
    this.syncBus();
  }
  private syncBus(): void {
    const bs = this.busRef; const road = this.busRoad;
    if (!bs || !road || !this.sys.isActive()) { if (this.busImg) { this.busImg.destroy(); this.busImg = null; } return; }
    if (!this.busImg) { const bk = this.busTexture(true); this.busImg = this.add.image(0, 0, bk).setOrigin(0.5, bk === 'bus/0' ? (BUS_H - 2) / BUS_H : .72).setScale(.65).setFlipX(bk !== 'bus/0'); }
    const fi = bs.phase === 'in' ? road.i0 + (road.iStop - road.i0) * bs.t : bs.phase === 'stop' ? road.iStop : road.iStop + (road.i1 - road.iStop) * bs.t;
    const a = tileCenter(Math.floor(fi), road.j); const b = tileCenter(Math.floor(fi) + 1, road.j);
    const f = fi - Math.floor(fi);
    this.busImg.setPosition(Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f + (this.deps.compactArrival?.() ? 0 : this.liftAt(Math.round(fi), road.j))));
    this.busImg.setDepth(depthKey(Math.round(fi), road.j) + Z_GUEST);
    void BUS_W;
  }
  /** 검사용 — 차도 줄 (P43: 도시 띠 둘째 차도) */
  busRoadForTest(): { j: number; i0: number; i1: number } | null { return this.busRoad ? { j: this.busRoad.j, i0: this.busRoad.i0, i1: this.busRoad.i1 } : null; }
  /** 검사용 — 도로 위 버스 위치 */
  busForTest(): { x: number; y: number; phase: string } | null { return this.busImg && this.busRef ? { x: this.busImg.x, y: this.busImg.y, phase: this.busRef.phase } : null; }

  private lightsRect: Phaser.GameObjects.Rectangle | null = null;
  /** 겨울 저녁 조명 틴트 (G27) — 남색을 얇게 덮는다. 낮밤 틴트와 별개의 사각형 */
  setIllumination(on: boolean): void {
    if (!this.lightsRect) this.lightsRect = this.add.rectangle(0, 0, 4, 4, 0, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH_SCREEN_FX - 2);
    this.lightsRect.setFillStyle(cssColorInt('--tint-winter-night'), on ? 0.16 : 0);
    this.lightsRect.setSize(this.cam.bufferSize().w, this.cam.bufferSize().h);
  }
  illuminationOn(): boolean { return (this.lightsRect?.fillAlpha ?? 0) > 0; }

  /** 검사용 — 화면에 있는 직원 스프라이트 수 (G20 절이 부른다) */
  staffCountForTest(): number { return this.staffImgs.size; }

  /** 검사용 — HP 아이콘 수 */
  hpIconCountForTest(): number { return this.hpImgs.size; }

  /** 친구 머리 위 만족 게이지 (G23, PSS 의 ★14 막대) — 이름 있는 손님만 */
  private syncGauges(): void {
    const keep = new Set<number>();
    for (const g of this.guestsRef) {
      if (this.guestHidden(g) || !g.friendId) continue;
      keep.add(g.uid);
      const lvl = Math.max(0, Math.min(10, Math.round(g.sat / 10)));
      const key = `gauge/${lvl}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawGauge(lvl));
      let img = this.gaugeImgs.get(g.uid);
      if (!img) { img = this.add.image(0, 0, key).setOrigin(0.5, 1); this.gaugeImgs.set(g.uid, img); }
      else if (img.texture.key !== key) img.setTexture(key);
      const p = this.guestWorld(g);
      const lift = g.emote && g.emoteTtl > 0 ? 12 : 0;
      img.setPosition(Math.round(p.x), Math.round(p.y - GUEST_ANCHOR.y - 2 - lift));
      img.setDepth(this.guestDepth(g) + 1);
    }
    for (const [uid, img] of this.gaugeImgs) { if (keep.has(uid)) continue; img.destroy(); this.gaugeImgs.delete(uid); }
  }

  private borderImgs: Phaser.GameObjects.Image[] = [];
  private woodlandPlants: WoodlandPlant[] = [];
  private surround: Surround | null = null;
  surroundCountForTest(): number { return this.surround?.count() ?? 0; }
  /** Render stable individual woodland plants and the surrounding town.
   * Terrain/facility clearance filters the same candidates on each redraw. */
  drawBorder(land: { i0: number; j0: number; w: number; h: number }, gate?: { i: number; j: number }): void {
    for (const im of this.borderImgs) im.destroy();
    // A rebuild can replace every image while keeping the same child count.
    // Invalidate the art pass so fresh legacy placeholders are upgraded too.
    this.imagegenChildren = -1;
    this.borderImgs = [];
    this.woodlandPlants = [];
    this.surround?.build(this.deps.compactArrival?.() ?? false,this.season);
    this.deps.imagegenGround?.flush();
    const gt = gate ?? gateTile(this.deps.rank());
    const stopRow = gt.j === 0 ? 0 : STOP_ROW;
    const approvedTrees = ['fac/env_deciduous/0', 'fac/env_pine/0', 'fac/env_shrubs/0'];
    const keys = approvedTrees.every(k => this.deps.provider.spec(k)) ? approvedTrees : ['fac/banana_tree/0', 'fac/pine/0', 'fac/ficus/0'];
    for (const k of keys) if (!this.textures.exists(k)) { const c = this.deps.provider.canvas(k); if (c) this.textures.addCanvas(k, c); }
    const grid = this.deps.grid;
    const inLand = (i: number, j: number): boolean => i >= land.i0 && i < land.i0 + land.w && j >= land.j0 && j < land.j0 + land.h;
    const put = (plant: WoodlandPlant): void => {
      const {i,j,kind:n}=plant;
      const key = keys[n % keys.length] as string;
      if (!this.textures.exists(key)) return;
      const outside=!grid.inside(i,j),edge=outside?exteriorTile(grid,i,j,gt.j===0):null;
      const c0 = edge?.floor ?? grid.at(i, j);
      if (![FLOOR.grass,FLOOR.rock].includes(c0 as 1|14) || this.facilitiesRef.some(f=>FacilityStore.footprint(this.facDefOf!(f),f.i,f.j,f.facing).some(t=>Math.abs(t.i-i)<=2&&Math.abs(t.j-j)<=2)) || isIndoorCode(c0) || (gt.j === 0 && i >= gt.i - 5 && i <= gt.i + 5 && j < 8) || isWaterCode(c0) || c0 === FLOOR.deck || c0 === FLOOR.road || c0 === FLOOR.sidewalk) return; // P2: 경계 나무는 물·데크 위에 안 선다
      const c = tileCenter(i, j);
      const img = this.add.image(c.x, c.y + TILE_H / 2 + (edge?lift(edge.level):this.liftAt(i, j)), key).setOrigin(0.5, 1).setDepth(Math.max(0,depthKey(i, j)) + Z_GUEST - 1);
      img.setScale(plant.scale).setData('woodlandId',plant.id);
      this.woodlandPlants.push(plant);
      this.borderImgs.push(img);
    };
    for(const plant of woodlandLayout(grid.w,grid.h)){
      if(inLand(plant.i,plant.j))continue;
      // Keep a grass verge beside paths, river banks and roads, not trunks at their edges.
      let clear=true;
      for(let dj=-1;dj<=1&&clear;dj++)for(let di=-1;di<=1;di++){
        const i=plant.i+di,j=plant.j+dj;
        const floor=grid.inside(i,j)?grid.at(i,j):exteriorTile(grid,i,j,gt.j===0).floor;
        if(floor!==FLOOR.grass&&floor!==FLOOR.rock){clear=false;break;}
      }
      if(clear)put(plant);
    }
    // ⑤ P44-d 임시 바깥 장식(sim 밖, 그림은 기존 시설 스프라이트를 빌린다 — 에셋이 오면 교체): 정류장 표지, 가로등, 길 건너 건물 줄, 들판의 이웃 숙소 (주차장은 뺐다 — 사용자)
    const decor = (key: string, i: number, j: number, oy = 1, dz = Z_GUEST - 1): void => {
      if (!this.textures.exists(key)) { const c = this.deps.provider.canvas(key); if (c) this.textures.addCanvas(key, c); }
      if (!this.textures.exists(key)) return;
      const c = tileCenter(i, j);
      const img = this.add.image(c.x, c.y + TILE_H / 2 + (this.deps.grid.inside(i, j) ? this.liftAt(i, j) : 0), key).setOrigin(0.5, oy).setDepth(depthKey(i, j) + dz);
      this.borderImgs.push(img);
    };
    if (!this.textures.exists('busstop/0')) this.textures.addCanvas('busstop/0', drawBusStop());
    const has = (k: string): boolean => { if (!this.textures.exists(k)) { const c = this.deps.provider.canvas(k); if (c) this.textures.addCanvas(k, c); } return this.textures.exists(k); };
    if (!has('fac/env_street_lamp/0') && !this.textures.exists('lamp/0')) this.textures.addCanvas('lamp/0', drawLamp()); // P57-b: main 가로등이 없으면 절차 가로등
    decor('busstop/0', gt.i + 3, stopRow);
    if(gt.j!==0)decor('fac/env_car/1', gt.i + 8, stopRow);
    for (let i = 4; i < grid.w; i += 8) decor(has('fac/env_street_lamp/0') ? 'fac/env_street_lamp/0' : 'lamp/0', i, stopRow); // 보도 가로등
    // 길 건너(격자 위, 줄 −4~−1 은 Surround 잔디) — 마을 건물 줄: 펜션·복층 펜션·창고·안내소를 번갈아
    // P57-b: main 의 마을 건물 6(단독주택·2층 상가·펜션·소형 호텔·편의점·관리창고)이 있으면 그것, 없으면 옛 빌린 그림
    const envTown = ['fac/env_village_house/0', 'fac/env_village_shop/0', 'fac/env_pension/0', 'fac/env_small_hotel/0', 'fac/env_convenience_store/0', 'fac/env_maintenance_shed/0'];
    const town = envTown.every(has) ? envTown : ['fac/pension/0', 'fac/storage/0', 'fac/pension_duplex/0', 'fac/info/0', 'fac/bungalow/0'];
    let tn = 0;
    for (const b of TOWN_BUILDINGS) {
      decor(town[tn % town.length] as string,b.i,gt.j===0?b.j:-3);
      if(gt.j===0){
        const lot=TOWN_LOTS[tn]!;
        for(const [di,j] of lot.benches)decor('fac/env_bench/0',b.i+di,j);
        for(const [di,j] of lot.pots)decor('fac/env_flower_pot/0',b.i+di,j);
        for(const [di,j] of lot.trees)decor('fac/env_deciduous/0',b.i+di,j);
        if(lot.lamp)decor('fac/env_street_lamp/0',b.i+lot.lamp[0],lot.lamp[1]);
        // Side gardens frame selected lots, leaving the benches and alleys open.
        for(const [di,row,d] of lot.garden){
          const garden=this.deps.compactBoundary?.get(`garden-${d}`);
          if(!garden)continue;
          const key=`town/garden-${d}`;if(!this.textures.exists(key))this.textures.addImage(key,garden.image);
          const i=b.i+di+.5,j=row+.5,p=gridToScreen(i,j);
          this.borderImgs.push(this.add.image(p.x-96,p.y-107.75755076535926,key).setOrigin(0,0).setDepth(Math.max(0,depthKey(i,j))+Z_GUEST-1));
        }
        if(lot.car)decor('fac/env_car/1',b.i+lot.car[0],lot.car[1]);
      }
      tn++;
    }
    if(gt.j===0)this.buildTown();
    // 들판의 이웃 빠지·펜션(마당 좌우 멀찍이) — 확장하면 마당이 삼킨다(그림뿐이라 충돌 없음)
    // P57-h: 들판의 이웃 건물 4채(펜션·단독주택·호텔·창고)는 뺀다 — 마을 건물은 길 건너 한 줄이면 충분(사용자 「복잡함」 원인 D)
    this.landForTint = land;
    this.refreshImagegenSprites();
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) this.refreshTile(i, j); // P44-c 토지 밖 어둡게(레거시 setLand)
  }
  private landForTint: { i0: number; j0: number; w: number; h: number } | null = null;


  /** 검사용 — 경계 나무 수 */
  borderCountForTest(): number { return this.borderImgs.length; }
  /** P57-b 검사용 — 바깥 장식 중 main env 그림을 쓰는 수 */
  borderEnvCountForTest(): number { return this.borderImgs.filter((im) => im.texture.key.startsWith('fac/env_')).length; }

  /** 검사용 — 지금 떠 있는 친구 게이지 수 */
  gaugeCountForTest(): number { return this.gaugeImgs.size; }

  /** 타일 주변을 찍어 48×32 캔버스로 (SNS 타임라인 썸네일, G23). 화면 밖이면 null */
  snapshotAt(i: number, j: number, cb: (c: HTMLCanvasElement | null) => void): void {
    const c = tileCenter(i, j);
    const v = this.cam.view();
    // Logical crop coordinates become framebuffer pixels at renderDensity.
    const sx = Math.round((c.x - 24 - v.scrollX) * this.renderDensity);
    const sy = Math.round((c.y - 28 - v.scrollY) * this.renderDensity);
    const w = 48 * this.renderDensity; const h = 32 * this.renderDensity;
    const cw = this.game.canvas.width; const ch = this.game.canvas.height;
    if (sx < 0 || sy < 0 || sx + w > cw || sy + h > ch) { cb(null); return; }
    this.game.renderer.snapshotArea(sx, sy, w, h, (img) => {
      if (!(img instanceof HTMLImageElement)) { cb(null); return; }
      const out = document.createElement('canvas');
      out.width = 48; out.height = 32;
      const g = out.getContext('2d');
      if (!g) { cb(null); return; }
      g.imageSmoothingEnabled = this.renderDensity > 1;
      g.drawImage(img, 0, 0, 48, 32);
      cb(out);
    });
  }

  /** 머리 위 이모트 (G17) — `g.emote` 를 그대로 그린다 (누구에게 무엇이 뜨나는 sim 이 정한다). 동시 ≤ MAX_EMOTES */
  private syncEmotes(): void {
    const keep = new Set<number>();
    let n = 0;
    for (const g of this.guestsRef) {
      if (this.guestHidden(g) || !g.emote || g.emoteTtl <= 0 || n >= WaterparkScene.MAX_EMOTES) continue;
      n++;
      keep.add(g.uid);
      const key = `emote/${g.emote}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawEmote(g.emote));
      let img = this.emoteImgs.get(g.uid);
      if (!img) { img = this.add.image(0, 0, key).setOrigin(0.5, 1); this.emoteImgs.set(g.uid, img); }
      else if (img.texture.key !== key) img.setTexture(key);
      const p = this.guestWorld(g);
      const bob = Math.floor(this.animFrame / 10) % 2;
      img.setPosition(Math.round(p.x), Math.round(p.y - GUEST_ANCHOR.y - 2 - bob));
      img.setDepth(this.guestDepth(g) + 1);
    }
    for (const [uid, img] of this.emoteImgs) {
      if (keep.has(uid)) continue;
      img.destroy();
      this.emoteImgs.delete(uid);
    }
  }

  /** 손님의 화면 좌표 (CSS px) — 말풍선이 쓴다. 없으면 null */
  guestScreen(uid: number): { x: number; y: number } | null {
    const g = this.guestsRef.find((x) => x.uid === uid);
    if (!g || this.guestHidden(g)) return null;
    const p = this.guestWorld(g);
    const v = this.cam.view();
    return { x: (p.x - v.scrollX) * v.scale, y: (p.y - 24 - v.scrollY) * v.scale };
  }

  /** 이 칸 위(또는 걸친) 손님 — 탭 판정 */
  guestAt(i: number, j: number): Guest | null {
    return this.guestsRef.find((g) => !this.guestHidden(g) && ((g.i === i && g.j === j) || (g.progress < 1 && g.fromI === i && g.fromJ === j))) ?? null;
  }

  /** 시설 목록 참조 + 정의 조회 — 프레임마다 스프라이트를 맞춘다 */
  setFacilities(list: readonly PlacedFacility[], defOf: (f: PlacedFacility) => FacilityDef): void {
    this.facilitiesRef = list;
    this.facDefOf = defOf;
    this.deps.imagegenGround?.setDockCells(list.filter(f=>['dock','boarding_dock','boarding_dock2x1'].includes(f.defId)).flatMap(f=>FacilityStore.footprint(defOf(f),f.i,f.j,f.facing)));
    this.syncFacilities();
    this.refreshImagegenSprites();
  }

  private imagegenRevision=-1;
  private imagegenChildren=-1;
  private refreshImagegenSprites():void {
    if(this.imagegenRevision===imagegenArt.frames.size&&this.imagegenChildren===this.children.length)return;
    this.imagegenRevision=imagegenArt.frames.size;this.imagegenChildren=this.children.length;
    for(const child of this.children.list){
      if(!(child instanceof Phaser.GameObjects.Image))continue;
      const old=child.texture.key;if(!old.startsWith('fac/')&&old!=='tile/deck')continue;
      const hd=imagegenArt.get(old);if(!hd)continue;
      const key=`imagegen/${old}`;
      if(!this.textures.exists(key))this.textures.addCanvas(key,hd)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
      const w=child.displayWidth,h=child.displayHeight,info=imagegenArt.size(old)!,pad=info.pad??0,ox=child.originX,oy=child.originY;
      child.setTexture(key).setDisplaySize(w*(info.w+pad*2)/info.w,h*(info.h+pad*2)/info.h);
      if(pad)child.setOrigin((ox*info.w+pad)/(info.w+pad*2),(oy*info.h+pad)/(info.h+pad*2));
    }
  }
  private facilityTexture(def: FacilityDef, facing: 0 | 1): string {
    const original = `fac/${def.id}/${facing}`;
    const hd=imagegenArt.get(original);
    const key=hd?`imagegen/${original}`:original;
    if(hd&&!this.textures.exists(key)){this.textures.addCanvas(key,hd)?.setFilter(Phaser.Textures.FilterMode.LINEAR);}
    if (!this.textures.exists(key)) {
      const c = this.deps.provider.canvas(key);
      if (c) this.textures.addCanvas(key, c);
    }
    return key;
  }

  private placeFacilityImage(img: Phaser.GameObjects.Image, def: FacilityDef, i: number, j: number, facing: 0 | 1): void {
    const visual=imagegenArt.size(`fac/${def.id}/${facing}`);
    if(visual)img.setDisplaySize(visual.w+2*(visual.pad??0),visual.h+2*(visual.pad??0));
    const w = facing === 1 ? def.d : def.w;
    const d = facing === 1 ? def.w : def.d;
    const authored = this.deps.approved;
    const pivot = authored && approvedPivot(def.id, facing, authored.manifest);
    const anchor = authored && approvedAnchor(def.id, authored.manifest);
    const sprite = this.deps.provider.spec(`fac/${def.id}/${facing}`);
    if (pivot && anchor && sprite) {
      const p = gridToScreen(i + pivot[0],j + pivot[1]);
      img.setOrigin((anchor.ax+(visual?.pad??0))/(sprite.w+2*(visual?.pad??0)),(anchor.ay+(visual?.pad??0))/(sprite.h+2*(visual?.pad??0))).setPosition(p.x,p.y+this.liftAt(i,j));
      img.setDepth(depthKey(i+w-1,j+d-1)+Z_FACILITY);
      return;
    }
    const a = footprintAnchor(i, j, w, d);
    const size = facilityCanvasSize(def, facing);
    const ca = canvasAnchor(w, d, BODY_H[def.class]);
    const pad=visual?.pad??0;
    // Atlas art has its own canvas and ground anchor; procedural body height
    // cannot locate it once the art has a different height or transparent guard.
    const sourceW = visual?.w ?? sprite?.w ?? size.w;
    const sourceH = visual?.h ?? sprite?.h ?? size.h;
    img.setOrigin(((sprite?.ax ?? ca.x)+pad)/(sourceW+pad*2),((sprite?.ay ?? ca.y)+pad)/(sourceH+pad*2));
    img.setPosition(a.x, a.y + this.liftAt(i, j)); // P0-B: 발자국은 단이 균일하다 (level-mixed 거절)
    // 깊이 = 발자국의 가장 앞 칸
    img.setDepth(depthKey(i + w - 1, j + d - 1) + Z_FACILITY);
  }

  private syncFacilities(): void {
    if (!this.facDefOf || !this.selection) return;
    const seen = new Set<number>();
    for (const f of this.facilitiesRef) {
      seen.add(f.uid);
      const def = this.facDefOf(f);
      const key = this.facilityTexture(def, f.facing);
      let img = this.facImgs.get(f.uid);
      if (!img) {
        img = this.add.image(0, 0, key);
        this.facImgs.set(f.uid, img);
      } else if (img.texture.key !== key) img.setTexture(key);
      this.placeFacilityImage(img, def, f.i, f.j, f.facing);
      img.setVisible(!this.staticRenderer?.hiddenFacilityIds.has(f.uid) && !this.prepRenderer?.hiddenFacilityIds.has(f.uid));
      if (this.dimUids.has(f.uid)) img.setTint(cssColorInt('--rig-dim') || 0x55697c); else if (img.isTinted) img.clearTint(); // P50-b2 꺼짐 틴트 — 색은 토큰
    }
    for (const [uid, img] of this.facImgs) {
      if (seen.has(uid)) continue;
      img.destroy();
      this.facImgs.delete(uid);
    }
    if (this.facilitiesRef.length !== this.lastFacCount) { this.lastFacCount = this.facilitiesRef.length; this.drawLanes(); this.rebuildAmbient(); }
  }

  /** 슬라이드 활강로 — 발자국의 활강로 칸을 따라 반투명 튜브(하늘색 + 흰 하이라이트)를 긋는다 (G12) */
  private drawLanes(): void {
    const g = this.laneGfx;
    if (!g || !this.facDefOf) return;
    g.clear();
    for (const f of this.facilitiesRef) {
      const def = this.facDefOf(f);
      if (!def.slide) continue;
      const fp = FacilityStore.footprint(def, f.i, f.j, f.facing);
      const w = f.facing === 1 ? def.d : def.w;
      const d = f.facing === 1 ? def.w : def.d;
      const lane = fp.slice(w * d);
      const drop = def.slide.levels * 8; // 탑 높이에서 내려온다 (LEVEL_H 8)
      // 탑 가운데(높이 drop)에서 활강로 칸들을 지나 출구까지 이어진 튜브 — 외곽 → 몸통 → 하이라이트 세 번 긋는다 (G14)
      const exitSide = f.facing === 0 ? tileCenter(f.i + w - 1, f.j + Math.floor(d / 2)) : tileCenter(f.i + Math.floor(w / 2), f.j + d - 1);
      const pts: { x: number; y: number }[] = [{ x: exitSide.x, y: exitSide.y - drop }];
      lane.forEach((t, k) => {
        const c = tileCenter(t.i, t.j);
        pts.push({ x: c.x, y: c.y - Math.round(drop * (1 - (k + 1) / (lane.length + 1))) });
      });
      const stroke = (color: string, width: number, alpha: number, dy = 0): void => {
        g.lineStyle(width, cssColorInt(color), alpha);
        g.beginPath();
        pts.forEach((pt, k) => (k === 0 ? g.moveTo(pt.x, pt.y + dy) : g.lineTo(pt.x, pt.y + dy)));
        g.strokePath();
      };
      // 받침 기둥 먼저 (튜브 뒤로)
      pts.slice(1).forEach((pt, k) => {
        const c = tileCenter(lane[k]!.i, lane[k]!.j);
        g.fillStyle(cssColorInt('--fac-outline'), 0.8);
        g.fillRect(pt.x - 1, pt.y, 2, c.y - pt.y + 2);
      });
      stroke('--fac-outline', 8, 0.95);
      stroke('--fac-slide', 6, 1);
      stroke('--fac-slide-lit', 2, 0.95, -1);
    }
  }

  /** P57-d — 벽·문 그림(main 유리벽 4방향). 변마다 한 장: 서(−i) d1 · 북(−j) d0 · 동(+i) d3 · 남(+j) d2 (main `drawWallEdge` 의 `[3,2,1,0][dir]` 와 같다). 없으면 절차 면(P44-b) */
  private wallImgs: Phaser.GameObjects.Image[] = [];
  private wallArtKey(kind: 'glass_wall' | 'glass_door', d: 0 | 1 | 2 | 3): string | null {
    const slug = `${kind}-d${d}` as const; const img = this.deps.landscape?.get(slug); if (!img) return null;
    const key = `landscape/${slug}`; if (!this.textures.exists(key)) this.textures.addImage(key, img); return key;
  }
  private wallArt(i: number, j: number, front: boolean, kind: 'glass_wall' | 'glass_door', d: 0 | 1 | 2 | 3): boolean {
    const key = this.wallArtKey(kind, d); if (!key) return false;
    const c = tileCenter(i, j);
    this.wallImgs.push(this.add.image(c.x, c.y + this.liftAt(i, j), key).setOrigin(0.5, (96 + 11.7575626373291) / 192).setDepth(depthKey(i, j) + (front ? Z_WALL_FRONT : Z_WALL_BACK)));
    return true;
  }
  wallArtCountForTest(): number { return this.wallImgs.length; }
  private wallLayer(i: number, j: number, front: boolean): Phaser.GameObjects.Graphics {
    const key = `${j * this.deps.grid.w + i}|${front ? 'f' : 'b'}`;
    let g = this.wallLayers.get(key);
    if (!g) { g = this.add.graphics().setDepth(depthKey(i, j) + (front ? Z_WALL_FRONT : Z_WALL_BACK)); this.wallLayers.set(key, g); }
    return g;
  }
  private clearWallLayers(): void { for (const g of this.wallLayers.values()) g.destroy(); this.wallLayers.clear(); for (const im of this.wallImgs) im.destroy(); this.wallImgs = []; }
  /**
   * P44-b — 벽면 하나: 변(x0,y0)→(x1,y1) 위로 h 텍셀. 북·남 변은 빛 받는 면(`--wall-face`), 서·동 변은 그늘 면(`--wall-face-dark`) —
   * 한 톤이면 리본으로 읽힌다. 앞면(남·동)은 안이 비치게 반투명. 칸의 단(lift)을 같이 탄다
   */
  private wallFace(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, dark: boolean, front: boolean, h: number): void {
    g.fillStyle(cssColorInt(dark ? '--wall-face-dark' : '--wall-face'), front ? 0.6 : 1);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h); g.closePath(); g.fillPath();
    g.lineStyle(1, cssColorInt('--wall-top'), 0.95); g.beginPath(); g.moveTo(x0, y0 - h); g.lineTo(x1, y1 - h); g.strokePath();
    g.lineStyle(1, cssColorInt('--wall-top'), 0.5); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokePath();
  }
  private wallPost(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number): void { g.fillStyle(cssColorInt('--wall-top'), 1); g.fillRect(x - 1, y - h - 1, 3, h + 2); }

  /** 벽·울타리·문 전부 다시 그린다 — 세 진입점(drawWalls·drawFence·drawDoors)이 다 여기로 온다(층을 지우고 다시 세우므로 따로 그릴 수 없다) */
  private compactWallSignature = '';
  private compactWallKeys: string[] = [];
  private drawCompactWalls(): void {
    const grid = this.deps.grid, doors = grid.doors(), walls: BoundaryWall[] = [], tiles = new Set<string>();
    const inside = (i: number,j: number): boolean => isIndoorCode(grid.at(i,j)) || grid.at(i,j) === FLOOR.pool && this.indoorPool(i,j);
    for (let j=0;j<grid.h;j++) for(let i=0;i<grid.w;i++) if(inside(i,j)) {
      tiles.add(`${i},${j}`);
      for(const [di,dj,d] of [[0,-1,0],[-1,0,1],[0,1,2],[1,0,3]] as const) if(!inside(i+di,j+dj)) {
        // The ticket cabin occupies these two north-edge panels.
        if(j===3 && d===0 && (i===49 || i===50)) continue;
        walls.push({i,j,d,door:doors.some(v=>v.i===i && v.j===j && v.oi===i+di && v.oj===j+dj)});
      }
    }
    for(let i=44;i<52;i++) if(inside(i,7) && inside(i,8)) walls.push({i,j:7,d:2,door:i===48||i===49,partition:true});
    for(let j=3;j<8;j++) for(const [i,neighbor,d] of [[44,43,1],[51,52,3]] as const)
      if(inside(i,j) && inside(neighbor,j)) walls.push({i,j,d,door:false,partition:true});
    for(let i=44;i<52;i++) if(inside(i,2) && inside(i,3)) walls.push({i,j:3,d:0,door:i===48,partition:true});
    const signature=JSON.stringify(walls);if(signature===this.compactWallSignature)return;
    this.compactWallSignature=signature;this.clearWallLayers();
    for(const key of this.compactWallKeys)this.textures.remove(key);this.compactWallKeys=[];
    for(const [n,layer] of compactBoundaryLayers(this.deps.compactBoundary!,walls,tiles).entries()) {
      const key=`compact-boundary/${n}`;this.textures.addCanvas(key,layer.canvas);this.compactWallKeys.push(key);
      this.wallImgs.push(this.add.image(layer.x,layer.y,key).setOrigin(0,0).setDepth(layer.depth));
    }
    this.doorCount=doors.length;
  }
  private redrawWalls(): void {
    if (!this.wallsReady) return;
    if(this.deps.compactArrival?.() && this.deps.compactBoundary) { this.drawCompactWalls(); return; }
    this.clearWallLayers();
    const grid = this.deps.grid;
    const H = WALL_H;
    const doors = grid.doors();
    const isDoor = (i: number, j: number, a: number, b: number): boolean => doors.some((d) => d.i === i && d.j === j && d.oi === a && d.oj === b);
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        if (!isIndoorCode(grid.at(i, j))) continue;
        const p = gridToScreen(i, j); const lz = this.liftAt(i, j);
        const inside = (a: number, b: number): boolean => isIndoorCode(grid.at(a, b)) || (grid.at(a, b) === FLOOR.pool && this.indoorPool(a, b));
        const back = this.wallLayer(i, j, false), front = this.wallLayer(i, j, true);
        // 네 변: 서(−i) · 북(−j) 는 뒤, 동(+i) · 남(+j) 은 앞. 북·남 = 빛, 서·동 = 그늘
        if (!inside(i - 1, j)) { if (this.wallArt(i, j, false, isDoor(i, j, i - 1, j) ? 'glass_door' : 'glass_wall', 1)) { /* 그림 */ } else if (isDoor(i, j, i - 1, j)) { this.wallPost(back, p.x, p.y + lz, H); this.wallPost(back, p.x - TILE_W / 2, p.y + TILE_H / 2 + lz, H); } else this.wallFace(back, p.x, p.y + lz, p.x - TILE_W / 2, p.y + TILE_H / 2 + lz, true, false, H); }
        if (!inside(i, j - 1)) { if (this.wallArt(i, j, false, isDoor(i, j, i, j - 1) ? 'glass_door' : 'glass_wall', 0)) { /* 그림 */ } else if (isDoor(i, j, i, j - 1)) { this.wallPost(back, p.x, p.y + lz, H); this.wallPost(back, p.x + TILE_W / 2, p.y + TILE_H / 2 + lz, H); } else this.wallFace(back, p.x, p.y + lz, p.x + TILE_W / 2, p.y + TILE_H / 2 + lz, false, false, H); }
        if (!inside(i + 1, j)) { if (this.wallArt(i, j, true, isDoor(i, j, i + 1, j) ? 'glass_door' : 'glass_wall', 3)) { /* 그림 */ } else if (isDoor(i, j, i + 1, j)) { this.wallPost(front, p.x + TILE_W / 2, p.y + TILE_H / 2 + lz, H); this.wallPost(front, p.x, p.y + TILE_H + lz, H); } else this.wallFace(front, p.x + TILE_W / 2, p.y + TILE_H / 2 + lz, p.x, p.y + TILE_H + lz, true, true, H); }
        if (!inside(i, j + 1)) { if (this.wallArt(i, j, true, isDoor(i, j, i, j + 1) ? 'glass_door' : 'glass_wall', 2)) { /* 그림 */ } else if (isDoor(i, j, i, j + 1)) { this.wallPost(front, p.x - TILE_W / 2, p.y + TILE_H / 2 + lz, H); this.wallPost(front, p.x, p.y + TILE_H + lz, H); } else this.wallFace(front, p.x - TILE_W / 2, p.y + TILE_H / 2 + lz, p.x, p.y + TILE_H + lz, false, true, H); }
      }
    }
    // 문 표식 — 문 변의 가운데에 작은 마름모, 그 문이 난 층에 (P57-d: 유리문 그림이 있으면 마름모는 안 그린다 — 수는 그대로 센다)
    this.doorCount = 0;
    const artDoors = this.wallArtKey('glass_door', 0) !== null;
    for (const d of doors) {
      if (artDoors) { this.doorCount++; continue; }
      const front = d.oi > d.i || d.oj > d.j;
      const g = this.wallLayer(d.i, d.j, front);
      const a = gridToScreen(d.i, d.j), b = gridToScreen(d.oi, d.oj); const lz = this.liftAt(d.i, d.j);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + TILE_H / 2 + lz;
      g.fillStyle(cssColorInt('--wall-door'), 0.95);
      g.beginPath(); g.moveTo(mx, my - 4); g.lineTo(mx + 6, my); g.lineTo(mx, my + 4); g.lineTo(mx - 6, my); g.closePath(); g.fillPath();
      this.doorCount++;
    }
  }
  /** P39 D49 — 벽: 실내 덩어리의 외곽 변마다 벽면(부모 K25). 문 변은 기둥 둘 */
  drawWalls(): void { this.redrawWalls(); }
  /** P45-a — 마당 경계 그림은 없다(사용자: 좌우로 계속 넓어지는 마당에 경계를 그리면 「저기 밖엔 못 놓는다」로 읽힌다). 토지 밖은 어둡게(레거시)만 */
  drawFence(land: { i0: number; j0: number; w: number; h: number }, gate: { i: number; j: number }): void { void land; void gate; }
  /** P39 — 문 표식 */
  drawDoors(): void { this.redrawWalls(); }
  /**
   * P57-b — 북쪽 바깥 풍경 띠(main `buildBackdrop` 과 같은 자리): 먼 산은 줄 −36 부터 6줄·20칸 간격, 가까운 숲은 줄 −26 부터 5줄·17칸 간격.
   * 그림 한 장 = 24타일 폭(768px)·원점 y (384+11.76)/768 — 아래 절반은 투명이라 도시 띠 위 Surround 잔디와 겹쳐도 가리지 않는다. 깊이는 Surround(−100) 위·격자(≥0) 아래.
   */
  private landscapeImgs: Phaser.GameObjects.Image[] = [];
  private buildLandscape(): void {
    for (const im of this.landscapeImgs) im.destroy();
    this.landscapeImgs = [];
    const ls = this.deps.landscape;
    if (!ls) return;
    for (const [layer, slug, start, step, row, w, h] of [[0, 'mountain_far', -32, 20, -36, 24, 6], [1, 'forest_near', -22, 17, -26, 20, 5]] as const) {
      const img = ls.get(slug);
      if (!img) continue;
      const key = `landscape/${slug}`;
      if (!this.textures.exists(key)) this.textures.addImage(key, img);
      for (let i = start; i < GW; i += step) {
        const p = gridToScreen(i + w / 2, row + h / 2);
        this.landscapeImgs.push(this.add.image(p.x, p.y, key).setOrigin(0.5, (384 + 11.7575626373291) / 768).setDepth(-90 + layer));
      }
    }
  }
  landscapeCountForTest(): number { return this.landscapeImgs.length; }
  /** The accepted d2 bus shows its rear at lower-right (-I travel).
   * Mirrored d1 shows its front at lower-right (+I arrival). */
  private busTexture(forward = false): string {
    const k = forward ? 'fac/env_bus/1' : 'fac/env_bus/2';
    if (!this.textures.exists(k)) { const c = this.deps.provider.canvas(k); if (c) this.textures.addCanvas(k, c); }
    if (this.textures.exists(k)) return k;
    if (!this.textures.exists('bus/0')) this.textures.addCanvas('bus/0', drawBus());
    return 'bus/0';
  }
  private townMarks:Phaser.GameObjects.Graphics|null=null;
  private townSignals:Phaser.GameObjects.Graphics|null=null;
  private townSignalPhase:boolean|null=null;
  private townPeople:{img:Phaser.GameObjects.Image;route:{i:number;j:number}[];segment:number;progress:number;seed:number;crossing:boolean}[]=[];
  private buildTown():void {
    if(this.townMarks)return;
    const g=this.townMarks=this.add.graphics().setDepth(-70);
    const quad=(i:number,j:number,w:number,h:number,color:number)=>{g.fillStyle(color,1);g.fillPoints([gridToScreen(i,j),gridToScreen(i+w,j),gridToScreen(i+w,j+h),gridToScreen(i,j+h)],true);};
    for(const i of TOWN_CROSSINGS){for(let j=-2;j<0;j+=.4)quad(i,j,2,.2,0xf6f1d7);quad(i-1,-2,.12,2,0xf6f1d7);}
    for(const b of TOWN_BUILDINGS){
      const i=b.i+7,j=-8;quad(i,j,3,.08,0xe8e4c8);quad(i,j+3,3,.08,0xe8e4c8);for(let x=i;x<=i+3;x+=1.5)quad(x,j,.08,3,0xe8e4c8);
    }
    this.townSignals=this.add.graphics();
    for(let n=0;n<10;n++){
      const route=townWalkingLoop(n),tex=this.pathWalkerTexture();
      const img=this.add.image(0,0,tex.key).setOrigin(tex.origin.x,tex.origin.y);applyNpcDensity(img,this.deps.provider.spec(tex.key));
      this.townPeople.push({img,route,segment:n%4,progress:(n*.17)%1,seed:201+n,crossing:false});
    }
    const tex=this.pathWalkerTexture();this.townPeople.push({img:this.add.image(0,0,tex.key),route:[{i:48,j:-3},{i:48,j:0}],segment:0,progress:0,seed:215,crossing:true});
  }
  private townCarsMayGo():boolean {return trafficGreen(this.time.now)&&!this.townPeople.some(a=>a.crossing&&a.progress>0);}
  private stepTown(dtMs:number):void {
    if(!this.townMarks)return;
    const green=this.townCarsMayGo();
    if(this.townSignalPhase!==green){
      this.townSignalPhase=green;const g=this.townSignals!;g.clear();
      for(const i of TOWN_CROSSINGS)for(const [di,j] of [[-.5,-2.8],[2.5,.3]]){
        const p=tileCenter(i+di!,j!);g.lineStyle(1.5,0x515f58,1).lineBetween(p.x,p.y,p.x,p.y-19);
        g.fillStyle(0x33443e,1).fillRoundedRect(p.x-3,p.y-25,6,12,1);
        g.fillStyle(green?0x663b36:0xf36a4d,1).fillCircle(p.x,p.y-22,1.6);
        g.fillStyle(green?0x8dda81:0x375747,1).fillCircle(p.x,p.y-16,1.6);
      }
      g.setDepth(10000);
    }
    for(const actor of this.townPeople){
      const a=actor.route[actor.segment]!,b=actor.route[(actor.segment+1)%actor.route.length]!;
      const distance=Math.abs(b.i-a.i)+Math.abs(b.j-a.j);
      const waiting=actor.crossing&&actor.progress===0&&(green||this.time.now%16000>11000||this.traffic.some(t=>Math.abs(t.fi-48)<4));
      if(!waiting)actor.progress=Math.min(1,actor.progress+Math.min(dtMs,100)/1000*(actor.crossing?1:.7)/distance);
      const i=a.i+(b.i-a.i)*actor.progress,j=a.j+(b.j-a.j)*actor.progress,p=tileCenter(i,j);
      const facing=b.i>a.i?0:b.j>a.j?1:b.i<a.i?2:3;
      const key=npcV8Key(actor.seed,facing,waiting?'idle':'walk',this.time.now,'happy');
      if(!this.textures.exists(key)){const c=this.deps.provider.canvas(key);if(c)this.textures.addCanvas(key,c);}
      if(this.textures.exists(key)){actor.img.setTexture(key);const spec=this.deps.provider.spec(key)!;actor.img.setOrigin(spec.ax/spec.w,spec.ay/spec.h);applyNpcDensity(actor.img,spec);}
      actor.img.setPosition(p.x,p.y).setDepth(Math.max(0,depthKey(i,j))+Z_GUEST);
      if(actor.progress>=1){actor.progress=0;actor.segment=(actor.segment+1)%actor.route.length;}
    }
  }
  townForTest():{people:number;green:boolean;positions:{i:number;j:number;crossing:boolean}[]}{
    return {people:this.townPeople.length,green:this.townCarsMayGo(),positions:this.townPeople.map(a=>{const p=a.route[a.segment]!,q=a.route[(a.segment+1)%a.route.length]!;return {i:p.i+(q.i-p.i)*a.progress,j:p.j+(q.j-p.j)*a.progress,crossing:a.crossing};})};
  }

  /** P44-d — 도로 위 시내버스 한 대(장식, sim 밖). 시간이 멈춰도 돈다 — 도시는 내 빠지와 무관하게 산다 */
  private traffic: { img: Phaser.GameObjects.Image; row: number; fi: number; speed: number }[] = [];
  private buildTraffic(): void {
    for (const t of this.traffic) t.img.destroy();
    this.traffic = [];
    const bk = this.busTexture();
    const img = this.add.image(0, 0, bk).setOrigin(0.5, bk === 'bus/0' ? (BUS_H - 2) / BUS_H : .72).setScale(.65);
    this.traffic.push({ img, row: this.deps.compactArrival?.() ? -2 : ROAD_ROWS[0] as number, fi: GW+12, speed: -4.5 });
    if(this.deps.compactArrival?.()){
      const key='fac/env_car/0';if(!this.textures.exists(key)){const c=this.deps.provider.canvas(key);if(c)this.textures.addCanvas(key,c);}
      if(this.textures.exists(key))this.traffic.push({img:this.add.image(0,0,key).setOrigin(.5,.82).setScale(.8),row:-1,fi:-12,speed:3});
    }
    this.stepTraffic(0);
  }
  private stepTraffic(dtMs: number): void {
    for (const t of this.traffic) {
      t.fi=advanceTownVehicle(t.fi,t.speed,dtMs,!this.deps.compactArrival?.()||this.townCarsMayGo());
      if (t.fi > GW + 24) t.fi = -24;
      if (t.fi < -24) t.fi = GW+24;
      const a = tileCenter(Math.floor(t.fi), t.row); const b = tileCenter(Math.floor(t.fi) + 1, t.row);
      const f = t.fi - Math.floor(t.fi);
      t.img.setPosition(Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f));
      t.img.setDepth(Math.max(0,depthKey(Math.max(0, Math.min(GW - 1, Math.round(t.fi))), t.row)) + Z_GUEST);
      t.img.setVisible(t.fi > -22 && t.fi < GW + 22);
    }
  }
  trafficCountForTest(): number { return this.traffic.filter((t) => t.img.visible).length; }
  /** P57-b 검사용 — 도로 버스의 텍스처 키(`fac/env_bus/1` 이면 main 그림) */
  busTextureKeyForTest(): string { return this.traffic[0]?.img.texture.key ?? ''; }
  /** 검사용 — 벽 층 수 */
  wallLayerCountForTest(): number { return this.wallLayers.size; }
  doorCount = 0;
  doorCountForTest(): number { return this.doorCount; }
  private indoorPool(i: number, j: number): boolean {
    const k = j * this.deps.grid.w + i;
    return this.poolTint.has(k) && this.indoorPoolTiles.has(k);
  }

  private indoorPoolTiles = new Set<number>();
  /** P58-a — 푸드코트 칸(아주 연한 틴트) */
  private courtTiles = new Set<number>();
  setFoodCourtTiles(keys: ReadonlySet<number>): void { const before = this.courtTiles; this.courtTiles = new Set(keys); const w = this.deps.grid.w; for (const k of new Set([...before, ...this.courtTiles])) this.refreshTile(k % w, Math.floor(k / w)); }
  foodCourtTileCountForTest(): number { return this.courtTiles.size; }
  private lastFacCount = -1;

  /** 실내 풀 타일 집합 (벽을 풀 둘레로 안 긋게) */
  setIndoorPoolTiles(tiles: readonly number[]): void {
    this.indoorPoolTiles = new Set(tiles);
    this.drawWalls();
  }

  /** 계절 — 잔디 틴트 (봄 연두 · 여름 진초록 · 가을 주황 · 겨울 흰) */
  setSeason(season: number): void {
    if (this.season === season) return;
    this.season = season;
    for (let j = 0; j < this.deps.grid.h; j++) for (let i = 0; i < this.deps.grid.w; i++) this.refreshTile(i, j);
  }

  /** 고스트 — 배치 미리보기. null 이면 지운다 */
  /** `labelText` — 가격표 대신 쓸 글 (G55: 이동 중 「이동 · 무료」) */
  setGhost(def: FacilityDef | null, i: number, j: number, facing: 0 | 1, ok: boolean, labelText?: string): void {
    this.lastGhostLabel = def ? (labelText ?? '') : '';
    if (!this.selection) return;
    if (!def) {
      this.ghost?.destroy();
      this.ghost = null;
      this.aimGfx?.destroy(); this.aimGfx = null;
      this.aimLabelText = null;
      this.showSetStar([]); // P60-c: 세트 별도 고스트와 함께 진다
      this.showPathWalk([]); this.showEntryMarks([]); // P60-d: 주행·입수구 표식도 exit 에서 진다
      this.setSelection([]);
      return;
    }
    const key = this.facilityTexture(def, facing);
    if (!this.ghost) this.ghost = this.add.image(0, 0, key);
    else if (this.ghost.texture.key !== key) this.ghost.setTexture(key);
    this.placeFacilityImage(this.ghost, def, i, j, facing);
    this.ghost.setDepth(depthKey(i, j) + Z_GHOST + 4096 * 200);
    this.ghost.setAlpha(0.62);
    this.ghost.setTint(ok ? 0xffffff : cssColorInt('--fx-bad'));
    const reservation=reservedBounds(def,i,j,facing);
    const w = reservation.w;
    const d = reservation.h;
    i=reservation.i0;j=reservation.j0;
    const tiles: { i: number; j: number }[] = [];
    for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) tiles.push({ i: i + a, j: j + b });
    this.setSelection(tiles, !ok);
    // 화살표 4 — 발자국 다이아몬드의 네 변 바깥에 초록 삼각형 (원작: 놓을 자리를 화살표가 감싼다)
    if (!this.aimGfx) this.aimGfx = this.add.graphics().setDepth(DEPTH_AIM_MARK + 1);
    const g = this.aimGfx;
    g.clear();
    const lz0 = this.liftAt(i, j);
    const top = { ...gridToScreen(i, j) }; const right = { ...gridToScreen(i + w, j) }; const bottom = { ...gridToScreen(i + w, j + d) }; const left = { ...gridToScreen(i, j + d) };
    top.y += lz0; right.y += lz0; bottom.y += lz0; left.y += lz0;
    g.lineStyle(1,cssColorInt(ok?'--fx-ok':'--fx-bad'),.8);
    g.strokePoints([top,right,bottom,left],true);
    const mid = (p: { x: number; y: number }, q: { x: number; y: number }): { x: number; y: number } => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const cx = (top.x + bottom.x) / 2; const cy = (top.y + bottom.y) / 2;
    g.fillStyle(cssColorInt(ok ? '--fx-ok' : '--fx-bad'), 0.95);
    g.lineStyle(1, cssColorInt('--fac-outline'), 0.9);
    for (const m of [mid(top, right), mid(right, bottom), mid(bottom, left), mid(left, top)]) {
      const dx = m.x - cx; const dy = m.y - cy; const len = Math.hypot(dx, dy) || 1; const ux = dx / len; const uy = dy / len;
      const tip = { x: m.x + ux * 12, y: m.y + uy * 12 }; const base = { x: m.x + ux * 4, y: m.y + uy * 4 };
      const px = -uy * 5; const py = ux * 5;
      g.fillTriangle(tip.x, tip.y, base.x + px, base.y + py, base.x - px, base.y - py);
      g.strokeTriangle(tip.x, tip.y, base.x + px, base.y + py, base.x - px, base.y - py);
    }
    // 가격표 — 고스트 위 「1,200G ×1」
    const label = labelText ?? `${def.cost.toLocaleString('ko-KR')}G ×1`;
    this.aimLabelText = label; // P59-c 후속(2026-09-18): 고정 가격표 Text 는 그리지 않는다 — P56-a D7 의 `price-pop` FX(지도 위 「N G ×1」)와 같은 문구가 두 번 떴고, 고정 라벨은 캔버스 높이만큼 위에 떠 있었다. 하네스는 텍스트만 읽는다
  }
  /** 검사용 — 조준 화살표·가격표가 떠 있나 */
  aimForTest(): { arrows: boolean; label: string | null } { return { arrows: !!this.aimGfx, label: this.aimLabelText }; }

  /** P60-c D72 B — 세트가 성립할 이웃 기구 위 작은 별 (FX 등록부 `set-star`, 칸마다 key 하나라 같은 자리는 갈아 끼운다). 빈 배열이면 지운다. 어느 칸인지는 main 이 sim 에서 받아 넘긴다 */
  showSetStar(tiles: readonly { i: number; j: number }[]): void {
    for (const h of this.setStars) h.kill();
    this.setStars = [];
    if (tiles.length === 0) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const t of tiles) {
      const c = tileCenter(t.i, t.j);
      this.setStars.push(playFx({ scene: this, reduced }, 'set-star', { x: c.x, y: c.y + this.liftAt(t.i, t.j) - 22, key: `set-star:${t.i},${t.j}` }));
    }
  }
  /** 검사용 — 살아 있는 세트 별 수 */
  setStarCountForTest(): number { return this.setStars.filter((h) => h.alive).length; }

  /** P60-d 고스트 손님 텍스처 — v8 손님 도트(`npcV8Key`, 고정 씨앗)를 빌린다. v8 이 없으면 옛 절차 도트 */
  private pathWalkerTexture(): { key: string; origin: { x: number; y: number } } {
    const v8 = npcV8Key(PATH_WALK_SEED, 0, 'walk', 0, 'happy');
    const key = this.deps.provider.spec(v8) ? v8 : 'guest/body:1/walk/0/happy';
    if (!this.textures.exists(key)) { const c = this.deps.provider.canvas(key); if (c) this.textures.addCanvas(key, c); }
    const spec = key.startsWith('guest/v8/') ? this.deps.provider.spec(key) : null;
    return { key, origin: spec ? { x: spec.ax / spec.w, y: spec.ay / spec.h } : { x: GUEST_ANCHOR.x / GUEST_W, y: GUEST_ANCHOR.y / GUEST_H } };
  }
  /** P60-d D72 A — 고스트 손님 주행: `tiles` = 입수구 칸 → 기존 경로 기구 칸들 → 고스트 칸(main 이 sim 에서 받아 넘긴다). 빈 배열이면 지운다. 같은 점열(= 같은 조준 칸)이면 다시 걷지 않고, 조준 칸이 바뀌면 처음부터 다시 */
  showPathWalk(tiles: readonly { i: number; j: number }[]): void {
    const key = tiles.map((t) => `${t.i},${t.j}`).join(';');
    if (tiles.length > 0 && key === this.pathWalkKey && this.pathWalk !== null) return;
    this.pathWalk?.kill(); this.pathWalk = null; this.pathWalkKey = key;
    if (tiles.length === 0) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tex = this.pathWalkerTexture();
    const path = tiles.map((t) => { const c = tileCenter(t.i, t.j); return { x: c.x, y: c.y + this.liftAt(t.i, t.j) }; });
    const first = path[0] as { x: number; y: number };
    this.pathWalk = playFx({ scene: this, reduced }, 'path-walk', { x: first.x, y: first.y, path, texture: tex.key, origin: tex.origin, density: this.deps.provider.spec(tex.key)?.density??1 });
  }
  /** P60-d D72 A — 링의 입수구 칸 표식(FX `entry-mark` 한 핸들이 전부 그린다). 빈 배열이면 지운다. 부를 때마다 다시 그린다(조준마다 갱신) */
  showEntryMarks(tiles: readonly { i: number; j: number }[]): void {
    this.entryMark?.kill(); this.entryMark = null;
    if (tiles.length === 0) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const path = tiles.map((t) => { const c = tileCenter(t.i, t.j); return { x: c.x, y: c.y + this.liftAt(t.i, t.j) }; });
    const first = path[0] as { x: number; y: number };
    this.entryMark = playFx({ scene: this, reduced }, 'entry-mark', { x: first.x, y: first.y, path });
  }
  /** 검사용 — 주행 손님이 살아 있나 · 표식이 찍힌 칸 수 */
  pathWalkForTest(): { alive: boolean; key: string } { return { alive: this.pathWalk?.alive === true, key: this.pathWalkKey }; }
  entryMarkForTest(): boolean { return this.entryMark?.alive === true; }

  /** P50-b2 — 빠지 모습: 꺼진 기구 uid · 링 데크 칸의 등급 · 이음쇠 변. 값은 sim 이 내고 여기선 칠하기만 */
  setRigLook(dimUids: ReadonlySet<number>, ringGrades: ReadonlyMap<number, number>, links: readonly { i: number; j: number; dir: 0 | 1 }[]): void {
    this.dimUids = new Set(dimUids);
    const prev = this.ringTint; this.ringTint = new Map();
    for (const [k, grade] of ringGrades) this.ringTint.set(k, cssColorInt(`--pontoon-g${Math.max(0, Math.min(4, grade))}`) || 0xffffff);
    for (const k of new Set([...prev.keys(), ...this.ringTint.keys()])) this.refreshTile(k % this.deps.grid.w, Math.floor(k / this.deps.grid.w));
    this.rigLinks = links;
    this.drawRigLinks();
    this.syncFacilities();
    this.refreshImagegenSprites();
  }
  private drawRigLinks(): void {
    if (!this.rigLinkGfx) this.rigLinkGfx = this.add.graphics().setDepth(DEPTH_LAND_MARK - 3.5);
    const g = this.rigLinkGfx; g.clear();
    if (this.rigLinks.length === 0) return;
    g.lineStyle(3, cssColorInt('--rig-link') || 0xffd35a, 1);
    for (const e of this.rigLinks) {
      const a = gridToScreen(e.i, e.j), b = gridToScreen(e.i + (e.dir === 0 ? 1 : 0), e.j + (e.dir === 1 ? 1 : 0));
      const lz = this.liftAt(e.i, e.j);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + lz;
      // 변에 걸친 짧은 고리 — 두 칸 중심을 잇는 선의 가운데 6텍셀
      const dx = (b.x - a.x) / 2, dy = (b.y - a.y) / 2, len = Math.hypot(dx, dy) || 1;
      g.beginPath(); g.moveTo(mx - (dx / len) * 6, my - (dy / len) * 6); g.lineTo(mx + (dx / len) * 6, my + (dy / len) * 6); g.strokePath();
    }
  }
  /** 수역 룩 — 풀 id → 칸·수온. P60-a(D71): 물 틴트는 하나(`--pool-clear`)다 — 색 이름 토큰·무지개는 뺐다. 수온은 김·서리 앰비언트만 */
  setPoolLook(pools: ReadonlyMap<number, { tiles: readonly number[]; temp: number }>): void {
    this.poolTint.clear();
    const tint = cssColorInt('--pool-clear') || 0xffffff;
    for (const [, v] of pools) {
      for (const k of v.tiles) {
        this.poolTint.set(k, tint);
        const img = this.tiles[k];
        if (img) img.setTint(tint);
      }
    }
    this.rebuildAmbient(pools);
  }

  private lastPools: ReadonlyMap<number, { tiles: readonly number[]; temp: number }> | null = null;

  /** 김·서리 자리 — 풀마다 몇 칸에서 주기적으로 뜬다 */
  private rebuildAmbient(pools?: ReadonlyMap<number, { tiles: readonly number[]; temp: number }>): void {
    if (pools) this.lastPools = pools;
    this.ambient.length = 0;
    if (!this.lastPools) return;
    for (const [, v] of this.lastPools) {
      const kinds: ('steam' | 'frost')[] = [];
      if (v.temp >= 35) kinds.push('steam');
      if (v.temp <= 15) kinds.push('frost');
      if (kinds.length === 0) continue;
      const n = Math.min(3, Math.max(1, Math.floor(v.tiles.length / 6)));
      for (let s = 0; s < n; s++) {
        const k = v.tiles[Math.floor(((s + 1) * v.tiles.length) / (n + 1))] ?? v.tiles[0] ?? 0;
        for (const kind of kinds) this.ambient.push({ i: k % this.deps.grid.w, j: Math.floor(k / this.deps.grid.w), kind, nextAt: this.time.now + 600 * (s + 1) });
      }
    }
    // 시설 앰비언트 (G17) — 분수는 물보라, 온천·사우나는 김
    if (this.facDefOf) {
      for (const f of this.facilitiesRef) {
        const id = this.facDefOf(f).id;
        const kind: 'spray' | 'steam' | null = /fountain|merlion|waterfall|soaker/.test(id) ? 'spray' : /hot_tub|sauna/.test(id) ? 'steam' : null;
        if (kind) this.ambient.push({ i: f.i, j: f.j, kind, nextAt: this.time.now + 400 + (f.uid % 5) * 300 });
      }
    }
  }

  private tickAmbient(): void {
    const now = this.time.now;
    for (const a of this.ambient) {
      if (now < a.nextAt) continue;
      a.nextAt = now + (a.kind === 'spray' ? 900 : 1600);
      const c = tileCenter(a.i, a.j);
      this.fx(a.kind === 'steam' ? 'temp-steam' : a.kind === 'spray' ? 'fountain-spray' : 'temp-frost', { x: c.x, y: c.y });
    }
  }

  /** 편집 선택 표시 — 파기는 흰, 메우기는 붉은 윤곽 */
  /** 검사용 (P24) — 마지막 고스트 라벨 · 선택 표시 칸 수 */
  ghostLabelForTest(): string { return this.lastGhostLabel; }
  selectionCountForTest(): number { return this.selectionCount; }
  private lastGhostLabel = '';
  private selectionCount = 0;

  setSelection(tiles: readonly { i: number; j: number }[], bad = false): void {
    if (!this.selection) return; // 씬이 아직 안 만들어졌다 — 독이 부팅 중에 부른다
    this.selection.clear();
    this.selectionCount = tiles.length;
    if (tiles.length === 0) return;
    this.selection.lineStyle(1, cssColorInt(bad ? '--fx-bad' : '--fx-ok'), 1);
    this.selection.fillStyle(cssColorInt('--tile-pool'), 0.45);
    for (const t of tiles) {
      const p = gridToScreen(t.i, t.j);
      this.selection.beginPath();
      this.selection.moveTo(p.x, p.y);
      this.selection.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      this.selection.lineTo(p.x, p.y + TILE_H);
      this.selection.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      this.selection.closePath();
      this.selection.fillPath();
      this.selection.strokePath();
    }
  }

  /** 날씨 연출 — 비는 1×3 선 40개 낙하, 눈은 1×1 점 30개 흔들리며 낙하. null 이면 지운다 */
  setWeather(kind: 'rain' | 'snow' | null): void {
    if (kind === this.weatherKind) return;
    this.weatherKind = kind;
    this.drops = [];
    if (!kind) { this.weatherGfx?.clear(); return; }
    const n = kind === 'rain' ? 40 : 30;
    for (let k = 0; k < n; k++) this.drops.push({ x: (k * 97) % Math.max(1, this.cam.bufferSize().w), y: (k * 53) % Math.max(1, this.cam.bufferSize().h), v: kind === 'rain' ? 6 : 1 });
  }

  private drawWeather(reduced: boolean): void {
    const g = this.weatherGfx;
    if (!g || !this.weatherKind) return;
    g.clear();
    const w = this.cam.bufferSize().w;
    const h = this.cam.bufferSize().h;
    g.fillStyle(cssColorInt(this.weatherKind === 'rain' ? '--rain' : '--snow'), this.weatherKind === 'rain' ? 0.55 : 0.9);
    for (const d of this.drops) {
      if (!reduced) {
        d.y += d.v;
        d.x += this.weatherKind === 'rain' ? -1 : Math.sin((d.y + d.x) / 20) * 0.6;
        if (d.y > h) { d.y = -4; d.x = (d.x + 37) % w; }
        if (d.x < 0) d.x += w;
      }
      if (this.weatherKind === 'rain') g.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
      else g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
    }
  }

  /** 낮밤 — 개장(08) 새벽빛 → 정오 0 → 18시(P18 저녁 구간)부터 남색 → 20시 폐장 .42 */
  setHour(hour: number, minute: number): void {
    const h = hour + minute / 60;
    let color = cssColorInt('--night');
    let alpha = 0;
    if (h < 10) {
      color = cssColorInt('--dawn');
      alpha = ((10 - h) / 2) * 0.12;
    } else if (h >= 18) {
      alpha = Math.min(0.42, ((h - 18) / 2) * 0.42);
    }
    this.tint?.setFillStyle(color, alpha);
    this.tint?.setSize(this.cam.bufferSize().w, this.cam.bufferSize().h);
  }

  /**
   * 뷰포트 재계산 + 캔버스 정수 확대. `scale.resize()` 는 **크기가 실제로 바뀔 때만** —
   * 같은 값으로 불러도 RESIZE 이벤트가 다시 와서 부팅 루프가 시작되지 못한다 (부모 실측).
   */
  private applyScale(s: Upscale): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const v = viewport(cssW, cssH, s, window.devicePixelRatio || 1);
    this.violations = violatesDotGrid(v, s);
    this.cam.setScreenSize(cssW, cssH);
    const density = this.renderDensity;
    const width = v.bufferW * density, height = v.bufferH * density;
    if (this.scale.width !== width || this.scale.height !== height) this.scale.resize(width, height);
    // Phaser NONE resize leaves an old explicit CSS size when zoom is exactly 1.
    // Refresh it too, otherwise rotation shrinks the canvas and misroutes taps.
    if (this.scale.zoom !== s / density || this.game.canvas.style.width !== `${v.cssW}px` || this.game.canvas.style.height !== `${v.cssH}px`) this.scale.setZoom(s / density);
    // Explicit size also handles orientation + zoom changes in the same resize.
    this.cameras.main.setSize(width, height).setZoom(density);
    this.game.canvas.style.imageRendering = density === 1 ? 'pixelated' : 'auto';
    this.tint?.setSize(v.bufferW, v.bufferH);
    this.syncCamera();
  }

  private syncCamera(): void {
    const view = this.cam.view();
    this.cameras.main.setScroll(view.scrollX, view.scrollY);
  }

  /**
   * 눌린 포인터를 id → 좌표 Map 으로 직접 추적한다 (부모 v1 카메라의 검증된 방식).
   * Phaser 의 `pointer1/2` 는 터치 전용이고 마우스는 `mousePointer` 로 따로 오므로 그쪽을
   * 보면 데스크톱 팬이 안 된다 — 이벤트에서 받은 포인터를 그대로 센다.
   *
   * ⚠ **핀치는 Phaser 포인터로 재지 않는다.** 포인터 좌표는 씬(버퍼) 단위라 배율이 2 가 되는
   * 순간 반으로 줄고, 두 손가락 중 한쪽만 새 단위로 온 프레임에 거리가 절반으로 읽혀
   * 1↔2 를 매 이벤트마다 오갔다 (실측). 핀치는 캔버스의 DOM 터치 이벤트(**화면 px**)로 잰다.
   */
  private readonly down = new Map<number, { x: number; y: number }>();
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinched = false;

  private touchPair(): [{ x: number; y: number }, { x: number; y: number }] | null {
    if (this.touches.size < 2) return null;
    const it = this.touches.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  private wirePinch(): void {
    const canvas = this.game.canvas;
    const read = (e: TouchEvent): void => {
      this.touches.clear();
      const r = canvas.getBoundingClientRect();
      for (const t of Array.from(e.touches)) this.touches.set(t.identifier, { x: t.clientX - r.left, y: t.clientY - r.top });
    };
    canvas.addEventListener('touchstart', (e) => {
      read(e);
      const pair = this.touchPair();
      if (pair) {
        this.pinchStart = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        this.pinchScale = this.cam.upscale;
        this.pinched = true;
        this.dragging = false;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      read(e);
      const pair = this.touchPair();
      if (!pair) return;
      if (this.pinchStart === null) {
        this.pinchStart = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        this.pinchScale = this.cam.upscale;
        this.pinched = true;
        this.dragging = false;
        return;
      }
      if (this.pinchStart <= 0) return;
      const ratio = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) / this.pinchStart;
      const want: Upscale = ratio > 1.35 ? 2 : ratio < 0.74 ? 1 : this.pinchScale;
      if (want === this.cam.upscale) return;
      // CSS pixels -> framebuffer pixels before the camera's inverse transform.
      const s = this.cam.upscale / this.renderDensity;
      const mid = this.cameras.main.getWorldPoint((pair[0].x + pair[1].x) / 2 / s, (pair[0].y + pair[1].y) / 2 / s);
      this.cam.setUpscale(want, { x: mid.x, y: mid.y });
      this.applyScale(want);
    }, { passive: true });
    const done = (e: TouchEvent): void => {
      read(e);
      if (this.touches.size < 2) this.pinchStart = null;
    };
    canvas.addEventListener('touchend', done, { passive: true });
    canvas.addEventListener('touchcancel', done, { passive: true });
  }

  // ── 코스 오버레이 (P4-B, 빠지 KairoScene 이식) — 경로·방향 삼각형·핸들(번호)·선착장 후보·시험 운행 보트 ──
  private courseGfx: Phaser.GameObjects.Graphics | null = null;
  private trialGfx: Phaser.GameObjects.Graphics | null = null;
  private courseHandles: { x: number; y: number }[] = [];
  private courseBad = new Set<number>();
  private courseDock: { x: number; y: number } | null = null;
  private courseInteractive = true;
  private courseRiskSegments: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  private courseHandleLabels: Phaser.GameObjects.Text[] = [];
  private dockTips: { x: number; y: number; claim?: { x: number; y: number }[] }[] = [];
  private dockSelected = -1;
  private draggingHandle = -1;
  private trialPath: { x: number; y: number }[] = [];
  private trialMs = 0;
  private trialElapsed = 0;
  private trialReactions: { progress: number; text: string; fired: boolean }[] = [];
  private trialLog: { text: string; at: number }[] = [];

  setCourseOverlay(handles: readonly { x: number; y: number }[], bad: readonly number[], dock: { x: number; y: number } | null, options: { interactive?: boolean; riskSegments?: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[] } = {}): void {
    this.courseHandles = handles.map((h) => ({ ...h }));
    this.courseBad = new Set(bad);
    this.courseDock = dock ? { ...dock } : null;
    this.courseInteractive = options.interactive ?? true;
    this.courseRiskSegments = (options.riskSegments ?? []).map((sg) => ({ a: { ...sg.a }, b: { ...sg.b } }));
    this.drawCourseOverlay();
  }

  /** 선착장 후보 — 편집을 닫을 땐 빈 배열. 카이로답게 목록이 아니라 지도에서 고른다 */
  setDockChoices(tips: readonly { x: number; y: number; claim?: { x: number; y: number }[] }[], selected: number): void {
    this.dockTips = tips.map((t) => ({ x: t.x, y: t.y, ...(t.claim === undefined ? {} : { claim: t.claim.map((c) => ({ ...c })) }) }));
    this.dockSelected = selected;
    this.drawCourseOverlay();
  }

  get dockMarks(): { x: number; y: number; claim?: { x: number; y: number }[] }[] {
    return this.dockTips.map((t) => ({ ...t }));
  }

  courseHandlesForTest(): { x: number; y: number }[] {
    return this.courseHandles.map((h) => ({ ...h }));
  }

  private coursePt(p: { x: number; y: number }): { x: number; y: number } {
    const c = tileCenter(p.x, p.y);
    return { x: c.x, y: c.y + this.liftAt(Math.round(p.x), Math.round(p.y)) };
  }

  private drawCourseOverlay(): void {
    if (!this.courseGfx) { this.courseGfx = this.add.graphics().setDepth(DEPTH_COURSE_MARK); }
    const g = this.courseGfx;
    g.clear();
    for (const label of this.courseHandleLabels) label.destroy();
    this.courseHandleLabels = [];
    if (this.courseHandles.length === 0 && this.dockTips.length === 0) { g.setVisible(false); return; }
    g.setVisible(true);
    const pt = (p: { x: number; y: number }): { x: number; y: number } => this.coursePt(p);
    const path = (this.courseDock ? [this.courseDock] : []).concat(this.courseHandles).map(pt);
    if (path.length >= 2) {
      g.lineStyle(2, cssColorInt('--course-route'), 0.85);
      g.beginPath();
      g.moveTo((path[0] as { x: number }).x, (path[0] as { y: number }).y);
      for (let k = 1; k < path.length; k++) g.lineTo((path[k] as { x: number }).x, (path[k] as { y: number }).y);
      g.lineTo((path[0] as { x: number }).x, (path[0] as { y: number }).y); // 코스는 돌아온다
      g.strokePath();
      for (let k = 1; k < path.length; k++) this.drawCourseDirection(g, path[k - 1] as { x: number; y: number }, path[k] as { x: number; y: number });
      this.drawCourseDirection(g, path[path.length - 1] as { x: number; y: number }, path[0] as { x: number; y: number });
    }
    for (const sg of this.courseRiskSegments) { const a = pt(sg.a); const b = pt(sg.b); g.lineStyle(4 / this.cam.upscale, cssColorInt('--course-risk'), 0.92); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath(); }
    // 선착장 후보 — 핸들보다 먼저 (겹치면 핸들이 위)
    for (let k = 0; k < this.dockTips.length; k++) {
      const c = pt(this.dockTips[k] as { x: number; y: number });
      const on = k === this.dockSelected;
      const rr = (on ? 16 : 13) / this.cam.upscale;
      g.fillStyle(cssColorInt('--course-dock'), on ? 0.9 : 0.35); g.fillCircle(c.x, c.y, rr);
      g.lineStyle(2, cssColorInt('--course-dock'), on ? 1 : 0.6); g.strokeCircle(c.x, c.y, rr);
      if (on) { g.fillStyle(cssColorInt('--course-dock-ink'), 0.9); g.fillCircle(c.x, c.y, rr * 0.42); }
    }
    const r = 18 / this.cam.upscale;
    if (this.courseDock) { const c = pt(this.courseDock); g.fillStyle(cssColorInt('--course-start'), 0.95); g.fillCircle(c.x, c.y, r * 0.58); g.lineStyle(2, cssColorInt('--course-ink'), 0.95); g.strokeCircle(c.x, c.y, r * 0.58); }
    for (let k = 0; k < this.courseHandles.length; k++) {
      const c = pt(this.courseHandles[k] as { x: number; y: number });
      g.fillStyle(cssColorInt(this.courseBad.has(k) ? '--course-risk' : '--course-handle'), 0.85); g.fillCircle(c.x, c.y, r);
      g.lineStyle(2, cssColorInt('--course-ink'), 0.9); g.strokeCircle(c.x, c.y, r);
      const label = this.add.text(c.x, c.y, String(k + 1), { color: cssVar('--course-ink'), fontFamily: cssVar('--font-pixel-family') || 'monospace', fontSize: `${Math.max(8, Math.round(10 / this.cam.upscale))}px`, fontStyle: 'bold' });
      label.setOrigin(0.5, 0.5).setDepth(DEPTH_COURSE_MARK + 1);
      this.courseHandleLabels.push(label);
    }
  }

  private drawCourseDirection(g: Phaser.GameObjects.Graphics, from: { x: number; y: number }, to: { x: number; y: number }): void {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    if (len < 4) return;
    const ux = (to.x - from.x) / len; const uy = (to.y - from.y) / len; const nx = -uy; const ny = ux;
    const cx = (from.x + to.x) / 2; const cy = (from.y + to.y) / 2; const size = 5 / this.cam.upscale;
    g.fillStyle(cssColorInt('--course-direction'), 0.9);
    g.beginPath(); g.moveTo(cx + ux * size, cy + uy * size); g.lineTo(cx - ux * size + nx * size * 0.7, cy - uy * size + ny * size * 0.7); g.lineTo(cx - ux * size - nx * size * 0.7, cy - uy * size - ny * size * 0.7); g.closePath(); g.fillPath();
  }

  /** 씬 좌표에서 가장 가까운 핸들 — 없으면 −1 (잡는 반경은 화면 22px) */
  private handleAtPointer(sx: number, sy: number): number {
    if (!this.courseInteractive) return -1;
    const grab = 22 / this.cam.upscale;
    let best = -1; let bestD = grab;
    for (let k = 0; k < this.courseHandles.length; k++) {
      const c = this.coursePt(this.courseHandles[k] as { x: number; y: number });
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  private dockAtPointer(sx: number, sy: number): number {
    const grab = 18 / this.cam.upscale;
    for (let k = 0; k < this.dockTips.length; k++) {
      const c = this.coursePt(this.dockTips[k] as { x: number; y: number });
      if (Math.hypot(c.x - sx, c.y - sy) < grab) return k;
    }
    return -1;
  }

  /** 시험 운행 (P4-B) — 경로를 따라 보트 표식이 `durationMs` 동안 한 바퀴. 트윈이 아니라 update 에서 시간을 센다(S9) */
  startCourseTrial(path: readonly { x: number; y: number }[], durationMs: number, reactions: readonly { progress: number; text: string }[]): void {
    this.clearCourseTrial();
    this.trialPath = path.map((p) => ({ ...p }));
    if (this.trialPath.length < 2) return;
    this.trialMs = Math.max(200, durationMs);
    this.trialElapsed = 0;
    this.trialReactions = reactions.map((r) => ({ ...r, fired: false }));
    if (!this.trialGfx) this.trialGfx = this.add.graphics().setDepth(DEPTH_COURSE_MARK + 2);
    this.drawCourseTrial(0);
  }

  courseTrialLogForTest(): { text: string; at: number }[] {
    return this.trialLog.map((e) => ({ ...e }));
  }

  get courseTrialRunning(): boolean {
    return this.trialPath.length >= 2 && this.trialElapsed < this.trialMs;
  }

  clearCourseTrial(): void {
    this.trialPath = [];
    this.trialReactions = [];
    this.trialLog = [];
    this.trialElapsed = 0;
    this.trialGfx?.clear().setVisible(false);
  }

  private tickCourseTrial(dtMs: number): void {
    if (this.trialPath.length < 2 || this.trialElapsed >= this.trialMs) return;
    this.trialElapsed = Math.min(this.trialMs, this.trialElapsed + dtMs);
    const t = this.trialElapsed / this.trialMs;
    for (const r of this.trialReactions) {
      if (!r.fired && t >= r.progress) {
        r.fired = true;
        const p = this.trialPoint(r.progress);
        if (p) { const c = this.coursePt(p); this.fx('money-pop', { x: c.x, y: c.y - 12, text: r.text, key: `trial:${r.text}` }); }
        this.trialLog.push({ text: r.text, at: Math.round(this.trialElapsed) });
      }
    }
    this.drawCourseTrial(t);
  }

  private trialPoint(t: number): { x: number; y: number } | null {
    const n = this.trialPath.length;
    if (n < 2) return null;
    const total = n; // 닫힌 경로 — 마지막 → 처음 구간 포함
    const f = Math.min(0.999999, Math.max(0, t)) * total;
    const k = Math.floor(f); const u = f - k;
    const a = this.trialPath[k % n] as { x: number; y: number }; const b = this.trialPath[(k + 1) % n] as { x: number; y: number };
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }

  private drawCourseTrial(t: number): void {
    const g = this.trialGfx; if (!g) return;
    g.clear(); g.setVisible(true);
    const p = this.trialPoint(t); if (!p) return;
    const c = this.coursePt(p);
    const r = 7 / this.cam.upscale;
    g.fillStyle(cssColorInt('--course-trial-boat'), 1); g.fillEllipse(c.x, c.y, r * 2.4, r * 1.3);
    g.lineStyle(1, cssColorInt('--course-trial-edge'), 1); g.strokeEllipse(c.x, c.y, r * 2.4, r * 1.3);
  }

  private rideRenderer: CourseRideRenderer | null = null;
  private staticRenderer: StaticFacilityRenderer | null = null;
  setCourses(_courses: readonly PlacedCourse[]): void { this.tickCourseBoats(0); }
  private tickCourseBoats(_dtMs: number): void {
    const view = this.deps.rideScene?.();
    if (view && this.deps.watercraft) {
      this.rideRenderer ??= new CourseRideRenderer(this, this.deps.watercraft, this.deps.provider);
      this.rideRenderer.update(view,this.deps.rideTime?.() ?? 0);
    }
  }

  /** 편집을 열면 코스를 화면에 잡는다 — 끝 핸들이 화면 끝에 붙으면 못 잡는다 (타일 한 칸 여유) */
  frameCourse(dock: { x: number; y: number } | null, handles: readonly { x: number; y: number }[], bottomInsetCss = 0): void {
    const pts = (dock ? [dock] : []).concat(handles).map((p) => this.coursePt(p));
    if (pts.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const pad = TILE_W;
    const box = { w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    if (this.cam.upscale !== 1 && !this.cam.fits(box, bottomInsetCss)) { this.cam.setUpscale(1); this.applyScale(1); }
    this.cam.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, bottomInsetCss);
    this.syncCamera();
  }

  editorPointer: ((phase: 'down' | 'move' | 'up', p: Phaser.Input.Pointer) => boolean) | null = null;

  private wireInput(): void {
    this.wirePinch();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.editorPointer?.('down', p)) return;
      this.down.set(p.id, { x: p.x, y: p.y });
      if (this.down.size === 1) {
        const w0 = this.cameras.main.getWorldPoint(p.x, p.y);
        this.draggingHandle = this.handleAtPointer(w0.x, w0.y);
        if (this.draggingHandle >= 0) { this.dragging = false; this.dragMoved = 0; this.pinched = false; return; }
        this.dragging = true;
        this.dragMoved = 0;
        this.pinched = false;
      } else {
        this.dragging = false;
        this.pinched = true;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.editorPointer?.('move', p)) return;
      const prev = this.down.get(p.id);
      if (!prev) return;
      const dxRaw = p.x - prev.x;
      const dyRaw = p.y - prev.y;
      prev.x = p.x;
      prev.y = p.y;
      if (this.draggingHandle >= 0 && this.down.size === 1) {
        const w1 = this.cameras.main.getWorldPoint(p.x, p.y);
        const t = screenToTile(w1.x, w1.y);
        const h = this.courseHandles[this.draggingHandle];
        if (h && (h.x !== t.i || h.y !== t.j) && inGrid(t.i, t.j)) { h.x = t.i; h.y = t.j; this.drawCourseOverlay(); this.deps.onCourseHandleMove?.(this.draggingHandle, t.i, t.j); }
        return;
      }
      if (this.down.size >= 2 || !this.dragging) return;
      // Pointer coordinates are framebuffer pixels; pan accepts CSS pixels.
      const dx = dxRaw * this.cam.upscale / this.renderDensity;
      const dy = dyRaw * this.cam.upscale / this.renderDensity;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.cam.pan(dx, dy);
      this.syncCamera();
    });

    const end = (p: Phaser.Input.Pointer): void => {
      if (this.editorPointer?.('up', p)) return;
      this.down.delete(p.id);
      if (this.draggingHandle >= 0) { this.draggingHandle = -1; return; }
      if (this.down.size > 0) return;
      const wasDragging = this.dragging;
      this.dragging = false;
      this.cam.release();
      this.syncCamera();
      if (this.pinched || !wasDragging) return;
      if (this.dragMoved >= TAP_MOVE_PX) return;
      const now = this.time.now;
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      if (now - this.lastTapAt < DOUBLE_TAP_MS) {
        this.lastTapAt = 0;
        const next: Upscale = this.cam.upscale === 1 ? 2 : 1;
        this.cam.setUpscale(next, { x: world.x, y: world.y });
        this.applyScale(next);
        return;
      }
      this.lastTapAt = now;
      const dk = this.dockAtPointer(world.x, world.y);
      if (dk >= 0) { this.deps.onCourseDockPick?.(dk); return; }
      const t = screenToTile(world.x, world.y);
      if (inGrid(t.i, t.j)) this.deps.onTapTile?.(t.i, t.j);
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      const next: Upscale = dy < 0 ? 2 : 1;
      if (next === this.cam.upscale) return;
      this.cam.setUpscale(next, { x: world.x, y: world.y });
      this.applyScale(next);
    });
  }
}

export { GRID_W, GRID_H, FLOOR };

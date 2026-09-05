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
import { Grid, FLOOR, FLOOR_NAMES, gateTile, type FloorCode, isRiverRow, isWaterCode } from '../sim/grid.js';
import { Camera } from './camera.js';
import { gridToScreen, screenToTile, depthKey, spanDepthKey, inGrid, tileCenter, Z_GROUND, Z_GUEST, Z_FACILITY, Z_GHOST, DEPTH_AIM_MARK, DEPTH_SCREEN_FX, TILE_W, TILE_H, GRID_W, GRID_H , lift, DEPTH_COURSE_MARK } from './iso.js';
import { drawColumn } from './column.js';
import { WaterGlint } from './water.js';
import { GUEST_ANCHOR, GUEST_FRAMES, GUEST_H, GUEST_W, guestTextureKey, type GuestPose } from '../assets/draw/guest.js';
import { drawEmote, drawBattery } from '../assets/draw/emote.js';
import { drawBus, BUS_W, BUS_H } from '../assets/draw/bus.js';
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
import { playFx, type FxName, type FxTarget } from './fx/registry.js';

export interface SceneStats {
  fps: number;
  sprites: number;
  scale: Upscale;
  scrollX: number;
  scrollY: number;
  violations: string[];
}

export interface SceneDeps {
  provider: AssetProvider;
  grid: Grid;
  camera: Camera;
  rank: () => number;
  /** 첫 화면이 볼 칸 — 새 판은 토지 중앙. 안 주면 월드 중앙 */
  startTile?: { i: number; j: number; bottomInsetCss?: number };
  onFrame?: (s: SceneStats) => void;
  onTapTile?: (i: number, j: number) => void;
  /** P4-B: 핸들을 끌 때마다 (지표 실시간 갱신 신호) · 선착장 후보 탭 */
  onCourseHandleMove?: (index: number, i: number, j: number) => void;
  onCourseDockPick?: (index: number) => void;
}

const TAP_MOVE_PX = 12;
const DOUBLE_TAP_MS = 320;

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
  private water: WaterGlint | null = null;
  private pendingPoolTiles: readonly number[] = [];
  readonly guestImgs = new Map<number, Phaser.GameObjects.Image>();
  private guestsRef: readonly Guest[] = [];
  private selection: Phaser.GameObjects.Graphics | null = null;
  private tint: Phaser.GameObjects.Rectangle | null = null;
  private weatherGfx: Phaser.GameObjects.Graphics | null = null;
  private laneGfx: Phaser.GameObjects.Graphics | null = null;
  private wallGfx: Phaser.GameObjects.Graphics | null = null;
  private season = 0;
  private rainbowTiles: number[] = [];
  private weatherKind: 'rain' | 'snow' | null = null;
  private drops: { x: number; y: number; v: number }[] = [];
  private animFrame = 0;
  readonly facImgs = new Map<number, Phaser.GameObjects.Image>();
  private facilitiesRef: readonly PlacedFacility[] = [];
  private staffRef: readonly Staff[] = [];
  private readonly staffImgs = new Map<number, Phaser.GameObjects.Image>();
  private facDefOf: ((f: PlacedFacility) => FacilityDef) | null = null;
  ghost: Phaser.GameObjects.Image | null = null;
  /** 조준 화살표 4 + 가격표 (G47, 원작 배치 화면) */
  private aimGfx: Phaser.GameObjects.Graphics | null = null;
  private aimLabel: Phaser.GameObjects.Text | null = null;
  private poolTint = new Map<number, number>();
  private readonly ambient: { i: number; j: number; kind: 'scent' | 'steam' | 'frost' | 'spray'; nextAt: number }[] = [];
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

  create(): void {
    for (const id of this.deps.provider.ids()) {
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
    this.wallGfx = this.add.graphics().setDepth(DEPTH_LAND_MARK - 4);
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

  private lastUpdateAt = 0;
  override update(): void {
    this.frames++;
    { const now = this.time.now; const dt = this.lastUpdateAt ? Math.min(100, now - this.lastUpdateAt) : 16; this.lastUpdateAt = now; this.tickCourseTrial(dt); this.tickCourseBoats(dt); } // P4-B 시험 운행 · P4-C 보트 시계 (트윈 대신)
    this.animFrame++;
    this.tickWater();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.water?.update(reduced);
    this.syncGuests();
    this.syncFacilities();
    if (!reduced) this.tickAmbient();
    this.drawWeather(reduced);
    if (this.rainbowTiles.length && this.animFrame % 4 === 0) {
      for (const k of this.rainbowTiles) {
        const img = this.tiles[k];
        if (!img) continue;
        const hue = reduced ? ((k * 37) % 360) : ((k * 37) + this.animFrame * 2) % 360;
        const c = Phaser.Display.Color.HSVToRGB(hue / 360, 0.35, 1) as { r: number; g: number; b: number };
        img.setTint((c.r << 16) | (c.g << 8) | c.b);
      }
    }
    const now = this.time.now;
    if (now - this.fpsAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    const v = this.cam.view();
    this.deps.onFrame?.({
      fps: this.fps,
      sprites: this.children.length,
      scale: v.scale,
      scrollX: v.scrollX,
      scrollY: v.scrollY,
      violations: this.violations,
    });
  }

  /** 지면 전부. 타일 텍스처 키는 `tile/<kind>`, 입구 칸만 `tile/gate` */
  private buildGround(): void {
    const g = this.deps.grid;
    const gate = gateTile(this.deps.rank());
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const p = gridToScreen(i, j);
        const img = this.add.image(p.x, p.y + this.liftAt(i, j), this.columnKey(g.at(i, j), i === gate.i && j === gate.j, i, j));
        img.setOrigin(0.5, 0).setDepth(depthKey(i, j) + Z_GROUND);
        this.tiles[j * g.w + i] = img;
      }
    }
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
  }
  tileYForTest(i: number, j: number): number {
    return this.tiles[j * this.deps.grid.w + i]?.y ?? 0;
  }

  /** 단이 있는 칸의 텍스처 — 윗면 + 치마 한 장 (`<tileKey>|z<n>`), 없으면 구워 둔다 */
  private columnKey(code: FloorCode, isGate: boolean, i: number, j: number): string {
    const base = this.tileKey(code, isGate);
    const z = this.noLiftForTest ? 0 : this.deps.grid.levelAt(i, j);
    if (z <= 0) return base;
    const key = `${base}|z${z}`;
    if (!this.textures.exists(key)) {
      if (!this.textures.exists(base)) { const c0 = this.deps.provider.canvas(base); if (c0) this.textures.addCanvas(base, c0); }
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
        const buoy = isRiverRow(j);
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
        if (!isPool(i - 1, j)) edge(p.x, p.y, p.x - TILE_W / 2, p.y + TILE_H / 2);
        if (!isPool(i, j - 1)) edge(p.x, p.y, p.x + TILE_W / 2, p.y + TILE_H / 2);
        if (!isPool(i + 1, j)) edge(p.x + TILE_W / 2, p.y + TILE_H / 2, p.x, p.y + TILE_H);
        if (!isPool(i, j + 1)) edge(p.x - TILE_W / 2, p.y + TILE_H / 2, p.x, p.y + TILE_H);
      }
    }
  }

  /** 격자 한 칸을 다시 그린다 (G1 의 풀 파기가 부른다) */
  refreshTile(i: number, j: number): void {
    const img = this.tiles[j * this.deps.grid.w + i];
    if (!img) return;
    const gate = gateTile(this.deps.rank());
    img.setTexture(this.columnKey(this.deps.grid.at(i, j), i === gate.i && j === gate.j, i, j));
    img.setY(gridToScreen(i, j).y + this.liftAt(i, j)); // P0-B: 풀을 파면 단이 0 으로 내려간다
    const tint = this.poolTint.get(j * this.deps.grid.w + i);
    const floor = this.deps.grid.at(i, j);
    if (tint !== undefined && floor === FLOOR.pool) img.setTint(tint);
    else if (floor === FLOOR.grass) img.setTint(cssColorInt(`--grass-season-${this.season}`) || 0xffffff);
    else img.clearTint();
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

  /** 직원 (G20) — 손님 도트를 역할 팔레트로 빌려 그린다 (걷기 프레임). 머리 위엔 별 배지 */
  private syncStaff(): void {
    const keep = new Set<number>();
    const palOf: Record<string, number> = { lifeguard: 0, cleaner: 3, mascot: 2, cook: 7 };
    for (const s of this.staffRef) {
      keep.add(s.uid);
      const moving = s.progress < 1;
      const frame = moving ? Math.floor(this.animFrame / 7) % 2 : 0;
      const key = `guest/body:${palOf[s.role] ?? 1}/${moving ? 'walk' : 'idle'}/${frame}/happy`;
      if (!this.textures.exists(key)) { const c = this.deps.provider.canvas(key); if (c) this.textures.addCanvas(key, c); }
      let img = this.staffImgs.get(s.uid);
      if (!img) { img = this.add.image(0, 0, key).setOrigin(GUEST_ANCHOR.x / GUEST_W, GUEST_ANCHOR.y / GUEST_H); this.staffImgs.set(s.uid, img); }
      else if (img.texture.key !== key) img.setTexture(key);
      const a = tileCenter(s.fromI, s.fromJ); const b = tileCenter(s.i, s.j);
      img.setPosition(Math.round(a.x + (b.x - a.x) * s.progress), Math.round(a.y + (b.y - a.y) * s.progress + this.liftAt(s.i, s.j)));
      img.setFlipX(s.facing === 1 || s.facing === 2);
      img.setDepth(spanDepthKey(s.fromI, s.fromJ, s.i, s.j) + Z_GUEST);
    }
    for (const [uid, img] of this.staffImgs) { if (keep.has(uid)) continue; img.destroy(); this.staffImgs.delete(uid); }
  }

  setGuests(list: readonly Guest[]): void {
    this.guestsRef = list;
  }

  /** 포즈는 상태 + 서 있는 시설에서 파생한다 (G26): 라운지 = lie(의자류)/sit(테이블·소파) · 슬라이드 = ride · 탑 위 = idle */
  private guestPose(g: Guest): GuestPose {
    if (g.state === 'swim') return 'swim';
    if (g.state === 'ride') return 'ride';
    if (g.state === 'walk' || g.state === 'leave') return 'walk';
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
    const a = tileCenter(g.fromI, g.fromJ);
    const b = tileCenter(g.i, g.j);
    const t = g.progress;
    const lz = this.liftAt(g.fromI, g.fromJ) + (this.liftAt(g.i, g.j) - this.liftAt(g.fromI, g.fromJ)) * t; // P0-B: 두 칸 사이 보간
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - this.slideLift(g) + lz };
  }

  private syncGuests(): void {
    const seen = new Set<number>();
    for (const g of this.guestsRef) {
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
      const p = this.guestWorld(g);
      // 대기 줄 (G34) — 같은 칸에 선 사람들을 뒤로 한 명씩 비켜 세운다
      const qx = g.state === 'queue' ? -6 * g.queuePos : 0; const qy = g.state === 'queue' ? 4 * g.queuePos : 0;
      img.setPosition(Math.round(p.x + qx), Math.round(p.y + qy + (g.state === 'swim' ? 4 : g.state === 'use' && g.progress >= 1 ? -2 : 0)));
      img.setFlipX(g.facing === 1 || g.facing === 2);
      img.setDepth(spanDepthKey(g.fromI, g.fromJ, g.i, g.j) + Z_GUEST + (g.state === 'climb' || g.state === 'ride' ? 1 : 0));
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
      if (g.hp >= WaterparkScene.HP_ICON_BELOW || g.state === 'leave') continue;
      keep.add(g.uid);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawBattery());
      let img = this.hpImgs.get(g.uid);
      if (!img) { img = this.add.image(0, 0, key).setOrigin(0.5, 1); this.hpImgs.set(g.uid, img); }
      const p = this.guestWorld(g);
      const lift = (g.emote && g.emoteTtl > 0 ? 12 : 0) + (g.friendId ? 8 : 0);
      img.setPosition(Math.round(p.x), Math.round(p.y - GUEST_ANCHOR.y - 2 - lift));
      img.setDepth(spanDepthKey(g.fromI, g.fromJ, g.i, g.j) + Z_GUEST + 1);
    }
    for (const [uid, img] of this.hpImgs) { if (keep.has(uid)) continue; img.destroy(); this.hpImgs.delete(uid); }
  }

  private busImg: Phaser.GameObjects.Image | null = null;
  private busRef: BusState | null = null;
  private busRoad: { i0: number; i1: number; iStop: number; j: number } | null = null;
  /** 도로 띠 — 토지 아래 두 칸, 게이트 앞에 선다 (G33). 토지가 바뀌면 다시 준다 */
  setBusRoad(gate: { i: number; j: number }, land: { i0: number; w: number }): void {
    this.busRoad = { i0: land.i0 - 8, i1: land.i0 + land.w + 8, iStop: gate.i, j: gate.j - 2 }; // P15: 도로는 입구 위
  }
  setBus(state: BusState | null): void {
    this.busRef = state;
    this.syncBus();
  }
  private syncBus(): void {
    const bs = this.busRef; const road = this.busRoad;
    if (!bs || !road || !this.sys.isActive()) { if (this.busImg) { this.busImg.destroy(); this.busImg = null; } return; }
    if (!this.textures.exists('bus/0')) this.textures.addCanvas('bus/0', drawBus());
    if (!this.busImg) this.busImg = this.add.image(0, 0, 'bus/0').setOrigin(0.5, (BUS_H - 2) / BUS_H);
    const fi = bs.phase === 'in' ? road.i0 + (road.iStop - road.i0) * bs.t : bs.phase === 'stop' ? road.iStop : road.iStop + (road.i1 - road.iStop) * bs.t;
    const a = tileCenter(Math.floor(fi), road.j); const b = tileCenter(Math.floor(fi) + 1, road.j);
    const f = fi - Math.floor(fi);
    this.busImg.setPosition(Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f + TILE_H / 2 + this.liftAt(Math.round(fi), road.j)));
    this.busImg.setDepth(depthKey(Math.round(fi), road.j) + Z_GUEST);
    void BUS_W;
  }
  /** 검사용 — 도로 위 버스 위치 */
  busForTest(): { x: number; y: number; phase: string } | null { return this.busImg && this.busRef ? { x: this.busImg.x, y: this.busImg.y, phase: this.busRef.phase } : null; }

  private lightsRect: Phaser.GameObjects.Rectangle | null = null;
  /** 겨울 저녁 조명 틴트 (G27) — 남색을 얇게 덮는다. 낮밤 틴트와 별개의 사각형 */
  setIllumination(on: boolean): void {
    if (!this.lightsRect) this.lightsRect = this.add.rectangle(0, 0, 4, 4, 0, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH_SCREEN_FX - 2);
    this.lightsRect.setFillStyle(cssColorInt('--tint-winter-night'), on ? 0.16 : 0);
    this.lightsRect.setSize(this.scale.width, this.scale.height);
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
      if (!g.friendId) continue;
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
      img.setDepth(spanDepthKey(g.fromI, g.fromJ, g.i, g.j) + Z_GUEST + 1);
    }
    for (const [uid, img] of this.gaugeImgs) { if (keep.has(uid)) continue; img.destroy(); this.gaugeImgs.delete(uid); }
  }

  private borderImgs: Phaser.GameObjects.Image[] = [];
  /** 토지 밖 나무 띠 (G25) — PSS 의 「파크 밖 수목」. 토지가 바뀌면 다시 심는다 */
  drawBorder(land: { i0: number; j0: number; w: number; h: number }): void {
    for (const im of this.borderImgs) im.destroy();
    this.borderImgs = [];
    const keys = ['fac/banana_tree/0', 'fac/pine/0', 'fac/ficus/0'];
    for (const k of keys) if (!this.textures.exists(k)) { const c = this.deps.provider.canvas(k); if (c) this.textures.addCanvas(k, c); }
    const put = (i: number, j: number, n: number): void => {
      const key = keys[n % keys.length] as string;
      if (!this.textures.exists(key) || i < 0 || j < 0 || i >= this.deps.grid.w || j >= this.deps.grid.h) return;
      if (isWaterCode(this.deps.grid.at(i, j)) || this.deps.grid.at(i, j) === FLOOR.deck) return; // P2: 경계 나무는 물·데크 위에 안 선다 (P1 재플레이 실측)
      const c = tileCenter(i, j);
      const img = this.add.image(c.x, c.y + TILE_H / 2 + this.liftAt(i, j), key).setOrigin(0.5, 1).setDepth(depthKey(i, j) + Z_GUEST - 1);
      this.borderImgs.push(img);
    };
    let n = 0;
    for (let i = land.i0 - 1; i <= land.i0 + land.w; i += 2) { put(i, land.j0 - 2, n++); }
    for (let j = land.j0 - 1; j < land.j0 + land.h; j += 2) { put(land.i0 - 2, j, n++); put(land.i0 + land.w + 1, j, n++); }
  }

  /** 검사용 — 경계 나무 수 */
  borderCountForTest(): number { return this.borderImgs.length; }

  /** 검사용 — 지금 떠 있는 친구 게이지 수 */
  gaugeCountForTest(): number { return this.gaugeImgs.size; }

  /** 타일 주변을 찍어 48×32 캔버스로 (SNS 타임라인 썸네일, G23). 화면 밖이면 null */
  snapshotAt(i: number, j: number, cb: (c: HTMLCanvasElement | null) => void): void {
    const c = tileCenter(i, j);
    const v = this.cam.view();
    // 캔버스 버퍼는 텍셀 단위(정수 업스케일은 CSS 가 한다) — v.scale 을 곱하면 안 된다
    const sx = Math.round(c.x - 24 - v.scrollX);
    const sy = Math.round(c.y - 28 - v.scrollY);
    const w = 48; const h = 32;
    const cw = this.game.canvas.width; const ch = this.game.canvas.height;
    if (sx < 0 || sy < 0 || sx + w > cw || sy + h > ch) { cb(null); return; }
    this.game.renderer.snapshotArea(sx, sy, w, h, (img) => {
      if (!(img instanceof HTMLImageElement)) { cb(null); return; }
      const out = document.createElement('canvas');
      out.width = 48; out.height = 32;
      const g = out.getContext('2d');
      if (!g) { cb(null); return; }
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, 48, 32);
      cb(out);
    });
  }

  /** 머리 위 이모트 (G17) — `g.emote` 를 그대로 그린다 (누구에게 무엇이 뜨나는 sim 이 정한다). 동시 ≤ MAX_EMOTES */
  private syncEmotes(): void {
    const keep = new Set<number>();
    let n = 0;
    for (const g of this.guestsRef) {
      if (!g.emote || g.emoteTtl <= 0 || n >= WaterparkScene.MAX_EMOTES) continue;
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
      img.setDepth(spanDepthKey(g.fromI, g.fromJ, g.i, g.j) + Z_GUEST + 1);
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
    if (!g) return null;
    const p = this.guestWorld(g);
    const v = this.cam.view();
    return { x: (p.x - v.scrollX) * v.scale, y: (p.y - 24 - v.scrollY) * v.scale };
  }

  /** 이 칸 위(또는 걸친) 손님 — 탭 판정 */
  guestAt(i: number, j: number): Guest | null {
    return this.guestsRef.find((g) => (g.i === i && g.j === j) || (g.progress < 1 && g.fromI === i && g.fromJ === j)) ?? null;
  }

  /** 시설 목록 참조 + 정의 조회 — 프레임마다 스프라이트를 맞춘다 */
  setFacilities(list: readonly PlacedFacility[], defOf: (f: PlacedFacility) => FacilityDef): void {
    this.facilitiesRef = list;
    this.facDefOf = defOf;
    this.syncFacilities();
  }

  private facilityTexture(def: FacilityDef, facing: 0 | 1): string {
    const key = `fac/${def.id}/${facing}`;
    if (!this.textures.exists(key)) {
      const c = this.deps.provider.canvas(key);
      if (c) this.textures.addCanvas(key, c);
    }
    return key;
  }

  private placeFacilityImage(img: Phaser.GameObjects.Image, def: FacilityDef, i: number, j: number, facing: 0 | 1): void {
    const w = facing === 1 ? def.d : def.w;
    const d = facing === 1 ? def.w : def.d;
    const a = footprintAnchor(i, j, w, d);
    const size = facilityCanvasSize(def, facing);
    const ca = canvasAnchor(w, d, BODY_H[def.class]);
    img.setOrigin(ca.x / size.w, ca.y / size.h);
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
    }
    for (const [uid, img] of this.facImgs) {
      if (seen.has(uid)) continue;
      img.destroy();
      this.facImgs.delete(uid);
    }
    if (this.facilitiesRef.length !== this.lastFacCount) { this.lastFacCount = this.facilitiesRef.length; this.drawLanes(); this.rebuildAmbient(); }
    this.rebuildAmbient();
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

  /** 실내 벽 — 실내 칸과 비실내 칸이 만나는 변에 유리벽 선 (G12). 지면이 바뀔 때만 다시 그린다 */
  drawWalls(): void {
    const g = this.wallGfx;
    if (!g) return;
    g.clear();
    const grid = this.deps.grid;
    g.lineStyle(2, cssColorInt('--wall-glass'), 0.55);
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        if (grid.at(i, j) !== FLOOR.indoor) continue;
        const p = gridToScreen(i, j);
        // 이웃이 실내(또는 실내 풀)가 아니면 그 변에 선
        const inside = (a: number, b: number): boolean => grid.at(a, b) === FLOOR.indoor || (grid.at(a, b) === FLOOR.pool && this.indoorPool(a, b));
        if (!inside(i - 1, j)) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2); g.strokePath(); g.fillStyle(cssColorInt('--wall-glass'), 0.35); g.fillRect(p.x - TILE_W / 2, p.y - 6, 1, 1); }
        if (!inside(i, j - 1)) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2); g.strokePath(); }
        if (!inside(i + 1, j)) { g.beginPath(); g.moveTo(p.x + TILE_W / 2, p.y + TILE_H / 2); g.lineTo(p.x, p.y + TILE_H); g.strokePath(); }
        if (!inside(i, j + 1)) { g.beginPath(); g.moveTo(p.x - TILE_W / 2, p.y + TILE_H / 2); g.lineTo(p.x, p.y + TILE_H); g.strokePath(); }
      }
    }
  }

  private indoorPool(i: number, j: number): boolean {
    const k = j * this.deps.grid.w + i;
    return this.poolTint.has(k) && this.indoorPoolTiles.has(k);
  }

  private indoorPoolTiles = new Set<number>();
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
    if (!this.selection) return;
    if (!def) {
      this.ghost?.destroy();
      this.ghost = null;
      this.aimGfx?.destroy(); this.aimGfx = null;
      this.aimLabel?.destroy(); this.aimLabel = null;
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
    const w = facing === 1 ? def.d : def.w;
    const d = facing === 1 ? def.w : def.d;
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
    if (!this.aimLabel) this.aimLabel = this.add.text(0, 0, label, { fontFamily: cssVar('--font-pixel-family') || 'monospace', fontSize: '11px', color: cssVar('--strip-num'), stroke: cssVar('--fx-stroke'), strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(DEPTH_AIM_MARK + 2);
    else this.aimLabel.setText(label);
    const size = facilityCanvasSize(def, facing);
    this.aimLabel.setPosition(Math.round(cx), Math.round(top.y - size.h + TILE_H - 4));
  }
  /** 검사용 — 조준 화살표·가격표가 떠 있나 */
  aimForTest(): { arrows: boolean; label: string | null } { return { arrows: !!this.aimGfx, label: this.aimLabel ? this.aimLabel.text : null }; }

  /** 풀 색 틴트 — 풀 id → 색 이름. 타일 이미지에 setTint 한다 */
  setPoolColors(colors: ReadonlyMap<number, { color: string; tiles: readonly number[]; temp: number; scent: string | null }>): void {
    this.poolTint.clear();
    this.rainbowTiles = [];
    for (const [, v] of colors) {
      if (v.color === 'rainbow') this.rainbowTiles.push(...v.tiles);
      const tint = cssColorInt(`--pool-${v.color}`) || cssColorInt('--pool-clear');
      for (const k of v.tiles) {
        this.poolTint.set(k, tint);
        const img = this.tiles[k];
        if (img) img.setTint(tint);
      }
    }
    this.rebuildAmbient(colors);
  }

  private lastColors: ReadonlyMap<number, { color: string; tiles: readonly number[]; temp: number; scent: string | null }> | null = null;

  /** 향 퍼프·김·서리 자리 — 풀마다 몇 칸에서 주기적으로 뜬다 */
  private rebuildAmbient(colors?: ReadonlyMap<number, { color: string; tiles: readonly number[]; temp: number; scent: string | null }>): void {
    if (colors) this.lastColors = colors;
    this.ambient.length = 0;
    if (!this.lastColors) return;
    for (const [, v] of this.lastColors) {
      const kinds: ('scent' | 'steam' | 'frost')[] = [];
      if (v.scent) kinds.push('scent');
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
      a.nextAt = now + (a.kind === 'scent' ? 2000 : a.kind === 'spray' ? 900 : 1600);
      const c = tileCenter(a.i, a.j);
      this.fx(a.kind === 'scent' ? 'scent-puff' : a.kind === 'steam' ? 'temp-steam' : a.kind === 'spray' ? 'fountain-spray' : 'temp-frost', { x: c.x, y: c.y });
    }
  }

  /** 편집 선택 표시 — 파기는 흰, 메우기는 붉은 윤곽 */
  setSelection(tiles: readonly { i: number; j: number }[], bad = false): void {
    if (!this.selection) return; // 씬이 아직 안 만들어졌다 — 독이 부팅 중에 부른다
    this.selection.clear();
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
    for (let k = 0; k < n; k++) this.drops.push({ x: (k * 97) % Math.max(1, this.scale.width), y: (k * 53) % Math.max(1, this.scale.height), v: kind === 'rain' ? 6 : 1 });
  }

  private drawWeather(reduced: boolean): void {
    const g = this.weatherGfx;
    if (!g || !this.weatherKind) return;
    g.clear();
    const w = this.scale.width;
    const h = this.scale.height;
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
    this.tint?.setSize(this.scale.width, this.scale.height);
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
    if (this.scale.width !== v.bufferW || this.scale.height !== v.bufferH) this.scale.resize(v.bufferW, v.bufferH);
    if (this.scale.zoom !== s) this.scale.setZoom(s);
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
      // 화면 px → 씬 좌표는 S 로 나눈다 (캔버스 CSS = 버퍼 × S)
      const s = this.cam.upscale;
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
    const c = tileCenter(Math.round(p.x), Math.round(p.y));
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

  private coursePaths: { x: number; y: number }[][] = [];
  private courseBoatsGfx: Phaser.GameObjects.Graphics | null = null;
  private courseBoatT = 0;
  /** 놓인 코스들 — 보트 하나가 경로를 천천히 돈다 (P4-C, 손님 승선은 선착장 이용으로 센다) */
  setCourses(paths: readonly (readonly { x: number; y: number }[])[]): void {
    this.coursePaths = paths.map((p) => p.map((q) => ({ ...q })));
    if (!this.courseBoatsGfx) this.courseBoatsGfx = this.add.graphics().setDepth(DEPTH_COURSE_MARK - 1);
    this.drawCourseBoats();
  }
  private tickCourseBoats(dtMs: number): void {
    if (this.coursePaths.length === 0) return;
    this.courseBoatT = (this.courseBoatT + dtMs / 9000) % 1;
    this.drawCourseBoats();
  }
  private drawCourseBoats(): void {
    const g = this.courseBoatsGfx; if (!g) return;
    g.clear();
    if (this.coursePaths.length === 0) { g.setVisible(false); return; }
    g.setVisible(true);
    for (const path of this.coursePaths) {
      if (path.length < 2) continue;
      const n = path.length; const f = this.courseBoatT * n; const k = Math.floor(f); const u = f - k;
      const a = path[k % n] as { x: number; y: number }; const b = path[(k + 1) % n] as { x: number; y: number };
      const c = this.coursePt({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      const r = 6 / this.cam.upscale;
      g.fillStyle(cssColorInt('--course-trial-boat'), 1); g.fillEllipse(c.x, c.y, r * 2.2, r * 1.2);
      g.lineStyle(1, cssColorInt('--course-trial-edge'), 1); g.strokeEllipse(c.x, c.y, r * 2.2, r * 1.2);
      // 견인선 — 선착장까지 얇은 줄
      const d0 = this.coursePt(path[0] as { x: number; y: number });
      g.lineStyle(1, cssColorInt('--course-route'), 0.5); g.beginPath(); g.moveTo(d0.x, d0.y); g.lineTo(c.x, c.y); g.strokePath();
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

  private wireInput(): void {
    this.wirePinch();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
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
      // p.x 는 씬 좌표(텍셀). 팬은 화면 픽셀 기준이라 S 를 곱한다
      const dx = dxRaw * this.cam.upscale;
      const dy = dyRaw * this.cam.upscale;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.cam.pan(dx, dy);
      this.syncCamera();
    });

    const end = (p: Phaser.Input.Pointer): void => {
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

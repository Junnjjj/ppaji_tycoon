import Phaser from 'phaser';
import { Rng } from '../../sim/rng.js';
import {
  GRID_W,
  GRID_H,
  TILE_W,
  TILE_H,
  tileCenter,
  depthKey,
  screenToTile,
  inGrid,
  footprintAnchor,
  STEP_X,
  STEP_Y,
} from '../kairo/iso.js';
import { KairoCamera } from '../kairo/kairo-camera.js';
import { viewport, violatesDotGrid, type Upscale } from '../kairo/upscale.js';
import { KairoProceduralProvider } from '../../assets/kairo-procedural.js';
import { variantId } from '../../assets/types.js';
import type { KairoTerrain } from '../../sim/kairo/terrain.js';
import { WALL_DOOR, type WallGrid } from '../../sim/kairo/walls.js';
import { facilityDef, type PlacementGrid } from '../../sim/kairo/placement.js';
import type { GuestStore, Guest } from '../../sim/kairo/guests.js';
import type { PlaybackFrame } from '../../sim/kairo/week.js';
import {
  bakeGuestAtlas,
  bakeEmoteAtlas,
  bodyFrame,
  faceFrame,
  GUEST_W,
  GUEST_H,
  POSE_SHEET,
  type Pose,
  type Facing,
} from '../../assets/kairo-guest-sprite.js';

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

export interface KairoSceneStats {
  fps: number;
  upscale: Upscale;
  bufferW: number;
  bufferH: number;
  scrollX: number;
  scrollY: number;
  tiles: number;
  /** 세워진 벽·문 수 */
  walls: number;
  /** 놓인 시설 수 */
  facilities: number;
  /** 살아있는 손님 수 */
  guests: number;
  /** 퇴장 만족도 평균 */
  exitSat: number;
  /** 도트 격자 위반 — 비어 있어야 한다 */
  dotGridViolations: readonly string[];
}

export interface KairoSceneOptions {
  provider: KairoProceduralProvider;
  /** 지면 격자 — **시뮬 소유**. 씬은 읽기만 한다 (불변식 1: 의존 방향은 바깥 → sim) */
  terrain: KairoTerrain;
  /** 벽·문 격자 — 역시 시뮬 소유 */
  walls: WallGrid;
  /** 시설 점유 격자 — 역시 시뮬 소유 */
  placement: PlacementGrid;
  /** 손님 — 역시 시뮬 소유. 씬은 읽고 그린다 */
  guests: GuestStore;
  /** 시뮬을 진행시킬지 (검증에서 수동 제어하려면 false) */
  autoTick?: boolean;
  /** 손님 RNG 시드 */
  seed?: number;
  onFrame?: (s: KairoSceneStats) => void;
  /** 탭한 타일 (격자 밖이면 안 부른다) */
  onTapTile?: (i: number, j: number) => void;
}

export class KairoScene extends Phaser.Scene {
  private readonly opts: KairoSceneOptions;
  private readonly cam = new KairoCamera();
  private tileImages: Phaser.GameObjects.Image[] = [];
  /** 벽 이미지 — 있는 칸만 만든다 (1,280개를 미리 만들면 대부분 빈 이미지가 된다) */
  private wallImages = new Map<number, Phaser.GameObjects.Image>();
  /** 시설 이미지 — handle 로 관리한다 (발자국이 여러 칸이라 타일 키로는 못 잡는다) */
  private facilityImages = new Map<number, Phaser.GameObjects.Image>();
  /** 손님 하나당 몸통·표정·이모트 세 이미지 */
  private guestViews = new Map<
    number,
    { body: Phaser.GameObjects.Image; face: Phaser.GameObjects.Image; emote: Phaser.GameObjects.Image }
  >();
  private guestAtlas: ReturnType<typeof bakeGuestAtlas> | null = null;
  private animTick = 0;
  private simAcc = 0;
  /**
   * 압축 연출 상태. 한 주를 0.6초에 계산해도 **3~5초는 보여준다** — 손님이 노는 광경이
   * 이 게임 최대의 보상이라 리플레이로 격리하면 안 된다 (v4 결정).
   */
  private playback: {
    frames: readonly PlaybackFrame[];
    elapsed: number;
    durationMs: number;
    onDone: () => void;
  } | null = null;
  private playbackViews: Phaser.GameObjects.Image[] = [];
  private simTickCount = 0;
  /** 손님 시뮬용 RNG — 씬이 들고 있지만 시드는 주입된다 (결정론) */
  private rng: Rng;
  private dragging = false;
  /** 끌고 있는 코스 핸들 번호 (−1 = 없음) */
  private draggingHandle = -1;
  private courseHandles: { x: number; y: number }[] = [];
  private courseBad = new Set<number>();
  private courseDock: { x: number; y: number } | null = null;
  private courseGfx: Phaser.GameObjects.Graphics | null = null;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };
  private lastTapAt = 0;
  private violations: readonly string[] = [];

  constructor(opts: KairoSceneOptions) {
    super({ key: 'kairo' });
    this.opts = opts;
    this.rng = new Rng(opts.seed ?? 20260818);
  }

  /** 매 tick 같은 스트림을 넘긴다 — 새로 만들면 같은 난수가 반복된다 */
  private tickRng(): Rng {
    return this.rng;
  }

  preload(): void {
    // 프로바이더의 캔버스를 Phaser 텍스처로 등록. AtlasProvider 로 갈아끼워도 같은 경로다
    for (const id of this.opts.provider.ids) {
      if (this.textures.exists(id)) continue;
      this.textures.addCanvas(id, this.opts.provider.get(id));
    }

    // 손님·이모트 아틀라스는 코드로 굽는다 (스펙 §2). 프레임을 하나씩 등록한다
    if (!this.textures.exists('guest')) {
      const atlas = bakeGuestAtlas();
      this.guestAtlas = atlas;
      const tex = this.textures.addCanvas('guest', atlas.canvas);
      if (tex) {
        for (const [name, r] of atlas.frames) tex.add(name, 0, r.x, r.y, r.w, r.h);
      }
    }
    if (!this.textures.exists('emote')) {
      const em = bakeEmoteAtlas();
      const tex = this.textures.addCanvas('emote', em.canvas);
      if (tex) {
        for (const [name, r] of em.frames) tex.add(name, 0, r.x, r.y, r.w, r.h);
      }
    }
  }

  create(): void {
    this.cameras.main.setZoom(1); // ★ 영구히 1
    this.cameras.main.setBackgroundColor('#7ab8d4');
    this.cameras.main.setRoundPixels(true);

    this.buildGround();
    this.buildWalls();
    // 코스 오버레이는 전부보다 위 — 손님·시설에 가리면 못 끈다
    this.courseGfx = this.add.graphics().setDepth(1_000_000).setVisible(false);
    this.rebuildFacilities();
    this.applyScale(this.cam.upscale);
    this.wireInput();

    this.scale.on('resize', () => this.applyScale(this.cam.upscale));
  }

  /** 지면 타일 텍스처 ID — 변형은 좌표로 결정한다 (같은 칸은 항상 같은 그림) */
  private groundTextureId(i: number, j: number): string {
    const kind = this.opts.terrain.kindAt(i, j) ?? 'lawn';
    return variantId(`ground/${kind}`, { alt: (i * 7 + j * 13) % 3 });
  }

  /** 타일 이미지를 한 번 만들어 두고 이후엔 텍스처만 바꾼다 (지면은 안 움직인다) */
  private buildGround(): void {
    for (const img of this.tileImages) img.destroy();
    this.tileImages = [];
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        const c = tileCenter(i, j);
        const img = this.add.image(c.x, c.y + TILE_H / 2, this.groundTextureId(i, j));
        img.setOrigin(0.5, 1); // bottom-center — 계약 앵커
        img.setDepth(depthKey(i, j));
        this.tileImages.push(img);
      }
    }
  }

  /**
   * 시설 하나를 그린다.
   *
   * 앵커는 계약대로 **bottom-center** 이고 위치는 `footprintAnchor` 가 준다 —
   * 발자국 최하단 꼭지점 y 와 바운딩박스 가로중심 x 다. 이 둘을 헷갈리면 비정사각
   * 발자국에서 최대 24텍셀(1.5타일) 밀린다.
   *
   * 깊이는 **발자국의 가장 앞 타일** 기준이다. 시작 타일로 잡으면 큰 시설이 앞의
   * 작은 시설보다 뒤로 밀려 겹침이 뒤집힌다.
   */
  private drawFacility(handle: number): void {
    const item = this.opts.placement.all().find((f) => f.handle === handle);
    if (!item) return;
    const def = facilityDef(item.defId);
    if (!def) return;
    const [w, d] = def.size;
    const a = footprintAnchor(item.i, item.j, w, d);
    const existing = this.facilityImages.get(handle);
    if (existing) {
      existing.setPosition(a.x, a.y);
      return;
    }
    const img = this.add.image(a.x, a.y, item.defId ? `facility/${item.defId}` : '');
    img.setOrigin(0.5, 1);
    img.setDepth(depthKey(item.i + w - 1, item.j + d - 1) + 2);
    this.facilityImages.set(handle, img);
  }

  /** 검증 도구용 — 업스케일을 직접 바꾼다 */
  setUpscale(s: 1 | 2): void {
    this.cam.setUpscale(s);
    this.applyScale(s);
  }

  /** 검증 도구용 — 화면에 올라간 손님 그림 수 */
  guestViewCount(): number {
    return this.guestViews.size;
  }

  /** 검증 도구용 — 시설 이미지를 직접 본다 (앵커 좌표를 수치로 확인) */
  facilityImageAt(handle: number): Phaser.GameObjects.Image | undefined {
    return this.facilityImages.get(handle);
  }

  /** 시설 하나가 놓이거나 지워졌을 때 */
  refreshFacility(handle: number): void {
    const exists = this.opts.placement.all().some((f) => f.handle === handle);
    if (!exists) {
      this.facilityImages.get(handle)?.destroy();
      this.facilityImages.delete(handle);
      return;
    }
    this.drawFacility(handle);
  }

  /** 세이브를 불러온 뒤처럼 이미 시설이 있는 상태를 한 번에 그린다 */
  rebuildFacilities(): void {
    for (const img of this.facilityImages.values()) img.destroy();
    this.facilityImages.clear();
    for (const f of this.opts.placement.all()) this.drawFacility(f.handle);
  }

  /** 세이브를 불러온 뒤처럼 이미 벽이 있는 상태를 한 번에 그린다 */
  private buildWalls(): void {
    for (const img of this.wallImages.values()) img.destroy();
    this.wallImages.clear();
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) this.drawWallCell(i, j);
    }
  }

  /** 벽 텍스처 ID — 문은 런 방향, 벽은 4방 마스크 */
  private wallTextureId(i: number, j: number): string | null {
    const w = this.opts.walls;
    if (!w.has(i, j)) return null;
    if (w.at(i, j) === WALL_DOOR) return `wall/door-${w.doorRun(i, j)}`;
    return variantId('wall/glass', { alt: w.mask(i, j) });
  }

  /**
   * 벽 한 칸의 그림을 갱신하고 **네 이웃도 함께** 갱신한다.
   * 이웃을 빼먹으면 벽을 이어 놓아도 앞 칸이 끝단 모양으로 남아 선이 끊겨 보인다.
   */
  refreshWall(i: number, j: number): void {
    for (const [di, dj] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      this.drawWallCell(i + di, j + dj);
    }
  }

  private drawWallCell(i: number, j: number): void {
    if (!inGrid(i, j)) return;
    const key = j * GRID_W + i;
    const id = this.wallTextureId(i, j);
    const existing = this.wallImages.get(key);
    if (!id) {
      existing?.destroy();
      this.wallImages.delete(key);
      return;
    }
    if (existing) {
      existing.setTexture(id);
      return;
    }
    const c = tileCenter(i, j);
    const img = this.add.image(c.x, c.y + TILE_H / 2, id);
    img.setOrigin(0.5, 1);
    // 지면보다 앞, 같은 칸 시설보다 뒤. depthKey 사이 여유(4096)를 쓴다
    img.setDepth(depthKey(i, j) + 1);
    this.wallImages.set(key, img);
  }

  /**
   * 시뮬 지형이 바뀐 칸의 그림만 갱신한다.
   * 1,280개를 다시 만들지 않는 이유: 칠할 때마다 전부 재생성하면 드래그 중 프레임이 튄다.
   */
  refreshTile(i: number, j: number): void {
    if (!inGrid(i, j)) return;
    const img = this.tileImages[j * GRID_W + i];
    img?.setTexture(this.groundTextureId(i, j));
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

  /**
   * 코스 핸들 오버레이 (§7.3). 점을 주면 그리고, 빈 배열이면 지운다.
   *
   * 핸들은 **화면상 지름 36px** 이어야 손가락으로 정확하다 (스펙). 확대 배율 S 를 나눠
   * 씬 좌표로 환산한다 — 안 하면 S=2 에서 실제 크기가 두 배로 보인다.
   */
  setCourseOverlay(
    handles: readonly { x: number; y: number }[],
    bad: readonly number[],
    dock: { x: number; y: number } | null,
  ): void {
    this.courseHandles = handles.map((h) => ({ ...h }));
    this.courseBad = new Set(bad);
    this.courseDock = dock ? { ...dock } : null;
    this.drawCourseOverlay();
  }

  /** 핸들을 끌 때마다 부른다 — 지표를 실시간으로 갱신하라는 신호 */
  onCourseHandleMove?: (index: number, i: number, j: number) => void;

  private drawCourseOverlay(): void {
    if (!this.courseGfx) return;
    const g = this.courseGfx;
    g.clear();
    if (this.courseHandles.length === 0) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const pt = (p: { x: number; y: number }): { x: number; y: number } => {
      const c = tileCenter(Math.round(p.x), Math.round(p.y));
      return { x: c.x, y: c.y };
    };
    // 경로 — 선착장 → 핸들 순서
    const path = (this.courseDock ? [this.courseDock] : []).concat(this.courseHandles).map(pt);
    if (path.length >= 2) {
      g.lineStyle(2, 0x7ad0ff, 0.85);
      g.beginPath();
      g.moveTo((path[0] as { x: number }).x, (path[0] as { y: number }).y);
      for (let k = 1; k < path.length; k++) {
        g.lineTo((path[k] as { x: number }).x, (path[k] as { y: number }).y);
      }
      // 닫는다 — 코스는 돌아온다
      g.lineTo((path[0] as { x: number }).x, (path[0] as { y: number }).y);
      g.strokePath();
    }
    // 핸들 — 화면 36px 을 씬 좌표로
    const r = 18 / this.cam.upscale;
    for (let k = 0; k < this.courseHandles.length; k++) {
      const c = pt(this.courseHandles[k] as { x: number; y: number });
      const bad = this.courseBad.has(k);
      g.fillStyle(bad ? 0xd8503c : 0x2f9fd0, 0.85);
      g.fillCircle(c.x, c.y, r);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(c.x, c.y, r);
    }
  }

  /** 화면 좌표에서 가장 가까운 핸들 — 없으면 −1 */
  private handleAtPointer(px: number, py: number): number {
    const grab = 22 / this.cam.upscale;
    const view = this.cam.view();
    let best = -1;
    let bestD = grab;
    for (let k = 0; k < this.courseHandles.length; k++) {
      const h = this.courseHandles[k] as { x: number; y: number };
      const c = tileCenter(Math.round(h.x), Math.round(h.y));
      const d = Math.hypot(c.x - view.scrollX - px, c.y - view.scrollY - py);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  private wireInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      /*
       * 핸들 위에서 시작한 드래그는 **카메라가 아니라 핸들**을 옮긴다.
       * 이 분기가 없으면 코스를 조정하려다 화면만 움직여서, 스펙이 말한
       * "손가락으로 끈다"가 성립하지 않는다.
       */
      const hit = this.handleAtPointer(p.x, p.y);
      if (hit >= 0) {
        this.draggingHandle = hit;
        this.dragging = false;
        return;
      }
      this.dragging = true;
      this.dragMoved = 0;
      this.lastPointer = { x: p.x, y: p.y };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.draggingHandle >= 0) {
        const view = this.cam.view();
        const t = screenToTile(p.x + view.scrollX, p.y + view.scrollY);
        const h = this.courseHandles[this.draggingHandle];
        if (h && (h.x !== t.i || h.y !== t.j) && inGrid(t.i, t.j)) {
          h.x = t.i;
          h.y = t.j;
          this.drawCourseOverlay();
          this.onCourseHandleMove?.(this.draggingHandle, t.i, t.j);
        }
        return;
      }
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
      if (this.draggingHandle >= 0) {
        this.draggingHandle = -1;
        return;
      }
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
      /*
       * ⚠ 여기서 `world.y - TILE_H / 2` 를 빼면 안 된다. 그러면 타일 **중심**을 탭했을 때
       * 격자 꼭지점(네 타일이 만나는 점)으로 옮겨져, 반올림 하나로 타일이 뒤집힌다
       * (실측: (10,10) 중심을 탭했는데 (9,10) 이 나왔다). 지면 칠하기로는 이웃 칸이
       * 칠해져도 티가 안 나서 오래 안 잡혔지만, 2×2 시설 배치에서는 곧바로 거절된다.
       *
       * `screenToTile` 은 `gridToScreen` 의 역이고 타일 (i,j) 의 셀 중심이 곧
       * `tileCenter(i,j)` 다 — 그래서 보정 없이 넣는 것이 경계에서 가장 안전하다.
       */
      const t = screenToTile(world.x, world.y);
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

  /**
   * 손님 그리기. 몸통·표정·이모트를 **따로** 얹는다 — 표정을 몸통에 곱하면 1,280셀이
   * 되고, 오버레이면 16셀이면 된다 (스펙 §2.1).
   */
  private syncGuests(): void {
    const live = new Set<number>();
    for (const g of this.opts.guests.all) {
      live.add(g.id);
      let v = this.guestViews.get(g.id);
      if (!v) {
        const body = this.add.image(0, 0, 'guest', bodyFrame(g.palette, 'idle', '+Z', 0));
        body.setOrigin(0.5, 1);
        const face = this.add.image(0, 0, 'guest', faceFrame('calm', '+Z'));
        face.setOrigin(0, 0);
        const emote = this.add.image(0, 0, 'emote', 'e_happy');
        emote.setOrigin(0.5, 1);
        emote.setVisible(false);
        v = { body, face, emote };
        this.guestViews.set(g.id, v);
      }
      this.placeGuest(g, v);
    }
    // 나간 손님 정리
    for (const [id, v] of this.guestViews) {
      if (live.has(id)) continue;
      v.body.destroy();
      v.face.destroy();
      v.emote.destroy();
      this.guestViews.delete(id);
    }
  }

  private placeGuest(
    g: Guest,
    v: { body: Phaser.GameObjects.Image; face: Phaser.GameObjects.Image; emote: Phaser.GameObjects.Image },
  ): void {
    // 타일 보간 — 정수 스냅은 카메라가 하므로 여기서는 소수를 그대로 쓴다
    const t = Math.min(1, Math.max(0, g.progress));
    const fi = g.fromI + (g.i - g.fromI) * t;
    const fj = g.fromJ + (g.j - g.fromJ) * t;
    const cx = STEP_X * (fi - fj);
    const cy = STEP_Y * (fi + fj + 1);

    const pose = g.pose as Pose;
    const sheet = POSE_SHEET[pose];
    // 방향이 그 포즈에 없으면 가장 가까운 것으로 (물속은 방향 2)
    const facing: Facing = sheet.facings.includes(g.facing as Facing)
      ? (g.facing as Facing)
      : (sheet.facings[0] as Facing);
    const frame = sheet.frames <= 1 ? 0 : Math.floor(this.animTick / 6) % sheet.frames;

    v.body.setTexture('guest', bodyFrame(g.palette, pose, facing, frame));
    v.body.setPosition(cx, cy);
    v.body.setDepth(depthKey(g.i, g.j) + 3);

    const off = (this.guestAtlas?.headOffset ?? { [pose]: { x: 4, y: 2 } })[pose] ?? { x: 4, y: 2 };
    v.face.setTexture('guest', faceFrame(g.face, facing));
    v.face.setPosition(cx - GUEST_W / 2 + off.x, cy - GUEST_H + off.y);
    v.face.setDepth(depthKey(g.i, g.j) + 4);
    v.face.setVisible(facing === '+X' || facing === '+Z');

    if (g.emote) {
      v.emote.setTexture('emote', `e_${g.emote}`);
      v.emote.setPosition(cx, cy - GUEST_H - 4);
      v.emote.setDepth(depthKey(g.i, g.j) + 5);
      v.emote.setVisible(true);
    } else {
      v.emote.setVisible(false);
    }
  }

  override update(_time: number, delta: number): void {
    // 압축 연출 중에는 실시간 시뮬을 멈춘다 — 둘이 동시에 돌면 결산과 화면이 어긋난다
    if (this.playback) {
      this.playback.elapsed += delta;
      const t = Math.min(1, this.playback.elapsed / this.playback.durationMs);
      const idx = Math.min(
        this.playback.frames.length - 1,
        Math.floor(t * this.playback.frames.length),
      );
      this.drawPlaybackFrame(this.playback.frames[idx]);
      if (t >= 1) {
        const done = this.playback.onDone;
        this.playback = null;
        this.clearPlayback();
        done();
      }
      this.animTick++;
      this.reportFrame();
      return;
    }

    // 시뮬 — 고정 timestep 10Hz. 배속은 tick 수를 곱한다 (tick 크기가 아니다)
    if (this.opts.autoTick !== false) {
      this.simAcc += delta;
      const MS_PER_TICK = 100;
      let steps = 0;
      while (this.simAcc >= MS_PER_TICK && steps < 5) {
        this.simAcc -= MS_PER_TICK;
        steps++;
        this.simTickCount++;
        this.opts.guests.tick(this.tickRng());
        if (this.simTickCount % 12 === 0) this.opts.guests.spawn(this.tickRng());
      }
    }
    this.animTick++;
    this.opts.guests.advanceRenderProgress(delta / 1000);
    this.syncGuests();
    this.reportFrame();
  }

  /** 압축 연출 시작. `durationMs` 동안 기록을 재생하고 끝나면 `onDone` */
  playWeek(frames: readonly PlaybackFrame[], durationMs: number, onDone: () => void): void {
    if (frames.length === 0) {
      onDone();
      return;
    }
    // 실시간 손님 그림을 치운다 — 기록 재생과 겹치면 두 배로 보인다
    for (const v of this.guestViews.values()) {
      v.body.destroy();
      v.face.destroy();
      v.emote.destroy();
    }
    this.guestViews.clear();
    this.playback = { frames, elapsed: 0, durationMs, onDone };
  }

  get isPlaying(): boolean {
    return this.playback !== null;
  }

  private clearPlayback(): void {
    for (const img of this.playbackViews) img.destroy();
    this.playbackViews = [];
  }

  private drawPlaybackFrame(frame: PlaybackFrame | undefined): void {
    if (!frame) return;
    // 필요한 만큼만 이미지를 늘린다 (프레임마다 만들면 GC 가 튄다)
    while (this.playbackViews.length < frame.guests.length) {
      const img = this.add.image(0, 0, 'guest', bodyFrame(0, 'idle', '+Z', 0));
      img.setOrigin(0.5, 1);
      this.playbackViews.push(img);
    }
    for (let k = 0; k < this.playbackViews.length; k++) {
      const img = this.playbackViews[k] as Phaser.GameObjects.Image;
      const g = frame.guests[k];
      if (!g) {
        img.setVisible(false);
        continue;
      }
      const pose = g.pose as Pose;
      const sheet = POSE_SHEET[pose] ?? POSE_SHEET.idle;
      const facing: Facing = sheet.facings.includes(g.facing as Facing)
        ? (g.facing as Facing)
        : (sheet.facings[0] as Facing);
      const fr = sheet.frames <= 1 ? 0 : Math.floor(this.animTick / 6) % sheet.frames;
      img.setTexture('guest', bodyFrame(g.palette, pose, facing, fr));
      img.setPosition(STEP_X * (g.i - g.j), STEP_Y * (g.i + g.j + 1));
      img.setDepth(depthKey(g.i, g.j) + 3);
      img.setVisible(true);
    }
  }

  private reportFrame(): void {
    const view = this.cam.view();
    const buf = this.cam.bufferSize();
    const gs = this.opts.guests.stats();
    this.opts.onFrame?.({
      fps: Math.round(this.game.loop.actualFps),
      upscale: this.cam.upscale,
      bufferW: buf.w,
      bufferH: buf.h,
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      tiles: this.tileImages.length,
      walls: this.wallImages.size,
      facilities: this.facilityImages.size,
      guests: gs.alive,
      exitSat: gs.exitSatisfaction,
      dotGridViolations: this.violations,
    });
  }

  /** 타일의 지면 종류 — 검증 도구가 "여기는 잔디"임을 확인하는 데 쓴다 */
  groundAt(i: number, j: number): string | null {
    return this.opts.terrain.kindAt(i, j);
  }

  /**
   * 타일 다이아몬드의 **캔버스 픽셀 사각형** (내부 해상도 기준).
   * 검증 도구가 `readPixels` 로 그 자리를 정확히 읽으려면 필요하다 — 좌표를 하네스에
   * 다시 구현하면 투영이 바뀔 때 조용히 엉뚱한 곳을 재게 된다.
   */
  tileScreenRect(i: number, j: number): { x: number; y: number; w: number; h: number } {
    const c = tileCenter(i, j);
    const view = this.cam.view();
    return {
      x: Math.round(c.x - TILE_W / 2 - view.scrollX),
      y: Math.round(c.y - TILE_H / 2 - view.scrollY),
      w: TILE_W,
      h: TILE_H,
    };
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

/** 타일 다이아몬드 크기를 밖에서도 쓸 수 있게 */
export const KAIRO_TILE = { w: TILE_W, h: TILE_H };

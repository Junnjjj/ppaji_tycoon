import Phaser from 'phaser';
import { Rng } from '../../sim/rng.js';
import {
  GRID_W,
  GRID_H,
  TILE_W,
  TILE_H,
  tileCenter,
  gridToScreen,
  depthKey,
  screenToTile,
  inGrid,
  footprintAnchor,
  STEP_X,
  STEP_Y,
  spanDepthKey,
  Z_GROUND,
  Z_WALL_BACK,
  Z_FACILITY,
  Z_WALL_FRONT,
  Z_GUEST,
  Z_FACE,
  Z_EMOTE,
  Z_GHOST,
  LEVEL_H,
  lift,
} from '../kairo/iso.js';
import { KairoCamera } from '../kairo/kairo-camera.js';
import { viewport, violatesDotGrid, type Upscale } from '../kairo/upscale.js';
import { KairoProceduralProvider } from '../../assets/kairo-procedural.js';
import { variantId } from '../../assets/types.js';
import { KairoTerrain } from '../../sim/kairo/terrain.js';
import {
  EDGE_NONE,
  EDGE_DOOR,
  DIR_I_PLUS,
  DIR_J_PLUS,
  DIR_I_MINUS,
  DIR_J_MINUS,
  type Dir,
  type WallGrid,
} from '../../sim/kairo/walls.js';
import { facilityDef, type PlacementGrid } from '../../sim/kairo/placement.js';
import type { GuestStore, Guest } from '../../sim/kairo/guests.js';
import type { PlaybackFrame } from '../../sim/kairo/week.js';
import { busStateAt, BUS_DEFAULT } from '../../sim/kairo/bus.js';
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

/** 경계 네 방향 — 그리기 순서는 뒤(−) → 앞(+) 이라 앞 벽이 뒤 벽을 가린다 */
const WALL_DIRS = [DIR_I_MINUS, DIR_J_MINUS, DIR_I_PLUS, DIR_J_PLUS] as const;

/** 방향 → 이웃 칸 오프셋. 순서는 `walls.ts` 의 상수값(+I,+J,−I,−J)과 같아야 한다 */
const DIR_STEP: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

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
  /**
   * 정류장 버스 (K36-B③) — **위치는 sim 이 준다.**
   *
   * 여기서 자기 시계로 굴리면 스폰 시점과 화면이 갈라져 버스가 떠난 뒤에 손님이 나타난다.
   * 에셋이 아직 없어 임시 사각형이다 (사용자 확인).
   */
  private busGfx: Phaser.GameObjects.Graphics | null = null;

  /** 선착장 후보 (K33) — 편집 중에만 채워진다 */
  private dockTips: { x: number; y: number }[] = [];
  private dockSelected = -1;
  /** 건물 영역의 첫 모서리 표시 — 두 번째 탭을 기다리는 동안 어디를 찍었는지 보여준다 */
  private anchorGfx: Phaser.GameObjects.Graphics | null = null;
  /** 해금된 토지 경계선 (K25) */
  private landGfx: Phaser.GameObjects.Graphics | null = null;
  /**
   * 문 앞 발판 (K32-B) — **입구가 어디고 어느 쪽으로 드나드는지**를 보여준다.
   *
   * 문은 벽 스프라이트의 틈이라 화면에서 눈에 안 띈다. 그런데 K32-B 부터 문 위치는
   * 플레이어가 길을 어디로 냈는지의 **결과**다. 결과가 안 보이면 원인을 못 배운다.
   */
  /*
   * ⚠ 깊이를 두 번 틀렸다. ① 깊이 1 → 지면(칸마다 `depthKey`)이 위로 와서 아무것도
   * 안 보였다. ② 칸 깊이 +1 → 이번엔 **건물 자기 뒷벽**에 가렸다. 게이트가 (0,0)
   * 이라 문은 대개 카메라 반대쪽(−I·−J)에 나고, 그쪽 발판은 벽 뒤가 된다.
   *
   * 그래서 이건 세계 물체가 아니라 **힌트 층**으로 둔다 — 토지 표시(999_999)와 같은
   * 자리다. 반투명이라 밑에 선 손님이 비쳐 보인다. 입구가 어디인지 못 찾는 것보다
   * 살짝 겹쳐 보이는 편이 낫다.
   */
  private doorGfx: Phaser.GameObjects.Graphics | null = null;
  /** 암석 대표색 캐시 — 타일마다 스프라이트를 훑으면 부팅이 느려진다 */
  private rockToneCache: [number, number, number] | null = null;
  /** 그린 발판의 칸 목록 — 검증이 "보인다"를 실제로 물어볼 수 있어야 한다 */
  private doorMarkTiles: { i: number; j: number }[] = [];
  /** 배치 미리보기 (K32) — 확정하기 전의 시설 */
  private ghost: Phaser.GameObjects.Image | null = null;
  /**
   * 해금된 토지 크기 — **기억해 뒀다가 타일이 생기면 적용한다** (K32).
   *
   * ⚠ `setLand` 는 `create()` 보다 먼저 불릴 수 있다 (`bootKairo` 가 씬 생성 전에
   * 돌아온다). 그때 바로 칠하면 타일 배열이 비어 있어 **조용히 아무 일도 안 한다** —
   * K25 부터 토지 표시가 그렇게 죽어 있었고, 아무도 tint 를 안 봐서 못 잡았다.
   * 호출 순서에 기대지 않도록 씬이 값을 들고 있는다.
   */
  private land: { i0: number; j0: number; w: number; h: number } | null = null;
  private backdrops: Phaser.GameObjects.TileSprite[] = [];
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

    this.buildBackdrop();
    this.buildGround();
    this.applyLand(); // 부팅보다 먼저 정해진 토지를 여기서 반영한다
    this.buildWalls();
    // 코스 오버레이는 전부보다 위 — 손님·시설에 가리면 못 끈다
    this.courseGfx = this.add.graphics().setDepth(1_000_000).setVisible(false);
    this.anchorGfx = this.add.graphics().setDepth(1_000_001).setVisible(false);
    this.landGfx = this.add.graphics().setDepth(999_999).setVisible(false);
    this.doorGfx = this.add.graphics().setDepth(999_998);
    // 버스는 차도 위 물체다 — 그 칸의 지면 위, 그 앞줄보다 뒤
    this.busGfx = this.add.graphics();
    this.refreshDoorMarks();
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

  /**
   * 이 칸 위에 놓이는 것들의 화면 y 보정 (K37).
   *
   * ⚠ **칸 위의 모든 것**이 이걸 타야 한다 — 지면·벽·문·시설·손님·고스트·버스·코스 표식.
   * 하나만 빠뜨리면 그것만 땅에 파묻힌다.
   */
  private liftAt(i: number, j: number): number {
    return lift(this.opts.terrain.levelAt(i, j));
  }

  /**
   * 걷는 손님용 — **두 칸 사이를 보간**한 리프트.
   *
   * 정수 칸으로 잡으면 단을 오르는 손님이 한 프레임에 8px 순간이동한다. 깊이는 가까운
   * 칸으로 스냅하지만(`spanDepthKey`) 화면 y 는 이어져야 한다 — 그 둘은 다른 문제다.
   */
  private liftSpan(fi: number, fj: number, i: number, j: number, t: number): number {
    const a = lift(this.opts.terrain.levelAt(Math.round(fi), Math.round(fj)));
    const b = lift(this.opts.terrain.levelAt(i, j));
    return a + (b - a) * Math.min(1, Math.max(0, t));
  }

  /** 이 칸의 +I·+J 쪽으로 떨어지는 단 수 (0 이면 치마가 없다) */
  private dropsAt(i: number, j: number): { di: number; dj: number } {
    const t = this.opts.terrain;
    const z = t.levelAt(i, j);
    // 격자 밖은 기준면(0)으로 본다 — 가장자리의 높은 칸도 치마가 있어야 떠 보이지 않는다
    const nz = (ni: number, nj: number): number => (t.inside(ni, nj) ? t.levelAt(ni, nj) : 0);
    return {
      di: Math.max(0, z - nz(i + 1, j)),
      dj: Math.max(0, z - nz(i, j + 1)),
    };
  }

  /**
   * 지면 텍스처 — 치마가 필요하면 **윗면과 함께 구운 기둥**을 돌려준다 (K37).
   *
   * ## 왜 한 장으로 굽나
   *
   * 치마를 별도 오브젝트로 두면 그 칸 안에서 윗면과 **깊이가 동률**이 된다. 그게 정확히
   * 버그 ①(시설 vs 앞쪽 벽)의 형태다. 한 장이면 깊이 정렬을 아예 안 건드린다 —
   * 칸을 "밑면에 앵커된 기둥"으로 그리면 `(i+j, i)` 순서가 그대로 맞다.
   *
   * ## 색은 지면에서 뽑는다
   *
   * 절벽면 색을 상수로 두면 지면 종류마다 안 맞는다 (잔디 절벽과 모래 절벽이 같은 색).
   * 윗면 텍스처의 가운데 픽셀을 읽어 어둡게 쓴다 — 지면이 바뀌면 절벽도 같이 바뀐다.
   * 좌상단 광원이라 **+J 면(왼쪽 아래)이 밝고 +I 면(오른쪽 아래)이 어둡다** — 두 면이
   * 같은 밝기면 단이 안 읽힌다.
   *
   * ## 정수 스캔라인
   *
   * `fill()` 로 사각형을 그리면 AA 가 1px 이음새와 가짜 아웃라인을 만든다 (K1 계약).
   * 열마다 `fillRect(x, y, 1, h)` 로 채운다 — 2:1 이라 2px 마다 한 칸 내려가는 계단이 된다.
   */
  private columnTextureId(i: number, j: number): string {
    const top = this.groundTextureId(i, j);
    const { di, dj } = this.dropsAt(i, j);
    const z = this.opts.terrain.levelAt(i, j);
    if (di === 0 && dj === 0 && z === 0) return top;
    const id = `__col/${top}/${z}/${di}/${dj}`;
    if (this.textures.exists(id)) return id;

    const hi = di * LEVEL_H;
    const hj = dj * LEVEL_H;
    const H = TILE_H + Math.max(hi, hj);
    const tex = this.textures.createCanvas(id, TILE_W, H);
    if (!tex) return top;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    const src = this.textures.get(top).getSourceImage() as HTMLCanvasElement;
    ctx.drawImage(src, 0, 0);

    // 윗면 가운데 픽셀 = 이 지면의 대표색
    const px = ctx.getImageData(TILE_W / 2, TILE_H / 2, 1, 1).data;
    const base: [number, number, number] = [px[0] as number, px[1] as number, px[2] as number];

    /*
     * ## 높이가 올라가면 **암반**이 된다
     *
     * 절벽면을 지면색만 어둡게 쓰면 "잔디 계단"으로 읽힌다 — 사용자 지적("산처럼
     * 표현되는 부분이 있다던지"). 산은 위로 갈수록 흙·바위가 드러난다.
     *
     * 그래서 단이 높을수록 `terrain/rock` 의 색으로 섞는다. 색을 상수로 박지 않고
     * **이미 있는 암석 스프라이트에서 뽑는다** — 팔레트를 바꾸면 절벽도 같이 바뀐다
     * (`src/ui/tokens.ts` 가 캔버스에서 토큰을 읽는 것과 같은 판단이다).
     */
    const rock = this.rockTone();
    const mixT = Math.min(0.75, z * 0.25);
    const mix = (c: [number, number, number], f: number): string => {
      const m = (k: 0 | 1 | 2): number => Math.round((c[k] * (1 - mixT) + rock[k] * mixT) * f);
      return `rgb(${m(0)} ${m(1)} ${m(2)})`;
    };

    /*
     * 마름모 꼭지점 (텍스처 좌표): 위 (16,0) · 오른 (32,8) · 아래 (16,16) · 왼 (0,8).
     * +I 면은 오른→아래 변, +J 면은 왼→아래 변이다 — 둘 다 카메라 쪽(아래쪽) 절반이다.
     *
     * 좌상단 광원이라 **+J 면(왼쪽 아래)이 밝고 +I 면(오른쪽 아래)이 어둡다.**
     * 두 면이 같은 밝기면 단이 안 읽힌다.
     */
    if (hj > 0) {
      for (let x = 0; x < TILE_W / 2; x++) {
        const yTop = TILE_H / 2 + Math.floor(x / 2) + 1;
        /*
         * 세로로 **아래가 더 어둡다** — 바닥에 가까울수록 그림자가 진다.
         * 단색 면은 종이처럼 평평해 보인다.
         */
        for (let y = 0; y < hj; y++) {
          ctx.fillStyle = mix(base, 0.92 - (y / Math.max(1, hj)) * 0.14);
          ctx.fillRect(x, yTop + y, 1, 1);
        }
      }
    }
    if (hi > 0) {
      for (let x = TILE_W / 2; x < TILE_W; x++) {
        const yTop = TILE_H - Math.floor((x - TILE_W / 2) / 2);
        for (let y = 0; y < hi; y++) {
          ctx.fillStyle = mix(base, 0.74 - (y / Math.max(1, hi)) * 0.12);
          ctx.fillRect(x, yTop + y, 1, 1);
        }
      }
    }

    /*
     * 윗면도 높이를 따라 **살짝 암반 쪽으로** 밀고 어둡게 한다. 이게 없으면 3단 정상이
     * 물가 잔디와 똑같은 색이라 위아래가 안 읽힌다 — 등고선 색띠가 "산"의 절반이다.
     * 아주 약하게만 (0.06/단) — 세게 하면 정상이 회색 사막이 된다.
     */
    if (z > 0) {
      const d = ctx.getImageData(0, 0, TILE_W, TILE_H);
      const t2 = Math.min(0.3, z * 0.1);
      const dim = 1 - z * 0.04;
      for (let k = 0; k < d.data.length; k += 4) {
        if ((d.data[k + 3] as number) < 8) continue;
        for (let c = 0 as 0 | 1 | 2; c < 3; c++) {
          const v = d.data[k + c] as number;
          d.data[k + c] = Math.round((v * (1 - t2) + rock[c] * t2) * dim);
        }
      }
      ctx.putImageData(d, 0, 0);
    }

    tex.refresh();
    return id;
  }

  /**
   * 암석의 대표색 — `terrain/rock` 스프라이트에서 한 번 뽑아 캐시한다.
   *
   * 스프라이트가 없으면 지면색을 탈색해 쓰는 쪽으로 물러난다 (하드코딩 색을 안 만든다).
   */
  /** 검증용 */
  rockToneForTest(): [number, number, number] {
    return this.rockTone();
  }

  private rockTone(): [number, number, number] {
    if (this.rockToneCache) return this.rockToneCache;
    let tone: [number, number, number] = [122, 118, 110];
    if (this.textures.exists('terrain/rock')) {
      const src = this.textures.get('terrain/rock').getSourceImage() as HTMLCanvasElement;
      const cv = document.createElement('canvas');
      cv.width = src.width;
      cv.height = src.height;
      const c2 = cv.getContext('2d');
      if (c2) {
        c2.drawImage(src, 0, 0);
        const d = c2.getImageData(0, 0, cv.width, cv.height).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let k = 0; k < d.length; k += 4) {
          if ((d[k + 3] as number) < 128) continue;
          r += d[k] as number;
          g += d[k + 1] as number;
          b += d[k + 2] as number;
          n++;
        }
        if (n > 0) tone = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      }
    }
    this.rockToneCache = tone;
    return tone;
  }

  /**
   * 지면 타일 하나의 화면 위치. 기둥은 **아래로** 자라므로 앵커를 그만큼 내린다 —
   * 그러면 윗면이 정확히 `lift` 만큼 올라간 자리에 온다.
   */
  private tileAnchorY(i: number, j: number): number {
    const c = tileCenter(i, j);
    const { di, dj } = this.dropsAt(i, j);
    return c.y + TILE_H / 2 + Math.max(di, dj) * LEVEL_H + this.liftAt(i, j);
  }

  /**
   * 배경 3겹 (§7 배경). 산이 제일 멀고, 능선, 강둑 순으로 가까워진다.
   *
   * ## 시차(parallax)가 핵심이다
   *
   * 배경이 지도와 **같은 속도로** 움직이면 그냥 큰 그림 한 장이고, **안 움직이면** 벽지가
   * 된다. 카이로가 주는 "여기가 어디 강변인가"라는 감각은 배경이 지도보다 **느리게**
   * 따라올 때 생긴다. `scrollFactor` 로 산 0.06 · 능선 0.15 · 강둑 0.35 을 준다.
   *
   * ## 왜 셋인가 (K36-B)
   *
   * 둘이면 "가깝다/멀다"뿐이라 거리로 안 읽힌다. 겹이 셋이 되어야 시차가 **단계**가 되고,
   * 그때부터 강 건너가 하늘이 아니라 산자락이 된다. 가장 먼 겹은 시차를 확실히 작게
   * 줘야 한다 — 0.06 은 능선의 절반도 안 되므로 카메라를 크게 밀어도 거의 안 움직인다.
   *
   * `y` 는 겹마다 위로 올린다. 산 −118 은 능선 −70 보다 48px 위라, 능선 실루엣 뒤로
   * 산머리만 솟는다. 같은 y 에 두면 능선이 산을 통째로 가려서 겹을 더한 뜻이 없다.
   *
   * ## 왜 TileSprite 인가
   *
   * 가로로 무한히 이어져야 한다 — 이미지 한 장을 늘리면 늘어난 만큼 흐려지고, 여러 장을
   * 나열하면 이음새를 우리가 관리해야 한다. `TileSprite` 는 GPU 가 wrap 으로 반복한다.
   * 이음새가 안 보이는 근거는 **스프라이트 자체가 좌우로 이어지도록 그려졌다는 것**이다
   * (`drawBackdrop` 의 주기 함수) — 여기서 보정하지 않는다.
   */
  private buildBackdrop(): void {
    for (const img of this.backdrops) img.destroy();
    this.backdrops = [];
    const layers: { id: string; factor: number; y: number }[] = [
      { id: 'backdrop/mountain', factor: 0.06, y: -118 },
      { id: 'backdrop/ridge', factor: 0.15, y: -70 },
      { id: 'backdrop/farbank', factor: 0.35, y: -18 },
    ];
    for (const l of layers) {
      if (!this.opts.provider.has(l.id)) continue;
      const spec = this.opts.provider.spec(l.id);
      if (!spec) continue;
      const [w, h] = spec.size;
      // 화면보다 넉넉히 넓게 — 시차 때문에 카메라보다 덜 움직이므로 여유가 필요하다
      const ts = this.add.tileSprite(0, l.y, w * 8, h, l.id);
      ts.setOrigin(0, 0);
      ts.setScrollFactor(l.factor, l.factor);
      // 지면(depthKey 최소 0)보다 뒤
      ts.setDepth(-1000 + Math.round(l.factor * 100));
      this.backdrops.push(ts);
    }
  }

  /** 타일 이미지를 한 번 만들어 두고 이후엔 텍스처만 바꾼다 (지면은 안 움직인다) */
  private buildGround(): void {
    for (const img of this.tileImages) img.destroy();
    this.tileImages = [];
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        const c = tileCenter(i, j);
        const img = this.add.image(c.x, this.tileAnchorY(i, j), this.columnTextureId(i, j));
        img.setOrigin(0.5, 1); // bottom-center — 계약 앵커
        img.setDepth(depthKey(i, j) + Z_GROUND);
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
    // 단 위의 시설은 같이 올라간다 (K37). 발자국은 단이 균일하므로 시작 칸 하나로 충분하다
    const ay = a.y + this.liftAt(item.i, item.j);
    const existing = this.facilityImages.get(handle);
    if (existing) {
      existing.setPosition(a.x, ay);
      return;
    }
    const img = this.add.image(a.x, ay, item.defId ? `facility/${item.defId}` : '');
    img.setOrigin(0.5, 1);
    img.setDepth(depthKey(item.i + w - 1, item.j + d - 1) + Z_FACILITY);
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

  /**
   * 검증 도구용 — 시뮬 tick 을 멈춘다/재개한다.
   *
   * 깊이 검사는 **같은 자리를 두 번 찍어 비교**한다 (K37). 그 사이에 손님이 걸어
   * 들어오면 달라진 픽셀이 벽 때문인지 손님 때문인지 못 가른다.
   */
  setAutoTick(on: boolean): void {
    this.opts.autoTick = on;
  }

  /** 검증 도구용 — 시설 이미지를 직접 본다 (앵커 좌표를 수치로 확인) */
  /**
   * 검증 도구용 — 지면 타일 그림 하나. **리프트가 실제로 걸렸는지**를 화면 y 로 잰다 (K37).
   *
   * 단을 세워도 그림이 안 올라가면 화면상 평지와 구분이 안 된다. 종류별로(지면·벽·시설·
   * 손님) 재야 하나만 빠뜨린 경우를 잡는다.
   */
  tileImageForTest(i: number, j: number): Phaser.GameObjects.Image | undefined {
    if (!inGrid(i, j)) return undefined;
    return this.tileImages[j * GRID_W + i];
  }

  facilityImageAt(handle: number): Phaser.GameObjects.Image | undefined {
    return this.facilityImages.get(handle);
  }

  /**
   * 검증 도구용 — 경계 벽 이미지의 **깊이**. 없으면 `null`.
   *
   * 픽셀 검사만으로는 "덮였다"의 원인이 깊이인지 스프라이트인지 못 가른다. 수치를
   * 같이 봐야 실패했을 때 어디를 볼지 알 수 있다 (K37).
   */
  wallDepthAt(i: number, j: number, dir: Dir): number | null {
    const img = this.wallImages.get((j * GRID_W + i) * 4 + dir);
    return img ? img.depth : null;
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

  /**
   * 벽 한 칸을 갱신한다 — **그 칸이 소유한 네 경계**를 각각 그린다 (K25).
   *
   * 예전엔 칸 하나에 이미지 하나였다. 이제 경계 하나에 이미지 하나라 최대 4장이다.
   * 키는 `(칸 인덱스) * 4 + 방향` — 방향까지 키에 넣지 않으면 서로 덮어쓴다.
   */
  private drawWallCell(i: number, j: number): void {
    if (!inGrid(i, j)) return;
    for (const dir of WALL_DIRS) this.drawWallEdge(i, j, dir);
  }

  private drawWallEdge(i: number, j: number, dir: Dir): void {
    const key = (j * GRID_W + i) * 4 + dir;
    const kind = this.opts.walls.edgeAt(i, j, dir);
    const existing = this.wallImages.get(key);
    if (kind === EDGE_NONE) {
      existing?.destroy();
      this.wallImages.delete(key);
      return;
    }
    const id = variantId(kind === EDGE_DOOR ? 'wall/door' : 'wall/edge', { alt: dir });
    if (existing) {
      existing.setTexture(id);
      // 지형이 바뀌어 단이 달라졌을 수 있다 — 위치도 같이 맞춘다 (K37)
      existing.setY(tileCenter(i, j).y + TILE_H / 2 + this.liftAt(i, j));
      return;
    }
    const c = tileCenter(i, j);
    const img = this.add.image(c.x, c.y + TILE_H / 2 + this.liftAt(i, j), id);
    img.setOrigin(0.5, 1);
    /*
     * 깊이는 **띠 상수**로만 준다 (`iso.ts` 의 `Z_*`). 뒤쪽 경계(−I·−J)는 그 칸의
     * 지면보다 앞, 시설보다 뒤다 — 뒷벽은 시설에 가려야 안이 보인다.
     *
     * ⚠ 앞쪽 경계(+I·+J)는 **시설보다 앞**이다 (K37). 예전엔 둘 다 `+2` 라 깊이가
     * 동률이었고, Phaser 는 동률이면 삽입 순서로 그린다 — 벽이 부팅 때 먼저 만들어지므로
     * **시설이 늘 벽을 덮어** 실내 시설이 건물 밖으로 삐져나온 것처럼 보였다.
     * 벽은 유리라 시설은 그대로 비치고, 벽 선이 안 끊겨야 "안에 있다"가 읽힌다.
     */
    const back = dir === DIR_I_MINUS || dir === DIR_J_MINUS;
    img.setDepth(depthKey(i, j) + (back ? Z_WALL_BACK : Z_WALL_FRONT));
    this.wallImages.set(key, img);
  }

  /**
   * 경계 벽이 바뀐 뒤 다시 그린다. 경계는 이웃과 공유하므로 **네 이웃까지** 갱신한다.
   * 이웃을 빼먹으면 (i,j) 의 −I 경계가 실제로는 (i−1,j) 의 +I 경계라 갱신이 새어 나간다.
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

  /**
   * 배치 미리보기 (K32) — 확정하기 전에 **실제 스프라이트**를 그 자리에 보여준다.
   *
   * 탭하면 바로 놓던 것을 고스트 + 확정으로 바꾼 이유: 회전과 "장비를 타고 있는 손님"
   * 그림이 나중에 들어온다. 놓기 전에 만질 수 있는 상태가 있어야 그걸 받을 수 있다.
   *
   * `facing` 은 지금 안 쓰지만 **인자를 열어 둔다** — 나중에 방향 스프라이트가 생기면
   * 여기만 바뀌고 부르는 쪽은 그대로다.
   */
  setGhost(defId: string | null, i = 0, j = 0, ok = true, facing = 0): void {
    void facing;
    if (defId === null) {
      this.ghost?.destroy();
      this.ghost = null;
      return;
    }
    const def = facilityDef(defId);
    if (!def) return;
    const [w, d] = def.size;
    const a = footprintAnchor(i, j, w, d);
    // 고스트도 단을 탄다 (K37) — 안 태우면 산 위에서 미리보기가 땅에 파묻힌다
    const ay = a.y + this.liftAt(i, j);
    if (!this.ghost) {
      this.ghost = this.add.image(a.x, ay, `facility/${defId}`);
      this.ghost.setOrigin(0.5, 1);
    } else {
      this.ghost.setTexture(`facility/${defId}`);
      this.ghost.setPosition(a.x, ay);
    }
    this.ghost.setAlpha(0.62);
    // 못 놓는 자리는 붉게 — 확정 바의 경고색과 짝이다
    this.ghost.setTint(ok ? 0x8fe0ff : 0xff6a5a);
    this.ghost.setDepth(depthKey(i + w - 1, j + d - 1) + Z_GHOST);
  }

  /**
   * 해금된 토지를 표시한다 (K25) — 경계선 + 바깥 칸 어둡게.
   *
   * ## 왜 어둡게까지 하나
   *
   * 선만 그으면 "저 밖에도 지을 수 있는데 선이 왜 있지"로 읽힌다. 바깥이 어두우면
   * **아직 내 것이 아니다**가 설명 없이 읽히고, 등급이 올라 밝아지는 순간이 보상이 된다.
   *
   * 등급이 바뀔 때만 부른다 — 타일 3,072장을 매 프레임 만지면 안 된다.
   */
  setLand(rect: { i0: number; j0: number; w: number; h: number }): void {
    this.land = { ...rect };
    this.applyLand();
  }

  /** 기억한 토지를 실제 타일에 칠한다. 타일이 아직 없으면 아무것도 안 하고, `create()` 가 다시 부른다 */
  private applyLand(): void {
    const land = this.land;
    if (!land || this.tileImages.length === 0) return;
    const { i0, j0 } = land;
    const i1 = i0 + land.w;
    const j1 = j0 + land.h;
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        const img = this.tileImages[j * GRID_W + i];
        if (!img) continue;
        /*
         * 도시 띠(위 8줄)는 **어둡게 하지 않는다** — 영원히 못 사는 땅이지 아직 못 산
         * 땅이 아니다. 어둡게 두면 "등급을 올리면 열린다"로 읽힌다.
         */
        if (j < KairoTerrain.CITY_BAND) img.clearTint();
        else if (i >= i0 && i < i1 && j >= j0 && j < j1) img.clearTint();
        else img.setTint(0x5c6470);
      }
    }
    const g = this.landGfx;
    if (!g) return;
    g.clear();
    g.lineStyle(1, 0xffe08a, 0.9);
    // 사각형 네 꼭지점을 아이소로 옮기면 화면에서는 마름모가 된다
    const p0 = gridToScreen(i0, j0);
    const p1 = gridToScreen(i1, j0);
    const p2 = gridToScreen(i1, j1);
    const p3 = gridToScreen(i0, j1);
    g.beginPath();
    g.moveTo(p0.x, p0.y);
    g.lineTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p3.x, p3.y);
    g.closePath();
    g.strokePath();
    g.setVisible(true);
  }

  /**
   * 건물 영역의 첫 모서리를 표시한다 (null 이면 지운다).
   *
   * 표시가 없으면 "한 번 탭했는데 아무 일도 안 일어났다"로 읽혀 같은 칸을 또 찍는다 —
   * 그러면 1×1 이 되어 거절당하고, 왜 거절인지도 모른다.
   */
  setBuildAnchor(i: number | null, j = 0): void {
    const g = this.anchorGfx;
    if (!g) return;
    g.clear();
    if (i === null) {
      g.setVisible(false);
      return;
    }
    const c = tileCenter(i, j);
    g.lineStyle(1, 0x7ad0ff, 1);
    g.beginPath();
    g.moveTo(c.x, c.y - TILE_H / 2);
    g.lineTo(c.x + TILE_W / 2, c.y);
    g.lineTo(c.x, c.y + TILE_H / 2);
    g.lineTo(c.x - TILE_W / 2, c.y);
    g.closePath();
    g.strokePath();
    g.setVisible(true);
  }

  /**
   * 버스를 그린다 (K36-B③). `null` 이면 지운다.
   *
   * 좌표는 소수다 — 버스는 칸 사이를 미끄러진다. 깊이는 **그 칸 기준**으로 잡아야
   * 도로 앞 가로수보다 뒤에 선다.
   */
  setBus(pos: { x: number; y: number } | null): void {
    const g = this.busGfx;
    if (!g) return;
    g.clear();
    if (!pos) {
      g.setVisible(false);
      return;
    }
    const c0 = gridToScreen(pos.x + 0.5, pos.y + 0.5);
    /*
     * 버스도 단을 탄다 (K37). 지금 도시 띠는 전부 단 0 이라 값이 0 이지만, **같은 헬퍼를
     * 태워 둔다** — 나중에 경사 도로가 오면 여기만 바뀌면 된다.
     */
    const c = { x: c0.x, y: c0.y + lift(this.opts.terrain.levelAt(Math.round(pos.x), Math.round(pos.y))) };
    /*
     * 버스는 시설이 아니지만 **시설 띠**를 쓴다 — 버스가 다니는 도시 띠(공원 밖)는
     * 못 짓는 지형이라 같은 칸에 시설이 놓일 수 없고, 그래서 동률이 날 수가 없다.
     * 띠를 하나 더 만들면 "여기는 뭐가 들어오나"를 읽는 사람이 여덟 개를 봐야 한다.
     */
    g.setDepth(depthKey(Math.round(pos.x), Math.round(pos.y)) + Z_FACILITY);
    // 임시 도형 — 아이소 상자 하나. 지붕·앞면·옆면 세 면이면 방향이 읽힌다
    const w = TILE_W * 0.9;
    const h = 16;
    g.fillStyle(0xdc5a3c, 1);
    g.beginPath();
    g.moveTo(c.x, c.y - h);
    g.lineTo(c.x + w / 2, c.y - h + TILE_H / 2);
    g.lineTo(c.x, c.y - h + TILE_H);
    g.lineTo(c.x - w / 2, c.y - h + TILE_H / 2);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xa63f28, 1);
    g.fillRect(c.x - w / 2, c.y - h + TILE_H / 2, w / 2, h);
    g.fillStyle(0xc44e33, 1);
    g.fillRect(c.x, c.y - h + TILE_H / 2, w / 2, h);
    g.setVisible(true);
  }

  /** 문 앞 발판이 그려진 칸들 — 검증용 */
  get doorMarks(): { i: number; j: number }[] {
    return [...this.doorMarkTiles];
  }

  /** 벽이 통째로 바뀌었을 때 (건물 영역 확정 등) — 전부 다시 굽는다 */
  refreshAllWalls(): void {
    this.buildWalls();
    this.refreshDoorMarks();
  }

  /**
   * 문 앞 발판을 전부 다시 그린다 (K32-B).
   *
   * 부분 갱신을 안 하는 이유는 벽 굽기와 같다 — 문은 `bakeIndoorWalls` 가 **매번 전부**
   * 다시 고르므로, 한 칸만 지우면 옛 발판이 남는다. 격자 전체 순회라 해도 셀 3천 개다.
   */
  refreshDoorMarks(): void {
    const g0 = this.doorGfx;
    if (!g0) return;
    g0.clear();
    this.doorMarkTiles = [];
    /*
     * ⚠ **한 경계가 두 번 잡힌다.** (2,3)의 +I 와 (3,3)의 −I 는 같은 경계다 (K25 —
     * −I·−J 는 이웃이 소유하고 `edgeAt` 은 그걸 되비춰 준다). 순회하며 그대로 그리면
     * 발판이 문 안쪽에도 깔린다 — 실측으로 새 판에서 2칸이 나왔다.
     *
     * 그래서 **바깥 칸에만** 한 장 그린다. 바깥은 실내가 아닌 쪽이다.
     */
    const seen = new Set<number>();
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        for (const dir of WALL_DIRS) {
          if (this.opts.walls.edgeAt(i, j, dir) !== EDGE_DOOR) continue;
          const d = DIR_STEP[dir];
          if (!d) continue;
          const ni = i + d[0];
          const nj = j + d[1];
          // 두 칸 중 실내가 아닌 쪽이 바깥이다. 둘 다 실내면 문이 아니다 (있을 수 없다)
          const outsideHere = !this.opts.terrain.isIndoor(i, j);
          const oi = outsideHere ? i : ni;
          const oj = outsideHere ? j : nj;
          const ti = outsideHere ? d[0] : -d[0];
          const tj = outsideHere ? d[1] : -d[1];
          const key = oj * GRID_W + oi;
          if (seen.has(key)) continue;
          seen.add(key);
          this.drawDoorMark(oi, oj, ti, tj);
        }
      }
    }
  }

  /** 발판 한 장 — 마름모를 채우고, 문 쪽으로 향하는 화살표를 얹는다 */
  private drawDoorMark(i: number, j: number, ti: number, tj: number): void {
    const g = this.doorGfx;
    if (!g || !inGrid(i, j)) return;
    this.doorMarkTiles.push({ i, j });
    const c0 = tileCenter(i, j);
    const c = { x: c0.x, y: c0.y + this.liftAt(i, j) };
    g.fillStyle(0xffe08a, 0.28);
    g.beginPath();
    g.moveTo(c.x, c.y - TILE_H / 2);
    g.lineTo(c.x + TILE_W / 2, c.y);
    g.lineTo(c.x, c.y + TILE_H / 2);
    g.lineTo(c.x - TILE_W / 2, c.y);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0xffe08a, 0.85);
    g.strokePath();

    /*
     * 화살표 — 격자 방향을 화면 방향으로 옮긴다. 아이소라 (i,j) 증가가 화면에서
     * 대각선이므로, 타일 반칸을 그대로 쓰면 마름모 안에 딱 맞는다.
     */
    const ax = ((ti + tj) * TILE_W) / 4;
    const ay = ((tj - ti) * TILE_H) / 4;
    const nx = -ay;
    const ny = ax;
    g.beginPath();
    g.moveTo(c.x + ax, c.y + ay);
    g.lineTo(c.x - ax * 0.4 + nx * 0.45, c.y - ay * 0.4 + ny * 0.45);
    g.lineTo(c.x - ax * 0.4 - nx * 0.45, c.y - ay * 0.4 - ny * 0.45);
    g.closePath();
    g.fillStyle(0xffe08a, 0.9);
    g.fillPath();
  }

  /**
   * 시뮬 지형이 바뀐 칸의 그림만 갱신한다.
   * 1,280개를 다시 만들지 않는 이유: 칠할 때마다 전부 재생성하면 드래그 중 프레임이 튄다.
   */
  refreshTile(i: number, j: number): void {
    if (!inGrid(i, j)) return;
    /*
     * ⚠ **−I·−J 이웃까지 갱신한다** (K37). 치마는 자기 칸이 그리지만 그 높이는 이웃의
     * 단으로 정해진다 — 이 칸이 바뀌면 이웃의 치마도 틀려진다. 벽이 경계를 공유해
     * 네 이웃을 갱신하는 것(`refreshWall`)과 같은 종류의 사고다.
     */
    for (const [di, dj] of [
      [0, 0],
      [-1, 0],
      [0, -1],
    ] as const) {
      const ti = i + di;
      const tj = j + dj;
      if (!inGrid(ti, tj)) continue;
      const img = this.tileImages[tj * GRID_W + ti];
      if (!img) continue;
      img.setTexture(this.columnTextureId(ti, tj));
      img.setY(this.tileAnchorY(ti, tj));
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

  /**
   * 선착장 후보를 지도에 표시한다 (K33). 편집을 닫을 땐 빈 배열로 끈다.
   *
   * 예전엔 코드가 찾은 **첫 번째** 데크로 고정이라 플레이어가 못 골랐다. 카이로답게
   * 목록이 아니라 **화면에서 직접** 고르게 한다 — 그래서 후보가 지도에 보여야 한다.
   */
  setDockChoices(tips: readonly { x: number; y: number }[], selected: number): void {
    this.dockTips = tips.map((t) => ({ ...t }));
    this.dockSelected = selected;
    this.drawCourseOverlay();
  }

  /** 선착장 후보를 탭했을 때 */
  onCourseDockPick?: (index: number) => void;

  /** 지금 표시 중인 선착장 후보 — 검증용 */
  get dockMarks(): { x: number; y: number }[] {
    return this.dockTips.map((t) => ({ ...t }));
  }

  private drawCourseOverlay(): void {
    if (!this.courseGfx) return;
    const g = this.courseGfx;
    g.clear();
    if (this.courseHandles.length === 0 && this.dockTips.length === 0) {
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
    /*
     * 선착장 후보 — 핸들보다 **먼저** 그린다. 겹치면 핸들이 위에 와야 한다
     * (끌던 것을 계속 끌 수 있어야 하고, 탭 판정도 핸들이 우선이다).
     */
    for (let k = 0; k < this.dockTips.length; k++) {
      const c = pt(this.dockTips[k] as { x: number; y: number });
      const on = k === this.dockSelected;
      const rr = (on ? 16 : 13) / this.cam.upscale;
      g.fillStyle(0xffe08a, on ? 0.9 : 0.35);
      g.fillCircle(c.x, c.y, rr);
      g.lineStyle(2, 0xffe08a, on ? 1 : 0.6);
      g.strokeCircle(c.x, c.y, rr);
      // 안쪽 점 — 선택된 것만. 색만 다르면 작은 화면에서 구분이 안 된다
      if (on) {
        g.fillStyle(0x12212c, 0.9);
        g.fillCircle(c.x, c.y, rr * 0.42);
      }
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

  /** 화면 좌표에서 가장 가까운 선착장 후보 — 없으면 −1 */
  private dockAtPointer(px: number, py: number): number {
    const grab = 22 / this.cam.upscale;
    const view = this.cam.view();
    let best = -1;
    let bestD = grab;
    for (let k = 0; k < this.dockTips.length; k++) {
      const t = this.dockTips[k] as { x: number; y: number };
      const c = tileCenter(Math.round(t.x), Math.round(t.y));
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
      /*
       * 선착장 후보를 탭했나 — **더블탭 확대보다 먼저** 본다. 뒤에 두면 후보를 두 번
       * 눌렀을 때 선택이 아니라 확대가 걸린다.
       */
      const dockHit = this.dockAtPointer(p.x, p.y);
      if (dockHit >= 0) {
        this.lastTapAt = 0;
        this.onCourseDockPick?.(dockHit);
        return;
      }
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
    // 손님도 단을 탄다 (K37). 리프트는 **보간**한다 — 정수 칸으로 잡으면 8px 순간이동한다
    const cy = STEP_Y * (fi + fj + 1) + this.liftSpan(g.fromI, g.fromJ, g.i, g.j, t);

    const pose = g.pose as Pose;
    const sheet = POSE_SHEET[pose];
    // 방향이 그 포즈에 없으면 가장 가까운 것으로 (물속은 방향 2)
    const facing: Facing = sheet.facings.includes(g.facing as Facing)
      ? (g.facing as Facing)
      : (sheet.facings[0] as Facing);
    const frame = sheet.frames <= 1 ? 0 : Math.floor(this.animTick / 6) % sheet.frames;

    /*
     * 깊이는 **출발 칸과 목적 칸 중 가까운 쪽**이다 (K37). 목적 칸만 쓰면 위로
     * (= `i+j` 가 줄어드는 쪽으로) 걸을 때 이동이 시작되는 순간 깊이가 먼 칸 값으로
     * 뚝 떨어지는데 그림은 아직 출발 칸 위에 있어 **출발 칸의 지면이 손님을 덮었다**
     * (실측: 아래로 갈 때는 반대라 안 보였다).
     */
    const dk = spanDepthKey(g.fromI, g.fromJ, g.i, g.j);

    v.body.setTexture('guest', bodyFrame(g.palette, pose, facing, frame));
    v.body.setPosition(cx, cy);
    v.body.setDepth(dk + Z_GUEST);

    const off = (this.guestAtlas?.headOffset ?? { [pose]: { x: 4, y: 2 } })[pose] ?? { x: 4, y: 2 };
    v.face.setTexture('guest', faceFrame(g.face, facing));
    v.face.setPosition(cx - GUEST_W / 2 + off.x, cy - GUEST_H + off.y);
    v.face.setDepth(dk + Z_FACE);
    v.face.setVisible(facing === '+X' || facing === '+Z');

    if (g.emote) {
      v.emote.setTexture('emote', `e_${g.emote}`);
      v.emote.setPosition(cx, cy - GUEST_H - 4);
      v.emote.setDepth(dk + Z_EMOTE);
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
    /*
     * 버스는 **프레임의 tick** 으로 다시 센다 (K36-B③).
     *
     * `BusRunner` 의 tick 은 주 계산 안에서만 흐른다 — 0.6초에 다 흐르고 멈춘다.
     * 연출은 그 뒤 3.5초 동안 기록을 되감는 것이라, 러너를 읽으면 버스는 **주가 끝난
     * 자리에 붙박여** 있고 손님만 움직인다. 내려서 걸어 들어오는 장면이 이 연출의
     * 요점인데 정작 태워 온 버스가 안 움직이면 앞뒤가 안 맞는다.
     *
     * `busStateAt` 은 순수 함수라 기록에 버스 위치를 같이 담을 필요가 없다 —
     * tick 하나면 같은 답이 나온다 (세이브도 안 커진다).
     */
    const bs = busStateAt(frame.tick, BUS_DEFAULT);
    this.setBus(bs.visible ? bs.pos : null);
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
      // 재생 프레임은 tick 스냅이라 보간이 없다 — 도착 칸의 단을 쓴다 (K37)
      img.setPosition(
        STEP_X * (g.i - g.j),
        STEP_Y * (g.i + g.j + 1) + lift(this.opts.terrain.levelAt(g.i, g.j)),
      );
      // 실시간과 **같은 규칙** — 두 칸 중 가까운 쪽 (K37). 재생 프레임에 출발 칸을
      // 같이 담는 이유가 이것이다 (`PlaybackFrame`). 세이브에는 안 들어간다
      img.setDepth(spanDepthKey(g.fromI, g.fromJ, g.i, g.j) + Z_GUEST);
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

  /**
   * 손님 몸통의 **캔버스 픽셀 사각형** — `tileScreenRect` 의 손님 판.
   *
   * 걷는 손님은 칸 사이 소수 위치에 있어 타일 사각형으로는 못 짚는다. 깊이 검사가
   * "이 자리에 손님이 보이나"를 재려면 실제로 그려진 자리가 필요하다 (K37).
   */
  guestScreenRect(id: number): { x: number; y: number; w: number; h: number } | null {
    const v = this.guestViews.get(id);
    if (!v) return null;
    const b = v.body;
    const view = this.cam.view();
    return {
      x: Math.round(b.x - b.displayWidth / 2 - view.scrollX),
      y: Math.round(b.y - b.displayHeight - view.scrollY),
      w: Math.round(b.displayWidth),
      h: Math.round(b.displayHeight),
    };
  }

  /** 검증 도구용 — 손님 몸통의 깊이. 없으면 `null` */
  guestDepthAt(id: number): number | null {
    return this.guestViews.get(id)?.body.depth ?? null;
  }

  /** 현재 확대 배율 — 감상 화면·검증이 읽는다 */
  get upscale(): Upscale {
    return this.cam.upscale;
  }

  /** 검증용 — 배경 띠의 개수와 시차 계수 */
  get backdropInfo(): { count: number; factors: number[]; depths: number[] } {
    return {
      count: this.backdrops.length,
      factors: this.backdrops.map((b) => b.scrollFactorX),
      depths: this.backdrops.map((b) => b.depth),
    };
  }

  /**
   * 격자 전체가 화면에 들어오도록 맞춘다 — 감상 화면이 쓴다.
   *
   * 확대 배율은 이미 1 이어야 한다 (감상 화면이 먼저 내린다). 여기서는 **중앙만** 맞춘다 —
   * 격자가 화면보다 크면 다 안 들어오지만, 그건 축소 단계를 더 만드는 문제고 정수 배율만
   * 쓰기로 한 결정과 부딪힌다. 지금은 리조트 중심을 잡아 주는 것이 옳다.
   */
  fitAll(): void {
    this.focusTile(Math.floor(GRID_W / 2), Math.floor(GRID_H / 2));
  }

  /**
   * 이 칸을 화면 중앙에 놓는다.
   *
   * 예전엔 중심을 옮길 수단이 없어 **스크롤 차이만큼 팬**했다. 팬은 고무줄(`clampSoft`)을
   * 타므로 가장자리 근처에서 목표를 못 맞춘다. `centerOn` 이 생겨서(K33) 그냥 옮긴다.
   *
   * `bottomInsetCss` 는 화면 아래가 UI 에 가려진 만큼 — 그 위쪽 중앙에 놓는다.
   */
  focusTile(i: number, j: number, bottomInsetCss = 0): void {
    this.cam.centerOn(tileCenter(i, j), bottomInsetCss);
    this.syncCamera();
  }

  /**
   * 코스 전체(선착장 + 핸들)를 **보이는 영역 안에** 잡는다 (K33).
   *
   * ## 왜 필요했나 (실측)
   *
   * 코스 탭을 열면 핸들의 화면 좌표가 **x = −284, −380** 이었다. 패널은 "핸들은 화면에서
   * 직접 끈다"고 적어 뒀는데 끌 게 화면에 없었다. 기존 브라우저 검사가 이걸 못 잡은 이유는
   * `moveHandleForTest` 로 **좌표를 직접 넣어서** — 화면을 아무도 안 봤다.
   *
   * 경계상자가 안 들어가면 배율을 1로 내린다. 허용 배율이 `[1, 2]` 뿐이라 한 단이 전부다.
   */
  frameCourse(
    dock: { x: number; y: number } | null,
    handles: readonly { x: number; y: number }[],
    bottomInsetCss = 0,
  ): void {
    const pts = (dock ? [dock] : []).concat(handles).map((p) => tileCenter(Math.round(p.x), Math.round(p.y)));
    if (pts.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    // 타일 한 칸 + 핸들 반지름만큼 여유 — 끝 핸들이 화면 끝에 딱 붙으면 못 잡는다
    const pad = TILE_W;
    const box = { w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    if (this.cam.upscale !== 1 && !this.cam.fits(box, bottomInsetCss)) {
      this.cam.setUpscale(1);
      this.applyScale(1);
    }
    this.cam.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, bottomInsetCss);
    this.syncCamera();
  }
}

/** 타일 다이아몬드 크기를 밖에서도 쓸 수 있게 */
export const KAIRO_TILE = { w: TILE_W, h: TILE_H };

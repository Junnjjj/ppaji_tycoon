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

/**
 * 지도 바깥을 채우는 **지형** 텍스처 (K38).
 *
 * 그림 파일이 아니라 게임의 지면 스프라이트를 구운 것이다.
 * 왜 그림이 아닌지는 `bakeSurroundTexture` 에 한 번만 적어 뒀다.
 */
const SURROUND_TEX = 'surround/ground';
/** 지형을 바운딩 박스보다 얼마나 더 넓게 굽나 — 카메라 여백 + 고무줄을 덮는다 */
const SURROUND_PAD = 128;
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
import { cssColorInt } from '../../ui/tokens.js';
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
   * 낮밤 틴트 (K39). 압축 연출은 흐르는 낮으로 대체됐다 — 손님이 노는 광경이 이 게임
   * 최대의 보상이라(v4), 리플레이 3.5초가 아니라 **기본 상태**로 만들었다.
   * 하루 안의 시각은 렌더 전용이다 — sim 은 tick 만 안다 (불변식 1).
   */
  private dayTint: Phaser.GameObjects.Rectangle | null = null;
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
  /**
   * 지도 바깥을 채우는 땅 (K38) — **한 장**이다.
   *
   * 굽기가 바운딩 박스 전체를 캔버스 하나로 내므로(`bakeSurroundTexture`) 겹이 늘어날
   * 여지가 없다. 배경(`backdrops`)이 배열인 것과 헷갈리지 말 것 — 저쪽은 시차 단계가
   * 겹의 이유다.
   */
  private surround: Phaser.GameObjects.Image | null = null;

  /**
   * **일부러 망가뜨리는 스위치** — 검사가 정말 잡는지 재려고 둔다 (K38 점검 후속).
   *
   * 이 저장소는 "조용히 통과하는 검사"에 열 번 물렸다. 그래서 새 ★ 검사에는 음성
   * 대조군이 있어야 하는데, 렌더 쪽은 소스를 고쳐야 재현되어 손으로만 해 왔다
   * (아키텍처 점검: 새 ★ 18개 중 코드에 붙은 대조군은 1개뿐이었다).
   *
   * `seam --selftest` 가 픽셀에 위반을 주입하듯, 여기서는 **그리기 규칙**에 주입한다.
   * 검사는 정상 → 통과, 주입 → 실패를 **둘 다** 확인해야 의미를 갖는다.
   *
   * ⚠ 이 값은 검증 도구만 만진다. 켜면 화면이 실제로 깨지므로 게임 코드는 안 읽는다.
   */
  private fault: { wallDepthTie: boolean; skirtGap: boolean; noLift: boolean } = {
    wallDepthTie: false,
    skirtGap: false,
    noLift: false,
  };

  /**
   * 검증 도구용 — 그리기 결함을 켜고 화면을 다시 만든다.
   *
   * 이름은 **무엇이 깨지는지**로 짓는다: `wall-depth-tie`(앞벽과 시설 깊이 동률 = K37 ①
   * 되돌리기) · `skirt-gap`(치마 시작 줄 +1 = K38 실틈 되돌리기) · `no-lift`(단 리프트 0
   * = K37 ⑤ 되돌리기).
   */
  /**
   * 검증 도구용 — **앞벽과 시설의 깊이**를 실제 오브젝트에서 읽는다 (K38 점검 후속).
   *
   * 띠 상수를 읽어 비교하면 상수끼리의 산수라 그리기가 틀려도 통과한다. 화면에 올라간
   * 것에서 읽어야 "정말 그렇게 그렸나"를 잰다.
   */
  depthProbeForTest(): { wall: number; facility: number } | null {
    let wall = -1;
    for (const [key, img] of this.wallImages) {
      const dir = key % 4;
      if (dir === DIR_I_PLUS || dir === DIR_J_PLUS) {
        wall = img.depth - depthKey(Math.floor(key / 4) % GRID_W, Math.floor(key / 4 / GRID_W));
        break;
      }
    }
    const f = this.facilityImages.values().next();
    if (wall < 0 || f.done) return null;
    const item = this.opts.placement.all()[0];
    if (!item) return null;
    const def = facilityDef(item.defId);
    if (!def) return null;
    const [w, d] = def.size;
    return {
      wall,
      facility: f.value.depth - depthKey(item.i + w - 1, item.j + d - 1),
    };
  }

  setRenderFaultForTest(name: 'wall-depth-tie' | 'skirt-gap' | 'no-lift' | 'none'): void {
    this.fault = { wallDepthTie: false, skirtGap: false, noLift: false };
    if (name === 'wall-depth-tie') this.fault.wallDepthTie = true;
    else if (name === 'skirt-gap') this.fault.skirtGap = true;
    else if (name === 'no-lift') this.fault.noLift = true;
    /*
     * 깊이·위치·텍스처가 만들 때 정해지므로 **다시 만들어야** 결함이 화면에 나온다.
     * 컬럼 텍스처는 결함을 키에 넣어 캐시가 섞이지 않게 한다 (`columnTexture`).
     */
    this.buildGround();
    this.buildWalls();
    this.rebuildFacilities();
    this.applyLand();
  }
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

    this.bakeSurroundTexture();

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
    /*
     * 하늘색. **평소엔 한 픽셀도 안 보인다** — 지도 바깥까지 지형이 덮기 때문이다 (K38).
     * 굽기가 실패했을 때만 절차적 배경과 함께 드러나는 안전망 색이다.
     */
    this.cameras.main.setBackgroundColor('#7ab8d4');
    this.cameras.main.setRoundPixels(true);

    this.buildBackdrop();
    this.buildSurround();
    this.buildGround();
    this.applyLand(); // 부팅보다 먼저 정해진 토지를 여기서 반영한다
    this.buildWalls();
    // 코스 오버레이는 전부보다 위 — 손님·시설에 가리면 못 끈다
    this.courseGfx = this.add.graphics().setDepth(1_000_000).setVisible(false);
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
    if (this.fault.noLift) return 0; // 검사용 결함 (K38 점검 후속)
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
    const { di, dj } = this.dropsAt(i, j);
    return this.columnTexture(this.groundTextureId(i, j), this.opts.terrain.levelAt(i, j), di, dj);
  }

  /**
   * 윗면 텍스처 + 단 + 낙차로 **기둥 한 장**을 만든다 (K38 에서 분리).
   *
   * 격자 안 타일과 **지도 바깥 장식**이 같은 함수를 쓴다 — 안팎이 다른 코드로 그려지면
   * 절벽 모양·색·이음이 미묘하게 갈라지고, 그 차이가 곧 경계선으로 보인다.
   */
  private columnTexture(top: string, z: number, di: number, dj: number): string {
    if (di === 0 && dj === 0 && z === 0) return top;
    const id = `__col/${top}/${z}/${di}/${dj}${this.fault.skirtGap ? '/gap' : ''}`;
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
        /*
         * ⚠ `+1` 을 더하지 말 것. 윗면의 왼아래 변은 (0,8)→(16,16) 이라 열 x 의 마지막
         * 불투명 픽셀이 `8 + x/2` 이고, 치마는 **바로 그 줄부터** 시작해야 붙는다.
         * 한 줄 밀었더니 윗면과 치마 사이에 1px 구멍이 뚫려 하늘색이 새어 나왔다 —
         * 단 지형 가장자리마다 파란 점선으로 보였다 (K37 부터 있었고, K38 에서 배경이
         * 밝아지며 드러났다).
         */
        const yTop = TILE_H / 2 + Math.floor(x / 2) + (this.fault.skirtGap ? 1 : 0);
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
        /*
         * +J 면과 **대칭**이다 (열 x 의 거울은 TILE_W−1−x). 대칭식을 안 쓰고 따로
         * 세웠더니 한 줄씩 어긋나 구멍이 154곳 생겼다 — 눈으로는 못 봤고 검사가 잡았다.
         */
        const yTop = TILE_H / 2 + Math.floor((TILE_W - 1 - x) / 2);
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
   * 지도 바깥에 깔 **지면을 한 장으로** 굽는다 (K38).
   *
   * ## 왜 그림 파일이 아닌가 — ★ 이 파일에서 가장 되돌리기 쉬운 결정이다
   *
   * 처음엔 산 아트에서 뽑은 숲 PNG 를 깔았는데, 사용자가 "숲이 아니고 현재 지형을
   * 깔아달라고, PNG 말고, 현재 설치된 땅 기준으로" 라고 했다. 다른 붓으로 그린 텍스처는
   * 경계에서 결이 어긋나 "여기부터는 딴 그림"으로 읽힌다. 실제로 그려진 산을 세워 봤더니
   * 눈이 그 수평선을 곧바로 **"무대 뒤에 세운 벽"**으로 읽었다.
   *
   * 레퍼런스가 이미 낸 답이기도 하다 (`art-reference/competitor/README.md`, 2026-08-17):
   * Pool Slide Story 는 경계를 아예 안 보여 주고, Terra Nil 은 플레이 영역 밖을
   * **같은 스케일 지형**으로 덮는다. 그림을 다시 세우고 싶어지면 여기를 먼저 읽을 것.
   *
   * ## 왜 한 종류로 깔면 안 되나
   *
   * 잔디 한 종류로 반복해 깔아 봤더니 **균일한 빈 들판**이 됐다 — "밖에도 세상이 있다"가
   * 아니라 "아무것도 없다"로 읽힌다 (사용자: "생각보다 어색하네"). 그래서 좌표를 격자
   * 안으로 **클램프**해서 그 칸의 종류를 쓴다: 강은 강으로, 도로는 도로로, 잔디는
   * 잔디로 — 지도가 화면 밖으로 **이어진다**. K36 의 세이브 마이그레이션이 격자를
   * 넓힐 때 쓴 것과 같은 수법이다.
   *
   * ## 왜 타일 이미지가 아니라 캔버스 한 장인가
   *
   * 바깥을 타일 이미지로 깔면 **7,000장**이 더 필요하다 (바깥 넓이 ÷ 격자점 밀도 256).
   * 지금 6,912장으로 도는 판에 두 배를 얹으면 폰에서 위험하다. 한 장으로 구우면
   * 그리기 비용이 부팅 때 한 번이고 매 프레임 비용은 0 이다.
   *
   * ⚠ 구운 뒤에는 **갱신하지 않는다.** 플레이어가 가장자리 칸을 칠하면 바깥 띠는 옛
   * 종류로 남는다 — 장식이라 눈에 안 띄고, 매번 다시 구우면 붓질마다 수천 번 그린다.
   */
  private bakeSurroundTexture(): void {
    if (this.textures.exists(SURROUND_TEX)) return;
    const t = this.opts.terrain;

    /*
     * 다이아몬드의 **바운딩 박스**. 꼭지점이 (0,0)·(gw,0)·(gw,gh)·(0,gh) 이므로
     * 화면에서 x 는 −gh·STEP_X … gw·STEP_X, y 는 0 … (gw+gh)·STEP_Y 다.
     */
    /*
     * 여백(`PAD`)을 둘러 굽는다 — 카메라가 바운딩 박스보다 조금 더 나갈 수 있기 때문이다
     * (`BACKDROP_ABOVE/BELOW` 48 + 고무줄 `ELASTIC` 40). 딱 맞추면 그 순간 가장자리에
     * 하늘색 띠가 번뜩인다. **하늘은 어디서도 보이면 안 된다** (K38).
     */
    const PAD = SURROUND_PAD;
    const W = (GRID_W + GRID_H) * STEP_X + PAD * 2;
    const H = (GRID_W + GRID_H) * STEP_Y + PAD * 2;
    const ox = GRID_H * STEP_X + PAD; // 캔버스 원점이 월드 x = −GRID_H·STEP_X − PAD 에 놓인다
    const tex = this.textures.createCanvas(SURROUND_TEX, W, H);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const clamp = (v: number, hi: number): number => (v < 0 ? 0 : v > hi ? hi : v);

    /*
     * ## 바깥은 **산으로 올라간다**
     *
     * 가장자리를 그대로 잇기만 하면 잔디가 끝없이 펼쳐져 "아무것도 없다"로 읽힌다
     * (사용자: "생각보다 어색하네"). 격자에서 멀어질수록 단을 올려 **공원이 골짜기에
     * 앉은** 모양을 만든다 — 공원 → 도로 → 산자락 → 화면 밖까지 **전부 게임 지형**이다.
     *
     * ⚠ 물은 안 올린다. 강은 강으로 흘러 나가야 한다 (K37 과 같은 규칙).
     * ⚠ 격자 안 타일과 **같은 기둥 함수**(`columnTexture`)를 쓴다. 다른 코드로 그리면
     *   절벽 모양·색이 미묘하게 갈라지고 그 차이가 곧 경계선으로 보인다.
     */
    const outside = (i: number, j: number): number =>
      Math.max(0, -i, i - (GRID_W - 1), -j, j - (GRID_H - 1));
    const isWet = (i: number, j: number): boolean => {
      const k = t.kindAt(clamp(i, GRID_W - 1), clamp(j, GRID_H - 1));
      return k === 'water_edge' || k === 'path_sand';
    };
    /** 장식 단 — 격자에서 멀수록 높다. 흔들림은 사인 합이라 난수 없이 결정론적이다 */
    const deco = (i: number, j: number): number => {
      if (isWet(i, j)) return 0;
      const d = outside(i, j);
      if (d === 0) return 0;
      /*
       * 흔들림은 **저주파 사인 합**이다. 좌표 해시(`(i*13+j*29)%7`)로 흔들었더니 칸마다
       * 값이 튀어 계단이 격자무늬로 보였다 (실측). 사인은 이웃끼리 값이 이어져
       * 등고선이 부드럽게 굽고, 난수가 아니라 결정론적이다.
       */
      const wob = 3.2 * Math.sin(i * 0.11) + 3.2 * Math.sin(j * 0.13) + 1.6 * Math.sin((i + j) * 0.07);
      return Math.max(0, Math.min(3, Math.floor((d + wob) / 7)));
    };

    /*
     * 그리는 순서가 곧 겹침 순서다 — `i+j` 오름차순, 같으면 `i` 오름차순.
     * 화면 깊이(`depthKey`)와 같은 순서라 가까운 기둥이 먼 기둥을 덮는다.
     */
    const cells: { i: number; j: number }[] = [];
    for (let j = -GRID_W; j <= GRID_H + GRID_W; j++) {
      for (let i = -GRID_H; i <= GRID_W + GRID_H; i++) {
        /*
         * 격자 **안쪽은 굽지 않는다** — 진짜 타일이 덮는다.
         *
         * ⚠ 한때 안쪽까지 구웠다. 단 지형 가장자리에 파란 점선(하늘)이 보였고, 타일
         * 사이 실틈으로 짐작해 뒤를 막으려 한 것이다. **원인은 실틈이 아니라 컬럼
         * 텍스처 안의 1px 구멍**이었고 K38 이 기하로 고쳤다 (126곳 → 0).
         *
         * 고친 뒤 다시 쟀다: 지형 판을 **통째로 끈 상태**에서 산 지역을 2배 확대로 봐도
         * 하늘색 픽셀이 **0** 이다 — 타일 사이에 틈이 없다. 그래서 안쪽 굽기는 값만
         * 치르고 있었다 (칸 19,354 → 바깥 링만).
         */
        if (i >= 0 && j >= 0 && i < GRID_W && j < GRID_H) continue;
        const x = STEP_X * (i - j) + ox - TILE_W / 2;
        const y = STEP_Y * (i + j) + PAD;
        if (x + TILE_W < 0 || y + TILE_H + 4 * LEVEL_H < 0 || x > W || y > H) continue;
        cells.push({ i, j });
      }
    }
    cells.sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);

    /*
     * ## 밑칠 — 평평한 지면을 먼저 한 번 깐다
     *
     * 단이 있는 칸을 올려 그리면 이웃과의 사이에 1px 틈이 남을 수 있고, 그 뒤는 캔버스가
     * 투명해서 하늘색이 새어 나온다 (실측: 장식 산 가장자리에 파란 점선). 밑에 평평한
     * 지면이 이미 깔려 있으면 최악이라도 **땅색**이 보인다.
     *
     * 기둥 기하를 더 정교하게 맞추는 대신 밑칠로 막는 이유: 아이소 마름모는 가장자리가
     * 계단이라 어떤 식으로든 반올림이 남는다. 뒤를 막는 쪽이 확실하다.
     */
    for (const c of cells) {
      const kind = t.kindAt(clamp(c.i, GRID_W - 1), clamp(c.j, GRID_H - 1)) ?? 'lawn';
      const top = variantId(`ground/${kind}`, { alt: (((c.i * 7 + c.j * 13) % 3) + 3) % 3 });
      if (!this.opts.provider.has(top)) continue;
      ctx.drawImage(
        this.opts.provider.get(top),
        Math.round(STEP_X * (c.i - c.j) + ox - TILE_W / 2),
        Math.round(STEP_Y * (c.i + c.j) + PAD),
      );
    }

    for (const c of cells) {
      const { i, j } = c;
      const z = deco(i, j);
      /*
       * 종류: 물가는 이어 받고, 올라간 곳은 **절벽 테두리에 암반** — 격자 안 산과
       * 같은 규칙이다 (`dressMountains`). 테라스 안쪽은 잔디로 남아 초원으로 읽힌다.
       */
      let kind = t.kindAt(clamp(i, GRID_W - 1), clamp(j, GRID_H - 1)) ?? 'lawn';
      const di = Math.max(0, z - deco(i + 1, j));
      const dj = Math.max(0, z - deco(i, j + 1));
      if (z > 0) {
        const cliff =
          di > 0 || dj > 0 || deco(i - 1, j) !== z || deco(i, j - 1) !== z;
        if (kind === 'lawn' || kind === 'verge') kind = cliff ? 'mountain_rock' : 'lawn';
      }
      const top = variantId(`ground/${kind}`, { alt: (((i * 7 + j * 13) % 3) + 3) % 3 });
      if (!this.opts.provider.has(top)) continue;
      const id = this.columnTexture(top, z, di, dj);
      const src = this.textures.exists(id)
        ? (this.textures.get(id).getSourceImage() as CanvasImageSource)
        : this.opts.provider.get(top);
      const th = this.textures.exists(id) ? this.textures.get(id).getSourceImage().height : TILE_H;
      const x = STEP_X * (i - j) + ox - TILE_W / 2;
      /*
       * 기둥은 **아래로** 자라므로 앵커를 낙차만큼 내린다 — 그러면 윗면이 정확히
       * `z·LEVEL_H` 만큼 올라간 자리에 온다. 화면 타일(`tileAnchorY`)과 같은 식이다.
       */
      const y = STEP_Y * (i + j) + PAD + TILE_H - th + Math.max(di, dj) * LEVEL_H - z * LEVEL_H;
      ctx.drawImage(src, Math.round(x), Math.round(y));
    }
    tex.refresh();
  }

  /**
   * 구운 판을 화면에 얹는다 — 지도 **바깥**을 땅으로 채운다 (K38).
   *
   * ## 왜 필요한가
   *
   * 지도는 아이소 다이아몬드라 **사각 화면을 못 채운다.** 다이아몬드의 바운딩 박스
   * 네 귀퉁이는 아무것도 안 그리므로 카메라 배경색(`#7ab8d4`)이 그대로 보인다 —
   * 넓은 화면에서 "1시 방향이 통짜 하늘색"으로 드러났다 (사용자 스크린샷).
   * 판이 바운딩 박스 전체를 덮으므로 귀퉁이까지 지형이고, 지도의 윗변도 다이아몬드의
   * 뾰족한 꼭지점이 아니라 **수평선**이 된다 (사용자가 그림으로 요구한 모양).
   *
   * ⚠ **바깥에 설치는 구조적으로 불가능하다.** 격자 밖이라 sim 이 그 좌표를 모른다 —
   * 플래그로 막는 것이 아니라 존재하지 않는다 (사용자: "하지만 설치는 안되는").
   */
  private buildSurround(): void {
    this.surround?.destroy();
    this.surround = null;
    if (!this.textures.exists(SURROUND_TEX)) return;

    /*
     * 구운 판을 **바운딩 박스 자리에 그대로** 얹는다 (반복 아님 — 한 장이 바로 그 크기다).
     * 위치는 굽기가 정한 캔버스 원점 그대로다: 월드 x = −GRID_H·STEP_X, y = 0
     * (다이아몬드 꼭대기 꼭지점) 에서 여백(`SURROUND_PAD`)만큼 물러난 자리.
     * 굽기의 `ox`/`PAD` 와 **같은 식**이어야 한다 — 한쪽만 고치면 판이 통째로 밀린다.
     *
     * ⚠ `scrollFactor` 는 **1**이다. 시차를 주면 공원 경계가 그 위를 미끄러져
     * "공원이 떠 있는" 것처럼 보인다 — 주변 땅은 공원과 같은 거리에 있다.
     */
    const img = this.add.image(-GRID_H * STEP_X - SURROUND_PAD, -SURROUND_PAD, SURROUND_TEX);
    img.setOrigin(0, 0);
    img.setScrollFactor(1, 1);
    img.setDepth(-960); // 절차적 배경(−1000 대)보다 앞, 지면 타일(0+)보다 뒤
    this.surround = img;
  }

  /**
   * 절차적 배경 3겹 (§7 배경). 산이 제일 멀고, 능선, 강둑 순으로 가까워진다.
   *
   * ## 지금 이건 **안전망**이다 (K38)
   *
   * 지도 바깥이 지형으로 덮이므로(`buildSurround`) 평소엔 한 픽셀도 안 보인다 —
   * 굽기가 프로바이더를 못 얻어 그냥 돌아갈 때만 드러난다. 그려진 배경을 **전면에**
   * 쓰지 않는 이유는 `bakeSurroundTexture` 에 적어 뒀다.
   *
   * 안 보이는데도 성질을 계속 지키는 이유: 드러나는 순간이 곧 굽기가 실패한 순간이라,
   * 그때 나오는 것이 하늘색 벽지면 두 번 실패한다. 브라우저 검사도 계속 잰다.
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

    /*
     * 굽기가 성공했으면 **아예 만들지 않는다** (아키텍처 점검 지적).
     *
     * K38 이 "평소엔 한 픽셀도 안 보인다"고 적어 뒀는데, 안 보이는 것과 **없는 것**은
     * 다르다 — 타일스프라이트 3장이 텍스처 9.6MB 를 계속 붙들고 있었다 (실측 총 31MB 중).
     * 이 프로젝트 1순위가 "폰에서 돌아가는 것"이라 안 보이는 배경이 게임 내용의 몇 배를
     * 쓰는 것은 그냥 낭비다.
     *
     * ⚠ 안전망 자체는 유지된다 — 굽기가 프로바이더를 못 얻어 실패하면 텍스처가 없고,
     * 그때는 여기가 3겹을 세워 하늘 대신 산이 보인다.
     */
    if (this.textures.exists(SURROUND_TEX)) return;

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

  /**
   * 검증 도구용 — 지도 바깥 땅을 껐다 켠다 (K38).
   *
   * 이게 없으면 "귀퉁이가 하늘색이 아니다"를 **주장만** 하게 된다. 끄면 하늘색으로
   * 돌아오는 것까지 봐야 검사가 실제로 이 기능을 재는 것이 된다.
   *
   * ⚠ 절차적 배경(안전망)도 **같이** 끈다. 그놈만 남기면 대조군이 하늘 대신 안전망을
   * 재게 되어 "끄면 하늘이 드러난다"가 거짓으로 실패한다.
   */
  setSurroundVisibleForTest(on: boolean): void {
    this.surround?.setVisible(on);
    for (const t of this.backdrops) t.setVisible(on);
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

  /**
   * 시계 주인 (K39). 'scene' = 장식용 유휴 시뮬(씬 자체 rng) · 'week' = 흐르는 낮
   * (`week.step` 만이 시간을 민다). 흐름 모드에서 유휴 시뮬이 같이 돌면 헤드리스와
   * 다른 세계가 된다.
   */
  private clockOwner: 'scene' | 'week' = 'scene';
  setClockOwner(owner: 'scene' | 'week'): void {
    this.clockOwner = owner;
  }

  /** 흐름 모드가 묻는다 — 검증 도구가 setAutoTick(false) 로 얼리면 흐름도 선다 */
  get tickingEnabled(): boolean {
    return this.opts.autoTick !== false;
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
    // 검사용 결함: 앞벽을 시설과 같은 띠로 되돌린다 (K37 ① 이전 상태)
    const front = this.fault.wallDepthTie ? Z_FACILITY : Z_WALL_FRONT;
    img.setDepth(depthKey(i, j) + (back ? Z_WALL_BACK : front));
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
    /*
     * 장식용 유휴 시뮬 — 씬 자체 rng 로 손님을 움직인다. **흐르는 낮에서는 끈다**
     * (`autoTick: false`) — 주가 항상 진행 중이라 `week.step` 이 유일한 시계여야 하고,
     * 여기서 한 번 더 돌리면 헤드리스와 다른 세계가 된다 (K39).
     */
    if (this.clockOwner === 'scene' && this.opts.autoTick !== false) {
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

  /**
   * 하루 안의 시각 표현 (K39) — 아침·저녁에 화면 전체를 살짝 물들인다.
   *
   * `frac` 는 하루 진행률 (0~1). `null` 이면 끈다 (주 경계·모달 게이트).
   * 색은 `style.css` 토큰(`--day-dawn`/`--day-dusk`)에서 읽는다 — 색 소유권 규칙 (K34).
   * `transform`/`opacity` 급의 값 변경만 하므로 reduced-motion 과 무관하다 (전환 없음).
   */
  setDayPhase(frac: number | null): void {
    if (!this.dayTint) {
      // 화면 좌표(스크롤 무시)에 깔리는 한 장 — 어떤 버퍼 크기도 덮게 크게 잡는다
      this.dayTint = this.add.rectangle(0, 0, 8192, 8192, 0x000000, 0);
      this.dayTint.setOrigin(0, 0);
      this.dayTint.setScrollFactor(0);
      this.dayTint.setDepth(10_000_000);
    }
    if (frac === null) {
      this.dayTint.setVisible(false);
      return;
    }
    const dawn = cssColorInt('--day-dawn');
    const dusk = cssColorInt('--day-dusk');
    // 아침(0~0.15): 새벽빛이 걷힌다 · 낮: 없음 · 저녁(0.7~1): 땅거미가 깔린다
    let color = 0;
    let alpha = 0;
    if (frac < 0.15) {
      color = dawn;
      alpha = 0.18 * (1 - frac / 0.15);
    } else if (frac > 0.7) {
      color = dusk;
      alpha = 0.22 * ((frac - 0.7) / 0.3);
    }
    this.dayTint.setVisible(alpha > 0);
    this.dayTint.fillColor = color;
    this.dayTint.fillAlpha = alpha;
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
  get backdropInfo(): {
    count: number;
    factors: number[];
    factorsY: number[];
    depths: number[];
    /** 지도 바깥 땅이 깔렸나 (K38) — 0 이면 굽기가 실패해 절차적 배경만 남은 것이다 */
    surround: number;
  } {
    return {
      count: this.backdrops.length,
      factors: this.backdrops.map((b) => b.scrollFactorX),
      factorsY: this.backdrops.map((b) => b.scrollFactorY),
      depths: this.backdrops.map((b) => b.depth),
      surround: this.surround ? 1 : 0,
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

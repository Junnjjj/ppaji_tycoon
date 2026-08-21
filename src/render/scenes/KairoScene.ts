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
  DEPTH_AIM_MARK,
  DEPTH_DOOR_MARK,
  DEPTH_LAND_MARK,
  DEPTH_COURSE_MARK,
  DEPTH_RIDE_MARK,
  DEPTH_RIDE_LABEL,
} from '../kairo/iso.js';
import { occludes, XRAY_ALPHA, type Rect } from '../kairo/xray.js';
import { entryFaces, marksEntry } from '../kairo/mark.js';
import { KairoCamera } from '../kairo/kairo-camera.js';
import { viewport, violatesDotGrid, type Upscale } from '../kairo/upscale.js';
import {
  AMBIENT_FACILITIES,
  AMBIENT_REGISTRY,
  ambientPhase,
  IncomeFx,
  playFx,
  type AmbientName,
  type AmbientPalette,
  type FxHost,
  type Pen,
} from '../kairo/fx.js';
import type { IncomeEvent } from '../../sim/kairo/week.js';

/**
 * 지도 바깥을 채우는 **지형** 텍스처 (K38).
 *
 * 그림 파일이 아니라 게임의 지면 스프라이트를 구운 것이다.
 * 왜 그림이 아닌지는 `bakeSurroundTexture` 에 한 번만 적어 뒀다.
 */
const SURROUND_TEX = 'surround/ground';
/** 투시 재계산을 강제하는 센티널 키 (K50) — `defId|i,j,facing` 형태와 절대 안 겹친다 */
const XRAY_FORCE = '!force';
/** 지형을 바운딩 박스보다 얼마나 더 넓게 굽나 — 카메라 여백 + 고무줄을 덮는다 */
const SURROUND_PAD = 128;
import type { AssetProvider } from '../../assets/types.js';
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
import {
  facilityDef,
  PlacementGrid,
  setEntryFaultForTest as setSimEntryFault,
  type FacilityFacing,
  type KairoFacilityDef,
  type RideTiles,
} from '../../sim/kairo/placement.js';
import type { GuestStore, Guest } from '../../sim/kairo/guests.js';
import { cssColorInt, cssVar } from '../../ui/tokens.js';
import {
  COSLOT_SPREAD_TEXELS,
  facilityFacings,
  facilitySpriteId,
} from '../../assets/kairo-contract.js';
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

/**
 * 지금 보여 주고 있는 입구 표식 (K52) — **두 종류**다. 종류가 갈리는 이유는 하나다:
 * 입구가 **칸**인가 **면**인가.
 *
 * - `ride`  슬라이드 4종. `entryTile`/`exitTile` 이 데이터에 **칸 하나씩**으로 선언돼
 *   있고 손님이 실제로 그 칸에서 타고 그 칸으로 내린다 — 마름모 두 개가 정확한 그림이다
 *   (K51). 여기 손대지 않는다
 * - `entry` **56종**. 입구는 발자국 **앞 두 면**이라 칸이 아니라 **변**이다.
 *   칸마다 마름모를 찍으면 `turtle_island 8×6` 이 표식 14개가 되고, 그건 "네 채짜리
 *   워터파크가 표식 여덟 개로 덮인다"고 K51 이 이미 경고한 그 상태다 — 굵은 선 하나
 *   + 글씨 하나로 낸다
 *
 * ⚠ 4 + 56 은 75 가 아니다. 남는 **15종은 표식 자체가 없다** (`markOf` 가 `null`) —
 *   `walkOn` 2종과 `capacity 0` 14종의 합집합인데 둘이 서로를 안 덮는다 (선착장은
 *   정원이 있는데 `walkOn` 이고 플로팅덱은 정원이 0 이다). 이유는 `markOf` 주석.
 */
type PlaceMark =
  | { kind: 'ride'; tiles: RideTiles }
  | {
      kind: 'entry';
      /** 발자국 사각형 — 입구 칸의 **어느 변**이 발자국과 맞닿았는지 판정한다 */
      foot: { i: number; j: number; w: number; d: number };
      /**
       * `PlacementGrid.entryTilesOf` 가 낸 바깥 이웃 칸들 — **표식의 정본**이다.
       * 여기서 변을 유도하므로, 손님이 들어오는 칸과 화면의 선이 갈라질 수 없다
       * (갈라지면 표식이 조용히 거짓말이 된다 — K51 이 고친 버그의 모양).
       */
      tiles: readonly (readonly [number, number])[];
    };

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
  /** 구상 클래스가 아니라 **인터페이스**다 (Phase G) — 절차·아틀라스·하이브리드가 같은 자리 */
  provider: AssetProvider;
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

  /**
   * 코스 보트 (K45) — 견인기구가 실제로 물 위를 돈다. 레거시 프로토타입의
   * onPath 보트가 원형이다 (prototype/index.html). 경로는 sim 의 스플라인 표본
   * 그대로, **진행은 sim tick 으로만** 민다 (advanceBoats) — 시간이 멈추면 배도 선다.
   * 에셋은 마지막이라 임시 도형이다 (버스와 같은 취급).
   */
  private courseBoats: {
    path: { x: number; y: number }[];
    /** 배마다 위상 오프셋 (0..1) */
    boats: number[];
    t: number;
  }[] = [];
  private boatGfx: Phaser.GameObjects.Graphics | null = null;
  /** 수영 구역 오버레이 (S3) — 칸마다 그래픽 하나 (깊이가 칸 단위라 한 장으로 못 그린다) */
  private swimGfx: Phaser.GameObjects.Graphics[] = [];

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
   * ## 조준 커서 (K47-③) — **월드 텍셀이 정본이고 레티클은 화면 표시일 뿐이다**
   *
   * 카이로식 배치는 "지도를 팬해서 고스트에 맞춘다"이다 (손가락이 고스트를 안 가린다).
   * 순진하게 "고스트 = 화면 중앙 칸"으로 만들면 **판의 32% 를 못 짓는다** — 카메라
   * 클램프(`range()`)가 화면 중앙이 갈 수 있는 범위를 가두기 때문이다 (실측: S=1 ·
   * 5등급 토지에서 커버 68%. 남쪽 `i+j` 큰 삼각형과 동서 끝이 영영 중앙에 못 온다).
   *
   * 그래서 커서는 **팬의 의도**(손가락이 민 텍셀)를 그대로 누적한다. 카메라가 클램프에
   * 걸려 멈춰도 커서는 계속 가므로, 고스트가 화면 중앙에서 밀려나며 지도 가장자리까지
   * 따라온다. 필요한 최대 오프셋(S=1 에서 x 180.5 · y 378)이 반뷰(196.5 · 426)보다
   * 항상 작아 고스트가 화면 밖으로 나가지 않는다 — **100% 커버가 수학적으로 보장**된다.
   *
   * ⚠ 클램프를 배치 모드에서 푸는 것은 금지다. `BACKDROP 48` 은 "하늘이 어디서도 안
   * 보인다" 검사의 근거이고 지도 바깥 굽기 여백은 `SURROUND_PAD 128` 뿐이다.
   */
  private aimTexel: { x: number; y: number } | null = null;
  /** 커서가 가리키는 칸 (격자 안으로 클램프된 값). 조준 중이 아니면 `null` */
  private aimTile: { i: number; j: number } | null = null;
  /** 조준 칸이 **바뀐 때만** 부른다 — 판정(`placement.check`)이 최악 0.33ms 라 매 프레임은 위험하다 */
  onAimTile?: (i: number, j: number) => void;
  /** 화면 아래가 UI(확정 바)에 가려진 높이 — 레티클을 그만큼 위로 올린다 */
  private reticleInset = 0;
  /** 조준 발자국의 바닥 윤곽 — 고스트가 크면 "어느 칸인지"가 안 읽힌다 */
  private reticleMark: { i: number; j: number; ok: boolean; w: number; d: number } | null = null;
  private aimGfx: Phaser.GameObjects.Graphics | null = null;
  /**
   * 입구 표식 (K51 → K52) — 지금 보여 주고 있는 것. `null` 이면 꺼져 있다.
   *
   * **상시 표시가 아니다.** 시설을 여러 개 지으면 화면이 표식으로 덮이므로,
   * 뜨는 자리는 둘뿐이다: 조준 중인 고스트(놓기 전)와 정보 시트를 연 시설 하나(놓은 뒤).
   */
  private rideMark: PlaceMark | null = null;
  private rideGfx: Phaser.GameObjects.Graphics | null = null;
  /** 입구·출구 글씨 — 면보다 위 층이라 `Graphics` 와 따로 산다 */
  private rideLabels: Phaser.GameObjects.Text[] = [];
  /**
   * **실제로 그은 선분** (월드 좌표). 검사가 읽는다 — 상수끼리 비교하면 그리기가 틀려도
   * 통과한다 (K38 "깊이는 화면에 올라간 오브젝트에서 읽는다"와 같은 규칙).
   */
  private rideEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  /**
   * **일부러 망가뜨리는 스위치** — 오프셋 로직을 끄고 "고스트 = 화면 중앙 칸"으로
   * 되돌린다. 위의 32% 구멍이 그대로 재현되므로, 가장자리 배치 검사가 정말 그 구멍을
   * 재고 있는지 증명하는 음성 대조군이다 (`setRenderFaultForTest` 와 같은 판단).
   */
  private aimFault = false;
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

  setRenderFaultForTest(
    name: 'wall-depth-tie' | 'skirt-gap' | 'no-lift' | 'ambient-static' | 'none',
  ): void {
    this.fault = { wallDepthTie: false, skirtGap: false, noLift: false };
    /*
     * `ambient-static` (K53) — 물이 **한 프레임에 멈춘다.** 켜면 ★ "물이 움직인다"가
     * 실패해야 그 검사가 실제로 움직임을 재는 것이 된다. 다시 만들 필요는 없다
     * (다음 `update()` 가 프레임 0 을 걸어 준다).
     */
    this.ambientFault = name === 'ambient-static';
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
    this.applySwimZones();
    this.drawReticleMark(); // 조준 표식도 리프트를 타므로 결함을 같이 받는다 (K47-③)
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
    this.applySwimZones(); // 수영 구역도 같은 규칙 — create() 전에 온 것을 여기서
    this.buildWalls();
    // 힌트 층 — 값이 아니라 **순서**가 계약이다 (`iso.ts` 의 `DEPTH_*`, K51)
    this.courseGfx = this.add.graphics().setDepth(DEPTH_COURSE_MARK).setVisible(false);
    this.landGfx = this.add.graphics().setDepth(DEPTH_LAND_MARK).setVisible(false);
    this.doorGfx = this.add.graphics().setDepth(DEPTH_DOOR_MARK);
    // 조준 표식 (K47-③) — 힌트 층이다. 세계 물체가 아니라 문 앞 발판과 같은 자리
    this.aimGfx = this.add.graphics().setDepth(DEPTH_AIM_MARK).setVisible(false);
    // 슬라이드 입출구 (K51) — 고스트를 덮어야 하므로 힌트 층 맨 위다
    this.rideGfx = this.add.graphics().setDepth(DEPTH_RIDE_MARK).setVisible(false);
    this.drawRideMark(); // create() 전에 온 표식을 여기서 반영한다 (setLand 와 같은 규칙)
    // 버스는 차도 위 물체다 — 그 칸의 지면 위, 그 앞줄보다 뒤
    this.busGfx = this.add.graphics();
    this.boatGfx = this.add.graphics();
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
    /*
     * 회전 (K45 → K53). 발자국은 `sizeOf` 가 낸다 — **여기서 w↔h 를 다시 쓰지 말 것**.
     *
     * 그림은 두 갈래다:
     *   `facings: 2` (기본) → 그림 1장 + **좌우 반전**. D-035 의 "facing 은 flipX 근사"
     *                          그대로다. 광원이 뒤집히는 것은 그 계약이 감수한 값이다
     *   `facings: 4`        → **방향별 텍스처**. flipX 를 걸면 안 된다 —
     *                          그림이 이미 그 방향으로 그려져 있어 두 번 뒤집힌다
     */
    const facing = item.facing ?? 0;
    const [w, d] = PlacementGrid.sizeOf(def, facing);
    const texId = facilitySpriteId(item.defId, facing);
    const flip = facilityFacings(item.defId) === 2 && facing === 1;
    const a = footprintAnchor(item.i, item.j, w, d);
    // 단 위의 시설은 같이 올라간다 (K37). 발자국은 단이 균일하므로 시작 칸 하나로 충분하다
    const ay = a.y + this.liftAt(item.i, item.j);
    const existing = this.facilityImages.get(handle);
    if (existing) {
      existing.setPosition(a.x, ay);
      /*
       * ⚠ **`setTexture` 도 부른다** (K53). 예전엔 위치·flipX 만 갱신했는데,
       * 4방향에서는 방향이 곧 **다른 텍스처**라 이 줄이 없으면 회전이 화면에 안 보인다.
       * 2방향에서는 같은 키를 다시 주는 것이라 아무 일도 안 일어난다.
       */
      existing.setTexture(texId);
      existing.setFlipX(flip);
      this.syncAmbient(handle, item.defId, existing);
      return;
    }
    const img = this.add.image(a.x, ay, item.defId ? texId : '');
    img.setOrigin(0.5, 1);
    img.setFlipX(flip);
    img.setDepth(depthKey(item.i + w - 1, item.j + d - 1) + Z_FACILITY);
    this.facilityImages.set(handle, img);
    // 조준 중에 다시 만들어졌으면 투시 상태를 이어받는다 (K50 — `aimMove` 의 프로브가 그렇다)
    this.dimIfOccluding(img);
    this.syncAmbient(handle, item.defId, img);
  }

  // ── 상시 연출: 살아 있는 물 (K53) ─────────────────────────────────────────
  /*
   * 규칙과 근거는 `render/kairo/fx.ts` 의 등록부 머리말에 한 번만 적어 뒀다.
   * 여기는 **얹는 자리**만 안다: 시설 그림과 같은 앵커·같은 반전, 깊이는 반 칸 위.
   */

  /**
   * 시설 그림 **바로 위** — `Z_FACILITY + 0.5`.
   *
   * 새 띠를 만들지 않는다 (계약: `iso.ts` 의 `Z_*` 를 흔들지 말 것). 앉은 손님이
   * `rank/count × 0.9` 소수로 자기 순서를 잡는 것과 **같은 수법**이다: 1 미만이라
   * 앞벽(3)·손님(4)을 못 넘고, 그래서 물 위를 걷는 손님은 여전히 반짝임을 덮는다.
   */
  private static readonly AMBIENT_SUB = 0.5;

  /** 핸들 → 얹은 그림 + 시설 id (텍스처 키를 다시 구울 때 쓴다) */
  private ambientImages = new Map<number, { img: Phaser.GameObjects.Image; defId: string }>();
  /** 지금 화면에 걸린 프레임 번호. `-1` 이면 아직 한 번도 안 걸었다 */
  private ambientPhaseNow = -1;
  /** 토큰은 **한 번만** 읽는다 — `getComputedStyle` 은 매 프레임 부를 것이 아니다 */
  private ambientPal: AmbientPalette | null = null;
  /**
   * 코드에 심은 음성 대조군 (K38 규칙). 켜면 프레임이 **영원히 0** 이다 —
   * 그 상태에서 ★ "물이 움직인다"가 **실패해야** 검사가 실제로 이걸 재는 것이 된다.
   */
  private ambientFault = false;

  /** 움직이면 안 되는 상태인가 — 기기 설정(축소 모션) 또는 대조군 */
  private ambientStill(): boolean {
    return this.ambientFault || this.fxHost().reduced;
  }

  /**
   * 얹을 그림 한 장을 굽는다. `null` 이면 이 시설에는 상시 연출이 없다.
   *
   * **시설 텍스처를 그대로 읽어** 물빛 픽셀을 찾으므로, 캔버스 크기·앵커가 자동으로
   * 맞는다. 그래서 4방향(K53)이 들어와 텍스처가 방향마다 달라져도 여기는 안 바뀐다 —
   * 우리가 보는 것은 `defId` 가 아니라 **그 그림이 지금 쓰는 텍스처 키**다.
   */
  private ambientTexture(srcKey: string, name: AmbientName, phase: number): string | null {
    const id = `__amb/${srcKey}/${phase}`;
    if (this.textures.exists(id)) return id;
    if (!this.textures.exists(srcKey)) return null;
    const src = this.textures.get(srcKey).getSourceImage() as HTMLCanvasElement;
    if (!src.width || !src.height) return null;
    const tex = this.textures.createCanvas(id, src.width, src.height);
    if (!tex) return null;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    // ① 원본을 한 번 그려 픽셀을 읽고 ② 지운 뒤 ③ 얹을 것만 남긴다
    ctx.drawImage(src, 0, 0);
    const raster = ctx.getImageData(0, 0, src.width, src.height);
    ctx.clearRect(0, 0, src.width, src.height);
    const pen: Pen = {
      use: (c) => {
        ctx.fillStyle = c;
      },
      rect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    };
    this.ambientPal ??= {
      glint: cssVar('--water-glint', '#eaf7ff'),
      foam: cssVar('--water-foam', '#ffffff'),
    };
    AMBIENT_REGISTRY[name](
      pen,
      { w: src.width, h: src.height, data: raster.data },
      phase,
      this.ambientPal,
    );
    tex.refresh();
    return id;
  }

  /**
   * 시설 하나의 상시 연출을 위치·반전·텍스처까지 맞춘다.
   *
   * ⚠ 반전은 시설 그림에서 **읽어 온다** (`base.flipX`). 규칙을 여기서 다시 유도하면
   * 2방향/4방향 분기가 두 벌이 되고, 그건 이 저장소가 이미 여러 번 데인 형태다.
   */
  private syncAmbient(handle: number, defId: string, base: Phaser.GameObjects.Image): void {
    const name = AMBIENT_FACILITIES[defId];
    if (!name) return;
    const phase = this.ambientPhaseNow < 0 ? 0 : this.ambientPhaseNow;
    const key = this.ambientTexture(base.texture.key, name, phase);
    if (!key) return;
    let slot = this.ambientImages.get(handle);
    if (!slot) {
      const img = this.add.image(base.x, base.y, key);
      img.setOrigin(0.5, 1);
      slot = { img, defId };
      this.ambientImages.set(handle, slot);
    }
    slot.defId = defId;
    slot.img.setTexture(key);
    slot.img.setPosition(base.x, base.y);
    slot.img.setFlipX(base.flipX);
    slot.img.setDepth(base.depth + KairoScene.AMBIENT_SUB);
    // 투시(K50)를 같이 탄다 — 시설만 흐려지고 물만 또렷하면 유리 벽 뒤가 이상해진다
    slot.img.setAlpha(base.alpha);
    this.dimIfOccluding(slot.img);
  }

  /** 시설이 사라지면 얹은 그림도 같이 사라진다 */
  private dropAmbient(handle: number): void {
    this.ambientImages.get(handle)?.img.destroy();
    this.ambientImages.delete(handle);
  }

  /**
   * 프레임을 한 칸 넘긴다 — `update()` 가 매 프레임 부르지만 **번호가 바뀐 프레임에만**
   * 일을 한다 (K47-③ "판정은 칸이 바뀐 프레임에만"과 같은 절약).
   */
  private stepAmbient(): void {
    const want = this.ambientStill() ? 0 : ambientPhase(this.animTick);
    if (want === this.ambientPhaseNow) return;
    this.ambientPhaseNow = want;
    const t0 = performance.now();
    for (const [handle, slot] of this.ambientImages) {
      const base = this.facilityImages.get(handle);
      if (!base) continue;
      const name = AMBIENT_FACILITIES[slot.defId];
      if (!name) continue;
      const key = this.ambientTexture(base.texture.key, name, want);
      if (key) slot.img.setTexture(key);
    }
    this.ambientStats = { steps: this.ambientStats.steps + 1, ms: performance.now() - t0 };
  }

  /**
   * 마지막 전환에 든 시간 — 폰이 1순위라 "얼마나 드나"가 답할 수 있어야 한다.
   *
   * 실측 (K53, 데스크톱 Chrome): 물 시설 **0채 → 12채**에서 프레임 시간
   * `16.6757 → 16.6752ms` (60fps 고정, 즉 잴 수 있는 차이가 없다) · 전환 **0.00ms** ·
   * 텍스처 **+0.5MB**. 첫 굽기만 종류당 0.7~1.4ms 이고 그 뒤로는 **영구 캐시**다
   * (`__amb/…` 텍스처를 안 지운다 — 프레임 수 × 시설 종류라 상한이 작다).
   */
  private ambientStats = { steps: 0, ms: 0 };

  /**
   * 검증 도구용 — **화면에 올라간 그림에서** 읽는다 (K38 규칙).
   *
   * 상수(`ambientPhase(animTick)`)를 돌려주면 그리기가 틀려도 통과한다. 여기서 내는
   * `keys` 는 실제 `Image` 가 지금 쓰고 있는 텍스처 키다.
   */
  ambientProbeForTest(): {
    count: number;
    phase: number;
    keys: string[];
    still: boolean;
    steps: number;
    ms: number;
  } {
    return {
      count: this.ambientImages.size,
      phase: this.ambientPhaseNow,
      keys: [...this.ambientImages.values()].map((s) => s.img.texture.key),
      still: this.ambientStill(),
      steps: this.ambientStats.steps,
      /*
       * 전환 한 번에 든 시간. **매 프레임이 아니라 6프레임마다** 도는 값이므로
       * 프레임 평균 부담은 이 값의 1/6 이다 (`AMBIENT_TICKS_PER_FRAME`).
       * 안 도는 프레임은 정수 비교 하나뿐이라 잴 것이 없다.
       */
      ms: this.ambientStats.ms,
    };
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

  /**
   * 렌더가 tick 하나를 소비하는 실시간 초 (K44) — 손님 보간이 이걸 따라간다.
   * main 이 부팅과 배속 전환에서 넣어 준다. 유휴 시뮬(10Hz) 기본값 0.1.
   */
  private tickSeconds = 0.1;
  setTickSeconds(s: number): void {
    this.tickSeconds = s;
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
      this.dropAmbient(handle);
      return;
    }
    this.drawFacility(handle);
  }

  /** 세이브를 불러온 뒤처럼 이미 시설이 있는 상태를 한 번에 그린다 */
  rebuildFacilities(): void {
    for (const img of this.facilityImages.values()) img.destroy();
    this.facilityImages.clear();
    for (const handle of [...this.ambientImages.keys()]) this.dropAmbient(handle);
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
    this.dimIfOccluding(img); // 조준 중이면 새 벽도 투시 상태를 이어받는다 (K50)
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
   * ⚠ 그 예고("나중에 방향 스프라이트가 생기면 여기만 바뀐다")가 K53 에서 실현됐다 —
   * 부르는 쪽은 한 글자도 안 바뀌었고 텍스처 선택만 `facilitySpriteId` 로 옮겼다.
   */
  setGhost(defId: string | null, i = 0, j = 0, ok = true, facing: FacilityFacing = 0): void {
    if (defId === null) {
      this.ghost?.destroy();
      this.ghost = null;
      this.setRideMark(null);
      this.syncXray();
      return;
    }
    const def = facilityDef(defId);
    if (!def) return;
    /*
     * 입구 표식은 **여기서 유도한다** (K51 → K52) — 부르는 쪽이 따로 켜게 두면 고스트는
     * 도는데 표식은 안 도는 상태를 만들 수 있고, 그게 정확히 K51 이 고친 버그의 모양이다.
     * 고스트가 있는 곳에 표식이 있고, 없는 곳에 없다. `facing` 도 같은 인자를 그대로
     * 넘기므로 `↻` 를 누르면 고스트와 표식이 **같은 프레임에** 함께 돈다.
     */
    this.setRideMark(KairoScene.markOf(def, i, j, facing));
    // 회전 미리보기 (K45) — **실물(`drawFacility`)과 같은 규칙**이어야 한다
    const [w, d] = PlacementGrid.sizeOf(def, facing);
    const texId = facilitySpriteId(defId, facing);
    const a = footprintAnchor(i, j, w, d);
    // 고스트도 단을 탄다 (K37) — 안 태우면 산 위에서 미리보기가 땅에 파묻힌다
    const ay = a.y + this.liftAt(i, j);
    if (!this.ghost) {
      this.ghost = this.add.image(a.x, ay, texId);
      this.ghost.setOrigin(0.5, 1);
    } else {
      this.ghost.setTexture(texId);
      this.ghost.setPosition(a.x, ay);
    }
    this.ghost.setFlipX(facilityFacings(defId) === 2 && facing === 1);
    this.ghost.setAlpha(0.62);
    // 못 놓는 자리는 붉게 — 확정 바의 경고색과 짝이다
    this.ghost.setTint(ok ? 0x8fe0ff : 0xff6a5a);
    this.ghost.setDepth(depthKey(i + w - 1, j + d - 1) + Z_GHOST);
    // 조준 칸(또는 회전·시설)이 바뀌었으면 가리는 것을 다시 고른다 — 아니면 아무것도 안 한다
    this.ghostKey = `${defId}|${i},${j},${facing}`;
    this.syncXray();
  }

  // ── 가림 투시 (K50) ─────────────────────────────────────────────────────

  /**
   * 지금 투명해져 있는 것들. **되돌릴 목록**이라 이미지 참조를 그대로 들고 있다 —
   * 핸들로 들면 벽(경계 키)과 시설(핸들)이 다른 종류라 두 벌이 된다.
   */
  private xrayDimmed: Phaser.GameObjects.Image[] = [];
  /** 지금 조준의 화면 사각형 + 깊이. `null` 이면 투시가 꺼져 있다 */
  private xrayTarget: { depth: number; rect: Rect } | null = null;
  /** 마지막으로 계산한 조준 상태. 같으면 **재계산하지 않는다** (칸이 바뀔 때만 돈다) */
  private xrayKey: string | null = null;
  private ghostKey: string | null = null;
  /**
   * 코드에 심은 음성 대조군 (K38 규칙: 렌더 검사의 대조군은 코드로 둔다).
   * 켜면 투명화를 통째로 끈다 — 그 상태에서 ★ "가리는 시설이 흐려진다"가 **실패해야**
   * 검사가 실제로 이 기능을 재는 것이 된다.
   */
  private xrayFault = false;
  private xrayStats = { calcs: 0, scanned: 0, ms: 0 };
  /** `getBounds` 가 매번 새 사각형을 만들지 않게 재사용한다 (수백 번 돈다) */
  private readonly xrayScratch = new Phaser.Geom.Rectangle();

  /**
   * 조준 중 고스트를 가리는 것들을 반투명하게 한다 (K50).
   *
   * ## 언제 도나
   *
   * `setGhost` 뿐이다. 그리고 조준 상태 키(`시설|칸|방향`)가 **바뀌었을 때만** 실제로
   * 계산한다. 매 프레임 전수 검사는 시설 130채 + 벽 수백 장 판에서 헛돈다 —
   * 카메라를 팬해도 월드 좌표는 안 변하므로 다시 잴 이유도 없다.
   *
   * ## 무엇을 보나
   *
   * 시설과 벽이다. 지면은 안 본다 — 같은 칸에서 지면 띠(0)는 고스트(7)보다 한참 낮고,
   * 앞 칸 지면은 마름모라 고스트 몸통을 실질적으로 안 가린다.
   *
   * 손님도 안 본다. 이유는 둘이다: (1) 손님 그림은 24텍셀이라 2~3층 건물과 달리
   * 고스트를 삼키지 못한다 (2) 최대 1,200개를 훑으면 비용이 시설·벽 전부의 몇 배인데,
   * 조준 중에는 시간이 멈춰(`flowTick` 의 `hud.confirming` 게이트) 어차피 한 자리에
   * 서 있다. 나중에 손님을 넣는다면 **재계산 주기부터** 바꿔야 한다 — 지금 규칙(칸이
   * 바뀔 때만)으로 손님을 넣으면 걸어 나간 손님이 흐린 채로 남는다.
   */
  private syncXray(): void {
    const g = this.ghost;
    const key = g && !this.xrayFault ? this.ghostKey : null;
    if (key === this.xrayKey) return;
    this.xrayKey = key;
    this.clearXray();
    if (key === null || !g) return;
    const t0 = performance.now();
    /*
     * 고스트 스프라이트의 경계 하나면 충분하다 — 발자국 캔버스가 `(w+d)·STEP_X` 폭에
     * 앵커가 bottom-center 라, 바닥 마름모 bbox 를 **항상 포함**한다 (`footprintCanvas`).
     */
    const b = g.getBounds(this.xrayScratch);
    this.xrayTarget = {
      depth: g.depth,
      rect: { x0: b.x, y0: b.y, x1: b.right, y1: b.bottom },
    };
    let scanned = 0;
    for (const img of this.facilityImages.values()) {
      scanned++;
      this.dimIfOccluding(img);
    }
    for (const img of this.wallImages.values()) {
      scanned++;
      this.dimIfOccluding(img);
    }
    /*
     * 얹은 물(K53)도 같이 훑는다. 시설만 흐려지고 그 위의 반짝임이 또렷하게 남으면
     * 투시가 반만 걸린 것으로 보인다 — `xrayDimmed` 에 들어가야 되돌리기도 같이 된다.
     */
    for (const s of this.ambientImages.values()) {
      scanned++;
      this.dimIfOccluding(s.img);
    }
    this.xrayStats = {
      calcs: this.xrayStats.calcs + 1,
      scanned,
      ms: performance.now() - t0,
    };
  }

  /**
   * 이 그림 하나가 지금 조준을 가리면 흐리게 한다.
   *
   * 새로 만들어진 시설·벽에도 부른다 — 조준 중에 그림이 다시 만들어지는 경로가 실제로
   * 있다 (`aimMove` 는 자기 겹침을 재려고 원자리를 치웠다 되돌린다). 그때 알파 1 로
   * 돌아오면 "옮기는 중에만 앞 건물이 다시 불투명"이 된다.
   */
  private dimIfOccluding(img: Phaser.GameObjects.Image): void {
    const t = this.xrayTarget;
    if (!t) return;
    const b = img.getBounds(this.xrayScratch);
    if (!occludes(t.depth, t.rect, img.depth, { x0: b.x, y0: b.y, x1: b.right, y1: b.bottom })) {
      return;
    }
    img.setAlpha(XRAY_ALPHA);
    this.xrayDimmed.push(img);
  }

  /**
   * 전부 원복한다. 조준 취소·확정·붓 교체·패널 열림이 **모두** `setGhost(null)` 로
   * 모이므로(main 의 `endAim`) 되돌리기 경로는 이 하나다 — 알파를 남기면 판이 흐려진
   * 채로 남는다.
   *
   * ⚠ 지워진 그림이 목록에 남아 있을 수 있다 (`refreshFacility` 가 destroy 한다).
   * Phaser 는 destroy 에서 `scene` 을 지우므로 그것으로 거른다.
   */
  private clearXray(): void {
    for (const img of this.xrayDimmed) {
      if (img.scene) img.setAlpha(1);
    }
    this.xrayDimmed.length = 0;
    this.xrayTarget = null;
  }

  /**
   * 검증 도구용 음성 대조군 — 켜면 투시를 안 한다 (K50).
   * `setRenderFaultForTest` 와 같은 판단이다: 손으로 주입해 확인한 것은 다음 사람에게 안 남는다.
   */
  setXrayFaultForTest(on: boolean): void {
    this.xrayFault = on;
    /*
     * ⚠ `null` 로 되돌리면 안 된다. 끄는 쪽의 목표 키도 `null` 이라 `syncXray` 의
     * "안 바뀌었으면 아무것도 안 한다"에 걸려 **조용히 통과**한다 — 대조군이 정상과
     * 같은 화면을 내놓았다 (실측: 끔 3 · 켬 3). 어떤 실제 키와도 안 겹치는 값을 넣는다.
     */
    this.xrayKey = XRAY_FORCE;
    this.syncXray();
  }

  /** 검증 도구용 — 투시 상태와 **계산 비용**. 칸이 바뀔 때만 `calcs` 가 는다 */
  xrayStatsForTest(): {
    active: boolean;
    dimmed: number;
    scanned: number;
    calcs: number;
    ms: number;
    alpha: number;
  } {
    return {
      active: this.xrayTarget !== null,
      dimmed: this.xrayDimmed.length,
      scanned: this.xrayStats.scanned,
      calcs: this.xrayStats.calcs,
      ms: this.xrayStats.ms,
      alpha: XRAY_ALPHA,
    };
  }

  /**
   * 검증 도구용 — 시설 핸들별 알파. 음성 대조군("가리지 않는 시설은 그대로다")은
   * 이 값을 **가리는 것과 안 가리는 것 양쪽에서** 읽어야 의미가 있다.
   */
  facilityAlphasForTest(): { handle: number; alpha: number; depth: number }[] {
    const out: { handle: number; alpha: number; depth: number }[] = [];
    for (const [handle, img] of this.facilityImages) {
      out.push({ handle, alpha: img.alpha, depth: img.depth });
    }
    return out;
  }

  // ── 조준 배치 (K47-③) ───────────────────────────────────────────────────

  /**
   * 확정 바가 가리는 화면 아래 높이 (CSS px). 레티클은 **보이는 영역의 중앙**이다 —
   * 안 올리면 조준점이 바 밑에 숨는다 (K33 규칙: 가려진 높이는 재서 쓴다).
   */
  setReticleInset(cssBottomInset: number): void {
    this.reticleInset = Math.max(0, cssBottomInset);
  }

  /** 레티클(화면 조준점)이 가리키는 월드 텍셀 */
  private reticleTexel(): { x: number; y: number } {
    return this.cam.screenToTexel(
      window.innerWidth / 2,
      (window.innerHeight - this.reticleInset) / 2,
    );
  }

  /**
   * 레티클이 가리키는 칸. **격자 밖도 그대로 돌려준다** — 클램프하면 음성 대조군
   * (중앙 고정)이 가장자리에 닿는 것처럼 보여 검사가 무의미해진다.
   */
  reticleTile(): { i: number; j: number } {
    const t = this.reticleTexel();
    return screenToTile(t.x, t.y);
  }

  /** 조준 시작·탭·배율 변경 — 커서를 이 칸 중심에 놓는다 (콜백은 안 부른다) */
  beginAim(i: number, j: number): void {
    this.aimTexel = tileCenter(i, j);
    this.aimTile = { i, j };
  }

  /** 조준 종료 — 표식도 같이 지운다 */
  endAim(): void {
    this.aimTexel = null;
    this.aimTile = null;
    this.setReticleMark(null);
    /*
     * 조준이 끝났으면 투시도 끝이다 (K50). `setGhost(null)` 이 곧바로 뒤따르지만
     * **여기서도** 끊는다 — 되돌리기가 한 경로에만 걸려 있으면, 그 경로를 안 타는
     * 호출자가 하나 생기는 순간 판이 흐려진 채로 남는다.
     */
    this.ghostKey = null;
    this.syncXray();
  }

  /** 지금 조준 중인 칸 — 검증이 읽는다 */
  aimTileNow(): { i: number; j: number } | null {
    return this.aimTile ? { ...this.aimTile } : null;
  }

  /**
   * 팬이 민 만큼 커서를 옮긴다. 인자는 **카메라 중심이 실제로 움직인 텍셀**이 아니라
   * 손가락이 요구한 양이다 — 클램프에 걸려 카메라가 안 움직여도 커서는 가야 한다.
   */
  private moveAimCursor(dx: number, dy: number): void {
    if (!this.aimTexel) return;
    // 음성 대조군 — 커서를 매번 레티클로 붙여 "고스트 = 화면 중앙 칸"으로 되돌린다
    if (this.aimFault) this.aimTexel = this.reticleTexel();
    else {
      this.aimTexel.x += dx;
      this.aimTexel.y += dy;
    }
    const t = screenToTile(this.aimTexel.x, this.aimTexel.y);
    const i = Math.max(0, Math.min(GRID_W - 1, t.i));
    const j = Math.max(0, Math.min(GRID_H - 1, t.j));
    /*
     * 격자 밖으로 샌 커서는 되돌린다. 안 되돌리면 밖으로 민 만큼 되돌아올 때 늦게
     * 반응해(드리프트) "팬했는데 고스트가 안 움직인다"가 된다.
     */
    if (i !== t.i || j !== t.j) this.aimTexel = tileCenter(i, j);
    if (this.aimTile && this.aimTile.i === i && this.aimTile.j === j) return;
    this.aimTile = { i, j };
    this.onAimTile?.(i, j);
  }

  /**
   * 조준 **발자국**의 바닥 윤곽. `i` 가 `null` 이면 지운다.
   *
   * `w`·`d` 를 받는 이유: 바닥 블록 붓(3×3·4×4)은 고스트 스프라이트가 아예 없어서
   * 이 윤곽이 **유일한 미리보기**다. 한 칸만 그리면 4×4 = 48만원을 어디에 까는지
   * 모르는 채 확정을 누르게 된다.
   *
   * ⚠ 표식도 `lift()` 를 탄다 (K37) — 안 태우면 산 위에서 고스트와 8텍셀 어긋나
   * "고스트는 여기인데 표식은 저기"가 된다.
   */
  setReticleMark(i: number | null, j = 0, ok = true, w = 1, d = 1): void {
    this.reticleMark = i === null ? null : { i, j, ok, w, d };
    this.drawReticleMark();
  }

  private drawReticleMark(): void {
    const g = this.aimGfx;
    if (!g) return;
    g.clear();
    const m = this.reticleMark;
    if (!m) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const dy = this.liftAt(m.i, m.j);
    // 고스트 틴트와 같은 짝 — 못 놓는 자리는 둘 다 붉다
    const col = m.ok ? 0x8fe0ff : 0xff6a5a;
    const p = [
      gridToScreen(m.i, m.j),
      gridToScreen(m.i + m.w, m.j),
      gridToScreen(m.i + m.w, m.j + m.d),
      gridToScreen(m.i, m.j + m.d),
    ];
    g.fillStyle(col, 0.2);
    g.lineStyle(2, col, 0.95);
    g.beginPath();
    g.moveTo(p[0]!.x, p[0]!.y + dy);
    for (let k = 1; k < p.length; k++) g.lineTo(p[k]!.x, p[k]!.y + dy);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  // ── 슬라이드 입출구 (K51) ───────────────────────────────────────────────

  /**
   * 놓은 시설 하나의 입구를 보여준다 (`handle`). `null` 이면 끈다.
   *
   * 정보 시트가 쓴다 — **시트가 열려 있는 동안만**이다. 지도에 상시로 그리면 시설 130채
   * 짜리 판이 표식으로 덮인다. 시트를 닫으면 부르는 쪽이 끈다 (`onClose`).
   *
   * ⚠ 칸은 `PlacementGrid` 가 정본이다 — 손님이 쓰는 그 함수들이다
   * (`rideTilesOf`·`entryTilesOf`). 여기서 오프셋을 다시 더하면 화면과 손님이 갈라진다
   * (그게 K51 이 고친 버그다).
   */
  setRideMarkFor(handle: number | null): void {
    if (handle === null) {
      this.setRideMark(null);
      return;
    }
    const item = this.opts.placement.all().find((f) => f.handle === handle);
    const def = item ? facilityDef(item.defId) : undefined;
    this.setRideMark(item && def ? KairoScene.markOf(def, item.i, item.j, item.facing ?? 0) : null);
  }

  /**
   * 무엇을 표식으로 그릴까 — **유도는 여기 한 곳**이다 (K52).
   *
   * 조준(고스트)과 정보 시트가 같은 함수를 쓴다. 두 곳에 각자 산수를 두면 "놓기 전엔
   * 앞 두 면인데 놓고 나면 다른 면"이 될 수 있고, 이 저장소는 그 형태의 버그를 반복해서
   * 겪었다 (`guestWalkable`·`capacityOf`·`evaluateCondition`).
   *
   * ## `walkOn` 2종(플로팅덱·선착장)은 **끈다**
   *
   * 발자국 전체가 길이다 — 손님이 네 면 어디로든 밟고 **지나간다**. 그래서
   * 앞 두 면만 긋는 것은 "나머지 두 면으로는 못 들어온다"는 거짓말이 되고,
   * 그렇다고 "전부"(네 면 윤곽)로 그리면 문제가 셋이다:
   *
   * 1. 그 그림이 음성 대조군(`setEntryFaultForTest` — 네 면 전부)과 **똑같아진다.**
   *    대조군이 그림으로 구별되지 않으면 그 검사는 아무것도 안 재는 검사다
   * 2. 둘 다 **1×1** 이라 네 면 윤곽 = 발자국 윤곽인데, 조준 중에는 붉은 발자국 윤곽
   *    (`reticleMark`)이 이미 같은 자리에 있다 — 표식이 두 벌이 된다
   * 3. 뜻이 다르다. 표식의 문장은 "손님이 **여기로 들어간다**"인데 덱의 답은
   *    "들어가는 게 아니라 지나간다"다. 없는 것이 정확하다
   *
   * ## `capacity 0` 인 분위기·기반 시설 14종도 **끈다**
   *
   * 화단·DJ 부스·펜션·주차장 같은 것들이다. 슬롯이 0개라 손님이 **목적지로 삼지 않는다**
   * (`rebuildFields` 는 이 시설들에도 거리장을 만들지만 `pickTarget` 이 정원 0 을 안 고른다).
   * 아무도 안 들어오는 곳에 `입구` 를 그리면 표식이 거짓말이 되고, 표식의 값은 그것이
   * 손님의 실제 동선과 **같은 집합**이라는 데서 나온다.
   */
  private static markOf(
    def: KairoFacilityDef,
    i: number,
    j: number,
    facing: FacilityFacing,
  ): PlaceMark | null {
    // 슬라이드류가 먼저다 — 데이터가 이미 칸 하나를 골라 놨다 (K51). 존중한다
    const ride = PlacementGrid.rideTilesOf(def, i, j, facing);
    if (ride) return { kind: 'ride', tiles: ride };
    if (!marksEntry(def)) return null;
    const [w, d] = PlacementGrid.sizeOf(def, facing);
    return {
      kind: 'entry',
      foot: { i, j, w, d },
      tiles: PlacementGrid.entryTilesOf(def, i, j, facing),
    };
  }

  private setRideMark(mark: PlaceMark | null): void {
    this.rideMark = mark;
    this.drawRideMark();
  }

  /**
   * 입구·출구를 **면 + 글씨**로 그린다.
   *
   * ## 왜 글씨까지 넣나 — 색만으로는 못 읽는다
   *
   * 폰 393px 에서 타일은 32×16 텍셀이고, 두 표식이 대각으로 붙는 배치가 흔하다
   * (`slide_small` 은 3×3 의 양 끝 모서리다). 색만 두면 "둘 중 어느 쪽이 입구인가"에
   * 답할 방법이 **범례밖에 없는데**, 확정 바에는 범례가 들어갈 자리가 없다
   * (K47-② 가 한 줄 377px 로 못박았다). 글씨는 그 자리에서 스스로 답한다.
   *
   * ## 밝은 글씨 + 두꺼운 진한 테두리
   *
   * `fx.ts` 의 `+₩N` 이 실측으로 뒤집은 그 규칙이다 — 지면이 잔디·물·포장·암반으로
   * 밝기가 제각각이라, 진한 글씨는 어두운 지면에 묻힌다. 작은 글씨에서는 테두리가 색을
   * 지배하므로 **입구/출구의 색 구분도 테두리가 낸다** (면은 거들 뿐이다).
   *
   * ⚠ 표식도 `lift()` 를 탄다 (K37) — 안 태우면 산 위에서 고스트와 8텍셀 어긋난다.
   */
  private drawRideMark(): void {
    for (const t of this.rideLabels) t.destroy();
    this.rideLabels.length = 0;
    this.rideEdges.length = 0;
    const g = this.rideGfx;
    if (!g) return;
    g.clear();
    const m = this.rideMark;
    if (!m) {
      g.setVisible(false);
      return;
    }
    /*
     * ⚠ **투시(K50)와 공존한다.** `syncXray` 는 `facilityImages`/`wallImages` 만 훑으므로
     * 이 `Graphics`·`Text` 는 애초에 대상이 아니고, 힌트 층이라 위에 있어 가려지지도
     * 않는다. **표식이 흐려지면 안 된다**: 투시의 목적이 "고스트를 보이게" 인데 그
     * 고스트의 입구가 같이 흐려지면 목적을 스스로 깎는다.
     */
    g.setVisible(true);
    if (m.kind === 'ride') this.drawRideDiamonds(g, m.tiles);
    else this.drawEntryFaces(g, m);
  }

  /**
   * 슬라이드 4종 — 입구·출구를 **마름모 두 개 + 글씨**로 (K51, 그대로).
   *
   * 여기만 마름모인 이유는 데이터가 칸 하나씩을 골라 놨기 때문이다
   * (`ride.entryTile`/`exitTile`). 손님이 그 칸에서 타고 그 칸으로 내리므로 "칸"이
   * 정확한 단위다. 입구가 **면**인 56종은 아래 `drawEntryFaces` 로 간다.
   */
  private drawRideDiamonds(g: Phaser.GameObjects.Graphics, m: RideTiles): void {
    const spec = [
      { tile: m.entry, text: '입구', fill: '--ride-entry', edge: '--ride-entry-edge' },
      { tile: m.exit, text: '출구', fill: '--ride-exit', edge: '--ride-exit-edge' },
    ] as const;
    for (const s of spec) {
      const [i, j] = s.tile;
      const dy = this.liftAt(i, j);
      const fill = cssColorInt(s.fill, '#2557b0');
      const edge = cssColorInt(s.edge, '#12315f');
      const p = [
        gridToScreen(i, j),
        gridToScreen(i + 1, j),
        gridToScreen(i + 1, j + 1),
        gridToScreen(i, j + 1),
      ];
      /*
       * ⚠ 알파는 **0.82** 다. 처음엔 0.55 로 넣었는데 (고스트가 비쳐야 "어느 구석"이
       * 읽힌다는 생각), 실측 스크린샷에서 **출구의 주황이 통째로 사라졌다** — 고스트
       * 스프라이트가 갈색이라 주황 55% 를 섞으면 그냥 갈색이다. 색을 두 번째 채널로
       * 쓰겠다고 정해 놓고 그 채널이 배경에 먹히면 없는 것과 같다.
       * "어느 구석"은 붉은 발자국 윤곽과 고스트 실루엣이 이미 답한다.
       */
      g.fillStyle(fill, 0.82);
      g.lineStyle(2, edge, 1);
      g.beginPath();
      g.moveTo(p[0]!.x, p[0]!.y + dy);
      for (let k = 1; k < p.length; k++) g.lineTo(p[k]!.x, p[k]!.y + dy);
      g.closePath();
      g.fillPath();
      g.strokePath();
      for (let k = 0; k < p.length; k++) {
        const a = p[k]!;
        const b = p[(k + 1) % p.length]!;
        this.rideEdges.push({ x1: a.x, y1: a.y + dy, x2: b.x, y2: b.y + dy });
      }

      /*
       * ⚠ 글씨는 칸 **위에** 띄운다 (실측으로 옮겼다). 처음엔 칸 중앙에 놓았는데,
       * 11px 한글 두 자는 테두리까지 28×20 텍셀이라 32×16 다이아몬드보다 크다 —
       * 면을 통째로 덮어서 **색이 한 픽셀도 안 보였다** (스크린샷 픽셀로 확인:
       * 칸의 대부분이 글씨 테두리 색이었다). 알파를 올려 봐야 소용이 없었던 이유다.
       * 위로 띄우면 두 채널(색·글씨)이 둘 다 산다 — `fx.ts` 의 `+₩N` 과 같은 배치다.
       *
       * 겹칠 걱정은 없다: 네 슬라이드의 입구↔출구는 화면에서 최소 32텍셀 떨어져 있고
       * (`slide_small` 의 (2,2)↔(0,0) 이 가장 가깝다) 글씨 높이는 14텍셀이다.
       */
      const c = tileCenter(i, j);
      this.addMarkLabel(s.text, c.x, c.y + dy - TILE_H / 2 - 1, s.edge);
    }
  }

  /**
   * 표식을 그리는 56종 — 입구는 **면**이라 앞 두 면을 **굵은 폴리라인 하나 + 글씨 하나**로
   * (K52. 슬라이드 4종은 위 마름모, 나머지 15종은 표식 자체가 없다 — `markOf` 주석).
   *
   * ## 왜 칸마다 마름모를 안 찍나
   *
   * `turtle_island 8×6` 은 앞 두 면의 바깥 이웃이 **14칸**이다. 마름모 14개 + 글씨
   * 14개면 시설이 표식에 통째로 파묻힌다 — K51 이 이미 "네 채짜리 워터파크가 표식
   * 여덟 개로 덮인다"고 같은 경고를 적어 뒀다. 입구가 면일 때 답은 칸의 나열이 아니라
   * **변 하나**다. 글씨도 하나면 충분하다: 면 전체가 한 문장("이쪽으로 들어옵니다")이다.
   *
   * ## 선은 **입구 칸에서 유도한다**
   *
   * 발자국 크기(`w`,`d`)로 "오른쪽 변·아래쪽 변"을 바로 그릴 수도 있지만 그러면 화면이
   * `entryTilesOf` 를 **안 읽는다** — 손님이 들어오는 칸이 바뀌어도 선은 그대로인
   * 상태가 되고, 그건 표식이 조용히 거짓말하는 형태다. 그래서 입구 칸과 발자국이
   * **맞닿은 변**만 모은다. 음성 대조군(`setEntryFaultForTest`)을 켜면 입구 칸이 네 면
   * 전부가 되므로 선도 네 면으로 퍼진다 — 그게 "정말 읽고 있다"의 증거다.
   *
   * ## 조각이 아니라 **이어 붙인 폴리라인**
   *
   * 단위 변을 따로따로 그으면 이음매마다 butt cap 이 남아 45° 꺾임에서 톱니가 보인다.
   * 꼭지점을 이어 한 경로로 만들면 join 이 그 자리를 메운다.
   *
   * ⚠ 표식도 `lift()` 를 탄다 (K37). 발자국은 단이 균일하므로(`level-mixed` 가 강제한다)
   * **발자국 앵커 칸의 단 하나**로 충분하다 — 변은 발자국의 경계이지 바깥 칸의 것이
   * 아니다. 바깥 칸의 단을 쓰면 계단 옆에서 선이 발자국에서 떨어져 뜬다.
   */
  private drawEntryFaces(
    g: Phaser.GameObjects.Graphics,
    m: Extract<PlaceMark, { kind: 'entry' }>,
  ): void {
    const dy = this.liftAt(m.foot.i, m.foot.j);
    const { chains, front } = entryFaces(m.foot, m.tiles);
    if (chains.length === 0) return;
    const fill = cssColorInt('--ride-entry', '#2557b0');
    const edge = cssColorInt('--ride-entry-edge', '#12315f');
    for (const chain of chains) {
      const pts = chain.map((v) => {
        const s = gridToScreen(v[0], v[1]);
        return { x: s.x, y: s.y + dy };
      });
      /*
       * 진한 테두리를 먼저 굵게, 밝은 심을 그 위에 가늘게 — 글씨와 같은 규칙이다
       * (`fx.ts` 의 `+₩N`). 지면이 잔디·물·포장·암반으로 밝기가 제각각이라 한 색만으로는
       * 어딘가에서 반드시 묻힌다. 6/2 는 타일 높이 16텍셀에 견주어 정한 값이다.
       */
      for (const [width, color] of [
        [6, edge],
        [2, fill],
      ] as const) {
        g.lineStyle(width, color, 1);
        g.beginPath();
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k]!.x, pts[k]!.y);
        g.strokePath();
      }
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1]!;
        const b = pts[k]!;
        this.rideEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }

    /*
     * 글씨는 **앞 꼭지점** 위 하나 (자리는 `entryFaces` 가 정한다). 앞 두 면이 거기서
     * 만나므로 글씨가 두 선이 벌어지는 V 안에 앉는다 — 선을 가리지 않으면서 면이 시작
     * 되는 지점을 가리킨다.
     */
    if (!front) return;
    const s = gridToScreen(front[0], front[1]);
    this.addMarkLabel('입구', s.x, s.y + dy - TILE_H / 2 - 1, '--ride-entry-edge');
  }

  /** 표식 글씨 한 장 — 두 그리기 경로가 공유한다 (서식이 갈라지면 한쪽만 안 읽힌다) */
  private addMarkLabel(text: string, x: number, y: number, edgeToken: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
      // 12px — 칸 위로 올렸으니 폭 제약이 없다. 11px 에서는 `출` 의 획이 뭉갰다 (실측)
      fontSize: '12px',
      fontStyle: 'bold',
      color: cssVar('--ride-ink', '#fffaf0'),
      stroke: cssVar(edgeToken, '#12315f'),
      /*
       * `fx.ts` 의 4 보다 얇다 — 거긴 숫자·기호(`+₩12만`)라 획이 굵어도 버티지만
       * 한글 11px 은 4 를 두르면 `출` 의 초성이 뭉갠다 (실측 크롭). 면이 이미
       * 진한 색을 깔아 주므로 여기서는 테두리가 대비를 혼자 낼 필요가 없다.
       */
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 1);
    // 정수 배율 업스케일 위에 얹히므로 2배로 그려야 글자가 뭉개지지 않는다 (fx.ts 와 같다)
    label.setResolution(2);
    label.setDepth(DEPTH_RIDE_LABEL);
    this.rideLabels.push(label);
  }

  /**
   * 검증 도구용 — 지금 표시 중인 표식의 **화면 자리**.
   *
   * ⚠ 칸 좌표만 돌려주면 `rideTilesOf`/`entryTilesOf` 를 두 번 부른 상수 비교가 된다
   * (K38 규칙: 깊이는 화면에 올라간 오브젝트에서 읽는다). 그래서 `edges` 는 **실제로
   * 그은 선분**을, `labels` 는 실제로 올라간 `Text` 를 읽는다 — "그려졌나"까지 답한다.
   */
  rideMarkForTest(): {
    kind: 'ride' | 'entry';
    entry: [number, number] | null;
    exit: [number, number] | null;
    tiles: [number, number][];
    edges: { x1: number; y1: number; x2: number; y2: number }[];
    labels: { text: string; x: number; y: number; depth: number }[];
    visible: boolean;
  } | null {
    const m = this.rideMark;
    if (!m) return null;
    return {
      kind: m.kind,
      entry: m.kind === 'ride' ? [m.tiles.entry[0], m.tiles.entry[1]] : null,
      exit: m.kind === 'ride' ? [m.tiles.exit[0], m.tiles.exit[1]] : null,
      tiles: m.kind === 'entry' ? m.tiles.map((t) => [t[0], t[1]] as [number, number]) : [],
      edges: this.rideEdges.map((e) => ({ ...e })),
      labels: this.rideLabels.map((t) => ({
        text: t.text,
        x: t.x,
        y: t.y,
        depth: t.depth,
      })),
      visible: this.rideGfx?.visible ?? false,
    };
  }

  /**
   * 검증 도구용 음성 대조군 **다리** (K52) — sim 의 `setEntryFaultForTest` 를 브라우저에서
   * 켠다. 켜면 `entryTilesOf` 가 발자국 네 면 전부를 내므로, 표식이 앞 두 면에서 **둘레
   * 전체로 퍼져야** 한다. 안 퍼지면 화면이 `entryTilesOf` 를 안 읽고 발자국 크기로 선을
   * 그리고 있다는 뜻이다 — 그 상태에서는 손님이 들어오는 칸이 바뀌어도 표식이 안 따라간다.
   *
   * ⚠ **이미 뜬 표식은 안 바뀐다.** 표식은 `setGhost`/`setRideMarkFor` 안에서 **유도**
   * 되므로(그게 이 설계의 요점이다) 부르는 쪽이 다시 겨눠야 새 값이 나온다. 여기서
   * 억지로 다시 그리면 "유도 지점이 하나"라는 성질을 검사만 우회하게 된다.
   *
   * ⚠ production 에서 세우지 말 것 — 시설 뒤쪽에도 입구가 있다고 그린다.
   */
  setEntryFaultForTest(on: boolean): void {
    setSimEntryFault(on);
  }

  /**
   * 검증 도구용 음성 대조군 — `'center-lock'` 이면 오프셋 누적을 끄고 고스트를 화면
   * 중앙 칸에 붙인다. 그 상태에서 지도 가장자리 배치가 **실패해야** 커버 검사가 의미를
   * 갖는다 (이 저장소는 "검증이 조용히 통과"를 8건 실측으로 겪었다).
   */
  setAimFaultForTest(name: 'center-lock' | 'none'): void {
    this.aimFault = name === 'center-lock';
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
    /*
     * 깊이는 **걸친 두 칸 중 가까운 쪽**이다 (K46-⑤ — 손님의 K37 규칙과 같다).
     * round 로 한 칸만 잡으면 위로(i+j 감소) 갈 때 반환점에서 이전 칸 지면이
     * 위에 그려져 버스가 아래로 꺼진다 (실측, 사용자 지적).
     */
    g.setDepth(
      spanDepthKey(Math.floor(pos.x), Math.floor(pos.y), Math.ceil(pos.x), Math.ceil(pos.y)) +
        Z_FACILITY,
    );
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

  /**
   * 배율이 바뀐 뒤 고스트를 다시 레티클 밑으로 가져온다 (K47-③).
   *
   * 확대하면 같은 오프셋(텍셀)이 화면에서 두 배가 되어 고스트가 화면 밖으로 나간다.
   * 조준 중이 아니면 아무 일도 안 한다 — 평소 더블탭 확대는 찍은 지점을 앵커로 쓴다.
   */
  private recenterOnAim(): void {
    const a = this.aimTile;
    if (!a) return;
    this.cam.centerOn(tileCenter(a.i, a.j), this.reticleInset);
    this.syncCamera();
    this.beginAim(a.i, a.j); // 커서를 그 칸 중심으로 되돌린다 (오프셋 0)
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
      /*
       * 조준 커서는 `syncCamera()` **뒤**에 민다 (K47-③). 커서가 받는 것은 카메라가
       * 실제로 움직인 양이 아니라 **손가락이 요구한 양**이다 — 클램프에 걸려 카메라가
       * 멈춰도 고스트는 계속 가야 지도 가장자리에 닿는다.
       */
      this.moveAimCursor(-dx / this.cam.upscale, -dy / this.cam.upscale);
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
      /*
       * ⚠ 손을 뗄 때도 커서를 한 번 민다 — 델타 0 이지만 고무줄(`release`)이 카메라를
       * 되돌린 **뒤**의 상태로 표식을 맞춰야 한다. 대조군 모드에서는 이 호출이
       * 커서를 되돌아온 중앙으로 다시 붙인다.
       */
      this.moveAimCursor(0, 0);

      /*
       * 조준 중에는 탭 임계를 올린다 (K47-③). 미세 팬 뒤 손을 떼면 12px 로는 "탭"으로
       * 읽혀 고스트가 손가락 자리로 점프한다 — 정렬하려다 어긋나는 것이 가장 나쁘다.
       */
      if (this.dragMoved >= (this.aimTexel ? 24 : 12)) return; // 드래그였다
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
        this.recenterOnAim();
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
        this.recenterOnAim();
      },
    );
  }

  /**
   * **자리에 앉은 손님**의 그리기 정보 (K52-⑥⑦). 프레임마다 `rebuildSeats` 가 다시 만든다.
   *
   * - `dk`      빌려 온 시설의 깊이 칸 — 아래 `rebuildSeats` 주석이 이유다
   * - `rank`/`count`   같은 시설 안에서 몇 번째인가 (뒤→앞). 동률 깜빡임을 막는 미세 순서
   * - `coRank`/`coCount` 같은 **칸** 안에서 몇 번째인가. 화면 x 를 흩는 데 쓴다
   */
  private seatViews = new Map<
    number,
    { dk: number; rank: number; count: number; coRank: number; coCount: number }
  >();

  /**
   * 음성 대조군 (K52-⑥) — 켜면 앉은 손님이 **자기 칸**의 깊이를 쓴다 (= 이 수정 전).
   *
   * `setRenderFaultForTest` 와 같은 판단이다: 손으로 확인한 것은 다음 사람에게 안 남는다.
   * 이 스위치를 켠 채로 같은 자리를 재서 보이는 손님 픽셀이 **무너져야** 그 검사가
   * 실제로 깊이를 재고 있는 것이다.
   */
  private slotDepthFault = false;
  setSlotDepthFaultForTest(on: boolean): void {
    this.slotDepthFault = on;
  }

  /** 음성 대조군 (K52-⑦) — 켜면 같은 칸의 손님을 안 흩는다 (= 파라솔 둘이 완전히 겹친다) */
  private coSpreadFault = false;
  setCoSpreadFaultForTest(on: boolean): void {
    this.coSpreadFault = on;
  }

  /**
   * 검증 도구용 — 손님 그림 하나를 껐다 켠다.
   *
   * "이 자리에 손님이 **보이나**"는 손님을 껐다 켠 픽셀 차로만 잴 수 있다 (K37 이 쓴
   * 방식이다). 그때는 손님을 판 반대편으로 옮겨서 껐는데, 그러면 `usingSlot`·`state` 까지
   * 손대야 해서 **시뮬 상태를 조작**하게 된다 — 앉은 손님을 재는 검사에서는 그것이 곧
   * 재려는 대상을 지우는 일이다. 그림만 끈다.
   */
  private hiddenGuests = new Set<number>();
  setGuestVisibleForTest(id: number, on: boolean): void {
    if (on) this.hiddenGuests.delete(id);
    else this.hiddenGuests.add(id);
  }

  /**
   * 검증 도구용 — 그 시설에 앉은 손님들의 **화면에 올라간 깊이**.
   *
   * 띠 상수끼리 비교하면 상수 산수라 그리기가 틀려도 통과한다 (K38) — Phaser 오브젝트가
   * 실제로 갖고 있는 값을 돌려준다.
   */
  seatDepthsForTest(handle: number): { id: number; slot: number; i: number; j: number; depth: number }[] {
    const out: { id: number; slot: number; i: number; j: number; depth: number }[] = [];
    for (const g of this.opts.guests.all) {
      if (g.usingHandle !== handle || !this.seatViews.has(g.id)) continue;
      const d = this.guestViews.get(g.id)?.body.depth;
      if (d === undefined) continue;
      out.push({ id: g.id, slot: g.usingSlot, i: g.i, j: g.j, depth: d });
    }
    return out.sort((a, b) => a.depth - b.depth);
  }

  /**
   * ## 앉은 손님이 **그 시설의 깊이 칸을 빌린다** (K52-⑥)
   *
   * 시설은 스프라이트 **한 장**이고 깊이가 `depthKey(발자국 최전방 칸) + Z_FACILITY` 다.
   * 손님은 자기 칸 기준이라 **발자국 뒤쪽 칸의 손님은 깊이가 더 작아** 시설 그림에
   * 통째로 가렸다 — 실측 슬롯 **185개 중 166개(90%)** 다 (`pool_warm 8/8` ·
   * `airbounce 8/8` · `turtle_island 8/8` · `cafe 4/4` · `shop 2/2`). 안 가려지는 19개는
   * 1×1 시설과 N×1 연립의 맨 앞 칸뿐이었다.
   *
   * ⚠ **그 166/185 는 `depthKey(슬롯 칸)` 기준이다.** 고치기 전의 실제 깊이는
   * `spanDepthKey(출발 칸, 슬롯 칸)` 이라 **어느 면으로 걸어 들어왔는지에 따라 갈렸다** —
   * 입구 오른쪽에 지은 시설은 뒤쪽 면으로 들어와 가려지고 왼쪽은 이미 보였다. 그래서
   * 이 수정의 실질은 "가림을 없앴다"보다 **"보이는지가 걸어온 방향에 안 흔들리게 했다"**
   * 에 가깝다. 이 숫자를 "고치기 전 가려지던 비율"로 인용하지 말 것.
   *
   * 시설이 쓰는 **바로 그 키**를 손님도 쓰면 `Z_FACILITY(2) < Z_WALL_FRONT(3) < Z_GUEST(4)`
   * 계약이 발자국 **전체**에 적용된다. 그 계약의 뜻이 원래 "손님은 자기 칸의 시설·앞벽보다
   * 앞"이므로 새 규칙이 아니라 적용 범위가 넓어진 것뿐이다. 미세 순서까지 합쳐도 `Z_BAND`
   * (4096) 미만이라 **앞 칸의 것들은 여전히 손님을 덮는다** — 앞줄 시설 뒤로 안 튀어나온다.
   *
   * ⚠ **깊이 띠 상수를 새로 만들지 않는다** (`iso.ts` 의 `Z_*`). K37 이 고친 앞벽/시설
   * 동률 버그가 그 자리로 돌아온다.
   *
   * ## 걸어 들어오는 중에는 안 빌린다
   *
   * `enterFacility` 는 손님을 슬롯 칸으로 옮기면서 `fromI/fromJ` 에 **밖의 입구 칸**을
   * 남긴다 (렌더가 미끄러져 들어가는 것을 보여 준다). 그 동안 손님 그림은 발자국 **밖**에
   * 걸쳐 있고, 시설 깊이는 그 밖 칸보다 뒤일 수 있다 — 그러면 출발 칸의 지면이 손님을
   * 덮는다 (K37 버그 ② 와 같은 형태). 그래서 **지금 칸도 출발 칸도 발자국 안**일 때만
   * 빌린다. 탑승(슬라이드)은 두 칸이 다 발자국 안이라 자동으로 포함된다.
   *
   * ## 순서는 슬롯 번호가 아니라 **칸 깊이**로 매긴다
   *
   * 한 시설의 손님이 전부 같은 키를 쓰므로 그 안에서 누가 앞인지를 정해야 한다. 슬롯
   * 번호 순으로 하면 데이터가 뒷줄을 먼저 적은 시설(`bbq_zone` 의 첫 슬롯이 가운데다)에서
   * 뒷자리 손님이 앞자리 손님을 덮는다. `depthKey(손님 칸)` 으로 정렬하면 화면 위아래와
   * 일치하고, 같은 칸이면 슬롯 번호로 갈라 **결정론**이 된다 (동률이면 Phaser 가 삽입
   * 순서로 그려 프레임마다 깜빡인다).
   */
  private rebuildSeats(): void {
    this.seatViews.clear();
    let items: Map<number, { i: number; j: number; defId: string; facing?: FacilityFacing }> | null = null;
    const seated: { g: Guest; dk: number; tile: number }[] = [];
    for (const g of this.opts.guests.all) {
      // 수영 구역은 시설이 아니다 (handle 이 `ZONE_HANDLE_BASE` 위) — 아래 `items` 조회에서 빠진다
      if (g.usingHandle <= 0 || g.usingSlot < 0) continue;
      if (!items) items = new Map(this.opts.placement.all().map((f) => [f.handle, f]));
      const item = items.get(g.usingHandle);
      if (!item) continue;
      const def = facilityDef(item.defId);
      if (!def) continue;
      // 발자국 산수의 정본은 `sizeOf` 하나다 — 여기서 `facing === 1 ? [d,w] : [w,d]` 를
      // 다시 쓰면 전치가 두 벌이 된다 (K51 이 데인 자리)
      const [w, d] = PlacementGrid.sizeOf(def, item.facing ?? 0);
      const inside = (i: number, j: number): boolean =>
        i >= item.i && i < item.i + w && j >= item.j && j < item.j + d;
      if (!inside(g.i, g.j)) continue;
      if (g.progress < 1 && !inside(g.fromI, g.fromJ)) continue;
      seated.push({
        g,
        dk: depthKey(item.i + w - 1, item.j + d - 1),
        tile: depthKey(g.i, g.j),
      });
    }
    if (seated.length === 0) return;
    seated.sort((a, b) => a.g.usingHandle - b.g.usingHandle || a.tile - b.tile || a.g.usingSlot - b.g.usingSlot);
    // 같은 시설 · 같은 칸의 인원수를 먼저 센다 — 흩는 폭이 인원수에 따라 정해진다
    const perHandle = new Map<number, number>();
    const perTile = new Map<string, number>();
    for (const s of seated) {
      perHandle.set(s.g.usingHandle, (perHandle.get(s.g.usingHandle) ?? 0) + 1);
      const k = `${s.g.usingHandle}:${s.tile}`;
      perTile.set(k, (perTile.get(k) ?? 0) + 1);
    }
    const rankOf = new Map<number, number>();
    const coRankOf = new Map<string, number>();
    for (const s of seated) {
      const hk = s.g.usingHandle;
      const tk = `${hk}:${s.tile}`;
      const rank = rankOf.get(hk) ?? 0;
      const coRank = coRankOf.get(tk) ?? 0;
      rankOf.set(hk, rank + 1);
      coRankOf.set(tk, coRank + 1);
      this.seatViews.set(s.g.id, {
        dk: s.dk,
        rank,
        count: perHandle.get(hk) ?? 1,
        coRank,
        coCount: perTile.get(tk) ?? 1,
      });
    }
  }

  /**
   * 손님 그리기. 몸통·표정·이모트를 **따로** 얹는다 — 표정을 몸통에 곱하면 1,280셀이
   * 되고, 오버레이면 16셀이면 된다 (스펙 §2.1).
   */
  private syncGuests(): void {
    this.rebuildSeats();
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
    const seat = this.seatViews.get(g.id);
    /*
     * ## 같은 칸에 둘 이상이면 좌우로 흩는다 (K52-⑦)
     *
     * 예전에는 슬롯마다 `offsetTexel` 을 **데이터에** 적었다 (파라솔·선착장 4개, 전부
     * `±5,0`). 그 규칙은 절반만 돌았다 — 회전 특화(P1.5)로 정원이 슬롯보다 많아진
     * 손님(최대 2명)은 `k % n` 으로 남의 슬롯 칸에 겹쳐 서는데 그에게 줄 오프셋은
     * 데이터에 있을 자리가 없다. **인원수에서 파생**하면 규칙 하나가 둘 다 덮는다.
     *
     * 가운데를 기준으로 대칭이라 (`rank − (n−1)/2`) 인원이 하나면 오프셋이 0 이다 —
     * 혼자 앉은 손님이 칸 중심에서 밀리지 않는다.
     *
     * ⚠ 간격은 **칸을 넘지 않게** 좁힌다. 계약값(10)은 둘일 때 지운 `offsetTexel`(±5)과
     * 같은 자리인데, 셋이면 총 폭이 `2×10 + 손님 폭 14 = 34` 라 타일 32 를 넘어 옆 칸
     * 손님과 섞인다. 셋은 회전 특화로 정원이 슬롯보다 많아졌을 때 실제로 생긴다.
     */
    const gap =
      seat && seat.coCount > 1
        ? Math.min(COSLOT_SPREAD_TEXELS, (TILE_W - GUEST_W) / (seat.coCount - 1))
        : 0;
    const spread =
      seat && !this.coSpreadFault && seat.coCount > 1
        ? (seat.coRank - (seat.coCount - 1) / 2) * gap
        : 0;
    const cx = STEP_X * (fi - fj) + spread;
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
    /*
     * 자리에 앉은 손님은 **그 시설의 깊이 칸을 빌린다** (K52-⑥ — 근거는 `rebuildSeats`).
     * 그 안의 순서는 `rank/count × 0.9` 로 못 박는다: 1 미만이라 띠를 안 넘고, 동률이면
     * Phaser 가 삽입 순서로 그려 겹친 손님이 프레임마다 깜빡인다.
     */
    const borrow = seat && !this.slotDepthFault ? seat : null;
    const dk = borrow ? borrow.dk : spanDepthKey(g.fromI, g.fromJ, g.i, g.j);
    const sub = borrow ? (borrow.rank / Math.max(1, borrow.count)) * 0.9 : 0;
    /*
     * 표정·이모트를 몸통에 붙이는 간격. 앉은 손님은 **자기 몸통 바로 위**여야 한다 —
     * 띠 하나(1.0)를 쓰면 미세 순서가 최대 0.9 라서 뒷자리 손님의 표정이 앞자리 손님의
     * 몸통을 뚫고 나온다.
     */
    const faceGap = borrow ? 0.3 : Z_FACE - Z_GUEST;
    const emoteGap = borrow ? 0.6 : Z_EMOTE - Z_GUEST;
    const bodyDepth = dk + Z_GUEST + sub;

    // 검증 도구가 이 손님만 껐나 (픽셀 대조 — `setGuestVisibleForTest`)
    const shown = this.hiddenGuests.size === 0 || !this.hiddenGuests.has(g.id);

    v.body.setTexture('guest', bodyFrame(g.palette, pose, facing, frame));
    v.body.setPosition(cx, cy);
    v.body.setDepth(bodyDepth);
    v.body.setVisible(shown);

    const off = (this.guestAtlas?.headOffset ?? { [pose]: { x: 4, y: 2 } })[pose] ?? { x: 4, y: 2 };
    v.face.setTexture('guest', faceFrame(g.face, facing));
    v.face.setPosition(cx - GUEST_W / 2 + off.x, cy - GUEST_H + off.y);
    v.face.setDepth(bodyDepth + faceGap);
    v.face.setVisible(shown && (facing === '+X' || facing === '+Z'));

    if (g.emote && shown) {
      v.emote.setTexture('emote', `e_${g.emote}`);
      v.emote.setPosition(cx, cy - GUEST_H - 4);
      v.emote.setDepth(bodyDepth + emoteGap);
      v.emote.setVisible(true);
    } else {
      v.emote.setVisible(false);
    }
  }

  override update(_time: number, delta: number): void {
    /*
     * 사라진 수입 숫자를 걷어낸다 (K48). `IncomeFx.add` 안에서만 걷으면, 수입이 뜸한
     * 구간에서 죽은 라벨이 남아 **상한이 유령에 막힌다** — 하네스가 읽는 수도 거짓이 된다.
     */
    this.incomeFx?.sweep(this.time.now);
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
    /*
     * 물은 **시뮬과 무관하게** 흐른다 (K53). 시트를 열어 시간이 멈춰도 분수는 뿜는다 —
     * 손님 스프라이트의 프레임(`animTick / 6`)이 이미 같은 규칙이고, 카이로도 그렇다.
     * 번호가 바뀐 프레임에만 실제로 일한다.
     */
    this.stepAmbient();
    this.opts.guests.advanceRenderProgress(delta / 1000, this.tickSeconds);
    this.syncGuests();
    this.reportFrame();
  }

  /** 코스가 바뀌면 main 이 부른다 — 경로는 sim 스플라인 표본 (타일 좌표) */
  setCourseBoats(list: { path: { x: number; y: number }[]; vehicles: number }[]): void {
    this.courseBoats = list
      .filter((c) => c.path.length >= 2)
      .map((c, k) => ({
        path: c.path.map((p) => ({ ...p })),
        boats: Array.from({ length: Math.max(1, c.vehicles) }, (_, b) => b / Math.max(1, c.vehicles)),
        // 코스마다 위상을 다르게 — 전부 동시에 출발하면 기계적으로 보인다
        t: (k * 0.37) % 1,
      }));
    this.drawBoats();
  }

  /**
   * sim tick 수만큼 배를 민다 — 흐름·스킵이 부른다. 실시간이 아니라 tick 이라
   * 멈춤 규칙(시트·모달·배경 탭)이 공짜로 적용된다.
   */
  advanceBoats(ticks: number): void {
    if (this.courseBoats.length === 0 || ticks <= 0) return;
    for (const c of this.courseBoats) {
      // 한 바퀴(왕복) ≈ 표본 수 × 1.2tick — 표본 12개/구간이라 잔잔한 속도가 된다
      c.t = (c.t + ticks / (c.path.length * 2.4)) % 1;
    }
    this.drawBoats();
  }

  /** 왕복(핑퐁) 위치 — 프리셋 종류와 무관하게 시각적으로 안전한 최소형 */
  private boatPos(path: { x: number; y: number }[], t: number): { x: number; y: number } {
    const seg = path.length - 1;
    const tt = t < 0.5 ? t * 2 : (1 - t) * 2; // 0→1→0
    const f = tt * seg;
    const i = Math.min(seg - 1, Math.floor(f));
    const frac = f - i;
    const a = path[i] as { x: number; y: number };
    const b = path[i + 1] as { x: number; y: number };
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  }

  /**
   * 수영 구역 표시 (S3) — 수영장은 **코핑**(밝은 테두리), 강 구역은 **부표 점선**.
   * 구역은 파생이라 넘어온 목록으로 **통째로** 다시 그린다. 그래도 되는 이유는
   * main 이 구역 서명이 바뀐 폴링에서만 부르기 때문이다 — 매 프레임 부르면 안 된다.
   *
   * 칸마다 그래픽 하나다: 깊이는 칸 단위(`depthKey + Z_FACILITY`)여야 남쪽 지면에
   * 안 덮이고 헤엄치는 손님(Z_GUEST)보다는 뒤에 선다. 한 장에 최대 깊이를 주면
   * 북쪽 손님이 부표에 덮인다 (보트에서 겪은 그 문제의 면적판).
   */
  setSwimZones(zones: readonly { kind: 'pool' | 'river'; tiles: { x: number; y: number }[] }[]): void {
    // ⚠ create() 전에 불릴 수 있다 — 씬이 **기억했다가** 적용한다 (setLand 와 같은
    // 규칙). 부르는 쪽 순서에 기대면 그림만 조용히 안 나온다: 지면 타일이 아직
    // 없으면 applySwimZones 가 그냥 돌아가고, create() 가 다시 부른다
    this.pendingSwim = zones;
    this.applySwimZones();
  }

  private pendingSwim: readonly { kind: 'pool' | 'river'; tiles: { x: number; y: number }[] }[] = [];

  private applySwimZones(): void {
    if (this.tileImages.length === 0) return; // create() 가 다시 부른다
    const zones = this.pendingSwim;
    for (const g of this.swimGfx) g.destroy();
    this.swimGfx = [];
    const coping = cssColorInt('--swim-coping');
    const buoy = cssColorInt('--swim-buoy');
    for (const z of zones) {
      const inZone = new Set(z.tiles.map((t) => (t.y << 10) | t.x));
      for (const t of z.tiles) {
        const c = tileCenter(t.x, t.y);
        // 다이아몬드 꼭지점 — 위·오른쪽·아래·왼쪽
        const top = { x: c.x, y: c.y - TILE_H / 2 };
        const right = { x: c.x + TILE_W / 2, y: c.y };
        const bottom = { x: c.x, y: c.y + TILE_H / 2 };
        const left = { x: c.x - TILE_W / 2, y: c.y };
        // 이웃 방향 → 그 변의 두 끝 (투영: +I 는 오른아래, +J 는 왼아래)
        const sides: [number, number, { x: number; y: number }, { x: number; y: number }][] = [
          [1, 0, right, bottom],
          [-1, 0, top, left],
          [0, 1, bottom, left],
          [0, -1, top, right],
        ];
        let g: Phaser.GameObjects.Graphics | null = null;
        for (const [di, dj, a, b] of sides) {
          if (inZone.has(((t.y + dj) << 10) | (t.x + di))) continue;
          g ??= this.add.graphics();
          if (z.kind === 'pool') {
            g.lineStyle(2, coping, 0.9);
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.strokePath();
          } else {
            // 부표 — 변을 따라 점 둘 (1/3 · 2/3 지점)
            g.fillStyle(buoy, 1);
            for (const f of [1 / 3, 2 / 3]) {
              g.fillCircle(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 1.6);
            }
          }
        }
        if (g) {
          g.setDepth(depthKey(t.x, t.y) + Z_FACILITY);
          this.swimGfx.push(g);
        }
      }
    }
  }

  private drawBoats(): void {
    const g = this.boatGfx;
    if (!g) return;
    g.clear();
    if (this.courseBoats.length === 0) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    let maxDepth = 0;
    for (const c of this.courseBoats) {
      for (const off of c.boats) {
        const p = this.boatPos(c.path, (c.t + off) % 1);
        const w = tileCenter(Math.round(p.x), Math.round(p.y));
        // 보간 좌표 — 칸 중심이 아니라 표본 사이 실수 좌표로
        const fx = w.x + (p.x - Math.round(p.x)) * STEP_X - (p.y - Math.round(p.y)) * STEP_X;
        const fy = w.y + (p.x - Math.round(p.x)) * STEP_Y + (p.y - Math.round(p.y)) * STEP_Y;
        // 임시 도형 — 선체 + 항적 한 줄 (버스와 같은 취급, 에셋은 마지막)
        g.fillStyle(0xe8dcc0, 1);
        g.fillRect(fx - 7, fy - 4, 14, 6);
        g.fillStyle(0x7a4a14, 1);
        g.fillRect(fx - 7, fy + 1, 14, 2);
        g.fillStyle(0xffffff, 0.35);
        g.fillRect(fx - 11, fy + 2, 4, 1);
        // 걸친 두 칸 중 가까운 쪽 (버스와 같은 K46-⑤ 규칙) — 매직 넘버도 띠 상수로
        const d =
          spanDepthKey(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.x), Math.ceil(p.y)) +
          Z_FACILITY;
        if (d > maxDepth) maxDepth = d;
      }
    }
    g.setDepth(maxDepth);
  }

  /**
   * 하루 안의 시각 표현 (K39) — 아침·저녁에 화면 전체를 살짝 물들인다.
   *
   * `frac` 는 하루 진행률 (0~1). `null` 이면 끈다 (주 경계·모달 게이트).
   * 색은 `style.css` 토큰(`--day-dawn`/`--day-dusk`)에서 읽는다 — 색 소유권 규칙 (K34).
   * `transform`/`opacity` 급의 값 변경만 하므로 reduced-motion 과 무관하다 (전환 없음).
   */
  /**
   * 수입 숫자 (K48) — `+₩N` 이 매표소·시설 **위에** 떠올랐다 사라진다.
   *
   * 사용자 보고의 후반부: "매표소 근처에 돈이 증가하는 이펙트 같은것도 추가하고 …
   * 분식·자판기 등 부차적으로 구매할 수 있는 부분도 마찬가지로." 숫자가 어디서
   * 났는지가 보여야 "무엇이 돈을 벌고 있나"가 화면에서 읽힌다.
   *
   * 그리기는 **등록부**가 한다 (`playFx('income-pop', …)`) — 여기는 이어 붙이기만 한다.
   */
  private incomeFx: IncomeFx | null = null;

  /** 이번 tick 의 수입 사건. sim 의 `WeekRunner.setIncomeObserver` 가 그대로 넘긴다 */
  pushIncome(events: readonly IncomeEvent[]): void {
    if (events.length === 0) return;
    this.incomeFx ??= new IncomeFx((t) => playFx(this.fxHost(), 'income-pop', t));
    const now = this.time.now;
    for (const e of events) this.incomeFx.add(e.handle, e.i, e.j, e.amount, now);
  }

  /** 화면에 떠 있는 수입 숫자의 수 — 하네스·검사가 읽는다 */
  get floatCountForTest(): number {
    return this.incomeFx?.liveCount ?? 0;
  }

  private fxHostCache: FxHost | null = null;
  private fxHost(): FxHost {
    /*
     * ⚠ `reduced` 와 색은 **한 번만** 읽는다. `matchMedia`·`getComputedStyle` 은
     * 레이아웃을 강제하는데, 여기는 초당 수십 번 불릴 수 있는 자리다
     * (`tokens.ts` 의 캐시와 같은 이유).
     */
    this.fxHostCache ??= {
      scene: this,
      liftAt: (i, j) => this.liftAt(i, j),
      reduced:
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      ink: cssVar('--fx-gain', '#fffaf0'),
      outline: cssVar('--fx-gain-edge', '#14612f'),
    };
    return this.fxHostCache;
  }

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
    /*
     * 아침(0~8%)·저녁(85%~)만, 알파는 낮게 (K45). 처음엔 아침 15%/0.18 · 저녁 30%/0.22
     * 였는데 하루가 24초가 되자 화면의 절반 가까이가 물들어 "낮인데 황사 낀 것처럼
     * 뿌옇다"는 보고를 받았다 — 낮 시간의 대부분은 무채여야 한다.
     */
    let color = 0;
    let alpha = 0;
    if (frac < 0.08) {
      color = dawn;
      alpha = 0.1 * (1 - frac / 0.08);
    } else if (frac > 0.85) {
      color = dusk;
      alpha = 0.16 * ((frac - 0.85) / 0.15);
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

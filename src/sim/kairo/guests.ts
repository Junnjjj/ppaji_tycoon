import { Rng } from '../rng.js';
import { FlowField } from '../pathfield.js';
import { KairoTerrain } from './terrain.js';
import { type WallGrid } from './walls.js';
import {
  PlacementGrid,
  facilityDef,
  guestWalkable,
  type KairoFacilityDef,
  type PlacedFacility,
} from './placement.js';
import {
  poolZones,
  riverZones,
  zoneHandle,
  zoneCapacity,
  zoneFee,
  ZONE_HANDLE_BASE,
  type SwimZone,
} from './swim.js';
import {
  pickGroup,
  groupSize,
  groupDef,
  needWeight,
  type GroupDef,
  type GroupId,
} from './groups.js';
import type { Season } from './week.js';
import {
  chooseMenu,
  recipeDef,
  type MenuPurchase,
  type MenuStore,
  type RegularVisit,
  type TasteTag,
} from './menu.js';

/**
 * 손님 에이전트 — **시뮬 소유**. 스펙 §2.
 *
 * ## 왜 개체 단위인가
 *
 * 통계로 굴리면 "손님이 노는 광경"이 사라진다. 그게 이 게임 최대의 보상이고, 사용자가
 * 카이로를 택한 이유("npc들의 표정을 보고, 상호작용을 눈으로 볼 수 있다")다.
 *
 * ## 왜 flow field 인가
 *
 * 60명이 각자 A* 를 돌리면 배치를 바꿀 때마다 프레임이 튄다. 목적지(시설)마다 거리장을
 * 한 번 만들어 두면 손님당 비용이 O(1) 이다. 거리장은 `src/sim/pathfield.ts` 를 그대로
 * 쓴다 — 렌더 비의존이라 헤드리스에서도 돈다.
 *
 * ## 퇴장 만족도가 평판의 기반이다
 *
 * "현재 평균 만족도"는 함정이다. 할 게 없는 빠지는 손님이 빨리 나가 새 손님으로 교체되어
 * **평균이 오히려 높아진다**. Phase 1 에서 실제로 걸렸던 부분이라 여기서도 퇴장 시점의
 * 만족도만 집계한다.
 */

/**
 * 손님의 상태.
 *
 * `'arriving'` 은 **아직 공원 밖**이다 (K36-B②) — 정류장에 내려 매표소로 걸어가는 중.
 * 이 구간을 따로 두는 이유는 두 가지다:
 *   · 정원(`maxGuests`)은 **공원 안** 인원이다. 밖에서 걸어오는 사람까지 세면 정류장~매표소
 *     거리가 그대로 정원을 깎아, 플레이어가 못 바꾸는 것이 상한을 정하게 된다
 *   · 걷기 감점도 입장 뒤부터다 (아래 `walkPenalty` 주석)
 */
export type GuestState = 'arriving' | 'walking' | 'using' | 'leaving' | 'gone';

/** 포즈 — 렌더 계약의 7종과 같은 이름. 시뮬이 정하고 렌더가 그린다 */
export type GuestPose = 'idle' | 'walk' | 'swim' | 'float' | 'sit' | 'lie' | 'ride';

/** 표정 4종 — 만족도에서 파생된다 (스펙 §2.1) */
export type GuestFace = 'calm' | 'happy' | 'annoyed' | 'tired';

/** 이모트 6종 */
export type GuestEmote = 'happy' | 'love' | 'neutral' | 'annoyed' | 'hot' | 'alert';

export interface Guest {
  id: number;
  /** 일행 유형 (§10.4) — 지갑·인내·수요 편향이 여기서 온다 */
  group: GroupId;
  /** 같은 일행 식별자 — 렌더가 무리를 묶어 보여줄 수 있다 */
  party: number;
  /** 객단가 배율 */
  wallet: number;
  /** 스릴 선호 0..1 */
  thrill: number;
  /** Phase 3 이름 있는 단골. 없으면 일반 손님이다. 주가 끝나면 agent와 함께 사라진다. */
  characterId?: string;
  requestedRecipeId?: string;
  regularPrefer?: TasteTag[];
  regularAvoid?: TasteTag[];
  /** 현재 타일 */
  i: number;
  j: number;
  /** 직전 타일 — 렌더가 보간해서 부드럽게 움직인다 */
  fromI: number;
  fromJ: number;
  /** 0..1, 직전 타일에서 현재 타일로 가는 진행도 */
  progress: number;
  state: GuestState;
  pose: GuestPose;
  /** 향하는 방향 — 렌더의 4방향과 같다 */
  facing: '+X' | '+Z' | '-X' | '-Z';
  /** 색 변형 (구명조끼 등) */
  palette: number;
  face: GuestFace;
  emote: GuestEmote | null;
  emoteTicks: number;
  /** 이용 중인 시설 handle 과 슬롯 번호 */
  usingHandle: number;
  usingSlot: number;
  /** 현재 이용에서 고른 메뉴. 시설 슬롯에서 파생하며 이용 완료 후 비운다. */
  menuId: string | null;
  /**
   * 지금 하는 이용이 **입장 수속**인가 (K36-B②).
   *
   * 표는 놀이가 아니다 — 이 이용은 `used`(→`wantUses`)·`usedNeeds`·시설 요금 어디에도
   * 안 센다. 상태만으로는 구분이 안 되는데, 매표소에 선 순간 상태가 `'using'` 이라
   * 다른 시설과 같아지기 때문이다.
   */
  admitting: boolean;
  /** 남은 이용 tick */
  useTicks: number;
  /** 만족도 0..100 — 퇴장 시점 값만 집계한다 */
  satisfaction: number;
  /** 이용한 시설 수 */
  used: number;
  /** 걷기 tick 누적 (속도 제어) */
  stepAcc: number;
  /**
   * 제자리에 머문 tick.
   *
   * ⚠ **없으면 손님이 영원히 갇힌다.** 나중에 지은 시설이 손님을 둘러싸면 게이트로 갈
   * 길이 사라지고, 거리장이 −1 이라 한 걸음도 못 뗀다. 그런 손님은 퇴장도 안 하므로
   * 정원이 영원히 차 있고, 새 손님이 못 들어와 **주간 입장이 0** 이 된다. 그러면 퇴장
   * 만족도가 0(퇴장이 없음)이고 등급이 1로 떨어져 상한이 30 이 되고, 그 상한이 다시
   * 갇힌 손님으로 차 있어 **돌아올 길이 없다** (312주 실측: 12판 중 4판이 이 상태).
   */
  stuckTicks: number;
  /**
   * 이미 채운 수요 종류.
   *
   * 없으면 손님이 **항상 가장 가까운 시설**만 가고, 가까운 곳이 빨리 비면 먼 시설은
   * 아무도 안 간다 (실측: 잔교 끝 트램폴린 방문 0). 그러면 "무엇을 짓나"보다
   * "게이트에 붙이나"만 남는다.
   */
  usedNeeds: string[];
  /** 슬라이드 탑승 — 남은 tick 과 전체 tick (0 이면 탑승 아님) */
  rideTicks: number;
  rideTotal: number;
  /**
   * **들어온 자리** — 이용을 마치고 `leaveFacility` 가 돌아갈 기준 칸이다.
   *
   * 셋이 같은 필드를 쓴다 (`Guest` 에 필드를 안 늘린다 — 손님은 저장 안 되니 이름만의 문제다):
   *   · 슬라이드 → 입구 칸. 그대로 **탑승 보간의 출발점**이기도 하다 (`rideTicks > 0` 일 때)
   *   · 수영     → 입수한 뭍 칸 (S2). 물 칸엔 거리장이 없어 그 자리로 올라와야 한다
   *   · 슬롯     → 앉기 전에 서 있던 밖 칸
   *
   * 기준 칸이 지금 못 걷는 칸일 수 있다 (슬라이드 입구는 발자국 **안**이다) —
   * `leaveFacility` 가 걸을 수 있는 이웃으로 편다.
   */
  rideFrom: readonly [number, number];
  /** 탑승 도착 칸 (출구). `rideTicks > 0` 인 동안만 뜻이 있다 */
  rideTo: readonly [number, number];
}

/**
 * 일반 손님과 이름 있는 단골의 독립 RNG 스트림.
 *
 * 단골 한 명이 일반 일행 대신 도착해도 `pickGroup`·`groupSize`·개체 성향 뽑기를
 * 소비하면 안 된다. 기존 단위 호출자는 `Rng` 하나를 그대로 넘길 수 있고, 주 러너만
 * 이 구조를 써서 두 도메인을 격리한다.
 */
export interface GuestRngStreams {
  general: Rng;
  regular: Rng;
}

type GuestRngSource = Rng | GuestRngStreams;

function guestRngStreams(source: GuestRngSource): GuestRngStreams {
  return source instanceof Rng ? { general: source, regular: source } : source;
}

export interface GuestTunables {
  /** 동시 손님 상한 */
  maxGuests: number;
  /** 한 칸 이동에 필요한 tick */
  ticksPerStep: number;
  /** 시설 1회 이용 tick */
  useTicks: number;
  /**
   * 수영 구역 1회 체류 tick — **시설과 따로 두는 유일한 이용 시간**이다.
   *
   * 유영 걸음은 4 tick 마다 한 칸이라 (아래 `tick()` 의 `& 3`) 걸음 수 = `swimTicks / 4` 다.
   * 12 이면 걸음이 **3번**뿐이라 "잠깐 담갔다 나온다"로 읽혔다 (사용자 지적).
   *
   * ⚠ 이 값은 **하루 예산**에 걸린다. 방문 = 3 × `useTicks` + `swimTicks` + 이동 약 40 이고
   * 하루는 120 tick 이다 — 넘으면 손님이 이틀을 머물러 공원이 영구히 포화된다
   * (`STUCK_LIMIT` 주석의 죽음의 나선). 24 면 36 + 24 + 40 = 100 tick 으로 여유가 20 이다.
   */
  swimTicks: number;
  /** 이 횟수만큼 이용하면 만족하고 나간다 */
  wantUses: number;
  /** 목적지를 못 찾은 채 이 tick 이 지나면 불만을 품고 나간다 */
  patienceTicks: number;
  /** 이모트 표시 tick */
  emoteTicks: number;
  /** 시작 만족도 */
  startSatisfaction: number;
  /**
   * 이용 1·2·3·4회차의 만족도 상승. **체감시킨다** — 같은 값을 계속 주면 만족도가
   * 상한에 붙어 배치 차이가 결과에 안 나타난다 (헤드리스에서 전 판 98 이 나왔다).
   */
  useGains: readonly number[];
  /** 한 칸 걸을 때마다 깎이는 양 — 이게 있어야 "가깝게 놓는다"가 의미를 갖는다 */
  walkPenalty: number;
  /** 갈 곳을 못 찾은 tick 마다 깎이는 양 */
  waitPenalty: number;
  /**
   * 입장료 (원). 매표소를 지날 때 **한 번** 받는다 (설계 §13.1 의 첫 줄).
   *
   * 시설 요금과 달리 지갑 배율을 안 탄다 — 정찰가라서다. 요금 슬라이더(`priceMult`)는
   * 같이 민다 (`week.ts` 가 곱한다).
   */
  admissionFee: number;
  /**
   * 매표소를 거쳐야 들어오나 (K36-B②).
   *
   * 끄면 손님이 게이트에 툭 나타나던 예전 동작이 된다 — **대조군 전용**이다.
   * 새 검사가 실제로 무언가를 막는지 보이려면 끈 쪽이 통과해야 한다.
   */
  requireTicket: boolean;
}

/**
 * 제자리에 머문 tick 의 한계 — 이걸 넘으면 갇힌 것으로 보고 정리한다.
 *
 * 200 tick ≈ 하루 반. 인내(`patienceTicks` 300)보다 짧게 둔다 — 인내는 "갈 곳이 없다"이고
 * 이건 "길이 없다"라서 더 빨리 판정해야 판이 안 얼어붙는다.
 */
export const STUCK_LIMIT = 200;

/**
 * **일부러 망가뜨리는 스위치** — **K52 5단계 이전의 세계**를 그대로 되돌린다:
 *   · 손님이 슬롯 칸에 **안 앉는다** (이용 중에도 들어온 칸에 서 있다)
 *   · 복원이 **구역(수영) 분기 안에만** 있다 → 슬라이드를 탄 손님이 출구
 *     (발자국 안 = 못 걷는 칸)에 남아 `STUCK_LIMIT × ticksPerStep` = **800 tick** 얼어붙는다 (E①)
 *
 * 이 저장소 규칙이다 (`setRideFaultForTest`·`setEntryFaultForTest` 와 같은 자리):
 * 손으로 한 번 되돌려 확인한 것은 다음 사람에게 안 남는다. 켠 상태에서
 * ★ "이용을 마친 손님이 안 갇힌다" 와 ★ "손님이 슬롯 칸 위에 있다" 가 **실패해야**
 * 그 검사들이 정말 이 배선을 재고 있는 것이 된다.
 *
 * ⚠ **둘을 한 스위치에 묶는다.** 복원만 끄면 손님이 슬롯 칸에 앉은 채 갇혀 예전에도
 * 지금도 아닌 **제3의 세계**가 되고, 그 세계로 잰 밸런스 Δ 는 아무 뜻이 없다
 * (실측: 26주 퇴장 만족도 중앙 0 · 심사 자격 미달 312/312주).
 *
 * ⚠ 포즈는 되돌리지 않는다 — 삭제된 `poseFor()` 는 **화면만** 보고 밸런스에 안 닿는다.
 *
 * ⚠ production 에서 세우지 말 것.
 */
let slotRestoreFault = false;
export function setSlotRestoreFaultForTest(on: boolean): void {
  slotRestoreFault = on;
}

/** 4이웃 — 복원 후보를 **고정 순서**로 훑는다 (결정론, 불변식 2) */
const STEP4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const GUEST_DEFAULTS: GuestTunables = {
  maxGuests: 60,
  ticksPerStep: 4,
  /**
   * 이용 시간. **한 방문이 하루(120 tick) 안에 끝나야 한다** — 40 tick × 4회 + 이동이면
   * 160 tick 이라 손님이 2.5일을 머물고 공원이 영구히 포화된다 (헤드리스에서 만석 63%).
   * 12 tick × 4회 + 이동 40 = 88 tick 으로 하루 안에 들어온다.
   */
  useTicks: 12,
  /*
   * 수영 체류 24 tick = **4.8초 · 유영 걸음 6번**.
   *
   * 두 제약의 균형점이다:
   *   · **아래쪽** — "수영으로 읽히는 최소 시간". 12 tick 은 걸음 3번(2.4초)이라 입수·유영·
   *     퇴수가 각 한 박자씩이고, 눈에는 물에 들어갔다 나온 것으로만 보였다. 걸음이 6번이면
   *     구역 안을 실제로 **돌아다니는** 모양이 된다 (레퍼런스의 수영 손님도 그렇다)
   *   · **위쪽** — 하루 예산 120 tick. 방문 = 12×3 + 24 + 이동 40 = 100 tick.
   *     36(걸음 9번)이면 112 라 이동이 조금만 길어도 하루를 넘긴다 — 여유가 없다
   *
   * ## 회전 비용 — 이 변경의 진짜 값
   *
   * 방문이 88 → 100 tick(+14%) 이라 손님 하나가 정원을 묶는 시간이 는다. 밸런싱으로
   * 재 봤다 (같은 트리에서 `--swim 12` 와 `--swim 24` 를 **동시에** 돌린 대조):
   *   · 24시드 52주 — 수영 이용 6,200 → 5,746 (−7%) · 만석 중앙 0%(둘 다) · 퇴장 만족 76(둘 다)
   *   · 12시드 26주 — 수영 이용 2,531 → 2,631 · 만석 31% → 28% (시드 노이즈가 더 크다)
   * 양쪽 다 경보 0. **보정(요금·정원)은 넣지 않았다** — 이용 횟수(`wantUses`)가 그대로라
   * 손님 1인당 이용 수가 안 변하고, 줄어든 것은 하루에 받는 손님 수뿐인데 그 폭이
   * 노이즈 안이다. 요금으로 메우면 "체류를 늘렸더니 객단가가 올랐다"는 **다른 변경**이 섞인다.
   *
   * ⚠ 회전이 실제로 무는 것은 **만석**이지 매출이 아니다. 수영은 입장권에 포함(P6)이라
   * 구역 요금이 0 이고, 그래서 체류를 늘려도 잃을 요금 수입이 애초에 없다.
   */
  swimTicks: 24,
  wantUses: 4,
  patienceTicks: 300,
  /*
   * 말풍선이 떠 있는 시간 (K29). 30(3초)이면 **거의 모든 손님에게 늘 붙어** 화면을
   * 덮는다 — 말풍선을 키우고 나서 눈에 띄었다. 레퍼런스는 많은 손님 중 몇에게만 떠 있다.
   *
   * 표시 전용 값이라 RNG·결정론·밸런스와 무관하다 (`g.emote` 는 렌더만 읽는다).
   */
  emoteTicks: 12,
  startSatisfaction: 52,
  useGains: [14, 10, 7, 4],
  /*
   * 걷기 페널티. **0.35 에서 0.22 로 낮췄다** — "채운 수요 기록"이 살아나면서 손님이
   * 다른 종류를 찾아 훨씬 멀리 걷게 됐고, 같은 페널티면 총량이 두 배가 된다
   * (실측: 80주 등급 4→2 · 만족도 76→64). 의도는 "가깝게 놓는 것이 의미를 갖는다"이지
   * "펼치면 등급이 안 오른다"가 아니다.
   */
  walkPenalty: 0.22,
  waitPenalty: 0.12,
  /*
   * 입장료 — **1/10 눈금**이다. 시설 요금이 이미 그 눈금이라 (설계의 식음 객단가
   * ₩8,000 이 데이터에는 `fee: 800`, 요금 중앙값 900), 명목가 10,000 을 그대로 넣으면
   * 입장료 한 번이 시설 이용 열 번이 된다 — 실측으로 26주 현금 중앙값이
   * 400만 → **2,854만** 이 됐다 (K36-B②). 그래서 3,800 은 **명목가 ₩38,000** 이다.
   *
   * ## 왜 1,000 → 3,800 인가 (P6)
   *
   * 빠지 시설 42종이 "입장권에 포함"이 되면서 이용 요금을 안 받는다
   * (`charge: 'included'`). 그 돈은 사라진 것이 아니라 **표값으로 옮겨 왔다** — 실제
   * 빠지가 그렇다. 옮기는 양은 실측으로 맞췄다 (`--charge-all --adm 1000` 대조군과
   * 같은 바이너리로 잰 값, 24시드 52주):
   *
   *   | 수입 구성 | 전 | 후 |
   *   |---|---|---|
   *   | 입장료      | 15% | 62% |
   *   | 별도 구매   | 72% | 26% |
   *   | 코스        | 13% | 14% |
   *   | **총수입**  | 5,345만 | **5,266만 (−1.5%)** |
   *
   * 등급 중앙 4 · 퇴장 만족 75→77 · 경보 0 이 유지된다.
   *
   * ⚠ **더 올리면 총수입은 늘지만 판이 나빠진다.** 4,300 은 총수입 +3%(5,513만)인데
   * 등급 중앙이 4→3 · 퇴장 만족 77→74 로 내려갔다. 표값이 만족을 직접 깎지는 않으므로
   * (`priceSatisfaction` 은 `priceMult` 만 본다) 경로는 간접이다 — 현금이 많아지면
   * 봇이 시설을 더 넓게 펴고 걷기 감점이 는다. 원인을 끝까지 파진 않았다.
   * 여기서 고른 기준은 **총수입 보존**이고, 그 지점이 마침 등급·만족이 가장 나은
   * 지점이기도 했다.
   *
   * 명목가 ₩38,000 은 가평 빠지의 실제 이용권(성인 ₩25,000~40,000, 물놀이 시설 포함)
   * 대역 안이다 — 눈금을 맞추면 값이 현실과도 맞는 드문 경우라 여기 적어 둔다.
   *
   * ⚠ 요금 슬라이더(`priceMult`)의 힘은 **안 변한다.** 슬라이더는 입장료와 시설 요금에
   * **똑같이** 곱해지므로 (`week.ts` 의 `admIn`·`collectFees`), 둘 사이 비중이 어떻게
   * 바뀌어도 총수입 대 슬라이더의 기울기는 그대로다. 반면 **입장료를 빼고 곱하는 것들**
   * (매점직원 `foodMult` · 카드 `revenueMult` · 콤보 `revenueMult`)은 곱해지는 밑동이
   * 작아져 약해진다 — 그건 의도다. "콤보를 맞추면 공원 안 소비가 는다"는 효과이고,
   * 공원 안 소비(매점)가 실제로 수입의 일부가 된 것이 이 변경의 요점이다.
   */
  admissionFee: 3_800,
  requireTicket: true,
};

/**
 * 매표소를 안 거치는 튜너블 — **대조군과 구세계 전용**.
 *
 * 두 군데서 쓴다:
 *   ① 음성 대조군 — "경유를 끄면 매표소 없이 들어온다"를 보여야 새 규칙이 실제로
 *      무언가를 막는다는 게 증명된다
 *   ② 도시 띠가 없는 작은 세계 — 단위 검사들이 재는 것은 길찾기·슬롯·만족도이지
 *      입장 수속이 아니다. 거기에 매표소를 하나 끼워 넣으면 공급·콤보·위험도가 같이
 *      움직여 **재던 것이 달라진다**
 *
 * 입장 수속 자체는 골든 시나리오(96×72 · 매표소 포함)와 아래 전용 검사, 헤드리스 봇,
 * 브라우저 하네스가 켠 채로 돈다.
 */
export const OPEN_GATE_DEFAULTS: GuestTunables = { ...GUEST_DEFAULTS, requireTicket: false };

/** 이보다 스릴 선호가 낮은 손님은 코스를 원하지 않는다 (design.md §10.3의 0.35 문턱). */
export const COURSE_INTEREST_MIN = 0.35;

/**
 * 매표소의 시설 ID — 이건 **게이트**지 놀거리가 아니다.
 *
 * 그래서 `pickTarget`(놀러 갈 곳 고르기)에서 빼고, 입장 수속 전용 목적지로만 쓴다.
 * 빼지 않으면 방금 표를 산 손님이 곧바로 매표소를 "운영 수요"로 다시 이용한다.
 */
export const TICKET_DEF_ID = 'ticket';

export interface GuestStats {
  alive: number;
  /** 아직 공원 밖 — 정류장에서 매표소로 걸어오는 중 */
  arriving: number;
  /** 유형별 현재 인원 — 결산에서 "누가 왔나"를 보여준다 */
  byGroup: Record<GroupId, number>;
  walking: number;
  using: number;
  leaving: number;
  /** 퇴장한 손님 수 */
  exited: number;
  /** 퇴장 만족도 평균 (없으면 0) */
  exitSatisfaction: number;
  /** 목적지를 못 찾아 나간 손님 수 */
  gaveUp: number;
  /** 매표소를 못 지나 돌아간 손님 수 (누적) */
  noTicket: number;
}

interface SlotClaim {
  /** 슬롯별 점유 손님 id (0 = 빈 슬롯) */
  slots: number[];
}

export class GuestStore {
  private readonly guests: Guest[] = [];
  private nextId = 1;
  private readonly fields = new Map<number, FlowField>();
  private gateField: FlowField | null = null;

  private readonly claims = new Map<number, SlotClaim>();
  private dirty = true;

  /** 이번 주에 서는 시설을 알린다 (직원 부족·고장). 매주 갱신한다 */
  setIdle(handles: ReadonlySet<number>): void {
    this.idle = new Set(handles);
  }

  get idleCount(): number {
    return this.idle.size;
  }

  /** 현재 동시 손님 상한 — 튜너블의 기본값에서 시작해 등급이 올린다 */
  private limit: number;

  private exited = 0;
  private satSum = 0;
  private gaveUp = 0;
  /**
   * 이용을 마친 손님의 **지갑 배율 합**. 요금은 이 합에 평균 요금을 곱해 받는다 —
   * 인원수만 세면 친구·단체가 더 쓴다는 설정이 매출에 안 나타난다.
   */
  private finishedWallet = 0;
  private finishedCount = 0;
  /**
   * 완료된 이용의 **실제 요금 합** — 수요 종류별로 나눠 담는다.
   *
   * ⚠ 예전에는 러너가 "전체 시설의 평균 요금 × 완료 수"로 계산했다. 그러면 **닫힌 시설도
   * 평균에 들어가고**, 싼 시설이 닫히면 평균이 올라 매출이 **늘어난다** (실측: 사고로
   * 구명함이 닫혔는데 매출이 43.9만 → 46.7만). 종류별로 나누는 이유는 날씨 보정이
   * 종류 단위이기 때문이다.
   */
  private finishedFeeByNeed = new Map<string, number>();
  /** Phase 3 실제 agent가 시설 슬롯에서 고른 구매. 주 리포트가 가져간다. */
  private menuPurchases: MenuPurchase[] = [];
  private admittedRegularCount = 0;
  private menuStore: MenuStore | null = null;
  private regularQueue: RegularVisit[] = [];
  private purchaseWeek = 0;
  /**
   * 수영 구역 이용 **누계** — 밸런싱 계측 전용이다 (`tools/kairo-sim.ts`).
   *
   * ⚠ 이 둘은 판정에도 세이브에도 안 쓴다. `finishedFeeByNeed` 의 `play` 는 놀이 시설과
   * 구역이 **섞여** 있어서, 체류 시간을 바꿨을 때 "구역의 회전이 얼마나 줄었나"를
   * 따로 볼 수가 없다 — 그걸 보려고 둔 계수기다. 요금은 지갑 배율까지만 곱한
   * **총액**이다 (날씨·요금 배율은 `week.ts` 소관이라 여기선 모른다).
   */
  private zoneUseCount = 0;
  private zoneFeeSum = 0;
  /** 밸런싱 계측 — 수영 구역 이용 완료 누계 */
  get zoneUses(): number {
    return this.zoneUseCount;
  }
  /** 밸런싱 계측 — 수영 구역 요금 누계 (지갑 배율까지, 날씨·요금 배율 전) */
  get zoneFeeGross(): number {
    return this.zoneFeeSum;
  }

  /**
   * 수영 구역 1회 요금 — **0 이다. 수영이야말로 입장권의 본체다** (P6).
   *
   * 물놀이 값을 표에 담아 놓고 정작 물에서 또 받으면 분류가 뒤집힌 것이다.
   *
   * ⚠ `swim.ts` 의 `zoneFee`(pool 800 · river 500)는 **정가**로 남겨 둔다 — 지우면
   * 대조군이 "예전에 얼마였나"를 되살릴 수 없다. 대조군 스위치는 시설과 **같은 것**을
   * 쓴다 (`placement.chargeFaultForTest`): 분류 스위치가 둘이면 한쪽만 켠 채 재게 된다.
   */
  private zoneCharge(idx: number): number {
    return this.placement.chargeFaultForTest === null ? 0 : zoneFee(this.zones[idx]);
  }
  /**
   * **입장한** 손님 누계 — 주간 결산의 `visitors` 가 이걸 센다 (K36-B②).
   *
   * ⚠ 예전에는 `spawn` 이 성공한 수를 입장으로 셌다. 매표소를 거치게 된 뒤로 그 둘은
   * 다른 값이다 — 정류장에 내린 것과 표를 사고 들어온 것은 같지 않다. 결산의 "입장"이
   * 전자를 가리키면, 매표소가 없는 판이 "입장 129명 · 매출 0" 으로 보인다.
   */
  private admittedCount = 0;
  private admittedByGroup: Record<GroupId, number> = {
    family: 0,
    couple: 0,
    friends: 0,
    company: 0,
  };
  /** 이번 구간 입장객 중 코스를 실제로 원하는 사람 수. 저장하지 않는 주간 파생값이다. */
  private admittedCourseDemand = 0;
  /** 걷힌 입장료 합 (요금 배율 전). 배율은 `week.ts` 가 곱한다 — 요금 정책은 거기 산다 */
  private admissionSum = 0;
  /** 매표소를 못 지나 돌아간 손님 (누적) */
  private noTicketCount = 0;
  /**
   * 아직 다 들어오지 않은 일행. 도착 1건마다 한 명씩 들어온다.
   *
   * ⚠ 일행 전체를 한 번에 넣으면 도착률 계산이 무너진다 — 주간 도착 수는 누적기가
   * 정하는데 한 번에 5명이 들어오면 그 주 입장이 5배가 된다. 한 명씩 넣되 **연속으로**
   * 넣어서, 같은 일행이 몇 tick 안에 줄줄이 들어오게 한다.
   */
  private pending: {
    def: GroupDef;
    remaining: number;
    party: number;
    regular?: RegularVisit;
  } | null = null;
  private nextParty = 1;
  /**
   * 이번 주에 **선** 시설 (운영요원 부족·고장). 목적지에서 뺀다.
   *
   * 거리장 자체를 지우지 않는 이유: 다음 주에 다시 돌면 그대로 써야 하는데, 지우면
   * 매주 1,280칸 거리장을 다시 만들어야 한다.
   */
  private idle = new Set<number>();
  /** 수영 구역 (S2) — 파생 캐시. rebuildFields 가 매번 다시 만든다 (저장 금지 규칙) */
  private zones: SwimZone[] = [];
  /**
   * 나이트풀 저녁 부스트 (S4) — 주 루프가 tick 에서 파생해 설정한다 (결정론:
   * tick 의 함수다). true 면 수영을 마친 손님의 만족 이득이 +5.
   */
  swimBoost = false;
  private zoneLookup = new Map<number, { list: { x: number; y: number }[]; set: Set<number> }>();
  private patience = new Map<number, number>();

  constructor(
    private readonly terrain: KairoTerrain,
    private readonly walls: WallGrid,
    private readonly placement: PlacementGrid,
    private readonly gate: { i: number; j: number },
    readonly tunables: GuestTunables = GUEST_DEFAULTS,
  ) {
    this.limit = tunables.maxGuests;
    this.stop = GuestStore.stopFor(terrain, gate);
  }

  /** 발견 상태는 저장소, 장착은 placement가 정본이다. */
  setMenuStore(store: MenuStore | null): void {
    this.menuStore = store;
  }

  /** WeekRunner도 같은 발견 저장소로 메뉴 시설 운영 가능 여부를 판정한다. */
  hasMenuRecipe(recipeId: string): boolean {
    return this.menuStore?.hasRecipe(recipeId) ?? true;
  }

  /** 주 시작에 번역된 단골 방문 계획. 주간 agent 상태는 저장하지 않는다. */
  scheduleRegularVisits(visits: readonly RegularVisit[], week: number): void {
    this.regularQueue = visits.map((x) => ({
      ...x,
      prefer: [...x.prefer],
      avoid: [...x.avoid],
    }));
    this.purchaseWeek = week;
  }

  /**
   * 손님이 내리는 칸 — **정류장**이다 (K36-B②). 게이트가 아니다.
   *
   * 정류장에서 게이트까지 다섯 칸을 걸어야 "밖에서 안으로 들어온다"가 읽힌다 (K36 이
   * 도시 띠를 8줄로 벌린 이유와 같다). 그 다섯 칸은 플레이어가 못 바꾸므로 걷기 감점도
   * 정원도 여기서는 세지 않는다.
   *
   * ⚠ 도시 띠가 없는 격자에서는 정류장 칸이 격자 밖이거나 잔디다 — 단위 테스트가
   * 쓰는 작은 세계가 그렇다. 그때는 **게이트에서 시작한다.** 조용한 대체가 아니라
   * `stopIsGate` 로 밖에서 확인할 수 있게 남긴다.
   */
  private static stopFor(
    terrain: KairoTerrain,
    gate: { i: number; j: number },
  ): { i: number; j: number } {
    const s = KairoTerrain.busStop();
    return terrain.inside(s.i, s.j) && terrain.isGuestWalkable(s.i, s.j) ? s : gate;
  }

  /** 정류장을 못 찾아 게이트에서 시작하는가 — 검사가 이걸 본다 */
  get stopIsGate(): boolean {
    return this.stop.i === this.gate.i && this.stop.j === this.gate.j;
  }

  /** 손님이 내리는 칸 */
  get busStop(): { i: number; j: number } {
    return this.stop;
  }

  private readonly stop: { i: number; j: number };

  /**
   * 매표소 handle 들 — 거리장을 다시 만들 때 같이 갱신한다.
   *
   * 매 tick `placement.all().find(...)` 로 찾으면 손님×시설 이라 금방 비싸진다.
   */
  private readonly tickets = new Set<number>();

  get all(): readonly Guest[] {
    return this.guests;
  }

  get count(): number {
    return this.guests.length;
  }

  /** 지형·벽·시설이 바뀌면 거리장을 버린다. 다음 tick 에 다시 만든다 */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * 동시 손님 상한을 바꾼다 — 등급이 오르면 올라간다.
   * 상한이 고정이면 시설을 늘려도 입장이 안 늘어 후반 성장이 멈춘다.
   */
  setMaxGuests(n: number): void {
    this.limit = Math.max(1, Math.round(n));
  }

  get maxGuests(): number {
    return this.limit;
  }

  /**
   * 손님이 밟을 수 있는 칸.
   *
   * 시설은 길을 막는다 — 단 플로팅덱·선착장은 밟고 지나간다. K5 까지는 시설을 통째로
   * 뚫고 지나갔고, 그러면 배치가 동선에 영향을 주지 않아 "배치가 결과를 바꾼다"가
   * 성립하지 않는다.
   */
  /**
   * 손님이 설 수 있는 칸 — **정의는 `guestWalkable` 한 곳**에 있다.
   *
   * 여기서 따로 쓰면 건물 문 자리·도달 검사와 갈라진다. 실제로 갈라져 있었고,
   * 시설로 막힌 칸에 문이 뚫렸다 (K25 검토 ②).
   */
  private standable: ((i: number, j: number) => boolean) | null = null;
  private walkable = (i: number, j: number): boolean =>
    (this.standable ??= guestWalkable(this.terrain, this.placement))(i, j);

  /**
   * 두 칸 사이를 지나갈 수 있는가 — **경계 벽**(K25) + **단차**(K37) 판정.
   *
   * 칸 판정(`walkable`)과 따로인 이유: 벽은 칸을 막지 않고 이동을 막는다. 거리장과
   * 걸음 선택이 **둘 다** 이걸 통과해야 손님이 벽을 뚫고 지나가지 않는다.
   *
   * K37: 단차가 2 이상이면 절벽이라 못 넘는다. `FlowField.build` 가 이 함수를 저장해
   * `next()` 도 같은 판정을 쓰므로 여기 한 곳이면 거리장과 걸음이 같이 지켜진다 —
   * 하나만 넣으면 "거리장은 맞는데 손님이 절벽을 타고 오른다"가 된다.
   */
  private readonly canCross = (i: number, j: number, ni: number, nj: number): boolean =>
    !this.walls.blocksMove(i, j, ni, nj) && this.terrain.levelPassable(i, j, ni, nj);

  /**
   * 게이트에서 이 칸까지의 걸음 수. 못 닿으면 −1 (K37 검사용).
   *
   * 단차 규칙(`canCross`)이 **거리장에** 실제로 반영됐는지 재려면 거리장을 읽어야 한다.
   * 손님을 굴려서 재면 "아직 안 갔다"와 "못 간다"가 구분되지 않는다 — 그 둘이 섞이면
   * 이 페이즈에서 가장 중요한 검사(테라스가 닿나)가 조용히 통과한다.
   */
  gateDistanceForTest(i: number, j: number): number {
    if (this.dirty) this.rebuildFields();
    const f = this.gateField;
    if (!f) return -1;
    return f.reachable(i, j) ? f.distAt(i, j) : -1;
  }

  /**
   * 이 시설의 거리장에서 (i,j) 까지의 걸음 수. 못 닿으면 −1 (K52 검사용).
   *
   * 위 `gateDistanceForTest` 와 같은 이유로 **거리장을 읽는다**: 목적지를 앞 두 면으로
   * 좁히면서 "놓을 수 있었으면 반드시 갈 수 있다"가 깨지지 않았는지를 재려면
   * "아직 안 갔다"와 "못 간다"를 구분해야 한다. 손님을 굴려서 재면 둘이 섞인다.
   */
  facilityDistanceForTest(handle: number, i: number, j: number): number {
    if (this.dirty) this.rebuildFields();
    const f = this.fields.get(handle);
    if (!f) return -1;
    return f.reachable(i, j) ? f.distAt(i, j) : -1;
  }

  /**
   * 이 시설의 손님 슬롯 수 (P1.5 검사용).
   *
   * ⚠ 특화가 **실제로 손님 쪽에 도착했는지**를 재려면 점유표를 봐야 한다. `capacityOf`
   * 끼리 비교하면 상수 산수라 `slotsOf` 가 `def.capacity` 를 그대로 읽어도 통과한다
   * (K38 "깊이는 화면에 올라간 오브젝트에서 읽는다"와 같은 종류의 함정).
   */
  slotCountForTest(handle: number): number {
    return this.slotsOf(handle)?.slots.length ?? -1;
  }

  /**
   * 거리장 재구축. 시설마다 **손님이 들어가는 칸**을 목적지로 둔다 — 발자국 자체는
   * 시설이 점유해 못 걷는다. K52 부터 그 칸은 4이웃 전부가 아니라 **앞 두 면**이다
   * (`PlacementGrid.entryTilesOf`) — 자세한 이유는 아래 루프의 주석.
   */
  private rebuildFields(): void {
    this.fields.clear();
    this.tickets.clear();
    const w = this.terrain.width;
    const h = this.terrain.height;

    /*
     * ⚠ 게이트 거리장을 **시설 루프보다 먼저** 만든다 (K52). 순서만 바뀐 것이고 값은
     * 그대로다 — 아래 앞칸 후보를 "게이트에서 닿는가"로 걸러야 하는데, 그 판정의 정본이
     * 이 거리장이기 때문이다. 뒤에 두면 `this.gateField` 가 아직 지난 tick 것이거나 null 이다.
     */
    this.gateField = new FlowField(w, h);
    this.gateField.build(this.walkable, [[this.gate.i, this.gate.j]], this.canCross);
    const gate = this.gateField;

    /** 오늘까지의 목적지 집합 — 발자국 **4이웃** 중 설 수 있는 칸 전부 (면 구분 없음) */
    const allNeighbors = (def: KairoFacilityDef, item: PlacedFacility): [number, number][] => {
      const out: [number, number][] = [];
      for (const [ti, tj] of PlacementGrid.footprintTiles(def, item.i, item.j, item.facing ?? 0)) {
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const ni = ti + di;
          const nj = tj + dj;
          if (!this.walkable(ni, nj)) continue;
          // ⚠ "점유된 칸"을 전부 빼면 **덱 위가 목적지가 되지 못한다** — 덱은 시설이면서
          //   밟을 수 있는 칸이다. 물 위 시설로 가는 유일한 길이 덱이므로 walkable 판정만 쓴다.
          out.push([ni, nj]);
        }
      }
      return out;
    };

    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId);
      if (!def) continue;

      /*
       * 목적지를 **앞 두 면**으로 좁힌다 (K52). `dist === 0` 이 곧 도착이므로, 목적지가
       * 4이웃 전부면 손님이 건물 **뒷면**으로 들어간다 — 면·방향 구분이 아예 없었다.
       *
       * ⚠ **`walkOn` 2종(플로팅덱·선착장)은 제외한다.** 발자국 자체가 길이라 "앞으로
       * 들어간다"는 말이 성립하지 않는다 — 좁히면 덱을 옆에서 밟고 지나가는 동선이 끊긴다.
       *
       * ⚠ **게이트 도달성으로 거르는 것이 필수다.** `walkable` 만 보면 "설 수는 있으나
       * 게이트에서 못 닿는 앞칸"이 유일한 목적지로 남아 거리장이 통째로 `UNREACHABLE` 이
       * 되고 **이미 지어진 시설이 즉사한다**.
       *
       * ⚠ 그리고 앞칸이 하나도 안 남으면 **오늘의 집합으로 되돌아간다**. 이 폴백이
       * 정확히 옳은 이유: 배치 검사 `unreachable`(`placement.ts`)이 "발자국 4이웃 중
       * 하나라도 게이트에서 `guestWalkable` 로 닿으면 ok" 인데, 폴백이 **그 집합 전체**다
       * ⇒ **"놓을 수 있었으면 반드시 갈 수 있다"가 항등적으로 보존**된다. 그래서
       * `check()` 를 한 줄도 안 고쳤다 — 앞면을 요구하도록 조이면 기존 판에 이미 지어진
       * 시설이 소급으로 불법이 된다.
       *
       * ⚠ **폴백은 죽은 가지가 아니다 — 새 판마다 탄다.** 실측(시작 킷, K52-④):
       * bukhan 7채 중 **3** · valley 5채 중 **2** · lake 6채 중 **3** 이 폴백으로 간다
       * (앞칸이 아직 포장이 아니어서다). "안 타는 가지"로 보고 지우면 첫 주부터
       * 시작 킷 절반이 손님을 못 받는다 — `entry.test.ts` 가 그 존재를 고정한다.
       */
      let targets: [number, number][] = [];
      if (!def.walkOn) {
        for (const [ni, nj] of PlacementGrid.entryTilesOf(def, item.i, item.j, item.facing ?? 0)) {
          if (!this.walkable(ni, nj)) continue;
          if (!gate.reachable(ni, nj)) continue;
          targets.push([ni, nj]);
        }
      }
      if (targets.length === 0) targets = allNeighbors(def, item);

      if (targets.length === 0) continue;
      const f = new FlowField(w, h);
      f.build(this.walkable, targets, this.canCross);
      this.fields.set(item.handle, f);
      if (item.defId === TICKET_DEF_ID) this.tickets.add(item.handle);
    }

    /*
     * 수영 구역 (S2) — 구역은 저장이 아니라 파생이다. 입수점(구역 밖의 설 수 있는 칸)이
     * 거리장의 목적지가 된다. 입수점 없는 구역은 목적지가 아니다 (no-entry).
     * 구역 모양이 바뀌면 슬롯 정원이 달라지므로 구역 슬롯은 통째로 다시 센다 —
     * 헤엄치던 손님은 slots[usingSlot] 검사가 조용히 실패해 그냥 마저 헤엄친다.
     */
    for (const h2 of [...this.claims.keys()]) if (h2 >= ZONE_HANDLE_BASE) this.claims.delete(h2);
    this.zones = [
      ...poolZones(this.terrain, this.walkable),
      ...riverZones(this.terrain, this.placement.waterBarrierKeys(), this.walkable),
    ];
    this.zoneLookup.clear();
    for (let k = 0; k < this.zones.length; k++) {
      const z = this.zones[k] as SwimZone;
      if (z.entries.length === 0) continue;
      const f = new FlowField(w, h);
      f.build(
        this.walkable,
        z.entries.map((e) => [e.x, e.y] as [number, number]),
        this.canCross,
      );
      this.fields.set(zoneHandle(k), f);
      this.zoneLookup.set(zoneHandle(k), {
        list: z.tiles,
        set: new Set(z.tiles.map((t) => (t.y << 10) | t.x)),
      });
    }
    this.dirty = false;

    // 없어진 시설·구역의 슬롯 점유를 정리한다
    const live = new Set([...this.placement.all().map((f) => f.handle), ...this.zoneLookup.keys()]);
    for (const handle of [...this.claims.keys()]) {
      if (!live.has(handle)) this.claims.delete(handle);
    }
    for (const g of this.guests) {
      if (g.usingHandle !== 0 && !live.has(g.usingHandle)) this.releaseSlot(g);
    }
  }

  private slotsOf(handle: number): SlotClaim | null {
    if (handle >= ZONE_HANDLE_BASE) {
      const z = this.zones[handle - ZONE_HANDLE_BASE];
      if (!z) return null;
      let zc = this.claims.get(handle);
      if (!zc) {
        zc = { slots: new Array<number>(zoneCapacity(z)).fill(0) };
        this.claims.set(handle, zc);
      }
      return zc;
    }
    const item = this.placement.all().find((f) => f.handle === handle);
    if (!item) return null;
    const def = facilityDef(item.defId);
    if (!def) return null;
    /*
     * ⚠ 정원은 `def.capacity` 가 아니라 **`placement.capacityOf`** 다 (P1.5) —
     * 회전 특화가 +1 을 얹는다. def 를 직접 읽으면 특화가 화면에는 뜨는데
     * 손님은 여전히 원래 인원만 들어간다.
     */
    const want = this.placement.capacityOf(handle);
    let c = this.claims.get(handle);
    if (!c) {
      c = { slots: new Array<number>(want).fill(0) };
      this.claims.set(handle, c);
    } else if (c.slots.length < want) {
      /*
       * 점유표는 캐시라 한 번 만들면 남는다. 특화를 **주 도중에** 고르면 정원만
       * 늘고 슬롯은 옛 길이로 남는다 — 늘려만 준다. 줄이면 높은 번호 슬롯을 쓰던
       * 손님이 영영 해제되지 않는다.
       */
      while (c.slots.length < want) c.slots.push(0);
    }
    return c;
  }

  private claimSlot(g: Guest, handle: number): boolean {
    const c = this.slotsOf(handle);
    if (!c) return false;
    const idx = c.slots.indexOf(0);
    if (idx < 0) return false;
    c.slots[idx] = g.id;
    g.usingHandle = handle;
    g.usingSlot = idx;
    return true;
  }

  private releaseSlot(g: Guest): void {
    const c = this.claims.get(g.usingHandle);
    if (c && c.slots[g.usingSlot] === g.id) c.slots[g.usingSlot] = 0;
    g.usingHandle = 0;
    g.usingSlot = -1;
    g.menuId = null;
  }

  /**
   * 이용을 **시작한다** — 손님을 `to` 칸으로 옮기고 나올 때 돌아갈 기준 칸(`back`)을 적는다.
   *
   * ## 왜 함수 하나인가
   *
   * 들어가는 길이 셋(수영·탑승·슬롯)인데 **나오는 길은 수영에만** 있었다. 그래서 슬라이드를
   * 탄 손님이 출구(발자국 안 = 못 걷는 칸)에 남아 거리장이 `UNREACHABLE` 이 되고,
   * "길이 막혔다" 분기에서 `STUCK_LIMIT`(200) × `ticksPerStep`(4) = **800 tick 을 얼어
   * 있다가** 나갔다. 같은 복원 코드를 세 벌 쓰면 언젠가 또 한 벌만 고쳐진다 —
   * 이 저장소가 반복해 겪은 실패다 (`guestWalkable`·`capacityOf`·`admissionLimit`).
   *
   * ⚠ `to === 현재 칸` 은 **정상 경로**다 (매표소·슬롯 없는 시설). "제자리에 선다"를
   * 분기로 빼지 않는 이유는, 그러면 `back` 을 안 적는 경로가 생겨 다음 `leaveFacility`
   * 가 지난 이용의 기준 칸으로 손님을 보내기 때문이다.
   */
  private enterFacility(
    g: Guest,
    to: readonly [number, number],
    back: readonly [number, number],
    pose: GuestPose,
    facing?: Guest['facing'],
  ): void {
    g.rideFrom = [back[0], back[1]];
    g.fromI = g.i;
    g.fromJ = g.j;
    g.i = to[0];
    g.j = to[1];
    g.progress = 0;
    g.pose = pose;
    if (facing) g.facing = facing;
  }

  /**
   * 이용을 **마친다** — 손님을 걸을 수 있는 칸으로 되돌린다. 순서가 곧 이유다:
   *
   *   1. `rideFrom` 이 설 수 있으면 그 칸 — 수영의 입수점, 슬롯 앞에 서 있던 칸
   *   2. `rideFrom` 의 걸을 수 있는 이웃 — 슬라이드 입구는 발자국 **안**이라 못 선다.
   *      타러 왔던 그 칸이다 (`entryTilesOf` 가 목적지로 삼는 집합과 같은 이웃들)
   *   3. **지금 칸**의 걸을 수 있는 이웃 — 이용 중에 누가 입구 앞을 막았다
   *   4. 아무 데도 없으면 제자리 — "길이 막혔다" 안전 밸브가 정리한다
   *
   * ⚠ **`guestWalkable` 을 건드리지 않는다.** 슬롯 칸은 여전히 못 걷는 칸이고 손님은 그
   * 위에 **서 있을 뿐**이다 — 통행 판정이 안 바뀌므로 이 복원이 있어야 한다.
   *
   * @param usedHandle 방금 이용한 것. **고장 스위치 전용**이다 — 켜면 구역(수영)에만
   *   복원이 있던 **E① 이전의 세계**를 정확히 재현하므로, 밸런스 Δ 가 이 수정의 몫임을
   *   같은 실행 파일에서 대조할 수 있다 (`git stash` 없이).
   */
  private leaveFacility(g: Guest, usedHandle: number): void {
    const back = g.rideFrom;
    if (slotRestoreFault) {
      /*
       * 예전 세계를 **비트 단위로** 재현한다: 구역에만 복원이 있었고, 그것도 입수점이
       * 지금 설 수 있는 칸인지 **안 보고** 세웠다 (이용 중에 그 칸에 시설이 서면 손님이
       * 못 걷는 칸에 올라갔다). 여기서 그 조건을 살려 두면 대조군이 "예전"이 아니라
       * 제3의 세계가 되어 밸런스 Δ 가 두 변경의 합이 된다.
       */
      if (usedHandle < ZONE_HANDLE_BASE) return;
      g.fromI = g.i;
      g.fromJ = g.j;
      g.i = back[0];
      g.j = back[1];
      g.progress = 0;
      return;
    }
    const to = this.walkable(back[0], back[1])
      ? ([back[0], back[1]] as [number, number])
      : (this.standNear(back, g) ?? this.standNear([g.i, g.j], g));
    if (!to || (to[0] === g.i && to[1] === g.j)) return;
    g.fromI = g.i;
    g.fromJ = g.j;
    g.i = to[0];
    g.j = to[1];
    g.progress = 0;
  }

  /** `at` 의 4이웃 중 손님이 설 수 있는 칸 — 손님에게 가장 가까운 것. 없으면 null */
  private standNear(at: readonly [number, number], g: Guest): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const [di, dj] of STEP4) {
      const ni = at[0] + di;
      const nj = at[1] + dj;
      if (!this.walkable(ni, nj)) continue;
      const d = Math.abs(ni - g.i) + Math.abs(nj - g.j);
      if (d < bestD) {
        bestD = d;
        best = [ni, nj];
      }
    }
    return best;
  }

  /**
   * 다음에 갈 시설. **아직 안 채운 수요를 우선**하고, 그 안에서 가까운 셋 중 하나를 뽑는다.
   *
   * 거리만 보면 가까운 시설이 빨리 비는 순간 먼 시설을 아무도 안 간다 (실측). 그러면
   * "무엇을 짓나"가 사라지고 "게이트에 붙이나"만 남는다. 수요를 우선하면 손님이 먹고 →
   * 놀고 → 쉬는 식으로 돌아 시설 종류 구성이 의미를 갖는다.
   *
   * 가까운 셋 중 무작위로 뽑는 이유: 전부 최단거리로 몰리면 한 시설에만 줄이 서고
   * 나머지가 빈다.
   */
  private pickTarget(g: Guest, rng: Rng): number | null {
    const all: { handle: number; dist: number; need: string; requested: boolean }[] = [];
    for (const [handle, field] of this.fields) {
      if (this.idle.has(handle)) continue; // 선 시설엔 안 간다
      if (this.tickets.has(handle)) continue; // 매표소는 게이트다 — 놀러 가는 곳이 아니다
      const c = this.slotsOf(handle);
      if (!c || c.slots.every((s) => s !== 0)) continue;
      const d = field.distAt(g.i, g.j);
      if (d < 0) continue;
      const item =
        handle >= ZONE_HANDLE_BASE ? undefined : this.placement.all().find((f) => f.handle === handle);
      const def = item ? facilityDef(item.defId) : undefined;
      const menu = item
        ? this.placement.menuOperabilityOf(handle, (id) => this.hasMenuRecipe(id))
        : { operable: true, menuIds: [] };
      // 개발형 시설의 빈/잘못된/미발견 메뉴는 목적지가 아니다.
      if (!menu.operable) continue;
      // 수영 구역의 수요 축은 play 다 (스펙 v1.1 — 'fun' 은 없는 축이었다)
      const need =
        handle >= ZONE_HANDLE_BASE
          ? 'play'
          : item
            ? (def?.need ?? '')
            : '';
      all.push({
        handle,
        dist: d,
        need,
        requested:
          g.requestedRecipeId !== undefined && menu.menuIds.includes(g.requestedRecipeId),
      });
    }
    if (all.length === 0) return null;

    const requested = all.filter((c) => c.requested);
    const base = requested.length > 0 ? requested : all;
    const fresh = base.filter((c) => c.need !== '' && !g.usedNeeds.includes(c.need));
    const pool = fresh.length > 0 ? fresh : base;
    /*
     * 거리에 **유형별 수요 편향**을 곱한다 (§10.4). 1.0 미만이면 "멀어도 간다" —
     * 가족은 놀이·위생을, 친구는 스릴을 찾아간다. 그래서 시설 구성이 손님 구성을 통해
     * 매출로 이어진다: 스릴만 지으면 가족이 심심하고, 경관만 지으면 친구가 심심하다.
     */
    const gdef = groupDef(g.group);
    for (const c of pool) c.dist *= needWeight(gdef, c.need);
    pool.sort((a, b) => a.dist - b.dist || a.handle - b.handle);
    const top = pool.slice(0, Math.min(3, pool.length));
    return (top[rng.int(top.length)] as { handle: number }).handle;
  }

  /**
   * 이 칸에서 **닿는** 매표소 중 가장 가까운 것. 하나도 못 닿으면 null.
   *
   * 슬롯을 안 본다 — 매표소는 줄을 세우는 곳이 아니라 지나가는 곳이다. 슬롯을 잡게 하면
   * 정류장에서 걸어오는 내내 슬롯이 묶여, 정원 2인 매표소 하나가 **하루 5명**으로
   * 입장을 조인다 (계산: 걸어오는 40~70 tick 동안 점유). 그건 이 변경의 의도가 아니다.
   *
   * 거리는 **손님이 선 칸** 기준이다. 정류장에서 공원으로 들어오는 길이 입구 한 열뿐이라
   * (K36) 여기서 닿는다는 것은 게이트를 지나 닿는다는 뜻과 같다.
   */
  private pickTicket(i: number, j: number): number | null {
    let bestHandle: number | null = null;
    let bestDist = Infinity;
    for (const handle of this.tickets) {
      const field = this.fields.get(handle);
      if (!field) continue;
      const d = field.distAt(i, j);
      if (d < 0) continue;
      // handle 로 동점을 가른다 — 결정론 (불변식 2)
      if (d < bestDist || (d === bestDist && bestHandle !== null && handle < bestHandle)) {
        bestDist = d;
        bestHandle = handle;
      }
    }
    return bestHandle;
  }

  /**
   * 공원 **안**에 있는 손님 수. 정원(`maxGuests`)은 이 값을 본다.
   *
   * 정류장에서 걸어오는 손님까지 세면, 플레이어가 못 바꾸는 다섯 칸이 정원을 깎는다.
   */
  private insideCount(): number {
    return this.inside;
  }

  /**
   * 공원 **안** 인원 (공개) — 정원 판정과 **위험도 노출**(K47-③)이 같은 값을 봐야 한다.
   *
   * ⚠ `count` 와 다르다: `count` 는 정류장에서 걸어오는 `'arriving'` 까지 센다.
   * 노출을 `count` 로 재면 **아직 입장도 안 한 사람이 위험을 올린다** — 플레이어가
   * 못 바꾸는 다섯 칸(정류장→매표소)이 위험도를 밀어 올리는 셈이라 처방이 없다.
   */
  get inside(): number {
    let n = 0;
    for (const g of this.guests) if (g.state !== 'arriving') n++;
    return n;
  }

  /** 입장 확정 — 여기서만 `visitors` 가 는다 */
  private admit(g: Guest, fee: number): void {
    this.admittedCount++;
    this.admittedByGroup[g.group] += 1;
    if (g.thrill >= COURSE_INTEREST_MIN) this.admittedCourseDemand++;
    this.admissionSum += fee;
    if (g.characterId) this.admittedRegularCount += 1;
    g.state = 'walking';
    g.pose = 'walk';
  }

  /**
   * 입장하지 못하고 돌아간다.
   *
   * ⚠ **퇴장 집계(`exited`·`satSum`)에 넣지 않는다.** 들어온 적 없는 손님의 만족도를
   * 평판에 섞으면 "매표소가 없다"가 "손님이 불만이다"로 번역되어 원인이 흐려진다 —
   * 평판의 기반은 **퇴장** 만족도라는 결정과도 어긋난다.
   */
  private turnBack(g: Guest): void {
    this.releaseSlot(g);
    this.noTicketCount++;
    this.noTicketTaken++;
    g.state = 'gone';
  }

  /**
   * 손님 한 명 입장. 게이트가 못 걷는 칸이면 실패.
   *
   * 일행 단위로 들어온다 — 대기 중인 일행이 없으면 계절 비중으로 새 일행을 뽑는다.
   * 계절을 안 주면 여름으로 본다 (기존 호출자 호환).
   */
  spawn(
    rng: GuestRngSource,
    season: Season = 'summer',
    /** 맵이 바꾼 유형 비중 (§4.5). 없으면 계절 기본값 */
    shares?: Partial<Record<GroupId, number>>,
  ): Guest | null {
    if (this.insideCount() >= this.limit) return null;
    if (!this.walkable(this.stop.i, this.stop.j)) return null;
    if (this.dirty) this.rebuildFields();
    const streams = guestRngStreams(rng);
    if (!this.pending || this.pending.remaining <= 0) {
      const regular = this.regularQueue.shift();
      const def = regular ? groupDef(regular.group) : pickGroup(streams.general, season, shares);
      this.pending = {
        def,
        remaining: regular ? 1 : groupSize(streams.general, def),
        party: this.nextParty++,
        ...(regular ? { regular } : {}),
      };
    }
    const party = this.pending;
    party.remaining -= 1;
    const def = party.def;
    const guestRng = party.regular ? streams.regular : streams.general;
    const g: Guest = {
      id: this.nextId++,
      group: def.id,
      party: party.party,
      wallet: def.wallet,
      thrill: def.thrill[0] + guestRng.next() * (def.thrill[1] - def.thrill[0]),
      ...(party.regular
        ? {
            characterId: party.regular.characterId,
            requestedRecipeId: party.regular.requestedRecipeId,
            regularPrefer: [...party.regular.prefer],
            regularAvoid: [...party.regular.avoid],
          }
        : {}),
      i: this.stop.i,
      j: this.stop.j,
      fromI: this.stop.i,
      fromJ: this.stop.j,
      progress: 1,
      // 정류장에 내린 상태 — 매표소를 지나야 손님이 된다 (K36-B②)
      state: this.tunables.requireTicket ? 'arriving' : 'walking',
      pose: 'walk',
      facing: '+Z',
      palette: guestRng.int(8),
      face: 'calm',
      emote: null,
      emoteTicks: 0,
      usingHandle: 0,
      usingSlot: -1,
      menuId: null,
      admitting: false,
      useTicks: 0,
      satisfaction: this.tunables.startSatisfaction,
      used: 0,
      stepAcc: 0,
      stuckTicks: 0,
      usedNeeds: [],
      rideTicks: 0,
      rideTotal: 0,
      rideFrom: [0, 0],
      rideTo: [0, 0],
    };
    this.guests.push(g);
    // 경유를 끈 판(대조군·구형 하네스)은 그 자리에서 입장이다. 입장료는 안 받는다
    if (!this.tunables.requireTicket) this.admit(g, 0);
    return g;
  }

  private setEmote(g: Guest, e: GuestEmote): void {
    g.emote = e;
    g.emoteTicks = this.tunables.emoteTicks;
  }

  /** 만족도에서 표정을 파생한다 — 표정을 따로 관리하면 두 값이 어긋난다 */
  private syncFace(g: Guest): void {
    g.face = g.satisfaction >= 75 ? 'happy' : g.satisfaction >= 45 ? 'calm' : g.satisfaction >= 25 ? 'tired' : 'annoyed';
  }

  /** 한 tick. `rng` 는 이 tick 전용 스트림이어야 결정론이 유지된다 */
  tick(rng: GuestRngSource): void {
    if (this.dirty) this.rebuildFields();

    const streams = guestRngStreams(rng);

    for (const g of this.guests) {
      const guestRng = g.characterId ? streams.regular : streams.general;
      if (g.emoteTicks > 0 && --g.emoteTicks === 0) g.emote = null;

      if (g.state === 'using') {
        // 유영 (S2) — 구역 손님은 4 tick 에 한 칸씩 구역 안 이웃 물로 떠다닌다.
        // 물 칸엔 거리장이 없어 flow field 를 못 탄다 — 그래서 이웃을 직접 뽑고,
        // 나올 때는 기억해 둔 입수점으로 되돌린다 (아래 '뭍으로')
        if (g.usingHandle >= ZONE_HANDLE_BASE && g.useTicks > 1 && (g.useTicks & 3) === 0) {
          const z = this.zoneLookup.get(g.usingHandle);
          if (z) {
            const opts: [number, number][] = [];
            for (const [di, dj] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const ni = g.i + di;
              const nj = g.j + dj;
              if (z.set.has((nj << 10) | ni)) opts.push([ni, nj]);
            }
            if (opts.length > 0) {
              const [ni, nj] = opts[guestRng.int(opts.length)] as [number, number];
              g.fromI = g.i;
              g.fromJ = g.j;
              g.i = ni;
              g.j = nj;
              g.progress = 0;
              g.facing = nj >= g.fromJ ? '+Z' : '-Z';
            }
          }
        }
        // 슬라이드 탑승 — 입구에서 출구로 실제로 이동한다. 서 있기만 하면
        // "미끄럼틀 로직이 자연스럽다"가 성립하지 않는다 (사용자 요구)
        if (g.rideTicks > 0) {
          g.rideTicks--;
          const p = 1 - g.rideTicks / Math.max(1, g.rideTotal);
          const ni = Math.round(g.rideFrom[0] + (g.rideTo[0] - g.rideFrom[0]) * p);
          const nj = Math.round(g.rideFrom[1] + (g.rideTo[1] - g.rideFrom[1]) * p);
          if (ni !== g.i || nj !== g.j) {
            g.fromI = g.i;
            g.fromJ = g.j;
            g.i = ni;
            g.j = nj;
            g.progress = 0;
          }
          if (g.rideTicks > 0) continue;
          // 도착 — 출구에 선다
          g.useTicks = 1;
        }
        if (--g.useTicks <= 0) {
          g.rideTotal = 0;
          /*
           * ⚠ **`releaseSlot` 이 `usingHandle` 을 0 으로 지운다.** 그 뒤에 읽으면 항상
           * 0 이고, `find` 는 undefined 를 돌려준다 — 그래서 아래 "채운 수요 기록"이
           * K9 에서 넣은 뒤로 **한 번도 동작하지 않았다.** `usedNeeds` 가 늘 비어 있어
           * 손님이 같은 종류를 반복해 이용했다. 지우기 전에 잡는다.
           */
          const usedHandle = g.usingHandle;
          const usedMenuId = g.menuId;
          this.releaseSlot(g);
          /*
           * 밖으로 — 수영은 뭍으로, 슬라이드는 출구에서 타러 왔던 칸으로, 앉은 손님은
           * 슬롯 칸에서 앞칸으로. **셋이 한 함수를 지난다** (E①: 예전엔 수영 분기 안에만
           * 있어서 탑승·슬롯이 못 걷는 칸에 남아 800 tick 얼었다).
           */
          this.leaveFacility(g, usedHandle);
          if (g.admitting) {
            /*
             * 입장 수속이 끝났다 — **표는 놀이가 아니다.** `used`(→`wantUses`)도,
             * `usedNeeds` 도, 시설 요금(`finishedFeeByNeed`)도 건드리지 않는다.
             * 표를 이용 1회로 세면 손님이 시설 셋만 쓰고 나가고, 매표소가 "운영 수요"를
             * 채워 버려 안내소·사무실을 지을 이유가 사라진다.
             */
            g.admitting = false;
            this.admit(g, this.tunables.admissionFee);
            continue;
          }
          const gains = this.tunables.useGains;
          let gain = (gains[Math.min(g.used, gains.length - 1)] ?? 0) as number;
          // 나이트풀 (S4) — 저녁의 수영은 더 즐겁다
          if (usedHandle >= ZONE_HANDLE_BASE && this.swimBoost) gain += 5;
          /*
           * 평판 특화 (P1.5) — **이 시설이 좋아서** 더 만족한다.
           *
           * ⚠ 여기가 손님이 "그 시설의 만족 보너스"를 읽는 유일한 경로다. 그전까지
           * 이득은 전역 `useGains` 하나뿐이라 어느 시설을 썼든 같았고, 그래서
           * 시설을 키우는 것이 만족에 안 보였다 (평균 개선 단계의 간접 보너스만 있었다).
           * 특화가 없으면 0 이다 — 미선택 경로는 예전과 완전히 같다.
           */
          if (usedHandle < ZONE_HANDLE_BASE) gain += this.placement.satisfactionBonusOf(usedHandle);
          const usedItem =
            usedHandle >= ZONE_HANDLE_BASE
              ? undefined
              : this.placement.all().find((f) => f.handle === usedHandle);
          const usedDef = usedItem ? facilityDef(usedItem.defId) : undefined;
          const boughtRecipe = usedDef?.menuMode === 'craft' ? recipeDef(usedMenuId) : undefined;
          /*
           * 레시피 `satisfaction`은 0부터 더하는 보너스가 아니라 **품질 점수**다.
           * 기본 품질 5는 기존 시설 이용 만족을 보존하고, 6~9 메뉴만 차이만큼 더한다.
           * 통째로 더하면 시작 캔음료 하나가 모든 손님을 100점에 붙여 평판 특화가 사라진다.
           */
          if (boughtRecipe) gain += Math.max(0, boughtRecipe.satisfaction - 5);
          g.used++;
          // 채운 수요를 기록해 다음엔 다른 종류로 간다
          const usedNeed =
            usedHandle >= ZONE_HANDLE_BASE
              ? 'play'
              : usedItem
                ? ((facilityDef(usedItem.defId) as { need?: string } | undefined)?.need ?? '')
                : '';
          if (usedNeed !== '' && !g.usedNeeds.includes(usedNeed)) g.usedNeeds.push(usedNeed);
          g.satisfaction = Math.min(100, g.satisfaction + gain);
          this.finishedWallet += g.wallet;
          this.finishedCount += 1;
          /*
           * 실제로 이용한 시설의 요금(개선 단계·과금 분류 반영) × 지갑.
           *
           * `feeOf` 는 **입장권에 포함된 시설이면 0** 을 돌려준다 (P6). 여기서 다시
           * 분류를 보지 않는다 — 규칙이 두 벌이 되면 결산 합계와 화면의 `+₩N` 이 갈라진다.
           */
          const unitFee =
            usedHandle >= ZONE_HANDLE_BASE
              ? this.zoneCharge(usedHandle - ZONE_HANDLE_BASE)
              : boughtRecipe && usedDef
                ? Math.round(
                    boughtRecipe.price *
                      (usedDef.fee > 0 ? this.placement.feeOf(usedHandle) / usedDef.fee : 1),
                  )
                : usedDef?.menuMode === 'craft'
                  ? 0
                  : this.placement.feeOf(usedHandle);
          const fee = unitFee * g.wallet;
          const key = usedNeed === '' ? '-' : usedNeed;
          this.finishedFeeByNeed.set(key, (this.finishedFeeByNeed.get(key) ?? 0) + fee);
          if (boughtRecipe && usedItem) {
            this.menuPurchases.push({
              purchaseId: `${this.purchaseWeek}:${g.id}:${boughtRecipe.id}:${this.menuPurchases.length}`,
              week: this.purchaseWeek,
              guestId: g.id,
              ...(g.characterId ? { characterId: g.characterId } : {}),
              menuId: boughtRecipe.id,
              facilityHandle: usedItem.handle,
              amount: Math.round(fee),
            });
          }
          if (usedHandle >= ZONE_HANDLE_BASE) {
            this.zoneUseCount += 1;
            this.zoneFeeSum += fee;
          }
          this.setEmote(g, g.satisfaction >= 80 ? 'love' : 'happy');
          this.syncFace(g);
          g.state = g.used >= this.tunables.wantUses ? 'leaving' : 'walking';
          g.pose = 'walk';
          g.menuId = null;
        }
        continue;
      }

      if (g.state === 'gone') continue;

      // 목적지 결정
      let field: FlowField | null = null;
      if (g.state === 'leaving') {
        field = this.gateField;
      } else if (g.state === 'arriving') {
        /*
         * 입장 수속 — 닿는 매표소로 간다. 하나도 못 닿으면 **입장이 안 된다.**
         *
         * 기다리게 하지 않는다: 매표소가 없는 판에서 손님이 정류장에 쌓이면 그게 곧
         * 판이 얼어붙는 모양이다 (STUCK_LIMIT 주석의 죽음의 나선과 같은 구조).
         * 돌려보내고 `noTicket` 으로 결산이 지목한다.
         */
        if (g.usingHandle === 0) {
          const ticket = this.pickTicket(g.i, g.j);
          if (ticket === null) {
            this.turnBack(g);
            continue;
          }
          // 슬롯은 안 잡는다 — 이유는 `pickTicket` 주석
          g.usingHandle = ticket;
        }
        field = this.fields.get(g.usingHandle) ?? null;
        if (!field) {
          g.usingHandle = 0;
          continue;
        }
      } else {
        if (g.usingHandle === 0) {
          const target = this.pickTarget(g, guestRng);
          if (target === null) {
            // 갈 곳이 없다 — 참다가 나간다
            const p = (this.patience.get(g.id) ?? 0) + 1;
            this.patience.set(g.id, p);
            g.satisfaction = Math.max(0, g.satisfaction - this.tunables.waitPenalty);
            // 인내는 유형이 정한다 — 커플·단체는 빨리 지친다 (§10.4)
            if (p > this.tunables.patienceTicks * groupDef(g.group).patience) {
              g.satisfaction = Math.max(0, g.satisfaction - 30);
              this.setEmote(g, 'annoyed');
              this.syncFace(g);
              g.state = 'leaving';
            } else if (p % 60 === 0) {
              this.setEmote(g, 'neutral');
            }
            g.pose = 'idle';
            continue;
          }
          this.patience.delete(g.id);
          // 슬롯을 미리 잡는다 — 도착해서 잡으면 걸어가는 동안 남이 채운다
          if (!this.claimSlot(g, target)) continue;
          const item = this.placement.all().find((f) => f.handle === target);
          const def = item ? facilityDef(item.defId) : undefined;
          if (def?.menuMode === 'craft') {
            const available = this.placement.menuOperabilityOf(
              target,
              (id) => this.hasMenuRecipe(id),
            ).menuIds;
            g.menuId = chooseMenu(
              available,
              g.group,
              g.requestedRecipeId,
              g.regularPrefer,
              g.regularAvoid,
            )?.id ?? null;
          }
        }
        field = this.fields.get(g.usingHandle) ?? null;
        if (!field) {
          this.releaseSlot(g);
          continue;
        }
      }
      if (!field) continue;

      // 이동 — ticksPerStep 마다 한 칸
      g.stepAcc++;
      if (g.stepAcc < this.tunables.ticksPerStep) continue;
      g.stepAcc = 0;

      if (field.arrived(g.i, g.j)) {
        if (g.state === 'leaving') {
          this.exited++;
          this.satSum += g.satisfaction;
          if (g.used === 0) this.gaveUp++;
          g.state = 'gone';
        } else {
          // 매표소에 닿았으면 이 이용은 입장 수속이다 — 상태를 덮기 전에 잡는다
          g.admitting = g.state === 'arriving';
          g.state = 'using';
          const item = this.placement.all().find((f) => f.handle === g.usingHandle);
          const def = item ? facilityDef(item.defId) : undefined;
          const ride =
            item && def ? PlacementGrid.rideTilesOf(def, item.i, item.j, item.facing ?? 0) : null;
          if (item && def?.ride && ride) {
            /*
             * 입구로 들어가 출구로 나온다. 칸은 **`rideTilesOf` 가 정본**이다 (K51) —
             * 여기서 `item.i + def.ride.entryTile[0]` 을 다시 계산하면 회전이 빠져
             * (화면은 도는데 손님은 안 돈다) 표시가 거짓말이 된다.
             */
            g.rideTo = [ride.exit[0], ride.exit[1]];
            g.rideTotal = def.ride.traverseTicks;
            g.rideTicks = def.ride.traverseTicks;
            /*
             * 기준 칸이 곧 **입구**다 — 보간의 출발점이면서 나올 때 돌아갈 자리다.
             * 입구는 발자국 안이라 못 걷는 칸이고, `leaveFacility` 가 그 이웃(= 타러
             * 왔던 칸)으로 편다.
             */
            this.enterFacility(g, ride.entry, ride.entry, 'ride');
            g.useTicks = 1;
          } else {
            /*
             * 수영만 체류가 길다 (`swimTicks`) — 유영 걸음이 4 tick 마다 한 칸이라
             * 체류를 늘리면 걸음 수가 그대로 따라 는다. 걸음 간격은 안 건드린다:
             * 빨라지면 헤엄이 아니라 미끄러지는 것으로 보인다.
             */
            g.useTicks =
              g.usingHandle >= ZONE_HANDLE_BASE ? this.tunables.swimTicks : this.tunables.useTicks;
            if (g.usingHandle >= ZONE_HANDLE_BASE) {
              /*
               * 입수 (S2) — 입수점을 기억해 두고(나올 때 그 자리로 올라온다) 물로 들어간다.
               * 구역엔 슬롯이 없으므로 포즈는 여기서 정한다.
               */
              const z = this.zoneLookup.get(g.usingHandle);
              const first =
                z?.list.find((t) => Math.abs(t.x - g.i) + Math.abs(t.y - g.j) === 1) ?? z?.list[0];
              // swim 시트는 ±Z 두 방향뿐이다 — 다른 방향이면 프레임이 없다
              this.enterFacility(
                g,
                first ? [first.x, first.y] : [g.i, g.j],
                [g.i, g.j],
                'swim',
                '+Z',
              );
            } else {
              /*
               * **슬롯 칸 위에 선다** (K52 5단계). 자리·포즈·방향의 정본은 데이터고
               * `slotTileOf` 가 회전까지 반영해서 낸다 — 여기서 `item.i + slot.tile[0]`
               * 을 다시 쓰면 전치 산수가 두 벌이 된다 (K51 이 데인 자리).
               *
               * ⚠ `null` 인 경우가 둘이고 **둘 다 제자리에 선다**:
               *   · 슬롯이 없는 시설 14종 — 전부 `capacity 0` 이라 손님이 슬롯을 못 잡는다
               *   · 매표소 — `pickTicket` 이 슬롯을 안 잡아 `usingSlot === -1` 이다.
               *     지나가는 곳이지 앉는 곳이 아니다 (`ticket` 데이터에 slots 는 있다)
               *
               * ⚠ 포즈는 **`slots[].pose` 가 정본**이다. 예전 `poseFor()` 는 시설 id
               * 문자열 매칭(`def.id.includes('sunbed')`)이라 계약과 **17종이 어긋났다**.
               * 이름의 유효성은 `validateContracts` 가 렌더 계약과 대조해 지킨다.
               */
              const slot =
                item && def && g.usingSlot >= 0 && !slotRestoreFault
                  ? PlacementGrid.slotTileOf(def, item.i, item.j, item.facing ?? 0, g.usingSlot)
                  : null;
              this.enterFacility(
                g,
                slot ? slot.tile : [g.i, g.j],
                [g.i, g.j],
                slot ? (slot.pose as GuestPose) : 'idle',
                slot ? (slot.facing as Guest['facing']) : undefined,
              );
            }
          }
        }
        continue;
      }

      const step = field.next(g.i, g.j, g.id & 3);
      if (!step) {
        /*
         * 길이 막혔다. 목적지를 놓고 다시 고르되, **영원히 갇히지 않게 센다.**
         *
         * ⚠ 이 안전 밸브가 없으면: 나중에 지은 시설이 손님을 둘러싸면 게이트로 갈 길이
         * 사라지고 `leaving` 손님이 매 tick `continue` 로 제자리에 선다. 퇴장이 없으니
         * 정원이 영원히 차 있고, 새 손님이 못 들어와 주간 입장이 0 이 된다. 퇴장 만족도가
         * 0(퇴장 없음)이라 등급이 1로 떨어지고 상한이 30 이 되는데 그 30 이 갇힌 손님으로
         * 차 있어 **돌아올 길이 없다** (312주 실측: 12판 중 4판이 이 상태로 끝났다).
         */
        if (g.state !== 'leaving') this.releaseSlot(g);
        g.pose = 'idle';
        g.stuckTicks += 1;
        if (g.stuckTicks > STUCK_LIMIT) {
          if (g.state === 'leaving') {
            // 갇힌 채로 사라진다 — 못 나간 손님을 정원에 계속 두면 판이 얼어붙는다
            this.exited++;
            this.satSum += g.satisfaction;
            if (g.used === 0) this.gaveUp++;
            g.state = 'gone';
          } else if (g.state === 'arriving') {
            // 아직 입장 전이다 — 퇴장이 아니라 **못 들어간 것**이다
            this.turnBack(g);
          } else {
            // 갈 곳이 없으면 나가기로 한다 — 그래도 못 나가면 위 분기가 정리한다
            g.state = 'leaving';
            g.stuckTicks = 0;
          }
        }
        continue;
      }
      g.stuckTicks = 0;
      g.fromI = g.i;
      g.fromJ = g.j;
      g.i = step[0];
      g.j = step[1];
      g.progress = 0;
      g.pose = 'walk';
      /*
       * 걷는 만큼 깎인다 — 멀리 놓으면 만족도가 떨어져야 "가깝게"가 판단이 된다.
       *
       * ⚠ **입장 뒤부터** 센다 (K36-B②). 정류장→매표소는 도시 띠 폭이 정하는 고정
       * 거리라 플레이어가 줄일 수 없다. 거기서 깎으면 **못 고치는 벌점**이 되고,
       * "가깝게 놓는다"가 판단이 아니라 세금이 된다.
       */
      if (g.state !== 'arriving') {
        g.satisfaction = Math.max(0, g.satisfaction - this.tunables.walkPenalty);
      }
      g.facing =
        step[0] > g.fromI ? '+X' : step[0] < g.fromI ? '-X' : step[1] > g.fromJ ? '+Z' : '-Z';
    }

    // 퇴장한 손님 제거
    for (let k = this.guests.length - 1; k >= 0; k--) {
      if ((this.guests[k] as Guest).state === 'gone') {
        this.patience.delete((this.guests[k] as Guest).id);
        this.guests.splice(k, 1);
      }
    }
  }

  /**
   * 수영 구역 (S2) — 파생 결과. 위험도·zone 콤보·의뢰·심사·소원·부표 렌더가 읽는다.
   *
   * 배치가 바뀌었으면 **여기서 다시 파생한다** (`dirty`) — 부르는 쪽이 `invalidate()`
   * 뒤 아무것도 안 해도 되는 이유이자, 구역을 따로 저장하지 않아도 되는 이유다.
   */
  swimZones(): readonly SwimZone[] {
    if (this.dirty) this.rebuildFields();
    return this.zones;
  }

  /*
   * ⚠ **`poseFor()` 는 삭제됐다** (K52 5단계). 시설 id 문자열 매칭
   * (`def.id.includes('sunbed')`)으로 포즈를 정하던 함수라 데이터의 `slots[].pose` 와
   * **17종이 어긋나 있었다** (`pool_lazy` swim↔float · 나머지 16종 idle↔sit).
   * 되살리지 말 것 — 포즈의 정본은 `slots[].pose` 하나다 (`enterFacility` 호출부).
   */

  /**
   * 렌더 보간용 — 프레임마다 progress 를 밀어 준다 (시뮬 상태를 바꾸지 않는다).
   *
   * `tickSeconds` 는 렌더가 tick 하나를 실시간 몇 초에 소비하는지다 (K44).
   * ⚠ 예전엔 10Hz(0.1초) 고정 가정이었다 — 흐르는 낮(K39)이 tick 을 0.4초에
   * 소비하자 손님이 0.4초 만에 다음 칸까지 미끄러진 뒤 **1.2초를 얼어 있었다**
   * (스톱모션 — 사용자가 "느려졌다"로 보고한 것의 절반). 보간 시간이 실제 tick
   * 간격과 같아야 걸음이 이어진다.
   */
  advanceRenderProgress(dt: number, tickSeconds = 0.1): void {
    const per = this.tunables.ticksPerStep * tickSeconds;
    for (const g of this.guests) {
      if (g.progress < 1) g.progress = Math.min(1, g.progress + dt / per);
    }
  }

  stats(): GuestStats {
    let walking = 0;
    let using = 0;
    let leaving = 0;
    let arriving = 0;
    const byGroup: Record<GroupId, number> = { family: 0, couple: 0, friends: 0, company: 0 };
    for (const g of this.guests) {
      if (g.state === 'walking') walking++;
      else if (g.state === 'using') using++;
      else if (g.state === 'leaving') leaving++;
      else if (g.state === 'arriving') arriving++;
      byGroup[g.group] += 1;
    }
    return {
      alive: this.guests.length,
      arriving,
      byGroup,
      walking,
      using,
      leaving,
      exited: this.exited,
      exitSatisfaction: this.exited === 0 ? 0 : this.satSum / this.exited,
      gaveUp: this.gaveUp,
      noTicket: this.noTicketCount,
    };
  }

  /**
   * 이번 구간에 **입장한** 손님을 가져가고 비운다 — `takeFinished` 와 같은 모양이다.
   *
   * 주간 결산이 `spawn` 성공 수 대신 이걸 세야 "입장"이 실제 입장을 뜻한다. 전후 차이
   * (`after.x − before.x`)로 재지 않는 이유도 같다 — 그 방식은 같은 tick 에 걸친 사건을
   * 놓친다 (요금 징수에서 이미 겪은 실패다).
   */
  takeAdmitted(): {
    count: number;
    byGroup: Record<GroupId, number>;
    /** `count` 안에서 스릴 선호 문턱을 넘은 실제 코스 수요 */
    courseDemand: number;
    /** 걷힌 입장료 합 (요금 배율 전) */
    fee: number;
    /** 매표소를 못 지나 돌아간 손님 */
    noTicket: number;
  } {
    const out = {
      count: this.admittedCount,
      byGroup: { ...this.admittedByGroup },
      courseDemand: this.admittedCourseDemand,
      fee: this.admissionSum,
      noTicket: this.noTicketTaken,
    };
    this.admittedCount = 0;
    this.admittedByGroup = { family: 0, couple: 0, friends: 0, company: 0 };
    this.admittedCourseDemand = 0;
    this.admissionSum = 0;
    this.noTicketTaken = 0;
    return out;
  }

  /** 아직 결산이 안 가져간 "못 들어간 손님" — 누계(`noTicketCount`)와 따로 둔다 */
  private noTicketTaken = 0;

  /**
   * 이용을 마친 손님들의 지갑 배율 합을 가져가고 **비운다**.
   *
   * 요금 계산이 인원수 대신 이걸 쓰면, 친구·단체가 더 쓴다는 설정이 실제 매출에 나타난다.
   * `usingBefore - usingNow` 로 세던 방식은 같은 tick 에 시작·종료가 겹치면 어긋났다.
   */
  takeFinished(): {
    count: number;
    walletSum: number;
    /** 수요 종류별 요금 합 (지갑·개선 반영). 날씨 보정은 러너가 종류별로 곱한다 */
    feeByNeed: Map<string, number>;
  } {
    const out = {
      count: this.finishedCount,
      walletSum: this.finishedWallet,
      feeByNeed: new Map(this.finishedFeeByNeed),
    };
    this.finishedCount = 0;
    this.finishedWallet = 0;
    this.finishedFeeByNeed.clear();
    return out;
  }

  /** 이번 구간의 실제 메뉴 구매를 가져가고 비운다. */
  takeMenuPurchases(): MenuPurchase[] {
    const out = this.menuPurchases.map((x) => ({ ...x }));
    this.menuPurchases = [];
    return out;
  }

  /** 이번 주에 실제 입장한 이름 있는 단골 수. */
  takeRegularVisits(): number {
    const out = this.admittedRegularCount;
    this.admittedRegularCount = 0;
    return out;
  }

  /**
   * 어떤 칸에서 그 시설까지 몇 걸음인가. 못 가면 −1.
   *
   * 진단·검증용이다 — "덱을 놓으면 물 위 시설에 갈 수 있게 된다"를 손님 60명의 선택에
   * 의존하지 않고 직접 확인할 수 있다. 거리장을 아직 안 만들었으면 만든다.
   */
  distanceTo(handle: number, i: number, j: number): number {
    if (this.dirty) this.rebuildFields();
    return this.fields.get(handle)?.distAt(i, j) ?? -1;
  }

  /** 시설별 점유 슬롯 — 렌더가 "칸마다 손님"을 그리는 근거 */
  occupancy(handle: number): readonly number[] {
    return this.claims.get(handle)?.slots ?? [];
  }
}

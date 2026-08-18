import { Rng } from '../rng.js';
import { FlowField } from '../pathfield.js';
import { KairoTerrain } from './terrain.js';
import { type WallGrid } from './walls.js';
import { PlacementGrid, facilityDef, guestWalkable } from './placement.js';
import {
  pickGroup,
  groupSize,
  groupDef,
  needWeight,
  type GroupDef,
  type GroupId,
} from './groups.js';
import type { Season } from './week.js';

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
  /** 탑승 구간 (입구 → 출구) */
  rideFrom: readonly [number, number];
  rideTo: readonly [number, number];
}

export interface GuestTunables {
  /** 동시 손님 상한 */
  maxGuests: number;
  /** 한 칸 이동에 필요한 tick */
  ticksPerStep: number;
  /** 시설 1회 이용 tick */
  useTicks: number;
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

export const GUEST_DEFAULTS: GuestTunables = {
  maxGuests: 60,
  ticksPerStep: 4,
  /**
   * 이용 시간. **한 방문이 하루(120 tick) 안에 끝나야 한다** — 40 tick × 4회 + 이동이면
   * 160 tick 이라 손님이 2.5일을 머물고 공원이 영구히 포화된다 (헤드리스에서 만석 63%).
   * 12 tick × 4회 + 이동 40 = 88 tick 으로 하루 안에 들어온다.
   */
  useTicks: 12,
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
   * 입장료 — 설계 §13.1 의 **₩10,000 을 이 게임의 눈금으로 옮긴 값**이다.
   *
   * ⚠ 명목가를 그대로 넣으면 안 된다. 시설 요금이 이미 1/10 눈금이라
   * (설계의 식음 객단가 ₩8,000 이 데이터에는 `fee: 800`, 요금 중앙값 900),
   * 10,000 을 그대로 쓰면 입장료 한 번이 시설 이용 열 번이 된다 —
   * 실측으로 26주 현금 중앙값이 400만 → **2,854만** 이 됐다.
   *
   * 1,000 이면 설계가 정한 비율(입장료 : 식음 ≈ 1.25 : 1)이 그대로 산다.
   */
  admissionFee: 1_000,
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
  private pending: { def: GroupDef; remaining: number; party: number } | null = null;
  private nextParty = 1;
  /**
   * 이번 주에 **선** 시설 (운영요원 부족·고장). 목적지에서 뺀다.
   *
   * 거리장 자체를 지우지 않는 이유: 다음 주에 다시 돌면 그대로 써야 하는데, 지우면
   * 매주 1,280칸 거리장을 다시 만들어야 한다.
   */
  private idle = new Set<number>();
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
   * 두 칸 사이를 지나갈 수 있는가 — **경계 벽** 판정 (K25).
   *
   * 칸 판정(`walkable`)과 따로인 이유: 벽은 칸을 막지 않고 이동을 막는다. 거리장과
   * 걸음 선택이 **둘 다** 이걸 통과해야 손님이 벽을 뚫고 지나가지 않는다.
   */
  private readonly canCross = (i: number, j: number, ni: number, nj: number): boolean =>
    !this.walls.blocksMove(i, j, ni, nj);

  /**
   * 거리장 재구축. 시설마다 **발자국에 인접한 걸을 수 있는 칸**을 목적지로 둔다 —
   * 발자국 자체는 시설이 점유해 못 걷는다.
   */
  private rebuildFields(): void {
    this.fields.clear();
    this.tickets.clear();
    const w = this.terrain.width;
    const h = this.terrain.height;

    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId);
      if (!def) continue;
      const targets: [number, number][] = [];
      for (const [ti, tj] of PlacementGrid.footprintTiles(def, item.i, item.j)) {
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
          targets.push([ni, nj]);
        }
      }
      if (targets.length === 0) continue;
      const f = new FlowField(w, h);
      f.build(this.walkable, targets, this.canCross);
      this.fields.set(item.handle, f);
      if (item.defId === TICKET_DEF_ID) this.tickets.add(item.handle);
    }

    this.gateField = new FlowField(w, h);
    this.gateField.build(this.walkable, [[this.gate.i, this.gate.j]], this.canCross);
    this.dirty = false;

    // 없어진 시설의 슬롯 점유를 정리한다
    const live = new Set(this.placement.all().map((f) => f.handle));
    for (const handle of [...this.claims.keys()]) {
      if (!live.has(handle)) this.claims.delete(handle);
    }
    for (const g of this.guests) {
      if (g.usingHandle !== 0 && !live.has(g.usingHandle)) this.releaseSlot(g);
    }
  }

  private slotsOf(handle: number): SlotClaim | null {
    const item = this.placement.all().find((f) => f.handle === handle);
    if (!item) return null;
    const def = facilityDef(item.defId);
    if (!def) return null;
    let c = this.claims.get(handle);
    if (!c) {
      c = { slots: new Array<number>(def.capacity).fill(0) };
      this.claims.set(handle, c);
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
    const all: { handle: number; dist: number; need: string }[] = [];
    for (const [handle, field] of this.fields) {
      if (this.idle.has(handle)) continue; // 선 시설엔 안 간다
      if (this.tickets.has(handle)) continue; // 매표소는 게이트다 — 놀러 가는 곳이 아니다
      const c = this.slotsOf(handle);
      if (!c || c.slots.every((s) => s !== 0)) continue;
      const d = field.distAt(g.i, g.j);
      if (d < 0) continue;
      const item = this.placement.all().find((f) => f.handle === handle);
      const need = item
        ? ((facilityDef(item.defId) as { need?: string } | undefined)?.need ?? '')
        : '';
      all.push({ handle, dist: d, need });
    }
    if (all.length === 0) return null;

    const fresh = all.filter((c) => c.need !== '' && !g.usedNeeds.includes(c.need));
    const pool = fresh.length > 0 ? fresh : all;
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
    let n = 0;
    for (const g of this.guests) if (g.state !== 'arriving') n++;
    return n;
  }

  /** 입장 확정 — 여기서만 `visitors` 가 는다 */
  private admit(g: Guest, fee: number): void {
    this.admittedCount++;
    this.admittedByGroup[g.group] += 1;
    this.admissionSum += fee;
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
    rng: Rng,
    season: Season = 'summer',
    /** 맵이 바꾼 유형 비중 (§4.5). 없으면 계절 기본값 */
    shares?: Partial<Record<GroupId, number>>,
  ): Guest | null {
    if (this.insideCount() >= this.limit) return null;
    if (!this.walkable(this.stop.i, this.stop.j)) return null;
    if (this.dirty) this.rebuildFields();
    if (!this.pending || this.pending.remaining <= 0) {
      const def = pickGroup(rng, season, shares);
      this.pending = { def, remaining: groupSize(rng, def), party: this.nextParty++ };
    }
    const party = this.pending;
    party.remaining -= 1;
    const def = party.def;
    const g: Guest = {
      id: this.nextId++,
      group: def.id,
      party: party.party,
      wallet: def.wallet,
      thrill: def.thrill[0] + rng.next() * (def.thrill[1] - def.thrill[0]),
      i: this.stop.i,
      j: this.stop.j,
      fromI: this.stop.i,
      fromJ: this.stop.j,
      progress: 1,
      // 정류장에 내린 상태 — 매표소를 지나야 손님이 된다 (K36-B②)
      state: this.tunables.requireTicket ? 'arriving' : 'walking',
      pose: 'walk',
      facing: '+Z',
      palette: rng.int(8),
      face: 'calm',
      emote: null,
      emoteTicks: 0,
      usingHandle: 0,
      usingSlot: -1,
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
  tick(rng: Rng): void {
    if (this.dirty) this.rebuildFields();

    for (const g of this.guests) {
      if (g.emoteTicks > 0 && --g.emoteTicks === 0) g.emote = null;

      if (g.state === 'using') {
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
          this.releaseSlot(g);
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
          const gain = (gains[Math.min(g.used, gains.length - 1)] ?? 0) as number;
          g.used++;
          // 채운 수요를 기록해 다음엔 다른 종류로 간다
          const usedItem = this.placement.all().find((f) => f.handle === usedHandle);
          const usedNeed = usedItem
            ? ((facilityDef(usedItem.defId) as { need?: string } | undefined)?.need ?? '')
            : '';
          if (usedNeed !== '' && !g.usedNeeds.includes(usedNeed)) g.usedNeeds.push(usedNeed);
          g.satisfaction = Math.min(100, g.satisfaction + gain);
          this.finishedWallet += g.wallet;
          this.finishedCount += 1;
          // 실제로 이용한 시설의 요금(개선 단계 반영) × 지갑
          const fee = this.placement.feeOf(usedHandle) * g.wallet;
          const key = usedNeed === '' ? '-' : usedNeed;
          this.finishedFeeByNeed.set(key, (this.finishedFeeByNeed.get(key) ?? 0) + fee);
          this.setEmote(g, g.satisfaction >= 80 ? 'love' : 'happy');
          this.syncFace(g);
          g.state = g.used >= this.tunables.wantUses ? 'leaving' : 'walking';
          g.pose = 'walk';
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
          const target = this.pickTarget(g, rng);
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
          if (item && def?.ride) {
            // 입구로 들어가 출구로 나온다
            g.rideFrom = [item.i + def.ride.entryTile[0], item.j + def.ride.entryTile[1]];
            g.rideTo = [item.i + def.ride.exitTile[0], item.j + def.ride.exitTile[1]];
            g.rideTotal = def.ride.traverseTicks;
            g.rideTicks = def.ride.traverseTicks;
            g.fromI = g.i;
            g.fromJ = g.j;
            g.i = g.rideFrom[0];
            g.j = g.rideFrom[1];
            g.progress = 0;
            g.pose = 'ride';
            g.useTicks = 1;
          } else {
            g.useTicks = this.tunables.useTicks;
            g.pose = this.poseFor(g.usingHandle);
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

  /** 시설이 정한 이용 포즈 — 슬롯의 포즈는 렌더 계약이 갖고 있지만 기본값은 층으로 낸다 */
  private poseFor(handle: number): GuestPose {
    const item = this.placement.all().find((f) => f.handle === handle);
    const def = item ? facilityDef(item.defId) : undefined;
    if (!def) return 'idle';
    if (def.layer === 'water') return 'float';
    if (def.id.includes('pool')) return 'swim';
    if (def.id.includes('sunbed') || def.id.includes('jjimjil')) return 'lie';
    if (def.id.includes('cafe') || def.id.includes('pyeongsang') || def.id.includes('sauna')) {
      return 'sit';
    }
    return 'idle';
  }

  /** 렌더 보간용 — 프레임마다 progress 를 밀어 준다 (시뮬 상태를 바꾸지 않는다) */
  advanceRenderProgress(dt: number): void {
    const per = this.tunables.ticksPerStep / 10; // 10Hz 고정 timestep 기준 초
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
    /** 걷힌 입장료 합 (요금 배율 전) */
    fee: number;
    /** 매표소를 못 지나 돌아간 손님 */
    noTicket: number;
  } {
    const out = {
      count: this.admittedCount,
      byGroup: { ...this.admittedByGroup },
      fee: this.admissionSum,
      noTicket: this.noTicketTaken,
    };
    this.admittedCount = 0;
    this.admittedByGroup = { family: 0, couple: 0, friends: 0, company: 0 };
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

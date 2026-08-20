import { Rng } from '../rng.js';
import { BusRunner } from './bus.js';
import { nightPools, zoneFee, ZONE_HANDLE_BASE } from './swim.js';
import type { KairoTerrain } from './terrain.js';
import {
  PlacementGrid,
  facilityDef,
  LEVEL_SATISFACTION,
  GATE_FACILITY_ID,
} from './placement.js';
import { GROUPS, needWeight, type GroupId } from './groups.js';
import type { GuestStore } from './guests.js';
/*
 * ⚠ 입장 상한의 **정본은 `progress.ts` 의 `admissionLimit`** 이다. 여기서 규칙
 * (`min(등급 상한, 공급×1.5)`)을 다시 쓰지 않는다 — 두 벌이 되면 결산이 "더 지으세요"라고
 * 말한 뒤 실제로는 한 명도 안 들어오는 상태가 조용히 생긴다 (그게 지금 고치는 버그다).
 *
 * 순환 import 가 아니다: `progress.ts` 는 이 파일을 **type-only** 로만 가져가므로
 * (`import type { NeedKind, WeekSummary }`) 컴파일에서 지워진다.
 */
import { admissionLimit, type GradeDef } from './progress.js';

/**
 * 주 단위 루프와 결산 — 스펙 v2/v4, CLAUDE.md 의 핵심 루프.
 *
 * ## 왜 주 단위인가
 *
 * 실시간은 폰 2분 세션에 안 맞는다. 한 주를 0.6초에 계산할 수 있으니 공짜로 가능하다.
 *
 * ## ⚠ v4 에서 고친 것 — "0.6초에 계산된다"와 "0.6초만 보여준다"는 다르다
 *
 * v3 는 계산이 빠르다는 이유로 연출을 생략했는데, **손님이 노는 광경이 이 게임 최대의
 * 보상**이라 그걸 리플레이로 격리하면 안 된다. 그래서 이 모듈은 한 주를 계산하면서
 * **tick 단위 기록**을 남긴다 — 렌더가 그걸 3~5초로 압축 재생한다.
 *
 * ## 날씨는 배수가 아니라 수요 구성을 바꾼다
 *
 * "비 오면 방문객 ×0.6" 은 RNG 세금이다. 대신 비는 `food`·`warm`·`rest` 수요를 올리고
 * `thrill`·`play` 를 내린다 — 플레이어가 시설 구성으로 대응할 수 있는 변화여야 한다.
 */

/**
 * 요금 배율이 만족도에 주는 영향 (§15.9).
 *
 * 정가(1.0)에서 0. 비싸면 깎이고 싸면 오른다 — **비대칭**이다: 싸게 받아 얻는 호감보다
 * 비싸게 받아 잃는 불만이 크다. 대칭으로 두면 "항상 최대로 올린다"가 정답이 되기 쉽다.
 */
export function priceSatisfaction(mult: number): number {
  const d = mult - 1;
  // `|| 0` 은 −0 을 0 으로 만든다 — 정가에서 −0 이 나오면 비교가 성가시다
  return Math.round(d < 0 ? -d * 12 : -d * 30) || 0;
}

export const DAYS_PER_WEEK = 7;
/** 하루 tick 수. 10Hz 고정 timestep 기준 = 하루 12초 */
export const TICKS_PER_DAY = 120;
export const TICKS_PER_WEEK = DAYS_PER_WEEK * TICKS_PER_DAY;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'heat' | 'cold';
export type NeedKind =
  | 'food'
  | 'rest'
  | 'warm'
  | 'play'
  | 'thrill'
  | 'scenery'
  | 'hygiene'
  | 'service'
  | 'stay';

/**
 * 수요 종류 9종의 **정본 목록**.
 *
 * ⚠ 병목 후보는 여기서 나온다 — 예전에는 `Object.keys(supply)` 를 순회했는데, `supply`
 * 는 **지어진 시설에서 만들어지므로 공급이 0 인 종류는 키 자체가 없다.** 즉 하나도 없는
 * 종류가 가장 큰 병목인데 결산이 정확히 그것만 말할 수 없었다 (실측: 봇이 스릴 0개로
 * 52주를 도는 동안 병목이 한 번도 스릴을 안 가리켰다). 결산은 "다음에 뭘 지을까"의
 * 근거이므로 **가장 중요한 조언을 못 하는 상태**였다.
 *
 * 순서는 표시 순서가 아니라 **동점을 끊는 순서**다 (결정론 — 불변식 2).
 */
export const NEED_KINDS: readonly NeedKind[] = [
  'food',
  'rest',
  'warm',
  'play',
  'thrill',
  'scenery',
  'hygiene',
  'service',
  'stay',
];

/** 요일 — 주말이 성수기다 */
export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const;
const WEEKEND = [5, 6];

/**
 * 날씨별 수요 구성 배율. **방문객 수 배수가 아니다** — 무엇을 원하는지가 바뀐다.
 * 1.0 이 기준이고, 빠진 종류는 1.0 이다.
 */
export const WEATHER_DEMAND: Record<Weather, Partial<Record<NeedKind, number>>> = {
  clear: { thrill: 1.15, play: 1.1, scenery: 1.1 },
  cloudy: {},
  rain: { food: 1.4, warm: 1.5, rest: 1.3, thrill: 0.5, play: 0.6, scenery: 0.6 },
  heat: { thrill: 1.3, play: 1.25, food: 1.2, warm: 0.4, rest: 1.1 },
  cold: { warm: 1.6, food: 1.3, thrill: 0.5, play: 0.6 },
};

/** 계절별 방문객 기준치와 가능한 날씨 */
export const SEASON_PROFILE: Record<
  Season,
  { arrivalBase: number; weather: readonly Weather[] }
> = {
  spring: { arrivalBase: 0.55, weather: ['clear', 'cloudy', 'rain'] },
  summer: { arrivalBase: 1.0, weather: ['clear', 'heat', 'heat', 'cloudy', 'rain'] },
  autumn: { arrivalBase: 0.6, weather: ['clear', 'cloudy', 'rain'] },
  winter: { arrivalBase: 0.3, weather: ['cold', 'cold', 'cloudy', 'clear'] },
};

/**
 * 비수기 유지비 배율 — **여름에만 수요가 있는 시설은 겨울에 세워둔다.**
 *
 * ## 왜 필요한가 (실측)
 *
 * 이게 없으면 비수기 수익은 제자리인데(수요 제한) 유지비만 시설 수를 따라 자란다.
 * 40주 실측: 비수기 수익 41만 고정, 유지비 9만 → 21만. 같은 계절인데 후반 손익이
 * 25% 낮아지고, 플레이어 입장에서는 **"지을수록 겨울이 나빠진다"** 가 된다.
 * 그러면 후반에 확장할 이유가 사라진다.
 *
 * 현실에서도 겨울에 워터슬라이드에 인력을 붙이지 않는다. 실내·숙박·식음은 사계절 돌므로
 * 배율을 안 받는다 — 그래서 **비수기에 강한 시설 구성**이라는 판단이 생긴다.
 */
export const OFFSEASON_UPKEEP: Record<Season, number> = {
  summer: 1.0,
  spring: 0.7,
  autumn: 0.7,
  winter: 0.4,
};

/**
 * 계절마다 **실제로 도는** 수요 종류. 여기 없는 종류의 시설은 세워두므로
 * `OFFSEASON_UPKEEP` 배율을 받는다.
 *
 * 겨울에 스릴·놀이만 할인해서는 부족했다 (실측: 겨울 유지비 8만 → 17만, 수익은 41만 고정).
 * 겨울에 실제로 도는 것은 사우나·식음·숙박·안내·위생이고, 나머지는 문을 닫는다.
 * 그래서 **비수기에 강한 구성**(사우나·펜션·카페)이라는 판단이 생긴다 — 겨울이 그냥
 * 참는 구간이 아니라 다른 답을 요구하는 구간이 된다.
 */
const ACTIVE_NEEDS: Record<Season, ReadonlySet<NeedKind> | null> = {
  summer: null, // null = 전부 돈다
  spring: new Set<NeedKind>(['food', 'rest', 'stay', 'service', 'hygiene', 'scenery', 'warm']),
  autumn: new Set<NeedKind>(['food', 'rest', 'stay', 'service', 'hygiene', 'scenery', 'warm']),
  winter: new Set<NeedKind>(['food', 'stay', 'service', 'hygiene', 'warm']),
};

export interface DayReport {
  day: number;
  name: string;
  weather: Weather;
  /** 오려고 한 손님 (수요) */
  arrivals: number;
  /** 실제로 들어온 손님 */
  visitors: number;
  /**
   * 만석으로 돌려보낸 손님.
   *
   * v1 구현은 이걸 안 셌더니 **주말 방문객이 평일보다 적게** 나왔다 — 주중에 정원이 차서
   * 주말 입장이 전부 실패했고, 실패는 어디에도 기록되지 않았다. 이 숫자가 곧
   * "시설을 늘려야 한다"는 가장 직접적인 신호다.
   */
  turnedAway: number;
  /** 매표소를 못 지나 돌아간 손님 (K36-B②) */
  noTicket: number;
  revenue: number;
  /** 그 날 걷힌 입장료 — `revenue` 에 포함돼 있다 */
  admission: number;
  upkeep: number;
  /** 그 날 동시 최대 손님 */
  peak: number;
  /** 그 날 퇴장 만족도 평균 */
  exitSatisfaction: number;
  /** 목적지를 못 찾고 나간 손님 */
  gaveUp: number;
}

/**
 * 결산의 **요약 부분**. 히트맵·재생 프레임을 뺀 숫자만이라 세이브에 넣을 수 있다.
 *
 * 의뢰 판정이 읽는 필드가 정확히 이 넷이다. 전체 `WeekReport` 를 저장하면 히트맵
 * 1,280칸 + 재생 프레임까지 들어가 localStorage 를 넘긴다.
 */
export interface WeekSummary {
  visitors: number;
  turnedAway: number;
  profit: number;
  exitSatisfaction: number;
}

export interface WeekReport extends WeekSummary {
  week: number;
  season: Season;
  days: DayReport[];
  arrivals: number;
  revenue: number;
  /**
   * 입장료 수입 (설계 §13.1). `revenue` 에 **이미 들어 있다** — 여기 따로 두는 것은
   * 결산이 "얼마가 표에서 왔나"를 보여주기 위해서다.
   */
  admission: number;
  /**
   * 매표소를 못 지나 돌아간 손님 (K36-B②).
   *
   * 0 이 아니면 원인은 하나다 — 매표소가 없거나, 있어도 길이 안 닿는다. 만석
   * (`turnedAway`)과 갈라 두어야 처방이 갈린다: 만석은 "시설을 늘려라", 이건
   * "매표소를 지어라·길을 이어라"다.
   */
  noTicket: number;
  upkeep: number;
  /** 인건비 — 고정비라 손님이 없어도 나간다 */
  wages: number;
  /** 코스 매출과 탑승객 — 시설 매출과 나눠 보여줘야 "코스를 왜 그리나"가 보인다 */
  courseRevenue: number;
  courseRiders: number;
  /**
   * 이번 주에 **실제로 적용된** 콤보 보너스 (P2-B). 콤보 없이 돌린 주면 null.
   *
   * `WeekOptions.combos` 를 그대로 되돌려 준다 — 계산은 전혀 안 한다 (규칙은 여전히
   * `combos.ts` 소유, 불변식 3).
   *
   * ⚠ **결산이 이 값을 보여줘야 한다.** UI 가 결산을 열면서 배치에서 다시 계산하면,
   * 흐르는 낮 동안 지은 시설까지 세어 "화면의 숫자와 그 주에 적용된 값이 다른" 상태가
   * 된다 (주는 `begin()` 시점 배치로 계산된다). 표시와 적용이 갈라지면 플레이어는
   * 계산이 안 맞는다고 느낀다.
   */
  combos: { satisfactionDelta: number; revenueMult: number } | null;
  gaveUp: number;
  /**
   * 혼잡 히트맵 — 타일별 손님 체류 tick. 결산에서 병목을 **눈으로** 보게 한다.
   * v4 에서 "숫자 표만으로는 다시 엑셀 게임이 된다"고 고친 부분.
   */
  heat: number[];
  heatW: number;
  heatH: number;
  /** 가장 붐빈 타일 (i, j, 값) */
  hotspot: { i: number; j: number; value: number } | null;
  /**
   * 수요 대비 공급이 가장 부족한 종류 — "다음에 무엇을 지을까" 의 근거.
   *
   * **공급 0 인 종류가 언제나 이긴다** (충족률 0 = 최악). 그 종류를 후보에서 빼면
   * 결산이 가장 중요한 조언을 못 한다 — `NEED_KINDS` 주석 참고.
   */
  bottleneck: {
    need: NeedKind;
    demand: number;
    supply: number;
    /**
     * 이 종류를 **한 채도 안 지었다** — "모자란다"가 아니라 **"하나도 없다"**.
     *
     * ⚠ `supply === 0` 과 다르다. 사고로 하나뿐인 사우나가 닫힌 주는 공급이 0 이지만
     * 시설은 있다 — 그 주에 "온열 시설이 하나도 없습니다"는 거짓말이다.
     *
     * 문구가 갈려야 한다:
     * 모자란 것은 더 지으면 되고, 없는 것은 **처음 짓는** 것이라 무엇을 어디서 고르는지를
     * 같이 말해야 행동이 된다.
     */
    missing: boolean;
    /**
     * 지금 지을 수 있는 것 중 **가장 싼 후보** (`opts.buildable` 을 준 경우에만).
     *
     * 처방은 방법까지 말한다 (이 저장소 규칙) — "스릴 0개" 보다 "스릴 시설이 하나도
     * 없습니다 — 건설 ▸ 다이빙대" 가 다음 행동이다. 이름은 UI 가 `facilityDef` 로 푼다
     * (문자열은 `ui/` 소유).
     */
    example: string | null;
  } | null;
  /**
   * 입장 상한의 현재 상태 (P3-C). `opts.grade` 를 안 준 호출자에게는 null.
   *
   * ## 왜 결산이 이걸 알아야 하나
   *
   * 입장은 `min(등급 maxGuests, 공급×1.5)` 다. **공급×1.5 가 등급 상한을 넘는 순간
   * 시설을 더 지어도 손님은 한 명도 안 늘고 유지비만 는다.** 그런데 병목(`bottleneck`)은
   * 수요/공급만 보므로 그 구간에서도 "○○이 부족합니다 — 건설 ▸ ○○" 를 계속 말한다.
   *
   * ⚠ 헤드리스 봇은 이 상태를 이미 안다 (`capped`) — **게임 UI 만 몰랐다.** 즉 사람은
   * 봇보다 **나쁜** 후반을 봤다: 결산이 계속 지으라고 하고, 지으면 손님은 안 늘고,
   * 왜 그런지 화면이 말하지 않는다 (`docs/research/late-game-cap-proposal.md` §1.7).
   *
   * 판정은 `admissionLimit` **하나**에게 묻는다 — 규칙을 여기서 다시 쓰지 않는다.
   */
  admissionCap: {
    /** 이번 주에 실제로 적용된 동시 손님 상한 */
    limit: number;
    /** 등급이 정한 천장 (`GradeDef.maxGuests`) */
    gradeMax: number;
    /** 공급을 아무리 늘려도 상한이 안 오르는 상태 = **정원이 찼다** */
    capped: boolean;
  } | null;
  /**
   * 이번 주 사고 (§12.1). 없으면 null.
   *
   * 위험 단계에서만 일어난다 — 안전도가 78인데 RNG 로 폐쇄되면 억울하다는 v4 결정.
   */
  accident: { handle: number; defId: string; weeks: number } | null;
  /** 압축 연출용 기록 — tick 마다 손님 위치 요약 */
  playback: PlaybackFrame[];
  /**
   * 이번 주에 들어온 손님의 **유형 구성** (§10.4).
   *
   * 결산에 이게 없으면 "가족이 많이 왔는데 놀이 시설이 없다" 같은 판단을 할 수 없고,
   * 그러면 유형은 내부 숫자로만 남는다.
   */
  byGroup: Record<GroupId, number>;
}

/**
 * 압축 재생 프레임 — 위치만 남긴다 (스프라이트는 렌더가 정한다).
 *
 * `fromI`/`fromJ` 는 **출발 칸**이다. 렌더가 손님 깊이를 두 칸 중 가까운 쪽으로 잡는데
 * (K37), 목적 칸만 담으면 압축 연출에서만 손님이 지면에 파묻힌다 — 실시간과 규칙이
 * 갈라지면 "연출에서만 이상하다"가 되고 원인을 못 찾는다.
 *
 * ⚠ 이건 **재생만 쓰는 값**이다. 세이브 스냅샷에 넣지 말 것 (세이브가 커진다).
 */
export interface PlaybackFrame {
  tick: number;
  guests: {
    i: number;
    j: number;
    fromI: number;
    fromJ: number;
    pose: string;
    facing: string;
    palette: number;
  }[];
}

export interface WeekOptions {
  season?: Season;
  /** 압축 연출용 기록을 남길 간격 (0 이면 기록 안 함) */
  playbackEvery?: number;
  /** 손님 입장 간격의 기준 tick — 계절·요일·평판으로 조정된다 */
  arrivalBaseTicks?: number;
  /**
   * 평판 배율 (등급에서 온다). 1.0 이 기본.
   *
   * 시설 수만으로 수요를 올리면 배율이 곧 상한에 붙어 후반에 수요가 고정된다
   * (실측: 11주차부터 320 고정). 평판을 축으로 두면 "만족도를 관리하면 손님이 더 온다"가
   * 되고, 그건 등급이 돈으로 안 사진다는 결정과 같은 방향이다.
   */
  reputation?: number;
  /**
   * 요금 배율 (§15.9 "값을 매긴다"). 1.0 이 정가.
   *
   * 올리면 매출이 늘고 **만족도가 내려간다** — 그게 이 동사의 전부다. 수요를 직접
   * 건드리지 않는 이유는, 만족도 → 등급 → 수요라는 기존 사슬이 이미 있기 때문이다.
   * 두 경로로 넣으면 같은 것을 두 번 세게 된다.
   */
  priceMult?: number;
  /**
   * 맵이 바꾼 손님 유형 비중과 경관 보너스 (§4.5).
   *
   * 없으면 맵 특성이 없는 것으로 본다 — 기존 호출자 호환. 맵이 손님 구성을 바꾸는 것이
   * "맵이 달라도 최적 빌드가 비슷하다"를 막는 장치다.
   */
  mapShares?: Partial<Record<GroupId, number>>;
  mapSceneryBonus?: number;
  /**
   * 직원 효과 (§11). 없으면 직원이 없는 것으로 본다 — 기존 호출자 호환.
   *
   * ⚠ 여기도 `WeekRunner` 안에 직원 규칙을 넣지 않는다. `staff.ts` 가 해석하고
   * 여기는 **숫자 몇 개만** 받는다 (카드와 같은 규칙).
   */
  /**
   * 이번 주 사고 확률 (§12.1). `risk.accidentChance()` 가 준다.
   *
   * ⚠ **위험 단계가 아니면 0 이어야 한다** — 안전한데 사고가 나면 v4 가 없애기로 한
   * "RNG 세금"이다. 그 판정은 `risk.ts` 가 하고 여기는 숫자만 받는다.
   */
  accidentChance?: number;
  /** 코스 합계 (§7). 없으면 코스가 없는 것으로 본다 */
  courses?: { revenue: number; upkeep: number; riders: number };
  /**
   * 콤보 보너스 (S5). 없으면 콤보가 없는 것으로 본다 — 기존 호출자 호환.
   *
   * ⚠ 여기도 **숫자 둘만** 받는다 (카드·직원·코스와 같은 규칙, 불변식 3).
   * 73종의 판정도, 티어 체감도, 면적 배율도, 총합 상한도 전부 `combos.ts` 가
   * 소유한다 (`comboEffect`). `WeekRunner` 안에 콤보 규칙을 넣으면 콤보를 하나
   * 추가할 때마다 시뮬을 고쳐야 하고, 그게 불변식 3 이 막으려던 상태다.
   *
   * `satisfactionDelta` 는 퇴장 만족도에 **더하고**, `revenueMult` 는 공원 매출에
   * **곱한다** (입장료·코스 제외 — 아래 finish() 참고).
   */
  combos?: { satisfactionDelta: number; revenueMult: number };
  /**
   * **지금 지을 수 있는 시설 id** — 해금(등급 + 사건)과 도구 해금을 이미 통과한 것들.
   *
   * 병목이 쓴다. 안 주면 "해금을 안 본다"로 본다 (기존 호출자 호환).
   *
   * ⚠ 여기서도 해금 **규칙**을 안 만든다 (카드·직원·콤보와 같은 규칙, 불변식 3).
   * "지을 수 있나"의 정본은 `unlocks.isUnlocked` 하나이고 (K41), 여기는 그 답만 받는다 —
   * 규칙을 두 곳에 두면 결산이 "지을 수 있다"고 말한 것을 건설 시트가 거부한다.
   *
   * ⚠ 이게 없으면 병목이 **막다른 길**을 가리킬 수 있다. 1등급 판에서 온열(최소 2등급)·
   * 숙박(최소 3등급)은 공급이 0 이지만 지을 방법이 없다 — 조언이 아니라 소음이다.
   */
  buildable?: readonly string[];
  /**
   * 지금 등급 (P3-C). 결산이 `admission` 을 채우는 데만 쓴다 — 안 주면 "상한을 모른다"로
   * 본다 (기존 호출자 호환: 헤드리스 봇은 자기 `capped` 판정을 이미 갖고 있다).
   *
   * ⚠ 여기서 등급 **규칙**을 만들지 않는다 (카드·직원·콤보와 같은 규칙, 불변식 3).
   * 상한 계산은 `progress.admissionLimit` 하나가 소유하고, 이 파일은 그 함수를 부른다.
   */
  grade?: GradeDef;
  staff?: {
    wages: number;
    satisfactionDelta: number;
    foodMult: number;
    /** 이번 주에 선 시설 handle */
    idle: ReadonlySet<number>;
  };
  /**
   * 주간 의사결정 카드가 만든 수정치. 없으면 중립.
   *
   * ⚠ 카드 효과를 `WeekRunner` 안에 넣지 않는다 — 카드는 데이터고 그 해석은
   * `cards.ts` 가 소유한다. 여기는 **숫자 몇 개만** 받는다. 안 그러면 카드를 추가할 때
   * 시뮬을 고쳐야 하고, 그게 불변식 3 이 막으려던 상태다.
   */
  modifiers?: {
    arrivalMult: number;
    revenueMult: number;
    crowdMult: number;
    satisfactionDelta: number;
    reputationDelta: number;
    accidentMult: number;
    closed: boolean;
  };
}

export interface WeekSnapshot {
  week: number;
  cash: number;
}

/**
 * 돈이 **어디서** 들어왔나 (K48). 렌더가 `+₩N` 을 그 자리에 띄우는 데만 쓴다.
 *
 * ⚠ 이것은 **평문 데이터**다 — sim 은 렌더러를 모른다 (불변식 1). 관찰자는 콜백 하나로
 * 받아 가고, 안 붙이면 아래 관찰 코드는 **한 줄도 돌지 않는다** (헤드리스 밸런싱이
 * 손님 수만큼 느려지면 안 된다).
 */
export interface IncomeEvent {
  /** 입장권인가 (매표소) 시설 이용료인가 */
  kind: 'admission' | 'facility';
  /** 시설 handle. 수영 구역은 `ZONE_HANDLE_BASE` 이상이다 */
  handle: number;
  /** 돈이 난 자리 — 시설은 발자국 좌상단, 구역은 첫 칸 */
  i: number;
  j: number;
  /** 원 (요금 배율·날씨까지 반영된 실제 금액) */
  amount: number;
}

export class WeekRunner {
  private weekNo = 0;
  /** 이번 주 요금 배율 — `run` 이 매주 설정한다 */
  private priceMult = 1;
  /**
   * 정류장 버스 (K36-B③). **주 루프가 소유한다** — 버스는 손님을 만들지 않고
   * "지금 태울 수 있나"만 답하므로, 스폰과 같은 시계를 쓰려면 여기 있어야 한다.
   * 렌더가 자기 시계로 굴리면 버스가 떠난 뒤에 손님이 나타난다.
   */
  readonly bus = new BusRunner();
  private money = 5_000_000;

  /**
   * 벽은 받지 않는다 — 도달 검사는 **배치 시점**에 이미 하므로 결산에서 다시 볼 필요가
   * 없다. 안 쓰는 의존을 들고 있으면 나중에 "여기서도 도달을 봐야 하나" 를 매번 다시
   * 생각하게 된다.
   */
  constructor(
    private readonly terrain: KairoTerrain,
    private readonly placement: PlacementGrid,
    private readonly guests: GuestStore,
  ) {}

  get week(): number {
    return this.weekNo;
  }

  get cash(): number {
    return this.money;
  }

  /**
   * 건설비를 낸다. 돈이 부족하면 **아무것도 하지 않고** false —
   * 잔액을 마이너스로 두면 "빚"이라는 규칙이 생기고, 그건 넣지 않기로 한 시스템이다.
   *
   * ⚠ 이게 없던 동안 헤드리스 봇만 돈을 쓰고 **UI 는 시설을 공짜로 지었다.**
   * 밸런싱한 건설비 곡선이 실제 플레이에는 없었다는 뜻이다.
   */
  spend(amount: number): boolean {
    if (amount > this.money) return false;
    this.money -= amount;
    return true;
  }

  /** 철거 환급·의뢰 보상 등 */
  earn(amount: number): void {
    this.money += amount;
  }

  toSnapshot(): WeekSnapshot {
    return { week: this.weekNo, cash: this.money };
  }

  /** 세이브에서 복원 — 지형·시설은 호출자가 이미 복원해 넣는다 */
  restore(s: WeekSnapshot): void {
    this.weekNo = s.week;
    this.money = s.cash;
  }

  /**
   * 시설 구성이 채우는 수요 — 종류별 총 용량.
   *
   * ⚠ 정원은 **`placement.capacityOf`** 다 (`def.capacity` 가 아니다). 그것이 손님
   * 슬롯의 정본이고 회전 특화(P1.5, 정원 +1)가 반영된 값이다. `def.capacity` 를 직접
   * 읽던 동안에는 **슬롯은 늘었는데 병목 진단은 옛 정원**이라, 회전 특화를 골라도
   * 결산이 "자리가 모자란다"를 그대로 말했다 — 플레이어가 고른 것이 화면에 안 나타났다.
   * 이 값은 `admissionLimit` 의 `공급×1.5` 로도 흘러가므로 정본이 갈리면 입장 상한까지
   * 갈라진다.
   */
  supply(idle?: ReadonlySet<number>): Record<NeedKind, number> {
    const out = {} as Record<NeedKind, number>;
    for (const item of this.placement.all()) {
      // 선 시설은 공급이 아니다 — 병목 계산이 "있는데 왜 부족하지"가 되면 안 된다
      if (idle?.has(item.handle)) continue;
      const def = facilityDef(item.defId);
      if (!def) continue;
      const need = (def as { need?: NeedKind }).need;
      if (!need) continue;
      out[need] = (out[need] ?? 0) + Math.max(1, this.placement.capacityOf(item.handle));
    }
    return out;
  }

  /** 전체 요금 중 식음이 차지하는 몫 — 매점직원 부족을 식음에만 물리기 위해 */
  private foodShare(): number {
    let food = 0;
    let all = 0;
    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId);
      if (!def) continue;
      all += def.fee;
      if ((def as { need?: string }).need === 'food') food += def.fee;
    }
    return all === 0 ? 0 : food / all;
  }

  /**
   * 이번 주 유지비 (주 단위). 비수기에는 **여름 전용 시설**의 유지비가 줄어든다 —
   * 세워두기 때문이다 (`OFFSEASON_UPKEEP`).
   */
  weeklyUpkeep(season: Season = 'summer'): number {
    const off = OFFSEASON_UPKEEP[season];
    const active = ACTIVE_NEEDS[season];
    let n = 0;
    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId);
      if (!def) continue;
      const need = (def as { need?: NeedKind }).need;
      // 수요가 없는 시설(장식 등)은 계절과 무관하게 전액 — 세워둘 것도 없다
      const mothballed = active !== null && need !== undefined && !active.has(need);
      n += def.upkeep * (mothballed ? off : 1);
    }
    return Math.round(n);
  }

  /**
   * 한 주를 돌린다. `begin → step(전부) → finish` 의 합성이다 (K39).
   *
   * 헤드리스·골든·밸런싱은 전부 이걸 쓴다. 흐름 모드(분할 step)와 결과가 같다는 것은
   * `week-identity.test.ts` 의 항등 검사가 지킨다 — 그 검사가 깨져 있으면 흐름 모드를
   * 켜면 안 된다.
   */
  run(rng: Rng, opts: WeekOptions = {}): WeekReport {
    this.begin(rng, opts);
    this.step(TICKS_PER_WEEK);
    return this.finish();
  }

  /** 진행 중인 주 — begin() 이 만들고 finish() 가 비운다. 렌더는 프레임마다 나눠 소비한다 */
  private live: LiveWeekState | null = null;

  /**
   * 항등 검사의 음성 대조군 (테스트 전용).
   *
   * 켜면 **두 번째 step 호출**에서만 rng 를 한 번 더 뽑는다 — run() 은 step 을 한 번만
   * 부르므로 영향이 없고, 분할 실행만 어긋난다. 항등 검사가 정말 비교하고 있다는 것을
   * 이걸로 증명한다 (새 검사는 위반을 주입해 잡히는지 먼저 본다).
   */
  private identityFaultForTest = false;
  setIdentityFaultForTest(on: boolean): void {
    this.identityFaultForTest = on;
  }

  /**
   * 병목 검사의 음성 대조군 (테스트 전용).
   *
   * 켜면 후보를 **예전 로직**으로 되돌린다 — `Object.keys(supply)`, 즉 **지어진 종류만**.
   * 그러면 공급 0 인 종류는 후보에 못 들고, "스릴 0개인 판에서 스릴을 가리킨다"가
   * 반드시 실패한다.
   *
   * ⚠ 대조군은 **코드에** 둔다 (이 저장소 규칙: `setRenderFaultForTest`·
   * `setIdentityFaultForTest` 와 같은 자리). 손으로 한 번 되돌려 확인한 것은 다음
   * 사람에게 안 남고, 그러면 검사가 조용히 통과하는 상태로 되돌아간다.
   */
  private bottleneckFaultForTest = false;
  setBottleneckFaultForTest(on: boolean): void {
    this.bottleneckFaultForTest = on;
  }

  /**
   * 차액 정산의 음성 대조군 (테스트 전용).
   *
   * 켜면 `finish()` 가 **이미 실시간으로 넣은 돈을 안 뺀다** — 즉 이중 계산이 된다.
   * "주간 총액이 예전과 같다" 검사가 정말 총액을 재고 있는지를 이걸로 증명한다.
   */
  private doubleCountFaultForTest = false;
  setDoubleCountFaultForTest(on: boolean): void {
    this.doubleCountFaultForTest = on;
  }

  /**
   * 수입 사건 관찰자 (K48) — 붙이면 tick 마다 "어느 시설에서 얼마"를 받는다.
   *
   * ⚠ **없으면 아무 일도 안 한다.** 관찰에는 손님 전수 스캔이 하나 더 붙으므로,
   * 헤드리스 밸런싱(312주 × 840tick)에는 절대 붙이지 않는다. 붙이는 곳은 씬 하나다.
   */
  private incomeObserver: ((events: readonly IncomeEvent[]) => void) | null = null;
  setIncomeObserver(fn: ((events: readonly IncomeEvent[]) => void) | null): void {
    this.incomeObserver = fn;
    this.usingPrev.clear();
  }

  /**
   * 손님 id → 직전 tick 에 이용 중이던 시설 handle.
   *
   * ⚠ 이용 **완료**는 `guests.ts` 안에서만 일어나고 밖으로 새어 나오지 않는다
   * (`releaseSlot` 이 `usingHandle` 을 0 으로 지운다). 그래서 밖에서는 "직전엔 H 였는데
   * 지금은 아니다"로 알아낸다 — 관찰자가 붙었을 때만 유지한다.
   */
  private readonly usingPrev = new Map<number, number>();

  /**
   * 진행 중인 주를 **버린다** (도구·하네스 전용). 돈·주차에 아무 흔적도 남기지 않는다 —
   * 하네스가 `run()` 으로 배치 주를 돌리기 전에 흐르는 낮의 주를 치우는 용도다.
   * 게임 로직에서 부르면 반 주가 조용히 증발하므로 production 경로에는 넣지 말 것.
   */
  abort(): void {
    /*
     * ⚠ **실시간으로 넣은 돈을 되돌린다** (K48). 안 되돌리면 "아무 흔적도 안 남긴다"가
     * 거짓이 되고, 하네스가 흐르는 낮의 반 주를 치울 때마다 현금이 조금씩 늘어난다 —
     * 그 판으로 잰 숫자는 게임과 다른 세계가 된다.
     */
    if (this.live) this.money -= this.live.credited;
    this.live = null;
  }

  /** 닫힌 하루들의 결산 — 흐름 모드가 하루 끝 토스트에 쓴다 (읽기 전용) */
  liveDays(): readonly DayReport[] | null {
    return this.live ? this.live.days : null;
  }

  /** 지금 진행 중인 날의 날씨 (K46 헤더) — 하루가 열리기 전이면 null */
  liveWeather(): Weather | null {
    return this.live?.day?.weather ?? null;
  }

  /** 흐름 모드가 읽는 진행 상태 — 요일 표기·주 마디 판정용 */
  liveProgress(): { tick: number; day: number; done: boolean } | null {
    if (!this.live) return null;
    return {
      tick: this.live.tick,
      day: Math.min(DAYS_PER_WEEK - 1, Math.floor(this.live.tick / TICKS_PER_DAY)),
      done: this.live.tick >= TICKS_PER_WEEK,
    };
  }

  /** 주 시작 — 사고 판정·직원 배치·요금 배율 등 "주에 한 번" 일들 */
  begin(rng: Rng, opts: WeekOptions = {}): void {
    // 겹쳐 부르면 앞의 주가 소리 없이 사라진다 — 명시적으로 막는다
    if (this.live) throw new Error('week already in progress — finish() first');
    const season = opts.season ?? 'summer';
    const w = this.terrain.width;
    const h = this.terrain.height;

    this.priceMult = opts.priceMult ?? 1;
    const staff = opts.staff;
    /*
     * 사고 판정 — **주 시작에 한 번**. 사고가 나면 시설 하나가 1~3주 닫힌다.
     *
     * 손님 시뮬 도중이 아니라 주 시작에 굴리는 이유는 결산에서 "이번 주에 사고가 났다"를
     * 한 덩어리로 보여주기 위해서다. tick 중간에 나면 그 주 결과가 반쯤 섞인다.
     */
    /*
     * ⚠ **독립 스트림에서 굴린다** (불변식 2). 공유 `rng` 에서 뽑으면 사고가 났느냐에 따라
     * 뽑기 3회가 있고 없고가 갈려서, 그 뒤의 **날씨 시퀀스가 통째로 밀린다.** 그러면
     * "사고만 다른 두 판"을 만들 수 없다 — 실제로 사고 대조 테스트가 서로 다른 주를
     * 비교하고 있었고, 사고 난 쪽 매출이 더 높게 나왔다 (202,360 vs 191,680).
     * 우연히 통과하다 버스 위상이 한 tick 바뀌자 드러났다 (K36-B③).
     */
    let accident: WeekReport['accident'] = null;
    const chance = opts.accidentChance ?? 0;
    const arng = rng.fork(0xacc1);
    if (chance > 0 && arng.next() < chance) {
      const pool = this.placement.all();
      if (pool.length > 0) {
        const hit = pool[arng.int(pool.length)] as { handle: number; defId: string };
        accident = { handle: hit.handle, defId: hit.defId, weeks: 1 + arng.int(3) };
      }
    }
    const idle = new Set(staff?.idle ?? []);
    if (accident) idle.add(accident.handle);
    this.guests.setIdle(idle);

    this.live = {
      rng,
      opts,
      season,
      profile: SEASON_PROFILE[season],
      playbackEvery: opts.playbackEvery ?? 0,
      heat: new Array<number>(w * h).fill(0),
      days: [],
      playback: [],
      supply: this.supply(idle),
      /*
       * 선 시설을 **빼지 않은** 공급 — 병목 문구가 "하나도 없다"를 말해도 되는지 판정한다.
       *
       * ⚠ 사고로 하나뿐인 사우나가 닫힌 주는 `supply.warm` 이 0 이다. 그걸 "온열 시설이
       * 하나도 없습니다" 라고 말하면 **거짓말**이다 — 있고, 이번 주에 쉬었을 뿐이다.
       * 순위는 그대로 `supply` 로 매긴다 (쉬는 시설은 이번 주 공급이 아니다).
       */
      built: this.supply(),
      accident,
      byGroup: { family: 0, couple: 0, friends: 0, company: 0 },
      weekRevenue: 0,
      weekAdmission: 0,
      credited: 0,
      tick: 0,
      stepCalls: 0,
      day: null,
    };
  }

  /**
   * tick 을 최대 `n` 개 소비하고, 실제 소비한 수를 돌려준다 (주가 끝났으면 0).
   *
   * 하루의 열고 닫음은 여기서 **게으르게** 일어난다 — 날씨 뽑기(rng)가 그 날의 첫 tick
   * 을 소비하는 시점에 일어나야 run() 과 뽑기 순서가 한 점도 다르지 않다.
   */
  step(n: number): number {
    const lw = this.live;
    if (!lw) throw new Error('step() before begin()');
    lw.stepCalls++;
    if (this.identityFaultForTest && lw.stepCalls === 2) lw.rng.next();
    const { rng, opts } = lw;
    const mod = opts.modifiers;
    const w = this.terrain.width;
    let used = 0;

    while (used < n && lw.tick < TICKS_PER_WEEK) {
      const t = lw.tick % TICKS_PER_DAY;
      if (lw.day === null) {
        // ── 하루 열기 ────────────────────────────────────────────────────
        const dayNo = Math.floor(lw.tick / TICKS_PER_DAY);
        const weather = rng.pick(lw.profile.weather);
        const weekendBoost = WEEKEND.includes(dayNo) ? 1.6 : 1.0;
        // 시설이 조금 끌어당기고, 나머지는 평판이 결정한다
        const facilityPull = 1 + Math.min(0.6, this.placement.count * 0.015);
        // 평판 델타는 **더한다** — 배수로 곱하면 등급 배율과 섞여 어느 쪽이 움직였는지 못 본다
        const reputation = Math.max(0.1, (opts.reputation ?? 1) + (mod?.reputationDelta ?? 0));
        const arrivalMult = mod?.closed ? 0 : (mod?.arrivalMult ?? 1);
        const arrivalRate =
          lw.profile.arrivalBase * weekendBoost * facilityPull * reputation * arrivalMult;
        const baseTicks = opts.arrivalBaseTicks ?? 10;
        /**
         * ⚠ 간격을 정수 tick 으로 반올림하면 **1 에서 바닥을 친다** — 그 위로는 수요를
         * 아무리 올려도 하루 120명이 상한이 된다 (실측). 누적기로 소수 비율을 그대로 쓴다.
         */
        const perTick = arrivalRate / baseTicks;
        lw.day = {
          no: dayNo,
          weather,
          perTick,
          before: this.guests.stats(),
          arrivals: 0,
          visitors: 0,
          turnedAway: 0,
          noTicket: 0,
          peak: 0,
          revenue: 0,
          admission: 0,
          arrivalAcc: 0,
        };
      }
      const d = lw.day;

      /*
       * ⚠ **버스가 서 있을 때만 손님이 내린다** (K36-B③).
       *
       * 수요는 예전처럼 매 tick 쌓이지만(`arrivalAcc`), 실제로 내리는 것은 정차 중에
       * 몰아서 한다. 그래야 "손님이 어디서 오는가"가 화면에 남는다 — 허공에서 솟으면
       * 정류장은 그냥 회색 칸이다.
       *
       * ⚠ **주간 총 도착 수는 그대로 두고 분포만 바꾼다.** 하루 끝에 남은 수요는
       * 그날 안에 털어 낸다 (`t === TICKS_PER_DAY - 1`) — 안 그러면 버스 시간표가
       * 조용히 수요를 깎아, 밸런스가 왜 움직였는지 못 가린다.
       */
      d.arrivalAcc += d.perTick;
      // 버스 시계 = 주 루프 시계. 흐름 모드가 담는 tick 과 같아야 연출이 안 어긋난다
      this.bus.setElapsed(lw.tick);
      const lastTick = t === TICKS_PER_DAY - 1;
      const dropping = this.bus.state.atStop || lastTick;
      while (dropping && d.arrivalAcc >= 1) {
        d.arrivalAcc -= 1;
        d.arrivals++;
        /*
         * ⚠ **`spawn` 성공은 입장이 아니다** (K36-B②). 손님은 정류장에 내릴 뿐이고,
         * 매표소를 지나야 입장이다. 그래서 `visitors`·`byGroup` 은 아래 `takeAdmitted`
         * 가 센다. 여기서 세면 매표소가 없는 판이 "입장 129명 · 매출 0" 으로 보인다.
         */
        if (!this.guests.spawn(rng, lw.season, opts.mapShares)) d.turnedAway++;
      }
      /*
       * 나이트풀 (S4) — 저녁(하루의 마지막 20%)에 DJ 부스가 붙은 수영장이 있으면
       * 수영 만족 보너스. tick 의 순수 함수라 항등(run ≡ step)이 유지된다.
       */
      this.guests.swimBoost =
        t >= TICKS_PER_DAY * 0.8 &&
        nightPools(
          this.guests.swimZones(),
          this.placement
            .all()
            .filter((it) => it.defId === 'dj_booth')
            .map((it) => ({ x: it.i, y: it.j })),
        ) > 0;
      this.guests.tick(rng);
      // 이용이 끝난 손님만큼 요금을 받는다 (이용 시작이 아니라 완료 기준)
      const feeIn = this.collectFees(d.weather);
      d.revenue += feeIn;
      // 표를 산 손님만큼 입장료를 받는다 — 요금 슬라이더가 같이 민다
      const adm = this.guests.takeAdmitted();
      d.visitors += adm.count;
      d.noTicket += adm.noTicket;
      for (const k of Object.keys(lw.byGroup) as GroupId[]) lw.byGroup[k] += adm.byGroup[k];
      const admIn = Math.round(adm.fee * this.priceMult);
      d.admission += admIn;
      d.revenue += admIn;

      /*
       * ── 실시간 입금 (K48) ────────────────────────────────────────────────
       *
       * 사용자 보고: "하루 버튼이 없으니 돈이 아예 안 오른다." 맞다 — 예전에는 수입이
       * 누산기에만 쌓이고 현금은 `finish()` 한 곳에서만 움직였다. K47-② 로 하루»/주
       * 스킵을 없앤 뒤로는 플레이어가 **한 주 내내(≈3분) 현금이 붙박인 것**을 본다.
       *
       * ⚠ **총액은 한 원도 안 바뀐다.** 여기서 넣은 만큼 `lw.credited` 에 적어 두고,
       * `finish()` 가 `최종 주간 수입 − credited` 만 정산한다 (차액 정산). 배율
       * (매점직원·카드 `revenueMult`·콤보)은 주가 끝나야 확정되는 값이라 여기서
       * 곱할 수 없다 — 곱하면 배율이 두 번 붙거나, 주 중간에 바뀐 배율이 이미 지급한
       * 돈에 소급되지 않아 총액이 갈라진다. 그래서 tick 은 **그 시점에 확정된 금액**
       * (요금 배율·날씨까지)만 넣고, 배율의 차액은 결산에서 한 번에 붙는다.
       */
      const tickIn = feeIn + admIn;
      if (tickIn !== 0) {
        this.money += tickIn;
        lw.credited += tickIn;
      }

      const obs = this.incomeObserver;
      if (obs) {
        // 관찰자가 붙었을 때만 도는 길이다 — 헤드리스는 여기 안 들어온다
        const events = this.incomeEvents(feeIn, admIn);
        if (events.length > 0) obs(events);
      }

      for (const g of this.guests.all) {
        const k = g.j * w + g.i;
        if (k >= 0 && k < lw.heat.length) lw.heat[k] = (lw.heat[k] as number) + 1;
      }
      d.peak = Math.max(d.peak, this.guests.count);

      if (lw.playbackEvery > 0 && lw.tick % lw.playbackEvery === 0) {
        lw.playback.push({
          tick: lw.tick,
          guests: this.guests.all.map((g) => ({
            i: g.i,
            j: g.j,
            fromI: g.fromI,
            fromJ: g.fromJ,
            pose: g.pose,
            facing: g.facing,
            palette: g.palette,
          })),
        });
      }

      lw.tick++;
      used++;

      if (lastTick) {
        // ── 하루 닫기 ────────────────────────────────────────────────────
        const after = this.guests.stats();
        const dayExited = after.exited - d.before.exited;
        const daySat =
          dayExited > 0
            ? (after.exitSatisfaction * after.exited -
                d.before.exitSatisfaction * d.before.exited) /
              dayExited
            : 0;
        const dayUpkeep = Math.round(this.weeklyUpkeep(lw.season) / DAYS_PER_WEEK);
        lw.days.push({
          day: d.no,
          name: DAY_NAMES[d.no] as string,
          weather: d.weather,
          arrivals: d.arrivals,
          visitors: d.visitors,
          turnedAway: d.turnedAway,
          noTicket: d.noTicket,
          revenue: d.revenue,
          admission: d.admission,
          upkeep: dayUpkeep,
          peak: d.peak,
          exitSatisfaction: daySat,
          gaveUp: after.gaveUp - d.before.gaveUp,
        });
        lw.weekRevenue += d.revenue;
        lw.weekAdmission += d.admission;
        lw.day = null;
      }
    }
    return used;
  }

  /** 주 마감 — 840 tick 이 다 소비된 뒤에만. 결산을 만들고 진행 상태를 비운다 */
  finish(): WeekReport {
    const lw = this.live;
    if (!lw) throw new Error('finish() before begin()');
    if (lw.tick < TICKS_PER_WEEK || lw.day !== null) {
      throw new Error(`finish() with ${lw.tick}/${TICKS_PER_WEEK} ticks — step() the rest first`);
    }
    const { opts, season, days } = lw;
    const staff = opts.staff;
    const mod = opts.modifiers;
    const w = this.terrain.width;
    const h = this.terrain.height;
    let weekRevenue = lw.weekRevenue;
    const weekAdmission = lw.weekAdmission;

    // 매점직원이 모자라면 식음 매출이 떨어진다. 전체가 아니라 **식음 몫만** 깎아야
    // "직원을 왜 쓰나"가 종류별 판단이 된다 — 근사로 전체의 식음 비중만큼만 곱한다
    if (staff && staff.foodMult !== 1) {
      const foodShare = this.foodShare();
      const factor = 1 - foodShare * (1 - staff.foodMult);
      /*
       * ⚠ **입장료는 빼고 곱한다.** 매점직원이 모자라면 매점 매출이 떨어지지, 표가 덜
       * 팔리지는 않는다. 섞으면 `admission = 입장객 × 정가 × 요금배율` 이라는 검사 가능한
       * 성질이 깨지고, 결산의 입장료 줄이 "왜 이 숫자인지" 설명할 수 없는 값이 된다.
       */
      weekRevenue = Math.round((weekRevenue - weekAdmission) * factor) + weekAdmission;
      for (const d of days) {
        d.revenue = Math.round((d.revenue - d.admission) * factor) + d.admission;
      }
    }
    if (mod?.revenueMult !== undefined && mod.revenueMult !== 1) {
      /*
       * 카드의 매출 배율도 **공원 안에서 쓴 돈**에만 붙는다 (위 식음 배율과 같은 이유).
       * 표값은 플레이어가 슬라이더로 정하는 값이지 카드가 흔드는 값이 아니다.
       */
      weekRevenue = Math.round((weekRevenue - weekAdmission) * mod.revenueMult) + weekAdmission;
      for (const d of days) {
        d.revenue = Math.round((d.revenue - d.admission) * mod.revenueMult) + d.admission;
      }
    }

    /*
     * 콤보 매출 보너스 (S5). 카드 배율과 **같은 자리·같은 규칙**이다 — 입장료를 빼고
     * 곱한다.
     *
     * ⚠ 왜 입장료를 빼나: `admission = 입장객 × 정가 × 요금배율` 이라는 검사 가능한
     * 성질을 지키기 위해서다 (위 카드 배율 주석과 같은 이유). 콤보는 "공원 안에서
     * 손님이 더 많이 쓴다"는 효과지, 표가 더 비싸지는 효과가 아니다.
     *
     * ⚠ 왜 코스 매출은 빼나: 코스는 **장비×프리셋 적합도**라는 자기 축을 이미 갖는다
     * (v2 결정). 콤보 배율까지 얹으면 같은 것을 두 번 세게 되고, 코스가 비수기 손익을
     * 떠받치는 문제(아래 `courseSeason` 주석)를 더 키운다. 그래서 곱하기는 코스 매출을
     * 더하기 **전**에 끝낸다.
     */
    const comboRevMult = opts.combos?.revenueMult ?? 1;
    if (comboRevMult !== 1) {
      weekRevenue = Math.round((weekRevenue - weekAdmission) * comboRevMult) + weekAdmission;
      for (const d of days) {
        d.revenue = Math.round((d.revenue - d.admission) * comboRevMult) + d.admission;
      }
    }

    /*
     * 코스 매출은 **손님 시뮬과 별도로** 더한다. 코스 탑승은 선착장에서 일어나고 손님은
     * 개체로 물 위를 돌지 않는다 — 돌게 하면 1,200명 × 스플라인 추적이 되고, 그 비용은
     * "손님이 노는 광경"이 주는 값보다 크다 (배는 스프라이트로 돈다).
     */
    /*
     * 코스 매출은 **계절을 탄다** — 손님이 안 오는데 배만 도는 것은 이상하고, 그대로 두면
     * 코스가 비수기 손익을 통째로 떠받쳐 "겨울에는 무엇을 할까"가 사라진다 (실측: 코스를
     * 넣자 겨울 손익이 +2% 로 평평해졌다). 유지비는 계절과 무관하다 — 장비는 세워둬도 돈이 든다.
     */
    const courseSeason = lw.profile.arrivalBase;
    const courseRevenue = mod?.closed
      ? 0
      : Math.round((opts.courses?.revenue ?? 0) * courseSeason);
    const courseUpkeep = opts.courses?.upkeep ?? 0;
    weekRevenue += courseRevenue;

    const upkeep = this.weeklyUpkeep(season) + courseUpkeep;
    /*
     * 인건비는 **고정비**다 — 손님이 0명인 주에도 나간다. 그게 "겨울에 몇 명을 남길까"를
     * 판단으로 만든다 (§11 의 설계 의도).
     */
    const wages = staff?.wages ?? 0;
    /*
     * ── 차액 정산 (K48) ─────────────────────────────────────────────────
     *
     * 수입은 이미 tick 마다 들어갔다 (`step()` 의 실시간 입금). 여기서는 **최종 주간
     * 수입에서 이미 준 것을 빼고** 나머지만 정산한다. 그러면
     *
     *     최종 현금 = 시작 + Σtick + (weekRevenue − Σtick) − upkeep − wages
     *              = 시작 + weekRevenue − upkeep − wages          ← 예전과 완전히 같다
     *
     * 이고, 실시간으로 못 붙인 것(배율의 차액·코스 매출)이 결산에서 한 번에 붙는다.
     * 차액이 음수일 수도 있다 — 매점직원 부족(`foodMult < 1`)은 이미 준 돈을 되돌린다.
     *
     * ⚠ **지출(유지비·인건비)은 여기 그대로 둔다.** 둘 다 "주에 한 번 나가는" 성격이고
     * (인건비는 손님이 0명인 주에도 나가는 고정비다), 결산이 그것을 한 줄로 보여준다.
     * tick 마다 1/840 씩 깎으면 화면에서는 **원인 없이 줄어드는 숫자**가 된다 —
     * 이번 버그가 정확히 그 반대(원인 없이 안 오르는 숫자)라 같은 실수를 반복하게 된다.
     * 수입은 사건(손님이 표를 산다)이 있어 자리를 가리킬 수 있지만 유지비는 없다.
     */
    const settle = weekRevenue - (this.doubleCountFaultForTest ? 0 : lw.credited);
    this.money += settle - upkeep - wages;
    this.weekNo++;

    // 히트맵 최고점
    let hotspot: WeekReport['hotspot'] = null;
    for (let k = 0; k < lw.heat.length; k++) {
      const v = lw.heat[k] as number;
      if (v > 0 && (!hotspot || v > hotspot.value)) {
        hotspot = { i: k % w, j: ((k - (k % w)) / w) | 0, value: v };
      }
    }

    const bottleneck = pickBottleneck(lw, days, this.bottleneckFaultForTest);
    const admissionCap = admissionState(opts.grade, this.placement.totalCapacity());

    const totalExited = days.reduce((a, d) => a + (d.exitSatisfaction > 0 ? 1 : 0), 0);
    this.live = null;
    return {
      week: this.weekNo,
      season,
      days,
      arrivals: days.reduce((a, d) => a + d.arrivals, 0),
      visitors: days.reduce((a, d) => a + d.visitors, 0),
      turnedAway: days.reduce((a, d) => a + d.turnedAway, 0),
      noTicket: days.reduce((a, d) => a + d.noTicket, 0),
      revenue: weekRevenue,
      admission: weekAdmission,
      upkeep,
      wages,
      courseRevenue,
      courseRiders: mod?.closed ? 0 : Math.round((opts.courses?.riders ?? 0) * courseSeason),
      // 받은 것을 그대로 돌려준다 (P2-B) — 결산이 **적용된 값 그 자체**를 보여주게
      combos: opts.combos ?? null,
      profit: weekRevenue - upkeep - wages,
      /*
       * 만족도 델타는 **평균에 더한다**. 손님 개체마다 더하면 그 손님이 다음 주까지
       * 남아 델타가 두 번 먹는다 — 카드 효과는 그 주의 경험이지 손님의 성격이 아니다.
       *
       * 콤보 만족 보너스(S5)도 같은 자리다. 손님별(`guests.ts`)에 얹지 않는 이유는
       * 위와 같다 — 콤보는 **그 주의 배치가 만든 경험**이고, 주가 바뀌면 배치도 바뀐다.
       * 여기 얹으면 퇴장 만족도 → 평판 → 등급 → 수요 사슬을 그대로 탄다 (설계 불변식:
       * "평판의 기반은 퇴장 만족도"). 그 사슬이 세지 않도록 `comboEffect` 가 총합을
       * 포화시킨다 — 여기서 다시 자르지 않는다 (규칙이 두 곳에 있으면 갈라진다).
       */
      exitSatisfaction:
        totalExited === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                100,
                days.reduce((a, d) => a + d.exitSatisfaction, 0) / totalExited +
                  (mod?.satisfactionDelta ?? 0) +
                  (staff?.satisfactionDelta ?? 0) +
                  (opts.combos?.satisfactionDelta ?? 0) +
                  priceSatisfaction(this.priceMult) +
                  (opts.mapSceneryBonus ?? 0) +
                  (this.placement.averageLevel() - 1) * LEVEL_SATISFACTION,
              ),
            ),
      gaveUp: days.reduce((a, d) => a + d.gaveUp, 0),
      heat: lw.heat,
      heatW: w,
      heatH: h,
      hotspot,
      bottleneck,
      admissionCap,
      playback: lw.playback,
      byGroup: lw.byGroup,
      accident: lw.accident,
    };
  }


  /**
   * 요금 징수 — 이용이 **끝난** 손님 수만큼. 날씨가 수요 구성을 바꾸므로 그 종류의
   * 시설은 요금을 더 받는다 (비 오는 날 카페가 붐빈다).
   */
  private collectFees(weather: Weather): number {
    /*
     * ⚠ 두 번 고친 자리다.
     *
     * ① 예전에는 `usingBefore - usingNow` 로 "끝난 수"를 셌는데, 같은 tick 에 시작과
     *    종료가 겹치면 어긋난다 → 손님 쪽이 완료를 직접 센다.
     * ② 그 다음에는 **전체 시설의 평균 요금**을 썼다. 그러면 닫힌 시설도 평균에 들어가고,
     *    싼 시설이 닫히면 평균이 올라 매출이 **늘어난다** (실측: 사고로 구명함이 닫혔는데
     *    매출이 43.9만 → 46.7만). 이제 손님이 **실제로 이용한 시설의 요금**을 담아 온다.
     *
     * 날씨는 수요 종류 단위로 보정한다 (비 오는 날 카페가 붐빈다).
     */
    const fin = this.guests.takeFinished();
    if (fin.count === 0) return 0;
    const mods = WEATHER_DEMAND[weather];
    let total = 0;
    for (const [need, sum] of fin.feeByNeed) {
      total += sum * (mods[need as NeedKind] ?? 1);
    }
    return Math.round(total * this.priceMult);
  }

  /**
   * 이번 tick 의 수입을 **자리별로 쪼갠다** (K48) — `+₩N` 을 어디에 띄울지 정한다.
   *
   * ## 왜 손님을 훑어야 하나
   *
   * `takeFinished()` 는 **수요 종류별 합**만 준다 (`feeByNeed`) — 어느 시설인지는
   * `guests.ts` 안에서만 알고 밖으로 안 나온다. 그래서 "직전 tick 엔 H 를 쓰고 있었는데
   * 지금은 아니다" = 방금 끝났다로 밖에서 알아낸다 (`usingPrev`).
   *
   * ## 왜 금액을 다시 계산하지 않고 나누나
   *
   * 요금 공식(개선 단계 × 지갑 × 날씨 × 요금 배율 × 반올림)을 여기서 한 벌 더 쓰면
   * 규칙이 둘이 되고, 언젠가 화면의 합과 실제 수입이 갈라진다. 대신 **이미 확정된
   * tick 수입**(`feeIn`·`admIn`)을 가중치로 나눈다 — 합이 정확히 tick 수입이다.
   * 가중치는 `요금 단가 × 지갑` 이라 비싼 시설이 큰 숫자를 띄운다.
   */
  private incomeEvents(feeIn: number, admIn: number): IncomeEvent[] {
    const prev = this.usingPrev;
    const seen = new Set<number>();
    /** handle → 가중치 합 (시설) · 인원 (매표소) */
    const fee = new Map<number, number>();
    const gate = new Map<number, number>();
    let feeW = 0;
    let gateN = 0;
    for (const g of this.guests.all) {
      seen.add(g.id);
      const was = prev.get(g.id) ?? 0;
      const now = g.usingHandle;
      if (was === now) continue;
      if (now === 0) prev.delete(g.id);
      else prev.set(g.id, now);
      if (was === 0) continue;
      if (this.isGateHandle(was)) {
        gate.set(was, (gate.get(was) ?? 0) + 1);
        gateN += 1;
        continue;
      }
      const unit =
        was >= ZONE_HANDLE_BASE
          ? zoneFee(this.guests.swimZones()[was - ZONE_HANDLE_BASE])
          : this.placement.feeOf(was);
      const wt = Math.max(0.0001, unit * g.wallet);
      fee.set(was, (fee.get(was) ?? 0) + wt);
      feeW += wt;
    }
    // 나간 손님의 흔적을 지운다 — 안 지우면 id 가 영원히 쌓인다
    if (prev.size > 0) for (const id of [...prev.keys()]) if (!seen.has(id)) prev.delete(id);

    const out: IncomeEvent[] = [];
    this.spread(fee, feeW, feeIn, 'facility', out);
    this.spread(gate, gateN, admIn, 'admission', out);
    return out;
  }

  /** 매표소 handle 인가 — 입장권과 놀이 요금은 다른 사건이다 */
  private isGateHandle(handle: number): boolean {
    if (handle >= ZONE_HANDLE_BASE) return false;
    const it = this.placement.all().find((f) => f.handle === handle);
    return it?.defId === GATE_FACILITY_ID;
  }

  /**
   * 확정된 총액을 가중치대로 나눠 담는다. **나머지는 마지막 항목이 먹는다** — 반올림으로
   * 몇 원이 증발하면 화면의 합이 결산과 안 맞는다.
   */
  private spread(
    byHandle: ReadonlyMap<number, number>,
    totalWeight: number,
    amount: number,
    kind: IncomeEvent['kind'],
    out: IncomeEvent[],
  ): void {
    if (byHandle.size === 0 || amount <= 0 || totalWeight <= 0) return;
    let left = amount;
    let n = byHandle.size;
    for (const [handle, w] of byHandle) {
      n--;
      const give = n === 0 ? left : Math.round((amount * w) / totalWeight);
      left -= give;
      if (give <= 0) continue;
      const at = this.handlePos(handle);
      if (!at) continue;
      out.push({ kind, handle, i: at.i, j: at.j, amount: give });
    }
  }

  /** 시설·구역이 서 있는 자리 (없으면 null — 같은 tick 에 철거된 경우) */
  private handlePos(handle: number): { i: number; j: number } | null {
    if (handle >= ZONE_HANDLE_BASE) {
      const z = this.guests.swimZones()[handle - ZONE_HANDLE_BASE];
      const t = z?.tiles[0];
      return t ? { i: t.x, j: t.y } : null;
    }
    const it = this.placement.all().find((f) => f.handle === handle);
    if (!it) return null;
    // 발자국 **가운데**다 (소수 허용) — 좌상단이면 4×2 짜리에서 숫자가 모서리에 뜬다
    const def = facilityDef(it.defId);
    if (!def) return { i: it.i, j: it.j };
    const [fw, fd] = PlacementGrid.sizeOf(def, it.facing ?? 0);
    return { i: it.i + (fw - 1) / 2, j: it.j + (fd - 1) / 2 };
  }
}


/**
 * 이번 주에 **실제로 온 손님**이 종류마다 얼마나 원했나 (1.0 이 기준).
 *
 * `needBias` 는 목표 선택에서 **거리에 곱하는** 값이라 낮을수록 "멀어도 간다" = 더 원한다
 * (`groups.ts`). 그래서 뒤집어 쓴다 — 그대로 곱하면 가족이 많이 온 주에 "스릴을 지어라"가
 * 나온다 (가족의 스릴 편향은 1.6 = 가까울 때만 간다).
 *
 * 손님이 하나도 안 온 주는 전부 1.0 이다 — 온 사람이 없으면 편향도 없다.
 *
 * ## 왜 이걸 병목에 넣나
 *
 * 공급 0 인 종류가 여럿일 때 **무엇을 먼저** 가리킬지 규칙이 필요한데, 결산은 바로 위에
 * 손님 구성 막대를 이미 보여준다 (§10.4). "가족이 많이 왔는데 놀이 시설이 없다"가
 * 화면에서 이야기로 이어지려면 병목이 그 구성을 읽어야 한다 — 새 데이터를 하나도
 * 안 만든다.
 */
function groupAppetite(byGroup: Record<GroupId, number>): Record<NeedKind, number> {
  const out = {} as Record<NeedKind, number>;
  let total = 0;
  for (const g of GROUPS) total += byGroup[g.id] ?? 0;
  for (const need of NEED_KINDS) {
    if (total === 0) {
      out[need] = 1;
      continue;
    }
    let sum = 0;
    for (const g of GROUPS) sum += ((byGroup[g.id] ?? 0) / total) / needWeight(g, need);
    out[need] = sum;
  }
  return out;
}

/**
 * 병목 — **9종 전부**가 후보다.
 *
 * ## 후보에서 빼는 것은 둘뿐이다
 *
 * · **그 계절에 안 도는 종류** (`ACTIVE_NEEDS`). 겨울에 "스릴이 없습니다"는 조언이 아니라
 *   소음이다 — 겨울에 스릴 시설은 세워두고 유지비도 할인받는다 (`OFFSEASON_UPKEEP`).
 * · **아직 못 짓는 종류** (`opts.buildable`). 못 짓는 것을 가리키면 막다른 길이다.
 *
 * 날씨·손님 구성은 후보를 **빼지 않는다** — 배율이 0 이 되는 조합이 없기 때문이다
 * (비 오는 날 스릴은 0.5 지 0 이 아니다). 대신 **순서**를 정한다.
 *
 * ## 순서
 *
 * ① 공급 0 이 언제나 먼저다 — 충족률 0 은 어떤 부족보다 나쁘다
 * ② 공급 0 끼리는 **수요가 큰 쪽** (그 주 날씨 × 온 손님의 선호)
 * ③ 공급이 있는 것끼리는 예전 그대로 **수요/공급 비**
 * ④ 동점은 `NEED_KINDS` 순서 — 결정론이어야 한다 (불변식 2)
 */
function pickBottleneck(
  lw: LiveWeekState,
  days: readonly DayReport[],
  /** 음성 대조군 — 후보를 예전(`Object.keys(supply)`)으로 되돌린다 */
  legacyCandidates = false,
): WeekReport['bottleneck'] {
  const candidates = legacyCandidates ? (Object.keys(lw.supply) as NeedKind[]) : NEED_KINDS;
  const active = ACTIVE_NEEDS[lw.season];
  const appetite = groupAppetite(lw.byGroup);
  /*
   * 해금된 것들의 수요 종류. `undefined` 는 "해금을 안 본다" 이고 **빈 배열과 다르다** —
   * 빈 배열은 "지을 수 있는 것이 하나도 없다"라 병목이 null 이 된다.
   */
  const open =
    lw.opts.buildable === undefined
      ? null
      : new Set<NeedKind>(
          lw.opts.buildable
            .map((id) => (facilityDef(id) as { need?: NeedKind } | undefined)?.need)
            .filter((n): n is NeedKind => n !== undefined),
        );

  let best: { need: NeedKind; demand: number; supply: number } | null = null;
  for (const need of candidates) {
    if (active !== null && !active.has(need)) continue;
    if (open !== null && !open.has(need)) continue;
    let demand = 0;
    for (const d of days) demand += (WEATHER_DEMAND[d.weather][need] ?? 1) * appetite[need];
    if (demand <= 0) continue;
    const supply = lw.supply[need] ?? 0;
    if (best === null) {
      best = { need, demand, supply };
      continue;
    }
    // ⚠ 엄격한 `>` — 동점이면 `NEED_KINDS` 에서 먼저 나온 쪽이 이긴다 (결정론)
    const better =
      best.supply === 0 || supply === 0
        ? supply === 0 && (best.supply !== 0 || demand > best.demand)
        : demand / supply > best.demand / best.supply;
    if (better) best = { need, demand, supply };
  }
  if (best === null) return null;

  /*
   * 처방에 붙일 예시 — 지을 수 있는 것 중 **가장 싼 것**. 봇의 건설 정책과 같은 기준이고
   * (싼 것부터), 처음 짓는 종류라면 가장 싼 것이 실제로 다음에 놓일 물건이다.
   * 동점은 id 순 — 결정론.
   */
  let example: string | null = null;
  let cheapest = Infinity;
  for (const id of lw.opts.buildable ?? []) {
    const def = facilityDef(id) as ({ cost: number; need?: NeedKind } | undefined);
    if (!def || def.need !== best.need) continue;
    if (def.cost < cheapest || (def.cost === cheapest && example !== null && id < example)) {
      cheapest = def.cost;
      example = id;
    }
  }
  // "하나도 없다"는 **지어진 것이 없을 때만**. 사고로 쉬는 시설은 없는 것이 아니다
  return { ...best, missing: (lw.built[best.need] ?? 0) === 0, example };
}

/**
 * 공급이 아무리 커도 넘을 수 없는 값 — "등급 천장만 남긴다"를 표현하는 인자다.
 * 상수 대신 이 이름을 쓰는 이유는, 아래 비교가 **산술 트릭이 아니라 질문**임을 남기려는 것:
 * "공급이 무한이면 상한이 얼마인가?" = 등급 천장.
 */
const UNBOUNDED_SUPPLY = Number.MAX_SAFE_INTEGER;

/**
 * 정원이 등급 상한에 걸렸는가 (P3-C).
 *
 * ⚠ **규칙을 여기서 다시 쓰지 않는다.** `bySupply >= gradeMax` 라고 적으면 그 순간
 * `min(등급, 공급×1.5)` 의 사본이 생기고, `admissionLimit` 이 바뀌면 결산만 옛 규칙으로
 * 남는다. 대신 정본에게 **두 번 묻는다**: 지금 공급으로 얼마인가 / 공급이 무한이면
 * 얼마인가. 같으면 시설을 더 지어도 한 명도 더 안 들어온다 — 그게 "정원이 찼다"의 정의다.
 *
 * 혼잡 배율(카드)은 **일부러 안 넣는다.** 정원이 찼다는 것은 등급 구조의 상태이지
 * 이번 주 카드가 만든 일시적 상태가 아니다 (배율은 양쪽에 똑같이 곱해져 비교도 안 바뀐다).
 */
function admissionState(
  grade: GradeDef | undefined,
  totalCapacity: number,
): WeekReport['admissionCap'] {
  if (!grade) return null;
  const limit = admissionLimit(grade, totalCapacity);
  const ceiling = admissionLimit(grade, UNBOUNDED_SUPPLY);
  return { limit, gradeMax: grade.maxGuests, capped: limit >= ceiling };
}

/** 하루치 진행 상태 (K39) — 예전 run() 의 하루 지역 변수를 그대로 옮긴 것 */
interface DayCtx {
  no: number;
  weather: Weather;
  perTick: number;
  before: ReturnType<GuestStore['stats']>;
  arrivals: number;
  visitors: number;
  turnedAway: number;
  noTicket: number;
  peak: number;
  revenue: number;
  admission: number;
  arrivalAcc: number;
}

/** 주 진행 상태 (K39) — begin() 이 만들고 finish() 가 비운다 */
interface LiveWeekState {
  rng: Rng;
  opts: WeekOptions;
  season: Season;
  profile: (typeof SEASON_PROFILE)[Season];
  playbackEvery: number;
  heat: number[];
  days: DayReport[];
  playback: PlaybackFrame[];
  supply: Record<NeedKind, number>;
  /** 선 시설을 안 뺀 공급 — "하나도 없다" 판정용 (begin() 주석 참고) */
  built: Record<NeedKind, number>;
  accident: WeekReport['accident'];
  byGroup: Record<GroupId, number>;
  weekRevenue: number;
  weekAdmission: number;
  /**
   * 이번 주에 **이미 현금에 넣은** 금액 (K48). `finish()` 가 최종 주간 수입에서 이걸
   * 빼고 정산하므로 총액은 예전과 한 원도 다르지 않다.
   */
  credited: number;
  tick: number;
  stepCalls: number;
  day: DayCtx | null;
}

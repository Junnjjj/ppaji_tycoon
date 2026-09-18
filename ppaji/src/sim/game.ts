import { applyArrivalLayout, arrivalRoute } from './arrival-layout.js';
/**
 * 세계 조립 — 시계·격자·풀·시설·손님·돈·인박스를 한 곳에서 tick 한다.
 * 바깥(렌더·UI·봇)은 **명령 메서드**로만 쓴다. 전부 `{ok}|{ok:false, reason}` 를 돌려
 * UI 가 이유를 미리 보여 줄 수 있게 한다. 연출은 `drainFx()` 로 꺼내 간다 — 헤드리스에선 버려진다.
 */
import { Rng } from './rng.js';
import { Grid, FLOOR, ROAD_ROWS, isCorridorFloor, isIndoorCode, landRect, inRect, gateTile, inLandOrWater, LAND_J0, permitDepth, isWaterCode, type FloorCode, isWalkFloor, isLandFloor, isGround, DECOR_GROUNDS, FLOOR_NAMES } from './grid.js';
import { FoodCourtStore, FOODCOURT_SEAT_DEF, FOODCOURT_TILE_COST, courtBlocks, courtContains, type FoodCourtRect, type FoodCourtSnapshot } from './foodcourt.js';
import { PoolStore, type PoolSnapshot } from './pool.js';
import type { Pool } from './pool.js';
import { poolState, type PoolState } from './pool-state.js';
import { GuestStore, type GuestSnapshot, FLOAT_BY_GIFT , rentKey, type Guest , type GuestHooks } from './guest.js';
import { firstVisitLine } from './lines.js';
import { FacilityStore, guestWalkable, type WaterRules, FACILITY_FAIL_KO, popOf, capacityOf, upgradeCost, FACILITY_MAX_LEVEL, type FacilitySnapshot, type PlacedFacility } from './facility.js';
import { StoryDirector } from './story.js';
import { applyStartKit } from './startkit.js';
import rivalsJson from '../data/rivals.json';
import featuresJson from '../data/features.json';
import packagesJson from '../data/packages.json';
import groundsJson from '../data/grounds.json';
import { StaffStore, STAFF_ROLES, type StaffSnapshot } from './staff.js';
import { RandomEvents, EVENT_DEFS, type RandomEventsSnapshot, type RandomEventDef } from './random-events.js';
import { Inbox, type GameEvent } from './events.js';
import { SnsStore, type SnsSnapshot } from './sns.js';
import { evaluate, type ConditionWorld, type Verdict } from './condition.js';
import { CertStore, certScore, type CertState, type CertResult } from './cert.js';
import { nextRank, rankReady } from './rank.js';
import { Shop, type ShopState } from './shop.js';
import { dueEvents } from './calendar.js';
import { Campaigns, type CampaignState } from './campaign.js';
import { rollWeather, WEATHER_ARRIVAL, WEATHER_TEMP, type Weather } from './weather.js';
import { MenuStore, recipePrice, type MenuSnapshot } from './restaurant.js';
import { CookingStore, COOK_COST, COOK_UNLOCK_RANK, REWARD_STOCK, BUY_STOCK, type CookingSnapshot, type CookResult, type CookResultOf } from './cooking.js';
import { WorkshopStore, GEAR_DEFS, PART_DEFS, WORKSHOP_WORDS, GEAR_FAIL_PICK } from './workshop.js';
import { RIG_UPGRADES, type RigUpgradeDef, RigStore } from './rig-upgrade.js'; // P49-a1
import { computeRigs, EMPTY_RIG_STATE, type RigState, CHAIN_BASE, CHAIN_CAP, PPAJI_GRADE_NAMES, ppajiGrade, type PpajiGrade, RIG_SETS, SET_BAND_BONUS, SET_POP_BONUS, rigBaseKind } from './rig.js';
import { bandTop, bandPrice, bandFor, WRISTBANDS, type WristbandDef } from './wristband.js';
import { accidentChance, riskLevel, RISK_LABELS, type RiskLevel } from './accident.js';
import rigPartsJson from '../data/rig-parts.json';
import type { RigPartDef } from '../data/schema.js';
import { activeCombos, COMBO_DEFS, COMBO_POP, type ActiveCombo } from './combos.js';
import { PART_TIMER_WAGE, staffable } from './facility.js';
import type { GearDef , PackageDef, GroundDef } from '../data/schema.js';
import {
  CourseStore, dockCandidates, suggestCourse as suggestCourseShape, validateCourse, evaluateCourse, courseEquipment, presetDef, sampleCourse, fitBlocked, PRESETS, COURSE_ISSUE_TEXT,
  type CourseSnapshot, type CourseTerrain, type DockChoice, type CourseEditDraft, type CourseResult, type PlacedCourse,
} from './course/course.js';
import {
  clockView, isWeekend, seasonOf, yearOf, TICKS_PER_DAY, LATE_DAY_TICK, TOTAL_DAYS, ARRIVAL_FROM_TICK, ARRIVAL_TO_TICK, TICKS_PER_HOUR, SHOP_RESTOCK_TICK, type ClockView, CLOSING_TICK, EVENING_TICK } from './clock.js';
import type { FacilityDef, SeasonTables, AreaDef, FriendDef, WishDef, GiftDef, Condition, CertDef, RankDef, ShopEntry, CalendarEvent, RecipeDef, CompatDef, IngredientDef, InvestDef, CampaignDef } from '../data/schema.js';
import defaultBalance from '../data/balance.json';
import facilitiesJson from '../data/facilities.json';
import seasonsJson from '../data/seasons.json';
import areasJson from '../data/areas.json';
import friendsJson from '../data/friends.json';
import wishesJson from '../data/wishes.json';
import giftsJson from '../data/gifts.json';
import certsJson from '../data/certs.json';
import ranksJson from '../data/ranks.json';
import shopJson from '../data/shop.json';
import calendarJson from '../data/calendar.json';
import recipesJson from '../data/recipes.json';
import compatJson from '../data/compat.json';
import ingredientsJson from '../data/ingredients.json';
import investJson from '../data/invest.json';
import campaignsJson from '../data/campaigns.json';

export type Balance = typeof defaultBalance;

export const FACILITY_DEFS: ReadonlyMap<string, FacilityDef> = new Map((facilitiesJson as unknown as FacilityDef[]).map((d) => [d.id, d]));
export const SEASON_TABLES = seasonsJson as unknown as SeasonTables;
/** 재통과 위로금 — 재료는 G7 에서 */
export const CONSOLATION = 300;
/** 폐장 잔고가 음수면 여기까지 채워 준다 (G37) */
export const EMERGENCY_FUND = 2000;
export const AREA_DEFS = areasJson as unknown as AreaDef[];
export const FRIEND_DEFS = friendsJson as unknown as FriendDef[];
export const WISH_DEFS = wishesJson as unknown as WishDef[];
/** 데크 한 칸 (P1) — 부표(표준 타일 100G)보다 싸고 포장보다 비싸다. balance 로 옮기는 것은 P13 */
export const DECK_COST = 60;
export const GIFT_DEFS = giftsJson as unknown as GiftDef[];
/** 달력 본문 — 대사가 이미 보상을 말하면 「— 8,000G」 를 다시 붙이지 않는다 (G56, 5년차 실측 「지원금 8,000G … — 8,000G」) */
export function bodyWithReward(line: string, got: string): string {
  const core = got.replace(/ 획득$/, '').replace(/ 해금$/, '');
  return core && line.includes(core) ? line : `${line} — ${got}`;
}
export const GIFTS_BY_ID: ReadonlyMap<string, GiftDef> = new Map(GIFT_DEFS.map((g) => [g.id, g]));
export const CERT_DEFS = certsJson as unknown as CertDef[];
export const RANK_DEFS = ranksJson as unknown as RankDef[];
export const SHOP_ENTRIES = shopJson as unknown as ShopEntry[];
export const CALENDAR_EVENTS = calendarJson as unknown as CalendarEvent[];
export const RECIPE_DEFS = recipesJson as unknown as RecipeDef[];
export const COMPAT_DEFS = compatJson as unknown as CompatDef[];
export const INGREDIENT_DEFS = ingredientsJson as unknown as IngredientDef[];
export const INGREDIENTS_BY_ID: ReadonlyMap<string, IngredientDef> = new Map(INGREDIENT_DEFS.map((i) => [i.id, i]));
export const INVEST_DEFS = investJson as unknown as InvestDef[];
export const CAMPAIGN_DEFS = campaignsJson as unknown as CampaignDef[];
/** 실내 바닥 칠하기 — 칸당 */
export const INDOOR_COST = 40;
/** 길(포장) 한 칸 값 (P16) — 실내 바닥보다 싸다. 길이 곧 동선이라 아끼지 않게 */
export const PATH_COST = 20;
/** 친구 방문 — 개장 때 해금 친구마다 이 확률로 오늘 온다 */
export const FRIEND_VISIT_CHANCE = 0.5;

/** P49-a1 §4.2 — 기구 부품 13 (`rig-parts.json`) */
export const RIG_PART_DEFS: readonly RigPartDef[] = rigPartsJson as RigPartDef[];
/** P49-b §3.5 — 사각형 붓의 바깥 사각형(링 포함) */
export interface PpajiRect { i0: number; j0: number; w: number; h: number }
export const RNG_SALTS = { spawn: 1, guest: 2, sns: 3, cert: 4, shop: 5, cook: 6, world: 7, friend: 8, workshop: 9, accident: 10, rig: 11, night: 12 } as const; // P49-a1: 셋을 연다 — 쓰는 것은 P52-b·P51·P54
export type RngStream = keyof typeof RNG_SALTS;

export type Result = { ok: true } | { ok: false; reason: string };

/** 아침 버스 한 대 (G33) */
export interface BusPlan { areaId: string; seats: number; source: 'campaign' | 'likes' }
/** 도로 위 버스 — in(왼쪽에서 들어온다) → stop(한 명씩 내린다) → out(오른쪽으로 나간다). t 는 in/out 진행률, stop 에선 tick 수 */
export interface BusState { areaId: string; seatsLeft: number; phase: 'in' | 'stop' | 'out'; t: number; source: 'campaign' | 'likes'; team?: number }
/** P17 패키지 3종 (D25) — 데이터 */
export const PACKAGES: readonly PackageDef[] = packagesJson as PackageDef[];
/** P22 지면 5종 (D28) — 데이터 */
export const GROUNDS: readonly GroundDef[] = groundsJson as GroundDef[];
export const GROUND_BY_ID: ReadonlyMap<string, GroundDef> = new Map(GROUNDS.map((g) => [g.id, g]));

export interface FxEvent {
  kind: 'splash' | 'coin' | 'dig' | 'fill' | 'place' | 'remove' | 'photo' | 'like' | 'cert' | 'rankup' | 'buy' | 'discover' | 'land' | 'wish' | 'rest' | 'bus' | 'fire' | 'band'; // P56-a2: 'band' = 팔찌 발급 띠(label = 팔찌 이름 · amount = 등급)
  i: number;
  j: number;
  amount?: number;
  poolId?: number;
  /** 구매 팝 글씨 (G26, R4 「아이스크림 ×1」) */
  label?: string;
}

export interface DayReport {
  day: number;
  visitors: number;
  /** 그날의 유입 목표(명) — 동시 상한에 포화돼도 계절·주말 곡선이 보이게 따로 적는다 */
  target: number;
  tickets: number;
  fees: number;
  food: number;
  /** P18 숙박 요금(1박) · 자고 가는 손님 수 */
  lodging?: number;
  overnight?: number;
  /** P54 밤 빠지 파티 — 열린 날만 (0/false 면 안 쓴다) */
  nightOn?: boolean; nightPkg?: number; nightFood?: number; nightFee?: number;
  maintenance: number;
  net: number;
  /** G19 — 퇴장 만족 평균 · 그날 얻은 좋아요 · 최고 수입 시설 · 최다 판매 메뉴 */
  satisfaction?: number;
  likes?: number;
  topFacility?: { name: string; income: number; uses: number } | null;
  topMenu?: { name: string; sales: number } | null;
  /** P60-e B2 — 그날 식사 수(사서 들고 자리를 정한 손님 — 사서 곧장 나간 손님은 밖) · 그중 산 곳 걷기 9 안에 빈 좌석이 없어 서서 먹은 수 (없으면 0) */
  eats?: number;
  standEats?: number;
}

/** 기능 스위치 (G22) — PSS 에 없는 축. 런타임에 바꿀 수 있다(하네스·설정) */
export const FEATURES: { staff: boolean; facilityLevels: boolean; randomEvents: boolean; rivals: boolean; dailyResults: boolean } = { ...(featuresJson as { staff: boolean; facilityLevels: boolean; randomEvents: boolean; rivals: boolean; dailyResults: boolean }) };

export interface RivalDef { id: string; name: string; basePop: number; growth: number }
export const RIVALS: readonly RivalDef[] = (rivalsJson as RivalDef[]).filter((r) => r.id !== '_');

/** 시즌·연차 결산 (G19) — 사건 `data` 로 나간다 */
export interface PeriodReport {
  kind: 'season' | 'year';
  year: number;
  season: number;
  visitors: number;
  income: number;
  net: number;
  likes: number;
  satisfaction: number;
  popularity: number;
  topFacilities: { name: string; income: number; uses: number }[];
  topMenus: { name: string; sales: number }[];
  /** 라이벌 순위 (1 = 최고) */
  rankPos: number;
  rivals: { name: string; pop: number }[];
  awards?: { title: string; name: string }[];
}

export interface GameSnapshot {
  arrivalRevision?: number;
  version: 1;
  seed: number;
  rng: Record<RngStream, number>;
  clock: { day: number; tick: number };
  money: number;
  rank: number;
  grid: { w: number; h: number; floor: number[]; levels?: number[]; natural?: number[] };
  pools: PoolSnapshot;
  /** P58-a optional — 없으면 빈 목록 */
  foodcourts?: FoodCourtSnapshot;
  facilities: FacilitySnapshot;
  guests: GuestSnapshot;
  inbox: ReturnType<Inbox['toSnapshot']>;
  sns: SnsSnapshot;
  certs?: CertState;
  shop?: ShopState;
  calendarGiven?: string[];
  /** 첫 인증 합격일 (G43 달력 `afterCertDays`) */
  firstCertPassDay?: number | null;
  tools?: string[];
  menus?: MenuSnapshot;
  cooking?: CookingSnapshot;
  /** 기구 공방 (P7) — 없으면 새 공방 */
  workshop?: CookingSnapshot;
  /** P49-a1 — 기구 개조 저장부(optional · 없으면 새 저장부) */
  rigs?: CookingSnapshot;
  /** P52-a/b — 팀 팔찌 낮 1회 · 사고 감쇠 · 오늘 사고 수 (optional — 하루 중간 저장·복원이 같아야 한다, 버전 안 올림) */
  bandPaid?: [number, number][];
  /** P52-c — 야외 수역 폐쇄(입수 0) 마지막 날(포함). optional */
  waterClosedUntil?: number;
  /** P54 — 첫 밤 개장 모달을 봤나(그 뒤는 티커). 래치 `nightOn` 은 저장하지 않는다 */
  nightOpened?: boolean;
  accidentCut?: [number, number][];
  accidentsToday?: number;
  /** 청결 0~100 (P8, D14 — 알바 슬롯 합이 소유) · 없으면 100 */
  cleanliness?: number;
  /** 발견한 콤보 id (P16) — 누적 */
  combosSeen?: string[];
  /** P25 발견한 패키지 */
  packagesSeen?: string[];
  /** P60-c 발견한 기구 세트 id (optional · 없으면 빈 집합 — 세이브 v5 그대로) */
  setsSeen?: string[];
  invest?: string[];
  investPending?: { id: string; day: number }[];
  campaigns?: CampaignState;
  /** 내일 아침 올 버스 (G33) · 지금 도로 위 버스 상태 */
  busQueue?: BusPlan[];
  busesToday?: BusPlan[];
  busState?: BusState | null;
  /** P17 팀 번호 시퀀스 */
  teamSeq?: number;
  /** P23 첫 판매 토스트 여부 */
  firstSaleSeen?: boolean;
  /** P60-e B4 「풀코스 푸드코트」(반경 3 점포 카테고리 4/4) 발견 여부 — optional, 참일 때만 싣는다(구 세이브·새 판은 없음) */
  fullCourtSeen?: boolean;
  /** P27 걸어온 팀 묶음 진행 상태 — 없으면 새 무리부터 */
  walkin?: { team: number; left: number };
  weather?: Weather;
  ticketBonus?: number;
  endingSeen?: boolean;
  /** 본 시나리오 비트 id (G16) */
  story?: string[];
  /** 직원·청결 (G20) */
  staff?: StaffSnapshot;
  /** 랜덤 이벤트 (G21) */
  randomEvents?: RandomEventsSnapshot;
  /** 하루 안의 결산 누적 (G19) — 없으면 0 에서 시작 (왕복이 하루 중간이면 필요하다) */
  dayAccum?: { satSum: number; satN: number; menuSalesToday: Record<string, number>; likesAtDayStart: number; ticketsToday?: number; feesToday?: number; foodToday?: number; enteredToday?: number; leftToday?: number };
  stats: { visitors: number; tickets: number; fees: number; /* P49-a1 optional (전부 0/미기록 — 배선은 P51·P52-a) */ converts?: number; pkgPpaji?: number; vestRentals?: number; /** P54 밤 빠지 파티 — 밤이 열린 날 수 · 야간권 · 링 위 매점 저녁 매출 · 빠지 자리 이용료(저녁) */ nightNights?: number; nightPkg?: number; nightFood?: number; nightFee?: number; food?: number; spent?: number; bailouts?: number; busGuests?: number; wishDone?: number; wishExpired?: number; courseRevenue?: number; courseRiders?: number; pkg?: number; teamGuests?: number; teamSeated?: number; seatless?: number; lodging?: number; overnight?: number; teamsSeated?: number; /** P34 — 비 오는 날 실내로 피한 손님 수 */ rainRefuge?: number; passByEnter?: number; passByLeave?: number; nightUses?: number; gearRentals?: number; /** P50-b1 — 빠지 지출 구성 */ spentDeck?: number; spentRig?: number; spentConvert?: number; /** P51 measure — 기구 이용 · 그날 기구를 탄 손님 수(재탑승 비율) */ rigUses?: number; rigRiderDays?: number; rigRepeats?: number; rigPartsBought?: number; /** P56-c — 재료·부품 재고 구입 수(요리·공방·개조 합) */ stockBuys?: number; /** P58-a — 푸드코트 자리에서 먹은 수 */ courtEats?: number; /** P60-e B2 — 식사 수(사서 든 손님) · 서서 먹은 수 (optional — 구 세이브는 0) */ eats?: number; standEats?: number; /** P52-a — 팔찌를 낀 기구 이용 */ rigUsesBand?: number; /** P52-b — 사고 수 */ accidents?: number; /** P52-c — 계절별 야외 입수 [봄,여름,가을,겨울] */ swimsBySeason?: number[]; days: DayReport[]; menuSales?: Record<string, number> };
  prevSatAvg?: number;
  /** 해금된 시설·선물 id (start 는 언제나 포함). P60-a: 옛 세이브의 `items` 는 읽지 않는다(마이그레이션은 save/ 가 v5 로) */
  unlocked: { facilities: string[]; gifts?: string[]; tiles?: string[] };
  /** 오늘 방문하기로 한 친구 (스냅샷 복원 때 다시 안 뽑게) */
  friendsToday?: string[];
  /** 견인 코스 + 산 기구 (P4-A). optional — 없으면 코스 0·물려받은 기구 둘. 버전은 안 올린다 */
  courses?: CourseSnapshot;
}

export class Game {
  arrivalRevision = 0;
  finalizeArrivalLayout(): void {
    this.guests.setArrivalRoute(arrivalRoute(this.gate));
    this.popCache = null;
    this.afterWorldChange();
  }
  readonly grid: Grid;
  readonly pools: PoolStore;
  readonly facilities: FacilityStore;
  readonly guests: GuestStore;
  readonly inbox = new Inbox();
  readonly sns: SnsStore;
  readonly certs: CertStore;
  readonly shop: Shop;
  readonly calendarGiven = new Set<string>();
  firstCertPassDay: number | null = null;
  readonly tools = new Set<string>();
  readonly menus = new MenuStore(RECIPE_DEFS, COMPAT_DEFS);
  readonly investDone = new Set<string>();
  /** 지불했고 다음날 개장에 해금 */
  private investPending: { id: string; day: number }[] = [];
  readonly campaigns = new Campaigns(CAMPAIGN_DEFS);
  weather: Weather = 'clear';
  /** 뉴게임+ 이월 티켓 가산 (기본 200 에 더한다) */
  ticketBonus = 0;
  /** 엔딩을 봤다 (계속하기 중) — 배속 ×2 해금 */
  endingSeen = false;
  /** 시나리오 (G16) — 비트 판정·적재 */
  readonly story = new StoryDirector();
  /** 직원·청결 (G20) */
  readonly staff: StaffStore;
  /** 랜덤 이벤트 (G21) */
  readonly events: RandomEvents;
  readonly cooking: CookingStore;
  readonly workshop: WorkshopStore;
  /** P49-a1 — 기구 개조(부품·경험치). 레시피는 P51 */
  readonly rigs: RigStore;
  /** P50-a §3.7 — 켜짐 상태(파생 · 저장 0). `afterWorldChange`·로드가 `refreshRigs` 로 채운다 */
  rigState: RigState = EMPTY_RIG_STATE();
  /** P51 measure — 오늘 기구를 탄 손님 id(저장 0 · 하루 단위) */
  private readonly rigRidersToday = new Set<number>();
  private readonly rigPairsToday = new Set<number>();
  /** P52-a — 팔찌를 산 팀(낮 1회): teamId(걸어온 손님은 −uid) → day */
  private readonly bandPaid = new Map<number, number>();
  /** P52-b — 오늘 사고 수(하루 상한) · 수역별 인기 감쇠(사고 뒤, 매일 반감 · 저장 0) */
  private accidentsToday = 0;
  /** P52-c — 야외 수역 폐쇄 마지막 날(포함) · −1 = 열림 */
  waterClosedUntil = -1;
  /** P54 밤 빠지 파티 — 저녁(EVENING_TICK)에 판정하는 하루짜리 래치 · 열린 수역 · 스위치(봇 `--no-night` 대조군) · 첫 개장 모달 */
  nightOn = false;
  nightPool: number | null = null;
  nightEnabled = true;
  nightOpened = false;
  private nightPkgToday = 0; private nightFoodToday = 0; private nightFeeToday = 0;
  private readonly nightBandTeams = new Set<number>();
  private readonly accidentCut = new Map<number, number>();
  /** 청결 (P8) — 손님이 더럽히고 편의 시설의 알바가 되돌린다. 만족 배수 0.6~1.0 */
  cleanliness = 100;
  /** 발견한 콤보 (P16) — 누적, 첫 발동에 알림 */
  readonly combosSeen = new Set<string>();
  /** P60-c 발견한 기구 세트 — 누적, 첫 성립에 축하 모달(한 tick 에 여럿이면 첫 하나만) + 나머지는 인박스 편지 */
  readonly setsSeen = new Set<string>();
  private comboCache: { key: string; list: ActiveCombo[] } | null = null;
  /** 견인 코스 (P4-A, §2.2 「코스 = RCT 식 루트」) — 수역 안에만 (D12) */
  readonly courses = new CourseStore();
  private foodToday = 0;
  /** P60-e B2 — 그날 식사 수 · 서서 먹은 수 (DayReport 로 나가고 자정에 0) */
  private eatsToday = 0; private standEatsToday = 0;
  private menuVersion = 0;
  readonly rng: Record<RngStream, Rng>;
  /** 오늘 오기로 한 친구 id (아직 안 온 것) */
  private friendsToday: string[] = [];
  day = 0;
  tick = 0;
  money: number;
  rank = 0;
  stats = { visitors: 0, tickets: 0, fees: 0, food: 0, spent: 0, spentDeck: 0, spentRig: 0, spentConvert: 0, converts: 0, rigUses: 0, rigRiderDays: 0, rigRepeats: 0, rigPartsBought: 0, stockBuys: 0, courtEats: 0, eats: 0, standEats: 0, rigUsesBand: 0, pkgPpaji: 0, vestRentals: 0, nightNights: 0, nightPkg: 0, nightFood: 0, nightFee: 0, accidents: 0, swimsBySeason: [0, 0, 0, 0], bailouts: 0, busGuests: 0, wishDone: 0, wishExpired: 0, courseRevenue: 0, courseRiders: 0, pkg: 0, teamGuests: 0, teamSeated: 0, seatless: 0, lodging: 0, overnight: 0, teamsSeated: 0, rainRefuge: 0, days: [] as DayReport[], menuSales: {} as Record<string, number>, passByEnter: 0, passByLeave: 0, nightUses: 0, gearRentals: 0 };
  /** 오늘 퇴장 만족 합·수 (결산용, 저장 안 함 — 하루 안에서만 쓴다) */
  private satSum = 0;
  /** 어제 퇴장 만족 평균 (G30 티켓 레벨). 저장 optional */
  prevSatAvg = 0;
  private satN = 0;
  private menuSalesToday: Record<string, number> = {};
  private likesAtDayStart = 0;
  readonly unlocked = { facilities: new Set<string>(), gifts: new Set<string>(), tiles: new Set<string>() };
  private fx: FxEvent[] = [];
  private ticketsToday = 0;
  private feesToday = 0;
  /** P18 오늘 숙박 요금 */
  private lodgingToday = 0;
  /** P23 첫 판매 토스트를 한 번만 */
  firstSaleSeen = false;
  /** 풀 파생 상태 캐시 — 편집·시간(계절)·인접 시설이 바뀌면 비운다 */
  private poolCache = new Map<number, { key: string; state: PoolState }>();

  constructor(
    readonly seed: number,
    readonly b: Balance = defaultBalance,
    opts: { kit?: boolean; arrival?: boolean } = {},
  ) {
    const root = new Rng(seed);
    this.rng = Object.fromEntries(Object.entries(RNG_SALTS).map(([k, salt]) => [k, root.fork(salt)])) as Record<RngStream, Rng>;
    this.grid = Grid.newPark(0);
    this.pools = new PoolStore(this.grid);
    this.foodcourts = new FoodCourtStore();
    this.facilities = new FacilityStore(this.grid, FACILITY_DEFS);
    this.guests = new GuestStore(this.grid, this.pools, this.facilities, gateTile(0), this.rng.guest, b);
    this.staff = new StaffStore(this.rng.world, (i, j) => this.guests.walkable(i, j), () => this.land);
    this.events = new RandomEvents(this.rng.world);
    this.money = b.startMoney;
    this.sns = new SnsStore(AREA_DEFS, FRIEND_DEFS, WISH_DEFS, GIFT_DEFS, this.rng.sns);
    this.certs = new CertStore(CERT_DEFS, this.rng.cert);
    this.shop = new Shop(SHOP_ENTRIES, this.rng.shop);
    this.cooking = new CookingStore(RECIPE_DEFS, INGREDIENT_DEFS, this.rng.cook);
    this.workshop = new WorkshopStore(GEAR_DEFS, PART_DEFS, this.rng.workshop, WORKSHOP_WORDS, GEAR_FAIL_PICK);
    this.rigs = new RigStore(RIG_UPGRADES, RIG_PART_DEFS, this.rng.rig); // P51: 개조 레시피 20(rigs.json)
    for (const d of FACILITY_DEFS.values()) if (d.unlock.source === 'start' && d.derived !== true) this.unlocked.facilities.add(d.id); // P58-a: 파생 시설은 해금 목록에 안 든다(건설 창·봇에 안 뜬다)
    for (const d of GIFT_DEFS) if (d.unlock === 'start') this.unlocked.gifts.add(d.id);
    this.weather = rollWeather(this.rng.world, seasonOf(0));
    this.planFriendVisits();
    this.planBuses();
    // 시작 킷 (G25) — 물려받은 작은 파크. 스냅샷 복원은 kit:false 로 부른다 (덮어쓸 것이라 무의미하다)
    if (opts.kit !== false) { applyStartKit(this); if (opts.arrival) applyArrivalLayout(this); }
  }

  /** 오늘 바깥 기온 — 계절 기본 + 날씨 */
  outdoorTemp(): number {
    return (SEASON_TABLES.ambientOutdoor[seasonOf(this.day)] ?? 24) + WEATHER_TEMP[this.weather];
  }

  /** P52-c G6 — 수온: 실내 26 · 야외 = 계절 기온 + 날씨 + 강 냉기(`riverChill` −3) */
  waterTemp(indoor: boolean): number { return indoor ? 26 : this.outdoorTemp() + (this.b.riverChill ?? -3); }
  /** P52-c — 야외 입수 확률 배수: 실내 1 · 폐쇄 0 · 등급 4 는 max(u, 0.9)(시그니처 빠지는 비수기에도 온다) · u = clamp((T−16)/10, swimUrgeMin, 1)(겨울 바닥 0.15) */
  swimUrgeOf(poolId: number): number {
    if (this.poolIndoor(poolId)) return 1;
    if (this.waterClosedUntil >= this.day) return 0;
    const u = Math.max(this.b.swimUrgeMin ?? 0.15, Math.min(1, (this.waterTemp(false) - 16) / 10));
    return this.ppajiGradeOf(poolId) >= 4 ? Math.max(u, 0.9) : u;
  }
  /** 개장 — 해금 친구마다 오늘 올지 뽑는다 (`friend` 스트림, 하루 한 번) */
  private planFriendVisits(): void {
    this.friendsToday = [];
    for (const f of this.sns.unlockedFriends) {
      if (this.rng.friend.chance(FRIEND_VISIT_CHANCE)) this.friendsToday.push(f.id);
    }
  }

  // ── 조건 세계 — 소원·인증·랭크가 같은 눈으로 본다 ──────────────────

  private worldCache: { key: string; world: ConditionWorld } | null = null;

  /** 같은 tick·같은 세계 버전이면 뷰를 재사용한다 — 소원·인증·랭크가 하루에 수십 번 묻는다 */
  conditionWorld(): ConditionWorld {
    const key = `${this.absTick}|${this.pools.version}|${this.facilities.version}|${this.money}|${this.sns.totalLikes}`;
    if (this.worldCache && this.worldCache.key === key) return this.worldCache.world;
    let poolsMemo: ReturnType<ConditionWorld['pools']> | null = null;
    let facMemo: ReturnType<ConditionWorld['facilities']> | null = null;
    const pools = () => poolsMemo ?? (poolsMemo = this.pools.all.map((p) => {
      const st = this.poolState(p.id);
      const adj = this.facilities.adjacentTo(new Set(p.tiles)).map((f) => f.defId);
      return { id: p.id, size: p.tiles.length, temp: st?.temp ?? 0, likes: p.likes, popularity: st?.popularity ?? 0, indoor: this.poolIndoor(p.id), adjacentFacilities: adj };
    }));
    const facilities = () => facMemo ?? (facMemo = this.facilities.all.map((f) => {
      const def = this.facilities.defOf(f);
      const ring = FacilityStore.ring(def, f.i, f.j, f.facing);
      const adjacentPool = ring.some((t) => this.grid.at(t.i, t.j) === FLOOR.pool);
      const adjacentFacilities = [...new Set(ring.map((t) => this.facilities.at(t.i, t.j)?.defId).filter((x): x is string => x !== undefined))];
      return { uid: f.uid, id: f.defId, class: def.class, adjacentPool, adjacentFacilities };
    }));
    const world: ConditionWorld = {
      pools,
      facilities,
      popularity: () => this.parkPopularity(),
      likes: (scope, area) => (scope === 'area' && area ? (this.sns.areaLikes.get(area) ?? 0) : this.sns.totalLikes),
      certPasses: () => this.certs.passes(),
      certPassed: (id) => this.certs.passed(id),
      friends: () => this.sns.unlockedFriends.length,
      areas: () => this.sns.areas.length,
      rank: () => this.rank,
      hasGift: (id, friendId) => this.sns.hasGift(id, friendId),
      recipeKnown: (id, served) => this.cooking.known.has(id) && (!served || this.facilities.all.some((f) => this.menus.slotsOf(f.uid).includes(id))),
      recipeCount: () => this.cooking.known.size,
      cookingLevel: () => this.cooking.level,
      visitors: () => this.stats.visitors,
      money: () => this.money,
      year: () => this.clock.year,
      courseThrills: () => this.courses.all.map((c) => this.evaluateCourse(c.handle)?.thrill ?? 0),
      ppajiGrades: () => this.pools.all.map((p) => this.ppajiGradeOf(p.id)), // P49-a1
      rigPaths: () => this.pools.all.map((p) => this.pathOf(p.id).length), // P60-d: 입수구에서 이어진 경로 길이
      rigPathComplete: () => this.pools.all.map((p) => this.pathCompleteOf(p.id)), // P60-d
      rigSets: () => this.pools.all.map((p) => this.setsOf(p.id).length), // P60-c
      rigs: () => this.facilities.all.filter((f) => this.facilities.defOf(f).class === 'rig').map((f) => { const d = this.facilities.defOf(f); return { id: d.id, depth: d.depth ?? 'any', chain: d.chain ?? null, guarded: this.rigGuardedAt(f) }; }),
      seatGrades: () => this.facilities.all.filter((f) => this.facilities.defOf(f).class === 'lounging').map((f) => this.seatGradeOf(f.uid).grade), // P28
      seatsFedMax: (id) => Math.max(0, ...this.facilities.all.filter((f) => f.defId === id).map((f) => this.seatsFedAt(this.facilities.defOf(f), f.i, f.j, f.facing, f.uid))),
      courtSeats: () => this.courtSeatsTotal(), // P60-e 인증 court_f/d/b
      courtMenuKinds: () => this.courtMenuKindsMax(),
    };
    this.worldCache = { key, world };
    return world;
  }

  evaluateCondition(c: Condition): Verdict {
    return evaluate(c, this.conditionWorld(), {
      facility: (id) => FACILITY_DEFS.get(id)?.name ?? id,
      gift: (id) => GIFTS_BY_ID.get(id)?.name ?? id,
    });
  }


  /** 보상 적용 — 해금은 집합에, 돈은 더한다, 도구는 tools 에 */
  grant(r: { kind: string; id?: string; amount?: number }): string {
    switch (r.kind) {
      case 'facility': if (r.id) this.unlocked.facilities.add(r.id); return `${FACILITY_DEFS.get(r.id ?? '')?.name ?? r.id} 해금`;
      case 'gift': if (r.id) this.unlocked.gifts.add(r.id); return `${GIFTS_BY_ID.get(r.id ?? '')?.name ?? r.id} 해금`;
      case 'tool': if (r.id) this.tools.add(r.id); return `${r.id === 'move' ? '이동 도구' : r.id} 획득`;
      case 'ingredient': if (r.id) this.cooking.grantIngredient(r.id, r.amount ?? REWARD_STOCK); return `재료 ${INGREDIENTS_BY_ID.get(r.id ?? '')?.name ?? r.id} ×${r.amount ?? REWARD_STOCK}`; // P56-c 보상 = 열쇠 + ×3
      case 'money': this.money += r.amount ?? 0; return `${(r.amount ?? 0).toLocaleString('ko-KR')}G`;
      case 'unlock': return r.id === 'cooking' ? '요리 개발 해금' : `${r.id} 해금`;
      case 'rigPart': if (r.id) this.rigs.grantIngredient(r.id, r.amount ?? REWARD_STOCK); return `부품 ${RIG_PART_DEFS.find((p) => p.id === r.id)?.name ?? r.id} ×${r.amount ?? REWARD_STOCK}`; // P49-a1 → P56-c ×3
      default: return r.id ?? r.kind;
    }
  }

  /** 소원 보상 적용 */
  private grantWishReward(w: WishDef): string {
    const r = w.reward;
    switch (r.kind) {
      case 'facility': this.unlocked.facilities.add(r.id); return `${FACILITY_DEFS.get(r.id)?.name ?? r.id} 해금`;
      case 'gift': this.unlocked.gifts.add(r.id); return `${GIFTS_BY_ID.get(r.id)?.name ?? r.id} 해금`;
      case 'rigPart': return this.grant(r); // P49-a1 → P56-c: 열쇠 + ×3 (요리 재료와 같은 길)
      case 'money': this.money += r.amount; return `${r.amount.toLocaleString('ko-KR')}G`;
      case 'ingredient': return this.grant(r);
    }
  }

  // ── 인증 · 랭크 · 상점 ────────────────────────────────────────────

  /** 예상 점수 — 편향 없이 같은 식 (신청 전에 보여 준다) */
  expectedCert(id: string): { base: number; parts: { verdict: Verdict; weight: number }[]; pass: number } | null {
    const def = this.certs.defs.get(id);
    if (!def) return null;
    const { base, parts } = certScore(def, (c) => this.evaluateCondition(c));
    return { base: Math.round(base), parts, pass: def.pass };
  }

  applyCert(id: string): Result {
    const r = this.certs.apply(id, this.day, this.money);
    if (!r.ok) return r;
    this.spend(r.fee);
    const def = this.certs.defs.get(id) as CertDef;
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `${def.name} 신청`, body: `${r.judgeDay - this.day}일 뒤 주말 15시에 심사 · 신청료 −${r.fee.toLocaleString('ko-KR')}G` });
    return { ok: true };
  }

  private judgeCert(): void {
    const res: CertResult | null = this.certs.judge(this.day, (c) => this.evaluateCondition(c));
    if (!res) return;
    if (res.pass && this.firstCertPassDay === null) this.firstCertPassDay = this.day;
    const def = this.certs.defs.get(res.id) as CertDef;
    let body = `${res.judges.join(' + ')} = ${res.score}점 (합격선 ${def.pass})`;
    const rewards: string[] = [];
    if (res.pass && res.first) rewards.push(this.grant(def.reward));
    if (res.pass && !res.first) {
      // 재수상 = 재료 **3개** (§1.7 원작 그대로) — 아직 없는 cert 출처 재료에서 `cert` 스트림으로 뽑는다. 모자라면 위로금
      this.money += CONSOLATION;
      rewards.push(`위로금 ${CONSOLATION.toLocaleString('ko-KR')}G`);
      for (const name of this.grantCertIngredients(3)) rewards.push(`재료 ${name}`);
    }
    if (!res.pass && res.score >= def.pass - 3) {
      // 근소 실패(합격선 −3 이내) — 심사위원이 재료 하나를 두고 간다 (§2.2 「pass−3 이상은 위로 재료 1」)
      for (const name of this.grantCertIngredients(1)) rewards.push(`아깝다 — 재료 ${name}`);
    }
    if (rewards.length) body += ` · ${rewards.join(' · ')}`;
    this.certs.lastRewards = rewards;
    const rw = def.reward as { kind: string; id?: string };
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: res.pass ? `${def.name} 합격!` : `${def.name} 불합격`, body, ...(res.pass && res.first && rw.id ? { pic: { kind: rw.kind, id: rw.id } } : {}) }); // P56-a2 D8: 합격 상품 그림
    this.fx.push({ kind: 'cert', i: this.gate.i, j: this.gate.j, amount: res.score });
  }

  /** cert 출처 재료 n 개를 준다 (없는 것부터, 다 있으면 아무 cert 재료 — `cert` 스트림 뽑기 1회/개). 준 이름들을 돌려준다. P56-c: 한 개 = 재고 +1 */
  private grantCertIngredients(n: number): string[] {
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      const all = INGREDIENT_DEFS.filter((i) => i.unlock === 'cert');
      const fresh = all.filter((i) => !this.cooking.owned.has(i.id));
      const cands = fresh.length > 0 ? fresh : all;
      if (cands.length === 0) break;
      const pick = cands[this.rng.cert.int(cands.length)];
      if (!pick) break;
      this.cooking.grantIngredient(pick.id, 1);
      out.push(`${pick.name} ×1`);
    }
    return out;
  }

  /** 랭크업 — 폐장에 다음 랭크 조건 전부 만족이면 (무작위 없음) */
  /** P53-a 검사용 — 랭크를 여기서 멈춘다 (연차 폴백이 멈춘 판에서도 오는지 잰다). null 이면 무효 */
  rankCapForTest: number | null = null;

  private checkRank(): void {
    const next = nextRank(RANK_DEFS, this.rank);
    if (!next) return;
    if (this.rankCapForTest !== null && next.star > this.rankCapForTest) return;
    if (!rankReady(next, (c) => this.evaluateCondition(c)).ready) return;
    this.rank = next.star;
    const opened = this.grid.openLand(this.rank);
    this.syncEnclosedWater(); // P15: 허가 줄이 늘면 밀폐 판정이 바뀔 수 있다
    const got = next.reward ? this.grant(next.reward) : '';
    const opened2 = (next.unlocks ?? []).filter((id) => !this.unlocked.facilities.has(id)); for (const id of opened2) this.unlocked.facilities.add(id); // P21 D27: 랭크가 여는 시설들
    const dPermit = (this.b.permitTilesByRank[Math.min(this.rank, this.b.permitTilesByRank.length - 1)] ?? 0) - (this.b.permitTilesByRank[Math.min(this.rank - 1, this.b.permitTilesByRank.length - 1)] ?? 0); // P48-b2 W6
    const rankPic = next.reward && (next.reward as { id?: string }).id ? { kind: next.reward.kind, id: (next.reward as { id: string }).id } : opened2[0] ? { kind: 'facility', id: opened2[0] } : null; // P56-a2 D8: 편지 위 물건 — 보상, 없으면 새 시설 첫째
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: `랭크 업! ★${next.star} ${next.name}`, body: `토지 +${opened}칸${dPermit > 0 ? ` · 수면 허가 +${dPermit}칸` : ''}${got ? ` · ${got}` : ''}${opened2.length ? ` · 새 시설 ${opened2.length}종` : ''} · 상점에 새 상품`, ...(rankPic ? { pic: rankPic } : {}) });
    if (next.star === COOK_UNLOCK_RANK) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: '요리 개발이 열렸다', body: '재료를 섞어 새 메뉴를 만들자 — 식당에 걸면 돈이 된다 (원작: ★2 보상)' });
    this.fx.push({ kind: 'rankup', i: this.gate.i, j: this.gate.j });
    this.afterWorldChange();
  }

  rankProgress(): { next: RankDef | null; verdicts: Verdict[] } {
    const next = nextRank(RANK_DEFS, this.rank);
    return { next, verdicts: next ? rankReady(next, (c) => this.evaluateCondition(c)).verdicts : [] };
  }

  private shopOwned(e: ShopEntry): boolean {
    if (e.kind === 'facility') return this.unlocked.facilities.has(e.ref);
    if (e.kind === 'ingredient') return false; // P60-a: 장날 재료는 재고 3 묶음 — 언제나 다시 산다 (P56-c 「보상 재료는 장날 값으로 재구매」)
    return this.unlocked.gifts.has(e.ref);
  }

  /** P56-a G5 — 진열 전(17시 전)에도 카드가 선다: 랭크 티어 이하 · 아직 안 산 후보 전부 (뽑기 없음 · 정의 순) */
  shopCandidates(): ShopEntry[] {
    return [...this.shop.entries.values()].filter((e) => e.tier <= Math.max(1, this.rank) && !this.shopOwned(e));
  }

  shopStock(): ShopEntry[] {
    return this.shop.state.stock.map((id) => this.shop.entries.get(id)).filter((e): e is ShopEntry => e !== undefined && !this.shopOwned(e));
  }

  buyShop(entryId: string): Result {
    const e = this.shop.entries.get(entryId);
    if (!e || !this.shop.state.stock.includes(entryId)) return { ok: false, reason: '지금 진열된 상품이 아닙니다' };
    if (this.shopOwned(e)) return { ok: false, reason: '이미 가진 것입니다' };
    if (e.price > this.money) return { ok: false, reason: `돈이 부족합니다 — ${e.price.toLocaleString('ko-KR')}G 필요` };
    this.spend(e.price);
    this.grant({ kind: e.kind, id: e.ref });
    this.shop.take(entryId);
    return { ok: true };
  }

  // ── 메뉴 · 요리 ──────────────────────────────────────────────────

  setMenu(uid: number, slot: number, recipeId: string | null): Result {
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '시설이 없습니다' };
    if (this.facilities.defOf(f).menuSlots === 0) return { ok: false, reason: '메뉴를 걸 수 없는 시설입니다' };
    if (recipeId !== null && !this.cooking.known.has(recipeId)) return { ok: false, reason: '아직 모르는 레시피입니다' };
    if (!this.menus.setSlot(uid, slot, recipeId)) return { ok: false, reason: '칸이 없습니다' };
    this.menuVersion++;
    this.noteFullCourt(); // P60-e B4: 구색은 메뉴로도 바뀐다
    return { ok: true };
  }

  canCook(ids: readonly string[]): Result {
    return this.cooking.canCook(ids, this.rank, this.money);
  }

  /** 상점 새 진열 수 (G48 배지) — `seenDay` 이후 입고가 있으면 진열 수, 아니면 0 */
  shopNewCount(seenDay: number): number {
    return this.shop.state.restockDay > seenDay ? this.shop.state.stock.length : 0;
  }

  /** 풀 이름 (G47) — 12자까지. 빈 이름은 기본으로 돌아간다 */
  renamePool(poolId: number, name: string): Result {
    const p = this.pools.byId(poolId);
    if (!p) return { ok: false, reason: '풀이 없습니다' };
    const t = name.trim().slice(0, 12);
    if (t) p.name = t; else delete p.name;
    return { ok: true };
  }
  poolName(poolId: number): string {
    const p = this.pools.byId(poolId);
    return p?.name ?? `수역 #${poolId}`;
  }

  /** 하단 예고 태그 (G47, 원작 「휴일 3시 심사」) — 신청한 심사가 있으면 며칠 뒤인지 */
  eventTag(): string | null {
    const a = this.certs.state.applied;
    if (!a) return null;
    const left = a.judgeDay - this.day;
    return `${left <= 0 ? '오늘' : `${left}일 뒤`} 15시 심사`;
  }

  /** 선물 정의 (손님 창, G43) */
  get giftDefs(): readonly GiftDef[] { return GIFT_DEFS; }
  get giftCount(): number { return GIFT_DEFS.length; }

  /** 요리 개발이 열렸나 (★2, G41) */
  get cookingOpen(): boolean {
    return this.rank >= COOK_UNLOCK_RANK;
  }

  cook(ids: readonly string[]): CookResult {
    const c = this.canCook(ids);
    if (!c.ok) return { ok: false, reason: c.reason };
    this.spend(COOK_COST);
    this.cooking.consume(ids); // P56-c: 돈을 낸 시도는 재료도 쓴다(실패작도)
    const r = this.cooking.cook(ids);
    if (r.ok && r.first && r.via !== 'fail') {
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: r.via === 'upgrade' ? `강화 — ${r.from?.name ?? ''} → ${r.recipe.name}` : `새 레시피 — ${r.recipe.name}`, body: `${r.recipe.cat} · 맛 ${r.recipe.taste} · 외관 ${r.recipe.look} · 인기 ${r.recipe.pop}` });
      this.fx.push({ kind: 'discover', i: this.gate.i, j: this.gate.j, label: r.recipe.name }); // P56-a D7 「획득!」 한 줄
    }
    return r;
  }

  /** P56-c: 장날 재료는 언제든 +1 · 보상 재료(소원·인증·연차)는 한 번 얻은 뒤(열쇠) 같은 값으로 다시 산다 · 시작 재료는 무한이라 안 판다 */
  buyIngredient(id: string): Result {
    const d = INGREDIENTS_BY_ID.get(id);
    if (!d || d.price === undefined || d.unlock === 'start') return { ok: false, reason: '상점에서 파는 재료가 아닙니다' };
    if (d.unlock !== 'shop' && !this.cooking.owned.has(id)) return { ok: false, reason: '아직 얻지 못한 재료입니다 — 소원·인증 보상으로 열린다' };
    if (d.price > this.money) return { ok: false, reason: `돈이 부족합니다 — ${d.price.toLocaleString('ko-KR')}G 필요` };
    this.spend(d.price);
    this.cooking.grantIngredient(id, BUY_STOCK);
    this.stats.stockBuys = (this.stats.stockBuys ?? 0) + 1;
    return { ok: true };
  }

  // ── 투자 · 캠페인 · 실내 ──────────────────────────────────────────

  canInvest(id: string): Result {
    const d = INVEST_DEFS.find((x) => x.id === id);
    if (!d) return { ok: false, reason: '알 수 없는 투자' };
    if (this.investDone.has(id) || this.investPending.some((p) => p.id === id)) return { ok: false, reason: '이미 투자했습니다' };
    const prev = INVEST_DEFS.find((x) => x.track === d.track && x.order === d.order - 1);
    if (prev && !this.investDone.has(prev.id)) return { ok: false, reason: `먼저 ${prev.name} 이 필요합니다` };
    if (d.cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${d.cost.toLocaleString('ko-KR')}G 필요` };
    return { ok: true };
  }

  invest(id: string): Result {
    const r = this.canInvest(id);
    if (!r.ok) return r;
    const d = INVEST_DEFS.find((x) => x.id === id) as InvestDef;
    this.spend(d.cost);
    this.investPending.push({ id, day: this.day + 1 });
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `${d.name} 투자`, body: `내일 개장에 ${d.unlocks.map((u) => FACILITY_DEFS.get(u)?.name ?? u).join(' · ') || '다음 단계'} 해금 · −${d.cost.toLocaleString('ko-KR')}G` });
    return { ok: true };
  }

  private settleInvest(): void {
    const due = this.investPending.filter((p) => p.day <= this.day);
    this.investPending = this.investPending.filter((p) => p.day > this.day);
    for (const p of due) {
      this.investDone.add(p.id);
      const d = INVEST_DEFS.find((x) => x.id === p.id);
      if (!d) continue;
      const names = d.unlocks.map((u) => this.grant({ kind: 'facility', id: u }));
      this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: `${d.name} 완료`, body: names.join(' · ') || '다음 단계가 열렸다' });
    }
  }

  campaign(id: string, areaId?: string): Result {
    if (areaId && !this.sns.areas.includes(areaId)) return { ok: false, reason: '아직 열리지 않은 지역입니다' };
    const r = this.campaigns.start(id, this.day, this.money, areaId);
    if (!r.ok) return r;
    this.spend(r.cost);
    const d = this.campaigns.defs.get(id);
    const areaName = areaId ? (this.sns.areasById.get(areaId)?.name ?? areaId) : '';
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `${d?.name ?? id} 시작`, body: d?.kind === 'bus' ? `${areaName}에서 ${d.days}일 동안 매일 아침 버스 · −${r.cost.toLocaleString('ko-KR')}G` : `${d?.days ?? 0}일 동안 손님 ×${d?.mul ?? 1} · −${r.cost.toLocaleString('ko-KR')}G` });
    return { ok: true };
  }

  // ── 버스 (G33) — 원작: 캠페인 「버스 송영」은 고른 지역에서 2일간 매일 아침, 지역 좋아요가 사다리를 넘기면 다음날 아침 자동 1대 ──
  /** 내일 아침 버스 (폐장 때 채운다) */
  private busQueue: BusPlan[] = [];
  /** 오늘 남은 버스 (개장 때 큐에서 옮긴다) */
  private busesToday: BusPlan[] = [];
  /** 도로 위 버스 — 렌더가 보간한다. 없으면 null */
  busState: BusState | null = null;
  /** P17 팀 번호 — 버스마다 하나 · P27 걸어온 무리마다 하나 */
  teamSeq = 0;
  private walkinTeam = 0;
  private walkinLeft = 0;

  /** 오늘 아침 버스 계획 — 캠페인 버스 + 좋아요 버스. 개장 때 한 번 */
  private planBuses(): void {
    this.busesToday = [...this.busQueue];
    this.busQueue = [];
    const camp = this.campaigns.busArea(this.day);
    if (camp) this.busesToday.push({ areaId: camp, seats: this.b.busSeats ?? 12, source: 'campaign' });
  }

  /** 내일 올 버스 수 (지역별) — 캠페인 창이 「내일 버스 N대」로 보여 준다 */
  busesPlannedFor(areaId: string): number {
    const queued = this.busQueue.filter((p) => p.areaId === areaId).length;
    const camp = this.campaigns.busArea(this.day + 1) === areaId ? 1 : 0;
    return queued + camp;
  }

  /** 검사용 — 오늘 남은 버스 수 */
  busesLeftToday(): number { return this.busesToday.length; }

  private stepBus(): void {
    const travel = this.b.busTravelTicks ?? 24;
    const drop = this.b.busDropTicks ?? 4;
    if (!this.busState) {
      if (this.tick < (this.b.busArriveTick ?? 60) || this.tick >= CLOSING_TICK) return;
      const next = this.busesToday.shift();
      if (!next) return;
      this.teamSeq++; // P17 버스 = 팀 하나
      this.busState = { areaId: next.areaId, seatsLeft: next.seats, phase: 'in', t: 0, source: next.source, team: this.teamSeq };
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `${this.sns.areasById.get(next.areaId)?.bus ?? `${this.sns.areasById.get(next.areaId)?.name ?? next.areaId} 버스`} 도착`, body: `${next.seats}명이 내린다${next.source === 'likes' ? ' — 주민들의 좋아요 덕분' : ''}` });
      return;
    }
    const bs = this.busState;
    if (bs.phase === 'in') {
      bs.t = Math.min(1, bs.t + 1 / travel);
      if (bs.t >= 1) { bs.phase = 'stop'; bs.t = 0; this.fx.push({ kind: 'bus', i: this.gate.i, j: ROAD_ROWS[1] as number }); } // P43: 차도(도시 띠)
      return;
    }
    if (bs.phase === 'stop') {
      bs.t++;
      if (bs.t % drop === 0 && bs.seatsLeft > 0) { this.spawnBusGuest(bs.areaId); bs.seatsLeft--; }
      if (bs.seatsLeft <= 0) { bs.phase = 'out'; bs.t = 0; }
      return;
    }
    bs.t = Math.min(1, bs.t + 1 / travel);
    if (bs.t >= 1) this.busState = null;
  }

  /** 버스 손님 한 명 — 그 지역 친구가 있으면 친구(지금 파크에 없는 사람), 없으면 그 지역 사는 일반 손님. 동시 상한을 넘겨도 내린다(원작: 버스 날은 붐빈다) */
  private spawnBusGuest(areaId: string): void {
    const areaName = this.sns.areasById.get(areaId)?.name ?? areaId;
    const cands = this.sns.unlockedFriends.filter((st) => this.sns.friendDef(st.id)?.area === areaId && !this.guests.all.some((g) => g.friendId === st.id));
    const pick = this.rng.spawn.int(Math.max(1, cands.length)); // 뽑기 횟수는 후보가 없어도 같다 — 스트림 밀림 방지
    const fst = cands[pick];
    const fdef = fst ? this.sns.friendDef(fst.id) : undefined;
    if (fdef) { const at = this.friendsToday.indexOf(fdef.id); if (at >= 0) this.friendsToday.splice(at, 1); }
    const owned = fdef ? (this.sns.friends.get(fdef.id)?.gifts ?? []) : [];
    const ownFloat = owned.map((id) => FLOAT_BY_GIFT[id] ?? 0).find((n) => n > 0) ?? 0;
    const g = this.guests.spawn(fdef ? { id: fdef.id, palette: fdef.palette, name: fdef.name, age: fdef.age, gender: fdef.gender, home: areaName, float: ownFloat } : undefined, areaName, this.sns.areasById.get(areaId)?.taste);
    g.teamId = this.busState?.team ?? null; this.stats.teamGuests = (this.stats.teamGuests ?? 0) + 1; // P17 팀
    if (fdef) { const st = this.sns.friends.get(fdef.id); if (st) { st.visits++; if (st.visits === 1) g.say = firstVisitLine(fdef); } }
    const ticket = this.ticketFor(fdef ? { id: fdef.id } : null);
    this.money += ticket;
    this.ticketsToday += ticket;
    this.stats.visitors++;
    this.stats.tickets += ticket;
    this.stats.busGuests = (this.stats.busGuests ?? 0) + 1;
    this.fx.push({ kind: 'coin', i: g.i, j: g.j, amount: ticket });
  }

  /** P20 — 코스가 지날 수 있는 트인 물(강·여울, 부표 안 물 제외, 내 수면 허가 안) */
  isOpenWater(i: number, j: number): boolean {
    if (!this.grid.inside(i, j)) return false;
    const c = this.grid.at(i, j);
    return isWaterCode(c) && c !== FLOOR.pool && this.inMyWater(i, j);
  }

  // ── P17 팀 자리 · 패키지 (D25) ──
  /** P24 자리 반경 */
  static readonly SEAT_RADIUS = 3;
  /** 반경 안 발자국(가상 배치도 가능) — 등급 항목별 판정. 파생값, 저장 안 함 */
  /** P60-e B4 — `food` 는 반경 안 점포에 걸린 메뉴 카테고리(음료·간식·식사·디저트) 수 `foodKinds` 에서 파생한다(k > 0). 등급은 +1 이 아니라 +⌊k/2⌋ — 구색이 곧 자리 값 */
  seatGradeAt(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): { grade: number; shade: boolean; view: boolean; garden: boolean; food: boolean; foodKinds: number; water: boolean; dirty: boolean; loud: boolean } {
    const fp = FacilityStore.footprint(def, i, j, facing);
    const i0 = Math.min(...fp.map((t) => t.i)) - Game.SEAT_RADIUS, i1 = Math.max(...fp.map((t) => t.i)) + Game.SEAT_RADIUS;
    const j0 = Math.min(...fp.map((t) => t.j)) - Game.SEAT_RADIUS, j1 = Math.max(...fp.map((t) => t.j)) + Game.SEAT_RADIUS;
    const inR = (a: number, b: number): boolean => a >= i0 && a <= i1 && b >= j0 && b <= j1;
    let garden = 0, water = false;
    for (let b = j0; b <= j1; b++) for (let a = i0; a <= i1; a++) {
      if (!this.grid.inside(a, b)) continue;
      const c = this.grid.at(a, b);
      if (DECOR_GROUNDS.has(c)) garden++;
      if (isWaterCode(c)) water = true;
    }
    const cats = new Set<string>(); let dirty = false, loud = false;
    for (const o of this.facilities.all) {
      if (o.uid === selfUid) continue;
      const od = this.facilities.defOf(o);
      if (!FacilityStore.footprint(od, o.i, o.j, o.facing).some((t) => inR(t.i, t.j))) continue;
      if (od.menuSlots > 0) for (const r of this.menus.equipped(o.uid)) cats.add(r.cat); // P60-e B4: 걸린 메뉴의 카테고리 — 빈 점포는 0
      if (od.id === 'dock' || od.id === 'shower_row') water = true;
      if (od.class === 'decor') garden += 2;
      if (od.noisy === 'dirty') dirty = true;
      if (od.noisy === 'loud' || od.class === 'slide') loud = true;
    }
    const shade = def.shade === true || isIndoorCode(this.grid.at(i, j)); // P45-c: 실내(지붕)는 그늘
    const view = this.viewAt(def, i, j) >= 1;
    const foodKinds = cats.size, food = foodKinds > 0;
    const g = (shade ? 1 : 0) + (view ? 1 : 0) + (garden >= 2 ? 1 : 0) + Math.floor(foodKinds / 2) + (water ? 2 : 0) - (dirty ? 1 : 0) - (loud ? 1 : 0);
    return { grade: Math.max(0, Math.min(5, g)), shade, view, garden: garden >= 2, food, foodKinds, water, dirty, loud };
  }
  private seatGradeCache = new Map<number, { key: string; v: ReturnType<Game['seatGradeAt']> }>();
  /** 자리 등급 0~5 (D29) — 그늘·뷰·조경·먹거리 +1 · 물 +2 · 화장실·소음 −1. 평상 만족·팀 선택·1박·패키지 값이 이걸 본다 */
  seatGradeOf(uid: number): ReturnType<Game['seatGradeAt']> {
    const f = this.facilities.byUid(uid);
    if (!f) return { grade: 0, shade: false, view: false, garden: false, food: false, foodKinds: 0, water: false, dirty: false, loud: false };
    const key = `${this.facilities.version}|${this.groundVersion}|${this.pools.version}|${this.menuVersion}`; // P60-e: 구색(메뉴)도 등급을 바꾼다
    const hit = this.seatGradeCache.get(uid);
    if (hit && hit.key === key) return hit.v;
    const v = this.seatGradeAt(this.facilities.defOf(f), f.i, f.j, f.facing, uid);
    this.seatGradeCache.set(uid, { key, v });
    return v;
  }
  /** 반경 3 안의 자리 수 — 먹거리·화로대·샤워 시설이 「먹여 주는 자리」 (가상 배치도) */
  seatsFedAt(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): number {
    const fp = FacilityStore.footprint(def, i, j, facing);
    const i0 = Math.min(...fp.map((t) => t.i)) - Game.SEAT_RADIUS, i1 = Math.max(...fp.map((t) => t.i)) + Game.SEAT_RADIUS;
    const j0 = Math.min(...fp.map((t) => t.j)) - Game.SEAT_RADIUS, j1 = Math.max(...fp.map((t) => t.j)) + Game.SEAT_RADIUS;
    let n = 0;
    for (const o of this.facilities.all) { if (o.uid === selfUid) continue; const od = this.facilities.defOf(o); if (od.class !== 'lounging') continue; if (FacilityStore.footprint(od, o.i, o.j, o.facing).some((t) => t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1)) n++; }
    return n;
  }
  /** P30 D38 — 이 시설(매점·샤워장)이 먹여 주는 자리들의 발자국. `seatsFedAt` 과 **같은 상자**를 본다 (오버레이가 테두리만 훑어 안쪽 자리를 놓쳤던 실측) */
  seatsFedTiles(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): { i: number; j: number }[] {
    const fp = FacilityStore.footprint(def, i, j, facing);
    const i0 = Math.min(...fp.map((t) => t.i)) - Game.SEAT_RADIUS, i1 = Math.max(...fp.map((t) => t.i)) + Game.SEAT_RADIUS;
    const j0 = Math.min(...fp.map((t) => t.j)) - Game.SEAT_RADIUS, j1 = Math.max(...fp.map((t) => t.j)) + Game.SEAT_RADIUS;
    const out: { i: number; j: number }[] = [];
    for (const o of this.facilities.all) {
      if (o.uid === selfUid) continue;
      const od = this.facilities.defOf(o); if (od.class !== 'lounging') continue;
      const ofp = FacilityStore.footprint(od, o.i, o.j, o.facing);
      if (ofp.some((t) => t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1)) out.push(...ofp);
    }
    return out;
  }
  /** 반경 마름모(정사각) 칸 — 조준 표시용 */
  seatRadiusTiles(def: FacilityDef, i: number, j: number, facing: 0 | 1): { i: number; j: number }[] {
    const fp = FacilityStore.footprint(def, i, j, facing);
    const i0 = Math.min(...fp.map((t) => t.i)) - Game.SEAT_RADIUS, i1 = Math.max(...fp.map((t) => t.i)) + Game.SEAT_RADIUS;
    const j0 = Math.min(...fp.map((t) => t.j)) - Game.SEAT_RADIUS, j1 = Math.max(...fp.map((t) => t.j)) + Game.SEAT_RADIUS;
    const out: { i: number; j: number }[] = [];
    for (let b = j0; b <= j1; b++) for (let a = i0; a <= i1; a++) if (this.grid.inside(a, b) && (a === i0 || a === i1 || b === j0 || b === j1)) out.push({ i: a, j: b });
    return out;
  }
  /** 옛 이름(P17·P22) — 등급의 다른 얼굴. value = 등급, landscaped = 조경 */
  seatValueOf(uid: number): { value: number; shade: boolean; view: number; near: boolean; landscaped: boolean } {
    const g = this.seatGradeOf(uid);
    return { value: g.grade, shade: g.shade, view: g.view ? 1 : 0, near: g.food, landscaped: g.garden };
  }

  /** P25 D31 — 이 자리(가상 배치도) 반경 3 의 구성으로 성립하는 패키지들. 발견·부착은 배치가 정한다 */
  seatPackagesAt(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): PackageDef[] {
    const has = this.radiusNeeds(def, i, j, facing, selfUid);
    return PACKAGES.filter((pk) => pk.needsInRadius.every((k) => has[k]));
  }
  /** 자리의 반경 구성 (검사용) — `seatPackagesAt` 이 보는 것과 같은 표 */
  radiusNeedsOf(uid: number): Record<'food' | 'dock' | 'water' | 'lodging' | 'fire' | 'ppaji', boolean> | null {
    const f = this.facilities.byUid(uid);
    return f ? this.radiusNeeds(this.facilities.defOf(f), f.i, f.j, f.facing, uid) : null;
  }
  private radiusNeeds(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): Record<'food' | 'dock' | 'water' | 'lodging' | 'fire' | 'ppaji', boolean> {
    const fp = FacilityStore.footprint(def, i, j, facing);
    const i0 = Math.min(...fp.map((t) => t.i)) - Game.SEAT_RADIUS, i1 = Math.max(...fp.map((t) => t.i)) + Game.SEAT_RADIUS;
    const j0 = Math.min(...fp.map((t) => t.j)) - Game.SEAT_RADIUS, j1 = Math.max(...fp.map((t) => t.j)) + Game.SEAT_RADIUS;
    const has = { food: false, dock: false, water: false, lodging: def.lodging === true, fire: false, ppaji: false };
    for (const p of this.pools.all) { if (this.ppajiGradeOf(p.id) >= 1 && p.tiles.some((k) => { const a = k % this.grid.w, b = Math.floor(k / this.grid.w); return a >= i0 && a <= i1 && b >= j0 && b <= j1; })) { has.ppaji = true; break; } } // P48-c · P50-b2: **켜진 빠지**(등급 ≥ 1)만 — 자유이용권 패키지 발견이 첫 등급 상승과 같은 tick 에 온다(§1.5 1:40): 반경 안 빠지(수역) — 패키지 'ppaji' 조건은 P52-a 부터 쓴다
    for (let b = j0; b <= j1 && !has.water; b++) for (let a = i0; a <= i1; a++) if (this.grid.inside(a, b) && isWaterCode(this.grid.at(a, b))) { has.water = true; break; }
    for (const o of this.facilities.all) {
      if (o.uid === selfUid) continue;
      const od = this.facilities.defOf(o);
      if (!FacilityStore.footprint(od, o.i, o.j, o.facing).some((t) => t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1)) continue;
      if (od.menuSlots > 0) has.food = true;
      if (od.id === 'dock' && this.courses.all.some((c) => Math.round(c.dock.x) === o.i && Math.round(c.dock.y) === o.j)) has.dock = true;
      if (od.id === 'dock' || od.id === 'shower_row') has.water = true;
      if (od.lodging === true) has.lodging = true;
      if (od.fire === true) has.fire = true;
    }
    return has;
  }
  seatPackages(uid: number): PackageDef[] {
    const f = this.facilities.byUid(uid);
    return f ? this.seatPackagesAt(this.facilities.defOf(f), f.i, f.j, f.facing, uid) : [];
  }
  /** 팀원이 자리에서 사는 패키지 — 그 자리에 성립하는 것 중 출신지 취향 순 */
  packageFor(g: Guest, seatUid: number): { def: PackageDef; price: number } | null {
    const taste = g.taste;
    const order = this.seatPackages(seatUid).filter((p) => p.id !== 'ppaji' || this.bandPaid.get(this.bandKey(g)) !== this.day).sort((a, b) => (taste?.[b.taste] ?? 1) - (taste?.[a.taste] ?? 1) || a.id.localeCompare(b.id)); // P52-a: 팔찌를 산 팀에겐 band 패키지를 후보에서 뺀다
    const pk = order[0];
    if (!pk) return null;
    if (pk.needsInRadius.includes('dock')) {
      const fees = this.courses.all.map((c) => courseEquipment(c.equipId)?.fee ?? 0).filter((x) => x > 0);
      return { def: pk, price: Math.round(Math.min(...fees) * (pk.feeMul ?? 1)) + pk.price };
    }
    return { def: pk, price: pk.price };
  }
  /** 발견 — 판에서 처음 성립한 패키지는 알림 한 줄(부팅 모달 금지 — 하네스가 죽는다) · 자리에서 사라지면 토스트 */
  readonly packagesSeen = new Set<string>();
  private seatPkgCache = new Map<number, string[]>();
  /** 로드 뒤 — 「사라졌다」 대조용 캐시를 알림 없이 채운다(파생 · 저장 0). 안 채우면 저장 전 판만 토스트를 내서 스냅샷 왕복 해시가 갈린다(P50-b1 골든이 잡았다) */
  private primePackageCache(): void {
    const now = new Map<number, string[]>();
    for (const f of this.facilities.all) if (this.facilities.defOf(f).class === 'lounging') now.set(f.uid, this.seatPackages(f.uid).map((p) => p.id));
    this.seatPkgCache = now;
  }
  private notePackages(): void {
    const now = new Map<number, string[]>();
    for (const f of this.facilities.all) {
      if (this.facilities.defOf(f).class !== 'lounging') continue;
      const ids = this.seatPackages(f.uid).map((p) => p.id);
      now.set(f.uid, ids);
      for (const id of ids) {
        if (this.packagesSeen.has(id)) continue;
        this.packagesSeen.add(id);
        const pk = PACKAGES.find((p) => p.id === id);
        this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: `패키지 발견 · ${pk?.name ?? id}`, body: `${this.facilities.defOf(f).name} 자리의 반경에 ${pk?.desc ?? ''}` });
        this.fx.push({ kind: 'discover', i: f.i, j: f.j, amount: 1, label: pk?.name ?? id });
      }
      const before = this.seatPkgCache.get(f.uid);
      if (before) for (const id of before) if (!ids.includes(id)) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `${PACKAGES.find((p) => p.id === id)?.name ?? id} 가 사라졌다`, body: `${this.facilities.defOf(f).name} 자리 반경에서 재료가 빠졌다` });
    }
    this.seatPkgCache = now;
  }

  private checkIn(g: Guest, f: PlacedFacility): void {
    const def = this.facilities.defOf(f);
    g.stays = true;
    if (g.seatUid === null) g.seatUid = f.uid;
    const fee = def.usageFee;
    if (fee > 0) {
      this.money += fee;
      this.lodgingToday += fee;
      this.stats.lodging = (this.stats.lodging ?? 0) + fee;
      f.incomeToday += fee; f.incomeTotal += fee; g.spentToday += fee;
      this.fx.push({ kind: 'buy', i: g.i, j: g.j, amount: fee, label: `1박 · ${def.name}` });
    }
  }

  /** P27 자리 회전 — 팀(혹은 혼자 온 손님)이 전부 파크를 나가면 그 열쇠로 대여한 자리를 놓는다. 전에는 하루 종일 묶여 있어 첫 두 팀 뒤로는 아무도 못 앉았다(실측 팀 자리 0.13~0.36) */
  private releaseTeamSeats(g: Guest): void {
    const key = rentKey(g);
    if (this.guests.all.some((o) => o !== g && o.state !== 'gone' && rentKey(o) === key)) return;
    for (const f of this.facilities.all) if (f.rentedBy === key) f.rentedBy = null;
  }
  /** 오늘 자리를 잡은 팀 (팀 단위 지표 — 걸어온 손님도 팀이라 손님 비율은 구조적으로 낮다) */
  private teamSeatedIds = new Set<number>();
  /** P28-b D35 — 팀이 이미 빌렸거나(열쇠) 앉은(seatUid) 자리. 없으면 null. 한 팀이 두 줄을 빌리면 다른 팀이 자리를 못 잡는다(실측 킷 두 줄 · 14팀 서성임) */
  teamSeatUid(g: Guest): number | null {
    if (g.teamId === null) return null;
    const key = rentKey(g);
    for (const f of this.facilities.all) if (f.rentedBy === key && this.facilities.defOf(f).class === 'lounging') return f.uid;
    for (const o of this.guests.all) if (o.teamId === g.teamId && o.seatUid !== null) return o.seatUid;
    return null;
  }

  private claimSeat(g: Guest, f: PlacedFacility): void {
    g.seatUid = f.uid;
    this.stats.teamSeated = (this.stats.teamSeated ?? 0) + 1;
    if (g.teamId !== null && !this.teamSeatedIds.has(g.teamId)) { this.teamSeatedIds.add(g.teamId); this.stats.teamsSeated = (this.stats.teamsSeated ?? 0) + 1; }
    // P27: 패키지는 **팀당 하루 한 번** — 같은 팀원이 이미 이 자리에서 샀으면 대표만 산 것으로 친다 (전원이 사면 패키지가 매점을 덮었다: 몫 0.36)
    if (this.guests.all.some((o) => o !== g && o.teamId === g.teamId && o.seatUid === f.uid && o.pkg !== null)) return;
    const pk0 = this.packageFor(g, f.uid);
    if (!pk0 || g.pkg) return;
    if (pk0.def.id === 'ppaji') { const pid = this.nearestPpajiPool(f); const grade = pid === null ? 0 : this.ppajiGradeOf(pid); const opened = WRISTBANDS.filter((t) => t.grade <= grade); this.issueBand(g, bandFor(g.taste?.thrill ?? 1, opened, 0), grade, f, { poolId: pid }); return; } // P52-a 창구 ⓑ — 자리 배수·결제 다섯 줄을 통째로 건너뛴다(값은 그 빠지 등급)
    const pk = { def: pk0.def, price: Math.round(pk0.price * (1 + 0.1 * this.seatGradeOf(f.uid).grade)) }; // P24: 좋은 자리의 패키지가 더 비싸다
    g.pkg = pk.def.id; g.pkgUsed = false;
    this.money += pk.price;
    this.stats.pkg = (this.stats.pkg ?? 0) + pk.price;
    f.incomeToday += pk.price; f.incomeTotal += pk.price; g.spentToday += pk.price;
    if (pk.price > 0) this.fx.push({ kind: 'buy', i: g.i, j: g.j, amount: pk.price, label: pk.def.name });
  }

  // ── 길 (P16 D24) — 손님은 길·데크·실내만 걷는다. 길을 까는 것이 동선 설계다 ──
  canPaintPath(i: number, j: number): Result {
    if (!this.grid.inside(i, j) || !this.ownsTile(i, j)) return { ok: false, reason: '아직 내 땅이 아닙니다 — 랭크를 올리면 마당이 넓어집니다' };
    const f = this.grid.at(i, j);
    if (f === FLOOR.path || f === FLOOR.hall) return { ok: false, reason: '이미 길입니다' };
    if (f !== FLOOR.grass && f !== FLOOR.indoor) return { ok: false, reason: '길은 잔디·실내 바닥 위에만 깝니다 — 물엔 데크' }; // P45-a: 실내 바닥 위의 길 = 복도(출구가 곧 문)
    if (this.facilities.occupied(i, j)) return { ok: false, reason: '시설이 있는 칸입니다' };
    return { ok: true };
  }
  paintPath(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '깔 칸이 없습니다' };
    for (const t of tiles) { const r = this.canPaintPath(t.i, t.j); if (!r.ok) return r; }
    const cost = tiles.length * PATH_COST;
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    this.spend(cost);
    for (const t of tiles) { this.grid.set(t.i, t.j, this.grid.at(t.i, t.j) === FLOOR.indoor ? FLOOR.hall : FLOOR.path); this.fx.push({ kind: 'place', i: t.i, j: t.j }); } // P45-a 복도
    this.afterWorldChange();
    return { ok: true };
  }
  unpaintPath(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '걷을 칸이 없습니다' };
    for (const t of tiles) {
      { const c = this.grid.at(t.i, t.j); if (c !== FLOOR.path && c !== FLOOR.hall && !isGround(c)) return { ok: false, reason: '길이나 지면이 아닙니다' }; } // P22: 지면도 걷는다 · P45-a 복도
      if (t.i === this.gate.i && t.j === this.gate.j) return { ok: false, reason: '입구는 걷을 수 없습니다' };
      if (this.facilities.occupied(t.i, t.j)) return { ok: false, reason: '시설 아래 길은 걷을 수 없습니다' };
    }
    const before = tiles.map((t) => this.grid.at(t.i, t.j));
    const broke = this.breaksAccess(() => { for (const t of tiles) this.grid.set(t.i, t.j, before[tiles.indexOf(t)] === FLOOR.hall ? FLOOR.indoor : this.grid.naturalAt(t.i, t.j)); }, () => { tiles.forEach((t, k) => this.grid.set(t.i, t.j, before[k] as FloorCode)); }, tiles.length);
    if (broke) return { ok: false, reason: '그 길을 걷으면 어딘가로 가는 길이 끊깁니다' };
    this.groundVersion++;
    for (const t of tiles) { this.grid.set(t.i, t.j, before[tiles.indexOf(t)] === FLOOR.hall ? FLOOR.indoor : this.grid.naturalAt(t.i, t.j)); this.fx.push({ kind: 'fill', i: t.i, j: t.j }); } // P45-a: 복도를 걷으면 실내 바닥 · P48-a: 밖은 자연 바닥(암반 위 길을 걷으면 암반)
    this.afterWorldChange();
    return { ok: true };
  }
  // ── P23 기본 메뉴 (D34) — 봇의 점수(궁합 ⊚ ×1.5 · △ ×0.5 · 새 카테고리 +3)를 Game 으로 옮겼다. 봇도 이 함수를 쓴다 ──
  autoEquipMenus(uid: number, upTo = 3): number {
    const f = this.facilities.byUid(uid);
    if (!f) return 0;
    const def = this.facilities.defOf(f);
    if (def.menuSlots === 0) return 0;
    let n = 0;
    for (let k = 0; k < upTo; k++) {
      const slots = this.menus.slotsOf(uid);
      const empty = slots.indexOf(null);
      if (empty < 0) break;
      const have = new Set(this.menus.equipped(uid).map((r) => r.cat));
      // ⚠ Set 순서는 스냅샷 왕복 뒤 달라진다 — id 로 정렬해야 결정론이 산다
      const best = [...this.cooking.known].sort().map((id) => this.menus.recipes.get(id)).filter((r): r is NonNullable<typeof r> => !!r && !slots.includes(r.id))
        .map((r) => ({ r, score: r.pop * (this.menus.compatOf(def.id, r.id) === 'good' ? 1.5 : this.menus.compatOf(def.id, r.id) === 'bad' ? 0.5 : 1) + (have.has(r.cat) ? 0 : 3) }))
        .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id))[0];
      if (!best || !this.setMenu(uid, empty, best.r.id).ok) break;
      n++;
    }
    return n;
  }

  // ── P22 지면 붓 (D28) — 잔디·길·다른 지면 위에 값을 내고 깐다. 포장 지면은 길처럼 걷고, 조경 지면은 옆 평상의 자리 값을 올린다 ──
  groundVersion = 0;
  canPaintGround(i: number, j: number, groundId: string): Result {
    const def = GROUND_BY_ID.get(groundId);
    if (!def) return { ok: false, reason: '알 수 없는 지면' };
    if (!this.grid.inside(i, j) || !this.ownsTile(i, j)) return { ok: false, reason: '아직 내 땅이 아닙니다 — 랭크를 올리면 마당이 넓어집니다' };
    const f = this.grid.at(i, j);
    if (f === (FLOOR as Record<string, number>)[def.id]) return { ok: false, reason: `이미 ${def.name}입니다` };
    if (!isLandFloor(f)) return { ok: false, reason: '지면은 잔디·길 위에만 깝니다 — 물엔 데크, 실내엔 바닥' };
    if (i === this.gate.i && j === this.gate.j) return { ok: false, reason: '입구는 못 바꿉니다' };
    if (this.facilities.occupied(i, j)) return { ok: false, reason: '시설이 있는 칸입니다' };
    return { ok: true };
  }
  groundCost(tiles: readonly { i: number; j: number }[], groundId: string): number { return tiles.length * (GROUND_BY_ID.get(groundId)?.cost ?? 0); }
  paintGround(tiles: readonly { i: number; j: number }[], groundId: string): Result {
    const def = GROUND_BY_ID.get(groundId);
    if (!def) return { ok: false, reason: '알 수 없는 지면' };
    if (tiles.length === 0) return { ok: false, reason: '깔 칸이 없습니다' };
    for (const t of tiles) { const r = this.canPaintGround(t.i, t.j, groundId); if (!r.ok) return r; }
    const cost = this.groundCost(tiles, groundId);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    const code = (FLOOR as Record<string, number>)[def.id] as FloorCode;
    // 조경 지면은 못 걷는다 — 길 위에 덮으면 동선이 끊길 수 있다 (전후 비교)
    if (!def.walk) {
      const before = tiles.map((t) => this.grid.at(t.i, t.j));
      if (this.breaksAccess(() => { for (const t of tiles) this.grid.set(t.i, t.j, code); }, () => { tiles.forEach((t, k) => this.grid.set(t.i, t.j, before[k] as FloorCode)); }, tiles.length)) return { ok: false, reason: '그 자리를 덮으면 어딘가로 가는 길이 끊깁니다' };
    }
    this.spend(cost);
    for (const t of tiles) { this.grid.set(t.i, t.j, code); this.fx.push({ kind: 'place', i: t.i, j: t.j }); }
    this.groundVersion++;
    this.afterWorldChange();
    return { ok: true };
  }
  /** P26 D32 — 시설의 경관: 발자국 둘레 2칸 안 장식 시설 scenery 합 + 조경 지면 ×2. 인기 += floor(합/6)(시설당 상한 20) · 식당 판매가 +min(10, 합/4)% */
  static readonly SCENERY_RADIUS = 2;
  private sceneryCache = new Map<number, { key: string; v: number }>();
  sceneryOf(uid: number): number {
    const f = this.facilities.byUid(uid);
    if (!f) return 0;
    const key = `${this.facilities.version}|${this.groundVersion}`;
    const hit = this.sceneryCache.get(uid);
    if (hit && hit.key === key) return hit.v;
    const def = this.facilities.defOf(f);
    const fp = FacilityStore.footprint(def, f.i, f.j, f.facing);
    const i0 = Math.min(...fp.map((t) => t.i)) - Game.SCENERY_RADIUS, i1 = Math.max(...fp.map((t) => t.i)) + Game.SCENERY_RADIUS;
    const j0 = Math.min(...fp.map((t) => t.j)) - Game.SCENERY_RADIUS, j1 = Math.max(...fp.map((t) => t.j)) + Game.SCENERY_RADIUS;
    let sum = 0;
    for (let b = j0; b <= j1; b++) for (let a = i0; a <= i1; a++) if (this.grid.inside(a, b) && DECOR_GROUNDS.has(this.grid.at(a, b))) sum += 2;
    for (const o of this.facilities.all) {
      if (o.uid === uid) continue;
      const od = this.facilities.defOf(o);
      if (!od.scenery) continue;
      if (FacilityStore.footprint(od, o.i, o.j, o.facing).some((t) => t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1)) sum += od.scenery;
    }
    this.sceneryCache.set(uid, { key, v: sum });
    return sum;
  }
  /** 경관 인기 — 장식 자신은 빼고(장식은 제 인기가 있다) 시설마다 floor(경관/6), 시설당 상한 20 */
  sceneryPopularity(): number {
    let n = 0;
    for (const f of this.facilities.all) if (this.facilities.defOf(f).class !== 'decor') n += Math.min(20, Math.floor(this.sceneryOf(f.uid) / 6));
    return n;
  }
  /** 조경 지면 칸 수 (인기 · 자리 값) */
  decorGroundTiles(): number { let n = 0; for (let k = 0; k < this.grid.floor.length; k++) if (DECOR_GROUNDS.has(this.grid.floor[k] as number)) n++; return n; }
  /** 지면 인기 — 6칸마다 pop 합, 상한 20 */
  groundPopularity(): number {
    let sum = 0;
    for (let k = 0; k < this.grid.floor.length; k++) { const c = this.grid.floor[k] as number; if (isGround(c)) sum += GROUND_BY_ID.get(FLOOR_NAMES[c] as string)?.pop ?? 0; }
    return Math.min(20, Math.floor(sum / 6));
  }

  /** 시설에 길이 닿았나 — 입구 고리 중 걸을 수 있고 입구에서 닿는 칸이 하나라도 */
  /** P31 — 놓기 전에 길을 낸다(API·하네스용). `ensurePath(uid)` 와 같은 규칙을 아직 없는 발자국의 둘레에 적용한다 — 접면 규칙 아래에서 「길을 먼저 낸 플레이어」를 흉내낸다 */
  autoPathFor(defId: string, i: number, j: number, facing: 0 | 1 = 0): number {
    const def = FACILITY_DEFS.get(defId);
    if (!def) return 0;
    if (def.class === 'rig' || def.onRing === true) return 0; // P50-a R8: 기구·링 시설은 자동 길 면제
    if (this.ringHasPath(def, i, j, facing)) return 0;
    const blob = this.grid.blobAt(i, j);
    if (blob) return this.ensurePathToRing(this.blobOutside(blob), true); // P44-c: 실내 자리면 건물 둘레까지 통로를 깐다(문이 나야 닿는다)
    return this.ensurePathToRing(FacilityStore.ring(def, i, j, facing));
  }
  /** 실내 덩어리의 바깥 둘레 칸들 (뭍 바닥만) */
  blobOutside(blob: number): { i: number; j: number }[] {
    const out: { i: number; j: number }[] = []; const seen = new Set<number>();
    for (let j = 0; j < this.grid.h; j++) for (let i = 0; i < this.grid.w; i++) {
      if (this.grid.blobAt(i, j) !== blob) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const oi = i + di, oj = j + dj; if (!this.grid.inside(oi, oj) || isIndoorCode(this.grid.at(oi, oj))) continue; const k = oj * this.grid.w + oi; if (seen.has(k)) continue; seen.add(k); out.push({ i: oi, j: oj }); }
    }
    return out;
  }
  facilityHasPath(uid: number): boolean {
    const f = this.facilities.byUid(uid);
    if (!f) return false;
    const reach = this.reachSet();
    return FacilityStore.ring(this.facilities.defOf(f), f.i, f.j, f.facing).some((t) => this.grid.inside(t.i, t.j) && reach[t.j * this.grid.w + t.i] === 1);
  }
  private reachSet(): Uint8Array {
    const walk = (i: number, j: number): boolean => guestWalkable(this.grid, this.facilities, i, j); // P50-a: 술어 하나
    const reach = new Uint8Array(this.grid.w * this.grid.h);
    const q: number[] = [];
    const g = this.gate;
    reach[g.j * this.grid.w + g.i] = 1; q.push(g.j * this.grid.w + g.i);
    let head = 0;
    while (head < q.length) {
      const k = q[head++] as number; const i = k % this.grid.w; const j = Math.floor(k / this.grid.w);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (!this.grid.canCross(i, j, ni, nj)) continue; // P39 벽
        if (!this.grid.inside(ni, nj) || !walk(ni, nj) || !this.grid.canCross(i, j, ni, nj)) continue; // P45-a: 벽·문을 본다 — 마당 문 밖 통로를 걷어내면 마당 전체가 끊긴다
        const nk = nj * this.grid.w + ni;
        if (!reach[nk]) { reach[nk] = 1; q.push(nk); }
      }
    }
    return reach;
  }
  /**
   * 자동 길 (P16) — API(봇·킷·하네스)가 시설을 놓으면 입구 고리에서 가장 가까운 「닿는 칸」까지 잔디 위로 최단 길을 깔아 준다(길 값을 낸다).
   * 플레이어의 배치 독은 이걸 안 부른다 — 길을 어디로 낼지가 곧 설계라서. 돈이 모자라면 조용히 안 깐다.
   */
  ensurePath(uid: number): number {
    const f = this.facilities.byUid(uid);
    if (!f) return 0;
    const def = this.facilities.defOf(f);
    if (def.class === 'rig' || def.onRing === true) return 0; // P50-a R8
    // P39: 실내 시설은 건물 덩어리의 **바깥 둘레**가 길 목표다 — 길이 건물에 닿으면 문이 난다(문 = 덩어리마다 하나, 입구에 가까운 변)
    const blob = this.grid.blobAt(f.i, f.j);
    const ring = blob ? this.blobOutside(blob) : FacilityStore.ring(def, f.i, f.j, f.facing);
    const n = this.facilityHasPath(uid) ? 0 : this.ensurePathToRing(ring, !!blob); // P44-c: 실내 덩어리는 통로(포장)가 둘레에 닿아야 문이 난다 — 닿는 통로까지 깐다
    // P47: 정면 한 줄 자동 포장(P16)은 지웠다 — 마당은 어디든 걷는다(D52). 남는 것은 실내 덩어리에 통로를 닿게 하는 것뿐
    return n;
  }
  /** 칸 집합(입구 고리)에서 입구까지 잔디 위로 최단 길을 깐다. 이미 닿아 있으면 0 */
  ensurePathToRing(ring: readonly { i: number; j: number }[], corridor = false): number {
    const reach = this.reachSet();
    const w = this.grid.w;
    const done = (k: number): boolean => reach[k] === 1 && (!corridor || isCorridorFloor(this.grid.at(k % w, Math.floor(k / w))));
    if (ring.some((t) => this.grid.inside(t.i, t.j) && done(t.j * w + t.i))) return 0;
    const prev = new Int32Array(w * this.grid.h).fill(-2);
    const q: number[] = [];
    for (const t of ring) {
      if (!this.grid.inside(t.i, t.j)) continue;
      const c = this.grid.at(t.i, t.j);
      if (isLandFloor(c) && !this.facilities.occupied(t.i, t.j)) { const k = t.j * w + t.i; if (prev[k] === -2) { prev[k] = -1; q.push(k); } }
    }
    let head = 0, hit = -1;
    while (head < q.length && hit < 0) {
      const k = q[head++] as number; const i = k % w; const j = Math.floor(k / w);
      if (done(k)) { hit = k; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (!this.grid.inside(ni, nj) || !this.ownsTile(ni, nj) || !this.grid.canCross(i, j, ni, nj)) continue; // P39 벽
        const nk = nj * w + ni;
        if (prev[nk] !== -2) continue;
        const c = this.grid.at(ni, nj);
        if (!(isLandFloor(c) && !this.facilities.occupied(ni, nj))) continue;
        prev[nk] = k; q.push(nk);
      }
    }
    if (hit < 0) return 0;
    const tiles: { i: number; j: number }[] = [];
    for (let k = hit; k >= 0; k = prev[k] as number) { if (this.grid.at(k % w, Math.floor(k / w)) === FLOOR.grass) tiles.push({ i: k % w, j: Math.floor(k / w) }); if (prev[k] === -1) break; }
    if (tiles.length === 0) return 0;
    const r = this.paintPath(tiles);
    return r.ok ? tiles.length : 0;
  }

  canPaintIndoor(i: number, j: number): Result {
    if (!this.grid.inside(i, j) || !this.ownsTile(i, j)) return { ok: false, reason: '아직 내 땅이 아닙니다 — 랭크를 올리면 마당이 넓어집니다' };
    const g = this.gate;
    if (i === g.i && j === g.j) return { ok: false, reason: '입구는 안 됩니다' };
    const f = this.grid.at(i, j);
    if (f === FLOOR.pool) return { ok: false, reason: '풀 위는 실내 바닥을 못 깝니다 — 주변을 실내로 두르세요' };
    if (f === FLOOR.river || f === FLOOR.shallow || f === FLOOR.deck) return { ok: false, reason: '강·데크 위에는 실내 바닥을 못 깝니다' };
    if (isIndoorCode(f)) return { ok: false, reason: '이미 실내입니다' };
    if (this.facilities.occupied(i, j)) return { ok: false, reason: '시설이 있는 칸입니다' };
    return { ok: true };
  }

  paintIndoor(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '칠할 칸이 없습니다' };
    for (const t of tiles) { const r = this.canPaintIndoor(t.i, t.j); if (!r.ok) return r; }
    const cost = tiles.length * INDOOR_COST;
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    this.spend(cost);
    for (const t of tiles) { this.grid.set(t.i, t.j, FLOOR.indoor); this.fx.push({ kind: 'dig', i: t.i, j: t.j }); }
    this.afterWorldChange();
    return { ok: true };
  }

  unpaintIndoor(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '지울 칸이 없습니다' };
    for (const t of tiles) if (this.foodcourts.ownerAt(t.i, t.j) !== null) return { ok: false, reason: '푸드코트 아래 바닥은 지울 수 없습니다 — 먼저 영역을 지우세요' }; // P58-a
    for (const t of tiles) if (!isIndoorCode(this.grid.at(t.i, t.j))) return { ok: false, reason: '실내가 아닙니다' };
    // G57: 시설 아래 바닥을 지우면 실내 전용 시설이 잔디 위에 남는다
    for (const t of tiles) if (this.facilities.occupied(t.i, t.j)) return { ok: false, reason: '시설 아래 바닥은 지울 수 없습니다 — 먼저 시설을 옮기거나 철거하세요' };
    for (const t of tiles) { this.grid.set(t.i, t.j, this.grid.naturalAt(t.i, t.j)); this.fx.push({ kind: 'fill', i: t.i, j: t.j }); } // P48-a: 자연 바닥으로
    this.afterWorldChange();
    return { ok: true };
  }

  private runCalendar(): void {
    for (const e of dueEvents(CALENDAR_EVENTS, this.day, this.tick, this.calendarGiven, (c) => this.evaluateCondition(c), { firstCertPassDay: this.firstCertPassDay })) {
      this.calendarGiven.add(e.id);
      const got = this.grant(e.grant);
      const gp = e.grant as { kind: string; id?: string };
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: e.priority ?? 'modal', title: e.title, body: bodyWithReward(e.line, got), ...(gp.id ? { pic: { kind: gp.kind, id: gp.id } } : {}) }); // P56-a2 D8: 사장 편지 = 장면 위 물건 그림
    }
  }

  /** 친구에게 선물 — 돈이 나가고 만족 EXP 가 오른다 */
  giveGift(friendId: string, giftId: string): Result {
    const g = GIFTS_BY_ID.get(giftId);
    if (!g) return { ok: false, reason: '알 수 없는 선물' };
    if (!this.unlocked.gifts.has(giftId)) return { ok: false, reason: '아직 구할 수 없는 선물입니다' };
    if (g.price > this.money) return { ok: false, reason: `돈이 부족합니다 — ${g.price.toLocaleString('ko-KR')}G 필요` };
    const r = this.sns.giveGift(friendId, giftId, this.day);
    if (!r.ok) return r;
    this.spend(g.price);
    if (r.wish) this.announceWish(friendId, r.wish);
    return { ok: true };
  }

  likePost(postId: number): Result & { friend?: { name: string; exp: number } } {
    const r = this.sns.likePost(postId, this.day);
    if (r.ok) {
      const p = this.sns.allPosts.find((x) => x.id === postId);
      if (p) this.fx.push({ kind: 'like', i: this.gate.i, j: this.gate.j, amount: 5, ...(p.subject.kind === 'pool' ? { poolId: p.subject.ref } : {}) });
      // G53: 친구 글이면 소원 EXP 가 올라가고, 문턱을 넘으면 소원이 열린다
      if (r.friend?.opened) this.announceWish(r.friend.id, r.friend.opened);
      return r.friend ? { ok: true, friend: { name: r.friend.name, exp: r.friend.exp } } : { ok: true };
    }
    return r;
  }


  private announceWish(friendId: string, wish: WishDef): void {
    const name = this.sns.friendDef(friendId)?.name ?? friendId;
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'guest', priority: 'toast', title: `${name}의 소원 ☆${wish.idx + 1}`, body: wish.line });
  }

  get clock(): ClockView {
    return clockView(this.day, this.tick);
  }

  get gate(): { i: number; j: number } {
    return gateTile(this.rank);
  }

  /** P40 D50·D51 — 내 땅 = 랭크 사각형(울타리 친 마당). 확장은 랭크 사건이다 */
  ownsTile(i: number, j: number): boolean { return inRect(this.land, i, j) && !isWaterCode(this.grid.at(i, j)); } // P48-b2 W5: 물은 뭍이 아니다(굽이 물은 `inMyWater`)
  /** 랭크를 올리고 마당을 넓힌다(검사·하네스·봇 골든용 — 플레이어는 랭크 업 사건으로 넓어진다) */
  openLand(rank: number): void { this.rank = rank; this.grid.openLand(rank); this.guests.invalidate(); }

  /** 내 땅 — 랭크 사각형(울타리 친 마당) */
  get land() { return landRect(this.rank); }

  drainFx(): FxEvent[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  drainEvents(): GameEvent[] {
    return this.inbox.drain();
  }

  // ── 파생 ──────────────────────────────────────────────────────────

  poolState(id: number): PoolState | null {
    const p = this.pools.byId(id);
    if (!p) return null;
    // 인접 시설은 버전이 같으면 안 변한다 — 키에 넣지 말고 miss 때만 센다 (tick 마다 부르면 비용이 붙는다)
    const key = `${this.pools.version}|${this.facilities.version}|${seasonOf(this.day)}|${p.likes}|${this.weather}`;
    const hit = this.poolCache.get(id);
    if (hit && hit.key === key) return hit.state;
    const state = this.computePoolState(p);
    this.poolCache.set(id, { key, state });
    return state;
  }

  /** 캐시 없는 순수 계산 */
  private computePoolState(p: Pool): PoolState {
    const tiles = new Set(p.tiles);
    // 슬라이드의 AB 는 **출구 다음 칸이 이 풀일 때만** (§2.2 「출구 칸이 풀이면 착수」, G36) — 활강로 옆에 붙어 있다고 튀지 않는다
    const adj = this.facilities.adjacentTo(tiles).map((f) => {
      const d = this.facilities.defOf(f);
      if (!d.slide) return d;
      const ex = FacilityStore.exitTile(d, f.i, f.j, f.facing);
      const beyond = ex ? (f.facing === 0 ? { i: ex.i + 1, j: ex.j } : { i: ex.i, j: ex.j + 1 }) : null;
      const landsHere = beyond !== null && tiles.has(beyond.j * this.grid.w + beyond.i);
      return { ...d, landsHere };
    });
    // P49-a1 §3.7 인기 교체 — 물빛 칸값 합이 아니라 「칸 수 × 표준 × 빠지 등급 배율」. 등급 0 은 배율 1 이라 기구 0개 판은 옛 표준 타일 판과 같다(항등 게이트)
    const tilePopSum = p.tiles.length * this.b.tilePopStandard * (this.b.ppajiGradePopMul[this.ppajiGradeOf(p.id)] ?? 1) * (1 - (this.accidentCut.get(p.id) ?? 0)) + SET_POP_BONUS * this.setsOf(p.id).length; // P52-b: 사고 뒤 감쇠(반감) · P60-c: 세트마다 인기 +6(tilePopStandard 눈금 — 등급 배율·감쇠 밖)
    const tables = this.weather === 'rain' || this.weather === 'cloudy' ? { ...SEASON_TABLES, sun: [0, 0, 0, 0] as [number, number, number, number], ambientOutdoor: SEASON_TABLES.ambientOutdoor.map((t) => t + WEATHER_TEMP[this.weather]) as [number, number, number, number] } : SEASON_TABLES;
    return poolState(p, { adjacent: adj, season: seasonOf(this.day), tables, balance: this.b, indoor: this.poolIndoor(p.id), tilePopSum });
  }

  /** 실내 풀 = 모든 타일의 4이웃이 실내 바닥이거나 풀 (지붕 아래) */
  poolIndoor(id: number): boolean {
    const p = this.pools.byId(id);
    if (!p) return false;
    for (const k of p.tiles) {
      const i = k % this.grid.w;
      const j = Math.floor(k / this.grid.w);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const f = this.grid.at(i + di, j + dj);
        if (!isIndoorCode(f) && f !== FLOOR.pool) return false;
      }
    }
    return true;
  }

  private popCache: { key: string; value: number } | null = null;

  /** 파크 인기 = 풀 인기 합 + 시설 인기 합 (버전·계절이 같으면 캐시) */
  parkPopularity(): number {
    const key = `${this.groundVersion}|${this.pools.version}|${this.facilities.version}|${seasonOf(this.day)}|${this.menuVersion}|${this.staff.all.length}|${this.day}|${this.sns.totalLikes}`; // G57: 좋아요(풀 SE)도 키에
    if (this.popCache && this.popCache.key === key) return this.popCache.value;
    let n = this.facilities.totalPopularity(seasonOf(this.day));
    const cook = this.staff.mul('menuMul');
    for (const f of this.facilities.all) if (this.facilities.defOf(f).menuSlots > 0) n += Math.round(this.menus.menuPopularity(f.uid, f.defId) * cook);
    for (const p of this.pools.all) n += this.poolState(p.id)?.popularity ?? 0;
    for (const f of this.facilities.all) n += this.viewBonusOf(f); // P16 뷰
    n += this.combos().length * COMBO_POP; // P16 콤보
    n += this.sceneryPopularity(); // P26 경관 전염 (P22 지면 인기를 흡수 — 지면은 경관 ×2 로 들어간다)
    n += this.events.popBonus(this.day);
    this.popCache = { key, value: n };
    return n;
  }

  dailyMaintenance(): number {
    let m = this.facilities.totalMaintenance();
    for (const p of this.pools.all) m += this.poolState(p.id)?.maintenance ?? 0;
    m += this.courses.daily().upkeep; // 코스 기구 하루 유지비 (P4-A) — 시설·수역과 같은 지갑, 같은 랭크 배율
    // 후반 지출 곡선 (G30) — 랭크가 오를수록 같은 파크의 유지비가 는다 (★5 ≈ ×2). 돈이 남아도는 밴드 상한을 누른다
    return Math.round(m * Math.pow(this.b.maintRankMul ?? 1, this.rank)) + this.staffedCount() * PART_TIMER_WAGE;
  }

  /** 돈을 쓴다 — 누적 지출은 봇 밴드(후반 지출 비율)가 읽는다 (G30) */
  private spend(amount: number, kind?: 'deck' | 'rig' | 'convert'): void {
    this.money -= amount;
    this.stats.spent = (this.stats.spent ?? 0) + amount;
    if (kind === 'deck') this.stats.spentDeck = (this.stats.spentDeck ?? 0) + amount; // P50-b1 밴드 — 빠지 지출 구성(데크 · 기구 · 개조)
    else if (kind === 'rig') this.stats.spentRig = (this.stats.spentRig ?? 0) + amount;
    else if (kind === 'convert') this.stats.spentConvert = (this.stats.spentConvert ?? 0) + amount; // P51
  }

  /** 티켓 요금 (G30, R9) — 손님의 만족 레벨(0~3)로 오른다. 친구는 ☆ 수, 일반 손님은 어제 파크 퇴장 만족 레벨 */
  ticketFor(friend: { id: string } | null): number {
    const step = this.b.ticketSatStep ?? 0;
    const level = friend ? Math.min(3, this.sns.friends.get(friend.id)?.stars ?? 0) : Math.min(3, Math.floor(this.prevSatAvg / 25));
    return Math.round((this.b.ticketBase * (1 + step * level)) / 10) * 10 + this.ticketBonus;
  }

  /** 동시 손님 상한 — 랭크마다 +12 (G24: ★0 40 → ★5 100). 화면 밀도가 곧 보상이다 */
  /** P34 D43 — 매표소가 정원이다: 기본 + 랭크 + 매표소 수 × ticketCap. 실내동을 넓혀 매표소를 더 두면 손님이 더 들어온다 (기본 40 → 32 + 킷 매표소 1×8, 킷 세계는 그대로) */
  maxGuests(): number {
    const tickets = this.facilities.all.filter((f) => f.defId === 'ticket').length;
    return this.b.maxGuests + this.rank * (this.b.maxGuestsPerRank ?? 0) + tickets * (this.b.ticketCap ?? 0);
  }

  /** 오늘 유입 목표(명) — 인기·주말·계절 */
  dailyTarget(): number {
    // G33: 좋아요가 손님을 부른다 (매뉴얼 「좋아요 → 손님을 얻기 쉬워진다」). 포화형이라 10만 좋아요가 유입을 독점하지 않는다
    const likes = Math.min(this.b.arrivalLikesCap ?? 0, this.sns.totalLikes * (this.b.arrivalPerLike ?? 0));
    const base = this.b.arrivalBase + this.pools.totalOpenTiles() * this.b.arrivalPerPoolTile /* P50-a R7: 유입만 open — 물을 전부 덮는 것이 정답이 되지 않게 */ + this.parkPopularity() * this.b.arrivalPerPop + likes;
    const season = this.b.arrivalSeasonMul[seasonOf(this.day)] ?? 1;
    const weekend = isWeekend(this.day) ? this.b.arrivalWeekendMul : 1;
    return base * season * weekend * this.campaigns.mul(this.day) * WEATHER_ARRIVAL[this.weather] * this.events.arrivalMul(this.day);
  }

  isUnlocked(defId: string): boolean {
    return this.unlocked.facilities.has(defId);
  }

  // ── tick ──────────────────────────────────────────────────────────

  /** 본편이 끝났고 아직 엔딩을 안 봤으면 시간이 선다. 엔딩을 본 뒤에는 계속 흐른다(이어하기) */
  get haltedForEnding(): boolean {
    return this.clock.ended && !this.endingSeen;
  }

  step(n = 1): void {
    for (let k = 0; k < n; k++) {
      if (this.haltedForEnding) { this.checkStory(true); return; }
      this.stepOne();
      this.checkStory();
    }
  }

  private get absTick(): number {
    return this.day * TICKS_PER_DAY + this.tick;
  }

  private stepOne(): void {
    // P18: 숙박 손님은 동시 상한 밖이다 — 상한은 「하루 유입」의 그릇이고, 자고 가는 손님이 그 자리를 먹으면 낮 방문이 5% 줄었다 (8시드 합계 110,439 → 105,035)
    if (this.tick >= ARRIVAL_FROM_TICK && this.tick < Math.min(ARRIVAL_TO_TICK, CLOSING_TICK) && this.guests.count - this.guests.staying < this.maxGuests()) {
      const p = this.dailyTarget() / (ARRIVAL_TO_TICK - ARRIVAL_FROM_TICK);
      if (this.rng.spawn.chance(Math.min(1, p))) {
        // 오늘 오기로 한 친구가 남아 있으면 그 사람이 먼저 온다
        const fid = this.friendsToday.shift();
        const fdef = fid ? this.sns.friendDef(fid) : undefined;
        const areaName = (a: string): string => this.sns.areasById.get(a)?.name ?? a;
        const homes = this.sns.areas;
        const homeId = homes[this.rng.guest.int(Math.max(1, homes.length))];
        const owned = fdef ? (this.sns.friends.get(fdef.id)?.gifts ?? []) : [];
        const ownFloat = owned.map((id) => FLOAT_BY_GIFT[id] ?? 0).find((n) => n > 0) ?? 0;
        const g = this.guests.spawn(fdef ? { id: fdef.id, palette: fdef.palette, name: fdef.name, age: fdef.age, gender: fdef.gender, home: areaName(fdef.area), float: ownFloat } : undefined, areaName(homeId ?? ''), this.sns.areasById.get(fdef ? fdef.area : (homeId ?? ''))?.taste);
        // P27 D33: 걸어온 손님도 팀이다 — 2~4명이 한 무리(teamSeq). 팀 자리·패키지·1박이 첫날부터 돈다 (전: 버스 손님만 팀이라 3년차까지 자리가 비었다)
        if (this.walkinLeft <= 0) { this.teamSeq++; this.walkinTeam = this.teamSeq; this.walkinLeft = this.b.walkinTeamMin + this.rng.spawn.int(this.b.walkinTeamMax - this.b.walkinTeamMin + 1); }
        g.teamId = this.walkinTeam; this.walkinLeft--; this.stats.teamGuests = (this.stats.teamGuests ?? 0) + 1;
        if (fdef) {
          const st = this.sns.friends.get(fdef.id);
          if (st) { st.visits++; if (st.visits === 1) g.say = firstVisitLine(fdef); }
        }
        const ticket = this.ticketFor(fdef ? { id: fdef.id } : null);
        this.money += ticket;
        this.ticketsToday += ticket;
        this.stats.visitors++;
        this.stats.tickets += ticket;
        this.fx.push({ kind: 'coin', i: g.i, j: g.j, amount: ticket });
      }
    }
    this.stepBus();
    if (FEATURES.staff) this.staff.step();
    this.guests.step(this.guestHooks); // P52-a: 훅 묶음은 getter 로(검사 표면 `simulateUseForTest` 가 같은 훅을 쓴다)
    this.runCalendar();
    if (this.certs.isJudgeTime(this.day, this.tick)) this.judgeCert();
    // P18 저녁 — 숙박 손님이 있는 자리마다 불멍 (매 60tick)
    if (this.tick >= EVENING_TICK && this.tick % 60 === 0) for (const f of this.facilities.all) if (this.facilities.defOf(f).lodging === true && this.guests.all.some((g) => g.seatUid === f.uid && g.stays)) this.fx.push({ kind: 'fire', i: f.i, j: f.j });
    if (this.tick === EVENING_TICK) { // P54 저녁 래치 — 오늘 밤 빠지 파티가 서나
      const pid = this.nightPartyOn();
      this.nightOn = pid !== null; this.nightPool = pid;
      if (this.nightOn) { this.syncNightSet(); const n = this.issueNightBands(); this.noteNightOpen(n); }
    }
    if (this.tick === SHOP_RESTOCK_TICK) {
      this.shop.restock(this.day, this.rank, (e) => this.shopOwned(e));
      // R8 (G48): 17시 입고는 뉴스다 — 시계를 보게 만든다
      const n = this.shop.state.stock.length;
      if (n > 0) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: `장날 입고 — ${n}칸`, body: '오후 5시 새 진열. 상점에서 확인하자' });
    }
    if (this.tick === 0) {
      const a = this.certs.state.applied;
      if (a && a.judgeDay === this.day) this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: '오늘 15시 풀 심사', body: `${this.certs.defs.get(a.id)?.name ?? a.id} — 심사위원이 온다. 풀을 정돈하자` });
      if (this.clock.isWeekend) this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: '주말 — 손님이 몰린다', body: '입장이 평일의 1.6배. 라운지·매점을 채우자' });
    }
    // 매 시간 정각에만 훑는다 (매 tick 은 낭비)
    if (this.tick % TICKS_PER_HOUR === 0) {
      // 소원은 창 안에 **한 번** 충족되면 성립 — 조건이 사라지기 전에 매시간 표시해 둔다
      if (this.sns.activeWishes().length > 0) this.sns.markMet((w) => this.evaluateCondition(w.condition).met);
    }
    this.tick++;
    if (this.tick >= TICKS_PER_DAY) this.closeDay();
  }

  /** 친구가 나간다 — 그날의 만족이 곧 EXP (방문 2~3번에 ☆ 하나) */
  private friendLeaves(g: { friendId: string | null; sat: number }): void {
    if (!g.friendId) return;
    const w = this.sns.addFriendExp(g.friendId, Math.round(g.sat), this.day);
    if (w) this.announceWish(g.friendId, w);
  }

  private closeDay(): void {
    const overnight = this.guests.all.filter((g) => g.stays && g.seatUid !== null && g.state !== 'gone' && this.facilities.byUid(g.seatUid)).length;
    const keep = (g: Guest): boolean => g.stays && g.seatUid !== null && this.facilities.byUid(g.seatUid) !== undefined;
    for (const g of this.guests.all) if (keep(g) && g.state !== 'gone') this.friendLeaves(g); // P18 자는 친구도 하루 만족을 EXP 로 — 안 하면 소원이 며칠 늦게 열린다
    this.guests.flush((g) => this.friendLeaves(g), keep); // P18 숙박 손님은 남는다
    this.stats.overnight = (this.stats.overnight ?? 0) + overnight;
    const staffDay = FEATURES.staff ? this.staff.closeDay(this.enteredTodayCount()) : { salary: 0, leveled: [] as ReturnType<StaffStore['closeDay']>['leveled'] };
    // P8 — 청결: 방문객이 더럽히고(0.15/명) 기본 회복 +4, 알바가 있는 편의 시설마다 +10
    this.cleanliness = Math.max(0, Math.min(100, this.cleanliness - this.enteredTodayCount() * 0.15 + 4 + this.staffedUtilities() * 10));
    const maint = this.dailyMaintenance() + staffDay.salary;
    this.money -= maint;
    // 비상 자금 (G37, 원작 「Emergency Fund 2,000G」) — 폐장에 잔고가 음수면 본사가 2,000G 로 채워 준다. 파산은 없다
    if (this.money < 0) {
      this.money = EMERGENCY_FUND;
      this.stats.bailouts = (this.stats.bailouts ?? 0) + 1;
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: '본사 비상 자금', body: `잔고가 바닥나 ${EMERGENCY_FUND.toLocaleString('ko-KR')}G 를 채웠다 — 유지비를 줄이거나 손님을 늘리자` });
    }
    for (const st of staffDay.leveled) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: `${st.name} 승급 — ${this.staff.roleOf(st).name} Lv${st.level}`, body: '효과 +10%' });
    const report: DayReport = {
      day: this.day,
      visitors: this.guests.enteredToday,
      target: Math.round(this.dailyTarget() * 10) / 10,
      tickets: this.ticketsToday,
      fees: this.feesToday,
      food: this.foodToday,
      lodging: this.lodgingToday,
      overnight,
      eats: this.eatsToday, standEats: this.standEatsToday, // P60-e B2
      ...(this.nightOn ? { nightOn: true, nightPkg: this.nightPkgToday, nightFood: this.nightFoodToday, nightFee: this.nightFeeToday } : {}), // P54
      maintenance: maint,
      net: this.ticketsToday + this.feesToday + this.foodToday + this.lodgingToday - maint,
    };
    // G19 — 결산 카드 재료
    report.satisfaction = this.satN > 0 ? Math.round(this.satSum / this.satN) : 0;
    this.prevSatAvg = report.satisfaction;
    report.likes = this.sns.totalLikes - this.likesAtDayStart;
    report.topFacility = this.topFacilities(1)[0] ?? null;
    report.topMenu = this.topMenus(this.menuSalesToday, 1)[0] ?? null;
    this.stats.days.push(report);
    const c = this.clock;
    this.inbox.push({
      tick: this.tick, day: this.day, kind: 'day-summary', priority: FEATURES.dailyResults ? 'modal' : 'inbox',
      title: `${c.year}년차 ${c.seasonName} ${c.daypart} 마감`,
      body: `${(() => { const top = this.facilities.all.filter((f) => this.facilities.defOf(f).class === 'lounging').sort((a, b) => b.usesToday - a.usesToday || a.uid - b.uid)[0]; return top && top.usesToday > 0 ? `붐빈 자리 ${this.facilities.defOf(top).name}(등급 ${this.seatGradeOf(top.uid).grade}) ${top.usesToday}명 · ` : ''; })()}방문 ${report.visitors}명 · 수입 ${(report.tickets + report.fees + report.food + this.lodgingToday).toLocaleString('ko-KR')}G · 유지비 −${maint.toLocaleString('ko-KR')}G${overnight > 0 ? ` · 숙박 ${overnight}명` : ''}${(() => { const n = Object.values(this.menuSalesToday).reduce((a, b) => a + b, 0); return n > 0 && report.topMenu ? ` · 매점 ${n}건 (최다 ${report.topMenu.name})` : ''; })()}`,
      data: { ...report, popularity: this.parkPopularity(), rankPos: this.rankPosition(), cleanliness: Math.round(this.cleanliness), salary: staffDay.salary },
    });
    this.satSum = 0; this.satN = 0; this.menuSalesToday = {}; this.likesAtDayStart = this.sns.totalLikes;
    // 소원 판정 — 열린 소원마다 조건을 묻는다 (창 안에서 한 번이면 성립)
    const res = this.sns.closeDay(this.day, (w) => this.evaluateCondition(w.condition).met);
    for (const { friend, wish } of res.fulfilled) {
      const name = this.sns.friendDef(friend.id)?.name ?? friend.id;
      const got = this.grantWishReward(wish);
      this.stats.wishDone = (this.stats.wishDone ?? 0) + 1;
      this.fx.push({ kind: 'wish', i: this.gate.i, j: this.gate.j - 2 });
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'guest', priority: 'inbox', title: `${name}의 소원 ☆${wish.idx + 1} 달성!`, body: `보상: ${got}` });
    }
    for (const f of res.invited) {
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'guest', priority: 'inbox', title: `새 친구 — ${f.name}`, body: `${this.sns.areasById.get(f.area)?.name ?? f.area}에서 놀러 오기로 했다` });
    }
    for (const { friend, wish } of res.expired) {
      const name = this.sns.friendDef(friend.id)?.name ?? friend.id;
      const pct = Math.round(this.evaluateCondition(wish.condition).progress * 100);
      this.stats.wishExpired = (this.stats.wishExpired ?? 0) + 1;
      // R3 (G48): 만료는 화면에 보인다 — 근접 실패가 다음 시도로 이어지게
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'guest', priority: 'toast', title: `${name}의 소원이 지나갔다`, body: `${wish.line} — 진행 ${pct}%였다 · 4일 뒤 다시 부탁할게` });
    }
    // 좋아요 사다리 (G33) — 넘긴 문턱마다 내일 아침 버스 1대 + 주민 선물
    for (const x of this.sns.crossedBusThresholds()) {
      this.busQueue.push({ areaId: x.areaId, seats: this.b.busSeats ?? 12, source: 'likes' });
      const name = this.sns.areasById.get(x.areaId)?.name ?? x.areaId;
      const got = x.reward ? this.grant(x.reward.grant) : '';
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: `${name} 좋아요 ${x.at.toLocaleString('ko-KR')} 돌파`, body: `내일 아침 ${name}에서 버스가 온다${got ? ` · 주민 선물: ${got}` : ''}` });
    }
    this.checkRank();
    const opened = this.sns.checkAreas(this.day + 1);
    if (opened) {
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: `새 지역 개방 — ${opened.area.name}`, body: `${opened.friends.map((f) => f.name).join(' · ') || '주민'}들이 소문을 들었다` });
    }
    // R1 (G48): 결산은 랭크업·지역 개방 **뒤**에 — 세리머니가 결산 모달에 밀려 예산에서 잘리지 않게
    // 시즌 말(4일째) · 연말(16일째) 결산 — 라이벌 순위·최고 시설·수상
    const dayInSeason = this.day % 4;
    if (dayInSeason === 3) {
      const days = this.stats.days.slice(-4);
      const sum = (f: (d: DayReport) => number): number => days.reduce((n, d) => n + f(d), 0);
      const isYear = this.day % 16 === 15;
      const span = isYear ? this.stats.days.slice(-16) : days;
      const sumSpan = (f: (d: DayReport) => number): number => span.reduce((n, d) => n + f(d), 0);
      const facTop = [...this.facilities.all].sort((a, b) => b.incomeTotal - a.incomeTotal).slice(0, 3).map((f) => ({ name: this.facilities.defOf(f).name, income: f.incomeTotal, uses: f.usesTotal }));
      const pr: PeriodReport = {
        kind: isYear ? 'year' : 'season', year: c.year, season: seasonOf(this.day),
        visitors: sumSpan((d) => d.visitors), income: sumSpan((d) => d.tickets + d.fees + d.food), net: sumSpan((d) => d.net), likes: sumSpan((d) => d.likes ?? 0),
        satisfaction: span.length ? Math.round(sumSpan((d) => d.satisfaction ?? 0) / span.length) : 0,
        popularity: this.parkPopularity(), topFacilities: facTop, topMenus: this.topMenus(this.stats.menuSales, 3), rankPos: this.rankPosition(), rivals: this.rivalPops(),
      };
      void sum;
      if (isYear) {
        const bestPool = [...this.pools.all].sort((a, b) => b.likes - a.likes)[0];
        pr.awards = [
          ...(facTop[0] ? [{ title: '올해의 시설', name: facTop[0].name }] : []),
          ...(pr.topMenus[0] ? [{ title: '올해의 메뉴', name: pr.topMenus[0].name }] : []),
          ...(bestPool ? [{ title: '올해의 수역', name: `수역 #${bestPool.id} (좋아요 ${bestPool.likes})` }] : []),
        ];
      }
      this.inbox.push({ tick: this.tick, day: this.day, kind: isYear ? 'year-summary' : 'season-summary', priority: 'modal', title: isYear ? `${c.year}년차 연말 결산` : `${c.year}년차 ${c.seasonName} 결산`, body: `방문 ${pr.visitors}명 · 순이익 ${pr.net.toLocaleString('ko-KR')}G${pr.rankPos > 0 ? ` · 전국 ${pr.rankPos}위` : ''}`, data: pr });
    }
    this.guests.resetDay();
    this.guests.wakeUp(); // P18 잔 손님이 일어난다
    this.teamSeatedIds.clear();
    this.events.prune(this.day);
    // G57: 사건은 **내일** 개장에 제시·해결되므로 내일 날짜로 뽑는다 — 주말·계절 필터가 하루 어긋나던 버그
    if (FEATURES.randomEvents) { const nd = this.day + 1; const ev = this.events.roll(nd, seasonOf(nd), yearOf(nd), nd % 4 === 3); if (ev) this.pushChoice(ev); }
    this.facilities.resetDay();
    this.rigRidersToday.clear(); this.rigPairsToday.clear(); // P51
    for (const [k, d] of this.bandPaid) if (d < this.day - 1) this.bandPaid.delete(k); // P52-a: 그제 것은 잊는다(저장 0 — 하루 안 왕복은 같다)
    this.accidentsToday = 0; for (const [k, v] of this.accidentCut) { const nv = v * 0.5; if (nv < 0.01) this.accidentCut.delete(k); else this.accidentCut.set(k, nv); } // P52-b: 매일 반감
    this.ticketsToday = 0;
    this.feesToday = 0;
    this.foodToday = 0;
    this.eatsToday = 0; this.standEatsToday = 0; // P60-e
    this.lodgingToday = 0;
    if (this.nightOn) { this.nightOn = false; this.nightPool = null; this.syncNightSet(); } // P54 래치는 하루 안에서만
    this.nightPkgToday = 0; this.nightFoodToday = 0; this.nightFeeToday = 0; this.nightBandTeams.clear();
    this.day++;
    this.tick = 0;
    this.poolCache.clear();
    this.sns.growPosts(this.day);
    this.weather = rollWeather(this.rng.world, seasonOf(this.day));
    this.planFriendVisits();
    this.planBuses();
    this.settleInvest();
    if (this.day % 16 === 0) {
      const y = this.clock.year;
      const got = INGREDIENT_DEFS.filter((i) => i.unlock === 'year' && i.year === y && this.cooking.grantIngredient(i.id));
      if (got.length) this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: `${y}년차 — 새 재료`, body: got.map((i) => i.name).join(' · ') });
      const parts = PART_DEFS.filter((i) => i.unlock === 'year' && i.year === y && this.workshop.grantIngredient(i.id));
      if (parts.length) this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: `${y}년차 — 새 부품`, body: parts.map((i) => i.name).join(' · ') });
    }
    if (this.day >= TOTAL_DAYS) {
      this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'modal', title: '8년차 겨울이 끝났다', body: '본편 종료 — 점수를 계산한다. 이어서 놀거나 뉴게임+ 로' });
    }
  }

  // ── 명령: 풀 ───────────────────────────────────────────────────────

  /** 내 수면인가 (P1) — 강 띠는 토지의 **열** 안이면 내 것이다 (강폭 전부가 내 앞 수면) */
  /** 수면 허가 깊이 (P15 D23 → P48-b3) — 내 물가에서 물 위로 몇 칸: 랭크 0 은 7, 랭크마다 +3, ★5 면 강 전부 */
  get permitDepth(): number {
    return permitDepth(this.rank);
  }

  /**
   * 수영 구역 자동 파생 (P15 D22, 레거시 `swim.ts` 의 「덱으로 밀폐된 물」): 데크를 깔거나 걷을 때마다 트인 강(지도 가장자리·허가 밖·토지 밖의 물)과
   * 물길이 끊긴 물 칸을 찾아 수역(`FLOOR.pool`)으로 올리고, 다시 열린 수역은 강으로 돌려보낸다. 물빛·소품·좋아요는 풀 모델이 승계한다.
   * 돈은 안 든다 — 데크 값이 곧 값이다.
   */
  syncEnclosedWater(): { made: number; opened: number } {
    const g = this.grid;
    const open = this.openWaterMask(); // P48-b2: 전 격자 — 굽이(`j < RIVER.j0`)도 데크로 둘러싸면 수역이 된다
    let made = 0, opened = 0;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i; const f = g.floor[k] ?? 0;
      if (!isWaterCode(f)) continue;
      if (!open[k] && f !== FLOOR.pool) { g.set(i, j, FLOOR.pool); made++; }
      else if (open[k] && f === FLOOR.pool) { g.set(i, j, g.naturalAt(i, j)); opened++; }
    }
    if (made || opened) { this.pools.recompute(); this.poolCache.clear(); }
    return { made, opened };
  }

  inMyWater(i: number, j: number): boolean {
    // P15 D23 → P48-b2 W5: 물 코드 ∧ 토지 열 안 ∧ 도시 띠 아래 ∧ (굽이는 언제나 · 본류는 허가 창 안)
    if (!isWaterCode(this.grid.at(i, j))) return false;
    if (i < this.land.i0 || i >= this.land.i0 + this.land.w || j < LAND_J0) return false;
    if (!isWaterCode(this.grid.naturalAt(i, j))) return this.grid.yardAt(this.land, i, j); // 마당 뭍에 판 물
    const d = this.grid.shoreDist(this.land, i, j); return d > 0 && d <= this.permitDepth; // P48-b3: 행이 아니라 물가 거리
  }

  /** 수면 허가 — 랭크가 여는 창(`waterMax`) × 그 안의 **칸 예산**(W6). 예산은 수역(빠지 안 물) 칸 수로 센다 — 기구 발자국은 안 뺀다 */
  get permitMax(): number { return this.b.permitTilesByRank[Math.min(this.rank, this.b.permitTilesByRank.length - 1)] ?? 40; }
  get permitUsed(): number { return this.pools.totalTiles(); }
  get permitLeft(): number { return this.permitMax - this.permitUsed; }
  /** 트인 물 마스크 — 씨앗 3벌(격자 네 변의 물 ∪ 토지 열 밖의 물 ∪ 본류 창 밖의 물)에서 4이웃 BFS. `syncEnclosedWater`·`countEnclosedWater` 가 같이 쓴다 */
  private openWaterMask(): Uint8Array {
    const g = this.grid;
    const open = new Uint8Array(g.w * g.h);
    const queue: number[] = [];
    const seed = (i: number, j: number): void => { const k = j * g.w + i; if (isWaterCode(g.floor[k] ?? 0) && !open[k]) { open[k] = 1; queue.push(k); } };
    for (let i = 0; i < g.w; i++) { seed(i, 0); seed(i, g.h - 1); }
    for (let j = 0; j < g.h; j++) { seed(0, j); seed(g.w - 1, j); }
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (isWaterCode(g.floor[j * g.w + i] ?? 0) && !inLandOrWater(g, this.land, i, j, this.permitDepth)) seed(i, j); // P48-b3: 내 앞 수면 밖의 물이 씨앗
    let head = 0;
    while (head < queue.length) {
      const k = queue[head++] as number; const i = k % g.w; const j = Math.floor(k / g.w);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const nk = nj * g.w + ni;
        if (open[nk] || !isWaterCode(g.floor[nk] ?? 0)) continue;
        open[nk] = 1; queue.push(nk);
      }
    }
    return open;
  }
  permitOverReason(need: number): string {
    const nextMax = this.b.permitTilesByRank[Math.min(this.rank + 1, this.b.permitTilesByRank.length - 1)] ?? this.permitMax;
    return `수면 허가를 넘습니다 — 남은 ${Math.max(0, this.permitLeft).toLocaleString('ko-KR')}칸에 ${need.toLocaleString('ko-KR')}칸 · 랭크를 올리면 ${nextMax.toLocaleString('ko-KR')}칸까지`;
  }
  /** 밀폐된 물 칸 수(쓰기 0) */
  countEnclosedWater(): number {
    const open = this.openWaterMask(); const g = this.grid; let n = 0;
    for (let k = 0; k < open.length; k++) if (!open[k] && isWaterCode(g.floor[k] ?? 0)) n++;
    return n;
  }
  /**
   * 이 편집이 새로 밀폐할 물 칸 수 (§3.4). `grid.floor` 만 직접 쓰고 되돌린다 — `Grid.set()` 은 rev·levels 를 같이 만진다.
   * `pools`·캐시·RNG 를 안 건드린다. 조준 칸이 바뀐 프레임에만 부른다
   */
  wouldEnclose(edit: readonly { i: number; j: number; code: FloorCode }[]): number {
    const f = this.grid.floor; const w = this.grid.w;
    const before = edit.map((e) => f[e.j * w + e.i] as FloorCode);
    for (const e of edit) f[e.j * w + e.i] = e.code;
    const n = this.countEnclosedWater();
    edit.forEach((e, k) => { f[e.j * w + e.i] = before[k] as FloorCode; });
    return n - this.pools.totalTiles();
  }

  /**
   * 수역 치기 / 풀 파기 (P1). 강·여울 칸은 **부표로 친다**(수역 — 주력), 잔디·포장은 인공 풀을 판다(승계).
   * 둘 다 `FLOOR.pool` 이라 풀 모델(연결·상태)은 하나다.
   */
  canDig(i: number, j: number): Result {
    if (!this.grid.inside(i, j)) return { ok: false, reason: '격자 밖' };
    const f = this.grid.at(i, j);
    const water = f === FLOOR.river || f === FLOOR.shallow || f === FLOOR.pool; // P49-b: 수역 칸도 물이다 — 아니면 「이미 수역입니다」 앞에서 「아직 내 땅이 아닙니다」 가 난다
    if (water ? !this.inMyWater(i, j) : !this.ownsTile(i, j)) return { ok: false, reason: water ? '내 앞 수면이 아닙니다 — 랭크를 올리면 넓어집니다' : '아직 내 땅이 아닙니다 — 랭크를 올리면 넓어집니다' };
    const g = this.gate;
    if (i === g.i && j === g.j) return { ok: false, reason: '입구는 팔 수 없습니다' };
    if (this.facilities.occupied(i, j)) return { ok: false, reason: '시설이 있는 칸입니다 — 먼저 철거하세요' };
    if (f === FLOOR.pool) return { ok: false, reason: '이미 수역입니다' };
    if (f === FLOOR.deck) return { ok: false, reason: '데크 위입니다 — 먼저 데크를 걷으세요' };
    if (!water && !isLandFloor(f)) return { ok: false, reason: '이 바닥에는 풀을 팔 수 없습니다' };
    if (!water) return { ok: false, reason: '뭍에는 풀을 파지 않습니다 — 빠지는 물 위에 데크로 두르세요' }; // P49-b D59: 뭍 풀 삭제 — 실내 바닥은 위 `isLandFloor` 가 이미 거른다(실내 온수풀은 시설이지 파는 풀이 아니다)
    return { ok: true };
  }

  /** 데크 (P1) — 강·여울 위에 깔아 손님이 서는 발판. 뭍·데크에 4이웃으로 이어져야 한다 */
  /** `extra` = 아직 안 깔린 선택 칸(P15 독의 이어 고르기) — 그 칸도 데크로 친다 (완료 때 `paintDeck` 이 순서대로 깐다) */
  canPaintDeck(i: number, j: number, extra?: readonly { i: number; j: number }[]): Result {
    if (!this.grid.inside(i, j)) return { ok: false, reason: '격자 밖' };
    const f = this.grid.at(i, j);
    if (f === FLOOR.deck) return { ok: false, reason: '이미 데크입니다' };
    if (f !== FLOOR.river && f !== FLOOR.shallow) return { ok: false, reason: '데크는 강 위에만 깝니다' };
    if (!this.inMyWater(i, j)) return { ok: false, reason: '내 앞 수면이 아닙니다 — 랭크를 올리면 넓어집니다' };
    const dry = (a: number, b: number): boolean => { const c = this.grid.at(a, b); return (c === FLOOR.grass || c === FLOOR.path || isIndoorCode(c) || c === FLOOR.deck) && inLandOrWater(this.grid, this.land, a, b, this.permitDepth) || c === FLOOR.deck || (extra?.some((t) => t.i === a && t.j === b) ?? false); };
    if (!dry(i + 1, j) && !dry(i - 1, j) && !dry(i, j + 1) && !dry(i, j - 1)) return { ok: false, reason: '뭍이나 데크에 이어서 깔아야 합니다' };
    return { ok: true };
  }

  // ── P49-b §3.5 사각형 붓·라인 조각 ──
  /**
   * 사각형 붓 — 바깥 사각형 `r` 의 둘레가 폰툰(링), 안이 물. 판정은 바깥 제약부터 9단: ① 크기 ② 물 칸 소유 ③ 링 칸(물·수역 → 데크 60G · 데크 0G · 뭍은 둑 0G)
   * ④ 안 칸(물·수역·데크만) ⑤ 안에 시설 없음 ⑥ 링 한 칸이 뭍·기존 데크에 접속 ⑦ 허가 예산 ⑧ 원자 적용 + 도달 전후 비교 ⑨ 결제. 겹치면 `PoolStore.recompute` 가 병합한다
   */
  canMakePpaji(r: PpajiRect): Result & { cost?: number; enclose?: number; ringWater?: number } {
    const inner = { i0: r.i0 + 1, j0: r.j0 + 1, w: r.w - 2, h: r.h - 2 };
    if (Math.min(inner.w, inner.h) < this.b.ppajiMinInner || inner.w * inner.h < this.b.ppajiMinTiles) return { ok: false, reason: `안쪽이 너무 작습니다 — 최소 ${this.b.ppajiMinInner}×${Math.ceil(this.b.ppajiMinTiles / this.b.ppajiMinInner)}(${this.b.ppajiMinTiles}칸)` };
    const ring: { i: number; j: number }[] = [], ins: { i: number; j: number }[] = [];
    for (let j = r.j0; j < r.j0 + r.h; j++) for (let i = r.i0; i < r.i0 + r.w; i++) (i === r.i0 || i === r.i0 + r.w - 1 || j === r.j0 || j === r.j0 + r.h - 1 ? ring : ins).push({ i, j });
    for (const t of [...ring, ...ins]) if (!this.grid.inside(t.i, t.j)) return { ok: false, reason: '격자 밖입니다' };
    const isWater = (c: number): boolean => c === FLOOR.river || c === FLOOR.shallow || c === FLOOR.pool;
    for (const t of ins) { const c = this.grid.at(t.i, t.j); if (isWater(c) && !this.inMyWater(t.i, t.j)) return { ok: false, reason: '내 앞 수면이 아닙니다 — 랭크를 올리면 넓어집니다' }; }
    let ringWater = 0;
    for (const t of ring) {
      const c = this.grid.at(t.i, t.j);
      if (isWater(c)) { if (!this.inMyWater(t.i, t.j)) return { ok: false, reason: '내 앞 수면이 아닙니다 — 랭크를 올리면 넓어집니다' }; ringWater++; continue; }
      if (c === FLOOR.deck) continue;
      if ((c === FLOOR.grass || c === FLOOR.path || isGround(c)) && this.ownsTile(t.i, t.j)) continue; // 둑
      return { ok: false, reason: `링 칸에 놓을 수 없는 바닥입니다 — (${t.i},${t.j})` };
    }
    for (const t of ins) { const c = this.grid.at(t.i, t.j); if (!isWater(c) && c !== FLOOR.deck) return { ok: false, reason: '안에 뭍이 있습니다 — 빠지 안은 물이어야 합니다' }; }
    for (const t of ins) { const f = this.facilities.at(t.i, t.j); if (f) return { ok: false, reason: `먼저 철거하세요 — ${this.facilities.defOf(f).name}` }; }
    for (const t of ring) { const f = this.facilities.at(t.i, t.j); if (f && isWater(this.grid.at(t.i, t.j))) return { ok: false, reason: `먼저 철거하세요 — ${this.facilities.defOf(f).name}` }; }
    const ringSet = new Set(ring.map((t) => `${t.i},${t.j}`));
    const dry = (a: number, b: number): boolean => { if (!this.grid.inside(a, b)) return false; const c = this.grid.at(a, b); return (c === FLOOR.grass || c === FLOOR.path || isIndoorCode(c) || c === FLOOR.deck || isGround(c)) && inLandOrWater(this.grid, this.land, a, b, this.permitDepth); };
    const touches = ring.some((t) => !isWater(this.grid.at(t.i, t.j)) || ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => !ringSet.has(`${t.i + a},${t.j + b}`) && dry(t.i + a, t.j + b)));
    if (!touches) return { ok: false, reason: '뭍이나 데크에 이어서 두르세요' };
    const edit: { i: number; j: number; code: FloorCode }[] = [];
    for (const t of ring) if (isWater(this.grid.at(t.i, t.j))) edit.push({ i: t.i, j: t.j, code: FLOOR.deck });
    for (const t of ins) if (this.grid.at(t.i, t.j) === FLOOR.deck) edit.push({ i: t.i, j: t.j, code: this.grid.naturalAt(t.i, t.j) });
    const enclose = this.wouldEnclose(edit);
    if (this.permitUsed + enclose > this.permitMax) return { ok: false, reason: this.permitOverReason(enclose) };
    return { ok: true, cost: ringWater * DECK_COST, enclose, ringWater };
  }
  /** P58-a — 푸드코트 영역 (docs/plan-ppaji-foodcourt.md D1·D2·D6). 실내 바닥(복도 제외) 위 사각형 · 최소 3×2 · 시설·복도·문 자리와 안 겹침 · 기존 영역을 통째로 덮으면 확장(대체, 새 칸만 값을 낸다) */
  foodcourts: FoodCourtStore;
  canMakeFoodCourt(r: FoodCourtRect): Result & { cost?: number; seats?: number } {
    if (r.w < 3 || r.h < 2) return { ok: false, reason: '식탁 하나엔 3×2 가 필요합니다' };
    const covered = this.foodcourts.coveredBy(r);
    const crossed = this.foodcourts.crossedBy(r);
    if (crossed) return { ok: false, reason: '다른 푸드코트와 걸칩니다 — 통째로 덮어 넓히거나 옆에 그리세요' };
    const seatUids = new Set(this.facilities.all.filter((f) => f.defId === FOODCOURT_SEAT_DEF && covered.some((c) => courtContains(c, f.i, f.j))).map((f) => f.uid));
    let fresh = 0;
    for (let j = r.j0; j < r.j0 + r.h; j++) for (let i = r.i0; i < r.i0 + r.w; i++) {
      if (!this.grid.inside(i, j)) return { ok: false, reason: '지도 밖입니다' };
      if (this.grid.at(i, j) !== FLOOR.indoor) return { ok: false, reason: this.grid.at(i, j) === FLOOR.hall ? '복도 위엔 못 그립니다' : '실내 바닥 위에만 그릴 수 있습니다 — 「건물 바닥」을 먼저 깔아요' };
      if (!this.ownsTile(i, j)) return { ok: false, reason: '아직 내 땅이 아닙니다' };
      const occ = this.facilities.at(i, j);
      if (occ && !seatUids.has(occ.uid)) return { ok: false, reason: `${this.facilities.defOf(occ).name} 자리와 겹칩니다` };
      if (this.grid.doors().some((d) => d.i === i && d.j === j)) return { ok: false, reason: '문 앞은 비워 둡니다' };
      if (this.foodcourts.ownerAt(i, j) === null) fresh++;
    }
    return { ok: true, cost: fresh * FOODCOURT_TILE_COST, seats: courtBlocks(r).length * 2 };
  }
  makeFoodCourt(r: FoodCourtRect): Result & { id?: number; cost?: number; seats?: number } {
    const c = this.canMakeFoodCourt(r);
    if (!c.ok) return c;
    const cost = c.cost ?? 0;
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    this.spend(cost);
    for (const old of this.foodcourts.coveredBy(r)) this.dropFoodCourt(old.id);
    const court = this.foodcourts.add(r);
    for (const b of courtBlocks(court)) this.facilities.place(FOODCOURT_SEAT_DEF, b.i, b.j, 0);
    this.stats.spent = (this.stats.spent ?? 0) + cost;
    this.afterWorldChange();
    return { ok: true, id: court.id, cost, seats: c.seats ?? 0 };
  }
  /** 영역과 그 파생 시설을 걷는다(환불 0 — 수역 걷기와 같다) */
  removeFoodCourt(id: number): Result {
    if (!this.foodcourts.byId(id)) return { ok: false, reason: '그런 푸드코트가 없습니다' };
    this.dropFoodCourt(id);
    this.afterWorldChange();
    return { ok: true };
  }
  private dropFoodCourt(id: number): void {
    const court = this.foodcourts.byId(id); if (!court) return;
    for (const f of [...this.facilities.all]) if (f.defId === FOODCOURT_SEAT_DEF && courtContains(court, f.i, f.j)) { const uid = f.uid;
    for (const g of this.guests.all) {
      if (g.target?.kind === 'facility' && g.target.uid === uid) {
        g.target = null;
        if (g.state === 'use' || g.state === 'walk') { g.state = 'wander'; g.stateTicks = 0; }
      }
    }
      this.facilities.remove(uid); }
    this.foodcourts.remove(id);
  }
  /** 파생 시설(식탁)에서 영역 id — 정보 창 「푸드코트 지우기」 */
  foodCourtOfSeat(uid: number): number | null { const f = this.facilities.byUid(uid); return f && f.defId === FOODCOURT_SEAT_DEF ? this.foodcourts.ownerAt(f.i, f.j) : null; }
  /** P60-e B4 구색 — 영역 사각형 ±SEAT_RADIUS 상자에 걸친 점포(menuSlots>0)에 걸린 메뉴의 카테고리 수 0~4 (음료·간식·식사·디저트, `recipes.json` 분류). 매출엔 안 닿는다 — 자리 등급(`seatGradeAt`)·인증·발견만 */
  courtMenuKindsOf(courtId: number): number { return this.courtMenuCatsOf(courtId).size; }
  /** 영역 반경 안 점포(menuSlots>0)의 uid 들 · 그 점포들에 걸린 카테고리 집합 — 봇의 「다양성」 한 줄이 빠진 카테고리를 건다 */
  courtShopsOf(courtId: number): PlacedFacility[] {
    const c = this.foodcourts.byId(courtId); if (!c) return [];
    const i0 = c.i0 - Game.SEAT_RADIUS, i1 = c.i0 + c.w - 1 + Game.SEAT_RADIUS, j0 = c.j0 - Game.SEAT_RADIUS, j1 = c.j0 + c.h - 1 + Game.SEAT_RADIUS;
    return this.facilities.all.filter((o) => { const od = this.facilities.defOf(o); return od.menuSlots > 0 && FacilityStore.footprint(od, o.i, o.j, o.facing).some((t) => t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1); });
  }
  courtMenuCatsOf(courtId: number): Set<string> {
    const cats = new Set<string>();
    for (const o of this.courtShopsOf(courtId)) for (const r of this.menus.equipped(o.uid)) cats.add(r.cat);
    return cats;
  }
  /** 영역별 구색의 최댓값 (인증 `courtMenuKinds`) · 총 좌석(인증 `courtSeats` — 영역에서 파생한 식탁 × 2) */
  courtMenuKindsMax(): number { return Math.max(0, ...this.foodcourts.all.map((c) => this.courtMenuKindsOf(c.id))); }
  courtSeatsTotal(): number { return this.foodcourts.totalSeats(); }
  /** P60-e B4 발견 채널 — 구색 4/4 인 영역이 처음 생기면 축하 모달 1회(+ 「획득」 fx). 호출부 둘: 세계 변경 꼬리 · 메뉴 편집(구색은 메뉴로도 바뀐다) */
  fullCourtSeen = false;
  private noteFullCourt(): void {
    if (this.fullCourtSeen) return;
    const c = this.foodcourts.all.find((x) => this.courtMenuKindsOf(x.id) >= 4); if (!c) return;
    this.fullCourtSeen = true;
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: '풀코스 푸드코트 발견', body: `${c.name ?? `푸드코트 #${c.id}`} 반경 ${Game.SEAT_RADIUS} 안 점포에 음료·간식·식사·디저트가 다 있다 — 식탁 자리 등급 +2` });
    this.fx.push({ kind: 'discover', i: c.i0 + 1, j: c.j0, amount: 1, label: '풀코스 푸드코트' });
  }
  makePpaji(r: PpajiRect): Result & { merged?: { keptId: number; keptName: string; goneNames: string[] }[]; cost?: number } {
    const c = this.canMakePpaji(r);
    if (!c.ok) return c;
    const cost = c.cost ?? 0;
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    const isWater = (x: number): boolean => x === FLOOR.river || x === FLOOR.shallow || x === FLOOR.pool;
    const edit: { i: number; j: number; code: FloorCode }[] = [];
    for (let j = r.j0; j < r.j0 + r.h; j++) for (let i = r.i0; i < r.i0 + r.w; i++) {
      const onRing = i === r.i0 || i === r.i0 + r.w - 1 || j === r.j0 || j === r.j0 + r.h - 1, cur = this.grid.at(i, j);
      if (onRing && isWater(cur)) edit.push({ i, j, code: FLOOR.deck });
      else if (!onRing && cur === FLOOR.deck) edit.push({ i, j, code: this.grid.naturalAt(i, j) });
    }
    const before = edit.map((e) => this.grid.at(e.i, e.j));
    const apply = (): void => { for (const e of edit) this.grid.set(e.i, e.j, e.code); this.syncEnclosedWater(); };
    const revert = (): void => { edit.forEach((e, k) => this.grid.set(e.i, e.j, before[k] as FloorCode)); this.syncEnclosedWater(); this.pools.recompute(); this.poolCache.clear(); }; // 되돌린 뒤 무조건 재계산 — sync 가 「바뀐 칸 0」이면 재계산을 건너뛰어 살아 있는 수역 목록이 apply 시점 분할로 남았다(골든 왕복이 잡았다)
    if (this.breaksAccess(apply, revert, 0)) return { ok: false, reason: '손님 길이 막힙니다 — 입구에서 닿지 않는 곳이 생깁니다' };
    const idsBefore = new Map(this.pools.all.map((p) => [p.id, p.name ?? `수역 #${p.id}`]));
    apply(); // breaksAccess 는 언제나 되돌린다 — 실제 적용은 여기서 (다른 호출부와 같은 모양)
    this.spend(cost, 'deck');
    for (const e of edit) this.fx.push({ kind: 'dig', i: e.i, j: e.j });
    this.afterWorldChange();
    const merged = [...idsBefore].filter(([id]) => !this.pools.byId(id));
    const kept = this.pools.all.find((p) => p.tiles.some((k) => { const i = k % this.grid.w, j = Math.floor(k / this.grid.w); return i > r.i0 && i < r.i0 + r.w - 1 && j > r.j0 && j < r.j0 + r.h - 1; }));
    this.checkStory(true);
    return merged.length && kept ? { ok: true, cost, merged: [{ keptId: kept.id, keptName: kept.name ?? `수역 #${kept.id}`, goneNames: merged.map(([, n]) => n) }] } : { ok: true, cost };
  }
  /** 라인 조각 (R2) — 1×len 데크를 시설처럼 조준·회전(facing 1 = 세로)해 놓는다. 내부는 `paintDeck`(이어서 규칙·허가 그대로) */
  lineTiles(len: number, i: number, j: number, facing: 0 | 1): { i: number; j: number }[] {
    const out: { i: number; j: number }[] = [];
    for (let a = 0; a < len; a++) out.push(facing === 1 ? { i, j: j + a } : { i: i + a, j });
    return out;
  }
  canPlaceLine(len: number, i: number, j: number, facing: 0 | 1): Result & { cost?: number } {
    if (!this.b.ppajiLineLens.includes(len)) return { ok: false, reason: `라인은 ${this.b.ppajiLineLens.join('·')}칸만 있습니다` };
    const tiles = this.lineTiles(len, i, j, facing);
    const laid: { i: number; j: number }[] = [];
    for (const t of tiles) { const r = this.canPaintDeck(t.i, t.j, laid); if (!r.ok) return r; laid.push(t); }
    return { ok: true, cost: this.deckCost(tiles) };
  }
  placeLine(len: number, i: number, j: number, facing: 0 | 1): Result & { cost?: number } {
    const c = this.canPlaceLine(len, i, j, facing);
    if (!c.ok) return c;
    const r = this.paintDeck(this.lineTiles(len, i, j, facing));
    return r.ok ? { ok: true, cost: c.cost ?? 0 } : r;
  }

  deckCost(tiles: readonly { i: number; j: number }[]): number {
    return tiles.length * DECK_COST;
  }

  paintDeck(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '깔 칸이 없습니다' };
    // 한 번에 여러 칸 — 앞 칸이 깔리면 뒷 칸이 이어질 수 있으므로 순서대로 판정하며 임시 적용
    const before = tiles.map((t) => this.grid.at(t.i, t.j));
    const undo = (): void => { tiles.forEach((t, k) => this.grid.set(t.i, t.j, before[k] as FloorCode)); };
    for (const t of tiles) {
      const r = this.canPaintDeck(t.i, t.j);
      if (!r.ok) { undo(); return r; }
      this.grid.set(t.i, t.j, FLOOR.deck);
    }
    undo();
    const cost = this.deckCost(tiles);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    // P48-b2 W6: 이 데크가 새로 밀폐할 물이 허가 예산을 넘으면 거절(창 × 예산)
    const enclose = this.wouldEnclose(tiles.map((t) => ({ i: t.i, j: t.j, code: FLOOR.deck })));
    if (enclose > 0 && this.permitUsed + enclose > this.permitMax) return { ok: false, reason: this.permitOverReason(enclose) };
    this.spend(cost, 'deck'); // P50-b1 지출 구성
    for (const t of tiles) { this.grid.set(t.i, t.j, FLOOR.deck); this.fx.push({ kind: 'place', i: t.i, j: t.j }); }
    this.syncEnclosedWater(); // D128: 세계를 바꾼 뒤 sync → after — 밀폐한 그 프레임의 등급·켜짐이 새 수역으로 계산된다
    this.afterWorldChange();
    return { ok: true };
  }

  unpaintDeck(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '걷을 칸이 없습니다' };
    for (const t of tiles) {
      if (this.grid.at(t.i, t.j) !== FLOOR.deck) return { ok: false, reason: '데크가 아닙니다' };
      if (this.facilities.occupied(t.i, t.j)) return { ok: false, reason: '시설 아래 데크는 걷을 수 없습니다 — 먼저 시설을 옮기세요' };
    }
    const broke = this.breaksAccess(
      () => { for (const t of tiles) this.grid.set(t.i, t.j, this.grid.naturalAt(t.i, t.j)); },
      () => { for (const t of tiles) this.grid.set(t.i, t.j, FLOOR.deck); },
      tiles.length,
    );
    if (broke) return { ok: false, reason: '손님 길이 끊깁니다 — 데크가 다리 노릇을 하고 있습니다' };
    for (const t of tiles) { this.grid.set(t.i, t.j, this.grid.naturalAt(t.i, t.j)); this.fx.push({ kind: 'fill', i: t.i, j: t.j }); }
    this.syncEnclosedWater(); // D128 sync → after
    this.afterWorldChange();
    return { ok: true };
  }

  canFill(i: number, j: number): Result {
    if (!this.grid.inside(i, j) || this.grid.at(i, j) !== FLOOR.pool) return { ok: false, reason: '수역이 아닙니다' };
    return { ok: true };
  }

  digCost(tiles: readonly { i: number; j: number }[]): number {
    return tiles.length * this.b.poolTileCost;
  }

  fillCost(tiles: readonly { i: number; j: number }[]): number {
    return tiles.length * this.b.poolRemoveCost;
  }

  digPool(tiles: readonly { i: number; j: number }[], opts: { autoPath?: boolean } = {}): Result { // P49-a2: 타일 인자 삭제(물빛 없음)
    if (tiles.length === 0) return { ok: false, reason: '팔 칸이 없습니다' };
    for (const t of tiles) {
      const r = this.canDig(t.i, t.j);
      if (!r.ok) return r;
    }
    const cost = this.digCost(tiles);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    if (this.permitUsed + tiles.length > this.permitMax) return { ok: false, reason: this.permitOverReason(tiles.length) }; // P48-b2 W6: 파는 수역도 예산 안
    // P16: API(봇·검사)는 수역 둘레까지 길을 이어 준다(길 값을 낸다) — 플레이어는 데크/길 붓으로 직접
    if (opts.autoPath !== false) {
      const ring: { i: number; j: number }[] = [];
      const set = new Set(tiles.map((t) => `${t.i},${t.j}`));
      for (const t of tiles) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const a = t.i + di, b = t.j + dj; if (!set.has(`${a},${b}`) && this.grid.inside(a, b)) { const c = this.grid.at(a, b); if ((c === FLOOR.grass || c === FLOOR.path || c === FLOOR.deck) && !this.facilities.occupied(a, b)) ring.push({ i: a, j: b }); } }
      this.ensurePathToRing(ring);
    }
    const before = tiles.map((t) => this.grid.at(t.i, t.j));
    if (this.breaksAccess(() => { for (const t of tiles) this.grid.set(t.i, t.j, FLOOR.pool); }, () => { tiles.forEach((t, k) => this.grid.set(t.i, t.j, before[k] as FloorCode)); }, tiles.length)) {
      return { ok: false, reason: '입구에서 닿지 않는 곳이 생깁니다' };
    }
    this.spend(cost);
    for (const t of tiles) {
      this.grid.set(t.i, t.j, FLOOR.pool);
      this.fx.push({ kind: 'dig', i: t.i, j: t.j });
    }
    this.afterWorldChange();
    this.checkStory(true);
    return { ok: true };
  }

  fillPool(tiles: readonly { i: number; j: number }[]): Result {
    if (tiles.length === 0) return { ok: false, reason: '메울 칸이 없습니다' };
    for (const t of tiles) {
      const r = this.canFill(t.i, t.j);
      if (!r.ok) return r;
    }
    const cost = this.fillCost(tiles);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    this.spend(cost);
    for (const t of tiles) {
      this.grid.set(t.i, t.j, this.grid.naturalAt(t.i, t.j)); // P1: 부표를 걷으면 강으로 · P48-a: 뭍이면 그 자리의 자연 바닥으로
      this.fx.push({ kind: 'fill', i: t.i, j: t.j });
    }
    for (const g of this.guests.all) {
      if (g.state === 'swim' && g.swimTile !== null && tiles.some((t) => t.j * this.grid.w + t.i === g.swimTile)) {
        g.state = 'wander';
        g.stateTicks = 0;
        g.swimTile = null;
        g.target = null;
      }
    }
    this.afterWorldChange();
    return { ok: true };
  }

  // ── 시나리오 (G16) ────────────────────────────────────────────────────
  /** 판 상태로 비트를 판정해 Strip 사건으로 적재. 30tick 마다 + 명령 뒤에 부른다 */
  checkStory(force = false): void {
    // ⚠ 「마지막 판정 tick」을 들고 있으면 스냅샷 왕복 뒤 박자가 어긋난다 — 절대 tick 의 배수로만 판정한다
    if (!force && this.absTick % 30 !== 0) return;
    const beats = this.story.check({
      pools: this.pools.all.length, poolTiles: this.pools.totalTiles(), visitors: this.stats.visitors, likes: this.sns.totalLikes,
      wishes: this.sns.unlockedFriends.reduce((n, f) => n + f.done.length, 0), certs: this.certs.passes(), rank: this.rank,
      year: this.clock.year, areas: this.sns.areas.length, recipes: this.cooking.known.size, money: this.money, ended: this.clock.ended, hallSales: (this.stats.passByEnter ?? 0) + (this.stats.passByLeave ?? 0),
      // P53-b 빠지 축 6 — 켜진 기구 · 최장 사슬 · 최고 등급 · 공방 도감 · 팔찌 · 개조
      rigs: this.rigState.lit.size, rigPath: Math.max(0, ...this.pools.all.map((p) => this.pathOf(p.id).length)), rigGrade: Math.max(0, ...this.pools.all.map((p) => this.ppajiGradeOf(p.id))),
      gearsKnown: this.workshop.known.size, vestRentals: this.stats.vestRentals ?? 0, rigUpgrades: this.stats.converts ?? 0,
    });
    for (const b of beats) this.inbox.push({ tick: this.tick, day: this.day, kind: 'story', priority: 'strip', title: b.speaker, body: b.lines.join('\n'), speaker: b.speaker });
  }

  // ── 명령: 랜덤 이벤트 (G21) ───────────────────────────────────────────
  private pushChoice(def: RandomEventDef): void {
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'choice', priority: 'modal', title: def.name, body: def.text, data: { id: def.id, choices: def.choices.map((c) => ({ label: c.label, cost: c.cost ?? 0 })) } });
  }
  /** 검사·봇용 — 지정 이벤트를 지금 띄운다 */
  forceEvent(id: string): boolean {
    const def = EVENT_DEFS.get(id);
    if (!FEATURES.randomEvents) return false;
    if (!def || this.events.pending) return false;
    this.events.pending = id;
    this.pushChoice(def);
    return true;
  }
  resolveEvent(choice: number): Result {
    const pend = this.events.pending ? EVENT_DEFS.get(this.events.pending) : undefined;
    if (!pend) return { ok: false, reason: '열린 이벤트가 없습니다' };
    const pick = pend.choices[choice] ?? pend.choices[0];
    if (!pick) return { ok: false, reason: '선택지가 없습니다' };
    if ((pick.cost ?? 0) > this.money) return { ok: false, reason: `돈이 부족합니다 — ${(pick.cost ?? 0).toLocaleString('ko-KR')}G 필요` };
    const r = this.events.resolve(choice, this.day);
    if (!r) return { ok: false, reason: '열린 이벤트가 없습니다' };
    const e = r.pick.effect;
    this.spend(pick.cost ?? 0);
    if (e.money) this.money += e.money;
    if (e.likes) this.sns.addBonusLikes(e.likes);
    if (e.clean) this.staff.cleanliness = Math.max(0, Math.min(100, this.staff.cleanliness + e.clean));
    if (e.waterClosedDays) this.waterClosedUntil = this.day + e.waterClosedDays - 1; // P52-c: 오늘부터 N일 입수 0
    let lost = 0;
    if (e.rigLoss !== undefined && e.rigLoss > 0) { // P52-c 장마 유실 — 물 위 기구마다 accident 스트림 1회(앵커 개조판 면제), 바닥은 안 건드린다
      for (const f of [...this.facilities.all]) {
        const d = this.facilities.defOf(f);
        if (d.class !== 'rig' || d.onRing === true) continue;
        const roll = this.rng.accident.next();
        if (this.isAnchored(d.id)) continue;
        if (roll < e.rigLoss) { this.facilities.remove(f.uid); lost++; }
      }
      if (lost > 0) { this.fx.push({ kind: 'splash', i: this.gate.i, j: this.gate.j }); this.afterWorldChange(); }
    }
    this.popCache = null;
    const bits: string[] = [];
    if (e.arrivalMul && e.days) bits.push(`손님 ×${e.arrivalMul} (${e.days}일)`);
    if (e.popBonus && e.days) bits.push(`인기 +${e.popBonus} (${e.days}일)`);
    if (e.likes) bits.push(`좋아요 +${e.likes}`);
    if (e.money) bits.push(`+${e.money.toLocaleString('ko-KR')}G`);
    if (e.clean) bits.push(`청결 ${e.clean > 0 ? '+' : ''}${e.clean}`);
    if (e.waterClosedDays) bits.push(`야외 수역 ${e.waterClosedDays}일 폐쇄`);
    if (e.rigLoss !== undefined && e.rigLoss > 0) bits.push(lost > 0 ? `기구 ${lost}개 유실 — 앵커 개조판은 남았다` : '유실 0 (운이 좋았다)');
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: r.def.name, body: bits.join(' · ') || '그대로' });
    return { ok: true };
  }

  // ── 명령: 직원 (G20) ──────────────────────────────────────────────────
  canHire(roleId: string): Result & { cost?: number } {
    if (!FEATURES.staff) return { ok: false, reason: '이 게임에는 직원이 없습니다' };
    const role = STAFF_ROLES.get(roleId);
    if (!role) return { ok: false, reason: '없는 직종입니다' };
    if (role.hireCost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${role.hireCost.toLocaleString('ko-KR')}G 필요`, cost: role.hireCost };
    return { ok: true, cost: role.hireCost };
  }
  hireStaff(roleId: string): Result & { uid?: number } {
    const r = this.canHire(roleId);
    if (!r.ok) return r;
    const st = this.staff.hire(roleId, { i: this.gate.i, j: this.gate.j + 1 });
    if (!st) return { ok: false, reason: '직원이 너무 많습니다' };
    this.spend(r.cost ?? 0);
    this.fx.push({ kind: 'place', i: st.i, j: st.j });
    return { ok: true, uid: st.uid };
  }
  fireStaff(uid: number): Result {
    return this.staff.fire(uid) ? { ok: true } : { ok: false, reason: '없는 직원입니다' };
  }
  /** 오늘 입장 수 (청결 계산) */
  private enteredTodayCount(): number {
    const last = this.stats.days.length;
    void last;
    return this.guests.enteredToday;
  }

  // ── 명령: 시설 개선 (G19) ─────────────────────────────────────────────
  canUpgrade(uid: number): Result & { cost?: number } {
    if (!FEATURES.facilityLevels) return { ok: false, reason: '이 게임에는 시설 개선이 없습니다' };
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '시설이 없습니다' };
    if (f.level >= FACILITY_MAX_LEVEL) return { ok: false, reason: '최고 단계입니다' };
    const cost = upgradeCost(this.facilities.defOf(f), f);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요`, cost };
    return { ok: true, cost };
  }

  /** 개선 Lv+1 — 인기 +15%/단, 정원 +1(3·5단). 비용 = 건설비 × 0.5 × 단계 */
  upgradeFacility(uid: number): Result {
    const r = this.canUpgrade(uid);
    if (!r.ok) return r;
    const f = this.facilities.byUid(uid) as PlacedFacility;
    this.spend(r.cost ?? 0);
    f.level++;
    this.facilities.bump();
    this.popCache = null;
    this.fx.push({ kind: 'place', i: f.i, j: f.j });
    return { ok: true };
  }

  /** 시설 실효 인기·정원 (정보 창·랭킹) */
  facilityPop(f: PlacedFacility): number { return popOf(this.facilities.defOf(f), f) + this.viewBonusOf(f); }

  // ── 뷰 (P16, D24 ②) — 시설 정면(+J, 강 쪽) 앞 4줄 안에 물이 보이면 1~3, 단 위면 +1. 평상·식당·놀이·숙박이 값을 받는다 ──
  /** 가상 배치의 뷰 (P24 조준 라벨) */
  viewAt(def: FacilityDef, i: number, j: number): number { return this.viewOf({ uid: 0, defId: def.id, i, j, facing: 0, rentedBy: null, usesToday: 0, level: 1, usesTotal: 0, incomeToday: 0, incomeTotal: 0 } as PlacedFacility); }
  viewOf(f: PlacedFacility): number {
    const def = this.facilities.defOf(f);
    const front = f.j + def.d; // 정면 바로 앞 줄
    let best = 0;
    for (let dj = 0; dj < 4 && best === 0; dj++) {
      for (let a = 0; a < def.w; a++) {
        const c = this.grid.at(f.i + a, front + dj);
        if (c === FLOOR.river || c === FLOOR.shallow || c === FLOOR.pool) { best = 3 - Math.min(2, dj); break; }
      }
    }
    return Math.min(4, best + (best > 0 && this.grid.levelAt(f.i, f.j) > 0 ? 1 : 0));
  }
  viewBonusOf(f: PlacedFacility): number {
    const def = this.facilities.defOf(f);
    if (def.class !== 'lounging' && def.class !== 'restaurant' && def.class !== 'attraction') return 0;
    return Math.round(popOf(def, f) * 0.1 * this.viewOf(f));
  }

  // ── 인접 콤보 (P16, D24 ③) ──
  combos(): ActiveCombo[] {
    const key = `${this.facilities.version}`;
    if (this.comboCache && this.comboCache.key === key) return this.comboCache.list;
    const list = activeCombos(this.facilities.all, (f) => this.facilities.defOf(f));
    this.comboCache = { key, list };
    return list;
  }
  combosOf(uid: number): ActiveCombo[] { return this.combos().filter((c) => c.a.uid === uid || c.b.uid === uid); }
  get comboCount(): number { return COMBO_DEFS.length; }
  /** 새로 발동한 콤보를 알린다 — 배치 뒤에 부른다 */
  private noteCombos(): void {
    for (const c of this.combos()) {
      if (this.combosSeen.has(c.def.id)) continue;
      this.combosSeen.add(c.def.id);
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: `콤보 발견 · ${c.def.name}`, body: `${this.facilities.defOf(c.a).name}과 ${this.facilities.defOf(c.b).name}이 가까이 있다 — 손님 만족 +${c.def.sat} · 매출 +${c.def.revenue}%` });
      this.fx.push({ kind: 'discover', i: c.a.i, j: c.a.j, amount: 1, label: c.def.name });
    }
  }
  facilityCapacity(f: PlacedFacility): number { return capacityOf(this.facilities.defOf(f), f); }

  /** 라이벌 인기 (연차 기준, 결정론) */
  rivalPops(): { name: string; pop: number }[] {
    const y = this.clock.year;
    return RIVALS.map((r, k) => ({ name: r.name, pop: r.basePop + r.growth * (y - 1) + ((this.seed * 31 + k * 97) % 60) }));
  }
  rankPosition(): number {
    if (!FEATURES.rivals) return 0;
    const mine = this.parkPopularity();
    return 1 + this.rivalPops().filter((r) => r.pop > mine).length;
  }

  private topFacilities(n: number): { name: string; income: number; uses: number }[] {
    return [...this.facilities.all].sort((a, b) => b.incomeToday - a.incomeToday || b.usesToday - a.usesToday).slice(0, n)
      .filter((f) => f.incomeToday > 0 || f.usesToday > 0).map((f) => ({ name: this.facilities.defOf(f).name, income: f.incomeToday, uses: f.usesToday }));
  }
  private topMenus(sales: Record<string, number>, n: number): { name: string; sales: number }[] {
    return Object.entries(sales).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, c]) => ({ name: this.menus.recipes.get(id)?.name ?? id, sales: c }));
  }

  // ── 명령: 시설 ────────────────────────────────────────────────────

  /** P31 D39 — 접면: 발자국 둘레(ring)에 입구에서 이어진 걷는 바닥이 하나라도 닿는가. 장식은 예외. API·봇·킷은 autoPath 로 길을 내므로 플레이어 독만 이 규칙을 묻는다 */
  ringHasPath(def: FacilityDef, i: number, j: number, facing: 0 | 1): boolean {
    const reach = this.reachSet();
    return FacilityStore.ring(def, i, j, facing).some((t) => this.grid.inside(t.i, t.j) && reach[t.j * this.grid.w + t.i] === 1);
  }
  static readonly FRONTAGE_REASON = '길에 붙여 놓으세요 — 시설은 입구에서 이어진 길·데크에 닿아야 손님이 옵니다 (수역 독 「길」 탭으로 길을 먼저 내세요)';

  /** P46 D58 — 건물류(편의·식당·슬라이드·숙박)는 **야외에서** 서로 변이 닿으면 안 된다: 발자국이 닿기만 해도 그림이 한 덩어리로 겹친다(P44-b 실측, 원작도 건물은 한 칸 띄운다). 자리·장식·놀이는 자유, 실내(락커 열·샤워 열)는 가구라 자유 */
  static isBuildingClass(def: FacilityDef): boolean { return def.class === 'utility' || def.class === 'restaurant' || def.class === 'slide' || def.lodging === true; }
  private tooClose(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): PlacedFacility | null {
    if (def.class === 'rig' || def.onRing === true) return null; // P48-c R3 · P50-a R8: 기구·링 시설은 붙어 산다(사슬) — 간격 규칙 밖
    if (!Game.isBuildingClass(def)) return null;
    const fp = FacilityStore.footprint(def, i, j, facing);
    if (fp.some((t) => isIndoorCode(this.grid.at(t.i, t.j)))) return null; // 실내는 자유
    for (const t of fp) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const o = this.facilities.at(t.i + di, t.j + dj);
      if (!o || o.uid === selfUid) continue;
      const od = this.facilities.defOf(o);
      if (od.class === 'rig' || od.onRing === true) continue; // P50-a R8: 상대가 기구·링 시설이어도 면제
      if (Game.isBuildingClass(od) && !isIndoorCode(this.grid.at(o.i, o.j))) return o;
    }
    return null;
  }
  canPlace(defId: string, i: number, j: number, facing: 0 | 1 = 0, opts: { inherited?: boolean; frontage?: boolean } = {}): Result {
    const def = FACILITY_DEFS.get(defId);
    if (!def) return { ok: false, reason: FACILITY_FAIL_KO.unknown };
    if (this.arrivalRevision && FacilityStore.footprint(def, i, j, facing).some(t => arrivalRoute(this.gate).some(a => a.i === t.i && a.j === t.j))) return { ok: false, reason: '매표소와 실내를 잇는 출입 통로입니다' };
    if (!opts.inherited && !this.isUnlocked(defId)) return { ok: false, reason: '아직 해금되지 않은 시설입니다' };
    if (def.derived !== true && FacilityStore.footprint(def, i, j, facing).some((t) => this.foodcourts.ownerAt(t.i, t.j) !== null)) return { ok: false, reason: '푸드코트 자리입니다 — 영역을 지우거나 옆에 두세요' }; // P58-a
    const r = this.facilities.check(defId, i, j, facing, this.land, this.gate, 0, this.permitDepth, this.waterRules);
    if (!r.ok) return { ok: false, reason: FACILITY_FAIL_KO[r.fail] };
    if (FacilityStore.footprint(def, i, j, facing).some((t) => !isWaterCode(this.grid.naturalAt(t.i, t.j)) && !this.ownsTile(t.i, t.j))) return { ok: false, reason: '아직 내 땅이 아닙니다 — 랭크를 올리면 마당이 넓어집니다' }; // P38 D46 // P48-b2: 자연 바닥이 물이면(잔교·링 데크 위) 「내 앞 수면」 판정은 check() 이 이미 했다
    // 실내 전용 (G36, §1.4 이글루·사우나) — 발자국 전부가 실내 바닥이어야 한다
    if (def.outdoorOnly && FacilityStore.footprint(def, i, j, facing).some((t) => isIndoorCode(this.grid.at(t.i, t.j)))) return { ok: false, reason: '야외 식당은 실내에 못 놓습니다 — 복도 곁엔 실내 매점·포장 창구를' }; // P45-b D63
    { const near = this.tooClose(def, i, j, facing); if (near) return { ok: false, reason: `한 칸 띄우세요 — ${this.facilities.defOf(near).name}과 붙으면 한 덩어리로 보입니다` }; } // P46 D58
    if (def.indoorOnly && FacilityStore.footprint(def, i, j, facing).some((t) => this.grid.at(t.i, t.j) !== FLOOR.indoor)) return { ok: false, reason: '실내 바닥 위에만 — 수역 독 「건물 바닥」을 깔아 건물을 넓히세요' };
    if (this.facilities.all.some((o) => o.defId === 'entrance' && FacilityStore.footprint(def, i, j, facing).some((t) => t.i === o.i && t.j === o.j))) return { ok: false, reason: '입구 위엔 놓을 수 없습니다' }; // P42: 입구는 점유를 안 해서 따로 막는다
    if (def.id === 'entrance') { const edge = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([di, dj]) => this.grid.inside(i + di, j + dj) && !isIndoorCode(this.grid.at(i + di, j + dj)) && isWalkFloor(this.grid.at(i + di, j + dj))); if (!edge) return { ok: false, reason: '입구는 건물 바닥의 가장자리 칸에 — 바깥 마당·길에 닿는 칸' }; } // P42 D53
    if (def.maxPerPark !== undefined && this.facilities.all.filter((o) => o.defId === def.id).length >= def.maxPerPark) return { ok: false, reason: `${def.name}은(는) 판에 ${def.maxPerPark}개까지 — 이미 있습니다` }; // P50-a R10: 랜드마크는 `canPlace` 층 한 줄(id 를 코드에 안 적는다)
    if (!opts.inherited && def.cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${def.cost.toLocaleString('ko-KR')}G 필요` };
    if (opts.frontage && def.class !== 'decor' && def.class !== 'rig' && def.onRing !== true && !this.ringHasPath(def, i, j, facing)) return { ok: false, reason: Game.FRONTAGE_REASON }; // P31 D39 · P50-a R8: 기구·링 시설은 접면 면제
    return { ok: true };
  }

  /** `inherited` — 시작 킷(G25): 해금·돈을 안 본다. 물려받은 것은 다시 지을 수 없다는 뜻이기도 하다 */
  placeFacility(defId: string, i: number, j: number, facing: 0 | 1 = 0, opts: { inherited?: boolean; autoPath?: boolean; frontage?: boolean } = {}): Result & { uid?: number } {
    const r = this.canPlace(defId, i, j, facing, opts);
    if (!r.ok) return r;
    const def = FACILITY_DEFS.get(defId) as FacilityDef;
    let placed: PlacedFacility | null = null;
    const broke = this.breaksAccess(
      () => { placed = this.facilities.place(defId, i, j, facing); },
      () => { if (placed) this.facilities.remove(placed.uid); },
      FacilityStore.footprint(def, i, j, facing).length,
    );
    if (broke) return { ok: false, reason: '손님 길이 막힙니다 — 입구에서 닿지 않는 곳이 생깁니다' };
    placed = this.facilities.place(defId, i, j, facing);
    if (!opts.inherited) { this.spend(def.cost, def.class === 'rig' || def.onRing === true ? 'rig' : undefined); if (def.class === 'rig' || def.onRing === true) placed.paidToday = def.cost; } // P51: 기구·링 위는 그날 전액 환불
    this.fx.push({ kind: 'place', i, j });
    this.afterWorldChange();
    this.guests.evictFrom(FacilityStore.footprint(def, i, j, facing)); // G57: 발자국 위 손님을 옆 칸으로
    if (opts.autoPath !== false) this.ensurePath(placed.uid); // P16: API 는 길을 이어 준다(값을 낸다) — 플레이어 독은 autoPath: false
    this.noteCombos();
    if (def.menuSlots > 0) this.autoEquipMenus(placed.uid, 3); // P23 D34: 식당은 놓이는 순간 궁합 좋은 메뉴 3개가 걸린다 (원작 방식) — 새 판 매출 0 을 막는다
    return { ok: true, uid: placed.uid };
  }

  /** 이동 (G52, 원작 이동 도구 — 첫 심사 합격 뒤 사장 선물). 돈은 안 든다: 도구 자체가 값이다 */
  canMoveFacility(uid: number, i: number, j: number, facing: 0 | 1, opts: { frontage?: boolean } = {}): Result {
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '시설이 없습니다' };
    if (!this.tools.has('move')) return { ok: false, reason: '이동 도구가 없습니다 — 첫 심사 합격 뒤 사장이 보낸다' };
    if (f.passage) return { ok: false, reason: '정문 매표소는 출입 통로에 연결되어 있습니다' };
    if (f.i === i && f.j === j && f.facing === facing) return { ok: false, reason: '같은 자리입니다 — 지도를 탭해 옮길 곳을 고르세요' };
    const def = this.facilities.defOf(f);
    if (this.arrivalRevision && FacilityStore.footprint(def, i, j, facing).some(t => arrivalRoute(this.gate).some(a => a.i === t.i && a.j === t.j))) return { ok: false, reason: '매표소와 실내를 잇는 출입 통로입니다' };
    const r = this.facilities.check(def.id, i, j, facing, this.land, this.gate, uid, this.permitDepth, this.waterRules);
    if (!r.ok) return { ok: false, reason: FACILITY_FAIL_KO[r.fail] };
    if (def.outdoorOnly && FacilityStore.footprint(def, i, j, facing).some((t) => isIndoorCode(this.grid.at(t.i, t.j)))) return { ok: false, reason: '야외 식당은 실내에 못 놓습니다 — 복도 곁엔 실내 매점·포장 창구를' }; // P45-b D63
    { const near = this.tooClose(def, i, j, facing, uid); if (near) return { ok: false, reason: `한 칸 띄우세요 — ${this.facilities.defOf(near).name}과 붙으면 한 덩어리로 보입니다` }; } // P46 D58
    if (def.indoorOnly && FacilityStore.footprint(def, i, j, facing).some((t) => this.grid.at(t.i, t.j) !== FLOOR.indoor)) return { ok: false, reason: '실내 바닥 위에만 — 수역 독 「건물 바닥」을 깔아 건물을 넓히세요' };
    if (opts.frontage && def.class !== 'decor' && def.class !== 'rig' && def.onRing !== true && !this.ringHasPath(def, i, j, facing)) return { ok: false, reason: Game.FRONTAGE_REASON }; // P31 D39 · P50-a R8: 기구·링 시설은 접면 면제
    return { ok: true };
  }

  moveFacility(uid: number, i: number, j: number, facing: 0 | 1, opts?: { autoPath?: boolean; frontage?: boolean }): Result {
    const r = this.canMoveFacility(uid, i, j, facing, opts ?? {});
    if (!r.ok) return r;
    const f = this.facilities.byUid(uid) as PlacedFacility;
    const def = this.facilities.defOf(f);
    const from = { i: f.i, j: f.j, facing: f.facing };
    const broke = this.breaksAccess(
      () => { this.facilities.move(uid, i, j, facing); },
      () => { this.facilities.move(uid, from.i, from.j, from.facing); },
      FacilityStore.footprint(def, i, j, facing).length,
      uid, // P16: 옮기는 시설 자신은 「닿지 않음」에 안 센다 — 옮긴 뒤 길을 잇는다
    );
    if (broke) return { ok: false, reason: '손님 길이 막힙니다 — 입구에서 닿지 않는 곳이 생깁니다' };
    this.facilities.move(uid, i, j, facing);
    // 이용 중이던 손님은 놓아준다 (철거와 같은 규칙)
    for (const g of this.guests.all) {
      if (g.target?.kind === 'facility' && g.target.uid === uid) {
        g.target = null;
        if (g.state === 'use' || g.state === 'walk') { g.state = 'wander'; g.stateTicks = 0; }
      }
    }
    this.fx.push({ kind: 'place', i, j });
    this.afterWorldChange();
    this.guests.evictFrom(FacilityStore.footprint(def, i, j, facing));
    if (opts?.autoPath !== false) this.ensurePath(uid);
    return { ok: true };
  }

  removeFacility(uid: number): Result & { refund?: number } {
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '시설이 없습니다' };
    const cost = this.b.facilityRemoveCost;
    if (cost > this.money) return { ok: false, reason: `철거비 ${cost}G 가 부족합니다` };
    // 이용 중이던 손님은 놓아준다
    for (const g of this.guests.all) {
      if (g.target?.kind === 'facility' && g.target.uid === uid) {
        g.target = null;
        if (g.state === 'use' || g.state === 'walk') { g.state = 'wander'; g.stateTicks = 0; }
      }
    }
    const rdef = this.facilities.defOf(f);
    const refund = f.paidToday !== undefined ? f.paidToday : (rdef.class === 'rig' || rdef.onRing === true) ? Math.round(rdef.cost * this.b.rigRemoveRefund) : 0; // P51: 그날은 전액, 그 뒤 기구·링 위는 `rigRemoveRefund`(0.5) — 실수한 배치가 벌이 되지 않게
    this.facilities.remove(uid);
    this.menus.drop(uid);
    this.menuVersion++;
    this.spend(cost);
    if (refund > 0) this.money += refund;
    this.fx.push({ kind: 'remove', i: f.i, j: f.j });
    this.afterWorldChange();
    return refund > 0 ? { ok: true, refund } : { ok: true };
  }
  // ── P51 개조 (G1) ──────────────────────────────────────────────
  /** 개조비 = round100((max(0, to−from) + to×convertFee) × (1 − convertLevelDiscount×(lv−1), 상한 25%)) — 예 트램폴린 2,600 → 더블 팡팡 3,400 = 1,800G */
  convertCost(from: FacilityDef, to: FacilityDef, level: number): number {
    const disc = Math.min(0.25, this.b.convertLevelDiscount * Math.max(0, level - 1));
    return Math.round(((Math.max(0, to.cost - from.cost) + to.cost * this.b.convertFee) * (1 - disc)) / 100) * 100;
  }
  private convertCheck(uid: number, toDefId: string): { ok: true; f: PlacedFacility; from: FacilityDef; to: FacilityDef; recipe: RigUpgradeDef; cost: number } | { ok: false; reason: string } {
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '시설이 없습니다' };
    const from = this.facilities.defOf(f);
    const to = FACILITY_DEFS.get(toDefId);
    if (!to) return { ok: false, reason: '알 수 없는 개조판입니다' };
    const recipe = RIG_UPGRADES.find((r) => r.from === from.id && r.to === toDefId);
    if (!recipe) return { ok: false, reason: `${from.name}은(는) ${to.name}(으)로 개조할 수 없습니다` };
    if (!this.rigs.known.has(recipe.id)) return { ok: false, reason: `아직 모르는 개조입니다 — 「기구 개조」에서 부품을 섞어 ${recipe.name}을(를) 찾으세요` };
    if (this.guests.all.some((g) => g.target?.kind === 'facility' && g.target.uid === uid && (g.state === 'ride' || g.state === 'climb'))) return { ok: false, reason: '타는 중인 손님이 있습니다 — 잠시 뒤에' };
    const r = this.facilities.check(toDefId, f.i, f.j, f.facing, this.land, this.gate, uid, this.permitDepth, this.waterRules);
    if (!r.ok) return { ok: false, reason: FACILITY_FAIL_KO[r.fail] };
    if (to.outdoorOnly && FacilityStore.footprint(to, f.i, f.j, f.facing).some((t) => isIndoorCode(this.grid.at(t.i, t.j)))) return { ok: false, reason: '야외 식당은 실내에 못 놓습니다' };
    { const near = this.tooClose(to, f.i, f.j, f.facing, uid); if (near) return { ok: false, reason: `한 칸 띄우세요 — ${this.facilities.defOf(near).name}과 붙으면 한 덩어리로 보입니다` }; }
    if (to.indoorOnly && FacilityStore.footprint(to, f.i, f.j, f.facing).some((t) => this.grid.at(t.i, t.j) !== FLOOR.indoor)) return { ok: false, reason: '실내 바닥 위에만' };
    const cost = this.convertCost(from, to, f.level);
    return { ok: true, f, from, to, recipe, cost };
  }
  /** 미리보기 네 값 — 스릴·정원·안전·개조비 (위험 두 필드는 P52-b 가 optional 로 더한다) */
  convertPreview(uid: number, toDefId: string): (Result & { thrill?: number; capacity?: number; safe?: number; cost?: number; from?: string; to?: string; risk?: RiskLevel; riskLabel?: string }) {
    const c = this.convertCheck(uid, toDefId);
    if (!c.ok) return c;
    const risk = this.riskOf(c.to, c.f.i, c.f.j, c.f.facing, c.f.uid); // P52-b 위험 두 필드(optional)
    return { ok: true, thrill: c.to.thrill ?? 0, capacity: capacityOf(c.to, c.f), safe: c.to.safe ?? 0, cost: c.cost, from: c.from.name, to: c.to.name, risk: risk.level, riskLabel: risk.label };
  }
  /** 개조 — `move` 와 대칭: uid·자리·방향·알바·수입·paidToday 보존, `defId` 만 바뀐다. 검사 8단(인스턴스·정의 → 레시피 → 도감 → 탑승 중 → check → 이동 다섯 줄 → breaksAccess → 돈) */
  /** P53-b G8 — 뉴게임+: 이월한 개조 도감이 있으면 **개조판 한 채**가 킷 빠지에 서 있다(첫 화면의 「내가 지난 판에 만든 것」). 아는 레시피 중 base 가 놓이는 첫 자리 · 값 0 · 개조 통계엔 안 센다 */
  placeNgPlusRig(): string | null {
    const pool = [...this.pools.all].sort((a, b) => b.tiles.length - a.tiles.length)[0];
    if (!pool) return null;
    for (const up of RIG_UPGRADES) {
      if (!this.rigs.known.has(up.id)) continue;
      const from = FACILITY_DEFS.get(up.from);
      if (!from || from.buildable === false) continue;
      for (const k of pool.tiles) {
        const i = k % this.grid.w, j = Math.floor(k / this.grid.w);
        for (const f of [0, 1] as const) {
          if (!this.canPlace(up.from, i, j, f, { inherited: true }).ok) continue;
          const r = this.placeFacility(up.from, i, j, f, { inherited: true });
          if (!r.ok || r.uid === undefined) continue;
          if (this.facilities.convert(r.uid, up.to)) { this.afterWorldChange(); return up.to; }
          this.removeFacility(r.uid);
        }
      }
    }
    return null;
  }

  convertFacility(uid: number, toDefId: string): Result & { cost?: number } {
    const c = this.convertCheck(uid, toDefId);
    if (!c.ok) return c;
    if (c.cost > this.money) return { ok: false, reason: `돈이 부족합니다 — 개조비 ${c.cost.toLocaleString('ko-KR')}G 필요` };
    const fromId = c.from.id;
    const broke = this.breaksAccess(() => { this.facilities.convert(uid, toDefId); }, () => { this.facilities.convert(uid, fromId); }, 0, uid);
    if (broke) return { ok: false, reason: '손님 길이 막힙니다 — 입구에서 닿지 않는 곳이 생깁니다' };
    if (!this.facilities.convert(uid, toDefId)) return { ok: false, reason: '발자국이 다른 개조판입니다' };
    this.spend(c.cost, 'convert');
    this.stats.converts = (this.stats.converts ?? 0) + 1;
    this.fx.push({ kind: 'place', i: c.f.i, j: c.f.j });
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `개조 — ${c.to.name}`, body: `${c.from.name} → ${c.to.name} · −${c.cost.toLocaleString('ko-KR')}G` });
    this.afterWorldChange();
    this.checkStory(true);
    return { ok: true, cost: c.cost };
  }
  /** P52-b — 사고 확률 문맥: 망루(알바가 있어야 · guardRadius 체비셰프) · 같은 수역 링의 구조정 · 수온(18°C 아래) · 혼잡 */
  private readonly accidentStaticCache = new Map<number, { guarded: boolean; rescued: boolean }>(); // P52-c 성능: 망루·구조정은 세계 변경·알바 토글 때만 바뀐다
  accidentContext(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): { guarded: boolean; rescued: boolean; cold: boolean; busy: number; cap: number } {
    if (selfUid) { const c = this.accidentStaticCache.get(selfUid); if (c) { const f = this.facilities.byUid(selfUid); return { ...c, cold: this.outdoorTemp() < 18, busy: f ? this.guests.busyCount(f) : 0, cap: capacityOf(def, f ?? { level: 1 }) }; } }
    const fp = FacilityStore.footprint(def, i, j, facing);
    const near = (o: PlacedFacility, r: number): boolean => { const od = this.facilities.defOf(o); const ofp = FacilityStore.footprint(od, o.i, o.j, o.facing); return fp.some((t) => ofp.some((u) => Math.max(Math.abs(t.i - u.i), Math.abs(t.j - u.j)) <= r)); };
    const guarded = this.facilities.all.some((o) => { const od = this.facilities.defOf(o); return od.guardRadius !== undefined && o.staff === 1 && near(o, od.guardRadius); }); // 망루 알바 없으면 효과 0
    const pid = selfUid ? this.poolOfFacility(selfUid) : null;
    const rescued = this.facilities.all.some((o) => o.defId === 'rescue_dock' && (pid === null ? near(o, 6) : this.poolOfFacility(o.uid) === pid));
    const f = selfUid ? this.facilities.byUid(selfUid) : undefined;
    if (selfUid) this.accidentStaticCache.set(selfUid, { guarded, rescued });
    return { guarded, rescued, cold: this.outdoorTemp() < 18, busy: f ? this.guests.busyCount(f) : 0, cap: capacityOf(def, f ?? { level: 1 }) };
  }
  /** 기구·코스의 위험 단계(0~3) — 확정 바 칩·정보창·`convertPreview` 가 같은 값을 쓴다. 손님 없이 재는 「자리의 위험」이라 vest=true·busy=cap 기준 */
  riskOf(def: FacilityDef, i: number, j: number, facing: 0 | 1, selfUid = 0): { p: number; level: RiskLevel; label: string } {
    const cx = this.accidentContext(def, i, j, facing, selfUid);
    const p = accidentChance({ thrill: def.thrill ?? 0, safe: def.safe ?? 2, vest: true, guarded: cx.guarded, rescued: cx.rescued, briefed: false, cold: cx.cold, busy: cx.cap, cap: cx.cap }, this.b);
    const level = riskLevel(p);
    return { p, level, label: RISK_LABELS[level] ?? '' };
  }
  /** 사고 한 번 — 뽑기는 호출부가 했다. 하루 상한(넘으면 결과를 버린다) · hp −35 · 만족 −20 · 토스트 · 수역 인기 감쇠 · 의무실이 있으면 그리로 */
  private applyAccident(g: Guest, f: PlacedFacility | null, what: string): boolean {
    if (this.accidentsToday >= this.b.accidentsPerDay) return false;
    this.accidentsToday++;
    this.stats.accidents = (this.stats.accidents ?? 0) + 1;
    g.hp = Math.max(0, g.hp - this.b.accidentHp); g.sat = Math.max(0, g.sat - this.b.accidentSat); g.say = '아야…';
    const pid = f ? this.poolOfFacility(f.uid) : null;
    if (pid !== null) this.accidentCut.set(pid, Math.min(this.b.accidentPopCutMax, (this.accidentCut.get(pid) ?? 0) + this.b.accidentPopCut));
    const inf = this.facilities.all.find((o) => o.defId === 'infirmary');
    if (inf) { g.target = { kind: 'facility', uid: inf.uid }; g.state = 'walk'; g.stateTicks = 0; }
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `사고 — ${what}`, body: `${g.name}이(가) 다쳤다 · 망루 알바·구조정·브리핑·구명조끼가 확률을 낮춘다` });
    this.fx.push({ kind: 'splash', i: g.i, j: g.j });
    this.poolCache.clear();
    return true;
  }
  /** P52-b 브리핑 토글(코스 창) — 사고 ×0.7 · optional 저장 */
  setCourseBriefing(handle: number, on: boolean): Result {
    const c = this.courses.byHandle(handle);
    if (!c) return { ok: false, reason: '코스가 없습니다' };
    if (on) c.safetyBriefing = true; else delete c.safetyBriefing;
    return { ok: true };
  }
  /** P52-c — 앵커 개조판(레시피 `add` 에 anchor_chain) 은 장마 유실 면제 */
  isAnchored(defId: string): boolean { return RIG_UPGRADES.some((r) => r.to === defId && r.add.includes('anchor_chain')); }
  /** 파크 최고 빠지 등급 — 창구 ⓐ 의 값 기준 */
  parkPpajiGrade(): PpajiGrade { let g: PpajiGrade = 0; for (const p of this.pools.all) { const x = this.ppajiGradeOf(p.id); if (x > g) g = x; } return g; }
  /** P60-c — 파크 최고 등급 수역(동점은 id 작은 쪽) · 없으면 null. 하루권(창구 ⓐ)의 세트 가산이 이 수역 값을 따른다 */
  parkPpajiPool(): number | null { let best: number | null = null, bg: PpajiGrade = 0; for (const p of this.pools.all) { const x = this.ppajiGradeOf(p.id); if (x > bg || (x === bg && x > 0 && best !== null && p.id < best)) { best = p.id; bg = x; } } return best; }
  /** P60-c §10.3 — 수역의 성립 세트 id (`RIG_SETS` 순 · 같은 세트는 한 번) */
  setsOf(poolId: number): readonly string[] { return this.rigState.sets.get(poolId) ?? []; }
  /** P60-d §10.4 — 수역의 입수구 수(뭍에 닿은 링 칸의 연속 구간) · 경로(켜진 기구 uid, 입수구에서 BFS 순) · 코스 완성(스릴 비감소 ∧ 끝 휴식). 전부 `rigState` 파생 — 저장 0 */
  entriesOf(poolId: number): number { return this.rigState.entries.get(poolId) ?? 0; }
  pathOf(poolId: number): readonly number[] { return this.rigState.path.get(poolId) ?? []; }
  pathCompleteOf(poolId: number): boolean { return this.rigState.pathComplete.get(poolId) ?? false; }
  /** P60-c D72 B 고스트 별 — 그 수역에서 세트 `setId` 의 멤버(원종 또는 그 id)인 켜진 물 위 기구·링 위 시설의 발자국 가운데 칸 하나씩. UI 가 「어느 이웃이 세트를 완성하나」를 따로 세지 않도록 sim 이 낸다. `computeRigs` 와 같은 멤버 규칙, 수역은 `byPool`(물 위)·`poolOfFacility`(링 위) */
  setMemberTiles(poolId: number, setId: string): { i: number; j: number }[] {
    const def = RIG_SETS.find((s) => s.id === setId);
    if (!def) return [];
    const mine = this.rigState.byPool.get(poolId) ?? [];
    const out: { i: number; j: number }[] = [];
    for (const f of this.facilities.all) {
      const d = this.facilities.defOf(f);
      const onRing = d.onRing === true;
      if (!onRing && (d.class !== 'rig' || !this.rigState.lit.has(f.uid) || !mine.includes(f.uid))) continue;
      if (onRing && this.poolOfFacility(f.uid) !== poolId) continue;
      if (!def.members.includes(f.defId) && !def.members.includes(rigBaseKind(f.defId))) continue;
      const fp = FacilityStore.footprint(d, f.i, f.j, f.facing);
      const t = fp[Math.floor(fp.length / 2)] ?? { i: f.i, j: f.j };
      out.push({ i: t.i, j: t.j });
    }
    return out;
  }
  /** P60-c — 팔찌 값 관문 하나: `bandPrice` + 50G × 그 수역 세트 수(조끼만(값 0)엔 안 붙는다). `aimPreview`·`issueBand`·정보창이 전부 이것을 읽는다 */
  bandPriceAt(poolId: number | null, tier: WristbandDef, grade: PpajiGrade, sets: number = poolId === null ? 0 : this.setsOf(poolId).length): number { const base = bandPrice(tier, grade); return base > 0 ? base + SET_BAND_BONUS * sets : base; }
  /** 자리 반경 3 안의 켜진 빠지(등급 ≥ 1) 중 등급 최고 */
  private nearestPpajiPool(f: PlacedFacility): number | null { const def = this.facilities.defOf(f); const i0 = f.i - 3, i1 = f.i + def.w + 2, j0 = f.j - 3, j1 = f.j + def.d + 2; let best: number | null = null, bg = 0; for (const p of this.pools.all) { const gr = this.ppajiGradeOf(p.id); if (gr < 1 || gr <= bg) continue; if (p.tiles.some((k) => { const a = k % this.grid.w, b = Math.floor(k / this.grid.w); return a >= i0 && a <= i1 && b >= j0 && b <= j1; })) { best = p.id; bg = gr; } } return best; }
  private bandKey(g: Guest): number { return g.teamId !== null ? g.teamId : -g.uid; }
  /** P52-a G2 — **결제 소유자 하나**: 낮 1회(팀 한 장) · 팀 전원에 배급 · `stats.pkgPpaji`·`f.incomeToday` 누적. 조끼만(값 0)도 「발급」이다(`hasVest`) */
  issueBand(buyer: Guest, tier: WristbandDef, grade: PpajiGrade, f?: PlacedFacility, opts: { night?: boolean; /** P60-c — 값을 매기는 수역(세트 +50G/세트). 없으면 세트 가산 0 */ poolId?: number | null } = {}): { ok: boolean; price: number } {
    const key = this.bandKey(buyer);
    if (opts.night) { if (this.nightBandTeams.has(key)) return { ok: false, price: 0 }; this.nightBandTeams.add(key); } // P54 야간권 — 낮 1회 규칙(`bandPaid`)과 별개, 저장 0(저녁 한 번뿐)
    else { if (this.bandPaid.get(key) === this.day) return { ok: false, price: 0 }; this.bandPaid.set(key, this.day); }
    const base = this.bandPriceAt(opts.poolId ?? null, tier, grade); // P60-c: 팔찌 값 관문 하나
    const price = opts.night ? Math.round(base * this.nightSalesMul() / 10) * 10 : base;
    if (opts.night) { this.nightPkgToday += price; this.stats.nightPkg = (this.stats.nightPkg ?? 0) + price; }
    const team = buyer.teamId === null ? [buyer] : this.guests.all.filter((o) => o.teamId === buyer.teamId);
    for (const o of team) { o.band = tier.id; o.bandLeft = tier.rides; }
    if (price > 0) {
      this.money += price;
      if (!opts.night) this.stats.pkgPpaji = (this.stats.pkgPpaji ?? 0) + price; // P54: 야간권은 `nightPkg` 에만 — 낮 팔찌 몫(ppajiPkgShare·ppajiRevShare)을 안 부풀린다
      buyer.spentToday += price;
      if (f) { f.incomeToday += price; f.incomeTotal += price; }
      this.fx.push({ kind: 'buy', i: buyer.i, j: buyer.j, amount: price, label: opts.night ? `야간권 · ${tier.name}` : tier.name });
    }
    this.fx.push({ kind: 'band', i: buyer.i, j: buyer.j, label: tier.name, amount: tier.grade }); // P56-a2 D7: 팔찌 발급 띠 — 손님 머리 위를 지나간다(값 0 조끼도)
    if (!opts.night) this.stats.vestRentals = (this.stats.vestRentals ?? 0) + 1;
    return { ok: true, price };
  }
  /** 손님 FSM 훅 묶음 — 매 step 새로 만든다(전부 화살표라 값 0 저장) */
  private get guestHooks(): GuestHooks {
    return {
        onSwimEnter: (g) => {
          this.fx.push({ kind: 'splash', i: g.i, j: g.j });
          { const pid = g.target?.kind === 'pool' ? g.target.id : null; if (pid !== null && !this.poolIndoor(pid)) { const arr = this.stats.swimsBySeason ?? (this.stats.swimsBySeason = [0, 0, 0, 0]); arr[seasonOf(this.day)] = (arr[seasonOf(this.day)] ?? 0) + 1; } } // P52-c 밴드 offSeasonSwim
          if (g.pkg === 'swim' && !g.pkgUsed) { g.pkgUsed = true; const pk = PACKAGES.find((x) => x.id === 'swim'); if (pk) { g.sat = Math.min(100, g.sat + pk.sat); g.hp = Math.min(100, g.hp + pk.hp); } } // P17
        },
        seatValue: (f) => this.seatGradeOf(f.uid).grade,
        teamSeatUid: (g) => this.teamSeatUid(g),
        onSeatless: () => { this.stats.seatless = (this.stats.seatless ?? 0) + 1; },
        onEat: (_g, _f, standing) => { this.stats.eats = (this.stats.eats ?? 0) + 1; this.eatsToday++; if (standing) { this.stats.standEats = (this.stats.standEats ?? 0) + 1; this.standEatsToday++; } }, // P60-e B2: 식사 = 사서 들고 자리를 정한 손님(분모) · 서서 = 산 곳 걷기 9 안에 빈 좌석이 없었다
        closing: () => this.tick >= CLOSING_TICK,
        weather: () => this.weather,
        // P34 D43 — 비 오는 날 실내 피난: 실내 구역 안의 정원 있는 시설 uid 들 (손님이 자기 rng 로 고른다)
        indoorRefuge: () => this.facilities.all.filter((f) => this.grid.at(f.i, f.j) === FLOOR.indoor && this.facilities.defOf(f).capacity > 0 && f.defId !== 'ticket').map((f) => f.uid),
        rainRefuge: () => this.b.rainRefuge ?? 0,
        onRainRefuge: () => { this.stats.rainRefuge = (this.stats.rainRefuge ?? 0) + 1; },
        passBy: () => this.passBySets,
        nightSet: () => this.nightSet,
        evening: () => this.tick >= EVENING_TICK,
        onNightUse: () => { this.stats.nightUses = (this.stats.nightUses ?? 0) + 1; },
        pathComplete: (pid) => this.pathCompleteOf(pid), // P60-d: 코스 완성 수역의 기구 이용 만족 ×1.25
        lateDay: () => this.tick >= LATE_DAY_TICK,
        onPassBy: (_g, _f, kind) => { if (kind === 'enter') this.stats.passByEnter = (this.stats.passByEnter ?? 0) + 1; else this.stats.passByLeave = (this.stats.passByLeave ?? 0) + 1; },
        poolIndoor: (id) => this.poolIndoor(id),
      swimUrge: (id) => this.swimUrgeOf(id), // P52-c 수온 → 야외 입수 확률
        poolTemp: (id) => this.poolState(id)?.temp ?? 26,
        poolTempFit: (id) => this.poolState(id)?.detail.tempFit ?? 1,
        onPhoto: (g, subject) => {
          const areaId = g.friendId ? (this.sns.friendDef(g.friendId)?.area ?? this.sns.areas[0] ?? 'residential') : (this.sns.areas[this.rng.sns.int(this.sns.areas.length)] ?? 'residential');
          let basePop = 0;
          let name = '';
          if (subject.kind === 'pool') { basePop = this.poolState(subject.ref)?.popularity ?? 0; name = `수역 #${subject.ref}`; }
          else { const f = this.facilities.byUid(subject.ref); if (f) { basePop = this.facilities.defOf(f).pop; name = this.facilities.defOf(f).name; } }
          const post = this.sns.post(this.day, this.tick, g.friendId, areaId, { ...subject, name }, basePop, g.palette);
          if (subject.kind === 'pool') { const p = this.pools.byId(subject.ref); if (p) { p.likes += post.likes; this.poolCache.delete(p.id); } }
          this.fx.push({ kind: 'photo', i: g.i, j: g.j, amount: post.likes });
        },
        onLeave: (g) => { this.satSum += g.sat; this.satN++; this.friendLeaves(g); this.releaseTeamSeats(g); },
        hpMul: () => this.staff.mul('hpMul'),
        satMul: () => this.staff.mul('satMul') * this.cleanSatMul(),
        photoMul: () => this.staff.mul('photoMul'),
        onFacilityUse: (g, f) => {
          if (f.defId === FOODCOURT_SEAT_DEF) this.stats.courtEats = (this.stats.courtEats ?? 0) + 1; // P58-a
          { const d = this.facilities.defOf(f); if (d.class === 'rig') { this.stats.rigUses = (this.stats.rigUses ?? 0) + 1; if (g.band !== undefined) this.stats.rigUsesBand = (this.stats.rigUsesBand ?? 0) + 1; if (!this.rigRidersToday.has(g.uid)) { this.rigRidersToday.add(g.uid); this.stats.rigRiderDays = (this.stats.rigRiderDays ?? 0) + 1; } const pair = g.uid * 100000 + f.uid; if (this.rigPairsToday.has(pair)) this.stats.rigRepeats = (this.stats.rigRepeats ?? 0) + 1; else this.rigPairsToday.add(pair); } } // P51 measure: 재탑승 = 같은 손님이 같은 기구를 그날 다시 탄 것(사슬을 건너는 것은 아니다)
          const def = this.facilities.defOf(f);
          f.usesTotal++;
          if (def.id === 'gear_rack' && g.pkg === null) { g.pkg = 'gear'; g.pkgUsed = false; this.stats.gearRentals = (this.stats.gearRentals ?? 0) + 1; }
          if (def.id === 'rental_tube') { const grade = this.parkPpajiGrade(); const opened = WRISTBANDS.filter((t) => t.grade <= grade); this.issueBand(g, bandFor(g.taste?.thrill ?? 1, opened, 0), grade, f, { poolId: this.parkPpajiPool() }); } // P52-a 창구 ⓐ — 하루권 정본(파크 최고 등급 · P60-c: 그 등급의 수역 세트 값)
          if (def.class === 'rig' && def.depth === 'deep' && g.band !== undefined) g.bandLeft = Math.max(0, (g.bandLeft ?? 0) - (def.bandCost ?? 1)); // P52-a 회수 소모(여울·풀·식당·코스는 안 깎는다)
        if (def.class === 'rig' && (def.thrill ?? 0) > 0) { // P52-b 뽑기 자리 ① — 기구 가지 정확히 1회(전용 스트림)
          const cx = this.accidentContext(def, f.i, f.j, f.facing, f.uid);
          const p = accidentChance({ thrill: def.thrill ?? 0, safe: def.safe ?? 2, vest: g.band !== undefined, guarded: cx.guarded, rescued: cx.rescued, briefed: false, cold: cx.cold, busy: cx.busy, cap: cx.cap }, this.b);
          if (this.rng.accident.next() < p) this.applyAccident(g, f, def.name);
        } // P45-c: 거치대에서 기구를 빌리면 선착장(코스)으로 — 공방 기구가 걸린 거치대가 코스 승선의 입구
          { const cs = this.combosOf(f.uid); if (cs.length) g.sat = Math.min(100, g.sat + cs.reduce((n, c) => n + c.def.sat, 0) * 0.5); } // P16 콤보 만족
          if (def.slide) { const ex = FacilityStore.exitTile(def, f.i, f.j, f.facing); if (ex) this.fx.push({ kind: 'land', i: ex.i, j: ex.j }); }
          else if (def.class === 'lounging') this.fx.push({ kind: 'rest', i: f.i, j: f.j });
          if (def.menuSlots > 0) {
            const rec = this.menus.pick(f.uid, this.rng.guest.next());
            if (rec) {
              const comboRev = this.combosOf(f.uid).reduce((n, c) => n + c.def.revenue, 0); // P16
              const free = g.pkg === 'meat' && !g.pkgUsed; // P17 고기 패키지 — 자리에서 미리 냈다
              const sceneryPct = Math.min(10, Math.floor(this.sceneryOf(f.uid) / 4)); // P26: 경관이 판매가를 올린다 (상한 +10%)
              const nightMul = this.nightEve() && def.onRing === true && this.nearestPpajiPool(f) === this.nightPool ? this.nightSalesMul() : 1; // P54 ②: 밤이 열린 수역의 링 위 매점
              const price = free ? 0 : Math.round(recipePrice(rec) * this.cooking.mult * (1 + (comboRev + sceneryPct) / 100) * nightMul);
              if (nightMul > 1) { this.nightFoodToday += price; this.stats.nightFood = (this.stats.nightFood ?? 0) + price; }
              this.money += price;
              this.foodToday += price;
              this.stats.food += price;
              f.incomeToday += price; f.incomeTotal += price; g.spentToday += price;
              this.menuSalesToday[rec.id] = (this.menuSalesToday[rec.id] ?? 0) + 1;
              if (!this.firstSaleSeen) { this.firstSaleSeen = true; this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `첫 판매 — ${rec.name} +${price}G`, body: '메뉴는 「요리」에서 바꾼다 · 식당마다 5칸' }); } // P23
              this.stats.menuSales[rec.id] = (this.stats.menuSales[rec.id] ?? 0) + 1;
              // G33: 요리 레벨은 가격뿐 아니라 맛(HP)·인기(만족)에도 소급된다 (매뉴얼 「높은 레벨 = 더 좋은 스탯」)
              const staffMul = f.staff ? 1.2 : 1; // P8 알바: 친절한 매점
              g.hp = Math.min(100, g.hp + rec.taste * 2 * this.cooking.mult * staffMul);
              g.sat = Math.min(100, g.sat + rec.pop * 0.3 * this.cooking.mult * staffMul);
              g.carry = true; // 들고 나가 앉을 자리를 찾는다 (R3 · P60-e B2: 자리를 정하는 순간 `onEat` 이 식사 수를 센다)
              if (free) { g.pkgUsed = true; const pk = PACKAGES.find((x) => x.id === 'meat'); if (pk) { g.sat = Math.min(100, g.sat + pk.sat); g.hp = Math.min(100, g.hp + pk.hp); } }
              this.fx.push({ kind: 'buy', i: g.i, j: g.j, amount: price, label: `${rec.name} ×1` });
            }
          }
          // P4-C: 선착장 이용 = 견인 코스 탑승. 그 선착장에서 시작하는 코스가 있으면 기구 요금을 받고 스릴만큼 만족이 오른다
          if (def.id === 'dock') {
            const c = this.courses.all.find((x) => Math.round(x.dock.x) === f.i && Math.round(x.dock.y) === f.j);
            const eq = c ? courseEquipment(c.equipId) : undefined;
            if (c && eq) {
              const res = this.evaluateCourse(c.handle);
              const free = g.pkg === 'gear' && !g.pkgUsed; if (free) g.pkgUsed = true; // P17 기구 패키지
              const fee = free ? 0 : eq.fee;
              this.money += fee;
              this.feesToday += fee;
              this.stats.fees += fee;
              this.stats.courseRevenue = (this.stats.courseRevenue ?? 0) + fee;
              this.stats.courseRiders = (this.stats.courseRiders ?? 0) + 1;
              { const cx = this.accidentContext(def, f.i, f.j, f.facing, f.uid); const p = accidentChance({ thrill: Math.max(1, Math.round((res?.thrill ?? 20) / 25)), safe: 2, vest: g.band !== undefined, guarded: cx.guarded, rescued: cx.rescued, briefed: c.safetyBriefing === true, cold: cx.cold, busy: cx.busy, cap: cx.cap }, this.b); if (this.rng.accident.next() < p) this.applyAccident(g, f, `코스 ${eq.name}`); } // P52-b 뽑기 자리 ② — 선착장 가지 정확히 1회
              f.incomeToday += fee; f.incomeTotal += fee; g.spentToday += fee;
              g.sat = Math.min(100, g.sat + Math.round((res?.thrill ?? 20) * 0.15 * (f.staff ? 1.2 : 1)));
              g.hp = Math.max(0, g.hp - (f.staff ? 4 : 6)); // P8 알바 = 안전요원: 덜 지친다
              this.fx.push({ kind: 'coin', i: g.i, j: g.j, amount: fee });
            }
          }
          if (def.usageFee > 0 && f.rentedBy === null && !(def.class === 'lounging' && g.teamId !== null && this.teamSeatUid(g) !== null && this.teamSeatUid(g) !== f.uid)) { // P28-b D35: 팀은 유료 자리를 한 줄만 빌린다
            f.rentedBy = rentKey(g); // P17: 팀이면 팀 열쇠 — 같은 버스 손님이 같은 자리를 쓴다
            const fee = this.nightEve() && def.class === 'lounging' && this.nearestPpajiPool(f) === this.nightPool ? Math.round(def.usageFee * this.nightSalesMul() / 10) * 10 : def.usageFee; // P54 ③: 밤이 열린 빠지 반경의 자리
            if (fee !== def.usageFee) { this.nightFeeToday += fee; this.stats.nightFee = (this.stats.nightFee ?? 0) + fee; }
            this.money += fee;
            this.feesToday += fee;
            this.stats.fees += fee;
            f.incomeToday += fee; f.incomeTotal += fee; g.spentToday += fee;
            this.fx.push({ kind: 'coin', i: g.i, j: g.j, amount: fee });
          }
          if (def.class === 'lounging' && def.derived !== true && g.teamId !== null && g.seatUid === null && (def.usageFee === 0 || f.rentedBy === rentKey(g))) this.claimSeat(g, f); // P17 · P58-a D4: 푸드코트 식탁(파생)은 팀 자리가 아니다 — 잡으면 「자리 잡은 팀」이 1 을 넘고 팀이 평상을 안 찾는다
          if (def.lodging === true && !g.stays && !g.slept && g.teamId !== null && (this.seatGradeOf(f.uid).grade >= 2 || isIndoorCode(this.grid.at(f.i, f.j))) && (def.usageFee === 0 || f.rentedBy === rentKey(g))) this.checkIn(g, f); // P24 D29: 1박은 등급 ≥ 2 — // P18 1박 — 팀(버스 손님)만 잔다: 혼자 온 손님까지 재우면 하루 11명이 자리를 차지해 낮 손님 회전이 죽는다 (실측 소원 만료 3.18)
        },
    };
  }
  /** 검사 전용 — 이용 완료 훅을 직접 부른다(팔찌 회수·창구 ⓐ 검사). 손님 FSM 은 안 건드린다 */
  simulateUseForTest(g: Guest, f: PlacedFacility): void { this.guestHooks.onFacilityUse?.(g, f); }
  canCraftRig(ids: readonly string[]): Result { return this.rigs.canCook(ids, this.rank, this.money); }
  /** 「기구 개조」 창 — 부품을 섞어 개조 레시피를 찾는다(요리·공방과 같은 문법, 실패작 없음 · `rng.rig` 불변) */
  craftRig(ids: readonly string[]): CookResultOf<RigUpgradeDef> {
    const c = this.canCraftRig(ids);
    if (!c.ok) return c;
    const r = this.rigs.cook(ids);
    if (!r.ok) return r;
    this.spend(this.rigs.words.cost, 'convert');
    this.rigs.consume(ids); // P56-c: 맞는 개조가 있을 때만 돈·부품이 든다(미발견은 둘 다 0)
    this.fx.push({ kind: 'discover', i: this.gate.i, j: this.gate.j, amount: r.first ? 1 : 0 });
    if (r.first) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `개조 발견 — ${r.recipe.name}`, body: `${FACILITY_DEFS.get(r.recipe.from)?.name ?? r.recipe.from} → ${r.recipe.name} · 시설 창의 「개조」로 같은 자리에서 바꾼다` });
    return r;
  }
  /** P56-c: 장날 부품은 +1 씩 몇 번이고 · 연차 부품은 한 번 받은 뒤(열쇠) 같은 값으로 다시 산다 */
  buyRigPart(id: string): Result {
    const p = this.rigs.ingredients.get(id);
    if (!p || p.unlock === 'start') return { ok: false, reason: '장날에 없는 부품입니다' };
    if (p.unlock !== 'shop' && !this.rigs.owned.has(id)) return { ok: false, reason: '장날에 없는 부품입니다 — 연차·인증 보상으로 열린다' };
    if ((p.rank ?? 0) > this.rank) return { ok: false, reason: `★${p.rank} 부터 진열됩니다` };
    if (this.money < p.price) return { ok: false, reason: `${p.price.toLocaleString('ko-KR')}G 가 부족합니다` };
    this.spend(p.price, 'convert');
    this.rigs.grantIngredient(id, BUY_STOCK);
    this.stats.rigPartsBought = (this.stats.rigPartsBought ?? 0) + 1; // 인증·소원 보상 부품과 구분한다
    this.stats.stockBuys = (this.stats.stockBuys ?? 0) + 1;
    return { ok: true };
  }

  // ── 견인 코스 (P4-A) ──────────────────────────────────────────────

  /**
   * 코스가 보는 지형 — **D12**: 부표로 친 수역 칸(`FLOOR.pool`)만 물이다. 부표 밖 강·여울은
   * 코스가 지날 수 없다 (부표가 곧 허가 면적 — 코스와 수역 상태가 같은 회계를 쓴다).
   */
  private get courseTerrain(): CourseTerrain {
    // P15: 코스는 **부표(수영 구역)·데크 밖의 트인 강**만 — 수영 손님과 보트가 안 섞인다. 허가 줄(D23) 안, 토지 열 안
    return { width: this.grid.w, height: this.grid.h, isWater: (i, j) => { const f = this.grid.at(i, j); return (f === FLOOR.river || f === FLOOR.shallow) && this.inMyWater(i, j); } };
  }

  /** 프리셋 등급 = 랭크 + 1 (★0 이 1등급 — 왕복·원형이 처음부터 열린다) */
  private get courseGrade(): number {
    return this.rank + 1;
  }

  /** 코스가 못 지나는 칸 — 선착장을 뺀 시설 발자국. 데크는 발판이라 뺀다 (보트가 데크 위를 지나는 그림은 P4-B 소관) */
  private courseBlockedTiles(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const f of this.facilities.all) {
      if (f.defId === 'dock') continue;
      for (const t of FacilityStore.footprint(this.facilities.defOf(f), f.i, f.j, f.facing)) out.add(`${t.i},${t.j}`);
    }
    return out;
  }

  /**
   * 선착장 후보 — 앵커 모드: `dock` 시설의 발자국이 앵커, `FLOOR.deck` 칸이 데크, 게이트가 뭍이다.
   * 선착장 무리 하나가 후보 하나이고 게이트에서 가까운 순이다.
   */
  dockChoices(): DockChoice[] {
    const anchors: { x: number; y: number }[] = [];
    for (const f of this.facilities.all) {
      if (f.defId !== 'dock') continue;
      for (const t of FacilityStore.footprint(this.facilities.defOf(f), f.i, f.j, f.facing)) anchors.push({ x: t.i, y: t.j });
    }
    const decks: { x: number; y: number }[] = [];
    for (let j = 0; j < this.grid.h; j++) for (let i = 0; i < this.grid.w; i++) if (this.grid.at(i, j) === FLOOR.deck) decks.push({ x: i, y: j });
    return dockCandidates(decks, { x: this.gate.i, y: this.gate.j }, anchors);
  }

  /** 지금 열린 프리셋 (등급) 중 이 기구가 탈 수 있는 것 — 데이터 순서 */
  private openPresetsFor(equipId: string): string[] {
    return PRESETS.filter((p) => p.grade <= this.courseGrade && !fitBlocked(equipId, p.id)).map((p) => p.id);
  }

  /**
   * 기본 제안 — 선착장(`dockTip` 을 주면 그 선착장에 고정, 없으면 빈 선착장부터)에서 수역에 맞춘 초안.
   * 기구는 가진 것 중 가장 싼 것, 프리셋은 그 기구로 탈 수 있는 열린 형태 중 첫 것(왕복)이 기본이다.
   * 초안은 **제안**이다 — `canPlaceCourse` 가 판정하고 이유를 말한다.
   */
  suggestCourse(dockTip?: { i: number; j: number }, opts: { presetId?: string; equipId?: string; vehicles?: number } = {}): { ok: true; draft: CourseEditDraft; dockIndex: number } | { ok: false; reason: string } {
    const docks = this.dockChoices();
    if (docks.length === 0) return { ok: false, reason: '선착장이 없습니다 — 데크 위에 선착장을 지으세요' };
    const equipId = opts.equipId ?? [...this.courses.ownedEquipment].map((id) => courseEquipment(id)).filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => a.vehicleCost - b.vehicleCost || a.id.localeCompare(b.id))[0]?.id;
    if (!equipId || !courseEquipment(equipId)) return { ok: false, reason: '기구가 없습니다 — 상점에서 사세요' };
    const presetId = opts.presetId ?? this.openPresetsFor(equipId)[0];
    const preset = presetId ? presetDef(presetId) : undefined;
    if (!preset) return { ok: false, reason: '이 기구로 탈 수 있는 열린 형태가 없습니다' };
    let dockIndex: number | undefined;
    if (dockTip) {
      dockIndex = docks.findIndex((d) => (d.claim ?? [d.tip]).some((c) => c.x === dockTip.i && c.y === dockTip.j));
      if (dockIndex < 0) return { ok: false, reason: '그 칸은 선착장이 아닙니다' };
    }
    const s = suggestCourseShape(preset, docks, this.courses.all, { terrain: this.courseTerrain, ...(dockIndex !== undefined ? { dockIndex, pinned: true } : {}) });
    if (s.dockIndex < 0) return { ok: false, reason: '선착장이 없습니다' };
    const choice = docks[s.dockIndex] as DockChoice;
    return { ok: true, dockIndex: s.dockIndex, draft: { presetId: preset.id, equipId, vehicles: Math.max(1, opts.vehicles ?? 1), dock: { ...choice.tip }, handles: s.handles } };
  }

  /** 초안 판정 원본 (P4-C 독이 핸들별 빨간불·물 칸 수를 쓴다). 형태/기구가 틀리면 null */
  courseValidation(draft: CourseEditDraft, excludeHandle?: number): ReturnType<typeof validateCourse> | null {
    const preset = presetDef(draft.presetId);
    if (!preset || !courseEquipment(draft.equipId)) return null;
    const claim = this.dockChoices().find((d) => (d.claim ?? [d.tip]).some((c) => Math.abs(c.x - draft.dock.x) <= 1 && Math.abs(c.y - draft.dock.y) <= 1))?.claim;
    return validateCourse(this.courseTerrain, draft.handles, draft.dock, preset, draft.equipId, this.courseGrade, this.courses.all, excludeHandle, this.courses.ownedEquipment, this.courseBlockedTiles(), claim);
  }

  /** 초안 지표 (P4-C 독) — 놓기 전에도 길이·스릴·요금·하루 예상을 보여 준다 */
  evaluateDraft(draft: CourseEditDraft): CourseResult | null {
    const equip = courseEquipment(draft.equipId);
    if (!equip) return null;
    return evaluateCourse(draft.dock, draft.handles, equip, draft.presetId, draft.vehicles, draft.towBoatId);
  }

  /** 코스 판정 + 돈 — 이유는 `COURSE_ISSUE_TEXT` (방법까지 말한다) */
  canPlaceCourse(draft: CourseEditDraft, excludeHandle?: number): Result & { issues?: string[] } {
    const preset = presetDef(draft.presetId);
    if (!preset) return { ok: false, reason: '알 수 없는 형태' };
    const equip = courseEquipment(draft.equipId);
    if (!equip) return { ok: false, reason: '알 수 없는 기구' };
    if (!Number.isInteger(draft.vehicles) || draft.vehicles < 1) return { ok: false, reason: '기구는 1대 이상이어야 합니다' };
    if (draft.handles.length !== preset.handles) return { ok: false, reason: `${preset.name} 은 핸들 ${preset.handles}개입니다` };
    const claim = this.dockChoices().find((d) => (d.claim ?? [d.tip]).some((c) => Math.abs(c.x - draft.dock.x) <= 1 && Math.abs(c.y - draft.dock.y) <= 1))?.claim;
    const v = validateCourse(this.courseTerrain, draft.handles, draft.dock, preset, draft.equipId, this.courseGrade, this.courses.all, excludeHandle, this.courses.ownedEquipment, this.courseBlockedTiles(), claim);
    if (!v.ok) return { ok: false, reason: COURSE_ISSUE_TEXT[v.issues[0] ?? 'not-water'], issues: v.issues };
    const cost = equip.vehicleCost * draft.vehicles;
    if (excludeHandle === undefined && cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    return { ok: true };
  }

  /** 코스를 놓는다 — 기구 값 × 대수를 치른다. 코스는 칸을 점유하지 않으므로 손님 길은 안 본다 */
  placeCourse(draft: CourseEditDraft): Result & { handle?: number } {
    const r = this.canPlaceCourse(draft);
    if (!r.ok) return r;
    const equip = courseEquipment(draft.equipId) as NonNullable<ReturnType<typeof courseEquipment>>;
    this.spend(equip.vehicleCost * draft.vehicles);
    const placed = this.courses.add(draft);
    this.fx.push({ kind: 'place', i: Math.round(draft.dock.x), j: Math.round(draft.dock.y) });
    this.poolCache.clear();
    return { ok: true, handle: placed.handle };
  }

  /** 철거 — 기구 값은 돌려주지 않는다 (시설 철거와 같은 규칙: 전부 잃는다) */
  removeCourse(handle: number): Result {
    const c = this.courses.byHandle(handle);
    if (!c) return { ok: false, reason: '코스가 없습니다' };
    this.courses.remove(handle);
    this.fx.push({ kind: 'remove', i: Math.round(c.dock.x), j: Math.round(c.dock.y) });
    this.poolCache.clear();
    return { ok: true };
  }

  courseFor(handle: number): PlacedCourse | undefined {
    return this.courses.byHandle(handle);
  }

  /** 지표 + 적합도 + 하루 잠재 탑승·매출·유지비 */
  evaluateCourse(handle: number): CourseResult | null {
    const c = this.courses.byHandle(handle);
    const equip = c ? courseEquipment(c.equipId) : undefined;
    if (!c || !equip) return null;
    const r = evaluateCourse(c.dock, c.handles, equip, c.presetId, c.vehicles, c.towBoatId);
    // P7 — 공방 Lv 가 스릴에 소급된다 (요리 Lv 가 가격에 소급되는 것과 같은 문법)
    const m = this.workshop.thrillMult;
    return m === 1 ? r : { ...r, thrill: Math.min(100, r.thrill * m) };
  }

  // ── 알바 슬롯 (P8, D14) — 시설마다 한 명, 임금은 유지비 합산, 직원 창 없음 ──
  staffedCount(): number {
    return this.facilities.all.reduce((n, f) => n + (f.staff ?? 0), 0);
  }
  staffedUtilities(): number {
    return this.facilities.all.reduce((n, f) => n + ((f.staff && this.facilities.defOf(f).class === 'utility') ? 1 : 0), 0);
  }
  cleanSatMul(): number {
    return 0.6 + 0.4 * (this.cleanliness / 100);
  }
  canStaff(uid: number): Result {
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '없는 시설입니다' };
    if (!staffable(this.facilities.defOf(f))) return { ok: false, reason: '알바를 둘 수 없는 시설입니다 — 매점·놀이·편의 시설만' };
    return { ok: true };
  }
  /** 알바 고용/해고 — 즉시. 고용은 첫날 임금을 미리 낸다(되돌리기 남용 방지) */
  setStaffed(uid: number, on: boolean): Result {
    const c = this.canStaff(uid);
    if (!c.ok) return c;
    const f = this.facilities.byUid(uid) as PlacedFacility;
    if (on && f.staff) return { ok: false, reason: '이미 알바가 있습니다' };
    if (!on && !f.staff) return { ok: false, reason: '알바가 없습니다' };
    if (on) {
      if (this.money < PART_TIMER_WAGE) return { ok: false, reason: `첫날 임금 ${PART_TIMER_WAGE}G 가 부족합니다` };
      this.spend(PART_TIMER_WAGE);
    }
    f.staff = on ? 1 : 0;
    this.accidentStaticCache.clear(); // P52-c: 망루 알바가 바뀌면 지킴이 바뀐다
    this.facilities.bump();
    return { ok: true };
  }

  // ── 기구 공방 (P7) — 부품을 섞어 기구를 발견하면 그 기구를 갖는다 ──
  canCraft(ids: readonly string[]): Result {
    return this.workshop.canCook(ids, this.rank, this.money);
  }
  craft(ids: readonly string[]): CookResultOf<GearDef> {
    const c = this.canCraft(ids);
    if (!c.ok) return c;
    this.spend(this.workshop.words.cost);
    this.workshop.consume(ids); // P56-c
    const r = this.workshop.cook(ids);
    if (r.ok && r.via !== 'fail' && courseEquipment(r.recipe.id)) {
      const fresh = !this.courses.ownedEquipment.has(r.recipe.id);
      this.courses.grantEquipment(r.recipe.id);
      if (fresh) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `새 기구 ${r.recipe.name}`, body: '공방에서 만들었다 — 코스 독의 기구 칩에 뜬다' });
    }
    this.fx.push({ kind: 'discover', i: this.gate.i, j: this.gate.j, amount: r.ok && r.first ? 1 : 0 });
    return r;
  }
  /** P56-c: 장날 부품은 +1 씩 몇 번이고 · 연차 부품은 한 번 받은 뒤(열쇠) 같은 값으로 다시 산다 · 시작 부품은 무한 */
  buyPart(id: string): Result {
    const p = this.workshop.ingredients.get(id);
    if (!p || p.price === undefined || p.unlock === 'start') return { ok: false, reason: '장날에 없는 부품입니다' };
    if (p.unlock !== 'shop' && !this.workshop.owned.has(id)) return { ok: false, reason: '장날에 없는 부품입니다 — 연차 보상으로 열린다' };
    const price = p.price;
    if (this.money < price) return { ok: false, reason: `${price.toLocaleString('ko-KR')}G 가 부족합니다` };
    this.spend(price);
    this.workshop.grantIngredient(id, BUY_STOCK);
    this.stats.stockBuys = (this.stats.stockBuys ?? 0) + 1;
    return { ok: true };
  }

  /** 기구 구입 — 1대 값. 상점 탭 배선은 뒤의 goal 이고 지금은 이 한 입구뿐이다 */
  buyEquipment(id: string): Result {
    const equip = courseEquipment(id);
    if (!equip) return { ok: false, reason: '알 수 없는 기구' };
    if (this.courses.ownedEquipment.has(id)) return { ok: false, reason: '이미 가진 기구입니다' };
    if (equip.vehicleCost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${equip.vehicleCost.toLocaleString('ko-KR')}G 필요` };
    this.spend(equip.vehicleCost);
    this.courses.grantEquipment(id);
    this.fx.push({ kind: 'buy', i: this.gate.i, j: this.gate.j, label: equip.name });
    return { ok: true };
  }

  /**
   * 수역의 스릴 — 선착장 칸이나 루트가 그 수역을 지나는 코스 중 최고 스릴 (0~100). 코스가 없으면 0.
   * 수역 상태(물살)와 손님 탑승(P4-C)이 읽는다 — 지금은 노출만 한다.
   */
  /**
   * P49-a1 §3.7 — 시설이 속한 수역: 발자국 칸을 가진 수역 → 없으면 4이웃 수역 중 칸 수 최다(동점 id 작은 쪽) → 없으면 null.
   * 링 위 시설(데크)은 둘째 규칙으로 안쪽 수역에 붙는다
   */
  poolOfFacility(uid: number): number | null {
    const f = this.facilities.byUid(uid);
    if (!f) return null;
    const fp = FacilityStore.footprint(this.facilities.defOf(f), f.i, f.j, f.facing);
    for (const t of fp) { const p = this.pools.at(t.i, t.j); if (p) return p.id; }
    const count = new Map<number, number>();
    for (const t of fp) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const p = this.pools.at(t.i + a, t.j + b); if (p) count.set(p.id, (count.get(p.id) ?? 0) + 1); }
    let best: number | null = null, bestN = 0;
    for (const [id, n] of [...count.entries()].sort((x, y) => x[0] - y[0])) if (n > bestN) { best = id; bestN = n; }
    return best;
  }
  /** P49-a1 — 안전 시설(guardRadius) 반경 안인가 (a1: 망루·구조정이 데크 위에 서면 참) */
  private rigGuardedAt(f: PlacedFacility): boolean {
    return this.facilities.all.some((o) => { const od = this.facilities.defOf(o); const r = od.guardRadius ?? 0; return r > 0 && Math.max(Math.abs(o.i - f.i), Math.abs(o.j - f.j)) <= r; });
  }
  /**
   * P50-b2 §3.7 조준 미리보기 — 가짜 인스턴스를 **저장소에 넣지 않고** `computeRigs` 오버레이로 넘겨 등급·사슬·팔찌 값을 그대로 돌린다(미리보기 전용 산식 0줄).
   * `wouldEnclose` 와 같은 제약: nextUid·occ·grid.rev·pools.version 불변.
   */
  aimPreview(defId: string, i: number, j: number, facing: 0 | 1): { poolId: number | null; gradeNow: PpajiGrade; gradeNext: PpajiGrade; chainNext: number; lit: boolean; capNext: number; pkgNow: number; pkgNext: number; risk: RiskLevel; riskLabel: string; /** P60-c — 놓으면 새로 성립하는 세트 id (없으면 null) */ setNext: string | null; /** P60-d — 놓으면 경로에서 몇 번째인가(0 = 경로 밖) · 놓으면 그 수역이 코스 완성인가 */ pathNext: number; completeNext: boolean } | null {
    const def = FACILITY_DEFS.get(defId);
    if (!def || !(def.class === 'rig' || def.onRing === true)) return null;
    const overlayUid = -1;
    const st = computeRigs(this.grid, this.facilities, this.pools, { uid: overlayUid, defId, i, j, facing }); // P60-c: 링 시설도 오버레이로 — 켜짐·사슬엔 안 들고(`consider` 가 거른다) 세트 그래프의 노드로만 든다
    // 소속 수역 — 발자국(물 위) 또는 4이웃(링 위)의 소유 수역 최다
    const cnt = new Map<number, number>();
    for (const t of FacilityStore.footprint(def, i, j, facing)) {
      const id = this.pools.ownerIdAt(t.i, t.j); if (id >= 0) cnt.set(id, (cnt.get(id) ?? 0) + 1);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const o = this.pools.ownerIdAt(t.i + a, t.j + b); if (o >= 0) cnt.set(o, (cnt.get(o) ?? 0) + 0.5); }
    }
    let poolId: number | null = null, bestN = 0;
    for (const [id, n] of cnt) if (n > bestN || (n === bestN && poolId !== null && id < poolId)) { poolId = id; bestN = n; }
    const gradeNow: PpajiGrade = poolId === null ? 0 : this.ppajiGradeOf(poolId);
    let gradeNext: PpajiGrade = gradeNow, chainNext = 0;
    const lit = def.class === 'rig' && def.onRing !== true ? st.lit.has(overlayUid) : true;
    if (poolId !== null) {
      const mine = this.facilities.all.filter((f) => { const d = this.facilities.defOf(f); if (d.class === 'rig' && d.onRing !== true) return st.lit.has(f.uid) && (st.byPool.get(poolId as number) ?? []).includes(f.uid); return d.onRing === true && this.poolOfFacility(f.uid) === poolId; });
      const ids = mine.map((f) => f.defId), lens = mine.map((f) => [st.chainLen.get(f.uid) ?? 0, st.chainKinds.get(f.uid) ?? 0] as const);
      if (lit) { ids.push(defId); lens.push([st.chainLen.get(overlayUid) ?? 1, st.chainKinds.get(overlayUid) ?? 1]); }
      const n = ids.length, kinds = new Set(ids).size, lights = ids.filter((id) => FACILITY_DEFS.get(id)?.lights === true).length;
      let chain = 0, chainKinds = 0; for (const [l, k] of lens) if (l > chain) { chain = l; chainKinds = k; }
      gradeNext = ppajiGrade({ n, kinds, chain, chainKinds, lights });
      chainNext = lit ? (st.chainLen.get(overlayUid) ?? 1) : 0;
    }
    const capNext = def.capacity <= 0 ? 0 : Math.round(def.capacity * Math.min(CHAIN_CAP, Math.max(1, Math.sqrt(Math.max(1, chainNext) / CHAIN_BASE)))); // P60-d: chainNext 는 경로 순번(사슬 개념 흡수) — 같은 식이 「경로가 길수록 정원」이 된다
    const pathNext = poolId === null ? 0 : (st.path.get(poolId) ?? []).indexOf(overlayUid) + 1; // P60-d: 오버레이가 경로에 들면 순번(1부터), 아니면 0
    const completeNext = poolId === null ? false : (st.pathComplete.get(poolId) ?? false);
    const risk = this.riskOf(def, i, j, facing); // P52-b
    const setsNow = poolId === null ? [] : this.setsOf(poolId), setsNext = poolId === null ? [] : (st.sets.get(poolId) ?? []); // P60-c: 오버레이 상태의 세트 — 저장소·setsSeen 무변경
    const setNext = setsNext.find((id) => !setsNow.includes(id)) ?? null;
    return { poolId, gradeNow, gradeNext, chainNext, lit, capNext, pkgNow: this.bandPriceAt(poolId, bandTop(gradeNow), gradeNow, setsNow.length), pkgNext: this.bandPriceAt(poolId, bandTop(gradeNext), gradeNext, setsNext.length), risk: risk.level, riskLabel: risk.label, setNext, pathNext, completeNext };
  }
  private rigLinkCache: { key: string; edges: { i: number; j: number; dir: 0 | 1 }[] } | null = null;
  /** P50-b2 상시 이음쇠 — 켜진 기구끼리·기구와 링 데크가 맞닿은 변 (i,j 칸에서 dir 0 = +I 쪽 이웃, 1 = +J 쪽). 씬은 그리기만. 프레임당 1회 캐시 */
  rigLinkEdges(): { i: number; j: number; dir: 0 | 1 }[] {
    const key = `${this.facilities.version}:${this.grid.rev}`;
    if (this.rigLinkCache && this.rigLinkCache.key === key) return this.rigLinkCache.edges;
    const w = this.grid.w, owner = new Int32Array(w * this.grid.h).fill(-1);
    for (const f of this.facilities.all) if (this.rigState.lit.has(f.uid)) for (const t of FacilityStore.footprint(this.facilities.defOf(f), f.i, f.j, f.facing)) owner[t.j * w + t.i] = f.uid;
    const edges: { i: number; j: number; dir: 0 | 1 }[] = [];
    for (let j = 0; j < this.grid.h; j++) for (let i = 0; i < w; i++) {
      const me = owner[j * w + i] as number; if (me < 0) continue;
      for (const dir of [0, 1] as const) {
        const ni = i + (dir === 0 ? 1 : 0), nj = j + (dir === 1 ? 1 : 0);
        if (!this.grid.inside(ni, nj)) continue;
        const o = owner[nj * w + ni] as number;
        if ((o >= 0 && o !== me) || (o < 0 && this.grid.at(ni, nj) === FLOOR.deck)) edges.push({ i, j, dir });
      }
      // 왼쪽·위쪽 데크와의 접점도 (데크 칸에서 보면 +I/+J 이웃이 기구)
      if (i > 0 && owner[j * w + i - 1] as number < 0 && this.grid.at(i - 1, j) === FLOOR.deck) edges.push({ i: i - 1, j, dir: 0 });
      if (j > 0 && owner[(j - 1) * w + i] as number < 0 && this.grid.at(i, j - 1) === FLOOR.deck) edges.push({ i, j: j - 1, dir: 1 });
    }
    this.rigLinkCache = { key, edges };
    return edges;
  }
  /** P50-b2 목표 A 폴백 사슬 ①② — 켜진 기구 0 → 붙이자 · 사슬 ≤1 ∧ 장애물 계열 ≥2 → 이어 붙이자 (③ 개조는 P51 · ④ 가을 심사는 기존) */
  rigGoalHint(): string | null {
    if (this.pools.all.length === 0) return null;
    if (this.rigState.lit.size === 0) return '사다리 옆에 기구를 붙이자 — 건설 「빠지」 탭, 입수구(사다리) 곁 링에 닿게'; // P60-d D72 A: 첫 기구는 입수구 옆이어야 경로가 생긴다 — 「기구」 낱말은 남긴다(P50-b2 하네스)
    let chainMax = 0, obstacles = 0;
    for (const f of this.facilities.all) { const d = this.facilities.defOf(f); if (d.class !== 'rig' || d.onRing === true || !this.rigState.lit.has(f.uid)) continue; chainMax = Math.max(chainMax, this.rigState.chainLen.get(f.uid) ?? 1); if (d.chain === 'obstacle') obstacles++; }
    if (chainMax <= 1 && obstacles >= 2) return '기구를 이어 붙여 보자 — 입수구에서 멀수록 정원이 는다'; // P60-d: chainLen = 경로 순번
    if ((this.stats.converts ?? 0) === 0 && this.facilities.all.some((f) => this.rigs.upgradesFor(f.defId).length > 0)) return '기구를 개조해 보자 — 시설 창의 「개조」, 같은 자리에서 바뀐다'; // P51 폴백 ③
    return null;
  }
  /** P50-a §3.6 — 물 위 배치 규칙(`FacilityStore.check` 의 필수 인자) */
  get waterRules(): WaterRules {
    return {
      ppajiWater: (i, j) => this.grid.inside(i, j) && this.grid.at(i, j) === FLOOR.pool && this.inMyWater(i, j),
      depthAt: (i, j) => (this.grid.naturalAt(i, j) === FLOOR.shallow ? 'shallow' : 'deep'),
      ring: (i, j) => { if (!this.grid.inside(i, j)) return false; const c = this.grid.at(i, j); if (c === FLOOR.deck) return true; return isLandFloor(c) && ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => this.grid.inside(i + a, j + b) && isWaterCode(this.grid.at(i + a, j + b))); },
    };
  }
  /**
   * P49-a1 §3.7 스텁 — 수역의 빠지 등급. a1 은 `n` = 그 수역에 속한 기구·링 위 시설 수, `kinds` = 종 수, `lights` = 조명 수, 사슬은 0.
   * P50-a 가 켜진 물 위 기구를 더하고 P50-b1 이 사슬을 채운다. 배율은 데이터(`balance.ppajiGradePopMul`)
   */
  // ── P54 밤 빠지 파티 (§3.9) ──────────────────────────────────────────
  /** 밤이 열리는 수역 — rank ≥ 3 ∧ ∃pool: 등급 ≥ 3 ∧ 켜진 조명 ≥ 1 ∧ 켜진 물 위 기구 ≥ 9. 없으면 null */
  nightPartyOn(): number | null {
    if (!this.nightEnabled || this.rank < 3) return null;
    for (const p of this.pools.all) {
      if (this.ppajiGradeOf(p.id) < 3) continue;
      const rigs = this.nightRigsOf(p.id);
      if (rigs.length < 9 || !rigs.some((f) => this.facilities.defOf(f).lights === true)) continue;
      return p.id;
    }
    return null;
  }
  /** 그 수역의 켜진 물 위 기구 */
  private nightRigsOf(poolId: number): PlacedFacility[] {
    const mine = this.rigState.byPool.get(poolId) ?? [];
    return this.facilities.all.filter((f) => { const d = this.facilities.defOf(f); return d.class === 'rig' && d.onRing !== true && this.rigState.lit.has(f.uid) && mine.includes(f.uid); });
  }
  /** 밤 매출 배수 = 1 + step × min(cap, 켜진 조명) — 손잡이는 LED 부표 (balance `nightLightStep`·`nightSalesMax`) */
  nightSalesMul(): number {
    if (!this.nightOn || this.nightPool === null) return 1;
    const lights = this.nightRigsOf(this.nightPool).filter((f) => this.facilities.defOf(f).lights === true).length;
    return 1 + Math.min(this.b.nightSalesMax ?? 0.4, (this.b.nightLightStep ?? 0.1) * lights);
  }
  /** 저녁이고 밤이 열렸나 — 곱하는 자리 셋(야간권·링 위 매점·빠지 자리 이용료)의 게이트 */
  nightEve(): boolean { return this.nightOn && this.tick >= EVENING_TICK; }
  nightRigCountForTest(): number { const p = this.pools.all[0]; return p ? this.nightRigsOf(p.id).length : 0; }
  bandTopForTest(): WristbandDef { return bandTop(this.rank); }
  /** 밤 시설 집합 — 실내 놀이(P45-c) + 밤이 열린 수역의 켜진 기구·링 위 매점. 호출부 둘: 세계 변경 꼬리 · 저녁 래치 */
  private syncNightSet(): void {
    const set = new Set(this.facilities.all.filter((f) => { const d = this.facilities.defOf(f); return (d.indoorOnly && d.class === 'attraction' && d.capacity > 0) || f.defId === FOODCOURT_SEAT_DEF; }).map((f) => f.uid)); // P60-e B5: 밤 식탁(D7) — 파생 식탁도 밤 집합에(팀 자리는 아니다 · claimSeat 는 derived 제외)
    if (this.nightOn && this.nightPool !== null) {
      for (const f of this.nightRigsOf(this.nightPool)) set.add(f.uid);
      const ring = this.pools.byId(this.nightPool);
      if (ring) for (const f of this.facilities.all) { const d = this.facilities.defOf(f); if (d.onRing === true && d.menuSlots > 0 && this.nearestPpajiPool(f) === this.nightPool) set.add(f.uid); }
    }
    this.nightSet = set;
  }
  /** 야간권 — 이미 자리 잡은 팀마다 `rng.night` 로 한 번(nightChance) · 값 = 팔찌 × 밤 배수 · 낮 1회 규칙과 별개(키 `:n`) */
  private issueNightBands(): number {
    if (this.nightPool === null) return 0;
    const grade = this.ppajiGradeOf(this.nightPool);
    const teams = new Map<number, Guest>();
    for (const g of this.guests.all) if (g.teamId !== null && g.seatUid !== null && !teams.has(g.teamId)) teams.set(g.teamId, g);
    let n = 0;
    for (const leader of teams.values()) {
      const roll = this.rng.night.next();
      if (roll >= (this.b.nightChance ?? 0.5)) continue;
      const r = this.issueBand(leader, bandTop(grade), grade, undefined, { night: true, poolId: this.nightPool });
      if (r.ok) n++;
    }
    return n;
  }
  private noteNightOpen(bands: number): void {
    this.stats.nightNights = (this.stats.nightNights ?? 0) + 1;
    const body = `조명 아래 빠지가 밤에도 열렸다 — 야간권 ${bands}장 · 매출 ×${this.nightSalesMul().toFixed(1)}`;
    if (!this.nightOpened) { this.nightOpened = true; this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: '밤 빠지 파티 개장!', body }); }
    else this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'strip', title: '밤 빠지 파티', body });
    this.fx.push({ kind: 'like', i: this.gate.i, j: this.gate.j });
  }

  private readonly gradeCache = new Map<number, PpajiGrade>(); // P52-c 성능: 손님 목적지 가중치가 수역마다 부른다 — 세계 변경마다 비운다
  ppajiGradeOf(poolId: number): PpajiGrade {
    const hit = this.gradeCache.get(poolId); if (hit !== undefined) return hit;
    const v = this.ppajiGradeCompute(poolId); this.gradeCache.set(poolId, v); return v;
  }
  private ppajiGradeCompute(poolId: number): PpajiGrade {
    const mine = this.facilities.all.filter((f) => { const d = this.facilities.defOf(f); if (d.class === 'rig' && d.onRing !== true) return this.rigState.lit.has(f.uid) && (this.rigState.byPool.get(poolId) ?? []).includes(f.uid); /* P50-a: 물 위 기구는 켜진 것만 */ return d.onRing === true && this.poolOfFacility(f.uid) === poolId; });
    const kinds = new Set(mine.map((f) => f.defId)).size;
    const lights = mine.filter((f) => this.facilities.defOf(f).lights === true).length;
    let chain = 0, chainKinds = 0; // P50-b1: 최장 사슬과 그 사슬의 종 수
    for (const f of mine) { const len = this.rigState.chainLen.get(f.uid) ?? 0; if (len > chain) { chain = len; chainKinds = this.rigState.chainKinds.get(f.uid) ?? 0; } }
    return ppajiGrade({ n: mine.length, kinds, chain, chainKinds, lights });
  }

  courseThrill(poolId: number): number {
    const p = this.pools.byId(poolId);
    if (!p) return 0;
    const tiles = new Set(p.tiles);
    // P15: 코스는 수역 밖(트인 강)을 돈다 — 수역에서 2칸 안을 지나는 코스가 그 수역의 스릴이다(데크 링 너머로 보이는 보트)
    const inZone = (x: number, y: number): boolean => {
      const i = Math.round(x);
      const j = Math.round(y);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (this.grid.inside(a, b) && tiles.has(b * this.grid.w + a)) return true; }
      return false;
    };
    let best = 0;
    for (const c of this.courses.all) {
      const hit = inZone(c.dock.x, c.dock.y) || sampleCourse(c.dock, c.handles).some((s) => inZone(s.pos.x, s.pos.y));
      if (!hit) continue;
      const r = this.evaluateCourse(c.handle);
      if (r && r.thrill > best) best = r.thrill;
    }
    return best;
  }

  // ── 내부 ──────────────────────────────────────────────────────────

  /** P45-b D63 — 복도 곁 점포: 입구 칸이 복도(hall)·정문 칸에 4방 인접한 `passBy` 시설 uid (세계가 바뀔 때 한 번) */
  private passBySets: { enter: Set<number>; leave: Set<number> } = { enter: new Set(), leave: new Set() };
  /** P45-c — 밤 시설: 실내 전용 놀이(찜질·사우나·무대·노래방·오락기) 중 정원 있는 것 */
  private nightSet = new Set<number>();
  nightForTest(): number[] { return [...this.nightSet]; }
  passByForTest(): { enter: number[]; leave: number[] } { return { enter: [...this.passBySets.enter], leave: [...this.passBySets.leave] }; }
  private recomputePassBy(): void {
    const enter = new Set<number>(), leave = new Set<number>();
    const w = this.grid.w;
    const hall = new Set<number>();
    for (let j = 0; j < this.grid.h; j++) for (let i = 0; i < w; i++) if (this.grid.at(i, j) === FLOOR.hall) hall.add(j * w + i);
    hall.add(this.gate.j * w + this.gate.i);
    const nearHall = (i: number, j: number): boolean => { if (hall.has(j * w + i)) return true; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (hall.has((j + dj) * w + i + di)) return true; return false; };
    for (const f of this.facilities.all) {
      const def = this.facilities.defOf(f);
      if (!def.passBy || def.capacity <= 0) continue;
      const entries = FacilityStore.ring(def, f.i, f.j, f.facing).filter((t) => this.grid.inside(t.i, t.j) && isIndoorCode(this.grid.at(t.i, t.j)) && this.guests.walkable(t.i, t.j)); // P50-a R8: 진입 칸이 실내 코드일 때만 복도 점포(링 위 점포의 D63 누수 차단)
      if (!entries.some((t) => nearHall(t.i, t.j))) continue;
      if (def.passBy !== 'leave') enter.add(f.uid);
      if (def.passBy !== 'enter') leave.add(f.uid);
    }
    this.passBySets = { enter, leave };
    this.syncNightSet(); // P54: 밤 집합은 한 함수가 만든다(실내 놀이 + 밤이 열린 수역의 기구·링 위 매점)
  }
  /** P50-a §3.7 — 기구 발자국을 `blocked` 로, 켜짐을 `computeRigs` 로, 발자국 마스크를 `walkOn` 으로. 「켜져 있다가 꺼진 칸」을 돌려준다(로드 때는 버린다) */
  private refreshRigs(): { i: number; j: number }[] {
    const w = this.grid.w;
    const ks: number[] = [];
    for (const f of this.facilities.all) { const d = this.facilities.defOf(f); if (d.class === 'rig' && d.onRing !== true) for (const t of FacilityStore.footprint(d, f.i, f.j, f.facing)) ks.push(t.j * w + t.i); }
    this.pools.setBlocked(ks);
    this.rigState = computeRigs(this.grid, this.facilities, this.pools);
    this.gradeCache.clear(); this.accidentStaticCache.clear();
    for (const f of this.facilities.all) { const len = this.rigState.chainLen.get(f.uid); if (len !== undefined) f.chainLen = len; else delete f.chainLen; } // P50-b1: 파생 — 정원(`capacityOf`)만 읽는다
    return this.facilities.setWalkOn(this.rigState.walkOn);
  }
  private afterWorldChange(): void {
    this.gradeCache.clear(); this.accidentStaticCache.clear(); // P52-c 캐시
    const gradesBefore = new Map(this.pools.all.map((p) => [p.id, this.ppajiGradeOf(p.id)])); // P50-b2: 등급이 오르면 같은 tick 에 모달 하나(축하 채널) — 설치 직후 등급 불변이면 0
    this.recomputePassBy();
    this.grid.setForcedDoors(this.facilities.all.filter((f) => f.defId === 'entrance').map((f) => f.j * this.grid.w + f.i)); // P42 D53
    this.pools.recompute();
    const dark = this.refreshRigs(); // P50-a: pools.setBlocked → recompute → computeRigs → walkOn
    if (dark.length) this.guests.evictFrom(dark); // 꺼진 기구 위에 서 있던 손님은 뭍으로(수영 중은 안 건드린다)
    for (const p of this.pools.all) {
      const before = gradesBefore.get(p.id) ?? 0, now = this.ppajiGradeOf(p.id);
      if (now > before) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: `${p.name ?? `수역 #${p.id}`} — ${PPAJI_GRADE_NAMES[now] ?? ''}!`, body: `빠지 등급 ${before} → ${now} · 수역 인기 ×${this.b.ppajiGradePopMul[now] ?? 1}${bandTop(now).base > 0 ? ` · 자유이용권 ${bandTop(now).name} ${this.bandPriceAt(p.id, bandTop(now), now).toLocaleString('ko-KR')}G` : ''}` });
    }
    this.noteSets(); // P60-c: 첫 성립 = 축하 1회(+ 편지), 나머지는 편지
    this.noteFullCourt(); // P60-e B4: 구색 4/4 영역이 처음이면 축하 1회
    this.rigLinkCache = null;
    this.guests.invalidate();
    this.poolCache.clear();
    this.notePackages(); // P25: 배치가 바뀌면 자리 패키지를 다시 재고 발견·소실을 알린다
  }

  /** P60-c §10.3 발견 채널 — 새로 성립한 세트(`setsSeen` 에 없음)마다 기록. 같은 tick 의 첫 하나만 축하 모달(`pic` = 첫 멤버 시설 그림), 나머지는 인박스 편지. 등급 판정엔 안 넣는다 */
  private noteSets(): void {
    let modal = false;
    for (const p of this.pools.all) for (const id of this.setsOf(p.id)) {
      if (this.setsSeen.has(id)) continue;
      this.setsSeen.add(id);
      const def = RIG_SETS.find((d) => d.id === id); if (!def) continue;
      const names = def.members.map((m) => FACILITY_DEFS.get(m)?.name ?? m).join(' · ');
      const body = `${p.name ?? `수역 #${p.id}`}에서 ${names}이 이어졌다 — 이 빠지 팔찌 값 +${SET_BAND_BONUS}G · 인기 +${SET_POP_BONUS}`;
      const pic = { kind: 'facility', id: def.members[0] };
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: modal ? 'inbox' : 'modal', title: `세트 발견 · ${def.name}`, body, pic });
      modal = true;
      const at = this.facilities.all.find((f) => def.members.includes(f.defId) && this.poolOfFacility(f.uid) === p.id);
      if (at) this.fx.push({ kind: 'discover', i: at.i, j: at.j, amount: 1, label: def.name });
    }
  }
  /**
   * 변경을 적용해 보고 되돌린다 — 입구에서 **닿지 않게 되는** 풀·시설이 생기거나, 걸을 수 있는 땅이
   * 발자국보다 더 많이 끊기면(= 어딘가를 봉쇄) true. "지금 안 닿는다" 가 아니라 **전후 비교**다:
   * 이미 끊긴 판에서도 되돌릴 방법이 남아야 한다.
   */
  private breaksAccess(apply: () => void, revert: () => void, allowedLoss: number, ignoreUid = 0): boolean {
    const uids = new Set(this.facilities.all.filter((f) => f.uid !== ignoreUid).map((f) => f.uid));
    const before = this.reachability(this.pools, uids);
    apply();
    const probe = new PoolStore(this.grid);
    probe.recompute();
    const after = this.reachability(probe, uids);
    revert();
    return after.unreachable > before.unreachable || before.reachableTiles - after.reachableTiles > allowedLoss;
  }

  private reachability(pools: PoolStore = this.pools, onlyUids?: ReadonlySet<number>): { unreachable: number; reachableTiles: number } {
    const walk = (i: number, j: number): boolean => guestWalkable(this.grid, this.facilities, i, j); // P16: 잔디는 못 걷는다 · P50-a: 술어 하나
    // 입구에서 flood fill
    const reach = new Uint8Array(this.grid.w * this.grid.h);
    const q: number[] = [];
    const g = this.gate;
    if (walk(g.i, g.j) || this.grid.at(g.i, g.j) === FLOOR.path) {
      reach[g.j * this.grid.w + g.i] = 1;
      q.push(g.j * this.grid.w + g.i);
    }
    let head = 0;
    while (head < q.length) {
      const k = q[head++] as number;
      const i = k % this.grid.w;
      const j = Math.floor(k / this.grid.w);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (!this.grid.inside(ni, nj) || !walk(ni, nj) || !this.grid.canCross(i, j, ni, nj)) continue; // P45-a: 벽·문을 본다 — 마당 문 밖 통로를 걷어내면 마당 전체가 끊긴다
        const nk = nj * this.grid.w + ni;
        if (reach[nk]) continue;
        reach[nk] = 1;
        q.push(nk);
      }
    }
    const touches = (tiles: readonly { i: number; j: number }[]): boolean =>
      tiles.some((t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
        const ni = t.i + (di as number);
        const nj = t.j + (dj as number);
        return this.grid.inside(ni, nj) && reach[nj * this.grid.w + ni] === 1;
      }));
    let n = 0;
    for (const p of pools.all) {
      if (!touches(p.tiles.map((k) => ({ i: k % this.grid.w, j: Math.floor(k / this.grid.w) })))) n++;
    }
    for (const f of this.facilities.all) {
      if (onlyUids && !onlyUids.has(f.uid)) continue; // P16: 지금 놓는 시설은 안 센다 — 길이 없으면 손님이 안 올 뿐, 놓는 것은 막지 않는다
      if (!touches(FacilityStore.footprint(this.facilities.defOf(f), f.i, f.j, f.facing))) n++;
    }
    return { unreachable: n, reachableTiles: q.length };
  }

  // ── 스냅샷 ────────────────────────────────────────────────────────

  toSnapshot(): GameSnapshot {
    return {
      version: 1,
      ...(this.arrivalRevision ? { arrivalRevision: this.arrivalRevision } : {}),
      seed: this.seed,
      rng: Object.fromEntries(Object.entries(this.rng).map(([k, r]) => [k, r.state])) as Record<RngStream, number>,
      clock: { day: this.day, tick: this.tick },
      money: this.money,
      rank: this.rank,
      grid: { w: this.grid.w, h: this.grid.h, floor: Array.from(this.grid.floor), levels: Array.from(this.grid.levels), natural: Array.from(this.grid.natural) },
      pools: this.pools.toSnapshot(),
      foodcourts: this.foodcourts.toSnapshot(),
      facilities: this.facilities.toSnapshot(),
      guests: this.guests.toSnapshot(),
      inbox: this.inbox.toSnapshot(),
      sns: this.sns.toSnapshot(),
      certs: this.certs.toSnapshot(),
      shop: this.shop.toSnapshot(),
      calendarGiven: [...this.calendarGiven].sort(),
      firstCertPassDay: this.firstCertPassDay,
      tools: [...this.tools].sort(),
      menus: this.menus.toSnapshot(),
      cooking: this.cooking.toSnapshot(),
      workshop: this.workshop.toSnapshot(),
      rigs: this.rigs.toSnapshot(),
      bandPaid: [...this.bandPaid], accidentCut: [...this.accidentCut], accidentsToday: this.accidentsToday, // P52
      ...(this.waterClosedUntil >= 0 ? { waterClosedUntil: this.waterClosedUntil } : {}), // P52-c
      ...(this.nightOpened ? { nightOpened: true } : {}), // P54
      cleanliness: this.cleanliness,
      combosSeen: [...this.combosSeen].sort(),
      packagesSeen: [...this.packagesSeen].sort(),
      ...(this.setsSeen.size ? { setsSeen: [...this.setsSeen].sort() } : {}), // P60-c (optional — 빈 집합이면 옛 스냅샷과 바이트 같다)
      invest: [...this.investDone].sort(),
      investPending: this.investPending.map((p) => ({ ...p })),
      campaigns: this.campaigns.toSnapshot(),
      busQueue: this.busQueue.map((p) => ({ ...p })),
      busesToday: this.busesToday.map((p) => ({ ...p })),
      busState: this.busState ? { ...this.busState } : null,
      teamSeq: this.teamSeq,
      firstSaleSeen: this.firstSaleSeen,
      ...(this.fullCourtSeen ? { fullCourtSeen: true } : {}), // P60-e: 참일 때만 (해시 불변)
      walkin: { team: this.walkinTeam, left: this.walkinLeft },
      weather: this.weather,
      ticketBonus: this.ticketBonus,
      endingSeen: this.endingSeen,
      story: this.story.toSnapshot(),
      staff: this.staff.toSnapshot(),
      randomEvents: this.events.toSnapshot(),
      // G57: 하루 중간 왕복에서 그날 결산이 줄어들던 결손 — 오늘 누적 셋 + 손님 입퇴장 수도 같이
      dayAccum: { satSum: this.satSum, satN: this.satN, menuSalesToday: { ...this.menuSalesToday }, likesAtDayStart: this.likesAtDayStart, ticketsToday: this.ticketsToday, feesToday: this.feesToday, foodToday: this.foodToday, enteredToday: this.guests.enteredToday, leftToday: this.guests.leftToday },
      prevSatAvg: this.prevSatAvg,
      stats: { visitors: this.stats.visitors, tickets: this.stats.tickets, fees: this.stats.fees, food: this.stats.food, spent: this.stats.spent, spentDeck: this.stats.spentDeck, spentRig: this.stats.spentRig, spentConvert: this.stats.spentConvert, converts: this.stats.converts, nightNights: this.stats.nightNights ?? 0, nightPkg: this.stats.nightPkg ?? 0, nightFood: this.stats.nightFood ?? 0, nightFee: this.stats.nightFee ?? 0, rigUses: this.stats.rigUses, rigRiderDays: this.stats.rigRiderDays, rigRepeats: this.stats.rigRepeats, rigPartsBought: this.stats.rigPartsBought, courtEats: this.stats.courtEats ?? 0, eats: this.stats.eats ?? 0, standEats: this.stats.standEats ?? 0, rigUsesBand: this.stats.rigUsesBand, pkgPpaji: this.stats.pkgPpaji, vestRentals: this.stats.vestRentals, accidents: this.stats.accidents, swimsBySeason: this.stats.swimsBySeason, bailouts: this.stats.bailouts, busGuests: this.stats.busGuests, wishDone: this.stats.wishDone, wishExpired: this.stats.wishExpired, courseRevenue: this.stats.courseRevenue, courseRiders: this.stats.courseRiders, pkg: this.stats.pkg, teamGuests: this.stats.teamGuests, teamSeated: this.stats.teamSeated, seatless: this.stats.seatless, lodging: this.stats.lodging, overnight: this.stats.overnight, teamsSeated: this.stats.teamsSeated, rainRefuge: this.stats.rainRefuge, passByEnter: this.stats.passByEnter ?? 0, passByLeave: this.stats.passByLeave ?? 0, nightUses: this.stats.nightUses ?? 0, gearRentals: this.stats.gearRentals ?? 0, days: this.stats.days.map((d) => ({ ...d })), menuSales: { ...this.stats.menuSales } },
      unlocked: { facilities: [...this.unlocked.facilities].sort(), gifts: [...this.unlocked.gifts].sort() },
      friendsToday: [...this.friendsToday],
      courses: this.courses.toSnapshot(),
    };
  }

  static fromSnapshot(s: GameSnapshot, b: Balance = defaultBalance): Game {
    const g = new Game(s.seed, b, { kit: false });
    // 옛 스냅샷에 없는 스트림(P7 workshop)은 새 fork 그대로 둔다
    for (const k of Object.keys(RNG_SALTS) as RngStream[]) if (s.rng[k] !== undefined) g.rng[k].setState(s.rng[k]);
    g.day = s.clock.day;
    g.tick = s.clock.tick;
    g.money = s.money;
    g.rank = s.rank;
    g.grid.floor.set(s.grid.floor);
    if (s.grid.levels && s.grid.levels.length === g.grid.levels.length) g.grid.levels.set(s.grid.levels); // P0-B (optional — 없으면 0)
    // P49-a2: 옛 세이브의 물빛 배열·물빛 해금 목록은 읽고 버린다(물빛 삭제 — 버전은 안 올린다)
    if (s.grid.natural && s.grid.natural.length === g.grid.natural.length) g.grid.natural.set(s.grid.natural); // P48-a (optional — 없으면 newPark 의 자연 바닥, 랭크와 무관)
    g.facilities.fromSnapshot(s.facilities);
    g.pools.fromSnapshot(s.pools);
    g.foodcourts.fromSnapshot(s.foodcourts);
    g.guests.fromSnapshot(s.guests);
    g.inbox.fromSnapshot(s.inbox);
    g.stats = { visitors: s.stats.visitors, tickets: s.stats.tickets, fees: s.stats.fees ?? 0, food: s.stats.food ?? 0, spent: s.stats.spent ?? 0, spentDeck: s.stats.spentDeck ?? 0, spentRig: s.stats.spentRig ?? 0, spentConvert: s.stats.spentConvert ?? 0, converts: s.stats.converts ?? 0, nightNights: s.stats.nightNights ?? 0, nightPkg: s.stats.nightPkg ?? 0, nightFood: s.stats.nightFood ?? 0, nightFee: s.stats.nightFee ?? 0, rigUses: s.stats.rigUses ?? 0, rigRiderDays: s.stats.rigRiderDays ?? 0, rigRepeats: s.stats.rigRepeats ?? 0, rigPartsBought: s.stats.rigPartsBought ?? 0, stockBuys: s.stats.stockBuys ?? 0, courtEats: s.stats.courtEats ?? 0, eats: s.stats.eats ?? 0, standEats: s.stats.standEats ?? 0, rigUsesBand: s.stats.rigUsesBand ?? 0, pkgPpaji: s.stats.pkgPpaji ?? 0, vestRentals: s.stats.vestRentals ?? 0, accidents: s.stats.accidents ?? 0, swimsBySeason: s.stats.swimsBySeason ?? [0, 0, 0, 0], bailouts: s.stats.bailouts ?? 0, busGuests: s.stats.busGuests ?? 0, wishDone: s.stats.wishDone ?? 0, wishExpired: s.stats.wishExpired ?? 0, days: s.stats.days.map((d) => ({ ...d })), menuSales: { ...(s.stats.menuSales ?? {}) } , courseRevenue: s.stats.courseRevenue ?? 0, courseRiders: s.stats.courseRiders ?? 0, pkg: s.stats.pkg ?? 0, teamGuests: s.stats.teamGuests ?? 0, teamSeated: s.stats.teamSeated ?? 0, seatless: s.stats.seatless ?? 0, lodging: s.stats.lodging ?? 0, overnight: s.stats.overnight ?? 0, teamsSeated: s.stats.teamsSeated ?? 0, rainRefuge: s.stats.rainRefuge ?? 0 , passByEnter: s.stats.passByEnter ?? 0, passByLeave: s.stats.passByLeave ?? 0, nightUses: s.stats.nightUses ?? 0, gearRentals: s.stats.gearRentals ?? 0};
    for (const id of s.unlocked?.facilities ?? []) g.unlocked.facilities.add(id);
    for (const id of s.unlocked?.gifts ?? []) g.unlocked.gifts.add(id);
    g.sns.fromSnapshot(s.sns);
    if (s.certs) g.certs.fromSnapshot(s.certs);
    if (s.shop) g.shop.fromSnapshot(s.shop);
    for (const id of s.calendarGiven ?? []) g.calendarGiven.add(id);
    g.firstCertPassDay = s.firstCertPassDay ?? null;
    for (const id of s.tools ?? []) g.tools.add(id);
    if (s.menus) g.menus.fromSnapshot(s.menus);
    if (s.cooking) g.cooking.fromSnapshot(s.cooking);
    if (s.workshop) g.workshop.fromSnapshot(s.workshop);
    if (s.rigs) g.rigs.fromSnapshot(s.rigs); // P49-a1
    for (const [k, v] of s.bandPaid ?? []) g.bandPaid.set(k, v); for (const [k, v] of s.accidentCut ?? []) g.accidentCut.set(k, v); g.accidentsToday = s.accidentsToday ?? 0; // P52
    g.waterClosedUntil = s.waterClosedUntil ?? -1; // P52-c
    g.nightOpened = s.nightOpened ?? false; // P54 (래치 nightOn 은 로드 뒤 다음 저녁에 다시 판정 — 저녁 로드는 그날 밤이 닫힌 것으로 본다)
    g.cleanliness = s.cleanliness ?? 100;
    for (const id of s.combosSeen ?? []) g.combosSeen.add(id);
    for (const id of s.packagesSeen ?? []) g.packagesSeen.add(id);
    for (const id of s.setsSeen ?? []) g.setsSeen.add(id); // P60-c
    for (const id of s.invest ?? []) g.investDone.add(id);
    g.investPending = (s.investPending ?? []).map((p) => ({ ...p }));
    if (s.campaigns) g.campaigns.fromSnapshot(s.campaigns);
    g.busQueue = (s.busQueue ?? []).map((p) => ({ ...p }));
    g.busesToday = (s.busesToday ?? []).map((p) => ({ ...p }));
    g.busState = s.busState ? { ...s.busState } : null;
    g.teamSeq = s.teamSeq ?? 0;
    g.firstSaleSeen = s.firstSaleSeen ?? false;
    g.fullCourtSeen = s.fullCourtSeen ?? false; // P60-e
    g.walkinTeam = s.walkin?.team ?? 0; g.walkinLeft = s.walkin?.left ?? 0;
    if (s.weather) g.weather = s.weather;
    g.ticketBonus = s.ticketBonus ?? 0;
    g.prevSatAvg = s.prevSatAvg ?? 0;
    g.endingSeen = s.endingSeen ?? false;
    g.story.fromSnapshot(s.story);
    g.staff.fromSnapshot(s.staff);
    g.events.fromSnapshot(s.randomEvents);
    if (s.dayAccum) { g.satSum = s.dayAccum.satSum; g.satN = s.dayAccum.satN; g.menuSalesToday = { ...s.dayAccum.menuSalesToday }; g.likesAtDayStart = s.dayAccum.likesAtDayStart; g.ticketsToday = s.dayAccum.ticketsToday ?? 0; g.feesToday = s.dayAccum.feesToday ?? 0; g.foodToday = s.dayAccum.foodToday ?? 0; g.guests.enteredToday = s.dayAccum.enteredToday ?? 0; g.guests.leftToday = s.dayAccum.leftToday ?? 0; }
    g.friendsToday = [...(s.friendsToday ?? [])];
    if (s.courses) g.courses.fromSnapshot(s.courses);
    g.refreshRigs(); // P50-a: 켜짐·walkOn·blocked 는 파생 — 로드 뒤 다시 센다
    g.primePackageCache(); // P50-b1: 자리 패키지 대조 캐시(파생)
    g.arrivalRevision = s.arrivalRevision ?? 0;
    if (g.arrivalRevision) g.guests.setArrivalRoute(arrivalRoute(g.gate));
    g.recomputePassBy(); // P45-b: 복도 곁 점포 집합은 저장하지 않는다 — 복원 때 다시 센다(하루 중간 저장·복원이 같아야 한다, G57)
    return g;
  }
}

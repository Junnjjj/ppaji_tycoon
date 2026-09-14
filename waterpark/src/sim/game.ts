/**
 * 세계 조립 — 시계·격자·풀·시설·손님·돈·인박스를 한 곳에서 tick 한다.
 * 바깥(렌더·UI·봇)은 **명령 메서드**로만 쓴다. 전부 `{ok}|{ok:false, reason}` 를 돌려
 * UI 가 이유를 미리 보여 줄 수 있게 한다. 연출은 `drainFx()` 로 꺼내 간다 — 헤드리스에선 버려진다.
 */
import { Rng } from './rng.js';
import { Grid, FLOOR, landRect, inRect, gateTile } from './grid.js';
import { PoolStore, type PoolSnapshot } from './pool.js';
import type { Pool } from './pool.js';
import { poolState, type PoolState } from './pool-state.js';
import { GuestStore, type GuestSnapshot, FLOAT_BY_GIFT } from './guest.js';
import { firstVisitLine } from './lines.js';
import { FacilityStore, FACILITY_FAIL_KO, popOf, capacityOf, upgradeCost, FACILITY_MAX_LEVEL, type FacilitySnapshot, type PlacedFacility } from './facility.js';
import { StoryDirector } from './story.js';
import { applyStartKit } from './startkit.js';
import rivalsJson from '../data/rivals.json';
import featuresJson from '../data/features.json';
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
import { CookingStore, COOK_COST, COOK_UNLOCK_RANK, type CookingSnapshot, type CookResult } from './cooking.js';
import {
  clockView, isWeekend, seasonOf, yearOf, TICKS_PER_DAY, TOTAL_DAYS, ARRIVAL_FROM_TICK, ARRIVAL_TO_TICK, TICKS_PER_HOUR, SHOP_RESTOCK_TICK, type ClockView, CLOSING_TICK } from './clock.js';
import type { FacilityDef, ItemDef, SeasonTables, AreaDef, FriendDef, WishDef, GiftDef, Condition, CertDef, RankDef, ShopEntry, CalendarEvent, TileDef, RecipeDef, CompatDef, IngredientDef, InvestDef, CampaignDef } from '../data/schema.js';
import defaultBalance from '../data/balance.json';
import facilitiesJson from '../data/facilities.json';
import itemsJson from '../data/items.json';
import seasonsJson from '../data/seasons.json';
import areasJson from '../data/areas.json';
import friendsJson from '../data/friends.json';
import wishesJson from '../data/wishes.json';
import giftsJson from '../data/gifts.json';
import certsJson from '../data/certs.json';
import ranksJson from '../data/ranks.json';
import shopJson from '../data/shop.json';
import calendarJson from '../data/calendar.json';
import tilesJson from '../data/tiles.json';
import recipesJson from '../data/recipes.json';
import compatJson from '../data/compat.json';
import ingredientsJson from '../data/ingredients.json';
import investJson from '../data/invest.json';
import campaignsJson from '../data/campaigns.json';

export type Balance = typeof defaultBalance;

export const FACILITY_DEFS: ReadonlyMap<string, FacilityDef> = new Map((facilitiesJson as unknown as FacilityDef[]).map((d) => [d.id, d]));
export const ITEM_DEFS: ReadonlyMap<string, ItemDef> = new Map((itemsJson as unknown as ItemDef[]).map((d) => [d.id, d]));
export const SEASON_TABLES = seasonsJson as unknown as SeasonTables;
export const POOL_ITEM_CAP = 20;
/** 재통과 위로금 — 재료는 G7 에서 */
export const CONSOLATION = 300;
/** 폐장 잔고가 음수면 여기까지 채워 준다 (G37) */
export const EMERGENCY_FUND = 2000;
export const AREA_DEFS = areasJson as unknown as AreaDef[];
export const FRIEND_DEFS = friendsJson as unknown as FriendDef[];
export const WISH_DEFS = wishesJson as unknown as WishDef[];
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
export const TILE_DEFS = tilesJson as unknown as TileDef[];
export const TILE_INDEX: ReadonlyMap<string, number> = new Map(TILE_DEFS.map((t, k) => [t.id, k]));
export const RECIPE_DEFS = recipesJson as unknown as RecipeDef[];
export const COMPAT_DEFS = compatJson as unknown as CompatDef[];
export const INGREDIENT_DEFS = ingredientsJson as unknown as IngredientDef[];
export const INGREDIENTS_BY_ID: ReadonlyMap<string, IngredientDef> = new Map(INGREDIENT_DEFS.map((i) => [i.id, i]));
export const INVEST_DEFS = investJson as unknown as InvestDef[];
export const CAMPAIGN_DEFS = campaignsJson as unknown as CampaignDef[];
/** 실내 바닥 칠하기 — 칸당 */
export const INDOOR_COST = 40;
/** 친구 방문 — 개장 때 해금 친구마다 이 확률로 오늘 온다 */
export const FRIEND_VISIT_CHANCE = 0.5;

export const RNG_SALTS = { spawn: 1, guest: 2, sns: 3, cert: 4, shop: 5, cook: 6, world: 7, friend: 8 } as const;
export type RngStream = keyof typeof RNG_SALTS;

export type Result = { ok: true } | { ok: false; reason: string };

/** 아침 버스 한 대 (G33) */
export interface BusPlan { areaId: string; seats: number; source: 'campaign' | 'likes' }
/** 도로 위 버스 — in(왼쪽에서 들어온다) → stop(한 명씩 내린다) → out(오른쪽으로 나간다). t 는 in/out 진행률, stop 에선 tick 수 */
export interface BusState { areaId: string; seatsLeft: number; phase: 'in' | 'stop' | 'out'; t: number; source: 'campaign' | 'likes' }

export interface FxEvent {
  kind: 'splash' | 'coin' | 'dig' | 'fill' | 'place' | 'remove' | 'item' | 'photo' | 'like' | 'cert' | 'rankup' | 'buy' | 'discover' | 'land' | 'wish' | 'rest' | 'bus';
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
  maintenance: number;
  net: number;
  /** G19 — 퇴장 만족 평균 · 그날 얻은 좋아요 · 최고 수입 시설 · 최다 판매 메뉴 */
  satisfaction?: number;
  likes?: number;
  topFacility?: { name: string; income: number; uses: number } | null;
  topMenu?: { name: string; sales: number } | null;
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
  version: 1;
  seed: number;
  rng: Record<RngStream, number>;
  clock: { day: number; tick: number };
  money: number;
  rank: number;
  grid: { w: number; h: number; floor: number[]; poolTile?: number[] };
  pools: PoolSnapshot;
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
  invest?: string[];
  investPending?: { id: string; day: number }[];
  campaigns?: CampaignState;
  /** 내일 아침 올 버스 (G33) · 지금 도로 위 버스 상태 */
  busQueue?: BusPlan[];
  busesToday?: BusPlan[];
  busState?: BusState | null;
  weather?: Weather;
  ticketBonus?: number;
  endingSeen?: boolean;
  /** 풀 아이템 프리셋 (G12 — 소원이 완성 풀을 부수게 하는 것에 대한 대응: 저장해 뒀다 한 번에 복원) */
  presets?: { name: string; items: string[] }[];
  /** 본 시나리오 비트 id (G16) */
  story?: string[];
  /** 직원·청결 (G20) */
  staff?: StaffSnapshot;
  /** 랜덤 이벤트 (G21) */
  randomEvents?: RandomEventsSnapshot;
  /** 하루 안의 결산 누적 (G19) — 없으면 0 에서 시작 (왕복이 하루 중간이면 필요하다) */
  dayAccum?: { satSum: number; satN: number; menuSalesToday: Record<string, number>; likesAtDayStart: number; ticketsToday?: number; feesToday?: number; foodToday?: number; presetSerial?: number; enteredToday?: number; leftToday?: number };
  stats: { visitors: number; tickets: number; fees: number; food?: number; spent?: number; bailouts?: number; busGuests?: number; wishDone?: number; wishExpired?: number; days: DayReport[]; menuSales?: Record<string, number> };
  prevSatAvg?: number;
  /** 해금된 시설·아이템·선물 id (start 는 언제나 포함) */
  unlocked: { facilities: string[]; items: string[]; gifts?: string[]; tiles?: string[] };
  /** 오늘 방문하기로 한 친구 (스냅샷 복원 때 다시 안 뽑게) */
  friendsToday?: string[];
}

/** 풀 프리셋 상한 — 창 한 장에 들어가는 줄 수 */
export const MAX_PRESETS = 4;

export class Game {
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
  /** 풀 아이템 프리셋 — 최대 MAX_PRESETS, 오래된 것부터 밀린다 */
  presets: { name: string; items: string[] }[] = [];
  private presetSerial = 1;
  /** 시나리오 (G16) — 비트 판정·적재 */
  readonly story = new StoryDirector();
  /** 직원·청결 (G20) */
  readonly staff: StaffStore;
  /** 랜덤 이벤트 (G21) */
  readonly events: RandomEvents;
  readonly cooking: CookingStore;
  private foodToday = 0;
  private menuVersion = 0;
  readonly rng: Record<RngStream, Rng>;
  /** 오늘 오기로 한 친구 id (아직 안 온 것) */
  private friendsToday: string[] = [];
  day = 0;
  tick = 0;
  money: number;
  rank = 0;
  stats = { visitors: 0, tickets: 0, fees: 0, food: 0, spent: 0, bailouts: 0, busGuests: 0, wishDone: 0, wishExpired: 0, days: [] as DayReport[], menuSales: {} as Record<string, number> };
  /** 오늘 퇴장 만족 합·수 (결산용, 저장 안 함 — 하루 안에서만 쓴다) */
  private satSum = 0;
  /** 어제 퇴장 만족 평균 (G30 티켓 레벨). 저장 optional */
  prevSatAvg = 0;
  private satN = 0;
  private menuSalesToday: Record<string, number> = {};
  private likesAtDayStart = 0;
  readonly unlocked = { facilities: new Set<string>(), items: new Set<string>(), gifts: new Set<string>(), tiles: new Set<string>() };
  private fx: FxEvent[] = [];
  private ticketsToday = 0;
  private feesToday = 0;
  /** 풀 파생 상태 캐시 — 편집·아이템·시간(계절)·인접 시설이 바뀌면 비운다 */
  private poolCache = new Map<number, { key: string; state: PoolState }>();

  constructor(
    readonly seed: number,
    readonly b: Balance = defaultBalance,
    opts: { kit?: boolean } = {},
  ) {
    const root = new Rng(seed);
    this.rng = Object.fromEntries(Object.entries(RNG_SALTS).map(([k, salt]) => [k, root.fork(salt)])) as Record<RngStream, Rng>;
    this.grid = Grid.newPark(0);
    this.pools = new PoolStore(this.grid);
    this.facilities = new FacilityStore(this.grid, FACILITY_DEFS);
    this.guests = new GuestStore(this.grid, this.pools, this.facilities, gateTile(0), this.rng.guest, b);
    this.staff = new StaffStore(this.rng.world, (i, j) => this.guests.walkable(i, j), () => this.land);
    this.events = new RandomEvents(this.rng.world);
    this.money = b.startMoney;
    this.sns = new SnsStore(AREA_DEFS, FRIEND_DEFS, WISH_DEFS, GIFT_DEFS, this.rng.sns);
    this.certs = new CertStore(CERT_DEFS, this.rng.cert);
    this.shop = new Shop(SHOP_ENTRIES, this.rng.shop);
    this.cooking = new CookingStore(RECIPE_DEFS, INGREDIENT_DEFS, this.rng.cook);
    for (const d of FACILITY_DEFS.values()) if (d.unlock.source === 'start') this.unlocked.facilities.add(d.id);
    for (const d of ITEM_DEFS.values()) if (d.unlock === 'start') this.unlocked.items.add(d.id);
    for (const d of GIFT_DEFS) if (d.unlock === 'start') this.unlocked.gifts.add(d.id);
    for (const t of TILE_DEFS) if (t.unlock === 'start') this.unlocked.tiles.add(t.id);
    this.weather = rollWeather(this.rng.world, seasonOf(0));
    this.planFriendVisits();
    this.planBuses();
    // 시작 킷 (G25) — 물려받은 작은 파크. 스냅샷 복원은 kit:false 로 부른다 (덮어쓸 것이라 무의미하다)
    if (opts.kit !== false) applyStartKit(this);
  }

  /** 오늘 바깥 기온 — 계절 기본 + 날씨 */
  outdoorTemp(): number {
    return (SEASON_TABLES.ambientOutdoor[seasonOf(this.day)] ?? 24) + WEATHER_TEMP[this.weather];
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
      return { id: p.id, size: p.tiles.length, color: st?.color ?? 'clear', scent: st?.scent ?? null, temp: st?.temp ?? 0, likes: p.likes, intensity: st?.intensity ?? 0, bars: st?.detail.intensityBars ?? 0, popularity: st?.popularity ?? 0, indoor: this.poolIndoor(p.id), adjacentFacilities: adj, items: p.items.filter((it) => it.expiresTick > this.absTick).map((it) => it.itemId), tiles: this.tileCounts(p) };
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
    };
    this.worldCache = { key, world };
    return world;
  }

  evaluateCondition(c: Condition): Verdict {
    return evaluate(c, this.conditionWorld(), {
      facility: (id) => FACILITY_DEFS.get(id)?.name ?? id,
      item: (id) => ITEM_DEFS.get(id)?.name ?? id,
      gift: (id) => GIFTS_BY_ID.get(id)?.name ?? id,
    });
  }

  /** 풀의 타일 종류별 칸 수 (G35 `pool{tile}` 조건) */
  private tileCounts(p: Pool): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of p.tiles) { const id = TILE_DEFS[this.grid.poolTile[k] ?? 0]?.id ?? 'standard'; out[id] = (out[id] ?? 0) + 1; }
    return out;
  }

  /** 보상 적용 — 해금은 집합에, 돈은 더한다, 도구는 tools 에 */
  grant(r: { kind: string; id?: string; amount?: number }): string {
    switch (r.kind) {
      case 'facility': if (r.id) this.unlocked.facilities.add(r.id); return `${FACILITY_DEFS.get(r.id ?? '')?.name ?? r.id} 해금`;
      case 'item': if (r.id) this.unlocked.items.add(r.id); return `${ITEM_DEFS.get(r.id ?? '')?.name ?? r.id} 해금`;
      case 'gift': if (r.id) this.unlocked.gifts.add(r.id); return `${GIFTS_BY_ID.get(r.id ?? '')?.name ?? r.id} 해금`;
      case 'tile': if (r.id) this.unlocked.tiles.add(r.id); return `${TILE_DEFS.find((t) => t.id === r.id)?.name ?? r.id} 타일 해금`;
      case 'tool': if (r.id) this.tools.add(r.id); return `${r.id === 'move' ? '이동 도구' : r.id} 획득`;
      case 'ingredient': if (r.id) this.cooking.grantIngredient(r.id); return `재료 ${INGREDIENTS_BY_ID.get(r.id ?? '')?.name ?? r.id}`;
      case 'money': this.money += r.amount ?? 0; return `${(r.amount ?? 0).toLocaleString('ko-KR')}G`;
      case 'unlock': return r.id === 'cooking' ? '요리 개발 해금' : `${r.id} 해금`;
      default: return r.id ?? r.kind;
    }
  }

  /** 소원 보상 적용 */
  private grantWishReward(w: WishDef): string {
    const r = w.reward;
    switch (r.kind) {
      case 'facility': this.unlocked.facilities.add(r.id); return `${FACILITY_DEFS.get(r.id)?.name ?? r.id} 해금`;
      case 'item': this.unlocked.items.add(r.id); return `${ITEM_DEFS.get(r.id)?.name ?? r.id} 해금`;
      case 'gift': this.unlocked.gifts.add(r.id); return `${GIFTS_BY_ID.get(r.id)?.name ?? r.id} 해금`;
      case 'money': this.money += r.amount; return `${r.amount.toLocaleString('ko-KR')}G`;
      case 'ingredient': return this.grant(r);
      case 'tile': return this.grant(r);
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
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: res.pass ? `${def.name} 합격!` : `${def.name} 불합격`, body });
    this.fx.push({ kind: 'cert', i: this.gate.i, j: this.gate.j, amount: res.score });
  }

  /** cert 출처 재료 n 개를 준다 (없는 것부터, `cert` 스트림). 준 이름들을 돌려준다 */
  private grantCertIngredients(n: number): string[] {
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      const cands = INGREDIENT_DEFS.filter((i) => i.unlock === 'cert' && !this.cooking.owned.has(i.id));
      if (cands.length === 0) break;
      const pick = cands[this.rng.cert.int(cands.length)];
      if (!pick) break;
      this.cooking.grantIngredient(pick.id);
      out.push(pick.name);
    }
    return out;
  }

  /** 랭크업 — 폐장에 다음 랭크 조건 전부 만족이면 (무작위 없음) */
  private checkRank(): void {
    const next = nextRank(RANK_DEFS, this.rank);
    if (!next) return;
    if (!rankReady(next, (c) => this.evaluateCondition(c)).ready) return;
    this.rank = next.star;
    const opened = this.grid.openLand(this.rank);
    const got = next.reward ? this.grant(next.reward) : '';
    this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'modal', title: `랭크 업! ★${next.star} ${next.name}`, body: `토지 +${opened}칸${got ? ` · ${got}` : ''} · 상점에 새 상품` });
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
    if (e.kind === 'item') return this.unlocked.items.has(e.ref);
    return this.unlocked.gifts.has(e.ref);
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
    return p?.name ?? `풀 #${poolId}`;
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
    const r = this.cooking.cook(ids);
    if (r.ok && r.first && r.via !== 'fail') {
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: r.via === 'upgrade' ? `강화 — ${r.from?.name ?? ''} → ${r.recipe.name}` : `새 레시피 — ${r.recipe.name}`, body: `${r.recipe.cat} · 맛 ${r.recipe.taste} · 외관 ${r.recipe.look} · 인기 ${r.recipe.pop}` });
      this.fx.push({ kind: 'discover', i: this.gate.i, j: this.gate.j });
    }
    return r;
  }

  buyIngredient(id: string): Result {
    const d = INGREDIENTS_BY_ID.get(id);
    if (!d || d.unlock !== 'shop' || d.price === undefined) return { ok: false, reason: '상점에서 파는 재료가 아닙니다' };
    if (this.cooking.owned.has(id)) return { ok: false, reason: '이미 가진 재료입니다' };
    if (d.price > this.money) return { ok: false, reason: `돈이 부족합니다 — ${d.price.toLocaleString('ko-KR')}G 필요` };
    this.spend(d.price);
    this.cooking.grantIngredient(id);
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
      this.busState = { areaId: next.areaId, seatsLeft: next.seats, phase: 'in', t: 0, source: next.source };
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `${this.sns.areasById.get(next.areaId)?.name ?? next.areaId}에서 버스 도착`, body: `${next.seats}명이 내린다${next.source === 'likes' ? ' — 주민들의 좋아요 덕분' : ''}` });
      return;
    }
    const bs = this.busState;
    if (bs.phase === 'in') {
      bs.t = Math.min(1, bs.t + 1 / travel);
      if (bs.t >= 1) { bs.phase = 'stop'; bs.t = 0; this.fx.push({ kind: 'bus', i: this.gate.i, j: this.gate.j + 2 }); }
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
    const g = this.guests.spawn(fdef ? { id: fdef.id, palette: fdef.palette, favColor: fdef.fav.color, favScent: fdef.fav.scent, name: fdef.name, age: fdef.age, gender: fdef.gender, home: areaName, float: ownFloat } : undefined, areaName);
    if (fdef) { const st = this.sns.friends.get(fdef.id); if (st) { st.visits++; if (st.visits === 1) g.say = firstVisitLine(fdef); } }
    const ticket = this.ticketFor(fdef ? { id: fdef.id } : null);
    this.money += ticket;
    this.ticketsToday += ticket;
    this.stats.visitors++;
    this.stats.tickets += ticket;
    this.stats.busGuests = (this.stats.busGuests ?? 0) + 1;
    this.fx.push({ kind: 'coin', i: g.i, j: g.j, amount: ticket });
  }

  canPaintIndoor(i: number, j: number): Result {
    if (!this.grid.inside(i, j) || !inRect(this.land, i, j)) return { ok: false, reason: '아직 내 땅이 아닙니다' };
    const g = this.gate;
    if (i === g.i && j === g.j) return { ok: false, reason: '입구는 안 됩니다' };
    const f = this.grid.at(i, j);
    if (f === FLOOR.pool) return { ok: false, reason: '풀 위는 실내 바닥을 못 깝니다 — 주변을 실내로 두르세요' };
    if (f === FLOOR.indoor) return { ok: false, reason: '이미 실내입니다' };
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
    for (const t of tiles) if (this.grid.at(t.i, t.j) !== FLOOR.indoor) return { ok: false, reason: '실내가 아닙니다' };
    // G57: 시설 아래 바닥을 지우면 실내 전용 시설이 잔디 위에 남는다
    for (const t of tiles) if (this.facilities.occupied(t.i, t.j)) return { ok: false, reason: '시설 아래 바닥은 지울 수 없습니다 — 먼저 시설을 옮기거나 철거하세요' };
    for (const t of tiles) { this.grid.set(t.i, t.j, FLOOR.grass); this.fx.push({ kind: 'fill', i: t.i, j: t.j }); }
    this.afterWorldChange();
    return { ok: true };
  }

  private runCalendar(): void {
    for (const e of dueEvents(CALENDAR_EVENTS, this.day, this.tick, this.calendarGiven, (c) => this.evaluateCondition(c), { firstCertPassDay: this.firstCertPassDay })) {
      this.calendarGiven.add(e.id);
      const got = this.grant(e.grant);
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: e.priority ?? 'modal', title: e.title, body: bodyWithReward(e.line, got) });
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

  /** 수집 분모 (G53, D11) */
  get tileCount(): number {
    return TILE_DEFS.length;
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

  get land() {
    return landRect(this.rank);
  }

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
    const key = `${this.pools.version}|${this.facilities.version}|${seasonOf(this.day)}|${p.items.length}|${p.likes}|${this.weather}`;
    const hit = this.poolCache.get(id);
    if (hit && hit.key === key) return hit.state;
    const state = this.computePoolState(p);
    this.poolCache.set(id, { key, state });
    return state;
  }

  /** 캐시 없는 순수 계산 — `previewItem` 이 가상의 풀에도 쓴다 */
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
    let tilePopSum = 0;
    for (const k of p.tiles) tilePopSum += TILE_DEFS[this.grid.poolTile[k] ?? 0]?.pop ?? this.b.tilePopStandard;
    const tables = this.weather === 'rain' || this.weather === 'cloudy' ? { ...SEASON_TABLES, sun: [0, 0, 0, 0] as [number, number, number, number], ambientOutdoor: SEASON_TABLES.ambientOutdoor.map((t) => t + WEATHER_TEMP[this.weather]) as [number, number, number, number] } : SEASON_TABLES;
    return poolState(p, { items: ITEM_DEFS, adjacent: adj, season: seasonOf(this.day), tables, balance: this.b, indoor: this.poolIndoor(p.id), tilePopSum });
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
        if (f !== FLOOR.indoor && f !== FLOOR.pool) return false;
      }
    }
    return true;
  }

  private popCache: { key: string; value: number } | null = null;

  /** 파크 인기 = 풀 인기 합 + 시설 인기 합 (버전·계절·아이템 수가 같으면 캐시) */
  parkPopularity(): number {
    const key = `${this.pools.version}|${this.facilities.version}|${seasonOf(this.day)}|${this.pools.all.reduce((n, p) => n + p.items.length, 0)}|${this.menuVersion}|${this.staff.all.length}|${this.day}|${this.sns.totalLikes}`; // G57: 좋아요(풀 SE)도 키에
    if (this.popCache && this.popCache.key === key) return this.popCache.value;
    let n = this.facilities.totalPopularity(seasonOf(this.day));
    const cook = this.staff.mul('menuMul');
    for (const f of this.facilities.all) if (this.facilities.defOf(f).menuSlots > 0) n += Math.round(this.menus.menuPopularity(f.uid, f.defId) * cook);
    for (const p of this.pools.all) n += this.poolState(p.id)?.popularity ?? 0;
    n += this.events.popBonus(this.day);
    this.popCache = { key, value: n };
    return n;
  }

  dailyMaintenance(): number {
    let m = this.facilities.totalMaintenance();
    for (const p of this.pools.all) m += this.poolState(p.id)?.maintenance ?? 0;
    // 후반 지출 곡선 (G30) — 랭크가 오를수록 같은 파크의 유지비가 는다 (★5 ≈ ×2). 돈이 남아도는 밴드 상한을 누른다
    return Math.round(m * Math.pow(this.b.maintRankMul ?? 1, this.rank));
  }

  /** 돈을 쓴다 — 누적 지출은 봇 밴드(후반 지출 비율)가 읽는다 (G30) */
  private spend(amount: number): void {
    this.money -= amount;
    this.stats.spent = (this.stats.spent ?? 0) + amount;
  }

  /** 티켓 요금 (G30, R9) — 손님의 만족 레벨(0~3)로 오른다. 친구는 ☆ 수, 일반 손님은 어제 파크 퇴장 만족 레벨 */
  ticketFor(friend: { id: string } | null): number {
    const step = this.b.ticketSatStep ?? 0;
    const level = friend ? Math.min(3, this.sns.friends.get(friend.id)?.stars ?? 0) : Math.min(3, Math.floor(this.prevSatAvg / 25));
    return Math.round((this.b.ticketBase * (1 + step * level)) / 10) * 10 + this.ticketBonus;
  }

  /** 아이템 만료 (G42, 원작): 넣은 시점부터 `days`일의 폐장 — 이미 살아 있는 아이템이 있으면 **그 만료를 물려받는다**(개수와 무관, 안 늘어난다) */
  private itemExpiry(p: { items: readonly { expiresTick: number }[] }, d: ItemDef): number {
    const alive = p.items.filter((it) => it.expiresTick > this.absTick);
    if (alive.length > 0) return Math.min(...alive.map((it) => it.expiresTick));
    return (this.day + d.days) * TICKS_PER_DAY + CLOSING_TICK;
  }

  /** 풀 아이템이 며칠 남았나 (풀 정보 창) — 없으면 null */
  itemDaysLeft(poolId: number): number | null {
    const p = this.pools.byId(poolId);
    const alive = p ? p.items.filter((it) => it.expiresTick > this.absTick) : [];
    if (alive.length === 0) return null;
    return Math.max(0, Math.ceil((Math.min(...alive.map((it) => it.expiresTick)) - this.absTick) / TICKS_PER_DAY));
  }

  /** 아이템을 넣으면 색이 바뀌나 — 바뀌면 그 풀의 좋아요가 0 이 된다 (R2). UI 가 경고에 쓴다 */
  previewItem(poolId: number, itemId: string): { before: string; after: string; likes: number; resets: boolean; states: { before: PoolState; after: PoolState } } | null {
    const p = this.pools.byId(poolId);
    const d = ITEM_DEFS.get(itemId);
    const cur = this.poolState(poolId);
    if (!p || !d || !cur) return null;
    const before = cur.color;
    const fake = { ...p, items: [...p.items, { itemId, placedTick: this.absTick, expiresTick: this.itemExpiry(p, d) }] };
    const afterState = this.computePoolState(fake);
    // G52: 원작 「아이템 투입 효과」 — 넣기 전에 색·농도·향·온도·인기의 전후를 같이 준다
    return { before, after: afterState.color, likes: p.likes, resets: before !== afterState.color && p.likes > 0, states: { before: cur, after: afterState } };
  }

  /** 이 아이템을 몇 개 넣어야 색이 붙나 (G55 — 「맑음 1/5」 힌트). 색 없는 아이템이면 null, `max` 안에 안 붙으면 max+1 */
  itemsToColor(poolId: number, itemId: string, max = 6): number | null {
    const p = this.pools.byId(poolId);
    const d = ITEM_DEFS.get(itemId);
    if (!p || !d || !d.color) return null;
    for (let n = 1; n <= max; n++) {
      const items = [...p.items];
      for (let k = 0; k < n; k++) items.push({ itemId, placedTick: this.absTick, expiresTick: this.itemExpiry(p, d) });
      if (this.computePoolState({ ...p, items }).color !== 'clear') return n;
    }
    return max + 1;
  }

  /** 동시 손님 상한 — 랭크마다 +12 (G24: ★0 40 → ★5 100). 화면 밀도가 곧 보상이다 */
  maxGuests(): number {
    return this.b.maxGuests + this.rank * (this.b.maxGuestsPerRank ?? 0);
  }

  /** 오늘 유입 목표(명) — 인기·주말·계절 */
  dailyTarget(): number {
    // G33: 좋아요가 손님을 부른다 (매뉴얼 「좋아요 → 손님을 얻기 쉬워진다」). 포화형이라 10만 좋아요가 유입을 독점하지 않는다
    const likes = Math.min(this.b.arrivalLikesCap ?? 0, this.sns.totalLikes * (this.b.arrivalPerLike ?? 0));
    const base = this.b.arrivalBase + this.pools.totalTiles() * this.b.arrivalPerPoolTile + this.parkPopularity() * this.b.arrivalPerPop + likes;
    const season = this.b.arrivalSeasonMul[seasonOf(this.day)] ?? 1;
    const weekend = isWeekend(this.day) ? this.b.arrivalWeekendMul : 1;
    return base * season * weekend * this.campaigns.mul(this.day) * WEATHER_ARRIVAL[this.weather] * this.events.arrivalMul(this.day);
  }

  isUnlocked(defId: string): boolean {
    return this.unlocked.facilities.has(defId);
  }

  isItemUnlocked(itemId: string): boolean {
    return this.unlocked.items.has(itemId);
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
    if (this.tick >= ARRIVAL_FROM_TICK && this.tick < Math.min(ARRIVAL_TO_TICK, CLOSING_TICK) && this.guests.count < this.maxGuests()) {
      const p = this.dailyTarget() / (ARRIVAL_TO_TICK - ARRIVAL_FROM_TICK);
      if (this.rng.spawn.chance(Math.min(1, p))) {
        // 오늘 오기로 한 친구가 남아 있으면 그 사람이 먼저 온다
        const fid = this.friendsToday.shift();
        const fdef = fid ? this.sns.friendDef(fid) : undefined;
        const areaName = (a: string): string => this.sns.areasById.get(a)?.name ?? a;
        const homes = this.sns.areas.map((a) => areaName(a));
        const owned = fdef ? (this.sns.friends.get(fdef.id)?.gifts ?? []) : [];
        const ownFloat = owned.map((id) => FLOAT_BY_GIFT[id] ?? 0).find((n) => n > 0) ?? 0;
        const g = this.guests.spawn(fdef ? { id: fdef.id, palette: fdef.palette, favColor: fdef.fav.color, favScent: fdef.fav.scent, name: fdef.name, age: fdef.age, gender: fdef.gender, home: areaName(fdef.area), float: ownFloat } : undefined, homes[this.rng.guest.int(Math.max(1, homes.length))] ?? '이 동네');
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
    this.guests.step({
      onSwimEnter: (g) => this.fx.push({ kind: 'splash', i: g.i, j: g.j }),
      closing: () => this.tick >= CLOSING_TICK,
      weather: () => this.weather,
      poolIndoor: (id) => this.poolIndoor(id),
      poolTemp: (id) => this.poolState(id)?.temp ?? 26,
      poolTempFit: (id) => this.poolState(id)?.detail.tempFit ?? 1,
      poolLook: (id) => { const st = this.poolState(id); return { color: st?.color ?? 'clear', scent: st?.scent ?? null }; },
      onPhoto: (g, subject) => {
        const areaId = g.friendId ? (this.sns.friendDef(g.friendId)?.area ?? this.sns.areas[0] ?? 'residential') : (this.sns.areas[this.rng.sns.int(this.sns.areas.length)] ?? 'residential');
        let basePop = 0;
        let name = '';
        if (subject.kind === 'pool') { basePop = this.poolState(subject.ref)?.popularity ?? 0; name = `풀 #${subject.ref}`; }
        else { const f = this.facilities.byUid(subject.ref); if (f) { basePop = this.facilities.defOf(f).pop; name = this.facilities.defOf(f).name; } }
        const fav = g.favColor !== null && subject.kind === 'pool' && this.poolState(subject.ref)?.color === g.favColor ? 20 : 0;
        const post = this.sns.post(this.day, this.tick, g.friendId, areaId, { ...subject, name }, basePop, fav, g.palette);
        if (subject.kind === 'pool') { const p = this.pools.byId(subject.ref); if (p) { p.likes += post.likes; this.poolCache.delete(p.id); } }
        this.fx.push({ kind: 'photo', i: g.i, j: g.j, amount: post.likes });
      },
      onLeave: (g) => { this.satSum += g.sat; this.satN++; this.friendLeaves(g); },
      hpMul: () => this.staff.mul('hpMul'),
      satMul: () => this.staff.mul('satMul') * this.staff.cleanSatMul(),
      photoMul: () => this.staff.mul('photoMul'),
      onFacilityUse: (g, f) => {
        const def = this.facilities.defOf(f);
        f.usesTotal++;
        if (def.slide) { const ex = FacilityStore.exitTile(def, f.i, f.j, f.facing); if (ex) this.fx.push({ kind: 'land', i: ex.i, j: ex.j }); }
        else if (def.class === 'lounging') this.fx.push({ kind: 'rest', i: f.i, j: f.j });
        if (def.menuSlots > 0) {
          const rec = this.menus.pick(f.uid, this.rng.guest.next());
          if (rec) {
            const price = Math.round(recipePrice(rec) * this.cooking.mult);
            this.money += price;
            this.foodToday += price;
            this.stats.food += price;
            f.incomeToday += price; f.incomeTotal += price; g.spentToday += price;
            this.menuSalesToday[rec.id] = (this.menuSalesToday[rec.id] ?? 0) + 1;
            this.stats.menuSales[rec.id] = (this.stats.menuSales[rec.id] ?? 0) + 1;
            // G33: 요리 레벨은 가격뿐 아니라 맛(HP)·인기(만족)에도 소급된다 (매뉴얼 「높은 레벨 = 더 좋은 스탯」)
            g.hp = Math.min(100, g.hp + rec.taste * 2 * this.cooking.mult);
            g.sat = Math.min(100, g.sat + rec.pop * 0.3 * this.cooking.mult);
            g.carry = true; // 들고 나가 앉을 자리를 찾는다 (R3)
            this.fx.push({ kind: 'buy', i: g.i, j: g.j, amount: price, label: `${rec.name} ×1` });
          }
        }
        if (def.usageFee > 0 && f.rentedBy === null) {
          f.rentedBy = g.uid;
          this.money += def.usageFee;
          this.feesToday += def.usageFee;
          this.stats.fees += def.usageFee;
          f.incomeToday += def.usageFee; f.incomeTotal += def.usageFee; g.spentToday += def.usageFee;
          this.fx.push({ kind: 'coin', i: g.i, j: g.j, amount: def.usageFee });
        }
      },
    });
    this.runCalendar();
    if (this.certs.isJudgeTime(this.day, this.tick)) this.judgeCert();
    if (this.tick === SHOP_RESTOCK_TICK) {
      this.shop.restock(this.day, this.rank, (e) => this.shopOwned(e));
      // R8 (G48): 17시 입고는 뉴스다 — 시계를 보게 만든다
      const n = this.shop.state.stock.length;
      if (n > 0) this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'inbox', title: `펌킨 상점 입고 — ${n}칸`, body: '오후 5시 새 진열. 상점에서 확인하자' });
    }
    if (this.tick === 0) {
      const a = this.certs.state.applied;
      if (a && a.judgeDay === this.day) this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: '오늘 15시 풀 심사', body: `${this.certs.defs.get(a.id)?.name ?? a.id} — 심사위원이 온다. 풀을 정돈하자` });
      if (this.clock.isWeekend) this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'inbox', title: '주말 — 손님이 몰린다', body: '입장이 평일의 1.6배. 라운지·매점을 채우자' });
    }
    // 아이템 만료 — 매 시간 정각에만 훑는다 (720 tick 마다 20개 × 풀 수는 싸지만 매 tick 은 낭비)
    if (this.tick % TICKS_PER_HOUR === 0) {
      // 소원은 창 안에 **한 번** 충족되면 성립 — 아이템이 사라지기 전에 매시간 표시해 둔다
      if (this.sns.activeWishes().length > 0) this.sns.markMet((w) => this.evaluateCondition(w.condition).met);
      this.expireItems();
    }
    this.tick++;
    if (this.tick >= TICKS_PER_DAY) this.closeDay();
  }

  private expireItems(): void {
    const now = this.absTick;
    for (const p of this.pools.all) {
      const before = p.items.length;
      p.items = p.items.filter((it) => it.expiresTick > now);
      if (p.items.length !== before) this.poolCache.delete(p.id);
    }
  }

  /** 친구가 나간다 — 그날의 만족이 곧 EXP (방문 2~3번에 ☆ 하나) */
  private friendLeaves(g: { friendId: string | null; sat: number }): void {
    if (!g.friendId) return;
    const w = this.sns.addFriendExp(g.friendId, Math.round(g.sat), this.day);
    if (w) this.announceWish(g.friendId, w);
  }

  private closeDay(): void {
    this.guests.flush((g) => this.friendLeaves(g));
    const staffDay = FEATURES.staff ? this.staff.closeDay(this.enteredTodayCount()) : { salary: 0, leveled: [] as ReturnType<StaffStore['closeDay']>['leveled'] };
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
      maintenance: maint,
      net: this.ticketsToday + this.feesToday + this.foodToday - maint,
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
      body: `방문 ${report.visitors}명 · 수입 ${(report.tickets + report.fees + report.food).toLocaleString('ko-KR')}G · 유지비 −${maint.toLocaleString('ko-KR')}G`,
      data: { ...report, popularity: this.parkPopularity(), rankPos: this.rankPosition(), cleanliness: Math.round(this.staff.cleanliness), salary: staffDay.salary },
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
          ...(bestPool ? [{ title: '올해의 풀', name: `풀 #${bestPool.id} (좋아요 ${bestPool.likes})` }] : []),
        ];
      }
      this.inbox.push({ tick: this.tick, day: this.day, kind: isYear ? 'year-summary' : 'season-summary', priority: 'modal', title: isYear ? `${c.year}년차 연말 결산` : `${c.year}년차 ${c.seasonName} 결산`, body: `방문 ${pr.visitors}명 · 순이익 ${pr.net.toLocaleString('ko-KR')}G${pr.rankPos > 0 ? ` · 전국 ${pr.rankPos}위` : ''}`, data: pr });
    }
    this.guests.resetDay();
    this.events.prune(this.day);
    // G57: 사건은 **내일** 개장에 제시·해결되므로 내일 날짜로 뽑는다 — 주말·계절 필터가 하루 어긋나던 버그
    if (FEATURES.randomEvents) { const nd = this.day + 1; const ev = this.events.roll(nd, seasonOf(nd), yearOf(nd), nd % 4 === 3); if (ev) this.pushChoice(ev); }
    this.facilities.resetDay();
    this.ticketsToday = 0;
    this.feesToday = 0;
    this.foodToday = 0;
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
    }
    if (this.day >= TOTAL_DAYS) {
      this.inbox.push({ tick: 0, day: this.day, kind: 'system', priority: 'modal', title: '8년차 겨울이 끝났다', body: '본편 종료 — 점수를 계산한다. 이어서 놀거나 뉴게임+ 로' });
    }
  }

  // ── 명령: 풀 ───────────────────────────────────────────────────────

  canDig(i: number, j: number): Result {
    if (!this.grid.inside(i, j)) return { ok: false, reason: '격자 밖' };
    if (!inRect(this.land, i, j)) return { ok: false, reason: '아직 내 땅이 아닙니다 — 랭크를 올리면 넓어집니다' };
    const g = this.gate;
    if (i === g.i && j === g.j) return { ok: false, reason: '입구는 팔 수 없습니다' };
    if (this.facilities.occupied(i, j)) return { ok: false, reason: '시설이 있는 칸입니다 — 먼저 철거하세요' };
    const f = this.grid.at(i, j);
    if (f === FLOOR.pool) return { ok: false, reason: '이미 풀입니다' };
    if (f !== FLOOR.grass && f !== FLOOR.path) return { ok: false, reason: '이 바닥에는 풀을 팔 수 없습니다' };
    return { ok: true };
  }

  canFill(i: number, j: number): Result {
    if (!this.grid.inside(i, j) || this.grid.at(i, j) !== FLOOR.pool) return { ok: false, reason: '풀이 아닙니다' };
    return { ok: true };
  }

  get tileDefs(): readonly TileDef[] { return TILE_DEFS; }
  tileDef(id: string): TileDef | undefined {
    return TILE_DEFS.find((t) => t.id === id);
  }

  digCost(tiles: readonly { i: number; j: number }[], tileId = 'standard'): number {
    return tiles.length * (this.tileDef(tileId)?.cost ?? this.b.poolTileCost);
  }

  fillCost(tiles: readonly { i: number; j: number }[]): number {
    return tiles.length * this.b.poolRemoveCost;
  }

  /** 풀 전체를 다른 타일로 갈아 깐다 (G37) — 원작의 후반 큰 지출. 비용 = 타일가 × 칸 수, 인기·유지비가 바뀐다 */
  retileCost(poolId: number, tileId: string): number {
    const p = this.pools.byId(poolId);
    return p ? p.tiles.length * (this.tileDef(tileId)?.cost ?? this.b.poolTileCost) : 0;
  }
  retilePool(poolId: number, tileId: string): Result {
    const p = this.pools.byId(poolId);
    if (!p) return { ok: false, reason: '풀이 없습니다' };
    const idx = TILE_INDEX.get(tileId);
    if (idx === undefined) return { ok: false, reason: '알 수 없는 타일' };
    if (!this.unlocked.tiles.has(tileId)) return { ok: false, reason: '아직 없는 타일입니다 — 인증 보상으로 얻는다' };
    if (p.tiles.every((k) => (this.grid.poolTile[k] ?? 0) === idx)) return { ok: false, reason: '이미 그 타일입니다' };
    const cost = this.retileCost(poolId, tileId);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    this.spend(cost);
    for (const k of p.tiles) this.grid.set(k % this.grid.w, Math.floor(k / this.grid.w), FLOOR.pool, idx);
    this.pools.bump();
    this.poolCache.delete(poolId);
    this.popCache = null;
    for (const k of p.tiles) this.fx.push({ kind: 'dig', i: k % this.grid.w, j: Math.floor(k / this.grid.w) });
    return { ok: true };
  }

  digPool(tiles: readonly { i: number; j: number }[], tileId = 'standard'): Result {
    if (tiles.length === 0) return { ok: false, reason: '팔 칸이 없습니다' };
    const tileIdx = TILE_INDEX.get(tileId);
    if (tileIdx === undefined) return { ok: false, reason: '알 수 없는 타일' };
    if (!this.unlocked.tiles.has(tileId)) return { ok: false, reason: '아직 없는 타일입니다 — 인증 보상으로 얻는다' };
    for (const t of tiles) {
      const r = this.canDig(t.i, t.j);
      if (!r.ok) return r;
    }
    const cost = this.digCost(tiles, tileId);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    if (this.breaksAccess(() => { for (const t of tiles) this.grid.set(t.i, t.j, FLOOR.pool); }, () => { for (const t of tiles) this.grid.set(t.i, t.j, FLOOR.grass); }, tiles.length)) {
      return { ok: false, reason: '입구에서 닿지 않는 곳이 생깁니다' };
    }
    this.spend(cost);
    for (const t of tiles) {
      this.grid.set(t.i, t.j, FLOOR.pool, tileIdx);
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
      this.grid.set(t.i, t.j, FLOOR.grass);
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

  // ── 명령: 아이템 ──────────────────────────────────────────────────

  canPutItem(poolId: number, itemId: string): Result {
    const p = this.pools.byId(poolId);
    const d = ITEM_DEFS.get(itemId);
    if (!p) return { ok: false, reason: '풀이 없습니다' };
    if (!d) return { ok: false, reason: '알 수 없는 아이템' };
    if (!this.isItemUnlocked(itemId)) return { ok: false, reason: '아직 구할 수 없는 아이템입니다' };
    if (p.items.length >= POOL_ITEM_CAP) return { ok: false, reason: `아이템은 풀당 ${POOL_ITEM_CAP}개까지` };
    if (d.price > this.money) return { ok: false, reason: `돈이 부족합니다 — ${d.price.toLocaleString('ko-KR')}G 필요` };
    return { ok: true };
  }

  putItem(poolId: number, itemId: string): Result {
    const r = this.canPutItem(poolId, itemId);
    if (!r.ok) return r;
    const p = this.pools.byId(poolId) as NonNullable<ReturnType<PoolStore['byId']>>;
    const d = ITEM_DEFS.get(itemId) as ItemDef;
    const colorBefore = this.poolState(poolId)?.color ?? 'clear';
    this.spend(d.price);
    p.items.push({ itemId, placedTick: this.absTick, expiresTick: this.itemExpiry(p, d) });
    this.poolCache.delete(poolId);
    // R2 (G30): 색이 바뀌면 그 풀의 좋아요가 0 — 「완성 풀을 갈아엎는 비용」. 만료·병합으로 바뀌는 것은 안 센다
    const colorAfter = this.poolState(poolId)?.color ?? 'clear';
    if (colorAfter !== colorBefore && p.likes > 0) {
      const lost = p.likes;
      p.likes = 0;
      this.poolCache.delete(poolId);
      this.inbox.push({ tick: this.tick, day: this.day, kind: 'system', priority: 'toast', title: `풀 #${poolId} 색이 바뀌었다`, body: `좋아요 ${lost.toLocaleString('ko-KR')} 이 0 으로 — 프리셋으로 되돌릴 수 있다` });
    }
    const k = p.tiles[0] ?? 0;
    this.fx.push({ kind: 'item', i: k % this.grid.w, j: Math.floor(k / this.grid.w), poolId });
    if (this.sns.activeWishes().length > 0) this.sns.markMet((w) => this.evaluateCondition(w.condition).met);
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
      year: this.clock.year, areas: this.sns.areas.length, recipes: this.cooking.known.size, money: this.money, ended: this.clock.ended,
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
    this.popCache = null;
    const bits: string[] = [];
    if (e.arrivalMul && e.days) bits.push(`손님 ×${e.arrivalMul} (${e.days}일)`);
    if (e.popBonus && e.days) bits.push(`인기 +${e.popBonus} (${e.days}일)`);
    if (e.likes) bits.push(`좋아요 +${e.likes}`);
    if (e.money) bits.push(`+${e.money.toLocaleString('ko-KR')}G`);
    if (e.clean) bits.push(`청결 ${e.clean > 0 ? '+' : ''}${e.clean}`);
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
    const st = this.staff.hire(roleId, { i: this.gate.i, j: this.gate.j - 1 });
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
  facilityPop(f: PlacedFacility): number { return popOf(this.facilities.defOf(f), f); }
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

  // ── 명령: 풀 프리셋 (G12) ────────────────────────────────────────────
  // 지금 풀에 살아 있는 아이템 목록을 이름 붙여 저장 → 나중에 한 번에 다시 산다.
  // 소원·인증이 풀을 바꾸게 만들어도 「원래 풀」로 돌아오는 비용이 탭 하나가 된다.

  savePreset(poolId: number): Result {
    const p = this.pools.byId(poolId);
    if (!p) return { ok: false, reason: '풀이 없습니다' };
    const items = p.items.filter((it) => it.expiresTick > this.absTick).map((it) => it.itemId);
    if (items.length === 0) return { ok: false, reason: '넣어 둔 아이템이 없습니다' };
    if (this.presets.length >= MAX_PRESETS) this.presets.shift();
    this.presets.push({ name: `프리셋 ${this.presetSerial++}`, items });
    return { ok: true };
  }

  presetCost(idx: number): number {
    const p = this.presets[idx];
    if (!p) return 0;
    return p.items.reduce((a, id) => a + (ITEM_DEFS.get(id)?.price ?? 0), 0);
  }

  /** 프리셋의 아이템을 순서대로 다시 넣는다. 도중에 막히면 거기까지만 넣고 이유를 돌려준다 */
  applyPreset(poolId: number, idx: number): Result {
    const p = this.presets[idx];
    if (!p) return { ok: false, reason: '프리셋이 없습니다' };
    if (!this.pools.byId(poolId)) return { ok: false, reason: '풀이 없습니다' };
    const cost = this.presetCost(idx);
    if (cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${cost.toLocaleString('ko-KR')}G 필요` };
    let placed = 0;
    for (const id of p.items) {
      const r = this.putItem(poolId, id);
      if (!r.ok) return { ok: false, reason: placed > 0 ? `${placed}개 넣고 중단 — ${r.reason}` : r.reason };
      placed++;
    }
    return { ok: true };
  }

  removePreset(idx: number): void {
    this.presets.splice(idx, 1);
  }

  // ── 명령: 시설 ────────────────────────────────────────────────────

  canPlace(defId: string, i: number, j: number, facing: 0 | 1 = 0, opts: { inherited?: boolean } = {}): Result {
    const def = FACILITY_DEFS.get(defId);
    if (!def) return { ok: false, reason: FACILITY_FAIL_KO.unknown };
    if (!opts.inherited && !this.isUnlocked(defId)) return { ok: false, reason: '아직 해금되지 않은 시설입니다' };
    const r = this.facilities.check(defId, i, j, facing, this.land, this.gate);
    if (!r.ok) return { ok: false, reason: FACILITY_FAIL_KO[r.fail] };
    // 실내 전용 (G36, §1.4 이글루·사우나) — 발자국 전부가 실내 바닥이어야 한다
    if (def.indoorOnly && FacilityStore.footprint(def, i, j, facing).some((t) => this.grid.at(t.i, t.j) !== FLOOR.indoor)) return { ok: false, reason: '실내 바닥 위에만 놓을 수 있습니다 — 풀 편집 → 실내 바닥' };
    if (!opts.inherited && def.cost > this.money) return { ok: false, reason: `돈이 부족합니다 — ${def.cost.toLocaleString('ko-KR')}G 필요` };
    return { ok: true };
  }

  /** `inherited` — 시작 킷(G25): 해금·돈을 안 본다. 물려받은 것은 다시 지을 수 없다는 뜻이기도 하다 */
  placeFacility(defId: string, i: number, j: number, facing: 0 | 1 = 0, opts: { inherited?: boolean } = {}): Result & { uid?: number } {
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
    if (!opts.inherited) this.spend(def.cost);
    this.fx.push({ kind: 'place', i, j });
    this.afterWorldChange();
    this.guests.evictFrom(FacilityStore.footprint(def, i, j, facing)); // G57: 발자국 위 손님을 옆 칸으로
    return { ok: true, uid: placed.uid };
  }

  /** 이동 (G52, 원작 이동 도구 — 첫 심사 합격 뒤 사장 선물). 돈은 안 든다: 도구 자체가 값이다 */
  canMoveFacility(uid: number, i: number, j: number, facing: 0 | 1): Result {
    const f = this.facilities.byUid(uid);
    if (!f) return { ok: false, reason: '시설이 없습니다' };
    if (!this.tools.has('move')) return { ok: false, reason: '이동 도구가 없습니다 — 첫 심사 합격 뒤 사장이 보낸다' };
    if (f.i === i && f.j === j && f.facing === facing) return { ok: false, reason: '같은 자리입니다 — 지도를 탭해 옮길 곳을 고르세요' };
    const def = this.facilities.defOf(f);
    const r = this.facilities.check(def.id, i, j, facing, this.land, this.gate, uid);
    if (!r.ok) return { ok: false, reason: FACILITY_FAIL_KO[r.fail] };
    if (def.indoorOnly && FacilityStore.footprint(def, i, j, facing).some((t) => this.grid.at(t.i, t.j) !== FLOOR.indoor)) return { ok: false, reason: '실내 바닥 위에만 놓을 수 있습니다 — 풀 편집 → 실내 바닥' };
    return { ok: true };
  }

  moveFacility(uid: number, i: number, j: number, facing: 0 | 1): Result {
    const r = this.canMoveFacility(uid, i, j, facing);
    if (!r.ok) return r;
    const f = this.facilities.byUid(uid) as PlacedFacility;
    const def = this.facilities.defOf(f);
    const from = { i: f.i, j: f.j, facing: f.facing };
    const broke = this.breaksAccess(
      () => { this.facilities.move(uid, i, j, facing); },
      () => { this.facilities.move(uid, from.i, from.j, from.facing); },
      FacilityStore.footprint(def, i, j, facing).length,
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
    return { ok: true };
  }

  removeFacility(uid: number): Result {
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
    this.facilities.remove(uid);
    this.menus.drop(uid);
    this.menuVersion++;
    this.spend(cost);
    this.fx.push({ kind: 'remove', i: f.i, j: f.j });
    this.afterWorldChange();
    return { ok: true };
  }

  // ── 내부 ──────────────────────────────────────────────────────────

  private afterWorldChange(): void {
    this.pools.recompute();
    this.guests.invalidate();
    this.poolCache.clear();
  }

  /**
   * 변경을 적용해 보고 되돌린다 — 입구에서 **닿지 않게 되는** 풀·시설이 생기거나, 걸을 수 있는 땅이
   * 발자국보다 더 많이 끊기면(= 어딘가를 봉쇄) true. "지금 안 닿는다" 가 아니라 **전후 비교**다:
   * 이미 끊긴 판에서도 되돌릴 방법이 남아야 한다.
   */
  private breaksAccess(apply: () => void, revert: () => void, allowedLoss: number): boolean {
    const before = this.reachability();
    apply();
    const probe = new PoolStore(this.grid);
    probe.recompute();
    const after = this.reachability(probe);
    revert();
    return after.unreachable > before.unreachable || before.reachableTiles - after.reachableTiles > allowedLoss;
  }

  private reachability(pools: PoolStore = this.pools): { unreachable: number; reachableTiles: number } {
    const walk = (i: number, j: number): boolean => {
      const f = this.grid.at(i, j);
      return (f === FLOOR.grass || f === FLOOR.path || f === FLOOR.indoor) && !this.facilities.occupied(i, j);
    };
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
        if (!this.grid.inside(ni, nj) || !walk(ni, nj)) continue;
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
      if (!touches(FacilityStore.footprint(this.facilities.defOf(f), f.i, f.j, f.facing))) n++;
    }
    return { unreachable: n, reachableTiles: q.length };
  }

  // ── 스냅샷 ────────────────────────────────────────────────────────

  toSnapshot(): GameSnapshot {
    return {
      version: 1,
      seed: this.seed,
      rng: Object.fromEntries(Object.entries(this.rng).map(([k, r]) => [k, r.state])) as Record<RngStream, number>,
      clock: { day: this.day, tick: this.tick },
      money: this.money,
      rank: this.rank,
      grid: { w: this.grid.w, h: this.grid.h, floor: Array.from(this.grid.floor), poolTile: Array.from(this.grid.poolTile) },
      pools: this.pools.toSnapshot(),
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
      invest: [...this.investDone].sort(),
      investPending: this.investPending.map((p) => ({ ...p })),
      campaigns: this.campaigns.toSnapshot(),
      busQueue: this.busQueue.map((p) => ({ ...p })),
      busesToday: this.busesToday.map((p) => ({ ...p })),
      busState: this.busState ? { ...this.busState } : null,
      weather: this.weather,
      ticketBonus: this.ticketBonus,
      endingSeen: this.endingSeen,
      presets: this.presets.map((p) => ({ name: p.name, items: [...p.items] })),
      story: this.story.toSnapshot(),
      staff: this.staff.toSnapshot(),
      randomEvents: this.events.toSnapshot(),
      // G57: 하루 중간 왕복에서 그날 결산이 줄어들던 결손 — 오늘 누적 셋 + 프리셋 번호 + 손님 입퇴장 수도 같이
      dayAccum: { satSum: this.satSum, satN: this.satN, menuSalesToday: { ...this.menuSalesToday }, likesAtDayStart: this.likesAtDayStart, ticketsToday: this.ticketsToday, feesToday: this.feesToday, foodToday: this.foodToday, presetSerial: this.presetSerial, enteredToday: this.guests.enteredToday, leftToday: this.guests.leftToday },
      prevSatAvg: this.prevSatAvg,
      stats: { visitors: this.stats.visitors, tickets: this.stats.tickets, fees: this.stats.fees, food: this.stats.food, spent: this.stats.spent, bailouts: this.stats.bailouts, busGuests: this.stats.busGuests, wishDone: this.stats.wishDone, wishExpired: this.stats.wishExpired, days: this.stats.days.map((d) => ({ ...d })), menuSales: { ...this.stats.menuSales } },
      unlocked: { facilities: [...this.unlocked.facilities].sort(), items: [...this.unlocked.items].sort(), gifts: [...this.unlocked.gifts].sort(), tiles: [...this.unlocked.tiles].sort() },
      friendsToday: [...this.friendsToday],
    };
  }

  static fromSnapshot(s: GameSnapshot, b: Balance = defaultBalance): Game {
    const g = new Game(s.seed, b, { kit: false });
    for (const k of Object.keys(RNG_SALTS) as RngStream[]) g.rng[k].setState(s.rng[k]);
    g.day = s.clock.day;
    g.tick = s.clock.tick;
    g.money = s.money;
    g.rank = s.rank;
    g.grid.floor.set(s.grid.floor);
    if (s.grid.poolTile) g.grid.poolTile.set(s.grid.poolTile);
    g.facilities.fromSnapshot(s.facilities);
    g.pools.fromSnapshot(s.pools);
    g.guests.fromSnapshot(s.guests);
    g.inbox.fromSnapshot(s.inbox);
    g.stats = { visitors: s.stats.visitors, tickets: s.stats.tickets, fees: s.stats.fees ?? 0, food: s.stats.food ?? 0, spent: s.stats.spent ?? 0, bailouts: s.stats.bailouts ?? 0, busGuests: s.stats.busGuests ?? 0, wishDone: s.stats.wishDone ?? 0, wishExpired: s.stats.wishExpired ?? 0, days: s.stats.days.map((d) => ({ ...d })), menuSales: { ...(s.stats.menuSales ?? {}) } };
    for (const id of s.unlocked?.facilities ?? []) g.unlocked.facilities.add(id);
    for (const id of s.unlocked?.items ?? []) g.unlocked.items.add(id);
    for (const id of s.unlocked?.gifts ?? []) g.unlocked.gifts.add(id);
    for (const id of s.unlocked?.tiles ?? []) g.unlocked.tiles.add(id);
    g.sns.fromSnapshot(s.sns);
    if (s.certs) g.certs.fromSnapshot(s.certs);
    if (s.shop) g.shop.fromSnapshot(s.shop);
    for (const id of s.calendarGiven ?? []) g.calendarGiven.add(id);
    g.firstCertPassDay = s.firstCertPassDay ?? null;
    for (const id of s.tools ?? []) g.tools.add(id);
    if (s.menus) g.menus.fromSnapshot(s.menus);
    if (s.cooking) g.cooking.fromSnapshot(s.cooking);
    for (const id of s.invest ?? []) g.investDone.add(id);
    g.investPending = (s.investPending ?? []).map((p) => ({ ...p }));
    if (s.campaigns) g.campaigns.fromSnapshot(s.campaigns);
    g.busQueue = (s.busQueue ?? []).map((p) => ({ ...p }));
    g.busesToday = (s.busesToday ?? []).map((p) => ({ ...p }));
    g.busState = s.busState ? { ...s.busState } : null;
    if (s.weather) g.weather = s.weather;
    g.ticketBonus = s.ticketBonus ?? 0;
    g.prevSatAvg = s.prevSatAvg ?? 0;
    g.endingSeen = s.endingSeen ?? false;
    g.presets = (s.presets ?? []).map((p) => ({ name: p.name, items: [...p.items] }));
    g.story.fromSnapshot(s.story);
    g.staff.fromSnapshot(s.staff);
    g.events.fromSnapshot(s.randomEvents);
    if (s.dayAccum) { g.satSum = s.dayAccum.satSum; g.satN = s.dayAccum.satN; g.menuSalesToday = { ...s.dayAccum.menuSalesToday }; g.likesAtDayStart = s.dayAccum.likesAtDayStart; g.ticketsToday = s.dayAccum.ticketsToday ?? 0; g.feesToday = s.dayAccum.feesToday ?? 0; g.foodToday = s.dayAccum.foodToday ?? 0; g.presetSerial = s.dayAccum.presetSerial ?? g.presets.length + 1; g.guests.enteredToday = s.dayAccum.enteredToday ?? 0; g.guests.leftToday = s.dayAccum.leftToday ?? 0; }
    g.friendsToday = [...(s.friendsToday ?? [])];
    return g;
  }
}

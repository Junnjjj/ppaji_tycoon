/**
 * 데이터 계약 — `src/data/*.json` 의 모양 (불변식 3: 시설·아이템·계절표는 코드가 아니라 데이터다).
 *
 * 이 파일은 **타입만** 둔다 (런타임 코드 0). 열거값의 런타임 목록이 필요하면
 * `data.test.ts` 처럼 `satisfies` 로 이 타입에 묶어서 각자 들 것.
 * 근거는 `../docs/plan-waterpark-clone.md` §1.3(계절표) · §1.4(시설 전표) · §2.2(코어 모델) · §2.6(플레이스홀더).
 */

export type FacilityClass = 'utility' | 'lounging' | 'restaurant' | 'attraction' | 'slide' | 'decor';

/** 12향 (§1.3). `money` 는 골든 카이로봇·공연 카이로봇만 낸다 */
export type Scent =
  | 'citrus'
  | 'floral'
  | 'pine'
  | 'fruity'
  | 'tropical'
  | 'berry'
  | 'marine'
  | 'cookie'
  | 'spices'
  | 'milky'
  | 'coffee'
  | 'money';

/** 9색 (§1.3). `rainbow`·`clear` 는 파생 상태라 아이템은 못 낸다 — 계절표에만 있다 */
export type PoolColor = 'orange' | 'yellow' | 'lime' | 'green' | 'blue' | 'purple' | 'pink' | 'red' | 'white';

/** 봄·여름·가을·겨울 순 (`season = floor(day/4)%4`, §2.2) */
export type SeasonVec = [number, number, number, number];

export type UnlockSource = 'start' | 'shop' | 'wish' | 'cert' | 'invest' | 'rank' | 'gift';

export interface FacilityUnlock {
  source: UnlockSource;
  /** `wish:{friend}/{idx}` · `cert:{id}` · `invest:{id}` · `gift:{calendarId}` 의 뒷부분 */
  ref?: string;
  /** `shop` 의 상점 티어 · `rank` 의 보상 랭크 (★1~5) */
  rank?: number;
}

export interface FacilityDef {
  id: string;
  name: string;
  class: FacilityClass;
  /** 발자국 (타일) */
  w: number;
  d: number;
  /** 건설비 G — 위키 회귀 `cost/pop ≈ 90` (식당은 ≈ 35, 카이로봇 예외) */
  cost: number;
  pop: number;
  /** 유지비 G/일 — `pop × 5.3`, 대형 슬라이드만 `× 7.2` */
  maint: number;
  /** 상점 진열가 — 모르면 `cost × 2.2` */
  shopPrice: number;
  /** 동시 이용 인원. 장식은 0 (손님이 쓰지 않는다) */
  capacity: number;
  /** 한 번 이용에 걸리는 시간(분 단위 데이터) — sim 이 `TICK_SCALE` 로 tick 으로 바꾼다 */
  useTicks: number;
  /** 이용 뒤 손님 HP 변화 — 라운지 +25(유료 +50) · 식당 0(음식이 따로 준다) · 나머지 음수 */
  hpDelta: number;
  /** 인접 풀에 주는 향 (§1.3 "아이템 + 인접 시설 중 가장 센 것 하나") */
  scent: Scent | null;
  scentPower: number;
  /** 풀 SE 기여 (제트풀·핫텁만) */
  se: number;
  /** 풀 AB 기여 — `sprays` 인 것만 > 0 */
  ab: number;
  /** 물을 뿌리는가 (샤워·분수·소커·머라이언·제트) */
  sprays: boolean;
  /** 인접 풀 온도 Δ — 핫텁 +4 · 사우나 +6 · 이글루 −6 */
  heat: number;
  /** 유료 라운지의 하루 대여료 (0 = 무료) */
  usageFee: number;
  /** 계절별 인기 보너스 (봄·여름·가을·겨울) */
  season: SeasonVec;
  /** P3 — 에셋 계약(`docs/ppaji-asset-contract.md`): 그림 방향 수 (기본 2 = 뒤집기). 4 는 네 방향 그림 */
  facings?: 2 | 4;
  /** 나오는 칸이 입구와 다른 시설만 (슬라이드·에어바운스). 없으면 입구로 나온다 */
  exit?: { i: number; j: number } | null;
  indoorOnly: boolean;
  /** P17 그늘 — 자리 값 +1 (파라솔·그늘막·정자·방갈로 …) */
  shade?: boolean;
  /** P18 숙박 — 자리로 잡으면 손님이 밤을 지내고 다음 날 이어서 논다 (1박 요금 = usageFee/인) */
  lodging?: boolean;
  unlock: FacilityUnlock;
  /** 대형 슬라이드만 — 층수·길이 (§1.4) */
  slide: { levels: number; length: number } | null;
  /** 식당 5 · 나머지 0 (§2.2) */
  menuSlots: number;
  desc: string;
}

/** 풀 아이템 (§2.6 플레이스홀더 24종). 색·향·온도를 바꾸고 `hours` 뒤 소멸한다 */
export interface ItemDef {
  id: string;
  name: string;
  color: PoolColor | null;
  /** 색 가중치 — 색이 없으면 0, 진한 것(포도·블루베리)은 2 */
  colorWeight: number;
  scent: Scent | null;
  scentPower: number;
  /** 풀 온도 Δ (°C) */
  tempDelta: number;
  /** 지속 일수 (G42, 원작: 「넣은 시점부터 2계절+1일 = 7일, 개수 무관」) — 같은 풀에 또 넣어도 만료가 안 늘어난다 */
  days: number;
  price: number;
  unlock: 'start' | 'shop' | 'wish' | 'cert';
}

/** §1.3 계절표 — 값을 옮겨 적은 것이므로 손으로 바꾸지 말 것 */
export interface SeasonTables {
  colors: Record<PoolColor | 'rainbow' | 'clear', SeasonVec>;
  scents: Record<Scent, SeasonVec>;
  /** 야외 풀 기본 수온 (봄·여름·가을·겨울) */
  ambientOutdoor: SeasonVec;
  /** 실내 풀 기본 수온 (계절 무관) */
  ambientIndoor: number;
  /** 햇빛 SE (봄·여름·가을·겨울) */
  sun: SeasonVec;
  /** 계절별 이상 수온 (G42, 원작: 「季節によって理想の温度」 — 가까울수록 체류가 길다) */
  idealTemp: SeasonVec;
  idealIndoor: number;
}

// ── G4: 조건 DSL · 지역 · 친구 · 소원 · 선물 ──────────────────────────────

/** 소원·인증·랭크가 공유하는 조건. 한 평가기(`sim/condition.ts`)가 전부 안다 */
export type Condition =
  | { kind: 'pool'; count?: number; sizeMin?: number; sizeMax?: number; color?: PoolColor | 'rainbow'; scent?: Scent; tempMin?: number; tempMax?: number; likesMin?: number; intensityMin?: number; outdoor?: boolean; indoor?: boolean; popMin?: number; /** 풀 타일의 절반 이상이 이 종류 (G35, §2.3 `pool{tile}`) */ tile?: string }
  | { kind: 'poolTotalSize'; min: number }
  | { kind: 'facility'; id: string; count?: number; adjacentPool?: boolean }
  | { kind: 'facilityAdjacent'; ids: [string, string]; count?: number }
  | { kind: 'facilityClass'; class: FacilityClass; count?: number }
  | { kind: 'item'; id: string; count?: number; /** §2.3 `item{active}` — 풀 뷰가 이미 살아 있는 아이템만 담으므로 언제나 참 (G38) */ active?: boolean }
  | { kind: 'recipe'; id: string; served?: boolean }
  | { kind: 'recipeCount'; min: number }
  | { kind: 'popularity'; min: number }
  | { kind: 'likes'; min: number; scope?: 'total' | 'area'; area?: string }
  | { kind: 'certPasses'; min: number }
  | { kind: 'certPassed'; id: string }
  | { kind: 'friends'; min: number }
  | { kind: 'areas'; min: number }
  | { kind: 'rank'; min: number }
  | { kind: 'gift'; id: string; friendId?: string }
  | { kind: 'cookingLevel'; min: number }
  | { kind: 'visitors'; min: number }
  | { kind: 'money'; min: number }
  | { kind: 'year'; min: number }
  /** 스릴이 min 이상인 견인 코스가 count(기본 1)개 (P6 — 인증 「스릴」 계열) */
  | { kind: 'courseThrill'; min: number; count?: number }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] };

/** 출신지 취향 (P9) — 목표 고르기 가중치 배수(1 = 보통) · 선호 수온 치우침(°C) */
export interface AreaTaste {
  water: number;
  thrill: number;
  food: number;
  rest: number;
  tempBias: number;
}

export interface AreaDef {
  id: string;
  name: string;
  /** 출신지 취향 (P9) — 없으면 전부 1 */
  taste?: AreaTaste;
  /** 이 순서대로 열린다 — 앞 지역 좋아요 1,000 */
  order: number;
  /** 지역별 좋아요 문턱 (기본 1000) */
  likesToUnlockNext: number;
  /** 그 출신지에서 오는 버스 이름 (P5 — 「MT 전세버스」) · 한 줄 소개 */
  bus?: string;
  desc?: string;
  /** 좋아요가 이만큼 쌓일 때마다 다음날 아침 그 지역에서 버스 1대 (G40, 원작: 「いいねが一定になると翌朝バス」 — 계속 온다) */
  busEvery?: number;
  /** 좋아요 문턱 보상 — 주민들의 감사 선물 (G33) */
  likeRewards?: { at: number; grant: { kind: 'item' | 'money' | 'gift' | 'facility'; id?: string; amount?: number } }[];
}

export interface FriendDef {
  id: string;
  name: string;
  area: string;
  age: number;
  gender: 'M' | 'F';
  fav: { color: PoolColor; scent: Scent; food: string };
  /** 처음부터 오는 친구 */
  start: boolean;
  /** 앞 친구의 ★ 단계(1~3) 달성으로 초대된다 */
  invitedBy: { friend: string; star: 1 | 2 | 3 } | null;
  /** 손님 도트 팔레트 0~7 */
  palette: number;
}

export type WishReward =
  | { kind: 'facility'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'gift'; id: string }
  | { kind: 'money'; amount: number }
  | { kind: 'ingredient'; id: string }
  | { kind: 'tile'; id: string };

export interface WishDef {
  friendId: string;
  /** 0·1·2 = ☆·☆☆·☆☆☆ */
  idx: 0 | 1 | 2;
  condition: Condition;
  reward: WishReward;
  /** 소원 문장 (한국어, 「…해 줘」) */
  line: string;
}

/** 선물 — 수영복·튜브. 친구에게 주면 만족 EXP 가 오른다 (돈 → 진행 교환창) */
export interface GiftDef {
  id: string;
  name: string;
  kind: 'swimsuit' | 'float';
  price: number;
  unlock: 'start' | 'shop' | 'cert' | 'wish';
}

// ── G5: 인증 · 랭크 · 상점 · 사장 달력 · 풀 타일 ───────────────────────────

export type CertFamily = 'grade' | 'color' | 'scent' | 'spa' | 'fruit' | 'stream' | 'fun' | 'cutesy';
export type CertGrade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface CertDef {
  id: string;
  name: string;
  family: CertFamily;
  grade: CertGrade;
  /** 합격선 15·17·20·22·25 (30 만점) */
  pass: number;
  /** 같은 계열의 아래 등급 — 먼저 통과해야 신청할 수 있다 */
  requires: string | null;
  /** 2~3개. weight 2 = 「(2x)」 */
  conditions: { cond: Condition; weight: 1 | 2 }[];
  /** 첫 통과 보상 */
  reward: { kind: 'tile' | 'gift' | 'facility' | 'item'; id: string };
  /** 신청료 */
  fee: number;
}

export interface RankDef {
  star: number;
  name: string;
  conditions: Condition[];
  /** 랭크업 보상 (시설 해금 등) */
  reward?: { kind: 'facility' | 'gift' | 'item' | 'money' | 'unlock'; id?: string; amount?: number };
}

export interface ShopEntry {
  id: string;
  kind: 'facility' | 'item' | 'gift';
  ref: string;
  /** 해금 가격 (시설은 shopPrice, 아이템·선물은 정가×3) */
  price: number;
  /** 이 랭크부터 진열 */
  tier: number;
}

export interface CalendarEvent {
  id: string;
  /** 1부터 */
  year: number;
  /** 0 봄 · 1 여름 · 2 가을 · 3 겨울 */
  season: number;
  /** 0..3 (3 = 주말) */
  dayInSeason: number;
  /** 하루 안의 tick (0 = 개장) */
  tick: number;
  /** 사장 · 협회 심사관 */
  from: 'president' | 'judge';
  title: string;
  line: string;
  grant: { kind: 'facility' | 'gift' | 'item' | 'money' | 'tool' | 'ingredient'; id?: string; amount?: number };
  /** 사건 채널 — 기본 modal. 연출용(불꽃·조명)은 inbox (G27) */
  priority?: 'modal' | 'inbox';
  /** 첫 인증 합격일 + N일에 온다 (G43, 원작: 「배치 전환 = 첫 합격 후 9일째」). 있으면 year/season/dayInSeason 은 안 본다 */
  afterCertDays?: number;
  /** 조건 — 있으면 이때까지 충족돼야 온다 (첫 인증 뒤 등) */
  when?: Condition;
}

export interface TileDef {
  id: string;
  name: string;
  /** 타일당 인기 */
  pop: number;
  /** 타일당 비용 */
  cost: number;
  unlock: 'start' | 'cert';
  /** CSS 토큰 접미 (`--tile-pool-<look>`) */
  look: string;
}

// ── G6·G7: 식당 메뉴 · 레시피 · 재료 · 궁합 ───────────────────────────────

export type FoodCategory = 'drink' | 'snack' | 'meal' | 'dessert';

export type IngredientClass = 'fruit' | 'dairy' | 'grain' | 'meat' | 'seafood' | 'veg' | 'sweet' | 'nut' | 'base';
export const INGREDIENT_CLASSES: readonly IngredientClass[] = ['fruit', 'dairy', 'grain', 'meat', 'seafood', 'veg', 'sweet', 'nut', 'base'];

export interface IngredientDef {
  id: string;
  name: string;
  /** 영구 열쇠 — 한 번 얻으면 계속 쓴다 */
  unlock: 'start' | 'shop' | 'wish' | 'cert' | 'year';
  /** unlock:'year' 면 몇 년차 개장에 지급 */
  year?: number;
  /** 재료 등급 — 레시피 와일드카드 `@fruit` 가 이걸로 맞춘다 (G41, 원작 「과일」 슬롯) */
  class?: IngredientClass;
  /** 상점 해금가 */
  price?: number;
}

/** 공방 부품 계열 8 (P7) — 기구 레시피 와일드카드 `@engine` 이 이걸로 맞춘다 */
export type PartClass = 'engine' | 'tube' | 'rope' | 'handle' | 'seat' | 'safety' | 'board' | 'fun';
/** 기구 성격 (P7) */
export type GearCategory = 'tube' | 'board' | 'ski' | 'special';
/** 공방 부품 (P7, `parts.json`) — 재료와 같은 문법의 영구 열쇠 */
export interface PartDef {
  id: string;
  name: string;
  unlock: 'start' | 'shop' | 'year' | 'cert';
  year?: number;
  class: PartClass;
  price?: number;
}
/** 기구 레시피 (P7, `gears.json`) — `id` 는 `equipment.json` 의 기구 id (발견 = 소유). fail 은 실패작(기구 아님) */
export interface GearDef {
  id: string;
  name: string;
  cat: GearCategory;
  key: string;
  /** 스릴 느낌 · 외관 · 인기 (1~10) */
  taste: number;
  look: number;
  pop: number;
  unlock: 'start' | 'cook' | `level:${number}` | 'fail';
  upgradeOf?: { base: string; add: string[] }[];
}

/** 인접 콤보 (P16) */
export interface ComboDef {
  id: string;
  name: string;
  /** 두 시설 id — 둘이 radius 안에 있으면 발동 */
  pair: [string, string];
  radius: number;
  /** 두 시설을 쓰는 손님 만족 가산 */
  sat: number;
  /** 식당 쪽 판매가 % */
  revenue: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  cat: FoodCategory;
  /** 정렬된 재료 다중집합 키 — `egg+flour+milk` (같은 재료 반복 허용, 2~5개) */
  key: string;
  taste: number;
  look: number;
  pop: number;
  /** start = 처음부터 도감에 · cook = 개발로 발견 · level = 요리 레벨 n 부터 발견 가능 · fail = 실패작(키 조회 안 함, G41) */
  unlock: 'start' | 'cook' | `level:${number}` | 'fail';
  /** 강화 사슬 (G41, 원작 「기존 레시피에 재료를 더 넣으면 상위 요리」) — base 레시피 재료 + add 가 이 요리 */
  upgradeOf?: { base: string; add: string[] }[];
}

/** 식당 × 메뉴 궁합 — 희소: 적힌 것만 ⊚/△, 나머지는 ◯ */
export interface CompatDef {
  restaurant: string;
  good: string[];
  bad: string[];
}

// ── G8: 투자 · 캠페인 ─────────────────────────────────────────────────────

export interface InvestDef {
  id: string;
  track: 'attraction' | 'lounge';
  /** 트랙 안 순서 — 앞 단계를 먼저 해야 한다 */
  order: number;
  name: string;
  cost: number;
  /** 해금되는 시설 id (다음날 개장에) */
  unlocks: string[];
}

export interface CampaignDef {
  id: string;
  name: string;
  cost: number;
  /** 유입 배율 */
  mul: number;
  /** 효과 일수 */
  days: number;
  /** 다시 쓸 수 있기까지 (효과 시작일 기준) */
  cooldown: number;
  desc: string;
  /** ad = 유입 배수 · bus = 지역을 골라 아침마다 버스 (G33) */
  kind?: 'ad' | 'bus';
}

/** P17 패키지 (D25) — 팀이 자리를 잡으면 하나를 사서 미리 낸다. `needs` 가 판에 없으면 안 판다 */
export interface PackageDef {
  id: string;
  name: string;
  needs: 'restaurant' | 'course' | 'pool';
  /** 1인 값 (G) — `course` 는 기구 요금 × feeMul */
  price: number;
  feeMul?: number;
  taste: 'food' | 'thrill' | 'water';
  sat: number;
  hp: number;
  desc: string;
}

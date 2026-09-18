/**
 * 데이터 계약 — `src/data/*.json` 의 모양 (불변식 3: 시설·재료·계절표는 코드가 아니라 데이터다).
 *
 * P60-a (D71): 풀 색·향·소품 정의(세 타입)·프리셋·색/향 취향은 게임에서 뺐다 — 남는 물성은 **계절 수온**
 * (`SeasonTables.ambient*`·`idealTemp`, 시설 `heat`) 하나다. 이관 스크립트 `tools/migrate-wishes.mjs`.
 *
 * 이 파일은 **타입만** 둔다 (런타임 코드 0). 열거값의 런타임 목록이 필요하면
 * `data.test.ts` 처럼 `satisfies` 로 이 타입에 묶어서 각자 들 것.
 * 근거는 `../docs/plan-waterpark-clone.md` §1.3(계절표) · §1.4(시설 전표) · §2.2(코어 모델) · §2.6(플레이스홀더).
 */

export type FacilityClass = 'utility' | 'lounging' | 'restaurant' | 'attraction' | 'slide' | 'decor' | 'rig'; // P48-c R3: 빠지 기구 — 물 위(링) 전용, 정의는 P49-a1 부터

/** 봄·여름·가을·겨울 순 (`season = floor(day/4)%4`, §2.2) */
export type SeasonVec = [number, number, number, number];

export type UnlockSource = 'start' | 'shop' | 'wish' | 'cert' | 'invest' | 'rank' | 'gift' | 'craft'; // P49-a1: 'craft' = 개조판(공방에서 만든다, 건설 목록에 없다)

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
  /** P58-a — 파생 시설: 영역(푸드코트)이 자동으로 놓는다. 건설 창·봇·해금 목록에 안 뜨고 `facilities.place` 로만 생긴다 */
  derived?: boolean;
  /** P45-b D63 — 야외 식당: 실내 바닥 위엔 못 놓는다(복도 점포는 실내 전용만) */
  outdoorOnly?: boolean;
  /** P45-b D63 — 복도 곁이면 지나가는 손님이 산다: 입장(enter)·퇴장(leave)·둘 다 */
  passBy?: 'enter' | 'leave' | 'both';
  /** P17 그늘 — 자리 값 +1 (파라솔·그늘막·정자·방갈로 …) */
  shade?: boolean;
  /** P18 숙박 — 자리로 잡으면 손님이 밤을 지내고 다음 날 이어서 논다 (1박 요금 = usageFee/인) */
  lodging?: boolean;
  /** P24 D32 — 반경 안 자리 등급을 깎는다: dirty(화장실) · loud(무대·노래방·오락기; 슬라이드는 class 로) */
  noisy?: 'dirty' | 'loud';
  /** P25 — 불(화로대·BBQ): 1박 패키지의 재료 */
  fire?: boolean;
  /** P26 D32 — 경관(장식 시설, 4~16, 온천 스토리 눈금): 반경 2 안 시설 전부의 인기·판매가에 붙는다 */
  scenery?: number;
  unlock: FacilityUnlock;
  // ── P49-a1 §14 R3 — 빠지 기구 필드 13 (전부 optional; class:'rig' 은 depth 필수 — validateRigData) ──
  /** 링(데크) 위에 놓는 시설 — 물 위 기구가 아니라 링 위 시설(망루·거치대·플로팅 바·구조정·선착장·대여소) */
  onRing?: boolean;
  /** 물 위 기구가 서는 깊이 — 여울(shallow)·강(deep)·둘 다(any). needsVest ⇔ deep */
  depth?: 'shallow' | 'deep' | 'any';
  /** 계열 — 같은 계열을 이어 붙이면 정원이 는다(P50-b1 chainScale). null 이면 단독 */
  chain?: string | null;
  /** 스릴 0~4 · 안전 0~4 (safe = 2 − floor(thrill/2)) */
  thrill?: number;
  safe?: number;
  /** 깊은 물 기구 — 구명조끼 팔찌가 있어야 탄다(P52-a) */
  needsVest?: boolean;
  /** 둘이 타는 기구 — 팀 손님 우선 */
  team?: boolean;
  /** 밤 조명 — 시그니처 빠지(등급 4) 조건 */
  lights?: boolean;
  /** P55 — 그림 폴백 실루엣: 높은 물체(망루·다이빙대·점프 타워·토템·빙산) → `tower` */
  tall?: boolean;
  /** 안전 시설의 반경 — 그 안 기구의 사고율을 줄인다(P52-b) */
  guardRadius?: number;
  /** 대여 종류 — 패키지(pkg) · 탑승(ride) */
  rentKind?: 'pkg' | 'ride';
  /** false = 건설 목록에 없다(개조판, unlock.source 'craft') */
  buildable?: boolean;
  /** 빠지마다 최대 개수 */
  maxPerPark?: number;
  /** 팔찌 값 1|2 */
  bandCost?: 1 | 2;
  /** 대형 슬라이드만 — 층수·길이 (§1.4) */
  slide: { levels: number; length: number } | null;
  /** 식당 5 · 나머지 0 (§2.2) */
  menuSlots: number;
  desc: string;
}

/** §1.3 계절표 — 값을 옮겨 적은 것이므로 손으로 바꾸지 말 것. P60-a: 색·향 표는 뺐다(수온·햇빛만) */
export interface SeasonTables {
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
  | { kind: 'pool'; count?: number; sizeMin?: number; sizeMax?: number; tempMin?: number; tempMax?: number; likesMin?: number; outdoor?: boolean; indoor?: boolean; popMin?: number; /** 풀 타일의 절반 이상이 이 종류 (G35, §2.3 `pool{tile}`) */ tile?: string }
  | { kind: 'poolTotalSize'; min: number }
  | { kind: 'facility'; id: string; count?: number; adjacentPool?: boolean }
  | { kind: 'facilityAdjacent'; ids: [string, string]; count?: number }
  | { kind: 'facilityClass'; class: FacilityClass; count?: number }
  | { kind: 'recipe'; id: string; served?: boolean }
  | { kind: 'recipeCount'; min: number }
  | { kind: 'popularity'; min: number }
  | { kind: 'likes'; min: number; scope?: 'total' | 'area'; area?: string }
  | { kind: 'certPasses'; min: number }
  // P49-a1 §4.5 — 빠지 조건 DSL 4 (rigGuarded 는 망루 반경 데이터로)
  | { kind: 'rigGrade'; min: number; count?: number }
  /** P60-d — 입수구에서 이어진 경로 길이가 min 이상인 수역이 count(기본 1)곳 (옛 `rigChain` — 뜻만 사슬 → 경로) */
  | { kind: 'rigPath'; min: number; count?: number }
  /** P60-d — 코스 완성(스릴 비감소 ∧ 끝 휴식) 수역이 min 곳 */
  | { kind: 'rigPathComplete'; min: number }
  | { kind: 'rigCount'; min: number; kinds?: number; depth?: 'shallow' | 'deep' | 'any' }
  | { kind: 'rigGuarded'; min?: number; ratioMin?: number }
  /** P60-c §10.3 — 어느 수역이든 성립한 세트(`rig-sets.json`) 수가 min 이상 (인증 set_f/d/b) */
  | { kind: 'rigSet'; min: number }
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
  /** P28 D29 — 등급이 min 이상인 자리가 count(기본 1)개 */
  | { kind: 'seatGrade'; min: number; count?: number }
  /** P28 D33 — 시설 id 가 반경 3 안에 자리를 count 개 이상 먹여 준다(그 시설 하나 기준, 최대값) */
  | { kind: 'seatsFed'; id: string; count: number }
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
  likeRewards?: { at: number; grant: { kind: 'ingredient' | 'rigPart' | 'money' | 'gift' | 'facility'; id?: string; amount?: number } }[]; // P60-a: 'item' → ingredient(×amount)/rigPart
}

export interface FriendDef {
  id: string;
  name: string;
  area: string;
  age: number;
  gender: 'M' | 'F';
  /** P60-a: 색·향 취향은 뺐다 — 남는 취향은 음식 하나 */
  fav: { food: string };
  /** 처음부터 오는 친구 */
  start: boolean;
  /** 앞 친구의 ★ 단계(1~3) 달성으로 초대된다 */
  invitedBy: { friend: string; star: 1 | 2 | 3 } | null;
  /** 손님 도트 팔레트 0~7 */
  palette: number;
}

export type WishReward =
  | { kind: 'facility'; id: string }
  | { kind: 'gift'; id: string }
  | { kind: 'money'; amount: number }
  | { kind: 'ingredient'; id: string }
  | { kind: 'rigPart'; id: string }; // P49-a1 (P49-a2: 'tile' 삭제 — 물빛은 빠지 등급이 대체 · P60-a: 'item' 삭제 — 소품 151 은 rigPart/ingredient/money 로)

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

export type CertFamily = 'grade' | 'set' | 'court' | 'spa' | 'fruit' | 'stream' | 'fun' | 'cutesy';
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
  reward: { kind: 'gift' | 'facility' | 'rigPart'; id: string }; // P49-a2: 'tile' 삭제 · P60-a: 'item' 삭제
  /** 신청료 */
  fee: number;
}

export interface RankDef {
  star: number;
  name: string;
  conditions: Condition[];
  /** 랭크업 보상 (시설 해금 등) */
  reward?: { kind: 'facility' | 'gift' | 'money' | 'unlock'; id?: string; amount?: number }; // P60-a: 'item' 삭제
  /** P21 D27 — 이 랭크에 도달하면 열리는 시설들 (reward 와 별개, 여럿) */
  unlocks?: string[];
}

export interface ShopEntry {
  id: string;
  /** P60-a: 'item' → 'ingredient' — 장날 재료 진열(재고 3개 묶음, 값 = `IngredientDef.price` ×3) */
  kind: 'facility' | 'ingredient' | 'gift';
  ref: string;
  /** 해금 가격 (시설은 shopPrice, 재료·선물은 정가×3) */
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
  grant: { kind: 'facility' | 'gift' | 'money' | 'tool' | 'ingredient' | 'rigPart'; id?: string; amount?: number }; // P60-a: 'item' 삭제 (재료 ×amount 또는 부품)
  /** 사건 채널 — 기본 modal. 연출용(불꽃·조명)은 inbox (G27) */
  priority?: 'modal' | 'inbox' | 'strip'; // P49-a1: 'strip' = 연차 폴백(티커 한 줄, P53-a 가 쓴다)
  /** 첫 인증 합격일 + N일에 온다 (G43, 원작: 「배치 전환 = 첫 합격 후 9일째」). 있으면 year/season/dayInSeason 은 안 본다 */
  afterCertDays?: number;
  /** 조건 — 있으면 이때까지 충족돼야 온다 (첫 인증 뒤 등) */
  when?: Condition;
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
  /** 장날 값(재고 1개, P56-c) — `shop` 은 언제나, 보상 재료(wish·cert·year)는 한 번 얻은 뒤 다시 살 때. `start` 는 무한이라 없다 */
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
  /** P25 D31 — 자리 반경 3 안에 있어야 하는 것들(전부): food(먹거리) · dock(코스 있는 선착장) · water(물·선착장·샤워) · lodging(숙박 자리) · fire(화로대·BBQ) */
  needsInRadius: ('food' | 'dock' | 'water' | 'lodging' | 'fire' | 'ppaji')[]; // P48-c: 'ppaji' = 반경 안에 빠지(수역)가 있다 — 쓰는 패키지는 P52-a 부터
  /** 1인 값 (G) — `dock` 은 기구 요금 × feeMul 을 더한다 */
  price: number;
  feeMul?: number;
  taste: 'food' | 'thrill' | 'water' | 'rest';
  sat: number;
  hp: number;
  desc: string;
}

/** P22 D28 — 지면(바닥) 종류: 잔디 위에 값을 내고 깐다. `walk` 면 길처럼 손님이 걷고, 아니면 조경(옆 평상 자리 값 +1) */
export interface GroundDef {
  id: string;
  name: string;
  /** 레거시 아틀라스 ground/<art> 프레임 */
  art: string;
  cost: number;
  walk: boolean;
  /** 인기 — 6칸마다 pop 합을 더한다 (상한 20) */
  pop: number;
  desc: string;
}

/** P49-a1 §4.2 — 빠지 기구 부품 (`rig-parts.json`, `parts.json` 무수정). `RigStore` 의 재료 */
export interface RigPartDef {
  id: string;
  name: string;
  unlock: 'start' | 'shop' | 'cert' | 'year';
  /** 부품 계열 — 개조 레시피 키의 재료 */
  class: string;
  price: number;
  /** shop 진열 랭크 */
  rank?: number;
  /** year 전용 — 연차 폴백으로만 온다 */
  year?: number;
}

/** P60-c §10.3 — 기구 세트 (`rig-sets.json` 8). 한 빠지에서 세 멤버(개조판은 원종으로)가 켜진 채 4이웃 사슬로 이어지면 성립. `hidden` 은 도감에 「?」로만 */
export interface RigSetDef {
  id: string;
  name: string;
  /** 서로 다른 시설 id 셋 — 전부 class rig(링 위 `onRing` 포함) */
  members: [string, string, string];
  hidden: boolean;
}

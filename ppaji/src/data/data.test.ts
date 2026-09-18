import { INGREDIENT_CLASSES } from './schema.js';
import { describe, expect, expectTypeOf, it } from 'vitest';
import facilitiesJson from './facilities.json';
import seasonsJson from './seasons.json';
import areasJson from './areas.json';
import friendsJson from './friends.json';
import wishesJson from './wishes.json';
import giftsJson from './gifts.json';
import certsJson from './certs.json';
import ranksJson from './ranks.json';
import shopJson from './shop.json';
import calendarJson from './calendar.json';
import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';
import compatJson from './compat.json';
import rigPartsJson from './rig-parts.json';
import rigSetsJson from './rig-sets.json';
const rigParts = rigPartsJson as { id: string; unlock: string }[];
const rigPartIds = new Set(rigParts.map((p) => p.id));
import type {
  AreaDef, CalendarEvent, CertDef, CertFamily, CertGrade, CompatDef, Condition, FacilityClass, FacilityDef, FoodCategory, FriendDef,
  GiftDef, IngredientDef, RankDef, RecipeDef, RigSetDef, SeasonTables, ShopEntry, WishDef,
} from './schema';

/**
 * 데이터 회귀 검사 (plan §2.2 "데이터 검사가 회귀를 지킨다").
 * `schema.ts` 는 타입만 두므로 열거값의 런타임 목록은 여기서 들고, `satisfies` + `expectTypeOf` 로
 * 타입과 목록이 갈라지면 컴파일이 깨지게 묶는다.
 */
const CLASSES = ['utility', 'lounging', 'restaurant', 'attraction', 'slide', 'decor', 'rig'] as const satisfies readonly FacilityClass[];
// 목록이 타입보다 짧으면 여기서 컴파일이 깨진다 (런타임 no-op)
expectTypeOf<Exclude<FacilityClass, (typeof CLASSES)[number]>>().toBeNever();

// JSON import 는 `season` 을 `number[]` 로 추론해 4-튜플(`SeasonVec`)과 직접 캐스트가 안 된다 (TS2352).
// 모양은 아래 검사가 런타임으로 잰다 — `unknown` 경유는 여기 한 번뿐이다.
const facilities = facilitiesJson as unknown as FacilityDef[];
const seasons = seasonsJson as unknown as SeasonTables;
const areas = areasJson as unknown as AreaDef[];
const friends = friendsJson as unknown as FriendDef[];
const wishes = wishesJson as unknown as WishDef[];
const gifts = giftsJson as unknown as GiftDef[];
const certs = certsJson as unknown as CertDef[];
const ranks = ranksJson as unknown as RankDef[];
const shop = shopJson as unknown as ShopEntry[];
const calendar = calendarJson as unknown as CalendarEvent[];
const ingredients = ingredientsJson as unknown as IngredientDef[];
const recipes = recipesJson as unknown as RecipeDef[];
const compat = compatJson as unknown as CompatDef[];

/** 위키 회귀 `비용/인기 ≈ 90` (§1.4). 식당은 위키 전표(자판기 500/12 · 빙수 600/16 · 초밥 2000/67)가 ≈ 35 라 띠가 다르다 */
const COST_POP_BAND: Record<FacilityClass, [number, number]> = {
  utility: [60, 140],
  lounging: [60, 140],
  restaurant: [25, 50],
  attraction: [60, 140],
  slide: [60, 140],
  decor: [60, 140],
  rig: [60, 140], // P48-c — 정의는 P49-a1 부터, 띠는 놀이와 같다
};
/**
 * 회귀 밖에 있는 것 (전부 §1.4 위키 실측값 그대로 — 데이터를 맞추지 말고 여기 적는다):
 * · golden_kairobot — 10,700G 장식 (cost/pop 267)
 *
 * D19(2026-09-04): 시설 정본은 레거시 빠지 타이쿤 75종이다 (`../../../src/data/kairo-facilities.json`).
 * 비용은 레거시 원 단위 × 0.003 을 100 단위로 반올림한 값이고 pop 은 그 비용에서 유도한다 —
 * ×0.01 이면 pop 합이 3.3배가 되어 좋아요·버스 몫이 밴드를 벗어났다 (봇 8시드 실측).
 * 지금 스케일은 교체된 75종의 pop 합이 2,020 → 2,000 이라 옛 세트와 사실상 같다.
 */
const EXCEPTIONS = new Set<string>(['golden_kairobot', 'entrance', 'foodcourt_seat']); // foodcourt_seat: P58-a 파생 시설(0G·유지 0 — 영역이 값을 낸다) // entrance: P42 0G 도구형 시설(문 자리) — 값·인기·유지비·정원 회귀 밖
const MAINT_PER_POP = 5.3;
const MAINT_PER_POP_SLIDE = 7.2;
const MAINT_TOLERANCE = 0.3;

const inBand = (value: number, [lo, hi]: [number, number]) => value >= lo && value <= hi;

describe('facilities.json', () => {
  it('ids are unique snake_case', () => {
    const ids = facilities.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('every class is a FacilityClass', () => {
    for (const f of facilities) expect(CLASSES, f.id).toContain(f.class);
  });

  it('cost/pop stays within the class band (§1.4 회귀)', () => {
    for (const f of facilities) {
      if (EXCEPTIONS.has(f.id)) continue;
      expect(f.pop, f.id).toBeGreaterThan(0);
      expect(inBand(f.cost / f.pop, COST_POP_BAND[f.class]), `${f.id} cost/pop=${(f.cost / f.pop).toFixed(1)}`).toBe(true);
    }
  });

  it('maint ≈ pop × 5.3 (slides × 7.2) ± 30%', () => {
    for (const f of facilities) {
      if (EXCEPTIONS.has(f.id)) continue;
      const k = f.class === 'slide' ? MAINT_PER_POP_SLIDE : MAINT_PER_POP;
      const ratio = f.maint / (f.pop * k);
      expect(inBand(ratio, [1 - MAINT_TOLERANCE, 1 + MAINT_TOLERANCE]), `${f.id} maint/(pop×${k})=${ratio.toFixed(2)}`).toBe(true);
    }
  });

  it('restaurants have 5 menu slots, everything else 0', () => {
    for (const f of facilities) expect(f.menuSlots, f.id).toBe(f.class === 'restaurant' ? 5 : 0);
  });

  it('big slides carry slide geometry, nothing else does', () => {
    for (const f of facilities) {
      if (f.class === 'slide') {
        expect(f.slide, f.id).not.toBeNull();
        expect(f.slide!.levels, f.id).toBeGreaterThanOrEqual(2);
        expect(f.slide!.length, f.id).toBeGreaterThan(0);
      } else {
        expect(f.slide, f.id).toBeNull();
      }
    }
  });

  it('P60-a: 색·향 필드가 없다 — 남는 물성은 heat(계절 수온)뿐', () => {
    for (const f of facilities as unknown as Record<string, unknown>[]) {
      expect('scent' in f, f['id'] as string).toBe(false);
      expect('scentPower' in f, f['id'] as string).toBe(false);
      expect(typeof f['heat'], f['id'] as string).toBe('number');
    }
  });

  it('every sprays:true facility contributes AB, and AB only comes from sprays or slides', () => {
    for (const f of facilities) {
      if (f.sprays) expect(f.ab, f.id).toBeGreaterThan(0);
      else if (f.slide === null) expect(f.ab, f.id).toBe(0); // 슬라이드는 착수 AB 를 가진다 (G8)
    }
  });

  it('season vectors have exactly 4 entries', () => {
    for (const f of facilities) expect(f.season, f.id).toHaveLength(4);
  });

  it('at least 5 facilities are unlocked from the start', () => {
    const start = facilities.filter((f) => f.unlock.source === 'start');
    expect(start.length).toBeGreaterThanOrEqual(5);
  });

  it('unlock refs are present where the source needs one', () => {
    for (const f of facilities) {
      const u = f.unlock;
      if (u.source === 'shop' || u.source === 'rank') expect(u.rank, f.id).toBeGreaterThanOrEqual(1);
      if (u.source === 'wish' || u.source === 'cert' || u.source === 'invest' || u.source === 'gift') expect(u.ref, f.id).toBeTruthy();
    }
  });

  it('paid lounging heals more than free lounging; decor is not usable', () => {
    for (const f of facilities) {
      if (EXCEPTIONS.has(f.id)) continue;
      if (f.class === 'lounging') expect(f.hpDelta, f.id).toBe(f.usageFee > 0 ? 50 : 25);
      else expect(f.usageFee, f.id).toBe(0);
      if (f.class === 'decor') expect(f.capacity, f.id).toBe(0);
      else expect(f.capacity, f.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('seasons.json', () => {
  it('P60-a: 색·향 표가 없다 — 수온·햇빛·이상 수온만 남는다', () => {
    expect('colors' in seasons).toBe(false);
    expect('scents' in seasons).toBe(false);
    expect(seasons.idealTemp).toHaveLength(4);
    expect(typeof seasons.idealIndoor).toBe('number');
  });

  it('§1.3 values are copied verbatim', () => {
    expect(seasons.ambientOutdoor).toEqual([24, 30, 22, 14]);
    expect(seasons.ambientIndoor).toBe(26);
    expect(seasons.sun).toHaveLength(4);
  });
});

// ── G4: 지역 · 친구 · 소원 · 선물 ──────────────────────────────────────────

/** `Condition['kind']` 의 런타임 목록 — 타입에 kind 가 늘면 아래 `expectTypeOf` 가 컴파일을 깨뜨린다 */
const CONDITION_KINDS = [
  'pool', 'poolTotalSize', 'facility', 'facilityAdjacent', 'facilityClass', 'recipe', 'recipeCount', 'popularity', // P60-a: 'item' 삭제
  'likes', 'certPasses', 'certPassed', 'friends', 'areas', 'rank', 'gift', 'cookingLevel', 'visitors', 'money', 'year',
  'all', 'any', 'courseThrill', 'seatGrade', 'seatsFed',
  'rigGrade', 'rigPath', 'rigCount', 'rigGuarded', // P49-a1 · P60-d: rigChain → rigPath(경로 길이)
  'rigSet', // P60-c
  'rigPathComplete', // P60-d
  'courtSeats', 'courtMenuKinds', // P60-e
] as const satisfies readonly Condition['kind'][];
expectTypeOf<Exclude<Condition['kind'], (typeof CONDITION_KINDS)[number]>>().toBeNever();

/**
 * 이 빌드에 아직 없는 축 — 데이터가 참조하면 평가기가 영원히 `met=false` 를 낸다.
 * G10 에서 전 kind 가 평가기에 들어갔으므로 비어 있다. 새 kind 를 스키마에 먼저 넣고 평가기가 못 따라오면 여기 적는다.
 */
const KINDS_NOT_IN_BUILD = new Set<Condition['kind']>([]);
/** 인증·랭크·달력 조건도 같은 규칙 */
const KINDS_NOT_IN_BUILD_G5 = KINDS_NOT_IN_BUILD;

const facilityIds = new Set(facilities.map((f) => f.id));
const giftIds = new Set(gifts.map((g) => g.id));
const friendIds = new Set(friends.map((f) => f.id));
const areaIds = new Set(areas.map((a) => a.id));

/** `all`/`any` 를 재귀로 펼쳐 잎 조건마다 `visit` 를 부른다 */
function walkCondition(c: Condition, visit: (leaf: Condition) => void): void {
  if (c.kind === 'all' || c.kind === 'any') {
    expect(Array.isArray(c.of) && c.of.length > 0, `${c.kind} must carry ≥1 child`).toBe(true);
    for (const child of c.of) walkCondition(child, visit);
    return;
  }
  visit(c);
}

/** 잎 조건이 참조하는 id 가 실재하는지 (facility · gift · area). `forbidden` 은 그 데이터가 아직 못 쓰는 kind */
function checkLeaf(c: Condition, where: string, forbidden: Set<Condition['kind']> = KINDS_NOT_IN_BUILD): void {
  expect(CONDITION_KINDS, `${where} kind=${(c as { kind: string }).kind}`).toContain(c.kind);
  expect(forbidden.has(c.kind), `${where} uses ${c.kind} which this build cannot evaluate`).toBe(false);
  switch (c.kind) {
    case 'facility':
      expect(facilityIds.has(c.id), `${where} facility ${c.id}`).toBe(true);
      break;
    case 'facilityAdjacent':
      for (const id of c.ids) expect(facilityIds.has(id), `${where} facility ${id}`).toBe(true);
      break;
    case 'facilityClass':
      expect(CLASSES, where).toContain(c.class);
      break;
    case 'gift':
      expect(giftIds.has(c.id), `${where} gift ${c.id}`).toBe(true);
      if (c.friendId !== undefined) expect(friendIds.has(c.friendId), `${where} friend ${c.friendId}`).toBe(true);
      break;
    case 'likes':
      if (c.area !== undefined) expect(areaIds.has(c.area), `${where} area ${c.area}`).toBe(true);
      break;
    case 'pool': {
      // P60-a: 색·향·농도 하위 조건은 없다 — 수온·크기·좋아요·인기·실내외만
      const keys = Object.keys(c);
      for (const k of ['color', 'scent', 'intensityMin']) expect(keys, `${where} pool.${k}`).not.toContain(k);
      break;
    }
    default:
      break;
  }
}

describe('areas.json', () => {
  it('has 10 areas ordered 0..9 with unique ids, in PSS order', () => {
    expect(areas).toHaveLength(10);
    expect(new Set(areas.map((a) => a.id)).size).toBe(10);
    expect(areas.map((a) => a.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(areas.map((a) => a.id)).toEqual([
      'residential', 'school', 'forest', 'shopping', 'office', 'station', 'downtown', 'specialty', 'airport', 'kairo_island',
    ]);
    for (const a of areas) expect(a.likesToUnlockNext, a.id).toBe(1000);
  });
});

describe('friends.json', () => {
  it('ids are unique snake_case and every area exists', () => {
    expect(new Set(friends.map((f) => f.id)).size).toBe(friends.length);
    for (const f of friends) {
      expect(f.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(areaIds.has(f.area), `${f.id} area ${f.area}`).toBe(true);
    }
  });

  it('covers all 10 areas with §1.6 counts (71 = 7·7·8·7·8·6·8·8·8·4)', () => {
    expect(friends).toHaveLength(71);
    const want: Record<string, number> = {
      residential: 7, school: 7, forest: 8, shopping: 7, office: 8, station: 6, downtown: 8, specialty: 8, airport: 8, kairo_island: 4,
    };
    for (const [area, n] of Object.entries(want)) expect(friends.filter((f) => f.area === area), area).toHaveLength(n);
  });

  it('fav is food only (P60-a: 색·향 취향 삭제), palette 0..7, gender M|F', () => {
    for (const f of friends) {
      expect(Object.keys(f.fav).sort(), f.id).toEqual(['food']);
      expect(f.fav.food, f.id).toBeTruthy();
      expect(inBand(f.palette, [0, 7]), `${f.id} palette=${f.palette}`).toBe(true);
      expect(['M', 'F'], f.id).toContain(f.gender);
    }
  });

  it('each populated area has ≥2 start friends, and start ⇔ invitedBy === null', () => {
    for (const area of ['residential', 'school']) {
      expect(friends.filter((f) => f.area === area && f.start).length, area).toBeGreaterThanOrEqual(2);
    }
    for (const f of friends) expect(f.invitedBy === null, `${f.id} start=${f.start}`).toBe(f.start);
  });

  it('every invitedBy points at an existing, different friend in the same area with star 1..3', () => {
    for (const f of friends) {
      if (f.invitedBy === null) continue;
      expect(friendIds.has(f.invitedBy.friend), `${f.id} invitedBy ${f.invitedBy.friend}`).toBe(true);
      expect(f.invitedBy.friend, f.id).not.toBe(f.id);
      expect([1, 2, 3], f.id).toContain(f.invitedBy.star);
      const inviter = friends.find((g) => g.id === f.invitedBy!.friend)!;
      expect(inviter.area, `${f.id} invited across areas`).toBe(f.area);
    }
  });

  it('invite chains have no cycles and always end at a start friend', () => {
    const byId = new Map(friends.map((f) => [f.id, f]));
    for (const f of friends) {
      const seen = new Set<string>();
      let cur: FriendDef | undefined = f;
      while (cur && cur.invitedBy !== null) {
        expect(seen.has(cur.id), `cycle through ${cur.id}`).toBe(false);
        seen.add(cur.id);
        cur = byId.get(cur.invitedBy.friend);
      }
      expect(cur?.start, `${f.id} chain does not reach a start friend`).toBe(true);
    }
  });
});

describe('wishes.json', () => {
  it('has exactly 3 wishes per friend with idx 0,1,2 (213 total)', () => {
    expect(wishes).toHaveLength(friends.length * 3);
    for (const f of friends) {
      const idx = wishes.filter((w) => w.friendId === f.id).map((w) => w.idx).sort();
      expect(idx, f.id).toEqual([0, 1, 2]);
    }
    for (const w of wishes) expect(friendIds.has(w.friendId), `wish for unknown friend ${w.friendId}`).toBe(true);
  });

  it('every condition kind is allowed and every referenced id exists (recursive over all/any)', () => {
    for (const w of wishes) {
      const where = `${w.friendId}/${w.idx}`;
      walkCondition(w.condition, (leaf) => checkLeaf(leaf, where));
    }
  });

  it('rewards reference existing ids and stay in the allowed kinds', () => {
    for (const w of wishes) {
      const where = `${w.friendId}/${w.idx}`;
      const r = w.reward;
      switch (r.kind) {
        case 'facility':
          expect(facilityIds.has(r.id), `${where} reward facility ${r.id}`).toBe(true);
          break;
        case 'gift':
          expect(giftIds.has(r.id), `${where} reward gift ${r.id}`).toBe(true);
          expect(gifts.find((g) => g.id === r.id)!.unlock, `${where} rewarded gift must unlock via wish`).toBe('wish');
          break;
        case 'money':
          expect(inBand(r.amount, [500, 3000]), `${where} money=${r.amount}`).toBe(true);
          break;
        case 'ingredient':
          expect(ingredients.some((i) => i.id === r.id), `${where} reward ingredient ${r.id}`).toBe(true);
          expect(ingredients.find((i) => i.id === r.id)!.unlock, `${where} rewarded ingredient must be unlock:'wish'`).toBe('wish');
          break;
        case 'rigPart': // P53-a: 소원 둘이 부품을 준다 (float_drum · slip_wax) · P60-a: 소품 보상 재배분으로 ~46
          expect(rigPartIds.has(r.id), `${where} reward rig part ${r.id}`).toBe(true);
          // 연차 부품(`year`)은 연차 폴백으로만 온다 — 소원은 장날 부품만 준다
          expect(rigParts.find((p) => p.id === r.id)!.unlock, `${where} rewarded rig part must be shop-tier`).toBe('shop');
          break;
        default:
          // tile 은 인증 보상이다 (PSS: 타일 13종 전부 인증) — 소원이 주면 인증의 유일한 보상이 헐값이 된다
          expect.fail(`${where} reward kind ${(r as { kind: string }).kind} is not a wish reward`);
      }
    }
  });

  it('소원 보상 중 돈은 1/3 이하 — 원작: 보상은 시설·재료·튜브·새 손님이지 돈이 아니다 (G49 R2 · P60-a 재배분)', () => {
    // P60-a: 소품 보상 151 을 rigPart/ingredient/money 로 재배분했다. 같은 친구 안 종류 중복 금지가 「소원 셋이 다 소품이던 친구」마다
    // 돈 하나를 강제해 10% 는 못 지킨다 — 실측 65/213(30.5%). wish-source 시설이 생기면 스크립트가 먼저 시설로 보낸다
    const money = wishes.filter((w) => w.reward.kind === 'money').length;
    expect(money / wishes.length).toBeLessThanOrEqual(1 / 3);
    expect(wishes.filter((w) => w.idx >= 1 && w.reward.kind === 'money').length).toBeLessThanOrEqual(wishes.length / 4);
  });

  it('every unlock:"wish" ingredient is rewarded by at least one wish (otherwise its recipes are unreachable forever); rewards are wish-tier only', () => {
    // P60-a: 한 재료를 여러 소원이 준다 — 두 번째부터는 재고 ×3 (P56-c 문법). 「정확히 하나」는 첫 열쇠의 유일성이었고 도달 가능성은 ≥1 로 지켜진다
    for (const ing of ingredients.filter((i) => i.unlock === 'wish')) {
      const hits = wishes.filter((w) => w.reward.kind === 'ingredient' && w.reward.id === ing.id);
      expect(hits.length, `${ing.id} rewarded by nobody`).toBeGreaterThanOrEqual(1);
    }
  });

  it('P60-a: 보상에 item 0 · 조건에 item/color/scent 0 · 보상 kind 집합은 {facility, gift, money, ingredient, rigPart}', () => {
    const kinds = new Set(wishes.map((w) => w.reward.kind as string));
    expect(kinds.has('item')).toBe(false);
    expect([...kinds].sort()).toEqual(['facility', 'gift', 'ingredient', 'money', 'rigPart']);
    for (const w of wishes) {
      walkCondition(w.condition, (leaf) => {
        expect((leaf as { kind: string }).kind, `${w.friendId}/${w.idx}`).not.toBe('item');
        if (leaf.kind === 'pool') for (const k of ['color', 'scent', 'intensityMin']) expect(k in leaf, `${w.friendId}/${w.idx} pool.${k}`).toBe(false);
      });
    }
    // 같은 친구 안에서 보상 **id** 가 겹치지 않는다 (3차 재배분 규칙 — 종류 중복 금지는 돈 65 를 강제해 G49 「돈 ≤ 10%」와 충돌했다)
    for (const f of friends) {
      const idsOf = wishes.filter((w) => w.friendId === f.id).map((w) => (w.reward as { id?: string }).id ?? w.reward.kind + JSON.stringify(w.reward));
      expect(new Set(idsOf).size, `${f.id} rewards ${idsOf.join(',')}`).toBe(idsOf.length);
    }
    // 종류별 수 — 재배분 결과의 대략 (스크립트 요약과 같다). 밴드는 넓게: 소원을 손으로 고쳐도 축이 사라지지 않게
    const count = (k: string) => wishes.filter((w) => w.reward.kind === k).length;
    expect(count('ingredient')).toBeGreaterThanOrEqual(40);
    expect(count('rigPart')).toBeGreaterThanOrEqual(25);
    expect(count('facility')).toBe(facilities.filter((f) => f.unlock.source === 'wish').length);
  });

  it('every unlock.source === "wish" facility is rewarded by exactly one wish, at exactly its unlock.ref', () => {
    const wishFacilities = facilities.filter((f) => f.unlock.source === 'wish');
    expect(wishFacilities.length).toBeGreaterThan(0);
    // 한 소원은 시설 하나만 준다 — 두 시설이 같은 `friend/idx` 를 가리키면 뒤에 오는 친구 작성이 반드시 하나를 버린다
    const refs = wishFacilities.map((f) => f.unlock.ref!);
    expect(new Set(refs).size, `duplicate wish refs: ${refs.filter((r, i) => refs.indexOf(r) !== i).join(',')}`).toBe(refs.length);
    for (const f of wishFacilities) {
      const [friend, idxText, ...rest] = f.unlock.ref!.split('/');
      expect(rest, `${f.id} ref ${f.unlock.ref} must be friend/idx`).toHaveLength(0);
      expect(['0', '1', '2'], `${f.id} ref idx`).toContain(idxText);
      // 71명 전원이 작성됐다 (§1.6) — 모르는 친구를 가리키는 ref 는 오타다
      expect(friendIds.has(friend!), `${f.id} ref ${f.unlock.ref} names an unknown friend`).toBe(true);
      const hits = wishes.filter((w) => w.reward.kind === 'facility' && w.reward.id === f.id);
      expect(hits.length, `${f.id} rewarded by ${hits.map((w) => `${w.friendId}/${w.idx}`).join(',') || 'nobody'}`).toBe(1);
      expect(`${hits[0]!.friendId}/${hits[0]!.idx}`, `${f.id} unlock.ref`).toBe(f.unlock.ref);
    }
    // 반대 방향: 소원이 주는 시설은 전부 wish-source 여야 한다 (start 시설을 "보상"이라 부르지 않는다)
    for (const w of wishes) {
      if (w.reward.kind === 'facility') expect(wishFacilities.map((f) => f.id), `${w.friendId}/${w.idx}`).toContain(w.reward.id);
    }
  });

  it('every unlock === "wish" gift is rewarded by exactly one wish', () => {
    for (const g of gifts.filter((g) => g.unlock === 'wish')) {
      const hits = wishes.filter((w) => w.reward.kind === 'gift' && w.reward.id === g.id);
      expect(hits.length, g.id).toBe(1);
    }
  });

  it("Kiddie's wishes are pool sizeMin 20 / 40 / 60 (the first wish the player meets)", () => {
    const k = wishes.filter((w) => w.friendId === 'kiddie').sort((a, b) => a.idx - b.idx);
    expect(k.map((w) => w.condition)).toEqual([
      { kind: 'pool', sizeMin: 20 },
      { kind: 'pool', sizeMin: 40 },
      { kind: 'pool', sizeMin: 60 },
    ]);
  });

  it('lines are Korean, non-empty', () => {
    for (const w of wishes) expect(w.line, `${w.friendId}/${w.idx}`).toMatch(/[가-힣]/);
  });
});

describe('gifts.json', () => {
  it('has 18 unique ids (튜브 12 는 심사 보상, G44), kind swimsuit|float, price > 0, valid unlock', () => {
    expect(gifts).toHaveLength(18);
    expect(new Set(gifts.map((g) => g.id)).size).toBe(18);
    for (const g of gifts) {
      expect(['swimsuit', 'float'], g.id).toContain(g.kind);
      expect(g.price, g.id).toBeGreaterThan(0);
      expect(['start', 'shop', 'cert', 'wish'], g.id).toContain(g.unlock);
    }
    expect(gifts.filter((g) => g.unlock === 'start').length).toBeGreaterThanOrEqual(1);
  });
});

// ── G5: 풀 타일 · 인증 · 랭크 · 상점 · 사장 달력 ─────────────────────────────

const CERT_FAMILIES = ['grade', 'set', 'court', 'spa', 'fruit', 'stream', 'fun', 'cutesy'] as const satisfies readonly CertFamily[];
const CERT_GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const satisfies readonly CertGrade[];
expectTypeOf<Exclude<CertFamily, (typeof CERT_FAMILIES)[number]>>().toBeNever();
expectTypeOf<Exclude<CertGrade, (typeof CERT_GRADES)[number]>>().toBeNever();

/** 합격선 (§1.7) */
const CERT_PASS = [15, 17, 20, 22, 25];
/** 인증이 안 주는 타일 — 24종이 되며 A·S 몫(excellent·colorful·kairo)도 배정됐다 (§1.7 "타일 13종은 전부 인증 보상") */
import { TICKS_PER_DAY } from '../sim/clock.js';

const certIds = new Set(certs.map((c) => c.id));
const gradeIndex = (g: CertGrade) => CERT_GRADES.indexOf(g);


describe('certs.json', () => {
  it('has 24 unique ids with a known family/grade, pass ∈ {15,17,20,22,25}, fee 500~8000', () => {
    expect(certs).toHaveLength(24);
    expect(certIds.size).toBe(24);
    for (const c of certs) {
      expect(c.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(CERT_FAMILIES, c.id).toContain(c.family);
      expect(CERT_GRADES, c.id).toContain(c.grade);
      expect(CERT_PASS, `${c.id} pass=${c.pass}`).toContain(c.pass);
      expect(inBand(c.fee, [500, 8000]), `${c.id} fee=${c.fee}`).toBe(true);
      expect(c.name, c.id).toMatch(/[가-힣]/);
    }
  });

  it('every family from §1.7 has at least one cert', () => {
    for (const fam of CERT_FAMILIES) expect(certs.some((c) => c.family === fam), fam).toBe(true);
  });

  it('carries 2~3 weighted conditions whose kinds are evaluable and whose ids exist', () => {
    for (const c of certs) {
      expect(inBand(c.conditions.length, [2, 3]), `${c.id} has ${c.conditions.length} conditions`).toBe(true);
      for (const [i, w] of c.conditions.entries()) {
        expect([1, 2], `${c.id}#${i}`).toContain(w.weight);
        walkCondition(w.cond, (leaf) => checkLeaf(leaf, `${c.id}#${i}`, KINDS_NOT_IN_BUILD_G5));
      }
      // 「(2x)」 는 조건마다가 아니라 핵심 조건 하나에만 붙는다 — 전부 2 면 가중치가 아니다
      expect(c.conditions.some((w) => w.weight === 1), `${c.id} needs a weight-1 condition`).toBe(true);
    }
  });

  it('requires points at an existing cert of the same family and a lower grade, with a higher fee and pass', () => {
    for (const c of certs) {
      if (c.requires === null) continue;
      expect(certIds.has(c.requires), `${c.id} requires ${c.requires}`).toBe(true);
      const prev = certs.find((p) => p.id === c.requires)!;
      expect(prev.family, `${c.id} requires across families`).toBe(c.family);
      expect(gradeIndex(prev.grade), `${c.id} (${c.grade}) must sit above ${prev.id} (${prev.grade})`).toBeLessThan(gradeIndex(c.grade));
      expect(c.fee, `${c.id} fee`).toBeGreaterThan(prev.fee);
      expect(c.pass, `${c.id} pass`).toBeGreaterThanOrEqual(prev.pass);
    }
    // 계열의 첫 인증은 requires 가 없고, 같은 계열의 등급은 겹치지 않는다
    for (const fam of CERT_FAMILIES) {
      const fc = certs.filter((c) => c.family === fam).sort((a, b) => gradeIndex(a.grade) - gradeIndex(b.grade));
      expect(fc[0]!.requires, `${fam} entry cert`).toBeNull();
      expect(new Set(fc.map((c) => c.grade)).size, `${fam} duplicate grade`).toBe(fc.length);
      for (let i = 1; i < fc.length; i++) {
        const [prev, cur] = [fc[i - 1]!, fc[i]!];
        expect(cur.requires, `${cur.id} must chain to ${prev.id}`).toBe(prev.id);
      }
    }
  });

  it('the grade family chains F → D → B → A → S (원작 노멀 부문 표 [S], G44)', () => {
    const g = certs.filter((c) => c.family === 'grade').sort((a, b) => gradeIndex(a.grade) - gradeIndex(b.grade));
    expect(g.map((c) => c.grade)).toEqual(['F', 'D', 'B', 'A', 'S']);
    expect(g.map((c) => c.requires)).toEqual([null, 'grade_f', 'grade_d', 'grade_b', 'grade_a']);
    expect(g.map((c) => c.pass)).toEqual([15, 20, 25, 25, 25]);
  });

  it('원작 심사관 표 [S] 대로 — 조건 3 = 심사관 3 (가중치 2 는 심사관 둘이 같은 조건) · 시설 조건은 실재 id · 3단 슬라이드는 any', () => {
    for (const c of certs) {
      const judges = c.conditions.reduce((n, w) => n + w.weight, 0);
      expect(judges, `${c.id} judges`).toBe(3);
    }
    const s = certs.find((c) => c.id === 'grade_s')!;
    expect(s.conditions.map((w) => w.cond.kind)).toEqual(['pool', 'rigGrade', 'facility']); // P53-a: 수역 → 기구 등급 4
    const fc = certs.find((c) => c.id === 'fun_c')!;
    expect(fc.conditions[0]!.cond.kind).toBe('any');
    expect(certs.filter((c) => c.reward.kind === 'gift').length).toBe(12); // 튜브 12 (원작 표)
    expect(certs.filter((c) => c.reward.kind === 'rigPart').length).toBe(9); // P49-a2: 물빛 12 → 부품 9 + 기구 3
    expect(certs.filter((c) => c.reward.kind === 'facility').length).toBeGreaterThanOrEqual(3);
  });

  it('rewards reference existing ids; tiles at most once each; cert-gifts exactly once', () => {
    const tileHits = new Map<string, string[]>();
    for (const c of certs) {
      const r = c.reward;
      switch (r.kind) {
        case 'rigPart':
          expect(rigPartIds.has(r.id), `${c.id} reward rig part ${r.id}`).toBe(true);
          break;
        case 'gift':
          expect(giftIds.has(r.id), `${c.id} reward gift ${r.id}`).toBe(true);
          expect(gifts.find((g) => g.id === r.id)!.unlock, `${c.id} rewarded gift must unlock via cert`).toBe('cert');
          break;
        case 'facility':
          expect(facilityIds.has(r.id), `${c.id} reward facility ${r.id}`).toBe(true);
          expect(facilities.find((f) => f.id === r.id)!.unlock.source, `${c.id} rewarded facility must be cert-source`).toBe('cert');
          break;
        default:
          expect.fail(`${c.id} reward kind ${(r as { kind: string }).kind}`);
      }
    }
    for (const [tile, by] of tileHits) expect(by.length, `${tile} rewarded by ${by.join(',')}`).toBe(1);
    for (const g of gifts.filter((g) => g.unlock === 'cert')) {
      const hits = certs.filter((c) => c.reward.kind === 'gift' && c.reward.id === g.id);
      expect(hits.length, `${g.id} rewarded by ${hits.map((c) => c.id).join(',') || 'nobody'}`).toBe(1);
    }
  });


  it('the entry cert (grade_f) asks for a popular pool 60 (2x) + rigs 2 (P53-a) and is reachable from the start kit', () => {
    const f = certs.find((c) => c.id === 'grade_f')!;
    expect(f.requires).toBeNull();
    expect(f.conditions).toEqual([
      { cond: { kind: 'pool', popMin: 60 }, weight: 2 },
      { cond: { kind: 'rigCount', min: 2 }, weight: 1 }, // P53-a: 수역 20칸 → 기구 2
    ]);
    // 조건에 나오는 시설은 상점 없이도 손에 들어와야 한다 — 상점은 1년차 여름에 열린다
    for (const c of certs.filter((c) => c.grade === 'F')) {
      for (const w of c.conditions) {
        walkCondition(w.cond, (leaf) => {
          if (leaf.kind === 'facility') expect(facilities.find((f) => f.id === leaf.id)!.unlock.source, `${c.id} ${leaf.id}`).toBe('start');
        });
      }
    }
  });

  it('P60-a: 24 유지 · 조건에 item/색/향 0 · 보상 kind 집합 {gift, facility, rigPart} · set 계열은 P60-c 세트(rigSet 1/2/3) · court 계열은 임시로 식당 수 (P60-e 가 재배선)', () => {
    expect(certs).toHaveLength(24);
    expect([...new Set(certs.map((c) => c.reward.kind as string))].sort()).toEqual(['facility', 'gift', 'rigPart']);
    for (const c of certs) {
      for (const w of c.conditions) {
        walkCondition(w.cond, (leaf) => {
          expect((leaf as { kind: string }).kind, `${c.id}`).not.toBe('item');
          if (leaf.kind === 'pool') for (const k of ['color', 'scent', 'intensityMin']) expect(k in leaf, `${c.id} pool.${k}`).toBe(false);
        });
      }
    }
    const setMin = (id: string) => certs.find((c) => c.id === id)!.conditions.find((w) => w.cond.kind === 'rigSet')!.cond as { min: number };
    expect([setMin('set_f').min, setMin('set_d').min, setMin('set_b').min]).toEqual([1, 2, 3]); // P60-c §10.3: P60-a 임시 rigCount 2/4/6 → rigSet 1/2/3 (다른 조건·보상은 바이트 그대로)
    for (const id of ['set_f', 'set_d', 'set_b']) expect(certs.find((c) => c.id === id)!.conditions.map((w) => w.weight), id).toEqual([2, 1]);
    expect(certs.filter((c) => c.conditions.some((w) => w.cond.kind === 'rigSet')).map((c) => c.id)).toEqual(['set_f', 'set_d', 'set_b']);
    // P60-e §10.5: P60-a 임시 restaurant 2/4/6 → `all[courtSeats, courtMenuKinds]` 4·2 / 8·3 / 12·4 (한 조건 자리에 한 조건 — 개수 2~3 유지 · 다른 조건·보상은 바이트 그대로 · restaurant 조건 0)
    const court = (id: string) => { const c = certs.find((x) => x.id === id)!; const w = c.conditions.find((x) => x.cond.kind === 'all')!; const of = (w.cond as { of: Condition[] }).of; return { w: w.weight, seats: (of.find((x) => x.kind === 'courtSeats') as { min: number }).min, kinds: (of.find((x) => x.kind === 'courtMenuKinds') as { min: number }).min, n: c.conditions.length, rest: c.conditions.some((x) => x.cond.kind === 'facilityClass' && (x.cond as { class: string }).class === 'restaurant') }; };
    expect([court('court_f'), court('court_d'), court('court_b')]).toEqual([{ w: 2, seats: 4, kinds: 2, n: 2, rest: false }, { w: 1, seats: 8, kinds: 3, n: 3, rest: false }, { w: 1, seats: 12, kinds: 4, n: 3, rest: false }]);
    expect(certs.filter((c) => c.conditions.some((w) => w.cond.kind === 'all' && (w.cond as { of: Condition[] }).of.some((x) => x.kind === 'courtSeats'))).map((c) => c.id)).toEqual(['court_f', 'court_d', 'court_b']);
    expect(certs.find((c) => c.id === 'court_f')!.reward).toEqual({ kind: 'rigPart', id: 'slip_wax' });
    // spa 는 수온 조건이 그대로 (계절 수온은 남는다)
    expect(certs.find((c) => c.id === 'spa_d')!.conditions[0]!.cond).toEqual({ kind: 'pool', tempMin: 32 });
    expect(certs.find((c) => c.id === 'spa_b')!.conditions[0]!.cond).toEqual({ kind: 'pool', tempMin: 40, indoor: true });
  });
});

// ── P60-c §10.3 rig-sets.json — 기구 세트 8 ──
describe('rig-sets.json (P60-c)', () => {
  const sets = rigSetsJson as unknown as RigSetDef[];
  const byId = new Map(facilities.map((f) => [f.id, f]));
  it('8종 · id 유일 · 이름 ≤ 10자 · 멤버 정확히 3 · 서로 다른 · 전부 존재하고 class rig(링 위 onRing 포함) · hidden 정확히 4(jump·night·roll·trio)', () => {
    expect(sets).toHaveLength(8);
    expect(new Set(sets.map((s) => s.id)).size).toBe(8);
    for (const s of sets) {
      expect(s.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(s.name.length, s.id).toBeLessThanOrEqual(10);
      expect(s.members, s.id).toHaveLength(3);
      expect(new Set(s.members).size, s.id).toBe(3);
      for (const m of s.members) { const f = byId.get(m); expect(f, `${s.id} ${m}`).toBeDefined(); expect(f!.class === 'rig' || f!.onRing === true, `${s.id} ${m}`).toBe(true); }
      expect(typeof s.hidden, s.id).toBe('boolean');
    }
    expect(sets.filter((s) => s.hidden).map((s) => s.id).sort()).toEqual(['jump', 'night', 'roll', 'trio']);
    expect(sets.filter((s) => !s.hidden).map((s) => s.id)).toEqual(['ninja', 'kids', 'slide3', 'lounge']);
  });
  it('시작 해금(unlock.source start) 7종만으로 최소 1 세트(ninja) 성립 가능 · 밤빠지는 lights 기구 둘 + 플로팅 바 · 라운지는 링 위 메뉴 시설을 든다 · 멤버 셋이 같은 세트는 둘 없다', () => {
    const start = new Set(facilities.filter((f) => f.class === 'rig' && f.buildable !== false && f.unlock.source === 'start').map((f) => f.id));
    expect(start.size).toBe(7);
    const startSets = sets.filter((s) => s.members.every((m) => start.has(m)));
    expect(startSets.map((s) => s.id)).toContain('ninja');
    const night = sets.find((s) => s.id === 'night')!;
    expect(night.members.filter((m) => byId.get(m)!.lights === true)).toHaveLength(2);
    expect(night.members.some((m) => byId.get(m)!.onRing === true && byId.get(m)!.menuSlots > 0)).toBe(true);
    const lounge = sets.find((s) => s.id === 'lounge')!;
    expect(lounge.members.some((m) => byId.get(m)!.onRing === true && byId.get(m)!.menuSlots > 0)).toBe(true);
    expect(new Set(sets.map((s) => [...s.members].sort().join('+'))).size).toBe(8);
  });
});

describe('ranks.json', () => {
  it('stars 1..5 ascending with Korean names', () => {
    expect(ranks.map((r) => r.star)).toEqual([1, 2, 3, 4, 5]);
    for (const r of ranks) expect(r.name, `★${r.star}`).toMatch(/[가-힣]/);
  });

  it('every condition is evaluable and references existing ids', () => {
    for (const r of ranks) {
      expect(r.conditions.length, `★${r.star}`).toBeGreaterThanOrEqual(2);
      for (const [i, c] of r.conditions.entries()) walkCondition(c, (leaf) => checkLeaf(leaf, `★${r.star}#${i}`, KINDS_NOT_IN_BUILD_G5));
    }
  });

  it('popularity and certPasses thresholds rise with the star (§2.6 placeholders)', () => {
    const pick = (r: RankDef, kind: 'popularity' | 'certPasses') => {
      const c = r.conditions.find((c) => c.kind === kind);
      expect(c, `★${r.star} lacks ${kind}`).toBeDefined();
      return (c as { min: number }).min;
    };
    const pop = ranks.map((r) => pick(r, 'popularity'));
    const cert = ranks.map((r) => pick(r, 'certPasses'));
    for (let i = 1; i < ranks.length; i++) {
      expect(pop[i], `★${i + 1} popularity`).toBeGreaterThan(pop[i - 1]!);
      expect(cert[i], `★${i + 1} certPasses`).toBeGreaterThan(cert[i - 1]!);
    }
    expect(pop).toEqual([200, 1000, 1400, 2600, 4000]) // P55 밸런스 스윕: ★5 인기 4200 → 4000 (봇 6~7년차 3,812~4,095 로 문턱에 걸렸다) // G45: 실측 인기 곡선(Y1 800 → Y8 6,400)에 맞춘 문턱;
    expect(cert).toEqual([1, 2, 4, 7, 10]);
  });

  it('rewards reference existing ids; ★5 hands out the golden kairobot (§1.8)', () => {
    for (const r of ranks) {
      if (!r.reward) continue;
      const w = `★${r.star} reward`;
      switch (r.reward.kind) {
        case 'facility':
          expect(facilityIds.has(r.reward.id!), w).toBe(true);
          expect(facilities.find((f) => f.id === r.reward!.id)!.unlock, w).toEqual({ source: 'rank', rank: r.star });
          break;
        case 'gift':
          expect(giftIds.has(r.reward.id!), w).toBe(true);
          break;
        case 'money':
          expect(r.reward.amount, w).toBeGreaterThan(0);
          break;
      }
    }
    expect(ranks.find((r) => r.star === 5)!.reward).toEqual({ kind: 'facility', id: 'golden_kairobot' });
    // 반대 방향: rank-source 시설은 전부 그 랭크가 준다
    for (const f of facilities.filter((f) => f.unlock.source === 'rank')) {
      const hit = ranks.find((r) => (r.reward?.kind === 'facility' && r.reward.id === f.id) || (r.unlocks ?? []).includes(f.id)); // P21: `unlocks` 로 여럿
      expect(hit?.star, `${f.id} rank reward`).toBe(f.unlock.rank);
    }
  });
});

describe('shop.json', () => {
  it('ids are unique `shop_<ref>`, kinds valid, refs exist, price > 0, tier 1..5', () => {
    expect(new Set(shop.map((s) => s.id)).size).toBe(shop.length);
    for (const s of shop) {
      expect(s.id, s.id).toBe(`shop_${s.ref}`);
      expect(['facility', 'ingredient', 'gift'], s.id).toContain(s.kind); // P60-a: 'item' → 'ingredient'
      const pool = s.kind === 'facility' ? facilityIds : s.kind === 'ingredient' ? new Set(ingredients.map((i) => i.id)) : giftIds;
      expect(pool.has(s.ref), `${s.id} ref ${s.ref}`).toBe(true);
      expect(s.price, s.id).toBeGreaterThan(0);
      expect(inBand(s.tier, [1, 5]), `${s.id} tier=${s.tier}`).toBe(true);
    }
  });

  it('covers every shop-unlock facility / gift exactly once, and nothing else; ingredient rows are 6~8 shop-tier ingredients, each at most once', () => {
    const want = [
      ...facilities.filter((f) => f.unlock.source === 'shop').map((f) => `facility:${f.id}`),
      ...gifts.filter((g) => g.unlock === 'shop').map((g) => `gift:${g.id}`),
    ].sort();
    const have = shop.filter((s) => s.kind !== 'ingredient').map((s) => `${s.kind}:${s.ref}`).sort();
    expect(have).toEqual(want);
    // P60-a: 소품 19 자리에 장날 재료 진열 (전부가 아니라 골라 담는다 — 재료 카드 자체는 요리 창의 장날이 판다)
    const ing = shop.filter((s) => s.kind === 'ingredient');
    expect(ing.length).toBeGreaterThanOrEqual(6);
    expect(ing.length).toBeLessThanOrEqual(8);
    expect(new Set(ing.map((s) => s.ref)).size).toBe(ing.length);
    for (const s of ing) expect(ingredients.find((i) => i.id === s.ref)!.unlock, s.id).toBe('shop');
    expect(shop.some((s) => (s.kind as string) === 'item')).toBe(false);
  });

  it('facilities sell at shopPrice on their unlock rank; ingredients (3-pack) and gifts at 3× list price (§1.8)', () => {
    for (const s of shop) {
      if (s.kind === 'facility') {
        const f = facilities.find((f) => f.id === s.ref)!;
        expect(s.price, s.id).toBe(f.shopPrice);
        expect(s.tier, s.id).toBe(f.unlock.rank ?? 1);
      } else {
        const list = s.kind === 'ingredient' ? ingredients.find((i) => i.id === s.ref)!.price! : gifts.find((g) => g.id === s.ref)!.price;
        expect(s.price, s.id).toBe(list * 3);
      }
    }
  });

  it('tier 1 is not empty and tiers never skip a step (★1 opens something on day one of the shop)', () => {
    const tiers = [...new Set(shop.map((s) => s.tier))].sort((a, b) => a - b);
    expect(tiers[0]).toBe(1);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBe(tiers[i - 1]! + 1);
  });
});

const calendarIngredientIds = new Set(ingredients.map((i) => i.id));
describe('calendar.json', () => {
  it('ids are unique; year 1..8, season 0..3, dayInSeason 0..3, tick 0..TICKS_PER_DAY-1; from ∈ president|judge; Korean title/line', () => {
    expect(new Set(calendar.map((e) => e.id)).size).toBe(calendar.length);
    for (const e of calendar) {
      expect(e.id).toMatch(/^calendar_[a-z0-9_]+$/);
      expect(inBand(e.year, [1, 8]), `${e.id} year=${e.year}`).toBe(true);
      expect(inBand(e.season, [0, 3]), `${e.id} season=${e.season}`).toBe(true);
      expect(inBand(e.dayInSeason, [0, 3]), `${e.id} dayInSeason=${e.dayInSeason}`).toBe(true);
      expect(inBand(e.tick, [0, TICKS_PER_DAY - 1]), `${e.id} tick=${e.tick}`).toBe(true);
      expect(['president', 'judge'], e.id).toContain(e.from);
      expect(e.title, e.id).toMatch(/[가-힣]/);
      expect(e.line, e.id).toMatch(/[가-힣]/);
    }
  });

  it('no two events share a calendar slot (one arrival per moment, §1.8)', () => {
    const slots = calendar.map((e) => `${e.year}/${e.season}/${e.dayInSeason}/${e.tick}`);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('grants reference existing ids (tool ids: move only) and `when` is evaluable', () => {
    for (const e of calendar) {
      const g = e.grant;
      switch (g.kind) {
        case 'facility':
          expect(facilityIds.has(g.id!), `${e.id} facility ${g.id}`).toBe(true);
          break;
        case 'gift':
          expect(giftIds.has(g.id!), `${e.id} gift ${g.id}`).toBe(true);
          break;
        case 'money':
          expect(g.amount, `${e.id} money`).toBeGreaterThan(0);
          break;
        case 'tool':
          expect(g.id, `${e.id} tool`).toBe('move');
          break;
        case 'ingredient':
          expect(calendarIngredientIds.has(g.id!), `${e.id} ingredient ${g.id}`).toBe(true);
          // P60-a: 소품 → 재료는 ×3 (P56-c 보상 문법)
          expect(g.amount ?? 1, `${e.id} ingredient amount`).toBeGreaterThanOrEqual(1);
          break;
        case 'rigPart': // P53-a: 연차 폴백 (겨울 택배)
          expect(rigPartIds.has(g.id!), `${e.id} rig part ${g.id}`).toBe(true);
          break;
        default:
          expect.fail(`${e.id} grant kind ${(g as { kind: string }).kind}`);
      }
      if (e.when) walkCondition(e.when, (leaf) => checkLeaf(leaf, `${e.id}.when`, KINDS_NOT_IN_BUILD_G5));
    }
  });

  it('every gift-source facility is granted by exactly one calendar event whose id is its ref', () => {
    for (const f of facilities.filter((f) => f.unlock.source === 'gift')) {
      const hits = calendar.filter((e) => e.grant.kind === 'facility' && e.grant.id === f.id);
      expect(hits.length, `${f.id} granted by ${hits.map((e) => e.id).join(',') || 'nobody'}`).toBe(1);
      expect(hits[0]!.id, `${f.id} unlock.ref`).toBe(f.unlock.ref);
    }
    // 반대 방향: 달력이 주는 시설은 전부 gift-source 다
    for (const e of calendar) {
      if (e.grant.kind === 'facility' && e.priority !== 'strip') expect(facilities.find((f) => f.id === e.grant.id)!.unlock.source, e.id).toBe('gift'); // P53-a: 연차 폴백(strip)은 안전망이라 인증·랭크 시설도 준다
    }
  });

  it('the fixed §1.4 beats are in place: creperie on day 3, move tool after the first cert in Y1 autumn', () => {
    const day3 = calendar.find((e) => e.id === 'calendar_day3')!;
    expect([day3.year, day3.season, day3.dayInSeason]).toEqual([1, 0, 2]);
    expect(day3.grant).toEqual({ kind: 'facility', id: 'bungeoppang' });
    const move = calendar.find((e) => e.grant.kind === 'tool')!;
    expect([move.year, move.season]).toEqual([1, 2]);
    expect(move.when).toEqual({ kind: 'certPasses', min: 1 });
    expect(calendar.filter((e) => e.grant.kind === 'tool')).toHaveLength(1);
  });
});

// ── G6·G7: 재료 · 레시피 · 궁합 ────────────────────────────────────────────

const FOOD_CATEGORIES = ['drink', 'snack', 'meal', 'dessert'] as const satisfies readonly FoodCategory[];
const INGREDIENT_UNLOCKS = ['start', 'shop', 'wish', 'cert', 'year'] as const satisfies readonly IngredientDef['unlock'][];
expectTypeOf<Exclude<FoodCategory, (typeof FOOD_CATEGORIES)[number]>>().toBeNever();
expectTypeOf<Exclude<IngredientDef['unlock'], (typeof INGREDIENT_UNLOCKS)[number]>>().toBeNever();

/**
 * §1.5 카테고리 배분 — 위키 전량(음료 35 · 스낵 40 · 식사 30 · 디저트 35 = 140) + 실패작 4 + **한국 빠지 먹거리 36**
 * (P4-B: 어묵·붕어빵·떡볶이·라면·매운탕·팥빙수… 카테고리마다 9씩). 총 180.
 */
const RECIPE_COUNTS: Record<FoodCategory, number> = { drink: 45, snack: 51, meal: 40, dessert: 44 }; // G41: 실패작 4 (음료 1 · 스낵 2 · 식사 1)
/** 요리 레벨 해금 `level:N` — 요리는 2년차부터라 N 은 2 부터, 상한 10 (요리 Lv10 = 카이로봇 특식) */
const LEVEL_UNLOCK = /^level:([2-9]|10)$/;
const ingredientIds = new Set(ingredients.map((i) => i.id));
const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
const recipeIds = new Set(recipes.map((r) => r.id));
const restaurantIds = facilities.filter((f) => f.class === 'restaurant').map((f) => f.id).sort();
const ingredientsOf = (r: RecipeDef) => r.key.split('+');

describe('ingredients.json', () => {
  it('has 70 unique snake_case ids with Korean names and a known unlock', () => {
    expect(ingredients).toHaveLength(70);
    expect(ingredientIds.size).toBe(70);
    for (const i of ingredients) {
      expect(i.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(i.name, i.id).toMatch(/[가-힣]/);
      expect(INGREDIENT_UNLOCKS, i.id).toContain(i.unlock);
    }
  });

  it('`year` is present iff unlock === "year" (2..8); `price` iff unlock !== "start" (P56-c 재고 — 장날 300~900 · 보상 재료는 재구매 값 500~1,300, 시작 재료는 무한이라 값이 없다)', () => {
    for (const i of ingredients) {
      expect(i.year !== undefined, `${i.id} year`).toBe(i.unlock === 'year');
      if (i.year !== undefined) expect(inBand(i.year, [2, 8]), `${i.id} year=${i.year}`).toBe(true);
      expect(i.price !== undefined, `${i.id} price`).toBe(i.unlock !== 'start');
      if (i.price !== undefined) expect(inBand(i.price, i.unlock === 'shop' ? [300, 900] : [500, 1300]), `${i.id} price=${i.price}`).toBe(true);
      if (i.unlock === 'year') expect(i.price, `${i.id} 연차 재료 값 = 500 + 100×연차`).toBe(500 + 100 * (i.year ?? 0));
    }
  });

  it('every source from §1.5 hands out something (start · shop · wish · cert · year)', () => {
    for (const u of INGREDIENT_UNLOCKS) expect(ingredients.some((i) => i.unlock === u), u).toBe(true);
    expect(ingredients.filter((i) => i.unlock === 'start').length).toBeGreaterThanOrEqual(8);
  });

  it('every ingredient is used by at least one recipe (no dead key — wish/cert rewards must matter)', () => {
    const used = new Set(recipes.flatMap(ingredientsOf));
    for (const i of ingredients) expect(used.has(i.id), `${i.id} (${i.unlock}) is used by no recipe`).toBe(true);
  });
});

describe('recipes.json', () => {
  it('has 180 unique ids (140 + 실패작 4 + 빠지 먹거리 36), unique keys, Korean names, category ∈ FoodCategory', () => {
    expect(recipes).toHaveLength(180);
    expect(recipeIds.size).toBe(180);
    expect(new Set(recipes.map((r) => r.key)).size, 'duplicate key').toBe(180);
    expect(recipes.filter((r) => r.unlock === 'fail').length).toBe(4);
    for (const r of recipes) {
      expect(r.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(r.name, r.id).toMatch(/[가-힣]/);
      expect(FOOD_CATEGORIES, r.id).toContain(r.cat);
    }
  });

  it('key is the sorted multiset of 2~5 existing ingredient ids (or `@class` wildcards, G41) joined with "+"', () => {
    for (const r of recipes) {
      if (r.unlock === 'fail') continue; // 실패작은 키로 안 찾는다
      const parts = ingredientsOf(r);
      expect(inBand(parts.length, [2, 5]), `${r.id} has ${parts.length} ingredients`).toBe(true);
      expect(r.key, `${r.id} key not sorted`).toBe([...parts].sort().join('+'));
      for (const p of parts) {
        if (p.startsWith('@')) expect(INGREDIENT_CLASSES as readonly string[], `${r.id} class ${p}`).toContain(p.slice(1));
        else expect(ingredientIds.has(p), `${r.id} ingredient ${p}`).toBe(true);
      }
    }
  });

  it('와일드카드 레시피 ≥ 8 · 강화 사슬은 2단까지, 상위 요리 인기 ≤ 기본 +5 · 가격 ≤ 기본 ×1.6 (G41)', () => {
    expect(recipes.filter((r) => r.key.includes('@') && r.unlock !== 'fail').length).toBeGreaterThanOrEqual(8);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const price = (r: RecipeDef) => r.taste + r.look + r.pop;
    for (const r of recipes) {
      for (const u of r.upgradeOf ?? []) {
        const base = byId.get(u.base)!;
        expect(base, `${r.id} base ${u.base}`).toBeDefined();
        expect(r.pop, `${r.id} pop`).toBeLessThanOrEqual(base.pop + 5);
        expect(price(r), `${r.id} price`).toBeLessThanOrEqual(price(base) * 1.6 + 1e-9);
        expect(base.upgradeOf?.some((x) => byId.get(x.base)?.upgradeOf?.length), `${r.id} chain > 2`).toBeFalsy();
      }
    }
    for (const i of ingredients) expect(INGREDIENT_CLASSES as readonly string[], i.id).toContain(i.class ?? 'base');
  });

  it('category counts follow §1.5 (drink 35 · snack 40 · meal 30 · dessert 35)', () => {
    for (const cat of FOOD_CATEGORIES) expect(recipes.filter((r) => r.cat === cat).length, cat).toBe(RECIPE_COUNTS[cat]);
  });

  it('stats taste/look/pop are integers 1..16 (시작 재료 2~6 · 트러플·8년차 재료 10~16)', () => {
    for (const r of recipes) {
      for (const k of ['taste', 'look', 'pop'] as const) {
        expect(Number.isInteger(r[k]), `${r.id} ${k}`).toBe(true);
        expect(inBand(r[k], [1, 16]), `${r.id} ${k}=${r[k]}`).toBe(true);
      }
    }
  });

  it('unlock ∈ start | cook | level:N (N 2..10) | fail; at least 20 start recipes and 10 level recipes', () => {
    for (const r of recipes) {
      expect(r.unlock === 'start' || r.unlock === 'cook' || r.unlock === 'fail' || LEVEL_UNLOCK.test(r.unlock), `${r.id} unlock=${r.unlock}`).toBe(true);
    }
    expect(recipes.filter((r) => r.unlock === 'start').length).toBeGreaterThanOrEqual(20);
    expect(recipes.filter((r) => r.unlock === 'cook').length).toBeGreaterThanOrEqual(30);
    expect(recipes.filter((r) => LEVEL_UNLOCK.test(r.unlock)).length).toBeGreaterThanOrEqual(10);
  });

  it('start recipes use only start ingredients (the 1st-year kitchen must not point at the shop)', () => {
    for (const r of recipes.filter((r) => r.unlock === 'start')) {
      for (const p of ingredientsOf(r)) { if (p.startsWith('@')) continue; expect(ingredientById.get(p)!.unlock, `${r.id} uses ${p}`).toBe('start'); }
    }
    // 시작 도감이 4 카테고리를 다 보여 줘야 「4종 다 넣으면 보너스」를 처음부터 배울 수 있다
    for (const cat of FOOD_CATEGORIES) expect(recipes.some((r) => r.unlock === 'start' && r.cat === cat), cat).toBe(true);
  });

  it('every ingredient of every recipe is obtainable (its unlock is one of the five sources)', () => {
    for (const r of recipes) {
      if (r.unlock === 'fail') continue;
      for (const p of ingredientsOf(r)) { if (p.startsWith('@')) continue; expect(INGREDIENT_UNLOCKS, `${r.id} ${p}`).toContain(ingredientById.get(p)!.unlock); }
    }
  });

  it('the §1.5 signature dishes exist with their canonical keys', () => {
    const key = (id: string) => recipes.find((r) => r.id === id)?.key;
    expect(key('lemonade')).toBe('lemon_fruit+lemon_fruit+sugar+water');
    expect(key('salmon_sushi')).toBe('rice+salmon+seaweed');
    expect(key('tropical_juice')).toBe('banana_fruit+coconut_milk+mango');
    expect(key('choco_mint_ice_cream')).toBe('chocolate_bar+cream+matcha+milk');
    expect(key('curry_rice')).toBe('beef+curry_powder+potato+rice');
  });
});

describe('compat.json', () => {
  it('has exactly one entry per restaurant in facilities.json', () => {
    expect(compat.map((c) => c.restaurant).sort()).toEqual(restaurantIds);
  });

  it('good 5~10 and bad 2~5 recipe ids exist, with no recipe both good and bad in one restaurant', () => {
    for (const c of compat) {
      expect(inBand(c.good.length, [5, 10]), `${c.restaurant} good=${c.good.length}`).toBe(true);
      expect(inBand(c.bad.length, [2, 5]), `${c.restaurant} bad=${c.bad.length}`).toBe(true);
      expect(new Set(c.good).size, `${c.restaurant} duplicate good`).toBe(c.good.length);
      expect(new Set(c.bad).size, `${c.restaurant} duplicate bad`).toBe(c.bad.length);
      for (const id of [...c.good, ...c.bad]) expect(recipeIds.has(id), `${c.restaurant} recipe ${id}`).toBe(true);
      const good = new Set(c.good);
      for (const id of c.bad) expect(good.has(id), `${c.restaurant} ${id} is both good and bad`).toBe(false);
    }
  });

  it('every 1st-year restaurant (start · day-3 gift) has a ⊚ recipe in the start book (it can open with a fit menu)', () => {
    const firstYear = facilities.filter((f) => f.class === 'restaurant' && (f.unlock.source === 'start' || f.unlock.source === 'gift'));
    expect(firstYear.length).toBeGreaterThanOrEqual(4);
    for (const f of firstYear) {
      const c = compat.find((c) => c.restaurant === f.id)!;
      expect(c.good.some((id) => recipes.find((r) => r.id === id)!.unlock === 'start'), f.id).toBe(true);
    }
  });
});


describe('G8 — 투자 · 캠페인', () => {
  it('투자 단계는 트랙별 1..n 연속, 해금 시설은 실재하고 invest 출처 시설은 정확히 한 단계가 연다', async () => {
    const invest = (await import('./invest.json')).default as { id: string; track: string; order: number; cost: number; unlocks: string[] }[];
    const facs = (await import('./facilities.json')).default as { id: string; unlock: { source: string; ref?: string } }[];
    const ids = new Set(facs.map((f) => f.id));
    for (const track of ['attraction', 'lounge']) {
      const orders = invest.filter((d) => d.track === track).map((d) => d.order).sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, k) => k + 1));
    }
    for (const d of invest) for (const u of d.unlocks) expect(ids.has(u), u).toBe(true);
    for (const f of facs.filter((x) => x.unlock.source === 'invest')) {
      expect(invest.filter((d) => d.unlocks.includes(f.id)).length, f.id).toBe(1);
      expect(invest.find((d) => d.unlocks.includes(f.id))?.id).toBe(f.unlock.ref);
    }
  });
  it('캠페인 — 광고는 배율 > 1, 버스는 배율 1(좌석으로 온다, G40) · 쿨다운 ≥ 효과 일수', async () => {
    const c = (await import('./campaigns.json')).default as { id: string; kind?: string; mul: number; days: number; cooldown: number; cost: number }[];
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c.filter((d) => d.kind === 'bus').length).toBe(1);
    for (const d of c) { if (d.kind === 'bus') expect(d.mul).toBe(1); else expect(d.mul).toBeGreaterThan(1); expect(d.cooldown).toBeGreaterThanOrEqual(d.days); expect(d.cost).toBeGreaterThan(0); }
  });
});

// ── P7: 기구 공방 — 부품 → 견인 기구 (요리 개발과 같은 문법, 낱말만 다르다) ────────────────
/** 부품 계열 8종. 요리의 `IngredientClass` 와 이름 공간이 다르다 — 공방은 자기 계열을 쓴다 */
const PART_CLASSES = ['engine', 'tube', 'rope', 'handle', 'seat', 'safety', 'board', 'fun'] as const;
/** 부품 출처 — 보상 표(`cert`·`wish`)는 아직 없다 (§공방 D-1: 잠글 곳과 얻을 곳은 같이 온다) */
const PART_UNLOCKS = ['start', 'shop', 'year'] as const;
const GEAR_CATS = ['tube', 'board', 'ski', 'special'] as const;
interface PartDef { id: string; name: string; unlock: (typeof PART_UNLOCKS)[number]; class: (typeof PART_CLASSES)[number]; price?: number; year?: number }
interface GearDef {
  id: string; name: string; cat: (typeof GEAR_CATS)[number]; key: string;
  taste: number; look: number; pop: number;
  unlock: 'start' | 'cook' | `level:${number}` | 'fail';
  upgradeOf?: { base: string; add: string[] }[];
}

/** 공방이 새로 더한 기구 11 — 승계 19(부모 `kairo-equipment.json`)와 갈라 두고 적합도 문턱을 따로 잰다 */
const WORKSHOP_GEARS = new Set([
  'sofa_boat', 'flycarpet', 'rocket_tube', 'discopang', 'blobjump', 'water_roller',
  'watersled', 'kneeboard', 'air_chair', 'marine_jet', 'hydrofoil',
]);

describe('parts.json / gears.json', () => {
  // 동적 import — 이 절만 쓰는 두 파일을 머리에 올리지 않는다
  const load = async () => {
    const parts = (await import('./parts.json')).default as unknown as PartDef[];
    const gears = (await import('./gears.json')).default as unknown as GearDef[];
    const equipment = ((await import('./equipment.json')).default as unknown as { equipment: { id: string; start?: boolean }[] }).equipment;
    return { parts, gears, equipment };
  };
  const partsOf = (g: GearDef) => g.key.split('+');

  it('부품 40± 개 — id 유일 snake_case · 한글 이름 · class 는 8계열 · 출처는 start|shop|year', async () => {
    const { parts } = await load();
    expect(inBand(parts.length, [36, 48]), `${parts.length}종`).toBe(true);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    for (const p of parts) {
      expect(p.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(p.name, p.id).toMatch(/[가-힣A-Z]/);
      expect(PART_CLASSES as readonly string[], p.id).toContain(p.class);
      expect(PART_UNLOCKS as readonly string[], p.id).toContain(p.unlock);
    }
    // 8계열이 전부 있어야 와일드카드 `@engine` 이 채워진다
    for (const c of PART_CLASSES) expect(parts.some((p) => p.class === c), c).toBe(true);
  });

  it('`price` 는 start 가 아닐 때(P56-c 재고 — 장날 200~1,500G · 연차 부품은 재구매 값 600+100×연차) · `year` 는 year 일 때만 (2~8) · 시작 부품 6~8', async () => {
    const { parts } = await load();
    for (const p of parts) {
      expect(p.price !== undefined, `${p.id} price`).toBe(p.unlock !== 'start');
      if (p.price !== undefined) expect(inBand(p.price, [200, 1500]), `${p.id} price=${p.price}`).toBe(true);
      if (p.unlock === 'year') expect(p.price, `${p.id} 연차 부품 값`).toBe(600 + 100 * (p.year ?? 0));
      expect(p.year !== undefined, `${p.id} year`).toBe(p.unlock === 'year');
      if (p.year !== undefined) expect(inBand(p.year, [2, 8]), `${p.id} year=${p.year}`).toBe(true);
    }
    expect(inBand(parts.filter((p) => p.unlock === 'start').length, [6, 8])).toBe(true);
    for (const u of PART_UNLOCKS) expect(parts.some((p) => p.unlock === u), u).toBe(true);
  });

  it('기구 키는 정렬된 부품 다중집합(2~5) · 부품/와일드카드 실재 · 키 유일', async () => {
    const { parts, gears } = await load();
    const partIds = new Set(parts.map((p) => p.id));
    expect(new Set(gears.map((g) => g.id)).size, 'id 중복').toBe(gears.length);
    expect(new Set(gears.map((g) => g.key)).size, 'key 중복').toBe(gears.length);
    for (const g of gears) {
      expect(g.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(g.name, g.id).toMatch(/[가-힣]/);
      expect(GEAR_CATS as readonly string[], g.id).toContain(g.cat);
      if (g.unlock === 'fail') continue; // 실패작은 키로 안 찾는다
      const ps = partsOf(g);
      expect(inBand(ps.length, [2, 5]), `${g.id} 부품 ${ps.length}개`).toBe(true);
      expect(g.key, `${g.id} 키가 정렬 안 됨`).toBe([...ps].sort().join('+'));
      for (const p of ps) {
        if (p.startsWith('@')) expect(PART_CLASSES as readonly string[], `${g.id} 계열 ${p}`).toContain(p.slice(1));
        else expect(partIds.has(p), `${g.id} 부품 ${p}`).toBe(true);
      }
    }
  });

  it('unlock ∈ start | cook | level:N (N ≤ 10) | fail — 실패작 3 · 레벨 게이트 4~6', async () => {
    const { gears } = await load();
    for (const g of gears) {
      expect(g.unlock === 'start' || g.unlock === 'cook' || g.unlock === 'fail' || LEVEL_UNLOCK.test(g.unlock), `${g.id} unlock=${g.unlock}`).toBe(true);
      if (LEVEL_UNLOCK.test(g.unlock)) expect(Number(g.unlock.slice('level:'.length)), g.id).toBeLessThanOrEqual(10);
    }
    expect(gears.filter((g) => g.unlock === 'fail').length).toBe(3);
    expect(inBand(gears.filter((g) => LEVEL_UNLOCK.test(g.unlock)).length, [4, 6])).toBe(true);
    expect(gears.filter((g) => g.key.includes('@') && g.unlock !== 'fail').length, '와일드카드 기구').toBeGreaterThanOrEqual(2);
  });

  it('스탯 taste/look/pop 은 1..10 정수', async () => {
    const { gears } = await load();
    for (const g of gears) for (const k of ['taste', 'look', 'pop'] as const) {
      expect(Number.isInteger(g[k]), `${g.id} ${k}`).toBe(true);
      expect(inBand(g[k], [1, 10]), `${g.id} ${k}=${g[k]}`).toBe(true);
    }
  });

  it('발견 = 그 기구를 갖는다 — 비-fail 기구는 equipment 에 실재하고, 비-start equipment 는 전부 발견 가능', async () => {
    const { gears, equipment } = await load();
    const equipIds = new Set(equipment.map((e) => e.id));
    const gearIds = new Set(gears.filter((g) => g.unlock !== 'fail').map((g) => g.id));
    for (const g of gears) {
      if (g.unlock === 'fail') expect(equipIds.has(g.id), `${g.id} 실패작은 equipment 에 없어야 한다`).toBe(false);
      else expect(equipIds.has(g.id), `${g.id} — equipment 에 없다`).toBe(true);
    }
    // 하나라도 빠지면 그 기구는 영원히 못 얻는다 (상점에도 없다)
    for (const e of equipment) expect(gearIds.has(e.id), `${e.id} — gears.json 에 없어 발견 불가`).toBe(true);
    // 시작 소유 = equipment 의 `start: true` 와 정확히 같은 집합
    expect(gears.filter((g) => g.unlock === 'start').map((g) => g.id).sort())
      .toEqual(equipment.filter((e) => e.start === true).map((e) => e.id).sort());
  });

  it('강화 사슬 — base 실재 · 자기 자신 금지 · 순환 없음 · base 부품 + add ≤ 5 (넣을 수 있어야 사슬이다)', async () => {
    const { parts, gears } = await load();
    const partIds = new Set(parts.map((p) => p.id));
    const byId = new Map(gears.map((g) => [g.id, g]));
    let chains = 0;
    for (const g of gears) {
      for (const u of g.upgradeOf ?? []) {
        chains++;
        const base = byId.get(u.base);
        expect(base, `${g.id} base ${u.base}`).toBeDefined();
        expect(u.base, `${g.id} 자기 자신을 base 로`).not.toBe(g.id);
        expect(base!.unlock, `${g.id} base ${u.base} 가 실패작`).not.toBe('fail');
        expect(u.add.length, `${g.id} add 가 비었다`).toBeGreaterThan(0);
        for (const a of u.add) {
          if (a.startsWith('@')) expect(PART_CLASSES as readonly string[], `${g.id} add ${a}`).toContain(a.slice(1));
          else expect(partIds.has(a), `${g.id} add ${a}`).toBe(true);
        }
        // 강화 경로도 개발 창의 5칸을 넘을 수 없다 — 넘으면 그 경로는 영원히 안 열린다
        expect(base!.key.split('+').length + u.add.length, `${g.id} ← ${u.base} 경로가 5부품 초과`).toBeLessThanOrEqual(5);
        expect(g.pop, `${g.id} pop`).toBeGreaterThanOrEqual(base!.pop - 1);
      }
    }
    expect(chains, '강화 사슬').toBeGreaterThanOrEqual(5);
    // 순환 금지 — base 를 따라가면 반드시 멎는다
    const depth = (id: string, seen = new Set<string>()): number => {
      if (seen.has(id)) throw new Error(`강화 사슬 순환: ${[...seen, id].join(' → ')}`);
      const g = byId.get(id);
      if (!g?.upgradeOf?.length) return 1;
      return 1 + Math.max(...g.upgradeOf.map((u) => depth(u.base, new Set([...seen, id]))));
    };
    const depths = gears.map((g) => depth(g.id));
    expect(Math.max(...depths), '사슬은 3단까지').toBeLessThanOrEqual(3);
    expect(depths.filter((d) => d >= 3).length, '3단 사슬').toBeGreaterThanOrEqual(1);
  });

  it('`fillFor` 논리 — 모든 기구가 부품만으로 도달 가능하다 (막다른 기구 0)', async () => {
    const { parts, gears } = await load();
    // 부품 출처가 셋(start·shop·year) 중 하나면 언젠가 손에 들어온다 — 즉 부품은 전부 도달 가능
    const owned = new Set(parts.filter((p) => (PART_UNLOCKS as readonly string[]).includes(p.unlock)).map((p) => p.id));
    const classOf = new Map(parts.map((p) => [p.id, p.class as string]));
    const fillFor = (g: GearDef): string[] | null => {
      if (g.unlock === 'fail') return null;
      const out: string[] = [];
      for (const p of partsOf(g)) {
        if (p.startsWith('@')) {
          const hit = [...owned].sort().find((id) => classOf.get(id) === p.slice(1));
          if (!hit) return null;
          out.push(hit);
        } else {
          if (!owned.has(p)) return null;
          out.push(p);
        }
      }
      return out;
    };
    for (const g of gears) {
      if (g.unlock === 'fail') continue;
      expect(fillFor(g), `${g.id} — 부품으로 못 채운다`).not.toBeNull();
    }
    // 쓰이지 않는 부품이 있으면 그 부품은 죽은 열쇠다 (상점·연차 보상이 뜻이 없어진다)
    const used = new Set(gears.flatMap(partsOf));
    for (const p of parts) expect(used.has(p.id) || used.has(`@${p.class}`), `${p.id} (${p.unlock}) 를 쓰는 기구가 없다`).toBe(true);
  });

  it('적합도 — 기구 30종 × 프리셋 6종이 다 채워지고 저마다 `best` 형태가 하나는 있다', async () => {
    const courses = (await import('./courses.json')).default as unknown as { presets: { id: string }[]; fit: Record<string, Record<string, string>> };
    const { gears } = await load();
    const presetIds = courses.presets.map((p) => p.id);
    for (const g of gears) {
      if (g.unlock === 'fail') continue; // 실패작은 기구가 아니라 도감 항목이다
      const row = courses.fit[g.id];
      expect(row, `${g.id} — 적합도 행이 없다`).toBeDefined();
      for (const p of presetIds) expect(['best', 'ok', 'poor', 'no'], `${g.id} × ${p}`).toContain(row![p]);
      expect(presetIds.some((p) => row![p] === 'best'), `${g.id} — best 형태가 없다`).toBe(true);
      // 승계 19 는 부모 표 그대로다 (`wagon` 은 no 가 셋 — 10인승이라 굽은 형태를 못 탄다). 공방분만 조인다
      if (WORKSHOP_GEARS.has(g.id)) expect(presetIds.filter((p) => row![p] === 'no').length, `${g.id} — no 가 3개 이상`).toBeLessThanOrEqual(2);
    }
    expect([...WORKSHOP_GEARS].every((id) => gears.some((g) => g.id === id)), '공방 기구 목록이 데이터와 갈라졌다').toBe(true);
  });
});

// ── P49-a1 §4.0 validateRigData — class:'rig' 정의역 전부 ──
describe('validateRigData (P49-a1)', () => {
  const rigs = facilities.filter((f) => f.class === 'rig');
  it('rig ⇒ depth 필수 · slide null · menuSlots 0 · indoorOnly false · usageFee 0 · capacity ≥ 1 · needsVest ⇔ deep · buildable:false ⇒ craft · maxPerPark 정확히 1종', () => {
    expect(rigs.length).toBeGreaterThanOrEqual(17);
    for (const f of rigs) {
      expect(['shallow', 'deep', 'any'], f.id).toContain(f.depth);
      expect(f.slide, f.id).toBeNull(); expect(f.menuSlots, f.id).toBe(0); expect(f.indoorOnly, f.id).toBe(false); expect(f.usageFee, f.id).toBe(0); expect(f.capacity, f.id).toBeGreaterThanOrEqual(1);
      expect(f.needsVest === true, f.id).toBe(f.depth === 'deep');
      if (f.buildable === false) expect(f.unlock.source, f.id).toBe('craft');
      expect(f.thrill, f.id).toBeGreaterThanOrEqual(0); expect(f.thrill, f.id).toBeLessThanOrEqual(4);
    }
    expect(rigs.filter((f) => f.maxPerPark !== undefined).length).toBe(1);
    expect(rigs.filter((f) => f.bandCost === 2).length).toBeLessThanOrEqual(1);
  });
  it('링 위 비-rig 는 자기 class 띠를 따른다(watchtower·rig_rack·rescue_dock utility · rig_float_bar restaurant)', () => {
    for (const id of ['watchtower', 'rig_rack', 'rescue_dock']) expect(facilities.find((f) => f.id === id)!.class, id).toBe('utility');
    expect(facilities.find((f) => f.id === 'rig_float_bar')!.class).toBe('restaurant');
  });
});

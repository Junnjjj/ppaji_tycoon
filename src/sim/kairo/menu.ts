/**
 * Phase 3 메뉴 개발 규칙. UI는 이 상태를 그리기만 한다.
 *
 * 재료는 수량 없는 영구 해금 키이고, 발견한 레시피도 영구다. 소모·발주·
 * 유통기한·새 화폐를 만들지 않는다. 실패는 돈만 없애지 않고 다음 조합을
 * 좁히는 힌트와 진행률을 남긴다.
 */
import rawIngredients from '../../data/kairo-ingredients.json' with { type: 'json' };
import rawRecipes from '../../data/kairo-recipes.json' with { type: 'json' };
import type { GroupId } from './groups.js';
import type { PlacementGrid } from './placement.js';

export type TasteTag = 'cool' | 'warm' | 'sweet' | 'savory' | 'hearty' | 'light';

export interface IngredientDef {
  id: string;
  name: string;
  start?: boolean;
  /**
   * 이 재료가 **어느 시설의 조합 후보인가** (P2).
   *
   * ## 왜 필요한가
   *
   * 없을 때 조합 공간은 `C(재료, 2) × craft 시설` 이라 **시설을 늘릴 때마다 실패율이 오른다**
   * (실측: 재료 8 · 시설 2 → 28쌍×2 = 56칸에 정답 8 = **실패 86%**). 재료를 시설별로
   * 좁히면 공간이 `Σ C(그 시설 후보, 2)` 가 되어 시설을 더 늘려도 **실패율이 안 오른다.**
   *
   * ⚠ **강화 재료(`RecipeDef.add`)는 여기 없어도 된다** — 조합 발견과 강화는 다른 흐름이다.
   *   `facilities` 는 「무엇과 무엇을 섞어 볼까」의 후보이고, 강화는 이미 가진 요리에 하나를 얹는다.
   */
  facilities?: readonly string[];
}

export interface RecipeDef {
  id: string;
  name: string;
  /**
   * ⚠ P2 에서 `'shop' | 'cafe'` 에서 **`string`** 으로 넓혔다. craft 시설이 5종이 됐고
   * 앞으로 더 늘 수 있는데, 유니언으로 두면 데이터를 늘릴 때마다 **코드**를 고쳐야 한다
   * (불변식 3: 콘텐츠는 데이터가 정한다). 존재 여부는 `validateMenuData` 가 지킨다.
   */
  facilityId: string;
  ingredients: readonly [string, string];
  tags: readonly TasteTag[];
  price: number;
  satisfaction: number;
  developmentCost: number;
  start?: boolean;
  /**
   * 이 요리가 **무엇의 강화인가** (P2). 없으면 기본 요리다.
   *
   * ⚠ 강화는 「새로 만든다」가 아니라 **가진 것에 하나를 얹는다** — 슬롯이 1~3칸뿐인데
   * 요리가 수십 종이면 "뭘 넣지"가 스트레스가 된다. 키우는 축이 있으면 그게
   * **"넓힐까 키울까"** 라는 결정이 된다 (시설 개선의 특화 3갈래와 같은 문법).
   */
  base?: string;
  /** 강화에 더 넣는 재료 하나 */
  add?: string;
  /**
   * 이름만으로 재료를 못 짚을 때의 **손으로 적는 힌트** (`삼겹살 세트 ← 돼지고기`).
   * ⚠ 없으면 `validateMenuData` 가 잡는다 — 추측 가능성은 데이터가 지킨다.
   */
  hint?: string;
}

export const INGREDIENTS: readonly IngredientDef[] = (
  rawIngredients as unknown as { ingredients: IngredientDef[] }
).ingredients;
export const RECIPES: readonly RecipeDef[] = (
  rawRecipes as unknown as { recipes: RecipeDef[] }
).recipes;

const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((x) => [x.id, x]));
const RECIPE_BY_ID = new Map(RECIPES.map((x) => [x.id, x]));

/**
 * 메뉴 데이터가 스스로 성립하는가 (P2).
 *
 * ## 왜 검사가 데이터보다 먼저인가
 *
 * `menuFacilityOperability` 는 craft 시설에 **장착 메뉴가 하나도 없으면 `operable: false`** 다.
 * 그 판정을 **네 소비자가 공유한다** — 손님 목적지 · 주간 공급 · 병목의 built 공급 ·
 * **입장 정원**(`operationalCapacity` → `admissionLimit` 의 `공급 × 1.5`).
 *
 * 그래서 시설을 craft 로 승격하면서 `startingMenu` 를 안 주면, **이미 세이브에 서 있는 그
 * 시설이 통째로 어두워지고 판이 조용히 작아진다.** 화면에는 아무 말도 안 뜬다 —
 * 결산 병목은 `built`(선 시설 미제외)를 보므로 "먹거리가 있다"고 판단해 처방조차 안 낸다.
 *
 * ⚠ **그래서 이 검사가 데이터 변경보다 먼저다.** 승격을 먼저 하면 되돌릴 때까지
 * 그 판이 왜 작아졌는지 아무도 못 찾는다.
 *
 * ⚠ 반대 방향(craft → 고정)은 **안전하다** — 코드로 확인했다:
 * `menuFacilityOperability` 가 non-craft 를 무조건 `operable: true` 로 돌려주고
 * `PlacementGrid.fromSnapshot` 이 그 시설의 `menuIds` 를 지운다. 마이그레이션이 필요 없다.
 */
export interface MenuDataProblem {
  kind:
    | 'no-start-recipe'
    | 'start-not-in-menu'
    | 'unknown-facility'
    | 'unknown-ingredient'
    | 'thin-density'
    | 'unguessable'
    | 'unreachable-ingredient'
    | 'chain-too-strong';
  detail: string;
}

/**
 * 후보 밀도의 하한 — `정답쌍 / C(후보 재료, 2)`.
 *
 * ⚠ 이 값이 없으면 **시설을 늘릴 때마다 실패율이 오른다.** 도입 전 실측이 재료 8 · 시설 2 에
 * 정답 8 = **실패 86%** 였고, 재료를 `facilities` 로 좁힌 뒤 **58%** 다. 0.35 는 "세 번에
 * 한 번은 맞는다"이고, 그보다 낮으면 실험이 벌처럼 느껴진다.
 */
export const MENU_DENSITY_MIN = 0.35;

/**
 * @param craftFacilityIds `menuMode: 'craft'` 인 시설 id 와 그 `startingMenu`.
 *   ⚠ sim 은 `placement` 를 여기서 import 하지 않는다 — 부르는 쪽이 넘긴다
 *   (`menu.ts` 는 시설 정의를 모르는 것이 이 파일의 계약이다).
 */
export function validateMenuData(
  craftFacilities: readonly { id: string; startingMenu?: readonly string[] | undefined }[],
  obtainableIngredientIds?: readonly string[],
): MenuDataProblem[] {
  const problems: MenuDataProblem[] = [];
  const craftIds = new Set(craftFacilities.map((f) => f.id));

  // ① 모든 craft 시설이 `start: true` 레시피를 **정확히 하나** 갖고, startingMenu 가 그것을 담는다
  for (const f of craftFacilities) {
    const starts = RECIPES.filter((r) => r.facilityId === f.id && r.start === true);
    if (starts.length !== 1) {
      problems.push({
        kind: 'no-start-recipe',
        detail: `${f.id}: start 레시피 ${starts.length}개 (정확히 1개여야 한다)`,
      });
      continue;
    }
    const first = starts[0]!;
    if (!(f.startingMenu ?? []).includes(first.id)) {
      problems.push({
        kind: 'start-not-in-menu',
        detail: `${f.id}: startingMenu 가 ${first.id} 를 안 담는다`,
      });
    }
  }

  // ② 모든 레시피의 facilityId 가 실제 craft 시설이다
  for (const r of RECIPES) {
    if (!craftIds.has(r.facilityId)) {
      problems.push({ kind: 'unknown-facility', detail: `${r.id} → ${r.facilityId}` });
    }
  }

  // ③ 모든 재료가 존재한다 — 없으면 그 레시피는 **영원히 개발 불가**다 (해금 교착과 같은 종류)
  for (const r of RECIPES) {
    for (const id of r.ingredients) {
      if (!INGREDIENT_BY_ID.has(id)) {
        problems.push({ kind: 'unknown-ingredient', detail: `${r.id} → ${id}` });
      }
    }
  }

  // ④ 후보 밀도 — 시설을 늘려도 실패율이 안 오르게 하는 유일한 장치
  for (const f of craftFacilities) {
    const pool = INGREDIENTS.filter((x) => (x.facilities ?? []).includes(f.id));
    const pairs = (pool.length * (pool.length - 1)) / 2;
    const answers = RECIPES.filter((r) => r.facilityId === f.id && r.base === undefined).length;
    if (pairs === 0 || answers / pairs < MENU_DENSITY_MIN) {
      problems.push({
        kind: 'thin-density',
        detail: `${f.id}: 후보 ${pool.length}종 ${pairs}쌍 중 정답 ${answers} = ` +
          `${pairs === 0 ? 0 : (answers / pairs).toFixed(2)} (${MENU_DENSITY_MIN} 이상)`,
      });
    }
  }

  /*
   * ⑤ **이름만으로 재료를 추측할 수 있다.**
   *
   * 정답표 없이도 발견이 되는 것이 이 루프의 재미이고, 그것을 성립시키는 것은 **재료 이름이
   * 현실**이라는 사실이다 (`감자 + 기름 = 감자튀김`). 이름에 재료가 안 드러나는 요리는
   * `hint` 를 **적게 강제한다** — 사람이 "직관적이겠지" 하고 넘어가는 자리를 데이터가 막는다.
   */
  for (const r of RECIPES) {
    if (r.hint !== undefined && r.hint !== '') continue;
    // 강화는 **더 넣는 재료**가 단서다 (`치즈 떡볶이 ← 치즈`) — 기본 쌍만 보면 전부 hint 강제가 된다
    const source = r.base === undefined ? r.ingredients : [...r.ingredients, r.add ?? ''];
    const names = source
      .map((id) => INGREDIENT_BY_ID.get(id)?.name)
      .filter((n): n is string => n !== undefined);
    if (!names.some((n) => r.name.includes(n))) {
      problems.push({
        kind: 'unguessable',
        detail: `${r.id} "${r.name}" ← ${names.join('+')} (hint 를 적을 것)`,
      });
    }
  }

  /*
   * ⑥ **재료를 실제로 손에 넣을 수 있다.**
   *
   * ③ 은 "재료가 존재하나"만 봤다. 존재하는데 `start` 도 아니고 아무 보상도 안 주는
   * 재료가 있으면 그 요리는 ③ 을 통과한 채로 **영원히 개발 불가**다 — 해금 그래프 검사가
   * 「의뢰 조건은 골격만으로 충족 가능해야 한다」로 막는 것과 같은 종류의 교착이고,
   * 실제로 `연유`(`bung_condensed` 의 정답 재료)가 그 상태로 들어와 있었다.
   *
   * ⚠ 무엇이 손에 들어오나는 **부르는 쪽이 넘긴다** — `menu.ts` 는 소원·의뢰를 모른다.
   */
  if (obtainableIngredientIds !== undefined) {
    const have = new Set(obtainableIngredientIds);
    for (const r of RECIPES) {
      for (const id of [...r.ingredients, ...(r.add === undefined ? [] : [r.add])]) {
        if (INGREDIENT_BY_ID.has(id) && !have.has(id)) {
          problems.push({ kind: 'unreachable-ingredient', detail: `${r.id} → ${id}` });
        }
      }
    }
  }

  /*
   * ⑦ **사슬이 다른 축을 잡아먹지 않는다.**
   *
   * 상한은 **게임의 기존 눈금에서 유도한다** — 콤보가 `satCap 10`·`revCap 18` 을 등급
   * 문턱·요금 슬라이더 폭에서 뽑은 것과 같은 방식이다 (계획 §8-8):
   *
   * · **가격 2단 총합 ≤ +60%** — 시설 개선이 이미 `LEVEL_FEE_STEP 0.3 × 4단 = +120%`
   *   를 준다. 그 **절반**이어야 "요리를 키운다"가 "시설을 키운다"를 안 덮는다.
   *   (한 단 = `SPECIALTY_FEE_BONUS` 0.25 → 2단 ×1.5625 = **+56%** 로 앉는다.)
   * · **만족 2단 총합 ≤ +5** — 콤보 `satCap 10`(등급 문턱 간격)의 절반. 요리 하나가
   *   등급을 밀면 안 된다.
   * · **사슬은 2단까지** — 더 길면 슬롯 1~3칸에 "키우기"만 남는다 (D8).
   *
   * ⚠ 세 상한을 **코드에 적지 말고** 여기 상수로 둔다. `menu.ts` 는 `placement` 를
   * import 하지 않으므로(불변식 1 의 방향은 아니지만 순환이 된다) 유도값을 옮겨 적되
   * **무엇에서 나왔는지**를 이 주석이 들고 있는다.
   */
  for (const root of RECIPES) {
    if (root.base !== undefined) continue;
    let cur = root;
    let steps = 0;
    for (;;) {
      const next = RECIPES.find((x) => x.base === cur.id);
      if (!next) break;
      cur = next;
      steps += 1;
      if (steps > CHAIN_MAX_STEPS) break;
    }
    if (steps === 0) continue;
    const grew = cur.price / root.price - 1;
    const gained = cur.satisfaction - root.satisfaction;
    if (steps > CHAIN_MAX_STEPS || grew > CHAIN_PRICE_MAX || gained > CHAIN_SAT_MAX) {
      problems.push({
        kind: 'chain-too-strong',
        detail: `${root.id}: ${steps}단 (≤${CHAIN_MAX_STEPS}) · 가격 +${(grew * 100).toFixed(0)}% ` +
          `(≤${CHAIN_PRICE_MAX * 100}%) · 만족 +${gained} (≤${CHAIN_SAT_MAX})`,
      });
    }
  }
  return problems;
}

/** 사슬은 **2단까지**다 (D8). 더 길어지면 슬롯 1~3칸에 "키우기"만 남는다 */
export const CHAIN_MAX_STEPS = 2;
/** 2단 총 가격 상승 상한 — 시설 개선의 `LEVEL_FEE_STEP 0.3 × 4단 = +120%` 의 **절반** */
export const CHAIN_PRICE_MAX = 0.6;
/** 2단 총 만족 상승 상한 — 콤보 `satCap 10`(등급 문턱 간격)의 **절반** */
export const CHAIN_SAT_MAX = 5;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

export function recipeDef(id: string | null | undefined): RecipeDef | undefined {
  return id ? RECIPE_BY_ID.get(id) : undefined;
}

export function ingredientDef(id: string | null | undefined): IngredientDef | undefined {
  return id ? INGREDIENT_BY_ID.get(id) : undefined;
}

export function recipesForFacility(facilityId: string): readonly RecipeDef[] {
  return RECIPES.filter((x) => x.facilityId === facilityId);
}

/**
 * **재료 두 개로 맞힐 수 있는 것만** — 강화(`base`)는 조합의 정답이 아니다.
 *
 * ⚠ 강화 요리는 `ingredients` 에 기본 요리와 **같은 쌍**을 담는다 (그 요리를 키운 것이니까).
 * 그래서 조합 판정이 이 필터를 안 쓰면 `pairKey` 로 강화판이 먼저 잡혀서, 기본을 건너뛰고
 * 2단이 튀어나온다 — 사슬이 통째로 무의미해진다.
 */
export function baseRecipesForFacility(facilityId: string): readonly RecipeDef[] {
  return RECIPES.filter((x) => x.facilityId === facilityId && x.base === undefined);
}

/** 이 요리를 키우는 한 단들 (지금 데이터는 사슬 한 갈래라 0~1개) */
export function enhancementsOf(recipeId: string): readonly RecipeDef[] {
  return RECIPES.filter((x) => x.base === recipeId);
}

/**
 * 그 시설에서 **쓸 수 있는 재료**. `facilities` 를 안 적은 재료는 어느 시설 조합에도 안 들어간다
 * (지금은 `치즈` 하나 — 상점이 들어올 자리다).
 *
 * ⚠ 화면도 이 함수를 써야 한다. 예전 `menuLabModel` 은 해금한 재료를 **전부** 칩으로 깔아서,
 * 데이터가 좁혀 놓은 후보를 화면이 도로 넓히고 있었다 — 밀도 하한(`MENU_DENSITY_MIN`)이
 * 재는 세계와 플레이어가 보는 세계가 갈라진다.
 */
export function ingredientsForFacility(facilityId: string): readonly IngredientDef[] {
  return INGREDIENTS.filter((x) => (x.facilities ?? []).includes(facilityId));
}

export function isRecipeForFacility(recipeId: string, facilityId: string): boolean {
  return RECIPE_BY_ID.get(recipeId)?.facilityId === facilityId;
}

export interface MenuFacilityOperability {
  /** 손님 목적지·주간 공급·입장 정원에 포함해도 되는가. */
  operable: boolean;
  /** 시설에 맞고 현재 발견 저장소에도 존재하는 장착 메뉴만 남긴 정본 목록. */
  menuIds: string[];
}

/**
 * 메뉴형 시설의 운영 가능 여부 정본.
 *
 * craft 시설은 "메뉴 슬롯이 있다"가 아니라 **시설에 맞는 발견 메뉴가 실제로 장착돼
 * 있다**가 운영 조건이다. 세이브에서 레시피가 사라졌거나, 발견 전 메뉴 ID가 남았거나,
 * 장착을 전부 해제한 경우를 손님·공급·입장 정원이 서로 다르게 해석하지 않도록 한 곳에서
 * 걸러 낸다. 메뉴형이 아닌 정상 시설은 메뉴와 무관하게 운영 가능하다.
 */
/**
 * 음성 대조군 (P2) — 켜면 **빈 그릇도 운영 가능**으로 돌려준다.
 *
 * 이 판정은 **네 소비자가 공유한다** (손님 목적지 · 주간 공급 · 병목의 built 공급 ·
 * 입장 정원).
 *
 * ⚠ **지금 이 스위치가 재는 것은 판정 자체까지다** — 켜면 「빈 그릇은 시설이 아니다」
 * 단위 절이 빨개진다. 네 소비자가 **전부** 이 답을 쓴다는 것은 아직 이 스위치로 안 쟀고,
 * 헤드리스의 `craftOperableRatio`/`operationalRatio` 로 간접 확인만 했다 (둘 다 100%).
 * 소비자별 대조는 P3 에서 상점이 재고를 물릴 때 같이 붙일 것 — 그때 값이 갈라지면
 * 「의뢰로는 3개인데 심사로는 2개」와 같은 종류의 버그가 된다.
 *
 * 손으로 되돌려 본 것은 다음 사람에게 안 남으므로 **코드에** 둔다
 * (`setBottleneckFaultForTest`·`setRenderFaultForTest` 와 같은 자리).
 */
let operabilityFault: 'always-operable' | null = null;

export function setMenuOperabilityFaultForTest(fault: 'always-operable' | null): void {
  operabilityFault = fault;
}

export function menuFacilityOperability(
  facilityId: string | undefined,
  menuMode: 'craft' | 'fixed' | undefined,
  mountedMenuIds: readonly string[],
  recipeAvailable: (recipeId: string) => boolean = () => true,
): MenuFacilityOperability {
  if (facilityId === undefined) return { operable: false, menuIds: [] };
  if (menuMode !== 'craft') return { operable: true, menuIds: [] };
  if (operabilityFault === 'always-operable') {
    return { operable: true, menuIds: [...mountedMenuIds] };
  }
  const menuIds = mountedMenuIds.filter(
    (id, index) =>
      mountedMenuIds.indexOf(id) === index &&
      isRecipeForFacility(id, facilityId) &&
      recipeAvailable(id),
  );
  return { operable: menuIds.length > 0, menuIds };
}

/** 시설 개선 단계가 열어 주는 메뉴 칸 수의 유일한 규칙. */
/**
 * 이 레시피를 **지금 팔 수 있나** — 못 팔면 그 이유 (P9).
 *
 * ## 왜 필요한가
 *
 * 단골 요청(`민지 — 시원한 캔음료를 마시고 싶어!`)이 **조건만 말하고 방법을 안 말했다.**
 * 실측: 새 판의 시작 킷에는 **craft 시설이 하나도 없어서**(매점·카페 0개) 그 요청은
 * 1주차부터 **구조적으로 불가능**한데, 화면 어디에도 「매점을 지으세요」가 없었다.
 * 사용자가 자판기를 놓고 「배치해도 계속 뜬다」고 한 것이 그 상태다.
 *
 * 이 저장소의 규칙은 이미 있었다 — **「못 놓는 이유는 방법까지 말한다」**
 * (건설 시트의 거절 문구 · `shopBlockedText`). 요청에도 같은 규칙을 건다.
 *
 * ⚠ **낱말을 만들지 않는다** — 이 함수는 `kind` 만 내고 문장은 UI 가 만든다
 * (sim 은 화면 어휘를 모른다).
 */
export type RecipeServeBlock =
  /** 그 레시피를 파는 종류의 시설이 하나도 안 지어져 있다 */
  | 'no-facility'
  /** 시설은 있는데 그 레시피가 어느 칸에도 안 걸려 있다 */
  | 'not-equipped'
  /** 아직 발견 못 한 레시피다 (개발해야 한다) */
  | 'not-discovered'
  /** 팔 수 있다 — 손님이 오기를 기다리는 중 */
  | null;

/**
 * @param equippedAt 그 시설 종류로 지어진 것들의 `menuIds` 목록.
 *   ⚠ **`placement` 를 받지 않는다** — `menu.ts` 는 배치를 모르는 편이 낫다
 *   (`ingredientsForFacility` 가 소원·의뢰를 모르는 것과 같은 경계).
 */
export function recipeServeBlock(
  recipeId: string,
  equippedAt: readonly (readonly string[])[],
  discovered: (id: string) => boolean,
): RecipeServeBlock {
  if (!discovered(recipeId)) return 'not-discovered';
  if (equippedAt.length === 0) return 'no-facility';
  return equippedAt.some((ids) => ids.includes(recipeId)) ? null : 'not-equipped';
}

/**
 * ── 재료 궁합 (Q2) ─────────────────────────────────────────────────────────
 *
 * ## 왜
 *
 * 실측(2026-08-28): 개발은 `재료 2개 → 고정 쌍표에 **정확히** 맞아야 성공`이고
 * 아니면 실패였다. 시설별로 좁힌 뒤에도 **절반이 꽝**이라 「누르기가 무섭다」가 됐다.
 *
 * 레퍼런스는 반대로 한다 — Burger Bistro Story 는 **궁합이 맞으면 보너스, 안 맞으면 감점,
 * 관계없으면 변화 없음**이고 *"Try mixing different things"* 가 매뉴얼의 문장이다.
 * 즉 **실패가 아니라 품질**이다.
 *
 * ## 태그를 손으로 안 적는다
 *
 * ⚠ 재료 데이터에는 `tags` 가 **없다** (요리에만 있다). 21종에 손으로 태그를 붙이면
 * 데이터가 늘고 요리와 어긋날 여지가 생긴다. 대신 **그 재료가 들어가는 기본 요리들의
 * 태그**에서 파생한다 — 얼음이 시원한 요리에 들어가면 얼음은 `cool` 이다.
 * 데이터가 바뀌면 궁합이 **저절로 따라온다** (`ingredientsForFacility` 와 같은 계열).
 */
export type PairAffinity = 'good' | 'ok' | 'bad';

/** 서로 밀어내는 짝 — 같이 넣으면 맛이 흐려진다 */
const OPPOSITE_TAGS: readonly (readonly [TasteTag, TasteTag])[] = [
  ['cool', 'warm'],
  ['light', 'hearty'],
];

/**
 * 그 재료의 **대표 성격 하나** — 들어가는 기본 요리에서 가장 자주 나오는 태그.
 *
 * ⚠ 「태그를 하나라도 공유하면 good」으로 두면 **210쌍 중 171쌍(81%)이 good** 이 된다
 * (실측). 레시피 태그가 `warm`·`hearty`·`savory` 에 몰려 있어 거의 전부가 겹치기 때문이다.
 * 궁합이 81% 면 그건 궁합이 아니라 **상수**다. 그래서 **대표 하나**로 좁힌다 —
 * 「이 재료는 시원한 쪽이다」가 플레이어가 실제로 배울 수 있는 성격이기도 하다.
 *
 * 동점이면 `TASTE_ORDER` 로 자른다 (결정론 — 불변식 2).
 */
const TASTE_ORDER: readonly TasteTag[] = ['cool', 'warm', 'sweet', 'savory', 'hearty', 'light'];

export function ingredientTaste(id: string): TasteTag | null {
  const count = new Map<TasteTag, number>();
  for (const r of RECIPES) {
    if (r.base !== undefined) continue;
    if (!r.ingredients.includes(id)) continue;
    for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
  }
  let best: TasteTag | null = null;
  let bestN = 0;
  for (const t of TASTE_ORDER) {
    const n = count.get(t) ?? 0;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

/**
 * 두 재료의 궁합.
 *
 * · **good** — 대표 성격이 같다
 * · **bad** — 서로 미는 성격이다 (`cool`↔`warm` · `light`↔`hearty`)
 * · **ok** — 아무 관계 없다 (BBS 의 「관계없음 = 변화 없음」)
 *
 * ⚠ 판정은 **대표 하나끼리**다 — 태그 집합끼리 비교하면 81%가 `good` 이 된다 (실측).
 */
export function pairAffinity(a: string, b: string): PairAffinity {
  const ta = ingredientTaste(a);
  const tb = ingredientTaste(b);
  if (ta === null || tb === null) return 'ok';
  if (ta === tb) return 'good';
  for (const [x, y] of OPPOSITE_TAGS) {
    if ((ta === x && tb === y) || (ta === y && tb === x)) return 'bad';
  }
  return 'ok';
}

export function menuSlotsForLevel(level: number): 1 | 2 | 3 {
  return level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

export interface MenuFailure {
  clue: string;
  progress: number;
}

export interface MenuSnapshot {
  ingredients: string[];
  discovered: string[];
  failures: Record<string, MenuFailure>;
}

export type MenuDevelopmentResult = {
  kind: 'discovered' | 'known' | 'failed' | 'unavailable';
  cost: number;
  clue: string;
  progress: number;
  recipe?: RecipeDef;
};

export interface MenuPurchase {
  purchaseId: string;
  week: number;
  guestId: number;
  characterId?: string;
  menuId: string;
  facilityHandle: number;
  amount: number;
}

/** 주간 루프에 넘기는 이름 있는 실제 방문 계획. 저장 상태가 아니다. */
export interface RegularVisit {
  characterId: string;
  group: GroupId;
  requestedRecipeId: string;
  prefer: readonly TasteTag[];
  avoid: readonly TasteTag[];
}

const GROUP_TAGS: Readonly<Record<GroupId, readonly TasteTag[]>> = {
  family: ['sweet', 'hearty'],
  couple: ['sweet', 'light'],
  friends: ['cool', 'savory'],
  company: ['warm', 'hearty'],
};

/** 같은 입력은 언제나 같은 메뉴를 고른다. RNG를 소비하지 않는다. */
export function chooseMenu(
  menuIds: readonly string[],
  group: GroupId,
  requestedRecipeId?: string,
  prefer: readonly TasteTag[] = [],
  avoid: readonly TasteTag[] = [],
): RecipeDef | null {
  if (requestedRecipeId && menuIds.includes(requestedRecipeId)) {
    return recipeDef(requestedRecipeId) ?? null;
  }
  const wanted = new Set<TasteTag>([...GROUP_TAGS[group], ...prefer]);
  const denied = new Set<TasteTag>(avoid);
  const scored = menuIds
    .map((id) => recipeDef(id))
    .filter((x): x is RecipeDef => x !== undefined)
    .map((recipe) => ({
      recipe,
      score:
        recipe.tags.reduce((n, tag) => n + (wanted.has(tag) ? 2 : 0), 0) -
        recipe.tags.reduce((n, tag) => n + (denied.has(tag) ? 3 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
  return scored[0]?.recipe ?? null;
}

export class MenuStore {
  private readonly ingredients = new Set<string>(
    INGREDIENTS.filter((x) => x.start).map((x) => x.id),
  );
  private readonly discovered = new Set<string>(RECIPES.filter((x) => x.start).map((x) => x.id));
  private readonly failures = new Map<string, MenuFailure>();

  ingredientIds(): string[] {
    return INGREDIENTS.filter((x) => this.ingredients.has(x.id)).map((x) => x.id);
  }

  discoveredIds(): string[] {
    return RECIPES.filter((x) => this.discovered.has(x.id)).map((x) => x.id);
  }

  failureEntries(facilityId?: string): { key: string; clue: string; progress: number }[] {
    return [...this.failures]
      .filter(([key]) => facilityId === undefined || key.startsWith(`${facilityId}|`))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ key, clue: v.clue, progress: v.progress }));
  }

  hasIngredient(id: string): boolean {
    return this.ingredients.has(id);
  }

  hasRecipe(id: string): boolean {
    return this.discovered.has(id);
  }

  unlockIngredient(id: string): boolean {
    if (!INGREDIENT_BY_ID.has(id) || this.ingredients.has(id)) return false;
    this.ingredients.add(id);
    return true;
  }

  unlockRecipe(id: string): boolean {
    if (!RECIPE_BY_ID.has(id) || this.discovered.has(id)) return false;
    this.discovered.add(id);
    return true;
  }

  develop(
    facilityId: string,
    ingredients: readonly [string, string],
    spend: (cost: number) => boolean,
  ): MenuDevelopmentResult {
    const [a, b] = ingredients;
    if (a === b || !this.ingredients.has(a) || !this.ingredients.has(b)) {
      return {
        kind: 'unavailable',
        cost: 0,
        clue: '해금한 서로 다른 재료 두 개를 고르세요',
        progress: 0,
      };
    }
    const key = `${facilityId}|${pairKey(a, b)}`;
    const exact = baseRecipesForFacility(facilityId).find(
      (x) => pairKey(...x.ingredients) === pairKey(a, b),
    );
    if (exact) {
      if (this.discovered.has(exact.id)) {
        return { kind: 'known', cost: 0, clue: '이미 알고 있는 메뉴입니다', progress: 1, recipe: exact };
      }
      if (!spend(exact.developmentCost)) {
        return { kind: 'unavailable', cost: 0, clue: '개발비가 부족합니다', progress: 0 };
      }
      this.discovered.add(exact.id);
      return {
        kind: 'discovered',
        cost: exact.developmentCost,
        clue: `${exact.name} 발견!`,
        progress: 1,
        recipe: exact,
      };
    }

    const old = this.failures.get(key);
    if (old) return { kind: 'failed', cost: 0, ...old };
    const pool = baseRecipesForFacility(facilityId);
    if (pool.length === 0) {
      return { kind: 'unavailable', cost: 0, clue: '메뉴를 개발할 수 없는 시설입니다', progress: 0 };
    }
    const cost = Math.round(Math.min(...pool.map((x) => x.developmentCost)) * 0.2);
    if (!spend(cost)) {
      return { kind: 'unavailable', cost: 0, clue: '연구비가 부족합니다', progress: 0 };
    }
    /*
     * ── Q2: **잘 어울리는 실험은 빈손으로 안 끝난다** ─────────────────────────
     *
     * 정확히 맞히지 못해도 **대표 성격이 같은 두 재료**(`good`)로 실험했고 **그중 하나가
     * 실제로 들어가는** 미발견 요리가 있으면 그것을 발견한다.
     *
     * 근거: Burger Bistro Story 는 궁합이 맞으면 보너스·안 맞으면 감점·관계없으면 변화
     * 없음이고 **실패라는 결과가 없다**. 우리는 요리가 전부 손으로 만든 데이터라 즉석
     * 요리를 만들 수는 없으므로, **보상을 「가까운 요리의 발견」으로** 옮긴다.
     *
     * ⚠ **재료 하나는 반드시 맞아야 한다** — 안 그러면 `good` 쌍(18%)이 아무 요리나
     * 열어 주는 열쇠가 되어 도감이 며칠 만에 빈다.
     * ⚠ 정확히 맞힌 경우(위 `exact`)는 그대로다 — **겨냥해서 맞히는 것이 여전히 최선**이다.
     */
    if (pairAffinity(a, b) === 'good') {
      const near = pool
        .filter((x) => !this.discovered.has(x.id))
        .filter((x) => x.ingredients.includes(a) || x.ingredients.includes(b))
        .sort((x, y) => x.id.localeCompare(y.id))[0];
      if (near) {
        this.discovered.add(near.id);
        return {
          kind: 'discovered',
          cost,
          clue: `${near.name} 발견! — 잘 어울리는 재료였습니다`,
          progress: 1,
          recipe: near,
        };
      }
    }
    const previous = this.failureEntries(facilityId).length;
    const target = pool
      .filter((x) => !this.discovered.has(x.id))
      .sort((x, y) => x.id.localeCompare(y.id))[previous % Math.max(1, pool.length)];
    const missing = target?.ingredients.find((id) => id !== a && id !== b);
    /*
     * ⚠ `hint` 는 **화면에 실제로 흐른다** (P2). 검사만 읽는 필드로 두면 그건 데이터가
     * 아니라 검사를 달래는 주석이다 — 이름만으로 재료를 못 짚는 요리(`삼겹살 세트`)에
     * 손으로 적어 둔 그 한 낱말이 여기서 플레이어에게 간다.
     */
    const clue = target
      ? missing
        ? `${target.name} 힌트: ${ingredientDef(missing)?.name ?? missing}가 필요합니다`
        : target.hint
          ? `${target.name} 힌트: ${target.hint}로 만듭니다`
          : `${target.name}의 조합은 아닙니다 — 후보에서 제외했습니다`
      : '이 조합은 아닙니다 — 후보 하나를 제외했습니다';
    const failure = { clue, progress: Math.min(0.95, (previous + 1) / pool.length) };
    this.failures.set(key, failure);
    return { kind: 'failed', cost, ...failure };
  }

  /**
   * **가진 요리를 키운다** (P2, 2단 강화 사슬 — `떡볶이 → 치즈 떡볶이 → …`).
   *
   * 조합(`develop`)이 「넓힌다」면 이쪽은 「키운다」다. 슬롯이 1~3칸뿐인데 요리가 수십
   * 종이면 "뭘 넣지"가 스트레스가 되므로, **가진 것을 키우는 축**을 나란히 둔다 —
   * 시설 개선의 특화 3갈래와 같은 문법이다 (P1.5).
   *
   * ⚠ 실패 기록은 조합과 **같은 통**을 쓰되 키를 `시설|기본>재료` 로 구분한다.
   * 통을 나누면 세이브 필드가 하나 더 생기고, 그 순간 마이그레이션 짐이 된다.
   */
  enhance(
    baseRecipeId: string,
    add: string,
    spend: (cost: number) => boolean,
  ): MenuDevelopmentResult {
    const base = RECIPE_BY_ID.get(baseRecipeId);
    if (!base || !this.discovered.has(baseRecipeId)) {
      return { kind: 'unavailable', cost: 0, clue: '먼저 기본 요리를 발견하세요', progress: 0 };
    }
    if (!this.ingredients.has(add) || base.ingredients.includes(add)) {
      return { kind: 'unavailable', cost: 0, clue: '해금한 새 재료를 하나 고르세요', progress: 0 };
    }
    const pool = enhancementsOf(baseRecipeId);
    if (pool.length === 0) {
      return { kind: 'unavailable', cost: 0, clue: '더 키울 수 없는 요리입니다', progress: 1 };
    }
    const exact = pool.find((x) => x.add === add);
    if (exact) {
      if (this.discovered.has(exact.id)) {
        return { kind: 'known', cost: 0, clue: '이미 알고 있는 메뉴입니다', progress: 1, recipe: exact };
      }
      if (!spend(exact.developmentCost)) {
        return { kind: 'unavailable', cost: 0, clue: '개발비가 부족합니다', progress: 0 };
      }
      this.discovered.add(exact.id);
      return {
        kind: 'discovered',
        cost: exact.developmentCost,
        clue: `${exact.name} 발견!`,
        progress: 1,
        recipe: exact,
      };
    }
    const key = `${base.facilityId}|${baseRecipeId}>${add}`;
    const old = this.failures.get(key);
    if (old) return { kind: 'failed', cost: 0, ...old };
    const cost = Math.round(Math.min(...pool.map((x) => x.developmentCost)) * 0.2);
    if (!spend(cost)) {
      return { kind: 'unavailable', cost: 0, clue: '연구비가 부족합니다', progress: 0 };
    }
    /*
     * 강화는 후보가 한 갈래뿐이라 **정답 재료를 바로 말해 준다.** 조합처럼 후보를 하나씩
     * 지우게 하면, 남은 후보가 원래 하나여서 "실패 → 정답"이 그냥 벌금 한 번이 된다.
     */
    const want = pool.find((x) => !this.discovered.has(x.id)) ?? pool[0]!;
    const clue = `${want.name} 힌트: ${ingredientDef(want.add)?.name ?? want.add ?? '재료'}를 더 넣습니다`;
    const failure = { clue, progress: 0.5 };
    this.failures.set(key, failure);
    return { kind: 'failed', cost, ...failure };
  }

  /** 발견·시설 호환·슬롯을 모두 sim에서 검증한다. */
  equip(placement: PlacementGrid, handle: number, recipeId: string, slot: number): boolean {
    if (!this.discovered.has(recipeId)) return false;
    const item = placement.all().find((x) => x.handle === handle);
    if (!item || !isRecipeForFacility(recipeId, item.defId)) return false;
    if (slot < 0 || slot >= placement.menuSlotCount(handle)) return false;
    const next = [...placement.menuIdsOf(handle)];
    const duplicate = next.indexOf(recipeId);
    if (duplicate >= 0 && duplicate !== slot) next[duplicate] = '';
    while (next.length <= slot) next.push('');
    next[slot] = recipeId;
    return placement.setMenuIds(handle, next);
  }

  toSnapshot(): MenuSnapshot {
    return {
      ingredients: this.ingredientIds(),
      discovered: this.discoveredIds(),
      failures: Object.fromEntries(
        [...this.failures]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, { ...value }]),
      ),
    };
  }

  static fromSnapshot(snapshot: MenuSnapshot | undefined): MenuStore {
    const store = new MenuStore();
    if (!snapshot) return store;
    store.ingredients.clear();
    for (const id of snapshot.ingredients ?? []) if (INGREDIENT_BY_ID.has(id)) store.ingredients.add(id);
    // 시작 재료는 데이터의 현재 기본값이다. 구 스냅샷에서 누락돼도 판을 잠그지 않는다.
    for (const x of INGREDIENTS) if (x.start) store.ingredients.add(x.id);
    store.discovered.clear();
    for (const id of snapshot.discovered ?? []) if (RECIPE_BY_ID.has(id)) store.discovered.add(id);
    for (const x of RECIPES) if (x.start) store.discovered.add(x.id);
    store.failures.clear();
    for (const [key, value] of Object.entries(snapshot.failures ?? {})) {
      if (!key.includes('|') || typeof value?.clue !== 'string') continue;
      store.failures.set(key, {
        clue: value.clue,
        progress: Math.max(0, Math.min(1, Number(value.progress) || 0)),
      });
    }
    return store;
  }
}

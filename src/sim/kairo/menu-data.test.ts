import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAIN_MAX_STEPS,
  CHAIN_PRICE_MAX,
  CHAIN_SAT_MAX,
  INGREDIENTS,
  MENU_DENSITY_MIN,
  RECIPES,
  MenuStore,
  enhancementsOf,
  ingredientsForFacility,
  menuFacilityOperability,
  setMenuOperabilityFaultForTest,
  validateMenuData,
} from './menu.js';
import rawWishes from '../../data/kairo-wishes.json' with { type: 'json' };
import { SHOP_ITEMS } from './shop.js';
import { FACILITY_MAX_LEVEL, LEVEL_FEE_STEP, allFacilityDefs } from './placement.js';

/** 지금 데이터의 craft 시설 — `menuMode` 가 정본이다 */
const craft = allFacilityDefs()
  .filter((d) => (d as { menuMode?: string }).menuMode === 'craft')
  .map((d) => ({
    id: d.id,
    startingMenu: (d as { startingMenu?: readonly string[] }).startingMenu,
  }));

describe('메뉴 데이터 검증 (P2)', () => {
  /*
   * ⚠ **이 검사가 데이터 변경보다 먼저다.** craft 승격에서 `startingMenu` 를 빠뜨리면
   * 이미 세이브에 서 있는 그 시설이 통째로 어두워지고(운영 불가 → 손님 목적지·주간 공급·
   * 입장 정원에서 제외) **판이 조용히 작아진다.** 화면에는 아무 말도 안 뜬다.
   */
  it('지금 데이터가 성립한다 — craft 시설마다 start 레시피 하나와 startingMenu', () => {
    expect(validateMenuData(craft)).toEqual([]);
  });

  it('craft 시설이 하나 이상 있다 — 표본이 0이면 위 검사가 아무것도 안 잰다', () => {
    expect(craft.length).toBeGreaterThan(0);
  });

  it('힌트가 화면으로 흐른다 — 검사만 읽는 죽은 데이터가 아니다', async () => {
    /*
     * ⚠ `hint` 를 검사만 읽으면 그건 데이터가 아니라 **검사를 달래는 주석**이다.
     * 실패 clue 에 실제로 실려야 이름만으로 못 짚는 요리가 플레이어에게 설명된다.
     */
    const src = await readFile('src/sim/kairo/menu.ts', 'utf8');
    expect(src).toContain('target.hint');
  });

  /* ── 음성 대조군 넷 — 켜서 실제로 잡히는지 본다 ───────────────────────── */

  it('⚠ 대조군 — startingMenu 가 비면 잡힌다', () => {
    const broken = craft.map((f) => ({ id: f.id, startingMenu: [] as string[] }));
    const problems = validateMenuData(broken);
    expect(problems.some((p) => p.kind === 'start-not-in-menu')).toBe(true);
  });

  it('⚠ 대조군 — start 레시피가 없는 시설을 승격하면 잡힌다', () => {
    // ⚠ 실제로 승격 안 된 craft 후보를 쓴다 — 이미 승격된 시설을 쓰면 대조군이 죽는다
    const problems = validateMenuData([...craft, { id: 'chicken', startingMenu: [] }]);
    expect(problems.some((p) => p.kind === 'no-start-recipe')).toBe(true);
  });

  it('⚠ 대조군 — 후보도 정답도 없는 시설을 승격하면 밀도가 잡힌다', () => {
    /*
     * 치킨을 승격하면 후보 재료 0 · 정답 0 이라 밀도가 성립하지 않는다 —
     * 「승격했는데 아무 조합도 없다」가 정확히 이 검사가 막는 상태다.
     */
    const problems = validateMenuData([...craft, { id: 'chicken', startingMenu: [] }]);
    expect(problems.some((p) => p.kind === 'thin-density')).toBe(true);
  });

  it('지금 데이터의 밀도가 문턱 위다 — 실패율이 시설 수에 안 끌려간다', () => {
    for (const f of craft) {
      const pool = INGREDIENTS.filter((x) => (x.facilities ?? []).includes(f.id));
      const pairs = (pool.length * (pool.length - 1)) / 2;
      const answers = RECIPES.filter((r) => r.facilityId === f.id && r.base === undefined).length;
      expect(answers / pairs, `${f.id} 밀도`).toBeGreaterThanOrEqual(MENU_DENSITY_MIN);
    }
  });

  it('⚠ 대조군 — craft 가 아닌 시설을 가리키는 레시피가 있으면 잡힌다', () => {
    // 매점을 craft 목록에서 빼면 매점용 레시피들이 갈 곳을 잃는다
    const problems = validateMenuData(craft.filter((f) => f.id !== 'shop'));
    expect(problems.some((p) => p.kind === 'unknown-facility')).toBe(true);
    expect(RECIPES.some((r) => r.facilityId === 'shop')).toBe(true);
  });
});

describe('빈 그릇은 시설이 아니다 (P2 · 네 소비자 공유 판정)', () => {
  afterEach(() => setMenuOperabilityFaultForTest(null));

  /*
   * ⚠ `menuFacilityOperability` 는 **손님 목적지 · 주간 공급 · 병목의 built 공급 ·
   * 입장 정원** 넷이 공유한다. 빈 craft 시설이 운영 가능으로 새면 그 정원만큼
   * `admissionLimit` 의 `공급 × 1.5` 가 부풀어 **판이 조용히 커진다.**
   */
  it('장착 메뉴가 없는 craft 시설은 운영 불가다', () => {
    expect(menuFacilityOperability('shop', 'craft', []).operable).toBe(false);
    expect(menuFacilityOperability('shop', 'craft', ['shop_can_drink']).operable).toBe(true);
    // 고정 판매는 메뉴와 무관하다 — 그래서 자판기를 승격하면 안 된다
    expect(menuFacilityOperability('vending_out', 'fixed', []).operable).toBe(true);
  });

  it('발견 못 한 레시피는 장착돼 있어도 운영으로 안 센다', () => {
    expect(menuFacilityOperability('shop', 'craft', ['shop_gimbap'], () => false).operable)
      .toBe(false);
  });

  it('⚠ 대조군 — always-operable 을 켜면 위 판정이 무너진다', () => {
    setMenuOperabilityFaultForTest('always-operable');
    expect(menuFacilityOperability('shop', 'craft', []).operable).toBe(true);
    expect(menuFacilityOperability('shop', 'craft', ['shop_gimbap'], () => false).operable)
      .toBe(true);
  });
});

/**
 * 손에 넣을 수 있는 재료 = `start` ∪ **소원 보상** ∪ **상점**. 두 출처를 합쳐 `validateMenuData` 에
 * 넘긴다 — `menu.ts` 는 소원을 모르므로 이 합집합은 **부르는 쪽**이 만든다.
 */
const obtainable = (): string[] => {
  const ids = new Set(INGREDIENTS.filter((x) => x.start === true).map((x) => x.id));
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    if (node === null || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    const reward = rec['reward'];
    if (reward !== null && typeof reward === 'object') {
      const id = (reward as Record<string, unknown>)['ingredient'];
      if (typeof id === 'string') ids.add(id);
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(rawWishes);
  // 상점도 재료의 출처다 (P3) — `치즈` 가 그 첫 상품이다
  for (const item of SHOP_ITEMS) if (item.kind === 'ingredient') ids.add(item.target);
  return [...ids];
};

describe('2단 강화 사슬 (P2 · D8)', () => {
  it('모든 재료를 실제로 손에 넣을 수 있다', () => {
    // ⚠ `연유` 가 정확히 이 구멍으로 들어와 `bung_condensed` 를 영원히 개발 불가로 만들었다
    expect(validateMenuData(craft, obtainable())).toEqual([]);
  });

  it('⚠ 대조군 — 아무 데서도 안 풀리는 재료를 빼면 잡힌다', () => {
    const short = obtainable().filter((id) => id !== 'flour');
    const found = validateMenuData(craft, short);
    expect(found.some((p) => p.kind === 'unreachable-ingredient')).toBe(true);
  });

  it('사슬 상한이 게임의 기존 눈금에서 나온다 (§8-8)', () => {
    /*
     * ⚠ 상한을 **결과에 맞춰 정하지 않는다.** `+60%` 는 시설 개선의 `0.3 × 4단 = +120%`
     * 의 절반이고 `+5` 는 콤보 `satCap 10` 의 절반이다 — 데이터가 그 안에 앉는지를 잰다.
     */
    expect(CHAIN_PRICE_MAX).toBeCloseTo(LEVEL_FEE_STEP * (FACILITY_MAX_LEVEL - 1) / 2);
    let chains = 0;
    for (const root of RECIPES.filter((r) => r.base === undefined)) {
      let cur = root;
      let steps = 0;
      while (enhancementsOf(cur.id)[0]) { cur = enhancementsOf(cur.id)[0]!; steps += 1; }
      if (steps === 0) continue;
      chains += 1;
      expect(steps).toBeLessThanOrEqual(CHAIN_MAX_STEPS);
      expect(cur.price / root.price - 1).toBeLessThanOrEqual(CHAIN_PRICE_MAX);
      expect(cur.satisfaction - root.satisfaction).toBeLessThanOrEqual(CHAIN_SAT_MAX);
    }
    expect(chains).toBeGreaterThanOrEqual(15);
    expect(RECIPES.filter((r) => r.base !== undefined).length).toBe(chains * CHAIN_MAX_STEPS);
  });

  it('⚠ 대조군 — 상한을 넘는 사슬은 잡힌다', () => {
    const root = RECIPES.find((r) => r.base === undefined && enhancementsOf(r.id)[0])!;
    const tip = enhancementsOf(enhancementsOf(root.id)[0]!.id)[0]!;
    const saved = tip.price;
    (tip as { price: number }).price = Math.ceil(root.price * (1 + CHAIN_PRICE_MAX) + 1);
    try {
      expect(validateMenuData(craft).some((p) => p.kind === 'chain-too-strong')).toBe(true);
    } finally {
      (tip as { price: number }).price = saved;
    }
    expect(validateMenuData(craft).some((p) => p.kind === 'chain-too-strong')).toBe(false);
  });

  it('강화 요리는 조합의 정답이 아니다 — 기본을 건너뛸 수 없다', () => {
    /*
     * ⚠ 강화판은 기본과 **같은 재료 쌍**을 담는다. 조합 판정이 기본만 보지 않으면
     * 첫 조합에 2단이 튀어나와 사슬이 통째로 무의미해진다.
     */
    const menus = new MenuStore();
    let paid = 0;
    const spend = (c: number): boolean => { paid += c; return true; };
    const found = menus.develop('shop', ['rice', 'seaweed'], spend);
    expect(found.recipe?.id).toBe('shop_gimbap');
    expect(paid).toBeGreaterThan(0);
    // 같은 쌍을 또 골라도 강화판이 안 나온다
    expect(menus.develop('shop', ['rice', 'seaweed'], spend).kind).toBe('known');
  });

  it('강화는 기본을 발견한 뒤에만 · 정답 재료 하나로 열린다', () => {
    const menus = new MenuStore();
    /*
     * ⚠ **Q4 부터 재료는 4종만 시작 해금이다.** 이 검사는 「강화는 기본을 발견한 뒤에만」을
     * 재는 것이지 해금을 재는 것이 아니므로 필요한 재료를 명시적으로 푼다 (`egg` 가 그렇다).
     */
    for (const ing of INGREDIENTS) menus.unlockIngredient(ing.id);
    const spend = (): boolean => true;
    expect(menus.enhance('shop_gimbap', 'egg', spend).kind).toBe('unavailable');
    menus.develop('shop', ['rice', 'seaweed'], spend);
    // 틀린 재료는 정답을 지목하는 힌트로 돌아온다 (후보가 한 갈래뿐이라 후보 제거가 무의미하다)
    // ⚠ 틀린 재료도 **해금한 것**이어야 한다 — 안 그러면 'unavailable' 로 빠져 아무것도 안 잰다
    const miss = menus.enhance('shop_gimbap', 'ice', spend);
    expect(miss.kind).toBe('failed');
    expect(miss.clue).toContain('계란');
    const hit = menus.enhance('shop_gimbap', 'egg', spend);
    expect(hit.kind).toBe('discovered');
    expect(hit.recipe?.id).toBe('shop_gimbap_egg');
    expect(hit.recipe?.price).toBeGreaterThan(1200);
    // 2단은 1단 위에서만
    expect(menus.enhance('shop_gimbap_egg', 'noodle', spend).recipe?.id)
      .toBe('shop_gimbap_egg_ramen');
  });

  it('재료 후보는 시설이 좁힌다 — 화면도 데이터와 같은 세계를 본다', () => {
    /*
     * ⚠ 예전 `menuLabModel` 은 해금한 재료를 **전부** 깔아서, 밀도 하한이 재는 세계와
     * 플레이어가 보는 세계가 갈라져 있었다.
     */
    for (const f of craft) {
      const pool = ingredientsForFacility(f.id);
      expect(pool.length).toBeGreaterThanOrEqual(4);
      expect(pool.length).toBeLessThan(INGREDIENTS.length);
    }
    // 어느 시설에도 안 적힌 재료는 조합 칩으로 안 뜬다 (상점이 들어올 자리)
    expect(ingredientsForFacility('shop').some((x) => x.id === 'cheese')).toBe(false);
  });
});

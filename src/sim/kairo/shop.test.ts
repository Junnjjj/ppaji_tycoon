import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { PlacementGrid, upgradeRequirement } from './placement.js';
import { WallGrid } from './walls.js';
import {
  SHOP_ITEMS,
  SHOP_TABS,
  grantShopItem,
  setShopFaultForTest,
  shopCost,
  shopItemOwned,
  shopStatuses,
  shopStock,
  SHOP_STOCK_PER_TAB,
  validateShopData,
  type ShopContext,
  type ShopItemDef,
} from './shop.js';
import { KairoTerrain } from './terrain.js';
import {
  COURSE_EQUIPMENT,
  CourseStore,
  PRESETS,
  defaultHandles,
  validateCourse,
  type CourseSnapshot,
  type PresetDef,
} from './course.js';

/**
 * P3 의 **RED** — 「산 적 없는 장비로는 코스를 확정할 수 없다」.
 *
 * ⚠ **이 검사는 지금 반드시 실패해야 한다.** 실패한다는 사실 자체가 「코스 장비 19종에
 * 게이트가 0개」라는 진단의 증거다 — 어떤 장비든 고르기만 하면 코스가 선다.
 */
/** 물로 가득한 지형 — 소유 판정만 보고 싶을 때 (course.test.ts 의 `lake` 와 같은 모양) */
function lake(w = 40, h = 32): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'water_edge');
  return t;
}

describe('코스 장비에 소유 개념이 있다 (P3 RED)', () => {
  it('산 적 없는 장비는 코스 확정에서 거절된다', () => {
    const t = lake();
    const preset = PRESETS[0] as PresetDef;
    const dock = { x: 6, y: 16 };
    const handles = defaultHandles(preset, dock, { x: 1, y: 0 });
    // 가장 비싼 장비 — 새 판에서 절대 갖고 있을 리 없다
    const priciest = [...COURSE_EQUIPMENT].sort((a, b) => b.vehicleCost - a.vehicleCost)[0]!;
    const v = validateCourse(t, handles, dock, preset, priciest.id, 5, [], undefined,
      new Set<string>());
    expect(v.issues).toContain('not-owned');
  });
});

describe('장비 소유는 CourseStore 가 소유한다 (P3)', () => {
  it('새 판은 물려받은 둘만 갖는다', () => {
    const store = new CourseStore();
    const start = COURSE_EQUIPMENT.filter((e) => e.start === true).map((e) => e.id);
    // ⚠ 둘이다 (§8-18 결정). 셋 이상이면 상점의 첫 결정이 첫 주에 사라진다
    expect(start).toHaveLength(2);
    expect([...store.ownedEquipment]).toEqual(start);
    // ⚠ 둘 이상이면 상점의 첫 결정이 첫 주에 사라진다
    expect(store.ownedEquipment.size).toBeLessThan(COURSE_EQUIPMENT.length);
  });

  it('사면 늘고, 두 번 사도 한 번만 는다 (돈이 두 번 나가면 안 된다)', () => {
    const store = new CourseStore();
    const target = COURSE_EQUIPMENT.find((e) => e.start !== true)!;
    expect(store.grantEquipment(target.id)).toBe(true);
    expect(store.grantEquipment(target.id)).toBe(false);
    expect(store.ownedEquipment.has(target.id)).toBe(true);
    expect(store.grantEquipment('nope')).toBe(false);
  });

  it('세이브를 왕복해도 소유가 그대로다', () => {
    const store = new CourseStore();
    const target = COURSE_EQUIPMENT.find((e) => e.start !== true)!;
    store.grantEquipment(target.id);
    const back = CourseStore.fromSnapshot(JSON.parse(JSON.stringify(store.toSnapshot())));
    expect([...back.ownedEquipment].sort()).toEqual([...store.ownedEquipment].sort());
  });

  it('⚠ `owned` 가 없는 옛 세이브는 놓인 코스의 장비를 가진 것으로 친다', () => {
    /*
     * 안 하면 바나나보트로 돌던 코스가 로드 직후 `not-owned` 로 무효가 된다 —
     * 플레이어가 아무것도 안 했는데 판이 깨진다.
     */
    const ridden = COURSE_EQUIPMENT.find((e) => e.start !== true)!;
    const old = {
      courses: [{
        handle: 1, presetId: PRESETS[0]!.id, equipId: ridden.id, vehicles: 1,
        dock: { x: 6, y: 16 }, handles: [{ x: 8, y: 16 }],
      }],
      nextHandle: 2,
    };
    const back = CourseStore.fromSnapshot(old as unknown as CourseSnapshot);
    expect(back.ownedEquipment.has(ridden.id)).toBe(true);
    // 시작 장비도 여전히 있다 (생성자가 넣는다)
    expect(back.ownedEquipment.has('peanut')).toBe(true);
    // ⚠ 그렇다고 **전부** 주지는 않는다 — 그러면 게이트가 없는 것과 같다
    expect(back.ownedEquipment.size).toBeLessThan(COURSE_EQUIPMENT.length);
  });

  it('production 호출부가 전부 소유를 넘긴다 (정적)', () => {
    /*
     * ⚠ `owned` 는 optional 이다 — 안 넘기면 소유를 **안 본다**. 그러면 「산 적 없는
     * 장비로 코스를 세운다」가 조용히 돌아온다. 그래서 호출부를 검사가 지킨다.
     * (`placement.upgrade` 를 직접 안 부르게 막는 P5 의 정적 검사와 같은 자리다.)
     */
    const files = ['../../ui/kairo-course.ts', '../../../tools/kairo-sim.ts', './startkit.ts'];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      const calls = [...src.matchAll(/validateCourse\(/g)].length;
      const owned = [...src.matchAll(/ownedEquipment/g)].length;
      expect(owned, f).toBeGreaterThanOrEqual(calls);
    }
  });
});

describe('구입과 수배의 경계는 데이터의 모양이 강제한다 (P3 · D2)', () => {
  afterEach(() => setShopFaultForTest(null));

  it('① 상점 항목은 `days` 를 가질 수 없다 — 가지면 그건 수배다', () => {
    expect(validateShopData()).toEqual([]);
    for (const item of SHOP_ITEMS) {
      expect(item, item.id).not.toHaveProperty('days');
    }
  });

  it('⚠ 대조군 — 상점 항목에 `days: 3` 을 주입하면 잡힌다', () => {
    const victim = SHOP_ITEMS[0] as unknown as Record<string, unknown>;
    victim['days'] = 3;
    try {
      expect(validateShopData().some((p) => p.includes('days'))).toBe(true);
    } finally {
      delete victim['days'];
    }
    expect(validateShopData()).toEqual([]);
  });

  it('③ 상점과 수배의 대상이 안 겹친다 — 겹치면 수배가 항상 손해다', () => {
    /*
     * ⚠ P4 전에는 수배 데이터가 없어 빈 배열이다. 그래도 **판정을 지금 넣는다** —
     * 수배가 들어올 때 겹침을 막을 자리가 이미 있어야 한다 (게이트가 데이터보다 먼저).
     */
    expect(validateShopData([])).toEqual([]);
    const target = SHOP_ITEMS[0]!.target;
    expect(validateShopData([target]).some((p) => p.includes('겹친다'))).toBe(true);
  });

  it('④ 탭 넷이 전부 물건을 갖는다 — 빈 탭은 화면에서 고장으로 읽힌다', () => {
    expect(SHOP_TABS.map((t) => t.id)).toEqual(['ingredient', 'fitting', 'decor', 'equipment']);
    for (const tab of SHOP_TABS) {
      expect(SHOP_ITEMS.filter((x) => x.tab === tab.id).length, tab.id).toBeGreaterThan(0);
    }
  });

  it('보트·장비가 후반 현금의 실제 출구다', () => {
    /*
     * H1 의 근거 — 52주 현금 중앙이 1,033만인데 살 것이 없었다. 장비 18종 합계가
     * 그보다 커야 「쓸 곳 없음」이 사라진다.
     */
    const total = SHOP_ITEMS.filter((x) => x.tab === 'equipment')
      .reduce((n, x) => n + x.cost, 0);
    expect(total).toBeGreaterThan(10_000_000);
    // 시작 장비는 팔지 않는다 (이미 갖고 있다)
    const start = COURSE_EQUIPMENT.filter((e) => e.start === true).map((e) => e.id);
    expect(SHOP_ITEMS.some((x) => start.includes(x.target))).toBe(false);
  });
});

describe('상점은 자기 상태를 안 든다 (P3)', () => {
  afterEach(() => setShopFaultForTest(null));

  const ctx = (over: Partial<ShopContext> = {}): ShopContext => ({
    grade: 5,
    cash: 100_000_000,
    hasIngredient: () => false,
    hasRecipe: () => false,
    ownsEquipment: () => false,
    facilityUnlocked: () => false,
    meets: () => true,
    ...over,
  });

  it('이미 가진 것은 `owned` 로 뜨고 목록에서 안 사라진다', () => {
    const all = shopStatuses(ctx({ ownsEquipment: () => true }));
    expect(all).toHaveLength(SHOP_ITEMS.length);
    const eq = all.filter((s) => s.item.kind === 'equipment');
    expect(eq.every((s) => s.owned && s.blocked === 'owned')).toBe(true);
  });

  it('못 사는 이유를 말한다 — 등급 · 현금', () => {
    const poor = shopStatuses(ctx({ cash: 0 }));
    expect(poor.every((s) => s.blocked === 'cash')).toBe(true);
    const low = shopStatuses(ctx({ grade: 1 }));
    const gated = low.filter((s) => (s.item.minGrade ?? 1) > 1);
    expect(gated.length).toBeGreaterThan(0);
    expect(gated.every((s) => s.blocked === 'grade')).toBe(true);
  });

  it('강화품은 소유 개념이 없다 — 여러 시설에 각각 붙는다', () => {
    const fit = SHOP_ITEMS.find((x) => x.kind === 'fitting')!;
    expect(shopItemOwned(fit, ctx())).toBe(false);
    const grid = PlacementGrid.fromSnapshot({
      w: 20, h: 20, next: 3,
      items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }, { handle: 2, defId: 'shop', i: 8, j: 4 }],
    });
    const sink = {
      unlockIngredient: () => false,
      unlockRecipe: () => false,
      grantEquipment: () => false,
      grantFacility: () => false,
      addFitting: (id: string, handle: number) => grid.addFitting(id, handle),
    };
    expect(grantShopItem(fit, sink, 1)).toBe(true);
    expect(grantShopItem(fit, sink, 2)).toBe(true);
    expect(grid.fittingsOf(1)).toEqual([fit.target]);
    expect(grid.fittingsOf(2)).toEqual([fit.target]);
    // 대상을 안 고르면 안 붙는다 — 어디에 붙일지가 이 축의 결정이다
    expect(grantShopItem(fit, sink)).toBe(false);
  });

  it('산 것은 각자의 스토어에 남는다 — 상점은 재고를 안 든다', () => {
    const courses = new CourseStore();
    const target = SHOP_ITEMS.find((x) => x.kind === 'equipment')!;
    const sink = {
      unlockIngredient: () => false,
      unlockRecipe: () => false,
      grantEquipment: (id: string) => courses.grantEquipment(id),
      grantFacility: () => false,
      addFitting: () => false,
    };
    expect(grantShopItem(target, sink)).toBe(true);
    expect(courses.ownedEquipment.has(target.target)).toBe(true);
    // 두 번 사도 한 번만 — 돈이 두 번 나가면 안 된다
    expect(grantShopItem(target, sink)).toBe(false);
  });

  it('⚠ 대조군 — `free` 를 켜면 값과 소유가 무너진다', () => {
    const item = SHOP_ITEMS.find((x) => x.kind === 'equipment')!;
    expect(shopCost(item)).toBe(item.cost);
    setShopFaultForTest('free');
    expect(shopCost(item)).toBe(0);
    // 가진 것도 안 가진 것으로 보인다 → 「이미 샀다」를 재는 절이 무너진다
    expect(shopItemOwned(item, ctx({ ownsEquipment: () => true }))).toBe(false);
  });
});

describe('이동은 자리만 바꾼다 — 자산을 안 버린다 (P5 · §8-9)', () => {
  it('개선 단계·특화·메뉴·강화품이 보존된다', () => {
    /*
     * ⚠ 예전에는 `remove` + `place` 라 **전부 사라졌다** — 수수료를 내고 5단계 시설이
     * 1단계가 됐다. 이동 수수료를 `'upgrades'`(이미 있는 자산에 쓰는 돈)로 세면서
     * 실제로는 자산을 버리고 있었다.
     */
    const t = lake(40, 32);
    for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
    const grid = PlacementGrid.fromSnapshot({
      w: 40, h: 32, next: 2, items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }],
    });
    grid.upgrade(1);
    grid.upgrade(1);
    grid.chooseSpecialty(1, 'revenue');
    grid.addFitting('parts_basic', 1);
    const was = {
      level: grid.levelOf(1),
      specialty: grid.specialtyOf(1),
      menus: grid.menuIdsOf(1),
      fittings: [...grid.fittingsOf(1)],
    };
    expect(was.level).toBe(3);

    const moved = grid.relocate(t, new WallGrid(40, 32), { i: 20, j: 20 }, 1, 12, 12, {});
    expect(moved.ok, moved.fail ?? '').toBe(true);
    const h = moved.placed!.handle;
    expect(grid.levelOf(h)).toBe(was.level);
    expect(grid.specialtyOf(h)).toBe(was.specialty);
    expect(grid.menuIdsOf(h)).toEqual(was.menus);
    expect([...grid.fittingsOf(h)]).toEqual(was.fittings);
  });

  it('⚠ 철거는 여전히 전부 잃는다 — 규칙이 두 벌이면 「철거→재설치」가 이득이 된다', () => {
    const grid = PlacementGrid.fromSnapshot({
      w: 20, h: 20, next: 2, items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }],
    });
    grid.upgrade(1);
    grid.addFitting('parts_basic', 1);
    expect(grid.remove(1)).toBe(true);
    expect(grid.fittingsOf(1)).toEqual([]);
    expect(grid.levelOf(1)).toBe(1);
  });

  it('옮길 자리가 없으면 아무것도 안 바뀐다 (원자성)', () => {
    // 육지 위에 있던 것을 **물 위로** 옮기려 한다 — 원래 자리로 되돌아와야 한다
    const t = lake(40, 32);
    for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
    for (let i = 10; i < 16; i++) for (let j = 10; j < 16; j++) t.paint(i, j, 'water_edge');
    const grid = PlacementGrid.fromSnapshot({
      w: 40, h: 32, next: 2, items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }],
    });
    grid.upgrade(1);
    const moved = grid.relocate(t, new WallGrid(40, 32), { i: 20, j: 20 }, 1, 12, 12, {});
    expect(moved.ok).toBe(false);
    const back = grid.all()[0];
    expect(back?.i).toBe(4);
    expect(back?.j).toBe(4);
    expect(grid.levelOf(back!.handle)).toBe(2);
  });
});

describe('개선은 강화품을 요구한다 (P5)', () => {
  const shop = (): PlacementGrid => PlacementGrid.fromSnapshot({
    w: 20, h: 20, next: 2, items: [{ handle: 1, defId: 'shop', i: 4, j: 4 }],
  });

  it('요구가 없는 단계는 예전과 완전히 같다 (되돌리기 경계)', () => {
    const g = shop();
    let paid = 0;
    for (let want = 2; want <= 3; want++) {
      expect(upgradeRequirement('shop', want)).toEqual([]);
      const r = g.tryUpgrade(1, (n) => { paid += n; return true; });
      expect(r.ok, `→${want}`).toBe(true);
    }
    expect(g.levelOf(1)).toBe(3);
    expect(paid).toBeGreaterThan(0);
  });

  it('⚠ 재고가 없으면 **현금도 재고도 안 움직인다** (원자성)', () => {
    /*
     * `CourseStore.confirmEdit` 과 같은 규약이다 — 검증이 끝나기 전에는 결제 콜백을
     * 부르지 않는다. 부르면 「돈은 나갔는데 안 올라갔다」가 생긴다.
     */
    const g = shop();
    while (g.levelOf(1) < 3) g.tryUpgrade(1, () => true);
    let called = 0;
    const r = g.tryUpgrade(1, () => { called += 1; return true; });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(upgradeRequirement('shop', 4));
    expect(r.missing.length).toBeGreaterThan(0);
    expect(called, '결제 콜백이 불렸다').toBe(0);
    expect(g.levelOf(1)).toBe(3);
  });

  it('강화품이 있으면 올라가고 **하나만** 소비된다', () => {
    const g = shop();
    while (g.levelOf(1) < 3) g.tryUpgrade(1, () => true);
    const need = upgradeRequirement('shop', 4)[0]!;
    g.addFitting(need, 1);
    g.addFitting(need, 1);
    expect(g.tryUpgrade(1, () => true).ok).toBe(true);
    expect(g.levelOf(1)).toBe(4);
    expect(g.fittingsOf(1)).toEqual([need]);
  });

  it('결제가 거절되면 강화품이 안 사라진다', () => {
    const g = shop();
    while (g.levelOf(1) < 3) g.tryUpgrade(1, () => true);
    const need = upgradeRequirement('shop', 4)[0]!;
    g.addFitting(need, 1);
    expect(g.tryUpgrade(1, () => false).ok).toBe(false);
    expect(g.fittingsOf(1)).toEqual([need]);
    expect(g.levelOf(1)).toBe(3);
  });

  it('정적 — main·봇은 `placement.upgrade(` 를 직접 안 부른다', () => {
    /*
     * ⚠ 직접 부르면 상위 경계가 우회되어 **강화품 축이 조용히 사라진다.**
     * `upgrade()` 자체는 남는다 — 골든이 직접 부르기 때문이다 (시그니처 불변).
     */
    for (const f of ['../../main.ts', '../../../tools/kairo-sim.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(src, f).not.toMatch(/placement\.upgrade\(/);
      expect(src, f).toContain('tryUpgrade(');
    }
  });
});

describe('개선의 실행 입구는 하나다 (P5 · D9)', () => {
  it('경영 목록은 지도로 데려갈 뿐 직접 안 올린다', () => {
    /*
     * ⚠ 예전에는 이 목록이 `placement.upgrade()` 를 **직접** 불러서 상위 경계(강화품
     * 검사)도 `guests.invalidate()` 도 건너뛰었다 — 두 입구가 갈려 있었다.
     */
    const src = readFileSync(new URL('../../ui/kairo-staff.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/placement\.upgrade\(/);
    expect(src).toContain('openFacility(');
    // ⚠ 목록 자체는 **안 지웠다** — 「어느 것부터?」는 지도를 훑어서 못 푸는 물음이다
    expect(src).toContain('renderUpgrades');
  });

  it('시설 시트의 개선이 상위 경계를 지나고 손님을 다시 계산한다', () => {
    const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
    const at = main.indexOf('upgrade: () => {');
    expect(at).toBeGreaterThan(0);
    const block = main.slice(at, main.indexOf('},', main.indexOf('return true;', at)));
    expect(block).toContain('tryUpgrade(');
    // ⚠ 이 입구가 그동안 이걸 안 불렀다 — 개선 탭과 갈려 있던 자리다
    expect(block).toContain('guests.invalidate()');
    expect(block).toContain('playUpgradeFx');
  });
});

/**
 * ── Q3: 주간 입고 ──────────────────────────────────────────────────────────
 *
 * ⚠ 실측(2026-08-28): 상점은 **고정 24개**를 매 판 같은 순서로 냈고 재료 탭은 **치즈 하나**였다.
 * 살 것이 늘 같으면 상점은 「한 번 보고 마는 화면」이 된다 (구입이 후반 투자의 **4%**).
 */
describe('Q3 — 주간 입고', () => {
  const ctx = (cash = 100_000_000): ShopContext => ({
    grade: 5,
    cash,
    hasIngredient: () => false,
    hasRecipe: () => false,
    ownsEquipment: () => false,
    facilityUnlocked: () => false,
    meets: () => true,
  });

  it('진열은 전량이 아니라 몇 칸이고, **탭마다 채워진다**', () => {
    const stock = shopStock(ctx(), 0, 1);
    expect(stock.length).toBeLessThan(SHOP_ITEMS.length);
    /*
     * ⚠ 처음엔 상점 전체에서 8칸을 뽑았는데 탭 넷에 흩어져 **재료 탭에 1개**만 남았다
     * (실측). 탭이 비면 회전이 기능이 아니라 결함으로 보인다 — 탭마다 돌린다.
     */
    for (const tab of SHOP_TABS) {
      const inTab = stock.filter((x) => x.item.tab === tab.id);
      const has = SHOP_ITEMS.some((x) => x.tab === tab.id);
      if (has) expect(inTab.length).toBeGreaterThan(0);
    }
  });

  it('★ 뽑기를 안 쓴다 — 같은 판·같은 주는 몇 번을 불러도 같다', () => {
    /*
     * ⚠ 이게 이 설계의 핵심이다. 상점 진열은 **매 프레임 다시 그려지는 화면**이라
     * RNG 스트림을 쓰면 호출 횟수가 렌더 횟수에 끌려가 스트림이 밀린다 —
     * K36-B③·P4 가 두 번 밟은 함정의 가장 나쁜 형태다.
     */
    const a = shopStock(ctx(), 3, 42).map((x) => x.item.id);
    const b = shopStock(ctx(), 3, 42).map((x) => x.item.id);
    const c = shopStock(ctx(), 3, 42).map((x) => x.item.id);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('주가 바뀌면 진열이 바뀐다', () => {
    const w0 = shopStock(ctx(), 0, 42).map((x) => x.item.id);
    const w1 = shopStock(ctx(), 1, 42).map((x) => x.item.id);
    expect(w1).not.toEqual(w0);
  });

  it('판(시드)이 다르면 순서가 다르다 — 2회차 이유가 된다', () => {
    const s1 = shopStock(ctx(), 0, 1).map((x) => x.item.id);
    const s2 = shopStock(ctx(), 0, 999).map((x) => x.item.id);
    expect(s2).not.toEqual(s1);
  });

  it('★ 못 산 것이 영영 사라지지 않는다 — 한 바퀴 안에 모두 돌아온다', () => {
    /*
     * 무작위 표본이면 운 나쁜 항목이 20주 동안 안 나올 수 있다. 창을 **미는** 방식이라
     * 모든 항목이 `ceil(N / size)` 주 안에 반드시 한 번 돌아온다 — **구조로** 보장한다.
     */
    const seen = new Set<string>();
    // 가장 항목이 많은 탭이 한 바퀴 도는 데 걸리는 주 수 + 여유
    const biggest = Math.max(
      ...SHOP_TABS.map((t) => SHOP_ITEMS.filter((x) => x.tab === t.id).length),
    );
    const rounds = Math.ceil(biggest / SHOP_STOCK_PER_TAB) + 2;
    for (let w = 0; w < rounds; w++) {
      for (const x of shopStock(ctx(), w, 7)) seen.add(x.item.id);
    }
    expect(seen.size).toBe(SHOP_ITEMS.length);
  });

  it('쓸모 있는 것이 먼저 온다 — `prefer` 는 매주 보인다', () => {
    const target = (SHOP_ITEMS.find((x) => x.kind === 'ingredient') as ShopItemDef).target;
    for (let w = 0; w < 6; w++) {
      const ids = shopStock(ctx(), w, 5, [target]).map((x) => x.item.target);
      expect(ids).toContain(target);
    }
  });

  it('특가는 정확히 한 칸이고 값이 실제로 싸다', () => {
    const stock = shopStock(ctx(), 2, 11);
    const sale = stock.filter((x) => x.sale);
    expect(sale.length).toBe(1);
    const item = (sale[0] as { item: ShopItemDef }).item;
    expect(shopCost(item, true)).toBeLessThan(shopCost(item));
  });

  it('이미 가진 것은 칸을 안 먹는다', () => {
    const owned = { ...ctx(), ownsEquipment: () => true } as ShopContext;
    const stock = shopStock(owned, 0, 3);
    expect(stock.every((x) => x.blocked !== 'owned')).toBe(true);
  });
});

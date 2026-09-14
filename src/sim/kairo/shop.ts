/**
 * 구입 상점 (P3) — **지금 있는 것을 즉시 산다.**
 *
 * ## D2 — 구입과 수배의 경계
 *
 * | | 무엇 | 시간 |
 * |---|---|---|
 * | **구입**(여기) | 지금 있는 걸 즉시 | 0 |
 * | **수배**(P4) | 없는 걸 구해 오게 시킨다 | 2일~2주 |
 *
 * 이 경계가 **새 콘텐츠의 소속을 자동으로 정한다** — 그래서 사람의 판단이 아니라
 * **데이터의 모양**으로 강제한다: 상점 항목은 `days` 를 **가질 수 없고**, 수배 항목은
 * 반드시 갖는다. `shop.test.ts` 가 그 둘과 「대상 id 가 안 겹친다」를 잡는다.
 * (겹치면 같은 재료를 즉시 사고 수배도 할 수 있어 **수배가 항상 손해**가 된다.)
 *
 * ## 상태가 0이다
 *
 * ⚠ **클래스도 스냅샷도 없다.** 무엇을 샀는지는 이미 다른 스토어가 안다 —
 * 재료는 `MenuStore`, 장비는 `CourseStore`, 조경은 `UnlockStore`, 강화품은
 * `PlacedFacility.fittings`. 상점이 자기 재고를 또 들면 **같은 사실이 두 곳에 저장**되고
 * 그 둘은 언젠가 갈라진다. 여기 있는 것은 순수 함수와 데이터뿐이다.
 */
import raw from '../../data/kairo-shop.json' with { type: 'json' };
import type { QuestCondition } from './progress.js';

export type ShopItemKind = 'ingredient' | 'recipe' | 'equipment' | 'fitting' | 'decor';

export interface ShopItemDef {
  id: string;
  kind: ShopItemKind;
  /** 무엇을 주나 — 재료 id · 레시피 id · 장비 id · 시설 id · 강화품 id */
  target: string;
  cost: number;
  /** 이 등급부터 산다. 없으면 1등급부터 */
  minGrade?: number;
  requires?: QuestCondition[];
  /** 화면의 탭 */
  tab: string;
  /**
   * ⚠ **`days` 필드가 없다.** 있으면 그건 수배다 (D2 의 기계적 강제).
   * 타입에 없으므로 데이터에 넣으면 검사가 잡는다.
   */
}

export interface ShopTabDef {
  id: string;
  label: string;
}

const data = raw as unknown as { tabs: ShopTabDef[]; items: ShopItemDef[] };
export const SHOP_TABS: readonly ShopTabDef[] = data.tabs;
export const SHOP_ITEMS: readonly ShopItemDef[] = data.items;

export function shopItemDef(id: string): ShopItemDef | undefined {
  return SHOP_ITEMS.find((x) => x.id === id);
}

/** 이미 가졌는지 묻는 쪽 — 상점은 스토어를 **모르고** 이 술어들만 받는다 */
export interface ShopOwnership {
  hasIngredient: (id: string) => boolean;
  hasRecipe: (id: string) => boolean;
  ownsEquipment: (id: string) => boolean;
  /** 시설이 열렸나 (골격 ∪ 사건) — `isUnlocked` 하나로 묻는다 (K41) */
  facilityUnlocked: (id: string) => boolean;
}

/**
 * 무엇을 주는지 아는 쪽. 기존 스토어 메서드 묶음이다 — 상점이 자기 상태를 안 든다.
 *
 * ⚠ `addFitting` 만 **어디에** 붙일지가 필요하다 (`handle`). 강화품은 풀 재고가 아니라
 * **시설 하나에 붙는 1회용**이라, 살 때 대상을 고르는 것이 이 축의 결정이다.
 */
export interface ShopSink {
  unlockIngredient: (id: string) => boolean;
  unlockRecipe: (id: string) => boolean;
  grantEquipment: (id: string) => boolean;
  grantFacility: (id: string) => boolean;
  addFitting: (id: string, handle: number) => boolean;
}

/**
 * 음성 대조군 (P3) — 켜면 **전부 공짜이고 전부 안 가진 것**이 된다.
 *
 * 「산 적 없는 장비로는 코스를 확정할 수 없다」·「돈이 없으면 못 산다」를 재는 절들이
 * 이 스위치 하나로 무너져야 한다.
 */
let fault: 'free' | null = null;

export function setShopFaultForTest(next: 'free' | null): void {
  fault = next;
}

export function shopItemOwned(item: ShopItemDef, ctx: ShopOwnership): boolean {
  if (fault === 'free') return false;
  switch (item.kind) {
    case 'ingredient':
      return ctx.hasIngredient(item.target);
    case 'recipe':
      return ctx.hasRecipe(item.target);
    case 'equipment':
      return ctx.ownsEquipment(item.target);
    case 'decor':
      return ctx.facilityUnlocked(item.target);
    /*
     * ⚠ 강화품은 **소유 개념이 없다** — 여러 번 살 수 있고 시설마다 따로 붙는다.
     * 「샀나」로 물으면 두 번째 시설을 영원히 못 꾸민다.
     */
    case 'fitting':
      return false;
  }
}

export interface ShopContext extends ShopOwnership {
  grade: number;
  cash: number;
  /** 의뢰와 **같은 평가기**를 쓴다 — 갈라지면 "상점에선 되는데 의뢰로는 안 된다"가 된다 */
  meets: (cond: QuestCondition) => boolean;
}

export type ShopBlockedReason = 'owned' | 'grade' | 'requires' | 'cash' | null;

export interface ShopItemStatus {
  item: ShopItemDef;
  owned: boolean;
  /** 못 사는 이유. `null` 이면 살 수 있다 */
  blocked: ShopBlockedReason;
}

/**
 * 목록의 상태를 한 번에 낸다.
 *
 * ⚠ **못 사는 것을 목록에서 지우지 않는다** (K48 규칙 — 「자격이 없을수록 더 보여야 한다」).
 * 지금 못 사는 것이 곧 다음 목표이고, 그것이 이 게임의 튜토리얼이다.
 */
export function shopStatuses(ctx: ShopContext): ShopItemStatus[] {
  return SHOP_ITEMS.map((item) => {
    const owned = shopItemOwned(item, ctx);
    let blocked: ShopBlockedReason = null;
    if (owned) blocked = 'owned';
    else if (ctx.grade < (item.minGrade ?? 1)) blocked = 'grade';
    else if ((item.requires ?? []).some((c) => !ctx.meets(c))) blocked = 'requires';
    else if (ctx.cash < shopCost(item)) blocked = 'cash';
    return { item, owned, blocked };
  });
}

/**
 * ── Q3: 주간 입고 ─────────────────────────────────────────────────────────
 *
 * ## 왜
 *
 * 실측(2026-08-28): 상점은 **고정 24개**를 매 판 같은 순서로 냈다. 재료 탭은 **치즈 하나**.
 * 살 것이 늘 같으면 상점은 「한 번 보고 마는 화면」이 된다 (실측: 구입이 후반 투자의 **4%**).
 *
 * ## 뽑기를 안 쓴다 ★
 *
 * ⚠ **RNG 스트림을 쓰지 않는다.** 「전용 스트림을 판다」가 이 저장소의 관례지만
 * (`COMMISSION_RNG_SALT`), 상점 진열은 **매 프레임 다시 그려지는 화면**이라 뽑기를 쓰면
 * 호출 횟수가 렌더 횟수에 끌려간다. 그러면 스트림이 밀려 날씨가 흔들린다 —
 * K36-B③·P4 가 두 번 밟은 함정의 **가장 나쁜 형태**다.
 *
 * 대신 **(시드, 항목 id)의 해시로 순서를 정하고 주차로 창을 민다.** 뽑기 0회이고,
 * 같은 판·같은 주는 몇 번을 불러도 같은 진열이 나온다.
 *
 * ## 「못 산 것이 영영 사라지지 않는다」는 **구조로** 보장한다
 *
 * 무작위 표본이면 운 나쁜 항목이 20주 동안 안 나올 수 있다. 창을 **미는** 방식이라
 * 모든 항목이 `ceil(N / size)` 주 안에 반드시 한 번 돌아온다.
 */

/**
 * **탭 하나가 한 주에 내놓는 칸 수.** 전량이 아니라 이만큼만.
 *
 * ⚠ **탭마다 돈다** — 처음엔 상점 전체에서 8칸을 뽑았는데, 그러면 탭 넷에 흩어져
 * **재료 탭에 1개**만 남았다 (실측). 탭이 비면 회전이 기능이 아니라 결함으로 보인다.
 * 탭별로 돌리면 **모든 탭이 매주 채워지고** 각 탭이 `ceil(탭항목/3)` 주에 한 바퀴 돈다.
 */
export const SHOP_STOCK_PER_TAB = 3;

/** 이번 주 특가의 할인율 — 「살까 말까」가 주간 결정이 되게 하는 한 칸 */
export const SHOP_SALE_OFF = 0.25;

/** 시드와 항목 id 를 섞는다 — 판마다 순서가 다르고, 한 판 안에서는 영원히 같다 */
function stockHash(seed: number, id: string): number {
  let h = (seed ^ 0x5109) >>> 0;
  for (let k = 0; k < id.length; k++) {
    h = Math.imul(h ^ id.charCodeAt(k), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface ShopStockEntry extends ShopItemStatus {
  /** 이번 주 특가인가 — 값은 `shopCost(item, sale)` 로 계산한다 */
  sale: boolean;
}

/** 한 탭의 이번 주 창 — 쓸모 있는 것을 고정하고 나머지를 주차로 민다 */
function tabWindow(
  pool: readonly ShopItemStatus[],
  week: number,
  seed: number,
  preferSet: ReadonlySet<string>,
  size: number,
): ShopItemStatus[] {
  if (pool.length === 0) return [];
  const ordered = [...pool].sort((a, b) => {
    const pa = preferSet.has(a.item.target) ? 0 : 1;
    const pb = preferSet.has(b.item.target) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return stockHash(seed, a.item.id) - stockHash(seed, b.item.id);
  });
  const pinned = ordered
    .filter((x) => preferSet.has(x.item.target))
    .slice(0, Math.max(0, size - 1));
  const rest = ordered.filter((x) => !pinned.includes(x));
  const room = Math.max(0, size - pinned.length);
  if (rest.length === 0) return pinned;
  const start = (week * room) % rest.length;
  const win: ShopItemStatus[] = [];
  for (let k = 0; k < Math.min(room, rest.length); k++) {
    win.push(rest[(start + k) % rest.length] as ShopItemStatus);
  }
  return [...pinned, ...win];
}

/**
 * 이번 주 진열 — **모든 탭의 창을 한 번에** 낸다 (화면이 탭으로 거른다).
 *
 * @param week  주차. 창이 이 값으로 밀린다
 * @param seed  판 시드. 판마다 순서가 달라진다
 * @param prefer 지금 쓸모 있는 대상 id 들 (지은 craft 시설의 재료·진행 중인 요청).
 *   ⚠ **부르는 쪽이 넘긴다** — `shop.ts` 는 배치도 요청도 모른다 (기존 경계 그대로).
 */
export function shopStock(
  ctx: ShopContext,
  week: number,
  seed: number,
  prefer: readonly string[] = [],
  size = SHOP_STOCK_PER_TAB,
): ShopStockEntry[] {
  const all = shopStatuses(ctx).filter((x) => x.blocked !== 'owned');
  const preferSet = new Set(prefer);
  const shown: ShopItemStatus[] = [];
  for (const tab of SHOP_TABS) {
    shown.push(
      ...tabWindow(all.filter((x) => x.item.tab === tab.id), week, seed, preferSet, size),
    );
  }
  /*
   * 특가는 **상점 전체에 하나**다. 탭마다 하나씩 두면 그건 결정이 아니라 그냥 세일이다.
   * ⚠ 그래서 어떤 탭에는 특가가 없을 수 있다 — 그게 「찾아보게」 만드는 부분이다.
   */
  const saleAt = shown.length === 0 ? -1 : stockHash(seed, `sale${String(week)}`) % shown.length;
  return shown.map((x, k) => ({ ...x, sale: k === saleAt }));
}

/** 대조군이 값을 0 으로 만든다 — 「돈이 없으면 못 산다」가 무너지는지 본다 */
export function shopCost(item: ShopItemDef, sale = false): number {
  if (fault === 'free') return 0;
  // 50원 단위로 내림 — 요리 가격 반올림과 같은 눈금이다 (한 화면에 두 눈금을 안 만든다)
  return sale ? Math.floor((item.cost * (1 - SHOP_SALE_OFF)) / 50) * 50 : item.cost;
}

/**
 * 실제로 준다. **결제는 부르는 쪽이 이미 했다** — 여기서 돈을 안 만진다
 * (검증 → 결제 → 지급이 한 경계라는 코스 편집의 규칙과 같다).
 *
 * @param handle 강화품을 붙일 시설. 다른 종류는 안 쓴다
 */
export function grantShopItem(item: ShopItemDef, sink: ShopSink, handle?: number): boolean {
  switch (item.kind) {
    case 'ingredient':
      return sink.unlockIngredient(item.target);
    case 'recipe':
      return sink.unlockRecipe(item.target);
    case 'equipment':
      return sink.grantEquipment(item.target);
    case 'decor':
      return sink.grantFacility(item.target);
    case 'fitting':
      return handle === undefined ? false : sink.addFitting(item.target, handle);
  }
}

/**
 * 데이터 검증 (D2 의 기계적 강제).
 *
 * @param commissionTargets 수배가 주는 대상 id 들. P4 전에는 빈 배열이고, 그때부터
 *   부르는 쪽이 넘긴다 — `shop.ts` 는 수배를 모른다 (`menu.ts` 가 소원을 모르는 것과 같다).
 */
export function validateShopData(commissionTargets: readonly string[] = []): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const tabs = new Set(SHOP_TABS.map((t) => t.id));
  for (const item of SHOP_ITEMS) {
    if (seen.has(item.id)) problems.push(`중복 id: ${item.id}`);
    seen.add(item.id);
    if (!tabs.has(item.tab)) problems.push(`${item.id}: 없는 탭 ${item.tab}`);
    if (item.cost <= 0) problems.push(`${item.id}: 값이 0 이하`);
    // ① 상점 항목은 `days` 를 가질 수 없다 — 가지면 그건 수배다
    if ('days' in (item as unknown as Record<string, unknown>)) {
      problems.push(`${item.id}: days 를 가졌다 — 그건 수배다 (D2)`);
    }
  }
  // ③ 상점과 수배의 대상이 겹치지 않는다 — 겹치면 수배가 항상 손해다
  const overlap = SHOP_ITEMS.filter((x) => commissionTargets.includes(x.target));
  for (const x of overlap) problems.push(`${x.id}: 수배와 대상이 겹친다 (${x.target})`);
  // 탭이 비어 있지 않다 — 빈 탭은 화면에서 「고장」으로 읽힌다
  for (const tab of SHOP_TABS) {
    if (!SHOP_ITEMS.some((x) => x.tab === tab.id)) problems.push(`빈 탭: ${tab.id}`);
  }
  return problems;
}

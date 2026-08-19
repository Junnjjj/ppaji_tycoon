import rawCombos from '../../data/kairo-combos.json' with { type: 'json' };
import { PlacementGrid, facilityDef, type PlacedFacility } from './placement.js';
import type { NeedKind } from './week.js';
import type { SwimZone } from './swim.js';

/**
 * 콤보 — 스펙 v2/v4. 70종 3티어.
 *
 * ## 왜 체감이 있나
 *
 * v3 는 콤보 중복을 무제한으로 뒀는데, 그러면 **최적 콤보 도배가 정답**이 된다.
 * v4 에서 중형은 중복마다 30% → 15% → 5%, 대형은 리조트당 1회로 고쳤다.
 * 소형은 그대로 둔다 — 소형은 "이 둘은 붙여 놓는 게 자연스럽다"는 정도의 힌트라
 * 도배해도 판이 망가지지 않는다.
 *
 * ## 판정 세 종류
 *
 *   `adjacent` (소형) — 두 시설이 반경 안에 붙어 있다
 *   `cluster`  (중형) — 한 구역 안에 여러 **수요 종류**가 모여 있다
 *   `resort`   (대형) — 리조트 전체에 특정 구성이 갖춰졌다
 *
 * 중형을 "시설 ID 조합"이 아니라 **수요 종류**로 판정하는 이유: ID 조합으로 하면 20종을
 * 만들려고 조합을 억지로 늘려야 하고, 플레이어는 정답 목록을 외우게 된다. 수요로 두면
 * "먹을 것과 쉴 곳을 같이 두면 좋다"는 이해가 남는다.
 */

export type ComboTier = 'small' | 'medium' | 'large';
/**
 * `zone` (S4) — **수영 구역 콤보**. 구역 종류(`zone`)가 맞고, 요구 시설들이 구역
 * 타일에서 맨해튼 거리 `radius` 안에 있으면 발동한다. 구역은 시설이 아니라 파생이라 (swim.ts)
 * `evaluateCombos` 가 구역 목록을 따로 받는다 — 안 주면 zone 콤보는 조용히 0 이다.
 */
export type ComboKind = 'adjacent' | 'cluster' | 'resort' | 'zone';

export interface ComboRequirement {
  facility?: string;
  need?: NeedKind;
  count?: number;
}

export interface ComboDef {
  id: string;
  name: string;
  tier: ComboTier;
  kind: ComboKind;
  /** zone 콤보 전용 — 어느 구역 종류에서 발동하나 */
  zone?: 'pool' | 'river';
  requires: ComboRequirement[];
  bonus: { satisfaction?: number; revenue?: number };
  radius?: number;
  note?: string;
  /** 숨은 콤보 (K43) — 도감에 힌트조차 없다. 직접 놓아 봐야 안다 (MMS 준거) */
  hidden?: boolean;
  /** 숨은 콤보 첫 발동 보상 */
  discoverCash?: number;
}

const DATA = rawCombos as unknown as {
  diminishing: Record<ComboTier, number[]>;
  combos: ComboDef[];
};

export const COMBOS: readonly ComboDef[] = DATA.combos;
export const DIMINISHING: Readonly<Record<ComboTier, readonly number[]>> = {
  small: DATA.diminishing.small,
  medium: DATA.diminishing.medium,
  large: DATA.diminishing.large,
};

export function comboDef(id: string): ComboDef | undefined {
  return COMBOS.find((c) => c.id === id);
}

/** 발동한 콤보 하나 */
export interface ActiveCombo {
  id: string;
  name: string;
  tier: ComboTier;
  /** 몇 번째 중복인가 (0 = 첫 발동) */
  index: number;
  /** 체감이 적용된 실효 배율 */
  scale: number;
  satisfaction: number;
  revenue: number;
  /** 어디서 발동했나 — 미리보기·강조에 쓴다 */
  at: { i: number; j: number } | null;
}

export interface ComboResult {
  active: ActiveCombo[];
  satisfaction: number;
  revenue: number;
}

/** 체감 배율 — 목록 끝을 넘으면 마지막 값을 반복한다 (중형은 5% 가 계속) */
export function diminishingScale(tier: ComboTier, index: number): number {
  const list = DIMINISHING[tier];
  if (list.length === 0) return 0;
  if (tier === 'large') return index === 0 ? (list[0] as number) : 0;
  return (list[Math.min(index, list.length - 1)] as number) ?? 0;
}

function needOf(defId: string): NeedKind | undefined {
  return (facilityDef(defId) as { need?: NeedKind } | undefined)?.need;
}

/** 두 시설의 발자국 사이 최소 체비셰프 거리 — 붙어 있으면 0 */
function gap(a: PlacedFacility, b: PlacedFacility): number {
  const da = facilityDef(a.defId);
  const db = facilityDef(b.defId);
  if (!da || !db) return Infinity;
  const ax0 = a.i;
  const ax1 = a.i + da.size[0] - 1;
  const ay0 = a.j;
  const ay1 = a.j + da.size[1] - 1;
  const bx0 = b.i;
  const bx1 = b.i + db.size[0] - 1;
  const by0 = b.j;
  const by1 = b.j + db.size[1] - 1;
  const dx = bx0 > ax1 ? bx0 - ax1 : ax0 > bx1 ? ax0 - bx1 : 0;
  const dy = by0 > ay1 ? by0 - ay1 : ay0 > by1 ? ay0 - by1 : 0;
  return Math.max(dx, dy);
}

function center(item: PlacedFacility): { i: number; j: number } {
  const def = facilityDef(item.defId);
  const w = def?.size[0] ?? 1;
  const d = def?.size[1] ?? 1;
  return { i: item.i + Math.floor(w / 2), j: item.j + Math.floor(d / 2) };
}

/**
 * 콤보를 판정한다.
 *
 * `extra` 를 주면 "그 시설을 여기에 놓았다면" 을 함께 계산한다 —
 * **놓기 전 미리보기**가 이 게임의 배치 판단을 만든다 (v2 결정).
 */
export function evaluateCombos(
  placement: PlacementGrid,
  extra?: { defId: string; i: number; j: number },
  /**
   * 수영 구역 (S4) — zone 콤보의 재료. **의뢰·심사·UI 가 같은 값을 받아야 한다** —
   * 한쪽만 주면 "의뢰로는 3개인데 심사로는 2개"가 된다 (evaluateCondition 규칙과 동일).
   */
  zones: readonly SwimZone[] = [],
): ComboResult {
  const items: PlacedFacility[] = placement.all();
  if (extra) items.push({ handle: -1, defId: extra.defId, i: extra.i, j: extra.j });

  const active: ActiveCombo[] = [];
  const counts = new Map<string, number>();

  for (const combo of COMBOS) {
    const hits = findHits(combo, items, zones);
    for (const at of hits) {
      const index = counts.get(combo.id) ?? 0;
      const scale = diminishingScale(combo.tier, index);
      counts.set(combo.id, index + 1);
      if (scale <= 0) continue;
      active.push({
        id: combo.id,
        name: combo.name,
        tier: combo.tier,
        index,
        scale,
        satisfaction: (combo.bonus.satisfaction ?? 0) * scale,
        revenue: (combo.bonus.revenue ?? 0) * scale,
        at,
      });
    }
  }

  return {
    active,
    satisfaction: active.reduce((a, c) => a + c.satisfaction, 0),
    revenue: active.reduce((a, c) => a + c.revenue, 0),
  };
}

/**
 * 콤보가 발동한 지점들. `adjacent`·`cluster` 는 여러 번, `zone` 은 구역마다 한 번,
 * `resort` 는 최대 1번
 */
function findHits(
  combo: ComboDef,
  items: PlacedFacility[],
  zones: readonly SwimZone[] = [],
): ({ i: number; j: number } | null)[] {
  if (combo.kind === 'resort') return findResort(combo, items) ? [null] : [];
  if (combo.kind === 'adjacent') return findAdjacent(combo, items);
  if (combo.kind === 'zone') return findZone(combo, items, zones);
  return findCluster(combo, items);
}

/**
 * 수영 구역 콤보 (S4) — 구역마다 한 번. 요구 시설이 구역 타일에서 맨해튼 거리
 * `radius`(기본 2) 안에 `count`(기본 1)개 이상 있으면 발동. `need` 요구는 그 수요
 * 종류의 시설 수로 센다. 발동 지점은 구역의 첫 타일이다 — 구역엔 중심이 없다.
 */
function findZone(
  combo: ComboDef,
  items: PlacedFacility[],
  zones: readonly SwimZone[],
): { i: number; j: number }[] {
  const radius = combo.radius ?? 2;
  const hits: { i: number; j: number }[] = [];
  for (const z of zones) {
    if (combo.zone !== undefined && z.kind !== combo.zone) continue;
    const near = (it: PlacedFacility): boolean => {
      const c = center(it);
      return z.tiles.some((t) => Math.abs(t.x - c.i) + Math.abs(t.y - c.j) <= radius);
    };
    let ok = true;
    for (const req of combo.requires) {
      const want = req.count ?? 1;
      let have = 0;
      for (const it of items) {
        if (req.facility !== undefined && it.defId !== req.facility) continue;
        if (req.need !== undefined && needOf(it.defId) !== req.need) continue;
        if (req.facility === undefined && req.need === undefined) continue;
        if (near(it)) have++;
      }
      if (have < want) { ok = false; break; }
    }
    if (ok) hits.push({ i: z.tiles[0]?.x ?? 0, j: z.tiles[0]?.y ?? 0 });
  }
  return hits;
}

function findResort(combo: ComboDef, items: PlacedFacility[]): boolean {
  for (const req of combo.requires) {
    const need = req.count ?? 1;
    let have = 0;
    for (const it of items) {
      if (req.facility && it.defId === req.facility) have++;
      else if (req.need && needOf(it.defId) === req.need) have++;
    }
    if (have < need) return false;
  }
  return true;
}

/**
 * 소형 — 두 시설이 반경 안에 있다. **각 쌍을 한 번씩만** 센다.
 * 안 그러면 A 하나에 B 셋을 붙여 같은 콤보를 셋으로 부풀릴 수 있다.
 */
function findAdjacent(combo: ComboDef, items: PlacedFacility[]): { i: number; j: number }[] {
  const radius = combo.radius ?? 2;
  const [ra, rb] = combo.requires;
  if (!ra || !rb) return [];
  const matches = (it: PlacedFacility, r: ComboRequirement): boolean =>
    r.facility ? it.defId === r.facility : r.need ? needOf(it.defId) === r.need : false;

  const as = items.filter((it) => matches(it, ra));
  const bs = items.filter((it) => matches(it, rb));
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const hits: { i: number; j: number }[] = [];
  for (let x = 0; x < as.length; x++) {
    if (usedA.has(x)) continue;
    for (let y = 0; y < bs.length; y++) {
      if (usedB.has(y)) continue;
      const a = as[x] as PlacedFacility;
      const b = bs[y] as PlacedFacility;
      if (a.handle === b.handle) continue;
      if (gap(a, b) > radius) continue;
      usedA.add(x);
      usedB.add(y);
      hits.push(center(a));
      break;
    }
  }
  return hits;
}

/**
 * 중형 — 한 구역(반경 R)에 요구 수요가 모여 있다.
 *
 * 후보 중심은 **놓인 시설의 중심**만 본다. 격자 전체를 훑으면 40×32×20종 = 25,600 번
 * 검사가 되고, 배치할 때마다 미리보기를 돌리므로 폰에서 체감된다.
 * 같은 구역이 두 번 세이지 않도록 이미 쓴 시설은 제외한다.
 */
function findCluster(combo: ComboDef, items: PlacedFacility[]): { i: number; j: number }[] {
  const radius = combo.radius ?? 4;
  const used = new Set<number>();
  const hits: { i: number; j: number }[] = [];

  for (const anchor of items) {
    if (used.has(anchor.handle)) continue;
    const c = center(anchor);
    const near = items.filter(
      (it) => !used.has(it.handle) && gap(anchor, it) <= radius,
    );
    // 요구 수요를 채울 수 있나 — 시설 하나는 한 요구에만 쓴다
    const taken = new Set<number>();
    let ok = true;
    for (const req of combo.requires) {
      let need = req.count ?? 1;
      for (const it of near) {
        if (need <= 0) break;
        if (taken.has(it.handle)) continue;
        const match = req.facility
          ? it.defId === req.facility
          : req.need
            ? needOf(it.defId) === req.need
            : false;
        if (!match) continue;
        taken.add(it.handle);
        need--;
      }
      if (need > 0) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (const h of taken) used.add(h);
    hits.push(c);
  }
  return hits;
}

/**
 * 놓기 전 미리보기 — "여기에 놓으면 무엇이 새로 터지나".
 * 이미 터진 것과의 차집합을 돌려준다.
 */
export function previewCombos(
  placement: PlacementGrid,
  defId: string,
  i: number,
  j: number,
): { gained: ActiveCombo[]; satisfaction: number; revenue: number } {
  const before = evaluateCombos(placement);
  const after = evaluateCombos(placement, { defId, i, j });
  const beforeKeys = new Map<string, number>();
  for (const c of before.active) beforeKeys.set(c.id, (beforeKeys.get(c.id) ?? 0) + 1);
  const gained: ActiveCombo[] = [];
  for (const c of after.active) {
    const left = beforeKeys.get(c.id) ?? 0;
    if (left > 0) {
      beforeKeys.set(c.id, left - 1);
      continue;
    }
    gained.push(c);
  }
  return {
    gained,
    satisfaction: after.satisfaction - before.satisfaction,
    revenue: after.revenue - before.revenue,
  };
}

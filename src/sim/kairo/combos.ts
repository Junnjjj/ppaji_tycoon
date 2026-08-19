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

/**
 * 면적 비례 증폭 (P1-A) — zone 콤보 전용. **데이터가 정의한다** (불변식 3).
 *
 * `base` 이하의 구역은 예전 상수 그대로고, 그보다 크면 `sqrt(area/base)` 로 자란다.
 */
export interface ComboAreaScale {
  /** 배율이 1 이 되는 기준 면적 (칸). 이보다 작아도 **깎지 않는다** — 아래 주석 참고 */
  base: number;
  /** 배율 상한. 수영장은 허가를 안 쓰므로 이 값이 **유일한 제동**이다 */
  cap: number;
}

export interface ComboDef {
  id: string;
  name: string;
  tier: ComboTier;
  kind: ComboKind;
  /** zone 콤보 전용 — 어느 구역 종류에서 발동하나 */
  zone?: 'pool' | 'river';
  /** zone 콤보 전용 — 면적 비례 증폭 (P1-A). 없으면 예전처럼 상수 보너스다 */
  areaScale?: ComboAreaScale;
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
  economy: ComboEconomy;
  combos: ComboDef[];
};

/**
 * 콤보 원점수를 주간 경제로 옮기는 포화 곡선의 계수 (S5). **데이터가 갖는다** (불변식 3).
 */
export interface ComboEconomy {
  /** 만족도 보너스 상한 (점) */
  satCap: number;
  /** 만족도가 상한의 절반이 되는 원점수 */
  satHalf: number;
  /** 매출 보너스 상한 (%) */
  revCap: number;
  /** 매출이 상한의 절반이 되는 원점수 */
  revHalf: number;
}

export const COMBOS: readonly ComboDef[] = DATA.combos;
export const DIMINISHING: Readonly<Record<ComboTier, readonly number[]>> = {
  small: DATA.diminishing.small,
  medium: DATA.diminishing.medium,
  large: DATA.diminishing.large,
};

export const COMBO_ECONOMY: Readonly<ComboEconomy> = DATA.economy;

export function comboDef(id: string): ComboDef | undefined {
  return COMBOS.find((c) => c.id === id);
}

/**
 * 포화 곡선 — `cap × raw / (raw + half)`.
 *
 * `raw = 0` 에서 0, `raw = half` 에서 `cap/2`, 무한대에서 `cap` 에 점근한다.
 * 단조 증가이고 **상한을 절대 넘지 않는다**.
 */
export function saturate(raw: number, cap: number, half: number): number {
  if (raw <= 0 || cap <= 0 || half <= 0) return 0;
  return (cap * raw) / (raw + half);
}

/** 콤보가 주간 경제에 실제로 싣는 값 — `WeekOptions.combos` 가 받는 그 숫자 */
export interface ComboEffect {
  /** 퇴장 만족도에 **더한다** (점) */
  satisfactionDelta: number;
  /** 공원 매출(입장료·코스 제외)에 **곱한다**. 1.0 이 무보너스 */
  revenueMult: number;
  /** 상한 전 원점수 — 밸런싱·UI 가 "얼마나 잘렸나"를 보게 */
  satRaw: number;
  revRaw: number;
}

/**
 * 콤보 원점수를 주간 경제 숫자로 옮긴다 (S5).
 *
 * ## 왜 여기 있나
 *
 * `WeekRunner` 는 카드·직원·코스를 **숫자 몇 개로만** 받는다 (불변식 3). 콤보도 같다 —
 * 규칙은 데이터(`kairo-combos.json`)가 정의하고 해석은 이 모듈이 소유한다.
 * `week.ts` 에 콤보 판정을 넣으면 콤보를 하나 추가할 때 시뮬을 고쳐야 한다.
 *
 * ## 왜 하드 상한이 아니라 포화인가
 *
 * 콤보는 73종이고 소형 40종은 **중복 발동이 무제한**이다 (`diminishing.small = [1]`).
 * 그래서 원점수 합은 후반에 수백 점까지 자란다 — 그대로 더하면 만족도가 100 에
 * 붙박이고 매출 배율이 폭주한다.
 *
 * `min(raw, cap)` 은 이 폭주는 막지만 **cap 을 넘는 순간 콤보가 전부 무가치**해진다.
 * 그게 정확히 이번에 고치려던 상태(죽은 축)의 후반부 버전이다. 포화 곡선은
 * 상한을 지키면서도 **한 개 더 붙이면 언제나 조금 더 준다** — 체감은 줄되 0 이 아니다.
 *
 * ## 두 축은 서로 다른 것을 사는 것이어야 한다
 *
 * 만족은 **평판 → 등급 → 수요**로, 매출은 **현금 → 건설**로 간다. 같은 raw 를 쓰되
 * `half` 를 달리 둬서, 소형 도배(작은 raw)는 만족 쪽이 먼저 보이고 대형까지 갖춘
 * 판(큰 raw)에서 매출 쪽이 따라온다.
 *
 * ## 상한을 왜 그 값으로 뒀나 (`kairo-combos.json` 의 `calibration`)
 *
 *   · `satCap = 10` — 등급 문턱 간격과 **같다** (`GRADES` 는 0/55/65/75/85).
 *     콤보로 한 등급은 넘길 수 있고, 두 등급은 못 넘긴다
 *   · `revCap = 18` — 요금 슬라이더의 폭(70~140)보다 **작다**. 콤보가 "값을 매긴다"
 *     라는 동사를 덮으면 그 동사가 죽는다
 */
export function comboEffect(
  r: { satisfaction: number; revenue: number },
  eco: ComboEconomy = COMBO_ECONOMY,
): ComboEffect {
  const satRaw = Math.max(0, r.satisfaction);
  const revRaw = Math.max(0, r.revenue);
  return {
    satisfactionDelta: saturate(satRaw, eco.satCap, eco.satHalf),
    revenueMult: 1 + saturate(revRaw, eco.revCap, eco.revHalf) / 100,
    satRaw,
    revRaw,
  };
}

/** 발동한 콤보 하나 */
export interface ActiveCombo {
  id: string;
  name: string;
  tier: ComboTier;
  /** 몇 번째 중복인가 (0 = 첫 발동) */
  index: number;
  /**
   * 실효 배율 = **티어 체감 × 면적 배율**. 둘은 서로를 상쇄하지 않는다 —
   * 체감은 "같은 콤보를 몇 개 깔았나"를, 면적은 "하나를 얼마나 크게 만들었나"를 벌하고/상준다
   */
  scale: number;
  /** 면적 배율만 떼어 낸 값 (zone 이 아니면 1). UI 가 "면적 ×1.8" 을 보여줄 수 있게 */
  areaScale: number;
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

/**
 * 면적 배율 (P1-A) — **큰 구역 하나를 만들 이유**.
 *
 * PSS 의 SE/Area Boost 는 상수가 아니라 **풀 크기에 곱해진다** (위키 명시:
 * "the value from Special Effect and Area Bonus can vary based on pool size").
 * 그래서 "큰 풀 하나를 물 뿜는 시설로 두른다"가 전략이 된다. 우리 zone 콤보 3종은
 * 상수였고, 그래서 **구역 크기가 게임에 없는 결정**이었다.
 *
 * 곡선은 `clamp(sqrt(area / base), 1, cap)`:
 *   · **제곱근** — 선형이면 거대 구역 하나가 판을 지배한다. 면적을 4배로 키워야 2배다
 *   · **바닥 1** — base 미만을 깎지 않는다. ⚠ 면적은 **보상 축이지 벌점 축이 아니다** —
 *     깎으면 이미 지은 판이 조용히 약해지고, 최소 규격 4칸 수영장이 "짓지 말 걸"이 된다
 *   · **cap** — 수영장(땅)은 `permitArea` 를 **안 쓴다**. 즉 크기 상한이 없다. 강 구역은
 *     허가가 2차 상한이라 등급이 곧 상한이지만, 수영장엔 그런 제동이 없어서
 *     **cap 이 없으면 잔디 전체를 물로 칠하는 것이 정답**이 된다
 *
 * `base`/`cap` 은 코드가 아니라 `kairo-combos.json` 이 갖는다 (불변식 3).
 * ⚠ 데이터에서 `areaScale` 을 빼면 **조용히 상수로 되돌아간다** — 그게 음성 대조군이고,
 * `combos.test.ts` 가 "zone 3종 전부 areaScale 을 갖는다"로 그 회귀를 잡는다.
 */
export function zoneAreaScale(combo: ComboDef, area: number): number {
  const cfg = combo.areaScale;
  if (!cfg || cfg.base <= 0) return 1;
  const raw = Math.sqrt(Math.max(0, area) / cfg.base);
  return Math.min(cfg.cap, Math.max(1, raw));
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
    for (const hit of hits) {
      const index = counts.get(combo.id) ?? 0;
      const tierScale = diminishingScale(combo.tier, index);
      counts.set(combo.id, index + 1);
      if (tierScale <= 0) continue;
      // 두 장치의 곱 — 체감은 "몇 개나 깔았나", 면적은 "하나를 얼마나 키웠나"
      const scale = tierScale * hit.areaScale;
      active.push({
        id: combo.id,
        name: combo.name,
        tier: combo.tier,
        index,
        scale,
        areaScale: hit.areaScale,
        satisfaction: (combo.bonus.satisfaction ?? 0) * scale,
        revenue: (combo.bonus.revenue ?? 0) * scale,
        at: hit.at,
      });
    }
  }

  return {
    active,
    satisfaction: active.reduce((a, c) => a + c.satisfaction, 0),
    revenue: active.reduce((a, c) => a + c.revenue, 0),
  };
}

/** 발동 하나 — 어디서 터졌나 + 면적 배율 (zone 이 아니면 1) */
interface ComboHit {
  at: { i: number; j: number } | null;
  areaScale: number;
}

const plainHits = (
  list: readonly ({ i: number; j: number } | null)[],
): ComboHit[] => list.map((at) => ({ at, areaScale: 1 }));

/**
 * 콤보가 발동한 지점들. `adjacent`·`cluster` 는 여러 번, `zone` 은 구역마다 한 번,
 * `resort` 는 최대 1번
 */
function findHits(
  combo: ComboDef,
  items: PlacedFacility[],
  zones: readonly SwimZone[] = [],
): ComboHit[] {
  if (combo.kind === 'resort') return findResort(combo, items) ? plainHits([null]) : [];
  if (combo.kind === 'adjacent') return plainHits(findAdjacent(combo, items));
  if (combo.kind === 'zone') return findZone(combo, items, zones);
  return plainHits(findCluster(combo, items));
}

/**
 * 수영 구역 콤보 (S4) — 구역마다 한 번. 요구 시설이 구역 타일에서 맨해튼 거리
 * `radius`(기본 2) 안에 `count`(기본 1)개 이상 있으면 발동. `need` 요구는 그 수요
 * 종류의 시설 수로 센다. 발동 지점은 구역의 첫 타일이다 — 구역엔 중심이 없다.
 *
 * P1-A: 발동마다 **면적 배율**을 함께 낸다. 그리고 **큰 구역부터** 돌려준다 —
 * ⚠ 안 그러면 티어 체감의 첫 슬롯(중형 30%)을 **스캔 순서**(좌상단)가 가져가서,
 * 공들여 키운 큰 구역이 5% 슬롯에 떨어진다. 정렬은 면적 → 좌표 순이라 결정론적이다.
 */
function findZone(
  combo: ComboDef,
  items: PlacedFacility[],
  zones: readonly SwimZone[],
): ComboHit[] {
  const radius = combo.radius ?? 2;
  const hits: (ComboHit & { at: { i: number; j: number } })[] = [];
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
    if (!ok) continue;
    hits.push({
      at: { i: z.tiles[0]?.x ?? 0, j: z.tiles[0]?.y ?? 0 },
      areaScale: zoneAreaScale(combo, z.area),
    });
  }
  hits.sort((a, b) => b.areaScale - a.areaScale || a.at.i - b.at.i || a.at.j - b.at.j);
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

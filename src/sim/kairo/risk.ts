import { PlacementGrid, facilityDef } from './placement.js';
import type { NeedKind } from './week.js';
import type { GuestStore } from './guests.js';

/**
 * 위험도 — 스펙 v4.
 *
 * ## 왜 순수 확률이 아닌가
 *
 * "안전도 78인데 RNG 로 폐쇄"는 억울하다. 실패는 **내 선택 때문**이어야 한다.
 * 그래서 위험도를 4단계로 **상시 표시**하고, 사고는 위험 단계에서만 일어난다.
 * 플레이어는 사고가 나기 **전에** 무엇을 해야 하는지 안다.
 *
 * ## 무엇이 위험을 만드나
 *
 * 위험은 "스릴 시설이 많은데 안전 시설이 없다"에서 온다:
 *   위험 요인 = 스릴·놀이 시설의 총 용량 + 혼잡(동시 손님)
 *   안전 요인 = 구명함·의무실·안내소 등 안전 시설
 *
 * 이 비율이 단계를 정한다. 스릴을 늘리면 안전도 늘려야 한다는 압력이 생긴다 —
 * 그게 "구명함을 왜 짓나"에 대한 답이다.
 */

export type RiskLevel = 'safe' | 'watch' | 'caution' | 'danger';

export const RISK_LEVELS: readonly RiskLevel[] = ['safe', 'watch', 'caution', 'danger'];

export const RISK_NAMES: Record<RiskLevel, string> = {
  safe: '안전',
  watch: '주의',
  caution: '경계',
  danger: '위험',
};

/** 안전을 담당하는 시설 — 이걸 지어야 위험도가 내려간다 */
const SAFETY_FACILITIES = new Set(['lifering', 'infirmary', 'info']);

/** 위험을 만드는 수요 종류 */
const RISKY_NEEDS = new Set<NeedKind>(['thrill', 'play']);

export interface RiskReport {
  level: RiskLevel;
  /** 0..1 — 게이지로 보여준다 */
  ratio: number;
  riskPoints: number;
  safetyPoints: number;
  /** 다음 단계로 내려가려면 안전 시설이 몇 개 더 필요한가 */
  safetyNeeded: number;
  /** 사고가 일어날 수 있는 단계인가 */
  accidentPossible: boolean;
}

/** 단계 경계 — ratio 가 이 값을 넘으면 다음 단계 */
const THRESHOLDS: Record<Exclude<RiskLevel, 'safe'>, number> = {
  watch: 0.35,
  caution: 0.6,
  danger: 0.8,
};

export function assessRisk(placement: PlacementGrid, guests: GuestStore): RiskReport {
  let riskPoints = 0;
  let safetyPoints = 0;

  for (const item of placement.all()) {
    const def = facilityDef(item.defId) as
      | { need?: NeedKind; capacity: number; id: string }
      | undefined;
    if (!def) continue;
    if (SAFETY_FACILITIES.has(def.id)) {
      safetyPoints += 4;
      continue;
    }
    if (def.need && RISKY_NEEDS.has(def.need)) riskPoints += Math.max(1, def.capacity);
  }

  // 혼잡도 — 손님이 많을수록 사고 여지가 커진다
  const crowd = guests.count;
  riskPoints += crowd * 0.25;

  const denom = riskPoints + safetyPoints;
  const ratio = denom <= 0 ? 0 : riskPoints / denom;

  let level: RiskLevel = 'safe';
  if (ratio >= THRESHOLDS.danger) level = 'danger';
  else if (ratio >= THRESHOLDS.caution) level = 'caution';
  else if (ratio >= THRESHOLDS.watch) level = 'watch';

  // 한 단계 내리려면 안전 점수가 얼마나 더 필요한가 → 시설 수로 환산
  const targetRatio =
    level === 'danger'
      ? THRESHOLDS.danger
      : level === 'caution'
        ? THRESHOLDS.caution
        : level === 'watch'
          ? THRESHOLDS.watch
          : 0;
  let safetyNeeded = 0;
  if (level !== 'safe' && targetRatio > 0) {
    // riskPoints / (riskPoints + safety) < targetRatio  →  safety > riskPoints·(1/target − 1)
    const need = riskPoints * (1 / targetRatio - 1) - safetyPoints;
    safetyNeeded = Math.max(1, Math.ceil(need / 4));
  }

  return {
    level,
    ratio,
    riskPoints,
    safetyPoints,
    safetyNeeded,
    accidentPossible: level === 'caution' || level === 'danger',
  };
}

/**
 * 사고 판정. **위험 단계에서만** 일어나고, 그 전에 단계가 상시 표시돼 있었다.
 * 안전 단계에서는 확률이 0 이다 — 안전한데 사고가 나면 억울하다.
 */
export function accidentChance(
  risk: RiskReport,
  /**
   * 카드가 만든 사고 배율 (장비 노후를 미루면 오르고, 자진 점검하면 내려간다).
   *
   * ⚠ **안전 단계에서는 배율을 곱해도 0 이다.** 카드로 위험을 만들 수 있게 하면
   * "안전도 관리를 했는데 카드 때문에 사고"가 되고, 그건 v4 에서 없애기로 한
   * "RNG 세금"이다. 카드는 위험 단계의 확률을 조절할 뿐 단계를 만들지 않는다.
   */
  mult = 1,
): number {
  if (!risk.accidentPossible) return 0;
  // 경계 0.5%/주, 위험은 비율에 비례해 최대 4%/주
  const base = risk.level === 'caution' ? 0.005 : 0.01 + (risk.ratio - THRESHOLDS.danger) * 0.15;
  return Math.max(0, Math.min(0.2, base * mult));
}

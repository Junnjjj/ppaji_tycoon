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
 *
 * ## 노출 — **아무도 없는 빠지는 위험하지 않다** (2026-08-20)
 *
 * 위 비율만으로는 **규모를 못 본다.** `risk/(risk+safety)` 는 배율에 불변이라,
 * 탁구대 하나(정원 2)에 구명함이 없으면 파도풀 스무 개에 구명함이 없는 것과 **같은
 * 1.0** 이 된다. 그래서 새 판이 손님 0 명에 `위험`(danger)으로 떴다 (실측:
 * 맵 3종 × 시드 3개 전부 `ratio 1 · riskPoints 2 · safetyPoints 0`,
 * `accidentChance` 4%/주 — **가능한 최대치**). K47-② 로 칩이 헤더에 상시 노출되면서
 * 첫 화면이 "이미 위험한 빠지"로 읽힌다.
 *
 * 그건 지표가 거짓말을 하는 것이다. 위험은 **노출**이 있어야 성립한다 — 다칠 사람이
 * 없으면 사고도 없다. 그래서 비율에 `exposure`(동시 손님 ÷ `EXPOSURE_FULL`, 상한 1)를
 * 곱한다.
 *
 *   · 손님 0 → 노출 0 → **언제나 안전**. 새 판의 거짓 경보가 사라진다
 *   · 손님이 차면 노출 1 → **예전 식 그대로**. 경보 축(스릴↑·안전↓ → 위험↑)은 그대로다
 *
 * ⚠ **곱하는 자리는 비율이지 `riskPoints` 가 아니다.** 위험 점수에 곱하면 비율이
 * 배율에 불변이라 아무 일도 안 일어난다 (`safety = 0` 이면 여전히 1.0). 같은 이유로
 * `riskPoints`·`safetyPoints` 는 **원값 그대로** 보고한다 — 그 둘은 "무엇을 지었나"이고
 * 노출은 "지금 누가 쓰나"다. 섞으면 처방(`safetyNeeded`)이 손님 수에 따라 출렁인다.
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
  /** 0..1 — 게이지로 보여준다. **노출이 이미 곱해진 값**이다 */
  ratio: number;
  /** 지은 것만의 위험 점수 — 노출을 안 곱한 원값 */
  riskPoints: number;
  safetyPoints: number;
  /** 0..1 — 지금 그 위험에 노출된 정도 (동시 손님) */
  exposure: number;
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

/**
 * 노출이 최대(1)가 되는 **동시 손님 수**.
 *
 * 1등급 상한(`GRADES[0].maxGuests`)이 40 이다 — 여기에 맞췄다. 그래서
 * "다 큰 빠지"는 언제나 노출 1 이고 예전 계산과 **한 글자도 안 달라진다**
 * (실측: 골든 12주·헤드리스 봇 26/52주에서 동시 손님이 상한에 붙어 있다).
 * 움직이는 것은 손님이 적은 **초반뿐**이고, 그게 이 수정이 겨눈 곳이다.
 *
 * ⚠ 등급 상한을 참조하지 않고 상수로 둔다 — `progress.ts` 를 끌어오면 위험도가
 * 해금 데이터에 묶인다. 값이 어긋나도 방향은 안 바뀌므로(상한이 오르면 노출은
 * 더 쉽게 1) 상수가 낫다.
 */
const EXPOSURE_FULL = 40;

export interface RiskExtras {
  /**
   * 수영 구역이 더하는 위험 점수 (S2, 스펙 §2.2) — 구역은 물이다. 값은
   * `swimRiskPoints(zones)` 로 계산한다. 부르는 쪽이 안 넣으면 "구역을 만들어도
   * 위험도가 안 오른다"가 된다 — `courseRisk` 를 열어 둔 것과 같은 이유의 자리다.
   */
  swimRisk?: number;
  /**
   * 직원이 더하는 안전 점수 (§11 안전요원). 시설과 같은 축에 더한다 —
   * "구명함을 지을까 안전요원을 쓸까" 가 같은 문제의 두 답이 되어야 한다.
   */
  staffSafety?: number;
  /**
   * 코스가 더하는 위험 점수 (§7.6 안전도). 안전도가 낮은 코스는 스릴 시설과 같은 축의
   * 위험이다 — 안 넣으면 "험한 코스를 그려도 위험도가 안 오른다"가 되어 안전도 지표가
   * 코스 화면 안에서만 도는 숫자가 된다.
   */
  courseRisk?: number;
}

export function assessRisk(
  placement: PlacementGrid,
  guests: GuestStore,
  extra: RiskExtras = {},
): RiskReport {
  let riskPoints = (extra.courseRisk ?? 0) + (extra.swimRisk ?? 0);
  let safetyPoints = extra.staffSafety ?? 0;

  for (const item of placement.all()) {
    const def = facilityDef(item.defId) as
      | { need?: NeedKind; capacity: number; id: string }
      | undefined;
    if (!def) continue;
    if (SAFETY_FACILITIES.has(def.id)) {
      safetyPoints += 4;
      continue;
    }
    /*
     * ⚠ 정원은 **`placement.capacityOf`** 다 (`def.capacity` 가 아니다) — 손님 슬롯의
     * 정본이고 회전 특화(P1.5)가 반영된 값이다. 직접 읽던 동안에는 정원을 늘려 놓고도
     * 위험은 그대로여서, "동시에 더 태우는데 더 안전하다"는 공짜가 됐다.
     * 회전 특화는 위험 축에서 **벌점**이다 — 그래야 안전 시설이 같이 따라온다.
     */
    if (def.need && RISKY_NEEDS.has(def.need)) {
      riskPoints += Math.max(1, placement.capacityOf(item.handle));
    }
  }

  // 혼잡도 — 손님이 많을수록 사고 여지가 커진다
  /*
   * ⚠ **공원 안 인원**이다 (`count` 가 아니라 `inside`). `count` 는 정류장에서 걸어오는
   * `'arriving'` 까지 세는데, 아직 입장도 안 한 사람이 위험을 올리면 플레이어가 못 바꾸는
   * 구간(정류장→매표소 다섯 칸)이 위험도를 미는 꼴이 되어 처방이 없다.
   */
  const crowd = guests.inside;
  riskPoints += crowd * 0.25;

  /*
   * 노출 — 다칠 사람이 없으면 사고도 없다. **비율에** 곱한다 (위 § 참고).
   * 손님 0 이면 0 이라 새 판은 언제나 안전이고, 상한을 넘으면 1 이라 예전 식이다.
   */
  const exposure = Math.min(1, crowd / EXPOSURE_FULL);

  const denom = riskPoints + safetyPoints;
  const ratio = denom <= 0 ? 0 : (riskPoints / denom) * exposure;

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
    /*
     * riskPoints·exposure / (riskPoints + safety) < targetRatio
     *   →  safety > riskPoints·(exposure/target − 1)
     *
     * 노출이 분자에 들어가므로 처방도 노출을 봐야 한다. 안 넣으면 손님이 절반뿐인
     * 판에서 "구명함 4개"라 해 놓고 2개만 지어도 단계가 내려간다 — 처방이 틀린다.
     */
    const need = riskPoints * (exposure / targetRatio - 1) - safetyPoints;
    safetyNeeded = Math.max(1, Math.ceil(need / 4));
  }

  return {
    level,
    ratio,
    riskPoints,
    safetyPoints,
    exposure,
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

/**
 * 사고 (P52-b §3.8 — 순수 · rng 0). 확률 하나 `accidentChance` 와 위험 단계 표. 값은 데이터(`balance.accidentBase/Floor/accidentMul`), 순서는 코드.
 *   hazard = max(floor, base × thrillN × unsafeN)   — 바닥은 **위험 모양(스릴 > 0)** 에만: 코스 안전 100 이라 안 그러면 망루·브리핑이 한 푼도 안 듣는다
 *   p = hazard × (vest ? 1 : noVest) × (guarded ? guard : 1) × (rescued ? rescue : 1) × (briefed ? 0.7 : 1) × (cold ? cold : 1) × clamp(busy / cap, 0.5, 1.5)
 * `base` 유도 = 목표 0.6건/일 ÷ (하루 기구 이용 134 × 위험 기댓값 0.53).
 */
export interface AccidentBalance { accidentBase: number; accidentFloor: number; accidentMul: { noVest: number; guard: number; rescue: number; cold: number } }
export interface AccidentInput { thrill: number; safe: number; vest: boolean; guarded: boolean; rescued: boolean; briefed: boolean; cold: boolean; busy: number; cap: number }

export const BRIEFED_MUL = 0.7;

export function hazardOf(thrill: number, safe: number, b: AccidentBalance): number {
  if (thrill <= 0) return 0;
  const thrillN = Math.max(0, Math.min(4, thrill)) / 4, unsafeN = (4 - Math.max(0, Math.min(4, safe))) / 4;
  return Math.max(b.accidentFloor, b.accidentBase * thrillN * unsafeN);
}
export function accidentChance(x: AccidentInput, b: AccidentBalance): number {
  const h = hazardOf(x.thrill, x.safe, b);
  if (h <= 0) return 0;
  const load = x.cap > 0 ? Math.max(0.5, Math.min(1.5, x.busy / x.cap)) : 1;
  return h * (x.vest ? 1 : b.accidentMul.noVest) * (x.guarded ? b.accidentMul.guard : 1) * (x.rescued ? b.accidentMul.rescue : 1) * (x.briefed ? BRIEFED_MUL : 1) * (x.cold ? b.accidentMul.cold : 1) * load;
}
/** 위험 단계 4 — 확정 바 칩·정보창이 같은 낱말을 쓴다. 문턱은 base(0.008)의 배수: 안전 < 0.004 ≤ 주의 < 0.008 ≤ 경계 < 0.016 ≤ 위험 */
export const RISK_LABELS: readonly string[] = ['안전', '주의', '경계', '위험'];
export type RiskLevel = 0 | 1 | 2 | 3;
export function riskLevel(p: number): RiskLevel { return p < 0.004 ? 0 : p < 0.008 ? 1 : p < 0.016 ? 2 : 3; }

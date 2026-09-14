/**
 * 팔찌 값 (P50-b2 §3.8 — 순수 · 상태 0). 값 함수만: `bandPrice`·`bandTop`·`bandFor`.
 * 상태·결제(`issueBand`)·회수·손님 필드는 P52-a. 표는 데이터(`wristbands.json`), 산식은 코드.
 */
import wristbandsJson from '../data/wristbands.json';
import type { PpajiGrade } from './rig.js';

export interface WristbandDef { id: string; name: string; rides: number; base: number; grade: number }
export const WRISTBANDS: readonly WristbandDef[] = wristbandsJson as WristbandDef[];

const round50 = (x: number): number => Math.round(x / 50) * 50;

/** 값 = round50(base × (1 + step × 등급)) — 등급이 오르면 같은 팔찌가 비싸진다 (표: big3 ★1 400 · big5 ★2 600 · ★3 700 · allday ★4 1,000) */
export function bandPrice(t: WristbandDef, grade: PpajiGrade | number, step = 0.25): number {
  return round50(t.base * (1 + step * grade));
}
/** 그 등급에서 열린 최상위 팔찌 — 확정 바가 「자유이용권 400 → 600G」 에 쓰는 값 */
export function bandTop(grade: PpajiGrade | number): WristbandDef {
  let best = WRISTBANDS[0] as WristbandDef;
  for (const t of WRISTBANDS) if (t.grade <= grade) best = t;
  return best;
}
/** 출신지 취향 `thrill`(areas.json 0.4~1.8) 로 칸을 고른다 — 뽑기 0. 문턱 0.85·1.25·1.7 은 출신지 10 이 **3:3:3:1** 로 갈리는 값(검사가 지킨다). 열린 칸 위는 최상위로, `minIdx` 아래는 안 고른다 */
export const BAND_THRILL_STEPS: readonly number[] = [0.85, 1.25, 1.7];
export function bandTierIndex(thrill: number): number { let k = 0; for (const t of BAND_THRILL_STEPS) if (thrill >= t) k++; return k; }
export function bandFor(thrill: number, opened: readonly WristbandDef[], minIdx = 0): WristbandDef {
  const n = opened.length;
  if (n === 0) return WRISTBANDS[0] as WristbandDef;
  const idx = Math.max(minIdx, Math.min(n - 1, bandTierIndex(thrill)));
  return opened[idx] as WristbandDef;
}
/** P52-a G3 — 수영 실력(저장 0): 출신지 취향 thrill 을 0~1 로. 딥 기구 가중 s · 여울 기구 가중 2−s */
export function swimSkill(thrill: number | undefined): number { return Math.max(0, Math.min(1, ((thrill ?? 1) - 0.4) / 1.4)); }

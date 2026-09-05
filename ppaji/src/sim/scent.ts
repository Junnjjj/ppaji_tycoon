/**
 * 풀 향 — 아이템 ∪ 인접 시설 중 **가장 센 것 하나** (PSS 매뉴얼 §10). 동률은 아이템 우선.
 * 골든 카이로봇처럼 `money` 향은 그 자체가 후보다 — "인접 + 무향" 특례는 데이터의 scentPower 로 표현한다.
 */
import type { Scent } from '../data/schema.js';

export interface ScentInput {
  scent: Scent | null;
  power: number;
  fromItem: boolean;
}

export function pickScent(inputs: readonly ScentInput[]): { scent: Scent | null; power: number; fromItem: boolean } {
  let best: { scent: Scent | null; power: number; fromItem: boolean } = { scent: null, power: 0, fromItem: false };
  for (const s of inputs) {
    if (s.scent === null || s.power <= 0) continue;
    if (s.power > best.power || (s.power === best.power && s.fromItem && !best.fromItem)) best = { scent: s.scent, power: s.power, fromItem: s.fromItem };
  }
  return { scent: best.scent, power: best.power, fromItem: best.fromItem };
}

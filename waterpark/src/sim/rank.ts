/**
 * 랭크 0~5★ — 폐장마다 다음 랭크의 조건을 전부 만족하면 오른다 (무작위 없음). 오르면 토지가 넓어지고
 * 상점 티어가 열린다. 조건은 조건 DSL — 소원·인증과 같은 눈으로 본다.
 */
import type { RankDef, Condition } from '../data/schema.js';
import type { Verdict } from './condition.js';

export function nextRank(defs: readonly RankDef[], current: number): RankDef | null {
  return defs.find((d) => d.star === current + 1) ?? null;
}

export function rankReady(def: RankDef, evaluateCond: (c: Condition) => Verdict): { ready: boolean; verdicts: Verdict[] } {
  const verdicts = def.conditions.map(evaluateCond);
  return { ready: verdicts.every((v) => v.met), verdicts };
}

/**
 * 인증(풀 심사) — 봄·가을 신청 → 그 계절 주말 15:00 심사. 심사위원 3 × 10 = 30, 합격선 15~25.
 * 점수 = 조건 진행률의 가중 평균 × 30 + 심사위원 편향(±1 씩, `cert` 스트림) — **무작위는 편향뿐**이고
 * 예상 점수(`expected`)는 편향 없이 같은 식으로 나와 신청 전에 보여 준다 (부정 리뷰 1 「실패 원인 불명」의 처방).
 * 첫 통과 = 보상(타일·선물·시설), 재통과 = 위로금 + 재료 3(G35), 근소 실패(합격선 −3 이내) = 재료 1.
 */
import type { CertDef, Condition } from '../data/schema.js';
import type { Rng } from './rng.js';
import type { Verdict } from './condition.js';
import { DAYS_PER_SEASON, JUDGE_TICK } from './clock.js';

export const JUDGES = 3;
export const POINTS_PER_JUDGE = 10;
export const MAX_SCORE = JUDGES * POINTS_PER_JUDGE;
/** 심사위원 편향 — D15: **0**. 심사는 「내가 무엇을 지었나」만 본다(실패는 내 선택 때문이어야). `cert` 스트림은 남기되 뽑지 않는다 */
export const JUDGE_BIAS = 0;
/** 신청은 계절 첫 이틀만 — 사흘째면 주말 심사 전에 준비 3일이 안 된다 */
export const APPLY_LAST_DAY_IN_SEASON = 1;
export const CONSOLATION_MONEY = 300;

export interface CertState {
  /** 통과 횟수 */
  passed: Record<string, number>;
  /** 신청 중인 인증 (심사일 포함) */
  applied: { id: string; judgeDay: number } | null;
  /** 최근 결과 (화면) */
  last: { id: string; score: number; pass: boolean; day: number; judges: number[] } | null;
}

export interface CertResult {
  id: string;
  score: number;
  judges: number[];
  pass: boolean;
  first: boolean;
}

export type Evaluator = (c: Condition) => Verdict;

export function certScore(def: CertDef, evaluateCond: Evaluator): { base: number; parts: { verdict: Verdict; weight: number }[] } {
  const parts = def.conditions.map((c) => ({ verdict: evaluateCond(c.cond), weight: c.weight }));
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  const base = wsum === 0 ? 0 : (parts.reduce((s, p) => s + p.verdict.progress * p.weight, 0) / wsum) * MAX_SCORE;
  return { base, parts };
}

export class CertStore {
  readonly defs: ReadonlyMap<string, CertDef>;
  state: CertState = { passed: {}, applied: null, last: null };
  /** 최근 심사의 보상 줄 (화면용 · 세션 전용, 저장 안 함) */
  lastRewards: string[] = [];

  constructor(defs: readonly CertDef[], private readonly rng: Rng) {
    this.defs = new Map(defs.map((d) => [d.id, d]));
  }

  passes(): number {
    return Object.values(this.state.passed).reduce((s, n) => s + n, 0);
  }

  passed(id: string): boolean {
    return (this.state.passed[id] ?? 0) > 0;
  }

  /** 신청 가능한가 — 계절·요일·선행·중복을 본다. 자격 미달이어도 **표는 보여 준다**(화면 몫) */
  canApply(id: string, day: number, money: number): { ok: true; judgeDay: number } | { ok: false; reason: string } {
    const def = this.defs.get(id);
    if (!def) return { ok: false, reason: '알 수 없는 인증' };
    if (this.state.applied) return { ok: false, reason: '이미 신청한 인증이 있습니다' };
    const season = Math.floor(day / DAYS_PER_SEASON) % 4;
    if (season !== 0 && season !== 2) return { ok: false, reason: '심사는 봄·가을에만 신청할 수 있습니다' };
    const dayInSeason = day % DAYS_PER_SEASON;
    if (dayInSeason > APPLY_LAST_DAY_IN_SEASON) return { ok: false, reason: '이번 계절은 늦었습니다 — 준비에 3일이 필요합니다' };
    if (def.requires && !this.passed(def.requires)) return { ok: false, reason: `먼저 ${this.defs.get(def.requires)?.name ?? def.requires} 을 통과해야 합니다` };
    if (def.fee > money) return { ok: false, reason: `신청료 ${def.fee.toLocaleString('ko-KR')}G 가 부족합니다` };
    const judgeDay = day - dayInSeason + (DAYS_PER_SEASON - 1);
    return { ok: true, judgeDay };
  }

  apply(id: string, day: number, money: number): { ok: true; judgeDay: number; fee: number } | { ok: false; reason: string } {
    const r = this.canApply(id, day, money);
    if (!r.ok) return r;
    this.state.applied = { id, judgeDay: r.judgeDay };
    return { ok: true, judgeDay: r.judgeDay, fee: (this.defs.get(id) as CertDef).fee };
  }

  /** 심사 시각인가 */
  isJudgeTime(day: number, tick: number): boolean {
    return this.state.applied !== null && this.state.applied.judgeDay === day && tick === JUDGE_TICK;
  }

  /** 심사 — 예상 점수 + 심사위원 편향 (정확히 3회 뽑는다: 결과와 무관하게 스트림이 밀리지 않도록) */
  judge(day: number, evaluateCond: Evaluator): CertResult | null {
    const ap = this.state.applied;
    if (!ap) return null;
    const def = this.defs.get(ap.id) as CertDef;
    const { base } = certScore(def, evaluateCond);
    const per = base / JUDGES;
    const judges: number[] = [];
    for (let k = 0; k < JUDGES; k++) {
      const bias = JUDGE_BIAS === 0 ? 0 : this.rng.intRange(-JUDGE_BIAS, JUDGE_BIAS);
      judges.push(Math.max(0, Math.min(POINTS_PER_JUDGE, Math.round(per + bias))));
    }
    const score = judges.reduce((s, n) => s + n, 0);
    const pass = score >= def.pass;
    const first = pass && !this.passed(def.id);
    if (pass) this.state.passed[def.id] = (this.state.passed[def.id] ?? 0) + 1;
    this.state.applied = null;
    this.state.last = { id: def.id, score, pass, day, judges };
    return { id: def.id, score, judges, pass, first };
  }

  toSnapshot(): CertState {
    return { passed: { ...this.state.passed }, applied: this.state.applied ? { ...this.state.applied } : null, last: this.state.last ? { ...this.state.last, judges: [...this.state.last.judges] } : null };
  }

  fromSnapshot(s: CertState): void {
    this.state = { passed: { ...s.passed }, applied: s.applied ? { ...s.applied } : null, last: s.last ? { ...s.last, judges: [...s.last.judges] } : null };
  }
}

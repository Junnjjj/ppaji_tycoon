import { describe, it, expect } from 'vitest';
import { JUDGE_TICK } from './clock.js';
import { CertStore, certScore, MAX_SCORE } from './cert.js';
import { Rng } from './rng.js';
import type { CertDef } from '../data/schema.js';
import type { Verdict } from './condition.js';

const def: CertDef = {
  id: 'entry', name: '입문', family: 'grade', grade: 'F', pass: 15, requires: null, fee: 500,
  conditions: [{ cond: { kind: 'popularity', min: 60 }, weight: 2 }, { cond: { kind: 'pool', sizeMin: 20 }, weight: 1 }],
  reward: { kind: 'gift', id: 'blue_orca' },
};
const v = (progress: number): Verdict => ({ met: progress >= 1, progress, actual: 0, need: 0, label: 'x' });

describe('인증', () => {
  it('점수 = 가중 진행률 × 30 — (2x) 조건이 두 배로 든다', () => {
    expect(certScore(def, (c) => v(c.kind === 'popularity' ? 1 : 0)).base).toBeCloseTo((2 / 3) * MAX_SCORE, 5);
    expect(certScore(def, () => v(0.5)).base).toBe(15);
  });
  it('신청 창 — 봄·가을 첫 이틀만, 선행 인증·돈', () => {
    const s = new CertStore([def, { ...def, id: 'c', grade: 'C', requires: 'entry', pass: 20 }], new Rng(1));
    expect(s.canApply('entry', 0, 1000).ok).toBe(true);
    expect(s.canApply('entry', 2, 1000).ok).toBe(false); // 사흘째
    expect(s.canApply('entry', 4, 1000).ok).toBe(false); // 여름
    expect(s.canApply('entry', 32, 1000).ok).toBe(true); // 3년차 봄? 32 = 2년차 봄 첫날
    expect(s.canApply('entry', 0, 100).ok).toBe(false);
    expect(s.canApply('c', 0, 5000).ok).toBe(false); // 선행
    const r = s.apply('entry', 1, 1000);
    expect(r.ok && r.judgeDay).toBe(3);
    expect(s.canApply('entry', 1, 1000).ok).toBe(false); // 이미 신청
  });
  it('심사 — 편향은 ±1, 같은 시드는 같은 점수, 뽑기는 정확히 3회', () => {
    const a = new CertStore([def], new Rng(7));
    const b = new CertStore([def], new Rng(7));
    a.apply('entry', 0, 1000);
    b.apply('entry', 0, 1000);
    expect(a.isJudgeTime(3, JUDGE_TICK)).toBe(true);
    const ra = a.judge(3, () => v(0.6))!;
    const rb = b.judge(3, () => v(0.6))!;
    expect(ra.score).toBe(rb.score);
    expect(ra.judges.length).toBe(3);
    for (const j of ra.judges) expect(Math.abs(j - 6)).toBeLessThanOrEqual(1);
    expect(ra.pass).toBe(ra.score >= 15);
    expect(a.state.applied).toBeNull();
    // 첫 통과 여부
    if (ra.pass) { expect(ra.first).toBe(true); expect(a.passes()).toBe(1); }
  });
  it('스냅샷 왕복', () => {
    const s = new CertStore([def], new Rng(1));
    s.apply('entry', 0, 1000);
    const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
    const t = new CertStore([def], new Rng(1));
    t.fromSnapshot(snap);
    expect(t.toSnapshot()).toEqual(snap);
  });
});

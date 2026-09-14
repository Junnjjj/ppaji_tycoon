/**
 * 등급 심사 (K42, 스펙 §3.2) — **승급은 응시하는 시험이다.**
 *
 * 예전에는 만족도 이동평균이 문턱을 넘으면 자동 승급이었다 — 수동 대기다. PSS 준거로
 * 바꿨다: 문턱은 **응시 자격**이 되고, 신청 → 준비 기간 → 주말 판정 → 부분 점수다.
 * "내가 응시를 결정했다"가 핵심이다.
 *
 * 판정에 **무작위가 없다.** 스펙 초안은 rng.fork 판정이었지만, 조건 진행도(부분 점수)가
 * 이미 결정적이라 굴릴 것이 없다 — 실패는 언제나 내 배치와 내 운영 때문이다 (v4:
 * "실패는 내 선택 때문이어야"). 같은 판 같은 주면 언제나 같은 판정이 나온다.
 *
 * 강등은 예전처럼 자동이다 (nextGrade 의 내림 경로) — 관리 실패는 시험을 봐 주지 않는다.
 */
import {
  GRADES,
  evaluateCondition,
  supplyOf,
  type GradeDef,
  type QuestCondition,
} from './progress.js';
import type { WeekSummary } from './week.js';
import { evaluateCombos } from './combos.js';
import type { PlacementGrid } from './placement.js';

/** 조건당 만점 */
export const EXAM_POINTS_PER_REQ = 10;
/**
 * 통과 지원금 = 수수료 × 2. 준비된 응시는 투자가 되고 탈락은 손실이 된다 —
 * 수수료가 빠듯한 경제를 조용히 조르던 것을 실측(경보 12회/판)으로 잡고 넣었다.
 * "허가는 돈으로 못 산다"와 안 부딪힌다 — 돈을 내는 게 아니라 받는 쪽이다.
 */
export const EXAM_PASS_GRANT_RATIO = 2;
/** 커트라인 — 만점을 요구하지 않는다 (PSS 도 30점 중 최대 25) */
export const EXAM_PASS_RATIO = 0.75;
/**
 * 신청 마감 — 이 tick(목요일 시작) 전에 내면 이번 주말, 이후면 다음 주말에 심사한다.
 * 준비 기간이 최소 2일은 되게 하는 장치다 (스펙 A2 부속).
 */
export const EXAM_APPLY_CUTOFF_TICK = 360;

export interface ExamPending {
  /** 목표 등급 */
  target: number;
  /** 이 주차의 결산에서 판정한다 (week.week 기준 — 결산 후의 값) */
  judgeWeek: number;
}

export interface ExamSnapshot {
  pending: ExamPending | null;
  passed: number;
}

export interface ExamVerdict {
  target: number;
  passed: boolean;
  /** 통과 지원금 (수수료 × 2) — 탈락이면 0 */
  grant: number;
  score: number;
  max: number;
  /** 조건별 점수와 설명 — 결과 모달과 처방이 쓴다 */
  perReq: { detail: string; score: number }[];
  /** 첫 통과인가 — **이동 붓**이 여기 걸려 있다 (⏩ 주 스킵은 K47-② 에서 사라졌다) */
  firstPass: boolean;
}

/** 다음 등급 정의 (없으면 최종 등급이다) */
export function nextGradeDef(gradeNo: number): GradeDef | null {
  return GRADES.find((g) => g.grade === gradeNo + 1) ?? null;
}

/**
 * 어느 주말에 판정하나 (K48) — `apply` 와 확인 화면이 **이 하나**를 쓴다.
 *
 * 갈라지면 "화면은 이번 주말이라는데 다음 주에 판정" 이 된다. 규칙 자체는 K42 그대로다:
 * 목요일(tick 360) 전이면 이번 주말, 이후면 다음 주말 — 준비 기간 최소 2일.
 */
export function examJudgeWeek(weekNo: number, tickInWeek: number): number {
  return tickInWeek < EXAM_APPLY_CUTOFF_TICK ? weekNo : weekNo + 1;
}

/** 조건 하나의 지금 점수 — 예상과 판정이 같은 모양을 쓴다 */
export interface ExamReqScore {
  /** 원본 조건 — 이름표는 화면이 붙인다 (sim 은 표시를 모른다) */
  req: QuestCondition;
  detail: string;
  score: number;
  done: boolean;
}

/** 지금 응시하면 몇 점인가 (K48) */
export interface ExamScore {
  target: number;
  perReq: ExamReqScore[];
  score: number;
  max: number;
  /** 커트라인 — 이 점수 이상이면 통과 */
  cut: number;
  passed: boolean;
  /** 수수료 (없으면 0) */
  fee: number;
}

/**
 * 점수를 잰다 — **판정과 예상이 이 하나를 공유한다** (K48).
 *
 * ⚠ 갈라지면 "화면은 23점인데 떨어졌다"가 된다. `judge()` 는 이 함수의 결과를 그대로
 * 옮겨 담을 뿐이고, 확인 화면은 같은 함수를 **상태를 안 바꾸고** 부른다.
 * `evaluateCondition` 이 의뢰·심사의 유일한 평가기라는 규칙(progress.ts)의 한 겹 위다.
 */
export function scoreExam(
  target: number,
  placement: PlacementGrid,
  summary: WeekSummary | null,
  /** 수영 구역 (S4) — 의뢰와 같은 재료를 받아야 "의뢰로는 3개, 심사로는 2개"가 안 된다 */
  zones: Parameters<typeof evaluateCombos>[2] = [],
): ExamScore {
  const def = GRADES.find((g) => g.grade === target);
  const reqs = def?.examReqs ?? [];
  const supply = supplyOf(placement);
  const combos = evaluateCombos(placement, undefined, zones);
  const perReq: ExamReqScore[] = reqs.map((c) => {
    const ev = evaluateCondition(c, placement, summary, supply, combos);
    return {
      req: c,
      detail: ev.detail,
      score: Math.round(ev.progress * EXAM_POINTS_PER_REQ),
      done: ev.done,
    };
  });
  const score = perReq.reduce((a, r) => a + r.score, 0);
  const max = reqs.length * EXAM_POINTS_PER_REQ;
  const cut = Math.ceil(max * EXAM_PASS_RATIO);
  return { target, perReq, score, max, cut, passed: max === 0 ? true : score >= cut, fee: def?.examFee ?? 0 };
}

export class ExamStore {
  private pendingState: ExamPending | null = null;
  private passedCount = 0;

  get pending(): ExamPending | null {
    return this.pendingState;
  }

  get passed(): number {
    return this.passedCount;
  }

  /**
   * 이동 붓 — 첫 심사 통과의 보상 (스펙 §4.1).
   *
   * ⚠ 예전에는 `⏩ 주 스킵`도 여기 걸려 있었지만 K47-② 에서 스킵 자체를 없앴다
   * (시간은 흐르는 낮으로 자동이고, 스킵을 원하는 순간은 "할 게 없다"는 신호다).
   */
  get toolsUnlocked(): boolean {
    return this.passedCount > 0;
  }

  /** 응시 자격 — 다음 등급이 있고, 평판(이동평균)이 그 문턱을 넘었고, 대기 중이 아니다 */
  eligible(gradeNo: number, reputation: number): GradeDef | null {
    if (this.pendingState) return null;
    const next = nextGradeDef(gradeNo);
    if (!next) return null;
    return reputation >= next.reqExitSatisfaction ? next : null;
  }

  /**
   * 신청. `weekNo` 는 진행 중인 주(= 완료 주 + 1), `tickInWeek` 는 그 주 안의 tick.
   * 목요일(tick 360) 전이면 이번 주말, 이후면 다음 주말 — 준비 기간 최소 2일.
   */
  apply(target: number, weekNo: number, tickInWeek: number): ExamPending {
    const judgeWeek = examJudgeWeek(weekNo, tickInWeek);
    this.pendingState = { target, judgeWeek };
    return this.pendingState;
  }

  /**
   * 결산에서 부른다 (완료 주 = `weekNo`). 판정 주가 아니면 null.
   * 실패해도 자격이 남아 있으면 다시 신청하면 된다 — 수수료가 재응시의 무게다.
   */
  judge(
    weekNo: number,
    placement: PlacementGrid,
    summary: WeekSummary | null,
    /** 수영 구역 (S4) — 의뢰와 같은 재료를 받아야 "의뢰로는 3개, 심사로는 2개"가 안 된다 */
    zones: Parameters<typeof evaluateCombos>[2] = [],
  ): ExamVerdict | null {
    const p = this.pendingState;
    if (!p || p.judgeWeek > weekNo) return null;
    this.pendingState = null;
    // ⚠ 확인 화면과 **같은 평가기**다 (K48). 여기서 다시 세면 두 숫자가 갈라진다
    const s = scoreExam(p.target, placement, summary, zones);
    const perReq = s.perReq.map((r) => ({ detail: r.detail, score: r.score }));
    const firstPass = s.passed && this.passedCount === 0;
    if (s.passed) this.passedCount++;
    const grant = s.passed ? s.fee * EXAM_PASS_GRANT_RATIO : 0;
    return { target: p.target, passed: s.passed, score: s.score, max: s.max, perReq, firstPass, grant };
  }

  toSnapshot(): ExamSnapshot {
    return { pending: this.pendingState, passed: this.passedCount };
  }

  static fromSnapshot(s: ExamSnapshot | undefined): ExamStore {
    const e = new ExamStore();
    e.pendingState = s?.pending ?? null;
    e.passedCount = s?.passed ?? 0;
    return e;
  }
}

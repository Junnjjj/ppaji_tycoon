/**
 * 심사 (K42) — 승급이 시험이 됐는지, 그 시험이 공정한지.
 */
import { describe, expect, it } from 'vitest';
import { ExamStore, EXAM_APPLY_CUTOFF_TICK, nextGradeDef } from './exam.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';

const GATE = { i: 0, j: 0 };

function flat(size = 30): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'path_stone');
  return { t, w: new WallGrid(size, size), p: new PlacementGrid(size, size) };
}

describe('심사', () => {
  it('자격 — 다음 등급 문턱을 넘어야 응시할 수 있다', () => {
    const e = new ExamStore();
    expect(e.eligible(1, 54)).toBeNull(); // 2등급 문턱 55
    expect(e.eligible(1, 55)?.grade).toBe(2);
    expect(e.eligible(5, 100)).toBeNull(); // 최종 등급 — 위가 없다
    e.apply(2, 1, 0);
    expect(e.eligible(1, 99)).toBeNull(); // 대기 중엔 다시 못 낸다
  });

  it('준비 기간 — 목요일 전 신청은 이번 주말, 이후는 다음 주말 (최소 2일)', () => {
    const e = new ExamStore();
    expect(e.apply(2, 3, EXAM_APPLY_CUTOFF_TICK - 1).judgeWeek).toBe(3);
    const e2 = new ExamStore();
    expect(e2.apply(2, 3, EXAM_APPLY_CUTOFF_TICK).judgeWeek).toBe(4);
  });

  it('판정 — 부분 점수는 결정적이고, 조건을 채우면 통과한다 (무작위 없음)', () => {
    const { t, w, p } = flat();
    // 2등급 요구: 위생 3 · 먹거리 2 · 만족 55
    expect(p.place(t, w, GATE, 'vending_out', 3, 3).ok).toBe(true);
    expect(p.place(t, w, GATE, 'snackbar', 6, 3).ok).toBe(true);
    // 위생은 실내가 필요하다 — 실내 바닥을 깔고 화장실 셋
    for (let i = 10; i < 20; i++) for (let j = 10; j < 14; j++) t.paint(i, j, 'floor_indoor');
    expect(p.place(t, w, GATE, 'toilet', 11, 11).ok).toBe(true);
    expect(p.place(t, w, GATE, 'toilet', 13, 11).ok).toBe(true);
    expect(p.place(t, w, GATE, 'toilet', 15, 11).ok).toBe(true);

    const summary = { visitors: 50, turnedAway: 0, profit: 0, exitSatisfaction: 60 };
    const e = new ExamStore();
    e.apply(2, 5, 0);
    expect(e.judge(4, p, summary)).toBeNull(); // 판정 주 전이다
    const v1 = e.judge(5, p, summary);
    expect(v1?.passed).toBe(true);
    expect(v1?.firstPass).toBe(true);
    expect(v1?.score).toBe(30); // 3·2·55 전부 충족 = 만점
    // 같은 입력이면 같은 판정 — 두 세계 대조
    const e2 = ExamStore.fromSnapshot({ pending: { target: 2, judgeWeek: 5 }, passed: 0 });
    expect(e2.judge(5, p, summary)?.score).toBe(30);
  });

  it('부분 점수 — 조금 모자라면 조금 깎이고, 커트라인(75%) 아래면 탈락 후 재응시 가능', () => {
    const { t, w, p } = flat();
    // 먹거리만 2개 — 위생 0, 만족 0
    expect(p.place(t, w, GATE, 'vending_out', 3, 3).ok).toBe(true);
    expect(p.place(t, w, GATE, 'snackbar', 6, 3).ok).toBe(true);
    const e = new ExamStore();
    e.apply(2, 1, 0);
    const v = e.judge(1, p, { visitors: 0, turnedAway: 0, profit: 0, exitSatisfaction: 0 });
    expect(v?.passed).toBe(false);
    expect(v?.score).toBe(10); // 먹거리 10 + 위생 0 + 만족 0
    expect(e.pending).toBeNull(); // 판정 후 대기 해제 — 재응시 가능
    expect(e.eligible(1, 60)?.grade).toBe(2);
    expect(e.toolsUnlocked).toBe(false); // 탈락은 보상이 없다
  });

  it('첫 통과에만 firstPass — 도구는 한 번만 준다', () => {
    const { t, w, p } = flat();
    const summary = { visitors: 999, turnedAway: 0, profit: 0, exitSatisfaction: 99 };
    // 5등급 요구까지 다 채우진 않는다 — 2등급을 두 번 (스냅샷 왕복 포함)
    for (const [id, i] of [
      ['vending_out', 3],
      ['snackbar', 6],
    ] as const) {
      expect(p.place(t, w, GATE, id, i, 3).ok).toBe(true);
    }
    for (let i = 10; i < 20; i++) for (let j = 10; j < 14; j++) t.paint(i, j, 'floor_indoor');
    for (const i of [11, 13, 15]) expect(p.place(t, w, GATE, 'toilet', i, 11).ok).toBe(true);

    const e = new ExamStore();
    e.apply(2, 1, 0);
    expect(e.judge(1, p, summary)?.firstPass).toBe(true);
    expect(e.toolsUnlocked).toBe(true);
    const back = ExamStore.fromSnapshot(e.toSnapshot());
    expect(back.toolsUnlocked).toBe(true); // 세이브를 살아남는다
    back.apply(3, 2, 0);
    expect(back.judge(2, p, summary)?.firstPass).toBe(false); // 둘째 통과는 firstPass 아님
  });

  it('nextGradeDef — 5등급 위는 없다', () => {
    expect(nextGradeDef(1)?.grade).toBe(2);
    expect(nextGradeDef(5)).toBeNull();
  });
});

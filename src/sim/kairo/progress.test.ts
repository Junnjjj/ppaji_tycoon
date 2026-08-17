import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, allFacilityDefs } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';
import {
  QUESTS,
  GRADES,
  requiredGrade,
  gradeFor,
  questStatuses,
  ProgressStore,
} from './progress.js';

const GATE = { i: 0, j: 0 };

function flat(size = 30): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'lawn');
  return { t, w: new WallGrid(size, size), p: new PlacementGrid(size, size) };
}

describe('의뢰 데이터', () => {
  it('16종이고 ID 가 유일하다', () => {
    expect(QUESTS).toHaveLength(16);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(16);
  });

  it('전부 설명과 보상을 갖는다', () => {
    for (const q of QUESTS) {
      expect(q.desc.length, q.id).toBeGreaterThan(4);
      expect(q.reward.cash, q.id).toBeGreaterThan(0);
    }
  });

  it('보상이 대체로 커진다 — 뒤 의뢰가 더 어렵다', () => {
    const first = QUESTS[0]!.reward.cash;
    const last = QUESTS[QUESTS.length - 1]!.reward.cash;
    expect(last).toBeGreaterThan(first * 5);
  });

  it('참조하는 시설·수요가 존재한다', () => {
    const ids = new Set(allFacilityDefs().map((d) => d.id));
    const needs = new Set(
      allFacilityDefs().map((d) => (d as unknown as { need: string }).need),
    );
    for (const q of QUESTS) {
      if (q.condition.facility) expect(ids.has(q.condition.facility), q.id).toBe(true);
      if (q.condition.need) expect(needs.has(q.condition.need), q.id).toBe(true);
    }
  });
});

describe('해금 — 허가는 돈으로 못 산다', () => {
  it('등급 5단이고 만족도 요구가 오름차순이다', () => {
    expect(GRADES).toHaveLength(5);
    for (let k = 1; k < GRADES.length; k++) {
      expect(GRADES[k]!.reqExitSatisfaction).toBeGreaterThan(GRADES[k - 1]!.reqExitSatisfaction);
    }
  });

  it('등급이 오르면 수면 면적과 토지가 함께 넓어진다', () => {
    for (let k = 1; k < GRADES.length; k++) {
      expect(GRADES[k]!.permitArea).toBeGreaterThan(GRADES[k - 1]!.permitArea);
      expect(GRADES[k]!.landW).toBeGreaterThanOrEqual(GRADES[k - 1]!.landW);
    }
  });

  it('최종 등급이 격자 40×32 를 다 연다', () => {
    const top = GRADES[GRADES.length - 1]!;
    expect([top.landW, top.landH]).toEqual([40, 32]);
  });

  it('만족도로만 등급이 정해진다', () => {
    expect(gradeFor(0).grade).toBe(1);
    expect(gradeFor(60).grade).toBe(2);
    expect(gradeFor(70).grade).toBe(3);
    expect(gradeFor(80).grade).toBe(4);
    expect(gradeFor(90).grade).toBe(5);
  });

  it('시작 등급에서도 시설 절반 이상이 열린다 — 처음부터 할 게 있어야 한다', () => {
    const open = allFacilityDefs().filter((d) => requiredGrade(d.id) === 1);
    expect(open.length).toBeGreaterThan(allFacilityDefs().length / 2);
  });

  it('가장 큰 시설은 최종 등급에서 열린다', () => {
    expect(requiredGrade('turtle_island')).toBe(5);
    expect(requiredGrade('pension_duplex')).toBe(5);
  });
});

describe('의뢰 진행도', () => {
  it('아무것도 없으면 대부분 미완료지만 목록은 보인다', () => {
    const { p } = flat();
    const st = questStatuses(p, null);
    expect(st).toHaveLength(16);
    expect(st.filter((s) => s.done).length).toBeLessThan(4);
    for (const s of st) expect(s.detail.length).toBeGreaterThan(0);
  });

  it('먹거리를 2개 지으면 해당 의뢰가 완료된다', () => {
    const { t, w, p } = flat();
    const st0 = questStatuses(p, null).find((s) => s.id === 'food_stall')!;
    expect(st0.done).toBe(false);
    expect(p.place(t, w, GATE, 'shop', 5, 5).ok).toBe(true);
    expect(p.place(t, w, GATE, 'snackbar', 9, 5).ok).toBe(true);
    const st1 = questStatuses(p, null).find((s) => s.id === 'food_stall')!;
    expect(st1.done).toBe(true);
    expect(st1.progress).toBe(1);
  });

  it('진행도가 0..1 안이다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 5, 5);
    for (const s of questStatuses(p, null)) {
      expect(s.progress, s.id).toBeGreaterThanOrEqual(0);
      expect(s.progress, s.id).toBeLessThanOrEqual(1);
    }
  });

  it('주간 조건은 결산이 있어야 판정된다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 5, 5);
    const g = new GuestStore(t, w, p, GATE, { ...GUEST_DEFAULTS, wantUses: 1, useTicks: 5 });
    g.invalidate();
    const before = questStatuses(p, null).find((s) => s.id === 'first_guest')!;
    expect(before.done).toBe(false);
    const rep = new WeekRunner(t, p, g).run(new Rng(5));
    const after = questStatuses(p, rep).find((s) => s.id === 'first_guest')!;
    expect(after.done).toBe(rep.visitors >= 10);
  });
});

describe('보상은 한 번만', () => {
  it('완료된 의뢰를 청구하면 현금이 들어온다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 5, 5);
    p.place(t, w, GATE, 'snackbar', 9, 5);
    const store = new ProgressStore();
    const first = store.claim(questStatuses(p, null));
    expect(first.ids).toContain('food_stall');
    expect(first.cash).toBeGreaterThan(0);
  });

  it('두 번 청구하면 0 이다 — 반복 지급은 무한 수입이 된다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 5, 5);
    p.place(t, w, GATE, 'snackbar', 9, 5);
    const store = new ProgressStore();
    store.claim(questStatuses(p, null));
    const second = store.claim(questStatuses(p, null));
    expect(second.ids).toHaveLength(0);
    expect(second.cash).toBe(0);
  });

  it('스냅샷 왕복 후에도 다시 안 준다', () => {
    const { t, w, p } = flat();
    p.place(t, w, GATE, 'shop', 5, 5);
    p.place(t, w, GATE, 'snackbar', 9, 5);
    const store = new ProgressStore();
    store.claim(questStatuses(p, null));
    const back = ProgressStore.fromSnapshot(store.toSnapshot());
    expect(back.claimedCount).toBe(store.claimedCount);
    expect(back.claim(questStatuses(p, null)).cash).toBe(0);
  });
});

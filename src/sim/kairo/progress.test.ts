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
  Reputation,
  nextGrade,
  GRADE_HYSTERESIS,
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

  it('최종 등급이 격자 64×48 을 다 연다', () => {
    const top = GRADES[GRADES.length - 1]!;
    expect([top.landW, top.landH]).toEqual([64, 48]);
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

describe('평판 이동평균 (§9.2) — 진동을 누른다', () => {
  it('첫 주는 그대로 받는다 — 0 에서 올라오면 첫 등급이 늦게 열린다', () => {
    const r = new Reputation();
    expect(r.push(70)).toBe(70);
  });

  it('평범하게 나쁜 한 주에는 등급이 안 흔들린다 (이동평균 + 이력)', () => {
    const r = new Reputation();
    for (let k = 0; k < 8; k++) r.push(78);
    const before = gradeFor(r.value).grade;
    r.push(62); // 나쁘지만 재난은 아닌 한 주
    expect(nextGrade(before, r.value).grade).toBe(before);
  });

  it('재난급 한 주는 등급을 떨어뜨린다 — 아무것도 안 움직이면 관리가 무의미하다', () => {
    /*
     * 78 → 40 은 −38 이다 (시설이 전부 서는 정도). 이건 떨어져야 한다.
     * 이력의 목적은 **소음을 죽이는 것**이고 사건을 지우는 게 아니다.
     */
    const r = new Reputation();
    for (let k = 0; k < 8; k++) r.push(78);
    const before = gradeFor(r.value).grade;
    r.push(40);
    expect(nextGrade(before, r.value).grade).toBeLessThan(before);
  });

  it('⚠ 지난주 값 하나를 쓰면 진동한다 — 이동평균은 그걸 누른다', () => {
    /*
     * 실측: 등급 오름 → 수요 증가 → 혼잡 → 만족도 하락 → 등급 내림 → 수요 감소 →
     * 만족도 회복 → … 40주 동안 만족도 53↔75, 등급 2↔3 을 왕복했다.
     * 여기서는 그 패턴을 그대로 흉내내 **등급 변동 횟수**를 비교한다.
     */
    const wave = Array.from({ length: 40 }, (_, k) => (k % 2 === 0 ? 55 : 78));
    let rawFlips = 0;
    let prevRaw = gradeFor(wave[0] as number).grade;
    for (const v of wave) {
      const g = gradeFor(v).grade;
      if (g !== prevRaw) rawFlips++;
      prevRaw = g;
    }
    const r = new Reputation();
    let emaFlips = 0;
    let cur = 1;
    for (const v of wave) {
      const g = nextGrade(cur, r.push(v)).grade;
      if (g !== cur) emaFlips++;
      cur = g;
    }
    expect(rawFlips).toBeGreaterThan(10);
    // 이동평균 + 이력이면 한 번 올라간 뒤 유지된다
    expect(emaFlips).toBeLessThan(4);
  });

  it('꾸준히 좋으면 결국 그 값에 수렴한다 — 영원히 못 올라가면 안 된다', () => {
    const r = new Reputation();
    for (let k = 0; k < 60; k++) r.push(88);
    expect(r.value).toBeGreaterThan(87);
    expect(gradeFor(r.value).grade).toBe(5);
  });

  it('이력이 오르는 쪽은 막지 않는다 — 올라갈 길이 있어야 한다', () => {
    expect(nextGrade(2, 65).grade).toBe(3);
    expect(nextGrade(3, 75).grade).toBe(4);
    expect(GRADE_HYSTERESIS).toBeGreaterThan(0);
  });

  it('정말 나빠지면 내려간다 — 영원히 유지되면 관리할 이유가 없다', () => {
    expect(nextGrade(4, 40).grade).toBeLessThan(4);
  });

  it('스냅샷을 왕복해도 기억이 남는다', () => {
    const r = new Reputation();
    for (let k = 0; k < 5; k++) r.push(72);
    const back = Reputation.fromSnapshot(r.toSnapshot());
    expect(back.value).toBeCloseTo(r.value, 9);
  });
});

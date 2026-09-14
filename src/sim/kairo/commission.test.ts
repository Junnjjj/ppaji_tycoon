import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { SHOP_ITEMS } from './shop.js';
import { STAFF_ROLES } from './staff.js';
import { TICKS_PER_DAY, TICKS_PER_WEEK } from './week.js';
import {
  COMMISSIONS,
  COMMISSION_FEE_SHARE,
  COMMISSION_RNG_SALT,
  COMMISSION_SLOTS,
  CommissionStore,
  commissionDef,
  commissionSlots,
  commissionVisitorMult,
  setCommissionFaultForTest,
  hireJobFor,
  hireJobsAvailable,
  validateCommissionData,
  type CommissionSnapshot,
} from './commission.js';

const shopTargets = SHOP_ITEMS.map((x) => x.target);
const supply = COMMISSIONS.find((c) => c.category === 'supply')!;
const publicity = COMMISSIONS.find((c) => c.category === 'publicity')!;

const stream = (seed = 1234): Rng => new Rng(seed).fork(COMMISSION_RNG_SALT);

describe('수배 데이터 — 구입과의 경계 (P4 · D2)', () => {
  it('모든 수배가 `days >= 2` 다 — 0~1 이면 그건 구입이다', () => {
    expect(validateCommissionData(shopTargets)).toEqual([]);
    for (const c of COMMISSIONS) expect(c.days, c.id).toBeGreaterThanOrEqual(2);
  });

  it('⚠ 대조군 — `days: 1` 을 주입하면 잡힌다', () => {
    const victim = supply as unknown as { days: number };
    const saved = victim.days;
    victim.days = 1;
    try {
      expect(validateCommissionData().some((p) => p.includes('구입이다'))).toBe(true);
    } finally {
      victim.days = saved;
    }
    expect(validateCommissionData()).toEqual([]);
  });

  it('상점과 대상이 안 겹친다 — 겹치면 수배가 항상 손해다', () => {
    for (const c of COMMISSIONS) {
      if (c.item !== undefined) expect(shopTargets, c.id).not.toContain(c.item);
    }
    // ⚠ 대조군: 상점이 파는 것을 조달 대상으로 주면 잡힌다
    expect(validateCommissionData([supply.item as string]).some((p) => p.includes('겹친다')))
      .toBe(true);
  });

  it('분류가 §8-1 의 수대로 있다 (+ P6 구인 5)', () => {
    const by = (cat: string): number => COMMISSIONS.filter((c) => c.category === cat).length;
    // §8-1 이 정한 16 = 조달 6 · 홍보 4 · 특수 6. P6 이 **구인 5**(직원 역할 수)를 더했다
    expect([by('supply'), by('publicity'), by('special')]).toEqual([6, 4, 6]);
    expect(by('hire')).toBe(STAFF_ROLES.length);
    expect(COMMISSIONS).toHaveLength(21);
  });

  it('구인은 리드타임이 1~2주다 — 다른 분류(2~7일)보다 길다 (D4)', () => {
    /*
     * ⚠ 짧아지면 「기다린다」가 사라져 즉시 고용과 구별이 안 된다. 사람을 구하는 일이라
     * 물건을 들여오는 것보다 오래 걸리는 것이 맞다.
     */
    for (const c of COMMISSIONS.filter((x) => x.category === 'hire')) {
      expect(c.days, c.id).toBeGreaterThanOrEqual(7);
      expect(c.days, c.id).toBeLessThanOrEqual(14);
      expect(hireJobFor(c.role as string)?.id).toBe(c.id);
    }
    for (const r of STAFF_ROLES) expect(hireJobFor(r.id), r.id).toBeDefined();
  });

  it('⚠ 구인 데이터가 비면 **즉시 고용으로 돌아간다** — 여기만 폴백이 있다', () => {
    /*
     * 다른 축은 데이터를 비우면 그 축만 잠들지만, 구인은 비우면 **직원을 아예 못 뽑아**
     * 판이 죽는다. 그래서 코드 폴백을 두고 그 폴백 자체를 이 검사가 지킨다.
     */
    expect(hireJobsAvailable()).toBe(true);
    const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
    expect(main).toContain('hireJobsAvailable()');
  });
});

describe('수배는 주 루프의 뽑기를 안 민다 (P4 격리)', () => {
  afterEach(() => setCommissionFaultForTest(null));

  /** 주 루프가 쓰는 스트림을 흉내 낸다 — 수배가 여기서 뽑으면 시퀀스가 밀린다 */
  const weekSequence = (act: (week: Rng) => void): number[] => {
    const root = new Rng(20260827);
    const week = root.fork(0x57ea7);
    act(week);
    return Array.from({ length: 6 }, () => week.next());
  };

  it('격리 ① 발주해도 주 시퀀스가 안 밀린다', () => {
    const control = weekSequence(() => undefined);
    const withOrder = weekSequence(() => {
      new CommissionStore().enqueue(supply, 0, stream());
    });
    expect(withOrder).toEqual(control);
  });

  it('격리 ② 완료 판정도 주 시퀀스를 안 민다', () => {
    const control = weekSequence(() => undefined);
    const withDone = weekSequence(() => {
      const store = new CommissionStore();
      const rng = stream();
      store.enqueue(supply, 0, rng);
      store.advanceTo(TICKS_PER_WEEK * 2, rng);
    });
    expect(withDone).toEqual(control);
  });

  it('격리 ③ 주 스트림의 **상태**도 그대로다 (값만 보면 놓친다)', () => {
    /*
     * ⚠ 값 여섯 개만 비교하면 스트림이 같은 자리에서 시작해 **다른 곳으로 갔는지**를
     * 못 본다. `state` 를 같이 봐야 「이번엔 우연히 같았다」가 안 통한다.
     */
    const root = new Rng(7);
    const a = root.fork(0x57ea7);
    const b = new Rng(7).fork(0x57ea7);
    const store = new CommissionStore();
    const rng = stream();
    store.enqueue(supply, 0, rng);
    store.enqueue(publicity, 0, rng);
    store.advanceTo(TICKS_PER_WEEK * 3, rng);
    for (let i = 0; i < 4; i++) { a.next(); b.next(); }
    expect(a.state).toBe(b.state);
  });

  it('격리 ④ 전용 salt 는 main·봇이 같은 값을 쓴다 (정적)', () => {
    expect(COMMISSION_RNG_SALT).toBe(0xc0f5);
    // 다른 스트림과 안 겹친다 — 겹치면 두 축이 같은 수를 쓴다
    for (const other of [0x57ea7, 0x6ae57, 0xae601, 0xacc1, 0xca7d, 0x57aff, 0xc0125, 0x9e0]) {
      expect(COMMISSION_RNG_SALT).not.toBe(other);
    }
  });

  it('⚠ 대조군 — 주 rng 를 그대로 쓰면 격리가 무너진다', () => {
    /*
     * `shared-rng` 스위치를 만드는 대신 **실제로 주 스트림을 넘겨** 무너지는 것을 보인다 —
     * 그것이 이 검사가 막으려는 바로 그 실수(전용 스트림을 안 쓰는 것)의 모양이다.
     */
    const control = weekSequence(() => undefined);
    const shared = weekSequence((week) => {
      new CommissionStore().enqueue(supply, 0, week);
    });
    expect(shared).not.toEqual(control);
  });
});

describe('시계 감기는 멱등이다 (P4)', () => {
  afterEach(() => setCommissionFaultForTest(null));

  it('같은 tick 으로 두 번 불러도 한 번만 끝난다', () => {
    const store = new CommissionStore();
    const rng = stream();
    store.enqueue(supply, 0, rng);
    const at = supply.days * TICKS_PER_DAY;
    expect(store.advanceTo(at, rng)).toHaveLength(1);
    expect(store.advanceTo(at, rng)).toHaveLength(0);
    expect(store.pending).toHaveLength(0);
  });

  it('마감 전에는 아무것도 안 끝난다', () => {
    const store = new CommissionStore();
    const rng = stream();
    store.enqueue(supply, 0, rng);
    expect(store.advanceTo(supply.days * TICKS_PER_DAY - 1, rng)).toHaveLength(0);
    expect(store.pending).toHaveLength(1);
  });

  it('⚠ 대조군 — double-complete 를 켜면 멱등이 무너진다', () => {
    setCommissionFaultForTest('double-complete');
    const store = new CommissionStore();
    const rng = stream();
    store.enqueue(supply, 0, rng);
    const at = supply.days * TICKS_PER_DAY;
    expect(store.advanceTo(at, rng)).toHaveLength(1);
    expect(store.advanceTo(at, rng)).toHaveLength(1);
  });
});

describe('뽑기 수는 결과에 안 끌려간다 (P4)', () => {
  afterEach(() => setCommissionFaultForTest(null));

  /** 스트림을 얼마나 소비했나 — 상태를 비교해서 센다 */
  const consumed = (act: (rng: Rng) => void): string => {
    const rng = stream(99);
    act(rng);
    return String(rng.state);
  };

  it('확정(chance 1)이든 아니든 발주 뽑기는 한 번이다', () => {
    const sure = COMMISSIONS.find((c) => c.chance >= 1)!;
    const risky = COMMISSIONS.find((c) => c.chance < 1)!;
    expect(consumed((r) => { new CommissionStore().enqueue(sure, 0, r); }))
      .toBe(consumed((r) => { new CommissionStore().enqueue(risky, 0, r); }));
  });

  it('완료는 성공·실패와 무관하게 정확히 2뽑기다', () => {
    const win = new CommissionStore();
    const lose = new CommissionStore();
    // roll 을 직접 심어 성공/실패를 만든다 — 뽑기 수만 보고 싶다
    const snap = (roll: number): CommissionSnapshot => ({
      pending: [{ defId: supply.id, dueTick: 0, roll }],
    });
    void win;
    void lose;
    const a = consumed((r) => {
      CommissionStore.fromSnapshot(snap(0)).advanceTo(TICKS_PER_WEEK, r);
    });
    const b = consumed((r) => {
      CommissionStore.fromSnapshot(snap(1)).advanceTo(TICKS_PER_WEEK, r);
    });
    expect(a).toBe(b);
  });

  it('⚠ 대조군 — roll-skew 를 켜면 뽑기 수가 성질에 끌려간다', () => {
    setCommissionFaultForTest('roll-skew');
    const sure = COMMISSIONS.find((c) => c.chance >= 1)!;
    const risky = COMMISSIONS.find((c) => c.chance < 1)!;
    expect(consumed((r) => { new CommissionStore().enqueue(sure, 0, r); }))
      .not.toBe(consumed((r) => { new CommissionStore().enqueue(risky, 0, r); }));
  });
});

describe('수배 상태는 저장된다 — 2주짜리가 리로드로 증발하면 안 된다 (P4)', () => {
  it('세이브를 왕복해도 마감과 뽑기값이 그대로다', () => {
    const store = new CommissionStore();
    store.enqueue(supply, 500, stream());
    const back = CommissionStore.fromSnapshot(
      JSON.parse(JSON.stringify(store.toSnapshot())) as CommissionSnapshot,
    );
    expect(back.toSnapshot()).toEqual(store.toSnapshot());
  });

  it('없는 id 는 버린다 — 데이터가 줄어도 판이 안 깨진다', () => {
    const back = CommissionStore.fromSnapshot({
      pending: [{ defId: 'gone', dueTick: 1, roll: 0.5 }],
    });
    expect(back.pending).toHaveLength(0);
  });

  it('`undefined` 스냅샷(옛 세이브)은 빈 큐다 — 마이그레이션이 없다', () => {
    expect(CommissionStore.fromSnapshot(undefined).pending).toEqual([]);
  });
});

describe('규칙 — 슬롯과 홍보 합성 (P4)', () => {
  it('동시 발주는 등급이 정한다', () => {
    expect(commissionSlots(1)).toBe(1);
    expect(commissionSlots(5)).toBe(3);
    // 5등급이 종착역이므로 상한도 거기서 멎는다
    expect(commissionSlots(9)).toBe(3);
  });

  it('같은 수배를 두 번 못 맡긴다', () => {
    const store = new CommissionStore();
    const rng = stream();
    expect(store.enqueue(supply, 0, rng)).not.toBeNull();
    expect(store.enqueue(supply, 0, rng)).toBeNull();
  });

  it('홍보는 배수로 **합성**된다 — `WeekOptions` 에 전용 필드가 안 생긴다', () => {
    const two = COMMISSIONS.filter((c) => c.category === 'publicity').slice(0, 2);
    const want = two.reduce((n, c) => n * (c.visitorMult ?? 1), 1);
    expect(commissionVisitorMult(two)).toBeCloseTo(want);
    expect(commissionVisitorMult([])).toBe(1);
  });

  it('남은 시간이 가까운 순으로 나온다 — 화면의 D-2 가 이 값이다', () => {
    const store = new CommissionStore();
    const rng = stream();
    const slow = COMMISSIONS.reduce((a, b) => (a.days >= b.days ? a : b));
    const fast = COMMISSIONS.reduce((a, b) => (a.days <= b.days ? a : b));
    store.enqueue(slow, 0, rng);
    store.enqueue(fast, 0, rng);
    const left = store.remaining(0);
    expect(left[0]?.def.id).toBe(fast.id);
    expect(commissionDef(left[0]!.def.id)).toBeDefined();
  });
});

describe('계약 정합 — 코드·데이터·문서가 같은 말을 한다 (P4)', () => {
  const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
  const bot = readFileSync(new URL('../../../tools/kairo-sim.ts', import.meta.url), 'utf8');

  it('홍보는 main·봇 **둘 다** modifiers 로 합성한다', () => {
    /*
     * ⚠ 한쪽만 넘기면 헤드리스와 실제 판이 갈라진다 — 이 저장소가 여러 번 겪은 사고다
     * (콤보의 `main.ts`·`kairo-sim.ts` 둘 다 검사와 같은 자리).
     */
    for (const [name, src] of [['main.ts', main], ['kairo-sim.ts', bot]] as const) {
      expect(src, name).toContain('commissionVisitorMult');
      expect(src, name).toMatch(/crowdMult \*= commissionVisitorMult\(/);
    }
  });

  it('전용 스트림을 main·봇이 **같은 salt** 로 fork 한다', () => {
    for (const [name, src] of [['main.ts', main], ['kairo-sim.ts', bot]] as const) {
      expect(src, name).toContain('COMMISSION_RNG_SALT');
      expect(src, name).toMatch(/fork\(COMMISSION_RNG_SALT\)/);
    }
  });

  it('`WeekOptions` 에 수배 전용 필드가 **0개**다 (불변식 3)', () => {
    const week = readFileSync(new URL('./week.ts', import.meta.url), 'utf8');
    const opts = week.slice(week.indexOf('interface WeekOptions'));
    const body = opts.slice(0, opts.indexOf('\n}'));
    for (const forbidden of ['commission', 'publicity', 'visitorMult']) {
      expect(body.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('시계는 **두 자리**에서 감긴다 — 하루 눈금과 주 눈금', () => {
    // ⚠ 하나만 부르면 주 안에서 끝나는 수배(2~7일)가 주 경계까지 밀린다
    expect((main.match(/^\s*advanceCommissions\(\);/gm) ?? []).length).toBe(2);
  });

  it('아침 배달은 하루 2건이고 넘치면 티커로 강등된다 (§8-10)', () => {
    expect(main).toContain('ARRIVALS_PER_DAY = 2');
    expect(main).toMatch(/arrivalsToday >= ARRIVALS_PER_DAY/);
    // ⚠ **버리지 않는다** — 소식이 사라지면 무슨 일이 있었는지 알 길이 없다
    expect(main).toMatch(/const spill = arrivalQueue\.shift\(\)/);
  });

  it('슬롯은 **데이터**가 정한다 (불변식 3)', () => {
    expect(COMMISSION_SLOTS.length).toBeGreaterThan(0);
    /*
     * ⚠ **주석은 뺀다** — 「예전엔 이랬다」를 못 적게 하는 규칙이 아니다
     * (`check-ui-surface.mjs` 의 하드코딩 hex 검사와 같은 자리). 규칙 안의 수식만 잡는다.
     */
    const src = readFileSync(new URL('./commission.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/Math\.floor\(\(grade/);
    expect(src).toContain('data.slotsByGrade');
  });
});

describe('구인은 수배를 지난다 (P6)', () => {
  const job = COMMISSIONS.find((c) => c.category === 'hire')!;

  it('RED ① 구인은 리드타임을 지난다 — 즉시 안 는다', () => {
    const store = new CommissionStore();
    const rng = stream();
    expect(store.enqueue(job, 0, rng)).not.toBeNull();
    // 마감 전에는 아무 일도 안 일어난다
    expect(store.advanceTo(job.days * TICKS_PER_DAY - 1, rng)).toHaveLength(0);
    const done = store.advanceTo(job.days * TICKS_PER_DAY, rng);
    expect(done).toHaveLength(1);
    expect(done[0]?.def.role).toBeDefined();
  });

  it('RED ② 실패는 **수수료만** 소진한다 — 전액을 잃으면 확률이 벌금이 된다', () => {
    /*
     * v4 「실패는 내 선택 때문이어야」. 규칙은 상수 하나이고, 그 값이 곧 계약이다.
     */
    expect(COMMISSION_FEE_SHARE).toBeGreaterThan(0);
    expect(COMMISSION_FEE_SHARE).toBeLessThan(1);
    const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/week\.earn\(Math\.round\(r\.def\.cost \* \(1 - COMMISSION_FEE_SHARE\)\)\)/);
  });

  it('RED ③ 해고는 즉시다 — 비대칭이 의도다', () => {
    /*
     * ⚠ 고정비를 줄이는 결정에 지연을 걸면 **비수기 감원이 벌**이 된다.
     * `+` 만 큐를 지나고 `−` 는 `staff.set` 이다.
     */
    const ui = readFileSync(new URL('../../ui/kairo-staff.ts', import.meta.url), 'utf8');
    expect(ui).toMatch(/minus\.addEventListener[\s\S]{0,120}manage\?\.fire\(/);
    expect(ui).toMatch(/plus\.addEventListener[\s\S]{0,120}manage\?\.hire\(/);
    const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/fire: \(role\) => \{[\s\S]{0,200}staff\.set\(/);
  });

  it('정적 — `staff.hire(` 는 수배 완료 처리와 폴백 밖에서 안 불린다', () => {
    /*
     * ⚠ 다른 데서 부르면 「기다린다」가 조용히 사라진다. `staff.set()` 은 남는다 —
     * 골든·하네스·마이그레이션이 직접 쓴다 (시그니처 불변).
     */
    const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const calls = [...main.matchAll(/staff\.hire\(/g)].length;
    // 완료 처리 1 + 폴백 2 (데이터가 비었을 때·역할이 없을 때)
    expect(calls).toBe(3);
  });
});

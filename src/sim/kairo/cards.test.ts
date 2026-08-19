import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import {
  CARDS,
  CardStore,
  validateCards,
  eligibleCards,
  isEligible,
  NEUTRAL_MODIFIERS,
  CARDS_PER_WEEK,
  CARD_RNG_SALT,
  triggerCard,
  MOD_CAPS,
  optionCash,
  optionCertainCash,
  optionEffect,
  type CardContext,
} from './cards.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';
import { admissionLimit, GRADES } from './progress.js';
import { accidentChance } from './risk.js';

/**
 * 주간 의사결정 카드 — **루프를 지탱하는 장치**라 회귀가 나면 게임이 스킵 버튼으로 돌아간다.
 */

const CTX: CardContext = { season: 'summer', week: 12, grade: 3 };

describe('카드 데이터', () => {
  it('주간 카드 24종 + 사건 카드 (스펙 §3.5 · §12.1)', () => {
    // 사건 카드(사고 대응)는 무작위로 안 뽑히므로 24 에 안 센다
    // K43: 계절 입고 카드 2종(설비 상인)이 늘었다 — 24 + 2
    expect(CARDS.filter((c) => !c.trigger).length).toBe(26);
    expect(CARDS.filter((c) => c.trigger === 'accident').length).toBe(1);
  });

  it('사건 카드는 무작위 뽑기에서 빠진다 — 사고가 안 났는데 사고 대응이 뜨면 안 된다', () => {
    const pool = eligibleCards({ season: 'summer', week: 40, grade: 5 }, new Set());
    expect(pool.some((c) => c.trigger)).toBe(false);
    expect(triggerCard('accident_response')).toBeDefined();
  });

  it('데이터 규칙을 지킨다', () => {
    expect(validateCards()).toEqual([]);
  });

  it('선택지가 전부 2~3개다 — 하나면 선택이 아니고 넷이면 폰에서 5초에 못 읽는다', () => {
    for (const c of CARDS) {
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeLessThanOrEqual(3);
    }
  });

  it('"아무것도 안 한다"만 있는 카드는 없다 — 그러면 고를 이유가 없다', () => {
    for (const c of CARDS) {
      const withEffect = c.options.filter((o) => o.effects.length > 0);
      expect(withEffect.length).toBeGreaterThan(0);
    }
  });

  it('폐쇄는 1주만이다 — 여러 주 폐쇄는 수익을 0 으로 만들어 판을 죽인다', () => {
    /*
     * 실측 사고의 회귀 검사. 방송 촬영 카드가 폐쇄와 평판을 한 객체에 담아 weeks:4 를
     * 걸었고, 4주 연속 폐쇄로 후반 수익 중앙값이 0 이 되어 16판 중 4판이 파산했다.
     */
    for (const c of CARDS) {
      for (const o of c.options) {
        for (const e of o.effects) {
          if (e.closed) expect(e.weeks ?? 1, `${c.id}`).toBe(1);
        }
      }
    }
  });

  it('돈을 쓰는 쪽이 항상 이득인 카드가 없다 — 그러면 카드가 아니라 청구서다', () => {
    /*
     * 판정은 **확정 지출**만 센다. 확률이 붙은 지출은 도박이고, "지금 확실히 낼래 /
     * 걸어볼래" 는 정당한 카드다 (`safety_check` 가 그 형태다) — 처음엔 이걸 구분하지
     * 않아 정상 카드가 실패로 나왔다.
     *
     * 지키려는 성질: **모든 선택지가 확정 지출이면 카드가 "얼마 낼래"가 되고 선택이 사라진다.**
     */
    const certainSpend = (o: (typeof CARDS)[number]['options'][number]): boolean =>
      optionCash(o) < 0 && o.chance === undefined;
    for (const c of CARDS) {
      if (!c.options.some(certainSpend)) continue;
      const alternatives = c.options.filter((o) => !certainSpend(o));
      expect(alternatives.length, `${c.id} — 모든 선택지가 확정 지출이다`).toBeGreaterThan(0);
    }
  });
});

describe('등장 조건', () => {
  it('계절 조건이 걸러진다 — 겨울에 폭염 카드가 나오면 안 된다', () => {
    const winter = eligibleCards({ season: 'winter', week: 20, grade: 3 }, new Set());
    expect(winter.some((c) => c.id === 'heatwave')).toBe(false);
    const summer = eligibleCards({ season: 'summer', week: 20, grade: 3 }, new Set());
    expect(summer.some((c) => c.id === 'heatwave')).toBe(true);
  });

  it('주차·등급 조건이 걸러진다 — 1주차에 방송 촬영이 오면 안 된다', () => {
    const early = { season: 'summer' as const, week: 1, grade: 1 };
    expect(CARDS.filter((c) => isEligible(c, early)).length).toBeLessThan(CARDS.length);
    const broadcast = CARDS.find((c) => c.id === 'broadcast')!; // 조건: 3등급 · 8주차
    expect(isEligible(broadcast, early)).toBe(false); // 둘 다 미달
    expect(isEligible(broadcast, { ...CTX, week: 5 })).toBe(false); // 주차 미달
    expect(isEligible(broadcast, { ...CTX, grade: 2 })).toBe(false); // 등급 미달
    expect(isEligible(broadcast, CTX)).toBe(true); // 12주차 · 3등급 — 둘 다 충족
  });

  it('1주차에도 뽑을 카드가 있다 — 없으면 첫 주가 조용해진다', () => {
    const first = eligibleCards({ season: 'summer', week: 1, grade: 1 }, new Set());
    expect(first.length).toBeGreaterThanOrEqual(3);
  });
});

describe('뽑기', () => {
  it('같은 시드는 같은 카드 순서를 낸다', () => {
    const seq = (): string[] => {
      const st = new CardStore();
      const rng = new Rng(999).fork(CARD_RNG_SALT);
      const out: string[] = [];
      for (let w = 1; w <= 20; w++) {
        for (const c of st.draw(rng, { season: 'summer', week: w, grade: 3 })) out.push(c.id);
        st.tickWeek();
      }
      return out;
    };
    expect(seq()).toEqual(seq());
  });

  it('여름은 주당 1~2장, 겨울은 0~1장', () => {
    for (const season of ['summer', 'winter'] as const) {
      const st = new CardStore();
      const rng = new Rng(7).fork(CARD_RNG_SALT);
      const counts: number[] = [];
      for (let w = 1; w <= 40; w++) {
        counts.push(st.draw(rng, { season, week: w, grade: 4 }).length);
        st.tickWeek();
      }
      const [lo, hi] = CARDS_PER_WEEK[season];
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...counts)).toBeLessThanOrEqual(hi);
    }
  });

  it('한 주 안에서 같은 카드가 두 번 나오지 않는다', () => {
    const st = new CardStore();
    const rng = new Rng(31).fork(CARD_RNG_SALT);
    for (let w = 1; w <= 30; w++) {
      const ids = st.draw(rng, { season: 'summer', week: w, grade: 4 }).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      st.tickWeek();
    }
  });

  it('풀이 소진될 때까지 안 겹친다 — 같은 카드가 연달아 나오면 안 읽고 누른다', () => {
    const st = new CardStore();
    const rng = new Rng(5).fork(CARD_RNG_SALT);
    const drawn: string[] = [];
    for (let w = 1; w <= 8; w++) {
      for (const c of st.draw(rng, { season: 'summer', week: w, grade: 4 })) drawn.push(c.id);
      st.tickWeek();
    }
    // 여름 조건을 만족하는 카드 수보다 적게 뽑았으면 전부 달라야 한다
    const poolSize = eligibleCards({ season: 'summer', week: 8, grade: 4 }, new Set()).length;
    if (drawn.length <= poolSize) expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('풀이 소진되면 비우고 다시 뽑는다 — 카드가 끊기면 루프가 멈춘다', () => {
    const st = new CardStore();
    const rng = new Rng(11).fork(CARD_RNG_SALT);
    let total = 0;
    for (let w = 1; w <= 60; w++) {
      total += st.draw(rng, { season: 'summer', week: w, grade: 5 }).length;
      st.tickWeek();
    }
    expect(total).toBeGreaterThan(CARDS.length); // 24종보다 많이 뽑혔다 = 재사용됐다
  });
});

describe('효과', () => {
  it('아무 선택도 안 했으면 중립이다', () => {
    expect(new CardStore().modifiers()).toEqual(NEUTRAL_MODIFIERS);
  });

  it('즉시 현금은 호출자에게 돌려준다 — 지갑은 시뮬이 아니라 러너가 소유한다', () => {
    const st = new CardStore();
    const card = CARDS.find((c) => c.id === 'heatwave')!;
    const r = st.choose(new Rng(1), card, 0);
    expect(r.cash).toBe(-800_000);
  });

  it('지속 효과가 주 수만큼만 남는다', () => {
    const st = new CardStore();
    const card = CARDS.find((c) => c.id === 'water_quality')!;
    st.choose(new Rng(2), card, 1); // 방치 — 만족 −8, 3주
    expect(st.modifiers().satisfactionDelta).toBe(-8);
    st.tickWeek();
    expect(st.modifiers().satisfactionDelta).toBe(-8);
    st.tickWeek();
    expect(st.modifiers().satisfactionDelta).toBe(-8);
    st.tickWeek();
    expect(st.modifiers().satisfactionDelta).toBe(0);
    expect(st.active.length).toBe(0);
  });

  it('곱은 곱하고 델타는 더한다 — 두 카드가 겹칠 수 있다', () => {
    const st = new CardStore();
    st.choose(new Rng(3), CARDS.find((c) => c.id === 'festival')!, 0); // arrival ×1.5
    st.choose(new Rng(4), CARDS.find((c) => c.id === 'ota_commission')!, 0); // arrival ×1.25
    expect(st.modifiers().arrivalMult).toBeCloseTo(1.875, 5);
  });

  it('확률 효과는 선택 시점에 굴린다 — 결산에서야 알면 선택한 느낌이 안 난다', () => {
    const card = CARDS.find((c) => c.id === 'typhoon')!;
    let happened = 0;
    for (let s = 0; s < 200; s++) {
      const st = new CardStore();
      if (st.choose(new Rng(s), card, 1).happened) happened++;
    }
    // 45% 확률 — 200회면 여유 있게 범위 안이어야 한다
    expect(happened).toBeGreaterThan(60);
    expect(happened).toBeLessThan(140);
  });

  it('스냅샷을 왕복해도 남은 주 수가 같다', () => {
    const st = new CardStore();
    st.choose(new Rng(5), CARDS.find((c) => c.id === 'equipment_aging')!, 1);
    st.tickWeek();
    const back = CardStore.fromSnapshot(JSON.parse(JSON.stringify(st.toSnapshot())));
    expect(back.modifiers()).toEqual(st.modifiers());
    expect(back.active[0]?.remaining).toBe(st.active[0]?.remaining);
    expect(back.seenCount).toBe(st.seenCount);
  });
});

describe('주 진행에 실제로 영향을 준다', () => {
  const run = (mods: Partial<ReturnType<CardStore['modifiers']>>): ReturnType<WeekRunner['run']> => {
    const t = new KairoTerrain(40, 32);
    for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
    const w = new WallGrid(40, 32);
    const p = new PlacementGrid(40, 32);
    for (let k = 0; k < 6; k++) p.place(t, w, { i: 2, j: 2 }, 'shop', 6 + k * 3, 8);
    // 카드 효과만 변수로 둔다 — 입장 수속은 `admission.test.ts` 가 본다
    const g = new GuestStore(t, w, p, { i: 2, j: 2 }, OPEN_GATE_DEFAULTS);
    g.invalidate();
    return new WeekRunner(t, p, g).run(new Rng(808), {
      season: 'summer',
      modifiers: { ...NEUTRAL_MODIFIERS, ...mods },
    });
  };

  it('폐쇄면 손님이 0 이다', () => {
    expect(run({ closed: true }).arrivals).toBe(0);
  });

  it('방문객 배율이 도착 수를 바꾼다', () => {
    expect(run({ arrivalMult: 1.5 }).arrivals).toBeGreaterThan(run({}).arrivals);
    expect(run({ arrivalMult: 0.5 }).arrivals).toBeLessThan(run({}).arrivals);
  });

  it('매출 배율이 수익을 바꾸고 일별 합계와 어긋나지 않는다', () => {
    const r = run({ revenueMult: 1.15 });
    const base = run({});
    expect(r.revenue).toBeGreaterThan(base.revenue);
    const daySum = r.days.reduce((a, d) => a + d.revenue, 0);
    expect(Math.abs(daySum - r.revenue)).toBeLessThanOrEqual(r.days.length);
  });

  it('만족도 델타가 퇴장 만족도를 움직인다', () => {
    const base = run({});
    expect(run({ satisfactionDelta: -10 }).exitSatisfaction).toBeLessThan(base.exitSatisfaction);
    expect(run({ satisfactionDelta: 10 }).exitSatisfaction).toBeGreaterThan(base.exitSatisfaction);
  });

  it('만족도가 0~100 을 벗어나지 않는다', () => {
    expect(run({ satisfactionDelta: -999 }).exitSatisfaction).toBe(0);
    expect(run({ satisfactionDelta: 999 }).exitSatisfaction).toBe(100);
  });
});

describe('혼잡·사고 배율이 실제로 연결돼 있다', () => {
  it('혼잡 배율이 입장 상한을 올린다 — 없으면 카드 문구가 거짓말이 된다', () => {
    const grade = GRADES[2] as (typeof GRADES)[number];
    const base = admissionLimit(grade, 200);
    expect(admissionLimit(grade, 200, 1.35)).toBeGreaterThan(base);
    expect(admissionLimit(grade, 200, 1.35)).toBe(Math.round(base * 1.35));
  });

  it('사고 배율이 위험 단계에서만 작동한다 — 안전한데 사고가 나면 RNG 세금이다', () => {
    const safe = {
      level: 'safe' as const,
      ratio: 0.1,
      riskPoints: 1,
      safetyPoints: 9,
      safetyNeeded: 0,
      accidentPossible: false,
    };
    expect(accidentChance(safe, 3)).toBe(0);
    const danger = { ...safe, level: 'danger' as const, ratio: 0.9, accidentPossible: true };
    expect(accidentChance(danger, 1.6)).toBeGreaterThan(accidentChance(danger, 1));
    expect(accidentChance(danger, 0.4)).toBeLessThan(accidentChance(danger, 1));
    // 상한이 있어야 한다 — 배율이 곱해져 100% 가 되면 카드가 사망 선고가 된다
    expect(accidentChance(danger, 999)).toBeLessThanOrEqual(0.2);
  });
});

describe('누적 상한 — 카드가 게임을 나선으로 밀 수 없다', () => {
  it('음수 만족도 카드를 여러 장 겹쳐도 상한을 넘지 않는다', () => {
    const st = new CardStore();
    // 만족도를 깎는 선택지를 있는 대로 겹친다
    let stacked = 0;
    for (const c of CARDS) {
      for (let oi = 0; oi < c.options.length; oi++) {
        const opt = c.options[oi];
        const d = opt ? (optionEffect(opt, 'satisfactionDelta') ?? 0) : 0;
        if (d < 0) {
          st.choose(new Rng(oi + 1), c, oi);
          stacked += 1;
        }
      }
    }
    expect(stacked).toBeGreaterThan(3); // 실제로 겹쳤는지 확인 — 안 겹쳤으면 검사가 무의미하다
    expect(st.modifiers().satisfactionDelta).toBe(-MOD_CAPS.satisfaction);
  });

  it('방문객·매출 배율도 양쪽으로 묶인다', () => {
    const st = new CardStore();
    for (const c of CARDS) {
      for (let oi = 0; oi < c.options.length; oi++) {
        const opt = c.options[oi];
        if (opt && (optionEffect(opt, 'arrivalMult') ?? 1) < 1) st.choose(new Rng(oi + 9), c, oi);
      }
    }
    const m = st.modifiers();
    expect(m.arrivalMult).toBeGreaterThanOrEqual(MOD_CAPS.arrivalMin);
    expect(m.revenueMult).toBeGreaterThanOrEqual(MOD_CAPS.revenueMin);
    expect(m.revenueMult).toBeLessThanOrEqual(MOD_CAPS.revenueMax);
  });

  it('상한은 만료로 풀린다 — 영구히 묶여 있으면 카드가 무의미해진다', () => {
    const st = new CardStore();
    const c = CARDS.find((x) => x.id === 'water_quality')!;
    st.choose(new Rng(1), c, 1); // 만족 −8, 3주
    expect(st.modifiers().satisfactionDelta).toBe(-8);
    for (let k = 0; k < 3; k++) st.tickWeek();
    expect(st.modifiers().satisfactionDelta).toBe(0);
  });
});

/**
 * 카드는 **모달**이다 (K37) — 열려 있으면 다른 패널이 안 열린다. 선택하지 않으면 주가
 * 안 넘어가는 것이 카드의 존재 이유인데, 다른 패널이 밀어내면 선택을 조용히 건너뛴다.
 *
 * ⚠ 그 규칙은 **"항상 고를 수 있는 선택지가 있다"에 기대고 있다.** UI 는 현금이 모자란
 * 선택지를 비활성으로 만드는데(`kairo-card.ts` 의 `tooPoor`), 어떤 카드의 선택지가 **전부**
 * 돈이 드는데 현금이 0 이면 **아무것도 고를 수 없고 메뉴도 안 열린다** — 판이 잠긴다.
 *
 * 그래서 그 성질을 데이터에서 못 박는다. 새 카드를 추가할 때 이 검사가 잠금을 막는다.
 */
describe('카드는 판을 잠그지 않는다 — 모달의 전제', () => {
  it('★ 어떤 현금 상태에서도 고를 수 있는 선택지가 있다', () => {
    /*
     * UI 는 `optionCertainCash` 로 "살 수 있나"를 판정한다 (K37). 확률에 걸린 선택지는
     * 확정 지출이 0 이므로 언제나 고를 수 있다 — 현금 0 으로 재는 것이 최악의 경우다.
     */
    const locked = CARDS.filter((c) =>
      c.options.every((o) => optionCertainCash(o) < 0),
    ).map((c) => c.id);
    expect(locked).toEqual([]);
  });

  it('★ 음성 대조군 — 확정 지출로만 재면 두 카드가 잠긴다', () => {
    /*
     * 이것이 고치기 전 상태다. `optionCash` 로 재면 `safety_check`("무시한다"는 35% 로
     * 과태료 120만)와 `typhoon`("그대로 둔다"는 45% 로 복구비 150만)이 현금 부족일 때
     * **두 선택지 모두 비활성**이 되고, 카드는 모달이라 메뉴도 안 열려 판이 잠긴다.
     *
     * 이 검사가 실패로 바뀌면 그 카드들이 고쳐졌다는 뜻이니 이 대조군을 지워도 된다.
     */
    const byRaw = CARDS.filter((c) => c.options.every((o) => optionCash(o) < 0)).map((c) => c.id);
    expect(byRaw).toEqual(['safety_check', 'typhoon']);
  });

  it('확률에 걸린 선택지는 확정 지출이 0 이다 — 도박은 언제나 가능하다', () => {
    const card = CARDS.find((c) => c.id === 'safety_check')!;
    const gamble = card.options.find((o) => o.chance !== undefined)!;
    expect(optionCash(gamble)).toBeLessThan(0); // 액수는 그대로 표시한다
    expect(optionCertainCash(gamble)).toBe(0); // 하지만 지금 내는 돈은 아니다
  });
});

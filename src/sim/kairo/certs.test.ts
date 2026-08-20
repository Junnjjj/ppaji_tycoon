/**
 * 사이드 인증 (P3-E) — **상한을 푸는 변경이라 검사가 곧 안전장치다.**
 *
 * 순서는 저장소 규칙 그대로 "위반 주입이 먼저"다. 각 ★ 항목에 음성 대조군을 붙였고,
 * 대조군이 실제로 잡히는 것을 확인한 뒤 실데이터를 통과시켰다.
 *
 * 특히 두 가지를 못박는다:
 *   ① **정원 가산이 실제로 입장을 늘린다** — 이걸 안 재면 인증은 "지을 이유"만 주고
 *      "지어도 안 는다"는 뿌리(제안서 §1.8)가 그대로 남는다
 *   ② **조건 평가기가 하나다** — 의뢰·심사·인증이 갈라지면 "의뢰로는 3개인데
 *      인증으로는 2개"가 된다 (이 저장소가 겪은 사고의 형태)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, allFacilityDefs, FACILITY_MAX_LEVEL } from './placement.js';
import {
  GRADES,
  admissionLimit,
  evaluateCondition,
  questStatuses,
  supplyOf,
  requiredGrade,
  CONTEXT_CONDITION_KINDS,
  QUESTS,
  type QuestCondition,
  type QuestConditionKind,
} from './progress.js';
import { evaluateCombos } from './combos.js';
import {
  CERTS,
  CERT_CAPACITY_TOTAL,
  CertStore,
  certStatuses,
  effectiveGrade,
  type CertContext,
} from './certs.js';

const GATE = { i: 0, j: 0 };
const CTX0: CertContext = { zones: [], courses: 0, questsDone: 0 };

function flat(size = 40): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'path_stone');
  return { t, w: new WallGrid(size, size), p: new PlacementGrid(size, size) };
}

/** 같은 종류를 n 채 놓는다 — needSupply 조건은 종류가 아니라 **채수**를 센다 */
function placeMany(
  b: ReturnType<typeof flat>,
  defId: string,
  n: number,
  row = 2,
): number {
  let placed = 0;
  const def = allFacilityDefs().find((d) => d.id === defId);
  const stepI = (def?.size[0] ?? 1) + 1;
  const stepJ = (def?.size[1] ?? 1) + 1;
  for (let k = 0; k < n * 4 && placed < n; k++) {
    const i = 1 + (k % 12) * stepI;
    const j = row + Math.floor(k / 12) * stepJ;
    if (b.p.place(b.t, b.w, GATE, defId, i, j).ok) placed++;
  }
  return placed;
}

describe('인증 데이터 (P3-E)', () => {
  it('12종이고 ID 가 유일하다', () => {
    expect(CERTS).toHaveLength(12);
    expect(new Set(CERTS.map((c) => c.id)).size).toBe(12);
  });

  it('전부 조건 2개 이상과 정원 가산을 갖는다 — 조건 하나면 의뢰와 구별이 안 된다', () => {
    for (const c of CERTS) {
      expect(c.conditions.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.reward.capacity ?? 0, c.id).toBeGreaterThan(0);
      expect(c.desc.length, c.id).toBeGreaterThan(4);
    }
  });

  it('정원 가산 합이 70 이다 — 5등급 230 → 300 (폰 성능 예산의 상한)', () => {
    expect(CERT_CAPACITY_TOTAL).toBe(70);
    const g5 = GRADES[GRADES.length - 1]!;
    expect(g5.maxGuests + CERT_CAPACITY_TOTAL).toBe(300);
  });

  it('보상에 시설이 없다 — 시설 75종은 이미 출처가 정확히 하나씩이다', () => {
    for (const c of CERTS) {
      expect(Object.keys(c.reward).every((k) => ['capacity', 'permitArea', 'cash'].includes(k)))
        .toBe(true);
    }
  });

  it('참조하는 수요·시설이 존재한다', () => {
    const needs = new Set(
      allFacilityDefs().map((d) => (d as unknown as { need?: string }).need),
    );
    const ids = new Set(allFacilityDefs().map((d) => d.id));
    for (const c of CERTS) {
      for (const q of c.conditions) {
        if (q.need !== undefined) expect(needs.has(q.need), `${c.id}/${q.need}`).toBe(true);
        if (q.facility !== undefined) expect(ids.has(q.facility), `${c.id}/${q.facility}`).toBe(true);
      }
    }
  });
});

/**
 * ★ 인증 조건이 충족되면 획득된다 · 하나만 모자라도 안 된다.
 *
 * AND 이지 부분 점수가 아니다 — 심사(응시·부분 점수)와 인증(자동·전부 충족)의 차이가
 * 여기서 갈린다. 부분 점수를 여기 들이면 "거의 다 했으니 정원 +7" 이 되어 상한이
 * 조건 없이 풀린다.
 */
describe('★ 인증 획득 판정 (P3-E)', () => {
  /*
   * `cert_food` 로 잰다 — 먹거리 6개 + 한 주 손익 300만.
   * ⚠ `cert_hygiene` 을 안 쓴 이유: 위생 6종은 **전부 실내**라 (P3-A 실측) 검사가
   * 방을 짓는 스크립트가 된다. 그때 재는 것은 인증 판정이 아니다.
   */
  const cert = CERTS.find((c) => c.id === 'cert_food')!;
  /** 문턱은 **데이터에서 읽는다** — 검사에 숫자를 박으면 밸런싱 한 번에 같이 깨진다 */
  const needFood = cert.conditions.find((c) => c.kind === 'needSupply')!.value;
  const needProfit = cert.conditions.find((c) => c.kind === 'weekProfit')!.value;

  /** 먹거리 N채를 놓고 그 주 손익이 P 인 판 */
  const board = (food: number, profit: number) => {
    const b = flat();
    expect(placeMany(b, 'vending_out', food)).toBe(food);
    return {
      p: b.p,
      report: { visitors: 100, turnedAway: 0, profit, exitSatisfaction: 75 },
    };
  };

  it('조건 둘이 다 차면 딴다', () => {
    const { p, report } = board(needFood, needProfit);
    const st = certStatuses(p, report, CTX0).find((s) => s.id === cert.id)!;
    expect(st.done).toBe(true);
    const store = new CertStore();
    expect(store.claim(certStatuses(p, report, CTX0)).ids).toContain(cert.id);
    expect(store.bonus().capacity).toBe(cert.reward.capacity);
  });

  it('⚠ 음성 대조군 — 조건 하나가 모자라면 안 딴다', () => {
    for (const [food, profit, why] of [
      [needFood - 1, needProfit, '먹거리 한 채 모자람'],
      [needFood, needProfit - 1, '손익 1원 모자람'],
    ] as const) {
      const { p, report } = board(food, profit);
      const st = certStatuses(p, report, CTX0).find((s) => s.id === cert.id)!;
      expect(st.done, why).toBe(false);
      expect(st.remaining, why).toBe(1);
      expect(new CertStore().claim(certStatuses(p, report, CTX0)).ids, why).not.toContain(cert.id);
    }
  });

  it('한 번 딴 것은 다시 안 준다 — 반복 지급이면 무한 정원이다', () => {
    const { p, report } = board(needFood, needProfit);
    const store = new CertStore();
    expect(store.claim(certStatuses(p, report, CTX0)).ids).toContain(cert.id);
    expect(store.claim(certStatuses(p, report, CTX0)).ids).not.toContain(cert.id);
    expect(store.bonus().capacity).toBe(cert.reward.capacity);
  });

  it('문맥 조건(코스·수영 면적·의뢰 완주)이 문맥을 실제로 읽는다', () => {
    const b = flat();
    const zones = [
      { kind: 'pool' as const, tiles: new Array(45).fill({ x: 0, y: 0 }), entries: [], area: 45 },
    ];
    const ev = (c: QuestCondition, ctx: CertContext) =>
      evaluateCondition(c, b.p, null, supplyOf(b.p), evaluateCombos(b.p, undefined, []), {
        zones: ctx.zones,
        courses: ctx.courses,
        questsDone: ctx.questsDone,
      });
    expect(ev({ kind: 'swimAreaMax', value: 40 }, { ...CTX0, zones }).done).toBe(true);
    expect(ev({ kind: 'swimAreaMax', value: 40 }, CTX0).done).toBe(false);
    expect(ev({ kind: 'courseCount', value: 3 }, { ...CTX0, courses: 3 }).done).toBe(true);
    expect(ev({ kind: 'courseCount', value: 3 }, CTX0).done).toBe(false);
    expect(ev({ kind: 'questsDone', value: 14 }, { ...CTX0, questsDone: 14 }).done).toBe(true);
    expect(ev({ kind: 'questsDone', value: 14 }, CTX0).done).toBe(false);
  });

  it('개선 단계·시설 종류 수도 조건이 된다 — 후반의 다른 축이어야 한다', () => {
    const b = flat();
    expect(placeMany(b, 'vending_out', 2)).toBe(2);
    const c: QuestCondition = { kind: 'avgFacilityLevel', value: 2 };
    const ev = () =>
      evaluateCondition(c, b.p, null, supplyOf(b.p), evaluateCombos(b.p, undefined, []));
    expect(ev().done).toBe(false);
    for (const it of b.p.all()) {
      while (b.p.levelOf(it.handle) < FACILITY_MAX_LEVEL) b.p.upgrade(it.handle);
    }
    expect(ev().done).toBe(true);

    const kinds: QuestCondition = { kind: 'facilityKinds', value: 2 };
    const evK = () =>
      evaluateCondition(kinds, b.p, null, supplyOf(b.p), evaluateCombos(b.p, undefined, []));
    expect(evK().cur).toBe(1);
    placeMany(b, 'pingpong', 1, 20);
    expect(evK().cur).toBe(2);
    expect(evK().done).toBe(true);
  });
});

/**
 * ★★ **정원 가산이 실제로 입장을 늘린다.**
 *
 * 이 파일에서 가장 중요한 검사다. 인증이 상한을 안 풀면 나머지는 전부 장식이다
 * (제안서 §1.8: 모든 성장 축이 `공급` 으로 합류해 `min(등급, 공급×1.5)` 에서 잘린다).
 */
describe('★★ 정원 가산이 입장을 늘린다 (P3-E)', () => {
  const g5 = GRADES[GRADES.length - 1]!;
  /** 공급이 충분한 상태 — 그래야 **등급 쪽이 병목**이고 가산이 보인다 */
  const supply = 400;

  it('같은 공급·같은 등급에서 인증 유무로 입장이 갈린다', () => {
    const bare = admissionLimit(g5, supply);
    const withCerts = admissionLimit(
      effectiveGrade(g5, { capacity: CERT_CAPACITY_TOTAL, permitArea: 0 }),
      supply,
    );
    expect(bare).toBe(g5.maxGuests);
    expect(withCerts).toBe(g5.maxGuests + CERT_CAPACITY_TOTAL);
    expect(withCerts).toBeGreaterThan(bare);
  });

  it('⚠ 음성 대조군 — 가산을 0 으로 두면 예전과 **완전히** 같다', () => {
    for (const g of GRADES) {
      for (const s of [1, 10, 50, 120, 400, 5000]) {
        expect(admissionLimit(effectiveGrade(g, { capacity: 0, permitArea: 0 }), s)).toBe(
          admissionLimit(g, s),
        );
      }
    }
    // 가산 0 이면 등급 정의 **그 객체**를 돌려준다 — 사본이 돌아다니지 않는다
    expect(effectiveGrade(g5, { capacity: 0, permitArea: 0 })).toBe(g5);
  });

  it('공급이 모자라면 가산이 아무 일도 안 한다 — 지어야 는다', () => {
    const low = 20; // 공급×1.5 = 30 < 230
    expect(admissionLimit(effectiveGrade(g5, { capacity: 70, permitArea: 0 }), low)).toBe(
      admissionLimit(g5, low),
    );
  });

  it('인증은 등급이 아니다 — 번호·문턱·토지·수요 배율을 안 건드린다', () => {
    const e = effectiveGrade(g5, { capacity: 70, permitArea: 150 });
    expect(e.grade).toBe(g5.grade);
    expect(e.name).toBe(g5.name);
    expect(e.reqExitSatisfaction).toBe(g5.reqExitSatisfaction);
    expect(e.landW).toBe(g5.landW);
    expect(e.landH).toBe(g5.landH);
    expect(e.reputationPull).toBe(g5.reputationPull);
    expect(e.examReqs).toEqual(g5.examReqs);
    // 바뀌는 것은 정확히 둘이다
    expect(e.maxGuests).toBe(g5.maxGuests + 70);
    expect(e.permitArea).toBe(g5.permitArea + 150);
  });
});

/**
 * ★ 조건 평가기가 하나다.
 *
 * 의뢰(`questStatuses`)·심사(`exam.judge`)·인증(`certStatuses`)이 같은 조건에 대해
 * **같은 값**을 내야 한다. 갈라지면 화면마다 다른 숫자를 말한다.
 */
describe('★ 인증·의뢰·심사가 같은 조건 평가기를 쓴다 (P3-E)', () => {
  it('같은 판·같은 조건이면 의뢰와 인증이 같은 detail 을 낸다', () => {
    const b = flat();
    expect(placeMany(b, 'vending_out', 3)).toBe(3);
    const report = { visitors: 40, turnedAway: 0, profit: 500_000, exitSatisfaction: 62 };
    // 의뢰 `food_stall`(먹거리 2) 과 인증 `cert_food`(먹거리 6) 의 첫 조건은 같은 축이다
    const quest = questStatuses(b.p, report).find((q) => q.id === 'food_stall')!;
    const direct = evaluateCondition(
      { kind: 'needSupply', need: 'food', value: 2 },
      b.p,
      report,
      supplyOf(b.p),
      evaluateCombos(b.p, undefined, []),
    );
    const cert = certStatuses(b.p, report, CTX0).find((c) => c.id === 'cert_food')!;
    expect(quest.detail).toBe(direct.detail);
    // 셋 다 같은 함수에서 나온 **같은 현재값** 3 을 말한다 (목표만 2 와 6 으로 다르다)
    expect(quest.detail).toBe('3 / 2개');
    expect(cert.reqs[0]!.detail).toBe('3 / 6개');
  });

  it('★ 인증 코드가 조건을 스스로 재구현하지 않는다 (소스 검사)', () => {
    const src = readFileSync(new URL('./certs.ts', import.meta.url), 'utf8');
    expect(src.includes('evaluateCondition(')).toBe(true);
    // 평가기 사본의 서명 — kind 별 switch 를 여기서 다시 쓰면 갈라진다
    expect(src.includes("case 'needSupply'")).toBe(false);
  });
});

/**
 * ★ 도달 가능성 — 인증 조건이 **골격 + 이벤트 해금만으로** 충족 가능하다 (순환 금지).
 *
 * `unlock-graph.test.ts`("의뢰 조건은 골격만으로")·`exam.test.ts` 와 같은 계열이다.
 * 인증은 보상이 정원·허가·현금뿐이라 **구조적으로** 순환이 없지만, 나중에 시설 보상을
 * 넣고 싶어질 때 이 검사가 먼저 빨간불이 되어야 한다.
 */
describe('★ 인증 도달 가능성 (P3-E)', () => {
  /** 어떤 need 를 여는 시설이 골격(등급)에 몇 종 있나 — 채수는 반복 배치로 늘릴 수 있다 */
  const skeletonKinds = new Map<string, number>();
  for (const d of allFacilityDefs()) {
    const need = (d as unknown as { need?: string }).need;
    if (need === undefined || requiredGrade(d.id) > 5) continue;
    skeletonKinds.set(need, (skeletonKinds.get(need) ?? 0) + 1);
  }

  function validate(certs: readonly (typeof CERTS)[number][]): string[] {
    const issues: string[] = [];
    for (const c of certs) {
      for (const q of c.conditions) {
        if (q.kind === 'needSupply' && q.need !== undefined) {
          if ((skeletonKinds.get(q.need) ?? 0) < 1) {
            issues.push(`교착: ${c.id} 의 ${q.need} 를 여는 골격 시설이 없다`);
          }
        }
        if (q.kind === 'facilityCount' && q.facility !== undefined) {
          if (requiredGrade(q.facility) > 5) issues.push(`교착: ${c.id} 의 ${q.facility}`);
        }
      }
      // 보상이 조건의 재료가 되면 순환이다 — 지금은 정원·허가·현금뿐이라 구조적으로 없다
      const r = c.reward as Record<string, unknown>;
      if ('facility' in r) issues.push(`순환 위험: ${c.id} 이 시설을 보상한다`);
    }
    return issues;
  }

  it('실데이터에 교착·순환이 없다', () => {
    expect(validate(CERTS)).toEqual([]);
  });

  it('⚠ 음성 대조군 — 위반을 주입하면 잡힌다', () => {
    const broken = [
      { ...CERTS[0]!, conditions: [{ kind: 'facilityCount' as const, facility: 'nope', value: 1 }] },
      { ...CERTS[1]!, reward: { capacity: 1, facility: 'toilet' } as never },
    ];
    const issues = validate(broken);
    expect(issues.some((x) => x.includes('nope'))).toBe(true);
    expect(issues.some((x) => x.includes('순환'))).toBe(true);
  });
});

/**
 * ★ 문맥이 필요한 조건은 **인증 데이터에만** 있다.
 *
 * 의뢰(`questStatuses`)와 심사(`exam.judge`)는 `ConditionContext` 를 안 넘긴다 —
 * 거기에 `courseCount` 를 적으면 조용히 0 이 되어 **영원히 미달인 의뢰**가 된다.
 * 조용한 실패라 실행으로는 안 잡힌다. 그래서 데이터를 정적으로 본다.
 */
describe('★ 문맥 조건은 인증 전용이다 (P3-E)', () => {
  const contextKinds = new Set<QuestConditionKind>(CONTEXT_CONDITION_KINDS);

  function scan(conds: readonly { kind: string }[], where: string): string[] {
    return conds
      .filter((c) => contextKinds.has(c.kind as QuestConditionKind))
      .map((c) => `${where}: ${c.kind}`);
  }

  it('의뢰·심사 조건에 문맥 kind 가 없다', () => {
    const bad = [
      ...QUESTS.flatMap((q) => scan([q.condition], `의뢰 ${q.id}`)),
      ...GRADES.flatMap((g) => scan(g.examReqs ?? [], `심사 ${g.grade}등급`)),
    ];
    expect(bad).toEqual([]);
  });

  it('⚠ 음성 대조군 — 의뢰에 문맥 kind 를 넣으면 잡힌다', () => {
    expect(scan([{ kind: 'courseCount' }], '의뢰 x')).toHaveLength(1);
  });

  it('문맥 목록이 실제로 문맥을 쓰는 kind 와 일치한다', () => {
    // 인증이 쓰는 문맥 kind 는 전부 목록에 있어야 한다 (빠지면 정적 검사가 헛돈다)
    for (const c of CERTS) {
      for (const q of c.conditions) {
        if (['swimAreaMax', 'courseCount', 'questsDone'].includes(q.kind)) {
          expect(contextKinds.has(q.kind), q.kind).toBe(true);
        }
      }
    }
  });
});

/**
 * ★ 가산의 **정본이 하나다** — 게임과 봇이 같은 함수를 부른다.
 *
 * `week.test.ts` 가 `comboEffect(` 를 두 파일에서 찾는 것과 같은 계열의 정적 검사다.
 * 한쪽만 감싸면 화면은 300 을 말하는데 시뮬은 230 으로 돈다 (또는 그 반대로, 봇이
 * 상한을 모른 채 "이미 꽉 찼다"고 판단해 헤드리스가 다른 세계를 잰다).
 */
describe('★ 정원 가산의 정본이 하나다 (P3-E)', () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('main.ts 와 kairo-sim.ts 가 둘 다 effectiveGrade 를 부른다', () => {
    for (const p of ['../../main.ts', '../../../tools/kairo-sim.ts']) {
      expect(read(p).includes('effectiveGrade('), p).toBe(true);
    }
  });

  it('⚠ 봇이 등급 천장을 직접 읽지 않는다 — 정본에게 묻는다', () => {
    const bot = read('../../../tools/kairo-sim.ts');
    // 상한 판정은 admissionLimit 이 만든 ceiling 을 쓴다
    expect(bot.includes('const ceilingNow = admissionLimit(')).toBe(true);
    expect(bot.includes('ceilingNow * 1.3')).toBe(true);
    // 옛 형태(등급 정의의 maxGuests 를 직접 곱하기)가 남아 있으면 안 된다
    expect(/\.maxGuests \* 1\.3/.test(bot)).toBe(false);
  });
});

/**
 * 수배 작업 큐 (P4) — **「샀다 → 기다린다 → 회수한다」의 본체.**
 *
 * ## ⚠ 용어 — 한글 "의뢰"는 이미 다른 것이다
 *
 * `QuestDef`(`kairo-quests.json`)가 **의뢰**다 — 조건을 채우면 보상이 오는 것.
 * 여기 있는 것은 **수배**다 — 돈을 내고 **기다리면** 결과가 오는 것. 두 축은 목적이 다르고
 * (조건 vs 돈+시간) 화면도 다르다. 이름을 섞으면 다음 사람이 반드시 잘못 잇는다.
 *
 * ## 빠져 있던 사분면
 *
 * | | 즉시 끝난다 | 시간이 걸린다 |
 * |---|---|---|
 * | 게임이 내민다 | 주간 카드 27종 | — |
 * | **내가 고른다** | 가격·직원·개선·건설·코스·구입 | **여기** |
 *
 * 산 것도, 기다린 것도, 회수한 것도 없었다. 그것이 「운영이 뭘 할지 명확하지 않다」의 뿌리다.
 *
 * ## 결정론 — 이 파일이 가장 위험한 자리다
 *
 * 수배는 **주 중간에** 뽑기를 한다. 주 루프의 rng 를 같이 쓰면 수배 하나가 날씨 시퀀스를
 * 통째로 민다 (K36-B③ 에서 사고 판정이 정확히 그랬다). 그래서:
 *
 * · **전용 스트림**(`COMMISSION_RNG_SALT`)을 쓴다 — main 과 봇이 **같은 자리**에서 fork 한다
 * · **발주 시 roll 을 무조건 한 번** 한다 (`chance` 가 1 이어도) — 안 그러면 항목의 성질이
 *   뽑기 횟수를 바꿔 시퀀스가 갈린다
 * · **완료 판정은 결과와 무관하게 정확히 2뽑기** — 성공/실패로 횟수가 갈리면 같은 이유로 밀린다
 *
 * ## 효과는 due tick 에, 연출은 아침에
 *
 * `arrivalQueue` 는 **저장하지 않는다** (K47-①). 그러니 효과까지 아침에 주면 리로드 한 번에
 * 2주짜리 수배가 증발한다. 효과는 `advanceTo` 가 due tick 에서 확정하고, 연출만 큐로 간다.
 */
import raw from '../../data/kairo-commissions.json' with { type: 'json' };
import type { Rng } from '../rng.js';
import { TICKS_PER_DAY } from './week.js';

/** 전용 스트림 salt — main·봇이 **같은 값**으로 fork 한다 (갈라지면 두 세계가 된다) */
export const COMMISSION_RNG_SALT = 0xc0f5;

/**
 * 실패했을 때 **안 돌려주는 몫** (P6). 나머지는 전액 환불한다.
 *
 * ⚠ 전액을 잃으면 확률이 곧 **벌금**이 되고, 그건 v4 가 안 하기로 한 것이다
 * (「실패는 내 선택 때문이어야」). 수수료만 소진하면 실패는 **시간의 손해**로 남는다 —
 * 그게 이 축이 파는 것이기도 하다.
 */
export const COMMISSION_FEE_SHARE = 0.3;

export type CommissionCategory = 'supply' | 'publicity' | 'special' | 'hire';

export interface CommissionDef {
  id: string;
  category: CommissionCategory;
  name: string;
  desc: string;
  cost: number;
  /**
   * 리드타임(일). ⚠ **반드시 2 이상이다** — 0~1 이면 그건 구입이다 (D2 의 기계적 강제).
   * `validateCommissionData` 가 잡는다.
   */
  days: number;
  /** 성공 확률 (0~1). 1 이어도 **뽑기는 한다** — 횟수가 성질에 안 끌려가야 한다 */
  chance: number;
  minGrade?: number;
  /** 조달이 가져오는 강화품 id */
  item?: string;
  /** 홍보가 거는 주간 배수 — `WeekOptions.modifiers` 로 **합성**된다 (전용 필드 0) */
  visitorMult?: number;
  /** 홍보·특수가 몇 주 동안 도나 */
  weeks?: number;
  /** 특수의 즉시 효과 */
  effect?: 'safety' | 'clean' | 'repair';
  /** 구인이 뽑는 역할 (P6) */
  role?: string;
}

const data = raw as unknown as { commissions: CommissionDef[]; slotsByGrade: number[] };
export const COMMISSIONS: readonly CommissionDef[] = data.commissions;

export function commissionDef(id: string): CommissionDef | undefined {
  return COMMISSIONS.find((x) => x.id === id);
}

/** 발주해 둔 한 건. **세이브에 들어간다** — 2주짜리가 리로드로 증발하면 안 된다 */
export interface PendingCommission {
  defId: string;
  /** 절대 tick 기준 마감 — 주 경계를 넘는다 */
  dueTick: number;
  /**
   * 발주 시점에 굴려 둔 결과 (0~1). ⚠ **boolean 이 아니다** — 나중에 개입(독촉·추가금)이
   * 들어올 때 문턱을 옮기려면 원값이 필요하고, 그때 스냅샷 모양을 바꾸면 마이그레이션이 된다.
   */
  roll: number;
}

export interface CommissionSnapshot {
  pending: PendingCommission[];
}

/** 완료된 한 건 — 효과는 이미 확정됐고 연출만 남았다 */
export interface CommissionResult {
  def: CommissionDef;
  ok: boolean;
}

/**
 * 음성 대조군 (P4).
 *
 * · `shared-rng` — 전용 스트림 대신 **넘겨받은 주 rng** 를 쓴다. 켜면 격리 검사가 무너진다
 * · `double-complete` — `advanceTo` 가 같은 건을 **두 번** 완료시킨다. 멱등 검사가 무너진다
 * · `roll-skew` — `chance` 가 1 이면 뽑기를 **건너뛴다**. 뽑기 수 불변 검사가 무너진다
 */
export type CommissionFault = 'shared-rng' | 'double-complete' | 'roll-skew' | null;
let fault: CommissionFault = null;

export function setCommissionFaultForTest(next: CommissionFault): void {
  fault = next;
}

export class CommissionStore {
  private items: PendingCommission[] = [];

  get pending(): readonly PendingCommission[] {
    return this.items;
  }

  /** 지금 이 종류를 이미 맡겨 뒀나 — 같은 것을 두 번 시키는 것은 막는다 */
  busy(defId: string): boolean {
    return this.items.some((x) => x.defId === defId);
  }

  /**
   * 발주. **결제는 부르는 쪽이 이미 했다** (상점과 같은 경계).
   *
   * @param rng 전용 스트림. ⚠ 주 루프의 rng 를 넘기면 안 된다 — 그게 대조군 `shared-rng` 다
   */
  enqueue(def: CommissionDef, absTick: number, rng: Rng): PendingCommission | null {
    if (this.busy(def.id)) return null;
    /*
     * ⚠ **무조건 한 번 뽑는다.** `chance` 가 1 이어도 건너뛰면 항목의 성질이 뽑기 횟수를
     * 바꾸고, 그러면 「확정 수배 하나」가 뒤의 모든 뽑기를 민다.
     */
    const roll = fault === 'roll-skew' && def.chance >= 1 ? 1 : rng.next();
    const item: PendingCommission = {
      defId: def.id,
      dueTick: absTick + def.days * TICKS_PER_DAY,
      roll,
    };
    this.items.push(item);
    return item;
  }

  /**
   * 시계를 여기까지 감는다. **멱등이다** — 같은 tick 으로 두 번 불러도 결과가 한 벌이다.
   *
   * ⚠ 호출부가 둘이다 (하루 눈금의 `afterStep`, 주 눈금의 `settleWeek`). 멱등이 아니면
   * 하루 경계와 주 경계가 겹치는 순간 같은 수배가 두 번 완료된다.
   */
  advanceTo(absTick: number, rng: Rng): CommissionResult[] {
    const due = this.items.filter((x) => x.dueTick <= absTick);
    if (due.length === 0) return [];
    if (fault !== 'double-complete') {
      this.items = this.items.filter((x) => x.dueTick > absTick);
    }
    const out: CommissionResult[] = [];
    for (const item of due) {
      const def = commissionDef(item.defId);
      if (!def) continue;
      /*
       * ⚠ **결과와 무관하게 정확히 2뽑기.** 성공/실패로 횟수가 갈리면 수배 하나가
       * 날씨 시퀀스를 민다. 두 값 중 하나만 쓰더라도 둘 다 뽑는다.
       */
      const a = rng.next();
      const b = rng.next();
      void a;
      void b;
      out.push({ def, ok: item.roll <= def.chance });
    }
    // 결정론 — 같은 tick 에 여럿이 끝나면 **데이터 순서**로 낸다
    out.sort((x, y) => COMMISSIONS.indexOf(x.def) - COMMISSIONS.indexOf(y.def));
    return out;
  }

  /** 진행 중인 것의 남은 tick — 화면의 `D-2` 가 이 값에서 나온다 */
  remaining(absTick: number): { def: CommissionDef; ticks: number }[] {
    return this.items
      .map((x) => ({ def: commissionDef(x.defId), ticks: x.dueTick - absTick }))
      .filter((x): x is { def: CommissionDef; ticks: number } => x.def !== undefined)
      .sort((a, b) => a.ticks - b.ticks);
  }

  toSnapshot(): CommissionSnapshot {
    return { pending: this.items.map((x) => ({ ...x })) };
  }

  static fromSnapshot(s: CommissionSnapshot | undefined): CommissionStore {
    const store = new CommissionStore();
    for (const x of s?.pending ?? []) {
      if (commissionDef(x.defId)) store.items.push({ ...x });
    }
    return store;
  }
}

/**
 * 동시에 몇 건까지 맡길 수 있나 — **데이터가 정한다** (불변식 3).
 *
 * ⚠ 처음엔 `Math.floor((grade+1)/2)` 로 코드에 박아 뒀는데, 그건 「등급마다 몇 건」이라는
 * **콘텐츠 눈금**이지 규칙이 아니다. 밸런싱이 이 값을 만지려면 코드를 고쳐야 했다.
 */
export const COMMISSION_SLOTS: readonly number[] = data.slotsByGrade;

export function commissionSlots(grade: number): number {
  const i = Math.max(0, Math.min(COMMISSION_SLOTS.length - 1, grade - 1));
  return COMMISSION_SLOTS[i] ?? 1;
}

/**
 * **구인은 별도 창구다** (P6). 물자 수배와 슬롯을 안 나눈다.
 *
 * ⚠ 처음엔 한 통을 같이 썼는데, 실측이 「사람을 뽑는 동안 아무것도 못 산다」를 냈다
 * (구인 928건이 큐를 독점해 조달 236 → **63**). 인사 창구와 물자 창구는 현실에서도
 * 다른 곳이고, 한 통이면 두 축이 서로를 굶긴다.
 */
export function isHireSlot(def: CommissionDef): boolean {
  return def.category === 'hire';
}

/** 그 통에서 지금 몇 건이 돌고 있나 — 구인과 물자를 갈라 센다 */
export function pendingIn(
  store: { pending: readonly PendingCommission[] },
  hire: boolean,
): number {
  return store.pending.filter((x) => {
    const def = commissionDef(x.defId);
    return def !== undefined && isHireSlot(def) === hire;
  }).length;
}

/**
 * 홍보를 **`modifiers` 로 합성**한다 (P4).
 *
 * ⚠ `WeekOptions` 에 전용 필드를 **0개** 더한다. 「편한데」 하고 필드를 만드는 순간
 * 불변식 3 이 무너지고, 그 미끄러짐을 정적 검사가 잡는다.
 */
export function commissionVisitorMult(active: readonly CommissionDef[]): number {
  let mult = 1;
  for (const def of active) mult *= def.visitorMult ?? 1;
  return mult;
}

/**
 * **구인이 데이터에 있나** (P6). 없으면 즉시 고용으로 돌아간다.
 *
 * ⚠ 여기만 「데이터를 비우면 그 축이 잠든다」가 **안 성립한다** — 비우면 직원을 아예 못
 * 뽑아 판이 죽기 때문이다. 그래서 **코드 폴백**을 두고, 그 폴백 자체를 검사가 지킨다.
 */
export function hireJobsAvailable(): boolean {
  return COMMISSIONS.some((c) => c.category === 'hire');
}

/** 그 역할의 구인 항목 */
export function hireJobFor(role: string): CommissionDef | undefined {
  return COMMISSIONS.find((c) => c.category === 'hire' && c.role === role);
}

export function validateCommissionData(shopTargets: readonly string[] = []): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of COMMISSIONS) {
    if (seen.has(c.id)) problems.push(`중복 id: ${c.id}`);
    seen.add(c.id);
    // ② 모든 수배는 `days >= 2` — 0~1 이면 그건 구입이다 (D2)
    if (!(c.days >= 2)) problems.push(`${c.id}: days ${c.days} — 2 미만이면 구입이다 (D2)`);
    if (c.cost <= 0) problems.push(`${c.id}: 값이 0 이하`);
    if (c.chance <= 0 || c.chance > 1) problems.push(`${c.id}: chance ${c.chance}`);
    if (c.category === 'supply' && c.item === undefined) {
      problems.push(`${c.id}: 조달인데 가져오는 것이 없다`);
    }
    if (c.category === 'publicity' && c.visitorMult === undefined) {
      problems.push(`${c.id}: 홍보인데 배수가 없다`);
    }
    if (c.category === 'hire' && c.role === undefined) {
      problems.push(`${c.id}: 구인인데 역할이 없다`);
    }
    /*
     * ⚠ **구인은 1~2주다** (D4). 다른 분류(2~7일)보다 길다 — 사람을 구하는 일이라서다.
     * 짧아지면 「기다린다」가 사라져 즉시 고용과 구별이 안 된다.
     */
    if (c.category === 'hire' && c.days < 7) {
      problems.push(`${c.id}: 구인 리드타임 ${c.days}일 — 7일 이상이어야 한다`);
    }
  }
  // ③ 상점과 대상이 겹치지 않는다 — 겹치면 수배가 **항상 손해**다
  for (const c of COMMISSIONS) {
    if (c.item !== undefined && shopTargets.includes(c.item)) {
      problems.push(`${c.id}: 상점과 대상이 겹친다 (${c.item})`);
    }
  }
  if (COMMISSION_SLOTS.length === 0) problems.push('slotsByGrade 가 비었다');
  if (COMMISSION_SLOTS.some((n) => n < 1)) problems.push('slotsByGrade 에 1 미만이 있다');
  for (const cat of ['supply', 'publicity', 'special', 'hire'] as const) {
    if (!COMMISSIONS.some((c) => c.category === cat)) problems.push(`빈 분류: ${cat}`);
  }
  return problems;
}

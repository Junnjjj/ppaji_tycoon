import rawQuests from '../../data/kairo-quests.json' with { type: 'json' };
import { KairoTerrain } from './terrain.js';
import rawUnlocks from '../../data/kairo-unlocks.json' with { type: 'json' };
import { PlacementGrid, facilityDef } from './placement.js';
import { evaluateCombos, type ComboTier } from './combos.js';
import type { NeedKind, WeekSummary } from './week.js';

/**
 * 진행 — 의뢰와 해금. 스펙 v2/v4.
 *
 * ## 의뢰는 조건 충족형이다
 *
 * 선택 카드가 아니라 **상시 목록**이다. "조건 미달"이 곧 다음 목표가 되어, 플레이어가
 * 언제든 "다음에 뭘 하지"에 답을 갖는다 (v4 결정). 완료하면 자동으로 보상이 들어온다 —
 * 수락·제출 같은 단계를 두면 탭이 늘고 폰에서 번거롭다.
 *
 * ## 허가는 돈으로 못 산다
 *
 * 등급은 **퇴장 만족도**로만 오른다. 돈으로 살 수 있으면 "돈을 모아서 열면 된다"가 되어
 * 만족도를 관리할 이유가 사라진다 (v2 결정). 등급이 수면 사용 면적과 토지를 함께 연다.
 */

export type QuestConditionKind =
  | 'weekVisitors'
  | 'needSupply'
  | 'facilityCount'
  | 'exitSatisfaction'
  | 'maxTurnedAway'
  | 'activeCombos'
  | 'weekProfit'
  | 'comboTier'
  | 'facilityTotalAndSat';

export interface QuestCondition {
  kind: QuestConditionKind;
  value: number;
  need?: NeedKind;
  facility?: string;
  tier?: ComboTier;
  sat?: number;
}

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  condition: QuestCondition;
  /** 보상 — 시설이 주 보상이면 현금은 곁들이다 (K41: 돈은 다음 목표를 만들지 않는다) */
  reward: { cash: number; facility?: string };
}

export interface GradeDef {
  grade: number;
  name: string;
  reqExitSatisfaction: number;
  permitArea: number;
  landW: number;
  landH: number;
  /**
   * 동시 손님 상한과 방문 수요 배율.
   *
   * 등급이 이걸 올리지 않으면 시설만 늘고 수요·입장이 막혀 **후반에 손익이 꺾인다**
   * (실측 25% 하락). 등급은 퇴장 만족도로만 오르므로, 성장의 유일한 축이 "만족도를
   * 관리한다"가 된다 — 돈으로 사는 성장이 없다는 v2 결정과 같은 방향이다.
   */
  maxGuests: number;
  reputationPull: number;
  /** 심사 수수료 (K42) — 승급은 응시하는 시험이다. 1등급에는 없다 */
  examFee?: number;
  /** 심사 요구 조건 — 의뢰 condition 풀과 같은 스키마 */
  examReqs?: QuestCondition[];
}

export const QUESTS: readonly QuestDef[] = (rawQuests as unknown as { quests: QuestDef[] }).quests;

const UNLOCKS = rawUnlocks as unknown as {
  grades: GradeDef[];
  facilityGrade: Record<string, number>;
};

export const GRADES: readonly GradeDef[] = UNLOCKS.grades;

/**
 * 시설이 열리는 등급 (골격 해금). **목록에 없는 id 는 99** — 의뢰 보상처럼 사건으로만
 * 열리는 시설이다 (K41). 예전 기본값 1 은 "데이터에 안 적으면 공짜"라는 구멍이었다.
 */
export function requiredGrade(defId: string): number {
  return UNLOCKS.facilityGrade[defId] ?? 99;
}

/**
 * 실제 입장 상한 — **등급 상한과 공급 중 작은 쪽**.
 *
 * 등급만 보면 슬롯보다 많이 받아 줄만 길어지고, 대기 페널티로 만족도가 붕괴한다.
 * 그러면 등급이 떨어져 수요가 줄고 다시 만족도가... 하는 죽음의 나선이 생긴다
 * (실측: 36주에서 만석 100% · 만족도 0 · 손익 37% 하락).
 *
 * 공급의 1.5배까지 받는다 — 약간의 줄은 있어야 "붐빈다"가 보이고, 그 이상은 손해다.
 * 늘리는 방법은 하나뿐이다: **시설을 더 짓는다.** 그게 성장 루프다.
 */
export function admissionLimit(
  grade: GradeDef,
  totalCapacity: number,
  /**
   * 카드가 만든 혼잡 배율 (단체 예약 등). 등급 상한을 **넘어설 수 있다** —
   * "받는다"를 골랐으면 실제로 붐벼야 선택에 무게가 생긴다. 안 그러면 카드 문구가
   * 거짓말이 된다 (실측: 이 인자가 없어서 혼잡 +35% 가 아무 일도 안 했다).
   */
  crowdMult = 1,
): number {
  const bySupply = Math.ceil(Math.max(1, totalCapacity) * 1.5);
  return Math.max(8, Math.round(Math.min(grade.maxGuests, bySupply) * crowdMult));
}

/**
 * 해금된 토지 — 게이트 쪽 모서리에서 시작하는 사각형 (K25).
 *
 * ## 왜 사각형이고, 왜 게이트 쪽인가
 *
 * 흩어진 구역을 여러 개 열면 "어디가 내 땅인지"를 매번 확인해야 한다. 한 덩어리라야
 * 한눈에 읽히고, 넓어지는 순간이 눈에 보인다. 게이트 쪽에서 자라는 이유는 손님이
 * 게이트로 들어오기 때문이다 — 반대쪽부터 열리면 걷는 거리가 먼저 늘어난다.
 *
 * ⚠ **K36 부터 입구를 중심으로 좌우로 자란다.** 예전엔 `(0,0)` 에 붙은 사각형이라
 * 오른쪽으로만 넓어졌다. 입구가 맵 가운데로 오면서 한쪽 성장은 뜻이 없어졌다 —
 * 리조트는 정문을 중심으로 양옆으로 자란다.
 *
 * ## 왜 세로가 처음부터 넓은가
 *
 * 물가는 격자 아래쪽 (`j ≈ height·0.55`) 에 있다. 세로를 등급마다 조금씩 늘리면
 * **3등급이 되기 전에는 물에 닿지 못한다** — 빠지 게임에서 물이 잠겨 있으면 그건
 * 다른 게임이다. 그래서 세로는 1등급부터 물가를 넘고, 넓어지는 축은 주로 가로다
 * (강변을 따라 옆으로 넓히는 것 — 실제 리조트 확장의 모습이기도 하다).
 */
export function landRect(grade: GradeDef): { i0: number; j0: number; w: number; h: number } {
  return KairoTerrain.landRectAt(grade.landW, grade.landH);
}

/** 그 칸이 해금된 토지 안인가 */
export function withinLand(i: number, j: number, grade: GradeDef): boolean {
  const r = landRect(grade);
  return i >= r.i0 && j >= r.j0 && i < r.i0 + r.w && j < r.j0 + r.h;
}

/**
 * 평판 — **퇴장 만족도의 이동평균** (§9.2).
 *
 * ## 왜 이동평균인가 (실측)
 *
 * 지난주 값 하나로 등급을 정하면 **진동한다.** 등급이 오르면 수요가 늘고, 수요가 늘면
 * 혼잡해지고, 혼잡하면 만족도가 떨어져 등급이 내려간다 — 그러면 수요가 줄어 만족도가
 * 회복되고 다시 등급이 오른다. 실측으로 만족도 53↔75, 등급 2↔3 을 40주 동안 왕복했다.
 * 문턱을 못 넘어서가 아니라 **문턱에서 진동해서** 못 올라간다.
 *
 * 이동평균은 그 진동을 눌러 "잘 운영한 판이 등급을 유지한다"를 만든다. 스펙이 처음부터
 * 이동평균이라고 적어둔 이유가 이것이다 — 나는 지난주 값 하나를 썼다.
 *
 * α=0.25 는 약 4주 기억이다. 더 크면 진동이 남고, 더 작으면 개선의 효과가 몇 달 뒤에 온다.
 */
export const REPUTATION_ALPHA = 0.25;

export class Reputation {
  private ema: number;

  constructor(initial = 0) {
    this.ema = initial;
  }

  get value(): number {
    return this.ema;
  }

  /** 한 주가 끝났다 */
  push(exitSatisfaction: number): number {
    // 첫 주는 그대로 받는다 — 0 에서 천천히 올라오면 첫 등급이 늦게 열린다
    this.ema =
      this.ema === 0
        ? exitSatisfaction
        : this.ema + (exitSatisfaction - this.ema) * REPUTATION_ALPHA;
    return this.ema;
  }

  toSnapshot(): number {
    return this.ema;
  }

  static fromSnapshot(v: number): Reputation {
    return new Reputation(v);
  }
}

/** 퇴장 만족도로 정해지는 등급 — 돈으로는 못 올린다 */
export function gradeFor(exitSatisfaction: number): GradeDef {
  let best = GRADES[0] as GradeDef;
  for (const g of GRADES) {
    if (exitSatisfaction >= g.reqExitSatisfaction) best = g;
  }
  return best;
}

/**
 * 등급을 내리는 데 필요한 여유 (이력, hysteresis).
 *
 * ## 왜 필요한가 (실측)
 *
 * 문턱이 10점 간격(0/55/65/75/85)인데 이동평균이 문턱 근처에서 ±3 흔들린다. 그러면
 * **평균을 써도 등급이 매주 펄럭인다** — 40주에 35번 바뀌었다. 오를 때는 문턱에서,
 * 내릴 때는 4점 더 떨어져야 내려가게 하면 한 번 오른 등급이 유지된다.
 *
 * 이건 "잘 운영하면 등급을 유지한다"는 감각의 문제다. 매주 바뀌면 등급이 상태가 아니라
 * 소음이 되고, 등급에 걸린 해금·상한이 전부 소음이 된다.
 */
export const GRADE_HYSTERESIS = 4;

/**
 * 지금 등급에서 다음 등급. **오를 때는 문턱, 내릴 때는 문턱 −4.**
 * 처음 판정(현재 등급이 없을 때)은 `gradeFor` 를 쓴다.
 */
export function nextGrade(currentGrade: number, reputation: number): GradeDef {
  const cur = GRADES.find((g) => g.grade === currentGrade) ?? (GRADES[0] as GradeDef);
  const up = gradeFor(reputation);
  if (up.grade > cur.grade) return up;
  // 내려가려면 현재 등급 문턱보다 여유만큼 더 떨어져야 한다
  if (reputation < cur.reqExitSatisfaction - GRADE_HYSTERESIS) {
    let best = GRADES[0] as GradeDef;
    for (const g of GRADES) {
      if (reputation >= g.reqExitSatisfaction - GRADE_HYSTERESIS) best = g;
    }
    return best;
  }
  return cur;
}

export interface QuestStatus {
  id: string;
  name: string;
  desc: string;
  done: boolean;
  /** 0..1 진행도 — 목록에서 "얼마나 남았나"를 보여준다 */
  progress: number;
  /** 현재값 / 목표값 (사람이 읽는 형태) */
  detail: string;
  reward: number;
  /** 완수하면 열리는 시설 (K41) — 티저와 셀레브레이션이 쓴다 */
  rewardFacility?: string;
}

export function supplyOf(placement: PlacementGrid): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of placement.all()) {
    const def = facilityDef(item.defId) as { need?: string } | undefined;
    if (!def?.need) continue;
    out[def.need] = (out[def.need] ?? 0) + 1;
  }
  return out;
}

/**
 * 의뢰 진행도. `report` 가 없으면 주간 조건은 0 으로 둔다 —
 * 첫 주를 돌리기 전에도 목록을 볼 수 있어야 "다음 목표"가 보인다.
 *
 * 전체 `WeekReport` 가 아니라 `WeekSummary` 를 받는다 — 여기서 읽는 필드가 넷뿐이고,
 * 그래야 세이브에서 복원한 요약으로도 판정이 된다 (히트맵은 저장하지 않는다).
 */

/** 조건 평가 결과 — 의뢰와 심사(K42)가 같은 평가기를 쓴다 */
export interface ConditionEval {
  cur: number;
  goal: number;
  detail: string;
  progress: number;
  done: boolean;
}

/**
 * 조건 하나를 잰다. 의뢰(questStatuses)와 심사(exam.ts)가 **이 하나**를 공유한다 —
 * 갈라지면 "의뢰로는 3개인데 심사로는 2개"가 된다 (guestWalkable 교훈과 같은 종류).
 */
export function evaluateCondition(
  c: QuestCondition,
  placement: PlacementGrid,
  report: WeekSummary | null,
  supply: Record<string, number>,
  combos: ReturnType<typeof evaluateCombos>,
): ConditionEval {
  let cur = 0;
  let goal = c.value;
  let detail = '';

  switch (c.kind) {
    case 'weekVisitors':
      cur = report?.visitors ?? 0;
      detail = `${cur} / ${goal}명`;
      break;
    case 'needSupply':
      cur = supply[c.need ?? ''] ?? 0;
      detail = `${cur} / ${goal}개`;
      break;
    case 'facilityCount':
      cur = placement.all().filter((x) => x.defId === c.facility).length;
      detail = `${cur} / ${goal}개`;
      break;
    case 'exitSatisfaction':
      cur = Math.round(report?.exitSatisfaction ?? 0);
      detail = `${cur} / ${goal}`;
      break;
    case 'maxTurnedAway':
      // 목표가 0 이라 "적을수록 좋다" — 주를 한 번은 돌려야 판정된다
      cur = report ? (report.turnedAway <= c.value ? 1 : 0) : 0;
      goal = 1;
      detail = report ? `만석 ${report.turnedAway}명` : '아직 한 주를 안 돌렸다';
      break;
    case 'activeCombos':
      cur = combos.active.length;
      detail = `${cur} / ${goal}개`;
      break;
    case 'weekProfit':
      cur = Math.max(0, report?.profit ?? 0);
      detail = `${Math.round(cur / 10000)} / ${Math.round(goal / 10000)}만`;
      break;
    case 'comboTier':
      cur = combos.active.filter((x) => x.tier === c.tier).length;
      detail = `${cur} / ${goal}개`;
      break;
    case 'facilityTotalAndSat': {
      const sat = Math.round(report?.exitSatisfaction ?? 0);
      const needSat = c.sat ?? 0;
      cur = placement.count >= goal && sat >= needSat ? 1 : 0;
      detail = `시설 ${placement.count}/${goal} · 만족 ${sat}/${needSat}`;
      goal = 1;
      break;
    }
  }

  const progress = goal <= 0 ? 1 : Math.max(0, Math.min(1, cur / goal));
  return { cur, goal, detail, progress, done: cur >= goal };
}

export function questStatuses(
  placement: PlacementGrid,
  report: WeekSummary | null,
  /** 수영 구역 (S4) — zone 콤보 조건이 있으면 필요. 의뢰·심사·UI 가 같은 값을 받아야 한다 */
  zones: Parameters<typeof evaluateCombos>[2] = [],
): QuestStatus[] {
  const supply = supplyOf(placement);
  const combos = evaluateCombos(placement, undefined, zones);
  const out: QuestStatus[] = [];

  for (const q of QUESTS) {
    const c = q.condition;
    const ev = evaluateCondition(c, placement, report, supply, combos);
    out.push({
      id: q.id,
      name: q.name,
      desc: q.desc,
      done: ev.done,
      progress: ev.progress,
      detail: ev.detail,
      reward: q.reward.cash,
      ...(q.reward.facility !== undefined ? { rewardFacility: q.reward.facility } : {}),
    });
  }
  return out;
}

export interface ProgressSnapshot {
  claimed: string[];
}

/**
 * 완료한 의뢰의 보상을 지급한다. **이미 받은 것은 다시 주지 않는다** —
 * 조건이 다시 만족되어도 반복 지급되면 무한 수입이 된다.
 */
export class ProgressStore {
  private readonly claimed = new Set<string>();

  get claimedCount(): number {
    return this.claimed.size;
  }

  isClaimed(id: string): boolean {
    return this.claimed.has(id);
  }

  /** 새로 완료된 의뢰들을 청구하고 총 보상을 돌려준다 — 시설 해금 포함 (K41) */
  claim(statuses: readonly QuestStatus[]): { ids: string[]; cash: number; facilities: string[] } {
    const ids: string[] = [];
    const facilities: string[] = [];
    let cash = 0;
    for (const s of statuses) {
      if (!s.done || this.claimed.has(s.id)) continue;
      this.claimed.add(s.id);
      ids.push(s.id);
      cash += s.reward;
      if (s.rewardFacility !== undefined) facilities.push(s.rewardFacility);
    }
    return { ids, cash, facilities };
  }

  toSnapshot(): ProgressSnapshot {
    return { claimed: [...this.claimed] };
  }

  static fromSnapshot(s: ProgressSnapshot): ProgressStore {
    const p = new ProgressStore();
    for (const id of s.claimed) p.claimed.add(id);
    return p;
  }
}

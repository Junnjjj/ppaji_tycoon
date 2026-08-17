import rawQuests from '../../data/kairo-quests.json' with { type: 'json' };
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
  reward: { cash: number };
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
}

export const QUESTS: readonly QuestDef[] = (rawQuests as unknown as { quests: QuestDef[] }).quests;

const UNLOCKS = rawUnlocks as unknown as {
  grades: GradeDef[];
  facilityGrade: Record<string, number>;
};

export const GRADES: readonly GradeDef[] = UNLOCKS.grades;

/** 시설이 열리는 등급 */
export function requiredGrade(defId: string): number {
  return UNLOCKS.facilityGrade[defId] ?? 1;
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
export function admissionLimit(grade: GradeDef, totalCapacity: number): number {
  const bySupply = Math.ceil(Math.max(1, totalCapacity) * 1.5);
  return Math.max(8, Math.min(grade.maxGuests, bySupply));
}

/** 퇴장 만족도로 정해지는 등급 — 돈으로는 못 올린다 */
export function gradeFor(exitSatisfaction: number): GradeDef {
  let best = GRADES[0] as GradeDef;
  for (const g of GRADES) {
    if (exitSatisfaction >= g.reqExitSatisfaction) best = g;
  }
  return best;
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
}

function supplyOf(placement: PlacementGrid): Record<string, number> {
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
export function questStatuses(
  placement: PlacementGrid,
  report: WeekSummary | null,
): QuestStatus[] {
  const supply = supplyOf(placement);
  const combos = evaluateCombos(placement);
  const out: QuestStatus[] = [];

  for (const q of QUESTS) {
    const c = q.condition;
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
    out.push({
      id: q.id,
      name: q.name,
      desc: q.desc,
      done: cur >= goal,
      progress,
      detail,
      reward: q.reward.cash,
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

  /** 새로 완료된 의뢰들을 청구하고 총 보상을 돌려준다 */
  claim(statuses: readonly QuestStatus[]): { ids: string[]; cash: number } {
    const ids: string[] = [];
    let cash = 0;
    for (const s of statuses) {
      if (!s.done || this.claimed.has(s.id)) continue;
      this.claimed.add(s.id);
      ids.push(s.id);
      cash += s.reward;
    }
    return { ids, cash };
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

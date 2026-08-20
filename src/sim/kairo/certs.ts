/**
 * 사이드 인증 (P3-E) — **등급 사다리 옆의 병렬 목표.**
 *
 * ## 왜 있나 (실측)
 *
 * 후반이 비는 원인은 자리도 돈도 아니라 **등급 상한**이었다
 * (`docs/research/late-game-cap-proposal.md`). 입장은 `min(등급 maxGuests, 공급×1.5)` 인데
 * 시설 75종을 **한 채씩만** 지어도 정원 합이 185(×1.5 = 277)라 5등급 문턱 230 을 넘어선다.
 * 그래서 41~80주의 **68%** 가 "건설 0원"이었다 (P3-E 실측, 12시드×80주 · 판마다 재고
 * 중앙값) — 무엇을 지어도 손님이 안 늘기 때문이다. 봇의 천장을 게임 규칙으로 전부
 * 풀어도 그대로였다 (P3-D).
 *
 * 인증은 그 상한을 **플레이어의 선택으로** 푼다. 12종 합계 +140 → 5등급 370.
 *
 * ## ⚠ 가산은 **얼마**보다 **언제**다 (P5 실측, 24시드×80주)
 *
 * **둘 중 하나만으로는 안 된다.** 41~80주 건설 0원을 2×2 로 갈라 재면 (24시드×80주,
 * 인증 데이터만 다른 A/B):
 *
 * |            | 완만·균일 배분 | **후반 가중** |
 * |------------|---------------|--------------|
 * | **총 70**  | 63% (P4)      | 60%          |
 * | **총 140** | 60%           | **45%**      |
 *
 * 배분만 바꾸면 −3pp, 총합만 올리면 −3pp, **둘을 같이 하면 −18pp** 다. 단순 합의
 * 3배 — 교호작용이지 두 효과의 덧셈이 아니다. 그러니 한쪽만 되돌려도 안 된다.
 *
 * 왜 총합만으로는 안 되나: 정원이 늘면 판이 빨리 커지고, 판이 커지면 인증 조건도
 * 빨리 충족돼서 **가산이 전반에 다 소진된다** (사철 도착 중앙 71주 → 49주).
 * 왜 배분만으로는 안 되나: 늦게 오는 종에 몰아 줘도 **나눠 줄 양이 없다** (총 70 에서
 * 후반 7종에 55 를 다 줘도 41~80주 누적 증가가 32 뿐이고, 첫 무건설은 26 → 24주로
 * 오히려 당겨진다 — 초반 몫을 깎았기 때문).
 *
 * 그래서 `capacity` 는 도착 시각으로 갈라져 있다 (초반 4~7 · 후반 11~19). 평평하게
 * 되돌리면 효과가 통째로 사라진다 — `certs.test.ts` 의 후반 가중 검사가 지킨다.
 *
 * ## ⚠ 여기서 더 올리지 않는다 — 멈추는 자리는 "만석 0"
 *
 * 총 140(정원 370)이면 만석 비율이 24판 전부 0% 다. 수요가 상한에 안 닿는다는 뜻이고,
 * 그 위의 상한은 **아무도 안 쓰는 시설을 짓게 하는 숫자**가 된다. 대조군 둘:
 *   · 총 200 (같은 후반 가중) — 공백 45%→43% 로 2pp 좋아지는데, 시설 122→129 채에
 *     후반 수익은 226·234만 → **205·219만 으로 떨어지고** 유지비는 29→35만, 퇴장
 *     만족도 p25 는 73→60. **더 짓고 덜 번다**
 *   · 총 210 (균일) — 시설 176 채인데 수익은 그대로, 공백은 50% 로 되레 나빠지고
 *     만족도 p25 는 55
 * 즉 멈추는 자리는 총합이 아니라 **"만석이 0 이 되는 지점"** 이다.
 *
 * ⚠ 조건을 올려 도착을 늦추는 것도 안 된다 (총 170 + 후반 문턱 상향 대조군: 57% ·
 * **종합 인증 획득률 0%**). 인증 → 정원 → 성장 → 다음 인증은 **양의 되먹임**이라,
 * 조건을 조이면 판이 안 커지고 그래서 조건이 더 안 채워진다.
 *
 * ## 성능은 제약이 아니었다 (P5 실측)
 *
 * P4 가 "정원 300 위는 실기기 예산 확인 필요"를 **추정으로** 남겼는데, 재보니 sim 쪽
 * 제약이 아니다. 다 자란 판에서 동시 손님 230명 0.30~0.41ms/tick · 300명 0.47~0.90 ·
 * 400명 1.30~2.72 · 500명 1.40~4.30 이고 tick 은 0.2초마다 온다
 * (`npm run sim:kairo -- --seeds 3 --weeks 80 --bench`).
 *
 * 게다가 **화면의 손님 수는 상한이 아니라 수요가 정한다** — 80주 판 12개의 마지막 주
 * 동시 손님은 97~192명(중앙 120)이었다. 상한 370 은 "짓는 이유"로 쓰이고 손님은
 * 그 근처에도 안 간다. ⚠ 남은 미지는 **렌더 비용**이다 (이 표는 sim tick 비용이다).
 *
 * ## 다음 병목은 공급이 아니라 수요다
 *
 * 만석이 0 이 됐다는 것은 `min(등급 상한, 공급×1.5)` 에서 **왼쪽이 더 이상 안 문다**는
 * 뜻이다. 41~80주에 남은 45% 의 공백은 상한 문제가 아니라 **주말 수요가 판의 크기를
 * 못 따라오는 것**이다. 그러니 다음 축을 상한(`maxGuests`)에서 더 찾지 말 것 —
 * 위의 대조군 둘이 그 길의 끝을 보여 준다.
 *
 * ## 새 시스템이 아니다 — 세 부품의 재조합이다
 *
 * · 조건 평가 — `progress.evaluateCondition` **하나**를 쓴다 (의뢰·심사와 공유).
 *   갈라지면 "의뢰로는 3개인데 인증으로는 2개"가 된다 (이 저장소가 겪은 사고)
 * · 청구 — `ProgressStore` 와 **같은 모양**(claim/isClaimed/스냅샷)
 * · 보상 배관 — 현금은 `week.earn`, 상한은 `effectiveGrade` 하나
 *
 * ## 왜 `ProgressStore`(의뢰) 를 그냥 늘리지 않았나
 *
 * 세 가지가 실제로 다르다. 셋 다 "합치면 다른 것이 깨진다"는 형태다:
 *
 * 1. **조건이 여럿이다.** `QuestDef.condition` 은 하나이고, 심사(`examReqs`)만 배열이다.
 *    인증이 총량 조건 하나뿐이면 의뢰 16종과 구별이 안 된다 (제안서 ⓑ 주의)
 * 2. **화면 예산.** `questStatuses()` 는 의뢰 칩 기둥(상위 2건)과 건설 시트 티저를
 *    먹인다. 인증을 같은 목록에 넣으면 칩이 인증으로 덮이는데, 칩 기둥은
 *    **3장이 천장**이다 (세로 24% 예산의 상한이 이 기둥이다 — P3 실측)
 * 3. **되돌리기.** 제안서가 ⓑ 를 고른 근거의 하나가 "데이터 파일을 비우면 인증 0종이
 *    되고 나머지는 잠든다"였다. 의뢰와 한 배열이면 그 성질이 사라진다
 *
 * ## 인증은 등급이 아니다
 *
 * `grade` 번호를 안 건드린다 — 승급은 심사로만, 강등은 자동이라는 K42 규칙 그대로다.
 * 인증이 바꾸는 것은 `maxGuests`·`permitArea` **둘뿐**이고, 그것도 등급 정의를
 * 감싼 사본에서 바꾼다 (`effectiveGrade`).
 *
 * ## 허가는 돈으로 못 산다 (v2 불변식)
 *
 * 인증에는 수수료가 없다. 조건을 갖추면 결산에서 자동으로 들어온다 — 심사처럼
 * 응시·수수료를 붙이면 "돈으로 상한을 산다"가 되어 v2 결정이 무너진다. 12종이
 * 동시에 열려 있어야 후반 목표 밀도가 오르는데, 순차 응시는 그 반대다.
 */
import rawCerts from '../../data/kairo-certs.json' with { type: 'json' };
import { PlacementGrid } from './placement.js';
import { evaluateCombos } from './combos.js';
import {
  evaluateCondition,
  type ConditionContext,
  type GradeDef,
  type QuestCondition,
  supplyOf,
} from './progress.js';
import type { WeekSummary } from './week.js';
import type { SwimZone } from './swim.js';

/**
 * 인증 보상.
 *
 * ⚠ **시설이 없다.** 시설 75종은 골격(등급)·의뢰·소원·입고가 정확히 한 번씩 나눠 갖고
 * 있고 `unlock-graph.test.ts` 가 "어디서도 안 열림 / 양쪽에" 를 둘 다 잡는다. 인증을
 * 두 번째 출처로 얹으면 이중 해금이거나, 그 시설이 후반 인증까지 잠긴다.
 *
 * ⚠ **현금은 초반 3종에만.** 후반 현금 적체(260주 1.5억)가 이 페이즈의 지표이므로
 * 현금 보상을 후반에 얹으면 재려던 것을 스스로 망친다.
 */
export interface CertReward {
  /** 등급 상한에 더해지는 정원 — **상한을 푸는 유일한 고리다** */
  capacity?: number;
  /** 수면 사용 허가 면적 가산 */
  permitArea?: number;
  cash?: number;
}

export interface CertDef {
  id: string;
  name: string;
  desc: string;
  /** **AND** — 전부 충족해야 한다. 심사의 부분 점수와 다르다 (인증은 응시가 아니다) */
  conditions: QuestCondition[];
  reward: CertReward;
}

export const CERTS: readonly CertDef[] = (rawCerts as unknown as { certs: CertDef[] }).certs;

/** 인증 12종 합계 정원 가산 — 밸런싱과 검사가 읽는 정본 */
export const CERT_CAPACITY_TOTAL = CERTS.reduce((a, c) => a + (c.reward.capacity ?? 0), 0);

/**
 * 인증이 읽는 바깥 재료. `zones` 는 콤보 판정과 면적 조건에 **같은 값**이 가야 한다 —
 * 하나만 주면 zone 콤보 3종이 조용히 0 이 된다 (evaluateCombos 의 오랜 함정).
 */
export interface CertContext {
  zones: readonly SwimZone[];
  /** 지금 놓인 코스 수 */
  courses: number;
  /** 완료한 의뢰 수 */
  questsDone: number;
}

export interface CertStatus {
  id: string;
  name: string;
  desc: string;
  done: boolean;
  /** 0..1 — 조건별 진행도의 평균. 막대 하나로 "얼마나 남았나"가 읽혀야 한다 */
  progress: number;
  /** 조건별 한 줄 (사람이 읽는 형태) */
  reqs: { detail: string; done: boolean }[];
  /** 아직 못 채운 조건 수 — 1 이면 "곧 딴다" (티커 발화 조건) */
  remaining: number;
  reward: CertReward;
}

/**
 * 인증 진행도. 의뢰(`questStatuses`)와 **같은 평가기**를 쓴다.
 *
 * `report` 가 없으면(첫 주 전) 주간 조건은 0 이다 — 목록은 그래도 보인다.
 * "조건 미달"이 곧 다음 목표라는 v4 결정이 인증에도 그대로 적용된다.
 */
export function certStatuses(
  placement: PlacementGrid,
  report: WeekSummary | null,
  ctx: CertContext,
): CertStatus[] {
  const supply = supplyOf(placement);
  const combos = evaluateCombos(placement, undefined, ctx.zones);
  const cond: ConditionContext = {
    zones: ctx.zones,
    courses: ctx.courses,
    questsDone: ctx.questsDone,
  };
  return CERTS.map((c) => {
    const evs = c.conditions.map((q) => evaluateCondition(q, placement, report, supply, combos, cond));
    const remaining = evs.filter((e) => !e.done).length;
    return {
      id: c.id,
      name: c.name,
      desc: c.desc,
      done: remaining === 0,
      progress: evs.length === 0 ? 1 : evs.reduce((a, e) => a + e.progress, 0) / evs.length,
      reqs: evs.map((e) => ({ detail: e.detail, done: e.done })),
      remaining,
      reward: c.reward,
    };
  });
}

export interface CertSnapshot {
  earned: string[];
}

/**
 * 획득한 인증. 의뢰의 `ProgressStore` 와 같은 모양이다 — **한 번 딴 것은 다시 안 준다**
 * (조건이 다시 만족돼도 반복 지급되면 무한 정원이 된다).
 */
export class CertStore {
  private readonly earned = new Set<string>();

  get count(): number {
    return this.earned.size;
  }

  has(id: string): boolean {
    return this.earned.has(id);
  }

  get earnedIds(): readonly string[] {
    return [...this.earned];
  }

  /** 새로 충족된 인증을 딴다. 현금은 부르는 쪽이 지급한다 (week 는 sim 바깥 상태다) */
  claim(statuses: readonly CertStatus[]): { ids: string[]; cash: number } {
    const ids: string[] = [];
    let cash = 0;
    for (const s of statuses) {
      if (!s.done || this.earned.has(s.id)) continue;
      this.earned.add(s.id);
      ids.push(s.id);
      cash += s.reward.cash ?? 0;
    }
    return { ids, cash };
  }

  /**
   * 획득분의 가산 합. **정본은 여기 하나다** — 게임·봇·UI·검사가 전부
   * `effectiveGrade` 를 통해 이 값을 받는다.
   */
  bonus(): { capacity: number; permitArea: number } {
    let capacity = 0;
    let permitArea = 0;
    for (const c of CERTS) {
      if (!this.earned.has(c.id)) continue;
      capacity += c.reward.capacity ?? 0;
      permitArea += c.reward.permitArea ?? 0;
    }
    return { capacity, permitArea };
  }

  toSnapshot(): CertSnapshot {
    return { earned: [...this.earned] };
  }

  static fromSnapshot(s: CertSnapshot | undefined): CertStore {
    const c = new CertStore();
    for (const id of s?.earned ?? []) {
      // 데이터에서 사라진 인증은 버린다 — 되돌리기(파일 비우기)가 세이브를 안 깨야 한다
      if (CERTS.some((x) => x.id === id)) c.earned.add(id);
    }
    return c;
  }
}

/**
 * **인증 가산이 게임에 들어오는 유일한 지점.**
 *
 * ⚠ `admissionLimit` 의 시그니처를 안 바꾼 이유: 인자를 하나 더 두면 부르는 쪽이
 * 잊을 수 있고, 그러면 UI 는 300 을 보여주는데 시뮬은 230 으로 도는 상태가 조용히
 * 생긴다 (P3-C 가 `bySupply >= gradeMax` 사본을 경계한 것과 같은 함정). 대신
 * **등급 정의 자체를 감싼다** — `currentGrade()`(main) 과 `gradeNow()`(봇) 이 이것을
 * 돌려주므로 입장 상한·수면 허가·결산 `admissionCap`·화면 표시가 **한 번에** 따라온다.
 *
 * 바꾸는 것은 `maxGuests`·`permitArea` 둘뿐이다:
 * · `grade`·`name`·`reqExitSatisfaction`·`examReqs` — 인증은 등급이 아니다
 * · `landW/landH` — 5등급이 이미 격자 전체다. 줄 땅이 없다 (제안서 §1.1)
 * · `reputationPull` — 수요 배율까지 올리면 "공급을 안 거치는 축"이라는 설계가 무너진다
 */
export function effectiveGrade(
  base: GradeDef,
  bonus: { capacity: number; permitArea: number },
): GradeDef {
  if (bonus.capacity === 0 && bonus.permitArea === 0) return base;
  return {
    ...base,
    maxGuests: base.maxGuests + bonus.capacity,
    permitArea: base.permitArea + bonus.permitArea,
  };
}

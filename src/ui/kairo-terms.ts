/**
 * 화면이 쓰는 **한국어 낱말의 정본** — 같은 것을 화면마다 다르게 부르지 않기 위해.
 *
 * ## 왜 이 파일이 필요한가 — 낱말이 흩어져 있었다 (UX 감사 P0-3·P0-4·P0-5·P1-10)
 *
 * 실측 세 가지가 같은 뿌리였다:
 *
 * · **심사 접수 토스트·티커·알림함**이 `hygiene 3 · exitSatisfaction 55` 라는 **sim 원 키**를
 *   그대로 뿌렸다. 같은 게임의 심사 확인 화면은 `위생 시설`·`퇴장 만족도` 로 쓰고 있었다 —
 *   표가 없어서가 아니라 **연결이 안 돼 있어서**다.
 * · **도감 콤보 힌트**가 `shower_row + ?` 처럼 영문 시설 ID 를 냈다. 새 판은 73/73 이 전부
 *   미발견이라 이 화면은 **언제나** 영문 목록으로 처음 열린다.
 * · **인증 목록**이 `· 1 / 3개 · 5 / 8개` 처럼 **주어 없는 숫자쌍**이었다. 원인은
 *   `evaluateCondition` 이 수량만 문자열로 만들고 주어(`kind`·`need`)는 호출자가 붙이는
 *   계약인데, 심사 화면만 붙이고 인증 목록은 안 붙였기 때문이다.
 *
 * ## 규칙
 *
 * · **`sim/` 에 한글을 넣지 않는다** (불변식 1). 주어는 언제나 화면이 붙인다.
 * · **판정 로직을 복제하지 않는다.** `evaluateCondition` 은 의뢰·심사·인증이 공유하는
 *   하나다 (K42) — 여기서는 그 결과에 **이름표만** 붙인다.
 * · 같은 뜻의 다른 문자열을 코드 어디에도 두 번 두지 않는다. 새 화면이 조건을 보여 줄
 *   일이 생기면 `conditionLine()` 을 부르지, 자기 표를 만들지 않는다.
 */
import type { QuestCondition } from '../sim/kairo/progress.js';
import type { NeedKind } from '../sim/kairo/week.js';

/**
 * 수요 종류의 한글 이름 — **정본은 여기다.**
 *
 * 원래 `kairo-report.ts` 에 있었는데, 이 파일이 그걸 import 하고 결산이 다시 여기서
 * `평판` 을 가져오면 **모듈 순환**이 된다. 낱말 표는 아무것도 import 하지 않는 잎이어야
 * 한다 — 결산·심사·도감·인증이 전부 여기서 읽는다 (두 벌이면 "위생"과 "청결"이 갈린다).
 */
export const NEED_NAME: Record<NeedKind, string> = {
  food: '먹거리',
  rest: '쉼터',
  warm: '온열',
  play: '놀이',
  thrill: '스릴',
  scenery: '경관',
  hygiene: '위생',
  service: '운영',
  stay: '숙박',
};

/**
 * **평판** — 퇴장 만족도의 이동평균. 등급·심사·인증이 전부 이 값을 본다.
 *
 * ⚠ 실측(UX 감사 P0-5)에서 같은 한 값이 화면마다 **네 이름 · 네 눈금**이었다:
 * 헤더 `😊 0%` · 결산 `퇴장 만족 66` · 목표 `만족도 0/55` · 심사 `퇴장 만족도 0 / 55` ·
 * 잠금 사유 `평판 55 필요`. 플레이어는 "헤더의 0% 와 목표의 0/55 가 같은 값인가"를
 * 화면만 보고 풀 수 없었다.
 *
 * 정본을 **`평판` · 0~100 정수 · % 아님**으로 고정한다. `퇴장 만족도` 라는 정확한 말은
 * 결산의 부제 한 줄에만 남긴다 — 개념을 가르치기에 가장 좋은 자리다.
 */
export const REPUTATION_NAME = '평판';

/** 표에 없는 키는 `undefined` — 인덱스 접근을 한 곳에 가둔다 */
function needName(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  return (NEED_NAME as Record<string, string | undefined>)[key];
}

/** 결산에서 한 번만 쓰는 정의문. 이 개념을 가르치는 자리는 여기 하나다. */
export const REPUTATION_DEFINITION = '손님이 나갈 때의 만족 평균입니다';

/** 인증·등급 보상의 이름 — `정원` 은 시설 정원(건설 카드의 `정원 4`)과 헷갈린다 */
export const CAPACITY_REWARD_NAME = '동시 입장';
/** `허가` 는 이 화면에 처음 나오는 낱말이라 무엇의 허가인지 말한다 */
export const PERMIT_REWARD_NAME = '수면 허가';

/**
 * 조건의 **주어** — `evaluateCondition` 이 버린 `kind`·`need` 를 한글 명사로 되살린다.
 *
 * 심사 화면(`kairo-exam.ts` 의 `reqLabel`)이 쓰던 표를 여기로 올렸다. 두 벌이면
 * "의뢰로는 위생 시설인데 인증으로는 조건"이 된다.
 */
export function conditionSubject(c: QuestCondition): string {
  switch (c.kind) {
    case 'needSupply':
      return `${needName(c.need) ?? c.need} 시설`;
    case 'exitSatisfaction':
      return REPUTATION_NAME;
    case 'weekVisitors':
      return '주간 방문객';
    case 'weekProfit':
      return '주간 영업 손익';
    case 'activeCombos':
      return '발동 중인 콤보';
    case 'comboTier':
      return `${c.tier === 'large' ? '대형' : c.tier === 'medium' ? '중형' : '소형'} 콤보`;
    case 'facilityCount':
      return '지정 시설';
    case 'facilityKinds':
      return '시설 종류';
    case 'facilityTotalAndSat':
      return '';
    case 'maxTurnedAway':
      return '만석으로 돌려보낸 손님';
    case 'avgFacilityLevel':
      return '평균 개선 단계';
    case 'swimAreaMax':
      return '가장 큰 물놀이 구역';
    case 'courseCount':
      return '코스';
    case 'questsDone':
      return '완료한 의뢰';
    default:
      return '조건';
  }
}

/**
 * sim 의 `detail` 문자열을 **목록 문체**로 다듬는다.
 *
 * ⚠ `maxTurnedAway` 의 `아직 한 주를 안 돌렸다` 는 목록 안에서 유일한 **반말 서술문**이라
 * 문체가 갈렸다 (UX 감사 P1-10). 판정은 sim 소관이고 여기서는 표시만 고친다.
 */
export function conditionValueText(detail: string): string {
  if (detail === '아직 한 주를 안 돌렸다') return '첫 결산 뒤 판정';
  return detail;
}

/**
 * 화면에 그대로 쓰는 한 줄 — **주어 + 값**.
 *
 * `· 1 / 3개` → `선착장 1 / 3개`. 선행 `·` 는 붙이지 않는다 (호출자가 마커를 갖는다).
 */
export function conditionLine(c: QuestCondition, detail: string): string {
  return `${conditionSubject(c)} ${conditionValueText(detail)}`.trim();
}

/**
 * 인증·등급 보상 한 줄. 두 곳이 다른 낱말을 쓰던 것을 하나로 모은다
 * (`main.ts` 는 이미 `수면 허가 +N칸` 이라 썼고 인증 목록만 `허가 +N` 이었다).
 */
export function rewardLine(reward: { capacity?: number; permitArea?: number }): string {
  const parts: string[] = [];
  if (reward.capacity !== undefined) parts.push(`${CAPACITY_REWARD_NAME} +${reward.capacity}명`);
  if (reward.permitArea !== undefined) parts.push(`${PERMIT_REWARD_NAME} +${reward.permitArea}칸`);
  return parts.join(' · ');
}

/**
 * 콤보 힌트의 재료 이름 — 시설 ID 든 수요 종류든 **한글**로 낸다.
 *
 * 도감이 `shower_row`·`thrill` 두 계열을 섞어 쓴다. 시설 이름은 데이터가 갖고 있고
 * (`kairo-facilities.json` 의 `name`), 수요 종류는 `NEED_NAME` 이 갖고 있다 — 둘 다
 * 이미 있는 표라 새로 쓰는 것은 **묶는 함수 하나**뿐이다.
 */
export function ingredientName(
  token: string,
  facilityName: (id: string) => string | undefined,
): string {
  const need = needName(token);
  if (need !== undefined) return `${need} 시설`;
  return facilityName(token) ?? token;
}

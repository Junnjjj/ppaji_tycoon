/**
 * 손님의 말 (Q9) — **저장하지 않는다. 그 순간 파생한다.**
 *
 * ## 왜
 *
 * RollerCoaster Tycoon 은 손님에게 **생각**을 붙여, *"명시적인 지시를 주는 대신"* 플레이어를
 * 안내했다 — 「이 값은 못 내겠어」가 곧 「가격을 내려라」였고, 그 생각들을 **모아 인기순으로
 * 정렬**하는 화면이 사실상 진단 대시보드였다.
 *
 * Pool Slide Story 는 같은 자리를 **SNS** 로 만들었다 — 타임라인(손님이 올리는 글) ·
 * 메시지(요청) · 친구(프로필). 그리고 타임라인의 **Likes 가 구역 해금에 쓰인다** — 장식이 아니다.
 *
 * 우리는 그 자리가 **비어 있었다**. `FeedKind` 에 `'review'` 라는 이름은 있었는데
 * **넣는 곳이 0곳**이었고 `push()` 에는 `kind` 인자조차 없어 모든 항목이 `'news'` 로 떨어졌다
 * (실측 2026-09-01). 「슬롯이 있다」와 「슬롯이 돈다」는 다르다 (P7).
 *
 * ## 개인사는 여전히 0이다 ★
 *
 * ⚠ 계약이 **`1,200 에이전트에 개인사를 붙이지 말 것`** 이다 (K43, 성능). PSS 는 방문객이
 * 훨씬 적어 프로필을 들 수 있지만 우리는 못 든다.
 *
 * 그래서 **지금 상태에서 문장 한 줄을 만들 뿐** 아무것도 기록하지 않는다 —
 * 손님이 나가면 그 말도 같이 사라진다. 필드 0개, 세이브 0바이트.
 *
 * ## sim 은 낱말을 모른다
 *
 * ⚠ 이 모듈은 **주제와 방향**만 낸다 (`topic` · `tone`). 한국어 문장은 UI 가 만든다 —
 * `recipeServeBlock` · 카드 효과 줄과 같은 경계다.
 */
import type { Guest } from './guests.js';
import type { NeedKind } from './week.js';

/** 무엇에 대한 말인가 */
export type VoiceTopic =
  /** 붐빈다 */
  | 'crowd'
  /** 멀다 · 오래 걸었다 */
  | 'walk'
  /** 갈 곳을 못 찾았다 (지금 필요한 종류가 없다) */
  | 'missing'
  /** 못 들어갔다 (정원·매표소) */
  | 'turned'
  /** 즐거웠다 */
  | 'happy'
  /** 무난했다 */
  | 'fine';

export interface GuestVoice {
  topic: VoiceTopic;
  tone: 'good' | 'bad';
  /** 어떤 종류에 대한 말인가 — `missing` 일 때만 있다 */
  need?: NeedKind;
}

/**
 * 오래 걸었다고 볼 문턱 — `stuckTicks` 기준.
 *
 * 값은 **하루 길이에서 유도한다**: 하루가 120tick 이므로 그 1/8(15tick)이면
 * 「한참 헤맸다」로 볼 만하다. 새 눈금을 발명하지 않는다.
 */
export const STUCK_TICKS_LOUD = 15;

/**
 * 만족이 나쁘다고 볼 문턱 — **표정 눈금과 같은 25** 다 (`syncFace` 의 `annoyed`).
 * 화면에서 찡그린 손님이 곧 나쁜 말을 하는 손님이어야 두 신호가 안 어긋난다.
 */
export const VOICE_BAD_BELOW = 25;

/** 만족이 좋다고 볼 문턱 — `syncFace` 의 `happy` 와 같다 */
export const VOICE_GOOD_ABOVE = 75;

/**
 * 이 손님이 지금 무슨 생각을 하나.
 *
 * @param scarce 지금 **공급이 가장 모자란 종류** (결산 병목과 같은 값). 없으면 안 쓴다.
 *   ⚠ 부르는 쪽이 넘긴다 — `voice.ts` 는 배치도 주간 집계도 모른다.
 */
let voiceFault: 'silent' | null = null;

/**
 * 음성 대조군 (Q9) — 켜면 **모두가 「나쁘지 않네」만 말한다.**
 *
 * 「손님이 상태에 따라 다르게 말한다」를 재는 검사가 이 스위치 하나로 무너져야 한다.
 * ⚠ 손으로 한 번 되돌려 확인한 것은 다음 사람에게 안 남는다 — 대조군은 **코드에** 둔다.
 */
export function setVoiceFaultForTest(fault: 'silent' | null): void {
  voiceFault = fault;
}

export function guestVoice(g: Guest, scarce?: NeedKind): GuestVoice {
  if (voiceFault === 'silent') return { topic: 'fine', tone: 'good' };
  // 아직 못 들어온 손님은 판의 상태에 대해 할 말이 없다 (위험도 노출과 같은 규칙)
  if (g.state === 'arriving') return { topic: 'fine', tone: 'good' };
  if (g.stuckTicks >= STUCK_TICKS_LOUD) return { topic: 'walk', tone: 'bad' };
  /*
   * ⚠ **아무것도 못 쓴 손님**이 가장 큰 신호다. `used` 가 0 인데 걷고 있으면 갈 곳이 없다 —
   * 그때만 「무엇이 없다」를 말한다 (그 종류는 부르는 쪽이 안다).
   */
  if (g.used === 0 && g.state === 'walking' && scarce !== undefined) {
    return { topic: 'missing', tone: 'bad', need: scarce };
  }
  if (g.satisfaction < VOICE_BAD_BELOW) return { topic: 'crowd', tone: 'bad' };
  if (g.satisfaction > VOICE_GOOD_ABOVE && g.used > 0) return { topic: 'happy', tone: 'good' };
  return { topic: 'fine', tone: 'good' };
}

/** 한 주에 가장 많이 나온 생각 — 개수와 함께 */
export interface VoiceTally {
  topic: VoiceTopic;
  tone: 'good' | 'bad';
  count: number;
  need?: NeedKind;
}

/**
 * **주간 집계** — RCT 가 생각을 「인기순으로 정렬」한 그 자리.
 *
 * ⚠ 손님 개체를 훑지 않는다. 주간 보고가 **이미 만든 숫자**에서 만든다 —
 * 그래야 1,200 에이전트를 다시 도는 비용이 0 이고, 결산의 다른 줄과 **같은 데이터**를 쓴다
 * (숫자와 말이 어긋나면 둘 중 하나가 거짓말이 된다).
 */
export function weekVoices(input: {
  visitors: number;
  turnedAway: number;
  noTicket: number;
  gaveUp: number;
  exitSatisfaction: number;
  /** 결산 병목이 가리킨 종류 — 없으면 `missing` 을 안 낸다 */
  bottleneck?: NeedKind;
}): VoiceTally[] {
  const out: VoiceTally[] = [];
  const denied = input.turnedAway + input.noTicket;
  if (denied > 0) out.push({ topic: 'turned', tone: 'bad', count: denied });
  if (input.gaveUp > 0) out.push({ topic: 'walk', tone: 'bad', count: input.gaveUp });
  if (input.bottleneck !== undefined && input.visitors > 0) {
    /*
     * 병목은 「모자란 정도」이지 사람 수가 아니다. 방문객의 **절반**을 세어 다른 줄과 크기를
     * 맞춘다 — 정확한 인원이 아니라 **순위**가 이 목록의 쓸모다.
     */
    out.push({
      topic: 'missing',
      tone: 'bad',
      count: Math.max(1, Math.round(input.visitors / 2)),
      need: input.bottleneck,
    });
  }
  if (input.exitSatisfaction >= VOICE_GOOD_ABOVE && input.visitors > 0) {
    out.push({ topic: 'happy', tone: 'good', count: input.visitors });
  }
  // 많이 나온 순 → 같으면 나쁜 말이 먼저 (고칠 것이 먼저 읽혀야 한다) → 그래도 같으면 주제 순 (결정론)
  return out.sort(
    (a, b) =>
      b.count - a.count ||
      Number(a.tone === 'good') - Number(b.tone === 'good') ||
      a.topic.localeCompare(b.topic),
  );
}

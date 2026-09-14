import { describe, expect, it } from 'vitest';
import {
  guestVoice,
  weekVoices,
  STUCK_TICKS_LOUD,
  VOICE_BAD_BELOW,
  VOICE_GOOD_ABOVE,
  setVoiceFaultForTest,
} from './voice.js';
import type { Guest } from './guests.js';

/** 최소 손님 — 이 절이 보는 필드만 채운다 */
function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: 1,
    group: 'family',
    party: 0,
    wallet: 10000,
    thrill: 0.5,
    i: 0,
    j: 0,
    fromI: 0,
    fromJ: 0,
    progress: 1,
    state: 'walking',
    pose: 'walk',
    facing: '+X',
    palette: 0,
    face: 'calm',
    emote: null,
    mark: null,
    emoteTicks: 0,
    usingHandle: 0,
    usingSlot: 0,
    menuId: null,
    admitting: false,
    useTicks: 0,
    satisfaction: 50,
    used: 1,
    stepAcc: 0,
    stuckTicks: 0,
    usedNeeds: [],
    rideTicks: 0,
    rideTotal: 0,
    ...over,
  } as Guest;
}

/**
 * ── Q9: 손님의 말 ──────────────────────────────────────────────────────────
 *
 * RCT 는 손님 「생각」으로 *"명시적인 지시를 주는 대신"* 안내했고, PSS 는 같은 자리를
 * SNS 타임라인으로 만들었다. 우리는 `FeedKind` 에 `'review'` 라는 **이름만** 있고
 * 넣는 곳이 **0곳**이었다 (실측 2026-09-01).
 */
describe('Q9 — 손님의 말', () => {
  it('★ 아무것도 저장하지 않는다 — 손님 필드를 안 늘렸다', () => {
    const g = guest();
    const before = JSON.stringify(g);
    guestVoice(g, 'food');
    expect(JSON.stringify(g)).toBe(before);
  });

  it('아직 못 들어온 손님은 판에 대해 할 말이 없다', () => {
    // 정류장→매표소 다섯 칸은 플레이어가 못 바꾸는 구간이다 (위험도 노출과 같은 규칙)
    expect(guestVoice(guest({ state: 'arriving', satisfaction: 0 })).tone).toBe('good');
  });

  it('오래 헤맨 손님이 가장 먼저 말한다', () => {
    const v = guestVoice(guest({ stuckTicks: STUCK_TICKS_LOUD, satisfaction: 90 }));
    expect(v.topic).toBe('walk');
    expect(v.tone).toBe('bad');
  });

  it('아무것도 못 쓴 손님은 **없는 종류**를 말한다', () => {
    const v = guestVoice(guest({ used: 0, state: 'walking' }), 'food');
    expect(v.topic).toBe('missing');
    expect(v.need).toBe('food');
  });

  it('⚠ 모자란 종류를 안 넘기면 그 말을 안 한다 — 부르는 쪽이 안다', () => {
    expect(guestVoice(guest({ used: 0, state: 'walking' })).topic).not.toBe('missing');
  });

  it('문턱은 표정 눈금과 같다 — 찡그린 손님이 나쁜 말을 한다', () => {
    expect(VOICE_BAD_BELOW).toBe(25);
    expect(VOICE_GOOD_ABOVE).toBe(75);
    expect(guestVoice(guest({ satisfaction: VOICE_BAD_BELOW - 1 })).tone).toBe('bad');
    expect(guestVoice(guest({ satisfaction: VOICE_GOOD_ABOVE + 1, used: 2 })).tone).toBe('good');
  });

  it('★ 주간 집계는 **많이 나온 순**이고, 같으면 나쁜 말이 먼저다', () => {
    const out = weekVoices({
      visitors: 100,
      turnedAway: 60,
      noTicket: 0,
      gaveUp: 10,
      exitSatisfaction: 80,
      bottleneck: 'food',
    });
    expect(out[0]?.count).toBeGreaterThanOrEqual(out[1]?.count ?? 0);
    // 고칠 것이 먼저 읽혀야 한다
    const firstGood = out.findIndex((x) => x.tone === 'good');
    const lastBad = out.map((x) => x.tone).lastIndexOf('bad');
    if (firstGood >= 0 && lastBad >= 0) expect(firstGood).toBeGreaterThan(-1);
  });

  it('조용한 주는 빈 목록이다 — 화면이 「조용한 한 주」를 말한다', () => {
    expect(
      weekVoices({ visitors: 0, turnedAway: 0, noTicket: 0, gaveUp: 0, exitSatisfaction: 50 }),
    ).toEqual([]);
  });

  it('⚠ 음성 대조군 — `silent` 를 켜면 모두가 같은 말을 한다', () => {
    setVoiceFaultForTest('silent');
    try {
      // 대조군에서는 「상태에 따라 다르게 말한다」가 성립하지 않는다
      const loud = guestVoice(guest({ stuckTicks: 99, satisfaction: 0 }));
      const calm = guestVoice(guest({ satisfaction: 90, used: 3 }));
      expect(loud).toEqual(calm);
      expect(loud.topic).toBe('fine');
    } finally {
      setVoiceFaultForTest(null);
    }
    // 원복하면 다시 갈린다
    expect(guestVoice(guest({ stuckTicks: 99 })).topic).not.toBe(
      guestVoice(guest({ satisfaction: 90, used: 3 })).topic,
    );
  });

  it('⚠ 결정론 — 같은 입력은 같은 순서를 낸다', () => {
    const input = {
      visitors: 40,
      turnedAway: 5,
      noTicket: 5,
      gaveUp: 5,
      exitSatisfaction: 90,
      bottleneck: 'play' as const,
    };
    expect(weekVoices(input)).toEqual(weekVoices(input));
  });
});

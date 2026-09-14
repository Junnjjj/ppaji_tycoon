/**
 * 손님의 말 — **낱말** (Q9).
 *
 * ⚠ sim(`voice.ts`)은 **주제와 방향**만 낸다. 한국어 문장은 여기 산다 —
 * `recipeServeBlock`·카드 효과 줄과 같은 경계다 (sim 은 화면 어휘를 모른다).
 *
 * ⚠ **지시문으로 쓰지 말 것.** RCT 가 생각을 붙인 이유는 *"명시적인 지시를 주는 대신"*
 * 이었다 — 「자판기를 지으세요」가 아니라 「목마른데 살 데가 없네」여야 한다.
 * 처방은 결산이 따로 말한다 (그 줄은 그대로 둔다).
 */
import type { GuestVoice, VoiceTally, VoiceTopic } from '../sim/kairo/voice.js';
import { NEED_NAME, withJosa } from './kairo-terms.js';

/** 한 손님이 지금 하는 말 */
const LINES: Record<VoiceTopic, string> = {
  crowd: '사람이 너무 많아…',
  walk: '한참 걸었는데 아직이야',
  missing: '', // 종류가 붙으므로 아래에서 만든다
  turned: '못 들어갔어',
  happy: '여기 좋다!',
  fine: '나쁘지 않네',
};

export function guestVoiceText(v: GuestVoice): string {
  if (v.topic === 'missing') {
    // ⚠ 조사를 종성에서 고른다 — `먹거리 게 없나` 로 나왔었다 (실측)
    const name = v.need === undefined ? '놀 것' : (NEED_NAME[v.need] ?? '놀 것');
    return `${withJosa(name, '이', '가')} 없네…`;
  }
  return LINES[v.topic];
}

/**
 * 주간 집계 한 줄 — 「이번 주 손님들이 가장 많이 한 생각」.
 *
 * ⚠ 인원을 **정확한 수로 읽히게 쓰지 않는다** — `weekVoices` 의 `count` 는 순위를 위한
 * 크기이지 사람 수가 아니다 (병목은 「모자란 정도」이지 인원이 아니다).
 */
export function weekVoiceText(t: VoiceTally): string {
  switch (t.topic) {
    case 'turned':
      return `“못 들어갔어” — ${String(t.count)}명이 돌아갔습니다`;
    case 'walk':
      return `“한참 걸었는데 아직이야” — 가다가 포기한 손님 ${String(t.count)}명`;
    case 'missing': {
      const name = t.need === undefined ? '놀 것' : (NEED_NAME[t.need] ?? '놀 것');
      return `“${withJosa(name, '이', '가')} 없네…” — 가장 많이 나온 아쉬움`;
    }
    case 'happy':
      return '“여기 좋다!” — 손님 대부분이 만족하고 돌아갔습니다';
    case 'crowd':
      return '“사람이 너무 많아…”';
    case 'fine':
      return '“나쁘지 않네”';
  }
}

/**
 * 피드에 올라가는 형태 (Q9) — **손님 말만.**
 *
 * ⚠ 결산 줄을 그대로 올리면 그건 **복창**이고, 「모달 대신 알림함」이 막으려던 소음이다.
 * 결산은 「몇 명이」까지 말하고, 피드는 **그 사람이 한 말**만 남긴다 —
 * PSS 의 타임라인이 통계가 아니라 글인 것과 같다.
 */
export function feedVoiceText(t: VoiceTally): string {
  switch (t.topic) {
    case 'turned':
      return '“못 들어갔어…”';
    case 'walk':
      return '“한참 걸었는데 아직이야”';
    case 'missing': {
      const name = t.need === undefined ? '놀 것' : (NEED_NAME[t.need] ?? '놀 것');
      return `“${withJosa(name, '이', '가')} 없네…”`;
    }
    case 'happy':
      return '“여기 좋다!”';
    case 'crowd':
      return '“사람이 너무 많아…”';
    case 'fine':
      return '“나쁘지 않네”';
  }
}

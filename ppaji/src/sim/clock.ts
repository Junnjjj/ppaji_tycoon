/**
 * 시간 — PSS 구조 그대로: 1계절 = 4일(평일 3 + 주말 1) · 1년 = 16일 · 8년차 겨울 끝 = 종료.
 * 개장 08:00 ~ 폐장 20:00 = 12시간 = 하루 1,680 tick (1 tick = 게임 25.7초 = 실시간 125ms) → **하루 210초**.
 * P18 D26: 저녁 구간은 **18~20시**(하루의 1/6) — 22시까지 늘려 봤더니(120 tick/h) 유입 창·체류가 같이 압축돼 소원 만료비가 3.0 → 3.33 으로 깨졌다. 밤은 숙박 손님이 폐장 뒤 자리에서 지내는 것으로 잇는다.
 * (G22: 90초 → 210초. PSS 실측 본편 ≈10h ÷ 128일 = 하루 4.7분 — 7~8h 목표면 3.5분. 걸음 속도는 tick 당이라 그대로고, 체류·유입은 balance 가 하루 기준으로 맞춘다)
 * 순수 변환만 있다 — 상태는 `Game` 이 든다.
 */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
/** 하루 길이는 고정 (D2·D26) — 210초 */
export const TICKS_PER_DAY = 1680;
export const TICKS_PER_HOUR = TICKS_PER_DAY / (CLOSE_HOUR - OPEN_HOUR); // 140
/** P18 저녁 구간 — 18시부터 조명·불멍·밤 틴트 */
export const EVENING_HOUR = 18;
export const EVENING_TICK = (EVENING_HOUR - OPEN_HOUR) * TICKS_PER_HOUR;
/** 옛 「1 tick = 1분」 눈금 대비 배율 — 데이터의 `useTicks`·`hours` 같은 분 단위 값을 tick 으로 바꿀 때 곱한다 */
export const TICK_SCALE = TICKS_PER_HOUR / 60;
/** 폐장 1시간 전 (G34) — 새 손님이 안 오고 남은 손님은 입구로 걸어 나간다 */
export const CLOSING_TICK = TICKS_PER_DAY - TICKS_PER_HOUR;
export const DAYS_PER_SEASON = 4;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR; // 16
export const FINAL_YEAR = 8;
export const TOTAL_DAYS = DAYS_PER_YEAR * FINAL_YEAR; // 128
export const TICK_MS = 125;

export const SEASON_NAMES = ['봄', '여름', '가을', '겨울'] as const;
export type Season = 0 | 1 | 2 | 3;

/** 상점 입고 17:00 · 심사 15:00 · 손님 유입 창 — 전부 tick 으로 */
export const SHOP_RESTOCK_TICK = (17 - OPEN_HOUR) * TICKS_PER_HOUR;
export const JUDGE_TICK = (15 - OPEN_HOUR) * TICKS_PER_HOUR;
export const ARRIVAL_FROM_TICK = (9 - OPEN_HOUR) * TICKS_PER_HOUR;
export const ARRIVAL_TO_TICK = (18 - OPEN_HOUR) * TICKS_PER_HOUR;

export interface ClockView {
  day: number;
  tick: number;
  year: number;
  season: Season;
  seasonName: string;
  dayInSeason: number;
  isWeekend: boolean;
  hour: number;
  minute: number;
  clock: string;
  daypart: string;
  /** P18 저녁 구간(18시~) */
  isEvening: boolean;
  ended: boolean;
}

export function seasonOf(day: number): Season {
  return (Math.floor(day / DAYS_PER_SEASON) % SEASONS_PER_YEAR) as Season;
}

export function yearOf(day: number): number {
  return Math.floor(day / DAYS_PER_YEAR) + 1;
}

export function isWeekend(day: number): boolean {
  return day % DAYS_PER_SEASON === DAYS_PER_SEASON - 1;
}

export function clockView(day: number, tick: number): ClockView {
  const t = Math.max(0, Math.min(TICKS_PER_DAY, tick));
  const hour = OPEN_HOUR + Math.floor(t / TICKS_PER_HOUR);
  const minute = Math.floor((t % TICKS_PER_HOUR) * 60 / TICKS_PER_HOUR);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const dayInSeason = day % DAYS_PER_SEASON;
  const weekend = isWeekend(day);
  return {
    day,
    tick: t,
    year: yearOf(day),
    season: seasonOf(day),
    seasonName: SEASON_NAMES[seasonOf(day)],
    dayInSeason,
    isWeekend: weekend,
    hour,
    minute,
    clock: `${hour < 12 ? 'AM' : 'PM'} ${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    daypart: weekend ? '주말' : `평일 ${dayInSeason + 1}/${DAYS_PER_SEASON - 1}`,
    isEvening: hour >= EVENING_HOUR,
    ended: day >= TOTAL_DAYS,
  };
}

/**
 * 사장 달력 — 「Y1 봄 주말에 사장이 튜브를 준다」 같은 날짜 있는 사건. 조건(`when`)이 있으면 그때까지
 * 충족돼야 오고, 아니면 **다음 같은 날짜**로 미뤄지지 않고 그냥 지나간다 (PSS 그대로: 첫 인증 뒤 이동 도구).
 * 이미 준 사건 id 는 저장한다.
 */
import type { CalendarEvent, Condition } from '../data/schema.js';
import type { Verdict } from './condition.js';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from './clock.js';

export function eventDay(e: CalendarEvent): number {
  return (e.year - 1) * DAYS_PER_YEAR + e.season * DAYS_PER_SEASON + e.dayInSeason;
}

/** 이 시각에 올 사건들 (아직 안 준 것) */
export function dueEvents(events: readonly CalendarEvent[], day: number, tick: number, given: ReadonlySet<string>, evaluateCond: (c: Condition) => Verdict, ctx: { firstCertPassDay: number | null } = { firstCertPassDay: null }): CalendarEvent[] {
  return events.filter((e) => {
    if (given.has(e.id) || e.tick !== tick) return false;
    if (e.afterCertDays !== undefined) return ctx.firstCertPassDay !== null && day === ctx.firstCertPassDay + e.afterCertDays && (!e.when || evaluateCond(e.when).met);
    return eventDay(e) === day && (!e.when || evaluateCond(e.when).met);
  });
}

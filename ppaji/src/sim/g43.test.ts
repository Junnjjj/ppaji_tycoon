import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS, CALENDAR_EVENTS, RANK_DEFS } from './game.js';
import { TICKS_PER_DAY } from './clock.js';
import { dueEvents } from './calendar.js';

/** G43 — 사장 선물 실물(비치체어·화분) · 시작 시설 원작 구성 · 첫 합격 뒤 9일째 이동 도구 */
describe('G43 사장 선물 · 시작 시설', () => {
  it('비치체어·화분은 gift 출처, 샤워는 소원, 유수풀은 ★1, 주스 가게는 상점 — 시작 해금이 아니다', () => {
    expect(FACILITY_DEFS.get('shade_net')!.unlock).toEqual({ source: 'gift', ref: 'calendar_y1_spring_chair' });
    expect(FACILITY_DEFS.get('photozone')!.unlock).toEqual({ source: 'gift', ref: 'calendar_y1_spring_pot' });
    expect(FACILITY_DEFS.get('shower_row')!.unlock.source).toBe('wish');
    expect(FACILITY_DEFS.get('diving')!.unlock).toEqual({ source: 'rank', rank: 1 });
    expect(FACILITY_DEFS.get('sikhye')!.unlock).toEqual({ source: 'shop', rank: 1 });
    expect(RANK_DEFS[0]!.reward).toEqual({ kind: 'facility', id: 'diving' });
    const g = new Game(51, undefined, { kit: false });
    for (const id of ['shower_row', 'diving', 'sikhye', 'shade_net', 'photozone']) expect(g.unlocked.facilities.has(id), id).toBe(false);
  });
  it('첫날 폐장 직전 화분, 첫 주말 10시 비치체어가 온다', () => {
    const g = new Game(52, undefined, { kit: false });
    g.step(1661);
    expect(g.unlocked.facilities.has('photozone')).toBe(true);
    g.step(TICKS_PER_DAY * 3 - 1661 + 281);
    expect(g.day).toBe(3);
    expect(g.unlocked.facilities.has('shade_net')).toBe(true);
  });
  it('이동 도구는 첫 합격 뒤 9일째 개장에 온다 (날짜가 아니라 합격일 기준)', () => {
    const move = CALENDAR_EVENTS.find((e) => e.id === 'calendar_y1_autumn_move')!;
    expect(move.afterCertDays).toBe(9);
    const ok = () => ({ met: true, progress: 1, actual: 1, need: 1, label: '' });
    expect(dueEvents([move], 8 + 9, 0, new Set(), ok, { firstCertPassDay: 8 }).length).toBe(1);
    expect(dueEvents([move], 8 + 8, 0, new Set(), ok, { firstCertPassDay: 8 }).length).toBe(0);
    expect(dueEvents([move], 11, 0, new Set(), ok, { firstCertPassDay: null }).length).toBe(0); // 옛 날짜(가을 주말)로는 안 온다
  });
});

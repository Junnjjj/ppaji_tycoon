import { describe, it, expect } from 'vitest';
import { Game, CERT_DEFS, WISH_DEFS, CALENDAR_EVENTS, FACILITY_DEFS } from './game.js';
import { hasRigCond, certHasRigCond, RIG_COND_KINDS } from './bot.js';
import { eventDay } from './calendar.js';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from './clock.js';
import type { Condition } from '../data/schema.js';

const leaves = (c: Condition): Condition[] => (c.kind === 'all' || c.kind === 'any') ? c.of.flatMap(leaves) : [c];

describe('P53-a 인증·소원·달력 재배선 — 조건 4종 · 교착 0 · 연차 폴백', () => {
  it('인증 — 기구 조건을 든 인증 9 · 종류 4 전부 쓰인다 · 등급 ≤4 · 사슬 ≤8(봇 상한) · 개수 ≤20 · 진입 인증(grade_f)은 시작 기구 2종으로 닫힌다', () => {
    const rigCerts = CERT_DEFS.filter(certHasRigCond);
    expect(rigCerts.map((c) => c.id).sort()).toEqual(['fun_a', 'fun_c', 'grade_a', 'grade_b', 'grade_d', 'grade_f', 'grade_s', 'stream_b', 'stream_d']); // 9 (§4.5)
    const kinds = new Set<string>();
    for (const c of rigCerts) for (const w of c.conditions) for (const l of leaves(w.cond)) if (RIG_COND_KINDS.has(l.kind)) {
      kinds.add(l.kind);
      if (l.kind === 'rigGrade') expect(l.min, c.id).toBeLessThanOrEqual(4);
      if (l.kind === 'rigChain') expect(l.min, c.id).toBeLessThanOrEqual(8);
      if (l.kind === 'rigCount') { expect(l.min, c.id).toBeLessThanOrEqual(20); if (l.kinds !== undefined) expect(l.kinds, c.id).toBeLessThanOrEqual(l.min); }
    }
    expect([...kinds].sort()).toEqual(['rigChain', 'rigCount', 'rigGrade', 'rigGuarded']);
    // 교착 0 — 진입 인증은 시작 해금 기구만으로 (grade_f: rigCount 2)
    const startRigs = [...FACILITY_DEFS.values()].filter((d) => d.class === 'rig' && d.buildable !== false && d.unlock.source === 'start');
    expect(startRigs.length).toBeGreaterThanOrEqual(2);
    const f = CERT_DEFS.find((c) => c.id === 'grade_f')!;
    expect(f.conditions.some((w) => w.cond.kind === 'rigCount' && w.cond.min <= startRigs.length)).toBe(true);
    // 여울·깊은 물 조건(grade_d)은 ★2 안에 여는 기구로 채울 수 있다
    const early = [...FACILITY_DEFS.values()].filter((d) => d.class === 'rig' && d.buildable !== false && (d.unlock.source === 'start' || (d.unlock.source === 'rank' && (d.unlock.rank ?? 99) <= 2)));
    expect(early.filter((d) => d.depth === 'shallow' || d.depth === 'any').length).toBeGreaterThanOrEqual(2);
    expect(early.filter((d) => d.depth === 'deep' || d.depth === 'any').length).toBeGreaterThanOrEqual(2);
  });

  it('소원 — 기구 조건 소원 20 (rigCount 8 · rigChain 7 · rigGrade 5) · 대사에 기구/이어/등급 · 친구 안에서 난이도가 내려가지 않는다 · 부품 보상 둘 · 키디의 수역 소원은 그대로', () => {
    const rig = WISH_DEFS.filter((w) => hasRigCond(w.condition));
    expect(rig.length).toBe(20);
    const tally = { rigCount: 0, rigChain: 0, rigGrade: 0 } as Record<string, number>;
    for (const w of rig) {
      tally[w.condition.kind] = (tally[w.condition.kind] ?? 0) + 1;
      const word = w.condition.kind === 'rigCount' ? '기구' : w.condition.kind === 'rigChain' ? '이어' : '등급';
      expect(w.line, `${w.friendId}/${w.idx}`).toContain(word);
      expect(w.friendId).not.toBe('kiddie');
    }
    expect(tally).toEqual({ rigCount: 8, rigChain: 7, rigGrade: 5 });
    const tier = (c: Condition): number => c.kind === 'rigCount' ? (c.min <= 2 ? 0 : 1) : c.kind === 'rigChain' ? 2 : 3;
    const byFriend = new Map<string, typeof rig>();
    for (const w of rig) byFriend.set(w.friendId, [...(byFriend.get(w.friendId) ?? []), w]);
    for (const [f, ws] of byFriend) {
      expect(ws.length, f).toBeLessThanOrEqual(2);
      const ts = ws.sort((a, b) => a.idx - b.idx).map((w) => tier(w.condition));
      expect(ts, f).toEqual([...ts].sort((a, b) => a - b));
    }
    expect(rig.filter((w) => w.reward.kind === 'rigPart').map((w) => w.reward.kind === 'rigPart' ? w.reward.id : '').sort()).toEqual(['float_drum', 'slip_wax']);
    const kid = WISH_DEFS.filter((w) => w.friendId === 'kiddie' && w.condition.kind === 'pool').map((w) => w.condition.kind === 'pool' ? w.condition.sizeMin : 0);
    expect(kid).toEqual([20, 40, 60]);
  });

  it('달력 — 연차 폴백 8: 해마다 겨울 둘째 날 tick 280 에 조건 없이(when 없음) 부품/기구 하나 · 자리 유일 · 총 40', () => {
    expect(CALENDAR_EVENTS.length).toBe(40);
    const fb = CALENDAR_EVENTS.filter((e) => e.priority === 'strip');
    expect(fb.length).toBe(8);
    expect(fb.map((e) => e.year).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const e of fb) { expect(e.when, e.id).toBeUndefined(); expect(e.season).toBe(3); expect(e.tick).toBe(280); expect(['rigPart', 'facility']).toContain(e.grant.kind); expect(e.from).toBe('president'); }
    const slots = CALENDAR_EVENTS.map((e) => `${eventDay(e)}/${e.tick}`);
    expect(new Set(slots).size).toBe(slots.length);
    expect(new Set(CALENDAR_EVENTS.map((e) => e.id)).size).toBe(40);
  });

  it('멈춘 판 — 랭크를 ★0 에 묶어도 1·2년차 겨울 택배가 온다 (rankCapForTest) · 폴백 소식은 티커(strip)', () => {
    const g = new Game(7); g.rankCapForTest = 0; g.money = 5e5; // 새 판은 ★0 — 거기서 묶는다
    const y1 = CALENDAR_EVENTS.find((e) => e.priority === 'strip' && e.year === 1)!, y2 = CALENDAR_EVENTS.find((e) => e.priority === 'strip' && e.year === 2)!;
    const target = DAYS_PER_YEAR + eventDay(y2) - DAYS_PER_YEAR + 1; // 2년차 겨울 둘째 날 다음 날
    for (let d = 0; d < target; d++) g.step(TICKS_PER_DAY);
    expect(g.rank).toBe(0);
    expect(g.calendarGiven.has(y1.id)).toBe(true);
    expect(g.calendarGiven.has(y2.id)).toBe(true);
    const items = g.inbox.all.filter((m) => m.title.startsWith('겨울 택배'));
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const m of items) expect(m.priority).toBe('strip');
    if (y1.grant.kind === 'rigPart') expect(g.rigs.owned.has(y1.grant.id!)).toBe(true);
  });
});

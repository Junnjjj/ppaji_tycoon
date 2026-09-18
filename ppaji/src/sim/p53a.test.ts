import { describe, it, expect } from 'vitest';
import { Game, CERT_DEFS, WISH_DEFS, CALENDAR_EVENTS, FACILITY_DEFS, RIG_PART_DEFS } from './game.js';
import { hasRigCond, certHasRigCond, RIG_COND_KINDS } from './bot.js';
import { eventDay } from './calendar.js';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from './clock.js';
import type { Condition } from '../data/schema.js';

const leaves = (c: Condition): Condition[] => (c.kind === 'all' || c.kind === 'any') ? c.of.flatMap(leaves) : [c];

describe('P53-a 인증·소원·달력 재배선 — 조건 4종 · 교착 0 · 연차 폴백', () => {
  it('인증 — 기구 조건을 든 인증 9 + P60-a 세트 3(set_f/d/b: 옛 물빛 조건 → P60-c 부터 rigSet 1/2/3) · 종류 5 전부 쓰인다 · 등급 ≤4 · 사슬 ≤8(봇 상한) · 개수 ≤20 · 진입 인증(grade_f)은 시작 기구 2종으로 닫힌다', () => {
    const rigCerts = CERT_DEFS.filter(certHasRigCond);
    expect(rigCerts.map((c) => c.id).sort()).toEqual(['fun_a', 'fun_c', 'grade_a', 'grade_b', 'grade_d', 'grade_f', 'grade_s', 'set_b', 'set_d', 'set_f', 'stream_b', 'stream_d']); // 9 (§4.5) + 3 (P60-a §10.1: color_* → set_*, pool.color → rigCount → P60-c rigSet)
    const kinds = new Set<string>();
    for (const c of rigCerts) for (const w of c.conditions) for (const l of leaves(w.cond)) if (RIG_COND_KINDS.has(l.kind)) {
      kinds.add(l.kind);
      if (l.kind === 'rigGrade') expect(l.min, c.id).toBeLessThanOrEqual(4);
      if (l.kind === 'rigPath') expect(l.min, c.id).toBeLessThanOrEqual(8); // P60-d: rigChain → rigPath(경로 길이)
      if (l.kind === 'rigCount') { expect(l.min, c.id).toBeLessThanOrEqual(20); if (l.kinds !== undefined) expect(l.kinds, c.id).toBeLessThanOrEqual(l.min); }
    }
    expect([...kinds].sort()).toEqual(['rigCount', 'rigGrade', 'rigGuarded', 'rigPath', 'rigSet']); // P60-c: set_f/d/b 가 rigSet(한 빠지에 세트 n) 으로 · P60-d: rigChain → rigPath
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

  it('소원 — 기구 조건 소원 102 (P53-a 원 20: rigPath(옛 rigChain) 7 · rigGrade 5 · rigCount 8 + P60-a 재배선 82: 소품·물빛·농도 조건 → rigCount/rigGrade) · 대사에 기구/이어/등급 · 부품 보상은 shop-tier 안 · 키디의 수역 소원은 그대로', () => {
    const rig = WISH_DEFS.filter((w) => hasRigCond(w.condition));
    expect(rig.length).toBe(102); // P60-a §10.1: item 18 + pool.color 64 + intensityMin 2 (일부는 같은 소원) 가 기구 조건으로 — 실측 (tools/migrate-wishes.mjs 요약)
    const tally = { rigCount: 0, rigPath: 0, rigGrade: 0, all: 0 } as Record<string, number>;
    const leafTally = { rigCount: 0, rigPath: 0, rigGrade: 0 } as Record<string, number>;
    for (const w of rig) {
      tally[w.condition.kind] = (tally[w.condition.kind] ?? 0) + 1;
      for (const l of leaves(w.condition)) if (RIG_COND_KINDS.has(l.kind)) {
        leafTally[l.kind] = (leafTally[l.kind] ?? 0) + 1;
        const word = l.kind === 'rigCount' ? '기구' : l.kind === 'rigPath' ? '이어' : '등급';
        expect(w.line, `${w.friendId}/${w.idx}`).toContain(word);
      }
      expect(w.friendId).not.toBe('kiddie');
    }
    expect(tally).toEqual({ rigCount: 29, rigPath: 7, rigGrade: 5, all: 61 }); // P53-a 의 rigChain(→ P60-d rigPath) 7 · rigGrade 5 는 그대로 · rigCount 8 → 29 · 복합(all) 61 은 전부 P60-a
    expect(leafTally).toEqual({ rigCount: 90, rigPath: 7, rigGrade: 7 });
    const byFriend = new Map<string, typeof rig>();
    for (const w of rig) byFriend.set(w.friendId, [...(byFriend.get(w.friendId) ?? []), w]);
    for (const [f, ws] of byFriend) expect(ws.length, f).toBeLessThanOrEqual(3); // P53-a 는 친구당 ≤2 였다 — P60-a 가 소원 자리(idx)를 지키며 조건만 갈아 끼워 셋까지 온다. 친구 안 난이도 오름차순은 그래서 더 이상 성립하지 않는다(옛 소품 「1개」 조건이 rigCount 1 로 들어온다)
    const shopTier = new Set(RIG_PART_DEFS.filter((p) => p.unlock === 'shop').map((p) => p.id));
    const parts = rig.filter((w) => w.reward.kind === 'rigPart').map((w) => w.reward.kind === 'rigPart' ? w.reward.id : '');
    for (const id of parts) expect(shopTier.has(id), id).toBe(true); // P53-a 의 float_drum·slip_wax 둘을 포함해 shop-tier 9종 안에서만 (연차 부품은 소원 보상이 아니다 — data.test 가 같은 규칙을 wishes 전체에 건다)
    expect(new Set(parts).has('float_drum') && new Set(parts).has('slip_wax')).toBe(true);
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

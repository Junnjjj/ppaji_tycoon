import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, FACILITY_DEFS } from './game.js';
import { accidentChance, hazardOf, riskLevel, RISK_LABELS, BRIEFED_MUL } from './accident.js';
import { runBot, BOT_DEFAULTS } from './bot.js';
import balance from '../data/balance.json';

const B = balance as { accidentBase: number; accidentFloor: number; accidentMul: { noVest: number; guard: number; rescue: number; cold: number } };
const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if ((d.class === 'rig' || d.onRing) && d.buildable !== false) g.unlocked.facilities.add(d.id); return g; };

describe('P52-b 사고', () => {
  it('accidentChance — 순서(hazard × 조끼 × 망루 × 구조정 × 브리핑 × 수온 × 혼잡) · 바닥 표 6행(위험 모양에만) · 위험 단계 4', () => {
    // 바닥 표: (thrill, safe) → hazard
    const rows: [number, number, number][] = [
      [0, 2, 0],                                   // 위험 모양 아님 — 바닥도 없다(코스 안전 100 이라 망루·브리핑이 헛돈다는 그 자리)
      [1, 2, Math.max(B.accidentFloor, B.accidentBase * 0.25 * 0.5)],
      [2, 1, Math.max(B.accidentFloor, B.accidentBase * 0.5 * 0.75)],
      [3, 1, Math.max(B.accidentFloor, B.accidentBase * 0.75 * 0.75)],
      [4, 0, B.accidentBase],
      [1, 4, B.accidentFloor],                     // 안전 4 → 바닥
    ];
    for (const [t, s, h] of rows) expect(hazardOf(t, s, B), `${t}/${s}`).toBeCloseTo(h, 6);
    const base = { thrill: 4, safe: 0, vest: true, guarded: false, rescued: false, briefed: false, cold: false, busy: 2, cap: 2 };
    expect(accidentChance(base, B)).toBeCloseTo(B.accidentBase, 6);
    expect(accidentChance({ ...base, vest: false }, B)).toBeCloseTo(B.accidentBase * B.accidentMul.noVest, 6);
    expect(accidentChance({ ...base, guarded: true }, B)).toBeCloseTo(B.accidentBase * B.accidentMul.guard, 6);
    expect(accidentChance({ ...base, rescued: true }, B)).toBeCloseTo(B.accidentBase * B.accidentMul.rescue, 6);
    expect(accidentChance({ ...base, briefed: true }, B)).toBeCloseTo(B.accidentBase * BRIEFED_MUL, 6);
    expect(accidentChance({ ...base, cold: true }, B)).toBeCloseTo(B.accidentBase * B.accidentMul.cold, 6);
    expect(accidentChance({ ...base, busy: 0 }, B)).toBeCloseTo(B.accidentBase * 0.5, 6);
    expect(accidentChance({ ...base, busy: 9 }, B)).toBeCloseTo(B.accidentBase * 1.5, 6);
    expect(accidentChance({ ...base, thrill: 0 }, B)).toBe(0);
    expect([0.003, 0.005, 0.01, 0.02].map(riskLevel)).toEqual([0, 1, 2, 3]);
    expect(RISK_LABELS).toEqual(['안전', '주의', '경계', '위험']);
  });

  it('망루는 알바가 있어야 지킨다(없으면 효과 0) · 구조정은 같은 수역 · 위험 단계가 망루로 한 단 내려간다 · 브리핑 토글은 optional 저장', () => {
    const g = fresh();
    expect(g.placeFacility('rig_blob', 51, 27, 0).ok).toBe(true); // 3×1 깊은 물 · 스릴 3 안전 1
    const blob = g.facilities.all.find((f) => f.defId === 'rig_blob')!, def = g.facilities.defOf(blob);
    const r0 = g.riskOf(def, blob.i, blob.j, blob.facing, blob.uid);
    expect(g.accidentContext(def, blob.i, blob.j, blob.facing, blob.uid).guarded).toBe(false);
    const t = g.placeFacility('watchtower', 50, 26, 0); expect(t.ok, JSON.stringify(t)).toBe(true); // 링 데크 — 반경 6 안
    expect(g.accidentContext(def, blob.i, blob.j, blob.facing, blob.uid).guarded).toBe(false); // 알바 없음 → 0
    expect(g.riskOf(def, blob.i, blob.j, blob.facing, blob.uid).p).toBeCloseTo(r0.p, 9);
    expect(g.setStaffed(t.uid!, true).ok).toBe(true);
    const r1 = g.riskOf(def, blob.i, blob.j, blob.facing, blob.uid);
    expect(g.accidentContext(def, blob.i, blob.j, blob.facing, blob.uid).guarded).toBe(true);
    expect(r1.p).toBeCloseTo(r0.p * B.accidentMul.guard, 9);
    expect(r1.level).toBeLessThan(r0.level); // 한 단 하강
    const rd = g.placeFacility('rescue_dock', 52, 23, 1); expect(rd.ok, JSON.stringify(rd)).toBe(true); // 킷 링 윗줄(행 23 뭍, 물에 닿는다) 가로 2×1 — 링 안 데크를 안 가른다(동쪽 링에 두면 망루 뒤가 고립된다)
    expect(g.accidentContext(def, blob.i, blob.j, blob.facing, blob.uid).rescued).toBe(true);
    // 브리핑
    const sg = g.suggestCourse(); expect(sg.ok, JSON.stringify(sg)).toBe(true);
    if (sg.ok) { const pc = g.placeCourse(sg.draft); expect(pc.ok, JSON.stringify(pc)).toBe(true); }
    const c = g.courses.all[0]; expect(c).toBeTruthy();
    expect(g.setCourseBriefing(c!.handle, true).ok).toBe(true);
    const snap = JSON.parse(JSON.stringify(g.toSnapshot())) as Parameters<typeof Game.fromSnapshot>[0];
    expect(Game.fromSnapshot(snap).courses.all[0]!.safetyBriefing).toBe(true);
    expect(g.setCourseBriefing(c!.handle, false).ok).toBe(true);
    expect(JSON.stringify(g.toSnapshot())).not.toContain('safetyBriefing');
  });

  it('정적 — 뽑기 자리 둘(기구 가지 · 선착장 가지, `rng.accident.next()` 정확히 2) · guest.ts 의 rng 줄은 안 바뀐다(accident 0건)', () => {
    const game = readFileSync(new URL('./game.ts', import.meta.url), 'utf8');
    expect((game.match(/this\.rng\.accident\.next\(\)/g) ?? []).length).toBe(3); // 기구 가지 · 선착장 가지 + P52-c 장마 유실(기구마다 1회) — 셋 다 전용 스트림
    const guest = readFileSync(new URL('./guest.ts', import.meta.url), 'utf8');
    expect(guest.includes('accident')).toBe(false);
  });

  it('사고 효과 — hp −35 · 만족 −20 · 수역 인기 감쇠(반감) · 하루 상한 3 · stats.accidents', () => {
    const g = fresh();
    expect(g.placeFacility('rig_blob', 51, 27, 0).ok).toBe(true);
    const blob = g.facilities.all.find((f) => f.defId === 'rig_blob')!;
    let guest = null as ReturnType<typeof g.guests.all.find> | null;
    for (let k = 0; k < 40 && !guest; k++) { g.step(60); guest = g.guests.all[0] ?? null; }
    expect(guest).not.toBeNull();
    const pid = g.poolOfFacility(blob.uid)!; const pop0 = g.poolState(pid)!.popularity;
    const hp0 = guest!.hp, sat0 = guest!.sat;
    const priv = g as unknown as { applyAccident: (x: unknown, f: unknown, w: string) => boolean };
    expect(priv.applyAccident(guest, blob, '검사')).toBe(true);
    expect(guest!.hp).toBe(Math.max(0, hp0 - 35)); expect(guest!.sat).toBe(Math.max(0, sat0 - 20));
    expect(g.stats.accidents).toBe(1);
    expect(g.poolState(pid)!.popularity).toBeLessThan(pop0);
    expect(priv.applyAccident(guest, blob, '검사')).toBe(true); expect(priv.applyAccident(guest, blob, '검사')).toBe(true);
    expect(priv.applyAccident(guest, blob, '검사')).toBe(false); // 하루 상한 3 — 뽑기는 하고 결과를 버린다
    expect(g.stats.accidents).toBe(3);
  });

  it('봇 32일 — accidentBase·Floor 0 대조군은 사고 0 · 스트림은 소비된다(뽑기는 하고 결과를 버린다) · 기본은 사고가 난다', () => {
    const on = new Game(2); runBot(on, 32, BOT_DEFAULTS);
    const off = new Game(2, { ...balance, accidentBase: 0, accidentFloor: 0 } as unknown as ConstructorParameters<typeof Game>[1]); runBot(off, 32, BOT_DEFAULTS);
    expect(off.stats.accidents ?? 0).toBe(0);
    expect(off.rng.accident.state).not.toBe(new Game(2).rng.accident.state); // 확률 0 이어도 뽑기는 한다
    expect(on.stats.accidents ?? 0).toBeGreaterThan(0);
    // §6 「대조군 스트림 동일」은 성립하지 않는다 — 사고가 손님 hp·만족·목적지를 바꿔 이용 수(= 뽑기 수)가 갈린다. 「뽑기 수 = 이용 수」 항등은 정적 항(뽑기 자리 둘)이 지킨다
  }, 120000);
});

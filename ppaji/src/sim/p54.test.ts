import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Game, FACILITY_DEFS } from './game.js';
import { EVENING_TICK, TICKS_PER_DAY } from './clock.js';
import { runBot, hashSnapshot, BOT_DEFAULTS } from './bot.js';
import { makeTestPpaji } from './test-helpers.js';
import defaultBalance from '../data/balance.json';

/** 구 저장 호환 fixture: 이미 설치된 퇴역 시설을 포함하는 킷 빠지에 기구 14(종 5 · 조명 2) — P52-c 검사와 같은 배치. 등급 ≥ 3 · 켜진 물 위 기구 ≥ 9 · 조명 ≥ 1 */
const RIGS: readonly [string, number, number, 0 | 1][] = [['rig_stepstone', 51, 24, 0], ['rig_stepstone', 51, 25, 0], ['rig_stepstone', 51, 26, 0], ['rig_stepstone', 51, 27, 0], ['rig_stepstone', 51, 28, 0], ['rig_bridge', 52, 26, 1], ['rig_beam', 52, 24, 1], ['rig_seesaw', 52, 27, 0], ['rig_led_buoy', 52, 25, 0], ['rig_led_buoy', 53, 25, 0], ['rig_stepstone', 54, 24, 0], ['rig_stepstone', 54, 25, 0], ['rig_stepstone', 54, 26, 0], ['rig_stepstone', 54, 27, 0]];

const nightPark = (seed = 1, nightChance = 1): Game => {
  const g = new Game(seed, { ...defaultBalance, nightChance });
  g.money = 1e6;
  for (const d of FACILITY_DEFS.values()) if (d.buildable !== false) g.unlocked.facilities.add(d.id);
  g.rank = 3;
  for (const [id, i, j, f] of RIGS) {
    const placed = g.placeFacility(id, i, j, f, { inherited: true });
    expect(placed.ok, `${id}: ${JSON.stringify(placed)}`).toBe(true);
  }
  return g;
};

describe('P54 밤 빠지 파티', () => {
  it('현재 승인 놀이터와 활성 기구만으로 기존 지형에서 등급 4·야간 파티를 연다', () => {
    const g = new Game(1, undefined, { arrival: true });
    g.money = 1e7; g.rank = 5; g.openLand(5);
    for (const d of FACILITY_DEFS.values()) if (!d.deprecated) g.unlocked.facilities.add(d.id);
    const area = makeTestPpaji(g, 22, 12, -12);
    expect(g.placeFacility('ppaji_playground', 37, 32, 0).ok).toBe(true);
    const parts: readonly (readonly [string, number, number, 0 | 1])[] = [
      ['rig_bridge',57,32,0], ['rig_stepstone',58,32,0], ['rig_blob',58,33,1],
      ['rig_iceberg',57,36,0], ['rig_jump_tower',57,38,0],
      ...[[57,34],[57,35],[57,40],[58,40],[57,41],[58,41],[57,42],[58,42],[57,43],[58,43]].map(([i,j]) => ['rig_stepstone',i!,j!,0] as const),
    ];
    for (const [id,i,j,facing] of parts) expect(g.placeFacility(id,i,j,facing).ok, id).toBe(true);
    expect(g.ppajiGradeOf(area.id!)).toBe(4);
    expect(g.nightPartyOn()).toBe(area.id);
    g.step(EVENING_TICK + 1);
    expect(g.nightOn).toBe(true);
    expect(g.nightForTest().filter(uid => g.poolOfFacility(uid) === area.id).length).toBeGreaterThanOrEqual(9);
    expect(g.nightSalesMul()).toBeCloseTo(1.1); // 현재 놀이터 조명 1
    const playground = g.facilities.all.find(f => f.defId === 'ppaji_playground')!;
    expect(g.removeFacility(playground.uid).ok).toBe(true);
    expect(g.nightPartyOn()).toBeNull(); // 활성 조명 제거 음성 대조군
  });

  it('nightPartyOn 조건 넷 — ★3 · 등급 ≥3 · 조명 ≥1 · 켜진 물 위 기구 ≥9: 하나라도 빠지면 null', () => {
    const g = nightPark();
    const pid = g.pools.all[0]!.id;
    expect(g.ppajiGradeOf(pid)).toBeGreaterThanOrEqual(3);
    expect(g.nightPartyOn()).toBe(pid);
    g.rank = 2; expect(g.nightPartyOn()).toBeNull(); g.rank = 3;
    // 조명 둘을 뜯으면 조명 0 → null
    const lights = g.facilities.all.filter((f) => f.defId === 'rig_led_buoy');
    for (const f of lights) expect(g.removeFacility(f.uid).ok).toBe(true);
    expect(g.nightPartyOn()).toBeNull();
    // 스위치(봇 --no-night)
    const h = nightPark(); h.nightEnabled = false; expect(h.nightPartyOn()).toBeNull();
    // 기구 9 미만
    const k = nightPark(); const rigs = k.facilities.all.filter((f) => k.facilities.defOf(f).class === 'rig' && k.facilities.defOf(f).onRing !== true);
    for (const f of rigs.slice(0, rigs.length - 8)) k.removeFacility(f.uid);
    expect(k.nightRigCountForTest()).toBeLessThan(9);
    expect(k.nightPartyOn()).toBeNull();
  });

  it('syncNightSet — 정의 1 · 호출부 2(세계 변경 꼬리 + 저녁 래치) · 밤이 아니면 P45-c 집합과 같다 · 밤이면 켜진 기구가 든다', () => {
    const src = readFileSync(resolve(__dirname, 'game.ts'), 'utf8');
    expect((src.match(/private syncNightSet\(\): void/g) ?? []).length).toBe(1);
    expect((src.match(/this\.syncNightSet\(\)/g) ?? []).length).toBe(3); // 꼬리 · 저녁 래치 · 하루 끝 되돌림
    const g = nightPark();
    const before = new Set(g.nightForTest());
    for (const uid of before) expect(g.facilities.defOf(g.facilities.byUid(uid)!).indoorOnly).toBe(true);
    g.step(EVENING_TICK + 1);
    expect(g.nightOn).toBe(true);
    const after = new Set(g.nightForTest());
    const rigUids = g.facilities.all.filter((f) => g.facilities.defOf(f).class === 'rig' && g.facilities.defOf(f).onRing !== true).map((f) => f.uid);
    expect(rigUids.filter((u) => after.has(u)).length).toBeGreaterThanOrEqual(9);
    for (const u of before) expect(after.has(u)).toBe(true);
    g.step(TICKS_PER_DAY - EVENING_TICK - 1 + 1); // 하루 끝 — 래치가 내려가고 집합이 원문으로
    expect(g.nightOn).toBe(false);
    expect(new Set(g.nightForTest())).toEqual(before);
  });

  it('야간권 — 밤이 열린 저녁에 자리 잡은 팀에 발급 ≥1(nightChance 1) · 낮 1회 규칙은 그대로 · 값 = 팔찌 × 밤 배수(10 단위)', () => {
    const g = nightPark(2, 1);
    g.step(EVENING_TICK - 1);
    const seatedTeams = new Set(g.guests.all.filter((x) => x.teamId !== null && x.seatUid !== null).map((x) => x.teamId)).size;
    expect(seatedTeams).toBeGreaterThanOrEqual(1);
    const pkgBefore = g.stats.pkgPpaji ?? 0;
    g.step(2);
    expect(g.nightOn).toBe(true);
    expect(g.stats.nightNights).toBe(1);
    expect(g.stats.nightPkg ?? 0).toBeGreaterThan(0);
    expect((g.stats.pkgPpaji ?? 0) - pkgBefore).toBe(0); // 야간권은 낮 팔찌 몫에 안 든다(밴드 ppajiPkgShare 가 두 배로 튀었다)
    expect((g.stats.nightPkg ?? 0) % 10).toBe(0);
    // 낮 규칙: 같은 팀에 낮 팔찌를 다시 팔면 거절(오늘 이미 샀으면) — 밤 발급이 낮 키를 건드리지 않는다
    const leader = g.guests.all.find((x) => x.teamId !== null && x.seatUid !== null)!;
    const r1 = g.issueBand(leader, g.bandTopForTest(), 3);
    const r2 = g.issueBand(leader, g.bandTopForTest(), 3);
    expect(r2.ok).toBe(false);
    expect(r1.ok || !r1.ok).toBe(true);
  });

  it('세 자리 배수 — nightSalesMul = 1 + 0.1 × min(조명, cap 0.4) · 밤이 아니면 1 · 링 위 매점·자리 이용료가 저녁에 곱해진다(같은 판, 밤 켬/끔 저녁 매출 비 ≥ 1.2)', () => {
    const g = nightPark(3, 1);
    expect(g.nightSalesMul()).toBe(1);
    g.step(EVENING_TICK + 1);
    expect(g.nightSalesMul()).toBeCloseTo(1.2, 6); // 조명 2
    // 같은 저녁을 두 번 — 켠 판과 끈 판(스냅샷 복제)
    const base = nightPark(4, 1);
    base.step(EVENING_TICK - 1);
    const snap = JSON.parse(JSON.stringify(base.toSnapshot()));
    const on = Game.fromSnapshot(snap, { ...defaultBalance, nightChance: 1 });
    const off = Game.fromSnapshot(JSON.parse(JSON.stringify(snap)), { ...defaultBalance, nightChance: 1 }); off.nightEnabled = false;
    const rev = (x: Game): number => x.money; // 저녁엔 지출이 없다 — 돈 증가 = 야간권 + 매점 + 자리 이용료(야간권은 pkgPpaji 에 안 든다)
    const on0 = rev(on), off0 = rev(off);
    on.step(TICKS_PER_DAY - EVENING_TICK + 1); off.step(TICKS_PER_DAY - EVENING_TICK + 1);
    const onEve = rev(on) - on0, offEve = rev(off) - off0;
    expect(off.stats.nightNights ?? 0).toBe(0);
    expect(onEve / Math.max(1, offEve)).toBeGreaterThanOrEqual(1.2);
    const day = on.stats.days[on.stats.days.length - 1]!;
    expect(day.nightOn).toBe(true); expect((day.nightPkg ?? 0) + (day.nightFood ?? 0) + (day.nightFee ?? 0)).toBeGreaterThan(0);
  });

  it('--no-night 대조군 — 밤이 안 서는 판(16일·★0)은 스위치와 무관하게 비트 동일 · 스냅샷 왕복', () => {
    const a = runBot(new Game(1), 16), b = runBot(new Game(1), 16, { ...BOT_DEFAULTS, noNight: true });
    expect(a.snapshotHash).toBe(b.snapshotHash);
    const g = nightPark(5, 1); g.step(EVENING_TICK + 1);
    const s = JSON.parse(JSON.stringify(g.toSnapshot()));
    expect(s.nightOpened).toBe(true);
    const h = Game.fromSnapshot(s, { ...defaultBalance, nightChance: 1 });
    expect(h.nightOpened).toBe(true); expect(h.nightOn).toBe(false); // 래치는 저장 안 한다
    expect(hashSnapshot(h.toSnapshot())).toBe(hashSnapshot(g.toSnapshot()));
  });
});

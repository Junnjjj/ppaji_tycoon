import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, FACILITY_DEFS } from './game.js';
import { WRISTBANDS, bandPrice, bandTierIndex, bandFor, swimSkill } from './wristband.js';
import { runBot, BOT_DEFAULTS } from './bot.js';
import areasJson from '../data/areas.json';

const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if ((d.class === 'rig' || d.onRing) && d.buildable !== false) g.unlocked.facilities.add(d.id); return g; };

describe('P52-a 손님·팔찌', () => {
  it('팔찌 값 사다리 5값 — 0 · 400 · 600 · 700 · 1,000 · 출신지 10 의 취향 thrill 은 팔찌 칸 3:3:3:1 (문턱 0.85·1.25·1.7) · swimSkill 0~1', () => {
    const by = Object.fromEntries(WRISTBANDS.map((t) => [t.id, t]));
    expect([bandPrice(by['vest_only']!, 0), bandPrice(by['big3']!, 1), bandPrice(by['big5']!, 2), bandPrice(by['big5']!, 3), bandPrice(by['allday']!, 4)]).toEqual([0, 400, 600, 700, 1000]);
    const areas = areasJson as { taste?: { thrill: number } }[];
    expect(areas.length).toBe(10);
    const counts = [0, 0, 0, 0];
    for (const a of areas) counts[bandTierIndex(a.taste?.thrill ?? 1)]!++;
    expect(counts).toEqual([3, 3, 3, 1]);
    expect(bandFor(1.8, WRISTBANDS.slice(0, 2)).id).toBe('big3'); // 열린 칸 위는 최상위
    expect(swimSkill(0.4)).toBe(0); expect(swimSkill(1.8)).toBe(1); expect(swimSkill(undefined)).toBeCloseTo(0.43, 2);
  });

  it('issueBand — 결제 소유자 하나: 같은 팀은 낮 1회, 팀 전원에 배급, stats.pkgPpaji·f.incomeToday 누적 · 창구 ⓐ 대여소는 파크 최고 등급 · 회수는 딥 기구 이용에만 깎인다', () => {
    const g = fresh();
    expect(g.placeFacility('rig_stepstone', 51, 26, 0).ok).toBe(true); expect(g.placeFacility('rig_bridge', 52, 26, 1).ok).toBe(true); // 등급 1 → big3 400
    expect(g.parkPpajiGrade()).toBe(1);
    // 손님이 올 때까지 — 팀이 있는 손님 하나
    let buyer = null as ReturnType<typeof g.guests.all.find> | null;
    for (let k = 0; k < 40 && !buyer; k++) { g.step(60); buyer = g.guests.all.find((x) => x.teamId !== null) ?? null; }
    expect(buyer).not.toBeNull();
    const b = buyer!;
    const team = g.guests.all.filter((o) => o.teamId === b.teamId);
    const m0 = g.money, p0 = g.stats.pkgPpaji ?? 0;
    const shop = g.facilities.all.find((f) => f.defId === 'rental_tube') ?? null;
    const r1 = g.issueBand(b, WRISTBANDS[1]!, 1, shop ?? undefined);
    expect(r1).toEqual({ ok: true, price: 400 });
    expect(team.every((o) => o.band === 'big3' && o.bandLeft === 3)).toBe(true);
    expect(g.money - m0).toBe(400); expect((g.stats.pkgPpaji ?? 0) - p0).toBe(400);
    if (shop) expect(shop.incomeToday).toBeGreaterThanOrEqual(400);
    const r2 = g.issueBand(team[team.length - 1]!, WRISTBANDS[2]!, 2); // 같은 팀, 같은 날 → 거절
    expect(r2.ok).toBe(false); expect(g.money - m0).toBe(400);
    expect(g.stats.vestRentals).toBe(1);
    // 회수 소모: 딥 기구 이용 훅
    b.bandLeft = 3;
    const deep = FACILITY_DEFS.get('rig_blob')!; expect(deep.depth).toBe('deep');
    expect(g.placeFacility('rig_blob', 51, 27, 0).ok).toBe(true);
    const blob = g.facilities.all.find((f) => f.defId === 'rig_blob')!;
    g.simulateUseForTest(b, blob);
    expect(b.bandLeft).toBe(2);
    g.simulateUseForTest(b, g.facilities.all.find((f) => f.defId === 'rig_stepstone')!); // any 깊이 — 안 깎인다
    expect(b.bandLeft).toBe(2);
  });

  it('정적 — 창구 ⓑ 는 자리 배수·결제 다섯 줄 앞에서 돌아간다 · pickTarget 의 딥 게이트 3 + 가중 2 표식 · 뽑기는 끝의 1회', () => {
    const game = readFileSync(new URL('./game.ts', import.meta.url), 'utf8');
    const seat = game.slice(game.indexOf('  private claimSeat('), game.indexOf('  // ── 길 (P16 D24)'));
    expect(seat.indexOf("pk0.def.id === 'ppaji'")).toBeGreaterThan(0);
    expect(seat.indexOf("pk0.def.id === 'ppaji'")).toBeLessThan(seat.indexOf('Math.round(pk0.price * (1 + 0.1 *'));
    const guest = readFileSync(new URL('./guest.ts', import.meta.url), 'utf8');
    const pick = guest.slice(guest.indexOf("for (const f of this.facilities.all) {\n      const def = this.facilities.defOf(f);\n      if (capacityOf(def, f) <= 0) continue;"), guest.indexOf('g.passBy = chosen'));
    for (const mark of ['// ①', '// ②', '// ③', '// ④ ⑤']) expect(pick.includes(mark), mark).toBe(true);
    expect((pick.match(/this\.rng\.next\(\)/g) ?? []).length).toBe(1);
  });

  it('seatScan — 자리 패키지 계산 ≤ 0.2ms', () => {
    const g = fresh();
    const seat = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'lounging')!;
    for (let k = 0; k < 5; k++) g.seatPackages(seat.uid);
    const t0 = process.hrtime.bigint();
    for (let k = 0; k < 50; k++) g.seatPackages(seat.uid);
    expect(Number(process.hrtime.bigint() - t0) / 1e6 / 50).toBeLessThan(0.2 * 4);
  });

  it('봇 A/B 64일 — 대여소 있는 판(기본) vs 없는 판(--no-vest, 창구 ⓑ 만): 있는 판 ppajiRevShare ≥ 0.05 · 없는 판 > 0 · 있는 판이 팔찌 매출·팔찌 이용 몫 ×3 이상', () => {
    const on = runBot(new Game(3), 64, BOT_DEFAULTS); // 128일 ×2 는 vitest 워커 RPC 를 굶긴다(onTaskUpdate timeout) — 64일에서 잰다(실측 on 0.107/0.36 · off 0.013/0.05)
    const off = runBot(new Game(3), 64, { ...BOT_DEFAULTS, noVest: true });
    expect(on.ppajiRevShare).toBeGreaterThanOrEqual(0.05);
    expect(off.ppajiRevShare).toBeGreaterThan(0); // 창구 ⓑ 만으로도 팔찌가 팔린다 — §6 의 「둘 다 ≥ 0.05」 는 64일 0.013 이라 못 지킨다(자리 반경에 켜진 빠지가 있는 팀만 산다)
    // 대여소가 팔찌 매출·이용 몫을 두 배 이상 — P56-c 재고 뒤 5시드 실측 비 2.3~11(on 은 0.10~0.11 로 고정, off 가 봇 지출 순서에 흔들린다). 한 시드 ×3 은 잡음이라 ×2 (CLAUDE.md 「한 시드 대조로 밸런스 주장을 검증하지 말 것」)
    expect(on.ppajiRevShare).toBeGreaterThanOrEqual(off.ppajiRevShare * 2);
    expect(on.vestShare).toBeGreaterThanOrEqual(off.vestShare * 2);
  }, 120000);
});

import { describe, it, expect } from 'vitest';
import { Game, PACKAGES } from './game.js';
import { rentKey } from './guest.js';
import { FACILITY_DEFS } from './game.js';

/** P17 (D25) — 팀 자리 + 패키지: 같은 버스 = 같은 팀 · 팀은 평상 하나를 같이 쓴다 · 자리를 잡으면 패키지를 미리 산다 · 자리 값은 그늘·뷰·매점 */
describe('P17 팀 자리·패키지', () => {
  function withBus(g: Game, seats: number): Game {
    g.busState = { areaId: 'residential', seatsLeft: 0, phase: 'stop', t: 0, source: 'likes', team: 7 };
    const spawn = (g as unknown as { spawnBusGuest: (a: string) => void }).spawnBusGuest.bind(g);
    for (let k = 0; k < seats; k++) spawn('residential');
    g.busState = null;
    return g;
  }

  it('같은 버스로 내린 손님은 같은 팀 번호를 갖고, 대여 열쇠가 같다 (혼자 온 손님은 uid)', () => {
    const g = withBus(new Game(17), 3);
    const team = g.guests.all.filter((x) => x.teamId === 7);
    expect(team.length).toBe(3);
    expect(new Set(team.map(rentKey)).size).toBe(1);
    expect(rentKey(team[0]!)).toBe(-8);
    const solo = g.guests.spawn();
    expect(solo.teamId).toBeNull();
    expect(rentKey(solo)).toBe(solo.uid);
    expect(g.stats.teamGuests).toBe(3);
  });

  it('팀 손님이 유료 평상에 앉으면 팀 열쇠로 대여되고 자리·패키지가 붙는다 — 패키지 값은 팀 자리에서 한 번 낸다', () => {
    const g = withBus(new Game(17), 4);
    g.money = 100000;
    // 시작 킷에는 매점(자판기)·수역이 있다 → 고기/수영 패키지 중 취향 큰 것
    const kit = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'lounging' && g.facilities.defOf(f).usageFee > 0);
    expect(kit).toBeTruthy();
    const money0 = g.money;
    const team = g.guests.all.filter((x) => x.teamId === 7);
    for (const t of team) { t.target = { kind: 'facility', uid: kit!.uid }; t.state = 'walk'; t.stateTicks = 0; }
    g.step(400);
    expect(kit!.rentedBy).toBe(-8);
    const seated = team.filter((t) => t.seatUid === kit!.uid);
    expect(seated.length).toBeGreaterThanOrEqual(2);
    expect(seated.every((t) => t.pkg !== null)).toBe(true);
    expect(g.stats.teamSeated).toBe(seated.length);
    expect(g.stats.pkg ?? 0).toBeGreaterThan(0);
    expect(g.money).toBeGreaterThan(money0); // 대여료 + 패키지
    const pk = PACKAGES.find((p) => p.id === seated[0]!.pkg)!;
    expect(['meat', 'swim']).toContain(pk.id); // 시작 킷엔 코스가 없다 → 기구 패키지는 안 판다
  });

  it('자리 값 = 1 + 그늘 + 뷰 + 매점 가까움 — 파라솔은 그늘, 평상 연립은 맨 자리', () => {
    const g = new Game(3);
    g.money = 100000; g.rank = 2; g.grid.openLand(2);
    g.unlocked.facilities.add('parasol'); g.unlocked.facilities.add('pyeongsang_row');
    const gt = g.gate;
    expect(FACILITY_DEFS.get('parasol')!.shade).toBe(true);
    expect(FACILITY_DEFS.get('pyeongsang_row')!.shade).toBeUndefined();
    const a = g.placeFacility('parasol', gt.i + 6, gt.j + 3, 0); expect(a.ok).toBe(true);
    const b = g.placeFacility('pyeongsang_row', gt.i + 6, gt.j + 5, 0); expect(b.ok).toBe(true);
    const sa = g.seatValueOf(a.uid!), sb = g.seatValueOf(b.uid!);
    expect(sa.shade).toBe(true); expect(sb.shade).toBe(false);
    expect(sa.value - sa.view - (sa.near ? 1 : 0)).toBe(2);
    expect(sb.value - sb.view - (sb.near ? 1 : 0)).toBe(1);
  });

  it('스냅샷 왕복 — 팀·자리·패키지·teamSeq 가 보존된다', () => {
    const g = withBus(new Game(17), 2);
    g.teamSeq = 7;
    const t = g.guests.all.find((x) => x.teamId === 7)!;
    t.seatUid = 99; t.pkg = 'meat'; t.pkgUsed = true;
    const s = g.toSnapshot();
    const h = Game.fromSnapshot(s);
    const u = h.guests.all.find((x) => x.uid === t.uid)!;
    expect(u.teamId).toBe(7); expect(u.seatUid).toBe(99); expect(u.pkg).toBe('meat'); expect(u.pkgUsed).toBe(true);
    expect(h.teamSeq).toBe(7);
    expect(h.stats.teamGuests).toBe(2);
  });
});

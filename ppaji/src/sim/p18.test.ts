import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { CLOSE_HOUR, OPEN_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, CLOSING_TICK, EVENING_TICK, clockView } from './clock.js';
import { FACILITY_DEFS } from './game.js';

/** P18 (D26) — 1박·밤: 하루 210초 안에 저녁 구간(18~22시) · 숙박 자리 체크인(1박 요금) · 잔 손님은 폐장에 남아 다음 날 이어서 논다 */
describe('P18 1박·밤', () => {
  it('시계 — 08~20시 12시간 1,680 tick 그대로(140/h) · 폐장 손님 퇴장 19시 · 저녁 18시(22시 연장은 실측으로 폐기)', () => {
    expect(CLOSE_HOUR - OPEN_HOUR).toBe(12);
    expect(TICKS_PER_DAY).toBe(1680);
    expect(TICKS_PER_HOUR).toBe(140);
    expect(clockView(0, CLOSING_TICK).clock).toBe('PM 07:00');
    expect(clockView(0, EVENING_TICK).clock).toBe('PM 06:00');
    expect(clockView(0, EVENING_TICK).isEvening).toBe(true);
    expect(clockView(0, EVENING_TICK - 1).isEvening).toBe(false);
  });

  function withLodge(g: Game): { g: Game; uid: number } {
    g.money = 200000; g.rank = 2; g.grid.openLand(2);
    g.unlocked.facilities.add('camp_site');
    const gt = g.gate;
    const r = g.placeFacility('camp_site', gt.i + 6, gt.j + 4, 0);
    expect(r.ok).toBe(true);
    return { g, uid: r.uid! };
  }

  it('숙박 시설(camp_site 등 6종)은 데이터 lodging — 팀 손님이 자리로 잡으면 1박 요금을 내고 stays 가 된다 (혼자 온 손님은 안 잔다)', () => {
    expect(['pension', 'pension_duplex', 'glamping', 'caravan', 'camp_site', 'bungalow'].every((id) => FACILITY_DEFS.get(id)!.lodging === true)).toBe(true);
    expect(FACILITY_DEFS.get('pyeongsang_row')!.lodging).toBeUndefined();
    const { g, uid } = withLodge(new Game(18));
    const s = g.guests.spawn(); s.teamId = 5; // 팀(버스) 손님만 잔다
    s.target = { kind: 'facility', uid }; s.state = 'walk'; s.stateTicks = 0;
    const money0 = g.money;
    g.step(300);
    expect(s.stays).toBe(true);
    expect(s.seatUid).toBe(uid);
    expect(g.stats.lodging).toBe(400 + 0); // 1박 400 (대여료 400 은 fees 로 따로)
    expect(g.money - money0).toBeGreaterThanOrEqual(800);
    const solo = g.guests.spawn(); solo.target = { kind: 'facility', uid }; solo.state = 'walk'; solo.stateTicks = 0;
    g.step(300);
    expect(solo.stays).toBe(false);
  });

  it('폐장에 숙박 손님은 남고(overnight) 낮 손님은 나간다 · 다음 날 일어나 이어서 논다 · 스냅샷 왕복', () => {
    const { g, uid } = withLodge(new Game(18));
    const s = g.guests.spawn(); s.teamId = 5; s.target = { kind: 'facility', uid }; s.state = 'walk'; s.stateTicks = 0;
    const d = g.guests.spawn(); // 낮 손님
    g.step(300);
    expect(s.stays).toBe(true);
    const day0 = g.day;
    g.step(TICKS_PER_DAY - g.tick + 5); // 하루를 넘긴다
    expect(g.day).toBe(day0 + 1);
    expect(g.stats.overnight).toBeGreaterThanOrEqual(1);
    expect(g.guests.all.some((x) => x.uid === s.uid)).toBe(true);
    expect(g.guests.all.some((x) => x.uid === d.uid)).toBe(false);
    const w = g.guests.all.find((x) => x.uid === s.uid)!;
    expect(w.hp).toBe(100); expect(w.state).toBe('wander'); expect(w.spentToday).toBe(0);
    expect(g.stats.days[g.stats.days.length - 1]!.overnight).toBeGreaterThanOrEqual(1);
    const h = Game.fromSnapshot(g.toSnapshot());
    expect(h.guests.all.find((x) => x.uid === s.uid)!.stays).toBe(true);
    expect(h.stats.overnight).toBe(g.stats.overnight);
  });

  it('저녁 구간 — 18시 넘어 숙박 손님이 있으면 fire FX 가 나온다', () => {
    const { g, uid } = withLodge(new Game(18));
    const s = g.guests.spawn(); s.teamId = 5; s.target = { kind: 'facility', uid }; s.state = 'walk'; s.stateTicks = 0;
    g.step(300);
    g.step(EVENING_TICK - g.tick + 1);
    let fire = false;
    const fx = (g as unknown as { fx: { kind: string }[] }).fx;
    for (let k = 0; k < 130 && !fire; k++) { g.step(1); fire = fx.some((f) => f.kind === 'fire'); fx.length = 0; }
    expect(fire).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS, SEASON_TABLES } from './game.js';
import { WEATHER_TEMP, type Weather } from './weather.js';
import { runBot, BOT_DEFAULTS } from './bot.js';
import { EVENT_DEFS } from './random-events.js';
import balance from '../data/balance.json';

const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if ((d.class === 'rig' || d.onRing) && d.buildable !== false) g.unlocked.facilities.add(d.id); return g; };

describe('P52-c 계절 — 수온·장마', () => {
  it('수온 표 12칸 — 계절 4 × 날씨 3(겨울은 snow): 야외 = 계절 기온 + 날씨 + 강 냉기 −3 · 실내 26 · 입수 배수 u = clamp((T−16)/10, 0.15, 1)', () => {
    const g = fresh();
    const amb = SEASON_TABLES.ambientOutdoor as number[];
    expect(amb).toEqual([24, 30, 22, 14]);
    const table: number[] = [];
    for (let season = 0; season < 4; season++) for (const w of (season === 3 ? ['cloudy', 'rain', 'snow'] : ['clear', 'cloudy', 'rain']) as Weather[]) {
      const T = (amb[season] as number) + WEATHER_TEMP[w] + (balance as { riverChill: number }).riverChill;
      table.push(T);
    }
    expect(table.length).toBe(12);
    expect(table).toEqual([21, 19, 17, 27, 25, 23, 19, 17, 15, 9, 7, 8]);
    g.weather = 'clear';
    expect(g.waterTemp(true)).toBe(26);
    expect(g.waterTemp(false)).toBe(24 - 3); // 봄 맑음(day 0)
    const u = (T: number): number => Math.max(0.15, Math.min(1, (T - 16) / 10));
    expect(u(27)).toBe(1); expect(u(21)).toBeCloseTo(0.5, 6); expect(u(7)).toBe(0.15); // 겨울 바닥
  });

  it('swimUrgeOf — 실내 1 · 폐쇄 0 · 등급 4 는 max(u, 0.9) · 봄 맑음 킷 수역 0.5', () => {
    const g = fresh(); g.weather = 'clear';
    const pid = g.pools.all[0]!.id;
    expect(g.swimUrgeOf(pid)).toBeCloseTo(0.5, 6);
    g.waterClosedUntil = g.day; expect(g.swimUrgeOf(pid)).toBe(0); g.waterClosedUntil = -1;
    // 등급 4 — 기구 14 · 종 6 · 조명
    for (const [id, i, j, f] of [['rig_stepstone', 51, 24, 0], ['rig_stepstone', 51, 25, 0], ['rig_stepstone', 51, 26, 0], ['rig_stepstone', 51, 27, 0], ['rig_stepstone', 51, 28, 0], ['rig_bridge', 52, 26, 1], ['rig_beam', 52, 24, 1], ['rig_seesaw', 52, 27, 0], ['rig_led_buoy', 52, 25, 0], ['rig_led_buoy', 53, 25, 0], ['rig_slide', 53, 27, 0], ['rig_mini_slide', 52, 28, 1], ['rig_stepstone', 54, 24, 0], ['rig_stepstone', 54, 25, 0], ['rig_stepstone', 54, 26, 0], ['rig_stepstone', 54, 27, 0]] as const) g.placeFacility(id, i, j, f);
    expect(g.ppajiGradeOf(pid)).toBeGreaterThanOrEqual(3);
    if (g.ppajiGradeOf(pid) >= 4) expect(g.swimUrgeOf(pid)).toBe(0.9);
    const snap = JSON.parse(JSON.stringify(g.toSnapshot())); expect(JSON.stringify(snap)).not.toContain('waterClosedUntil'); // −1 이면 필드 없음
  });

  it('장마 유실 — rigLoss 셋(태풍 보강 0 · 버티기 0.25 · 급류 폐쇄 0.10) · 앵커 개조판 면제 · grid.floor 무변경 · 폐쇄 1일', () => {
    const t = EVENT_DEFS.get('typhoon')!, j = EVENT_DEFS.get('jangma_rapids')!;
    expect(t.choices[0]!.effect.rigLoss).toBe(0); expect(t.choices[1]!.effect.rigLoss).toBe(0.25); expect(j.choices[1]!.effect.rigLoss).toBe(0.1); expect(j.choices[1]!.effect.waterClosedDays).toBe(1);
    const g = fresh();
    expect(g.isAnchored('rig_bridge_swing')).toBe(true); expect(g.isAnchored('rig_bridge')).toBe(false); expect(g.isAnchored('rig_slide2')).toBe(false);
    for (const [id, i, j2, f] of [['rig_stepstone', 51, 24, 0], ['rig_stepstone', 51, 25, 0], ['rig_stepstone', 51, 26, 0], ['rig_stepstone', 51, 27, 0], ['rig_bridge', 52, 26, 1], ['rig_seesaw', 52, 27, 0], ['rig_led_buoy', 52, 25, 0]] as const) expect(g.placeFacility(id, i, j2, f).ok).toBe(true);
    const bridge = g.facilities.all.find((f) => f.defId === 'rig_bridge')!;
    g.rigs.known.add('up_bridge_swing'); expect(g.convertFacility(bridge.uid, 'rig_bridge_swing').ok).toBe(true); // 앵커
    const floor0 = g.grid.floor.slice(), n0 = g.facilities.all.length;
    // 태풍 「버티기」 를 강제로 연다
    (g.events as unknown as { pending: string | null }).pending = 'typhoon';
    const r = g.resolveEvent(1); expect(r.ok).toBe(true);
    expect(g.facilities.byUid(bridge.uid)?.defId).toBe('rig_bridge_swing'); // 앵커 개조판은 남는다
    expect(g.facilities.all.length).toBeLessThanOrEqual(n0);
    expect(Array.from(g.grid.floor)).toEqual(Array.from(floor0)); // 바닥 무변경
    (g.events as unknown as { pending: string | null }).pending = 'jangma_rapids';
    expect(g.resolveEvent(1).ok).toBe(true);
    expect(g.waterClosedUntil).toBe(g.day);
    expect(g.swimUrgeOf(g.pools.all[0]!.id)).toBe(0);
    const s = g.toSnapshot(); expect(s.waterClosedUntil).toBe(g.day);
    expect(Game.fromSnapshot(JSON.parse(JSON.stringify(s))).waterClosedUntil).toBe(g.day);
  });

  it('봇 64일(네 계절 한 바퀴) — offSeasonSwim(가을÷여름) 0.2~0.55 · `--sweep swimUrgeMin=1` 대조군은 그보다 크다', () => {
    // 128일 ×2 는 워커를 71초 막아 vitest RPC 가 「Timeout calling onTaskUpdate」 를 낸다(전부 통과해도 빨강) — 64일이면 계절 4 가 한 번씩 돈다
    const on = runBot(new Game(2), 64, BOT_DEFAULTS);
    const off = runBot(new Game(2, { ...balance, swimUrgeMin: 1 } as unknown as ConstructorParameters<typeof Game>[1]), 64, BOT_DEFAULTS);
    expect(on.offSeasonSwim).toBeGreaterThanOrEqual(0.2); expect(on.offSeasonSwim).toBeLessThanOrEqual(0.55);
    expect(off.offSeasonSwim).toBeGreaterThan(on.offSeasonSwim);
  }, 120000);
});

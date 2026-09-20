import { describe, it, expect } from 'vitest';
import balance from '../../data/balance.json';
import { accidentChance } from '../accident.js';
import {
  courseAccidentInput, planIncident, IncidentLedger, eligibleForFall,
  waterPath, segmentWater, createRecovery, advanceRecovery, restoreRecovery,
  createCourseRide, fleetYieldCommands, gameToWorld, worldToGame,
  type AccidentContext, type IncidentInput, type RecoveryState, type RouteSample, type Vec3, type WaterWorld,
} from './index.js';

/**
 * 운항 공통 모듈 — 에셋 워크트리 `runtime/core/core.test.mjs` 의 10건을 그대로 옮겼다.
 * 한 군데만 **더 조였다**: 마지막 검사가 생성 사본(`accident-formula.mjs`)이 아니라
 * 이 게임의 실제 `sim/accident.ts` + `data/balance.json` 을 쓴다 — 채택의 요지가
 * "확률식을 복제하지 않는다"이므로 검사도 진짜 식을 봐야 한다.
 */

const samples: RouteSample[] = Array.from({ length: 101 }, (_, i) => ({
  time: i, progress: i / 100, speed: Math.sin((Math.PI * i) / 100) * 2, peakSpeed: 2,
  phase: i < 13 ? 'departing' : i > 87 ? 'returning' : 'towing',
}));
const input: IncidentInput = { rideId: 'ride1', seed: 12, guests: [{ id: 'a' }, { id: 'b' }, { id: 'driver', role: 'operator' }], probabilities: { a: 1, b: 1, driver: 1 }, samples, injuryProbability: 1 };
const ctx = (over: Partial<AccidentContext> = {}): AccidentContext => ({ vest: true, guarded: false, rescued: false, briefed: false, cold: false, busy: 6, cap: 6, ...over });

const world = (): WaterWorld => ({
  bounds: [0, 0, 12, 12], cellSize: 1, revision: 1,
  isWater: (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 && !(x >= 5 && x < 6 && y < 9),
  docks: [{ id: 'home', water: [10.5, 2.5, 0], land: [11.5, 2.5, 0.22] }],
  boatsAt: () => [],
});
const recovery = (): RecoveryState => createRecovery({ guestId: 'a', start: [1.5, 2.5, 0.4], landing: [1.5, 2.5, 0], originDockId: 'home' });

describe('운항 공통 모듈 (이식 10건)', () => {
  it('안전도 어댑터가 자르고 호스트 식을 공유한다 · 속도는 한 번만 곱한다', () => {
    const x = courseAccidentInput({ thrill: 50, safety: 75 }, ctx());
    expect(x.safe).toBe(3);
    expect(x.thrill).toBe(2);
    expect(() => courseAccidentInput({ thrill: NaN, safety: 50 }, ctx())).toThrow();
    let called = 0;
    const r = createCourseRide({
      ...input, equipment: { speed: 2 }, boat: { speedMult: 1.3 }, courseResult: { thrill: 50, safety: 75 },
      contextForGuest: () => ctx(), balance: null,
      accidentChance: (v) => { called++; expect(v.safe).toBe(3); return 0; },
    });
    expect(r.speed).toBeCloseTo(2.6, 12);
    expect(called).toBe(3);
    expect(r.decision.event).toBeNull();
    expect(r.legacyDockAccidentPolicy).toBe('SKIP_FOR_THIS_RIDE');
  });

  it('시드 하나에 사건 하나 — 운전자·출발 직후 제외 · 장부는 정확히 한 번 소비한다', () => {
    const a = planIncident(input), b = planIncident({ ...input, guests: [...input.guests].reverse() });
    expect(a).toEqual(b); // 손님 순서가 결과를 바꾸지 않는다
    expect(a.event?.guestId).not.toBe('driver');
    expect(a.event!.progress).toBeGreaterThanOrEqual(0.35);
    expect(a.event!.progress).toBeLessThanOrEqual(0.7);
    expect(eligibleForFall({ phase: 'departing', progress: 0.05, speed: 9, peakSpeed: 10 })).toBe(false);
    const ledger = new IncidentLedger();
    expect(ledger.decide(input)).toEqual(ledger.decide({ ...input, seed: 99 })); // 같은 rideId = 같은 결정
    expect(ledger.consume(a.event)).toBeTruthy();
    const restored = new IncidentLedger(JSON.parse(JSON.stringify(ledger.snapshot())) as ReturnType<IncidentLedger['snapshot']>);
    expect(restored.consume(a.event)).toBeNull(); // 저장·복원 뒤 재적용 불가
    expect(restored.decide(input)).toEqual(a);
    expect(planIncident({ ...input, forced: true }).event?.economic).toBe(false);
  });

  it('확률이 실제로 먹는다 — 낮은 확률과 높은 확률이 5배 넘게 갈린다', () => {
    let low = 0, high = 0;
    for (let seed = 0; seed < 3000; seed++) {
      if (planIncident({ ...input, seed, probabilities: { a: 0.02, b: 0.02 } }).event) low++;
      if (planIncident({ ...input, seed, probabilities: { a: 0.2, b: 0.2 } }).event) high++;
    }
    expect(high).toBeGreaterThan(low * 5);
    expect(low).toBeGreaterThan(60);
    expect(low).toBeLessThan(190);
  });

  it('물길은 벽을 **돌아간다** — 끊긴 물은 경로가 없다', () => {
    const w = world();
    const p = waterPath([1.5, 2.5, 0], w.docks[0]!.water, w);
    expect(p).not.toBeNull();
    expect(p!.some((q) => q[1] >= 9)).toBe(true); // 벽을 돌아 아래로 내려갔다
    for (let i = 1; i < p!.length; i++) expect(segmentWater(p![i - 1]!, p![i]!, w)).toBe(true);
    w.isWater = (x) => x < 5;
    expect(waterPath([1.5, 2.5, 0], [10.5, 2.5, 0], w)).toBeNull();
  });

  it('복귀는 30/60fps 에서 같고 저장·재개도 같다 · 부상 처리는 뭍에 오른 뒤', () => {
    const w = world(), a = recovery(), b = recovery();
    a.injured = b.injured = true;
    for (let i = 0; i < 1500; i++) advanceRecovery(a, 1 / 30, w);
    for (let i = 0; i < 600; i++) advanceRecovery(b, 1 / 60, w);
    const c = restoreRecovery(JSON.parse(JSON.stringify(b)) as RecoveryState);
    for (let i = 0; i < 2400; i++) advanceRecovery(c, 1 / 60, w);
    expect(a).toEqual(c);
    expect(a.status).toBe('done');
    expect(a.nextAction).toBe('infirmary');
    expect(a.position).toEqual(w.docks[0]!.land);
  });

  it('선착장이 사라지면 닿는 대체 선착장으로 · 아예 끊기면 텔레포트 없이 기다린다', () => {
    const w = world(), a = recovery();
    advanceRecovery(a, 2, w);
    w.docks = [{ id: 'other', water: [2.5, 10.5, 0], land: [2.5, 11.5, 0.22] }];
    w.revision = 2;
    advanceRecovery(a, 30, w);
    expect(a.targetDock).toBe('other');
    expect(a.status).toBe('done');
    const b = recovery(), empty: WaterWorld = { ...world(), docks: [] };
    advanceRecovery(b, 10, empty);
    expect(b.status).toBe('rescue-wait');
    expect(b.position).toEqual(b.landing); // 제자리에서 기다린다
    empty.docks = world().docks;
    empty.revision = 3;
    advanceRecovery(b, 50, empty);
    expect(b.status).toBe('done');
  });

  it('long or edited dock climbs keep world speed instead of rushing to the new endpoint', () => {
    const w = world(), a = recovery();
    Object.assign(a, { time: 2, status: 'climb', targetDock: 'home', revision: 1, swimSpeed: 1, climbAge: 0, position: [10.5, 2.5, 0], climbOrigin: [10.5, 2.5, 0] });
    w.docks[0]!.land = [10.5, 10.5, .22];
    let last = [...a.position];
    for (let k = 0; k < 40; k++) {
      if (k === 10) { w.revision = 2; w.docks[0]!.land = [2.5, 10.5, .22]; }
      advanceRecovery(a, 1 / 8, w);
      expect(Math.hypot(...a.position.map((v, i) => v - last[i]!))).toBeLessThanOrEqual(1 / 8 + 1 / 60 + 1e-6);
      last = [...a.position];
    }
  });

  it('물이 막히면 다시 짜고, 지나가는 보트 앞에서는 멈췄다 풀린다', () => {
    const w = world();
    w.isWater = (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12;
    const a = recovery();
    w.boatsAt = () => [{ id: 'boat', position: [2, 2.5, 0], radius: 1 }];
    advanceRecovery(a, 3, w);
    expect(a.status).toBe('traffic-wait');
    const held: Vec3 = [...a.position];
    advanceRecovery(a, 2, w);
    expect(a.position).toEqual(held);
    w.boatsAt = () => [];
    advanceRecovery(a, 25, w);
    expect(a.status).toBe('done');
    const commands = fleetYieldCommands([{ id: 'b', position: [0, 0, 0], velocity: [2, 0], radius: 0.8 }], [{ position: [2, 0, 0] }]);
    expect(commands[0]!.speedMultiplier).toBe(0);
    expect(commands[0]!.reason).toBe('SWIMMER_PRIORITY');
  });

  it('game ↔ world 왕복이 J 부호를 지킨다', () => {
    const p = { i: 3, j: 4, height: 0.2 };
    expect(worldToGame(gameToWorld(p))).toEqual(p);
  });

  it('**이 게임의 실제** 사고식 — 안전도·브리핑이 단조이고 바닥이 남는다', () => {
    const p = [0, 25, 50, 75, 100].map((safety) => accidentChance(courseAccidentInput({ thrill: 90, safety }, ctx()), balance));
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeLessThanOrEqual(p[i - 1]!);
    expect(p.at(-1)!).toBeGreaterThan(0); // 코스 안전 100 에도 바닥이 남는다 (accidentFloor)
    const before = accidentChance(courseAccidentInput({ thrill: 90, safety: 20 }, ctx()), balance);
    const after = accidentChance(courseAccidentInput({ thrill: 90, safety: 20 }, ctx({ briefed: true })), balance);
    expect(Math.abs(after - before * 0.7)).toBeLessThan(1e-12);
  });

  it('올라오는 중에 선착장이 사라져도 자리를 지킨다 (텔레포트 0)', () => {
    const w = world();
    w.isWater = () => true;
    w.docks = [{ id: 'home', water: [1.5, 2.5, 0], land: [2.5, 2.5, 0.22] }];
    const s = recovery();
    for (let i = 0; i < 50; i++) advanceRecovery(s, 1 / 30, w);
    expect(s.status).toBe('climb');
    const p: Vec3 = [...s.position];
    w.docks = [];
    w.revision = 2;
    advanceRecovery(s, 1 / 30, w);
    expect(s.position).toEqual(p);
    expect(s.status).toBe('rescue-wait');
  });
});

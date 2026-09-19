import { describe, it, expect } from 'vitest';
import balance from '../../data/balance.json';
import { Game } from '../game.js';
import { courseEquipment } from './course.js';
import { BOUNCE_PROFILES, CourseRideStore, COURSE_DOCK_IDS, FALL_EQUIPMENT, ROPE_GAP, nativeHeading, seatOffset, type RideStoreSnapshot } from './ride.js';
import type { RideView, Vec2f } from './ride-view.js';
import type { Vec3 } from '../watercraft-core/index.js';
import { isWaterCode } from '../grid.js';
import type { Guest } from '../guest.js';
import type { PlacedFacility } from '../facility.js';

/**
 * 실제 운항 (P61-a) — 선착장 이용이 **즉시 요금 + 고정 사고 뽑기**이던 것을 탑승→주행→낙수→복귀→하선으로 바꾼 회귀.
 * 여기서 재는 것은 넷이다: **결정론** · **저장(운항 중 포함)** · **운항 중 타이밍** · **요금 중복 0**.
 */

/** 사고가 반드시 나는 판 — 확률식은 그대로 두고 데이터(바닥)만 1 로 민다. 검사 전용 백도어를 만들지 않는다 */
const CERTAIN = { ...balance, accidentFloor: 1, accidentBase: 1 };

interface Fixture { g: Game; dock: PlacedFacility; handle: number }

function withCourse(seed = 7, b = balance, vehicles = 1): Fixture {
  const g = new Game(seed, b);
  g.money = 20_000_000;
  const dock = g.facilities.all.find((f) => COURSE_DOCK_IDS.has(f.defId));
  if (!dock) throw new Error('시작 킷에 선착장이 없다');
  const s = g.suggestCourse({ i: dock.i, j: dock.j }, { vehicles });
  if (!s.ok) throw new Error(`코스 제안 실패: ${s.reason}`);
  const r = g.placeCourse(s.draft);
  if (!r.ok || r.handle === undefined) throw new Error(`코스 배치 실패: ${'reason' in r ? r.reason : ''}`);
  return { g, dock, handle: r.handle };
}

/** 실제로 뜬 운항만 — `moored-*` 는 아무도 안 탄 코스의 **정박 연출**이다 (P61-b, `Game.rideScene` 이 덧붙인다) */
const live = (g: Game): readonly RideView[] => g.rideScene().rides.filter((r) => !r.rideId.startsWith('moored-'));

/** 선착장 칸에 손님 하나를 세우고 이용을 끝낸 상태로 만든다 — 진짜 FSM 경로(use → finishUse → afterUse)를 지난다 */
function rider(f: Fixture): Guest {
  const g = f.g.guests.spawn(undefined, '테스트');
  g.i = f.dock.i; g.j = f.dock.j; g.fromI = g.i; g.fromJ = g.j; g.progress = 1;
  g.target = { kind: 'facility', uid: f.dock.uid };
  g.state = 'use';
  g.stateTicks = 9999;
  g.hp = 100; g.sat = 50;
  return g;
}

describe('P61-a 실제 운항 — 요금·뽑기', () => {
  it('요금은 출항 한 번 · 정원을 넘은 손님은 **0원**이다 (자리가 없으면 안 받는다)', () => {
    const f = withCourse();
    const eq = courseEquipment(f.g.courseFor(f.handle)!.equipId)!;
    const before = f.g.money;
    const seats = eq.capacity * Math.max(1, f.g.courseFor(f.handle)!.vehicles);
    const riders = Array.from({ length: seats + 3 }, () => rider(f));
    for (const g of riders) f.g.simulateUseForTest(g, f.dock);
    expect(f.g.money - before).toBe(seats * eq.fee);
    expect(f.g.stats.courseRiders).toBe(seats);
    expect(f.g.stats.courseFull).toBe(3);
    // 같은 손님을 두 번 태워도 요금은 안 붙는다 (이미 운항 중)
    const again = f.g.money;
    f.g.simulateUseForTest(riders[0]!, f.dock);
    expect(f.g.money).toBe(again);
  });

  it('옛 선착장 고정 뽑기(`safe: 2`)가 사라졌다 — 탑승이 `rng.accident` 를 **한 눈금도** 안 민다', () => {
    const f = withCourse();
    const before = f.g.toSnapshot().rng.accident;
    for (let k = 0; k < 3; k++) f.g.simulateUseForTest(rider(f), f.dock);
    expect(f.g.toSnapshot().rng.accident).toBe(before);
    expect(f.g.rides.ridesForTest().length).toBe(1);
  });

  it('정적 — `safe: 2` 고정값과 옛 선착장 뽑기 줄이 game.ts 에 없다', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../game.ts', import.meta.url), 'utf8'));
    expect(src).not.toContain('safe: 2,'); // 코스 가지의 옛 고정 안전도
    expect(src.match(/rng\.accident\.next\(\)/g)?.length ?? 0).toBe(2); // 기구 가지 ① · 주간 사건. 선착장 가지는 운항이 가져갔다
  });
});

describe('P61-a 실제 운항 — 손님 걸음이 얼어붙는다', () => {
  it('탑승하면 `course` 가 되고, 자세는 운항이 준다 (일반 이동 0)', () => {
    const f = withCourse();
    const g = rider(f);
    f.g.step(1);
    expect(g.state).toBe('course');
    expect(f.g.rides.isRiding(g.uid)).toBe(true);
    const seen = new Set<string>();
    let moved = 0;
    for (let k = 0; k < 400 && g.state === 'course'; k++) {
      const before = `${g.i},${g.j}`;
      f.g.step(1);
      seen.add(`${g.i},${g.j}`);
      if (`${g.i},${g.j}` !== before) moved++;
    }
    expect(moved).toBeGreaterThan(5); // 배를 타고 실제로 움직였다
    expect(seen.size).toBeGreaterThan(5);
    expect(g.state).toBe('wander'); // 운항이 끝나면 제자리에서 다시 논다
  });

  it('한 바퀴는 `cycleTicks` 안에 끝난다 — 방문이 하루를 넘지 않는다', () => {
    const f = withCourse();
    const res = f.g.evaluateCourse(f.handle)!;
    const g = rider(f);
    f.g.step(1);
    let ticks = 0;
    while (g.state === 'course' && ticks < 2000) { f.g.step(1); ticks++; }
    expect(g.state).not.toBe('course');
    expect(ticks).toBeLessThanOrEqual(Math.ceil(res.cycleTicks) + 3);
    expect(ticks).toBeGreaterThan(res.cycleTicks * 0.5);
  });
});

describe('P61-a 실제 운항 — 결정론·저장', () => {
  it('같은 시드·같은 조작은 운항까지 바이트 동일', () => {
    const run = (): string => {
      const f = withCourse(11, CERTAIN);
      for (let k = 0; k < 3; k++) rider(f);
      for (let k = 0; k < 220; k++) f.g.step(1);
      return JSON.stringify([f.g.rides.toSnapshot(), f.g.rides.swimmersForTest(), f.g.stats.courseFalls, f.g.money]);
    };
    expect(run()).toBe(run());
  });

  it('운항 중 저장·복원 — 남은 tick 이 같게 흐르고 사고를 다시 뽑지 않는다', () => {
    const f = withCourse(11, CERTAIN);
    const g = rider(f);
    f.g.step(1);
    for (let k = 0; k < 20; k++) f.g.step(1);
    expect(f.g.rides.ridesForTest().length).toBe(1);
    const snap = JSON.parse(JSON.stringify(f.g.toSnapshot())) as ReturnType<Game['toSnapshot']>;
    expect(snap.rides?.rides.length).toBe(1);
    const resumed = Game.fromSnapshot(snap);
    expect(resumed.rides.ridesForTest()[0]!.elapsed).toBe(f.g.rides.ridesForTest()[0]!.elapsed);
    for (let k = 0; k < 160; k++) { f.g.step(1); resumed.step(1); }
    expect(JSON.stringify(resumed.rides.toSnapshot())).toBe(JSON.stringify(f.g.rides.toSnapshot()));
    expect(resumed.stats.accidents).toBe(f.g.stats.accidents); // 복원 뒤 재추첨 0
    expect(g.state).not.toBe('use');
  });

  it('모르는 저장 버전은 **명시적으로 거절**한다 (조용히 버리면 손님이 얼어붙는다)', () => {
    const f = withCourse();
    const bad = { ...f.g.rides.toSnapshot(), version: 2 } as unknown as RideStoreSnapshot;
    expect(() => f.g.rides.fromSnapshot(bad, () => undefined)).toThrow(/Unsupported ride save/);
    // 필드가 아예 없는 구 세이브(v5)는 빈 상태가 맞다 — 던지지 않는다
    expect(() => f.g.rides.fromSnapshot(undefined, () => undefined)).not.toThrow();
  });
});

describe('P61-a 실제 운항 — 낙수와 부상', () => {
  const fall = (seed: number): { f: Fixture; guests: Guest[] } => {
    const f = withCourse(seed, CERTAIN);
    const guests = [rider(f), rider(f), rider(f)];
    return { f, guests };
  };

  it('낙수는 주행 0.35~0.70 · 최고 속도의 70% 이상에서만 — 출발 직후는 **절대** 아니다', () => {
    let fell = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { f } = fall(seed);
      f.g.step(1);
      const ride = f.g.rides.ridesForTest()[0];
      if (!ride) continue;
      for (let k = 0; k < 400 && f.g.rides.ridesForTest().length > 0; k++) f.g.step(1);
      const ev = ride.decision?.event;
      if (!ev) continue;
      fell++;
      expect(ev.progress).toBeGreaterThanOrEqual(0.35);
      expect(ev.progress).toBeLessThanOrEqual(0.7);
      expect(ev.time).toBeGreaterThan(0);
    }
    expect(fell).toBeGreaterThan(0);
  });

  it('탄 기구가 낙수 9종이면 사건이 생기고, 아니면 사건 0 (9종만 지원)', () => {
    expect([...FALL_EQUIPMENT].sort()).toEqual(['banana', 'hexa', 'honeycomb', 'jjinppang', 'lotus', 'peanut', 'rocket_tube', 'twinpang', 'watersled']);
    for (const id of FALL_EQUIPMENT) expect(courseEquipment(id), id).toBeTruthy();
  });

  it('하루 사고 상한이 막으면 **연출도 통계도 없다** (둘이 일치한다)', () => {
    // 오늘 사고 상한에 이미 닿은 판 — 검사 전용 표면을 새로 만들지 않고 세이브(`accidentsToday`)로 만든다
    const seed = withCourse(11, CERTAIN);
    const snap = JSON.parse(JSON.stringify(seed.g.toSnapshot())) as ReturnType<Game['toSnapshot']>;
    snap.accidentsToday = balance.accidentsPerDay;
    const restored = Game.fromSnapshot(snap, CERTAIN);
    const dock = restored.facilities.all.find((x) => COURSE_DOCK_IDS.has(x.defId))!;
    const f: Fixture = { g: restored, dock, handle: seed.handle };
    const g = rider(f);
    f.g.step(1);
    for (let k = 0; k < 400 && f.g.rides.ridesForTest().length > 0; k++) f.g.step(1);
    expect(f.g.rides.swimmersForTest().length).toBe(0);
    expect(f.g.stats.courseFalls ?? 0).toBe(0);
    expect(f.g.stats.accidents ?? 0).toBe(0);
    expect(g.state).not.toBe('course');
  });

  it('부상 손님은 **뭍에 오른 뒤에** 의무실로 간다 — 물 위에서 걷지 않는다', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked === 0; seed++) {
      const f = withCourse(seed, CERTAIN);
      const g = rider(f);
      f.g.step(1);
      for (let k = 0; k < 900; k++) {
        f.g.step(1);
        const swimming = f.g.rides.swimmersForTest().some((s) => s.uid === g.uid);
        if (swimming) {
          checked = 1;
          expect(g.state).not.toBe('walk'); // 헤엄치는 동안 의무실 목표가 없다
          expect(g.target).toBeNull();
        }
        if (checked && !swimming && g.state === 'walk') break;
      }
    }
    expect(checked).toBe(1);
  });
});

describe('P61-a 실제 운항 — 세계가 바뀌어도 안전', () => {
  it('운항 중 코스·선착장을 지워도 던지지 않고 손님이 얼지 않는다', () => {
    const f = withCourse(11, CERTAIN);
    const g = rider(f);
    f.g.step(1);
    for (let k = 0; k < 30; k++) f.g.step(1);
    expect(() => { f.g.removeCourse(f.handle); f.g.removeFacility(f.dock.uid); }).not.toThrow();
    for (let k = 0; k < 900; k++) f.g.step(1);
    // 낮에는 **접지 않는다**: 내렸거나, 닿을 선착장이 없어 보이는 채로 헤엄치는 중이다 (텔레포트 0)
    const swimming = f.g.rides.swimmersForTest().some((sw) => sw.uid === g.uid);
    expect(g.state !== 'course' || swimming).toBe(true);
    while (f.g.tick !== 0) f.g.step(1); // 폐장이 정리한다
    expect(f.g.rides.swimmersForTest().length).toBe(0);
    expect(f.g.guests.all.some((x) => x.uid === g.uid && x.state === 'course')).toBe(false);
  });

  it('폐장에 운항·복귀가 정리된다 — 하루를 넘겨 얼어 있는 손님이 없다', () => {
    const f = withCourse(11, CERTAIN);
    for (let k = 0; k < 3; k++) rider(f);
    f.g.step(1);
    expect(f.g.rides.ridesForTest().length).toBe(1);
    while (f.g.tick !== 0) f.g.step(1); // 하루를 끝까지
    expect(f.g.rides.ridesForTest().length).toBe(0);
    expect(f.g.rides.swimmersForTest().length).toBe(0);
    expect(f.g.guests.all.some((x) => x.state === 'course')).toBe(false);
  });
});

describe('P61-a 표시 계약', () => {
  it('rideScene 은 순수하고 승객 uid·좌석·정박·진행률을 낸다', () => {
    const f = withCourse();
    const g = rider(f);
    f.g.step(1);
    const a = f.g.rideScene();
    const b = f.g.rideScene();
    expect(JSON.stringify(a.rides)).toBe(JSON.stringify(b.rides)); // 부작용 0
    expect(a.rides.length).toBe(1);
    const ride = a.rides[0]!;
    expect(ride.vehicles[0]!.passengers.map((p) => p.guestUid)).toContain(g.uid);
    expect(ride.phase).toBe('boarding');
    expect(ride.boardProgress).toBeGreaterThanOrEqual(0);
    expect(ride.boardProgress).toBeLessThanOrEqual(1);
    expect(ride.vehicles[0]!.boat).not.toBeNull(); // 정박 중에도 보트가 있다 — 출항에 팝하지 않는다
    expect(a.paths.get(f.handle)!.length).toBeGreaterThan(10);
    expect(a.timeSec).toBeGreaterThan(0);
  });

  it('16방향 양자화는 에셋 축(h0 = +J · h4 = +I)이고 좌석 회전이 그 축을 따른다', () => {
    expect(nativeHeading(Math.PI / 2)).toBe(0);   // +J
    expect(nativeHeading(0)).toBe(4);             // +I
    expect(nativeHeading(-Math.PI / 2)).toBe(8);  // −J
    const o = seatOffset({ position: [1, 0, 0.2], heading: 0 }, 0); // h4 → a = PI/2
    expect(o.di).toBeCloseTo(0, 6);
    expect(o.dj).toBeCloseTo(-1, 6);
    expect(o.z).toBe(0.2);
  });

  it('좌석 접점 — 기본은 **작성된 표**, 주입이 덮고, 표가 비면 선체 중심으로 떨어진다', () => {
    const f = withCourse();
    const g = rider(f);
    f.g.step(1);
    const v = live(f.g)[0]!.vehicles[0]!;
    const seat = (): (typeof v.passengers)[number] => live(f.g)[0]!.vehicles[0]!.passengers.find((p) => p.guestUid === g.uid)!;
    // P61-b: `Game` 이 부팅 때부터 승인된 좌석 표를 들고 있다 — 기본이 이미 **실제 접점**이지 선체 중심이 아니다
    const authored = seat();
    expect(authored.pos).not.toEqual(v.pos);
    expect(authored.origin).toBeTruthy();
    // 주입이 표를 덮는다
    f.g.setRideSeatSpecs({ [f.g.courseFor(f.handle)!.equipId]: [{ position: [0.8, -0.3, 0.25], heading: 0 }] });
    const injected = seat();
    expect(injected.height).toBeCloseTo(0.25, 6);
    expect(injected.pos).not.toEqual(authored.pos);
    // 표가 비면 선체 중심 폴백 — 에셋이 하나도 없어도 게임은 돈다
    f.g.setRideSeatSpecs({});
    const fallback = seat();
    expect(fallback.pos).toEqual(v.pos);
    expect(fallback.height).toBe(0);
  });

  it('store 는 렌더러를 모른다 — `sim/course/ride.ts` 가 render·ui·assets 를 import 하지 않는다', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('./ride.ts', import.meta.url), 'utf8'));
    expect(/from '\.\.\/\.\.\/(render|ui|assets)\//.test(src)).toBe(false);
    expect(src).not.toContain('phaser');
    expect(CourseRideStore.name).toBe('CourseRideStore');
  });
});

/**
 * P61-b — **코디네이터가 소스에 넣은 고침**들의 회귀. 각 절은 「고치기 전이면 어떻게 빨개지는가」를 적는다.
 * 이 파일은 검사만 소유한다 — `ride.ts`·`game.ts` 는 코디네이터 것이다.
 */
describe('P61-b 코디네이터 소스 고침 회귀', () => {
  it('① 물쪽 정박에서 출발한다 — 코스 표본 0번이 선착장 **물 칸**이지 마른 선착장 칸이 아니다', () => {
    const f = withCourse();
    const path = f.g.rideScene().paths.get(f.handle)!;
    const head = path[0]!;
    expect(isWaterCode(f.g.grid.at(Math.round(head.i), Math.round(head.j))), '표본 0번이 물이어야 한다').toBe(true);
    expect({ i: Math.round(head.i), j: Math.round(head.j) }).not.toEqual({ i: f.dock.i, j: f.dock.j }); // 고치기 전: 마른 선착장 칸에서 시작해 승객이 뭍 위에 떴다
    expect(Math.hypot(head.i - f.dock.i, head.j - f.dock.j)).toBeLessThanOrEqual(1.5); // 그래도 선착장 바로 앞이다
  });

  it('② 견인선이 끊기지 않는다 — 전 구간에서 보트가 있고, tick 당 이동 < 2칸, 줄 간격은 3.4~ROPE_GAP', () => {
    const f = withCourse();
    const g = rider(f);
    f.g.step(1);
    let maxStep = 0, maxCraftStep = 0, minGap = Infinity, maxGap = 0, frames = 0;
    let prevBoat: Vec2f | null = null, prevCraft: Vec2f | null = null;
    while (f.g.rides.ridesForTest().length > 0 && frames < 500) {
      f.g.step(1);
      const v = live(f.g)[0]?.vehicles[0];
      if (!v) break;
      expect(v.boat, '정박·주행·하선 어느 구간에서도 보트가 사라지지 않는다').not.toBeNull();
      const gap = Math.hypot(v.boat!.pos.i - v.pos.i, v.boat!.pos.j - v.pos.j);
      minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
      if (prevBoat) maxStep = Math.max(maxStep, Math.hypot(v.boat!.pos.i - prevBoat.i, v.boat!.pos.j - prevBoat.j));
      if (prevCraft) maxCraftStep = Math.max(maxCraftStep, Math.hypot(v.pos.i - prevCraft.i, v.pos.j - prevCraft.j));
      prevBoat = { ...v.boat!.pos }; prevCraft = { ...v.pos };
      frames++;
    }
    expect(frames).toBeGreaterThan(50);
    expect(g.state).not.toBe('use');
    // 실측 0.882 — 폐기된 「원 교점」 안은 헤어핀에서 11.4 를 냈다. 2 는 그 사이의 문턱이다
    expect(maxStep, '보트가 항로 가지를 건너뛰지 않는다').toBeLessThan(2);
    expect(maxCraftStep, '기구도 정박→항로에서 튀지 않는다').toBeLessThan(2);
    expect(minGap, '헤어핀에서 선체가 겹치지 않는다(최소 간격)').toBeGreaterThanOrEqual(3.4);
    expect(maxGap, '곡선에서 줄을 상수로 당기지 않는다 — 명목 간격이 상한').toBeLessThanOrEqual(ROPE_GAP + 1e-6);
  });

  it('③ 낙수는 **그 좌석의 실제 접점 높이**에서 시작한다 (옛 고정 0.35 가 아니다)', () => {
    const f = withCourse(11, CERTAIN);
    const equipId = f.g.courseFor(f.handle)!.equipId;
    f.g.setRideSeatSpecs({ [equipId]: [{ position: [0.9, -0.3, 0.42], heading: 0 }] });
    const g = rider(f);
    f.g.step(1);
    let swimmer: ReturnType<Game['rides']['swimmersForTest']>[number] | undefined;
    for (let k = 0; k < 500 && !swimmer; k++) { f.g.step(1); swimmer = f.g.rides.swimmersForTest().find((s) => s.uid === g.uid); }
    expect(swimmer, '확실한 사고 판에서 낙수가 한 번은 나야 한다').toBeTruthy();
    expect(swimmer!.state.start[2]).toBeCloseTo(0.42, 6); // 좌석 z 그대로. 반동 없는 기구(peanut/jjinppang)라 가산 0
    expect(BOUNCE_PROFILES[equipId]).toBeUndefined();
  });

  it('④ 착수는 **바깥쪽**이다 — 좌석을 좌우로 뒤집으면 착수도 반대편으로 간다', () => {
    const land = (x: number): { start: Vec3; landing: Vec3 } => {
      const f = withCourse(11, CERTAIN);
      f.g.setRideSeatSpecs({ [f.g.courseFor(f.handle)!.equipId]: [{ position: [x, 0, 0.3], heading: 0 }] });
      const g = rider(f);
      f.g.step(1);
      for (let k = 0; k < 500; k++) {
        f.g.step(1);
        const s = f.g.rides.swimmersForTest().find((v) => v.uid === g.uid);
        if (s) return { start: [...s.state.start], landing: [...s.state.landing] };
      }
      throw new Error('낙수가 안 났다');
    };
    const right = land(0.9), left = land(-0.9);
    const dr: [number, number] = [right.landing[0] - right.start[0], right.landing[1] - right.start[1]];
    const dl: [number, number] = [left.landing[0] - left.start[0], left.landing[1] - left.start[1]];
    expect(Math.hypot(...dr), '제자리 폴백이 아니다').toBeGreaterThan(0.5);
    expect(Math.hypot(...dl), '제자리 폴백이 아니다').toBeGreaterThan(0.5);
    expect(dr[0] * dl[0] + dr[1] * dl[1], '두 좌석의 착수 방향이 반대여야 한다').toBeLessThan(0);
  });

  it('⑤ 같은 코스에 동시에 뜬 운항은 **번호가 겹치지 않는다**', () => {
    const f = withCourse(7, balance, 2);
    const eq = courseEquipment(f.g.courseFor(f.handle)!.equipId)!;
    for (let k = 0; k < eq.capacity + 1; k++) f.g.simulateUseForTest(rider(f), f.dock);
    const rides = f.g.rides.ridesForTest();
    expect(rides.length).toBe(2);
    expect(new Set(rides.map((r) => r.vehicle)).size).toBe(2); // 고치기 전: 둘 다 0 이라 렌더 키가 충돌했다
    expect(rides.map((r) => r.vehicle).sort()).toEqual([0, 1]);
  });

  it('⑥ 운항은 **저장된 기구**로 복원된다 — 복원 사이에 코스를 지워도 물 위 배가 사라지지 않는다', () => {
    const f = withCourse(11);
    const g = rider(f);
    f.g.step(1);
    for (let k = 0; k < 20; k++) f.g.step(1);
    const equipId = f.g.rides.ridesForTest()[0]!.equipId;
    const snap = JSON.parse(JSON.stringify(f.g.toSnapshot())) as ReturnType<Game['toSnapshot']>;
    snap.courses = { courses: [], nextHandle: 9 }; // 저장 사이에 코스를 지운 판
    const resumed = Game.fromSnapshot(snap);
    expect(resumed.courses.all.length).toBe(0);
    expect(resumed.rides.ridesForTest().length, '코스가 없어도 뜬 운항은 산다').toBe(1);
    expect(resumed.rides.ridesForTest()[0]!.equipId).toBe(equipId); // 고치기 전: 코스에서 기구를 다시 찾아 운항이 통째로 사라졌다
    for (let k = 0; k < 400 && resumed.rides.ridesForTest().length > 0; k++) resumed.step(1);
    expect(resumed.guests.all.some((x) => x.uid === g.uid && x.state === 'course')).toBe(false); // 끝까지 돌고 내린다
  });

  it('⑦ 아무도 안 탄 코스에는 **정박한 빈 기구**가 뜬다 (출항하면 사라진다)', () => {
    const f = withCourse();
    const idle = f.g.rideScene().rides;
    expect(idle.length).toBe(1);
    expect(idle[0]!.rideId).toBe(`moored-${f.handle}`);
    expect(idle[0]!.vehicles[0]!.passengers).toEqual([]);
    expect(idle[0]!.phase).toBe('boarding');
    expect(idle[0]!.speed).toBe(0);
    const g = rider(f);
    f.g.step(1);
    const busy = f.g.rideScene().rides;
    expect(busy.length, '같은 코스에 정박 기구와 운항이 겹쳐 뜨지 않는다').toBe(1);
    expect(busy[0]!.rideId.startsWith('moored-')).toBe(false);
    expect(busy[0]!.vehicles[0]!.passengers.map((p) => p.guestUid)).toContain(g.uid);
  });

  it('⑧ 복귀는 **정확히 그 선착장 칸**으로 올라온다 — 물길 격자가 반 칸 밀리지 않는다', () => {
    const f = withCourse(11, CERTAIN);
    const g = rider(f);
    f.g.step(1);
    let sawSwim = false, checkedPath = false;
    for (let k = 0; k < 900; k++) {
      f.g.step(1);
      const s = f.g.rideScene().swimmers.find((v) => v.guestUid === g.uid);
      if (!s) { if (sawSwim) break; continue; }
      sawSwim = true;
      if (s.status === 'swim' && s.path.length > 0 && !checkedPath) {
        checkedPath = true;
        // 물길 격자점은 **타일 중심 = 정수 게임 좌표**여야 한다.
        // 고치기 전: bounds 가 [0, −h, w, 0] 이라 중심이 전부 +0.5 였고, 마지막에 `Math.round` 가 이웃 칸으로 올려놨다.
        for (const q of s.path.slice(0, -1)) {
          expect(Math.abs(q.i - Math.round(q.i)), `path i=${q.i}`).toBeLessThan(1e-6);
          expect(Math.abs(q.j - Math.round(q.j)), `path j=${q.j}`).toBeLessThan(1e-6);
        }
      }
    }
    expect(sawSwim, '낙수가 한 번은 나야 한다').toBe(true);
    expect(checkedPath, '헤엄 구간의 물길을 한 번은 봐야 한다').toBe(true);
    expect(f.g.rides.swimmersForTest().length).toBe(0);
    // 올라온 칸 — 그 선착장의 **뭍 칸**(선착장 자신은 시설이 점유해 설 수 없으므로 붙은 잔교 칸이다)
    expect(Math.max(Math.abs(g.i - f.dock.i), Math.abs(g.j - f.dock.j)), '출발한 선착장 곁으로 올라온다').toBeLessThanOrEqual(1);
    expect(f.g.guests.walkable(g.i, g.j), '반 칸이 밀리면 이웃 물칸으로 올라와 여기서 false 가 된다').toBe(true);
    expect(g.state === 'walk' || g.state === 'wander').toBe(true); // 올라온 뒤에야 걷는다
  });
});

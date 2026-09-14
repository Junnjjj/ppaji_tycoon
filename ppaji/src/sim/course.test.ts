import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { FLOOR, shoreRow } from './grid.js';
import { runBot } from './bot.js';
import { makeTestPpaji } from './test-helpers.js';
import {
  validateCourseData, validateCourse, defaultHandles, presetDef, courseEquipment, dockCandidates, suggestCourse, evaluateCourse,
  COURSE_EQUIPMENT, PRESETS, COURSE_CLEAR_TILES, DOCK_REACH_TILES, startEquipmentIds,
  type CourseTerrain, type PlacedCourse, type CourseEditDraft,
} from './course/course.js';

/**
 * 견인 코스 (P4-A) — 빠지 `course.ts` 이식의 회귀. 부모 검사 중 이 세계에서 뜻이 같은 것만 골랐고,
 * D12(코스는 수역 안에만)로 **바뀐 뜻**은 따로 잰다: 부표 밖 강은 물이 아니다.
 */

/** 손으로 만든 호수 — 전부 물. 지형 단위 검사용 (게임 격자를 안 쓴다) */
function lake(w = 40, h = 32): CourseTerrain {
  return { width: w, height: h, isWater: (i, j) => i >= 0 && j >= 0 && i < w && j < h };
}
const DOCK = { x: 20, y: 6 };
const DIR = { x: 0, y: 1 };
const shuttle = presetDef('shuttle')!;
const course = (handle: number, dock: { x: number; y: number }, handles: { x: number; y: number }[], equipId = 'peanut'): PlacedCourse =>
  ({ handle, presetId: 'shuttle', equipId, vehicles: 1, dock, handles });

/** 시작 킷의 수역 칸인가 (Game 의 D12 어댑터와 같은 정의) */
const onZone = (g: Game, h: { x: number; y: number }): boolean => g.grid.at(Math.round(h.x), Math.round(h.y)) === FLOOR.pool;
/** P15: 코스 물 = 부표·데크 밖의 트인 강 */
const openWater = (g: Game, h: { x: number; y: number }): boolean => { const f = g.grid.at(Math.round(h.x), Math.round(h.y)); return f === FLOOR.river || f === FLOOR.shallow; };

describe('코스 데이터 — 승계 그대로, 돈만 G 눈금', () => {
  it('validateCourseData() 가 빈 목록이다 (프리셋 6 · 기구 30(승계 19 + 공방 11) · 보트 2 · 적합도 180 · 시작 기구 둘)', () => {
    expect(validateCourseData()).toEqual([]);
    expect(PRESETS.length).toBe(6);
    expect(COURSE_EQUIPMENT.length).toBe(30);
    expect(startEquipmentIds().sort()).toEqual(['jjinppang', 'peanut']);
  });
  it('돈은 G 눈금이다 — 가장 싼 기구 ≥1,000G · 요금 30~150G · 유지비는 하루 단위', () => {
    const costs = COURSE_EQUIPMENT.map((e) => e.vehicleCost);
    expect(Math.min(...costs)).toBeGreaterThanOrEqual(1000);
    expect(Math.max(...costs)).toBeLessThanOrEqual(16000); // 대형 슬라이드 13,500G 와 같은 자릿수
    for (const e of COURSE_EQUIPMENT) {
      expect(e.fee, e.id).toBeGreaterThanOrEqual(30);
      expect(e.fee, e.id).toBeLessThanOrEqual(150);
      expect(e.upkeep, e.id).toBeLessThan(e.vehicleCost / 10);
    }
    expect(courseEquipment('peanut')?.vehicleCost).toBe(2800);
  });
  it('waterNeed 는 수역 칸 눈금이다 — 시작 킷 수역(20칸)에 왕복은 들어가고 8자는 안 들어간다', () => {
    expect(shuttle.waterNeed).toBeLessThanOrEqual(20);
    expect(presetDef('figure8')!.waterNeed).toBeGreaterThan(20);
  });
});

describe('판정 — 부모와 같은 뜻', () => {
  it('물 위면 통과한다', () => {
    const v = validateCourse(lake(), defaultHandles(shuttle, DOCK, DIR), DOCK, shuttle, 'peanut', 1);
    expect(v.ok).toBe(true);
  });
  it('육지에 걸린 핸들을 번호로 알려준다', () => {
    const t: CourseTerrain = { width: 40, height: 32, isWater: (i, j) => j >= 4 && j < 14 && i >= 0 && i < 40 };
    const handles = defaultHandles(shuttle, DOCK, DIR); // y 12 · 20 — 둘째가 물 밖
    const v = validateCourse(t, handles, DOCK, shuttle, 'peanut', 1);
    expect(v.issues).toContain('not-water');
    expect(v.badHandles).toEqual([1]);
  });
  it('등급 · 불가 조합 · 기구 없음 · 안 산 기구 · 너무 멀다', () => {
    const t = lake();
    const hairpin = presetDef('hairpin')!;
    expect(validateCourse(t, defaultHandles(hairpin, DOCK, DIR), DOCK, hairpin, 'dancing', 1).issues).toContain('locked-preset');
    const f8 = presetDef('figure8')!;
    expect(validateCourse(t, defaultHandles(f8, DOCK, DIR), DOCK, f8, 'wagon', 3).issues).toContain('blocked-combo');
    expect(validateCourse(t, defaultHandles(shuttle, DOCK, DIR), DOCK, shuttle, null, 3).issues).toContain('no-equipment');
    expect(validateCourse(t, defaultHandles(shuttle, DOCK, DIR), DOCK, shuttle, 'banana', 3, [], undefined, new Set(['peanut'])).issues).toContain('not-owned');
    const far = defaultHandles(shuttle, DOCK, DIR).map((h) => ({ x: h.x + 30, y: h.y }));
    expect(validateCourse(t, far, DOCK, shuttle, 'peanut', 3).issues).toContain('far-from-dock');
    expect(DOCK_REACH_TILES).toBeGreaterThan(0);
  });
  it('★ 같은 선착장에는 두 번째를 못 놓고(dock-taken), 다른 선착장이라도 물이 겹치면 overlap, 3칸 떨어지면 통과', () => {
    const t = lake();
    const first = course(1, DOCK, defaultHandles(shuttle, DOCK, DIR));
    const again = validateCourse(t, defaultHandles(shuttle, DOCK, DIR), DOCK, shuttle, 'peanut', 1, [first]);
    expect(again.issues).toEqual(['dock-taken']);
    const near = { x: DOCK.x + 1, y: DOCK.y };
    const v2 = validateCourse(t, defaultHandles(shuttle, near, DIR), near, shuttle, 'peanut', 1, [first]);
    expect(v2.issues).toContain('overlap');
    expect(v2.badHandles.length).toBeGreaterThan(0);
    const farDock = { x: DOCK.x + COURSE_CLEAR_TILES + 1, y: DOCK.y };
    const v3 = validateCourse(t, defaultHandles(shuttle, farDock, DIR), farDock, shuttle, 'peanut', 1, [first]);
    expect(v3.ok).toBe(true);
    // 잔교 모드 제안은 빈 잔교부터
    const docks = dockCandidates([{ x: 20, y: 5 }, { x: 20, y: 6 }, { x: 30, y: 5 }, { x: 30, y: 6 }], { x: 20, y: 0 });
    expect(docks.length).toBe(2);
    expect(suggestCourse(shuttle, docks, [course(1, docks[0]!.tip, [])]).dockIndex).toBe(1);
  });
  it('루트가 시설 발자국을 지나면 route-blocked', () => {
    const t = lake();
    const handles = defaultHandles(shuttle, DOCK, DIR);
    const mid = { x: Math.round(DOCK.x), y: Math.round((handles[0]!.y + handles[1]!.y) / 2) };
    const v = validateCourse(t, handles, DOCK, shuttle, 'peanut', 1, [], undefined, undefined, new Set([`${mid.x},${mid.y}`]));
    expect(v.issues).toContain('route-blocked');
  });
  it('지표 — 대수를 늘리면 처리량↑ 안전↓, 결정론', () => {
    const peanut = courseEquipment('peanut')!;
    const h = defaultHandles(shuttle, DOCK, DIR);
    const one = evaluateCourse(DOCK, h, peanut, 'shuttle', 1);
    const four = evaluateCourse(DOCK, h, peanut, 'shuttle', 4);
    expect(four.throughput).toBeCloseTo(one.throughput * 4, 6);
    expect(four.safety).toBeLessThan(one.safety);
    expect(four.potentialDailyRiders).toBeGreaterThan(one.potentialDailyRiders);
    expect(four.dailyUpkeep).toBe(one.dailyUpkeep * 4);
    expect(evaluateCourse(DOCK, h, peanut, 'shuttle', 1)).toEqual(one);
  });
});

describe('D12 개정(P15) — 코스는 부표 밖 트인 강, 수역은 막힘', () => {
  it('시작 킷: 데크 위 선착장 하나가 후보 하나다 (claim = 선착장 + 3칸 안 데크 8 = 9 — P20: 링 전체(16)를 잡으면 둘째 선착장이 영영 「이미 코스 있음」)', () => {
    const g = new Game(1);
    const docks = g.dockChoices();
    expect(docks.length).toBe(1);
    expect(docks[0]!.tip).toEqual({ x: g.gate.i + 10, y: shoreRow(g.gate.i + 10) + 2 }); // P15→P43→P48-b3: 본류 잔교(3칸) 끝 — 링 동쪽 물가에서 강 쪽으로
    expect(docks[0]!.claim?.length).toBe(3); // 잔교 3칸 전부(선착장 + 위아래 데크)
  });
  it('시작 킷에서 기본 제안은 유효하다 — 핸들 전부가 수역 칸 위', () => {
    const g = new Game(1);
    const s = g.suggestCourse();
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.draft.presetId).toBe('shuttle');
    expect(s.draft.equipId).toBe('peanut');
    expect(s.draft.handles.every((h) => openWater(g, h))).toBe(true); // P15: 코스는 부표 밖 트인 강
    expect(g.canPlaceCourse(s.draft)).toEqual({ ok: true });
  });
  it('★ 부표(수영 구역) 안은 코스 물이 아니다 — 수역 칸에 핸들을 두면 not-water (P15: 수영 손님과 보트를 안 섞는다)', () => {
    const g = new Game(1);
    const s = g.suggestCourse();
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const zone = g.pools.all[0]!;
    const k = zone.tiles[Math.floor(zone.tiles.length / 2)] as number;
    const inZone = { x: k % g.grid.w, y: Math.floor(k / g.grid.w) };
    expect(onZone(g, inZone)).toBe(true);
    const draft: CourseEditDraft = { ...s.draft, handles: [inZone, s.draft.handles[1]!] };
    const r = g.canPlaceCourse(draft);
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('not-water');
    // 트인 강 칸은 물이다 — 기본 제안이 그 위에 있다
    expect(s.draft.handles.every((h) => openWater(g, h) && !onZone(g, h))).toBe(true);
  });
  it('놓으면 기구 값을 치르고, 같은 선착장에 둘째는 dock-taken, 철거는 환불이 없다', () => {
    const g = new Game(1);
    const money = g.money;
    const s = g.suggestCourse();
    if (!s.ok) throw new Error(s.reason);
    const r = g.placeCourse({ ...s.draft, vehicles: 2 });
    expect(r.ok).toBe(true);
    expect(g.money).toBe(money - 2800 * 2);
    expect(g.courses.count).toBe(1);
    const again = g.suggestCourse();
    if (!again.ok) throw new Error(again.reason);
    expect(g.canPlaceCourse(again.draft).issues).toContain('dock-taken');
    expect(g.removeCourse(r.handle!)).toEqual({ ok: true });
    expect(g.money).toBe(money - 2800 * 2);
    expect(g.courses.count).toBe(0);
  });
  it('코스가 있는 수역은 스릴을 얻고, 하루 유지비에 기구 유지비가 더해진다', () => {
    const g = new Game(1); g.money = 100000;
    makeTestPpaji(g, 3, 5, 11); // P48-b3: 킷 빠지는 코스에서 2칸 밖 — 잔교(gt.i+10) 동쪽 곁(열 59~63, 3×5 — 물가가 편평한 열만)에 빠지를 하나 더 두고 그것을 잰다
    const zone = g.pools.all.find((p) => p.tiles.length === 15 && p.tiles.every((k) => (k % g.grid.w) >= g.gate.i + 11))!;
    expect(zone).toBeDefined();
    expect(g.courseThrill(zone.id)).toBe(0);
    const before = g.dailyMaintenance();
    const s = g.suggestCourse();
    if (!s.ok) throw new Error(s.reason);
    const r = g.placeCourse(s.draft);
    expect(r.ok).toBe(true);
    expect(g.courseThrill(zone.id)).toBeGreaterThan(0);
    expect(g.dailyMaintenance()).toBeGreaterThan(before);
    expect(g.evaluateCourse(r.handle!)?.fit).toBe('best');
  });
  it('기구 구입 — 값을 치르고 소유에 든다, 두 번은 못 산다', () => {
    const g = new Game(1);
    const money = g.money;
    expect(g.buyEquipment('banana')).toEqual({ ok: true });
    expect(g.money).toBe(money - 4800);
    expect(g.courses.ownedEquipment.has('banana')).toBe(true);
    expect(g.buyEquipment('banana').ok).toBe(false);
    expect(g.buyEquipment('jetboat').ok).toBe(false); // 16,000G — 돈이 모자란다
  });
  it('스냅샷 왕복이 코스와 산 기구를 보존한다', () => {
    const g = new Game(1);
    g.buyEquipment('banana');
    const s = g.suggestCourse();
    if (!s.ok) throw new Error(s.reason);
    g.placeCourse(s.draft);
    const snap = JSON.parse(JSON.stringify(g.toSnapshot()));
    expect(snap.courses.owned).toEqual(['banana', 'jjinppang', 'peanut']);
    const h = Game.fromSnapshot(snap);
    expect(h.courses.all).toEqual(g.courses.all);
    expect([...h.courses.ownedEquipment].sort()).toEqual([...g.courses.ownedEquipment].sort());
    expect(h.money).toBe(g.money);
    expect(JSON.stringify(h.toSnapshot())).toBe(JSON.stringify(snap));
    // 옛 세이브 (courses 없음) — 코스 0 · 물려받은 기구 둘
    delete snap.courses;
    const old = Game.fromSnapshot(snap);
    expect(old.courses.count).toBe(0);
    expect([...old.courses.ownedEquipment].sort()).toEqual(['jjinppang', 'peanut']);
  });
  it('봇은 시드 1 에서 64일 안에 코스를 하나 이상 놓는다', () => {
    const m = runBot(new Game(1), 64);
    expect(m.courses).toBeGreaterThanOrEqual(1);
  }, 30000);
});

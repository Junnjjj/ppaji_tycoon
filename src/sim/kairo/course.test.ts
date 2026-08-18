import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import {
  PRESETS,
  COURSE_EQUIPMENT,
  presetDef,
  courseEquipment,
  fitOf,
  fitBlocked,
  fitEffect,
  defaultHandles,
  validateCourse,
  evaluateCourse,
  validateCourseData,
  CourseStore,
  DOCK_REACH_TILES,
  dockCandidates,
  type Vec2,
} from './course.js';

/**
 * 수상 코스 — 스펙 §7. 여섯 동사 중 "코스를 그린다".
 *
 * 지키려는 성질: **적합도가 코스 깊이의 실체다.** 프리셋만으로는 30분이면 소진된다.
 */

/** 물로 가득한 지형 — 코스 판정만 보고 싶을 때 */
function lake(w = 40, h = 32): KairoTerrain {
  const t = new KairoTerrain(w, h);
  // 물은 `water_edge` 하나다 — 카이로 전환에서 수심을 없앴다
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'water_edge');
  return t;
}

const DOCK: Vec2 = { x: 6, y: 16 };
const DIR: Vec2 = { x: 1, y: 0 };

describe('코스 데이터', () => {
  it('프리셋 6종 · 장비 19종 · 적합도가 빠짐없다', () => {
    expect(PRESETS.length).toBe(6);
    expect(COURSE_EQUIPMENT.length).toBe(19);
    expect(validateCourseData()).toEqual([]);
  });

  it('핸들이 2~4개다 — 그게 탭 5회의 근거다', () => {
    for (const p of PRESETS) {
      expect(p.handles).toBeGreaterThanOrEqual(2);
      expect(p.handles).toBeLessThanOrEqual(4);
    }
  });

  it('견인 15 + 동력 4 = 19', () => {
    expect(COURSE_EQUIPMENT.filter((e) => e.kind === 'tow').length).toBe(15);
    expect(COURSE_EQUIPMENT.filter((e) => e.kind === 'power').length).toBe(4);
  });

  it('금액이 다른 데이터와 같은 축척이다 — 코스 하나가 판 전체가 되면 안 된다', () => {
    /*
     * 시설 건설비 10.5만~413만 · 주간 손익 20~50만.
     * 장비값 상한을 시설 최고가에 맞춘다 — 처음 ×0.03 으로 잡았더니 코스 회수가 3주로
     * 시설(7~10주)의 2~3배라 코스가 항상 정답이 됐다 (실측: 코스 4개가 주 44만).
     */
    for (const e of COURSE_EQUIPMENT) {
      expect(e.vehicleCost).toBeLessThanOrEqual(2_000_000);
      expect(e.vehicleCost).toBeGreaterThan(100_000);
      expect(e.fee).toBeLessThan(5_000);
      expect(e.upkeep).toBeLessThan(20_000);
    }
  });
});

describe('적합도 — 코스 깊이의 실체', () => {
  it('장비마다 어울리는 형태가 다르다 — 같으면 조합이 의미 없다', () => {
    const rows = COURSE_EQUIPMENT.map((e) => PRESETS.map((p) => fitOf(e.id, p.id)).join(''));
    expect(new Set(rows).size).toBeGreaterThan(5);
  });

  it('불가 조합이 실제로 있다 — 전부 탈 수 있으면 선택이 아니다', () => {
    const blocked = COURSE_EQUIPMENT.flatMap((e) =>
      PRESETS.filter((p) => fitBlocked(e.id, p.id)).map((p) => `${e.id}/${p.id}`),
    );
    expect(blocked.length).toBeGreaterThan(5);
    // 마차튜브(10인)는 8자·지그재그·급선회를 못 탄다
    expect(fitBlocked('wagon', 'figure8')).toBe(true);
    expect(fitBlocked('wagon', 'circle')).toBe(false);
  });

  it('최적은 스릴·만족을 올리고 부적합은 내린다', () => {
    expect(fitEffect('best')!.thrill).toBeGreaterThan(1);
    expect(fitEffect('best')!.satisfaction).toBeGreaterThan(1);
    expect(fitEffect('poor')!.thrill).toBeLessThan(1);
    expect(fitEffect('no')).toBeNull();
  });

  it('적합도가 처리량·안전은 안 건드린다 — 전면 하향이면 부적합을 고를 이유가 없다', () => {
    const t = lake();
    const p = presetDef('circle')!;
    const handles = defaultHandles(p, DOCK, DIR);
    // 원형에 ◎ 인 장비와 △ 인 장비
    const best = courseEquipment('banana')!;
    const poor = courseEquipment('spinpang')!;
    expect(fitOf(best.id, 'circle')).toBe('best');
    void t;
    const a = evaluateCourse(DOCK, handles, best, 'circle', 2);
    const b = evaluateCourse(DOCK, handles, best, 'circle', 2);
    expect(a.throughput).toBe(b.throughput);
    // 같은 장비·같은 형태면 결과가 같다 (결정론)
    expect(a.thrill).toBe(b.thrill);
    void poor;
  });

  it('같은 형태라도 최적 장비가 부적합 장비보다 스릴이 높다 (계수 보정 후)', () => {
    const p = presetDef('zigzag')!;
    const handles = defaultHandles(p, DOCK, DIR);
    const dancing = courseEquipment('dancing')!; // 지그재그 ◎
    const rated = evaluateCourse(DOCK, handles, dancing, 'zigzag', 2);
    expect(rated.fit).toBe('best');
    expect(rated.satisfactionMult).toBeGreaterThan(1);
    const peanut = courseEquipment('peanut')!; // 지그재그 △
    const poor = evaluateCourse(DOCK, handles, peanut, 'zigzag', 2);
    expect(poor.fit).toBe('poor');
    expect(poor.satisfactionMult).toBeLessThan(1);
  });
});

describe('핸들 배치', () => {
  it('프리셋이 정한 개수만큼 나온다', () => {
    for (const p of PRESETS) {
      expect(defaultHandles(p, DOCK, DIR).length).toBe(p.handles);
    }
  });

  it('선착장 앞쪽(물 방향)에 펼쳐진다 — 뒤로 나면 육지로 간다', () => {
    for (const p of PRESETS) {
      const hs = defaultHandles(p, DOCK, DIR);
      const anyForward = hs.some((h) => h.x > DOCK.x);
      expect(anyForward, p.id).toBe(true);
    }
  });

  it('방향을 돌리면 배치도 돌아간다', () => {
    const p = presetDef('circle')!;
    const east = defaultHandles(p, DOCK, { x: 1, y: 0 });
    const south = defaultHandles(p, DOCK, { x: 0, y: 1 });
    expect(east[0]!.x).not.toBeCloseTo(south[0]!.x, 3);
  });
});

describe('판정', () => {
  it('물 위면 통과한다', () => {
    const t = lake();
    const p = presetDef('shuttle')!;
    const v = validateCourse(t, defaultHandles(p, DOCK, DIR), DOCK, p, 'banana', 3);
    expect(v.ok, v.issues.join(',')).toBe(true);
  });

  it('육지에 걸린 핸들을 **번호로** 알려준다 — "안 됩니다"만 주면 어딜 고칠지 모른다', () => {
    const t = lake();
    for (let j = 0; j < 32; j++) t.paint(20, j, 'lawn'); // 세로로 육지 띠
    const p = presetDef('zigzag')!;
    const handles = defaultHandles(p, DOCK, DIR).map((h) => ({ x: 20, y: h.y }));
    const v = validateCourse(t, handles, DOCK, p, 'dancing', 3);
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('not-water');
    expect(v.badHandles.length).toBe(handles.length);
  });

  it('좁은 강에서는 넓은 형태가 막힌다 (§7.7)', () => {
    const t = new KairoTerrain(40, 32);
    for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
    for (let i = 0; i < 40; i++) for (let j = 15; j < 18; j++) t.paint(i, j, 'water_edge'); // 3칸 폭
    const narrowDock = { x: 6, y: 16 };
    const wide = presetDef('ellipse')!; // 필요 수면 90
    const v = validateCourse(t, defaultHandles(wide, narrowDock, DIR), narrowDock, wide, 'banana', 3);
    expect(v.issues).toContain('too-narrow');
    expect(v.waterTiles).toBeLessThan(wide.waterNeed);
  });

  it('등급이 모자라면 막힌다 — 허가는 돈으로 못 산다와 같은 규칙', () => {
    const t = lake();
    const p = presetDef('hairpin')!; // 3등급
    const v = validateCourse(t, defaultHandles(p, DOCK, DIR), DOCK, p, 'dancing', 1);
    expect(v.issues).toContain('locked-preset');
  });

  it('불가 조합은 판정에서 막힌다', () => {
    const t = lake();
    const p = presetDef('figure8')!;
    const v = validateCourse(t, defaultHandles(p, DOCK, DIR), DOCK, p, 'wagon', 3);
    expect(v.issues).toContain('blocked-combo');
  });

  it('장비를 안 고르면 그 사유를 준다', () => {
    const t = lake();
    const p = presetDef('shuttle')!;
    expect(validateCourse(t, defaultHandles(p, DOCK, DIR), DOCK, p, null, 3).issues).toContain(
      'no-equipment',
    );
  });

  it('선착장에서 너무 멀면 막힌다', () => {
    const t = lake();
    const p = presetDef('shuttle')!;
    const far = defaultHandles(p, DOCK, DIR).map((h) => ({ x: h.x + 30, y: h.y }));
    expect(validateCourse(t, far, DOCK, p, 'banana', 3).issues).toContain('far-from-dock');
    expect(DOCK_REACH_TILES).toBeGreaterThan(0);
  });
});

describe('지표 — §7.6 공식을 그대로 쓴다', () => {
  const p = presetDef('circle')!;
  const handles = defaultHandles(p, DOCK, DIR);
  const banana = courseEquipment('banana')!;

  it('대수를 늘리면 처리량이 비례해 늘어난다', () => {
    const one = evaluateCourse(DOCK, handles, banana, 'circle', 1);
    const four = evaluateCourse(DOCK, handles, banana, 'circle', 4);
    expect(four.throughput / one.throughput).toBeCloseTo(4, 1);
  });

  it('대수를 늘리면 안전이 내려간다 — 처리량 vs 안전이 핵심 다이얼', () => {
    const one = evaluateCourse(DOCK, handles, banana, 'circle', 1);
    const many = evaluateCourse(DOCK, handles, banana, 'circle', 12);
    expect(many.safety).toBeLessThan(one.safety);
  });

  it('급선회 형태가 왕복보다 스릴이 높고 안전이 낮다', () => {
    const dancing = courseEquipment('dancing')!;
    const hairpin = evaluateCourse(
      DOCK,
      defaultHandles(presetDef('hairpin')!, DOCK, DIR),
      dancing,
      'hairpin',
      2,
    );
    const shuttle = evaluateCourse(
      DOCK,
      defaultHandles(presetDef('shuttle')!, DOCK, DIR),
      dancing,
      'shuttle',
      2,
    );
    expect(hairpin.thrill).toBeGreaterThan(shuttle.thrill);
    expect(hairpin.safety).toBeLessThanOrEqual(shuttle.safety);
  });

  it('매출이 요금 × 주간 탑승객에서 나온다', () => {
    const r = evaluateCourse(DOCK, handles, banana, 'circle', 3);
    expect(r.weeklyRevenue).toBe(r.weeklyRiders * banana.fee);
    expect(r.weeklyUpkeep).toBe(banana.upkeep * 3);
  });

  it('⚠ 코스 하나가 공원 전체 매출을 넘지 않는다 — 시계 단위를 틀리면 30배가 부푼다', () => {
    /*
     * computeMetrics 의 throughput 은 v1 시계(하루 3,600 tick) 기준 "명/h" 다.
     * 카이로의 하루는 120 tick 이라 그대로 쓰면 30배가 되고, 실측으로 코스 하나가
     * 주매출 59만(공원 전체 ~50만)을 냈다. 주간 tick 수로 다시 센다.
     */
    const r = evaluateCourse(DOCK, handles, banana, 'circle', 4);
    expect(r.weeklyRevenue).toBeLessThan(300_000);
    expect(r.weeklyRiders).toBeLessThan(400);
  });

  it('같은 입력은 같은 결과 — 결정론', () => {
    const a = evaluateCourse(DOCK, handles, banana, 'circle', 3);
    const b = evaluateCourse(DOCK, handles, banana, 'circle', 3);
    expect(a).toEqual(b);
  });
});

describe('보관', () => {
  it('놓고 지우고 스냅샷 왕복이 된다', () => {
    const st = new CourseStore();
    const p = presetDef('circle')!;
    const c = st.add({
      presetId: 'circle',
      equipId: 'banana',
      vehicles: 2,
      dock: DOCK,
      handles: defaultHandles(p, DOCK, DIR),
    });
    expect(st.count).toBe(1);
    const back = CourseStore.fromSnapshot(JSON.parse(JSON.stringify(st.toSnapshot())));
    expect(back.count).toBe(1);
    expect(back.all[0]!.handles).toEqual(c.handles);
    expect(back.weekly().revenue).toBe(st.weekly().revenue);
    expect(st.remove(c.handle)).toBe(true);
    expect(st.count).toBe(0);
  });

  it('여러 코스의 매출·유지비가 합쳐진다', () => {
    const st = new CourseStore();
    const p = presetDef('circle')!;
    for (let k = 0; k < 3; k++) {
      st.add({
        presetId: 'circle',
        equipId: 'banana',
        vehicles: 2,
        dock: DOCK,
        handles: defaultHandles(p, DOCK, DIR),
      });
    }
    const w = st.weekly();
    expect(w.revenue).toBeGreaterThan(0);
    expect(w.upkeep).toBe(courseEquipment('banana')!.upkeep * 2 * 3);
    expect(w.thrill).toBeGreaterThan(0);
    expect(w.safety).toBeGreaterThan(0);
  });
});

describe('지표가 구분을 만든다 — 다 100 이면 지표가 아니다', () => {
  const dock: Vec2 = { x: 6, y: 16 };
  const dir: Vec2 = { x: 0, y: 1 };

  it('프리셋마다 스릴이 다르고, 낮은 쪽이 실제로 낮다', () => {
    /*
     * ⚠ 실측 사고: 장비 기본 스릴을 프리셋 기본에 **더했더니** 6×3 조합 중 10칸이 100 에
     * 붙어 지표가 아무것도 구분하지 못했다. 스펙 §7.6 은 장비의 몫을 속도계수와
     * 스릴계수로 넣는다 — 기본값을 또 더하면 세 번 세는 것이다.
     */
    const banana = courseEquipment('banana')!;
    const thrills = PRESETS.map((p) =>
      Math.round(evaluateCourse(dock, defaultHandles(p, dock, dir, 8), banana, p.id, 2).thrill),
    );
    expect(new Set(thrills).size).toBeGreaterThanOrEqual(4);
    expect(Math.min(...thrills)).toBeLessThan(40); // 왕복은 낮아야 한다
    expect(Math.max(...thrills)).toBeGreaterThan(70);
  });

  it('안전도도 프리셋마다 다르다 — 급선회가 가장 낮다', () => {
    const banana = courseEquipment('banana')!;
    const safety = (id: string): number =>
      evaluateCourse(
        dock,
        defaultHandles(presetDef(id)!, dock, dir, 8),
        banana,
        id,
        2,
      ).safety;
    expect(safety('hairpin')).toBeLessThan(safety('shuttle'));
    expect(safety('shuttle')).toBeGreaterThan(90);
  });

  it('처리량은 왕복이 가장 높다 — "처리량 최고"가 설명이 아니라 결과여야 한다', () => {
    const banana = courseEquipment('banana')!;
    const riders = (id: string): number =>
      evaluateCourse(dock, defaultHandles(presetDef(id)!, dock, dir, 8), banana, id, 2)
        .weeklyRiders;
    const all = PRESETS.map((p) => riders(p.id));
    expect(riders('shuttle')).toBe(Math.max(...all));
  });
});


/*
 * ─────────────────────────────────────────────────────────────────────────
 * K33 — 선착장 후보.
 *
 * **이 함수의 이유:** 코스 시작점이 "코드가 찾은 첫 데크"로 고정돼 있었고, 뻗는 방향은
 * `{x:0, y:1}` 하드코딩이었다. 플레이어가 못 골랐고, 물이 +j 쪽이 아닌 맵에서는
 * 코스가 육지로 뻗었다.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('★ 선착장 후보 — 잔교 하나가 후보 하나다', () => {
  const GATE = { x: 0, y: 0 };

  it('3칸짜리 잔교 하나는 후보 **하나**다', () => {
    const c = dockCandidates(
      [
        { x: 2, y: 18 },
        { x: 2, y: 19 },
        { x: 2, y: 20 },
      ],
      GATE,
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.tiles).toBe(3);
  });

  it('⚠ 음성 대조군 — 안 묶으면 후보가 셋이 된다 (묶는 것이 이 함수의 일인가)', () => {
    /*
     * 데크는 칸 단위 시설이라 목록에는 3개가 들어온다. 묶기를 안 하면 그대로 3개가
     * 나오고, 고르는 화면에 같은 잔교가 세 번 뜬다 — 고르는 의미가 사라진다.
     */
    const raw = [
      { x: 2, y: 18 },
      { x: 2, y: 19 },
      { x: 2, y: 20 },
    ];
    expect(raw).toHaveLength(3);
    expect(dockCandidates(raw, GATE)).toHaveLength(1);
  });

  it('떨어진 잔교 둘은 후보 둘이다', () => {
    const c = dockCandidates(
      [
        { x: 2, y: 18 },
        { x: 2, y: 19 },
        { x: 9, y: 18 },
        { x: 9, y: 19 },
      ],
      GATE,
    );
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.tiles)).toEqual([2, 2]);
  });

  it('tip 은 게이트에서 가장 먼 칸 — 코스는 잔교 끝에서 시작한다', () => {
    const c = dockCandidates(
      [
        { x: 2, y: 18 },
        { x: 2, y: 19 },
        { x: 2, y: 20 },
      ],
      GATE,
    );
    expect(c[0]!.tip).toEqual({ x: 2, y: 20 });
  });

  it('dir 은 뭍 → 끝 방향이다 — 잔교가 뻗은 쪽이 곧 물이다', () => {
    const down = dockCandidates(
      [
        { x: 2, y: 18 },
        { x: 2, y: 19 },
        { x: 2, y: 20 },
      ],
      GATE,
    );
    expect(down[0]!.dir).toEqual({ x: 0, y: 2 });

    // ★ 가로로 뻗은 잔교 — 예전 하드코딩 {x:0,y:1} 이면 코스가 육지로 뻗던 경우다
    const side = dockCandidates(
      [
        { x: 18, y: 3 },
        { x: 19, y: 3 },
        { x: 20, y: 3 },
      ],
      GATE,
    );
    expect(side[0]!.dir).toEqual({ x: 2, y: 0 });
  });

  it('한 칸짜리 잔교는 게이트 반대쪽으로 나간다 — 방향을 알 수 없으니', () => {
    const c = dockCandidates([{ x: 4, y: 9 }], GATE);
    expect(c[0]!.dir).toEqual({ x: 4, y: 9 });
  });

  it('게이트에서 가까운 잔교가 먼저 온다 — 기본 선택이 곧 첫 번째다', () => {
    const c = dockCandidates([{ x: 30, y: 30 }, { x: 3, y: 4 }], GATE);
    expect(c[0]!.tip).toEqual({ x: 3, y: 4 });
  });

  it('빈 목록은 후보 없음 — 선착장이 없으면 코스도 없다', () => {
    expect(dockCandidates([], GATE)).toEqual([]);
  });

  it('결정론 — 같은 입력은 같은 출력, 좌표가 중복돼도', () => {
    const decks = [
      { x: 2, y: 19 },
      { x: 2, y: 18 },
      { x: 2, y: 19 },
      { x: 2, y: 20 },
    ];
    expect(dockCandidates(decks, GATE)).toEqual(dockCandidates(decks, GATE));
    expect(dockCandidates(decks, GATE)).toHaveLength(1);
  });

  it('defaultHandles 가 이 dir 을 그대로 쓴다 — 가로 잔교면 코스도 가로다', () => {
    const c = dockCandidates(
      [
        { x: 18, y: 3 },
        { x: 19, y: 3 },
        { x: 20, y: 3 },
      ],
      GATE,
    )[0]!;
    const shuttle = PRESETS.find((p) => p.shape === 'out-and-back')!;
    const hs = defaultHandles(shuttle, c.tip, c.dir, 8);
    // 전부 +x 쪽으로 나가고 y 는 안 변한다
    for (const h of hs) {
      expect(h.x).toBeGreaterThan(c.tip.x);
      expect(Math.round(h.y)).toBe(c.tip.y);
    }
  });
});

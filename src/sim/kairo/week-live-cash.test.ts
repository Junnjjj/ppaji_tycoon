/**
 * K48 실시간 수입 — "하루 버튼이 없으니 돈이 아예 안 오른다" (사용자 보고).
 *
 * 예전에는 수입이 누산기에만 쌓이고 현금은 `finish()` 한 곳에서만 움직였다. K47-② 로
 * 하루»/주 스킵을 없앤 뒤로는 플레이어가 **한 주 내내(하루 24초 × 7일 ≈ 3분) 현금이
 * 붙박인 것**을 본다 — 게임이 도는지 알 방법이 없었다.
 *
 * 고친 방식은 **차액 정산**이다: tick 에는 그 시점에 확정된 금액을 넣고, `finish()` 는
 * `최종 주간 수입 − 이미 넣은 합` 만 정산한다. 그래서 이 파일이 지켜야 하는 것은 둘이다.
 *
 *   ★ 주 중간에 현금이 오른다
 *   ★ 주간 총액이 예전과 **한 원도** 다르지 않다 (음성 대조군: 차액을 안 빼면 어긋난다)
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, guestWalkable, GATE_FACILITY_ID } from './placement.js';
import { GuestStore } from './guests.js';
import {
  WeekRunner,
  TICKS_PER_DAY,
  TICKS_PER_WEEK,
  type IncomeEvent,
  type WeekOptions,
} from './week.js';
import { applyStartKit } from './startkit.js';
import { CourseStore } from './course.js';
import { mapType, DEFAULT_MAP } from './scenario.js';
import { bakeIndoorWalls } from './indoor.js';

function makeWorld(seed: number): { runner: WeekRunner; placement: PlacementGrid } {
  const W = KairoTerrain.WIDTH;
  const H = KairoTerrain.HEIGHT;
  const map = mapType(DEFAULT_MAP);
  const terrain = KairoTerrain.generate(W, H, new Rng(seed), {
    landRatio: map.landRatio,
    shoreJitter: map.shoreJitter,
  });
  const walls = new WallGrid(W, H);
  const placement = new PlacementGrid(W, H);
  const gate = KairoTerrain.parkGate();
  const courses = new CourseStore();
  applyStartKit({ terrain, walls, placement, gate, map, courses });
  bakeIndoorWalls(terrain, walls, gate, guestWalkable(terrain, placement));
  const guests = new GuestStore(terrain, walls, placement, gate);
  guests.invalidate();
  return { runner: new WeekRunner(terrain, placement, guests), placement };
}

/**
 * 배율이 전부 걸린 주 — 요금 슬라이더(실시간에 붙는다) · 카드 `revenueMult` · 콤보 ·
 * 매점직원 부족(`foodMult`, **이미 준 돈을 되돌린다**) · 코스 매출(결산에서만 붙는다).
 * 실시간 입금이 이 다섯을 하나라도 어긋나게 하면 총액 검사가 잡는다.
 */
const LOADED: WeekOptions = {
  priceMult: 1.2,
  combos: { satisfactionDelta: 0, revenueMult: 1.15 },
  modifiers: {
    arrivalMult: 1,
    revenueMult: 1.1,
    crowdMult: 1,
    satisfactionDelta: 0,
    reputationDelta: 0,
    accidentMult: 1,
    closed: false,
  },
  staff: { wages: 120_000, satisfactionDelta: 0, foodMult: 0.8, idle: new Set<number>() },
  courses: { revenue: 400_000, upkeep: 30_000, riders: 40 },
};

/**
 * K48 **이전** 코드가 낸 값이다 (`this.money += weekRevenue - upkeep - wages` 시절).
 * 실시간 입금을 넣기 전에 같은 세계를 돌려 받아 적었다 — 한 원이라도 움직이면
 * 결산이 이중 계산되고 있거나 배율이 다른 자리에서 붙은 것이다.
 *
 * ⚠ **2026-08-20 (P6) 재기준.** 경제 자체가 바뀌면 이 숫자는 당연히 움직인다 —
 * 빠지 시설 42종이 입장권에 포함되어 요금이 0 이 됐고 (`charge: 'included'`) 그만큼이
 * 입장료로 옮겨 갔다 (1,000 → 3,800). 이 파일이 지키는 것은 **금액이 아니라 항등**
 * (실시간 입금의 합 = 결산 총액)이므로, 재기준은 정당하고 아래 대조군(차액 정산을
 * 끄면 어긋난다)이 여전히 그 항등을 증명한다.
 *
 * 재기준이 P6 때문이라는 것은 **되돌려서** 확인했다: 같은 세계를
 * `chargeFaultForTest='all-sale'` + `admissionFee: 1000` 으로 돌리면 아래 옛 값
 * (5637537 …)이 **세 시드 모두 정확히** 재현된다. 수영 체류(S5) 변경은 이 값을 안
 * 움직인다 — 시작 킷 세계에는 수영 구역이 없다.
 */
const BEFORE_K48: Record<number, readonly number[]> = {
  7: [5827351, 6595493, 7401407, 8312556, 9046736, 9923385],
  42: [5822586, 6731483, 7670318, 8552089, 9435441, 10443336],
  20260818: [5807119, 6698328, 7568130, 8425738, 9315331, 10128282],
};

function sixWeeks(seed: number, runner: WeekRunner): number[] {
  const rng = new Rng(seed);
  const out: number[] = [];
  for (let wk = 0; wk < 6; wk++) {
    runner.run(rng.fork(wk), LOADED);
    out.push(runner.cash);
  }
  return out;
}

describe('K48 실시간 수입 — 주 중간에 현금이 오른다', () => {
  it('★ 며칠 진행하면 현금이 주 시작보다 크다', () => {
    const { runner } = makeWorld(20260818);
    const start = runner.cash;
    runner.begin(new Rng(1), { priceMult: 1 });
    // 손님이 들어와 표를 사고 시설을 한 바퀴 돌 만큼 — 사흘
    runner.step(TICKS_PER_DAY * 3);
    const mid = runner.cash;
    expect(mid).toBeGreaterThan(start);
    // 남은 날을 마저 돌리고 결산해도 그대로 늘어 있어야 한다
    runner.step(TICKS_PER_WEEK);
    const rep = runner.finish();
    expect(runner.cash).toBe(start + rep.profit);
  });

  it('현금은 하루 안에서도 계속 오른다 (붙박이가 아니다)', () => {
    const { runner } = makeWorld(20260818);
    runner.begin(new Rng(1), { priceMult: 1 });
    const marks: number[] = [];
    for (let k = 0; k < 12; k++) {
      runner.step(TICKS_PER_DAY / 4);
      marks.push(runner.cash);
    }
    // 한 번도 줄지 않고, 적어도 절반 구간에서는 실제로 올랐다
    for (let k = 1; k < marks.length; k++) {
      expect(marks[k]).toBeGreaterThanOrEqual(marks[k - 1] as number);
    }
    const rises = marks.filter((v, k) => k > 0 && v > (marks[k - 1] as number)).length;
    expect(rises).toBeGreaterThanOrEqual(marks.length / 2);
    runner.abort();
  });
});

describe('K48 총액 동일성 — 결산이 이중 계산되지 않는다', () => {
  for (const seed of [7, 42, 20260818]) {
    it(`★ 시드 ${seed}: 6주 최종 현금이 K48 이전과 완전히 같다`, () => {
      const { runner } = makeWorld(seed);
      expect(sixWeeks(seed, runner)).toEqual(BEFORE_K48[seed]);
    });
  }

  it('음성 대조군 — 차액 정산을 끄면(이중 계산) 총액이 어긋난다', () => {
    const { runner } = makeWorld(20260818);
    runner.setDoubleCountFaultForTest(true);
    const got = sixWeeks(20260818, runner);
    expect(got).not.toEqual(BEFORE_K48[20260818]);
    // 이중 계산이므로 **더 많아야** 한다 — 우연한 불일치가 아니라는 확인
    expect(got[0]).toBeGreaterThan((BEFORE_K48[20260818] as readonly number[])[0] as number);
  });

  it('배율(카드·콤보·요금)이 실시간 수입에도 정확히 반영된다', () => {
    // 같은 세계·같은 rng 로 배율만 바꾼다. 실시간 입금이 배율을 놓치면 profit 과
    // 현금 증가가 갈라진다 — 두 판 다 `cash 증가 === profit` 이어야 한다
    for (const mult of [1, 1.5]) {
      const { runner } = makeWorld(42);
      const start = runner.cash;
      const rep = runner.run(new Rng(9), {
        ...LOADED,
        combos: { satisfactionDelta: 0, revenueMult: mult },
      });
      expect(runner.cash - start).toBe(rep.profit);
    }
  });

  it('abort() 는 흔적을 안 남긴다 — 실시간으로 넣은 돈도 되돌린다', () => {
    const { runner } = makeWorld(20260818);
    const start = runner.cash;
    runner.begin(new Rng(1), { priceMult: 1 });
    runner.step(TICKS_PER_DAY * 3);
    expect(runner.cash).toBeGreaterThan(start); // 실제로 넣었다가
    runner.abort();
    expect(runner.cash).toBe(start); // 되돌렸다
    expect(runner.week).toBe(0);
  });

  it('run() 과 분할 step() 의 최종 현금이 같다 (항등의 현금 판)', () => {
    const a = makeWorld(7).runner;
    const b = makeWorld(7).runner;
    a.run(new Rng(3), LOADED);
    b.begin(new Rng(3), LOADED);
    for (const n of [1, 7, 120, 313, TICKS_PER_WEEK]) b.step(n);
    b.finish();
    expect(b.cash).toBe(a.cash);
  });
});

describe('K48 수입 사건 — 돈이 어디서 왔나', () => {
  it('사건 금액의 합이 실제 수입과 같고, 자리는 실제 시설이다', () => {
    const { runner, placement } = makeWorld(20260818);
    const events: IncomeEvent[] = [];
    runner.setIncomeObserver((es) => events.push(...es));
    const start = runner.cash;
    runner.begin(new Rng(1), { priceMult: 1.2 });
    runner.step(TICKS_PER_DAY * 2);
    const earned = runner.cash - start;
    expect(events.length).toBeGreaterThan(0);
    expect(events.reduce((a, e) => a + e.amount, 0)).toBe(earned);

    const handles = new Set(placement.all().map((f) => f.handle));
    const gates = new Set(
      placement.all().filter((f) => f.defId === GATE_FACILITY_ID).map((f) => f.handle),
    );
    for (const e of events) {
      expect(e.amount).toBeGreaterThan(0);
      // 구역(수영)은 placement 밖이라 handle 이 크다 — 시설이면 실재해야 한다
      if (e.handle < 1 << 20) expect(handles.has(e.handle)).toBe(true);
      expect(e.kind === 'admission' ? gates.has(e.handle) : !gates.has(e.handle)).toBe(true);
    }
    // 입장권은 매표소에서만 난다
    expect(events.some((e) => e.kind === 'admission')).toBe(true);
    runner.abort();
  });

  it('관찰자는 결과를 바꾸지 않는다 (결정론 — 붙여도 총액이 같다)', () => {
    const { runner } = makeWorld(42);
    runner.setIncomeObserver(() => {});
    expect(sixWeeks(42, runner)).toEqual(BEFORE_K48[42]);
  });
});

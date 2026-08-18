import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, EDGE_SOLID, DIR_J_MINUS } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { WeekRunner, type Season } from './week.js';
import { evaluateCombos } from './combos.js';
import {
  questStatuses,
  ProgressStore,
  gradeFor,
  nextGrade,
  Reputation,
  GRADES,
  admissionLimit,
} from './progress.js';
import { assessRisk } from './risk.js';
import { CardStore, CARD_RNG_SALT } from './cards.js';
import { StaffStore, STAFF_ROLES, neededFor } from './staff.js';

/**
 * 골든 시나리오 — **밸런스 회귀를 잡는 마지막 장치**.
 *
 * 고정 시드 + 고정 건설 순서로 12주를 돌리고, 결과 숫자를 못박는다.
 * 튜닝 값을 하나 바꿨을 때 "무엇이 얼마나 움직였는지"가 여기서 드러난다.
 *
 * ## 값이 바뀌면 어떻게 하나
 *
 * 이 테스트가 깨지는 것은 **정상**이다 — 밸런싱을 하면 당연히 바뀐다. 중요한 건
 * "의도한 변화인지"를 보는 것이다. 값을 갱신할 때는 커밋 메시지에 **왜 바뀌었는지**를
 * 적을 것. 아무 설명 없이 숫자만 갈아끼우면 이 테스트는 의미를 잃는다.
 *
 * ## 왜 범위가 아니라 정확한 값인가
 *
 * 범위로 두면 느린 드리프트를 못 잡는다 (매번 조금씩 나빠지는데 범위 안에 있다).
 * 정확한 값이면 어떤 변경이 결과를 건드렸는지 즉시 안다.
 */

const GRID_W = 40;
const GRID_H = 32;
const GATE = { i: 2, j: 2 };
const SEED = 20260818;

/** 고정 건설 순서 — 사람이 초반에 실제로 지을 순서를 흉내낸다 */
const BUILD_ORDER: readonly [string, number, number][] = [
  ['ticket', 4, 2],
  ['shop', 8, 3],
  ['pyeongsang_row', 8, 6],
  ['toilet', 12, 8], // 2×2 라 벽 사이 1칸 띠(j=6)에는 안 들어간다 — 벽 j=7 아래에 붙인다
  ['washbasin_row', 15, 6],
  ['shower_row', 18, 6],
  ['locker_row', 22, 6],
  ['snackbar', 8, 10],
  ['cafe', 12, 10],
  ['sunbed_row', 16, 10],
  ['lifering', 20, 10],
  ['infirmary', 22, 10],
  ['parasol', 25, 10],
  ['flowerbed', 26, 10],
  ['photozone', 27, 11],
];

interface Golden {
  facilities: number;
  /** 새 시스템까지 못박는다 — 안 그러면 카드·직원·코스 회귀를 골든이 못 잡는다 */
  cards: number;
  staffWages: number;
  courseRevenue: number;
  avgLevel: number;
  combos: number;
  grade: number;
  exitSat: number;
  visitors: number;
  turnedAway: number;
  profitSign: number;
  questsDone: number;
  riskLevel: string;
}

function playGolden(weeks: number): Golden {
  const rng = new Rng(SEED);
  const t = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1));
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  const week = new WeekRunner(t, p, g);
  const progress = new ProgressStore();

  // 실내동 벽 두 줄 (벽부착 시설이 붙을 곳)
  // 벽부착 시설이 붙을 경계 (K25: 벽은 타일이 아니라 경계에 있다)
  for (let i = 10; i < 26; i++) w.setEdge(i, 6, DIR_J_MINUS, EDGE_SOLID);
  for (let i = 10; i < 26; i++) w.setEdge(i, 8, DIR_J_MINUS, EDGE_SOLID);

  let placed = 0;
  for (const [id, i, j] of BUILD_ORDER) {
    if (p.place(t, w, GATE, id, i, j).ok) placed++;
  }
  g.invalidate();

  /*
   * 새 시스템을 **고정된 방식으로** 넣는다 — 골든은 무작위 정책이 아니라 재현 가능한
   * 한 판이어야 한다. 카드는 항상 0번(폐쇄 없는 쪽), 직원은 필요 인원, 요금은 정가,
   * 개선은 앞 세 시설만 한 단계.
   */
  const cards = new CardStore();
  const cardRng = rng.fork(CARD_RNG_SALT);
  const staff = new StaffStore();
  const staffRng = rng.fork(0x57aff);
  for (const role of STAFF_ROLES) staff.set(role.id, neededFor(role, p));
  for (const item of p.all().slice(0, 3)) p.upgrade(item.handle);

  const seasons: Season[] = ['summer', 'summer', 'summer', 'autumn'];
  /**
   * 매주 등급을 반영한다 — 등급이 동시 손님 상한과 방문 수요를 올린다.
   * 이게 없으면 시설만 늘고 수요·입장이 막혀 후반에 손익이 꺾인다.
   */
  /*
   * 평판은 **이동평균**이고 등급에는 이력이 걸린다 (§9.2). 골든이 지난주 값 하나를 쓰면
   * 게임과 다른 경로를 재게 된다 — 진동을 없앤 변경이 골든에 안 잡힌다.
   */
  const reputation = new Reputation();
  let gradeNo = 1;
  const applyGrade = (sat: number): number => {
    reputation.push(sat);
    const gr = nextGrade(gradeNo, reputation.value);
    gradeNo = gr.grade;
    // 등급 상한과 공급 중 작은 쪽 — 슬롯보다 많이 받으면 줄만 길어진다
    g.setMaxGuests(admissionLimit(gr, p.totalCapacity()));
    return gr.reputationPull;
  };
  let cardCount = 0;
  const runOne = (season: Season, pull: number): ReturnType<typeof week.run> => {
    for (const card of cards.draw(cardRng, { season, week: week.week + 1, grade: gradeFor(0).grade })) {
      // 폐쇄가 없는 첫 선택지 — 폐쇄를 고르면 그 주 손님이 0이라 골든이 무의미해진다
      let pick = 0;
      for (let oi = 0; oi < card.options.length; oi++) {
        if (!card.options[oi]?.effects.some((e) => e.closed)) {
          pick = oi;
          break;
        }
      }
      cards.choose(cardRng, card, pick);
      cardCount++;
    }
    const eff = staff.effects(p);
    const r = week.run(rng, {
      season,
      reputation: pull,
      priceMult: 1,
      modifiers: cards.modifiers(),
      staff: {
        wages: eff.wages,
        satisfactionDelta: eff.satisfactionDelta,
        foodMult: eff.foodMult,
        idle: staff.idleHandles(p, staffRng),
      },
    });
    cards.tickWeek();
    return r;
  };

  let pull = applyGrade(0);
  let last = runOne('summer', pull);
  for (let k = 1; k < weeks; k++) {
    pull = applyGrade(last.exitSatisfaction);
    last = runOne(seasons[k % seasons.length] as Season, pull);
    progress.claim(questStatuses(p, last));
  }

  return {
    facilities: placed,
    cards: cardCount,
    staffWages: last.wages,
    courseRevenue: last.courseRevenue,
    avgLevel: Math.round(p.averageLevel() * 100) / 100,
    combos: evaluateCombos(p).active.length,
    grade: gradeNo,
    exitSat: Math.round(last.exitSatisfaction),
    visitors: last.visitors,
    turnedAway: last.turnedAway,
    profitSign: Math.sign(last.profit),
    questsDone: progress.claimedCount,
    riskLevel: assessRisk(p, g).level,
  };
}

describe('골든 시나리오 — 고정 시드·고정 건설 순서', () => {
  const g = playGolden(12);

  it('건설 순서 15개가 전부 놓인다 — 하나라도 막히면 배치 규칙이 바뀐 것이다', () => {
    expect(g.facilities).toBe(15);
  });

  it('12주 뒤 숫자가 못박힌 값과 같다', () => {
    /**
     * ⚠ 이 값을 갱신할 때는 커밋 메시지에 **왜 바뀌었는지** 적을 것.
     * 기댓값을 `g.x` 로 두면 자기 자신과 비교하는 동어반복이 되어 아무것도 못 잡는다
     * (첫 작성에서 실제로 그렇게 썼다).
     *
     * 2026-08-18 기준값. 이 시점의 튜닝:
     *   useTicks 12 · wantUses 4 · useGains [14,10,7,4] · walkPenalty 0.35 · waitPenalty 0.12
     *   등급 상한 30/50/75/105/150 · 수요 배율 1.0/1.35/1.7/2.1/2.5 · admissionLimit(공급×1.5)
     *   손님 그룹 4종 (§10.4) · 요금 ×0.465 (이용 완료 계수 정정 보정)
     *
     * ### 갱신 이력 — 왜 바뀌었나
     *
     * **2026-08-18 후반 정체 수정** (visitors 113→89 · exitSat 63→68 · grade 2→3):
     * 입장 상한이 정원 60 고정에서 `min(등급 상한, 공급×1.5)` 로 바뀌었다. 이 구성은
     * 시설 15개라 공급이 얇아 상한이 60 → 50 으로 내려간다. **방문객이 줄고 만족도가
     * 오른 것이 이 변경의 의도다** — 슬롯보다 많이 받으면 줄만 길어져 만족도가 붕괴하고,
     * 등급이 떨어져 수요가 줄고 다시 만족도가 떨어지는 죽음의 나선이 생겼다
     * (36주 실측: 만석 100% · 만족도 0 · 손익 37% 하락). 만족도가 올라 등급이 3이 되고,
     * 위험도가 경계→주의로 내려간 것도 동시 손님이 줄어든 결과다 (혼잡이 위험 요인).
     *
     * **2026-08-18 손님 그룹 4종** (visitors 89→93 · turnedAway 4→0 · exitSat 68→69):
     * 손님이 **일행 단위**로 들어온다 (§10.4). 일행 인원만큼 연속으로 들어오므로 도착
     * 타이밍이 뭉치고, 그 결과 이 구성에서는 만석이 사라졌다 — 상한에 닿기 전에 앞선
     * 일행이 빠져나간다. 유형별 수요 편향(`needBias`)이 목적지 선택에 붙어 만족도가
     * 1 올랐다.
     *
     * 같은 커밋에서 **요금 계수를 정정**했다: 기존에는 `usingBefore − usingNow` 로
     * "이용을 끝낸 수"를 셌는데 같은 tick 에 시작과 종료가 겹치면 놓쳤다. 손님 쪽이
     * 완료를 직접 세도록 바꾸니 매출이 약 2.15배가 되어, 밸런스 지점을 유지하려고
     * 요금 데이터를 ×0.465 했다. 이 항목의 `profitSign` 은 그대로다.
     *
     * **2026-08-18 새 시스템을 골든에 넣었다** (exitSat 69→71 · visitors 93→97 ·
     * turnedAway 0→1, 그리고 `cards`·`staffWages`·`courseRevenue`·`avgLevel` 추가):
     * 카드·직원·개선이 골든에 없으면 **그 셋의 회귀를 골든이 못 잡는다** — 시뮬 절반이
     * 못박히지 않은 상태였다. 직원을 필요 인원만큼 쓰고 앞 세 시설을 한 단계 개선하니
     * 만족도가 2 오르고 방문객이 늘었다. `courseRevenue` 0 은 이 시나리오에 코스를 안
     * 놓았기 때문이고, **0 이 아니게 되면 그건 코스가 어딘가에서 새로 생겼다는 뜻**이다.
     *
     * **2026-08-18 벽이 경계로 옮겨갔다** (exitSat 63→72 · visitors 109→118 ·
     * turnedAway 14→5 · questsDone 5→6): 벽이 더 이상 **칸을 먹지 않는다** (K25).
     * 예전엔 벽부착 시설을 놓으려고 세운 벽 두 줄이 통행 가능한 32칸을 통째로 지웠고,
     * 손님은 그걸 돌아서 걸었다. 지금은 같은 벽이 타일 **경계**에 서므로 바닥이 그대로
     * 남는다 — 걷는 거리가 줄어 만족도가 오르고(걷기 감점이 준다), 회전이 빨라져 같은
     * 상한에서 더 많이 받는다. **개선이 아니라 모델 변경의 직접 결과다.**
     */
    expect(g).toEqual({
      facilities: 15,
      combos: 7,
      grade: 3,
      exitSat: 72,
      visitors: 118,
      turnedAway: 5,
      profitSign: 1,
      questsDone: 6,
      riskLevel: 'caution',
      cards: 12,
      staffWages: 22_500,
      courseRevenue: 0,
      avgLevel: 1.2,
    });
  });

  it('콤보가 이 구성에서 기대만큼 터진다', () => {
    // 매점+평상 · 화장실+세면대 · 샤워+락커 · 구명함+의무실 · 화단+정자 등
    expect(g.combos).toBeGreaterThanOrEqual(4);
    expect(g.combos).toBeLessThanOrEqual(20);
  });

  it('만족도가 중간 범위다 — 만점이면 배치가 결과를 안 바꾼다', () => {
    expect(g.exitSat).toBeGreaterThan(45);
    expect(g.exitSat).toBeLessThan(85);
  });

  it('등급이 동시 손님 상한과 수요를 올린다 — 성장의 유일한 축', () => {
    const g1 = gradeFor(0);
    const g5 = gradeFor(100);
    expect(g5.maxGuests).toBeGreaterThan(g1.maxGuests);
    expect(g5.reputationPull).toBeGreaterThan(g1.reputationPull);
    for (let k = 1; k < 5; k++) {
      expect(GRADES[k]!.maxGuests).toBeGreaterThan(GRADES[k - 1]!.maxGuests);
      expect(GRADES[k]!.reputationPull).toBeGreaterThan(GRADES[k - 1]!.reputationPull);
    }
  });

  it('한 방문이 하루 안에 끝난다 — 넘으면 공원이 영구히 포화된다', () => {
    // 이용 12 × 4회 + 이동 약 40 = 88 tick < 하루 120 tick
    const visitTicks = GUEST_DEFAULTS.useTicks * GUEST_DEFAULTS.wantUses + 40;
    expect(visitTicks).toBeLessThan(120);
  });

  it('만석이 수요의 절반을 넘지 않는다 — 넘으면 늘려도 안 들어온다', () => {
    expect(g.turnedAway).toBeLessThan(g.visitors);
  });

  it('등급이 최고가 아니다 — 처음부터 다 열리면 해금이 무의미하다', () => {
    expect(g.grade).toBeGreaterThanOrEqual(1);
    expect(g.grade).toBeLessThan(5);
  });

  it('흑자다 — 이 정도 구성으로 적자면 유지비가 과하다', () => {
    expect(g.profitSign).toBe(1);
  });

  it('의뢰가 진행된다', () => {
    expect(g.questsDone).toBeGreaterThan(0);
  });

  it('안전 시설을 지었으니 위험 단계가 아니다', () => {
    expect(g.riskLevel).not.toBe('danger');
  });

  it('같은 시드는 같은 결과 — 두 번 돌려도 같다', () => {
    expect(playGolden(12)).toEqual(g);
  });
});

describe('밸런스 성질 — 값이 아니라 관계를 못박는다', () => {
  it('시설을 늘리면 방문객이 늘어난다', () => {
    const build = (n: number): number => {
      const rng = new Rng(777);
      const t = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1));
      const w = new WallGrid(GRID_W, GRID_H);
      const p = new PlacementGrid(GRID_W, GRID_H);
      for (let k = 0; k < n; k++) {
        p.place(t, w, GATE, 'shop', 6 + (k % 8) * 3, 8 + Math.floor(k / 8) * 3);
      }
      const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
      g.invalidate();
      return new WeekRunner(t, p, g).run(new Rng(778), { season: 'summer' }).arrivals;
    };
    expect(build(8)).toBeGreaterThan(build(1));
  });

  it('멀리 놓으면 만족도가 떨어진다 — 거리가 판단이어야 한다', () => {
    const sat = (dist: number): number => {
      const rng = new Rng(555);
      const t = new KairoTerrain(GRID_W, GRID_H);
      for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) t.paint(i, j, 'lawn');
      const w = new WallGrid(GRID_W, GRID_H);
      const p = new PlacementGrid(GRID_W, GRID_H);
      for (let k = 0; k < 4; k++) p.place(t, w, GATE, 'shop', 4 + dist, 4 + k * 3);
      const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
      g.invalidate();
      return new WeekRunner(t, p, g).run(rng, { season: 'summer' }).exitSatisfaction;
    };
    expect(sat(2)).toBeGreaterThan(sat(28));
  });

  it('겨울이 여름보다 손님이 적다 — 여름이 주력이다', () => {
    const visitors = (season: Season): number => {
      const t = new KairoTerrain(GRID_W, GRID_H);
      for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) t.paint(i, j, 'lawn');
      const w = new WallGrid(GRID_W, GRID_H);
      const p = new PlacementGrid(GRID_W, GRID_H);
      p.place(t, w, GATE, 'shop', 6, 6);
      const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
      g.invalidate();
      return new WeekRunner(t, p, g).run(new Rng(1000), { season }).arrivals;
    };
    expect(visitors('summer')).toBeGreaterThan(visitors('winter'));
  });
});

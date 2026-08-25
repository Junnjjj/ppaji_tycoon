import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { bakeIndoorWalls } from './indoor.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { GuestStore, GUEST_DEFAULTS, OPEN_GATE_DEFAULTS } from './guests.js';
import { WeekRunner, forkWeekRngStreams, type Season } from './week.js';
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

/*
 * ⚠ **실제 판과 같은 격자여야 한다** (K36). 예전엔 40×32 였다 — K25 에서 게임이
 * 64×48 이 되고 K36 에서 96×72 가 되는 동안 골든은 **아무도 안 쓰는 크기**를 지키고
 * 있었다. 그러면 회귀 테스트가 실제 회귀를 못 잡는다.
 *
 * 좌표는 **입구를 따라 옮겼다.** 도시 띠(위 8줄) 아래로 8칸 내리고, 가로로는 +33 —
 * 입구가 맵 가운데(i=48)로 갔기 때문이다. 옮기지 않으면 손님이 20칸을 걸어야 해서
 * 골든이 "먼 데 지은 판"을 재게 된다 (실측: 만족도 71→58 · 방문객 115→79).
 */
const GRID_W = 96;
const GRID_H = 72;
const GATE = KairoTerrain.parkGate();
const BAND = KairoTerrain.CITY_BAND;
const SEED = 20260818;

/** 고정 건설 순서 — 사람이 초반에 실제로 지을 순서를 흉내낸다 */
const BUILD_ORDER: readonly [string, number, number][] = [
  ['ticket', 37, 10],
  ['shop', 41, 11],
  ['pyeongsang_row', 41, 14],
  ['toilet', 45, 16], // 2×2 라 벽 사이 1칸 띠(j=6)에는 안 들어간다 — 벽 j=7 아래에 붙인다
  ['washbasin_row', 48, 14],
  ['shower_row', 51, 14],
  ['locker_row', 55, 14],
  ['snackbar', 41, 18],
  ['cafe', 45, 18],
  ['sunbed_row', 49, 18],
  ['lifering', 53, 18],
  ['infirmary', 55, 18],
  ['parasol', 58, 18],
  ['flowerbed', 59, 18],
  ['photozone', 60, 19],
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
  /** 입장료 수입과 매표소를 못 지난 손님 (K36-B②) — 입장 경로도 못박아야 회귀가 잡힌다 */
  admission: number;
  /**
   * 별도 구매 수입 (P6) — 음식·자리 대여·숙박에서 그 자리에서 받은 돈.
   *
   * ⚠ 입장료와 **따로** 못박는다. 총수입 하나만 보면 "빠지 시설을 표에 넣었다"가
   * 조용히 되돌아가도 (전부 다시 유료가 돼도) 총액이 비슷하면 통과한다.
   */
  sales: number;
  noTicket: number;
  profitSign: number;
  questsDone: number;
  riskLevel: string;
}

function playGolden(weeks: number): Golden {
  const rng = new Rng(SEED);
  const t = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1));
  /*
   * 육지를 통째로 포장한다 — K32-B 부터 잔디는 손님이 못 지나간다.
   *
   * 골든이 못박는 것은 경제·성장 곡선이지 길 설계가 아니다. 전부 포장하면 K32-B 이전과
   * 보행 조건이 같아지므로 **아래 숫자가 그대로 남는 것이 이 변경이 경제에 중립이라는 증거**다.
   * 길 규칙 자체는 `walls.test.ts` 의 잔디/포장 대조가 본다.
   */
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) if (t.isWalkable(i, j)) t.paint(i, j, 'path_stone');
  }
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  const week = new WeekRunner(t, p, g);
  const weekRngStreams = forkWeekRngStreams(rng);
  const progress = new ProgressStore();

  /*
   * 실내동 — 위생 시설 4종이 들어갈 방이다. **바닥을 깔면 그게 방이다** (K27).
   * 벽은 그 외곽선으로 자동 생성된다.
   */
  for (let j = 5 + BAND; j < 10 + BAND; j++) for (let i = 10 + 33; i < 26 + 33; i++) t.paint(i, j, 'floor_indoor');
  bakeIndoorWalls(t, w, GATE, guestWalkable(t, p));

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
    const r = week.run(weekRngStreams, {
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
    admission: last.admission,
    sales: last.sales,
    noTicket: last.noTicket,
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
     *
     * **2026-08-18 실내동이 진짜 방이 됐다** (exitSat 72→73 · visitors 118→119 ·
     * turnedAway 5→4): 실내 시설의 조건이 "벽에 접함"에서 "건물 안"으로 바뀌어
     * (K25 검토 ①) 골든도 경계 두 줄 대신 16×5 방 하나를 짓는다. 방에는 문이 하나뿐이라
     * 동선이 조금 달라졌다. 변화가 1 안팎인 것이 오히려 확인 — 벽 두 줄과 방 하나가
     * 손님에게 비슷한 장애물이었다는 뜻이다.
     *
     * **2026-08-18 골든이 드디어 실제 격자를 본다** (exitSat 73→71 · visitors 119→115 ·
     * turnedAway 4→8): 이 파일은 K9 부터 **40×32** 였다. 게임은 K25 에 64×48, K36 에
     * 96×72 가 됐는데 골든은 아무도 안 쓰는 크기를 지키고 있었다 — 회귀 테스트가
     * 실제 회귀를 못 잡는 상태였다. 이제 96×72 · 게이트 (4,3) 이고 건설 순서는
     * 도시 띠 아래로 3칸 내렸다.
     *
     * 숫자가 바뀐 것이 아니라 **재는 대상이 바뀌었다.** 맵이 96×72 가 되고 입구가
     * 가운데(i=48)로 갔다. 건설 순서를 입구 쪽으로 옮기지 않으면 손님이 20칸을 걸어야 해서
     * 골든이 "먼 데 지은 판"을 잰다 (그 상태 실측: 만족도 58 · 방문객 79 · 등급 2).
     *
     * 옮긴 뒤: exitSat 73→74 · visitors 119→129 · turnedAway 4→26 · grade 3→4.
     * 등급 상한이 30/50/75/105/150 → 40/70/110/160/230 으로 올라 더 받고, 그만큼
     * 공급(시설 15개)이 못 따라가 만석이 는다. **상한을 올린 직접 결과다** —
     * 넓힌 땅을 쓰려면 상한도 같이 올라야 하고, 그러면 시설을 더 지어야 한다.
     *
     * **2026-08-19 매표소를 거쳐야 입장한다 (K36-B②)** (visitors 129→114 ·
     * turnedAway 26→23 · exitSat 74→68 · grade 4→3, 그리고 `admission`·`noTicket` 추가):
     * 손님이 게이트가 아니라 **정류장**(48,3)에 내려 매표소(37,10)를 지나야 들어온다.
     * 세 가지가 함께 움직였다.
     *
     *   ① **입장이 늦다.** 정류장→매표소가 18칸(≈72 tick)이라, 주 마지막 날에 도착한
     *      손님 일부가 그 주 안에 입장을 못 끝낸다. 그게 방문객 −15 의 대부분이다.
     *      정원은 안 먹으므로(밖에 있다) 만석은 오히려 줄었다.
     *   ② **매표소가 놀거리에서 빠졌다.** "표는 놀이가 아니다" 라서 목적지 후보가
     *      15 → 14 로 줄었고, 그만큼 손님이 더 멀리 걷는다 (걷기 감점 ↑). 만족도 −6 의
     *      대부분이 여기서 나오고, 등급이 4→3 으로 내려간 것도 그 결과다.
     *   ③ 정류장→매표소 구간은 **걷기 감점을 안 받는다** — 안 그러면 플레이어가 못 줄이는
     *      18칸이 그대로 벌점이 되어 ②보다 훨씬 크게 깎였을 것이다 (그 상태 실측 없음,
     *      설계상 −4 안팎).
     *
     * `admission` 1,140,000 = 입장객 114명 × ₩10,000 × 요금배율 1.0 **정확히**다.
     * 식음 직원 배율·카드 매출 배율은 표값에 안 붙는다 (표는 매점이 안 판다) — 이 값이
     * 인원×정가와 어긋나면 어딘가에서 배율이 새고 있다는 뜻이다.
     * `noTicket` 0 은 이 구성에서 매표소가 닿는다는 뜻이고, **0 이 아니게 되면 그건
     * 배치 규칙이나 길이 바뀌어 입장이 막혔다는 뜻**이다.
     */
    /*
     * **2026-08-19 버스가 도착을 뭉치게 했다** (visitors 114→99 · turnedAway 23→14 ·
     * admission 114,000→99,000): 손님이 매 tick 흩어져 나타나던 것이 **정차 중에 몰아서**
     * 내리게 됐다 (K36-B③). 한 무리가 같이 걷고 같이 매표소에 줄 서므로 회전이 달라진다.
     *
     * ⚠ **수요 총량은 그대로다** — 실측으로 6주 도착 수가 버스 게이트 588 · 상시 하차
     * 588 로 같다. 하루 끝에 남은 수요를 그날 안에 털어 내기 때문이다. 총량이 줄었다면
     * 그건 버스 시간표가 조용히 수요를 깎은 것이고, 그러면 밸런스가 왜 움직였는지 못 가린다.
     */
    /*
     * **2026-08-19 입장료를 이 게임의 눈금으로 내렸다** (admission 1,140,000 → 114,000):
     * 설계 §13.1 의 명목가 ₩10,000 을 그대로 넣었더니 입장료 한 번이 시설 이용 **열 번**
     * 값이 됐다 — 시설 요금이 이미 1/10 눈금이기 때문이다 (설계의 식음 ₩8,000 이
     * 데이터에는 `fee: 800`, 요금 중앙값 900). 실측으로 26주 현금 중앙값이
     * 400만 → **2,854만** 으로 튀었다. 1,000 으로 내리면 설계가 정한 비율
     * (입장료 : 식음 ≈ 1.25 : 1)이 그대로 살고, 26주 현금은 642만이 된다 —
     * 입장료를 새로 받은 만큼(+60%)이지 경제가 뒤집힌 것이 아니다.
     */
    /*
     * **2026-08-19 버스 시계를 주 루프 시계에 묶었다** (visitors 99→118 ·
     * turnedAway 14→27 · admission 99,000→118,000 · questsDone 6→5):
     * 버스가 `t` 를 따로 세고 있어서 재생 프레임의 tick 과 한 칸 어긋났다 —
     * 연출에서 버스와 손님이 다른 시각을 살았다. `setElapsed(tick)` 으로 묶으면서
     * 정차 창이 한 tick 앞당겨졌고, 그 한 칸이 840tick×7일에 걸쳐 누적돼
     * 어느 무리가 어느 차에 타는지가 바뀌었다.
     *
     * ⚠ **수요 총량은 여전히 그대로다** (`admission.test.ts` 의 보존 검사가 지킨다).
     * 늘어난 것은 태운 인원이 아니라 **회전** 이다 — 그래서 입장(118)과 함께
     * 만석 거절(27)도 같이 늘었다. 총량이 바뀌었다면 시간표가 수요를 만들어 낸 것이고,
     * 그건 버그다.
     */
    // K43 재기준: 카드 풀 24→26(계절 입고)이 뽑기 순서를 바꿨다 — 입장 118→121 ·
    // 만족 69→71 · 만석 27→36 · 의뢰 5→6. 방향이 흩어져 있어 총량 버그가 아니라
    // 뽑기 이동이다 (같은 시드 반복은 여전히 완전 일치).
    /*
     * **2026-08-20 (P6) 빠지 시설을 입장권에 넣었다** (admission 121,000 → 459,800):
     * 시설 75종이 이용마다 돈을 받던 것을 실제 빠지처럼 갈랐다 — 물놀이·위생·경관·운영
     * 42종은 표에 포함(`charge: 'included'`, 이용 요금 0)이고 음식·자리 대여·숙박·보트
     * 대여 33종만 그 자리에서 산다. 사라진 요금은 표값으로 옮겼다 (1,000 → 3,800).
     *
     * ⚠ **손님 쪽 숫자는 한 개도 안 움직였다** — visitors 121 · turnedAway 36 ·
     * exitSat 71 · questsDone 6 이 그대로다. 요금은 목적지 선택(`pickTarget`)에 안
     * 들어가므로 궤적이 비트 단위로 같아야 하고, 실제로 그랬다. 이 줄 하나만 움직인
     * 것이 "구성만 바꿨고 게임플레이는 안 건드렸다"의 증거다.
     *
     * `admission` = 입장객 × 3,800 × 요금배율 1.0 **정확히**다.
     * `sales` 는 그 판에 남은 유료 시설(매점·분식류)에서만 나온다.
     */
    /*
     * **2026-08-22 (K52 4단계) 거리장 목적지를 앞 두 면으로 좁혔다**
     * (visitors 121 → 83 · turnedAway 36 → 9 · exitSat 71 → 63 · grade 3 → 2 ·
     * admission 459,800 → 315,400 · sales 265,809 → 236,426 · questsDone 6 → 5).
     *
     * `rebuildFields()` 가 시설마다 발자국 **4이웃 전부**를 목적지로 두던 것을
     * `entryTilesOf` 의 **앞 두 면**(+I·+J)으로 좁혔다. 손님이 건물 뒷면으로 들어가던
     * 것을 고친 변경이고, 대가는 **걷는 거리**다.
     *
     * 인과는 한 줄이다: 접근 칸이 절반 이하로 줄어 우회가 길어지고 →
     * `walkPenalty` 가 쌓여 **exitSat 71 → 63** → 평판이 내려가 **등급 3 → 2** →
     * 등급이 정하는 수요·상한이 같이 내려가 **visitors 121 → 83**.
     * `turnedAway` 가 36 → 9 로 **같이** 내려간 것이 이 해석의 근거다 — 상한에 눌린
     * 것이라면 거절이 늘어야 한다. 줄어든 것은 상한이 아니라 **찾아온 수요**다.
     *
     * `admission` 315,400 = 83 × 3,800 × 1.0 **정확히**로 남는다 (P6 의 성질 보존).
     * `facilities 15` · `combos 7` · `cards 12` · `staffWages` · `avgLevel` 은 그대로다 —
     * 배치도 콤보도 뽑기도 안 건드렸다는 뜻이다.
     *
     * ⚠ **이 변경이 유일한 원인임을 코드로 확인했다**: `setEntryFaultForTest(true)`
     * (= 좁히기 이전의 목적지 집합)를 켜면 이 파일의 15개 검사가 **옛 값 그대로**
     * 전부 통과한다. 숫자를 갈아 끼우기 전에 그 대조를 먼저 돌린 것이 근거다.
     *
     * **2026-08-25 (Phase 3) 조리 메뉴를 실제 구매에 배선했다**: 매점의 정적 평균 요금
     * 대신 장착된 시작 메뉴 `shop_can_drink`의 실제 가격을 받으면서 sales만
     * 236,426 → 223,038로 움직였다. 입장·만석·만족·등급·의뢰는 모두 동일하므로
     * 손님 궤적이나 성장 규칙 변경이 아니라 가격 정본을 시설 fee→메뉴로 옮긴 결과다.
     *
     * **2026-08-25 (Phase 6) 일반 카드 페이싱**: 12주 12장 → 4장. 카드 효과가
     * 덬 겹치며 exitSat 59·grade 3이 됐고, 등급 상한과 수요 조합이 바뀌어 방문 69·
     * 거절 27·입장료 262,200·별도구매 287,714로 이동했다. 카드 수 4가 새 페이싱을
     * 직접 못박으며, 같은 시드 재실행 검사가 결정론을 따로 지킨다.
     *
     * **2026-08-25 post-review RNG 격리**: 날씨·일반 손님·단골·사고를 영속 fork로
     * 분리하고 골든도 production과 같은 `WeekRngStreams`를 한 번 만들어 계속 쓴다.
     * 단골 분기나 사고 뽑기 수가 다른 도메인을 밀지 않게 한 모델 변경이라 고정 표본이
     * 이동했다 (방문 69→70 · 거절 27→7 · 만족 59→62 · 등급 3→2). 시설/콤보/카드/
     * 직원/코스는 그대로여서 콘텐츠나 경제 공식을 바꾼 결과가 아니다.
     */
    expect(g).toEqual({
      facilities: 15,
      combos: 7,
      grade: 2,
      exitSat: 62,
      visitors: 70,
      turnedAway: 7,
      admission: 266_000,
      sales: 239_782,
      noTicket: 0,
      profitSign: 1,
      questsDone: 5,
      riskLevel: 'caution',
      cards: 4,
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
    /*
     * 이용 12 × 4회 + 이동 약 40 = 88 tick < 하루 120 tick.
     *
     * ⚠ 수영은 체류가 따로다 (`swimTicks`, S5). 4회 중 **한 번이 수영**인 것이 가장
     * 긴 방문이라 (`usedNeeds` 가 같은 수요를 피하므로 `play` 는 보통 한 번) 그쪽으로
     * 잰다: 12 × 3 + 24 + 40 = 100 tick. 여기서 재는 것은 **예산**이고, 실제 관측은
     * `swim.test.ts` 의 「하루 예산」이 판에서 손님을 돌려 확인한다.
     */
    const visitTicks =
      GUEST_DEFAULTS.useTicks * (GUEST_DEFAULTS.wantUses - 1) + GUEST_DEFAULTS.swimTicks + 40;
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
      /* 육지 포장 — 시설 수만 변수로 두려면 길은 상수여야 한다 (K32-B) */
      for (let j = 0; j < GRID_H; j++) {
        for (let i = 0; i < GRID_W; i++) if (t.isWalkable(i, j)) t.paint(i, j, 'path_stone');
      }
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
      for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) t.paint(i, j, 'path_stone');
      const w = new WallGrid(GRID_W, GRID_H);
      const p = new PlacementGrid(GRID_W, GRID_H);
      for (let k = 0; k < 4; k++) p.place(t, w, GATE, 'shop', GATE.i + dist, GATE.j + 1 + k * 3);
      // 거리만 변수로 둔다 — 매표소를 넣으면 그 위치가 두 번째 변수가 된다 (K36-B②)
      const g = new GuestStore(t, w, p, GATE, OPEN_GATE_DEFAULTS);
      g.invalidate();
      return new WeekRunner(t, p, g).run(rng, { season: 'summer' }).exitSatisfaction;
    };
    expect(sat(2)).toBeGreaterThan(sat(28));
  });

  it('겨울이 여름보다 손님이 적다 — 여름이 주력이다', () => {
    const visitors = (season: Season): number => {
      const t = new KairoTerrain(GRID_W, GRID_H);
      for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) t.paint(i, j, 'path_stone');
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

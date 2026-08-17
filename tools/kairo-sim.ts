/**
 * 카이로 헤드리스 밸런싱 러너.
 *
 *   npm run sim:kairo                        기본 (시드 20개 × 12주)
 *   npm run sim:kairo -- --seeds 100 --weeks 24
 *   npm run sim:kairo -- --determinism       같은 시드가 같은 결과를 내는지
 *   npm run sim:kairo -- --json
 *
 * ## 왜 헤드리스인가
 *
 * 불변식 1(sim 은 렌더러를 모른다) 덕에 브라우저 없이 돈다. 이게 도는 것 자체가 그
 * 불변식의 실증이다. 수백 시즌을 몇 초에 돌려야 "이 숫자가 재미있는 범위인가"를 눈이
 * 아니라 분포로 판단할 수 있다.
 *
 * ## 어떤 봇으로 짓나
 *
 * 사람처럼 "결산의 병목을 보고 그 종류를 짓는" 봇이다. 무작위로 짓는 봇은 밸런스가
 * 나쁜지 봇이 멍청한지 구분이 안 된다.
 */
import { Rng } from '../src/sim/rng.js';
import { KairoTerrain } from '../src/sim/kairo/terrain.js';
import { WallGrid, placeWall } from '../src/sim/kairo/walls.js';
import { PlacementGrid, allFacilityDefs } from '../src/sim/kairo/placement.js';
import { GuestStore, GUEST_DEFAULTS } from '../src/sim/kairo/guests.js';
import { WeekRunner, type NeedKind, type Season, type WeekReport } from '../src/sim/kairo/week.js';
import { evaluateCombos } from '../src/sim/kairo/combos.js';
import { CardStore, CARD_RNG_SALT, optionCash } from '../src/sim/kairo/cards.js';
import { StaffStore, STAFF_ROLES, neededFor } from '../src/sim/kairo/staff.js';
import {
  CourseStore,
  PRESETS,
  COURSE_EQUIPMENT,
  defaultHandles,
  validateCourse,
  fitOf,
} from '../src/sim/kairo/course.js';
import { questStatuses, ProgressStore, gradeFor, admissionLimit } from '../src/sim/kairo/progress.js';

const args = process.argv.slice(2);
const flag = (name: string, dflt: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const SEEDS = flag('seeds', 20);
const WEEKS = flag('weeks', 12);
const JSON_OUT = args.includes('--json');
const DETERMINISM = args.includes('--determinism');

const GRID_W = 40;
const GRID_H = 32;
const GATE = { i: 2, j: 2 };

/** 봇이 건설에 안 쓰고 남기는 예비비 — 카드 한 장의 최대 지출을 버틸 만큼 */
const BUILD_RESERVE = 1_500_000;

/** 가장 싼 시설 — 이보다 예산이 적으면 "자리"가 아니라 "돈"이 문제다 */
const CHEAPEST_FACILITY = Math.min(...allFacilityDefs().map((d) => d.cost));

interface RunResult {
  seed: number;
  weeks: number;
  cash: number;
  facilities: number;
  combos: number;
  grade: number;
  exitSat: number;
  turnedAwayRatio: number;
  gaveUpRatio: number;
  questsDone: number;
  bankrupt: boolean;
  /** 주차별 손익 — 성장 곡선을 본다 */
  profitByWeek: number[];
  /** 주차별 계절 — 성장 판정은 **같은 계절끼리** 비교해야 한다 */
  seasonByWeek: Season[];
  /** 건설이 막힌 주 — 돈이 없어서 / 자리가 없어서를 **나눠서** 센다 */
  buildPoor: number;
  buildNoSpace: number;
  /** 뽑힌 카드 수와 카드로 나간 돈 — 카드가 경제를 얼마나 흔드나 */
  cardsSeen: number;
  cardSpend: number;
  /** 주 평균 직원 수와 주차별 인건비 */
  staffWeeks: number;
  wagesByWeek: number[];
  courseCount: number;
  courseFail: string;
  courseRevByWeek: number[];
  /** 주차별 수익·유지비 — "무엇이 손익을 깎는가"를 가른다 */
  revenueByWeek: number[];
  upkeepByWeek: number[];
  cashByWeek: number[];
  buildSpendByWeek: number[];
}

/** 병목을 보고 그 종류를 짓는 봇 */
function buildOne(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  cash: number,
  want: NeedKind | null,
  rng: Rng,
): number {
  const grade = gradeFor(0).grade; // 등급 제한은 아래에서 따로 본다
  void grade;
  const cands = allFacilityDefs()
    .filter((d) => {
      const x = d as unknown as { need?: NeedKind; cost: number };
      if (x.cost > cash) return false;
      if (want && x.need !== want) return false;
      return true;
    })
    .sort((a, b) => {
      const ax = a as unknown as { cost: number };
      const bx = b as unknown as { cost: number };
      return ax.cost - bx.cost;
    });
  if (cands.length === 0) return 0;

  // 싼 쪽 절반에서 하나 뽑는다 — 항상 최저가만 지으면 성장이 안 보인다
  const pick = cands[rng.int(Math.max(1, Math.ceil(cands.length / 2)))];
  if (!pick) return 0;

  for (let attempt = 0; attempt < 200; attempt++) {
    const i = rng.int(GRID_W - pick.size[0]);
    const j = rng.int(GRID_H - pick.size[1]);
    if (p.check(t, w, GATE, pick.id, i, j).ok) {
      p.place(t, w, GATE, pick.id, i, j);
      return (pick as unknown as { cost: number }).cost;
    }
  }
  return 0;
}

function runOne(seed: number, weeks: number): RunResult {
  const rng = new Rng(seed);
  const t = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1));
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  const week = new WeekRunner(t, p, g);
  const progress = new ProgressStore();
  const cards = new CardStore();
  /**
   * 카드는 **전용 RNG 스트림**을 쓴다 (불변식 2). 손님·날씨와 같은 스트림을 쓰면
   * 카드를 하나 더 뽑는 것만으로 날씨 시퀀스가 밀려, 밸런싱 실험에서 변수를 하나만
   * 바꿀 수 없다.
   */
  const cardRng = rng.fork(CARD_RNG_SALT);
  const staff = new StaffStore();
  /** 직원 전용 스트림 — 고장 판정이 날씨·손님을 밀면 안 된다 (불변식 2) */
  const staffRng = rng.fork(0x57aff);
  const courses = new CourseStore();
  /** 코스 전용 스트림 — 장비 선택이 날씨·손님을 밀면 안 된다 (불변식 2) */
  const courseRng = rng.fork(0xc0125);

  // 벽부착 시설을 위해 벽 몇 줄 (플레이어가 실내동을 짓는 걸 흉내낸다)
  for (let i = 6; i < 26; i++) placeWall(t, w, GATE, i, 5);
  for (let i = 6; i < 26; i++) placeWall(t, w, GATE, i, 9);

  let cash = 5_000_000;
  let last: WeekReport | null = null;
  const profitByWeek: number[] = [];
  const seasonByWeek: Season[] = [];
  let buildPoor = 0;
  let buildNoSpace = 0;
  let courseFail = '';
  let cardsSeen = 0;
  let cardSpend = 0;
  let staffWeeks = 0;
  const wagesByWeek: number[] = [];
  const courseRevByWeek: number[] = [];
  const revenueByWeek: number[] = [];
  const upkeepByWeek: number[] = [];
  const cashByWeek: number[] = [];
  const buildSpendByWeek: number[] = [];
  const seasons: Season[] = ['summer', 'summer', 'autumn', 'winter', 'spring'];

  for (let k = 0; k < weeks; k++) {
    // 결산의 병목을 보고 짓는다
    const want = last?.bottleneck?.need ?? null;
    let buildSpend = 0;
    /*
     * 이번 주 건설 예산.
     *
     * 두 가지를 함께 본다 — **수입**과 **쌓인 현금**.
     *   · 매주 무조건 3채를 지으면 유지비·인건비가 붙은 뒤로 초기 자금을 태우다 후반에
     *     아무것도 못 짓는다 (실측: 마지막 8주 건설비 0)
     *   · ⚠ 그렇다고 **수입만** 보면 성장 교착이 생긴다. 초기 자금을 안 쓰니 시설이 12개에
     *     머물고, 슬롯이 모자라 손님이 전부 헛걸음하고(헛걸음 106%), 만족도 0 · 등급 1 ·
     *     수입 0 이 되어 예산이 영원히 최저에 머문다 (실측). 작아서 못 크는 상태다.
     *
     * 그래서 **쌓인 현금의 1/4** 도 예산에 넣는다 — 은행에 돈이 있으면 사람은 짓는다.
     */
    const income = last ? Math.max(0, last.profit) : 0;
    let weekBudget = Math.max(
      CHEAPEST_FACILITY,
      Math.round(income * 1.5),
      Math.floor(Math.max(0, cash - BUILD_RESERVE) * 0.25),
    );
    for (let b = 0; b < 3; b++) {
      /*
       * 예비비를 남긴다. **이게 없으면 봇이 스스로 파산하고, 그러면 우리는 게임이 아니라
       * 봇의 무모함을 재게 된다** (실측: 예비비 없이 매주 3채를 지어 건설 70만 + 카드 19만
       * vs 손익 40만 — 초기 자금을 다 쓰고 16판 중 4판이 파산했다).
       *
       * 150만은 카드 한 장의 최대 지출(160만)에 가깝게 잡았다 — 사람도 "카드가 하나 터져도
       * 버틸 만큼"은 남긴다.
       */
      const budget = Math.min(weekBudget, Math.max(0, cash - BUILD_RESERVE));
      const spent = buildOne(t, w, p, budget, b === 0 ? want : null, rng);
      cash -= spent;
      buildSpend += spent;
      weekBudget -= spent;
      if (spent === 0) {
        /*
         * ⚠ "못 지었다"를 한 통으로 세면 안 된다 — 자리가 없어서인지 돈이 없어서인지
         * 구분이 안 되고, 경보가 "토지 해금을 보라"고 엉뚱한 곳을 가리킨다 (실측:
         * 직원 인건비로 돈이 마른 상태였는데 자리 문제로 보고했다).
         * 가장 싼 시설도 못 살 예산이면 **돈 문제**다.
         */
        if (budget < CHEAPEST_FACILITY) buildPoor++;
        else buildNoSpace++;
        break;
      }
    }
    g.invalidate();

    // 등급을 반영한다 — 동시 손님 상한과 방문 수요가 등급에서 온다
    const gr = gradeFor(last?.exitSatisfaction ?? 0);
    const season = seasons[Math.floor(k / 4) % seasons.length] as Season;

    /*
     * 카드를 뽑고 **봇 정책**으로 고른다.
     *
     * 정책: **낼 수 있는 선택지 중에서 균등 무작위.** 사람의 최적 플레이가 아니다 —
     * 목적은 "카드가 있는 상태의 경제"를 재는 것이고, 정책이 정교할수록 밸런스가
     * 좋아 보이는 착시가 생긴다.
     *
     * ⚠ 처음엔 "낼 수 있으면 지출 쪽"으로 썼는데, 루프가 항상 **마지막 무지출 선택지**로
     * 끝나서 혼잡(단체 예약)·폐쇄(방송 촬영) 분기를 한 번도 안 탔다. 카드를 넣기 전과
     * 숫자가 완전히 같아서 알아챘다 — 정책이 분기를 안 태우면 계측이 없는 것과 같다.
     */
    for (const card of cards.draw(cardRng, { season, week: k + 1, grade: gr.grade })) {
      const affordable: number[] = [];
      for (let oi = 0; oi < card.options.length; oi++) {
        const opt = card.options[oi];
        const c = opt ? optionCash(opt) : 0;
        if (c >= 0 || -c <= cash) affordable.push(oi);
      }
      const pool = affordable.length > 0 ? affordable : [card.options.length - 1];
      const pick = pool[Math.floor(cardRng.next() * pool.length)] as number;
      const r = cards.choose(cardRng, card, pick);
      cash += r.cash;
      cardsSeen++;
      if (r.cash < 0) cardSpend += -r.cash;
    }

    /*
     * 직원 정책: **필요 인원을 채우되, 비수기에는 줄이고, 낼 수 있는 만큼만.**
     *
     * 비수기 감원이 여기 들어가는 이유는 그게 §11 이 요구하는 판단이기 때문이다 —
     * 인건비는 고정비라 손님이 없어도 나간다. 봇이 그 판단을 안 하면 비수기 인건비가
     * 수익을 앞서고, 우리는 "기계가 나쁘다"로 잘못 읽는다 (실측: 겨울 손익 −50%).
     *
     * 사람의 최적 플레이는 아니다. 목적은 "직원이 있는 상태의 경제"를 재는 것이다.
     */
    /*
     * 코스 정책: **여유가 있으면 한 판에 서너 개까지.** 형태는 그 장비에 ◎ 인 것을 고른다
     * (§7.8 이 요구하는 학습을 봇도 흉내낸다 — 아무 형태나 고르면 적합도가 경제에
     * 반영되지 않아 "적합도가 있어도 없어도 같다"는 잘못된 결론이 나온다).
     */
    if (courses.count < 4 && cash - BUILD_RESERVE > 800_000) {
      const affordable = COURSE_EQUIPMENT.filter(
        (e) => e.vehicleCost * 2 <= cash - BUILD_RESERVE,
      );
      if (affordable.length > 0) {
        const eq = affordable[Math.floor(courseRng.next() * affordable.length)] as
          (typeof COURSE_EQUIPMENT)[number];
        const best = PRESETS.filter((pr) => fitOf(eq.id, pr.id) === 'best' && pr.grade <= gr.grade);
        const pick = (best.length > 0 ? best : PRESETS.filter((pr) => pr.grade <= gr.grade))[0];
        if (pick) {
          // 물가를 찾아 선착장으로 삼는다
          let dock: { x: number; y: number } | null = null;
          // 가장자리는 피한다 — 판정이 격자 밖을 물로 안 세므로 억울하게 좁아진다
          for (let j = 0; j < GRID_H && !dock; j++) {
            for (let i = 6; i < GRID_W - 6; i++) {
              if (t.isWater(i, j)) {
                dock = { x: i, y: j };
                break;
              }
            }
          }
          if (dock) {
            const handles = defaultHandles(pick, dock, { x: 0, y: 1 }, 6);
            const v = validateCourse(t, handles, dock, pick, eq.id, gr.grade);
            if (!v.ok && courseFail === '') courseFail = v.issues.join(',') + ' @' + dock.x + ',' + dock.y;
            if (v.ok) {
              cash -= eq.vehicleCost * 2;
              courses.add({
                presetId: pick.id,
                equipId: eq.id,
                vehicles: 2,
                dock,
                handles,
              });
            }
          }
        }
      }
    }
    const courseWeek = courses.weekly();

    const staffSeasonMult = season === 'summer' ? 1 : season === 'winter' ? 0.5 : 0.75;
    for (const role of STAFF_ROLES) {
      const need = Math.ceil(neededFor(role, p) * staffSeasonMult);
      const canPay = Math.floor(Math.max(0, cash - BUILD_RESERVE) / (role.wage * 8));
      staff.set(role.id, Math.min(need, Math.max(0, canPay)));
    }
    const staffEff = staff.effects(p);
    staffWeeks += staff.total;

    // 카드 선택이 끝난 뒤에 상한을 정한다 — 혼잡 배율이 이번 주에 반영되어야 한다
    const mods = cards.modifiers();
    g.setMaxGuests(admissionLimit(gr, p.totalCapacity(), mods.crowdMult));
    const rep = week.run(rng, {
      season,
      reputation: gr.reputationPull,
      modifiers: mods,
      courses: {
        revenue: courseWeek.revenue,
        upkeep: courseWeek.upkeep,
        riders: courseWeek.riders,
      },
      staff: {
        wages: staffEff.wages,
        satisfactionDelta: staffEff.satisfactionDelta,
        foodMult: staffEff.foodMult,
        idle: staff.idleHandles(p, staffRng),
      },
    });
    wagesByWeek.push(rep.wages);
    courseRevByWeek.push(rep.courseRevenue);
    cards.tickWeek();
    last = rep;
    cash += rep.profit;
    profitByWeek.push(rep.profit);
    seasonByWeek.push(season);
    revenueByWeek.push(rep.revenue);
    upkeepByWeek.push(rep.upkeep);
    buildSpendByWeek.push(buildSpend);
    cashByWeek.push(cash);

    const claimed = progress.claim(questStatuses(p, rep));
    cash += claimed.cash;
  }

  const combos = evaluateCombos(p);
  const exitSat = last?.exitSatisfaction ?? 0;
  const arrivals = Math.max(1, last?.arrivals ?? 1);
  return {
    seed,
    weeks,
    cash,
    facilities: p.count,
    combos: combos.active.length,
    grade: gradeFor(exitSat).grade,
    exitSat,
    turnedAwayRatio: (last?.turnedAway ?? 0) / arrivals,
    gaveUpRatio: (last?.gaveUp ?? 0) / Math.max(1, last?.visitors ?? 1),
    questsDone: progress.claimedCount,
    bankrupt: cash < 0,
    profitByWeek,
    seasonByWeek,
    buildPoor,
    buildNoSpace,
    cardsSeen,
    cardSpend,
    staffWeeks,
    wagesByWeek,
    courseCount: courses.count,
    courseFail,
    courseRevByWeek,
    revenueByWeek,
    upkeepByWeek,
    cashByWeek,
    buildSpendByWeek,
  };
}

function stats(xs: number[]): { min: number; p25: number; med: number; p75: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
  return { min: s[0] as number, p25: at(0.25), med: at(0.5), p75: at(0.75), max: s[s.length - 1] as number };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000)}만`;
  return String(Math.round(n));
}

function main(): void {
  if (DETERMINISM) {
    const a = runOne(4242, 6);
    const b = runOne(4242, 6);
    const same = JSON.stringify(a) === JSON.stringify(b);
    console.log(same ? '✅ 결정론 OK — 같은 시드가 같은 결과' : '❌ 결정론 깨짐');
    process.exit(same ? 0 : 1);
  }

  const t0 = Date.now();
  const runs: RunResult[] = [];
  for (let s = 0; s < SEEDS; s++) runs.push(runOne(1000 + s * 7, WEEKS));
  const ms = Date.now() - t0;

  if (JSON_OUT) {
    console.log(JSON.stringify({ seeds: SEEDS, weeks: WEEKS, ms, runs }, null, 2));
    return;
  }

  console.log(`카이로 헤드리스 — 시드 ${SEEDS} × ${WEEKS}주 · ${ms}ms (${(ms / SEEDS).toFixed(1)}ms/판)`);
  const rows: [string, number[], (n: number) => string][] = [
    ['현금', runs.map((r) => r.cash), fmt],
    ['시설 수', runs.map((r) => r.facilities), (n) => String(n)],
    ['콤보 발동', runs.map((r) => r.combos), (n) => String(n)],
    ['등급', runs.map((r) => r.grade), (n) => String(n)],
    ['퇴장 만족도', runs.map((r) => r.exitSat), (n) => n.toFixed(0)],
    ['만석 비율', runs.map((r) => r.turnedAwayRatio * 100), (n) => `${n.toFixed(0)}%`],
    ['헛걸음 비율', runs.map((r) => r.gaveUpRatio * 100), (n) => `${n.toFixed(0)}%`],
    ['의뢰 완료', runs.map((r) => r.questsDone), (n) => String(n)],
  ];
  console.log(`\n${'항목'.padEnd(14)}${'최소'.padStart(9)}${'25%'.padStart(9)}${'중앙'.padStart(9)}${'75%'.padStart(9)}${'최대'.padStart(9)}`);
  console.log('-'.repeat(60));
  for (const [name, xs, f] of rows) {
    const s = stats(xs);
    console.log(
      name.padEnd(14) +
        f(s.min).padStart(9) +
        f(s.p25).padStart(9) +
        f(s.med).padStart(9) +
        f(s.p75).padStart(9) +
        f(s.max).padStart(9),
    );
  }

  const bankrupt = runs.filter((r) => r.bankrupt).length;
  console.log(`\n파산 ${bankrupt}/${SEEDS}판`);

  // 성장 곡선 — 주차별 손익 중앙값
  const byWeek: number[] = [];
  for (let k = 0; k < WEEKS; k++) {
    byWeek.push(stats(runs.map((r) => r.profitByWeek[k] ?? 0)).med);
  }
  console.log(`주차별 손익 중앙값: ${byWeek.map(fmt).join(' → ')}`);
  const seasonLine = [...new Set(runs[0]?.seasonByWeek ?? [])]
    .map((se) => {
      const xs = runs.flatMap((r) =>
        r.profitByWeek.filter((_, k) => r.seasonByWeek[k] === se),
      );
      return `${se} ${fmt(stats(xs).med)}`;
    })
    .join(' · ');
  console.log(`계절별 손익 중앙값: ${seasonLine}`);
  console.log(
    `건설 막힘 중앙값: 돈 부족 ${stats(runs.map((r) => r.buildPoor)).med}회 · ` +
      `자리 부족 ${stats(runs.map((r) => r.buildNoSpace)).med}회 (판당)`,
  );
  const perWeekMed = (pick: (r: RunResult) => number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k < WEEKS; k++) out.push(stats(runs.map((r) => pick(r)[k] ?? 0)).med);
    return out;
  };
  const revW = perWeekMed((r) => r.revenueByWeek);
  const upkW = perWeekMed((r) => r.upkeepByWeek);
  const cashW = perWeekMed((r) => r.cashByWeek);
  const bldW = perWeekMed((r) => r.buildSpendByWeek);
  const every4 = (a: number[]): string =>
    a.filter((_, k) => k % 4 === 3).map(fmt).join(' → ');
  console.log(`수익 (4주마다):   ${every4(revW)}`);
  console.log(`유지비 (4주마다): ${every4(upkW)}`);
  console.log(`인건비 (4주마다): ${every4(perWeekMed((r) => r.wagesByWeek))}`);
  console.log(`코스매출 (4주마다): ${every4(perWeekMed((r) => r.courseRevByWeek))}`);
  console.log(`건설비 (4주마다): ${every4(bldW)}`);
  console.log(`현금 (4주마다):   ${every4(cashW)}`);
  console.log(
    `직원 평균: ${(stats(runs.map((r) => r.staffWeeks)).med / WEEKS).toFixed(1)}명/주`,
  );
  console.log(`코스 수 중앙값: ${stats(runs.map((r) => r.courseCount)).med}개` +
    (runs[0]?.courseFail ? ` (막힌 사유: ${runs[0].courseFail})` : ''));
  const cs = stats(runs.map((r) => r.cardsSeen));
  const csp = stats(runs.map((r) => r.cardSpend));
  console.log(
    `카드: 중앙 ${cs.med}장/판 (${(cs.med / WEEKS).toFixed(2)}장/주) · 지출 중앙 ${fmt(csp.med)}`,
  );

  // 밸런스 판정 — 여기서 걸리면 숫자를 손봐야 한다
  const issues: string[] = [];
  const grade = stats(runs.map((r) => r.grade));
  if (grade.min >= 5) issues.push('등급이 처음부터 최고 — 만족도 문턱이 너무 낮다');
  if (stats(runs.map((r) => r.exitSat)).p25 > 95) issues.push('퇴장 만족도가 거의 항상 만점');
  if (bankrupt === 0 && stats(runs.map((r) => r.cash)).min > 20_000_000) {
    issues.push('돈이 남기만 한다 — 유지비/건설비가 너무 싸다');
  }
  if (stats(runs.map((r) => r.turnedAwayRatio)).med > 0.8) {
    issues.push('만석 비율이 80% 넘는다 — 동시 손님 상한이 수요에 비해 낮다');
  }
  if (stats(runs.map((r) => r.facilities)).med < 8) issues.push('시설이 거의 안 늘어난다');
  /**
   * 후반 성장 정지 — **같은 계절끼리** 비교한다.
   *
   * ⚠ 정점과 마지막 주를 그냥 비교하면 안 된다. 계절이 순환하므로 마지막이 겨울이면
   * 무조건 "꺾였다"가 나온다 (실측: 33~36주가 겨울이라 37% 하락으로 잡혔는데 실제로는
   * 정상 계절 변동이었다).
   */
  /**
   * ⚠ 계절별 배열을 그냥 반으로 가르면 안 된다. 배열이 **판 순서**라 전반/후반이
   * "시드 0~7 vs 8~15" 를 비교하게 되고, 시간 흐름과 무관한 가짜 경보가 난다
   * (실측: spring 41만→33만 경보가 그것이었다).
   *
   * 주차별로 묶고 **주차 기준**으로 전반/후반을 가른다. 그 계절이 한 번밖에 안 돌아왔으면
   * 비교할 것이 없으므로 건너뛴다 — 없는 비교를 억지로 하면 그게 다시 가짜 경보다.
   */
  const bySeason = new Map<Season, Map<number, number[]>>();
  for (const r of runs) {
    for (let k = 0; k < r.profitByWeek.length; k++) {
      const se = r.seasonByWeek[k] as Season;
      if (!bySeason.has(se)) bySeason.set(se, new Map());
      const byWk = bySeason.get(se) as Map<number, number[]>;
      if (!byWk.has(k)) byWk.set(k, []);
      (byWk.get(k) as number[]).push(r.profitByWeek[k] as number);
    }
  }
  /**
   * ⚠ 경보는 **성수기(여름)만** 본다.
   *
   * 이 경보의 목적은 "시설을 늘려도 수입이 안 늘어 후반에 할 일이 없어진다"를 잡는 것이다.
   * 비수기는 수요가 상한이라 수익이 고정이고, 시설을 늘리면 유지비만 는다 — 그건 결함이
   * 아니라 **"비수기에는 사우나·숙박·식음을 지어라"는 판단을 요구하는 설계**다
   * (`ACTIVE_NEEDS` 가 그 답을 보상한다). 비수기 변화는 경보가 아니라 정보로 찍는다.
   *
   * 이걸 구분하지 않고 겨울 −15% 를 경보로 잡으면, 그 경보를 끄려고 비수기 경제를
   * 계속 주무르게 된다 — 내 문턱을 만족시키려고 게임을 바꾸는 것이다.
   */
  const PEAK: Season = 'summer';
  const declines: string[] = [];
  const offseasonInfo: string[] = [];
  const skippedSeasons: string[] = [];
  for (const [se, byWk] of bySeason) {
    const weeksOf = [...byWk.keys()].sort((a, b) => a - b);
    if (weeksOf.length < 8) {
      skippedSeasons.push(`${se}(${weeksOf.length}주)`);
      continue;
    }
    const half = Math.floor(weeksOf.length / 2);
    const medOf = (ws: number[]): number =>
      stats(ws.flatMap((k) => byWk.get(k) as number[])).med;
    const early = medOf(weeksOf.slice(0, half));
    const late = medOf(weeksOf.slice(half));
    const changed = early > 0 ? Math.round((late / early - 1) * 100) : 0;
    if (se === PEAK) {
      if (early > 0 && late < early * 0.85) declines.push(`${se} ${fmt(early)}→${fmt(late)}`);
    } else {
      offseasonInfo.push(`${se} ${fmt(early)}→${fmt(late)} (${changed > 0 ? '+' : ''}${changed}%)`);
    }
  }
  if (offseasonInfo.length > 0) {
    console.log(`비수기 손익 변화 (경보 아님 — 구성으로 답하는 구간): ${offseasonInfo.join(' · ')}`);
  }
  if (skippedSeasons.length > 0) {
    console.log(
      `(성장 판정에서 뺀 계절: ${skippedSeasons.join(' ')} — 비교할 만큼 안 돌아왔다. ` +
        `--weeks 를 늘리면 판정에 들어온다)`,
    );
  }
  if (declines.length > 0) {
    issues.push(
      `성수기인데 후반 손익이 낮다 — ${declines.join(' · ')}. ` +
        '시설 상한·유지비 곡선을 볼 것 (비수기는 판정에서 뺀다)',
    );
  }

  // 시설 상한의 원인 — 자리를 못 찾는 것인지 돈이 없는 것인지
  const poor = stats(runs.map((r) => r.buildPoor));
  const noSpace = stats(runs.map((r) => r.buildNoSpace));
  if (noSpace.med > WEEKS * 0.3) {
    issues.push(
      `자리가 없어 건설이 막힌다 (중앙 ${noSpace.med}회/판) — 토지 해금으로 격자를 넓혀야 한다`,
    );
  }
  if (poor.med > WEEKS * 0.4) {
    issues.push(
      `돈이 없어 건설이 막힌다 (중앙 ${poor.med}회/판) — 유지비·인건비가 수익을 앞선다`,
    );
  }
  console.log(issues.length === 0 ? '\n✅ 밸런스 경보 없음' : `\n⚠ 밸런스 경보 ${issues.length}건`);
  for (const s of issues) console.log(`   · ${s}`);
}

main();

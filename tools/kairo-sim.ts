/**
 * 카이로 헤드리스 밸런싱 러너.
 *
 *   npm run sim:kairo                        기본 (시드 20개 × 12주)
 *   npm run sim:kairo -- --seeds 100 --weeks 24
 *   npm run sim:kairo -- --determinism       같은 시드가 같은 결과를 내는지
 *   npm run sim:kairo -- --maps              맵마다 결과가 달라지는지 (§4.5)
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
import { WallGrid, EDGE_SOLID, DIR_J_MINUS } from '../src/sim/kairo/walls.js';
import { PlacementGrid, allFacilityDefs, MAX_LEVEL } from '../src/sim/kairo/placement.js';
import { GuestStore, GUEST_DEFAULTS } from '../src/sim/kairo/guests.js';
import { WeekRunner, type NeedKind, type Season, type WeekReport } from '../src/sim/kairo/week.js';
import { evaluateCombos } from '../src/sim/kairo/combos.js';
import { CardStore, CARD_RNG_SALT, optionCash, triggerCard } from '../src/sim/kairo/cards.js';
import { assessRisk, accidentChance } from '../src/sim/kairo/risk.js';
import { mapType, shiftedShares, MAP_TYPES } from '../src/sim/kairo/scenario.js';
import { seasonShares } from '../src/sim/kairo/groups.js';
import { StaffStore, STAFF_ROLES, neededFor } from '../src/sim/kairo/staff.js';
import {
  CourseStore,
  PRESETS,
  COURSE_EQUIPMENT,
  defaultHandles,
  validateCourse,
  fitOf,
} from '../src/sim/kairo/course.js';
import {
  questStatuses,
  ProgressStore,
  gradeFor,
  nextGrade,
  admissionLimit,
  Reputation,
  landRect,
  GRADES,
} from '../src/sim/kairo/progress.js';

const args = process.argv.slice(2);
const flag = (name: string, dflt: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const SEEDS = flag('seeds', 20);
const WEEKS = flag('weeks', 12);
const JSON_OUT = args.includes('--json');
const DETERMINISM = args.includes('--determinism');
/** 맵별 비교 — 맵마다 최적 빌드가 달라지는지 (§4.5) */
const MAPS = args.includes('--maps');
/**
 * 판별 결과를 **판마다** 찍는다.
 *
 * 중앙값만 보면 "절반은 5등급, 절반은 1등급" 같은 **양극화를 못 본다** — 중앙값은 그
 * 가운데 어딘가를 가리킬 뿐이다. 원인을 찾으려면 갈린 판을 각각 봐야 한다.
 */
const EACH = args.includes('--each');

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
  /** 건설이 막힌 주 — **안 짓기로 / 돈이 없어서 / 자리가 없어서**를 나눠서 센다 */
  buildPoor: number;
  buildNoSpace: number;
  buildCapped: number;
  /** 개선에 쓴 돈과 평균 단계 — 후반 공백이 메워졌는지 본다 */
  upgradeSpend: number;
  avgLevel: number;
  /** 사고 횟수 — 위험도 관리가 계측에 나타나는지 */
  accidents: number;
  /** 마지막 위험 단계 — "사고 0회"가 관리 덕인지 확률이 0이라 그런지 가른다 */
  riskLevel: string;
  mapId: string;
  /**
   * 마지막 주의 손님 상태. **만족도 0 이 "나쁜 경험"인지 "아무도 퇴장하지 않음"인지**
   * 가른다 — 둘은 원인이 완전히 다르다.
   */
  lastAlive: number;
  lastGaveUp: number;
  lastIdle: number;
  lastVisitors: number;
  /** 마지막 주 손님 구성 비율 — 맵이 구성을 바꾸는지 확인 */
  familyRatio: number;
  friendsRatio: number;
  /** 위험 단계였던 주의 비율 */
  riskyWeeks: number;
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
  /**
   * 해금된 토지 (K25). 봇이 이걸 무시하면 밸런싱이 **실제로 못 쓰는 땅**까지 쓰게 되어,
   * 헤드리스 숫자와 손으로 하는 판이 갈라진다. 검증이 조용히 통과하는 전형적인 모양이다.
   */
  land: { w: number; h: number },
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
    const i = rng.int(Math.max(1, land.w - pick.size[0]));
    const j = rng.int(Math.max(1, land.h - pick.size[1]));
    if (p.check(t, w, GATE, pick.id, i, j, land).ok) {
      p.place(t, w, GATE, pick.id, i, j, land);
      return (pick as unknown as { cost: number }).cost;
    }
  }
  return 0;
}

function runOne(seed: number, weeks: number, mapId = 'bukhan'): RunResult {
  const rng = new Rng(seed);
  const map = mapType(mapId);
  const t = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1), map);
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  const week = new WeekRunner(t, p, g);
  const progress = new ProgressStore();
  /**
   * 평판 — 퇴장 만족도의 이동평균 (§9.2). 지난주 값 하나로 등급을 정하면 진동한다
   * (실측: 40주에 등급이 35번 바뀌었다).
   */
  const reputation = new Reputation();
  let gradeNo = 1;
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
  // 벽부착 시설이 붙을 경계 두 줄 (플레이어가 실내동을 짓는 걸 흉내낸다)
  for (let i = 6; i < 26; i++) w.setEdge(i, 6, DIR_J_MINUS, EDGE_SOLID);
  for (let i = 6; i < 26; i++) w.setEdge(i, 10, DIR_J_MINUS, EDGE_SOLID);

  let cash = 5_000_000;
  let last: WeekReport | null = null;
  const profitByWeek: number[] = [];
  const seasonByWeek: Season[] = [];
  let buildPoor = 0;
  let buildNoSpace = 0;
  let buildCapped = 0;
  let upgradeSpend = 0;
  let accidents = 0;
  let riskyWeeks = 0;
  const accidentIdle = new Map<number, number>();
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

    /*
     * ⚠ **공급이 등급 상한을 넘으면 그만 짓는다.**
     *
     * 입장은 `min(등급 상한, 공급×1.5)` 다. 공급×1.5 가 이미 등급 상한을 넘었으면 시설을
     * 더 지어도 **한 명도 더 안 들어오고 유지비만 는다.** 봇이 이걸 모르고 계속 지어
     * 80주에서 시설 133개 · 만석 44% · 유지비가 수익의 74% · 파산 9/48 이 됐다.
     *
     * 사람이라면 "만석인데 지어도 안 들어온다"를 보고 멈춘다. 계측 도구가 그 판단을 안 하면
     * 우리는 **게임이 무너졌다고 잘못 읽는다** — 무너진 건 봇의 정책이다.
     * (게임 쪽에도 이 사실을 알리는 표시가 필요하다 — 결산 병목 줄에 넣었다.)
     */
    const gradeNow = nextGrade(gradeNo, reputation.value);
    const capped = p.totalCapacity() * 1.5 > gradeNow.maxGuests * 1.3;
    if (capped) weekBudget = 0;

    /*
     * 확장이 막혔으면 **개선한다** (§15.9). 정원은 안 늘고 요금·만족도가 오르므로,
     * 등급 상한에 막힌 구간에서 유일하게 남는 성장 수단이다.
     *
     * 이게 없으면 80주 중 58주가 "지을 게 없다"가 되고 현금이 2,220만까지 쌓인다 (실측).
     */
    if (capped) {
      for (let k = 0; k < 3; k++) {
        const targets = p
          .all()
          .filter((it) => p.levelOf(it.handle) < MAX_LEVEL)
          .sort((a, b) => p.levelOf(a.handle) - p.levelOf(b.handle) || a.handle - b.handle);
        const t0 = targets[0];
        if (!t0) break;
        const cost = p.upgradeCost(t0.handle);
        if (cost <= 0 || cost > cash - BUILD_RESERVE) break;
        p.upgrade(t0.handle);
        cash -= cost;
        upgradeSpend += cost;
      }
    }
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
      const spent = buildOne(t, w, p, budget, b === 0 ? want : null, rng, landRect(GRADES[gradeNo - 1] ?? GRADES[0]!));
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
        /*
         * ⚠ 셋을 구분해야 한다: **안 짓기로 했다 / 돈이 없다 / 자리가 없다.**
         * 예산을 0 으로 둔 것(공급이 등급 상한을 넘어 그만 짓기로 한 것)을 "돈이 없다"로
         * 세면, 현금 2,220만인 판이 "돈이 없어 건설이 막힌다"로 보고된다 (실측).
         */
        if (weekBudget <= 0) buildCapped++;
        else if (budget < CHEAPEST_FACILITY) buildPoor++;
        else buildNoSpace++;
        break;
      }
    }
    g.invalidate();

    // 등급을 반영한다 — 동시 손님 상한과 방문 수요가 등급에서 온다
    const gr = nextGrade(gradeNo, reputation.value);
    gradeNo = gr.grade;
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
    /*
     * 요금 정책: 만족도가 여유 있으면 올리고, 빠듯하면 내린다.
     * 사람이 슬라이더로 하는 판단을 흉내낸다 — 안 하면 "값을 매긴다"가 경제에 안 나타난다.
     */
    const sat = reputation.value === 0 ? 60 : reputation.value;
    /*
     * 요금 정책. **5등급을 못 찍었고 돈이 남으면 값을 내려 만족도를 산다** —
     * 값을 올리면 만족도가 깎여 등급이 막히고, 등급이 막히면 확장이 막혀 돈이 쌓인다.
     * 남는 돈으로 진행을 사는 것이 사람의 판단이다.
     */
    /*
     * ⚠ 0.7 로 크게 내렸더니 매출이 무너져 인건비를 못 내고, 청소부 부족으로 만족도가
     * 오히려 **떨어졌다** (등급 1 사분위가 생겼다). 값 내리기는 만족도를 사는 수단이지만
     * 그 돈이 인건비를 깎으면 역효과다. 0.9 로만 내린다.
     */
    const wantGrade5 = gradeNo === 4 && cash > 20_000_000;
    const priceMult = wantGrade5 ? 0.9 : sat > 78 ? 1.2 : sat < 62 ? 0.85 : 1;

    const rep = week.run(rng, {
      season,
      reputation: gr.reputationPull,
      priceMult,
      mapShares: shiftedShares(seasonShares(season), map),
      mapSceneryBonus: map.sceneryBonus,
      modifiers: mods,
      courses: {
        revenue: courseWeek.revenue,
        upkeep: courseWeek.upkeep,
        riders: courseWeek.riders,
      },
      // 사고 — 위험 단계에서만 (§12.1). 안 넣으면 안전 시설을 지을 이유가 계측에 안 나온다
      accidentChance: (() => {
        const r = assessRisk(p, g, { staffSafety: staffEff.safetyPoints });
        if (r.accidentPossible) riskyWeeks++;
        return accidentChance(r, mods.accidentMult);
      })(),
      staff: {
        wages: staffEff.wages,
        satisfactionDelta: staffEff.satisfactionDelta,
        foodMult: staffEff.foodMult,
        idle: new Set([...staff.idleHandles(p, staffRng), ...accidentIdle.keys()]),
      },
    });

    // 사고로 닫힌 시설의 남은 주를 깎고, 새 사고를 기록한다
    for (const [handle, left] of [...accidentIdle]) {
      if (left <= 1) accidentIdle.delete(handle);
      else accidentIdle.set(handle, left - 1);
    }
    if (rep.accident) {
      accidentIdle.set(rep.accident.handle, rep.accident.weeks);
      accidents++;
      // 봇 정책: 낼 수 있으면 전면 점검, 아니면 법적 대응 (가장 싼 쪽)
      const card = triggerCard('accident_response');
      if (card) {
        const audit = card.options.findIndex((o) => o.effects.some((e) => (e.accidentMult ?? 1) < 1));
        const pickIdx = audit >= 0 && optionCash(card.options[audit]!) * -1 <= cash ? audit : 1;
        const r = cards.choose(cardRng, card, pickIdx);
        cash += r.cash;
      }
    }
    wagesByWeek.push(rep.wages);
    courseRevByWeek.push(rep.courseRevenue);
    cards.tickWeek();
    last = rep;
    reputation.push(rep.exitSatisfaction);
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
    buildCapped,
    upgradeSpend,
    avgLevel: p.averageLevel(),
    accidents,
    riskLevel: assessRisk(p, g, { staffSafety: staff.effects(p).safetyPoints }).level,
    mapId,
    lastAlive: g.stats().alive,
    lastGaveUp: last ? last.gaveUp : 0,
    lastIdle: g.idleCount,
    lastVisitors: last ? last.visitors : 0,
    familyRatio: last ? last.byGroup.family / Math.max(1, last.visitors) : 0,
    friendsRatio: last ? last.byGroup.friends / Math.max(1, last.visitors) : 0,
    riskyWeeks,
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

/**
 * 맵별 비교 (§4.5 검증) — **맵마다 최적 빌드가 실제로 달라지는지.**
 * 달라지지 않으면 "맵 타입"은 지형 무늬일 뿐이고 2회차 이유가 안 된다.
 */
function compareMaps(seeds: number, weeks: number): void {
  console.log(`\n맵별 비교 — 시드 ${seeds} × ${weeks}주`);
  console.log(
    `${'맵'.padEnd(7)} ${'손익'.padStart(8)} ${'만족'.padStart(5)} ${'시설'.padStart(5)} ` +
      `${'가족%'.padStart(6)} ${'친구%'.padStart(6)} ${'코스'.padStart(5)}`,
  );
  for (const m of MAP_TYPES) {
    const runs: RunResult[] = [];
    for (let s = 0; s < seeds; s++) runs.push(runOne(1000 + s, weeks, m.id));
    const med = (pick: (r: RunResult) => number): number => stats(runs.map(pick)).med;
    console.log(
      `${m.name.padEnd(6)} ${fmt(med((r) => r.profitByWeek[weeks - 1] ?? 0)).padStart(8)} ` +
        `${med((r) => r.exitSat).toFixed(0).padStart(5)} ` +
        `${med((r) => r.facilities).toString().padStart(5)} ` +
        `${(med((r) => r.familyRatio) * 100).toFixed(0).padStart(6)} ` +
        `${(med((r) => r.friendsRatio) * 100).toFixed(0).padStart(6)} ` +
        `${med((r) => r.courseCount).toString().padStart(5)}`,
    );
  }
}

function main(): void {
  if (DETERMINISM) {
    const a = runOne(4242, 6);
    const b = runOne(4242, 6);
    const same = JSON.stringify(a) === JSON.stringify(b);
    console.log(same ? '✅ 결정론 OK — 같은 시드가 같은 결과' : '❌ 결정론 깨짐');
    process.exit(same ? 0 : 1);
  }

  if (MAPS) {
    compareMaps(SEEDS, WEEKS);
    return;
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
    `건설 막힘 중앙값: 상한 도달 ${stats(runs.map((r) => r.buildCapped)).med}회 · ` +
      `돈 부족 ${stats(runs.map((r) => r.buildPoor)).med}회 · ` +
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
  if (EACH) {
    console.log(
      `\n판별 결과 — ${'시드'.padStart(5)} ${'등급'.padStart(4)} ${'만족'.padStart(5)} ` +
        `${'시설'.padStart(5)} ${'현금'.padStart(9)} ${'만석%'.padStart(6)} ` +
        `${'직원'.padStart(5)} ${'개선'.padStart(5)} ${'사고'.padStart(5)}`,
    );
    for (const r of runs) {
      console.log(
        `      ${String(r.seed).padStart(5)} ${String(r.grade).padStart(4)} ` +
          `${r.exitSat.toFixed(0).padStart(5)} ${String(r.facilities).padStart(5)} ` +
          `${fmt(r.cash).padStart(9)} ${(r.turnedAwayRatio * 100).toFixed(0).padStart(6)} ` +
          `${(r.staffWeeks / WEEKS).toFixed(1).padStart(5)} ${r.avgLevel.toFixed(2).padStart(5)} ` +
          `${String(r.accidents).padStart(5)} ` +
          `| 살아 ${String(r.lastAlive).padStart(3)} 입장 ${String(r.lastVisitors).padStart(3)} ` +
          `헛걸음 ${String(r.lastGaveUp).padStart(3)} 선시설 ${String(r.lastIdle).padStart(3)}`,
      );
    }
  }

  const levels = new Map<string, number>();
  for (const r of runs) levels.set(r.riskLevel, (levels.get(r.riskLevel) ?? 0) + 1);
  console.log(
    `사고 중앙값: ${stats(runs.map((r) => r.accidents)).med}회/판 · ` +
      `사고 가능 주 ${stats(runs.map((r) => r.riskyWeeks)).med}회 · ` +
      `마지막 위험 단계 ${[...levels].map(([k, v]) => `${k} ${v}판`).join(' · ')}`,
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
  /*
   * ⚠ **상한에 닿는 것 자체는 문제가 아니다.** 확장이 막혀도 개선(§15.9)이라는 다른
   * 돈 쓸 곳이 있으면 후반이 비지 않는다. 문제는 **막혔는데 돈이 쌓이는 것** —
   * 그때가 "할 게 없다"다. 둘을 함께 봐야 경보가 진실을 말한다.
   */
  const capped = stats(runs.map((r) => r.buildCapped));
  const idleCash = stats(runs.map((r) => r.cash));
  if (capped.med > WEEKS * 0.5 && idleCash.med > 15_000_000) {
    issues.push(
      `후반이 빈다 — 절반 넘는 주에 지을 게 없고(중앙 ${capped.med}회/판) ` +
        `현금이 ${fmt(idleCash.med)} 쌓인다. 등급 상한에 막혔는데 쓸 곳이 없다`,
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

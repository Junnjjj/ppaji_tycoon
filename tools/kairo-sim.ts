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
  /** 건설을 시도했다가 자리를 못 찾은 횟수 — 시설 상한의 원인을 가른다 */
  buildFails: number;
  /** 뽑힌 카드 수와 카드로 나간 돈 — 카드가 경제를 얼마나 흔드나 */
  cardsSeen: number;
  cardSpend: number;
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

  // 벽부착 시설을 위해 벽 몇 줄 (플레이어가 실내동을 짓는 걸 흉내낸다)
  for (let i = 6; i < 26; i++) placeWall(t, w, GATE, i, 5);
  for (let i = 6; i < 26; i++) placeWall(t, w, GATE, i, 9);

  let cash = 5_000_000;
  let last: WeekReport | null = null;
  const profitByWeek: number[] = [];
  const seasonByWeek: Season[] = [];
  let buildFails = 0;
  let cardsSeen = 0;
  let cardSpend = 0;
  const revenueByWeek: number[] = [];
  const upkeepByWeek: number[] = [];
  const cashByWeek: number[] = [];
  const buildSpendByWeek: number[] = [];
  const seasons: Season[] = ['summer', 'summer', 'autumn', 'winter', 'spring'];

  for (let k = 0; k < weeks; k++) {
    // 결산의 병목을 보고 짓는다
    const want = last?.bottleneck?.need ?? null;
    let buildSpend = 0;
    for (let b = 0; b < 3; b++) {
      /*
       * 예비비를 남긴다. **이게 없으면 봇이 스스로 파산하고, 그러면 우리는 게임이 아니라
       * 봇의 무모함을 재게 된다** (실측: 예비비 없이 매주 3채를 지어 건설 70만 + 카드 19만
       * vs 손익 40만 — 초기 자금을 다 쓰고 16판 중 4판이 파산했다).
       *
       * 150만은 카드 한 장의 최대 지출(160만)에 가깝게 잡았다 — 사람도 "카드가 하나 터져도
       * 버틸 만큼"은 남긴다.
       */
      const spent = buildOne(t, w, p, Math.max(0, cash - BUILD_RESERVE), b === 0 ? want : null, rng);
      cash -= spent;
      buildSpend += spent;
      if (spent === 0) {
        buildFails++;
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

    // 카드 선택이 끝난 뒤에 상한을 정한다 — 혼잡 배율이 이번 주에 반영되어야 한다
    const mods = cards.modifiers();
    g.setMaxGuests(admissionLimit(gr, p.totalCapacity(), mods.crowdMult));
    const rep = week.run(rng, {
      season,
      reputation: gr.reputationPull,
      modifiers: mods,
    });
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
    buildFails,
    cardsSeen,
    cardSpend,
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
  console.log(`건설 막힌 횟수 중앙값: ${stats(runs.map((r) => r.buildFails)).med}회/판`);
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
  console.log(`건설비 (4주마다): ${every4(bldW)}`);
  console.log(`현금 (4주마다):   ${every4(cashW)}`);
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
  const fails = stats(runs.map((r) => r.buildFails));
  if (fails.med > WEEKS * 0.3) {
    issues.push(
      `건설이 자주 막힌다 (평균 ${fails.med}회/판) — 자리가 없는 것인지 확인할 것. ` +
        '토지 해금으로 격자를 넓혀야 할 수도 있다',
    );
  }
  console.log(issues.length === 0 ? '\n✅ 밸런스 경보 없음' : `\n⚠ 밸런스 경보 ${issues.length}건`);
  for (const s of issues) console.log(`   · ${s}`);
}

main();

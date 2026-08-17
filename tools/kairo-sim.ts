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
import { questStatuses, ProgressStore, gradeFor } from '../src/sim/kairo/progress.js';

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

  // 벽부착 시설을 위해 벽 몇 줄 (플레이어가 실내동을 짓는 걸 흉내낸다)
  for (let i = 6; i < 26; i++) placeWall(t, w, GATE, i, 5);
  for (let i = 6; i < 26; i++) placeWall(t, w, GATE, i, 9);

  let cash = 5_000_000;
  let last: WeekReport | null = null;
  const profitByWeek: number[] = [];
  const seasons: Season[] = ['summer', 'summer', 'autumn', 'winter', 'spring'];

  for (let k = 0; k < weeks; k++) {
    // 결산의 병목을 보고 짓는다
    const want = last?.bottleneck?.need ?? null;
    for (let b = 0; b < 3; b++) {
      const spent = buildOne(t, w, p, cash, b === 0 ? want : null, rng);
      cash -= spent;
      if (spent === 0) break;
    }
    g.invalidate();

    const season = seasons[Math.floor(k / 4) % seasons.length] as Season;
    const rep = week.run(rng, { season });
    last = rep;
    cash += rep.profit;
    profitByWeek.push(rep.profit);

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
  console.log(issues.length === 0 ? '\n✅ 밸런스 경보 없음' : `\n⚠ 밸런스 경보 ${issues.length}건`);
  for (const s of issues) console.log(`   · ${s}`);
}

main();

/**
 * 헤드리스 봇 러너 — Phaser 없이 Node 에서 128일을 돈다 (불변식 1 실증).
 *
 *   npm run bot -- --seeds 8 --days 128 [--determinism] [--json] [--sweep key=v,key=v] [--persona balanced|pool|restaurant|cert|all] [--bands]
 *
 * `--sweep` 은 `balance.json` 의 키를 덮어쓴다 — 밸런스 조정의 유일한 창구.
 * `--persona all` 은 성향 4종을 차례로 돌려 한 줄씩 비교한다 (G13). `--bands` 는 §2.6 목표 밴드를 판정한다 (밖이면 exit 1).
 */
import { Game } from '../src/sim/game.js';
import { runBot, BOT_PERSONAS, type RunMetrics, type BotPersona } from '../src/sim/bot.js';
import balance from '../src/data/balance.json';

/**
 * 목표 밴드 (G13) — balanced 성향 8시드×128일 **중앙값**. §2.6 플레이스홀더에서 실측으로 옮겼다.
 * 이유를 같이 적는다: 숫자만 있으면 다음 사람이 왜 그 값인지 모른다.
 */
const BANDS: { key: keyof RunMetrics; lo: number; hi: number; why: string }[] = [
  { key: 'money', lo: 200000, hi: 4000000, why: '파산 0 이면서 후반에 돈이 남아도는 정도 (PSS 도 후반은 돈이 남는다). G40 버스가 방문을 +25% 올려 상한 300만 → 400만 (시드별 265~394만)' },
  { key: 'certs', lo: 10, hi: 24, why: 'G10 게이트 — 128일에 인증 ≥10' },
  { key: 'areas', lo: 6, hi: 10, why: 'G10 게이트 — 지역 ≥6' },
  { key: 'recipes', lo: 40, hi: 140, why: 'G10 게이트 — 레시피 ≥40' },
  { key: 'rank', lo: 3, hi: 5, why: '★3 ≤Y3 · ★5 는 Y6~Y7 목표 (§2.6)' },
  { key: 'weekendRatio', lo: 1.4, hi: 2.5, why: 'G9 — 주말 ≥ 평일 1.4배 (유입 목표 기준)' },
  { key: 'summerWinterRatio', lo: 1.6, hi: 4, why: 'G9 — 여름/겨울 ≥1.6' },
  { key: 'busGuestsShare', lo: 0.08, hi: 0.3, why: 'G40 — 128일 방문 중 버스로 온 몫 8~30% (캠페인 버스 + 좋아요 버스)' },
  { key: 'rank3Year', lo: 1, hi: 3, why: 'G45 — ★3 은 3년차 안에 (§2.6)' },
  { key: 'rank5Year', lo: 5, hi: 8, why: 'G45 — ★5 는 5~8년차 (§2.6 「Y6~Y7」 + 여유 1년)' },
  { key: 'foodShare', lo: 0.25, hi: 0.65, why: 'G45 — 수입 중 매점 몫 25~65% (원작: 입장료 + 매점이 수입 대부분)' },
  { key: 'wishExpireRatio', lo: 0, hi: 3, why: 'G48 — 만료 소원 ≤ 성립의 3배 (조사 시점 3.2 → 임박 우선 정책 뒤 2.8 · 봇이 조건을 더 잘 좇게 되면 낮춘다)' },
  { key: 'certsDistinct', lo: 8, hi: 24, why: 'G51 — 서로 다른 인증 ≥8 (조사 시점: grade_f 하나만 16번)' },
  { key: 'certFamilies', lo: 4, hi: 8, why: 'G51 — 통과한 계열 ≥4 (8계열 중)' },
  { key: 'lateSpendRatio', lo: 0.3, hi: 0.85, why: 'G30 — 5~8년차 지출이 전체의 30% 이상 (후반이 비지 않는다)' },
];

const arg = (name: string, def: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? def) : def;
};
const seeds = Number(arg('seeds', '8'));
const days = Number(arg('days', '128'));
const determinism = process.argv.includes('--determinism');
const json = process.argv.includes('--json');
const sweep = arg('sweep', '');
const personaArg = arg('persona', 'balanced');
const bands = process.argv.includes('--bands');
const personas: BotPersona[] = personaArg === 'all' ? ['balanced', 'pool', 'restaurant', 'cert'] : [personaArg as BotPersona];
for (const p of personas) if (!(p in BOT_PERSONAS)) { console.error(`알 수 없는 성향: ${p}`); process.exit(1); }

const b = { ...balance } as typeof balance & Record<string, number | number[]>;
for (const kv of sweep.split(',').filter(Boolean)) {
  const [k, v] = kv.split('=') as [string, string];
  if (!(k in b)) { console.error(`알 수 없는 balance 키: ${k}`); process.exit(1); }
  (b as Record<string, unknown>)[k] = v.includes('/') ? v.split('/').map(Number) : Number(v);
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, c) => a - c); return s[Math.floor(s.length / 2)] ?? 0; };

const t0 = performance.now();
const runs: RunMetrics[] = [];
const opts = BOT_PERSONAS[personas[0] as BotPersona];
for (let s = 1; s <= seeds; s++) runs.push(runBot(new Game(s, b), days, opts));
const ms = Math.round(performance.now() - t0);

if (personas.length > 1) {
  const line = (p: BotPersona, rs: RunMetrics[]): string =>
    `  ${p.padEnd(10)} 현금 ${median(rs.map((r) => r.money)).toLocaleString('ko-KR').padStart(10)} · 방문 ${median(rs.map((r) => r.visitors))} · 풀 ${median(rs.map((r) => r.poolTiles))} · 시설 ${median(rs.map((r) => r.facilities))} · 인기 ${median(rs.map((r) => r.popularity))} · 인증 ${median(rs.map((r) => r.certs))} · ★${median(rs.map((r) => r.rank))} · 레시피 ${median(rs.map((r) => r.recipes))} · 식당 ${Math.round((median(rs.map((r) => r.food)) / Math.max(1, median(rs.map((r) => r.food + r.visitors * 200)))) * 100)}% · 지역 ${median(rs.map((r) => r.areas))} · 소원 ${median(rs.map((r) => r.wishes))} · 점수 ${median(rs.map((r) => r.score))}`;
  console.log(`성향 비교 — ${seeds}시드 × ${days}일`);
  console.log(line(personas[0] as BotPersona, runs));
  for (const p of personas.slice(1)) {
    const rs: RunMetrics[] = [];
    for (let s = 1; s <= seeds; s++) rs.push(runBot(new Game(s, b), days, BOT_PERSONAS[p]));
    console.log(line(p, rs));
  }
  process.exit(0);
}

if (bands) {
  let ok = true;
  for (const band of BANDS) {
    const m = median(runs.map((r) => r[band.key] as number));
    const pass = m >= band.lo && m <= band.hi;
    ok = ok && pass;
    console.log(`  ${pass ? '✓' : '✕'} ${String(band.key).padEnd(18)} 중앙 ${Number.isInteger(m) ? m : m.toFixed(2)} ∈ [${band.lo}, ${band.hi}] — ${band.why}`);
  }
  console.log(ok ? '✅ 밴드 충족' : '❌ 밴드 밖');
  if (!ok) process.exit(1);
}

if (determinism) {
  let ok = true;
  for (let s = 1; s <= Math.min(seeds, 3); s++) {
    const again = runBot(new Game(s, b), days);
    if (again.snapshotHash !== runs[s - 1]?.snapshotHash) { ok = false; console.log(`✕ 시드 ${s} 해시 불일치`); }
  }
  console.log(ok ? '✓ 결정론 — 같은 시드 두 번 = 같은 해시' : '❌ 결정론 깨짐');
  if (!ok) process.exit(1);
}

if (json) {
  console.log(JSON.stringify({ seeds, days, sweep, ms, runs }, null, 1));
} else {
  console.log(`봇 ${seeds}시드 × ${days}일 — ${ms}ms`);
  console.log(`  현금 중앙 ${median(runs.map((r) => r.money)).toLocaleString('ko-KR')}G · 방문 중앙 ${median(runs.map((r) => r.visitors))} · 풀 타일 중앙 ${median(runs.map((r) => r.poolTiles))} · 시설 ${median(runs.map((r) => r.facilities))} · 인기 중앙 ${median(runs.map((r) => r.popularity))}`);
  console.log(`  인증 중앙 ${median(runs.map((r) => r.certs))} · 랭크 ${runs.map((r) => r.rank).join('/')} · 레시피 ${median(runs.map((r) => r.recipes))} · 요리 Lv ${median(runs.map((r) => r.cookLevel))} · 식당 매출 비중 ${Math.round((median(runs.map((r) => r.food)) / Math.max(1, median(runs.map((r) => r.food + r.visitors * 200)))) * 100)}%`);
  console.log(`  투자 중앙 ${median(runs.map((r) => r.invests))} · 캠페인 종류 ${median(runs.map((r) => r.campaigns))} · 주말/평일 ${median(runs.map((r) => r.weekendRatio)).toFixed(2)} · 여름/겨울 ${median(runs.map((r) => r.summerWinterRatio)).toFixed(2)}`);
  console.log(`  좋아요 중앙 ${median(runs.map((r) => r.likes))} · 지역 ${median(runs.map((r) => r.areas))} · 친구 ${median(runs.map((r) => r.friends))} · 소원 달성 ${median(runs.map((r) => r.wishes))} · 지역2 개방일 ${runs.map((r) => r.area2Day).join('/')}`);
  const years = runs[0]?.perYear.length ?? 0;
  for (let y = 0; y < years; y++) {
    const ys = runs.map((r) => r.perYear[y]).filter((x): x is NonNullable<typeof x> => !!x);
    console.log(`  ${y + 1}년차 말 — 현금 ${median(ys.map((x) => x.money)).toLocaleString('ko-KR')} · 누적 방문 ${median(ys.map((x) => x.visitors))} · 풀 타일 ${median(ys.map((x) => x.poolTiles))} · 소원 ${median(ys.map((x) => x.wishes))} · 좋아요 ${median(ys.map((x) => x.likes))}`);
  }
}

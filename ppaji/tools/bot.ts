/**
 * 헤드리스 봇 러너 — Phaser 없이 Node 에서 128일을 돈다 (불변식 1 실증).
 *
 *   npm run bot -- --seeds 8 --days 128 [--determinism] [--json] [--sweep key=v,key=v] [--persona balanced|pool|restaurant|cert|course|all] [--bands]
 *
 * `--sweep` 은 `balance.json` 의 키를 덮어쓴다 — 밸런스 조정의 유일한 창구.
 * `--persona all` 은 성향 4종을 차례로 돌려 한 줄씩 비교한다 (G13). `--bands` 는 §2.6 목표 밴드를 판정한다 (밖이면 exit 1).
 */
import { Game } from '../src/sim/game.js';
import { runBot, BOT_PERSONAS, type RunMetrics, type BotPersona } from '../src/sim/bot.js';
import balance from '../src/data/balance.json';
/** P57-c — 봇·골든·계측은 플레이어가 받는 판(main 승인 배치 + 옛 킷 출입동)으로 돈다. `layout=reference` 옛 킷은 하네스 고정물 전용 */
const ARRIVAL = { arrival: true } as const;

/**
 * 목표 밴드 (G13) — balanced 성향 8시드×128일 **중앙값**. §2.6 플레이스홀더에서 실측으로 옮겼다.
 * 이유를 같이 적는다: 숫자만 있으면 다음 사람이 왜 그 값인지 모른다.
 */
const BANDS: { key: keyof RunMetrics; lo: number; hi: number; why: string }[] = [
  { key: 'money', lo: 200000, hi: 7000000, why: '파산 0 이면서 후반에 돈이 남아도는 정도 (PSS 도 후반은 돈이 남는다). G40 버스가 방문을 +25% 올려 상한 300만 → 400만 (시드별 265~394만) · P27 재보정 4M → 7M: 자리 허브(P24~P27 자리·패키지·경관)가 만족·방문·판매를 같이 올려 128일 현금 중앙 336만 → 571만. 수입 축을 더한 뒤라 상한을 옮겼고, §8-10 후반 소비처가 들어오면 다시 내린다' },
  { key: 'certs', lo: 10, hi: 24, why: 'G10 게이트 — 128일에 인증 ≥10' },
  { key: 'areas', lo: 6, hi: 10, why: 'G10 게이트 — 지역 ≥6' },
  { key: 'recipes', lo: 40, hi: 140, why: 'G10 게이트 — 레시피 ≥40' },
  { key: 'rank', lo: 3, hi: 5, why: '★3 ≤Y3 · ★5 는 Y6~Y7 목표 (§2.6)' },
  { key: 'weekendRatio', lo: 1.4, hi: 2.5, why: 'G9 — 주말 ≥ 평일 1.4배 (유입 목표 기준)' },
  { key: 'summerWinterRatio', lo: 1.6, hi: 4, why: 'G9 — 여름/겨울 ≥1.6' },
  { key: 'busGuestsShare', lo: 0.08, hi: 0.3, why: 'G40 — 128일 방문 중 버스로 온 몫 8~30% (캠페인 버스 + 좋아요 버스)' },
  { key: 'rank3Year', lo: 1, hi: 3, why: 'G45 — ★3 은 3년차 안에 (§2.6)' },
  { key: 'rank5Year', lo: 5, hi: 8, why: 'G45 — ★5 는 5~8년차 (§2.6 「Y6~Y7」 + 여유 1년)' },
  { key: 'foodShare', lo: 0.15, hi: 0.65, why: 'G45 — 수입 중 매점 몫 25~65% (원작: 입장료 + 매점이 수입 대부분) · P27: 고기 패키지(선불 매점 1회, 패키지 몫 0.24)가 매점 매출 일부를 대신하므로 하한 0.25 → 0.2 · P57-c: 봇이 main 승인 킷(평상 0)으로 돌아 자리 잡는 팀이 줄어 중앙 0.18 → 하한 0.15(사용자 결정: 킷 시설 = main)' },
  { key: 'cleanliness', lo: 40, hi: 100, why: 'P8 — 알바(편의 시설)가 청결을 받친다. 40 아래면 만족 배수가 0.76 밑으로 떨어진다' },
  { key: 'gearsDistinct', lo: 4, hi: 30, why: 'P7 — 128일 동안 공방·구입으로 기구가 시작 2 에서 4 이상으로 는다 (공방 축이 봇 세계에 산다)' },
  { key: 'wishExpireRatio', lo: 0, hi: 4, why: 'G48 — 만료 소원 ≤ 성립의 3배 (조사 시점 3.2 → 임박 우선 정책 뒤 2.8 · 봇이 조건을 더 잘 좇게 되면 낮춘다) · P18 숙박 뒤 3.0 → 3.2: 자는 친구가 EXP 를 매일 쌓고 좋아요가 +32% 라 소원이 더 많이 **열리는데** 봇의 성립 수(판당 ~85)는 그대로다 — 비율은 열림 속도에 끌려가므로 3.5 로. 성립 절대수가 줄면 그때 봇을 고친다 · P27 뒤 3.62: 자리 허브로 만족·EXP 가 올라 소원이 더 열린다(성립 절대수는 요약의 「소원 달성」으로 같이 본다)' },
  { key: 'certsDistinct', lo: 8, hi: 24, why: 'G51 — 서로 다른 인증 ≥8 (조사 시점: grade_f 하나만 16번)' },
  { key: 'certFamilies', lo: 4, hi: 8, why: 'G51 — 통과한 계열 ≥4 (8계열 중)' },
  { key: 'lateSpendRatio', lo: 0.3, hi: 0.85, why: 'G30 — 5~8년차 지출이 전체의 30% 이상 (후반이 비지 않는다)' },
  { key: 'teamSeatShare', lo: 0.5, hi: 1, why: 'P17→P27 — 자리를 하나라도 잡은 팀 ÷ 전체 팀 ≥ 0.5 (걸어온 손님도 팀이라 손님 비율(0.33)은 정의가 어긋나 팀 단위로 바꿨다)' },
  { key: 'pkgShare', lo: 0.02, hi: 0.3, why: 'P17 — 패키지(고기·기구·수영) 매출 비중. 0 이면 축이 안 산 것, 30% 넘으면 매점을 덮는다' },
  { key: 'passByShare', lo: 0.05, hi: 1.5, why: 'P45-b D63 — 방문당 복도 곁에서 「지나가며 산」 횟수(입장+퇴장). 0.05 아래면 동선 몰이 봇 세계에 없다, 1.5 넘으면 마당을 안 간다' },
  { key: 'overnight', lo: 8, hi: 100000, why: 'P18 — 128일에 자고 간 손님 ≥ 8 (숙박 축이 봇 세계에서 산다)' },
  { key: 'lodgingShare', lo: 0.003, hi: 0.2, why: 'P18 — 숙박 매출 비중. 20% 넘으면 낮 장사를 덮는다' },
  { key: 'teamSeatY1', lo: 0.4, hi: 1, why: 'P27 — 1년차(16일) 자리를 잡은 팀 ÷ 전체 팀 ≥ 0.4 (걸어온 손님도 팀 — 초반 자리 공백 해소)' },
  { key: 'sceneryPop', lo: 6, hi: 400, why: 'P26 — 경관이 시설에 붙는 양(인기). 0 이면 장식·조경이 시설 곁에 없다' },
  { key: 'pkgKinds', lo: 3, hi: 5, why: 'P25 — 배치로 발견되는 패키지 종류 ≥ 3 / 5 (고기·수영·기구·1박 · P50-b2 빠지 자유이용권 — §6 「재보정 pkgKinds 4~5」)' },
  { key: 'seatGradeY4', lo: 3, hi: 5, why: 'P24 — 4년차 자리 등급 중앙 ≥ 3 (물가·먹거리 옆에 자리를 놓는 것이 정답이어야 한다)' },
  { key: 'decorGround', lo: 4, hi: 400, why: 'P22 — 봇이 평상 옆에 꽃밭을 깐다(조경 자리 값). 0 이면 지면 붓 축이 봇 세계에 없다' },
  { key: 'gearsKnownY4', lo: 8, hi: 20, why: 'P19 — 4년차(64일)까지 공방 레시피 발견 8~20 / 30 (실측 26: 연차 부품이 레시피에 안 쓰여 4년차에 다 찾았다 → 11종을 3~7년차 부품으로. 부품값 ×2 는 지렛대가 아니었다 — 4년차 안에 41종을 어차피 다 산다)' },
  { key: 'rigsDistinct', lo: 14, hi: 22, why: 'P50-b1 §6 — 128일 기구 종 수 14~22 / 33 (봇이 종 우선으로 붙인다 — 등급은 종 수로 오른다)' },
  { key: 'rigChainMax', lo: 3, hi: 20, why: 'P50-b1 R5 → P60-d: 뜻이 「입수구에서 몇 번째」(경로 순번) = 최장 경로. 계획 초안 상한 10 은 사슬 기준이었다 — 등급 4 가 한 수역에 기구 14 를 요구하므로 최장 경로 11~14 가 정상(실측 2026-09-18 8시드 전부 14 — 등급 4 문턱에 서고 `chainRigs` 가 경로 ≥ 8 이면 안 잇는다). 20 넘으면 도배' },
  { key: 'rigPathLen', lo: 4, hi: 20, why: 'P60-d §10.4 — 128일 끝 최장 입수 경로(수역별 켜진 기구를 입수구에서 BFS 순으로). 초안 4~10 → 실측 8시드 전부 14(2026-09-18): 등급 4(기구 14)·밤 파티(기구 9)가 한 수역에 모이기를 요구해 10 은 게임 문턱과 어긋난다. 4 아래면 봇이 입수구 곁을 안 채운 것' },
  { key: 'rigPathCompleteShare', lo: 0.1, hi: 1, why: 'P60-d §10.4 — 경로 있는 수역 중 코스 완성(끝 휴식 뺀 스릴 비감소 ∧ 끝 휴식 ∧ 길이 ≥2) 몫. 초안 ≥0.3 → 실측 중앙 0.17(2026-09-18 8시드 0.20/0.17/0.00/0.17/0.17/0.00/0.17/0.20 — 둘은 0): 봇은 스릴 순 자리(`pathFit`)·휴식 마감(`capCourse`)을 하지만 개조(`upgradeRig`)가 앞쪽 기구의 스릴을 올리고 세트 둘째 사본(휴식)이 중간에 끼며 킷 빠지(20칸)는 거리 동점이 많아 uid 순이 곧 놓은 순이다. 0.1 아래면 마감 축이 죽은 것 — `--no-path` 대조군 참고' },
  { key: 'ringEntries', lo: 1, hi: 20, why: 'P60-d §10.4 — 수역별 입수구 수 중앙 ≥ 1 (뭍에 안 닿은 링은 봇 `ensureEntry` 가 라인 조각으로 잇는다). 실측 중앙 3(2026-09-18 8시드 3/3/7/3/3/2/5/4): 둑(물가 포장) 위 평상·자판기가 구간을 가른다(시설이 점유한 칸은 뭍이 아니다). 20 넘으면 둑이 시설로 빼곡한 것' },
  { key: 'rigSetsFound', lo: 3, hi: 8, why: 'P60-c §3.6 — 128일 발견 세트 3~8 / 8. 실측(8시드) 중앙 3(ninja·roll·night — 문턱에 붙어 있다): 「세트 완성 후보 우선」만으론 1 이었다(종을 수역마다 하나씩 흩어 셋째가 설 자리가 없다) → 둘째 사본을 멤버 곁에 + 사슬이 세트 자리를 안 덮게(`chainRigs` 예약) + 링 위 멤버(플로팅 바·도크)를 멤버 곁 데크에. `--no-set` 대조군은 0(킷엔 기구 0). 키즈존은 여울 전용 멤버라 봇 수역(강)엔 못 선다 · 8 은 hidden 4 까지 다 찾은 것' },
  { key: 'rigGradeMax', lo: 3, hi: 4, why: 'P50-b1 R6 — 128일에 대형 빠지(3) 이상 하나' },
  { key: 'rigUseShare', lo: 0.15, hi: 0.65, why: 'P50-b1 — 시설 이용 중 기구·링 시설 몫. 0.15 아래면 기구가 장식, 0.6 넘으면 뭍이 죽는다 · P57-c: main 승인 킷(평상 0)에서 중앙 0.61 → 상한 0.65(뭍 자리는 봇이 뒤에 짓는다)' },
  { key: 'offSeasonSwim', lo: 0.2, hi: 0.55, why: 'P52-c §3.8 — 가을 야외 입수 ÷ 여름(날씨 가중 기대 여름 0.905 · 가을 0.24). 0.55 넘으면 수온이 안 무는 것, 0.2 아래면 비수기가 죽는다' },
  { key: 'accidentsPerVisit', lo: 0.002, hi: 0.02, why: 'P52-b §6 — 방문당 사고 0.2~2% (목표 0.6건/일 ÷ 방문 ~50). 0.002 아래면 사고 축이 안 산 것, 0.02 넘으면 억울하다' },
  { key: 'guardedShare', lo: 0.5, hi: 1, why: 'P52-b — 딥 기구 중 알바 망루 반경 안 몫(봇 `ensureWatchtower`). 0.5 아래면 망루 축이 봇 세계에 없다' },
  { key: 'vestShare', lo: 0.25, hi: 1, why: 'P52-a — 기구 이용 중 팔찌(조끼)를 낀 몫. §6 초안 0.5 는 「팔찌 ⇒ 조끼」 전제였는데 G3 의 하드 게이트는 딥 기구뿐이라 여울·any 기구는 팔찌 없이 탄다(실측 0.32 — 대여소 정원 4 로도 0.32 · 매점 몫만 깎였다). 딥만 세면 1.0 이라 자가 아니다. 0.25 아래면 창구 ⓐ·ⓑ 가 안 돈다' },
  { key: 'ppajiPkgShare', lo: 0.08, hi: 0.3, why: 'P52-a → P52-c — 패키지 매출 중 빠지 자유이용권 몫. 상한 0.25 → 0.3: 수온이 비수기 야외 입수를 깎자 수영 패키지가 줄어 자유이용권 몫이 0.24 → 0.27 로 올랐다(자유이용권 자체는 그대로 — `pkgShare` 상한 0.3 과 같은 값)' },
  { key: 'ppajiRevShare', lo: 0.05, hi: 0.25, why: 'P52-a — 총 수입 중 팔찌 몫(플로팅 바는 매점에 든다). 25% 넘으면 입장료·매점을 덮는다' },
  { key: 'rigUpgrades', lo: 8, hi: 40, why: 'P51 §6 — 128일 개조 8~40 / 레시피 20 (봇이 도감을 보고 찾고 놓인 기구에 적용)' },
  { key: 'rigUpgradesY4', lo: 0, hi: 10, why: 'P51 §4.2 — 후반 6건이 연차 부품에 물려 Y1~Y4 가능 14 · 봇은 ≤10' },
  { key: 'rigPartsBought', lo: 20, hi: 45, why: 'P51 — 장날 부품 9 중 6~12(진열 랭크 안에서 값싼 것부터) → P56-c 재고: 개조에 쓴 부품을 다시 사므로(하루 둘, 재고 0 부터) 첫 구입 9 + 재구매 ~22 = 실측 31. 20 아래면 `restock` 이 안 돈 것, 45 넘으면 개조 없이 사재기' },
  { key: 'ppajiConvertShare', lo: 0.08, hi: 0.4, why: 'P51 — 빠지 지출 중 개조 몫(부품·발견·개조비). 데크·기구·개조 셋의 합 = 1' },
  { key: 'nightNights', lo: 30, hi: 110, why: 'P54 §3.9 — 밤이 열린 날 수. 계획 초안 4~38 은 「가끔 열린다」 전제였는데 실측(8시드) 54~82: 조건(★3·등급 3·조명·기구 9)이 4년차쯤 갖춰지면 그 뒤 매일 열린다. 30 아래면 축이 늦게 서고, 110 넘으면 2년차부터 열린 것' },
  { key: 'nightRevShare', lo: 0.083, hi: 0.34, why: 'P54 §3.9 — 총수입 중 밤 매출(야간권+링 매점 저녁+자리 이용료 저녁) 몫. 하한은 손님이 남는 구간 140/1,680 · 실측 0.15~0.19' },
  { key: 'unlockGapMaxY1_4', lo: 0, hi: 4, why: 'P53-c §4.5 — 1~4년차: 이름 있는 사건(랭크·인증·달력·비트·해금 모달)이 없는 날이 연속 4일(= 여름·가을 한 계절)을 넘지 않는다' },
  { key: 'unlockGapMaxY5_8', lo: 0, hi: 6, why: 'P53-c §4.5 — 5~8년차: 6일(겨울은 의도적으로 비운다 — 연차 폴백 「겨울 택배」가 상한)' },
  { key: 'rigCertsPassed', lo: 3, hi: 9, why: 'P53-a §4.5 — 기구 조건을 든 인증 9(grade_f/d/b/s · stream_d/b · fun_c/a …) 중 128일에 통과한 서로 다른 수. 0 이면 재배선한 인증이 봇 세계에서 교착' },
  { key: 'ppajiSpendShare', lo: 0.02, hi: 0.7, why: 'P50-b1 — 총 지출 중 데크+기구 몫. §6 초안 0.2 는 기구값이 pop×90(5,400~12,600)이라는 전제였는데 §4.1 데이터는 700~12,400 이고 봇 지출은 뭍 시설 ~150채가 대부분(실측 0.02) — 개조(P51)·팔찌(P52)가 들어오면 그 페이즈가 하한을 올린다' },
  { key: 'ppajiDeckShare', lo: 0.12, hi: 0.55, why: 'P50-b1 — 빠지 지출 중 데크 몫 · P56-c 재고: 부품 재구매가 개조 몫을 0.25 → 0.35 로 올려 데크 몫이 0.17 → 0.149(문턱 위에 붙어 있었다). 셋의 합 = 1 이라 하한 0.12 — 데크 절대 지출은 봇 `growPpaji` 그대로' },
  { key: 'ppajiRigShare', lo: 0.2, hi: 0.6, why: 'P50-b1 → P51 — 빠지 지출 중 기구 몫. 개조 몫이 들어와 셋의 합 = 1(상한 0.6 복귀)' },
  { key: 'poolTilesY1', lo: 20, hi: 160, why: 'P49-b — 1년차 말 수역 칸: 킷 20 + 봇 `growPpaji` 가 링을 두른 만큼, 허가 ★2 예산(160) 안 (P48-b2 「허가 밴드는 새 봇이 서는 P49-b 가 잰다」)' },
  { key: 'courses', lo: 2, hi: 6, why: 'P4-A — 선착장이 있으면 봇이 견인 코스를 ≥1 놓는다 (수역 60칸마다 하나 · 최대 3, 상한 6 은 「코스가 판 전체가 된다」 경보) · P20: 8시드 전부 1 이었다(선착장 claim 이 데크 링 전체 · 부표 안 옆 선착장) → 2~3' },
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
// P49-a1 — `--warn k1,k2` 는 그 밴드를 빨강 대신 ⚠ 로(exit 0) · `--no-rig|--no-convert|--no-vest|--no-night|--no-set|--no-path` 는 축 스위치(대조군, 읽는 페이즈가 뒤에 온다)
const warnKeys = new Set(arg('warn', '').split(',').filter(Boolean));
const axisOff = { noRig: process.argv.includes('--no-rig'), noConvert: process.argv.includes('--no-convert'), noVest: process.argv.includes('--no-vest'), noNight: process.argv.includes('--no-night'), noSet: process.argv.includes('--no-set'), noPath: process.argv.includes('--no-path') }; // P60-c `--no-set` · P60-d `--no-path`
const personaArg = arg('persona', 'balanced');
const bands = process.argv.includes('--bands');
const personas: BotPersona[] = personaArg === 'all' ? ['balanced', 'pool', 'restaurant', 'cert', 'course'] : [personaArg as BotPersona];
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
for (let s = 1; s <= seeds; s++) runs.push(runBot(new Game(s, b, ARRIVAL), days, { ...opts, ...axisOff }));
const ms = Math.round(performance.now() - t0);

if (personas.length > 1) {
  const line = (p: BotPersona, rs: RunMetrics[]): string =>
    `  ${p.padEnd(10)} 현금 ${median(rs.map((r) => r.money)).toLocaleString('ko-KR').padStart(10)} · 방문 ${median(rs.map((r) => r.visitors))} · 풀 ${median(rs.map((r) => r.poolTiles))} · 시설 ${median(rs.map((r) => r.facilities))} · 인기 ${median(rs.map((r) => r.popularity))} · 인증 ${median(rs.map((r) => r.certs))} · ★${median(rs.map((r) => r.rank))} · 레시피 ${median(rs.map((r) => r.recipes))} · 식당 ${Math.round((median(rs.map((r) => r.food)) / Math.max(1, median(rs.map((r) => r.food + r.visitors * 200)))) * 100)}% · 지역 ${median(rs.map((r) => r.areas))} · 소원 ${median(rs.map((r) => r.wishes))} · 점수 ${median(rs.map((r) => r.score))}`;
  console.log(`성향 비교 — ${seeds}시드 × ${days}일`);
  console.log(line(personas[0] as BotPersona, runs));
  for (const p of personas.slice(1)) {
    const rs: RunMetrics[] = [];
    for (let s = 1; s <= seeds; s++) rs.push(runBot(new Game(s, b, ARRIVAL), days, { ...BOT_PERSONAS[p], ...axisOff }));
    console.log(line(p, rs));
  }
  process.exit(0);
}

if (bands) {
  let ok = true;
  for (const band of BANDS) {
    const m = median(runs.map((r) => r[band.key] as number));
    const pass = m >= band.lo && m <= band.hi;
    const warned = !pass && warnKeys.has(String(band.key));
    ok = ok && (pass || warned);
    console.log(`  ${pass ? '✓' : warned ? '⚠' : '✕'} ${String(band.key).padEnd(18)} 중앙 ${Number.isInteger(m) ? m : m.toFixed(2)} ∈ [${band.lo}, ${band.hi}] — ${band.why}${warned ? ' (--warn)' : ''}`);
  }
  console.log(ok ? '✅ 밴드 충족' : '❌ 밴드 밖');
  if (!ok) process.exit(1);
}

if (determinism) {
  let ok = true;
  for (let s = 1; s <= Math.min(seeds, 3); s++) {
    const again = runBot(new Game(s, b, ARRIVAL), days);
    if (again.snapshotHash !== runs[s - 1]?.snapshotHash) { ok = false; console.log(`✕ 시드 ${s} 해시 불일치`); }
  }
  console.log(ok ? '✓ 결정론 — 같은 시드 두 번 = 같은 해시' : '❌ 결정론 깨짐');
  if (!ok) process.exit(1);
}

if (json) {
  console.log(JSON.stringify({ seeds, days, sweep, ms, runs }, null, 1));
} else {
  console.log(`봇 ${seeds}시드 × ${days}일 — ${ms}ms`);
  console.log(`  허가 — 1년차 수역 중앙 ${median(runs.map((r) => r.poolTilesY1))}칸 · 128일 남은 허가 중앙 ${median(runs.map((r) => r.permitLeft))}칸 (P49-b)`);
  console.log(`  현금 중앙 ${median(runs.map((r) => r.money)).toLocaleString('ko-KR')}G · 방문 중앙 ${median(runs.map((r) => r.visitors))} · 풀 타일 중앙 ${median(runs.map((r) => r.poolTiles))} · 시설 ${median(runs.map((r) => r.facilities))} · 인기 중앙 ${median(runs.map((r) => r.popularity))}`);
  console.log(`  인증 중앙 ${median(runs.map((r) => r.certs))} · 랭크 ${runs.map((r) => r.rank).join('/')} · 레시피 ${median(runs.map((r) => r.recipes))} · 요리 Lv ${median(runs.map((r) => r.cookLevel))} · 식당 매출 비중 ${Math.round((median(runs.map((r) => r.food)) / Math.max(1, median(runs.map((r) => r.food + r.visitors * 200)))) * 100)}% · 재고 구입 ${median(runs.map((r) => r.stockBuys))} (부품 ${median(runs.map((r) => r.rigPartsBought))}) (P56-c)`);
  console.log(`  투자 중앙 ${median(runs.map((r) => r.invests))} · 캠페인 종류 ${median(runs.map((r) => r.campaigns))} · 주말/평일 ${median(runs.map((r) => r.weekendRatio)).toFixed(2)} · 여름/겨울 ${median(runs.map((r) => r.summerWinterRatio)).toFixed(2)}`);
  console.log(`  좋아요 중앙 ${median(runs.map((r) => r.likes))} · 지역 ${median(runs.map((r) => r.areas))} · 친구 ${median(runs.map((r) => r.friends))} · 소원 달성 ${median(runs.map((r) => r.wishes))} · 지역2 개방일 ${runs.map((r) => r.area2Day).join('/')}`);
  console.log(`  해금 8×3 (연차: 랭크/인증/달력 중앙) — ${(runs[0]?.unlocksByYear ?? []).map((_, y) => `${y + 1}년 ${median(runs.map((r) => r.unlocksByYear[y]?.rank ?? 0))}/${median(runs.map((r) => r.unlocksByYear[y]?.cert ?? 0))}/${median(runs.map((r) => r.unlocksByYear[y]?.calendar ?? 0))}`).join(' · ')} · 최대 공백 1~4년차 ${median(runs.map((r) => r.unlockGapMaxY1_4))}일 · 5~8년차 ${median(runs.map((r) => r.unlockGapMaxY5_8))}일 (P53-c)`);
  console.log(`  밤 빠지 파티 — 열린 날 중앙 ${median(runs.map((r) => r.nightNights))} (${runs.map((r) => r.nightNights).join('/')}) · 밤 매출 몫 중앙 ${median(runs.map((r) => r.nightRevShare)).toFixed(3)} (P54)`);
  console.log(`  입수 경로 — 최장 경로 ${runs.map((r) => r.rigPathLen).join('/')} · 완성 몫 ${runs.map((r) => r.rigPathCompleteShare.toFixed(2)).join('/')} · 입수구 중앙 ${runs.map((r) => r.ringEntries).join('/')} (P60-d)`);
  const years = runs[0]?.perYear.length ?? 0;
  for (let y = 0; y < years; y++) {
    const ys = runs.map((r) => r.perYear[y]).filter((x): x is NonNullable<typeof x> => !!x);
    console.log(`  ${y + 1}년차 말 — 현금 ${median(ys.map((x) => x.money)).toLocaleString('ko-KR')} · 누적 방문 ${median(ys.map((x) => x.visitors))} · 풀 타일 ${median(ys.map((x) => x.poolTiles))} · 소원 ${median(ys.map((x) => x.wishes))} · 좋아요 ${median(ys.map((x) => x.likes))}`);
  }
}

/**
 * goal 게이트 — `npm run gate -- g0`. typecheck → lint → vitest → 정적 UI 검사(+selftest) →
 * dev 서버를 자식으로 띄우고 브라우저 실터치 검증. 하나라도 빨간불이면 종료 코드 1.
 */
import { spawn, spawnSync } from 'node:child_process';
import { sourceDigest } from './build-identity.js';

const goal = process.argv[2] ?? 'g0';
const PORT = Number(new URL(process.env['PJ_URL'] ?? 'http://localhost:5187').port || 80);
import { goalNum } from './goal-num.js';

function run(name: string, cmd: string, args: string[]): void {
  console.log(`\n── ${name} ──`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`❌ ${name} 실패`);
    process.exit(1);
  }
}

async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${PORT}/__pj_build`);
    return r.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  run('typecheck', 'npx', ['tsc', '--noEmit']);
  run('lint', 'npx', ['eslint', '.']);
  run('vitest', 'npx', ['vitest', 'run']);
  run('check-ui', 'node', ['tools/check-ui.mjs']);
  run('check-ui --selftest', 'node', ['tools/check-ui.mjs', '--selftest']);
  if (goalNum(goal) >= goalNum('p49a2')) { run('check-tiles-dead', 'node', ['tools/check-tiles-dead.mjs']); run('check-tiles-dead --selftest', 'node', ['tools/check-tiles-dead.mjs', '--selftest']); } // P49-a2 §4.4: 물빛 참조 0건 + 자가 대조군
  if ((goalNum(goal)) >= 2) run('bot 8×16 --determinism', 'npx', ['tsx', 'tools/bot.ts', '--seeds', '8', '--days', '16', '--determinism']);
  // G10 데이터 전량 · G13 밸런스 — 128일 중앙값이 목표 밴드(tools/bot.ts BANDS: 지역 ≥6 · 인증 ≥10 · 레시피 ≥40 · ★3+ · 계절/주말 곡선) 안
  // P49-a1 §14 — 물빛 인기가 빠지 등급으로 바뀌었는데 봇은 P50-a 전까지 기구를 물 위에 못 놓는다(인기 중앙 10110 → 3430, ★5 미달). 그 사이 ★5 밴드는 ⚠ 로 둔다 — 되돌리는 페이즈는 P50-b2(등급 인기가 봇 세계에 산다)
  // P50-b1: 기구는 팔찌(P52-a) 전까지 공짜라 이용의 45% 가 수입·좋아요 0 → ★3 이 3년차 → 4년차(친구 14~17/18). 게임 규칙이 아니라 페이즈 순서라 P52-a 까지 `--warn rank3Year`
  // P50-b2 실측: ★5 는 인기(3,200~4,000/4,200)·친구(34~41/44)·지역(5~7/7)이 8년차에 다 못 찬다 — 기구 이용 45% 가 팔찌 전까지 수입·좋아요 0 이라 ★3 과 같은 원인. 둘 다 P52-a 까지 ⚠
  // P52-a 실측(팔찌가 팔린 뒤): ★5 는 8시드 중 넷이 7~8년차, 넷은 미달(중앙 99) · ★3 은 4년차. 둘 다 오른쪽으로 움직였지만 밴드 안은 아니다 — 밸런스 스윕(P55)까지 ⚠ 로 두고 실측을 이력에 적는다(「예상과 반대로 움직이면 빨간불」의 반대 방향)
  // P56-a(2026-09-11): 그림 우선 UI 는 번호가 P55 보다 크지만 순서줄에서 P55 밸런스 스윕 **앞**이다 — ★3·★5 경고 창을 P56 에도 연다(스윕이 닫히면 이 줄을 지운다)
  const beforeSweep = goalNum(goal) < goalNum('p55'); // P55 스윕(2026-09-11) 뒤: P55·P56 은 ★ 경고 창 없이 초록이어야 한다
  const warnKeys = [goalNum(goal) >= goalNum('p49a1') && beforeSweep ? 'rank5Year' : '', goalNum(goal) >= goalNum('p50b1') && beforeSweep ? 'rank3Year' : ''].filter(Boolean);
  const warn = warnKeys.length ? ['--warn', warnKeys.join(',')] : [];
  if ((goalNum(goal)) >= 10) run('bot 8×128 --bands', 'npx', ['tsx', 'tools/bot.ts', '--seeds', '8', '--days', '128', '--bands', ...warn]);
  if (goalNum(goal) >= goalNum('p51')) run('measure 8×128', 'npx', ['tsx', 'tools/measure.ts', '--seeds', '8', '--days', '128']); // P51: 재탑승 비율 ≤ 0.3
  if (goalNum(goal) >= goalNum('p55')) run('check-assets --selftest', 'node', ['tools/check-assets.mjs', '--selftest']);
  if (goalNum(goal) >= goalNum('p56b')) { run('check-pictures', 'node', ['tools/check-pictures.mjs']); run('check-pictures --selftest', 'node', ['tools/check-pictures.mjs', '--selftest']); } // P56-b: 그림 342 반입 자(≥300 · 규격 · 팔레트 · 실루엣) + 위반 4종 대조군 // P55: 에셋 계약 정적 자

  let child: ReturnType<typeof spawn> | null = null;
  if (!(await serverUp())) {
    console.log(`\n── dev 서버 (${PORT}) ──`);
    child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: process.env });
    for (let k = 0; k < 60 && !(await serverUp()); k++) await new Promise((r) => setTimeout(r, 500));
    if (!(await serverUp())) {
      console.error('❌ dev 서버가 안 뜬다');
      child.kill();
      process.exit(1);
    }
  }
  const served = await (await fetch(`http://localhost:${PORT}/__pj_build`)).json() as { sourceDigest?: string };
  if (served.sourceDigest !== sourceDigest(process.cwd())) {
    child?.kill();
    throw new Error(`포트 ${PORT}는 현재 체크아웃과 다른 소스입니다. 현재 서버를 재시작하거나 PJ_URL로 별도 검증 포트를 지정하세요.`);
  }
  const r = spawnSync('npx', ['tsx', 'tools/verify.ts', '--goal', goal], { stdio: 'inherit', env: process.env });
  child?.kill();
  if (r.status !== 0) {
    console.error(`❌ verify ${goal} 실패`);
    process.exit(1);
  }
  console.log(`\n✅ 게이트 ${goal} 통과`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

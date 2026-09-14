/**
 * goal 게이트 — `npm run gate -- g0`. typecheck → lint → vitest → 정적 UI 검사(+selftest) →
 * dev 서버를 자식으로 띄우고 브라우저 실터치 검증. 하나라도 빨간불이면 종료 코드 1.
 */
import { spawn, spawnSync } from 'node:child_process';

const goal = process.argv[2] ?? 'g0';
const PORT = 5177;

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
    const r = await fetch(`http://localhost:${PORT}/__wp_build`);
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
  if ((Number(goal.replace(/^g/, '')) || 0) >= 2) run('bot 8×16 --determinism', 'npx', ['tsx', 'tools/bot.ts', '--seeds', '8', '--days', '16', '--determinism']);
  // G10 데이터 전량 · G13 밸런스 — 128일 중앙값이 목표 밴드(tools/bot.ts BANDS: 지역 ≥6 · 인증 ≥10 · 레시피 ≥40 · ★3+ · 계절/주말 곡선) 안
  if ((Number(goal.replace(/^g/, '')) || 0) >= 10) run('bot 8×128 --bands', 'npx', ['tsx', 'tools/bot.ts', '--seeds', '8', '--days', '128', '--bands']);

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

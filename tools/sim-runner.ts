/**
 * 헤드리스 시뮬레이터 — 계획서 §5.2.
 *
 * sim/ 만 import 한다. Phaser·DOM·에셋은 건드리지 않는다.
 * 이 파일이 Node 에서 도는 것 자체가 아키텍처 불변식 1 의 실증이다.
 *
 * 사용:
 *   npm run sim
 *   npm run sim -- --seed 42 --days 8
 *   npm run sim -- --seed 1 --ticks 100000 --width 96 --height 96
 *   npm run sim -- --determinism        (같은 시드 재현성 확인)
 *
 * 타이쿤 게임은 밸런싱에서 죽는다. 사람이 수 주간 플레이해야 알 수 있는 것을
 * 여기서 초 단위로 돌려 숫자로 잡는 것이 목표다.
 */
import {
  Game,
  TERRAIN_NAMES,
  TICKS_PER_DAY,
  Terrain,
  isWater,
  isWalkable,
  requireFacilityDef,
  type GameStats,
} from '../src/sim/index.js';

interface Args {
  seed: number;
  ticks: number;
  width: number;
  height: number;
  determinism: boolean;
  park: boolean;
  guests: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    seed: 1,
    ticks: TICKS_PER_DAY * 8, // 성수기 8일치
    width: 64,
    height: 64,
    determinism: false,
    park: false,
    guests: 200,
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--seed':
        a.seed = Number(val);
        i++;
        break;
      case '--ticks':
        a.ticks = Number(val);
        i++;
        break;
      case '--days':
        a.ticks = Number(val) * TICKS_PER_DAY;
        i++;
        break;
      case '--width':
        a.width = Number(val);
        i++;
        break;
      case '--height':
        a.height = Number(val);
        i++;
        break;
      case '--determinism':
        a.determinism = true;
        break;
      case '--park':
        a.park = true;
        break;
      case '--guests':
        a.guests = Number(val);
        a.park = true;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'number' && !Number.isFinite(v)) {
      console.error(`잘못된 인자: --${k}`);
      process.exit(1);
    }
  }
  return a;
}

function printHelp(): void {
  console.log(`
헤드리스 빠지 타이쿤 시뮬레이터

  --seed <n>       난수 시드 (기본 1)
  --days <n>       시뮬레이션할 게임 일수
  --ticks <n>      시뮬레이션할 tick 수 (--days 대신)
  --width <n>      맵 너비 타일 (기본 64)
  --height <n>     맵 높이 타일 (기본 64)
  --determinism    같은 시드가 같은 결과를 내는지 검사
  --park           시범 빠지를 짓고 손님을 돌린다
  --guests <n>     동시 손님 상한 (--park 자동 적용, 기본 200)
  -h, --help       이 도움말
`);
}

/**
 * 원하는 지점 근처에서 실제로 지을 수 있는 자리를 나선형으로 찾아 배치한다.
 * 지형이 시드마다 다르므로 좌표를 못 박으면 대부분 실패한다.
 */
function placeNear(
  game: Game,
  defId: string,
  wantX: number,
  wantY: number,
  maxRadius = 14,
): boolean {
  const def = requireFacilityDef(defId);
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        // 반지름 r 의 테두리만 검사 (안쪽은 이전 반복에서 이미 봤다)
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = wantX + dx;
        const y = wantY + dy;
        if (!game.facilities.canPlace(def, x, y, 0).ok) continue;
        return game.placeFacility(defId, x, y, 0) !== null;
      }
    }
  }
  return false;
}

/**
 * 시범 빠지를 짓는다. 성능 측정과 밸런싱 실험의 기준 배치.
 * 게이트 주변에 편의시설을 흩어 놓아 손님이 실제로 돌아다니게 한다.
 */
function buildDemoPark(game: Game): void {
  const { world } = game;

  // 게이트는 걸을 수 있는 지형 중 위쪽에서 찾는다
  const cx = Math.floor(world.width / 2);
  let gx = cx;
  let gy = -1;
  outer: for (let y = 2; y < world.height; y++) {
    for (let dx = 0; dx < world.width / 2; dx++) {
      for (const x of [cx - dx, cx + dx]) {
        if (isWalkable(world.at(x, y)) && isWalkable(world.at(x + 2, y + 1))) {
          gx = x;
          gy = y;
          break outer;
        }
      }
    }
  }
  if (gy < 0) {
    console.error('시범 빠지: 게이트를 놓을 자리를 찾지 못했습니다');
    return;
  }
  if (!game.placeFacility('gate', gx, gy, 0)) {
    console.error('시범 빠지: 게이트 배치 실패');
    return;
  }

  const plan: Array<[string, number, number]> = [
    ['shop', gx - 8, gy + 4],
    ['restroom', gx + 6, gy + 3],
    ['shower', gx - 5, gy + 9],
    ['changing', gx + 4, gy + 8],
    ['shade', gx - 1, gy + 6],
    ['shade', gx + 9, gy + 6],
    ['shop', gx + 2, gy + 12],
    ['restroom', gx - 10, gy + 11],
  ];

  let built = 1;
  const failed: string[] = [];
  for (const [id, x, y] of plan) {
    if (placeNear(game, id, x, y)) built++;
    else failed.push(id);
  }

  console.log(`시범 빠지: 시설 ${built}/${plan.length + 1}개 배치 (게이트 @ ${gx},${gy})`);
  if (failed.length > 0) console.log(`  자리 없어 못 지음: ${failed.join(', ')}`);
}

const bar = (frac: number, width = 24): string => {
  const n = Math.round(frac * width);
  return '█'.repeat(n) + '·'.repeat(width - n);
};

function reportWorld(game: Game): void {
  const hist = game.world.histogram();
  const total = game.world.tiles.length;

  const entries = [...hist.entries()].sort((x, y) => y[1] - x[1]);
  let land = 0;
  let water = 0;
  for (const [t, n] of entries) {
    if (isWater(t)) water += n;
    else land += n;
  }

  console.log(`\n지형 구성  (${game.world.width}×${game.world.height} = ${total} 타일)`);
  console.log('─'.repeat(56));
  for (const [t, n] of entries) {
    const name = TERRAIN_NAMES[t] ?? `?${t}`;
    const frac = n / total;
    console.log(
      `  ${name.padEnd(6)} ${bar(frac)} ${String(n).padStart(5)}  ${(frac * 100).toFixed(1).padStart(5)}%`,
    );
  }
  console.log('─'.repeat(56));
  console.log(
    `  육지 ${((land / total) * 100).toFixed(1)}%   물 ${((water / total) * 100).toFixed(1)}%`,
  );

  const buildable = hist.get(Terrain.Plain) ?? 0;
  console.log(`  건설 가능 평지: ${buildable} 타일 (${((buildable / total) * 100).toFixed(1)}%)`);
}

function checkDeterminism(args: Args): boolean {
  console.log('\n결정론 검사 (아키텍처 불변식 2)');
  console.log('─'.repeat(56));

  const runOnce = (): { stats: GameStats; tiles: string; rng: number } => {
    const g = new Game({ seed: args.seed, width: args.width, height: args.height });
    g.run(args.ticks);
    return {
      stats: g.stats(),
      tiles: Array.from(g.world.tiles).join(','),
      rng: g.guestRng.next(),
    };
  };

  const a = runOnce();
  const b = runOnce();

  const sameStats = JSON.stringify(a.stats) === JSON.stringify(b.stats);
  const sameTiles = a.tiles === b.tiles;
  const sameRng = a.rng === b.rng;
  const ok = sameStats && sameTiles && sameRng;

  console.log(`  상태  ${sameStats ? '✓ 일치' : '✗ 불일치'}`);
  console.log(`  지형  ${sameTiles ? '✓ 일치' : '✗ 불일치'}`);
  console.log(`  난수  ${sameRng ? '✓ 일치' : '✗ 불일치'}`);
  console.log(ok ? '\n  ✓ 결정론 유지됨 — 헤드리스 밸런싱을 신뢰할 수 있음' : '\n  ✗ 결정론 깨짐');
  return ok;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.log('빠지 타이쿤 · 헤드리스 시뮬레이터');
  console.log(`시드 ${args.seed} · ${args.ticks.toLocaleString()} tick (${(args.ticks / TICKS_PER_DAY).toFixed(1)}일)`);

  const t0 = performance.now();
  const game = new Game({ seed: args.seed, width: args.width, height: args.height });
  const genMs = performance.now() - t0;

  if (args.park) {
    buildDemoPark(game);
    game.arrivals = { ticksPerGroup: 12, maxGuests: args.guests };
    // 손님이 목표 인원까지 차오르도록 워밍업 (측정에서 제외)
    let warm = 0;
    while (game.guests.count < args.guests * 0.9 && warm < 40_000) {
      game.step();
      warm++;
    }
    console.log(`워밍업 ${warm.toLocaleString()} tick → 손님 ${game.guests.count}명`);
  }

  const t1 = performance.now();
  game.run(args.ticks);
  const runMs = performance.now() - t1;

  reportWorld(game);

  const s = game.stats();

  console.log('\n성능');
  console.log('─'.repeat(56));
  console.log(`  맵 생성   ${genMs.toFixed(1)} ms`);
  console.log(`  시뮬 ${args.ticks.toLocaleString()} tick   ${runMs.toFixed(1)} ms`);
  const msPerTick = runMs / args.ticks;
  console.log(`  tick 당   ${msPerTick.toFixed(4)} ms  (손님 ${s.guests}명 기준)`);

  // 모바일 판단 기준: 60fps 프레임 예산 16.6ms 중 sim 이 쓰는 몫.
  // 1배속은 프레임당 tick 이 1 미만이지만, 3배속에서 한 프레임에 최대 3 tick 이 돈다.
  const worstFrameMs = msPerTick * 3;
  const budgetPct = (worstFrameMs / 16.6) * 100;
  console.log(
    `  3배속 최악 프레임 ${worstFrameMs.toFixed(3)} ms  → 60fps 예산의 ${budgetPct.toFixed(1)}%`,
  );
  const perSec = runMs > 0 ? (args.ticks / runMs) * 1000 : Infinity;
  console.log(`  처리 속도  ${Math.round(perSec).toLocaleString()} tick/s`);

  console.log('\n상태');
  console.log('─'.repeat(56));
  console.log(`  tick ${s.tick.toLocaleString()} · ${s.day}일차 · 시드 ${s.seed}`);
  if (args.park) {
    console.log(`  시설 ${s.facilities}개 · 손님 ${s.guests}명 · 대기 ${s.queued}명`);
    console.log(`  평균 만족도 ${s.avgHappiness.toFixed(1)}`);
  }

  let ok = true;
  if (args.determinism) ok = checkDeterminism(args);

  console.log('');
  process.exit(ok ? 0 : 1);
}

main();

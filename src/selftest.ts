import './compat.js';
import { APPLIED_POLYFILLS } from './compat.js';
import { Game as Sim, isWalkable, requireFacilityDef } from './sim/index.js';
import { ProceduralProvider, ALL_SPRITE_IDS, TILE_SIZE } from './assets/index.js';

/**
 * 모바일 자가진단.
 *
 * 최우선 목표가 "폰에서 돌아가는 것"인데 개발 환경에서 실기기를 직접 몰 수 없으므로,
 * 폰에서 이 페이지만 열면 판정이 나오도록 만든다.
 * "이것저것 눌러보고 알려주세요"를 "링크 하나 열면 됩니다"로 바꾸는 장치.
 */

type Verdict = 'pass' | 'warn' | 'fail' | 'info';

interface Check {
  name: string;
  verdict: Verdict;
  detail: string;
}

const checks: Check[] = [];
const add = (name: string, verdict: Verdict, detail: string): void => {
  checks.push({ name, verdict, detail });
};

// ─────────────────────────────────────────────
// 1. 기기 · 브라우저
// ─────────────────────────────────────────────

function checkDevice(): void {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const platform = isIOS ? 'iOS' : isAndroid ? 'Android' : '데스크톱';

  add(
    '기기',
    'info',
    `${platform} · ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x · ` +
      `터치포인트 ${navigator.maxTouchPoints}`,
  );

  // iOS 버전 (Safari 16.4 = roundRect 분기점)
  const m = /OS (\d+)_(\d+)/.exec(ua);
  if (m) {
    const major = Number(m[1]);
    const minor = Number(m[2]);
    add(
      'iOS 버전',
      major >= 17 ? 'pass' : major === 16 && minor >= 4 ? 'pass' : 'warn',
      `${major}.${minor}${major < 16 ? ' — 구형. 폴리필로 보정됨' : ''}`,
    );
  }
}

// ─────────────────────────────────────────────
// 2. 필수 웹 기능
// ─────────────────────────────────────────────

function checkWebGL(): void {
  const c = document.createElement('canvas');
  const gl =
    (c.getContext('webgl2') as WebGL2RenderingContext | null) ??
    (c.getContext('webgl') as WebGLRenderingContext | null);

  if (!gl) {
    add('WebGL', 'warn', '없음 — Phaser 가 Canvas 모드로 떨어짐 (느리지만 동작)');
    return;
  }
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const isWebGL2 = 'drawBuffers' in gl && c.getContext('webgl2') !== null;
  const worldPx = 96 * TILE_SIZE; // 최대 맵(96타일)의 지형 텍스처 한 변

  add(
    'WebGL',
    maxTex >= worldPx ? 'pass' : 'fail',
    `${isWebGL2 ? 'WebGL2' : 'WebGL1'} · 최대 텍스처 ${maxTex}px ` +
      `(최대 맵 지형 ${worldPx}px 필요)`,
  );
}

function checkCanvasApis(): void {
  const g = document.createElement('canvas').getContext('2d');
  if (!g) {
    add('Canvas 2D', 'fail', '컨텍스트를 못 얻음 — 게임이 뜰 수 없음');
    return;
  }
  const has = (n: string): boolean =>
    typeof (g as unknown as Record<string, unknown>)[n] === 'function';

  const missing = ['roundRect', 'ellipse', 'createLinearGradient', 'drawImage'].filter(
    (n) => !has(n),
  );
  add(
    'Canvas 2D API',
    missing.length === 0 ? 'pass' : 'fail',
    missing.length === 0 ? '필요한 함수 전부 있음' : `없음: ${missing.join(', ')}`,
  );

  if (APPLIED_POLYFILLS.length > 0) {
    add('폴리필 적용', 'warn', APPLIED_POLYFILLS.join(', '));
  }
}

function checkInput(): void {
  const pointer = 'PointerEvent' in window;
  const touch = navigator.maxTouchPoints > 0;
  add(
    '입력',
    pointer ? 'pass' : 'fail',
    `PointerEvent ${pointer ? '있음' : '없음'} · ` +
      `멀티터치 ${navigator.maxTouchPoints >= 2 ? '가능(핀치 줌 OK)' : touch ? '1점만' : '없음(데스크톱)'}`,
  );
}

function checkSafeArea(): void {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top);visibility:hidden';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const bottom = parseFloat(cs.paddingBottom) || 0;
  const top = parseFloat(cs.paddingTop) || 0;
  probe.remove();
  add(
    '안전영역',
    'info',
    `상단 ${top}px · 하단 ${bottom}px` + (bottom > 0 ? ' (홈 인디케이터 회피 필요)' : ''),
  );
}

function checkStorage(): void {
  try {
    const k = '__ppaji_probe__';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    add('저장소', ok ? 'pass' : 'fail', ok ? 'localStorage 동작' : '읽기 실패');
  } catch (e) {
    add('저장소', 'fail', `localStorage 사용 불가: ${String(e)}`);
  }
}

// ─────────────────────────────────────────────
// 3. 실제 성능 — 이 폰에서 이 게임이 도는가
// ─────────────────────────────────────────────

function buildPark(sim: Sim, targetGuests: number): number {
  const w = sim.world;
  let gx = Math.floor(w.width / 2);
  let gy = -1;
  outer: for (let y = 2; y < w.height; y++) {
    for (let dx = 0; dx < w.width / 2; dx++) {
      for (const x of [gx - dx, gx + dx]) {
        if (isWalkable(w.at(x, y)) && isWalkable(w.at(x + 2, y + 1))) {
          gx = x;
          gy = y;
          break outer;
        }
      }
    }
  }
  if (gy < 0) return 0;
  sim.placeFacility('gate', gx, gy, 0);

  const plan: Array<[string, number, number]> = [
    ['shop', gx - 8, gy + 4],
    ['restroom', gx + 6, gy + 3],
    ['shower', gx - 5, gy + 9],
    ['changing', gx + 4, gy + 8],
    ['shade', gx - 1, gy + 6],
    ['shop', gx + 2, gy + 12],
  ];
  for (const [id, wx, wy] of plan) {
    const def = requireFacilityDef(id);
    search: for (let r = 0; r <= 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (sim.facilities.canPlace(def, wx + dx, wy + dy, 0).ok) {
            sim.placeFacility(id, wx + dx, wy + dy, 0);
            break search;
          }
        }
      }
    }
  }

  sim.arrivals = { ticksPerGroup: 10, maxGuests: targetGuests };
  let warm = 0;
  while (sim.guests.count < targetGuests * 0.9 && warm < 30_000) {
    sim.step();
    warm++;
  }
  return sim.guests.count;
}

function checkSimPerf(): void {
  const sim = new Sim({ seed: 20260811, width: 64, height: 64 });
  const guests = buildPark(sim, 250);

  const TICKS = 3000;
  const t0 = performance.now();
  sim.run(TICKS);
  const ms = performance.now() - t0;
  const perTick = ms / TICKS;
  const worstFrame = perTick * 3; // 3배속이면 한 프레임에 최대 3 tick
  const pct = (worstFrame / 16.6) * 100;

  add(
    '시뮬 성능',
    pct < 25 ? 'pass' : pct < 60 ? 'warn' : 'fail',
    `손님 ${guests}명 · tick당 ${perTick.toFixed(3)}ms · ` +
      `3배속 최악 프레임 ${worstFrame.toFixed(2)}ms = 60fps 예산의 ${pct.toFixed(1)}%`,
  );
}

function checkSpriteBake(): void {
  const provider = new ProceduralProvider();
  const t0 = performance.now();
  let n = 0;
  for (const id of ALL_SPRITE_IDS) {
    provider.get(id);
    n++;
  }
  const ms = performance.now() - t0;
  add(
    '스프라이트 생성',
    ms < 600 ? 'pass' : ms < 1500 ? 'warn' : 'fail',
    `${n}장을 ${ms.toFixed(0)}ms 에 구움 (부팅 때 한 번)`,
  );
}

function checkBlitThroughput(): void {
  const provider = new ProceduralProvider();
  const sprite = provider.get('guest/body:0/down/0');

  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 800;
  const g = c.getContext('2d');
  if (!g) {
    add('스프라이트 그리기', 'fail', '컨텍스트 없음');
    return;
  }
  g.imageSmoothingEnabled = false;

  const COUNT = 500;
  const FRAMES = 30;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    g.clearRect(0, 0, 800, 800);
    for (let i = 0; i < COUNT; i++) {
      g.drawImage(sprite, (i * 37) % 780, (i * 53) % 780);
    }
  }
  const msPerFrame = (performance.now() - t0) / FRAMES;
  const pct = (msPerFrame / 16.6) * 100;

  add(
    '스프라이트 그리기',
    pct < 30 ? 'pass' : pct < 70 ? 'warn' : 'fail',
    `${COUNT}장/프레임 → ${msPerFrame.toFixed(2)}ms = 60fps 예산의 ${pct.toFixed(0)}% ` +
      `(2D 캔버스 기준. 실제 게임은 WebGL 이라 더 빠름)`,
  );
}

// ─────────────────────────────────────────────
// 출력
// ─────────────────────────────────────────────

const ICON: Record<Verdict, string> = { pass: '✓', warn: '!', fail: '✕', info: 'ℹ' };

function render(): void {
  const root = document.getElementById('report');
  if (!root) return;

  const fails = checks.filter((c) => c.verdict === 'fail').length;
  const warns = checks.filter((c) => c.verdict === 'warn').length;

  const banner = document.createElement('div');
  banner.className = `banner ${fails > 0 ? 'fail' : warns > 0 ? 'warn' : 'pass'}`;
  banner.textContent =
    fails > 0
      ? `✕ 이 기기에서 문제 ${fails}건`
      : warns > 0
        ? `! 동작하지만 주의 ${warns}건`
        : '✓ 이 기기에서 문제없이 돌아갑니다';
  root.append(banner);

  for (const c of checks) {
    const row = document.createElement('div');
    row.className = `row ${c.verdict}`;
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = ICON[c.verdict];
    const body = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.name;
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = c.detail;
    body.append(name, detail);
    row.append(icon, body);
    root.append(row);
  }

  const back = document.createElement('a');
  back.href = './';
  back.className = 'back';
  back.textContent = '← 게임으로';
  root.append(back);
}

function run(): void {
  checkDevice();
  checkWebGL();
  checkCanvasApis();
  checkInput();
  checkSafeArea();
  checkStorage();
  try {
    checkSpriteBake();
    checkBlitThroughput();
    checkSimPerf();
  } catch (e) {
    add('성능 측정', 'fail', String(e));
  }
  render();
}

run();

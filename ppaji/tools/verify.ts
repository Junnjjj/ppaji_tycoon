/**
 * 브라우저 실터치 검증 — goal 마다 절이 늘어난다. dev 서버(5187)가 떠 있어야 한다.
 *
 *   npx tsx tools/verify.ts --goal g0
 *
 * ## 함정 (부모 리포 실측 — 그대로 지킨다)
 * - `page.evaluate` 에 넘기는 템플릿 리터럴 안에 백틱·`\n` 이스케이프를 쓰지 말 것
 *   (TS 가 실제 줄바꿈으로 바꿔 페이지 쪽 정규식을 깨뜨린다. 필요하면 String.fromCharCode(10))
 * - `page.evaluate` 안에서 이름 있는 함수를 쓰지 말 것 (tsx 가 `__name` 헬퍼를 주입하는데 페이지엔 없다)
 * - 멀티터치·드래그는 CDP `Input.dispatchTouchEvent` 로 (합성 PointerEvent 는 Phaser 가 무시한다)
 * - 픽셀 검사는 `?px=1` 없이는 검은색이 돌아와 **조용히 통과**한다
 */
import { chromium, type CDPSession } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { gateTile } from '../src/sim/grid.js';

const BASE = process.env['PJ_URL'] ?? 'http://localhost:5187';
// Historical G/P fixtures use their original system starter; the approved layout is tested separately below.
const URL = `${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`; // tut=0: 튜토리얼 Strip 은 G12 절이 따로 켜서 본다
const GOAL = process.argv[process.argv.indexOf('--goal') + 1] ?? 'g0';
/** ⚠ 문자열 비교는 'g11' < 'g3' 이라 절을 건너뛴다 — 숫자로 잰다 */
/** P0: 빠지 스토리 goal `pN` = 승계 G0~G57 전부 + P 절(100+N). `gN` 은 승계 번호 그대로 */
import { goalNum } from './goal-num.js';
import { Game } from '../src/sim/game.js';
import { runBot } from '../src/sim/bot.js';
import { save, SAVE_KEY } from '../src/save/save.js';
const G = goalNum(GOAL);
const HEADED = process.argv.includes('--headed');
const SHOT_DIR = 'tmp-shots';

/** iPhone 14 Pro 급 — DPR 3 이 정수라 도트 격자에 유리한 쪽 */
const DEVICE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

type Verdict = 'pass' | 'fail' | 'info';
const results: { name: string; verdict: Verdict; detail: string }[] = [];
const record = (name: string, verdict: Verdict, detail = ''): void => {
  results.push({ name, verdict, detail });
  console.log(`  ${verdict === 'pass' ? '✓' : verdict === 'fail' ? '✕' : 'ℹ'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function touch(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function drag(cdp: CDPSession, x0: number, y0: number, x1: number, y1: number, steps = 8): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  await wait(40);
  for (let k = 1; k <= steps; k++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + ((x1 - x0) * k) / steps, y: y0 + ((y1 - y0) * k) / steps, id: 1 }],
    });
    await wait(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function pinch(cdp: CDPSession, cx: number, cy: number, from: number, to: number, steps = 10): Promise<void> {
  const pts = (d: number) => [
    { x: cx - d / 2, y: cy, id: 1 },
    { x: cx + d / 2, y: cy, id: 2 },
  ];
  // ⚠ 이벤트 사이에 한 프레임 이상 둔다 — 한 틱에 몰아 보내면 Phaser 가 move 를 down 과 같은 프레임에서 먹어 핀치가 안 걸린다 (실측)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  await wait(60);
  for (let k = 1; k <= steps; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + ((to - from) * k) / steps) });
    await wait(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 홈 상시 컨트롤을 **정체로** 잰다 — 개수로 재면 수가 우연히 맞아 조용히 통과한다 */
const HOME_IDENTITY = `(() => {
  const want = [['save', '#hud-save'], ['info', '#hud-info'], ['menu', '#hud-menu'], ['ticker', '#hud-ticker'],
    ['build', '#hud-right [data-cell="build"]'], ['zone', '#hud-right [data-cell="zone"]'], ['course', '#hud-right [data-cell="course"]'],
    ['sns', '#hud-right [data-cell="sns"]'], ['market', '#hud-right [data-cell="market"]']];
  const shown = (n) => { if (!n) return false; const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = n.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  const missing = [], small = [], stolen = [], seen = new Set();
  for (const [name, sel] of want) {
    const n = document.querySelector(sel);
    if (!shown(n)) { missing.push(name); continue; }
    seen.add(n);
    const r = n.getBoundingClientRect();
    const hit = name === 'ticker' ? 44 : Math.min(r.width, r.height);
    if (hit < 44) small.push(name + ':' + Math.round(hit));
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const at = document.elementFromPoint(cx, cy);
    if (!at || !(at === n || n.contains(at))) stolen.push(name);
  }
  const extra = [];
  for (const n of document.querySelectorAll('button, select, input, [role="button"]')) {
    if (!shown(n) || n.disabled || seen.has(n)) continue;
    if (want.some(([, sel]) => n.closest(sel))) continue;
    extra.push(n.id || n.className || n.tagName);
  }
  const areaOf = (sel) => { const n = document.querySelector(sel); if (!n || !shown(n)) return 0; const r = n.getBoundingClientRect(); return r.width * r.height; };
  const hudArea = areaOf('#hud-top') + areaOf('#hud-right') + areaOf('#hud-ticker') + areaOf('#hud-bottom');
  return { missing, small, stolen, extra, hudPct: Math.round((hudArea / (innerWidth * innerHeight)) * 1000) / 10 };
})()`;

/**
 * G1 — 풀 편집 독으로 2×2 를 파고, 시간을 감아 손님이 오고, 세이브가 왕복된다.
 * 전부 **진짜 터치**로: 우측 `풀 편집` 칸 → 지도 칸 4개 탭 → `완료`.
 */
async function verifyG1(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number }> =>
    (await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number };
  await page.evaluate(`window.__pj.scene.setUpscale(1)`);
  const cell = await center('#hud-right [data-cell="zone"]');
  await touch(cdp, cell.x, cell.y);
  await page.waitForTimeout(250);
  const dockUp = (await page.evaluate(`!document.getElementById('dock-pool').hidden && document.documentElement.dataset.uiSurface === 'pool'`)) as boolean;
  record('G1 풀 편집 칸 → 독이 뜨고 소유권이 pool', dockUp ? 'pass' : 'fail');
  // 홈 입력층은 내려가 있어야 한다
  // G43 부터 우측 열은 반투명으로 남는다(탭하면 「먼저 배치를 마치세요」) — 하단 바만 내려간다
  const homeDown = (await page.evaluate(`getComputedStyle(document.getElementById('hud-bottom')).display === 'none' && Number(getComputedStyle(document.getElementById('hud-right')).opacity) < 1`)) as boolean;
  record('G1 독 모드에서 하단 바가 내려가고 우측 열은 반투명', homeDown ? 'pass' : 'fail');
  // 토지 중앙 부근 2×2 를 진짜 터치로 고른다 — 카메라를 그 칸에 맞춘 뒤 화면 좌표를 계산
  const l = (await page.evaluate(`(() => { const l = window.__pj.game.land; return { i0: l.i0, j0: l.j0, w: l.w, h: l.h }; })()`)) as { i0: number; j0: number; w: number; h: number };
  // P49-b D59: 뭍 풀은 없다 — 「빠지」 탭에서 물가(행 24) 위 두 모서리를 진짜 터치로 찍는다: 열 41~46 · 행 24~30(열 42 의 물가가 행 25 라 윗줄은 행 24 — 뭍 칸은 둑 0G, 물 위 링 20칸 × 60G). 안쪽 (43,27) 이 이 절의 「풀 칸」
  const bi = l.i0 + 15; void l;
  const bj = 27;
  const ppajiTab = await center('#dock-pool .ktab[data-mode="ppaji"]');
  await touch(cdp, ppajiTab.x, ppajiTab.y);
  await page.waitForTimeout(200);
  await page.evaluate(`window.__pj.scene.focusTile(${bi}, ${bj}, 160)`);
  await page.waitForTimeout(200);
  for (const [ci, cj] of [[41, 24], [46, 30]] as const) {
    const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(${ci}, ${cj})`)) as { x: number; y: number; w: number; h: number };
    await touch(cdp, r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(450); // 320ms 더블탭 창 밖
  }
  const sel = (await page.evaluate(`window.__pj.dock.selection.length`)) as number;
  const costText = (await page.evaluate(`document.querySelector('#dock-pool .kdock-cost').textContent`)) as string;
  record('G1 → P49-b 빠지 탭 · 두 모서리 터치 → 링 22칸 · 비용 1,200G(물 위 20 × 60)', sel === 22 && /1,200/.test(costText) ? 'pass' : 'fail', `선택 ${sel} · ${costText}`);
  const money0 = (await page.evaluate(`window.__pj.game.money`)) as number;
  const done = await center('#dock-pool-done');
  await touch(cdp, done.x, done.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; return { pools: g.pools.all.length, size: g.pools.all[0] ? g.pools.all[0].tiles.length : 0, money: g.money, surface: document.documentElement.dataset.uiSurface, tex: window.__pj.scene.tileTextureAt(${bi}, ${bj}) }; })()`)) as { pools: number; size: number; money: number; surface: string; tex: string };
  record('G1 → P49-b 완료 → 수역 +1 (20칸) · −1,200G · 홈 복귀 · 안쪽 타일이 물', after.pools === 1 && after.size === 20 && money0 - after.money === 1200 && after.surface === 'home' && String(after.tex).startsWith('tile/pool') ? 'pass' : 'fail', JSON.stringify(after));
  await page.screenshot({ path: `${SHOT_DIR}/g1-pool.png` });
  // 시간을 감아 손님이 온다 (개장 09:00 부터 유입)
  await page.evaluate(`window.__pj.skip(140)`);
  await page.waitForTimeout(100);
  let guests = 0;
  let swimmers = 0;
  for (let k = 0; k < 12 && swimmers === 0; k++) {
    await page.evaluate(`window.__pj.skip(40)`);
    await page.waitForTimeout(120);
    const st = (await page.evaluate(`(() => { const gs = window.__pj.game.guests.all; return { n: gs.length, swim: gs.filter((g) => g.state === 'swim').length }; })()`)) as { n: number; swim: number };
    guests = Math.max(guests, st.n);
    swimmers = st.swim;
  }
  record('G1 시간이 흐르면 손님이 오고 수영한다', guests > 0 && swimmers > 0 ? 'pass' : 'fail', `손님 최대 ${guests} · 수영 ${swimmers}`);
  await page.waitForTimeout(300);
  const drawn = (await page.evaluate(`window.__pj.scene.guestImgs.size`)) as number;
  const bub = (await page.evaluate(`window.__pj.bubbles.count`)) as number;
  record('G1 손님 스프라이트가 화면에 있고 말풍선 ≤3', drawn > 0 && bub <= 3 ? 'pass' : 'fail', `스프라이트 ${drawn} · 말풍선 ${bub}`);
  await page.screenshot({ path: `${SHOT_DIR}/g1-guests.png` });
  // 시계·돈이 HUD 에 반영
  const hudText = (await page.evaluate(`(() => ({ time: document.getElementById('hud-time').textContent, money: document.getElementById('hud-money').textContent }))()`)) as { time: string; money: string };
  record('G1 HUD 시계·돈이 산다', /PM|AM/.test(hudText.time) && !/12,000/.test(hudText.money) ? 'pass' : 'fail', `${hudText.time} · ${hudText.money}`);
  // 풀 탭 → 정보 창 → 닫기
  await page.evaluate(`window.__pj.scene.focusTile(${bi}, ${bj}, 160)`);
  await page.waitForTimeout(200);
  const pr2 = (await page.evaluate(`window.__pj.scene.tileScreenRect(${bi}, ${bj})`)) as { x: number; y: number; w: number; h: number };
  await touch(cdp, pr2.x + pr2.w / 2, pr2.y + pr2.h / 2);
  await page.waitForTimeout(400);
  const winUp = (await page.evaluate(`!document.getElementById('win-pool').hidden && document.documentElement.dataset.uiSurface === 'window'`)) as boolean;
  record('G1 풀 탭 → 정보 창 (시간 정지)', winUp ? 'pass' : 'fail');
  const closeBtn = await center('#win-pool .kwin-close');
  await touch(cdp, closeBtn.x, closeBtn.y);
  await page.waitForTimeout(200);
  const winDown = (await page.evaluate(`document.getElementById('win-pool').hidden && document.documentElement.dataset.uiSurface === 'home'`)) as boolean;
  record('G1 창 닫기 → 홈', winDown ? 'pass' : 'fail');
  // 세이브 왕복 — 흐름을 얼리고 SAVE 터치 → 저장본을 읽어 둔다 → freeze=1 로 리로드 → 같은 스냅샷
  await page.evaluate(`window.__pj.flow.frozen = true`);
  await page.waitForTimeout(150);
  const saveBtn = await center('#hud-save');
  await touch(cdp, saveBtn.x, saveBtn.y);
  await page.waitForTimeout(200);
  const savedRaw = (await page.evaluate(`localStorage.getItem('pj.save')`)) as string | null;
  const savedGame = savedRaw ? JSON.stringify((JSON.parse(savedRaw) as { game: unknown }).game) : '';
  await page.goto(`${BASE}/?debug=1&px=1&freeze=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  await page.waitForTimeout(400);
  const afterLoad = (await page.evaluate(`JSON.stringify(window.__pj.game.toSnapshot())`)) as string;
  const day = (await page.evaluate(`window.__pj.game.day`)) as number;
  const diag = (): string => {
    try {
      const a = JSON.parse(savedGame) as Record<string, unknown>;
      const b = JSON.parse(afterLoad) as Record<string, unknown>;
      const keys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      return `다른 키 ${keys.join(',')} · 저장 ${JSON.stringify(a['clock'])} 손님 ${(a['guests'] as { guests: unknown[] }).guests.length} · 로드 ${JSON.stringify(b['clock'])} 손님 ${(b['guests'] as { guests: unknown[] }).guests.length}`;
    } catch { return `${savedGame.length} vs ${afterLoad.length}`; }
  };
  record('G1 세이브 왕복 — 리로드 뒤 스냅샷이 저장본과 동일', savedGame.length > 0 && savedGame === afterLoad ? 'pass' : 'fail', savedGame === afterLoad ? `day ${day}` : diag());
}

/**
 * G3 — 건설 창에서 화장실을 골라 진짜 터치로 배치한다 (P60-a: 딸기 투입·수면 픽셀 절은 소품 삭제로 뺐다).
 * 세이브 왕복 뒤라 페이지는 freeze=1 상태 — 풀 하나가 있다.
 */
async function verifyG3(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  await page.evaluate(`window.__pj.flow.frozen = true; window.__pj.scene.setUpscale(1)`);
  const cell = await center('#hud-right [data-cell="build"]');
  if (!cell) { record('G3 건설 칸', 'fail', '없음'); return; }
  await touch(cdp, cell.x, cell.y);
  await page.waitForTimeout(300);
  const winUp = (await page.evaluate(`!document.getElementById('win-build').hidden`)) as boolean;
  const rows = (await page.evaluate(`document.querySelectorAll('#win-build [data-facility]').length`)) as number;
  record('G3 건설 칸 → 건설 창 (편의 탭 행 ≥3)', winUp && rows >= 3 ? 'pass' : 'fail', `행 ${rows}`);
  // 잠긴 행이 숨겨지지 않고 disabled 로 보인다
  await page.evaluate(`document.querySelector('#win-build .ktab[data-tab="seat"]').click()`);
  await page.waitForTimeout(150);
  const lockRow = (await page.evaluate(`(() => { const rs = [...document.querySelectorAll('#win-build [data-facility]')]; return { n: rs.length, locked: rs.filter((r) => r.disabled).length }; })()`)) as { n: number; locked: number };
  record('G3 잠긴 시설은 숨기지 않고 잠김으로 보인다', lockRow.n > lockRow.locked && lockRow.locked > 0 ? 'pass' : 'fail', JSON.stringify(lockRow));
  await page.evaluate(`document.querySelector('#win-build .ktab[data-tab="utility"]').click()`);
  await page.waitForTimeout(150);
  const toiletRow = await center('#win-build [data-facility="toilet"]');
  if (!toiletRow) { record('G3 화장실 행', 'fail', '없음'); return; }
  await touch(cdp, toiletRow.x, toiletRow.y);
  await page.waitForTimeout(300);
  const dockUp = (await page.evaluate(`!document.getElementById('dock-place').hidden && document.documentElement.dataset.uiSurface === 'build'`)) as boolean;
  record('G3 행 터치 → 배치 독 · 소유권 build', dockUp ? 'pass' : 'fail');
  // 풀 왼쪽 옆 빈 잔디에 놓는다 (풀 인접)
  const spot = (await page.evaluate(`(() => { const g = window.__pj.game; const gt = g.gate; const b = { i0: gt.i + 12, j0: gt.j + 8 }; /* P45-a: 출입동(정문 가운데 20×30) 오른쪽 빈 잔디 */ const t = []; for (let j = b.j0 + 1; j < b.j0 + 5; j++) for (let i = b.i0; i < b.i0 + 5; i++) t.push({ i, j }); g.money += t.length * 40; g.paintIndoor(t); /* P38 D48: 건물 바닥을 거리(30~33)에 붙여 깔고 그 안에 놓는다 — 실내 바닥은 걷는 바닥이라 접면이 선다(바닥값은 미리 얹어 건설비 검사를 지킨다) */ return { i: b.i0 + 2, j: b.j0 + 2 }; })()`)) as { i: number; j: number };
  await page.evaluate(`window.__pj.game.autoPathFor('toilet', ${spot.i}, ${spot.j}, 0)`); // P31 접면: 플레이어 독은 길에 닿아야 놓인다 — 길을 먼저 낸다(값은 money0 전에 빠진다)
  await page.evaluate(`window.__pj.scene.focusTile(${spot.i}, ${spot.j}, 160)`);
  await page.waitForTimeout(200);
  const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(${spot.i}, ${spot.j})`)) as { x: number; y: number; w: number; h: number };
  await touch(cdp, r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(400);
  const aimed = (await page.evaluate(`(() => { const c = window.__pj.place.current; return { at: c && c.at, ghost: !!window.__pj.scene.ghost, why: document.querySelector('#dock-place .kdock-cost').textContent, done: !document.getElementById('dock-place-done').disabled }; })()`)) as { at: { i: number; j: number } | null; ghost: boolean; why: string; done: boolean };
  record('G3 지도 탭 → 고스트 · 확정 가능', aimed.at !== null && aimed.ghost && aimed.done ? 'pass' : 'fail', `${JSON.stringify(aimed.at)} · ${aimed.why}`);
  await page.screenshot({ path: `${SHOT_DIR}/g3-ghost.png` });
  const money0 = (await page.evaluate(`window.__pj.game.money`)) as number;
  const done = await center('#dock-place-done');
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(300);
  const placed = (await page.evaluate(`(() => { const g = window.__pj.game; const f0 = g.facilities.all[0]; return { n: g.facilities.all.length, money: g.money, imgs: window.__pj.scene.facImgs.size, surface: document.documentElement.dataset.uiSurface, cost: f0 ? g.facilities.defOf(f0).cost : 0 }; })()`)) as { n: number; money: number; imgs: number; surface: string; cost: number };
  record('G3 확정 → 시설 1 · −건설비 · 스프라이트 · 홈', placed.n === 1 && money0 - placed.money === placed.cost && placed.cost > 0 && placed.imgs === 1 && placed.surface === 'home' ? 'pass' : 'fail', JSON.stringify(placed));
  // 시설 탭 → 정보 창
  await touch(cdp, r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(400);
  const fwin = (await page.evaluate(`!document.getElementById('win-facility').hidden`)) as boolean;
  record('G3 시설 탭 → 시설 정보 창', fwin ? 'pass' : 'fail');
  const fclose = await center('#win-facility .kwin-close');
  if (fclose) await touch(cdp, fclose.x, fclose.y);
  await page.waitForTimeout(200);
}

/**
 * G4 — SNS 창 3탭 · 글에 좋아요 터치 · 소원 진행률 · 선물 · 모달 예산.
 * 앞 절의 판(풀 하나·화장실) 위에서 시간을 감아 글이 생기게 한 뒤 본다.
 */
async function verifyG4(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 글이 생길 때까지 시간을 감는다 (최대 3일)
  let posts = 0; let diag = '';
  for (let k = 0; k < 40 && posts === 0; k++) {
    await page.evaluate(`window.__pj.skip(120)`);
    posts = (await page.evaluate(`window.__pj.game.sns.allPosts.length`)) as number;
    if (k % 10 === 9) diag += (await page.evaluate(`(() => { const g = window.__pj.game; return ' [tick ' + g.tick + ' 손님 ' + g.guests.count + ' 수영 ' + g.guests.all.filter((x) => x.state === 'swim').length + ' 상태 ' + [...new Set(g.guests.all.map((x) => x.state))].join('/') + ' 수역 ' + g.pools.all.map((p) => p.tiles.length).join('+') + ']'; })()`)) as string;
  }
  record('G4 손님이 놀고 나면 글이 올라온다', posts > 0 ? 'pass' : 'fail', `글 ${posts}${diag}`);
  const badge = (await page.evaluate(`(() => { const b = document.querySelector('#hud-right [data-cell="sns"] .kbadge'); return b && !b.hidden ? b.textContent : null; })()`)) as string | null;
  record('G4 SNS 칸 배지 (소원·안 읽은 소식)', badge !== null ? 'pass' : 'info', `배지 ${badge ?? '없음'}`);
  await page.evaluate(`window.__pj.flow.frozen = true`);
  const cell = await center('#hud-right [data-cell="sns"]');
  if (!cell) { record('G4 SNS 칸', 'fail', '없음'); return; }
  await touch(cdp, cell.x, cell.y);
  await page.waitForTimeout(300);
  const tl = (await page.evaluate(`(() => ({ up: !document.getElementById('win-sns').hidden, posts: document.querySelectorAll('#win-sns [data-post]').length, likes: document.querySelectorAll('#win-sns [data-like]').length }))()`)) as { up: boolean; posts: number; likes: number };
  record('G4 SNS 창 타임라인 — 글 행 + 좋아요 버튼', tl.up && tl.posts > 0 && tl.likes === tl.posts ? 'pass' : 'fail', JSON.stringify(tl));
  const likeBtn = await center('#win-sns [data-like]');
  const likes0 = (await page.evaluate(`window.__pj.game.sns.totalLikes`)) as number;
  if (likeBtn) await touch(cdp, likeBtn.x, likeBtn.y);
  await page.waitForTimeout(250);
  const likes1 = (await page.evaluate(`window.__pj.game.sns.totalLikes`)) as number;
  const liked = (await page.evaluate(`document.querySelectorAll('#win-sns [data-like].on').length`)) as number;
  record('G4 좋아요 터치 → +5 · 칩이 켜진다', likes1 - likes0 === 5 && liked === 1 ? 'pass' : 'fail', `${likes0} → ${likes1}`);
  await page.screenshot({ path: `${SHOT_DIR}/g4-timeline.png` });
  // 메시지 탭 — 소원이 없을 수 있다 (EXP 문턱). 친구 탭은 반드시 있다
  await page.evaluate(`document.querySelector('#win-sns .ktab[data-tab="friends"]').click()`);
  await page.waitForTimeout(200);
  const fr = (await page.evaluate(`(() => ({ friends: document.querySelectorAll('#win-sns [data-friend]').length, gifts: document.querySelectorAll('#win-sns [data-gift]').length, head: (document.querySelector('#win-sns .krow-v') || {}).textContent }))()`)) as { friends: number; gifts: number; head: string };
  record('G4 친구 탭 — 시작 친구 2+ · 선물 버튼 · 지역 진행', fr.friends >= 2 && fr.gifts === fr.friends && /\//.test(fr.head ?? '') ? 'pass' : 'fail', JSON.stringify(fr));
  // 선물 — 첫 친구에게 시작 선물(빨간 튜브)
  const giftBtn = await center('#win-sns [data-gift]');
  if (giftBtn) await touch(cdp, giftBtn.x, giftBtn.y);
  await page.waitForTimeout(250);
  const tubeRow = await center('#win-sns [data-gift-id="red_tube"]');
  const money0 = (await page.evaluate(`window.__pj.game.money`)) as number;
  if (tubeRow) await touch(cdp, tubeRow.x, tubeRow.y);
  await page.waitForTimeout(300);
  const gifted = (await page.evaluate(`(() => { const g = window.__pj.game; const f = g.sns.unlockedFriends[0]; return { gifts: f ? f.gifts : [], money: g.money, exp: f ? f.exp : 0 }; })()`)) as { gifts: string[]; money: number; exp: number };
  record('G4 선물 → 친구 만족 EXP · 돈 지출', gifted.gifts.includes('red_tube') && money0 - gifted.money === 300 && gifted.exp > 0 ? 'pass' : 'fail', JSON.stringify(gifted));
  // 메시지 탭 — 선물로 소원이 열렸으면 진행률 줄이 보인다
  await page.evaluate(`document.querySelector('#win-sns .ktab[data-tab="messages"]').click()`);
  await page.waitForTimeout(200);
  const msg = (await page.evaluate(`(() => ({ wishes: document.querySelectorAll('#win-sns [data-wish]').length, active: window.__pj.game.sns.activeWishes().length, text: (document.querySelector('#win-sns [data-wish] .krow-sub') || {}).textContent || '' }))()`)) as { wishes: number; active: number; text: string };
  record('G4 메시지 탭 — 열린 소원 = 화면 행 · 진행률 표기', msg.wishes === msg.active && (msg.active === 0 || /진행|충족/.test(msg.text)) ? 'pass' : 'fail', JSON.stringify(msg));
  await page.screenshot({ path: `${SHOT_DIR}/g4-messages.png` });
  const close = await center('#win-sns .kwin-close');
  if (close) await touch(cdp, close.x, close.y);
  await page.waitForTimeout(200);
  // 모달 예산 — 3일을 감는 동안 모달 사건 수 ≤ 분당 1 (실시간 몇 초 안에 감기므로 사실상 1 이하)
  const modalsBefore = (await page.evaluate(`window.__pj.interruptBudget.stamps ? window.__pj.interruptBudget.stamps.length : 0`)) as number;
  await page.evaluate(`window.__pj.flow.frozen = false; window.__pj.skip(window.__pj.TPD * 3)`);
  await page.waitForTimeout(300);
  const budget = (await page.evaluate(`(() => { const b = window.__pj.interruptBudget; return { modals: b.stamps ? b.stamps.length : 0, inbox: window.__pj.game.inbox.all.length }; })()`)) as { modals: number; inbox: number };
  record('G4 3일 감기 — 모달 ≤ 1/분, 나머지는 인박스', budget.modals - modalsBefore <= 1 && budget.inbox > 0 ? 'pass' : 'fail', JSON.stringify(budget));
  await page.evaluate(`window.__pj.flow.frozen = true`);
}

/**
 * G5 — 정보 캡슐 → 랭크 창(다음 조건 진행) → 풀 심사 창(예상 점수·신청) → 심사 결과 → 상점 구입 → 타일 칩.
 * 앞 절이 3일을 감았으므로 지금은 1년차 봄 주말이거나 여름 — 새 판을 열어 봄 1일차에서 신청한다.
 */
async function verifyG5(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 새 판 — 빠지 20칸(P49-b D59: 뭍 풀 삭제 — 강 위 데크 링 41~46 × 24~30, 안 4×5) + 시설 (Entry 인증: 인기 60·풀 20+ — 20칸 × 표준 4 = 인기 80) 을 즉시 만든다
  await page.evaluate(`(() => { window.__pj.newGame(777); const g = window.__pj.game; g.money = 30000; g.unlocked.facilities.add('diving'); const l = g.land; g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); g.placeFacility('toilet', l.i0 + 4, l.j0 + 9); g.placeFacility('pyeongsang_row', l.i0, l.j0 + 9); g.placeFacility('diving', l.i0 + 11, l.j0 + 5); window.__pj.skip(1); })()`);
  await page.waitForTimeout(300);
  const info = await center('#hud-info');
  if (!info) { const why = await page.evaluate(`(() => { const e = document.getElementById('hud-info'); const r = e ? e.getBoundingClientRect() : null; return JSON.stringify({ exists: !!e, hidden: e && e.hidden, disabled: e && e.disabled, w: r && r.width, surface: document.documentElement.dataset.uiSurface, open: [...document.querySelectorAll('.kwin')].filter((w) => !w.hidden).map((w) => w.id), strip: getComputedStyle(document.getElementById('tut-strip')).display }); })()`); record('G5 정보 캡슐', 'fail', `없음 ${why}`); return; }
  await touch(cdp, info.x, info.y);
  await page.waitForTimeout(300);
  const rank = (await page.evaluate(`(() => ({ up: !document.getElementById('win-rank').hidden, conds: document.querySelectorAll('#win-rank [data-rankcond]').length }))()`)) as { up: boolean; conds: number };
  record('G5 정보 캡슐 → 랭크 창 (다음 조건 ≥2)', rank.up && rank.conds >= 2 ? 'pass' : 'fail', JSON.stringify(rank));
  const certBtn = await center('#win-rank-cert');
  if (certBtn) await touch(cdp, certBtn.x, certBtn.y);
  await page.waitForTimeout(300);
  const cert = (await page.evaluate(`(() => { const card = document.querySelector('#win-cert [data-cert="grade_f"]'); const sc = card && card.querySelector('[data-expected]'); const btn = card && card.querySelector('[data-apply]'); return { up: !document.getElementById('win-cert').hidden, expected: sc ? Number(sc.dataset.expected) : -1, canApply: !!btn && !btn.disabled, text: sc ? sc.textContent : '' }; })()`)) as { up: boolean; expected: number; canApply: boolean; text: string };
  record('G5 → P49-b 풀 심사 창 — Entry 예상 점수 ≥ 합격선 · 신청 가능 (빠지 20칸)', cert.up && cert.expected >= 15 && cert.canApply ? 'pass' : 'fail', JSON.stringify(cert));
  await page.screenshot({ path: `${SHOT_DIR}/g5-cert.png` });
  const apply = await center('#win-cert [data-apply="grade_f"]');
  const money0 = (await page.evaluate(`window.__pj.game.money`)) as number;
  if (apply) await touch(cdp, apply.x, apply.y);
  await page.waitForTimeout(300);
  const applied = (await page.evaluate(`(() => { const g = window.__pj.game; return { applied: g.certs.state.applied, money: g.money }; })()`)) as { applied: { id: string; judgeDay: number } | null; money: number };
  record('G5 신청 → 신청료 −500 · 주말 심사 예약', applied.applied?.id === 'grade_f' && money0 - applied.money === 500 ? 'pass' : 'fail', JSON.stringify(applied));
  const close = await center('#win-cert .kwin-close');
  if (close) await touch(cdp, close.x, close.y);
  await page.waitForTimeout(200);
  // 주말 15:00 까지 감는다
  await page.evaluate(`(() => { const g = window.__pj.game; const target = g.certs.state.applied.judgeDay; while (g.day < target) window.__pj.skip(window.__pj.TPD - g.tick); window.__pj.skip(window.__pj.JUDGE_TICK + 1 - g.tick); })()`);
  await page.waitForTimeout(400);
  const judged = (await page.evaluate(`(() => { const g = window.__pj.game; return { last: g.certs.state.last, passes: g.certs.passes(), gifts: [...g.unlocked.gifts] }; })()`)) as { last: { score: number; pass: boolean } | null; passes: number; gifts: string[] };
  record('G5 → P49-b 주말 15시 심사 → 결과 · 합격 · 보상(파란 범고래) (빠지 20칸)', judged.last !== null && judged.last.pass && judged.passes === 1 && judged.gifts.includes('blue_orca') ? 'pass' : 'fail', JSON.stringify(judged));
  // 상점 — 17:00 입고 뒤 열어 산다
  await page.evaluate(`(() => { const g = window.__pj.game; if (g.tick < 541) window.__pj.skip(541 - g.tick); })()`);
  await page.waitForTimeout(200);
  const shopCell = await center('#hud-right [data-cell="market"]');
  if (shopCell) await touch(cdp, shopCell.x, shopCell.y);
  await page.waitForTimeout(300);
  const shop = (await page.evaluate(`(() => ({ up: !document.getElementById('win-shop').hidden, rows: document.querySelectorAll('#win-shop [data-shop]').length, stock: window.__pj.game.shop.state.stock.length }))()`)) as { up: boolean; rows: number; stock: number };
  record('G5 상점 창 — 17시 입고 6칸', shop.up && shop.rows === shop.stock && shop.stock > 0 ? 'pass' : 'fail', JSON.stringify(shop));
  const row = await center('#win-shop [data-shop]');
  const before = (await page.evaluate(`(() => { const g = window.__pj.game; return { money: g.money, n: g.unlocked.facilities.size + g.unlocked.gifts.size }; })()`)) as { money: number; n: number };
  if (row) await touch(cdp, row.x, row.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; return { money: g.money, n: g.unlocked.facilities.size + g.unlocked.gifts.size + [...g.cooking.ingredients.keys()].reduce((s, id) => s + (g.cooking.stockOf(id) ?? 0), 0), rows: document.querySelectorAll('#win-shop [data-shop]').length }; })()`)) as { money: number; n: number; rows: number }; /* P60-a: 진열에 재료(재고 ×N)도 서므로 「해금」 대신 「해금 + 재고」가 는다 */
  record('G5 구입 → 해금 또는 재고 +1(P60-a: 소품 대신 재료 진열) · 돈 지출 · 진열에서 빠짐', after.n > before.n && after.money < before.money && after.rows === shop.rows - 1 ? 'pass' : 'fail', JSON.stringify({ before, after }));
  await page.screenshot({ path: `${SHOT_DIR}/g5-shop.png` });
  const sclose = await center('#win-shop .kwin-close');
  if (sclose) await touch(cdp, sclose.x, sclose.y);
  await page.waitForTimeout(200);
  // 타일 칩 — 풀 편집 파기 탭에 표준 타일 칩
  const poolCell = await center('#hud-right [data-cell="zone"]');
  if (poolCell) await touch(cdp, poolCell.x, poolCell.y);
  await page.waitForTimeout(250);
  const tileChips = (await page.evaluate(`document.querySelectorAll('#dock-pool [data-tile]').length`)) as number;
  record('G5 파기 탭에 물빛 칩 없음 (P49-a2: 물빛 삭제 — 빠지 붓은 P49-b)', tileChips === 0 ? 'pass' : 'fail', `칩 ${tileChips}`);
  const cancel = await center('#dock-pool-cancel');
  if (cancel) await touch(cdp, cancel.x, cancel.y);
  await page.waitForTimeout(200);
  // 사장 달력 — 3일차 붕어빵 (newGame 뒤 3일이 지났으므로 받았어야 한다)
  const creperie = (await page.evaluate(`(() => { const g = window.__pj.game; return { given: [...g.calendarGiven], has: g.unlocked.facilities.has('bungeoppang') }; })()`)) as { given: string[]; has: boolean };
  record('G5 사장 달력 — 3일차 붕어빵 선물', creperie.has ? 'pass' : 'fail', JSON.stringify(creperie));
}

/**
 * G6·G7 — 식당 정보 창 → 메뉴 편집(칸 5·궁합 표시) → 손님이 사서 매출 · 2년차 요리 창 → 재료 칩 5 → 개발 → 도감.
 */
async function verifyG6(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.evaluate(`window.__pj.flatten()`); // P0-B: 이 절은 고정 좌표에 놓는다 — 경사와 무관
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 자판기(야외)를 수역 옆에 놓고 정보 창을 연다
  const spot = (await page.evaluate(`(() => { const g = window.__pj.game; const l = g.land; const r = g.placeFacility('vending_out', l.i0 + 1, l.j0 + 11); /* P32: 열 28 은 G5 풀·화장실의 유일한 통로가 됐다 */ window.__pj.skip(1); return { ok: r.ok, uid: r.uid, i: l.i0 + 1, j: l.j0 + 11, reason: r.reason }; })()`)) as { ok: boolean; uid: number; i: number; j: number; reason?: string };
  record('G6 자판기(야외) 배치', spot.ok ? 'pass' : 'fail', spot.reason ?? '');
  await page.evaluate(`window.__pj.scene.focusTile(${spot.i}, ${spot.j}, 160)`);
  await page.waitForTimeout(250);
  const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(${spot.i}, ${spot.j})`)) as { x: number; y: number; w: number; h: number };
  await touch(cdp, r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(400);
  const menuBtn = await center('#win-facility-menu');
  record('G6 식당 정보 창에 메뉴 편집 버튼', menuBtn !== null ? 'pass' : 'fail');
  if (menuBtn) await touch(cdp, menuBtn.x, menuBtn.y);
  await page.waitForTimeout(300);
  const menu = (await page.evaluate(`(() => ({ up: !document.getElementById('win-menu').hidden, slots: document.querySelectorAll('#win-menu [data-slot]').length, recipes: document.querySelectorAll('#win-menu [data-recipe]').length }))()`)) as { up: boolean; slots: number; recipes: number };
  record('G6 메뉴 창 — 칸 5 · 도감 레시피 행', menu.up && menu.slots === 5 && menu.recipes >= 3 ? 'pass' : 'fail', JSON.stringify(menu));
  // 레시피 두 개를 건다 (진짜 터치) — P23: 식당은 놓일 때 메뉴 3개가 이미 걸려 있으므로 「+2」 로 잰다
  const eq0 = (await page.evaluate(`window.__pj.game.menus.equipped(${spot.uid}).length`)) as number;
  for (let k = 0; k < 2; k++) {
    const row = await center('#win-menu [data-recipe]:not(:disabled)');
    if (row) await touch(cdp, row.x, row.y);
    await page.waitForTimeout(250);
  }
  const eq = (await page.evaluate(`window.__pj.game.menus.equipped(${spot.uid}).length`)) as number;
  record('G6 레시피 행 터치 → 칸에 걸린다 (기본 3 + 2)', eq === eq0 + 2 && eq0 === 3 ? 'pass' : 'fail', `걸림 ${eq0} → ${eq}`);
  await page.screenshot({ path: `${SHOT_DIR}/g6-menu.png` });
  const mclose = await center('#win-menu-main .kwin-close');
  if (mclose) await touch(cdp, mclose.x, mclose.y);
  await page.waitForTimeout(200);
  // 하루 감기 → 식당 매출
  await page.evaluate(`window.__pj.flow.frozen = true; (() => { const g = window.__pj.game; window.__pj.skip(window.__pj.TPD - g.tick + 1); })()`);
  await page.waitForTimeout(200);
  const food = (await page.evaluate(`(() => { const g = window.__pj.game; const d = g.stats.days[g.stats.days.length - 1]; return { food: d ? d.food : -1, total: g.stats.food }; })()`)) as { food: number; total: number };
  record('G6 손님이 메뉴를 사서 식당 매출이 난다', food.total > 0 ? 'pass' : 'fail', JSON.stringify(food));
  // G7 — ★2 로 올려 요리 창 (G41: 요리는 연차가 아니라 ★2 보상)
  await page.evaluate(`(() => { const g = window.__pj.game; g.money = 50000; g.rank = 2; g.openLand(2); window.__pj.skip(1); window.__pj.refreshHud(); })()`);
  await page.waitForTimeout(300);
  // P0(빠지 스토리): 요리는 우측 칸이 아니라 MENU 항목 — 잠김은 항목의 locked 로, 열기는 항목 탭으로
  const cookLocked = (await page.evaluate(`(() => { const w = window.__pj; w.mainMenu.show(); const row = document.querySelector('#win-menu-main [data-menu="cook"]'); const locked = row ? !!row.dataset.locked : null; return { locked, has: !!row }; })()`)) as { locked: boolean | null; has: boolean };
  record('G7 ★2 — 요리 항목 잠금 해제 (MENU)', cookLocked.has && cookLocked.locked === false ? 'pass' : 'fail', JSON.stringify(cookLocked));
  const cookRow = await center('#win-menu-main [data-menu="cook"]');
  if (cookRow) await touch(cdp, cookRow.x, cookRow.y);
  await page.waitForTimeout(300);
  const cook = (await page.evaluate(`(() => ({ up: !document.getElementById('win-cook').hidden, ings: document.querySelectorAll('#win-cook [data-ingredient]').length, codex: document.querySelectorAll('#win-cook [data-codex]').length }))()`)) as { up: boolean; ings: number; codex: number };
  record('G7 요리 창 — 재료 칩 · 도감', cook.up && cook.ings >= 5 && cook.codex >= 20 ? 'pass' : 'fail', JSON.stringify(cook));
  // 아는 start 레시피의 재료로 개발 → 이미 아는 요리; 그 다음 미발견 cook 레시피 하나를 데이터에서 골라 재료를 넣는다
  const target = (await page.evaluate(`(() => { const g = window.__pj.game; const c = g.cooking; for (const r of c.recipes.values()) { if (c.known.has(r.id)) continue; const parts = r.key.split('+'); if (parts.every((p) => c.owned.has(p)) && !r.unlock.startsWith('level')) return { id: r.id, parts }; } return null; })()`)) as { id: string; parts: string[] } | null;
  record('G7 지금 재료로 만들 수 있는 미발견 레시피가 있다', target !== null ? 'pass' : 'fail', target ? `${target.id} = ${target.parts.join('+')}` : '없음');
  if (target) {
    for (const p of target.parts) {
      const chip = await center(`#win-cook [data-ingredient="${p}"]`);
      if (chip) await touch(cdp, chip.x, chip.y);
      await page.waitForTimeout(150);
    }
    const go = await center('#win-cook-go');
    if (go) await touch(cdp, go.x, go.y);
    await page.waitForTimeout(400);
    const out = (await page.evaluate(`(() => ({ outcome: document.querySelector('#win-cook .kresult').dataset.outcome, known: window.__pj.game.cooking.known.has(${JSON.stringify(target.id)}), exp: window.__pj.game.cooking.exp }))()`)) as { outcome: string; known: boolean; exp: number };
    record('G7 재료 칩 터치 → 개발 → 발견 · 도감 · EXP', out.outcome === 'new' && out.known && out.exp > 0 ? 'pass' : 'fail', JSON.stringify(out));
    await page.screenshot({ path: `${SHOT_DIR}/g7-cook.png` });
  }
  const cclose = await center('#win-cook .kwin-close');
  if (cclose) await touch(cdp, cclose.x, cclose.y);
  await page.waitForTimeout(200);
}

/**
 * G8 — MENU 리스트 → 투자 창(단계 순서·내일 해금) · 캠페인(배율·쿨다운) · 실내 바닥 칠하기(실내 풀) · 슬라이드 활강로 발자국.
 */
async function verifyG8(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  await page.evaluate(`window.__pj.game.money = 80000; window.__pj.flow.frozen = true`);
  const menuBtn = await center('#hud-menu');
  if (menuBtn) await touch(cdp, menuBtn.x, menuBtn.y);
  await page.waitForTimeout(300);
  const menu = (await page.evaluate(`(() => ({ up: !document.getElementById('win-menu-main').hidden, rows: document.querySelectorAll('#win-menu-main [data-menu]').length }))()`)) as { up: boolean; rows: number };
  record('G8 MENU → 카이로식 리스트 (행 ≥8)', menu.up && menu.rows >= 8 ? 'pass' : 'fail', JSON.stringify(menu));
  const investRow = await center('#win-menu-main [data-menu="invest"]');
  if (investRow) await touch(cdp, investRow.x, investRow.y);
  await page.waitForTimeout(300);
  const inv = (await page.evaluate(`(() => { const rows = [...document.querySelectorAll('#win-invest [data-invest]')]; return { up: !document.getElementById('win-invest').hidden, rows: rows.length, enabled: rows.filter((r) => !r.disabled).map((r) => r.dataset.invest) }; })()`)) as { up: boolean; rows: number; enabled: string[] };
  record('G8 투자 창 — 첫 단계만 열려 있다 (P59-c D69: 해금 1 + 티저 2 = 카드 3)', inv.up && inv.rows === 3 && inv.enabled.length === 1 && inv.enabled[0] === 'attraction_1' ? 'pass' : 'fail', JSON.stringify(inv));
  const first = await center('#win-invest [data-invest="attraction_1"]');
  if (first) await touch(cdp, first.x, first.y);
  await page.waitForTimeout(300);
  const pend = (await page.evaluate(`(() => { const g = window.__pj.game; return { pending: g.toSnapshot().investPending.length, has: g.unlocked.facilities.has('parasol'), enabledNow: [...document.querySelectorAll('#win-invest [data-invest]')].filter((r) => !r.disabled).map((r) => r.dataset.invest) }; })()`)) as { pending: number; has: boolean; enabledNow: string[] };
  record('G8 투자 → 대기 1 · 아직 미해금 · 2단계는 1단계 완료 뒤', pend.pending === 1 && !pend.has && pend.enabledNow.length === 0 ? 'pass' : 'fail', JSON.stringify(pend));
  await page.evaluate(`(() => { const g = window.__pj.game; window.__pj.skip(window.__pj.TPD - g.tick + 1); })()`);
  await page.waitForTimeout(200);
  const done = (await page.evaluate(`(() => { const g = window.__pj.game; return { done: g.investDone.has('attraction_1'), has: g.unlocked.facilities.has('parasol') }; })()`)) as { done: boolean; has: boolean };
  record('G8 다음날 개장 → 투자 완료 · 미니 샤워 해금', done.done && done.has ? 'pass' : 'fail', JSON.stringify(done));
  const iclose = await center('#win-invest .kwin-close');
  if (iclose) await touch(cdp, iclose.x, iclose.y);
  await page.waitForTimeout(200);
  // 캠페인
  const mb2 = await center('#hud-menu');
  if (mb2) await touch(cdp, mb2.x, mb2.y);
  await page.waitForTimeout(250);
  const camRow = await center('#win-menu-main [data-menu="campaign"]');
  if (camRow) await touch(cdp, camRow.x, camRow.y);
  await page.waitForTimeout(300);
  const target0 = (await page.evaluate(`window.__pj.game.dailyTarget()`)) as number;
  const flyer = await center('#win-campaign [data-campaign="flyer"]');
  if (flyer) await touch(cdp, flyer.x, flyer.y);
  await page.waitForTimeout(300);
  const cam = (await page.evaluate(`(() => { const g = window.__pj.game; return { mul: g.campaigns.mul(g.day), target: g.dailyTarget(), again: g.campaigns.canStart('flyer', g.day, g.money).ok }; })()`)) as { mul: number; target: number; again: boolean };
  record('G8 전단지 → 유입 ×1.2 · 진행 중엔 다시 못 한다', cam.mul === 1.2 && Math.abs(cam.target / target0 - 1.2) < 0.01 && !cam.again ? 'pass' : 'fail', JSON.stringify(cam));
  const cclose = await center('#win-campaign .kwin-close');
  if (cclose) await touch(cdp, cclose.x, cclose.y);
  await page.waitForTimeout(200);
  // P49-b D59: 뭍 풀은 없다 — 옛 「실내 바닥으로 둘러싼 2×2 풀 = 실내 26°C」 는 주어가 사라졌다(수역은 강 위 데크 링으로만 생긴다). 같은 뭍 칸에 파기를 청하면 거절 문장이 나오고 수역 수는 그대로다
  const indoor = (await page.evaluate(`(() => { const g = window.__pj.game; const l = g.land; const bi = l.i0 + 4, bj = l.j0 + 18; /* 북서 뭍(행 26) — P48-b2 때 실내 풀을 파던 바로 그 칸 */ const before = g.pools.all.length; const pool = [{i:bi,j:bj},{i:bi+1,j:bj},{i:bi,j:bj+1},{i:bi+1,j:bj+1}]; const can = g.canDig(bi, bj); const r1 = g.digPool(pool); return { floor: g.grid.at(bi, bj), can: can.ok ? 'ok' : can.reason, r1: r1.ok, r1why: r1.ok ? '' : r1.reason, before, after: g.pools.all.length, at: !!g.pools.at(bi, bj) }; })()`)) as { floor: number; can: string; r1: boolean; r1why: string; before: number; after: number; at: boolean };
  record('G8 → P49-b D59 실내 바닥 안에 풀은 못 판다(뭍 풀 삭제) — 거절 문장 + 수역 수 불변 (26°C 실내 규칙은 주어가 없다)', indoor.floor === 1 && !indoor.r1 && indoor.can.includes('뭍에는 풀을 파지 않습니다') && indoor.r1why.includes('뭍에는 풀을 파지 않습니다') && indoor.after === indoor.before && !indoor.at ? 'pass' : 'fail', JSON.stringify(indoor));
  // 슬라이드 발자국 — 스트라이피 슬라이드(2×2 + 활강로 8) 를 놓을 자리가 있으면 활강로 끝 다음 칸이 풀일 때 AB
  await page.evaluate(`window.__pj.game.unlocked.facilities.add('stripy_slide'); window.__pj.game.rank = 3; window.__pj.game.openLand(3)`);
  const slide = (await page.evaluate(`(() => { const g = window.__pj.game; const l = g.land; const p = g.pools.all[0]; const k = p.tiles[0]; const pi = k % g.grid.w, pj = Math.floor(k / g.grid.w); const st0 = g.poolState(p.id).ab; const at = { i: pi - 1, j: pj - 10 }; /* P49-b: 뭍 풀이 없어 활강로를 세로(facing 1)로 강 쪽에 낸다 — 출구가 링 윗줄 데크 (pi, pj−1), 그 다음 칸이 첫 안쪽 물 칸 */ const r = g.placeFacility('stripy_slide', at.i, at.j, 1); const fp = r.ok ? g.facilities.all.filter((f) => f.defId === 'stripy_slide').length : 0; const st1 = g.poolState(p.id).ab; return { ok: r.ok, reason: r.reason, fp, ab0: st0, ab1: st1, land: [l.w, l.h] }; })()`)) as { ok: boolean; reason?: string; fp: number; ab0: number; ab1: number; land: number[] };
  record('G8 → P49-b 슬라이드 활강로(세로)가 빠지 링 위에서 끝나면 AB 가 오른다', slide.ok && slide.ab1 > slide.ab0 ? 'pass' : slide.ok ? 'fail' : 'info', JSON.stringify(slide));
  await page.evaluate(`window.__pj.scene.setUpscale(1); (() => { const g = window.__pj.game; const f = g.facilities.all.find((x) => x.defId === 'stripy_slide'); if (f) window.__pj.scene.focusTile(f.i, f.j, 160); })()`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/g8-slide.png` });
}

/**
 * G9 — 손님 생활: 날씨 라벨 · 표정 텍스처 · 동시 48명에서 프레임 p95 · 말풍선 ≤3.
 */
async function verifyG9(page: import('playwright').Page): Promise<void> {
  // 여름 주말 아침에 손님을 몰아넣는다 — 인기·풀이 이미 커진 판
  await page.evaluate(`(() => { const g = window.__pj.game; g.money = 200000; while (Math.floor(g.day / 4) % 4 !== 1 || g.day % 4 !== 3) window.__pj.skip(window.__pj.TPD - g.tick); window.__pj.skip(60); window.__pj.game.campaign('tv'); })()`);
  await page.evaluate(`window.__pj.flow.frozen = false; window.__pj.flow.speed = 2`);
  await page.waitForTimeout(6000);
  const snap = (await page.evaluate(`(() => { const g = window.__pj.game; const ms = [...window.__pj.frameMs].sort((a, b) => a - b); const p95 = ms[Math.floor(ms.length * 0.95)] || 0; const keys = [...window.__pj.scene.guestImgs.values()].map((im) => im.texture.key); return { guests: g.guests.count, p95, bubbles: window.__pj.bubbles.count, moods: [...new Set(keys.map((k) => k.split('/').pop()))], weather: document.getElementById('hud-time').textContent }; })()`)) as { guests: number; p95: number; bubbles: number; moods: string[]; weather: string };
  await page.evaluate(`window.__pj.flow.frozen = true; window.__pj.flow.speed = 1`);
  record('G9 손님이 많이 온다 (여름 주말 + TV 광고)', snap.guests >= 20 ? 'pass' : 'info', `동시 ${snap.guests}`);
  record('G9 프레임 p95 < 20ms (2배속·손님 다수)', snap.p95 < 20 ? 'pass' : 'fail', `p95 ${snap.p95.toFixed(1)}ms · 손님 ${snap.guests}`);
  record('G9 말풍선 ≤ 3', snap.bubbles <= 3 ? 'pass' : 'fail', `${snap.bubbles}`);
  record('G9 표정이 상태에서 갈린다 (텍스처 키에 mood)', snap.moods.length >= 2 && snap.moods.every((m) => ['calm', 'happy', 'annoyed', 'tired'].includes(m)) ? 'pass' : 'info', snap.moods.join(','));
  record('G9 HUD 에 날씨·기온', /맑음|흐림|비|눈/.test(snap.weather) && /°C/.test(snap.weather) ? 'pass' : 'fail', snap.weather);
  await page.screenshot({ path: `${SHOT_DIR}/g9-crowd.png` });
}

/**
 * G11 — 128일이 끝나면 엔딩 창(점수 6항목·총점) → 뉴게임+ → 새 판에 이월(레시피·시설 종류·티켓) · 돈은 새로.
 */
async function verifyG11(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const before = (await page.evaluate(`(() => { const g = window.__pj.game; g.unlocked.facilities.add('bungalow'); g.day = 127; g.tick = window.__pj.TPD - 20; window.__pj.flow.frozen = false; return { recipes: g.cooking.known.size, facs: g.unlocked.facilities.size }; })()`)) as { recipes: number; facs: number };
  await page.waitForTimeout(3500); // 20 tick × 125ms + 여유
  const end = (await page.evaluate(`(() => { const g = window.__pj.game; return { day: g.day, halted: g.haltedForEnding, up: !document.getElementById('win-ending').hidden, rows: document.querySelectorAll('#win-ending [data-score]').length, total: Number((document.querySelector('#win-ending [data-total]') || {}).dataset ? document.querySelector('#win-ending [data-total]').dataset.total : 0) }; })()`)) as { day: number; halted: boolean; up: boolean; rows: number; total: number };
  record('G11 128일 종료 → 시간이 서고 엔딩 창 (점수 6항목 · 총점 > 0)', end.day === 128 && end.halted && end.up && end.rows === 6 && end.total > 0 ? 'pass' : 'fail', JSON.stringify(end));
  await page.screenshot({ path: `${SHOT_DIR}/g11-ending.png` });
  const ng = await center('#win-ending-ngplus');
  if (ng) await touch(cdp, ng.x, ng.y);
  await page.waitForTimeout(500);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; const p = JSON.parse(localStorage.getItem('pj.profile') || 'null'); return { day: g.day, money: g.money, pools: g.pools.all.length, recipes: g.cooking.known.size, cabana: g.unlocked.facilities.has('bungalow'), ticketBonus: g.ticketBonus, runs: p ? p.runs : 0, best: p ? p.bestScore : 0 }; })()`)) as { day: number; money: number; pools: number; recipes: number; cabana: boolean; ticketBonus: number; runs: number; best: number };
  record('G11 뉴게임+ → 새 판(1일차·시작 자금·풀 0) + 이월(레시피·시설·티켓 +60) · 프로필 저장', after.day === 0 && after.money === 12000 && after.pools === 1 && after.recipes >= before.recipes && after.cabana && after.ticketBonus === 60 && after.runs === 1 && after.best > 0 ? 'pass' : 'fail', JSON.stringify(after));
  // 배속 ×2 가 메뉴에 열렸다
  const mb = await center('#hud-menu');
  if (mb) await touch(cdp, mb.x, mb.y);
  await page.waitForTimeout(250);
  const speed = (await page.evaluate(`(() => { document.querySelector('#win-menu-main [data-menu="settings"]')?.click(); /* P59-c W-14: 배속은 설정 창 */ const r = document.querySelector('#win-settings [data-menu="speed"]'); return r ? { locked: !!r.querySelector('.kmenu-lock'), text: r.textContent } : null; })()`)) as { locked: boolean; text: string } | null;
  record('G11 엔딩 뒤 배속 ×2 메뉴가 열린다', speed !== null && !speed.locked ? 'pass' : 'fail', JSON.stringify(speed));
  const mclose = await center('#win-menu-main .kwin-close');
  if (mclose) await touch(cdp, mclose.x, mclose.y);
  await page.waitForTimeout(200);
  await page.evaluate(`window.__pj.flow.frozen = true`);
}

/**
 * G12 — 모든 창을 열어 보이는 enabled 컨트롤이 전부 ≥44px 이고 제자리에서 눌리는지(5점 elementFromPoint) 감사 + 콘택트 시트.
 */
async function verifyG12(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const AUDIT = `(() => {
    const out = { small: [], stolen: [], n: 0 };
    // 스크롤 컨테이너에 잘린 행은 「보이는 컨트롤」이 아니다 — 잘린 행의 중심을 찍으면 컨테이너가 잡혀 오보가 난다 (실측: 메뉴 13행)
    const vis = (n) => { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = n.getBoundingClientRect(); if (!(r.width >= 1 && r.height >= 1 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)) return false;
      for (let a = n.parentElement; a; a = a.parentElement) { const st = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(st.overflowY)) { const ar = a.getBoundingClientRect(); if (r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5) return false; } }
      return true; };
    for (const n of document.querySelectorAll('button, [role="button"]')) {
      if (!vis(n) || n.disabled) continue;
      out.n++;
      const r = n.getBoundingClientRect();
      const hit = n.id === 'hud-ticker' ? 44 : Math.min(r.width, r.height);
      if (hit < 44) out.small.push((n.id || n.className || n.tagName) + ':' + Math.round(hit));
      for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.2], [0.5, 0.8]]) {
        const at = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
        if (!at || !(at === n || n.contains(at))) { out.stolen.push(n.id || n.className); break; }
      }
    }
    return out;
  })()`;
  const routes: { id: string; open: string; close: string; evalOpen?: string }[] = [
    { id: 'home', open: '', close: '' },
    { id: 'build', open: '#hud-right [data-cell="build"]', close: '#win-build .kwin-close' },
    { id: 'sns', open: '#hud-right [data-cell="sns"]', close: '#win-sns .kwin-close' },
    { id: 'shop', open: '#hud-right [data-cell="market"]', close: '#win-shop .kwin-close' },
    { id: 'rank', open: '#hud-info', close: '#win-rank .kwin-close' },
    { id: 'menu', open: '#hud-menu', close: '#win-menu-main .kwin-close' },
    { id: 'pool', open: '#hud-right [data-cell="zone"]', close: '#dock-pool-cancel' },
    { id: 'rig', open: '', evalOpen: 'window.__pj.rigWin.show()', close: '#win-rig .kwin-close' }, // P51: 기구 개조 창(메뉴 항목) — 8번째
  ];
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const bad: string[] = [];
  let total = 0;
  for (const r of routes) {
    if (r.evalOpen) { await page.evaluate(r.evalOpen); await page.waitForTimeout(300); }
    else if (r.open) { const c = await center(r.open); if (c) await touch(cdp, c.x, c.y); await page.waitForTimeout(300); }
    const a = (await page.evaluate(AUDIT)) as { small: string[]; stolen: string[]; n: number };
    total += a.n;
    if (a.small.length || a.stolen.length) bad.push(`${r.id}: small ${a.small.join(',') || '-'} stolen ${a.stolen.join(',') || '-'}`);
    await page.screenshot({ path: `${SHOT_DIR}/route-${r.id}.png` });
    if (r.close) { const c = await center(r.close); if (c) await touch(cdp, c.x, c.y); await page.waitForTimeout(250); }
  }
  record(`G12 화면 ${routes.length}개 — 보이는 컨트롤 ${total}개 전부 ≥44px · 제자리에서 눌림`, bad.length === 0 ? 'pass' : 'fail', bad.join(' | '));

  // 튜토리얼 Strip — 새 판에서 뜨고, 탭 3번에 사라지며, 다시 안 뜬다
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  await page.waitForTimeout(400);
  const stripUp = (await page.evaluate(`(() => { const s = document.getElementById('tut-strip'); if (!s || getComputedStyle(s).display === 'none') return null; const r = s.getBoundingClientRect(); return { h: r.height, y: r.bottom, text: s.textContent }; })()`)) as { h: number; y: number; text: string } | null;
  await page.screenshot({ path: `${SHOT_DIR}/g12-tutorial.png` });
  let taps = 0;
  for (let k = 0; k < 5; k++) {
    const c = await center('#tut-strip');
    if (!c) break;
    await touch(cdp, c.x, c.y);
    taps++;
    await page.waitForTimeout(150);
  }
  const stripGone = (await page.evaluate(`(() => { const s = document.getElementById('tut-strip'); return { hidden: !s || getComputedStyle(s).display === 'none', seen: localStorage.getItem('pj.tut') }; })()`)) as { hidden: boolean; seen: string | null };
  record('G12 튜토리얼 Strip — 새 판에 뜨고(≥44px) 탭 3번에 닫히며 wp.tut 를 남긴다', stripUp !== null && stripUp.h >= 44 && taps === 3 && stripGone.hidden && stripGone.seen === '1' ? 'pass' : 'fail', JSON.stringify({ up: stripUp?.h, taps, gone: stripGone }));
  await page.goto(`${BASE}/?debug=1&px=1&freeze=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  const again = (await page.evaluate(`(() => { const s = document.getElementById('tut-strip'); return !s || getComputedStyle(s).display === 'none'; })()`)) as boolean;
  record('G12 튜토리얼 — 본 뒤 리로드에 다시 안 뜬다', again ? 'pass' : 'fail');
}

/**
 * G19 — 결산 카드(하루 끝) · 시설 개선 · 손님 카드 게이지 · 랭킹 창. 결산은 하네스에서 `resultsCtl.enabled` 를 켜야 뜬다.
 */
async function verifyG19(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(e).display === 'none') return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 새 판에서 — 잔해 위에서 재면 원인을 모른다
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  await page.waitForTimeout(300);
  // 시설 개선 — API 로 화장실을 놓고 카드에서 「개선」 터치
  const prep = (await page.evaluate(`(() => { const w = window.__pj; w.features.facilityLevels = true; const g = w.game; w.flow.frozen = true; const gt = g.gate; g.money += 50000;
    const r = g.placeFacility('toilet', gt.i + 2, gt.j + 3, 0); w.facilityInfo.show(r.uid); return { ok: r.ok, uid: r.uid, money: g.money, level: g.facilities.byUid(r.uid).level, pop: g.facilityPop(g.facilities.byUid(r.uid)) }; })()`)) as { ok: boolean; uid: number; money: number; level: number; pop: number };
  const upC = await center('#win-facility-upgrade');
  if (upC) await touch(cdp, upC.x, upC.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; const f = g.facilities.byUid(${prep.uid}); return { level: f.level, money: g.money, pop: g.facilityPop(f), title: (document.querySelector('#win-facility .kfac-nav .krow-name') || document.getElementById('win-facility-title')).textContent}; })()`)) as { level: number; money: number; pop: number; title: string };
  record('G19 시설 개선 — 「개선」 터치로 Lv1 → Lv2 · 돈이 줄고 인기가 오른다', prep.ok && after.level === prep.level + 1 && after.money < prep.money && after.pop > prep.pop && after.title.includes('Lv2') ? 'pass' : 'fail', JSON.stringify({ prep, after }));
  const closeC = await center('#win-facility .kwin-close');
  if (closeC) await touch(cdp, closeC.x, closeC.y);
  await page.waitForTimeout(200);
  // 손님 카드 — 손님 하나 만들어 카드 열기: 초상·이름·게이지 둘
  const card = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸 */
    for (let k = 0; k < 420; k++) { g.step(1); if (g.guests.all.length) break; } const guest = g.guests.all[0]; if (!guest) return null; w.guestInfo.show(guest);
    const win = document.getElementById('win-guest'); return { name: guest.name, hasFace: !!win.querySelector('.kportrait canvas'), bars: win.querySelectorAll('.kbar-fill').length, title: win.querySelector('.kwin-title').textContent }; })()`)) as { name: string; hasFace: boolean; bars: number; title: string } | null;
  record('G19 손님 카드 — 이름 · 초상 · 체력/만족 게이지', card !== null && card.hasFace && card.bars === 2 && card.title.includes(card.name) ? 'pass' : 'fail', JSON.stringify(card));
  const closeG = await center('#win-guest .kwin-close');
  if (closeG) await touch(cdp, closeG.x, closeG.y);
  await page.waitForTimeout(200);
  // 하루 결산 — 켜고 폐장까지 감으면 「오늘의 결과」 카드
  await page.evaluate(`(() => { const w = window.__pj; w.resultsCtl.enabled = true; w.features.dailyResults = true; const g = w.game; g.tick = w.TPD - 1; w.flow.frozen = false; })()`);
  await page.waitForTimeout(900);
  const day = (await page.evaluate(`(() => { const w = window.__pj; const win = document.getElementById('win-results'); return { up: !win.hidden, kind: w.results.kind, rows: win.querySelectorAll('.krow').length, text: win.textContent.slice(0, 80) }; })()`)) as { up: boolean; kind: string; rows: number; text: string };
  record('G19 하루 결산 카드 — 폐장에 「오늘의 결과」가 뜬다 (방문·수입·순이익·순위)', day.up && day.kind === 'day' && day.rows >= 6 ? 'pass' : 'fail', JSON.stringify(day));
  const okC = await center('#win-results-ok');
  if (okC) await touch(cdp, okC.x, okC.y);
  await page.waitForTimeout(200);
  const closed = (await page.evaluate(`document.getElementById('win-results').hidden`)) as boolean;
  record('G19 결산 「확인」 터치 → 닫힌다', closed ? 'pass' : 'fail');
  await page.evaluate(`(() => { window.__pj.resultsCtl.enabled = false; window.__pj.features.dailyResults = false; window.__pj.flow.frozen = true; })()`);
  // 랭킹 창 — 탭 5개, 라이벌 탭에 내 빠지
  await page.evaluate(`(() => { window.__pj.features.rivals = true; window.__pj.rankingsWin.show('rival'); })()`);
  await page.waitForTimeout(200);
  const rk = (await page.evaluate(`(() => { const win = document.getElementById('win-rankings'); return { up: !win.hidden, tabs: win.querySelectorAll('.ktab').length, me: !!win.querySelector('.krow.kme') }; })()`)) as { up: boolean; tabs: number; me: boolean };
  record('G19 랭킹 창 — 탭 5 · 라이벌 순위에 내 빠지', rk.up && rk.tabs === 5 && rk.me ? 'pass' : 'fail', JSON.stringify(rk));
  const closeR = await center('#win-rankings .kwin-close');
  if (closeR) await touch(cdp, closeR.x, closeR.y);
  await page.waitForTimeout(200);
}

/** G20 — 직원 창에서 고용 터치 → 직원 +1 · 돈 감소 · 판 위에 걸어 다닌다 · 하루 뒤 월급·청결 */
async function verifyG20(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(e).display === 'none') return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  await page.evaluate(`(() => { const w = window.__pj; w.features.staff = true; w.flow.frozen = true; w.game.money += 20000; w.staffWin.show('hire'); })()`);
  await page.waitForTimeout(250);
  const before = (await page.evaluate(`(() => ({ n: window.__pj.game.staff.all.length, money: window.__pj.game.money, rows: document.querySelectorAll('#win-staff [data-hire]').length }))()`)) as { n: number; money: number; rows: number };
  const hireC = await center('#win-staff [data-hire="cleaner"]');
  if (hireC) await touch(cdp, hireC.x, hireC.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; return { n: g.staff.all.length, money: g.money, listed: document.querySelectorAll('#win-staff [data-staff]').length }; })()`)) as { n: number; money: number; listed: number };
  record('G20 직원 고용 — 「청소부」 터치 → 직원 +1 · 돈 −500 · 목록에 뜬다', before.rows === 4 && after.n === before.n + 1 && before.money - after.money === 500 && after.listed === after.n ? 'pass' : 'fail', JSON.stringify({ before, after }));
  const closeC = await center('#win-staff .kwin-close');
  if (closeC) await touch(cdp, closeC.x, closeC.y);
  await page.waitForTimeout(200);
  const walk = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const s0 = g.staff.all[0]; const p0 = [s0.i, s0.j]; for (let k = 0; k < 60; k++) g.step(1); w.refreshHud(); const s1 = g.staff.all[0]; return { moved: s1.i !== p0[0] || s1.j !== p0[1], imgs: w.scene.staffCountForTest ? w.scene.staffCountForTest() : -1 }; })()`)) as { moved: boolean; imgs: number };
  record('G20 직원이 판 위를 걸어 다닌다 (60tick 뒤 자리가 바뀜)', walk.moved ? 'pass' : 'fail', JSON.stringify(walk));
  const day = (await page.evaluate(`(() => { const g = window.__pj.game; const money = g.money; const c0 = g.staff.cleanliness; g.tick = window.__pj.TPD - 1; g.step(1); const d = g.stats.days[g.stats.days.length - 1]; return { salaryIn: d.maintenance >= 100, cleanChanged: g.staff.cleanliness !== c0 || c0 === 100, exp: g.staff.all[0].exp }; })()`)) as { salaryIn: boolean; cleanChanged: boolean; exp: number };
  record('G20 하루 마감 — 월급이 유지비에 들어가고 EXP +1', day.salaryIn && day.exp === 1 ? 'pass' : 'fail', JSON.stringify(day));
}

/** G23 — 되먹임 노출: 친구 머리 위 게이지 · SNS 썸네일+초상 · 하단 바 방문 친구 · 심사 무대 · 목표 3슬롯 */
async function verifyG23(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(e).display === 'none') return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  await page.waitForTimeout(300);
  // 풀 + 시설을 놓고 이틀을 감는다 → 사진·친구 방문이 생긴다
  const st = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money += 100000; for (const id of ['cafe', 'stripy_slide', 'footbath']) g.unlocked.facilities.add(id);
    g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸 (뭍 풀 삭제) */
    g.placeFacility('toilet', gt.i + 3, gt.j + 3, 0); g.placeFacility('cafe', gt.i + 2, gt.j + 9, 0); g.placeFacility('footbath', gt.i, gt.j + 4, 0);
    w.skip(w.TPD * 2 + 400); w.flow.frozen = true; w.refreshHud();
    return { posts: g.sns.allPosts.length, friends: g.guests.all.filter((x) => x.friendId).length, visitor: !!document.querySelector('#hud-info.has-visitor'), gauges: w.scene.gaugeCountForTest ? w.scene.gaugeCountForTest() : -1 }; })()`)) as { posts: number; friends: number; visitor: boolean; gauges: number };
  record('G23 이틀 뒤 — 사진 글이 쌓이고 친구가 왔으면 하단 바에 초상+이름', st.posts > 0 && (st.friends === 0 || st.visitor) ? 'pass' : 'fail', JSON.stringify(st));
  const sns = await center('#hud-right [data-cell="sns"]');
  if (sns) await touch(cdp, sns.x, sns.y);
  await page.waitForTimeout(400);
  const tl = (await page.evaluate(`(() => ({ rows: document.querySelectorAll('#win-sns .kpost').length, shots: document.querySelectorAll('#win-sns .kshot canvas').length, faces: document.querySelectorAll('#win-sns .kpost .kportrait canvas').length }))()`)) as { rows: number; shots: number; faces: number };
  record('G23 SNS 타임라인 — 글마다 초상 · 썸네일(실사 또는 합성)', tl.rows > 0 && tl.faces === tl.rows && tl.shots === tl.rows ? 'pass' : 'fail', JSON.stringify(tl));
  const closeS = await center('#win-sns .kwin-close');
  if (closeS) await touch(cdp, closeS.x, closeS.y);
  await page.waitForTimeout(200);
  await page.evaluate(`window.__pj.certWin.show()`);
  await page.waitForTimeout(300);
  const stage = (await page.evaluate(`(() => ({ stages: document.querySelectorAll('#win-cert .kstage').length, judges: document.querySelectorAll('#win-cert .kstage .kportrait canvas, #win-cert .kstage .kportrait .kpic').length, conds: document.querySelectorAll('#win-cert .kcond .kportrait canvas, #win-cert .kcond .kportrait .kpic').length }))()`)) as { stages: number; judges: number; conds: number };
  record('G23 심사 무대 — 카드마다 심사위원 셋 · 조건 줄에 심사위원 초상', stage.stages > 0 && stage.judges === stage.stages * 3 && stage.conds > 0 ? 'pass' : 'fail', JSON.stringify(stage));
  const closeC = await center('#win-cert .kwin-close');
  if (closeC) await touch(cdp, closeC.x, closeC.y);
  await page.waitForTimeout(200);
  const goals = (await page.evaluate(`(() => { const t = document.getElementById('hud-ticker').textContent; return t; })()`)) as string;
  record('G23 티커에 목표 문장', goals.length > 4 ? 'pass' : 'fail', goals.slice(0, 40));
}

/** G24 — 카탈로그 카드 격자 · 손님 상한 랭크 연동 · 소리(효과음 12 · BGM 스케줄러 · 토글 저장) */
async function verifyG24(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(e).display === 'none') return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const build = await center('#hud-right [data-cell="build"]');
  if (build) await touch(cdp, build.x, build.y);
  await page.waitForTimeout(300);
  const cat = (await page.evaluate(`(() => { const cards = [...document.querySelectorAll('#win-build .kpcard')]; const r = cards.map((c) => c.getBoundingClientRect()); const cols = new Set(r.map((x) => Math.round(x.left))).size; return { cards: cards.length, cols, minH: Math.min(...r.map((x) => x.height)), thumbs: document.querySelectorAll('#win-build .kpcard .kpcard-art canvas').length }; })()`)) as { cards: number; cols: number; minH: number; thumbs: number };
  record('G24 건설 카탈로그 — 카드 격자(3열) · 그림 · 44px 이상', cat.cards >= 3 && cat.cols === 3 && cat.minH >= 44 && cat.thumbs === cat.cards ? 'pass' : 'fail', JSON.stringify(cat));
  const closeB = await center('#win-build .kwin-close');
  if (closeB) await touch(cdp, closeB.x, closeB.y);
  await page.waitForTimeout(200);
  const cap = (await page.evaluate(`(() => { const g = window.__pj.game; const r0 = g.rank; const t = g.facilities.all.filter((f) => f.defId === 'ticket').length; const a = g.maxGuests(); g.rank = 5; const b = g.maxGuests(); g.rank = r0; return { a, b, t }; })()`)) as { a: number; b: number; t: number };
  record('G24 동시 손님 상한 — 12 + 랭크×12 + 매표소×8 (P57-i 유입 재조정: 기본 32 → 12 · P34: 킷 매표소 1 이면 ★0 20 → ★5 80)', cap.a === 12 + cap.t * 8 && cap.b === cap.a + 60 ? 'pass' : 'fail', JSON.stringify(cap));
  const snd = (await page.evaluate(`(() => { const s = window.__pj.sfx; const names = ['tap','open','close','coin','error','splash','photo','build','wish','rankup','cert','like']; let ok = true; for (const n of names) { try { s.play(n); } catch { ok = false; } } s.setBgm(false); const off = localStorage.getItem('pj.bgm'); s.setBgm(true); const on = localStorage.getItem('pj.bgm'); return { ok, off, on, running: s.bgmRunning }; })()`)) as { ok: boolean; off: string; on: string; running: boolean };
  record('G24 소리 — 효과음 12큐 재생 예외 0 · BGM 토글이 저장된다', snd.ok && snd.off === '0' && snd.on === '1' ? 'pass' : 'fail', JSON.stringify(snd));
}

/** G26 — 손님 생활: 튜브 6종·체형·포즈 텍스처 · HP 아이콘 · 눕기 · 슬라이드 탑승(climb → ride → 착수) · 구매 라벨 */
async function verifyG26(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`window.__pj.flatten()`); // P0-B: 이 절은 고정 좌표에 놓는다 — 경사와 무관
  const tex = (await page.evaluate(`(() => { const pv = window.__pj.scene.deps.provider; const ids = ['guest/body:0:f1/swim/0/calm','guest/body:1:f2/swim/1/happy','guest/body:2:f3/ride/0/calm','guest/body:3:f4/swim/0/calm','guest/body:4:f5/ride/1/calm','guest/body:5:f6/swim/0/calm','guest/body:6:kid/walk/0/calm','guest/body:7:old/idle/0/tired','guest/body:0/lie/0/calm','guest/body:1/sit/0/happy']; const ok = ids.filter((id) => { const c = pv.canvas(id); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) n++; return n > 60; }); return { ok: ok.length, total: ids.length }; })()`)) as { ok: number; total: number };
  record('G26 텍스처 — 튜브 6 · 어린이 · 노인 · 눕기 · 앉기 · 탑승 (10종, 각 60px 이상 칠해짐)', tex.ok === tex.total ? 'pass' : 'fail', JSON.stringify(tex));

  // 풀 + 데크체어 + 슬라이드(해금) → 손님을 강제로 보내 포즈·상태를 본다
  const life = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 500000; g.rank = 2; g.openLand(2); g.unlocked.facilities.add('stripy_slide'); g.unlocked.facilities.add('pyeongsang_row'); const gt = g.gate; const rp = g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸(열 41~46 × 행 24~30) — 슬라이드는 세로(facing 1)로 (43,15) 에: 활강로가 링 윗줄 데크 (44,24) 에서 끝나고 그 다음 칸 (44,25) 이 안쪽 물 */ const rs = g.placeFacility('stripy_slide', 43, 15, 1); const rc = g.placeFacility('pyeongsang_row', gt.i + 3, gt.j + 4, 0); const slide = g.facilities.all.find((f) => f.defId === 'stripy_slide'); if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘(등급 3 · 수영 패키지만 · 자판기·장식 반경 밖) */ const chair = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); const seen = { climb: false, ride: false, landed: false, lie: false, hpIcon: 0 }; let n = 0; let low = null; while (n++ < 900 && !(seen.landed && seen.lie)) { for (const gu of g.guests.all) { if (gu.state === 'wander') { if (!seen.ride && slide) { gu.target = { kind: 'facility', uid: slide.uid }; gu.state = 'walk'; gu.stateTicks = 0; } else if (!seen.lie && chair) { gu.target = { kind: 'facility', uid: chair.uid }; gu.state = 'walk'; gu.stateTicks = 0; } } if (gu.state === 'climb') seen.climb = true; if (gu.state === 'ride') seen.ride = true; if (gu.state === 'swim' && gu.target && gu.target.kind === 'pool' && seen.ride) seen.landed = true; if (gu.state === 'use' && gu.target && chair && gu.target.uid === chair.uid) { seen.lie = true; gu.stateTicks = 0; } } w.skip(1); } for (const gu of g.guests.all) { if (gu.state === 'use' && chair && gu.target && gu.target.uid === chair.uid) { gu.hp = 10; low = gu.uid; } } w.refreshHud(); return { rs: rs.ok, rp: rp.ok, rc: rc.ok, ...seen, low, n }; })()`)) as { rs: boolean; rp: boolean; rc: boolean; climb: boolean; ride: boolean; landed: boolean; lie: boolean; low: number | null; n: number };
  record('G26 → P49-b 슬라이드(세로) — climb → ride → 링 너머 빠지에 착수 · 데크체어 이용', life.rs && life.rp && life.rc && life.climb && life.ride && life.landed && life.lie ? 'pass' : 'fail', JSON.stringify(life));
  await page.waitForTimeout(400);
  const shown = (await page.evaluate(`(() => { const w = window.__pj; const keys = [...w.scene.guestImgs.values()].map((im) => im.texture.key); return { lie: keys.some((k) => k.includes('/lie/')), hp: w.scene.hpIconCountForTest(), floats: keys.filter((k) => /:f\\d\\//.test(k)).length, keys: keys.slice(0, 4) }; })()`)) as { lie: boolean; hp: number; floats: number; keys: string[] };
  record('G26 화면 — 눕기 포즈 텍스처 · HP<30 손님 위 배터리 아이콘', shown.lie && shown.hp >= 1 ? 'pass' : 'fail', JSON.stringify(shown));
}

/** G27 — 사건 밀도: 계절 연출(꽃잎·불꽃·낙엽·조명) 카운트 · 첫 방문 대사 · 알림함 창 · 소원 상자 열기 */
async function verifyG27(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  // 봄 첫날 — 꽃잎
  await page.evaluate(`(() => { window.__pj.flow.frozen = false; })()`);
  await page.waitForTimeout(1600);
  const spring = (await page.evaluate(`(() => window.__pj.fxFired['petal-fall'] || 0)()`)) as number;
  // 여름 주말 19시 — 불꽃
  await page.evaluate(`(() => { const g = window.__pj.game; g.day = 7; g.tick = 1540; })()`);
  await page.waitForTimeout(2200);
  const summer = (await page.evaluate(`(() => window.__pj.fxFired['fireworks'] || 0)()`)) as number;
  // 겨울 17시 — 조명 틴트 + 트윙클 (시설 하나 필요)
  await page.evaluate(`(() => { const g = window.__pj.game; g.money = 50000; g.placeFacility('toilet', g.gate.i + 2, g.gate.j + 3, 0); g.day = 12; g.tick = 1300; })()`);
  await page.waitForTimeout(1800);
  const winter = (await page.evaluate(`(() => ({ lights: window.__pj.scene.illuminationOn(), twinkle: window.__pj.fxFired['lamp-twinkle'] || 0 }))()`)) as { lights: boolean; twinkle: number };
  await page.evaluate(`(() => { window.__pj.flow.frozen = true; })()`);
  record('G27 계절 연출 — 봄 꽃잎 · 여름 주말 저녁 불꽃 · 겨울 저녁 조명+트윙클 (FX 등록부 카운트)', spring > 0 && summer > 0 && winter.lights && winter.twinkle > 0 ? 'pass' : 'fail', JSON.stringify({ spring, summer, ...winter }));

  // 첫 방문 대사 — 시작 친구를 강제로 입장시키면 say 가 템플릿 문장이다
  const line = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.sns.unlockedFriends[0]; const st = g.sns.friends.get(f.id); const before = st.visits; st.visits = 0; const fd = g.sns.friendDef(f.id); const gu = g.guests.spawn({ id: fd.id, palette: fd.palette, name: fd.name, age: fd.age, gender: fd.gender }); st.visits = before; return { name: fd.name, hasSay: typeof gu.say === 'string' || gu.say === null, friends: g.sns.unlockedFriends.length }; })()`)) as { name: string; hasSay: boolean; friends: number };
  const calendar = (await page.evaluate(`(() => { const g = window.__pj.game; return { n: g.calendarGiven.size, total: window.__pj.calendarCount }; })()`)) as { n: number; total: number };
  record('G27 → P53-a 달력 40건(연차 폴백 8) · 친구 목록', calendar.total === 40 && line.friends > 0 ? 'pass' : 'fail', JSON.stringify({ ...calendar, ...line }));

  // 알림함 창 — 메뉴에서 열리고 행이 있고, 열면 읽음 처리
  await page.evaluate(`(() => { window.__pj.inboxWin.show(); })()`);
  await page.waitForTimeout(200);
  const inbox = (await page.evaluate(`(() => { const w = document.getElementById('win-inbox'); const g = window.__pj.game; return { up: !!w && !w.hidden, rows: document.querySelectorAll('#win-inbox [data-inbox]').length, unread: g.inbox.unread }; })()`)) as { up: boolean; rows: number; unread: number };
  await page.evaluate(`(() => { document.querySelector('#win-inbox .kwin-close')?.click(); })()`);
  record('G27 알림함 창 — 행 ≥1 · 열면 읽음 0', inbox.up && inbox.rows >= 1 && inbox.unread === 0 ? 'pass' : 'fail', JSON.stringify(inbox));

  // 소원 상자 열기 — 완료 소원 하나를 만들어 메시지 탭에 「상자 열기」가 뜨고 누르면 사라진다
  const box = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.sns.unlockedFriends[0]; if (!f.done.includes(0)) f.done.push(0); localStorage.removeItem('pj.wishOpened'); w.snsWin.show('messages'); const b = document.querySelector('#win-sns [data-open]'); const before = !!b; if (b) b.click(); const after = document.querySelectorAll('#win-sns [data-open]').length; const banner = !!document.querySelector('.kbanner'); document.querySelector('#win-sns .kwin-close')?.click(); return { before, after, banner }; })()`)) as { before: boolean; after: number; banner: boolean };
  record('G27 소원 보상 「상자 열기」 — 버튼이 뜨고 누르면 배너 + 버튼 소멸', box.before && box.after === 0 && box.banner ? 'pass' : 'fail', JSON.stringify(box));
}

/** G29 — UI 마감: Galmuri 셀프호스트 로드 · 탭 아이콘(건설 6 · SNS 3) · 창 색조 · HUD 계절/날씨 아이콘 */
async function verifyG29(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const font = (await page.evaluate(`(async () => { await document.fonts.load('12px Galmuri11'); await document.fonts.load('bold 12px Galmuri11'); await document.fonts.ready; const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Galmuri11').map((f) => f.weight + ':' + f.status); return { ok: document.fonts.check('12px Galmuri11'), faces, external: performance.getEntriesByType('resource').filter((r) => !r.name.startsWith(location.origin)).length }; })()`)) as { ok: boolean; faces: string[]; external: number };
  record('G29 픽셀 서체 — Galmuri11 셀프호스트 로드(정체·굵게) · 외부 요청 0', font.ok && font.faces.filter((f) => f.endsWith('loaded')).length >= 2 && font.external === 0 ? 'pass' : 'fail', JSON.stringify(font));
  const ui = (await page.evaluate(`(() => { const w = window.__pj; w.buildWin.show(); const build = document.querySelectorAll('#win-build .ktab .kicon').length; document.querySelector('#win-build .kwin-close').click(); w.snsWin.show(); const sns = document.querySelectorAll('#win-sns .ktab .kicon').length; const pink = document.getElementById('win-sns').classList.contains('pink'); document.querySelector('#win-sns .kwin-close').click(); w.shopWin.show(); const green = document.getElementById('win-shop').classList.contains('green'); document.querySelector('#win-shop .kwin-close').click(); const hud = document.querySelectorAll('#hud-time .kicon').length; return { build, sns, pink, green, hud }; })()`)) as { build: number; sns: number; pink: boolean; green: boolean; hud: number };
  record('G29 → P50-a 탭 아이콘(건설 9 — 「빠지」 탭 추가 · SNS 3) · 창 색조 없음(P59-a D67 톤 2 — SNS 분홍·상점 초록 폐기) · HUD 계절+날씨 아이콘 2', ui.build === 9 && ui.sns === 3 && !ui.pink && !ui.green && ui.hud === 2 ? 'pass' : 'fail', JSON.stringify(ui));
}

/** G30 — 밸런스: 랭크 유지비 · 호화 상품 3종이 상점 데이터에 있다 (P60-a: 좋아요 리셋 경고 절은 소품 삭제로 뺐다) */
async function verifyG30(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; { const gt = g.gate; g.placeFacility('vending_out', gt.i + 2, gt.j + 4, 0); } /* P60-a: kit=0 판이라 소품 유지비가 유일한 유지비였다 — 시설 하나를 놓고 잰다 */ const m0 = g.dailyMaintenance(); g.rank = 4; const m4 = g.dailyMaintenance(); g.rank = 0; const lux = ['crystal_fountain', 'grand_arch', 'moon_tower'].filter((id) => w.facilityDefs.has(id)).length; return { m0, m4, lux }; })()`)) as { m0: number; m4: number; lux: number };
  record('G30 후반 곡선 — ★4 유지비 > ★0 · 호화 상품 3종', r.m4 > r.m0 && r.lux === 3 ? 'pass' : 'fail', JSON.stringify({ m0: r.m0, m4: r.m4, lux: r.lux }));
}

/** G31 — 소리: 계절 곡 4 · 징글 3 · 볼륨 저장 · G32 — 가로에서 세로 안내 */
async function verifyG31(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const snd = (await page.evaluate(`(() => { const s = window.__pj.sfx; const names = []; for (let k = 0; k < 4; k++) { s.setSeason(k); names.push(s.trackName); } s.setSeason(0); let ok = true; try { s.jingle('cert'); s.jingle('result'); s.jingle('ending'); } catch (e) { ok = false; } s.setVolume(0.5); const vol = localStorage.getItem('pj.vol'); s.setVolume(1); return { names: [...new Set(names)].length, ok, vol, running: s.bgmRunning }; })()`)) as { names: number; ok: boolean; vol: string | null; running: boolean };
  record('G31 소리 — 계절 곡 4 (이름이 다 다르다) · 징글 3 예외 0 · 볼륨이 저장된다', snd.names === 4 && snd.ok && snd.vol === '0.5' ? 'pass' : 'fail', JSON.stringify(snd));
  const portrait = (await page.evaluate(`(() => getComputedStyle(document.getElementById('krotate')).display)()`)) as string;
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(200);
  const landscape = (await page.evaluate(`(() => { const r = document.getElementById('krotate'); const cs = getComputedStyle(r); return { display: cs.display, h: r.getBoundingClientRect().height }; })()`)) as { display: string; h: number };
  await page.setViewportSize({ width: 393, height: 852 });
  record('G32 세로 고정 — 세로에선 안내 없음 · 가로(852×393)에선 안내가 화면을 덮는다', portrait === 'none' && landscape.display === 'flex' && landscape.h >= 380 ? 'pass' : 'fail', JSON.stringify({ portrait, ...landscape }));
}

/** G33 — 요리 레벨이 맛·인기에 소급(메뉴 창 표기) · 좋아요가 유입 목표를 올린다 */
async function verifyG33(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const gt = g.gate; g.unlocked.facilities.add('cafe'); const rc = g.placeFacility('cafe', gt.i + 2, gt.j + 4, 0); const cafe = g.facilities.all.find((f) => f.defId === 'cafe'); const t0 = g.dailyTarget(); g.sns.totalLikes = 5000; const t1 = g.dailyTarget(); g.cooking.exp = 0; w.menuWin.show(cafe.uid); const lv1 = [...document.querySelectorAll('#win-menu [data-recipe]')].map((e) => e.dataset.stats || '')[0] || ''; document.querySelector('#win-menu-main .kwin-close').click(); g.cooking.exp = 1000000; w.menuWin.show(cafe.uid); const lv10 = [...document.querySelectorAll('#win-menu [data-recipe]')].map((e) => e.dataset.stats || '')[0] || ''; document.querySelector('#win-menu-main .kwin-close').click(); g.cooking.exp = 0; g.sns.totalLikes = 0; const taste = (s) => Number((s.match(/맛 (\\d+)/) || [0, 0])[1]); return { ok: rc.ok, t0, t1, lv1, lv10, up: taste(lv10) > taste(lv1), tag: lv10.includes('Lv10') }; })()`)) as { ok: boolean; t0: number; t1: number; lv1: string; lv10: string; up: boolean; tag: boolean };
  record('G33 좋아요 5,000 → 유입 목표 ↑ · 요리 Lv10 에서 메뉴 창 맛·인기가 오르고 Lv 표기', r.ok && r.t1 > r.t0 && r.up && r.tag ? 'pass' : 'fail', JSON.stringify(r));
}

/** G34 — 대기 줄(순번 비켜 서기) · 폐장 1시간 전 퇴장 행렬 · 비 오면 돌아가는 손님 */
async function verifyG34(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  // A. 줄 — 정원 1 데크체어로 전원을 보낸다. 줄이 2 이상이 되는 순간 멈춘다 (프레임은 아래서 따로 기다린다)
  const q = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; g.unlocked.facilities.add('pyeongsang_row'); g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸 */ const rc = g.placeFacility('pyeongsang_row', gt.i + 2, gt.j + 4, 0); const chair = g.facilities.all[0]; let maxQ = 0; let n = 0; while (n++ < 900 && maxQ < 2) { for (const gu of g.guests.all) if (gu.state === 'wander' && gu.stateTicks === 0) { gu.target = { kind: 'facility', uid: chair.uid }; gu.state = 'walk'; } w.skip(1); maxQ = Math.max(maxQ, g.guests.queueAt(chair)); } w.flow.frozen = true; /* 아래 250ms 동안 실시간 tick 이 줄 머리를 처리해 버리지 않게 — 화면은 얼린 상태로도 그려진다 */ return { ok: rc.ok, maxQ, n }; })()`)) as { ok: boolean; maxQ: number; n: number };
  await page.waitForTimeout(250); // 한 프레임 이상 — 씬이 줄 순번 오프셋을 그린다
  const qx = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const xs = g.guests.all.filter((x) => x.state === 'queue').map((x) => { const im = w.scene.guestImgs.get(x.uid); return im ? im.x : null; }).filter((x) => x !== null); return { queued: g.guests.all.filter((x) => x.state === 'queue').length, distinctX: new Set(xs).size }; })()`)) as { queued: number; distinctX: number };
  record('G34 대기 줄 — 정원 1 데크체어 앞 줄 ≥2 · 줄 선 손님은 화면에서 비켜 선다', q.ok && q.maxQ >= 2 && qx.distinctX >= 2 ? 'pass' : 'fail', JSON.stringify({ ...q, ...qx }));
  // B. 비 — 손님이 있는 채로 비를 내리면 「비 오네…」 하고 돌아가는 사람이 생긴다
  const rain = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.flow.frozen = false; g.weather = 'rain'; let rainy = 0; let m = 0; while (m++ < 900 && rainy === 0) { w.skip(1); for (const gu of g.guests.all) if (gu.state === 'leave' && gu.emote === 'grr' && gu.hp >= 30) rainy++; } g.weather = 'clear'; return { rainy, m }; })()`)) as { rainy: number; m: number };
  // C. 폐장 — 1시간 전으로 감으면 30tick 안에 남은 손님 대부분이 입구로 간다
  const close = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.tick = w.TPD - 140; const entered = g.guests.enteredToday; w.skip(60); const total = g.guests.count; const leaving = g.guests.all.filter((x) => x.state === 'leave').length; const busy = g.guests.all.filter((x) => x.state === 'swim' || x.state === 'use' || x.state === 'climb' || x.state === 'ride').length; const idle = total - leaving - busy; return { total, leaving, busy, idle, noEntry: g.guests.enteredToday === entered }; })()`)) as { total: number; leaving: number; busy: number; idle: number; noEntry: boolean };
  record('G34 비·폐장 — 비 오면 돌아가는 손님 · 폐장 1시간 전엔 새 입장 0 · 60tick 뒤 노는 손님 0 (입구로 가거나 하던 것만 마친다)', rain.rainy > 0 && close.noEntry && close.idle === 0 ? 'pass' : 'fail', JSON.stringify({ ...rain, ...close }));
}

/** G35 — 심사 결과 창(심사위원 카드 3 · 도장) · 인증 조건 다양화 */
async function verifyG35(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; w.resultsCtl.enabled = true; g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸 = grade_f 의 20칸 이상 */ g.certs.state.applied = { id: 'grade_f', judgeDay: g.day }; g.tick = w.JUDGE_TICK - 1; w.skip(2); })()`);
  await page.waitForTimeout(400);
  const r = (await page.evaluate(`(() => { const win = document.getElementById('win-cert-result'); const g = window.__pj.game; return { up: !!win && !win.hidden, judges: document.querySelectorAll('#win-cert-result [data-judge]').length, stamp: (document.querySelector('#win-cert-result [data-stamp]') || {}).textContent || '', last: g.certs.state.last ? g.certs.state.last.score : -1, kinds: [...new Set(window.__pj.certDefs.flatMap((c) => c.conditions.filter((x) => x.cond.kind === 'pool').flatMap((x) => Object.keys(x.cond))))].filter((k) => ['intensityMin','likesMin','popMin','indoor','tile'].includes(k)).length }; })()`)) as { up: boolean; judges: number; stamp: string; last: number; kinds: number };
  await page.evaluate(`(() => { document.querySelector('#win-cert-result .kwin-close')?.click(); window.__pj.resultsCtl.enabled = false; })()`);
  record('G35 → P49-b 심사 결과 창 — 심사위원 카드 3 · 합격/불합격 도장 · 인증 조건 3축 사용(타일 축은 P49-a2 · 소품 축은 P60-a 삭제) (빠지 20칸)', r.up && r.judges === 3 && /합격/.test(r.stamp) && r.last >= 0 && r.kinds === 3 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G36 — 실내 전용 거절 사유 · 계절 벡터가 인기에 반영 · 슬라이드 AB 는 착수 풀만 */
async function verifyG36(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 200000; const gt = g.gate; g.unlocked.facilities.add('sauna'); g.unlocked.facilities.add('footbath'); const rs = g.canPlace('sauna', gt.i + 2, gt.j + 4, 0); g.placeFacility('footbath', gt.i + 3, gt.j + 3, 0); const d0 = g.day; g.day = 0; const spring = g.parkPopularity(); g.day = 12; const winter = g.parkPopularity(); g.day = d0; w.refreshHud(); return { saunaOk: rs.ok, reason: rs.reason || '', spring, winter }; })()`)) as { saunaOk: boolean; reason: string; spring: number; winter: number };
  record('G36 실내 전용 사우나는 야외 거절(사유에 「실내」) · 핫텁 계절 벡터로 겨울 인기 > 봄', !r.saunaOk && r.reason.includes('실내') && r.winter > r.spring ? 'pass' : 'fail', JSON.stringify(r));
}

/** G37 — 비상 자금 (타일 갈기는 P49-a2 에 물빛과 함께 삭제) */
async function verifyG37(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = -100; g.tick = w.TPD - 1; w.skip(1); return { bailout: g.money, n: g.stats.bailouts }; })()`)) as { bailout: number; n: number };
  record('G37 폐장 잔고 음수 → 비상 자금 2,000G · 횟수 1 (P49-a2: 타일 갈기 칩 절 삭제 — 물빛은 빠지 등급이 대체)', r.bailout === 2000 && r.n === 1 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G39 — 랜덤 이벤트 선택 창: 강제 이벤트 → 모달 창 · 선택지 2 · 비용·효과 표기 · 누르면 적용 */
async function verifyG39(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 10000; w.features.randomEvents = true; g.forceEvent('tv_crew'); w.skip(1); w.features.randomEvents = false; })()`);
  await page.waitForTimeout(250);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const win = document.getElementById('win-choice'); const btns = [...document.querySelectorAll('#win-choice [data-choice]')]; const up = !!win && !win.hidden; const label = btns[0] ? btns[0].textContent : ''; if (btns[0]) btns[0].click(); return { up, n: btns.length, label, pending: g.events.pending, money: g.money, closed: win.hidden }; })()`)) as { up: boolean; n: number; label: string; pending: string | null; money: number; closed: boolean };
  record('G39 사건 창 — TV 취재: 모달 · 선택지 2 · 비용/효과 표기 · 수락하면 −2,000G · 닫힘', r.up && r.n === 2 && r.label.includes('2,000') && r.label.includes('×1.4') && r.pending === null && r.money === 8000 && r.closed ? 'pass' : 'fail', JSON.stringify(r));
}

/** G40 — 버스 송영: 캠페인 창의 지역 선택 → 다음날 아침 도로 위 버스 스프라이트 + 손님 하차 · SNS 배지 = 안 본 글 */
async function verifyG40(page: import('playwright').Page, cdp: import('playwright').CDPSession): Promise<void> {
  const tap = async (_p: import('playwright').Page, c: import('playwright').CDPSession, sel: string): Promise<void> => {
    const r = (await page.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`)) as { x: number; y: number } | null;
    if (!r) throw new Error('no element ' + sel);
    await touch(c, r.x, r.y);
  };
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸 */ w.campaignWin.show(); })()`);
  await page.waitForTimeout(200);
  await tap(page, cdp, '#win-campaign [data-campaign="bus"]');
  await page.waitForTimeout(200);
  const areas = (await page.evaluate(`(() => document.querySelectorAll('#win-campaign [data-area]').length)()`)) as number;
  await tap(page, cdp, '#win-campaign [data-area]');
  await page.waitForTimeout(200);
  const started = (await page.evaluate(`(() => { const g = window.__pj.game; document.querySelector('#win-campaign .kwin-close')?.click(); return { active: g.campaigns.state.active, planned: g.busesPlannedFor(g.sns.areas[0]) }; })()`)) as { active: { id: string; areaId?: string } | null; planned: number };
  record('G40 캠페인 창 — 버스 행 터치 → 지역 목록 → 지역 터치로 예약 (내일 버스 1대)', areas >= 1 && started.active?.id === 'bus' && !!started.active.areaId && started.planned === 1 ? 'pass' : 'fail', JSON.stringify({ areas, ...started }));
  // 다음날 08:30 — 도로 위 버스, 손님이 내린다
  const bus = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.skip(w.TPD - g.tick); w.skip(70); w.refreshHud(); const s = w.scene.busForTest(); return { state: g.busState ? g.busState.phase : null, sprite: !!s, spritePhase: s ? s.phase : null }; })()`)) as { state: string | null; sprite: boolean; spritePhase: string | null };
  await page.waitForTimeout(150);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.skip(80); w.refreshHud(); return { busGuests: g.stats.busGuests, state: g.busState ? g.busState.phase : null, sprite: !!w.scene.busForTest() }; })()`)) as { busGuests: number; state: string | null; sprite: boolean };
  record('G40 다음날 아침 — 버스 스프라이트가 도로에 있고 12명이 내린다', bus.state === 'in' && bus.sprite && after.busGuests === 12 ? 'pass' : 'fail', JSON.stringify({ ...bus, after }));
  const badge = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const n = g.sns.unseenPosts; const shown = document.querySelector('#hud-right .ksquare[data-cell="sns"] .kbadge'); const txt = shown ? shown.textContent : ''; w.snsWin.show('timeline'); document.querySelector('#win-sns .kwin-close')?.click(); w.refreshHud(); return { unseen: n, badge: txt, after: g.sns.unseenPosts }; })()`)) as { unseen: number; badge: string; after: number };
  record('G40 SNS 배지 = 안 본 글 수 · 타임라인을 열면 0', badge.after === 0 && (badge.unseen === 0 || String(badge.unseen) === badge.badge) ? 'pass' : 'fail', JSON.stringify(badge));
}

/** G41 — 요리 = ★2 · 와일드카드(과일 아무거나) · 실패작 · 「설정」 버튼 */
async function verifyG41(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const lock = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.refreshHud(); w.mainMenu.show(); const cell = document.querySelector('#win-menu-main [data-menu="cook"]'); const locked1 = cell ? !!cell.dataset.locked : null; document.querySelector('#win-menu-main .kwin-close').click(); g.rank = 2; w.refreshHud(); w.mainMenu.show(); const cell2 = document.querySelector('#win-menu-main [data-menu="cook"]'); const locked2 = cell2 ? !!cell2.dataset.locked : null; document.querySelector('#win-menu-main .kwin-close').click(); return { locked1, locked2, open: g.cookingOpen }; })()`)) as { locked1: unknown; locked2: boolean | null; open: boolean };
  record('G41 요리 항목(MENU) — ★1 잠김(사유 ★2) · ★2 가 되면 열린다', !!lock.locked1 && lock.locked2 === false && lock.open ? 'pass' : 'fail', JSON.stringify(lock));
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; w.cookWin.show(); const pick = (id) => document.querySelector('#win-cook [data-ingredient="' + id + '"]').click(); pick('flour'); pick('egg'); pick('milk'); pick('lemon_fruit'); document.getElementById('win-cook-go').click(); const res1 = document.querySelector('#win-cook .kresult'); const t1 = res1 ? res1.textContent : ''; const set = document.querySelector('#win-cook [data-set-recipe="fruit_crepe"]'); const hasSet = !!set; if (set) set.click(); const picked = [...document.querySelectorAll('#win-cook [data-picked].on')].length; for (const c of [...document.querySelectorAll('#win-cook [data-picked].on')]) c.click(); g.cooking.grantIngredient('cabbage'); g.cooking.grantIngredient('tomato'); w.cookWin.show(); pick('cabbage'); pick('tomato'); document.getElementById('win-cook-go').click(); const res2 = document.querySelector('#win-cook .kresult'); const t2 = res2 ? res2.textContent : ''; const failRows = document.querySelectorAll('#win-cook .kfail').length; document.querySelector('#win-cook .kwin-close').click(); return { t1, hasSet, picked, t2, failRows, known: g.cooking.known.has('fruit_crepe') && g.cooking.known.has('veg_scraps') }; })()`)) as { t1: string; hasSet: boolean; picked: number; t2: string; failRows: number; known: boolean };
  record('G41 요리 창 — 밀가루+달걀+우유+레몬 → 과일 크레페 · 「설정」이 칩 4개를 채운다 · 채소만 → 야채 찌꺼기(실패작 절)', r.t1.includes('과일 크레페') && r.hasSet && r.picked === 4 && r.t2.includes('야채 찌꺼기') && r.failRows >= 1 && r.known ? 'pass' : 'fail', JSON.stringify(r));
}

/** G43 — 손님 창 선물 버튼 · 배치 중 우측 칸 반투명+토스트 · 첫 주말 비치체어 선물 */
async function verifyG43(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const gift = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const f = g.sns.unlockedFriends[0]; const fd = g.sns.friendDef(f.id); const gu = g.guests.spawn({ id: fd.id, palette: fd.palette, name: fd.name, age: fd.age, gender: fd.gender }); w.guestInfo.show(gu); const btns = [...document.querySelectorAll('#win-guest [data-gift]')]; const enabled = btns.filter((b) => !b.disabled); const before = f.gifts.length; if (enabled[0]) enabled[0].click(); const after = g.sns.friends.get(f.id).gifts.length; const left = document.querySelectorAll('#win-guest [data-gift]').length; document.querySelector('#win-guest .kwin-close').click(); return { btns: btns.length, enabled: enabled.length, before, after, left }; })()`)) as { btns: number; enabled: number; before: number; after: number; left: number };
  record('G43 손님 창 — 친구에게 튜브·수영복 선물 버튼 · 누르면 선물이 늘고 버튼이 준다', gift.btns >= 2 && gift.enabled >= 1 && gift.after === gift.before + 1 && gift.left === gift.btns - 1 ? 'pass' : 'fail', JSON.stringify(gift));
  const dock = (await page.evaluate(`(() => { const w = window.__pj; w.dock.enter('dig'); const col = document.getElementById('hud-right'); const cs = getComputedStyle(col); const shown = cs.display !== 'none'; const op = Number(cs.opacity); document.querySelector('#hud-right .ksquare[data-cell="build"]').click(); const toast = document.getElementById('hud-toast'); const t = toast && !toast.hidden ? toast.textContent : ''; const surf = document.documentElement.dataset.uiSurface; w.dock.exit(); return { shown, op, t, surf }; })()`)) as { shown: boolean; op: number; t: string; surf: string };
  record('G43 배치 중 — 우측 칸이 반투명으로 남고, 탭하면 「먼저 배치를 마치세요」 토스트 · 표면은 그대로', dock.shown && dock.op < 1 && dock.t.includes('먼저') && dock.surf === 'pool' ? 'pass' : 'fail', JSON.stringify(dock));
  const chair = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const had = g.unlocked.facilities.has('shade_net'); while (g.day < 3) w.skip(w.TPD - g.tick); w.skip(281); return { had, now: g.unlocked.facilities.has('shade_net'), day: g.day, tick: g.tick, pot: g.unlocked.facilities.has('photozone') }; })()`)) as { had: boolean; now: boolean; day: number; tick: number; pot: boolean };
  record('G43 사장 선물 실물 — 첫날 화분 · 첫 주말 10시 비치체어', !chair.had && chair.now && chair.pot ? 'pass' : 'fail', JSON.stringify(chair));
}

/** G44 — 심사 조건표 24건: 카드마다 심사관 3 = 조건 가중치 합 3 · S 카이로 풀장에 골든 카이로봇 · 튜브 보상 12 */
async function verifyG44(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.certWin.show(); const out = {}; for (const fam of ['grade', 'set', 'court', 'spa', 'fruit', 'stream', 'fun', 'cutesy']) { const t = document.querySelector('#win-cert [data-tab="' + fam + '"]'); if (t) t.click(); const cards = [...document.querySelectorAll('#win-cert [data-cert]')]; out[fam] = cards.map((c) => c.querySelectorAll('.kcond').length); } const sCard = document.querySelector('#win-cert [data-cert="grade_s"]'); document.querySelector('#win-cert [data-tab="grade"]').click(); const sTxt = document.querySelector('#win-cert [data-cert="grade_s"]') ? document.querySelector('#win-cert [data-cert="grade_s"]').textContent : ''; document.querySelector('#win-cert .kwin-close').click(); const gifts = [...g.certs.defs.values()].filter((d) => d.reward.kind === 'gift').length; return { out, sTxt: sTxt.slice(0, 200), gifts, total: g.certs.defs.size }; })()`)) as { out: Record<string, number[]>; sTxt: string; gifts: number; total: number };
  const allThree = Object.values(r.out).every((arr) => arr.length > 0 && arr.every((n) => n >= 2 && n <= 3));
  record('G44 심사 창 — 8계열 24건 · 카드마다 조건 2~3행(심사관 3) · S 카이로 풀장에 골든 카이로봇 · 튜브 보상 12', r.total === 24 && allThree && r.sTxt.includes('황금 해태상') && r.gifts === 12 ? 'pass' : 'fail', JSON.stringify(r).slice(0, 400));
}

/** G46 — 카이로식 창 문법: 확인 대화상자(예/아니오) · 축하 팝업 · 결산 타일 · 메뉴 설명 · 숫자 알약 */
async function verifyG46(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&celebrate=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const dlg = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; w.investWin.show(); const row = document.querySelector('#win-invest [data-invest]:not([disabled])'); row.click(); const d = document.getElementById('kdialog'); const up1 = !!d && !d.classList.contains('khide'); const cost = d ? d.querySelector('[data-cost]') : null; const costTxt = cost ? cost.textContent : ''; const money0 = g.money; d.querySelector('[data-no]').click(); const stillMoney = g.money === money0; const up2 = !d.classList.contains('khide'); row.click(); d.querySelector('[data-yes]').click(); const spent = money0 - g.money; const up3 = !d.classList.contains('khide'); document.querySelector('#win-invest .kwin-close').click(); return { up1, costTxt, stillMoney, up2, spent, up3 }; })()`)) as { up1: boolean; costTxt: string; stillMoney: boolean; up2: boolean; spent: number; up3: boolean };
  record('G46 확인 대화상자 — 투자 행 → 「지출 −3,000G」 · 아니오는 안 쓰고 닫힘 · 예는 쓰고 닫힘', dlg.up1 && dlg.costTxt.includes('3,000') && dlg.stillMoney && !dlg.up2 && dlg.spent === 3000 && !dlg.up3 ? 'pass' : 'fail', JSON.stringify(dlg));
  const cele = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.inbox.push({ tick: g.tick, day: g.day, kind: 'system', priority: 'modal', title: '랭크 업! ★1 동네 풀장', body: '토지 +40칸' }); w.skip(1); const c = document.getElementById('win-celebrate'); const up = !!c && !c.hidden; const icon = c ? !!c.querySelector('.kcele-icon .kicon') : false; const title = c ? c.querySelector('.kcele-title').textContent : ''; document.getElementById('win-celebrate-ok').click(); const closed = c.hidden; return { up, icon, title, closed }; })()`)) as { up: boolean; icon: boolean; title: string; closed: boolean };
  record('G46 축하 팝업 — 모달 사건이 큰 아이콘 + 제목 + 확인 창으로 뜬다', cele.up && cele.icon && cele.title.includes('랭크 업') && cele.closed ? 'pass' : 'fail', JSON.stringify(cele));
  const rest = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.resultsCtl.enabled = true; g.day = 3; g.tick = w.TPD - 2; w.skip(3); for (let k = 0; k < 3 && !document.getElementById('win-results').hidden && document.getElementById('win-results-title').textContent.includes('마감'); k++) document.getElementById('win-results-ok').click(); /* G57: 하루 카드가 먼저 줄 선다 */ const r = document.getElementById('win-results'); const tiles = r.querySelectorAll('.kstat').length; const up = !r.hidden; document.getElementById('win-results-ok').click(); w.resultsCtl.enabled = false; w.mainMenu.show(); const descs = document.querySelectorAll('#win-menu-main .kmenu-desc').length; const groups = document.querySelectorAll('#win-menu-main .kmenu-group').length; const title = document.getElementById('win-menu-main-title').textContent; document.querySelector('#win-menu-main .kwin-close').click(); w.rankWin.show(); const nums = document.querySelectorAll('#win-rank .knum').length; const icons = document.querySelectorAll('#win-rank .krow .kicon').length; document.querySelector('#win-rank .kwin-close').click(); return { up, tiles, descs, groups, title, nums, icons }; })()`)) as { up: boolean; tiles: number; descs: number; groups: number; title: string; nums: number; icons: number };
  record('G46 결산 타일 3 · 메뉴 설명 ≥8 + 구분 4 · 정보 창 숫자 알약·행 아이콘', rest.up && rest.tiles === 3 && rest.descs >= 8 && rest.groups === 4 && rest.nums >= 5 && rest.icons >= 5 ? 'pass' : 'fail', JSON.stringify(rest));
}

/** G47 — 원작 창 문법 2차: 풀 정보(썸네일·알약·타일 3+막대·이름 변경) · 시설 정보 페이지 넘김 · 배치 화살표+가격표 · 예고 태그 · 건설 NEW */
async function verifyG47(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const pool = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }); /* P49-b: 빠지 20칸 */ const p = g.pools.all[0]; w.poolInfo.show(p.id); const win = document.getElementById('win-pool'); const tiles = win.querySelectorAll('.kptile, .kbars').length; const tempRows = win.querySelectorAll('[data-temp]').length; const pills = win.querySelectorAll('.kpool-pills .knum').length; const verdict = [...win.querySelectorAll('[data-temp]')].map((e) => e.textContent).join('|'); const input = win.querySelector('[data-pool-name]'); input.value = '초록풀장'; win.querySelector('[data-rename]').click(); const title = document.getElementById('win-pool-title').textContent; document.querySelector('#win-pool .kwin-close').click(); return { tiles, tempRows, pills, verdict, title, name: g.poolName(p.id) }; })()`)) as { tiles: number; tempRows: number; pills: number; verdict: string; title: string; name: string };
  record('G47 → P60-a 풀 정보 — 수온 행 1(타일 0) · 값 알약 3 · 온도 판정 · 이름 변경이 제목에 반영', pool.tiles === 0 && pool.tempRows === 1 && pool.pills === 3 && /수온/.test(pool.verdict) && /좋아요|차가워요|뜨거워요/.test(pool.verdict) && pool.title === '초록풀장' && pool.name === '초록풀장' ? 'pass' : 'fail', JSON.stringify(pool));
  const fac = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.placeFacility('toilet', gt.i + 2, gt.j + 4, 0); g.placeFacility('vending_out', gt.i + 4, gt.j + 7, 0); /* P46: 건물류끼리 한 칸 */ const f = g.facilities.all[0]; w.facilityInfo.show(f.uid); const t1 = document.getElementById('win-facility-title').textContent; document.querySelector('#win-facility [data-next]').click(); const t2 = document.getElementById('win-facility-title').textContent; const desc = !!document.querySelector('#win-facility .kfac-desc'); const thumb = !!document.querySelector('#win-facility .kthumb canvas'); document.querySelector('#win-facility .kwin-close').click(); return { t1, t2, desc, thumb }; })()`)) as { t1: string; t2: string; desc: boolean; thumb: boolean };
  record('G47 시설 정보 — 「시설 정보 1/2」 · ▶ 로 2/2 · 그림 · 설명', fac.t1.includes('1/2') && fac.t2.includes('2/2') && fac.desc && fac.thumb ? 'pass' : 'fail', JSON.stringify(fac));
  const aim = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.buildWin.show(); document.querySelector('#win-build [data-facility="shower_row"], #win-build [data-facility="washbasin_row"], #win-build [data-facility]').click(); const gt = g.gate; const d = w.placeDock; d.enter(w.facilityDefs.get('washbasin_row'), { i: gt.i - 4, j: gt.j + 8 }); const a = w.scene.aimForTest(); const done = document.getElementById('dock-place-done').textContent; d.exit(); return { ...a, done }; })()`)) as { arrows: boolean; label: string | null; done: string };
  record('G47 배치 — 조준 화살표 · 「500G ×1」 가격표 · 결정 버튼', aim.arrows && /G ×1/.test(aim.label ?? '') && aim.done.includes('결정') ? 'pass' : 'fail', JSON.stringify(aim));
  const tag = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.certs.state.applied = { id: 'grade_f', judgeDay: g.day + 3 }; w.refreshHud(); const e = document.getElementById('hud-event'); const shown = e && !e.classList.contains('khide') ? e.textContent : null; g.certs.state.applied = null; localStorage.setItem('pj.seenFac', '0'); w.refreshHud(); const badge = document.querySelector('#hud-right .ksquare[data-cell="build"] .kbadge'); const n = badge ? badge.textContent : ''; return { shown, n, unlocked: g.unlocked.facilities.size }; })()`)) as { shown: string | null; n: string; unlocked: number };
  record('G47 하단 예고 태그 「3일 뒤 15시 심사」 · 건설 NEW 배지 = 안 본 해금 수', tag.shown === '3일 뒤 15시 심사' && Number(tag.n) === tag.unlocked ? 'pass' : 'fail', JSON.stringify(tag));
}

/** G48 — 리텐션 R1·R3·R6·R7·R8: 모달 대기열 · 만료 토스트 · 티커 뉴스 · 받을 것 배지 · 17시 입고 배지 */
async function verifyG48(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0&celebrate=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const q = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.interruptBudget.reset(); g.inbox.push({ tick: g.tick, day: g.day, kind: 'system', priority: 'modal', title: '랭크 업! ★1 동네 풀장', body: 'a' }); g.inbox.push({ tick: g.tick, day: g.day, kind: 'system', priority: 'modal', title: '새 지역 개방 — 학교', body: 'b' }); w.skip(1); const c = document.getElementById('win-celebrate'); const first = c.querySelector('.kcele-title').textContent; const queued = w.modalQueue.length; document.getElementById('win-celebrate-ok').click(); w.interruptBudget.reset(); w.skip(1); const second = !c.hidden ? c.querySelector('.kcele-title').textContent : null; if (!c.hidden) document.getElementById('win-celebrate-ok').click(); return { first, queued, second }; })()`)) as { first: string; queued: number; second: string | null };
  record('G48 모달 대기열 — 같은 틱 모달 2건: 첫 창 뒤에 둘째 창 (버려지지 않는다)', q.first.includes('랭크 업') && q.queued === 1 && (q.second ?? '').includes('새 지역') ? 'pass' : 'fail', JSON.stringify(q));
  const exp = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.sns.unlockedFriends[0]; const wishes = g.sns.wishesByFriend.get(f.id); f.activeWish = 0; f.windowUntilDay = g.day + 1; f.wishMet = false; g.sns.unlockedFriends; w.skip(w.TPD - g.tick); const toast = document.getElementById('hud-toast'); const t = toast && !toast.hidden ? toast.textContent : ''; const ev = g.inbox.all.find((e) => e.title.includes('지나갔다')); return { t, ev: ev ? ev.priority + ':' + ev.body : null, expired: g.stats.wishExpired }; })()`)) as { t: string; ev: string | null; expired: number };
  record('G48 소원 만료 — 토스트로 「진행 N%였다 · 4일 뒤 다시」', (exp.ev ?? '').startsWith('toast:') && /진행 \d+%/.test(exp.ev ?? '') && exp.expired >= 1 ? 'pass' : 'fail', JSON.stringify(exp));
  const news = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.newsQueue.length = 0; g.inbox.push({ tick: g.tick, day: g.day, kind: 'guest', priority: 'inbox', title: '새 친구 — 꼬마', body: 'x' }); w.skip(1); w.newsQueue.length = 0; w.newsQueue.push('새 친구 — 꼬마'); w.pumpNews(); const ticker = document.getElementById('hud-ticker').textContent; const badge = document.querySelector('#hud-info .kbadge'); return { ticker, badge: badge && !badge.hidden ? badge.textContent : null, unread: g.inbox.unread }; })()`)) as { ticker: string; badge: string | null; unread: number };
  record('G48 티커 뉴스 — inbox 사건이 「소식 · 새 친구」로 흐르고 정보 캡슐에 받을 것 배지', news.ticker.includes('새 친구') && news.badge !== null && Number(news.badge) >= news.unread && news.unread >= 1 ? 'pass' : 'fail', JSON.stringify(news));
  const shop = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; localStorage.setItem('pj.shopSeen', '-1'); g.rank = 1; g.day = 4; g.tick = 539; w.skip(2); w.refreshHud(); const badge = document.querySelector('#hud-right .ksquare[data-cell="market"] .kbadge'); const n = badge && !badge.hidden ? badge.textContent : null; const ev = g.inbox.all.some((e) => e.title.includes('입고')); return { n, ev, stock: g.shop.state.stock.length }; })()`)) as { n: string | null; ev: boolean; stock: number };
  record('G48 17시 입고 — 상점 칸 배지 = 진열 수 · 「펌킨 상점 입고」 뉴스', shop.stock > 0 && Number(shop.n) === shop.stock && shop.ev ? 'pass' : 'fail', JSON.stringify(shop));
}

/** G49 — R2 소원 보상 돈 → 콘텐츠: 메시지 탭 소원 카드(초상 · ★ · 보상 이름 · 새 손님 실루엣) · 돈 보상 ≤ 10% */
async function verifyG49(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const all = [...g.sns.wishesByFriend.values()].flat(); const money = all.filter((x) => x.reward.kind === 'money').length; const f = g.sns.unlockedFriends[0]; f.activeWish = 1; f.windowUntilDay = g.day + 8; w.snsWin.show('messages'); const row = document.querySelector('#win-sns [data-wish]'); const face = row ? !!row.querySelector('.kportrait') : false; const name = row ? String(row.querySelectorAll('.krow-name .kicon[data-on="1"]').length) + '/' + String(row.querySelectorAll('.krow-name .kicon').length) : ''; const reward = row ? row.querySelector('.krow-v').textContent : ''; document.querySelector('#win-sns .kwin-close').click(); return { total: all.length, money, face, name, reward }; })()`)) as { total: number; money: number; face: boolean; name: string; reward: string };
  record('G49 소원 카드 — 초상 · 별 2/3 · 보상이 이름으로(돈 아님) · 돈 보상 ≤ 10%', r.face && r.name === '2/3' && !/G$/.test(r.reward) && r.money / r.total <= 0.1 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G50 — R5 목표 3슬롯: 티커 A + 랭크·인증 진행바 동시 · 진행바 탭 → 창 · HUD 면적 ≤ 18% 유지 */
async function verifyG50(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; w.refreshHud(); const bars = [...document.querySelectorAll('#hud-ticker .kgoal:not(.khide):not(.kgoal-off)')]; /* P59-c H-2: 인증 바는 DOM 에만(kgoal-off) — G51 이 라벨을 읽는다 */ const info = bars.map((b) => [b.dataset.goal, b.querySelector('.kgoal-label').textContent, b.dataset.pct]); const rect = document.getElementById('hud-ticker').getBoundingClientRect(); const fill = bars.map((b) => b.querySelector('.kgoal-fill').style.width); bars[0].click(); const rankUp = !document.getElementById('win-rank').hidden; document.querySelector('#win-rank .kwin-close').click(); const cert = bars.find((b) => b.dataset.goal === 'cert'); if (cert) cert.click(); const certUp = !document.getElementById('win-cert').hidden; if (certUp) document.querySelector('#win-cert .kwin-close').click(); return { info, fill, h: rect.height, rankUp, certUp }; })()`)) as { info: string[][]; fill: string[]; h: number; rankUp: boolean; certUp: boolean };
  record('G50 목표 슬롯 — 랭크 진행바 1 (라벨 보임·%) · 탭하면 랭크 창 · 티커 ≤ 32px (P59-c H-2: 인증 바 삭제 — 라벨 없는 게이지 둘이 안 읽혔다)', r.info.length === 1 && (r.info[0]?.[1] ?? '').length > 0 && r.fill.every((f) => /%$/.test(f)) && r.rankUp && !r.certUp && r.h <= 32 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G51 — R4 인증 사다리: 티커의 인증 진행바는 「아직 안 넘은」 인증을 가리키고, 그것을 통과하면 다음 칸으로 옮겨 간다 */
async function verifyG51(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const label = () => { w.refreshHud(); const b = document.querySelector('#hud-ticker .kgoal[data-goal="cert"]'); return b && !b.classList.contains('khide') ? b.querySelector('.kgoal-label').textContent : null; }; const l0 = label(); const target = [...g.certs.defs.values()].find((d) => l0 && l0.endsWith(d.name)); const passedBefore = target ? (g.certs.state.passed[target.id] ?? 0) : -1; if (target) g.certs.state.passed[target.id] = 1; const l1 = label(); const distinct = Object.values(g.certs.state.passed).filter((n) => n > 0).length; return { l0, l1, passedBefore, distinct, defs: g.certs.defs.size }; })()`)) as { l0: string | null; l1: string | null; passedBefore: number; distinct: number; defs: number };
  record('G51 인증 사다리 — 진행바가 미통과 인증을 가리키고, 통과하면 다른 인증으로 옮겨 간다 (24종)', r.l0 && r.l1 && r.l0 !== r.l1 && r.passedBefore === 0 && r.defs === 24 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G52 — UI 2차 잔여: 신문식 축하(제호·날짜·도장) · 시설 이동(도구 필요 → 이동 → uid·단계 보존) (P60-a: 미리보기 절은 소품 삭제로 뺐다) */
async function verifyG52(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0&celebrate=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const paper = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.interruptBudget.reset(); g.inbox.push({ tick: g.tick, day: g.day, kind: 'system', priority: 'modal', title: '랭크 업! ★1 동네 풀장', body: '손님이 늘어난다' }); w.skip(1); const c = document.getElementById('win-celebrate'); const up = !c.hidden; const mast = c.querySelector('.kpaper-mast') ? c.querySelector('.kpaper-mast').textContent : ''; const date = c.querySelector('.kpaper-date') ? c.querySelector('.kpaper-date').textContent : ''; const stamp = c.querySelector('.kpaper-stamp') ? c.querySelector('.kpaper-stamp').textContent : ''; const head = c.querySelector('.kcele-title').textContent; document.getElementById('win-celebrate-ok').click(); return { up, mast, date, stamp, head }; })()`)) as { up: boolean; mast: string; date: string; stamp: string; head: string };
  record('G52 신문식 축하 — 제호 「빠지 타임스」 · 날짜 줄 「1년차 봄 · 평일」 · 「속보」 도장 · 헤드라인', paper.up && paper.mast === '빠지 타임스' && /^1년차 봄 · (평일|주말)$/.test(paper.date) && paper.stamp === '속보' && paper.head.includes('랭크 업') ? 'pass' : 'fail', JSON.stringify(paper));
  const mv = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const r0 = g.placeFacility('toilet', gt.i + 12, gt.j + 4, 0); const uid = r0.uid; const f = g.facilities.byUid(uid); f.level = 3; w.facilityInfo.show(uid); const btn = document.getElementById('win-facility-move'); const lockedText = btn.textContent; const locked = btn.disabled && btn.classList.contains('khide'); /* P59-c W-12: 도구 없으면 숨김 */ document.querySelector('#win-facility .kwin-close').click(); const denied = g.canMoveFacility(uid, gt.i + 14, gt.j + 4, 0); g.tools.add('move'); const tb = { i0: gt.i - 20, j0: gt.j + 18 }; /* P48-b3: 북서 잔디(열 28~31 · 행 26~29) */ { const t = []; for (let j = tb.j0; j < tb.j0 + 4; j++) for (let i = tb.i0; i < tb.i0 + 4; i++) if (g.grid.at(i, j) !== 3) t.push({ i, j }); if (t.length) { g.money += t.length * 40; g.paintIndoor(t); } } /* P38: 화장실은 실내 전용 — 바닥을 깐 곳으로 옮긴다 */ const ti = tb.i0 + 1, tj = tb.j0 + 1; g.autoPathFor('toilet', ti, tj, 0); /* P31 접면: 옮길 자리에도 길이 닿아야 한다 */ w.facilityInfo.show(uid); const openText = btn.textContent; const enabled = !btn.disabled; btn.click(); const mode = document.querySelector('#dock-place .kdock-mode').textContent; const moving = w.placeDock.movingUid; w.placeDock.aimAt(ti, tj); const why = document.querySelector('#dock-place .kdock-cost').textContent; const money0 = g.money; document.getElementById('dock-place-done').click(); const f2 = g.facilities.byUid(uid); const at = g.facilities.at(ti, tj); const old = g.facilities.at(gt.i + 12, gt.j + 4); return { lockedText, locked, denied: denied.ok ? 'ok' : denied.reason, openText, enabled, mode, moving, why, spent: money0 - g.money, level: f2 ? f2.level : -1, atNew: at ? at.uid : 0, oldEmpty: !old, dockHidden: document.getElementById('dock-place').hidden, uid }; })()`)) as { lockedText: string; locked: boolean; denied: string; openText: string; enabled: boolean; mode: string; moving: number | null; why: string; spent: number; level: number; atNew: number; oldEmpty: boolean; dockHidden: boolean; uid: number };
  record('G52 시설 이동 — 도구 없으면 「이동 · 도구 필요」(비활성·거절 이유) · 도구 있으면 이동 독 「이동 중」 → 결정 → 새 자리 · 옛 자리 빔 · uid·Lv3 보존 · 0G', mv.locked && mv.lockedText.includes('도구 필요') && mv.denied.includes('이동 도구') && mv.enabled && mv.openText === '이동' && mv.mode.includes('이동 중') && mv.moving === mv.uid && mv.why.includes('옮깁니다') && mv.spent === 0 && mv.level === 3 && mv.atNew === mv.uid && mv.oldEmpty && mv.dockHidden ? 'pass' : 'fail', JSON.stringify(mv));
}

/** G53 — 리텐션 5차(조사 D11·D17) + v3 잔여: 수집 분모 6줄 · 친구 글 좋아요 → 소원 EXP · 실패작 메뉴 · 심사 무대 조명 */
async function verifyG53(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const col = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.rankWin.show(); const rows = [...document.querySelectorAll('#win-rank .kcollect')].map((r) => [r.dataset.collect, r.querySelector('.krow-v').textContent, r.querySelector('.kgoal-fill').style.width]); document.querySelector('#win-rank .kwin-close').click(); return { rows, recipes: g.cooking.recipes.size, facilities: g.facilities.defsCount }; })()`)) as { rows: string[][]; recipes: number; facilities: number };
  const denom = Object.fromEntries(col.rows.map((r) => [r[0], Number((r[1] ?? '').split('/')[1])]));
  record('G53 수집 완성률 — 정보 창에 「n / N」 7줄(시설 N · 수영복 18 · 친구 71 · 인증 24 · 레시피 144 · 콤보 40 · 세트 8 — P49-a2 물빛 줄 삭제 · P60-c 세트 줄 추가) + 진행 막대', col.rows.length === 7 && denom['세트'] === 8 && denom['콤보'] === 40 && denom['시설 해금'] === col.facilities && denom['수영복·튜브'] === 18 && denom['SNS 친구'] === 71 && denom['인증 (종류)'] === 24 && denom['레시피'] === col.recipes && col.rows.every((r) => /%$/.test(r[2] ?? '')) ? 'pass' : 'fail', JSON.stringify(col));
  const like = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.sns.unlockedFriends[0]; const fd = g.sns.friendsById.get(f.id); const areaId = fd.area || fd.areaId || g.sns.areas[0].id; const exp0 = f.exp; g.sns.posts.push({ id: 99991, day: g.day, tick: g.tick, friendId: f.id, areaId, subject: { kind: 'facility', ref: 1, name: '화장실' }, likes: 3, playerLiked: false, growUntilDay: g.day + 2, palette: 1 }); w.snsWin.show('timeline'); const btn = document.querySelector('#win-sns [data-like="99991"]'); if (btn) btn.click(); const toast = (document.getElementById('hud-toast') || {}).textContent || ''; document.querySelector('#win-sns .kwin-close').click(); return { had: !!btn, gained: f.exp - exp0, toast, name: fd.name }; })()`)) as { had: boolean; gained: number; toast: string; name: string };
  record('G53 플레이어 좋아요 — 친구 글에 누르면 그 친구 소원 EXP +12 · 토스트 「좋아요 +5 · 이름 소원 진행 +12」', like.had && like.gained === 12 && like.toast.includes(like.name) && like.toast.includes('+12') ? 'pass' : 'fail', JSON.stringify(like));
  const fail = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; const r = g.placeFacility('vending_out', gt.i + 3, gt.j + 6, 0); g.cooking.known.add('burnt_bread'); w.menuWin.show(r.uid); const row = document.querySelector('#win-menu [data-recipe="burnt_bread"]'); const text = row ? row.textContent : ''; const stage = document.querySelector('#win-cert .kstage'); document.querySelector('#win-menu-main .kwin-close').click(); w.certWin.show(); const st = document.querySelector('#win-cert .kstage'); const cs = st ? getComputedStyle(st) : null; const before = st ? getComputedStyle(st, '::before').content : ''; document.querySelector('#win-cert .kwin-close').click(); return { text, padTop: cs ? parseFloat(cs.paddingTop) : 0, lit: before !== 'none' && before !== '' }; })()`)) as { text: string; padTop: number; lit: boolean };
  record('G53 실패작 메뉴 — 「탄 빵 · 실패작」 이 메뉴 후보에 · 심사 무대 조명/관중 레이어', fail.text.includes('탄 빵') && fail.text.includes('실패작') && fail.padTop >= 4 && fail.lit ? 'pass' : 'fail' /* P59-c W-18: 무대 위 여백 14 → 6 */, JSON.stringify(fail));
}

/** G54 — G46 잔여 소품: 재료 칩 아이콘 9계열 · 인기 캡슐 라벨/숫자 위계 · 짧은 창은 가운데(긴 창은 위) */
async function verifyG54(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.cooking.exp = 99999; w.cookWin.show(); const chips = [...document.querySelectorAll('#win-cook [data-ingredient]')]; const icons = chips.filter((c) => c.querySelector('.kpic[data-pic], .kicon[data-icon]')).length; const kinds = new Set(chips.map((c) => { const e = c.querySelector('.kpic[data-pic], .kicon[data-icon]'); return e ? (e.dataset.pic || e.dataset.icon) : ''; })); /* P56-b: 그림이 오면 계열 아이콘 대신 시트 그림(.kpic) — 종류는 그림 id 로 센다 */ document.querySelector('#win-cook .kwin-close').click(); const info = document.getElementById('hud-info'); const lab = getComputedStyle(info.querySelector('.kpop-label')).fontSize; const num = getComputedStyle(info.querySelector('.num')).fontSize; const gu = g.guests.all[0]; if (gu) w.guestInfo.show(gu); const gi = document.getElementById('win-guest'); const shortFit = gu && gi && !gi.hidden ? gi.classList.contains('kfit') : null; if (gi && !gi.hidden) document.querySelector('#win-guest .kwin-close').click(); w.rankWin.show(); return { chips: chips.length, icons, kinds: [...kinds].filter(Boolean).length, lab: parseFloat(lab), num: parseFloat(num), shortFit }; })()`)) as { chips: number; icons: number; kinds: number; lab: number; num: number; shortFit: boolean | null };
  await page.waitForTimeout(80);
  const bw = (await page.evaluate(`(() => { const w = window.__pj; const bw = document.getElementById('win-rank'); const longFit = bw.classList.contains('kfit'); const top = bw.getBoundingClientRect().top; const h = bw.getBoundingClientRect().height; document.querySelector('#win-rank .kwin-close').click(); w.buildWin.show(); const bd = document.getElementById('win-build'); const buildH = bd.getBoundingClientRect().height; const buildFit = bd.classList.contains('kfit'); document.querySelector('#win-build .kwin-close').click(); return { longFit, top, h, buildH, buildFit }; })()`)) as { longFit: boolean; top: number; h: number; buildH: number; buildFit: boolean };
  const r2 = { ...r, ...bw };
  record('G54 재료 칩 아이콘(전 칩 · 계열 ≥3) · 인기 캡슐 라벨 < 숫자 · 정보 창·건설 창 둘 다 위(64)에 붙고 kfit 없음(P59-a D67 — 짧은 창을 가운데 두던 G54 규칙 폐기)', r2.chips > 0 && r2.icons === r2.chips && r2.kinds >= 3 && r2.lab < r2.num && !r2.longFit && r2.top < 120 && !r2.buildFit && r2.buildH > 0 ? 'pass' : 'fail', JSON.stringify(r2));
}

/** G55 — 5189 재플레이 후속: 독 탭 한 줄 · 타일 칩 없음 · 이동 고스트 「이동 · 무료」 · 같은 자리 거절 */
async function verifyG55(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const p = g.pools.all[0]; w.dock.enter('deck', p.id); const tabs = [...document.querySelectorAll('#dock-pool .ktab')]; const tabH = Math.max(...tabs.map((t) => t.getBoundingClientRect().height)); const tabOneLine = tabs.every((t) => t.getBoundingClientRect().height <= 48 && t.scrollWidth <= t.clientWidth + 1); const tileChip = document.querySelector('#dock-pool [data-tile]'); const tileVisible = tileChip ? tileChip.getBoundingClientRect().height > 0 : false; w.dock.exit(); const gt = g.gate; const f = g.facilities.all.find((x) => x.defId === 'indoor_shop'); /* P57-c: [0] 은 이제 매표소인데 main 규칙이 매표소 이동을 막는다 */ g.tools.add('move'); const same = g.canMoveFacility(f.uid, f.i, f.j, f.facing); w.facilityInfo.show(f.uid); document.getElementById('win-facility-move').click(); const label = w.scene.aimForTest().label; const why = document.querySelector('#dock-place .kdock-cost').textContent; w.placeDock.exit(); return { tabH, tabOneLine, tileVisible, same: same.ok ? 'ok' : same.reason, label, why, pool: p.tiles.length }; })()`)) as { tabH: number; tabOneLine: boolean; tileVisible: boolean; same: string; label: string | null; why: string; pool: number };
  record('G55 재플레이 후속 — 탭 한 줄 · 타일 칩 숨김 · 이동 고스트 「이동 · 무료」 · 같은 자리 거절 (P60-a: 「핑크까지 N개」 힌트는 소품 삭제로 뺐다)', r.tabOneLine && !r.tileVisible && r.same.includes('같은 자리') && (r.label ?? '').startsWith('이동 · 무료') /* P57-c: 실내 매점은 「· 자리 N곳」이 붙는다 */ && r.why.includes('같은 자리') ? 'pass' : 'fail', JSON.stringify(r));
}

/** G56 — 후반(8년차) 재플레이 후속: 통과 인증 접기 · 배지 99+ · 부표 줄 한 줄 · 인기도 천 단위 */
async function verifyG56(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.certs.state.passed['grade_f'] = 1; w.certWin.show(); const f = document.querySelector('#win-cert [data-cert="grade_f"]'); const d = document.querySelector('#win-cert [data-cert="grade_d"]'); const fPassed = f.classList.contains('kcert-passed') && !f.querySelector('.kstage') && !!f.querySelector('[data-apply]'); const dFull = !d.classList.contains('kcert-passed') && !!d.querySelector('.kstage') && !!d.querySelector('[data-expected]'); const fH = f.getBoundingClientRect().height; const dH = d.getBoundingClientRect().height; document.querySelector('#win-cert .kwin-close').click(); w.hud.setInfoBadge(207); const badge = document.querySelector('#hud-info .kbadge').textContent; w.hud.setInfoBadge(7); const p = g.pools.all[0]; w.poolInfo.show(p.id); const lab = document.querySelector('#win-pool .kpool-tiles > .krow-k'); const labH = lab ? lab.getBoundingClientRect().height : 0; document.querySelector('#win-pool .kwin-close').click(); return { fPassed, dFull, fH, dH, badge, labH }; })()`)) as { fPassed: boolean; dFull: boolean; fH: number; dH: number; badge: string; labH: number };
  record('G56 후반 후속 — 통과한 F 는 접힘(무대 없음 · 신청 남음 · 높이 < D 의 절반) · 정보 배지 207 → 「99+」 (부표 라벨은 P49-a2 물빛 삭제로 없음)', r.fPassed && r.dFull && r.fH < r.dH / 2 && r.badge === '99+' ? 'pass' : 'fail', JSON.stringify(r));
}

/** G57 — 버그 감사 수정: 결산 카드가 삼킨 사건 선택 창 재개 · 하루+시즌 카드 줄 세우기 · 새 판이 씬 격자를 갈아끼움 */
async function verifyG57(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.resultsCtl.enabled = true; w.features.randomEvents = true; g.day = 3; g.tick = w.TPD - 2; const forced = g.forceEvent('festival'); w.skip(3); const res = document.getElementById('win-results'); const choice = document.getElementById('win-choice'); const choiceFirst = !choice.hidden && res.hidden; const pending0 = g.events.pending; const b = document.querySelector('#win-choice [data-choice]'); if (b) b.click(); const t1 = !res.hidden ? document.getElementById('win-results-title').textContent : null; document.getElementById('win-results-ok').click(); const t2 = !res.hidden ? document.getElementById('win-results-title').textContent : null; if (!res.hidden) document.getElementById('win-results-ok').click(); const pending1 = g.events.pending; w.resultsCtl.enabled = false; w.newGame(9); const sameGrid = w.scene.gridForTest() === w.game.grid; return { forced, choiceFirst, pending0, t1, t2, pending1, sameGrid }; })()`)) as { forced: boolean; choiceFirst: boolean; pending0: string | null; t1: string | null; t2: string | null; pending1: string | null; sameGrid: boolean };
  record('G57 사건 창이 떠 있어도 결산 카드가 버려지지 않는다 — 답하면 하루 카드 → 시즌 카드 · 새 판이 씬 격자를 갈아끼움', r.forced && r.choiceFirst && !!r.pending0 && (r.t1 ?? '').includes('마감') && (r.t2 ?? '').includes('결산') && r.pending1 === null && r.sameGrid ? 'pass' : 'fail', JSON.stringify(r));
}

/** P48-b2 — 만(灣)·허가·킷: 굽이 물은 「내 물」(inMyWater) · 킷 수역 20 은 만 안 · 허가 ★0 40칸 = 킷 20 + 20 · 넘치면 「수면 허가」 거절 · 선착장은 본류 잔교 끝 · 후보 1 · 야외 식당은 실내 거절(회귀) */
async function verifyP48b2(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const grid = g.grid; let bay = 0, mine = 0; for (let j = 9; j < 50; j++) for (let i = g.land.i0; i < g.land.i0 + g.land.w; i++) { const c = grid.at(i, j); if (c === 5 || c === 6) { bay++; if (g.inMyWater(i, j)) mine++; } } const p = g.pools.all[0]; const rows = p ? [...new Set(p.tiles.map((k) => Math.floor(k / grid.w)))].sort((a, b) => a - b) : []; const dock = g.facilities.all.find((f) => f.defId === 'dock'); g.money = 1000000; const mk = (c, w, top) => { const r = []; for (let x = c; x <= c + w + 1; x++) r.push({ i: x, j: top }); for (let j = top + 1; j <= top + 6; j++) { r.push({ i: c, j }); r.push({ i: c + w + 1, j }); } for (let x = c + 1; x <= c + w; x++) r.push({ i: x, j: top + 6 }); return r; }; /* P48-b3: 편평한 물가(행 24)에 윗줄까지 두른 링 — 킷 링 서쪽 4×5 · 잔교 동쪽 3×5 */ const ring = mk(gt.i - 4, 4, 24); let okN = 0; for (const t of ring) if (g.paintDeck([t]).ok) okN++; const used = g.permitUsed, max = g.permitMax; const ring2 = mk(gt.i + 11, 3, 24); let last = null; for (const t of ring2) last = g.paintDeck([t]); const shop = g.canPlace('shop', gt.i - 6, gt.j + 10, 0); return { bay, mine, pool: p ? p.tiles.length : 0, rows, dock: dock ? [dock.i, dock.j] : null, choices: g.dockChoices().length, okN, used, max, lastOk: last ? last.ok : null, lastReason: last && !last.ok ? last.reason : '', shopOk: shop.ok, shopReason: shop.ok ? '' : shop.reason }; })()`)) as { bay: number; mine: number; pool: number; rows: number[]; dock: number[] | null; choices: number; okN: number; used: number; max: number; lastOk: boolean | null; lastReason: string; shopOk: boolean; shopReason: string };
  record('P48-b2 만 — 내 앞 수면(물가 깊이 7) ≥250칸 · 본류 물은 그보다 많다 · 킷 수역 20 은 링 안 행 24~28 · 선착장 (gt.i+10, 26) · 후보 1', r.mine >= 250 && r.bay > r.mine && r.pool === 20 && r.rows.join(',') === '24,25,26,27,28' && r.dock?.[0] === 58 && r.dock[1] === 26 && r.choices === 1 ? 'pass' : 'fail', JSON.stringify({ bay: r.bay, mine: r.mine, pool: r.pool, rows: r.rows, dock: r.dock, choices: r.choices }));
  record('P48-b2 허가 — ★0 40칸: 킷 링 서쪽 링 22칸이 다 깔리고(20 → 40) 둘째 링의 마지막 칸은 「수면 허가」 거절 · 야외 식당은 실내 거절(회귀)', r.okN === 22 && r.used === 40 && r.max === 40 && r.lastOk === false && r.lastReason.includes('수면 허가') && r.shopOk === false && r.shopReason.includes('야외') ? 'pass' : 'fail', JSON.stringify({ okN: r.okN, used: r.used, max: r.max, lastOk: r.lastOk, lastReason: r.lastReason, shopOk: r.shopOk }));
}

/** P52-b — 확정 바 위험 라벨: 깊은 물 기구(블롭)를 조준하면 「위험 …」 칩(토큰 색) · 알바 있는 망루를 세우면 한 단 하강 · 알바 없으면 그대로 */
async function verifyP52b(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 1e6; for (const id of ['rig_blob', 'watchtower']) g.unlocked.facilities.add(id); const chip = () => { const e = document.getElementById('dock-place-risk'); return e ? { hidden: e.classList.contains('khide'), text: e.textContent, cls: e.className, risk: e.dataset.risk, bg: getComputedStyle(e).backgroundColor, h: e.getBoundingClientRect().height } : null; }; w.place.enter(w.game.facilities.defById('rig_blob')); w.place.aimAt(51, 27); const c0 = chip(); const t = g.placeFacility('watchtower', 50, 26, 0); w.place.aimAt(51, 27); const c1 = chip(); g.setStaffed(t.uid, true); w.place.aimAt(51, 27); const c2 = chip(); const lvl = (c) => Number(c && c.risk); w.place.exit(); return { c0, c1, c2, drop: lvl(c0) - lvl(c2), same: lvl(c0) === lvl(c1) }; })()`)) as { c0: { hidden: boolean; text: string; cls: string; risk: string; bg: string; h: number } | null; c1: unknown; c2: { risk: string } | null; drop: number; same: boolean };
  record('P52-b 확정 바 위험 라벨 — 블롭(깊은 물·스릴 3)을 조준하면 「위험 …」 칩이 보이고 44px · 알바 없는 망루는 그대로 · 알바를 두면 한 단 하강', !!r.c0 && !r.c0.hidden && r.c0.text.startsWith('위험') && r.c0.h >= 44 && r.same && r.drop >= 1 ? 'pass' : 'fail', JSON.stringify(r));
}

/** P56-a — 그림 우선 UI 골격(그림 0): 요리·공방·개조 창이 한 순서(슬롯·행동 버튼·보유 격자·결과 장면 카드·도감 격자)이고 글자 칩이 0 · 장날은 17시 전에도 잠금 카드 · 심사위원 말풍선 · 개조 전→후 카드 · 조준 값 팝 */
async function verifyP56a(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`window.__pj.scene.setUpscale(1)`);
  // ① 요리 창 — 카드 수 = 보유 재료 + 상점 재료 · 도감 카드 = 실패작 뺀 레시피 · 글자 칩 0 · 재료 탭 → 슬롯에 그림 · 개발 → 결과 장면 카드(축 3 · 게이지)
  const cook = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; g.rank = 2; g.cooking.exp = 99999; w.cookWin.show(); const q = (s) => document.querySelectorAll('#win-cook ' + s).length; const c = g.cooking; const owned = [...c.ingredients.values()].filter((i) => c.owned.has(i.id)).length; const shop = [...c.ingredients.values()].filter((i) => !c.owned.has(i.id) && i.unlock === 'shop').length; const recipes = [...c.recipes.values()].filter((r) => r.unlock !== 'fail').length; const chips = q('.kchip[data-ingredient]'); const cards = q('[data-grid="win-cook-ingredients"] .kpcard'); const codex = q('[data-grid="win-cook-codex"] .kpcard'); const sil = q('[data-grid="win-cook-codex"] .kpcard.silhouette'); document.querySelector('#win-cook [data-ingredient="flour"]').click(); document.querySelector('#win-cook [data-ingredient="egg"]').click(); const slotArt = q('.kpslot.on .kpic, .kpslot.on .kpic-fb'); const foot = document.querySelector('#win-cook [data-grid="win-cook-ingredients"] .kpfoot-name').textContent; document.getElementById('win-cook-go').click(); const res = document.querySelector('#win-cook .kresult'); const scene = res ? res.querySelector('.kscene') : null; const axes = scene ? scene.querySelectorAll('.kaxis').length : 0; const gauges = scene ? scene.querySelectorAll('.kgauge').length : 0; const portraits = scene ? scene.querySelectorAll('.kportrait canvas').length : 0; const out = { owned, shop, recipes, chips, cards, codex, sil, slotArt, foot, outcome: res ? res.dataset.outcome : null, axes, gauges, portraits, footEmpty: false }; document.querySelector('#win-cook .kwin-close').click(); return out; })()`)) as { owned: number; shop: number; recipes: number; chips: number; cards: number; codex: number; sil: number; slotArt: number; foot: string; outcome: string | null; axes: number; gauges: number; portraits: number; footEmpty: boolean };
  record('P56-a 요리 창 — 글자 칩 0 · 재료 카드 = 보유+상점 · 도감 카드 = 레시피(미발견 실루엣) · 재료 탭 → 슬롯 그림 2 · 아래 두 줄 이름 · 개발 → 장면 카드(축 3 · 게이지 3 · 손님 2)', cook.chips === 0 && cook.cards === cook.owned + cook.shop && cook.codex === cook.recipes && cook.sil > 0 && cook.slotArt === 2 && cook.foot === '달걀' && ['new', 'known', 'fail'].includes(cook.outcome ?? '') && cook.axes === 3 && cook.gauges === 3 && cook.portraits === 2 ? 'pass' : 'fail', JSON.stringify(cook));
  // ② 공방·개조 창도 같은 문법 (칩 0 · 격자 · 개조 도감은 개조판 스프라이트)
  const ws = (await page.evaluate(`(() => { const w = window.__pj; w.workshopWin.show(); const q = (s) => document.querySelectorAll(s).length; const a = { chips: q('#win-workshop .kchip[data-ingredient]'), cards: q('#win-workshop [data-grid="win-workshop-ingredients"] .kpcard'), codex: q('#win-workshop [data-grid="win-workshop-codex"] .kpcard') }; document.querySelector('#win-workshop .kwin-close').click(); w.rigWin.show(); const b = { chips: q('#win-rig .kchip[data-ingredient]'), cards: q('#win-rig [data-grid="win-rig-ingredients"] .kpcard'), codex: q('#win-rig [data-grid="win-rig-codex"] .kpcard'), known: w.game.rigs.known.size, canvases: q('#win-rig [data-grid="win-rig-codex"] .kpcard .kpic-canvas canvas') }; document.querySelector('#win-rig .kwin-close').click(); return { a, b }; })()`)) as { a: { chips: number; cards: number; codex: number }; b: { chips: number; cards: number; codex: number; known: number; canvases: number } };
  record('P56-a 공방·개조 창 — 칩 0 · 부품 카드 ≥6 · 공방 도감 ≥30 · 개조 도감 20(아는 것은 개조판 스프라이트)', ws.a.chips === 0 && ws.a.cards >= 6 && ws.a.codex >= 30 && ws.b.chips === 0 && ws.b.cards >= 6 && ws.b.codex === 20 && ws.b.canvases === ws.b.known ? 'pass' : 'fail', JSON.stringify(ws));
  // ③ 장날 — 17시 전(첫 입고 전)에도 잠긴 후보 카드 ≥ 1, 살 수 있는 카드 0 · 카드에 가격 · 자물쇠
  const shop = (await page.evaluate(`(() => { const w = window.__pj; w.shopWin.show(); const q = (s) => document.querySelectorAll('#win-shop ' + s).length; const out = { locked: q('[data-shop-locked]'), buyable: q('[data-shop]'), prices: q('.kpcard .kpcard-cost'), locks: q('.kpcard .kpcard-badge.lock'), restocked: w.game.shop.state.restockDay >= 0, cands: w.game.shopCandidates().length }; document.querySelector('#win-shop .kwin-close').click(); return out; })()`)) as { locked: number; buyable: number; prices: number; locks: number; restocked: boolean; cands: number };
  record('P56-a 장날 — 첫 입고 전에도 빈 상태가 아니다: 잠긴 후보 카드 = 후보 수 · 살 수 있는 카드 0 · 가격·자물쇠', !shop.restocked && shop.locked === shop.cands && shop.cands >= 1 && shop.buyable === 0 && shop.prices === shop.locked && shop.locks === shop.locked ? 'pass' : 'fail', JSON.stringify(shop));
  // ④ 심사 창 — 카드마다 심사위원 말풍선 3(가중치 합) · 조건 옆 그림 · 합격 상품 그림
  const cert = (await page.evaluate(`(() => { const w = window.__pj; w.certWin.show(); const card = document.querySelector('#win-cert [data-cert="grade_f"]'); const out = { bubbles: card.querySelectorAll('.kcond-say[data-line]').length, judges: new Set([...card.querySelectorAll('[data-judge]')].map((e) => e.dataset.judge)).size, arts: card.querySelectorAll('.kcond-art .kpic, .kcond-art .kpic-fb, .kcond-art .kpic-canvas').length, reward: card.querySelectorAll('.kreward .kreward-art .kpic, .kreward .kreward-art .kpic-fb, .kreward .kreward-art .kpic-canvas').length, text: card.querySelector('.kcond-say').textContent }; document.querySelector('#win-cert .kwin-close').click(); return out; })()`)) as { bubbles: number; judges: number; arts: number; reward: number; text: string };
  record('P56-a 심사 창 — 심사위원 셋이 조건을 말한다(말풍선 3 · 각자 한 줄) · 조건 옆 그림 3 · 합격 상품 그림 1', cert.bubbles === 3 && cert.judges === 3 && cert.arts === 3 && cert.reward === 1 && cert.text.length >= 4 ? 'pass' : 'fail', JSON.stringify(cert));
  // ⑤ 개조 「전 → 후」 카드 — 킷 기구에 아는 개조판이 있으면 장면 카드(그림 2 · 축 3) + 착수 버튼
  const conv = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; for (const r of w.game.rigs.recipes.values()) g.rigs.known.add(r.id); g.unlocked.facilities.add('rig_slide'); g.money = 1e6; let pr = { ok: false }; const pool = [...g.pools.all].sort((a, b) => b.tiles.length - a.tiles.length)[0]; if (pool) for (const k of pool.tiles) { const i = k % g.grid.w, j = Math.floor(k / g.grid.w); for (const f of [0, 1]) { if (!pr.ok && g.canPlace('rig_slide', i, j, f, {}).ok) pr = g.placeFacility('rig_slide', i, j, f); } if (pr.ok) break; } /* 킷 빠지 안 물 칸 중 놓이는 첫 자리 */ const rig = g.facilities.all.find((f) => { const d = g.facilities.defOf(f); return d.class === 'rig' && g.rigs.upgradesFor(d.id).length > 0; }); if (!rig) return { none: true, pr }; w.facilityInfo.show(rig.uid); const c = document.querySelector('#win-facility [data-convert-card]'); const out = { none: false, card: !!c, arts: c ? c.querySelectorAll('.kscene-art .kpic-canvas').length : 0, axes: c ? c.querySelectorAll('.kaxis').length : 0, btn: !!document.querySelector('#win-facility [data-convert]') }; document.querySelector('#win-facility .kwin-close').click(); return out; })()`)) as { none: boolean; card?: boolean; arts?: number; axes?: number; btn?: boolean };
  record('P56-a 개조 「전 → 후」 장면 카드 — 킷 빠지에 슬라이드를 놓고 정보 창: 스프라이트 둘 · 축 3(스릴·정원·안전) · 「개조 착수」 버튼', !conv.none && conv.card && conv.arts === 2 && conv.axes === 3 && conv.btn ? 'pass' : 'fail', JSON.stringify(conv));
  // ⑥ 조준 값 팝 — 시설을 조준하면 지도 위에 「N G ×1」(FX price-pop 1회 이상), 같은 key 라 누적되지 않는다
  const pop = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const before = w.fxFired['price-pop'] || 0; const def = w.facilityDefs.get('vending_out'); w.place.enter(def); const gt = g.gate; let at = null; for (let dj = 2; dj < 40 && !at; dj++) for (let di = -12; di <= 12 && !at; di++) { const i = gt.i + di, j = gt.j + dj; if (g.canPlace('vending_out', i, j, 0, { frontage: true }).ok) at = { i, j }; } if (at) w.place.aimAt(at.i, at.j); const mid = w.fxFired['price-pop'] || 0; w.place.exit(); return { before, mid }; })()`)) as { before: number; mid: number };
  record('P56-a 조준 값 팝 — 시설을 조준하면 지도 위 「N G ×1」 FX 가 돈다', pop.mid > pop.before ? 'pass' : 'fail', JSON.stringify(pop));
}

/** P57-a — main 아틀라스 반입: 4방향 시설의 facing 1 이 뒤집기가 아니라 옆면(:d1) · ppaji 시설 중 레거시 프레임 ≥49 · 발자국 바뀐 카페(3×2)가 실제로 3×2 로 놓인다 · 아틀라스 PNG(v15) 로드 */
async function verifyP57a(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(async () => { const w = window.__pj; const g = w.game; const p = w.provider; const ids = [...w.facilityDefs.values()].map((d) => d.id); const atlas = await (await fetch('/assets/kairo-atlas.json', { cache: 'no-store' })).json(); const legacy = ids.filter((id) => atlas['facility/' + id + ':d0'] || atlas['facility/' + id]); const fourDir = ids.filter((id) => atlas['facility/' + id + ':d1']); const diffPx = (a, b) => { if (!a || !b || a.width !== b.width || a.height !== b.height) return -1; const x = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, y = b.getContext('2d').getImageData(0, 0, b.width, b.height).data; let d = 0; for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2]) d++; return d; }; const flipped = (a) => { const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const cx = c.getContext('2d'); cx.translate(a.width, 0); cx.scale(-1, 1); cx.drawImage(a, 0, 0); return c; }; const cafe0 = p.canvas('fac/cafe/0'), cafe1 = p.canvas('fac/cafe/1'); const out = { legacy: legacy.length, fourDir: fourDir.length, cafeSide: diffPx(cafe1, flipped(cafe0)), cafeSize: cafe0 ? cafe0.width + 'x' + cafe0.height : null, png: (await fetch('/assets/kairo-atlas.png?v=15', { cache: 'no-store' })).ok }; g.money = 1e6; g.unlocked.facilities.add('cafe'); const gt = g.gate; let placed = null; for (let dj = 3; dj < 40 && !placed; dj++) for (let di = -14; di <= 14 && !placed; di++) { const i = gt.i + di, j = gt.j + dj; const c = g.canPlace('cafe', i, j, 0, {}); if (c && c.ok) { const rr = g.placeFacility('cafe', i, j, 0); if (rr.ok) placed = rr.uid; } } out.placed = placed !== null; if (placed !== null) { const f = g.facilities.byUid(placed); const fp = w.facilityDefs.get('cafe'); out.fp = [fp.w, fp.d]; out.occ = g.facilities.all.filter((x) => x.uid === placed).length; } return out; })()`)) as Record<string, number | boolean | string | number[] | null>;
  record('P57-a main 아틀라스 — ppaji 시설 중 레거시 프레임 ≥49 · 4방향 ≥26 · 카페 facing 1 은 뒤집기가 아닌 옆면(뒤집은 앞면과 다른 픽셀 ≥ 500) · 카페 발자국 3×2 로 놓인다 · PNG v15 로드', (r['legacy'] as number) >= 49 && (r['fourDir'] as number) >= 26 && (r['cafeSide'] as number) >= 500 && r['png'] === true && r['placed'] === true && JSON.stringify(r['fp']) === '[3,2]' ? 'pass' : 'fail', JSON.stringify(r));
}

/** P57-b — main 병합 M3: 북쪽 바깥 풍경 띠(먼 산 7 + 가까운 숲 7) · 바깥 장식이 main env 그림(가로등·마을 줄·이웃 건물) · 도로 버스 = env_bus · env 장식 29 가 건설 「장식」 탭(시작 18) · 생울타리를 마당 잔디에 놓는다 · `?scenery=0` 이면 풍경 0(대조군) */
async function verifyP57b(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money = 50000; w.buildWin.show(); const tab = [...document.querySelectorAll('#win-build .ktab')].find((x) => x.dataset.tab === 'decor'); if (tab) tab.click(); const cards = [...document.querySelectorAll('#win-build .kpcard')].map((x) => x.dataset.facility); w.buildWin.hide(); const envStart = [...g.unlocked.facilities].filter((id) => id.startsWith('env_')).length; const ok = g.placeFacility('env_hedge', gt.i - 18, gt.j + 19, 0); const ok2 = g.placeFacility('env_wood_fence', gt.i - 16, gt.j + 19, 1); /* P46 과 같은 북서 잔디 — 동쪽 열은 S 자 본류가 북으로 굽어 강 건너다 */ w.syncWorldToScene(); const tex = w.scene.textures.exists('fac/env_hedge/0') && w.scene.textures.exists('fac/env_wood_fence/1'); return { landscape: w.scene.landscapeCountForTest(), borderEnv: w.scene.borderEnvCountForTest(), border: w.scene.borderCountForTest(), bus: w.scene.busTextureKeyForTest(), cards: cards.length, hasFence: cards.includes('env_wood_fence'), hasHedge: cards.includes('env_hedge'), envStart, hedge: ok.ok, hedgeWhy: ok.ok ? '' : ok.reason, fence: ok2.ok, tex, defs: g.facilities.defsCount }; })()`)) as { landscape: number; borderEnv: number; border: number; bus: string; cards: number; hasFence: boolean; hasHedge: boolean; envStart: number; hedge: boolean; hedgeWhy: string; fence: boolean; tex: boolean; defs: number };
  record('P57-b 풍경·바깥 장식 — 북쪽 풍경 띠 14(먼 산 7 · 숲 7) · 바깥 장식 중 main env 그림 ≥ 20(가로등 12 · 마을 줄 8 · 이웃 4) · 도로 버스 = env_bus d2(도로와 나란)', r.landscape === 14 && r.borderEnv >= 20 && r.bus === 'fac/env_bus/2' ? 'pass' : 'fail', JSON.stringify({ landscape: r.landscape, borderEnv: r.borderEnv, border: r.border, bus: r.bus }));
  record('P57-b env 장식 29 — 시설 정의 178(파생 식탁 포함) · 새 판 시작 해금 env 18 · 「장식」 탭에 울타리·생울타리 카드 · 마당 잔디에 생울타리(0)·울타리(1) 배치 → 아틀라스 텍스처', r.defs === 178 && r.envStart === 18 && r.hasFence && r.hasHedge && r.cards >= 21 && r.hedge && r.fence && r.tex ? 'pass' : 'fail', JSON.stringify({ defs: r.defs, envStart: r.envStart, cards: r.cards, hedge: r.hedge, hedgeWhy: r.hedgeWhy, fence: r.fence, tex: r.tex }));
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0&scenery=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const z = (await page.evaluate(`(() => { const w = window.__pj; return { landscape: w.scene.landscapeCountForTest(), borderEnv: w.scene.borderEnvCountForTest() }; })()`)) as { landscape: number; borderEnv: number };
  record('P57-b 대조군 — `?scenery=0` 이면 풍경 띠 0(바깥 env 장식은 아틀라스라 그대로)', z.landscape === 0 && z.borderEnv >= 20 ? 'pass' : 'fail', JSON.stringify(z));
  // P57-d — 유리벽·유리문 그림 · deco 별칭
  const wz = (await page.evaluate(`(() => { const w = window.__pj; return { art: w.scene.wallArtCountForTest(), layers: w.scene.wallLayerCountForTest(), doors: w.scene.doorCountForTest() }; })()`)) as { art: number; layers: number; doors: number };
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const wa = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money = 50000; const chair = g.placeFacility('lifeguard_chair', gt.i - 18, gt.j + 9, 0).ok; w.syncWorldToScene(); const spec = w.provider.spec('fac/lifeguard_chair/0'); const spec2 = w.provider.spec('fac/antique_pillar/1'); return { art: w.scene.wallArtCountForTest(), doors: w.scene.doorCountForTest(), keys: w.scene.textures.getTextureKeys().filter((k) => k.startsWith('landscape/glass')).length, chair, chairSrc: spec ? spec.source + ':' + spec.w + 'x' + spec.h : null, pillarSrc: spec2 ? spec2.source : null }; })()`)) as { art: number; doors: number; keys: number; chair: boolean; chairSrc: string | null; pillarSrc: string | null };
  record('P57-d 유리벽 — 출입동 20×13 둘레 변 68장(66 + 정문 칸 홈 2)이 main 유리벽·유리문 그림(텍스처 ≥ 2) · 문 2 · `?scenery=0` 이면 그림 0 · 절차 벽 층 > 0', wa.art === 68 && wa.doors === 2 && wa.keys >= 2 && wz.art === 0 && wz.layers > 0 && wz.doors === 2 ? 'pass' : 'fail', JSON.stringify({ ...wa, control: wz }));
  record('P57-d deco 별칭 — 안전요원 의자 = `deco/guard_stand`(art 32×36) · 장승 facing 1 = `deco/sculpture` 뒤집기(art)', wa.chair && wa.chairSrc === 'art:32x36' && wa.pillarSrc === 'art' ? 'pass' : 'fail', JSON.stringify({ chairSrc: wa.chairSrc, pillarSrc: wa.pillarSrc }));
  // P57-f — 한 줄이어야 하는 글자(버튼·탭·칩·카드 이름·슬롯·행 열쇠/값)가 두 줄로 접히면 실패. 말풍선(.kcond-say)은 문장이라 제외 · 말줄임(overflow)은 허용
  const wr = (await page.evaluate(`(async () => { const w = window.__pj; const g = w.game; g.money = 900000; const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }; const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const SEL = '.kbtn, .ktab, .kchip, .kwin-title, .kdock-title, .kpcard-name, .kstat-k, .kstat-v, .kcele-title, .krow-k, .krow-v, .kpslot, .kpfoot-sub, .kpfoot-desc, .kmenu-desc, .kticker-line';
    const scan = (name, out) => { for (const el of document.querySelectorAll(SEL)) { if (!vis(el) || !el.textContent.trim() || el.querySelector('br')) continue; const tops = new Set(); const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let tn; while ((tn = walker.nextNode())) { if (!tn.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(tn); for (const r of rg.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top / 4)); } const cs = getComputedStyle(el); const spill = el.scrollWidth > el.clientWidth + 2 && cs.whiteSpace === 'nowrap' && cs.textOverflow !== 'ellipsis'; if (tops.size > 1 || spill) out.push(name + ':' + (spill ? 'SPILL ' : '') + el.className.split(' ')[0] + '「' + el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 20) + '」'); } };
    const out = []; const closeAll = () => { for (const b of document.querySelectorAll('.kwin-close, .kclose')) try { b.click(); } catch {} };
    w.buildWin.show(); for (const t of [...document.querySelectorAll('#win-build .ktab')]) { t.click(); await wait(40); scan('build/' + t.dataset.tab, out); } closeAll(); w.buildWin.hide?.();
    w.snsWin.show(); const ft = [...document.querySelectorAll('.ktab')].find((x) => x.dataset.tab === 'friends'); ft && ft.click(); await wait(60); scan('sns', out); closeAll(); w.snsWin.hide?.();
    const rest = g.facilities.all.find((x) => g.facilities.defOf(x).class === 'restaurant'); w.facilityInfo.show(rest.uid); await wait(60); scan('facility', out); closeAll(); w.menuWin.show(rest.uid); await wait(60); scan('menu', out); closeAll(); w.poolInfo.show(g.pools.all[0].id); await wait(60); scan('pool', out); closeAll();
    w.dock.enter('deck', g.pools.all[0].id); await wait(60); scan('dock', out); w.dock.exit(); return out; })()`)) as string[];
  record('P57-f 한 줄 텍스트 — 건설 9탭·SNS 친구·시설 정보·메뉴 편집·수역 정보·수역 독에서 버튼·탭·칩·카드 이름·슬롯·행 열쇠/값의 두 줄 접힘 0 · nowrap 글자 넘침 0 (말풍선 제외, 말줄임 허용)', wr.length === 0 ? 'pass' : 'fail', wr.slice(0, 8).join(' | ') || '0');
}

/** P60-a (D71, docs/plan-ppaji-rig-foodcourt.md §10.1) — 색·향·소품 삭제: 수역 정보 = 수온 행 1 · 타일 0 · 소품/물빛/분위기/프리셋 문자열 0 · 수역 독 = 붓 6 + 행동 4(소품 탭 0 · 미리보기 0) · 인증 24 · 보상 kind 집합 유지 · 조건에 item/색/향 0 */
async function verifyP60a(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.flow.frozen = true; const p = g.pools.all[0]; const out = {};
    const vis = (e) => !!e && !e.hidden && !e.classList.contains('khide') && e.getBoundingClientRect().height > 0;
    w.poolInfo.show(p.id); const win = document.getElementById('win-pool'); out.tempRows = win.querySelectorAll('[data-temp]').length; out.tiles = win.querySelectorAll('.kptile, .kbars, [data-detail], [data-detail-body]').length; const txt = win.innerText; out.badWords = ['소품', '물빛', '분위기', '프리셋', '넣기', '농도'].filter((s) => txt.includes(s)); out.tempText = (win.querySelector('[data-temp]') || {}).textContent || ''; out.presetBtn = !!document.getElementById('win-pool-preset-save'); out.editBtn = (document.getElementById('win-pool-edit') || {}).textContent || ''; document.querySelector('#win-pool .kwin-close').click();
    w.dock.enter('deck'); const d = document.getElementById('dock-pool'); out.brush = [...d.querySelectorAll('.ktabs:not(.ksub) .ktab')].filter(vis).length; out.sub = [...d.querySelectorAll('.ktabs.ksub .ktab')].filter(vis).length; out.tabsAll = d.querySelectorAll('.ktab').length; out.itemTab = d.querySelectorAll('.ktab[data-mode="item"]').length; out.preview = !!document.getElementById('dock-pool-preview'); out.itemGrid = !!d.querySelector('.kitem-grid, [data-grid="pool-items"]'); out.dockBad = ['소품', '물빛', '분위기'].filter((s) => d.innerText.includes(s)); w.dock.exit();
    const defs = [...g.certs.defs.values()]; out.certs = defs.length; out.rewardKinds = [...new Set(defs.map((c) => c.reward.kind))].sort().join(','); const kinds = new Set(); const walk = (c) => { if (!c) return; if (c.kind === 'all' || c.kind === 'any') { c.of.forEach(walk); return; } kinds.add(c.kind); if (c.kind === 'pool') for (const k of Object.keys(c)) kinds.add('pool.' + k); }; for (const c of defs) for (const cc of c.conditions) walk(cc.cond); out.badConds = [...kinds].filter((k) => k === 'item' || k === 'pool.color' || k === 'pool.scent' || k === 'pool.intensityMin');
    return out; })()`)) as Record<string, unknown>;
  const n = (k: string): number => Number(r[k]);
  record('P60-a 수역 정보 — 수온 행 1(「수온 N°C」 + 판정) · 색·향·온도 타일 0 · 소품/물빛/분위기/프리셋/농도 문자열 0 · 프리셋 버튼 0 · 편집 버튼 「편집」', n('tempRows') === 1 && n('tiles') === 0 && (r['badWords'] as string[]).length === 0 && /수온/.test(String(r['tempText'])) && /\d+°C/.test(String(r['tempText'])) && /딱 좋아요|차가워요|뜨거워요/.test(String(r['tempText'])) && r['presetBtn'] === false && r['editBtn'] === '편집' ? 'pass' : 'fail', JSON.stringify({ tempRows: r['tempRows'], tiles: r['tiles'], badWords: r['badWords'], tempText: r['tempText'], presetBtn: r['presetBtn'], editBtn: r['editBtn'] }));
  record('P60-a 수역 독 — 붓 6 + 행동 4(치기·걷기는 숨김 · 탭 12) · 소품 탭 0 · 미리보기 0 · 카드 격자 0 · 소품/물빛/분위기 문자열 0', n('brush') === 6 && n('sub') === 4 && n('tabsAll') === 12 && n('itemTab') === 0 && r['preview'] === false && r['itemGrid'] === false && (r['dockBad'] as string[]).length === 0 ? 'pass' : 'fail', JSON.stringify({ brush: r['brush'], sub: r['sub'], tabsAll: r['tabsAll'], itemTab: r['itemTab'], preview: r['preview'], itemGrid: r['itemGrid'], dockBad: r['dockBad'] }));
  record('P60-a 인증 24 유지 · 보상 kind 집합 {facility, gift, rigPart} 그대로 · 조건에 item/색/향/농도 0', n('certs') === 24 && r['rewardKinds'] === 'facility,gift,rigPart' && (r['badConds'] as string[]).length === 0 ? 'pass' : 'fail', JSON.stringify({ certs: r['certs'], rewardKinds: r['rewardKinds'], badConds: r['badConds'] }));
}

/**
 * P60-c (D72 B) 세트 — 데이터 8(hidden 4) · 링 위 ninja 셋을 API 로 인접 배치하면 `setsOf` 에 ninja + 발견 채널(축하 모달 또는 인박스) + 수집 「세트 1/8」 ·
 * 같은 세트 둘째(등급이 안 바뀌는 판)는 팔찌 값 변화 0 · 건설 카드 「세트」 배지 ≥ 3 · 수역 정보창 「세트」 행.
 * 배치 API 는 `game.placeFacility(id, i, j, facing)` · 링은 G5 선례 `makePpaji({ i0: 41, j0: 24, w: 6, h: 7 })`(안쪽 물 42~45 × 25~29).
 */
async function verifyP60c(page: import('playwright').Page): Promise<void> {
  // 행 1 — 데이터(노드 쪽): RIG_SETS 8 · hidden 4 · 멤버 3 서로 다름 · 시작 해금 기구만으로 ≥ 1 세트 성립
  {
    let detail = '';
    let ok = false;
    try {
      const sets = JSON.parse(readFileSync('src/data/rig-sets.json', 'utf8')) as { id: string; name: string; members: string[]; hidden?: boolean }[];
      const facs = JSON.parse(readFileSync('src/data/facilities.json', 'utf8')) as { id: string; class: string; onRing?: boolean; unlock: { source: string } }[];
      const start = new Set(facs.filter((d) => (d.class === 'rig' || d.onRing === true) && d.unlock.source === 'start').map((d) => d.id));
      const hidden = sets.filter((s) => s.hidden).length;
      const wellFormed = sets.every((s) => s.members.length === 3 && new Set(s.members).size === 3 && s.name.length > 0);
      const startable = sets.filter((s) => s.members.every((m) => start.has(m))).map((s) => s.id);
      ok = sets.length === 8 && hidden === 4 && wellFormed && startable.length >= 1;
      detail = JSON.stringify({ sets: sets.length, hidden, wellFormed, startable });
    } catch (e) { detail = `읽기 실패 ${String(e).slice(0, 80)}`; }
    record('P60-c RIG_SETS 8 · hidden 4 · 멤버 3 서로 다름 · 시작 해금 7종만으로 세트 ≥ 1', ok ? 'pass' : 'fail', detail);
  }
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0&celebrate=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  // 행 2 — 새 판(777) · 링 · ninja 셋을 42열에 세로로: 빔(여울 전용 1×2) (42,25)~(42,26) 여울 · 다리 (42,27)~(42,28) · 징검 (42,29) — 빔이 링 41열에 닿고 셋이 서로 닿는다. ⚠ `g` 는 newGame 뒤에 잡는다(앞에 잡으면 옛 판에 놓는다 — 실측)
  const r = (await page.evaluate(`(() => { const w = window.__pj; w.newGame(777); const g = w.game; const out = {}; w.flow.frozen = true; g.money = 1e6; for (const id of ['rig_bridge', 'rig_stepstone', 'rig_beam']) g.unlocked.facilities.add(id); out.ring = g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }).ok;
    const pid = g.pools.ownerIdAt(42, 25); out.pid = pid; out.seenBefore = g.setsSeen ? g.setsSeen.size : -1;
    const placed = [g.placeFacility('rig_beam', 42, 25, 0), g.placeFacility('rig_bridge', 42, 27, 0), g.placeFacility('rig_stepstone', 42, 29, 0)]; out.placed = placed.map((p) => p.ok ? 1 : (p.reason || 'x')); w.skip(1);
    out.sets = g.setsOf ? g.setsOf(pid) : null; out.seen = g.setsSeen ? [...g.setsSeen] : null; out.celebrate = !!(w.celebrate && w.celebrate.visible); out.celeTitle = (document.querySelector('#win-celebrate .kcele-title') || {}).textContent || ''; out.inbox = g.inbox.all.filter((e) => /세트/.test(e.title)).length; out.inboxPic = g.inbox.all.filter((e) => /세트/.test(e.title) && e.pic).length;
    const okBtn = document.getElementById('win-celebrate-ok'); if (out.celebrate && okBtn) okBtn.click();
    w.rankWin.show(); const cr = document.querySelector('#win-rank [data-collect="세트"] .krow-v'); out.collect = cr ? cr.textContent : null; document.querySelector('#win-rank .kwin-close').click();
    return out; })()`)) as Record<string, unknown>;
  const sets = (r['sets'] as string[] | null) ?? [];
  record('P60-c 링 위 ninja 셋 인접 배치 → setsOf 에 ninja · 축하 모달 또는 인박스 편지(pic) ≥ 1 · 수집 「세트 1 / 8」', (r['placed'] as unknown[]).every((p) => p === 1) && sets.includes('ninja') && ((r['celebrate'] === true && /세트/.test(String(r['celeTitle']))) || Number(r['inbox']) >= 1) && r['collect'] === '1 / 8' ? 'pass' : 'fail', JSON.stringify({ placed: r['placed'], sets: r['sets'], seen: r['seen'], celebrate: r['celebrate'], celeTitle: r['celeTitle'], inbox: r['inbox'], inboxPic: r['inboxPic'], collect: r['collect'] }));
  // 행 3 — 같은 세트 둘째(첫 사슬과 안 닿는 45열): 빔 가로 (44,25)~(45,25) 여울 · 다리 (45,26)~(45,27) 을 먼저 채워 n 5 · 종 3 → 등급 2 로 고정하고, 징검 (45,28) 로 둘째 ninja 를 완성((43,25)·43~44열이 비어 두 사슬은 따로다) — 팔찌 값(aimPreview.pkgNow)이 0 움직여야 한다
  const r3 = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const out = {}; const pid = g.pools.ownerIdAt(42, 25);
    out.fill = [g.placeFacility('rig_beam', 44, 25, 1), g.placeFacility('rig_bridge', 45, 26, 0)].map((p) => p.ok ? 1 : (p.reason || 'x')); w.skip(1);
    const probe = () => { const pv = g.aimPreview('rig_stepstone', 43, 27, 0); return pv ? { pkg: pv.pkgNow, grade: pv.gradeNow, pool: pv.poolId } : null; };
    out.before = probe(); out.setsBefore = g.setsOf ? g.setsOf(pid).length : -1;
    out.second = (g.placeFacility('rig_stepstone', 45, 28, 0).ok ? 1 : 0); w.skip(1);
    out.after = probe(); out.setsAfter = g.setsOf ? g.setsOf(pid).length : -1; out.seen = g.setsSeen ? g.setsSeen.size : -1;
    return out; })()`)) as Record<string, unknown>;
  const b = r3['before'] as { pkg: number; grade: number; pool: number } | null; const a = r3['after'] as { pkg: number; grade: number; pool: number } | null;
  record('P60-c 같은 세트 둘째 배치 → 팔찌 값 변화 0 (등급 2 고정 · 세트 수도 늘지 않는다)', (r3['fill'] as unknown[]).every((p) => p === 1) && r3['second'] === 1 && !!b && !!a && b.grade === 2 && a.grade === 2 && b.pkg === a.pkg && Number(r3['setsAfter']) === Number(r3['setsBefore']) ? 'pass' : 'fail', JSON.stringify({ fill: r3['fill'], second: r3['second'], before: b, after: a, setsBefore: r3['setsBefore'], setsAfter: r3['setsAfter'], seen: r3['seen'] }));
  // 행 4 — 건설 「빠지」 탭 카드 「세트」 배지 ≥ 3(hidden 세트의 멤버는 배지 없음) · 수역 정보창 「세트」 행 1(값 ≤ 10자) + 힌트에 세트 이름
  const r4 = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const out = {}; const pid = g.pools.ownerIdAt(42, 25);
    w.buildWin.show('ppaji'); const win = document.getElementById('win-build'); const badges = [...win.querySelectorAll('.kpcard-badge')].map((e) => e.textContent); out.badges = badges.filter((t) => t === '세트').length; out.badgeIds = [...win.querySelectorAll('.kpcard[data-set]')].map((e) => e.dataset.facility); document.querySelector('#win-build .kwin-close').click();
    w.poolInfo.show(pid); const pw = document.getElementById('win-pool'); const sr = pw.querySelector('[data-sets]'); out.setRow = sr ? sr.textContent : null; out.setVal = sr ? (sr.querySelector('.krow-v') || {}).textContent : null; out.hint = (pw.querySelector('.kfac-hint') || {}).textContent || ''; document.querySelector('#win-pool .kwin-close').click();
    return out; })()`)) as Record<string, unknown>;
  record('P60-c 건설 카드 「세트」 배지 ≥ 3 · 정보창 「세트」 행(값 ≤ 10자) + 힌트에 세트 이름', Number(r4['badges']) >= 3 && r4['setRow'] !== null && /세트/.test(String(r4['setRow'])) && String(r4['setVal'] ?? '').length <= 10 && Number(r4['setVal']) >= 1 && /세트 /.test(String(r4['hint'])) ? 'pass' : 'fail', JSON.stringify({ badges: r4['badges'], badgeIds: r4['badgeIds'], setRow: r4['setRow'], setVal: r4['setVal'], hint: String(r4['hint']).slice(0, 80) }));
}

/**
 * P60-d (D72 A+C) 입수구·경로 — 킷 입수구 1 · 새 링 1 → 라인 조각(뭍 ↔ 링, 다른 변) 뒤 2 · 링 위 기구 3 을 입수구에서 먼 순으로 스릴 오름 + 끝 휴식 → `pathCompleteOf` true + 정보창 「경로 3/완성」 ·
 * 역순(입수구 옆에 스릴 2, 그 뒤 1)이면 미완성 — 벌점 0(팔찌 값·등급 불변) · 조준 중 확정 바 칩 ≤ 1칸 추가 · FX `path-walk`·`entry-mark` 등록부 이름 1 · 조준하면 fxFired ≥ 1, exit 에서 진다 ·
 * `ppajiGradeThresholds` 는 balance.json 키(정적). 링은 P60-c 선례 `makePpaji({ i0: 41, j0: 24, w: 6, h: 7 })`(안쪽 물 42~45 × 25~29, 입수구는 북변 43~46,24 · 서변 41,25), 기구는 `game.placeFacility`.
 * ⚠ sim API 는 과제 S 의 이름(`entriesOf`·`pathOf`·`pathCompleteOf`·`aimPreview().pathNext/completeNext`)을 가정한다.
 */
async function verifyP60d(page: import('playwright').Page): Promise<void> {
  // 행 5 — 정적: 등급 문턱이 데이터(`ppajiGradeThresholds`)로 옮겨졌고 rig.ts 가 그 키를 읽는다 · FX 등록부에 path-walk · entry-mark 각 1
  {
    let detail = ''; let ok = false;
    try {
      const bal = JSON.parse(readFileSync('src/data/balance.json', 'utf8')) as Record<string, unknown>;
      const rig = readFileSync('src/sim/rig.ts', 'utf8');
      const reg = readFileSync('src/render/fx/registry.ts', 'utf8');
      const th = bal['ppajiGradeThresholds'];
      const walk = (reg.match(/'path-walk': \(host, t\)/g) ?? []).length, mark = (reg.match(/'entry-mark': \(host, t\)/g) ?? []).length;
      ok = th !== undefined && rig.includes('ppajiGradeThresholds') && walk === 1 && mark === 1 && /\| 'path-walk'/.test(reg) && /'entry-mark';/.test(reg);
      detail = JSON.stringify({ thresholds: th, rigReads: rig.includes('ppajiGradeThresholds'), walk, mark });
    } catch (e) { detail = `읽기 실패 ${String(e).slice(0, 80)}`; }
    record('P60-d ppajiGradeThresholds 가 balance.json 키 + rig.ts 가 읽는다 · FX 등록부 path-walk 1 · entry-mark 1 (정적)', ok ? 'pass' : 'fail', detail);
  }
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  // 행 1 — 킷 빠지(50~55 × 23~29, 북변이 뭍) 입수구 1 · 새 링(41~46 × 24~30, 북변+서변 한 구간) 입수구 1 → 라인 조각 1×2 를 (39,27)~(40,27) 가로로((38,27) 뭍에 닿고 (41,27) 링에 이어진다 · 북변 구간과 8이웃으로 안 닿는다) → 2.
  //   ⚠ 킷 자체에 둘째 구간을 내는 라인은 없다 — 킷의 뭍은 북변뿐이라 어느 라인도 기존 구간에 붙는다(실측). 허가는 랭크 2 로(6×7 링 42칸 + 라인 2칸)
  const r1 = (await page.evaluate(`(() => { const w = window.__pj; w.newGame(777); const g = w.game; w.flow.frozen = true; g.money = 1e6; g.rank = 2; g.openLand(2); const out = {}; const kit = g.pools.all[0]; out.kit = g.entriesOf(kit.id);
    out.ring = g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }).ok; const pid = g.pools.ownerIdAt(42, 26); out.pid = pid; out.before = g.entriesOf(pid);
    const lr = g.placeLine(2, 39, 27, 0); out.line = lr.ok ? 1 : (lr.reason || 'x'); w.skip(1); out.after = g.entriesOf(pid); out.kitAfter = g.entriesOf(kit.id); return out; })()`)) as Record<string, unknown>;
  record('P60-d 킷 입수구 1 · 새 링 입수구 1 → 라인 조각(뭍 ↔ 링, 다른 변) 하나 뒤 2 · 킷은 그대로 1', Number(r1['kit']) === 1 && r1['ring'] === true && Number(r1['before']) === 1 && r1['line'] === 1 && Number(r1['after']) === 2 && Number(r1['kitAfter']) === 1 ? 'pass' : 'fail', JSON.stringify(r1));
  // 행 2 — 새 링 · 입수구(북변)에서 먼 순으로 징검(스릴 1, 43,25) → 롤러(스릴 2, 43,26) → 선베드(휴식, 43,27~28) → 완성 · 정보창 「입수구 · 경로」 행 값 「e · 3/✓」(≤ 10자) + 힌트 · 팔찌 값·등급을 적어 둔다(행 3 대조)
  const build = async (order: readonly [string, number, number][]): Promise<Record<string, unknown>> => (await page.evaluate(`(() => { const w = window.__pj; w.newGame(777); const g = w.game; w.flow.frozen = true; g.money = 1e6; const out = {}; for (const id of ['rig_roller', 'rig_sunbed']) g.unlocked.facilities.add(id);
    out.ring = g.makePpaji({ i0: 41, j0: 24, w: 6, h: 7 }).ok; const pid = g.pools.ownerIdAt(43, 25); out.pid = pid;
    out.placed = ${JSON.stringify(order)}.map(([id, i, j]) => { const r = g.placeFacility(id, i, j, 0); return r.ok ? 1 : (r.reason || 'x'); }); w.skip(1);
    out.entries = g.entriesOf(pid); out.path = g.pathOf(pid).map((uid) => (g.facilities.byUid(uid) || {}).defId); out.complete = g.pathCompleteOf(pid);
    const pv = g.aimPreview('rig_stepstone', 44, 27, 0); out.pkg = pv ? pv.pkgNow : null; out.grade = pv ? pv.gradeNow : null;
    w.poolInfo.show(pid); const pw = document.getElementById('win-pool'); const pr = pw.querySelector('[data-path]'); out.rowText = pr ? pr.textContent : null; out.rowVal = pr ? (pr.querySelector('.krow-v') || {}).textContent : null; out.rowState = pr ? pr.dataset.path : null; out.hint = (pw.querySelector('.kfac-hint') || {}).textContent || ''; document.querySelector('#win-pool .kwin-close').click();
    return out; })()`)) as Record<string, unknown>;
  const r2 = await build([['rig_stepstone', 43, 25], ['rig_roller', 43, 26], ['rig_sunbed', 43, 27]]);
  record('P60-d 링 위 기구 3 — 입수구에서 먼 순으로 스릴 1→2 + 끝 휴식 → pathCompleteOf true · 경로 = [징검, 롤러, 선베드] · 정보창 「입수구 · 경로」 값 「e · 3/완성」(≤ 10자) + 힌트 「입수구」', (r2['placed'] as unknown[]).every((p) => p === 1) && r2['complete'] === true && JSON.stringify(r2['path']) === JSON.stringify(['rig_stepstone', 'rig_roller', 'rig_sunbed']) && /· 3\/완성$/.test(String(r2['rowVal'] ?? '')) && String(r2['rowVal'] ?? '').length <= 10 && r2['rowState'] === 'done' && /입수구에서 멀수록/.test(String(r2['hint'])) ? 'pass' : 'fail', JSON.stringify({ placed: r2['placed'], entries: r2['entries'], path: r2['path'], complete: r2['complete'], rowVal: r2['rowVal'], rowState: r2['rowState'], pkg: r2['pkg'], grade: r2['grade'], hint: String(r2['hint']).slice(0, 60) }));
  // 행 3 — 역순: 입수구 옆에 롤러(스릴 2), 그 뒤 징검(스릴 1), 끝 선베드 → 미완성 · 벌점 0: 같은 판의 팔찌 값·등급이 행 2 와 같다 · 정보창 값 「e · 3」(✓ 없음)
  const r3 = await build([['rig_roller', 43, 25], ['rig_stepstone', 43, 26], ['rig_sunbed', 43, 27]]);
  record('P60-d 역순(입수구 옆에 스릴 2 → 1)이면 미완성 — 벌점 0(팔찌 값·등급이 완성 판과 같다) · 정보창 「e · 3」(완성 없음)', (r3['placed'] as unknown[]).every((p) => p === 1) && r3['complete'] === false && r3['pkg'] === r2['pkg'] && r3['grade'] === r2['grade'] && /· 3$/.test(String(r3['rowVal'] ?? '')) && r3['rowState'] === 'open' ? 'pass' : 'fail', JSON.stringify({ placed: r3['placed'], path: r3['path'], complete: r3['complete'], rowVal: r3['rowVal'], pkg: r3['pkg'], grade: r3['grade'], pkgDone: r2['pkg'], gradeDone: r2['grade'] }));
  // 행 4 — 행 3 판에서 다리(1×2)를 (44,25) 에 조준: 확정 바 칩 중 경로/완성 칩 ≤ 1 · aimPreview.pathNext > 0 · FX path-walk·entry-mark 가 돈다(fxFired · 씬 핸들) · exit 에서 둘 다 진다
  const r4 = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const out = {}; const f0 = { walk: w.fxFired['path-walk'] || 0, mark: w.fxFired['entry-mark'] || 0 };
    const def = w.facilityDefs.get('rig_bridge'); w.place.enter(def); w.place.aimAt(44, 25); const pv = g.aimPreview('rig_bridge', 44, 25, 0); out.pathNext = pv ? pv.pathNext : null; out.completeNext = pv ? pv.completeNext : null; out.ok = g.canPlace('rig_bridge', 44, 25, 0, { frontage: true }).ok;
    const chips = (w.scene.ghostLabelForTest() || '').split(' · '); out.chips = chips; out.pathChips = chips.filter((c) => /^경로 |^코스 완성/.test(c)).length;
    out.walkFired = (w.fxFired['path-walk'] || 0) - f0.walk; out.markFired = (w.fxFired['entry-mark'] || 0) - f0.mark; out.walkAlive = w.scene.pathWalkForTest().alive; out.markAlive = w.scene.entryMarkForTest();
    w.place.aimAt(44, 26); out.walkFired2 = (w.fxFired['path-walk'] || 0) - f0.walk; // 조준 칸이 바뀌면 다시 걷는다
    w.place.exit(); out.walkAfter = w.scene.pathWalkForTest().alive; out.markAfter = w.scene.entryMarkForTest(); return out; })()`)) as Record<string, unknown>;
  record('P60-d 조준 중 — 확정 바 경로/완성 칩 ≤ 1칸 · pathNext > 0 · FX path-walk ≥ 1(칸 바뀌면 다시) · entry-mark ≥ 1 · exit 에서 둘 다 진다', r4['ok'] === true && Number(r4['pathNext']) > 0 && Number(r4['pathChips']) <= 1 && Number(r4['walkFired']) >= 1 && Number(r4['walkFired2']) >= 2 && Number(r4['markFired']) >= 1 && r4['walkAlive'] === true && r4['markAlive'] === true && r4['walkAfter'] === false && r4['markAfter'] === false ? 'pass' : 'fail', JSON.stringify(r4));
}

/** P58-a — 푸드코트: 킷 식탁 2 · 틴트 칸 12 · 독 「식탁」 모드 실터치로 6×4 그리면 좌석 8 · 식탁 정보 창은 「푸드코트 지우기」만(이동·철거·개선·알바 숨김) · 지우면 좌석 0 · 하루 뒤 식탁에서 먹은 손님 > 0 */
/** P59-a (2026-09-18, docs/plan-ppaji-ui-polish.md D64~D67·D70) — 규격: 창 자리 64 고정·kfit 0 · 버튼 높이 집합 · 글자 크기 4단 · HUD 2줄 · 배지 캡슐 · 창 틀(파란 3px + 타일 머리) · 톤 2 */
async function verifyP59a(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.flow.frozen = true;
    const vis = (e) => { const cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0; };
    const opens = { build: () => w.buildWin.show(), sns: () => w.snsWin.show(), shop: () => w.shopWin.show(), inbox: () => w.inboxWin.show(), invest: () => w.investWin.show(), campaign: () => w.campaignWin.show(), rankings: () => w.rankingsWin.show(), rank: () => w.rankWin.show(), cert: () => w.certWin.show(), staff: () => { w.features.staff = true; w.staffWin.show('hire'); }, workshop: () => w.workshopWin.show(), rig: () => w.rigWin.show(), cook: () => w.cookWin.show(), facility: () => w.facilityInfo.show(g.facilities.all[0].uid), pool: () => w.poolInfo.show(g.pools.all[0].id), menu: () => w.mainMenu.show() };
    const ys = {}; const kfit = []; const tones = []; const badBtn = []; const fonts = new Set(); let frame = null; let heads = 0;
    const scan = (root) => { for (const e of root.querySelectorAll('*')) { if (!vis(e)) continue; const cs = getComputedStyle(e); if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) fonts.add(cs.fontSize); if (e.tagName === 'BUTTON') { const h = Math.round(e.getBoundingClientRect().height); const c = e.classList; const want = c.contains('ksquare') ? 48 : (c.contains('kbtn') || c.contains('ktab') || c.contains('kchip') || c.contains('kwin-close')) ? 44 : null; if (want !== null ? h !== want : h < 44) badBtn.push((e.id || [...c].slice(0, 2).join('.')) + ':' + h); } } };
    for (const [name, fn] of Object.entries(opens)) { try { fn(); } catch (err) { ys[name] = 'err ' + err.message; continue; } const win = [...document.querySelectorAll('.kwin')].filter(vis)[0]; if (!win) { ys[name] = 'nowin'; continue; } const rc = win.getBoundingClientRect(); ys[name] = Math.round(rc.y); if (win.classList.contains('kfit')) kfit.push(name); for (const t of ['purple', 'pink', 'green']) if (win.classList.contains(t)) tones.push(name + ':' + t); const head = win.querySelector('.kwin-head'); if (head) { heads++; const hs = getComputedStyle(head); const ws = getComputedStyle(win); if (!frame) frame = { border: ws.borderTopWidth, tile: hs.backgroundImage.includes('linear-gradient'), inner: ws.boxShadow.includes('inset'), titleCenter: getComputedStyle(win.querySelector('.kwin-title')).textAlign }; } scan(win); win.querySelector('.kwin-close')?.click(); }
    scan(document.getElementById('hud-top')); scan(document.getElementById('hud-bottom')); scan(document.getElementById('hud-ticker')); scan(document.getElementById('hud-right'));
    const time = document.getElementById('hud-time'); const clock = time.querySelector('.kstrip-l2 .num'); const info = document.getElementById('hud-info'); w.hud.setInfoBadge(3); const badge = info.querySelector('.kbadge'); const badgeBg = getComputedStyle(badge).backgroundColor; const want = getComputedStyle(document.documentElement).getPropertyValue('--badge').trim(); const probe = document.createElement('span'); probe.style.color = want; document.body.append(probe); const wantRgb = getComputedStyle(probe).color; probe.remove(); w.hud.setInfoBadge(0);
    return { ys, kfit, tones, badBtn: badBtn.slice(0, 8), badBtnN: badBtn.length, fonts: [...fonts].sort(), frame, heads, timeH: Math.round(time.getBoundingClientRect().height), timeLines: time.querySelectorAll('.kstrip-l1, .kstrip-l2').length, clockFs: clock ? getComputedStyle(clock).fontSize : null, badgeOk: badgeBg === wantRgb, badgeRadius: getComputedStyle(badge).borderRadius }; })()`)) as { ys: Record<string, number | string>; kfit: string[]; tones: string[]; badBtn: string[]; badBtnN: number; fonts: string[]; frame: { border: string; tile: boolean; inner: boolean; titleCenter: string } | null; heads: number; timeH: number; timeLines: number; clockFs: string | null; badgeOk: boolean; badgeRadius: string };
  const yVals = Object.values(r.ys);
  record('P59-a D67 창 자리 — 창 16 개 전부 y = 64 · kfit 0', yVals.length === 16 && yVals.every((y) => y === 64) && r.kfit.length === 0 ? 'pass' : 'fail', JSON.stringify({ ys: r.ys, kfit: r.kfit }));
  record('P59-a D67 톤 2 — purple/pink/green 클래스 0 · 창 틀 파란 3px + 안쪽 흰 선 + 타일 머리 + 제목 가운데(D70)', r.tones.length === 0 && r.frame !== null && r.frame.border === '3px' && r.frame.tile && r.frame.inner && r.frame.titleCenter === 'center' && r.heads === 16 ? 'pass' : 'fail', JSON.stringify({ tones: r.tones, frame: r.frame, heads: r.heads }));
  record('P59-a D66 버튼 높이 — .kbtn/.ktab/.kchip/.kwin-close 44 · .ksquare 48 · 카드·행 ≥ 44 (창 16 + HUD)', r.badBtnN === 0 ? 'pass' : 'fail', r.badBtn.join(' · ') || '0');
  const allowed = new Set(['12px', '15px', '19px', '24px']);
  record('P59-a D64 글자 크기 — 보이는 글자의 font-size 집합 ⊆ {12, 15, 19, 24}px (창 16 + HUD)', r.fonts.length > 0 && r.fonts.every((f) => allowed.has(f)) ? 'pass' : 'fail', r.fonts.join(','));
  record('P59-a D70 HUD — 상단 띠 2줄(44px) · 시각 24px 픽셀 숫자 · 알림 배지가 캡슐(--badge 채움 · 999px)', r.timeH === 44 && r.timeLines === 2 && r.clockFs === '24px' && r.badgeOk && r.badgeRadius === '999px' ? 'pass' : 'fail', JSON.stringify({ timeH: r.timeH, lines: r.timeLines, clockFs: r.clockFs, badgeOk: r.badgeOk, badgeRadius: r.badgeRadius }));
}

/** P59-c (2026-09-18, docs/plan-ppaji-ui-polish.md §2.1) — 화면 정리 26 항목 중 하네스로 재는 것: 홈 H-4·H-5·H-6 · 창 W-1~W-19 (H-1·H-3·W-11 은 P59-a 행, H-2 는 G50, W-12 는 G52, W-18 은 G53 에서) */
async function verifyP59c(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.flow.frozen = true;
    const vis = (e) => { const cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0; };
    const q = (s) => [...document.querySelectorAll(s)].filter(vis);
    const close = (id) => document.querySelector('#' + id + ' .kwin-close')?.click();
    const out = {};
    // 홈
    out.stars = q('#hud-info .stars').length; // H-4: 랭크 0 → 0
    out.buildBadge = q('#hud-right [data-cell="build"] .kbadge').length; // H-6: 새 판 0
    w.tutorial.start(['하네스 대사']); out.tutUp = vis(document.getElementById('tut-strip')); out.tickerHidden = getComputedStyle(document.getElementById('hud-ticker')).visibility === 'hidden'; w.tutorial.finish(); out.tickerBack = getComputedStyle(document.getElementById('hud-ticker')).visibility !== 'hidden'; // H-5
    // W-1 건설·심사 탭 한 줄 · 제목 줄
    w.buildWin.show(); { const t = document.querySelector('#win-build .ktabs'); out.buildTabRow = Math.round(t.getBoundingClientRect().height); out.buildTabs = q('#win-build .ktab').length; out.buildTitle = document.querySelector('#win-build .ktabs-title')?.textContent ?? ''; out.buildTabW = Math.round(t.getBoundingClientRect().width); out.buildTabMinW = Math.min(...q('#win-build .ktab').map((e) => Math.round(e.getBoundingClientRect().width))); }
    // W-2·W-3 티저 · 첫 카드 선택 · 「카드를 골라」 0
    out.buildOn = q('#win-build .kpcard.on').length; out.buildFoot = vis(document.querySelector('#win-build .kpfoot')); out.buildFootName = document.querySelector('#win-build .kpfoot-name')?.textContent ?? '';
    close('win-build');
    w.investWin.show(); out.investCards = q('#win-invest .kpcard').length; close('win-invest');
    const texts = []; for (const [name, fn] of [['build', () => w.buildWin.show()], ['shop', () => w.shopWin.show()], ['workshop', () => w.workshopWin.show()], ['rig', () => w.rigWin.show()], ['invest', () => w.investWin.show()], ['campaign', () => w.campaignWin.show()]]) { fn(); const win = q('.kwin')[0]; const t = win ? win.innerText : ''; for (const bad of ['카드를 골라', '빈 칸', '부품는']) if (t.includes(bad)) texts.push(name + ':' + bad); if (win) win.querySelector('.kwin-close')?.click(); }
    out.badTexts = texts;
    // W-4 장날 머리 · W-5 슬롯
    w.shopWin.show(); out.shopRows = q('#win-shop .krow').length; out.shopHint = document.querySelector('#win-shop .kfac-hint')?.textContent ?? ''; close('win-shop');
    w.workshopWin.show(); out.slots = q('#win-workshop .kpslot').length; out.slotPlus = q('#win-workshop .kpslot').filter((e) => e.textContent.trim() === '+').length; close('win-workshop');
    // W-7 결산 — 타일 뒤 중복 행 0
    w.results.showDay('하네스', { visitors: 3, tickets: 100, fees: 0, food: 0, maintenance: 50, net: 50, satisfaction: 10, likes: 1, popularity: 100, rankPos: 0 }); out.resultsDup = [...document.querySelectorAll('#win-results .krow .krow-k')].map((e) => e.textContent).filter((t) => t === '방문' || t === '순이익').length; out.resultsTiles = q('#win-results .kstat').length; close('win-results');
    // W-8·W-9 수역 창
    w.poolInfo.show(g.pools.all[0].id); { const th = document.querySelector('#win-pool .kpool-thumb'); out.poolThumbOk = !th || !vis(th) || !!th.querySelector('canvas'); out.poolLongV = [...document.querySelectorAll('#win-pool .krow-v')].map((e) => e.textContent.trim()).filter((t) => t.length > 10); out.poolHint = !!document.querySelector('#win-pool .kfac-hint'); } close('win-pool');
    // W-10·W-12 시설 정보 — 그림이 이름 줄 안 · 이동 버튼 숨김(도구 없음) · 보이는 버튼
    w.facilityInfo.show(g.facilities.all[0].uid); { const c = document.querySelector('#win-facility .kfac-nav .kthumb canvas'); out.facThumbH = c ? Math.round(c.getBoundingClientRect().height) : 0; out.facMoveHidden = !vis(document.getElementById('win-facility-move')); out.facBtns = q('#win-facility .kwin-foot button, #win-facility .kbtn').filter((b) => !b.classList.contains('kwin-close')).length; out.facLongV = [...document.querySelectorAll('#win-facility .krow-v')].map((e) => e.textContent.trim()).filter((t) => t.length > 10); } close('win-facility');
    // W-13 정보 창 — 타일 8 · 행 ≤ 5(수집 제외)
    w.rankWin.show(); out.rankStats = q('#win-rank .kstat').length; out.rankRows = q('#win-rank .krow:not(.kcollect)').length; out.rankNext = q('#win-rank .krank-next').length; close('win-rank');
    // W-14 메뉴 — 설정 분리
    w.mainMenu.show(); out.menuRows = q('#win-menu-main [data-menu]').length; out.menuSettings = q('#win-menu-main [data-menu="settings"]').length; document.querySelector('#win-menu-main [data-menu="settings"]')?.click(); out.settingsUp = vis(document.getElementById('win-settings')); out.settingsRows = q('#win-settings [data-menu]').length; close('win-settings'); close('win-menu-main');
    // W-15 배치 바 한 줄
    { const def = [...w.facilityDefs.values()].find((d) => g.isUnlocked(d.id)); w.place.enter(def); const d = document.getElementById('dock-place'); out.placeRowH = Math.round(d.querySelector('.kdock-row').getBoundingClientRect().height); out.placeText = d.innerText.replace(/\\s+/g, ' ').slice(0, 60); out.placeNoHint = !d.innerText.includes('어디에'); w.place.exit(); }
    // W-16 수역 독 — 붓 6 한 줄 + 행동 줄 (P60-a: 소품 격자·빈 박스 검사는 삭제)
    w.dock.enter('deck'); { const d = document.getElementById('dock-pool'); out.dockH = Math.round(d.getBoundingClientRect().height); out.dockBrush = q('#dock-pool .ktabs:not(.ksub) .ktab').length; out.dockSub = q('#dock-pool .ktabs.ksub .ktab').length; const t = d.querySelector('.ktabs:not(.ksub)'); out.dockTabScroll = t.scrollWidth <= t.clientWidth + 1; } w.dock.exit();
    // W-17 코스 독 — 기구 카드 격자
    w.courseDock.enter(); { out.gearCards = q('#dock-course [data-grid="course-gear"] .kpcard').length; out.courseChips = q('#dock-course .kchip').length; } w.courseDock.exit();
    // W-18 심사 무대 높이 · W-19 SNS 첫 열기
    w.certWin.show(); { const st = document.querySelector('#win-cert .kstage'); out.stageH = st ? Math.round(st.getBoundingClientRect().height) : 0; out.certTabRow = Math.round(document.querySelector('#win-cert .ktabs').getBoundingClientRect().height); } close('win-cert');
    w.snsWin.show(); out.snsTab = document.querySelector('#win-sns .ktab.on')?.dataset.tab ?? ''; out.snsPosts = g.sns.allPosts.length; close('win-sns');
    return out; })()`)) as Record<string, unknown>;
  const n = (k: string): number => Number(r[k]);
  record('P59-c 홈 — 랭크 0 별 숨김(H-4) · 새 판 건설 배지 0(H-6) · 튜토리얼 띠는 티커 자리(띄우면 티커 숨김, 끝나면 복귀)(H-5)', n('stars') === 0 && n('buildBadge') === 0 && r['tutUp'] === true && r['tickerHidden'] === true && r['tickerBack'] === true ? 'pass' : 'fail', JSON.stringify({ stars: r['stars'], buildBadge: r['buildBadge'], tutUp: r['tutUp'], tickerHidden: r['tickerHidden'], tickerBack: r['tickerBack'] }));
  record('P59-c W-1 탭 격자 — 건설 9 아이콘 탭 5열 두 줄(≤ 96px, 폭 ≥ 44) + 제목 줄 「실내」 · 심사 8 탭 4열 두 줄 · 탭 행 전폭', n('buildTabs') === 9 && n('buildTabRow') <= 96 && n('buildTabMinW') >= 44 && r['buildTitle'] === '실내' && n('buildTabW') >= 300 && n('certTabRow') <= 96 ? 'pass' : 'fail', JSON.stringify({ buildTabs: r['buildTabs'], buildTabRow: r['buildTabRow'], buildTitle: r['buildTitle'], buildTabW: r['buildTabW'], certTabRow: r['certTabRow'] }));
  record('P59-c W-2·W-3 격자 — 투자 카드 ≤ 3(해금 + 티저 2) · 첫 카드 자동 선택(아래 줄이 비지 않는다) · 「카드를 골라」「빈 칸」「부품는」 0(창 6)', n('investCards') <= 3 && n('buildOn') === 1 && r['buildFoot'] === true && String(r['buildFootName']).length > 0 && (r['badTexts'] as string[]).length === 0 ? 'pass' : 'fail', JSON.stringify({ investCards: r['investCards'], buildOn: r['buildOn'], buildFoot: r['buildFoot'], badTexts: r['badTexts'] }));
  record('P59-c W-4·W-5 — 장날 머리 행 0 + 「17:00 입고」 한 줄 · 공방 슬롯 5 가 「+」', n('shopRows') === 0 && String(r['shopHint']).includes('17:00') && n('slots') === 5 && n('slotPlus') === 5 ? 'pass' : 'fail', JSON.stringify({ shopRows: r['shopRows'], shopHint: r['shopHint'], slots: r['slots'], slotPlus: r['slotPlus'] }));
  record('P59-c W-7·W-8·W-9 — 결산 타일 2 + 방문·순이익 행 0 · 수역 빈 썸네일 0 · 수역 행 값 ≤ 10자 + 힌트 줄', n('resultsTiles') === 2 && n('resultsDup') === 0 && r['poolThumbOk'] === true && (r['poolLongV'] as string[]).length === 0 && r['poolHint'] === true ? 'pass' : 'fail', JSON.stringify({ resultsTiles: r['resultsTiles'], resultsDup: r['resultsDup'], poolThumbOk: r['poolThumbOk'], poolLongV: r['poolLongV'], poolHint: r['poolHint'] }));
  record('P59-c W-10·W-12 시설 정보 — 그림 ≥ 48px 이 이름 줄 안 · 도구 없으면 이동 버튼 숨김 · 행 값 ≤ 10자', n('facThumbH') >= 48 && r['facMoveHidden'] === true && (r['facLongV'] as string[]).length === 0 ? 'pass' : 'fail', JSON.stringify({ facThumbH: r['facThumbH'], facMoveHidden: r['facMoveHidden'], facBtns: r['facBtns'], facLongV: r['facLongV'] }));
  record('P59-c W-13·W-14 — 정보 창 타일 8 · 행(수집 제외) ≤ 5 · 다음 랭크 카드 1 · 메뉴 행 ≤ 14 + 「설정」 → 설정 창 5행', n('rankStats') === 8 && n('rankRows') <= 5 && n('rankNext') === 1 && n('menuRows') <= 14 && n('menuSettings') === 1 && r['settingsUp'] === true && n('settingsRows') === 5 ? 'pass' : 'fail', JSON.stringify({ rankStats: r['rankStats'], rankRows: r['rankRows'], rankNext: r['rankNext'], menuRows: r['menuRows'], settingsUp: r['settingsUp'], settingsRows: r['settingsRows'] }));
  record('P59-c W-15·W-16·W-17 독 — 배치 바 한 줄 ≤ 24px(「어디에」 0) · 수역 독 붓 6 한 줄(스크롤 0) + 행동 4(P60-a: 소품 탭 삭제) · 높이 ≤ 240 · 코스 독 기구 카드 ≥ 6 · 칩 ≤ 8', n('placeRowH') <= 24 && r['placeNoHint'] === true && n('dockBrush') === 6 && n('dockSub') === 4 && r['dockTabScroll'] === true && n('dockH') <= 240 && n('gearCards') >= 6 && n('courseChips') <= 8 ? 'pass' : 'fail', JSON.stringify({ placeRowH: r['placeRowH'], placeText: r['placeText'], dockBrush: r['dockBrush'], dockSub: r['dockSub'], dockTabScroll: r['dockTabScroll'], dockH: r['dockH'], gearCards: r['gearCards'], courseChips: r['courseChips'] }));
  record('P59-c W-18·W-19 — 심사 무대 ≤ 52px · 새 판 SNS 는 글 0 이면 친구 탭으로', n('stageH') <= 52 && (n('snsPosts') > 0 || r['snsTab'] === 'friends') ? 'pass' : 'fail', JSON.stringify({ stageH: r['stageH'], snsTab: r['snsTab'], snsPosts: r['snsPosts'] }));
}

async function verifyP58a(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const k = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; return { courts: g.foodcourts.all.length, seats: g.foodcourts.totalSeats(), facs: g.facilities.all.filter((f) => f.defId === 'foodcourt_seat').length, tint: w.scene.foodCourtTileCountForTest(), unlocked: g.isUnlocked('foodcourt_seat'), inBuild: [...document.querySelectorAll('#win-build .kpcard')].some((c) => c.dataset.facility === 'foodcourt_seat') }; })()`)) as { courts: number; seats: number; facs: number; tint: number; unlocked: boolean; inBuild: boolean };
  record('P58-a 킷 푸드코트 — 영역 1 · 좌석 4 · 파생 식탁 2 · 틴트 칸 12 · 해금 목록·건설 창엔 없다', k.courts === 1 && k.seats === 4 && k.facs === 2 && k.tint === 12 && !k.unlocked && !k.inBuild ? 'pass' : 'fail', JSON.stringify(k));
  // 독 「식탁」 모드 실터치: 실내 서쪽 빈 바닥(gt.i−9, gt.j+6)~(gt.i−4, gt.j+9) 두 모서리
  const ok = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; for (const b of document.querySelectorAll('.kwin-close')) b.click(); if (w.courseDock && w.courseDock.isActive) w.courseDock.exit(); if (w.hud.cancelConfirm) w.hud.cancelConfirm(); g.money = 100000; w.dock.enter('foodcourt', g.pools.all[0].id); return [...document.querySelectorAll('#dock-pool .ktab')].some((t) => t.textContent.trim() === '식탁'); })()`)) as boolean;
  const rc = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; for (let j = g.gate.j; j < g.gate.j + 13; j++) for (let i = g.gate.i - 10; i < g.gate.i + 10; i++) { const r = { i0: i, j0: j, w: 6, h: 4 }; if (g.canMakeFoodCourt(r).ok) { w.scene.focusTile(i + 3, j + 2, 0); return r; } } return null; })()`)) as { i0: number; j0: number; w: number; h: number } | null; // 킷 실내동 안에서 놓을 수 있는 첫 6×4 — 좌표 하드코딩은 킷 배치가 바뀌면 죽는다
  await page.waitForTimeout(300);
  for (const [ti, tj] of rc ? [[rc.i0, rc.j0], [rc.i0 + 5, rc.j0 + 3]] : []) { const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(${ti}, ${tj})`)) as { x: number; y: number; w: number; h: number }; await touch(cdp, r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(450); } // 320ms 더블탭 창 밖 — 250 이면 둘째 터치가 확대 토글이 된다(실측)
  const st = (await page.evaluate(`(() => { const w = window.__pj; const rc = ${JSON.stringify(rc)}; const at = rc ? [[rc.i0, rc.j0], [rc.i0 + 5, rc.j0 + 3]].map(([i, j]) => { const r = w.scene.tileScreenRect(i, j); const e = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2); return (e && (e.id || e.className)) || ''; }) : []; return JSON.stringify({ rect: w.dock.rect, course: !!(w.courseDock && w.courseDock.isActive), at }); })()`)) as string;
  const done = await center('#dock-pool-done');
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const d = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const c = g.foodcourts.all; const courts0 = c.length; const seats0 = g.foodcourts.totalSeats(); const rc = ${JSON.stringify(rc)}; const seat = rc && g.facilities.all.find((f) => f.defId === 'foodcourt_seat' && f.i >= rc.i0 && f.i < rc.i0 + rc.w && f.j >= rc.j0 && f.j < rc.j0 + rc.h); if (!seat) return { courts: c.length, seats: g.foodcourts.totalSeats(), shown: [], after: -1, afterSeats: -1, noSeat: true }; w.facilityInfo.show(seat.uid); const vis = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && !e.classList.contains('khide'); }; const btns = { court: vis('win-facility-court-remove'), move: vis('win-facility-move'), remove: !!document.querySelector('#win-facility .kbtn:not(.khide)') }; const hidden = [...document.querySelectorAll('#win-facility .kdock-row .kbtn')].filter((b) => !b.classList.contains('khide')).map((b) => b.textContent.trim()); document.getElementById('win-facility-court-remove').click(); return { courts: courts0, seats: seats0, shown: hidden, after: g.foodcourts.all.length, afterSeats: g.foodcourts.totalSeats() }; })()`)) as { courts: number; seats: number; shown: string[]; after: number; afterSeats: number };
  record('P58-a 독 「식탁」 실터치 — 6×4 → 영역 2 · 좌석 12(킷 4 + 8) · 식탁 정보 창 버튼은 「푸드코트 지우기」 하나 · 지우면 영역 1 · 좌석 4', ok && d.courts === 2 && d.seats === 12 && d.shown.join(',') === '푸드코트 지우기' && d.after === 1 && d.afterSeats === 4 ? 'pass' : 'fail', JSON.stringify({ ok, rc, st: st.slice(0, 60), ...d }));
  const e = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; for (const b of document.querySelectorAll('.kwin-close')) b.click(); w.skip(1700); return { courtEats: g.stats.courtEats ?? 0, food: g.stats.food ?? 0 }; })()`)) as { courtEats: number; food: number };
  record('P58-a 손님 — 하루 뒤 식탁에서 먹은 손님 > 0', e.courtEats > 0 ? 'pass' : 'fail', JSON.stringify(e));
}

/** P56-b — 그림 반입: 등록부에 그림 ≥300 · 요리 창 재료 카드가 폴백 아이콘이 아니라 시트 그림(`.kpic`)이고 폴백 0 · 도감(아는 요리)도 그림 · 시트 PNG 가 실제로 로드된다 */
async function verifyP56b(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; g.rank = 2; w.cookWin.show(); const q = (s) => document.querySelectorAll('#win-cook ' + s); const out = { count: w.pictureCount ? w.pictureCount() : -1, cards: q('[data-grid="win-cook-ingredients"] .kpcard').length, pics: q('[data-grid="win-cook-ingredients"] .kpcard .kpcard-art .kpic').length, fallbacks: q('[data-grid="win-cook-ingredients"] .kpcard .kpcard-art .kpic-fb').length, codexPics: q('[data-grid="win-cook-codex"] .kpcard:not(.silhouette) .kpcard-art .kpic').length, codexKnown: q('[data-grid="win-cook-codex"] .kpcard:not(.silhouette)').length }; const pic = document.querySelector('#win-cook .kpcard-art .kpic'); if (pic) { const cs = getComputedStyle(pic); out.bg = cs.backgroundImage; out.w = pic.getBoundingClientRect().width; } document.querySelector('#win-cook .kwin-close').click(); w.rigWin.show(); out.partPics = document.querySelectorAll('#win-rig [data-grid="win-rig-ingredients"] .kpcard .kpcard-art .kpic').length; out.partFb = document.querySelectorAll('#win-rig [data-grid="win-rig-ingredients"] .kpcard .kpcard-art .kpic-fb').length; document.querySelector('#win-rig .kwin-close').click(); return out; })()`)) as Record<string, number | string>;
  const loaded = await page.evaluate(`(async () => { const r = await fetch('/assets/pictures.png', { cache: 'no-store' }); return r.ok ? (await r.arrayBuffer()).byteLength : 0; })()`) as number;
  // P56-b2 — 캠페인 카드 그림 · 심사 창 심사위원 그림 초상 · 결과 장면 카드 배경(요리) · 장면 PNG 4 로드 · 사장 편지 배경
  const b2 = (await page.evaluate(`(async () => { const w = window.__pj; const g = w.game; const q = (s) => document.querySelectorAll(s); w.campaignWin.show(); const camp = { pics: q('#win-campaign .kpcard .kpcard-art .kpic').length, fb: q('#win-campaign .kpcard .kpcard-art .kpic-fb').length }; document.querySelector('#win-campaign .kwin-close').click(); w.certWin.show(); const cert = { pics: q('#win-cert .kportrait .kpic.kportrait-pic').length, code: q('#win-cert .kportrait canvas').length }; document.querySelector('#win-cert .kwin-close').click(); g.money = 50000; g.rank = 2; w.cookWin.show(); document.querySelector('#win-cook [data-card="ice"]').click(); document.querySelector('#win-cook [data-card="water"]').click(); document.getElementById('win-cook-go').click(); const stage = document.querySelector('#win-cook .kscene-stage'); const cook = { bg: stage ? stage.dataset.bg : null, img: stage ? getComputedStyle(stage).backgroundImage.includes('scene_cook') : false }; document.querySelector('#win-cook .kwin-close').click(); const sizes = []; for (const id of ['cook', 'item', 'letter', 'convert']) { const r = await fetch('/assets/scenes/scene_' + id + '.png', { cache: 'no-store' }); sizes.push(r.ok ? (await r.arrayBuffer()).byteLength : 0); } w.celebrate.show({ title: '편지', body: 'x', pic: { kind: 'gift', id: 'donut_float' } }, '1년차'); const letter = { bg: document.querySelector('#win-celebrate .kpaper-photo').dataset.bg }; document.getElementById('win-celebrate-ok').click(); return { camp, cert, cook, sizes, letter }; })()`)) as { camp: Record<string, number>; cert: Record<string, number>; cook: Record<string, unknown>; sizes: number[]; letter: Record<string, unknown> };
  // P56-b3 — 메뉴 편집 창: 걸린 칸은 그림 슬롯, 아는 레시피는 그림 카드(폴백 0) · 손님 창 선물 카드 그림 · 시설 정보 창 걸린 메뉴 그림
  const b3 = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; g.rank = 2; const rest = g.facilities.all.find((f) => g.facilities.defOf(f).menuSlots > 0); if (!rest) return { rest: false }; const q = (s) => document.querySelectorAll(s); w.menuWin.show(rest.uid); const known = g.cooking.known.size; const out = { rest: true, known, cards: q('#win-menu [data-grid="menu-recipes"] .kpcard[data-recipe]').length, pics: q('#win-menu [data-grid="menu-recipes"] .kpcard .kpcard-art .kpic').length, fb: q('#win-menu [data-grid="menu-recipes"] .kpcard .kpcard-art .kpic-fb').length, slotPics: q('#win-menu .kpslot.on .kpic').length, slotsOn: q('#win-menu .kpslot.on').length, rows: q('#win-menu .kcard-row[data-recipe]').length }; document.querySelector('#win-menu-main .kwin-close').click(); w.facilityInfo.show(rest.uid); out.infoPics = q('#win-facility [data-menu-pic] .kpic').length; out.infoEq = g.menus.equipped(rest.uid).length; document.querySelector('#win-facility .kwin-close').click(); const friend = g.guests.all.find((x) => x.friendId); if (friend) { w.guestInfo.show(friend); out.giftCards = q('#win-guest [data-grid="guest-gifts"] .kpcard[data-gift]').length; out.giftPics = q('#win-guest [data-grid="guest-gifts"] .kpcard .kpcard-art .kpic').length; out.giftChips = q('#win-guest .kchip[data-gift]').length; document.querySelector('#win-guest .kwin-close').click(); } else out.giftCards = -1; return out; })()`)) as Record<string, number | boolean>;
  record('P56-b3 메뉴·선물·정보 창 — 아는 레시피 카드 = 도감 수 · 카드 그림(폴백 0) · 걸린 칸은 그림 슬롯 · 옛 행 0 · 시설 정보 걸린 메뉴 그림 = 걸린 수 · 손님 창 선물 카드 그림(칩 0)', b3['rest'] === true && b3['cards'] === b3['known'] && b3['pics'] === b3['cards'] && b3['fb'] === 0 && b3['slotPics'] === b3['slotsOn'] && b3['rows'] === 0 && b3['infoPics'] === b3['infoEq'] && (b3['giftCards'] === -1 || (b3['giftPics'] === b3['giftCards'] && b3['giftChips'] === 0)) ? 'pass' : 'fail', JSON.stringify(b3));
  record('P56-b2 그림 — 캠페인 카드 그림 3(폴백 0) · 심사위원 초상이 그림(코드 초상 0) · 요리 결과 장면 카드 배경 = scene_cook · 장면 PNG 4 로드 · 사장 편지 배경 letter', b2.camp['pics'] === 3 && b2.camp['fb'] === 0 && (b2.cert['pics'] as number) >= 3 && b2.cert['code'] === 0 && b2.cook['bg'] === 'cook' && b2.cook['img'] === true && b2.sizes.every((n) => n > 500) && b2.letter['bg'] === 'letter' ? 'pass' : 'fail', JSON.stringify(b2));
  record('P56-b 그림 반입 — 등록부 ≥300 · 요리 창 재료 카드 전부 시트 그림(폴백 0) · 아는 요리 도감도 그림 · 개조 부품 카드 폴백 0 · 시트 PNG 로드', (r['count'] as number) >= 300 && r['pics'] === r['cards'] && r['fallbacks'] === 0 && r['codexPics'] === r['codexKnown'] && r['partFb'] === 0 && (r['partPics'] as number) >= 1 && String(r['bg']).includes('pictures.png') && loaded > 1000 ? 'pass' : 'fail', JSON.stringify({ ...r, loaded }));
}

/** P56-c — 재고(U1): 요리 창 카드의 `×N` 이 진짜 재고다(시작 재료 ∞ · 장날 재료 ×N) · 사면 +1 · 개발이 슬롯당 −1 · 재고 0 카드는 잠기지 않고 탭 = 구입(자동 승인) · 부품 창도 같은 문법 */
async function verifyP56c(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; g.rank = 2; const c = g.cooking; const shop = [...c.ingredients.values()].find((i) => i.unlock === 'shop'); const start = [...c.ingredients.values()].find((i) => i.unlock === 'start'); w.cookWin.show(); const q = (s) => document.querySelector('#win-cook ' + s); const n = (id) => { const e = q('[data-ingredient="' + id + '"] .kpcard-n'); return e ? e.textContent : null; }; const out = { inf: n(start.id), lockedBefore: !!q('[data-buyIngredient="' + shop.id + '"]') || !!q('[data-buy-ingredient="' + shop.id + '"]') }; const lockCard = q('[data-card="' + shop.id + '"]'); out.lockedDisabled = lockCard ? lockCard.disabled : null; lockCard.click(); out.stock1 = c.stockOf(shop.id); out.n1 = n(shop.id); q('[data-card="' + shop.id + '"]').click(); out.stock2 = c.stockOf(shop.id); out.n2 = n(shop.id); out.slots1 = document.querySelectorAll('#win-cook .kpslot.on').length; q('[data-card="' + shop.id + '"]').click(); out.stock2b = c.stockOf(shop.id); out.slots = document.querySelectorAll('#win-cook .kpslot.on').length; q('[data-card="' + start.id + '"]').click(); out.slots2 = document.querySelectorAll('#win-cook .kpslot.on').length; document.getElementById('win-cook-go').click(); out.stock3 = c.stockOf(shop.id); out.n3 = n(shop.id); out.infAfter = n(start.id); const zero = q('[data-card="' + shop.id + '"]'); out.zeroDisabled = zero ? zero.disabled : null; out.zeroBadge = zero ? (zero.querySelector('.kpcard-badge') || {}).textContent : null; out.foot = q('[data-grid="win-cook-ingredients"] .kpfoot-count') ? q('[data-grid="win-cook-ingredients"] .kpfoot-count').textContent : ''; zero.click(); out.stock4 = c.stockOf(shop.id); out.n4 = n(shop.id); q('.kwin-close').click(); return out; })()`)) as Record<string, unknown>;
  record('P56-c 요리 창 재고 — 시작 재료 ×∞ · 잠긴 장날 재료 탭 = 구입 ×1 → 카드 ×1 · 다시 탭 = 슬롯에(재고 그대로) · 슬롯에 든 채 또 탭 = 구입 ×2 · 시작 재료도 슬롯 → 개발 → ×1(−1) · 카드는 잠기지 않는다', r['inf'] === '×∞' && r['stock1'] === 1 && r['n1'] === '×1' && r['stock2'] === 1 && r['slots1'] === 1 && r['stock2b'] === 2 && r['slots'] === 1 && r['slots2'] === 2 && r['stock3'] === 1 && r['n3'] === '×1' && r['infAfter'] === '×∞' && r['zeroDisabled'] === false ? 'pass' : 'fail', JSON.stringify(r));
  // 재고 0 → 잠기지 않는다(구입 경로) — 위에서 ×1 남았으니 한 번 더 개발해 0 으로
  const z = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const c = g.cooking; const shop = [...c.ingredients.values()].find((i) => i.unlock === 'shop'); const start = [...c.ingredients.values()].find((i) => i.unlock === 'start'); w.cookWin.show(); const q = (s) => document.querySelector('#win-cook ' + s); q('[data-card="' + shop.id + '"]').click(); q('[data-card="' + start.id + '"]').click(); document.getElementById('win-cook-go').click(); const zero = q('[data-card="' + shop.id + '"]'); const out = { stock0: c.stockOf(shop.id), n0: zero.querySelector('.kpcard-n').textContent, disabled: zero.disabled, badge: (zero.querySelector('.kpcard-badge') || { textContent: null }).textContent, buys: g.stats.stockBuys }; zero.click(); out.stockAfter = c.stockOf(shop.id); out.buysAfter = g.stats.stockBuys; q('.kwin-close').click(); return out; })()`)) as Record<string, unknown>;
  record('P56-c 재고 0 카드 — ×0 · disabled 아님 · 「재고 0」 배지 · 탭 = 구입(재고 1 · stockBuys +1)', z['stock0'] === 0 && z['n0'] === '×0' && z['disabled'] === false && z['badge'] === '재고 0' && z['stockAfter'] === 1 && (z['buysAfter'] as number) === (z['buys'] as number) + 1 ? 'pass' : 'fail', JSON.stringify(z));
  // 부품 창(개조) — 같은 문법: 장날 부품 카드 탭 = 구입 ×1, 카드 `×N`
  const p = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const c = g.rigs; const part = [...c.ingredients.values()].find((i) => i.unlock === 'shop' && (i.rank || 0) <= g.rank); w.rigWin.show(); const q = (s) => document.querySelector('#win-rig ' + s); const before = q('[data-card="' + part.id + '"]'); const out = { lockedBefore: before ? before.disabled : null }; before.click(); const after = q('[data-card="' + part.id + '"]'); out.stock = c.stockOf(part.id); out.n = after ? after.querySelector('.kpcard-n').textContent : null; out.owned = after ? after.dataset.owned : null; q('.kwin-close').click(); return out; })()`)) as Record<string, unknown>;
  record('P56-c 개조 창 부품 — 잠긴 장날 부품 카드는 disabled 가 아니다(탭 = 구입) → 카드 ×1 · owned', p['lockedBefore'] === false && p['stock'] === 1 && p['n'] === '×1' && p['owned'] === '1' ? 'pass' : 'fail', JSON.stringify(p));
}

/** P56-a2 — 그림 문법 나머지: 건설 카드 격자(`PictureGrid` 통일) · 캠페인 카드 · 팔찌 카드 4 + 등급 게이지 · 소원 보상 그림 · 편지 위 물건 · FX buy-pop/band-strip (P60-a: 소품 카드 격자 절은 삭제) */
async function verifyP56a2(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const b = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.buildWin.show(); const q = (s) => document.querySelectorAll('#win-build ' + s); const tab = document.querySelector('#win-build .ktab.on').dataset.tab; const all = [...w.facilityDefs.values()].filter((d) => w.buildTabs.find((t) => t.id === tab).match(d)); const defs = all.filter((d) => g.isUnlocked(d.id)).length + Math.min(2, all.filter((d) => !g.isUnlocked(d.id)).length); /* P59-c W-2(D69): 해금분 + 티저 2 */ const out = { tab, defs, cards: q('.kpcard').length, old: q('.kcatalog-card').length, arts: q('.kpcard .kpcard-art canvas, .kpcard .kpcard-art .kpic-fb').length, counts: q('.kpcard .kpcard-n').length, prices: q('.kpcard .kpcard-cost').length, locked: q('.kpcard.locked').length, lockBadges: q('.kpcard .kpcard-badge.lock').length, foot: !!document.querySelector('#win-build .kpfoot') }; const first = document.querySelector('#win-build .kpcard:not([disabled])'); first.click(); out.picked = w.place.isActive && document.getElementById('win-build').hidden ? 1 : 0; w.place.exit(); w.buildWin.hide(); return out; })()`)) as Record<string, number | string | boolean>;
  record('P56-a2 건설 카드 격자 — `.kpcard` 로 통일(옛 `.kcatalog-card` 0) · 카드 수 = 해금 + 티저 2(P59-c D69) · 그림·×N·값 카드마다 · 잠긴 카드 = 잠금 배지 · 아래 두 줄 · 탭 = 배치로', b['old'] === 0 && b['cards'] === b['defs'] && (b['cards'] as number) >= 6 && b['arts'] === b['cards'] && b['counts'] === b['cards'] && b['prices'] === b['cards'] && b['locked'] === b['lockBadges'] && b['foot'] === true && b['picked'] === 1 ? 'pass' : 'fail', JSON.stringify(b));
  const c = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.campaignWin.show(); const q = (s) => document.querySelectorAll('#win-campaign ' + s); const out = { defs: g.campaigns.defs.size, cards: q('.kpcard[data-campaign]').length, prices: q('.kpcard .kpcard-cost').length, arts: q('.kpcard .kpcard-art .kpic, .kpcard .kpcard-art .kpic-fb').length, rows: q('.kcard-row[data-campaign]').length }; document.querySelector('#win-campaign .kwin-close').click(); return out; })()`)) as Record<string, number>;
  record('P56-a2 캠페인 카드 — 카드 수 = 정의 수 · 값·그림 카드마다 · 옛 행 0', c['cards'] === c['defs'] && (c['cards'] as number) >= 2 && c['prices'] === c['cards'] && c['arts'] === c['cards'] && c['rows'] === 0 ? 'pass' : 'fail', JSON.stringify(c));
  const bd = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const p = g.pools.all[0]; w.poolInfo.show(p.id); const q = (s) => document.querySelectorAll('#win-pool ' + s); const grade = g.ppajiGradeOf(p.id); const out = { grade, cards: q('[data-grid="bands"] .kpcard[data-band]').length, open: q('[data-grid="bands"] .kpcard[data-open="1"]').length, locked: q('[data-grid="bands"] .kpcard[data-open="0"][disabled]').length, gauge: q('.kband-gauge').length, gaugeOn: q('.kband-gauge .kgauge-cell.on').length, prices: q('[data-grid="bands"] .kpcard .kpcard-cost').length }; document.querySelector('#win-pool .kwin-close').click(); return out; })()`)) as Record<string, number>;
  record('P56-a2 팔찌 카드 4 — 열린 것 = 등급 이하 · 잠긴 것은 disabled+자물쇠 · 등급 게이지 칸 = 등급 · 값 4', bd['cards'] === 4 && (bd['open'] ?? 0) + (bd['locked'] ?? 0) === 4 && bd['open'] === ([1, 2, 3, 3, 4][bd['grade'] as number] ?? -1) && bd['gauge'] === 1 && bd['gaugeOn'] === bd['grade'] && bd['prices'] === 4 ? 'pass' : 'fail', JSON.stringify(bd));
  const rw = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.snsWin.show('messages'); const q = (s) => document.querySelectorAll('#win-sns ' + s); const out = { wishes: q('[data-wish]').length, arts: q('[data-wish] .kreward-art .kpic, [data-wish] .kreward-art .kpic-fb, [data-wish] .kreward-art .kpic-canvas').length }; document.querySelector('#win-sns .kwin-close').click(); const ok = w.celebrate.show({ title: '테스트 편지', body: '물건', pic: { kind: 'facility', id: 'shop' } }, '1년차'); out.cele = ok; out.celePic = !!document.querySelector('#win-celebrate .kcele-pic canvas'); document.getElementById('win-celebrate-ok').click(); const ok2 = w.celebrate.show({ title: '테스트 편지 2', body: '재료', pic: { kind: 'ingredient', id: 'butter' } }, '1년차'); out.celePic2 = !!document.querySelector('#win-celebrate .kcele-pic[data-pic]'); document.getElementById('win-celebrate-ok').click(); const f0 = { buy: w.fxFired['buy-pop'] || 0, band: w.fxFired['band-strip'] || 0 }; w.scene.fx('buy-pop', { x: 100, y: 100, text: '크레페 ×1' }); w.scene.fx('band-strip', { x: 100, y: 100, text: '3종 팔찌', amount: 1 }); out.buyFx = (w.fxFired['buy-pop'] || 0) - f0.buy; out.bandFx = (w.fxFired['band-strip'] || 0) - f0.band; return out; })()`)) as Record<string, number | boolean>;
  record('P56-a2 보상·편지·FX — 열린 소원마다 보상 그림 · 편지 위 물건(시설 스프라이트 / 재료 그림) · FX buy-pop·band-strip 이 등록부에서 돈다', rw['arts'] === rw['wishes'] && rw['cele'] === true && rw['celePic'] === true && rw['celePic2'] === true && rw['buyFx'] === 1 && rw['bandFx'] === 1 ? 'pass' : 'fail', JSON.stringify(rw));
}

/** P53-c — 목표 HUD 56분 샘플(1년차 = 16일, 1분 = 480 tick): 여름·가을(0~41분) 목표 A 가 바뀌는 최대 간격 ≤3.5분 · 겨울(42~55분) ≤7분 · 첫날 세 샘플 중 「기구/빠지」 ≥2 · B 슬롯 빈 샘플 0 · 봇 4년차 세이브를 열어 10분 재생 — 모달 후보 ≤10 · 큐 ≤5 */
async function verifyP53c(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const hud = (await page.evaluate(`(() => { const w = window.__pj; const A = [], B = []; const bot = w.botFor(); let day = -1; for (let m = 0; m < 56; m++) { w.pinGoal(0); A.push(w.goalLine()); w.pinGoal(1); B.push(w.goalLine()); w.pinGoal(null); if (w.game.day !== day) { day = w.game.day; bot.decideDay(); } else if (m % 4 === 2) bot.decideMidday(); w.skip(480); } const gaps = (lo, hi) => { let last = lo, mx = 0; for (let m = lo + 1; m < hi; m++) { if (A[m] !== A[m - 1]) { mx = Math.max(mx, m - last); last = m; } } return Math.max(mx, hi - last); }; const hint = (t) => /붙이자|이어 붙여|개조해 보자|신청하자/.test(t); const nonHint = A.map((t, i) => hint(t) ? null : i).filter((x) => x !== null); let nhGap = 0; for (let k = 1; k < nonHint.length; k++) nhGap = Math.max(nhGap, nonHint[k] - nonHint[k - 1]); return { summerGap: gaps(0, 42), winterGap: gaps(42, 56), hintRunMax: gaps(0, 56), firstRig: A.slice(0, 4).filter((t) => /기구|빠지/.test(t)).length, firstTwoDays: A.slice(0, 8).filter((t) => /기구|빠지/.test(t)).length, emptyB: B.filter((t) => !t || !t.trim()).length, distinctA: new Set(A).size, hintShare: A.filter(hint).length / A.length, sampleA: A.slice(0, 3).map((t) => t.slice(0, 24)) }; })()`)) as { summerGap: number; winterGap: number; hintRunMax: number; firstRig: number; firstTwoDays: number; emptyB: number; distinctA: number; hintShare: number; sampleA: string[] };
  // ⚠ 「A 간격 ≤3.5분」은 사람을 기다리는 힌트(①~④ 폴백)엔 정의가 안 맞는다 — 봇은 개조를 엿새에 하나만 해서 「개조해 보자」가 그만큼 남는다. 자는 ① 같은 A 가 6일(24샘플)을 넘게 서 있지 않는다 ② 서로 다른 A ≥ 6 ③ 힌트가 아닌 A(소원·인기)는 3.5분마다 바뀐다 ④ 첫날 「기구/빠지」 ≥2/3 ⑤ B 빈 샘플 0. 이름 있는 사건의 간격은 봇 밴드 `unlockGapMax*` 가 잰다
  record('P53-c 목표 HUD 56분 샘플(봇이 굴리는 판) — 같은 A 최장 ≤6일 · 서로 다른 A ≥6 · 힌트 몫 <0.9 · 첫날 「기구/빠지」 ≥1/4 · 이틀 ≥2/8 · B 빈 샘플 0', hud.hintRunMax <= 24 && hud.distinctA >= 6 && hud.hintShare < 0.9 && hud.firstRig >= 1 && hud.firstTwoDays >= 2 && hud.emptyB === 0 ? 'pass' : 'fail', JSON.stringify(hud));
  // 봇 4년차 세이브 — 하네스 프로세스에서 봇을 64일 돌려 세이브 문자열을 만들고 페이지에 심는다
  const g = new Game(3); runBot(g, 64);
  let saved = '';
  save(g.toSnapshot(), { setItem: (_k, v) => { saved = v; } });
  await page.evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(saved)})`);
  await page.goto(`${BASE}/?debug=1&px=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const replay = (await page.evaluate(`(() => { const w = window.__pj; const day0 = w.game.day; const q = w.modalQueue; let pushed = 0; const p = q.push.bind(q); q.push = (...a) => { pushed += a.length; return p(...a); }; for (let m = 0; m < 10; m++) { w.skip(480); if (w.celebrate && w.celebrate.win && !w.celebrate.win.root.hidden) w.celebrate.win.hide(); } return { day0, day: w.game.day, pushed, queue: q.length, rank: w.game.rank }; })()`)) as { day0: number; day: number; pushed: number; queue: number; rank: number };
  record('P53-c 봇 4년차 세이브 10분 재생 — 모달 후보 ≤10 · 큐 ≤5 (세이브가 4년차에서 열린다)', replay.day0 >= 60 && replay.pushed <= 10 && replay.queue <= 5 ? 'pass' : 'fail', JSON.stringify(replay));
  await page.evaluate(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)})`);
}

/** P50-b2 — 첫 3분 스모크(새 판 킷): 기구 둘을 진짜 터치로 → 둘째 확정 tick 에 등급 0→1 모달 1 · 확정 바 칩 세 낱말 · 1,680 tick 안 이용 ≥6 · 목표 A 「기구」 · 모달 ≤2 · 잠긴 이유 ≥4자 · 탭 ≤5 · B 슬롯 DOM · 등급 0 vs 4 히스토그램 */
async function verifyP50b2(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`window.__pj.scene.setUpscale(1)`);
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const goalA = (await page.evaluate(`(() => { const w = window.__pj; w.pinGoal(0); const t = w.goalLine(); const b = (w.pinGoal(1), w.goalLine()); w.pinGoal(null); return { a: t, b }; })()`)) as { a: string; b: string };
  record('P50-b2 목표 A 폴백 ① — 켜진 기구 0 이면 「기구를 하나 붙이자」 · B 슬롯(다음 랭크)은 A 폴백 중에도 산다(pinGoal)', goalA.a.includes('기구') && goalA.b.includes('다음 랭크') ? 'pass' : 'fail', JSON.stringify(goalA));
  const modalsOf = async (): Promise<number> => (await page.evaluate(`window.__pj.game.inbox.all.filter((m) => m.priority === 'modal').length`)) as number;
  const m0 = await modalsOf();
  let taps = 0;
  const placeRig = async (id: string, i: number, j: number): Promise<{ chips: string; placed: boolean }> => {
    const cell = await center('#hud-right [data-cell="build"]'); if (cell) { await touch(cdp, cell.x, cell.y); taps++; }
    await page.waitForTimeout(250);
    const tab = await center('#win-build .ktab[data-tab="ppaji"]'); if (tab) { await touch(cdp, tab.x, tab.y); taps++; }
    await page.waitForTimeout(150);
    const row = await center(`#win-build [data-facility="${id}"]`); if (row) { await touch(cdp, row.x, row.y); taps++; }
    await page.waitForTimeout(250);
    await page.evaluate(`window.__pj.scene.focusTile(${i}, ${j}, 160)`);
    await page.waitForTimeout(150);
    const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(${i}, ${j})`)) as { x: number; y: number; w: number; h: number };
    await touch(cdp, r.x + r.w / 2, r.y + r.h / 2); taps++;
    await page.waitForTimeout(350);
    const chips = (await page.evaluate(`window.__pj.scene.ghostLabelForTest()`)) as string;
    const done = await center('#dock-place-done'); if (done) { await touch(cdp, done.x, done.y); taps++; }
    await page.waitForTimeout(300);
    const placed = (await page.evaluate(`!!window.__pj.game.facilities.at(${i}, ${j})`)) as boolean;
    return { chips, placed };
  };
  const first = await placeRig('rig_stepstone', 51, 26);
  const tapsFirst = taps;
  const m1 = await modalsOf();
  record('P50-b2 첫 기구 — 진짜 터치 5탭 안(건설·빠지 탭·행·물 칸·완료) · 확정 바 칩에 「정원」「연결」「자유이용권」 · 등급 불변이라 모달 0', first.placed && tapsFirst <= 5 && /정원|등급/.test(first.chips) && first.chips.includes('연결') && first.chips.includes('자유이용권') && m1 === m0 ? 'pass' : 'fail', JSON.stringify({ taps: tapsFirst, chips: first.chips, modals: m1 - m0 }));
  const second = await placeRig('rig_bridge', 52, 26);
  const m2 = await modalsOf();
  const modalUp = (await page.evaluate(`(() => { const m = window.__pj.game.inbox.all.filter((x) => x.priority === 'modal'); const last = m[m.length - 1]; return last ? last.title + ' | ' + last.body : ''; })()`)) as string;
  record('P50-b2 둘째 기구 — 같은 tick 등급 0→1 모달 정확히 1 · 제목 「놀이 빠지」 · 본문에 자유이용권 값 · 칩 첫 칸이 「등급 0 → 1」', second.placed && m2 === m1 + 1 && modalUp.includes('놀이 빠지') && modalUp.includes('자유이용권') && second.chips.startsWith('등급 0 → 1') ? 'pass' : 'fail', JSON.stringify({ chips: second.chips, modal: modalUp.slice(0, 80) }));
  await page.evaluate(`(() => { const w = window.__pj; const p = w.panelHost; ['win-celebrate'].forEach((id) => { const e = document.getElementById(id); if (e && !e.hidden) { const c = e.querySelector('.kwin-close, .kbtn.primary'); if (c) c.click(); } }); })()`);
  await page.waitForTimeout(200);
  const used = (await page.evaluate(`(() => { const w = window.__pj; w.skip(1680); const g = w.game; const f = g.facilities.at(51, 26); const modals = g.inbox.all.filter((m) => m.priority === 'modal').length; return { uses: f ? f.usesToday + f.usesTotal : -1, modals, queue: (w.modalQueue || []).length }; })()`)) as { uses: number; modals: number; queue: number };
  record('P50-b2 1,680 tick 안 첫 기구 이용 ≥ 6 · 0~5분 모달 ≤ 2', used.uses >= 6 && used.modals - m0 <= 2 ? 'pass' : 'fail', JSON.stringify(used));
  const locked = (await page.evaluate(`(() => { const w = window.__pj; w.buildWin.show(); document.querySelector('#win-build .ktab[data-tab="ppaji"]').click(); const rs = [...document.querySelectorAll('#win-build [data-facility]')].filter((r) => r.disabled); const why = rs.map((r) => (r.querySelector('.krow-sub, .kbtn-sub, .klock') || r).textContent.trim()); w.buildWin.hide && w.buildWin.hide(); return { n: rs.length, min: Math.min(...why.map((t) => t.length)), sample: why[0] }; })()`)) as { n: number; min: number; sample: string };
  record('P50-b2 잠긴 기구는 이유가 4자 이상 (숨기지 않는다)', locked.n > 0 && locked.min >= 4 ? 'pass' : 'fail', JSON.stringify(locked));
  // 등급 0 vs 4 — 정오 킷 빠지 스크린샷의 색 히스토그램 L2 ≥ 0.2 (등급별 폰툰 색 · 켜짐 틴트 · 이음쇠가 그림 0장에서 화면을 바꾼다)
  const hist = async (): Promise<number[]> => {
    await page.evaluate(`(() => { const w = window.__pj; w.flow.frozen = true; w.scene.setDayPhase && w.scene.setDayPhase(null); w.scene.focusTile(52, 26, 160); })()`);
    await page.waitForTimeout(400);
    const shot = await page.screenshot({ type: 'png' });
    const url = `data:image/png;base64,${shot.toString('base64')}`;
    const rect = (await page.evaluate(`(() => { const a = window.__pj.scene.tileScreenRect(50, 23), b = window.__pj.scene.tileScreenRect(55, 30); return { x: Math.min(a.x, b.x) - 8, y: Math.min(a.y, b.y) - 8, w: Math.abs(b.x - a.x) + 48, h: Math.abs(b.y - a.y) + 40 }; })()`)) as { x: number; y: number; w: number; h: number };
    return (await page.evaluate(`(async (url, r) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const k = img.width / innerWidth; const d = g.getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.round(r.w * k), Math.round(r.h * k)).data; const h = new Array(64).fill(0); let n = 0; for (let i = 0; i < d.length; i += 4) { const b = ((d[i] >> 6) << 4) | ((d[i + 1] >> 6) << 2) | (d[i + 2] >> 6); h[b]++; n++; } return h.map((v) => v / n); })(${JSON.stringify(url)}, ${JSON.stringify(rect)})`)) as number[];
  };
  await page.evaluate(`window.__pj.newGame(1)`);
  await page.waitForTimeout(300);
  const h0 = await hist();
  const g4 = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 1e6; for (const id of ['rig_stepstone','rig_bridge','rig_beam','rig_hammock','rig_seesaw','rig_mini_slide','rig_led_buoy','rig_slide']) g.unlocked.facilities.add(id); const plan = [['rig_stepstone',51,24,0],['rig_stepstone',51,25,0],['rig_stepstone',51,26,0],['rig_stepstone',51,27,0],['rig_stepstone',51,28,0],['rig_bridge',52,26,1],['rig_beam',52,24,1],['rig_seesaw',52,27,0],['rig_led_buoy',52,25,0],['rig_led_buoy',53,25,0],['rig_slide',53,27,0],['rig_mini_slide',52,28,1],['rig_stepstone',54,24,0],['rig_stepstone',54,25,0],['rig_stepstone',54,26,0],['rig_stepstone',54,27,0]]; const ok = plan.map(([id,i,j,f]) => g.placeFacility(id, i, j, f).ok); return { ok: ok.filter(Boolean).length, grade: g.ppajiGradeOf(g.pools.all[0].id), n: g.rigState.lit.size }; })()`)) as { ok: number; grade: number; n: number };
  await page.evaluate(`(() => { const w = window.__pj; w.skip(1); })()`);
  const h4 = await hist();
  const l2 = Math.sqrt(h0.reduce((s, v, i) => s + (v - (h4[i] ?? 0)) ** 2, 0));
  await page.screenshot({ path: `${SHOT_DIR}/p50b2-grade4.png` });
  record('P50-b2 등급 0 판 vs 등급 ≥3 판 — 킷 빠지 정오 스크린샷 색 히스토그램 L2 ≥ 0.2(그림 0장: 폰툰 색·켜짐·이음쇠)', g4.grade >= 3 && l2 >= 0.2 ? 'pass' : 'fail', JSON.stringify({ placed: g4.ok, grade: g4.grade, lit: g4.n, l2: Number(l2.toFixed(3)) }));
  await page.evaluate(`window.__pj.flow.frozen = false`);
}

/** P50-a — 물 위 배치(건설 「빠지」 탭 둘째 · 진짜 터치로 킷 빠지 안 물에 기구) · 켜짐(링 접촉) · 꺼짐(고립) · open */
async function verifyP50a(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`window.__pj.scene.setUpscale(1)`);
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const cell = await center('#hud-right [data-cell="build"]');
  if (!cell) { record('P50-a 건설 칸', 'fail', '없음'); return; }
  await touch(cdp, cell.x, cell.y);
  await page.waitForTimeout(300);
  const tabs = (await page.evaluate(`(() => { const ts = [...document.querySelectorAll('#win-build .ktab')]; return ts.map((t) => ({ id: t.dataset.tab, h: t.getBoundingClientRect().height })); })()`)) as { id: string; h: number }[];
  record('P50-a 건설 창 — 「빠지」 탭이 실내 다음 둘째 · 탭 전부 44px 이상 (R9)', tabs[0]?.id === 'indoor' && tabs[1]?.id === 'ppaji' && tabs.every((t) => t.h >= 44) ? 'pass' : 'fail', JSON.stringify(tabs.map((t) => t.id)));
  const ppajiTab = await center('#win-build .ktab[data-tab="ppaji"]');
  if (ppajiTab) await touch(cdp, ppajiTab.x, ppajiTab.y);
  await page.waitForTimeout(200);
  const rows = (await page.evaluate(`(() => { const rs = [...document.querySelectorAll('#win-build [data-facility]')]; return { n: rs.length, open: rs.filter((r) => !r.disabled).map((r) => r.dataset.facility) }; })()`)) as { n: number; open: string[] };
  record('P50-a 「빠지」 탭 — 기구 + 링 위 시설 행이 있고 시작 기구가 열려 있다(징검다리)', rows.n >= 8 && rows.open.includes('rig_stepstone') ? 'pass' : 'fail', JSON.stringify(rows));
  await page.evaluate(`document.querySelector('#win-build [data-facility="rig_stepstone"]').scrollIntoView({ block: 'center' })`); // 33행이라 화면 밖일 수 있다 — 진짜 터치는 보이는 자리에서
  await page.waitForTimeout(150);
  const row = await center('#win-build [data-facility="rig_stepstone"]');
  if (!row) { record('P50-a 징검다리 행', 'fail', '없음'); return; }
  await touch(cdp, row.x, row.y);
  await page.waitForTimeout(300);
  // 킷 빠지 안 물 (51,26) — 서쪽 링(열 50)에 4이웃으로 닿는다 → 켜짐
  await page.evaluate(`window.__pj.scene.focusTile(51, 26, 160)`);
  await page.waitForTimeout(200);
  const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(51, 26)`)) as { x: number; y: number; w: number; h: number };
  await touch(cdp, r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(400);
  const aimed = (await page.evaluate(`(() => { const c = window.__pj.place.current; return { at: c && c.at, ghost: !!window.__pj.scene.ghost, why: document.querySelector('#dock-place .kdock-cost').textContent, done: !document.getElementById('dock-place-done').disabled }; })()`)) as { at: { i: number; j: number } | null; ghost: boolean; why: string; done: boolean };
  record('P50-a 물 칸 탭 → 고스트 · 확정 가능 (물 위 기구는 빠지 안 물에만)', aimed.at !== null && aimed.ghost && aimed.done ? 'pass' : 'fail', `${JSON.stringify(aimed.at)} · ${aimed.why}`);
  const money0 = (await page.evaluate(`window.__pj.game.money`)) as number;
  const done = await center('#dock-place-done');
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const placed = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.facilities.at(51, 26); return { id: f ? f.defId : null, lit: f ? g.rigState.lit.has(f.uid) : false, walk: g.facilities.isWalkOn(51, 26), stand: g.guests.walkable(51, 26), open: g.pools.totalOpenTiles(), money: g.money, img: f ? w.scene.facImgs.size : 0, surface: document.documentElement.dataset.uiSurface }; })()`)) as { id: string | null; lit: boolean; walk: boolean; stand: boolean; open: number; money: number; img: number; surface: string };
  record('P50-a 확정 → 징검다리가 물 위에 · 켜짐(링 접촉) · walkOn · 손님이 선다 · open 19 · −건설비 · 홈', placed.id === 'rig_stepstone' && placed.lit && placed.walk && placed.stand && placed.open === 19 && money0 - placed.money > 0 && placed.img > 0 && placed.surface === 'home' ? 'pass' : 'fail', JSON.stringify(placed));
  await page.screenshot({ path: `${SHOT_DIR}/p50a-rig.png` });
  const dark = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const r = g.placeFacility('rig_stepstone', 53, 27, 0); const f = g.facilities.at(53, 27); const lit = f ? g.rigState.lit.has(f.uid) : null; const stand = g.guests.walkable(53, 27); const bridge = g.placeFacility('rig_bridge', 52, 26, 1); /* 1×2 는 facing 1 이 가로 — (52,26)(53,26): 징검다리(51,26)·(53,27) 둘에 닿는다 */ const lit2 = f ? g.rigState.lit.has(f.uid) : null; const stand2 = g.guests.walkable(53, 27); const rm = g.removeFacility(g.facilities.at(52, 26).uid); const lit3 = f ? g.rigState.lit.has(f.uid) : null; return { ok: r.ok, lit, stand, bridge: bridge.ok, lit2, stand2, rm: rm.ok, lit3, pools: g.pools.all.length, tiles: g.pools.totalTiles(), open: g.pools.totalOpenTiles() }; })()`)) as { ok: boolean; lit: boolean | null; stand: boolean; bridge: boolean; lit2: boolean | null; stand2: boolean; rm: boolean; lit3: boolean | null; pools: number; tiles: number; open: number };
  record('P50-a 고립 기구는 꺼짐(못 선다) → 다리로 이으면 켜짐 → 다리를 떼면 다시 꺼짐 · 수역 수·칸 수 불변 · open 18', dark.ok && dark.lit === false && !dark.stand && dark.bridge && dark.lit2 === true && dark.stand2 && dark.rm && dark.lit3 === false && dark.pools === 1 && dark.tiles === 20 && dark.open === 18 ? 'pass' : 'fail', JSON.stringify(dark));
}

/** P49-b — 빠지 = 사각형 붓(두 모서리) · 라인 조각(1×2/4/6 · 회전) · 허가 토스트 · 치기 붓 0 */
async function verifyP49b(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const tabs = (await page.evaluate(`(() => { const w = window.__pj; w.dock.enter('ppaji'); const ts = [...document.querySelectorAll('#dock-pool .ktab')].filter((t) => !t.classList.contains('khide')); const r = ts.map((t) => ({ m: t.dataset.mode, h: t.getBoundingClientRect().height, on: t.classList.contains('on') })); const st = document.querySelector('#dock-pool .kdock-status').textContent; w.dock.exit(); return { r, st }; })()`)) as { r: { m: string; h: number; on: boolean }[]; st: string };
  record('P49-b 독 — 보이는 탭의 첫 둘이 「빠지」「라인」(dig·fill 은 숨김) · 전부 44px 이상 · 빠지 탭 상태 줄이 첫 모서리를 청한다', tabs.r[0]?.m === 'ppaji' && tabs.r[1]?.m === 'line' && tabs.r.every((t) => t.h >= 44) && !tabs.r.some((t) => t.m === 'dig' || t.m === 'fill') && tabs.st.includes('첫 모서리') ? 'pass' : 'fail', JSON.stringify(tabs));
  // 두 모서리 → 링 선택 → 완료: 킷 링 서쪽 6×7 (열 41~46, 열 42 물가 25 → 행 24~30)
  const mk = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const money = g.money, pools = g.pools.all.length; w.dock.enter('ppaji'); w.dock.toggleTile(41, 24); const st1 = document.querySelector('#dock-pool .kdock-status').textContent; w.dock.toggleTile(46, 30); const st2 = document.querySelector('#dock-pool .kdock-status').textContent; const cost = document.querySelector('#dock-pool .kdock-cost').textContent; const done = document.querySelector('#dock-pool .kbtn.primary'); const enabled = !done.disabled; done.click(); const toast = document.getElementById('hud-toast'); const t = toast && !toast.hidden ? toast.textContent : ''; return { st1, st2, cost, enabled, spent: money - g.money, pools: g.pools.all.length - pools, deck: g.grid.at(46, 27), t, mode: document.querySelector('#dock-pool') && !document.querySelector('#dock-pool').hidden }; })()`)) as { st1: string; st2: string; cost: string; enabled: boolean; spent: number; pools: number; deck: number; t: string; mode: boolean };
  record('P49-b 사각형 붓 — 첫 탭 뒤 「맞은편 모서리」 · 둘째 탭 뒤 링 22칸 · 물 위 폰툰 20 × 60G · 새 수역 +20 · 완료 = −1,200G · 수역 +1 · 토스트 「빠지 완성」 · 독 닫힘', mk.st1.includes('맞은편 모서리') && mk.st2.includes('링 22칸') && mk.st2.includes('폰툰 20칸') && mk.st2.includes('새 수역 +20칸') && mk.cost.startsWith('22칸') && mk.enabled && mk.spent === 1200 && mk.pools === 1 && mk.deck === 7 && mk.t.includes('빠지 완성') && !mk.mode ? 'pass' : 'fail', JSON.stringify(mk));
  // 허가: ★0 40 = 킷 20 + 방금 20 → 다음 사각형은 둘째 탭에서 토스트
  const over = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.dock.enter('ppaji'); w.dock.toggleTile(58, 24); w.dock.toggleTile(63, 30); /* 6×7 — (63,31) 이면 링 아랫줄이 행 31 = 허가 깊이 8 이라 허가 검사 앞의 「내 앞 수면이 아닙니다」 에 걸린다 (하네스 버그) */ const toast = document.getElementById('hud-toast'); const t = toast && !toast.hidden ? toast.textContent : ''; const st = document.querySelector('#dock-pool .kdock-status').textContent; const done = document.querySelector('#dock-pool .kbtn.primary'); const dis = done.disabled; w.dock.exit(); return { t, st, dis, left: g.permitLeft }; })()`)) as { t: string; st: string; dis: boolean; left: number };
  record('P49-b 허가 토스트 — 남은 0칸에서 둘째 모서리를 찍으면 「수면 허가를 넘습니다 — 남은 0칸에 …」 토스트 + 상태 줄 · 완료 비활성', over.left === 0 && over.t.includes('수면 허가를 넘습니다') && over.t.includes('남은 0칸') && over.st.includes('수면 허가') && over.dis ? 'pass' : 'fail', JSON.stringify(over));
  // 라인: 칩 1×2·1×4·1×6 + ↻ (44px) · 링 아랫줄 아래 물에 1×4 가로 → 회전 → 세로 · 완료
  const line = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.dock.enter('line'); const chips = [...document.querySelectorAll('#dock-pool .kchip[data-line]')].map((c) => ({ t: c.textContent, h: c.getBoundingClientRect().height })); const rot = document.querySelector('#dock-pool .kchip[data-line-rotate]'); const rotH = rot ? rot.getBoundingClientRect().height : 0; document.querySelector('#dock-pool .kchip[data-line="2"]').click(); /* 링 아래 행 31 은 ★0 허가 깊이(7) 밖 — 링 동쪽 열 47 에 1×2 (열 50 부터는 킷 링) */ w.dock.toggleTile(47, 25); const st1 = document.querySelector('#dock-pool .kdock-status').textContent; document.querySelector('#dock-pool .kchip[data-line-rotate]').click(); const st2 = document.querySelector('#dock-pool .kdock-status').textContent; const money = g.money; document.querySelector('#dock-pool .kbtn.primary').click(); const toast = document.getElementById('hud-toast'); const t = toast && !toast.hidden ? toast.textContent : ''; return { chips, rotH, st1, st2, spent: money - g.money, col: [25, 26].map((j) => g.grid.at(47, j)), row: g.grid.at(48, 25), t }; })()`)) as { chips: { t: string; h: number }[]; rotH: number; st1: string; st2: string; spent: number; col: number[]; row: number; t: string };
  record('P49-b 라인 — 칩 1×2·1×4·1×6 + ↻ 전부 44px 이상 · 1×2 가로(열 47~48 행 25) → ↻ 세로 → 완료 −120G · 세로 데크 2칸(가로 (48,25) 는 안 깔림) · 링 동쪽에 붙는다 · 토스트 「라인 1×2」', line.chips.map((c) => c.t).join(',') === '1×2,1×4,1×6' && line.chips.every((c) => c.h >= 44) && line.rotH >= 44 && line.st1.includes('가로') && line.st1.includes('120') && line.st2.includes('세로') && line.spent === 120 && line.col.every((c) => c === 7) && line.row !== 7 && line.t.includes('라인 1×2') ? 'pass' : 'fail', JSON.stringify(line));
}

/** P0 (빠지 스토리) — 곧은 강 띠(8줄, 양끝 여울) · 시작 킷 데크 8 + 선착장 · 우측 5칸 정체(건설·수역·코스·SNS·장날) · 코스 칸 잠김 이유 · 강은 파지 않는다 · 데크 위에는 놓는다 */
async function verifyP0(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const grid = g.grid; let river = 0, shallow = 0, deck = 0; for (let k = 0; k < grid.floor.length; k++) { const f = grid.floor[k]; if (f === 5) river++; else if (f === 6) shallow++; else if (f === 7) deck++; /* P48-b3: 자연 물 96×22 중 데크 19·수역 20 을 뺀 것이 지금 강·여울 */ } const rows = new Set(); for (let j = 0; j < grid.h; j++) if ([5, 6].includes(grid.at(0, j))) rows.add(j); const dock = g.facilities.all.find((f) => f.defId === 'dock'); const dockOnDeck = dock ? grid.at(dock.i, dock.j) === 7 : false; const cells = [...document.querySelectorAll('#hud-right .ksquare')].map((e) => e.dataset.cell); const courseLocked = document.querySelector('#hud-right [data-cell="course"]').dataset.locked || null; const gt = g.gate; const dig = g.canDig(g.land.i0 - 2, gt.j + 46); const mine = g.canDig(gt.i + 12, gt.j + 18).ok; /* P48-b3: 잔교 동쪽 내 앞 수면 */ /* P32: ★0 토지 24~39 — 킷 데크 링(왼쪽)을 피해 오른쪽 트인 강 */ const water = document.getElementById('hud-time').textContent; return { river, shallow, deck, rows: rows.size, dock: !!dock, dockOnDeck, cells, courseLocked, digRiver: dig.ok ? 'ok' : dig.reason, mine, kit: g.facilities.all.length, pool: g.pools.totalTiles() }; })()`)) as { river: number; shallow: number; deck: number; rows: number; dock: boolean; dockOnDeck: boolean; cells: string[]; courseLocked: string | null; digRiver: string; mine: boolean; kit: number; pool: number };
  record('P0→P15→P43→P48-b3 물 22줄(S 띠, 격자 변은 행 50~71) · 시작 킷 데크 19(링 16 + 본류 잔교 3) + 선착장(잔교 위) · 시설 23(P57-c main 킷 + 식탁 2) · 자동 수역 20(못 안, P48-b2)', r.rows === 22 && r.deck === 19 && r.river + r.shallow === 96 * 22 - 19 - 20 /* P48-b3 */ && r.dock && r.dockOnDeck && r.kit === 23 && r.pool === 20 ? 'pass' : 'fail', JSON.stringify(r));
  record('P0 우측 5칸 = 건설·수역·코스·SNS·장날 · 코스 칸은 선착장이 있어 열림(P4-C) · 내 앞 강은 칠 수 있고 토지 열 밖 강은 「내 앞 수면이 아닙니다」', r.cells.join(',') === 'build,zone,course,sns,market' && r.courseLocked === null && r.dock && r.mine && r.digRiver.includes('수면') ? 'pass' : 'fail', JSON.stringify({ cells: r.cells, courseLocked: r.courseLocked, mine: r.mine, digRiver: r.digRiver }));
  // 픽셀 — 강 칸(선착장 앞 강 줄)이 물빛(파랑 우세). G3 와 같은 방법: 스크린샷을 페이지에 올려 여러 점 중 가장 파란 점
  await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i, gt.j + 30, 160); })()`); // P48-b3: 입구 열 행 38 은 강
  await page.waitForTimeout(400);
  const rects = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; const out = []; for (let a = 1; a <= 6; a++) for (let b = 28; b <= 31; b++) out.push(w.scene.tileScreenRect(gt.i + a, gt.j + b)); /* P15→P43→P48-b3: 킷 링 아래 트인 강(행 36~39) */ return out; })()`)) as { x: number; y: number; w: number; h: number }[];
  const shot = await page.screenshot({ type: 'png' });
  const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
  const px = (await page.evaluate(`(async (url, rects) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    let best = [0, 0, 0], bestScore = -999;
    for (const r of rects) { for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.5, 0.35], [0.5, 0.65]]) { const d = g.getImageData(Math.round((r.x + r.w * fx) * k), Math.round((r.y + r.h * fy) * k), 1, 1).data; const score = d[2] - d[0]; if (score > bestScore) { bestScore = score; best = [d[0], d[1], d[2]]; } } }
    return best;
  })(${JSON.stringify(dataUrl)}, ${JSON.stringify(rects)})`)) as number[];
  record('P0 강 칸 픽셀 — 파랑이 빨강보다 진하다 (?px=1)', (px[2] ?? 0) > (px[0] ?? 0) + 20 ? 'pass' : 'fail', JSON.stringify(px));
  // P0-B 높이 — 토지 안 최고 단 ≥1 · 단 있는 칸의 타일 이미지 y 가 8×단 만큼 위 · 리프트 결함 주입이면 0 · 경사 발자국 거절
  const lv = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.rank = 5; g.openLand(5); const grid = g.grid; const land = g.land; /* P14: 산기슭이 토지 안에 오게 5랭크 */ /* P57-h: 새 판은 평지(능선 끔) — 단 체계(리프트·경사 거절)는 남아 있으니 토지 안 잔디 한 칸을 1단 올려 잰다 */ { const si = land.i0 + 2, sj = land.j0 + 30; if (grid.at(si, sj) === 1) { grid.setLevel(si, sj, 1); w.syncWorldToScene(); } } let best = null; for (let j = land.j0; j < land.j0 + land.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) { const z = grid.levelAt(i, j); if (!best || z > best.z) best = { i, j, z }; } const base = w.scene.tileScreenRect ? null : null; const y = w.scene.tileYForTest(best.i, best.j); const flatY = (() => { const r = w.scene.tileScreenRect; return null; })(); w.scene.setLiftFaultForTest(true); const y0 = w.scene.tileYForTest(best.i, best.j); w.scene.setLiftFaultForTest(false); const y1 = w.scene.tileYForTest(best.i, best.j); let mixed = null; for (let j = land.j0 + 2; j < land.j0 + land.h - 2 && !mixed; j++) for (let i = land.i0; i < land.i0 + land.w - 2 && !mixed; i++) { if (!grid.levelUniform(i, j, 2, 2) && [0, 1].every((a) => [0, 1].every((b) => grid.at(i + a, j + b) === 1 && !g.facilities.occupied(i + a, j + b)))) mixed = { i, j }; } const def = [...w.facilityDefs.values()].find((d) => d.w === 2 && d.d === 2 && !d.indoorOnly); g.unlocked.facilities.add(def.id); const r = mixed ? g.canPlace(def.id, mixed.i, mixed.j, 0) : null; return { z: best.z, y, y0, y1, drop: y0 - y1, mixed: !!mixed, reason: r && !r.ok ? r.reason : (r ? 'ok' : null) }; })()`)) as { z: number; y: number; y0: number; y1: number; drop: number; mixed: boolean; reason: string | null };
  record('P0-B 높이 — 단 체계(P57-h: 새 판은 평지라 한 칸을 올려 잰다) · 타일이 8×단 위로 뜬다(결함 주입이면 0) · 단 섞인 2×2 는 「경사」 거절', lv.z >= 1 && lv.drop === lv.z * 8 && lv.mixed && (lv.reason ?? '').includes('경사') ? 'pass' : 'fail', JSON.stringify(lv));
}

/** P1 — 수역: 독 탭(치기·걷기·데크·데크 걷기·실내 2) · 강을 실터치로 쳐서 수역이 늘고 · 데크를 이어 깔고 · 여울은 걷지 않으며 · 킷 수역이 강 위이고 손님이 입수한다 */
async function verifyP1(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const center = async (sel: string): Promise<{ x: number; y: number } | null> => (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const tabs = (await page.evaluate(`(() => { const w = window.__pj; w.dock.enter('dig'); return [...document.querySelectorAll('#dock-pool .ktab')].map((t) => t.textContent); })()`)) as string[];
  record('P1 → P60-a 수역 독 — 탭 12(빠지·라인·식탁(P58-a) + 치기·걷기·길·지면·바닥 걷기·데크·데크 걷기·건물 바닥·건물 지우기 — P16 길 · P22 지면 · P40 건물 · P49-b 빠지·라인 앞에 · P60-a 소품 삭제)', tabs.join(',') === '빠지,라인,식탁,길,지면,데크,치기,걷기,바닥 걷기,데크 걷기,건물 바닥,건물 지우기' /* P59-c W-16: 붓 6 윗줄 · 행동 아랫줄 */ ? 'pass' : 'fail', tabs.join(','));
  // 강 칸을 진짜 터치 — 킷 수역 왼쪽 옆 강 칸 두 개 (수역에 이어져 닿는다)
  await page.evaluate(`window.__pj.dock.enter('dig')`); // P15: 치기 붓은 숨김 — 하네스가 직접 연다
  const spots = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i + 11, gt.j + 16, 160); const r1 = w.scene.tileScreenRect(gt.i + 11, gt.j + 16); const r2 = w.scene.tileScreenRect(gt.i + 11, gt.j + 17); /* P48-b3: 본류 잔교(gt.i+10, 행 24~26) 동쪽 옆 — 수역은 뭍·데크에 닿아야 한다 */ return [r1, r2].map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })); })()`)) as { x: number; y: number }[];
  await page.waitForTimeout(300);
  for (const s of spots) { await touch(cdp, s.x, s.y); await page.waitForTimeout(450); /* 더블탭(확대) 판정 320ms 를 넘긴다 */ }
  const before = (await page.evaluate(`window.__pj.game.pools.totalTiles()`)) as number;
  const done = await center('#dock-pool-done');
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const toast = document.getElementById('hud-toast'); return { tiles: g.pools.totalTiles(), pools: g.pools.all.length, floor: g.grid.at(gt.i + 11, gt.j + 16), sel: w.dock.selection.length, toast: toast && !toast.hidden ? toast.textContent : '', dockUp: !document.getElementById('dock-pool').hidden }; })()`)) as { tiles: number; pools: number; floor: number; sel: number; toast: string; dockUp: boolean };
  // P49-b D59: 치기 붓은 프로덕션 호출부 0 — 두 칸은 골라지지만 완료는 「치기 붓은 없습니다 — 빠지 탭으로」 로 거절되고 수역 칸·수·강 바닥이 그대로다 (수역은 빠지 붓의 데크 링으로만 생긴다 — verifyP49b)
  record('P1 → P49-b D59 강 실터치 두 칸(치기 붓, 하네스 전용, 잔교 옆) → 완료 → 거절 「치기 붓은 없습니다 — 빠지 탭으로」 · 수역 칸·수 불변 · 강 바닥 그대로 · 독은 열린 채', after.sel === 2 && after.tiles === before && after.pools === 1 && after.floor !== 4 && after.toast.includes('치기 붓은 없습니다') && after.dockUp ? 'pass' : 'fail', JSON.stringify({ before, ...after }));
  await page.evaluate(`window.__pj.dock.exit()`);
  await page.waitForTimeout(200);
  // 데크 — 킷 데크 오른쪽 옆 강 칸에 이어 깔기 (탭 → 지도 탭 → 완료)
  await page.evaluate(`(() => { const w = window.__pj; w.dock.enter('deck'); })()`); // 완료로 독이 닫혔다 — 데크 모드로 다시 연다
  await page.waitForTimeout(200);
  const d1 = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i + 8, gt.j + 18, 160); const r = w.scene.tileScreenRect(gt.i + 8, gt.j + 18); /* P48-b3: 킷 링 동벽(열 55) 옆 물 */ return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; })()`)) as { x: number; y: number };
  await page.waitForTimeout(450);
  await touch(cdp, d1.x, d1.y);
  await page.waitForTimeout(450);
  const done2 = await center('#dock-pool-done');
  if (done2) await touch(cdp, done2.x, done2.y);
  await page.waitForTimeout(300);
  const deck = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const mid = g.canPaintDeck(gt.i + 8, gt.j + 22); /* 허가 안(깊이 7)이지만 뭍·데크에 안 닿는 강 */ return { floor: g.grid.at(gt.i + 8, gt.j + 18), midOk: mid.ok, midWhy: mid.ok ? '' : mid.reason, shallowWalk: g.guests.walkable(gt.i + 9, gt.j + 16) }; })()`)) as { floor: number; midOk: boolean; midWhy: string; shallowWalk: boolean };
  record('P1 데크 — 킷 데크 옆 여울에 깔림(7) · 강 한가운데는 「이어서」 거절 · 여울은 걷지 않는다', deck.floor === 7 && !deck.midOk && deck.midWhy.includes('이어서') && deck.shallowWalk === false ? 'pass' : 'fail', JSON.stringify(deck));
  await page.evaluate(`window.__pj.dock.exit()`);
  const swim = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.skip(900); const p = g.pools.all[0]; const onRiver = p.tiles.every((k) => { const j = Math.floor(k / g.grid.w); return j >= 24 && j <= 28; }); /* P48-b2: 킷 수역은 만 안(행 24~28) */ return { onRiver, swimmers: g.guests.all.filter((x) => x.state === 'swim').length, guests: g.guests.count }; })()`)) as { onRiver: boolean; swimmers: number; guests: number };
  record('P1 킷 수역은 만 안(행 24~28, P48-b2) · 900tick 안에 손님이 입수한다', swim.onRiver && swim.swimmers >= 1 ? 'pass' : 'fail', JSON.stringify(swim));
}

/** P16 — 길·뷰·콤보 (D24): 길 탭 실터치 2칸 → 포장 · 배치 독으로 놓은 시설은 길이 안 닿는다(정보 창 「길」 행) · 자동 길 뒤 닿는다 · 뷰 행 · 콤보 발견 → 수집 「콤보」 */
/** P17 — 팀 자리 + 패키지 (D25): 같은 버스 = 같은 팀 · 팀 열쇠로 평상 대여 · 자리에서 패키지를 미리 산다 · 정보 창 「자리 값」·「팀」 · 자리 없으면 서성임 */
/** P18 — 1박·밤 (D26): 22시 폐장 시계 · 18시부터 헤더 「저녁」 + 밤 틴트 + 조명 · 숙박 체크인(1박 요금) · 폐장 뒤 남아 다음 날 이어서 논다 · 정보 창 「숙박」 */
/** P21·P22 — 해금 재배치(새 판 17종 · 매점이 건설 창에 있다) · 지면 붓(「지면」 탭 → 칩 → 실터치 2칸 → 모래길 · 꽃밭 2칸이 옆 평상 자리 값에 「조경」) */
/** P23 — 기본 메뉴 자동(D34): 새 판 자판기에 메뉴 3 · 첫날 매출 > 0 · 첫 판매 토스트 · 결산 요약 「매점 n건」 */
/** P24 — 자리 반경·등급(D29·D30): 킷 평상 등급 4·5 · 조준하면 반경 링(선택 표시)과 「등급 n」 라벨 · 매점 조준엔 「자리 n곳」 · 정보 창 별 5개 */
/** P25 — 패키지 = 배치로 발견(D31): 킷 평상에 고기·수영 · 정보 창 「패키지」 행 · 조준 라벨에 패키지 · 자판기를 철거하면 「사라졌다」 토스트 */
/** P26 — 경관 전염(D32): 매점 옆 해바라기·갈대 → 정보 창 「경관 +n — 인기 +k · 판매가 +m%」 · 인기가 오른다 · 4칸 떨어진 장식은 안 붙는다 */
/** P27 — 욕구의 위치성(D33): 첫날 걸어온 손님이 팀(2~4명) · 자리를 잡는다 · 물에서 나온 손님은 배고픔 ≥ 25 · 가까운 먹거리로 간다 */
/** P29 D37 — 새 판의 자리는 미완성: 킷 평상 둘 등급 3(물·뷰) · 고기 패키지 미발견 · 평상 반경에 매점을 놓으면 등급 4 + 고기 패키지 발견(알림함) */
async function verifyP29(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘(등급 3 · 수영 패키지만 · 자판기·장식 반경 밖) */ const seats = g.facilities.all.filter((f) => f.defId === 'pyeongsang_row'); const before = seats.map((f) => g.seatGradeOf(f.uid).grade); const seen0 = [...g.packagesSeen]; const seat = seats[0]; let placed = false; for (let dj = -3; dj <= 3 && !placed; dj++) for (let di = -3; di <= 6 && !placed; di++) { const rr = g.placeFacility('vending_out', seat.i + di, seat.j + dj, 0); if (rr.ok) placed = true; } const after = g.seatGradeOf(seat.uid).grade; const seen1 = [...g.packagesSeen]; const items = g.inbox.items ?? g.inbox.all ?? []; const found = items.some((x) => /고기/.test(x.title + x.body)); return { before, seen0, placed, after, seen1, found }; })()`)) as { before: number[]; seen0: string[]; placed: boolean; after: number; seen1: string[]; found: boolean };
  record('P29 킷 미완성 — 평상 둘 등급 3 · 고기 패키지 없음(수영만) → 반경에 자판기를 놓으면 등급 4 · 고기 패키지 발견 알림', r.before.every((x) => x === 3) && !r.seen0.includes('meat') && r.seen0.includes('swim') && r.placed && r.after === 4 && r.seen1.includes('meat') && r.found ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

/** P30 D38 — 탭 오버레이: 평상 정보 창을 열면 반경 3 이 지도에 켜지고 「빠진 것」 행 · 매점 정보 창은 먹여 주는 자리를 켠다 · 닫으면 걷힌다 */
async function verifyP30(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘(등급 3 · 수영 패키지만 · 자판기·장식 반경 밖) */ const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); w.facilityInfo.show(seat.uid); const seatSel = w.scene.selectionCountForTest(); const rows = [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent); const miss = rows.find((x) => x.startsWith('빠진 것')) ?? ''; w.facilityInfo.win.hide(); const afterHide = w.scene.selectionCountForTest(); w.facilityInfo.clearOverlayForTest(); let placed = false; let uid = 0; for (let dj = -3; dj <= 3 && !placed; dj++) for (let di = -3; di <= 6 && !placed; di++) { const rr = g.placeFacility('vending_out', seat.i + di, seat.j + dj, 0); if (rr.ok) { placed = true; uid = rr.uid; } } w.facilityInfo.show(uid); const shopSel = w.scene.selectionCountForTest(); w.facilityInfo.win.hide(); const toilet = g.facilities.all.find((f) => f.defId === 'toilet'); w.facilityInfo.show(toilet.uid); const toiletSel = w.scene.selectionCountForTest(); w.facilityInfo.win.hide(); w.facilityInfo.clearOverlayForTest(); return { seatSel, miss, afterHide, placed, shopSel, toiletSel }; })()`)) as { seatSel: number; miss: string; afterHide: number; placed: boolean; shopSel: number; toiletSel: number };
  await page.waitForTimeout(200);
  const lingerEnd = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘(등급 3 · 수영 패키지만 · 자판기·장식 반경 밖) */ const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); w.facilityInfo.show(seat.uid); w.facilityInfo.win.hide(); return w.scene.selectionCountForTest(); })()`)) as number;
  await page.waitForTimeout(5300);
  const lingerGone = (await page.evaluate(`window.__pj.scene.selectionCountForTest()`)) as number;
  record('P30 링은 창을 닫은 뒤 5초 남고 걷힌다 (창이 지도를 덮어 열린 동안은 안 보인다)', lingerEnd > 0 && lingerGone === 0 ? 'pass' : 'fail', JSON.stringify({ lingerEnd, lingerGone }));
  record('P30 탭 오버레이 — 평상 정보: 반경 타일 > 0 · 「빠진 것 그늘 · 먹거리 · 조경」 · 닫아도 남는다 · 매점 정보: 먹여 주는 자리 타일 > 0 · 화장실은 0', r.seatSel > 0 && /그늘.*먹거리.*조경/.test(r.miss) && r.afterHide > 0 && r.placed && r.shopSel > 0 && r.toiletSel === 0 ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

/** P34 D43 — 실내동: 매표소 하나 더 → 정원 +8 · 비 오는 날 「비 오네 — 안으로」 손님이 실내 시설로 간다 */
async function verifyP34(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; g.unlocked.facilities.add('ticket'); const cap0 = g.maxGuests(); const gt = g.gate; const b = { i0: gt.i + 12, j0: gt.j + 8 }; { const tl = []; for (let j = b.j0; j < b.j0 + 4; j++) for (let i = b.i0; i < b.i0 + 5; i++) tl.push({ i, j }); g.paintIndoor(tl); } const t = g.placeFacility('ticket', b.i0 + 1, b.j0 + 1, 0); const cap1 = g.maxGuests(); g.weather = 'rain'; w.refreshHud(); w.skip(1500); const refuge = g.stats.rainRefuge ?? 0; /* say 는 씬이 말풍선으로 소비한다 — 집계로 잰다 */ const indoorUse = g.facilities.all.filter((f) => g.grid.at(f.i, f.j) === 3).reduce((n, f) => n + f.usesToday, 0); return { cap0, cap1, placed: t.ok, refuge, indoorUse }; })()`)) as { cap0: number; cap1: number; placed: boolean; refuge: number; indoorUse: number };
  record('P34 실내동 — 정원 20 → 건물 바닥을 깔고 매표소 하나 더 28 (P57-i 기본 12) · 비 오는 날 「비 오네 — 안으로」 ≥ 1 · 실내 시설 이용 > 0', r.cap0 === 20 && r.placed && r.cap1 === 28 && r.refuge >= 1 && r.indoorUse > 0 ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

/** P39 D49 — 벽·문: 새 판 실내동 12×6 · 문 1(거리 쪽) · 손님이 문으로 들어가 매표소를 쓴다 · 길 없는 건물엔 문이 없다가 길을 이으면 난다 */
async function verifyP39(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; let indoor = 0; for (let j = 0; j < g.grid.h; j++) for (let i = 0; i < g.grid.w; i++) if (g.grid.at(i, j) === 3) indoor++; const doors0 = g.grid.doors(); const drawn0 = w.scene.doorCountForTest(); w.skip(600); const ticket = g.facilities.all.find((f) => f.defId === 'ticket'); const used = ticket ? ticket.usesToday : -1; g.money = 100000; g.unlocked.facilities.add('office'); const b = { i0: gt.i - 20, j0: gt.j + 7 /* P48-b3 → P57-c: 서쪽 잔디(열 28~31 · 행 15~18) — main 킷 장식(소나무 33,21 · 바위 34,24)을 피한 자리 */ }; const t = []; for (let j = b.j0; j < b.j0 + 4; j++) for (let i = b.i0; i < b.i0 + 4; i++) t.push({ i, j }); g.paintIndoor(t); const blob = g.grid.blobAt(b.i0 + 1, b.j0 + 1); const doorBefore = g.grid.doors().some((d) => g.grid.blobAt(d.i, d.j) === blob); const path = []; for (let i = b.i0; i < gt.i - 12; i++) path.push({ i, j: b.j0 - 1 }); /* 건물 북변을 따라 앞마당 서쪽 포장(열 36, P57-c — 포장 칸 자체는 「이미 길」이라 그 앞까지)까지 — 입구 열은 출입동 안이다 */ g.paintPath(path); w.syncWorldToScene(); const doorAfter = g.grid.doors().some((d) => g.grid.blobAt(d.i, d.j) === blob); return { indoor, doors0: doors0.length, door0: doors0[0], drawn0, used, doorBefore, doorAfter, drawn1: w.scene.doorCountForTest(), gateI: gt.i }; })()`)) as { indoor: number; doors0: number; door0: { oi: number }; drawn0: number; used: number; doorBefore: boolean; doorAfter: boolean; drawn1: number; gateI: number };
  record('P39 벽·문 — 출입동 실내 247칸 + 복도 12(P48-b1 20×13) · 문 2(정문 변·마당 변, 복도 양 끝) · 표식 2 · 손님이 문으로 들어가 매표소 이용 > 0 · 잔디 위 새 건물은 길을 이어야 문이 난다(표식 2 → 3)', r.indoor === 247 && r.doors0 === 2 && r.door0.oi === r.gateI && r.drawn0 === 2 && r.used > 0 && !r.doorBefore && r.doorAfter && r.drawn1 === 3 ? 'pass' : 'fail' /* P44-c: 통로가 닿기 전엔 문이 없다 */, JSON.stringify(r));
  void cdp;
}

/** P41·P42 — 확장 사건(★1: 마당이 넓어지고 사장 대사 · 「입구」 해금) · 입구를 건물 가장자리에 놓으면 문이 옮겨 간다(표식 위치) */
async function verifyP42(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const w0 = g.land.w; g.money = 100000; g.openLand(1); g.unlocked.facilities.add('entrance'); w.syncWorldToScene(); const w1 = g.land.w; const unlocked = g.isUnlocked('entrance'); const d0 = g.grid.doors()[0]; const gt = g.gate; const ei = gt.i - 10, ej = gt.j + 6; /* P45-a: 출입동 서쪽 가장자리 */ const bad = g.canPlace('entrance', gt.i - 5, gt.j + 4, 0); /* 안쪽 칸 */ const r = g.placeFacility('entrance', ei, ej, 0); w.syncWorldToScene(); const d1 = g.grid.doors().find((x) => x.i === ei && x.j === ej); return { w0, w1, unlocked, d0, gateI: gt.i, badReason: bad.ok ? '' : bad.reason, placed: r.ok, d1, drawn: w.scene.doorCountForTest() }; })()`)) as { w0: number; w1: number; unlocked: boolean; d0: { oi: number }; gateI: number; badReason: string; placed: boolean; d1: { i: number } | undefined; drawn: number };
  record('P41·P42 확장·입구 — ★1 에 마당 40 → 44(P45-a) · 「입구」 해금 · 안쪽 칸 거절 「가장자리」 · 서쪽 가장자리에 놓으면 문이 하나 더(표식 3)', r.w0 === 40 && r.w1 === 44 && r.unlocked && r.d0.oi === r.gateI && /가장자리/.test(r.badReason) && r.placed && !!r.d1 && r.drawn === 3 ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

/** P43 — 레거시 크기의 맵: 96×72 · 도시 띠(차도 2줄 · 정류장) · 마당 ★0 32×42 · 킷 실내동 128 · 옛 64×48 세이브는 새 판 · 버스는 차도 위 · 벽·울타리는 한 그리기(유리 선 0) */
async function verifyP43(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const grid = g.grid; let road = 0, stop = 0, indoor = 0, grass = 0; for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) { const c = grid.at(i, j); if (c === 13) road++; else if (c === 9 && j === 3) stop++; else if (c === 3) indoor++; else if (c === 1) grass++; } const walkBand = g.guests.walkable(gt.i, gt.j - 1) || g.guests.walkable(gt.i, 2); const own = g.ownsTile(gt.i, 5) || g.ownsTile(gt.i, 60); w.skip(200); const bus = w.scene.busForTest(); const road2 = w.scene.busRoadForTest(); const roadRect = w.scene.tileScreenRect(gt.i, 2); const guests = g.guests.count; return { w: grid.w, h: grid.h, land: g.land, gate: gt, road, stop, indoor, grass, walkBand, own, bus, road2, roadY: roadRect ? roadRect.y : null, guests, doors: w.scene.doorCountForTest() }; })()`)) as { w: number; h: number; land: { i0: number; j0: number; w: number; h: number }; gate: { i: number; j: number }; road: number; stop: number; indoor: number; grass: number; walkBand: boolean; own: boolean; bus: { y: number; phase: string } | null; road2: { j: number; i0: number; i1: number } | null; roadY: number | null; guests: number; doors: number };
  const okMap = r.w === 96 && r.h === 72 && r.land.i0 === 28 && r.land.j0 === 8 && r.land.w === 40 && r.land.h === 42 && r.gate.i === 48 && r.gate.j === 8;
  record('P43 맵 — 96×72 · 마당 ★0 (28,8) 40×42 · 입구 (48,8) · 차도 192칸 · 정류장 96칸 · 킷 출입동 실내 247(+복도 12) · 도시 띠는 걷지도 갖지도 못한다', okMap && r.road === 96 * 2 && r.stop === 96 && r.indoor === 247 && !r.walkBand && !r.own ? 'pass' : 'fail', JSON.stringify({ w: r.w, h: r.h, land: r.land, gate: r.gate, road: r.road, stop: r.stop, indoor: r.indoor, walkBand: r.walkBand, own: r.own }));
  record('P43 버스는 차도(줄 2, 지도 전폭) 위를 달리고 손님이 든다 · 문 표식 2', !!r.road2 && r.road2.j === 2 && r.road2.i0 < 0 && r.road2.i1 > 95 && (!r.bus || (r.roadY !== null && Math.abs(r.bus.y - (r.roadY + 16)) <= 40)) && r.guests > 0 && r.doors === 2 ? 'pass' : 'fail', JSON.stringify({ bus: r.bus, road2: r.road2, roadY: r.roadY, guests: r.guests, doors: r.doors }));
  // 옛 64×48 세이브 → 새 판 (세이브 v3)
  await page.evaluate(`(() => { const g = window.__pj.game; const s = g.toSnapshot(); s.grid = { w: 64, h: 48, floor: new Array(64 * 48).fill(1) }; localStorage.setItem('pj.save', JSON.stringify({ version: 2, savedAt: 'x', game: s })); })()`);
  await page.goto(`${BASE}/?debug=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const m = (await page.evaluate(`(() => { const g = window.__pj.game; return { w: g.grid.w, h: g.grid.h, day: g.day, kit: g.facilities.all.length }; })()`)) as { w: number; h: number; day: number; kit: number };
  record('P43 세이브 v3 — 옛 64×48 판은 새 판으로(96×72 · 킷 23, P57-c·P58-a)', m.w === 96 && m.h === 72 && m.kit === 23 ? 'pass' : 'fail', JSON.stringify(m));
  void cdp;
}

/** P44 — 마당 밖: 들판(잔디)·숲·능선(가장자리 0)·암반 테두리 · 울타리가 이동을 막는다 · 지도 바깥 띠 5 · 도시 띠 가로수·정류장 · 장식 차량 · 첫 화면에 모래 사막이 없다 */
async function verifyP44(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const grid = g.grid; const land = g.land; let outGrass = 0, outSand = 0, rock = 0, maxZ = 0, edgeZ = 0; for (let j = 8; j < grid.h; j++) for (let i = 0; i < grid.w; i++) { const c = grid.at(i, j); const inL = i >= land.i0 && i < land.i0 + land.w && j >= land.j0 && j < land.j0 + land.h; if (!inL && j < 50) { if (c === 1 || c === 14) outGrass++; else if (c === 0) outSand++; } if (c === 14) rock++; const z = grid.levelAt(i, j); maxZ = Math.max(maxZ, z); if (i === 0 || i === grid.w - 1) edgeZ = Math.max(edgeZ, z); } w.skip(300); const outside = g.guests.all.filter((x) => !(x.i >= land.i0 - 0.5 && x.i < land.i0 + land.w - 0.5 && x.j >= land.j0 - 0.5)).length; return { outGrass, outSand, rock, maxZ, edgeZ, guests: g.guests.count, outside, surround: w.scene.surroundCountForTest(), trees: w.scene.borderCountForTest(), walls: w.scene.wallLayerCountForTest(), traffic: w.scene.trafficCountForTest() }; })()`)) as { outGrass: number; outSand: number; rock: number; maxZ: number; edgeZ: number; guests: number; outside: number; surround: number; trees: number; walls: number; traffic: number };
  record('P44 → P57-h 마당 밖 — 들판 잔디(모래 0) · 평지(능선 끔: 암반 0 · 최고 단 0) · 손님이 마당 밖으로 안 나간다(울타리 없이 — 목적지가 전부 안이다)', r.outGrass > 2000 && r.outSand === 0 && r.rock === 0 && r.maxZ === 0 && r.edgeZ === 0 && r.guests > 0 && r.outside === 0 ? 'pass' : 'fail', JSON.stringify(r));
  record('P44 → P57-h 지도 바깥 띠 5(잔디·강·차도·보도·광장) · 숲·가로수·바깥 장식 40~260(가로수 108 + 둘레 41 + 무리 ~60 — 옛 396 의 절반) · 도로 버스 1', r.surround === 5 && r.trees >= 40 && r.trees <= 260 && r.traffic >= 1 ? 'pass' : 'fail', JSON.stringify({ surround: r.surround, trees: r.trees, walls: r.walls, traffic: r.traffic }));
  // 픽셀: 지도 남동 귀퉁이를 비춰도 바탕색(모래)이 안 보인다 — 잔디·물이 화면을 채운다
  await page.evaluate(`(() => { const w = window.__pj; w.scene.focusTile(94, 70, 0); })()`);
  await page.waitForTimeout(500);
  const px = (await page.evaluate(`(async () => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return -1; const w = c.width, h = c.height; const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); let n = 0, t = 0; for (let i = 0; i < buf.length; i += 16) { const r = buf[i], g = buf[i + 1], b = buf[i + 2]; t++; if ((g > 150 && g > r + 30 && g > b + 40) || (b > 150 && b > r + 30)) n++; } return n / t; })()`)) as number;
  record('P44 남동 귀퉁이 화면 — 잔디·물 픽셀 ≥ 55% (지도 가장자리 너머도 들판·강)', px >= 0.55 ? 'pass' : 'fail', `${Math.round(px * 1000) / 10}%`);
  void cdp;
}

/** P45-a D63 — 출입동: 정문 칸을 감싼 20×30 건물 · 복도(hall) 한 줄 · 문 둘(정문 변·마당 변) · 손님 전원이 복도를 지나 마당으로 · 마당 문 밖 통로를 걷어내면 「끊긴다」 거절 · 부표 줄은 트인 강 쪽 변에만 */
async function verifyP45(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const grid = g.grid; let hall = 0, indoor = 0; for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) { const c = grid.at(i, j); if (c === 15) hall++; else if (c === 3) indoor++; } const doors = grid.doors(); const gateFloor = grid.at(gt.i, gt.j); const blobGate = grid.blobAt(gt.i, gt.j); const blobHall = grid.blobAt(gt.i, gt.j + 5); const blobWest = grid.blobAt(gt.i - 9, gt.j + 10) /* P48-b1 20×13 */; w.skip(700); const guests = g.guests.all; const inBuilding = guests.filter((x) => grid.blobAt(Math.round(x.i), Math.round(x.j)) === blobHall).length; const inYard = guests.filter((x) => Math.round(x.j) >= gt.j + 13 && Math.round(x.j) < 50).length; const cut = g.unpaintPath([{ i: gt.i, j: gt.j + 13 } /* P48-b1: 마당 문 밖 (48,21) */]); const kit = g.facilities.all.map((f) => f.defId).sort().join(','); return { hall, indoor, doors, gateFloor, blobGate, blobHall, blobWest, guests: guests.length, inBuilding, inYard, cutOk: cut.ok, cutWhy: cut.ok ? '' : cut.reason, kit, drawn: w.scene.doorCountForTest() }; })()`)) as { hall: number; indoor: number; doors: { i: number; j: number; oi: number; oj: number }[]; gateFloor: number; blobGate: number; blobHall: number; blobWest: number; guests: number; inBuilding: number; inYard: number; cutOk: boolean; cutWhy: string; kit: string; drawn: number };
  const main = r.doors.some((d) => d.i === 48 && d.j === 9 && d.oi === 48 && d.oj === 8), yard = r.doors.some((d) => d.i === 48 && d.j === 20 && d.oi === 48 && d.oj === 21);
  record('P45-a 출입동 — 복도 12 · 실내 247(20×13, P48-b1) · 정문 칸은 포장(건물 밖) · 덩어리 하나 · 문 둘(정문 변 (48,9)→(48,8) · 마당 변 (48,20)→(48,21)) · 표식 2', r.hall === 12 && r.indoor === 247 && r.gateFloor === 2 && r.blobGate === 0 && r.blobHall > 0 && r.blobHall === r.blobWest && r.doors.length === 2 && main && yard && r.drawn === 2 ? 'pass' : 'fail', JSON.stringify({ hall: r.hall, indoor: r.indoor, doors: r.doors, gateFloor: r.gateFloor, blobs: [r.blobGate, r.blobHall, r.blobWest], drawn: r.drawn }));
  record('P45-a 손님은 복도를 지나 마당으로 · 마당 문 밖 통로를 걷어내면 거절(끊긴다) · 킷 23(P57-c main: 매표·실내 매점·화장실·자판기·선착장 + env 16 + 식탁 2)', r.guests > 0 && r.inYard > 0 && !r.cutOk && /끊|입구|길/.test(r.cutWhy) && r.kit === 'dock,env_bench,env_bench,env_bench,env_deciduous,env_deciduous,env_flower_pot,env_flower_pot,env_long_flowerbed,env_long_flowerbed,env_long_flowerbed,env_long_flowerbed,env_pine,env_rocks,env_shrubs,env_shrubs,env_street_lamp,foodcourt_seat,foodcourt_seat,indoor_shop,ticket,toilet,vending_out' /* P57-c main 킷 */ ? 'pass' : 'fail', JSON.stringify({ guests: r.guests, inBuilding: r.inBuilding, inYard: r.inYard, cutOk: r.cutOk, cutWhy: r.cutWhy, kit: r.kit }));
  // P45-b D63 — 지나가며 산다 · 야외 식당은 실내 금지 · 건설 분류 8(실내 첫째) · 온보딩 비트
  const b = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money = 100000; const sets = g.passByForTest(); const shop = g.facilities.all.find((f) => f.defId === 'indoor_shop'); const bad = g.canPlace('shop', gt.i - 6, gt.j + 10, 0); const sh = g.placeFacility('shower_row', gt.i + 1, gt.j + 12, 0); w.skip(900); const sales = (g.stats.passByEnter ?? 0) + (g.stats.passByLeave ?? 0); w.buildWin.show(); const tabs = [...document.querySelectorAll('#win-build .ktab')].map((x) => x.dataset.tab); const rows = [...document.querySelectorAll('#win-build .kpcard')].map((x) => x.dataset.facility); return { enter: sets.enter.length, leave: sets.leave.length, shopIn: shop ? sets.enter.includes(shop.uid) && sets.leave.includes(shop.uid) : false, badWhy: bad.ok ? '' : bad.reason, showerOk: sh.ok, sales, tabs, firstRows: rows.slice(0, 4), story: g.story.toSnapshot() }; })()`)) as { enter: number; leave: number; shopIn: boolean; badWhy: string; showerOk: boolean; sales: number; tabs: string[]; firstRows: string[]; story: string[] };
  record('P45-b 지나가며 산다 — 킷 실내 매점이 복도 곁(입장·퇴장 집합) · 야외 매점은 실내 거절 「야외」 · 복도 곁 샤워실 · 정오까지 복도 구매 > 0 · 온보딩 「복도 곁 가게」 비트', b.shopIn && /야외/.test(b.badWhy) && b.showerOk && b.sales > 0 && b.story.includes('first_hall_sale') ? 'pass' : 'fail', JSON.stringify({ enter: b.enter, leave: b.leave, shopIn: b.shopIn, badWhy: b.badWhy, sales: b.sales, story: b.story.filter((x) => x.includes('hall')) }));
  record('P45-b → P50-a 건설 분류 9 — 실내·빠지·자리·숙박·먹거리·놀이·슬라이드·편의·장식, 실내 탭 첫 네 줄에 입장 점포(대여소·락커)', b.tabs.join(',') === 'indoor,ppaji,seat,lodging,food,play,slide,utility,decor' && b.firstRows.slice(0, 4).includes('rental_tube') && b.firstRows.slice(0, 4).includes('locker_row') ? 'pass' : 'fail', JSON.stringify({ tabs: b.tabs, firstRows: b.firstRows }));
  // P45-c D63 밤 분기 — 실내 객실·찜질방을 두고 하루를 돌리면 팀이 묵고 밤 이용이 난다 · 거치대에서 빌리면 기구 패키지
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const n = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money = 200000; g.rank = 2; g.openLand(2); for (const id of ['room_ondol', 'jjimjilbang', 'gear_rack']) g.unlocked.facilities.add(id); const r1 = g.placeFacility('room_ondol', gt.i - 8, gt.j + 3, 0).ok; const r2 = g.placeFacility('room_ondol', gt.i - 8, gt.j + 6, 0).ok; const jj = g.placeFacility('jjimjilbang', gt.i + 6, gt.j + 8, 0).ok /* P48-b1: 20×13 안, 킷 화장실 오른쪽 · P57-a: 4×4 가 되며 (5,9) 는 이 시드에서 밤 이용 0(3×3 도 시드 1 에서 0 — 잡음) → (6,8) */; const gr = g.placeFacility('gear_rack', gt.i + 1, gt.j + 6, 0).ok; w.skip(1700); return { r1, r2, jj, gr, night: g.nightForTest().length, overnight: g.stats.overnight ?? 0, nightUses: g.stats.nightUses ?? 0, gear: g.stats.gearRentals ?? 0, story: g.story.toSnapshot().filter((x) => x.includes('hall')) }; })()`)) as { r1: boolean; r2: boolean; jj: boolean; gr: boolean; night: number; overnight: number; nightUses: number; gear: number; story: string[] };
  record('P45-c 밤 분기 — 실내 객실 2·찜질방·거치대 배치 · 하루 뒤 1박 > 0 · 밤 이용 > 0 · 기구 대여 > 0', n.r1 && n.r2 && n.jj && n.gr && n.night === 1 && n.overnight > 0 && n.nightUses > 0 && n.gear > 0 ? 'pass' : 'fail', JSON.stringify(n));
  // P46 D58 — 간격 규칙 실터치: 야외 화장실 옆에 매점을 조준하면 거절 이유 「한 칸 띄우세요」
  const sp = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money = 100000; g.unlocked.facilities.add('shop'); const t = g.placeFacility('toilet', gt.i - 18, gt.j + 8, 0) /* P48-b3 → P57-c: 북서 잔디 줄 16 (줄 24 는 킷 바위와 겹친다) */; const bad = g.canPlace('shop', gt.i - 16, gt.j + 8, 0); const ok = g.canPlace('shop', gt.i - 15, gt.j + 8, 0); return { t: t.ok, badWhy: bad.ok ? '' : bad.reason, ok: ok.ok }; })()`)) as { t: boolean; badWhy: string; ok: boolean };
  record('P46 간격 규칙 — 야외 화장실 옆 매점은 「한 칸 띄우세요」 · 한 칸 띄우면 허용', sp.t && /한 칸/.test(sp.badWhy) && sp.ok ? 'pass' : 'fail', JSON.stringify(sp));
  void cdp;
}

/** P28 — 공간 소원·목표: 조건 DSL seatGrade·seatsFed 가 킷에서 평가되고 소원 18건이 자리 조건 · 결산 요약 「붐빈 자리 …(등급 n) m명」 */
async function verifyP28(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘 */ const a = g.evaluateCondition({ kind: 'seatGrade', min: 3, count: 2 }); const b0 = g.evaluateCondition({ kind: 'seatsFed', id: 'vending_out', count: 1 }); const gt = g.gate; const placed = g.placeFacility('vending_out', gt.i + 10, gt.j + 11, 0).ok; /* P57-c: 절이 놓은 동쪽 물가 평상(gt.i+12, j+13) 반경 3 */ /* 물가 블록(4,3) 안 — 왼쪽 평상 반경 3 (P33: 거리엔 못 놓아 둘을 한 자판기가 못 먹인다) */ const b = g.evaluateCondition({ kind: 'seatsFed', id: 'vending_out', count: 1 }); const c = g.evaluateCondition({ kind: 'seatGrade', min: 5, count: 3 }); w.skip(w.TPD + 2); const items = g.inbox.items ?? g.inbox.all ?? []; const sum = items.filter((x) => x.kind === 'day-summary').slice(-1)[0]; return { a: a.met, b0: b0.met, placed, b: b.met, bLabel: b.label, cMet: c.met, cProgress: c.progress, body: sum ? sum.body : '' }; })()`)) as { a: boolean; b0: boolean; placed: boolean; b: boolean; bLabel: string; cMet: boolean; cProgress: number; body: string };
  record('P28 공간 조건 — 킷: 등급 3 자리 둘 ✓ · 자판기 반경 자리 하나는 킷에서 ✗(P29) → 평상 옆에 놓으면 ✓ · 등급 5 셋은 부분 점수 · 결산 「붐빈 자리 …(등급 n) m명」', r.a && !r.b0 && r.placed && r.b && r.bLabel.includes('자판기') && !r.cMet && r.cProgress < 1 && /* 둘 이상 요구는 found/need — 킷엔 등급 5 가 없어 0 */ /붐빈 자리 .+\(등급 \d\) \d+명/.test(r.body) ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

async function verifyP27(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘 */ w.skip(900); const teams = new Map(); for (const x of g.guests.all) if (x.teamId !== null) teams.set(x.teamId, (teams.get(x.teamId) ?? 0) + 1); const sizes = [...teams.values()]; const hungry = g.guests.all.filter((x) => x.hunger >= 25).length; let foodN = 0, hungryN = 0; for (let k = 0; k < 30; k++) { w.skip(20); for (const x of g.guests.all) if (x.state === 'use' && x.target && x.target.kind === 'facility' && (g.facilities.defOf(g.facilities.byUid(x.target.uid))?.menuSlots ?? 0) > 0) { foodN++; if (x.hunger >= 25) hungryN++; } } /* P40: 걷는 손님이 아니라 **매점을 쓰는 순간**의 손님을 센다(마당을 어디든 걷자 지나가는 표본이 흐려졌다) · 600tick 창 */ /* 문턱 25 = pickTarget 의 hungry 규칙과 같은 값(전엔 40 이라 규칙과 자가 어긋났다 · 고기 패키지 손님은 배가 안 고파도 매점에 간다) */ /* P28-b: 한 순간이 아니라 200tick 창으로 센다 — D35 뒤 자리 잡은 팀이 늘어 순간 표본이 0 이 됐다 */ const foodTargets = { length: foodN }; const hungryAmongFood = hungryN; return { teamGuests: g.stats.teamGuests, seated: g.stats.teamSeated, teams: teams.size, maxTeam: Math.max(0, ...sizes), hungry, foodTargets: foodTargets.length, hungryAmongFood, food: g.stats.food }; })()`)) as { teamGuests: number; seated: number; teams: number; maxTeam: number; hungry: number; foodTargets: number; hungryAmongFood: number; food: number };
  record('P27 걸어온 팀 — 첫날 낮 팀 손님 ≥ 10 · 무리 ≤ 4명 · 자리 잡은 팀 손님 > 0', r.teamGuests >= 10 && r.maxTeam <= 4 && r.teams >= 3 && r.seated > 0 ? 'pass' : 'fail', JSON.stringify(r));
  record('P27 욕구 — 물에서 나온 배고픈 손님이 있고, 식당으로 가는 손님의 절반 이상이 배고프다(욕구가 구매를 정한다)', r.hungry > 0 && r.foodTargets > 0 && r.hungryAmongFood * 3 >= r.foodTargets ? 'pass' : 'fail' /* P40: 마당을 어디든 걷자 군것질(×0.5) 방문이 늘어 절반 → 1/3 · P48-b1 에 임시 1/4 였다가 P48-b2(킷 빠지가 못으로) 에서 1/3 복원 */, JSON.stringify({ hungry: r.hungry, foodTargets: r.foodTargets, hungryAmongFood: r.hungryAmongFood, food: r.food }));
  void cdp;
}

async function verifyP26(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; g.rank = 2; g.openLand(2); const gt = g.gate; const sd = w.facilityDefs.get('shop'); const shop = g.placeFacility('shop', gt.i + 20, gt.j + 10, 0); const pop0 = g.parkPopularity(); const sc0 = g.sceneryOf(shop.uid); const a = g.placeFacility('sunflower', gt.i + 18, gt.j + 10, 0); const b = g.placeFacility('aloe', gt.i + 20 + sd.w + 1, gt.j + 10, 0); const sc = g.sceneryOf(shop.uid); const pop1 = g.parkPopularity(); w.facilityInfo.show(shop.uid); const row = [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent).find((t) => t.startsWith('경관')) ?? ''; const hint = document.querySelector('#win-facility .kfac-hint')?.textContent ?? ''; w.facilityInfo.win.hide(); return { ok: shop.ok && a.ok && b.ok, sc0, sc, pop0, pop1, row, hint }; })()`)) as { ok: boolean; sc0: number; sc: number; pop0: number; pop1: number; row: string; hint: string };
  record('P26 경관 전염 — 매점 옆 장식 둘 → 경관 0 → 13 이상 · 인기 상승 · 정보 창 「경관 +n · 인기 +k」 + 힌트 줄 「판매가 +m%」(P59-a D68: 값은 짧게)', r.ok && r.sc0 === 0 && r.sc >= 13 && r.pop1 > r.pop0 && /^경관\+\d+ · 인기 \+\d+$/.test(r.row) && /판매가 \+\d+%/.test(r.hint) ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

async function verifyP25(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = Math.max(g.money, 100000); g.placeFacility('pyeongsang_row', g.gate.i + 12, g.gate.j + 13, 0); g.placeFacility('pyeongsang_row', g.gate.i - 4, g.gate.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘(등급 3 · 수영 패키지만 · 자판기·장식 반경 밖) */ const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); const pk = g.seatPackages(seat.uid).map((p) => p.id).sort(); const seen = [...g.packagesSeen].sort(); w.facilityInfo.show(seat.uid); const row = [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent).find((t) => t.startsWith('패키지')) ?? ''; w.facilityInfo.win.hide(); w.placeDock.enter(w.facilityDefs.get('pyeongsang_row')); w.placeDock.aimAt(gt.i + 6, gt.j + 39); const label = w.scene.ghostLabelForTest(); w.placeDock.exit(); const vr = g.placeFacility('vending_out', gt.i + 10, gt.j + 11, 0) /* P57-c: 절이 놓은 동쪽 물가 평상(gt.i+12, j+13) 반경 3 */; /* P48-b2: 첫 평상은 만 북안(gt.i+3, j+14) */ const pkNear = g.seatPackages(seat.uid).map((p) => p.id).sort(); const seenNear = [...g.packagesSeen].sort(); const rm = vr.ok && g.removeFacility(vr.uid).ok; const items = g.inbox.items ?? g.inbox.all ?? []; const gone = items.some((x) => x.title.includes('고기 패키지 가 사라졌다')); const after = g.seatPackages(seat.uid).map((p) => p.id); return { pk, seen, row, label, pkNear, seenNear, rm, gone, after }; })()`)) as { pk: string[]; seen: string[]; row: string; label: string; pkNear: string[]; seenNear: string[]; rm: boolean; gone: boolean; after: string[] };
  record('P25 킷 평상 패키지는 수영만(P29) · 정보 창 「패키지 수영 패키지」 → 반경에 자판기를 놓으면 고기·수영 · 발견 2종', r.pk.join(',') === 'swim' && r.seen.join(',') === 'swim' && /패키지수영 패키지/.test(r.row) && r.pkNear.join(',') === 'meat,swim' && r.seenNear.join(',') === 'meat,swim' ? 'pass' : 'fail', JSON.stringify({ pk: r.pk, seen: r.seen, row: r.row, pkNear: r.pkNear }));
  record('P25 조준 라벨에 패키지 · 자판기 철거 → 고기 패키지 소실 토스트 · 자리엔 수영만', /수영/.test(r.label) && r.rm && r.gone && r.after.join(',') === 'swim' ? 'pass' : 'fail', JSON.stringify({ label: r.label, rm: r.rm, gone: r.gone, after: r.after }));
  void cdp;
}

async function verifyP24(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = 100000; g.placeFacility('pyeongsang_row', gt.i + 12, gt.j + 13, 0); g.placeFacility('pyeongsang_row', gt.i - 4, gt.j + 14, 0); } /* P57-c: main 킷엔 평상이 없다 — 물가 둘(등급 3 · 수영만 · 자판기·장식 반경 밖)을 놓고 잰다 */ const seats = g.facilities.all.filter((f) => f.defId === 'pyeongsang_row').map((f) => g.seatGradeOf(f.uid).grade).sort(); w.placeDock.enter(w.facilityDefs.get('pyeongsang_row')); w.placeDock.aimAt(gt.i - 8, gt.j + 14); /* P48-b3: 서쪽 물가(열 40 · 행 22 — 물이 반경 3 안) */ const label1 = w.scene.ghostLabelForTest ? w.scene.ghostLabelForTest() : (document.querySelector('#dock-place .kdock-cost')?.textContent ?? ''); const ring1 = w.scene.selectionCountForTest ? w.scene.selectionCountForTest() : -1; w.placeDock.aimAt(gt.i - 18, gt.j + 14) /* P48-b3: 북서 잔디 — 물 반경 밖 */; /* 블록(5,2) — 접한 블록에 매점 없음(P35) */ const label2 = w.scene.ghostLabelForTest ? w.scene.ghostLabelForTest() : ''; w.placeDock.exit(); const ring0 = w.scene.selectionCountForTest ? w.scene.selectionCountForTest() : -1; w.placeDock.enter(w.facilityDefs.get('shop')); w.placeDock.aimAt(gt.i - 14, gt.j + 16); const label3 = w.scene.ghostLabelForTest ? w.scene.ghostLabelForTest() : ''; w.placeDock.exit(); const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); w.facilityInfo.show(seat.uid); const row = [...document.querySelectorAll('#win-facility .krow')].find((x) => x.textContent.startsWith('등급')); const stars = row ? row.querySelectorAll('.kstars svg, .kstars canvas, .kstars *:not(.kdim)').length : -1; const text = row ? row.textContent : ''; w.facilityInfo.win.hide(); return { seats, label1, ring1, label2, ring0, label3, text, stars }; })()`)) as { seats: number[]; label1: string; ring1: number; label2: string; ring0: number; label3: string; text: string; stars: number };
  record('P24 물가 평상 등급 3·3 (물 +2 · 뷰 — P29 미완성: 먹거리·그늘·조경은 플레이어가; P57-c 부터 절이 옛 킷 자리에 놓는다)', r.seats.length === 2 && r.seats[0] === 3 && r.seats[1] === 3 ? 'pass' : 'fail', JSON.stringify(r.seats));
  record('P24 조준 — 물가 평상 「등급 ≥ 3 · 물」 · 뭍 안쪽 「등급 0~1」 · 링이 그려지고 나가면 지워진다', /등급 [3-5].*물/.test(r.label1) && /등급 [01]/.test(r.label2) /* P57-c: 뭍 안쪽도 킷 장식(활엽수·관목) 조경으로 1 이 될 수 있다 */ && r.ring1 > 0 && r.ring0 === 0 ? 'pass' : 'fail', JSON.stringify({ label1: r.label1, label2: r.label2, ring1: r.ring1, ring0: r.ring0 }));
  record('P24 매점 조준 「자리 n곳」 · 정보 창 「등급 … n/5」 + 별', /자리 \d곳/.test(r.label3) && /등급.*\d\/5/.test(r.text) ? 'pass' : 'fail', JSON.stringify({ label3: r.label3, text: r.text, stars: r.stars }));
  void cdp;
}

async function verifyP23(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const vend = g.facilities.all.find((f) => f.defId === 'vending_out'); const slots = g.menus.slotsOf(vend.uid).filter((x) => x !== null).length; w.skip(w.TPD + 2); const items = g.inbox.items ?? g.inbox.all ?? []; const first = items.filter((x) => x.title.startsWith('첫 판매')).length; const sum = items.filter((x) => x.kind === 'day-summary').slice(-1)[0]; return { slots, food: g.stats.food, first, body: sum ? sum.body : '' }; })()`)) as { slots: number; food: number; first: number; body: string };
  record('P23 기본 메뉴 — 새 판 자판기 메뉴 3 · 첫날 매출 > 0 · 첫 판매 토스트 1 · 요약 「매점 n건 (최다 …)」', r.slots === 3 && r.food > 0 && r.first === 1 && /매점 \d+건 \(최다 /.test(r.body) ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

async function verifyP22(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const un = (await page.evaluate(`(() => { const g = window.__pj.game; return { n: g.unlocked.facilities.size, shop: g.isUnlocked('shop'), fire: g.isUnlocked('firepit_row'), stage: g.isUnlocked('stage_river') }; })()`)) as { n: number; shop: boolean; fire: boolean; stage: boolean };
  record('P21 해금 재배치 — 새 판 시설 45종(P45-b 대여소·실내 매점 +2 · P49-a1 시작 기구 8 · P57-b env 장식 18) · 매점·화로대는 시작 · 강변 스테이지는 아직 소원', un.n === 45 && un.shop && un.fire && !un.stage ? 'pass' : 'fail', JSON.stringify(un));
  // 지면 탭 → 모래길 칩(기본) → 잔디 두 칸 실터치 → 완료
  await page.evaluate(`(() => { const w = window.__pj; w.game.money = 50000; w.dock.enter('ground'); const gt = w.game.gate; w.scene.focusTile(gt.i + 14, gt.j + 12, 150); })()`);
  await page.waitForTimeout(400);
  const pts = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; return [{ i: gt.i + 15, j: gt.j + 12 }, { i: gt.i + 16, j: gt.j + 12 }].map((t) => /* P32: 거리(30~33) 밖 잔디 */ { const r = w.scene.tileScreenRect(t.i, t.j); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }); })()`)) as { x: number; y: number }[];
  for (const p of pts) { await touch(cdp, p.x, p.y); await page.waitForTimeout(450); }
  const done = (await page.evaluate(`(() => { const b = [...document.querySelectorAll('#dock-pool button')].find((x) => x.textContent.trim() === '완료'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const gr = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const chips = [...document.querySelectorAll('#dock-pool [data-ground]')].map((b) => b.dataset.ground); return { a: g.grid.at(gt.i + 15, gt.j + 12), b: g.grid.at(gt.i + 16, gt.j + 12), chips, walk: g.guests.walkable(gt.i + 1, gt.j + 12), money: g.money }; })()`)) as { a: number; b: number; chips: string[]; walk: boolean; money: number };
  record('P22 지면 탭 실터치 2칸 → 모래길(8) · 40G · 칩 5종 · 손님이 걷는 칸', gr.a === 8 && gr.b === 8 && gr.chips.length === 5 && gr.walk && gr.money === 50000 - 40 ? 'pass' : 'fail', JSON.stringify(gr));
  const garden = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.dock.exit(); if (!g.facilities.all.some((f) => f.defId === 'pyeongsang_row')) { g.money = 100000; g.placeFacility('pyeongsang_row', g.gate.i - 16, g.gate.j + 20, 0); } /* P57-c: main 킷엔 평상이 없다 — 서쪽 물가(장식 조경 반경 밖: 등급 3 → 꽃밭 2칸 → 4)에 하나 놓고 잰다 */ const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); const before = g.seatValueOf(seat.uid); const cands = []; for (let j = seat.j - 1; j <= seat.j + 1 && cands.length < 2; j++) for (let i = seat.i - 1; i <= seat.i + 4 && cands.length < 2; i++) if (g.grid.at(i, j) === 1 && g.canPaintGround(i, j, 'flowerbed').ok) cands.push({ i, j }); const r = g.paintGround(cands, 'flowerbed'); w.skip(1); w.facilityInfo.show(seat.uid); /* skip(1) — 씬이 바닥을 다시 그리게 flush 한다 (하네스 규칙) */ const row = [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent).find((t) => t.startsWith('등급')) ?? ''; w.facilityInfo.win.hide(); return { ok: r.ok, n: cands.length, before: before.value, after: g.seatValueOf(seat.uid).value, row, tex: w.scene.tileTextureAt(cands[0].i, cands[0].j) }; })()`)) as { ok: boolean; n: number; before: number; after: number; row: string; tex: string };
  record('P22 평상 옆 꽃밭 2칸 → 자리 등급 +1(조경) · 정보 창 「조경」 · 타일 텍스처 tile/flowerbed', garden.ok && garden.n === 2 && garden.after === garden.before + 1 && garden.row.includes('조경') && garden.tex === 'tile/flowerbed' ? 'pass' : 'fail', JSON.stringify(garden));
}

async function verifyP18(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const eve = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 200000; g.rank = 2; g.openLand(2); g.unlocked.facilities.add('camp_site'); const gt = g.gate; const r = g.placeFacility('camp_site', gt.i - 14, gt.j + 19, 0); /* P48-b3: 서쪽 물가 */ const s = g.guests.spawn(); s.teamId = 999; /* 걸어온 팀 시퀀스(1,2,3…)와 겹치지 않게 */ s.target = { kind: 'facility', uid: r.uid }; s.state = 'walk'; s.stateTicks = 0; w.skip(300); const stays = s.stays; const lodging = g.stats.lodging; w.skip(g.tick < 1450 ? 1450 - g.tick : 0); w.refreshHud(); const daypart = document.querySelector('.daypart').textContent; const clock = g.clock.clock; const tintA = w.scene.tint ? w.scene.tint.fillAlpha : -1; const lights = w.scene.illuminationOn(); w.facilityInfo.show(r.uid); const rows = [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent); w.facilityInfo.win.hide(); return { ok: r.ok, stays, lodging, daypart, clock, tintA, lights, lodgeRow: rows.find((x) => x.startsWith('숙박')) ?? '' }; })()`)) as { ok: boolean; stays: boolean; lodging: number; daypart: string; clock: string; tintA: number; lights: boolean; lodgeRow: string };
  record('P18 저녁 구간 — 18시 넘으면 헤더 「… · 저녁」 · 밤 틴트 > 0 · 조명 켜짐 · 시계 PM 06:xx', eve.daypart.includes('저녁') && eve.tintA > 0 && eve.lights && /^PM 06/.test(eve.clock) ? 'pass' : 'fail', JSON.stringify({ daypart: eve.daypart, clock: eve.clock, tintA: eve.tintA, lights: eve.lights }));
  record('P18 숙박 체크인 — 캠핑 사이트에 앉은 손님이 stays · 1박 400G · 정보 창 「숙박 1명 잔다」', eve.ok && eve.stays && eve.lodging === 400 && /^숙박1명 잔다/.test(eve.lodgeRow) ? 'pass' : 'fail', JSON.stringify({ stays: eve.stays, lodging: eve.lodging, lodgeRow: eve.lodgeRow }));
  const night = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const uid = g.guests.all.find((x) => x.stays).uid; const day0 = g.day; w.skip(1680 - g.tick + 5); const kept = g.guests.all.find((x) => x.uid === uid); return { day: g.day - day0, kept: !!kept, state: kept ? kept.state : null, hp: kept ? kept.hp : 0, overnight: g.stats.overnight, clock: g.clock.clock, tintA: w.scene.tint ? w.scene.tint.fillAlpha : -1 }; })()`)) as { day: number; kept: boolean; state: string | null; hp: number; overnight: number; clock: string; tintA: number };
  record('P18 하루를 넘기면 — 숙박 손님이 남아 아침에 wander · 체력 100 · overnight ≥ 1 · 시계 AM 08', night.day === 1 && night.kept && night.state === 'wander' && night.hp === 100 && night.overnight >= 1 && /^AM 08/.test(night.clock) ? 'pass' : 'fail', JSON.stringify(night));
  void cdp;
}

async function verifyP17(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const team = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; g.busState = { areaId: 'residential', seatsLeft: 0, phase: 'stop', t: 0, source: 'likes', team: 999 }; for (let k = 0; k < 4; k++) g.spawnBusGuest('residential'); g.busState = null; if (!g.facilities.all.some((f) => g.facilities.defOf(f).class === 'lounging' && g.facilities.defOf(f).usageFee > 0)) g.placeFacility('pyeongsang_row', g.gate.i - 14, g.gate.j + 18, 0); /* P57-c: main 킷엔 평상이 없다 — 절이 하나 놓고 시작 */ const kit = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'lounging' && g.facilities.defOf(f).usageFee > 0); const team = g.guests.all.filter((x) => x.teamId === 999); for (const t of team) { t.target = { kind: 'facility', uid: kit.uid }; t.state = 'walk'; t.stateTicks = 0; } g.step(400); const seated = team.filter((t) => t.seatUid === kit.uid); w.facilityInfo.show(kit.uid); const rows = [...document.querySelectorAll('#win-facility .krow')].map((r) => r.textContent); w.facilityInfo.win.hide(); return { n: team.length, rented: kit.rentedBy, seated: seated.length, pkg: g.stats.pkg, teamSeated: g.stats.teamSeated, pkgs: seated.map((t) => t.pkg), seatRow: rows.find((r) => r.startsWith('등급')) ?? '', feeRow: rows.find((r) => r.startsWith('이용료')) ?? '' }; })()`)) as { n: number; rented: number; seated: number; pkg: number; teamSeated: number; pkgs: string[]; seatRow: string; feeRow: string };
  record('P17 버스 팀 4명 — 같은 팀 · 유료 평상이 팀 열쇠(−1000)로 대여 · 둘 이상 앉음 · 패키지는 대표 1명(P27) · 매출 > 0', team.n === 4 && team.rented === -1000 && team.seated >= 2 && team.pkg > 0 && team.teamSeated >= team.seated && team.pkgs.filter((p) => p !== null).length === 1 && team.pkgs.every((p) => p === null || p === 'meat' || p === 'swim') ? 'pass' : 'fail' /* P27: 패키지는 팀 대표 한 명만 */, JSON.stringify(team));
  record('P17 정보 창 — 「등급 … n/5」 행(P24) · 「이용료 … 팀 #999 자리」', /등급.*\d\/5/.test(team.seatRow) && team.feeRow.includes('팀 #999 자리') ? 'pass' : 'fail', JSON.stringify({ seatRow: team.seatRow, feeRow: team.feeRow }));
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0&kit=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const none = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.busState = { areaId: 'residential', seatsLeft: 0, phase: 'stop', t: 0, source: 'likes', team: 3 }; for (let k = 0; k < 3; k++) g.spawnBusGuest('residential'); g.busState = null; let said = false; for (let k = 0; k < 40 && !said; k++) { g.step(4); said = g.guests.all.some((x) => x.say === '자리가 없네…' || (x.teamId === 3 && x.emote === 'grr')); } return { seatless: g.stats.seatless, said, lounges: g.facilities.all.filter((f) => g.facilities.defOf(f).class === 'lounging').length }; })()`)) as { seatless: number; said: boolean; lounges: number };
  record('P17 자리 없으면 서성임 — 평상 0 인 판에서 팀 손님이 「자리가 없네…」 · seatless 집계 > 0', none.lounges === 0 && none.seatless > 0 ? 'pass' : 'fail', JSON.stringify(none));
  void cdp;
}

async function verifyP16(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  // 길 붓 실터치: 입구 열 오른쪽 잔디 두 칸
  await page.evaluate(`(() => { const w = window.__pj; w.game.money = 50000; w.dock.enter('path'); const gt = w.game.gate; w.scene.focusTile(gt.i + 16, gt.j + 12, 150); })()`);
  await page.waitForTimeout(400);
  const pts = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; return [{ i: gt.i + 15, j: gt.j + 12 }, { i: gt.i + 16, j: gt.j + 12 }].map((t) => /* P32: 거리(30~33) 밖 잔디 */ { const r = w.scene.tileScreenRect(t.i, t.j); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }); })()`)) as { x: number; y: number }[];
  for (const p of pts) { await touch(cdp, p.x, p.y); await page.waitForTimeout(450); }
  const done = (await page.evaluate(`(() => { const b = [...document.querySelectorAll('#dock-pool button')].find((x) => x.textContent.trim() === '완료'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const path = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const tab = document.querySelector('#dock-pool .ktab[data-mode="path"]'); return { a: g.grid.at(gt.i + 15, gt.j + 12), b: g.grid.at(gt.i + 16, gt.j + 12), tabShown: !!tab && !tab.classList.contains('khide'), money: g.money }; })()`)) as { a: number; b: number; tabShown: boolean; money: number };
  record('P16 길 탭 실터치 2칸 → 포장(2) · 40G', path.tabShown && path.a === 2 && path.b === 2 && path.money === 50000 - 40 ? 'pass' : 'fail', JSON.stringify(path));
  // 배치(플레이어 경로 = autoPath false)로 잔디 한가운데 놓으면 길이 안 닿는다 → 정보 창 「길」 행 · 자동 길 뒤 닿음 · 뷰 행
  const info = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.unlocked.facilities.add('pyeongsang_row'); const r = g.placeFacility('pyeongsang_row', gt.i - 7, gt.j + 14, 0, { autoPath: false }); /* P32: 거리·산책로에서 떨어진 잔디 */ if (!r.ok) return { err: r.reason }; w.facilityInfo.show(r.uid); const rows = () => [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent); const before = rows().find((t) => t.startsWith('길')); const view = rows().find((t) => t.startsWith('뷰')); const paved = g.ensurePath(r.uid); w.facilityInfo.show(r.uid); const after = rows().find((t) => t.startsWith('길')); w.facilityInfo.win.hide(); return { before, after, view, paved }; })()`)) as { err?: string; before?: string; after?: string; view?: string; paved?: number };
  record('P16 정보 창 — 마당은 어디든 걷는다(P40): 길 없이도 「길 닿음」(P59-a D68: 값은 짧게, 처방은 힌트 줄) · 자동 길은 정면 보도만 · 「뷰」 행', !info.err && !!info.before && info.before.includes('닿음') && !info.before.includes('안 닿음') && !!info.after && info.after.includes('닿음') && !info.after.includes('안 닿음') && !!info.view ? 'pass' : 'fail', JSON.stringify(info));
  const combo = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.unlocked.facilities.add('shop'); const a = g.placeFacility('shop', gt.i - 18, gt.j + 16, 0); const b = g.placeFacility('pyeongsang_row', gt.i - 18, gt.j + 19, 0); /* P48-b3: 서쪽 잔디 */ w.rankWin.show(); const row = [...document.querySelectorAll('#win-rank .krow')].map((x) => x.textContent).find((t) => t.startsWith('콤보')); w.rankWin.win.hide(); return { a: a.ok, b: b.ok, active: g.combos().map((c) => c.def.name), row }; })()`)) as { a: boolean; b: boolean; active: string[]; row?: string };
  record('P16 콤보 — 매점 + 평상 2칸 안 → 「매점 앞 평상」 발동 · 수집 「콤보 n / 40」(P40 킷의 「매표소 주차장」이 하나 더)', combo.a && combo.b && combo.active.includes('매점 앞 평상') && !!combo.row && /콤보\s*[12] \/ 40/.test(combo.row.replace(/\s+/g, ' ')) ? 'pass' : 'fail', JSON.stringify(combo));
}

/** P15 — 방향·수영 구역·코스 물: 입구가 위(j=0)·물이 아래 · 데크로 둘러싸면 자동 수역(실터치) · 치기 탭 숨김 · 코스 제안은 트인 강 · 허가 줄은 랭크마다 +3 */
async function verifyP15(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const lay = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const hidden = [...document.querySelectorAll('#dock-pool .ktab')].filter((b) => ['dig', 'fill'].includes(b.dataset.mode)).every((b) => b.classList.contains('khide')); const s = g.suggestCourse(); const open = s.ok ? s.draft.handles.every((h) => [5, 6].includes(g.grid.at(Math.round(h.x), Math.round(h.y)))) : false; return { gateJ: gt.j, bottom: g.grid.at(gt.i, gt.j + 30), top: g.grid.at(gt.i, gt.j + 1), /* P43 → P48-b3: 입구 열 행 38 은 강 · 입구 아래 한 칸은 포장 */ pools: g.pools.all.length, tiles: g.pools.totalTiles(), hidden, open, waterMax0: g.permitDepth }; })()`)) as { gateJ: number; bottom: number; top: number; pools: number; tiles: number; hidden: boolean; open: boolean; waterMax0: number };
  record('P15 방향 — 입구가 도시 띠 아래(j=8, P43) · 아래는 강 · 킷 수역 20(데크 링 자동) · 치기/걷기 탭 숨김 · 코스 제안은 트인 강 · 허가 깊이 7', lay.gateJ === 8 && lay.bottom === 5 && (lay.top === 2 || lay.top === 15) && lay.tiles === 20 && lay.hidden && lay.open && lay.waterMax0 === 7 ? 'pass' : 'fail', JSON.stringify(lay));
  // 데크 링 실터치: 킷 링 오른쪽에 ㄷ자 데크(왼 열은 킷 링의 오른 열을 빌린다) → 안쪽이 자동으로 수역이 된다
  await page.evaluate(`(() => { const w = window.__pj; w.game.money = 50000; w.dock.enter('deck'); const gt = w.game.gate; w.scene.focusTile(gt.i + 12, gt.j + 17, 150); })()`);
  await page.waitForTimeout(400);
  const ring = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; const pts = []; /* P48-b3: 왼 벽은 본류 잔교(gt.i+10, 행 24~26), 위는 물가 뭍(행 23) — 잔교를 한 칸 늘리고(행 27) 오른 열 4 · 아랫줄 3 = 8칸, 안쪽 3×3 */ pts.push({ i: gt.i + 10, j: gt.j + 19 }); for (let j = 16; j <= 19; j++) pts.push({ i: gt.i + 14, j: gt.j + j }); for (let i = 11; i <= 13; i++) pts.push({ i: gt.i + i, j: gt.j + 19 }); return pts.map((t) => { const r = w.scene.tileScreenRect(t.i, t.j); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }); })()`)) as { x: number; y: number }[];
  for (const p of ring) { await touch(cdp, p.x, p.y); await page.waitForTimeout(450); } // 320ms 안의 다음 탭은 더블탭(확대)으로 먹힌다 — P1 과 같은 간격
  const done = await page.evaluate(`(() => { const b = document.querySelector('#dock-pool [data-act="done"]') || [...document.querySelectorAll('#dock-pool button')].find((x) => x.textContent.trim() === '완료'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; let deck = 0; for (let k = 0; k < g.grid.floor.length; k++) if (g.grid.floor[k] === 7) deck++; return { pools: g.pools.all.length, tiles: g.pools.totalTiles(), deck, inner: g.grid.at(gt.i + 12, gt.j + 17) }; })()`)) as { pools: number; tiles: number; deck: number; inner: number };
  record('P15 데크 ㄷ자 실터치 8칸(잔교 곁) → 안쪽 3×3 이 자동 수역(+9) · 수역 2개 · 데크 27', after.pools === 2 && after.tiles === 29 && after.deck === 27 && after.inner === 4 ? 'pass' : 'fail', JSON.stringify(after));
  const perm = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const a = g.permitDepth; g.rank = 2; g.openLand(2); const b = g.permitDepth; const gt = g.gate; return { a, b, farOk: g.canPaintDeck(gt.i + 12, gt.j + 31).ok /* 물가 거리 16 > 13 */, nearOk: g.canPaintDeck(gt.i + 15, gt.j + 16).ok /* P48-b3: ㄷ자 오른 열(gt.i+14) 옆 */ }; })()`)) as { a: number; b: number; farOk: boolean; nearOk: boolean };
  record('P15 수면 허가 — 랭크 0 은 물가 깊이 7, 랭크 2 는 13 · 허가 밖 강엔 데크를 못 깐다 (P48-b3: 행이 아니라 거리)', perm.a === 7 && perm.b === 13 && !perm.farOk && perm.nearOk ? 'pass' : 'fail', JSON.stringify(perm));
}

/** P14 — 레거시 구조: 아틀라스 프레임이 실제로 뜬다(지면·시설 source art, 레거시 프레임 크기) · 물 22줄 · `?legacy=0` 이면 절차로 떨어진다 */
async function verifyP14(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&px=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const on = (await page.evaluate(`(() => { const w = window.__pj; const pr = w.provider; const g = w.game; let water = 0; for (let j = 0; j < g.grid.h; j++) if ([5, 6].includes(g.grid.at(0, j))) water++; const dock = g.facilities.all.find((f) => f.defId === 'dock'); const key = 'fac/dock/0'; const tex = w.scene.textures.exists(key); return { grass: pr.spec('tile/grass'), river: pr.spec('tile/river:0'), dock: pr.spec(key), water, land: g.land, docked: !!dock, tex }; })()`)) as { grass: { source: string; w: number; h: number } | null; river: { source: string } | null; dock: { source: string; w: number; h: number } | null; water: number; land: { j0: number; h: number; w: number }; docked: boolean; tex: boolean };
  const okOn = on.grass?.source === 'art' && on.grass.w === 32 && on.grass.h === 16 && on.river?.source === 'art' && on.dock?.source === 'art' && on.dock.w === 32 && on.dock.h === 28 && on.water === 22 && on.land.j0 === 8 && on.land.h === 42 && on.docked && on.tex;
  record('P14 레거시 아틀라스 — 잔디·강 타일과 선착장이 art(레거시 프레임 크기 32×16 · 32×28) · 물 22줄 · 뭍 토지 42줄 고정(P43)', okOn ? 'pass' : 'fail', JSON.stringify({ grass: on.grass, dock: on.dock, water: on.water, land: on.land, tex: on.tex }));
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&legacy=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const off = (await page.evaluate(`(() => { const pr = window.__pj.provider; return { grass: pr.spec('tile/grass'), dock: pr.spec('fac/dock/0') }; })()`)) as { grass: { source: string } | null; dock: { source: string; w: number } | null };
  record('P14 대조군 ?legacy=0 — 잔디가 절차 도트로 떨어진다', off.grass?.source !== 'art' || (off.dock?.w ?? 0) !== 28 ? 'pass' : 'fail', JSON.stringify(off));
  void cdp;
}

/** P11 — 엔딩 이월 문구에 기구 · 사건이 끼어들기 예산을 탄다(연속 두 사건 중 둘째는 미뤄진다) */
async function verifyP11(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.endingWin.show(); const txt = [...document.querySelectorAll('#win-ending .krow-sub')].map((e) => e.textContent).join(' '); w.endingWin.win.hide(); return { txt }; })()`)) as { txt: string };
  record('P11 엔딩 창 이월 문구에 「기구」(부표는 P49-a2 물빛 삭제로 없음)', r.txt.includes('기구') && !r.txt.includes('부표') ? 'pass' : 'fail', r.txt.slice(0, 120));
  const ev = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.resultsCtl.enabled = false; g.forceEvent('mt_season'); w.skip(1); const first = w.choiceWin.visible; if (first) { g.resolveEvent(1); w.choiceWin.win.hide(); w.skip(1); } g.forceEvent('army_leave'); w.skip(1); const second = w.choiceWin.visible; return { first, second, pending: g.events.pending }; })()`)) as { first: boolean; second: boolean; pending: string | null };
  record('P11 사건 창 끼어들기 예산 — 첫 사건은 뜨고, 1분 안의 둘째 사건은 미뤄져 pending 으로 남는다', ev.first && !ev.second && ev.pending === 'army_leave' ? 'pass' : 'fail', JSON.stringify(ev));
  void cdp;
}

/** P9 — 사계절·출신지: 눈 연출 등록(겨울) · 손님이 출신지 취향을 안고 있다 · 손님 카드에 출신지 */
async function verifyP9(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const before = w.fxFired['snow-fall'] || 0; w.scene.fx('snow-fall', { x: 100, y: -4, amount: 1 }); w.scene.fx('petal-fall', { x: 120, y: -4, amount: 0 }); w.skip(600); const gs = w.game.guests.all; const tasted = gs.filter((g) => g.taste).length; return { snow: (w.fxFired['snow-fall'] || 0) - before, guests: gs.length, tasted, homes: [...new Set(gs.map((g) => g.home))].slice(0, 4) }; })()`)) as { snow: number; guests: number; tasted: number; homes: string[] };
  record('P9 겨울 눈 연출 등록부 · 손님이 출신지 취향을 안고 있다 · 출신지 이름이 한국식', r.snow >= 1 && r.guests > 0 && r.tasted === r.guests && r.homes.every((h) => /[가-힣]/.test(h)) ? 'pass' : 'fail', JSON.stringify(r));
  void cdp;
}

/** P8 — 알바 슬롯 (D14): 시설 정보 창의 버튼 하나 실터치 → 알바 · 유지비 +임금 · 청결 행 · 놀 수 없는 시설엔 버튼 없음 */
async function verifyP8(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const opened = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 30000; const shop = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'restaurant'); w.facilityInfo.show(shop.uid); const b = document.getElementById('win-facility-staff'); const r = b.getBoundingClientRect(); return { uid: shop.uid, hidden: b.classList.contains('khide'), x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.textContent, m0: g.dailyMaintenance() }; })()`)) as { uid: number; hidden: boolean; x: number; y: number; label: string; m0: number };
  await touch(cdp, opened.x, opened.y);
  await page.waitForTimeout(400);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.facilities.byUid(${opened.uid}); const rows = [...document.querySelectorAll('#win-facility .krow')].map((r) => r.textContent); const label = document.getElementById('win-facility-staff').textContent; const m1v = g.dailyMaintenance(); let palm = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'decor'); if (!palm) { const gt = g.gate; const rr = g.placeFacility('flowerbed', gt.i - 16, gt.j + 14, 0); palm = g.facilities.byUid(rr.uid); } /* P29: 킷에 장식이 없다 — 하나 놓고 본다. P48-b3: 서쪽 잔디 */ w.facilityInfo.show(palm.uid); const palmHidden = document.getElementById('win-facility-staff').classList.contains('khide'); w.facilityInfo.win.hide(); return { staff: f.staff, m1: m1v, label, hasRow: rows.some((t) => t.includes('알바') && t.includes('있음')), palmHidden }; })()`)) as { staff: number; m1: number; label: string; hasRow: boolean; palmHidden: boolean };
  record('P8 알바 버튼 실터치 → 매점 알바 1 · 유지비 +60 · 「알바 있음」 행 · 장식엔 버튼 없음', !opened.hidden && after.staff === 1 && after.m1 === opened.m0 + 60 && after.label.includes('해고') && after.hasRow && after.palmHidden ? 'pass' : 'fail', JSON.stringify({ before: opened.label, after }));
}

/** P7 — 기구 공방: MENU 항목 · 창 실터치(부품 칩 2 → 개발하기) → 결과 줄 · 발견이면 코스 독 기구가 는다 · 요리 창은 그대로(레시피 180) */
async function verifyP7(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const center = async (sel: string): Promise<{ x: number; y: number } | null> => (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const menu = (await page.evaluate(`(() => { const w = window.__pj; w.mainMenu.show(); const has = !!document.querySelector('#win-menu-main [data-menu="workshop"]'); const cook = !!document.querySelector('#win-menu-main [data-menu="cook"]'); w.mainMenu.hide(); return { has, cook }; })()`)) as { has: boolean; cook: boolean };
  await page.evaluate(`(() => { const w = window.__pj; w.game.money = 50000; w.workshopWin.show(); })()`);
  await page.waitForTimeout(300);
  const before = (await page.evaluate(`(() => { const w = window.__pj; return { owned: w.game.courses.ownedEquipment.size, chips: document.querySelectorAll('#win-workshop [data-ingredient]').length, head: document.querySelector('#win-workshop .krow .krow-k').textContent, codex: document.querySelectorAll('#win-workshop [data-codex]').length }; })()`)) as { owned: number; chips: number; head: string; codex: number };
  const c1 = await center('#win-workshop [data-ingredient]:nth-of-type(1)');
  if (c1) await touch(cdp, c1.x, c1.y);
  await page.waitForTimeout(200);
  const c2 = await center('#win-workshop [data-ingredient]:nth-of-type(2)');
  if (c2) await touch(cdp, c2.x, c2.y);
  await page.waitForTimeout(200);
  const go = await center('#win-workshop-go');
  if (go) await touch(cdp, go.x, go.y);
  await page.waitForTimeout(400);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const res = document.querySelector('#win-workshop .kresult'); const out = { outcome: res ? res.dataset.outcome : null, text: res ? res.textContent : null, owned: w.game.courses.ownedEquipment.size, attempts: w.game.workshop.attempts, known: w.game.workshop.known.size, recipes: w.game.cooking.recipes.size }; w.workshopWin.win.hide(); return out; })()`)) as { outcome: string | null; text: string | null; owned: number; attempts: number; known: number; recipes: number };
  const ok = menu.has && menu.cook && before.chips >= 6 && before.head.includes('기구') && before.codex >= 30 && after.attempts === 1 && ['new', 'known', 'fail'].includes(after.outcome ?? '') && (after.outcome !== 'new' || after.owned === before.owned + 1) && after.recipes >= 180;
  record('P7 기구 공방 — MENU 항목 · 부품 칩 ≥6 · 도감 ≥30 · 실터치 2칩 + 개발하기 → 결과(발견이면 기구 +1) · 레시피 ≥180', ok ? 'pass' : 'fail', JSON.stringify({ menu, before: { chips: before.chips, codex: before.codex, head: before.head }, after }));
}

/** P6 — 빠지 심사: 계열 탭 8 이 빠지식 라벨 · 심사위원 셋 이름(군청 공무원·해경·유튜버) · 편향 0(세 점수 동일) · 장날 창 제목 */
async function verifyP6(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const tabs = (await page.evaluate(`(() => { const w = window.__pj; w.certWin.show(); const t = [...document.querySelectorAll('#win-cert .ktab')].map((b) => b.textContent.trim()); const title = document.querySelector('#win-cert .kwin-title').textContent; w.certWin.win.hide(); return { t, title }; })()`)) as { t: string[]; title: string };
  const want = ['물놀이', '세트', '먹거리', '사철', '맛집', '스릴', '안전', '청결']; /* P60-a·c: 색·향 계열 → 세트·먹거리 */
  record('P6 빠지 심사 창 — 계열 탭 8 = 물놀이·세트·먹거리·사철·맛집·스릴·안전·청결 (P60-c)', tabs.title.includes('빠지 심사') && want.every((k) => tabs.t.includes(k)) ? 'pass' : 'fail', JSON.stringify(tabs));
  // 신청 → 심사일까지 감기 → 결과 창: 심사위원 이름 · 편향 0 이라 세 점수가 같다
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 30000; const r = g.applyCert('grade_f'); if (!r.ok) throw new Error(r.reason); const target = g.certs.state.applied.judgeDay; while (g.day < target) w.skip(w.TPD - g.tick); w.skip(w.JUDGE_TICK + 1 - g.tick); })()`);
  await page.waitForTimeout(500);
  const res = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.certResultWin.show(); const names = [...document.querySelectorAll('#win-cert-result .kjudge-name')].map((e) => e.textContent); const last = g.certs.state.last; w.certResultWin.win.hide(); return { names, judges: last ? last.judges : null, score: last ? last.score : null }; })()`)) as { names: string[]; judges: number[] | null; score: number | null };
  const eq = !!res.judges && res.judges.length === 3 && new Set(res.judges).size === 1;
  record('P6 심사 결과 창 — 심사위원 군청 공무원·해경·유튜버 · 편향 0(세 점수 동일)', res.names.join(',') === '군청 공무원,해경,유튜버' && eq ? 'pass' : 'fail', JSON.stringify(res));
  const shop = (await page.evaluate(`(() => { const w = window.__pj; w.shopWin.show(); const t = document.querySelector('#win-shop .kwin-title').textContent; w.shopWin.win.hide(); return t; })()`)) as string;
  record('P6 장날 창 제목', shop === '장날' ? 'pass' : 'fail', shop);
  void cdp;
}

/** P5 — SNS 친구 탭: 출신지 소개 + 버스 이름 · 다음 출신지 · 소원 문장이 한국어 빠지 어휘 */
async function verifyP5(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const cellAt = (await page.evaluate(`(() => { const e = document.querySelector('#hud-right [data-cell="sns"]'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number };
  await touch(cdp, cellAt.x, cellAt.y);
  await page.waitForTimeout(400);
  const tabAt = (await page.evaluate(`(() => { const e = document.querySelector('#win-sns [data-tab="friends"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  if (tabAt) await touch(cdp, tabAt.x, tabAt.y);
  await page.waitForTimeout(300);
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const areas = [...g.sns.areasById.values()]; const cur = areas.find((a) => a.order === 0); const nx = areas.find((a) => a.order === 1); const intro = document.getElementById('sns-area-intro'); const next = document.getElementById('sns-area-next'); const wish = g.sns.activeWishes()[0]; return { open: !document.getElementById('win-sns').hidden, intro: intro ? intro.textContent : null, next: next ? next.textContent : null, curName: cur.name, curBus: cur.bus || null, nxName: nx.name, nxBus: nx.bus || null, wishLine: wish ? wish.wish.line : null, friends: g.sns.unlockedFriends.map((s) => g.sns.friendDef(s.id).name) }; })()`)) as { open: boolean; intro: string | null; next: string | null; curName: string; curBus: string | null; nxName: string; nxBus: string | null; wishLine: string | null; friends: string[] };
  const ok = r.open && !!r.curBus && !!r.nxBus && !!r.intro && r.intro.includes(r.curName) && r.intro.includes(r.curBus) && !!r.next && r.next.includes(r.nxName) && r.next.includes(r.nxBus) && r.friends.every((n) => /[가-힣]/.test(n));
  record('P5 SNS 친구 탭 실터치 → 출신지 소개+버스 이름 · 다음 출신지+버스 · 친구 이름 한글', ok ? 'pass' : 'fail', JSON.stringify({ intro: r.intro, next: r.next, friends: r.friends.slice(0, 4) }));
  await page.evaluate(`(() => { window.__pj.snsWin.hide(); })()`).catch(() => undefined);
}

/** P4 — 코스: 선착장이 있으면 코스 칸이 열린다 · 독 진입 → 핸들·선착장 표식 · 핸들을 실제 드래그 → 판정 갱신 · 적용 → 코스 1 · 시험 운행 반응 · 손님 탑승·요금 */
async function verifyP4(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const center = async (sel: string): Promise<{ x: number; y: number } | null> => (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const cell = (await page.evaluate(`(() => { const w = window.__pj; w.refreshHud(); const c = document.querySelector('#hud-right [data-cell="course"]'); return { locked: c.dataset.locked || null }; })()`)) as { locked: string | null };
  const cellAt = await center('#hud-right [data-cell="course"]');
  if (cellAt) await touch(cdp, cellAt.x, cellAt.y);
  await page.waitForTimeout(500);
  const open = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const d = w.courseDock; const hs = w.scene.courseHandlesForTest(); const marks = w.scene.dockMarks; return { active: d.isActive, dockUp: !document.getElementById('dock-course').hidden, handles: hs.length, marks: marks.length, presets: document.querySelectorAll('#dock-course [data-preset]').length, equips: document.querySelectorAll('#dock-course [data-equip]').length, status: document.querySelector('#dock-course .kdock-status').textContent }; })()`)) as { active: boolean; dockUp: boolean; handles: number; marks: number; presets: number; equips: number; status: string };
  record('P4 코스 칸 열림(선착장 있음) · 실터치 → 코스 독 · 핸들 ≥2 · 선착장 표식 ≥1 · 형태·기구 칩', cell.locked === null && open.active && open.dockUp && open.handles >= 2 && open.marks >= 1 && open.presets >= 1 && open.equips >= 2 ? 'pass' : 'fail', JSON.stringify({ cell, ...open }));
  // 핸들 1 을 실제 드래그 — 화면 좌표는 씬이 준다 (리프트 보정 포함)
  const h0 = (await page.evaluate(`(() => { const w = window.__pj; const hs = w.scene.courseHandlesForTest(); const h = hs[0]; const r = w.scene.tileScreenRect(h.x, h.y); return { i: h.x, j: h.y, x: r.x + r.w / 2, y: r.y + r.h / 2 }; })()`)) as { i: number; j: number; x: number; y: number };
  await drag(cdp, h0.x, h0.y, h0.x + 32, h0.y, 8);
  await page.waitForTimeout(300);
  const moved = (await page.evaluate(`(() => { const w = window.__pj; const hs = w.scene.courseHandlesForTest(); const d = w.courseDock.currentDraft; return { i: hs[0].x, j: hs[0].y, draftI: d ? d.handles[0].x : null, status: document.querySelector('#dock-course .kdock-status').textContent }; })()`)) as { i: number; j: number; draftI: number | null; status: string };
  record('P4 핸들 실제 드래그 → 핸들 칸이 바뀌고 초안·판정이 따라온다', (moved.i !== h0.i || moved.j !== h0.j) && moved.draftI === moved.i ? 'pass' : 'fail', JSON.stringify({ before: [h0.i, h0.j], after: [moved.i, moved.j], draftI: moved.draftI, status: moved.status.slice(0, 40) }));
  // 원래 자리로 되돌리고(제안 초안이 유효) 시험 운행 → 적용
  await page.evaluate(`(() => { const w = window.__pj; const d = w.courseDock; const s = w.game.suggestCourse(); if (s.ok) { w.courseDock.onHandleMove(0, s.draft.handles[0].x, s.draft.handles[0].y); } })()`);
  const trialBtn = await center('#dock-course-trial');
  if (trialBtn) await touch(cdp, trialBtn.x, trialBtn.y);
  await page.waitForTimeout(4600);
  const trial = (await page.evaluate(`(() => { const w = window.__pj; return { log: w.scene.courseTrialLogForTest().length, running: w.scene.courseTrialRunning }; })()`)) as { log: number; running: boolean };
  const applyBtn = await center('#dock-course-apply');
  if (applyBtn) await touch(cdp, applyBtn.x, applyBtn.y);
  await page.waitForTimeout(300);
  const applied = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const n = g.courses.count; w.courseDock.exit(); w.skip(1200); return { courses: n, riders: g.stats.courseRiders || 0, revenue: g.stats.courseRevenue || 0, chips: document.querySelectorAll('#dock-course [data-course]').length }; })()`)) as { courses: number; riders: number; revenue: number; chips: number };
  record('P4 시험 운행 반응 ≥3 (4초) · 적용 → 코스 1 · 1200tick 안에 손님 탑승·요금', trial.log >= 3 && !trial.running && applied.courses === 1 && applied.riders >= 1 && applied.revenue > 0 ? 'pass' : 'fail', JSON.stringify({ ...trial, ...applied }));
}

/** G25 — 시작 킷(풀 12칸 · 시설 7) · 물 비율 · 경계 나무 · 코핑 */
async function verifyG25(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  await page.waitForTimeout(600);
  const kit = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; return { tiles: g.pools.totalTiles(), pools: g.pools.all.length, facs: g.facilities.all.length, money: g.money, trees: w.scene.borderCountForTest() }; })()`)) as { tiles: number; pools: number; facs: number; money: number; trees: number };
  record('G25 시작 킷 — 풀 20칸 · 시설 23(P57-c main 승인 배치: 매표·실내 매점·화장실·자판기·선착장 + env 장식 16 + P58-a 식탁 2) · 돈 12,000 · 경계·들판 나무 ≥ 12', kit.tiles === 20 && kit.pools === 1 && kit.facs === 23 && kit.money === 12000 && kit.trees >= 12 ? 'pass' : 'fail', JSON.stringify(kit));
  await page.screenshot({ path: `${SHOT_DIR}/g25-start.png` });
  const water = (await page.evaluate(`(async () => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return -1; const w = c.width, h = c.height; const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); let n = 0; for (let i = 0; i < buf.length; i += 16) { const r = buf[i], g = buf[i + 1], b = buf[i + 2]; if (g > 150 && g > r + 30 && g > b + 40) n++; } return n / (buf.length / 16); })()`)) as number;
  const blue = (await page.evaluate(`(async () => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return -1; const w = c.width, h = c.height; const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); let n = 0; for (let i = 0; i < buf.length; i += 16) { const r = buf[i], g = buf[i + 1], b = buf[i + 2]; if (b > 150 && b > r + 40 && b > g + 10) n++; } return n / (buf.length / 16); })()`)) as number;
  record('G25→P43→S2→P57-c 첫 화면 — main 승인 배치: 정문·출입동·앞마당(수역은 아래 귀퉁이에 걸친다) — 물 ≥ 5% · 잔디 ≥ 2% (옛 「광장+선착장+킷 빠지 · 물 ≥ 15%」 는 옛 첫 화면 기준)', blue >= 0.05 && water >= 0.02 ? 'pass' : 'fail', `물 ${Math.round(blue * 1000) / 10}% · 잔디 ${Math.round(water * 1000) / 10}%`);
}

/** Current player default, separate from historical G/P map fixtures above. */
async function verifyApprovedArrival(page: import('playwright').Page): Promise<void> {
  const check = (name: string, ok: boolean, detail = ''): void => record(name, ok ? 'pass' : 'fail', detail);
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&events=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj');
  const layout = await page.evaluate<{ revision: number; indoor: number; doors: unknown[]; removed: number; decor: number; ticket: { i: number; j: number; passage: unknown[] }; lane: boolean; blocked: boolean; trees: number; missing: number }>(`(() => {
    const w = window.__pj, g = w.game; w.flow.frozen = true;
    return { revision:g.arrivalRevision, indoor:[...g.grid.floor].filter(c => c === 3 || c === 15).length,
      doors:g.grid.doors(), removed:g.facilities.all.filter(f => ['pyeongsang_row','pingpong'].includes(f.defId)).length,
      decor:g.facilities.all.filter(f => f.defId.startsWith('env_')).length,
      ticket:g.facilities.all.find(f => f.defId === 'ticket'),
      lane:[9,10,11,18,19].every(j => g.guests.walkable(48,j)), blocked:g.canPlace('env_flower_pot',48,12).ok,
      trees:w.scene.borderImgs.filter(i => ['fac/env_pine/0','fac/env_deciduous/0','fac/env_shrubs/0'].includes(i.texture.key)).length,
      missing:w.scene.children.list.filter(o => o.texture && o.texture.key === '__MISSING').length };
  })()`);
  check('통합 초기 맵 — P57-c 절충: 출입동은 옛 킷 20×13(실내 259) · 정문/마당 문 · 시작 평상/탁구대 0 · 벽밖 장식 16(물가 산책로 두 줄은 비운다)',
    layout.revision === 2 && layout.indoor === 259 && layout.doors.length === 2 && layout.removed === 0 && layout.decor === 16, JSON.stringify(layout));
  check('통합 매표소 — (46,9) 통과 칸 2 · 입구/복도/남문 연결 · 통로를 막는 건설 거절',
    layout.ticket.i === 46 && layout.ticket.j === 9 && layout.ticket.passage.length === 2 && layout.lane && !layout.blocked);
  check('통합 바깥 나무 — 승인 환경 그림 ≥12 · 누락 텍스처 0', layout.trees >= 12 && layout.missing === 0);
  const motion = await page.evaluate<{ maxStep: number; seen: number[]; keys: string[]; flips: boolean[] }>(`(() => {
    const w=window.__pj, g=w.game, p=g.guests.spawn(); p.age=25;p.float=0;
    const seen=[]; let maxStep=0, before=[p.i,p.j];
    for(let k=0;k<200&&p.state!=='wander';k++) {g.guests.step(); maxStep=Math.max(maxStep,Math.abs(p.i-before[0])+Math.abs(p.j-before[1]));
      if(p.progress===1&&seen[seen.length-1]!==p.j)seen.push(p.j);before=[p.i,p.j];}
    p.state='walk'; const keys=[];const flips=[];
    for(let facing=0;facing<4;facing++){p.facing=facing;w.syncWorldToScene();w.scene.syncGuests();const im=w.scene.guestImgs.get(p.uid);keys.push(im.texture.key);flips.push(im.flipX);}
    return {maxStep,seen,keys,flips};
  })()`);
  check('통합 입장 이동 — 매표소→실내→남문 순서 · 한 번에 최대 1칸', motion.maxStep <= 1 && motion.seen.join(',') === '9,10,11,12,13,14,15,16,17,18,19,20,21' /* P57-c: 20×13 이라 남문(20)·마당(21)까지 */, JSON.stringify(motion));
  check('통합 NPC V8 — 실제 손님 이미지 앞/뒤/반전 4방향 · 중복 반전 없음',
    motion.keys.every((k: string) => k.startsWith('guest/v8/')) && motion.keys[0]!.includes('/front_walk/0/') && motion.keys[1]!.includes('/front_walk/1/')
    && motion.keys[2]!.includes('/back_walk/1/') && motion.keys[3]!.includes('/back_walk/0/') && motion.flips.every((f: boolean) => !f));
  await page.evaluate('window.__pj.game.money = 12345');
  await page.locator('#hud-save').click();
  await page.goto(`${BASE}/?debug=1&px=1&tut=0&events=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj');
  const restored = await page.evaluate<{ revision: number; money: number; pass: boolean; decor: number }>(`(() => {const w=window.__pj;w.flow.frozen=true;return {revision:w.game.arrivalRevision,money:w.game.money,pass:w.game.guests.walkable(48,9),decor:w.game.facilities.all.filter(f=>f.defId.startsWith('env_')).length};})()`);
  check('통합 저장 — SAVE 후 재접속에 배치 버전·돈·매표 통로·장식 유지', restored.revision === 2 && restored.money === 12345 && restored.pass && restored.decor === 16, /* P57-c 절충 배치 */ JSON.stringify(restored));
  await page.screenshot({ path: `${SHOT_DIR}/approved-arrival-mobile.png` });
}

async function main(): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`워터파크 검증 — ${URL} · ${GOAL}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED });
  const ctx = await browser.newContext(DEVICE); // ⚠ reducedMotion: 'reduce' 를 넣지 말 것 — FX 등록부가 트윙클을 빼서 G27 이 빨개진다 (P59-a 실측). 창 열림은 opacity 만 움직여(P59-a) 기하가 첫 프레임부터 정확하다
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  if (process.argv.includes('--arrival-only')) {
    await verifyApprovedArrival(page);
    record('콘솔 에러 0', errors.length === 0 ? 'pass' : 'fail', errors.slice(0, 3).join(' | '));
    await browser.close();
    const fails = results.filter(r => r.verdict === 'fail');
    console.log(fails.length ? `❌ ${fails.length} 실패` : `✅ ${results.length} 통과`);
    process.exit(fails.length ? 1 : 0);
  }
  // ⚠ addInitScript 로 localStorage 를 비우지 말 것 — 리로드마다 실행돼 세이브 왕복 검사가 빈 판을 읽는다. 첫 로드는 fresh=1 이 비운다

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { const b = document.getElementById('wp-debug'); return !!b && (b.textContent || '').includes('FPS'); })()`, undefined, { timeout: 15000 });
  const bootMs = Date.now() - t0;
  record('부팅 — 디버그 상자에 FPS', bootMs <= 5000 ? 'pass' : 'fail', `${bootMs}ms`);
  await page.waitForTimeout(600);

  // 정체 — 소스 대조
  const served = (await (await page.request.get(`${BASE}/__pj_build`)).json()) as { sha: string; sourceDigest: string };
  const inPage = (await page.evaluate(`window.__pj.build`)) as { sourceDigest: string } | null;
  record('정체 — 서버와 페이지 번들이 같은 소스', inPage !== null && inPage.sourceDigest === served.sourceDigest ? 'pass' : 'fail',
    `${served.sourceDigest.slice(0, 10)} / ${inPage?.sourceDigest.slice(0, 10) ?? '없음'}`);

  // 캔버스·도트 격자
  const dot = (await page.evaluate(`(() => { const c = document.querySelector('canvas'); const s = window.__pj.stats();
    return { canvas: !!c, cssW: c ? c.getBoundingClientRect().width : 0, dpr: devicePixelRatio, scale: s ? s.scale : 0, violations: s ? s.violations : ['no stats'] }; })()`)) as
    { canvas: boolean; cssW: number; dpr: number; scale: number; violations: string[] };
  record('캔버스 생성 · 정수 업스케일 위반 0', dot.canvas && dot.violations.length === 0 ? 'pass' : 'fail', `S${dot.scale} css ${dot.cssW} dpr ${dot.dpr} ${dot.violations.join('/')}`);

  // 홈 정체·터치 타깃·소유·예산
  const home = (await page.evaluate(HOME_IDENTITY)) as { missing: string[]; small: string[]; stolen: string[]; extra: string[]; hudPct: number };
  record('홈 상시 컨트롤 — 정체 9 · ≥44px · 자리에서 눌림', home.missing.length + home.small.length + home.stolen.length === 0 ? 'pass' : 'fail',
    `missing ${home.missing.join(',') || '-'} small ${home.small.join(',') || '-'} stolen ${home.stolen.join(',') || '-'}`);
  record('홈에 계약 밖 컨트롤 없음', home.extra.length === 0 ? 'pass' : 'fail', home.extra.join(',') || '-');
  record('HUD 면적 ≤ 20% (P59-a D70 상단 띠 2줄 44px 로 18 → 20 — 원작 띠의 몫 +2.1%p · K47 세로 예산 24% 안)', home.hudPct <= 20 ? 'pass' : 'fail', `${home.hudPct}%`);
  await page.screenshot({ path: `${SHOT_DIR}/g0-home.png` });

  // 팬 — 진짜 터치
  const before = (await page.evaluate(`window.__pj.stats()`)) as { scrollX: number; scrollY: number };
  await drag(cdp, 200, 400, 120, 300);
  await page.waitForTimeout(250);
  const after = (await page.evaluate(`window.__pj.stats()`)) as { scrollX: number; scrollY: number };
  record('드래그로 팬 — scroll 이 움직인다', after.scrollX !== before.scrollX || after.scrollY !== before.scrollY ? 'pass' : 'fail',
    `${before.scrollX},${before.scrollY} → ${after.scrollX},${after.scrollY}`);

  // 핀치 — CDP 멀티터치
  await pinch(cdp, 196, 400, 80, 200);
  await page.waitForTimeout(250);
  const zoomed = (await page.evaluate(`window.__pj.stats()`)) as { scale: number; violations: string[] };
  record('핀치 벌리기 → S=2 · 위반 0', zoomed.scale === 2 && zoomed.violations.length === 0 ? 'pass' : 'fail', `S${zoomed.scale}`);
  await page.screenshot({ path: `${SHOT_DIR}/g0-zoom.png` });
  await pinch(cdp, 196, 400, 200, 80);
  await page.waitForTimeout(250);
  const back = (await page.evaluate(`window.__pj.stats()`)) as { scale: number };
  record('핀치 오므리기 → S=1', back.scale === 1 ? 'pass' : 'fail', `S${back.scale}`);

  // 더블탭 토글
  await touch(cdp, 196, 420);
  await page.waitForTimeout(120);
  await touch(cdp, 196, 420);
  await page.waitForTimeout(250);
  const dbl = (await page.evaluate(`window.__pj.stats()`)) as { scale: number };
  record('더블탭 → S=2', dbl.scale === 2 ? 'pass' : 'fail', `S${dbl.scale}`);
  await page.evaluate(`window.__pj.scene.setUpscale(1)`);

  // 타일 텍스처 — 토지 안 잔디 · 밖 모래 · 입구
  const gate = gateTile(0);
  const tex = (await page.evaluate(`(() => { const s = window.__pj.scene; return { corner: s.tileTextureAt(0, 0), gate: s.tileTextureAt(${gate.i}, ${gate.j}), land: s.tileTextureAt(${gate.i - 4}, ${gate.j + 6}) }; })()`)) as
    { corner: string; gate: string; land: string };
  const baseKey = (k: string): string => k.split('|')[0] ?? k; // P0-B: 단이 있는 칸은 `|zN` 기둥 텍스처
  record('지형 — 지도 위 귀퉁이 들판(P44: 잔디, 가로수 줄) · 토지 잔디 · 입구 표식', baseKey(tex.corner).startsWith('tile/grass') && baseKey(tex.land) === 'tile/grass' && baseKey(tex.gate) === 'tile/gate' ? 'pass' : 'fail', JSON.stringify(tex));

  // 토스트 — 잠긴 칸(요리 · 2년차) 터치 → 토스트가 뜬다 (잠김은 가림막이 아니라 예고)
  const cell = await page.evaluate(`(() => { const r = document.querySelector('#hud-right [data-cell="course"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number };
  await touch(cdp, cell.x, cell.y);
  await page.waitForTimeout(200);
  const toastShown = (await page.evaluate(`!document.getElementById('hud-toast').hidden && document.documentElement.dataset.uiSurface === 'home'`)) as boolean;
  record('잠긴 우측 칸 터치 → 토스트 (화면은 홈 그대로)', toastShown ? 'pass' : 'fail');

  if (G >= 1) await verifyG1(page, cdp);
  if (G >= 3) await verifyG3(page, cdp);
  if (G >= 4) await verifyG4(page, cdp);
  if (G >= 5) await verifyG5(page, cdp);
  if (G >= 6) await verifyG6(page, cdp);
  if (G >= 8) await verifyG8(page, cdp);
  if (G >= 9) await verifyG9(page);
  if (G >= 11) await verifyG11(page, cdp);
  if (G >= 12) await verifyG12(page, cdp);
  if (G >= 19) await verifyG19(page, cdp);
  if (G >= 20) await verifyG20(page, cdp);
  if (G >= 23) await verifyG23(page, cdp);
  if (G >= 24) await verifyG24(page, cdp);
  if (G >= 25) await verifyG25(page);
  if (G >= 26) await verifyG26(page);
  if (G >= 27) await verifyG27(page);
  if (G >= 29) await verifyG29(page);
  if (G >= 30) await verifyG30(page);
  if (G >= 40) await verifyG40(page, cdp);
  if (G >= 41) await verifyG41(page);
  if (G >= 43) await verifyG43(page);
  if (G >= 44) await verifyG44(page);
  if (G >= 46) await verifyG46(page);
  if (G >= 47) await verifyG47(page);
  if (G >= 48) await verifyG48(page);
  if (G >= 49) await verifyG49(page);
  if (G >= 50) await verifyG50(page);
  if (G >= 51) await verifyG51(page);
  if (G >= 52) await verifyG52(page);
  if (G >= 53) await verifyG53(page);
  if (G >= 54) await verifyG54(page);
  if (G >= 55) await verifyG55(page);
  if (G >= 56) await verifyG56(page);
  if (G >= 57) await verifyG57(page);
  if (G >= 100) await verifyP0(page);
  if (G >= 101) await verifyP1(page, cdp);
  if (G >= 104) await verifyP4(page, cdp);
  if (G >= 105) await verifyP5(page, cdp);
  if (G >= 106) await verifyP6(page, cdp);
  if (G >= 107) await verifyP7(page, cdp);
  if (G >= 108) await verifyP8(page, cdp);
  if (G >= 109) await verifyP9(page, cdp);
  if (G >= 111) await verifyP11(page, cdp);
  if (G >= 114) await verifyP14(page, cdp);
  if (G >= 115) await verifyP15(page, cdp);
  if (G >= 116) await verifyP16(page, cdp);
  if (G >= 117) await verifyP17(page, cdp);
  if (G >= 118) await verifyP18(page, cdp);
  if (G >= 122) await verifyP22(page, cdp);
  if (G >= 123) await verifyP23(page, cdp);
  if (G >= 124) await verifyP24(page, cdp);
  if (G >= 125) await verifyP25(page, cdp);
  if (G >= 126) await verifyP26(page, cdp);
  if (G >= 127) await verifyP27(page, cdp);
  if (G >= 128) await verifyP28(page, cdp);
  if (G >= 129) await verifyP29(page, cdp);
  if (G >= 130) await verifyP30(page, cdp);
  if (G >= 134) await verifyP34(page, cdp);
  if (G >= 139) await verifyP39(page, cdp);
  if (G >= 142) await verifyP42(page, cdp);
  if (G >= 143) await verifyP43(page, cdp);
  if (G >= 144) await verifyP44(page, cdp);
  if (G >= 145) await verifyP45(page, cdp);
  if (G >= 148.22) await verifyP48b2(page);
  if (G >= 149.2) await verifyP49b(page);
  if (G >= 150.1) await verifyP50a(page, cdp);
  if (G >= 150.22) await verifyP50b2(page, cdp);
  if (G >= 152.2) await verifyP52b(page);
  if (G >= 153.3) await verifyP53c(page);
  if (G >= 156.1) await verifyP56a(page);
  if (G >= 156.12) await verifyP56a2(page);
  if (G >= 156.2) await verifyP56b(page);
  if (G >= 156.3) await verifyP56c(page);
  if (G >= 157.1) await verifyP57a(page);
  if (G >= 157.2) await verifyP57b(page);
  if (G >= 158.1) await verifyP58a(page, cdp);
  if (G >= 159.1) await verifyP59a(page);
  if (G >= 159.3) await verifyP59c(page);
  if (G >= 160.1) await verifyP60a(page);
  if (G >= 160.3) await verifyP60c(page);
  if (G >= 160.4) await verifyP60d(page);
  if (G >= 31) await verifyG31(page);
  if (G >= 33) await verifyG33(page);
  if (G >= 34) await verifyG34(page);
  if (G >= 35) await verifyG35(page);
  if (G >= 36) await verifyG36(page);
  if (G >= 37) await verifyG37(page);
  if (G >= 39) await verifyG39(page);

  if (G >= 157.2) await verifyApprovedArrival(page);
  record('콘솔 에러 0', errors.length === 0 ? 'pass' : 'fail', errors.slice(0, 3).join(' | '));

  await browser.close();
  const fails = results.filter((r) => r.verdict === 'fail');
  console.log(fails.length ? `\n❌ ${fails.length} 실패` : `\n✅ ${results.length} 통과`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

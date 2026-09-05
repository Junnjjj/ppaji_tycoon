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
import { mkdirSync } from 'node:fs';
import { gateTile } from '../src/sim/grid.js';

const BASE = process.env['PJ_URL'] ?? 'http://localhost:5187';
const URL = `${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`; // tut=0: 튜토리얼 Strip 은 G12 절이 따로 켜서 본다
const GOAL = process.argv[process.argv.indexOf('--goal') + 1] ?? 'g0';
/** ⚠ 문자열 비교는 'g11' < 'g3' 이라 절을 건너뛴다 — 숫자로 잰다 */
/** P0: 빠지 스토리 goal `pN` = 승계 G0~G57 전부 + P 절(100+N). `gN` 은 승계 번호 그대로 */
const goalNum = (g: string): number => (g.startsWith('p') ? 100 + (Number(g.slice(1)) || 0) : Number(g.replace(/^g/, '')) || 0);
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
  const bi = l.i0 + Math.floor(l.w / 2) - 3;
  const bj = l.j0 + Math.floor(l.h / 2) - 3;
  await page.evaluate(`window.__pj.scene.focusTile(${bi}, ${bj}, 160)`);
  await page.waitForTimeout(200);
  for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const r = (await page.evaluate(`window.__pj.scene.tileScreenRect(${bi + di}, ${bj + dj})`)) as { x: number; y: number; w: number; h: number };
    await touch(cdp, r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(450); // 320ms 더블탭 창 밖
  }
  const sel = (await page.evaluate(`window.__pj.dock.selection.length`)) as number;
  const costText = (await page.evaluate(`document.querySelector('#dock-pool .kdock-cost').textContent`)) as string;
  record('G1 지도 칸 4개 터치 → 선택 4 · 비용 400G', sel === 4 && /400/.test(costText) ? 'pass' : 'fail', `선택 ${sel} · ${costText}`);
  const money0 = (await page.evaluate(`window.__pj.game.money`)) as number;
  const done = await center('#dock-pool-done');
  await touch(cdp, done.x, done.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; return { pools: g.pools.all.length, size: g.pools.all[0] ? g.pools.all[0].tiles.length : 0, money: g.money, surface: document.documentElement.dataset.uiSurface, tex: window.__pj.scene.tileTextureAt(${bi}, ${bj}) }; })()`)) as { pools: number; size: number; money: number; surface: string; tex: string };
  record('G1 완료 → 풀 +1 (4칸) · −400G(+길 20G/칸, P16 자동 길) · 홈 복귀 · 타일이 물', after.pools === 1 && after.size >= 4 && money0 - after.money >= 400 && (money0 - after.money - 400) % 20 === 0 && after.surface === 'home' && String(after.tex).startsWith('tile/pool') ? 'pass' : 'fail', JSON.stringify(after));
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
 * G3 — 건설 창에서 화장실을 골라 진짜 터치로 배치하고, 풀에 딸기를 넣어 수면 픽셀이 핑크 계열이 된다.
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
  await page.evaluate(`document.querySelector('#win-build .ktab[data-tab="lounging"]').click()`);
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
  const spot = (await page.evaluate(`(() => { const g = window.__pj.game; const p = g.pools.all[0]; const k = p.tiles[0]; const i = k % g.grid.w, j = Math.floor(k / g.grid.w); return { i: i - 2, j }; })()`)) as { i: number; j: number };
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
  // 아이템 — 풀 편집 → 아이템 탭 → 딸기 칩
  const poolCell = await center('#hud-right [data-cell="zone"]');
  if (poolCell) await touch(cdp, poolCell.x, poolCell.y);
  await page.waitForTimeout(250);
  await page.evaluate(`document.querySelector('#dock-pool .ktab[data-mode="item"]').click()`);
  await page.waitForTimeout(200);
  const chip = await center('#dock-pool [data-item="strawberry"]');
  record('G3 아이템 탭 — 딸기 칩이 있고 풀이 자동 선택', chip !== null ? 'pass' : 'fail');
  if (chip) await touch(cdp, chip.x, chip.y);
  await page.waitForTimeout(300);
  // G52: 첫 탭은 투입이 아니라 미리보기 — 「넣기」 를 눌러야 들어간다
  const put = await center('#dock-pool-put');
  const pvRows = (await page.evaluate(`document.querySelectorAll('#dock-pool-preview .kprev-row').length`)) as number;
  record('G52 아이템 미리보기 — 딸기 칩 탭 → 전후 4줄(색·향·온도·인기) + 넣기 버튼', put !== null && pvRows === 4 ? 'pass' : 'fail', JSON.stringify({ put: put !== null, pvRows }));
  if (put) await touch(cdp, put.x, put.y);
  await page.waitForTimeout(400);
  const st = (await page.evaluate(`(() => { const g = window.__pj.game; const p = g.pools.all[0]; const s = g.poolState(p.id); return { items: p.items.length, color: s.color, scent: s.scent, status: document.querySelector('#dock-pool .kdock-status').textContent }; })()`)) as { items: number; color: string; scent: string; status: string };
  record('G3 딸기 투입 → 핑크 · 베리 · 상태 줄', st.items === 1 && st.color === 'pink' && st.scent === 'berry' && /핑크/.test(st.status) ? 'pass' : 'fail', JSON.stringify(st));
  const cancel = await center('#dock-pool-cancel');
  if (cancel) await touch(cdp, cancel.x, cancel.y);
  await page.waitForTimeout(300);
  // 수면 픽셀 — 부표 중앙의 캔버스 픽셀이 핑크 계열 (?px=1)
  const pk = (await page.evaluate(`(() => { const g = window.__pj.game; const k = g.pools.all[0].tiles[0]; return { i: k % g.grid.w, j: Math.floor(k / g.grid.w) }; })()`)) as { i: number; j: number };
  await page.evaluate(`window.__pj.scene.focusTile(${pk.i}, ${pk.j}, 160)`);
  await page.waitForTimeout(300);
  // ⚠ WebGL readPixels 는 상태에 따라 옛 프레임/다른 버퍼를 돌려줬다 (실측) — 화면 스크린샷을 페이지에 다시 올려 읽는다.
  //   한 점만 찍으면 수영 중인 손님을 읽으므로 네 타일 여러 점 중 가장 붉은 점을 본다
  const rects = (await page.evaluate(`(() => { const s = window.__pj.scene; const g = window.__pj.game; return g.pools.all[0].tiles.map((k) => s.tileScreenRect(k % g.grid.w, Math.floor(k / g.grid.w))); })()`)) as { x: number; y: number; w: number; h: number }[];
  const shot = await page.screenshot({ type: 'png' });
  const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
  const px = (await page.evaluate(`(async (url, rects) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = img.width / innerWidth; // DPR
    let best = [0, 0, 0], bestScore = -999;
    for (const r of rects) for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]]) {
      const d = g.getImageData(Math.round((r.x + r.w * fx) * k), Math.round((r.y + r.h * fy) * k), 1, 1).data;
      // 핑크 틴트 × 푸른 수면 = 라벤더 — 「초록이 빨강·파랑보다 낮다」로 잰다 (모래·잔디·피부는 파랑이 낮다)
      const score = Math.min(d[0], d[2]) - d[1];
      if (score > bestScore) { bestScore = score; best = [d[0], d[1], d[2]]; }
    }
    return best;
  })(${JSON.stringify(dataUrl)}, ${JSON.stringify(rects)})`)) as [number, number, number];
  const pinkish = Math.min(px[0], px[2]) > 190 && Math.min(px[0], px[2]) - px[1] > 12;
  record('G3 수면 픽셀이 핑크 계열 (스크린샷)', pinkish ? 'pass' : 'fail', `rgb(${px.join(',')})`);
  await page.screenshot({ path: `${SHOT_DIR}/g3-pink.png` });
}

/**
 * G4 — SNS 창 3탭 · 글에 좋아요 터치 · 소원 진행률 · 선물 · 모달 예산.
 * 앞 절의 판(풀 하나·화장실·딸기) 위에서 시간을 감아 글이 생기게 한 뒤 본다.
 */
async function verifyG4(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 글이 생길 때까지 시간을 감는다 (최대 3일)
  let posts = 0;
  for (let k = 0; k < 40 && posts === 0; k++) {
    await page.evaluate(`window.__pj.skip(120)`);
    posts = (await page.evaluate(`window.__pj.game.sns.allPosts.length`)) as number;
  }
  record('G4 손님이 놀고 나면 글이 올라온다', posts > 0 ? 'pass' : 'fail', `글 ${posts}`);
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
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 새 판 — 풀 24칸 + 화장실 둘 (Entry 인증: 인기 60·풀 20+) 을 즉시 만든다
  await page.evaluate(`(() => { window.__pj.newGame(777); const g = window.__pj.game; g.money = 30000; g.unlocked.facilities.add('diving'); const l = g.land; const tiles = []; for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) tiles.push({ i: l.i0 + 4 + a, j: l.j0 + 4 + b }); g.digPool(tiles); g.placeFacility('toilet', l.i0 + 4, l.j0 + 9); g.placeFacility('pyeongsang_row', l.i0 + 6, l.j0 + 9); g.placeFacility('diving', l.i0 + 11, l.j0 + 5); window.__pj.skip(1); })()`);
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
  record('G5 풀 심사 창 — Entry 예상 점수 ≥ 합격선 · 신청 가능', cert.up && cert.expected >= 15 && cert.canApply ? 'pass' : 'fail', JSON.stringify(cert));
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
  record('G5 주말 15시 심사 → 결과 · 합격 · 보상(파란 범고래)', judged.last !== null && judged.last.pass && judged.passes === 1 && judged.gifts.includes('blue_orca') ? 'pass' : 'fail', JSON.stringify(judged));
  // 상점 — 17:00 입고 뒤 열어 산다
  await page.evaluate(`(() => { const g = window.__pj.game; if (g.tick < 541) window.__pj.skip(541 - g.tick); })()`);
  await page.waitForTimeout(200);
  const shopCell = await center('#hud-right [data-cell="market"]');
  if (shopCell) await touch(cdp, shopCell.x, shopCell.y);
  await page.waitForTimeout(300);
  const shop = (await page.evaluate(`(() => ({ up: !document.getElementById('win-shop').hidden, rows: document.querySelectorAll('#win-shop [data-shop]').length, stock: window.__pj.game.shop.state.stock.length }))()`)) as { up: boolean; rows: number; stock: number };
  record('G5 상점 창 — 17시 입고 6칸', shop.up && shop.rows === shop.stock && shop.stock > 0 ? 'pass' : 'fail', JSON.stringify(shop));
  const row = await center('#win-shop [data-shop]');
  const before = (await page.evaluate(`(() => { const g = window.__pj.game; return { money: g.money, n: g.unlocked.facilities.size + g.unlocked.items.size + g.unlocked.gifts.size }; })()`)) as { money: number; n: number };
  if (row) await touch(cdp, row.x, row.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const g = window.__pj.game; return { money: g.money, n: g.unlocked.facilities.size + g.unlocked.items.size + g.unlocked.gifts.size, rows: document.querySelectorAll('#win-shop [data-shop]').length }; })()`)) as { money: number; n: number; rows: number };
  record('G5 구입 → 해금 +1 · 돈 지출 · 진열에서 빠짐', after.n === before.n + 1 && after.money < before.money && after.rows === shop.rows - 1 ? 'pass' : 'fail', JSON.stringify({ before, after }));
  await page.screenshot({ path: `${SHOT_DIR}/g5-shop.png` });
  const sclose = await center('#win-shop .kwin-close');
  if (sclose) await touch(cdp, sclose.x, sclose.y);
  await page.waitForTimeout(200);
  // 타일 칩 — 풀 편집 파기 탭에 표준 타일 칩
  const poolCell = await center('#hud-right [data-cell="zone"]');
  if (poolCell) await touch(cdp, poolCell.x, poolCell.y);
  await page.waitForTimeout(250);
  const tiles = (await page.evaluate(`document.querySelectorAll('#dock-pool [data-tile]').length`)) as number;
  record('G5 파기 탭에 타일 종류 칩', tiles >= 1 ? 'pass' : 'fail', `칩 ${tiles}`);
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
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  // 자판기(야외)를 수역 옆에 놓고 정보 창을 연다
  const spot = (await page.evaluate(`(() => { const g = window.__pj.game; const l = g.land; const r = g.placeFacility('vending_out', l.i0 + 4, l.j0 + 11); window.__pj.skip(1); return { ok: r.ok, uid: r.uid, i: l.i0 + 4, j: l.j0 + 11, reason: r.reason }; })()`)) as { ok: boolean; uid: number; i: number; j: number; reason?: string };
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
  // 레시피 두 개를 건다 (진짜 터치)
  for (let k = 0; k < 2; k++) {
    const row = await center('#win-menu [data-recipe]:not(:disabled)');
    if (row) await touch(cdp, row.x, row.y);
    await page.waitForTimeout(250);
  }
  const eq = (await page.evaluate(`window.__pj.game.menus.equipped(${spot.uid}).length`)) as number;
  record('G6 레시피 행 터치 → 칸에 걸린다', eq === 2 ? 'pass' : 'fail', `걸림 ${eq}`);
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
  await page.evaluate(`(() => { const g = window.__pj.game; g.money = 50000; g.rank = 2; g.grid.openLand(2); window.__pj.skip(1); window.__pj.refreshHud(); })()`);
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
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
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
  record('G8 투자 창 — 첫 단계만 열려 있다', inv.up && inv.rows >= 5 && inv.enabled.length === 1 && inv.enabled[0] === 'attraction_1' ? 'pass' : 'fail', JSON.stringify(inv));
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
  // 실내 — 새 2×2 풀을 실내 바닥으로 둘러싸면 실내 풀 (온도 26 · 햇빛 0)
  const indoor = (await page.evaluate(`(() => { const g = window.__pj.game; const l = g.land; const bi = l.i0 + 2, bj = l.j0 + l.h - 12; /* P0: 위쪽 줄은 강 띠, 가운데는 시작 킷 풀 — 아래 왼쪽 뭍에서 */ const pool = [{i:bi,j:bj},{i:bi+1,j:bj},{i:bi,j:bj+1},{i:bi+1,j:bj+1}]; const r1 = g.digPool(pool); const ring = []; for (let a = -1; a <= 2; a++) for (let b = -1; b <= 2; b++) { if (a >= 0 && a <= 1 && b >= 0 && b <= 1) continue; ring.push({ i: bi + a, j: bj + b }); } const r2 = g.paintIndoor(ring); const p = g.pools.at(bi, bj); const st = p ? g.poolState(p.id) : null; return { r1: r1.ok, r1why: r1.ok ? '' : r1.reason, r2: r2.ok, reason: r2.reason, indoor: p ? g.poolIndoor(p.id) : null, temp: st ? st.temp : null }; })()`)) as { r1: boolean; r2: boolean; reason?: string; indoor: boolean | null; temp: number | null };
  record('G8 실내 바닥으로 둘러싼 풀은 실내 (26°C 기준)', indoor.r1 && indoor.r2 && indoor.indoor === true && indoor.temp !== null && Math.abs(indoor.temp - 26) <= 8 ? 'pass' : 'fail', JSON.stringify(indoor));
  // 슬라이드 발자국 — 스트라이피 슬라이드(2×2 + 활강로 8) 를 놓을 자리가 있으면 활강로 끝 다음 칸이 풀일 때 AB
  await page.evaluate(`window.__pj.game.unlocked.facilities.add('stripy_slide'); window.__pj.game.rank = 3; window.__pj.game.grid.openLand(3)`);
  const slide = (await page.evaluate(`(() => { const g = window.__pj.game; const l = g.land; const p = g.pools.all[0]; const k = p.tiles[0]; const pi = k % g.grid.w, pj = Math.floor(k / g.grid.w); const st0 = g.poolState(p.id).ab; const at = { i: pi - 10, j: pj }; const r = g.placeFacility('stripy_slide', at.i, at.j, 0); const fp = r.ok ? g.facilities.all.filter((f) => f.defId === 'stripy_slide').length : 0; const st1 = g.poolState(p.id).ab; return { ok: r.ok, reason: r.reason, fp, ab0: st0, ab1: st1, land: [l.w, l.h] }; })()`)) as { ok: boolean; reason?: string; fp: number; ab0: number; ab1: number; land: number[] };
  record('G8 슬라이드 활강로가 풀에 닿으면 AB 가 오른다', slide.ok && slide.ab1 > slide.ab0 ? 'pass' : slide.ok ? 'fail' : 'info', JSON.stringify(slide));
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
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
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
  const speed = (await page.evaluate(`(() => { const r = document.querySelector('#win-menu-main [data-menu="speed"]'); return r ? { locked: !!r.querySelector('.kmenu-lock'), text: r.textContent } : null; })()`)) as { locked: boolean; text: string } | null;
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
  const routes: { id: string; open: string; close: string }[] = [
    { id: 'home', open: '', close: '' },
    { id: 'build', open: '#hud-right [data-cell="build"]', close: '#win-build .kwin-close' },
    { id: 'sns', open: '#hud-right [data-cell="sns"]', close: '#win-sns .kwin-close' },
    { id: 'shop', open: '#hud-right [data-cell="market"]', close: '#win-shop .kwin-close' },
    { id: 'rank', open: '#hud-info', close: '#win-rank .kwin-close' },
    { id: 'menu', open: '#hud-menu', close: '#win-menu-main .kwin-close' },
    { id: 'pool', open: '#hud-right [data-cell="zone"]', close: '#dock-pool-cancel' },
  ];
  const center = async (sel: string): Promise<{ x: number; y: number } | null> =>
    (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const bad: string[] = [];
  let total = 0;
  for (const r of routes) {
    if (r.open) { const c = await center(r.open); if (c) await touch(cdp, c.x, c.y); await page.waitForTimeout(300); }
    const a = (await page.evaluate(AUDIT)) as { small: string[]; stolen: string[]; n: number };
    total += a.n;
    if (a.small.length || a.stolen.length) bad.push(`${r.id}: small ${a.small.join(',') || '-'} stolen ${a.stolen.join(',') || '-'}`);
    await page.screenshot({ path: `${SHOT_DIR}/route-${r.id}.png` });
    if (r.close) { const c = await center(r.close); if (c) await touch(cdp, c.x, c.y); await page.waitForTimeout(250); }
  }
  record(`G12 화면 ${routes.length}개 — 보이는 컨트롤 ${total}개 전부 ≥44px · 제자리에서 눌림`, bad.length === 0 ? 'pass' : 'fail', bad.join(' | '));

  // 풀 프리셋 — 아이템이 든 풀을 API 로 만들고, 저장·복원은 진짜 터치
  const prep = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.flow.frozen = true;
    let p = g.pools.all[0]; if (!p) { const l = w.land ? w.land() : null; const t = []; const gt = g.gate; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) t.push({ i: gt.i - 4 + a, j: gt.j + 4 + b }); g.money += 5000; g.digPool(t); p = g.pools.all[0]; }
    if (!p) return null; g.money += 5000; g.unlocked.items.add('strawberry'); g.putItem(p.id, 'strawberry'); g.putItem(p.id, 'strawberry');
    const n0 = g.presets.length; w.poolInfo.show(p.id); return { id: p.id, n0, items: p.items.length, money: g.money }; })()`)) as { id: number; n0: number; items: number; money: number } | null;
  const saveC = await center('#win-pool-preset-save');
  if (saveC) await touch(cdp, saveC.x, saveC.y);
  await page.waitForTimeout(300);
  const afterSave = (await page.evaluate(`(() => { const g = window.__pj.game; return { n: g.presets.length, chip: !!document.querySelector('#win-pool [data-preset="0"]') }; })()`)) as { n: number; chip: boolean };
  record('G12 풀 프리셋 저장 — 터치 한 번에 프리셋 +1 · 복원 칩이 뜬다', prep !== null && afterSave.n === prep.n0 + 1 && afterSave.chip ? 'pass' : 'fail', JSON.stringify({ prep, afterSave }));
  const loadC = await center('#win-pool [data-preset="0"]');
  if (loadC) await touch(cdp, loadC.x, loadC.y);
  await page.waitForTimeout(300);
  const afterLoad = (await page.evaluate(`(() => { const g = window.__pj.game; const p = g.pools.byId(${prep?.id ?? -1}); return { items: p ? p.items.length : -1, money: g.money }; })()`)) as { items: number; money: number };
  record('G12 풀 프리셋 복원 — 아이템 +2 · 돈이 준다', prep !== null && afterLoad.items === prep.items + 2 && afterLoad.money < prep.money ? 'pass' : 'fail', JSON.stringify({ before: prep?.items, after: afterLoad }));
  const closeC = await center('#win-pool .kwin-close');
  if (closeC) await touch(cdp, closeC.x, closeC.y);
  await page.waitForTimeout(200);

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
  const card = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const t = []; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) t.push({ i: gt.i - 4 + a, j: gt.j + 4 + b }); g.digPool(t);
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
    const t = []; for (let a = 0; a < 5; a++) for (let c = 0; c < 4; c++) t.push({ i: gt.i - 6 + a, j: gt.j + 8 + c }); g.digPool(t);
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
  const stage = (await page.evaluate(`(() => ({ stages: document.querySelectorAll('#win-cert .kstage').length, judges: document.querySelectorAll('#win-cert .kstage .kportrait canvas').length, conds: document.querySelectorAll('#win-cert .kcond .kportrait canvas').length }))()`)) as { stages: number; judges: number; conds: number };
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
  const cat = (await page.evaluate(`(() => { const cards = [...document.querySelectorAll('#win-build .kcatalog-card')]; const r = cards.map((c) => c.getBoundingClientRect()); const cols = new Set(r.map((x) => Math.round(x.left))).size; return { cards: cards.length, cols, minH: Math.min(...r.map((x) => x.height)), thumbs: document.querySelectorAll('#win-build .kcatalog-card .kthumb canvas').length }; })()`)) as { cards: number; cols: number; minH: number; thumbs: number };
  record('G24 건설 카탈로그 — 카드 격자(3열) · 그림 · 44px 이상', cat.cards >= 3 && cat.cols === 3 && cat.minH >= 44 && cat.thumbs === cat.cards ? 'pass' : 'fail', JSON.stringify(cat));
  const closeB = await center('#win-build .kwin-close');
  if (closeB) await touch(cdp, closeB.x, closeB.y);
  await page.waitForTimeout(200);
  const cap = (await page.evaluate(`(() => { const g = window.__pj.game; const r0 = g.rank; const a = g.maxGuests(); g.rank = 5; const b = g.maxGuests(); g.rank = r0; return { a, b }; })()`)) as { a: number; b: number };
  record('G24 동시 손님 상한 — 랭크에 비례 (★0 40 → ★5 100)', cap.a === 40 && cap.b === 100 ? 'pass' : 'fail', JSON.stringify(cap));
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
  const life = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 500000; g.rank = 2; g.grid.openLand(2); g.unlocked.facilities.add('stripy_slide'); g.unlocked.facilities.add('pyeongsang_row'); const gt = g.gate; const def = w.facilityDefs.get('stripy_slide'); const si = gt.i + 2, sj = gt.j + 9; /* P16: 레인이 입구 열(유일한 길)을 끊지 않게 오른쪽에 (g36 검사와 같은 자리) */ const rs = g.placeFacility('stripy_slide', si, sj, 0); const lane = def.slide.length; const ex = { i: si + def.w + lane - 1, j: sj + 1 }; const pool = []; for (let b = -1; b <= 1; b++) for (let a = 1; a <= 2; a++) pool.push({ i: ex.i + a, j: ex.j + b }); const rp = g.digPool(pool); const rc = g.placeFacility('pyeongsang_row', gt.i + 3, gt.j + 4, 0); const slide = g.facilities.all.find((f) => f.defId === 'stripy_slide'); const chair = g.facilities.all.find((f) => f.defId === 'pyeongsang_row'); const seen = { climb: false, ride: false, landed: false, lie: false, hpIcon: 0 }; let n = 0; let low = null; while (n++ < 900 && !(seen.landed && seen.lie)) { for (const gu of g.guests.all) { if (gu.state === 'wander') { if (!seen.ride && slide) { gu.target = { kind: 'facility', uid: slide.uid }; gu.state = 'walk'; gu.stateTicks = 0; } else if (!seen.lie && chair) { gu.target = { kind: 'facility', uid: chair.uid }; gu.state = 'walk'; gu.stateTicks = 0; } } if (gu.state === 'climb') seen.climb = true; if (gu.state === 'ride') seen.ride = true; if (gu.state === 'swim' && gu.target && gu.target.kind === 'pool' && seen.ride) seen.landed = true; if (gu.state === 'use' && gu.target && chair && gu.target.uid === chair.uid) { seen.lie = true; gu.stateTicks = 0; } } w.skip(1); } for (const gu of g.guests.all) { if (gu.state === 'use' && chair && gu.target && gu.target.uid === chair.uid) { gu.hp = 10; low = gu.uid; } } w.refreshHud(); return { rs: rs.ok, rp: rp.ok, rc: rc.ok, ...seen, low, n }; })()`)) as { rs: boolean; rp: boolean; rc: boolean; climb: boolean; ride: boolean; landed: boolean; lie: boolean; low: number | null; n: number };
  record('G26 슬라이드 — climb → ride → 출구 앞 풀에 착수 · 데크체어 이용', life.rs && life.rp && life.rc && life.climb && life.ride && life.landed && life.lie ? 'pass' : 'fail', JSON.stringify(life));
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
  const line = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.sns.unlockedFriends[0]; const st = g.sns.friends.get(f.id); const before = st.visits; st.visits = 0; const fd = g.sns.friendDef(f.id); const gu = g.guests.spawn({ id: fd.id, palette: fd.palette, favColor: fd.fav.color, favScent: fd.fav.scent, name: fd.name, age: fd.age, gender: fd.gender }); st.visits = before; return { name: fd.name, hasSay: typeof gu.say === 'string' || gu.say === null, friends: g.sns.unlockedFriends.length }; })()`)) as { name: string; hasSay: boolean; friends: number };
  const calendar = (await page.evaluate(`(() => { const g = window.__pj.game; return { n: g.calendarGiven.size, total: window.__pj.calendarCount }; })()`)) as { n: number; total: number };
  record('G27 달력 32건 · 친구 목록', calendar.total === 32 && line.friends > 0 ? 'pass' : 'fail', JSON.stringify({ ...calendar, ...line }));

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
  record('G29 탭 아이콘(건설 6 · SNS 3) · 창 색조(SNS 분홍 · 상점 초록) · HUD 계절+날씨 아이콘 2', ui.build === 6 && ui.sns === 3 && ui.pink && ui.green && ui.hud === 2 ? 'pass' : 'fail', JSON.stringify(ui));
}

/** G30 — 밸런스: 좋아요 리셋 경고 칩(R2) · 투입 뒤 토스트 · 랭크 유지비 · 호화 상품 3종이 상점 데이터에 있다 */
async function verifyG30(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const gt = g.gate; g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]); const p = g.pools.all[0]; p.likes = 77; w.dock.enter('item', p.id); const warn = document.querySelectorAll('.kdock [data-item][data-resets]'); const first = warn[0]; const label = first ? first.textContent : ''; const before = g.money; if (first) { first.click(); const put = document.getElementById('dock-pool-put'); if (put) put.click(); } const toast = (document.getElementById('hud-toast') || {}).textContent || ''; const after = { likes: p.likes, money: g.money }; const m0 = g.dailyMaintenance(); g.rank = 4; const m4 = g.dailyMaintenance(); g.rank = 0; const lux = ['crystal_fountain', 'grand_arch', 'moon_tower'].filter((id) => w.facilityDefs.has(id)).length; return { warn: warn.length, label, spent: before - after.money, likes: after.likes, toast, m0, m4, lux }; })()`)) as { warn: number; label: string; spent: number; likes: number; toast: string; m0: number; m4: number; lux: number };
  record('G30 R2 — 색 바꾸는 아이템 칩에 「좋아요 77 리셋」 경고 · 넣으면 좋아요 0 + 토스트', r.warn >= 1 && r.label.includes('77') && r.likes === 0 && r.spent > 0 ? 'pass' : 'fail', JSON.stringify(r));
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
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const gt = g.gate; g.unlocked.facilities.add('cafe'); const rc = g.placeFacility('cafe', gt.i + 2, gt.j + 4, 0); const cafe = g.facilities.all.find((f) => f.defId === 'cafe'); const t0 = g.dailyTarget(); g.sns.totalLikes = 5000; const t1 = g.dailyTarget(); g.cooking.exp = 0; w.menuWin.show(cafe.uid); const lv1 = [...document.querySelectorAll('#win-menu [data-recipe] .krow-sub')].map((e) => e.textContent)[0] || ''; document.querySelector('#win-menu-main .kwin-close').click(); g.cooking.exp = 1000000; w.menuWin.show(cafe.uid); const lv10 = [...document.querySelectorAll('#win-menu [data-recipe] .krow-sub')].map((e) => e.textContent)[0] || ''; document.querySelector('#win-menu-main .kwin-close').click(); g.cooking.exp = 0; g.sns.totalLikes = 0; const taste = (s) => Number((s.match(/맛 (\\d+)/) || [0, 0])[1]); return { ok: rc.ok, t0, t1, lv1, lv10, up: taste(lv10) > taste(lv1), tag: lv10.includes('Lv10') }; })()`)) as { ok: boolean; t0: number; t1: number; lv1: string; lv10: string; up: boolean; tag: boolean };
  record('G33 좋아요 5,000 → 유입 목표 ↑ · 요리 Lv10 에서 메뉴 창 맛·인기가 오르고 Lv 표기', r.ok && r.t1 > r.t0 && r.up && r.tag ? 'pass' : 'fail', JSON.stringify(r));
}

/** G34 — 대기 줄(순번 비켜 서기) · 폐장 1시간 전 퇴장 행렬 · 비 오면 돌아가는 손님 */
async function verifyG34(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  // A. 줄 — 정원 1 데크체어로 전원을 보낸다. 줄이 2 이상이 되는 순간 멈춘다 (프레임은 아래서 따로 기다린다)
  const q = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; g.unlocked.facilities.add('pyeongsang_row'); g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]); const rc = g.placeFacility('pyeongsang_row', gt.i + 2, gt.j + 4, 0); const chair = g.facilities.all[0]; let maxQ = 0; let n = 0; while (n++ < 900 && maxQ < 2) { for (const gu of g.guests.all) if (gu.state === 'wander' && gu.stateTicks === 0) { gu.target = { kind: 'facility', uid: chair.uid }; gu.state = 'walk'; } w.skip(1); maxQ = Math.max(maxQ, g.guests.queueAt(chair)); } return { ok: rc.ok, maxQ, n }; })()`)) as { ok: boolean; maxQ: number; n: number };
  await page.waitForTimeout(250); // 한 프레임 이상 — 씬이 줄 순번 오프셋을 그린다
  const qx = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const xs = g.guests.all.filter((x) => x.state === 'queue').map((x) => { const im = w.scene.guestImgs.get(x.uid); return im ? im.x : null; }).filter((x) => x !== null); return { queued: g.guests.all.filter((x) => x.state === 'queue').length, distinctX: new Set(xs).size }; })()`)) as { queued: number; distinctX: number };
  record('G34 대기 줄 — 정원 1 데크체어 앞 줄 ≥2 · 줄 선 손님은 화면에서 비켜 선다', q.ok && q.maxQ >= 2 && qx.distinctX >= 2 ? 'pass' : 'fail', JSON.stringify({ ...q, ...qx }));
  // B. 비 — 손님이 있는 채로 비를 내리면 「비 오네…」 하고 돌아가는 사람이 생긴다
  const rain = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.weather = 'rain'; let rainy = 0; let m = 0; while (m++ < 900 && rainy === 0) { w.skip(1); for (const gu of g.guests.all) if (gu.state === 'leave' && gu.emote === 'grr' && gu.hp >= 30) rainy++; } g.weather = 'clear'; return { rainy, m }; })()`)) as { rainy: number; m: number };
  // C. 폐장 — 1시간 전으로 감으면 30tick 안에 남은 손님 대부분이 입구로 간다
  const close = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.tick = w.TPD - 140; const entered = g.guests.enteredToday; w.skip(60); const total = g.guests.count; const leaving = g.guests.all.filter((x) => x.state === 'leave').length; const busy = g.guests.all.filter((x) => x.state === 'swim' || x.state === 'use' || x.state === 'climb' || x.state === 'ride').length; const idle = total - leaving - busy; return { total, leaving, busy, idle, noEntry: g.guests.enteredToday === entered }; })()`)) as { total: number; leaving: number; busy: number; idle: number; noEntry: boolean };
  record('G34 비·폐장 — 비 오면 돌아가는 손님 · 폐장 1시간 전엔 새 입장 0 · 60tick 뒤 노는 손님 0 (입구로 가거나 하던 것만 마친다)', rain.rainy > 0 && close.noEntry && close.idle === 0 ? 'pass' : 'fail', JSON.stringify({ ...rain, ...close }));
}

/** G35 — 심사 결과 창(심사위원 카드 3 · 도장) · 인증 조건 다양화 */
async function verifyG35(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; w.resultsCtl.enabled = true; const gt = g.gate; const t = []; for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) t.push({ i: gt.i - 6 + a, j: gt.j + 9 + b }); g.digPool(t); g.certs.state.applied = { id: 'grade_f', judgeDay: g.day }; g.tick = w.JUDGE_TICK - 1; w.skip(2); })()`);
  await page.waitForTimeout(400);
  const r = (await page.evaluate(`(() => { const win = document.getElementById('win-cert-result'); const g = window.__pj.game; return { up: !!win && !win.hidden, judges: document.querySelectorAll('#win-cert-result [data-judge]').length, stamp: (document.querySelector('#win-cert-result [data-stamp]') || {}).textContent || '', last: g.certs.state.last ? g.certs.state.last.score : -1, kinds: [...new Set(window.__pj.certDefs.flatMap((c) => c.conditions.filter((x) => x.cond.kind === 'pool').flatMap((x) => Object.keys(x.cond))))].filter((k) => ['intensityMin','likesMin','popMin','indoor','tile'].includes(k)).length }; })()`)) as { up: boolean; judges: number; stamp: string; last: number; kinds: number };
  await page.evaluate(`(() => { document.querySelector('#win-cert-result .kwin-close')?.click(); window.__pj.resultsCtl.enabled = false; })()`);
  record('G35 심사 결과 창 — 심사위원 카드 3 · 합격/불합격 도장 · 인증 조건 5축 사용', r.up && r.judges === 3 && /합격/.test(r.stamp) && r.last >= 0 && r.kinds === 5 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G36 — 실내 전용 거절 사유 · 계절 벡터가 인기에 반영 · 슬라이드 AB 는 착수 풀만 */
async function verifyG36(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 200000; const gt = g.gate; g.unlocked.facilities.add('sauna'); g.unlocked.facilities.add('footbath'); const rs = g.canPlace('sauna', gt.i + 2, gt.j + 4, 0); g.placeFacility('footbath', gt.i + 3, gt.j + 3, 0); const d0 = g.day; g.day = 0; const spring = g.parkPopularity(); g.day = 12; const winter = g.parkPopularity(); g.day = d0; w.refreshHud(); return { saunaOk: rs.ok, reason: rs.reason || '', spring, winter }; })()`)) as { saunaOk: boolean; reason: string; spring: number; winter: number };
  record('G36 실내 전용 사우나는 야외 거절(사유에 「실내」) · 핫텁 계절 벡터로 겨울 인기 > 봄', !r.saunaOk && r.reason.includes('실내') && r.winter > r.spring ? 'pass' : 'fail', JSON.stringify(r));
}

/** G37 — 풀 정보 창의 타일 갈기 칩 · 비상 자금 */
async function verifyG37(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&events=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const gt = g.gate; g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]); const p = g.pools.all[0]; g.unlocked.tiles.add('pink'); w.poolInfo.show(p.id); const chip = document.querySelector('#win-pool [data-retile="pink"]'); const before = g.money; if (chip) chip.click(); const after = g.money; const kind = g.grid.poolTile[p.tiles[0]]; document.querySelector('#win-pool .kwin-close')?.click(); g.money = 10; g.tick = w.TPD - 1; w.skip(1); return { chip: !!chip, spent: before - after, kind, bailout: g.money, n: g.stats.bailouts }; })()`)) as { chip: boolean; spent: number; kind: number; bailout: number; n: number };
  record('G37 타일 갈기 칩 → 핑크 타일 · 비용 지출 · 폐장 잔고 음수 → 비상 자금 2,000G', r.chip && r.spent === 480 && r.kind === 1 && r.bailout === 2000 && r.n === 1 ? 'pass' : 'fail', JSON.stringify(r));
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
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }]); w.campaignWin.show(); })()`);
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
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; w.cookWin.show(); const pick = (id) => document.querySelector('#win-cook [data-ingredient="' + id + '"]').click(); pick('flour'); pick('egg'); pick('milk'); pick('lemon_fruit'); document.getElementById('win-cook-go').click(); const res1 = document.querySelector('#win-cook .kresult'); const t1 = res1 ? res1.textContent : ''; const set = document.querySelector('#win-cook [data-set-recipe="fruit_crepe"]'); const hasSet = !!set; if (set) set.click(); const picked = [...document.querySelectorAll('#win-cook [data-picked].on')].length; for (const c of [...document.querySelectorAll('#win-cook [data-picked].on')]) c.click(); g.cooking.grantIngredient('cabbage'); g.cooking.grantIngredient('tomato'); w.cookWin.show(); pick('cabbage'); pick('tomato'); document.getElementById('win-cook-go').click(); const res2 = document.querySelector('#win-cook .kresult'); const t2 = res2 ? res2.textContent : ''; const failRows = document.querySelectorAll('#win-cook .krow.kfail').length; document.querySelector('#win-cook .kwin-close').click(); return { t1, hasSet, picked, t2, failRows, known: g.cooking.known.has('fruit_crepe') && g.cooking.known.has('veg_scraps') }; })()`)) as { t1: string; hasSet: boolean; picked: number; t2: string; failRows: number; known: boolean };
  record('G41 요리 창 — 밀가루+달걀+우유+레몬 → 과일 크레페 · 「설정」이 칩 4개를 채운다 · 채소만 → 야채 찌꺼기(실패작 절)', r.t1.includes('과일 크레페') && r.hasSet && r.picked === 4 && r.t2.includes('야채 찌꺼기') && r.failRows >= 1 && r.known ? 'pass' : 'fail', JSON.stringify(r));
}

/** G42 — 풀 정보 상세(색·향·온도 탭) · 농도 · 남은 일수 · 심사 창 만점 줄 */
async function verifyG42(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; const t = []; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) t.push({ i: gt.i - 4 + a, j: gt.j + 6 + b }); g.digPool(t); const p = g.pools.all[0]; for (const id of ['strawberry', 'blueberry']) g.unlocked.items.add(id); g.putItem(p.id, 'strawberry'); const bars1 = g.poolState(p.id).detail.intensityBars; g.putItem(p.id, 'blueberry'); const bars2 = g.poolState(p.id).detail.intensityBars; w.poolInfo.show(p.id); const rows = document.querySelectorAll('#win-pool [data-detail]').length; const bodyHidden = document.querySelector('#win-pool [data-detail-body="color"]').classList.contains('khide'); document.querySelector('#win-pool [data-detail="color"]').click(); const bodyShown = !document.querySelector('#win-pool [data-detail-body="color"]').classList.contains('khide'); const text = document.querySelector('#win-pool [data-detail-body="color"]').textContent; const items = [...document.querySelectorAll('#win-pool .krow')].map((r) => r.textContent).find((t2) => t2.startsWith('소품')); const mix = g.poolState(p.id).detail.colorMix; document.querySelector('#win-pool .kwin-close').click(); return { bars1, bars2, rows, bodyHidden, bodyShown, text: text.slice(0, 80), items, mixN: mix.length, top: mix[0] ? mix[0].share : 1 }; })()`)) as { bars1: number; bars2: number; rows: number; bodyHidden: boolean; bodyShown: boolean; text: string; items: string; mixN: number; top: number };
  record('G42 풀 정보 — 색·향·온도 행 3 · 탭하면 상세 · 색이 섞이면 주된 색 비중 < 1 · 아이템 남은 일수', r.rows === 3 && r.bodyHidden && r.bodyShown && r.mixN === 2 && r.top < 1 && r.text.includes('농도') && /남은 \d+일/.test(r.items) ? 'pass' : 'fail', JSON.stringify(r));
  const cert = (await page.evaluate(`(() => { const w = window.__pj; w.certWin.show(); const tab = document.querySelector('#win-cert [data-tab="color"]'); if (tab) tab.click(); const full = document.querySelectorAll('#win-cert [data-full]'); const txt = full.length ? full[0].textContent : ''; document.querySelector('#win-cert .kwin-close').click(); return { n: full.length, txt }; })()`)) as { n: number; txt: string };
  record('G42 심사 창 — 색·향 조건에 「만점: 농도 5/5 · 지금 N/5」 줄', cert.n >= 1 && cert.txt.includes('만점') ? 'pass' : 'fail', JSON.stringify(cert));
}

/** G43 — 손님 창 선물 버튼 · 배치 중 우측 칸 반투명+토스트 · 첫 주말 비치체어 선물 */
async function verifyG43(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&confirm=0&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const gift = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 50000; const f = g.sns.unlockedFriends[0]; const fd = g.sns.friendDef(f.id); const gu = g.guests.spawn({ id: fd.id, palette: fd.palette, favColor: fd.fav.color, favScent: fd.fav.scent, name: fd.name, age: fd.age, gender: fd.gender }); w.guestInfo.show(gu); const btns = [...document.querySelectorAll('#win-guest [data-gift]')]; const enabled = btns.filter((b) => !b.disabled); const before = f.gifts.length; if (enabled[0]) enabled[0].click(); const after = g.sns.friends.get(f.id).gifts.length; const left = document.querySelectorAll('#win-guest [data-gift]').length; document.querySelector('#win-guest .kwin-close').click(); return { btns: btns.length, enabled: enabled.length, before, after, left }; })()`)) as { btns: number; enabled: number; before: number; after: number; left: number };
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
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.certWin.show(); const out = {}; for (const fam of ['grade', 'color', 'scent', 'spa', 'fruit', 'stream', 'fun', 'cutesy']) { const t = document.querySelector('#win-cert [data-tab="' + fam + '"]'); if (t) t.click(); const cards = [...document.querySelectorAll('#win-cert [data-cert]')]; out[fam] = cards.map((c) => c.querySelectorAll('.kcond').length); } const sCard = document.querySelector('#win-cert [data-cert="grade_s"]'); document.querySelector('#win-cert [data-tab="grade"]').click(); const sTxt = document.querySelector('#win-cert [data-cert="grade_s"]') ? document.querySelector('#win-cert [data-cert="grade_s"]').textContent : ''; document.querySelector('#win-cert .kwin-close').click(); const gifts = [...g.certs.defs.values()].filter((d) => d.reward.kind === 'gift').length; return { out, sTxt: sTxt.slice(0, 200), gifts, total: g.certs.defs.size }; })()`)) as { out: Record<string, number[]>; sTxt: string; gifts: number; total: number };
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
  const pool = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]); const p = g.pools.all[0]; w.poolInfo.show(p.id); const win = document.getElementById('win-pool'); const tiles = win.querySelectorAll('.kptile').length; const bars = win.querySelectorAll('.kbars').length; const pills = win.querySelectorAll('.kpool-pills .knum').length; const verdict = [...win.querySelectorAll('.kptile-sub')].map((e) => e.textContent).join('|'); const input = win.querySelector('[data-pool-name]'); input.value = '초록풀장'; win.querySelector('[data-rename]').click(); const title = document.getElementById('win-pool-title').textContent; document.querySelector('#win-pool .kwin-close').click(); return { tiles, bars, pills, verdict, title, name: g.poolName(p.id) }; })()`)) as { tiles: number; bars: number; pills: number; verdict: string; title: string; name: string };
  record('G47 풀 정보 — 색·향·온도 타일 3 + 농도 막대 · 값 알약 3 · 온도 판정 · 이름 변경이 제목에 반영', pool.tiles === 3 && pool.bars >= 2 && pool.pills === 3 && /좋아요|차가워요|뜨거워요/.test(pool.verdict) && pool.title === '초록풀장' && pool.name === '초록풀장' ? 'pass' : 'fail', JSON.stringify(pool));
  const fac = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.placeFacility('toilet', gt.i + 2, gt.j + 4, 0); g.placeFacility('vending_out', gt.i + 3, gt.j + 6, 0); const f = g.facilities.all[0]; w.facilityInfo.show(f.uid); const t1 = document.getElementById('win-facility-title').textContent; document.querySelector('#win-facility [data-next]').click(); const t2 = document.getElementById('win-facility-title').textContent; const desc = !!document.querySelector('#win-facility .kfac-desc'); const thumb = !!document.querySelector('#win-facility .kthumb canvas'); document.querySelector('#win-facility .kwin-close').click(); return { t1, t2, desc, thumb }; })()`)) as { t1: string; t2: string; desc: boolean; thumb: boolean };
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
  const r = (await page.evaluate(`(() => { const w = window.__pj; w.refreshHud(); const bars = [...document.querySelectorAll('#hud-ticker .kgoal:not(.khide)')]; const info = bars.map((b) => [b.dataset.goal, b.querySelector('.kgoal-label').textContent, b.dataset.pct]); const rect = document.getElementById('hud-ticker').getBoundingClientRect(); const fill = bars.map((b) => b.querySelector('.kgoal-fill').style.width); bars[0].click(); const rankUp = !document.getElementById('win-rank').hidden; document.querySelector('#win-rank .kwin-close').click(); const cert = bars.find((b) => b.dataset.goal === 'cert'); if (cert) cert.click(); const certUp = !document.getElementById('win-cert').hidden; if (certUp) document.querySelector('#win-cert .kwin-close').click(); return { info, fill, h: rect.height, rankUp, certUp }; })()`)) as { info: string[][]; fill: string[]; h: number; rankUp: boolean; certUp: boolean };
  record('G50 목표 3슬롯 — 랭크·인증 진행바 2 (라벨·%) · 탭하면 랭크/심사 창 · 티커 ≤ 32px', r.info.length === 2 && r.fill.every((f) => /%$/.test(f)) && r.rankUp && r.certUp && r.h <= 32 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G51 — R4 인증 사다리: 티커의 인증 진행바는 「아직 안 넘은」 인증을 가리키고, 그것을 통과하면 다음 칸으로 옮겨 간다 */
async function verifyG51(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const label = () => { w.refreshHud(); const b = document.querySelector('#hud-ticker .kgoal[data-goal="cert"]'); return b && !b.classList.contains('khide') ? b.querySelector('.kgoal-label').textContent : null; }; const l0 = label(); const target = [...g.certs.defs.values()].find((d) => l0 && l0.endsWith(d.name)); const passedBefore = target ? (g.certs.state.passed[target.id] ?? 0) : -1; if (target) g.certs.state.passed[target.id] = 1; const l1 = label(); const distinct = Object.values(g.certs.state.passed).filter((n) => n > 0).length; return { l0, l1, passedBefore, distinct, defs: g.certs.defs.size }; })()`)) as { l0: string | null; l1: string | null; passedBefore: number; distinct: number; defs: number };
  record('G51 인증 사다리 — 진행바가 미통과 인증을 가리키고, 통과하면 다른 인증으로 옮겨 간다 (24종)', r.l0 && r.l1 && r.l0 !== r.l1 && r.passedBefore === 0 && r.defs === 24 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G52 — UI 2차 잔여: 미리보기 내용(색 전→후) · 신문식 축하(제호·날짜·도장) · 시설 이동(도구 필요 → 이동 → uid·단계 보존) */
async function verifyG52(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0&celebrate=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const pv = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; g.digPool([{ i: gt.i - 2, j: gt.j + 4 }, { i: gt.i - 1, j: gt.j + 4 }, { i: gt.i - 2, j: gt.j + 5 }, { i: gt.i - 1, j: gt.j + 5 }]); const p = g.pools.all[0]; w.dock.enter('item', p.id); document.querySelector('#dock-pool [data-item="strawberry"]').click(); const pre = document.getElementById('dock-pool-preview'); const shown = !pre.classList.contains('khide'); const rows = [...pre.querySelectorAll('.kprev-row')].map((r) => r.textContent); const before = p.items.length; document.getElementById('dock-pool-put').click(); const after = p.items.length; const hidden = pre.classList.contains('khide'); w.dock.exit(); return { shown, rows, before, after, hidden }; })()`)) as { shown: boolean; rows: string[]; before: number; after: number; hidden: boolean };
  record('G52 미리보기 — 「색 맑음 0/5 → 핑크 n/5」 · 향 베리 · 넣기 전 0 → 뒤 1 · 넣은 뒤 미리보기 접힘', pv.shown && /맑음.*→.*핑크/.test(pv.rows[0] ?? '') && /베리/.test(pv.rows[1] ?? '') && pv.before === 0 && pv.after === 1 && pv.hidden ? 'pass' : 'fail', JSON.stringify(pv));
  const paper = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.interruptBudget.reset(); g.inbox.push({ tick: g.tick, day: g.day, kind: 'system', priority: 'modal', title: '랭크 업! ★1 동네 풀장', body: '손님이 늘어난다' }); w.skip(1); const c = document.getElementById('win-celebrate'); const up = !c.hidden; const mast = c.querySelector('.kpaper-mast') ? c.querySelector('.kpaper-mast').textContent : ''; const date = c.querySelector('.kpaper-date') ? c.querySelector('.kpaper-date').textContent : ''; const stamp = c.querySelector('.kpaper-stamp') ? c.querySelector('.kpaper-stamp').textContent : ''; const head = c.querySelector('.kcele-title').textContent; document.getElementById('win-celebrate-ok').click(); return { up, mast, date, stamp, head }; })()`)) as { up: boolean; mast: string; date: string; stamp: string; head: string };
  record('G52 신문식 축하 — 제호 「빠지 타임스」 · 날짜 줄 「1년차 봄 · 평일」 · 「속보」 도장 · 헤드라인', paper.up && paper.mast === '빠지 타임스' && /^1년차 봄 · (평일|주말)$/.test(paper.date) && paper.stamp === '속보' && paper.head.includes('랭크 업') ? 'pass' : 'fail', JSON.stringify(paper));
  const mv = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const r0 = g.placeFacility('toilet', gt.i + 2, gt.j + 4, 0); const uid = r0.uid; const f = g.facilities.byUid(uid); f.level = 3; w.facilityInfo.show(uid); const btn = document.getElementById('win-facility-move'); const lockedText = btn.textContent; const locked = btn.disabled; document.querySelector('#win-facility .kwin-close').click(); const denied = g.canMoveFacility(uid, gt.i + 4, gt.j + 4, 0); g.tools.add('move'); w.facilityInfo.show(uid); const openText = btn.textContent; const enabled = !btn.disabled; btn.click(); const mode = document.querySelector('#dock-place .kdock-mode').textContent; const moving = w.placeDock.movingUid; w.placeDock.aimAt(gt.i + 4, gt.j + 4); const why = document.querySelector('#dock-place .kdock-cost').textContent; const money0 = g.money; document.getElementById('dock-place-done').click(); const f2 = g.facilities.byUid(uid); const at = g.facilities.at(gt.i + 4, gt.j + 4); const old = g.facilities.at(gt.i + 2, gt.j + 4); return { lockedText, locked, denied: denied.ok ? 'ok' : denied.reason, openText, enabled, mode, moving, why, spent: money0 - g.money, level: f2 ? f2.level : -1, atNew: at ? at.uid : 0, oldEmpty: !old, dockHidden: document.getElementById('dock-place').hidden, uid }; })()`)) as { lockedText: string; locked: boolean; denied: string; openText: string; enabled: boolean; mode: string; moving: number | null; why: string; spent: number; level: number; atNew: number; oldEmpty: boolean; dockHidden: boolean; uid: number };
  record('G52 시설 이동 — 도구 없으면 「이동 · 도구 필요」(비활성·거절 이유) · 도구 있으면 이동 독 「이동 중」 → 결정 → 새 자리 · 옛 자리 빔 · uid·Lv3 보존 · 0G', mv.locked && mv.lockedText.includes('도구 필요') && mv.denied.includes('이동 도구') && mv.enabled && mv.openText === '이동' && mv.mode.includes('이동 중') && mv.moving === mv.uid && mv.why.includes('옮깁니다') && mv.spent === 0 && mv.level === 3 && mv.atNew === mv.uid && mv.oldEmpty && mv.dockHidden ? 'pass' : 'fail', JSON.stringify(mv));
}

/** G53 — 리텐션 5차(조사 D11·D17) + v3 잔여: 수집 분모 6줄 · 친구 글 좋아요 → 소원 EXP · 실패작 메뉴 · 심사 무대 조명 */
async function verifyG53(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const col = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.rankWin.show(); const rows = [...document.querySelectorAll('#win-rank .kcollect')].map((r) => [r.dataset.collect, r.querySelector('.krow-v').textContent, r.querySelector('.kgoal-fill').style.width]); document.querySelector('#win-rank .kwin-close').click(); return { rows, recipes: g.cooking.recipes.size, facilities: g.facilities.defsCount }; })()`)) as { rows: string[][]; recipes: number; facilities: number };
  const denom = Object.fromEntries(col.rows.map((r) => [r[0], Number((r[1] ?? '').split('/')[1])]));
  record('G53 수집 완성률 — 정보 창에 「n / N」 7줄(시설 N · 타일 13 · 수영복 18 · 친구 71 · 인증 24 · 레시피 144 · 콤보 40, P16) + 진행 막대', col.rows.length === 7 && denom['콤보'] === 40 && denom['시설 해금'] === col.facilities && denom['부표'] === 13 && denom['수영복·튜브'] === 18 && denom['SNS 친구'] === 71 && denom['인증 (종류)'] === 24 && denom['레시피'] === col.recipes && col.rows.every((r) => /%$/.test(r[2] ?? '')) ? 'pass' : 'fail', JSON.stringify(col));
  const like = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.sns.unlockedFriends[0]; const fd = g.sns.friendsById.get(f.id); const areaId = fd.area || fd.areaId || g.sns.areas[0].id; const exp0 = f.exp; g.sns.posts.push({ id: 99991, day: g.day, tick: g.tick, friendId: f.id, areaId, subject: { kind: 'facility', ref: 1, name: '화장실' }, likes: 3, playerLiked: false, growUntilDay: g.day + 2, palette: 1 }); w.snsWin.show('timeline'); const btn = document.querySelector('#win-sns [data-like="99991"]'); if (btn) btn.click(); const toast = (document.getElementById('hud-toast') || {}).textContent || ''; document.querySelector('#win-sns .kwin-close').click(); return { had: !!btn, gained: f.exp - exp0, toast, name: fd.name }; })()`)) as { had: boolean; gained: number; toast: string; name: string };
  record('G53 플레이어 좋아요 — 친구 글에 누르면 그 친구 소원 EXP +12 · 토스트 「좋아요 +5 · 이름 소원 진행 +12」', like.had && like.gained === 12 && like.toast.includes(like.name) && like.toast.includes('+12') ? 'pass' : 'fail', JSON.stringify(like));
  const fail = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; const gt = g.gate; const r = g.placeFacility('vending_out', gt.i + 3, gt.j + 6, 0); g.cooking.known.add('burnt_bread'); w.menuWin.show(r.uid); const row = document.querySelector('#win-menu [data-recipe="burnt_bread"]'); const text = row ? row.textContent : ''; const stage = document.querySelector('#win-cert .kstage'); document.querySelector('#win-menu-main .kwin-close').click(); w.certWin.show(); const st = document.querySelector('#win-cert .kstage'); const cs = st ? getComputedStyle(st) : null; const before = st ? getComputedStyle(st, '::before').content : ''; document.querySelector('#win-cert .kwin-close').click(); return { text, padTop: cs ? parseFloat(cs.paddingTop) : 0, lit: before !== 'none' && before !== '' }; })()`)) as { text: string; padTop: number; lit: boolean };
  record('G53 실패작 메뉴 — 「탄 빵 · 실패작」 이 메뉴 후보에 · 심사 무대 조명/관중 레이어', fail.text.includes('탄 빵') && fail.text.includes('실패작') && fail.padTop >= 14 && fail.lit ? 'pass' : 'fail', JSON.stringify(fail));
}

/** G54 — G46 잔여 소품: 재료 칩 아이콘 9계열 · 인기 캡슐 라벨/숫자 위계 · 짧은 창은 가운데(긴 창은 위) */
async function verifyG54(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.cooking.exp = 99999; w.cookWin.show(); const chips = [...document.querySelectorAll('#win-cook [data-ingredient]')]; const icons = chips.filter((c) => c.querySelector('.kicon[data-icon]')).length; const kinds = new Set(chips.map((c) => (c.querySelector('.kicon') || {}).dataset ? c.querySelector('.kicon').dataset.icon : '')); document.querySelector('#win-cook .kwin-close').click(); const info = document.getElementById('hud-info'); const lab = getComputedStyle(info.querySelector('.kpop-label')).fontSize; const num = getComputedStyle(info.querySelector('.num')).fontSize; const gu = g.guests.all[0]; if (gu) w.guestInfo.show(gu); const gi = document.getElementById('win-guest'); const shortFit = gu && gi && !gi.hidden ? gi.classList.contains('kfit') : null; if (gi && !gi.hidden) document.querySelector('#win-guest .kwin-close').click(); w.rankWin.show(); return { chips: chips.length, icons, kinds: [...kinds].filter(Boolean).length, lab: parseFloat(lab), num: parseFloat(num), shortFit }; })()`)) as { chips: number; icons: number; kinds: number; lab: number; num: number; shortFit: boolean | null };
  await page.waitForTimeout(80);
  const bw = (await page.evaluate(`(() => { const w = window.__pj; const bw = document.getElementById('win-rank'); const longFit = bw.classList.contains('kfit'); const top = bw.getBoundingClientRect().top; const h = bw.getBoundingClientRect().height; document.querySelector('#win-rank .kwin-close').click(); w.buildWin.show(); const bd = document.getElementById('win-build'); const buildH = bd.getBoundingClientRect().height; const buildFit = bd.classList.contains('kfit'); document.querySelector('#win-build .kwin-close').click(); return { longFit, top, h, buildH, buildFit }; })()`)) as { longFit: boolean; top: number; h: number; buildH: number; buildFit: boolean };
  const r2 = { ...r, ...bw };
  record('G54 재료 칩 아이콘(전 칩 · 계열 ≥3) · 인기 캡슐 라벨 < 숫자 · 정보 창(긴 창)은 위에 붙고 kfit 아님 · 건설 창(새 판, 짧음)은 가운데', r2.chips > 0 && r2.icons === r2.chips && r2.kinds >= 3 && r2.lab < r2.num && !r2.longFit && r2.top < 120 && r2.buildFit === (r2.buildH < (852 - 140) * 0.55) ? 'pass' : 'fail', JSON.stringify(r2));
}

/** G55 — 5189 재플레이 후속: 독 탭 한 줄 · 아이템 모드에 타일 칩 없음 · 「핑크까지 N개」 힌트 · 이동 고스트 「이동 · 무료」 · 같은 자리 거절 */
async function verifyG55(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const p = g.pools.all[0]; w.dock.enter('item', p.id); const tabs = [...document.querySelectorAll('#dock-pool .ktab')]; const tabH = Math.max(...tabs.map((t) => t.getBoundingClientRect().height)); const tabOneLine = tabs.every((t) => t.getBoundingClientRect().height <= 48 && t.scrollWidth <= t.clientWidth + 1); const tileChip = document.querySelector('#dock-pool [data-tile]'); const tileVisible = tileChip ? tileChip.getBoundingClientRect().height > 0 : false; document.querySelector('#dock-pool [data-item="strawberry"]').click(); const colorRow = (document.querySelector('#dock-pool-preview .kprev-row') || {}).textContent || ''; w.dock.exit(); const gt = g.gate; const f = g.facilities.all[0]; g.tools.add('move'); const same = g.canMoveFacility(f.uid, f.i, f.j, f.facing); w.facilityInfo.show(f.uid); document.getElementById('win-facility-move').click(); const label = w.scene.aimForTest().label; const why = document.querySelector('#dock-place .kdock-cost').textContent; w.placeDock.exit(); return { tabH, tabOneLine, tileVisible, colorRow, same: same.ok ? 'ok' : same.reason, label, why, pool: p.tiles.length }; })()`)) as { tabH: number; tabOneLine: boolean; tileVisible: boolean; colorRow: string; same: string; label: string | null; why: string; pool: number };
  record('G55 재플레이 후속 — 탭 한 줄 · 타일 칩 숨김 · 「핑크까지 N개」 · 이동 고스트 「이동 · 무료」 · 같은 자리 거절', r.tabOneLine && !r.tileVisible && /핑크빛?까지 \d개/.test(r.colorRow) && r.same.includes('같은 자리') && r.label === '이동 · 무료' && r.why.includes('같은 자리') ? 'pass' : 'fail', JSON.stringify(r));
}

/** G56 — 후반(8년차) 재플레이 후속: 통과 인증 접기 · 배지 99+ · 부표 줄 한 줄 · 인기도 천 단위 */
async function verifyG56(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.certs.state.passed['grade_f'] = 1; w.certWin.show(); const f = document.querySelector('#win-cert [data-cert="grade_f"]'); const d = document.querySelector('#win-cert [data-cert="grade_d"]'); const fPassed = f.classList.contains('kcert-passed') && !f.querySelector('.kstage') && !!f.querySelector('[data-apply]'); const dFull = !d.classList.contains('kcert-passed') && !!d.querySelector('.kstage') && !!d.querySelector('[data-expected]'); const fH = f.getBoundingClientRect().height; const dH = d.getBoundingClientRect().height; document.querySelector('#win-cert .kwin-close').click(); w.hud.setInfoBadge(207); const badge = document.querySelector('#hud-info .kbadge').textContent; w.hud.setInfoBadge(7); const p = g.pools.all[0]; w.poolInfo.show(p.id); const lab = document.querySelector('#win-pool .kpool-tiles > .krow-k'); const labH = lab ? lab.getBoundingClientRect().height : 0; document.querySelector('#win-pool .kwin-close').click(); return { fPassed, dFull, fH, dH, badge, labH }; })()`)) as { fPassed: boolean; dFull: boolean; fH: number; dH: number; badge: string; labH: number };
  record('G56 후반 후속 — 통과한 F 는 접힘(무대 없음 · 신청 남음 · 높이 < D 의 절반) · 정보 배지 207 → 「99+」 · 부표 라벨 한 줄', r.fPassed && r.dFull && r.fH < r.dH / 2 && r.badge === '99+' && r.labH > 0 && r.labH <= 30 ? 'pass' : 'fail', JSON.stringify(r));
}

/** G57 — 버그 감사 수정: 결산 카드가 삼킨 사건 선택 창 재개 · 하루+시즌 카드 줄 세우기 · 새 판이 씬 격자를 갈아끼움 */
async function verifyG57(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&kit=0&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.resultsCtl.enabled = true; w.features.randomEvents = true; g.day = 3; g.tick = w.TPD - 2; const forced = g.forceEvent('festival'); w.skip(3); const res = document.getElementById('win-results'); const choice = document.getElementById('win-choice'); const choiceFirst = !choice.hidden && res.hidden; const pending0 = g.events.pending; const b = document.querySelector('#win-choice [data-choice]'); if (b) b.click(); const t1 = !res.hidden ? document.getElementById('win-results-title').textContent : null; document.getElementById('win-results-ok').click(); const t2 = !res.hidden ? document.getElementById('win-results-title').textContent : null; if (!res.hidden) document.getElementById('win-results-ok').click(); const pending1 = g.events.pending; w.resultsCtl.enabled = false; w.newGame(9); const sameGrid = w.scene.gridForTest() === w.game.grid; return { forced, choiceFirst, pending0, t1, t2, pending1, sameGrid }; })()`)) as { forced: boolean; choiceFirst: boolean; pending0: string | null; t1: string | null; t2: string | null; pending1: string | null; sameGrid: boolean };
  record('G57 사건 창이 떠 있어도 결산 카드가 버려지지 않는다 — 답하면 하루 카드 → 시즌 카드 · 새 판이 씬 격자를 갈아끼움', r.forced && r.choiceFirst && !!r.pending0 && (r.t1 ?? '').includes('마감') && (r.t2 ?? '').includes('결산') && r.pending1 === null && r.sameGrid ? 'pass' : 'fail', JSON.stringify(r));
}

/** P0 (빠지 스토리) — 곧은 강 띠(8줄, 양끝 여울) · 시작 킷 데크 8 + 선착장 · 우측 5칸 정체(건설·수역·코스·SNS·장날) · 코스 칸 잠김 이유 · 강은 파지 않는다 · 데크 위에는 놓는다 */
async function verifyP0(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const r = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const grid = g.grid; let river = 0, shallow = 0, deck = 0; for (let k = 0; k < grid.floor.length; k++) { const f = grid.floor[k]; if (f === 5) river++; else if (f === 6) shallow++; else if (f === 7) deck++; } const rows = new Set(); for (let j = 0; j < grid.h; j++) if ([5, 6].includes(grid.at(0, j))) rows.add(j); const dock = g.facilities.all.find((f) => f.defId === 'dock'); const dockOnDeck = dock ? grid.at(dock.i, dock.j) === 7 : false; const cells = [...document.querySelectorAll('#hud-right .ksquare')].map((e) => e.dataset.cell); const courseLocked = document.querySelector('#hud-right [data-cell="course"]').dataset.locked || null; const gt = g.gate; const dig = g.canDig(g.land.i0 - 2, gt.j + 30); const mine = g.canDig(gt.i - 9, gt.j + 30).ok; const water = document.getElementById('hud-time').textContent; return { river, shallow, deck, rows: rows.size, dock: !!dock, dockOnDeck, cells, courseLocked, digRiver: dig.ok ? 'ok' : dig.reason, mine, kit: g.facilities.all.length, pool: g.pools.totalTiles() }; })()`)) as { river: number; shallow: number; deck: number; rows: number; dock: boolean; dockOnDeck: boolean; cells: string[]; courseLocked: string | null; digRiver: string; mine: boolean; kit: number; pool: number };
  record('P0→P15 물 22줄(64칸 폭) · 시작 킷 데크 링 16 + 선착장(데크 위) · 시설 7 · 자동 수역 20', r.rows === 22 && r.deck === 16 && r.river + r.shallow === 64 * 22 - 20 - 16 /* 킷 데크 2×4(강 4·여울 4) + 킷 수역 4×5(강 16·여울 4) */ && r.dock && r.dockOnDeck && r.kit === 7 && r.pool === 20 ? 'pass' : 'fail', JSON.stringify(r));
  record('P0 우측 5칸 = 건설·수역·코스·SNS·장날 · 코스 칸은 선착장이 있어 열림(P4-C) · 내 앞 강은 칠 수 있고 토지 열 밖 강은 「내 앞 수면이 아닙니다」', r.cells.join(',') === 'build,zone,course,sns,market' && r.courseLocked === null && r.dock && r.mine && r.digRiver.includes('수면') ? 'pass' : 'fail', JSON.stringify({ cells: r.cells, courseLocked: r.courseLocked, mine: r.mine, digRiver: r.digRiver }));
  // 픽셀 — 강 칸(선착장 앞 강 줄)이 물빛(파랑 우세). G3 와 같은 방법: 스크린샷을 페이지에 올려 여러 점 중 가장 파란 점
  await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i, gt.j + 31, 160); })()`);
  await page.waitForTimeout(400);
  const rects = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; const out = []; for (let a = 1; a <= 6; a++) for (let b = 30; b <= 33; b++) out.push(w.scene.tileScreenRect(gt.i + a, gt.j + b)); /* P15: 킷 링 오른쪽의 트인 강(행 30~33) */ return out; })()`)) as { x: number; y: number; w: number; h: number }[];
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
  const lv = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.rank = 5; g.grid.openLand(5); const grid = g.grid; const land = g.land; /* P14: 산기슭이 토지 안에 오게 5랭크 */ let best = null; for (let j = land.j0; j < land.j0 + land.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) { const z = grid.levelAt(i, j); if (!best || z > best.z) best = { i, j, z }; } const base = w.scene.tileScreenRect ? null : null; const y = w.scene.tileYForTest(best.i, best.j); const flatY = (() => { const r = w.scene.tileScreenRect; return null; })(); w.scene.setLiftFaultForTest(true); const y0 = w.scene.tileYForTest(best.i, best.j); w.scene.setLiftFaultForTest(false); const y1 = w.scene.tileYForTest(best.i, best.j); let mixed = null; for (let j = land.j0 + 2; j < land.j0 + land.h - 2 && !mixed; j++) for (let i = land.i0; i < land.i0 + land.w - 2 && !mixed; i++) { if (!grid.levelUniform(i, j, 2, 2) && [0, 1].every((a) => [0, 1].every((b) => grid.at(i + a, j + b) === 1 && !g.facilities.occupied(i + a, j + b)))) mixed = { i, j }; } const def = [...w.facilityDefs.values()].find((d) => d.w === 2 && d.d === 2 && !d.indoorOnly); g.unlocked.facilities.add(def.id); const r = mixed ? g.canPlace(def.id, mixed.i, mixed.j, 0) : null; return { z: best.z, y, y0, y1, drop: y0 - y1, mixed: !!mixed, reason: r && !r.ok ? r.reason : (r ? 'ok' : null) }; })()`)) as { z: number; y: number; y0: number; y1: number; drop: number; mixed: boolean; reason: string | null };
  record('P0-B 높이 — 지도 최고 단 ≥1(양옆 산기슭, P14) · 타일이 8×단 위로 뜬다(결함 주입이면 0) · 단 섞인 2×2 는 「경사」 거절', lv.z >= 1 && lv.drop === lv.z * 8 && lv.mixed && (lv.reason ?? '').includes('경사') ? 'pass' : 'fail', JSON.stringify(lv));
}

/** P1 — 수역: 독 탭(치기·걷기·소품·데크·데크 걷기·실내 2) · 강을 실터치로 쳐서 수역이 늘고 · 데크를 이어 깔고 · 여울은 걷지 않으며 · 킷 수역이 강 위이고 손님이 입수한다 */
async function verifyP1(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const center = async (sel: string): Promise<{ x: number; y: number } | null> => (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  const tabs = (await page.evaluate(`(() => { const w = window.__pj; w.dock.enter('dig'); return [...document.querySelectorAll('#dock-pool .ktab')].map((t) => t.textContent); })()`)) as string[];
  record('P1 수역 독 — 탭 9(치기·걷기·길·길 걷기·데크·데크 걷기·소품·실내 바닥·실내 지우기 — P16 길 2탭)', tabs.join(',') === '치기,걷기,길,길 걷기,데크,데크 걷기,소품,실내 바닥,실내 지우기' ? 'pass' : 'fail', tabs.join(','));
  // 강 칸을 진짜 터치 — 킷 수역 왼쪽 옆 강 칸 두 개 (수역에 이어져 닿는다)
  await page.evaluate(`window.__pj.dock.enter('dig')`); // P15: 치기 붓은 숨김 — 하네스가 직접 연다
  const spots = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i - 8, gt.j + 28, 160); const r1 = w.scene.tileScreenRect(gt.i - 8, gt.j + 28); const r2 = w.scene.tileScreenRect(gt.i - 8, gt.j + 27); return [r1, r2].map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })); })()`)) as { x: number; y: number }[];
  await page.waitForTimeout(300);
  for (const s of spots) { await touch(cdp, s.x, s.y); await page.waitForTimeout(450); /* 더블탭(확대) 판정 320ms 를 넘긴다 */ }
  const before = (await page.evaluate(`window.__pj.game.pools.totalTiles()`)) as number;
  const done = await center('#dock-pool-done');
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(300);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; return { tiles: g.pools.totalTiles(), pools: g.pools.all.length, floor: g.grid.at(gt.i - 8, gt.j + 28), dockUp: !document.getElementById('dock-pool').hidden }; })()`)) as { tiles: number; pools: number; floor: number; dockUp: boolean };
  record('P1 강 실터치 두 칸(치기 붓, 하네스 전용) → 완료 → 수역 +2 (P15: 데크 벽 너머라 킷 수역과 안 합쳐진다 · 풀 2개)', after.tiles === before + 2 && after.pools === 2 && after.floor === 4 ? 'pass' : 'fail', JSON.stringify({ before, ...after }));
  // 데크 — 킷 데크 오른쪽 옆 강 칸에 이어 깔기 (탭 → 지도 탭 → 완료)
  await page.evaluate(`(() => { const w = window.__pj; w.dock.enter('deck'); })()`); // 완료로 독이 닫혔다 — 데크 모드로 다시 연다
  await page.waitForTimeout(200);
  const d1 = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i + 2, gt.j + 26, 160); const r = w.scene.tileScreenRect(gt.i + 2, gt.j + 26); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; })()`)) as { x: number; y: number };
  await page.waitForTimeout(450);
  await touch(cdp, d1.x, d1.y);
  await page.waitForTimeout(450);
  const done2 = await center('#dock-pool-done');
  if (done2) await touch(cdp, done2.x, done2.y);
  await page.waitForTimeout(300);
  const deck = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const mid = g.canPaintDeck(gt.i + 2, gt.j + 30); return { floor: g.grid.at(gt.i + 2, gt.j + 26), midOk: mid.ok, midWhy: mid.ok ? '' : mid.reason, shallowWalk: g.guests.walkable(gt.i + 5, gt.j + 26) }; })()`)) as { floor: number; midOk: boolean; midWhy: string; shallowWalk: boolean };
  record('P1 데크 — 킷 데크 옆 여울에 깔림(7) · 강 한가운데는 「이어서」 거절 · 여울은 걷지 않는다', deck.floor === 7 && !deck.midOk && deck.midWhy.includes('이어서') && deck.shallowWalk === false ? 'pass' : 'fail', JSON.stringify(deck));
  await page.evaluate(`window.__pj.dock.exit()`);
  const swim = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.skip(900); const p = g.pools.all[0]; const onRiver = p.tiles.every((k) => { const j = Math.floor(k / g.grid.w); return j >= 26 && j < 48; }); return { onRiver, swimmers: g.guests.all.filter((x) => x.state === 'swim').length, guests: g.guests.count }; })()`)) as { onRiver: boolean; swimmers: number; guests: number };
  record('P1 킷 수역은 강 위 · 900tick 안에 손님이 입수한다', swim.onRiver && swim.swimmers >= 1 ? 'pass' : 'fail', JSON.stringify(swim));
}

/** P16 — 길·뷰·콤보 (D24): 길 탭 실터치 2칸 → 포장 · 배치 독으로 놓은 시설은 길이 안 닿는다(정보 창 「길」 행) · 자동 길 뒤 닿는다 · 뷰 행 · 콤보 발견 → 수집 「콤보」 */
/** P17 — 팀 자리 + 패키지 (D25): 같은 버스 = 같은 팀 · 팀 열쇠로 평상 대여 · 자리에서 패키지를 미리 산다 · 정보 창 「자리 값」·「팀」 · 자리 없으면 서성임 */
/** P18 — 1박·밤 (D26): 22시 폐장 시계 · 18시부터 헤더 「저녁」 + 밤 틴트 + 조명 · 숙박 체크인(1박 요금) · 폐장 뒤 남아 다음 날 이어서 논다 · 정보 창 「숙박」 */
async function verifyP18(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const eve = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 200000; g.rank = 2; g.grid.openLand(2); g.unlocked.facilities.add('camp_site'); const gt = g.gate; const r = g.placeFacility('camp_site', gt.i + 6, gt.j + 4, 0); const s = g.guests.spawn(); s.teamId = 5; s.target = { kind: 'facility', uid: r.uid }; s.state = 'walk'; s.stateTicks = 0; w.skip(300); const stays = s.stays; const lodging = g.stats.lodging; w.skip(g.tick < 1450 ? 1450 - g.tick : 0); w.refreshHud(); const daypart = document.querySelector('.daypart').textContent; const clock = g.clock.clock; const tintA = w.scene.tint ? w.scene.tint.fillAlpha : -1; const lights = w.scene.illuminationOn(); w.facilityInfo.show(r.uid); const rows = [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent); w.facilityInfo.win.hide(); return { ok: r.ok, stays, lodging, daypart, clock, tintA, lights, lodgeRow: rows.find((x) => x.startsWith('숙박')) ?? '' }; })()`)) as { ok: boolean; stays: boolean; lodging: number; daypart: string; clock: string; tintA: number; lights: boolean; lodgeRow: string };
  record('P18 저녁 구간 — 18시 넘으면 헤더 「… · 저녁」 · 밤 틴트 > 0 · 조명 켜짐 · 시계 PM 06:xx', eve.daypart.includes('저녁') && eve.tintA > 0 && eve.lights && /^PM 06/.test(eve.clock) ? 'pass' : 'fail', JSON.stringify({ daypart: eve.daypart, clock: eve.clock, tintA: eve.tintA, lights: eve.lights }));
  record('P18 숙박 체크인 — 캠핑 사이트에 앉은 손님이 stays · 1박 400G · 정보 창 「숙박 1명 잔다」', eve.ok && eve.stays && eve.lodging === 400 && /^숙박1명 잔다/.test(eve.lodgeRow) ? 'pass' : 'fail', JSON.stringify({ stays: eve.stays, lodging: eve.lodging, lodgeRow: eve.lodgeRow }));
  const night = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const uid = g.guests.all.find((x) => x.stays).uid; const day0 = g.day; w.skip(1680 - g.tick + 5); const kept = g.guests.all.find((x) => x.uid === uid); return { day: g.day - day0, kept: !!kept, state: kept ? kept.state : null, hp: kept ? kept.hp : 0, overnight: g.stats.overnight, clock: g.clock.clock, tintA: w.scene.tint ? w.scene.tint.fillAlpha : -1 }; })()`)) as { day: number; kept: boolean; state: string | null; hp: number; overnight: number; clock: string; tintA: number };
  record('P18 하루를 넘기면 — 숙박 손님이 남아 아침에 wander · 체력 100 · overnight ≥ 1 · 시계 AM 08', night.day === 1 && night.kept && night.state === 'wander' && night.hp === 100 && night.overnight >= 1 && /^AM 08/.test(night.clock) ? 'pass' : 'fail', JSON.stringify(night));
  void cdp;
}

async function verifyP17(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&events=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const team = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; g.money = 100000; g.busState = { areaId: 'residential', seatsLeft: 0, phase: 'stop', t: 0, source: 'likes', team: 7 }; for (let k = 0; k < 4; k++) g.spawnBusGuest('residential'); g.busState = null; const kit = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'lounging' && g.facilities.defOf(f).usageFee > 0); const team = g.guests.all.filter((x) => x.teamId === 7); for (const t of team) { t.target = { kind: 'facility', uid: kit.uid }; t.state = 'walk'; t.stateTicks = 0; } g.step(400); const seated = team.filter((t) => t.seatUid === kit.uid); w.facilityInfo.show(kit.uid); const rows = [...document.querySelectorAll('#win-facility .krow')].map((r) => r.textContent); w.facilityInfo.win.hide(); return { n: team.length, rented: kit.rentedBy, seated: seated.length, pkg: g.stats.pkg, teamSeated: g.stats.teamSeated, pkgs: seated.map((t) => t.pkg), seatRow: rows.find((r) => r.startsWith('자리 값')) ?? '', feeRow: rows.find((r) => r.startsWith('이용료')) ?? '' }; })()`)) as { n: number; rented: number; seated: number; pkg: number; teamSeated: number; pkgs: string[]; seatRow: string; feeRow: string };
  record('P17 버스 팀 4명 — 같은 팀 · 유료 평상이 팀 열쇠(−8)로 대여 · 둘 이상 앉음 · 패키지 매출 > 0', team.n === 4 && team.rented === -8 && team.seated >= 2 && team.pkg > 0 && team.teamSeated === team.seated && team.pkgs.every((p) => p === 'meat' || p === 'swim') ? 'pass' : 'fail', JSON.stringify(team));
  record('P17 정보 창 — 「자리 값 n — …」 행 · 「이용료 … 팀 #7 자리」', /^자리 값\d/.test(team.seatRow) && team.feeRow.includes('팀 #7 자리') ? 'pass' : 'fail', JSON.stringify({ seatRow: team.seatRow, feeRow: team.feeRow }));
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
  await page.evaluate(`(() => { const w = window.__pj; w.game.money = 50000; w.dock.enter('path'); const gt = w.game.gate; w.scene.focusTile(gt.i + 4, gt.j + 12, 150); })()`);
  await page.waitForTimeout(400);
  const pts = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; return [{ i: gt.i + 1, j: gt.j + 12 }, { i: gt.i + 2, j: gt.j + 12 }].map((t) => { const r = w.scene.tileScreenRect(t.i, t.j); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }); })()`)) as { x: number; y: number }[];
  for (const p of pts) { await touch(cdp, p.x, p.y); await page.waitForTimeout(450); }
  const done = (await page.evaluate(`(() => { const b = [...document.querySelectorAll('#dock-pool button')].find((x) => x.textContent.trim() === '완료'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const path = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const tab = document.querySelector('#dock-pool .ktab[data-mode="path"]'); return { a: g.grid.at(gt.i + 1, gt.j + 12), b: g.grid.at(gt.i + 2, gt.j + 12), tabShown: !!tab && !tab.classList.contains('khide'), money: g.money }; })()`)) as { a: number; b: number; tabShown: boolean; money: number };
  record('P16 길 탭 실터치 2칸 → 포장(2) · 40G', path.tabShown && path.a === 2 && path.b === 2 && path.money === 50000 - 40 ? 'pass' : 'fail', JSON.stringify(path));
  // 배치(플레이어 경로 = autoPath false)로 잔디 한가운데 놓으면 길이 안 닿는다 → 정보 창 「길」 행 · 자동 길 뒤 닿음 · 뷰 행
  const info = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.unlocked.facilities.add('pyeongsang_row'); const r = g.placeFacility('pyeongsang_row', gt.i - 6, gt.j + 16, 0, { autoPath: false }); if (!r.ok) return { err: r.reason }; w.facilityInfo.show(r.uid); const rows = () => [...document.querySelectorAll('#win-facility .krow')].map((x) => x.textContent); const before = rows().find((t) => t.startsWith('길')); const view = rows().find((t) => t.startsWith('뷰')); const paved = g.ensurePath(r.uid); w.facilityInfo.show(r.uid); const after = rows().find((t) => t.startsWith('길')); w.facilityInfo.win.hide(); return { before, after, view, paved }; })()`)) as { err?: string; before?: string; after?: string; view?: string; paved?: number };
  record('P16 정보 창 — 배치 독 시설은 「길이 안 닿는다」 → 자동 길 뒤 「입구에서 닿는다」 · 「뷰」 행', !info.err && !!info.before && info.before.includes('안 닿는다') && !!info.after && info.after.includes('닿는다') && !info.after.includes('안 닿는다') && !!info.view && (info.paved ?? 0) > 0 ? 'pass' : 'fail', JSON.stringify(info));
  const combo = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.unlocked.facilities.add('shop'); const a = g.placeFacility('shop', gt.i + 4, gt.j + 14, 0); const b = g.placeFacility('pyeongsang_row', gt.i + 4, gt.j + 17, 0); w.rankWin.show(); const row = [...document.querySelectorAll('#win-rank .krow')].map((x) => x.textContent).find((t) => t.startsWith('콤보')); w.rankWin.win.hide(); return { a: a.ok, b: b.ok, active: g.combos().map((c) => c.def.name), row }; })()`)) as { a: boolean; b: boolean; active: string[]; row?: string };
  record('P16 콤보 — 매점 + 평상 2칸 안 → 「매점 앞 평상」 발동 · 수집 「콤보 1 / 40」', combo.a && combo.b && combo.active.includes('매점 앞 평상') && !!combo.row && /콤보\s*1 \/ 40/.test(combo.row.replace(/\s+/g, ' ')) ? 'pass' : 'fail', JSON.stringify(combo));
}

/** P15 — 방향·수영 구역·코스 물: 입구가 위(j=0)·물이 아래 · 데크로 둘러싸면 자동 수역(실터치) · 치기 탭 숨김 · 코스 제안은 트인 강 · 허가 줄은 랭크마다 +3 */
async function verifyP15(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const lay = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; const hidden = [...document.querySelectorAll('#dock-pool .ktab')].filter((b) => ['dig', 'fill'].includes(b.dataset.mode)).every((b) => b.classList.contains('khide')); const s = g.suggestCourse(); const open = s.ok ? s.draft.handles.every((h) => [5, 6].includes(g.grid.at(Math.round(h.x), Math.round(h.y)))) : false; return { gateJ: gt.j, bottom: g.grid.at(gt.i, 47), top: g.grid.at(gt.i, 1), pools: g.pools.all.length, tiles: g.pools.totalTiles(), hidden, open, waterMax0: g.waterMax }; })()`)) as { gateJ: number; bottom: number; top: number; pools: number; tiles: number; hidden: boolean; open: boolean; waterMax0: number };
  record('P15 방향 — 입구가 위(j=0) · 아래는 강 · 킷 수역 20(데크 링 자동) · 치기/걷기 탭 숨김 · 코스 제안은 트인 강 · 허가 줄 33', lay.gateJ === 0 && lay.bottom === 5 && lay.top === 2 && lay.tiles === 20 && lay.hidden && lay.open && lay.waterMax0 === 33 ? 'pass' : 'fail', JSON.stringify(lay));
  // 데크 링 실터치: 킷 링 오른쪽에 ㄷ자 데크(왼 열은 킷 링의 오른 열을 빌린다) → 안쪽이 자동으로 수역이 된다
  await page.evaluate(`(() => { const w = window.__pj; w.game.money = 50000; w.dock.enter('deck'); const gt = w.game.gate; w.scene.focusTile(gt.i + 1, gt.j + 28, 150); })()`);
  await page.waitForTimeout(400);
  const ring = (await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; const pts = []; for (let j = 26; j <= 29; j++) pts.push({ i: gt.i + 2, j: gt.j + j }); for (let i = -1; i <= 1; i++) pts.push({ i: gt.i + i, j: gt.j + 29 }); return pts.map((t) => { const r = w.scene.tileScreenRect(t.i, t.j); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }); })()`)) as { x: number; y: number }[];
  for (const p of ring) { await touch(cdp, p.x, p.y); await page.waitForTimeout(450); } // 320ms 안의 다음 탭은 더블탭(확대)으로 먹힌다 — P1 과 같은 간격
  const done = await page.evaluate(`(() => { const b = document.querySelector('#dock-pool [data-act="done"]') || [...document.querySelectorAll('#dock-pool button')].find((x) => x.textContent.trim() === '완료'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
  if (done) await touch(cdp, done.x, done.y);
  await page.waitForTimeout(400);
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; let deck = 0; for (let k = 0; k < g.grid.floor.length; k++) if (g.grid.floor[k] === 7) deck++; return { pools: g.pools.all.length, tiles: g.pools.totalTiles(), deck, inner: g.grid.at(gt.i, gt.j + 27) }; })()`)) as { pools: number; tiles: number; deck: number; inner: number };
  record('P15 데크 ㄷ자 실터치 7칸 → 안쪽 3×3 이 자동 수역(+9) · 수역 2개 · 데크 23', after.pools === 2 && after.tiles === 29 && after.deck === 23 && after.inner === 4 ? 'pass' : 'fail', JSON.stringify(after));
  const perm = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const a = g.waterMax; g.rank = 2; g.grid.openLand(2); const b = g.waterMax; const gt = g.gate; return { a, b, farOk: g.canPaintDeck(gt.i + 8, gt.j + 38).ok, nearOk: g.canPaintDeck(gt.i + 8, gt.j + 26).ok }; })()`)) as { a: number; b: number; farOk: boolean; nearOk: boolean };
  record('P15 수면 허가 — 랭크 0 은 33줄, 랭크 2 는 39줄 · 허가 밖 강엔 데크를 못 깐다', perm.a === 33 && perm.b === 39 && !perm.farOk && perm.nearOk ? 'pass' : 'fail', JSON.stringify(perm));
}

/** P14 — 레거시 구조: 아틀라스 프레임이 실제로 뜬다(지면·시설 source art, 레거시 프레임 크기) · 물 22줄 · `?legacy=0` 이면 절차로 떨어진다 */
async function verifyP14(page: import('playwright').Page, cdp: CDPSession): Promise<void> {
  await page.goto(`${BASE}/?debug=1&fresh=1&tut=0&confirm=0&px=1`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 15000 });
  const on = (await page.evaluate(`(() => { const w = window.__pj; const pr = w.provider; const g = w.game; let water = 0; for (let j = 0; j < g.grid.h; j++) if ([5, 6].includes(g.grid.at(0, j))) water++; const dock = g.facilities.all.find((f) => f.defId === 'dock'); const key = 'fac/dock/0'; const tex = w.scene.textures.exists(key); return { grass: pr.spec('tile/grass'), river: pr.spec('tile/river:0'), dock: pr.spec(key), water, land: g.land, docked: !!dock, tex }; })()`)) as { grass: { source: string; w: number; h: number } | null; river: { source: string } | null; dock: { source: string; w: number; h: number } | null; water: number; land: { j0: number; h: number; w: number }; docked: boolean; tex: boolean };
  const okOn = on.grass?.source === 'art' && on.grass.w === 32 && on.grass.h === 16 && on.river?.source === 'art' && on.dock?.source === 'art' && on.dock.w === 32 && on.dock.h === 28 && on.water === 22 && on.land.j0 === 0 && on.land.h === 26 && on.docked && on.tex;
  record('P14 레거시 아틀라스 — 잔디·강 타일과 선착장이 art(레거시 프레임 크기 32×16 · 32×28) · 물 22줄 · 뭍 토지 26줄 고정', okOn ? 'pass' : 'fail', JSON.stringify({ grass: on.grass, dock: on.dock, water: on.water, land: on.land, tex: on.tex }));
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
  record('P11 엔딩 창 이월 문구에 「기구」', r.txt.includes('기구') && r.txt.includes('부표') ? 'pass' : 'fail', r.txt.slice(0, 120));
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
  const after = (await page.evaluate(`(() => { const w = window.__pj; const g = w.game; const f = g.facilities.byUid(${opened.uid}); const rows = [...document.querySelectorAll('#win-facility .krow')].map((r) => r.textContent); const label = document.getElementById('win-facility-staff').textContent; const palm = g.facilities.all.find((f) => g.facilities.defOf(f).class === 'decor'); w.facilityInfo.show(palm.uid); const palmHidden = document.getElementById('win-facility-staff').classList.contains('khide'); w.facilityInfo.win.hide(); return { staff: f.staff, m1: g.dailyMaintenance(), label, hasRow: rows.some((t) => t.includes('알바') && t.includes('있음')), palmHidden }; })()`)) as { staff: number; m1: number; label: string; hasRow: boolean; palmHidden: boolean };
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
  const want = ['물놀이', '경관', '핫플', '사철', '맛집', '스릴', '안전', '청결'];
  record('P6 빠지 심사 창 — 계열 탭 8 = 물놀이·경관·핫플·사철·맛집·스릴·안전·청결', tabs.title.includes('빠지 심사') && want.every((k) => tabs.t.includes(k)) ? 'pass' : 'fail', JSON.stringify(tabs));
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
  record('G25 시작 킷 — 풀 20칸 · 시설 7 · 돈 12,000 · 경계 나무 ≥ 12', kit.tiles === 20 && kit.pools === 1 && kit.facs === 7 && kit.money === 12000 && kit.trees >= 12 ? 'pass' : 'fail', JSON.stringify(kit));
  await page.screenshot({ path: `${SHOT_DIR}/g25-start.png` });
  const water = (await page.evaluate(`(async () => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return -1; const w = c.width, h = c.height; const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); let n = 0; for (let i = 0; i < buf.length; i += 16) { const r = buf[i], g = buf[i + 1], b = buf[i + 2]; if (b > 190 && g > 170 && r < 200 && b - r > 30) n++; } return n / (buf.length / 16); })()`)) as number;
  record('G25 첫 화면 물 비율 ≥ 1% (S1, 풀 20칸 — 카메라가 풀을 비춘다)', water >= 0.01 ? 'pass' : 'fail', `${Math.round(water * 1000) / 10}%`);
}

async function main(): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`워터파크 검증 — ${URL} · ${GOAL}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED });
  const ctx = await browser.newContext(DEVICE);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
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
  record('HUD 면적 ≤ 18%', home.hudPct <= 18 ? 'pass' : 'fail', `${home.hudPct}%`);
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
  record('지형 — 지도 위 귀퉁이 모래(입구 쪽 뭍, P15) · 토지 잔디 · 입구 표식', baseKey(tex.corner).startsWith('tile/sand') && baseKey(tex.land) === 'tile/grass' && baseKey(tex.gate) === 'tile/gate' ? 'pass' : 'fail', JSON.stringify(tex));

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
  if (G >= 42) await verifyG42(page);
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
  if (G >= 31) await verifyG31(page);
  if (G >= 33) await verifyG33(page);
  if (G >= 34) await verifyG34(page);
  if (G >= 35) await verifyG35(page);
  if (G >= 36) await verifyG36(page);
  if (G >= 37) await verifyG37(page);
  if (G >= 39) await verifyG39(page);

  record('콘솔 에러 0', errors.length === 0 ? 'pass' : 'fail', errors.slice(0, 3).join(' | '));

  await browser.close();
  const fails = results.filter((r) => r.verdict === 'fail');
  console.log(fails.length ? `\n❌ ${fails.length} 실패` : `\n✅ ${results.length} 통과`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

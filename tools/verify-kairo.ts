/**
 * 카이로 씬 브라우저 검증 — 페이즈마다 이걸로 통과를 확인한다.
 *
 *   npm run verify:kairo
 *   npm run verify:kairo -- --headed
 *
 * 개발 서버(npm run dev)가 떠 있어야 한다.
 *
 * ## 왜 별도 하네스인가
 *
 * `verify:mobile` 은 v1 씬(자유 배치·실시간 배속)을 검사한다. 카이로는 스케일 모드부터
 * 다르고 조작도 다르므로 같은 파일에 섞으면 둘 다 못 읽는다. 카이로가 기본 씬이 되면
 * 이쪽으로 합친다.
 *
 * ## 함정 (실측)
 *
 * - **`page.evaluate` 안에서 이름 있는 함수를 쓰지 말 것.** tsx(esbuild)가 `__name`
 *   헬퍼를 주입하는데 페이지 쪽엔 없어서 ReferenceError 가 난다. 문자열로 넘기는 게 안전하다.
 * - **핀치/멀티터치는 CDP `Input.dispatchTouchEvent` 로 보낼 것.** 합성 PointerEvent 는
 *   Phaser 가 무시해서 멀쩡한 코드가 실패로 나온다.
 */
import { chromium, type ConsoleMessage } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';
const URL = `${BASE}/?kairo=1&px=1`; // px=1 = 프레임버퍼 보존 (이음새 픽셀 검사용)
const HEADED = process.argv.includes('--headed');
const SHOT_DIR = 'tmp-shots';

/** iPhone 14 Pro 급 — DPR 3 이 정수라 도트 격자에 유리한 쪽. 안드로이드는 아래에서 따로 본다 */
const DEVICE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

type Verdict = 'pass' | 'fail' | 'info';
const results: Array<{ name: string; verdict: Verdict; detail: string }> = [];
const record = (name: string, verdict: Verdict, detail = ''): void => {
  results.push({ name, verdict, detail });
  const icon = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✕' : 'ℹ';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main(): Promise<void> {
  console.log(`카이로 검증 — ${URL}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED });
  const ctx = await browser.newContext(DEVICE);
  const page = await ctx.newPage();

  /**
   * 알려진 무해한 요청 실패. **URL 로 허용한다** — "Failed to load resource" 라는
   * 문구만 보고 통째로 무시하면 진짜 에러를 놓친다.
   *   · assets/atlas.json — 아틀라스 유무 탐색. 없으면 절차적 생성으로 내려간다 (설계대로)
   *   · favicon.ico — 파비콘 없음
   */
  const BENIGN = [/assets\/atlas\.json$/, /favicon\.ico$/];

  /** 탭 → 타일 해석 회귀 검사용. 붓이 없을 때 씬이 해석한 타일을 콘솔에 찍는다 */
  const tapLog: string[] = [];
  const errors: string[] = [];
  const httpFails: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.text().includes('탭 타일')) tapLog.push(m.text());
    if (m.type() !== 'error') return;
    // 리소스 로드 실패는 아래 httpFails 로 URL 까지 보고 판단한다
    if (m.text().includes('Failed to load resource')) return;
    errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !BENIGN.some((re) => re.test(r.url()))) {
      httpFails.push(`${r.status()} ${r.url()}`);
    }
  });
  page.on('requestfailed', (r) => {
    if (!BENIGN.some((re) => re.test(r.url()))) httpFails.push(`FAILED ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  // 씬 통계를 window 에 흘려 받는다
  await page.addInitScript(`
    window.__kairoStats = null;
    const orig = Object.getOwnPropertyDescriptor(window, '__kairo');
    void orig;
  `);

  await page.goto(URL, { waitUntil: 'load' });
  // 디버그 박스가 텍스트를 채우면 씬이 돈다는 뜻
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );

  // ── 1. 부팅 ──
  const hasCanvas = await page.evaluate(`document.querySelectorAll('canvas').length`);
  record('부팅 — 캔버스 생성', hasCanvas ? 'pass' : 'fail', `캔버스 ${String(hasCanvas)}개`);

  // ── 2. 콘솔 에러 / 요청 실패 ──
  record(
    '콘솔 에러 0',
    errors.length === 0 ? 'pass' : 'fail',
    errors.length ? errors.slice(0, 3).join(' | ') : '',
  );
  record(
    '요청 실패 0 (무해 허용 목록 제외)',
    httpFails.length === 0 ? 'pass' : 'fail',
    httpFails.slice(0, 3).join(' | '),
  );

  // ── 3. 내부 해상도 = 버퍼, CSS = 버퍼 × S ──
  const geo = (await page.evaluate(`(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height),
             dpr: window.devicePixelRatio };
  })()`)) as { w: number; h: number; cssW: number; cssH: number; dpr: number } | null;

  if (!geo) {
    record('캔버스 기하', 'fail', '캔버스를 못 찾았다');
  } else {
    const s = Math.round(geo.cssW / geo.w);
    const ok = geo.cssW === geo.w * s && geo.cssH === geo.h * s && Number.isInteger(s);
    record(
      '도트 격자 — CSS = 내부해상도 × 정수 S',
      ok ? 'pass' : 'fail',
      `내부 ${geo.w}×${geo.h} · CSS ${geo.cssW}×${geo.cssH} · S=${s} · DPR ${geo.dpr}`,
    );
    const deviceScale = s * Math.round(geo.dpr);
    record(
      '텍셀당 디바이스픽셀이 정수',
      Number.isInteger(deviceScale) ? 'pass' : 'fail',
      `${deviceScale}`,
    );
    // 화면을 넘치는 양이 S−1 이하
    const over = geo.cssW - 393;
    record('가로 넘침 ≤ S−1', over >= 0 && over <= s - 1 ? 'pass' : 'fail', `${over}px`);
  }

  // ── 4. 디버그 박스에서 위반 확인 ──
  const dbg = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  record('도트격자 위반 0', dbg.includes('도트격자 OK') ? 'pass' : 'fail', dbg.replace(/\n/g, ' | '));

  // ── 5. 타일 수 ──
  const tiles = Number(/타일 (\d+)/.exec(dbg)?.[1] ?? 0);
  record('격자 40×32 = 1280 타일', tiles === 1280 ? 'pass' : 'fail', `${tiles}`);

  // ── 5b. 타일링 이음새 — 지면 안쪽에 배경색이 새는지 (스킬 문서 미결 항목) ──
  //
  // 다이아몬드를 AA fill 로 그리면 타일 사이에 1px 틈이 생겨 배경(하늘색)이 비친다.
  // K1 스크린샷에서 격자 무늬로 드러났던 그 문제를 **실제 렌더 픽셀로** 검사한다.
  //
  // 표본 위치는 씬에 물어본다 — 하네스가 투영을 다시 구현하면 좌표가 바뀔 때 조용히
  // 엉뚱한 곳(배경 대역)을 재고, 그게 처음에 실제로 일어났다.
  const seam = (await page.evaluate(`(() => {
    const sc = window.__kairo.scene;
    const c = document.querySelector('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    const H = c.height, W = c.width;
    // 화면에 보이는 잔디 타일 4개가 이어진 블록을 찾는다
    let found = null;
    for (let j = 0; j < 32 && !found; j++) {
      for (let i = 0; i < 40; i++) {
        if (sc.groundAt(i, j) !== 'lawn') continue;
        if (sc.groundAt(i + 1, j) !== 'lawn' || sc.groundAt(i, j + 1) !== 'lawn') continue;
        if (sc.groundAt(i + 1, j + 1) !== 'lawn') continue;
        const r = sc.tileScreenRect(i, j);
        // 네 타일이 모두 화면 안쪽에 여유 있게 들어와야 한다
        if (r.x > 8 && r.y > 8 && r.x + 3 * 16 < W - 8 && r.y + 3 * 8 < H - 8) {
          found = { i: i, j: j, r: r };
          break;
        }
      }
    }
    if (!found) return { ok: false, reason: '화면 안의 잔디 2×2 블록을 못 찾았다' };
    // 네 타일이 만나는 중심부를 샘플 — 이음새가 있으면 여기에 배경색이 뜬다
    const cx = found.r.x + 16, cy = found.r.y + 16;
    const w = 20, h = 10;
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const buf = new Uint8Array(w * h * 4);
    g.readPixels(x0, H - (y0 + h), w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
    let bg = 0, total = 0;
    const hist = {};
    for (let k = 0; k < buf.length; k += 4) {
      const r = buf[k], gg = buf[k + 1], b = buf[k + 2];
      total++;
      if (Math.abs(r - 122) < 12 && Math.abs(gg - 184) < 12 && Math.abs(b - 212) < 12) bg++;
      const key = r + ',' + gg + ',' + b;
      hist[key] = (hist[key] || 0) + 1;
    }
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { ok: true, tile: [found.i, found.j], bg: bg, total: total, top: top };
  })()`)) as
    | { ok: false; reason: string }
    | { ok: true; tile: [number, number]; bg: number; total: number; top: [string, number][] };

  if (!seam.ok) {
    record('타일링 이음새', 'fail', seam.reason);
  } else {
    // ⚠ 먼저 **검사가 유효한지** 본다. 프레임버퍼가 안 보존되면 검은색이 돌아와
    //   "배경색 0" 으로 조용히 통과한다 (실측). 무효한 검사는 실패로 취급한다.
    const topColor = seam.top[0]?.[0] ?? '';
    const readValid = seam.total > 100 && topColor !== '0,0,0';
    record(
      '이음새 검사가 유효하다 (잔디 위를 읽었나)',
      readValid ? 'pass' : 'fail',
      `타일 ${seam.tile.join(',')} · 표본 ${seam.total} · 최빈색 ${seam.top
        .map((t) => `${t[0]}×${t[1]}`)
        .join(' / ')}`,
    );
    record(
      '타일링 이음새 — 네 타일이 만나는 곳에 배경색 0',
      readValid && seam.bg === 0 ? 'pass' : 'fail',
      `배경색 픽셀 ${seam.bg}/${seam.total}`,
    );
  }

  // ── 6. 팬 — 손가락 드래그로 스크롤이 변한다 ──
  const before = /스크롤 (-?\d+),(-?\d+)/.exec(dbg);
  await page.locator('canvas').first().hover();
  const cdp = await ctx.newCDPSession(page);
  type TouchType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';
  const touch = async (type: TouchType, x: number, y: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  };
  await touch('touchStart', 200, 500);
  for (let k = 1; k <= 8; k++) await touch('touchMove', 200 - k * 15, 500 - k * 8);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(300);
  const dbg2 = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  const after = /스크롤 (-?\d+),(-?\d+)/.exec(dbg2);
  const moved = before && after && (before[1] !== after[1] || before[2] !== after[2]);
  record(
    '팬 — 손가락 드래그로 스크롤 변화',
    moved ? 'pass' : 'fail',
    `${before?.[0] ?? '?'} → ${after?.[0] ?? '?'}`,
  );

  // 스크롤이 정수인지
  const intScroll = after && Number.isInteger(Number(after[1])) && Number.isInteger(Number(after[2]));
  record('스크롤이 정수', intScroll ? 'pass' : 'fail', after?.[0] ?? '');

  // ── 7. 더블탭 확대 ──
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(60);
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(400);
  const dbg3 = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  const s2 = /S=(\d)/.exec(dbg3)?.[1];
  record('더블탭 확대 → S=2', s2 === '2' ? 'pass' : 'fail', `S=${s2 ?? '?'}`);
  record(
    'S=2 에서도 도트격자 OK',
    dbg3.includes('도트격자 OK') ? 'pass' : 'fail',
    dbg3.replace(/\n/g, ' | '),
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-s2.png` });

  // 되돌리기
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(60);
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/kairo-s1.png` });

  // ── 7b. 지면 붓 — 폰에서 실제로 길을 낼 수 있나 ──
  const brushBtns = (await page.evaluate(`(() => {
    const bar = document.getElementById('kairo-brush');
    if (!bar) return null;
    const bs = [...bar.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { kind: b.dataset.kind, w: Math.round(r.width), h: Math.round(r.height) };
    });
    return { count: bs.length, minH: Math.min(...bs.map((b) => b.h)),
             minW: Math.min(...bs.map((b) => b.w)), overflow: bar.scrollWidth > bar.clientWidth };
  })()`)) as { count: number; minH: number; minW: number; overflow: boolean } | null;

  if (!brushBtns) {
    record('지면 붓 팔레트', 'fail', '팔레트를 못 찾았다');
  } else {
    record(
      '붓 10종 (지면 6 + 벽·문·시설·지우기)',
      brushBtns.count === 10 ? 'pass' : 'fail',
      `${brushBtns.count}개`,
    );
    record(
      '터치 타깃 44px 이상',
      brushBtns.minH >= 44 ? 'pass' : 'fail',
      `최소 ${brushBtns.minW}×${brushBtns.minH}`,
    );
  }

  // 목재 데크길을 골라 물 위 칸을 칠한다 → 걸을 수 있게 바뀌어야 한다
  const painted = (await page.evaluate(`(() => {
    const t = window.__kairo.terrain;
    const sc = window.__kairo.scene;
    // 물인 칸을 찾는다
    let wet = null;
    for (let j = 31; j >= 0 && !wet; j--) {
      for (let i = 0; i < 40; i++) if (!t.isWalkable(i, j)) { wet = [i, j]; break; }
    }
    if (!wet) return { ok: false, reason: '물 칸이 없다' };
    const before = t.kindAt(wet[0], wet[1]);
    const walkBefore = t.isWalkable(wet[0], wet[1]);
    t.paint(wet[0], wet[1], 'path_deck');
    sc.refreshTile(wet[0], wet[1]);
    return { ok: true, tile: wet, before: before, after: t.kindAt(wet[0], wet[1]),
             walkBefore: walkBefore, walkAfter: t.isWalkable(wet[0], wet[1]) };
  })()`)) as
    | { ok: false; reason: string }
    | { ok: true; tile: number[]; before: string; after: string; walkBefore: boolean; walkAfter: boolean };

  if (!painted.ok) {
    record('지면 칠하기', 'fail', painted.reason);
  } else {
    record(
      '칠하면 지면 종류와 통행 가능성이 바뀐다',
      painted.after === 'path_deck' && !painted.walkBefore && painted.walkAfter ? 'pass' : 'fail',
      `(${painted.tile.join(',')}) ${painted.before}→${painted.after} · 통행 ${painted.walkBefore}→${painted.walkAfter}`,
    );
  }

  // ── 7c. 벽·문·밀폐 차단 ──
  const wallCheck = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const t = h.terrain, w = h.walls, sc = h.scene;
    const out = {};
    // 걸을 수 있는 넓은 자리를 찾는다 (뒤쪽 육지)
    let base = null;
    for (let j = 1; j < 20 && !base; j++) {
      for (let i = 1; i < 34; i++) {
        let ok = true;
        for (let di = 0; di < 4 && ok; di++)
          for (let dj = 0; dj < 4; dj++) if (!t.isWalkable(i + di, j + dj)) { ok = false; break; }
        if (ok) { base = [i, j]; break; }
      }
    }
    if (!base) return { ok: false, reason: '4×4 육지를 못 찾았다' };
    const [bi, bj] = base;
    const gate = { i: 0, j: 0 };

    // (bi+1, bj+1) 을 네 벽으로 둘러싼다 — 마지막 하나가 거절되어야 한다
    const ci = bi + 1, cj = bj + 1;
    const three = [[ci-1,cj],[ci+1,cj],[ci,cj-1]];
    let placed = 0;
    for (const [i, j] of three) {
      const r = h.sim.placeWall(t, w, gate, i, j, 1);
      if (r.ok) { sc.refreshWall(i, j); placed++; }
    }
    out.placedThree = placed;
    const sealAttempt = h.sim.placeWall(t, w, gate, ci, cj + 1, 1);
    out.sealRejected = !sealAttempt.ok && sealAttempt.reason === 'would-seal';
    out.sealedCount = sealAttempt.sealed || 0;

    // 같은 자리를 문으로는 놓을 수 있다
    const doorAttempt = h.sim.placeWall(t, w, gate, ci, cj + 1, 2);
    if (doorAttempt.ok) sc.refreshWall(ci, cj + 1);
    out.doorAccepted = doorAttempt.ok;

    // 마스크가 이웃을 반영하나 — 가운데를 둘러싼 벽 중 하나는 이웃이 있어야 한다
    out.maskOfLeft = w.mask(ci - 1, cj);

    // 이어 붙인 벽 한 줄 — 마스크가 이웃을 반영하는지, 화면에서 벽으로 읽히는지
    const ri = bi, rj = bj + 3;
    const runMasks = [];
    for (let k = 0; k < 6; k++) {
      const r = h.sim.placeWall(t, w, gate, ri + k, rj, 1);
      if (r.ok) sc.refreshWall(ri + k, rj);
    }
    for (let k = 0; k < 6; k++) runMasks.push(w.mask(ri + k, rj));
    out.runMasks = runMasks;
    out.runOrigin = [ri, rj];

    out.wallCount = w.count(1) + w.count(2);
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        placedThree: number;
        sealRejected: boolean;
        sealedCount: number;
        doorAccepted: boolean;
        maskOfLeft: number;
        runMasks: number[];
        runOrigin: number[];
        wallCount: number;
      };

  if (!wallCheck.ok) {
    record('벽 배치', 'fail', wallCheck.reason);
  } else {
    record('벽 3장 배치', wallCheck.placedThree === 3 ? 'pass' : 'fail', `${wallCheck.placedThree}/3`);
    record(
      '밀폐 차단 — 가두는 마지막 벽은 거절된다',
      wallCheck.sealRejected ? 'pass' : 'fail',
      `갇히는 칸 ${wallCheck.sealedCount}`,
    );
    record('같은 자리를 문으로는 놓을 수 있다', wallCheck.doorAccepted ? 'pass' : 'fail');
    record('벽 그림이 화면에 올라간다', wallCheck.wallCount >= 4 ? 'pass' : 'fail', `${wallCheck.wallCount}장`);
    record(
      '이어 붙인 벽의 마스크가 0 이 아니다 — 0 이면 끝단 모양으로 끊겨 보인다',
      wallCheck.runMasks.some((m) => m !== 0) ? 'pass' : 'fail',
      `런 마스크 ${wallCheck.runMasks.join(',')}`,
    );
  }

  // 카메라를 벽 쪽으로 옮겨 눈으로 볼 수 있게 찍는다
  // 벽 런이 있는 곳으로 카메라를 옮겨 눈으로 볼 수 있게 한다
  if (wallCheck.ok) {
    const [ri, rj] = wallCheck.runOrigin;
    await page.evaluate(`window.__kairo.scene.focusTile(${ri ?? 0}, ${rj ?? 0})`);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${SHOT_DIR}/kairo-walls.png` });

  // ── 7d. 스티플 유리가 실제로 구멍을 남기나 — 결정 19 의 근거 ──
  //
  // 불투명 벽은 한 타일 뒤 손님을 100% 가린다(벽 40텍셀 vs 한 걸음 8텍셀). 그래서 벽을
  // 전부 유리로 만들었다. 검사는 **합성된 화면이 아니라 스프라이트 알파**를 직접 본다 —
  // 화면에서 재려 했더니 옆 벽의 뚜껑이 그 자리를 덮어 엉뚱한 색이 나왔다.
  const stipple = (await page.evaluate(`(() => {
    const prov = window.__kairo.provider;
    const src = prov.get('wall/glass:a5'); // 직선 벽 (I 축 양쪽 이웃)
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const alphaAt = (x, y) => d[(y * cv.width + x) * 4 + 3];
    const H = cv.height, W = cv.width;
    // 스프라이트 32×40: 뚜껑 0..15 · 압출 16..39 (그 중 아래 6px 은 기단)
    let paneOpaque = 0, paneClear = 0;
    for (let y = 18; y < H - 8; y++) {
      for (let x = 10; x < W - 10; x++) {
        if (x >= W / 2 - 1 && x <= W / 2) continue; // 멀리온은 불투명이 정상
        if (alphaAt(x, y) > 8) paneOpaque++; else paneClear++;
      }
    }
    // 기단은 전부 불투명이어야 한다 (밑동이 뚫리면 접지가 이상해진다)
    let plinthClear = 0, plinthTotal = 0;
    for (let y = H - 6; y < H - 1; y++) {
      for (let x = 12; x < W - 12; x++) {
        plinthTotal++;
        if (alphaAt(x, y) <= 8) plinthClear++;
      }
    }
    return { W: W, H: H, paneOpaque: paneOpaque, paneClear: paneClear,
             plinthClear: plinthClear, plinthTotal: plinthTotal };
  })()`)) as {
    W: number;
    H: number;
    paneOpaque: number;
    paneClear: number;
    plinthClear: number;
    plinthTotal: number;
  };

  const clearRatio = stipple.paneClear / (stipple.paneClear + stipple.paneOpaque);
  record(
    '벽 캔버스가 32×40 이다',
    stipple.W === 32 && stipple.H === 40 ? 'pass' : 'fail',
    `${stipple.W}×${stipple.H}`,
  );
  record(
    '유리 패널이 스티플로 뚫려 있다 (투과율 30~70%)',
    clearRatio > 0.3 && clearRatio < 0.7 ? 'pass' : 'fail',
    `투과 ${(clearRatio * 100).toFixed(0)}% (뚫림 ${stipple.paneClear} / 불투명 ${stipple.paneOpaque})`,
  );
  record(
    '기단은 불투명하다 — 밑동이 뚫리면 접지가 이상해진다',
    stipple.plinthClear === 0 ? 'pass' : 'fail',
    `뚫린 픽셀 ${stipple.plinthClear}/${stipple.plinthTotal}`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-glass.png` });

  // ── 7e. 시설 배치·다중칸 슬롯 ──
  const fac = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    const gate = { i: 0, j: 0 };
    const out = { picker: 0, placed: [], rejected: [], anchors: [] };

    const sel = document.getElementById('kairo-facility');
    out.picker = sel ? sel.querySelectorAll('option').length : 0;

    // 넓은 육지를 찾는다
    let base = null;
    for (let j = 4; j < 16 && !base; j++) {
      for (let i = 4; i < 28; i++) {
        let ok = true;
        for (let di = 0; di < 9 && ok; di++)
          for (let dj = 0; dj < 7; dj++)
            if (!t.isWalkable(i + di, j + dj) || w.has(i + di, j + dj) || p.handleAt(i + di, j + dj)) {
              ok = false; break;
            }
        if (ok) { base = [i, j]; break; }
      }
    }
    if (!base) return { ok: false, reason: '9×7 빈 육지를 못 찾았다' };
    const [bi, bj] = base;

    // 비정사각 포함 4종 — 앵커 계산이 틀리면 여기서 드러난다
    const trials = [
      ['shop', 0, 0],            // 2×2
      ['cafe', 3, 0],            // 2×3
      ['pyeongsang_row', 0, 4],  // 4×1  ← 비정사각
      ['lookout', 6, 4],         // 2×2
    ];
    for (const [id, di, dj] of trials) {
      const r = p.place(t, w, gate, id, bi + di, bj + dj);
      if (r.ok && r.placed) {
        sc.refreshFacility(r.placed.handle);
        out.placed.push(id);
      } else {
        out.rejected.push(id + ':' + r.fail);
      }
    }

    // 벽부착 시설 — 벽 없이 거절되고 벽을 세우면 통과해야 한다
    const wi = bi, wj = bj + 6;
    const before = p.check(t, w, gate, 'locker_row', wi, wj);
    for (let k = 0; k < 4; k++) h.sim.placeWall(t, w, gate, wi + k, wj - 1, 1);
    for (let k = 0; k < 4; k++) sc.refreshWall(wi + k, wj - 1);
    const after = p.check(t, w, gate, 'locker_row', wi, wj);
    out.wallMountBefore = before.fail || 'ok';
    out.wallMountAfter = after.fail || 'ok';
    if (after.ok) {
      const r = p.place(t, w, gate, 'locker_row', wi, wj);
      if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); out.placed.push('locker_row'); }
    }

    out.count = p.count;
    out.capacity = p.totalCapacity();
    out.focus = [bi + 3, bj + 3];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        picker: number;
        placed: string[];
        rejected: string[];
        wallMountBefore: string;
        wallMountAfter: string;
        count: number;
        capacity: number;
        focus: number[];
      };

  if (!fac.ok) {
    record('시설 배치', 'fail', fac.reason);
  } else {
    record('시설 선택기에 73종', fac.picker === 73 ? 'pass' : 'fail', `${fac.picker}개`);
    record(
      '시설 4종 배치 (비정사각 4×1 포함)',
      fac.placed.length >= 4 ? 'pass' : 'fail',
      `놓임 ${fac.placed.join(',')}${fac.rejected.length ? ' · 거절 ' + fac.rejected.join(',') : ''}`,
    );
    record(
      '벽부착 시설 — 벽 없이 거절 → 벽 세우면 통과',
      fac.wallMountBefore === 'needs-wall' && fac.wallMountAfter === 'ok' ? 'pass' : 'fail',
      `${fac.wallMountBefore} → ${fac.wallMountAfter}`,
    );
    record('총 동시 이용 칸 수 > 0', fac.capacity > 0 ? 'pass' : 'fail', `${fac.capacity}칸`);

    // ★ 앵커 좌표를 수치로 검증 — 적대적 리뷰 A2 가 지목한 지점.
    //   앵커 x 는 발자국 bbox 가로중심이고 최하단 꼭지점 x 가 아니다. 비정사각에서
    //   두 값이 최대 24텍셀 어긋나므로, 잘못 쓰면 4×1 시설이 1.5타일 밀린다.
    const anchors = (await page.evaluate(`(() => {
      const h = window.__kairo, sc = h.scene, p = h.placement;
      const out = [];
      for (const f of p.all()) {
        const def = h.simDefs[f.defId];
        const w = def.size[0], d = def.size[1];
        // 기대값: x = 16(i−j) + 16(w−d)/2 · y = 8(i+j+w+d)
        const wantX = 16 * (f.i - f.j) + (16 * (w - d)) / 2;
        const wantY = 8 * (f.i + f.j + w + d);
        const img = sc.facilityImageAt(f.handle);
        out.push({
          id: f.defId, wh: [w, d],
          gotX: img ? img.x : null, gotY: img ? img.y : null,
          wantX: wantX, wantY: wantY,
          originX: img ? img.originX : null, originY: img ? img.originY : null,
          // 최하단 꼭지점 x (틀린 정의) — 비정사각이면 gotX 와 달라야 한다
          frontVertexX: 16 * (f.i - f.j + w - d),
        });
      }
      return out;
    })()`)) as {
      id: string;
      wh: number[];
      gotX: number | null;
      gotY: number | null;
      wantX: number;
      wantY: number;
      originX: number | null;
      originY: number | null;
      frontVertexX: number;
    }[];

    const wrong = anchors.filter((a) => a.gotX !== a.wantX || a.gotY !== a.wantY);
    record(
      '시설 앵커가 (bbox 가로중심, 최하단 꼭지점 y) 와 정확히 일치',
      wrong.length === 0 ? 'pass' : 'fail',
      wrong.length
        ? wrong.map((a) => `${a.id} got(${a.gotX},${a.gotY}) want(${a.wantX},${a.wantY})`).join(' | ')
        : `${anchors.length}종 확인`,
    );
    const badOrigin = anchors.filter((a) => a.originX !== 0.5 || a.originY !== 1);
    record(
      '앵커 원점이 bottom-center',
      badOrigin.length === 0 ? 'pass' : 'fail',
      badOrigin.length ? badOrigin.map((a) => a.id).join(',') : '',
    );
    // 비정사각 시설에서 두 정의가 실제로 어긋나는지 — 어긋나지 않으면 검사가 무의미하다
    const nonSquare = anchors.filter((a) => a.wh[0] !== a.wh[1]);
    const diverges = nonSquare.filter((a) => a.frontVertexX !== a.wantX);
    record(
      '비정사각 시설에서 두 앵커 정의가 실제로 갈린다 (검사가 유의미한가)',
      nonSquare.length > 0 && diverges.length === nonSquare.length ? 'pass' : 'fail',
      nonSquare.length
        ? nonSquare
            .map((a) => `${a.id} ${a.wh.join('×')}: 중심 ${a.wantX} vs 꼭지점 ${a.frontVertexX}`)
            .join(' | ')
        : '비정사각 시설이 없다',
    );

    await page.evaluate(`window.__kairo.scene.focusTile(${fac.focus[0]}, ${fac.focus[1]})`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOT_DIR}/kairo-facilities.png` });
  }

  // ── 7f. 손님 — 걷고, 칸을 채우고, 표정·이모트가 뜬다 ──
  const guests = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    // 게이트 근처 육지에 시설 몇 개를 놓아 손님이 갈 곳을 만든다
    const gate = h.gate;
    // 게이트 근처 빈 자리를 실제로 찾아 놓는다 — 앞 블록이 이미 놓은 시설과 겹치면 안 된다
    let placed = 0;
    for (let j = 1; j < 12 && placed < 3; j++) {
      for (let i = 1; i < 12 && placed < 3; i++) {
        const r = p.place(t, w, gate, 'shop', i, j);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); placed++; }
      }
    }
    g.invalidate();
    return { placed: placed, total: p.count, gate: gate };
  })()`)) as { placed: number; total: number; gate: { i: number; j: number } };

  record(
    '손님용 시설이 게이트 근처에 있다',
    guests.placed >= 2 ? 'pass' : 'fail',
    `새로 ${guests.placed}개 · 총 ${guests.total}개`,
  );

  // 시뮬이 돌 시간을 준다 (10Hz · 12tick 마다 입장 · 걸어가서 이용까지)
  await page.waitForTimeout(9000);

  const gstat = (await page.evaluate(`(() => {
    const h = window.__kairo, g = h.guests, sc = h.scene;
    const s = g.stats();
    const poses = {}, faces = {}, facings = {};
    let moving = 0;
    for (const x of g.all) {
      poses[x.pose] = (poses[x.pose] || 0) + 1;
      faces[x.face] = (faces[x.face] || 0) + 1;
      facings[x.facing] = (facings[x.facing] || 0) + 1;
      if (x.i !== h.gate.i || x.j !== h.gate.j) moving++;
    }
    // 시설 점유
    let occupied = 0, slots = 0;
    for (const f of h.placement.all()) {
      const occ = g.occupancy(f.handle);
      slots += occ.length;
      occupied += occ.filter((x) => x !== 0).length;
    }
    // 화면에 손님 그림이 올라갔나
    const views = sc.guestViewCount ? sc.guestViewCount() : -1;
    return { s: s, poses: poses, faces: faces, facings: facings, moving: moving,
             occupied: occupied, slots: slots, views: views };
  })()`)) as {
    s: { alive: number; walking: number; using: number; exited: number; exitSatisfaction: number; gaveUp: number };
    poses: Record<string, number>;
    faces: Record<string, number>;
    facings: Record<string, number>;
    moving: number;
    occupied: number;
    slots: number;
    views: number;
  };

  record('손님이 입장한다', gstat.s.alive > 0 ? 'pass' : 'fail', `${gstat.s.alive}명`);
  record(
    '손님이 게이트를 떠나 움직인다',
    gstat.moving > 0 ? 'pass' : 'fail',
    `${gstat.moving}/${gstat.s.alive}명 이동`,
  );
  record(
    '손님 그림이 화면에 올라간다 (몸통+표정+이모트)',
    gstat.views === gstat.s.alive ? 'pass' : 'fail',
    `그림 ${gstat.views} vs 손님 ${gstat.s.alive}`,
  );
  record(
    '시설 칸이 채워진다 — 칸마다 손님이 보이는 게 카이로의 핵심',
    gstat.occupied > 0 ? 'pass' : 'fail',
    `${gstat.occupied}/${gstat.slots}칸`,
  );
  record(
    '이용 중인 손님이 있다 — 걷기만 하면 시설이 작동하지 않는 것이다',
    gstat.s.using > 0 ? 'pass' : 'fail',
    `이용 ${gstat.s.using} · 걷기 ${gstat.s.walking} · 포즈 ${JSON.stringify(gstat.poses)}`,
  );
  // 퇴장까지는 한 방문에 240tick(24초) 이 걸린다. 실시간으로 기다리는 대신 시뮬을
  // 직접 돌린다 — 같은 코드 경로이고 결정론이라 결과가 같다.
  const exitStat = (await page.evaluate(`(() => {
    const h = window.__kairo, g = h.guests;
    const rng = new h.Rng(4242);
    for (let k = 0; k < 900; k++) {
      if (k % 12 === 0) g.spawn(rng);
      g.tick(rng);
    }
    return g.stats();
  })()`)) as {
    alive: number;
    exited: number;
    exitSatisfaction: number;
    gaveUp: number;
    using: number;
  };

  record(
    '퇴장 만족도가 쌓인다 — 평판의 기반은 퇴장 만족도다',
    exitStat.exited > 0 ? 'pass' : 'fail',
    `퇴장 ${exitStat.exited}명 · 만족 ${exitStat.exitSatisfaction.toFixed(0)} · 포기 ${exitStat.gaveUp}`,
  );
  record(
    '시설이 있으면 포기하는 손님이 적다',
    exitStat.exited > 0 && exitStat.gaveUp / exitStat.exited < 0.5 ? 'pass' : 'fail',
    `포기율 ${exitStat.exited ? ((exitStat.gaveUp / exitStat.exited) * 100).toFixed(0) : '?'}%`,
  );
  record(
    '방향이 이동에 따라 갈린다',
    Object.keys(gstat.facings).length >= 2 ? 'pass' : 'fail',
    JSON.stringify(gstat.facings),
  );
  record('표정이 만족도에서 파생된다', Object.keys(gstat.faces).length >= 1 ? 'pass' : 'fail', JSON.stringify(gstat.faces));

  await page.evaluate(`window.__kairo.scene.focusTile(5, 5)`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT_DIR}/kairo-guests.png` });

  // ── 7g. 결정 19 를 끝까지 — 유리벽 뒤의 무언가가 실제로 보이나 ──
  //
  // 스프라이트 알파가 50% 뚫린 것은 확인했다. 화면에서도 뒤가 비치는지는 별개다.
  //
  // ⚠ 색을 짚어 세지 말 것. 유리 대역과 겹치는 부분은 손님의 **다리**(살색)이고
  //   주황 조끼는 벽의 불투명한 뚜껑에 가려진다 — "구명조끼 주황을 센다"로는 0 이 나온다
  //   (실측으로 세 번 헛짚었다). 대신 **손님이 있을 때와 없을 때 픽셀이 다른지**를 본다.
  //   색에 의존하지 않고 "뒤가 비친다"만 검사한다.
  const glassCheck = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    if (g.all.length < 2) return { ok: false, reason: '손님이 둘 미만' };

    // 벽 세울 자리 (자기와 뒤 칸이 비어 있는 육지)
    let spot = null;
    for (let j = 5; j < 24 && !spot; j++) {
      for (let i = 3; i < 30; i++) {
        if (!t.isWalkable(i, j) || !t.isWalkable(i, j - 1)) continue;
        if (w.has(i, j) || w.has(i, j - 1)) continue;
        if (p.handleAt(i, j) || p.handleAt(i, j - 1)) continue;
        spot = [i, j]; break;
      }
    }
    if (!spot) return { ok: false, reason: '자리를 못 찾았다' };
    const [i, j] = spot;
    const r = h.sim.placeWall(t, w, h.gate, i, j, 1);
    if (!r.ok) return { ok: false, reason: '벽 배치 실패: ' + r.reason };
    sc.refreshWall(i, j);
    sc.setUpscale(1);
    sc.focusTile(i, j);
    return { ok: true, tile: [i, j] };
  })()`)) as { ok: false; reason: string } | { ok: true; tile: number[] };

  if (!glassCheck.ok) {
    record('유리벽 뒤가 비친다', 'fail', glassCheck.reason);
  } else {
    const [wi, wj] = glassCheck.tile;
    /** 벽의 유리 대역 픽셀을 문자열로 뽑는다 */
    const sampleBand = `(() => {
      const sc = window.__kairo.scene;
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const H = c.height;
      const rect = sc.tileScreenRect(${wi}, ${wj});
      const x0 = rect.x, y0 = rect.y - 8, w = 32, hh = 16;
      const buf = new Uint8Array(w * hh * 4);
      gl.readPixels(x0, H - (y0 + hh), w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = '';
      for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
      return s;
    })()`;

    // ① 손님을 멀리 치워 놓고 (벽만) 찍는다
    const away = (await page.evaluate(`(() => {
      const g = window.__kairo.guests;
      for (const x of g.all) {
        x.i = 38; x.j = 30; x.fromI = 38; x.fromJ = 30; x.progress = 1;
        x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
      }
      return g.all.length;
    })()`)) as number;
    await page.waitForTimeout(250);
    const wallOnly = (await page.evaluate(sampleBand)) as string;

    // ② 손님을 벽 뒤 두 칸에 고정하고 다시 찍는다.
    //   아이소에서 벽 바로 뒤 칸은 화면 x 가 16텍셀 어긋나므로 양쪽을 덮는다
    await page.evaluate(`(() => {
      const g = window.__kairo.guests;
      const spots = [[${wi}, ${wj} - 1], [${wi} - 1, ${wj}]];
      for (let k = 0; k < 2 && k < g.all.length; k++) {
        const x = g.all[k], sp = spots[k];
        x.i = sp[0]; x.j = sp[1]; x.fromI = sp[0]; x.fromJ = sp[1]; x.progress = 1;
        x.pose = 'idle'; x.facing = '+Z';
        x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
      }
    })()`);
    await page.waitForTimeout(250);
    const withGuests = (await page.evaluate(sampleBand)) as string;

    const a = wallOnly.split(';');
    const b = withGuests.split(';');
    let diff = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) diff++;

    record(
      '유리벽 뒤가 실제로 비친다 — 결정 19 의 목적',
      diff > 0 ? 'pass' : 'fail',
      `유리 대역 ${a.length - 1}px 중 ${diff}px 가 손님 유무로 달라진다 (손님 ${away}명)`,
    );
    await page.screenshot({ path: `${SHOT_DIR}/kairo-through-glass.png` });
  }

  // ── 7h. 아쿠아파크 — 덱·부착·슬라이드 ──
  const aqua = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    const out = {};
    // 물가를 찾아 잔교를 낸다
    let pier = null;
    for (let i = 4; i < 34 && !pier; i++) {
      for (let j = 4; j < 30; j++) {
        if (t.isWalkable(i, j) && !t.isWalkable(i, j + 1) && !p.handleAt(i, j)) {
          pier = { i: i, j: j + 1 }; break;
        }
      }
    }
    if (!pier) return { ok: false, reason: '물가를 못 찾았다' };

    // 덱 없이 트램폴린 → 거절되어야 한다.
    // ⚠ 발자국 3×3 이 전부 물이어야 한다 — 육지에 걸치면 wrong-terrain 이 먼저 잡혀
    //   needs-deck 검사가 무의미해진다 (실측으로 겪었다)
    let wet = null;
    for (let j = pier.j; j < 28 && !wet; j++) {
      for (let i = 3; i < 34; i++) {
        let allWater = true;
        for (let di = 0; di < 3 && allWater; di++)
          for (let dj = 0; dj < 3; dj++)
            if (t.isWalkable(i + di, j + dj) || p.handleAt(i + di, j + dj)) { allWater = false; break; }
        if (allWater) { wet = [i, j]; break; }
      }
    }
    if (!wet) return { ok: false, reason: '물 3×3 을 못 찾았다' };
    const noDeck = p.check(t, w, h.gate, 'trampoline_w', wet[0], wet[1]);
    out.withoutDeck = noDeck.fail || 'ok';

    // 잔교 6칸
    let deck = 0;
    for (let k = 0; k < 6; k++) {
      const r = p.place(t, w, h.gate, 'float_deck', pier.i, pier.j + k);
      if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); deck++; }
    }
    out.deck = deck;

    // 덱 옆에 트램폴린 → 통과
    const withDeck = p.place(t, w, h.gate, 'trampoline_w', pier.i + 1, pier.j + 1);
    if (withDeck.ok && withDeck.placed) sc.refreshFacility(withDeck.placed.handle);
    out.withDeck = withDeck.fail || 'ok';

    // 슬라이드
    const slide = p.place(t, w, h.gate, 'slide_small', pier.i - 3, pier.j + 1);
    if (slide.ok && slide.placed) sc.refreshFacility(slide.placed.handle);
    out.slide = slide.fail || 'ok';

    // 덱 위를 밟을 수 있나
    out.deckWalkable = p.isWalkOn(pier.i, pier.j + 2) && !p.blocksWalk(pier.i, pier.j + 2);
    out.trampolineBlocks = p.blocksWalk(pier.i + 1, pier.j + 1);

    g.invalidate();
    out.pier = [pier.i, pier.j];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        withoutDeck: string;
        deck: number;
        withDeck: string;
        slide: string;
        deckWalkable: boolean;
        trampolineBlocks: boolean;
        pier: number[];
      };

  if (!aqua.ok) {
    record('아쿠아파크', 'fail', aqua.reason);
  } else {
    record(
      '덱 없이 인플레이터블은 거절 — 플로팅덱이 물 위 유일 기반',
      aqua.withoutDeck === 'needs-deck' ? 'pass' : 'fail',
      aqua.withoutDeck,
    );
    record('잔교를 6칸 뻗는다', aqua.deck === 6 ? 'pass' : 'fail', `${aqua.deck}칸`);
    record('덱 옆에는 놓인다', aqua.withDeck === 'ok' ? 'pass' : 'fail', aqua.withDeck);
    record('슬라이드도 놓인다', aqua.slide === 'ok' ? 'pass' : 'fail', aqua.slide);
    record(
      '덱은 밟히고 인플레이터블은 길을 막는다',
      aqua.deckWalkable && aqua.trampolineBlocks ? 'pass' : 'fail',
      `덱 통행 ${aqua.deckWalkable} · 트램폴린 차단 ${aqua.trampolineBlocks}`,
    );

    /**
     * 덱이 **물 위 시설로 가는 유일한 길**인지 직접 확인한다.
     * 손님 60명의 목적지 선택에 의존하면(가까운 곳이 빨리 비면 먼 시설을 안 간다)
     * 검사가 흔들린다 — 거리장을 직접 물어보는 게 주장에 맞는 검사다.
     */
    const reach = (await page.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
      // 물 3×3 을 찾아 그 옆에 잔교를 새로 낸다 (앞 블록과 안 겹치게)
      // ⚠ 물 블록이 육지에 바로 붙어 있으면 덱을 끊어도 육지에서 바로 닿아
      //   "덱이 유일한 길" 검사가 무의미해진다. **3칸 이상** 떨어진 곳을 고른다.
      let wet = null;
      for (let j = 8; j < 28 && !wet; j++) {
        for (let i = 6; i < 32; i++) {
          let ok = true;
          for (let di = 0; di < 3 && ok; di++)
            for (let dj = 0; dj < 3; dj++)
              if (t.isWalkable(i + di, j + dj) || p.handleAt(i + di, j + dj)) { ok = false; break; }
          if (!ok) continue;
          // 왼쪽 열을 따라 위로 올라가며 육지를 찾는다 — 물이 3칸 이상 이어져야 한다
          let shoreJ = -1, waterRun = 0;
          for (let k = j - 1; k >= 1; k--) {
            if (p.handleAt(i - 1, k)) { waterRun = -99; break; }
            if (t.isWalkable(i - 1, k)) { shoreJ = k; break; }
            waterRun++;
          }
          if (shoreJ >= 0 && waterRun >= 3) { wet = { i: i, j: j, shoreJ: shoreJ }; break; }
        }
      }
      if (!wet) return { ok: false, reason: '잔교 낼 물 블록을 못 찾았다' };

      // 덱 없이 먼저 트램폴린을 놓을 수 없다 → 덱을 깔고 놓는다
      const deckHandles = [];
      for (let k = wet.shoreJ + 1; k <= wet.j + 1; k++) {
        const r = p.place(t, w, h.gate, 'float_deck', wet.i - 1, k);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); deckHandles.push(r.placed.handle); }
      }
      const tr = p.place(t, w, h.gate, 'trampoline_w', wet.i, wet.j);
      if (!tr.ok) return { ok: false, reason: '트램폴린 배치 실패: ' + tr.fail };
      sc.refreshFacility(tr.placed.handle);
      g.invalidate();
      const withDeck = g.distanceTo(tr.placed.handle, h.gate.i, h.gate.j);

      // 덱을 하나 지우면 길이 끊겨야 한다 — 덱이 유일한 길이라는 증거
      // 잔교 중간을 끊는다 — 육지 쪽 첫 칸을 지우면 뒤가 전부 고립된다
      const cutJ = wet.shoreJ + 1;
      const cutHandle = p.handleAt(wet.i - 1, cutJ);
      p.remove(cutHandle);
      g.invalidate();
      const withoutDeck = g.distanceTo(tr.placed.handle, h.gate.i, h.gate.j);

      return { ok: true, withDeck: withDeck, withoutDeck: withoutDeck, decks: deckHandles.length };
    })()`)) as
      | { ok: false; reason: string }
      | { ok: true; withDeck: number; withoutDeck: number; decks: number };

    if (!reach.ok) {
      record('덱이 물 위 시설로 가는 유일한 길', 'fail', reach.reason);
    } else {
      record(
        '덱을 깔면 게이트에서 물 위 시설까지 길이 생긴다',
        reach.withDeck > 0 ? 'pass' : 'fail',
        `${reach.withDeck} 걸음 (덱 ${reach.decks}칸)`,
      );
      // 덱을 끊는 검사는 단위 테스트(aqua.test.ts)로 옮겼다 — 하네스는 앞 블록의 덱·시설이
      // 누적돼 다른 경로가 남고, 그걸 매번 배제하려면 검사가 세계를 통제해야 한다.
      record(
        '덱을 끊었을 때의 경로는 단위 테스트가 본다',
        'info',
        `하네스 측정값 ${reach.withoutDeck} (다른 잔교가 남아 있을 수 있다)`,
      );
    }

    // 슬라이드 탑승 — 손님이 실제로 타는지 (충분히 길게 돌린다)
    const ride = (await page.evaluate(`(() => {
      const h = window.__kairo, g = h.guests;
      const rng = new h.Rng(777);
      let sawRide = false, deckSteps = 0;
      for (let k = 0; k < 4000; k++) {
        if (k % 8 === 0) g.spawn(rng);
        g.tick(rng);
        for (const x of g.all) {
          if (x.pose === 'ride') sawRide = true;
          if (h.placement.isWalkOn(x.i, x.j)) deckSteps++;
        }
      }
      return { sawRide: sawRide, deckSteps: deckSteps, stats: g.stats() };
    })()`)) as { sawRide: boolean; deckSteps: number; stats: { exited: number; gaveUp: number } };

    record('손님이 덱을 밟는다', ride.deckSteps > 0 ? 'pass' : 'fail', `${ride.deckSteps} tick·명`);
    record('손님이 슬라이드를 탄다 (ride 포즈)', ride.sawRide ? 'pass' : 'fail');

    await page.evaluate(`window.__kairo.scene.focusTile(${aqua.pier[0]}, ${aqua.pier[1]! + 2})`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}/kairo-aqua.png` });
  }

  // ── 7i. 주 단위 루프·결산 ──
  const weekBtn = await page.$('#kairo-week');
  record('한 주 진행 버튼', weekBtn ? 'pass' : 'fail');

  const calc = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const t0 = performance.now();
    const rep = h.week.run(new h.Rng(555), { season: 'summer', playbackEvery: 6 });
    const ms = performance.now() - t0;
    return {
      ms: ms, week: rep.week, visitors: rep.visitors, revenue: rep.revenue,
      arrivals: rep.arrivals, turnedAway: rep.turnedAway,
      upkeep: rep.upkeep, profit: rep.profit, days: rep.days.length,
      frames: rep.playback.length, heatSum: rep.heat.reduce((a, b) => a + b, 0),
      hotspot: rep.hotspot, bottleneck: rep.bottleneck,
      weathers: rep.days.map((d) => d.weather),
      dayVisitors: rep.days.map((d) => d.visitors),
    };
  })()`)) as {
    ms: number;
    week: number;
    visitors: number;
    arrivals: number;
    turnedAway: number;
    revenue: number;
    upkeep: number;
    profit: number;
    days: number;
    frames: number;
    heatSum: number;
    hotspot: { i: number; j: number; value: number } | null;
    bottleneck: { need: string; supply: number } | null;
    weathers: string[];
    dayVisitors: number[];
  };

  record(
    '한 주 계산이 0.6초 안에 끝난다 — 주 단위 루프의 전제',
    calc.ms < 600 ? 'pass' : 'fail',
    `${calc.ms.toFixed(0)}ms`,
  );
  record('요일 7일', calc.days === 7 ? 'pass' : 'fail', calc.weathers.join(','));
  record('방문객·매출이 생긴다', calc.visitors > 0 && calc.revenue > 0 ? 'pass' : 'fail',
    `수요 ${calc.arrivals} · 입장 ${calc.visitors} · 만석 ${calc.turnedAway} · 매출 ${calc.revenue} · 손익 ${calc.profit}`);
  record(
    '수요 = 입장 + 만석 — 실패한 입장이 어디에도 안 남으면 주말이 한가해 보인다',
    calc.arrivals === calc.visitors + calc.turnedAway ? 'pass' : 'fail',
    `${calc.arrivals} = ${calc.visitors} + ${calc.turnedAway}`,
  );
  record('혼잡 히트맵이 쌓인다', calc.heatSum > 0 && calc.hotspot !== null ? 'pass' : 'fail',
    `합 ${calc.heatSum} · 최고점 (${calc.hotspot?.i},${calc.hotspot?.j})=${calc.hotspot?.value}`);
  record('병목을 알려준다 — 다음에 무엇을 지을까', calc.bottleneck !== null ? 'pass' : 'fail',
    calc.bottleneck ? `${calc.bottleneck.need} 공급 ${calc.bottleneck.supply}` : '');
  record(
    '압축 연출용 프레임이 기록된다 — 계산이 빠른 것과 안 보여주는 것은 다르다',
    calc.frames > 100 ? 'pass' : 'fail',
    `${calc.frames} 프레임`,
  );

  /*
   * 압축 연출 → 결산 화면.
   *
   * ⚠ `runWeek()` 은 이제 **카드를 먼저 띄운다** (§3.5). 카드를 안 고르고 재생을 기다리면
   * 영원히 안 온다 — 실제로 이 검사가 그렇게 멈췄다. 사람이 쓰는 경로와 같은 `pickForTest`
   * 로 카드를 넘긴다.
   */
  await page.evaluate(`window.__kairo.runWeek()`);
  await page.waitForTimeout(200);
  await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    let guard = 0;
    /*
     * ⚠ 0번을 무조건 고르면 안 된다. 방송 촬영 카드의 0번은 **그 주 폐쇄**라
     * 손님 0명인 주가 되고, 뒤따르는 결산 검사가 "구성이 안 보인다"로 실패한다
     * (실측). 폐쇄가 없는 선택지를 고른다.
     */
    while (cv && cv.visible && guard++ < 5) {
      const card = cv.currentCard;
      let pick = 0;
      if (card) {
        for (let oi = 0; oi < card.options.length; oi++) {
          const closes = card.options[oi].effects.some((e) => e.closed);
          if (!closes) { pick = oi; break; }
        }
      }
      cv.pickForTest(pick);
    }
  })()`);
  await page.waitForTimeout(600);
  const playing = (await page.evaluate(`window.__kairo.scene.isPlaying`)) as boolean;
  record('연출이 재생된다 (3.5초)', playing ? 'pass' : 'fail');
  await page.screenshot({ path: `${SHOT_DIR}/kairo-playback.png` });

  await page.waitForFunction(
    `(() => { const r = document.getElementById('kairo-report'); return !!r && !r.hidden; })()`,
    undefined,
    { timeout: 8000 },
  );
  // waitForFunction 이 시간 초과로 던지므로 여기 도달했다는 것 자체가 통과다
  record('연출이 끝나면 결산이 뜬다', 'pass');

  /*
   * ⚠ 두 가지를 조심해야 한다.
   *
   * ① "막대가 있나"만 보면 안 된다 — 그 주 입장이 0명이면 막대는 정상적으로 "손님 없음"
   *    을 띄우고 검사는 그 분기로 통과한다. **결산의 실제 숫자와 맞춘다**:
   *    유형 합 = 입장 수가 진짜 불변식이다.
   * ② 이 시점의 공원은 앞 검사들이 주를 여러 번 돌려 **상한까지 차 있다.** 그리고
   *    `runWeek()` 은 내부에서 등급 기준으로 상한을 다시 정하므로 밖에서 올려도 덮인다.
   *    그래서 이 검사는 **자기 결산을 직접 만든다** — 상한을 올리고 한 주를 돌려
   *    게임과 같은 `report.show` 로 띄운다.
   */
  const compo = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.guests.setMaxGuests(240);
    const rep = h.week.run(new h.Rng(4242), { season: 'summer', playbackEvery: 0 });
    h.report.show(rep, { onClose: function () { return undefined; } });
    const r = document.getElementById('kairo-report');
    if (!r) return { found: false };
    const segs = [...r.querySelectorAll('div[data-group]')];
    const sum = ['family', 'couple', 'friends', 'company'].reduce(
      (a, k) => a + (rep.byGroup[k] || 0), 0,
    );
    return {
      found: true,
      segs: segs.length,
      titles: segs.map((d) => d.title),
      label: r.textContent.indexOf('손님 구성') >= 0,
      visitors: rep.visitors,
      sum: sum,
    };
  })()`)) as {
    found: boolean;
    segs?: number;
    titles?: string[];
    label?: boolean;
    visitors?: number;
    sum?: number;
  };

  const visitors = compo.visitors ?? 0;
  const compoOk =
    compo.found === true &&
    compo.label === true &&
    compo.sum === visitors &&
    visitors > 0 &&
    (compo.segs ?? 0) >= 2;

  record(
    '결산에 손님 구성이 보인다 — 유형 합이 입장 수와 같아야 한다',
    compoOk ? 'pass' : 'fail',
    visitors === 0
      ? '입장 0명 — 상한을 올렸는데도 안 들어왔다면 배치·도달을 볼 것'
      : `${(compo.titles ?? []).join(' · ')} · 합 ${compo.sum} = 입장 ${visitors}`,
  );

  const rep = (await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    const canvas = r.querySelector('canvas');
    // ★ title 로 세면 손님 구성 막대까지 섞인다 — 요일 막대만 data-day 로 고른다
    //   (이 블록은 템플릿 리터럴 안이라 백틱을 쓸 수 없다)
    const bars = r.querySelectorAll('div[data-day]');
    return {
      hasHeat: !!canvas, heatW: canvas ? canvas.width : 0,
      bars: bars.length,
      text: r.textContent.slice(0, 200),
      closeMinH: (() => {
        const b = document.getElementById('kairo-report-close');
        return b ? Math.round(b.getBoundingClientRect().height) : 0;
      })(),
      order: [...r.children].map((c) => c.tagName).join(','),
    };
  })()`)) as {
    hasHeat: boolean;
    heatW: number;
    bars: number;
    text: string;
    closeMinH: number;
    order: string;
  };

  record('결산에 혼잡 히트맵이 있다', rep.hasHeat ? 'pass' : 'fail', `${rep.heatW}px`);
  record('요일 막대 7개', rep.bars === 7 ? 'pass' : 'fail', `${rep.bars}개`);
  record(
    '히트맵이 숫자보다 먼저 온다 — 숫자 표만이면 엑셀 게임이 된다',
    rep.order.indexOf('CANVAS') > 0 && rep.order.indexOf('CANVAS') < rep.order.lastIndexOf('DIV')
      ? 'pass'
      : 'fail',
    rep.order,
  );
  record('닫기 버튼 터치 타깃 44px 이상', rep.closeMinH >= 44 ? 'pass' : 'fail', `${rep.closeMinH}px`);
  await page.screenshot({ path: `${SHOT_DIR}/kairo-report.png` });

  await page.click('#kairo-report-close');
  await page.waitForTimeout(200);
  const closed = (await page.evaluate(
    `document.getElementById('kairo-report').hidden`,
  )) as boolean;
  record('결산을 닫으면 게임으로 돌아온다', closed ? 'pass' : 'fail');

  // ── 7j. 콤보·해금·의뢰 ──
  const prog = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    const out = {};

    // 의뢰 패널이 상시 보인다
    const panel = document.getElementById('kairo-quests');
    out.panel = !!panel;
    out.panelText = panel ? panel.textContent.slice(0, 60) : '';

    const st = h.quests.questStatuses(p, h.getLastReport());
    out.quests = st.length;
    out.detailsFilled = st.every((s) => s.detail && s.detail.length > 0);
    out.progressInRange = st.every((s) => s.progress >= 0 && s.progress <= 1);

    // 해금 — 시작 등급에서 큰 시설은 막힌다
    const g0 = h.quests.gradeFor(0);
    out.startGrade = g0.grade;
    out.needTurtle = h.quests.requiredGrade('turtle_island');
    out.needShop = h.quests.requiredGrade('shop');

    // 콤보 미리보기 — 붙여 놓으면 터질 것을 미리 안다
    let spot = null;
    for (let j = 3; j < 18 && !spot; j++) {
      for (let i = 3; i < 26; i++) {
        let ok = true;
        for (let di = 0; di < 8 && ok; di++)
          for (let dj = 0; dj < 6; dj++)
            if (!t.isWalkable(i + di, j + dj) || w.has(i + di, j + dj) || p.handleAt(i + di, j + dj)) {
              ok = false; break;
            }
        if (ok) { spot = [i, j]; break; }
      }
    }
    if (!spot) return { ok: false, reason: '빈 육지를 못 찾았다' };
    const [bi, bj] = spot;

    const shop = p.place(t, w, h.gate, 'shop', bi, bj);
    if (shop.ok && shop.placed) sc.refreshFacility(shop.placed.handle);
    // 평상을 붙이면 '매점 앞 평상' 소형 콤보가 터져야 한다
    const far = h.combos.previewCombos(p, 'pyeongsang_row', bi + 20, bj);
    const near = h.combos.previewCombos(p, 'pyeongsang_row', bi, bj + 3);
    out.previewFar = far.gained.length;
    out.previewNear = near.gained.map((c) => c.id);
    out.previewNearSat = near.satisfaction;

    // 실제로 놓으면 발동한다
    const py = p.place(t, w, h.gate, 'pyeongsang_row', bi, bj + 3);
    if (py.ok && py.placed) sc.refreshFacility(py.placed.handle);
    out.active = h.combos.evaluateCombos(p).active.map((c) => c.id);

    // 보상은 한 번만
    const first = h.progress.claim(h.quests.questStatuses(p, h.getLastReport()));
    const second = h.progress.claim(h.quests.questStatuses(p, h.getLastReport()));
    out.claimFirst = first.cash;
    out.claimSecond = second.cash;

    h.guests.invalidate();
    h.refreshQuests();
    out.focus = [bi + 1, bj + 2];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        panel: boolean;
        panelText: string;
        quests: number;
        detailsFilled: boolean;
        progressInRange: boolean;
        startGrade: number;
        needTurtle: number;
        needShop: number;
        previewFar: number;
        previewNear: string[];
        previewNearSat: number;
        active: string[];
        claimFirst: number;
        claimSecond: number;
        focus: number[];
      };

  if (!prog.ok) {
    record('콤보·의뢰', 'fail', prog.reason);
  } else {
    record('의뢰 패널이 상시 보인다', prog.panel ? 'pass' : 'fail', prog.panelText.replace(/\s+/g, ' '));
    record('의뢰 16종', prog.quests === 16 ? 'pass' : 'fail', `${prog.quests}종`);
    record(
      '의뢰마다 "얼마나 남았나"가 있다 — 조건 미달이 곧 다음 목표다',
      prog.detailsFilled && prog.progressInRange ? 'pass' : 'fail',
    );
    record(
      '해금 — 시작 1등급, 거북섬은 5등급',
      prog.startGrade === 1 && prog.needTurtle === 5 && prog.needShop === 1 ? 'pass' : 'fail',
      `시작 ${prog.startGrade}등급 · 거북섬 ${prog.needTurtle} · 매점 ${prog.needShop}`,
    );
    record(
      '콤보 미리보기 — 붙이면 터지고 멀면 안 터진다',
      prog.previewFar === 0 && prog.previewNear.length > 0 ? 'pass' : 'fail',
      `멀리 ${prog.previewFar}개 · 가까이 ${prog.previewNear.join(',')} (+만족 ${prog.previewNearSat})`,
    );
    record(
      '실제로 놓으면 미리보기대로 발동한다',
      prog.active.includes('small_shop_pyeongsang') ? 'pass' : 'fail',
      prog.active.join(','),
    );
    record(
      '의뢰 보상은 한 번만 — 반복 지급은 무한 수입이다',
      prog.claimSecond === 0 ? 'pass' : 'fail',
      `1회 ${prog.claimFirst} · 2회 ${prog.claimSecond}`,
    );

    await page.evaluate(`window.__kairo.scene.focusTile(${prog.focus[0]}, ${prog.focus[1]})`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}/kairo-combos.png` });
  }

  // ── 7k. 위험도 상시 표시 ──
  const risk = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    const box = document.getElementById('kairo-risk');
    const before = h.risk.assessRisk(p, h.guests);

    // 스릴 시설을 늘려 위험도를 올린다 — 물가에 잔교를 내고 인플레이터블을 붙인다
    let pier = null;
    for (let i = 4; i < 34 && !pier; i++) {
      for (let j = 4; j < 30; j++) {
        if (t.isWalkable(i, j) && !t.isWalkable(i, j + 1) && !p.handleAt(i, j)) {
          pier = { i: i, j: j + 1 }; break;
        }
      }
    }
    if (pier) {
      for (let k = 0; k < 6; k++) {
        const r = p.place(t, w, h.gate, 'float_deck', pier.i, pier.j + k);
        if (r.ok && r.placed) sc.refreshFacility(r.placed.handle);
      }
      for (const d of [1, 3]) {
        const r = p.place(t, w, h.gate, 'trampoline_w', pier.i + 1, pier.j + d);
        if (r.ok && r.placed) sc.refreshFacility(r.placed.handle);
      }
    }
    h.refreshRisk();
    const risky = h.risk.assessRisk(p, h.guests);
    const text = box ? box.textContent : '';

    // 안전 시설을 지어 내린다
    let built = 0;
    for (let i = 2; i < 30 && built < risky.safetyNeeded + 3; i++) {
      const r = p.place(t, w, h.gate, 'lifering', i, 3);
      if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); built++; }
    }
    h.refreshRisk();
    const safer = h.risk.assessRisk(p, h.guests);

    return {
      hasBox: !!box,
      text: text,
      beforeLevel: before.level,
      riskyLevel: risky.level,
      riskyRatio: risky.ratio,
      safetyNeeded: risky.safetyNeeded,
      built: built,
      saferLevel: safer.level,
      saferRatio: safer.ratio,
      accidentAtSafe: h.risk.assessRisk(p, h.guests).level === 'safe',
    };
  })()`)) as {
    hasBox: boolean;
    text: string;
    beforeLevel: string;
    riskyLevel: string;
    riskyRatio: number;
    safetyNeeded: number;
    built: number;
    saferLevel: string;
    saferRatio: number;
  };

  record('위험도가 화면에 상시 표시된다', risk.hasBox ? 'pass' : 'fail', risk.text.replace(/\n/g, ' / '));
  record(
    '스릴 시설을 늘리면 위험도가 올라간다',
    risk.riskyRatio > 0 ? 'pass' : 'fail',
    `${risk.beforeLevel} → ${risk.riskyLevel} (비율 ${(risk.riskyRatio * 100).toFixed(0)}%)`,
  );
  record(
    '안전 시설이 몇 개 더 필요한지 알려준다 — 그게 다음 목표다',
    risk.safetyNeeded >= 0 ? 'pass' : 'fail',
    `${risk.safetyNeeded}개 필요 · ${risk.built}개 지음`,
  );
  record(
    '안전 시설을 지으면 위험도가 내려간다 — 구명함을 왜 짓나에 대한 답',
    risk.saferRatio < risk.riskyRatio ? 'pass' : 'fail',
    `${(risk.riskyRatio * 100).toFixed(0)}% → ${(risk.saferRatio * 100).toFixed(0)}% (${risk.riskyLevel} → ${risk.saferLevel})`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-risk.png` });

  // ── 8. FPS ──
  await page.waitForTimeout(1200);
  const dbg4 = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  const fps = Number(/FPS (\d+)/.exec(dbg4)?.[1] ?? 0);
  record('FPS ≥ 30', fps >= 30 ? 'pass' : 'fail', `${fps}`);

  /*
   * ── 9. 세이브·건설비 ──
   *
   * K12/K13 에서 들어온 것. **새로고침을 넘는지**를 브라우저에서 직접 본다 —
   * 단위 테스트는 왕복만 보고, localStorage 가 실제로 써지는지는 못 본다.
   *
   * ⚠ 현금은 디버그 박스에서 읽는다 (만 단위 반올림). 배치가 실제로 돈을 쓰는지만
   * 보면 되므로 정밀도는 충분하고, 내부 상태를 창에 새로 노출하지 않는다.
   */
  const cashOf = async (): Promise<number> => {
    const t = (await page.evaluate(
      `document.getElementById('kairo-debug').textContent`,
    )) as string;
    return Number(/현금 (\d+)만/.exec(t)?.[1] ?? -1);
  };

  /*
   * ── 8b. 주간 의사결정 카드 ──
   *
   * 카드는 **루프를 지탱하는 장치**다 (§3.5) — 시설을 20개쯤 지으면 할 게 없어지고
   * `한 주 진행` 이 스킵 버튼이 되는 것을 막는다. 그래서 "sim 에 있다"로는 부족하고,
   * **버튼을 눌렀을 때 실제로 화면에 뜨는지**를 봐야 한다.
   */
  const cardFlow = (await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    const btn = document.getElementById('kairo-week');
    if (!cv || !btn) return { ok: false, why: '카드 뷰 또는 주 진행 버튼이 없다' };
    const cashBefore = window.__kairo.week.cash;
    btn.click();
    const root = document.getElementById('kairo-card');
    const shown = !!root && getComputedStyle(root).display !== 'none';
    if (!shown) {
      // 그 주에 카드가 0장일 수 있다 (봄·가을·겨울). 여름 기본이라 보통은 뜬다
      return { ok: true, shown: false, cashBefore: cashBefore, remaining: cv.remaining };
    }
    const btns = [...root.querySelectorAll('button')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const labels = btns.map((b) => b.textContent.slice(0, 24));
    return {
      ok: true, shown: true, cashBefore: cashBefore,
      options: btns.length, minHeight: Math.min.apply(null, heights),
      labels: labels, remaining: cv.remaining,
      title: (root.querySelector('div > div:nth-child(2)') || {}).textContent || ''
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    shown?: boolean;
    options?: number;
    minHeight?: number;
    labels?: string[];
    remaining?: number;
    cashBefore?: number;
    title?: string;
  };

  /*
   * ── 8a. 손님 그룹 유형 (§10.4) ──
   *
   * 유형이 **결과를 바꾸는지**를 본다. 이름표뿐이면 넣은 의미가 없다.
   */
  const groups = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const st = h.guests.stats();
    const parties = {};
    const kinds = {};
    for (const g of h.guests.all) {
      parties[g.party] = (parties[g.party] || 0) + 1;
      kinds[g.group] = (kinds[g.group] || 0) + 1;
      if (parties[g.party] > 1 && !kinds.__mixed) {
        // 같은 일행이 같은 유형인지 확인
      }
    }
    let sameKind = true;
    const partyKind = {};
    for (const g of h.guests.all) {
      if (partyKind[g.party] === undefined) partyKind[g.party] = g.group;
      else if (partyKind[g.party] !== g.group) sameKind = false;
    }
    const sizes = Object.keys(parties).map((k) => parties[k]);
    return {
      alive: st.alive,
      byGroup: st.byGroup,
      kinds: Object.keys(kinds).length,
      maxParty: sizes.length ? Math.max.apply(null, sizes) : 0,
      sameKind: sameKind,
      wallets: [...new Set(h.guests.all.map((g) => g.wallet))].sort()
    };
  })()`)) as {
    alive: number;
    byGroup: Record<string, number>;
    kinds: number;
    maxParty: number;
    sameKind: boolean;
    wallets: number[];
  };

  record(
    '손님이 여러 유형으로 들어온다 — 한 유형뿐이면 구성이 판단이 안 된다',
    groups.kinds >= 2 ? 'pass' : 'fail',
    Object.entries(groups.byGroup)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ') + ` (총 ${groups.alive}명)`,
  );
  record(
    '일행 단위로 들어온다 — 한 명씩 흩어지면 무리가 안 보인다',
    groups.maxParty >= 2 && groups.sameKind ? 'pass' : 'fail',
    `최대 일행 ${groups.maxParty}명 · 일행 내 유형 ${groups.sameKind ? '일치' : '불일치'}`,
  );
  record(
    '유형마다 지갑이 다르다 — 같으면 이름표일 뿐이다',
    groups.wallets.length >= 2 ? 'pass' : 'fail',
    `지갑 ${groups.wallets.join(', ')}`,
  );

  record(
    '한 주 진행을 누르면 의사결정 카드가 뜬다 — 없으면 그 버튼은 스킵 버튼이다',
    cardFlow.ok && cardFlow.shown === true ? 'pass' : 'fail',
    cardFlow.ok
      ? cardFlow.shown
        ? `"${cardFlow.title}" · 선택지 ${cardFlow.options}개 · 남은 ${cardFlow.remaining}장`
        : '이번 주 카드 0장 (계절에 따라 가능하지만 여름은 1~2장이어야 한다)'
      : (cardFlow.why ?? '실패'),
  );
  record(
    '선택지 버튼이 56px 이상 — 스펙이 정한 최소 터치 타깃',
    (cardFlow.minHeight ?? 0) >= 56 ? 'pass' : 'fail',
    `최소 ${cardFlow.minHeight ?? 0}px`,
  );
  record(
    '선택지가 2~3개다',
    (cardFlow.options ?? 0) >= 2 && (cardFlow.options ?? 0) <= 3 ? 'pass' : 'fail',
    `${cardFlow.options ?? 0}개`,
  );

  // 카드를 실제로 골라 흐름을 끝까지 태운다 — 사람이 쓰는 pick 과 같은 경로다
  const afterPick = (await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    let guard = 0;
    while (cv.visible && guard++ < 5) {
      const card = cv.currentCard;
      let pick = 0;
      if (card) {
        for (let oi = 0; oi < card.options.length; oi++) {
          if (!card.options[oi].effects.some((e) => e.closed)) { pick = oi; break; }
        }
      }
      cv.pickForTest(pick);
    }
    return { visible: cv.visible, cash: window.__kairo.week.cash, playing: window.__kairo.scene.isPlaying };
  })()`)) as { visible: boolean; cash: number; playing: boolean };

  record(
    '카드를 고르면 화면이 닫히고 그 주가 진행된다',
    !afterPick.visible ? 'pass' : 'fail',
    `현금 ${Math.round((cardFlow.cashBefore ?? 0) / 10000)}만 → ${Math.round(afterPick.cash / 10000)}만` +
      ` · 연출 ${afterPick.playing ? '재생 중' : '대기'}`,
  );

  // 연출이 끝날 때까지 기다렸다가 결산을 닫는다 (뒤 검사가 오버레이에 막히지 않게)
  await page.waitForTimeout(4200);
  await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    if (r) {
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.indexOf('닫') >= 0);
      if (close) close.click();
      else r.style.display = 'none';
    }
  })()`);
  await page.waitForTimeout(200);

  /*
   * 탭 → 타일 해석 회귀. **반드시 여러 타일로 본다** — 한 칸만 맞으면 우연이다.
   *
   * 실측 버그: 핸들러가 `world.y − TILE_H/2` 를 빼서 탭 지점이 격자 꼭지점(네 타일이
   * 만나는 점)으로 옮겨졌고, 반올림 하나로 타일이 뒤집혔다. 지면 칠하기로는 이웃 칸이
   * 칠해져도 티가 안 나서 오래 안 잡혔지만 2×2 시설은 곧바로 거절된다.
   *
   * ⚠ 탭 간격을 700ms 이상 둔다 — 300ms 안에 두 번이면 **더블탭 확대**가 발동해
   * 배율이 2 로 바뀌고, 그 뒤 좌표 환산이 전부 어긋난다 (실측으로 겪었다).
   */
  const TAP_CASES: [number, number][] = [
    [10, 10],
    [11, 9],
    [9, 11],
    [13, 13],
    [8, 14],
  ];
  const tapResults: string[] = [];
  await page.evaluate(`(() => {
    // 붓을 끄면 onTapTile 이 해석한 타일을 콘솔에 찍는다
    const bar = document.getElementById('kairo-brush');
    const cur = window.__kairoBrush ? window.__kairoBrush() : null;
    if (cur && bar) {
      const b = bar.querySelector('[data-kind="' + cur + '"]');
      if (b) b.click();
    }
  })()`);
  for (const [ti, tj] of TAP_CASES) {
    /*
     * 카메라를 그 타일에 맞춘다 — 안 맞추면 대부분이 화면 밖이라 검사가 한두 칸만 보고
     * 통과한다 (실측: 5칸 중 1칸만 화면 안). `focusTile` 은 도구용으로 열려 있다.
     */
    await page.evaluate(`window.__kairo.scene.focusTile(${ti}, ${tj})`);
    await page.waitForTimeout(120);
    const pt = (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const sx = cr.width / cv.width, sy = cr.height / cv.height;
      const r = h.scene.tileScreenRect(${ti}, ${tj});
      const x = cr.left + (r.x + 16) * sx, y = cr.top + (r.y + 8) * sy;
      return { x: Math.round(x), y: Math.round(y),
               inView: x > 30 && y > 130 && x < cr.width - 30 && y < cr.height - 170 };
    })()`)) as { x: number; y: number; inView: boolean };
    if (!pt.inView) {
      tapResults.push(`(${ti},${tj})화면밖`);
      continue;
    }
    tapLog.length = 0;
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(700);
    const got = /\((\d+), (\d+)\)/.exec(tapLog.join(' '));
    const ok = got && Number(got[1]) === ti && Number(got[2]) === tj;
    tapResults.push(`(${ti},${tj})${ok ? '✓' : `→${got ? got[0] : '?'}`}`);
  }
  record(
    '탭한 타일이 정확히 해석된다 — 반 타일 밀리면 2×2 배치가 거절된다',
    tapResults.length === TAP_CASES.length && tapResults.every((r) => r.endsWith('✓'))
      ? 'pass'
      : 'fail',
    tapResults.join(' '),
  );

  const cashBefore = await cashOf();

  /*
   * 배치는 **화면 탭**으로 한다 — 시뮬을 직접 부르면 건설비 경로를 안 타서
   * "공짜로 짓는다" 버그를 그대로 통과시킨다. 그게 K12 까지 실제로 있던 상태다.
   *
   * ⚠ 후보 타일마다 **카메라를 맞추고 탭 지점이 캔버스 위인지 확인**한다. 안 하면
   * 토스트·붓 바·의뢰 패널 같은 DIV 가 탭을 먹고 "배치가 안 된다"로 나온다 (실측).
   */
  const candidates = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const bar = document.getElementById('kairo-brush');
    const sel = document.getElementById('kairo-facility');
    const btn = bar ? bar.querySelector('[data-kind="facility"]') : null;
    if (!btn || !sel) return { ok: false, why: '시설 붓 또는 선택기를 못 찾았다', tiles: [] };
    sel.value = 'shop';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (!window.__kairoBrush || window.__kairoBrush() !== 'facility') btn.click();
    // shop 은 2×2 다 — **발자국 전체**가 비고 걸을 수 있어야 한다.
    // 앵커 칸만 보면 "다른 시설이 있습니다" 로 거절된다 (실측)
    const fits = (i, j) => {
      for (let dj = 0; dj < 2; dj++) {
        for (let di = 0; di < 2; di++) {
          if (h.placement.at(i + di, j + dj)) return false;
          if (!h.terrain.isWalkable(i + di, j + dj)) return false;
        }
      }
      return true;
    };
    const tiles = [];
    for (let j = 2; j < 30 && tiles.length < 8; j++) {
      for (let i = 2; i < 38 && tiles.length < 8; i++) {
        if (fits(i, j)) tiles.push([i, j]);
      }
    }
    return { ok: true, tiles: tiles, count: h.placement.count, brush: window.__kairoBrush ? window.__kairoBrush() : null };
  })()`)) as { ok: boolean; why?: string; tiles: [number, number][]; count?: number; brush?: string | null };

  let placedAt: [number, number] | null = null;
  let tapDetail = candidates.ok ? `붓 ${String(candidates.brush)}` : (candidates.why ?? '실패');
  const countBefore = candidates.count ?? 0;
  for (const [ti, tj] of candidates.tiles) {
    await page.evaluate(`window.__kairo.scene.focusTile(${ti}, ${tj})`);
    await page.waitForTimeout(120);
    const pt = (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const sx = cr.width / cv.width, sy = cr.height / cv.height;
      const r = h.scene.tileScreenRect(${ti}, ${tj});
      const x = Math.round(cr.left + (r.x + 16) * sx), y = Math.round(cr.top + (r.y + 8) * sy);
      const el = document.elementFromPoint(x, y);
      return { x: x, y: y, tag: el ? el.tagName : '(없음)' };
    })()`)) as { x: number; y: number; tag: string };
    if (pt.tag !== 'CANVAS') continue;
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(700); // 더블탭 확대를 피한다
    const now = (await page.evaluate(`window.__kairo.placement.count`)) as number;
    if (now > countBefore) {
      placedAt = [ti, tj];
      break;
    }
    const toast = (await page.evaluate(
      `(() => { const m = document.getElementById('kairo-toast'); return m && !m.hidden ? m.textContent : ''; })()`,
    )) as string;
    tapDetail += ` · (${ti},${tj}) 거절 "${toast}"`;
  }
  const cashAfter = await cashOf();
  const countAfter = (await page.evaluate(`window.__kairo.placement.count`)) as number;
  record(
    '화면을 탭해 시설을 놓는다',
    placedAt !== null ? 'pass' : 'fail',
    placedAt
      ? `(${placedAt[0]}, ${placedAt[1]}) 탭 → 시설 ${countBefore} → ${countAfter}`
      : tapDetail,
  );
  record(
    '시설을 놓으면 건설비가 실제로 나간다 — 봇만 돈을 쓰던 상태를 막는다',
    cashAfter < cashBefore ? 'pass' : 'fail',
    `현금 ${cashBefore}만 → ${cashAfter}만`,
  );

  const savedInfo = (await page.evaluate(`(() => {
    const raw = localStorage.getItem('ppaji.kairo.save.v1');
    if (!raw) return { bytes: 0, facilities: -1 };
    const s = JSON.parse(raw);
    const p = s.placement;
    const n = Array.isArray(p) ? p.length : Array.isArray(p.items) ? p.items.length : -1;
    return { bytes: raw.length, facilities: n, cash: s.week ? s.week.cash : -1 };
  })()`)) as { bytes: number; facilities: number; cash?: number };
  record(
    '세이브가 localStorage 에 써진다',
    savedInfo.bytes > 100 ? 'pass' : 'fail',
    `${(savedInfo.bytes / 1024).toFixed(1)}KB · 시설 ${savedInfo.facilities}개`,
  );

  // 새로고침 — 여기가 진짜 검사다. 왕복 단위 테스트로는 이걸 못 본다
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const afterReload = (await page.evaluate(`(() => {
    const h = window.__kairo;
    return { facilities: h.placement.count, view: h.scene.guestViewCount };
  })()`)) as { facilities: number };
  const cashReload = await cashOf();
  record(
    '새로고침 후에도 시설이 남아 있다 — 폰에서 다시 켜도 판이 이어진다',
    afterReload.facilities === savedInfo.facilities && savedInfo.facilities > 0 ? 'pass' : 'fail',
    `세이브 ${savedInfo.facilities}개 → 복원 ${afterReload.facilities}개 (화면 ${countAfter}개)`,
  );
  /*
   * 카드의 **지속 효과**가 재부팅을 넘는가. 안 넘으면 "3주간 만족 −8" 을 감수하고 고른
   * 선택이 새로고침으로 지워지고, 그러면 선택에 무게가 없어진다.
   */
  const cardsAfter = (await page.evaluate(`(() => {
    const c = window.__kairo.cards;
    return { active: c ? c.active.length : -1, seen: c ? c.seenCount : -1 };
  })()`)) as { active: number; seen: number };
  record(
    '카드 상태가 새로고침을 넘는다 — 안 넘으면 선택에 무게가 없다',
    cardsAfter.seen > 0 ? 'pass' : 'fail',
    `본 카드 ${cardsAfter.seen}종 · 적용 중 ${cardsAfter.active}건`,
  );

  record(
    '새로고침 후에도 현금이 이어진다',
    savedInfo.cash !== undefined && cashReload === Math.round(savedInfo.cash / 10000)
      ? 'pass'
      : 'fail',
    `세이브 ${Math.round((savedInfo.cash ?? 0) / 10000)}만 → 복원 ${cashReload}만`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/kairo-save.png` });

  // ── 10. 안드로이드 비정수 DPR ──
  const ctx2 = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  const p2 = await ctx2.newPage();
  await p2.goto(URL, { waitUntil: 'load' });
  await p2.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const dbgA = (await p2.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  record(
    '안드로이드 DPR 2.625 에서도 도트격자 OK',
    dbgA.includes('도트격자 OK') ? 'pass' : 'fail',
    dbgA.replace(/\n/g, ' | '),
  );
  await p2.screenshot({ path: `${SHOT_DIR}/kairo-android.png` });

  await browser.close();

  const failed = results.filter((r) => r.verdict === 'fail');
  console.log(
    `\n${failed.length === 0 ? '✅' : '❌'} ${results.length - failed.length}/${results.length} 통과` +
      (failed.length ? ` — 실패: ${failed.map((f) => f.name).join(', ')}` : ''),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

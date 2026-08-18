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
 * - **`page.evaluate` 에 넘기는 템플릿 리터럴 안에서 백틱과 백슬래시 이스케이프를 쓰지 말 것.**
 *   백틱은 리터럴을 끊고, `\n` 같은 이스케이프는 TS 가 **실제 줄바꿈으로 바꿔** 페이지 쪽
 *   정규식을 깨뜨린다 (실측: `/\n/g` 가 줄바꿈이 들어간 정규식이 되어 SyntaxError).
 *   줄바꿈이 필요하면 `String.fromCharCode(10)` 를 쓴다.
 * - **`page.evaluate` 안에서 이름 있는 함수를 쓰지 말 것.** tsx(esbuild)가 `__name`
 *   헬퍼를 주입하는데 페이지 쪽엔 없어서 ReferenceError 가 난다. 문자열로 넘기는 게 안전하다.
 * - **핀치/멀티터치는 CDP `Input.dispatchTouchEvent` 로 보낼 것.** 합성 PointerEvent 는
 *   Phaser 가 무시해서 멀쩡한 코드가 실패로 나온다.
 */
import { chromium, type ConsoleMessage } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';
/*
 * `px=1` = 프레임버퍼 보존 (이음새 픽셀 검사용).
 * `debug=1` = 디버그 오버레이. K28 부터 기본으로 숨는데, 이 하네스와 `verify-pwa` 가
 * `#kairo-debug` 의 textContent 로 부팅 완료를 판정하므로 켜고 들어간다.
 */
const URL = `${BASE}/?kairo=1&px=1&debug=1`;
const HEADED = process.argv.includes('--headed');
/**
 * 판의 육지를 통째로 포장한다 — K32-B 부터 **잔디는 손님이 못 지나간다.**
 *
 * 하네스는 "빈 육지를 찾아 시설을 놓는다"로 여러 절을 짠다. 그 육지가 잔디면 이제
 * 전부 `unreachable` 이다 (실측 13절 실패). 길 규칙 자체를 보는 것은 새 절과
 * `paths.test.ts` 이고, 나머지 절이 보려는 것은 배치·손님·콤보·위험도다 —
 * 그 절들에서는 **길을 상수로 만든다.**
 *
 * 실내 바닥은 건드리지 않는다 (방을 지우면 벽이 사라진다).
 */
/**
 * 훑을 범위를 **해금된 토지에서** 가져온다 (K36).
 *
 * ⚠ 하네스 곳곳이 `for (let i = 4; i < 28; ...)` 처럼 좌표를 박아 뒀다. 격자가 96×72 가
 * 되고 입구가 가운데(i=48)로 가면서 그 창들이 전부 **도시 띠나 내 땅 밖**을 가리켰다
 * (실측: 12절이 "아직 내 땅이 아닙니다"로 실패). 좌표를 박지 말고 물어본다.
 */
const LAND_BOX = `
    const _L = window.__kairo.land();
    const I0 = _L.i0 + 1;
    const I1 = _L.i0 + _L.w - 1;
    const J0 = _L.j0 + 1;
    const J1 = _L.j0 + _L.h - 1;
`;

/** 도시 띠 높이 — 하네스가 좌표를 박지 않게 (K36) */
const KAIRO_BAND = 8;

const PAVE_ALL = `
    (() => {
      const _t = window.__kairo.terrain, _sc = window.__kairo.scene;
      for (let j = 0; j < _t.height; j++) {
        for (let i = 0; i < _t.width; i++) {
          if (!_t.isWalkable(i, j) || _t.isIndoor(i, j)) continue;
          if (_t.kindAt(i, j) === 'path_stone') continue;
          if (_t.paint(i, j, 'path_stone')) _sc.refreshTile(i, j);
        }
      }
      window.__kairo.guests.invalidate();
    })();
`;

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
  record('격자 96×72 = 6912 타일 (K36 확대)', tiles === 6912 ? 'pass' : 'fail', `${tiles}`);

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

  // ── 7b. 건설 시트 — 폰에서 실제로 고를 수 있나 (K28) ──
  //
  // 예전에는 하단에 붓 바가 상시로 깔려 있었다. 이제 `건설` 을 눌러 시트를 연다.
  // 카이로에 드롭다운이 없듯 여기도 **아이콘 격자**다.
  const sheet = (await page.evaluate(`(() => {
    const open = document.getElementById('kairo-build-open');
    if (!open) return null;
    open.click();
    const sh = document.getElementById('kairo-sheet');
    if (!sh || sh.hidden) return { opened: false };
    const items = [...sh.querySelectorAll('.ksheet-build .kitem')].map((b) => {
      const r = b.getBoundingClientRect();
      return { pick: b.dataset.pick, w: Math.round(r.width), h: Math.round(r.height),
               locked: b.disabled };
    });
    const tabs = [...sh.querySelectorAll('.tab-btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return { t: b.textContent, w: Math.round(r.width), h: Math.round(r.height) };
    });
    const grounds = items.filter((x) => (x.pick || '').indexOf('ground:') === 0).length;
    const facilities = items.filter((x) => (x.pick || '').indexOf('facility:') === 0).length;
    const groups = [...sh.querySelectorAll('.ksheet-group')].map((g) => g.textContent);
    const all = items.concat(tabs.map((t) => ({ pick: 'tab', w: t.w, h: t.h, locked: false })));
    return { opened: true, grounds: grounds, facilities: facilities, groups: groups,
             locked: items.filter((x) => x.locked).length,
             minH: Math.min(...all.map((x) => x.h)), minW: Math.min(...all.map((x) => x.w)),
             overflowX: document.documentElement.scrollWidth - innerWidth };
  })()`)) as
    | null
    | { opened: false }
    | {
        opened: true;
        grounds: number;
        facilities: number;
        groups: string[];
        locked: number;
        minH: number;
        minW: number;
        overflowX: number;
      };

  if (!sheet || !sheet.opened) {
    record('건설 시트', 'fail', sheet ? '열리지 않았다' : '건설 버튼을 못 찾았다');
  } else {
    record(
      '건설 시트가 시설 73종을 격자로 낸다 — 드롭다운이 아니다',
      sheet.facilities === 73 ? 'pass' : 'fail',
      `시설 ${sheet.facilities}종 · 존 ${sheet.groups.length}개 (${sheet.groups.join('/')})`,
    );
    record(
      '아직 못 짓는 시설은 잠겨 보인다 — 열어봐야 아는 정보면 아무도 안 연다',
      sheet.locked > 0 ? 'pass' : 'fail',
      `잠김 ${sheet.locked}종`,
    );
    record(
      '시트 안 터치 타깃 44px 이상',
      sheet.minH >= 44 && sheet.minW >= 44 ? 'pass' : 'fail',
      `최소 ${sheet.minW}×${sheet.minH}`,
    );
    record('시트를 열어도 가로 넘침 0', sheet.overflowX <= 0 ? 'pass' : 'fail', `${sheet.overflowX}px`);
  }

  /*
   * 탭 셋 — 시설 / **건물** / 바닥 (K31).
   *
   * 건물이 자기 탭을 갖는 이유: 확장이 카이로의 핵심 동사인데 바닥 탭에 섞여 있을 때는
   * "이게 건물을 넓히는 것"임을 아무도 몰랐다 (직접 플레이하다 막혔다).
   */
  const tabs = (await page.evaluate(`(() => {
    const sh = document.getElementById('kairo-sheet');
    if (!sh) return null;
    const names = [...sh.querySelectorAll('.tab-btn')].map((b) => b.dataset.tab);
    const read = (key) => {
      const tab = [...sh.querySelectorAll('.tab-btn')].find((b) => b.dataset.tab === key);
      if (!tab) return null;
      tab.click();
      return [...sh.querySelectorAll('.ksheet-build .kitem')].map((b) => ({
        pick: b.dataset.pick,
        sub: (b.querySelector('.kitem-sub') || {}).textContent || '',
      }));
    };
    return { names: names, building: read('building'), ground: read('ground') };
  })()`)) as null | {
    names: string[];
    building: { pick: string; sub: string }[] | null;
    ground: { pick: string; sub: string }[] | null;
  };

  if (!tabs || !tabs.building || !tabs.ground) {
    record('건설 시트 탭', 'fail', '탭을 못 찾았다');
  } else {
    record(
      '탭이 넷이다 — 시설 · 건물 · 바닥 · 코스 (K32)',
      tabs.names.join(',') === 'facility,building,ground,course' ? 'pass' : 'fail',
      tabs.names.join(','),
    );
    // K32: 건물 바닥이 2×2 · 4×4 두 크기다
    const b2 = tabs.building.find((x) => x.pick === 'ground:floor_indoor@2');
    const b4 = tabs.building.find((x) => x.pick === 'ground:floor_indoor@4');
    record(
      '건물 탭에 2×2 · 4×4 가 있고 "넓어짐"이라고 알려준다 (K32)',
      b2 !== undefined && b4 !== undefined && /넓어/.test(b4.sub) ? 'pass' : 'fail',
      b4 ? `${tabs.building.length}개 · ${b4.sub}` : '없음',
    );
    /*
     * K32-B: 길 붓이 1·2·3 세 크기가 됐다 (통행 가능한 3종 × 3 + 통행 불가 2종 + 철거 = 12).
     * 길이 놀이의 축이 됐는데 한 칸씩 찍게 두면 폰에서 못 깐다.
     */
    record(
      '바닥 탭은 실외 포장만 · 길 붓은 1·2·3 세 크기 (K32-B)',
      tabs.ground.length === 12 &&
        !tabs.ground.some((x) => x.pick === 'ground:floor_indoor') &&
        tabs.ground.some((x) => x.pick === 'ground:path_stone@3') &&
        tabs.ground.filter((x) => /만/.test(x.sub)).length >= 3
        ? 'pass'
        : 'fail',
      `${tabs.ground.length}개`,
    );
  }
  await page.evaluate(`document.getElementById('kairo-sheet-close').click()`);

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

  // ── 7c. 실내 바닥 → 외곽 벽 (K27) ──
  //
  // 플레이어는 사각형을 그리지 않는다. **바닥을 깔면 그게 방**이고 벽은 결과다.
  // 그래서 검사도 "바닥을 깔면 외곽선이 생기고, 붙여 깔면 한 덩어리·문 하나가 되고,
  // 바닥을 지우면 벽이 사라지는가"로 본다.
  const wallCheck = (await page.evaluate(`(() => {
    const h = window.__kairo;
    ${LAND_BOX}
    const t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    const out = {};
    /*
     * K30 부터 새 판에 **물려받은 빠지**가 있다. 그 위에서 재면 절대값이 안 맞으므로
     * 킷과 안 겹치는 빈 자리를 찾고, 아래 숫자는 전부 **증분**으로 본다.
     */
    let base = null;
    for (let j = J0; j < Math.min(J1, J0 + 30) && !base; j++) {
      for (let i = I0; i < I1; i++) {
        let ok = true;
        for (let di = -1; di < 10 && ok; di++) {
          for (let dj = -1; dj < 7; dj++) {
            const ti = i + di, tj = j + dj;
            /*
             * ⚠ **손 안 댄 잔디**만 고른다. 걸을 수 있는 칸으로만 고르면 물려받은 빠지의
             * 포장 마당이 후보가 되고, 뒤에서 잔디로 되돌릴 때 킷의 방문이 사라져
             * 벽 개수가 음수로 나온다 (실측: 경계 −28).
             */
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || p.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { base = [i, j]; break; }
      }
    }
    if (!base) return { ok: false, reason: '킷과 겹치지 않는 9×6 빈 육지를 못 찾았다' };
    /*
     * ⚠ **길을 먼저 붙인다** (K32-B 이후). 잔디 섬에 방을 지으면 문이 안 나고,
     * bakeIndoorWalls 는 실패하면 **벽을 통째로 지운다** — 물려받은 빠지의 벽까지
     * 사라져 경계가 음수로 나온다 (실측: −28).
     */
    const gate0 = window.__kairo.gate;
    for (let k = Math.min(gate0.i, base[0] - 1); k <= Math.max(gate0.i, base[0] - 1); k++) {
      if (t.isWalkable(k, gate0.j)) t.paint(k, gate0.j, 'path_stone');
    }
    for (let k = gate0.j; k <= base[1] + 6; k++) {
      if (t.isWalkable(base[0] - 1, k)) t.paint(base[0] - 1, k, 'path_stone');
    }
    const edges0 = w.count(1) + w.count(2);
    const doors0 = w.count(2);
    /*
     * ⚠ **게이트를 박지 않는다** (K36). 여기가 (0,0) 고정이었는데 그 자리는 이제
     * 차도다. 게이트가 못 서는 칸이면 bakeIndoorWalls 가 문을 못 내고, 실패하면 벽을
     * 통째로 지운다 — 물려받은 빠지의 벽까지 사라져 경계가 −28 로 나왔다.
     */
    const areas0 = h.sim.bakeIndoorWalls(t, w, gate0, h.sim.guestWalkable(t, p)).areas;
    const [bi, bj] = base;
    const gate = gate0;
    const stand = h.sim.guestWalkable(t, p);
    const paint = (i0, j0, pw, ph, kind) => {
      for (let j = j0; j < j0 + ph; j++) for (let i = i0; i < i0 + pw; i++) t.paint(i, j, kind);
    };

    // ① 3×3 실내 바닥 → 외곽 12 (벽 11 + 문 1)
    paint(bi, bj, 3, 3, 'floor_indoor');
    const r1 = h.sim.bakeIndoorWalls(t, w, gate, stand);
    out.firstOk = r1.ok;
    out.firstAreas = r1.areas - areas0;
    out.firstEdges = w.count(1) + w.count(2) - edges0;
    out.firstDoors = w.count(2) - doors0;
    out.innerEmpty = w.edgeAt(bi, bj, 0) === 0;

    // ② 붙여 깔면 **한 덩어리 · 문 하나** (사각형 모델일 땐 문이 둘이었다)
    paint(bi + 3, bj, 3, 3, 'floor_indoor');
    const r2 = h.sim.bakeIndoorWalls(t, w, gate, stand);
    out.joinedAreas = r2.areas - areas0;
    out.joinedDoors = r2.doors - areas0;
    out.joinedEdges = w.count(1) + w.count(2) - edges0;
    out.betweenGone = w.edgeAt(bi + 2, bj, 0) === 0;

    // ③ 한 칸만 더 깔아도 넓어진다 — 절차가 없다
    const before = w.count(1) + w.count(2) - edges0;
    const grew = h.sim.paintFloor(t, w, gate, bi + 6, bj, 'floor_indoor', stand);
    out.growOk = grew.ok && grew.changed;
    out.grownEdges = w.count(1) + w.count(2) - edges0;
    out.grewBy = out.grownEdges - before;

    // ④ 바닥을 지우면 벽도 사라진다
    paint(bi, bj, 7, 3, 'lawn');
    const r4 = h.sim.bakeIndoorWalls(t, w, gate, stand);
    out.clearedEdges = w.count(1) + w.count(2) - edges0;
    out.clearedAreas = r4.areas - areas0;

    // 화면용으로 다시 깔아 둔다
    paint(bi, bj, 6, 4, 'floor_indoor');
    h.sim.bakeIndoorWalls(t, w, gate, stand);
    for (let j = bj; j < bj + 4; j++) for (let i = bi; i < bi + 6; i++) sc.refreshTile(i, j);
    sc.refreshAllWalls();
    out.wallCount = w.count(1) + w.count(2) - edges0;
    out.origin = [bi, bj];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        firstOk: boolean;
        firstAreas: number;
        firstEdges: number;
        firstDoors: number;
        innerEmpty: boolean;
        joinedAreas: number;
        joinedDoors: number;
        joinedEdges: number;
        betweenGone: boolean;
        growOk: boolean;
        grownEdges: number;
        grewBy: number;
        clearedEdges: number;
        clearedAreas: number;
        wallCount: number;
        origin: number[];
      };

  if (!wallCheck.ok) {
    record('실내 바닥 → 벽', 'fail', wallCheck.reason);
  } else {
    record(
      '3×3 실내 바닥 → 외곽 12 경계 (벽 11 + 문 1)',
      wallCheck.firstOk && wallCheck.firstEdges === 12 && wallCheck.firstDoors === 1
        ? 'pass'
        : 'fail',
      `경계 ${wallCheck.firstEdges} · 문 ${wallCheck.firstDoors} · 덩어리 ${wallCheck.firstAreas}`,
    );
    record('안쪽 경계는 비어 있다 — 벽이 칸을 안 막는다', wallCheck.innerEmpty ? 'pass' : 'fail');
    record(
      '붙여 깔면 한 덩어리 · 문 하나 — 둘레 18 (K27)',
      wallCheck.joinedAreas === 1 &&
        wallCheck.joinedDoors === 1 &&
        wallCheck.joinedEdges === 18 &&
        wallCheck.betweenGone
        ? 'pass'
        : 'fail',
      `덩어리 ${wallCheck.joinedAreas} · 문 ${wallCheck.joinedDoors} · 경계 ${wallCheck.joinedEdges}`,
    );
    record(
      '한 칸만 더 깔아도 넓어진다 — 둘레가 2 는다',
      wallCheck.growOk && wallCheck.grewBy === 2 ? 'pass' : 'fail',
      `경계 ${wallCheck.grownEdges} (+${wallCheck.grewBy})`,
    );
    record(
      '바닥을 지우면 벽도 사라진다',
      wallCheck.clearedEdges === 0 && wallCheck.clearedAreas === 0 ? 'pass' : 'fail',
      `경계 ${wallCheck.clearedEdges} · 덩어리 ${wallCheck.clearedAreas}`,
    );
    record(
      '벽 그림이 화면에 올라간다',
      wallCheck.wallCount >= 4 ? 'pass' : 'fail',
      `${wallCheck.wallCount}장`,
    );
  }

  if (wallCheck.ok) {
    const [ri, rj] = wallCheck.origin;
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
    const src = prov.get('wall/edge:a1'); // J+ 경계 (화면 왼쪽아래 변)
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const H = cv.height, W = cv.width;
    const alphaAt = (x, y) => d[(y * W + x) * 4 + 3];

    /*
     * ⚠ 벽이 **경계로 옮겨간 뒤로** 고정 좌표로는 못 잰다 (K25) — 패널이 캔버스의
     * 한쪽 절반에만, 그것도 기울어진 띠로 들어간다. 그래서 기하를 다시 적지 않고
     * **열마다 실제 실루엣을 찾아** 그 안에서 잰다.
     */
    let paneOpaque = 0, paneClear = 0;
    let plinthClear = 0, plinthTotal = 0;
    for (let x = 0; x < W; x++) {
      let top = -1, bot = -1;
      for (let y = 0; y < H; y++) if (alphaAt(x, y) > 8) { if (top < 0) top = y; bot = y; }
      if (top < 0 || bot - top < 12) continue;
      // 갓 아래 3줄 ~ 굽 위 6줄이 유리 대역이다
      let colOpaque = 0, colClear = 0;
      for (let y = top + 4; y < bot - 6; y++) {
        if (alphaAt(x, y) > 8) colOpaque++; else colClear++;
      }
      // 멀리온 열은 전부 불투명한 것이 정상 — 세면 투과율이 낮게 나온다
      if (colClear > 0) { paneOpaque += colOpaque; paneClear += colClear; }
      // 굽(밑동)은 뚫리면 안 된다 — 접지가 끊겨 보인다
      for (let y = bot - 4; y <= bot; y++) {
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
    '벽 캔버스가 32×26 이다 — K27 에서 높이를 24→10 으로 낮췄다',
    stipple.W === 32 && stipple.H === 26 ? 'pass' : 'fail',
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
    ${LAND_BOX}
    ${PAVE_ALL}
    const gate = { i: 0, j: 0 };
    const out = { picker: 0, placed: [], rejected: [], anchors: [] };

    const sel = document.getElementById('kairo-facility');

    // 넓은 육지를 찾는다
    let base = null;
    for (let j = J0; j < Math.min(J1, J0 + 20) && !base; j++) {
      for (let i = I0; i < I1; i++) {
        let ok = true;
        for (let di = 0; di < 9 && ok; di++)
          for (let dj = 0; dj < 7; dj++)
            if (!t.isWalkable(i + di, j + dj) || w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) {
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

    /*
     * 실내 시설 — 방이 없으면 거절, 방을 지으면 통과. 그리고 **벽 바깥에서 벽에 접한
     * 칸은 여전히 거절**이어야 한다 (K25 검토 ①: 경계는 두 칸이 공유한다).
     */
    const wi = bi, wj = bj + 6;
    const stand = h.sim.guestWalkable(t, p);
    out.wallMountBefore = p.check(t, w, gate, 'locker_row', wi, wj).fail || 'ok';

    for (let j = wj; j < wj + 3; j++) for (let i = wi; i < wi + 6; i++) t.paint(i, j, 'floor_indoor');
    h.sim.bakeIndoorWalls(t, w, gate, stand);
    for (let j = wj; j < wj + 3; j++) for (let i = wi; i < wi + 6; i++) sc.refreshTile(i, j);
    sc.refreshAllWalls();
    // 문이 난 줄을 피해 맨 아랫줄에 놓는다 (K30: 문 앞은 비운다)
    out.wallMountAfter = p.check(t, w, gate, 'locker_row', wi, wj + 2).fail || 'ok';
    // 방 오른쪽 바깥 칸 — 벽에 접해 있지만 실내 바닥이 아니다
    out.wallMountOutside = p.check(t, w, gate, 'locker_row', wi + 6, wj).fail || 'ok';
    out.outsideTouchesWall = w.hasAnyEdge(wi + 6, wj);
    if (out.wallMountAfter === 'ok') {
      const r = p.place(t, w, gate, 'locker_row', wi, wj + 2);
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
        wallMountOutside: string;
        outsideTouchesWall: boolean;
        count: number;
        capacity: number;
        focus: number[];
      };

  if (!fac.ok) {
    record('시설 배치', 'fail', fac.reason);
  } else {
    record(
      '시설 4종 배치 (비정사각 4×1 포함)',
      fac.placed.length >= 4 ? 'pass' : 'fail',
      `놓임 ${fac.placed.join(',')}${fac.rejected.length ? ' · 거절 ' + fac.rejected.join(',') : ''}`,
    );
    record(
      '실내 시설 — 바닥 없이 거절 → 실내 바닥을 깔면 통과',
      fac.wallMountBefore === 'needs-indoor' && fac.wallMountAfter === 'ok' ? 'pass' : 'fail',
      `${fac.wallMountBefore} → ${fac.wallMountAfter}`,
    );
    record(
      '방 바깥에서 벽에 접한 칸은 여전히 거절 (K26 ①)',
      fac.outsideTouchesWall && fac.wallMountOutside === 'needs-indoor' ? 'pass' : 'fail',
      `벽에 접했나 ${fac.outsideTouchesWall} · 판정 ${fac.wallMountOutside}`,
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

  /*
   * ⚠ 손님 구간 전에 **판을 새로 띄운다.**
   *
   * 여기까지 열네 개 검사가 지형을 칠하고 방을 만들고 지우고 시설을 놓았다. 그 잔해 위에서
   * 손님을 재면 무엇 때문에 실패했는지 알 수 없다 — K30 에서 실제로 그랬다 (같은 코드가
   * 새 판에서는 손님이 시설을 쓰는데 하네스 안에서는 25초를 기다려도 0 이었다).
   * 손님·아쿠아파크·주 루프는 **깨끗한 새 판**에서 본다.
   */
  await page.evaluate(`try { localStorage.clear(); } catch {}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );

  // ── 7f. 손님 — 걷고, 칸을 채우고, 표정·이모트가 뜬다 ──
  const guests = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    ${PAVE_ALL}
    // 게이트 근처 육지에 시설 몇 개를 놓아 손님이 갈 곳을 만든다
    const gate = h.gate;
    // 게이트 근처 빈 자리를 실제로 찾아 놓는다 — 앞 블록이 이미 놓은 시설과 겹치면 안 된다
    // K36: 좌표를 박지 않는다 — 게이트가 맵 가운데(48,8)로 갔다. 게이트 **주변**에 놓는다
    let placed = 0;
    for (let j = gate.j + 1; j < gate.j + 12 && placed < 3; j++) {
      for (let i = gate.i - 5; i < gate.i + 6 && placed < 3; i++) {
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

  /*
   * 손님이 시설을 쓸 때까지 **기다린다** (고정 9초가 아니라 조건).
   *
   * ⚠ 고정 대기는 판이 달라지면 조용히 깨진다 — K30 에서 새 판에 물려받은 빠지가 생기자
   * 걸어야 할 거리가 달라져 9초로는 모자랐다. 조건 대기는 그 변화에 안 흔들리고,
   * 정말 안 되면 시간 초과로 정직하게 실패한다.
   */
  await page
    .waitForFunction(
      `(() => { const g = window.__kairo.guests; return g.all.some((x) => x.state === 'using'); })()`,
      undefined,
      { timeout: 25000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1500);

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
    ${PAVE_ALL}
    if (g.all.length < 2) return { ok: false, reason: '손님이 둘 미만' };

    // 벽 세울 자리 (자기와 뒤 칸이 비어 있는 육지)
    let spot = null;
    for (let j = 5; j < 24 && !spot; j++) {
      for (let i = 3; i < 30; i++) {
        if (!t.isWalkable(i, j) || !t.isWalkable(i, j - 1)) continue;
        if (w.hasAnyEdge(i, j) || w.hasAnyEdge(i, j - 1)) continue;
        if (p.handleAt(i, j) || p.handleAt(i, j - 1)) continue;
        spot = [i, j]; break;
      }
    }
    if (!spot) return { ok: false, reason: '자리를 못 찾았다' };
    const [i, j] = spot;
    // 손님과 카메라 사이에 서도록 이 칸의 **앞쪽(+J) 경계**에 벽을 세운다
    w.setEdge(i, j, 1, 1); // 1 = DIR_J_PLUS
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
    // K36: 창을 격자에서 가져온다 (도시 띠 아래부터)
    for (let i = 6; i < t.width - 6 && !pier; i++) {
      for (let j = ${KAIRO_BAND}; j < t.height - 8; j++) {
        if (!(t.isWalkable(i, j) && !t.isWalkable(i, j + 1) && !p.handleAt(i, j))) continue;
        /*
         * ⚠ 양옆이 비어 있어야 한다. K30 부터 새 판에 **물려받은 데크**가 물가에 이미
         * 있어서, 그 옆을 잡으면 슬라이드가 occupied 로 거절된다. 검사가 쓰려는 폭
         * (슬라이드 −3 ~ 덱 +1) 이 전부 빈 곳만 고른다.
         */
        let clear = true;
        for (let k = -3; k <= 2 && clear; k++) {
          for (let m = 1; m <= 6; m++) if (p.handleAt(i + k, j + m) !== 0) { clear = false; break; }
        }
        if (!clear) continue;
        pier = { i: i, j: j + 1 };
        break;
      }
    }
    if (!pier) return { ok: false, reason: '양옆이 빈 물가를 못 찾았다' };

    // 덱 없이 트램폴린 → 거절되어야 한다.
    // ⚠ 발자국 3×3 이 전부 물이어야 한다 — 육지에 걸치면 wrong-terrain 이 먼저 잡혀
    //   needs-deck 검사가 무의미해진다 (실측으로 겪었다)
    let wet = null;
    // K36: 격자가 96×72 다 — 창을 격자에서 가져온다
    for (let j = pier.j; j < t.height - 3 && !wet; j++) {
      for (let i = 3; i < t.width - 3; i++) {
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
    ${PAVE_ALL}
    // 물 3×3 을 찾아 그 옆에 잔교를 새로 낸다 (앞 블록과 안 겹치게)
      // ⚠ 물 블록이 육지에 바로 붙어 있으면 덱을 끊어도 육지에서 바로 닿아
      //   "덱이 유일한 길" 검사가 무의미해진다. **3칸 이상** 떨어진 곳을 고른다.
      let wet = null;
      // K36: 물가가 아래로 내려갔다 (도시 띠 + 넓어진 격자) — 창을 격자에서 가져온다
      for (let j = ${KAIRO_BAND} + 4; j < t.height - 4 && !wet; j++) {
        for (let i = 6; i < t.width - 6; i++) {
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
  /*
   * ⚠ `visitors > 0` 을 요구하면 안 된다. 이 하네스는 앞서 주를 여러 번 돌려 공원이
   * 입장 상한까지 차 있고, 그러면 **입장 0 · 만석 100% 가 정상**이다 (안에 있는 손님이
   * 이용을 마치며 매출은 계속 난다). 수요와 매출이 도는지를 본다.
   */
  record('방문객·매출이 생긴다', calc.arrivals > 0 && calc.revenue > 0 ? 'pass' : 'fail',
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
    ${PAVE_ALL}
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
            if (!t.isWalkable(i + di, j + dj) || w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) {
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
    ${PAVE_ALL}
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
   * ── 8·맵 타입 · 시나리오 (§4.5) ──
   *
   * **2회차를 하는 이유.** 맵 3종 × 시나리오 6종을 만들어 놓고 **고를 방법이 없으면
   * 데이터로만 존재한다** — 그래서 화면과 목표 표시를 함께 본다.
   */
  const scenarioUi = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-newgame-open');
    const goal = document.getElementById('kairo-goal');
    if (!open) return { ok: false, why: '새 판 버튼이 없다' };
    open.click();
    const panel = document.getElementById('kairo-newgame');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '새 판 화면이 안 열린다' };
    }
    const maps = [...panel.querySelectorAll('button[data-map]')];
    const scens = [...panel.querySelectorAll('button[data-scenario]')];
    const locked = scens.filter((b) => b.disabled).length;
    const hs = [...maps, ...scens].map((b) => Math.round(b.getBoundingClientRect().height));
    // 맵을 바꾸면 설명이 바뀐다
    const before = panel.textContent.slice(0, 400);
    maps[1].click();
    const after = panel.textContent.slice(0, 400);
    document.getElementById('kairo-newgame-close').click();
    return {
      ok: true, maps: maps.length, scens: scens.length, locked: locked,
      minH: hs.length ? Math.min.apply(null, hs) : 0,
      detailChanged: before !== after,
      // 이 블록 안에서는 백슬래시 이스케이프를 쓸 수 없다 (파일 머리말의 함정 참고)
      goalText: goal ? goal.textContent.split(String.fromCharCode(10)).join(' | ') : '(없음)',
      mapName: window.__kairo.mapDef.name,
      scenarioName: window.__kairo.scenario.name
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    maps?: number;
    scens?: number;
    locked?: number;
    minH?: number;
    detailChanged?: boolean;
    goalText?: string;
    mapName?: string;
    scenarioName?: string;
  };

  record(
    '새 판 화면에 맵 3종 · 시나리오 6종이 있다',
    scenarioUi.ok && scenarioUi.maps === 3 && scenarioUi.scens === 6 ? 'pass' : 'fail',
    scenarioUi.ok
      ? `맵 ${scenarioUi.maps} · 시나리오 ${scenarioUi.scens} (잠김 ${scenarioUi.locked})`
      : (scenarioUi.why ?? '실패'),
  );
  record(
    '아직 안 열린 시나리오가 잠겨 있다 — 처음부터 다 열리면 해금이 무의미하다',
    (scenarioUi.locked ?? 0) > 0 ? 'pass' : 'fail',
    `${scenarioUi.locked}개 잠김`,
  );
  record(
    '맵을 바꾸면 유리·불리 설명이 바뀐다 — 고를 근거가 있어야 고르는 것이다',
    scenarioUi.detailChanged === true ? 'pass' : 'fail',
  );
  record(
    '새 판 화면 버튼이 44px 이상',
    (scenarioUi.minH ?? 0) >= 44 ? 'pass' : 'fail',
    `최소 ${scenarioUi.minH}px`,
  );
  record(
    '목표가 화면에 상시 표시된다 — 안 보이면 시나리오가 목표가 아니다',
    (scenarioUi.goalText ?? '').includes(scenarioUi.mapName ?? '@@') ? 'pass' : 'fail',
    scenarioUi.goalText ?? '',
  );

  /*
   * ── 8·사고 (§12.1) ──
   *
   * v4 결정: **실패는 내 선택 때문이어야 한다.** 위험 단계에서만 사고가 나고, 사고 뒤에도
   * 선택이 있다. 확률이 0 일 때 안 나는 것과, 대응 카드가 실제로 뜨는 것을 함께 본다.
   */
  const accident = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const safe = h.week.run(new h.Rng(31), { season: 'summer', accidentChance: 0 });
    const hit = h.week.run(new h.Rng(31), { season: 'summer', accidentChance: 1 });
    return {
      safeAccident: safe.accident, hitAccident: hit.accident,
      safeRevenue: safe.revenue, hitRevenue: hit.revenue,
      idleAfter: h.guests.idleCount
    };
  })()`)) as {
    safeAccident: unknown;
    hitAccident: { handle: number; defId: string; weeks: number } | null;
    safeRevenue: number;
    hitRevenue: number;
    idleAfter: number;
  };
  record(
    '확률이 0 이면 사고가 안 난다 — 안전한데 사고가 나면 RNG 세금이다',
    accident.safeAccident === null ? 'pass' : 'fail',
  );
  /*
   * ⚠ "매출이 준다"를 요구하면 안 된다. 요금을 **실제 이용 시설**에서 받게 된 뒤로는,
   * 싼 시설이 닫히면 손님이 비싼 시설로 옮겨가 **매출이 오를 수도 있다** (실측: 구명함이
   * 닫혔는데 51.5만 → 52.0만). 그건 버그가 아니라 대체 효과다.
   *
   * 성립하는 성질은 이것이다: **사고가 기록되고, 1~3주이고, 그 시설이 실제로 선다.**
   * 경제적 결과는 포화되지 않은 공원에서 단위 테스트가 본다.
   */
  record(
    '사고가 나면 시설이 1~3주 닫힌다 — 그 시설은 목적지에서 빠진다',
    accident.hitAccident !== null &&
      accident.hitAccident.weeks >= 1 &&
      accident.hitAccident.weeks <= 3 &&
      accident.idleAfter > 0
      ? 'pass'
      : 'fail',
    accident.hitAccident
      ? `${accident.hitAccident.defId} ${accident.hitAccident.weeks}주 · ` +
        `선 시설 ${accident.idleAfter}개 · 매출 ${accident.safeRevenue} → ${accident.hitRevenue}`
      : '사고가 안 났다',
  );

  const accidentUi = (await page.evaluate(`(() => {
    const card = window.__kairo.cardsApi.triggerCard('accident_response');
    if (!card) return { ok: false, why: '사고 카드가 없다' };
    window.__kairoCards.show([card], window.__kairo.week.cash, function () { return undefined; });
    const root = document.getElementById('kairo-card');
    const btns = [...root.querySelectorAll('button')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const labels = btns.map((b) => b.textContent.slice(0, 12));
    const cashBefore = window.__kairo.week.cash;
    // 사람이 쓰는 경로와 같은 pick — 첫 번째(보상 합의)
    window.__kairoCards.pickForTest(0);
    return {
      ok: true, options: btns.length,
      minH: heights.length ? Math.min.apply(null, heights) : 0,
      labels: labels, cashBefore: cashBefore, cashAfter: window.__kairo.week.cash,
      closed: !window.__kairoCards.visible
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    options?: number;
    minH?: number;
    labels?: string[];
    cashBefore?: number;
    cashAfter?: number;
    closed?: boolean;
  };
  record(
    '사고 대응 카드가 선택지 3개로 뜬다 — 순수 처벌은 기억에 안 남는다',
    accidentUi.ok && accidentUi.options === 3 && (accidentUi.minH ?? 0) >= 56 ? 'pass' : 'fail',
    accidentUi.ok
      ? `${(accidentUi.labels ?? []).join(' / ')} · 최소 ${accidentUi.minH}px`
      : (accidentUi.why ?? '실패'),
  );

  /*
   * ── 8·도감 (§15.8 · §D) ──
   *
   * **발견·수집이 훅이다.** 162 항목(콤보 70 + 시설 73 + 장비 19)을 스크롤 지옥 없이
   * 보여주는지 — 기본이 "미발견만"인지, 한 항목이 56px 인지.
   */
  const catalog = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-catalog-open');
    if (!open) return { ok: false, why: '도감 버튼이 없다' };
    open.click();
    const panel = document.getElementById('kairo-catalog');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '도감이 안 열린다' };
    }
    const filter = document.getElementById('kairo-catalog-filter');
    const defaultUndiscovered = filter.textContent.indexOf('미발견만') >= 0;
    // K34: 항목이 div → button 이 됐다 (kitem wide). 태그를 안 박고 속성으로만 찾는다
    const rows = [...panel.querySelectorAll('[data-entry]')];
    const heights = rows.map((r) => Math.round(r.getBoundingClientRect().height));
    const foundCount = rows.filter((r) => r.dataset.found === '1').length;
    const tabs = [...panel.querySelectorAll('button[data-tab]')].map((b) => b.textContent);
    const tiers = [...panel.querySelectorAll('button[data-tier]')].length;
    // 전체 보기로 바꾸면 발견한 것도 나온다
    filter.click();
    const rowsAll = panel.querySelectorAll('[data-entry]').length;
    return {
      ok: true, defaultUndiscovered: defaultUndiscovered,
      rows: rows.length, rowsAll: rowsAll, foundCount: foundCount,
      minRow: heights.length ? Math.min.apply(null, heights) : 0,
      tabs: tabs, tiers: tiers,
      counts: window.__kairo.catalog.counts()
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    defaultUndiscovered?: boolean;
    rows?: number;
    rowsAll?: number;
    foundCount?: number;
    minRow?: number;
    tabs?: string[];
    tiers?: number;
    counts?: Record<string, [number, number]>;
  };

  record(
    '도감이 콤보·시설·장비 세 탭으로 열린다',
    catalog.ok && (catalog.tabs ?? []).length === 3 ? 'pass' : 'fail',
    catalog.ok ? (catalog.tabs ?? []).join(' · ') : (catalog.why ?? '실패'),
  );
  record(
    '기본이 "미발견만"이다 — 할 일이 보여야 도감이 목표가 된다',
    catalog.defaultUndiscovered === true && catalog.foundCount === 0 ? 'pass' : 'fail',
    `필터 기본 ${catalog.defaultUndiscovered ? '미발견만' : '전체'} · 발견 항목 ${catalog.foundCount}개 노출`,
  );
  record(
    '한 항목이 56px 이상 — 스크롤 지옥 방지',
    (catalog.minRow ?? 0) >= 56 ? 'pass' : 'fail',
    `최소 ${catalog.minRow ?? 0}px · ${catalog.rows}줄`,
  );
  record(
    '티어 탭이 4개다 (전체·소·중·대)',
    catalog.tiers === 4 ? 'pass' : 'fail',
    `${catalog.tiers}개`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/kairo-catalog.png` });
  await page.evaluate(`document.getElementById('kairo-catalog-close').click()`);

  /*
   * ── 8·감상 화면 (§15 v4 신규) ──
   *
   * "10시간 뒤의 리조트가 **스크린샷 찍고 싶은 화면**이어야 한다."
   * UI 가 걷히는지, 씬이 **안 멈추는지**(살아 있어야 한다), 공유 이미지가 실제로 나오는지.
   */
  const showcase = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-showcase-open');
    if (!open) return { ok: false, why: '감상 버튼이 없다' };
    // K28: 버튼이 하단 바 안으로 들어가 body 직계가 아니다. 보이는 버튼 전체를 센다.
    // (백틱과 이름 있는 함수는 이 리터럴 안에서 못 쓴다 — 파일 머리 함정 참고)
    const before = [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 2).length;
    open.click();
    const panel = document.getElementById('kairo-showcase');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '감상 화면이 안 열린다' };
    }
    const after = [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 2).length;
    const share = document.getElementById('kairo-showcase-share');
    const name = document.getElementById('kairo-showcase-name');
    return {
      ok: true, buttonsBefore: before, buttonsAfter: after,
      shareH: Math.round(share.getBoundingClientRect().height),
      name: name.textContent,
      upscale: window.__kairo.scene.upscale,
      running: window.__kairo.game.loop.started
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    buttonsBefore?: number;
    buttonsAfter?: number;
    shareH?: number;
    name?: string;
    upscale?: number;
    running?: boolean;
  };

  record(
    '감상 화면이 UI 를 걷어낸다',
    showcase.ok && (showcase.buttonsAfter ?? 99) < (showcase.buttonsBefore ?? 0) ? 'pass' : 'fail',
    showcase.ok
      ? `버튼 ${showcase.buttonsBefore} → ${showcase.buttonsAfter}개`
      : (showcase.why ?? '실패'),
  );
  record(
    '감상 중에도 씬이 돈다 — 정지 화면이면 "살아 움직이는 광경"이 아니다',
    showcase.running === true ? 'pass' : 'fail',
    `루프 ${showcase.running ? '진행' : '정지'} · 배율 ${showcase.upscale}`,
  );
  record(
    '이름·등급이 화면에 박힌다',
    (showcase.name ?? '').includes('★') ? 'pass' : 'fail',
    showcase.name ?? '',
  );
  record(
    '공유 버튼이 48px 이상',
    (showcase.shareH ?? 0) >= 48 ? 'pass' : 'fail',
    `${showcase.shareH ?? 0}px`,
  );

  const shared = (await page.evaluate(`(() => {
    const r = window.__kairo.showcase.share();
    const img = window.__kairo.showcase.lastShareImage;
    return { ok: r.ok, reason: r.reason || '', len: img ? img.length : 0 };
  })()`)) as { ok: boolean; reason: string; len: number };
  record(
    '공유 이미지가 실제로 만들어진다 — 검은 그림이면 실패로 돌려준다',
    shared.ok && shared.len > 1000 ? 'pass' : 'fail',
    shared.ok ? `${(shared.len / 1024).toFixed(0)}KB` : shared.reason,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-showcase.png` });
  await page.evaluate(`document.getElementById('kairo-showcase-close').click()`);

  /*
   * ── 8·배경 2겹 (§7 배경) ──
   *
   * **시차가 핵심이다.** 배경이 지도와 같은 속도로 움직이면 큰 그림 한 장이고, 안 움직이면
   * 벽지다. 그래서 "떠 있나"가 아니라 **"카메라보다 느리게 따라오나"**를 잰다.
   */
  const backdrop = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const info = h.scene.backdropInfo;
    // 카메라를 옮겨 배경이 실제로 덜 움직이는지 본다
    const before = h.scene.tileScreenRect(10, 10);
    h.scene.focusTile(28, 10);
    const after = h.scene.tileScreenRect(10, 10);
    return {
      count: info.count, factors: info.factors, depths: info.depths,
      tileMoved: Math.abs(after.x - before.x)
    };
  })()`)) as { count: number; factors: number[]; depths: number[]; tileMoved: number };

  record(
    '배경이 2겹이다',
    backdrop.count === 2 ? 'pass' : 'fail',
    `${backdrop.count}겹 · 시차 ${backdrop.factors.join(', ')}`,
  );
  record(
    '배경이 지도보다 느리게 따라온다 — 같으면 큰 그림 한 장, 0 이면 벽지다',
    backdrop.factors.length === 2 &&
      backdrop.factors.every((f) => f > 0 && f < 1) &&
      backdrop.factors[0] !== backdrop.factors[1]
      ? 'pass'
      : 'fail',
    `능선 ${backdrop.factors[0]} · 강둑 ${backdrop.factors[1]} (지도는 1.0)`,
  );
  record(
    '배경이 지면보다 뒤에 있다',
    backdrop.depths.every((d) => d < 0) ? 'pass' : 'fail',
    `깊이 ${backdrop.depths.join(', ')}`,
  );

  const backTile = (await page.evaluate(`(() => {
    const prov = window.__kairo.provider;
    const out = [];
    for (const id of ['backdrop/ridge', 'backdrop/farbank']) {
      if (!prov.has(id)) { out.push({ id: id, ok: false, why: '없다' }); continue; }
      const c = prov.get(id);
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      // 좌우 끝 열이 이어지는가 — 가로 타일링의 조건
      let diff = 0;
      for (let y = 0; y < c.height; y++) {
        const a = (y * c.width) * 4;
        const b = (y * c.width + c.width - 1) * 4;
        for (let k = 0; k < 4; k++) diff += Math.abs(d[a + k] - d[b + k]);
      }
      out.push({ id: id, ok: true, w: c.width, h: c.height, edgeDiff: Math.round(diff / c.height) });
    }
    return out;
  })()`)) as { id: string; ok: boolean; why?: string; w?: number; h?: number; edgeDiff?: number }[];

  record(
    '배경 좌우 끝이 이어진다 — 가로로 반복되므로 끊기면 바로 보인다',
    backTile.every((b) => b.ok && (b.edgeDiff ?? 999) < 60) ? 'pass' : 'fail',
    backTile.map((b) => `${b.id.split('/')[1]} ${b.w}×${b.h} 끝차 ${b.edgeDiff}`).join(' · '),
  );

  /*
   * ── 8·코스 (§7) ──
   *
   * 여섯 동사 중 "코스를 그린다". **프리셋 탭 → 핸들 → 확정**이 실제로 도는지,
   * 그리고 **적합도 배지가 붙는지**를 본다 (19×6 표를 읽히지 않는 것이 §B 의 요지다).
   */
  const courseUi = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-course-open');
    if (!open) return { ok: false, why: '코스 버튼이 없다' };
    open.click();
    const panel = document.getElementById('kairo-course');
    if (!panel || panel.hidden) return { ok: false, why: '코스 패널이 안 열린다' };
    /*
     * K33: 패널은 **슬림 바가 기본**이다. 프리셋은 펼쳐야 나온다 — 예전엔 열자마자
     * 화면의 49% 를 먹었고, 그래서 정작 끌 핸들이 화면 밖으로 밀렸다.
     */
    const collapsedH = Math.round(panel.getBoundingClientRect().height);
    document.getElementById('kairo-course-toggle').click();
    const expandedH = Math.round(panel.getBoundingClientRect().height);
    const tabs = [...panel.querySelectorAll('button[data-preset]')];
    const heights = tabs.map((b) => Math.round(b.getBoundingClientRect().height));
    const badges = tabs.map((b) => b.dataset.fit);
    return {
      ok: true, tabs: tabs.length,
      minTab: heights.length ? Math.min.apply(null, heights) : 0,
      badges: badges,
      distinct: [...new Set(badges)].length,
      overflow: panel.scrollWidth > panel.clientWidth,
      collapsedH: collapsedH, expandedH: expandedH, vh: window.innerHeight
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    tabs?: number;
    minTab?: number;
    badges?: string[];
    distinct?: number;
    overflow?: boolean;
    collapsedH?: number;
    expandedH?: number;
    vh?: number;
  };

  record(
    '코스 패널에 프리셋 6종이 있다',
    courseUi.ok && courseUi.tabs === 6 ? 'pass' : 'fail',
    courseUi.ok ? `${courseUi.tabs}종` : (courseUi.why ?? '실패'),
  );
  record(
    '프리셋 탭이 44px 이상 — 폰 터치 타깃',
    (courseUi.minTab ?? 0) >= 44 ? 'pass' : 'fail',
    `최소 ${courseUi.minTab ?? 0}px`,
  );
  /*
   * K33: 접힘이 기본이다. 예전 패널은 열자마자 화면의 **49%** 를 먹어서 핸들을 끌 자리가
   * 안 남았다. 접힘 ≤14% 는 HUD 에 쓰는 것과 같은 자다.
   */
  record(
    '★ 코스 패널은 접힘이 기본 — 화면의 14% 이하 (예전 49%)',
    (courseUi.collapsedH ?? 999) / (courseUi.vh ?? 1) <= 0.14 ? 'pass' : 'fail',
    `접힘 ${Math.round(((courseUi.collapsedH ?? 0) / (courseUi.vh ?? 1)) * 100)}% · ` +
      `펼침 ${Math.round(((courseUi.expandedH ?? 0) / (courseUi.vh ?? 1)) * 100)}%`,
  );
  record(
    '⚠ 음성 대조군 — 펼치면 실제로 커진다 (접힘이 그냥 빈 바가 아닌가)',
    (courseUi.expandedH ?? 0) > (courseUi.collapsedH ?? 0) + 100 ? 'pass' : 'fail',
    `${courseUi.collapsedH ?? 0}px → ${courseUi.expandedH ?? 0}px`,
  );
  record(
    '적합도 배지가 형태마다 다르다 — 19×6 표를 읽히지 않는다는 것이 요지다',
    (courseUi.distinct ?? 0) >= 2 ? 'pass' : 'fail',
    (courseUi.badges ?? []).join(' '),
  );

  const coursePlace = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const panel = h.coursePanel;
    const api = h.courseApi;
    /*
     * 선착장 **주변**의 물 타일을 모은다 (K36). 예전엔 (0,0)~(40,32) 창을 훑었는데
     * 격자가 96×72 가 되고 선착장이 맵 가운데로 가면서 그 창이 선착장에서 멀어졌다 —
     * 코스는 선착장에서 DOCK_REACH_TILES 안에서 시작해야 한다.
     */
    panel.select('shuttle', 'banana');
    const dock = panel.state.dock;
    if (!dock) return { ok: false, why: '선착장이 없다' };
    const water = [];
    for (let r = 2; r <= 10 && water.length < 60; r++) {
      for (let dj = -r; dj <= r && water.length < 60; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = dock.x + di, j = dock.y + dj;
          if (h.terrain.inside(i, j) && h.terrain.isWater(i, j)) water.push({ i: i, j: j });
        }
      }
    }
    if (water.length < 4) return { ok: false, why: '선착장 주변에 물이 부족하다' };
    const st0 = panel.state;
    for (let k = 0; k < st0.handles.length; k++) {
      const w = water[Math.min(water.length - 1, 3 + k * 4)];
      panel.moveHandleForTest(k, w.i, w.j);
    }
    const before = h.courses.count;
    const cashBefore = h.week.cash;
    const added = panel.confirmForTest();
    const weekly = h.courses.weekly();
    return {
      ok: true, before: before, added: added, count: h.courses.count,
      cashBefore: cashBefore, cashAfter: h.week.cash,
      revenue: weekly.revenue, upkeep: weekly.upkeep,
      thrill: Math.round(weekly.thrill), safety: Math.round(weekly.safety),
      presets: api.PRESETS.length, equipment: api.COURSE_EQUIPMENT.length
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    before?: number;
    added?: number;
    count?: number;
    cashBefore?: number;
    cashAfter?: number;
    revenue?: number;
    upkeep?: number;
    thrill?: number;
    safety?: number;
    presets?: number;
    equipment?: number;
  };

  record(
    '핸들을 물 위로 옮기고 확정하면 코스가 생긴다',
    coursePlace.ok && (coursePlace.added ?? 0) === 1 ? 'pass' : 'fail',
    coursePlace.ok
      ? `코스 ${coursePlace.before} → ${coursePlace.count}`
      : (coursePlace.why ?? '실패'),
  );
  record(
    '코스 장비값이 실제로 나간다',
    (coursePlace.cashAfter ?? 0) < (coursePlace.cashBefore ?? 0) ? 'pass' : 'fail',
    `현금 ${Math.round((coursePlace.cashBefore ?? 0) / 10000)}만 → ` +
      `${Math.round((coursePlace.cashAfter ?? 0) / 10000)}만`,
  );
  record(
    '코스가 매출·스릴·안전을 낸다',
    (coursePlace.revenue ?? 0) > 0 && (coursePlace.thrill ?? 0) > 0 ? 'pass' : 'fail',
    `주매출 ${coursePlace.revenue} · 유지 ${coursePlace.upkeep} · ` +
      `스릴 ${coursePlace.thrill} · 안전 ${coursePlace.safety}`,
  );
  record(
    '장비 19종 · 프리셋 6종이 계약대로다',
    coursePlace.presets === 6 && coursePlace.equipment === 19 ? 'pass' : 'fail',
    `${coursePlace.presets} × ${coursePlace.equipment}`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-course.png` });
  await page.evaluate(`document.getElementById('kairo-course-close').click()`);

  /*
   * ── 8b·코스를 **화면에서** 만질 수 있나 (K33) ──
   *
   * ⚠ 위 절들은 `moveHandleForTest`/`confirmForTest` 로 **좌표를 직접 넣는다.** sim 은
   * 맞는지 보지만 손가락이 닿는지는 안 본다. 그래서 "핸들이 화면 밖(x = −284)" 이
   * 검사를 통과한 채 오래 남아 있었다. 여기서는 화면만 본다.
   */
  const courseFrame = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    // 편집을 새로 연다
    document.getElementById('kairo-build-open').click();
    document.querySelector('#kairo-sheet [data-tab="course"]').click();
    const panel = document.getElementById('kairo-course');
    if (!panel || panel.hidden) return { ok: false, why: '코스 패널이 안 열린다' };
    const st = h.coursePanel.state;
    if (st.handles.length === 0) return { ok: false, why: '핸들이 없다 — 선착장을 못 찾았다' };

    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const pos = st.handles.map((v) => {
      const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
      return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy) };
    });
    const barTop = Math.round(panel.getBoundingClientRect().top);
    return {
      ok: true, pos: pos, barTop: barTop,
      vw: window.innerWidth, vh: window.innerHeight,
      dockCount: h.courseApi.dockCandidates(
        h.placement.all().filter((f) => f.defId === 'float_deck').map((f) => ({ x: f.i, y: f.j })),
        h.gate
      ).length,
      dock: st.dock
    };
  })()`)) as
    | { ok: false; why: string }
    | {
        ok: true;
        pos: { x: number; y: number }[];
        barTop: number;
        vw: number;
        vh: number;
        dockCount: number;
        dock: { x: number; y: number } | null;
      };

  if (!courseFrame.ok) {
    record('★ 코스를 열면 핸들이 화면 안에 있다 (K33)', 'fail', courseFrame.why);
  } else {
    const inView = courseFrame.pos.every(
      (p) => p.x > 0 && p.x < courseFrame.vw && p.y > 0 && p.y < courseFrame.barTop,
    );
    record(
      '★ 코스를 열면 핸들이 **화면 안**, 슬림 바 위에 있다 (K33)',
      inView ? 'pass' : 'fail',
      `핸들 ${courseFrame.pos.map((p) => `(${p.x},${p.y})`).join(' ')} · ` +
        `화면 ${courseFrame.vw}×${courseFrame.vh} · 바 상단 ${courseFrame.barTop}`,
    );
  }

  /*
   * ⚠ 음성 대조군 — 프레이밍을 안 하면 화면 밖이다.
   *
   * 실측 대조군이 이미 있다: K33 이전에 이 값이 **x = −284, −380** 이었다. 여기서는
   * 카메라를 딴 데로 보낸 뒤 다시 재서, "원래 화면 안이던 것"이 아님을 보인다.
   */
  const frameControl = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const at = () => h.coursePanel.state.handles.map((v) => {
      const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
      return Math.round(cr.left + (r.x + 16) * sx);
    });
    h.scene.focusTile(60, 2);            // 코스에서 멀리 — 프레이밍 없는 상태를 흉내낸다
    const away = at();
    h.scene.frameCourse(h.coursePanel.state.dock, h.coursePanel.state.handles, 160);
    const framed = at();
    return { away: away, framed: framed, vw: window.innerWidth };
  })()`)) as { away: number[]; framed: number[]; vw: number };
  record(
    '⚠ 음성 대조군 — 프레이밍이 없으면 화면 밖이다 (검사가 유의미한가)',
    frameControl.away.some((x) => x < 0 || x > frameControl.vw) &&
      frameControl.framed.every((x) => x > 0 && x < frameControl.vw)
      ? 'pass'
      : 'fail',
    `프레이밍 전 ${frameControl.away.join(',')} → 후 ${frameControl.framed.join(',')}`,
  );

  /*
   * ★ **진짜 손가락으로 핸들을 끈다.**
   *
   * `moveHandleForTest` 를 안 쓴다. 화면 좌표로 touchStart → touchMove → touchEnd 를
   * 보내고, 핸들의 격자 좌표가 실제로 바뀌는지 본다. 이 검사가 있어야 "화면 밖" 같은
   * 문제가 다시 조용히 통과하지 않는다.
   */
  const before0 = (await page.evaluate(
    `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
  )) as string;
  const grab = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const v = h.coursePanel.state.handles[0];
    const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
    return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy) };
  })()`)) as { x: number; y: number };
  await touch('touchStart', grab.x, grab.y);
  for (let k = 1; k <= 6; k++) await touch('touchMove', grab.x + k * 6, grab.y + k * 4);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(250);
  const after0 = (await page.evaluate(
    `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
  )) as string;
  record(
    '★ 진짜 손가락으로 핸들을 끈다 — 백도어가 아니라 화면으로 (K33)',
    before0 !== after0 ? 'pass' : 'fail',
    `${before0} → ${after0}`,
  );

  /*
   * 선착장을 지도에서 탭해 고른다.
   *
   * 새 판의 잔교는 하나다 — 후보를 하나 더 만들어야 "고른다"가 성립한다.
   */
  const dockPick = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain;
    // 물가에서 떨어진 곳에 잔교를 하나 더 낸다 (첫 잔교와 안 붙게)
    let made = 0, tip = null;
    for (let i = 10; i < 40 && made === 0; i++) {
      for (let j = 1; j < 40; j++) {
        if (!t.isWalkable(i, j) || t.isWater(i, j)) continue;
        if (!t.isWater(i, j + 1) || !t.isWater(i, j + 2)) continue;
        for (let k = 1; k <= 2; k++) {
          if (h.placement.place(t, h.walls, h.gate, 'float_deck', i, j + k).ok) { made++; tip = [i, j + k]; }
        }
        if (made > 0) break;
      }
    }
    if (made === 0) return { ok: false, why: '두 번째 잔교를 못 놓았다' };
    h.guests.invalidate();
    h.scene.rebuildFacilities();
    // 패널을 다시 열어 후보를 갱신한다
    h.coursePanel.hide();
    h.coursePanel.show();
    const cands = h.scene.dockMarks;
    const before = h.coursePanel.state.dock;
    return { ok: true, cands: cands, before: before, made: made, tip: tip };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; cands: { x: number; y: number }[]; before: { x: number; y: number }; made: number };

  if (!dockPick.ok) {
    record('선착장을 지도에서 탭해 고른다 (K33)', 'fail', dockPick.why);
  } else {
    record(
      '선착장 후보가 지도에 보인다 — 잔교 하나가 후보 하나 (K33)',
      dockPick.cands.length >= 2 ? 'pass' : 'fail',
      `후보 ${dockPick.cands.length}개 · ${dockPick.cands.map((c) => `(${c.x},${c.y})`).join(' ')}`,
    );
    // 고르지 않은 후보를 화면에서 탭한다
    const other = (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const sx = cr.width / cv.width, sy = cr.height / cv.height;
      const cur = h.coursePanel.state.dock;
      const pick = h.scene.dockMarks.find((c) => c.x !== cur.x || c.y !== cur.y);
      if (!pick) return null;
      h.scene.focusTile(pick.x, pick.y, 160);
      const r = h.scene.tileScreenRect(pick.x, pick.y);
      return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy), tile: pick };
    })()`)) as { x: number; y: number; tile: { x: number; y: number } } | null;
    if (other === null) {
      record('선착장을 탭하면 코스가 그쪽으로 옮겨진다 (K33)', 'fail', '다른 후보가 없다');
    } else {
      await page.touchscreen.tap(other.x, other.y);
      await page.waitForTimeout(400);
      const now = (await page.evaluate(
        `JSON.stringify(window.__kairo.coursePanel.state.dock)`,
      )) as string;
      record(
        '★ 선착장을 탭하면 코스가 그쪽으로 옮겨진다 (K33)',
        now === JSON.stringify(other.tile) ? 'pass' : 'fail',
        `${JSON.stringify(dockPick.before)} → ${now} (탭한 곳 ${JSON.stringify(other.tile)})`,
      );
    }
  }

  /* 확정도 **버튼을 눌러서** 된다 — `confirmForTest` 가 아니라 */
  const byButton = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 물 위로 핸들을 옮겨 유효하게 만든다 (여기서는 확정 경로만 본다)
    const t = h.terrain, st = h.coursePanel.state;
    const water = [];
    for (let j = 1; j < 46 && water.length < st.handles.length; j++) {
      for (let i = 1; i < 62; i++) {
        if (!t.isWater(i, j)) continue;
        const d = Math.abs(i - st.dock.x) + Math.abs(j - st.dock.y);
        if (d < 3 || d > 12) continue;
        water.push({ i: i, j: j });
        break;
      }
    }
    for (let k = 0; k < water.length; k++) h.coursePanel.moveHandleForTest(k, water[k].i, water[k].j);
    const btn = document.getElementById('kairo-course-confirm');
    return { before: h.courses.count, cash: h.week.cash, disabled: btn.disabled };
  })()`)) as { before: number; cash: number; disabled: boolean };
  if (!byButton.disabled) await page.click('#kairo-course-confirm');
  await page.waitForTimeout(300);
  const afterBtn = (await page.evaluate(
    `(() => { const h = window.__kairo; return { count: h.courses.count, cash: h.week.cash }; })()`,
  )) as { count: number; cash: number };
  record(
    '★ 확정 버튼을 눌러 코스가 생긴다 — 백도어가 아니라 (K33)',
    !byButton.disabled && afterBtn.count > byButton.before && afterBtn.cash < byButton.cash
      ? 'pass'
      : 'fail',
    `코스 ${byButton.before} → ${afterBtn.count} · ` +
      `현금 ${Math.round(byButton.cash / 10000)}만 → ${Math.round(afterBtn.cash / 10000)}만` +
      (byButton.disabled ? ' · ⚠ 확정 버튼이 잠겨 있었다' : ''),
  );

  await page.evaluate(`document.getElementById('kairo-course-close').click()`);

  /*
   * ── 8·직원 (§11) ──
   *
   * 여섯 동사 중 "사람을 쓴다". **인건비가 실제로 나가고 부족이 결과를 바꾸는지**를 본다.
   */
  const staffUi = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-staff-open');
    if (!open) return { ok: false, why: '직원 버튼이 없다' };
    const openH = Math.round(open.getBoundingClientRect().height);
    open.click();
    const panel = document.getElementById('kairo-staff');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '직원 시트가 안 열린다' };
    }
    const rows = [...panel.querySelectorAll('div[data-role]')];
    const btns = [...panel.querySelectorAll('button[data-role]')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const before = window.__kairo.staff.total;
    // + 를 세 번 눌러 실제로 고용되는지
    const plus = btns.filter((b) => b.dataset.delta === '1');
    plus[0].click(); plus[1].click(); plus[1].click();
    const after = window.__kairo.staff.total;
    const wage = window.__kairo.staff.weeklyWage();
    return {
      ok: true, openH: openH, rows: rows.length, btns: btns.length,
      minBtn: heights.length ? Math.min.apply(null, heights) : 0,
      before: before, after: after, wage: wage,
      overflow: panel.scrollWidth > panel.clientWidth,
      text: panel.textContent.slice(0, 60)
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    openH?: number;
    rows?: number;
    btns?: number;
    minBtn?: number;
    before?: number;
    after?: number;
    wage?: number;
    overflow?: boolean;
  };

  /*
   * 경영 3탭 (§15.9) — 가격·직원·개선. **후반 공백을 메우는 장치**다:
   * 확장이 등급 상한에 막힌 뒤에도 값과 개선이 남아야 80주가 비지 않는다.
   */
  const manage = (await page.evaluate(`(() => {
    const panel = document.getElementById('kairo-staff');
    if (!panel) return { ok: false, why: '경영 패널이 없다' };
    const tabs = [...panel.querySelectorAll('button[data-manage]')];
    if (tabs.length !== 3) return { ok: false, why: '탭이 3개가 아니다: ' + tabs.length };
    // 가격 탭
    tabs.find((b) => b.dataset.manage === 'price').click();
    const slider = document.getElementById('kairo-price');
    const sliderH = Math.round(slider.getBoundingClientRect().height);
    const before = window.__kairo.priceMult ? window.__kairo.priceMult() : 1;
    slider.value = '130';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const after = window.__kairo.priceMult ? window.__kairo.priceMult() : 1;
    // 개선 탭
    tabs.find((b) => b.dataset.manage === 'upgrade').click();
    const rows = [...panel.querySelectorAll('div[data-upgrade]')];
    const lvBefore = window.__kairo.placement.averageLevel();
    const btn = rows.length ? rows[0].querySelector('button') : null;
    const enabled = btn ? !btn.disabled : false;
    if (btn && !btn.disabled) btn.click();
    const lvAfter = window.__kairo.placement.averageLevel();
    // 원상복구 — 뒤 검사들이 정가를 기대한다
    tabs.find((b) => b.dataset.manage === 'price').click();
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      ok: true, tabs: tabs.length, sliderH: sliderH,
      priceBefore: before, priceAfter: after,
      upgradeRows: rows.length, enabled: enabled,
      lvBefore: lvBefore, lvAfter: lvAfter
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    tabs?: number;
    sliderH?: number;
    priceBefore?: number;
    priceAfter?: number;
    upgradeRows?: number;
    enabled?: boolean;
    lvBefore?: number;
    lvAfter?: number;
  };

  record(
    '경영이 가격·직원·개선 3탭이다 (§15.9)',
    manage.ok ? 'pass' : 'fail',
    manage.ok ? `${manage.tabs}탭 · 슬라이더 ${manage.sliderH}px` : (manage.why ?? '실패'),
  );
  record(
    '요금 슬라이더가 실제로 값을 바꾼다 — 여섯 동사 중 "값을 매긴다"',
    (manage.priceAfter ?? 1) > (manage.priceBefore ?? 1) ? 'pass' : 'fail',
    `${manage.priceBefore} → ${manage.priceAfter}`,
  );
  record(
    '개선 목록이 뜨고 누르면 단계가 오른다 — 확장이 막힌 뒤의 성장 수단',
    (manage.upgradeRows ?? 0) > 0 &&
      (!manage.enabled || (manage.lvAfter ?? 0) > (manage.lvBefore ?? 0))
      ? 'pass'
      : 'fail',
    `${manage.upgradeRows}개 · 평균 단계 ${(manage.lvBefore ?? 0).toFixed(2)} → ` +
      `${(manage.lvAfter ?? 0).toFixed(2)}${manage.enabled ? '' : ' (현금 부족)'}`,
  );

  record(
    '직원 시트가 열리고 5직종이 보인다',
    staffUi.ok && staffUi.rows === 5 ? 'pass' : 'fail',
    staffUi.ok ? `${staffUi.rows}직종 · 버튼 ${staffUi.btns}개` : (staffUi.why ?? '실패'),
  );
  record(
    '직원 버튼·증감 버튼이 44px 이상 — 폰 터치 타깃',
    (staffUi.openH ?? 0) >= 44 && (staffUi.minBtn ?? 0) >= 44 ? 'pass' : 'fail',
    `열기 ${staffUi.openH ?? 0}px · 증감 최소 ${staffUi.minBtn ?? 0}px`,
  );
  record(
    '고용하면 인원과 주급이 오른다',
    (staffUi.after ?? 0) === (staffUi.before ?? 0) + 3 && (staffUi.wage ?? 0) > 0 ? 'pass' : 'fail',
    `${staffUi.before} → ${staffUi.after}명 · 주급 ${staffUi.wage}`,
  );
  record(
    '직원 시트가 가로로 안 넘친다',
    staffUi.overflow === false ? 'pass' : 'fail',
    staffUi.overflow ? '넘침' : 'OK',
  );

  const staffWeek = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const eff = h.staff.effects(h.placement);
    const withStaff = h.week.run(new h.Rng(4242), {
      season: 'summer',
      staff: { wages: eff.wages, satisfactionDelta: eff.satisfactionDelta,
               foodMult: eff.foodMult, idle: new Set() },
    });
    const without = h.week.run(new h.Rng(4242), { season: 'summer' });
    return {
      wages: withStaff.wages, wagesNone: without.wages,
      profitWith: withStaff.profit, profitWithout: without.profit,
      identity: withStaff.profit === withStaff.revenue - withStaff.upkeep - withStaff.wages
    };
  })()`)) as {
    wages: number;
    wagesNone: number;
    profitWith: number;
    profitWithout: number;
    identity: boolean;
  };
  record(
    '인건비가 손익에서 빠진다 — 고정비다',
    staffWeek.wages > 0 && staffWeek.wagesNone === 0 && staffWeek.identity ? 'pass' : 'fail',
    `인건비 ${staffWeek.wages} · 손익 ${staffWeek.profitWith} = 수익−유지비−인건비`,
  );

  await page.evaluate(`document.getElementById('kairo-staff-close').click()`);

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
  // 붓을 끄면 onTapTile 이 해석한 타일을 콘솔에 찍는다 (K28: 전용 훅으로 끈다)
  await page.evaluate(`window.__kairoClearBrush && window.__kairoClearBrush()`);
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
    /*
     * K28: 붓 바와 드롭다운이 사라졌다. 건설 시트를 열고 격자에서 고른다 —
     * 플레이어가 실제로 하는 경로 그대로다.
     */
    document.getElementById('kairo-build-open').click();
    // 시트는 마지막으로 본 탭을 기억한다 — 시설 탭을 명시해야 한다
    const ftab = document.querySelector('#kairo-sheet [data-tab="facility"]');
    if (ftab) ftab.click();
    const pick = document.querySelector('[data-pick="facility:shop"]');
    if (!pick) return { ok: false, why: '건설 시트에서 매점을 못 찾았다', tiles: [] };
    pick.click();
    if (!window.__kairoBrush || window.__kairoBrush() !== 'facility') {
      return { ok: false, why: '고른 뒤에도 붓이 facility 가 아니다', tiles: [] };
    }
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
    ${LAND_BOX}
    const tiles = [];
    for (let j = J0; j < J1 && tiles.length < 8; j++) {
      for (let i = I0; i < I1 && tiles.length < 8; i++) {
        if (fits(i, j)) tiles.push([i, j]);
      }
    }
    return { ok: true, tiles: tiles, count: h.placement.count, brush: window.__kairoBrush ? window.__kairoBrush() : null };
  })()`)) as { ok: boolean; why?: string; tiles: [number, number][]; count?: number; brush?: string | null };

  // 길을 깔아 둔다 — 탭으로 놓는 것을 보려는 절이지 길을 보려는 절이 아니다 (K32-B)
  await page.evaluate(PAVE_ALL);
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
    /*
     * K32: 탭하면 **고스트 + 확정 바**가 뜬다. 바로 안 놓인다 — 회전과 "장비 탄 손님"이
     * 나중에 들어오므로 놓기 전에 만질 수 있는 상태를 뒀다. 확정을 눌러야 놓인다.
     */
    const ghost = (await page.evaluate(`(() => {
      const c = document.getElementById('kairo-confirm');
      const btn = document.getElementById('kairo-place-confirm');
      return { bar: !!c && !c.hidden, ok: !!btn && !btn.disabled,
               label: c ? (c.querySelector('.place-label') || {}).textContent : '',
               ghost: !!window.__kairo.scene.ghost };
    })()`)) as { bar: boolean; ok: boolean; label: string; ghost: boolean };
    if (ghost.bar && ghost.ok) {
      const before = (await page.evaluate(`window.__kairo.placement.count`)) as number;
      if (before !== countBefore) tapDetail += ` · ⚠ 확정 전에 이미 놓였다`;
      await page.click('#kairo-place-confirm');
      await page.waitForTimeout(400);
    } else if (ghost.bar) {
      tapDetail += ` · (${ti},${tj}) 거절 "${ghost.label}"`;
      await page.click('#kairo-place-cancel');
      await page.waitForTimeout(200);
      continue;
    }
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

  /*
   * ── 9b. HUD 가 화면을 얼마나 먹나 · 두 방향 (K28) ──
   *
   * "투박하다"를 숫자로 못박는다. 재보니 예전 HUD 는 폰 세로에서 **화면의 40%** 를
   * 덮었고 상시 컨트롤이 **15개**였다. 레퍼런스(Pool Slide Story)를 같은 방법으로
   * 재면 ~14% · 버튼 2개다.
   *
   * 세로·가로를 **둘 다** 본다. 한쪽만 보면 안 본 쪽이 깨진다.
   */
  const MEASURE_HUD = `(() => {
    const W = innerWidth, H = innerHeight;
    const boxes = [];
    for (const el of document.body.children) {
      if (el.tagName === 'CANVAS' || el.id === 'game' || el.hidden) continue;
      // 디버그 오버레이는 개발용이라 실제 플레이에서는 숨는다. 이 하네스가 부팅
      // 판정에 쓰느라 켜 둔 것뿐이므로 예산에서 뺀다 (실제 사용자에게 없는 비용이다)
      if (el.id === 'kairo-debug') continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      boxes.push([r.left, r.top, r.right, r.bottom]);
    }
    let hit = 0, tot = 0;
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
      tot++;
      if (boxes.some((c) => x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3])) hit++;
    }
    const ctrl = [...document.querySelectorAll('button, select, input')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const minTap = ctrl.length
      ? Math.min(...ctrl.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }))
      : 0;
    return { chrome: Math.round(hit / tot * 100), controls: ctrl.length,
             minTap: Math.round(minTap), overflow: document.documentElement.scrollWidth - W };
  })()`;

  /*
   * 예산은 방향마다 다르다 — **고정 높이 바(56px)가 화면 높이에서 차지하는 비율**이
   * 다르기 때문이다. 세로 852px 에서 6.6%, 가로 393px 에서 14.2% 다. 터치 타깃 44px 를
   * 지키면 바를 더 줄일 수 없으므로 가로는 여기가 사실상 바닥이다.
   * (레퍼런스도 720px 높이에서 60px 바 = 8.3% 였다.)
   */
  for (const [vw, vh, tag, budget] of [
    [393, 852, '세로', 14],
    [852, 393, '가로', 22],
  ] as const) {
    const cx = await browser.newContext({
      viewport: { width: vw, height: vh },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const m = (await pg.evaluate(MEASURE_HUD)) as {
      chrome: number;
      controls: number;
      minTap: number;
      overflow: number;
    };
    record(
      `${tag} — HUD 가 화면의 ${budget}% 이하 (예전 40%)`,
      m.chrome <= budget ? 'pass' : 'fail',
      `${m.chrome}%`,
    );
    record(
      `${tag} — 상시 컨트롤 3개 (메뉴·건설·한 주)`,
      m.controls === 3 ? 'pass' : 'fail',
      `${m.controls}개`,
    );
    record(`${tag} — 터치 타깃 44px · 가로 넘침 0`,
      m.minTap >= 44 && m.overflow <= 0 ? 'pass' : 'fail',
      `최소 ${m.minTap}px · 넘침 ${m.overflow}px`);

    // 시트를 열면 덮이지만 닫으면 되돌아온다 — 시트가 안 닫히면 화면이 영영 좁다
    await pg.evaluate(`document.getElementById('kairo-build-open').click()`);
    await pg.waitForTimeout(150);
    const opened = (await pg.evaluate(MEASURE_HUD)) as { chrome: number; minTap: number };
    await pg.evaluate(`document.getElementById('kairo-sheet-close').click()`);
    await pg.waitForTimeout(150);
    const closed = (await pg.evaluate(MEASURE_HUD)) as { chrome: number };
    record(
      `${tag} — 시트를 닫으면 화면이 돌아온다`,
      opened.chrome > m.chrome && closed.chrome === m.chrome ? 'pass' : 'fail',
      `닫힘 ${m.chrome}% → 열림 ${opened.chrome}% → 닫힘 ${closed.chrome}%`,
    );
    record(
      `${tag} — 시트 안 터치 타깃도 44px`,
      opened.minTap >= 44 ? 'pass' : 'fail',
      `최소 ${opened.minTap}px`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-hud-${tag}.png` });
    await cx.close();
  }

  /*
   * ── 9h. 고스트·블록 붓·코스 탭 (K32) ──
   *
   * 탭하면 바로 놓던 것을 **고스트 → 확정**으로 바꿨다. 회전과 "장비 탄 손님" 그림이
   * 나중에 들어오므로 놓기 전에 만질 수 있는 상태가 필요하다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    const r = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, sc = h.scene;
      const countIndoor = () => { let n = 0;
        for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) if (t.isIndoor(i, j)) n++;
        return n; };
      const out = {};

      // ① 건물 블록 4×4 — 빈 잔디에 칠하면 실내가 16 늘고 값이 그만큼 나간다
      out.indoor0 = countIndoor();
      out.cash0 = h.week.cash;
      /*
       * ⚠ 탭 좌표를 박지 않는다 (K36). 격자가 96×72 가 되고 입구가 가운데로 가면서
       * (13,6) 은 도시 띠·내 땅 밖이 됐다. **토지 안 빈 잔디**를 찾아 쓴다.
       */
      const _L = h.land();
      let TI = -1, TJ = -1;
      for (let j = _L.j0 + 1; j < _L.j0 + _L.h - 5 && TI < 0; j++) {
        for (let i = _L.i0 + 1; i < _L.i0 + _L.w - 5; i++) {
          let free = true;
          /*
           * ⚠ 잔디만 찾으면 안 된다 — 앞 절들이 판을 통째로 포장해 뒀다 (PAVE_ALL).
           * 실내 바닥은 포장 위에도 깔린다. 조건은 "지을 수 있고 · 실내가 아니고 · 비었다".
           */
          for (let dj = 0; dj < 5 && free; dj++)
            for (let di = 0; di < 5; di++)
              if (!h.terrain.isBuildable(i + di, j + dj) || h.terrain.isWater(i + di, j + dj) ||
                  h.terrain.isIndoor(i + di, j + dj) || h.placement.handleAt(i + di, j + dj)) { free = false; break; }
          if (free) { TI = i; TJ = j; break; }
        }
      }
      out.TI = TI; out.TJ = TJ; out.landBox = _L;
      /*
       * ⚠ **길을 먼저 붙인다** (K32-B 이후). 잔디 섬에 방을 지으면 문이 안 나고,
       * paintFloorBlock 이 no-door 로 통째로 되돌려 "실내 +0" 이 된다.
       */
      const _g = h.gate;
      for (let k = Math.min(_g.i, TI - 1); k <= Math.max(_g.i, TI - 1); k++) {
        if (h.terrain.isWalkable(k, _g.j) && h.terrain.isBuildable(k, _g.j)) h.terrain.paint(k, _g.j, 'path_stone');
      }
      for (let k = _g.j; k <= TJ + 4; k++) {
        if (h.terrain.isWalkable(TI - 1, k) && h.terrain.isBuildable(TI - 1, k)) h.terrain.paint(TI - 1, k, 'path_stone');
      }
      h.guests.invalidate();
      document.getElementById('kairo-build-open').click();
      document.querySelector('#kairo-sheet [data-tab="building"]').click();
      document.querySelector('[data-pick="ground:floor_indoor@4"]').click();
      h.tapTile(TI, TJ);
      out.indoor1 = countIndoor();
      out.cash1 = h.week.cash;

      // ② 고스트 — 시설을 고르고 탭하면 아직 안 놓인다
      out.count0 = h.placement.count;
      document.getElementById('kairo-build-open').click();
      document.querySelector('#kairo-sheet [data-tab="facility"]').click();
      document.querySelector('[data-pick="facility:toilet"]').click();
      h.tapTile(TI, TJ);
      const c = document.getElementById('kairo-confirm');
      out.bar = !!c && !c.hidden;
      out.ghost = !!sc.ghost;
      out.countAfterTap = h.placement.count;
      out.rotateDisabled = document.getElementById('kairo-place-rotate').disabled;

      // 취소하면 안 놓인다
      document.getElementById('kairo-place-cancel').click();
      out.countAfterCancel = h.placement.count;
      out.ghostAfterCancel = !!sc.ghost;

      // 다시 탭하고 확정하면 놓인다
      h.tapTile(TI, TJ);
      const cf = document.getElementById('kairo-place-confirm');
      out.barBefore = !document.getElementById('kairo-confirm').hidden;
      out.confirmDisabled = cf.disabled;
      out.label2 = (document.getElementById('kairo-confirm').querySelector('.place-label') || {}).textContent;
      cf.click();
      out.countAfterConfirm = h.placement.count;
      return out;
    })()`)) as Record<string, number | boolean>;

    record(
      '건물 4×4 블록이 실내를 16칸 늘리고 값이 그만큼 나간다 (K32)',
      (r.indoor1 as number) - (r.indoor0 as number) === 16 &&
        (r.cash0 as number) - (r.cash1 as number) === 16 * 30000
        ? 'pass'
        : 'fail',
      `실내 +${(r.indoor1 as number) - (r.indoor0 as number)} · TI ${String(r.TI)},${String(r.TJ)} · 토지 ${JSON.stringify(r.landBox)} · 현금 −${Math.round(
        ((r.cash0 as number) - (r.cash1 as number)) / 10000,
      )}만`,
    );
    record(
      '시설을 탭하면 고스트가 뜨고 **아직 안 놓인다**',
      r.bar === true && r.ghost === true && r.countAfterTap === r.count0 ? 'pass' : 'fail',
      `바 ${String(r.bar)} · 고스트 ${String(r.ghost)} · 시설 ${String(r.countAfterTap)}`,
    );
    record(
      '취소하면 안 놓이고 고스트가 사라진다',
      r.countAfterCancel === r.count0 && r.ghostAfterCancel === false ? 'pass' : 'fail',
      `시설 ${String(r.countAfterCancel)} · 고스트 ${String(r.ghostAfterCancel)}`,
    );
    record(
      '확정하면 놓인다',
      (r.countAfterConfirm as number) === (r.count0 as number) + 1 ? 'pass' : 'fail',
      `${String(r.count0)} → ${String(r.countAfterConfirm)} · 바 ${String(r.barBefore)} · disabled ${String(r.confirmDisabled)} · "${String(r.label2)}"`,
    );
    record(
      '회전 버튼은 자리만 잡혀 있다 (방향 스프라이트가 생기면 켠다)',
      r.rotateDisabled === true ? 'pass' : 'fail',
      `disabled ${String(r.rotateDisabled)}`,
    );
    await cx.close();
  }

  /*
   * ── 9g. 해금된 토지가 화면에 보인다 (K32) ──
   *
   * ⚠ K25 에 넣은 기능인데 **K32 까지 죽어 있었다.** `setLand` 가 씬 타일이 생기기 전에
   * 불려 조용히 아무것도 안 했고, **아무도 tint 를 안 봐서** 검사 155개가 전부 통과했다.
   * 그래서 이 검사를 넣는다 — 음성 대조군까지 같이.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const tint = (await pg.evaluate(`(() => {
      const sc = window.__kairo.scene, h = window.__kairo;
      const W = h.terrain.width, H = h.terrain.height;
      const at = (i, j) => {
        const t = sc.tileImages[j * W + i];
        return t ? (t.tintTopLeft >>> 0).toString(16) : 'none';
      };
      /*
       * K36: 토지는 입구를 중심으로 **좌우로** 자라는 오프셋 사각형이다. 표본을 실제
       * 사각형에서 뽑는다 — 좌표를 박으면 등급 값이 바뀔 때마다 검사가 거짓말을 한다.
       */
      const L = h.land();
      const inside = [L.i0 + 1, L.j0 + 1];
      const outX = [Math.min(W - 1, L.i0 + L.w + 1), L.j0 + 1];
      const outY = [L.i0 + 1, Math.min(H - 1, L.j0 + L.h + 1)];
      const before = { inside: at(inside[0], inside[1]), outX: at(outX[0], outX[1]), outY: at(outY[0], outY[1]) };
      // 음성 대조군 — 토지를 격자 전체로 넓히면 밖이 사라져 전부 같아야 한다
      sc.setLand({ i0: 0, j0: 0, w: W, h: H });
      const all = { inside: at(inside[0], inside[1]), outX: at(outX[0], outX[1]), outY: at(outY[0], outY[1]) };
      return { before: before, all: all };
    })()`)) as {
      before: { inside: string; outX: string; outY: string };
      all: { inside: string; outX: string; outY: string };
    };

    record(
      '해금된 토지 밖이 어둡게 표시된다 (K32)',
      tint.before.inside !== tint.before.outX && tint.before.inside !== tint.before.outY
        ? 'pass'
        : 'fail',
      `안 ${tint.before.inside} · 밖 ${tint.before.outX}/${tint.before.outY}`,
    );
    record(
      '⚠ 음성 대조군 — 토지를 다 열면 구분이 사라진다 (검사가 유의미한가)',
      tint.all.inside === tint.all.outX && tint.all.inside === tint.all.outY ? 'pass' : 'fail',
      `안 ${tint.all.inside} · 밖 ${tint.all.outX}/${tint.all.outY}`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-land.png` });
    await cx.close();
  }

  /*
   * ── 9f. 새 판이 빈 땅이 아니다 (K30) ──
   *
   * 빈 땅에서 시작하면 위생 시설 9종이 전부 `needs-indoor` 로 막히는데 첫 의뢰가
   * "기본 위생 3개"였다. 물려받은 빠지가 그 벽을 없앤다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    // 세이브를 지우고 새 판으로 들어간다 — 저장된 판이 있으면 킷이 안 돈다
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(`${URL}&map=bukhan&scenario=inherited`, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const start = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, p = h.placement;
      let indoor = 0;
      for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) if (t.isIndoor(i, j)) indoor++;
      // 화장실을 놓을 수 있나 — 이게 이 킷의 존재 이유다
      let canToilet = false;
      // K36: 좌표 창을 박지 않는다 — 실내 칸을 직접 훑는다 (킷 방이 맵 가운데로 갔다)
      for (let j = 0; j < t.height && !canToilet; j++) {
        for (let i = 0; i < t.width; i++) {
          if (!t.isIndoor(i, j)) continue;
          if (p.check(t, h.walls, h.gate, 'toilet', i, j).ok) { canToilet = true; break; }
        }
      }
      return { facilities: p.count, indoor: indoor, canToilet: canToilet,
               courses: h.courses ? h.courses.count : -1 };
    })()`)) as { facilities: number; indoor: number; canToilet: boolean; courses: number };

    record(
      '새 판이 빈 땅이 아니다 — 물려받은 빠지 (K30)',
      start.facilities > 0 && start.indoor > 0 ? 'pass' : 'fail',
      `시설 ${start.facilities}개 · 실내 ${start.indoor}칸 · 코스 ${start.courses}개`,
    );
    record(
      '★ 첫 화면에서 화장실을 놓을 수 있다 — 빈 땅이면 위생 9종이 전부 막힌다',
      start.canToilet ? 'pass' : 'fail',
      `${start.canToilet}`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-newgame-start.png` });
    await cx.close();
  }

  /*
   * ── 9d. 표면이 실제로 입체인가 (K29) ──
   *
   * CSS 에 그라디언트를 적었다고 화면에 보인다는 보장이 없다. **렌더된 픽셀**을 잘라
   * 위·아래 밝기를 비교한다. 평면이면 차이가 0 이다 (K29 이전 상태).
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const box = (await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-week').getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y),
               width: Math.round(b.width), height: Math.round(b.height) };
    })()`)) as { x: number; y: number; width: number; height: number };
    const shot = await pg.screenshot({ clip: box });
    /*
     * PNG 를 직접 뜯지 않고 캔버스에 그려 읽는다 — 브라우저가 이미 디코더를 갖고 있다.
     * (Node 쪽에 이미지 라이브러리를 새로 들이지 않으려는 이유이기도 하다.)
     */
    const b64 = shot.toString('base64');
    const surf = (await pg.evaluate(
      `(async (data) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + data;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, cv.width, cv.height).data;
        const lum = (x, y) => {
          const k = (y * cv.width + x) * 4;
          return 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];
        };
        const rowMean = (y) => {
          let s = 0, n = 0;
          for (let x = 6; x < cv.width - 6; x++) { s += lum(x, y); n++; }
          return s / n;
        };
        const h = cv.height;
        return {
          w: cv.width, h: h,
          edge: rowMean(1),          // 최상단 — 반사 하이라이트
          top: rowMean(Math.round(h * 0.25)),
          bottom: rowMean(Math.round(h * 0.85)),
        };
      })(${JSON.stringify(b64)})`,
    )) as { w: number; h: number; edge: number; top: number; bottom: number };

    const grad = surf.top - surf.bottom;
    record(
      '버튼이 평면이 아니다 — 위아래 밝기 차 (K29)',
      grad >= 8 ? 'pass' : 'fail',
      `위 ${surf.top.toFixed(0)} · 아래 ${surf.bottom.toFixed(0)} · 차 ${grad.toFixed(0)}`,
    );
    record(
      '상단에 반사 하이라이트가 있다',
      surf.edge > surf.bottom + 4 ? 'pass' : 'fail',
      `최상단 ${surf.edge.toFixed(0)} vs 아래 ${surf.bottom.toFixed(0)}`,
    );
    await cx.close();
  }

  /*
   * ── 9e. 모션이 있고, 끄면 꺼진다 (K29) ──
   *
   * 기기 설정을 존중하는지는 **켠 상태와 끈 상태를 둘 다** 봐야 안다.
   * 한쪽만 보면 "애니메이션이 원래 없다"와 구분이 안 된다.
   */
  for (const [reduce, tag] of [
    [false, '모션 켬'],
    [true, '모션 줄임'],
  ] as const) {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: reduce ? 'reduce' : 'no-preference',
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const anim = (await pg.evaluate(`(() => {
      document.getElementById('kairo-build-open').click();
      const sh = document.getElementById('kairo-sheet');
      const st = getComputedStyle(sh);
      return { name: st.animationName, dur: st.animationDuration };
    })()`)) as { name: string; dur: string };
    const on = anim.name !== 'none' && anim.dur !== '0s';
    record(
      `${tag} — 시트 등장 애니메이션 ${reduce ? '없음' : '있음'}`,
      on === !reduce ? 'pass' : 'fail',
      `${anim.name} ${anim.dur}`,
    );
    await cx.close();
  }

  /*
   * ── 9c. 방향을 바꿔도 판이 살아 있나 (K28) ──
   *
   * 회전은 폰에서 언제든 일어난다. 레이아웃만 다시 잡히면 되고 **게임 상태는 그대로**
   * 여야 한다. 우리 하네스에 이 검사가 없었다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const before = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      // 시설 몇 개를 놓아 "잃을 것"을 만든다
      const t = h.terrain, w = h.walls, p = h.placement;
      let n = 0;
      for (let i = 2; i < 20 && n < 4; i++) {
        if (p.place(t, w, h.gate, 'vending_out', i, 2).ok) n++;
      }
      return { facilities: p.count, cash: h.week ? h.week.cash : -1, week: h.week ? h.week.week : -1 };
    })()`)) as { facilities: number; cash: number; week: number };

    await pg.setViewportSize({ width: 852, height: 393 });

    await pg.waitForTimeout(500);
    const after = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      const cv = document.querySelector('canvas');
      return { facilities: h.placement.count, cash: h.week ? h.week.cash : -1,
               week: h.week ? h.week.week : -1, buf: [cv.width, cv.height],
               alive: !!(h.scene && h.scene.sys && h.scene.sys.game.loop.running) };
    })()`)) as {
      facilities: number;
      cash: number;
      week: number;
      buf: number[];
      alive: boolean;
    };
    record(
      '회전해도 판이 그대로다 — 시설·현금·주차 보존',
      after.facilities === before.facilities &&
        after.cash === before.cash &&
        after.week === before.week
        ? 'pass'
        : 'fail',
      `시설 ${before.facilities}→${after.facilities} · 현금 ${Math.round(before.cash / 10000)}만→${Math.round(after.cash / 10000)}만`,
    );
    record(
      '회전 뒤 버퍼가 새 방향으로 다시 잡힌다',
      after.buf[0] === 852 && after.buf[1] === 393 && after.alive ? 'pass' : 'fail',
      `버퍼 ${after.buf.join('×')} · 루프 ${after.alive}`,
    );
    await cx.close();
  }

  // ── 9c. 포장한 바닥만 걷는다 · 입구가 보인다 (K32-B) ──
  //
  // 길을 어디로 내느냐가 곧 입구의 위치와 방향을 정한다. 새 저장 상태 없이 동사 하나가
  // 둘을 한다 — 그래서 검사도 "잔디는 막히고 포장은 통하는가"와 "문 앞이 보이는가" 둘이다.
  const pathUi = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, p = h.placement, sc = h.scene;
    const out = {};

    // ① 물려받은 빠지에는 문이 있고, 그 앞에 발판이 그려져 있다
    out.marks = sc.doorMarks.length;
    out.marksPaved = sc.doorMarks.every((m) => t.isGuestWalkable(m.i, m.j));
    /*
     * ⚠ 한 경계가 두 방향으로 보인다 (K25 — −I 는 이웃의 +I 다). 그대로 그리면 발판이
     * 실내에도 깔린다. 실측으로 새 판에서 2칸이 나왔고, 그중 하나가 방 안이었다.
     */
    out.marksOutside = sc.doorMarks.every((m) => !t.isIndoor(m.i, m.j));

    /*
     * ② 잔디 자리를 **만든다.** 앞 절들이 판을 통째로 포장해 뒀으므로 (PAVE_ALL) 그냥
     *    찾으면 없다. 6×6 육지를 잔디로 되돌리고 그 한복판 2×2 를 쓴다 — 가장자리 한 겹이
     *    해자가 되어 "옆 포장으로 닿아서 통과"가 안 생긴다.
     */
    ${LAND_BOX}
    let area = null;
    for (let j = J0 + 4; j < Math.min(J1, J0 + 30) && !area; j++) {
      for (let i = I0; i < I1 - 6; i++) {
        let ok = true;
        for (let dj = 0; dj < 6 && ok; dj++) {
          for (let di = 0; di < 6; di++) {
            const ti = i + di, tj = j + dj;
            /*
             * ⚠ **손 안 댄 잔디**만 고른다. 걸을 수 있는 칸으로만 고르면 물려받은 빠지의
             * 포장 마당이 후보가 되고, 뒤에서 잔디로 되돌릴 때 킷의 방문이 사라져
             * 벽 개수가 음수로 나온다 (실측: 경계 −28).
             */
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || p.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { area = [i, j]; break; }
      }
    }
    if (!area) return { ok: false, reason: '6×6 빈 육지를 못 찾았다' };
    for (let dj = 0; dj < 6; dj++) {
      for (let di = 0; di < 6; di++) {
        t.paint(area[0] + di, area[1] + dj, 'lawn');
        sc.refreshTile(area[0] + di, area[1] + dj);
      }
    }
    const spot = [area[0] + 2, area[1] + 2];
    out.spot = spot;
    const c0 = p.check(t, h.walls, h.gate, 'shop', spot[0], spot[1]);
    out.lawnFail = c0.fail || '(통과)';

    // ③ 게이트에서 그 자리까지 길을 깐다 — 최단이 아니어도 이어지기만 하면 된다
    for (let i = 0; i <= spot[0]; i++) if (t.isWalkable(i, 0)) t.paint(i, 0, 'path_stone');
    for (let j = 0; j <= spot[1]; j++) if (t.isWalkable(spot[0], j)) t.paint(spot[0], j, 'path_stone');
    const c1 = p.check(t, h.walls, h.gate, 'shop', spot[0], spot[1]);
    out.pavedOk = c1.ok;
    out.pavedFail = c1.fail || '';
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        marks: number;
        marksPaved: boolean;
        marksOutside: boolean;
        spot: number[];
        lawnFail: string;
        pavedOk: boolean;
        pavedFail: string;
      };

  if (!pathUi.ok) {
    record('포장한 바닥만 걷는다 (K32-B)', 'fail', pathUi.reason);
  } else {
    record(
      '★ 잔디에는 못 놓고, 길을 깔면 놓인다 — 길이 곧 동선이다 (K32-B)',
      pathUi.lawnFail === 'unreachable' && pathUi.pavedOk ? 'pass' : 'fail',
      `잔디 (${pathUi.spot.join(',')}) "${pathUi.lawnFail}" → 포장 후 ${
        pathUi.pavedOk ? '통과' : `"${pathUi.pavedFail}"`
      }`,
    );
    record(
      '문 앞 발판이 문 **바깥**에만 깔린다 (K32-B)',
      pathUi.marks > 0 && pathUi.marksPaved && pathUi.marksOutside ? 'pass' : 'fail',
      `발판 ${pathUi.marks}칸 · 포장 위 ${pathUi.marksPaved} · 전부 실외 ${pathUi.marksOutside}`,
    );
  }

  // 길 붓 — 한 칸씩 찍어서는 폰에서 길을 못 깐다 (K32-B)
  const roadBrush = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain;
    document.getElementById('kairo-build-open').click();
    document.querySelector('#kairo-sheet [data-tab="ground"]').click();
    const items = [...document.querySelectorAll('#kairo-sheet [data-pick]')];
    const labels = items.map((el) => el.textContent);
    const block = document.querySelector('[data-pick="ground:path_stone@3"]');
    if (!block) return { ok: false, reason: '석재 보도 3×3 붓이 없다', labels: labels.slice(0, 8) };
    block.click();
    /*
     * 잔디 3×3 을 **해금된 토지 안에** 만든다. 앞 절의 자리는 i=20 대라 1등급 토지 밖이라
     * tapTile 이 조용히 거절했다 (실측 — 검사가 0칸으로 나왔다). 게이트 가까이서 찾는다.
     */
    ${LAND_BOX}
    let spot = null;
    for (let j = J0; j < Math.min(J1, J0 + 16) && !spot; j++) {
      for (let i = I0; i < Math.min(I1, I0 + 16); i++) {
        let ok = true;
        for (let dj = -1; dj <= 1 && ok; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ti = i + di, tj = j + dj;
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || h.placement.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { spot = [i, j]; break; }
      }
    }
    if (!spot) return { ok: false, reason: '토지 안에서 3×3 빈 육지를 못 찾았다', labels: [] };
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      t.paint(spot[0] + di, spot[1] + dj, 'lawn');
      h.scene.refreshTile(spot[0] + di, spot[1] + dj);
    }
    const before = h.week.cash;
    let paved0 = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (t.kindAt(spot[0] + di, spot[1] + dj) === 'path_stone') paved0++;
    }
    h.tapTile(spot[0], spot[1]);
    let paved1 = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (t.kindAt(spot[0] + di, spot[1] + dj) === 'path_stone') paved1++;
    }
    const walkSub = labels.filter((x) => x.includes('손님 통행')).length;
    const noWalkSub = labels.filter((x) => x.includes('못 지나감')).length;
    const toastEl = document.getElementById('kairo-toast');
    return { ok: true, paved: paved1 - paved0, spent: before - h.week.cash, walkSub: walkSub,
      noWalkSub: noWalkSub,
      dbg: JSON.stringify({ spot: spot, brush: window.__kairoBrush ? window.__kairoBrush() : null,
        kind: t.kindAt(spot[0], spot[1]), cash: h.week.cash,
        toast: toastEl && !toastEl.hidden ? toastEl.textContent : '' }) };
  })()`)) as
    | { ok: false; reason: string; labels: string[] }
    | { ok: true; paved: number; spent: number; walkSub: number; noWalkSub: number; dbg: string };

  if (!roadBrush.ok) {
    record('길 붓이 블록으로 깐다 (K32-B)', 'fail', `${roadBrush.reason} · ${roadBrush.labels.join(' / ')}`);
  } else {
    record(
      '길 붓 3×3 이 아홉 칸을 한 번에 깐다 — 한 칸씩은 폰에서 못 깐다 (K32-B)',
      roadBrush.paved === 9 && roadBrush.spent > 0 ? 'pass' : 'fail',
      `포장 +${roadBrush.paved}칸 · ${Math.round(roadBrush.spent / 10000)}만 지출`,
    );
    record(
      '바닥 목록이 통행 여부를 말해 준다 — 규칙을 바꿨으면 알려줘야 한다',
      roadBrush.walkSub > 0 && roadBrush.noWalkSub > 0 ? 'pass' : 'fail',
      `"손님 통행" ${roadBrush.walkSub}개 · "못 지나감" ${roadBrush.noWalkSub}개`,
    );
  }
  await page.evaluate(`(() => { const s = document.getElementById('kairo-sheet'); if (s) s.hidden = true; })()`);

  // ⚠ 음성 대조군 — 방을 지우면 문도 발판도 사라진다 (그리는 것이 문을 따라오는가)
  const markControl = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, sc = h.scene;
    const before = sc.doorMarks.length;
    const undo = [];
    for (let j = 0; j < t.height; j++) {
      for (let i = 0; i < t.width; i++) {
        if (t.isIndoor(i, j)) { undo.push([i, j]); t.paint(i, j, 'path_stone'); }
      }
    }
    h.sim.bakeIndoorWalls(t, h.walls, h.gate, h.sim.guestWalkable(t, h.placement));
    sc.refreshAllWalls();
    const after = sc.doorMarks.length;
    // 되돌린다 — 뒤 절이 물려받은 방을 본다
    for (const [i, j] of undo) t.paint(i, j, 'floor_indoor');
    h.sim.bakeIndoorWalls(t, h.walls, h.gate, h.sim.guestWalkable(t, h.placement));
    sc.refreshAllWalls();
    return { before: before, after: after, restored: sc.doorMarks.length };
  })()`)) as { before: number; after: number; restored: number };
  record(
    '⚠ 음성 대조군 — 방을 지우면 발판도 사라진다 (검사가 유의미한가)',
    markControl.before > 0 && markControl.after === 0 && markControl.restored > 0
      ? 'pass'
      : 'fail',
    `발판 ${markControl.before} → 방 삭제 ${markControl.after} → 복구 ${markControl.restored}`,
  );

  // ── 9d. 패널 6종이 한 가족인가 (K34) ──
  //
  // 인라인 스타일을 걷어낸 이유가 "한 게임으로 보이게"였다. 그러면 **숫자로 물어야 한다** —
  // 머리 높이·닫기 버튼·선택 색이 패널마다 같은가. 색만 토큰으로 바꾸고 구조가 제각각이면
  // 이 작업은 반쪽이다.
  const family = (await page.evaluate(`(() => {
    const ids = ['kairo-staff', 'kairo-catalog', 'kairo-newgame', 'kairo-course'];
    const openers = {
      'kairo-staff': 'kairo-staff-open',
      'kairo-catalog': 'kairo-catalog-open',
      'kairo-newgame': 'kairo-newgame-open',
    };
    const out = [];
    for (const id of ids) {
      if (id === 'kairo-course') {
        document.getElementById('kairo-build-open').click();
        document.querySelector('#kairo-sheet [data-tab="course"]').click();
      } else {
        document.getElementById('kairo-menu-open').click();
        const o = document.getElementById(openers[id]);
        if (!o) continue;
        o.click();
      }
      const p = document.getElementById(id);
      if (!p || p.hidden) continue;
      const head = p.querySelector('.ksheet-head, .kcourse-bar');
      const close = p.querySelector('button[id$="-close"], #kairo-course-close');
      out.push({
        id: id,
        head: head ? Math.round(head.getBoundingClientRect().height) : 0,
        close: close ? Math.round(close.getBoundingClientRect().height) : 0,
        font: getComputedStyle(p).fontFamily.indexOf('system-ui') >= 0
      });
      const c = document.getElementById(id.replace('kairo-', 'kairo-') + '-close');
      if (c) c.click();
      else document.getElementById('kairo-course-close')?.click();
    }
    return out;
  })()`)) as { id: string; head: number; close: number; font: boolean }[];

  const closeH = family.map((f) => f.close);
  record(
    '★ 패널들의 닫기 버튼이 같은 크기다 — 한 가족으로 보이려면 (K34)',
    family.length >= 3 && Math.max(...closeH) - Math.min(...closeH) <= 2 ? 'pass' : 'fail',
    family.map((f) => `${f.id.replace('kairo-', '')} ${f.close}px`).join(' · '),
  );
  record(
    '패널 글꼴이 한 벌이다',
    family.length >= 3 && family.every((f) => f.font) ? 'pass' : 'fail',
    `${family.filter((f) => f.font).length}/${family.length}`,
  );

  /*
   * ★ 선택 표시가 **한 색**이어야 한다.
   *
   * 예전엔 경영 탭·새 판 맵·도감 탭이 청록(#7ad0ff)이고 하단 바·코스는 노랑(--accent)
   * 이었다 — 같은 게임 안에서 "고름"이 두 색이었다. 실제 화면에서 색을 읽어 확인한다.
   */
  const selColors = (await page.evaluate(`(() => {
    const seen = {};
    const grab = (id, sel) => {
      const p = document.getElementById(id);
      if (!p || p.hidden) return;
      const on = p.querySelector(sel);
      if (on) seen[id] = getComputedStyle(on).borderTopColor;
    };
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-catalog-open').click();
    grab('kairo-catalog', 'button[data-tab].on');
    document.getElementById('kairo-catalog-close').click();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-newgame-open').click();
    grab('kairo-newgame', 'button[data-map].on');
    document.getElementById('kairo-newgame-close').click();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-staff-open').click();
    grab('kairo-staff', 'button[data-manage].on');
    document.getElementById('kairo-staff-close').click();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return { seen: seen, accent: accent };
  })()`)) as { seen: Record<string, string>; accent: string };
  const sel = Object.values(selColors.seen);
  record(
    '★ 선택 표시가 패널 전체에서 한 색이다 (K34)',
    sel.length >= 3 && new Set(sel).size === 1 ? 'pass' : 'fail',
    Object.entries(selColors.seen)
      .map(([k, v]) => `${k.replace('kairo-', '')} ${v}`)
      .join(' · ') + ` (토큰 ${selColors.accent})`,
  );

  /* 감상 화면을 닫으면 HUD 가 돌아온다 — 형제의 display 를 직접 만지는 유일한 패널이다 */
  const showcaseRestore = (await page.evaluate(`(() => {
    const count = () => [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 2).length;
    const before = count();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-showcase-open').click();
    const during = count();
    document.getElementById('kairo-showcase-close').click();
    return { before: before, during: during, after: count() };
  })()`)) as { before: number; during: number; after: number };
  record(
    '★ 감상 화면을 닫으면 HUD 가 그대로 돌아온다 (K34)',
    showcaseRestore.during < showcaseRestore.before &&
      showcaseRestore.after === showcaseRestore.before
      ? 'pass'
      : 'fail',
    `버튼 ${showcaseRestore.before} → ${showcaseRestore.during} → ${showcaseRestore.after}`,
  );

  // ── 9e. 출입구를 놓아 건물을 통로로 (K36-B) ──
  //
  // 카이로에서 건물은 **지나가는 곳**이기도 하다. 문이 하나면 막다른 곳이라 손님이 빙
  // 돌아간다. 사용자 요청: "입구 말고도 설치할 수 있는 입출구를 둬서 통과할 수 있게".
  const doorUi = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls;
    const out = { before: w.count(2) };
    document.getElementById('kairo-build-open').click();
    document.querySelector('#kairo-sheet [data-tab="building"]').click();
    const pick = document.querySelector('[data-pick="door:door"]');
    if (!pick) return { ok: false, why: '출입구 붓이 건물 탭에 없다' };
    pick.click();
    out.brush = window.__kairoBrush ? window.__kairoBrush() : null;

    // 실내 칸 목록 — 서로 먼 두 칸을 골라 탭한다
    const cells = [];
    /*
     * ⚠ **시설이 없는** 실내 칸만 고른다. 시설이 놓인 칸은 손님이 못 서므로 문 후보가
     * 없다 ( 가 안쪽도 설 수 있어야 한다고 본다). 앞 절들이 시작 방에
     * 화장실을 놓아 뒀다 — 그 칸을 탭하면 정직하게 거절당한다.
     */
    for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++)
      if (t.isIndoor(i, j) && h.placement.handleAt(i, j) === 0) cells.push([i, j]);
    if (cells.length < 4) return { ok: false, why: '실내 칸이 부족하다' };
    const msg0 = () => { const m = document.getElementById('kairo-toast'); return m && !m.hidden ? m.textContent : ''; };
    const a = cells[0], b = cells[cells.length - 1];
    out.a = a; out.b = b;
    h.tapTile(a[0], a[1]);
    out.afterOne = w.count(2); out.msgA = msg0();
    h.tapTile(b[0], b[1]);
    out.afterTwo = w.count(2); out.msgB = msg0();
    out.wanted = h.doors.count;

    // 실내가 아닌 칸을 탭하면 이유를 말한다
    const msg = () => { const m = document.getElementById('kairo-toast'); return m && !m.hidden ? m.textContent : ''; };
    h.tapTile(h.gate.i, h.gate.j);
    out.outsideMsg = msg();
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; why: string }
    | {
        ok: true;
        before: number;
        afterOne: number;
        afterTwo: number;
        wanted: number;
        brush: string | null;
        outsideMsg: string;
        a: number[];
        b: number[];
        msgA: string;
        msgB: string;
      };

  if (!doorUi.ok) {
    record('★ 출입구 붓으로 문을 놓는다 (K36-B)', 'fail', doorUi.why);
  } else {
    record(
      '★ 출입구를 두 곳에 내면 문이 둘이 된다 — 건물이 통로가 된다 (K36-B)',
      doorUi.afterTwo === 2 && doorUi.wanted === 2 ? 'pass' : 'fail',
      `자동 ${doorUi.before} → 하나 ${doorUi.afterOne} → 둘 ${doorUi.afterTwo} · 희망 ${doorUi.wanted} · ` +
        `A(${doorUi.a.join(',')})"${doorUi.msgA}" B(${doorUi.b.join(',')})"${doorUi.msgB}"`,
    );
    record(
      '첫 문은 자동 문을 **대신한다** — 방마다 문이 둘씩 늘면 안 된다',
      doorUi.afterOne === 1 ? 'pass' : 'fail',
      `${doorUi.before} → ${doorUi.afterOne}`,
    );
    record(
      '건물 밖을 탭하면 이유를 말한다 — 거절은 처방까지 한다',
      doorUi.outsideMsg.includes('건물') ? 'pass' : 'fail',
      doorUi.outsideMsg || '(조용함)',
    );
  }

  /* 새로고침을 넘는다 — 희망이 세이브에 담기는가 */
  await page.evaluate(`window.__kairo.persist?.()`);
  await page.reload();
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const doorsKept = (await page.evaluate(
    `(() => { const h = window.__kairo; return { wanted: h.doors.count, doors: h.walls.count(2) }; })()`,
  )) as { wanted: number; doors: number };
  record(
    '★ 출입구가 새로고침을 넘는다 (K36-B)',
    doorsKept.wanted === 2 && doorsKept.doors === 2 ? 'pass' : 'fail',
    `희망 ${doorsKept.wanted} · 문 ${doorsKept.doors}`,
  );

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

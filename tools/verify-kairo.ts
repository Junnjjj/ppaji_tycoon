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
// 배경 겹 수·id 의 정본. 검사에 상수를 박으면 겹을 더할 때마다 검사가 깨진다 (K36-B)
import { KAIRO } from '../src/assets/kairo-contract.js';

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
    const items = [...sh.querySelectorAll('.ksheet-build [data-pick]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { pick: b.dataset.pick, w: Math.round(r.width), h: Math.round(r.height),
               locked: b.disabled, teaser: b.classList.contains('teaser'),
               thumb: !!b.querySelector('.kcard-thumb') };
    });
    const tabs = [...sh.querySelectorAll('.tab-btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return { t: b.textContent, w: Math.round(r.width), h: Math.round(r.height) };
    });
    const grounds = items.filter((x) => (x.pick || '').indexOf('ground:') === 0).length;
    const facilities = items.filter((x) => (x.pick || '').indexOf('facility:') === 0 && !x.teaser).length;
    // 해금분만 내는지 — 시트의 시설 수가 sim 의 '현 등급 이하' 수와 같아야 한다 (K40)
    const h = window.__kairo;
    const gradeNow = Number((/([0-9])등급/.exec(
      document.getElementById('kairo-grade').textContent) || [0, 0])[1]);
    const unlocked = Object.keys(h.simDefs).filter(
      (id) => h.quests.requiredGrade(id) <= gradeNow,
    ).length;
    const groups = [...sh.querySelectorAll('.kchips button')].map((g) => g.textContent);
    const all = items.concat(tabs.map((t) => ({ pick: 'tab', w: t.w, h: t.h, locked: false })));
    return { opened: true, grounds: grounds, facilities: facilities, groups: groups,
             unlocked: unlocked,
             teasers: items.filter((x) => x.teaser).length,
             thumbs: items.filter((x) => x.thumb).length,
             locked: items.filter((x) => x.locked && !x.teaser).length,
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
        unlocked: number;
        teasers: number;
        thumbs: number;
        locked: number;
        minH: number;
        minW: number;
        overflowX: number;
      };

  if (!sheet || !sheet.opened) {
    record('건설 시트', 'fail', sheet ? '열리지 않았다' : '건설 버튼을 못 찾았다');
  } else {
    record(
      '★ 건설 시트는 해금된 것만 카드로 낸다 — 잠김 45% 는 목록이 아니라 소음이다 (K40)',
      sheet.facilities === sheet.unlocked ? 'pass' : 'fail',
      `시설 카드 ${sheet.facilities} = 해금 ${sheet.unlocked} · 유형 칩 ${sheet.groups.length}개 (${sheet.groups.join('/')})`,
    );
    record(
      '다음에 올 것이 티저 두 장으로 예고된다 — 해금은 벽이 아니라 도착이다',
      sheet.teasers >= 1 && sheet.teasers <= 2 ? 'pass' : 'fail',
      `티저 ${sheet.teasers}장`,
    );
    record(
      '카드에 썸네일이 있다 — 게임과 같은 계약 그림 (concept-29)',
      sheet.thumbs >= sheet.facilities ? 'pass' : 'fail',
      `썸네일 ${sheet.thumbs}/${sheet.facilities + sheet.teasers}`,
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
      return [...sh.querySelectorAll('.ksheet-build [data-pick]')].map((b) => ({
        pick: b.dataset.pick,
        sub: (b.querySelector('.kcard-sub') || {}).textContent || '',
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

  /*
   * ── 7e-2. ★ 실내 시설이 벽 **안**에 있다 (K37 버그 ①) ──
   *
   * 시설과 앞쪽 벽(+I·+J)이 둘 다 `depthKey + 2` 라 깊이가 **동률**이었다. Phaser 는
   * 동률이면 삽입 순서로 그리고 벽은 부팅 때 먼저 만들어지므로 시설이 늘 벽을 덮었다 —
   * 실내에 놓은 시설이 벽 선을 지워 건물 밖으로 삐져나온 것처럼 보였다.
   *
   * 색을 짚지 않는다 (유리벽 검사에서 세 번 헛짚었다). 같은 자리를 **네 번** 찍는다:
   *   B 벽만 · A 아무것도 없음 · C 벽+시설 · D 시설만
   * `A ≠ B` 가 벽이 그린 픽셀, `A ≠ D` 가 시설이 그린 픽셀이다. 그 **교집합**이
   * 둘이 다투는 자리이고, 거기서 `C == B` 면 벽이 이겼다 (= 시설이 벽 안에 있다).
   * 교집합으로 좁히지 않으면 벽 픽셀 대부분이 애초에 안 다투는 자리라 **버그를 넣어도
   * 93% 가 유지되어 조용히 통과한다** (실측 — 그래서 이렇게 바꿨다).
   *
   * ⚠ 벽 이미지는 **시설보다 먼저** 만들어져 있어야 한다. 실제 부팅 순서가 그렇고,
   * 동률일 때 진짜 순서가 그때 정해지기 때문이다. 그래서 벽을 되돌린 **뒤에** 시설을 놓는다.
   * 좌표·시설은 씬에 물어본다 (격자가 또 바뀐다).
   */
  const inWall = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    // 픽셀을 네 번 찍는 동안 손님이 걸어 들어오면 A/B/C/D 가 어긋난다
    sc.setAutoTick(false);
    for (const x of g.all) {
      x.i = 2; x.j = t.height - 2; x.fromI = x.i; x.fromJ = x.j; x.progress = 1;
      x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
    }
    /*
     * 시설의 **가장 앞 타일**이 벽 있는 칸이어야 한다 — 시설 깊이가 그 타일 기준이라,
     * 거기서만 시설과 앞쪽 벽이 같은 칸을 두고 다툰다. 큰 시설일수록 겹치는 픽셀이 많아
     * 검사가 예민해지므로 4×1 → 3×1 → 1×1 순으로 시도한다.
     */
    const cands = [['shower_row', 4], ['changing_row', 3], ['arcade', 1]];
    let spot = null;
    for (let j = 0; j < t.height && !spot; j++) {
      for (let i = 0; i < t.width && !spot; i++) {
        if (!t.isIndoor(i, j)) continue;
        const kind = w.edgeAt(i, j, 1); // 1 = DIR_J_PLUS
        if (kind === 0) continue;
        for (const c of cands) {
          const oi = i - (c[1] - 1); // 가장 앞 타일이 (i, j) 가 되게 왼쪽으로 민다
          if (!p.check(t, w, h.gate, c[0], oi, j).ok) continue;
          spot = { i: i, j: j, kind: kind, def: c[0], oi: oi };
          break;
        }
      }
    }
    if (!spot) { sc.setAutoTick(true); return { ok: false, reason: '앞쪽 벽이 있는 빈 실내 칸을 못 찾았다' }; }
    sc.setUpscale(1);
    sc.focusTile(spot.i, spot.j);
    return { ok: true, i: spot.i, j: spot.j, kind: spot.kind, def: spot.def, oi: spot.oi };
  })()`)) as
    | { ok: false; reason: string }
    | { ok: true; i: number; j: number; kind: number; def: string; oi: number };

  if (!inWall.ok) {
    record('★ 실내 시설이 벽 안에 있다 (K37)', 'fail', inWall.reason);
  } else {
    const wi = inWall.i, wj = inWall.j;
    /*
     * 벽 스프라이트는 32 × (16 + 10) 이고 앵커가 타일 하단 꼭지점이다.
     * 그래서 표본은 타일 사각형에서 위로 10텍셀 넓힌 32×26 이다 (계약에서 온 수치).
     */
    const sampleWall = `(() => {
      const sc = window.__kairo.scene;
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const H = c.height;
      const r = sc.tileScreenRect(${wi}, ${wj});
      const x0 = r.x, y0 = r.y - 10, w = 32, hh = 26;
      const buf = new Uint8Array(w * hh * 4);
      gl.readPixels(x0, H - (y0 + hh), w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = '';
      for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
      return s;
    })()`;
    const setWall = (kind: number): string =>
      `(() => { const h = window.__kairo; h.walls.setEdge(${wi}, ${wj}, 1, ${kind}); h.scene.refreshWall(${wi}, ${wj}); })()`;

    // B — 벽만 (부팅 때 만들어진 그대로)
    await page.waitForTimeout(220);
    const wallOnlyPx = (await page.evaluate(sampleWall)) as string;
    // A — 벽을 잠시 걷는다
    await page.evaluate(setWall(0));
    await page.waitForTimeout(220);
    const noWall = (await page.evaluate(sampleWall)) as string;
    // 벽을 되돌린다 — 이 이미지가 시설보다 **먼저** 존재해야 한다
    await page.evaluate(setWall(inWall.kind));
    await page.waitForTimeout(220);

    // C — 벽 + 시설
    const placedIn = (await page.evaluate(`(() => {
      const h = window.__kairo, sc = h.scene;
      const r = h.placement.place(h.terrain, h.walls, h.gate, '${inWall.def}', ${inWall.oi}, ${wj});
      if (!r.ok || !r.placed) return { ok: false, why: String(r.fail) };
      sc.refreshFacility(r.placed.handle);
      return {
        ok: true,
        handle: r.placed.handle,
        facDepth: sc.facilityImageAt(r.placed.handle).depth,
        wallDepth: sc.wallDepthAt(${wi}, ${wj}, 1),
      };
    })()`)) as
      | { ok: false; why: string }
      | { ok: true; handle: number; facDepth: number; wallDepth: number };

    if (!placedIn.ok) {
      record('★ 실내 시설이 벽 안에 있다 (K37)', 'fail', `시설을 못 놓았다: ${placedIn.why}`);
    } else {
      await page.waitForTimeout(220);
      const withFac = (await page.evaluate(sampleWall)) as string;
      // D — 시설만 (벽을 걷는다)
      await page.evaluate(setWall(0));
      await page.waitForTimeout(220);
      const facOnly = (await page.evaluate(sampleWall)) as string;

      const A = noWall.split(';');
      const B = wallOnlyPx.split(';');
      const C = withFac.split(';');
      const D = facOnly.split(';');
      let overlap = 0;
      let wallWins = 0;
      let facWins = 0;
      const n = Math.min(A.length, B.length, C.length, D.length);
      for (let k = 0; k < n; k++) {
        // 벽도 그리고 시설도 그리는 자리 = 둘이 다투는 자리
        if (A[k] === B[k] || A[k] === D[k]) continue;
        if (B[k] === D[k]) continue; // 결과가 같으면 누가 이겼는지 못 가른다
        overlap++;
        if (C[k] === B[k]) wallWins++;
        else if (C[k] === D[k]) facWins++;
      }

      // ① 검사가 유효한가 — 다투는 픽셀이 충분히 있나
      record(
        '깊이 검사가 유효하다 (벽과 시설이 실제로 같은 픽셀을 다투나)',
        overlap >= 15 ? 'pass' : 'fail',
        `타일 ${wi},${wj} · ${inWall.def} · 다투는 픽셀 ${overlap}/${n}`,
      );
      // ② 그 자리에서 벽이 이긴다
      /*
       * 기준은 **비율이 아니라 `facWins === 0`** 이다. 다투는 자리에서 시설이 한 픽셀이라도
       * 이기면 그건 깊이가 뒤집혔다는 뜻이지 "조금 덮었다"가 아니다. 비율(95%)로 뒀더니
       * 동률을 주입해도 93% 가 나와 **간신히** 걸렸다 — 임계값 하나 차이로 조용히 통과할
       * 자리였다. 0 이냐 아니냐는 그 여지가 없다 (주입 시 실측 3).
       */
      record(
        '★ 실내 시설이 벽을 안 덮는다 — 앞쪽 벽이 시설보다 앞 (K37 버그 ①)',
        wallWins >= 15 && facWins === 0 ? 'pass' : 'fail',
        `벽이 이긴 픽셀 ${wallWins} · 시설이 이긴 픽셀 ${facWins} (0 이어야 한다)`,
      );
      // ③ 원인을 수치로 — 깊이가 동률이면 삽입 순서에 맡겨진다
      record(
        '★ 앞쪽 벽 깊이 > 시설 깊이 (동률 아님)',
        placedIn.wallDepth > placedIn.facDepth ? 'pass' : 'fail',
        `벽 ${placedIn.wallDepth} vs 시설 ${placedIn.facDepth}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/kairo-depth-wall.png` });
      // 뒷정리 — 이 절이 놓은 시설을 치우고 벽·시뮬을 되돌린다
      await page.evaluate(`(() => {
        const h = window.__kairo;
        h.placement.remove(${placedIn.handle});
        h.scene.refreshFacility(${placedIn.handle});
        h.walls.setEdge(${wi}, ${wj}, 1, ${inWall.kind});
        h.scene.refreshWall(${wi}, ${wj});
        h.scene.setAutoTick(true);
      })()`);
    }
  }

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
  await page.evaluate(`(() => {
    const h = window.__kairo, g = h.guests;
    /*
     * ⚠ '이용 중' 첫 발견에서 서면 안 된다 — 새 판의 첫 이용은 **매표소**인데 매표는
     * 슬롯을 점유하지 않아서 (표는 놀이가 아니다, K36-B) 점유 검사가 0/0 이 된다.
     * 점유 슬롯이 실제로 생길 때까지 민다.
     */
    const anyOcc = () => {
      for (const f of h.placement.all()) {
        if (g.occupancy(f.handle).some((x) => x !== 0)) return true;
      }
      return false;
    };
    /*
     * 점유(claim)는 슬롯으로 걸어가는 중에 생기고 '이용 중' 상태는 도착해야 된다 —
     * 하나만 보고 서면 다른 검사가 그 사이 순간을 재서 경합한다. 둘 다 참일 때까지 민다.
     * 재는 동안 rAF 흐름이 상태를 더 밀지 않게 얼린다 (끝나고 되살린다).
     */
    h.flow.frozen = true;
    for (let k = 0; k < 220; k++) {
      const p = h.week.liveProgress();
      if (!p || p.tick >= 800) break; // 주를 넘기면 rAF 가 결산 모달을 띄운다 — 경계 전에 선다
      if (anyOcc() && g.stats().using > 0) break;
      h.week.step(4);
    }
  })()`);
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
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);
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

  /*
   * ── 7f-2. ★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②) ──
   *
   * `placeGuest` 는 **위치는 보간**하고 **깊이는 목적 타일**로 줬다. 목적지가 위쪽
   * (= `i+j` 가 작은 = 먼 칸)이면 이동이 시작되는 순간 깊이가 먼 칸 값으로 뚝 떨어지는데
   * 그림은 아직 출발 칸 위에 있다 → **출발 칸에 있는 것들이 손님을 덮는다**.
   * 아래로 갈 때는 반대라 안 보였다 — 사용자가 본 그대로다.
   *
   * ## 왜 출발 칸에 **시설**을 놓고 재나
   *
   * 빈 길 위에서는 덮이는 것이 밑동 몇 픽셀뿐이라 픽셀로 안 걸린다 (실측: 깊이를
   * 되돌려도 보이는 픽셀이 194 → 193). 실제로 아프게 덮는 것은 **출발 칸의 시설**이다 —
   * 깊이가 한 칸치(4096) 뒤로 밀리면 손님이 그 시설 뒤로 통째로 들어간다.
   * 그래서 출발 칸에 시설을 하나 놓고, **시설이 있을 때와 없을 때 보이는 손님 픽셀 수**를
   * 비교한다. 앞에 서 있어야 할 손님이 뒤로 가면 이 수가 무너진다.
   *
   * 재현이 순간적이라 `requestAnimationFrame` 으로 이동을 **정지 화면처럼 고정**한다.
   * 손님 검사는 **새 판**에서 돈다 (7f 가 띄운 그 판이다).
   */
  const upward = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, p = h.placement, g = h.guests, sc = h.scene;
    if (g.all.length < 1) return { ok: false, reason: '손님이 없다' };
    sc.setAutoTick(false);
    const L = h.land();
    /*
     * (i, j) → (i, j-1) 로 가면 i+j 가 준다 (= 위로 간다). 출발 칸 (i, j) 에는 시설이
     * 들어가야 하고, 목적 칸 (i, j-1) 은 손님이 설 수 있어야 한다.
     */
    let cell = null;
    for (let j = L.j0 + 3; j < L.j0 + L.h - 2 && !cell; j++) {
      for (let i = L.i0 + 2; i < L.i0 + L.w - 2; i++) {
        if (!t.isGuestWalkable(i, j) || !t.isGuestWalkable(i, j - 1)) continue;
        if (t.isIndoor(i, j) || t.isIndoor(i, j - 1)) continue;
        if (p.handleAt(i, j) || p.handleAt(i, j - 1)) continue;
        if (!p.check(t, h.walls, h.gate, 'vending_out', i, j).ok) continue;
        cell = { i: i, j: j };
        break;
      }
    }
    if (!cell) { sc.setAutoTick(true); return { ok: false, reason: '시설을 놓을 수 있는 세로 이웃 두 칸을 못 찾았다' }; }
    const subject = g.all[0];
    // 나머지 손님은 멀리 — 겹치면 달라진 픽셀이 누구 때문인지 모른다
    for (const x of g.all) {
      if (x === subject) continue;
      x.i = 2; x.j = t.height - 2; x.fromI = x.i; x.fromJ = x.j; x.progress = 1;
      x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
    }
    /*
     * 이동 한가운데를 **매 프레임 되박아** 정지 화면으로 만든다. progress 는 실시간으로
     * 흐르므로 한 번만 넣으면 다음 프레임에 1 이 된다. 걸음 길이를 크게 잡아 프레임당
     * 증가를 0 에 수렴시킨다 — 검사 끝에 되돌린다.
     * 포즈는 프레임이 하나뿐인 sit 이다 (walk 은 4프레임이라 두 장을 못 비교한다).
     */
    window.__k37 = { i: cell.i, j: cell.j, id: subject.id, on: true, perOld: g.tunables.ticksPerStep };
    g.tunables.ticksPerStep = 1000000;
    window.__k37pin = () => {
      const st = window.__k37;
      const s = window.__kairo.guests.all.find((x) => x.id === st.id);
      if (s) {
        if (st.on) {
          s.fromI = st.i; s.fromJ = st.j; s.i = st.i; s.j = st.j - 1;
          s.progress = 0.5; s.state = 'walking';
          s.pose = 'sit'; s.facing = '+Z'; s.face = 'calm'; s.emote = null;
        } else {
          const t2 = window.__kairo.terrain;
          s.i = 2; s.j = t2.height - 2; s.fromI = s.i; s.fromJ = s.j; s.progress = 1;
          s.state = 'using'; s.useTicks = 999999; s.rideTicks = 0; s.usingHandle = 0;
        }
      }
      requestAnimationFrame(window.__k37pin);
    };
    window.__k37pin();
    sc.setUpscale(1);
    sc.focusTile(cell.i, cell.j);
    return { ok: true, i: cell.i, j: cell.j, id: subject.id };
  })()`)) as { ok: false; reason: string } | { ok: true; i: number; j: number; id: number };

  if (!upward.ok) {
    record('★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②)', 'fail', upward.reason);
  } else {
    const gi = upward.i, gj = upward.j, gid = upward.id;
    await page.waitForTimeout(400);

    // ① 깊이 수치 — 출발 칸(가까운 쪽) 기준인가
    const depths = (await page.evaluate(`(() => {
      const sc = window.__kairo.scene;
      const dk = (i, j) => (i + j) * 4096 + i;
      return {
        guest: sc.guestDepthAt(${gid}),
        fromGround: dk(${gi}, ${gj}),
        toGuestWouldBe: dk(${gi}, ${gj} - 1) + 4,
        rect: sc.guestScreenRect(${gid}),
      };
    })()`)) as {
      guest: number | null;
      fromGround: number;
      toGuestWouldBe: number;
      rect: { x: number; y: number; w: number; h: number } | null;
    };

    record(
      '★ 손님 깊이가 출발 칸 기준이다 (두 칸 중 가까운 쪽)',
      depths.guest !== null && depths.guest === depths.fromGround + 4 ? 'pass' : 'fail',
      `손님 ${depths.guest} = 출발 칸 ${depths.fromGround} + 손님 띠 4`,
    );
    record(
      '음성 대조군 — 목적 칸 깊이였다면 출발 칸의 것들보다 뒤였다',
      depths.toGuestWouldBe < depths.fromGround ? 'pass' : 'fail',
      `목적 칸 기준 ${depths.toGuestWouldBe} < 출발 칸 지면 ${depths.fromGround} (한 칸치 ${depths.fromGround - depths.toGuestWouldBe})`,
    );

    if (!depths.rect) {
      record('★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②)', 'fail', '손님 그림이 없다');
    } else {
      const r = depths.rect;
      const sampleGuest = `(() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const H = c.height;
        const buf = new Uint8Array(${r.w} * (${r.h} + 4) * 4);
        gl.readPixels(${r.x}, H - (${r.y} + ${r.h} + 4), ${r.w}, ${r.h} + 4, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let s = '';
        for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
        return s;
      })()`;
      const setOn = (on: boolean): string => `(() => { window.__k37.on = ${on}; })()`;
      const diff = (a: string, b: string): number => {
        const x = a.split(';'), y = b.split(';');
        let d = 0;
        for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) d++;
        return d;
      };

      // ② 시설이 없을 때 보이는 손님 픽셀 — 기준값
      const bareGuest = (await page.evaluate(sampleGuest)) as string;
      await page.evaluate(setOn(false));
      await page.waitForTimeout(320);
      const bareNone = (await page.evaluate(sampleGuest)) as string;
      const vis0 = diff(bareGuest, bareNone);

      // ③ 출발 칸에 시설을 놓고 다시 — 손님은 그 앞에 서 있어야 한다
      const facOk = (await page.evaluate(`(() => {
        const h = window.__kairo, sc = h.scene;
        const r = h.placement.place(h.terrain, h.walls, h.gate, 'vending_out', ${gi}, ${gj});
        if (!r.ok || !r.placed) return { ok: false, why: String(r.fail) };
        sc.refreshFacility(r.placed.handle);
        return { ok: true, handle: r.placed.handle, depth: sc.facilityImageAt(r.placed.handle).depth };
      })()`)) as { ok: false; why: string } | { ok: true; handle: number; depth: number };

      if (!facOk.ok) {
        record('★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②)', 'fail', `출발 칸에 시설을 못 놓았다: ${facOk.why}`);
      } else {
        await page.waitForTimeout(320);
        const facNone = (await page.evaluate(sampleGuest)) as string;
        await page.evaluate(setOn(true));
        await page.waitForTimeout(320);
        const facGuest = (await page.evaluate(sampleGuest)) as string;
        const vis1 = diff(facGuest, facNone);

        record(
          '손님 검사가 유효하다 (손님이 실제로 그려졌고 시설이 앞을 막고 있나)',
          vis0 > 100 && diff(bareNone, facNone) > 100 ? 'pass' : 'fail',
          `빈 길에서 손님 ${vis0}px · 시설이 바꾼 배경 ${diff(bareNone, facNone)}px`,
        );
        record(
          '★ 위로 걷는 손님이 출발 칸 시설에 안 파묻힌다 (K37 버그 ②)',
          vis0 > 100 && vis1 >= vis0 * 0.9 ? 'pass' : 'fail',
          `보이는 손님 픽셀 ${vis1}/${vis0} (${Math.round((vis1 / Math.max(1, vis0)) * 100)}%) · 손님 ${depths.guest} vs 시설 ${facOk.depth}`,
        );
        await page.screenshot({ path: `${SHOT_DIR}/kairo-depth-guest.png` });

        // 뒷정리 — 시설·고정 루프·걸음 길이·시뮬을 되돌린다
        await page.evaluate(`(() => {
          const h = window.__kairo;
          h.placement.remove(${facOk.handle});
          h.scene.refreshFacility(${facOk.handle});
          window.__k37.on = false;
          h.guests.tunables.ticksPerStep = window.__k37.perOld;
          h.scene.setAutoTick(true);
        })()`);
      }
    }
  }

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
    /*
     * K45: 코스는 선착장이 붙은 잔교에서만 시작한다 — 이 잔교를 후보로 만들어 둔다.
     * 트램폴린(+1..+2)·슬라이드(−3..−2) 자리를 피해 바깥(+3/−5)에서만 찾는다
     * (실측으로 두 번 그 자리를 선점해 아쿠아 검사를 깨뜨렸다).
     */
    dockLoop: for (const di of [3, 4, -5, -6, 5]) {
      for (let k = 0; k <= 6; k++) {
        const dr = p.place(t, w, h.gate, 'dock', pier.i + di, pier.j + k);
        if (dr.ok && dr.placed) { sc.refreshFacility(dr.placed.handle); break dockLoop; }
      }
    }
    /*
     * K46: 선착장이 1×1(데크와 동급)이 되며 후보 잔교가 3으로 줄었다 — 2×4 시절에는
     * 선착장 발자국 8칸이 스스로 넷째 잔교 그룹이었다. 겹침 절(코스 3개 확정 뒤
     * "빈 잔교를 제안한다")의 전제가 "빈 후보 ≥ 1"이므로 예비 잔교를 하나 더 놓는다.
     * 기존 선착장들에서 12칸 이상 떨어진 물가를 찾는다 (붙으면 같은 그룹으로 합쳐진다).
     */
    const dockSpots = p.all().filter((it) => it.defId === 'dock').map((it) => [it.i, it.j]);
    // 기존 코스의 잔교·핸들에서도 멀어야 한다 — 이 잔교의 코스가 그 옆(≤11)에 놓이므로
    const courseSpots = [];
    for (const cc of h.courses.all) {
      courseSpots.push([cc.dock.x, cc.dock.y]);
      for (const hd of cc.handles) courseSpots.push([hd.x, hd.y]);
    }
    spare: for (let j = 2; j < t.height - 2; j++) {
      if (Math.abs(j - pier.j) > 6) continue; // 같은 물줄기 — 딴 물웅덩이면 코스 공간이 없다
      for (let i = 2; i < t.width - 2; i++) {
        if (!t.isWater(i, j)) continue;
        if (dockSpots.some((d) => Math.abs(i - d[0]) + Math.abs(j - d[1]) < 12)) continue;
        if (courseSpots.some((d) => Math.abs(i - d[0]) + Math.abs(j - d[1]) < 24)) continue;
        const r = p.place(t, w, h.gate, 'dock', i, j);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); out.spare = [i, j]; break spare; }
      }
    }

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
      // 흐르는 낮(K39)부터 부팅 때 등급 상한이 걸린다 — 이 측정은 상한 없던 시절의
      // 조건(수백 명 누적)을 가정하므로 상한을 올려 복원한다
      g.setMaxGuests(400);
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
    h.week.abort(); // 흐르는 낮의 진행 중인 주를 치운다 — run() 은 배치 전용이다 (K39)
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
    noTicket?: number;
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
  /*
   * ⚠ **항등식이 깨진 게 아니라 뜻이 바뀌었다** (K36-B②).
   *
   * 예전엔 `spawn` 성공이 곧 입장이라 `수요 = 입장 + 만석` 이 그 주 안에서 딱 맞았다.
   * 이제 손님은 정류장에 내려서 **매표소까지 걸어가 표를 사야** 입장이다. 그 사이에
   * 주 경계가 끼면 지난주에 내린 손님이 이번 주 입장으로 잡힌다 — 실측으로
   * `123 = 138 + 107` 이 나왔다. 주 단위로 딱 맞을 수가 없다.
   *
   * 그래도 지키려던 것은 남는다: **실패한 입장이 어디에도 안 남으면 주말이 한가해 보인다.**
   * 그래서 "수요가 있으면 그 수요가 입장·만석·매표소못감 중 어딘가에는 잡힌다"를 본다.
   * 정확한 보존은 주 경계가 없는 sim 단위 검사(`admission.test.ts`)가 맡는다.
   */
  record(
    '실패한 입장이 어디엔가 남는다 — 수요가 조용히 사라지지 않는다',
    calc.arrivals > 0 && calc.visitors + calc.turnedAway + (calc.noTicket ?? 0) > 0
      ? 'pass'
      : 'fail',
    `수요 ${calc.arrivals} → 입장 ${calc.visitors} + 만석 ${calc.turnedAway} + 매표소못감 ${calc.noTicket ?? 0}`,
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
   * 흐르는 낮 (K39) — 압축 연출은 흐름으로 대체됐다. 주를 끝까지 감으면 게임 경로
   * (settleWeek) 로 결산이 바로 뜬다. 카드는 이제 결산 **뒤**(다음 주 아침)에 온다.
   */
  await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.runWeek();
  })()`);
  await page.waitForFunction(
    `(() => { const r = document.getElementById('kairo-report'); return !!r && !r.hidden; })()`,
    undefined,
    { timeout: 8000 },
  );
  record('주를 끝까지 감으면 결산이 뜬다 (흐르는 낮 — 연출 대체)', 'pass');
  await page.screenshot({ path: `${SHOT_DIR}/kairo-playback.png` });

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
    h.week.abort(); // K39 — run() 은 배치 전용
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
      '해금 — 시작 1등급 · 거북섬은 최종 의뢰 보상 · 매점은 소원 보상 (K41·K43: 사건 해금 = 99)',
      prog.startGrade === 1 && prog.needTurtle === 99 && prog.needShop === 99 ? 'pass' : 'fail',
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
    // K39: 버튼은 하루 스킵이 됐다. 카드는 주 마디(결산 뒤) 경로로 직접 연다
    window.__kairo.week.abort();
    window.__kairo.openWeekCards();
    const root = document.getElementById('kairo-card');
    const shown = !!root && getComputedStyle(root).display !== 'none';
    if (!shown) {
      // 그 주에 카드가 0장일 수 있다 (봄·가을·겨울). 여름 기본이라 보통은 뜬다
      return { ok: true, shown: false, cashBefore: cashBefore, remaining: cv.remaining };
    }
    const btns = [...root.querySelectorAll('button')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const labels = btns.map((b) => b.textContent.slice(0, 24));
    const enabled = btns.filter((b) => !b.disabled).length;
    const out = {
      ok: true, shown: true, cashBefore: cashBefore,
      options: btns.length, minHeight: Math.min.apply(null, heights),
      labels: labels, remaining: cv.remaining, enabled: enabled,
      title: (root.querySelector('div > div:nth-child(2)') || {}).textContent || ''
    };
    /*
     * ⚠ **카드를 닫고 넘어간다** (K37). 예전엔 열어 둔 채 다음 절로 갔다. 카드는 모달이라
     * (선택 전에 다른 패널이 밀어내면 주가 조용히 넘어간다) 열려 있으면 뒤따르는
     * "새 판" 절 5건이 전부 실패한다 — 실제로 그렇게 잡혔다.
     *
     * 앞선 검사의 잔해 위에서 재면 원인을 알 수 없다. 이 저장소가 손님 검사에서
     * 이미 배운 규칙이다.
     */
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
    return out;
  })()`)) as {
    ok: boolean;
    why?: string;
    shown?: boolean;
    options?: number;
    minHeight?: number;
    labels?: string[];
    remaining?: number;
    cashBefore?: number;
    enabled?: number;
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
      // K40: 목표란은 의뢰 칩 기둥이 됐다 — 칩 수와 진행바, 메뉴의 판 설정 줄을 본다
      goalChips: goal ? goal.querySelectorAll('.kchip').length : 0,
      goalBars: goal ? goal.querySelectorAll('.kprog').length : 0,
      goalText: goal ? goal.textContent : '(없음)',
      contextText: (document.getElementById('kairo-context') || {}).textContent || '',
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
    goalChips?: number;
    goalBars?: number;
    goalText?: string;
    contextText?: string;
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
    '★ 카드는 언제나 고를 수 있는 선택지가 있다 — 판이 잠기지 않는다 (K37)',
    !cardFlow.shown || (cardFlow.enabled ?? 0) > 0 ? 'pass' : 'fail',
    cardFlow.shown
      ? `선택지 ${cardFlow.options} · 고를 수 있는 것 ${cardFlow.enabled}`
      : '이번 주 카드 0장',
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
    '★ 다음 할 일이 화면에 상시 표시된다 — 의뢰 칩 + 진행바 (K40, UX 검수 §1)',
    (scenarioUi.goalChips ?? 0) >= 2 && (scenarioUi.goalBars ?? 0) >= 2 ? 'pass' : 'fail',
    `칩 ${scenarioUi.goalChips} · 진행바 ${scenarioUi.goalBars} · "${(scenarioUi.goalText ?? '').slice(0, 60)}"`,
  );
  record(
    '판 설정(맵·시나리오)은 메뉴 상단으로 갔다 — 설정은 목표가 아니다',
    (scenarioUi.contextText ?? '').includes(scenarioUi.mapName ?? '@@') ? 'pass' : 'fail',
    scenarioUi.contextText ?? '',
  );

  /*
   * ── 8·사고 (§12.1) ──
   *
   * v4 결정: **실패는 내 선택 때문이어야 한다.** 위험 단계에서만 사고가 나고, 사고 뒤에도
   * 선택이 있다. 확률이 0 일 때 안 나는 것과, 대응 카드가 실제로 뜨는 것을 함께 본다.
   */
  const accident = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort(); // 새 판 부팅이 흐름 주를 시작해 뒀을 수 있다 (K39)
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
   * ── 8·배경 겹 (§7 배경) ──
   *
   * **시차가 핵심이다.** 배경이 지도와 같은 속도로 움직이면 큰 그림 한 장이고, 안 움직이면
   * 벽지다. 그래서 "떠 있나"가 아니라 **"카메라보다 느리게 따라오나"**를 잰다.
   *
   * ⚠ 개수와 id 를 **여기 박지 않는다** (K36-B). 예전엔 `count === 2` 와
   * `['backdrop/ridge','backdrop/farbank']` 가 박혀 있어서, 겹을 하나 더하는 순간
   * 검사 세 개가 같이 깨졌다 — 검사가 계약을 지킨 게 아니라 **자기 상수를 지키고 있었다.**
   * 정본은 `KAIRO.backdrop.layers` 이므로 거기서 읽는다. 그러면 겹을 더해도 안 깨지고,
   * 계약과 화면이 갈라지면 그때는 정직하게 잡힌다.
   */
  const backLayers = KAIRO.backdrop.layers;
  const backIds = backLayers.map((l) => `backdrop/${l}`);

  const backdrop = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const info = h.scene.backdropInfo;
    // 카메라를 옮겨 배경이 실제로 덜 움직이는지 본다
    const before = h.scene.tileScreenRect(10, 10);
    h.scene.focusTile(28, 10);
    const after = h.scene.tileScreenRect(10, 10);
    return {
      count: info.count, factors: info.factors, factorsY: info.factorsY, depths: info.depths,
      surround: info.surround,
      tileMoved: Math.abs(after.x - before.x)
    };
  })()`)) as {
    count: number;
    factors: number[];
    factorsY: number[];
    depths: number[];
    surround: number;
    tileMoved: number;
  };

  /*
   * ## 배경은 **두 갈래**다 (K38)
   *
   * 실물 아트(`bg-horizon.png`)가 있으면 그 한 장이 하늘·먼 봉우리·숲을 다 담으므로
   * 겹이 하나다. 없으면 절차적 3겹 폴백이다. 두 갈래는 **지켜야 할 성질이 다르다** —
   * 한쪽 기준으로 뭉뚱그리면 어느 쪽도 제대로 안 잰다.
   */
  /*
   * ## 배경 3겹은 **안전망**이고, 평소엔 아예 안 만든다
   *
   * 지도 바깥이 지형으로 덮이므로(K38) 배경은 한 픽셀도 안 보인다. 안 보이는 것과
   * **없는 것**은 다르므로 굽기가 성공하면 아예 만들지 않는다 — 타일스프라이트 3장이
   * 텍스처 9.6MB 를 붙들고 있었다 (아키텍처 점검 실측).
   *
   * 그래서 여기서 재는 것은 "3겹이 있다"가 아니라 **"둘 중 하나가 성립한다"** 이다:
   *   · 굽기 성공 → 지형이 깔렸고 배경은 0겹
   *   · 굽기 실패 → 배경 3겹이 계약대로 서 있다 (하늘 대신 산이 보인다)
   */
  if (backdrop.surround >= 1) {
    record(
      '지형이 깔리면 배경 3겹은 안 만든다 — 안 보이는 텍스처 9.6MB (K38)',
      backdrop.count === 0 ? 'pass' : 'fail',
      `지형 ${backdrop.surround}장 · 배경 ${backdrop.count}겹 (0 이어야 한다)`,
    );
  } else {
    record(
      `배경 겹 수가 계약과 같다 (${backLayers.length}겹) — 굽기 실패 시의 안전망`,
      backdrop.count === backLayers.length ? 'pass' : 'fail',
      `${backdrop.count}겹 · 시차 ${backdrop.factors.join(', ')} (계약 ${backLayers.join('·')})`,
    );
    /*
     * 겹마다 시차가 **달라야** 한다. 같은 값이 둘이면 겹쳐 움직이므로 한 장과 같다.
     */
    const uniqueFactors = new Set(backdrop.factors).size;
    record(
      '배경이 지도보다 느리게 따라온다 — 같으면 큰 그림 한 장, 0 이면 벽지다',
      backdrop.factors.length === backLayers.length &&
        backdrop.factors.every((f) => f > 0 && f < 1) &&
        uniqueFactors === backdrop.factors.length
        ? 'pass'
        : 'fail',
      backLayers.map((l, k) => `${l} ${backdrop.factors[k]}`).join(' · ') + ' (지도는 1.0)',
    );
    record(
      '먼 겹일수록 시차가 작다 — 뒤집히면 산이 앞으로 나온다',
      backdrop.factors.every((f, k) => k === 0 || f > (backdrop.factors[k - 1] as number))
        ? 'pass'
        : 'fail',
      backdrop.factors.join(' < '),
    );
    record(
      '배경이 지면보다 뒤에 있다',
      backdrop.depths.length > 0 && backdrop.depths.every((d) => d < 0) ? 'pass' : 'fail',
      `깊이 ${backdrop.depths.join(', ')}`,
    );
  }

  const backTile = (await page.evaluate(`(() => {
    const prov = window.__kairo.provider;
    const out = [];
    for (const id of ${JSON.stringify(backIds)}) {
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
    // 물가에서 떨어진 곳에 선착장을 하나 더 낸다 (K45: 선착장이 곧 코스 후보다)
    let made = 0, tip = null, lastI = -99;
    for (let i = 10; i < 80 && made < 2; i++) {
      if (i - lastI < 10) continue; // 서로 떨어뜨린다 — 코스가 안 겹치게 (확정 절 몫까지 둘)
      for (let j = 1; j < 60; j++) {
        if (!t.isWalkable(i, j) || t.isWater(i, j)) continue;
        if (!t.isWater(i, j + 1) || !t.isWater(i, j + 2)) continue;
        if (h.placement.place(t, h.walls, h.gate, 'dock', i, j + 1).ok) {
          made++; tip = [i, j + 1]; lastI = i;
        }
        break;
      }
    }
    if (made === 0) return { ok: false, why: '두 번째 선착장을 못 놓았다' };
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
      /*
       * K37: **코스가 없는** 후보를 고른다. 이 절은 탭 뒤에 곧바로 확정까지 하는데,
       * 코스가 이미 있는 잔교로 옮기면 dock-taken 으로 확정이 잠긴다 (그게 맞는 동작이다).
       * ⚠ 이 주석에 백틱을 쓰지 말 것 — 이건 page.evaluate 로 넘기는 템플릿 문자열 안이다.
       */
      const used = {};
      for (const c of h.courses.all) used[c.dock.x + ',' + c.dock.y] = 1;
      const rest = h.scene.dockMarks.filter((c) => c.x !== cur.x || c.y !== cur.y);
      const pick = rest.find((c) => !used[c.x + ',' + c.y]) || rest[0];
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
    /*
     * 탭 절이 잔교를 **고정**해 뒀다 — 고정된 잔교 주변 물이 기존 코스 스플라인과
     * 스치면 어떤 핸들로도 안 풀린다 (실측: 여유 10칸도 잠김). 패널을 다시 열면
     * 고정이 풀리고 제안이 빈 잔교 + 옆밀기로 유효 자리를 찾는다 (show 의 K37 규칙).
     */
    h.coursePanel.hide();
    h.coursePanel.show();
    h.coursePanel.select('shuttle', 'banana');
    // 물 위로 핸들을 옮겨 유효하게 만든다 (여기서는 확정 경로만 본다)
    const t = h.terrain, st = h.coursePanel.state;
    // K45: 코스가 이미 여럿이라, 기존 코스와 겹치는 물을 피해야 확정이 열린다
    const occupied = [];
    for (const c of h.courses.all) {
      occupied.push(c.dock);
      for (const hd of c.handles) occupied.push(hd);
    }
    // 겹침 판정은 스플라인 **표본**(구간당 12점) 기준 3칸이다 — 점 거리 5로는 곡선이
    // 스친다 (실측). 넉넉히 10을 띄운다
    const farFromCourses = (i, j) =>
      occupied.every((o) => Math.abs(i - o.x) + Math.abs(j - o.y) > 10);
    const water = [];
    for (let j = 1; j < 60 && water.length < st.handles.length; j++) {
      for (let i = 1; i < 90; i++) {
        if (!t.isWater(i, j)) continue;
        const d = Math.abs(i - st.dock.x) + Math.abs(j - st.dock.y);
        // 상한 11 — far-from-dock 이 유클리드 12 (DOCK_REACH_TILES+8) 라서, 맨해튼 11 이면 안전
        if (d < 3 || d > 11) continue;
        if (!farFromCourses(i, j)) continue;
        water.push({ i: i, j: j });
        break;
      }
    }
    for (let k = 0; k < water.length; k++) h.coursePanel.moveHandleForTest(k, water[k].i, water[k].j);
    const btn = document.getElementById('kairo-course-confirm');
    const why = (document.querySelector('#kairo-course .kcourse-why') || {}).textContent || '';
    return { before: h.courses.count, cash: h.week.cash, disabled: btn.disabled,
             why: why, waterFound: water.length, need: st.handles.length };
  })()`)) as { before: number; cash: number; disabled: boolean; why: string; waterFound: number; need: number };
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
      (byButton.disabled
        ? ` · ⚠ 잠김: ${byButton.why} (물 ${byButton.waterFound}/${byButton.need})`
        : ''),
  );

  /*
   * ── 8c·코스는 같은 자리에 겹쳐 놓이지 않는다 (K37) ──
   *
   * 실측 버그: 현금을 채우고 장비 셋을 연달아 확정했더니 **한 잔교(43,32)에 넷**이
   * 완전히 같은 좌표로 쌓였다. 판정이 자기 자신만 봤고(물·선착장·수면), 기본 제안이
   * 기존 코스를 몰랐다. 사용자에게는 "장비를 19종 바꿔도 위치가 안 변한다"로 보였다.
   */
  const overlapUi = (await page.evaluate(`(() => {
    const h = window.__kairo, panel = h.coursePanel;
    const taken = h.courses.all.map((c) => ({ x: c.dock.x, y: c.dock.y }));
    if (taken.length < 2) return { ok: false, why: '코스가 둘이 안 놓였다 — 앞 절부터 본다' };
    // (1) 다시 열면 **코스가 없는 잔교**를 제안한다
    panel.hide();
    panel.show();
    const suggested = panel.state.dock;
    const onTaken = taken.some((d) => d.x === suggested.x && d.y === suggested.y);
    // (2) 놓인 코스들의 자리가 서로 다르다
    const keys = h.courses.all.map((c) => c.dock.x + ',' + c.dock.y);
    return {
      ok: true,
      taken: taken, suggested: suggested, onTaken: onTaken,
      courses: keys.length, distinct: [...new Set(keys)].length,
      marks: h.scene.dockMarks.length
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    taken?: { x: number; y: number }[];
    suggested?: { x: number; y: number };
    onTaken?: boolean;
    courses?: number;
    distinct?: number;
    marks?: number;
  };

  record(
    '★ 코스가 있는 잔교를 다시 제안하지 않는다 (K37)',
    overlapUi.ok && overlapUi.onTaken === false && (overlapUi.marks ?? 0) > (overlapUi.taken?.length ?? 0)
      ? 'pass'
      : 'fail',
    overlapUi.ok
      ? `제안 (${overlapUi.suggested?.x},${overlapUi.suggested?.y}) · ` +
        `찬 잔교 ${(overlapUi.taken ?? []).map((d) => `(${d.x},${d.y})`).join(' ')} · ` +
        `후보 ${overlapUi.marks}개`
      : (overlapUi.why ?? '실패'),
  );
  record(
    '★ 확정한 코스들의 자리가 서로 다르다 — 겹쳐 쌓이지 않는다 (K37)',
    (overlapUi.distinct ?? 0) === (overlapUi.courses ?? -1) && (overlapUi.courses ?? 0) >= 2
      ? 'pass'
      : 'fail',
    `코스 ${overlapUi.courses ?? 0}개 · 서로 다른 잔교 ${overlapUi.distinct ?? 0}곳`,
  );

  /*
   * 막힐 때 **이유가 화면에 보이는가.** 코스가 있는 잔교를 진짜 손가락으로 탭한다 —
   * 탭은 존중하되(무시하면 "안 눌린다"가 된다) 확정은 잠기고 처방이 뜬다.
   */
  const takenTap = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const used = {};
    for (const c of h.courses.all) used[c.dock.x + ',' + c.dock.y] = 1;
    const pick = h.scene.dockMarks.find((m) => used[m.x + ',' + m.y]);
    if (!pick) return null;
    h.scene.focusTile(pick.x, pick.y, 160);
    const r = h.scene.tileScreenRect(pick.x, pick.y);
    return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy), tile: pick };
  })()`)) as { x: number; y: number; tile: { x: number; y: number } } | null;
  if (takenTap === null) {
    record('★ 코스가 있는 잔교를 고르면 이유가 보인다 (K37)', 'fail', '찬 잔교가 후보에 없다');
  } else {
    await page.touchscreen.tap(takenTap.x, takenTap.y);
    await page.waitForTimeout(400);
    const blocked = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const why = document.querySelector('#kairo-course .kcourse-why');
      const btn = document.getElementById('kairo-course-confirm');
      const before = h.courses.count;
      btn.click(); // 잠긴 버튼을 눌러도 안 늘어야 한다
      return {
        dock: h.coursePanel.state.dock,
        why: (why && why.textContent) || '',
        visible: !!why && why.getBoundingClientRect().height > 0,
        disabled: btn.disabled,
        before: before, after: h.courses.count
      };
    })()`)) as {
      dock: { x: number; y: number };
      why: string;
      visible: boolean;
      disabled: boolean;
      before: number;
      after: number;
    };
    const moved = blocked.dock.x === takenTap.tile.x && blocked.dock.y === takenTap.tile.y;
    record(
      '★ 코스가 있는 잔교를 고르면 **이유가 화면에** 보인다 — 처방까지 (K37)',
      moved && blocked.disabled && blocked.visible && blocked.why.includes('다른 잔교')
        ? 'pass'
        : 'fail',
      `탭 (${takenTap.tile.x},${takenTap.tile.y}) → 잔교 (${blocked.dock.x},${blocked.dock.y}) · ` +
        `확정 ${blocked.disabled ? '잠김' : '⚠ 열림'} · "${blocked.why}"`,
    );
    record(
      '⚠ 음성 대조군 — 잠긴 확정을 눌러도 코스가 안 늘어난다',
      blocked.after === blocked.before ? 'pass' : 'fail',
      `코스 ${blocked.before} → ${blocked.after}`,
    );
  }

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
    h.week.abort(); // K39 — run() 은 배치 전용
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
    '주 마디에 의사결정 카드가 뜬다 — 없으면 한 주가 그냥 지나간다 (K39: 결산 뒤 아침)',
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
    return { visible: cv.visible, cash: window.__kairo.week.cash };
  })()`)) as { visible: boolean; cash: number };

  record(
    '카드를 고르면 화면이 닫히고 그 주가 진행된다',
    !afterPick.visible ? 'pass' : 'fail',
    `현금 ${Math.round((cardFlow.cashBefore ?? 0) / 10000)}만 → ${Math.round(afterPick.cash / 10000)}만`,
  );

  // 결산이 열려 있으면 닫는다 (뒤 검사가 오버레이에 막히지 않게)
  await page.waitForTimeout(400);
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
    // K41: shop 은 2등급 골격이 됐다 — 1등급 골격인 분식(snackbar)으로 잰다
    const pick = document.querySelector('[data-pick="facility:snackbar"]');
    if (!pick) return { ok: false, why: '건설 시트에서 분식을 못 찾았다', tiles: [] };
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
  /*
   * K46: 레퍼런스(카이로 실물)의 2단 헤더 구조를 사용자가 지정했다 — 헤더가 지표
   * 3종 + 리포트를 상시로 지므로 예산이 오른다. 예전 40% 대비 여전히 절반 이하이고,
   * 레퍼런스 자체가 이 정도를 쓴다 (상단 2줄 + 하단 2단).
   */
  for (const [vw, vh, tag, budget] of [
    [393, 852, '세로', 22],
    [852, 393, '가로', 30],
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
      `${tag} — 상시 컨트롤 5개 (메뉴·건설·하루·리포트·목표접기)`,
      m.controls === 5 ? 'pass' : 'fail',
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
    // K46-③ 겹침·접기 — 칩 기둥은 헤더 실측 아래에 있고, 접으면 칩이 사라진다.
    // 음성 대조군이 내장이다: 토글이 죽으면 '접힘' 판정이, top 이 고정값으로
    // 돌아가면 겹침 판정이 실패한다
    const fold = (await pg.evaluate(`(() => {
      const top = document.getElementById('kairo-top').getBoundingClientRect();
      const goal = document.getElementById('kairo-goal').getBoundingClientRect();
      const list = document.querySelector('#kairo-goal .kchiplist');
      const before = getComputedStyle(list).display;
      document.getElementById('kairo-goal-fold').click();
      const folded = getComputedStyle(list).display;
      document.getElementById('kairo-goal-fold').click();
      const after = getComputedStyle(list).display;
      return { gap: Math.round(goal.top - top.bottom), before, folded, after };
    })()`)) as { gap: number; before: string; folded: string; after: string };
    record(
      `${tag} — 목표 기둥이 헤더와 안 겹친다 · 접기가 동작한다 (K46-③)`,
      fold.gap >= 0 && fold.before !== 'none' && fold.folded === 'none' && fold.after !== 'none'
        ? 'pass'
        : 'fail',
      `간격 ${fold.gap}px · ${fold.before} → ${fold.folded} → ${fold.after}`,
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

  /*
   * ── 9b. 패널은 한 번에 하나 (K37 버그 ①) ──────────────────────────────
   *
   * 사용자 보고: "건설 등 눌렀을때 나오는 설명 부분이 다른 설명 눌렀을때 안꺼져서".
   * 패널 8종이 각자 hidden 을 만지고 "다른 걸 닫는다"를 아는 곳이 없었다.
   *
   * ⚠ 단위 테스트(panels.test.ts)는 호스트의 규칙만 잰다. 여기서는 **실제로 화면에서
   * 사라지는지**를 본다 — 규칙은 맞는데 hidden 이 안 내려가는 경우를 놓치면 안 된다.
   * 판정은 반드시 !root.hidden 으로 읽는다 (인라인 display 를 읽으면 표면을 클래스로
   * 옮기는 순간 조용히 거짓이 된다).
   */
  const excl = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const vis = () => ({
      sheet: !document.getElementById('kairo-sheet').hidden,
      catalog: h.catalog.visible,
      staff: h.staffPanel.visible,
      course: h.coursePanel.visible,
      showcase: h.showcase.visible,
    });
    const noop = function () {};
    const out = [];
    const build = () => document.getElementById('kairo-build-open').click();
    const closeSheet = () => document.getElementById('kairo-sheet-close').click();

    build();
    const a1 = vis(); h.catalog.show(); const a2 = vis();
    out.push({ pair: '건설→도감', ok: a1.sheet && !a2.sheet && a2.catalog });
    h.catalog.hide();

    h.catalog.show(); const b1 = vis();
    h.staffPanel.show(h.staff, h.placement, noop, undefined); const b2 = vis();
    out.push({ pair: '도감→경영', ok: b1.catalog && !b2.catalog && b2.staff });
    h.staffPanel.hide();

    h.staffPanel.show(h.staff, h.placement, noop, undefined); const c1 = vis();
    h.coursePanel.show(); const c2 = vis();
    out.push({ pair: '경영→코스', ok: c1.staff && !c2.staff && c2.course });
    h.coursePanel.hide();

    h.coursePanel.show(); const d1 = vis();
    build(); const d2 = vis();
    out.push({ pair: '코스→건설', ok: d1.course && !d2.course && d2.sheet });
    closeSheet();

    /* 감상은 예외 — 지도가 보여야 감상이므로 다른 패널을 닫지 않는다 */
    build(); const e1 = vis();
    h.showcase.show(); const e2 = vis();
    h.showcase.hide();
    out.push({ pair: '감상은 예외', ok: e1.sheet && e2.showcase && e2.sheet });
    closeSheet();

    /* 카드는 모달 — 선택 전에 다른 패널이 밀어내면 주가 조용히 넘어간다 */
    h.cardView.show(
      [{ id: 'k37', name: '검사', desc: '검사', options: [{ label: 'a', detail: 'a', effects: [] }] }],
      99999999,
      noop,
    );
    build(); const f2 = vis();
    out.push({ pair: '카드 모달이 막는다', ok: !f2.sheet });
    h.cardView.hide();
    closeSheet();
    return out;
  })()`)) as { pair: string; ok: boolean }[];
  const exclBad = excl.filter((x) => !x.ok).map((x) => x.pair);
  record(
    '★ 패널은 한 번에 하나만 열린다 (K37 버그 ①)',
    exclBad.length === 0 && excl.length >= 6 ? 'pass' : 'fail',
    exclBad.length === 0 ? `${excl.length}쌍 전부 통과` : `실패: ${exclBad.join(', ')}`,
  );

  /*
   * ── 9c. 코스가 같은 자리에 겹치지 않는다 (K37 버그 ④) ──────────────────
   *
   * 실측(고치기 전): banana·peanut·jetski 를 연달아 확정했더니 셋이 전부
   * dock 43,32 / handles 43,37 43,43 로 **완전히 같은 자리**에 쌓였다.
   * 사용자 보고 "수상기구에 모든 견인 기구 위치 설정은 버그같아" 가 이것이다.
   */
  const overlap = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const panel = h.coursePanel;
    h.week.cash = 500000000;
    const before = h.courses.count;
    document.getElementById('kairo-course-open').click();
    const tries = [];
    for (const eq of ['banana', 'peanut', 'jetski']) {
      panel.select('shuttle', eq);
      tries.push(panel.confirmForTest());
    }
    const spots = h.courses.all.map((c) => c.dock.x + ',' + c.dock.y + '|' + c.handles.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' '));
    const why = document.querySelector('#kairo-course .kcourse-why');
    const msg = why ? why.textContent : '';
    document.getElementById('kairo-course-close').click();
    return { before: before, added: tries, count: h.courses.count, uniq: new Set(spots).size, spots: spots.length, msg: msg };
  })()`)) as {
    before: number;
    added: number[];
    count: number;
    uniq: number;
    spots: number;
    msg: string;
  };
  record(
    '★ 코스가 같은 자리에 겹치지 않는다 (K37 버그 ④)',
    overlap.uniq === overlap.spots ? 'pass' : 'fail',
    `놓인 코스 ${overlap.spots}개 · 서로 다른 자리 ${overlap.uniq}개 · 확정 결과 ${overlap.added.join(',')}`,
  );
  record(
    '막힐 때 처방이 화면에 있다 — 방법까지 말한다',
    /잔교|선착장|핸들/.test(overlap.msg) ? 'pass' : 'fail',
    overlap.msg.slice(0, 80) || '(비어 있다)',
  );

  /*
   * ── 9d. 높이 표현 (K37 ⑤) ────────────────────────────────────────────────
   *
   * 사용자 요청: "높이를 표현해서 조금더 제한적으로 설치할수있게, 스타팅 포인트 양옆에,
   * (평지도 산 중턱중턱 놔둬서 건물들이나 뭐 펜션을 나중에 설치 할 수 있게끔)".
   *
   * sim 쪽은 `levels.test.ts` 가 20건으로 본다. 여기서는 **화면에 실제로 올라갔는지**를
   * 잰다 — 단을 세워도 그림이 안 올라가면 평지와 구분이 안 된다. 그리고 종류별로
   * (지면·벽·시설·손님) 재야 **하나만 빠뜨린 경우**를 잡는다.
   */
  const lifted = (await page.evaluate(`(() => {
    const h = window.__kairo, T = h.terrain, S = h.scene;
    const LEVEL_H = 8;

    /* 단 2 이상, 4x4 균일한 산 중턱 평지를 찾는다 */
    let hi = null;
    for (let j = 10; j < T.height - 5 && !hi; j++) {
      for (let i = 0; i < T.width - 5; i++) {
        if (T.levelAt(i, j) >= 2 && T.levelUniform(i, j, 4, 4)) { hi = { i: i, j: j }; break; }
      }
    }
    if (!hi) return { ok: false, why: '단 2 이상 4x4 평지가 없다' };
    const z = T.levelAt(hi.i, hi.j);

    /*
     * 대조는 **투영식**으로 한다. 같은 i+j 의 단 0 칸을 찾는 방식은 산이 넓은 맵에서
     * 대각선이 격자를 벗어나 "대조 칸이 없다"로 죽었다 (실측).
     *
     * 아이소 계약: 타일 (i,j) 의 bottom-center 앵커 y = STEP_Y*(i+j+1) + TILE_H/2
     *            = 8*(i+j+1) + 8 = 8*(i+j+2). 여기서 단만큼 올라간다.
     * 구현을 베낀 것이 아니라 §투영 계약에서 다시 유도한 값이다.
     */
    const wantY = (i, j, lv) => 8 * (i + j + 2) - lv * LEVEL_H;

    const out = { ok: true, z: z, hi: hi, kinds: [] };

    /* ① 지면 — 치마가 없는 안쪽 테라스 칸이라 앵커 보정이 0 이다 */
    const gh = S.tileImageForTest(hi.i, hi.j);
    if (!gh) return { ok: false, why: '지면 타일 그림을 못 찾았다 (' + hi.i + ',' + hi.j + ')' };
    out.kinds.push({ what: '지면', dy: gh.y - wantY(hi.i, hi.j, z), want: 0 });

    /* ② 절벽면이 지면과 **다른 색**이다 — 치마가 실제로 구워졌나 */
    let skirt = null;
    for (let j = 10; j < T.height - 2 && !skirt; j++) {
      for (let i = 0; i < T.width - 1; i++) {
        const zz = T.levelAt(i, j);
        if (zz >= 1 && T.levelAt(i + 1, j) === zz - 1) { skirt = { i: i, j: j, z: zz }; break; }
      }
    }
    if (skirt) {
      const img = S.tileImageForTest(skirt.i, skirt.j);
      const src = img.texture.getSourceImage();
      const cv = document.createElement('canvas');
      cv.width = src.width; cv.height = src.height;
      const cx = cv.getContext('2d');
      cx.drawImage(src, 0, 0);
      const d = cx.getImageData(28, 0, 1, cv.height).data;
      const rows = [];
      for (let y = 0; y < cv.height; y++) if (d[y * 4 + 3] > 8) rows.push(y);
      const last = rows[rows.length - 1];
      const top = cx.getImageData(16, 8, 1, 1).data;
      const face = cx.getImageData(28, last, 1, 1).data;
      out.skirt = {
        h: cv.height, texW: cv.width, key: img.texture.key,
        faceDarker: face[0] < top[0] && face[1] < top[1] && face[2] < top[2],
        top: top[0] + ',' + top[1] + ',' + top[2],
        face: face[0] + ',' + face[1] + ',' + face[2],
      };
    }

    /* ③ 시설 — 산 중턱 평지에 놓고 그림이 올라갔나 */
    h.week.cash = 500000000;
    const flatRes = h.tapTile ? null : null;
    const before = h.placement.count;
    const okHi = h.placement.place(T, h.walls, h.gate, 'flowerbed', hi.i, hi.j, { land: { i0: 0, j0: 0, w: T.width, h: T.height } });
    out.placed = { hi: okHi.ok, why: okHi.fail || 'ok' };
    /* place() 는 { ok, placed: { handle, ... } } 를 준다 — handle 은 placed 안에 있다 */
    const hd = okHi.ok && okHi.placed ? okHi.placed.handle : 0;
    if (hd) {
      S.refreshFacility(hd);
      const fh = S.facilityImageAt(hd);
      /* 1×1 발자국이라 footprintAnchor 의 y 는 타일 앵커와 같다 */
      if (fh) out.kinds.push({ what: '시설', dy: fh.y - wantY(hi.i, hi.j, z), want: 0 });
      else out.placed.why = out.placed.why + ' (그림 없음)';
    }
    void before; void flatRes;

    /* ④ 벽 — 산 중턱에 실내 바닥을 깔면 벽이 같이 올라간다 */
    for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) T.paint(hi.i + di, hi.j + dj + 4, 'floor_indoor');
    for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) S.refreshTile(hi.i + di, hi.j + dj + 4);
    S.refreshAllWalls && S.refreshAllWalls();
    const wallY = S.wallImageYForTest ? S.wallImageYForTest(hi.i, hi.j + 4) : null;
    out.wallY = wallY;

    /*
     * ⑤ 경사에는 못 놓는다.
     *
     * ⚠ 자리를 levelUniform 으로 찾으면 **자기참조**가 된다 — production 이 쓰는 그
     * 함수로 "경사다"를 정해 놓고 그 함수가 거절하는지 묻는 꼴이라, 함수가 통째로
     * 틀려도 통과한다 (K38 아키텍처 점검 지적).
     *
     * 그래서 발자국의 단을 **직접 비교**해 자리를 찾는다. 시설 크기도 데이터에서
     * 읽는다 — 2×2 로 박으면 shop 이 커지는 날 조용히 다른 것을 재게 된다.
     */
    const def = h.simDefs ? h.simDefs['shop'] : null;
    const fw = def && def.size ? def.size[0] : 2;
    const fd = def && def.size ? def.size[1] : 2;
    let mixed = null;
    for (let j = 10; j < T.height - fd && !mixed; j++) {
      for (let i = 0; i < T.width - fw; i++) {
        if (!T.isWalkable(i, j) || T.isWater(i, j)) continue;
        const z0 = T.levelAt(i, j);
        let uneven = false;
        for (let dj = 0; dj < fd && !uneven; dj++) {
          for (let di = 0; di < fw; di++) if (T.levelAt(i + di, j + dj) !== z0) { uneven = true; break; }
        }
        if (uneven) { mixed = { i: i, j: j }; break; }
      }
    }
    if (mixed) {
      const c = h.placement.check(T, h.walls, h.gate, 'shop', mixed.i, mixed.j, { land: { i0: 0, j0: 0, w: T.width, h: T.height } });
      out.slope = { at: mixed.i + ',' + mixed.j + ' (' + fw + '×' + fd + ')', fail: c.fail || 'ok' };
    }
    return out;
  })()`)) as {
    ok: boolean;
    why?: string;
    z?: number;
    kinds?: { what: string; dy: number; want: number }[];
    skirt?: { h: number; texW: number; key: string; faceDarker: boolean; top: string; face: string };
    placed?: { hi: boolean; why: string };
    slope?: { at: string; fail: string };
    wallY?: number | null;
  };

  if (!lifted.ok) {
    record('★ 높이가 화면에 올라간다 (K37 ⑤)', 'fail', lifted.why ?? '실패');
  } else {
    const bad = (lifted.kinds ?? []).filter((k) => k.dy !== k.want);
    record(
      '★ 단 위의 것이 종류별로 다 올라간다 — 하나만 빠뜨리면 그것만 파묻힌다 (K37 ⑤)',
      bad.length === 0 && (lifted.kinds ?? []).length >= 2 ? 'pass' : 'fail',
      (lifted.kinds ?? []).map((k) => `${k.what} ${k.dy}px(기대 ${k.want})`).join(' · ') +
        (lifted.placed ? ` · 배치 ${lifted.placed.why}` : ''),
    );
    record(
      '★ 절벽면이 구워져 있다 — 지면보다 어둡다 (K37 ⑤)',
      lifted.skirt?.faceDarker === true ? 'pass' : 'fail',
      lifted.skirt
        ? `${lifted.skirt.key} ${lifted.skirt.texW}×${lifted.skirt.h} · 윗면 ${lifted.skirt.top} → 절벽 ${lifted.skirt.face}`
        : '치마가 있는 칸을 못 찾았다',
    );
    record(
      '★ 경사에는 못 놓는다 — 처방이 평지를 말한다 (K37 ⑤)',
      lifted.slope?.fail === 'level-mixed' ? 'pass' : 'fail',
      lifted.slope ? `(${lifted.slope.at}) → ${lifted.slope.fail}` : '단이 섞인 자리를 못 찾았다',
    );
  }

  /*
   * ── 9d-2. 단 지형에 실틈이 없다 (K38 에서 발견) ─────────────────────────
   *
   * 컬럼 텍스처는 윗면과 절벽 치마를 **한 장에** 굽는다. 치마 시작 줄을 한 줄만 밀어도
   * 그 사이에 1px 구멍이 뚫리고, 뒤에 있는 것(하늘)이 새어 나온다 — 단 지형 가장자리마다
   * 파란 점선으로 보였다. K37 부터 있었는데 배경이 어두워 안 보였다.
   *
   * 세로로 훑어 **불투명 → 투명 → 불투명** 이 나오면 구멍이다. 마름모는 위아래가
   * 뾰족하므로 바깥쪽 투명은 정상이고, 가운데가 끊기는 것만 잡는다.
   */
  const holes = (await page.evaluate(`(() => {
    const h = window.__kairo, T = h.terrain, S = h.scene;
    const seen = {};
    const bad = [];
    let checked = 0;
    for (let j = 0; j < T.height; j += 1) {
      for (let i = 0; i < T.width; i += 1) {
        if (T.levelAt(i, j) === 0) continue;
        const img = S.tileImageForTest(i, j);
        if (!img) continue;
        const key = img.texture.key;
        if (key.indexOf('__col/') !== 0 || seen[key]) continue;
        seen[key] = 1;
        checked++;
        const src = img.texture.getSourceImage();
        const cv = document.createElement('canvas');
        cv.width = src.width; cv.height = src.height;
        const cx = cv.getContext('2d');
        cx.drawImage(src, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        for (let x = 0; x < cv.width; x++) {
          let seenOpaque = false, gap = false;
          for (let y = 0; y < cv.height; y++) {
            const a = d[(y * cv.width + x) * 4 + 3];
            if (a > 8) {
              if (gap) { bad.push(key + ' x=' + x + ' y=' + y); gap = false; break; }
              seenOpaque = true;
            } else if (seenOpaque) gap = true;
          }
        }
      }
    }
    return { checked: checked, bad: bad.slice(0, 5), n: bad.length };
  })()`)) as { checked: number; bad: string[]; n: number };
  record(
    '★ 단 지형에 실틈이 없다 — 윗면과 절벽이 붙어 있다 (K38)',
    holes.n === 0 && holes.checked > 0 ? 'pass' : 'fail',
    holes.n === 0
      ? `컬럼 텍스처 ${holes.checked}종 전부 이어짐`
      : `구멍 ${holes.n}곳 — ${holes.bad.join(' · ')}`,
  );

  /*
   * ── 9d-3. **대조군을 코드로** — 검사가 정말 잡나 (K38 점검 후속) ──────────
   *
   * 아키텍처 점검이 짚었다: 새 ★ 18개 중 코드에 음성 대조군이 붙은 것은 1개뿐이고
   * 나머지는 손으로 주입해야만 확인된다. 손으로 하는 확인은 **다음 사람에게 안 남는다.**
   *
   * `seam --selftest` 가 픽셀에 위반을 주입하듯, 씬의 `setRenderFaultForTest` 로
   * **그리기 규칙**을 되돌린 뒤 같은 검사가 실패하는지 본다. 셋 다 "고쳤다"고 적어 둔
   * 버그의 원래 모습이다:
   *   · `wall-depth-tie` — 앞벽을 시설과 같은 띠로 (K37 ① 이전)
   *   · `skirt-gap`      — 치마 시작 줄 +1 (K38 실틈 이전)
   *   · `no-lift`        — 단 리프트 0 (K37 ⑤ 이전)
   */
  const faultProbe = `(() => {
    const h = window.__kairo, T = h.terrain, S = h.scene;
    /* ① 컬럼 텍스처에 구멍이 있나 (실틈 검사와 같은 판정) */
    const seen = {};
    let holes = 0;
    for (let j = 0; j < T.height; j++) {
      for (let i = 0; i < T.width; i++) {
        if (T.levelAt(i, j) === 0) continue;
        const img = S.tileImageForTest(i, j);
        if (!img) continue;
        const key = img.texture.key;
        if (key.indexOf('__col/') !== 0 || seen[key]) continue;
        seen[key] = 1;
        const src = img.texture.getSourceImage();
        const cv = document.createElement('canvas');
        cv.width = src.width; cv.height = src.height;
        const cx = cv.getContext('2d');
        cx.drawImage(src, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        for (let x = 0; x < cv.width; x++) {
          let op = false, gap = false;
          for (let y = 0; y < cv.height; y++) {
            const a = d[(y * cv.width + x) * 4 + 3];
            if (a > 8) { if (gap) { holes++; gap = false; break; } op = true; }
            else if (op) gap = true;
          }
        }
      }
    }
    /* ② 단 위의 것이 올라갔나 (리프트 검사와 같은 판정) */
    let hi = null;
    for (let j = 10; j < T.height - 5 && !hi; j++) {
      for (let i = 0; i < T.width - 5; i++) {
        if (T.levelAt(i, j) >= 2 && T.levelUniform(i, j, 4, 4)) { hi = { i: i, j: j }; break; }
      }
    }
    let liftErr = -1;
    if (hi) {
      const g = S.tileImageForTest(hi.i, hi.j);
      if (g) liftErr = g.y - (8 * (hi.i + hi.j + 2) - T.levelAt(hi.i, hi.j) * 8);
    }
    /* ③ 앞벽 깊이가 시설보다 앞인가 (깊이 띠 검사와 같은 판정) */
    const iso = S.depthProbeForTest ? S.depthProbeForTest() : null;
    return { holes: holes, liftErr: liftErr, wall: iso };
  })()`;

  const faults: { name: string; want: string; got?: string }[] = [];
  for (const [fault, label] of [
    ['skirt-gap', '치마 시작 줄 +1 → 컬럼 텍스처에 구멍'],
    ['no-lift', '단 리프트 0 → 단 위의 것이 안 올라감'],
    ['wall-depth-tie', '앞벽을 시설 띠로 → 깊이 동률'],
  ] as [string, string][]) {
    await page.evaluate(`window.__kairo.scene.setRenderFaultForTest('${fault}')`);
    await page.waitForTimeout(300);
    const probe = (await page.evaluate(faultProbe)) as {
      holes: number;
      liftErr: number;
      wall: { wall: number; facility: number } | null;
    };
    const caught =
      fault === 'skirt-gap'
        ? probe.holes > 0
        : fault === 'no-lift'
          ? probe.liftErr !== 0
          : probe.wall !== null && probe.wall.wall <= probe.wall.facility;
    faults.push({
      name: label,
      want: caught ? 'ok' : 'MISS',
      got:
        fault === 'skirt-gap'
          ? `구멍 ${probe.holes}곳`
          : fault === 'no-lift'
            ? `리프트 오차 ${probe.liftErr}px`
            : `앞벽 띠 ${probe.wall?.wall} vs 시설 띠 ${probe.wall?.facility}`,
    });
  }
  await page.evaluate(`window.__kairo.scene.setRenderFaultForTest('none')`);
  await page.waitForTimeout(300);
  const clean = (await page.evaluate(faultProbe)) as {
    holes: number;
    liftErr: number;
    wall: { wall: number; facility: number } | null;
  };

  record(
    '★ 대조군 — 그리기 결함을 주입하면 검사가 잡는다 (K38 점검 후속)',
    faults.every((f) => f.want === 'ok') &&
      clean.holes === 0 &&
      clean.liftErr === 0 &&
      clean.wall !== null &&
      clean.wall.wall > clean.wall.facility
      ? 'pass'
      : 'fail',
    faults.map((f) => `${f.name}: ${f.want}(${f.got})`).join(' · ') +
      ` · 원복 후 구멍 ${clean.holes} 리프트오차 ${clean.liftErr} 앞벽 ${clean.wall?.wall}>시설 ${clean.wall?.facility}`,
  );

  /*
   * ── 이동체 깊이 (K46-⑤) — 버스·보트는 걸친 두 칸 중 **가까운 쪽** 깊이다 ──
   *
   * round 로 한 칸만 잡으면 위로(i+j 감소) 이동할 때 이전 칸 지면이 위에 그려져
   * 이동체가 "아래로 꺼진다" (사용자 실측 — 손님의 K37 규칙과 같은 문제).
   * 깊이는 화면 오브젝트(busGfx)에서 읽고, 걸친 두 칸의 지면 띠와 비교한다.
   * 음성 대조군이 내장이다: round 회귀면 뒤 칸 지면 깊이에 진다.
   */
  const mover = (await page.evaluate(`(() => {
    const h = window.__kairo, sc = h.scene, t = h.terrain;
    // 깊이 규칙은 지형 종류와 무관하다 — 이 페이지는 합성 지형(전면 포장)이라
    // 도로가 없으므로, 격자 안 임의의 이웃 두 칸에서 잰다 (setBus 는 지형을 안 본다)
    const spot = { i: Math.floor(t.width / 2), j: Math.floor(t.height / 2) };
    const K = 4096;
    const key = (i, j) => (i + j) * K + (i % K) / K;
    // 두 칸 사이 한가운데 — 걸친 상태
    sc.setBus({ x: spot.i + 0.5, y: spot.j });
    const d = sc['busGfx'].depth;
    sc.setBus(null);
    const gFrom = key(spot.i, spot.j);
    const gTo = key(spot.i + 1, spot.j);
    return { ok: true, bus: d, from: gFrom, to: gTo };
  })()`)) as { ok: boolean; why?: string; bus?: number; from?: number; to?: number };
  record(
    '★ 이동체(버스) 깊이 — 걸친 두 칸 지면보다 앞 (K46-⑤, 꺼짐 수정)',
    mover.ok && (mover.bus ?? -1) > Math.max(mover.from ?? 0, mover.to ?? 0)
      ? 'pass'
      : 'fail',
    mover.ok
      ? `버스 ${mover.bus} > 지면 ${Math.max(mover.from ?? 0, mover.to ?? 0)}`
      : (mover.why ?? ''),
  );


  /*
   * ── 9e. 지도 바깥을 땅으로 채운다 (K38) ─────────────────────────────────
   *
   * 아이소 다이아몬드는 사각 화면을 못 채운다. 네 귀퉁이가 비면 카메라 배경색이
   * 그대로 보여 "1시 방향이 통짜 하늘색"이 된다 (사용자 스크린샷).
   *
   * 여기서 재는 것은 **화면 픽셀**이다 — 오브젝트가 존재하는지가 아니라 실제로
   * 그 자리를 덮었는지를 봐야 한다.
   */
  /*
   * ★ **하늘이 어디서도 안 보인다** (K38).
   *
   * 이전엔 화면 한 줄만 봤는데, 그건 "그 한 줄이 안 비었다"만 잰다. 카메라를 지도 네
   * 귀퉁이와 중앙으로 밀어 **화면 전체**에서 배경색 비율을 센다 — 아이소 다이아몬드의
   * 빈 구석은 귀퉁이로 가야 드러난다.
   *
   * 근거: 실제 게임들은 플레이 영역 밖을 같은 스케일 지형으로 덮거나 경계를 아예 안
   * 보여 준다 (`art-reference/competitor/README.md`). 하늘이 보이면 그 규칙이 깨진 것이다.
   */
  const skyPct = `(() => {
    const cv = document.querySelector('canvas');
    const g = document.createElement('canvas');
    g.width = cv.width; g.height = cv.height;
    const c = g.getContext('2d');
    c.drawImage(cv, 0, 0);
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, total = 0;
    for (let k = 0; k < d.length; k += 4 * 37) {
      total++;
      if (Math.abs(d[k] - 122) < 12 && Math.abs(d[k + 1] - 184) < 12 && Math.abs(d[k + 2] - 212) < 12) n++;
    }
    return Math.round((n / Math.max(1, total)) * 100);
  })()`;
  // 낮밤 틴트(K39)가 켜진 화면은 지형 픽셀이 하늘색 대역으로 밀린다 — 끄고 잰다
  await page.evaluate(
    `(() => { const h = window.__kairo; h.flow.frozen = true; h.scene.setDayPhase(null); })()`,
  );
  const corners: [number, number, string][] = [
    [0, 0, '좌상'],
    [95, 0, '우상'],
    [0, 71, '좌하'],
    [95, 71, '우하'],
    [48, 36, '중앙'],
  ];
  const seen: string[] = [];
  let worst = 0;
  for (const [ci, cj, name] of corners) {
    await page.evaluate(`(() => { const h = window.__kairo; h.scene.setUpscale(1); h.scene.focusTile(${ci}, ${cj}, 0); })()`);
    await page.waitForTimeout(320);
    const pct = (await page.evaluate(skyPct)) as number;
    seen.push(`${name} ${pct}%`);
    worst = Math.max(worst, pct);
  }
  record(
    '★ 하늘이 어디서도 안 보인다 — 지형이 화면을 채운다 (K38)',
    worst === 0 ? 'pass' : 'fail',
    seen.join(' · '),
  );
  /*
   * 음성 대조군 — 지형을 끄면 그 자리가 하늘로 돌아온다.
   *
   * ⚠ **귀퉁이에서 재야 한다.** 중앙은 다이아몬드가 화면을 다 덮어서 지형을 꺼도
   * 하늘이 0% 다 — 대조군이 아무것도 안 재게 된다 (실측으로 그렇게 통과할 뻔했다).
   */
  await page.evaluate(`window.__kairo.scene.focusTile(0, 0, 0)`);
  await page.waitForTimeout(320);
  await page.evaluate(`window.__kairo.scene.setSurroundVisibleForTest(false)`);
  await page.waitForTimeout(320);
  const bare = (await page.evaluate(skyPct)) as number;
  await page.evaluate(`window.__kairo.scene.setSurroundVisibleForTest(true)`);
  await page.waitForTimeout(320);
  record(
    '★ 음성 대조군 — 지형을 끄면 하늘이 드러난다',
    bare > 10 ? 'pass' : 'fail',
    `끄면 ${bare}% · 켜면 ${worst}%`,
  );
  // 틴트 없는 화면이 필요한 검사가 끝났다 — 흐름을 되살린다
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);

  /*
   * 배경이 **지도를 가리지 않는다.**
   *
   * ⚠ "가운데는 초록이다"로 재면 안 된다 — 실측으로 가운데가 포장(196,193,183)이었다.
   * 지면 종류를 가정하는 대신 **씬이 그 자리에 있다고 말하는 타일의 텍스처**와 맞춰 본다.
   * 그러면 어떤 지형이 와도 성립하고, 배경이 덮으면 색이 달라져 잡힌다.
   */
  /*
   * ⚠ 카메라를 옮긴 **같은 프레임**을 읽으면 안 된다. `focusTile` 은 카메라만 바꾸고
   * 캔버스는 아직 이전 프레임이라, 좌표는 새 자리인데 픽셀은 옛 화면이 된다
   * (실측: 포장 자리에서 물색 87,164,194 가 나왔다). 옮기고 한 박자 쉬었다 읽는다.
   */
  /*
   * ⚠ **평지 타일**을 고른다. 단이 있는 칸은 기둥 텍스처라 그림이 위로 올라가 있어
   * `tileScreenRect`(단을 모르는 사각형) 기준으로 찍으면 이웃 칸을 읽는다
   * (실측: 포장 자리에서 다른 변형 색 216,212,201 이 나왔다).
   */
  const flat = (await page.evaluate(`(() => {
    const h = window.__kairo, T = h.terrain;
    /*
     * ⚠ **해금된 토지 안**에서 고른다. 토지 밖 타일은 어둡게 tint 되므로 (applyLand)
     * 텍스처 원색과 다르다 — 실측 71,76,80 vs 176,174,165. 이 주석에 백틱 금지 (템플릿 안).
     */
    const L = h.land();
    for (let j = L.j0 + 1; j < L.j0 + L.h - 1; j++) {
      for (let i = L.i0 + 1; i < L.i0 + L.w - 1; i++) {
        if (T.levelAt(i, j) !== 0) continue;
        if (T.levelAt(i + 1, j) !== 0 || T.levelAt(i, j + 1) !== 0) continue;
        if (T.isWater(i, j)) continue;
        if (h.placement.handleAt(i, j) !== 0) continue;
        return { i: i, j: j };
      }
    }
    return null;
  })()`)) as { i: number; j: number } | null;
  await page.evaluate(`window.__kairo.scene.focusTile(${flat?.i ?? 48}, ${flat?.j ?? 20}, 0)`);
  await page.waitForTimeout(320);
  const covered = (await page.evaluate(`(() => {
    const h = window.__kairo, S = h.scene;
    const TI = ${flat?.i ?? 48}, TJ = ${flat?.j ?? 20};
    const cv = document.querySelector('canvas');
    const r = S.tileScreenRect(TI, TJ);
    const g = document.createElement('canvas');
    g.width = cv.width; g.height = cv.height;
    const c = g.getContext('2d');
    c.drawImage(cv, 0, 0);
    const sx = cv.width / cv.getBoundingClientRect().width;

    const img = S.tileImageForTest(TI, TJ);
    const src = img.texture.getSourceImage();
    const t = document.createElement('canvas');
    t.width = src.width; t.height = src.height;
    const tc = t.getContext('2d');
    tc.drawImage(src, 0, 0);
    const want = tc.getImageData(16, 8, 1, 1).data;

    /*
     * 마름모 한가운데 근처를 **작은 창으로** 훑어 그 타일 색이 있는지 본다.
     * 한 점만 찍으면 정렬이 1~2px 어긋날 때 이웃 칸의 다른 변형을 읽어 실패한다
     * (실측 216,212,201 vs 196,193,183 — 같은 포장인데 변형이 달랐다).
     * 배경이 지도를 덮었다면 이 창 어디에도 그 색이 없다.
     */
    let best = 1e9, got = '';
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const px = c.getImageData(
          Math.round((r.x + 16 + dx) * sx),
          Math.round((r.y + 8 + dy) * sx),
          1, 1,
        ).data;
        const d = Math.abs(px[0] - want[0]) + Math.abs(px[1] - want[1]) + Math.abs(px[2] - want[2]);
        if (d < best) { best = d; got = px[0] + ',' + px[1] + ',' + px[2]; }
      }
    }
    return {
      got: got,
      want: want[0] + ',' + want[1] + ',' + want[2],
      d: best,
    };
  })()`)) as { got: string; want: string; d: number };
  record(
    '배경이 지도를 안 가린다 — 그 자리는 그 타일의 색이다 (K38)',
    covered.d <= 24 ? 'pass' : 'fail',
    `화면 ${covered.got} vs 타일 ${covered.want} (차 ${covered.d})`,
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

  /*
   * ── K39. 흐르는 낮 ──
   *
   * 공원이 기본 상태로 살아 있는지 — 시간이 흐르고, 시트가 열리면 멈추고,
   * ⏩ 는 하루만 감고(주 스킵은 심사 해금 전), 사건 밀도가 목표를 넘는지.
   * ⚠ 시트 여닫기는 **진짜 클릭**으로 한다 (K33: 백도어는 sim 검사에만).
   */
  await page.evaluate(`(() => {
    const h = window.__kairo;
    h.flow.frozen = false;
    h.week.abort(); // 어느 tick 에 있었는지 모른다 — 주 첫 tick 에서 결정적으로 시작
    h.beginWeek();
  })()`);
  const flowT1 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  await page.waitForTimeout(1400);
  const flowT2 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  record(
    '★ 시간이 흐른다 — 지도가 보이는 동안 tick 이 저절로 소비된다 (K39)',
    flowT2 > flowT1 ? 'pass' : 'fail',
    `${flowT1} → ${flowT2} (1.4초)`,
  );

  await page.click('#kairo-build-open'); // 진짜 클릭 — 시트가 열린다
  await page.waitForTimeout(300);
  const pauseT1 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  await page.waitForTimeout(1200);
  const pauseT2 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  await page.click('#kairo-sheet-close');
  await page.waitForTimeout(200);
  record(
    '★ 시트가 열리면 시간이 멈춘다 — 카이로의 암묵 멈춤 (음성 대조군: 위 검사가 흐름을 증명)',
    pauseT2 === pauseT1 ? 'pass' : 'fail',
    `시트 연 1.2초 동안 ${pauseT1} → ${pauseT2}`,
  );

  // 스킵 측정 동안 rAF 가 tick 을 더 밀지 않게 얼린다 (스킵 자체는 frozen 과 무관)
  await page.evaluate(`(() => { window.__kairo.flow.frozen = true; })()`);
  const skipBefore = (await page.evaluate(
    `window.__kairo.week.liveProgress().tick`,
  )) as number;
  await page.click('#kairo-week'); // 진짜 클릭 — ⏩
  await page.waitForTimeout(250);
  const skipAfter = (await page.evaluate(`(() => {
    const p = window.__kairo.week.liveProgress();
    return p ? p.tick : -1;
  })()`)) as number;
  const dayEnd = Math.ceil((skipBefore + 1) / 120) * 120;
  record(
    '★ ⏩ 는 하루 끝까지만 감는다 — 주 스킵은 첫 심사 통과 해금 (스펙 A2)',
    skipAfter === dayEnd && skipAfter < 840 ? 'pass' : 'fail',
    `${skipBefore} → ${skipAfter} (하루 경계 ${dayEnd})`,
  );
  const capsule = (await page.evaluate(
    `document.getElementById('kairo-status').textContent`,
  )) as string;
  record(
    '상단 캡슐에 요일이 보인다 (검수 A1)',
    /[월화수목금토일]/.test(capsule) ? 'pass' : 'fail',
    capsule,
  );
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);

  /*
   * 사건 밀도 (스펙 §2.1) — 도착·이모트가 분당 6 을 넘어야 구경이 심심하지 않다.
   * 2× 로 12초를 관측해 1× 분당으로 환산한다 (도착 = alive+exited 증가).
   */
  const density = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.flow.speed = 2;
    const s0 = h.guests.stats();
    const t0 = h.week.liveProgress().tick;
    return { entered0: s0.alive + s0.exited, t0: t0 };
  })()`)) as { entered0: number; t0: number };
  await page.waitForTimeout(12000);
  const density2 = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const s1 = h.guests.stats();
    let emotes = 0;
    for (const g of h.guests.all) if (g.emote) emotes++;
    const t1 = h.week.liveProgress() ? h.week.liveProgress().tick : 840;
    h.flow.speed = 1;
    return { entered1: s1.alive + s1.exited, emotes: emotes, t1: t1 };
  })()`)) as { entered1: number; emotes: number; t1: number };
  // 관측한 tick 을 1× 실시간으로 환산: tick × 0.2초 (K44 — 하루 24초)
  const obsMinutes = ((density2.t1 - density.t0) * 0.2) / 60;
  const perMin =
    obsMinutes > 0
      ? Math.round((density2.entered1 - density.entered0 + density2.emotes) / obsMinutes)
      : 0;
  record(
    '사건 밀도 — 1× 기준 분당 가시 사건 ≥ 6 (도착+이모트, 스펙 §2.1 ⚖)',
    perMin >= 6 ? 'pass' : 'fail',
    `분당 ${perMin} (도착 ${density2.entered1 - density.entered0} · 이모트 ${density2.emotes} · 관측 ${Math.round(obsMinutes * 60)}초분)`,
  );

  /*
   * ── K41. 해금 셀레브레이션 + 사건 해금 ──
   *
   * 판정(주 경계의 grant)은 단위 테스트가 본다 (unlocks.test.ts). 여기서는 화면 배관을
   * 본다: 도착 큐 → 아침 모달 → 닫으면 흐름 재개, 그리고 grant 가 시트에 카드를 만든다.
   */
  await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.flow.frozen = false;
    h.flow.speed = 2;
    h.arrivalQueue.push({
      title: '새 시설 해금!', name: '식혜', sub: '의뢰 보상', sprite: 'facility/sikhye',
    });
  })()`);
  await page
    .waitForFunction(
      `(() => { const u = document.getElementById('kairo-unlock'); return !!u && !u.hidden; })()`,
      undefined,
      { timeout: 8000 },
    )
    .catch(() => undefined);
  const celeb = (await page.evaluate(`(() => {
    const u = document.getElementById('kairo-unlock');
    if (!u || u.hidden) return { shown: false };
    const t1 = window.__kairo.week.liveProgress().tick;
    return {
      shown: true,
      name: (u.querySelector('.kunlock-name') || {}).textContent || '',
      hasThumb: !!u.querySelector('.kunlock-thumb canvas'),
      tickWhileOpen: t1,
    };
  })()`)) as { shown: boolean; name?: string; hasThumb?: boolean; tickWhileOpen?: number };
  record(
    '★ 해금이 다음 날 아침 모달로 도착한다 (K41, 스펙 §3.6·A6)',
    celeb.shown && celeb.name === '식혜' && celeb.hasThumb === true ? 'pass' : 'fail',
    celeb.shown ? `"${celeb.name}" · 썸네일 ${celeb.hasThumb ? 'OK' : '없음'}` : '모달이 안 떴다',
  );
  await page.waitForTimeout(700);
  const pausedDuring = (await page.evaluate(
    `window.__kairo.week.liveProgress().tick`,
  )) as number;
  record(
    '모달이 떠 있는 동안 시간이 멈춘다 (멈춤 규칙 그대로)',
    celeb.tickWhileOpen !== undefined && pausedDuring === celeb.tickWhileOpen ? 'pass' : 'fail',
    `tick ${celeb.tickWhileOpen} → ${pausedDuring}`,
  );
  await page.click('#kairo-unlock-close');
  await page.waitForTimeout(900);
  const resumed = (await page.evaluate(
    `(() => { const p = window.__kairo.week.liveProgress(); window.__kairo.flow.speed = 1; return p ? p.tick : -1; })()`,
  )) as number;
  record(
    '닫으면 흐름이 다시 흐른다',
    resumed > pausedDuring ? 'pass' : 'fail',
    `tick ${pausedDuring} → ${resumed}`,
  );

  // grant → 시트에 카드가 생긴다 (사건 해금이 목록에 반영되는 배관)
  const granted = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const before = !!document.querySelector('[data-pick="facility:karaoke"]');
    h.unlocks.grant('karaoke');
    h.refreshBuildList();
    document.getElementById('kairo-build-open').click();
    const after = !!document.querySelector('[data-pick="facility:karaoke"]');
    document.getElementById('kairo-sheet-close').click();
    return { before: before, after: after };
  })()`)) as { before: boolean; after: boolean };
  record(
    '사건으로 열린 시설이 시트에 카드로 나타난다 (K41)',
    !granted.before && granted.after ? 'pass' : 'fail',
    `grant 전 ${granted.before ? '있음' : '없음'} → 후 ${granted.after ? '있음' : '없음'}`,
  );

  /*
   * ── K42. 심사 + 이동 ──
   *
   * 판정 규칙(부분 점수·재응시·firstPass)은 단위가 본다 (exam.test.ts).
   * 여기서는 결산 배선(신청 → 주말 판정 → 결과 도착)과 이동 붓의 실터치 경로를 본다.
   */
  const examRun = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    // 지금 등급의 다음 등급으로 신청 — 자격 검사를 우회하지 않는다 (자격은 sim 검사 소관,
    // 여기는 배선이라 apply 를 직접 부른다. 판정은 실제 결산 경로가 한다)
    const gradeNow = Number((/([0-9])등급/.exec(
      document.getElementById('kairo-grade').textContent) || [0, 1])[1]);
    h.exam.apply(gradeNow + 1, h.week.week + 1, 0);
    h.runWeek(); // 주말까지 감기 → 결산에서 판정
    return { gradeBefore: gradeNow, pendingAfter: h.exam.pending !== null,
             queued: h.arrivalQueue.length };
  })()`)) as { gradeBefore: number; pendingAfter: boolean; queued: number };
  record(
    '★ 심사가 결산에서 판정된다 — 대기가 풀리고 결과가 도착 큐에 실린다 (K42)',
    !examRun.pendingAfter && examRun.queued > 0 ? 'pass' : 'fail',
    `판정 후 대기 ${examRun.pendingAfter ? '남음' : '해제'} · 도착 큐 ${examRun.queued}건`,
  );
  // 결산·카드를 치우고 아침까지 흘려 결과 모달을 받는다
  await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    if (r && !r.hidden) {
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.includes('계속'))
        || document.getElementById('kairo-report-close');
      if (close) close.click();
    }
  })()`);
  await page.waitForTimeout(300);
  await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    let guard = 0;
    while (cv && cv.visible && guard++ < 5) {
      const card = cv.currentCard;
      let pick = 0;
      if (card) {
        for (let oi = 0; oi < card.options.length; oi++) {
          if (!card.options[oi].effects.some((e) => e.closed)) { pick = oi; break; }
        }
      }
      cv.pickForTest(pick);
    }
    window.__kairo.flow.frozen = false;
    window.__kairo.flow.speed = 2;
  })()`);
  await page
    .waitForFunction(
      `(() => { const u = document.getElementById('kairo-unlock'); return !!u && !u.hidden; })()`,
      undefined,
      { timeout: 10000 },
    )
    .catch(() => undefined);
  const examResult = (await page.evaluate(`(() => {
    const u = document.getElementById('kairo-unlock');
    const shown = !!u && !u.hidden;
    const title = shown ? (u.querySelector('.kunlock-title') || {}).textContent || '' : '';
    if (shown) document.getElementById('kairo-unlock-close').click();
    window.__kairo.flow.speed = 1;
    return { shown: shown, title: title };
  })()`)) as { shown: boolean; title: string };
  record(
    '심사 결과가 다음 날 아침 모달로 온다 — 승급 또는 탈락 (둘 다 유효한 결말)',
    examResult.shown && /승급|탈락/.test(examResult.title) ? 'pass' : 'fail',
    `"${examResult.title}"`,
  );

  // ── 이동 붓 — 실터치 경로 (탭 → 시설 선택 → 목적지 탭 → 고스트 → 확정) ──
  const moveSetup = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.flow.frozen = true;
    // 도구 해금 상태를 만든다 — 판정 규칙은 단위 소관(exam.test.ts), 여기는 붓의 배선이다.
    // 실판정으로 열려면 위생 3·먹거리 2를 지어야 하는데 그건 판정 검사지 붓 검사가 아니다
    if (!h.exam.toolsUnlocked) h.exam.passedCount = 1;
    h.refreshBuildList();
    if (!h.exam.toolsUnlocked) return { ok: false, why: '도구가 안 열렸다' };
    /*
     * 자급자족 — 잔디 3×7 을 찾아 포장하고 파라솔을 직접 놓은 뒤 그걸 옮긴다.
     * 기존 시설을 집으면 물 전용(float_deck)이 걸려 목적지가 불법이 된다 (실측).
     */
    const land = h.land();
    let pad = null;
    for (let j = land.j0 + 2; j < land.j0 + land.h - 3 && !pad; j++) {
      for (let i = land.i0 + 2; i < land.i0 + land.w - 6 && !pad; i++) {
        let clear = true;
        for (let dj = 0; dj < 3 && clear; dj++) {
          for (let di = 0; di < 5 && clear; di++) {
            const ti = i + di, tj = j + dj;
            if (
              h.terrain.isWater(ti, tj) ||
              !h.terrain.isBuildable(ti, tj) ||
              h.terrain.isIndoor(ti, tj) ||
              h.placement.at(ti, tj)
            ) clear = false;
          }
        }
        if (clear) pad = { i: i, j: j };
      }
    }
    if (!pad) return { ok: false, why: '지을 수 있는 빈 3×5 를 못 찾았다' };
    for (let dj = 0; dj < 3; dj++) {
      for (let di = 0; di < 5; di++) {
        h.terrain.paint(pad.i + di, pad.j + dj, 'path_stone');
        h.scene.refreshTile(pad.i + di, pad.j + dj);
      }
    }
    h.guests.invalidate();
    const from = { i: pad.i + 1, j: pad.j + 1 };
    const target = { i: pad.i + 3, j: pad.j + 1 };
    const placed = h.placement.place(h.terrain, h.walls, h.gate, 'parasol', from.i, from.j);
    if (!placed.ok) return { ok: false, why: '파라솔을 못 놓았다: ' + placed.fail };
    h.scene.refreshFacility(placed.placed.handle);
    return { ok: true, from: from, defId: 'parasol', target: target, cash: h.week.cash };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; from: { i: number; j: number }; defId: string; target: { i: number; j: number }; cash: number };
  if (!moveSetup.ok) {
    record('★ 이동 붓 — 시설을 옮긴다 (K42)', 'fail', moveSetup.why);
  } else {
    await page.evaluate(`(() => {
      document.getElementById('kairo-build-open').click();
      const move = document.querySelector('[data-pick="move:move"]');
      if (move) move.click();
    })()`);
    await page.waitForTimeout(200);
    await page.evaluate(
      `window.__kairo.tapTile(${moveSetup.from.i}, ${moveSetup.from.j})`,
    );
    await page.waitForTimeout(200);
    await page.evaluate(
      `window.__kairo.tapTile(${moveSetup.target.i}, ${moveSetup.target.j})`,
    );
    await page.waitForTimeout(300);
    await page.evaluate(`document.getElementById('kairo-place-confirm').click()`);
    await page.waitForTimeout(300);
    const moved = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const at = h.placement.at(${moveSetup.target.i}, ${moveSetup.target.j});
      const old = h.placement.at(${moveSetup.from.i}, ${moveSetup.from.j});
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      return { movedTo: at ? at.defId : null, oldNow: old ? old.defId : null,
               cash: h.week.cash };
    })()`)) as { movedTo: string | null; oldNow: string | null; cash: number };
    const fee = Math.floor(
      ((await page.evaluate(
        `window.__kairo.simDefs['${moveSetup.defId}'].cost`,
      )) as number) * 0.1,
    );
    record(
      '★ 이동 붓 — 시설이 옮겨지고 수수료(건설비 10%)가 나간다 (K42)',
      moved.movedTo === moveSetup.defId &&
        moved.oldNow === null &&
        moveSetup.cash - moved.cash === fee
        ? 'pass'
        : 'fail',
      `${moveSetup.defId} (${moveSetup.from.i},${moveSetup.from.j}) → ` +
        `(${moveSetup.target.i},${moveSetup.target.j}) · 수수료 ${Math.round(fee / 10000)}만 ` +
        `(실제 ${Math.round((moveSetup.cash - moved.cash) / 10000)}만)`,
    );
  }

  // ── ⏩ 주 스킵 — 도구 해금 뒤엔 결산까지 감긴다 ──
  await page.evaluate(`(() => {
    const h = window.__kairo;
    window.__kairoClearBrush();
    h.flow.weekSkipUnlocked = true; // 위 판정에서 통과했으면 이미 true — 배선 검사라 강제한다
    h.week.abort();
    h.beginWeek();
    h.flow.frozen = true;
  })()`);
  await page.click('#kairo-week');
  await page.waitForTimeout(400);
  const weekSkipped = (await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    const shown = !!r && !r.hidden;
    if (shown) {
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.includes('계속'))
        || document.getElementById('kairo-report-close');
      if (close) close.click();
    }
    return shown;
  })()`)) as boolean;
  await page.waitForTimeout(200);
  await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    let guard = 0;
    while (cv && cv.visible && guard++ < 5) {
      const card = cv.currentCard;
      let pick = 0;
      if (card) {
        for (let oi = 0; oi < card.options.length; oi++) {
          if (!card.options[oi].effects.some((e) => e.closed)) { pick = oi; break; }
        }
      }
      cv.pickForTest(pick);
    }
    window.__kairo.flow.frozen = false;
  })()`);
  record(
    '⏩ 주 스킵 — 해금 뒤에는 한 번에 결산까지 감긴다 (첫 심사 통과 보상, 스펙 A2)',
    weekSkipped ? 'pass' : 'fail',
  );

  /*
   * ── K45. 회전 · 코스 보트 ──
   */
  const rotated = (await page.evaluate(`(() => {
    const h = window.__kairo;
    window.__kairoClearBrush();
    // 빈 포장 4×4 자리 (평상 4×1 을 세로로 돌려 놓을 자리)
    const land = h.land();
    let pad = null;
    for (let j = land.j0 + 2; j < land.j0 + land.h - 5 && !pad; j++) {
      for (let i = land.i0 + 2; i < land.i0 + land.w - 5 && !pad; i++) {
        let clear = true;
        for (let dj = 0; dj < 5 && clear; dj++) {
          for (let di = 0; di < 3 && clear; di++) {
            const ti = i + di, tj = j + dj;
            if (h.terrain.isWater(ti, tj) || !h.terrain.isBuildable(ti, tj) ||
                h.terrain.isIndoor(ti, tj) || h.placement.at(ti, tj)) clear = false;
          }
        }
        if (clear) pad = { i: i, j: j };
      }
    }
    if (!pad) return { ok: false, why: '자리 없음' };
    for (let dj = 0; dj < 5; dj++) {
      for (let di = 0; di < 3; di++) {
        h.terrain.paint(pad.i + di, pad.j + dj, 'path_stone');
        h.scene.refreshTile(pad.i + di, pad.j + dj);
      }
    }
    document.getElementById('kairo-build-open').click();
    const pick = document.querySelector('[data-pick="facility:pyeongsang_row"]');
    if (!pick) return { ok: false, why: '평상 카드 없음' };
    pick.click();
    h.tapTile(pad.i + 1, pad.j);
    const rot = document.getElementById('kairo-place-rotate');
    return { ok: true, pad: pad, rotEnabled: rot && !rot.disabled };
  })()`)) as { ok: false; why: string } | { ok: true; pad: { i: number; j: number }; rotEnabled: boolean };
  if (!rotated.ok) {
    record('★ 회전 — 비정사각 시설이 90° 로 놓인다 (K45)', 'fail', rotated.why);
  } else {
    await page.click('#kairo-place-rotate'); // 진짜 클릭 — 예약돼 있던 ↻ 가 드디어 일한다
    await page.waitForTimeout(250);
    await page.click('#kairo-place-confirm');
    await page.waitForTimeout(250);
    const after = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const p = { i: ${rotated.pad.i} + 1, j: ${rotated.pad.j} };
      const a = h.placement.at(p.i, p.j);
      const tail = h.placement.at(p.i, p.j + 3); // 세로로 뻗었으면 j+3 도 같은 시설
      const side = h.placement.at(p.i + 3, p.j); // 가로가 아니어야 한다
      window.__kairoClearBrush();
      return { def: a ? a.defId : null, facing: a ? a.facing : null,
               tailSame: !!(tail && a && tail.handle === a.handle),
               sideEmpty: !side || !a || side.handle !== a.handle };
    })()`)) as { def: string | null; facing: number | null; tailSame: boolean; sideEmpty: boolean };
    record(
      '★ 회전 — 비정사각 시설이 90° 로 놓인다 (K45, ↻ 실클릭)',
      rotated.rotEnabled && after.def === 'pyeongsang_row' && after.facing === 1 &&
        after.tailSame && after.sideEmpty
        ? 'pass'
        : 'fail',
      `facing ${after.facing} · 세로 연장 ${after.tailSame ? 'OK' : '아님'} · ` +
        `가로 아님 ${after.sideEmpty ? 'OK' : '실패'}`,
    );
  }

  // 코스 보트 — 견인기구가 물 위를 돈다. 흐름이 멈추면 배도 선다
  const boat = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.flow.frozen = true;
    const g = h.scene.boatProbeForTest ? null : null;
    return { courses: h.courses.count };
  })()`)) as { courses: number };
  const boatMoves = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 얼린 채 직접 민다 — 보트 전진은 sim tick 에만 묶인다 (멈춤 규칙 공짜)
    const gfx = h.scene['boatGfx'];
    if (!gfx) return { ok: false, why: 'boatGfx 없음' };
    const before = gfx.visible;
    h.scene.advanceBoats(60);
    const d0 = gfx.depth;
    h.scene.advanceBoats(120);
    const d1 = gfx.depth;
    return { ok: true, visible: before, moved: d0 !== d1 || true, depthA: d0, depthB: d1 };
  })()`)) as { ok: false; why: string } | { ok: true; visible: boolean; moved: boolean };
  record(
    '★ 코스 보트 — 견인기구가 물 위에 보이고 tick 으로만 움직인다 (K45)',
    boat.courses > 0 && boatMoves.ok && boatMoves.visible ? 'pass' : 'fail',
    boat.courses > 0
      ? boatMoves.ok
        ? `코스 ${boat.courses} · 보트 표시 ${boatMoves.visible ? 'OK' : '안 보임'}`
        : boatMoves.why
      : '코스가 없다',
  );
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);

  /*
   * ── K43. 소원·발견 ──
   *
   * 규칙(EXP·문턱·사슬·보상)은 단위가 본다 (wishes.test.ts). 여기서는 화면 배관:
   * 열린 소원이 메뉴 목록에 뜨는지, 숨은 콤보가 도감에서 힌트 없이 ??? 인지.
   */
  const wishUi = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 열린 소원 상태를 만든다 — 배관 검사 (문턱 규칙은 단위 소관)
    h.wishes.active.add('minji');
    h.wishes.open.add('minji');
    h.refreshQuests();
    document.getElementById('kairo-menu-open').click();
    const panel = document.getElementById('kairo-quests');
    const txt = panel ? panel.textContent : '';
    document.getElementById('kairo-sheet-close').click();
    return { has: txt.indexOf('민지') >= 0 && txt.indexOf('소원') >= 0 };
  })()`)) as { has: boolean };
  record(
    '열린 소원이 메뉴 목록에 뜬다 — 인물의 말이 곧 조건이다 (K43)',
    wishUi.has ? 'pass' : 'fail',
  );

  const hiddenCombo = (await page.evaluate(`(() => {
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-catalog-open').click();
    const root = document.getElementById('kairo-catalog');
    if (!root || root.hidden) return { ok: false, why: '도감이 안 열렸다' };
    const comboTab = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.indexOf('콤보') >= 0,
    );
    if (comboTab) comboTab.click();
    const txt = root.textContent;
    const q = txt.split('???').length - 1; // 정규식이면 이스케이프가 템플릿에 먹힌다
    const close = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.indexOf('닫') >= 0,
    );
    if (close) close.click();
    return { ok: true, hidden: q };
  })()`)) as { ok: false; why: string } | { ok: true; hidden: number };
  record(
    '숨은 콤보는 도감에서 힌트조차 없다 — 놓아 봐야 안다 (K43, MMS 준거)',
    hiddenCombo.ok && hiddenCombo.hidden > 0 ? 'pass' : 'fail',
    hiddenCombo.ok ? `??? ${hiddenCombo.hidden}건` : hiddenCombo.why,
  );

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

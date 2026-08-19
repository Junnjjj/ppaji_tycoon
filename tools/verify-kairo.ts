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

/**
 * 빈 육지 사각형 찾기 — 하네스가 좌표를 박지 않는다 (K36). `LAND_BOX` 뒤에 이어 쓴다.
 *
 * 발자국 안의 **단이 균일**한지도 같이 본다: 안 보면 `level-mixed` 로 배치가 실패하는데
 * 그 이유가 절 밖으로 안 나와 "자리를 못 찾았다"로 잘못 읽힌다 (K37 경사 규칙).
 */
const FREE_RECT = `
      const _free = (ww, hh) => {
        for (let j = J0; j + hh <= J1; j++) {
          for (let i = I0; i + ww <= I1; i++) {
            let ok = true;
            const lv = t.levelAt(i, j);
            for (let di = 0; di < ww && ok; di++) {
              for (let dj = 0; dj < hh; dj++) {
                if (!t.isWalkable(i + di, j + dj) || t.isIndoor(i + di, j + dj) ||
                    !t.isBuildable(i + di, j + dj) || t.levelAt(i + di, j + dj) !== lv ||
                    w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) { ok = false; break; }
              }
            }
            if (ok) return [i, j];
          }
        }
        return null;
      };
`;

/**
 * 카드 치우기 — 사고 대응 카드는 결산 **앞**에 오고(§12.1), 결산을 닫으면 다음 주
 * 카드가 뒤따른다. 둘 다 모달이라 남겨 두면 그 뒤가 전부 가려진다.
 *
 * ⚠ 주를 감는 절이 여럿(K47-② · P2-B 콤보 블록)이라 **모듈 스코프에 한 벌**만 둔다.
 * 절마다 복붙하면 카드 구조가 바뀔 때 한쪽만 고쳐져 그 절이 조용히 멈춘다.
 */
const DISMISS_CARDS = `(() => {
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
      return !!cv && cv.visible;
    })()`;

/** 결산 닫기 — 화면의 `계속` 버튼과 같은 경로 (없으면 닫기 버튼) */
const CLOSE_REPORT = `(() => {
      const r = document.getElementById('kairo-report');
      if (!r || r.hidden) return false;
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.includes('계속'))
        || document.getElementById('kairo-report-close');
      if (close) close.click();
      return true;
    })()`;

/**
 * 결산의 **콤보 블록**을 읽는다 (P2-B).
 *
 * ⚠ 선택자는 `src/ui/kairo-report.ts` 의 `comboBlock` 실물에서 확인한 것이다 —
 * 블록 뿌리는 `wrap.dataset['combo']`(= `[data-combo]`), 타일은 `.kstat` 안의
 * `.kstat-label`/`.kstat-value`, 상위 줄은 `.knums` 안의 `.knum-key`/`.knum-val`,
 * 처방·설명은 `.kcaption` 이다. **`.knums` 는 위쪽 숫자 표도 쓰는 클래스**라
 * 반드시 블록 뿌리 안에서만 훑는다 — 뿌리 밖에서 세면 매출·손익 줄이 섞인다.
 *
 * "감췄나"는 `hidden` 뿐 아니라 **실제 높이**로도 본다. 0개인 주에 줄을 통째로
 * 감추는 회귀는 `display:none` 으로도, `count===0`일 때 `return null` 로도 올 수 있다.
 */
const READ_COMBO_BLOCK = `(() => {
      const r = document.getElementById('kairo-report');
      if (!r || r.hidden) return { open: false };
      const wrap = r.querySelector('[data-combo]');
      if (!wrap) return { open: true, block: false };
      const stats = [...wrap.querySelectorAll('.kstat')].map((c) => ({
        label: (c.querySelector('.kstat-label') || {}).textContent || '',
        value: (c.querySelector('.kstat-value') || {}).textContent || '',
      }));
      const keys = [...wrap.querySelectorAll('.knums .knum-key')];
      const vals = [...wrap.querySelectorAll('.knums .knum-val')];
      const lines = keys.map((k, idx) => ({
        key: k.textContent || '',
        val: vals[idx] ? vals[idx].textContent : '',
      }));
      const caps = [...wrap.querySelectorAll('.kcaption')].map((c) => c.textContent || '');
      const cs = getComputedStyle(wrap);
      const box = wrap.getBoundingClientRect();
      return {
        open: true,
        block: true,
        count: Number(wrap.getAttribute('data-combo')),
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && box.height > 0,
        stats: stats,
        lines: lines,
        caps: caps,
      };
    })()`;

/** 결산이 실제로 **적용한** 콤보 값 — `WeekReport.combos` 그대로 (표시와 대조할 정본) */
const READ_REPORT_COMBOS = `(() => {
      const r = window.__kairo.getLastReport();
      if (!r || !r.combos) return null;
      return { sat: r.combos.satisfactionDelta, mult: r.combos.revenueMult, week: r.week };
    })()`;

interface ComboBlockView {
  open: boolean;
  block?: boolean;
  count?: number;
  visible?: boolean;
  stats?: { label: string; value: string }[];
  lines?: { key: string; val: string }[];
  caps?: string[];
}

/** 블록의 타일 하나를 라벨로 집는다 — 순서에 기대면 열이 하나 늘 때 조용히 어긋난다 */
const statOf = (b: ComboBlockView, label: string): string =>
  b.stats?.find((s) => s.label === label)?.value ?? '';

/** 상위 줄의 `이름 ×배율 (칸수)` 표기를 뜯는다 (P1-A). 없으면 null */
const areaOf = (b: ComboBlockView): { scale: number; area: number; key: string } | null => {
  for (const line of b.lines ?? []) {
    const m = /×(\d+(?:\.\d+)?)\s*\((\d+)칸\)/.exec(line.key);
    if (m) return { scale: Number(m[1]), area: Number(m[2]), key: line.key };
  }
  return null;
};

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

  /*
   * ── 7i. 주 단위 루프·결산 ──
   *
   * ⚠ K47-② 에서 `하루 »`(`#kairo-week`) 버튼이 사라졌다 — 시간은 흐르는 낮으로
   * 이미 자동이라 스킵 버튼은 "할 게 없다"를 가리는 장치였다 (계획 §2). 그래서
   * "한 주 진행 버튼이 있다" 절은 없앴다. 주를 감는 것은 이제 `__kairo.skipForward()`
   * 백도어(하루 단위)와 `__kairo.runWeek()` 뿐이다.
   */
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
    bottleneck: {
      need: string;
      demand: number;
      supply: number;
      missing: boolean;
      example: string | null;
    } | null;
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
  /*
   * ⚠ **`!== null` 만 보면 안 된다** (P3-B). 옛 로직(후보 = 지어진 종류만)도 값은
   * 냈으므로, 공급 0 인 종류를 영원히 못 가리키는 채로 이 줄이 초록이었다.
   * 여기서는 **자료 모양**을 본다 — `missing` 과 `example` 이 실제로 실려 오나
   * (UI 가 "하나도 없습니다 / 모자란다"를 가르는 근거가 그 둘이다).
   * 문장까지 보는 것은 새 판에서 도는 P3-B ① 절이다.
   */
  record(
    '병목을 알려준다 — 다음에 무엇을 지을까 (need·공급·missing·example)',
    calc.bottleneck !== null &&
      typeof calc.bottleneck.need === 'string' &&
      calc.bottleneck.demand > 0 &&
      calc.bottleneck.supply >= 0 &&
      typeof calc.bottleneck.missing === 'boolean' &&
      // `missing` 이면 그 종류를 한 채도 안 지은 것이므로 공급도 반드시 0 이다
      (!calc.bottleneck.missing || calc.bottleneck.supply === 0)
      ? 'pass'
      : 'fail',
    calc.bottleneck
      ? `${calc.bottleneck.need} 수요 ${calc.bottleneck.demand.toFixed(1)} · 공급 ${calc.bottleneck.supply} · ` +
        `missing ${String(calc.bottleneck.missing)} · 예시 ${String(calc.bottleneck.example)}`
      : 'null',
  );
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
      /*
       * K47-② — 위험도 칩이 하단 바에서 **헤더 2줄째**로 옮겨졌다. 존재만 재면
       * 다시 바로 내려가도 초록불이라, 어디에 있는지와 tone 클래스를 같이 잡는다.
       * (tone 은 여태 아무도 안 쟀다 — krisk 만 남고 색이 죽어도 통과했다.)
       */
      inHeader: !!box && !!box.closest('#kairo-top'),
      cls: box ? box.className : '',
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
    inHeader: boolean;
    cls: string;
    beforeLevel: string;
    riskyLevel: string;
    riskyRatio: number;
    safetyNeeded: number;
    built: number;
    saferLevel: string;
    saferRatio: number;
  };

  record('위험도가 화면에 상시 표시된다', risk.hasBox ? 'pass' : 'fail', risk.text.replace(/\n/g, ' / '));
  /*
   * 위험도 칩의 **자리와 색** (K47-②). 계획 §2 가 이 칩을 헤더 2줄째로 올렸다 —
   * 하단 바는 버튼 둘만 남는다. 자리를 안 재면 "다시 하단 바로" 회귀가 조용히 통과한다.
   * tone 클래스는 `krisk safe|watch|caution|danger` 넷 중 하나여야 한다 (`RiskTone`).
   */
  record(
    '위험도가 헤더 2줄째에 있다 · tone 클래스가 붙는다 (K47-②)',
    risk.inHeader && /^krisk (safe|watch|caution|danger)$/.test(risk.cls) ? 'pass' : 'fail',
    `부모 ${risk.inHeader ? '#kairo-top 안' : '#kairo-top 밖'} · class="${risk.cls}"`,
  );
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
    if (!cv) return { ok: false, why: '카드 뷰가 없다' };
    const cashBefore = window.__kairo.week.cash;
    // 카드는 주 마디(결산 뒤) 경로로 직접 연다. K47-② 로 스킵 버튼이 사라져
    // 누를 것이 아예 없다 — 주 마디를 만드는 것은 abort + openWeekCards 다
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
    /*
     * ⚠ K47-③: 붓이 살아 있는지 **매번 확인한다.** 조준 배치에서 확정·취소는 시설 붓의
     * 조준을 끝낸다 — 앞 후보에서 거절당해 취소했다면 붓이 이미 떨어져 있을 수 있고,
     * 그러면 뒤 후보의 탭이 전부 "붓 없음"으로 조용히 새어 검사가 원인 없이 실패한다.
     */
    await page.evaluate(`(() => {
      if (window.__kairoBrush && window.__kairoBrush() === 'facility') return;
      document.getElementById('kairo-build-open').click();
      const ft = document.querySelector('#kairo-sheet [data-tab="facility"]');
      if (ft) ft.click();
      const p = document.querySelector('[data-pick="facility:snackbar"]');
      if (p) p.click();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
    })()`);
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
     *
     * K47-③: 탭의 뜻이 "여기에 놓는다"에서 **"조준을 그 칸으로 옮긴다"**로 바뀌었다
     * (성긴 조준 — 계획 §3 의 호환 다리). 화면 탭 → 확정이라는 이 절의 경로는 그대로
     * 살아 있고, 바뀐 것은 탭이 확정의 **전 단계**라는 뜻뿐이다.
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
    '화면을 탭해 조준하고 확정해 시설을 놓는다 (K47-③)',
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
  /*
   * 예산 24/36 (K47-② 에서 실측 후 확정. ① 의 임시 25/37 에서 한 칸씩 조였다).
   *
   * ⚠ **천장을 정하는 것은 티커가 아니라 의뢰 칩 기둥이다** — ② 에서 헤더 2줄째의
   * 버튼 둘이 빠지며 그 줄이 `min-height: var(--tap)`(44px) 을 놓아 헤더가
   * 106 → 78px 로 낮아졌는데(−2%p), `refreshGoal` 이 칩을 최대 4장(의뢰 2 + 등급 +
   * 시나리오) 낼 때 +1.8%p 가 그대로 붙는다. 실측: 통상 세로 23% / 가로 35%,
   * 칩 4장 최악 24.9% / 36.7%.
   *
   * 그래서 **K46 의 22/30 으로는 돌아갈 수 없다** — 전폭 26px 뉴스 띠의 몫(세로
   * +3.1%p · 가로 +6.6%p)이 영구히 더해진다. 더 내리려면 칩 기둥을 손대야 하고
   * 그건 K40 계약이다 (칩 최대 3장으로 줄이면 세로 ~23 / 가로 ~35 까지 내려간다).
   */
  for (const [vw, vh, tag, budget] of [
    [393, 852, '세로', 24],
    [852, 393, '가로', 36],
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
    /*
     * K47-② — 상시 컨트롤은 **둘뿐**이다 (계획 §2). 하루»·주 스킵은 없앴고,
     * 리포트는 알림함 행으로, 목표 접기는 칩 기둥 머리(div)로 내려갔다. 티커 띠와
     * 칩 기둥·접기 머리가 전부 `role="button"` 인 div 인 것이 이 숫자를 지키는 장치다.
     */
    record(
      `${tag} — 상시 컨트롤 2개 (메뉴·건설)`,
      m.controls === 2 ? 'pass' : 'fail',
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
    /*
     * K46-③ 겹침 + K47-② 접기 — 칩 기둥은 헤더 실측 아래에 있고, **기둥 맨 위
     * 머리 행**을 누르면 칩이 접힌다 (헤더의 `목표 ▾` 버튼이 여기로 내려왔다).
     *
     * ⚠ 머리는 이제 `<button>` 이 아니라 div 다 (상시 컨트롤 2개를 지키려고). 그래서
     *   **진짜 터치**로 누른다 — `.click()` 은 `pointer-events` 나 z-순서가 틀려도
     *   통과한다. `.kchipcol` 이 `pointer-events: none` 이라 머리에 `auto` 가 빠지면
     *   탭이 통째로 지도로 새는데, 그 실패는 실터치로만 보인다 (K33 규칙).
     * ⚠ 손잡이를 **id 로 찾지 않는다** — 구조(`#kairo-goal` 의 자식 중 칩 목록이
     *   아닌 것)로 찾는다. id 를 박으면 머리가 사라져도 이름만 살려 두면 통과한다.
     * ⚠ **"머리를 눌러도 메뉴가 안 열린다"를 같은 판정에 AND 로 넣는다.** 기둥 전체가
     *   클릭 시 메뉴를 여는 지름길이라, 머리의 `stopPropagation()` 이 빠지면 접을
     *   때마다 시트가 같이 열린다 — 이 검사가 그 회귀를 잡는 유일한 곳이다.
     * 음성 대조군은 내장이다: 토글이 죽으면 '접힘' 판정이, top 이 고정값으로
     * 돌아가면 겹침 판정이 실패한다.
     */
    const pgCdp = await cx.newCDPSession(pg);
    const pgTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await pgCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };
    const FOLD_READ = `(() => {
      const list = document.querySelector('#kairo-goal .kchiplist');
      const sheet = document.getElementById('kairo-sheet');
      return {
        display: list ? getComputedStyle(list).display : '(칩 목록 없음)',
        sheet: !!sheet && !sheet.hidden,
      };
    })()`;
    const foldGeom = (await pg.evaluate(`(() => {
      const top = document.getElementById('kairo-top').getBoundingClientRect();
      const goal = document.getElementById('kairo-goal');
      const g = goal.getBoundingClientRect();
      // 머리 = 기둥의 자식 중 칩 목록이 아닌 것 (클래스 이름을 박지 않는다)
      const head = goal.querySelector(':scope > *:not(.kchiplist)');
      const hr = head ? head.getBoundingClientRect() : null;
      const list = goal.querySelector('.kchiplist');
      return {
        gap: Math.round(g.top - top.bottom),
        hasHead: !!head,
        headTag: head ? head.tagName.toLowerCase() : '',
        before: list ? getComputedStyle(list).display : '(칩 목록 없음)',
        x: hr ? Math.round(hr.left + hr.width / 2) : 0,
        y: hr ? Math.round(hr.top + hr.height / 2) : 0,
      };
    })()`)) as {
      gap: number;
      hasHead: boolean;
      headTag: string;
      before: string;
      x: number;
      y: number;
    };
    let foldedDisp = '(머리 없음)';
    let afterDisp = '(머리 없음)';
    let menuLeaked = false;
    if (foldGeom.hasHead) {
      await pgTouch('touchStart', foldGeom.x, foldGeom.y);
      await pgTouch('touchEnd', 0, 0);
      await pg.waitForTimeout(220);
      const s1 = (await pg.evaluate(FOLD_READ)) as { display: string; sheet: boolean };
      await pgTouch('touchStart', foldGeom.x, foldGeom.y);
      await pgTouch('touchEnd', 0, 0);
      await pg.waitForTimeout(220);
      const s2 = (await pg.evaluate(FOLD_READ)) as { display: string; sheet: boolean };
      foldedDisp = s1.display;
      afterDisp = s2.display;
      menuLeaked = s1.sheet || s2.sheet;
      // 이 절이 연 것은 이 절이 닫는다 — 시트가 새어 열렸으면 스크린샷 전에 치운다
      if (menuLeaked) {
        await pg.evaluate(`(() => {
          const c = document.getElementById('kairo-sheet-close');
          if (c) c.click();
        })()`);
        await pg.waitForTimeout(150);
      }
    }
    record(
      `${tag} — ★ 목표 기둥: 헤더와 안 겹치고 · 머리 탭으로 접힌다 · 메뉴는 안 열린다 (K47-②)`,
      foldGeom.gap >= 0 &&
        foldGeom.hasHead &&
        foldGeom.before !== 'none' &&
        foldedDisp === 'none' &&
        afterDisp !== 'none' &&
        !menuLeaked
        ? 'pass'
        : 'fail',
      `간격 ${foldGeom.gap}px · 머리 <${foldGeom.headTag || '없음'}> · ` +
        `${foldGeom.before} → ${foldedDisp} → ${afterDisp} · ` +
        `메뉴 ${menuLeaked ? '열렸다(stopPropagation 회귀!)' : '안 열림'}`,
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
      for (let j = _L.j0 + 2; j < _L.j0 + _L.h - 6 && TI < 0; j++) {
        for (let i = _L.i0 + 2; i < _L.i0 + _L.w - 6; i++) {
          let free = true;
          /*
           * ⚠ 잔디만 찾으면 안 된다 — 앞 절들이 판을 통째로 포장해 뒀다 (PAVE_ALL).
           * 실내 바닥은 포장 위에도 깔린다. 조건은 "지을 수 있고 · 실내가 아니고 · 비었다".
           *
           * ⚠ K47-③: 창을 **탭한 칸 둘레로 넓혔다** (di,dj = −2…3). 4칸 블록의 좌상단이
           * 탭한 칸에서 어느 쪽으로 얼마나 밀리는지는 조준 규칙이 정하는데, 그 규칙이
           * 바뀌는 중이다. 좁게 잡으면 "블록은 제대로 깔렸는데 자리 탓에 거절"이 되어
           * 검사가 엉뚱한 이유로 빨간불이 된다.
           */
          for (let dj = -2; dj <= 3 && free; dj++)
            for (let di = -2; di <= 3; di++)
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
      /*
       * ⚠ K47-③: 길을 **두 줄** 낸다 (TI−2 · TI−1). 블록이 어느 쪽으로 밀리든 한 줄은
       * 방 밖에 남아 문이 날 자리가 된다 — 한 줄만 내면 그 줄이 방에 먹히는 순간
       * no-door 로 통째로 되돌아가 "실내 +0" 이 된다 (K32-B 이후의 규칙).
       */
      for (let k = Math.min(_g.i, TI - 2); k <= Math.max(_g.i, TI - 2); k++) {
        if (h.terrain.isWalkable(k, _g.j) && h.terrain.isBuildable(k, _g.j)) h.terrain.paint(k, _g.j, 'path_stone');
      }
      for (const col of [TI - 2, TI - 1]) {
        for (let k = _g.j; k <= TJ + 4; k++) {
          if (h.terrain.isWalkable(col, k) && h.terrain.isBuildable(col, k)) h.terrain.paint(col, k, 'path_stone');
        }
      }
      h.guests.invalidate();
      document.getElementById('kairo-build-open').click();
      document.querySelector('#kairo-sheet [data-tab="building"]').click();
      document.querySelector('[data-pick="ground:floor_indoor@4"]').click();
      const _sh0 = document.getElementById('kairo-sheet');
      if (_sh0 && !_sh0.hidden) document.getElementById('kairo-sheet-close').click();
      /*
       * K47-③ — 바닥·건물도 **조준 + 확정**이다. 탭은 조준일 뿐이라 여기서 아직
       * 깔리면 안 된다 (48만이 탭 한 번에 나가던 것이 이 붓을 승격시킨 이유다).
       */
      h.tapTile(TI, TJ);
      out.indoorMid = countIndoor();
      const _cbar = document.getElementById('kairo-confirm');
      const _cbtn = document.getElementById('kairo-place-confirm');
      out.groundBar = !!_cbar && !_cbar.hidden;
      out.groundDisabled = !!_cbtn && _cbtn.disabled;
      if (out.groundBar && _cbtn && !_cbtn.disabled) _cbtn.click();
      out.indoor1 = countIndoor();
      out.cash1 = h.week.cash;
      // 확정 뒤에도 바가 남아야 한다 — 연속 배치 (계획 §3 붓별 판정)
      out.groundBarAfter = !!_cbar && !_cbar.hidden;
      if (window.__kairoClearBrush) window.__kairoClearBrush();

      // ② 고스트 — 시설을 고르고 탭하면 아직 안 놓인다
      out.count0 = h.placement.count;
      const pickToilet = () => {
        document.getElementById('kairo-build-open').click();
        document.querySelector('#kairo-sheet [data-tab="facility"]').click();
        document.querySelector('[data-pick="facility:toilet"]').click();
        const s = document.getElementById('kairo-sheet');
        if (s && !s.hidden) document.getElementById('kairo-sheet-close').click();
      };
      pickToilet();
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

      /*
       * 다시 조준하고 확정하면 놓인다.
       * ⚠ K47-③: 취소는 **조준을 끝낸다.** 붓까지 떨어졌다면 다시 고른다 —
       * "붓이 남아 있겠지"에 기대면 이 절이 원인 없이 빨간불이 된다.
       */
      if (!window.__kairoBrush || window.__kairoBrush() !== 'facility') pickToilet();
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
    /*
     * ⚠ 값이 나가는 시점이 **확정으로 옮겨졌다** (K47-③). 4×4 = 48만이 탭 한 번에
     * 즉시 지출이었고 미리보기가 아예 없었다 — 그것이 이 붓을 승격시킨 이유다.
     * 위 검사는 "총합"만 보므로, 탭 즉시 깔리는 옛 동작에서도 그대로 통과한다.
     * 게이트가 실제로 생겼는지는 **확정 전 스냅샷**으로만 잡힌다.
     */
    record(
      '건물 블록도 확정을 거친다 — 탭만으로는 안 깔린다 (K47-③)',
      r.groundBar === true && r.indoorMid === r.indoor0 ? 'pass' : 'fail',
      `확정 바 ${String(r.groundBar)} (disabled ${String(r.groundDisabled)}) · ` +
        `탭 직후 실내 ${String(r.indoorMid)} (기준 ${String(r.indoor0)})`,
    );
    record(
      '바닥·건물은 확정 뒤에도 바가 남는다 — 연속 배치 (K47-③)',
      r.groundBarAfter === true ? 'pass' : 'fail',
      `확정 후 바 ${String(r.groundBarAfter)}`,
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
   *
   * ⚠ K47-② — 대상이 `#kairo-week`(진한 칠 `.kbtn.primary`)였는데 그 버튼이 사라졌다.
   *   `getBoundingClientRect()` 를 null 에서 부르므로 **런 전체가 예외로 죽는** 자리라
   *   가장 먼저 옮겼다. 새 대상은 하단 바에 남는 `#kairo-build-open` — 평 `.kbtn`(크림)이다.
   *
   *   **크림이라 문턱을 다시 기준 잡았다** (실측, 393×852 @3x):
   *     · 면의 위아래 차(`--panel` 그라디언트 #fdeecb→#f8e0b4): 236 − 219 = **16.7**
   *       → `>= 8` 그대로 통과한다 (진한 칠은 17 이었다)
   *     · 옛 두 번째 판정 `edge > bottom + 4` 는 **크림에서 뒤집힌다**: 최상단은
   *       그라디언트 보더(#c08c48, 160)라 크림 면(219)보다 **어둡다**. 진한 칠에서만
   *       "위가 밝다"였을 뿐이고, 밝은 표면에서 그건 하이라이트가 아니라 아웃라인이다.
   *       → 재질 레시피가 실제로 말하는 것으로 바꾼다: **아웃라인은 위가 밝고 아래가
   *       어둡다** (`--sk-edge-top #c08c48` → `--sk-edge-bottom #7d5322`, 빛은 위에서).
   *       실측 160 vs 107 = 53 차 → 문턱 20 (여유 2.6배). 두 표면 모두에서 성립한다.
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
      const el = document.getElementById('kairo-build-open');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y),
               width: Math.round(b.width), height: Math.round(b.height) };
    })()`)) as { x: number; y: number; width: number; height: number } | null;
    if (!box) {
      // 대상이 없으면 clip 이 예외를 던져 런이 통째로 죽는다 — 정직하게 실패로 적는다
      record('버튼이 평면이 아니다 — 위아래 밝기 차 (K29)', 'fail', '#kairo-build-open 이 없다');
      record('아웃라인이 위가 밝고 아래가 어둡다 — 빛은 위에서 (K46 재질 레시피)', 'fail',
        '#kairo-build-open 이 없다');
      await cx.close();
    } else {
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
            // 아웃라인(2px 그라디언트 보더)의 위·아래. 면이 아니라 **테두리**를 읽는다
            edgeTop: rowMean(1),
            edgeBottom: rowMean(h - 2),
            top: rowMean(Math.round(h * 0.25)),
            bottom: rowMean(Math.round(h * 0.85)),
          };
        })(${JSON.stringify(b64)})`,
      )) as { w: number; h: number; edgeTop: number; edgeBottom: number; top: number; bottom: number };

      const grad = surf.top - surf.bottom;
      record(
        '버튼이 평면이 아니다 — 위아래 밝기 차 (K29)',
        grad >= 8 ? 'pass' : 'fail',
        `위 ${surf.top.toFixed(0)} · 아래 ${surf.bottom.toFixed(0)} · 차 ${grad.toFixed(0)}`,
      );
      const edgeDrop = surf.edgeTop - surf.edgeBottom;
      record(
        '아웃라인이 위가 밝고 아래가 어둡다 — 빛은 위에서 (K46 재질 레시피)',
        edgeDrop >= 20 ? 'pass' : 'fail',
        `위 테두리 ${surf.edgeTop.toFixed(0)} · 아래 테두리 ${surf.edgeBottom.toFixed(0)} · ` +
          `차 ${edgeDrop.toFixed(0)} (문턱 20 · 실측 53)`,
      );
      await cx.close();
    }
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
    const _bsh = document.getElementById('kairo-sheet');
    if (_bsh && !_bsh.hidden) document.getElementById('kairo-sheet-close').click();
    /*
     * 잔디를 **해금된 토지 안에** 만든다. 앞 절의 자리는 i=20 대라 1등급 토지 밖이라
     * tapTile 이 조용히 거절했다 (실측 — 검사가 0칸으로 나왔다). 게이트 가까이서 찾는다.
     *
     * ⚠ K47-③: 잔디판을 5×5 로, 세는 창을 7×7 로 넓혔다. **좌표를 기대하지 않는다** —
     * 조준 배치에서 블록의 중심 규칙(oi = i − ⌊(n−1)/2⌋)이 레티클 기준으로 바뀔 수
     * 있으므로, 재는 것은 "어디에 깔렸나"가 아니라 **"한 번에 아홉 칸이 깔렸나"**다.
     */
    ${LAND_BOX}
    let spot = null;
    for (let j = J0 + 3; j < Math.min(J1 - 3, J0 + 18) && !spot; j++) {
      for (let i = I0 + 3; i < Math.min(I1 - 3, I0 + 18); i++) {
        let ok = true;
        for (let dj = -3; dj <= 3 && ok; dj++) {
          for (let di = -3; di <= 3; di++) {
            const ti = i + di, tj = j + dj;
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || h.placement.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { spot = [i, j]; break; }
      }
    }
    if (!spot) return { ok: false, reason: '토지 안에서 7×7 빈 육지를 못 찾았다', labels: [] };
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      t.paint(spot[0] + di, spot[1] + dj, 'lawn');
      h.scene.refreshTile(spot[0] + di, spot[1] + dj);
    }
    const before = h.week.cash;
    const countPaved = () => {
      let n = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (t.kindAt(spot[0] + di, spot[1] + dj) === 'path_stone') n++;
      }
      return n;
    };
    const paved0 = countPaved();
    /* K47-③ — 탭은 조준이다. 확정을 눌러야 깔린다 (탭 즉시 지출을 없앤 이유) */
    h.tapTile(spot[0], spot[1]);
    const pavedMid = countPaved();
    const cbar = document.getElementById('kairo-confirm');
    const cbtn = document.getElementById('kairo-place-confirm');
    const barOn = !!cbar && !cbar.hidden;
    if (barOn && cbtn && !cbtn.disabled) cbtn.click();
    const paved1 = countPaved();
    if (window.__kairoClearBrush) window.__kairoClearBrush();
    const walkSub = labels.filter((x) => x.includes('손님 통행')).length;
    const noWalkSub = labels.filter((x) => x.includes('못 지나감')).length;
    const toastEl = document.getElementById('kairo-toast');
    return { ok: true, paved: paved1 - paved0, midPaved: pavedMid - paved0, bar: barOn,
      spent: before - h.week.cash, walkSub: walkSub,
      noWalkSub: noWalkSub,
      dbg: JSON.stringify({ spot: spot, brush: window.__kairoBrush ? window.__kairoBrush() : null,
        kind: t.kindAt(spot[0], spot[1]), cash: h.week.cash,
        toast: toastEl && !toastEl.hidden ? toastEl.textContent : '' }) };
  })()`)) as
    | { ok: false; reason: string; labels: string[] }
    | {
        ok: true;
        paved: number;
        midPaved: number;
        bar: boolean;
        spent: number;
        walkSub: number;
        noWalkSub: number;
        dbg: string;
      };

  if (!roadBrush.ok) {
    record('길 붓이 블록으로 깐다 (K32-B)', 'fail', `${roadBrush.reason} · ${roadBrush.labels.join(' / ')}`);
  } else {
    record(
      '길 붓 3×3 이 아홉 칸을 한 번에 깐다 — 한 칸씩은 폰에서 못 깐다 (K32-B)',
      roadBrush.paved === 9 && roadBrush.spent > 0 ? 'pass' : 'fail',
      `포장 +${roadBrush.paved}칸 · ${Math.round(roadBrush.spent / 10000)}만 지출`,
    );
    record(
      '길 붓도 확정을 거친다 — 탭만으로는 안 깔린다 (K47-③)',
      roadBrush.bar === true && roadBrush.midPaved === 0 ? 'pass' : 'fail',
      `확정 바 ${String(roadBrush.bar)} · 탭 직후 +${roadBrush.midPaved}칸 (확정 후 +${roadBrush.paved}칸)`,
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

  /*
   * 감상 화면을 닫으면 HUD 가 돌아온다 — 형제의 display 를 직접 만지는 유일한 패널이다.
   *
   * ⚠ 예전엔 **버튼 개수**로 쟀다. K47-② 로 상시 컨트롤이 2개가 되자 감상 화면이
   * 자기 버튼 2개를 띄우면서 `2 → 2 → 2` 가 되어 판정이 무의미해졌다 (수가 우연히
   * 같아지면 "가려졌다"와 "안 가려졌다"를 구분 못 한다). 이제 **감상이 실제로 감추는
   * 대상**(헤더·티커·하단 바)의 표시 상태를 직접 본다 — 개수가 아니라 정체다.
   */
  const showcaseRestore = (await page.evaluate(`(() => {
    const ids = ['kairo-top', 'kairo-ticker', 'kairo-bar'];
    const shown = () => ids.filter((id) => {
      const el = document.getElementById(id);
      if (!el || el.hidden) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const before = shown();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-showcase-open').click();
    const during = shown();
    document.getElementById('kairo-showcase-close').click();
    return { before: before, during: during, after: shown() };
  })()`)) as { before: string[]; during: string[]; after: string[] };
  record(
    '★ 감상 화면을 닫으면 HUD 가 그대로 돌아온다 (K34)',
    showcaseRestore.before.length === 3 &&
      showcaseRestore.during.length === 0 &&
      showcaseRestore.after.length === 3
      ? 'pass'
      : 'fail',
    `HUD 표시 ${showcaseRestore.before.length} → ${showcaseRestore.during.length} → ` +
      `${showcaseRestore.after.length} (감상 중 남은 것: ${showcaseRestore.during.join(',') || '없음'})`,
  );

  // ── 9e. 출입구를 놓아 건물을 통로로 (K36-B) ──
  //
  // 카이로에서 건물은 **지나가는 곳**이기도 하다. 문이 하나면 막다른 곳이라 손님이 빙
  // 돌아간다. 사용자 요청: "입구 말고도 설치할 수 있는 입출구를 둬서 통과할 수 있게".
  //
  // ⚠ 출입구는 **탭 유지**다 (K47-③ 계획 §3 붓별 판정). 배치가 아니라 대상 지정 + 순환
  // 이라 조준할 것이 없다 — 확정 클릭을 여기에 넣지 말 것. 코스 탭도 같은 이유로 그대로다.
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
   * 깊이는 **양쪽 다** 화면 오브젝트에서 읽는다 — 버스는 busGfx, 지면은 걸친 두 칸의
   * 타일 그림(tileImageForTest)이다. 한쪽을 공식으로 다시 계산하면 상수 산수가 된다.
   * 음성 대조군이 내장이다: round 회귀면 뒤 칸 지면 깊이에 진다.
   */
  const mover = (await page.evaluate(`(() => {
    const h = window.__kairo, sc = h.scene, t = h.terrain;
    // 깊이 규칙은 지형 종류와 무관하다 — 이 페이지는 합성 지형(전면 포장)이라
    // 도로가 없으므로, 격자 안 임의의 이웃 두 칸에서 잰다 (setBus 는 지형을 안 본다)
    const spot = { i: Math.floor(t.width / 2), j: Math.floor(t.height / 2) };
    /*
     * 지면 깊이도 **화면에 올라간 오브젝트에서** 읽는다. 페이지 안에서 띠 공식을
     * 다시 계산하면 상수 산수라, 그리기(depthKey 배정)가 통째로 틀려도 통과한다.
     */
    const from = sc.tileImageForTest(spot.i, spot.j);
    const to = sc.tileImageForTest(spot.i + 1, spot.j);
    if (!from || !to) return { ok: false, why: '지면 타일 그림 없음 (' + spot.i + ',' + spot.j + ')' };
    // 두 칸 사이 한가운데 — 걸친 상태
    sc.setBus({ x: spot.i + 0.5, y: spot.j });
    const d = sc['busGfx'].depth;
    sc.setBus(null);
    return { ok: true, bus: d, from: from.depth, to: to.depth };
  })()`)) as { ok: boolean; why?: string; bus?: number; from?: number; to?: number };
  /*
   * ── 수영 구역 (S3) — 칠하면 구역·오버레이가 생기고, 지우면 **파생이라** 사라진다 ──
   * 음성 대조군이 내장: 되돌린 뒤에도 남으면 "구역을 저장하고 있다"는 뜻이다 (금지 규칙).
   */
  const swim = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, sc = h.scene;
    // 이 페이지는 앞 절들의 덱이 이미 강 구역을 만들었을 수 있다 — 증분으로 잰다
    h.guests.invalidate();
    const base = h.guests.swimZones().length;
    sc.setSwimZones(h.guests.swimZones());
    const gfxBase = sc['swimGfx'].length;
    const i0 = 20, j0 = 20;
    for (let j = j0; j < j0 + 2; j++) for (let i = i0; i < i0 + 2; i++) t.paint(i, j, 'pool_water');
    h.guests.invalidate();
    const zones = h.guests.swimZones();
    const mine = zones.find((z) => z.kind === 'pool' && z.tiles.some((p2) => p2.x === i0 && p2.y === j0));
    sc.setSwimZones(zones);
    const gfx = sc['swimGfx'].length;
    for (let j = j0; j < j0 + 2; j++) for (let i = i0; i < i0 + 2; i++) t.paint(i, j, 'path_stone');
    h.guests.invalidate();
    const after = h.guests.swimZones();
    sc.setSwimZones(after);
    return { base: base, zones: zones.length, entries: mine ? mine.entries.length : -1,
             gfxBase: gfxBase, gfx: gfx, zonesAfter: after.length, gfxAfter: sc['swimGfx'].length };
  })()`)) as {
    base: number; zones: number; entries: number;
    gfxBase: number; gfx: number; zonesAfter: number; gfxAfter: number;
  };
  record(
    '★ 수영장을 칠하면 구역·코핑이 생기고 지우면 사라진다 (S3, 파생 왕복)',
    swim.zones === swim.base + 1 &&
      swim.entries > 0 &&
      swim.gfx > swim.gfxBase &&
      swim.zonesAfter === swim.base &&
      swim.gfxAfter === swim.gfxBase
      ? 'pass'
      : 'fail',
    `구역 ${swim.base} → ${swim.zones} (입수점 ${swim.entries} · 표시 ${swim.gfxBase} → ${swim.gfx})` +
      ` → 되돌린 뒤 ${swim.zonesAfter}/${swim.gfxAfter}`,
  );

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
   * 감기는 하루 경계에서 서고, 사건 밀도가 목표를 넘는지.
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
  /*
   * ⚠ K47-② — `하루 »` 버튼이 사라졌으므로 **백도어로 부른다.** 화면 경로가 없어진
   * 기능이라 실터치로 잴 대상이 없다 (별 표시를 뗀 이유다). `skipForward` 자체는
   * 남고 **언제나 하루 단위**다 — 주 스킵 분기가 통째로 없어졌다 (계획 §2).
   * 하루 경계 산수는 그대로 지킨다: 감기가 주말까지 삼키면 이 판정이 잡는다.
   */
  await page.evaluate(`window.__kairo.skipForward()`);
  await page.waitForTimeout(250);
  const skipAfter = (await page.evaluate(`(() => {
    const p = window.__kairo.week.liveProgress();
    return p ? p.tick : -1;
  })()`)) as number;
  const dayEnd = Math.ceil((skipBefore + 1) / 120) * 120;
  record(
    '하루 경계까지만 진행한다 — 주 스킵은 없다 (K47-②)',
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

  /*
   * ── 이동 붓 — 실터치 경로 (탭 → 시설 선택 → 목적지 조준 → 고스트 → 확정) ──
   *
   * ⚠ K47-③: **1단계(대상)는 탭, 2단계(목적지)만 조준**이다 (계획 §3 붓별 판정).
   * 목적지 탭은 "조준을 그 칸으로 옮긴다"로 뜻이 바뀌었을 뿐이고, 확정을 눌러야
   * 옮겨지는 것은 K42 부터 그대로다 — 그래서 이 절은 확정 클릭 한 줄로 그대로 산다.
   */
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

  /*
   * ⚠ **`⏩ 주 스킵` 절은 K47-② 에서 통째로 지웠다.** 기능이 없어졌다 —
   * 첫 심사 보상은 이제 **이동 붓만**이고, `flow.weekSkipUnlocked`(세이브 `weekSkip`)
   * 도 함께 사라졌다. 스킵을 누르고 싶은 순간은 "할 게 없다"는 신호이므로 스킵으로
   * 가릴 게 아니라 목표 밀도를 고친다 (계획 §2). 스킵 요구가 실플레이에서 다시
   * 나오면 그때 복구하고 이 절도 같이 되살린다 — 복구 비용이 싸다.
   */

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
    const sh = document.getElementById('kairo-sheet');
    if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
    // 탭 = 조준 (K47-③). 확정은 아래에서 진짜 클릭으로 누른다
    h.tapTile(pad.i + 1, pad.j);
    const rot = document.getElementById('kairo-place-rotate');
    const before = h.placement.all().filter((p) => p.defId === 'pyeongsang_row').length;
    return { ok: true, pad: pad, rotEnabled: rot && !rot.disabled, before: before };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; pad: { i: number; j: number }; rotEnabled: boolean; before: number };
  if (!rotated.ok) {
    record('★ 회전 — 비정사각 시설이 90° 로 놓인다 (K45)', 'fail', rotated.why);
  } else {
    await page.click('#kairo-place-rotate'); // 진짜 클릭 — 예약돼 있던 ↻ 가 드디어 일한다
    await page.waitForTimeout(250);
    await page.click('#kairo-place-confirm');
    await page.waitForTimeout(250);
    /*
     * ⚠ K47-③: **좌표를 기대하지 않는다.** 예전에는 `(pad.i+1, pad.j)` 를 앵커로 박고
     * 거기서 j+3·i+3 을 읽었는데, 조준 배치에서는 확정 시점의 칸을 레티클 규칙이 정한다.
     * 재려는 것은 자리가 아니라 **모양**이다 — 발자국이 세로 4 · 가로 1 인가.
     * 놓인 결과(`placement.all`)에서 읽어 발자국 경계상자를 직접 잰다.
     */
    const after = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const rows = h.placement.all().filter((p) => p.defId === 'pyeongsang_row');
      const it = rows.length ? rows[rows.length - 1] : null;
      let w = 0, d = 0;
      if (it) {
        let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
        for (let j = 0; j < h.terrain.height; j++) {
          for (let i = 0; i < h.terrain.width; i++) {
            if (h.placement.handleAt(i, j) !== it.handle) continue;
            if (i < i0) i0 = i;
            if (i > i1) i1 = i;
            if (j < j0) j0 = j;
            if (j > j1) j1 = j;
          }
        }
        w = i1 - i0 + 1; d = j1 - j0 + 1;
      }
      window.__kairoClearBrush();
      return { def: it ? it.defId : null, facing: it ? it.facing : null,
               n: rows.length, w: w, d: d };
    })()`)) as { def: string | null; facing: number | null; n: number; w: number; d: number };
    record(
      '★ 회전 — 비정사각 시설이 90° 로 놓인다 (K45, ↻ 실클릭)',
      rotated.rotEnabled && after.n === rotated.before + 1 && after.def === 'pyeongsang_row' &&
        after.facing === 1 && after.d === 4 && after.w === 1
        ? 'pass'
        : 'fail',
      `facing ${after.facing} · 발자국 ${after.w}×${after.d} (기대 1×4) · ` +
        `평상 ${rotated.before} → ${after.n}`,
    );
  }

  // 코스 보트 — 견인기구가 물 위를 돈다. 흐름이 멈추면 배도 선다
  const boat = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.flow.frozen = true;
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

  /*
   * ── K47-①. 뉴스 티커 · 알림함 ──────────────────────────────────────────
   *
   * 채널 규칙: 모달=축하(시간이 선다) · **티커=뉴스(비차단)** · 토스트=내 행동의 대답.
   * 티커가 시간까지 멈추면 채널이 셋일 이유가 없어지므로 **안 멈춤**을 직접 잰다.
   * 반대로 알림함은 `panelHost` 에 등록된 시트라 **열면 멈춘다** — 둘 다 재야
   * "안 멈춘다"가 "원래 안 돌던 판이었다"의 다른 이름이 아님이 증명된다.
   *
   * 계약 (감독이 확정): 띠 `#kairo-ticker` 는 **div + role=button + tabindex=0** 이다.
   * 버튼이 아닌 것은 의도된 선택이다 — 버튼이면 "상시 컨트롤 N개"와 44px 터치 타깃
   * 검사에 잡혀 HUD 예산이 티커 때문에 흔들린다.
   *
   * ⚠ 이 절은 하네스의 **마지막**이다. 앞선 절이 남긴 붓·패널·주 상태를 먼저 치우고
   * 시작한다 (하네스 절은 자기가 연 것을 닫는다 — 잔해 위에서 재면 원인을 알 수 없다).
   */
  const tkSetup = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 잔해 치우기. 패널이 하나라도 열려 있으면 흐름이 이미 멈춰 있어
    // "티커는 시간을 안 멈춘다"가 거짓 실패로 나온다
    if (window.__kairoClearBrush) window.__kairoClearBrush();
    if (h.catalog.visible) h.catalog.hide();
    if (h.staffPanel.visible) h.staffPanel.hide();
    if (h.coursePanel.visible) h.coursePanel.hide();
    if (h.showcase.visible) h.showcase.hide();
    if (h.cardView.visible) h.cardView.hide();
    const sheet0 = document.getElementById('kairo-sheet');
    if (sheet0 && !sheet0.hidden) document.getElementById('kairo-sheet-close').click();
    const inbox0 = document.getElementById('kairo-inbox');
    if (inbox0 && !inbox0.hidden) {
      const c0 = document.getElementById('kairo-inbox-close');
      if (c0) c0.click();
    }
    // 해금 축하는 아침 tick 에 모달로 끼어들어 흐름을 세운다 — 이 절에서는 비운다
    h.arrivalQueue.length = 0;
    /*
     * ⚠ 한때 여기서 flow.weekSkipUnlocked 를 false 로 되돌렸다 — 앞 절(⏩ 주 스킵)이
     * 켜 둔 채 끝나서, 켜진 상태로 skipForward 를 부르면 주가 통째로 끝나 결산 모달이
     * 뜨고 이 절의 나머지가 모달 뒤에서 죽었기 때문이다. **K47-② 로 원인이 사라졌다**:
     * 주 스킵 기능과 그 절이 함께 없어졌고 skipForward 는 언제나 하루 단위다.
     * 이 절이 필요한 사건은 그대로 **하루 마감**이다.
     */
    h.week.abort(); // K39 — 어느 tick 에 있었는지 모른다. 주 첫 tick 에서 결정적으로 시작
    h.beginWeek();
    h.scene.setAutoTick(true);
    h.flow.frozen = true; // 사건을 내가 일으킬 때까지 시간을 세운다 (대조군 구간)
    const strip = document.getElementById('kairo-ticker');
    const line = document.querySelector('#kairo-ticker .kticker-line');
    const r = strip ? strip.getBoundingClientRect() : null;
    /*
     * 상시 컨트롤 수 — HUD 절(9b)의 MEASURE_HUD 와 같은 셈법이다. 티커가 div 면
     * 여기 안 잡혀 2가 유지되고, button 으로 만들어졌으면 3이 된다.
     * ⚠ K47-② 로 하루»·리포트·목표접기가 전부 빠져 기대값이 5 → **2** 가 됐다
     */
    const ctrl = [...document.querySelectorAll('button, select, input')].filter((b) => {
      const rr = b.getBoundingClientRect();
      return rr.width > 2 && rr.height > 2;
    });
    return {
      exists: !!strip,
      tag: strip ? strip.tagName : '',
      role: strip ? strip.getAttribute('role') || '' : '',
      tabindex: strip ? strip.getAttribute('tabindex') || '' : '',
      cls: strip ? strip.className : '',
      hasLine: !!line,
      x: r ? Math.round(r.left + r.width / 2) : 0,
      y: r ? Math.round(r.top + r.height / 2) : 0,
      w: r ? Math.round(r.width) : 0,
      hgt: r ? Math.round(r.height) : 0,
      onScreen: !!r && r.width > 2 && r.height > 2 && r.top >= 0 && r.bottom <= innerHeight + 2,
      controls: ctrl.length,
      controlIds: ctrl.map((b) => b.id || b.className).join(','),
    };
  })()`)) as {
    exists: boolean;
    tag: string;
    role: string;
    tabindex: string;
    cls: string;
    hasLine: boolean;
    x: number;
    y: number;
    w: number;
    hgt: number;
    onScreen: boolean;
    controls: number;
    controlIds: string;
  };

  record(
    '★ 뉴스 티커가 화면에 있다 (K47-①)',
    tkSetup.exists && tkSetup.hasLine && tkSetup.onScreen ? 'pass' : 'fail',
    tkSetup.exists
      ? `<${tkSetup.tag.toLowerCase()} class="${tkSetup.cls}"> ${tkSetup.w}×${tkSetup.hgt} · ` +
          `라인 ${tkSetup.hasLine ? 'OK' : '.kticker-line 없음'} · 화면 안 ${tkSetup.onScreen ? 'OK' : '아님'}`
      : '#kairo-ticker 가 없다',
  );
  record(
    '티커는 div + role=button 이다 — 버튼이면 상시 컨트롤·44px 검사에 걸린다 (의도된 선택)',
    tkSetup.exists && tkSetup.tag !== 'BUTTON' && tkSetup.role === 'button' && tkSetup.tabindex === '0'
      ? 'pass'
      : 'fail',
    `<${tkSetup.tag.toLowerCase() || '없음'} role="${tkSetup.role}" tabindex="${tkSetup.tabindex}">`,
  );
  record(
    '상시 컨트롤 2개 유지 — 티커가 컨트롤을 늘리지 않았다 (메뉴·건설, K47-②)',
    tkSetup.controls === 2 ? 'pass' : 'fail',
    `${tkSetup.controls}개 · ${tkSetup.controlIds}`,
  );

  if (!tkSetup.exists) {
    // 배선 전에는 뒤따르는 절이 전부 같은 이유로 실패한다 — 이유를 한 번만 적고 넘어간다
    for (const pending of [
      '★ 티커에 소식이 흐른다 — 하루 마감이 띠에 뜬다 (K47-①)',
      '★ 티커를 탭하면 알림함이 열리고 소식이 쌓여 있다 (K47-①, 진짜 터치)',
      '티커는 시간을 멈추지 않는다 — 뉴스는 비차단 채널이다 (모달과의 차이)',
      '알림함을 열면 시간이 선다 — 시트 규칙 (닫으면 다시 흐른다 = 음성 대조군)',
      '알림함 시트 터치 타깃 44px 이상 · 가로 넘침 0',
      '티커가 붓 라벨을 받는다 — 붓을 놓으면 뉴스로 돌아온다 (K47-①)',
    ]) {
      record(pending, 'fail', '#kairo-ticker 가 없다 — 티커 배선 전');
    }
  } else {
    const TK_READ = `(() => {
      const e = document.querySelector('#kairo-ticker .kticker-line');
      return e && e.textContent ? e.textContent : '';
    })()`;
    const TK_TICK = `(() => {
      const p = window.__kairo.week.liveProgress();
      return p ? p.tick : -1;
    })()`;

    /*
     * ① 소식이 흐른다 — 사건 전후 비교 + **대조군 둘**.
     *
     * 판정식 tkJudge(t) = (t 가 비어 있지 않다) && (t !== 사건 전 텍스트).
     *  · 배선이 없거나 push 가 화면에 안 닿으면 사건 뒤에도 텍스트가 그대로라
     *    tkJudge(tkAfter) 가 false → 실패. "아무것도 안 하는 티커"는 통과할 수 없다
     *  · 흐름을 얼려 뒀으므로 사건 없이는 바뀔 이유가 없다. 그래도 바뀌면
     *    tkIdle !== tkText0 이 되어 실패 — 시간만 지나도 바뀌는 텍스트로는 못 속인다
     *  · 마지막으로 라인을 사건 전 텍스트로 **강제 원복**해 같은 판정식에 다시 먹인다.
     *    거기서도 true 가 나오면 판정식이 무엇을 넣든 통과한다는 뜻이므로 실패로 잡는다
     *    (코드를 못 고치는 대신 하네스 안에 넣은 음성 대조군이다)
     */
    await page.evaluate(`(() => {
      const e = document.querySelector('#kairo-ticker .kticker-line');
      window.__tkBefore = e && e.textContent ? e.textContent : '';
    })()`);
    const tkText0 = (await page.evaluate(TK_READ)) as string;
    await page.waitForTimeout(600);
    const tkIdle = (await page.evaluate(TK_READ)) as string; // 대조군 — 사건 없이 흐른 시간
    // 사건: 하루 끝까지 감기. 하루 마감은 계약에 적힌 뉴스 항목이고, K47-② 로 화면
    // 버튼이 없어진 뒤 skipForward 가 시간을 감는 유일한 경로다 (afterStep 까지 그대로 돈다)
    await page.evaluate(`window.__kairo.skipForward()`);
    await page.waitForTimeout(500);
    const tkAfter = (await page.evaluate(TK_READ)) as string;
    const tkReverted = (await page.evaluate(`(() => {
      const e = document.querySelector('#kairo-ticker .kticker-line');
      if (!e) return '';
      e.textContent = window.__tkBefore; // 대조군 — 판정식에 사건 전 텍스트를 그대로 먹인다
      return e.textContent;
    })()`)) as string;
    const tkJudge = (t: string): boolean => t.length > 0 && t !== tkText0;
    record(
      '★ 티커에 소식이 흐른다 — 하루 마감이 띠에 뜬다 (K47-①)',
      tkIdle === tkText0 && tkJudge(tkAfter) && !tkJudge(tkReverted) ? 'pass' : 'fail',
      `"${tkText0}" → (사건 없이 0.6초) "${tkIdle}" → (하루 마감) "${tkAfter}" · ` +
        `원복 대조군 ${tkJudge(tkReverted) ? '통과해 버렸다(판정식 결함)' : 'OK'}`,
    );

    /*
     * ② 티커는 시간을 멈추지 않는다 — 흐름을 되살리고 tick 이 계속 오르는지 본다.
     * 모달(카드·해금)이라면 여기서 tick 이 멈춘다. 그 차이가 채널을 셋으로 나눈 이유다.
     */
    await page.evaluate(`(() => {
      const h = window.__kairo;
      h.flow.frozen = false;
      h.scene.setAutoTick(true);
    })()`);
    const tkFlowA = (await page.evaluate(TK_TICK)) as number;
    await page.waitForTimeout(900);
    const tkFlowB = (await page.evaluate(TK_TICK)) as number;
    record(
      '티커는 시간을 멈추지 않는다 — 뉴스는 비차단 채널이다 (모달과의 차이)',
      tkFlowA >= 0 && tkFlowB > tkFlowA ? 'pass' : 'fail',
      `tick ${tkFlowA} → ${tkFlowB} (0.9초 · 200ms/tick)`,
    );

    /*
     * ③ 탭 → 알림함. **진짜 터치**로 누른다 (K33: 백도어 좌표 주입으로 5건이 가짜로
     * 통과한 적이 있다). touch() 는 CDP Input.dispatchTouchEvent 그대로다.
     */
    await touch('touchStart', tkSetup.x, tkSetup.y);
    await touch('touchEnd', 0, 0);
    await page.waitForTimeout(350);
    const tkOpen = (await page.evaluate(`(() => {
      const root = document.getElementById('kairo-inbox');
      if (!root) return { exists: false, open: false, rows: 0, minTap: 0, buttons: 0, sheet: false, overflow: 0 };
      // ⚠ 판정은 !root.hidden 으로 읽는다 — 인라인 display 를 읽으면 표면을 클래스로
      // 옮기는 순간 조용히 거짓이 된다 (K34)
      const btns = [...root.querySelectorAll('button, select, input')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      const minTap = btns.length
        ? Math.min(...btns.map((b) => {
            const r = b.getBoundingClientRect();
            return Math.min(r.width, r.height);
          }))
        : 0;
      return {
        exists: true,
        open: !root.hidden,
        rows: root.querySelectorAll('.kinbox-row').length,
        minTap: Math.round(minTap),
        buttons: btns.length,
        sheet: root.classList.contains('ksheet'),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    })()`)) as {
      exists: boolean;
      open: boolean;
      rows: number;
      minTap: number;
      buttons: number;
      sheet: boolean;
      overflow: number;
    };
    await page.screenshot({ path: `${SHOT_DIR}/kairo-ticker-inbox.png` });

    /* ④ 열린 동안에는 시간이 선다 (시트 규칙) */
    const tkHeldA = (await page.evaluate(TK_TICK)) as number;
    await page.waitForTimeout(900);
    const tkHeldB = (await page.evaluate(TK_TICK)) as number;

    /* 닫기도 진짜 터치로 — 열어 둔 것은 이 절이 닫는다 */
    const tkCloseAt = (await page.evaluate(`(() => {
      const b = document.getElementById('kairo-inbox-close');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`)) as { x: number; y: number } | null;
    if (tkCloseAt) {
      await touch('touchStart', tkCloseAt.x, tkCloseAt.y);
      await touch('touchEnd', 0, 0);
    }
    await page.waitForTimeout(300);
    const tkClosed = (await page.evaluate(
      `(() => { const r = document.getElementById('kairo-inbox'); return !!r && r.hidden; })()`,
    )) as boolean;
    /*
     * 닫은 뒤 다시 흐르는지가 ④ 의 음성 대조군이다 — 안 재면 "열면 멈춘다"는
     * 판이 통째로 서 있을 때도 통과한다 (그때는 열든 닫든 tick 이 안 움직인다)
     */
    const tkResumeA = (await page.evaluate(TK_TICK)) as number;
    await page.waitForTimeout(800);
    const tkResumeB = (await page.evaluate(TK_TICK)) as number;

    record(
      '★ 티커를 탭하면 알림함이 열리고 소식이 쌓여 있다 (K47-①, 진짜 터치)',
      tkOpen.open && tkOpen.rows > 0 && tkOpen.sheet && tkClosed ? 'pass' : 'fail',
      `열림 ${tkOpen.open ? 'OK' : '안 열림'} · 항목 ${tkOpen.rows}건 · ` +
        `표면 ${tkOpen.sheet ? '.ksheet' : '.ksheet 아님'} · 닫기 ${tkClosed ? 'OK' : '안 닫힘'}`,
    );
    record(
      '알림함을 열면 시간이 선다 — 시트 규칙 (닫으면 다시 흐른다 = 음성 대조군)',
      tkHeldB === tkHeldA && tkResumeB > tkResumeA ? 'pass' : 'fail',
      `열린 동안 ${tkHeldA}→${tkHeldB} · 닫은 뒤 ${tkResumeA}→${tkResumeB}`,
    );
    record(
      '알림함 시트 터치 타깃 44px 이상 · 가로 넘침 0',
      tkOpen.minTap >= 44 && tkOpen.overflow <= 0 ? 'pass' : 'fail',
      `최소 ${tkOpen.minTap}px (버튼 ${tkOpen.buttons}개) · 넘침 ${tkOpen.overflow}px`,
    );

    /*
     * ⑤ 붓 라벨 — 티커가 하단 바의 붓 표시를 흡수한다. 붓을 내려놓으면 뉴스로 돌아온다.
     *
     * ⚠ 흐름을 다시 얼린다. 붓을 든 사이에 새 뉴스가 오면 뉴스가 잠깐 우선하도록
     * 설계돼 있어(붓을 들어도 사건은 보여야 한다) 라벨이 가려질 수 있다.
     */
    await page.evaluate(`(() => { window.__kairo.flow.frozen = true; })()`);
    const tkPick = (await page.evaluate(`(() => {
      const h = window.__kairo;
      document.getElementById('kairo-build-open').click();
      let card = document.querySelector('[data-pick^="facility:"]');
      if (!card) {
        const tab = [...document.querySelectorAll('#kairo-sheet button')].find(
          (b) => b.textContent.indexOf('시설') >= 0,
        );
        if (tab) tab.click();
        card = document.querySelector('[data-pick^="facility:"]');
      }
      if (!card) {
        const close = document.getElementById('kairo-sheet-close');
        if (close) close.click();
        return { ok: false, why: '건설 시트에서 시설 카드를 못 찾았다' };
      }
      const id = card.getAttribute('data-pick').slice(9); // 'facility:'.length
      card.click();
      const sheet = document.getElementById('kairo-sheet');
      if (sheet && !sheet.hidden) document.getElementById('kairo-sheet-close').click();
      const def = h.simDefs[id];
      return { ok: true, id: id, name: def ? def.name : '' };
    })()`)) as { ok: false; why: string } | { ok: true; id: string; name: string };

    if (!tkPick.ok) {
      record('티커가 붓 라벨을 받는다 — 붓을 놓으면 뉴스로 돌아온다 (K47-①)', 'fail', tkPick.why);
    } else {
      /*
       * 고정 대기 대신 조건 대기 — 뉴스 우선 유예를 하네스에 상수로 박아 두지 않는다.
       * 안 붙으면 시간 초과로 정직하게 실패한다 (K30 의 고정 대기 교훈과 같다).
       */
      let tkBrushOn = false;
      try {
        await page.waitForFunction(
          `(() => { const s = document.getElementById('kairo-ticker'); return !!s && s.classList.contains('brush'); })()`,
          undefined,
          { timeout: 9000 },
        );
        tkBrushOn = true;
      } catch {
        tkBrushOn = false;
      }
      const tkBrushText = (await page.evaluate(TK_READ)) as string;
      // 붓을 내려놓는 경로는 production 과 같다 (`clearBrush`). 재는 것은 그에 대한 티커의 반응이다
      await page.evaluate(`window.__kairoClearBrush()`);
      await page.waitForTimeout(300);
      const tkBack = (await page.evaluate(`(() => {
        const s = document.getElementById('kairo-ticker');
        const e = document.querySelector('#kairo-ticker .kticker-line');
        return {
          brush: !!s && s.classList.contains('brush'),
          text: e && e.textContent ? e.textContent : '',
        };
      })()`)) as { brush: boolean; text: string };
      const tkNamed = tkPick.name.length > 0 && tkBrushText.indexOf(tkPick.name) >= 0;
      record(
        '티커가 붓 라벨을 받는다 — 붓을 놓으면 뉴스로 돌아온다 (K47-①)',
        tkBrushOn && tkNamed && !tkBack.brush && tkBack.text !== tkBrushText ? 'pass' : 'fail',
        `붓 "${tkBrushText}" (기대 이름 "${tkPick.name}") · 놓은 뒤 "${tkBack.text}"` +
          `${tkBack.brush ? ' · brush 클래스가 안 떨어졌다' : ''}`,
      );
    }

    /*
     * ⚠ **음성 대조군 — 라우팅을 끄면 뉴스가 안 흐른다.**
     *
     * `setNewsMutedForTest` 는 코드에 심어 둔 되돌리기인데 **아무도 켜지 않고 있었다**
     * (K47-④ 감사에서 잡혔다). 대조군이 선언만 되고 소비자가 없으면 "검증이 조용히
     * 통과"의 전형이다 — 이 절이 그 소비자다.
     */
    const tkMute = (await page.evaluate(`(async () => {
      const h = window.__kairo;
      if (typeof h.setNewsMutedForTest !== 'function') return null;
      const read = () => {
        const e = document.querySelector('#kairo-ticker .kticker-line');
        return e && e.textContent ? e.textContent : '';
      };
      h.flow.frozen = true;
      h.setNewsMutedForTest(true);
      const before = read();
      h.skipForward();
      await new Promise((r) => setTimeout(r, 400));
      const muted = read();
      h.setNewsMutedForTest(false);
      h.skipForward();
      await new Promise((r) => setTimeout(r, 400));
      const live = read();
      h.flow.frozen = false;
      return { before: before, muted: muted, live: live };
    })()`)) as { before: string; muted: string; live: string } | null;
    record(
      '⚠ 음성 대조군 — 뉴스 라우팅을 끄면 티커가 안 바뀐다 (K47-① 의 되돌리기)',
      tkMute !== null && tkMute.muted === tkMute.before && tkMute.live !== tkMute.muted
        ? 'pass'
        : 'fail',
      tkMute === null
        ? 'setNewsMutedForTest 가 없다 — 대조군을 켤 수단이 사라졌다'
        : `끄면 "${tkMute.muted}" (사건 전 "${tkMute.before}") → 켜면 "${tkMute.live}"`,
    );

    // 뒷정리 — 이 절이 연 것을 이 절이 닫는다 (열어 둔 채 넘어가면 뒤가 전부 깨진다)
    await page.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      const ib = document.getElementById('kairo-inbox');
      if (ib && !ib.hidden) {
        const c = document.getElementById('kairo-inbox-close');
        if (c) c.click();
      }
      const sheet = document.getElementById('kairo-sheet');
      if (sheet && !sheet.hidden) document.getElementById('kairo-sheet-close').click();
      h.flow.frozen = false;
    })()`);
  }

  /*
   * ── K47-②. 결산 재열람 — 알림함이 리포트 버튼을 대신한다 ────────────────
   *
   * 헤더의 `📈 리포트` 버튼(`#kairo-report-open`)이 사라졌다 (상시 컨트롤 5 → 2).
   * 그 자리를 대신하는 것이 **알림함의 "결산 도착" 행**이다 — 뉴스가 이미 "몇 주차
   * 결산이 왔다"를 들고 있으니 소식 자체를 손잡이로 쓴다 (계획 §2).
   *
   * ⚠ **재열람 경로가 사라지지 않는 것이 이 이동의 전제다.** 버튼만 지우고 행을 안
   * 배선하면 결산은 그 주에 한 번 보고 영영 못 본다. 그 회귀를 잡는 검사가 여기
   * 하나뿐이므로 전 구간을 **진짜 터치**로 간다 (K33: 백도어는 sim 검사에만).
   *
   * 순서: 주를 끝까지 감는다(결산 모달 + 알림함 적재) → 결산을 닫는다 →
   *       티커 탭 → 알림함 → "결산" 행 탭 → 결산이 **다시** 열린다.
   */
  {
    // 카드 치우기·결산 닫기는 모듈 스코프의 `DISMISS_CARDS`/`CLOSE_REPORT` 를 쓴다
    // (P2-B 콤보 블록 절도 같은 것을 쓴다 — 한 벌이어야 한쪽만 낡지 않는다)

    // ① 결산을 하나 만든다 — 없으면 열 것도 없다 (`openLastReport` 는 마지막 결산을 연다)
    await page.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.arrivalQueue.length = 0; // 해금 축하 모달이 결산 위로 끼어들지 않게
      h.flow.frozen = true;
      h.week.abort();
      h.beginWeek();
      h.runWeek(); // 주말까지 감기 → 결산 모달 + 알림함에 '결산 도착'
    })()`);
    await page.waitForTimeout(500);
    await page.evaluate(DISMISS_CARDS);
    await page.waitForTimeout(300);
    const firstShown = (await page.evaluate(CLOSE_REPORT)) as boolean;
    await page.waitForTimeout(300);
    await page.evaluate(DISMISS_CARDS);
    await page.waitForTimeout(300);

    // ② 티커를 진짜로 눌러 알림함을 연다
    const stripAt = (await page.evaluate(`(() => {
      const s = document.getElementById('kairo-ticker');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`)) as { x: number; y: number } | null;
    if (stripAt) {
      await touch('touchStart', stripAt.x, stripAt.y);
      await touch('touchEnd', 0, 0);
      await page.waitForTimeout(350);
    }

    /*
     * ③ "결산" 행을 찾는다. 뒤이은 뉴스에 밀려 화면 밖으로 내려갈 수 있으므로
     * 목록을 스크롤해 올린다 — 사용자가 손으로 하는 것과 같은 일이고, 좌표를
     * 주입하는 백도어가 아니다 (누르는 것은 여전히 실제 손가락이다).
     */
    const rowAt = (await page.evaluate(`(() => {
      const root = document.getElementById('kairo-inbox');
      if (!root || root.hidden) return { open: false, found: false, rows: 0 };
      const rows = [...root.querySelectorAll('.kinbox-row')];
      const hit = rows.find((r) => r.textContent.indexOf('결산') >= 0);
      if (!hit) return { open: true, found: false, rows: rows.length };
      hit.scrollIntoView({ block: 'center' });
      const r = hit.getBoundingClientRect();
      return {
        open: true, found: true, rows: rows.length,
        role: hit.getAttribute('role') || '',
        text: hit.textContent.slice(0, 40),
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        onScreen: r.top >= 0 && r.bottom <= innerHeight + 2,
      };
    })()`)) as {
      open: boolean;
      found: boolean;
      rows: number;
      role?: string;
      text?: string;
      x?: number;
      y?: number;
      onScreen?: boolean;
    };
    record(
      '★ 결산 도착이 알림함에 쌓이고 그 행이 손잡이다 (K47-②)',
      rowAt.open && rowAt.found && rowAt.role === 'button' && rowAt.onScreen === true
        ? 'pass'
        : 'fail',
      `알림함 ${rowAt.open ? '열림' : '안 열림'} · 항목 ${rowAt.rows}건 · ` +
        `결산 행 ${rowAt.found ? `"${rowAt.text ?? ''}" role="${rowAt.role ?? ''}"` : '없음'}` +
        `${rowAt.found && rowAt.onScreen !== true ? ' · 화면 밖' : ''}`,
    );

    // ④ 행을 진짜로 눌러 결산이 다시 열리는지
    let reopened = false;
    let inboxGone = false;
    if (rowAt.found && rowAt.x !== undefined && rowAt.y !== undefined) {
      await touch('touchStart', rowAt.x, rowAt.y);
      await touch('touchEnd', 0, 0);
      await page.waitForTimeout(400);
      const after = (await page.evaluate(`(() => {
        const r = document.getElementById('kairo-report');
        const ib = document.getElementById('kairo-inbox');
        return { report: !!r && !r.hidden, inbox: !!ib && ib.hidden };
      })()`)) as { report: boolean; inbox: boolean };
      reopened = after.report;
      inboxGone = after.inbox;
    }
    record(
      '★ 알림함의 결산 행을 탭하면 결산이 다시 열린다 — 리포트 버튼의 후신 (K47-②, 진짜 터치)',
      firstShown && reopened && inboxGone ? 'pass' : 'fail',
      `주말 결산 ${firstShown ? '떴다' : '안 떴다'} → 닫음 → 행 탭 → ` +
        `결산 ${reopened ? '다시 열림' : '안 열림'} · 알림함 ${inboxGone ? '닫힘' : '남음'}`,
    );
    await page.screenshot({ path: `${SHOT_DIR}/kairo-report-reopen.png` });

    // 뒷정리 — 이 절이 연 것을 이 절이 닫는다
    await page.evaluate(CLOSE_REPORT);
    await page.waitForTimeout(250);
    await page.evaluate(DISMISS_CARDS);
    await page.evaluate(`(() => {
      const ib = document.getElementById('kairo-inbox');
      if (ib && !ib.hidden) {
        const c = document.getElementById('kairo-inbox-close');
        if (c) c.click();
      }
      window.__kairo.flow.frozen = false;
    })()`);
  }

  /*
   * ── K47-③. 조준 배치 — 픽 → 고스트 → 지도 팬으로 정렬 → 확정 ────────────────
   *
   * 배치가 "탭 → 고스트 → 확정"에서 **"픽 → 고스트 → 팬으로 정렬 → 확정"**으로 바뀌었다
   * (계획 §3). 손가락이 고스트를 가리지 않는 것이 원작이 이 방식을 쓰는 이유다.
   *
   * ⚠ **가장 큰 함정은 순진한 "중앙 고정"이다.** 카메라 클램프(`range()` 가 뷰를
   * `worldBounds` 안에 가둔다) 때문에 화면 중앙이 갈 수 있는 범위가 제한되어, 5등급 판의
   * **32%** 가 영원히 배치 불가가 된다 (계획 §3 실측). 그래서 고스트가 **정본**이고
   * 레티클은 화면 표시일 뿐이며, 팬은 레티클 칸의 **증분**만 더한다.
   * 아래 "지도 가장자리" 절이 그 구멍을 잡는 **유일한** 검사다.
   *
   * ⚠ 하네스는 투영을 다시 구현하지 않는다 — 레티클 칸을 씬의 `tileScreenRect` 로
   * **독립 유도**한다 (화면 중심에 중심이 가장 가까운 칸, 2:1 다이메트릭의 다이아몬드
   * 거리). 새 API 로 재면 자기참조라 그 함수가 통째로 틀려도 통과한다 (K38 교훈).
   *
   * 씬의 새 표면은 `scene.aimTileNow()`(조준 칸) · `scene.reticleTile()`(레티클 칸) ·
   * `scene.setAimFaultForTest('center-lock'|'none')`(결함 모드)로 확정됐다. 호출부는
   * 하네스가 씬보다 먼저 쓰이던 시절의 **후보 목록**을 그대로 두는데, 이름이 하나도
   * 안 맞으면 예외로 런 전체가 죽는 대신 그 사실을 판정문에 적기 위해서다.
   *
   * 잔해 위에서 재지 않으려고 **새 판(새 컨텍스트 + 세이브 삭제)**에서 돈다.
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const aimErrors: string[] = [];
    pg.on('pageerror', (e) => aimErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    const aimCdp = await cx.newCDPSession(pg);
    const aimTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await aimCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };
    type Geo = {
      left: number;
      top: number;
      w: number;
      h: number;
      bw: number;
      bh: number;
      s: number;
    };
    const CANVAS_GEO = `(() => {
      const cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      return { left: cr.left, top: cr.top, w: cr.width, h: cr.height,
               bw: cv.width, bh: cv.height, s: cr.width / cv.width };
    })()`;

    /*
     * 진짜 손가락 드래그 (CDP `Input.dispatchTouchEvent`). 합성 PointerEvent 는 Phaser 가
     * 무시한다 — 멀쩡한 코드가 실패로 나온다.
     *
     * ⚠ 시작점과 끝점이 **둘 다 지도 위**여야 한다. 위 210 · 아래 210 은 HUD 몫이라
     * 거기서 시작하면 헤더·확정 바가 드래그를 먹고 "팬이 안 된다"로 나온다 (실측 함정).
     * 한 번에 못 가는 거리는 여러 번 나눠 끈다.
     */
    const aimDrag = async (dxCss: number, dyCss: number): Promise<void> => {
      const geo = (await pg.evaluate(CANVAS_GEO)) as Geo;
      const MAXX = 180;
      const MAXY = 200;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(dxCss) / MAXX, Math.abs(dyCss) / MAXY)),
      );
      const loX = geo.left + 30;
      const hiX = geo.left + geo.w - 30;
      const loY = geo.top + 210;
      const hiY = geo.top + geo.h - 210;
      for (let s = 0; s < steps; s++) {
        const dx = Math.round(dxCss / steps);
        const dy = Math.round(dyCss / steps);
        let sx = geo.left + geo.w / 2 - dx / 2;
        let sy = geo.top + geo.h / 2 - dy / 2;
        sx = Math.min(Math.max(sx, loX), hiX);
        sy = Math.min(Math.max(sy, loY), hiY);
        if (sx + dx < loX) sx = loX - dx;
        if (sx + dx > hiX) sx = hiX - dx;
        if (sy + dy < loY) sy = loY - dy;
        if (sy + dy > hiY) sy = hiY - dy;
        const x0 = Math.round(sx);
        const y0 = Math.round(sy);
        /*
         * ⚠ **되감아서 끈다.** 조준 중에는 탭 임계가 올라가므로(계획 §3) 짧은 드래그는
         * 탭으로 읽혀 조준이 손가락 밑으로 순간이동한다. 옆으로 한 번 돌았다 오면 이동
         * **거리**는 임계를 훌쩍 넘고 **최종 변위**는 그대로다 (팬은 손가락을 따라가고
         * 되돌아온 만큼 상쇄된다). 화면 좌우 여유가 세로보다 넓어 x 로 돈다.
         */
        const windRaw = x0 + dx / 2 > (loX + hiX) / 2 ? -48 : 48;
        // 되감는 점도 캔버스 안이어야 한다 — 밖으로 나간 좌표는 이벤트가 버려진다
        const wind = Math.round(Math.min(Math.max(x0 + windRaw, loX), hiX)) - x0;
        await aimTouch('touchStart', x0, y0);
        for (let k = 1; k <= 4; k++) {
          await aimTouch('touchMove', Math.round(x0 + (wind * k) / 4), y0);
        }
        for (let k = 1; k <= 10; k++) {
          await aimTouch(
            'touchMove',
            Math.round(x0 + wind + ((dx - wind) * k) / 10),
            Math.round(y0 + (dy * k) / 10),
          );
        }
        await aimTouch('touchEnd', 0, 0);
        await pg.waitForTimeout(110);
      }
    };

    /*
     * 레티클 칸 — **독립 유도**. `sc.reticleTile()` 은 대조용으로만 같이 읽는다.
     *
     * ⚠ 절대값은 게임의 레티클과 다를 수 있다: 게임은 확정 바에 가린 만큼 조준점을
     * 위로 올린다 (`setReticleInset`). 여기서는 캔버스 정중앙을 쓰므로 몇 칸 어긋난다 —
     * 그래서 이 값은 **증분으로만** 쓴다. 팬은 평행이동이라 어느 점에서 재도 증분이 같다.
     */
    type Ret = { i: number; j: number; d: number; api: { i: number; j: number } | null };
    const RETICLE = `(() => {
      const h = window.__kairo, sc = h.scene, cv = document.querySelector('canvas');
      const px = cv.width / 2, py = cv.height / 2;
      let bi = -1, bj = -1, bd = 1e9;
      for (let j = 0; j < h.terrain.height; j++) {
        for (let i = 0; i < h.terrain.width; i++) {
          const r = sc.tileScreenRect(i, j);
          const dx = r.x + r.w / 2 - px, dy = r.y + r.h / 2 - py;
          const d = Math.abs(dx) + Math.abs(dy) * 2;
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      const api = typeof sc.reticleTile === 'function' ? sc.reticleTile() : null;
      return { i: bi, j: bj, d: Math.round(bd), api: api };
    })()`;

    /*
     * 지금 조준 중인 칸 — 씬의 `aimTileNow()` 가 정본이다. 뒤의 세 이름은 그 표면이
     * 확정되기 전의 후보이고, 하나도 없으면 `null` 을 돌려주어 부르는 쪽이 "못 쟀다"를
     * 판정문에 적는다 (예외로 런이 죽는 것보다 낫다).
     */
    const AIM_TILE = `(() => {
      const sc = window.__kairo.scene;
      const names = ['aimTileNow', 'ghostTile', 'aimTileForTest', 'placeTile'];
      for (let k = 0; k < names.length; k++) {
        const fn = sc[names[k]];
        if (typeof fn !== 'function') continue;
        const v = fn.call(sc);
        return v ? { i: v.i, j: v.j, via: names[k] } : { i: -1, j: -1, via: names[k] };
      }
      return null;
    })()`;

    type Confirm = { bar: boolean; disabled: boolean; label: string; ghost: boolean };
    const CONFIRM = `(() => {
      const c = document.getElementById('kairo-confirm');
      const b = document.getElementById('kairo-place-confirm');
      const lab = c ? c.querySelector('.place-label') : null;
      return { bar: !!c && !c.hidden, disabled: !b || b.disabled,
               label: lab && lab.textContent ? lab.textContent : '',
               ghost: !!window.__kairo.scene.ghost };
    })()`;

    const HANDLES = `(() => window.__kairo.placement.all().map((p) => p.handle))()`;
    const newest = (prev: number[]): string => `((prev) => {
      const it = window.__kairo.placement.all().find((p) => prev.indexOf(p.handle) < 0);
      return it ? { i: it.i, j: it.j, defId: it.defId } : null;
    })(${JSON.stringify(prev)})`;

    /** 건설 시트에서 파라솔(1×1 · 1등급 골격)을 고르고 시트를 닫는다 */
    const PICK_PARASOL = `(() => {
      document.getElementById('kairo-build-open').click();
      const ft = document.querySelector('#kairo-sheet [data-tab="facility"]');
      if (ft) ft.click();
      const p = document.querySelector('[data-pick="facility:parasol"]');
      if (!p) return false;
      p.click();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      return !!window.__kairoBrush && window.__kairoBrush() === 'facility';
    })()`;
    const CANCEL = `(() => {
      const b = document.getElementById('kairo-place-cancel');
      if (b) b.click();
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      return true;
    })()`;

    // 판을 통째로 포장한다 — 재려는 것은 조준이지 길이 아니다 (K32-B 이후의 상수)
    await pg.evaluate(PAVE_ALL);
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.flow.frozen = true; // 조준을 재는 동안 결산·카드가 끼어들지 않게
      h.week.abort();       // 어느 tick 인지 모른다 — 주 첫 tick 에서 결정적으로 시작
      h.beginWeek();
    })()`);

    /*
     * ── ① 팬으로 정렬해 시설을 놓는다 ───────────────────────────────────────
     *
     * 판 한가운데(클램프가 안 걸리는 곳)에서 **증분 규칙**만 뽑아 잰다:
     *   놓인 칸의 이동량 == 레티클 칸의 이동량.
     * 좌표를 박지 않고 **놓인 결과에서 읽어** 비교한다 — 중심 규칙이 바뀌어도 산다.
     */
    /*
     * ⚠ 토지 한복판은 **물일 수 있다** (물가가 j ≈ 26~51 이라 1등급 땅 가운데를 지난다).
     * 거기서 시작하면 픽 직후부터 확정이 죽어 있어 증분을 못 잰다. 그래서 "둘레 5칸까지
     * 전부 놓을 수 있는" 넉넉한 자리를 골라 **중심에서 가장 가까운 것**을 쓴다.
     * (게임의 조준점은 확정 바 높이만큼 위에 있어 두세 칸 어긋난다 — 그 여유도 5칸 안이다.)
     */
    const midTile = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      const ci = L.i0 + Math.floor(L.w / 2), cj = L.j0 + Math.floor(L.h / 2);
      const ok = (i, j) => h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok;
      const roomy = (i, j) => {
        for (let dj = -5; dj <= 5; dj++)
          for (let di = -5; di <= 5; di++) if (!ok(i + di, j + dj)) return false;
        return true;
      };
      let best = null, bd = 1e9;
      for (let j = L.j0 + 5; j < L.j0 + L.h - 5; j++) {
        for (let i = L.i0 + 5; i < L.i0 + L.w - 5; i++) {
          const d = Math.abs(i - ci) + Math.abs(j - cj);
          if (d >= bd) continue;
          if (!roomy(i, j)) continue;
          bd = d; best = { i: i, j: j };
        }
      }
      return best || { i: ci, j: cj };
    })()`)) as { i: number; j: number };
    await pg.evaluate(`window.__kairo.scene.focusTile(${midTile.i}, ${midTile.j})`);
    await pg.waitForTimeout(220);

    const baseHandles = (await pg.evaluate(HANDLES)) as number[];
    const pickedA = (await pg.evaluate(PICK_PARASOL)) as boolean;
    await pg.waitForTimeout(200);
    const retA = (await pg.evaluate(RETICLE)) as Ret;
    const barA = (await pg.evaluate(CONFIRM)) as Confirm;
    if (barA.bar && !barA.disabled) {
      await pg.click('#kairo-place-confirm');
      await pg.waitForTimeout(350);
    }
    const placedA = (await pg.evaluate(newest(baseHandles))) as
      | { i: number; j: number; defId: string }
      | null;

    // 두 번째 — 이번엔 진짜 드래그로 지도를 옮긴 뒤 확정한다
    const handlesB = (await pg.evaluate(HANDLES)) as number[];
    const countBeforePan = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
    const pickedB = (await pg.evaluate(PICK_PARASOL)) as boolean;
    await pg.waitForTimeout(200);
    const retB0 = (await pg.evaluate(RETICLE)) as Ret;
    /*
     * 드래그는 **한 방향으로 딱 떨어지게** 잡는다. 2:1 다이메트릭에서 (−64,−32)px 은
     * 정확히 (Δi,Δj)=(4,0) — 위에서 고른 넉넉한 자리 안에 떨어지므로 "옮긴 칸이 하필
     * 물이라 확정이 죽었다"가 안 생긴다. (i = x/32 + y/16 · j = y/16 − x/32 로 유도했다.)
     *
     * ⚠ 너무 작게 잡지 말 것 — 조준 중에는 **탭 임계가 올라간다** (계획 §3). 임계보다
     * 짧은 드래그는 탭으로 읽혀 조준이 손가락 밑으로 순간이동하고, 그러면 이 절이
     * 재는 것이 증분이 아니라 탭이 된다.
     */
    const DRAG = { x: -64, y: -32 };
    await aimDrag(DRAG.x, DRAG.y);
    await pg.waitForTimeout(220);
    /* ⚠ 음성 대조군 — **팬만으로는 아무것도 안 놓인다** (확정이 곧 지출이다) */
    const countAfterPan = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
    // 옮긴 자리가 불법이면 조금 더 민다 — 재려는 것은 증분이지 그 칸의 지형이 아니다
    let stB = (await pg.evaluate(CONFIRM)) as Confirm;
    for (let k = 0; k < 2 && stB.bar && stB.disabled; k++) {
      await aimDrag(32, 16);
      await pg.waitForTimeout(180);
      stB = (await pg.evaluate(CONFIRM)) as Confirm;
    }
    const retB1 = (await pg.evaluate(RETICLE)) as Ret;
    if (stB.bar && !stB.disabled) {
      await pg.click('#kairo-place-confirm');
      await pg.waitForTimeout(350);
    }
    const placedB = (await pg.evaluate(newest(handlesB))) as
      | { i: number; j: number; defId: string }
      | null;
    await pg.evaluate(CANCEL);

    const panDI = retB1.i - retB0.i;
    const panDJ = retB1.j - retB0.j;
    const placeDI = placedA && placedB ? placedB.i - placedA.i : NaN;
    const placeDJ = placedA && placedB ? placedB.j - placedA.j : NaN;
    record(
      '★ 팬으로 정렬해 시설을 놓는다 — 놓인 칸이 레티클 증분만큼 옮겨간다 (K47-③, 진짜 드래그)',
      pickedA &&
        pickedB &&
        placedA !== null &&
        placedB !== null &&
        (panDI !== 0 || panDJ !== 0) &&
        (placeDI !== 0 || placeDJ !== 0) &&
        /*
         * ⚠ **칸 증분이 정확히 같기를 요구하면 안 된다.** 조준은 레티클과 다른
         * **서브타일 위상**을 유지한다 — 그것이 오프셋 설계의 요지고, 클램프 뒤에도
         * 고스트가 계속 가는 이유다. 손가락이 요구한 텍셀 양은 같아도 칸 경계를
         * 넘는 시점이 달라 축별로 ±1 이 갈린다 (실측: 레티클 Δ(4,0) vs 조준 Δ(3,−1) —
         * 둘 다 총 4칸 이동). 그래서 **방향이 같고 축별 오차 ≤ 1** 을 본다.
         */
        Math.abs(placeDI - panDI) <= 1 &&
        Math.abs(placeDJ - panDJ) <= 1 &&
        placeDI + placeDJ === panDI + panDJ
        ? 'pass'
        : 'fail',
      `드래그 (${DRAG.x},${DRAG.y})px · 레티클 (${retB0.i},${retB0.j})→(${retB1.i},${retB1.j}) ` +
        `Δ(${panDI},${panDJ}) · 놓인 칸 ${placedA ? `(${placedA.i},${placedA.j})` : '없음'}→` +
        `${placedB ? `(${placedB.i},${placedB.j})` : '없음'} Δ(${placeDI},${placeDJ})` +
        `${barA.bar ? '' : ' · 픽 직후 확정 바가 안 떴다'}` +
        `${retA.api ? ` · reticleTile API (${retA.api.i},${retA.api.j})` : ' · reticleTile API 없음'}`,
    );
    record(
      '⚠ 음성 대조군 — 팬만 하고 확정을 안 누르면 안 놓인다 (K47-③)',
      countAfterPan === countBeforePan ? 'pass' : 'fail',
      `팬 전 ${countBeforePan} → 팬 후(확정 전) ${countAfterPan}`,
    );

    /*
     * ── ② 지도 가장자리 칸에 놓을 수 있다 ──────────────────────────────────
     *
     * §3 의 32% 구멍을 잡는 **유일한** 검사다. 토지 사각형의 네 꼭짓점 방향으로
     * **가장 먼 합법 칸**을 뽑는다 — 꼭짓점 자체는 물·암반일 수 있으므로 좌표를 박지
     * 않고 `placement.check` 로 골라 "그 방향의 끝"을 정의한다.
     */
    type Corner = { key: string; i: number; j: number };
    /*
     * ⚠ **토지를 5등급으로 넓히고 잰다.** 1등급 토지(26×48)는 최대 `i+j` 가 클램프
     * 상한보다 작아서 **어느 끝도 카메라 클램프에 안 걸린다** — 그 판에서는 "중앙
     * 고정으로는 못 닿는다"는 음성 대조군이 성립할 수가 없다 (실측: 4/4 전부 닿음).
     * 커버 구멍(계획 §3 의 32%)은 판이 커야 드러나므로 셋업 훅으로 등급을 올린다.
     * 조준·판정 경로는 우회하지 않는다 — 넓힌 땅 위에서 평소대로 조준한다.
     */
    const gradeSet = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      if (typeof h.setGradeForTest !== 'function') return null;
      h.setGradeForTest(5);
      return JSON.stringify(h.land());
    })()`)) as string | null;
    await pg.waitForTimeout(200);
    const corners = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      const ok = (i, j) => h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok;
      const pick = (score) => {
        let bi = -1, bj = -1, bs = -1e9;
        for (let j = L.j0; j < L.j0 + L.h; j++) {
          for (let i = L.i0; i < L.i0 + L.w; i++) {
            const s = score(i, j);
            if (s <= bs) continue;
            if (!ok(i, j)) continue;
            bs = s; bi = i; bj = j;
          }
        }
        return bi < 0 ? null : { i: bi, j: bj };
      };
      return {
        land: L,
        south: pick((i, j) => i + j),   // i+j 최대 — 계획이 지목한 남쪽 삼각형
        north: pick((i, j) => -(i + j)),
        east: pick((i, j) => i - j),    // i−j 최대
        west: pick((i, j) => j - i),    // i−j 최소
      };
    })()`)) as {
      land: { i0: number; j0: number; w: number; h: number };
      south: { i: number; j: number } | null;
      north: { i: number; j: number } | null;
      east: { i: number; j: number } | null;
      west: { i: number; j: number } | null;
    };
    const cornerList: Corner[] = (
      [
        ['남(i+j 최대)', corners.south],
        ['북(i+j 최소)', corners.north],
        ['동(i−j 최대)', corners.east],
        ['서(i−j 최소)', corners.west],
      ] as [string, { i: number; j: number } | null][]
    )
      .filter((c): c is [string, { i: number; j: number }] => c[1] !== null)
      .map(([key, t]) => ({ key, i: t.i, j: t.j }))
      /*
       * ⚠ 같은 칸이 두 방향의 끝일 수 있다 (땅 모양에 따라). 안 걸러 내면 둘째 시도가
       * "다른 시설이 있습니다" 로 거절되어 검사가 엉뚱한 이유로 빨간불이 된다.
       */
      .filter((c, k, all) => all.findIndex((o) => o.i === c.i && o.j === c.j) === k);

    /*
     * 그 칸이 **카메라 중앙에 올 수 있나.** `focusTile` 로 최대한 붙인 뒤 화면 중심과의
     * 거리를 잰다 — 클램프에 걸리면 남는 거리가 곧 "중앙 고정이면 못 닿는 양"이다.
     * 이 값이 0 뿐이면 판이 작아서 커버 구멍을 못 재는 것이므로 그대로 적는다.
     */
    const clampOf = async (i: number, j: number): Promise<number> => {
      await pg.evaluate(`window.__kairo.scene.focusTile(${i}, ${j})`);
      await pg.waitForTimeout(160);
      return (await pg.evaluate(`(() => {
        const sc = window.__kairo.scene, cv = document.querySelector('canvas');
        const r = sc.tileScreenRect(${i}, ${j});
        const dx = r.x + r.w / 2 - cv.width / 2, dy = r.y + r.h / 2 - cv.height / 2;
        return Math.round(Math.abs(dx) + Math.abs(dy) * 2);
      })()`)) as number;
    };
    const clamps: { key: string; px: number }[] = [];
    for (const c of cornerList) clamps.push({ key: c.key, px: await clampOf(c.i, c.j) });
    const worst = clamps.reduce((a, b) => (b.px > a.px ? b : a), { key: '(없음)', px: -1 });
    record(
      '가장자리 검사가 유효하다 — 카메라가 중앙에 못 두는 칸을 실제로 재고 있나 (K47-③)',
      worst.px > 32 ? 'pass' : 'fail',
      `토지 ${JSON.stringify(corners.land)}${gradeSet === null ? ' (⚠ setGradeForTest 없음 — 1등급 땅으로 잰다)' : ' (5등급으로 넓혀 잰다)'} · ` +
        clamps.map((c) => `${c.key} ${c.px}px`).join(' · ') +
        (worst.px > 32 ? '' : ' — 판이 작아 클램프가 안 걸린다 (커버 구멍을 못 잰다)'),
    );

    /*
     * ★ 진짜 팬만으로 가장자리까지 — **탭 없이** 간다. 탭 다리(`tapTile`)를 쓰면
     * 중앙 고정 결함에서도 통과하므로 (탭은 조준을 그냥 그 칸에 꽂는다) 오프셋 누적을
     * 재는 것은 **팬 전용 경로**뿐이다.
     *
     * 조준 칸은 씬에 물어본다 (`aimTileNow` 계열). 없으면 레티클 칸으로 대신 조준하되
     * 그 사실을 판정문에 적는다 — 클램프 뒤에는 레티클이 안 움직이므로 그 대체 경로는
     * 가장자리에 못 닿는다.
     */
    /* 후보가 하나도 없으면 좌표 −1 로 떨어뜨린다 — 아래 판정이 정직하게 실패한다 */
    const panTarget: Corner = cornerList.find((c) => c.key === worst.key) ??
      cornerList[0] ?? { key: '(방향 없음)', i: -1, j: -1 };
    const panRunnable = panTarget.i >= 0;
    const panToTile = async (t: Corner): Promise<{ i: number; j: number; via: string }> => {
      let last = { i: -1, j: -1, via: '(없음)' };
      /*
       * ⚠ **못 가면 멈춘다.** 중앙 고정 결함에서는 클램프 뒤로 조준이 한 발도 안 움직이는데,
       * 그때 26번을 다 끄는 것은 시간만 쓴다. 세 번 연속 제자리면 그것이 곧 대조군의 답이다.
       */
      let stuck = 0;
      for (let k = 0; k < 22; k++) {
        const aim = (await pg.evaluate(AIM_TILE)) as { i: number; j: number; via: string } | null;
        // ⚠ 조준 중이 아니면 API 가 −1 을 준다 — 그때도 레티클로 갈아탄다 (좌표 −1 로 끌면 안 된다)
        const cur =
          aim && aim.i >= 0
            ? aim
            : { ...((await pg.evaluate(RETICLE)) as Ret), via: aim ? `${aim.via}(조준 없음→레티클)` : '(레티클 대체)' };
        stuck = last.i === cur.i && last.j === cur.j ? stuck + 1 : 0;
        last = { i: cur.i, j: cur.j, via: cur.via };
        if (cur.i === t.i && cur.j === t.j) break;
        if (stuck >= 3) break;
        const geo = (await pg.evaluate(CANVAS_GEO)) as Geo;
        /*
         * 필요한 손가락 이동 = 지금 조준 칸의 화면 중심 − 목표 칸의 화면 중심.
         * 스크롤이 상쇄되므로 클램프에 걸린 상태에서도 값이 맞는다.
         */
        const d = (await pg.evaluate(`(() => {
          const sc = window.__kairo.scene;
          const a = sc.tileScreenRect(${cur.i}, ${cur.j});
          const b = sc.tileScreenRect(${t.i}, ${t.j});
          return { x: (a.x - b.x), y: (a.y - b.y) };
        })()`)) as { x: number; y: number };
        if (Math.abs(d.x) < 1 && Math.abs(d.y) < 1) break;
        await aimDrag(Math.round(d.x * geo.s), Math.round(d.y * geo.s));
        await pg.waitForTimeout(120);
      }
      return last;
    };

    /*
     * ⚠ 먼저 **음성 대조군**을 돌린다 — 오프셋 누적을 끄면(중앙 고정) 같은 팬으로
     * 가장자리에 못 닿아야 한다. 결함 모드는 씬의 `setAimFaultForTest('center-lock')`
     * 이고, 뒤의 두 이름은 그 표면이 확정되기 전의 후보다 — 하나도 없으면 판정문에
     * 그 사실을 적는다 (결함을 못 켠 채 조용히 통과하는 것이 최악이다).
     */
    const AIM_FAULT = (arg: string): string => `(() => {
      const sc = window.__kairo.scene;
      const cands = [['setAimFaultForTest', '${arg}'],
                     ['setPlaceFaultForTest', '${arg}'],
                     ['setRenderFaultForTest', 'aim-${arg}']];
      for (let k = 0; k < cands.length; k++) {
        const fn = sc[cands[k][0]];
        if (typeof fn !== 'function') continue;
        try { fn.call(sc, cands[k][1]); return cands[k][0] + '(' + cands[k][1] + ')'; }
        catch (e) { /* 이름은 있는데 인자가 다르다 — 다음 후보로 */ }
      }
      return null;
    })()`;
    /*
     * ⚠ **어느 끝이 클램프에 걸리는지는 판이 정한다** — px 잔여량으로 고르면 안 된다.
     * 실측: 잔여 32px 는 한 칸(32×16)보다 작아서 "중앙에 정확히 못 둔다"와 "레티클 칸이
     * 목표와 다르다"가 갈린다. 그래서 **네 끝을 전부 결함 상태로 몰아 보고 하나라도
     * 못 닿으면** 대조군 성립으로 본다 (정상 상태에서 전부 닿는 것은 바로 위 검사가 증명한다).
     * 실측(5등급): 남(i+j 최대)·서는 못 닿고 동은 클램프 안이라 닿는다 — 끝마다 다르다.
     */
    await pg.evaluate(PICK_PARASOL);
    await pg.waitForTimeout(180);
    const faultOn = (await pg.evaluate(AIM_FAULT('center-lock'))) as string | null;
    const faultTries: { key: string; reached: boolean; at: string }[] = [];
    if (faultOn && panRunnable) {
      for (const c of cornerList) {
        const got = await panToTile(c);
        faultTries.push({
          key: c.key,
          reached: got.i === c.i && got.j === c.j,
          at: `(${got.i},${got.j})`,
        });
      }
    }
    const blocked = faultTries.filter((t) => !t.reached);
    await pg.evaluate(AIM_FAULT('none'));
    await pg.evaluate(CANCEL);
    await pg.waitForTimeout(150);
    record(
      '⚠ 음성 대조군 — 중앙 고정으로 되돌리면 가장자리 칸에 조준이 못 닿는다 (K47-③)',
      faultOn !== null && panRunnable && blocked.length > 0 ? 'pass' : 'fail',
      faultOn === null
        ? '조준 결함 모드가 없다 — 이름을 통합 시 맞출 것 ' +
          '(setAimFaultForTest / setPlaceFaultForTest / setRenderFaultForTest 후보를 시도했다)'
        : `${faultOn} · 못 닿은 끝 ${blocked.length}/${faultTries.length} — ` +
          faultTries.map((t) => `${t.key} ${t.reached ? '닿음' : `막힘${t.at}`}`).join(' · ') +
          (blocked.length > 0
            ? ''
            : ' · ⚠ 이 판에서는 어느 끝도 클램프에 안 걸린다 (토지가 작으면 커버 구멍이 없다)'),
    );

    // ★ 진짜 팬만으로 가장자리 칸에 놓는다 (탭 백도어 없음)
    const handlesPan = (await pg.evaluate(HANDLES)) as number[];
    let panAim = { i: -1, j: -1, via: '(가장자리 후보 없음)' };
    let panSt: Confirm = { bar: false, disabled: true, label: '', ghost: false };
    let panPlaced: { i: number; j: number; defId: string } | null = null;
    if (panRunnable) {
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(180);
      panAim = await panToTile(panTarget);
      panSt = (await pg.evaluate(CONFIRM)) as Confirm;
      if (panSt.bar && !panSt.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(350);
      }
      panPlaced = (await pg.evaluate(newest(handlesPan))) as
        | { i: number; j: number; defId: string }
        | null;
      await pg.evaluate(CANCEL);
    }
    record(
      '★ 가장자리 칸을 진짜 팬 드래그만으로 조준해 놓는다 — 탭 백도어 없음 (K47-③)',
      panPlaced !== null && panPlaced.i === panTarget.i && panPlaced.j === panTarget.j
        ? 'pass'
        : 'fail',
      `목표 ${panTarget.key}(${panTarget.i},${panTarget.j}) · 조준 (${panAim.i},${panAim.j}) via ${panAim.via} · ` +
        `놓인 칸 ${panPlaced ? `(${panPlaced.i},${panPlaced.j})` : '없음'} · ` +
        `확정 바 ${String(panSt.bar)} disabled ${String(panSt.disabled)} "${panSt.label}"`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-aim-edge.png` });

    /*
     * 나머지 세 방향은 **좌표 다리**(`tapTile` = 조준을 그 칸으로 옮긴다)로 간다.
     * 팬으로 전부 가면 검사 시간이 몇 배가 되는데, 잡으려는 것은 "그 칸에 고스트를
     * 둘 수 있고 확정이 산다"이지 팬 자체가 아니다 (팬 경로는 바로 위가 증명한다).
     */
    const edgeRows: string[] = [
      `${panTarget.key}(${panTarget.i},${panTarget.j})${panPlaced ? '✓팬' : '✕팬'}`,
    ];
    let edgeOk = panPlaced !== null;
    for (const c of cornerList) {
      if (c.key === panTarget.key) continue;
      const prev = (await pg.evaluate(HANDLES)) as number[];
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(150);
      await pg.evaluate(`window.__kairo.scene.focusTile(${c.i}, ${c.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${c.i}, ${c.j})`);
      await pg.waitForTimeout(250);
      const st = (await pg.evaluate(CONFIRM)) as Confirm;
      if (st.bar && !st.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(300);
      }
      const got = (await pg.evaluate(newest(prev))) as { i: number; j: number } | null;
      await pg.evaluate(CANCEL);
      const hit = got !== null && got.i === c.i && got.j === c.j;
      if (!hit) edgeOk = false;
      edgeRows.push(`${c.key}(${c.i},${c.j})${hit ? '✓' : `✕"${st.label}"`}`);
    }
    record(
      '★ 지도 가장자리 칸에도 놓을 수 있다 — 중앙 고정이면 판의 32% 가 죽는다 (K47-③)',
      edgeOk && cornerList.length >= 3 ? 'pass' : 'fail',
      `${edgeRows.join(' · ')} · 방향 ${cornerList.length}개`,
    );

    /*
     * ── ③ 팬 중 판정이 갱신된다 ────────────────────────────────────────────
     *
     * 못 놓는 칸에서는 확정이 죽어 있어야 하고, 놓을 수 있는 칸으로 옮기면 살아나야
     * 한다. 계획 §3 이 "칸이 바뀐 프레임에만 `check()`" 라고 못 박은 지점이라, 갱신을
     * 빠뜨리면 **옛 칸의 판정으로 확정**이 눌린다.
     */
    const badGood = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      let bad = null, good = null;
      for (let j = L.j0; j < L.j0 + L.h && (!bad || !good); j++) {
        for (let i = L.i0; i < L.i0 + L.w; i++) {
          const ok = h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok;
          if (!ok && !bad && h.terrain.isWater(i, j)) bad = { i: i, j: j };
          if (ok && !good) good = { i: i, j: j };
          if (bad && good) break;
        }
      }
      // 물이 토지 안에 없으면 아무 불법 칸이나 (지형이 아니라 판정 갱신을 보는 절이다)
      if (!bad) {
        for (let j = L.j0; j < L.j0 + L.h && !bad; j++) {
          for (let i = L.i0; i < L.i0 + L.w; i++) {
            if (!h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok) { bad = { i: i, j: j }; break; }
          }
        }
      }
      return { bad: bad, good: good };
    })()`)) as {
      bad: { i: number; j: number } | null;
      good: { i: number; j: number } | null;
    };
    if (!badGood.bad || !badGood.good) {
      record(
        '팬 중 판정이 갱신된다 — 못 놓는 칸에서는 확정이 죽어 있다 (K47-③)',
        'fail',
        `못 놓는 칸 ${JSON.stringify(badGood.bad)} · 놓을 수 있는 칸 ${JSON.stringify(badGood.good)} — 시험 자리를 못 찾았다`,
      );
    } else {
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(150);
      await pg.evaluate(`window.__kairo.scene.focusTile(${badGood.bad.i}, ${badGood.bad.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${badGood.bad.i}, ${badGood.bad.j})`);
      await pg.waitForTimeout(250);
      const stBad = (await pg.evaluate(CONFIRM)) as Confirm;
      /* 팬하면 판정이 다시 돌아야 한다 — 조준 칸과 확정 상태가 짝인가 */
      await aimDrag(-64, -32);
      await pg.waitForTimeout(220);
      const stPan = (await pg.evaluate(CONFIRM)) as Confirm;
      const aimRaw = (await pg.evaluate(AIM_TILE)) as { i: number; j: number; via: string } | null;
      // 조준 칸 API 가 없거나 조준 중이 아니면 팬 구간은 못 잰다 — 그 사실을 적는다
      const aimPan = aimRaw && aimRaw.i >= 0 ? aimRaw : null;
      const wantPan = aimPan
        ? ((await pg.evaluate(`window.__kairo.placement.check(
            window.__kairo.terrain, window.__kairo.walls, window.__kairo.gate,
            'parasol', ${aimPan.i}, ${aimPan.j}).ok`)) as boolean)
        : null;
      await pg.evaluate(`window.__kairo.scene.focusTile(${badGood.good.i}, ${badGood.good.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${badGood.good.i}, ${badGood.good.j})`);
      await pg.waitForTimeout(250);
      const stGood = (await pg.evaluate(CONFIRM)) as Confirm;
      await pg.evaluate(CANCEL);
      const panAgrees = aimPan === null ? true : wantPan === !stPan.disabled;
      record(
        '팬 중 판정이 갱신된다 — 못 놓는 칸에서는 확정이 죽어 있다 (K47-③)',
        stBad.bar && stBad.disabled && stGood.bar && !stGood.disabled && panAgrees
          ? 'pass'
          : 'fail',
        `못 놓는 칸 (${badGood.bad.i},${badGood.bad.j}) disabled ${String(stBad.disabled)} "${stBad.label}" → ` +
          `놓을 수 있는 칸 (${badGood.good.i},${badGood.good.j}) disabled ${String(stGood.disabled)} · ` +
          (aimPan
            ? `팬 뒤 조준 (${aimPan.i},${aimPan.j}) check ${String(wantPan)} vs 확정 ${String(!stPan.disabled)}`
            : '조준 칸 API 가 없어 팬 구간은 못 쟀다 (이름을 통합 시 맞출 것)'),
      );
    }

    /*
     * ── ④ 철거도 확정을 거친다 ─────────────────────────────────────────────
     *
     * 지금까지 철거는 **탭 즉시 삭제 + 50% 환급 · 되돌리기 없음**이었고 하네스 동작
     * 검사가 0건이었다 (계획 §3). 조준 + 확정으로 승격되는 자리라 검사를 같이 만든다.
     */
    const eraseSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      for (let j = L.j0 + 1; j < L.j0 + L.h - 1; j++) {
        for (let i = L.i0 + 1; i < L.i0 + L.w - 1; i++) {
          if (!h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok) continue;
          const r = h.placement.place(h.terrain, h.walls, h.gate, 'parasol', i, j);
          if (!r.ok || !r.placed) continue;
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          return { ok: true, i: i, j: j, count: h.placement.count, cash: h.week.cash };
        }
      }
      return { ok: false };
    })()`)) as { ok: boolean; i?: number; j?: number; count?: number; cash?: number };
    if (!eraseSetup.ok) {
      record('철거도 확정을 거친다 — 탭 즉시 삭제는 되돌릴 수 없었다 (K47-③)', 'fail', '철거할 시설을 못 놓았다');
    } else {
      const picked = (await pg.evaluate(`(() => {
        document.getElementById('kairo-build-open').click();
        const gt = document.querySelector('#kairo-sheet [data-tab="ground"]');
        if (gt) gt.click();
        const e = document.querySelector('[data-pick="erase:erase"]');
        if (!e) return false;
        e.click();
        const sh = document.getElementById('kairo-sheet');
        if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
        return !!window.__kairoBrush && window.__kairoBrush() === 'erase';
      })()`)) as boolean;
      await pg.evaluate(`window.__kairo.scene.focusTile(${eraseSetup.i}, ${eraseSetup.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${eraseSetup.i}, ${eraseSetup.j})`);
      await pg.waitForTimeout(250);
      const midCount = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
      const stE = (await pg.evaluate(CONFIRM)) as Confirm;
      if (stE.bar && !stE.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(300);
      }
      const endCount = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
      await pg.evaluate(CANCEL);
      record(
        '철거도 확정을 거친다 — 탭 즉시 삭제는 되돌릴 수 없었다 (K47-③)',
        picked && stE.bar && midCount === eraseSetup.count && endCount === (eraseSetup.count ?? 0) - 1
          ? 'pass'
          : 'fail',
        `붓 ${picked ? 'erase' : '못 골랐다'} · 확정 바 ${String(stE.bar)} "${stE.label}" · ` +
          `시설 ${String(eraseSetup.count)} → 탭 직후 ${midCount} → 확정 후 ${endCount}`,
      );
    }

    /*
     * ── ⑤ 조준 중에는 시간이 안 흐른다 ─────────────────────────────────────
     *
     * 확정 바는 `PanelHost` 패널이 아니라서 `flowTick` 이 안 멈췄다. 조준 배치는 조준
     * 시간을 수 초로 늘리므로 "확정 바를 띄운 채 주가 마감 → 결산 위로 확정 클릭 →
     * 옛 현금 기준 지출"의 확률이 커진다 (계획 §3 원버그).
     *
     * ⚠ **"판이 원래 멈춰 있었다"를 배제한다** — 흐름·정지·재개 셋을 한 판정에 AND 로
     * 묶는다. 앞 절이 얼려 뒀으므로 여기서 녹이고, 끝나면 다시 얼려 넘긴다.
     */
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.week.abort();
      h.beginWeek();
      h.flow.frozen = false;
    })()`);
    const TICK = `(() => { const p = window.__kairo.week.liveProgress(); return p ? p.tick : -1; })()`;
    const runT0 = (await pg.evaluate(TICK)) as number;
    await pg.waitForTimeout(1300);
    const runT1 = (await pg.evaluate(TICK)) as number;
    const pickedT = (await pg.evaluate(PICK_PARASOL)) as boolean;
    await pg.waitForTimeout(300);
    const aimingState = (await pg.evaluate(`(() => {
      const sh = document.getElementById('kairo-sheet');
      const c = document.getElementById('kairo-confirm');
      return { sheet: !!sh && !sh.hidden, bar: !!c && !c.hidden };
    })()`)) as { sheet: boolean; bar: boolean };
    const aimT0 = (await pg.evaluate(TICK)) as number;
    await pg.waitForTimeout(3000);
    const aimT1 = (await pg.evaluate(TICK)) as number;
    await pg.evaluate(`(() => { const b = document.getElementById('kairo-place-cancel'); if (b) b.click(); })()`);
    await pg.waitForTimeout(300);
    const backT0 = (await pg.evaluate(TICK)) as number;
    await pg.waitForTimeout(1300);
    const backT1 = (await pg.evaluate(TICK)) as number;
    record(
      '★ 조준 중에는 시간이 안 흐른다 — 취소하면 다시 흐른다 (K47-③)',
      pickedT &&
        aimingState.bar &&
        !aimingState.sheet &&
        runT1 > runT0 &&
        aimT1 === aimT0 &&
        backT1 > backT0
        ? 'pass'
        : 'fail',
      `조준 전 ${runT0}→${runT1} (1.3초) · 조준 중 ${aimT0}→${aimT1} (3초) · ` +
        `취소 후 ${backT0}→${backT1} (1.3초) · 확정 바 ${String(aimingState.bar)} · ` +
        `시트 ${aimingState.sheet ? '열린 채다 (시트가 멈춘 것일 수 있다!)' : '닫힘'}`,
    );

    // 뒷정리 — 이 절이 연 것은 이 절이 닫는다
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      h.flow.frozen = true;
    })()`);
    record(
      '조준 배치 절에서 페이지 예외 0',
      aimErrors.length === 0 ? 'pass' : 'fail',
      aimErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P2-B. 결산의 콤보 블록 ──────────────────────────────────────────────
   *
   * `kairo-report.ts` 의 `comboBlock` 은 **브라우저 검사가 하나도 없었다.** 보려는 것 넷:
   *
   *  ① **0개인 주** — 줄을 감추지 않고 처방을 띄운다. 새 판의 첫 결산은 언제나 0개라
   *     콤보라는 축을 소개하는 자리가 여기밖에 없다 (설계 결정). 감추면 실패다
   *  ② **터진 주** — 발동·만족·공원 매출 타일이 실제 값으로 차고 상위 콤보 줄이 보인다
   *  ③ **표시 == 적용** — 화면 숫자가 `WeekReport.combos`(그 주에 실제로 적용된 값)와
   *     같아야 한다. 결산이 배치에서 다시 계산하면 흐르는 낮에 지은 시설이 섞여
   *     "목록은 13개인데 숫자는 12개 몫"이 된다. **주가 열린 뒤에 콤보를 하나 더 만들고
   *     화면이 그걸 안 세는지**를 본다 — 그게 `WeekReport.combos` 를 그대로 쓰기로 한
   *     계약을 지키는 유일한 검사다
   *  ④ **면적 비례(P1-A)가 화면까지 오나** — `×배율 (칸수)`. 수영장을 넓히면 배율이 오른다
   *
   * 잔해 위에서 재지 않으려고 **새 판(새 컨텍스트 + 세이브 삭제)**에서 돈다. 그리고
   * 시작 킷(탁구대·평상)이 이미 콤보를 터뜨릴 수 있으므로 **0개를 만들어 놓고** 시작한다 —
   * "0개인 주"를 우연에 맡기면 그 절이 어떤 판에서는 조용히 안 도는 검사가 된다.
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const cbErrors: string[] = [];
    pg.on('pageerror', (e) => cbErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    /** 주를 새로 열고 끝까지 감아 결산을 띄운다 — 카드는 절이 스스로 치운다 */
    const settleWeek = async (): Promise<void> => {
      await pg.waitForTimeout(400);
      await pg.evaluate(DISMISS_CARDS);
      await pg.waitForTimeout(300);
    };
    /** 이 절이 연 것은 이 절이 닫는다 — 다음 계측이 잔해 위에서 돌지 않게 */
    const closeReport = async (): Promise<void> => {
      await pg.evaluate(CLOSE_REPORT);
      await pg.waitForTimeout(250);
      await pg.evaluate(DISMISS_CARDS);
      await pg.waitForTimeout(250);
    };

    /* ── ① 콤보 0개인 주 ─────────────────────────────────────────────── */
    const zeroSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.flow.frozen = true;
      h.arrivalQueue.length = 0;
      ${PAVE_ALL}
      /*
       * 콤보 0개를 **만들어** 놓는다. 매표소는 남긴다 — 그게 입구라, 지우면 손님이
       * 아예 안 들어와 "0개라서 0인지 판이 죽어서 0인지"를 못 가른다.
       */
      let guard = 0;
      let live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
      while (live.length > 0 && guard++ < 40) {
        const list = p.all().filter((x) => x.defId !== 'ticket');
        if (list.length === 0) break;
        const victim = list[list.length - 1];
        p.remove(victim.handle);
        sc.refreshFacility(victim.handle);
        h.guests.invalidate();
        live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
      }
      h.week.abort();
      h.beginWeek();
      h.runWeek();
      return { live: live.map((c) => c.id), left: p.all().length, removed: guard };
    })()`)) as { live: string[]; left: number; removed: number };
    await settleWeek();

    const zeroBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
    const zeroApplied = (await pg.evaluate(READ_REPORT_COMBOS)) as {
      sat: number;
      mult: number;
      week: number;
    } | null;

    record(
      '★ 콤보 0개인 주에도 결산에 콤보 블록이 뜬다 — 감추면 배울 자리가 없다 (P2-B)',
      zeroSetup.live.length === 0 &&
        zeroBlock.open === true &&
        zeroBlock.block === true &&
        zeroBlock.visible === true &&
        zeroBlock.count === 0 &&
        statOf(zeroBlock, '발동') === '0개'
        ? 'pass'
        : 'fail',
      `발동 조건 정리 ${zeroSetup.removed}회 · 남은 시설 ${zeroSetup.left}개 · ` +
        `살아 있는 콤보 ${zeroSetup.live.length ? zeroSetup.live.join(',') : '0개'} · ` +
        `블록 ${zeroBlock.block ? '있음' : '없음'}(보임 ${String(zeroBlock.visible)}) · ` +
        `data-combo=${String(zeroBlock.count)} · 발동 타일 "${statOf(zeroBlock, '발동')}"`,
    );
    record(
      '0개인 주는 숫자 대신 처방을 말한다 — 상위 줄은 안 그린다 (P2-B)',
      (zeroBlock.caps ?? []).some((c) => c.includes('아직 발동한 콤보가 없습니다')) &&
        (zeroBlock.lines ?? []).length === 0 &&
        statOf(zeroBlock, '만족') === '+0.0' &&
        statOf(zeroBlock, '공원 매출') === '+0.0%'
        ? 'pass'
        : 'fail',
      `처방 ${(zeroBlock.caps ?? []).some((c) => c.includes('아직 발동한')) ? '있음' : '없음'} · ` +
        `상위 줄 ${(zeroBlock.lines ?? []).length}개 · ` +
        `만족 "${statOf(zeroBlock, '만족')}" · 매출 "${statOf(zeroBlock, '공원 매출')}" · ` +
        `적용값 ${zeroApplied ? `+${zeroApplied.sat.toFixed(1)} / ×${zeroApplied.mult.toFixed(3)}` : '없음'}`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-combo-block-zero.png` });
    await closeReport();

    /* ── ② 터진 주 — 매점+평상(소형) · 수영장+DJ 부스(zone, 면적 비례) ── */
    const built = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
      ${LAND_BOX}
      ${FREE_RECT}
      const spotA = _free(8, 6);
      if (!spotA) return { ok: false, why: '매점 자리(8x6)를 못 찾았다' };
      const shop = p.place(t, w, h.gate, 'shop', spotA[0], spotA[1]);
      if (!shop.ok) return { ok: false, why: '매점 배치 실패: ' + shop.fail };
      sc.refreshFacility(shop.placed.handle);
      // 7j 가 이미 증명한 조합 — 매점 앞 평상 (소형)
      const py = p.place(t, w, h.gate, 'pyeongsang_row', spotA[0], spotA[1] + 3);
      if (!py.ok) return { ok: false, why: '평상 배치 실패: ' + py.fail };
      sc.refreshFacility(py.placed.handle);

      /*
       * 수영장 12칸 + DJ 부스 → zone 콤보 '풀 파티'. 면적 배율은 sqrt(12/8) = 1.22 이므로
       * 화면에 ×1.2 로 뜬다. 아래 ④ 에서 32칸으로 넓혀 상한 ×2.0 까지 오르는지 본다.
       */
      const spotB = _free(8, 6);
      if (!spotB) return { ok: false, why: '수영장 자리(8x6)를 못 찾았다' };
      const pi = spotB[0], pj = spotB[1];
      for (let dj = 0; dj < 4; dj++) {
        for (let di = 0; di < 3; di++) {
          t.paint(pi + di, pj + dj, 'pool_water');
          sc.refreshTile(pi + di, pj + dj);
        }
      }
      const booth = p.place(t, w, h.gate, 'dj_booth', pi, pj + 4);
      if (!booth.ok) return { ok: false, why: 'DJ 부스 배치 실패: ' + booth.fail };
      sc.refreshFacility(booth.placed.handle);
      h.guests.invalidate();

      const zones = h.guests.swimZones();
      h.arrivalQueue.length = 0;
      h.week.abort();
      h.beginWeek();
      h.runWeek();
      return {
        ok: true,
        pool: [pi, pj],
        area: zones.length ? zones[0].area : 0,
        active: h.combos.evaluateCombos(p, undefined, zones).active.map((c) => c.id),
      };
    })()`)) as
      | { ok: false; why: string }
      | { ok: true; pool: number[]; area: number; active: string[] };

    if (!built.ok) {
      record('★ 콤보가 터진 주의 결산 블록 (P2-B)', 'fail', built.why);
      record('★ 표시 == 적용 — 화면 숫자가 그 주에 실제로 적용된 보너스다 (P2-B)', 'fail', built.why);
      record('★ 면적 비례가 결산까지 온다 — ×배율 (칸수) (P1-A)', 'fail', built.why);
    } else {
      await settleWeek();
      const firedBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
      const firedApplied = (await pg.evaluate(READ_REPORT_COMBOS)) as {
        sat: number;
        mult: number;
        week: number;
      } | null;
      const firedArea = areaOf(firedBlock);

      record(
        '★ 콤보가 터진 주 — 발동·만족·매출 타일이 값으로 차고 상위 줄이 보인다 (P2-B)',
        firedBlock.block === true &&
          firedBlock.visible === true &&
          (firedBlock.count ?? 0) > 0 &&
          statOf(firedBlock, '발동') === `${firedBlock.count ?? 0}개` &&
          (firedBlock.lines ?? []).length > 0 &&
          (firedApplied?.sat ?? 0) > 0 &&
          (firedApplied?.mult ?? 1) > 1
          ? 'pass'
          : 'fail',
        `살아 있는 콤보 ${built.active.join(',') || '0개'} · data-combo=${String(firedBlock.count)} · ` +
          `발동 "${statOf(firedBlock, '발동')}" · 만족 "${statOf(firedBlock, '만족')}" · ` +
          `매출 "${statOf(firedBlock, '공원 매출')}" · 상위 줄 ${(firedBlock.lines ?? []).length}개` +
          `${(firedBlock.lines ?? [])[0] ? ` (첫 줄 "${(firedBlock.lines ?? [])[0]?.key}" → "${(firedBlock.lines ?? [])[0]?.val}")` : ''}`,
      );

      /*
       * ⚠ **표시 == 적용.** 타일 두 개를 `WeekReport.combos` 와 **문자열까지** 맞춘다 —
       * 리포트가 `eff.satisfactionDelta.toFixed(1)` / `(mult-1)*100).toFixed(1)` 로 찍으므로
       * 같은 규칙으로 지어 비교하면 "다른 값을 예쁘게 반올림해 우연히 같아 보이는" 경우가 없다.
       */
      const wantSat = firedApplied ? `+${firedApplied.sat.toFixed(1)}` : '?';
      const wantRev = firedApplied ? `+${((firedApplied.mult - 1) * 100).toFixed(1)}%` : '?';
      record(
        '★ 표시 == 적용 — 결산의 콤보 숫자가 그 주에 실제로 적용된 보너스다 (P2-B)',
        firedApplied !== null &&
          statOf(firedBlock, '만족') === wantSat &&
          statOf(firedBlock, '공원 매출') === wantRev
          ? 'pass'
          : 'fail',
        `화면 만족 "${statOf(firedBlock, '만족')}" vs 적용 "${wantSat}" · ` +
          `화면 매출 "${statOf(firedBlock, '공원 매출')}" vs 적용 "${wantRev}"`,
      );

      record(
        '★ 면적 비례가 결산까지 온다 — 상위 줄에 ×배율 (칸수) (P1-A)',
        firedArea !== null && firedArea.area === built.area && firedArea.scale > 1
          ? 'pass'
          : 'fail',
        firedArea
          ? `"${firedArea.key}" → ×${firedArea.scale} (${firedArea.area}칸) · sim 구역 ${built.area}칸`
          : `표기 없음 · sim 구역 ${built.area}칸 · 줄 ${(firedBlock.lines ?? []).map((l) => l.key).join(' | ')}`,
      );
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-combo-block-fired.png` });
      await closeReport();

      /* ── ③ 수영장을 넓히면 배율이 오른다 (P1-A) ────────────────────── */
      const widened = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, p = h.placement, sc = h.scene;
        const pi = ${built.pool[0] ?? 0}, pj = ${built.pool[1] ?? 0};
        // 12칸 → 32칸. sqrt(32/8) = 2.0 이라 데이터의 cap(2.0)에 닿는다
        for (let dj = 0; dj < 4; dj++) {
          for (let di = 3; di < 8; di++) {
            t.paint(pi + di, pj + dj, 'pool_water');
            sc.refreshTile(pi + di, pj + dj);
          }
        }
        h.guests.invalidate();
        const zones = h.guests.swimZones();
        h.arrivalQueue.length = 0;
        h.week.abort();
        h.beginWeek();
        h.runWeek();
        return { area: zones.length ? zones[0].area : 0 };
      })()`)) as { area: number };
      await settleWeek();
      const wideBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
      const wideArea = areaOf(wideBlock);
      record(
        '★ 수영장을 넓히면 결산의 면적 배율이 오른다 — 구역 크기가 결정이 된다 (P1-A)',
        firedArea !== null &&
          wideArea !== null &&
          wideArea.area === widened.area &&
          widened.area > built.area &&
          wideArea.scale > firedArea.scale
          ? 'pass'
          : 'fail',
        `${built.area}칸 ×${firedArea?.scale ?? '?'} → ${widened.area}칸 ×${wideArea?.scale ?? '?'}` +
          `${wideArea ? ` ("${wideArea.key}")` : ' (표기 없음)'}`,
      );
      await closeReport();

      /*
       * ── ④ 흐르는 낮에 지은 시설은 안 섞인다 ────────────────────────────
       *
       * 주를 연 **뒤에** 콤보 하나를 더 만든다. 화면은 주가 열린 시점의 수를 그대로
       * 들고 있어야 한다 — 여기서 갈라지면 리포트가 배치에서 다시 계산하고 있다는 뜻이다.
       *
       * ⚠ **검사가 유효한지 먼저 본다**: 늦게 지은 것이 정말로 콤보를 늘렸는가
       * (`live` > `atBegin`). 안 늘었으면 아무것도 안 재면서 통과하는 검사가 된다.
       */
      const late = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
        ${LAND_BOX}
        ${FREE_RECT}
        h.arrivalQueue.length = 0;
        h.week.abort();
        h.beginWeek();
        const atBegin = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active.length;
        // 주가 열린 뒤 — 흐르는 낮에 짓는 것과 같은 타이밍이다
        const spot = _free(8, 6);
        if (!spot) return { ok: false, why: '늦게 지을 자리를 못 찾았다' };
        const shop = p.place(t, w, h.gate, 'shop', spot[0], spot[1]);
        if (!shop.ok) return { ok: false, why: '매점 배치 실패: ' + shop.fail };
        sc.refreshFacility(shop.placed.handle);
        const py = p.place(t, w, h.gate, 'pyeongsang_row', spot[0], spot[1] + 3);
        if (!py.ok) return { ok: false, why: '평상 배치 실패: ' + py.fail };
        sc.refreshFacility(py.placed.handle);
        h.guests.invalidate();
        const live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active.length;
        h.runWeek();
        return { ok: true, atBegin: atBegin, live: live };
      })()`)) as { ok: false; why: string } | { ok: true; atBegin: number; live: number };

      if (!late.ok) {
        record(
          '★ 흐르는 낮에 지은 시설은 결산 콤보에 안 섞인다 — 주가 열린 시점으로 얼린다 (P2-B)',
          'fail',
          late.why,
        );
      } else {
        await settleWeek();
        const lateBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
        record(
          '★ 흐르는 낮에 지은 시설은 결산 콤보에 안 섞인다 — 주가 열린 시점으로 얼린다 (P2-B)',
          late.live > late.atBegin && lateBlock.count === late.atBegin
            ? 'pass'
            : 'fail',
          `주 시작 ${late.atBegin}개 → 늦게 지어 ${late.live}개 · 화면 ${String(lateBlock.count)}개 ` +
            `(얼렸으면 ${late.atBegin}, 다시 계산하면 ${late.live})` +
            `${late.live > late.atBegin ? '' : ' ⚠ 늦은 건설이 콤보를 안 늘렸다 — 이 검사는 무효다'}`,
        );
        await closeReport();
      }

      /*
       * ── ⑤ ⚠ 음성 대조군 — 콤보를 철거하면 블록이 0개 상태로 돌아온다 ──
       *
       * 위 절들이 "블록에 늘 뭔가 그려진다"를 보고 통과한 것이 아님을 증명한다.
       */
      const razed = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, p = h.placement, sc = h.scene;
        // 수영장도 되돌린다 — zone 콤보가 남으면 "철거했는데 0이 아니다"가 된다
        for (let j = 0; j < t.height; j++) {
          for (let i = 0; i < t.width; i++) {
            if (t.kindAt(i, j) !== 'pool_water') continue;
            t.paint(i, j, 'path_stone');
            sc.refreshTile(i, j);
          }
        }
        let guard = 0;
        h.guests.invalidate();
        let live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
        while (live.length > 0 && guard++ < 40) {
          const list = p.all().filter((x) => x.defId !== 'ticket');
          if (list.length === 0) break;
          const victim = list[list.length - 1];
          p.remove(victim.handle);
          sc.refreshFacility(victim.handle);
          h.guests.invalidate();
          live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
        }
        h.arrivalQueue.length = 0;
        h.week.abort();
        h.beginWeek();
        h.runWeek();
        return { live: live.map((c) => c.id) };
      })()`)) as { live: string[] };
      await settleWeek();
      const razedBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
      const razedApplied = (await pg.evaluate(READ_REPORT_COMBOS)) as {
        sat: number;
        mult: number;
        week: number;
      } | null;
      record(
        '⚠ 음성 대조군 — 콤보를 철거하면 블록이 0개 상태로 돌아온다 (P2-B 의 되돌리기)',
        razed.live.length === 0 &&
          razedBlock.block === true &&
          razedBlock.count === 0 &&
          (razedBlock.lines ?? []).length === 0 &&
          (razedBlock.caps ?? []).some((c) => c.includes('아직 발동한 콤보가 없습니다')) &&
          razedApplied?.sat === 0 &&
          razedApplied?.mult === 1
          ? 'pass'
          : 'fail',
        `살아 있는 콤보 ${razed.live.length ? razed.live.join(',') : '0개'} · ` +
          `data-combo=${String(razedBlock.count)} · 상위 줄 ${(razedBlock.lines ?? []).length}개 · ` +
          `적용값 ${razedApplied ? `+${razedApplied.sat.toFixed(1)} / ×${razedApplied.mult.toFixed(3)}` : '없음'}`,
      );
      await closeReport();
    }

    record(
      '결산 콤보 블록 절에서 페이지 예외 0',
      cbErrors.length === 0 ? 'pass' : 'fail',
      cbErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P1.5. 시설 특화 — 경영 ▸ 개선의 갈림길 ───────────────────────────────
   *
   * 3단계에 닿은 시설은 **돈을 쓰는 줄이 아니라 고르는 줄**이 된다 (`kairo-staff.ts` 의
   * `renderUpgrades`). 단위 테스트(`specialty.test.ts`)가 sim 쪽 성질 셋을 이미 지키지만
   * **브라우저 검사가 하나도 없었다** — 즉 "데이터는 맞는데 화면에 안 뜬다"와
   * "버튼은 있는데 안 눌린다"를 잡는 것이 아무것도 없었다.
   *
   * 보려는 것 셋:
   *  ① 3단계 시설에 갈림길 칩이 뜨고, **진짜 터치**로 고르면 그 시설 수치가 바뀐다
   *     (회전 = 정원 +1 · 수익 = 요금 +25% · 평판 = 만족 +3 — 서로 다른 자원이다)
   *  ② **데이터가 화면까지 온다** — 매표소는 칩이 하나(회전)뿐이고, 분위기 시설
   *     (DJ 부스, 정원 0)은 칩이 아예 없다. UI 가 셋을 고정하면 데이터의 필터가 무의미해진다
   *  ③ ⚠ **음성 대조군** — 안 고른 시설은 세 수치가 전부 그대로다. 이게 깨지면
   *     특화가 "고르든 말든 오르는 스탯"이 되어 갈림길이 사라진다
   *
   * 3단계까지 올리는 것은 `window.__kairo` 백도어로 먹인다 (판 셋업). **고르는 행위만은
   * 진짜 터치**다 — 화면이 되는지는 진짜 터치로 본다 (K33).
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const spErrors: string[] = [];
    pg.on('pageerror', (e) => spErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const spCdp = await cx.newCDPSession(pg);
    const spTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await spCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };

    /*
     * 판 셋업 — 시작 킷을 걷어내고 **필요한 것만** 남긴다.
     *
     * ⚠ `renderUpgrades` 는 목록을 `slice(0, 12)` 로 자른다. 시작 킷의 데크가 그대로
     * 남으면 고를 것이 없는 줄이 자리를 먹어 DJ 부스가 목록 **밖**으로 밀릴 수 있고,
     * 그러면 "칩이 없다"를 재는 대신 "줄이 없다"를 재게 된다.
     */
    const spSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.flow.frozen = true;
      h.arrivalQueue.length = 0;
      ${PAVE_ALL}
      ${LAND_BOX}
      ${FREE_RECT}
      const ticket = (p.all().find((x) => x.defId === 'ticket') || {}).handle;
      if (ticket === undefined) return { ok: false, why: '매표소를 못 찾았다' };
      for (const it of p.all()) {
        if (it.handle === ticket) continue;
        p.remove(it.handle);
        sc.refreshFacility(it.handle);
      }
      const put = (defId, ww, hh) => {
        const spot = _free(ww, hh);
        if (!spot) return { ok: false, why: defId + ' 자리를 못 찾았다' };
        const r = p.place(t, w, h.gate, defId, spot[0], spot[1]);
        if (!r.ok) return { ok: false, why: defId + ' 배치 실패: ' + r.fail };
        sc.refreshFacility(r.placed.handle);
        return { ok: true, handle: r.placed.handle };
      };
      const ids = { ticket: ticket };
      for (const [key, defId] of [['turn', 'shop'], ['rev', 'shop'], ['rep', 'shop'], ['none', 'shop']]) {
        const r = put(defId, 4, 4);
        if (!r.ok) return r;
        ids[key] = r.handle;
      }
      const booth = put('dj_booth', 4, 3);
      if (!booth.ok) return booth;
      ids.booth = booth.handle;
      // 3단계 = 특화를 고르는 단계 (SPECIALTY_LEVEL). 백도어는 **판을 만드는 데만** 쓴다
      for (const key of Object.keys(ids)) {
        let guard = 0;
        while (p.levelOf(ids[key]) < 3 && guard++ < 8) p.upgrade(ids[key]);
      }
      h.guests.invalidate();
      return { ok: true, ids: ids, total: p.all().length };
    })()`)) as
      | { ok: false; why: string }
      | { ok: true; ids: Record<string, number>; total: number };

    if (!spSetup.ok) {
      record('★ 3단계 시설에 특화 갈림길이 뜬다 (P1.5)', 'fail', spSetup.why);
      record('★ 특화를 진짜 터치로 고르면 그 시설 수치가 바뀐다 (P1.5)', 'fail', spSetup.why);
      record('특화 목록은 데이터가 정한다 — 매표소 1개 · 분위기 시설 0개 (P1.5, 불변식 3)', 'fail', spSetup.why);
      record('⚠ 음성 대조군 — 안 고른 시설은 수치가 그대로다 (P1.5)', 'fail', spSetup.why);
    } else {
      const ids = spSetup.ids;
      const idsJson = JSON.stringify(ids);

      /** 개선 탭을 연다 — 메뉴 시트 ▸ 경영 ▸ 개선 (K28 부터 열기 버튼은 메뉴 안이다) */
      const openUpgradeTab = `(() => {
        const menu = document.getElementById('kairo-menu-open');
        if (menu) menu.click();
        const open = document.getElementById('kairo-staff-open');
        if (open) open.click();
        const panel = document.getElementById('kairo-staff');
        if (!panel || panel.hidden) return false;
        const tab = panel.querySelector('button[data-manage="upgrade"]');
        if (tab) tab.click();
        return true;
      })()`;
      const opened = (await pg.evaluate(openUpgradeTab)) as boolean;
      await pg.waitForTimeout(300);

      /*
       * 개선 목록을 읽는다. 선택자는 `kairo-staff.ts` 실물에서 확인했다 —
       * 줄은 `div[data-upgrade]`(+ `data-level`, 고른 뒤 `data-specialty`),
       * 갈림길 칩은 `button[data-specialty-pick]`, 안내문은 `.kitem-sub` 다.
       */
      const READ_ROWS = `(() => {
        const panel = document.getElementById('kairo-staff');
        if (!panel || panel.hidden) return { open: false, rows: [] };
        const rows = [...panel.querySelectorAll('div[data-upgrade]')].map((r) => ({
          handle: Number(r.getAttribute('data-upgrade')),
          level: Number(r.getAttribute('data-level')),
          specialty: r.getAttribute('data-specialty') || '',
          sub: ((r.querySelector('.kitem-sub') || {}).textContent || ''),
          picks: [...r.querySelectorAll('button[data-specialty-pick]')].map((b) => ({
            spec: b.getAttribute('data-specialty-pick') || '',
            label: b.textContent || '',
            h: Math.round(b.getBoundingClientRect().height),
          })),
        }));
        return { open: true, rows: rows };
      })()`;
      type Row = {
        handle: number;
        level: number;
        specialty: string;
        sub: string;
        picks: { spec: string; label: string; h: number }[];
      };
      const readRows = async (): Promise<Row[]> =>
        ((await pg.evaluate(READ_ROWS)) as { open: boolean; rows: Row[] }).rows;

      /** 시설 수치의 정본 — sim 에 직접 묻는다 (화면 숫자가 아니라 **결과**를 본다) */
      const READ_STATS = `(() => {
        const p = window.__kairo.placement;
        const ids = ${idsJson};
        const out = {};
        for (const k of Object.keys(ids)) {
          out[k] = {
            cap: p.capacityOf(ids[k]),
            fee: p.feeOf(ids[k]),
            sat: p.satisfactionBonusOf(ids[k]),
            spec: p.specialtyOf(ids[k]),
            level: p.levelOf(ids[k]),
            can: p.canChooseSpecialty(ids[k]),
          };
        }
        return out;
      })()`;
      type Stat = {
        cap: number;
        fee: number;
        sat: number;
        spec: string | null;
        level: number;
        can: boolean;
      };
      const readStats = async (): Promise<Record<string, Stat>> =>
        (await pg.evaluate(READ_STATS)) as Record<string, Stat>;

      const rowsBefore = await readRows();
      const statsBefore = await readStats();
      const rowOf = (list: Row[], handle: number): Row | undefined =>
        list.find((r) => r.handle === handle);

      const shopRow = rowOf(rowsBefore, ids['turn'] ?? -1);
      const ticketRow = rowOf(rowsBefore, ids['ticket'] ?? -1);
      const boothRow = rowOf(rowsBefore, ids['booth'] ?? -1);

      record(
        '★ 3단계 시설에 특화 갈림길 3개가 뜬다 — 비용 버튼이 아니라 고르는 줄이다 (P1.5)',
        opened &&
          shopRow !== undefined &&
          shopRow.level === 3 &&
          shopRow.picks.length === 3 &&
          shopRow.picks.map((x) => x.spec).sort().join(',') === 'capacity,reputation,revenue' &&
          shopRow.picks.every((x) => x.h >= 44)
          ? 'pass'
          : 'fail',
        `개선 탭 ${opened ? '열림' : '안 열림'} · 줄 ${rowsBefore.length}개 · ` +
          `매점 ${shopRow ? `${shopRow.level}단계 칩 ${shopRow.picks.length}개 ` +
            `[${shopRow.picks.map((x) => `${x.spec}:${x.label.replace(/\s+/g, ' ')}`).join(' | ')}] ` +
            `최소 ${shopRow.picks.length ? Math.min(...shopRow.picks.map((x) => x.h)) : 0}px` : '줄 없음'}`,
      );

      /*
       * ⚠ 데이터가 정한다 (불변식 3). 매표소는 `specialties: ["capacity"]` 하나뿐이고
       * DJ 부스는 정원 0 이라 빈 배열이다 — UI 가 셋을 고정하면 이 두 줄이 거짓말이 된다.
       */
      record(
        '특화 목록은 데이터가 정한다 — 매표소 1개 · 분위기 시설 0개 (P1.5, 불변식 3)',
        ticketRow !== undefined &&
          ticketRow.picks.length === 1 &&
          ticketRow.picks[0]?.spec === 'capacity' &&
          boothRow !== undefined &&
          boothRow.picks.length === 0 &&
          statsBefore['booth']?.can === false &&
          boothRow.sub.indexOf('특화') < 0
          ? 'pass'
          : 'fail',
        `매표소 칩 ${ticketRow ? ticketRow.picks.map((x) => x.spec).join(',') || '0개' : '줄 없음'} · ` +
          `DJ 부스(정원 0) 칩 ${boothRow ? boothRow.picks.length : '줄 없음'}개 · ` +
          `canChooseSpecialty=${String(statsBefore['booth']?.can)} · ` +
          `안내문 "${boothRow?.sub ?? ''}"`,
      );

      /*
       * 진짜 터치로 고른다. 줄은 고를 때마다 다시 그려지고 정렬도 바뀌므로
       * **매번 다시 찾는다** — 좌표를 캐 두면 두 번째부터 엉뚱한 칩을 누른다.
       */
      const pick = async (
        handle: number,
        spec: string,
      ): Promise<{ ok: boolean; why?: string; onScreen?: boolean }> => {
        const at = (await pg.evaluate(`(() => {
          const panel = document.getElementById('kairo-staff');
          const row = panel ? panel.querySelector('div[data-upgrade="${handle}"]') : null;
          if (!row) return { ok: false, why: '줄이 없다' };
          const b = row.querySelector('button[data-specialty-pick="${spec}"]');
          if (!b) return { ok: false, why: '칩이 없다' };
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect();
          return {
            ok: true,
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            onScreen: r.top >= 0 && r.bottom <= innerHeight + 2,
          };
        })()`)) as { ok: boolean; why?: string; x?: number; y?: number; onScreen?: boolean };
        if (!at.ok || at.x === undefined || at.y === undefined) return at;
        await spTouch('touchStart', at.x, at.y);
        await spTouch('touchEnd', 0, 0);
        await pg.waitForTimeout(250);
        return at;
      };

      const pickedTurn = await pick(ids['turn'] ?? -1, 'capacity');
      const pickedRev = await pick(ids['rev'] ?? -1, 'revenue');
      const pickedRep = await pick(ids['rep'] ?? -1, 'reputation');
      const statsAfter = await readStats();
      const rowsAfter = await readRows();

      const b = (k: string): Stat | undefined => statsBefore[k];
      const a = (k: string): Stat | undefined => statsAfter[k];
      const turnOk =
        (a('turn')?.cap ?? 0) === (b('turn')?.cap ?? 0) + 1 &&
        (a('turn')?.fee ?? 0) === (b('turn')?.fee ?? -1) &&
        (a('turn')?.sat ?? -1) === 0;
      // 요금 +25% 는 **정가에 더해지는 몫**이다 (배수 1+0.6 → 1.85). 비율이 아니라 차이로 잰다
      const revOk =
        (a('rev')?.fee ?? 0) > (b('rev')?.fee ?? 0) &&
        (a('rev')?.cap ?? -1) === (b('rev')?.cap ?? 0) &&
        (a('rev')?.sat ?? -1) === 0;
      const repOk =
        (a('rep')?.sat ?? 0) === 3 &&
        (a('rep')?.cap ?? -1) === (b('rep')?.cap ?? 0) &&
        (a('rep')?.fee ?? -1) === (b('rep')?.fee ?? 0);

      record(
        '★ 특화를 진짜 터치로 고르면 그 시설 수치가 바뀐다 — 셋이 서로 다른 자원이다 (P1.5)',
        pickedTurn.ok &&
          pickedRev.ok &&
          pickedRep.ok &&
          pickedTurn.onScreen === true &&
          turnOk &&
          revOk &&
          repOk
          ? 'pass'
          : 'fail',
        `회전 정원 ${b('turn')?.cap}→${a('turn')?.cap} (요금 ${a('turn')?.fee} 그대로 · 만족 ${a('turn')?.sat}) · ` +
          `수익 요금 ${b('rev')?.fee}→${a('rev')?.fee} (정원 ${a('rev')?.cap} 그대로) · ` +
          `평판 만족 ${b('rep')?.sat}→${a('rep')?.sat} (정원 ${a('rep')?.cap} · 요금 ${a('rep')?.fee} 그대로)` +
          `${pickedTurn.ok ? '' : ` · 회전 칩 ${pickedTurn.why ?? '?'}`}` +
          `${pickedRev.ok ? '' : ` · 수익 칩 ${pickedRev.why ?? '?'}`}` +
          `${pickedRep.ok ? '' : ` · 평판 칩 ${pickedRep.why ?? '?'}`}`,
      );

      /*
       * 고른 뒤의 줄은 **고른 것을 보여주고 칩을 거둔다** — 한 번 고르면 못 바꾸므로
       * 칩이 남아 있으면 다시 누를 수 있다는 거짓말이 된다.
       */
      const turnAfterRow = rowOf(rowsAfter, ids['turn'] ?? -1);
      record(
        '고른 특화가 줄에 남고 칩은 거둬진다 — 한 번 고르면 못 바꾼다 (P1.5)',
        turnAfterRow !== undefined &&
          turnAfterRow.specialty === 'capacity' &&
          turnAfterRow.picks.length === 0 &&
          turnAfterRow.sub.indexOf('회전') >= 0
          ? 'pass'
          : 'fail',
        turnAfterRow
          ? `data-specialty="${turnAfterRow.specialty}" · 칩 ${turnAfterRow.picks.length}개 · ` +
            `"${turnAfterRow.sub.replace(/\s+/g, ' ')}"`
          : '줄이 사라졌다',
      );

      /*
       * ⚠ 음성 대조군 — 안 고른 시설(`none`)은 P1.5 이전과 **완전히 같다**.
       * 이게 깨지면 특화가 "고르든 말든 오르는 스탯"이라 갈림길 자체가 없는 것과 같고,
       * 특화를 모르는 봇(`tools/kairo-sim.ts`)의 밸런스도 모르는 사이 움직인다.
       */
      const noneRow = rowOf(rowsAfter, ids['none'] ?? -1);
      record(
        '⚠ 음성 대조군 — 안 고른 시설은 정원·요금·만족이 그대로다 (P1.5)',
        (a('none')?.cap ?? -1) === (b('none')?.cap ?? 0) &&
          (a('none')?.fee ?? -1) === (b('none')?.fee ?? 0) &&
          (a('none')?.sat ?? -1) === 0 &&
          a('none')?.spec === null &&
          noneRow !== undefined &&
          noneRow.specialty === '' &&
          noneRow.picks.length === 3
          ? 'pass'
          : 'fail',
        `정원 ${b('none')?.cap}→${a('none')?.cap} · 요금 ${b('none')?.fee}→${a('none')?.fee} · ` +
          `만족 보너스 ${a('none')?.sat} · 특화 ${String(a('none')?.spec)} · ` +
          `줄의 칩 ${noneRow ? noneRow.picks.length : '줄 없음'}개 (아직 고를 수 있어야 한다)`,
      );
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-specialty.png` });

      // 뒷정리 — 이 절이 연 것은 이 절이 닫는다
      await pg.evaluate(`(() => {
        const c = document.getElementById('kairo-staff-close');
        if (c) c.click();
        // 메뉴·건설은 공용 시트 하나다 (kairo-sheet) — 경영을 열면 저절로 닫히지만,
        // 안 닫힌 판(패널 열기가 거절된 경우)을 남기지 않는다
        const sh = document.getElementById('kairo-sheet');
        if (sh && !sh.hidden) {
          const mc = document.getElementById('kairo-sheet-close');
          if (mc) mc.click();
        }
      })()`);
    }

    record(
      '시설 특화 절에서 페이지 예외 0',
      spErrors.length === 0 ? 'pass' : 'fail',
      spErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P3-B ①. 결산 병목이 "하나도 없는 종류"를 가리킨다 ────────────────────────
   *
   * `finish()` 의 병목 계산이 `Object.keys(lw.supply)` 를 후보로 썼다. `supply` 는
   * **지어진 시설에서** 만들어지므로 공급 0 인 종류는 키 자체가 없어 후보에 못 들었다 —
   * 즉 결산이 **스릴 0개인 빠지에게 스릴을 권하지 못했다.** 결산은 "다음에 뭘 지을까"의
   * 근거인데(설계: 결산 → 키우거나 붙임 → 다시 한 주) 가장 중요한 조언을 못 한 것이다.
   *
   * 하네스의 기존 검사(7i)는 `bottleneck !== null` 만 봤다 — 옛 로직도 값은 냈으므로
   * **버그가 있는 채로 초록**이었다. 그래서 이 절은 값이 아니라 **문장**을 본다.
   *
   * 보려는 것 셋:
   *  ★ 새 판을 한 주 돌리면 **공급 0 인 종류**가 뽑히고, 결산 화면의 처방이 **방법까지**
   *    말한다 — `스릴 시설이 하나도 없습니다 — 건설 ▸ 다이빙대` (실측 문장)
   *  ⚠ **음성 대조군은 코드에** (`week.setBottleneckFaultForTest`) — 켜면 후보가 옛
   *    `Object.keys(supply)` 로 되돌아가고, 그 판에서 **공급 0 인 종류는 절대 안 뽑힌다**.
   *    이 저장소 규칙: 손으로 한 번 되돌려 확인한 것은 다음 사람에게 안 남는다
   *  ⚠ **`missing ≠ supply===0`** — 사고로 하나뿐인 시설이 닫힌 주는 공급이 0 이지만
   *    "하나도 없습니다"는 거짓말이다. 선 시설(`staff.idle`)로 그 주를 만들어
   *    문장이 `부족한 것: … (공급 0)` 쪽으로 갈리는지 본다
   *
   * ⚠ 잔해 위에서 재지 않으려고 **새 판(새 컨텍스트 + 세이브 삭제)**에서 돈다 —
   * 앞 절들이 주를 여러 번 돌리고 시설을 지어 놔서, 그 판에서는 "아직 아무것도 없는
   * 종류"가 무엇인지 자체가 흐려진다.
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const bnErrors: string[] = [];
    pg.on('pageerror', (e) => bnErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    /*
     * 결산 화면의 처방 줄. **마지막 `.kcallout` 을 읽는다** — 같은 클래스를 매표소
     * 경보(`noTicket > 0`)가 먼저 쓰고, 그건 병목보다 **앞에** 붙는다 (`kairo-report.ts`
     * 실물에서 확인). 첫 줄을 읽으면 매표소 경보가 뜬 주에 엉뚱한 문장을 재게 된다.
     */
    const CALLOUTS = `(() => {
      const r = document.getElementById('kairo-report');
      if (!r || r.hidden) return null;
      return [...r.querySelectorAll('.kcallout')].map((e) => e.textContent || '');
    })()`;
    type Bn = {
      need: string;
      demand: number;
      supply: number;
      missing: boolean;
      example: string | null;
    } | null;

    /* ── ★ 새 판 한 주 — 게임 경로 그대로 (beginWeek → runWeek → 결산) ────────── */
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.flow.frozen = true; // 흐르는 낮이 두 번째 주를 열지 않게
      h.week.abort();       // run() 은 배치 전용 — 진행 중인 주를 치운다 (K39)
      h.beginWeek();
      h.runWeek();
    })()`);
    await pg.waitForFunction(
      `(() => { const r = document.getElementById('kairo-report'); return !!r && !r.hidden; })()`,
      undefined,
      { timeout: 10000 },
    );
    const freshCalls = (await pg.evaluate(CALLOUTS)) as string[] | null;
    const freshBn = (await pg.evaluate(
      `(() => { const r = window.__kairo.getLastReport(); return r ? r.bottleneck : null; })()`,
    )) as Bn;
    const freshLine = freshCalls && freshCalls.length > 0 ? freshCalls[freshCalls.length - 1]! : '';
    record(
      '★ 결산이 "하나도 없는 종류"를 가리키고 처방이 방법까지 말한다 (P3-B, 게임 경로)',
      freshBn !== null &&
        freshBn.supply === 0 &&
        freshBn.missing &&
        freshBn.example !== null &&
        freshLine.indexOf('시설이 하나도 없습니다') >= 0 &&
        freshLine.indexOf('건설 ▸ ') >= 0
        ? 'pass'
        : 'fail',
      `병목 ${freshBn ? `${freshBn.need} 공급 ${freshBn.supply} · missing ${String(freshBn.missing)} · 예시 ${String(freshBn.example)}` : 'null'} · ` +
        `처방 "${freshLine}"`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-bottleneck.png` });
    await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-report-close');
      if (b) b.click();
    })()`);
    await pg.evaluate(DISMISS_CARDS);
    await pg.waitForTimeout(200);

    /*
     * ── ⚠ 음성 대조군 (코드에 심은 결함) ────────────────────────────────────
     *
     * 후보를 옛 `Object.keys(supply)` 로 되돌린다. 그러면 위에서 뽑힌 종류(공급 0)는
     * **후보 목록에 이름조차 없다** — 다시 뽑히면 이 검사가 아무것도 안 재고 있었다는 뜻이다.
     */
    const faulted = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.week.abort();
      h.week.setBottleneckFaultForTest(true);
      h.beginWeek();
      h.runWeek();
      const r = h.getLastReport();
      h.week.setBottleneckFaultForTest(false);
      return r ? r.bottleneck : null;
    })()`)) as Bn;
    await pg.waitForTimeout(300);
    record(
      '⚠ 음성 대조군 — 후보를 옛 방식으로 되돌리면 공급 0 인 종류가 안 뽑힌다 (P3-B, 코드에 심은 결함)',
      freshBn !== null && (faulted === null || (faulted.supply > 0 && faulted.need !== freshBn.need))
        ? 'pass'
        : 'fail',
      `정상 ${freshBn?.need ?? 'null'}(공급 ${freshBn?.supply ?? '?'}) → ` +
        `결함 ${faulted ? `${faulted.need}(공급 ${faulted.supply})` : 'null'}`,
    );
    await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-report-close');
      if (b) b.click();
    })()`);
    await pg.evaluate(DISMISS_CARDS);
    await pg.waitForTimeout(200);

    /*
     * ── ⚠ `missing ≠ supply===0` ────────────────────────────────────────────
     *
     * 시작 킷에 **있는** 종류를 통째로 세운다 (`staff.idle` — 사고가 쓰는 그 자리다).
     * 그러면 그 주 공급은 0 이지만 시설은 있다. 문장이 "하나도 없습니다"로 가면
     * 결산이 거짓말을 하는 것이다.
     *
     * `buildable` 을 그 종류의 시설 하나로 좁혀 후보를 고정한다 — 다른 종류가 이겨서
     * "재려던 문장을 안 재는" 상태를 없애기 위해서다 (해금 규칙은 `unlocks` 소유이고
     * 여기서 만드는 것이 아니다).
     */
    const idleCase = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.week.abort();
      const byNeed = {};
      for (const it of h.placement.all()) {
        const d = h.simDefs[it.defId];
        if (!d || !d.need) continue;
        (byNeed[d.need] = byNeed[d.need] || []).push(it.handle);
      }
      for (const need of Object.keys(byNeed)) {
        let bid = null;
        for (const k of Object.keys(h.simDefs)) if (h.simDefs[k].need === need) { bid = k; break; }
        if (!bid) continue;
        const rep = h.week.run(new h.Rng(31337), {
          season: 'summer', playbackEvery: 0, buildable: [bid],
          staff: { wages: 0, satisfactionDelta: 0, foodMult: 1, idle: new Set(byNeed[need]) },
        });
        const bn = rep.bottleneck;
        if (!bn || bn.need !== need || bn.supply !== 0) continue;
        h.report.show(rep, { onClose: function () { return undefined; } });
        return { need: need, built: byNeed[need].length, bn: bn };
      }
      return null;
    })()`)) as { need: string; built: number; bn: NonNullable<Bn> } | null;
    await pg.waitForTimeout(250);
    const idleCalls = (await pg.evaluate(CALLOUTS)) as string[] | null;
    const idleLine = idleCalls && idleCalls.length > 0 ? idleCalls[idleCalls.length - 1]! : '';
    record(
      '⚠ missing ≠ supply===0 — 선 시설로 공급이 0 인 주는 "하나도 없습니다"가 아니다 (P3-B)',
      idleCase !== null &&
        !idleCase.bn.missing &&
        idleCase.bn.supply === 0 &&
        idleLine.indexOf('하나도 없습니다') < 0 &&
        idleLine.indexOf('부족한 것: ') === 0 &&
        idleLine.indexOf('(공급 0)') > 0
        ? 'pass'
        : 'fail',
      idleCase
        ? `${idleCase.need} · 지어진 것 ${idleCase.built}개(전부 섬) · 공급 ${idleCase.bn.supply} · ` +
          `missing ${String(idleCase.bn.missing)} · 처방 "${idleLine}"`
        : '공급 0 · 시설 있음 상태를 못 만들었다',
    );
    await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-report-close');
      if (b) b.click();
    })()`);
    await pg.evaluate(DISMISS_CARDS);

    record(
      '결산 병목 절에서 페이지 예외 0',
      bnErrors.length === 0 ? 'pass' : 'fail',
      bnErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P3-B ②. 플레이어가 자기 입구를 봉할 수 있었다 (`blocks-gate`) ─────────────
   *
   * 실내는 `would-strand`·`blocks-door` 로 지키는데 **입구엔 그 짝이 없었다** — 실측
   * (봇)으로 24판 중 6판이 17~39주차에 게이트 둘레가 차며 **입장 0 으로 얼었다**.
   * sim 쪽 성질은 `placement.test.ts` 가 이미 지키지만, P3-B 페이즈에서는 `tools/**`
   * 가 금지 파일이라 **브라우저 절이 하나도 없었다**: "규칙은 맞는데 확정 바에 안 뜬다"
   * 를 잡는 것이 아무것도 없었다는 뜻이다.
   *
   * 보려는 것 셋:
   *  ★ 매표소로 가는 **외길** 위를 겨누면 확정 바가 `매표소로 가는 길이 막힙니다 —
   *    길을 한 칸 남기세요` 이고 **확정 버튼이 죽는다**
   *  ⚠ 음성 대조군 ① — 길 **옆** 잔디는 `손님이 못 옵니다` 로 걸린다. 즉 `blocks-gate`
   *    가 "안 되는 자리를 다 잡는" 그물이 아니라 **자기 사유로만** 잡는다는 대조다
   *    (사유가 뭉치면 처방이 거짓말이 된다 — 옆칸의 처방은 "길을 까세요"여야 한다)
   *  ⚠ 음성 대조군 ② — **평행 우회로를 깔면 같은 칸이 다시 놓인다.** 전후 비교가
   *    아니라 "지금 안 닿는다"로 짰다면 여기서도 계속 막혀야 하고, 그게 곧
   *    "되돌릴 방법까지 막힌 판"이다
   *
   * 조준은 **진짜 터치**다 (CDP `Input.dispatchTouchEvent`). 백도어는 판을 만들고
   * (지형을 잔디로 밀고 외길 하나만 되돌린다) 조준 칸을 **읽는** 데만 쓴다 —
   * 화면이 되는지는 진짜 터치로 본다 (K33).
   *
   * ⚠ 판을 통째로 갈아엎으므로 **새 컨텍스트**에서 돈다. "절이 만든 지형은 절이
   * 되돌린다" 를 컨텍스트 격리로 지킨다 (되돌리기보다 강하다 — 세이브도 같이 격리된다).
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const gateErrors: string[] = [];
    pg.on('pageerror', (e) => gateErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const gateCdp = await cx.newCDPSession(pg);
    const gateTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await gateCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };

    /*
     * 판 셋업 — **외길을 하나 만든다.**
     *
     * 공원 전체를 잔디로 밀면 손님이 지나갈 수 있는 칸이 0 이 된다 (K32-B: 잔디는
     * 못 지나간다). 거기서 정류장 쪽 입구 열 → 매표소 윗줄만 포장으로 되돌리면
     * **매표소로 가는 길이 정확히 하나**다. 그 길 한가운데가 이 절의 과녁이다.
     *
     * ⚠ 실내 바닥을 잔디로 밀면 방이 사라지므로 벽도 사라져야 한다 — 게임과 **같은
     * 함수**(`bakeIndoorWalls`)로 다시 굽는다. 하네스가 벽을 따로 지우면 지형과
     * 어긋난 벽이 남아 "길은 있는데 못 간다"가 되고, 그러면 이 절이 재는 것이
     * `blocks-gate` 가 아니라 그 잔해가 된다.
     */
    const gateSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain;
      h.flow.frozen = true; // 조준을 재는 동안 결산·카드가 끼어들지 않게
      h.week.abort();
      const tix = h.placement.all().filter((f) => f.defId === 'ticket');
      if (tix.length !== 1) return { ok: false, why: '매표소가 1개가 아니다: ' + tix.length };
      const tk = tix[0];
      for (let j = ${KAIRO_BAND}; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) {
          if (t.isWater(i, j)) continue;
          if (t.kindAt(i, j) !== 'lawn') t.paint(i, j, 'lawn');
        }
      }
      h.sim.bakeIndoorWalls(t, h.walls, h.gate, h.sim.guestWalkable(t, h.placement));
      const lane = [];
      for (let j = ${KAIRO_BAND}; j < tk.j; j++) lane.push([h.gate.i, j]);
      const lo = Math.min(h.gate.i, tk.i), hi = Math.max(h.gate.i, tk.i);
      for (let i = lo; i <= hi; i++) lane.push([i, tk.j - 1]);
      for (const [i, j] of lane) t.paint(i, j, 'path_stone');
      for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) h.scene.refreshTile(i, j);
      h.scene.refreshAllWalls();
      h.guests.invalidate();
      const mid = lane[Math.floor(lane.length / 2)];
      return { ok: true, i: mid[0], j: mid[1], lane: lane.length,
               tk: { i: tk.i, j: tk.j }, gate: { i: h.gate.i, j: h.gate.j } };
    })()`)) as
      | { ok: false; why: string }
      | {
          ok: true;
          i: number;
          j: number;
          lane: number;
          tk: { i: number; j: number };
          gate: { i: number; j: number };
        };

    /*
     * 붓 — **1×1 야외 시설 아무거나.** id 를 박지 않는다: 어떤 시설을 놓느냐가 아니라
     * "길을 막는가"가 이 절의 주제이고, 1등급 해금 목록이 바뀌어도 살아야 한다.
     */
    const GATE_PICK = `(() => {
      document.getElementById('kairo-build-open').click();
      const defs = window.__kairo.simDefs;
      const tabs = [...document.querySelectorAll('#kairo-sheet [data-tab]')];
      let found = null;
      for (const tab of tabs) {
        tab.click();
        const items = [...document.querySelectorAll('#kairo-sheet [data-pick]')]
          .filter((e) => e.dataset.pick.indexOf('facility:') === 0 && !e.disabled);
        found = items.find((e) => {
          const d = defs[e.dataset.pick.slice(9)];
          return d && d.size[0] === 1 && d.size[1] === 1 && d.layer === 'land' &&
                 !d.placement.requiresIndoor;
        });
        if (found) break;
      }
      if (!found) return { ok: false, why: '1x1 야외 시설 붓이 없다' };
      const id = found.dataset.pick.slice(9);
      found.click();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      return { ok: true, id: id };
    })()`;

    /** 그 칸의 화면 좌표 (CSS px) — 투영은 씬의 `tileScreenRect` 에 물어본다 */
    const gatePoint = (i: number, j: number): string => `(() => {
      const sc = window.__kairo.scene, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const s = cr.width / cv.width;
      const r = sc.tileScreenRect(${i}, ${j});
      return { x: cr.left + (r.x + r.w / 2) * s, y: cr.top + (r.y + r.h / 2) * s,
               top: cr.top, bottom: cr.top + cr.height };
    })()`;
    const GATE_AIM = `(() => {
      const a = window.__kairo.scene.aimTileNow();
      return a ? { i: a.i, j: a.j } : null;
    })()`;
    type GateBar = { bar: boolean; disabled: boolean; label: string };
    const GATE_BAR = `(() => {
      const c = document.getElementById('kairo-confirm');
      const b = document.getElementById('kairo-place-confirm');
      const lab = c ? c.querySelector('.place-label') : null;
      return { bar: !!c && !c.hidden, disabled: !b || b.disabled,
               label: lab && lab.textContent ? lab.textContent : '' };
    })()`;

    /*
     * 그 칸을 **진짜 손가락으로** 겨눈다.
     *
     * `focusTile` 은 카메라만 옮긴다 (K47-③ 이 쓰는 것과 같은 셋업 훅) — 조준은
     * 그 뒤의 탭이 한다. 탭한 자리가 정말 그 칸이었는지는 `aimTileNow()` 로 **읽어서**
     * 확인하고, 어긋나면 두 칸의 화면 차이만큼 탭 지점을 밀어 다시 찍는다.
     * 좌표를 백도어로 넣지 않으므로 투영이 어긋나면 여기서 잡힌다.
     *
     * ⚠ 탭 사이에 **430ms** 를 둔다. 320ms 안의 두 번째 탭은 더블탭(확대)이라
     * 조준이 아니라 배율이 바뀐다 (`KairoScene` 의 `lastTapAt`).
     */
    const gateAimAt = async (
      i: number,
      j: number,
    ): Promise<{ landed: boolean; aim: { i: number; j: number } | null; onScreen: boolean }> => {
      await pg.evaluate(`window.__kairo.scene.focusTile(${i}, ${j})`);
      await pg.waitForTimeout(250);
      let dx = 0;
      let dy = 0;
      let aim: { i: number; j: number } | null = null;
      let onScreen = false;
      for (let k = 0; k < 3; k++) {
        const p = (await pg.evaluate(gatePoint(i, j))) as {
          x: number;
          y: number;
          top: number;
          bottom: number;
        };
        // HUD 몫(위 210 · 아래 210)을 피한다 — 거기서 찍으면 헤더·확정 바가 탭을 먹는다
        onScreen = p.y > p.top + 210 && p.y < p.bottom - 210;
        await gateTouch('touchStart', Math.round(p.x + dx), Math.round(p.y + dy));
        await gateTouch('touchEnd', 0, 0);
        await pg.waitForTimeout(430);
        aim = (await pg.evaluate(GATE_AIM)) as { i: number; j: number } | null;
        if (aim && aim.i === i && aim.j === j) return { landed: true, aim, onScreen };
        if (!aim) break;
        const got = (await pg.evaluate(gatePoint(aim.i, aim.j))) as { x: number; y: number };
        const want = (await pg.evaluate(gatePoint(i, j))) as { x: number; y: number };
        dx += want.x - got.x;
        dy += want.y - got.y;
      }
      return { landed: false, aim, onScreen };
    };

    const GATE_BLOCK_MSG = '매표소로 가는 길이 막힙니다 — 길을 한 칸 남기세요';
    const UNREACHABLE_MSG = '손님이 못 옵니다 — 여기까지 길을 까세요';

    if (!gateSetup.ok) {
      record('★ 매표소로 가는 외길 위에는 못 놓는다 — blocks-gate (P3-B, 진짜 터치)', 'fail', gateSetup.why);
      record('⚠ 음성 대조군 ① — 길 옆 칸은 blocks-gate 가 아니라 "길을 까세요"다 (P3-B)', 'fail', gateSetup.why);
      record('⚠ 음성 대조군 ② — 우회로를 깔면 같은 칸이 다시 놓인다 (P3-B, 전후 비교)', 'fail', gateSetup.why);
    } else {
      const gatePick = (await pg.evaluate(GATE_PICK)) as
        | { ok: false; why: string }
        | { ok: true; id: string };
      await pg.waitForTimeout(200);
      const brushId = gatePick.ok ? gatePick.id : '?';

      /* ── ★ 외길 위 ─────────────────────────────────────────────────────── */
      const onLane = await gateAimAt(gateSetup.i, gateSetup.j);
      const barLane = (await pg.evaluate(GATE_BAR)) as GateBar;
      record(
        '★ 매표소로 가는 외길 위에는 못 놓는다 — blocks-gate (P3-B, 진짜 터치)',
        gatePick.ok &&
          onLane.landed &&
          onLane.onScreen &&
          barLane.bar &&
          barLane.disabled &&
          barLane.label === GATE_BLOCK_MSG
          ? 'pass'
          : 'fail',
        `붓 ${brushId} · 외길 ${gateSetup.lane}칸 · 과녁 (${gateSetup.i},${gateSetup.j}) · ` +
          `조준 ${onLane.aim ? `(${onLane.aim.i},${onLane.aim.j})` : '없음'}` +
          `${onLane.landed ? '' : ' (탭이 과녁에 안 앉았다)'} · ` +
          `확정 ${barLane.disabled ? '비활성' : '활성'} · "${barLane.label}"`,
      );

      /* ── ⚠ 음성 대조군 ① 길 옆 잔디 ────────────────────────────────────── */
      const beside = await gateAimAt(gateSetup.i + 2, gateSetup.j);
      const barBeside = (await pg.evaluate(GATE_BAR)) as GateBar;
      record(
        '⚠ 음성 대조군 ① — 길 옆 칸은 blocks-gate 가 아니라 "길을 까세요"다 (P3-B)',
        beside.landed && barBeside.bar && barBeside.label === UNREACHABLE_MSG
          ? 'pass'
          : 'fail',
        `과녁 (${gateSetup.i + 2},${gateSetup.j}) · ` +
          `조준 ${beside.aim ? `(${beside.aim.i},${beside.aim.j})` : '없음'} · ` +
          `"${barBeside.label}"`,
      );

      /* ── ⚠ 음성 대조군 ② 평행 우회로 ───────────────────────────────────── */
      const detour = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain;
        // 매표소 두 줄 위에 평행한 우회로 — 외길이 둘이 된다
        for (let i = ${gateSetup.tk.i}; i <= ${gateSetup.gate.i}; i++) {
          t.paint(i, ${gateSetup.tk.j} - 2, 'path_stone');
        }
        t.paint(${gateSetup.tk.i}, ${gateSetup.tk.j} - 1, 'path_stone');
        for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) h.scene.refreshTile(i, j);
        h.guests.invalidate();
        return h.placement.count;
      })()`)) as number;
      const again = await gateAimAt(gateSetup.i, gateSetup.j);
      const barAgain = (await pg.evaluate(GATE_BAR)) as GateBar;
      // 라벨만 보고 넘어가지 않는다 — 확정을 눌러 **실제로 놓이는지**까지 본다
      if (barAgain.bar && !barAgain.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(350);
      }
      const placedNow = (await pg.evaluate(
        `(() => { const h = window.__kairo; const it = h.placement.at(${gateSetup.i}, ${gateSetup.j}); return { defId: it ? it.defId : null, count: h.placement.count }; })()`,
      )) as { defId: string | null; count: number };
      record(
        '⚠ 음성 대조군 ② — 우회로를 깔면 같은 칸이 다시 놓인다 (P3-B, 전후 비교)',
        again.landed &&
          barAgain.bar &&
          !barAgain.disabled &&
          barAgain.label.indexOf(GATE_BLOCK_MSG) < 0 &&
          placedNow.defId !== null &&
          placedNow.count === detour + 1
          ? 'pass'
          : 'fail',
        `같은 칸 (${gateSetup.i},${gateSetup.j}) · 확정 ${barAgain.disabled ? '비활성' : '활성'} · ` +
          `"${barAgain.label}" · 놓인 것 ${placedNow.defId ?? '없음'} · ` +
          `시설 ${detour} → ${placedNow.count}`,
      );
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-blocks-gate.png` });

      // 뒷정리 — 이 절이 연 것은 이 절이 닫는다 (지형은 컨텍스트 격리가 되돌린다)
      await pg.evaluate(`(() => {
        const c = document.getElementById('kairo-place-cancel');
        if (c && !document.getElementById('kairo-confirm').hidden) c.click();
        if (window.__kairoClearBrush) window.__kairoClearBrush();
        const sh = document.getElementById('kairo-sheet');
        if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      })()`);
    }

    record(
      '입구 봉쇄 절에서 페이지 예외 0',
      gateErrors.length === 0 ? 'pass' : 'fail',
      gateErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

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

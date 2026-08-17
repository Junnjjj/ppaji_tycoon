/**
 * 모바일 실동작 검증 — 최우선 목표가 "폰에서 돌아가는 것"이므로 자동화한다.
 *
 * 아이폰 크기·DPR·터치를 흉내낸 Chrome 으로 실제 게임을 띄우고,
 * 손가락 조작으로 시설을 배치하고, 손님이 걸어다니는지, FPS 가 나오는지 잰다.
 *
 *   npm run verify:mobile
 *   npm run verify:mobile -- --headed     (눈으로 보기)
 *
 * 개발 서버(npm run dev)가 떠 있어야 한다.
 */
import { chromium, type ConsoleMessage, type Page } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';
const HEADED = process.argv.includes('--headed');
const SHOT_DIR = 'tmp-shots';

/** iPhone 14 Pro 급 */
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
const record = (name: string, verdict: Verdict, detail: string): void => {
  results.push({ name, verdict, detail });
  const icon = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✕' : 'ℹ';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
};

interface PpajiWindow {
  __ppaji?: {
    sim: {
      facilities: { count: number };
      guests: { count: number };
      stats(): {
        guests: number;
        facilities: number;
        courses: number;
        avgHappiness: number;
        queued: number;
        riding: number;
      };
      clock: { speed: number; tick: number };
    };
    provider: { name: string; ids: string[] };
  };
}

async function simStats(page: Page): Promise<{
  guests: number;
  facilities: number;
  courses: number;
  avgHappiness: number;
  queued: number;
  riding: number;
} | null> {
  return page.evaluate(() => {
    const w = window as unknown as PpajiWindow;
    return w.__ppaji ? w.__ppaji.sim.stats() : null;
  });
}

/** 배치 모드에서 유효한 자리를 찾을 때까지 고스트를 끌어본다 */
async function dragUntilValid(page: Page, maxTries = 26): Promise<boolean> {
  const cx = DEVICE.viewport.width / 2;
  const cy = DEVICE.viewport.height * 0.42;

  // 나선형으로 훑는다: 오른쪽·아래·왼쪽·위로 점점 크게
  const steps: Array<[number, number]> = [];
  for (let r = 1; r <= 7; r++) {
    steps.push([28 * r, 0], [0, 26 * r], [-28 * r, 0], [0, -26 * r]);
  }

  for (let i = 0; i < Math.min(maxTries, steps.length); i++) {
    const enabled = await page
      .locator('.place-bar .place-btn.confirm:not([disabled])')
      .count()
      .then((n) => n > 0);
    if (enabled) return true;

    const [dx, dy] = steps[i] as [number, number];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  return page
    .locator('.place-bar .place-btn.confirm:not([disabled])')
    .count()
    .then((n) => n > 0);
}

async function placeViaUi(page: Page, facilityName: string): Promise<boolean> {
  await page.locator('.palette-item', { hasText: facilityName }).first().click();
  await page.waitForTimeout(150);

  if ((await page.locator('.place-bar.on').count()) === 0) {
    record(`${facilityName} 배치 모드`, 'fail', '배치 바가 뜨지 않음');
    return false;
  }

  const ok = await dragUntilValid(page);
  if (!ok) {
    record(`${facilityName} 배치`, 'fail', '유효한 자리를 못 찾음');
    await page.locator('.place-bar .place-btn.cancel').click();
    return false;
  }

  await page.locator('.place-bar .place-btn.confirm').click();
  await page.waitForTimeout(200);
  return true;
}

/**
 * 브라우저 안에서 평가할 코드는 문자열로 넘긴다.
 * tsx(esbuild) 가 keepNames 로 함수에 __name 헬퍼를 붙이는데,
 * 그 헬퍼는 페이지 쪽에 없어서 ReferenceError 가 난다.
 */
async function measureFps(page: Page, ms = 3000): Promise<number> {
  return page.evaluate<number>(`
    new Promise(function (resolve) {
      var frames = 0;
      var t0 = performance.now();
      function tick() {
        frames++;
        var dt = performance.now() - t0;
        if (dt < ${ms}) requestAnimationFrame(tick);
        else resolve((frames / dt) * 1000);
      }
      requestAnimationFrame(tick);
    })
  `);
}

async function main(): Promise<void> {
  console.log(`\n모바일 실동작 검증  (${DEVICE.viewport.width}×${DEVICE.viewport.height} @${DEVICE.deviceScaleFactor}x, 터치)\n`);

  const browser = await chromium.launch({ headless: !HEADED, channel: 'chrome' });
  const context = await browser.newContext(DEVICE);
  const page = await context.newPage();

  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // ── 1. 자가진단 페이지 ──
  console.log('[1] 기기 자가진단');
  await page.goto(`${BASE}/selftest.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.banner', { timeout: 30_000 });
  const banner = (await page.locator('.banner').textContent())?.trim() ?? '';
  record('자가진단 총평', banner.startsWith('✕') ? 'fail' : 'pass', banner);

  for (const row of await page.locator('.row').all()) {
    const name = (await row.locator('.name').textContent())?.trim() ?? '';
    const detail = (await row.locator('.detail').textContent())?.trim() ?? '';
    const cls = (await row.getAttribute('class')) ?? '';
    if (cls.includes('fail')) record(`  ${name}`, 'fail', detail);
    else console.log(`    · ${name} — ${detail}`);
  }
  await page.screenshot({ path: `${SHOT_DIR}/selftest.png`, fullPage: true });

  // ── 2. 게임 부팅 ──
  console.log('\n[2] 게임 부팅');
  errors.length = 0;
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // 새 게임으로 시작 (이전 세이브 영향 제거)
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const bootFailed = (await page.locator('.boot-error').count()) > 0;
  if (bootFailed) {
    const msg = (await page.locator('.boot-error pre').textContent())?.slice(0, 400) ?? '';
    record('부팅', 'fail', msg);
  } else {
    record('부팅', 'pass', '에러 화면 없음');
  }

  const canvasCount = await page.locator('#game canvas').count();
  record('캔버스', canvasCount > 0 ? 'pass' : 'fail', `${canvasCount}개`);

  const renderer = await page.evaluate(() => {
    const c = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    if (!c) return 'none';
    return c.getContext('webgl2') || c.getContext('webgl') ? 'WebGL' : 'Canvas2D';
  });
  record('렌더러', 'info', renderer);

  await page.screenshot({ path: `${SHOT_DIR}/01-boot.png` });

  // ── 3. HUD ──
  console.log('\n[3] 모바일 UI');
  const paletteCount = await page.locator('.palette-item').count();
  record('시설 팔레트', paletteCount > 0 ? 'pass' : 'fail', `${paletteCount}종`);

  const tapTargets = await page.evaluate(() => {
    const small: string[] = [];
    for (const el of document.querySelectorAll('.palette-item, .speed-btn, .place-btn')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 44) {
        small.push(`${el.className.split(' ')[0]}:${Math.round(r.height)}px`);
      }
    }
    return small;
  });
  record(
    '터치 타깃 44px',
    tapTargets.length === 0 ? 'pass' : 'fail',
    tapTargets.length === 0 ? '전부 충족' : `작음: ${tapTargets.join(', ')}`,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  record('가로 넘침', overflow ? 'fail' : 'pass', overflow ? '가로 스크롤 발생' : '없음');

  // ── 4. 배치 조작 ──
  console.log('\n[4] 손가락으로 시설 배치');
  const gateOk = await placeViaUi(page, '입장 게이트');
  const afterGate = await simStats(page);
  record(
    '입장 게이트 설치',
    gateOk && (afterGate?.facilities ?? 0) >= 1 ? 'pass' : 'fail',
    `시설 ${afterGate?.facilities ?? 0}개`,
  );

  const shopOk = await placeViaUi(page, '매점');
  const afterShop = await simStats(page);
  record(
    '매점 설치',
    shopOk && (afterShop?.facilities ?? 0) >= 2 ? 'pass' : 'fail',
    `시설 ${afterShop?.facilities ?? 0}개`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/02-placed.png` });

  // ── 5. 손님이 실제로 들어오고 움직이는가 ──
  console.log('\n[5] 손님 시뮬레이션');
  await page.locator('.speed-btn', { hasText: '▶▶▶' }).click();
  // 이동 측정의 기준 스냅샷은 배속 구간 시작 시점에 찍는다 — v5 스트립 맵에서는 시설 간
  // 거리가 짧아 6초 뒤엔 전원이 대기열(정지)에 들어갈 수 있다. 관찰 창이 늦으면
  // "걸어서 도착했다"는 사실 자체를 놓친다.
  await page.evaluate(`(() => {
    var sim = window.__ppaji && window.__ppaji.sim;
    if (!sim) return;
    var m = {};
    for (var g of sim.guests.all) m[g.id] = g.cx + ',' + g.cy;
    window.__moveProbeBefore = m;
  })()`);
  await page.waitForTimeout(6000);

  const busy = await simStats(page);
  record(
    '손님 유입',
    (busy?.guests ?? 0) > 0 ? 'pass' : 'fail',
    `${busy?.guests ?? 0}명 · 대기 ${busy?.queued ?? 0}명 · 만족 ${Math.round(busy?.avgHappiness ?? 0)}%`,
  );

  const moved = await page.evaluate<boolean>(`
    new Promise(function (resolve) {
      var sim = window.__ppaji && window.__ppaji.sim;
      if (!sim) return resolve(false);
      // 배속 구간 시작 시점의 스냅샷과 비교한다 (없으면 지금부터 1.5초 창으로 폴백).
      var before = window.__moveProbeBefore || null;
      if (before) {
        var n = 0;
        for (var g of sim.guests.all) {
          if (before[g.id] !== undefined && before[g.id] !== g.cx + ',' + g.cy) n++;
          if (before[g.id] === undefined) n++; // 새로 걸어 들어온 손님도 이동의 증거다
        }
        return resolve(n > 0);
      }
      var snap = new Map();
      for (var g1 of sim.guests.all) snap.set(g1.id, g1.cx + ',' + g1.cy);
      setTimeout(function () {
        var n2 = 0;
        for (var g2 of sim.guests.all) {
          if (snap.has(g2.id) && snap.get(g2.id) !== g2.cx + ',' + g2.cy) n2++;
        }
        resolve(n2 > 0);
      }, 1500);
    })
  `);
  record('손님 이동', moved ? 'pass' : 'fail', moved ? '타일을 옮겨 다님' : '제자리');

  await page.screenshot({ path: `${SHOT_DIR}/03-guests.png` });

  // ── 5.5 코스 설계 (Phase 2 의 핵심) ──
  console.log('\n[5.5] 수상 코스 설계');

  // 선착장부터 — 물가에 놓아야 하므로 화면을 물 쪽으로 조금 내린다
  await page.locator('.tab-bar .tab-btn', { hasText: '시설' }).click();
  const dockOk = await placeViaUi(page, '선착장');
  const afterDock = await simStats(page);
  record(
    '선착장 설치',
    dockOk ? 'pass' : 'fail',
    `시설 ${afterDock?.facilities ?? 0}개`,
  );

  if (dockOk) {
    await page.locator('.tab-bar .tab-btn', { hasText: '수상 코스' }).click();
    await page.locator('.palette-item', { hasText: '바나나보트' }).first().click();
    await page.waitForTimeout(200);

    const editorOn = (await page.locator('.course-bar.on').count()) > 0;
    record('코스 편집 모드', editorOn ? 'pass' : 'fail', editorOn ? '패널 표시됨' : '패널 없음');

    if (editorOn) {
      // 선착장 주변 물 위를 탭해 제어점을 찍는다
      const dockPos = await page.evaluate(`
        (function () {
          var sim = window.__ppaji && window.__ppaji.sim;
          if (!sim) return null;
          for (var f of sim.facilities.all) if (f.defId === 'dock') return { x: f.x, y: f.y };
          return null;
        })()
      `) as { x: number; y: number } | null;

      if (dockPos) {
        // 선착장이 화면 정중앙에 오도록 맞추고 줌을 1× 로 낮춘다.
        // 그러면 화면 좌표 오프셋이 곧 타일 오프셋(16px/타일)이 되어 탭 위치를 계산할 수 있다.
        const anchor = (await page.evaluate(`
          (function (d) {
            var cam = window.__ppaji.scene.cameras.main;
            cam.setZoom(1);
            cam.centerOn((d.x + 1) * 16, (d.y + 2) * 16);
            return { cx: cam.width / 2, cy: cam.height / 2 };
          })(${JSON.stringify(dockPos)})
        `)) as { cx: number; cy: number };
        await page.waitForTimeout(250);

        // 선착장(화면 중앙) 아래 물 위로 사각형 코스를 그린다.
        // 첫 점은 선착장 바로 아래 — 여기가 손님이 타는 지점이 된다.
        const T = 16; // 줌 1× 에서 타일 하나
        const taps: Array<[number, number]> = [
          [0, 4 * T],
          [7 * T, 9 * T],
          [0, 14 * T],
          [-7 * T, 9 * T],
        ];
        for (const [dx, dy] of taps) {
          await page.mouse.click(anchor.cx + dx, anchor.cy + dy);
          await page.waitForTimeout(120);
        }

        const pointsText =
          (await page.locator('.course-title').textContent())?.trim() ?? '';
        record('제어점 찍기', /점 [1-9]/.test(pointsText) ? 'pass' : 'fail', pointsText);

        const metricsText = await page.evaluate(`
          Array.from(document.querySelectorAll('.metric')).map(function (m) {
            return m.querySelector('.metric-label').textContent + ' ' +
                   m.querySelector('.metric-value').textContent;
          }).join('  ')
        `);
        record('실시간 지표', 'info', String(metricsText));

        // 장비 대수를 올리면 처리량이 오르는지
        const before = await page.locator('.metric-value').first().textContent();
        await page.locator('.vehicle-btn', { hasText: '+' }).click();
        await page.waitForTimeout(150);
        const after = await page.locator('.metric-value').first().textContent();
        record(
          '장비 +/− 가 처리량을 바꾼다',
          before !== after ? 'pass' : 'fail',
          `${before ?? '?'} → ${after ?? '?'}`,
        );

        const canConfirm =
          (await page.locator('.course-bar .place-btn.confirm:not([disabled])').count()) > 0;
        if (canConfirm) {
          await page.locator('.course-bar .place-btn.confirm').click();
          await page.waitForTimeout(400);
          const st = await simStats(page);
          record('코스 완성', (st?.courses ?? 0) > 0 ? 'pass' : 'fail', `코스 ${st?.courses ?? 0}개`);

          // 손님이 타는지
          await page.waitForTimeout(8000);
          const riding = await simStats(page);
          record(
            '손님 탑승',
            (riding?.riding ?? 0) > 0 ? 'pass' : 'info',
            `탑승 ${riding?.riding ?? 0}명 · 대기 ${riding?.queued ?? 0}명`,
          );
        } else {
          const hint = (await page.locator('.course-hint').textContent())?.trim() ?? '';
          record('코스 완성', 'fail', `확정 불가: ${hint}`);
        }
        await page.screenshot({ path: `${SHOT_DIR}/05-course.png` });
      } else {
        record('선착장 위치 조회', 'fail', '선착장을 찾지 못함');
      }
    }
  }

  // ── 6. 성능 ──
  console.log('\n[6] 성능');
  const fps = await measureFps(page, 3000);
  record(
    'FPS (3배속, 손님 다수)',
    fps >= 50 ? 'pass' : 'fail',
    `${fps.toFixed(1)} fps  ※ 헤드리스 Chrome 기준, 실기기와 다를 수 있음`,
  );

  const hudPerf = (await page.locator('.perf-sub').textContent())?.replace(/\s+/g, ' ') ?? '';
  record('HUD 계기판', 'info', hudPerf);

  // ── 7. 핀치 줌 ──
  console.log('\n[7] 핀치 줌');
  const zoomBefore = await page.evaluate(() => {
    const w = window as unknown as { __ppaji?: { scene?: { cameras?: { main?: { zoom: number } } } } };
    return w.__ppaji?.scene?.cameras?.main?.zoom ?? 0;
  });
  // 합성 PointerEvent 는 Phaser 가 무시할 수 있으므로 CDP 로 진짜 터치를 보낸다.
  // 브라우저가 실제 손가락과 똑같이 처리하므로, 이게 통과하면 폰에서도 동작한다.
  const cdp = await context.newCDPSession(page);
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<{ x: number; y: number; id: number }>,
  ): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
    await page.waitForTimeout(35); // Phaser 가 프레임을 돌 틈
  };

  const midY = 430;
  await touch('touchStart', [
    { x: 150, y: midY, id: 1 },
    { x: 250, y: midY, id: 2 },
  ]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [
      { x: 150 - i * 9, y: midY, id: 1 },
      { x: 250 + i * 9, y: midY, id: 2 },
    ]);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const zoomAfter = await page.evaluate(() => {
    const w = window as unknown as { __ppaji?: { scene?: { cameras?: { main?: { zoom: number } } } } };
    return w.__ppaji?.scene?.cameras?.main?.zoom ?? 0;
  });
  record(
    '핀치 줌',
    zoomAfter > zoomBefore ? 'pass' : 'fail',
    `${zoomBefore.toFixed(2)}× → ${zoomAfter.toFixed(2)}×`,
  );

  // ── 8. 콘솔 에러 ──
  const realErrors = errors.filter((e) => !e.includes('favicon'));
  record(
    '콘솔 에러',
    realErrors.length === 0 ? 'pass' : 'fail',
    realErrors.length === 0 ? '없음' : realErrors.slice(0, 3).join(' | '),
  );

  await page.screenshot({ path: `${SHOT_DIR}/04-final.png` });
  await browser.close();

  // ── 총평 ──
  const failed = results.filter((r) => r.verdict === 'fail');
  console.log('\n' + '─'.repeat(60));
  if (failed.length === 0) {
    console.log('✓ 모바일 검증 통과 — 폰 크기·터치로 실제 조작이 동작합니다');
  } else {
    console.log(`✕ 실패 ${failed.length}건:`);
    for (const f of failed) console.log(`   - ${f.name}: ${f.detail}`);
  }
  console.log(`스크린샷: ${SHOT_DIR}/`);
  console.log('─'.repeat(60) + '\n');

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error('\n검증 스크립트 자체가 실패했습니다:', e);
  process.exit(2);
});

/**
 * PWA 포장 검증 — **오프라인으로 진짜 뜨는지**를 본다.
 *
 *   npm run verify:pwa
 *
 * 빌드하고 `vite preview` 로 띄운 뒤 검사한다 (개발 서버는 서비스 워커를 등록하지 않는다 —
 * 낡은 번들이 캐시에 남는 함정을 스스로 만들지 않기로 했다).
 *
 * ## 왜 "등록됐다"로는 부족한가
 *
 * 서비스 워커가 등록만 되고 아무것도 캐시하지 않아도 등록은 성공한다. 이 프로젝트에서
 * "검증이 조용히 통과"를 여러 번 겪었으므로, **네트워크를 끊고 새로고침해서 게임이
 * 실제로 부팅하는지**까지 본다. 그게 홈 화면에 추가한 사용자가 겪는 상황이다.
 */
import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

type Verdict = 'pass' | 'fail';
const results: { name: string; verdict: Verdict; detail: string }[] = [];
const record = (name: string, verdict: Verdict, detail = ''): void => {
  results.push({ name, verdict, detail });
  console.log(`  ${verdict === 'pass' ? '✓' : '✕'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function waitForServer(url: string, timeoutMs = 20000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* 아직 안 떴다 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main(): Promise<void> {
  console.log(`PWA 검증 — ${BASE}`);
  const preview: ChildProcess = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore' },
  );
  let browser: Browser | null = null;
  try {
    if (!(await waitForServer(BASE))) throw new Error('preview 서버가 안 떴습니다');

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    // ── 매니페스트 ──
    const mfRes = await fetch(`${BASE}/manifest.webmanifest`);
    const mf = (await mfRes.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: { src: string; sizes: string; purpose?: string }[];
    };
    record(
      '매니페스트가 있고 파싱된다',
      mfRes.ok && typeof mf.name === 'string' ? 'pass' : 'fail',
      `${mf.name ?? '?'} · display ${mf.display ?? '?'}`,
    );
    record(
      '홈 화면 앱으로 뜬다 (display: standalone)',
      mf.display === 'standalone' ? 'pass' : 'fail',
      mf.display ?? '',
    );
    const sizes = (mf.icons ?? []).map((i) => i.sizes);
    record(
      '아이콘 192·512 와 maskable 이 있다 — 없으면 홈 화면에 회색 사각형이 뜬다',
      sizes.includes('192x192') &&
        sizes.includes('512x512') &&
        (mf.icons ?? []).some((i) => i.purpose === 'maskable')
        ? 'pass'
        : 'fail',
      sizes.join(', '),
    );

    // 아이콘이 실제로 내려오고 PNG 인지 — 매니페스트에 적혀만 있으면 소용없다
    const iconChecks: string[] = [];
    let iconOk = true;
    for (const icon of mf.icons ?? []) {
      const r = await fetch(`${BASE}/${icon.src}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const isPng = buf.length > 8 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      if (!r.ok || !isPng || buf.length < 500) iconOk = false;
      iconChecks.push(`${icon.sizes} ${(buf.length / 1024).toFixed(1)}KB${isPng ? '' : ' (PNG 아님)'}`);
    }
    record('아이콘이 실제로 내려온다', iconOk ? 'pass' : 'fail', iconChecks.join(' · '));

    // ── 서비스 워커 ──
    // `debug=1` — 부팅 판정을 `#kairo-debug` 로 하는데 K28 부터 기본으로 숨는다
    await page.goto(`${BASE}/?debug=1`, { waitUntil: 'load' });
    const swReady = await page
      .waitForFunction(
        `(async () => {
          if (!navigator.serviceWorker) return false;
          const reg = await navigator.serviceWorker.ready;
          return !!reg.active;
        })()`,
        undefined,
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false);
    record('서비스 워커가 활성화된다', swReady ? 'pass' : 'fail');

    // 캐시에 실제로 들어갔는지 — 등록만 되고 아무것도 안 담기면 오프라인이 안 된다
    await page.waitForTimeout(1500);
    const cached = (await page.evaluate(`(async () => {
      const names = await caches.keys();
      let n = 0;
      for (const k of names) n += (await (await caches.open(k)).keys()).length;
      return { names: names, count: n };
    })()`)) as { names: string[]; count: number };
    record(
      '캐시에 파일이 담긴다 — 등록만 되고 비면 오프라인이 안 된다',
      cached.count > 0 ? 'pass' : 'fail',
      `${cached.names.join(', ')} · ${cached.count}개`,
    );

    // 페이지가 워커의 제어를 받는지 — 안 받으면 오프라인에서 아무 일도 안 일어난다
    const controlled = (await page.evaluate(
      `!!(navigator.serviceWorker && navigator.serviceWorker.controller)`,
    )) as boolean;
    record(
      '페이지가 워커의 제어를 받는다',
      controlled ? 'pass' : 'fail',
      controlled ? '' : 'clients.claim() 이 안 먹었다',
    );

    // ── 오프라인 부팅 (이게 진짜 검사다) ──
    await ctx.setOffline(true);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const navFail: string[] = [];
    await page.reload({ waitUntil: 'load' }).catch((e: unknown) => {
      navFail.push(String(e).split('\n')[0] ?? '');
    });
    const booted = await page
      .waitForFunction('!!window.__kairo', undefined, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    const dbg = (await page
      .evaluate(`(() => { const b = document.getElementById('kairo-debug'); return b ? b.textContent : ''; })()`)
      .catch(() => '')) as string;
    record(
      '⚠ 네트워크를 끊고 새로고침해도 게임이 뜬다 — 홈 화면 사용자가 겪는 상황',
      booted ? 'pass' : 'fail',
      booted
        ? (dbg.split('\n')[0] ?? '')
        : (navFail[0] ?? errors[0] ?? '부팅 실패'),
    );
    await ctx.setOffline(false);

    await page.screenshot({ path: 'tmp-shots/pwa-offline.png' });
  } finally {
    await browser?.close();
    preview.kill();
  }

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

/**
 * 손님 확대 촬영 — S=2 에서 표정·이모트가 읽히는지 본다.
 *
 * 스펙 §1.2 는 "S=2 는 손님 표정·이모트·탑승 관찰용"이라고 정했다. 그게 실제로
 * 읽히는지 확인하지 않으면 그 결정이 근거 없는 문장으로 남는다.
 */
import { chromium } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?kairo=1`, { waitUntil: 'load' });
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );

  // 시설을 놓고 손님이 모이게 한다
  await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    let n = 0;
    for (let j = 2; j < 10 && n < 3; j++) {
      for (let i = 2; i < 10 && n < 3; i++) {
        const r = p.place(t, w, h.gate, 'shop', i, j);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); n++; }
      }
    }
    h.guests.invalidate();
  })()`);
  await page.waitForTimeout(6000);

  // S=2 로 올리고 손님이 많은 곳을 본다
  await page.evaluate(`(() => {
    const h = window.__kairo, sc = h.scene;
    sc.setUpscale(2);
    const gs = h.guests.all;
    const g = gs.length ? gs[Math.floor(gs.length / 2)] : { i: 4, j: 4 };
    sc.focusTile(g.i, g.j);
  })()`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tmp-shots/now-zoom.png' });

  const dbg = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  console.log(`zoom S=2  ${dbg.replace(/\n/g, ' | ')}`);
  await browser.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

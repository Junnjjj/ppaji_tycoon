/**
 * 카이로 씬 스크린샷 — 폰 세로 + 가로 둘 다 찍는다.
 *
 * ⚠ 지형을 건드렸으면 **가로도 반드시 찍을 것.** 세로만 보고 물이 육지를 덮는 버그를
 * 놓친 적이 있다 (기록된 함정).
 *
 *   npm run shot:kairo
 */
import { chromium } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const shots: [string, number, number, number][] = [
    ['portrait', 393, 852, 3],
    ['landscape', 852, 393, 3],
  ];
  for (const [name, w, h, dpr] of shots) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: dpr,
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
    await page.waitForTimeout(600);
    await page.screenshot({ path: `tmp-shots/now-${name}.png` });
    const dbg = (await page.evaluate(
      `document.getElementById('kairo-debug').textContent`,
    )) as string;
    console.log(`${name} ${w}×${h}@${dpr}  ${dbg.replace(/\n/g, ' | ')}`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

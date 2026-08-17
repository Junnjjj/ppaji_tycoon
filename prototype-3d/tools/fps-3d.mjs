// prototype-3d FPS 측정
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const fps = await page.evaluate(`new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(n / 3); };
  requestAnimationFrame(tick);
})`);
console.log('fps:', fps);
await browser.close();

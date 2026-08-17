// prototype-3d 스크린샷 — node shot-3d.mjs <출력이름.png>
import { chromium } from 'playwright';

const out = process.argv[2] || 'shot.png';
const dot = process.argv[3] || '2';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
});
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5175/?dot=${dot}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `shots/${out}` });
await browser.close();
console.log('saved shots/' + out);

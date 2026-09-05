/**
 * 스크린샷 콘택트 시트 — 사람이 「PSS 처럼 보이나」를 볼 때. 판정은 없다 (G12).
 * 홈 → 각 창을 진짜 탭으로 열어 `tmp-shots/route-*.png` 로 남기고, 한 장짜리 `contact.png` 도 굽는다.
 * dev 서버(5187)가 떠 있어야 한다. `PJ_URL` 로 바꿀 수 있다.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env['PJ_URL'] ?? 'http://localhost:5187';
mkdirSync('tmp-shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${BASE}/?debug=1&fresh=1&tut=0`, { waitUntil: 'load' });
await page.waitForFunction(`(() => (document.getElementById('wp-debug')?.textContent || '').includes('FPS'))()`, undefined, { timeout: 15000 });
await page.waitForTimeout(800);
// 볼 게 있는 판 — 풀 하나·아이템·시설 몇 개 (API). 시간은 얼린다
await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.flow.frozen = true; const gt = g.gate; const t = []; for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) t.push({ i: gt.i - 6 + a, j: gt.j - 5 + b }); g.money += 20000; g.digPool(t); const p = g.pools.all[0]; if (p) { g.unlocked.items.add('strawberry'); g.putItem(p.id, 'strawberry'); } g.placeFacility('toilet', gt.i + 3, gt.j - 4, 0); g.placeFacility('pyeongsang_row', gt.i - 8, gt.j - 2, 0); w.skip(1); w.refreshHud(); })()`);
await page.waitForTimeout(400);

const routes: { id: string; open: string[]; close: string }[] = [
  { id: 'home', open: [], close: '' },
  { id: 'build', open: ['#hud-right [data-cell="build"]'], close: '#win-build .kwin-close' },
  { id: 'pool', open: ['#hud-right [data-cell="pool"]'], close: '#dock-pool-cancel' },
  { id: 'sns', open: ['#hud-right [data-cell="sns"]'], close: '#win-sns .kwin-close' },
  { id: 'cook', open: ['#hud-right [data-cell="cook"]'], close: '#win-cook .kwin-close' },
  { id: 'shop', open: ['#hud-right [data-cell="shop"]'], close: '#win-shop .kwin-close' },
  { id: 'rank', open: ['#hud-info'], close: '#win-rank .kwin-close' },
  { id: 'menu', open: ['#hud-menu'], close: '#win-menu-main .kwin-close' },
  { id: 'cert', open: ['#hud-menu', '#win-menu-main [data-menu="cert"]'], close: '#win-cert .kwin-close' },
  { id: 'invest', open: ['#hud-menu', '#win-menu-main [data-menu="invest"]'], close: '#win-invest .kwin-close' },
  { id: 'campaign', open: ['#hud-menu', '#win-menu-main [data-menu="campaign"]'], close: '#win-campaign .kwin-close' },
];
const tapSel = async (sel: string): Promise<boolean> => {
  const c = (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(e).display === 'none') return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)) as { x: number; y: number } | null;
  if (!c) return false;
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForTimeout(280);
  return true;
};
const shots: string[] = [];
for (const r of routes) {
  let ok = true;
  for (const sel of r.open) ok = (await tapSel(sel)) && ok;
  const file = `tmp-shots/route-${r.id}.png`;
  await page.screenshot({ path: file });
  shots.push(file);
  console.log(`${ok ? '  ' : '?!'} ${file}`);
  if (r.close) await tapSel(r.close);
  // 열린 것이 남아 있으면 메뉴 창까지 닫는다
  await tapSel('#win-menu-main .kwin-close');
}
// 콘택트 시트 — 4열 그리드 한 장 (브라우저 캔버스로 굽는다)
const dataUrls = await Promise.all(shots.map(async (f) => `data:image/png;base64,${(await import('node:fs')).readFileSync(f).toString('base64')}`));
const sheet = await page.evaluate(`(async (urls) => { const cols = 4, w = 393, h = 852, s = 0.5; const rows = Math.ceil(urls.length / cols); const c = document.createElement('canvas'); c.width = cols * w * s; c.height = rows * h * s; const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < urls.length; k++) { const im = new Image(); im.src = urls[k]; await im.decode(); g.drawImage(im, (k % cols) * w * s, Math.floor(k / cols) * h * s, w * s, h * s); }
  return c.toDataURL('image/png'); })(${JSON.stringify(dataUrls)})`) as string;
(await import('node:fs')).writeFileSync('tmp-shots/contact.png', Buffer.from(sheet.split(',')[1] ?? '', 'base64'));
console.log('tmp-shots/contact.png');
await browser.close();

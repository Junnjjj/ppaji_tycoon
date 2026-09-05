import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const OUT = process.argv[2] as string;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e)));
const shot = async (name: string): Promise<void> => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const tap = async (sel: string): Promise<void> => { await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); })()`); await wait(300); };
for (const d of [32, 64, 127]) {
  const json = readFileSync(`${OUT}/save-d${d}.json`, 'utf8');
  await page.goto('http://100.114.231.15:5189/?debug=1&px=1&fresh=1&tut=0', { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 20000 });
  await page.evaluate(`localStorage.setItem('pj.save', ${JSON.stringify(json)})`);
  await page.goto('http://100.114.231.15:5189/?debug=1&px=1&tut=0&celebrate=1', { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 20000 });
  await wait(800);
  const info = await page.evaluate(`(() => { const g = window.__pj.game; return { day: g.day, rank: g.rank, money: g.money, land: g.land.w + 'x' + g.land.h, pools: g.pools.all.length, fac: g.facilities.all.length }; })()`);
  console.log('d', d, JSON.stringify(info));
  await page.evaluate(`window.__pj.skip(500)`); await wait(500);
  await shot(`t${d}-home`);
  await tap('#hud-info'); await shot(`t${d}-rank`); await tap('#win-rank .kwin-close');
  await page.evaluate(`window.__pj.snsWin.show('friends')`); await wait(300); await shot(`t${d}-friends`); await tap('#win-sns .kwin-close');
  await page.evaluate(`window.__pj.certWin.show()`); await wait(300); await shot(`t${d}-cert`); await tap('#win-cert .kwin-close');
  await page.evaluate(`window.__pj.shopWin.show()`); await wait(300); await shot(`t${d}-shop`); await tap('#win-shop .kwin-close');
  const pid = await page.evaluate(`(() => { const w = window.__pj; const ps = w.game.pools.all.slice().sort((a, b) => b.tiles.length - a.tiles.length); if (ps[0]) { w.poolInfo.show(ps[0].id); return ps[0].id; } return null; })()`);
  if (pid !== null) { await wait(300); await shot(`t${d}-pool`); await tap('#win-pool .kwin-close'); }
  if (d === 127) { await page.evaluate(`(() => { const w = window.__pj; w.resultsCtl.enabled = true; w.skip(w.TPD * 2); })()`); await wait(1500); await shot('t127-ending'); }
}
console.log('pageerrors', JSON.stringify(errs));
await browser.close();

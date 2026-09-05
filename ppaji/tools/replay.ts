/**
 * 재플레이 (P2) — 「하네스 초록 ≠ 눈 초록」의 눈 쪽. 두 벌:
 *   --stage early : 새 판(시작 킷 그대로)에서 주요 화면을 실제 브라우저로 찍는다
 *   --stage late  : 봇을 헤드리스로 32·64·127일 돌린 스냅샷을 세이브(`pj.save`)에 넣고 3·5·8년차 화면을 찍는다
 * dev 서버(5187)가 떠 있어야 한다. `PJ_URL` 로 바꿀 수 있다. 결과는 tmp-shots/replay/<stage>/*.png (gitignored).
 * 판정은 없다 — 사람이(또는 다음 세션이) 본다. 찾은 결함은 계획 §7 에 적는다.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { runBot } from '../src/sim/bot.js';

const BASE = process.env['PJ_URL'] ?? 'http://localhost:5187';
const stage = process.argv[process.argv.indexOf('--stage') + 1] ?? 'early';
const OUT = `tmp-shots/replay/${stage}`;
mkdirSync(OUT, { recursive: true });
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e)));
const shot = async (name: string): Promise<void> => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', `${OUT}/${name}.png`); };
const tap = async (sel: string): Promise<void> => { await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); })()`); await wait(300); };

const screens = async (prefix: string): Promise<void> => {
  await shot(`${prefix}-home`);
  { const perf = (await page.evaluate(`(() => { const w = window.__pj; return { objects: w.scene.children.list.length, guests: w.game.guests.count, facilities: w.game.facilities.all.length }; })()`)) as { objects: number; guests: number; facilities: number }; /* 성능 지표 — 8년차 판 객체 수 (지형 3,072 + 시설·손님) */ console.log('perf', prefix, JSON.stringify(perf)); }
  // P18 저녁 — 18:43 까지 감아 틴트·조명·불멍·「· 저녁」 헤더를 찍는다 (그 뒤 절은 저녁 상태로 이어진다)
  await page.evaluate(`(() => { const w = window.__pj; const g = w.game; if (g.tick < 1500) w.skip(1500 - g.tick); w.refreshHud(); })()`); await wait(600); await shot(`${prefix}-evening`);
  await page.evaluate(`(() => { const w = window.__pj; const gt = w.game.gate; w.scene.focusTile(gt.i, gt.j + 14, 0); })()`); await wait(400); await shot(`${prefix}-river`);
  await page.evaluate(`window.__pj.dock.enter('deck')`); await wait(300); await shot(`${prefix}-zone-dock`); await page.evaluate(`window.__pj.dock.exit()`);
  await page.evaluate(`window.__pj.buildWin.show()`); await wait(300); await shot(`${prefix}-build`); await tap('#win-build .kwin-close');
  await page.evaluate(`window.__pj.snsWin.show('friends')`); await wait(300); await shot(`${prefix}-sns`); await tap('#win-sns .kwin-close');
  await page.evaluate(`window.__pj.certWin.show()`); await wait(300); await shot(`${prefix}-cert`); await tap('#win-cert .kwin-close');
  await tap('#hud-info'); await shot(`${prefix}-rank`); await tap('#win-rank .kwin-close');
  const pid = (await page.evaluate(`(() => { const w = window.__pj; const ps = w.game.pools.all.slice().sort((a, b) => b.tiles.length - a.tiles.length); if (ps[0]) { w.poolInfo.show(ps[0].id); return ps[0].id; } return null; })()`)) as number | null;
  if (pid !== null) { await wait(300); await shot(`${prefix}-pool`); await tap('#win-pool .kwin-close'); }
  await page.evaluate(`window.__pj.mainMenu.show()`); await wait(300); await shot(`${prefix}-menu`); await tap('#win-menu-main .kwin-close');
};

if (stage === 'early') {
  await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0`, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__pj', null, { timeout: 20000 });
  await wait(600);
  await page.evaluate(`window.__pj.skip(700)`); await wait(500);
  await screens('e');
} else {
  for (const days of [32, 64, 127]) {
    const g = new Game(3);
    runBot(g, days);
    const json = JSON.stringify({ version: 2, savedAt: '2026-01-01T00:00:00.000Z', game: g.toSnapshot() });
    writeFileSync(`${OUT}/save-d${days}.json`, json);
    await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0`, { waitUntil: 'load' });
    await page.waitForFunction('!!window.__pj', null, { timeout: 20000 });
    await page.evaluate(`localStorage.setItem('pj.save', ${JSON.stringify(json)})`);
    await page.goto(`${BASE}/?debug=1&px=1&tut=0&celebrate=1`, { waitUntil: 'load' });
    await page.waitForFunction('!!window.__pj', null, { timeout: 20000 });
    await wait(800);
    await page.evaluate(`window.__pj.skip(400)`); await wait(500);
    console.log('day', days, JSON.stringify(await page.evaluate(`(() => { const g = window.__pj.game; return { day: g.day, rank: g.rank, money: g.money, pools: g.pools.all.map((p) => p.tiles.length), fac: g.facilities.all.length }; })()`)));
    await screens(`d${days}`);
  }
}
console.log('pageerrors', JSON.stringify(errs));
await browser.close();

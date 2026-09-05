import { chromium } from 'playwright';
const OUT = process.argv[2] as string;
const BASE = 'http://100.114.231.15:5189';
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const touch = async (x: number, y: number): Promise<void> => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const center = async (sel: string): Promise<{ x: number; y: number } | null> => (await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number } | null;
const tap = async (sel: string): Promise<boolean> => { const c = await center(sel); if (!c) { console.log('no', sel); return false; } await touch(c.x, c.y); await wait(350); return true; };
const shot = async (name: string): Promise<void> => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const log: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') log.push(m.text()); });
await page.goto(`${BASE}/?debug=1&px=1&fresh=1&tut=0`, { waitUntil: 'load' });
await page.waitForFunction('!!window.__pj', null, { timeout: 20000 });
await wait(800);
await shot('r0-home');
// 1. 풀 → 아이템 → 딸기 → 미리보기
await tap('#hud-right [data-cell="pool"]');
await tap('#dock-pool .ktab[data-mode="item"]');
await tap('#dock-pool [data-item="strawberry"]');
await shot('r1-item-preview');
const pv = await page.evaluate(`[...document.querySelectorAll('#dock-pool-preview .kprev-row')].map((r) => r.textContent)`);
console.log('preview', JSON.stringify(pv));
await tap('#dock-pool-put');
await shot('r2-item-put');
await tap('#dock-pool-cancel');
// 2. 시설 정보 → 이동 (도구 없음/있음)
const fac = (await page.evaluate(`(() => { const w = window.__pj; const f = w.game.facilities.all[0]; w.scene.focusTile(f.i, f.j, 0); return { uid: f.uid, i: f.i, j: f.j }; })()`)) as { uid: number; i: number; j: number };
await wait(500);
const at = (await page.evaluate(`(() => { const w = window.__pj; const f = w.game.facilities.byUid(${fac.uid}); const c = w.scene.tileScreen ? w.scene.tileScreen(f.i, f.j) : null; return c; })()`)) as { x: number; y: number } | null;
if (at) await touch(at.x, at.y); else await touch(196, 380);
await wait(400);
const facUp = await page.evaluate(`!document.getElementById('win-facility').hidden`);
console.log('facility window up', facUp, JSON.stringify(at));
if (!facUp) { await page.evaluate(`window.__pj.facilityInfo.show(${fac.uid})`); await wait(300); }
await shot('r3-facility-locked');
await tap('#win-facility .kwin-close');
await page.evaluate(`window.__pj.game.tools.add('move'); window.__pj.facilityInfo.show(${fac.uid})`);
await wait(300);
await tap('#win-facility-move');
await shot('r4-move-dock');
await page.evaluate(`window.__pj.placeDock.aimAt(${fac.i + 3}, ${fac.j})`);
await wait(300);
await shot('r5-move-aim');
await tap('#dock-place-done');
await shot('r6-moved');
// 3. 정보 캡슐 → 수집
await tap('#hud-info');
await shot('r7-rank-collect');
await page.evaluate(`document.querySelector('#win-rank .kwin-body').scrollTop = 9999`);
await wait(200);
await shot('r8-rank-collect-bottom');
await tap('#win-rank .kwin-close');
// 4. 신문 축하
await page.evaluate(`(() => { const w = window.__pj; const g = w.game; w.interruptBudget.reset(); g.inbox.push({ tick: g.tick, day: g.day, kind: 'system', priority: 'modal', title: '랭크 업! ★1 동네 풀장', body: '손님이 더 많이 온다. 상점에 신상이 들어왔다.' }); w.skip(1); })()`);
await wait(1200);
await shot('r9-newspaper');
await tap('#win-celebrate-ok');
// 5. 요리 창
await page.evaluate(`window.__pj.game.cooking.exp = 99999; window.__pj.cookWin.show()`);
await wait(400);
await shot('r10-cook-chips');
await tap('#win-cook .kwin-close');
console.log('console errors', JSON.stringify(log));
await browser.close();

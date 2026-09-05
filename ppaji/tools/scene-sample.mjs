// 표본 파크 스크린샷 (G14) — 풀·시설 20종·손님을 API 로 놓고 S1/S2 로 찍는다. dev 서버 필요. 판정 없음
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto('http://localhost:5187/?debug=1&fresh=1&tut=0', { waitUntil: 'load' });
await p.waitForFunction(`(() => (document.getElementById('wp-debug')?.textContent || '').includes('FPS'))()`, undefined, { timeout: 15000 });
await p.evaluate(`(() => { const w = window.__pj; const g = w.game; const gt = g.gate; g.money += 300000; for (const id of w.facilityDefs.keys()) g.unlocked.facilities.add(id); g.unlocked.items.add('strawberry');
  const t = []; for (let a = 0; a < 5; a++) for (let c = 0; c < 4; c++) t.push({ i: gt.i - 6 + a, j: gt.j - 8 + c }); g.digPool(t);
  const put = (id, di, dj, f = 0) => g.placeFacility(id, gt.i + di, gt.j + dj, f);
  put('toilet', 3, -3); put('shower_row', 4, -3); put('pyeongsang_row', -8, -7); put('pyeongsang_row', -8, -6); put('ticket', -8, -5); put('cafe', 2, -9); put('vending_in', 4, -9); put('shop', 6, -9);
  put('stripy_slide', -3, -13); put('slide_small', 0, -2); put('diving', -2, -3); put('footbath', 0, -4); put('caravan', 1, -6); put('dj_booth', -1, 0); put('sunflower', 5, -5); put('fountain', 6, -5); put('vending_out', 7, -3); put('bungalow', -6, 1); put('footvolley', 6, -7, 1); put('pool_warm', -9, -3);
  g.day = 5; g.tick = 240; w.flow.frozen = false; })()`);
await p.waitForTimeout(5000);
await p.evaluate(`(() => { const w = window.__pj; w.flow.frozen = true; w.refreshHud(); })()`);
await p.screenshot({ path: 'tmp-shots/scene-s1.png' });
await p.evaluate(`(() => { const w = window.__pj; w.camera.setUpscale(2); if (w.scene.setUpscale) w.scene.setUpscale(2); })()`);
await p.waitForTimeout(400);
await p.screenshot({ path: 'tmp-shots/scene-s2.png' });
await b.close();

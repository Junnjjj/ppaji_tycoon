// 표본 파크 스크린샷 (G14) — 풀·시설 20종·손님을 API 로 놓고 S1/S2 로 찍는다. dev 서버 필요. 판정 없음
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto('http://localhost:5177/?debug=1&fresh=1&tut=0', { waitUntil: 'load' });
await p.waitForFunction(`(() => (document.getElementById('wp-debug')?.textContent || '').includes('FPS'))()`, undefined, { timeout: 15000 });
await p.evaluate(`(() => { const w = window.__wp; const g = w.game; const gt = g.gate; g.money += 300000; for (const id of w.facilityDefs.keys()) g.unlocked.facilities.add(id); g.unlocked.items.add('strawberry');
  const t = []; for (let a = 0; a < 5; a++) for (let c = 0; c < 4; c++) t.push({ i: gt.i - 6 + a, j: gt.j - 8 + c }); g.digPool(t);
  const put = (id, di, dj, f = 0) => g.placeFacility(id, gt.i + di, gt.j + dj, f);
  put('toilet', 3, -3); put('shower', 4, -3); put('deck_chair', -8, -7); put('deck_chair', -8, -6); put('yellow_parasol', -8, -5); put('cafe', 2, -9); put('ramen_stall', 4, -9); put('ice_cream_van', 6, -9);
  put('stripy_slide', -3, -13); put('palm_tree', 0, -2); put('jetted_pool', -2, -3); put('hot_tub', 0, -4); put('table_4', 1, -6); put('fountain', -1, 0); put('sunflower', 5, -5); put('flower_bed', 6, -5); put('vending_machine', 7, -3); put('cabana', -6, 1); put('burger_joint', 6, -7, 1); put('blue_comfy_chair', -9, -3);
  g.day = 5; g.tick = 240; w.flow.frozen = false; })()`);
await p.waitForTimeout(5000);
await p.evaluate(`(() => { const w = window.__wp; w.flow.frozen = true; w.refreshHud(); })()`);
await p.screenshot({ path: 'tmp-shots/scene-s1.png' });
await p.evaluate(`(() => { const w = window.__wp; w.camera.setUpscale(2); if (w.scene.setUpscale) w.scene.setUpscale(2); })()`);
await p.waitForTimeout(400);
await p.screenshot({ path: 'tmp-shots/scene-s2.png' });
await b.close();

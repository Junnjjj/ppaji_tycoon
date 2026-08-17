// 인접 배치 진단 — node tools/shot-adjacent.mjs
//
// 보려는 것은 두 가지다:
//   ① 같은 발자국끼리 **화면 크기가 같은가** (2×2 다섯 종을 한 줄로)
//   ② **접지선이 한 줄로 맞는가** (같은 타일 행이면 밑변이 같은 높이)
// 그래서 x 로 붙인 한 줄만 보지 말고 z 로도 한 줄 더 놓는다 — 두 축의 겹침을 다 본다.
//
// ⚠ 줌을 3.2 로 조이면 건물 두세 채밖에 안 들어와 정렬을 판정할 수 없다 (실측).
//   판정용 오버뷰(줌 1.7)와 확대 크롭(줌 3.0) 두 장을 찍는다.
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
await p.goto('http://localhost:5175/?dot=2', { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);

const frame = (zoom, txTile) => `(() => {
  const cam = window.__d3.camera;
  const tx = -96 + ${txTile} * 6, ty = 6, tz = -90 + 1.5 * 6;
  const m = cam.matrixWorld.elements;
  const pitch = Math.asin(m[9]), yaw = Math.atan2(-m[8], m[10]);
  const d = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(yaw)*d*Math.cos(pitch), ty + d*Math.sin(pitch), tz + Math.cos(yaw)*d*Math.cos(pitch));
  cam.lookAt(tx, ty, tz);
  cam.zoom = ${zoom}; cam.updateProjectionMatrix();
})()`;

const placed = await p.evaluate(`(() => {
  const sim = window.__d3.sim;
  const ok = [];
  // 육상 행은 0..3 — 2×2 는 y=0(행 0,1) 과 y=2(행 2,3) 두 줄이 들어간다
  const row = ['shop', 'restroom', 'shower', 'changing', 'tent'];
  for (let i = 0; i < row.length; i++) {
    if (sim.facilities.place(row[i], 8 + i * 3, 0, 0)) ok.push(row[i] + '@' + (8 + i * 3) + ',0');
    const j = row[(i + 4) % row.length];
    if (sim.facilities.place(j, 8 + i * 3, 2, 0)) ok.push(j + '@' + (8 + i * 3) + ',2');
  }
  // 다른 발자국도 한 줄에 — 3×2 게이트 · 2×3 카페 · 2×1 그늘막
  if (sim.facilities.place('gate', 24, 0, 0)) ok.push('gate@24,0');
  if (sim.facilities.place('cafe', 28, 0, 0)) ok.push('cafe@28,0');
  if (sim.facilities.place('shade', 24, 3, 0)) ok.push('shade@24,3');
  // 수상 3종 — 3×3 두 개(slide·trampoline)를 나란히 놓아 같은 발자국 크기를 본다
  for (const [id, x, wy] of [['trampoline', 10, 8], ['slide', 14, 7], ['pool', 18, 8]]) {
    if (sim.facilities.place(id, x, wy, 0)) ok.push(id + '@' + x + ',' + wy);
  }
  window.__d3.simView.sync();
  return ok;
})()`);
console.log('placed:', placed.join(' '));

await p.evaluate(frame(1.7, 17));
await p.waitForTimeout(800);
await p.screenshot({ path: 'shots/adjacent.png' });
await p.evaluate(frame(3.0, 11));
await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/adjacent-zoom.png' });
await p.evaluate(frame(2.0, 13).replace('tz = -90 + 1.5 * 6', 'tz = -90 + 9.5 * 6'));
await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/adjacent-water.png' });
await b.close();
console.log('saved shots/adjacent.png shots/adjacent-zoom.png shots/adjacent-water.png');

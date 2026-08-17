// 손님 확대 — node tools/shot-guests.mjs [zoom]
import { chromium } from 'playwright';
const ZOOM = Number(process.argv[2]) || 4.0;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
await p.goto('http://localhost:5175/?route=D&dot=2', { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
await p.evaluate(`(() => {
  const sim = window.__d3.sim;
  const place = (id, x, y) => { for (let d = 0; d <= 3; d++) for (const s of [1,-1]) if (sim.facilities.place(id, x, y + d*s, 0)) return true; return false; };
  place('gate', 20, 9); place('shop', 24, 9); place('cafe', 27, 9);
  for (let x = 18; x <= 30; x++) for (let y = 11; y <= 12; y++) place('path', x, y);
  for (let x = 20; x <= 28; x++) for (let y = 16; y <= 17; y++) place('deck', x, y);
  place('dock', 22, 17);
  window.__d3.simView.sync();
})()`);
await p.waitForTimeout(9000);
await p.evaluate(`(() => {
  const cam = window.__d3.camera;
  const tx = 0, ty = 4, tz = -30;
  const m = cam.matrixWorld.elements;
  const pitch = Math.asin(m[9]), yaw = Math.atan2(-m[8], m[10]);
  const dist = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(yaw) * dist * Math.cos(pitch), ty + dist * Math.sin(pitch), tz + Math.cos(yaw) * dist * Math.cos(pitch));
  cam.lookAt(tx, ty, tz);
  cam.zoom = ${ZOOM}; cam.updateProjectionMatrix();
})()`);
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/guests-zoom.png' });
await b.close();
console.log('saved shots/guests-zoom.png zoom ' + ZOOM);

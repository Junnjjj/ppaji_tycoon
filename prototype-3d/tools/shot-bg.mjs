// 배경막 비교 — node tools/shot-bg.mjs <procedural|sprite> [zoom]
import { chromium } from 'playwright';
const mode = process.argv[2] === 'sprite' ? 'sprite' : 'procedural';
const ZOOM = Number(process.argv[3]) || 1.4;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:5175/?route=D&dot=2&bg=${mode}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.evaluate(`(() => {
  const cam = window.__d3.camera;
  const tx = -6, ty = 8, tz = -95;
  const m = cam.matrixWorld.elements;
  const pitch = Math.asin(m[9]), yaw = Math.atan2(-m[8], m[10]);
  const d = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(yaw)*d*Math.cos(pitch), ty + d*Math.sin(pitch), tz + Math.cos(yaw)*d*Math.cos(pitch));
  cam.lookAt(tx, ty, tz); cam.zoom = ${ZOOM}; cam.updateProjectionMatrix();
})()`);
await p.waitForTimeout(1000);
await p.screenshot({ path: `shots/bg-${mode}.png` });
await b.close();
console.log(`saved shots/bg-${mode}.png` + (errs.length ? `  ⚠ ${errs[0]}` : ''));

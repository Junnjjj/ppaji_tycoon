// 가로 화면 확인 — node tools/shot-wide.mjs [zoom]
// ⚠ 세로 폰으로만 보면 띠 끝이 안 보인다. 가로에서 반드시 한 번 확인할 것.
import { chromium } from 'playwright';
const ZOOM = Number(process.argv[2]) || 0.75;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5175/?route=D&dot=2', { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
await p.evaluate(`(() => {
  const cam = window.__d3.camera;
  const S = window.__STAGE;
  const tx = S.X0 + (S.W * S.T) / 2, ty = 6, tz = S.Z0 + (S.H * S.T) / 2;
  const m = cam.matrixWorld.elements;
  const pitch = Math.asin(m[9]), yaw = Math.atan2(-m[8], m[10]);
  const d = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(yaw)*d*Math.cos(pitch), ty + d*Math.sin(pitch), tz + Math.cos(yaw)*d*Math.cos(pitch));
  cam.lookAt(tx, ty, tz); cam.zoom = ${ZOOM}; cam.updateProjectionMatrix();
})()`);
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/wide-check.png' });
await b.close();
console.log('saved shots/wide-check.png' + (errs.length ? '  ⚠ ' + errs[0] : ''));

// 카메라 3단 줌 스냅 검증 — node tools/camera-check.mjs
// ⚠ 핀치는 CDP Input.dispatchTouchEvent 로 진짜 멀티터치를 보낸다 (CLAUDE.md 규칙 —
//   합성 PointerEvent 는 못 믿는다).
import { chromium } from 'playwright';

const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true });
const results = [];
const check = (name, ok, note = '') => { results.push([name, ok, note]); console.log(`${ok ? '✓' : '✕'} ${name}${note ? ' — ' + note : ''}`); };

await p.goto('http://localhost:5175/?dot=2', { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
const zoom = () => p.evaluate('window.__d3.camera.zoom');

// 1. 부팅 줌 = 기본 단 1.4
check('부팅 줌 1.4', Math.abs(await zoom() - 1.4) < 0.01, `zoom ${await zoom()}`);

// 2. 더블탭 → 1.92 로 스냅
await p.mouse.click(200, 400);
await p.waitForTimeout(120);
await p.mouse.click(202, 402);
await p.waitForTimeout(900);
const z2 = await zoom();
check('더블탭 → 1.92', Math.abs(z2 - 1.92) < 0.01, `zoom ${z2.toFixed(3)}`);

// 3. 더블탭 다시 → 1.4 복귀
await p.mouse.click(200, 400); await p.waitForTimeout(120);
await p.mouse.click(202, 402); await p.waitForTimeout(900);
const z3 = await zoom();
check('더블탭 토글 → 1.4', Math.abs(z3 - 1.4) < 0.01, `zoom ${z3.toFixed(3)}`);

// 4. 휠 한 칸 아래 → 0.96
await p.mouse.move(196, 426);
await p.mouse.wheel(0, 120);
await p.waitForTimeout(900);
const z4 = await zoom();
check('휠 다운 → 0.96', Math.abs(z4 - 0.96) < 0.01, `zoom ${z4.toFixed(3)}`);

// 5. CDP 핀치 아웃 → 놓으면 사다리 단으로 스냅
const cdp = await p.context().newCDPSession(p);
const touches = (pts) => pts.map(([x, y]) => ({ x, y }));
const seq = [
  [[180, 420], [220, 440]],
  [[150, 380], [250, 480]],
  [[110, 330], [290, 530]],
  [[80, 290], [320, 570]],
];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(seq[0]) });
for (const pts of seq.slice(1)) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(pts) });
  await p.waitForTimeout(50);
}
const zPinch = await zoom();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await p.waitForTimeout(900);
const z5 = await zoom();
const onStep = [0.96, 1.4, 1.92].some((s) => Math.abs(s - z5) < 0.01);
check('핀치 연속 확대', zPinch > z4 + 0.05, `핀치중 ${zPinch.toFixed(3)}`);
check('핀치 종료 → 단 스냅', onStep, `zoom ${z5.toFixed(3)}`);

// 6. 경계 밖으로 드래그 → 놓으면 elastic 복귀
await p.mouse.move(196, 500);
await p.mouse.down();
for (let i = 0; i < 14; i++) await p.mouse.move(196 + i * 24, 500, { steps: 2 });
const overX = await p.evaluate('window.__d3.camera.position.x');
await p.mouse.up();
await p.waitForTimeout(900);
const tgt = await p.evaluate(`(() => { const c = window.__d3.camera; return { x: c.position.x, z: c.position.z }; })()`);
check('elastic 복귀 (경계 안)', tgt.x >= -430 && tgt.x <= 430, `드래그중 x ${overX.toFixed(0)} → ${tgt.x.toFixed(0)}`);

console.log(`\n카메라: ${results.filter(r => r[1]).length}/${results.length}`);
await b.close();
process.exit(results.every(r => r[1]) ? 0 : 1);

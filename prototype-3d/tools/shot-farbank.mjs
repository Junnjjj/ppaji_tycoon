// 배경 벽(farbank) 확인 — node tools/shot-farbank.mjs [river|mountain|lake] [tag]
//
// ⚠ 세로만 보면 지형 띠 끝이 화면 밖이라 결함을 놓친다 (실측 사고). 그래서 이 스크립트는
//   세로(393×852 @DSF3)와 **가로(1280×720)** 를 항상 같이 찍는다.
// 부팅 프레이밍 그대로 찍는다 — 카메라를 손으로 잡으면 실제로 보이는 그림이 아니게 된다.
import { chromium } from 'playwright';

const MAP = process.argv[2] || 'river';
const TAG = process.argv[3] || MAP;
const BASE = `http://localhost:5175/?route=D&dot=2&map=${MAP}`;

const browser = await chromium.launch({ channel: 'chrome' });
const errs = [];

async function shoot(name, viewport, deviceScaleFactor) {
  const p = await browser.newPage({ viewport, deviceScaleFactor });
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(`${name}: ${m.text().slice(0, 160)}`);
  });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2600);
  // HUD 를 걷어낸다 — 상단 안내 띠가 하필 배경 벽 이음새 위를 덮어서, 켜 둔 채로는
  // "검은 선이 없다"를 눈으로 확인할 수 없다 (실측).
  if (process.env.HUD !== 'on') {
    await p.evaluate(`document.querySelectorAll('body > *:not(canvas)').forEach((e) => e.remove())`);
    await p.waitForTimeout(300);
  }
  // ZOOM=0.82 (최소 줌) 으로 빼면 벽 위쪽이 화면에 들어온다 — 하늘 이음새 확인용
  if (process.env.ZOOM) {
    await p.evaluate(`(() => {
      const cam = window.__d3.camera;
      cam.zoom = ${Number(process.env.ZOOM)};
      cam.updateProjectionMatrix();
    })()`);
    await p.waitForTimeout(600);
  }
  const path = `shots/farbank-${TAG}-${name}.png`;
  await p.screenshot({ path });
  await p.close();
  console.log(`saved ${path}`);
  return path;
}

await shoot('portrait', { width: 393, height: 852 }, 3);
await shoot('wide', { width: 1280, height: 720 }, 1);
await browser.close();
if (errs.length) {
  console.log(`⚠ ${errs.length} error(s):`);
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  process.exitCode = 1;
} else {
  console.log('no console/page errors');
}

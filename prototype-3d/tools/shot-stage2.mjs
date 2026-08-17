// Stage 2 — 화면 전체 일관성 검사. node tools/shot-stage2.mjs [sprite|parametric] [zoom]
//
// 에셋 하나가 잘 나오는 것과 **여러 개가 한 세트로 보이는 것**은 다른 문제다.
// 시설 9종을 한 화면에 깔고 스프라이트판 / 파라메트릭판을 같은 배치로 찍어 비교한다.
import { chromium } from 'playwright';

const mode = process.argv[2] === 'parametric' ? 'parametric' : 'sprite';
// 텍셀 1개 = 화면 도트 1개가 되는 줌 = (TILE/16) / WORLD_PER_PX = 0.375 / 0.7213
const ZOOM = Number(process.argv[3]) || 1.93;
const out = `stage2-${mode}.png`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

// parametric 대조군: 시설은 index.json 을 막아 파라메트릭으로 돌리고,
// 본관은 route=A 로 둔다. (본관 스프라이트는 index 를 안 거치고 직접 로드하므로
// index 만 막으면 대조군에도 스프라이트 본관이 남는다 — 첫 촬영에서 실제로 그랬다)
if (mode === 'parametric') {
  await page.route('**/sprites/index.json', (r) => r.abort());
}
const route = mode === 'parametric' ? 'A' : 'D';
await page.goto(`http://localhost:5175/?route=${route}&dot=2`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const placed = await page.evaluate(`(() => {
  const sim = window.__d3.sim;
  // ⚠ 성긴 리조트로는 밀도 판정이 안 된다. 레퍼런스에는 **빈 지면이 없다** —
  // 데크·천막·계류열·군중이 전부 덮고 있다. 그래서 길·데크로 이어 붙인 리조트를 깐다.
  const plan = [
    // 육상 서비스열 두 줄
    ['gate', 14, 8],
    ['shop', 18, 8], ['cafe', 21, 8], ['restroom', 24, 8], ['shower', 27, 8], ['changing', 30, 8],
    ['shade', 18, 12], ['shade', 21, 12], ['shade', 24, 12], ['shade', 27, 12], ['shade', 30, 12],
    // 물가 데크·선착장
    ['dock', 20, 17], ['dock', 26, 17],
    // 수상 놀이시설
    ['slide', 15, 20], ['slide', 30, 20], ['trampoline', 23, 21],
    ['pool', 34, 19], ['trampoline', 12, 22],
  ];
  const ok = [], fail = [];
  const place = (id, x, y) => {
    for (let dy = 0; dy <= 3; dy++)
      for (const s of [1, -1])
        if (sim.facilities.place(id, x, y + dy * s, 0)) return true;
    return false;
  };
  for (const [id, x, y] of plan) (place(id, x, y) ? ok : fail).push(id);

  // 길 — 게이트에서 서비스열을 거쳐 물가까지. 빈 잔디를 없애는 가장 싼 수단이다
  for (let x = 14; x <= 33; x++) { place('path', x, 10); place('path', x, 11); }
  for (let y = 11; y <= 16; y++) { place('path', 22, y); place('path', 23, y); }
  // 데크 — 물가 띠를 덮는다
  for (let x = 16; x <= 32; x++) for (let y = 16; y <= 17; y++) place('deck', x, y);
  window.__d3.simView.sync();
  return { ok: ok.length, fail, sprites: window.__spritesLoaded, total: sim.facilities.count };
})()`);
console.log(`  배치 ${placed.ok}종 · sim 총 ${placed.total}개` +
            (placed.fail.length ? `  실패 [${placed.fail.join(' ')}]` : '') +
            `  스프라이트 ${placed.sprites ?? 0}장`);

// 손님이 돌아다니는 상태로 (빈 리조트는 판정이 안 된다)
await page.waitForTimeout(6000);

await page.evaluate(`(() => {
  const cam = window.__d3.camera;
  const tx = -6, ty = 8, tz = -40;
  const m = cam.matrixWorld.elements;
  const vx = -m[8], vy = -m[9], vz = -m[10];
  const pitch = Math.asin(-vy), yaw = Math.atan2(vx, -vz);
  const dist = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(yaw) * dist * Math.cos(pitch),
                   ty + dist * Math.sin(pitch),
                   tz + Math.cos(yaw) * dist * Math.cos(pitch));
  cam.lookAt(tx, ty, tz);
  cam.zoom = ${ZOOM};
  cam.updateProjectionMatrix();
})()`);
await page.waitForTimeout(1200);

await page.screenshot({ path: `shots/${out}` });
await browser.close();
console.log(`saved shots/${out}  zoom ${ZOOM}${errors.length ? `  ⚠ 콘솔에러 ${errors.length}: ${errors[0]}` : ''}`);

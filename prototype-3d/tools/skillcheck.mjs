import { chromium } from 'playwright';

/** 스킬 정합성 루프 — SKILL.md §5 통과 기준을 코드로 검사한다 */
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text().slice(0, 160)); });
await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };

// (1) 팔레트에 카페 카드가 뜨는가
await page.getByRole('button', { name: /건설/ }).click();
await page.waitForTimeout(400);
const cafeCard = page.getByRole('button', { name: /카페/ });
check('팔레트 등록', (await cafeCard.count()) > 0);

// (2) 배치 규칙 — 잔디 OK / 물 거부
// ⚠ 타일 좌표를 하드코딩하지 마라. 해안선이 기울어져 있어서(SHORE_SLOPE) 같은 타일이
//   맵 위치에 따라 잔디/물/숲이 된다 — 예전 고정 좌표는 격자를 바꾸자 전부 깨졌다.
//   대신 **해안 거리 d** 로 지정하고 타일 y 를 역산한다 (d<0 뭍, d>0 물).
await page.evaluate(`
  window.__G = { X0: -96, Z0: -90, T: 6 };
  window.__t2s = (tx, ty) => {
    const c = window.__d3.camera, G = window.__G;
    const v = new (c.position.constructor)(G.X0 + (tx + 0.5) * G.T, 2, G.Z0 + (ty + 0.5) * G.T);
    v.project(c);
    return { x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight };
  };
`);
// ⚠ 검사 좌표는 **화면에 보이는 타일**이어야 한다. 부팅 줌이 1.4 로 바뀌자
// 잔교 타일이 화면 밖으로 나가 드래그가 캔버스를 벗어났다 (암묵 의존이 깨진 사고).
// 부팅 프레이밍에 기대지 말고 검사 시작 때 카메라를 직접 잡는다.
await page.evaluate(`(() => {
  const cam = window.__d3.camera;
  const tx = 0, ty = 5, tz = -10;
  const m = cam.matrixWorld.elements;
  const pitch = Math.asin(m[9]), yaw = Math.atan2(-m[8], m[10]);
  const d = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(yaw)*d*Math.cos(pitch), ty + d*Math.sin(pitch), tz + Math.cos(yaw)*d*Math.cos(pitch));
  cam.lookAt(tx, ty, tz);
  cam.zoom = 0.96;
  cam.updateProjectionMatrix();
})()`);

// 무대 격자: 행 0..3 잔교(육상) · 4 물가 · 5+ 물. 좌표는 행 번호 하나로 끝난다
const t2s = (tx, ty) => page.evaluate(`window.__t2s(${tx}, ${ty})`);
await cafeCard.click();
await page.waitForTimeout(250);
const land = await t2s(16, 1);    // 잔교 (육상 행)
await page.mouse.move(land.x, land.y); await page.mouse.down();
await page.mouse.move(land.x + 2, land.y + 2, { steps: 2 }); await page.mouse.up();
await page.waitForTimeout(250);
const okOnLand = await page.getByRole('button', { name: /확정/ }).isEnabled();
check('잔디에서 배치 가능', okOnLand);

const water = await t2s(16, 14);  // 링 안 물
await page.mouse.move(water.x, water.y); await page.mouse.down();
await page.mouse.move(water.x + 2, water.y + 2, { steps: 2 }); await page.mouse.up();
await page.waitForTimeout(250);
const okOnWater = await page.getByRole('button', { name: /확정/ }).isEnabled();
const hintText = await page.locator('.hint').textContent();
check('물에서 배치 거부 + 사유 표시', !okOnWater && !!hintText, hintText ?? '');

// (3) 실제 배치 → 메시 생성
await page.mouse.move(land.x, land.y); await page.mouse.down();
await page.mouse.move(land.x + 2, land.y + 2, { steps: 2 }); await page.mouse.up();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /확정/ }).click();
await page.waitForTimeout(400);
const built = await page.evaluate(`(() => { let n=0; for (const f of window.__d3.sim.facilities.all) if (f.defId==='cafe') n++; return n; })()`);
check('배치되어 sim 에 등록', built === 1, `${built}개`);

// (4) 툰 재질이 걸렸는가 (Lambert 가 남아 있으면 셰이딩이 다르게 보인다)
// ⚠ 이 검사는 원래 "Lambert 잔존 0 && Toon > 0" 이었다. 시설이 스프라이트 빌보드로
// 바뀌자 Toon 이 0 이 되면서 걸렸는데, **검사가 낡은 것**이었다 (재질 구성이 바뀌었다).
// 지금 봐야 할 것은 두 가지다:
//   ① 변환 안 된 Lambert 가 남아 있지 않은가 (셰이딩이 어긋난다)
//   ② 스프라이트 빌보드가 3계약을 지키는가 — 어기면 화면에서 바로 티가 난다:
//      transparent:true → 외곽선이 쿼드 사각형을 딴다 / 필터 미지정 → 도트가 뭉갠다
//      / colorSpace 미지정 → 색이 씻겨 나간다
const matCheck = await page.evaluate(`(() => {
  const NEAREST = 1003;
  let lambert = 0, toon = 0, basic = 0, shader = 0;
  const bad = [];
  window.__d3.simView.group.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (m.type === 'MeshLambertMaterial') { lambert++; continue; }
      if (m.type === 'MeshToonMaterial') { toon++; continue; }
      if (m.type === 'ShaderMaterial') { shader++; continue; }
      if (m.type === 'MeshBasicMaterial') {
        basic++;
        if (m.transparent !== false) bad.push('transparent:true');
        if (!(m.alphaTest >= 0.5)) bad.push('alphaTest<0.5');
        if (m.map) {
          if (m.map.magFilter !== NEAREST) bad.push('magFilter!=Nearest');
          if (m.map.colorSpace !== 'srgb') bad.push('colorSpace!=srgb');
        }
        continue;
      }
      bad.push('unexpected:' + m.type);
    }
  });
  return { lambert, toon, basic, shader, bad: [...new Set(bad)] };
})()`);
check(
  '재질 계약 (Lambert 잔존 0 · 빌보드 3계약)',
  matCheck.lambert === 0 && matCheck.bad.length === 0 && (matCheck.toon + matCheck.basic + matCheck.shader) > 0,
  JSON.stringify(matCheck),
);

// (4-b) 스프라이트 폭 계약 — 그림 폭이 발자국의 화면 평행사변형보다 넓으면 이웃과
// 비정상적으로 겹친다 (건물 겹침 사고의 데이터 쪽 원인). index.json 으로 검사.
// ⚠ 옛 `(fw+fh)*11.3` 은 **yaw45 대칭일 때만** 맞다. 카메라가 yaw20 으로 얕아지면서
//    fw·fh 의 가중치가 갈라졌다 (2×3 ≠ 3×2). 폭은 발자국의 화면 바운딩박스다:
//      폭 = (fw·cos(yaw) + fh·sin(yaw)) × 16텍셀/타일
const widthCheck = await page.evaluate(`(async () => {
  const YAW = 20 * Math.PI / 180, TEXELS_PER_TILE = 16;
  const idx = await (await fetch('/sprites/index.json')).json();
  const bad = [];
  for (const [id, e] of Object.entries(idx)) {
    if (!e.footprint || !e.footprint[0]) continue;
    const limit = (e.footprint[0] * Math.cos(YAW) + e.footprint[1] * Math.sin(YAW)) * TEXELS_PER_TILE + 2;
    if (e.px[0] > limit) bad.push(id + ':' + e.px[0] + '>' + Math.round(limit));
  }
  return bad;
})()`);
check('스프라이트 폭 ≤ 발자국 다이아몬드', widthCheck.length === 0,
  widthCheck.length ? widthCheck.join(' ') : '전 항목 통과');

// (5) 게이트 놓고 손님이 카페를 목표로 삼는가
await page.getByRole('button', { name: /취소/ }).click().catch(() => {});
await page.getByRole('button', { name: /입장/ }).click();
await page.waitForTimeout(200);
const gate = await t2s(22, 1);    // 잔교
await page.mouse.move(gate.x, gate.y); await page.mouse.down();
await page.mouse.move(gate.x + 2, gate.y + 2, { steps: 2 }); await page.mouse.up();
await page.waitForTimeout(200);
const gok = page.getByRole('button', { name: /확정/ });
if (await gok.isEnabled()) await gok.click();
await page.getByRole('button', { name: /취소/ }).click().catch(() => {});
await page.getByRole('button', { name: /건설/ }).click();
await page.waitForTimeout(18000);
const target = await page.evaluate(`(() => {
  const sim = window.__d3.sim; let n = 0, used = 0;
  for (const g of sim.guests.all) {
    if (g.targetIid >= 0) { const t = sim.facilities.byIid(g.targetIid); if (t && t.defId === 'cafe') n++; }
  }
  for (const f of sim.facilities.all) if (f.defId === 'cafe') used = f.inUse + f.queue;
  return { n, used, st: sim.stats() };
})()`);
check('손님이 카페를 찾아옴', target.n > 0 || target.used > 0, `향함 ${target.n} · 이용/대기 ${target.used}`);

// (6) 성능·에러
const fps = await page.evaluate(`(() => new Promise((res) => {
  let f = 0; const t0 = performance.now();
  const tick = () => { f++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(Math.round(f / ((performance.now()-t0)/1000))); };
  requestAnimationFrame(tick);
}))()`);
check('60fps 급', fps >= 50, `${fps}fps`);
check('콘솔 에러 0', errs.length === 0, errs.slice(0, 2).join(' | '));

await page.screenshot({ path: 'prototype-3d/shots/skillcheck.png' });
await page.evaluate('window.__d3.camera.zoom = 2.2, window.__d3.camera.updateProjectionMatrix()');
await page.waitForTimeout(600);
await page.screenshot({ path: 'prototype-3d/shots/skillcheck-zoom.png' });
await browser.close();

let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✕'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (r.ok) pass++;
}
console.log(`\n정합성: ${pass}/${results.length}`);
process.exitCode = pass === results.length ? 0 : 1;

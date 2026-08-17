// 맵 구도 비교 — node tools/shot-map.mjs <yaw> [zoom] [name]
import { chromium } from 'playwright';
const yaw = process.argv[2] || '30';
const ZOOM = Number(process.argv[3]) || 0.95;
const name = process.argv[4] || `map-yaw${yaw}`;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const q = yaw === '30' ? '' : `&yaw=${yaw}&elev=35.26`;
await p.goto(`http://localhost:5175/?route=D&dot=2${q}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2400);
await p.evaluate(`(() => {
  const sim = window.__d3.sim;
  // 무대 격자: 행 0..3 잔교(육상 시설 줄) · 5+ 물 (폰툰 링 안이 플레이 영역)
  const place = (id, tx, ty) => {
    for (let k = 0; k <= 2; k++) for (const s of [1, -1])
      if (sim.facilities.place(id, tx, ty + k * s, 0)) return true;
    return false;
  };
  // 육상 7줄 — 뒷줄엔 건물, 앞줄엔 몽골텐트·평상 (실물 빠지 배치)
  const back = [['gate', 4], ['shop', 8], ['cafe', 11], ['restroom', 14], ['shower', 17], ['changing', 20]];
  for (const [id, tx] of back) place(id, tx, 1);
  const front = [['tent', 6], ['tent', 10], ['tent', 14], ['shade', 18], ['tent', 22], ['tent', 26], ['shade', 29]];
  for (const [id, tx] of front) place(id, tx, 4);
  // waterfront(선착장·슬라이드)는 뭍(잔교)에 닿아야 놓인다
  place('dock', 4, 7); place('slide', 24, 7); place('slide', 28, 7);
  // 링 안을 채운다 — 얕은 물(위 절반)엔 pool, 깊은 물(아래)엔 trampoline
  place('pool', 8, 10); place('pool', 13, 11); place('pool', 17, 9);
  place('trampoline', 9, 15); place('trampoline', 14, 16); place('trampoline', 19, 15);
  place('pool', 11, 13); place('trampoline', 16, 18);
  window.__d3.simView.sync();
})()`);

await p.waitForTimeout(7000);
await p.evaluate(`(() => {
  const cam = window.__d3.camera;
  // 허가 사각형 + 육상 부지가 화면에 꽉 차게 — "무한 맵"이 아니라 "내 리조트 한 판"
  // 무대 전체(잔교 + 링)가 화면에 들어오게
  const S = window.__STAGE;
  // 링이 화면의 주인공 — 링 중심(타일 14,11)을 화면 중앙보다 약간 아래에
  const P = S.permit;
  // ty 를 올리면 씬이 화면 아래로 내려온다 — 링이 하단을 채우고 배경이 더 들어온다
  const tx = S.X0 + (P.tx + P.tw / 2) * S.T, ty = 30, tz = S.Z0 + (P.ty + P.th / 2) * S.T + 4;
  const m = cam.matrixWorld.elements;
  const pitch = Math.asin(m[9]), y2 = Math.atan2(-m[8], m[10]);
  const d = Math.hypot(336, 238);
  cam.position.set(tx - Math.sin(y2)*d*Math.cos(pitch), ty + d*Math.sin(pitch), tz + Math.cos(y2)*d*Math.cos(pitch));
  cam.lookAt(tx, ty, tz); cam.zoom = ${ZOOM}; cam.updateProjectionMatrix();
})()`);
await p.waitForTimeout(1000);
await p.screenshot({ path: `shots/${name}.png` });
await b.close();
console.log(`saved shots/${name}.png yaw ${yaw}` + (errs.length ? `  ⚠ ${errs[0]}` : ''));

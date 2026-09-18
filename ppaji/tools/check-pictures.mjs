// P56-b 그림 반입 자 (계획 §5) — `assets/pictures/<name>.png` 낱장을 재고, 시트 한 장 + `src/data/pictures.json` 으로 묶는다.
//   node tools/check-pictures.mjs            # 검사 + 요약 (반입 수 < 300 이면 exit 1)
//   node tools/check-pictures.mjs --compose  # 검사 통과분만 public/assets/pictures.png + src/data/pictures.json 으로
//   node tools/check-pictures.mjs --selftest # 위반 4종을 주입해 자가 잡는지 (음성 대조군)
// 항목(주문서 §3): ① 크기 정확(24 / 견인 기구 32) ② 바깥 1px 투명 ③ 팔레트 거리 ≤ 24(39색 + 외곽선·흰·검·크림) ④ id 전수 — 데이터 342 와 1:1(모르는 파일은 오류)
//   ⑤ 같은 무리 안 실루엣 IoU < 0.9(색만 바꾼 복제 금지) ⑥ 불투명 픽셀 ≥ 12%(빈 그림 금지).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const ROOT = resolve(PKG, '..');
const args = process.argv.slice(2);
const opt = (k) => args.includes(k);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = resolve(PKG, argv('--dir', 'assets/pictures'));
const MIN_IMPORT = 300;

const data = (f) => JSON.parse(readFileSync(resolve(PKG, 'src/data', f), 'utf8'));
const ids = (arr, kind) => arr.map((e) => `pic/${kind}/${e.id}`);
/** P60-a — 옛 소품 그림: 시트 폴더의 `item_*.png` 가 곧 목록(정의 파일이 없다) */
function legacyItemIds() { try { return readdirSync(DIR).filter((f) => /^item_.+\.png$/.test(f)).map((f) => `pic/item/${f.slice(5, -4)}`); } catch { return []; } }
export function expectedIds() {
  return new Map([
    ...ids(data('ingredients.json'), 'ingredient').map((id) => [id, 24]),
    ...ids(data('recipes.json'), 'recipe').map((id) => [id, 24]),
    ...ids(data('rig-parts.json'), 'part').map((id) => [id, 24]),
    ...ids(data('parts.json'), 'part').map((id) => [id, 24]), // 공방 부품 41 (주문서 초안엔 없었다 — 383 = 342 + 41)
    ...ids(data('gears.json'), 'gear').map((id) => [id, 32]),
    ...legacyItemIds().map((id) => [id, 24]), // P60-a(2026-09-18): 소품 정의(items.json)는 지웠지만 그림 24 는 자산으로 남는다(미결 ⑤ — 부품·장식으로 재지정 전까지) — 기대 목록은 파일에서 센다
    ...ids(data('gifts.json'), 'gift').map((id) => [id, 24]),
    ...ids(data('wristbands.json'), 'band').map((id) => [id, 24]),
    ...ids(data('campaigns.json'), 'campaign').map((id) => [id, 24]), // P56-b2 캠페인 3
    ...data('portraits.json').flatMap((p) => ['calm', 'happy'].map((m) => [`pic/portrait/${p.id}_${m}`, 32])), // P56-b2 인물 초상 5×2
  ]);
}
/** P56-b2 장면 배경 — 시트 밖 낱장(`public/assets/scenes/scene_<id>.png`, 불투명 w×h) */
export function expectedScenes() { return data('scenes.json').map((s) => ({ id: s.id, w: s.w, h: s.h })); }
const nameOf = (id) => id.replace(/^pic\//, '').replace(/\//g, '_');
const idOf = (name) => { const m = /^([a-z]+)_(.+)\.png$/.exec(name); return m ? `pic/${m[1]}/${m[2]}` : null; };

function palette() {
  const p = JSON.parse(readFileSync(resolve(ROOT, 'art-reference/palette-proposed-39.json'), 'utf8'));
  const hex = [];
  for (const v of Object.values(p)) if (Array.isArray(v)) for (const h of v) if (typeof h === 'string' && h.startsWith('#')) hex.push(h);
  hex.push('#2b2f4a', '#ffffff', '#1a1a1a', '#fff3d6', '#f2b53f', '#e0604f');
  return hex.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
}
const PAL = palette();
const dist = (r, g, b) => Math.min(...PAL.map(([pr, pg, pb]) => Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2)));

function readPng(file) { return PNG.sync.read(readFileSync(file)); }

/** 한 장 검사 — 오류 문자열 배열(빈 배열 = 통과) */
export function checkOne(file, px) {
  const png = readPng(file);
  const errs = [];
  if (png.width !== px || png.height !== px) { errs.push(`크기 ${png.width}×${png.height} ≠ ${px}`); return { errs, mask: null }; }
  const mask = new Uint8Array(px * px);
  let opaque = 0, far = 0;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = (y * px + x) * 4; const a = png.data[i + 3];
    if (a === 0) continue;
    if (a < 255) { errs.push(`반투명 알파 (${x},${y})`); return { errs, mask: null }; }
    mask[y * px + x] = 1; opaque++;
    if (x === 0 || y === 0 || x === px - 1 || y === px - 1) { errs.push(`바깥 1px 에 그림 (${x},${y})`); return { errs, mask: null }; }
    if (dist(png.data[i], png.data[i + 1], png.data[i + 2]) > 24) far++;
  }
  if (opaque < px * px * 0.12) errs.push(`불투명 ${opaque}px < 12%`);
  if (opaque > (px - 2) * (px - 2) * 0.93) errs.push(`불투명 ${opaque}px — 안쪽을 꽉 채웠다(배경이 안 빠졌다)`); // ⑦ 크로마키 실패(남색·흰 배경)
  if (far > 0) errs.push(`팔레트 밖 색 ${far}px`);
  return { errs, mask, png };
}

/** ⑤ 복제 판정 — 실루엣 IoU 는 접시·컵이 다 둥글어 0.9 를 흔히 넘긴다(실측 277장에서 928쌍). **픽셀 동일률**(RGBA 같은 칸 ÷ 전체)로 잰다 — 옆 워커 그림을 집은 사고(달걀=오렌지)는 1.00 */
function sameRatio(a, b) { let s = 0; for (let k = 0; k < a.length; k += 4) if (a[k] === b[k] && a[k + 1] === b[k + 1] && a[k + 2] === b[k + 2] && a[k + 3] === b[k + 3]) s++; return s / (a.length / 4); }

export function run(dir, { compose = false, quiet = false } = {}) {
  const expected = expectedIds();
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
  const errors = [];
  const passed = new Map(); // id → { png, px }
  const masks = new Map();
  for (const f of files) {
    const id = idOf(f);
    if (!id || !expected.has(id)) { errors.push(`${f}: 데이터에 없는 id`); continue; }
    const px = expected.get(id);
    const r = checkOne(resolve(dir, f), px);
    if (r.errs.length) { errors.push(`${f}: ${r.errs.join(' · ')}`); continue; }
    passed.set(id, { png: r.png, px });
    masks.set(id, r.mask);
  }
  // ⑤ 같은 무리 안 실루엣 복제
  const byGroup = new Map();
  for (const id of passed.keys()) { const g = id.split('/')[1]; if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(id); }
  for (const [, list] of byGroup) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const pa = passed.get(list[a]), pb = passed.get(list[b]);
    if (pa.px !== pb.px) continue;
    const v = sameRatio(pa.png.data, pb.png.data);
    if (v >= 0.95) errors.push(`${nameOf(list[a])} ↔ ${nameOf(list[b])}: 픽셀 동일 ${v.toFixed(2)} ≥ 0.95 (복제·집어온 그림)`);
  }
  void masks;
  const missing = [...expected.keys()].filter((id) => !passed.has(id));
  // 장면 배경 — 낱장: 있고 · 크기 정확 · 불투명 · 팔레트
  const sceneDir = resolve(dirname(dir), 'scenes');
  let scenesOk = 0;
  for (const s of expectedScenes()) {
    const f = resolve(sceneDir, `scene_${s.id}.png`);
    if (!existsSync(f)) { errors.push(`scene_${s.id}.png: 없다`); continue; }
    const png = readPng(f);
    if (png.width !== s.w || png.height !== s.h) { errors.push(`scene_${s.id}.png: 크기 ${png.width}×${png.height} ≠ ${s.w}×${s.h}`); continue; }
    let far = 0, clear = 0;
    for (let i = 0; i < png.data.length; i += 4) { if (png.data[i + 3] !== 255) clear++; if (dist(png.data[i], png.data[i + 1], png.data[i + 2]) > 24) far++; }
    if (clear) errors.push(`scene_${s.id}.png: 투명 픽셀 ${clear}(장면은 불투명)`);
    else if (far) errors.push(`scene_${s.id}.png: 팔레트 밖 ${far}px`);
    else { scenesOk++; if (compose) { mkdirSync(resolve(PKG, 'public/assets/scenes'), { recursive: true }); copyFileSync(f, resolve(PKG, 'public/assets/scenes', `scene_${s.id}.png`)); } }
  }
  if (!quiet) console.log(`장면 배경 ${scenesOk}/${expectedScenes().length}`);
  if (!quiet) {
    for (const e of errors) console.log(`  ✕ ${e}`);
    console.log(`그림 반입 — 파일 ${files.length} · 통과 ${passed.size}/${expected.size} · 오류 ${errors.length} · 미반입 ${missing.length}`);
  }
  if (compose) {
    const cols = 20; const cell = 32; // 셀은 32 고정(견인 기구가 32) — 24 짜리는 셀 안 좌상단
    const list = [...passed.keys()].sort();
    const rows = Math.ceil(list.length / cols);
    const sheet = new PNG({ width: cols * cell, height: Math.max(1, rows) * cell });
    const entries = {};
    list.forEach((id, k) => {
      const { png, px } = passed.get(id);
      const x0 = (k % cols) * cell, y0 = Math.floor(k / cols) * cell;
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const s = (y * px + x) * 4, d = ((y0 + y) * sheet.width + x0 + x) * 4; sheet.data[d] = png.data[s]; sheet.data[d + 1] = png.data[s + 1]; sheet.data[d + 2] = png.data[s + 2]; sheet.data[d + 3] = png.data[s + 3]; }
      entries[id] = { x: x0, y: y0, w: px, h: px };
    });
    mkdirSync(resolve(PKG, 'public/assets'), { recursive: true });
    writeFileSync(resolve(PKG, 'public/assets/pictures.png'), PNG.sync.write(sheet));
    writeFileSync(resolve(PKG, 'src/data/pictures.json'), JSON.stringify({ sheet: 'assets/pictures.png', cell: 24, entries }, null, 2) + '\n');
    if (!quiet) console.log(`시트 ${sheet.width}×${sheet.height} · pictures.json ${list.length} 항목`);
  }
  return { errors, passed: passed.size, expected: expected.size, missing };
}

function selftest() {
  const tmp = resolve(PKG, 'assets/.pictures-selftest');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const src = resolve(DIR, 'ingredient_strawberry_fruit.png');
  if (!existsSync(src)) { console.log('❌ selftest: 표본 ingredient_strawberry_fruit.png 가 없다'); process.exit(1); }
  const base = readPng(src);
  const write = (name, mutate) => { const p = new PNG({ width: base.width, height: base.height }); base.data.copy(p.data); mutate(p); writeFileSync(resolve(tmp, name), PNG.sync.write(p)); };
  // 1 크기: 32 로 늘린 사본 (재료는 24 여야 한다)
  { const p = new PNG({ width: 32, height: 32 }); p.data.fill(0); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) for (let c = 0; c < 4; c++) p.data[((y + 4) * 32 + x + 4) * 4 + c] = base.data[(y * 24 + x) * 4 + c]; writeFileSync(resolve(tmp, 'ingredient_ice.png'), PNG.sync.write(p)); }
  // 2 바깥 1px 에 그림
  write('ingredient_water.png', (p) => { p.data[3] = 255; p.data[0] = 0x2b; p.data[1] = 0x2f; p.data[2] = 0x4a; });
  // 3 팔레트 밖 형광
  write('ingredient_sugar.png', (p) => { for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3]) { p.data[i] = 0; p.data[i + 1] = 255; p.data[i + 2] = 0; } });
  // 4 집어온 그림 — 딸기와 픽셀이 같은 「우유」(옆 워커 그림을 집은 사고의 모양). 색만 바꾼 밀가루는 픽셀 동일률 아래라 안 잡히는 것이 맞다(실루엣 규칙은 접시가 다 둥글어 폐기)
  copyFileSync(src, resolve(tmp, 'ingredient_strawberry_fruit.png'));
  copyFileSync(src, resolve(tmp, 'ingredient_milk.png'));
  write('ingredient_flour.png', (p) => { for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] && p.data[i] > 150) { p.data[i] = 0x62; p.data[i + 1] = 0xa5; p.data[i + 2] = 0x8c; } });
  const r = run(tmp, { quiet: true });
  const want = [['크기', /ingredient_ice.*크기/], ['바깥 1px', /ingredient_water.*바깥 1px/], ['팔레트', /ingredient_sugar.*팔레트/], ['복제', /ingredient_(milk|flour).*픽셀 동일/]];
  let ok = true;
  for (const [name, re] of want) { const hit = r.errors.some((e) => re.test(e)); console.log(`  ${hit ? '✓' : '✕'} 잡힘: ${name}`); ok = ok && hit; }
  rmSync(tmp, { recursive: true, force: true });
  console.log(ok ? '✅ check-pictures --selftest: 위반 4/4 잡힘' : '❌ check-pictures --selftest: 못 잡은 위반이 있다');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (opt('--selftest')) selftest();
  else {
    const r = run(DIR, { compose: opt('--compose') });
    if (r.errors.length) { console.log('❌ 그림 오류'); process.exit(1); }
    if (r.passed < MIN_IMPORT && !opt('--partial')) { console.log(`❌ 반입 ${r.passed} < ${MIN_IMPORT}`); process.exit(1); }
    console.log('✅ check-pictures');
  }
}

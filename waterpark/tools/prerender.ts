/**
 * 시설 프리렌더 드라이버 (G15) — dev 서버(5177)의 `tools/prerender/index.html` 을 Playwright(Chrome, WebGL) 로 열어
 * 시설 91종 × facing 2 를 PNG 로 받아 `public/assets/fac-atlas.png` + `fac-atlas.json` 으로 묶는다.
 *   npx tsx tools/prerender.ts [--only id,id] [--shots]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const BASE = process.env['WP_URL'] ?? 'http://localhost:5177';
const only = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? (process.argv[i + 1] ?? '').split(',').filter(Boolean) : null; })();
const shots = process.argv.includes('--shots');

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
page.on('pageerror', (e) => console.error('pageerror', e));
page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
await page.goto(`${BASE}/tools/prerender/index.html`, { waitUntil: 'load' });
await page.waitForFunction(`!!(window.__pre && window.__pre.ready)`, undefined, { timeout: 20000 });
const ids = (await page.evaluate(`window.__pre.ids()`)) as string[];
const targets = only ?? ids;
type Sprite = { key: string; w: number; h: number; png: PNG };
const sprites: Sprite[] = [];
for (const id of targets) {
  for (const facing of [0, 1] as const) {
    const r = (await page.evaluate(`(() => { const r = window.__pre.render(${JSON.stringify(id)}, ${facing}); return r ? { w: r.w, h: r.h, png: r.png } : null; })()`)) as { w: number; h: number; png: string } | null;
    if (!r) { console.error('render 실패', id); continue; }
    const png = PNG.sync.read(Buffer.from(r.png.split(',')[1] ?? '', 'base64'));
    sprites.push({ key: `fac/${id}/${facing}`, w: r.w, h: r.h, png });
  }
}
await browser.close();

// 선반 패킹 — 높이순 정렬, 폭 512
const ATLAS_W = 512;
sprites.sort((a, b) => b.h - a.h);
let x = 0; let y = 0; let rowH = 0;
const place: Record<string, { x: number; y: number; w: number; h: number }> = {};
for (const s of sprites) {
  if (x + s.w > ATLAS_W) { x = 0; y += rowH + 1; rowH = 0; }
  place[s.key] = { x, y, w: s.w, h: s.h };
  x += s.w + 1; rowH = Math.max(rowH, s.h);
}
const ATLAS_H = y + rowH + 1;
const atlas = new PNG({ width: ATLAS_W, height: ATLAS_H });
for (const s of sprites) { const p = place[s.key]!; PNG.bitblt(s.png, atlas, 0, 0, s.w, s.h, p.x, p.y); }
mkdirSync('public/assets', { recursive: true });
writeFileSync('public/assets/fac-atlas.png', PNG.sync.write(atlas));
writeFileSync('public/assets/fac-atlas.json', JSON.stringify({ version: 1, w: ATLAS_W, h: ATLAS_H, sprites: place }));
console.log(`atlas ${ATLAS_W}×${ATLAS_H} · sprites ${sprites.length}`);
if (shots) { mkdirSync('tmp-shots', { recursive: true }); for (const s of sprites.slice(0, 12)) writeFileSync(`tmp-shots/pre-${s.key.replace(/\//g, '_')}.png`, PNG.sync.write(s.png)); }

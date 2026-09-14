// 스프라이트 갤러리 (G14) — 시설 91 · 손님 8×4 · 타일 6 을 한 장(tmp-shots/gallery.png)에. dev 서버(5177) 필요. 판정 없음
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:5177/?debug=1&fresh=1&tut=0', { waitUntil: 'load' });
await p.waitForFunction(`(() => (document.getElementById('wp-debug')?.textContent || '').includes('FPS'))()`, undefined, { timeout: 15000 });
const url = await p.evaluate(`(() => { const w = window.__wp; const prov = w.provider; const ids = [];
  for (const d of w.facilityDefs.values()) ids.push(d.id);
  if (ids.length === 0) for (const d of (w.FACILITY_DEFS || new Map()).values()) ids.push(d.id);
  const facs = ids.length ? ids : (window.__facIds || []);
  const S = 3, cellW = 70, cellH = 76, cols = 10;
  const cv = document.createElement('canvas'); cv.width = cols * cellW * S; cv.height = (Math.ceil(facs.length / cols) + 2) * cellH * S; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#e8d5a3'; g.fillRect(0, 0, cv.width, cv.height);
  facs.forEach((id, k) => { const c = prov.canvas('fac/' + id + '/0'); if (!c) return; const x = (k % cols) * cellW, y = Math.floor(k / cols) * cellH; g.drawImage(c, (x + cellW / 2 - c.width / 2) * S, (y + cellH - 8 - c.height) * S, c.width * S, c.height * S); g.fillStyle = '#243055'; g.font = (4 * S) + 'px monospace'; g.textAlign = 'center'; g.fillText(id.slice(0, 16), (x + cellW / 2) * S, (y + cellH - 2) * S); });
  const gy = (Math.ceil(facs.length / cols)) * cellH; let gx = 4;
  for (let pal = 0; pal < 8; pal++) for (const key of ['idle/0/calm', 'walk/0/happy', 'walk/1/annoyed', 'swim/0/tired']) { const c = prov.canvas('guest/body:' + pal + '/' + key); if (c) { g.drawImage(c, gx * S, (gy + 10) * S, c.width * S, c.height * S); gx += 18; } }
  for (const t of ['sand', 'grass', 'path', 'indoor', 'pool', 'gate']) { const c = prov.canvas('tile/' + t); if (c) { g.drawImage(c, gx * S, (gy + 20) * S, c.width * S, c.height * S); gx += 36; } }
  return { n: facs.length, url: cv.toDataURL('image/png') }; })()`);
console.log('facilities', url.n);
writeFileSync('tmp-shots/gallery.png', Buffer.from(url.url.split(',')[1], 'base64'));
await b.close();

// P56-b 검수 갤러리 — 383장을 이름·분류·id 와 4배 확대로 한 페이지에. `node tools/pictures/gallery.mjs <out.html>`
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
const out = process.argv[2] ?? 'public/pictures-gallery.html';
const d = (f) => JSON.parse(readFileSync(`src/data/${f}`, 'utf8'));
const CAT = { drink: '음료', snack: '스낵', meal: '식사', dessert: '디저트' };
const CLS = { fruit: '과일', base: '기본', sweet: '단맛', dairy: '유제품', seafood: '해산물', grain: '곡물', veg: '채소', meat: '고기', nut: '견과' };
const groups = [
  ['재료', 'ingredient', d('ingredients.json').map((x) => [x.id, x.name, CLS[x.class] ?? x.class ?? ''])],
  ['요리', 'recipe', d('recipes.json').map((x) => [x.id, x.name, (CAT[x.cat] ?? x.cat ?? '') + (x.unlock === 'fail' ? ' · 실패작' : '')])],
  ['개조 부품', 'part', d('rig-parts.json').map((x) => [x.id, x.name, x.class ?? ''])],
  ['공방 부품', 'part', d('parts.json').map((x) => [x.id, x.name, x.class ?? ''])],
  ['견인 기구', 'gear', d('gears.json').map((x) => [x.id, x.name, (x.cat ?? '') + (x.unlock === 'fail' ? ' · 실패작' : '')])],
  ['수역 소품', 'item', d('items.json').map((x) => [x.id, x.name, [x.color, x.scent].filter(Boolean).join(' · ')])],
  ['선물', 'gift', d('gifts.json').map((x) => [x.id, x.name, x.kind === 'float' ? '튜브' : '수영복'])],
  ['팔찌', 'band', d('wristbands.json').map((x) => [x.id, x.name, `등급 ${x.grade}`])],
  ['캠페인', 'campaign', d('campaigns.json').map((x) => [x.id, x.name, x.kind ?? ''])],
  ['인물 초상', 'portrait', d('portraits.json').flatMap((x) => [[`${x.id}_calm`, `${x.name} · 차분`, x.id], [`${x.id}_happy`, `${x.name} · 웃음`, x.id]])],
  ['장면 배경 (192×64)', 'scene', d('scenes.json').map((x) => [x.id, x.name, x.hint])],
];
const b64 = (kind, id) => { const p = kind === 'scene' ? `assets/scenes/scene_${id}.png` : `assets/pictures/${kind}_${id}.png`; return existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null; };
let total = 0, missing = 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sections = groups.map(([label, kind, list]) => {
  const cards = list.map(([id, name, sub]) => { total++; const src = b64(kind, id); if (!src) missing++; const wide = kind === 'scene'; return `<figure class="c${src ? '' : ' miss'}${wide ? ' wide' : ''}"><div class="art${wide ? ' art-wide' : ''}">${src ? `<img src="${src}" alt="${esc(name)}" width="${wide ? 384 : 96}" height="${wide ? 128 : 96}">` : '<span>없음</span>'}</div><figcaption><b>${esc(name)}</b><small>${esc(sub)}</small><code>${esc(kind)}/${esc(id)}</code></figcaption></figure>`; }).join('');
  return `<section id="g-${kind}-${label}"><h2>${esc(label)} <span class="n">${list.length}</span></h2><div class="grid">${cards}</div></section>`;
}).join('');
const nav = groups.map(([label, kind, list]) => `<a href="#g-${kind}-${label}">${esc(label)} <em>${list.length}</em></a>`).join('');
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const html = `<title>빠지 그림 ${total}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Noto+Sans+KR:wght@400;700&display=swap">
<style>
:root{--bg:#fff3d6;--card:#fffaf0;--ink:#3a2410;--dim:#8a6a48;--line:#d9b98a;--accent:#2b9ac4;--bad:#e0604f;--on:#f2b53f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1e1a14;--card:#2a241b;--ink:#f3e7cf;--dim:#c2a988;--line:#4d4131;--accent:#7fd0e6;--bad:#ff8a7a;--on:#f2b53f}}
:root[data-theme="dark"]{--bg:#1e1a14;--card:#2a241b;--ink:#f3e7cf;--dim:#c2a988;--line:#4d4131;--accent:#7fd0e6;--bad:#ff8a7a;--on:#f2b53f}
body{background:var(--bg);color:var(--ink);font:15px/1.5 "Noto Sans KR",system-ui,sans-serif;margin:0}
header{position:sticky;top:0;background:var(--bg);border-bottom:2px solid var(--line);padding:12px 16px;z-index:2}
h1{font:700 22px/1.2 "Gowun Dodum","Noto Sans KR",sans-serif;margin:0 0 6px}
header p{margin:0 0 8px;color:var(--dim);font-size:13px}
nav{display:flex;flex-wrap:wrap;gap:6px}
nav a{color:var(--ink);text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px}
nav a em{font-style:normal;color:var(--accent);font-weight:700;margin-left:3px}
section{padding:8px 16px 16px}
h2{font:700 18px/1.2 "Gowun Dodum","Noto Sans KR",sans-serif;margin:14px 0 8px;border-left:4px solid var(--on);padding-left:8px}
h2 .n{color:var(--dim);font-size:14px;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.c{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.c.miss{border-color:var(--bad)}
.c.wide{grid-column:1/-1;align-items:flex-start}
.art-wide{width:100%;height:auto;justify-content:flex-start}
.art-wide img{width:384px;height:128px;max-width:100%;image-rendering:pixelated}
.art{width:96px;height:96px;display:flex;align-items:center;justify-content:center}
.art img{image-rendering:pixelated;image-rendering:crisp-edges;width:96px;height:96px}
figcaption{width:100%;text-align:center;line-height:1.25}
figcaption b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
figcaption small{display:block;color:var(--dim);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
figcaption code{display:block;color:var(--dim);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace}
</style>
<header><h1>빠지 그림 ${total}장 — 검수용</h1><p>${stamp} 갱신 · Codex image_gen 으로 뽑아 24/32px 로 다듬은 카드 아이콘 전부(4배 확대). 이상한 것은 이름을 알려 주면 그 장만 다시 뽑는다. 빠진 그림 ${missing}장.</p><nav>${nav}</nav></header>
${sections}`;
writeFileSync(out, html);
console.log('gallery', out, total, 'missing', missing, statSync(out).size);

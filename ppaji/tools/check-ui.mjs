#!/usr/bin/env node
/**
 * UI 정적 검사 — 브라우저 없이 파일만 읽는다 (밀리초). `npm run gate` 마다 돈다.
 *
 *   S1 TS(ui·render·assets)에 hex 리터럴 0 (tokens.ts 제외) — 색은 style.css 가 소유
 *   S2 CSS 가 쓰는 var(--x) 가 전부 :root 에 선언
 *   S3 대비비 — 본문 4.5 · 보조 3 (표 `PAIRS`)
 *   S4 이모지 리터럴 0 (icons.ts 도 예외 아님 — 캔버스 아이콘이라 예외가 필요 없다)
 *   S5 font-size 는 --fs-* 토큰만 · 12px 하한 · **4단**(P59-a D64: cap·body·title·num)
 *   S6 transition/animation 은 transform·opacity·box-shadow·background 만 · 모션 가드 존재
 *   S7 .kbtn/.ksquare 에 재질(그라디언트·inset 하이라이트·:active)
 *   S8 `hidden =` 대입은 panelHost 를 아는 파일 또는 hud/토스트뿐
 *   S9 FX 등록부 밖에서 tweens.add / add.particles 호출 0
 *   S10 border-radius 는 --r-win · --r-in · 999px 셋뿐 (P59-a D65)
 *   S11 창 톤은 blue·gold 둘뿐 · kfit 0 (P59-a D67) — CSS·TS 양쪽
 *
 * `--selftest` 는 소스 사본에 위반을 주입해 이름 붙은 자가 **실제로 빨간불**이 되는지 본다 —
 * 안 잡히는 자는 아무것도 안 재고 있다.
 */
import { readFile, readdir, cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SELFTEST = process.argv.includes('--selftest');

if (SELFTEST) {
  const FAULTS = [
    { id: 'hex', expect: 'S1', file: 'src/ui/hud.ts', edit: (t) => `${t}\nexport const __fault = '#ff00aa';\n` },
    { id: 'undeclared-var', expect: 'S2', file: 'src/ui/style.css', edit: (t) => `${t}\n.kfault { color: var(--nope-token); }\n` },
    { id: 'contrast', expect: 'S3', file: 'src/ui/style.css', edit: (t) => t.replace(/(--ticker-ink:\s*)#[0-9a-fA-F]{6}/, '$1#ffc0d0') },
    { id: 'emoji', expect: 'S4', file: 'src/ui/hud.ts', edit: (t) => `const __fault = '📰';\nvoid __fault;\n${t}` },
    { id: 'literal-px', expect: 'S5', file: 'src/ui/style.css', edit: (t) => `${t}\n.kfault { font-size: 14px; }\n` },
    { id: 'layout-anim', expect: 'S6', file: 'src/ui/style.css', edit: (t) => `${t}\n.kfault { transition: height 200ms; }\n` },
    { id: 'reduced-motion', expect: 'S6', file: 'src/ui/style.css', edit: (t) => t.replace('@media (prefers-reduced-motion: reduce)', '@media (min-width: 1px)') },
    { id: 'material', expect: 'S7', file: 'src/ui/style.css', edit: (t) => t.replace('.kbtn:active, .ksquare:active', '.kfault-none') },
    { id: 'hidden-outside', expect: 'S8', file: 'src/render/scene.ts', edit: (t) => `${t}\nexport function __fault(e: HTMLElement): void { e.hidden = true; }\n` },
    { id: 'rig-dim-hardcoded', expect: 'S1', file: 'src/render/scene.ts', edit: (t) => t.replace("cssColorInt('--rig-dim') || 0x55697c", "Number('0x' + '#55697c'.slice(1))") }, // P50-b2: 꺼짐 틴트를 hex 로 되돌리면 S1 빨강
    { id: 'risk-contrast', expect: 'S3', file: 'src/ui/style.css', edit: (t) => t.replace('--risk-1: #7d5c05;', '--risk-1: #ffd27a;') }, // P52-b: 위험 칩 면을 밝게 되돌리면 흰 글씨 4.5:1 미달 → S3 빨강
    { id: 'tween-outside', expect: 'S9', file: 'src/render/scene.ts', edit: (t) => `${t}\nexport function __fault2(s: Phaser.Scene): void { s.tweens.add({ targets: [], duration: 1 }); }\n` },
    { id: 'font-steps', expect: 'S5', file: 'src/ui/style.css', edit: (t) => t.replace('--r-win: 8px;', '--r-win: 8px; --fs-lead: 17px;') }, // P59-a D64: 5단이 되면 빨강
    { id: 'radius-literal', expect: 'S10', file: 'src/ui/style.css', edit: (t) => `${t}\n.kfault { border-radius: 7px; }\n` }, // P59-a D65
    { id: 'win-tone', expect: 'S11', file: 'src/ui/style.css', edit: (t) => `${t}\n.kwin.purple .kwin-head { background: red; }\n` }, // P59-a D67
    { id: 'kfit-back', expect: 'S11', file: 'src/ui/window.ts', edit: (t) => `${t}\nexport function __fault3(e: HTMLElement): void { e.classList.add('kfit'); }\n` },
  ];
  const self = resolve(process.argv[1]);
  const caught = [];
  const missed = [];
  for (const f of FAULTS) {
    const dir = await mkdtemp(join(tmpdir(), 'wp-ui-'));
    await cp('src', join(dir, 'src'), { recursive: true });
    const target = join(dir, f.file);
    const before = await readFile(target, 'utf8');
    const after = f.edit(before);
    if (after === before) { await rm(dir, { recursive: true, force: true }); missed.push(`${f.id} (주입 자체가 안 됐다)`); continue; }
    await writeFile(target, after);
    const run = spawnSync(process.execPath, [self], { cwd: dir, encoding: 'utf8' });
    await rm(dir, { recursive: true, force: true });
    const red = run.status !== 0 && run.stdout.split('\n').some((l) => l.includes('✕') && l.includes(f.expect));
    (red ? caught : missed).push(f.id);
  }
  console.log('UI 정적 검사 — 음성 대조군');
  for (const c of caught) console.log(`  ✓ 잡힘: ${c}`);
  for (const m of missed) console.log(`  ✕ 안 잡힘: ${m}`);
  if (missed.length) { console.log(`\n❌ ${caught.length}/${FAULTS.length}`); process.exit(1); }
  console.log(`\n✅ 대조군 ${caught.length}/${FAULTS.length} 전부 잡힘`);
  process.exit(0);
}

const fails = [];
const ok = (id, name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✕'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) fails.push(id);
};

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const css = await readFile('src/ui/style.css', 'utf8');
const cssCode = strip(css);
const tsFiles = (await walk('src')).filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'));
const uiTs = tsFiles.filter((p) => /src\/(ui|render|assets)\//.test(p) && !p.endsWith('tokens.ts'));

console.log('UI 정적 검사');

// S1 hex 0
{
  const hits = [];
  for (const p of uiTs) {
    const t = strip(await readFile(p, 'utf8'));
    const m = t.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (m) hits.push(`${p}:${m.length}`);
  }
  ok('S1', 'TS 에 hex 리터럴 0 (색은 style.css 가 소유)', hits.length === 0, hits.join(' · '));
}

// S2 var 선언
{
  const root = cssCode.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? '';
  const declared = new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...cssCode.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !declared.has(v) && v !== '--icon-art');
  ok('S2', ':root 에 없는 토큰 사용 0', missing.length === 0, missing.join(' · '));
}

// S3 대비
{
  const root = cssCode.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? '';
  const tok = (name) => root.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim() ?? '';
  const hexOf = (v) => v.match(/#[0-9a-fA-F]{6}/g) ?? [];
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // rgb(18 38 92 / 82%) 같은 반투명 띠는 지형(모래) 위에 합성한 값으로 잰다
  const over = (rgba, base) => {
    const m = rgba.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)%\)/);
    if (!m) return null;
    const a = Number(m[4]) / 100;
    const b = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
    const out = [m[1], m[2], m[3]].map((v, k) => Math.round(Number(v) * a + b[k] * (1 - a)));
    return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const sand = hexOf(tok('--tile-sand'))[0];
  const stripBg = over(tok('--strip-bg'), sand);
  const barBg = over(tok('--bar-bg'), sand);
  const PAIRS = [
    ['--strip-ink', stripBg, 4.5, '상단 띠 흰 글씨'],
    ['--strip-num', stripBg, 4.5, '상단 띠 노랑 숫자'],
    ['--strip-sub', stripBg, 3, '상단 띠 보조'],
    ['--strip-ink', hexOf(tok('--daypart'))[0], 4.5, '일과 알약'],
    ['--btn-ink', hexOf(tok('--btn-blue'))[1], 4.5, '버튼 흰 글씨(어두운 끝)'],
    ['--btn-ink', hexOf(tok('--btn-locked'))[0], 4.5, '잠긴 버튼'],
    ['--ticker-ink', hexOf(tok('--ticker-bg'))[0], 4.5, '티커'],
    ['--ink', hexOf(tok('--win-bg'))[1], 4.5, '창 본문(어두운 끝)'],
    ['--ink-dim', hexOf(tok('--win-bg'))[1], 3, '창 보조'],
    ['--btn-ink', hexOf(tok('--row-on'))[0], 4.5, '선택 행'],
    ['--bubble-ink', hexOf(tok('--bubble-bg'))[0], 4.5, '말풍선'],
    ['--strip-ink', barBg, 4.5, '하단 바'],
    ['--strip-num', barBg, 4.5, '하단 바 숫자'],
    ['--btn-ink', hexOf(tok('--badge'))[0], 3, '배지'],
    ['--rig-dim', hexOf(tok('--pool-clear'))[0], 3, 'P50-b2 꺼진 기구 틴트 대 물(면끼리 3:1 — 색약·흑백에서 켜짐/꺼짐이 갈려야 한다)'],
    ['--btn-ink', hexOf(tok('--risk-0'))[0], 4.5, 'P52-b 위험 칩 안전'],
    ['--btn-ink', hexOf(tok('--risk-1'))[0], 4.5, 'P52-b 위험 칩 주의'],
    ['--btn-ink', hexOf(tok('--risk-2'))[0], 4.5, 'P52-b 위험 칩 경계'],
    ['--btn-ink', hexOf(tok('--risk-3'))[0], 4.5, 'P52-b 위험 칩 위험'],
    ['--ink', hexOf(tok('--card-on'))[0], 4.5, 'P56-a 카드 선택 노란 채움 위 진갈 글씨'],
    ['--card-price', hexOf(tok('--win-flat'))[0], 4.5, 'P56-a 카드 우하 가격'],
    ['--btn-ink', hexOf(tok('--badge'))[0], 3, 'P56-a SOLD OUT 띠(면끼리 3:1)'],
    ['--btn-ink', hexOf(tok('--win-title-blue'))[0], 4.5, 'P59-a 창 머리 제목(타일 띠 바탕)'],
    ['--btn-ink', hexOf(tok('--win-title-gold'))[0], 3, 'P59-a 금 머리(결산) — 보조'],
    ['--ink', hexOf(tok('--win-flat'))[0], 4.5, 'P59-a 카드·행 위 글씨'],
    ['--ink', hexOf(tok('--row-bg'))[0], 4.5, 'P59-a 행 위 글씨'],
    ['--ink-dim', hexOf(tok('--row-bg'))[0], 3, 'P59-a 행 보조'],
    ['--btn-ink', hexOf(tok('--ticker-bg'))[0], 4.5, 'P59-a 핑크 배너 흰 글씨'],
  ];
  const bad = [];
  for (const [fg, bg, need, name] of PAIRS) {
    const f = hexOf(tok(fg))[0];
    if (!f || !bg) { bad.push(`${name}: 색을 못 읽음`); continue; }
    const r = ratio(f, bg);
    if (r < need) bad.push(`${name} ${r.toFixed(2)} < ${need}`);
  }
  ok('S3', `대비비 ${PAIRS.length}쌍`, bad.length === 0, bad.join(' · '));
}

// S4 이모지
{
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
  const hits = [];
  for (const p of uiTs.concat(tsFiles.filter((q) => q.endsWith('tokens.ts')))) {
    const m = strip(await readFile(p, 'utf8')).match(EMOJI);
    if (m) hits.push(`${p}:${m.length}`);
  }
  ok('S4', '이모지 리터럴 0 (등록부는 캔버스 아이콘)', hits.length === 0, hits.join(' · '));
}

// S5 font-size
{
  const sizes = [...cssCode.matchAll(/font-size\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
  const literal = sizes.filter((s) => !/^(var\(--fs-[a-z]+\)|inherit)$/.test(s)); // P59-a: 폼 컨트롤은 inherit 로 토큰을 물려받는다
  const root = cssCode.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? '';
  const steps = [...root.matchAll(/--fs-[a-z]+\s*:\s*(\d+)px/g)].map((m) => Number(m[1]));
  const under = steps.filter((n) => n < 12);
  ok('S5', 'font-size 토큰만 · ≥12px · 4단(D64)', literal.length === 0 && under.length === 0 && steps.length === 4,
    `리터럴 ${literal.length} · 단 ${steps.length} · 12 미만 ${under.length}`);
}

// S10 border-radius — 셋뿐 (P59-a D65)
{
  const vals = [...cssCode.matchAll(/border-radius\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
  const okPart = (p) => p === 'var(--r-win)' || p === 'var(--r-in)' || p === '999px' || p === '0' || /^calc\(var\(--r-win\) - 3px\)$/.test(p);
  const bad = vals.filter((v) => !v.split(/\s+/).every(okPart));
  ok('S10', 'border-radius 는 --r-win · --r-in · 999px 만 (D65)', bad.length === 0 && vals.length > 0, bad.slice(0, 5).join(' · '));
}

// S11 창 톤 2 · kfit 0 (P59-a D67)
{
  const toneCss = (cssCode.match(/\.kwin\.(purple|pink|green)\b/g) ?? []).length;
  const kfitCss = (cssCode.match(/\.kfit\b/g) ?? []).length;
  let kfitTs = 0; let toneTs = 0;
  for (const p of uiTs) { const t = strip(await readFile(p, 'utf8')); kfitTs += (t.match(/['"`]kfit['"`]|classList\.add\('kfit'\)/g) ?? []).length; toneTs += (t.match(/WindowPanel\([^\n]*'(purple|pink|green)'/g) ?? []).length; }
  ok('S11', '창 톤 blue·gold 둘뿐 · kfit 0 (D67)', toneCss + toneTs + kfitCss + kfitTs === 0, `톤 css ${toneCss} ts ${toneTs} · kfit css ${kfitCss} ts ${kfitTs}`);
}

// S6 모션
{
  const props = [...cssCode.matchAll(/transition\s*:\s*([^;]+);/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0]));
  const allowed = new Set(['transform', 'opacity', 'box-shadow', 'background', 'background-color', 'none', 'color']);
  const badProps = props.filter((p) => !allowed.has(p));
  const guard = /@media \(prefers-reduced-motion: reduce\)/.test(cssCode);
  ok('S6', 'transition 은 transform/opacity 계열 + reduced-motion 가드', badProps.length === 0 && guard, badProps.join(' · ') || (guard ? '' : '가드 없음'));
}

// S7 재질
{
  const btn = cssCode.match(/\.kbtn, \.ksquare\s*{([\s\S]*?)}/)?.[1] ?? '';
  const hasGrad = /background:\s*var\(--btn-blue\)/.test(btn);
  const hasInset = /box-shadow:[^;]*inset/.test(btn);
  const hasActive = /\.kbtn:active, \.ksquare:active\s*{/.test(cssCode);
  ok('S7', '버튼 재질 — 그라디언트 · inset 하이라이트 · 눌림', hasGrad && hasInset && hasActive);
}

// S8 hidden 대입
{
  const hits = [];
  for (const p of tsFiles.filter((q) => /src\/(ui|render)\//.test(q))) {
    const t = strip(await readFile(p, 'utf8'));
    if (!/\.hidden\s*=/.test(t)) continue;
    // panels.js 를 import 하는 파일(창·독)만 hidden 을 만질 수 있다 — 소유권을 아는 자리
    const okFile = /hud\.ts$|dom\.ts$/.test(p) || /panelHost/.test(t) || /from '[./]+\/panels\.js'/.test(t);
    if (!okFile) hits.push(p);
  }
  ok('S8', '`hidden =` 대입은 panelHost 를 아는 파일뿐', hits.length === 0, hits.join(' · '));
}

// S9 FX 등록부 밖 트윈
{
  const hits = [];
  for (const p of tsFiles.filter((q) => /src\/(ui|render|assets)\//.test(q) && !/render\/fx\//.test(q))) {
    const t = strip(await readFile(p, 'utf8'));
    if (/\btweens\.add\(|\badd\.particles\(/.test(t)) hits.push(p);
  }
  ok('S9', 'tweens.add / particles 는 render/fx 안에서만', hits.length === 0, hits.join(' · '));
}

if (fails.length) { console.log(`\n❌ 실패 ${fails.join(', ')}`); process.exit(1); }
console.log('\n✅ UI 정적 검사 통과');

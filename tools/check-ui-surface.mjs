#!/usr/bin/env node
/**
 * HUD 표면 정적 검사 (K29) — **브라우저를 안 띄우고 파일만 읽는다.**
 *
 * "레시피가 실제로 들어갔나"는 렌더링 없이도 답할 수 있다. 브라우저 검사는 30초가
 * 걸리고 dev 서버가 필요한데, 이건 밀리초다. `npm run gate` 에 물려 커밋 전마다 돈다.
 * (MengTo/Skills 의 `verify-cursor-trail.mjs` 가 쓰는 방식이다.)
 *
 * 지키려는 것:
 *   · 다섯 컴포넌트에 재질(그라디언트 테두리 + 인셋 + 들림)이 실제로 있다
 *   · 눌린 상태가 있다 — 없으면 버튼이 안 눌린 것처럼 보인다
 *   · 애니메이션은 `transform`/`opacity` 만 만진다 (레이아웃 속성은 프레임을 떨군다)
 *   · `prefers-reduced-motion` 가드가 있다
 *   · **HUD 블록에 하드코딩 hex 가 없다** — 인라인·하드코딩으로 다시 새는 걸 막는다
 *     (K28 에서 스타일 체계가 둘로 갈라져 있던 것이 "투박하다"의 근본 원인이었다)
 */
import { readFile, readdir } from 'node:fs/promises';

const CSS = 'src/ui/style.css';
const MARK = '카이로 HUD (K28)';

const css = await readFile(CSS, 'utf8');
const at = css.indexOf(MARK);
if (at < 0) {
  console.error(`❌ ${CSS} 에서 "${MARK}" 블록을 못 찾았습니다`);
  process.exit(1);
}
const hud = css.slice(at);

/*
 * ⚠ **주석은 뺀다.** 주석 안의 색은 화면에 아무 영향이 없는데, 안 빼면 "예전엔
 * 청록이었다" 같은 설명을 못 쓴다 — 그러면 왜 바꿨는지가 코드에서 사라진다.
 * 규칙 안의 색은 그대로 잡힌다 (음성 대조군이 그걸 확인한다).
 */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');


const fails = [];
const pass = [];
const check = (ok, label, detail = '') => {
  (ok ? pass : fails).push(`${label}${detail ? ` — ${detail}` : ''}`);
};

/** 클래스 규칙 본문을 꺼낸다 (첫 번째 매칭만) */
/*
 * ⚠ **미디어 블록은 뺀다.** 모션 가드가 `.kbtn, .kitem, .kcourse-item { transition: none }`
 * 처럼 여러 클래스를 묶어 쓰는데, 그 블록이 파일 위쪽에 있어서 `rule('kcourse-item')`
 * 이 재질 규칙 대신 가드를 집었다 (실측 — 재질 검사 3건이 한꺼번에 빨개졌다).
 * 재질은 미디어 밖의 본 규칙에만 있다.
 */
const base = stripComments(hud).replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');

function rule(name) {
  const re = new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`);
  const m = re.exec(base);
  return m ? m[1] : null;
}

// ── 재질 ────────────────────────────────────────────────────────────────
// K33: 코스 프리셋 버튼도 같은 재질을 써야 한다 — 패널마다 재질이 갈리면 한 게임으로 안 보인다
for (const cls of ['kbtn', 'kcap', 'kitem', 'kcourse-item']) {
  const body = rule(cls);
  if (!body) {
    check(false, `.${cls} 규칙이 있다`);
    continue;
  }
  check(
    /padding-box/.test(body) && /border-box/.test(body),
    `.${cls} 에 그라디언트 테두리 (padding-box + border-box)`,
  );
  check(/--sk-inset/.test(body), `.${cls} 에 인셋 (상단 하이라이트·하단 그림자)`);
  check(/--sk-lift|--sk-press/.test(body), `.${cls} 에 그림자`);
}

for (const cls of ['kbtn', 'kitem', 'kcourse-item']) {
  const body = rule(`${cls}:active`);
  check(body !== null && /--sk-press/.test(body), `.${cls}:active 가 눌린 상태를 만든다`);
}

check(rule('kbar') !== null && /--bar-bg/.test(rule('kbar')), '.kbar 가 토큰 배경을 쓴다');
check(rule('ksheet') !== null && /animation/.test(rule('ksheet')), '.ksheet 에 등장 모션');
/*
 * K33: 코스 패널이 하단 바를 덮으면 안 된다. 예전엔 `bottom:0; z-index:20` 이라
 * 바를 통째로 가렸다 — `.ksheet`·`.kconfirm` 과 같은 자리에 얹혔는지 본다.
 */
check(
  rule('kcourse') !== null && /bottom:\s*calc\(56px \+ var\(--safe-b\)\)/.test(rule('kcourse')),
  '.kcourse 가 하단 바 위에 얹힌다 (바를 안 덮는다)',
);

// ── 모션 ────────────────────────────────────────────────────────────────
const transitions = [...hud.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
check(transitions.length > 0, '전환이 하나 이상 있다', `${transitions.length}개`);
const BAD_PROPS = /\b(width|height|top|left|right|bottom|margin|padding)\b/;
const badTransition = transitions.filter((t) => BAD_PROPS.test(t));
check(
  badTransition.length === 0,
  '전환이 레이아웃 속성을 안 만진다',
  badTransition.length ? badTransition.join(' | ') : 'transform·opacity·box-shadow 만',
);
check(
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(hud),
  'prefers-reduced-motion 가드가 있다',
);

/*
 * ⚠ **가드가 존재하는지만 보면 안 된다.** K33 에서 `.kcourse`(animation)와
 * `.kcourse-item`(transition)을 더하면서 가드에 안 넣었는데, 위 검사는 미디어 쿼리가
 * 있다는 이유로 통과했다. 움직임을 선언한 클래스가 **전부** 가드에 있는지 본다.
 */
const guard = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(hud);
const moving = new Set();
for (const m of stripComments(hud).matchAll(/\.([a-z][a-z0-9-]*)[^{}]*\{([^}]*)\}/g)) {
  if (/\b(transition|animation):\s*(?!none)/.test(m[2])) moving.add(m[1]);
}
const unguarded = [...moving].filter((c) => !(guard?.[1] ?? '').includes(`.${c}`));
check(
  moving.size > 0 && unguarded.length === 0,
  '움직이는 클래스가 전부 모션 가드에 있다',
  unguarded.length ? `빠진 것: ${unguarded.join(' ')}` : `${moving.size}개 전부`,
);

// ── 하드코딩 색 ─────────────────────────────────────────────────────────
const hexes = [...stripComments(hud).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
check(
  hexes.length === 0,
  'HUD 블록에 하드코딩 hex 가 없다 (토큰만)',
  hexes.length ? hexes.join(' ') : '0개',
);

// 토큰이 :root 에 실제로 선언돼 있나 — 오타로 var() 가 조용히 빈 값이 되는 걸 막는다
const root = css.slice(0, css.indexOf('}'));
const used = new Set([...hud.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
const missing = [...used].filter((v) => !root.includes(`${v}:`));
check(missing.length === 0, '쓰는 토큰이 전부 :root 에 선언돼 있다', missing.join(' '));

/*
 * ── TS 안의 색 (K34) ────────────────────────────────────────────────────
 *
 * 여기까지의 검사는 전부 `style.css` 만 봤다. 그래서 패널 6종의 TS 안에 하드코딩 색이
 * **103개** 쌓이는 동안 게이트는 초록이었다 — 이 프로젝트의 아홉 번째 "조용히 통과"다.
 *
 * 규칙은 "인라인 스타일 금지"가 아니라 **"하드코딩 색 금지"**다. 진행바 폭이나 캔버스
 * 크기 같은 **데이터**는 인라인으로 남아야 한다. 색만 `style.css` 가 소유한다.
 * 캔버스는 `src/ui/tokens.ts` 의 `cssVar()` 로 토큰을 읽는다.
 */
const TS_EXEMPT = new Map([
  ['src/ui/hud.ts', '폐기된 v1 씬 전속 — 마커 위 CSS 에 묶여 있다'],
  ['src/ui/tokens.ts', '토큰을 못 읽었을 때의 대비값 — 이 파일이 그 규칙의 출구다'],
]);

const uiFiles = (await readdir('src/ui'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => `src/ui/${f}`)
  .concat(['src/main.ts']);

const leaks = [];
for (const f of uiFiles) {
  if (TS_EXEMPT.has(f)) continue;
  const src = await readFile(f, 'utf8');
  // 주석은 뺀다 (CSS 쪽과 같은 이유 — 왜 바꿨는지를 코드에 남길 수 있어야 한다)
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const hits = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  if (hits.length > 0) leaks.push(`${f.replace('src/ui/', '')} ${hits.length}개`);
}
check(
  leaks.length === 0,
  'TS 에 하드코딩 색이 없다 — 색은 style.css 가 소유한다',
  leaks.length ? leaks.join(' · ') : `${uiFiles.length - TS_EXEMPT.size}개 파일 전부 0`,
);

/*
 * ── 패널은 한 번에 하나 (K37) ────────────────────────────────────────────
 *
 * 패널 8종이 각자 `this.root.hidden = false` 를 하고 "다른 걸 닫는다"를 아는 곳이 없었다.
 * 그래서 건설 시트를 열어 둔 채 도감을 열면 둘이 겹친 채로 남았다 (사용자 보고).
 *
 * `PanelHost` 하나로 모았는데, **아홉 번째 패널이 등록을 잊는 것**이 이 버그의 재발 경로다.
 * 그래서 규칙을 기계로 만든다: 자기 루트를 보이게 하는 파일은 `panelHost.open()` 을,
 * 감추는 파일은 `panelHost.closed()` 를 반드시 부른다.
 *
 * ⚠ "hidden 대입은 panels.ts 만"으로 만들지 않은 이유: 등장 처리(내용 다시 그리기·카메라
 * 잡기)가 패널마다 달라서 DOM 을 호스트가 만지면 그걸 뺏는다. 호스트는 **순서**만 정한다.
 */
const panelGaps = [];
for (const f of uiFiles) {
  const src = await readFile(f, 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // 자기 루트를 직접 여는/닫는 파일만 대상이다 (`this.root.hidden = …`)
  const opens = /this\.root\.hidden\s*=\s*false/.test(body);
  const closes = /this\.root\.hidden\s*=\s*true/.test(body);
  if (!opens && !closes) continue;
  const name = f.replace('src/ui/', '');
  if (opens && !/panelHost\.open\s*\(/.test(body)) panelGaps.push(`${name}: open 누락`);
  if (closes && !/panelHost\.closed\s*\(/.test(body)) panelGaps.push(`${name}: closed 누락`);
}
/*
 * 시트는 `this.root` 가 아니라 `this.sheet` 를 쓴다 (HUD 는 바까지 소유하므로 루트가
 * 시트가 아니다) — 별도로 확인한다. 안 보면 시트만 규칙 밖으로 빠진다.
 */
{
  const hud = (await readFile('src/ui/kairo-hud.ts', 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  if (!/panelHost\.open\s*\(/.test(hud)) panelGaps.push('kairo-hud.ts: open 누락 (시트)');
  if (!/panelHost\.closed\s*\(/.test(hud)) panelGaps.push('kairo-hud.ts: closed 누락 (시트)');
}
check(
  panelGaps.length === 0,
  '패널이 전부 PanelHost 를 거친다 — 한 번에 하나가 지켜진다',
  panelGaps.length ? panelGaps.join(' · ') : '루트를 여닫는 파일 전부 등록됨',
);

/*
 * ── 글씨가 읽히나 (K35) ─────────────────────────────────────────────────
 *
 * 밝은 팔레트로 바꾸면서 새로 생긴 실패 방식은 "예쁘지만 안 읽힘"이다. 어두운 팔레트에서
 * 맞던 대비가 그대로 뒤집히기 때문이다 (흰 글씨 + 밝은 표면). 눈으로만 보면 놓친다.
 *
 * WCAG 대비비로 잰다. 본문 4.5:1, 흐린 글씨·큰 글씨 3:1 이 기준이다.
 * 그라디언트는 **두 끝 중 나쁜 쪽**으로 잰다 — 한쪽만 맞으면 절반은 안 읽힌다.
 */
const rootBlock = css.slice(0, css.indexOf('}'));
const token = (name) => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(rootBlock);
  return m ? m[1].trim() : null;
};

/** `#rgb`/`#rrggbb`/`rgb(r g b / a%)` → [r,g,b] (알파는 흰 바탕에 합성) */
function toRgb(v, onto = [255, 255, 255]) {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+)%?)?/.exec(v);
  if (!m) return null;
  const c = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] === undefined) return c;
  const a = Number(m[4]) > 1 ? Number(m[4]) / 100 : Number(m[4]);
  return c.map((x, i) => Math.round(x * a + onto[i] * (1 - a)));
}

/** 그라디언트면 색 목록을, 단색이면 하나를 돌려준다 */
function stops(v) {
  if (v === null) return [];
  const found = [...v.matchAll(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g)].map((m) => m[0]);
  return (found.length ? found : [v]).map((x) => toRgb(x)).filter(Boolean);
}

const lum = ([r, g, b]) => {
  const f = (x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ['본문 · 패널', '--text', '--panel', 4.5],
  ['본문 · 시트', '--text', '--sheet-bg', 4.5],
  ['본문 · 전면', '--text', '--overlay-bg', 4.5],
  ['본문 · 하단바', '--text', '--bar-bg', 4.5],
  ['흐린 글씨 · 패널', '--text-dim', '--panel', 3],
  ['흐린 글씨 · 가라앉은면', '--text-dim', '--panel-sunk', 3],
  ['잠김 글씨 · 가라앉은면', '--text-mute', '--panel-sunk', 3],
  ['선택 표시 · 패널', '--accent', '--panel', 3],
  ['흰 글씨 · 주버튼', '--text-on-solid', '--panel-primary', 4.5],
  ['흰 글씨 · 위험', '--text-on-solid', '--risk-danger', 4.5],
  ['흰 글씨 · 경계', '--text-on-solid', '--risk-watch', 4.5],
  ['좋음 · 패널', '--good', '--panel', 3],
  ['나쁨 · 패널', '--bad', '--panel', 3],
  ['밝은칠 위 글씨 · 가족', '--on-light', '--group-family', 3],
];

const bad = [];
for (const [name, fg, bgTok, min] of PAIRS) {
  const f = stops(token(fg));
  const b = stops(token(bgTok));
  if (f.length === 0 || b.length === 0) {
    bad.push(`${name}(토큰 없음)`);
    continue;
  }
  // 두 끝 중 **나쁜 쪽**으로 판정한다
  let worst = Infinity;
  for (const bb of b) worst = Math.min(worst, ratio(f[0], bb));
  if (worst < min) bad.push(`${name} ${worst.toFixed(1)}:1 (필요 ${min})`);
}
check(
  bad.length === 0,
  '글씨가 읽힌다 — 대비비 (본문 4.5:1 · 보조 3:1)',
  bad.length ? bad.join(' · ') : `${PAIRS.length}쌍 전부 통과`,
);

// ── 보고 ────────────────────────────────────────────────────────────────
console.log('HUD 표면 정적 검사');
for (const p of pass) console.log(`  ✓ ${p}`);
for (const f of fails) console.log(`  ✕ ${f}`);
if (fails.length > 0) {
  console.log(`\n❌ ${pass.length}/${pass.length + fails.length} 통과`);
  process.exit(1);
}
console.log(`\n✅ ${pass.length}/${pass.length} 통과`);

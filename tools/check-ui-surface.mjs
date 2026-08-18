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
import { readFile } from 'node:fs/promises';

const CSS = 'src/ui/style.css';
const MARK = '카이로 HUD (K28)';

const css = await readFile(CSS, 'utf8');
const at = css.indexOf(MARK);
if (at < 0) {
  console.error(`❌ ${CSS} 에서 "${MARK}" 블록을 못 찾았습니다`);
  process.exit(1);
}
const hud = css.slice(at);

const fails = [];
const pass = [];
const check = (ok, label, detail = '') => {
  (ok ? pass : fails).push(`${label}${detail ? ` — ${detail}` : ''}`);
};

/** 클래스 규칙 본문을 꺼낸다 (첫 번째 매칭만) */
function rule(name) {
  const re = new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`);
  const m = re.exec(hud);
  return m ? m[1] : null;
}

// ── 재질 ────────────────────────────────────────────────────────────────
for (const cls of ['kbtn', 'kcap', 'kitem']) {
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

for (const cls of ['kbtn', 'kitem']) {
  const body = rule(`${cls}:active`);
  check(body !== null && /--sk-press/.test(body), `.${cls}:active 가 눌린 상태를 만든다`);
}

check(rule('kbar') !== null && /--bar-bg/.test(rule('kbar')), '.kbar 가 토큰 배경을 쓴다');
check(rule('ksheet') !== null && /animation/.test(rule('ksheet')), '.ksheet 에 등장 모션');

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

// ── 하드코딩 색 ─────────────────────────────────────────────────────────
const hexes = [...hud.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
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

// ── 보고 ────────────────────────────────────────────────────────────────
console.log('HUD 표면 정적 검사');
for (const p of pass) console.log(`  ✓ ${p}`);
for (const f of fails) console.log(`  ✕ ${f}`);
if (fails.length > 0) {
  console.log(`\n❌ ${pass.length}/${pass.length + fails.length} 통과`);
  process.exit(1);
}
console.log(`\n✅ ${pass.length}/${pass.length} 통과`);

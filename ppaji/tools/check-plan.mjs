// 계획 문서 정적 자 (P48-a, §14 소유 원칙) — docs/plan-ppaji-water.md 가 자기 규칙을 지키는지 센다.
//   ① §6 페이즈 표의 페이즈 id 집합 == 순서줄 == 게이트 절 == §5 소유 요약이 가리키는 페이즈 (없는 페이즈 참조 0)
//   ② 페이즈당 게이트 항목(자 종류 태그 수) ≤ 10
//   ③ §9 사람 확인 H35~ 의 페이즈가 §6 표에 있다
//   node tools/check-plan.mjs [--doc ../docs/plan-ppaji-water.md]
import { readFileSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const doc = readFileSync(arg('--doc', '../docs/plan-ppaji-water.md'), 'utf8');
const errors = [];
const phaseRows = [...doc.matchAll(/^\| \*\*(P\d+(?:-[a-c]\d?)?)\*\*(?: ✅)? \|/gm)].map((m) => m[1]);
const order = (doc.match(/`(P48-a → [^`]+)`/)?.[1] ?? '').split(' → ').map((s) => s.trim()).filter(Boolean);
const gateHeads = [...doc.matchAll(/^- \*\*(P\d+(?:-[a-c]\d?)?)\*\*: /gm)].map((m) => m[1]);
const set = new Set(phaseRows);
for (const p of order) if (!set.has(p)) errors.push(`순서줄의 ${p} 가 §6 표에 없다`);
for (const p of gateHeads) if (!set.has(p)) errors.push(`게이트 절의 ${p} 가 §6 표에 없다`);
for (const p of phaseRows) { if (!order.includes(p)) errors.push(`§6 표의 ${p} 가 순서줄에 없다`); if (!gateHeads.includes(p)) errors.push(`§6 표의 ${p} 에 게이트 절이 없다`); }
// ② 게이트 항목 수
const gateSec = doc.slice(doc.indexOf('### 게이트'), doc.indexOf('### 밴드'));
const blocks = gateSec.split(/\n(?=- \*\*P)/);
for (const b of blocks) {
  const m = b.match(/^- \*\*(P[^*]+)\*\*/); if (!m) continue;
  const n = (b.match(/\((단위|정적|하네스|봇|골든)(?:[+·, ][^)]*)?\)/g) ?? []).length;
  if (n > 10) errors.push(`${m[1]} 게이트 항목 ${n} > 10`);
}
// ①' 소유 요약 표가 가리키는 페이즈
const own = doc.slice(doc.indexOf('**소유 요약**'), doc.indexOf('- **`src/sim/grid.ts`**'));
for (const m of own.matchAll(/\*\*(P\d+(?:-[a-c]\d?)?)(?:\([^)]*\))?\*\*/g)) if (!set.has(m[1])) errors.push(`소유 요약의 ${m[1]} 가 §6 표에 없다`);
// ③ H 표
for (const m of doc.matchAll(/H(\d+)[^(]*\((P[^)]+)\)/g)) { const ps = m[2].split('·').map((s) => s.trim()); for (const p of ps) if (/^P\d/.test(p) && !set.has(p)) errors.push(`H${m[1]} 의 ${p} 가 §6 표에 없다`); }
// ④ (P53-c) 소유 요약의 `파일:줄` 참조 — 파일이 있고 줄 번호가 파일 길이 안이다 (내용 대조는 안 한다 — 역사 기록이라 줄은 흐른다)
import { existsSync, statSync } from 'node:fs';
const ownSec = doc.slice(doc.indexOf('**소유 요약**'), doc.indexOf('## 6.') > 0 ? doc.indexOf('## 6.') : doc.length);
const fileLines = (f) => { try { return readFileSync(f, 'utf8').split('\n').length; } catch { return -1; } };
let refs = 0;
for (const m of ownSec.matchAll(/`((?:src|tools)\/[A-Za-z0-9_./-]+\.(?:ts|mjs|json)):(\d+)/g)) {
  refs++;
  const f = m[1], line = Number(m[2]);
  const n = fileLines(f);
  if (n < 0) errors.push(`소유 요약의 파일 ${f} 가 없다`); else if (line > n) errors.push(`소유 요약의 ${f}:${line} — 파일은 ${n}줄`);
}
// ⑤ (P53-c) §9 사람 확인 H35~ 가 human-check.md 에 같은 페이즈로 있다
const hc = existsSync('docs/human-check.md') ? readFileSync('docs/human-check.md', 'utf8') : '';
const hcRows = new Map([...hc.matchAll(/^\| H(\d+) \| [^|]* \| ([^|]*) \|/gm)].map((m) => [Number(m[1]), m[2].trim()]));
for (const m of doc.matchAll(/H(\d+)[^(·]*\((P[^)]+)\)/g)) {
  const n = Number(m[1]); if (n < 35) continue;
  const ph = m[2].split('·')[0].trim();
  if (!hcRows.has(n)) errors.push(`human-check.md 에 H${n} 이 없다`);
  else if (!hcRows.get(n).includes(ph)) errors.push(`human-check.md H${n} 페이즈 ${hcRows.get(n)} ≠ 계획 ${ph}`);
}
void statSync;
console.log(`페이즈 ${phaseRows.length} · 게이트 절 ${gateHeads.length} · 파일:줄 참조 ${refs} · H 표 ${hcRows.size} · 오류 ${errors.length}`);
for (const e of errors) console.log('  ✗', e);
process.exit(errors.length ? 1 : 0);

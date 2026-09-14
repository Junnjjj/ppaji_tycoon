// 범용 참조 계수기 (P48-a, §14 D258) — 정규식 + 허용목록으로 `src tools` 를 훑어 발생·줄·파일·심볼별로 센다.
// 문서는 이 출력에서만 수를 인용한다(손으로 센 수는 갈린다). `check-tiles-dead.mjs`(P49-a2)가 이것을 import 한다.
//   node tools/ref-count.mjs --re 'isRiverRow|RIVER\.j0|waterRowMax|riverFloorFor' [--keep 'poolTiles=수역 칸 수'] [--roots src,tools] [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function countRefs({ roots = ['src', 'tools'], re, keep = [] }) {
  const rx = new RegExp(re, 'g');
  const byFile = {}, bySymbol = {}; let hits = 0, lines = 0, kept = 0;
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) { if (n !== 'node_modules' && n !== 'dist') walk(p); } else if (/\.(ts|mjs|js|json)$/.test(n)) scan(p); } };
  const scan = (p) => {
    const txt = readFileSync(p, 'utf8').split('\n');
    txt.forEach((line, li) => {
      if (keep.some(([k]) => new RegExp(k).test(line))) { kept++; return; }
      const m = line.match(rx); if (!m) return;
      hits += m.length; lines++; byFile[p] = (byFile[p] ?? 0) + m.length; for (const s of m) bySymbol[s] = (bySymbol[s] ?? 0) + 1;
      void li;
    });
  };
  for (const r of roots) walk(r);
  return { hits, lines, files: Object.keys(byFile).length, kept, byFile, bySymbol };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
  const re = arg('--re', null); if (!re) { console.error('--re 필요'); process.exit(2); }
  const keep = (arg('--keep', '') || '').split(';').filter(Boolean).map((s) => s.split('='));
  const roots = (arg('--roots', 'src,tools')).split(',');
  const r = countRefs({ roots, re, keep });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r));
  else {
    console.log(`${r.hits} 발생 / ${r.lines} 줄 / ${r.files} 파일 (허용목록 ${r.kept}줄)`);
    for (const [s, n] of Object.entries(r.bySymbol).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${n}`);
    for (const [f, n] of Object.entries(r.byFile).sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${f}`);
  }
}

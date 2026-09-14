#!/usr/bin/env node
// P49-a2 §4.4 — 물빛(타일) 참조가 src·tools 에 0건임을 단언한다. 참조 목록은 손으로 유지하지 않는다 — 정규식 + 허용목록 2줄.
//   node tools/check-tiles-dead.mjs            → 0건이면 exit 0
//   node tools/check-tiles-dead.mjs --selftest  → 자기 자신이 위반을 잡는지(합성 문자열) 확인
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RE = /TILE_DEFS|TileDef\b|TILE_INDEX|poolTile\b|poolTileAt|unlocked\.tiles|retile|tileDef\b|tileDefs\b|tileCount\b|TILE_KO|tiles\.json|kind:\s*'tile'|kind === 'tile'/;
const ALLOW = [/poolTileCost/, /poolTiles\b/]; // 허용 2줄 — 수역 칸 값·칸 수는 물빛이 아니다
const roots = ['src', 'tools'];
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name === 'node_modules' || name === '__fixtures__') continue; walk(p); continue; }
    if (!/\.(ts|mjs|json|css)$/.test(name) || p.endsWith('check-tiles-dead.mjs')) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, k) => { if (RE.test(line) && !ALLOW.some((a) => a.test(line))) hits.push(`${p}:${k + 1}: ${line.trim().slice(0, 100)}`); });
  }
}
if (process.argv.includes('--selftest')) {
  const bad = ["const TILE_DEFS = [];", "g.retilePool(1, 'kairo')", "for (const id of s.unlocked.tiles)"].filter((l) => RE.test(l) && !ALLOW.some((a) => a.test(l)));
  const ok = bad.length === 3 && !RE.test('poolTileCost: 100') && !RE.test('poolTiles: g.pools.totalTiles()');
  console.log(ok ? '✅ check-tiles-dead --selftest: 위반 3/3 잡힘 · 허용 2/2 통과' : '❌ check-tiles-dead --selftest 실패');
  process.exit(ok ? 0 : 1);
}
for (const r of roots) walk(r);
if (hits.length) { console.log(`❌ 물빛 참조 ${hits.length}건`); for (const h of hits) console.log('  ' + h); process.exit(1); }
console.log('✅ 물빛 참조 0건 (src·tools)');

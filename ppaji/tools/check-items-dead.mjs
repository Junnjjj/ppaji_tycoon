#!/usr/bin/env node
// P60-a §10.1 (D71) — 색·향·소품 참조가 src 의 .ts(테스트 제외) 에 0건임을 단언한다. 참조 목록은 손으로 유지하지 않는다 — 정규식 + 허용목록.
//   node tools/check-items-dead.mjs            → 0건이면 exit 0
//   node tools/check-items-dead.mjs --selftest  → 사본 파일에 위반 4줄 + 허용 1줄을 심어 자기 자신이 잡는지 본다
// 잡는 것: `items.json` · `ItemDef` · `PoolColor` · `scent`(대소문자 무시 — `Scent`·`SCENT_KO`·`scentPower`) · `putItem` · `favColor`
// 허용: 그림 등록부의 계열 `'item'`(`pictures.ts` — `pic/item/*` 24장은 그림 자산이라 남는다) · 이 자 자신
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const RE = /items\.json|\bItemDef\b|\bPoolColor\b|scent|\bputItem\b|\bfavColor\b/i;
const ALLOW = [/pictureId\('item'/, /'item'\s*\|/, /\|\s*'item'/]; // 그림 계열 'item' — 등록부(pictures.ts)의 유니언·호출부
const roots = ['src'];

function scanDir(dir, hits) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name === 'node_modules' || name === '__fixtures__') continue; scanDir(p, hits); continue; }
    if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) continue;
    scanFile(p, hits);
  }
}
function scanFile(p, hits) {
  const lines = readFileSync(p, 'utf8').split('\n');
  lines.forEach((line, k) => { if (RE.test(line) && !ALLOW.some((a) => a.test(line))) hits.push(`${p}:${k + 1}: ${line.trim().slice(0, 100)}`); });
}

if (process.argv.includes('--selftest')) {
  // 사본에 위반을 심는다 — 잡지 못하는 자는 아무것도 안 재고 있다 (seam --selftest 패턴)
  const dir = mkdtempSync(join(tmpdir(), 'items-dead-'));
  const bad = ["import items from '../data/items.json';", "export interface ItemDef { id: string }", "const st = { scent: null as Scent | null };", "g.putItem(p.id, 'strawberry');"];
  const ok = ["export type PictureKind = 'ingredient' | 'item' | 'gift';", "return pictureEl(pictureId('item', id), 'pool');"];
  const file = join(dir, 'fault.ts');
  writeFileSync(file, [...ok, ...bad].join('\n') + '\n');
  const hits = [];
  scanFile(file, hits);
  const caught = bad.filter((l) => hits.some((h) => h.includes(l.slice(0, 30)))).length;
  const falsePos = ok.filter((l) => hits.some((h) => h.includes(l.slice(0, 30)))).length;
  const pass = caught === bad.length && falsePos === 0 && hits.length === bad.length;
  console.log(pass ? `✅ check-items-dead --selftest: 위반 ${caught}/${bad.length} 잡힘 · 허용 ${ok.length}/${ok.length} 통과` : `❌ check-items-dead --selftest 실패 — 잡힘 ${caught}/${bad.length} · 오탐 ${falsePos}\n  ${hits.join('\n  ')}`);
  process.exit(pass ? 0 : 1);
}
const hits = [];
for (const r of roots) scanDir(r, hits);
if (hits.length) { console.log(`❌ 색·향·소품 참조 ${hits.length}건 (src .ts, 테스트 제외)`); for (const h of hits) console.log('  ' + h); process.exit(1); }
console.log('✅ 색·향·소품 참조 0건 (src .ts, 테스트 제외)');

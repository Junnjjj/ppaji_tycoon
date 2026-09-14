// 에셋 계약 정적 자 (P55) — docs/ppaji-asset-contract.md 가 §14 물 개편 뒤의 계약을 지키는지 센다.
//   ① `buoy/` 0건(물빛 축 폐기, P49-a2) ② `tile/pontoon` 3프레임 · `pontoon_edge` 4 ③ `overlay/` 7종 ④ 부력선 게이트 줄 ⑤ 절차 폴백 실루엣 셋 ⑥ 견인 4종 재생성 목록
//   ⑦ manifest 에 `buoy/` id 0 ⑧ 코드의 폴백 템플릿 셋(`floatPad`·`tower`·`plank`)이 `DEFAULT_BY_CLASS`/`rigTemplate` 에 있다 ⑨ human-check H44 판정 칸
//   node tools/check-assets.mjs [--selftest]   — selftest 는 계약 사본에 위반 4종을 주입해 자가 잡히는지 본다
import { readFileSync } from 'node:fs';
const DOC = '../docs/ppaji-asset-contract.md';
const doc0 = readFileSync(DOC, 'utf8');
const manifest = readFileSync('src/assets/manifest.json', 'utf8');
const facDraw = readFileSync('src/assets/draw/facility.ts', 'utf8') + readFileSync('src/assets/draw/fac-sprites.ts', 'utf8');
const hc = readFileSync('docs/human-check.md', 'utf8');

function check(doc) {
  const errors = [];
  const n = (re) => (doc.match(re) ?? []).length;
  if (n(/`buoy\//g) > 0) errors.push(`계약에 buoy/ 가 ${n(/`buoy\//g)}건 — 부표 13 은 P49-a2 에서 지웠다`);
  if (!/`tile\/pontoon\[:a0~2\]`/.test(doc)) errors.push('계약에 `tile/pontoon[:a0~2]`(3프레임) 줄이 없다');
  if (!/`tile\/pontoon_edge\/<mask>`/.test(doc)) errors.push('계약에 `tile/pontoon_edge/<mask>` 줄이 없다');
  const ov = ['rig_off', 'rig_link', 'rig_upgraded', 'grade_flag/1..4'];
  for (const o of ov) if (!doc.includes(`overlay/${o}`)) errors.push(`계약에 overlay/${o} 가 없다`);
  if (!/\*\*7종\*\*/.test(doc)) errors.push('오버레이 줄에 「7종」 표기가 없다');
  if (!/6\. \*\*부력선\*\*.*알파 평균 < 0\.8/.test(doc)) errors.push('게이트 6 부력선(아래 4텍셀 알파 평균 < 0.8) 줄이 없다');
  for (const t of ['floatPad', 'tower', 'plank']) if (!doc.includes(`\`${t}\``)) errors.push(`절차 폴백 실루엣 ${t} 가 계약에 없다`);
  for (const b of ['flycarpet', 'swing', 'air_chair', 'hydrofoil']) if (!doc.includes(`\`${b}\``)) errors.push(`견인 재생성 목록에 ${b} 가 없다`);
  if (/"buoy\//.test(manifest)) errors.push('manifest 에 buoy/ id 가 남아 있다');
  for (const t of ['floatPad', 'tower', 'plank']) if (!facDraw.includes(`'${t}'`)) errors.push(`코드 폴백 템플릿 ${t} 가 없다`);
  if (!/^\| H44 \|/m.test(hc)) errors.push('human-check.md 에 H44 판정 칸이 없다');
  return errors;
}

if (process.argv.includes('--selftest')) {
  const faults = [
    ['buoy-row', (d) => d + '\n| `buoy/<color>` | 32×16 | 부표 |\n'],
    ['no-overlay', (d) => d.replace('overlay/rig_link', 'overlay/rig_lnk')],
    ['no-buoyancy', (d) => d.split('알파 평균 < 0.8').join('알파 평균 < 0,8')],
    ['no-plank', (d) => d.split('`plank`').join('`board`')],
  ];
  let caught = 0;
  for (const [id, edit] of faults) { const e = check(edit(doc0)); const hit = e.length > check(doc0).length; console.log(`  ${hit ? '✓' : '✕'} selftest ${id}`); if (hit) caught++; }
  if (caught !== faults.length) { console.log(`❌ check-assets selftest ${caught}/${faults.length}`); process.exit(1); }
  console.log(`✅ check-assets --selftest: 위반 ${caught}/${faults.length} 잡힘`);
}
const errors = check(doc0);
console.log(`에셋 계약 — 오류 ${errors.length}`);
for (const e of errors) console.log('  ✗', e);
process.exit(errors.length ? 1 : 0);

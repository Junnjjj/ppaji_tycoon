/**
 * `docs/assets/maintenance/legacy-v2-regeneration.md` §1 의 **표를 생성한다.**
 *
 *   npx tsx tools/regen-table.ts            표 셋(A·B·C)을 찍는다
 *   npx tsx tools/regen-table.ts --pass     「건드리지 말 것」의 통과 목록
 *
 * ## 왜 도구인가 — 손으로 적은 표는 조용히 거짓이 된다
 *
 * §1 의 표는 게이트 실측이고 그림이 바뀔 때마다 낡는다. 예전에는 이 생성기가
 * **문서 안의 코드블록**으로만 있었는데, 그러면 (1) 아무도 안 돌리고 (2) 돌려도
 * 문서의 사본과 실제 게이트가 갈라졌는지 알 수 없다. 도구로 두면 `--verify` 가
 * 문서와 실측을 대조할 수 있다.
 *
 * ## 무리 나누기 — 게이트 4 와 5 의 곱
 *
 *   A = 접지 위반 ∩ 광원 위반   ← 한 번 뽑아 둘을 잡는다
 *   B = 접지 위반 − 광원 위반
 *   C = 광원 위반 − 접지 위반   ← 재생성 도구가 접지만 보던 시절엔 대상이 아니었다
 *
 * ⚠ 광원 위반은 **`뒤집힘`·`측정불가` 뿐**이다. `평탄` 은 게이트 5 가 findings 에 안
 * 넣으므로 여기서도 위반이 아니다 (`regen-facility.ts` 의 `passed` 주석).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allSimFacilities, renderSpec, assetIdToFile } from '../src/assets/kairo-contract.js';
import { decodePng } from './png.js';
import {
  measureSprite,
  measureCanonical,
  canonicalWedgeArea,
  geomVerdict,
  type GeomAxis,
} from './ground-geometry.js';
import { measureLight, lightVerdict, type LightVerdict } from './light-direction.js';

const PACK = 'assets/generated/kairo';
const DOC = 'docs/assets/maintenance/legacy-v2-regeneration.md';

const AXIS_NAME: Record<GeomAxis, string> = { vertex: '꼭짓점', slope: '기울기', iou: '모양' };
const LIGHT_NAME: Record<LightVerdict, string> = {
  'upper-left': '좌상단',
  flipped: '뒤집힘',
  flat: '평탄',
  unmeasurable: '측정불가',
};

/**
 * `수리 이력` — **문서 §5.1 의 되돌림 표를 되읽는다.** 같은 id 를 두 곳에 적지 않으려는
 * 것이고, 그 표가 사람이 겪은 일의 기록이라 실측으로는 못 만든다.
 */
function repairHistory(): { reverted: Set<string>; mirrored: Set<string> } {
  const doc = readFileSync(DOC, 'utf8');
  const i = doc.indexOf('| 되돌림 | id |');
  const reverted = new Set<string>();
  const mirrored = new Set<string>();
  if (i < 0) return { reverted, mirrored };
  const sec = doc.slice(i).split('\n\n')[0] ?? '';
  let mirrorMode = false;
  for (const ln of sec.split('\n')) {
    if (ln.includes('**미러 전용**')) {
      mirrorMode = true;
      continue;
    }
    const m = /^\| .+? \| `(\w+)` \|/.exec(ln);
    if (m) (mirrorMode ? mirrored : reverted).add(m[1]!);
  }
  return { reverted, mirrored };
}

interface Row {
  id: string;
  name: string;
  w: number;
  d: number;
  canvasW: number;
  canvasH: number;
  bad: GeomAxis[];
  severe: boolean;
  vertexTexels: number | null;
  wedgeIoU: number;
  iouMin: number;
  slopeLeft: number | null;
  slopeRight: number | null;
  cover: number;
  lightV: LightVerdict;
  lightScore: number | null;
  lightLeft: number;
  lightRight: number;
  noMargin: boolean;
}

export function measureAll(): Row[] {
  const { reverted } = repairHistory();
  void reverted;
  const out: Row[] = [];
  for (const def of allSimFacilities()) {
    const spec = renderSpec(`facility/${def.id}`);
    if (!spec) continue;
    const file = join(PACK, assetIdToFile(`facility/${def.id}`));
    let png;
    try {
      png = decodePng(file);
    } catch {
      continue; // 팩에 그림이 없다 — 게이트 3 이 잡는다
    }
    const [w, d] = def.size;
    const bodyH = spec.bodyH;
    const m = measureSprite(png, w, d, bodyH);
    const want = measureCanonical(w, d, bodyH);
    const v = geomVerdict(def.id, m, want, png.w, canonicalWedgeArea(w, d, bodyH), [w, d]);
    const light = measureLight(png);
    out.push({
      id: def.id,
      name: def.name,
      w,
      d,
      canvasW: png.w,
      canvasH: png.h,
      bad: v.bad,
      severe: v.severe,
      vertexTexels: v.vertexTexels,
      wedgeIoU: m.wedgeIoU,
      iouMin: v.iouMin,
      slopeLeft: m.slopeLeft,
      slopeRight: m.slopeRight,
      cover: m.cover,
      lightV: lightVerdict(light),
      lightScore: light.score,
      lightLeft: light.left,
      lightRight: light.right,
      noMargin: false,
    });
  }
  return out;
}

const geomBad = (r: Row): boolean => r.bad.length > 0;
const lightBad = (r: Row): boolean => r.lightV === 'flipped' || r.lightV === 'unmeasurable';

export function groups(rows: Row[]): { A: Row[]; B: Row[]; C: Row[]; pass: Row[] } {
  const byGeom = (a: Row, b: Row): number =>
    Number(b.severe) - Number(a.severe) ||
    (b.vertexTexels ?? 0) - (a.vertexTexels ?? 0) ||
    a.wedgeIoU - b.wedgeIoU;
  const byLight = (a: Row, b: Row): number =>
    Math.abs(a.lightScore ?? 1e9) - Math.abs(b.lightScore ?? 1e9);
  return {
    A: rows.filter((r) => geomBad(r) && lightBad(r)).sort(byGeom),
    B: rows.filter((r) => geomBad(r) && !lightBad(r)).sort(byGeom),
    C: rows.filter((r) => !geomBad(r) && lightBad(r)).sort(byLight),
    pass: rows.filter((r) => !geomBad(r) && !lightBad(r)),
  };
}

const sl = (v: number | null, sign: string): string =>
  v === null ? '—' : `${v >= 0 ? sign : ''}${v.toFixed(3)}`;
const ls = (r: Row): string => (r.lightScore === null ? '—' : `${r.lightScore >= 0 ? '+' : ''}${r.lightScore.toFixed(1)}`);

function tag(id: string, h: { reverted: Set<string>; mirrored: Set<string> }): string {
  return h.reverted.has(id) ? '**수리 불가**' : h.mirrored.has(id) ? '**미러 전용**' : '—';
}

function main(): void {
  const rows = measureAll();
  const g = groups(rows);
  const h = repairHistory();

  if (process.argv.includes('--pass')) {
    console.log(
      `- **두 게이트를 다 통과한 ${g.pass.length}종** — 건드리지 말 것:\n  ` +
        g.pass
          .map((r) => r.id)
          .sort()
          .map((i) => `\`${i}\``)
          .join(' '),
    );
    return;
  }

  const HA =
    '| 시설 | id | 발자국 | 캔버스 | 꼭짓점 이탈 | IoU (문턱) | 실패 축 | 기울기 L/R | 광원 | 덮임 | 수리 이력 |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|';
  const HB =
    '| 시설 | id | 발자국 | 캔버스 | 꼭짓점 이탈 | IoU (문턱) | 실패 축 | 기울기 L/R | 덮임 | 수리 이력 |\n' +
    '|---|---|---|---|---|---|---|---|---|---|';
  const common = (r: Row): string =>
    `| ${r.name} | \`${r.id}\` | ${r.w}×${r.d} | ${r.canvasW}×${r.canvasH} | ` +
    `${(r.vertexTexels ?? 0).toFixed(1)}tx | ${r.wedgeIoU.toFixed(3)} (≥${r.iouMin.toFixed(3)}) | ` +
    `${r.bad.map((b) => AXIS_NAME[b]).join('·') || '—'} | ${sl(r.slopeLeft, '+')}/${sl(r.slopeRight, '')} | `;

  console.log(`### A — 접지와 광원이 **둘 다** 틀린 ${g.A.length}종  ← **여기부터**\n`);
  console.log('한 번 다시 뽑아 **둘을 같이 잡는다.**\n');
  console.log(HA);
  for (const r of g.A)
    console.log(
      `${common(r)}${LIGHT_NAME[r.lightV]} ${ls(r)} | ${Math.round(r.cover * 100)}% | ${tag(r.id, h)} |`,
    );

  console.log(`\n### B — 접지만 ${g.B.length}종\n`);
  console.log(HB);
  for (const r of g.B) console.log(`${common(r)}${Math.round(r.cover * 100)}% | ${tag(r.id, h)} |`);

  console.log(`\n### C — 광원만 ${g.C.length}종\n`);
  console.log('접지는 **통과**다. 그림자가 오른쪽에서 온다.\n');
  console.log('| 시설 | id | 발자국 | 캔버스 | 광원 점수 | 왼쪽/오른쪽 열 |\n|---|---|---|---|---|---|');
  for (const r of g.C)
    console.log(
      `| ${r.name} | \`${r.id}\` | ${r.w}×${r.d} | ${r.canvasW}×${r.canvasH} | ` +
        `${r.lightV === 'unmeasurable' ? '측정불가' : ls(r)} | ${r.lightLeft}/${r.lightRight} |`,
    );

  console.log(
    `\n<!-- 생성: npx tsx tools/regen-table.ts · A ${g.A.length} · B ${g.B.length} · ` +
      `C ${g.C.length} · 통과 ${g.pass.length} (합 ${rows.length}) -->`,
  );
}

if ((process.argv[1] ?? '').endsWith('regen-table.ts')) main();

/**
 * 카이로 에셋 게이트 — 스펙 §8.
 *
 * v1 스펙은 게이트 7개를 선언했지만 **자동 실행 가능한 건 1개뿐**이었다 (적대적 리뷰).
 * 그래서 에셋을 뽑기 전에 이 도구를 먼저 만든다. 순서를 바꾸면 119장을 뽑은 뒤에
 * 규격 위반을 발견한다.
 *
 *   npm run gate            계약 정합 + (있으면) 생성물 PNG 크기
 *   npm run gate -- --json  기계 판독 출력
 *
 * 지금 검사하는 것:
 *   1. 계약 두 개(렌더/시뮬)의 정합 — 캔버스 파생 수식·앵커·슬롯·오픈탑
 *   2. 플레이스홀더 드로어 누락
 *   3. 생성물이 있으면 PNG 실측 크기 vs 계약 캔버스
 *
 * 아직 못 하는 것 (브라우저가 필요하다 — K2 에서 verify:mobile 계열로 붙인다):
 *   · 앵커 실측 (실루엣 최하단이 앵커선에 접하는지)
 *   · 타일링 4방 이음새
 *   · 윤곽률·팔레트 (양자화기가 담당)
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateContracts, kairoSpriteSpecs, KAIRO } from '../src/assets/kairo-contract.js';
import { KairoProceduralProvider } from '../src/assets/kairo-procedural.js';

interface Finding {
  gate: string;
  id: string;
  detail: string;
}

/** PNG 헤더에서 폭·높이만 읽는다 (디코딩 없이) */
function pngSize(path: string): { w: number; h: number } | null {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function walkPngs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkPngs(p, out);
    else if (e.endsWith('.png')) out.push(p);
  }
  return out;
}

function run(): { findings: Finding[]; counts: Record<string, number> } {
  const findings: Finding[] = [];

  // 게이트 1 — 계약 정합
  for (const v of validateContracts()) {
    const id = v.split(':')[0] ?? '';
    findings.push({ gate: '계약정합', id, detail: v });
  }

  // 게이트 2 — 드로어 누락
  for (const id of KairoProceduralProvider.missingDrawers()) {
    findings.push({ gate: '드로어누락', id, detail: '플레이스홀더 드로어가 없다' });
  }

  const specs = kairoSpriteSpecs();
  const bySprite = new Map(specs.map((s) => [s.id, s]));

  // 게이트 3 — 생성물 PNG 크기 (있을 때만)
  const genRoot = 'assets/generated/kairo';
  const pngs = walkPngs(genRoot);
  for (const p of pngs) {
    // assets/generated/kairo/<zone>/<id>/final-*.png → sprite id 추정
    const parts = p.split('/');
    const id = parts[parts.length - 2];
    if (!id) continue;
    const spec = bySprite.get(`facility/${id}`) ?? bySprite.get(id);
    if (!spec) {
      findings.push({ gate: '생성물', id, detail: `계약에 없는 산출물: ${p}` });
      continue;
    }
    const size = pngSize(p);
    if (!size) {
      findings.push({ gate: '생성물', id, detail: `PNG 헤더를 못 읽었다: ${p}` });
      continue;
    }
    if (size.w !== spec.size[0] || size.h !== spec.size[1]) {
      findings.push({
        gate: '캔버스크기',
        id,
        detail: `실측 ${size.w}×${size.h} ≠ 계약 ${spec.size[0]}×${spec.size[1]} (${p})`,
      });
    }
  }

  const images = new KairoProceduralProvider().ids.length;
  return {
    findings,
    counts: {
      시설: KAIRO.facilities.length,
      명세: specs.length,
      이미지: images,
      생성물: pngs.length,
    },
  };
}

const json = process.argv.includes('--json');
const { findings, counts } = run();

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, counts, findings }, null, 2));
} else {
  console.log('카이로 에셋 게이트');
  console.log(
    `  시설 ${counts['시설']}종 · 스프라이트 명세 ${counts['명세']} · 이미지 ${counts['이미지']}장 · 생성물 ${counts['생성물']}장`,
  );
  if (counts['생성물'] === 0) {
    console.log('  (생성물 없음 — 플레이스홀더로 돌고 있다. 에셋 생산은 골 밖)');
  }
  if (findings.length === 0) {
    console.log('  ✅ 위반 0');
  } else {
    console.log(`  ❌ 위반 ${findings.length}`);
    for (const f of findings) console.log(`     [${f.gate}] ${f.id} — ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);

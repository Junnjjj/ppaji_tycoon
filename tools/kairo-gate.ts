/**
 * 카이로 에셋 게이트 — 스펙 §8.
 *
 * v1 스펙은 게이트 7개를 선언했지만 **자동 실행 가능한 건 1개뿐**이었다 (적대적 리뷰).
 * 그래서 에셋을 뽑기 전에 이 도구를 먼저 만든다. 순서를 바꾸면 **144장**(현재 계약 ID 수)
 * 을 뽑은 뒤에 규격 위반을 발견한다 — 게이트 4 가 그 위험을 실증했다: 크기만 맞고
 * **각도가 틀린 그림 65종**이 게이트 3 을 통과한 채로 팩에 들어와 있었다.
 *
 *   npm run gate                계약 정합 + (있으면) 생성물 PNG 크기·접지 기하
 *   npm run gate -- --json      기계 판독 출력
 *   npm run gate -- --geom      게이트 4 실측 표 전체 (통과분 포함)
 *   npm run gate -- --strict    게이트 4 경고를 **실패**로 올린다
 *   npm run gate -- --selftest  음성 대조군만 자세히
 *
 * 지금 검사하는 것:
 *   1. 계약 두 개(렌더/시뮬)의 정합 — 캔버스 파생 수식·앵커·슬롯·오픈탑
 *   2. 플레이스홀더 드로어 누락
 *   3. 생성물이 있으면 PNG 실측 크기 vs 계약 캔버스
 *   4. **접지 기하** — 알파를 디코딩해 접지 다이아몬드의 각도·꼭짓점·모양 (K53)
 *
 * 여기서 **안** 하는 것:
 *   · 타일링 4방 이음새 — **별도 도구다** (`npm run seam`, `tools/seam-qa.ts`).
 *     dev 서버로 실제 화면을 찍어야 해서 이 도구에 못 넣는다. `verify:kairo` 가
 *     `seam-qa --selftest` 를 같이 돌린다
 *   · 윤곽률·팔레트 — 양자화기(`tools/process-kairo-sheet.py`)가 담당한다
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateContracts,
  kairoSpriteSpecs,
  kairoAssetSizes,
  assetFileToId,
  assetIdToFile,
  allSimFacilities,
  renderSpec,
  KAIRO,
} from '../src/assets/kairo-contract.js';
import { KairoProceduralProvider } from '../src/assets/kairo-procedural.js';
import { decodePng } from './png.js';
import {
  measureSprite,
  measureCanonical,
  canonicalWedgeArea,
  synthSprite,
  GEOM_HOLDOUT,
  geomVerdict,
  type GeomAxis,
  type GroundMeasure,
} from './ground-geometry.js';

interface Finding {
  gate: string;
  id: string;
  detail: string;
}

/** 경고는 종료 코드를 안 바꾼다 — 게이트 이름 하나로 정한다 (아래 `WARN_GATES`) */
const isWarn = (f: Finding): boolean => WARN_GATES.has(f.gate);

/**
 * ## 게이트 4 는 **지금은 경고**다
 *
 * 실측 시설 **65/75** 가 빨갛다 (지면은 33/33 통과 — `geometryGate` 주석 참조).
 * 이걸 곧바로 실패로 만들면 `npm run gate` 가 죽어서 **에셋과 무관한 작업까지 전부
 * 막힌다** — 그 65종을 고치는 일은 **재생성**이고, 무엇을 어떤 순서로 다시 뽑을지는
 * `docs/asset-regen-order.md` 에 있다 (이 게이트 출력에서 **생성**한 목록이다).
 * 그때까지 게이트는 **목록을 내는 일**을 한다.
 *
 * ⚠ **세는 기준은 "면제를 적용한 뒤"다** — 게이트 자신의 요약 줄이 내는 그 수다
 * (`npx tsx tools/kairo-gate.ts --geom` → `위반 65 (심각 19 · 축뒤집힘 12)`,
 * 통과 10 + 위반 65 = 75). 면제(`GEOM_HOLDOUT` 7종)를 안 걸면 **67** 이다:
 * `shade_net`(IoU 0.734 < 0.769) 과 `arcade`(0.649 < 0.667) 가 면제 덕에만 통과한다.
 * 숫자를 인용할 일이 있으면 위 명령을 다시 돌릴 것 — `docs/asset-regen-order.md` 는
 * 손으로 적은 것이 아니라 그 출력에서 **생성**한 목록이다.
 *
 * ⚠ 문턱을 "지금 통과하도록" 낮추지 않았다. 문턱은 투영에서 유도한 값이고
 * (`ground-geometry.ts` 머리말), 재생성이 끝나면 이 집합을 비워서 실패로 올린다.
 * `--strict` 가 그 최종 상태를 미리 돌려 보는 스위치다.
 *
 * ⚠ 이 집합의 문자열은 `Finding.gate` 에 넣는 리터럴(아래 `geometryGate`)과 **같아야
 * 한다**. 지금은 같은 한국어 문자열이 두 군데 따로 적혀 있어, 한쪽만 고치면 조용히
 * 갈라진다 — 이름이 어긋나면 경고가 **하드 실패로 승격**되어 `npm run gate` 가 죽거나
 * (`isWarn` 이 false), 반대로 게이트가 통째로 경고로 남는다. `GATE_FACILITY_ID` /
 * `TICKET_DEF_ID` 가 값만 겹쳐 있던 것과 같은 형태다 (CLAUDE.md 「다음 할 일」 7번).
 */
const WARN_GATES = new Set(['접지기하']);

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

function run(): { findings: Finding[]; counts: Record<string, number>; geom: GeomRow[] } {
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

  /*
   * 게이트 3 — 생성물 PNG 크기 (있을 때만).
   *
   * ⚠ 파일명 → ID 규칙은 **`assetFileToId` 하나**다. 예전엔 여기서 폴더 이름으로
   * ID 를 추측했는데(`.../<id>/final-*.png`), 생성물이 `docs/asset-prompts.md` 의
   * 평면 규칙(`facility__shop.png`)으로 바뀌자 144장이 통째로 "계약에 없는 산출물"로
   * 잡혔다 (실측). 규칙이 두 곳에 있으면 반드시 이렇게 갈라진다.
   */
  const genRoot = 'assets/generated/kairo';
  const pngs = walkPngs(genRoot);
  const sizes = kairoAssetSizes();
  const seen = new Set<string>();
  for (const p of pngs) {
    const file = p.split('/').pop() ?? '';
    const id = assetFileToId(file);
    if (!id || !sizes.has(id)) {
      findings.push({ gate: '생성물', id: id ?? file, detail: `계약에 없는 산출물: ${p}` });
      continue;
    }
    if (seen.has(id)) {
      findings.push({ gate: '생성물', id, detail: `같은 ID 의 파일이 둘 이상: ${p}` });
      continue;
    }
    seen.add(id);
    const want = sizes.get(id)!;
    const size = pngSize(p);
    if (!size) {
      findings.push({ gate: '생성물', id, detail: `PNG 헤더를 못 읽었다: ${p}` });
      continue;
    }
    if (size.w !== want[0] || size.h !== want[1]) {
      findings.push({
        gate: '캔버스크기',
        id,
        detail: `실측 ${size.w}×${size.h} ≠ 계약 ${want[0]}×${want[1]} (${p})`,
      });
    }
  }
  /*
   * 빠진 ID — **생성물이 하나라도 있을 때만** 본다. 0장은 "아직 안 뽑았다"(정상)이고,
   * 143장은 "한 장을 흘렸다"(사고)다. 둘을 같이 잡으면 게이트가 늘 빨간불이라 아무도 안 본다.
   */
  if (pngs.length > 0) {
    for (const id of sizes.keys()) {
      if (!seen.has(id)) findings.push({ gate: '생성물누락', id, detail: '팩에 그림이 없다' });
    }
  }

  /*
   * 게이트 4 — 접지 기하. 위 "생성물이 하나라도 있을 때만"과 **같은 이유**로 판을 건너뛴다
   * (팩이 없는 저장소에서 게이트가 늘 빨간불이면 아무도 안 본다).
   * ⚠ 다만 그때는 요약의 **`접지측정 0`** 이 "안 쟀다"의 유일한 신호다 — 아래 판정 줄은
   * 위반 0 이라 `✅` 로 보인다. 숫자를 인용하기 전에 `접지측정` 을 먼저 볼 것.
   */
  const geom = pngs.length > 0 ? geometryGate() : [];
  for (const g of geom) if (g.bad.length > 0) findings.push(g.finding!);

  const images = new KairoProceduralProvider().ids.length;
  return {
    findings,
    counts: {
      시설: KAIRO.facilities.length,
      명세: specs.length,
      이미지: images,
      생성물: pngs.length,
      접지측정: geom.length,
      접지위반: geom.filter((g) => g.bad.length > 0).length,
      접지심각: geom.filter((g) => g.bad.length > 0 && g.severe).length,
      접지축뒤집힘: geom.filter((g) => g.axesSwapped === true).length,
    },
    geom,
  };
}

// ────────────────────────────── 게이트 4 ──────────────────────────────

const GEN_DIR = 'assets/generated/kairo';

interface GeomRow {
  id: string;
  kind: '시설' | '지면';
  size: readonly [number, number];
  bodyH: number;
  m: GroundMeasure;
  want: GroundMeasure;
  bad: GeomAxis[];
  exempt: GeomAxis[];
  vertexTexels: number | null;
  slopeErrLeft: number | null;
  slopeErrRight: number | null;
  iouMin: number;
  severe: boolean;
  axesSwapped: boolean | null;
  finding?: Finding;
}

const AXIS_NAME: Record<GeomAxis, string> = { vertex: '바닥꼭짓점', slope: '기울기', iou: '모양' };

function geomRow(
  id: string,
  kind: '시설' | '지면',
  file: string,
  w: number,
  d: number,
  bodyH: number,
): GeomRow | null {
  const path = join(GEN_DIR, file);
  if (!existsSync(path)) return null;
  const png = decodePng(path);
  // 캔버스 크기가 계약과 다르면 게이트 3 이 이미 잡았다 — 여기서 또 세지 않는다
  if (png.h < bodyH + 8) return null;
  const m = measureSprite(png, w, d, bodyH);
  const want = measureCanonical(w, d, bodyH);
  const v = geomVerdict(id, m, want, png.w, canonicalWedgeArea(w, d, bodyH), [w, d]);
  const row: GeomRow = { id, kind, size: [w, d], bodyH, m, want, ...v };
  if (v.bad.length > 0) {
    row.finding = {
      gate: '접지기하',
      id,
      detail:
        `${v.severe ? '심각 ' : ''}${v.bad.map((a) => AXIS_NAME[a]).join('·')} — ` +
        `꼭짓점 ${fmt(m.bottomFrac)}(기대 ${fmt(want.bottomFrac)}, ${fmtTx(v.vertexTexels)}) · ` +
        `기울기 ${fmt(m.slopeLeft)}/${fmt(m.slopeRight)}(기대 +0.500/−0.500) · ` +
        `IoU ${m.wedgeIoU.toFixed(3)}(≥${v.iouMin.toFixed(3)})` +
        (v.axesSwapped === true ? ' · ⚠ 발자국 두 축이 바뀐 그림 (가이드를 뒤집어 재생성)' : ''),
    };
  }
  return row;
}

const fmt = (v: number | null): string => (v === null ? '—' : v.toFixed(3));
const fmtTx = (v: number | null): string => (v === null ? '측정불가' : `${v.toFixed(1)}텍셀`);

/**
 * 시설 75 + 지면 33 을 잰다.
 *
 * ⚠ **지면을 같이 재는 것이 이 게이트의 양성 대조군이다.** 후처리
 * (`tools/process-kairo-sheet.py`)는 지면·벽·배경에만 `diamond_mask()` 로 기하를
 * 강제하고 **시설에는 안 한다** — 그게 각도 이탈의 근본 원인이다 (계획서 ④).
 * 실측이 정확히 그 모양이다: 지면 33/33 이 IoU 1.000 · 기울기 ±0.500 으로 통과하고
 * 시설만 무더기로 빨갛다. 지면이 같이 빨개지면 그건 그림이 아니라 **측정이 틀린 것**이다.
 */
function geometryGate(): GeomRow[] {
  const rows: GeomRow[] = [];
  for (const s of allSimFacilities()) {
    const r = renderSpec(s.sprite);
    if (!r) continue;
    const row = geomRow(s.id, '시설', assetIdToFile(s.sprite), s.size[0], s.size[1], r.bodyH);
    if (row) rows.push(row);
  }
  for (const t of KAIRO.ground.types) {
    for (let a = 0; a < t.alts; a++) {
      const id = `ground/${t.id}:a${a}`;
      const row = geomRow(id, '지면', assetIdToFile(id), 1, 1, 0);
      if (row) rows.push(row);
    }
  }
  return rows;
}

// ──────────────────────── 음성 대조군 (`seam --selftest` 형태) ────────────────────────

/**
 * ⚠ **대조군 없이 초록불이면 아무 뜻이 없다.** 이 저장소는 "검사가 조용히 통과"를
 * 아홉 번 겪었다 (사용자 메모리 `verification-silently-passing`).
 *
 * 그래서 대조군은 **`--selftest` 를 안 붙여도 매번 돈다.** 합성 래스터 몇 장이라
 * 비용이 0 에 가깝고, 별도 스위치로 빼 두면 아무도 안 누른다. 하나라도 안 잡히면
 * 게이트가 **죽는다** (경고가 아니다 — 게이트 자신이 고장 난 것이므로).
 *
 * 각 결함은 **잡혀야 하는 축이 정해져 있다.** "아무 축이나 걸리면 통과"로 하면
 * 축 하나가 통째로 죽어도 다른 축이 대신 잡아 줘서 모른다.
 */
const CONTROLS: {
  name: string;
  opts: { slopeMul?: number; shiftX?: number; mirror?: boolean; scale?: number };
  /** 이 결함에서 반드시 걸려야 하는 축 */
  expect: GeomAxis[];
  /** 정사각 발자국에서는 결함이 아닌 것 (좌우반전 = 항등) */
  squareIsIdentity?: boolean;
}[] = [
  { name: '30° 관습 아이소 (기울기 ×1.1547)', opts: { slopeMul: 2 / Math.sqrt(3) }, expect: ['slope'] },
  { name: '완만 (기울기 ×0.8)', opts: { slopeMul: 0.8 }, expect: ['slope'] },
  { name: '좌우 반전', opts: { mirror: true }, expect: ['vertex', 'iou'], squareIsIdentity: true },
  { name: '가로 6텍셀 밀림', opts: { shiftX: 6 }, expect: ['vertex', 'iou'] },
  /*
   * 접지면만 작게 — 꼭짓점을 축으로 한 닮음이라 **기울기도 꼭짓점도 안 변한다.**
   * IoU 축이 죽어 있으면 이 줄만 실패한다 (축마다 전용 대조군이 있어야 하는 이유).
   */
  { name: '접지면 0.8배 (닮음)', opts: { scale: 0.8 }, expect: ['iou'] },
];

/** 대조군 발자국 — 정사각·가로긴·세로긴·큰 것 */
const CONTROL_SHAPES: readonly (readonly [number, number, number])[] = [
  [2, 2, 24],
  [4, 1, 16],
  [1, 2, 20],
  [3, 3, 40],
];

function selftest(verbose: boolean): string[] {
  const bad: string[] = [];
  const say = (s: string): void => {
    if (verbose) console.log(s);
  };
  for (const [w, d, bodyH] of CONTROL_SHAPES) {
    const want = measureCanonical(w, d, bodyH);
    const area = canonicalWedgeArea(w, d, bodyH);

    // 양성 대조군 — 정본 그대로면 통과해야 한다 (기대값이 자기모순이 아닌지)
    {
      const png = synthSprite(w, d, bodyH, {});
      const m = measureSprite(png, w, d, bodyH);
      const v = geomVerdict('__synth__', m, want, png.w, area);
      say(
        `  ${w}×${d} 정본            ${
          v.bad.length === 0 ? '통과' : `✕ ${v.bad.join(',')}`
        }  꼭짓점 ${fmt(m.bottomFrac)} 기울기 ${fmt(m.slopeLeft)}/${fmt(m.slopeRight)} IoU ${m.wedgeIoU.toFixed(3)}`,
      );
      if (v.bad.length > 0) {
        bad.push(`${w}×${d} 정본 합성본이 게이트 4 에 걸린다 (${v.bad.join(',')}) — 기대값이 틀렸다`);
      }
    }

    for (const c of CONTROLS) {
      const identity = c.squareIsIdentity === true && w === d;
      const png = synthSprite(w, d, bodyH, c.opts);
      const m = measureSprite(png, w, d, bodyH);
      const v = geomVerdict('__synth__', m, want, png.w, area);
      const missed = c.expect.filter((a) => !v.bad.includes(a));
      say(
        `  ${w}×${d} ${c.name.padEnd(26)} ${
          v.bad.length > 0 ? `잡힘 [${v.bad.join(',')}]` : '— 안 잡힘'
        }  꼭짓점 ${fmt(m.bottomFrac)} 기울기 ${fmt(m.slopeLeft)}/${fmt(m.slopeRight)} IoU ${m.wedgeIoU.toFixed(3)}` +
          (identity ? '  (정사각이라 항등 — 안 잡히는 게 맞다)' : ''),
      );
      if (identity) {
        /*
         * 정사각 발자국의 좌우 반전은 접지 다이아몬드에서 **진짜로 항등**이다
         * (`w/(w+d) = 0.5`). 여기서 "잡혀야 한다"고 쓰면 게이트에 없는 결함을
         * 요구하는 셈이라, 통과시키려고 문턱을 흔들게 된다.
         */
        if (v.bad.length > 0) bad.push(`${w}×${d} ${c.name}: 항등인데 걸렸다 (${v.bad.join(',')})`);
        continue;
      }
      if (missed.length > 0) {
        bad.push(`${w}×${d} ${c.name}: ${missed.map((a) => AXIS_NAME[a]).join('·')} 축이 못 잡았다`);
      }
    }
  }
  return bad;
}

// ────────────────────────────── 출력 ──────────────────────────────

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const strict = argv.includes('--strict');
const showGeom = argv.includes('--geom');
const onlySelftest = argv.includes('--selftest');

const controlFails = selftest(onlySelftest || showGeom);

/*
 * ⚠ **`process.exit()` 를 쓰지 말 것.** 파이프로 나가는 `console.log` 는 비동기라
 * 즉시 종료하면 **출력이 잘린다** — `--json` 이 60KB 가 되자 실제로 2,591줄에서
 * 끊겼다 (실측). `process.exitCode` 만 세우고 Node 가 알아서 끝내게 둔다.
 */
if (onlySelftest) {
  console.log(`\n음성 대조군 — ${controlFails.length === 0 ? '✅ 전부 잡았다' : `❌ ${controlFails.length}건`}`);
  for (const b of controlFails) console.log(`   ✕ ${b}`);
  process.exitCode = controlFails.length === 0 ? 0 : 1;
}

const { findings, counts, geom } = onlySelftest
  ? { findings: [] as Finding[], counts: {} as Record<string, number>, geom: [] as GeomRow[] }
  : run();
const hard = findings.filter((f) => !isWarn(f) || strict);
const warns = findings.filter((f) => isWarn(f) && !strict);
const ok = hard.length === 0 && controlFails.length === 0;


if (onlySelftest) {
  // 위에서 이미 냈다
} else if (json) {
  console.log(
    JSON.stringify(
      {
        ok,
        counts,
        findings,
        controlFails,
        geom: geom.map((g) => ({
          id: g.id,
          kind: g.kind,
          size: g.size,
          bad: g.bad,
          exempt: g.exempt,
          severe: g.severe,
          axesSwapped: g.axesSwapped,
          vertexTexels: g.vertexTexels,
          bottomFrac: g.m.bottomFrac,
          bottomFracWant: g.want.bottomFrac,
          slopeLeft: g.m.slopeLeft,
          slopeRight: g.m.slopeRight,
          wedgeIoU: g.m.wedgeIoU,
          iouMin: g.iouMin,
          cover: g.m.cover,
        })),
      },
      null,
      2,
    ),
  );
} else {
  console.log('카이로 에셋 게이트');
  console.log(
    `  시설 ${counts['시설']}종 · 스프라이트 명세 ${counts['명세']} · 이미지 ${counts['이미지']}장 · 생성물 ${counts['생성물']}장`,
  );
  if (counts['생성물'] === 0) {
    console.log('  (생성물 없음 — 플레이스홀더로 돌고 있다. 에셋 생산은 골 밖)');
  } else {
    console.log(
      `  접지 기하 ${counts['접지측정']}장 측정 · 위반 ${counts['접지위반']}` +
        ` (심각 ${counts['접지심각']} · 축뒤집힘 ${counts['접지축뒤집힘']})` +
        `${strict ? '' : ' — 경고. 재생성 대상 (docs/asset-regen-order.md)'}`,
    );
  }
  console.log(
    `  음성 대조군 ${controlFails.length === 0 ? '✅ 전부 잡았다' : `❌ ${controlFails.length}건 못 잡았다`}`,
  );
  for (const b of controlFails) console.log(`     ✕ ${b}`);

  if (showGeom) {
    console.log('\n접지 기하 실측 (게이트 4)');
    console.log(
      '  판정  ID                발자국  덮임   바닥꼭짓점(기대)      오차   기울기 L/R        IoU(하한)',
    );
    for (const g of [...geom].sort((a, b) => (b.vertexTexels ?? 0) - (a.vertexTexels ?? 0) || a.m.wedgeIoU - b.m.wedgeIoU)) {
      console.log(
        `  ${(g.bad.length === 0 ? '·' : '✕').padEnd(4)}  ${g.id.padEnd(18)}` +
          `${`${g.size[0]}×${g.size[1]}`.padEnd(7)}` +
          `${`${(g.m.cover * 100).toFixed(0)}%`.padStart(4)}   ` +
          `${fmt(g.m.bottomFrac)}(${fmt(g.want.bottomFrac)})  ` +
          `${fmtTx(g.vertexTexels).padStart(9)}  ` +
          `${fmt(g.m.slopeLeft)}/${fmt(g.m.slopeRight)}  ` +
          `${g.m.wedgeIoU.toFixed(3)}(${g.iouMin.toFixed(3)})` +
          (g.axesSwapped === true ? '  ⚠축뒤집힘' : '') +
          (g.exempt.length > 0 ? `  면제:${g.exempt.map((a) => AXIS_NAME[a]).join(',')}` : ''),
      );
    }
    console.log(`\n면제 표 (${GEOM_HOLDOUT.length}종 — 접지가 다이아몬드가 아닌 것)`);
    for (const h of GEOM_HOLDOUT) {
      console.log(`  ${h.id} [${h.axes.map((a) => AXIS_NAME[a]).join('·')} 면제]`);
      console.log(`     ${h.why}`);
    }
  }

  if (findings.length === 0) {
    console.log('  ✅ 위반 0');
  } else {
    if (hard.length > 0) {
      console.log(`  ❌ 위반 ${hard.length}`);
      for (const f of hard) console.log(`     [${f.gate}] ${f.id} — ${f.detail}`);
    }
    if (warns.length > 0) {
      /*
       * 65줄을 매번 다 뱉으면 `npm run verify` 콘솔에서 **진짜 실패가 묻힌다.**
       * 기본은 **심각(반 칸 이상 밀림)만** 내고 나머지는 `--geom` 으로 넘긴다 —
       * 그게 5단계 재생성의 우선순위이기도 하다.
       */
      const severe = warns.filter((f) => f.detail.startsWith('심각'));
      const shown = showGeom ? warns : severe;
      console.log(
        `  ⚠ 경고 ${warns.length} (게이트 4 — 종료 코드에 안 들어간다. --strict 로 승격)` +
          (showGeom ? '' : ` · 아래는 심각 ${severe.length}건, 전체는 --geom`),
      );
      for (const f of shown) console.log(`     [${f.gate}] ${f.id} — ${f.detail}`);
    }
  }
}

if (!onlySelftest) process.exitCode = ok ? 0 : 1;

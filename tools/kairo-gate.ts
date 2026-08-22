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
  facilityFacings,
  facilitySpriteId,
  FACILITY_DIR_NAMES,
  KAIRO,
} from '../src/assets/kairo-contract.js';
import { KairoProceduralProvider } from '../src/assets/kairo-procedural.js';
import { facilityDef, PlacementGrid, type FacilityFacing } from '../src/sim/kairo/placement.js';
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
import {
  measureLight,
  lightVerdict,
  synthLitSprite,
  flipX,
  LIGHT_TOL,
  TONE_STEP,
  BAND_TEXELS,
  VERDICT_NAME,
  type LightMeasure,
  type LightVerdict,
} from './light-direction.js';

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
 * 실측 시설 **28/75** 가 빨갛다 (지면은 33/33 통과 — `geometryGate` 주석 참조).
 * 이걸 곧바로 실패로 만들면 `npm run gate` 가 죽어서 **에셋과 무관한 작업까지 전부
 * 막힌다** — 그 28종을 고치는 일은 **재생성**이고, 무엇을 어떤 순서로 다시 뽑을지는
 * `docs/asset-regen-order.md` 에 있다 (이 게이트 출력에서 **생성**한 목록이다).
 * 그때까지 게이트는 **목록을 내는 일**을 한다.
 *
 * ⚠ **세는 기준은 "면제를 적용한 뒤"다** — 게이트 자신의 요약 줄이 내는 그 수다
 * (`npx tsx tools/kairo-gate.ts --geom` → `위반 28 (심각 4 · 축뒤집힘 0)`,
 * 통과 47 + 위반 28 = 75). 지금 면제(`GEOM_HOLDOUT`)는 **5종**이다.
 * 숫자를 인용할 일이 있으면 위 명령을 다시 돌릴 것 — `docs/asset-regen-order.md` 는
 * 손으로 적은 것이 아니라 그 출력에서 **생성**한 목록이다.
 *
 * ⚠ **한때 0 이었다 (2026-08-22). 그 0 은 그림이 좋아진 게 아니었다** —
 * `tools/repair-kairo-footprint.py` 가 정본 다이아몬드를 단색으로 메워 만든 0 이었고,
 * 사용자가 화면에서 회귀를 보고해 26종을 되돌렸다. **이 게이트는 실루엣 최하단 윤곽만
 * 재므로 "다이아몬드를 색으로 칠하기"가 언제나 최단 경로다.** 위반 수를 0 으로 만드는
 * 변경이 들어오면 **그림을 먼저 볼 것** (`docs/asset-regen-order.md` §2026-08-22).
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
/**
 * ## 게이트 5(광원)도 **경고**다 — 같은 이유
 *
 * 실측 시설 **15/75** 가 뒤집혀 있고 **16/75** 는 평탄(방향을 못 읽음)이다
 * (`--light` 로 표 전체). 이걸 곧바로 실패로 올리면 `npm run gate` 가 죽어 에셋과
 * 무관한 작업까지 막힌다 — 게이트 4 가 밟은 길이다. 고치는 방법은 **재생성**이고
 * 4방향 지시서가 `docs/asset-4dir-order.md` 에 있다.
 *
 * ⚠ **`평탄` 은 findings 에 안 넣는다** (요약 줄의 카운트로만 낸다). 위반이 아니라
 * "이 그림으로는 방향을 말할 수 없다"이기 때문이다 — 뒤집힘과 같은 통에 넣으면
 * 재생성 목록이 두 배가 되고 그중 절반은 고칠 대상이 아니다. 대신 **요약 줄에서
 * 절대 사라지지 않는다**: 조용히 통과하는 축을 만들지 않는 것이 이 저장소의 규칙이다.
 *
 * ⚠ 게이트 5 의 **대조군 실패(`광원대조군`)는 경고가 아니다.** 그건 그림이 아니라
 * 게이트 자신이 고장 난 것이므로 종료 코드를 바꾼다 (게이트 4 의 `selftest` 와 같은 결정).
 */
const WARN_GATES = new Set(['접지기하', '광원']);

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

function run(): {
  findings: Finding[];
  counts: Record<string, number>;
  geom: GeomRow[];
  light: LightRow[];
} {
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

  // 게이트 5 — 광원 방향. 판을 건너뛰는 규칙은 게이트 4 와 같다
  const light = pngs.length > 0 ? lightGate() : [];
  for (const l of light) if (l.finding) findings.push(l.finding);
  for (const f of lightPackControl(light)) findings.push(f);

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
      광원측정: light.length,
      광원뒤집힘: light.filter((l) => l.verdict === 'flipped').length,
      광원평탄: light.filter((l) => l.verdict === 'flat').length,
      광원측정불가: light.filter((l) => l.verdict === 'unmeasurable').length,
      광원좌상단: light.filter((l) => l.verdict === 'upper-left').length,
    },
    geom,
    light,
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
        (v.axesSwapped === true ? ' · ⚠ 발자국 두 축이 바뀐 그림 (가이드는 그대로, 프롬프트로 지목)' : ''),
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
    /*
     * ⚠ **4방향이면 네 장을 다 잰다.** 예전에는 `assetIdToFile(s.sprite)` 하나만 봤는데,
     * `facings: 4` 를 켜는 순간 그 파일명(`facility__shop.png`)이 계약에서 사라져
     * `existsSync` 가 false → `geomRow` 가 null → **그 시설이 게이트 4 에서 통째로
     * 조용히 빠진다** (요약의 `접지측정` 만 줄어든다). 4방향은 접지 결함을 4배로
     * 늘리는데 게이트가 눈을 감는 꼴이라 순서를 뒤집었다.
     * 발자국은 **홀수 방향에서 전치된다** — 규칙의 정본은 `PlacementGrid.sizeOf` 하나다
     * (여기에 `facing % 2` 를 다시 적으면 두 벌이 된다).
     */
    const def = facilityDef(s.id);
    const facings = facilityFacings(s.id);
    /*
     * ⚠ **그림 장수만큼** 돈다 — 방향 수가 아니다. `facings: 2` 는 스프라이트가 **한 장**
     * 이고 (`facilitySpriteId` 가 방향을 무시하고 같은 ID 를 준다) 그 한 장이 회전
     * 0·1 을 겸한다. 방향 수(2)만큼 돌면 같은 파일을 **전치된 기대값으로 한 번 더**
     * 재게 되어 위반이 18 → 56 으로 부풀었다 (실측).
     */
    const sheets = facings === 4 ? 4 : 1;
    for (let facing = 0; facing < sheets; facing++) {
      const [w, d] = def
        ? PlacementGrid.sizeOf(def, facing as FacilityFacing)
        : [s.size[0], s.size[1]];
      const id = facings === 4 ? `${s.id}:${FACILITY_DIR_NAMES[facing]}` : s.id;
      const row = geomRow(id, '시설', assetIdToFile(facilitySpriteId(s.id, facing)), w, d, r.bodyH);
      if (row) rows.push(row);
    }
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

// ────────────────────────────── 게이트 5 ──────────────────────────────

interface LightRow {
  id: string;
  file: string;
  m: LightMeasure;
  verdict: LightVerdict;
  finding?: Finding;
}

/**
 * 광원 방향 — **시설만** 잰다 (`facility/…`, 4방향이 켜지면 `facility/…:d0` 넷).
 *
 * 지면·벽·배경·아이콘을 빼는 이유는 **옆면이 없어서**다. 지면 타일은 윗면 하나뿐이라
 * 좌우 밝기 차가 구조적으로 0 이고, 그걸 `평탄` 33장으로 세면 요약이 지면으로 덮인다.
 * 데코 8종은 부피가 있으므로 계약에 `deco/` 가 생기면 여기 넣을 것 — 지금은 그 ID 가
 * 시설이 아니라 별도 축이라 게이트 4 도 안 재고 있다.
 *
 * ⚠ **`assetFileToId` 로 ID 를 얻는다** — 게이트 3 과 같은 규칙 하나. 폴더나 파일명을
 * 여기서 다시 해석하면 4방향 파일(`facility__shop__d0.png`)에서 두 벌이 갈라진다.
 */
function lightGate(): LightRow[] {
  const rows: LightRow[] = [];
  const sizes = kairoAssetSizes();
  for (const p of walkPngs(GEN_DIR)) {
    const file = p.split('/').pop() ?? '';
    const id = assetFileToId(file);
    if (id === null || !id.startsWith('facility/') || !sizes.has(id)) continue;
    const m = measureLight(decodePng(p));
    const verdict = lightVerdict(m);
    const row: LightRow = { id: id.slice('facility/'.length), file, m, verdict };
    if (verdict === 'flipped' || verdict === 'unmeasurable') {
      row.finding = {
        gate: '광원',
        id: row.id,
        detail:
          verdict === 'flipped'
            ? `광원이 오른쪽에서 온다 — 왼쪽 벽 − 오른쪽 벽 ${m.score!.toFixed(1)} ` +
              `(문턱 ≤ ${(-LIGHT_TOL).toFixed(1)}, 열 ${m.left}/${m.right})`
            : `벽 띠를 못 떴다 — 좌 ${m.left}열 · 우 ${m.right}열 (양쪽 4열 이상 필요)`,
      };
    }
    rows.push(row);
  }
  return rows.sort((a, b) => (a.m.score ?? -1e9) - (b.m.score ?? -1e9));
}

/**
 * **팩 음성 대조군** — 가장 확실하게 통과한 그림을 좌우로 뒤집어 다시 재고,
 * `뒤집힘` 으로 잡히는지 본다. 사용자가 지정한 그 대조군이다
 * ("정본 스프라이트를 flipX 해서 넣으면 반드시 잡혀야 한다").
 *
 * 합성 대조군(`selftest`)이 이미 같은 성질을 보지만, 그건 **게이트가 만든 그림**이다.
 * 실제 팩의 화소로도 한 번 확인해야 "합성에서만 도는 자"가 아니게 된다.
 *
 * ⚠ 실패하면 **경고가 아니라 하드 실패**다 (`WARN_GATES` 에 `광원대조군` 이 없다).
 * 그림이 나쁜 게 아니라 자가 고장 난 것이므로.
 */
function lightPackControl(rows: LightRow[]): Finding[] {
  const best = rows.filter((r) => r.verdict === 'upper-left').sort((a, b) => b.m.score! - a.m.score!)[0];
  if (!best) return []; // 통과가 하나도 없는 팩 — 뒤집을 정본이 없다
  const flipped = measureLight(flipX(decodePng(join(GEN_DIR, best.file))));
  const v = lightVerdict(flipped);
  if (v === 'flipped') return [];
  return [
    {
      gate: '광원대조군',
      id: best.id,
      detail:
        `정본 ${best.m.score!.toFixed(1)} 를 좌우 반전했는데 ${VERDICT_NAME[v]} ` +
        `(${flipped.score?.toFixed(1) ?? '—'}) — 지표가 flipX 에 홀함수가 아니다`,
    },
  ];
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

  bad.push(...lightSelftest(say));
  return bad;
}

/**
 * 게이트 5 의 대조군 — 판정 셋에 각각 하나씩.
 *
 * 합성 상자는 왼쪽 면 base(`#dcb079`) · 오른쪽 면 shadow(`#c49a6a`) 로 칠한
 * **좌상단 광원의 정의 그 자체**다. 그래서:
 *   · 정본  → `좌상단` (양성 대조군 — 기대값이 자기모순이 아닌지)
 *   · 미러  → `뒤집힘` (음성 대조군 — 사용자가 지정한 그것)
 *   · 무음영 → `평탄`  (사각지대가 살아 있는지. 이게 `좌상단` 이 되면 문턱이 죽은 것)
 *
 * ⚠ **발자국 넷을 다 돈다.** 앞선 구현(줄 기준 지표)은 정사각에서는 멀쩡했고
 * **4×1 에서만** 무너졌다 — 한 모양만 시험하면 그 버그가 통과한다.
 */
function lightSelftest(say: (s: string) => void): string[] {
  const bad: string[] = [];
  const cases: { name: string; opts: { mirror?: boolean; flat?: boolean }; want: LightVerdict }[] = [
    { name: '정본 (양성)', opts: {}, want: 'upper-left' },
    { name: '좌우 반전 (음성)', opts: { mirror: true }, want: 'flipped' },
    { name: '음영 제거', opts: { flat: true }, want: 'flat' },
  ];
  say(`\n게이트 5 대조군 — 한 톤 단계 ${TONE_STEP.toFixed(2)} · 사각지대 ±${LIGHT_TOL.toFixed(2)} · 띠 ${BAND_TEXELS}텍셀`);
  for (const [w, d, bodyH] of CONTROL_SHAPES) {
    for (const c of cases) {
      const m = measureLight(synthLitSprite(w, d, bodyH, c.opts));
      const v = lightVerdict(m);
      say(
        `  ${w}×${d} ${c.name.padEnd(18)} ${VERDICT_NAME[v].padEnd(5)} ` +
          `점수 ${(m.score?.toFixed(2) ?? '—').padStart(7)}  열 ${m.left}/${m.right}` +
          (v === c.want ? '' : `  ✕ 기대 ${VERDICT_NAME[c.want]}`),
      );
      if (v !== c.want) {
        bad.push(
          `광원 ${w}×${d} ${c.name}: ${VERDICT_NAME[v]} (기대 ${VERDICT_NAME[c.want]}, 점수 ${m.score?.toFixed(2) ?? '—'})`,
        );
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
const showLight = argv.includes('--light');
const onlySelftest = argv.includes('--selftest');

const controlFails = selftest(onlySelftest || showGeom || showLight);

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

const { findings, counts, geom, light } = onlySelftest
  ? {
      findings: [] as Finding[],
      counts: {} as Record<string, number>,
      geom: [] as GeomRow[],
      light: [] as LightRow[],
    }
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
        light: light.map((l) => ({
          id: l.id,
          file: l.file,
          verdict: l.verdict,
          score: l.m.score,
          left: l.m.left,
          right: l.m.right,
        })),
        lightTol: LIGHT_TOL,
        toneStep: TONE_STEP,
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
    /*
     * ⚠ `평탄`·`측정불가` 는 findings 에 안 들어간다 (`WARN_GATES` 주석). **이 줄이
     * 그 둘이 세상에 드러나는 유일한 자리**이므로 지우지 말 것 — 지우면 "방향을 못 재는
     * 그림 16장"이 조용히 사라진다.
     */
    console.log(
      `  광원 방향 ${counts['광원측정']}장 측정 · 좌상단 ${counts['광원좌상단']} · ` +
        `뒤집힘 ${counts['광원뒤집힘']} · 평탄 ${counts['광원평탄']} · 측정불가 ${counts['광원측정불가']}` +
        ` (사각지대 ±${LIGHT_TOL.toFixed(1)} 휘도)` +
        `${strict ? '' : ' — 경고. 목록은 --light'}`,
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

  if (showLight) {
    console.log('\n광원 방향 실측 (게이트 5) — 왼쪽 벽 − 오른쪽 벽 (휘도, + 면 좌상단)');
    console.log(`  한 톤 단계 ${TONE_STEP.toFixed(2)} · 사각지대 ±${LIGHT_TOL.toFixed(2)} · 벽 띠 ${BAND_TEXELS}텍셀`);
    console.log('  판정    ID                   점수    벽 열 좌/우');
    for (const l of light) {
      console.log(
        `  ${VERDICT_NAME[l.verdict].padEnd(6)}  ${l.id.padEnd(18)}` +
          `${(l.m.score?.toFixed(1) ?? '—').padStart(8)}   ${l.m.left}/${l.m.right}`,
      );
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
      const geomWarns = warns.filter((f) => f.gate === '접지기하');
      const lightWarns = warns.filter((f) => f.gate === '광원');
      const severe = geomWarns.filter((f) => f.detail.startsWith('심각'));
      const shown = [...(showGeom ? geomWarns : severe), ...(showLight ? lightWarns : [])];
      console.log(
        `  ⚠ 경고 ${warns.length} (게이트 4·5 — 종료 코드에 안 들어간다. --strict 로 승격)` +
          (showGeom ? '' : ` · 접지는 심각 ${severe.length}건만, 전체는 --geom`) +
          (showLight ? '' : ` · 광원 ${lightWarns.length}건은 --light`),
      );
      for (const f of shown) console.log(`     [${f.gate}] ${f.id} — ${f.detail}`);
    }
  }
}

if (!onlySelftest) process.exitCode = ok ? 0 : 1;

/**
 * 시설 스프라이트 **재생성 루프** — 한 명령으로 조각을 전부 이어 붙인다.
 *
 *   npx tsx tools/regen-facility.ts --id cafe                 한 종
 *   npx tsx tools/regen-facility.ts --severe                  심각한 것만
 *   npx tsx tools/regen-facility.ts --all --tries 3           위반 전부, 종당 최대 3회
 *   npx tsx tools/regen-facility.ts --id cafe --dry-run       프롬프트만 찍고 안 돌린다
 *   npx tsx tools/regen-facility.ts --all --use-existing guide   생성을 건너뛰고 파이프만
 *   npx tsx tools/regen-facility.ts --verify-gate             판정 복제가 게이트와 같은지
 *
 * ## 왜 이 도구가 필요한가
 *
 * 접지 기하 게이트가 시설 **56종**을 빨간불로 낸다 (`docs/assets/maintenance/legacy-v2-regeneration.md`).
 * 조각은 이미 다 있다 — 프롬프트(`docs/assets/maintenance/legacy-sheet-prompts.md`) · 발자국 가이드 75장 ·
 * 규격 줄(`tools/make-kairo-guide.ts --table`) · 생성기(sprite-gen) ·
 * 후처리(`tools/process-kairo-sheet.py`) · 판정(`tools/kairo-gate.ts`).
 * 그런데 **사람이 56번 손으로 이어 붙여야 했다.** 그 이음매가 이 파일이다.
 *
 * ⚠ 이 저장소의 codex 계정에는 `image_gen` 권한이 없다 (실측). 그래서 생성은
 * **권한이 있는 세션**에서 돌려야 한다 — 이 도구의 목적은 그 세션에서 명령 하나로
 * 끝나게 하는 것이다. 권한이 없으면 **첫 시도에서 죽는다** (56번 실패 로그를 쌓지 않는다).
 *
 * ## 종당 루프
 *
 *   프롬프트 조립 → 생성 → 후처리(1종 추출) → 게이트 판정 → 통과면 채택, 아니면 리롤
 *
 * ## 안전 규칙
 *
 * - **통과한 것을 덮어쓰지 않는다.** 채택 전에 판정을 다시 재서 *전보다 나아졌는지*
 *   확인하고, 나빠지면 원본을 되돌린다. 원본은 쓰기 **전에** 백업한다.
 * - 대상은 **지금 위반인 종**뿐이다. 통과 19종은 `--all` 에 안 들어간다 (실측으로
 *   고른다 — 목록을 손으로 적어 두면 그림이 바뀌었을 때 조용히 갈라진다).
 *
 * ## 판정을 왜 복제하나 (그리고 왜 갈라지지 않나)
 *
 * 게이트는 `assets/generated/kairo/` 안의 파일만 잰다. 후보를 재려면 팩에 **먼저 써야**
 * 하는데, 그건 "통과한 것을 덮어쓰지 마라"와 정면으로 부딪힌다. 그래서 후보는 임시
 * 폴더에서 판정하고 **채택된 것만** 팩에 쓴다.
 *
 * 복제라고 해서 기하를 다시 유도하지는 **않는다** — `measureSprite`/`measureCanonical`/
 * `geomVerdict` 는 게이트가 부르는 바로 그 함수다 (`tools/ground-geometry.ts`).
 * 남는 위험은 "게이트가 그 함수들을 부르는 방식"이 갈라지는 것뿐이고, 그것을
 * `--verify-gate` 가 `kairo-gate.ts --json` 과 대조해서 잡는다.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allSimFacilities, renderSpec, assetIdToFile } from '../src/assets/kairo-contract.js';
import { footprintCanvas } from '../src/render/kairo/iso.js';
import { guideSpecLine } from './make-kairo-guide.js';
import { decodePng } from './png.js';
import { measureLight, lightVerdict, VERDICT_NAME, type LightMeasure, type LightVerdict } from './light-direction.js';
import {
  measureSprite,
  measureCanonical,
  canonicalWedgeArea,
  geomVerdict,
  ALPHA_SOLID,
  type GroundMeasure,
  type GeomVerdict,
} from './ground-geometry.js';

// ────────────────────────────── 경로 ──────────────────────────────

export const DOC = 'docs/assets/maintenance/legacy-sheet-prompts.md';
export const GUIDE_DIR = 'art-reference/guides/kairo';
export const PACK_DIR = 'assets/generated/kairo';
export const WORK_DIR = 'assets/generated/kairo-regen';
const SPRITE_GEN = `${process.env['HOME'] ?? ''}/tools/sprite-gen/.venv/bin/sprite-gen`;
const PROCESS_SHEET = 'tools/process-kairo-sheet.py';
/**
 * 후처리를 돌릴 파이썬.
 *
 * ⚠ macOS 의 `python3` 은 **3.9** 다 (Xcode 동봉, 실측). `process-kairo-sheet.py` 는
 * `int | None` 같은 3.10+ 문법을 쓰고, 그쪽 파이프라인이 이미 쓰는 sprite-gen venv 는
 * 3.11 이다. 시스템 파이썬으로 떨어지면 조용히 다른 결과가 아니라 **죽는다** —
 * 그래도 어느 쪽으로 도는지는 로그에 남기는 편이 낫다.
 */
const PYTHON = existsSync(`${process.env['HOME'] ?? ''}/tools/sprite-gen/.venv/bin/python`)
  ? `${process.env['HOME'] ?? ''}/tools/sprite-gen/.venv/bin/python`
  : 'python3';

/** ⚠ 실측 오류 문자열. 이게 보이면 이 머신에서는 생성이 **불가능**하다 — 즉시 죽는다 */
const NO_IMAGE_GEN = 'the built-in image_gen tool never ran in this codex session';

/** 생성 해상도. `docs/assets/maintenance/legacy-sheet-prompts.md` §HOW THE SHEETS ARE SIZED 와 같은 값 */
const GEN_SIZE = '1536 x 1024';

// ────────────────────────── 문서 파싱 (프롬프트 조립) ──────────────────────────

export interface SheetItem {
  /** 시트 이름 (`S1`·`L10` …) */
  sheet: string;
  /** 시트 안의 칸 번호 = 항목 번호 */
  cell: number;
  facilityId: string;
  spriteId: string;
  file: string;
  /** 대조표의 `label in sheet` */
  label: string;
  /** 항목 본문 (시트 코드블록에서 축자로 뽑은 것, 번호 접두사 제거) */
  body: string;
  /** 이 시트가 쓰는 크로마 키 */
  chroma: 'magenta' | 'green';
  /** 첨부할 스타일 크롭 (가이드는 따로 앞에 붙는다) */
  crops: string[];
  /** 이 시트 코드블록의 스타일 블록 — 정본과 축자 동일해야 한다 */
  styleBlock: string;
}

/** `## Sheet <이름> …` 부터 다음 `## Sheet` 전까지 (파이썬 추출기의 `section_for` 와 같은 규칙) */
export function sheetSections(doc: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads = [...doc.matchAll(/^## Sheet (\S+) —/gm)];
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i]!.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1]!.index ?? doc.length) : doc.length;
    out.set(heads[i]![1]!, doc.slice(start, end));
  }
  return out;
}

/** 첫 코드블록 안쪽 */
function codeBlock(section: string): string {
  const m = /```\n([\s\S]*?)\n```/.exec(section);
  if (!m) throw new Error('코드블록이 없다');
  return m[1]!;
}

/**
 * 정본 스타일 블록 — `# SHARED STYLE BLOCK` 절의 코드블록.
 *
 * ⚠ **하드코딩하지 않는다.** 34장이 축자 동일한 것이 이 문서의 성질이고, 그걸 코드에
 * 베껴 두면 문서를 고쳐도 도구만 옛 계약으로 남는다.
 */
export function canonicalStyle(doc: string): string {
  const m = /^# SHARED STYLE BLOCK[^\n]*\n[\s\S]*?```\n([\s\S]*?)\n```/m.exec(doc);
  if (!m) throw new Error(`${DOC} 에서 SHARED STYLE BLOCK 을 못 찾았다`);
  return m[1]!.trim();
}

/** 대조표 한 줄: `| 3 | \`facility/x\` | \`facility__x.png\` | Label |` */
function tableRows(section: string): { cell: number; sprite: string; file: string; label: string }[] {
  const re = /^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+\.png)`\s*\|\s*([^|]*?)\s*\|/gm;
  const out: { cell: number; sprite: string; file: string; label: string }[] = [];
  for (const m of section.matchAll(re)) {
    out.push({ cell: Number(m[1]), sprite: m[2]!, file: m[3]!, label: m[4]! });
  }
  return out;
}

/**
 * 첨부 문단에서 크롭 경로를 뽑는다.
 *
 * ⚠ 시트마다 **항목별로 다른 레퍼런스**를 지정하는 경우가 있다 (L10: "governs item 1
 * ONLY"). 그 주석을 무시하고 둘 다 붙이면 실측된 실패 모드(레퍼런스가 프롬프트를 이겨
 * 목조 펜션 밑에 튜브 베이스가 생긴다)가 그대로 돌아온다.
 */
export function attachCrops(section: string, cell: number): string[] {
  // ⚠ 문단은 여러 줄이다 (L10 은 항목별 지정이 둘째 줄에 있다). `m` 플래그의 `$` 는
  //   줄 끝이라 문단이 한 줄에서 잘린다 — 실측으로 `pension_duplex` 의 크롭이 0장이 됐다.
  const m = /^\*{0,2}Attach:?\*{0,2}\s*([\s\S]*?)(?:\n\n|$(?![\s\S]))/m.exec(section);
  if (!m) return [];
  const para = m[1]!;
  const paths = [...para.matchAll(/(art-reference\/[\w\-/]+\.png)/g)].map((p) => ({
    path: p[1]!,
    at: p.index ?? 0,
  }));
  const out: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const start = paths[i]!.at + paths[i]!.path.length;
    const end = i + 1 < paths.length ? paths[i + 1]!.at : para.length;
    const note = para.slice(start, end);
    const nums = [...note.matchAll(/items?\s+([\d,\sand]+)/gi)].flatMap((n) =>
      [...n[1]!.matchAll(/\d+/g)].map((d) => Number(d[0])),
    );
    if (nums.length > 0 && !nums.includes(cell)) continue;
    out.push(paths[i]!.path);
  }
  return out;
}

/** `Canvas:` 문단이 지정한 크로마. 시트가 초록을 쓰는 이유는 그 문단에 적혀 있다 */
function chromaOf(body: string): 'magenta' | 'green' {
  const m = /Flat\s+(#00FF00|#FF00FF)/i.exec(body);
  return m && m[1]!.toUpperCase() === '#00FF00' ? 'green' : 'magenta';
}

/** 번호 항목 하나를 통째로 (`\n1. …` 부터 `\n2. ` 전까지) */
function itemBody(rest: string, cell: number): string | null {
  const re = new RegExp(`^${cell}\\.\\s([\\s\\S]*?)(?=^\\d+\\.\\s|^Every object faces|^⚠|$(?![\\s\\S]))`, 'm');
  const m = re.exec(rest);
  if (!m) return null;
  return m[1]!.trimEnd();
}

/** 라벨 비교용 정규화 — 시트마다 대소문자·구두점이 다르다 (`CAFE` vs `Cafe counter`) */
const normLabel = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * 시설 하나의 시트 항목을 찾는다.
 *
 * 대조표(`| cell | sprite id | 파일명 | label |`)가 정본이고, 본문은 그 **칸 번호**로
 * 찾는다. 찾은 본문의 머리 라벨이 표의 라벨과 안 맞으면 **라벨로 다시 찾는다** —
 * 표와 본문의 순서가 어긋난 시트가 생겨도 조용히 엉뚱한 항목을 뽑지 않게.
 */
export function findItem(doc: string, facilityId: string, spriteId: string): SheetItem {
  for (const [sheet, section] of sheetSections(doc)) {
    const row = tableRows(section).find((r) => r.sprite === spriteId);
    if (!row) continue;
    const block = codeBlock(section);
    const cut = block.indexOf('\nGoal:');
    if (cut < 0) throw new Error(`${sheet}: 코드블록에 Goal: 이 없다`);
    const styleBlock = block.slice(0, cut).trim();
    const rest = block.slice(cut);
    const itemsAt = rest.indexOf('\nItems');
    const items = itemsAt >= 0 ? rest.slice(itemsAt) : rest;

    let cell = row.cell;
    let body = itemBody(items, cell);
    if (body !== null) {
      const head = normLabel(body.split('—')[0] ?? '');
      const want = normLabel(row.label);
      // 한쪽이 다른 쪽을 포함하면 같은 항목으로 본다 (`CAFE` ⊂ `cafe counter`)
      if (!(head.includes(want) || want.includes(head))) {
        for (let k = 1; k <= 20; k++) {
          const alt = itemBody(items, k);
          if (alt === null) continue;
          const h = normLabel(alt.split('—')[0] ?? '');
          if (h.includes(want) || want.includes(h)) {
            cell = k;
            body = alt;
            break;
          }
        }
      }
    }
    if (body === null) throw new Error(`${sheet}: ${spriteId} 의 항목 본문(${row.cell}번)을 못 찾았다`);

    return {
      sheet,
      cell,
      facilityId,
      spriteId,
      file: row.file,
      label: row.label,
      body,
      chroma: chromaOf(rest),
      crops: attachCrops(section, cell),
      styleBlock,
    };
  }
  throw new Error(`${spriteId} 가 ${DOC} 의 어떤 시트 대조표에도 없다`);
}

// ────────────────────────────── 측정 ──────────────────────────────

export interface Measured {
  id: string;
  w: number;
  d: number;
  bodyH: number;
  canvasW: number;
  m: GroundMeasure;
  want: GroundMeasure;
  v: GeomVerdict;
  /**
   * 아직 옆으로 밀어야 하는데 **캔버스에 빈 자리가 없다** (`docs/assets/maintenance/legacy-v2-regeneration.md` 의
   * `⚠ 여백 없음`).
   *
   * `tools/process-kairo-sheet.py` 의 `ground_vertex_shift` 와 **같은 산수**다: 바닥
   * 꼭짓점을 계약 자리로 옮기려면 몇 px 이 필요한지 재고, 그림이 실제로 갈 수 있는 여백과
   * 비교한다. 남은 이탈을 평행이동으로 못 지운다는 뜻이므로 "자리가 틀린 것"이 아니라
   * **그림 자체가 틀렸다**는 가장 강한 신호다 — 프롬프트에 그대로 넣는다.
   */
  noMargin: boolean;
  /** 게이트 5 실측 — 왼쪽 벽 − 오른쪽 벽 휘도 */
  light: LightMeasure;
  /**
   * ⚠ **`flat` 은 위반이 아니다.** 게이트 5 가 findings 에 넣는 것은 `flipped` 와
   * `unmeasurable` 뿐이고, 팩 자체가 `flat` 16장이다. 여기서 `flat` 을 실패로 치면
   * **자기 원본이 평탄한 시설**(arcade·slide_tube)은 만족 불가능한 조건이 된다 —
   * 4방향 1차가 정확히 그렇게 8장을 버렸다 (`docs/assets/history/prompt-chain-4dir-retrospective.md` §0-2).
   */
  lightV: LightVerdict;
}

export function measurePng(path: string, id: string, w: number, d: number, bodyH: number): Measured {
  const png = decodePng(path);
  const m = measureSprite(png, w, d, bodyH);
  const want = measureCanonical(w, d, bodyH);
  const v = geomVerdict(id, m, want, png.w, canonicalWedgeArea(w, d, bodyH), [w, d]);
  const light = measureLight(png);
  const lightV = lightVerdict(light);

  const opaqueCol = (x: number): boolean => {
    for (let y = 0; y < png.h; y++) if (png.data[(y * png.w + x) * 4 + 3]! >= ALPHA_SOLID) return true;
    return false;
  };
  let noMargin = false;
  if (m.bottomFrac !== null) {
    const meanX = m.bottomFrac * png.w - 0.5;
    const wanted = Math.round(w * 16 - 0.5 - meanX);
    let left = 0;
    let right = png.w - 1;
    while (left < png.w && !opaqueCol(left)) left++;
    while (right >= 0 && !opaqueCol(right)) right--;
    const applied = Math.max(-left, Math.min(png.w - 1 - right, wanted));
    noMargin = wanted !== 0 && applied !== wanted;
  }
  return { id, w, d, bodyH, canvasW: png.w, m, want, v, noMargin, light, lightV };
}

/**
 * **통과** — 게이트 4 가 깨끗하고 게이트 5 가 위반이 아니다.
 *
 * ⚠ 기준은 `kairo-gate` 와 **같아야 한다**: 게이트 5 가 findings 에 넣는 것은
 * `flipped`·`unmeasurable` 뿐이고 `flat` 은 아니다. 여기서 `flat` 까지 실패로 치면
 * 도구가 게임보다 엄격해져서, 원본이 평탄한 시설은 무한 리롤에 빠진다.
 */
export const passed = (x: Measured): boolean =>
  x.v.bad.length === 0 && x.lightV !== 'flipped' && x.lightV !== 'unmeasurable';

/**
 * 낮을수록 좋다 — 사전식으로 비교한다.
 *
 * ⚠ 첫 자리가 **통과 여부**여야 한다. 축 개수만으로 재면 "축 하나만 아슬하게 걸린 후보"가
 * "전부 통과한 후보"를 이길 수 있는 순간이 생긴다.
 */
export function scoreOf(x: Measured): number[] {
  const iouDeficit = Math.max(0, x.v.iouMin - x.m.wedgeIoU);
  const slope = Math.max(x.v.slopeErrLeft ?? 1e6, x.v.slopeErrRight ?? 1e6);
  return [
    passed(x) ? 0 : 1,
    x.v.bad.length,
    lightPenalty(x.lightV),
    x.v.vertexTexels ?? 1e6,
    iouDeficit,
    slope,
  ];
}

/**
 * 광원 벌점 — **순서가 규칙이다.** `flat` 이 0 이 아닌 이유는 "그림자가 아예 없다"가
 * 좋은 상태는 아니어서다. 하지만 위반(2)보다는 낫다.
 *
 * ⚠ 이 자리가 `x.v.bad.length` **뒤**인 것이 중요하다. 앞에 두면 기하를 망가뜨리고
 * 명암만 고친 후보가 이긴다. 뒤에 두면 기하가 같을 때만 명암이 판정에 들어간다.
 *
 * ⚠ `flat` 이 1 이라 **원본이 `upper-left` 인데 후보가 `flat` 이면 진다** — 셰이딩을
 * 잃는 교환을 막는다. 원본이 이미 `flat` 이면 같은 값이라 이 축이 통과하고 기하로 넘어간다.
 */
export function lightPenalty(v: LightVerdict): number {
  if (v === 'upper-left') return 0;
  if (v === 'flat') return 1;
  return 2; // flipped · unmeasurable
}

/** `a` 가 `b` 보다 **엄격하게** 낫나. 같으면 false — 같은 값으로 팩을 흔들지 않는다 */
export function isBetter(a: Measured, b: Measured): boolean {
  const sa = scoreOf(a);
  const sb = scoreOf(b);
  const EPS = 1e-9;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i]! < sb[i]! - EPS) return true;
    if (sa[i]! > sb[i]! + EPS) return false;
  }
  return false;
}



// ────────────────────────── 실패 모드 → 프롬프트 문장 ──────────────────────────

/**
 * 직전 시도가 **무엇을 틀렸는지**를 영어로 적는다.
 *
 * ⚠ 이것이 이 도구의 값이다. 리롤이 같은 실수를 반복하는 것을 막는 유일한 수단이고,
 * 저장소에 선례가 있다 (`assets/generated/YAW20-RESPEC.md` — 문장을 고쳐서가 아니라
 * **무엇이 틀렸는지 그림과 수치로 말해서** 0.64 가 0.268 로 왔다).
 */
export function failureNotes(x: Measured): string[] {
  const notes: string[] = [];
  const pct = (v: number | null): string => (v === null ? 'unmeasurable' : v.toFixed(3));
  const wantFrac = x.want.bottomFrac;

  if (x.v.axesSwapped === true) {
    notes.push(
      `The previous attempt had the two footprint axes SWAPPED. Its ground bottom vertex ` +
        `measured at ${pct(x.m.bottomFrac)} of the sprite width, which is where a ` +
        `${x.d}x${x.w} footprint would put it — this object is ${x.w}x${x.d}, so the vertex ` +
        `belongs at ${pct(wantFrac)}. Do not mirror the guide. The W axis (${x.w} tiles) runs ` +
        `toward the LOWER RIGHT and the D axis (${x.d} tiles) runs toward the LOWER LEFT. ` +
        `Follow the attached guide's diamond exactly.`,
    );
  } else if (x.v.bad.includes('vertex')) {
    notes.push(
      `The previous attempt's ground bottom vertex was ${(x.v.vertexTexels ?? 0).toFixed(1)} px ` +
        `off: it measured ${pct(x.m.bottomFrac)} of the sprite width where the contract puts it ` +
        `at ${pct(wantFrac)} (= ${x.w}/${x.w + x.d}). The near corner of the base — the lowest ` +
        `point of the whole object — must sit at that fraction across, not in the middle.`,
    );
  }

  if (x.v.bad.includes('slope')) {
    notes.push(
      `The previous attempt's two lower base edges measured slope ` +
        `${pct(x.m.slopeLeft)}/${pct(x.m.slopeRight)} instead of exactly +0.500/-0.500. ` +
        `Every horizontal edge of the base runs at exactly 2:1 — two pixels across for one ` +
        `pixel down. This is 2:1 dimetric, NOT the symmetric 30-degree isometric.`,
    );
  }

  if (x.v.bad.includes('iou')) {
    notes.push(
      `The previous attempt's ground silhouette overlapped the contract diamond by only ` +
        `IoU ${x.m.wedgeIoU.toFixed(3)} (it must reach ${x.v.iouMin.toFixed(3)}). The base is ` +
        `not the right shape: it must be one clean ${(x.w + x.d) * 16}x${(x.w + x.d) * 8} px ` +
        `diamond with the object standing on it, with nothing sticking out below or beside it.`,
    );
  }

  if (x.noMargin) {
    notes.push(
      `The previous attempt still needed to move sideways to sit on its own tile, but it was ` +
        `already touching the edge of its canvas, so it could not be moved at all. Draw the base ` +
        `diamond as the widest part of the object and leave clear empty margin on both sides.`,
    );
  }

  /*
   * 광원 — 게이트 5. ⚠ **`flat` 은 여기서 말하지 않는다.** 위반이 아니므로 (`passed`
   * 주석) 지적하면 도구가 게임보다 엄격해지고, 리롤이 못 고칠 것을 고치려다 기하를
   * 망가뜨린다. 말할 것은 `flipped`(반대쪽에서 온다)와 `unmeasurable`(벽이 없다)뿐이다.
   */
  if (x.lightV === 'flipped') {
    notes.push(
      `The previous attempt was LIT FROM THE WRONG SIDE. Measuring the wall band just above ` +
        `the ground contact line, its left face was ${Math.abs(x.light.score ?? 0).toFixed(0)} ` +
        `luminance DARKER than its right face — the light was coming from the upper RIGHT. ` +
        `The light is fixed in screen space and always comes from the UPPER LEFT: the face ` +
        `that recedes toward the lower left must be the BRIGHT one, and the face that recedes ` +
        `toward the lower right must be the SHADED one. Do not mirror the previous image to ` +
        `fix this — that would also mirror the footprint. Re-shade the same view.`,
    );
  } else if (x.lightV === 'unmeasurable') {
    notes.push(
      `The previous attempt had no readable vertical faces: only ${x.light.left} columns on the ` +
        `left and ${x.light.right} on the right rose at least 3 px above the ground contact ` +
        `line (4 are needed on each side). The object must stand on its base as a solid volume ` +
        `with two visible side walls, not as a flat cut-out lying on the ground.`,
    );
  }

  if (notes.length === 0 && !passed(x)) {
    notes.push(
      `The previous attempt failed the gates on: ${[...x.v.bad, ...(x.lightV === 'flipped' || x.lightV === 'unmeasurable' ? ['light'] : [])].join(', ')}. ` +
        `Rebuild the base strictly to the attached guide.`,
    );
  }
  return notes;
}

// ────────────────────────────── 프롬프트 조립 ──────────────────────────────

export interface PromptParts {
  item: SheetItem;
  /** `make-kairo-guide.ts --table` 이 내는 규격 줄 (한국어 정본) */
  specLine: string;
  /** 발자국 두 축 — 규격 줄과 같은 값에서 온다 */
  w: number;
  d: number;
  canvas: readonly [number, number];
  style: string;
  notes: string[];
}

/** 문서의 다른 문단과 같은 폭으로 접는다 — 한 줄짜리 긴 문장은 사람도 모델도 안 읽는다 */
function wrap(text: string, width: number, first: string, cont: string): string[] {
  const out: string[] = [];
  let line = first;
  let empty = true;
  for (const word of text.split(/\s+/)) {
    if (!empty && line.length + 1 + word.length > width) {
      out.push(line);
      line = cont;
      empty = true;
    }
    line = empty ? line + word : `${line} ${word}`;
    empty = false;
  }
  if (!empty) out.push(line);
  return out;
}

export function buildPrompt(p: PromptParts): string {
  const { item, specLine, canvas, style, notes, w, d } = p;
  const chromaHex = item.chroma === 'green' ? '#00FF00' : '#FF00FF';
  const lines: string[] = [];
  lines.push(style);
  lines.push('');
  lines.push(
    'Goal: ONE 2D pixel-art sprite of a single object for a Korean riverside water park,',
    'drawn in the 2:1 dimetric isometric view described above. This is a single-object',
    `regeneration of one cell from asset sheet ${item.sheet}; everything else on that sheet`,
    'already exists and must not be redrawn.',
    '',
    `Canvas: ${GEN_SIZE} landscape. Flat ${chromaHex} ${item.chroma} background filling the whole`,
    'image. ONE object only, centred, with generous empty margin on all four sides. No label,',
    'no caption, no text, no grid, no second object, no cell divisions.',
    '',
    /*
     * ⚠ 스타일 계약의 ISOLATION AND LABELS 절은 **시트**를 전제로 "칸마다 라벨"을 요구한다.
     * 한 종만 다시 뽑을 때는 라벨이 곧 잡음(추출기가 라벨 띠를 잘라야 한다)이라 여기서
     * 한 줄로 무효화한다 — 스타일 블록 자체는 축자 그대로 두는 것이 계약이다.
     */
    'This is a single-object regeneration, so the ISOLATION AND LABELS rule above applies with',
    'one change: there is one object and NO label of any kind. Everything else in the style',
    'contract above still holds verbatim.',
    '',
    'Reference images, in the order attached:',
    '  1. THE FOOTPRINT GUIDE — a grey 3D box drawn in the exact contract projection for this',
    "     object's footprint. Its base diamond, its two visible side faces and its tile grid are",
    '     the geometry contract. Build the object to FILL that box: the ground footprint is the',
    "     box's base, the widest points touch the box's left and right, the top reaches the box's",
    '     top face. Copy the base angles exactly. Do not redraw the box, its grey colour, its',
    '     grid lines or its outline.',
    '  2+. STYLE CROPS — the authority for pixel density, palette and outline weight. They say',
    '     nothing about this object\'s shape or footprint; the guide does.',
    '',
    /*
     * ⚠ 규격 줄은 **한국어 정본을 축자로** 넣고 영어 요약을 옆에 붙인다. 번역만 넣으면
     * `--table` 이 바뀌었을 때 프롬프트가 조용히 옛 규격으로 남는다.
     */
    'Contract spec line (this is what the geometry gate measures):',
    `  ${specLine}`,
    `  In English: footprint ${w}x${d} tiles; base diamond exactly ${(w + d) * 16}x${(w + d) * 8} px;`,
    `  whole sprite ${canvas[0]}x${canvas[1]} px; the bottom vertex of the base sits at`,
    `  ${(w / (w + d)).toFixed(3)} (= ${w}/${w + d}) of the sprite width, NOT at the middle;`,
    '  the two lower edges run at exactly +0.500 and -0.500 (2:1).',
    '',
    'The object:',
    `1. ${item.body}`,
  );

  if (notes.length > 0) {
    lines.push('', 'WHAT WENT WRONG LAST TIME — do not repeat it:');
    for (const n of notes) lines.push(...wrap(n, 92, '  - ', '    '));
  }

  lines.push(
    '',
    'The object faces the standard way: its front-right face toward the lower right, its',
    'front-left face toward the lower left, roof or top surface visible.',
    '',
    'Do not turn the footprint into a square box. Obey the base diamond pixel sizes above.',
  );
  return lines.join('\n');
}

// ────────────────────────────── 외부 명령 ──────────────────────────────

export class CapabilityError extends Error {}

function sh(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // ⚠ 바이트코드를 남기지 않는다 — `tools/__pycache__/` 에 pyc 가 쌓여 git 이 더러워진다
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const log = `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`;
    if (log.includes(NO_IMAGE_GEN)) throw new CapabilityError(log);
    throw new Error(log.slice(-2000));
  }
}

/** sprite-gen 으로 한 장 생성한다 (크로마 제거까지 그쪽 정본 계약으로) */
export function generate(promptFile: string, refs: string[], out: string, chroma: string): void {
  if (!existsSync(SPRITE_GEN)) {
    throw new CapabilityError(`sprite-gen 이 없다: ${SPRITE_GEN}`);
  }
  const args = ['gen', '--provider', 'codex', '--prompt-file', promptFile];
  for (const r of refs) args.push('--ref', r);
  args.push('--out', out, '--transparent', '--chroma-key', chroma);
  const log = sh(SPRITE_GEN, args);
  if (log.includes(NO_IMAGE_GEN)) throw new CapabilityError(log);
}

/**
 * 크로마 → 투명. sprite-gen 의 정본 계약(`sprite_gen.gen.chroma`)을 그대로 부른다.
 *
 * 생성 경로는 `gen --transparent` 가 이미 이걸 태우므로 필요 없다. `--use-existing` 으로
 * 파이프를 시험할 때는 소스가 **불투명 마젠타**일 수 있어서(가이드 PNG가 그렇다) 여기서
 * 태운다. ⚠ 안 태우면 캔버스 전체가 피사체가 되어 추출기가 **꽉 찬 사각형**을 뱉는데,
 * 면제가 걸린 종(파라솔)은 그 쓰레기가 **게이트를 통과한다** — 실측으로 밟았다.
 */
function keyChroma(src: string, dst: string, chroma: string): void {
  sh(PYTHON, [
    '-c',
    'import sys;from pathlib import Path;from sprite_gen.gen import chroma;' +
      'chroma.key_transparent(Path(sys.argv[1]), Path(sys.argv[2]), key=sys.argv[3])',
    src,
    dst,
    chroma,
  ]);
}

/** 이미 투명 픽셀이 있나 — 있으면 키를 다시 태우지 않는다 */
function hasAlpha(path: string): boolean {
  const png = decodePng(path);
  for (let k = 3; k < png.data.length; k += 4) if (png.data[k]! < ALPHA_SOLID) return true;
  return false;
}

/**
 * 크로마 키를 **그림에서** 읽는다 (좌상단 모서리).
 *
 * ⚠ 시트의 크로마를 그대로 쓰면 안 된다. 발자국 가이드는 시트가 초록을 쓰든 말든
 * **언제나 마젠타**다 (`tools/make-kairo-guide.ts` 의 `BG` — 후처리 파이프라인과 키를
 * 맞추려고 그렇게 정해져 있다). 실측으로 밟았다: S1(초록) 의 파라솔을 시트 크로마로
 * 키하면 `keyed_pixels 0` 이 되고, 캔버스 전체가 피사체가 되어 꽉 찬 사각형이 나온다.
 */
function detectKey(path: string): 'magenta' | 'green' {
  const png = decodePng(path);
  const [r, g, b] = [png.data[0]!, png.data[1]!, png.data[2]!];
  if (r > 200 && b > 200 && g < 80) return 'magenta';
  if (g > 200 && r < 80 && b < 80) return 'green';
  throw new Error(`크로마 배경이 아니다 (모서리 rgb ${r},${g},${b}): ${path}`);
}

/**
 * 후처리 — `tools/process-kairo-sheet.py` 의 **항목 렌더러를 그대로** 부른다.
 *
 * ⚠ 파이썬 파일을 복제하지 않는다. 시트 전체를 자르는 `main()` 대신 `render_asset` 한
 * 함수만 쓰는 것이라, 팔레트·bbox 추정·바닥 꼭짓점 평행이동이 전부 같은 코드다.
 * (`__name__` 이 `__main__` 이 아니므로 그쪽 `main()` 은 안 돈다.)
 */
const EXTRACT_PY = `
import importlib.util, json, sys
from PIL import Image
src, dst, sheet, sprite_id, filename, w, h, label_frac, mod, fp_w, fp_d, fp_body_h = sys.argv[1:13]
spec = importlib.util.spec_from_file_location("pks", mod)
m = importlib.util.module_from_spec(spec)
# ⚠ dataclass 는 자기 모듈을 sys.modules 에서 되찾는다 — 등록 안 하면 AttributeError 로 죽는다
sys.modules["pks"] = m
spec.loader.exec_module(m)
if sheet.startswith("W"):
    raise SystemExit("regen-facility: 시설 시트가 아니다: " + sheet)
img = Image.open(src).convert("RGBA")
asset = m.Asset(sprite_id, filename, int(w), int(h))
fp = m.Footprint(int(fp_w), int(fp_d), int(fp_body_h))
if fp is None:
    raise SystemExit("regen-facility: 발자국 계약이 없다: " + sprite_id)
out, details = m.render_asset(img, asset, m.palette_for(sheet, ""), float(label_frac), fp)
out.save(dst)
print(json.dumps(details, ensure_ascii=False))
`;

export function extract(
  item: SheetItem,
  src: string,
  dst: string,
  canvas: readonly [number, number],
  labelFrac: number,
  footprint: readonly [number, number, number],
): unknown {
  const log = sh(PYTHON, [
    '-c',
    EXTRACT_PY,
    src,
    dst,
    item.sheet,
    item.spriteId,
    item.file,
    String(canvas[0]),
    String(canvas[1]),
    String(labelFrac),
    PROCESS_SHEET,
    String(footprint[0]),
    String(footprint[1]),
    String(footprint[2]),
  ]);
  const last = log.trim().split('\n').pop() ?? '{}';
  try {
    return JSON.parse(last);
  } catch {
    return { raw: last };
  }
}

// ────────────────────────────── 대상 선정 ──────────────────────────────

export interface Target {
  id: string;
  sprite: string;
  file: string;
  w: number;
  d: number;
  bodyH: number;
  canvas: readonly [number, number];
}

export function allTargets(): Target[] {
  const out: Target[] = [];
  for (const s of allSimFacilities()) {
    const r = renderSpec(s.sprite);
    if (!r) continue;
    const w = s.size[0];
    const d = s.size[1];
    const c = footprintCanvas(w, d, r.bodyH);
    out.push({
      id: s.id,
      sprite: s.sprite,
      file: assetIdToFile(s.sprite),
      w,
      d,
      bodyH: r.bodyH,
      canvas: [c.x, c.y],
    });
  }
  return out;
}

// ────────────────────────────── 실행 ──────────────────────────────

interface Options {
  ids: string[];
  all: boolean;
  severe: boolean;
  /** A군 — 접지와 광원이 **둘 다** 틀린 것. 한 번 다시 뽑아 둘을 같이 잡는다 */
  both: boolean;
  /** B군 — 접지만 */
  geomOnly: boolean;
  /** C군 — 광원만 (지금까지 한 번도 재생성 대상이 아니었다) */
  lightOnly: boolean;
  tries: number;
  dryRun: boolean;
  print: boolean;
  useExisting: string | null;
  pack: string;
  work: string;
  labelFrac: number;
  strictAdopt: boolean;
  verifyGate: boolean;
}

function parseArgs(argv: string[]): Options {
  const val = (flag: string, dflt: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] ?? dflt) : dflt;
  };
  return {
    ids: argv.flatMap((a, i) => (a === '--id' ? [argv[i + 1] ?? ''] : [])).filter(Boolean),
    all: argv.includes('--all'),
    severe: argv.includes('--severe'),
    both: argv.includes('--both'),
    geomOnly: argv.includes('--geom-only'),
    lightOnly: argv.includes('--light-only'),
    tries: Number(val('--tries', '3')),
    dryRun: argv.includes('--dry-run'),
    print: argv.includes('--print'),
    useExisting: argv.includes('--use-existing') ? val('--use-existing', 'guide') : null,
    pack: val('--pack', PACK_DIR),
    work: val('--work', WORK_DIR),
    labelFrac: Number(val('--label-fraction', '0')),
    strictAdopt: argv.includes('--strict-adopt'),
    verifyGate: argv.includes('--verify-gate'),
  };
}

/** 지금 팩을 재서 대상 목록을 만든다 — 목록을 손으로 적어 두면 그림이 바뀔 때 갈라진다 */
function selectTargets(o: Options): { t: Target; base: Measured | null }[] {
  const rows = allTargets().map((t) => {
    const p = join(o.pack, t.file);
    const base = existsSync(p) ? measurePng(p, t.id, t.w, t.d, t.bodyH) : null;
    return { t, base };
  });
  if (o.ids.length > 0) {
    const want = new Set(o.ids);
    const picked = rows.filter((r) => want.has(r.t.id));
    const missing = [...want].filter((id) => !rows.some((r) => r.t.id === id));
    if (missing.length > 0) throw new Error(`계약에 없는 시설 id: ${missing.join(', ')}`);
    return picked;
  }
  /*
   * ⚠ 대상은 **게이트 4 와 5 를 합쳐서** 고른다. 예전에는 기하만 봤는데, 그러면
   * "각도는 맞고 그림자만 반대"인 8종이 `--all` 에 **한 번도 안 들어간다** — 실제로
   * 그 8종은 지금까지 재생성을 한 번도 안 돌렸다. 게이트가 두 개면 대상도 둘의 합집합이다.
   */
  const geomBad = (r: (typeof rows)[number]): boolean => r.base !== null && r.base.v.bad.length > 0;
  const lightBad = (r: (typeof rows)[number]): boolean =>
    r.base !== null && (r.base.lightV === 'flipped' || r.base.lightV === 'unmeasurable');
  const bad = rows.filter((r) => geomBad(r) || lightBad(r));

  if (o.severe) return bad.filter((r) => r.base!.v.severe);
  if (o.both) return bad.filter((r) => geomBad(r) && lightBad(r)); // A군 — 한 번에 둘을 잡는다
  if (o.geomOnly) return bad.filter((r) => geomBad(r) && !lightBad(r));
  if (o.lightOnly) return bad.filter((r) => lightBad(r) && !geomBad(r));
  if (o.all) return bad;
  throw new Error(
    '대상이 없다 — --id <id> · --severe · --both · --geom-only · --light-only · --all 중 하나를 줄 것',
  );
}

function fmtMeasure(x: Measured): string {
  const lit = `${VERDICT_NAME[x.lightV]}${x.light.score === null ? '' : ` ${x.light.score.toFixed(1)}`}`;
  return (
    `vertex ${(x.v.vertexTexels ?? -1).toFixed(1)}tx IoU ${x.m.wedgeIoU.toFixed(3)}` +
    `(≥${x.v.iouMin.toFixed(3)}) slope ${(x.m.slopeLeft ?? 0).toFixed(3)}/${(x.m.slopeRight ?? 0).toFixed(3)}` +
    ` 광원 ${lit}` +
    (passed(x) ? ' 통과' : ` ✕${[...x.v.bad, ...(x.lightV === 'flipped' || x.lightV === 'unmeasurable' ? [`광원:${x.lightV}`] : [])].join(',')}`)
  );
}

/** 판정 복제가 `kairo-gate.ts --json` 과 같은가 — 갈라짐을 잡는 유일한 장치 */
function verifyGate(o: Options): number {
  const raw = execFileSync('npx', ['tsx', 'tools/kairo-gate.ts', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw) as {
    geom: { id: string; bad: string[]; severe: boolean; axesSwapped: boolean | null; wedgeIoU: number; vertexTexels: number | null }[];
    light: { id: string; verdict: string; score: number | null }[];
  };
  const gateLight = new Map(parsed.light.map((l) => [l.id, l]));
  const byId = new Map(allTargets().map((t) => [t.id, t]));
  let checked = 0;
  let mismatch = 0;
  for (const g of parsed.geom) {
    const t = byId.get(g.id);
    if (!t) continue; // 지면 33장은 이 도구의 대상이 아니다
    const mine = measurePng(join(o.pack, t.file), t.id, t.w, t.d, t.bodyH);
    checked++;
    // ⚠ 광원도 대조한다 — 판정을 복제한 축은 **전부** 대조해야 갈라짐을 잡는다
    const gl = gateLight.get(g.id);
    const same =
      mine.v.bad.join(',') === g.bad.join(',') &&
      mine.v.severe === g.severe &&
      mine.v.axesSwapped === g.axesSwapped &&
      Math.abs(mine.m.wedgeIoU - g.wedgeIoU) < 1e-9 &&
      gl !== undefined &&
      mine.lightV === gl.verdict &&
      (mine.light.score === null
        ? gl.score === null
        : gl.score !== null && Math.abs(mine.light.score - gl.score) < 1e-9);
    if (!same) {
      mismatch++;
      console.log(
        `  ✕ ${g.id}: 게이트 [${g.bad.join(',')}] IoU ${g.wedgeIoU.toFixed(4)} 광원 ${gl?.verdict ?? '없음'} / ` +
          `복제 [${mine.v.bad.join(',')}] IoU ${mine.m.wedgeIoU.toFixed(4)} 광원 ${mine.lightV}`,
      );
    }
  }
  console.log(`판정 복제 대조 — 시설 ${checked}종 · 불일치 ${mismatch}`);
  return mismatch;
}

function main(): void {
  const o = parseArgs(process.argv.slice(2));
  if (o.verifyGate) {
    process.exitCode = verifyGate(o) === 0 ? 0 : 1;
    return;
  }

  const doc = readFileSync(DOC, 'utf8');
  const style = canonicalStyle(doc);
  const chosen = selectTargets(o);
  const showPrompt = o.print || (o.dryRun && chosen.length === 1);

  console.log(
    `재생성 대상 ${chosen.length}종` +
      (o.dryRun ? ' (--dry-run — 생성하지 않는다)' : ` · 종당 최대 ${o.tries}회`),
  );

  const summary: { id: string; state: string; before: string; after: string }[] = [];
  let n = 0;
  let fatal: string | null = null;

  for (const { t, base } of chosen) {
    n++;
    const head = `[${n}/${chosen.length}] ${t.id}`;
    let item: SheetItem;
    try {
      item = findItem(doc, t.id, t.sprite);
    } catch (e) {
      console.log(`${head} ✕ 프롬프트 조립 실패 — ${(e as Error).message}`);
      summary.push({ id: t.id, state: '조립실패', before: '—', after: '—' });
      continue;
    }

    const guide = join(GUIDE_DIR, assetIdToFile(t.sprite));
    const refs = [guide, ...item.crops];
    // 항목별 필터로 크롭이 하나만 남으면 전경 레퍼런스로 채운다 (문서 §REFERENCE 의 3번째 이미지)
    if (refs.length < 3) refs.push('art-reference/ref-1.png');
    const missingRefs = refs.filter((r) => !existsSync(r));
    const specLine = guideSpecLine({ id: t.id, sprite: t.sprite, w: t.w, d: t.d, bodyH: t.bodyH });
    const styleVerbatim = item.styleBlock === style;

    const notes = base === null ? [] : failureNotes(base);
    const prompt = buildPrompt({ item, specLine, canvas: t.canvas, style, notes, w: t.w, d: t.d });

    const flags = [
      styleVerbatim ? null : '⚠스타일블록이 정본과 다르다',
      missingRefs.length > 0 ? `⚠레퍼런스 없음: ${missingRefs.join(',')}` : null,
      item.crops.length === 0 ? '⚠첨부 크롭 0' : null,
    ].filter(Boolean);

    console.log(
      `${head} 시트 ${item.sheet}#${item.cell} "${item.label}" · 참조 ${refs.length}장 · ` +
        `프롬프트 ${prompt.length}자 · 실패모드 ${notes.length}개 · ` +
        `${base === null ? '팩에 그림 없음' : fmtMeasure(base)}` +
        (flags.length > 0 ? ` · ${flags.join(' · ')}` : ''),
    );

    if (o.dryRun) {
      /*
       * ⚠ 첨부 목록을 **반드시 같이 찍는다.** 이 도구가 자동으로 돌 때는 `--ref` 로
       * 넘어가지만, `image_gen` 권한이 없는 환경에서는 사람이 **프롬프트를 복사해 다른
       * 세션에 붙여넣고 이미지를 직접 첨부**한다 (이 저장소의 실제 상황이다).
       * 그때 무엇을 붙일지 안 적혀 있으면 프롬프트만으로는 재현이 안 된다 —
       * 첫 장이 발자국 가이드여야 하고 순서도 프롬프트 본문이 번호로 가리킨다.
       */
      console.log(`  첨부(순서대로): ${refs.join(' · ')}  [크로마 ${item.chroma}]`);
      if (showPrompt) console.log(`\n${'─'.repeat(72)}\n${prompt}\n${'─'.repeat(72)}\n`);
      summary.push({
        id: t.id,
        state: flags.length > 0 ? '조립경고' : '조립OK',
        before: base === null ? '—' : fmtMeasure(base),
        after: '—',
      });
      continue;
    }

    // ── 실제 루프 ──
    const dir = join(o.work, t.id);
    mkdirSync(dir, { recursive: true });
    const packPath = join(o.pack, t.file);
    const backup = join(dir, 'backup.png');
    if (existsSync(packPath) && !existsSync(backup)) copyFileSync(packPath, backup);

    let best: Measured | null = base;
    let bestFile: string | null = null;
    let feedback = base;

    for (let attempt = 1; attempt <= o.tries; attempt++) {
      const notesNow = feedback === null ? [] : failureNotes(feedback);
      const promptNow = buildPrompt({
        item,
        specLine,
        canvas: t.canvas,
        style,
        notes: notesNow,
        w: t.w,
        d: t.d,
      });
      const pf = join(dir, `prompt-${attempt}.txt`);
      writeFileSync(pf, `${promptNow}\n`);
      const genPath = join(dir, `gen-${attempt}.png`);
      const candPath = join(dir, `cand-${attempt}.png`);

      try {
        if (o.useExisting !== null) {
          const src =
            o.useExisting === 'guide'
              ? guide
              : o.useExisting === 'pack'
                ? packPath
                : o.useExisting;
          if (hasAlpha(src)) copyFileSync(src, genPath);
          else keyChroma(src, genPath, detectKey(src));
        } else {
          generate(pf, refs, genPath, item.chroma);
        }
        extract(item, genPath, candPath, t.canvas, o.labelFrac, [t.w, t.d, t.bodyH]);
      } catch (e) {
        if (e instanceof CapabilityError) {
          fatal = (e as Error).message;
          break;
        }
        // ⚠ 마지막 줄만 찍으면 파이썬 트레이스백의 **빈 꼬리**가 나와 원인이 안 보인다 (실측)
        const msg = (e as Error).message.trim().split('\n').filter(Boolean).slice(-2).join(' | ');
        console.log(`  ${head} try ${attempt}/${o.tries} ✕ ${msg}`);
        continue;
      }

      const cand = measurePng(candPath, t.id, t.w, t.d, t.bodyH);
      const before = base === null ? '—' : (base.v.vertexTexels ?? -1).toFixed(1);
      console.log(
        `  ${head} try ${attempt}/${o.tries} → vertex ${before}→${(cand.v.vertexTexels ?? -1).toFixed(1)} ` +
          `IoU ${base === null ? '—' : base.m.wedgeIoU.toFixed(3)}→${cand.m.wedgeIoU.toFixed(3)} ` +
          `${passed(cand) ? '통과' : `✕${cand.v.bad.join(',')}`}`,
      );

      if (best === null || isBetter(cand, best)) {
        best = cand;
        bestFile = candPath;
      }
      feedback = cand;
      if (passed(cand)) break;
    }

    if (fatal !== null) break;

    // ── 채택 / 되돌리기 ──
    let state = '유지';
    if (best !== null && bestFile !== null) {
      const okToAdopt = o.strictAdopt ? passed(best) : passed(best) || base === null || isBetter(best, base);
      if (okToAdopt) {
        copyFileSync(bestFile, packPath);
        const after = measurePng(packPath, t.id, t.w, t.d, t.bodyH);
        // ⚠ 쓴 **뒤에** 다시 잰다. 쓰기가 틀렸으면 여기서 잡히고, 되돌릴 백업이 옆에 있다
        if (base !== null && !passed(after) && !isBetter(after, base)) {
          copyFileSync(backup, packPath);
          state = '되돌림(나빠짐)';
        } else {
          state = passed(after) ? '채택(통과)' : '채택(개선)';
        }
      } else {
        state = '유지(개선 없음)';
      }
    }
    summary.push({
      id: t.id,
      state,
      before: base === null ? '—' : fmtMeasure(base),
      after: best === null ? '—' : fmtMeasure(best),
    });
  }

  if (fatal !== null) {
    console.log('\n❌ 생성 불가 — 이 세션에서는 더 돌려도 전부 같은 이유로 실패한다:');
    console.log(
      fatal
        .split('\n')
        .map((l) => `   ${l}`)
        .join('\n'),
    );
    console.log('   → image_gen 을 제공하는 codex 계정의 세션에서 다시 돌릴 것.');
    process.exitCode = 2;
  }

  console.log(`\n요약 (${summary.length}종)`);
  const tally = new Map<string, number>();
  for (const s of summary) tally.set(s.state, (tally.get(s.state) ?? 0) + 1);
  for (const [k, v] of [...tally].sort()) console.log(`  ${k}: ${v}`);
  if (!o.dryRun) {
    for (const s of summary) console.log(`  ${s.id.padEnd(18)} ${s.state.padEnd(14)} ${s.before}  →  ${s.after}`);
  }
}

if (process.argv[1]?.endsWith('regen-facility.ts') === true) main();

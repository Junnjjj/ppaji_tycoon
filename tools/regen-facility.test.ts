/**
 * `tools/regen-facility.ts` 검사.
 *
 * 두 가지를 지킨다:
 *   ① **프롬프트 조립** — 시설 75종 전부가 시트 항목을 찾고, 스타일 블록이 축자로 들어가고,
 *      규격 줄과 실패 모드 문구가 들어간다. 조립이 조용히 반쯤 되면 리롤이 같은 실수를
 *      반복하는데, 그건 화면에 안 나온다.
 *   ② **채택 규칙** — 나빠진 후보는 채택되지 않는다. 통과한 그림을 덮어쓰는 사고는
 *      되돌릴 수 없다 (원본이 gitignore 아래에 있다).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOC,
  GUIDE_DIR,
  PACK_DIR,
  allTargets,
  attachCrops,
  buildPrompt,
  canonicalStyle,
  failureNotes,
  findItem,
  isBetter,
  measurePng,
  scoreOf,
  sheetSections,
  type Measured,
} from './regen-facility.js';
import { measureCanonical, type GeomAxis } from './ground-geometry.js';
import { assetIdToFile } from '../src/assets/kairo-contract.js';
import { guideSpecLine } from './make-kairo-guide.js';

const doc = readFileSync(DOC, 'utf8');
const style = canonicalStyle(doc);
const targets = allTargets();

describe('프롬프트 조립', () => {
  it('시설 75종 전부가 시트 항목을 찾는다', () => {
    const failed: string[] = [];
    for (const t of targets) {
      try {
        findItem(doc, t.id, t.sprite);
      } catch (e) {
        failed.push(`${t.id}: ${(e as Error).message}`);
      }
    }
    expect(failed).toEqual([]);
    expect(targets.length).toBe(75);
  });

  it('시트마다의 스타일 블록이 정본과 축자 동일하다', () => {
    // 문서가 스스로 주장하는 성질(34/34 축자 동일)을 도구가 의존한다 — 의존하면 검사한다
    const drifted = targets
      .map((t) => findItem(doc, t.id, t.sprite))
      .filter((i) => i.styleBlock !== style)
      .map((i) => i.sheet);
    expect([...new Set(drifted)]).toEqual([]);
  });

  it('가이드 그림이 75종 전부 있다', () => {
    const missing = targets.filter((t) => !existsSync(join(GUIDE_DIR, assetIdToFile(t.sprite))));
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it('첨부 크롭이 비지 않는다', () => {
    const empty = targets
      .map((t) => findItem(doc, t.id, t.sprite))
      .filter((i) => i.crops.length === 0)
      .map((i) => `${i.sheet}#${i.cell}`);
    expect(empty).toEqual([]);
  });

  it('스타일 블록이 프롬프트에 축자로 들어간다', () => {
    const t = targets.find((x) => x.id === 'cafe')!;
    const item = findItem(doc, t.id, t.sprite);
    const prompt = buildPrompt({
      item,
      specLine: guideSpecLine({ id: t.id, sprite: t.sprite, w: t.w, d: t.d, bodyH: t.bodyH }),
      canvas: t.canvas,
      style,
      notes: [],
      w: t.w,
      d: t.d,
    });
    // 문단 하나가 아니라 **블록 전체**가 그대로 들어가야 한다 (요약·의역이면 계약이 깨진다)
    expect(prompt).toContain(style);
    expect(prompt.indexOf(style)).toBe(0);
  });

  it('규격 줄과 발자국 숫자가 프롬프트에 들어간다', () => {
    const t = targets.find((x) => x.id === 'cafe')!;
    const specLine = guideSpecLine({ id: t.id, sprite: t.sprite, w: t.w, d: t.d, bodyH: t.bodyH });
    const prompt = buildPrompt({
      item: findItem(doc, t.id, t.sprite),
      specLine,
      canvas: t.canvas,
      style,
      notes: [],
      w: t.w,
      d: t.d,
    });
    expect(prompt).toContain(specLine);
    expect(prompt).toContain('base diamond exactly 80x40 px');
    expect(prompt).toContain('0.400 (= 2/5)');
  });

  it('시트가 지정한 크로마 키를 그대로 쓴다', () => {
    // S1 은 초록 (구명환·자판기 전면이 빨강이라), L1 은 마젠타
    expect(findItem(doc, 'parasol', 'facility/parasol').chroma).toBe('green');
    expect(findItem(doc, 'cafe', 'facility/cafe').chroma).toBe('magenta');
  });

  it('항목별로 지정된 레퍼런스만 붙인다', () => {
    // L10 은 "governs item 1 ONLY" / "governs item 2" 로 갈라 놓았다 — 무시하면
    // 실측된 실패 모드(목조 펜션 밑에 튜브 베이스)가 그대로 돌아온다
    const l10 = sheetSections(doc).get('L10')!;
    expect(attachCrops(l10, 1)).toEqual(['art-reference/crops/iso-inflatable-a.png']);
    expect(attachCrops(l10, 2)).toEqual(['art-reference/crops/iso-shower-hut.png']);
  });
});

// ────────────────────────── 실패 모드 문구 ──────────────────────────

function fake(o: {
  w: number;
  d: number;
  bodyH: number;
  bottomFrac: number;
  slopeLeft?: number;
  slopeRight?: number;
  iou?: number;
  bad: GeomAxis[];
  axesSwapped?: boolean;
  vertexTexels?: number;
  noMargin?: boolean;
}): Measured {
  const want = measureCanonical(o.w, o.d, o.bodyH);
  return {
    id: 'fake',
    w: o.w,
    d: o.d,
    bodyH: o.bodyH,
    canvasW: (o.w + o.d) * 16,
    m: {
      bandTop: o.bodyH,
      contour: [],
      bottomFrac: o.bottomFrac,
      slopeLeft: o.slopeLeft ?? 0.5,
      slopeRight: o.slopeRight ?? -0.5,
      cover: 1,
      wedgeIoU: o.iou ?? 1,
    },
    want,
    v: {
      bad: o.bad,
      exempt: [],
      vertexTexels: o.vertexTexels ?? 0,
      slopeErrLeft: Math.abs((o.slopeLeft ?? 0.5) - 0.5),
      slopeErrRight: Math.abs((o.slopeRight ?? -0.5) + 0.5),
      iouMin: 0.85,
      severe: (o.vertexTexels ?? 0) >= 8,
      axesSwapped: o.axesSwapped ?? null,
    },
    noMargin: o.noMargin ?? false,
  };
}

describe('실패 모드를 프롬프트에 넣는다', () => {
  it('축 뒤집힘은 두 축을 이름으로 말하고 가이드를 뒤집지 말라고 한다', () => {
    const n = failureNotes(
      fake({ w: 2, d: 3, bodyH: 20, bottomFrac: 0.556, bad: ['vertex', 'iou'], axesSwapped: true, iou: 0.554, vertexTexels: 12.5 }),
    ).join('\n');
    expect(n).toContain('axes SWAPPED');
    expect(n).toContain('0.556'); // 실측
    expect(n).toContain('0.400'); // 계약
    expect(n).toContain('3x2'); // 뒤집힌 발자국을 이름으로 지목한다
    expect(n).toContain('Do not mirror the guide');
  });

  it('꼭짓점만 틀리면 몇 px 인지 말한다', () => {
    const n = failureNotes(fake({ w: 4, d: 1, bodyH: 8, bottomFrac: 0.9, bad: ['vertex'], vertexTexels: 8 })).join('\n');
    expect(n).toContain('8.0 px');
    expect(n).toContain('(= 4/5)');
    expect(n).not.toContain('axes SWAPPED');
  });

  it('기울기·모양·여백을 각각 말한다', () => {
    const n = failureNotes(
      fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, slopeLeft: 0.82, slopeRight: -0.29, iou: 0.6, bad: ['slope', 'iou'], noMargin: true }),
    ).join('\n');
    expect(n).toContain('+0.500/-0.500');
    expect(n).toContain('IoU 0.600');
    expect(n).toContain('64x32 px');
    expect(n).toContain('touching the edge of its canvas');
  });

  it('통과한 그림에는 실패 문구가 없다', () => {
    expect(failureNotes(fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, bad: [] }))).toEqual([]);
  });

  it('실패 문구는 프롬프트의 전용 절에 들어간다', () => {
    const t = targets.find((x) => x.id === 'cafe')!;
    const notes = failureNotes(
      fake({ w: 2, d: 3, bodyH: 20, bottomFrac: 0.556, bad: ['vertex'], axesSwapped: true, vertexTexels: 12.5 }),
    );
    const prompt = buildPrompt({
      item: findItem(doc, t.id, t.sprite),
      specLine: 'spec',
      canvas: t.canvas,
      style,
      notes,
      w: t.w,
      d: t.d,
    });
    expect(prompt).toContain('WHAT WENT WRONG LAST TIME');
    expect(prompt).toContain('axes SWAPPED');
  });
});

// ────────────────────────── 채택 규칙 ──────────────────────────

describe('채택 규칙 — 나빠지면 안 바꾼다', () => {
  const pass = fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, bad: [] });
  const oneAxis = fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, iou: 0.7, bad: ['iou'] });
  const threeAxes = fake({
    w: 2,
    d: 2,
    bodyH: 20,
    bottomFrac: 0.62,
    slopeLeft: 0.2,
    iou: 0.4,
    bad: ['vertex', 'slope', 'iou'],
    vertexTexels: 12,
  });

  it('통과가 무조건 이긴다', () => {
    expect(isBetter(pass, oneAxis)).toBe(true);
    expect(isBetter(oneAxis, pass)).toBe(false);
    expect(scoreOf(pass)[0]).toBe(0);
    expect(scoreOf(oneAxis)[0]).toBe(1);
  });

  it('축이 적을수록 낫다', () => {
    expect(isBetter(oneAxis, threeAxes)).toBe(true);
    expect(isBetter(threeAxes, oneAxis)).toBe(false);
  });

  it('같으면 안 바꾼다 — 동점 교체는 팩을 이유 없이 흔든다', () => {
    expect(isBetter(oneAxis, oneAxis)).toBe(false);
    expect(isBetter(pass, pass)).toBe(false);
  });

  it('축 수가 같으면 꼭짓점 오차 → IoU 부족 → 기울기 순으로 가린다', () => {
    const near = fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, bad: ['vertex'], vertexTexels: 3 });
    const far = fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, bad: ['vertex'], vertexTexels: 9 });
    expect(isBetter(near, far)).toBe(true);
    expect(isBetter(far, near)).toBe(false);

    const goodIou = fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, iou: 0.84, bad: ['iou'] });
    const badIou = fake({ w: 2, d: 2, bodyH: 20, bottomFrac: 0.5, iou: 0.5, bad: ['iou'] });
    expect(isBetter(goodIou, badIou)).toBe(true);
  });
});

// ───────────────── 팩이 있을 때만 — 실측 대상 목록 ─────────────────

describe.runIf(existsSync(join(PACK_DIR, 'facility__cafe.png')))('실측 팩 대상', () => {
  it('위반 종은 전부 프롬프트가 조립되고 실패 문구가 붙는다', () => {
    const bad = targets
      .map((t) => ({ t, m: measurePng(join(PACK_DIR, t.file), t.id, t.w, t.d, t.bodyH) }))
      .filter((r) => r.m.v.bad.length > 0);
    expect(bad.length).toBeGreaterThan(0);
    for (const { t, m } of bad) {
      const item = findItem(doc, t.id, t.sprite);
      const notes = failureNotes(m);
      expect(notes.length, `${t.id} 에 실패 문구가 없다`).toBeGreaterThan(0);
      const prompt = buildPrompt({
        item,
        specLine: guideSpecLine({ id: t.id, sprite: t.sprite, w: t.w, d: t.d, bodyH: t.bodyH }),
        canvas: t.canvas,
        style,
        notes,
        w: t.w,
        d: t.d,
      });
      expect(prompt).toContain(style);
      expect(prompt).toContain('WHAT WENT WRONG LAST TIME');
    }
  });
});

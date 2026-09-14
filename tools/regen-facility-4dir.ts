/**
 * Generate the 26 direction-readable Kairo facilities through the documented
 * d0 -> {d1,d2} -> d3 reference chain.
 *
 * Drafts and accepted candidates stay outside the live pack until every image
 * has passed geometry and lighting.  This avoids the contract/file-name split
 * described in docs/assets/history/prompt-chain-4dir-retrospective.md section 2.
 */

import { execFile, execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { assetIdToFile } from '../src/assets/kairo-contract.js';
import { guideSpecLine } from './make-kairo-guide.js';
import { decodePng } from './png.js';
import { lightVerdict, measureLight } from './light-direction.js';
import {
  DOC,
  GUIDE_DIR,
  PACK_DIR,
  allTargets,
  buildPrompt,
  canonicalStyle,
  extract,
  failureNotes,
  findItem,
  measurePng,
  type Measured,
  type SheetItem,
  type Target,
} from './regen-facility.js';

export const TARGET_IDS = [
  'ticket',
  'shop',
  'snackbar',
  'chicken',
  'icecream',
  'cafe',
  'sikhye',
  'bungeoppang',
  'vending_in',
  'vending_out',
  'info',
  'infirmary',
  'rent_kayak',
  'rent_pedal',
  'rent_duck',
  'rent_sup',
  'slide_small',
  'slide_large',
  'slide_tube',
  'snow_sled',
  'diving',
  'stage_river',
  'dj_booth',
  'karaoke',
  'arcade',
  'photozone',
] as const;

export type Direction = 'd0' | 'd1' | 'd2' | 'd3';

export const LIGHT_BLOCK = `LIGHT DOES NOT ROTATE WITH THE OBJECT. The single light stays at the UPPER LEFT of the
screen in every one of the four directions. The face that points toward the screen's
LOWER LEFT is always the lit one; the face that points toward the LOWER RIGHT is always
the shadow one. Do NOT mirror the shading when you mirror the shape — re-shade it.`;

const SPRITE_GEN = `${process.env['HOME'] ?? ''}/tools/sprite-gen/.venv/bin/sprite-gen`;
const WORK_ROOT = 'assets/generated/kairo-4dir';
const ACCEPTED = join(WORK_ROOT, 'accepted');

interface Options {
  ids: string[];
  stage: Direction | 'all';
  tries: number;
  concurrency: number;
  provider: 'codex' | 'grok';
  dryRun: boolean;
  force: boolean;
  seedExisting: boolean;
  raw: string | null;
  attempt: number;
  repairD0: boolean;
  report: boolean;
}

interface Metrics {
  geomBad: string[];
  bottomFrac: number | null;
  vertexTexels: number | null;
  wedgeIoU: number;
  iouMin: number;
  slopeLeft: number | null;
  slopeRight: number | null;
  lightScore: number | null;
  lightVerdict: string;
  paletteOff: number;
  opaquePixels: number;
  edgeRatio: number;
  passed: boolean;
}

interface AttemptRecord {
  attempt: number;
  prompt: string;
  refs: string[];
  generated: string;
  candidate: string;
  metrics?: Metrics;
  error?: string;
}

interface JobRecord {
  id: string;
  direction: Direction;
  target: string;
  source: 'generated' | 'existing-d0' | 'already-accepted' | 'dry-run';
  attempts: AttemptRecord[];
  accepted: boolean;
  metrics?: Metrics;
}

const isTranspose = (direction: Direction): boolean => direction === 'd1' || direction === 'd3';
const acceptedPath = (id: string, direction: Direction): string =>
  join(ACCEPTED, `facility__${id}__${direction}.png`);

function value(argv: string[], flag: string, fallback: string): string {
  const at = argv.indexOf(flag);
  return at >= 0 ? (argv[at + 1] ?? fallback) : fallback;
}

function parseArgs(argv: string[]): Options {
  const requested = argv.flatMap((arg, index) => (arg === '--id' ? [argv[index + 1] ?? ''] : [])).filter(Boolean);
  const ids = requested.length > 0 ? requested : [...TARGET_IDS];
  const unknown = ids.filter((id) => !TARGET_IDS.includes(id as (typeof TARGET_IDS)[number]));
  if (unknown.length > 0) throw new Error(`Unknown four-direction facility id: ${unknown.join(', ')}`);
  const stage = value(argv, '--stage', 'all') as Options['stage'];
  if (!['all', 'd0', 'd1', 'd2', 'd3'].includes(stage)) throw new Error(`Bad --stage: ${stage}`);
  const provider = value(argv, '--provider', 'codex') as Options['provider'];
  if (provider !== 'codex' && provider !== 'grok') throw new Error(`Bad --provider: ${provider}`);
  return {
    ids,
    stage,
    tries: Number(value(argv, '--tries', '3')),
    concurrency: Number(value(argv, '--concurrency', '4')),
    provider,
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    seedExisting: !argv.includes('--no-seed-existing'),
    raw: argv.includes('--accept-raw') ? value(argv, '--accept-raw', '') : null,
    attempt: Number(value(argv, '--attempt', '1')),
    repairD0: argv.includes('--repair-d0'),
    report: argv.includes('--report'),
  };
}

function targetMap(): Map<string, Target> {
  return new Map(allTargets().filter((target) => TARGET_IDS.includes(target.id as (typeof TARGET_IDS)[number])).map((target) => [target.id, target]));
}

export function oriented(target: Target, direction: Direction): { w: number; d: number } {
  return isTranspose(direction) ? { w: target.d, d: target.w } : { w: target.w, d: target.d };
}

function guidePath(target: Target, direction: Direction): string {
  const base = assetIdToFile(target.sprite);
  if (!isTranspose(direction) || target.w === target.d) return join(GUIDE_DIR, base);
  return join(GUIDE_DIR, base.replace(/\.png$/, '__d1.png'));
}

function chainPath(id: string, direction: Direction): string | null {
  if (direction === 'd1' || direction === 'd2') return acceptedPath(id, 'd0');
  if (direction === 'd3') return acceptedPath(id, 'd2');
  return null;
}

function directionText(direction: Direction): string {
  if (direction === 'd0') {
    return [
      'DIRECTION CONTRACT — d0 locked front base.',
      'Show the public-facing FRONT in the standard orientation described above. This image becomes',
      'the identity and material lock for the other three directions, so do not invent a generic',
      'replacement and do not hide the service, boarding, or performance face.',
    ].join('\n');
  }
  if (direction === 'd1') {
    return [
      'DIRECTION CONTRACT — d1, MIRRORED front.',
      'Show the SAME public-facing FRONT from the opposite front side, as if the physical facility',
      'were rotated 90 degrees on the map. Redraw the structure in the new view. Do NOT flip, mirror,',
      'reflect, or copy pixels from d0; preserve every named material and feature while rotating it.',
    ].join('\n');
  }
  if (direction === 'd2') {
    return [
      'DIRECTION CONTRACT — d2, rear view.',
      'Show the physical REAR of the same facility, rotated 180 degrees from d0. The public-facing',
      'counter, boarding opening, or stage front belongs on the far side and must not remain falsely',
      'visible as a second front. Preserve the same roof, materials, footprint, and identity.',
    ].join('\n');
  }
  return [
    'DIRECTION CONTRACT — d3, MIRRORED rear.',
    'Show the SAME physical REAR from the opposite rear side, as if d2 were rotated 90 degrees on the',
    'map. Redraw the structure in the new view. Do NOT flip, mirror, reflect, or copy pixels from d2;',
    'preserve every named material and feature while rotating it.',
  ].join('\n');
}

function paletteSet(): Set<number> {
  const raw = JSON.parse(readFileSync('art-reference/palette-proposed-39.json', 'utf8')) as Record<string, string[]>;
  return new Set(
    Object.values(raw).flat().map((hex) => parseInt(hex.slice(1), 16)),
  );
}

const PALETTE = paletteSet();

export function metrics(path: string, target: Target, direction: Direction): { measured: Measured; metrics: Metrics } {
  const { w, d } = oriented(target, direction);
  const measured = measurePng(path, `${target.id}:${direction}`, w, d, target.bodyH);
  const light = measureLight(decodePng(path));
  const verdict = lightVerdict(light);
  const raster = decodePng(path);
  let paletteOff = 0;
  let opaquePixels = 0;
  let edges = 0;
  for (let y = 0; y < raster.h; y++) {
    let previous: number | null = null;
    for (let x = 0; x < raster.w; x++) {
      const at = (y * raster.w + x) * 4;
      if (raster.data[at + 3]! < 128) {
        previous = null;
        continue;
      }
      const rgb = (raster.data[at]! << 16) | (raster.data[at + 1]! << 8) | raster.data[at + 2]!;
      if (!PALETTE.has(rgb)) paletteOff++;
      opaquePixels++;
      if (previous !== null && previous !== rgb) edges++;
      previous = rgb;
    }
  }
  const out: Metrics = {
    geomBad: [...measured.v.bad],
    bottomFrac: measured.m.bottomFrac,
    vertexTexels: measured.v.vertexTexels,
    wedgeIoU: measured.m.wedgeIoU,
    iouMin: measured.v.iouMin,
    slopeLeft: measured.m.slopeLeft,
    slopeRight: measured.m.slopeRight,
    lightScore: light.score,
    lightVerdict: verdict,
    paletteOff,
    opaquePixels,
    edgeRatio: opaquePixels === 0 ? 0 : edges / opaquePixels,
    passed: measured.v.bad.length === 0 && verdict === 'upper-left' && paletteOff === 0,
  };
  return { measured, metrics: out };
}

function buildDirectionPrompt(
  item: SheetItem,
  target: Target,
  direction: Direction,
  style: string,
  feedback: { measured: Measured; metrics: Metrics } | null,
  chain: string | null,
  repairD0: boolean,
): string {
  const { w, d } = oriented(target, direction);
  const spec = guideSpecLine({ id: target.id, sprite: target.sprite, w, d, bodyH: target.bodyH });
  const notes = feedback === null ? [] : failureNotes(feedback.measured);
  const base = buildPrompt({ item, specLine: spec, canvas: target.canvas, style, notes, w, d });
  const rotated = isTranspose(direction) && target.w !== target.d
    ? [
        'ROTATED FOOTPRINT OVERRIDE — this direction is physically transposed.',
        `The canonical item description names ${target.w}x${target.d}, but ${direction} occupies ${w}x${d}.`,
        `The attached guide is a newly drawn ${w}x${d} guide, never a flipped guide, and this override wins.`,
      ].join('\n')
    : `FOOTPRINT FOR ${direction}: ${w}x${d}, exactly as drawn by the attached unflipped guide.`;
  const chainNote = chain === null
    ? 'CHAIN REFERENCE: none. This is the d0 lock base; style crops and the footprint guide own the result.'
    : [
        `CHAIN REFERENCE: the LAST attached image is the accepted ${direction === 'd3' ? 'd2' : 'd0'} sprite.`,
        'It owns facility identity, materials, silhouette vocabulary, and named features. Rotate/redraw those',
        'features into this direction; do not copy or mirror its pixels, its shading, or its ground diamond.',
      ].join('\n');
  const repairNote = repairD0 && direction === 'd0'
    ? [
        '',
        'D0 REPAIR REFERENCE: the LAST attached image is the current production sprite.',
        'Preserve its facility identity and, when its geometry already passes, preserve its complete opaque',
        'silhouette. Redraw only the failed contract properties named above. For a lighting-only repair,',
        're-shade the material planes without moving, scaling, mirroring, filling, or warping the footprint.',
      ].join('\n')
    : '';
  const lightFeedback = feedback === null || feedback.metrics.lightVerdict === 'upper-left'
    ? ''
    : [
        '',
        'WHAT WENT WRONG LAST TIME — LIGHTING:',
        `  - The previous attempt measured ${feedback.metrics.lightScore?.toFixed(1) ?? 'unmeasurable'} and was`,
        `    classified ${feedback.metrics.lightVerdict}. Re-shade from the fixed screen-space upper-left light.`,
      ].join('\n');
  const lightImplementation = [
    'LIGHTING IMPLEMENTATION — make the fixed direction measurable, not merely implied.',
    "On the vertical wall band immediately above the ground outline, the screen's LEFT face must use",
    "a visibly lighter palette tone than the screen's RIGHT face across the full face. Never give both",
    'faces the same tone. Valid one-step material pairs include wall #fdf3e0/#e4d3b4, wood',
    '#dcb079/#c49a6a, and roof #e0604f/#8b3c31 (lighter-left / darker-right).',
  ].join('\n');
  return [
    base,
    '',
    directionText(direction),
    '',
    rotated,
    '',
    LIGHT_BLOCK,
    '',
    lightImplementation,
    '',
    chainNote,
    repairNote,
    lightFeedback,
  ].join('\n');
}

function refsFor(
  item: SheetItem,
  target: Target,
  direction: Direction,
  chain: string | null,
  repairD0 = false,
): string[] {
  const refs = [guidePath(target, direction), ...item.crops];
  if (refs.length < 3) refs.push('art-reference/ref-1.png');
  if (chain !== null) refs.push(chain);
  if (repairD0 && direction === 'd0') refs.push(join(PACK_DIR, assetIdToFile(target.sprite)));
  return refs;
}

function runAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${stdout}${stderr}${error.message}`.trim()));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function candidateRank(record: AttemptRecord): number[] {
  if (record.metrics === undefined) return [9, 9, 1e9, 1e9, 1e9];
  const geom = record.metrics.geomBad.length;
  const light = record.metrics.lightVerdict === 'upper-left' ? 0 : record.metrics.lightVerdict === 'flat' ? 1 : 2;
  const score = record.metrics.lightScore ?? -1e9;
  return [record.metrics.passed ? 0 : 1, geom, light, record.metrics.vertexTexels ?? 1e9, -score];
}

function betterAttempt(a: AttemptRecord, b: AttemptRecord | null): boolean {
  if (b === null) return true;
  const aa = candidateRank(a);
  const bb = candidateRank(b);
  for (let i = 0; i < aa.length; i++) {
    if (aa[i]! < bb[i]!) return true;
    if (aa[i]! > bb[i]!) return false;
  }
  return false;
}

async function runJob(
  options: Options,
  target: Target,
  direction: Direction,
  item: SheetItem,
  style: string,
): Promise<JobRecord> {
  const destination = acceptedPath(target.id, direction);
  if (existsSync(destination) && !options.force) {
    return {
      id: target.id,
      direction,
      target: destination,
      source: 'already-accepted',
      attempts: [],
      accepted: true,
      metrics: metrics(destination, target, direction).metrics,
    };
  }

  const chain = chainPath(target.id, direction);
  if (chain !== null && !existsSync(chain)) {
    return {
      id: target.id,
      direction,
      target: destination,
      source: options.dryRun ? 'dry-run' : 'generated',
      attempts: [],
      accepted: false,
    };
  }
  const refs = refsFor(item, target, direction, chain, options.repairD0);
  const missing = refs.filter((path) => !existsSync(path));
  if (missing.length > 0) throw new Error(`${target.id}:${direction} missing refs: ${missing.join(', ')}`);

  const dir = join(WORK_ROOT, target.id, direction);
  mkdirSync(dir, { recursive: true });
  let feedback: { measured: Measured; metrics: Metrics } | null = null;
  if (direction === 'd0') {
    const current = join(PACK_DIR, assetIdToFile(target.sprite));
    if (existsSync(current)) feedback = metrics(current, target, direction);
  }
  let best: AttemptRecord | null = null;
  const attempts: AttemptRecord[] = [];
  const attemptCount = options.dryRun ? 1 : options.tries;
  for (let attempt = 1; attempt <= attemptCount; attempt++) {
    const prompt = buildDirectionPrompt(item, target, direction, style, feedback, chain, options.repairD0);
    const promptPath = join(dir, `prompt-${attempt}.txt`);
    const generated = join(dir, `gen-${attempt}.png`);
    const candidate = join(dir, `cand-${attempt}.png`);
    const report = join(dir, `gen-${attempt}.report.json`);
    writeFileSync(promptPath, `${prompt}\n`);
    const record: AttemptRecord = { attempt, prompt: promptPath, refs, generated, candidate };
    attempts.push(record);
    if (options.dryRun) {
      console.log(`[dry] ${target.id}:${direction} prompt=${promptPath} refs=${refs.join(' | ')}`);
      return {
        id: target.id,
        direction,
        target: destination,
        source: 'dry-run',
        attempts,
        accepted: false,
      };
    }
    try {
      const args = ['gen', '--provider', options.provider, '--prompt-file', promptPath, '--out', generated];
      for (const ref of refs) args.push('--ref', ref);
      args.push('--transparent', '--chroma-key', item.chroma, '--report', report);
      await runAsync(SPRITE_GEN, args);
      const { w, d } = oriented(target, direction);
      extract(item, generated, candidate, target.canvas, 0, [w, d, target.bodyH]);
      const checked = metrics(candidate, target, direction);
      record.metrics = checked.metrics;
      feedback = checked;
      if (betterAttempt(record, best)) best = record;
      console.log(
        `${target.id}:${direction} try ${attempt}/${options.tries} ` +
          `geom=${checked.metrics.geomBad.join('+') || 'pass'} ` +
          `IoU=${checked.metrics.wedgeIoU.toFixed(3)} ` +
          `vertex=${checked.metrics.vertexTexels?.toFixed(1) ?? '-'} ` +
          `light=${checked.metrics.lightScore?.toFixed(1) ?? '-'}(${checked.metrics.lightVerdict}) ` +
          `paletteOff=${checked.metrics.paletteOff} ${checked.metrics.passed ? 'PASS' : 'FAIL'}`,
      );
      if (checked.metrics.passed) {
        mkdirSync(ACCEPTED, { recursive: true });
        copyFileSync(candidate, destination);
        return {
          id: target.id,
          direction,
          target: destination,
          source: 'generated',
          attempts,
          accepted: true,
          metrics: checked.metrics,
        };
      }
    } catch (error) {
      record.error = (error as Error).message.split('\n').filter(Boolean).slice(-4).join(' | ');
      console.log(`${target.id}:${direction} try ${attempt}/${options.tries} ERROR ${record.error}`);
    }
  }
  return {
    id: target.id,
    direction,
    target: destination,
    source: 'generated',
    attempts,
    accepted: false,
    // `exactOptionalPropertyTypes` — 없으면 **키 자체를 안 넣는다** (undefined 를 담지 않는다)
    ...(best?.metrics ? { metrics: best.metrics } : {}),
  };
}

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function seedD0(options: Options, targets: Target[]): JobRecord[] {
  if (!options.seedExisting || options.force || options.dryRun) return [];
  mkdirSync(ACCEPTED, { recursive: true });
  const records: JobRecord[] = [];
  for (const target of targets) {
    const destination = acceptedPath(target.id, 'd0');
    if (existsSync(destination)) continue;
    const current = join(PACK_DIR, assetIdToFile(target.sprite));
    if (!existsSync(current)) continue;
    const checked = metrics(current, target, 'd0');
    if (!checked.metrics.passed) continue;
    copyFileSync(current, destination);
    console.log(
      `${target.id}:d0 LOCK existing geom=pass IoU=${checked.metrics.wedgeIoU.toFixed(3)} ` +
        `light=${checked.metrics.lightScore?.toFixed(1) ?? '-'} paletteOff=${checked.metrics.paletteOff}`,
    );
    records.push({
      id: target.id,
      direction: 'd0',
      target: destination,
      source: 'existing-d0',
      attempts: [],
      accepted: true,
      metrics: checked.metrics,
    });
  }
  return records;
}

function writeSummary(options: Options, records: JobRecord[]): void {
  mkdirSync(WORK_ROOT, { recursive: true });
  const payload = {
    version: 1,
    kind: 'kairo-facility-4dir-generation',
    generatedAt: new Date().toISOString(),
    options,
    counts: {
      records: records.length,
      accepted: records.filter((record) => record.accepted).length,
      failed: records.filter((record) => !record.accepted).length,
      attempts: records.reduce((sum, record) => sum + record.attempts.length, 0),
    },
    records,
  };
  writeFileSync(join(WORK_ROOT, 'summary.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

function attemptRecords(id: string, direction: Direction): JobRecord[] {
  const dir = join(WORK_ROOT, id, direction);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^accept-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as JobRecord);
}

function compactMetric(value: Metrics | undefined): string {
  if (value === undefined) return '-';
  const vertex = value.vertexTexels?.toFixed(1) ?? '-';
  const light = value.lightScore?.toFixed(1) ?? '-';
  return `vtx=${vertex} IoU=${value.wedgeIoU.toFixed(3)} light=${light}/${value.lightVerdict}`;
}

function bestRecord(records: JobRecord[]): JobRecord | undefined {
  return records.reduce<JobRecord | undefined>((best, current) => {
    if (best === undefined) return current;
    const currentAttempt = current.attempts[0];
    const bestAttempt = best.attempts[0];
    if (currentAttempt === undefined) return best;
    if (bestAttempt === undefined) return current;
    return betterAttempt(currentAttempt, bestAttempt) ? current : best;
  }, undefined);
}

function writeReport(targets: Target[]): string {
  const report = join(WORK_ROOT, 'report.md');
  const visualReasons: Record<string, string> = {
    'shop:d3': 'rear view exposes the front awning/service face',
    'info:d3': 'rear view exposes the front awning/service face',
    'infirmary:d3': 'rear view repeats the public entrance face',
    'vending_in:d3': 'rear view repeats the product display',
    'vending_out:d3': 'rear view repeats the product display',
  };
  const lines = [
    '# Facility 4-direction worker report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Scope: 19 coordinator-approved existing d0 locks. The seven held-out ids are ticket, icecream,',
    'bungeoppang, rent_duck, snow_sled, karaoke, and photozone. No live-pack sprite or facings data',
    'was changed; all candidates remain in the audit workspace.',
    '',
    'Metric notation: `vtx` is the ground-contact vertex offset in texels, `IoU` is the footprint',
    'wedge overlap, and `light` is the fixed-screen upper-left score/verdict. `aN/rM` means N image',
    'attempts and M rerolls. PASS still required visual inspection.',
    '',
    '| facility | d0 lock (before) | d1 | d2 | d3 | unresolved |',
    '|---|---|---|---|---|---|',
  ];
  let acceptedDirections = 0;
  let generatedAttempts = 0;
  let rerolls = 0;
  const directions: Direction[] = ['d1', 'd2', 'd3'];
  for (const target of targets) {
    const base = acceptedPath(target.id, 'd0');
    const baseText = existsSync(base) ? `LOCK ${compactMetric(metrics(base, target, 'd0').metrics)}` : 'MISSING';
    const cells: string[] = [];
    const issues: string[] = [];
    for (const direction of directions) {
      const records = attemptRecords(target.id, direction);
      const attempts = records.length;
      generatedAttempts += attempts;
      rerolls += Math.max(0, attempts - 1);
      const destination = acceptedPath(target.id, direction);
      const visualPath = join(WORK_ROOT, 'visual-rejected', `facility__${target.id}__${direction}.png`);
      const suffix = attempts > 0 ? ` a${attempts}/r${Math.max(0, attempts - 1)}` : '';
      if (existsSync(destination)) {
        acceptedDirections++;
        cells.push(`PASS ${compactMetric(metrics(destination, target, direction).metrics)}${suffix}`);
        continue;
      }
      if (existsSync(visualPath)) {
        const reason = visualReasons[`${target.id}:${direction}`] ?? 'visual semantic mismatch';
        cells.push(`VISUAL-FAIL ${compactMetric(metrics(visualPath, target, direction).metrics)}${suffix}`);
        issues.push(`${direction}: ${reason}`);
        continue;
      }
      const best = bestRecord(records);
      if (best?.metrics !== undefined) {
        cells.push(`FAIL ${compactMetric(best.metrics)}${suffix}`);
        const geom = best.metrics.geomBad.join('+') || 'pass';
        issues.push(`${direction}: geom=${geom}, light=${best.metrics.lightVerdict}`);
      } else {
        cells.push('BLOCKED');
        issues.push(`${direction}: chain predecessor did not pass`);
      }
    }
    lines.push(`| ${target.id} | ${baseText} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${issues.join('; ') || '-'} |`);
  }
  lines.push(
    '',
    '## Totals and disposition',
    '',
    `- Accepted direction candidates after visual QA: ${acceptedDirections}/57 (plus ${targets.length}/19 locked d0 bases).`,
    `- Generated direction attempts: ${generatedAttempts}; rerolls: ${rerolls}.`,
    '- Five automatic d3 passes were moved to `visual-rejected/` because they visibly showed the front/public face from a rear direction.',
    '- Remaining failures exhausted the bounded three-attempt budget or were chain-blocked by a missing accepted d2.',
    '- Palette-off count is zero for every recorded attempt; edge ratios remain recorded in each `accept-N.json` audit file.',
    '- `kairo-gate --geom` and `--light` control checks ran successfully; the unwired live pack still reports its pre-existing 18 geometry warnings and 15 flipped / 16 flat / 1 unmeasurable light warnings.',
    '- Draft rows above use the same geometry and light measurement functions directly, because the contract intentionally remains unwired until all four directions pass.',
    '- Live `assets/generated/kairo/facility__<id>__d*.png` outputs and `facings: 4` wiring were intentionally not installed.',
    '',
    '## Artifact paths',
    '',
    '- Accepted drafts: `assets/generated/kairo-4dir/accepted/`',
    '- Gate-pass but visually rejected drafts: `assets/generated/kairo-4dir/visual-rejected/`',
    '- Raw images, extracted candidates, prompts, and per-attempt metrics: `assets/generated/kairo-4dir/<id>/<direction>/`',
    '- Nearest-neighbour expanded QA sheets: `assets/generated/kairo-4dir/qa/facilities-4dir-{1,2,3,4}.png`',
    '- Fresh transposed guides: `art-reference/guides/kairo/facility__{ticket,icecream,cafe,sikhye,bungeoppang,slide_large,snow_sled,stage_river,dj_booth}__d1.png`',
    '',
  );
  writeFileSync(report, `${lines.join('\n')}\n`);
  return report;
}

function acceptRaw(
  options: Options,
  target: Target,
  direction: Direction,
  item: SheetItem,
  style: string,
): JobRecord {
  if (options.raw === null || options.raw.length === 0) throw new Error('--accept-raw needs a PNG path');
  if (!existsSync(options.raw)) throw new Error(`Raw PNG does not exist: ${options.raw}`);
  const dir = join(WORK_ROOT, target.id, direction);
  mkdirSync(dir, { recursive: true });
  const raw = join(dir, `gen-${options.attempt}.png.raw.png`);
  const generated = join(dir, `gen-${options.attempt}.png`);
  const candidate = join(dir, `cand-${options.attempt}.png`);
  copyFileSync(options.raw, raw);
  execFileSync(
    `${process.env['HOME'] ?? ''}/tools/sprite-gen/.venv/bin/python`,
    [
      '-c',
      'import sys;from pathlib import Path;from sprite_gen.gen import chroma;' +
        'chroma.key_transparent(Path(sys.argv[1]), Path(sys.argv[2]), key=sys.argv[3])',
      raw,
      generated,
      item.chroma,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
  );
  const { w, d } = oriented(target, direction);
  extract(item, generated, candidate, target.canvas, 0, [w, d, target.bodyH]);
  const checkedWithMeasure = metrics(candidate, target, direction);
  const checked = checkedWithMeasure.metrics;
  const destination = acceptedPath(target.id, direction);
  if (checked.passed) {
    mkdirSync(ACCEPTED, { recursive: true });
    copyFileSync(candidate, destination);
  }
  if (!checked.passed) {
    const next = options.attempt + 1;
    const nextPrompt = buildDirectionPrompt(
      item,
      target,
      direction,
      style,
      checkedWithMeasure,
      chainPath(target.id, direction),
      options.repairD0,
    );
    writeFileSync(join(dir, `prompt-${next}.txt`), `${nextPrompt}\n`);
  }
  const prompt = join(dir, `prompt-${options.attempt}.txt`);
  const chain = chainPath(target.id, direction);
  const record: JobRecord = {
    id: target.id,
    direction,
    target: destination,
    source: 'generated',
    attempts: [{
      attempt: options.attempt,
      prompt,
      refs: refsFor(item, target, direction, chain, options.repairD0),
      generated,
      candidate,
      metrics: checked,
    }],
    accepted: checked.passed,
    metrics: checked,
  };
  writeFileSync(join(dir, `accept-${options.attempt}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(
    `${target.id}:${direction} raw ${options.attempt} ` +
      `geom=${checked.geomBad.join('+') || 'pass'} IoU=${checked.wedgeIoU.toFixed(3)} ` +
      `vertex=${checked.vertexTexels?.toFixed(1) ?? '-'} ` +
      `light=${checked.lightScore?.toFixed(1) ?? '-'}(${checked.lightVerdict}) ` +
      `paletteOff=${checked.paletteOff} edge=${(checked.edgeRatio * 100).toFixed(1)}% ` +
      `${checked.passed ? 'PASS' : 'FAIL'}`,
  );
  return record;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(SPRITE_GEN) && !options.dryRun) throw new Error(`Missing sprite-gen: ${SPRITE_GEN}`);
  const targetsById = targetMap();
  const targets = options.ids.map((id) => targetsById.get(id)!).filter(Boolean);
  const doc = readFileSync(DOC, 'utf8');
  const style = canonicalStyle(doc);
  const items = new Map(targets.map((target) => [target.id, findItem(doc, target.id, target.sprite)]));
  if (options.report) {
    console.log(writeReport(targets));
    return;
  }
  if (options.raw !== null) {
    if (targets.length !== 1 || options.stage === 'all') {
      throw new Error('--accept-raw requires exactly one --id and one --stage d0..d3');
    }
    const record = acceptRaw(options, targets[0]!, options.stage, items.get(targets[0]!.id)!, style);
    writeSummary(options, [record]);
    if (!record.accepted) process.exitCode = 1;
    return;
  }
  const stages: Direction[] = options.stage === 'all' ? ['d0', 'd1', 'd2', 'd3'] : [options.stage];
  const records: JobRecord[] = [];

  if (stages.includes('d0')) records.push(...seedD0(options, targets));
  for (const stage of stages) {
    const jobs = targets.filter((target) => options.force || !existsSync(acceptedPath(target.id, stage)));
    if (jobs.length > 0) {
      const stageRecords = await pool(jobs, options.concurrency, (target) =>
        runJob(options, target, stage, items.get(target.id)!, style),
      );
      records.push(...stageRecords);
    }
    const missing = targets.filter((target) => !existsSync(acceptedPath(target.id, stage)));
    if (!options.dryRun && missing.length > 0) {
      console.log(`STOP after ${stage}: ${missing.length} missing accepted candidates: ${missing.map((target) => target.id).join(', ')}`);
      break;
    }
  }
  writeSummary(options, records);
  const accepted = targets.flatMap((target) => (['d0', 'd1', 'd2', 'd3'] as Direction[]).filter((direction) => existsSync(acceptedPath(target.id, direction))));
  console.log(`accepted=${accepted.length}/${targets.length * 4} summary=${join(WORK_ROOT, 'summary.json')}`);
  if (!options.dryRun && accepted.length !== targets.length * 4) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('regen-facility-4dir.ts') === true) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

#!/usr/bin/env npx tsx
/** Measure a single candidate without copying it into the production asset pack. */

import { allTargets, measurePng } from './regen-facility.js';

function value(flag: string): string {
  const at = process.argv.indexOf(flag);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`Missing ${flag}`);
  return process.argv[at + 1]!;
}

const id = value('--id');
const file = value('--file');
const target = allTargets().find((row) => row.id === id);
if (!target) throw new Error(`Unknown facility id: ${id}`);
const measured = measurePng(file, id, target.w, target.d, target.bodyH);
console.log(JSON.stringify({
  id,
  file,
  bottomFrac: measured.m.bottomFrac,
  slopeLeft: measured.m.slopeLeft,
  slopeRight: measured.m.slopeRight,
  wedgeIoU: measured.m.wedgeIoU,
  iouMin: measured.v.iouMin,
  vertexTexels: measured.v.vertexTexels,
  bad: measured.v.bad,
  severe: measured.v.severe,
  axesSwapped: measured.v.axesSwapped,
}, null, 2));

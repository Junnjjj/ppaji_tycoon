import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { legacyHeightBookmarks } from './height-live.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { Rng } from '../sim/rng.js';

it('finds existing terrain without changing a single level or ground tile', () => {
  const terrain=KairoTerrain.generate(96,72,new Rng(20260818));
  const before=terrain.toSnapshot(), gate=KairoTerrain.parkGate();
  const marks=legacyHeightBookmarks({terrain,gate});
  expect(marks[0]).toEqual({name:'기존 공원',...gate});
  expect(marks.length).toBeGreaterThan(1);
  expect(terrain.toSnapshot()).toEqual(before);
});
it('the review contains no terrain, placement or guest-seeding mutations',()=>{
  const source=readFileSync(new URL('./height-live.ts',import.meta.url),'utf8');
  expect(source).not.toMatch(/\.setLevel\(|\.paint\(|\.place\(|\.spawn\(|\.setGradeForTest\(/);
});

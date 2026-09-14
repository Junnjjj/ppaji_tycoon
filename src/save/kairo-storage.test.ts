import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import legacy from './__fixtures__/main-85019e1.json';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { KAIRO_SAVE_KEY, KairoStorageReadError, clearKairoStorage, loadKairoFromStorage,
  restoreKairo, type KairoRestored, saveKairoToStorage } from './kairo.js';

function writable(w: KairoRestored) {
  const { seed, gate, terrain, walls, placement, progress, week, weekRngState, season, lastSummary } = w;
  return { seed, gate, terrain, walls, placement, progress, week, weekRngState, season, lastSummary };
}
let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  clearKairoStorage();
});
afterEach(() => vi.unstubAllGlobals());

it('distinguishes a missing save from malformed data and blocks later writes after failure', () => {
  expect(loadKairoFromStorage()).toBeNull();
  const raw = '{invalid save';
  data.set(KAIRO_SAVE_KEY, raw);
  expect(() => loadKairoFromStorage()).toThrow(KairoStorageReadError);
  saveKairoToStorage(writable(restoreKairo(legacy)));
  expect(data.get(KAIRO_SAVE_KEY)).toBe(raw);
});

it('preserves a crowded old 3x3 facility save when its new 4x4 footprint cannot fit', () => {
  const source = structuredClone(legacy);
  const terrain = new KairoTerrain(96, 72);
  for (let j=8;j<24;j++) for (let i=35;i<61;i++) terrain.paint(i,j,'path_stone');
  for (let j=11;j<14;j++) for (let i=44;i<47;i++) terrain.paint(i,j,'floor_indoor');
  const items = [{handle:1,defId:'jjimjilbang',i:44,j:11}];
  // Keep only a three-tile-wide access corridor around the former 3x3 facility.
  for (let j=0;j<72;j++) for (let i=0;i<96;i++) if (i<44 || i>46)
    items.push({handle:items.length+1,defId:'vending_out',i,j});
  const raw = JSON.stringify({ ...source, terrain: terrain.toSnapshot(), placement: {
    w:96,h:72,next:items.length+1,items,
  } });
  data.set(KAIRO_SAVE_KEY, raw);
  try {
    loadKairoFromStorage();
    expect.fail('must stop before starting a new game');
  } catch (e) {
    expect(e).toBeInstanceOf(KairoStorageReadError);
    expect((e as KairoStorageReadError).raw).toBe(raw);
    expect((e as Error).message).toContain('jjimjilbang');
  }
  saveKairoToStorage(writable(restoreKairo(legacy)));
  expect(data.get(KAIRO_SAVE_KEY)).toBe(raw);
});

it('does not start an empty game if storage itself cannot be read', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
  expect(() => loadKairoFromStorage()).toThrow(KairoStorageReadError);
});

it('resumes saving after a successful retry or an explicit new-game clear', () => {
  data.set(KAIRO_SAVE_KEY, 'broken');
  expect(() => loadKairoFromStorage()).toThrow();
  data.set(KAIRO_SAVE_KEY, JSON.stringify(legacy));
  const restored = loadKairoFromStorage()!;
  saveKairoToStorage(writable(restored), 123);
  expect(JSON.parse(data.get(KAIRO_SAVE_KEY)!).savedAtMs).toBe(123);
  data.set(KAIRO_SAVE_KEY, 'broken');
  expect(() => loadKairoFromStorage()).toThrow();
  clearKairoStorage();
  saveKairoToStorage(writable(restored), 456);
  expect(JSON.parse(data.get(KAIRO_SAVE_KEY)!).savedAtMs).toBe(456);
});

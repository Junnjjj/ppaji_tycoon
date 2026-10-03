import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { composeNpcSource, npcSourceFrame, npcSourceKeyWithLook, NpcSourceProvider, npcSourceMetadata } from './npc-source.js';
import manifest from '../../assets/npc-source/manifest.json';
import types from '../../assets/npc-source/types.json';
import presentation from '../data/npc-presentation.json';
import display from '../../assets/npc-source/display-spec.json';

const cells = new Map<string, Map<string, Uint8ClampedArray>>();
for (const [p, meta] of Object.entries(manifest.rgbaSources)) {
  const data = gunzipSync(readFileSync(new URL('../../assets/npc-source/' + meta.file + '.bin', import.meta.url)));
  if (createHash('sha256').update(data).digest('hex') !== meta.sha256) throw Error('Integrity ' + p);
  const frames = new Map<string, Uint8ClampedArray>();
  for (const [state, d] of Object.entries(display)) d.frameRects.forEach((r, i) => {
    const out = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) out.set(data.subarray(((r.y+y)*meta.width+r.x)*4, ((r.y+y)*meta.width+r.x+64)*4), y*64*4);
    frames.set(`${state}/${i}`, out);
  });
  cells.set(p, frames);
}
const key = (look: string, state: string, i: number, mirror = 0) => `guest/v8/${look}/${state}/${mirror}/stand/${i}/calm`;
describe('NPC source contract', () => {
  it('matches all 9720 approved composition hashes and protected pixels', () => {
    const qa = JSON.parse(gunzipSync(readFileSync(new URL('./__fixtures__/npc-composition-qa.json.gz', import.meta.url))).toString('utf8'));
    let count = 0;
    for (const f of qa.frameHashes) {
      const rgba = composeNpcSource(cells, f.state, f.i, f.a);
      expect(createHash('sha256').update(rgba).digest('hex')).toBe(f.sha256);
      const m = manifest as unknown as { parts: Record<string,string>; guardByOutfit: Record<string,string>; roleVariants: Record<string,Record<string,string>> };
      const cellKey = `${f.state}/${f.i}`;
      const guard = cells.get(m.parts[m.guardByOutfit[f.a.outfit]!]!)!.get(cellKey)!;
      const hair = cells.get(m.roleVariants['hair_'+f.a.hair]![f.a.hairColor]!)!.get(cellKey)!;
      const head = cells.get(m.parts.head_skin!)!.get(cellKey)!;
      for (let p = 0; p < rgba.length; p += 4) if (guard[p+3] && !(f.state.endsWith('_swim') && (hair[p+3] || head[p+3]))) {
        if (rgba[p] !== guard[p] || rgba[p+1] !== guard[p+1] || rgba[p+2] !== guard[p+2] || rgba[p+3] !== guard[p+3]) throw Error('Protected pixels');
      }
      count++;
    }
    expect(count).toBe(9720);
  }, 30000);
  it('preserves all 3240 default frame anchors and 22 state offsets', () => {
    const old = JSON.parse(readFileSync(new URL('./__fixtures__/npc-display-v8.json', import.meta.url), 'utf8'));
    expect(display).toEqual(old);
    const provider = new NpcSourceProvider(cells); let count = 0;
    expect(Object.keys(display)).toHaveLength(22);
    for (const t of types.presets) for (const [state, d] of Object.entries(display)) for (let i=0;i<d.frameRects.length;i++) for (let mirror=0;mirror<2;mirror++) {
      const spec = provider.spec(key(t.id,state,i,mirror))!;
      expect(spec).toMatchObject({w:160,h:160,density:4,ax:(mirror ? 40-d.root[0]! : d.root[0]!)*4,ay:d.root[1]!*4}); count++;
    }
    expect(count).toBe(3240); expect(npcSourceMetadata.defaultLooks).toHaveLength(54); expect(npcSourceMetadata.defaultLooks).toEqual(presentation.looks);
  });
  it('rejects invalid keys and appearance axes without aliasing guests', () => {
    const provider = new NpcSourceProvider(cells);
    for (const id of ['no',key('guest-99','front_idle',0),key('guest-01','constructor',0),key('guest-01','bogus',0),key('guest-01','front_idle',1),key('guest-01','front_idle',-1),key('guest-01','front_idle',0,2)]) {
      expect(npcSourceFrame(id)).toBeNull(); expect(provider.spec(id)).toBeNull(); expect(provider.canvas(id)).toBeNull();
    }
    const valid=key('guest-01','front_idle',0);
    expect(npcSourceKeyWithLook(valid,'guest-54')).toContain('guest-54');
    expect(npcSourceKeyWithLook(valid,'guest-99')).toBeNull();
    for(const field of ['body','hair','hairColor','outfit','outfitColor']) expect(()=>composeNpcSource(cells,'front_idle',0,{...types.presets[0]!,[field]:'bad'})).toThrow();
  });
});

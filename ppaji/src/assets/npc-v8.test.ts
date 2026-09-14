import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { npcV8Frame, npcV8Key, NpcV8Provider, type NpcAtlas } from './npc-v8.js';
import type { GuestPose } from './draw/guest.js';

const atlas = JSON.parse(readFileSync('public/assets/kairo-npc-v8/atlas.json', 'utf8')) as NpcAtlas;
describe('approved NPC V8 adapter', () => {
  it('ships the approved atlas and anchors byte for byte', () => {
    for (const file of ['atlas.png', 'atlas.json']) {
      expect(readFileSync(`public/assets/kairo-npc-v8/${file}`).equals(readFileSync(`../public/assets/kairo-npc-v8/${file}`))).toBe(true);
    }
    expect(readFileSync('src/data/npc-presentation.json').equals(readFileSync('../src/data/kairo-npc-presentation.json'))).toBe(true);
  });
  it('resolves every look, pose and direction to an existing authored frame', () => {
    const provider = new NpcV8Provider({} as HTMLImageElement, atlas);
    for (let uid = 1; uid <= 54; uid++) for (let facing = 0; facing < 4; facing++) {
      for (const pose of ['idle', 'walk', 'sit', 'swim', 'lie', 'ride'] as GuestPose[]) {
        for (const time of [0, 200, 400, 600, 800]) {
          const spec = provider.spec(npcV8Key(uid, facing, pose, time, 'calm'));
          expect(spec).toMatchObject({ w: 40, h: 40, source: 'art' });
          expect(spec!.ay).toBeGreaterThan(26);
          expect(spec!.ay).toBeLessThan(28);
        }
      }
    }
  });
  it('uses back art uphill, authored mirrors, and a real 5 fps walk cycle', () => {
    expect([0, 1, 2, 3].map(f => npcV8Frame(npcV8Key(1, f, 'walk', 0, 'happy'))!.frame)).toEqual([
      'guest-01/front_walk/0/0', 'guest-01/front_walk/1/0', 'guest-01/back_walk/1/0', 'guest-01/back_walk/0/0',
    ]);
    expect(npcV8Frame(npcV8Key(1, 0, 'walk', 199, 'calm'))!.frame).toContain('/0/0');
    expect(npcV8Frame(npcV8Key(1, 0, 'walk', 200, 'calm'))!.frame).toContain('/0/1');
    expect(npcV8Frame(npcV8Key(1, 0, 'walk', 800, 'calm'))!.frame).toContain('/0/0');
    const a = npcV8Frame(npcV8Key(1, 0, 'sit', 0, 'calm'))!;
    const b = npcV8Frame(npcV8Key(1, 1, 'sit', 0, 'calm'))!;
    expect(a.ax + b.ax).toBe(1);
    expect(a.ay).toBe(b.ay);
  });
  it('does not claim legacy or absent frames', () => {
    const provider = new NpcV8Provider({} as HTMLImageElement, atlas);
    expect(provider.spec('guest/body:3/walk/0/happy')).toBeNull();
    expect(provider.spec('guest/v8/guest-99/front_walk/0/walk/0/happy')).toBeNull();
  });
});

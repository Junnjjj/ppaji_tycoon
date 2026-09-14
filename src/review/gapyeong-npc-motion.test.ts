import { expect, it } from 'vitest';
import { npcWalkFacing, npcWalkDepth } from './gapyeong-npc-motion.js';
import { depthKey, Z_GUEST } from '../render/kairo/iso.js';

it('selects authored front/back and mirroring for all four grid directions', () => {
  expect(npcWalkFacing(1, 0)).toEqual({ direction: 'front', mirror: false });
  expect(npcWalkFacing(0, 1)).toEqual({ direction: 'front', mirror: true });
  expect(npcWalkFacing(-1, 0)).toEqual({ direction: 'back', mirror: true });
  expect(npcWalkFacing(0, -1)).toEqual({ direction: 'back', mirror: false });
});
it('keeps the walking person above both supporting tiles in either direction', () => {
  for (const t of [0.01, 0.25, 0.5, 0.75, 0.99]) {
    expect(npcWalkDepth(30, 19 + t)).toBe(depthKey(30, 20) + Z_GUEST);
    expect(npcWalkDepth(30 + t, 19)).toBe(depthKey(31, 19) + Z_GUEST);
  }
  expect(npcWalkDepth(30, 20)).toBe(depthKey(30, 20) + Z_GUEST);
  // A facility on the next foreground row remains in front of the guest.
  expect(npcWalkDepth(30, 19.5)).toBeLessThan(depthKey(30, 21));
});

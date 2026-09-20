import { expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { WaterparkScene, type SceneDeps } from './scene.js';
import type { Guest } from '../sim/guest.js';
import { facilityPortal } from '../sim/facility-portal.js';
import type { PlacedFacility } from '../sim/facility.js';

it('inside actors hide existing sprites, emotes, HP, friend gauge, speech and hit targets together', () => {
  const scene = new WaterparkScene({} as SceneDeps);
  const portal = facilityPortal({ defId: 'cafe', i: 8, j: 8, facing: 0 } as PlacedFacility)!;
  const g = { uid: 7, state: 'use', i: portal.entry.i, j: portal.entry.j, hp: 1, friendId: 'friend', emote: 'heart', emoteTtl: 10, portal: { ...portal, uid: 3, phase: 'inside', progress: 1 } } as Guest;
  type Image = { destroy: ReturnType<typeof vi.fn>; setVisible: ReturnType<typeof vi.fn> };
  const internal = scene as unknown as { guestsRef: Guest[]; emoteImgs: Map<number, Image>; hpImgs: Map<number, Image>; gaugeImgs: Map<number, Image>; guestImgs: Map<number, Image>; syncGuests(): void };
  internal.guestsRef = [g];
  const actor = { destroy: vi.fn(), setVisible: vi.fn() }; internal.guestImgs.set(g.uid, actor);
  const icons = [internal.emoteImgs, internal.hpImgs, internal.gaugeImgs].map(map => { const img = { destroy: vi.fn(), setVisible: vi.fn() }; map.set(g.uid, img); return img; });
  internal.syncGuests();
  expect(actor.setVisible).toHaveBeenCalledWith(false); expect(actor.destroy).not.toHaveBeenCalled();
  for (const icon of icons) expect(icon.destroy).toHaveBeenCalledOnce();
  expect(scene.guestScreen(g.uid)).toBeNull(); expect(scene.guestAt(g.i, g.j)).toBeNull();
  expect(internal.emoteImgs.size + internal.hpImgs.size + internal.gaugeImgs.size).toBe(0);
});

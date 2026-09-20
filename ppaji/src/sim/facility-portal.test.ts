import { describe, expect, it } from 'vitest';
import balance from '../data/balance.json';
import facilities from '../data/facilities.json';
import type { FacilityDef } from '../data/schema.js';
import { Grid, FLOOR } from './grid.js';
import { PoolStore } from './pool.js';
import { FacilityStore, capacityOf } from './facility.js';
import { GuestStore, type Guest, type GuestHooks } from './guest.js';
import { Rng } from './rng.js';
import { facilityPortal, portalHidden, portalPosition } from './facility-portal.js';
import { TICK_SCALE } from './clock.js';

const ids = ['cafe', 'cafe_lv2', 'cafe_lv3', 'pension_1f', 'pension_2f', 'pension'];
function setup(id = 'cafe', facing: 0 | 1 = 0, level = 1) {
  const grid = new Grid(24, 24); grid.floor.fill(FLOOR.path);
  const defs = new Map((facilities as unknown as FacilityDef[]).map(d => [d.id, { ...d, useTicks: 100 }]));
  const fs = new FacilityStore(grid, defs), f = fs.place(id, 8, 8, facing); f.level = level;
  const pools = new PoolStore(grid), rng = new Rng(31);
  const guests = new GuestStore(grid, pools, fs, { i: 2, j: 2 }, rng, { ...balance, walkTicksPerTile: 4, wanderTicks: 10000 });
  const portal = facilityPortal(f)!;
  const spawn = (at = portal.entry): Guest => {
    const g = guests.spawn(); Object.assign(g, { i: at.i, j: at.j, fromI: at.i, fromJ: at.j, progress: 1, state: 'walk', target: { kind: 'facility', uid: f.uid } }); return g;
  };
  const until = (pred: () => boolean, hooks?: GuestHooks, max = 600) => {
    for (let n = 0; n < max && !pred(); n++) guests.step(hooks);
    expect(pred()).toBe(true);
  };
  return { grid, fs, f, guests, portal, spawn, until, pools, rng };
}

describe('authored portal GuestStore integration', () => {
  for (const id of ids) for (const facing of [0, 1] as const) {
    it(`${id}/${facing}: walks to transformed front, hides inside, emerges at identical threshold`, () => {
      const h = setup(id, facing), g = h.spawn({ i: 5, j: 5 });
      const pension = id.startsWith('pension'), w = pension ? 5 : 3, d = pension ? 4 : 2;
      const x = pension ? 0 : -.9, y = pension ? -1.825 : -.9;
      expect(h.portal.threshold).toEqual({ i: 8 + (facing ? d / 2 - y : w / 2 + x), j: 8 + (facing ? w / 2 - x : d / 2 - y), z: pension ? .22 : id === 'cafe' ? .1 : .15 });
      expect(h.portal.entry).toEqual(facing ? { i: 8 + d, j: Math.floor(8 + w / 2 - x) } : { i: Math.floor(8 + w / 2 + x), j: 8 + d });
      let charged = 0; const hooks = { onFacilityUse: () => { charged++; } };
      h.until(() => !!g.portal, hooks);
      expect(g.portal?.phase).toBe('entering'); expect(portalHidden(g)).toBe(false);
      expect(h.guests.busyCount(h.f)).toBe(1);
      expect({ i: g.i, j: g.j }).toEqual(h.portal.entry);
      h.until(() => portalHidden(g), hooks);
      expect(portalPosition(g.portal!)).toEqual(h.portal.threshold);
      expect(h.guests.walkable(g.i, g.j)).toBe(true);
      expect(charged).toBe(0);
      g.stateTicks = 100 * TICK_SCALE; h.guests.step(hooks);
      expect(g.portal?.phase).toBe('exiting'); expect(portalHidden(g)).toBe(false);
      expect(portalPosition(g.portal!)).toEqual(h.portal.threshold); expect(charged).toBe(1);
      h.until(() => !g.portal, hooks);
      expect({ i: g.i, j: g.j }).toEqual(h.portal.entry);
      expect(g.state).toBe('wander'); expect(charged).toBe(1); expect(h.f.usesToday).toBe(1);
    });
  }

  it.each([['cafe', 1], ['cafe', 5], ['pension', 1], ['pension', 5]] as const)('%s level %s: live capacity includes entry reservations and allows only one traverser', (id, level) => {
    const h = setup(id, 0, level), cap = capacityOf(h.fs.defOf(h.f), h.f);
    const admitted: Guest[] = [];
    for (let n = 0; n < cap; n++) {
      const g = h.spawn(); admitted.push(g); h.until(() => portalHidden(g));
      expect(h.guests.busyCount(h.f)).toBe(n + 1);
    }
    const extra = h.spawn(); h.guests.step(); expect(extra.state).toBe('queue');
    h.f.level = 1; h.fs.bump(); h.guests.step();
    expect(admitted.every(portalHidden)).toBe(true); expect(extra.portal).toBeUndefined();
    admitted[0]!.stateTicks = 100 * TICK_SCALE; h.guests.step();
    expect(admitted[0]!.portal?.phase).toBe('exiting');
    expect(extra.portal).toBeUndefined();
  });

  it('simultaneous arrival reserves before hiding and serializes traversal', () => {
    const h = setup(), a = h.spawn(), b = h.spawn();
    h.guests.step(); expect(a.portal?.phase).toBe('entering'); expect(b.state).toBe('queue');
    expect(h.guests.busyCount(h.f)).toBe(1);
    h.until(() => b.portal?.phase === 'entering');
    expect(a.portal?.phase).toBe('inside'); expect(h.guests.busyCount(h.f)).toBe(2);
  });

  it.each([0, 1] as const)('blocked front at facing %s cannot admit from another wall or unreachable component', facing => {
    const h = setup('cafe', facing); h.grid.set(h.portal.entry.i, h.portal.entry.j, FLOOR.pool);
    const g = h.spawn({ i: 7, j: 8 }); h.guests.step();
    expect(h.fs.entryTiles(h.f, h.guests.walkable)).toEqual([]);
    expect(g.state).toBe('wander'); expect(g.portal).toBeUndefined(); expect(g.uses).toBe(0);
    h.grid.set(h.portal.entry.i, h.portal.entry.j, FLOOR.path); h.guests.invalidate();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) h.grid.set(3 + di!, 3 + dj!, FLOOR.pool);
    const trapped = h.spawn({ i: 3, j: 3 }); h.guests.step();
    expect(trapped.portal).toBeUndefined(); expect(trapped.state).toBe('wander');
  });

  it.each(['entering', 'inside', 'exiting'] as const)('JSON reload of %s resumes the same visit without double charges', phase => {
    const h = setup('pension'), g = h.spawn(); let uses = 0;
    const hooks = { onFacilityUse: () => { uses++; } };
    h.until(() => g.portal?.phase === (phase === 'exiting' ? 'inside' : phase), hooks);
    if (phase === 'exiting') { g.stateTicks = 100 * TICK_SCALE; h.guests.step(hooks); }
    const snapshot = JSON.parse(JSON.stringify(h.guests.toSnapshot()));
    const restored = new GuestStore(h.grid, h.pools, h.fs, { i: 2, j: 2 }, new Rng(31), { ...balance, walkTicksPerTile: 4, wanderTicks: 10000 });
    restored.fromSnapshot(snapshot); const r = restored.all[0]!;
    expect(r.portal).toEqual(g.portal);
    for (let n = 0; n < 200 && r.portal; n++) { if (r.portal.phase === 'inside') r.stateTicks = 100 * TICK_SCALE; restored.step(hooks); }
    expect(r.portal).toBeUndefined(); expect(uses).toBe(1); expect(r.uses).toBe(1);
  });

  it('legacy pension origin use restores safely, and deletion releases occupancy without a phantom charge', () => {
    const h = setup('pension'), g = h.spawn(); Object.assign(g, { state: 'use', i: h.f.i, j: h.f.j });
    h.guests.fromSnapshot(JSON.parse(JSON.stringify(h.guests.toSnapshot())));
    const restored = h.guests.all[0]!; h.guests.step();
    expect(portalHidden(restored)).toBe(true); expect({ i: restored.i, j: restored.j }).toEqual(h.portal.entry);
    h.fs.remove(h.f.uid); h.guests.step();
    expect(restored.portal).toBeUndefined(); expect(restored.state).toBe('wander'); expect(h.guests.walkable(restored.i, restored.j)).toBe(true); expect(restored.uses).toBe(0);
  });

  it.each(['entering', 'inside', 'exiting'] as const)('closing the exterior path during %s releases actor safely', phase => {
    const h = setup(), g = h.spawn(); h.until(() => g.portal?.phase === (phase === 'exiting' ? 'inside' : phase));
    if (phase === 'exiting') { g.stateTicks = 100 * TICK_SCALE; h.guests.step(); }
    h.grid.set(h.portal.entry.i, h.portal.entry.j, FLOOR.pool); h.guests.step();
    expect(g.portal).toBeUndefined(); expect(h.guests.walkable(g.i, g.j)).toBe(true); expect(h.guests.busyCount(h.f)).toBe(0);
  });

  it('overnight wake-up uses the same door exit, without an extra use charge', () => {
    const h = setup('pension'), g = h.spawn(); h.until(() => portalHidden(g));
    g.stays = true; g.seatUid = h.f.uid;
    h.guests.wakeUp(); h.guests.step(); expect(g.portal?.phase).toBe('exiting'); expect(portalPosition(g.portal!)).toEqual(h.portal.threshold);
    h.until(() => !g.portal); expect(g.uses).toBe(0); expect(g.slept).toBe(true);
  });
  it('a queued guest is rescued when the door tile is closed', () => {
    const h = setup(), a = h.spawn(), b = h.spawn(); h.guests.step();
    expect(a.portal?.phase).toBe('entering'); expect(b.state).toBe('queue');
    h.grid.set(h.portal.entry.i, h.portal.entry.j, FLOOR.pool); h.guests.step();
    expect(h.guests.walkable(b.i, b.j)).toBe(true); expect(b.state).toBe('wander');
  });

  it('a blocked doorway edge is not a valid entry even when the exterior tile is walkable', () => {
    const h = setup(); h.grid.levels[(h.portal.entry.j - 1) * h.grid.w + h.portal.entry.i] = 3;
    expect(h.guests.walkable(h.portal.entry.i, h.portal.entry.j)).toBe(true);
    expect(h.fs.entryTiles(h.f, h.guests.walkable)).toEqual([]);
    const g = h.spawn(); h.guests.step(); expect(g.portal).toBeUndefined();
  });

  it('snapshot is detached from mutable visit progress and path', () => {
    const h = setup(), g = h.spawn(); h.guests.step();
    const snapshot = h.guests.toSnapshot(), saved = JSON.stringify(snapshot);
    h.guests.step(); g.portal!.path[0]!.z = 99;
    expect(JSON.stringify(snapshot)).toBe(saved);
  });

  it('simultaneous overnight wake-up preserves one active doorway traverser', () => {
    const h = setup('pension'), a = h.spawn(); h.until(() => portalHidden(a));
    const b = h.spawn(); h.until(() => portalHidden(b));
    for (const g of [a, b]) { g.stays = true; g.seatUid = h.f.uid; }
    h.guests.wakeUp(); h.guests.step();
    expect(a.portal?.phase).toBe('exiting'); expect(b.portal?.phase).toBe('inside');
    h.until(() => !a.portal && !b.portal); expect(a.uses + b.uses).toBe(0);
  });

  it('moving or rotating the facility releases its old doorway reservation', () => {
    const h = setup(), g = h.spawn(); h.until(() => portalHidden(g));
    h.fs.move(h.f.uid, 15, 15, 1); h.guests.step();
    expect(g.portal).toBeUndefined(); expect(h.guests.walkable(g.i, g.j)).toBe(true); expect(g.uses).toBe(0);
  });

  it.each(['entering', 'inside'] as const)('park closing during %s finishes the admitted visit and exits via its doorway before leaving', phase => {
    const h = setup(), g = h.spawn(); let charged = 0;
    const hooks = { closing: () => true, onFacilityUse: () => { charged++; } };
    h.until(() => g.portal?.phase === phase);
    h.until(() => portalHidden(g), hooks);
    g.stateTicks = 100 * TICK_SCALE; h.guests.step(hooks);
    expect(g.portal?.phase).toBe('exiting'); expect(portalPosition(g.portal!)).toEqual(h.portal.threshold);
    h.until(() => !g.portal, hooks); expect(g.state).toBe('leave'); expect(charged).toBe(1);
    h.until(() => g.state === 'gone', hooks); expect(h.guests.count).toBe(0);
  });

  it('lodging guests remain inside after closing, then wake and serialize departure', () => {
    const h = setup('pension'), g = h.spawn(); h.until(() => portalHidden(g));
    g.stays = true; g.seatUid = h.f.uid; g.stateTicks = 100 * TICK_SCALE;
    h.guests.step({ closing: () => true }); expect(portalHidden(g)).toBe(true); expect(g.uses).toBe(0);
    h.guests.wakeUp(); h.guests.step(); expect(g.portal?.phase).toBe('exiting');
    h.until(() => !g.portal); expect(g.state).toBe('wander'); expect(g.stays).toBe(false);
  });

});

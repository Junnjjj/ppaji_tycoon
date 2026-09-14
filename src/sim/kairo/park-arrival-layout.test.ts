import { expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { WallGrid, reachable } from './walls.js';
import { applyStartKit } from './startkit.js';
import { MAP_TYPES } from './scenario.js';
import { arrangeInheritedEntrance, connectInheritedIndoorEntry } from './entrance-layout.js';
import { arrangeParkArrival, decorateParkArrival } from './park-arrival-layout.js';

it('connects north ticket → room → southern outdoor exit with no bypass, retaining all original elevations', () => {
  for (const map of MAP_TYPES) for (const seed of [1, 42, 20260818]) {
    const terrain = KairoTerrain.generate(96,72,new Rng(seed),map), walls = new WallGrid(96,72), placement = new PlacementGrid(96,72);
    const gate = KairoTerrain.parkGate();
    applyStartKit({terrain,walls,placement,gate,map,starterLeisure:false});
    const w = {terrain,walls,placement,gate,map};
    const moved = arrangeInheritedEntrance(w);
    const connected = connectInheritedIndoorEntry({...w,...moved});
    const r = arrangeParkArrival({...w,...connected});
    expect(r.changed, `${map.id}/${seed}: ${r.reason}`).toBe(true);
    expect(r.terrain.toSnapshot().levels).toEqual(terrain.toSnapshot().levels);
    const decorated = decorateParkArrival(r.terrain,r.walls,r.placement,gate);
    expect(decorated.added).toBeGreaterThan(15);
    const walk = guestWalkable(r.terrain,decorated.placement);
    const open = reachable(r.terrain,r.walls,gate,walk);
    const shut = Object.assign((i:number,j:number)=>!(i===gate.i && j===9)&&walk(i,j),{canCross:walk.canCross});
    const closed = reachable(r.terrain,r.walls,gate,shut);
    const bottom = 10 + map.start.indoor[1];
    for (const j of [9,10,11,bottom,bottom+1]) {
      expect(open[j*96+gate.i], `open ${map.id} ${j}`).toBe(1);
      expect(closed[j*96+gate.i], `closed ${map.id} ${j}`).toBe(0);
    }
    const copy = PlacementGrid.fromSnapshot(decorated.placement.toSnapshot());
    expect(copy.toSnapshot()).toEqual(decorated.placement.toSnapshot());
    for (const f of placement.all().filter(f=>f.defId !== 'ticket')) expect(copy.all().find(x=>x.handle===f.handle)).toEqual(f);
    expect(r.doors.keys).toHaveLength(2);
  }
});

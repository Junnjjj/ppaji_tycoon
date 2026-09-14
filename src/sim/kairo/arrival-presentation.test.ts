import { expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { WallGrid, reachable } from './walls.js';
import { applyStartKit } from './startkit.js';
import { MAP_TYPES } from './scenario.js';
import { arrangeInheritedEntrance, connectInheritedIndoorEntry } from './entrance-layout.js';
import { arrangeParkArrival, decorateParkArrival } from './park-arrival-layout.js';
import { refreshArrivalPresentation, ARRIVAL_PRESENTATION } from './arrival-presentation.js';
function world(map=MAP_TYPES[0]!,seed=20260818){
  const terrain=KairoTerrain.generate(96,72,new Rng(seed),map),walls=new WallGrid(96,72),placement=new PlacementGrid(96,72),gate=KairoTerrain.parkGate();
  applyStartKit({terrain,walls,placement,gate,map,starterLeisure:false});
  const w={terrain,walls,placement,gate,map};
  const a=arrangeInheritedEntrance(w),b=connectInheritedIndoorEntry({...w,...a}),c=arrangeParkArrival({...w,...b});
  return {...c,placement:decorateParkArrival(c.terrain,c.walls,c.placement,gate).placement};
}
it('expands to the configured room and aligns wall furnishings without blocking ticket or southern exit',()=>{
 for(const map of MAP_TYPES)for(const seed of [1,42,20260818]){
  const w=world(map,seed),before=w.terrain.toSnapshot(),r=refreshArrivalPresentation(w);
  expect(r.changed,`${map.id}/${seed}: ${r.reason}`).toBe(true);
  expect(r.terrain.toSnapshot().levels).toEqual(before.levels);
  let inside=0;for(let j=0;j<72;j++)for(let i=0;i<96;i++)if(r.terrain.isIndoor(i,j))inside++;
  expect(inside).toBe(ARRIVAL_PRESENTATION.indoor.width*ARRIVAL_PRESENTATION.indoor.depth);
  const walk=guestWalkable(r.terrain,r.placement),open=reachable(r.terrain,r.walls,w.gate,walk);
  const blocked=Object.assign((i:number,j:number)=>!(i===48&&j===9)&&walk(i,j),{canCross:walk.canCross});
  const shut=reachable(r.terrain,r.walls,w.gate,blocked);
  for(const j of [11,18,19,20,21]){expect(open[j*96+48]).toBe(1);expect(shut[j*96+48]).toBe(0);}
  expect(r.decorAdded).toBeGreaterThan(15);
  for(const f of w.placement.all().filter(f=>!f.defId.startsWith('env_')))expect(r.placement.all().find(x=>x.handle===f.handle)).toEqual(f);
 }
});
it('preserves a saved building occupying the requested expansion instead of deleting it',()=>{
 const w=world(),s=w.placement.toSnapshot();
 w.placement=PlacementGrid.fromSnapshot({...s,next:s.next+1,items:[...s.items,{handle:s.next,defId:'shop',i:42,j:17}]});
 const r=refreshArrivalPresentation(w);expect(r.changed).toBe(false);
 expect(r.placement.toSnapshot()).toEqual(w.placement.toSnapshot());expect(r.terrain.toSnapshot()).toEqual(w.terrain.toSnapshot());
});

it('treats unmarked decoration in the expansion as player property',()=>{
 const w=world(),s=w.placement.toSnapshot();
 w.placement=PlacementGrid.fromSnapshot({...s,next:s.next+1,items:[...s.items,{handle:s.next,defId:'env_bench',i:42,j:17}]});
 const r=refreshArrivalPresentation(w);
 expect(r.changed).toBe(false);
 expect(r.placement.toSnapshot()).toEqual(w.placement.toSnapshot());
});

it('preserves an authored prop after the player has moved it',()=>{
 const w=world(),s=w.placement.toSnapshot();
 const prop=s.items.find(f=>f.defId==='env_bench')!;
 w.placement=PlacementGrid.fromSnapshot({...s,items:s.items.map(f=>f.handle===prop.handle?{...f,i:58,j:23}:f)});
 const r=refreshArrivalPresentation(w);
 expect(r.changed,r.reason).toBe(true);
 expect(r.placement.all().find(f=>f.handle===prop.handle)).toEqual({...prop,i:58,j:23});
});

import { afterEach, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { PlacementGrid, facilityDef, guestWalkable } from './placement.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid, reachable } from './walls.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
const def = facilityDef('ticket')!;
const original = structuredClone(def);
afterEach(() => { Object.keys(def).forEach(k => { delete (def as unknown as Record<string, unknown>)[k]; }); Object.assign(def, original); });
function world(facing: 0|1|2|3 = 0) {
  Object.assign(def, { facings: 4, entryTiles: [[2,-1]], admissionPassage: [[2,0],[2,1],[2,2]] });
  const t = new KairoTerrain(24,24), w = new WallGrid(24,24), p = new PlacementGrid(24,24);
  for(let j=0;j<24;j++)for(let i=0;i<24;i++)t.paint(i,j,'path_stone');
  const entry=PlacementGrid.footprintTileOf(def,10,10,[2,-1],facing);
  const gate={i:entry[0],j:entry[1]};
  expect(p.place(t,w,gate,'ticket',10,10,{facing}).ok).toBe(true);
  return {t,w,p,gate};
}
it('rotates the clear lane and solid kiosk through all four directions and preserves them after load',()=>{
  for(const facing of [0,1,2,3] as const){
    const {t,w,p,gate}=world(facing);const restored=PlacementGrid.fromSnapshot(p.toSnapshot());
    const lane=[...def.entryTiles!,...def.admissionPassage!].map(tile=>PlacementGrid.footprintTileOf(def,10,10,tile,facing));
    for(const tile of [[0,0],[1,0],[0,1],[1,1]] as const){const [x,y]=PlacementGrid.footprintTileOf(def,10,10,tile,facing);expect(restored.blocksWalk(x,y)).toBe(true);}
    for(let n=1;n<lane.length;n++){const a=lane[n-1]!,b=lane[n]!;expect(restored.blocksWalk(...b)).toBe(false);expect(restored.blocksCross(...a,...b)).toBe(false);expect(restored.blocksCross(...b,...a)).toBe(false);}
    const side=PlacementGrid.footprintTileOf(def,10,10,[3,0],facing);
    expect(restored.blocksCross(...lane[1]!,...side)).toBe(true);
    expect(reachable(t,w,gate,guestWalkable(t,restored))[lane[3]![1]*24+lane[3]![0]]).toBe(1);
  }
});
it('actually walks both passage cells before charging admission exactly once',()=>{
  for(const facing of [0,1,2,3] as const){
    const {t,w,p,gate}=world(facing),rng=new Rng(23),g=new GuestStore(t,w,p,gate,{...GUEST_DEFAULTS,ticksPerStep:2});
    const guest=g.spawn(rng)!;expect(guest).toBeTruthy();const visited=new Set<string>();
    let admitted=0,fee=0;
    for(let tick=0;tick<200;tick++){
      g.tick(rng);visited.add(`${guest.i},${guest.j}`);
      const a=g.takeAdmitted();admitted+=a.count;fee+=a.fee;
      if(admitted)break;
    }
    for(const tile of def.admissionPassage!){const point=PlacementGrid.footprintTileOf(def,10,10,tile,facing);expect(visited.has(String(point))).toBe(true);}
    expect(admitted).toBe(1);expect(fee).toBe(GUEST_DEFAULTS.admissionFee);
    for(let n=0;n<20;n++)g.tick(rng);
    expect(g.takeAdmitted().count).toBe(0);
  }
});

it('does not charge a guest if the park-side exit becomes blocked during service',()=>{
 const {t,w,p,gate}=world(),rng=new Rng(23),g=new GuestStore(t,w,p,gate,{...GUEST_DEFAULTS,ticksPerStep:2});
 const guest=g.spawn(rng)!;
 for(let n=0;n<20&&guest.state!=='using';n++)g.tick(rng);
 expect(guest.state).toBe('using');
 t.paint(12,12,'lawn');g.invalidate();
 for(let n=0;n<80;n++)g.tick(rng);
 expect(g.takeAdmitted().count).toBe(0);
});

import { describe, expect, it } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { SLOPE_UP, slopeAt, movementLevel } from './slopes.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { WallGrid, reachable } from './walls.js';
import { paintFloor, paintFloorBlock } from './indoor.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { Rng } from '../rng.js';

function fixture(facing: 0|1|2|3 = 0) {
  const t = new KairoTerrain(16,16), w = new WallGrid(16,16), p = new PlacementGrid(16,16);
  const [di,dj] = SLOPE_UP[facing], gate = {i:8-di*3,j:8-dj*3};
  for(let n=-3;n<=3;n++) { const i=8+di*n,j=8+dj*n;t.paint(i,j,'path_stone');t.setLevel(i,j,n>0?1:0); }
  expect(paintFloor(t,w,gate,8,8,'path_ramp',guestWalkable(t,p),p).ok).toBe(true);
  return {t,w,p,gate,di,dj};
}

describe('authored terrain connectors in the real simulation',()=>{
 it.each([0,1,2,3] as const)('direction %s: save/load, both directions, and blocked sides agree with GuestStore',f=>{
  const {t,w,p,gate,di,dj}=fixture(f);
  const back=KairoTerrain.fromSnapshot(t.toSnapshot());
  expect(back.toSnapshot()).toEqual(t.toSnapshot());
  expect(slopeAt(back,8,8)?.facing).toBe(f);
  for(const sign of [-1,1]) {
   expect(back.levelPassable(8,8,8+di*sign,8+dj*sign)).toBe(true);
   expect(back.levelPassable(8+di*sign,8+dj*sign,8,8)).toBe(true);
  }
  back.paint(8-dj,8+di,'path_stone');
  expect(back.levelPassable(8,8,8-dj,8+di)).toBe(false);
  const g=new GuestStore(back,w,p,gate,GUEST_DEFAULTS);
  expect(g.gateDistanceForTest(8+di*3,8+dj*3)).toBe(6);
  expect(g.gateDistanceForTest(8-dj,8+di)).toBe(-1);
  const seen=reachable(back,w,gate,guestWalkable(back,p));
  expect(seen[(8+dj*3)*16+8+di*3]).toBe(1);
  expect(seen[(8+di)*16+8-dj]).toBe(0);
  // Force a leaving guest to use its real gate flow field over the ramp.
  const rng=new Rng(19),guest=g.spawn(rng)!;
  Object.assign(guest,{i:8+di*3,j:8+dj*3,fromI:8+di*3,fromJ:8+dj*3,state:'leaving',progress:1});
  const visited=new Set<string>();
  for(let n=0;n<100;n++){g.tick(rng);visited.add(`${guest.i},${guest.j}`);}
  expect(visited.has('8,8')).toBe(true);
  const highGate={i:8+di*3,j:8+dj*3};
  const uphill=new GuestStore(back,w,p,highGate,GUEST_DEFAULTS), climber=uphill.spawn(rng)!;
  Object.assign(climber,{i:gate.i,j:gate.j,fromI:gate.i,fromJ:gate.j,state:'leaving',progress:1});
  const upVisited=new Set<string>();
  for(let n=0;n<100;n++){uphill.tick(rng);upVisited.add(`${climber.i},${climber.j}`);}
  expect(upVisited.has('8,8')).toBe(true);
  expect(upVisited.has(`${highGate.i},${highGate.j}`)).toBe(true);
 });
 it('uses the actual surface: level landing, half-height at ramp centre, upper landing',()=>{
  const {t}=fixture();
  expect(movementLevel(t,7,8,8,8,.25)).toBe(0);
  expect(movementLevel(t,7,8,8,8,.75)).toBe(.25);
  expect(movementLevel(t,8,8,9,8,0)).toBe(.5);
  expect(movementLevel(t,8,8,9,8,.5)).toBe(1);
  expect(movementLevel(t,9,8,8,8,.75)).toBe(.75);
 });
 it('forbids buildings on ramp tiles, allows the aligned fence, and protects its ground',()=>{
  const {t,w,p,gate}=fixture();
  expect(p.check(t,w,gate,'env_flower_pot',8,8)).toMatchObject({ok:false,fail:'level-mixed'});
  expect(p.check(t,w,gate,'env_wood_fence',8,8,{facing:1})).toMatchObject({ok:false,fail:'slope-facing'});
  // A side route keeps the entry reachable while the fence occupies the whole cell.
  for(let i=5;i<=11;i++)t.paint(i,7,'path_stone');
  expect(p.place(t,w,gate,'env_wood_fence',8,8,{facing:0}).ok).toBe(true);
  expect(paintFloor(t,w,gate,8,8,'path_stone',guestWalkable(t,p),p)).toMatchObject({ok:false,fail:'occupied-slope'});
  expect(PlacementGrid.fromSnapshot(p.toSnapshot()).blocksWalk(8,8)).toBe(true);
 });
 it('rejects invalid slopes, elevated indoor floors and two-level cliffs without partial block writes',()=>{
  const {t,w,p,gate}=fixture();const before=t.toSnapshot();
  expect(paintFloor(t,w,gate,4,4,'path_ramp')).toMatchObject({ok:false,fail:'slope-shape'});
  expect(paintFloor(t,w,gate,9,8,'floor_indoor')).toMatchObject({ok:false,fail:'indoor-height'});
  expect(paintFloorBlock(t,w,gate,7,7,2,2,'path_steps',undefined,p).ok).toBe(false);
  expect(t.toSnapshot()).toEqual(before);
  t.setLevel(9,8,2);expect(t.levelPassable(8,8,9,8)).toBe(false);
 });
 it('rolls back high-landing flooding and rejects an indoor landing beside a ramp',()=>{
  const {t,w,p,gate}=fixture();const before=t.toSnapshot();
  expect(paintFloor(t,w,gate,9,8,'pool_water',undefined,p)).toMatchObject({ok:false,fail:'slope-shape'});
  expect(t.toSnapshot()).toEqual(before);
  expect(paintFloor(t,w,gate,7,8,'floor_indoor',undefined,p)).toMatchObject({ok:false,fail:'slope-shape'});
  expect(t.toSnapshot()).toEqual(before);
 });
 it('keeps old one-level routes and old snapshots intact',()=>{
  const t=new KairoTerrain(4,4);t.setLevel(2,1,1);
  expect(t.levelPassable(1,1,2,1)).toBe(true);
  const snap=t.toSnapshot();delete snap.levels;
  expect(KairoTerrain.fromSnapshot(snap).levelAt(2,1)).toBe(0);
 });
});

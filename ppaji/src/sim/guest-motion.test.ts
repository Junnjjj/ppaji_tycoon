import {describe,it,expect} from 'vitest';
import balance from '../data/balance.json';
import facilities from '../data/facilities.json';
import type {FacilityDef} from '../data/schema.js';
import {Grid,FLOOR} from './grid.js';
import {PoolStore} from './pool.js';
import {FacilityStore} from './facility.js';
import {GuestStore} from './guest.js';
import {Rng} from './rng.js';
import {advanceGuestMovement} from './guest-motion.js';
function setup(){const grid=new Grid(24,24);grid.floor.fill(FLOOR.path);const pools=new PoolStore(grid),fs=new FacilityStore(grid,new Map((facilities as unknown as FacilityDef[]).map(d=>[d.id,d]))),guests=new GuestStore(grid,pools,fs,{i:2,j:2},new Rng(4),{...balance,wanderTicks:10000});return {grid,pools,fs,guests};}
const point=(g:{i:number;j:number;fromI:number;fromJ:number;progress:number})=>[g.fromI+(g.i-g.fromI)*g.progress,g.fromJ+(g.j-g.fromJ)*g.progress];
describe('NPC movement handoffs',()=>{
 it('old multi-tile spans move at walking speed instead of completing in one tile duration',()=>{const g={i:8,j:2,fromI:2,fromJ:2,progress:0,facing:3 as 0|1|2|3};advanceGuestMovement(g,8);expect(point(g)).toEqual([2.125,2]);expect(g.facing).toBe(0);});
 it('pool exit takes adjacent water steps and awards swim completion only once',()=>{const h=setup();for(let j=6;j<13;j++)for(let i=6;i<13;i++)h.grid.set(i,j,FLOOR.pool);h.pools.recompute();const p=h.pools.all[0]!,g=h.guests.spawn();Object.assign(g,{i:9,j:9,fromI:9,fromJ:9,progress:1,state:'swim',stateTicks:10000,target:{kind:'pool',id:p.id},swimTile:9*24+9,hp:100});let last=point(g),max=0;for(let n=0;n<100;n++){h.guests.step();const at=point(g);max=Math.max(max,Math.hypot(at[0]!-last[0]!,at[1]!-last[1]!));last=at;if(g.state!=='swim'&&g.progress===1)break;}expect(max).toBeLessThanOrEqual(Math.max(.125,1/balance.walkTicksPerTile)+1e-9);expect(g.state).not.toBe('swim');expect(h.guests.walkable(g.i,g.j)).toBe(true);expect(g.hp).toBe(100-balance.guestHpSwim);});
 for(const [di,dj,face] of [[1,0,0],[0,1,1],[-1,0,2],[0,-1,3]])it(`swim follows displacement ${di}/${dj}`,()=>{const h=setup();for(let j=5;j<13;j++)for(let i=5;i<13;i++)h.grid.set(i,j,FLOOR.pool);h.pools.recompute();const g=h.guests.spawn();Object.assign(g,{i:9+di!,j:9+dj!,fromI:9,fromJ:9,progress:0,facing:0,state:'swim',stateTicks:0,target:{kind:'pool',id:h.pools.all[0]!.id}});h.guests.step();expect(g.facing).toBe(face);});
 it('static activity finishes its authored route, survives a snapshot, and releases without fast interpolation',()=>{const h=setup(),f=h.fs.place('rig_iceberg',8,8,0),g=h.guests.spawn();Object.assign(g,{i:7,j:8,fromI:7,fromJ:8,progress:1,state:'use',stateTicks:0,target:{kind:'facility',uid:f.uid}});h.guests.step();expect(g.staticVisit).toBeDefined();const total=g.staticVisit!.totalTicks;expect(total).toBeGreaterThan(8*140/60);for(let i=0;i<20;i++)h.guests.step();expect(g.uses).toBe(0);const save=h.guests.toSnapshot();h.guests.step();expect(save.guests[0]!.stateTicks).not.toBe(g.stateTicks);h.guests.fromSnapshot(save);const restored=h.guests.all[0]!;for(let i=0;i<total+2&&restored.staticVisit;i++)h.guests.step();expect(restored.uses).toBe(1);expect(restored.progress).toBe(1);
 Object.assign(restored,{state:'use',target:{kind:'facility',uid:f.uid},stateTicks:0});h.guests.step();h.fs.move(f.uid,16,16,1);h.guests.step();expect(restored.staticVisit).toBeUndefined();expect(restored.progress).toBe(1);expect(restored.fromI).toBe(restored.i);expect(restored.uses).toBe(1);
 });
});

import {describe,it,expect} from 'vitest';
import {Game} from './game.js';
import {PREPARATION_IDS,prepPosition} from './preparation.js';

describe('mandatory preparation on admission',()=>{
 it('all guests use locker, changing and shower in order, with exclusive slots and continuous contacts',()=>{
  const game=new Game(31,undefined,{arrival:true}),guests=Array.from({length:8},()=>game.guests.spawn());
  const events=new Map<number,string[]>(),last=new Map<number,[number,number]>();
  for(let tick=0;tick<1800;tick++){
   game.guests.step({onFacilityUse:(g,f)=>{const list=events.get(g.uid)??[];list.push(f.defId);events.set(g.uid,list);}});
   const claims=new Set<string>();
   for(const g of guests){
    if(g.prep){const key=`${g.prep.uid}/${g.prep.slot}`;expect(claims.has(key)).toBe(false);claims.add(key);}
    const pos=g.prep && g.prep.phase!=='approach'?prepPosition(g.prep):[g.fromI+.5+(g.i-g.fromI)*g.progress,g.fromJ+.5+(g.j-g.fromJ)*g.progress] as [number,number];
    const before=last.get(g.uid);if(before)expect(Math.hypot(pos[0]-before[0],pos[1]-before[1])).toBeLessThanOrEqual(.51);last.set(g.uid,pos);
    if(g.arrivalStep===21)expect(events.get(g.uid)?.slice(0,3)).toEqual([...PREPARATION_IDS]);
   }
   if(guests.every(g=>g.arrivalStep===21))break;
  }
  for(const g of guests){expect(g.preparationStep).toBe(3);expect(g.arrivalStep).toBe(21);expect(g.prep).toBeUndefined();}
  for(const id of PREPARATION_IDS)expect(game.facilities.all.find(f=>f.defId===id)!.usesToday).toBe(8);
 });
 it('restores an active booth reservation and continues identically',()=>{
  const a=new Game(4,undefined,{arrival:true});for(let n=0;n<5;n++)a.guests.spawn();
  for(let n=0;n<180;n++)a.guests.step();expect(a.guests.all.some(g=>g.prep)).toBe(true);
  const b=Game.fromSnapshot(a.toSnapshot());for(let n=0;n<500;n++){a.guests.step();b.guests.step();}
  expect(a.guests.toSnapshot()).toEqual(b.guests.toSnapshot());expect(a.facilities.toSnapshot()).toEqual(b.facilities.toSnapshot());
 });
 it('releases a deleted occupied booth without orphaned actors or claims',()=>{
  const game=new Game(6,undefined,{arrival:true}),guest=game.guests.spawn();
  for(let n=0;n<500;n++){game.guests.step();if(guest.preparationStep===1 && guest.prep?.phase==='using')break;}
  expect(guest.prep?.phase).toBe('using');const uid=guest.prep!.uid;
  expect(game.removeFacility(uid).ok).toBe(true);expect(guest.prep).toBeUndefined();
  for(let n=0;n<500 && guest.arrivalStep!==21;n++)game.guests.step();
  expect(guest.arrivalStep).toBe(21);expect(guest.prep).toBeUndefined();
 });

});

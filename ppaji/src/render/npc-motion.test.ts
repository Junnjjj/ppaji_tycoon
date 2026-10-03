import {describe,it,expect} from 'vitest';
import {craftFrameSignature,transferHeading} from './npc-motion';
import type {CraftRider} from './watercraft-composite';
const rider:CraftRider={uid:13,di:0,dj:0,z:.5,heading:4,pose:'walk'};
describe('NPC movement presentation',()=>{
 it('faces the return direction on all 16 dismount headings',()=>{
  for(let h=0;h<16;h++){const a=h*Math.PI/8,di=Math.cos(a),dj=Math.sin(a);expect((transferHeading(di,dj,true)-transferHeading(di,dj,false)+16)%16).toBe(8);}
 });
 it('advances stationary animated riders and freezes their signature when time is paused',()=>{
  const a=craftFrameSignature('test',4,[rider],0);expect(craftFrameSignature('test',4,[rider],199)).toBe(a);expect(craftFrameSignature('test',4,[rider],200)).not.toBe(a);expect(craftFrameSignature('test',4,[rider],800)).toBe(a);
 });
 it('does not reupload static sitting art each tick but reacts to a changed pose, heading or person',()=>{
  const sit={...rider,pose:'sit' as const},key=craftFrameSignature('banana',4,[sit],0);expect(craftFrameSignature('banana',4,[sit],200)).toBe(key);
  for(const changed of [{...sit,uid:14},{...sit,heading:8},{...sit,pose:'walk' as const}])expect(craftFrameSignature('banana',4,[changed],0)).not.toBe(key);
 });
});

import { expect, it } from 'vitest';
import { npcV8Frame, NPC_PRESENTATION } from './kairo-npc-v8.js';
import { readFileSync } from 'node:fs';
const atlas = JSON.parse(readFileSync(new URL('../../public/assets/kairo-npc-v8/atlas.json', import.meta.url), 'utf8'));
it('resolves every curated look, gameplay pose, direction and animation frame to the packed atlas', () => {
  for(const appearanceId of NPC_PRESENTATION.looks)for(const pose of Object.keys(NPC_PRESENTATION.poses))for(const facing of Object.keys(NPC_PRESENTATION.facings)) {
    for(const time of [0,200,400,600,800]) {
      const f=npcV8Frame({id:1,pose,facing,appearanceId},time);
      expect(atlas.frames[f.frame]).toBeTruthy();
      expect(f.originX).toBeGreaterThan(0);expect(f.originX).toBeLessThan(1);
    }
  }
});
it('mirrors the correct diagonal and contact point, and runs the four walk phases at five fps',()=>{
  const frames=[0,200,400,600,800].map(time=>npcV8Frame({id:1,pose:'walk',facing:'+X'},time));
  expect(frames.map(f=>f.index)).toEqual([0,1,2,3,0]);
  for(const [facing,state,mirror] of [['+X','front_walk',0],['+Z','front_walk',1],['-X','back_walk',1],['-Z','back_walk',0]] as const){
    const f=npcV8Frame({id:1,pose:'walk',facing},0);expect(f.state).toBe(state);expect(f.frame).toContain(`/${mirror}/`);
  }
  const a=npcV8Frame({id:1,pose:'sit',facing:'+X'},0),b=npcV8Frame({id:1,pose:'sit',facing:'+Z'},0);
  expect(a.originX+b.originX).toBe(1);
  expect(()=>npcV8Frame({id:1,pose:'walk',facing:'+X',appearanceId:'missing'},0)).toThrow('Unknown NPC appearance');
});

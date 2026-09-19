import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CraftSpec } from './watercraft.js';
import { craftHeading } from './watercraft.js';
import { craftFacing, riderDepth } from '../render/watercraft-composite.js';
import { CourseStore, COURSE_EQUIPMENT } from '../sim/course/course.js';
import equipment from '../data/equipment.json';
import seats from '../data/watercraft-seats.json';
import gears from '../data/gears.json';
import courses from '../data/courses.json';
describe('approved moving assets',()=>{
  it('keeps authored forward and physical quarter turns',()=>{
    expect([[0,1],[1,0],[0,-1],[-1,0]].map(([i,j])=>craftHeading(i!,j!))).toEqual([0,4,8,12]);
    expect([0,4,8,12].map(craftFacing)).toEqual([1,0,3,2]);
    expect(riderDepth(1,0,0)).toBeCloseTo(riderDepth(0,1,0));
    expect(riderDepth(0,0,1)).toBeLessThan(riderDepth(0,0,0));
  });
  it('excludes rejected turtle from active catalogs',()=>{
    expect(equipment.equipment).toHaveLength(29);
    expect(COURSE_EQUIPMENT.some(x=>x.id==='turbo_turtle')).toBe(false);
    expect(gears.some(x=>x.id==='turbo_turtle')).toBe(false);
    expect(Object.keys(courses.fit)).not.toContain('turbo_turtle');
  });
  it('every live capacity has authored seats and native 16-heading pixels/depth',()=>{
    const root=new URL('../../public/assets/approved-watercraft/',import.meta.url);
    const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8')) as {equipment:Record<string,CraftSpec>};
    expect(seats).toEqual(Object.fromEntries(Object.entries(manifest.equipment).map(([id,s])=>[id,s.seats])));
    for(const e of equipment.equipment){
      const spec=manifest.equipment[e.id]!;expect(spec,e.id).toBeDefined();expect(spec.seats,e.id).toHaveLength(e.capacity);
    }
    for(const [id,spec]of Object.entries(manifest.equipment))for(let h=0;h<16;h++){
      const png=readFileSync(new URL(`${id}/B/native-h${String(h).padStart(2,'0')}.png`,root));
      expect(png.readUInt32BE(16),id).toBe(spec.logical_size);expect(png.readUInt32BE(20),id).toBe(spec.logical_size);
      expect(readFileSync(new URL(`${id}/B/depth-h${String(h).padStart(2,'0')}.bin`,root)).length,id).toBe(spec.logical_size*spec.logical_size*4);
    }
  });
  it('migrates retired turtle preserving path and snapshot idempotence',()=>{
    const saved={nextHandle:8,owned:['turbo_turtle'],courses:[{handle:7,equipId:'turbo_turtle',presetId:'loop',vehicles:2,dock:{x:3,y:4},handles:[{x:5,y:8},{x:9,y:4}]}]};
    const store=CourseStore.fromSnapshot(saved),next=store.toSnapshot();
    expect(store.all[0]).toMatchObject({...saved.courses[0],equipId:'peanut'});
    expect(CourseStore.fromSnapshot(next).toSnapshot()).toEqual(next);
    expect(saved.courses[0]!.equipId).toBe('turbo_turtle');
  });
});

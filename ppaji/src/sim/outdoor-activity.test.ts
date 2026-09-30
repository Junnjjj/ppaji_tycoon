import { describe, expect, it } from 'vitest';
import balance from '../data/balance.json';
import facilities from '../data/facilities.json';
import type { FacilityDef } from '../data/schema.js';
import { Grid, FLOOR } from './grid.js';
import { PoolStore } from './pool.js';
import { FacilityStore, capacityOf } from './facility.js';
import { GuestStore, type Guest, type GuestHooks } from './guest.js';
import { Game } from './game.js';
import { Rng } from './rng.js';
import { outdoorContract, outdoorGate, outdoorSlots, outdoorWorld, outdoorInAisle, sampleOutdoorGuest } from './outdoor-activity.js';

const ids = ['playground','pavilion','photozone','stage_river_lv1','stage_river_lv2','stage_river_lv3','bungee_jump','sauna','jjimjilbang','arcade','vending_in','info','rental_tube','indoor_shop','dry_room','authored_infirmary','authored_karaoke','foodcourt_seat','icecream','sikhye','bungeoppang','shade_net','shop','snackbar','firepit_row','chicken','authored_parasol','authored_bbq_zone','authored_sunbed_row','authored_pyeongsang_row','authored_massage_row','authored_footbath'];
function setup(id='pavilion', facing:0|1=0, hold=20) {
  const grid=new Grid(30,30); grid.floor.fill(FLOOR.path);
  const defs=new Map((facilities as unknown as FacilityDef[]).map(d=>[d.id,{...d,useTicks:hold}]));
  const fs=new FacilityStore(grid,defs), f=fs.place(id,8,8,facing), pools=new PoolStore(grid);
  const guests=new GuestStore(grid,pools,fs,{i:2,j:2},new Rng(31),{...balance,wanderTicks:10000});
  const spawn=(at=outdoorGate(f)!):Guest=> {const g=guests.spawn(); Object.assign(g,{i:at.i,j:at.j,fromI:at.i,fromJ:at.j,progress:1,state:'walk',target:{kind:'facility',uid:f.uid}});return g;};
  const until=(predicate:()=>boolean,hooks?:GuestHooks,max=5000)=>{for(let n=0;n<max&&!predicate();n++)guests.step(hooks);expect(predicate()).toBe(true);};
  return {grid,fs,f,pools,guests,spawn,until};
}

describe('real outdoor visitor integration',()=>{
  for(const id of ids) for(const facing of [0,1] as const) {
    it(`${id}/${facing}: actual guest walks designated gates, consumes finite route, rewards once`,()=>{
      const h=setup(id,facing), g=h.spawn({i:5,j:5});let rewards=0;
      const hooks={onFacilityUse:(actual:Guest)=>{expect(actual).toBe(g);rewards++;}};
      h.until(()=>!!g.outdoor,hooks);
      const first=sampleOutdoorGuest(g)!;const world=outdoorWorld(h.f,first.position);
      expect(world.i).toBeCloseTo(g.i+.5);expect(world.j).toBeCloseTo(g.j+.5);
      let last=first;let maxStep=0;
      for(let n=0;n<3000&&g.outdoor;n++){
        h.guests.step(hooks);const next=sampleOutdoorGuest(g);
        if(next){maxStep=Math.max(maxStep,Math.hypot(...next.position.map((v,i)=>v-last.position[i]!)));last=next;}
      }
      expect(g.outdoor).toBeUndefined();expect(rewards).toBe(1);expect(g.uses).toBe(1);
      expect(h.f.usesToday).toBe(1);expect(maxStep).toBeLessThan(1.2);
      const exit=outdoorGate(h.f,true)!;expect({i:g.i,j:g.j}).toEqual(exit);
      expect(outdoorWorld(h.f,last.position).i).toBeCloseTo(exit.i+.5,0);
      expect(h.guests.walkable(g.i,g.j)).toBe(true);
      for(let n=0;n<5;n++)h.guests.step(hooks);expect(rewards).toBe(1);
    });
    it(`${id}/${facing}: Game uses real GuestStore and preserves fee/completion hooks`,()=>{
      const game=new Game(41,{...balance,wanderTicks:10000},{kit:false,arrival:false});
      game.grid.floor.fill(FLOOR.path);game.grid.levels.fill(0);
      const f=game.facilities.place(id,8,8,facing), entry=outdoorGate(f)!;
      const g=game.guests.spawn();Object.assign(g,{i:entry.i,j:entry.j,fromI:entry.i,fromJ:entry.j,progress:1,state:'walk',target:{kind:'facility',uid:f.uid}});
      game.step(1);expect(g.outdoor?.uid).toBe(f.uid);
      for(let n=0;n<1100&&g.outdoor;n++)game.step(1);
      expect(g.outdoor).toBeUndefined();expect(g.uses).toBe(1);expect(f.usesTotal).toBe(1);
      expect(g.spentToday).toBe(f.incomeToday);
    });
  }
  for(const id of ids.filter(id=>!['playground','bungee_jump'].includes(id))) for(const facing of [0,1] as const) {
    it(`${id}/${facing}: physical capacity, stable seats, one aisle, admission and exit order`,()=>{
      const h=setup(id,facing,20),cap=capacityOf(h.fs.defOf(h.f),{level:5,chainLen:9}),actors:Guest[]=[];
      expect(cap).toBe(outdoorSlots(outdoorContract(id)!).length);
      const clearance=()=>{
        for(const moving of actors.filter(g=>g.outdoor&&outdoorInAisle(g.outdoor))) for(const seated of actors.filter(g=>sampleOutdoorGuest(g)?.phase==='hold')) {
          const a=sampleOutdoorGuest(moving)!.position,b=sampleOutdoorGuest(seated)!.position;
          expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeGreaterThanOrEqual(id==='stage_river_lv2'?.35:.24);
        }
      };
      for(let n=0;n<cap;n++) {const g=h.spawn();actors.push(g);
        for(let t=0;t<1000&&sampleOutdoorGuest(g)?.phase!=='hold';t++){h.guests.step();clearance();}
        expect(sampleOutdoorGuest(g)?.phase).toBe('hold');
        expect(new Set(actors.map(g=>g.outdoor!.slotId)).size).toBe(n+1);
      }
      const seats=actors.map(g=>g.outdoor!.slotId),positions=actors.map(g=>sampleOutdoorGuest(g)!.position);
      const extra=h.spawn();h.guests.step();expect(extra.state).toBe('queue');
      expect(actors.map(g=>g.outdoor!.slotId)).toEqual(seats);expect(actors.map(g=>sampleOutdoorGuest(g)!.position)).toEqual(positions);
      const completed:string[]=[];const hooks={onFacilityUse:(g:Guest)=>{completed.push(seats[actors.indexOf(g)]!);}};
      // Mark the cohort ready together; no new guest may enter until every old seat drains.
      for(const g of actors){const v=g.outdoor!;v.elapsed=v.segments[v.segment]!.ticks-1;}
      for(let n=0;n<6000&&actors.some(g=>g.outdoor);n++) {
        h.guests.step(hooks);clearance();
        expect(actors.filter(g=>g.outdoor&&outdoorInAisle(g.outdoor)).length).toBeLessThanOrEqual(1);
        if(actors.some(g=>g.outdoor))expect(extra.outdoor).toBeUndefined();
      }
      expect(completed).toEqual(outdoorContract(id)!.exitOrder??(id==='photozone'?seats:[...seats].reverse()));
      expect(actors.every(g=>g.uses===1&&!g.outdoor)).toBe(true);
    });
  }
  it('playground has one exclusive rider and three real external queued guests, who each ride once',()=>{
    const h=setup('playground'),actors=Array.from({length:4},()=>h.spawn());h.guests.step();
    expect(h.guests.queueAt(h.f)).toBe(3);expect(actors.filter(g=>g.outdoor).length).toBe(1);
    expect(capacityOf(h.fs.defOf(h.f),{level:5})).toBe(4);
    for(let n=0;n<3000&&actors.some(g=>g.uses===0);n++) {h.guests.step();expect(actors.filter(g=>g.outdoor).length).toBeLessThanOrEqual(1);}
    expect(actors.map(g=>g.uses)).toEqual([1,1,1,1]);
  });
  it('bungee visits every physical phase once and samples the approved rope and harness offset',()=>{
    const h=setup('bungee_jump'),g=h.spawn();h.guests.step();const phases=new Set<string>();
    for(let n=0;n<1000&&g.outdoor;n++) {
      const a=sampleOutdoorGuest(g)!;phases.add(a.phase);
      if(a.phase==='ascent')expect(a.hidden).toBe(true);
      if(['jump','bounce','winch'].includes(a.phase)){
        expect(a.pose).toBe('cheer_jump');expect(a.rope).toBeDefined();expect(a.harness).toBeDefined();
        expect(a.rope!.to).toEqual([a.position[0]+.38,a.position[1],a.position[2]+.48]);
        expect(a.rope!.mode).toBe(a.phase==='winch'?'winch':'elastic');
      }
      if(a.phase==='recover')expect(a.rope).toBeUndefined();h.guests.step();
    }
    expect([...phases]).toEqual(['entering','entry','ascent','platform','prepare','jump','bounce','winch','recover','exiting']);
    expect(g.uses).toBe(1);
  });
  for(const [id,phase] of [['pavilion','hold'],['bungee_jump','bounce'],['playground','slide']] as const) {
    it(`${id}: detached JSON snapshot resumes mid-${phase} and rewards exactly once`,()=>{
      const h=setup(id),g=h.spawn();h.until(()=>sampleOutdoorGuest(g)?.phase===phase);h.guests.step();
      const snapshot=h.guests.toSnapshot(),serialized=JSON.stringify(snapshot),before=sampleOutdoorGuest(g);
      h.guests.step();expect(JSON.stringify(snapshot)).toBe(serialized);
      h.guests.fromSnapshot(JSON.parse(serialized));const restored=h.guests.byUid(g.uid)!;
      expect(sampleOutdoorGuest(restored)).toEqual(before);
      let charged=0;h.until(()=>!restored.outdoor,{onFacilityUse:()=>charged++});
      expect(charged).toBe(1);expect(restored.uses).toBe(1);
    });
  }
  for(const [id,phase] of [['bungee_jump','bounce'],['pavilion','hold']] as const) for(const edit of ['delete','move','rotate','close-path'] as const) it(`${id}/${edit} cancels without phantom completion`,()=>{
    const h=setup(id),g=h.spawn();h.until(()=>sampleOutdoorGuest(g)?.phase===phase);
    if(edit==='delete')h.fs.remove(h.f.uid);
    if(edit==='move')h.fs.move(h.f.uid,18,18,0);
    if(edit==='rotate')h.fs.move(h.f.uid,8,8,1);
    if(edit==='close-path'){const tile=outdoorGate(h.f,true)!;h.grid.set(tile.i,tile.j,FLOOR.pool);}
    h.guests.step();expect(g.outdoor).toBeUndefined();expect(g.uses).toBe(0);expect(h.guests.walkable(g.i,g.j)).toBe(true);
    expect(h.guests.busyCount(h.f)).toBe(0);
  });
  it('Game JSON reload preserves a live mid-bungee visitor and completes the existing fee hook once',()=>{
    const game=new Game(51,{...balance,wanderTicks:10000},{kit:false,arrival:false});
    game.grid.floor.fill(FLOOR.path);game.grid.levels.fill(0);
    const f=game.facilities.place('bungee_jump',8,8,1),e=outdoorGate(f)!;
    const guest=game.guests.spawn();Object.assign(guest,{i:e.i,j:e.j,fromI:e.i,fromJ:e.j,progress:1,state:'walk',target:{kind:'facility',uid:f.uid}});
    for(let n=0;n<1000&&sampleOutdoorGuest(guest)?.phase!=='bounce';n++)game.step(1);
    expect(sampleOutdoorGuest(guest)?.phase).toBe('bounce');
    const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(game.toSnapshot())),{...balance,wanderTicks:10000});
    const g=restored.guests.byUid(guest.uid)!;expect(sampleOutdoorGuest(g)).toEqual(sampleOutdoorGuest(guest));
    for(let n=0;n<1000&&g.outdoor;n++)restored.step(1);
    expect(g.outdoor).toBeUndefined();expect(g.uses).toBe(1);expect(restored.facilities.byUid(f.uid)!.usesTotal).toBe(1);
    expect(g.spentToday).toBe(restored.facilities.byUid(f.uid)!.incomeToday);
  });
  it('closing seated outdoor leisure finishes then leaves, never sleeps overnight',()=>{
    const h=setup(),g=h.spawn();h.until(()=>sampleOutdoorGuest(g)?.phase==='hold');g.stays=true;g.seatUid=h.f.uid;
    h.until(()=>!g.outdoor,{closing:()=>true});expect(g.state).toBe('leave');expect(g.stays).toBe(false);expect(g.uses).toBe(1);
  });
  it('blocked or unreachable designated gate refuses admission; legacy stage is unaffected',()=>{
    const h=setup('stage_river_lv1'),entry=outdoorGate(h.f)!;h.grid.set(entry.i,entry.j,FLOOR.pool);
    const g=h.spawn({i:5,j:5});h.guests.step();expect(g.outdoor).toBeUndefined();expect(g.state).toBe('wander');
    expect(outdoorContract('stage_river')).toBeNull();
  });
});

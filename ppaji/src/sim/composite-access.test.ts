import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { makeTestPpaji } from './test-helpers.js';
import { buildField, UNREACHABLE } from './nav.js';
import { compositeEntryTile } from './rig.js';

// Uses public deck/facility placement on the original natural map; no floor/occupancy bypass.
describe('authored composite entrance',()=>{
  it('20×12 playground fits permitted original water and a real guest walks to its authored deck entry',()=>{
    const g=new Game(1,undefined,{arrival:true});g.money=1e7;g.rank=5;g.openLand(5);g.unlocked.facilities.add('ppaji_playground');
    const area=makeTestPpaji(g,20,12,-12),t=area.tiles[0]!;
    const r=g.placeFacility('ppaji_playground',t.i,t.j,0);expect(r.ok).toBe(true);
    const f=g.facilities.byUid(r.uid!)!,entries=g.facilities.entryTiles(f,g.guests.walkable);
    expect(entries).toEqual([compositeEntryTile(f.defId,f.i,f.j,0)]);
    const field=buildField(g.grid,entries,g.guests.walkable);expect(field.at(48,23)).toBeLessThan(UNREACHABLE);
    const guest=g.guests.spawn(undefined,'entry');Object.assign(guest,{i:48,j:23,fromI:48,fromJ:23,progress:1,arrivalStep:undefined,target:{kind:'facility',uid:f.uid},state:'walk',hp:100});
    for(let k=0;k<600&&guest.state==='walk';k++)g.step();
    expect(guest.state).toBe('use');expect({i:guest.i,j:guest.j}).toEqual(entries[0]);
    expect(guest.target).toEqual({kind:'facility',uid:f.uid});
  });
});

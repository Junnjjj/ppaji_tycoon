import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { FacilityStore, guestWalkable } from './facility.js';
import { Grid, FLOOR } from './grid.js';
import { adoptApprovedDocks } from './approved-docks.js';

describe('approved dock migration', () => {
  it('reuses existing deck, preserves identity/accounting and is idempotent without terrain changes', () => {
    const grid = new Grid(12,12);
    grid.set(5,5,FLOOR.deck); grid.set(5,4,FLOOR.deck);
    const facilities = new FacilityStore(grid,FACILITY_DEFS);
    const old = facilities.place('dock',5,5,0)!;
    old.usesTotal=37; old.incomeTotal=2400;
    const floor=Array.from(grid.floor), levels=Array.from(grid.levels);
    expect(adoptApprovedDocks(facilities,grid)).toBe(1);
    expect(facilities.byUid(old.uid)).toMatchObject({defId:'boarding_dock',usesTotal:37,incomeTotal:2400});
    expect(guestWalkable(grid,facilities,5,5)).toBe(true);
    expect(guestWalkable(grid,facilities,5,4)).toBe(true);
    expect(adoptApprovedDocks(facilities,grid)).toBe(0);
    expect(Array.from(grid.floor)).toEqual(floor); expect(Array.from(grid.levels)).toEqual(levels);
  });
  it('keeps a legacy berth if no two free level deck cells exist', () => {
    const grid=new Grid(12,12); grid.set(5,5,FLOOR.deck); grid.set(5,4,FLOOR.deck);
    const facilities=new FacilityStore(grid,FACILITY_DEFS);
    const old=facilities.place('dock',5,5,0)!;
    facilities.place('env_bench',5,4,0);
    expect(adoptApprovedDocks(facilities,grid)).toBe(0);
    expect(facilities.byUid(old.uid)?.defId).toBe('dock');
  });
  it('a course bound to the second dock cell supplies nearby package demand',()=>{
    const g=new Game(1,undefined,{arrival:true});g.money=1e7;
    const dock=g.facilities.all.find(f=>f.defId==='boarding_dock')!;
    const suggested=g.suggestCourse({i:dock.i,j:dock.j});expect(suggested.ok).toBe(true);
    if(!suggested.ok)throw Error(suggested.reason);
    expect(suggested.draft.dock).not.toEqual({x:dock.i,y:dock.j});
    expect(g.placeCourse(suggested.draft).ok).toBe(true);
    const seat=g.facilities.place('env_bench',dock.i-2,dock.j-2,0);
    expect(g.radiusNeedsOf(seat.uid)?.dock).toBe(true);
    const saved=g.toSnapshot(),back=Game.fromSnapshot(saved);
    expect(back.radiusNeedsOf(seat.uid)?.dock).toBe(true);
    expect(back.courses.toSnapshot()).toEqual(g.courses.toSnapshot());
  });
  it('new arrival maps use a traversable approved berth and preserve it through save/load', () => {
    const g=new Game(1,undefined,{arrival:true});
    const docks=g.facilities.all.filter(f=>f.defId==='boarding_dock');
    expect(docks.length).toBeGreaterThan(0);
    for(const f of docks) {
      expect(FacilityStore.footprint(g.facilities.defOf(f),f.i,f.j,f.facing).every(t=>guestWalkable(g.grid,g.facilities,t.i,t.j))).toBe(true);
    }
    const snap=g.toSnapshot(), back=Game.fromSnapshot(snap);
    expect(back.facilities.all.filter(f=>f.defId==='boarding_dock')).toEqual(docks);
    expect(back.courses.toSnapshot()).toEqual(g.courses.toSnapshot());
    expect(Array.from(back.grid.floor)).toEqual(Array.from(g.grid.floor));
    expect(Array.from(back.grid.levels)).toEqual(Array.from(g.grid.levels));
  });
});

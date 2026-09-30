import {describe,it,expect} from 'vitest';
import {Game} from './game.js';
import {FLOOR} from './grid.js';
import {facilityPadding,reservedBounds} from './facility-spacing.js';

describe('reviewed facility reservation spacing',()=>{
 it('adds 1 to small facilities and 3 to seven lodgings, excluding water and connecting fences',()=>{
  const g=new Game(1);for(const id of ['vending_in','arcade','toilet'])expect(facilityPadding(g.facilities.def(id)!)).toBe(1);
  for(const id of ['caravan','bungalow','camp_site','glamping','pension_1f','pension_2f','pension'])expect(facilityPadding(g.facilities.def(id)!)).toBe(3);
  expect(facilityPadding({id:'boarding_dock'})).toBe(0);expect(facilityPadding({id:'env_wood_fence'})).toBe(0);
 });
 it('rejects adjacent construction and moving into clearance while leaving navigation and saved art contacts intact',()=>{
  const g=new Game(1,undefined,{kit:false});g.facilities.spacingEnabled=true;
  for(let j=10;j<17;j++)for(let i=30;i<40;i++)g.grid.set(i,j,FLOOR.path);
  const def=g.facilities.def('toilet')!,f=g.facilities.place('toilet',31,11,0);
  expect(f.padding).toBe(1);expect(reservedBounds(def,31,11,0)).toEqual({i0:30.5,j0:10.5,w:3,h:3});
  expect(g.canPlace('toilet',33,11)).toMatchObject({ok:false,reason:expect.stringContaining('여백')});expect(g.canPlace('toilet',34,11).ok).toBe(true);
  const second=g.facilities.place('toilet',37,11,0);g.tools.add('move');
  expect(g.canMoveFacility(second.uid,33,11,0)).toMatchObject({ok:false,reason:expect.stringContaining('여백')});
  g.facilities.place('pension',31,17,0);
  expect(g.canPlace('pension',37,17,0,{inherited:true})).toMatchObject({ok:false,reason:expect.stringContaining('여백')});
  expect(g.canPlace('pension',39,17,0,{inherited:true}).ok).toBe(true);
  expect(g.facilities.occupied(33,11)).toBe(false);expect(g.guests.walkable(33,11)).toBe(true);
  const s=g.toSnapshot(),restored=Game.fromSnapshot(s);expect(restored.facilities.byUid(f.uid)).toEqual(f);
  delete s.facilities.list[0]!.padding;const legacy=Game.fromSnapshot(s);expect(legacy.facilities.byUid(f.uid)?.padding).toBeUndefined();expect(legacy.facilities.byUid(f.uid)?.i).toBe(31);
 });
});

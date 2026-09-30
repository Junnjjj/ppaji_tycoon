import {describe,it,expect} from 'vitest';
import {Game} from '../sim/game.js';
import {migrate,save,load,SAVE_KEY,SAVE_VERSION} from './save.js';
import {storageKeys} from './storage-keys.js';
import {createStartupGame} from '../editor/new-game.js';

describe('main/editor integration',()=>{
  it('keeps main storage keys and isolates editor and play-test saves',()=>{
    expect(SAVE_KEY).toBe('pj.save');
    expect(storageKeys('')).toEqual({save:'pj.save',profile:'pj.profile'});
    expect(storageKeys('?editor=0').save).toBe('pj.save');
    for(const query of ['?editor=1','?mapTest=1'])expect(storageKeys(query).save).toBe('ppaji.map-editor.sandbox.save');
  });
  it('v5 96x72 saves retain all existing terrain, heights, natural land, money and facility positions',()=>{
    const old=new Game(20260902,undefined,{kit:true,arrival:true}).toSnapshot();
    old.grid.h=72;for(const key of ['floor','levels','natural'] as const)old.grid[key]=old.grid[key]!.slice(0,96*72);
    old.money=37891;old.clock.day=12;old.grid.floor[65*96+10]=12;old.grid.levels![65*96+10]=2;old.grid.natural![65*96+10]=14;
    const input={version:5,savedAt:'old',game:old},copy=structuredClone(input),file=migrate(input)!;
    expect(file.version).toBe(6);expect(input).toEqual(copy);
    const g=Game.fromSnapshot(file.game);
    for(const key of ['floor','levels','natural'] as const)expect(Array.from(g.grid[key]).slice(0,96*72)).toEqual(old.grid[key]);
    expect(g.money).toBe(37891);expect(g.day).toBe(12);
    expect(g.facilities.all.map(f=>[f.uid,f.defId,f.i,f.j])).toEqual(old.facilities.list.map(f=>[f.uid,f.defId,f.i,f.j]));
    expect(g.grid.h).toBe(120);expect(g.grid.at(10,100)).toBe(1);
    const raw=new Map<string,string>(),storage={getItem:(k:string)=>raw.get(k)??null,setItem:(k:string,v:string)=>{raw.set(k,v);}};
    save(g.toSnapshot(),storage);expect(load(storage)!.version).toBe(SAVE_VERSION);expect(Game.fromSnapshot(load(storage)!.game).money).toBe(37891);
    expect(()=>g.step(600)).not.toThrow();
  });
  it('direct snapshot restores also extend legacy height/natural arrays',()=>{
    const s=new Game(1).toSnapshot();s.grid.h=72;
    for(const key of ['floor','levels','natural'] as const)s.grid[key]=s.grid[key]!.slice(0,6912);
    s.grid.levels![6000]=3;s.grid.natural![6000]=14;
    const g=Game.fromSnapshot(s);expect(g.grid.levels[6000]).toBe(3);expect(g.grid.natural[6000]).toBe(14);
  });
  it('new games get the reviewed map but reference/no-kit modes remain available',()=>{
    const g=createStartupGame(20260902,true,true,true);
    expect(g.facilities.all.some(f=>f.defId==='cafe')).toBe(true);
    expect(g.grid.at(48,85)).toBe(5);expect(g.money).toBe(12000);
    expect(createStartupGame(20260902,false,true,true).facilities.all.length).toBeLessThan(g.facilities.all.length);
    expect(createStartupGame(20260902,true,false,true).facilities.all.some(f=>f.defId==='cafe')).toBe(false);
    expect(()=>g.step(1200)).not.toThrow();
  });
});

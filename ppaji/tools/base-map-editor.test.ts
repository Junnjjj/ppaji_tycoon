import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FACILITY_DEFS } from '../src/sim/game.js';
import { captureMap, parseMap, applyMap, protectedTiles } from '../src/editor/document.js';
const fresh=()=>new Game(20260902,undefined,{kit:true,arrival:true});
test('current base map survives JSON round trip and maintains entrance passage',()=>{
  const a=fresh(),doc=captureMap(a,'테스트 맵'),b=fresh();
  applyMap(b,parseMap(JSON.parse(JSON.stringify(doc)),b));
  assert.deepEqual(captureMap(b,'테스트 맵'),doc);
  const entrance=b.facilities.all.find(f=>f.defId==='entrance');
  if(entrance)assert.equal(b.facilities.occupied(entrance.i,entrance.j),false);
  assert.doesNotThrow(()=>b.step(300));
});
test('terrain, height and facility edits survive gameplay bootstrap',()=>{
  const a=fresh();const protectedSet=protectedTiles(a);
  const k=a.grid.floor.findIndex((_,k)=>k>1500&&!protectedSet.has(k)&&!a.facilities.occupied(k%a.grid.w,Math.floor(k/a.grid.w)));
  a.grid.set(k%a.grid.w,Math.floor(k/a.grid.w),1);a.grid.setNatural(k%a.grid.w,Math.floor(k/a.grid.w),1);a.grid.setLevel(k%a.grid.w,Math.floor(k/a.grid.w),2);
  let placed=false;
  for(const d of FACILITY_DEFS.values()) {if(d.class!=='decor'||d.deprecated||d.derived)continue;for(let j=11;j<30&&!placed;j++)for(let i=30;i<65&&!placed;i++){if(a.canPlace(d.id,i,j,1,{inherited:true}).ok){placed=a.placeFacility(d.id,i,j,1,{inherited:true,autoPath:false}).ok;}}if(placed)break;}
  assert.equal(placed,true);
  const doc=parseMap(captureMap(a,'수정 맵'),fresh()),b=fresh();applyMap(b,doc);
  assert.deepEqual(captureMap(b,'수정 맵'),doc);assert.equal(b.grid.levels[k],2);assert.doesNotThrow(()=>b.step(600));
});
test('rejects malformed maps, out-of-bounds facilities and protected entrance edits',()=>{
  const g=fresh();
  for(const change of [(d:ReturnType<typeof captureMap>)=>d.grid.floor.pop(),(d:ReturnType<typeof captureMap>)=>d.grid.levels[2000]=99,(d:ReturnType<typeof captureMap>)=>d.facilities.list[0]!.i=-999,(d:ReturnType<typeof captureMap>)=>d.facilities.list[0]!.defId='unknown',(d:ReturnType<typeof captureMap>)=>d.grid.floor[0]=5,(d:ReturnType<typeof captureMap>)=>d.facilities.nextUid=1,(d:ReturnType<typeof captureMap>)=>d.grid.floor[2000]=4]){
    const d=captureMap(g,'invalid');change(d);assert.throws(()=>parseMap(d,g));
  }
});
test('restoring snapshots for undo/redo does not alias or mutate saved history',()=>{
  const g=fresh(),before=captureMap(g,'before');g.grid.set(10,30,12);const after=captureMap(g,'after');
  applyMap(g,before);assert.deepEqual(captureMap(g,'before'),before);applyMap(g,after);assert.deepEqual(captureMap(g,'after'),after);
  g.facilities.all[0]!.incomeTotal=99;assert.notEqual(after.facilities.list[0]!.incomeTotal,99);
});

test('garden starter preserves protected topology and survives gameplay',async()=>{
  const {gardenMap}=await import('../src/editor/garden.js');
  const base=fresh(),before=captureMap(base,'original'),doc=gardenMap(base);
  assert.deepEqual(captureMap(base,'original'),before);
  const parsed=parseMap(JSON.parse(JSON.stringify(doc)),base);
  const game=fresh();applyMap(game,parsed);
  assert.ok(game.facilities.all.some(f=>f.defId==='cafe'));
  assert.deepEqual(captureMap(game,doc.name),doc);
  assert.doesNotThrow(()=>game.step(1200));
});

test('legacy 96x72 drafts expand without changing authored tiles or the input',()=>{
  const base=fresh(),doc=captureMap(base,'legacy');doc.grid.h=72;
  for(const key of ['floor','levels','natural'] as const)doc.grid[key]=doc.grid[key].slice(0,96*72);
  doc.grid.floor[30*96+10]=12;const before=structuredClone(doc);
  const upgraded=parseMap(doc,base);assert.equal(upgraded.grid.h,120);assert.deepEqual(doc,before);
  for(const key of ['floor','levels','natural'] as const)assert.deepEqual(upgraded.grid[key].slice(0,96*72),doc.grid[key]);
});

test('wide river retains a dry far bank and triples each reference cross-section',async()=>{
  const {gardenMap}=await import('../src/editor/garden.js');const g=fresh();applyMap(g,gardenMap(g));
  for(const [i,north,width] of [[0,44,48],[48,24,66],[95,34,48]]){
    for(let j=north!;j<north!+width!;j++)assert.ok([4,5,6,7].includes(g.grid.at(i!,j)),`${i},${j} must be water or dock`);
    assert.ok([0,1].includes(g.grid.at(i!,north!+width!)));
  }
});

test('exterior follows all edited edges and keeps both road lanes continuous',async()=>{
  const {exteriorTile,exteriorSignature}=await import('../src/render/exterior.js');const {gardenMap}=await import('../src/editor/garden.js');
  const g=fresh();applyMap(g,gardenMap(g));const grid=g.grid;
  for(let j=0;j<grid.h;j++)for(const [inside,outside] of [[0,-1],[grid.w-1,grid.w]])assert.equal(exteriorTile(grid,outside!,j,true).floor,grid.at(inside!,j));
  for(let i=0;i<grid.w;i++)assert.equal(exteriorTile(grid,i,grid.h,true).floor,grid.at(i,grid.h-1));
  for(let i=-120;i<220;i++)for(const j of [-2,-1])assert.equal(exteriorTile(grid,i,j,true).floor,13);
  const before=exteriorSignature(grid,true);grid.set(0,40,5);assert.notEqual(exteriorSignature(grid,true),before);assert.equal(exteriorTile(grid,-8,40,true).floor,5);
});

test('all garden facilities and waterfront destinations remain reachable from entrance',async()=>{
  const {gardenMap}=await import('../src/editor/garden.js');const {FacilityStore}=await import('../src/sim/facility.js');
  const g=fresh();applyMap(g,gardenMap(g));const seen=new Set<number>(),q=[g.gate];seen.add(g.gate.j*g.grid.w+g.gate.i);
  for(let h=0;h<q.length;h++){const p=q[h]!;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const i=p.i+di!,j=p.j+dj!,k=j*g.grid.w+i;if(!seen.has(k)&&g.grid.inside(i,j)&&g.guests.walkable(i,j)&&g.grid.canCross(p.i,p.j,i,j)){seen.add(k);q.push({i,j});}}}
  for(const f of g.facilities.all)assert.ok(FacilityStore.ring(FACILITY_DEFS.get(f.defId)!,f.i,f.j,f.facing).some(t=>seen.has(t.j*g.grid.w+t.i)),`${f.defId} ${f.i},${f.j} inaccessible`);
  for(const [i,j] of [[48,0],[48,20],[48,23],[58,24],[29,24]])assert.ok(seen.has(j!*g.grid.w+i!));
});

test('town pedestrian loops use connected sidewalks and vehicles stop on red',async()=>{
  const {townWalkingLoop,townWalkable,advanceTownVehicle,TOWN_CROSSINGS}=await import('../src/render/town-layout.js');
  for(let n=0;n<10;n++){const route=townWalkingLoop(n);for(let k=0;k<route.length;k++){const a=route[k]!,b=route[(k+1)%route.length]!;for(let t=0;t<=1;t+=.02)assert.ok(townWalkable(a.i+(b.i-a.i)*t,a.j+(b.j-a.j)*t));}}
  for(const crossing of TOWN_CROSSINGS){
    assert.equal(advanceTownVehicle(crossing-1.6,4.5,100,false),crossing-1.5);
    assert.equal(advanceTownVehicle(crossing+3.1,-3,100,false),crossing+3);
    assert.ok(advanceTownVehicle(crossing-1.6,4.5,100,true)>crossing-1.5);
  }
});

test('woodland IDs and positions are stable and crowns keep diagonal clearance',async()=>{
  const {woodlandLayout,woodlandSeparated}=await import('../src/render/woodland-layout.js');
  const plants=woodlandLayout(96,120);
  assert.deepEqual(woodlandLayout(96,120),plants);
  assert.equal(new Set(plants.map(p=>p.id)).size,plants.length);
  for(let a=0;a<plants.length;a++)for(let b=a+1;b<plants.length;b++){
    assert.ok(woodlandSeparated(plants[a]!,plants[b]!),`${plants[a]!.id} / ${plants[b]!.id}`);
  }
  const expanded=new Map(woodlandLayout(120,144).map(p=>[p.id,p]));
  for(const plant of plants.filter(p=>p.i<90))assert.deepEqual(expanded.get(plant.id),plant);
});


test('wall planting stays continuous while overlapping standalone planters are removed',async()=>{
  const {buildGarden}=await import('../src/render/compact-boundary.js');
  const {removeOverlappingPlanters,overlapsWallGarden}=await import('../src/editor/boundary-decor.js');
  const walls=[10,11,12].map(i=>({i,j:10,d:2,door:false}));
  assert.deepEqual(buildGarden(walls,new Set(['10,10','11,10','12,10'])).map(g=>g.kind),['garden_end','garden','garden_end']);
  const g=fresh();assert.equal(overlapsWallGarden(g,'env_long_flowerbed',55,21,0),true);
  assert.equal(overlapsWallGarden(g,'env_flower_pot',54,19,0),true);
  assert.equal(overlapsWallGarden(g,'env_long_flowerbed',42,18,0),false);
  const before=g.facilities.all.length,removed=removeOverlappingPlanters(g);
  assert.ok(removed.length>0);assert.equal(g.facilities.all.length,before-removed.length);
  assert.deepEqual(removeOverlappingPlanters(g),[]);
});

test('far-bank beaches follow the river, preserve water extent, and are idempotent',async()=>{
  const {gardenMap}=await import('../src/editor/garden.js');const {refineSouthBank}=await import('../src/editor/shoreline.js');
  const g=fresh();applyMap(g,gardenMap(g));const before=captureMap(g,'shore');
  assert.equal(refineSouthBank(g),0);assert.deepEqual(captureMap(g,'shore'),before);
  const widths=[];
  for(let i=0;i<96;i++){let last=-1;for(let j=60;j<120;j++)if([5,6].includes(g.grid.at(i,j)))last=j;let w=0;while(last+1+w<120&&g.grid.at(i,last+1+w)===0)w++;widths.push(w);}
  assert.equal(widths[22],5);assert.equal(widths[44],0);assert.equal(widths[67],4);
  assert.ok(new Set(widths).size>=5);
});

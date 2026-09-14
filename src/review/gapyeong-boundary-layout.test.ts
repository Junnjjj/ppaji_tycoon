import { describe, expect, it } from 'vitest';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid } from '../sim/kairo/walls.js';
import { bakeIndoorWalls } from '../sim/kairo/indoor.js';
import { boundaryEdgeKey, environmentReachable, validateEnvironmentLayout, type EnvironmentTile } from './gapyeong-boundary-layout.js';

describe('Gapyeong environment proposal integration',()=>{
  it('outdoor tile fence survives an indoor rebake and guests still pass through both entrances',()=>{
    const t=new KairoTerrain(16,16),walls=new WallGrid(16,16);
    for(let j=0;j<16;j++)for(let i=0;i<16;i++)t.paint(i,j,'path_stone');
    for(let j=7;j<10;j++)for(let i=6;i<10;i++)t.paint(i,j,'floor_indoor');
    const fence:EnvironmentTile[]=[];
    for(let i=2;i<=13;i++)for(const j of [3,12])fence.push({id:`edge-${i}-${j}`,i,j,w:1,h:1,facing:0,mode:i===7&&j===3?'portal':'blocking'});
    for(let j=4;j<12;j++)for(const i of [2,13])fence.push({id:`edge-${i}-${j}`,i,j,w:1,h:1,facing:1,mode:'blocking'});
    const before=JSON.stringify(fence);
    expect(bakeIndoorWalls(t,walls,{i:0,j:0}).ok).toBe(true);
    expect(validateEnvironmentLayout(fence,16,16)).toEqual([]);
    const walk=()=>environmentReachable(16,16,walls,fence,{i:7,j:0},()=>true);
    expect(walk()[8*16+8]).toBe(1);
    t.paint(10,8,'floor_indoor');bakeIndoorWalls(t,walls,{i:0,j:0});
    expect(JSON.stringify(fence)).toBe(before);expect(walk()[8*16+10]).toBe(1);
    const closed=fence.map(f=>f.mode==='portal'?{...f,mode:'blocking' as const}:f);
    expect(environmentReachable(16,16,walls,closed,{i:7,j:0},()=>true)[8*16+8]).toBe(0);
  });
  it('rotated gate blocks sideways traversal and rejects a planter occupying its opening',()=>{
    const gate:EnvironmentTile={id:'gate',i:2,j:2,w:1,h:1,facing:1,mode:'portal'};
    const can=(_i:number,j:number)=>j===2;
    expect(environmentReachable(5,5,new WallGrid(5,5),[gate],{i:0,j:2},can)[2*5+4]).toBe(1);
    expect(environmentReachable(5,5,new WallGrid(5,5),[{...gate,facing:0}],{i:0,j:2},can)[2*5+4]).toBe(0);
    expect(validateEnvironmentLayout([gate,{...gate,id:'planter',mode:'blocking'}],5,5)[0]).toContain('overlaps');
  });
  it('opposing views share the same physical edge key',()=>{
    expect(boundaryEdgeKey(4,5,0)).toBe(boundaryEdgeKey(5,5,2));
    expect(boundaryEdgeKey(4,5,1)).toBe(boundaryEdgeKey(4,6,3));
  });
});

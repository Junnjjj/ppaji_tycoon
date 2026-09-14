import config from '../../data/kairo-arrival-presentation.json' with { type: 'json' };
import { KairoTerrain } from './terrain.js';
import { PlacementGrid, facilityDef, guestWalkable, type FacilityFacing } from './placement.js';
import { WallGrid, reachable } from './walls.js';
import { DoorSet, type DoorSnapshot } from './doors.js';
import { bakeIndoorWalls, indoorAreas } from './indoor.js';
export { config as ARRIVAL_PRESENTATION };

export function refreshArrivalPresentation(input: {
  terrain: KairoTerrain; walls: WallGrid; placement: PlacementGrid;
  gate: { i:number; j:number }; doors?: DoorSnapshot;
}) {
  const original = { ...input, doors: input.doors ?? {keys:[]}, changed:false, reason:'', decorAdded:0 };
  const {gate} = input;
  const room = { i: gate.i - Math.floor(config.indoor.width/2), j: gate.j + config.indoor.topFromGate,
    w:config.indoor.width, h:config.indoor.depth };
  const right=room.i+room.w-1, bottom=room.j+room.h-1;
  const area = indoorAreas(input.terrain), roomArea = area[room.j*input.terrain.width+gate.i];
  if (roomArea === undefined || roomArea < 0) return {...original,reason:'기존 입구 실내가 없습니다'};
  for(let j=0;j<input.terrain.height;j++) for(let i=0;i<input.terrain.width;i++)
    if(area[j*input.terrain.width+i]===roomArea && (i<room.i||i>right||j<room.j||j>bottom))
      return {...original,reason:'사용자가 확장한 실내를 보존했습니다'};
  const terrain=KairoTerrain.fromSnapshot(input.terrain.toSnapshot());
  const walls=WallGrid.fromSnapshot(input.walls.toSnapshot());
  const snapshot=input.placement.toSnapshot();
  const managed=new Set(config.managedDecor.map(k=>`env_${k}`));
  let placement=PlacementGrid.fromSnapshot({...snapshot,items:snapshot.items.filter(f=>!(f.arrivalDecoration
    && f.arrivalDecoration.defId===f.defId && f.arrivalDecoration.i===f.i && f.arrivalDecoration.j===f.j
    && f.arrivalDecoration.facing===(f.facing??0) && managed.has(f.defId)
    && Math.abs(f.i-gate.i)<=13 && f.j>=gate.j && f.j<=gate.j+24))});
  const safePaint=(i:number,j:number,kind:string):boolean=>{
    if(!terrain.isBuildable(i,j)||!terrain.isWalkable(i,j)||terrain.levelAt(i,j)!==0)return false;
    if(placement.handleAt(i,j)&&!input.terrain.isIndoor(i,j))return false;
    terrain.paint(i,j,kind);return true;
  };
  for(let j=room.j;j<=bottom;j++)for(let i=room.i;i<=right;i++)
    if(!safePaint(i,j,'floor_indoor'))return {...original,reason:'실내 확장 위치의 시설 또는 지형을 보존했습니다'};
  // A continuous patio, with benches backed by planting beds and a clear central exit.
  for(let j=bottom+1;j<=bottom+config.patio.depth;j++)for(let i=room.i-config.patio.sideWidth;i<=right+config.patio.sideWidth;i++)
    if(!safePaint(i,j,'path_stone'))return {...original,reason:'실내 앞 보행 공간에 다른 시설이 있습니다'};
  for(const side of [-1,1])for(let j=room.j+1;j<=bottom;j++)for(let n=1;n<=config.patio.sideWidth;n++)
    if(!safePaint(side<0?room.i-n:right+n,j,'path_stone'))return {...original,reason:'실내 옆 보행 공간에 다른 시설이 있습니다'};
  const doors=DoorSet.fromSnapshot(input.doors);
  for(let j=room.j;j<=bottom;j++)for(let i=room.i;i<=right;i++)for(const d of [0,1,2,3] as const)doors.remove(i,j,d);
  doors.add(gate.i,room.j,3);doors.add(gate.i,bottom,1);
  const baked=bakeIndoorWalls(terrain,walls,gate,guestWalkable(terrain,placement),doors);
  if(!baked.ok)return {...original,reason:`실내 확장 연결 실패: ${baked.fail}`};
  let decorAdded=0;
  const put=(kind:string,i:number,j:number,facing:FacilityFacing=0)=>{
    const defId=`env_${kind}`,def=facilityDef(defId)!;
    const tiles=PlacementGrid.footprintTiles(def,i,j,facing);
    const aisleHalf=Math.floor(config.patio.clearAisleWidth/2);
    if(tiles.some(([x,y])=>terrain.isIndoor(x,y)||Math.abs(x-gate.i)<=aisleHalf&&y>=bottom&&y<=bottom+config.patio.depth))return;
    const result=placement.check(terrain,walls,gate,defId,i,j,{facing});
    if(!result.ok&&result.fail!=='unreachable')return;
    const s=placement.toSnapshot();
    placement=PlacementGrid.fromSnapshot({...s,next:s.next+1,items:[...s.items,{handle:s.next,defId,i,j,facing,
      arrivalDecoration:{defId,i,j,facing}}]});decorAdded++;
  };
  for(const module of config.wallModules){
    const along=module.along<0?config.indoor.width+module.along:module.along;
    const i=module.edge==='west'?room.i-module.outward:module.edge==='east'?right+module.outward:room.i+along;
    const j=module.edge==='south'?bottom+module.outward:room.j+module.along;
    put(module.kind,i,j,module.facing as FacilityFacing);
  }
  // Small planting groups complement the wall modules; no isolated bench grid on the lawn.
  for(const side of [-1,1]){
    const edge=side<0?room.i:right;
    put('flower_pot',gate.i+side*3,room.j-1);
    put('deciduous',edge+side*4,room.j+3);
    put('shrubs',edge+side*3,room.j+5);
    put('pine',edge+side*5,bottom+1);
    put('rocks',edge+side*4,bottom+4);
    let shore=bottom+config.patio.depth+1;
    while(shore<terrain.height&&!terrain.isWater(edge,shore))shore++;
    put('willow',edge+side*2,shore-5);
    put('shrubs',edge+side*2,shore-3);
  }
  const walk=guestWalkable(terrain,placement),open=reachable(terrain,walls,gate,walk);
  const blocked=Object.assign((i:number,j:number)=>!(i===gate.i&&j===gate.j+1)&&walk(i,j),{canCross:walk.canCross});
  const shut=reachable(terrain,walls,gate,blocked);
  for(const j of [room.j,bottom,bottom+1])if(!open[j*terrain.width+gate.i]||shut[j*terrain.width+gate.i])
    return {...original,reason:'장식 배치 후 매표소/실내 동선이 달라졌습니다'};
  return {terrain,walls,placement,gate,doors:doors.toSnapshot(),changed:true,reason:'',decorAdded};
}

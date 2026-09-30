import { Game, FACILITY_DEFS } from '../sim/game.js';
import { FacilityStore } from '../sim/facility.js';
import { isIndoorCode } from '../sim/grid.js';

/** The continuous wall garden owns its border. Separate planters need a clear tile. */
export function overlapsWallGarden(game:Game,id:string,i:number,j:number,facing:0|1):boolean {
  if(!['env_flower_pot','env_long_flowerbed'].includes(id))return false;
  const def=FACILITY_DEFS.get(id);if(!def)return false;
  for(const p of FacilityStore.footprint(def,i,j,facing))for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
    const x=p.i+di,y=p.j+dj;
    if(isIndoorCode(game.grid.at(x,y))&&[[0,-1],[-1,0],[0,1],[1,0]].some(([a,b])=>!isIndoorCode(game.grid.at(x+a!,y+b!))))return true;
  }
  return false;
}
export function removeOverlappingPlanters(game:Game):number[] {
  const removed:number[]=[];
  for(const f of [...game.facilities.all])if(overlapsWallGarden(game,f.defId,f.i,f.j,f.facing)){game.facilities.remove(f.uid);removed.push(f.uid);}
  return removed;
}

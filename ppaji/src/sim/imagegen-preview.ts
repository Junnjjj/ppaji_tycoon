/** Optional, unsaved main-scene preview. Uses normal placement and actual guest visits. */
import type { Game } from './game.js';
import { FACILITY_DEFS } from './game.js';
import { isIndoorCode } from './grid.js';
export function populateImagegenPreview(game:Game):number[]{
  const placed:number[]=[];
  for(const id of ['sauna','dry_room','jjimjilbang','authored_massage_row','icecream','authored_sunbed_row']){
    const def=FACILITY_DEFS.get(id);if(!def)continue;
    let done=false;
    for(let j=9;j<23&&!done;j++)for(let i=39;i<58&&!done;i++){
      if(i<=game.gate.i+1&&i+def.w>=game.gate.i-1)continue;
      if(def.indoorOnly&&!isIndoorCode(game.grid.at(i,j)))continue;
      if(def.outdoorOnly&&isIndoorCode(game.grid.at(i,j)))continue;
      if(!game.canPlace(id,i,j,0,{inherited:true,frontage:true}).ok)continue;
      const result=game.placeFacility(id,i,j,0,{inherited:true,autoPath:false,frontage:true});
      if(result.ok&&result.uid){
        const f=game.facilities.byUid(result.uid)!;game.guests.invalidate();
        if(!game.facilities.entryTiles(f,game.guests.walkable).length){game.facilities.remove(result.uid);continue;}
        placed.push(result.uid);done=true;
      }
    }
  }
  game.guests.invalidate();
  for(const uid of [...placed,...game.facilities.all.filter(f=>f.defId==='foodcourt_seat').map(f=>f.uid)]){
    const facility=game.facilities.byUid(uid)!;
    const gate=game.facilities.entryTiles(facility,game.guests.walkable)[0];if(!gate)continue;
    const guest=game.guests.spawn();
    Object.assign(guest,{i:gate.i,j:gate.j,fromI:gate.i,fromJ:gate.j,progress:1,state:'walk',target:{kind:'facility',uid},arrivalStep:999,preparationStep:3});
  }
  return placed;
}

import { removeOverlappingPlanters } from './boundary-decor.js';
import { refineSouthBank } from './shoreline.js';
import { Game } from '../sim/game.js';
import { FLOOR, isWaterCode, shoreRow } from '../sim/grid.js';
import { captureMap, parseMap, protectedTiles, type MapDocument } from './document.js';

/** A reproducible editor starter; existing browser drafts remain untouched. */
export function gardenMap(base: Game): MapDocument {
  const g=new Game(base.seed,undefined,{kit:true,arrival:true});
  const locked=protectedTiles(base);
  const knots=[[0,44],[14,44],[27,37],[38,28],[44,24],[59,24],[64,25],[76,39],[86,41],[95,34]];
  const bank=(i:number)=>{let n=0;while(n<knots.length-2&&i>knots[n+1]![0]!)n++;const a=knots[n]!,b=knots[n+1]!,t=Math.max(0,Math.min(1,(i-a[0]!)/(b[0]!-a[0]!)));return Math.round(a[1]!+(b[1]!-a[1]!)*t*t*(3-2*t));};
  // Keep the central swimming enclosure and landing intact; shape the outer river bends.
  for(let i=0;i<g.grid.w;i++) {
    const north=i>=38&&i<=65?shoreRow(i):bank(i);
    const width=3*Math.round(16+6*(i<38?Math.min(1,i/38):i<=65?1:Math.max(0,(95-i)/30)));
    for(let j=8;j<g.grid.h;j++) {
      const k=j*g.grid.w+i,old=g.grid.at(i,j);
      if(locked.has(k)||g.facilities.occupied(i,j)||old===FLOOR.deck)continue;
      if(j>=north&&j<north+width){g.grid.set(i,j,j<north+2||j>=north+width-1?FLOOR.shallow:FLOOR.river);g.grid.setLevel(i,j,0);g.grid.setNatural(i,j,g.grid.at(i,j));}
      else if(isWaterCode(old)){g.grid.set(i,j,FLOOR.grass);g.grid.setNatural(i,j,FLOOR.grass);g.grid.setLevel(i,j,0);}
      else if(old===FLOOR.path&&j>25){g.grid.set(i,j,FLOOR.grass);g.grid.setNatural(i,j,FLOOR.grass);}
    }
    const neighborBank=(x:number)=>x>=38&&x<=65?shoreRow(x):bank(Math.max(0,Math.min(g.grid.w-1,x)));
    for(let j=Math.min(north,neighborBank(i-1),neighborBank(i+1))-2;j<north;j++)if(!locked.has(j*g.grid.w+i)&&!g.facilities.occupied(i,j)){g.grid.set(i,j,FLOOR.sandpath);g.grid.setLevel(i,j,0);}
  }
  // Group services against the back wall and leave the central entrance aisle clear.
  for(const f of [...g.facilities.all])if(['indoor_shop','toilet','vending_out'].includes(f.defId))g.facilities.remove(f.uid);
  const put=(id:string,i:number,j:number,facing:0|1=0)=>{const indoor=g.grid.at(i,j)===FLOOR.indoor; for(let radius=0;radius<=3;radius++)for(let dj=-radius;dj<=radius;dj++)for(let di=-radius;di<=radius;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==radius||(g.grid.at(i+di,j+dj)===FLOOR.indoor)!==indoor)continue; const r=g.placeFacility(id,i+di,j+dj,facing,{inherited:true,autoPath:false});if(r.ok)return;}throw new Error(`조경 배치 공간 부족: ${id} (${i},${j})`);};
  put('indoor_shop',40,9);put('toilet',55,8);put('vending_out',35,18);
  // The inherited east bench intersected the glass wall's planting strip.
  const eastBench=g.facilities.all.find(f=>f.defId==='env_bench'&&f.i===58&&f.j===12);
  if(eastBench){
    for(let j=16;j<=19;j++)for(let i=59;i<=61;i++)if(!locked.has(j*g.grid.w+i)&&!g.facilities.occupied(i,j))g.grid.set(i,j,FLOOR.path);
    g.facilities.move(eastBench.uid,60,17,eastBench.facing);
  }
  // Small seating islands give the large room a readable rhythm.
  for(const [i,j] of [[40,16],[44,16],[52,17]])put('env_bench',i!,j!);
  for(const [i,j] of [[39,15],[44,14],[55,16],[40,19],[54,19]])put('env_flower_pot',i!,j!);
  for(const [i,j] of [[40,18],[44,18]])put('env_long_flowerbed',i!,j!);
  // Landscape pockets outside the main room, framing the waterfront walk.
  for(const [i,j] of [[30,12],[30,18],[64,10],[64,16]])put('env_deciduous',i!,j!);
  for(const [i,j] of [[29,15],[32,17],[64,13],[65,20]])put('env_shrubs',i!,j!);
  // A small riverside cafe anchors the west bank instead of a lone vending machine.
  for(let j=23;j<=29;j++)for(let i=29;i<=35;i++){const k=j*g.grid.w+i;if(!locked.has(k)&&!g.facilities.occupied(i,j)&&!isWaterCode(g.grid.at(i,j))){g.grid.set(i,j,FLOOR.sandpath);g.grid.setLevel(i,j,0);}}
  put('cafe',30,24);put('env_bench',30,29);put('env_flower_pot',34,28);
  removeOverlappingPlanters(g);
  refineSouthBank(g);
  g.refreshMapForEditor();
  return parseMap(captureMap(g,'넓은 S자 강 · 숲속 빠지'),base);
}

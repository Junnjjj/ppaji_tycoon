import type { Game } from '../sim/game.js';
import { FLOOR } from '../sim/grid.js';

/** Shape two sandy coves on the far bank; leave grassy headlands between them.
 * Derive the shoreline from the edited river rather than a fixed row number. */
export function refineSouthBank(game:Game):number {
  const g=game.grid,knots=[[0,0],[10,2],[22,5],[35,1],[44,0],[54,1],[67,4],[80,2],[89,0],[95,1]];
  const width=(i:number)=>{let n=0;while(n<knots.length-2&&i>knots[n+1]![0]!)n++;const a=knots[n]!,b=knots[n+1]!,t=Math.max(0,Math.min(1,(i-a[0]!)/(b[0]!-a[0]!)));return Math.round(a[1]!+(b[1]!-a[1]!)*t*t*(3-2*t));};
  let changed=0;
  const set=(i:number,j:number,floor:typeof FLOOR.sand|typeof FLOOR.shallow|typeof FLOOR.river)=>{if(g.at(i,j)===floor)return;g.set(i,j,floor);g.setNatural(i,j,floor);g.setLevel(i,j,0);changed++;};
  for(let i=0;i<g.w;i++){
    let last=-1;for(let j=Math.floor(g.h/2);j<g.h;j++)if(g.at(i,j)===FLOOR.river||g.at(i,j)===FLOOR.shallow)last=j;
    if(last<0||last>=g.h-1)continue;
    const beach=width(i),shallows=beach>=3?3:beach>0?2:1;
    for(let j=Math.max(0,last-2);j<=last;j++)if(!game.facilities.occupied(i,j)&&[FLOOR.river,FLOOR.shallow].includes(g.at(i,j) as 5|6))set(i,j,j>last-shallows?FLOOR.shallow:FLOOR.river);
    for(let j=last+1;j<=Math.min(g.h-1,last+beach);j++){
      if(game.facilities.occupied(i,j)||![FLOOR.grass,FLOOR.sand].includes(g.at(i,j) as 0|1))break;
      set(i,j,FLOOR.sand);
    }
  }
  return changed;
}

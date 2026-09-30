import type { GameSnapshot } from './game.js';
import { GRID_W, GRID_H, FLOOR } from './grid.js';
/** Append dry land. Never repaint the player's existing river, paths or heights. */
export function expandSavedGrid(grid:GameSnapshot['grid']):GameSnapshot['grid'] {
  if(grid.w===GRID_W&&grid.h===GRID_H)return grid;
  if(grid.w!==96||grid.h!==72||GRID_W!==96||GRID_H!==120)throw new Error('지원하지 않는 저장 맵 크기입니다.');
  const old=96*72,total=GRID_W*GRID_H;
  if(grid.floor.length!==old)throw new Error('저장 맵 타일 수가 맞지 않습니다.');
  const extend=(a:number[]|undefined,fill:number):number[]=>{
    if(a&&a.length!==old)throw new Error('저장 맵 배열 크기가 맞지 않습니다.');
    return [...(a??Array(old).fill(fill)),...Array(total-old).fill(fill)];
  };
  return {...grid,h:GRID_H,floor:extend(grid.floor,FLOOR.grass),levels:extend(grid.levels,0),natural:extend(grid.natural,FLOOR.grass)};
}

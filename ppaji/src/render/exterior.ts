import { townFloor } from './town-layout.js';
import { type Grid, type FloorCode } from '../sim/grid.js';

/** Continue the actual map edge, not the historical row-50 river. */
export function exteriorTile(grid: Grid, i: number, j: number, compact: boolean): { floor: FloorCode; level: number } {
  if (compact && j < 0) return { floor: townFloor(i,j), level: 0 };
  const x=Math.max(0,Math.min(grid.w-1,i)),y=Math.max(0,Math.min(grid.h-1,j));
  return { floor:grid.at(x,y), level:grid.levelAt(x,y) };
}

export function exteriorSignature(grid: Grid, compact: boolean): string {
  const values=[Number(compact),grid.w,grid.h];
  for(let j=0;j<grid.h;j++)for(const i of [0,grid.w-1])values.push(grid.at(i,j),grid.levelAt(i,j));
  for(let i=0;i<grid.w;i++)for(const j of [0,grid.h-1])values.push(grid.at(i,j),grid.levelAt(i,j));
  return values.join(',');
}

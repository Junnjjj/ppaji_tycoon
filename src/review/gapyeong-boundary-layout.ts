import { WallGrid, type Dir } from '../sim/kairo/walls.js';
import { canonical } from '../sim/kairo/doors.js';

/** Candidate environment placement, deliberately independent of derived indoor walls. */
export interface EnvironmentTile {
  id: string;
  i: number;
  j: number;
  w: number;
  h: number;
  facing: Dir;
  mode: 'blocking' | 'portal' | 'background';
}

export function occupiedTiles(item: EnvironmentTile): [number, number][] {
  if (item.mode === 'background') return [];
  const [w, h] = item.facing % 2 ? [item.h, item.w] : [item.w, item.h];
  const result: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) result.push([item.i + x, item.j + y]);
  return result;
}

export function validateEnvironmentLayout(items: readonly EnvironmentTile[], width: number, height: number): string[] {
  const used = new Map<string, string>(), errors: string[] = [];
  for (const item of items) {
    if (item.mode === 'portal' && (item.w !== 1 || item.h !== 1)) errors.push(`${item.id}: portal must have a 1×1 clear cell`);
    for (const [i, j] of occupiedTiles(item)) {
      if (i < 0 || j < 0 || i >= width || j >= height) errors.push(`${item.id}: outside ${i},${j}`);
      const key = `${i},${j}`, other = used.get(key);
      if (other) errors.push(`${item.id}: overlaps ${other} at ${key}`);
      used.set(key, item.id);
    }
  }
  return errors;
}

/** Combine the actual indoor-wall traversal rule with candidate outdoor tile occupancy. */
export function environmentReachable(
  width: number, height: number, walls: WallGrid, items: readonly EnvironmentTile[],
  start: { i: number; j: number }, canStand: (i: number, j: number) => boolean,
  canCross: (i: number, j: number, ni: number, nj: number) => boolean = () => true,
): Uint8Array {
  const tiles = new Map<string, EnvironmentTile>();
  for (const item of items) for (const [i, j] of occupiedTiles(item)) tiles.set(`${i},${j}`, item);
  const inside = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < width && j < height;
  const stand = (i: number, j: number): boolean => inside(i,j) && canStand(i,j) && tiles.get(`${i},${j}`)?.mode !== 'blocking';
  const seen = new Uint8Array(width * height), queue: [number, number][] = [];
  if (stand(start.i, start.j)) {queue.push([start.i,start.j]);seen[start.j*width+start.i]=1;}
  for (let k=0;k<queue.length;k++) {
    const [i,j] = queue[k]!;
    for (const [di,dj] of [[1,0],[0,1],[-1,0],[0,-1]] as const) {
      const ni=i+di,nj=j+dj;
      if(!stand(ni,nj)||seen[nj*width+ni]||walls.blocksMove(i,j,ni,nj)||!canCross(i,j,ni,nj))continue;
      // The physical gate runs along local I; people pass through it along local J.
      const portalBlocked = [tiles.get(`${i},${j}`),tiles.get(`${ni},${nj}`)].some(t =>
        t?.mode==='portal' && (t.facing%2===0 ? di!==0 : dj!==0));
      if(portalBlocked)continue;
      seen[nj*width+ni]=1;queue.push([ni,nj]);
    }
  }
  return seen;
}

/** One edge identity shared by the two cells; avoids double posts in a candidate wall renderer. */
export function boundaryEdgeKey(i: number, j: number, dir: Dir): string {
  const e=canonical(i,j,dir);return `${e.i},${e.j},${e.dir}`;
}

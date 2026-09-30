/** Native authored contacts. Simulation remains on a walkable approach tile. */
import type { PlacedFacility } from './facility.js';
export const PREPARATION_IDS = ['compact_locker', 'compact_changing', 'compact_shower'] as const;
export interface PrepVisit {
  uid: number; slot: number; phase: 'approach' | 'entering' | 'using' | 'exiting';
  ticks: number; progress: number;
  approach: { i: number; j: number };
  path: [number, number][];
}
export function preparationSlots(f: PlacedFacility): { approach: {i:number;j:number}; path:[number,number][] }[] {
  const local: [number,number][][] = f.defId === 'compact_locker'
    ? [0,1,2,3].map(k=>[[k+.5,2.5],[k+.5,1.25]])
    : f.defId === 'compact_changing'
      ? [.565,1.435].map(j=>[[3.5,Math.floor(j)+.5],[3.4,j+.2],[2.5,j+.2],[2.05,j]])
      : [.6,1.5,2.4].map(i=>[[Math.floor(i)+.5,2.5],[i,2.4],[i,.6]]);
  // These fixed entrance modules are authored in facing zero; other directions
  // retain the normal facility behavior until corresponding contacts are authored.
  if(f.facing !== 0) return [];
  return local.map(points=>{const path=points.map(([i,j])=>[f.i+i,f.j+j] as [number,number]);return {approach:{i:Math.floor(path[0]![0]),j:Math.floor(path[0]![1])},path};});
}
export function prepLength(p: PrepVisit): number { return p.path.slice(1).reduce((s,b,k)=>s+Math.hypot(b[0]-p.path[k]![0],b[1]-p.path[k]![1]),0); }
export function prepPosition(p: PrepVisit): [number,number] {
  let remaining=prepLength(p)*(p.phase==='using'?1:p.phase==='exiting'?1-p.progress:p.progress);
  for(let k=1;k<p.path.length;k++){const a=p.path[k-1]!,b=p.path[k]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(remaining<=length)return[a[0]+(b[0]-a[0])*remaining/length,a[1]+(b[1]-a[1])*remaining/length];remaining-=length;}
  return p.path.at(-1)!;
}

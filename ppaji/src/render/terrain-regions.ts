import {gridToScreen} from './iso.js';
export type TerrainCell={i:number;j:number};
export type TerrainPolygon={x:number;y:number}[];
const key=(i:number,j:number)=>`${i},${j}`;
/** Union corners only: tile interiors and rigid deck/raised edges stay square. */
export function roundedRegion(cells:TerrainCell[],radius:number,protectedCells:Set<string>){
 const set=new Set(cells.map(c=>key(c.i,c.j))),polygons:TerrainPolygon[]=[];
 const has=(i:number,j:number)=>set.has(key(i,j));const protect=(i:number,j:number)=>[[0,0],[-1,0],[0,-1],[-1,-1]].some(([a,b])=>protectedCells.has(key(i+a!,j+b!)));
 let cuts=0,fills=0;
 for(const c of cells){const vs=[[c.i,c.j],[c.i+1,c.j],[c.i+1,c.j+1],[c.i,c.j+1]],neighbors=[[[c.i-1,c.j],[c.i,c.j-1]],[[c.i,c.j-1],[c.i+1,c.j]],[[c.i+1,c.j],[c.i,c.j+1]],[[c.i,c.j+1],[c.i-1,c.j]]];const points:{x:number;y:number}[]=[];
  vs.forEach(([u,v],n)=>{const sides=neighbors[n]!,prev=vs[(n+3)%4]!,next=vs[(n+1)%4]!;const cut=radius>0&&!protect(u!,v!)&&sides.every(([a,b])=>!has(a!,b!));if(!cut){points.push(gridToScreen(u!,v!));return;}cuts++;const a=[u!+(prev[0]!-u!)*radius,v!+(prev[1]!-v!)*radius],b=[u!+(next[0]!-u!)*radius,v!+(next[1]!-v!)*radius];for(let z=0;z<=4;z++){const t=z/4;points.push(gridToScreen((1-t)**2*a[0]!+2*(1-t)*t*u!+t*t*b[0]!,(1-t)**2*a[1]!+2*(1-t)*t*v!+t*t*b[1]!));}});polygons.push(points);
 }
 // Round concave stair corners by filling only the small notch at a 3-of-4 vertex.
 if(radius>0){const vertices=new Set(cells.flatMap(c=>[key(c.i,c.j),key(c.i+1,c.j),key(c.i+1,c.j+1),key(c.i,c.j+1)]));for(const vertex of vertices){const [u,v]=vertex.split(',').map(Number) as [number,number];if(protect(u,v))continue;const quadrants=[[-1,-1],[0,-1],[0,0],[-1,0]];const present=quadrants.map(([a,b])=>has(u+a!,v+b!));if(present.filter(Boolean).length!==3)continue;const q=quadrants[present.indexOf(false)]!,sx=q[0]===0?1:-1,sy=q[1]===0?1:-1;const points=[gridToScreen(u,v),gridToScreen(u+sx*radius,v)];for(let z=1;z<=4;z++){const t=z/4;points.push(gridToScreen(u+sx*radius*(1-t)**2,v+sy*radius*t*t));}polygons.push(points);fills++;}}
 return{polygons,cuts,fills};
}
/** Coalesce exact shared grid edges before rasterization. Input order is irrelevant. */
export function rowRegions(cells:TerrainCell[]):TerrainPolygon[]{
 const sorted=[...cells].sort((a,b)=>a.j-b.j||a.i-b.i),out:TerrainPolygon[]=[];
 for(let start=0;start<sorted.length;){const {i,j}=sorted[start]!;let end=start+1;while(end<sorted.length&&sorted[end]!.j===j&&sorted[end]!.i===sorted[end-1]!.i+1)end++;const right=sorted[end-1]!.i+1;out.push([[i,j],[right,j],[right,j+1],[i,j+1]].map(([u,v])=>gridToScreen(u!,v!)));start=end;}
 return out;
}

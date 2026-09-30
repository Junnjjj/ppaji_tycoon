/** Stable individual plants: IDs survive redraws and can identify future removals. */
export interface WoodlandPlant { id:string; i:number; j:number; kind:0|1|2; scale:number }
function hash(i:number,j:number,salt=0):number {
  let h=Math.imul(i,73856093)^Math.imul(j,19349663)^salt;
  h=Math.imul(h^(h>>>16),0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function density(i:number,j:number):number {
  const x=Math.floor(i/18),y=Math.floor(j/18),u=i/18-x,v=j/18-y;
  const a=hash(x,y,17)*(1-u)+hash(x+1,y,17)*u;
  const b=hash(x,y+1,17)*(1-u)+hash(x+1,y+1,17)*u;
  return .35+.6*(a*(1-v)+b*v);
}
/** Screen-space clearance prevents crowns merging along isometric diagonals. */
export function woodlandSeparated(a:WoodlandPlant,b:WoodlandPlant):boolean {
  const di=a.i-b.i,dj=a.j-b.j,small=a.kind===2||b.kind===2;
  if(di*di+dj*dj<(small?2.1:3.1)**2)return false;
  const scale=(a.scale+b.scale)/2;
  const dx=16*(di-dj),dy=8*(di+dj);
  return (dx/((small?25:43)*scale))**2+(dy/((small?20:30)*scale))**2>=1;
}
export function woodlandLayout(w:number,h:number):WoodlandPlant[] {
  const plants:WoodlandPlant[]=[],buckets=new Map<string,WoodlandPlant[]>();
  // One jittered candidate per patch; no repeated five-plant rosettes or perimeter rows.
  for(let j=3;j<h+40;j+=3)for(let i=-40;i<w+40;i+=3){
    if(hash(i,j,29)>density(i,j))continue;
    const p:WoodlandPlant={id:`woodland:${i}:${j}`,i:i+Math.floor(hash(i,j,41)*3),j:j+Math.floor(hash(i,j,53)*3),kind:hash(i,j,67)<.18?2:hash(i,j,71)<.32?1:0,scale:.82+hash(i,j,83)*.2};
    const bx=Math.floor(p.i/6),by=Math.floor(p.j/6);let clear=true;
    for(let y=by-1;y<=by+1&&clear;y++)for(let x=bx-1;x<=bx+1&&clear;x++)for(const q of buckets.get(`${x},${y}`)??[])if(!woodlandSeparated(p,q)){clear=false;break;}
    if(!clear)continue;
    plants.push(p);const key=`${bx},${by}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(p);
  }
  return plants;
}

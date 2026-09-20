/** Small numeric projection/timing contract; full authored paths remain in approved routes.json. */
import metadata from '../data/static-facility-visits.json';
type Point={i:number;j:number;z:number};
type Placement={uid:number;defId:string;i:number;j:number;facing:number};
type Meta={pivots:number[][];visits:{cycle:number;start:number[];end:number[]}[]};
export interface StaticVisit {uid:number;defId:string;i:number;j:number;facing:number;routeIndex:number;origin:Point;entrySeconds:number;routeSeconds:number;exitSeconds:number;totalTicks:number}
export const STATIC_TRANSFER_SPEED=.8;
const contract=(id:string)=>(metadata as Record<string,Meta>)[id];
export function staticRoutePoint(f:Placement,p:number[]):Point {
  const pivot=contract(f.defId)!.pivots[f.facing]!,x=p[0]!,y=-p[1]!;
  return {i:f.i+pivot[0]!+(f.facing===0?x:y),j:f.j+pivot[1]!+(f.facing===0?y:-x),z:p[2]!};
}
export function createStaticVisit(f:Placement,origin:Point,uid:number,useSeconds:number,occupied:readonly number[]=[]):StaticVisit|undefined {
  const m=contract(f.defId);if(!m)return;
  let index=Math.abs(uid)%m.visits.length;
  if(f.defId.startsWith('module_'))index=m.visits.findIndex((_,i)=>!occupied.includes(i));
  if(index<0)index=Math.abs(uid)%m.visits.length;
  const route=m.visits[index]!,first=staticRoutePoint(f,route.start),last=staticRoutePoint(f,route.end);
  const seconds=(p:Point)=>Math.hypot(p.i-origin.i,p.j-origin.j,p.z-origin.z)/STATIC_TRANSFER_SPEED;
  const entrySeconds=seconds(first),routeSeconds=Math.max(route.cycle,useSeconds),exitSeconds=seconds(last);
  return {...f,routeIndex:index,origin:{...origin},entrySeconds,routeSeconds,exitSeconds,totalTicks:Math.ceil((entrySeconds+routeSeconds+exitSeconds)*8)};
}
export function staticVisitPhase(v:StaticVisit,t:number):{phase:'enter'|'route'|'exit';u:number} {
  if(t<v.entrySeconds)return {phase:'enter',u:Math.max(0,t/Math.max(1e-9,v.entrySeconds))};
  if(t<v.entrySeconds+v.routeSeconds)return {phase:'route',u:(t-v.entrySeconds)/v.routeSeconds};
  return {phase:'exit',u:Math.min(1,(t-v.entrySeconds-v.routeSeconds)/Math.max(1e-9,v.exitSeconds))};
}

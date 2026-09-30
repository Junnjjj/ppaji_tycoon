import { FLOOR, type FloorCode } from '../sim/grid.js';

export const TOWN_BUILDINGS=Array.from({length:8},(_,n)=>({i:4+n*11,j:-8}));
/** Authored lots, in building order. Coordinates are relative in I, absolute in J.
 * Keep seating on paving and planting off the front promenade / two-tile alleys. */
export interface TownLot {
  benches: [number,number][];
  pots: [number,number][];
  trees: [number,number][];
  lamp?: [number,number];
  garden: [number,number,number][];
  car?: [number,number];
}
export const TOWN_LOTS: TownLot[] = [
  {benches:[[1,-5]],pots:[[-2,-6]],trees:[[8,-16]],garden:[[3,-9,3],[3,-8,3]],car:[8,-6]},
  {benches:[],pots:[[-2,-6],[2,-6]],trees:[],lamp:[4,-5],garden:[]},
  {benches:[[2,-5]],pots:[],trees:[[3,-16],[8,-17]],garden:[],car:[8,-6]},
  {benches:[],pots:[[-2,-6]],trees:[[8,-16]],lamp:[4,-5],garden:[[3,-10,3],[3,-9,3],[3,-8,3]]},
  {benches:[[1,-5]],pots:[[3,-7]],trees:[],garden:[]},
  {benches:[],pots:[],trees:[[9,-16]],lamp:[4,-5],garden:[],car:[8,-6]},
  {benches:[],pots:[[2,-6]],trees:[[8,-17]],garden:[[3,-9,3],[3,-8,3]],car:[8,-6]},
  {benches:[[2,-5]],pots:[[-2,-6]],trees:[[2,-16]],lamp:[4,-5],garden:[]},
];
export const TOWN_CROSSINGS=[26,48,70] as const;
export const TOWN_ALLEYS=TOWN_BUILDINGS.map(b=>b.i+5);
/** Building front promenade, connected back lane, and paved building forecourts. */
export function townFloor(i:number,j:number):FloorCode {
  if(j>=-2&&j<0)return FLOOR.road;
  if((j>=-5&&j<-2)||(j>=-14&&j<-12))return FLOOR.sidewalk;
  if(TOWN_ALLEYS.some(x=>i>=x&&i<x+2)&&j>=-14&&j<-2)return FLOOR.sidewalk;
  if(TOWN_BUILDINGS.some(b=>i>=b.i-2&&i<b.i+3)&&j>=-11&&j<-5)return FLOOR.path;
  if(TOWN_BUILDINGS.some(b=>i>=b.i+7&&i<b.i+10)&&j>=-8&&j<-5)return FLOOR.gravel;
  return FLOOR.grass;
}
export function townWalkable(i:number,j:number):boolean {
  return townFloor(Math.floor(i),Math.floor(j))===FLOOR.sidewalk;
}
export function townWalkingLoop(index:number):{i:number;j:number}[]{
  const a=TOWN_ALLEYS[index%(TOWN_ALLEYS.length-1)]!;
  return [{i:a,j:-4},{i:a,j:-13},{i:a+11,j:-13},{i:a+11,j:-4}];
}
export function trafficGreen(timeMs:number):boolean{return timeMs%16000<10000;}

export function advanceTownVehicle(i:number,speed:number,dtMs:number,green:boolean):number {
  let next=i+speed*Math.min(dtMs,100)/1000;
  if(!green)for(const crossing of TOWN_CROSSINGS){const stop=crossing+(speed>0?-1.5:3);if(speed>0&&i<=stop&&next>stop)next=stop;if(speed<0&&i>=stop&&next<stop)next=stop;}
  return next;
}

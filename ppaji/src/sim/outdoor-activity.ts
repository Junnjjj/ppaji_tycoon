/** Numeric, renderer-independent outdoor visits. All samples are centered LOCAL XYZ tiles. */
import contracts from '../data/outdoor-facility-contracts.json';
export type OutdoorPoint = [number, number, number];
export interface OutdoorSlot { id: string; role?: string; position: OutdoorPoint; pose: string; heading: number; approach: OutdoorPoint[]; exitApproach?: OutdoorPoint[]; seatContact?: OutdoorPoint; supportObjects?: string[] }
export interface OutdoorContract {
  id: string; size: [number, number]; capacity?: number; proposalAudienceCount?: number;
  entry: OutdoorPoint; exit: OutdoorPoint; slots: OutdoorSlot[]; routes?: Record<string, OutdoorPoint[]>;
  admissionOrder?: string[]; exitOrder?: string[]; floorZ?: number; flashPosition?: OutdoorPoint;
  motion?: { ascentSeconds?: number; jumpSeconds?: number; reboundSeconds?: number; recoverSeconds?: number };
  rope?: { pivot: OutdoorPoint; lowestFeet: OutdoorPoint; pickupFeet: OutdoorPoint; bodyAttachmentOffset: OutdoorPoint };
}
export interface OutdoorSample {
  position: OutdoorPoint; heading: number; pose: string; phase: string; hidden?: boolean;
  rope?: { from: OutdoorPoint; to: OutdoorPoint; mode: string };
  harness?: { position: OutdoorPoint; attachment: OutdoorPoint };
  effects?: Array<{ kind: string; position: OutdoorPoint }>;
}
export interface OutdoorSegment { phase: string; path: OutdoorPoint[]; ticks: number; pose: string; heading?: number; hidden?: boolean; curve?: 'slide' | 'jump' | 'bounce' | 'winch' }
export interface OutdoorVisit {
  uid: number; defId: string; slotId: string; facing: number; i: number; j: number;
  segment: number; elapsed: number; holdTicks: number; segments: OutdoorSegment[];
  exitTile: { i: number; j: number }; completed?: boolean; draining?: boolean;
}
export function outdoorContract(id: string): OutdoorContract | null {
  return (contracts as unknown as Record<string, OutdoorContract>)[id] ?? null;
}
export function outdoorSlots(c: OutdoorContract): OutdoorSlot[] {
  let slots = c.slots.filter(s => !['performer', 'waiting', 'queue'].includes(s.role ?? '') && !s.id.startsWith('wait-'));
  if (c.admissionOrder) slots = slots.sort((a,b) => c.admissionOrder!.indexOf(a.id)-c.admissionOrder!.indexOf(b.id));
  if (c.id === 'photozone') slots.reverse();
  return slots;
}
export function outdoorCapacity(id: string): number | null {
  const c = outdoorContract(id); return c ? c.capacity ?? c.proposalAudienceCount ?? outdoorSlots(c).length : null;
}
export interface OutdoorPlacement { defId: string; i: number; j: number; facing: number }
/** Same authored art rotation as facility portals; returned XY are continuous map coordinates. */
export function outdoorWorld(f: OutdoorPlacement, p: OutdoorPoint): { i: number; j: number } {
  const [w,d] = outdoorContract(f.defId)!.size;
  return f.facing === 0 ? { i: f.i+w/2+p[0], j: f.j+d/2-p[1] } : { i: f.i+d/2-p[1], j: f.j+w/2-p[0] };
}
export function outdoorLocal(f: OutdoorPlacement, p: { i: number; j: number }): OutdoorPoint {
  const [w,d] = outdoorContract(f.defId)!.size;
  return f.facing === 0 ? [p.i-f.i-w/2, f.j+d/2-p.j, 0] : [f.j+w/2-p.j, f.i+d/2-p.i, 0];
}
/** One designated adjacent exterior tile, selected from the authored gate's nearest edge. */
export function outdoorGate(f: OutdoorPlacement, exit = false): { i: number; j: number } | null {
  const c = outdoorContract(f.defId); if (!c) return null;
  const p = [...(exit ? c.exit : c.entry)] as OutdoorPoint, [w,d] = c.size;
  const sides = [p[0]+w/2, w/2-p[0], p[1]+d/2, d/2-p[1]];
  const side = sides.indexOf(Math.min(...sides));
  if (side === 0) p[0] = -w/2-.5;
  if (side === 1) p[0] = w/2+.5;
  if (side === 2) p[1] = -d/2-.5;
  if (side === 3) p[1] = d/2+.5;
  const q = outdoorWorld(f,p); return { i: Math.floor(q.i), j: Math.floor(q.j) };
}
const distance = (a: OutdoorPoint,b: OutdoorPoint) => Math.hypot(...a.map((v,i) => v-b[i]!));
export const outdoorPathLength = (p: OutdoorPoint[]) => p.slice(1).reduce((n,b,i) => n+distance(p[i]!,b),0);
const lerp = (a: OutdoorPoint,b: OutdoorPoint,u: number): OutdoorPoint => a.map((v,i) => v+(b[i]!-v)*u) as OutdoorPoint;
function along(path: OutdoorPoint[], u: number): { position: OutdoorPoint; heading: number } {
  let d = outdoorPathLength(path)*Math.max(0,Math.min(1,u));
  for (let i=1;i<path.length;i++) { const a=path[i-1]!,b=path[i]!,len=distance(a,b);
    if (d<=len && len>0) return { position:lerp(a,b,d/len), heading:Math.atan2(b[1]-a[1],b[0]-a[0]) }; d-=len;
  }
  return { position:[...path[path.length-1]!] as OutdoorPoint, heading:0 };
}
export function createOutdoorVisit(f: OutdoorPlacement & { uid: number }, slotId: string, holdTicks: number): OutdoorVisit {
  const c=outdoorContract(f.defId)!, s=c.slots.find(s=>s.id===slotId)!, segments: OutdoorSegment[]=[];
  const walk=(phase:string,path:OutdoorPoint[],speed=.72,pose='walk') => segments.push({phase,path,ticks:Math.max(1,Math.ceil(outdoorPathLength(path)/speed*8)),pose});
  const timed=(phase:string,path:OutdoorPoint[],seconds:number,pose:string,extra:Partial<OutdoorSegment>={}) => segments.push({phase,path,ticks:Math.max(1,Math.ceil(seconds*8)),pose,...extra});
  const entry=outdoorGate(f)!, exitTile=outdoorGate(f,true)!;
  walk('entering',[outdoorLocal(f,{i:entry.i+.5,j:entry.j+.5}),c.entry]);
  if(c.id==='playground') {
    const r=c.routes!; walk('climb',r.climb!,.7); timed('prepare',[r.slide![0]!],.5,'ride',{heading:0});
    timed('slide',r.slide!,1.65,'ride',{curve:'slide'}); walk('landing',r.landing!.slice(0,2),.8,'ride'); walk('landing',r.landing!.slice(1),.8);
  } else if(c.id==='bungee_jump') {
    const r=c.routes!,m=c.motion!; walk('entry',r.entry!,.8);
    timed('ascent',r.ascent!,m.ascentSeconds!,'idle',{hidden:true}); walk('platform',r.platform!,.65);
    timed('prepare',[r.jump![0]!],Math.max(1,holdTicks/8),'idle',{heading:-Math.PI/2});
    timed('jump', [r.jump![0]!,c.rope!.lowestFeet],m.jumpSeconds!,'cheer_jump',{curve:'jump'});
    timed('bounce',r.rebound!,m.reboundSeconds!,'cheer_jump',{curve:'bounce'});
    timed('winch',[r.rebound!.at(-1)!,c.rope!.pickupFeet],m.recoverSeconds!*.6,'cheer_jump',{curve:'winch'});
    walk('recover',r.recover!.slice(1),.8);
  } else {
    walk('entering',s.approach);
    segments.push({phase:'hold',path:[s.position],ticks:Math.max(1,holdTicks),pose:s.pose==='sit_chair'?'sit':s.pose==='stand'?'idle':s.pose,heading:s.heading});
    const exit=s.exitApproach ?? (c.id==='photozone'?c.routes!['exit_'+(s.id==='subject-1'?0:1)]!:
      c.id==='pavilion'?[...s.approach.slice(1).reverse(),[0,-.65,c.floorZ!] as OutdoorPoint,c.exit]:[...s.approach].reverse());
    walk('exiting',exit);
  }
  if(c.id==='playground') timed('hold',[c.exit],Math.max(.125,holdTicks/8),'idle');
  walk('exiting',[c.exit,outdoorLocal(f,{i:exitTile.i+.5,j:exitTile.j+.5})]);
  return {uid:f.uid,defId:f.defId,slotId,facing:f.facing,i:f.i,j:f.j,segment:0,elapsed:0,holdTicks,segments,exitTile};
}
export function sampleOutdoorGuest(g: { outdoor?: OutdoorVisit }): OutdoorSample | null {
  const v=g.outdoor; if(!v) return null;
  const c=outdoorContract(v.defId); const s=v.segments[v.segment]; if(!c || !s) return null;
  const u=Math.min(1,v.elapsed/s.ticks), smooth=(u:number)=>(1-Math.cos(Math.PI*u))/2;
  let a=along(s.path,s.curve==='slide'?u*u:u);
  if(s.curve==='jump') { const [launch,low]=s.path; a={position:[launch![0]+(low![0]-launch![0])*Math.min(1,u*3),launch![1]+(low![1]-launch![1])*Math.min(1,u*3),launch![2]+(low![2]-launch![2])*smooth(u)],heading:-Math.PI/2}; }
  if(s.curve==='bounce') { const t=u*(s.path.length-1),i=Math.min(s.path.length-2,Math.floor(t)); a={position:lerp(s.path[i]!,s.path[i+1]!,smooth(t-i)),heading:-Math.PI/2}; }
  if(s.curve==='winch') a={position:lerp(s.path[0]!,s.path[1]!,smooth(u)),heading:-Math.PI/2};
  const sample:OutdoorSample={...a,heading:s.heading??a.heading,pose:s.pose,phase:s.phase,...(s.hidden?{hidden:true}:{})};
  if(c.rope && ['prepare','jump','bounce','winch'].includes(s.phase)) {
    const to=a.position.map((x,i)=>x+c.rope!.bodyAttachmentOffset[i]!) as OutdoorPoint;
    sample.rope={from:c.rope.pivot,to,mode:s.phase==='winch'?'winch':'elastic'}; sample.harness={position:a.position,attachment:to};
  }
  if(c.id==='photozone' && s.phase==='hold' && v.elapsed>=8 && v.elapsed<10 && c.flashPosition) sample.effects=[{kind:'flash',position:c.flashPosition}];
  return sample;
}
/** Advance exactly once per simulation tick; callers arbitrate aisle exits before calling. */
export function advanceOutdoorVisit(v: OutdoorVisit): boolean {
  if(v.completed) return true;
  const s=v.segments[v.segment]!;
  if(++v.elapsed < s.ticks) return false;
  if(v.segment===v.segments.length-1) {v.elapsed=s.ticks;v.completed=true;return true;}
  v.segment++;v.elapsed=0;return false;
}
export function outdoorInAisle(v: OutdoorVisit): boolean {
  return v.defId==='playground' || v.defId==='bungee_jump' || v.segments[v.segment]?.phase!=='hold';
}

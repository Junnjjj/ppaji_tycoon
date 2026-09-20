/** Native outdoor camera compositor. Only simulation-owned visitors occupy guest slots. */
import type Phaser from 'phaser';
import contracts from '../data/outdoor-facility-contracts.json';
import attendants from '../data/facility-attendants.json';
import { outdoorContract, sampleOutdoorGuest, type OutdoorSample } from '../sim/outdoor-activity.js';
import type { Guest } from '../sim/guest.js';
import type { PlacedFacility } from '../sim/facility.js';
import { approvedPivot, type ApprovedFacilityProvider } from '../assets/approved-facilities.js';
import type { AssetProvider } from '../assets/types.js';
import { npcV8Key, type NpcV8Pose } from '../assets/npc-v8.js';
import { gridToScreen, depthKey, Z_FACILITY } from './iso.js';

type Point = [number, number, number];
export interface OutdoorCamera { C: Point; F: Point }
export interface OutdoorView { base: ImageData; depth: Float32Array; support: Float32Array }
export interface OutdoorResource { camera: OutdoorCamera; tileWorld: number; size: number; targetZ: number; views: OutdoorView[] }
export interface OutdoorDepth { resources: Map<string, OutdoorResource>; errors: Map<string, string> }
export interface OutdoorActor { uid: number; sample: OutdoorSample; support?: boolean }
interface Attendant { position: Point; heading: number; pose: string; uid: number; depthPrefix: string }
const attendantOf=(id:string): Attendant|undefined=>(attendants as unknown as Record<string,Attendant>)[id];
const COS = Math.cos(Math.PI / 6), TILE = Math.sqrt(512), LIFT = TILE * COS;
export function rotateOutdoor([x,y,z]: Point, facing: number): Point {
  switch ((facing % 4 + 4) % 4) { case 1: return [-y,x,z]; case 2: return [-x,-y,z]; case 3: return [y,-x,z]; default: return [x,y,z]; }
}
export function projectOutdoor([x,y,z]: Point, size: number, targetZ: number): [number,number] {
  return [size/2+16*(x+y),size/2+targetZ*LIFT+8*(x-y)-LIFT*z];
}
export function outdoorDepthAt(p: Point, camera: OutdoorCamera, tileWorld = TILE): number {
  return p.reduce((sum,v,k)=>sum+(v*tileWorld-camera.C[k]!)*camera.F[k]!,0);
}
export function outdoorFacing(heading: number): number { return [0,3,2,1][((Math.round(heading/(Math.PI/2))%4)+4)%4]!; }
export function outdoorPose(pose: string): NpcV8Pose {
  if (pose === 'stand') return 'idle';
  if (pose === 'sit_chair') return 'sit';
  if (pose === 'slide') return 'ride';
  if (['idle','walk','sit','lie','ride','swim','float','jump','cheer_jump'].includes(pose)) return pose as NpcV8Pose;
  throw Error(`Unsupported outdoor NPC pose: ${pose}`);
}
export function outdoorVisitorMatches(g: Guest, f: PlacedFacility): boolean {
  const v=g.outdoor;
  return !!v && g.target?.kind==='facility' && g.target.uid===f.uid && v.uid===f.uid && v.defId===f.defId && v.facing===f.facing && v.i===f.i && v.j===f.j;
}
export function validateOutdoorMask(buffer: ArrayBuffer, size: number, label: string): Float32Array {
  if(buffer.byteLength!==size*size*4) throw Error(`Outdoor depth size ${label}: ${buffer.byteLength}, expected ${size*size*4}`);
  const values=new Float32Array(buffer);
  if(values.some(v=>Number.isNaN(v)||v===-Infinity)) throw Error(`Invalid outdoor depth ${label}`);
  return values;
}
/** A failed facility stays on ordinary rendering, without affecting any other facility. */
export async function loadOutdoorDepth(art: ApprovedFacilityProvider, base='./assets/approved-facilities'): Promise<OutdoorDepth> {
  const result: OutdoorDepth={resources:new Map(),errors:new Map()};
  await Promise.all([...Object.keys(contracts),...Object.keys(attendants)].map(async id=>{
    try {
      const spec=art.manifest.facilities[id], contract=outdoorContract(id),attendant=attendantOf(id),prefix=attendant?`${attendant.depthPrefix}-`:'';
      if(!spec || (!contract && !attendant)) throw Error(`Missing outdoor contract/art ${id}`);
      const response=await fetch(`${base}/${id}/${prefix}depth-metadata.json`);
      if(!response.ok) throw Error(`Outdoor camera ${id}: ${response.status}`);
      const meta=await response.json() as { camera: OutdoorCamera; tileWorld: number; native: number };
      if(meta.native!==spec.logicalSize || !Number.isFinite(meta.tileWorld) || meta.camera?.C?.length!==3 || meta.camera?.F?.length!==3 || !meta.camera.C.every(Number.isFinite) || !meta.camera.F.every(Number.isFinite)) throw Error(`Invalid outdoor camera ${id}`);
      const views=await Promise.all([0,1,2,3].map(async d=>{
        const canvas=art.canvas(`fac/${id}/${d}`),ctx=canvas?.getContext('2d');
        if(!canvas || !ctx || canvas.width!==meta.native || canvas.height!==meta.native) throw Error(`Outdoor RGBA ${id}/${d}`);
        const [depth,support]=await Promise.all(['depth','support'].map(async kind=>{
          const r=await fetch(`${base}/${id}/${prefix}${kind}-d${d}.bin`);
          if(!r.ok) throw Error(`Outdoor ${kind} ${id}/${d}: ${r.status}`);
          return validateOutdoorMask(await r.arrayBuffer(),meta.native,`${id}/${kind}/${d}`);
        }));
        return {base:ctx.getImageData(0,0,canvas.width,canvas.height),depth:depth!,support:support!};
      }));
      result.resources.set(id,{camera:meta.camera,tileWorld:meta.tileWorld,size:meta.native,targetZ:(spec.anchor.ay-meta.native/2)/LIFT,views});
    } catch(error) { const message=String(error);result.errors.set(id,message);console.error(`[outdoor-facilities] ${id}; keeping base facility and ordinary guests`,error); }
  }));
  return result;
}
function blend(out: Uint8ClampedArray, k: number, color: ArrayLike<number>, alpha: number): void {
  const old=out[k*4+3]!/255,total=alpha+old*(1-alpha);
  for(let ch=0;ch<3;ch++) out[k*4+ch]=Math.round((color[ch]!*alpha+out[k*4+ch]!*old*(1-alpha))/total);
  out[k*4+3]=Math.round(total*255);
}
/** Pure pixel composition makes depth/support/effect behavior independently testable. */
export function composeOutdoor(resource: OutdoorResource, facing: number, actors: readonly OutdoorActor[], provider: AssetProvider, timeMs: number): Uint8ClampedArray {
  const n=resource.size,v=resource.views[facing];if(!v) throw Error(`Missing outdoor facing ${facing}`);
  const out=new Uint8ClampedArray(v.base.data),actorDepth=new Float32Array(n*n).fill(Infinity);
  for(const {uid,sample:s,support} of actors) {
    if(s.hidden) continue;
    const pose=outdoorPose(s.pose),heading=s.heading+facing*Math.PI/2+(pose==='lie'?Math.PI:0);
    const key=npcV8Key(uid,outdoorFacing(heading),pose,timeMs,'happy'),spec=provider.spec(key),canvas=provider.canvas(key),ctx=canvas?.getContext('2d');
    if(!spec || !canvas || !ctx) throw Error(`Missing outdoor NPC frame ${key}`);
    const pix=ctx.getImageData(0,0,canvas.width,canvas.height),p=rotateOutdoor(s.position,facing),q=projectOutdoor(p,n,resource.targetZ);
    const left=Math.round(q[0]-spec.ax),top=Math.round(q[1]-spec.ay),zero=outdoorDepthAt(p,resource.camera,resource.tileWorld);
    const mask=support||['sit','lie','ride'].includes(pose)?v.support:v.depth;
    for(let y=0;y<pix.height;y++)for(let x=0;x<pix.width;x++){
      const src=(y*pix.width+x)*4,alpha=pix.data[src+3]!/255,xx=left+x,yy=top+y;
      if(!alpha || xx<0 || yy<0 || xx>=n || yy>=n) continue;
      const k=yy*n+xx,z=zero+(pose==='lie'?-Math.sqrt(3):.5/COS)*(yy+.5-q[1])-.35;
      if(z>Math.min(mask[k]!,actorDepth[k]!)+.08) continue;
      blend(out,k,pix.data.subarray(src,src+3),alpha);actorDepth[k]=z;
    }
  }
  const pixel=(local: Point,color: number[],alpha=1,bodyOverlay=false)=>{
    const p=rotateOutdoor(local,facing),q=projectOutdoor(p,n,resource.targetZ),x=Math.round(q[0]),y=Math.round(q[1]);
    if(x<0||y<0||x>=n||y>=n) return;
    const k=y*n+x,z=outdoorDepthAt(p,resource.camera,resource.tileWorld);
    if(z>Math.min(v.depth[k]!,bodyOverlay?Infinity:actorDepth[k]!)+.10) return;
    blend(out,k,color,alpha);
  };
  const line=(a: Point,b: Point,color: number[],bodyOverlay=false)=>{
    const count=Math.max(12,Math.ceil(Math.hypot(...a.map((v,k)=>v-b[k]!))*32));
    for(let i=0;i<=count;i++) pixel(a.map((v,k)=>v+(b[k]!-v)*i/count) as Point,color,1,bodyOverlay);
  };
  for(const {sample:s} of actors){
    if(s.hidden) continue;
    if(s.rope) line(s.rope.from,s.rope.to,[43,135,181]);
    if(s.harness){
      const p=s.harness.position,points: Point[]=[];
      for(let k=0;k<=16;k++)points.push([p[0]+.20*Math.cos(k*Math.PI/8),p[1]+.14*Math.sin(k*Math.PI/8),p[2]+.48]);
      for(let k=1;k<points.length;k++)line(points[k-1]!,points[k]!,[38,205,215],true);
      line([p[0]+.2,p[1],p[2]+.48],s.harness.attachment,[38,205,215],true);
      for(const side of [-1,1])line([p[0]+side*.16,p[1]-.12,p[2]+.48],[p[0]+side*.10,p[1]-.10,p[2]+.30],[38,205,215],true);
    }
    for(const e of s.effects??[]){const p=e.position;
      if(e.kind==='flash')for(let k=-3;k<=3;k++){pixel([p[0]+k*.035,p[1],p[2]],[255,250,207]);pixel([p[0],p[1],p[2]+k*.035],[255,250,207]);}
      if(e.kind==='music')for(let k=0;k<3;k++)pixel([p[0]+Math.sin(timeMs/1000+k)*.1,p[1],p[2]+k*.10],[220,151,66],.85);
    }
  }
  return out;
}
export class OutdoorFacilityRenderer {
  readonly hiddenGuestIds=new Set<number>();
  readonly hiddenFacilityIds=new Set<number>();
  private frames=new Map<number,{canvas: HTMLCanvasElement; texture: Phaser.Textures.CanvasTexture; image: Phaser.GameObjects.Image; signature: string}>();
  private failures=new Set<string>();
  constructor(private scene: Phaser.Scene,private art: ApprovedFacilityProvider,private provider: AssetProvider,private data: OutdoorDepth) {}
  update(facilities: readonly PlacedFacility[],guests: readonly Guest[],time: number,liftAt: (i:number,j:number)=>number): void {
    this.hiddenGuestIds.clear();this.hiddenFacilityIds.clear();const seen=new Set<number>();
    for(const f of facilities){
      const resource=this.data.resources.get(f.defId),contract=outdoorContract(f.defId),attendant=attendantOf(f.defId),spec=this.art.manifest.facilities[f.defId];
      if(!resource||(!contract&&!attendant)||!spec)continue;
      const visitors=guests.filter(g=>outdoorVisitorMatches(g,f)),actors: OutdoorActor[]=[],guestIds: number[]=[];
      for(const g of visitors){const sample=sampleOutdoorGuest(g);if(sample){actors.push({uid:g.uid,sample});guestIds.push(g.uid);}}
      // One explicitly authored performer is a fixture, never a Guest or seat reservation.
      const performer=contract?.slots.find(s=>s.role==='performer');
      if(performer)actors.push({uid:-110005,sample:{position:performer.position,heading:performer.heading,pose:performer.pose,phase:'performer'}});
      if(attendant)actors.push({uid:attendant.uid,support:true,sample:{position:attendant.position,heading:attendant.heading,pose:attendant.pose,phase:'attendant'}});
      if(!actors.length)continue;
      try {
        const signature=JSON.stringify([f.defId,f.facing,actors,Math.floor(time*8)]);
        let frame=this.frames.get(f.uid);
        if(!frame || frame.signature!==signature){
          const rgba=composeOutdoor(resource,f.facing,actors,this.provider,time*1000);
          if(!frame){
            const canvas=document.createElement('canvas');canvas.width=canvas.height=resource.size;
            const texture=this.scene.textures.addCanvas(`outdoor-use-${f.uid}`,canvas);if(!texture)throw Error('Outdoor canvas texture');
            frame={canvas,texture,image:this.scene.add.image(0,0,texture.key),signature:''};this.frames.set(f.uid,frame);
          }
          if(frame.canvas.width!==resource.size){frame.canvas.width=frame.canvas.height=resource.size;}
          const ctx=frame.canvas.getContext('2d')!;const image=ctx.createImageData(resource.size,resource.size);image.data.set(rgba);ctx.putImageData(image,0,0);frame.texture.refresh();frame.signature=signature;
        }
        const pivot=approvedPivot(f.defId,f.facing,this.art.manifest)!,p=gridToScreen(f.i+pivot[0],f.j+pivot[1]),fp=spec.footprintByFacing[f.facing]!;
        frame.image.setOrigin(.5,(resource.size/2+resource.targetZ*LIFT)/resource.size).setPosition(p.x,p.y+liftAt(f.i,f.j)).setDepth(depthKey(f.i+fp[0]-1,f.j+fp[1]-1)+Z_FACILITY);
        seen.add(f.uid);this.hiddenFacilityIds.add(f.uid);
        for(const uid of guestIds)this.hiddenGuestIds.add(uid);
      } catch(error){if(!this.failures.has(f.defId)){console.error(`[outdoor-facilities] ${f.defId}; restoring ordinary rendering`,error);this.failures.add(f.defId);}}
    }
    for(const [uid,frame] of this.frames)if(!seen.has(uid)){frame.image.destroy();this.scene.textures.remove(frame.texture.key);this.frames.delete(uid);}
  }
  destroy(): void {for(const frame of this.frames.values()){frame.image.destroy();this.scene.textures.remove(frame.texture.key);}this.frames.clear();this.hiddenGuestIds.clear();this.hiddenFacilityIds.clear();}
}

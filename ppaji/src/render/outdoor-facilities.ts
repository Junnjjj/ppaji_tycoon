import { npcDensity } from './npc-density';
import interactionData from '../data/imagegen-interactions.json';
import { imagegenArt } from '../assets/imagegen-art.js';
import { LazyResource } from '../assets/lazy-resource.js';
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
interface InteractionArt {physical?:boolean;painter?:boolean;exactHeading?:boolean;contacts?:{directions:number[][][];foregroundPolygons:(number[][]|null)[];previewAudienceCount:number};fits?:{x:number;y:number;scale:number}[]}
const interactionArt=interactionData as unknown as Record<string,InteractionArt>;
export interface OutdoorResource { painter?:boolean; exactHeading?:boolean; id?:string; camera: OutdoorCamera; tileWorld: number; size: number; targetZ: number; views: OutdoorView[] }
export interface OutdoorDepth { ensure?:(id:string)=>boolean; resources: Map<string, OutdoorResource>; errors: Map<string, string> }
export interface OutdoorActor { slotId?:string; uid: number; sample: OutdoorSample; support?: boolean }
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
  const supported=new Set([...Object.keys(contracts),...Object.keys(attendants)]);
  const lazy=new LazyResource(async id=>{
    try {
      const spec=art.manifest.facilities[id], contract=outdoorContract(id),attendant=attendantOf(id),prefix=attendant&&!interactionArt[id]?.physical?`${attendant.depthPrefix}-`:'';
      if(!spec || (!contract && !attendant)) throw Error(`Missing outdoor contract/art ${id}`);
      const custom=interactionArt[id];
      if(custom?.painter){
        const size=spec.logicalSize,views=[0,1,2,3].map(d=>{const c=art.canvas(`fac/${id}/${d}`)!;return {base:c.getContext('2d')!.getImageData(0,0,size,size),depth:new Float32Array(size*size).fill(Infinity),support:new Float32Array(size*size).fill(Infinity)};});
        result.resources.set(id,{id,painter:true,exactHeading:true,camera:{C:[134.72194,-134.72194,123.57645],F:[-.6123724,.6123724,-.5]},tileWorld:TILE,size,targetZ:(spec.anchor.ay-size/2)/LIFT,views});return;
      }
      const resourceBase=custom?.physical?'./assets/imagegen-interactions-v1':base;
      const response=await fetch(`${resourceBase}/${id}/${prefix}depth-metadata.json`);
      if(!response.ok) throw Error(`Outdoor camera ${id}: ${response.status}`);
      const meta=await response.json() as { camera: OutdoorCamera; tileWorld: number; native: number };
      if(meta.native!==spec.logicalSize || !Number.isFinite(meta.tileWorld) || meta.camera?.C?.length!==3 || meta.camera?.F?.length!==3 || !meta.camera.C.every(Number.isFinite) || !meta.camera.F.every(Number.isFinite)) throw Error(`Invalid outdoor camera ${id}`);
      const views=await Promise.all([0,1,2,3].map(async d=>{
        const canvas=art.canvas(`fac/${id}/${d}`),ctx=canvas?.getContext('2d');
        if(!canvas || !ctx || canvas.width!==meta.native || canvas.height!==meta.native) throw Error(`Outdoor RGBA ${id}/${d}`);
        const [depth,support]=await Promise.all(['depth','support'].map(async kind=>{
          const r=await fetch(`${resourceBase}/${id}/${prefix}${kind}-d${d}.bin`);
          if(!r.ok) throw Error(`Outdoor ${kind} ${id}/${d}: ${r.status}`);
          return validateOutdoorMask(await r.arrayBuffer(),meta.native,`${id}/${kind}/${d}`);
        }));
        return {base:ctx.getImageData(0,0,canvas.width,canvas.height),depth:depth!,support:support!};
      }));
      result.resources.set(id,{id,exactHeading:custom?.exactHeading??false,camera:meta.camera,tileWorld:meta.tileWorld,size:meta.native,targetZ:(spec.anchor.ay-meta.native/2)/LIFT,views});
      result.errors.delete(id);
    } catch(error) { result.errors.set(id,String(error));throw error; }
  });
  result.ensure=id=>supported.has(id)&&lazy.ensure(id);
  return result;
}
function blend(out: Uint8ClampedArray, k: number, color: ArrayLike<number>, alpha: number): void {
  const old=out[k*4+3]!/255,total=alpha+old*(1-alpha);
  for(let ch=0;ch<3;ch++) out[k*4+ch]=Math.round((color[ch]!*alpha+out[k*4+ch]!*old*(1-alpha))/total);
  out[k*4+3]=Math.round(total*255);
}
/** Pure pixel composition makes depth/support/effect behavior independently testable. */
export function composeOutdoor(resource: OutdoorResource, facing: number, actors: readonly OutdoorActor[], provider: AssetProvider, timeMs: number, npcOnly=false): Uint8ClampedArray {
  const n=resource.size,v=resource.views[facing];if(!v) throw Error(`Missing outdoor facing ${facing}`);
  const density=actors.every(a=>a.sample.hidden)?1:npcDensity(provider),width=n*density,out=new Uint8ClampedArray(width*width*4),actorDepth=new Float32Array(width*width).fill(Infinity);
  if(!npcOnly)for(let y=0;y<width;y++)for(let x=0;x<width;x++){const k=(Math.floor(y/density)*n+Math.floor(x/density))*4;out.set(v.base.data.subarray(k,k+4),(y*width+x)*4);}
  for(const {uid,sample:s,support,slotId} of actors) {
    if(s.hidden) continue;
    const pose=outdoorPose(s.pose),heading=s.heading+facing*Math.PI/2+(pose==='lie'&&!resource.exactHeading?Math.PI:0);
    const key=npcV8Key(uid,outdoorFacing(heading),pose,timeMs,'happy'),spec=provider.spec(key),canvas=provider.canvas(key),ctx=canvas?.getContext('2d');
    if(!spec || !canvas || !ctx) throw Error(`Missing outdoor NPC frame ${key}`);
    const pix=ctx.getImageData(0,0,canvas.width,canvas.height),p=rotateOutdoor(s.position,facing),q=projectOutdoor(p,n,resource.targetZ);
    const correction=npcOnly&&resource.id?interactionArt[resource.id]:undefined;
    const seat=slotId?.startsWith('audience_')?Number(slotId.slice(9)):-1;
    const raw=seat>=0?correction?.contacts?.directions[facing]?.[seat]:undefined,fit=correction?.fits?.[facing];
    if(raw&&fit&&resource.id){const slot=outdoorContract(resource.id)?.slots.find(v=>v.id===slotId);if(slot){const original=projectOutdoor(rotateOutdoor(slot.position,facing),n,resource.targetZ),distance=Math.hypot(...s.position.map((v,k)=>v-slot.position[k]!)),u=Math.max(0,1-distance/1.25),weight=u*u*(3-2*u);q[0]+=(fit.x+raw[0]!*fit.scale+spec.ax/(spec.density??1)-20-original[0])*weight;q[1]+=(fit.y+raw[1]!*fit.scale+spec.ay/(spec.density??1)-28-original[1])*weight;}}
    const polygon=correction?.contacts?.foregroundPolygons[facing];
    const foreground=(x:number,y:number):boolean=>{if(!polygon||!fit)return false;x=(x-fit.x)/fit.scale;y=(y-fit.y)/fit.scale;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i]!,b=polygon[j]!;if((a[1]!>y)!==(b[1]!>y)&&x<(b[0]!-a[0]!)*(y-a[1]!)/(b[1]!-a[1]!)+a[0]!)inside=!inside;}return inside;};
    const nd=spec.density??1,left=Math.round((q[0]-spec.ax/nd)*density),top=Math.round((q[1]-spec.ay/nd)*density),zero=outdoorDepthAt(p,resource.camera,resource.tileWorld);
    const mask=support||['sit','lie','ride'].includes(pose)?v.support:v.depth;
    for(let y=0;y<pix.height;y++)for(let x=0;x<pix.width;x++){
      const src=(y*pix.width+x)*4,alpha=pix.data[src+3]!/255,xx=left+x,yy=top+y;
      if(!alpha || xx<0 || yy<0 || xx>=width || yy>=width) continue;
      const k=yy*width+xx,lx=Math.floor(xx/density),ly=Math.floor(yy/density),mk=ly*n+lx,z=zero+(pose==='lie'?-Math.sqrt(3):.5/COS)*((yy+.5)/density-q[1])-.35;
      if(raw&&fit){if(foreground((xx+.5)/density,(yy+.5)/density)||z>actorDepth[k]!+.08)continue;}
      else if(resource.painter){const opaque=v.base.data[mk*4+3]!>127,behind=pose==='walk'&&q[1]<n/2+resource.targetZ*LIFT-3,roof=(resource.id==='shade_net'||resource.id==='authored_parasol')&&yy/density<n/2+resource.targetZ*LIFT-15;if(opaque&&(behind||roof)||z>actorDepth[k]!+.08)continue;}
      else if(z>Math.min(mask[mk]!,actorDepth[k]!)+.08) continue;
      blend(out,k,pix.data.subarray(src,src+3),alpha);actorDepth[k]=z;
    }
  }
  const pixel=(local: Point,color: number[],alpha=1,bodyOverlay=false)=>{
    const p=rotateOutdoor(local,facing),q=projectOutdoor(p,n,resource.targetZ),x=Math.round(q[0]),y=Math.round(q[1]);
    if(x<0||y<0||x>=n||y>=n) return;
    const k=y*n+x,z=outdoorDepthAt(p,resource.camera,resource.tileWorld);
    for(let dy=0;dy<density;dy++)for(let dx=0;dx<density;dx++){const target=(y*density+dy)*width+x*density+dx;
      if(z>Math.min(v.depth[k]!,bodyOverlay?Infinity:actorDepth[target]!)+.10)continue;
      blend(out,target,color,alpha);
    }
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
      if(this.data.ensure&&!this.data.ensure(f.defId))continue;
      const resource=this.data.resources.get(f.defId),contract=outdoorContract(f.defId),attendant=attendantOf(f.defId),spec=this.art.manifest.facilities[f.defId];
      if(!resource||(!contract&&!attendant)||!spec)continue;
      const visitors=guests.filter(g=>outdoorVisitorMatches(g,f)),actors: OutdoorActor[]=[],guestIds: number[]=[];
      for(const g of visitors){const sample=sampleOutdoorGuest(g);if(sample){actors.push({uid:g.uid,sample,slotId:g.outdoor!.slotId});guestIds.push(g.uid);}}
      // One explicitly authored performer is a fixture, never a Guest or seat reservation.
      const performer=contract?.slots.find(s=>s.role==='performer');
      if(performer)actors.push({uid:-110005,sample:{position:performer.position,heading:performer.heading,pose:performer.pose,phase:'performer'}});
      if(attendant)actors.push({uid:attendant.uid,support:true,sample:{position:attendant.position,heading:attendant.heading,pose:attendant.pose,phase:'attendant'}});
      if(!actors.length)continue;
      try {
        const signature=JSON.stringify([f.defId,f.facing,actors,Math.floor(time*8)]);
        let frame=this.frames.get(f.uid);
        if(!frame || frame.signature!==signature){
          const hd=imagegenArt.get(`fac/${f.defId}/${f.facing}`);
          const rgba=composeOutdoor(resource,f.facing,actors,this.provider,time*1000,!!hd);
          if(!frame){
            const canvas=document.createElement('canvas');canvas.width=canvas.height=resource.size*npcDensity(this.provider);
            const texture=this.scene.textures.addCanvas(`outdoor-use-${f.uid}`,canvas);if(!texture)throw Error('Outdoor canvas texture');if(npcDensity(this.provider)>1)texture.setFilter(1 /* Phaser LINEAR */);
            frame={canvas,texture,image:this.scene.add.image(0,0,texture.key),signature:''};this.frames.set(f.uid,frame);
          }
          const ctx=frame.canvas.getContext('2d')!;const image=ctx.createImageData(frame.canvas.width,frame.canvas.height);image.data.set(rgba);
          ctx.putImageData(image,0,0);frame.texture.refresh();frame.signature=signature;
        }
        const pivot=approvedPivot(f.defId,f.facing,this.art.manifest)!,p=gridToScreen(f.i+pivot[0],f.j+pivot[1]),fp=spec.footprintByFacing[f.facing]!;
        frame.image.setScale(1/npcDensity(this.provider)).setOrigin(.5,(resource.size/2+resource.targetZ*LIFT)/resource.size).setPosition(p.x,p.y+liftAt(f.i,f.j)).setDepth(depthKey(f.i+fp[0]-1,f.j+fp[1]-1)+Z_FACILITY+.01);
        seen.add(f.uid);if(!imagegenArt.get(`fac/${f.defId}/${f.facing}`))this.hiddenFacilityIds.add(f.uid);
        for(const uid of guestIds)this.hiddenGuestIds.add(uid);
      } catch(error){if(!this.failures.has(f.defId)){console.error(`[outdoor-facilities] ${f.defId}; restoring ordinary rendering`,error);this.failures.add(f.defId);}}
    }
    for(const [uid,frame] of this.frames)if(!seen.has(uid)){frame.image.destroy();this.scene.textures.remove(frame.texture.key);this.frames.delete(uid);}
  }
  destroy(): void {for(const frame of this.frames.values()){frame.image.destroy();this.scene.textures.remove(frame.texture.key);}this.frames.clear();this.hiddenGuestIds.clear();this.hiddenFacilityIds.clear();}
}

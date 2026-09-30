import { LazyResource } from '../assets/lazy-resource.js';
import { sampleStaticVisit } from './static-visit-sample.js';
import Phaser from 'phaser';
import { loadOutdoorDepth, OutdoorFacilityRenderer, type OutdoorDepth } from './outdoor-facilities.js';
import { approvedPivot, approvedSampleToTile, type ApprovedFacilityProvider, approvedSampleAt, approvedVisitForGuest, useTicksToSeconds, type RouteTrack, type RouteSample } from '../assets/approved-facilities.js';
import type { AssetProvider } from '../assets/types.js';
import type { Guest } from '../sim/guest.js';
import type { FacilityDef } from '../data/schema.js';
import type { PlacedFacility } from '../sim/facility.js';
import { CraftComposite, type CraftRider } from './watercraft-composite.js';
import { craftHeading } from '../assets/watercraft.js';
import { gridToScreen, depthKey, Z_FACILITY } from './iso.js';
import { TICK_MS } from '../sim/clock.js';
import type { NpcV8Pose } from '../assets/npc-v8.js';

export interface StaticDepth { ensure?:(id:string)=>boolean; outdoor?:OutdoorDepth; pixels:Map<string,ImageData>; depths:Map<string,Float32Array>; slides:Map<string,Float32Array>; poseMasks:Map<string,Float32Array>; overlays:Map<string,ImageData>; depthOffsets:Record<string,{depth_offset?:number}>; spec:AssetProvider['spec'] }
export async function loadStaticDepth(art:ApprovedFacilityProvider,base='./assets/approved-facilities'):Promise<StaticDepth>{
  const data:StaticDepth={pixels:new Map(),depths:new Map(),slides:new Map(),poseMasks:new Map(),overlays:new Map(),depthOffsets:{},spec:id=>art.spec(id.replace('watercraft/','fac/'))};
  const lazy=new LazyResource(async id=>{
    const s=art.manifest.facilities[id];if(!s||s.renderOnly)return;
    await Promise.all([0,1,2,3].map(async d=>{
    const canvas=art.canvas(`fac/${id}/${d}`),ctx=canvas?.getContext('2d');if(!canvas||!ctx)throw Error('Approved static frame '+id);
    const key=`watercraft/${id}/${d}`;data.pixels.set(key,ctx.getImageData(0,0,canvas.width,canvas.height));
    const loadPixels=async(file:string):Promise<ImageData>=>{const im=new Image();im.src=`${base}/${id}/${file}-d${d}.png`;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d')!;x.drawImage(im,0,0);return x.getImageData(0,0,c.width,c.height);};
    if(s.emptyBase)data.pixels.set(key,await loadPixels('base'));
    if(s.frontOverlay)data.overlays.set(key,await loadPixels('overlay'));
    for(const mode of new Set(['full',...(id==='ppaji_slide'?['slide']:[]),...(s.depthModes??[])])){
      const response=await fetch(`${base}/${s.visualSource??id}/${mode}-d${d}.bin`);if(!response.ok)throw Error(`Static depth ${id}/${mode}/${d}`);
      const z=new Float32Array(await response.arrayBuffer());if(z.length!==s.logicalSize*s.logicalSize)throw Error('Static depth size '+id);
      if(mode==='full')data.depths.set(key,z);
      else if(mode==='slide')data.slides.set(key,z);
      else for(const [pose,mask]of Object.entries(s.poseMasks??{}))if(mask===mode)data.poseMasks.set(`${key}/${pose}`,z);
    }
  }));});data.ensure=id=>lazy.ensure(id);data.outdoor=await loadOutdoorDepth(art,base);return data;
}
/** Sampling never adds new guests or loops the route ahead of the simulation's visit. */
export function sampleApprovedTrack(actor:RouteTrack,time:number):RouteSample{
  return approvedSampleAt(actor,Math.max(0,Math.min(actor.cycle-1e-6,time)));
}
export class StaticFacilityRenderer{
  readonly hiddenGuestIds=new Set<number>();
  readonly hiddenFacilityIds=new Set<number>();
  private waterEffects=new Map<number,Phaser.GameObjects.Graphics>();
  private wetGuests=new Map<number,{wet:boolean;landed:number;i:number;j:number}>();
  private frames=new Map<number,{compositor:CraftComposite;texture:Phaser.Textures.CanvasTexture;image:Phaser.GameObjects.Image;signature:string}>();
  private outdoor:OutdoorFacilityRenderer|undefined;
  constructor(private scene:Phaser.Scene,private art:ApprovedFacilityProvider,private provider:AssetProvider,private depth:StaticDepth){
    if(depth.outdoor)this.outdoor=new OutdoorFacilityRenderer(scene,art,provider,depth.outdoor);
    scene.events.once("shutdown",()=>{this.outdoor?.destroy();for(const f of this.frames.values()){f.image.destroy();scene.textures.remove(f.texture.key);f.compositor.destroy();}this.frames.clear();for(const fx of this.waterEffects.values())fx.destroy();this.waterEffects.clear();});
  }
  update(facilities:readonly PlacedFacility[],guests:readonly Guest[],time:number,defOf?:((f:PlacedFacility)=>FacilityDef),liftAt:(i:number,j:number)=>number=()=>0):void{
    this.hiddenGuestIds.clear();this.hiddenFacilityIds.clear();
    this.outdoor?.update(facilities,guests,time,liftAt);
    for(const uid of this.outdoor?.hiddenGuestIds??[])this.hiddenGuestIds.add(uid);
    for(const uid of this.outdoor?.hiddenFacilityIds??[])this.hiddenFacilityIds.add(uid);
    const seen=new Set<number>();
    for(const f of facilities){
      const spec=this.art.manifest.facilities[f.defId];if(!spec)continue;
      const ready=this.art.routesOf(f.defId)?.tour ? this.depth.ensure?.(f.defId) ?? true : true;
      if(!ready)continue;
      const visitors=guests.filter(g=>g.state==='use'&&g.target?.kind==='facility'&&g.target.uid===f.uid);if(!visitors.length)continue;
      const routes=this.art.routesOf(f.defId);if(!routes?.tour)continue;
      const pivot=approvedPivot(f.defId,f.facing,this.art.manifest)!;
      let fx=this.waterEffects.get(f.uid);if(!fx){fx=this.scene.add.graphics();this.waterEffects.set(f.uid,fx);}fx.clear();
      const riders:CraftRider[]=visitors.map(g=>{
        this.hiddenGuestIds.add(g.uid);
        const def=defOf?.(f),picked=approvedVisitForGuest(routes,f.defId.startsWith('module_')?visitors.indexOf(g):g.uid,def?useTicksToSeconds(def.useTicks):undefined);
        const route=picked?.visit??routes.tour;
        const elapsed=g.stateTicks*TICK_MS/1000;
        const sample=sampleApprovedTrack(route,elapsed*(picked?.timeScale??1));
        const p=g.staticVisit?sampleStaticVisit(routes,g.staticVisit,elapsed,this.art.manifest):approvedSampleToTile(f.defId,f.facing,sample,f.i,f.j,this.art.manifest)!;
        const wet=p.pose==='swim',previous=this.wetGuests.get(g.uid);
        const state={wet,landed:wet&&!previous?.wet?time:previous?.landed??-100,i:wet&&!previous?.wet?p.i:previous?.i??p.i,j:wet&&!previous?.wet?p.j:previous?.j??p.j};this.wetGuests.set(g.uid,state);
        if(wet){const q=gridToScreen(p.i,p.j);fx!.lineStyle(1,0xc3edf6,.65).strokeEllipse(q.x,q.y+2,9+(time%1)*3,4);}
        const age=time-state.landed;if(age>=0&&age<.85){const q=gridToScreen(state.i,state.j),r=3+age*14;fx!.lineStyle(1,0xd7f4fa,1-age/.85).strokeEllipse(q.x,q.y,r*2,r);for(let k=0;k<7;k++){const a=k*Math.PI*2/7,z=(1.8*age-2.9*age*age)*Math.sqrt(512)*Math.cos(Math.PI/6);if(z>0)fx!.fillStyle(0xd7f4fa,1-age/.85).fillRect(q.x+Math.cos(a)*age*16,q.y+Math.sin(a)*age*8-z,1,2);}}
        const pose:NpcV8Pose=p.pose==='slide'?'ride':(['idle','walk','swim','sit','lie','jump'].includes(p.pose)?p.pose:'idle') as NpcV8Pose;
        return {uid:g.uid,surfacePose:p.pose,di:p.i-f.i-pivot[0],dj:p.j-f.j-pivot[1],z:p.z,pose,heading:craftHeading(Math.cos(p.heading),Math.sin(p.heading))};
      });
      seen.add(f.uid);let frame=this.frames.get(f.uid);
      if(!frame){const compositor=new CraftComposite(this.depth,this.provider,spec.logicalSize),texture=this.scene.textures.addCanvas(`static-use-${f.uid}`,compositor.canvas);if(!texture)throw Error('Static use canvas');frame={compositor,texture,image:this.scene.add.image(0,0,texture.key),signature:''};this.frames.set(f.uid,frame);}
      const signature=JSON.stringify([f.defId,f.facing,riders,Math.floor(time*8)]);
      if(signature!==frame.signature){const anchor=frame.compositor.draw(f.defId,f.facing,riders,time*1000,this.depth.slides.get(`watercraft/${f.defId}/${f.facing}`),this.depth.poseMasks,this.depth.overlays.get(`watercraft/${f.defId}/${f.facing}`));frame.image.setDisplaySize(frame.compositor.canvas.width,frame.compositor.canvas.height);frame.texture.refresh();frame.image.setOrigin(anchor.ax/frame.compositor.canvas.width,anchor.ay/frame.compositor.canvas.height);frame.signature=signature;}
      if(!frame.compositor.usingImagegen)this.hiddenFacilityIds.add(f.uid);
      const p=gridToScreen(f.i+pivot[0],f.j+pivot[1]),fp=spec.footprintByFacing[f.facing]!;
      frame.image.setPosition(p.x,p.y+liftAt(f.i,f.j)).setDepth(depthKey(f.i+fp[0]-1,f.j+fp[1]-1)+Z_FACILITY+.01);fx.setPosition(0,liftAt(f.i,f.j)).setDepth(frame.image.depth+.01);
    }
    for(const [uid,fx]of this.waterEffects)if(!seen.has(uid)){fx.destroy();this.waterEffects.delete(uid);}
    for(const uid of this.wetGuests.keys())if(!this.hiddenGuestIds.has(uid))this.wetGuests.delete(uid);
    for(const[uid,f]of this.frames)if(!seen.has(uid)){f.image.destroy();this.scene.textures.remove(f.texture.key);f.compositor.destroy();this.frames.delete(uid);}
  }
}

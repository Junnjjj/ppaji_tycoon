import Phaser from 'phaser';
import { approvedPivot, approvedSampleToTile, type ApprovedFacilityProvider, approvedSampleAt, approvedVisitForGuest, useTicksToSeconds, type RouteTrack, type RouteSample, type FacilityRoutes } from '../assets/approved-facilities.js';
import type { AssetProvider } from '../assets/types.js';
import type { Guest } from '../sim/guest.js';
import type { FacilityDef } from '../data/schema.js';
import type { PlacedFacility } from '../sim/facility.js';
import { CraftComposite, type CraftRider } from './watercraft-composite.js';
import { craftHeading } from '../assets/watercraft.js';
import { gridToScreen, depthKey, Z_FACILITY } from './iso.js';
import { TICK_MS } from '../sim/clock.js';
import type { NpcV8Pose } from '../assets/npc-v8.js';

export interface StaticDepth { pixels:Map<string,ImageData>; depths:Map<string,Float32Array>; slides:Map<string,Float32Array>; depthOffsets:Record<string,{depth_offset?:number}>; spec:AssetProvider['spec'] }
export async function loadStaticDepth(art:ApprovedFacilityProvider,base='./assets/approved-facilities'):Promise<StaticDepth>{
  const data:StaticDepth={pixels:new Map(),depths:new Map(),slides:new Map(),depthOffsets:{},spec:id=>art.spec(id.replace('watercraft/','fac/'))};
  await Promise.all(Object.entries(art.manifest.facilities).map(async([id,s])=>Promise.all([0,1,2,3].map(async d=>{
    const canvas=art.canvas(`fac/${id}/${d}`),ctx=canvas?.getContext('2d');if(!canvas||!ctx)throw Error('Approved static frame '+id);
    const key=`watercraft/${id}/${d}`;data.pixels.set(key,ctx.getImageData(0,0,canvas.width,canvas.height));
    for(const mode of (id==='ppaji_slide'?['full','slide']:['full'])){
      const response=await fetch(`${base}/${id}/${mode}-d${d}.bin`);if(!response.ok)throw Error(`Static depth ${id}/${mode}/${d}`);
      const z=new Float32Array(await response.arrayBuffer());if(z.length!==s.logicalSize*s.logicalSize)throw Error('Static depth size '+id);
      (mode==='full'?data.depths:data.slides).set(key,z);
    }
  }))));return data;
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
  constructor(private scene:Phaser.Scene,private art:ApprovedFacilityProvider,private provider:AssetProvider,private depth:StaticDepth){}
  update(facilities:readonly PlacedFacility[],guests:readonly Guest[],time:number,defOf?:(f:PlacedFacility)=>FacilityDef):void{
    this.hiddenGuestIds.clear();this.hiddenFacilityIds.clear();const seen=new Set<number>();
    for(const f of facilities){
      const spec=this.art.manifest.facilities[f.defId];if(!spec)continue;
      const visitors=guests.filter(g=>g.state==='use'&&g.target?.kind==='facility'&&g.target.uid===f.uid);if(!visitors.length)continue;
      const routes=(f.defId==='ppaji_slide'?this.art.routes?.ppaji_slide:f.defId==='ppaji_playground'?this.art.routes?.ppaji_playground:undefined) as FacilityRoutes|undefined;if(!routes?.tour)continue;
      const pivot=approvedPivot(f.defId,f.facing,this.art.manifest)!;
      let fx=this.waterEffects.get(f.uid);if(!fx){fx=this.scene.add.graphics();this.waterEffects.set(f.uid,fx);}fx.clear();
      const riders:CraftRider[]=visitors.map(g=>{
        this.hiddenGuestIds.add(g.uid);
        const def=defOf?.(f),picked=approvedVisitForGuest(routes,g.uid,def?useTicksToSeconds(def.useTicks):undefined);
        const route=picked?.visit??routes.tour;
        const elapsed=g.stateTicks*TICK_MS/1000, duration=def?useTicksToSeconds(def.useTicks):route.cycle;
        const sample=sampleApprovedTrack(route,elapsed*(picked?.timeScale??1)),p=approvedSampleToTile(f.defId,f.facing,sample,f.i,f.j,this.art.manifest)!;
        // Match the walking tile centre at both ends, then join the authored path without a pop.
        const transfer=Math.max(0,Math.min(1,elapsed/.35,(duration-elapsed)/.35));
        p.i=(g.i+.5)+(p.i-g.i-.5)*transfer;p.j=(g.j+.5)+(p.j-g.j-.5)*transfer;
        p.z=.22+(p.z-.22)*transfer;
        const wet=sample.pose==='swim',previous=this.wetGuests.get(g.uid);
        const state={wet,landed:wet&&!previous?.wet?time:previous?.landed??-100,i:wet&&!previous?.wet?p.i:previous?.i??p.i,j:wet&&!previous?.wet?p.j:previous?.j??p.j};this.wetGuests.set(g.uid,state);
        if(wet){const q=gridToScreen(p.i,p.j);fx!.lineStyle(1,0xc3edf6,.65).strokeEllipse(q.x,q.y+2,9+(time%1)*3,4);}
        const age=time-state.landed;if(age>=0&&age<.85){const q=gridToScreen(state.i,state.j),r=3+age*14;fx!.lineStyle(1,0xd7f4fa,1-age/.85).strokeEllipse(q.x,q.y,r*2,r);for(let k=0;k<7;k++){const a=k*Math.PI*2/7,z=(1.8*age-2.9*age*age)*Math.sqrt(512)*Math.cos(Math.PI/6);if(z>0)fx!.fillStyle(0xd7f4fa,1-age/.85).fillRect(q.x+Math.cos(a)*age*16,q.y+Math.sin(a)*age*8-z,1,2);}}
        const pose:NpcV8Pose=sample.pose==='slide'?'ride':(['idle','walk','swim','sit','lie','jump'].includes(sample.pose)?sample.pose:'idle') as NpcV8Pose;
        return {uid:g.uid,di:p.i-f.i-pivot[0],dj:p.j-f.j-pivot[1],z:p.z,pose,heading:craftHeading(Math.cos(p.heading),Math.sin(p.heading))};
      });
      seen.add(f.uid);this.hiddenFacilityIds.add(f.uid);let frame=this.frames.get(f.uid);
      if(!frame){const compositor=new CraftComposite(this.depth,this.provider,spec.logicalSize),texture=this.scene.textures.addCanvas(`static-use-${f.uid}`,compositor.canvas);if(!texture)throw Error('Static use canvas');frame={compositor,texture,image:this.scene.add.image(0,0,texture.key),signature:''};this.frames.set(f.uid,frame);}
      const signature=JSON.stringify([f.defId,f.facing,riders,Math.floor(time*8)]);
      if(signature!==frame.signature){const anchor=frame.compositor.draw(f.defId,f.facing,riders,time*1000,this.depth.slides.get(`watercraft/${f.defId}/${f.facing}`));frame.texture.refresh();frame.image.setOrigin(anchor.ax/frame.compositor.canvas.width,anchor.ay/frame.compositor.canvas.height);frame.signature=signature;}
      const p=gridToScreen(f.i+pivot[0],f.j+pivot[1]),fp=spec.footprintByFacing[f.facing]!;
      frame.image.setPosition(p.x,p.y).setDepth(depthKey(f.i+fp[0]-1,f.j+fp[1]-1)+Z_FACILITY);fx.setDepth(frame.image.depth+.01);
    }
    for(const [uid,fx]of this.waterEffects)if(!seen.has(uid)){fx.destroy();this.waterEffects.delete(uid);}
    for(const uid of this.wetGuests.keys())if(!this.hiddenGuestIds.has(uid))this.wetGuests.delete(uid);
    for(const[uid,f]of this.frames)if(!seen.has(uid)){f.image.destroy();this.scene.textures.remove(f.texture.key);this.frames.delete(uid);}
  }
}

/** Vehicle and rider use the same native camera depth; rails/roofs occlude passengers. */
import type { WatercraftProvider } from '../assets/watercraft.js';
import type { AssetProvider } from '../assets/types.js';
import { npcV8Key, type NpcV8Pose } from '../assets/npc-v8.js';
export interface CraftRider { surfacePose?:string; uid:number; di:number; dj:number; z:number; heading:number; pose:NpcV8Pose }
const TW=Math.sqrt(512), COS=Math.cos(Math.PI/6);
export function riderDepth(di:number,dj:number,z:number):number {return 250+(-.612372435696*(di+dj)-.5*(z-.65))*TW;}
export function craftFacing(h:number):number { return [1,0,3,2][Math.round(h/4)%4]!; }
export class CraftComposite {
  readonly canvas = document.createElement('canvas');
  private readonly ctx:CanvasRenderingContext2D;
  private readonly bases=new Map<string,{rgba:Uint8ClampedArray;depth:Float32Array}>();
  private readonly npcPixels = new Map<string,ImageData>();
  constructor(private readonly art:Pick<WatercraftProvider, 'pixels'|'depths'|'depthOffsets'|'spec'>,private readonly provider:AssetProvider,size:number) {
    this.canvas.width=size+96; this.canvas.height=size+96;
    const ctx=this.canvas.getContext('2d');if(!ctx)throw Error('Craft composite unavailable');this.ctx=ctx;
  }
  draw(id:string,h:number,riders:readonly CraftRider[],timeMs:number,slideMask?:Float32Array,poseMasks?:ReadonlyMap<string,Float32Array>,frontOverlay?:ImageData):{ax:number;ay:number;visible:number[]} {
    const key=`watercraft/${id}/${h}`,base=this.art.pixels.get(key),mask=this.art.depths.get(key),spec=this.art.spec(key);
    if(!base||!mask||!spec)throw Error(`Missing authored craft ${key}`);
    const w=this.canvas.width,ht=this.canvas.height,margin=48;
    const out=this.ctx.createImageData(w,ht);
    let cached=this.bases.get(key);
    if(!cached){
      const rgba=new Uint8ClampedArray(w*ht*4),depth=new Float32Array(w*ht);depth.fill(Infinity);
      const offset=this.art.depthOffsets[id==='peanut'?'peanut_3':id]?.depth_offset??0;
      for(let y=0;y<base.height;y++)for(let x=0;x<base.width;x++){
        const k=y*base.width+x,d=(y+margin)*w+x+margin,alpha=base.data[k*4+3]!;if(!alpha)continue;
        rgba.set(base.data.subarray(k*4,k*4+4),d*4);
        let z=mask[k]!;
        if(!Number.isFinite(z))for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<base.width&&yy<base.height)z=Math.min(z,mask[yy*base.width+xx]!);}
        depth[d]=z+offset;
      }
      cached={rgba,depth};this.bases.set(key,cached);
    }
    out.data.set(cached.rgba);const depth=cached.depth;
    const actorDepth=new Float32Array(w*ht);actorDepth.fill(Infinity);
    const ax=spec.ax+margin,ay=spec.ay+margin,visible:number[]=[];
    for(const rider of riders){
      const nk=npcV8Key(rider.uid,craftFacing(rider.heading),rider.pose,timeMs,'happy'),ns=this.provider.spec(nk),nc=this.provider.canvas(nk);
      if(!ns||!nc){visible.push(0);continue;}
      let pix=this.npcPixels.get(nk);if(!pix){const ctx=nc.getContext('2d');if(!ctx)continue;pix=ctx.getImageData(0,0,nc.width,nc.height);this.npcPixels.set(nk,pix);}
      const qx=ax+16*(rider.di-rider.dj),qy=ay+8*(rider.di+rider.dj)-rider.z*TW*COS;
      const left=Math.round(qx-ns.ax),top=Math.round(qy-ns.ay),zero=riderDepth(rider.di,rider.dj,rider.z);let count=0;
      for(let y=0;y<pix.height;y++)for(let x=0;x<pix.width;x++){
        const p=(y*pix.width+x)*4,a=pix.data[p+3]!;if(!a)continue;
        const xx=left+x,yy=top+y;if(xx<0||yy<0||xx>=w||yy>=ht)continue;
        const k=yy*w+xx,z=zero+.5*(yy+.5-qy)/COS-.35;
        const mx=xx-margin,my=yy-margin, support=poseMasks?.get(`${key}/${rider.surfacePose??rider.pose}`)??(rider.pose==='ride'?slideMask:undefined), override=support&&mx>=0&&my>=0&&mx<base.width&&my<base.height ? support[my*base.width+mx]! : depth[k]!;
        if(z>Math.min(override,actorDepth[k]!)+.08)continue;
        const alpha=a/255,old=out.data[k*4+3]!/255,total=alpha+old*(1-alpha);
        for(let ch=0;ch<3;ch++)out.data[k*4+ch]=Math.round((pix.data[p+ch]!*alpha+out.data[k*4+ch]!*old*(1-alpha))/total);
        out.data[k*4+3]=Math.round(total*255);actorDepth[k]=z;count++;
      }
      visible.push(count);
    }
    if(frontOverlay)for(let y=0;y<frontOverlay.height;y++)for(let x=0;x<frontOverlay.width;x++){
      const src=(y*frontOverlay.width+x)*4,a=frontOverlay.data[src+3]!/255;if(!a)continue;
      const dst=((y+margin)*w+x+margin)*4,old=out.data[dst+3]!/255,total=a+old*(1-a);
      for(let ch=0;ch<3;ch++)out.data[dst+ch]=Math.round((frontOverlay.data[src+ch]!*a+out.data[dst+ch]!*old*(1-a))/total);
      out.data[dst+3]=Math.round(total*255);
    }
    this.ctx.putImageData(out,0,0);return {ax,ay,visible};
  }
}

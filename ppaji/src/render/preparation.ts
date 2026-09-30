import { imagegenArt } from '../assets/imagegen-art.js';
import Phaser from 'phaser';
import { DepthComposite, rgba } from './prep-depth.js';
import type { BoundaryAssets } from './compact-boundary.js';
import type { AssetProvider } from '../assets/types.js';
import { npcV8Key } from '../assets/npc-v8.js';
import type { Guest } from '../sim/guest.js';
import type { PlacedFacility } from '../sim/facility.js';
import { prepPosition } from '../sim/preparation.js';
import { gridToScreen, depthKey, Z_FACILITY } from './iso.js';

/** Reuses authored depth and curtains; actors and shower water remain separate. */
export class PreparationRenderer {
  hiddenGuestIds=new Set<number>(); hiddenFacilityIds=new Set<number>();
  private frames=new Map<number,{display:HTMLCanvasElement;mask:string;composite:DepthComposite;texture:Phaser.Textures.CanvasTexture;image:Phaser.GameObjects.Image}>();
  constructor(private scene:Phaser.Scene,private assets:BoundaryAssets,private provider:AssetProvider){}
  update(facilities:readonly PlacedFacility[],guests:readonly Guest[],time:number):void {
    this.hiddenGuestIds.clear();this.hiddenFacilityIds.clear();const seen=new Set<number>();
    for(const f of facilities){
      if(!['compact_changing','compact_shower'].includes(f.defId)||f.facing!==0)continue;
      const visitors=guests.filter(g=>g.prep?.uid===f.uid && g.prep.phase!=='approach');if(!visitors.length)continue;
      seen.add(f.uid);if(!imagegenArt.get(`fac/${f.defId}/${f.facing}`))this.hiddenFacilityIds.add(f.uid);for(const g of visitors)this.hiddenGuestIds.add(g.uid);
      const closed=f.defId==='compact_changing'?visitors.filter(g=>g.prep!.phase==='using').map(g=>g.prep!.slot).sort():[];
      const mask=closed.join(',');let frame=this.frames.get(f.uid);
      if(!frame || frame.mask!==mask){
        if(frame){frame.image.destroy();this.scene.textures.remove(frame.texture.key);}
        const sprite=(key:string)=>({...this.assets.get(key)!,x:0,y:0,kind:key});
        const composite=new DepthComposite([sprite(f.defId==='compact_changing'?'prep_changing':'prep_shower'),...closed.map(n=>sprite(`curtain_${n}`))]);
        const display=document.createElement('canvas');display.width=composite.canvas.width;display.height=composite.canvas.height;
        const texture=this.scene.textures.addCanvas(`prep-use-${f.uid}`,display);if(!texture)throw Error('Preparation texture');
        frame={display,mask,composite,texture,image:this.scene.add.image(0,0,texture.key).setOrigin(0,0)};this.frames.set(f.uid,frame);
      }
      const pixels:{x:number;y:number;z:number;rgba:number[]}[]=[];
      for(const g of visitors){
        const p=g.prep!,pos=prepPosition(p),di=pos[0]-f.i-1.5,dj=pos[1]-f.j-1;
        const foot={x:96+16*(di-dj),y:107.75755076535926+8*(di+dj)};
        const key=npcV8Key(g.uid,g.facing,p.phase==='using'?'idle':'walk',time,'calm'),image=this.provider.canvas(key),spec=this.provider.spec(key);if(!image||!spec)continue;
        const data=rgba(image),left=Math.round(foot.x-spec.ax),top=Math.round(foot.y-spec.ay);
        for(let y=0;y<data.height;y++)for(let x=0;x<data.width;x++){const n=(y*data.width+x)*4;if(data.data[n+3])pixels.push({x:left+x,y:top+y,z:-13.856406460551*(di+dj)-.57735026919*(foot.y-top-y-.5),rgba:Array.from(data.data.slice(n,n+4))});}
        if(f.defId==='compact_shower' && p.phase==='using')for(let n=0;n<20;n++){
          const h=1.12*(1-(time/650+n/20)%1),x=di+Math.sin(n*8.2)*.12,y=dj+Math.cos(n*3.7)*.1;
          pixels.push({x:96+16*(x-y),y:107.75755076535926+8*(x+y)-h*19.5959179423,z:-13.856406460551*(x+y)-11.313708499*h,rgba:[145,220,236,225]});
        }
      }
      const hd=imagegenArt.get(`fac/${f.defId}/${f.facing}`),x=frame.display.getContext('2d')!;
      x.clearRect(0,0,frame.display.width,frame.display.height);
      if(hd){for(const slot of closed)x.drawImage(this.assets.get(`curtain_${slot}`)!.image,-frame.composite.x,-frame.composite.y,192,192);frame.composite.drawActors(pixels);}else frame.composite.draw(pixels);
      x.imageSmoothingEnabled=false;x.drawImage(frame.composite.canvas,0,0,frame.display.width,frame.display.height);frame.image.setDisplaySize(frame.composite.canvas.width,frame.composite.canvas.height);frame.texture.refresh();const center=gridToScreen(f.i+1.5,f.j+1);
      frame.image.setPosition(center.x-96+frame.composite.x,center.y-107.75755076535926+frame.composite.y).setDepth(depthKey(f.i+2,f.j+1)+Z_FACILITY+.01);
    }
    for(const [uid,frame]of this.frames)if(!seen.has(uid)){frame.image.destroy();this.scene.textures.remove(frame.texture.key);this.frames.delete(uid);}
  }
}

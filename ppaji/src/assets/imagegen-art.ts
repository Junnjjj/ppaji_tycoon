/** Accepted raw ImageGen art, packed at 4x without a second pixelization pass. */
interface Frame { file:string; w:number; h:number; pad?:number }
class ImageGenArt {
  readonly frames=new Map<string,HTMLCanvasElement>();
  private entries:Record<string,Frame>={};
  private pending=new Map<string,Promise<void>>();
  private retry=new Map<string,number>();
  readonly base='./assets/imagegen-art-v1/';
  enabled=false;
  async init():Promise<void>{
    if(new URLSearchParams(location.search).get('art')==='legacy')return;
    const r=await fetch(this.base+'manifest.json');if(!r.ok)throw Error('ImageGen art manifest');
    const m=await r.json() as {entries:Record<string,Frame>};this.entries=m.entries;this.enabled=true;
  }
  private key(id:string):string{return id==='tile/deck'?'fac/float_deck/0':id;}
  get(id:string):HTMLCanvasElement|null{
    const key=this.key(id);if(this.entries[key]&&!this.frames.has(key))void this.load(key);
    return this.frames.get(key)??null;
  }
  size(id:string):Frame|undefined{return this.entries[this.key(id)];}
  async load(id:string):Promise<void>{
    const key=this.key(id),spec=this.entries[key];if(!spec||this.frames.has(key)||Date.now()<(this.retry.get(key)??0))return;
    const active=this.pending.get(key);if(active)return active;
    const request=(async()=>{const im=new Image();im.src=this.base+spec.file;await im.decode();
      if(im.width!==(spec.w+2*(spec.pad??0))*4||im.height!==(spec.h+2*(spec.pad??0))*4)throw Error('ImageGen dimensions '+key);
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d')!.drawImage(im,0,0);this.frames.set(key,c);
    })().catch((error:unknown)=>{this.retry.set(key,Date.now()+10000);console.warn('ImageGen fallback',key,error);}).finally(()=>{this.pending.delete(key);});
    this.pending.set(key,request);return request;
  }
}
export const imagegenArt=new ImageGenArt();

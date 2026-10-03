import {describe,it,expect,vi,afterEach} from 'vitest';
import {CraftComposite} from './watercraft-composite';
import {composeOutdoor,type OutdoorResource} from './outdoor-facilities';
import type {AssetProvider} from '../assets/types';
import {DepthComposite} from './prep-depth.js';

function pixels(w:number,h=w){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)} as ImageData;}
function canvas(w=0,h=w){let im=pixels(w,h);const c={width:w,height:h,getContext:()=>({createImageData:pixels,putImageData:(v:ImageData)=>{im=v;},getImageData:()=>im,drawImage:()=>{}})};return c as unknown as HTMLCanvasElement;}
function provider(d:number):AssetProvider{const im=pixels(d);for(let k=0;k<im.data.length;k+=4)im.data.set([201,30,40,255],k);return{ids:()=>[],spec:id=>({id,w:d,h:d,ax:0,ay:0,density:d,source:'art'}),canvas:()=>({width:d,height:d,getContext:()=>({getImageData:()=>im})}) as unknown as HTMLCanvasElement};}
function bounds(im:ImageData){const xs:number[]=[],ys:number[]=[];for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]){xs.push(x);ys.push(y);}return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
afterEach(()=>vi.unstubAllGlobals());
describe('NPC density survives facility and watercraft composition',()=>{
 it('keeps the same outdoor logical contact and front-mask occlusion at4x',()=>{
  const base=pixels(64),v={base,depth:new Float32Array(4096).fill(0),support:new Float32Array(4096).fill(Infinity)},r:OutdoorResource={size:64,targetZ:0,tileWorld:Math.sqrt(512),camera:{C:[0,0,100],F:[0,0,-1]},views:[v,v,v,v]};
  const actors=[{uid:1,sample:{position:[0,0,0] as [number,number,number],heading:0,pose:'sit',phase:'hold'}}];
  const im={width:256,height:256,data:composeOutdoor(r,0,actors,provider(4),0,true)} as ImageData;
  expect(bounds(im)).toEqual([128,128,131,131]);
  v.support.fill(0);expect(composeOutdoor(r,0,actors,provider(4),0,true).every(v=>v===0)).toBe(true);
 });
 it('keeps craft root, logical extent and occlusion rather than enlarging riders',()=>{
  vi.stubGlobal('document',{createElement:()=>canvas()});
  const key='watercraft/test/0',mask=new Float32Array(64*64).fill(Infinity),art={pixels:new Map([[key,pixels(64)]]),depths:new Map([[key,mask]]),depthOffsets:{},spec:()=>({id:key,w:64,h:64,ax:32,ay:32,source:'art' as const})};
  const c=new CraftComposite(art,provider(4),64),root=c.draw('test',0,[{uid:1,di:0,dj:0,z:0,heading:0,pose:'sit'}],0);
  expect(c.canvas.width/c.density).toBe(160);expect(root.ax/4).toBe(80);expect(root.ay/4).toBe(80);expect(root.visible).toEqual([16]);
  expect(bounds(c.canvas.getContext('2d')!.getImageData(0,0,640,640))).toEqual([320,320,323,323]);
  c.destroy();mask.fill(0);art.pixels.get(key)!.data[(32*64+32)*4+3]=255;const hidden=new CraftComposite(art,provider(4),64);expect(hidden.draw('test',0,[{uid:1,di:0,dj:0,z:0,heading:0,pose:'sit'}],0).visible).toEqual([0]);hidden.destroy();
 });
 it('keeps a lying body above a horizontal support while retaining a front rail',()=>{
  vi.stubGlobal('document',{createElement:()=>canvas()});
  const key='watercraft/test/0',base=pixels(64),mask=new Float32Array(4096),zero=250+(.5*.65)*Math.sqrt(512);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){base.data.set([20,30,40,255],(y*64+x)*4);mask[y*64+x]=zero+1-Math.sqrt(3)*(y+.5-32);}
  const art={pixels:new Map([[key,base]]),depths:new Map([[key,mask]]),depthOffsets:{},spec:()=>({id:key,w:64,h:64,ax:32,ay:32,source:'art' as const})};
  const body=pixels(4,32);for(let k=0;k<body.data.length;k+=4)body.data.set([200,10,10,255],k);
  const npc:AssetProvider={ids:()=>[],spec:id=>({id,w:4,h:32,ax:0,ay:16,density:4,source:'art'}),canvas:()=>({width:4,height:32,getContext:()=>({getImageData:()=>body})}) as unknown as HTMLCanvasElement};
  const c=new CraftComposite(art,npc,64),r={uid:1,di:0,dj:0,z:0,heading:0,pose:'lie' as const};
  expect(c.draw('test',0,[r],0).visible[0]).toBe(128);
  c.destroy();mask[28*64+32]=-1000;const rail=new CraftComposite(art,npc,64);expect(rail.draw('test',0,[r],0).visible[0]).toBe(112);rail.destroy();
 });
 it('preserves subpixel actor coordinates in preparation composition',()=>{
  vi.stubGlobal('document',{createElement:()=>canvas()});vi.stubGlobal('ImageData',class {width:number;height:number;data:Uint8ClampedArray;constructor(w:number,h:number){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}});
  const c=new DepthComposite([{image:canvas(1),depth:new Float32Array([Infinity]),x:0,y:0,kind:'base'}],4);
  const out=c.drawActors([{x:.25,y:.5,z:0,rgba:[200,30,40,255]}]);const im=out.getContext('2d')!.getImageData(0,0,out.width,out.height);expect(bounds(im)).toEqual([193,194,193,194]);
 });
});

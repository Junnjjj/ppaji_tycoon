/* global Image, fetch, document */
// Shared physical-depth boundary geometry from the accepted entrance review.
import {DepthComposite} from './prep-depth.js';
export async function loadCompactBoundary(){
 const assets=new Map();
 await Promise.all(['garden','garden_corner','garden_end','garden_half_neg','garden_half_pos','garden_innercorner','glass_corner','glass_wall','glass_door'].flatMap(kind=>[0,1,2,3].map(async d=>{
 const image=new Image();image.src=`assets/compact-boundary/${kind}/native-d${d}.png`;await image.decode();
 const response=await fetch(`assets/compact-boundary/${kind}/depth-d${d}.bin`);if(!response.ok)throw Error('Boundary depth missing');
 assets.set(`${kind}-${d}`,{image,depth:new Float32Array(await response.arrayBuffer())});
 })));
 for(const kind of ['changing','shower']){
 const image=new Image();image.src=`assets/approved-facilities/compact_${kind}/native-d0.png`;await image.decode();
 assets.set(`prep_${kind}`,{image,depth:new Float32Array(await(await fetch(`assets/compact-boundary/${kind}/depth-d0.bin`)).arrayBuffer())});
 }
 for(let n=0;n<2;n++){const image=new Image();image.src=`assets/compact-boundary/changing/curtain-${n}.png`;await image.decode();assets.set(`curtain_${n}`,{image,depth:new Float32Array(await(await fetch(`assets/compact-boundary/changing/curtain-${n}.bin`)).arrayBuffer())});}
 return assets;
}
export function compactBoundaryLayers(assets,walls,tiles){
 const sprites=[];
 for(const w of walls){const kind=w.door?'glass_door':'glass_wall';sprites.push(sprite(kind,w.d,w.i+.5,w.j+.5));}
 for(const p of junctions(walls))sprites.push(sprite("glass_corner",0,...p));
 for(const g of buildGarden(walls,tiles))sprites.push(sprite(g.kind,g.d,g.i+.5,g.j+.5));
 function sprite(kind,d,i,j){return {...assets.get(`${kind}-${d}`),x:16*(i-j)-96,y:8*(i+j)-107.75755076535926,offset:-13.856406460551*(i+j),kind};}
 const composite=new DepthComposite(sprites),bins=new Map();
 // Keep separate depth bands, rather than placing a flattened perimeter over NPCs.
 for(const [key,fragments]of composite.fragments)for(const f of fragments){
 const band=Math.floor(-f[0]/13.856406460551*4)/4;
 if(!bins.has(band))bins.set(band,new Map());const pixels=bins.get(band);
 if(!pixels.has(key))pixels.set(key,[]);pixels.get(key).push(f);
 }
 const layers=[];
 for(const [band,pixels]of bins){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const key of pixels.keys()){const x=key%composite.width,y=Math.floor(key/composite.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 const canvas=document.createElement('canvas');canvas.width=x1-x0+1;canvas.height=y1-y0+1;const ctx=canvas.getContext('2d'),im=ctx.createImageData(canvas.width,canvas.height);
 for(const [key,fs]of pixels){let red=0,green=0,blue=0,alpha=0;for(const f of fs){const a=f[4]/255;red=f[1]*a+red*(1-a);green=f[2]*a+green*(1-a);blue=f[3]*a+blue*(1-a);alpha=a+alpha*(1-a);}const n=((Math.floor(key/composite.width)-y0)*canvas.width+key%composite.width-x0)*4;im.data.set([red/alpha,green/alpha,blue/alpha,alpha*255],n);}
 ctx.putImageData(im,0,0);layers.push({canvas,x:composite.x+x0,y:composite.y+y0,depth:band*4096+48});
 }return layers;
}
export function buildGarden(walls,tiles){
 // Wall planting is continuous; freestanding decor must leave this border clear.
 const outer=walls.filter(w=>!w.partition&&!w.door);
 const used=new Set(),result=[];
 for(let n=0;n<outer.length;n++){if(used.has(n))continue;const w=outer[n];let paired=false;for(let d=0;d<4;d++){const a=outer.findIndex((v,k)=>!used.has(k)&&v.i===w.i&&v.j===w.j&&v.d===d),b=outer.findIndex((v,k)=>!used.has(k)&&v.i===w.i&&v.j===w.j&&v.d===(d+1)%4);if(a>=0&&b>=0){used.add(a);used.add(b);result.push({...w,d,kind:"garden_corner",front:d!==0});paired=true;break;}}if(paired)continue;used.add(n);const horizontal=w.d%2===0;const adjacent=step=>outer.some(v=>v.d===w.d&&v.i===w.i+(horizontal?step:0)&&v.j===w.j+(horizontal?0:step));result.push({...w,kind:adjacent(-1)&&adjacent(1)?"garden":"garden_end",front:w.d>=2});}
 // At a re-entrant corner, two border strips used to overlap the same quarter square.
 // Trim both to half modules and put ONE dedicated inner-corner planting container there.
 const vertices=new Map();for(const key of tiles){const [i,j]=key.split(',').map(Number);for(const [x,y]of [[i,j],[i+1,j],[i,j+1],[i+1,j+1]])vertices.set(x+','+y,[x,y]);}
 for(const [vx,vy]of vertices.values()){
  const quadrants=[[vx-1,vy-1],[vx,vy-1],[vx,vy],[vx-1,vy]],filled=quadrants.map(q=>tiles.has(q.join(',')));
  if(filled.filter(Boolean).length!==3)continue;const missing=filled.indexOf(false);
  const touching=[];
  for(const g of result){if(g.vertex)continue;const a=g.d===0?[g.i,g.j]:g.d===1?[g.i,g.j]:g.d===2?[g.i,g.j+1]:[g.i+1,g.j];const b=g.d===0?[g.i+1,g.j]:g.d===1?[g.i,g.j+1]:g.d===2?[g.i+1,g.j+1]:[g.i+1,g.j+1];if([a,b].some(q=>q[0]===vx&&q[1]===vy))touching.push(g);}
  if(touching.length<2)continue;
  for(const g of touching){let x=vx-g.i-.5,y=vy-g.j-.5;for(let d=0;d<g.d;d++)[x,y]=[-y,x];g.kind=x<0?'garden_half_pos':'garden_half_neg';}
  result.push({i:vx-.5,j:vy-.5,d:[0,3,2,1][missing],kind:'garden_innercorner',vertex:true,front:missing!==0});
 }
 return result;
}

function junctions(list){const vs=new Map();for(const w of list){const a=w.d===0?[w.i,w.j]:w.d===1?[w.i,w.j]:w.d===2?[w.i,w.j+1]:[w.i+1,w.j];const b=w.d===0?[w.i+1,w.j]:w.d===1?[w.i,w.j+1]:w.d===2?[w.i+1,w.j+1]:[w.i+1,w.j+1];for(const p of[a,b]){const key=p.join(',');if(!vs.has(key))vs.set(key,{p,dirs:new Set()});vs.get(key).dirs.add(w.d%2);}}
 return[...vs.values()].filter(v=>v.dirs.size===2).map(v=>v.p);}

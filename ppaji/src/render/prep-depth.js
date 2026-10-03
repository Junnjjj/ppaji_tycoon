/* global document, ImageData */
// Native-pixel source-over compositing, sorted by physical camera depth per pixel.
// Smaller depth is closer. A corner sprite can be both in front of and behind glass.
const imageCache=new WeakMap();
export function rgba(image){let value=imageCache.get(image);if(!value){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);value=x.getImageData(0,0,c.width,c.height);imageCache.set(image,value);}return value;}
export function blendPixel(fragments){let r=0,g=0,b=0,a=0;for(const f of fragments){const q=f[4]/255,remain=1-q;r=f[1]*q+r*remain;g=f[2]*q+g*remain;b=f[3]*q+b*remain;a=q+a*remain;}return a?[Math.round(r/a),Math.round(g/a),Math.round(b/a),Math.round(a*255)]:[0,0,0,0];}
export class DepthComposite {
 constructor(sprites,density=1){
  this.density=density;
  this.x=Math.floor(Math.min(...sprites.map(s=>s.x)))-48;this.y=Math.floor(Math.min(...sprites.map(s=>s.y)))-48;
  this.width=Math.ceil(Math.max(...sprites.map(s=>s.x+s.image.width)))-this.x+48;this.height=Math.ceil(Math.max(...sprites.map(s=>s.y+s.image.height)))-this.y+48;
  this.fragments=new Map();this.fallbackPixels=0;
  for(const s of sprites){const im=rgba(s.image),ox=Math.round(s.x)-this.x,oy=Math.round(s.y)-this.y;for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const n=y*im.width+x,k=n*4;if(!im.data[k+3])continue;let z=s.depth?s.depth[n]:s.zAt(x,y);if(!Number.isFinite(z)){let best=Infinity;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<im.width&&y+dy>=0&&y+dy<im.height)best=Math.min(best,s.depth[(y+dy)*im.width+x+dx]);z=best;this.fallbackPixels++;}if(!Number.isFinite(z))continue;const key=(oy+y)*this.width+ox+x,frag=[z+(s.offset||0),im.data[k],im.data[k+1],im.data[k+2],im.data[k+3],s.kind];if(!this.fragments.has(key))this.fragments.set(key,[]);this.fragments.get(key).push(frag);}}
  this.base=new Uint8ClampedArray(this.width*this.height*4);for(const [key,fs]of this.fragments){fs.sort((a,b)=>b[0]-a[0]);this.base.set(blendPixel(fs),key*4);}
  this.canvas=document.createElement('canvas');this.canvas.width=this.width*density;this.canvas.height=this.height*density;this.ctx=this.canvas.getContext('2d');this.frame=new ImageData(this.canvas.width,this.canvas.height);this.draw([]);
 }
 draw(dynamic){return this.drawAtDensity(dynamic,false);}
 drawActors(dynamic){return this.drawAtDensity(dynamic,true);}
 drawAtDensity(dynamic,actorsOnly){
  const d=this.density,w=this.canvas.width,h=this.canvas.height;
  this.frame.data.fill(0);
  if(!actorsOnly)for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=(Math.floor(y/d)*this.width+Math.floor(x/d))*4;this.frame.data.set(this.base.subarray(k,k+4),(y*w+x)*4);}
  const updates=new Map();
  for(const p of dynamic){const x=Math.round((p.x-this.x)*d),y=Math.round((p.y-this.y)*d);if(x<0||y<0||x>=w||y>=h)continue;const key=y*w+x,logical=Math.floor(y/d)*this.width+Math.floor(x/d);if(!updates.has(key))updates.set(key,[...(this.fragments.get(logical)||[])]);updates.get(key).push([p.z,...p.rgba,p.kind||'actor']);}
  for(const [key,fs]of updates){fs.sort((a,b)=>b[0]-a[0]);
   if(!actorsOnly){this.frame.data.set(blendPixel(fs),key*4);continue;}
   let r=0,g=0,b=0,a=0;
   for(const f of fs){const q=f[4]/255;if(f[5]==='actor'){r=f[1]*q+r*(1-q);g=f[2]*q+g*(1-q);b=f[3]*q+b*(1-q);a=q+a*(1-q);}else{r*=1-q;g*=1-q;b*=1-q;a*=1-q;}}
   if(a)this.frame.data.set([r/a,g/a,b/a,a*255],key*4);
  }
  this.ctx.putImageData(this.frame,0,0);return this.canvas;
 }
 audit(){let mixed=0,gardenNear=0,glassNear=0,nonMonotone=0;for(const fs of this.fragments.values()){for(let n=1;n<fs.length;n++)if(fs[n-1][0]<fs[n][0])nonMonotone++;const garden=fs.filter(f=>f[5].startsWith('garden')),glass=fs.filter(f=>f[5].startsWith('glass'));if(garden.length&&glass.length){mixed++;if(garden.at(-1)[0]<glass.at(-1)[0])gardenNear++;else glassNear++;}}return{mixedGardenGlassPixels:mixed,gardenNearPixels:gardenNear,glassNearPixels:glassNear,nonMonotone,depthEdgeFallbackPixels:this.fallbackPixels};}
}

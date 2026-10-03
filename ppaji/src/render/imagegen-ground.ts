import Phaser from 'phaser';
import { LEVEL_H, TILE_W, TILE_H } from './iso.js';
import {alignGrout} from './grout-patch.js';
import {TerrainLayers} from './terrain-layers.js';

const DENSITY = 4;
const PERIOD = 8;
const MATERIALS: Readonly<Record<string, number>> = { grass: 0, sand: 1, sandpath: 1, path: 2, sidewalk: 2, indoor: 3, hall: 3, road: 4, river: 5, woodpath: 6, rock: 7, gravel: 7, shallow: 8, pool: 8 };
const canvas = (w: number, h = w): HTMLCanvasElement => Object.assign(document.createElement('canvas'), { width: w, height: h });
interface Surface { patch: HTMLCanvasElement; base: string }
interface GroundPage {texture:Phaser.Textures.CanvasTexture;canvas:HTMLCanvasElement;scratch:HTMLCanvasElement;material:string;z:number;water:boolean;dirty:boolean;frames:Map<string,{i:number;j:number;x:number;y:number}>}
const mod = (n: number): number => ((n % PERIOD) + PERIOD) % PERIOD;

/** HD ground sprites at unchanged 32x16 logical size. Original provider is retained. */
export class ImageGenGround {
  private readonly surfaces: Surface[];
  private readonly pages = new Map<string, GroundPage>();
  private readonly frames = new Map<string,{key:string;frame:string}>();
  uploads=0;
  private regions:TerrainLayers|null=null;
  private flowScene:Phaser.Scene|null=null;
  setWaterTile(scene:Phaser.Scene,img:Phaser.GameObjects.Image,material:string,i:number,j:number,z:number,natural=material):void{
    if(this.flowScene!==scene){this.regions?.destroy();this.flowScene=scene;this.regions=new TerrainLayers(scene,id=>this.background(id));scene.events.once('shutdown',()=>{this.regions?.destroy();this.regions=null;this.flowScene=null;});}
    this.regions!.setTile(img,material,i,j,z,natural);
  }
  setDockCells(cells:{i:number;j:number}[]):void{this.regions?.setDockCells(cells);}
  private lastTime = -1;
  readonly density = DENSITY;
  updates = 0;

  constructor(source: HTMLImageElement) {
    this.surfaces = Array.from({ length: 9 }, (_, index) => {
      const size = Math.floor(source.width / 3 - 4), p = canvas(size * 2), x = p.getContext('2d', { willReadFrequently: true })!;
      for (let v = 0; v < 2; v++) for (let u = 0; u < 2; u++) {
        x.save(); x.translate(u ? size * 2 : 0, v ? size * 2 : 0); x.scale(u ? -1 : 1, v ? -1 : 1);
        x.drawImage(source, index % 3 * source.width / 3 + 2, Math.floor(index / 3) * source.height / 3 + 2, source.width / 3 - 4, source.height / 3 - 4, 0, 0, size, size); x.restore();
      }
      const data = x.getImageData(0, 0, size, size).data, sum = [0, 0, 0];
      for (let k = 0; k < data.length; k += 4) for (let ch = 0; ch < 3; ch++) sum[ch] = sum[ch]! + data[k + ch]!;
      return { patch: index===2||index===3 ? alignGrout(p,index===2?'path':'indoor') : p, base: `rgb(${sum.map(n => Math.round(n / (data.length / 4))).join(',')})` };
    });
  }

  key(scene: Phaser.Scene, material: string, i: number, j: number, z: number): string | null {
    if (MATERIALS[material] === undefined) return null;
    // Equivalent floor names share one page; UV variants are frames, not GPU textures.
    material=Object.keys(MATERIALS).find(name=>MATERIALS[name]===MATERIALS[material])!;
    const a=mod(i),b=mod(j),key=`imagegen-ground/${material}/${a}/${b}/${z}`;
    if(this.frames.has(key))return key;
    const pageKey=`imagegen-ground/atlas/${material}/${z}`,w=TILE_W*DENSITY,h=(TILE_H+z*LEVEL_H)*DENSITY;
    let page=this.pages.get(pageKey);
    if(!page){
      const c=canvas((w+4)*PERIOD,(h+4)*PERIOD),texture=scene.textures.addCanvas(pageKey,c);if(!texture)return null;
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      page={texture,canvas:c,scratch:canvas(w,h),material,z,water:['river','shallow','pool'].includes(material),dirty:false,frames:new Map()};this.pages.set(pageKey,page);
    }
    const x=a*(w+4)+2,y=b*(h+4)+2;
    this.paint(page.scratch,material,a,b,z,0);page.canvas.getContext('2d')!.drawImage(page.scratch,x,y);
    page.texture.add(key,0,x,y,w,h);page.frames.set(key,{i:a,j:b,x,y});page.dirty=true;
    this.frames.set(key,{key:pageKey,frame:key});return key;
  }
  resolve(key:string):{key:string;frame?:string}{return this.frames.get(key)??{key};}
  flush():void{for(const page of this.pages.values())if(page.dirty){page.texture.refresh();page.dirty=false;this.uploads++;}}

  private paint(c: HTMLCanvasElement, material: string, i: number, j: number, z: number, time: number): void {
    const ctx = c.getContext('2d')!, surface = this.surfaces[MATERIALS[material]!]!;
    const water = ['river', 'shallow', 'pool'].includes(material);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(DENSITY, DENSITY);
    if (z > 0) { // Keep existing raised-ground geometry, at source density.
      ctx.fillStyle = surface.base;
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(16, 16); ctx.lineTo(32, 8); ctx.lineTo(32, 8 + z * LEVEL_H); ctx.lineTo(16, 16 + z * LEVEL_H); ctx.lineTo(0, 8 + z * LEVEL_H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
    }
    ctx.save(); ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(32, 8); ctx.lineTo(16, 16); ctx.lineTo(0, 8); ctx.closePath(); ctx.clip();
    ctx.fillStyle = surface.base; ctx.fillRect(0, 0, 32, 16);
    ctx.transform(16, 8, -16, 8, 16, 0);
    const pattern = ctx.createPattern(surface.patch, 'repeat')!;
    const speed = material === 'river' ? .32 : .12;
    pattern.setTransform(new DOMMatrix().translate(-i + (water ? time * speed : 0), -j).scale(PERIOD / surface.patch.width));
    ctx.fillStyle = pattern; ctx.fillRect(-1, -1, 3, 3);
    if (water) {
      const phase = time * .7 + (i * 3 + j * 7) % 11;
      const alpha = Math.max(0, Math.sin(phase)) * .65;
      ctx.strokeStyle = `rgba(235,255,245,${alpha})`; ctx.lineWidth = .055;
      ctx.beginPath(); ctx.moveTo(.12, .5); ctx.quadraticCurveTo(.42, .38, .7, .48); ctx.stroke();
    }
    ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  tick(timeMs: number, paused: boolean): void {
    this.regions?.tick(timeMs,paused);if(paused)return;
    if(timeMs-this.lastTime<100)return;this.lastTime=timeMs;this.updates++;
    // Raised pools retain their individual column geometry.
    for(const page of this.pages.values())if(page.water&&page.z>0){const ctx=page.canvas.getContext('2d')!;for(const f of page.frames.values()){this.paint(page.scratch,page.material,f.i,f.j,page.z,timeMs/1000);ctx.clearRect(f.x,f.y,page.scratch.width,page.scratch.height);ctx.drawImage(page.scratch,f.x,f.y);}page.dirty=true;}
    this.flush();
  }

  background(id: string): { canvas: HTMLCanvasElement; density: number } | null {
    const material = id.replace('tile/', '').split(':')[0]!, n = MATERIALS[material];
    if (n === undefined) return null;
    const surface = this.surfaces[n]!, c = canvas(PERIOD * TILE_W * DENSITY, PERIOD * TILE_H * DENSITY), x = c.getContext('2d')!;
    x.fillStyle = surface.base; x.fillRect(0,0,c.width,c.height);
    x.setTransform(16*DENSITY,8*DENSITY,-16*DENSITY,8*DENSITY,0,0);
    const pattern = x.createPattern(surface.patch,'repeat')!;
    pattern.setTransform(new DOMMatrix().scale(PERIOD/surface.patch.width));
    x.fillStyle=pattern; x.fillRect(-PERIOD*2,-PERIOD*2,PERIOD*4,PERIOD*4);
    return {canvas:c,density:DENSITY};
  }

  stats(): { waterTextures: number; updates: number; density: number;pages:number;uploads:number;flowTiles:number;flowLayers:number } { return { waterTextures:[...this.pages.values()].filter(p=>p.water).length, updates:this.updates,density:DENSITY,pages:this.pages.size,uploads:this.uploads,flowTiles:this.regions?.stats().waterCells??0,flowLayers:this.regions?.stats().waterLayers??0 }; }
}

export async function loadImageGenGround(): Promise<ImageGenGround | null> {
  if (new URLSearchParams(location.search).get('ground') === 'legacy') return null;
  try { const im = new Image(); im.src = './assets/imagegen-ground-v1/source.png'; await im.decode(); return new ImageGenGround(im); }
  catch (error) { console.warn('이미지젠 바닥 로드 실패, 기존 바닥 유지', error); return null; }
}

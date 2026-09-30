/** Edge-aware background tiles; roads and water continue from the current map. */
import Phaser from 'phaser';
import { STEP_X, STEP_Y, TILE_W, TILE_H, gridToScreen, lift, screenToTile } from './iso.js';
import { type Grid, type FloorCode } from '../sim/grid.js';
import { worldBounds } from './camera.js';
import { exteriorTile, exteriorSignature } from './exterior.js';

/** 아이소 마름모 한 장을 32×16 직사각 반복 텍스처로 — 가운데 한 장 + 네 귀퉁이 반 장씩 */
export function tileableFromDiamond(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_W; c.height = TILE_H;
  const g = c.getContext('2d');
  if (!g) return c;
  for (const [dx, dy] of [[0, 0], [-STEP_X, -STEP_Y], [STEP_X, -STEP_Y], [-STEP_X, STEP_Y], [STEP_X, STEP_Y]] as const) g.drawImage(src, dx, dy);
  return c;
}

export interface SurroundBands { water: number; road: [number, number]; stop: number; band: number }
export const SURROUND_WATER_EXTRA = 0; // P48-b3: 본류가 S 라 격자 안 아래쪽(행 45~71 가운데)은 건너편 뭍이다 — 격자 아래 바깥도 뭍이어야 이어진다. 양옆 바깥은 옛 띠(행 50~71)가 곧게 이어진다

export class Surround {
  private images: Phaser.GameObjects.Image[] = [];
  private signature='';
  private textureKeys:string[]=[];
  private revision=0;
  constructor(private readonly scene: Phaser.Scene, private readonly grid: Grid,
    private readonly textureOf: (floor: FloorCode, i: number, j: number, level: number) => {key:string;frame?:string;scale:number;tint?:number}) {}

  build(compact=false,season=0): void {
    const signature=exteriorSignature(this.grid,compact)+`/${season}`;
    if(signature===this.signature)return;
    this.destroy();this.signature=signature;
    // Bake the whole camera rectangle in small chunks, avoiding both giant GPU
    // textures and thousands of background display objects. No stencil masks.
    const bounds=worldBounds(this.grid.w,this.grid.h),pad=128,chunk=512,density=2;
    const x0=Math.floor((bounds.minX-pad)/chunk)*chunk,y0=Math.floor((bounds.minY-pad)/chunk)*chunk;
    const x1=Math.ceil((bounds.maxX+pad)/chunk)*chunk,y1=Math.ceil((bounds.maxY+pad)/chunk)*chunk;
    const chunks=new Map<string,{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;x:number;y:number}>();
    for(let y=y0;y<y1;y+=chunk)for(let x=x0;x<x1;x+=chunk){
      const canvas=Object.assign(document.createElement('canvas'),{width:chunk*density,height:chunk*density});
      const ctx=canvas.getContext('2d')!;ctx.scale(density,density);chunks.set(`${x},${y}`,{canvas,ctx,x,y});
    }
    const corners=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y])=>screenToTile(x!,y!));
    const imin=Math.min(...corners.map(t=>t.i))-2,imax=Math.max(...corners.map(t=>t.i))+2;
    const jmin=Math.min(...corners.map(t=>t.j))-2,jmax=Math.max(...corners.map(t=>t.j))+2;
    const tinted=new Map<string,HTMLCanvasElement>();
    for(let j=jmin;j<=jmax;j++)for(let i=imin;i<=imax;i++){
      if(this.grid.inside(i,j))continue;
      const p=gridToScreen(i,j);if(p.x<x0-32||p.x>x1+32||p.y<y0-64||p.y>y1)continue;
      const tile=exteriorTile(this.grid,i,j,compact),t=this.textureOf(tile.floor,i,j,tile.level);
      const frame=this.scene.textures.getFrame(t.key,t.frame);if(!frame)continue;
      let source=frame.source.image as HTMLCanvasElement;
      let sx=frame.cutX,sy=frame.cutY;
      if(t.tint!==undefined&&t.tint!==0xffffff){
        const id=`${t.key}/${t.frame}/${t.tint}`;let cached=tinted.get(id);
        if(!cached){cached=Object.assign(document.createElement('canvas'),{width:frame.cutWidth,height:frame.cutHeight});const ctx=cached.getContext('2d')!;
          ctx.drawImage(source,sx,sy,frame.cutWidth,frame.cutHeight,0,0,frame.cutWidth,frame.cutHeight);
          ctx.globalCompositeOperation='multiply';ctx.fillStyle=`#${t.tint.toString(16).padStart(6,'0')}`;ctx.fillRect(0,0,cached.width,cached.height);
          ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,sx,sy,frame.cutWidth,frame.cutHeight,0,0,frame.cutWidth,frame.cutHeight);tinted.set(id,cached);}
        source=cached;sx=0;sy=0;
      }
      const w=frame.cutWidth*t.scale,h=frame.cutHeight*t.scale,left=p.x-w/2,top=p.y+lift(tile.level);
      for(let cy=Math.floor(top/chunk)*chunk;cy<=top+h;cy+=chunk)for(let cx=Math.floor(left/chunk)*chunk;cx<=left+w;cx+=chunk){
        const part=chunks.get(`${cx},${cy}`);if(!part)continue;
        part.ctx.drawImage(source,sx,sy,frame.cutWidth,frame.cutHeight,left-cx,top-cy,w,h);
      }
    }
    for(const part of chunks.values()){
      const key=`surround/chunk/${++this.revision}`;this.scene.textures.addCanvas(key,part.canvas);this.textureKeys.push(key);
      this.images.push(this.scene.add.image(part.x,part.y,key).setOrigin(0,0).setScale(1/density).setDepth(-100));
    }
  }

  count():number{return this.images.length;}
  destroy():void {for(const image of this.images)image.destroy();this.images=[];for(const key of this.textureKeys)this.scene.textures.remove(key);this.textureKeys=[];this.signature='';}
}

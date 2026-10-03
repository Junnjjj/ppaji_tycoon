import type Phaser from 'phaser';
import {roundedRegion,rowRegions,type TerrainCell,type TerrainPolygon} from './terrain-regions.js';
interface Cell extends TerrainCell {img:Phaser.GameObjects.Image;material:string;z:number;natural:string}
interface Layer {sprite:Phaser.GameObjects.TileSprite;graphics:Phaser.GameObjects.Graphics;mask:Phaser.Display.Masks.GeometryMask;speed:number}
const water=(m:string)=>['river','shallow','pool'].includes(m);
const aliases:Record<string,string>={sandpath:'sand',sidewalk:'path',hall:'indoor',gravel:'rock'};
/** Live union surfaces. Rebuilt once after tile/facility changes; original grid stays authoritative. */
export class TerrainLayers {
 private cells=new Map<string,Cell>();
 private layers=new Map<string,Layer>();
 private textureKeys=new Set<string>();
 private dockCells=new Set<string>();
 private dockSignature='';
 private dirty=true;
 private flowTime=0;
 private previousTime:number|null=null;
 rebuilds=0;
 constructor(private scene:Phaser.Scene,private background:(id:string)=>{canvas:HTMLCanvasElement;density:number}|null){}
 setTile(img:Cell['img'],material:string,i:number,j:number,z:number,natural:string):void{
  this.cells.set(`${i},${j}`,{img,material:aliases[material]??material,i,j,z,natural});this.dirty=true;
 }
 setDockCells(cells:TerrainCell[]):void{
  const keys=cells.map(c=>`${c.i},${c.j}`).sort(),signature=keys.join(';');if(signature===this.dockSignature)return;
  this.dockSignature=signature;this.dockCells=new Set(keys);this.dirty=true;
 }
 private surface(id:string,material:string,polygons:TerrainPolygon[],depth:number,speed=0,tint=0xffffff):void{
  let layer=this.layers.get(id);
  if(!layer){
   const key='imagegen-ground/region/'+material,art=this.background('tile/'+material);if(!art)return;
   if(!this.scene.textures.exists(key)){this.scene.textures.addCanvas(key,art.canvas)?.setFilter(1);this.textureKeys.add(key);}
   const sprite=this.scene.add.tileSprite(-2048,-256,4096,4096,key).setOrigin(0,0).setTileScale(1/art.density);
   const graphics=this.scene.make.graphics({x:0,y:0},false),mask=graphics.createGeometryMask();sprite.setMask(mask);
   layer={sprite,graphics,mask,speed};this.layers.set(id,layer);
  }
  layer.sprite.setVisible(true).setDepth(depth).setTint(tint);layer.speed=speed;layer.graphics.clear().fillStyle(0xffffff,1);
  for(const polygon of polygons)layer.graphics.fillPoints(polygon,true);
 }
 private rebuild():void{
  if(!this.dirty)return;this.dirty=false;this.rebuilds++;
  for(const l of this.layers.values())l.sprite.setVisible(false);
  const groups=new Map<string,{material:string;tint:number;cells:Cell[]}>(),wet:TerrainCell[]=[],deep:TerrainCell[]=[],protect=new Set<string>();
  for(const [key,c]of this.cells){
   c.img.setVisible(true);
   if(c.z!==0){protect.add(key);continue;}
   if(c.material==='deck'){
    c.img.setDepth(-76).setVisible(!this.dockCells.has(key));protect.add(key);
    if(water(c.natural)){wet.push(c);if(c.natural==='river')deep.push(c);}continue;
   }
   if(water(c.material)){wet.push(c);if(c.material==='river')deep.push(c);c.img.setVisible(false);continue;}
   if(!c.img.texture.key.startsWith('imagegen-ground/'))continue;
   const tint=c.img.tintTopLeft,id=c.material+'/'+tint,g=groups.get(id)??{material:c.material,tint,cells:[]};g.cells.push(c);groups.set(id,g);
  }
  for(const [id,g]of groups){this.surface('land/'+id,g.material,rowRegions(g.cells),-79.99,0,g.tint);for(const c of g.cells)c.img.setVisible(false);}
  if(wet.length){
   this.surface('water-base','sand',rowRegions(wet),-79);
   this.surface('shallow','shallow',roundedRegion(wet,.22,protect).polygons,-78.8,.12);
  }
  if(deep.length)this.surface('river','river',roundedRegion(deep,.22,protect).polygons,-78.6,.32);
  // Remove obsolete tint/material groups after edits rather than retaining masks forever.
  for(const [id,l]of this.layers)if(!l.sprite.visible){l.sprite.clearMask();l.mask.destroy();l.sprite.destroy();l.graphics.destroy();this.layers.delete(id);}
 }
 tick(timeMs:number,paused:boolean):void{
  this.rebuild();
  if(this.previousTime!==null&&!paused)this.flowTime+=Math.max(0,timeMs-this.previousTime)/1000;
  this.previousTime=timeMs;
  for(const l of this.layers.values())l.sprite.setTilePosition((-2048-this.flowTime*l.speed*16)*4,(-256-this.flowTime*l.speed*8)*4);
 }
 stats(){return{cells:this.cells.size,layers:this.layers.size,waterCells:[...this.cells.values()].filter(c=>c.z===0&&water(c.material)).length,waterLayers:[...this.layers.values()].filter(l=>l.speed>0).length,rebuilds:this.rebuilds};}
 destroy():void{
  for(const l of this.layers.values()){l.sprite.clearMask();l.mask.destroy();l.sprite.destroy();l.graphics.destroy();}this.layers.clear();this.cells.clear();
  for(const key of this.textureKeys)this.scene.textures.remove(key);this.textureKeys.clear();
 }
}

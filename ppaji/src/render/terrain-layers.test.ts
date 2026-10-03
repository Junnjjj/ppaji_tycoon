import {describe,it,expect,vi} from 'vitest';
import {TerrainLayers} from './terrain-layers';
import {rowRegions,roundedRegion} from './terrain-regions';
import type Phaser from 'phaser';
class MockNode {
 visible=true;texture={key:'imagegen-ground/test'};tintTopLeft=0xffffff;depth=0;
 setOrigin=vi.fn(()=>this);setTileScale=vi.fn(()=>this);setTilePosition=vi.fn(()=>this);setMask=vi.fn(()=>this);clearMask=vi.fn(()=>this);
 fillStyle=vi.fn(()=>this);fillPoints=vi.fn(()=>this);clear=vi.fn(()=>this);destroy=vi.fn(()=>this);
 setVisible=vi.fn((v:boolean)=>(this.visible=v,this));setDepth=vi.fn((v:number)=>(this.depth=v,this));setTint=vi.fn((v:number)=>(this.tintTopLeft=v,this));
 createGeometryMask=()=>({destroy:vi.fn()});
}
const node=()=>new MockNode() as unknown as MockNode & Phaser.GameObjects.Image;
function fixture(){const made:MockNode[]=[],scene={textures:{exists:()=>false,addCanvas:()=>({setFilter:()=>{}}),remove:vi.fn()},add:{tileSprite:()=>{const n=node();made.push(n);return n;}},make:{graphics:()=>node()}};const r=new TerrainLayers(scene as unknown as Phaser.Scene,()=>({canvas:{} as HTMLCanvasElement,density:4}));return{r,made,scene};}
describe('terrain union lifecycle',()=>{
 it('coalesces shared edges, rounds only union corners and protects rigid cells',()=>{
  expect(rowRegions([{i:1,j:0},{i:0,j:0}])).toHaveLength(1);
  expect(roundedRegion([{i:0,j:0}],.22,new Set()).cuts).toBe(4);
  expect(roundedRegion([{i:0,j:0}],.22,new Set(['0,0'])).cuts).toBe(0);
  expect(roundedRegion([{i:0,j:0},{i:1,j:0},{i:0,j:1}],.22,new Set()).fills).toBe(1);
 });
 it('rebuilds on material/height edits, restores raised geometry and preserves tint groups',()=>{
  const {r,made}=fixture(),a=node(),b=node();b.tintTopLeft=0x667744;
  r.setTile(a,'grass',0,0,0,'grass');r.setTile(b,'grass',1,0,0,'grass');r.tick(0,true);
  expect(r.stats().layers).toBe(2);expect(a.visible).toBe(false);expect(made.map(n=>n.tintTopLeft)).toEqual([0xffffff,0x667744]);
  r.setTile(a,'river',0,0,0,'river');r.tick(100,true);expect(r.stats().waterLayers).toBe(2);expect(r.stats().rebuilds).toBe(2);
  r.setTile(a,'grass',0,0,1,'grass');r.tick(200,true);expect(a.visible).toBe(true);expect(r.stats().waterLayers).toBe(0);expect(r.stats().layers).toBe(1);
  r.tick(250,true);expect(r.stats().rebuilds).toBe(3);
 });
 it('moves dock occlusion with the facility, removes it on deletion, and keeps deck above water',()=>{
  const {r}=fixture(),a=node(),b=node();r.setTile(a,'deck',0,0,0,'river');r.setTile(b,'deck',1,0,0,'shallow');r.setDockCells([{i:0,j:0}]);r.tick(0,false);
  expect(a.visible).toBe(false);expect(b.visible).toBe(true);expect(b.depth).toBe(-76);
  r.setDockCells([{i:1,j:0}]);r.tick(100,false);expect(a.visible).toBe(true);expect(b.visible).toBe(false);
  r.setDockCells([]);r.tick(200,false);expect(b.visible).toBe(true);
 });
 it('keeps water still during pause and releases scene objects and textures',()=>{
  const {r,made,scene}=fixture();r.setTile(node(),'river',0,0,0,'river');r.tick(0,false);r.tick(1000,false);
  const water=made.find(n=>n.depth===-78.6)!,before=water.setTilePosition.mock.lastCall;r.tick(2000,true);expect(water.setTilePosition.mock.lastCall).toEqual(before);
  r.tick(3000,false);expect(water.setTilePosition.mock.lastCall).not.toEqual(before);r.destroy();expect(made.every(n=>n.destroy.mock.calls.length===1)).toBe(true);expect(scene.textures.remove).toHaveBeenCalledTimes(3);
 });
});

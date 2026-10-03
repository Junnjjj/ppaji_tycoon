import interactionArt from '../data/imagegen-interactions.json';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import contracts from '../data/outdoor-facility-contracts.json';
import attendants from '../data/facility-attendants.json';
import { OutdoorFacilityRenderer } from './outdoor-facilities.js';
import type Phaser from 'phaser';
import type { ApprovedFacilityProvider } from '../assets/approved-facilities.js';
import { composeOutdoor, outdoorDepthAt, outdoorFacing, outdoorVisitorMatches, projectOutdoor, rotateOutdoor, validateOutdoorMask, type OutdoorResource } from './outdoor-facilities.js';
import { npcV8Frame, npcV8Key } from '../assets/npc-v8.js';
import type { AssetProvider } from '../assets/types.js';
import type { Guest } from '../sim/guest.js';
import type { PlacedFacility } from '../sim/facility.js';
import type { OutdoorSample } from '../sim/outdoor-activity.js';
const root=new URL('../../public/assets/approved-facilities/',import.meta.url);
const read=(p:string)=>readFileSync(new URL(p,root));
const readJSON=(p:string)=>JSON.parse(read(p).toString());
const emptyProvider: AssetProvider={ids:()=>[],spec:()=>{throw Error('hidden actor requested an NPC');},canvas:()=>null};
function fixture(depth=Infinity,support=Infinity): OutdoorResource {
  const base={width:64,height:64,data:new Uint8ClampedArray(64*64*4)} as ImageData;
  const view={base,depth:new Float32Array(64*64).fill(depth),support:new Float32Array(64*64).fill(support)};
  return {size:64,targetZ:0,tileWorld:Math.sqrt(512),camera:{C:[0,0,100],F:[0,0,-1]},views:[view,view,view,view]};
}
const onePixelProvider: AssetProvider={ids:()=>[],spec:id=>({id,w:1,h:1,ax:0,ay:0,source:'art'}),canvas:()=>({width:1,height:1,getContext:()=>({getImageData:()=>({width:1,height:1,data:new Uint8ClampedArray([200,30,40,255])})})} as unknown as HTMLCanvasElement)};
const actor=(sample:Partial<OutdoorSample>={})=>({uid:1,sample:{position:[0,0,0] as [number,number,number],heading:0,pose:'idle',phase:'hold',...sample}});
describe('approved outdoor depth resources',()=>{
  it('validates original and adopted physical depth/support masks and metadata',()=>{
    let count=0;const custom=interactionArt as Record<string,{physical?:boolean;painter?:boolean}>;
    for(const id of Object.keys(contracts)){
      if(custom[id]?.painter)continue;
      const path=custom[id]?.physical?'../imagegen-interactions-v1/'+id:id;
      const meta=readJSON(`${path}/depth-metadata.json`);
      expect(meta.camera.C).toHaveLength(3);expect(meta.camera.F).toHaveLength(3);
      for(let d=0;d<4;d++)for(const kind of ['depth','support']){
        const bytes=read(`${path}/${kind}-d${d}.bin`),copy=Uint8Array.from(bytes);
        const values=validateOutdoorMask(copy.buffer,meta.native,`${id}/${kind}/${d}`);
        expect(values.some(Number.isFinite)).toBe(true);if(kind==='depth')count++;
      }
    }
    expect(count).toBe((Object.keys(contracts).length-Object.values(custom).filter(c=>c.painter).length)*4);
  });
  it('validates the four fixed attendants and all sixteen staff depth/support pairs',()=>{
    expect(Object.keys(attendants)).toHaveLength(4);
    for(const [id,a] of Object.entries(attendants)){
      expect(a.uid).toBeLessThan(0);
      const meta=readJSON(`${id}/staff-depth-metadata.json`);
      for(let d=0;d<4;d++)for(const kind of ['depth','support']){
        const bytes=Uint8Array.from(read(`${id}/staff-${kind}-d${d}.bin`));
        expect(validateOutdoorMask(bytes.buffer,meta.native,id).some(Number.isFinite)).toBe(true);
      }
    }
  });
  it('rejects truncated and NaN masks before hiding a base facility',()=>{
    expect(()=>validateOutdoorMask(new ArrayBuffer(3),1,'bad')).toThrow('size');
    expect(()=>validateOutdoorMask(new Float32Array([NaN]).buffer,1,'bad')).toThrow('Invalid');
  });
  it('uses the authored camera rather than the craft target 0.65',()=>{
    for(const id of ['pavilion','bungee_jump']){
      const meta=readJSON(`${id}/depth-metadata.json`),c=(contracts as unknown as Record<string,{cameraTargetZTiles:number;logicalSize:number}>)[id]!;
      expect(outdoorDepthAt([0,0,c.cameraTargetZTiles],meta.camera,meta.tileWorld)).toBeCloseTo(id==='bungee_jump'?300:250,3);
      for(const coordinate of projectOutdoor([0,0,c.cameraTargetZTiles],c.logicalSize,c.cameraTargetZTiles))expect(coordinate).toBeCloseTo(c.logicalSize/2,10);
      expect(outdoorDepthAt([0,0,0],meta.camera)).not.toBeCloseTo(250+.5*.65*Math.sqrt(512),1);
    }
    expect(rotateOutdoor([2,3,4],1)).toEqual([-3,2,4]);
    expect([0,1,2,3].map(d=>outdoorFacing(d*Math.PI/2))).toEqual([0,3,2,1]);
  });
});
describe('actual outdoor NPC composition',()=>{
  it('draws support contacts but keeps the front roof/post depth in control',()=>{
    const seated=composeOutdoor(fixture(0,Infinity),0,[actor({pose:'sit'})],onePixelProvider,0);
    expect(seated[(32*64+32)*4+3]).toBe(255);
    const standing=composeOutdoor(fixture(0,Infinity),0,[actor()],onePixelProvider,0);
    expect(standing.every(v=>v===0)).toBe(true);
    const behindPost=composeOutdoor(fixture(0,0),0,[actor({pose:'sit'})],onePixelProvider,0);
    expect(behindPost.every(v=>v===0)).toBe(true);
  });
  it('suppresses hidden ascent body and every overlay, even if stale effects exist',()=>{
    const image=composeOutdoor(fixture(),0,[actor({hidden:true,pose:'cheer_jump',rope:{from:[0,0,0],to:[1,0,0],mode:'elastic'},harness:{position:[0,0,0],attachment:[0,0,1]},effects:[{kind:'flash',position:[0,0,0]},{kind:'music',position:[0,0,0]}]})],emptyProvider,0);
    expect(image.every(v=>v===0)).toBe(true);
  });
  it('renders the specified rope, harness and flash colors from the sample',()=>{
    const image=composeOutdoor(fixture(),0,[actor({position:[10,10,0],rope:{from:[-.8,0,0],to:[-.4,0,0],mode:'elastic'},harness:{position:[.5,0,0],attachment:[.7,0,.5]},effects:[{kind:'flash',position:[0,0,1]}]})],onePixelProvider,0);
    const colors=new Set(Array.from({length:image.length/4},(_,k)=>Array.from(image.slice(k*4,k*4+4)).join(',')));
    expect(colors.has('43,135,181,255')).toBe(true);expect(colors.has('38,205,215,255')).toBe(true);expect(colors.has('255,250,207,255')).toBe(true);
  });
  it('requires matching actual visitor target and unchanged facility placement',()=>{
    const f={uid:77,defId:'pavilion',i:4,j:5,facing:0} as PlacedFacility;
    const g={uid:1,target:{kind:'facility',uid:77},outdoor:{...f,slotId:'bench-1'}} as unknown as Guest;
    expect(outdoorVisitorMatches(g,f)).toBe(true);
    expect(outdoorVisitorMatches({...g,target:{kind:'facility',uid:88}},f)).toBe(false);
    expect(outdoorVisitorMatches(g,{...f,i:6})).toBe(false);
    expect(outdoorVisitorMatches(g,{...f,facing:1})).toBe(false);
    expect(outdoorVisitorMatches({...g,outdoor:undefined} as unknown as Guest,f)).toBe(false);
  });
  it('selects actual cheer_jump atlas art for all 54 identities and four facings',()=>{
    const atlas=JSON.parse(readFileSync(new URL('../../public/assets/kairo-npc-v8/atlas.json',import.meta.url),'utf8'));
    for(let uid=1;uid<=54;uid++)for(let facing=0;facing<4;facing++){
      const key=npcV8Key(uid,facing,'cheer_jump',0,'happy'),frame=npcV8Frame(key);
      expect(key).toContain('_cheer_jump/');expect(frame).not.toBeNull();expect(atlas.frames[frame!.frame]).toBeDefined();
      expect(frame!.frame).not.toContain('_idle/');
    }
  });
});

describe('outdoor renderer lifecycle',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  function setup(provider=onePixelProvider){
    const destroyed=vi.fn(),removed=vi.fn(),position=vi.fn(),origin=vi.fn(),depth=vi.fn(),scale=vi.fn();
    const image={setOrigin:origin,setPosition:position,setDepth:depth,setScale:scale,destroy:destroyed};
    origin.mockReturnValue(image);position.mockReturnValue(image);depth.mockReturnValue(image);scale.mockReturnValue(image);
    const scene={textures:{addCanvas:(key:string)=>({key,refresh:vi.fn()}),remove:removed},add:{image:()=>image}} as unknown as Phaser.Scene;
    const context={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:vi.fn()};
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
    const art={manifest:readJSON('manifest.json')} as ApprovedFacilityProvider;
    const resources=new Map([['pavilion',fixture()],['watchtower',fixture()]]);
    const renderer=new OutdoorFacilityRenderer(scene,art,provider,{resources,errors:new Map()});
    const f={uid:77,defId:'pavilion',i:4,j:5,facing:0} as PlacedFacility;
    const g={uid:1,state:'use',target:{kind:'facility',uid:77},outdoor:{...f,slotId:'bench-1',segment:0,elapsed:0,segments:[{phase:'hold',path:[[0,0,0]],ticks:80,pose:'sit',heading:0}]}} as unknown as Guest;
    return {renderer,f,g,destroyed,removed,position};
  }
  it('hides only a sampled real guest, applies elevation, and cleans the visit frame on departure',()=>{
    const {renderer,f,g,destroyed,removed,position}=setup();
    renderer.update([f],[g],0,()=>-24);
    expect(renderer.hiddenGuestIds.has(1)).toBe(true);expect(renderer.hiddenFacilityIds.has(77)).toBe(true);
    // Pavilion pivot (1.5,1.5), world screen Y=(5.5+6.5)*8 and shared terrain lift.
    expect(position).toHaveBeenCalledWith(-16,72);
    renderer.update([f],[],0,()=>-24);
    expect(renderer.hiddenGuestIds.size).toBe(0);expect(renderer.hiddenFacilityIds.size).toBe(0);
    expect(destroyed).toHaveBeenCalledOnce();expect(removed).toHaveBeenCalledWith('outdoor-use-77');
  });
  it('restores ordinary base and guest visibility on an NPC resource failure',()=>{
    const error=vi.spyOn(console,'error').mockImplementation(()=>{});
    const {renderer,f,g}=setup({ids:()=>[],spec:()=>null,canvas:()=>null});
    renderer.update([f],[g],0,()=>0);
    expect(renderer.hiddenGuestIds.size).toBe(0);expect(renderer.hiddenFacilityIds.size).toBe(0);expect(error).toHaveBeenCalledOnce();error.mockRestore();
  });
  it('renders fixed staff without guests or guest reservations and destroys them on removal',()=>{
    const {renderer,f,destroyed}=setup();
    renderer.update([{...f,defId:'watchtower'}],[],0,()=>0);
    expect(renderer.hiddenGuestIds.size).toBe(0);expect(renderer.hiddenFacilityIds.has(77)).toBe(true);
    renderer.update([],[],0,()=>0);expect(destroyed).toHaveBeenCalledOnce();
  });
});

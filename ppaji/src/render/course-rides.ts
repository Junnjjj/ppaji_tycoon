import { imagegenArt } from '../assets/imagegen-art.js';
import Phaser from 'phaser';
import type { AssetProvider } from '../assets/types.js';
import { craftHeading, type WatercraftProvider } from '../assets/watercraft.js';
import { CraftComposite, craftFacing, type CraftRider } from './watercraft-composite.js';
import { npcV8Key, staffNpcSeed, type NpcV8Pose } from '../assets/npc-v8.js';
import { tileCenter, depthKey, Z_FACILITY, Z_GUEST } from './iso.js';
import { CAST_OFF_FRACTION } from '../sim/course/ride.js';
import type { RideScene, RideVehicleView } from '../sim/course/ride-view.js';
const HEIGHT=Math.sqrt(512)*Math.cos(Math.PI/6);
function heading(a:number):number{return craftHeading(Math.cos(a),Math.sin(a));}
function local(p:readonly number[],h:number):{di:number;dj:number;z:number}{const a=h*Math.PI/8;return {di:p[0]!*Math.cos(a)-p[1]!*Math.sin(a),dj:-(p[0]!*Math.sin(a)+p[1]!*Math.cos(a)),z:p[2]??0};}
function pose(s:string):NpcV8Pose{return s==='slide'?'ride':s==='jump'?'jump':(['idle','walk','swim','sit','lie','ride'].includes(s)?s:'idle') as NpcV8Pose;}
interface CraftImage {base:Phaser.GameObjects.Image;image:Phaser.GameObjects.Image; compositor:CraftComposite; signature:string; texture:Phaser.Textures.CanvasTexture;}
/** Read-only presentation of simulation-owned departures. No fees, rolls or guest creation. */
export class CourseRideRenderer {
  private readonly craft = new Map<string,CraftImage>();
  private readonly actors = new Map<number,Phaser.GameObjects.Image>();
  private readonly effects = new Map<string,Phaser.GameObjects.Graphics>();
  private readonly rope = new Map<string,Phaser.GameObjects.Graphics>();
  readonly hiddenGuestIds = new Set<number>();
  private sequence=0;
  private readonly motion = new Map<string,{time:number;at:number;duration:number;from:{i:number;j:number;z:number};to:{i:number;j:number;z:number}}>();
  private follow(key:string,i:number,j:number,z:number,time:number):{i:number;j:number;z:number} {
    const now=this.scene.time.now;let m=this.motion.get(key);const value=(s:NonNullable<typeof m>):{i:number;j:number;z:number}=>{const t=Math.max(0,Math.min(1,(now-s.at)/s.duration));return {i:s.from.i+(s.to.i-s.from.i)*t,j:s.from.j+(s.to.j-s.from.j)*t,z:s.from.z+(s.to.z-s.from.z)*t};};
    if(!m||Math.abs(time-m.time)>.5){m={time,at:now,duration:125,from:{i,j,z},to:{i,j,z}};this.motion.set(key,m);}
    else if(m.time!==time){const from=value(m);m={time,at:now,duration:Math.max(16,Math.min(125,now-m.at)),from,to:{i,j,z}};this.motion.set(key,m);}
    return value(m);
  }
  private readonly lastBounce=new Map<string,number>();
  private readonly impacts=new Map<string,{i:number;j:number;at:number}>();
  constructor(private readonly scene:Phaser.Scene,private readonly art:WatercraftProvider,private readonly provider:AssetProvider){}
  update(view:RideScene,timeSec:number):void{
    const seen=new Set<string>(),actors=new Set<number>(),fxSeen=new Set<string>(),ropeSeen=new Set<string>();this.hiddenGuestIds.clear();
    for(const ride of view.rides){
      for(const raw of ride.vehicles){
        const id=`${ride.rideId}:${raw.vehicle}`,root=this.follow(id,raw.pos.i,raw.pos.j,raw.bounce,timeSec),v={...raw,pos:root,bounce:root.z,boat:raw.boat?{...raw.boat,pos:this.follow(id+':boat',raw.boat.pos.i,raw.boat.pos.j,0,timeSec)}:null},h=heading(v.heading),spec=this.art.manifest.equipment[ride.equipId];if(!spec)continue;
        const craftReady=this.art.ensure(ride.equipId),boatReady=v.boat?this.art.ensure('tow_work'):true;
        if(!craftReady||!boatReady)continue;
        const riders:CraftRider[]=[];
        for(const p of v.passengers){
          this.hiddenGuestIds.add(p.guestUid);
          if(p.fallen)continue;
          const seat=spec.seats[p.seat];
          if(seat&&(p.pose==='ride'||p.pose==='board')){
            const loc=local(seat.position,h),seatedHeading=((h+Math.round(seat.heading/(Math.PI/8))+4)%16+16)%16;
            const u=ride.phase==='boarding'?Math.min(1,ride.boardProgress/(1-CAST_OFF_FRACTION)):ride.phase==='unboarding'?1-Math.max(0,(ride.unboardProgress-CAST_OFF_FRACTION)/(1-CAST_OFF_FRACTION)):1;
            if(u>=1)riders.push({uid:p.guestUid,...loc,heading:seatedHeading,pose:pose(seat.pose)});
            else {const from={di:p.origin.i-v.pos.i,dj:p.origin.j-v.pos.j};riders.push({uid:p.guestUid,di:from.di+(loc.di-from.di)*u,dj:from.dj+(loc.dj-from.dj)*u,z:.22+(loc.z-.22)*u+.18*4*u*(1-u),heading:craftHeading(loc.di-from.di,loc.dj-from.dj),pose:u<=0?'idle':'jump'});}
          }
          else this.actor(p.guestUid,p.pos.i,p.pos.j,p.height,heading(p.heading),p.pose==='board'||p.pose==='climb'?'walk':p.pose==='swim'?'swim':p.pose==='fall'?'jump':'idle',timeSec,actors);
        }
        this.place(id,ride.equipId,v.pos.i,v.pos.j,v.bounce,h,riders,timeSec,seen);
        this.waterFx(id,ride.equipId,v,timeSec,fxSeen);
        if(v.boat){
          const bh=heading(v.boat.heading),bs=this.art.manifest.equipment.tow_work!,seat=bs.seats[0];
          const driver:CraftRider[]=seat?[{uid:staffNpcSeed('lifeguard'),...local(seat.position,bh),heading:bh,pose:pose(seat.pose)}]:[];
          this.place(id+':boat','tow_work',v.boat.pos.i,v.boat.pos.j,0,bh,driver,timeSec,seen);
          const a=local(spec.tow_socket??[0,-1,0.15],h),b=local(bs.tow_socket??[0,1,0.15],bh);
          const pa=tileCenter(v.pos.i+a.di,v.pos.j+a.dj),pb=tileCenter(v.boat.pos.i+b.di,v.boat.pos.j+b.dj);pa.y-=(a.z+v.bounce)*HEIGHT;pb.y-=b.z*HEIGHT;
          let g=this.rope.get(id);if(!g){g=this.scene.add.graphics();this.rope.set(id,g);}ropeSeen.add(id);
          g.clear().setDepth(Math.max(this.surfaceDepth(ride.equipId,v.pos.i,v.pos.j,h),this.surfaceDepth('tow_work',v.boat.pos.i,v.boat.pos.j,bh))-.1);
          g.lineStyle(1,0xeddb9d,1);g.beginPath();g.moveTo(pa.x,pa.y);g.lineTo((pa.x+pb.x)/2,(pa.y+pb.y)/2+1);g.lineTo(pb.x,pb.y);g.strokePath();
        }
      }
    }
    for(const swimmer of view.swimmers){
      this.hiddenGuestIds.add(swimmer.guestUid);this.actor(swimmer.guestUid,swimmer.pos.i,swimmer.pos.j,swimmer.height,heading(swimmer.heading),pose(swimmer.pose),timeSec,actors);
      const id=`swimmer:${swimmer.guestUid}`;let g=this.effects.get(id);if(!g){g=this.scene.add.graphics();this.effects.set(id,g);}fxSeen.add(id);g.clear().setDepth(depthKey(swimmer.pos.i+.75,swimmer.pos.j+.75)+1.5);
      if(swimmer.status==='splash'&&!this.impacts.has(id))this.impacts.set(id,{...swimmer.pos,at:timeSec});
      this.drawImpact(g,id,timeSec);
      if(swimmer.status==='swim'){const q=tileCenter(swimmer.pos.i,swimmer.pos.j);g.lineStyle(1,0xc3edf6,.5);g.strokeEllipse(q.x,q.y+2,9+(timeSec%1)*3,4);}
    }
    for(const [key,c] of this.craft)if(!seen.has(key)){c.base.destroy();c.image.destroy();this.scene.textures.remove(c.texture.key);c.compositor.destroy();this.craft.delete(key);this.motion.delete(key);}
    for(const [uid,image]of this.actors)if(!actors.has(uid)){image.destroy();this.actors.delete(uid);this.motion.delete(`actor:${uid}`);}
    for(const [key,g]of this.effects)if(!fxSeen.has(key)){g.destroy();this.effects.delete(key);this.impacts.delete(key);this.lastBounce.delete(key);}
    for(const [key,g]of this.rope)if(!ropeSeen.has(key)){g.destroy();this.rope.delete(key);}
  }
  private surfaceDepth(asset:string,i:number,j:number,h:number):number {
    const bounds=this.art.manifest.equipment[asset]?.full_bounds_tiles;
    let di=0,dj=0;if(bounds)for(const x of [bounds[0]![0]!,bounds[1]![0]!])for(const y of [bounds[0]![1]!,bounds[1]![1]!]){const p=local([x,y,0],h);di=Math.max(di,p.di);dj=Math.max(dj,p.dj);}
    return depthKey(i+di,j+dj)+Z_FACILITY;
  }
  private place(id:string,asset:string,i:number,j:number,z:number,h:number,riders:readonly CraftRider[],time:number,seen:Set<string>):void{
    seen.add(id);let c=this.craft.get(id);
    if(!c){const compositor=new CraftComposite(this.art,this.provider,this.art.manifest.equipment[asset]!.logical_size);const key=`ride-composite-${++this.sequence}`;const texture=this.scene.textures.addCanvas(key,compositor.canvas);if(!texture)throw Error('Vehicle canvas texture');c={compositor,texture,base:this.scene.add.image(0,0,key).setVisible(false),image:this.scene.add.image(0,0,key),signature:''};this.craft.set(id,c);}
    const sig=JSON.stringify([asset,h,riders]);
    if(sig!==c.signature){const q=c.compositor.draw(asset,h,riders,time*1000);c.image.setOrigin(q.ax/c.compositor.canvas.width,q.ay/c.compositor.canvas.height);c.image.setDisplaySize(c.compositor.canvas.width,c.compositor.canvas.height);c.texture.refresh();c.signature=sig;}
    const hd=imagegenArt.get(`watercraft/${asset}/${h}`),sprite=this.art.spec(`watercraft/${asset}/${h}`)!;
    if(hd){const key=`imagegen/watercraft/${asset}/${h}`;if(!this.scene.textures.exists(key))this.scene.textures.addCanvas(key,hd)?.setFilter(Phaser.Textures.FilterMode.LINEAR);c.base.setTexture(key).setDisplaySize(sprite.w,sprite.h).setOrigin(sprite.ax/sprite.w,sprite.ay/sprite.h).setVisible(true);}else c.base.setVisible(false);
    const p=tileCenter(i,j);c.base.setPosition(p.x,p.y-z*HEIGHT).setDepth(this.surfaceDepth(asset,i,j,h));c.image.setPosition(p.x,p.y-z*HEIGHT).setDepth(this.surfaceDepth(asset,i,j,h)+.01);
  }
  private actor(uid:number,i:number,j:number,z:number,h:number,p:NpcV8Pose,time:number,seen:Set<number>):void{
    const key=npcV8Key(uid,craftFacing(h),p,time*1000,'happy'),spec=this.provider.spec(key);if(!spec)return;
    if(!this.scene.textures.exists(key)){const canvas=this.provider.canvas(key);if(!canvas)return;this.scene.textures.addCanvas(key,canvas);}
    seen.add(uid);let img=this.actors.get(uid);if(!img){img=this.scene.add.image(0,0,key);this.actors.set(uid,img);}img.setTexture(key).setOrigin(spec.ax/spec.w,spec.ay/spec.h);
    // A swimming silhouette and contact ripple span the water tile in front of the root.
    const p0=this.follow(`actor:${uid}`,i,j,z,time),q=tileCenter(p0.i,p0.j);img.setPosition(q.x,q.y-p0.z*HEIGHT).setDepth(depthKey(i+.5,j+.5)+Z_GUEST);
  }
  private drawImpact(g:Phaser.GameObjects.Graphics,id:string,time:number):void {
    const impact=this.impacts.get(id);if(!impact)return;const age=time-impact.at;if(age<0||age>.85)return;
    const q=tileCenter(impact.i,impact.j),r=3+age*14;g.lineStyle(1,0xd7f4fa,1-age/.85).strokeEllipse(q.x,q.y,r*2,r);
    for(let k=0;k<7;k++){const a=k*Math.PI*2/7,z=(1.8*age-2.9*age*age)*HEIGHT;if(z<=0)continue;g.fillStyle(0xd7f4fa,1-age/.85).fillRect(q.x+Math.cos(a)*age*16,q.y+Math.sin(a)*age*8-z,1,2);}
  }
  private waterFx(id:string,asset:string,v:RideVehicleView,time:number,seen:Set<string>):void{
    let g=this.effects.get(id);if(!g){g=this.scene.add.graphics();this.effects.set(id,g);}seen.add(id);g.clear().setDepth(this.surfaceDepth(asset,v.pos.i,v.pos.j,heading(v.heading))-.5);
    const previous=this.lastBounce.get(id)??0;this.lastBounce.set(id,v.bounce);
    if(previous>.005&&v.bounce<=.005)this.impacts.set(id,{...v.pos,at:time});
    this.drawImpact(g,id,time);
    if(v.speed<.001)return;
    const h=heading(v.heading);g.lineStyle(1,0xc3edf6,.65);
    for(let k=0;k<5;k++){const u=(time*1.8+k/5)%1,p=local([.5+u*.5,1+u*1.5,0],h),r=local([-.5-u*.5,1+u*1.5,0],h);for(const a of [p,r]){const b=tileCenter(v.pos.i+a.di,v.pos.j+a.dj);g.lineBetween(b.x,b.y,b.x+2,b.y);}}

  }
}

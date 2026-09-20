import {along,dist,lerp,rotate} from './base-motion.mjs';
export {rotate};
export const pathLength=p=>p.slice(1).reduce((n,v,i)=>n+dist(p[i],v),0);
const pose=p=>p==='sit_chair'?'sit':p==='stand'?'idle':p;
const at=(s,phase='이용')=>({id:s.id,position:s.position,heading:s.heading,pose:pose(s.pose),phase,support:!!s.supportObjects?.length});
const walking=(path,t,speed=.72)=>({...along(path,Math.min(pathLength(path),Math.max(0,t*speed))),pose:'walk'});
export function seated(c,time,mode){
 const staff=c.slots.filter(s=>s.role==='performer'),waiting=c.slots.filter(s=>s.role==='waiting'),slots=c.slots.filter(s=>s.role!=='performer'&&s.role!=='waiting');
 if(c.admissionOrder)slots.sort((a,b)=>c.admissionOrder.indexOf(a.id)-c.admissionOrder.indexOf(b.id));
 if(c.id==='photozone')slots.reverse();
 if(mode==='empty')return {actors:[],effects:[]};
 if(mode==='full'||mode==='one')return {actors:[...staff,...slots.slice(0,mode==='one'?1:slots.length),...(mode==='full'?waiting:[])].map(s=>at(s)),effects:[]};
 let duration=0;const rows=slots.map(s=>{const enter=duration,walk=pathLength(s.approach)/.72;duration+=walk+.3;return {s,enter,walk};});
 const useStart=duration;duration+=6;
 for(const r of (c.exitOrder?[...rows].sort((a,b)=>c.exitOrder.indexOf(a.s.id)-c.exitOrder.indexOf(b.s.id)):c.id==='photozone'?rows:[...rows].reverse())){r.leave=duration;r.exit=r.s.exitApproach??(c.id==='photozone'?c.routes['exit_'+(r.s.id==='subject-1'?0:1)]:c.id==='pavilion'?[...r.s.approach.slice(1).reverse(),[0,-.65,c.floorZ],c.exit]:[...r.s.approach].reverse());r.exitTime=pathLength(r.exit)/.72;duration+=r.exitTime+.3;}
 const t=((time%(duration+2))+(duration+2))%(duration+2),actors=[...staff.map(s=>at(s,'공연')),...waiting.map(s=>at(s,'대기'))];
 for(const r of rows){if(t<r.enter||t>r.leave+r.exitTime)continue;const s=r.s;let a;
  if(t<r.enter+r.walk)a={...walking(s.approach,t-r.enter),phase:'입장'};
  else if(t<r.leave)a=at(s,c.id==='photozone'?'촬영 포즈':'관람·휴식');
  else a={...walking(r.exit,t-r.leave),phase:'퇴장'};
  actors.push({id:s.id,support:false,...a});
 }
 const effects=[];
 if(c.id==='photozone'&&t>useStart+1&&t<useStart+1.18)effects.push({kind:'flash',position:c.flashPosition??c.cameraHead??c.landmarks?.camera??[0,-.8,1]});
 if(staff.length&&t>useStart&&t<useStart+6)effects.push({kind:'music',position:staff[0].position.map((v,i)=>v+(i===2?1.1:0))});
 return {actors,effects,period:duration+2,time:t};
}
// Each specialized route consumes the single numeric facility contract, not per-facing coordinates.
export function sample(c,time,mode='motion'){
 if(c.id==='bungee_jump')return bungee(c,time,mode);
 if(c.id==='playground')return playground(c,time,mode);
 return seated(c,time,mode);
}
// Specialized route adapters are completed against each worker's authored interaction contract.
export function playground(c,time,mode){
 if(mode==='empty')return {actors:[],effects:[]};
 const r=c.routes,climb=pathLength(r.climb)/.7,slide=1.65,land=pathLength(r.landing)/.8,back=pathLength(r.return)/.8,period=climb+.5+slide+land+back+1;
 const t=((time%period)+period)%period;let a;
 if(mode==='full'||mode==='one')a={...walking(r.slide,pathLength(r.slide)*.45,1),pose:'ride',support:true,phase:'활강'};
 else if(t<climb)a={...walking(r.climb,t,.7),support:true,phase:'오르기'};
 else if(t<climb+.5)a={position:r.slide[0],heading:c.routeHeadings.slide,pose:'ride',support:true,phase:'출발 준비'};
 else if(t<climb+.5+slide){const u=(t-climb-.5)/slide;a={...walking(r.slide,pathLength(r.slide)*u*u,1),pose:'ride',support:true,phase:'활강'};}
 else if(t<climb+.5+slide+land)a={...walking(r.landing,t-climb-.5-slide,.8),phase:'착지'};
 else if(t<period-1)a={...walking(r.return,t-climb-.5-slide-land,.8),phase:'돌아가기'};
 else a={position:r.climb[0],heading:0,pose:'idle',phase:'대기'};
 const actors=[{id:'slide-rider',...a}];if(mode!=='one')actors.push(...c.slots.slice(1).map(s=>at(s,'대기')));
 return {actors,effects:[],period,time:t,reserved:a.phase!=='대기'};
}
export function bungee(c,time,mode){
 if(mode==='empty')return {actors:[],effects:[]};
 const r=c.routes,m=c.motion,entry=pathLength(r.entry)/.8,ascent=m.ascentSeconds,platform=pathLength(r.platform)/.65,wait=1,jump=m.jumpSeconds,rebound=m.reboundSeconds,recover=m.recoverSeconds;
 const durations=[entry,ascent,platform,wait,jump,rebound,recover,1.5],period=durations.reduce((a,b)=>a+b,0);let t=((time%period)+period)%period,phase=0,u=t;
 if(mode==='one'||mode==='full'){phase=5;u=rebound*.25;}else{while(phase<durations.length-1&&u>=durations[phase])u-=durations[phase++];}
 let a,rope=null;const launch=r.jump[0],low=c.rope.lowestFeet,end=r.rebound.at(-1),pickup=c.rope.pickupFeet;
 if(phase===0)a={...walking(r.entry,u,.8),phase:'입장'};
 if(phase===1)a={position:lerp(c.ascentPortal.hideAt,c.ascentPortal.showAt,u/ascent),pose:'idle',heading:0,phase:'타워 내부 이동',hidden:true};
 if(phase===2)a={...walking(r.platform,u,.65),support:true,phase:'발판 이동'};
 if(phase===3)a={position:launch,pose:'idle',heading:-Math.PI/2,support:true,phase:'점프 준비'};
 if(phase===4){const v=u/jump;a={position:[launch[0]+(low[0]-launch[0])*Math.min(1,v*3),launch[1]+(low[1]-launch[1])*Math.min(1,v*3),launch[2]+(low[2]-launch[2])*(1-Math.cos(Math.PI*v))/2],pose:'cheer_jump',heading:-Math.PI/2,phase:'번지점프'};}
 if(phase===5){const v=u/rebound;const heights=r.rebound.map(p=>p[2]),k=Math.min(heights.length-2,Math.floor(v*(heights.length-1))),f=v*(heights.length-1)-k;const z=heights[k]+(heights[k+1]-heights[k])*(1-Math.cos(Math.PI*f))/2;a={position:[low[0],low[1],z],pose:'cheer_jump',heading:-Math.PI/2,phase:'줄 반동'};}
 if(phase===6){const v=u/recover;if(v<.6)a={position:lerp(end,pickup,(1-Math.cos(Math.PI*v/.6))/2),pose:'cheer_jump',heading:-Math.PI/2,phase:'천천히 회수'};else a={...walking(r.recover.slice(1),pathLength(r.recover.slice(1))*(v-.6)/.4,1),phase:'퇴장'};}
 if(phase===7)a={position:c.exit,pose:'idle',heading:0,phase:'퇴장 완료',hidden:true};
 if(phase>=3&&phase<=5||phase===6&&u/recover<.6)rope={from:c.rope.pivot,to:a.position.map((v,i)=>v+c.rope.bodyAttachmentOffset[i]),mode:phase===6?'winch':'elastic'};
 const actors=[{id:'jumper',...a}];if(mode!=='one')actors.push(...c.slots.filter(s=>s.role==='queue').map(s=>at(s,'대기')));
 return {actors,rope,harness:rope?{position:a.position,attachment:rope.to}:null,effects:[],period,time:t,reserved:phase<7};
}

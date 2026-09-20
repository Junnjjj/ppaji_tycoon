export const TAU=Math.PI*2;
export const rotate=([x,y,z=0],d)=>{const a=d*Math.PI/2;return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),z]};
export const project=([x,y,z=0])=>[96+16*(x+y),107.757550765+8*(x-y)-19.595917942*z];
export const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function along(points,distance){
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=dist(a,b);if(distance<=len)return {position:lerp(a,b,len?distance/len:1),heading:Math.atan2(b[1]-a[1],b[0]-a[0])};distance-=len;}
 return {position:points.at(-1),heading:0};
}
// Sitting and lying change contact instantly; never slide a resting sprite across the floor.
const transferDuration=s=>['sit','lie'].includes(s.pose)?0:Math.max(.4,dist(s.approach.at(-1),s.position)/.6);
export function motion(slot,time,index=0,mode='motion'){
 const path=slot.approach,seat=slot.position,end=path.at(-1),speed=.72;
 const length=path.slice(1).reduce((n,p,i)=>n+dist(p,path[i]),0),walk=length/speed,transfer=transferDuration(slot),use=slot.useSeconds??4,gap=1.6;
 const period=2*walk+2*transfer+use+gap,t=((time-index*1.1)%period+period)%period;
 if(mode==='empty'||mode==='one'&&index>0)return null;
 if(mode==='full'||mode==='one')return {position:seat,heading:slot.heading,pose:slot.pose,phase:'이용',progress:1};
 if(t<walk)return {...along(path,t*speed),pose:'walk',phase:'입장',progress:t/period};
 if(t<walk+transfer)return {position:lerp(end,seat,(t-walk)/transfer),heading:slot.heading,pose:slot.pose,phase:slot.pose==='lie'?'눕기':'자리 잡기',progress:t/period};
 if(t<walk+transfer+use)return {position:seat,heading:slot.heading,pose:slot.pose,phase:'이용',progress:t/period};
 if(t<walk+2*transfer+use)return {position:lerp(seat,end,(t-walk-transfer-use)/transfer),heading:slot.heading,pose:slot.pose,phase:'나오기',progress:t/period};
 if(t<2*walk+2*transfer+use)return {...along([...path].reverse(),(t-walk-2*transfer-use)*speed),pose:'walk',phase:'퇴장',progress:t/period};
 return {position:path[0],heading:slot.heading,pose:'idle',phase:'대기',progress:t/period};
}
// A shared entry corridor has one traversal reservation. Occupied slots remain visible while the next guest enters.
export function facilityMotion(slots,time,mode='motion'){
 if(mode!=='motion')return slots.map((s,i)=>motion(s,time,i,mode));
 const durations=slots.map(s=>s.approach.slice(1).reduce((n,p,i)=>n+dist(p,s.approach[i]),0)/.72+transferDuration(s));
 const starts=[];let next=0;for(const d of durations){starts.push(next);next+=d+.35}const allSeated=next,exits=[];for(let i=slots.length-1;i>=0;i--){exits[i]=next+4;next+=durations[i]+.35}const period=next+5,t=((time%period)+period)%period;
 return slots.map((s,i)=>{const path=s.approach,end=path.at(-1),length=path.slice(1).reduce((n,p,j)=>n+dist(p,path[j]),0),walk=length/.72,transfer=durations[i]-walk,entry=t-starts[i],exit=t-exits[i];
  if(entry<0||exit>durations[i])return null; // Outside this bounded facility review; spawn/despawn only at exterior approach point.
  if(entry<walk)return {...along(path,entry*.72),pose:'walk',phase:'입장'};
  if(entry<durations[i])return {position:lerp(end,s.position,(entry-walk)/transfer),heading:s.heading,pose:s.pose,phase:'자리 잡기'};
  if(exit<0)return {position:s.position,heading:s.heading,pose:s.pose,phase:'이용'};
  if(exit<transfer)return {position:lerp(s.position,end,exit/transfer),heading:s.heading,pose:s.pose,phase:'나오기'};
  return {...along([...path].reverse(),(exit-transfer)*.72),pose:'walk',phase:'퇴장'};
 });
}

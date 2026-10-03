import {craftHeading} from '../assets/watercraft';
import {npcV8Key} from '../assets/npc-v8';
import {craftFacing,type CraftRider} from './watercraft-composite';

/** Reverse the travel vector on dismount; position interpolation stays simulation-owned. */
export function transferHeading(di:number,dj:number,unboarding:boolean):number {
 return craftHeading(unboarding?-di:di,unboarding?-dj:dj);
}
/** Resolve actual frame keys so static poses do not cause needless GPU uploads. */
export function craftFrameSignature(asset:string,h:number,riders:readonly CraftRider[],timeMs:number):string {
 return JSON.stringify([asset,h,riders,riders.map(r=>npcV8Key(r.uid,craftFacing(r.heading),r.pose,timeMs,'happy'))]);
}

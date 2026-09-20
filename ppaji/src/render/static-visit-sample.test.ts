import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import metadata from '../data/static-facility-visits.json';
import {createStaticVisit,STATIC_TRANSFER_SPEED,staticRoutePoint} from '../sim/static-visit.js';
import {sampleStaticVisit} from './static-visit-sample.js';
import {approvedSampleToTile,type FacilityRoutes,type ApprovedFacilityManifest} from '../assets/approved-facilities.js';
const manifest=JSON.parse(readFileSync('public/assets/approved-facilities/manifest.json','utf8')) as ApprovedFacilityManifest;
const routes=JSON.parse(readFileSync('public/assets/approved-facilities/routes.json','utf8')) as Record<string,FacilityRoutes>;
describe('authored route return speed',()=>{
 it('numeric timing metadata matches approved paths and rotation without route compression',()=>{for(const [id,meta] of Object.entries(metadata))for(const facing of [0,1]){const f={uid:1,defId:id,i:10,j:12,facing};for(let n=0;n<meta.visits.length;n++){const v=createStaticVisit(f,{i:9.5,j:12.5,z:.22},n,1,id.startsWith('module_')?Array.from({length:n},(_,k)=>k):[])!,track=routes[id]!.visits[n]??routes[id]!.tour;expect(v.routeIndex).toBe(n);expect(v.routeSeconds).toBeGreaterThanOrEqual(track.cycle);const p=meta.visits[n]!.start;const a=approvedSampleToTile(id,facing,{t:0,p:p as [number,number,number],h:0,pose:'walk',phase:'entry'},10,12,manifest)!;expect(staticRoutePoint(f,p)).toEqual({i:a.i,j:a.j,z:a.z});const end=sampleStaticVisit(routes[id]!,v,v.totalTicks/8,manifest);expect([end.i,end.j,end.z]).toEqual([v.origin.i,v.origin.j,v.origin.z]);for(const t of [0,Math.max(0,v.entrySeconds-.2),v.entrySeconds+v.routeSeconds]){const x=sampleStaticVisit(routes[id]!,v,t,manifest),y=sampleStaticVisit(routes[id]!,v,t+.02,manifest);if(x.phase==='enter'||x.phase==='exit')expect(Math.hypot(y.i-x.i,y.j-x.j,y.z-x.z)).toBeLessThanOrEqual(STATIC_TRANSFER_SPEED*.02+.0001);}}}});
});

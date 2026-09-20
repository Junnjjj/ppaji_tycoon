import { approvedSampleAt, approvedSampleToTile, type ApprovedFacilityManifest, type FacilityRoutes, type RoutePoint } from '../assets/approved-facilities.js';
import { staticVisitPhase, type StaticVisit } from '../sim/static-visit.js';
/** Separate entry/exit walks from the approved route, never squash a return into 0.35 s. */
export function sampleStaticVisit(routes:FacilityRoutes,v:StaticVisit,time:number,manifest:ApprovedFacilityManifest):RoutePoint {
  const route=routes.visits[v.routeIndex]??routes.tour,phase=staticVisitPhase(v,time);
  const sample=(t:number)=>approvedSampleToTile(v.defId,v.facing,approvedSampleAt(route,Math.min(route.cycle-1e-6,Math.max(0,t))),v.i,v.j,manifest)!;
  if(phase.phase==='route')return sample(phase.u*route.cycle);
  const start=phase.phase==='enter'?v.origin:sample(route.cycle),end=phase.phase==='enter'?sample(0):v.origin,u=phase.u;
  return {i:start.i+(end.i-start.i)*u,j:start.j+(end.j-start.j)*u,z:start.z+(end.z-start.z)*u,pose:'walk',heading:Math.atan2(end.j-start.j,end.i-start.i),phase:phase.phase};
}

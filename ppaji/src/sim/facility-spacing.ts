import policy from '../data/facility-spacing.json';
import type { FacilityDef } from '../data/schema.js';
/** Extra reservation width/depth; physical art and entry contacts remain unchanged. */
export function facilityPadding(def:Pick<FacilityDef,'id'>):number { return (policy as Record<string,number>)[def.id] ?? 0; }
export function reservedBounds(def:Pick<FacilityDef,'id'|'w'|'d'>,i:number,j:number,facing:number,padding=facilityPadding(def)) {
  return {i0:i-padding/2,j0:j-padding/2,w:(facing%2?def.d:def.w)+padding,h:(facing%2?def.w:def.d)+padding};
}
export function reservationsOverlap(a:ReturnType<typeof reservedBounds>,b:ReturnType<typeof reservedBounds>):boolean {
 return a.i0<b.i0+b.w && a.i0+a.w>b.i0 && a.j0<b.j0+b.h && a.j0+a.h>b.j0;
}

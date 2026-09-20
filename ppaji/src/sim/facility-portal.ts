/** Authored door geometry shared by navigation, GuestStore and rendering. */
import contracts from '../data/facility-portals.json';
import type { PlacedFacility } from './facility.js';

export interface PortalPoint { i: number; j: number; z: number }
export interface FacilityPortal {
  entry: { i: number; j: number };
  threshold: PortalPoint;
  path: PortalPoint[];
}
export interface PortalVisit extends FacilityPortal {
  uid: number;
  phase: 'entering' | 'inside' | 'exiting';
  progress: number;
  wasCarrying?: boolean;
  waking?: boolean;
}
export function facilityPortal(f: PlacedFacility): FacilityPortal | null {
  const c = (contracts as Record<string, { size: number[]; portal: { threshold: number[]; approach: number[][] } }>)[f.defId];
  if (!c) return null;
  const [w, d] = c.size as [number, number];
  // Approved art uses X=I, Y=-J, then (I,J)->(J,-I), NOT passage-cell rotation.
  const point = (p: number[]): PortalPoint => f.facing === 0
    ? { i: f.i + w / 2 + p[0]!, j: f.j + d / 2 - p[1]!, z: p[2]! }
    : { i: f.i + d / 2 - p[1]!, j: f.j + w / 2 - p[0]!, z: p[2]! };
  const threshold = point(c.portal.threshold);
  const entry = f.facing === 0 ? { i: Math.floor(threshold.i), j: f.j + d }
    : { i: f.i + d, j: Math.floor(threshold.j) };
  return { entry, threshold, path: [{ i: entry.i + .5, j: entry.j + .5, z: 0 }, ...c.portal.approach.map(point)] };
}
/** Constant-speed polyline motion. Simulation stays on the exterior walkable tile. */
export function portalPosition(p: PortalVisit): PortalPoint {
  if (p.phase === 'inside' || (p.phase === 'exiting' && p.progress <= 0) || (p.phase === 'entering' && p.progress >= 1)) return p.threshold;
  let distance = portalLength(p) * (p.phase === 'exiting' ? 1 - p.progress : p.progress);
  for (let k = 1; k < p.path.length; k++) {
    const a = p.path[k - 1]!, b = p.path[k]!;
    const length = Math.hypot(b.i - a.i, b.j - a.j, b.z - a.z);
    if (distance <= length && length > 0) {
      const t = Math.max(0, distance / length);
      return { i: a.i + (b.i - a.i) * t, j: a.j + (b.j - a.j) * t, z: a.z + (b.z - a.z) * t };
    }
    distance -= length;
  }
  return p.threshold;
}
export function portalLength(p: FacilityPortal): number {
  return p.path.slice(1).reduce((sum, b, k) => { const a = p.path[k]!; return sum + Math.hypot(b.i - a.i, b.j - a.j, b.z - a.z); }, 0);
}
export function portalHidden(g: { state: string; portal?: PortalVisit }): boolean {
  return g.state === 'use' && g.portal?.phase === 'inside';
}

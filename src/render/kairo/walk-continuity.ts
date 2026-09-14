export interface WalkSample {
  segment: string;
  progress: number;
  x: number;
  y: number;
  correctionX: number;
  correctionY: number;
}

/** A sim tick may replace a segment before the last rendered frame reaches its end.
 * Carry that small remainder into the new segment; never snap to its integer start.
 * This state belongs to presentation only and never changes paths or saved guests.
 */
export function continuousWalk(previous: WalkSample | undefined, segment: string, progress: number, x: number, y: number): WalkSample {
  const p = Math.max(0, Math.min(1, progress));
  let correctionX = previous?.correctionX ?? 0, correctionY = previous?.correctionY ?? 0;
  if (previous && (segment !== previous.segment || p < previous.progress)) {
    const remaining = 1 - p;
    correctionX = remaining > .001 ? (previous.x - x) / remaining : 0;
    correctionY = remaining > .001 ? (previous.y - y) / remaining : 0;
  }
  return { segment, progress: p, x: x + correctionX * (1 - p), y: y + correctionY * (1 - p), correctionX, correctionY };
}

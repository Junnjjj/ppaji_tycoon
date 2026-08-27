/**
 * Review-only rounded shoreline geometry.
 *
 * The simulation remains a square grid.  This module traces the exact land/water
 * cell boundary in grid coordinates, then replaces only its corners with a
 * radius-limited quadratic arc.  Projection happens later, so the same curve is
 * shared by every 2:1 isometric tile that samples it.
 */

export interface ShorePoint {
  x: number;
  y: number;
}

export interface ShoreSegment {
  a: ShorePoint;
  b: ShorePoint;
}

export interface RoundedShoreGeometry {
  readonly radius: number;
  readonly contours: number;
  readonly segments: readonly ShoreSegment[];
  readonly curvedSegments: number;
}

interface Edge extends ShoreSegment {
  used: boolean;
}

const EPS = 1e-7;

const keyOf = (p: ShorePoint): string => `${p.x},${p.y}`;

function samePoint(a: ShorePoint, b: ShorePoint): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

function collinear(a: ShorePoint, b: ShorePoint, c: ShorePoint): boolean {
  return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < EPS;
}

function directedBoundaryEdges(
  width: number,
  height: number,
  isWater: (i: number, j: number) => boolean,
): Edge[] {
  const edges: Edge[] = [];
  const water = (i: number, j: number): boolean =>
    i >= 0 && j >= 0 && i < width && j < height && isWater(i, j);

  // Every edge is oriented with land on its left and water on its right.
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if (water(i, j)) continue;
      if (water(i, j - 1)) edges.push({ a: { x: i, y: j }, b: { x: i + 1, y: j }, used: false });
      if (water(i + 1, j))
        edges.push({ a: { x: i + 1, y: j }, b: { x: i + 1, y: j + 1 }, used: false });
      if (water(i, j + 1))
        edges.push({ a: { x: i + 1, y: j + 1 }, b: { x: i, y: j + 1 }, used: false });
      if (water(i - 1, j)) edges.push({ a: { x: i, y: j + 1 }, b: { x: i, y: j }, used: false });
    }
  }
  return edges;
}

function traceContours(edges: Edge[]): Array<{ points: ShorePoint[]; closed: boolean }> {
  const starts = new Map<string, number[]>();
  const ends = new Set<string>();
  edges.forEach((edge, index) => {
    const list = starts.get(keyOf(edge.a)) ?? [];
    list.push(index);
    starts.set(keyOf(edge.a), list);
    ends.add(keyOf(edge.b));
  });

  const contours: Array<{ points: ShorePoint[]; closed: boolean }> = [];
  // Open contours must start at their endpoint; otherwise an arbitrary middle edge
  // would split one coastline into two traces. Closed loops are handled afterwards.
  const seedOrder = [
    ...edges.map((_edge, index) => index).filter((index) => !ends.has(keyOf(edges[index]?.a as ShorePoint))),
    ...edges.map((_edge, index) => index),
  ];
  for (const seed of seedOrder) {
    const first = edges[seed];
    if (!first || first.used) continue;
    first.used = true;
    const points: ShorePoint[] = [first.a, first.b];
    let cursor = first.b;
    let closed = samePoint(cursor, first.a);

    while (!closed) {
      const nextIndex = (starts.get(keyOf(cursor)) ?? []).find((index) => !edges[index]?.used);
      if (nextIndex === undefined) break;
      const next = edges[nextIndex];
      if (!next) break;
      next.used = true;
      points.push(next.b);
      cursor = next.b;
      closed = samePoint(cursor, first.a);
      if (points.length > edges.length + 1) break;
    }
    contours.push({ points, closed });
  }
  return contours;
}

function simplify(points: ShorePoint[], closed: boolean): ShorePoint[] {
  const out = [...points];
  if (closed && out.length > 1 && samePoint(out[0] as ShorePoint, out[out.length - 1] as ShorePoint)) {
    out.pop();
  }
  let changed = true;
  while (changed && out.length >= (closed ? 3 : 2)) {
    changed = false;
    for (let index = closed ? 0 : 1; index < out.length - (closed ? 0 : 1); index++) {
      const prev = out[(index - 1 + out.length) % out.length];
      const here = out[index];
      const next = out[(index + 1) % out.length];
      if (prev && here && next && collinear(prev, here, next)) {
        out.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function length(a: ShorePoint, b: ShorePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function toward(from: ShorePoint, to: ShorePoint, amount: number): ShorePoint {
  const d = length(from, to);
  if (d < EPS) return { ...from };
  return { x: from.x + ((to.x - from.x) * amount) / d, y: from.y + ((to.y - from.y) * amount) / d };
}

function quadratic(a: ShorePoint, control: ShorePoint, b: ShorePoint, t: number): ShorePoint {
  const q = 1 - t;
  return {
    x: q * q * a.x + 2 * q * t * control.x + t * t * b.x,
    y: q * q * a.y + 2 * q * t * control.y + t * t * b.y,
  };
}

function roundedContour(points: ShorePoint[], closed: boolean, radius: number): ShorePoint[] {
  if (radius <= EPS || points.length < 3) return [...points, ...(closed ? [points[0] as ShorePoint] : [])];
  const entries: ShorePoint[] = [];
  const exits: ShorePoint[] = [];
  const corner = (index: number): void => {
    const here = points[index] as ShorePoint;
    if (!closed && (index === 0 || index === points.length - 1)) {
      entries[index] = here;
      exits[index] = here;
      return;
    }
    const prev = points[(index - 1 + points.length) % points.length] as ShorePoint;
    const next = points[(index + 1) % points.length] as ShorePoint;
    const trim = Math.min(radius, length(prev, here) / 2, length(here, next) / 2);
    entries[index] = toward(here, prev, trim);
    exits[index] = toward(here, next, trim);
  };
  points.forEach((_point, index) => corner(index));

  const out: ShorePoint[] = [];
  const arcSteps = Math.max(3, Math.ceil(radius * 12));
  if (closed) {
    out.push(exits[0] as ShorePoint);
    for (let step = 1; step <= points.length; step++) {
      const index = step % points.length;
      const entry = entries[index] as ShorePoint;
      const control = points[index] as ShorePoint;
      const exit = exits[index] as ShorePoint;
      out.push(entry);
      for (let sample = 1; sample <= arcSteps; sample++) {
        out.push(quadratic(entry, control, exit, sample / arcSteps));
      }
    }
  } else {
    out.push(points[0] as ShorePoint);
    for (let index = 1; index < points.length - 1; index++) {
      const entry = entries[index] as ShorePoint;
      const control = points[index] as ShorePoint;
      const exit = exits[index] as ShorePoint;
      out.push(entry);
      for (let sample = 1; sample <= arcSteps; sample++) {
        out.push(quadratic(entry, control, exit, sample / arcSteps));
      }
    }
    out.push(points[points.length - 1] as ShorePoint);
  }
  return out;
}

export function buildRoundedShoreGeometry(
  width: number,
  height: number,
  isWater: (i: number, j: number) => boolean,
  radius: number,
): RoundedShoreGeometry {
  const safeRadius = Math.max(0, Math.min(1, radius));
  const raw = traceContours(directedBoundaryEdges(width, height, isWater));
  const segments: ShoreSegment[] = [];
  let curvedSegments = 0;
  for (const contour of raw) {
    const simple = simplify(contour.points, contour.closed);
    const rounded = roundedContour(simple, contour.closed, safeRadius);
    for (let index = 1; index < rounded.length; index++) {
      const a = rounded[index - 1];
      const b = rounded[index];
      if (!a || !b || samePoint(a, b)) continue;
      segments.push({ a, b });
      if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) curvedSegments++;
    }
  }
  return { radius: safeRadius, contours: raw.length, segments, curvedSegments };
}

export function signedDistanceToShore(point: ShorePoint, segments: readonly ShoreSegment[]): number {
  let bestDistance2 = Number.POSITIVE_INFINITY;
  let bestCross = -1;
  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < EPS) continue;
    const projection = Math.max(
      0,
      Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / length2),
    );
    const nearestX = segment.a.x + projection * dx;
    const nearestY = segment.a.y + projection * dy;
    const ox = point.x - nearestX;
    const oy = point.y - nearestY;
    const distance2 = ox * ox + oy * oy;
    if (distance2 < bestDistance2) {
      bestDistance2 = distance2;
      bestCross = dx * (point.y - segment.a.y) - dy * (point.x - segment.a.x);
    }
  }
  if (!Number.isFinite(bestDistance2)) return Number.NEGATIVE_INFINITY;
  return Math.sqrt(bestDistance2) * (bestCross >= 0 ? 1 : -1);
}

export function segmentsNearCell(
  segments: readonly ShoreSegment[],
  i: number,
  j: number,
  margin: number,
): ShoreSegment[] {
  return segments.filter((segment) => {
    const minX = Math.min(segment.a.x, segment.b.x);
    const maxX = Math.max(segment.a.x, segment.b.x);
    const minY = Math.min(segment.a.y, segment.b.y);
    const maxY = Math.max(segment.a.y, segment.b.y);
    return maxX >= i - margin && minX <= i + 1 + margin && maxY >= j - margin && minY <= j + 1 + margin;
  });
}

import { describe, expect, it } from 'vitest';
import { buildRoundedShoreGeometry, signedDistanceToShore } from './rounded-shore.js';

const mask = (rows: readonly string[]): ((i: number, j: number) => boolean) =>
  (i, j) => rows[j]?.[i] === '~';

describe('rounded shoreline geometry', () => {
  const coast = [
    '......',
    '....~~',
    '...~~~',
    '..~~~~',
    '..~~~~',
    '..~~~~',
  ] as const;

  it('keeps the radius-zero negative control axis-aligned', () => {
    const geometry = buildRoundedShoreGeometry(6, 6, mask(coast), 0);
    expect(geometry.segments.length).toBeGreaterThan(0);
    expect(geometry.curvedSegments).toBe(0);
  });

  it('rounds both protruding and recessed grid corners without breaking the contour', () => {
    const geometry = buildRoundedShoreGeometry(6, 6, mask(coast), 0.75);
    expect(geometry.contours).toBe(1);
    expect(geometry.curvedSegments).toBeGreaterThan(0);
    expect(geometry.segments.every((segment) => Number.isFinite(segment.a.x + segment.b.y))).toBe(true);
  });

  it('keeps land on the positive side and water on the negative side', () => {
    const geometry = buildRoundedShoreGeometry(6, 6, mask(['...~~~', '...~~~', '...~~~']), 0.75);
    expect(signedDistanceToShore({ x: 2.5, y: 1.5 }, geometry.segments)).toBeGreaterThan(0);
    expect(signedDistanceToShore({ x: 3.5, y: 1.5 }, geometry.segments)).toBeLessThan(0);
  });
});

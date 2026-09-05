import { describe, it, expect } from 'vitest';
import manifest from './manifest.json';

describe('에셋 매니페스트', () => {
  it('id 가 유일하고 크기·앵커가 정수다', () => {
    const ids = new Set<string>();
    for (const s of manifest.sprites) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      for (const n of [s.w, s.h, s.ax, s.ay]) expect(Number.isInteger(n)).toBe(true);
      expect(['procedural', 'art']).toContain(s.source);
    }
  });
  it('지형 타일은 계약 크기 32×16 이고 영구 절차다', () => {
    for (const s of manifest.sprites.filter((x) => x.id.startsWith('tile/'))) {
      expect([s.w, s.h]).toEqual([32, 16]);
      expect(s.source).toBe('procedural');
    }
  });
});

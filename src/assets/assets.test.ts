import { describe, it, expect } from 'vitest';
import { expandSpec, parseId, variantId, type SpriteSpec } from './types.js';
import {
  SPRITE_SPECS,
  ALL_SPRITE_IDS,
  specForId,
  aiSpecs,
  proceduralSpecs,
  TILE_SIZE,
} from './manifest.js';
import { ProceduralProvider } from './procedural.js';

describe('변형 ID', () => {
  const spec: SpriteSpec = {
    id: 'guest/body',
    size: [12, 17],
    anchor: 'bottom-center',
    category: 'guest',
    source: 'procedural',
    variants: { palette: 8, dir: ['down', 'up', 'left', 'right'], frame: 3 },
  };

  it('선언된 축의 곱만큼 펼쳐진다', () => {
    expect(expandSpec(spec)).toHaveLength(8 * 4 * 3);
  });

  it('변형이 없으면 ID 하나', () => {
    expect(
      expandSpec({
        id: 'fx/foam',
        size: [9, 9],
        anchor: 'center',
        category: 'fx',
        source: 'procedural',
      }),
    ).toEqual(['fx/foam']);
  });

  it('만든 ID 를 되돌려 파싱하면 원래 값이 나온다', () => {
    for (const id of expandSpec(spec)) {
      const p = parseId(id, spec);
      expect(variantId(spec.id, { palette: p.palette, dir: p.dir, frame: p.frame })).toBe(id);
    }
  });

  it('alt 축도 왕복한다', () => {
    const tile: SpriteSpec = {
      id: 'terrain/plain',
      size: [16, 16],
      anchor: 'top-left',
      category: 'terrain',
      source: 'procedural',
      variants: { alt: 3 },
    };
    const ids = expandSpec(tile);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(variantId(tile.id, { alt: parseId(id, tile).alt })).toBe(id);
    }
  });
});

describe('매니페스트 — 코드 계약 + AI 작업지시서', () => {
  it('타일 크기가 정의돼 있다', () => {
    expect(TILE_SIZE).toBeGreaterThan(0);
  });

  it('ID 가 중복되지 않는다', () => {
    const seen = new Set<string>();
    for (const s of SPRITE_SPECS) {
      expect(seen.has(s.id), `중복 ID: ${s.id}`).toBe(false);
      seen.add(s.id);
    }
  });

  it('최종 ID 도 중복되지 않는다', () => {
    expect(new Set(ALL_SPRITE_IDS).size).toBe(ALL_SPRITE_IDS.length);
  });

  it('모든 최종 ID 로 명세를 되찾을 수 있다', () => {
    for (const id of ALL_SPRITE_IDS) {
      expect(specForId(id), `명세 없음: ${id}`).toBeDefined();
    }
  });

  it('모든 명세에 유효한 크기가 있다', () => {
    for (const s of SPRITE_SPECS) {
      expect(s.size[0], s.id).toBeGreaterThan(0);
      expect(s.size[1], s.id).toBeGreaterThan(0);
    }
  });

  it('AI 생성 대상에는 프롬프트가 있다 (작업지시서 역할)', () => {
    for (const s of aiSpecs()) {
      expect(s.prompt, `프롬프트 없음: ${s.id}`).toBeTruthy();
    }
  });

  it('지형과 이펙트는 절차적으로 남는다 (계획서 §4)', () => {
    const proc = new Set(proceduralSpecs().map((s) => s.id));
    for (const s of SPRITE_SPECS) {
      if (s.category === 'terrain' || s.category === 'fx') {
        expect(proc.has(s.id), `${s.id} 는 절차적이어야 함`).toBe(true);
      }
    }
  });

  it('AI 로 뽑을 이미지가 계획대로 소수다 (수백 장이 아니라 40~50장)', () => {
    const count = aiSpecs().reduce((n, s) => n + expandSpec(s).length, 0);
    expect(count).toBeLessThanOrEqual(60);
  });
});

describe('ProceduralProvider', () => {
  it('모든 명세에 그리기 함수가 있다', () => {
    expect(ProceduralProvider.missingDrawers()).toEqual([]);
  });

  it('모르는 ID 는 명확히 거부한다', () => {
    const p = new ProceduralProvider();
    expect(p.has('없는/스프라이트')).toBe(false);
    expect(() => p.get('없는/스프라이트')).toThrow(/알 수 없는/);
  });

  it('매니페스트의 모든 ID 를 안다', () => {
    const p = new ProceduralProvider();
    for (const id of ALL_SPRITE_IDS) expect(p.has(id), id).toBe(true);
  });
});

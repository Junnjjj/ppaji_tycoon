import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  kairoSpriteIndex,
  kairoUiIconIds,
  kairoAssetSizes,
  assetFileToId,
  assetIdToFile,
  KAIRO,
} from './kairo-contract.js';
import { KairoAtlasProvider, ATLAS_HOLDOUT } from './kairo-atlas.js';
import { HybridProvider } from './index.js';
import type { AtlasIndex } from './atlas.js';
import type { AssetProvider, SpriteSpec } from './types.js';

const ATLAS_INDEX_PATH = 'public/assets/kairo-atlas.json';

/** `get()` 을 안 부르는 검사에서 쓰는 자리 표시 이미지 (Node 에는 캔버스가 없다) */
const NO_IMAGE = null as unknown as CanvasImageSource;

/** 반입 보류분인가 */
const held = (id: string): boolean => ATLAS_HOLDOUT.some((h) => id.startsWith(h.prefix));

describe('생성물 파일명 ↔ 논리 ID — 규칙의 유일한 구현', () => {
  it('144개 정본 ID 가 전부 왕복한다', () => {
    for (const id of kairoAssetSizes().keys()) {
      expect(assetFileToId(assetIdToFile(id)), id).toBe(id);
    }
  });

  it('docs/asset-prompts.md 가 든 예시 셋이 그대로 성립한다', () => {
    expect(assetIdToFile('facility/shop')).toBe('facility__shop.png');
    expect(assetIdToFile('ground/lawn:a0')).toBe('ground__lawn__a0.png');
    expect(assetIdToFile('ui/icon-coin')).toBe('ui__icon-coin.png');
    expect(assetFileToId('facility__shop.png')).toBe('facility/shop');
    expect(assetFileToId('ground__lawn__a0.png')).toBe('ground/lawn:a0');
    expect(assetFileToId('ui__icon-coin.png')).toBe('ui/icon-coin');
  });

  it('규칙에 안 맞는 이름은 null — 부르는 쪽이 위반으로 처리한다', () => {
    expect(assetFileToId('shop.png')).toBeNull();
    expect(assetFileToId('a__b__c__d.png')).toBeNull();
  });
});

describe('한 팩이 담아야 하는 것 — 129 스프라이트 + 15 UI', () => {
  it('스프라이트 색인이 129개다 (절차 프로바이더와 같은 전개)', () => {
    expect(kairoSpriteIndex().size).toBe(129);
  });

  it('UI 아이콘 15개는 스프라이트 계약 **밖**이다 — 드로어 강제 검사에 안 걸린다', () => {
    const ui = kairoUiIconIds();
    expect(ui).toHaveLength(15);
    const sprites = kairoSpriteIndex();
    for (const id of ui) expect(sprites.has(id), id).toBe(false);
  });

  it('규격표가 144개이고 UI 아이콘 크기는 계약값에서 온다', () => {
    const sizes = kairoAssetSizes();
    expect(sizes.size).toBe(144);
    for (const id of kairoUiIconIds()) expect(sizes.get(id)).toEqual(KAIRO.uiIcons.canvas);
  });
});

/*
 * 구운 아틀라스 대조. 색인(`public/`)은 커밋되고 원본 PNG(`assets/generated/`)는
 * `.gitignore` 대상이라, 계약이 바뀌었는데 다시 안 구우면 **여기서만** 드러난다.
 */
describe('구운 아틀라스가 계약과 맞다', () => {
  const index: AtlasIndex | null = existsSync(ATLAS_INDEX_PATH)
    ? (JSON.parse(readFileSync(ATLAS_INDEX_PATH, 'utf8')) as AtlasIndex)
    : null;

  it('아틀라스가 존재한다 — 없으면 npm run bake:atlas', () => {
    expect(index, `${ATLAS_INDEX_PATH} 가 없다`).not.toBeNull();
  });

  it('계약에 없는 프레임이 없다', () => {
    const sizes = kairoAssetSizes();
    const orphans = Object.keys(index ?? {}).filter((id) => !sizes.has(id));
    expect(orphans).toEqual([]);
  });

  it('프레임 크기가 계약 캔버스와 정확히 같다 — 어긋나면 그림이 조용히 밀린다', () => {
    const drift: string[] = [];
    for (const [id, want] of kairoAssetSizes()) {
      const f = index?.[id];
      if (!f) continue;
      if (f.w !== want[0] || f.h !== want[1]) {
        drift.push(`${id} ${f.w}×${f.h}≠${want[0]}×${want[1]}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('144장을 전부 덮는다 — 빠진 것이 있으면 npm run bake:atlas', () => {
    const missing = [...kairoAssetSizes().keys()].filter((id) => !index?.[id]);
    expect(missing).toEqual([]);
  });
});

describe('KairoAtlasProvider — 계약이 정본, 아틀라스는 픽셀만', () => {
  const full = (): AtlasIndex => {
    const idx: AtlasIndex = {};
    let x = 0;
    for (const [id, spec] of kairoSpriteIndex()) {
      idx[id] = { x, y: 0, w: spec.size[0], h: spec.size[1] };
      x += spec.size[0];
    }
    return idx;
  };

  /** 반입 보류분(`ATLAS_HOLDOUT`)을 뺀 장수 — 지금은 벽 8종 */
  const servable = 129 - [...kairoSpriteIndex().keys()].filter((id) => held(id)).length;

  it('UI 아이콘은 씬 텍스처가 아니다 — 스프라이트만 낸다', () => {
    const idx = full();
    for (const id of kairoUiIconIds()) idx[id] = { x: 0, y: 0, w: 24, h: 24 };
    const p = KairoAtlasProvider.fromLoaded(NO_IMAGE, idx);
    expect(p.ids).toHaveLength(servable);
    for (const id of kairoUiIconIds()) expect(p.has(id), id).toBe(false);
  });

  it('⚠ 보류분은 그림이 있어도 안 쓴다 — 폴백이 그린다 (검사를 느슨하게 하는 대신 반입을 미룬다)', () => {
    const p = KairoAtlasProvider.fromLoaded(NO_IMAGE, full());
    expect(ATLAS_HOLDOUT.length, '보류가 없으면 이 검사는 아무것도 안 잰다').toBeGreaterThan(0);
    for (const h of ATLAS_HOLDOUT) {
      expect(h.why.length, `${h.prefix} 에 이유가 없다`).toBeGreaterThan(30);
      const hit = [...kairoSpriteIndex().keys()].filter((id) => id.startsWith(h.prefix));
      expect(hit.length, `${h.prefix} 가 아무 ID 도 안 가린다 — 오타다`).toBeGreaterThan(0);
      for (const id of hit) expect(p.has(id), id).toBe(false);
    }
    expect(p.held.length).toBe(129 - servable);
  });

  it('spec 은 계약에서 온다 — 아틀라스 프레임이 아니다', () => {
    const p = KairoAtlasProvider.fromLoaded(NO_IMAGE, full());
    const specs = kairoSpriteIndex();
    for (const id of p.ids) {
      const s = p.spec(id);
      expect(s, id).toBeDefined();
      expect(s!.size, id).toEqual(specs.get(id)!.size);
      expect(s!.anchor, id).toBe('bottom-center');
    }
  });

  it('⚠ 크기가 다른 프레임은 버린다 — 밀린 그림보다 플레이스홀더가 낫다', () => {
    const idx = full();
    idx['facility/shop'] = { x: 0, y: 0, w: 7, h: 7 };
    const p = KairoAtlasProvider.fromLoaded(NO_IMAGE, idx);
    expect(p.has('facility/shop')).toBe(false);
    expect(p.dropped.some((d) => d.startsWith('facility/shop'))).toBe(true);
    expect(p.ids).toHaveLength(servable - 1);
  });

  it('부분 아틀라스도 성립한다 — 빠진 ID 는 폴백 몫이라 조용히 없다', () => {
    const idx = full();
    delete idx['facility/shop'];
    const p = KairoAtlasProvider.fromLoaded(NO_IMAGE, idx);
    expect(p.has('facility/shop')).toBe(false);
    expect(p.dropped).toEqual([]);
    expect(p.ids).toHaveLength(servable - 1);
  });
});

describe('하이브리드 — 아틀라스 우선 + 절차 폴백', () => {
  const stub = (name: string, ids: string[], size: number): AssetProvider => ({
    name,
    ids,
    has: (id) => ids.includes(id),
    spec: (id) =>
      ids.includes(id)
        ? ({ id, size: [size, size], anchor: 'bottom-center', category: 'prop', source: 'ai' } as SpriteSpec)
        : undefined,
    get: () => name as unknown as HTMLCanvasElement,
  });

  it('둘 다 있으면 앞쪽, 앞쪽에 없으면 뒤쪽', () => {
    const h = new HybridProvider(stub('atlas', ['a', 'b'], 1), stub('proc', ['b', 'c'], 2));
    expect(h.get('a')).toBe('atlas');
    expect(h.get('b')).toBe('atlas');
    expect(h.get('c')).toBe('proc');
    expect(h.spec('b')!.size).toEqual([1, 1]);
    expect(h.spec('c')!.size).toEqual([2, 2]);
    expect([...h.ids].sort()).toEqual(['a', 'b', 'c']);
    expect(h.has('d')).toBe(false);
  });
});

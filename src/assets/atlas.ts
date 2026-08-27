import { ALL_SPRITE_IDS, specForId } from './manifest.js';
import type { AssetProvider, SpriteSpec } from './types.js';

/**
 * AI 픽셀아트 아틀라스 공급자 — 계획서 §4, Phase 5.
 *
 * ProceduralProvider 와 완전히 같은 인터페이스를 구현하므로,
 * 교체는 createAssetProvider() 의 분기 한 줄이다. 게임 코드는 0줄 바뀐다.
 *
 * 아직 아틀라스 파일이 없으므로 load() 는 실패한다. 이는 의도된 상태다 —
 * Phase 5 에서 tools/asset-gen 이 매니페스트를 읽어 파일을 생성한다.
 */

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Physical source pixels per logical game texel. Omitted means legacy 1×. */
  density?: 1 | 2;
}

export type AtlasIndex = Record<string, AtlasFrame>;

export class AtlasProvider implements AssetProvider {
  readonly name = 'atlas';
  readonly ids: readonly string[];
  private cache = new Map<string, HTMLCanvasElement>();

  private constructor(
    private readonly image: HTMLImageElement,
    private readonly index: AtlasIndex,
  ) {
    this.ids = Object.keys(index);
  }

  static async load(
    imageUrl: string,
    indexUrl: string,
    opts: { partial?: boolean } = {},
  ): Promise<AtlasProvider> {
    const [image, index] = await Promise.all([
      loadImage(imageUrl),
      fetch(indexUrl).then((r) => {
        if (!r.ok) throw new Error(`아틀라스 인덱스를 못 읽음: ${indexUrl} (${r.status})`);
        return r.json() as Promise<AtlasIndex>;
      }),
    ]);

    // 매니페스트와 아틀라스가 어긋나면 조용히 깨지는 대신 즉시 알린다.
    // partial 아틀라스(A트랙 점진 반입)는 빠진 ID 를 하이브리드 폴백이 담당하므로 허용한다.
    const missing = ALL_SPRITE_IDS.filter((id) => index[id] === undefined);
    if (missing.length > 0 && !opts.partial) {
      throw new Error(
        `아틀라스에 없는 스프라이트 ${missing.length}개: ${missing.slice(0, 5).join(', ')}` +
          (missing.length > 5 ? ' …' : ''),
      );
    }

    return new AtlasProvider(image, index);
  }

  has(id: string): boolean {
    return this.index[id] !== undefined;
  }

  spec(id: string): SpriteSpec | undefined {
    return specForId(id);
  }

  get(id: string): HTMLCanvasElement {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const f = this.index[id];
    if (!f) throw new Error(`아틀라스에 없는 스프라이트 ID: ${id}`);

    const canvas = document.createElement('canvas');
    canvas.width = f.w;
    canvas.height = f.h;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2D 컨텍스트를 얻지 못했습니다');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);

    this.cache.set(id, canvas);
    return canvas;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`아틀라스 이미지를 못 읽음: ${url}`));
    img.src = url;
  });
}

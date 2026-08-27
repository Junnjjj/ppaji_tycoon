import type { AssetProvider, SpriteCategory, SpriteSpec } from './types.js';

const MANIFEST_URL = 'assets/kairo-terrain-v3-source/manifest.json';

interface TerrainEntry {
  path: string;
  density: 4;
  logicalSize: readonly [number, number];
  physicalSize: readonly [number, number];
  category: SpriteCategory;
}

interface TerrainManifest {
  schemaVersion: 1;
  status: 'TERRAIN_V3_SOURCE_REVIEW_ONLY';
  assets: Record<string, TerrainEntry>;
}

/** 승인된 source-v1 계열의 실제 픽셀을 쓰는 검토 공급자. 라이브 팩과 기본 URL은 그대로다. */
class KairoTerrainV3SourceProvider implements AssetProvider {
  readonly name: string;
  readonly ids: readonly string[];

  private constructor(
    private readonly base: AssetProvider,
    private readonly entries: Map<string, TerrainEntry>,
    private readonly canvases: Map<string, HTMLCanvasElement>,
    private readonly shoreRadius: number | undefined,
  ) {
    this.name = `terrain-v3-source${shoreRadius === undefined ? '' : `-shore-r${shoreRadius}`}(${base.name})`;
    this.ids = [...new Set([...base.ids, ...entries.keys()])];
  }

  static async load(
    base: AssetProvider,
    options: { shoreRadius?: number } = {},
  ): Promise<KairoTerrainV3SourceProvider> {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`terrain-v3 source 매니페스트를 못 읽음 (${response.status})`);
    const manifest = (await response.json()) as TerrainManifest;
    if (manifest.schemaVersion !== 1 || manifest.status !== 'TERRAIN_V3_SOURCE_REVIEW_ONLY') {
      throw new Error('terrain-v3 source 매니페스트 계약이 다름');
    }

    const entries = new Map(Object.entries(manifest.assets));
    const canvases = new Map<string, HTMLCanvasElement>();
    await Promise.all(
      [...entries].map(async ([id, entry]) => {
        const image = await loadImage(entry.path);
        if (image.naturalWidth !== entry.physicalSize[0] || image.naturalHeight !== entry.physicalSize[1]) {
          throw new Error(
            `${id}: terrain-v3 실측 ${image.naturalWidth}×${image.naturalHeight} ≠ ` +
              `${entry.physicalSize[0]}×${entry.physicalSize[1]}`,
          );
        }
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(`${id}: terrain-v3 캔버스 2D 컨텍스트 없음`);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0);
        canvases.set(id, canvas);
      }),
    );
    return new KairoTerrainV3SourceProvider(base, entries, canvases, options.shoreRadius);
  }

  has(id: string): boolean {
    return this.entries.has(id) || this.base.has(id);
  }

  get(id: string): HTMLCanvasElement {
    return this.canvases.get(id) ?? this.base.get(id);
  }

  spec(id: string): SpriteSpec | undefined {
    const entry = this.entries.get(id);
    if (!entry) return this.base.spec(id);
    const base = this.base.spec(id);
    return {
      id,
      size: entry.logicalSize,
      anchor: base?.anchor ?? 'bottom-center',
      category: entry.category,
      source: 'ai',
    };
  }

  density(id: string): number {
    return this.entries.get(id)?.density ?? this.base.density?.(id) ?? 1;
  }

  groundAlt(i: number, j: number, kind: string): number {
    let value = Math.imul(i, 0x1f123bb5) ^ Math.imul(j, 0x5f356495) ^ 0x510e527f;
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
    const hash = (value ^ (value >>> 13)) >>> 0;
    if (kind === 'water_edge' || kind === 'pool_water') return hash % 4;
    if (kind === 'lawn' || kind === 'verge') return hash % 3;
    return 0;
  }

  terrainRockTone(): [number, number, number] {
    return [181, 121, 53];
  }

  terrainLevelHeight(): number {
    return 16;
  }

  terrainShoreRadius(): number | undefined {
    return this.shoreRadius;
  }
}

export async function createKairoTerrainV3SourceProvider(
  base: AssetProvider,
  options: { shoreRadius?: number } = {},
): Promise<AssetProvider> {
  return KairoTerrainV3SourceProvider.load(base, options);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`terrain-v3 이미지를 못 읽음: ${url}`));
    image.src = url;
  });
}

import type { AssetProvider, SpriteCategory, SpriteSpec } from './types.js';

const MANIFEST_URL = 'assets/kairo-terrain-v2-pilot/manifest.json';

interface TerrainEntry {
  path: string;
  density: 2;
  logicalSize: readonly [number, number];
  physicalSize: readonly [number, number];
  category: SpriteCategory;
}

interface TerrainManifest {
  schemaVersion: 1;
  status: 'TERRAIN_V2_REVIEW_ONLY';
  assets: Record<string, TerrainEntry>;
}

/** C안 위에 컨셉 충실 지면만 얹는 검토 공급자. 기본 URL과 라이브 아틀라스는 건드리지 않는다. */
class KairoTerrainV2PilotProvider implements AssetProvider {
  readonly name: string;
  readonly ids: readonly string[];

  private constructor(
    private readonly base: AssetProvider,
    private readonly entries: Map<string, TerrainEntry>,
    private readonly canvases: Map<string, HTMLCanvasElement>,
  ) {
    this.name = `terrain-v2(${base.name})`;
    this.ids = [...new Set([...base.ids, ...entries.keys()])];
  }

  static async load(base: AssetProvider): Promise<KairoTerrainV2PilotProvider> {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`terrain-v2 매니페스트를 못 읽음 (${response.status})`);
    const manifest = (await response.json()) as TerrainManifest;
    if (manifest.schemaVersion !== 1 || manifest.status !== 'TERRAIN_V2_REVIEW_ONLY') {
      throw new Error('terrain-v2 매니페스트 계약이 다름');
    }

    const entries = new Map(Object.entries(manifest.assets));
    const canvases = new Map<string, HTMLCanvasElement>();
    await Promise.all(
      [...entries].map(async ([id, entry]) => {
        const image = await loadImage(entry.path);
        if (image.naturalWidth !== entry.physicalSize[0] || image.naturalHeight !== entry.physicalSize[1]) {
          throw new Error(
            `${id}: terrain-v2 실측 ${image.naturalWidth}×${image.naturalHeight} ≠ ` +
              `${entry.physicalSize[0]}×${entry.physicalSize[1]}`,
          );
        }
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(`${id}: terrain-v2 캔버스 2D 컨텍스트 없음`);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0);
        canvases.set(id, canvas);
      }),
    );
    return new KairoTerrainV2PilotProvider(base, entries, canvases);
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
      source: base?.source ?? 'ai',
    };
  }

  density(id: string): number {
    return this.entries.get(id)?.density ?? this.base.density?.(id) ?? 1;
  }

  groundAlt(i: number, j: number, kind: string): number {
    // 선형 (i+j)%3은 대각선 띠가 된다. 정수 해시는 같은 칸을 고정하면서 띠만 없앤다.
    let value = Math.imul(i, 0x1f123bb5) ^ Math.imul(j, 0x5f356495) ^ 0x6a09e667;
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
    value ^= value >>> 13;
    const hash = value >>> 0;
    // D5는 B/C의 불규칙한 재료 밀도를 위해 6개 결정론적 변형을 쓴다.
    // 넓은 강의 자체 흰 하이라이트(a0)는 드물게 두고, 나머지는 다섯 청록·남색 띠다.
    if (kind === 'water_edge' || kind === 'pool_water') return hash % 19 === 0 ? 0 : 1 + (hash % 5);
    return hash % 6;
  }

  terrainRockTone(): [number, number, number] {
    return [185, 125, 50];
  }

  terrainLevelHeight(): number {
    return 16;
  }
}

export async function createKairoTerrainV2PilotProvider(base: AssetProvider): Promise<AssetProvider> {
  return KairoTerrainV2PilotProvider.load(base);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`terrain-v2 이미지를 못 읽음: ${url}`));
    image.src = url;
  });
}

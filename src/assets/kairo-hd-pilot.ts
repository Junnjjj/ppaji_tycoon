import type { AssetProvider, SpriteCategory, SpriteSpec } from './types.js';

const MANIFEST_URL = 'assets/kairo-hd-pilot-v1/manifest.json';

type PilotGroup = 'ground' | 'facility-current-fit' | 'facility-approved-fit';

interface PilotEntry {
  path: string;
  group: PilotGroup;
  density: 2;
  logicalSize: readonly [number, number];
  physicalSize: readonly [number, number];
  category: SpriteCategory;
}

interface PilotManifest {
  schemaVersion: 1;
  status: 'HD_PIXEL_MODE_REVIEW_ONLY';
  assets: Record<string, PilotEntry>;
}

/**
 * 기본 아틀라스 위에 검토용 2× 소스만 얹는다.
 *
 * `approvedFit=false`는 현재 라이브 풋프린트를 그대로 두어 해상도 변화만 비교한다.
 * `approvedFit=true`는 별도 런타임 오버라이드와 짝을 이뤄 승인된 1×1/2×2 캔버스와
 * d0–d3를 낸다. 어느 쪽도 기본 URL에서는 로드되지 않는다.
 */
export class KairoHdPilotProvider implements AssetProvider {
  readonly name: string;
  readonly ids: readonly string[];

  private constructor(
    private readonly base: AssetProvider,
    private readonly entries: Map<string, PilotEntry>,
    private readonly canvases: Map<string, HTMLCanvasElement>,
    approvedFit: boolean,
  ) {
    this.name = `hd-pilot-2x(${approvedFit ? 'approved-fit' : 'current-fit'} + ${base.name})`;
    this.ids = [...new Set([...base.ids, ...entries.keys()])];
  }

  static async load(base: AssetProvider, approvedFit: boolean): Promise<KairoHdPilotProvider> {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`HD 파일럿 매니페스트를 못 읽음 (${response.status})`);
    const manifest = (await response.json()) as PilotManifest;
    if (manifest.schemaVersion !== 1 || manifest.status !== 'HD_PIXEL_MODE_REVIEW_ONLY') {
      throw new Error('HD 파일럿 매니페스트 계약이 다름');
    }

    const entries = new Map<string, PilotEntry>();
    for (const [id, entry] of Object.entries(manifest.assets)) {
      const wanted =
        entry.group === 'ground' ||
        (approvedFit ? entry.group === 'facility-approved-fit' : entry.group === 'facility-current-fit');
      if (wanted) entries.set(id, entry);
    }

    const canvases = new Map<string, HTMLCanvasElement>();
    await Promise.all(
      [...entries].map(async ([id, entry]) => {
        const image = await loadImage(entry.path);
        if (image.naturalWidth !== entry.physicalSize[0] || image.naturalHeight !== entry.physicalSize[1]) {
          throw new Error(
            `${id}: HD 실측 ${image.naturalWidth}×${image.naturalHeight} ≠ 매니페스트 ${entry.physicalSize[0]}×${entry.physicalSize[1]}`,
          );
        }
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(`${id}: HD 캔버스 2D 컨텍스트 없음`);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0);
        canvases.set(id, canvas);
      }),
    );

    return new KairoHdPilotProvider(base, entries, canvases, approvedFit);
  }

  has(id: string): boolean {
    return this.entries.has(id) || this.base.has(id);
  }

  get(id: string): HTMLCanvasElement {
    const pilot = this.canvases.get(id);
    if (pilot) return pilot;
    return this.base.get(id);
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
}

export async function createKairoHdPilotProvider(
  base: AssetProvider,
  options: { approvedFit: boolean },
): Promise<AssetProvider> {
  return KairoHdPilotProvider.load(base, options.approvedFit);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`HD 파일럿 이미지를 못 읽음: ${url}`));
    image.src = url;
  });
}

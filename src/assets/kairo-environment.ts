import entries from './kairo-environment-manifest.json' with { type: 'json' };
import type { AssetProvider, SpriteSpec } from './types.js';

/** Approved native boundary and landscape art. No fitting or resampling at runtime. */
export async function createEnvironmentProvider(base: AssetProvider): Promise<AssetProvider> {
  const canvases = new Map<string, HTMLCanvasElement>();
  const specs = new Map<string, SpriteSpec>();
  await Promise.all(entries.map(async (entry) => {
    const image = new Image();
    image.src = entry.path;
    await image.decode();
    if (image.width !== entry.size || image.height !== entry.size) {
      throw new Error(`Environment native size mismatch: ${entry.id}`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = entry.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Environment canvas unavailable');
    ctx.drawImage(image, 0, 0);
    canvases.set(entry.id, canvas);
    specs.set(entry.id, { id: entry.id, size: [entry.size, entry.size], anchor: 'center', category: 'prop', source: 'ai' });
  }));
  return {
    name: `gapyeong(${base.name})`,
    ids: [...base.ids, ...canvases.keys()],
    has: (id) => canvases.has(id) || base.has(id),
    get: (id) => canvases.get(id) ?? base.get(id),
    spec: (id) => specs.get(id) ?? base.spec(id),
    density: (id) => canvases.has(id) ? 1 : base.density?.(id) ?? 1,
  };
}

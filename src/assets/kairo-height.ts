import entries from './kairo-height-manifest.json' with { type: 'json' };
import type { AssetProvider, SpriteSpec } from './types.js';

/** One physical root, four rotations; the 34×64 guard preserves the tile footprint. */
export async function createHeightProvider(base: AssetProvider): Promise<AssetProvider> {
  const images = new Map<string, HTMLCanvasElement>();
  await Promise.all(entries.map(async e => {
    const image = new Image(); image.src = e.path; await image.decode();
    if (image.width !== e.size[0] || image.height !== e.size[1]) throw new Error(`Height asset size: ${e.id}`);
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    c.getContext('2d')!.drawImage(image, 0, 0); images.set(e.id, c);
  }));
  return {
    name: `height(${base.name})`, ids: [...base.ids, ...images.keys()],
    has: id => images.has(id) || base.has(id), get: id => images.get(id) ?? base.get(id),
    spec: id => images.has(id) ? { id, size: [34, 64], anchor: 'bottom-center', category: 'prop', source: 'ai' } as SpriteSpec : base.spec(id),
    density: id => images.has(id) ? 1 : base.density?.(id) ?? 1,
    groundAlt: (i, j, kind) => base.groundAlt?.(i, j, kind) ?? 0,
    terrainLevelHeight: () => 16,
    ...(base.terrainRockTone ? { terrainRockTone: () => base.terrainRockTone!() } : {}),
    ...(base.terrainShoreRadius ? { terrainShoreRadius: () => base.terrainShoreRadius!() } : {}),
  };
}

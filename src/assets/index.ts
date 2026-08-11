import { AtlasProvider } from './atlas.js';
import { ProceduralProvider } from './procedural.js';
import type { AssetProvider } from './types.js';

export type { AssetProvider, SpriteSpec, Anchor, SpriteCategory } from './types.js';
export { variantId, expandSpec, parseId } from './types.js';
export { ProceduralProvider } from './procedural.js';
export { AtlasProvider } from './atlas.js';
export {
  TILE_SIZE,
  ART_STYLE,
  SPRITE_SPECS,
  ALL_SPRITE_IDS,
  specForId,
  specForBase,
  aiSpecs,
  proceduralSpecs,
} from './manifest.js';

const ATLAS_IMAGE = 'assets/atlas.png';
const ATLAS_INDEX = 'assets/atlas.json';

/**
 * 에셋 공급자를 고른다 — 계획서 §4 의 "교체 지점".
 *
 * 아틀라스가 있으면 그것을, 없으면 절차적 생성을 쓴다.
 * Phase 5 에서 tools/asset-gen 이 아틀라스를 만들어 넣으면 이 함수가 자동으로 전환되고,
 * 게임 코드는 한 줄도 바뀌지 않는다.
 */
export async function createAssetProvider(): Promise<AssetProvider> {
  try {
    const head = await fetch(ATLAS_INDEX, { method: 'HEAD' });
    if (head.ok) return await AtlasProvider.load(ATLAS_IMAGE, ATLAS_INDEX);
  } catch {
    // 아틀라스 없음 — 정상. 절차적 생성으로 간다.
  }
  return new ProceduralProvider();
}

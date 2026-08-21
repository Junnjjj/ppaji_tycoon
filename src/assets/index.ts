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
 * 부분 아틀라스 + 절차 폴백 하이브리드 — penguin D-029 의 학습을 역이식.
 * 아틀라스에 있는 ID 는 AI 픽셀아트를, 없는 ID 는 절차 생성을 쓴다.
 * 한 종을 반입할 때마다 그 종만 즉시 그림이 바뀌고, 나머지는 계속 동작한다.
 *
 * 두 인자 모두 `AssetProvider` 다 — v1 씬과 카이로 씬이 **같은 클래스**를 쓴다
 * (Phase G). 프로바이더 짝마다 하이브리드를 새로 쓰면 "한쪽만 고친" 상태가 생긴다.
 */
export class HybridProvider implements AssetProvider {
  readonly name: string;
  readonly ids: readonly string[];

  constructor(
    private readonly primary: AssetProvider,
    private readonly fallback: AssetProvider,
  ) {
    this.name = `hybrid(${primary.name} ${primary.ids.length} + ${fallback.name})`;
    this.ids = [...new Set([...primary.ids, ...fallback.ids])];
  }

  has(id: string): boolean {
    return this.primary.has(id) || this.fallback.has(id);
  }

  spec(id: string) {
    return this.primary.has(id) ? this.primary.spec(id) : this.fallback.spec(id);
  }

  get(id: string): HTMLCanvasElement {
    return this.primary.has(id) ? this.primary.get(id) : this.fallback.get(id);
  }
}

/**
 * 에셋 공급자를 고른다 — 계획서 §4 의 "교체 지점".
 *
 * 아틀라스가 있으면 하이브리드(아틀라스 우선 + 절차 폴백)를, 없으면 절차 생성을 쓴다.
 * 아틀라스를 만들어 넣으면 이 함수가 자동으로 전환되고, 게임 코드는 한 줄도 바뀌지 않는다.
 */
export async function createAssetProvider(): Promise<AssetProvider> {
  try {
    const head = await fetch(ATLAS_INDEX, { method: 'HEAD' });
    if (head.ok) {
      const atlas = await AtlasProvider.load(ATLAS_IMAGE, ATLAS_INDEX, { partial: true });
      return new HybridProvider(atlas, new ProceduralProvider());
    }
  } catch {
    // 아틀라스 없음 — 정상. 절차적 생성으로 간다.
  }
  return new ProceduralProvider();
}

import type Phaser from 'phaser';
import type { AssetProvider } from '../assets/index.js';

/**
 * 에셋 공급자의 캔버스를 Phaser 텍스처로 등록한다.
 *
 * 여기가 assets/ 와 Phaser 가 만나는 유일한 지점이다.
 * ProceduralProvider 든 AtlasProvider 든 캔버스를 내놓기만 하면 되므로,
 * 나중에 AI 픽셀아트로 갈아끼워도 이 함수는 그대로다.
 */
export function registerTextures(
  scene: Phaser.Scene,
  provider: AssetProvider,
  ids: Iterable<string>,
): number {
  let n = 0;
  for (const id of ids) {
    if (scene.textures.exists(id)) continue;
    if (!provider.has(id)) continue;
    scene.textures.addCanvas(id, provider.get(id));
    n++;
  }
  return n;
}

/** 지형 타일은 통짜 텍스처로 굽히므로 개별 등록이 필요 없다. */
export function isTerrainId(id: string): boolean {
  return id.startsWith('terrain/');
}

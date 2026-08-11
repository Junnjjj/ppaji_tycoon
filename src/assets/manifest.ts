import raw from './manifest.json' with { type: 'json' };
import { expandSpec, type SpriteSpec } from './types.js';

interface RawManifest {
  tileSize: number;
  style: string;
  sprites: SpriteSpec[];
}

const data = raw as unknown as RawManifest;

export const TILE_SIZE: number = data.tileSize;
export const ART_STYLE: string = data.style;
export const SPRITE_SPECS: readonly SpriteSpec[] = data.sprites;

const byBase = new Map<string, SpriteSpec>();
for (const s of SPRITE_SPECS) byBase.set(s.id, s);

/** 최종 ID → 그 ID 를 낳은 명세 */
const specByFinalId = new Map<string, SpriteSpec>();
for (const s of SPRITE_SPECS) {
  for (const id of expandSpec(s)) specByFinalId.set(id, s);
}

export const ALL_SPRITE_IDS: readonly string[] = [...specByFinalId.keys()];

export function specForBase(baseId: string): SpriteSpec | undefined {
  return byBase.get(baseId);
}

export function specForId(finalId: string): SpriteSpec | undefined {
  return specByFinalId.get(finalId);
}

/** AI 로 생성해야 할 명세만. tools/asset-gen 의 작업 목록. */
export function aiSpecs(): SpriteSpec[] {
  return SPRITE_SPECS.filter((s) => s.source === 'ai');
}

/** 영구히 코드가 그리는 명세 */
export function proceduralSpecs(): SpriteSpec[] {
  return SPRITE_SPECS.filter((s) => s.source === 'procedural');
}

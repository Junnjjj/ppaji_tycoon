/**
 * 아틀라스 공급자 (G15) — `public/assets/fac-atlas.png` + `.json` 에서 같은 논리 ID(`fac/{id}/{facing}`)를 잘라 낸다.
 * 없는 ID 는 null → `HybridProvider` 가 절차 도트로 떨어진다. 게임 코드는 provider 가 바뀐 줄 모른다.
 */
import type { AssetProvider, SpriteSpec } from './types.js';

export interface AtlasJson { version: number; w: number; h: number; sprites: Record<string, { x: number; y: number; w: number; h: number }> }

export class AtlasProvider implements AssetProvider {
  private readonly cache = new Map<string, HTMLCanvasElement | null>();
  constructor(private readonly image: HTMLImageElement, private readonly json: AtlasJson) {}

  ids(): readonly string[] { return Object.keys(this.json.sprites); }

  spec(id: string): SpriteSpec | null {
    const s = this.json.sprites[id];
    return s ? { id, w: s.w, h: s.h, ax: Math.round(s.w / 2), ay: s.h, source: 'art' } : null;
  }

  canvas(id: string): HTMLCanvasElement | null {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    const s = this.json.sprites[id];
    let out: HTMLCanvasElement | null = null;
    if (s) {
      out = document.createElement('canvas');
      out.width = s.w; out.height = s.h;
      out.getContext('2d')?.drawImage(this.image, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    }
    this.cache.set(id, out);
    return out;
  }
}

/** 아틀라스 먼저, 없으면 절차 — ID 단위 교체 지점 */
export class HybridProvider implements AssetProvider {
  constructor(private readonly atlas: AssetProvider | null, private readonly fallback: AssetProvider) {}
  ids(): readonly string[] { return [...new Set([...(this.atlas?.ids() ?? []), ...this.fallback.ids()])]; }
  spec(id: string): SpriteSpec | null { return this.atlas?.spec(id) ?? this.fallback.spec(id); }
  canvas(id: string): HTMLCanvasElement | null { return this.atlas?.canvas(id) ?? this.fallback.canvas(id); }
}

/** 아틀라스를 읽는다 — 없거나 깨지면 null (게임은 절차 도트로 뜬다). `?atlas=0` 이면 안 읽는다 (음성 대조군) */
export function loadAtlas(base = './assets/fac-atlas'): Promise<AtlasProvider | null> {
  if (new URLSearchParams(location.search).get('atlas') === '0') return Promise.resolve(null);
  return fetch(`${base}.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<AtlasJson>) : Promise.reject(new Error(String(r.status)))))
    .then((json) => new Promise<AtlasProvider | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(new AtlasProvider(img, json));
      img.onerror = () => resolve(null);
      img.src = `${base}.png?v=${json.version}`;
    }))
    .catch(() => null);
}

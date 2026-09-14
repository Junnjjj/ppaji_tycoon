/**
 * 레거시 아틀라스 공급자 (P14, D19·D20) — 빠지 타이쿤 카이로 씬의 `kairo-atlas.png`(AI 도트 144프레임)를 ppaji 논리 ID 로 잇는다.
 *   fac/<id>/<facing> → facility/<id> (facing 1 은 좌우 반전 — 레거시도 「앞면 하나 + 뒤집기」였다)
 *   tile/<kind>[:frame] → ground/<legacy>:a{frame} (모래→path_sand · 잔디→lawn · 포장→path_stone · 실내→floor_indoor · 강/여울→water_edge · 데크→path_deck · 수역→pool_water)
 * 없는 ID 는 null → HybridProvider 가 다음 공급자(3D 프리렌더 → 절차 도트)로 떨어진다. 두 프로젝트는 투영(2:1, 타일 32×16)과 앵커(아래 가운데)가 같다.
 */
import { cssVar } from '../ui/tokens.js';
import type { AssetProvider, SpriteSpec } from './types.js';

type Frame = { x: number; y: number; w: number; h: number };
export type KairoAtlasJson = Record<string, Frame>;

const TILE_TO_GROUND: Record<string, string> = { sand: 'path_sand', grass: 'lawn', path: 'path_stone', indoor: 'floor_indoor', river: 'water_edge', shallow: 'water_edge', deck: 'path_deck', gate: 'path_stone', sandpath: 'path_sand', sidewalk: 'sidewalk', woodpath: 'path_deck', flowerbed: 'verge', gravel: 'mountain_rock', road: 'road', rock: 'mountain_rock', hall: 'path_stone' }; // P43 도시 띠 차도 · P44 암반 · P45-a 복도 // P22 지면 5종 // 수역(pool)은 뺀다 — 물빛 tint 를 받는 흰빛 절차 베이스가 정본(레거시 pool_water 는 어두워 핑크가 안 뜬다)

/**
 * ppaji ID → 레거시 프레임 이름 후보 (없으면 null).
 * P57-a(main 병합): main 아틀라스는 4방향 시설을 `facility/<id>:d0~d3` 로만 들고 있다(옛 `facility/<id>` 키 없음) —
 * facing 0 = `:d0`, facing 1 = `:d1`(진짜 옆면, 뒤집기 아님). 2방향 시설은 옛 키 + facing 1 뒤집기 그대로.
 * `json` 을 주면 있는 것을 고르고, 안 주면(검사) 첫 후보를 낸다.
 */
export function kairoFrameFor(id: string, json?: KairoAtlasJson): { frame: string; flip: boolean } | null {
  const fac = id.match(/^fac\/([a-z0-9_]+)\/([01])$/);
  if (fac) {
    const dir = `facility/${fac[1]}:d${fac[2]}`;
    if (!json || json[dir]) return { frame: dir, flip: false };
    return { frame: `facility/${fac[1]}`, flip: fac[2] === '1' };
  }
  const tile = id.match(/^tile\/([a-z]+)(?::(\d+))?$/);
  if (tile) {
    const g = TILE_TO_GROUND[tile[1] as string];
    if (!g) return null;
    const alt = tile[1] === 'shallow' ? 1 : tile[1] === 'gate' ? 2 : Number(tile[2] ?? 0) % 3;
    return { frame: `ground/${g}:a${alt}`, flip: false };
  }
  return null;
}

export class KairoAtlasProvider implements AssetProvider {
  private readonly cache = new Map<string, HTMLCanvasElement | null>();
  constructor(private readonly image: HTMLImageElement, private readonly json: KairoAtlasJson) {}

  ids(): readonly string[] { return []; } // 이름은 ppaji 쪽이 정한다 — 이 공급자는 「있으면 준다」

  spec(id: string): SpriteSpec | null {
    const m = kairoFrameFor(id, this.json);
    const f = m ? this.json[m.frame] : undefined;
    return f ? { id, w: f.w, h: f.h, ax: Math.round(f.w / 2), ay: f.h, source: 'art' } : null;
  }

  canvas(id: string): HTMLCanvasElement | null {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    const m = kairoFrameFor(id, this.json);
    const f = m ? this.json[m.frame] : undefined;
    let out: HTMLCanvasElement | null = null;
    if (m && f) {
      out = document.createElement('canvas');
      out.width = f.w; out.height = f.h;
      const ctx = out.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        if (m.flip) { ctx.translate(f.w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        if (id === 'tile/flowerbed') drawFlowers(ctx, f.w, f.h); // P22: 레거시에 꽃밭 프레임이 없다 — verge(풀띠) 위에 꽃 도트를 코드로 얹는다 (움직임처럼 그림 위에 코드)
      }
    }
    this.cache.set(id, out);
    return out;
  }
}

/** `?legacy=0` 이면 안 읽는다 (음성 대조군 — 3D 프리렌더/절차로 뜬다) */
export function loadKairoAtlas(base = './assets/kairo-atlas'): Promise<KairoAtlasProvider | null> {
  const q = new URLSearchParams(location.search);
  if (q.get('legacy') === '0' || q.get('atlas') === '0') return Promise.resolve(null);
  return fetch(`${base}.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<KairoAtlasJson>) : Promise.reject(new Error(String(r.status)))))
    .then((json) => new Promise<KairoAtlasProvider | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(new KairoAtlasProvider(img, json));
      img.onerror = () => resolve(null);
      img.src = `${base}.png?v=15`;
    }))
    .catch(() => null);
}

/** 꽃밭 도트 — 마름모 안쪽 고정 자리 7곳에 세 가지 꽃색 (결정론, 프레임마다 같다) */
function drawFlowers(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const colors = [cssVar('--tile-flowerbed-dot'), cssVar('--tile-flowerbed-lt'), cssVar('--tile-flowerbed-white')].filter((c) => c.length > 0);
  if (colors.length === 0) return;
  const spots: [number, number][] = [[0.5, 0.25], [0.32, 0.45], [0.68, 0.45], [0.5, 0.6], [0.4, 0.78], [0.62, 0.8], [0.5, 0.42]];
  spots.forEach(([fx, fy], k) => {
    ctx.fillStyle = colors[k % colors.length] as string;
    ctx.fillRect(Math.round(fx * w), Math.round(fy * h), 1, 1);
  });
}

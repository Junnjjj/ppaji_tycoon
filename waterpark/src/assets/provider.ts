import manifest from './manifest.json';
import type { AssetProvider, SpriteSpec } from './types.js';
import { drawTile } from './draw/tiles.js';
import { drawGuest } from './draw/guest.js';
import { drawFacility } from './draw/facility.js';
import type { FacilityDef } from '../data/schema.js';

interface ManifestSprite extends SpriteSpec {
  draw: string;
  /** `id:...` 변형 전부를 한 줄이 덮는다 (손님 팔레트×포즈×프레임) */
  family?: boolean;
}

/** 이름 → 그리는 함수. 새 종류는 여기 한 줄 + manifest 한 줄이다 */
const DRAWERS: Record<string, (id: string) => HTMLCanvasElement | null> = {
  tile: (id) => drawTile(id.slice('tile/'.length)),
  guest: (id) => drawGuest(id),
  facility: (id) => {
    const m = id.match(/^fac\/([a-z0-9_]+)\/([01])$/);
    const def = m ? facilityDefs.get(m[1] as string) : undefined;
    return def ? drawFacility(def, Number(m?.[2]) === 1 ? 1 : 0) : null;
  },
};

/** 시설 정의 — `registerFacilityDefs` 로 넣는다 (assets 는 sim 의 데이터 형태만 안다) */
const facilityDefs = new Map<string, FacilityDef>();
export function registerFacilityDefs(defs: Iterable<FacilityDef>): void {
  for (const d of defs) facilityDefs.set(d.id, d);
}

/**
 * 절차 에셋 공급자 — 부팅 때 매니페스트 전부를 캔버스에 굽는다 (지형 6장은 밀리초다).
 * `canvas()` 는 캐시를 돌려주므로 같은 ID 를 몇 번 물어도 다시 굽지 않는다.
 */
export class ProceduralProvider implements AssetProvider {
  private readonly specs = new Map<string, ManifestSprite>();
  private readonly cache = new Map<string, HTMLCanvasElement | null>();

  constructor() {
    for (const s of (manifest as { sprites: ManifestSprite[] }).sprites) this.specs.set(s.id, s);
  }

  ids(): readonly string[] {
    return [...this.specs.keys()];
  }

  spec(id: string): SpriteSpec | null {
    return this.specs.get(id) ?? this.familyOf(id) ?? null;
  }

  canvas(id: string): HTMLCanvasElement | null {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    const s = this.specs.get(id) ?? this.familyOf(id);
    const draw = s ? DRAWERS[s.draw] : undefined;
    const out = draw ? draw(id) : null;
    this.cache.set(id, out);
    return out;
  }

  /** 패밀리 — `guest/body:3/walk/0` 은 `guest/body`, `fac/toilet/0` 은 `fac` 가 덮는다 */
  private familyOf(id: string): ManifestSprite | undefined {
    // `tile/pool:2` 처럼 ':' 변형은 기본 항목이 덮는다 (물결 프레임, G18)
    const base = this.specs.get(id.split(':')[0] ?? '');
    if (base && id.includes(':') && !base.family) return base;
    for (const key of [id.split(':')[0] ?? '', id.split('/')[0] ?? '']) {
      const fam = this.specs.get(key);
      if (fam?.family) return fam;
    }
    return undefined;
  }

  /** 검사용 — 매니페스트의 모든 draw 키가 등록부에 있는가 */
  static missingDrawers(): string[] {
    return (manifest as { sprites: ManifestSprite[] }).sprites
      .filter((s) => DRAWERS[s.draw] === undefined)
      .map((s) => `${s.id} → ${s.draw}`);
  }
}

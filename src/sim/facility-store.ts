import { isLand } from './terrain.js';
import type { World } from './world.js';
import { footprint, requireFacilityDef, type FacilityDef } from './facility.js';

/**
 * 배치된 시설들과 타일 점유 격자.
 *
 * 점유 격자를 따로 두는 이유: 겹침 판정과 "이 타일에 뭐가 있나"가
 * 손님 길찾기·배치 미리보기에서 프레임마다 불리기 때문에 O(1) 이어야 한다.
 */

export type Rotation = 0 | 1 | 2 | 3;

export interface PlacedFacility {
  /** 인스턴스 고유 번호 */
  iid: number;
  defId: string;
  /** 좌상단 타일 */
  x: number;
  y: number;
  rot: Rotation;
  /** 대기 중인 손님 수 (Phase 1) */
  queue: number;
  /** 이용 중인 손님 수 */
  inUse: number;
}

export type PlaceFailure =
  | 'out-of-bounds'
  | 'overlap'
  | 'bad-terrain'
  | 'needs-land-adjacent'
  | 'already-exists';

export interface PlaceCheck {
  ok: boolean;
  reason?: PlaceFailure;
}

const EMPTY = -1;

export const PLACE_FAILURE_MESSAGES: Record<PlaceFailure, string> = {
  'out-of-bounds': '맵 밖입니다',
  overlap: '다른 시설과 겹칩니다',
  'bad-terrain': '이 지형에는 지을 수 없습니다',
  'needs-land-adjacent': '육지에 닿아야 합니다',
  'already-exists': '이미 있습니다',
};

export class FacilityStore {
  private readonly occupancy: Int32Array;
  private readonly items = new Map<number, PlacedFacility>();
  private nextIid = 1;

  constructor(private readonly world: World) {
    this.occupancy = new Int32Array(world.width * world.height).fill(EMPTY);
  }

  /** 해당 타일을 점유한 시설 인스턴스 번호. 없으면 -1. */
  occupantAt(x: number, y: number): number {
    if (!this.world.inBounds(x, y)) return EMPTY;
    return this.occupancy[y * this.world.width + x] as number;
  }

  facilityAt(x: number, y: number): PlacedFacility | undefined {
    const iid = this.occupantAt(x, y);
    return iid === EMPTY ? undefined : this.items.get(iid);
  }

  /** 인스턴스 번호로 조회 */
  byIid(iid: number): PlacedFacility | undefined {
    return this.items.get(iid);
  }

  get all(): Iterable<PlacedFacility> {
    return this.items.values();
  }

  get count(): number {
    return this.items.size;
  }

  countOf(defId: string): number {
    let n = 0;
    for (const f of this.items.values()) if (f.defId === defId) n++;
    return n;
  }

  /**
   * 여기에 지을 수 있는가. 배치 미리보기가 매 프레임 호출하므로 할당 없이 동작해야 한다.
   */
  canPlace(def: FacilityDef, x: number, y: number, rot: Rotation): PlaceCheck {
    if (def.unique && this.countOf(def.id) > 0) {
      return { ok: false, reason: 'already-exists' };
    }

    const [w, h] = footprint(def, rot);
    const allowed = def.placement.terrain;

    if (
      !this.world.inBounds(x, y) ||
      !this.world.inBounds(x + w - 1, y + h - 1) ||
      x < 0 ||
      y < 0
    ) {
      return { ok: false, reason: 'out-of-bounds' };
    }

    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (this.occupantAt(tx, ty) !== EMPTY) return { ok: false, reason: 'overlap' };
        if (!allowed.includes(this.world.at(tx, ty))) {
          return { ok: false, reason: 'bad-terrain' };
        }
      }
    }

    if (def.placement.requiresLandAdjacent && !this.touchesLand(x, y, w, h)) {
      return { ok: false, reason: 'needs-land-adjacent' };
    }

    return { ok: true };
  }

  /** 점유 영역이 육지와 맞닿아 있는가 (수변 시설 판정) */
  private touchesLand(x: number, y: number, w: number, h: number): boolean {
    for (let tx = x; tx < x + w; tx++) {
      if (isLand(this.world.at(tx, y - 1))) return true;
      if (isLand(this.world.at(tx, y + h))) return true;
    }
    for (let ty = y; ty < y + h; ty++) {
      if (isLand(this.world.at(x - 1, ty))) return true;
      if (isLand(this.world.at(x + w, ty))) return true;
    }
    return false;
  }

  /** 배치한다. 불가능하면 null. */
  place(defId: string, x: number, y: number, rot: Rotation = 0): PlacedFacility | null {
    const def = requireFacilityDef(defId);
    if (!this.canPlace(def, x, y, rot).ok) return null;

    const f: PlacedFacility = { iid: this.nextIid++, defId, x, y, rot, queue: 0, inUse: 0 };
    this.items.set(f.iid, f);
    this.stampOccupancy(f, f.iid);
    return f;
  }

  remove(iid: number): boolean {
    const f = this.items.get(iid);
    if (!f) return false;
    this.stampOccupancy(f, EMPTY);
    this.items.delete(iid);
    return true;
  }

  private stampOccupancy(f: PlacedFacility, value: number): void {
    const def = requireFacilityDef(f.defId);
    const [w, h] = footprint(def, f.rot);
    for (let ty = f.y; ty < f.y + h; ty++) {
      for (let tx = f.x; tx < f.x + w; tx++) {
        if (this.world.inBounds(tx, ty)) this.occupancy[ty * this.world.width + tx] = value;
      }
    }
  }

  /** 세이브용 */
  toSnapshot(): PlacedFacility[] {
    return [...this.items.values()].map((f) => ({ ...f }));
  }

  restore(list: readonly PlacedFacility[]): void {
    this.occupancy.fill(EMPTY);
    this.items.clear();
    this.nextIid = 1;
    for (const f of list) {
      const copy = { ...f };
      this.items.set(copy.iid, copy);
      this.stampOccupancy(copy, copy.iid);
      this.nextIid = Math.max(this.nextIid, copy.iid + 1);
    }
  }
}

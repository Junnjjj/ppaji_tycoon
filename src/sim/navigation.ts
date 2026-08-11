import { isWalkable } from './terrain.js';
import type { World } from './world.js';
import { footprint, requireFacilityDef } from './facility.js';
import type { FacilityStore, PlacedFacility } from './facility-store.js';
import { FlowField } from './pathfield.js';

/**
 * 통행 가능성과 시설별 거리장을 관리한다.
 *
 * 시설이 바뀔 때만 거리장을 다시 만든다. 손님이 몇 명이든 비용은 같다.
 */
export class Navigation {
  private readonly fields = new Map<number, FlowField>();
  private dirty = true;

  constructor(
    private readonly world: World,
    private readonly facilities: FacilityStore,
  ) {}

  /** 시설이 추가·제거되면 호출. 다음 rebuild 때 거리장을 다시 만든다. */
  markDirty(): void {
    this.dirty = true;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  /** 현재 유지 중인 거리장 개수. 시설 수와 같아야 정상. */
  get fieldCount(): number {
    return this.fields.size;
  }

  /**
   * 손님이 지나갈 수 있는 타일인가.
   * 지형이 걸을 수 있어야 하고, 시설이 막고 있지 않아야 한다 (길은 예외).
   */
  walkable = (x: number, y: number): boolean => {
    if (!isWalkable(this.world.at(x, y))) return false;
    const f = this.facilities.facilityAt(x, y);
    if (!f) return true;
    return requireFacilityDef(f.defId).layer === 'path';
  };

  /**
   * 시설의 "입구" — 점유 영역에 맞닿은 걸을 수 있는 타일들.
   * 손님은 여기까지 와서 줄을 선다.
   */
  entrancesOf(f: PlacedFacility): Array<readonly [number, number]> {
    const def = requireFacilityDef(f.defId);
    const [w, h] = footprint(def, f.rot);
    const out: Array<readonly [number, number]> = [];

    const consider = (x: number, y: number): void => {
      if (this.walkable(x, y)) out.push([x, y]);
    };

    for (let x = f.x; x < f.x + w; x++) {
      consider(x, f.y - 1);
      consider(x, f.y + h);
    }
    for (let y = f.y; y < f.y + h; y++) {
      consider(f.x - 1, y);
      consider(f.x + w, y);
    }
    return out;
  }

  /** 시설로 향하는 거리장. 아직 없으면 rebuild 후 생긴다. */
  fieldFor(iid: number): FlowField | undefined {
    if (this.dirty) this.rebuild();
    return this.fields.get(iid);
  }

  /** 입구가 하나도 없어 도달 불가능한 시설인가 */
  isolated(iid: number): boolean {
    const field = this.fieldFor(iid);
    return field === undefined;
  }

  /**
   * 거리장을 전부 다시 만든다. 시설이 바뀐 뒤 한 번만 돌면 된다.
   * 시간 측정이 필요하면 호출자가 감싸서 잰다 (불변식 2 — sim 은 시계를 쓰지 않는다).
   */
  rebuild(): void {
    this.fields.clear();

    for (const f of this.facilities.all) {
      const entrances = this.entrancesOf(f);
      if (entrances.length === 0) continue; // 사방이 막힘 — 손님이 못 옴

      const field = new FlowField(this.world.width, this.world.height);
      field.build(this.walkable, entrances);
      this.fields.set(f.iid, field);
    }

    this.dirty = false;
  }
}

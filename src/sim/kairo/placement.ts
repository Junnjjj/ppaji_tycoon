import rawFacilities from '../../data/kairo-facilities.json' with { type: 'json' };
import type { KairoTerrain } from './terrain.js';
import { WallGrid, reachable } from './walls.js';

/**
 * 시설 배치 — **시뮬 소유**. 스펙 §4.
 *
 * 렌더 정보(캔버스·앵커·슬롯 좌표)는 `src/assets/kairo-render-contract.json` 이 갖는다.
 * 여기는 **발자국·용량·배치 제약**만 안다 (불변식 1·3).
 *
 * ## 배치가 거절되는 이유는 전부 플레이어가 고칠 수 있어야 한다
 *
 * "왜 안 놓이는지 모르겠다"가 되면 그건 버그다. 그래서 실패 이유를 나열형으로 돌려주고
 * 각각에 사람이 읽을 문장을 붙인다. 특히 `unreachable` 은 **놓을 수는 있지만 손님이
 * 못 오는** 자리를 미리 막는다 — 놓고 나서 매출이 0 인 걸 발견하는 것보다 낫다.
 */

export interface KairoFacilityDef {
  id: string;
  name: string;
  layer: 'indoor' | 'land' | 'water' | 'pension' | 'season';
  size: readonly [number, number];
  sprite: string;
  capacity: number;
  /**
   * 경제 3항. 인터페이스에 **없어서** UI 가 건설비를 몰랐다 — week.ts 는 인라인 캐스트로
   * upkeep 만 읽고 있었고, 그래서 봇만 돈을 쓰고 플레이어는 공짜로 지었다.
   */
  cost: number;
  upkeep: number;
  /** 1회 이용 요금 */
  fee: number;
  /** 손님이 위로 걸어 올라갈 수 있나 — 플로팅덱·선착장만 true */
  walkOn?: boolean;
  placement: {
    requiresWallAdjacent?: boolean;
    /** 물 위 기반이 필요하다 (인플레이터블·대여소) */
    requiresDeck?: boolean;
    /** 육지나 다른 덱에 이어져야 한다 (덱·선착장 자신) */
    requiresShoreOrDeck?: boolean;
  };
  /** 슬라이드류 — 입출구는 게임플레이라 시뮬 데이터다 */
  ride?: {
    entryTile: readonly [number, number];
    exitTile: readonly [number, number];
    traverseTicks: number;
  };
}

const DEFS = (rawFacilities as unknown as { facilities: Record<string, KairoFacilityDef> })
  .facilities;

export function facilityDef(id: string): KairoFacilityDef | undefined {
  return DEFS[id];
}

export function allFacilityDefs(): KairoFacilityDef[] {
  return Object.values(DEFS);
}

export interface PlacedFacility {
  /** 인스턴스 번호 — 점유 격자가 이 값을 담는다 (0 은 "빈 칸") */
  handle: number;
  defId: string;
  i: number;
  j: number;
}

export type PlaceFail =
  | 'outside'
  | 'wrong-terrain'
  | 'occupied'
  | 'blocked-by-wall'
  | 'needs-wall'
  | 'needs-deck'
  | 'deck-not-connected'
  | 'unreachable'
  | 'unknown-def';

export interface PlaceOutcome {
  ok: boolean;
  fail?: PlaceFail;
  /** 성공 시 인스턴스 */
  placed?: PlacedFacility;
}

export const PLACE_FAIL_MESSAGES: Record<PlaceFail, string> = {
  outside: '격자 밖입니다',
  'wrong-terrain': '이 지형에는 놓을 수 없습니다',
  occupied: '다른 시설이 있습니다',
  'blocked-by-wall': '벽이 지나갑니다',
  'needs-wall': '벽에 붙여야 하는 시설입니다',
  'needs-deck': '플로팅덱에 붙여야 합니다',
  'deck-not-connected': '덱이 육지나 다른 덱과 이어져야 합니다',
  unreachable: '손님이 닿을 수 없는 자리입니다',
  'unknown-def': '알 수 없는 시설입니다',
};

export interface PlacementSnapshot {
  w: number;
  h: number;
  next: number;
  items: PlacedFacility[];
}

/** 물 위에 놓는 층 — 나머지는 걸을 수 있는 땅을 요구한다 */
function wantsWater(layer: KairoFacilityDef['layer']): boolean {
  return layer === 'water';
}

export class PlacementGrid {
  /** 0 = 빈 칸, 그 외 = 시설 handle */
  private readonly cells: Int32Array;
  private readonly items = new Map<number, PlacedFacility>();
  private nextHandle = 1;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Int32Array(width * height);
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.width && j < this.height;
  }

  /** 이 칸을 점유한 시설 handle. 0 이면 비었다 */
  handleAt(i: number, j: number): number {
    return this.inside(i, j) ? (this.cells[j * this.width + i] as number) : 0;
  }

  /**
   * 손님이 이 칸을 밟을 수 있나 — 플로팅덱·선착장만 true.
   *
   * K5 까지는 손님이 시설을 **통째로 뚫고** 지나갔다. 시설이 길을 막지 않으면 배치가
   * 동선에 영향을 주지 않아 "배치가 결과를 바꾼다"가 성립하지 않는다.
   */
  isWalkOn(i: number, j: number): boolean {
    const item = this.at(i, j);
    return item ? DEFS[item.defId]?.walkOn === true : false;
  }

  /** 손님의 길을 막나 — 점유돼 있고 걸어 올라갈 수 없으면 막는다 */
  blocksWalk(i: number, j: number): boolean {
    const h = this.handleAt(i, j);
    if (h === 0) return false;
    return !this.isWalkOn(i, j);
  }

  at(i: number, j: number): PlacedFacility | undefined {
    const h = this.handleAt(i, j);
    return h === 0 ? undefined : this.items.get(h);
  }

  get count(): number {
    return this.items.size;
  }

  all(): PlacedFacility[] {
    return [...this.items.values()];
  }

  /** 발자국이 덮는 타일 목록 */
  static footprintTiles(def: KairoFacilityDef, i: number, j: number): [number, number][] {
    const out: [number, number][] = [];
    for (let di = 0; di < def.size[0]; di++) {
      for (let dj = 0; dj < def.size[1]; dj++) out.push([i + di, j + dj]);
    }
    return out;
  }

  /**
   * 놓을 수 있는가. 검사 순서는 **플레이어에게 유용한 순서**다 —
   * 격자 밖 → 지형 → 점유 → 벽 → 벽부착 → 도달. 앞쪽이 더 명백한 실패다.
   */
  check(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
    defId: string,
    i: number,
    j: number,
  ): PlaceOutcome {
    const def = DEFS[defId];
    if (!def) return { ok: false, fail: 'unknown-def' };

    const tiles = PlacementGrid.footprintTiles(def, i, j);
    for (const [ti, tj] of tiles) {
      if (!this.inside(ti, tj)) return { ok: false, fail: 'outside' };
    }

    const needWater = wantsWater(def.layer);
    for (const [ti, tj] of tiles) {
      const walkable = terrain.isWalkable(ti, tj);
      if (needWater ? walkable : !walkable) return { ok: false, fail: 'wrong-terrain' };
    }

    for (const [ti, tj] of tiles) {
      if (this.handleAt(ti, tj) !== 0) return { ok: false, fail: 'occupied' };
    }

    for (const [ti, tj] of tiles) {
      if (walls.has(ti, tj)) return { ok: false, fail: 'blocked-by-wall' };
      if (ti === gate.i && tj === gate.j) return { ok: false, fail: 'occupied' };
    }

    // 물 위 부착 규칙 — 플로팅덱이 물 위 유일 기반 (결정 11)
    if (def.placement.requiresDeck) {
      const onDeck = tiles.some(([ti, tj]) =>
        [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => this.isWalkOn(ti + (di as number), tj + (dj as number))),
      );
      if (!onDeck) return { ok: false, fail: 'needs-deck' };
    }
    if (def.placement.requiresShoreOrDeck) {
      const connected = tiles.some(([ti, tj]) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => {
          const ni = ti + (di as number);
          const nj = tj + (dj as number);
          if (!terrain.inside(ni, nj)) return false;
          // 육지(걸을 수 있는 지면)거나 다른 덱
          return (terrain.isWalkable(ni, nj) && !walls.blocks(ni, nj)) || this.isWalkOn(ni, nj);
        }),
      );
      if (!connected) return { ok: false, fail: 'deck-not-connected' };
    }

    if (def.placement.requiresWallAdjacent) {
      const touching = tiles.some(([ti, tj]) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => walls.has(ti + (di as number), tj + (dj as number))),
      );
      if (!touching) return { ok: false, fail: 'needs-wall' };
    }

    // 도달 — 발자국에 인접한 칸 중 하나라도 게이트에서 걸어올 수 있어야 한다.
    // 물 위 시설은 이 검사를 건너뛴다 (K6 의 플로팅덱 연결이 담당한다)
    if (!needWater) {
      const reach = reachable(terrain, walls, gate);
      const ok = tiles.some(([ti, tj]) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => {
          const ni = ti + (di as number);
          const nj = tj + (dj as number);
          if (!terrain.inside(ni, nj)) return false;
          // 발자국 자기 자신은 제외
          if (ni >= i && ni < i + def.size[0] && nj >= j && nj < j + def.size[1]) return false;
          return reach[nj * terrain.width + ni] === 1;
        }),
      );
      if (!ok) return { ok: false, fail: 'unreachable' };
    }

    return { ok: true };
  }

  place(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
    defId: string,
    i: number,
    j: number,
  ): PlaceOutcome {
    const r = this.check(terrain, walls, gate, defId, i, j);
    if (!r.ok) return r;
    const def = DEFS[defId] as KairoFacilityDef;
    const handle = this.nextHandle++;
    const placed: PlacedFacility = { handle, defId, i, j };
    this.items.set(handle, placed);
    for (const [ti, tj] of PlacementGrid.footprintTiles(def, i, j)) {
      this.cells[tj * this.width + ti] = handle;
    }
    return { ok: true, placed };
  }

  remove(handle: number): boolean {
    const item = this.items.get(handle);
    if (!item) return false;
    const def = DEFS[item.defId] as KairoFacilityDef;
    for (const [ti, tj] of PlacementGrid.footprintTiles(def, item.i, item.j)) {
      if (this.handleAt(ti, tj) === handle) this.cells[tj * this.width + ti] = 0;
    }
    this.items.delete(handle);
    return true;
  }

  /** 손님이 동시에 이용할 수 있는 총 칸 수 — 결산에서 병목을 읽는 근거 */
  totalCapacity(): number {
    let n = 0;
    for (const it of this.items.values()) n += DEFS[it.defId]?.capacity ?? 0;
    return n;
  }

  toSnapshot(): PlacementSnapshot {
    return { w: this.width, h: this.height, next: this.nextHandle, items: this.all() };
  }

  static fromSnapshot(s: PlacementSnapshot): PlacementGrid {
    const g = new PlacementGrid(s.w, s.h);
    g.nextHandle = s.next;
    for (const it of s.items) {
      const def = DEFS[it.defId];
      if (!def) continue;
      g.items.set(it.handle, it);
      for (const [ti, tj] of PlacementGrid.footprintTiles(def, it.i, it.j)) {
        if (g.inside(ti, tj)) g.cells[tj * g.width + ti] = it.handle;
      }
    }
    return g;
  }
}

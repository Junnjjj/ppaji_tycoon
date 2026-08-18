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
  /**
   * 개선 단계 1~3 (§15.9 시설 상세의 [업그레이드]).
   *
   * **정원은 안 늘린다.** 정원을 늘리면 등급 상한에 막힌 상태에서 아무 효과가 없다 —
   * 개선은 "같은 손님에게 더 좋은 경험"이고, 그래서 후반(확장이 막힌 구간)의 유일한
   * 성장 수단이 된다. 요금과 만족도만 올라간다.
   */
  level?: number;
}

export type PlaceFail =
  | 'outside'
  | 'outside-land'
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
  'outside-land': '아직 내 땅이 아닙니다 — 등급을 올리면 넓어집니다',
  'wrong-terrain': '이 지형에는 놓을 수 없습니다',
  occupied: '다른 시설이 있습니다',
  'blocked-by-wall': '벽이 지나갑니다',
  'needs-wall': '벽에 붙여야 하는 시설입니다',
  'needs-deck': '플로팅덱에 붙여야 합니다',
  'deck-not-connected': '덱이 육지나 다른 덱과 이어져야 합니다',
  unreachable: '손님이 닿을 수 없는 자리입니다',
  'unknown-def': '알 수 없는 시설입니다',
};

/**
 * 개선 최고 단계.
 *
 * 3 이었을 때 **후반이 비었다** — 312주 중 281주가 "지을 게 없다"이고 현금이 1.5억 쌓였다.
 * 개선이 유일한 돈 쓸 곳인데 61개 시설 × 2단계면 40주에 끝난다.
 *
 * 5 로 올리면 두 가지가 같이 풀린다: **돈 쓸 곳**이 길어지고, 만족도 여유(단계당 +6)가
 * +24 까지 늘어 5등급 문턱(85)이 닿는다. 비용이 단계마다 가팔라지므로 후반 단계는
 * 시설 하나에 건설비 몇 배가 든다 — 그래서 "전부 최고"가 아니라 선택이 된다.
 */
export const MAX_LEVEL = 5;
/** 단계당 요금 상승 */
export const LEVEL_FEE_STEP = 0.3;
/** 평균 단계가 1 오를 때 만족도 보너스 */
export const LEVEL_SATISFACTION = 6;

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
    /**
     * 해금된 토지 (K25). 없으면 격자 전체 — 단위 테스트와 구 호출자를 위한 기본값이다.
     * 부르는 쪽이 등급에서 얻어 넘긴다 (`landRect`).
     */
    land?: { w: number; h: number },
  ): PlaceOutcome {
    const def = DEFS[defId];
    if (!def) return { ok: false, fail: 'unknown-def' };

    const tiles = PlacementGrid.footprintTiles(def, i, j);
    for (const [ti, tj] of tiles) {
      if (!this.inside(ti, tj)) return { ok: false, fail: 'outside' };
    }

    if (land) {
      for (const [ti, tj] of tiles) {
        if (ti >= land.w || tj >= land.h) return { ok: false, fail: 'outside-land' };
      }
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
      // 벽은 이제 **경계**에 있어 칸을 막지 않는다 (K25) — 벽 위에도 시설을 놓을 수 있다
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
          return terrain.isWalkable(ni, nj) || this.isWalkOn(ni, nj);
        }),
      );
      if (!connected) return { ok: false, fail: 'deck-not-connected' };
    }

    if (def.placement.requiresWallAdjacent) {
      /*
       * 벽부착 — 발자국 칸 중 하나가 **벽 경계에 접해야** 한다 (K25).
       *
       * 예전에는 "옆 칸이 벽 타일인가"를 봤다. 이제 벽은 경계에 있으므로 그 칸 자신의
       * 경계를 본다. 건물 외곽선이 자동 생성되므로, 실질적으로 **건물 벽에 붙은 칸**이다.
       */
      const touching = tiles.some(([ti, tj]) => walls.hasAnyEdge(ti, tj));
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
    land?: { w: number; h: number },
  ): PlaceOutcome {
    const r = this.check(terrain, walls, gate, defId, i, j, land);
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

  /** 개선 단계 (없으면 1) */
  levelOf(handle: number): number {
    return this.items.get(handle)?.level ?? 1;
  }

  /**
   * 다음 단계 비용. 단계마다 가팔라진다 — 안 그러면 "전부 3단계"가 항상 정답이 되고
   * 개선이 선택이 아니라 절차가 된다.
   */
  upgradeCost(handle: number): number {
    const item = this.items.get(handle);
    if (!item) return 0;
    const def = facilityDef(item.defId);
    if (!def) return 0;
    const level = item.level ?? 1;
    if (level >= MAX_LEVEL) return 0;
    return Math.round(def.cost * (0.6 + level * 0.5));
  }

  /** 한 단계 올린다. 이미 최고면 false */
  upgrade(handle: number): boolean {
    const item = this.items.get(handle);
    if (!item) return false;
    const level = item.level ?? 1;
    if (level >= MAX_LEVEL) return false;
    item.level = level + 1;
    return true;
  }

  /** 개선이 반영된 요금 */
  feeOf(handle: number): number {
    const item = this.items.get(handle);
    if (!item) return 0;
    const def = facilityDef(item.defId);
    if (!def) return 0;
    return Math.round(def.fee * (1 + (this.levelOf(handle) - 1) * LEVEL_FEE_STEP));
  }

  /** 전체 시설의 평균 개선 단계 — 만족도 보너스의 근거 */
  averageLevel(): number {
    if (this.items.size === 0) return 1;
    let sum = 0;
    for (const it of this.items.values()) sum += it.level ?? 1;
    return sum / this.items.size;
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

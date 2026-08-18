import rawFacilities from '../../data/kairo-facilities.json' with { type: 'json' };
import type { KairoTerrain } from './terrain.js';
import { WallGrid, reachable, EDGE_DOOR } from './walls.js';

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
    requiresIndoor?: boolean;
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
  | 'blocks-door'
  | 'would-strand'
  | 'wrong-terrain'
  | 'occupied'
  | 'blocked-by-wall'
  | 'needs-indoor'
  | 'needs-deck'
  | 'deck-not-connected'
  | 'unreachable'
  | 'unknown-def';

/**
 * 배치 검사의 **바깥 사정** — 지형만으로는 알 수 없는 것.
 *
 * 한때 실내 판정도 여기로 받았다. 실내가 **지형 그 자체**가 된 뒤로(K27) 필요 없어졌다 —
 * `terrain.isIndoor` 가 답을 안다. 넘겨야 할 것이 줄면 넘기는 걸 잊을 일도 준다.
 */
export interface PlaceOptions {
  /** 해금된 토지 (K25). 없으면 격자 전체 */
  land?: { w: number; h: number };
}

export interface PlaceOutcome {
  ok: boolean;
  fail?: PlaceFail;
  /** 성공 시 인스턴스 */
  placed?: PlacedFacility;
}

/**
 * 손님이 **설 수 있는** 칸인가 — 이 게임의 유일한 정의.
 *
 * 손님 이동·건물 문 자리·도달 검사가 전부 이걸 써야 한다. 정의가 갈라졌을 때
 * 실제로 생긴 일: 벽 도달 검사는 지형만 봐서 "닿는다"고 했는데 그 칸은 시설로
 * 막혀 있었고, 손님이 못 들어가는 건물이 통과했다 (K25 검토에서 실측).
 */
export function guestWalkable(
  terrain: KairoTerrain,
  placement: PlacementGrid,
): (i: number, j: number) => boolean {
  return (i, j) => {
    if (placement.blocksWalk(i, j)) return false;
    /*
     * ⚠ `isWalkable`(육지인가)이 아니라 `isGuestWalkable`(손님이 다니나)이다 (K32-B).
     * 잔디는 지을 수는 있어도 못 지나간다 — 길을 까는 것이 동선 설계다.
     */
    return terrain.isGuestWalkable(i, j) || placement.isWalkOn(i, j);
  };
}

export const PLACE_FAIL_MESSAGES: Record<PlaceFail, string> = {
  outside: '격자 밖입니다',
  'outside-land': '아직 내 땅이 아닙니다 — 등급을 올리면 넓어집니다',
  'blocks-door': '문 앞은 비워야 합니다',
  'would-strand': '이 자리에 놓으면 실내 일부에 못 가게 됩니다',
  'wrong-terrain': '이 지형에는 놓을 수 없습니다',
  occupied: '다른 시설이 있습니다',
  'blocked-by-wall': '벽이 지나갑니다',
  'needs-indoor': '건물 안에만 지을 수 있습니다 — 건설 ▸ 건물 에서 넓히세요',
  'needs-deck': '플로팅덱에 붙여야 합니다',
  'deck-not-connected': '덱이 육지나 다른 덱과 이어져야 합니다',
  /*
   * K32-B: 이 실패의 원인이 거의 항상 "길이 없다"로 바뀌었다 (잔디는 못 지나간다).
   * 예전 문구는 무엇을 하면 되는지 안 알려줬다 — 처방을 담는다.
   */
  unreachable: '손님이 못 옵니다 — 여기까지 길을 까세요',
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
    opts?: PlaceOptions,
  ): PlaceOutcome {
    const def = DEFS[defId];
    if (!def) return { ok: false, fail: 'unknown-def' };

    const tiles = PlacementGrid.footprintTiles(def, i, j);
    for (const [ti, tj] of tiles) {
      if (!this.inside(ti, tj)) return { ok: false, fail: 'outside' };
    }

    if (opts?.land) {
      const land = opts.land;
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

    if (def.placement.requiresIndoor) {
      /*
       * 실내 시설 9종 — 발자국이 **전부 건물 안**이어야 한다.
       *
       * ⚠ 한때 "벽 경계에 접했나"(`hasAnyEdge`)로 봤는데 **경계는 두 칸이 공유한다.**
       * 그래서 건물 **바깥**에서 벽에 접한 칸도 통과했고, 샤워실·탈의실이 야외 잔디에
       * 놓였다 (K26 ① 에서 실측). 붙는 대상은 벽이 아니라 **방**이고,
       * 방은 곧 **실내 바닥을 깐 자리**다 (K27).
       */
      const allIndoor = tiles.every(([ti, tj]) => terrain.isIndoor(ti, tj));
      if (!allIndoor) return { ok: false, fail: 'needs-indoor' };
    }

    /*
     * 문을 막지 않는다 (K30).
     *
     * ⚠ 실측으로 잡은 구멍이다: 방을 만든 뒤 **나중에 놓은 시설이 문 앞칸을 덮으면**
     * 그 방은 손님이 못 들어가는 죽은 공간이 된다. 벽에는 문이 그대로 남아 있어서
     * 화면상으로는 멀쩡해 보이고, 안의 실내 시설이 조용히 매출 0 이 된다.
     *
     * 문은 양쪽 다 설 수 있어야 하므로(K26 ②) **문이 있는 경계에 접한 칸**은 안팎
     * 가리지 않고 비워 둔다. 밟고 지나갈 수 있는 시설(덱)은 예외다.
     */
    if (!def.walkOn) {
      for (const [ti, tj] of tiles) {
        for (const d of [0, 1, 2, 3] as const) {
          if (walls.edgeAt(ti, tj, d) === EDGE_DOOR) return { ok: false, fail: 'blocks-door' };
        }
      }
    }

    /*
     * 실내를 조각내지 않는다 (K30).
     *
     * ⚠ 벽에는 밀폐 차단이 있는데(`canPlaceEdge` 의 `would-seal`) **시설에는 없었다.**
     * 방 안에 시설을 놓아 안쪽 구석을 갈라 놓으면 그 칸들은 영영 못 쓰고, 방은 그 뒤로
     * 넓히지도 못한다 (`bakeIndoorWalls` 가 `unreachable` 로 거절한다). 화면상으로는
     * 멀쩡해 보여서 왜 안 되는지 알 수 없다 — 헤드리스에서 실제로 이 상태를 만들었다.
     *
     * 실내에 놓을 때만 검사한다. 바깥은 열려 있어 조각날 일이 없고, 검사가 공짜가 아니다.
     */
    const touchesIndoor = tiles.some(([ti, tj]) => terrain.isIndoor(ti, tj));
    if (touchesIndoor && !def.walkOn) {
      const stand = guestWalkable(terrain, this);
      const inFoot = (i: number, j: number): boolean =>
        tiles.some(([ti, tj]) => ti === i && tj === j);
      const before = reachable(terrain, walls, gate, stand);
      const after = reachable(terrain, walls, gate, (i, j) => !inFoot(i, j) && stand(i, j));
      const wIdx = terrain.width;
      for (let j = 0; j < terrain.height; j++) {
        for (let i = 0; i < wIdx; i++) {
          if (inFoot(i, j)) continue;
          if (before[j * wIdx + i] === 1 && after[j * wIdx + i] !== 1) {
            return { ok: false, fail: 'would-strand' };
          }
        }
      }
    }

    // 도달 — 발자국에 인접한 칸 중 하나라도 게이트에서 걸어올 수 있어야 한다.
    // 물 위 시설은 이 검사를 건너뛴다 (K6 의 플로팅덱 연결이 담당한다)
    if (!needWater) {
      /*
       * ⚠ **손님 판정**으로 잰다 (K32-B). 지형만 보면 잔디 위 외딴 자리가 통과하고,
       * 손님은 못 오는데 검사는 통과하는 상태가 된다 — K26 ② 와 같은 구멍이다.
       * 놓으려는 시설 자신은 아직 격자에 없으므로 그대로 넘겨도 된다.
       */
      const reach = reachable(terrain, walls, gate, guestWalkable(terrain, this));
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
    opts?: PlaceOptions,
  ): PlaceOutcome {
    const r = this.check(terrain, walls, gate, defId, i, j, opts);
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

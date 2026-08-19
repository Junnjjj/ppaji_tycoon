/**
 * 수영 구역 (S1, 스펙 `2026-08-19-swim-zones-design.md`) — **"바닥이 곧 방"의 물 버전.**
 *
 * 플레이어는 구역 사각형을 그리지 않는다:
 *   · 수영장(땅) — `pool_water` 지면을 칠하면 이어진 덩어리가 수영장이다
 *   · 수영 구역(강) — 플로팅덱·선착장으로 물을 **둘러싸면** 그 안이 구역이다
 *
 * **구역은 저장하지 않는다** (`terrain.isIndoor` 와 같은 규칙 — K27). 지면과 시설
 * 배치에서 매번 파생한다. 별도 저장소는 반드시 지형과 어긋난다.
 *
 * 두 생산자(풀 덩어리 · 덱 밀폐)는 여기서 같은 `SwimZone` 으로 수렴한다 — 소비자
 * (수영 활동·위험도·콤보·결산)는 구역이 어디서 왔는지 모른다. `kind` 는 요금과
 * 그림(코핑 vs 부표)만 가른다.
 */
import type { KairoTerrain } from './terrain.js';

export interface SwimZone {
  kind: 'pool' | 'river';
  /** 물/풀 타일들 (수영 가능 칸) */
  tiles: { x: number; y: number }[];
  /**
   * 입수점 — 손님이 **서서** 들어가는 칸 (구역 밖). 수영장은 인접 포장, 강 구역은
   * 둘러싼 덱. 비어 있으면 구역은 있되 아무도 못 들어간다 (`no-entry` — 처방 대상).
   */
  entries: { x: number; y: number }[];
  area: number;
}

/** 3칸 이하는 장식 웅덩이 — 구역이 아니다 (미니 수영장 남발 방지) */
export const POOL_MIN_TILES = 4;

/** 수영장 지면 종류 id — 지면 격자에 실리므로 세이브 변경이 없다 */
export const POOL_KIND = 'pool_water';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const key = (i: number, j: number): number => (j << 10) | i;

/**
 * 수영장(땅) — `pool_water` 4-연결 덩어리, 최소 4칸.
 *
 * 입수점은 덩어리에 인접한 **설 수 있는** 칸이다. "설 수 있다"의 정의는 손님 판정
 * (`guestWalkable`) 하나여야 하므로 (K26 ②) 술어로 주입받는다 — 지형만 보면
 * "검사는 통과하는데 손님은 못 들어간다"가 생긴다.
 */
export function poolZones(
  terrain: KairoTerrain,
  standable: (i: number, j: number) => boolean,
): SwimZone[] {
  const seen = new Set<number>();
  const zones: SwimZone[] = [];
  for (let j = 0; j < terrain.height; j++) {
    for (let i = 0; i < terrain.width; i++) {
      if (terrain.kindAt(i, j) !== POOL_KIND || seen.has(key(i, j))) continue;
      const tiles: { x: number; y: number }[] = [];
      const stack = [[i, j] as [number, number]];
      seen.add(key(i, j));
      while (stack.length > 0) {
        const [ci, cj] = stack.pop() as [number, number];
        tiles.push({ x: ci, y: cj });
        for (const [di, dj] of DIRS) {
          const ni = ci + di;
          const nj = cj + dj;
          if (seen.has(key(ni, nj))) continue;
          if (terrain.kindAt(ni, nj) !== POOL_KIND) continue;
          seen.add(key(ni, nj));
          stack.push([ni, nj]);
        }
      }
      if (tiles.length < POOL_MIN_TILES) continue;
      const entries = adjacentStandable(tiles, standable);
      zones.push({ kind: 'pool', tiles, entries, area: tiles.length });
    }
  }
  return zones;
}

/**
 * 수영 구역(강) — **열린 강에 닿지 않는** 물 컴포넌트.
 *
 * 덱·선착장이 깔린 물 칸은 장벽이다 (`deckTiles`). 맵 가장자리의 물에서 flood fill 한
 * "열린 강"에 닿지 못한 열린 물 컴포넌트가 밀폐 — 수영 구역이다.
 *
 * 입수점은 구역에 인접한 덱 칸 중 **설 수 있는** 것 (덱은 walkOn 이라 손님이 밟는다).
 */
export function riverZones(
  terrain: KairoTerrain,
  deckTiles: ReadonlySet<number>,
  standable: (i: number, j: number) => boolean,
): SwimZone[] {
  const w = terrain.width;
  const h = terrain.height;
  const open = (i: number, j: number): boolean => terrain.isWater(i, j) && !deckTiles.has(key(i, j));

  // ① 열린 강 — 가장자리 물에서 flood
  const sea = new Set<number>();
  const stack: [number, number][] = [];
  for (let i = 0; i < w; i++) {
    for (const j of [0, h - 1]) if (open(i, j) && !sea.has(key(i, j))) { sea.add(key(i, j)); stack.push([i, j]); }
  }
  for (let j = 0; j < h; j++) {
    for (const i of [0, w - 1]) if (open(i, j) && !sea.has(key(i, j))) { sea.add(key(i, j)); stack.push([i, j]); }
  }
  while (stack.length > 0) {
    const [ci, cj] = stack.pop() as [number, number];
    for (const [di, dj] of DIRS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      if (!open(ni, nj) || sea.has(key(ni, nj))) continue;
      sea.add(key(ni, nj));
      stack.push([ni, nj]);
    }
  }

  // ② 열린 강에 못 닿은 물 = 밀폐 — 컴포넌트로 묶는다
  const seen = new Set<number>();
  const zones: SwimZone[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!open(i, j) || sea.has(key(i, j)) || seen.has(key(i, j))) continue;
      const tiles: { x: number; y: number }[] = [];
      const st: [number, number][] = [[i, j]];
      seen.add(key(i, j));
      while (st.length > 0) {
        const [ci, cj] = st.pop() as [number, number];
        tiles.push({ x: ci, y: cj });
        for (const [di, dj] of DIRS) {
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          if (!open(ni, nj) || seen.has(key(ni, nj))) continue;
          seen.add(key(ni, nj));
          st.push([ni, nj]);
        }
      }
      // 입수점 — 인접한 덱 칸 중 설 수 있는 것
      const entries: { x: number; y: number }[] = [];
      const eSeen = new Set<number>();
      for (const t of tiles) {
        for (const [di, dj] of DIRS) {
          const ni = t.x + di;
          const nj = t.y + dj;
          if (!deckTiles.has(key(ni, nj)) || eSeen.has(key(ni, nj))) continue;
          eSeen.add(key(ni, nj));
          if (standable(ni, nj)) entries.push({ x: ni, y: nj });
        }
      }
      zones.push({ kind: 'river', tiles, entries, area: tiles.length });
    }
  }
  return zones;
}

/** 덱 타일 키 — placement 쪽에서 물 위 walkOn 발자국을 모아 만든다 */
export function deckKey(i: number, j: number): number {
  return key(i, j);
}

/**
 * 수면 사용 허가 회계 (스펙 §1.2) — **강 구역만** 허가 면적을 소비한다 (수영장은 땅이다).
 *
 * v1.1 실측: `permitArea` 는 이제까지 소비처가 0 인 죽은 값이었다 — 이것이 첫 소비자다.
 * 코스를 같은 회계에 넣는 것은 백로그 (밸런스 변화를 섞지 않는다).
 */
export function permitUsed(zones: readonly SwimZone[]): number {
  return zones.reduce((a, z) => a + (z.kind === 'river' ? z.area : 0), 0);
}

function adjacentStandable(
  tiles: readonly { x: number; y: number }[],
  standable: (i: number, j: number) => boolean,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const inZone = new Set(tiles.map((t) => key(t.x, t.y)));
  const seen = new Set<number>();
  for (const t of tiles) {
    for (const [di, dj] of DIRS) {
      const ni = t.x + di;
      const nj = t.y + dj;
      if (inZone.has(key(ni, nj)) || seen.has(key(ni, nj))) continue;
      seen.add(key(ni, nj));
      if (standable(ni, nj)) out.push({ x: ni, y: nj });
    }
  }
  return out;
}

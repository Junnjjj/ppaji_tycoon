/**
 * 풀 — **4이웃으로 이어진 풀 타일 컴포넌트 하나 = 풀 하나.** 타일로 이으면 합쳐진다 (PSS 그대로).
 *
 * `recompute()` 가 편집마다 컴포넌트를 다시 찾고 기존 풀과 **타일 겹침 최대**로 매칭한다:
 * 병합 = 아이템 합집합 · likes 는 max, 분할 = 가장 큰 조각이 승계하고 나머지는 빈 풀.
 * 파생 상태(크기·인기·유지비, G3 부터 색·향·온도)는 저장하지 않고 여기서 다시 센다.
 */
import { Grid, FLOOR } from './grid.js';

export interface PoolItem {
  itemId: string;
  placedTick: number;
  expiresTick: number;
}

export interface Pool {
  id: number;
  /** 타일 인덱스 (j*w+i), 정렬 상태 */
  tiles: number[];
  items: PoolItem[];
  likes: number;
  /** 플레이어가 붙인 이름 (G47, 원작 「이름 변경」) — 없으면 「풀 #id」 */
  name?: string;
}

export interface PoolSnapshot {
  nextId: number;
  pools: { id: number; anchor: number; items: PoolItem[]; likes: number; name?: string }[];
}

export interface PoolBalance {
  poolMaintBase: number;
  poolMaintPerPop: number;
  tilePopStandard: number;
  /** 랭크마다 유지비 ×(1+…)^rank — 후반 지출 곡선 (G30) */
  maintRankMul?: number;
  /** 유입에 더하는 좋아요 항 — `min(cap, likes × perLike)` (G33, §2.2 의 `likes·0.004` 를 포화형으로) */
  arrivalPerLike?: number;
  arrivalLikesCap?: number;
  /** 티켓 = base × (1 + step × 만족 레벨 0~3) (G30, R9) */
  ticketSatStep?: number;
}

export interface PoolState {
  size: number;
  popularity: number;
  maintenance: number;
}

export class PoolStore {
  private list: Pool[] = [];
  private nextId = 1;
  /** 편집 세대 — 거리장 캐시가 이걸로 무효화된다 */
  version = 0;

  constructor(private readonly grid: Grid) {}

  get all(): readonly Pool[] {
    return this.list;
  }

  byId(id: number): Pool | undefined {
    return this.list.find((p) => p.id === id);
  }

  /** 이 타일이 속한 풀 */
  at(i: number, j: number): Pool | undefined {
    if (this.grid.at(i, j) !== FLOOR.pool) return undefined;
    const k = j * this.grid.w + i;
    return this.list.find((p) => p.tiles.includes(k));
  }

  totalTiles(): number {
    return this.list.reduce((n, p) => n + p.tiles.length, 0);
  }

  state(p: Pool, b: PoolBalance): PoolState {
    const size = p.tiles.length;
    const popularity = size * b.tilePopStandard;
    return { size, popularity, maintenance: b.poolMaintBase + popularity * b.poolMaintPerPop };
  }

  /** 격자의 풀 타일에서 컴포넌트를 다시 찾아 기존 풀에 잇는다 */
  recompute(): void {
    const g = this.grid;
    const seen = new Uint8Array(g.w * g.h);
    const comps: number[][] = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const k = j * g.w + i;
        if (seen[k] || g.at(i, j) !== FLOOR.pool) continue;
        const comp: number[] = [];
        const stack = [k];
        seen[k] = 1;
        while (stack.length) {
          const c = stack.pop() as number;
          comp.push(c);
          const ci = c % g.w;
          const cj = Math.floor(c / g.w);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const ni = ci + di;
            const nj = cj + dj;
            if (!g.inside(ni, nj) || g.at(ni, nj) !== FLOOR.pool) continue;
            const nk = nj * g.w + ni;
            if (seen[nk]) continue;
            seen[nk] = 1;
            stack.push(nk);
          }
        }
        comp.sort((a, b) => a - b);
        comps.push(comp);
      }
    }
    // 매칭 — 겹침이 큰 순으로 (큰 조각이 먼저 승계한다)
    const next: Pool[] = [];
    const used = new Set<number>();
    const pairs: { comp: number[]; pool: Pool; overlap: number }[] = [];
    for (const comp of comps) {
      const set = new Set(comp);
      for (const pool of this.list) {
        let overlap = 0;
        for (const t of pool.tiles) if (set.has(t)) overlap++;
        if (overlap > 0) pairs.push({ comp, pool, overlap });
      }
    }
    pairs.sort((a, b) => b.overlap - a.overlap || a.pool.id - b.pool.id);
    const assigned = new Map<number[], Pool>();
    for (const pr of pairs) {
      if (assigned.has(pr.comp)) {
        // 병합 — 이미 다른 풀을 승계한 컴포넌트에 또 겹치면 아이템을 합치고 likes 는 max
        if (used.has(pr.pool.id)) continue;
        const host = assigned.get(pr.comp) as Pool;
        host.items = host.items.concat(pr.pool.items);
        host.likes = Math.max(host.likes, pr.pool.likes);
        used.add(pr.pool.id);
        continue;
      }
      if (used.has(pr.pool.id)) continue;
      used.add(pr.pool.id);
      const p: Pool = { id: pr.pool.id, tiles: pr.comp, items: [...pr.pool.items], likes: pr.pool.likes, ...(pr.pool.name ? { name: pr.pool.name } : {}) };
      assigned.set(pr.comp, p);
      next.push(p);
    }
    for (const comp of comps) {
      if (assigned.has(comp)) continue;
      next.push({ id: this.nextId++, tiles: comp, items: [], likes: 0 });
    }
    next.sort((a, b) => a.id - b.id);
    this.list = next;
    this.version++;
  }

  /** 타일 종류만 바뀌었을 때 캐시를 무효화한다 (G37) */
  bump(): void { this.version++; }

  toSnapshot(): PoolSnapshot {
    return {
      nextId: this.nextId,
      pools: this.list.map((p) => ({ id: p.id, anchor: p.tiles[0] ?? -1, items: p.items.map((it) => ({ ...it })), likes: p.likes, ...(p.name ? { name: p.name } : {}) })),
    };
  }

  /** 격자(`floor`)가 먼저 복원돼 있어야 한다 — 타일 집합은 격자에서 다시 찾는다 */
  fromSnapshot(s: PoolSnapshot): void {
    this.nextId = s.nextId;
    this.list = s.pools.map((p) => ({ id: p.id, tiles: p.anchor >= 0 ? [p.anchor] : [], items: p.items.map((it) => ({ ...it })), likes: p.likes, ...(p.name ? { name: p.name } : {}) }));
    this.recompute();
  }
}

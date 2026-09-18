/**
 * 풀 — **4이웃으로 이어진 풀 타일 컴포넌트 하나 = 풀 하나.** 타일로 이으면 합쳐진다 (PSS 그대로).
 *
 * `recompute()` 가 편집마다 컴포넌트를 다시 찾고 기존 풀과 **타일 겹침 최대**로 매칭한다:
 * 병합 = likes 는 max, 분할 = 가장 큰 조각이 승계하고 나머지는 빈 풀.
 * 파생 상태(크기·인기·유지비·온도)는 저장하지 않고 여기서 다시 센다. P60-a: 소품(items)은 게임에서 뺐다.
 */
import { Grid, FLOOR } from './grid.js';

export interface Pool {
  id: number;
  /** 타일 인덱스 (j*w+i), 정렬 상태 */
  tiles: number[];
  likes: number;
  /** 플레이어가 붙인 이름 (G47, 원작 「이름 변경」) — 없으면 「풀 #id」 */
  name?: string;
}

export interface PoolSnapshot {
  nextId: number;
  pools: { id: number; anchor: number; likes: number; name?: string }[];
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

  /** P49-b §3.7 — 칸 → 수역 id (−1 = 수역 아님). `recompute()` 가 채운다 — `at()`·손님 유영이 O(1) 로 본다 */
  private tileOwner = new Int32Array(0);
  /** P50-a R7 — 기구가 덮은 물(k → 1). `isOpenAt`·`totalOpenTiles`(유영·입수·유입)에만 쓰고 `recompute` 의 컴포넌트 탐색은 보지 않는다 — 인기·허가·유지비는 `tiles` */
  private blocked = new Uint8Array(0);
  setBlocked(ks: Iterable<number>): void {
    const n = this.grid.w * this.grid.h;
    if (this.blocked.length !== n) this.blocked = new Uint8Array(n); else this.blocked.fill(0);
    for (const k of ks) if (k >= 0 && k < n) this.blocked[k] = 1;
  }
  ownerIdK(k: number): number { return this.tileOwner.length === this.grid.w * this.grid.h ? (this.tileOwner[k] ?? -1) : -1; }
  isOpenK(k: number): boolean { return this.ownerIdK(k) >= 0 && this.blocked[k] !== 1; }
  isOpenAt(i: number, j: number): boolean { return this.grid.inside(i, j) && this.isOpenK(j * this.grid.w + i); }
  openTilesOf(p: Pool): number[] { return p.tiles.filter((k) => this.blocked[k] !== 1); }
  totalOpenTiles(): number { let n = 0; for (const p of this.list) for (const k of p.tiles) if (this.blocked[k] !== 1) n++; return n; }
  ownerIdAt(i: number, j: number): number {
    if (!this.grid.inside(i, j)) return -1;
    return this.tileOwner.length === this.grid.w * this.grid.h ? (this.tileOwner[j * this.grid.w + i] ?? -1) : (this.at(i, j)?.id ?? -1);
  }
  ownerAt(i: number, j: number): Pool | undefined { const id = this.ownerIdAt(i, j); return id < 0 ? undefined : this.byId(id); }
  /** 이 타일이 속한 풀 */
  at(i: number, j: number): Pool | undefined {
    if (this.grid.at(i, j) !== FLOOR.pool) return undefined;
    const k = j * this.grid.w + i;
    if (this.tileOwner.length === this.grid.w * this.grid.h) { const id = this.tileOwner[k] ?? -1; return id < 0 ? undefined : this.byId(id); }
    return this.list.find((p) => p.tiles.includes(k));
  }

  totalTiles(): number {
    return this.list.reduce((n, p) => n + p.tiles.length, 0);
  }

  /** 격자의 풀 타일에서 컴포넌트를 다시 찾아 기존 풀에 잇는다. P49-b: 병합이 있었으면 `{ keptId, keptName, goneNames }` 를 돌려준다(토스트 「‘◯’ 를 ‘△’ 에 합쳤습니다」) */
  recompute(): { keptId: number; keptName: string; goneNames: string[] }[] {
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
    const merges: { keptId: number; keptName: string; goneNames: string[] }[] = [];
    for (const pr of pairs) {
      if (assigned.has(pr.comp)) {
        // 병합 — 이미 다른 풀을 승계한 컴포넌트에 또 겹치면 likes 는 max
        if (used.has(pr.pool.id)) continue;
        const host = assigned.get(pr.comp) as Pool;
        host.likes = Math.max(host.likes, pr.pool.likes);
        used.add(pr.pool.id);
        const m = merges.find((x) => x.keptId === host.id) ?? (merges.push({ keptId: host.id, keptName: host.name ?? `수역 #${host.id}`, goneNames: [] }), merges[merges.length - 1]!);
        m.goneNames.push(pr.pool.name ?? `수역 #${pr.pool.id}`);
        continue;
      }
      if (used.has(pr.pool.id)) continue;
      used.add(pr.pool.id);
      const p: Pool = { id: pr.pool.id, tiles: pr.comp, likes: pr.pool.likes, ...(pr.pool.name ? { name: pr.pool.name } : {}) };
      assigned.set(pr.comp, p);
      next.push(p);
    }
    for (const comp of comps) {
      if (assigned.has(comp)) continue;
      next.push({ id: this.nextId++, tiles: comp, likes: 0 });
    }
    next.sort((a, b) => a.id - b.id);
    this.list = next;
    this.version++;
    if (this.tileOwner.length !== g.w * g.h) this.tileOwner = new Int32Array(g.w * g.h);
    this.tileOwner.fill(-1);
    for (const p of this.list) for (const k of p.tiles) this.tileOwner[k] = p.id;
    return merges;
  }

  /** 타일 종류만 바뀌었을 때 캐시를 무효화한다 (G37) */
  bump(): void { this.version++; }

  toSnapshot(): PoolSnapshot {
    return {
      nextId: this.nextId,
      pools: this.list.map((p) => ({ id: p.id, anchor: p.tiles[0] ?? -1, likes: p.likes, ...(p.name ? { name: p.name } : {}) })),
    };
  }

  /** 격자(`floor`)가 먼저 복원돼 있어야 한다 — 타일 집합은 격자에서 다시 찾는다. 옛 스냅샷의 `items` 는 읽지 않는다 (P60-a) */
  fromSnapshot(s: PoolSnapshot): void {
    this.nextId = s.nextId;
    this.list = s.pools.map((p) => ({ id: p.id, tiles: p.anchor >= 0 ? [p.anchor] : [], likes: p.likes, ...(p.name ? { name: p.name } : {}) }));
    this.recompute();
  }
}

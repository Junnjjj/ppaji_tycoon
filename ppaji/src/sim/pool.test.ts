import { describe, it, expect } from 'vitest';
import { Grid, FLOOR } from './grid.js';
import { PoolStore } from './pool.js';

const dig = (g: Grid, cells: [number, number][]) => cells.forEach(([i, j]) => g.set(i, j, FLOOR.pool));
const fill = (g: Grid, cells: [number, number][]) => cells.forEach(([i, j]) => g.set(i, j, FLOOR.grass));

describe('풀 = 연결 컴포넌트', () => {
  it('떨어진 두 덩어리는 두 풀, 이으면 하나로 합쳐지고 likes 를 승계한다', () => {
    const g = Grid.newPark(0);
    const ps = new PoolStore(g);
    dig(g, [[30, 40], [31, 40]]);
    dig(g, [[34, 40], [35, 40]]);
    ps.recompute();
    expect(ps.all.length).toBe(2);
    const [a, b] = ps.all as [typeof ps.all[0], typeof ps.all[0]];
    a.likes = 10;
    b.likes = 30;
    dig(g, [[32, 40], [33, 40]]);
    ps.recompute();
    expect(ps.all.length).toBe(1);
    const m = ps.all[0]!;
    expect(m.tiles.length).toBe(6);
    expect(m.likes).toBe(30);
  });
  it('가운데를 메우면 큰 조각이 승계하고 작은 조각은 새 풀이다', () => {
    const g = Grid.newPark(0);
    const ps = new PoolStore(g);
    dig(g, [[30, 40], [31, 40], [32, 40], [33, 40], [34, 40]]);
    ps.recompute();
    const id = ps.all[0]!.id;
    ps.all[0]!.likes = 50;
    fill(g, [[33, 40]]);
    ps.recompute();
    expect(ps.all.length).toBe(2);
    const big = ps.all.find((p) => p.tiles.length === 3)!;
    const small = ps.all.find((p) => p.tiles.length === 1)!;
    expect(big.id).toBe(id);
    expect(big.likes).toBe(50);
    expect(small.likes).toBe(0);
    expect(small.id).not.toBe(id);
  });
  it('상태 — 크기·인기·유지비', () => {
    const g = Grid.newPark(0);
    const ps = new PoolStore(g);
    dig(g, [[30, 40], [31, 40], [30, 41], [31, 41]]);
    ps.recompute();
    expect(ps.all[0]!.tiles.length).toBe(4); // P49-b: `PoolStore.state` 삭제(production 호출부 0) — 상태는 `poolState()` 하나
    expect(ps.at(30, 40)?.id).toBe(ps.all[0]!.id); expect(ps.ownerIdAt(30, 40)).toBe(ps.all[0]!.id); expect(ps.ownerIdAt(0, 0)).toBe(-1);
    expect(ps.at(0, 0)).toBeUndefined();
  });
  it('스냅샷 왕복 — 앵커 하나로 타일 집합이 되살아난다', () => {
    const g = Grid.newPark(0);
    const ps = new PoolStore(g);
    dig(g, [[30, 40], [31, 40], [40, 40]]);
    ps.recompute();
    ps.all[0]!.likes = 7;
    const snap = ps.toSnapshot();
    const ps2 = new PoolStore(g);
    ps2.fromSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(ps2.toSnapshot()).toEqual(snap);
    expect(ps2.all.map((p) => p.tiles.length)).toEqual([2, 1]);
  });
});

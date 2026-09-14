import { describe, it, expect } from 'vitest';
import { Game, GROUNDS } from './game.js';
import { FLOOR, isWalkFloor, isGround, FLOOR_NAMES } from './grid.js';

/** P22 (D28) — 지면 붓: 5종 데이터 · 포장 지면은 길처럼 걷는다 · 조경 지면은 옆 평상의 자리 값 +1 · 인기 · 걷어내면 잔디 */
describe('P22 지면 붓', () => {
  it('지면 5종은 FLOOR 코드 8~12 와 이름이 같고, 걷는 것 3 · 조경 2', () => {
    expect(GROUNDS.map((g) => g.id)).toEqual(['sandpath', 'sidewalk', 'woodpath', 'flowerbed', 'gravel']);
    for (const g of GROUNDS) { const code = (FLOOR as Record<string, number>)[g.id]!; expect(code).toBeGreaterThanOrEqual(8); expect(FLOOR_NAMES[code]).toBe(g.id); expect(isGround(code)).toBe(true); expect(isWalkFloor(code)).toBe(g.walk); }
    expect(GROUNDS.filter((g) => g.walk).length).toBe(3);
  });

  it('잔디에 모래길을 깔면 20G/칸 · 손님이 걷는 칸이 된다 · 물·시설 칸은 거절 · 걷어내면 잔디', () => {
    const g = new Game(22); g.money = 50000;
    const gt = g.gate;
    const tiles = [{ i: gt.i + 14, j: gt.j + 12 }, { i: gt.i + 15, j: gt.j + 12 }];
    expect(g.grid.at(tiles[0]!.i, tiles[0]!.j)).toBe(FLOOR.grass);
    const money0 = g.money;
    expect(g.paintGround(tiles, 'sandpath').ok).toBe(true);
    expect(money0 - g.money).toBe(40);
    expect(g.grid.at(tiles[0]!.i, tiles[0]!.j)).toBe(FLOOR.sandpath);
    expect(g.guests.walkable(tiles[0]!.i, tiles[0]!.j)).toBe(true);
    expect(g.canPaintGround(tiles[0]!.i, tiles[0]!.j, 'sandpath').ok).toBe(false); // 이미 돌길
    expect(g.canPaintGround(tiles[0]!.i, tiles[0]!.j, 'woodpath').ok).toBe(true); // 덮어 깔기
    expect(g.canPaintGround(gt.i, gt.j + 48, 'sandpath').ok).toBe(false); // 강 (P43: 물가는 gt.j+42)
    expect(g.canPaintGround(gt.i, gt.j, 'sandpath').ok).toBe(false); // 입구
    expect(g.canPaintGround(1, 1, 'nope').ok).toBe(false);
    expect(g.unpaintPath(tiles).ok).toBe(true);
    expect(g.grid.at(tiles[0]!.i, tiles[0]!.j)).toBe(FLOOR.grass);
  });

  it('평상 둘레에 꽃밭 두 칸 → 자리 값 +1(조경) · 경관(P26): 시설 반경 2 의 조경 지면 ×2 가 6 이 되면 인기 +1', () => {
    const g = new Game(22); g.money = 50000; const base = g.decorGroundTiles(); /* P44: 킷에 꽃밭 띠가 있다 */
    const seat = g.facilities.all.find((f) => g.facilities.defOf(f).id === 'pyeongsang_row')!;
    const before = g.seatValueOf(seat.uid);
    expect(before.landscaped).toBe(false);
    const cands: { i: number; j: number }[] = [];
    for (let j = seat.j - 1; j <= seat.j + 1 && cands.length < 2; j++) for (let i = seat.i - 1; i <= seat.i + 4 && cands.length < 2; i++) if (g.canPaintGround(i, j, 'flowerbed').ok && g.grid.at(i, j) === FLOOR.grass) cands.push({ i, j });
    expect(cands.length).toBe(2);
    const pop0 = g.parkPopularity();
    expect(g.paintGround(cands, 'flowerbed').ok).toBe(true);
    const after = g.seatValueOf(seat.uid);
    expect(after.landscaped).toBe(true);
    expect(after.value).toBe(before.value + 1);
    expect(g.decorGroundTiles()).toBe(base + 2);
    // 꽃밭 2칸 × 2 = 4 < 6 → 평상의 경관 인기 0 · 한 칸 더 → 6 → +1 (P26: 지면 인기는 시설 곁에 있을 때만)
    expect(g.parkPopularity()).toBe(pop0);
    const more: { i: number; j: number }[] = [];
    for (let j = seat.j - 2; j <= seat.j + 2 && more.length < 1; j++) for (let i = seat.i - 2; i <= seat.i + 5 && more.length < 1; i++) if (g.grid.at(i, j) === FLOOR.grass && g.canPaintGround(i, j, 'gravel').ok) more.push({ i, j });
    expect(more.length).toBe(1);
    expect(g.paintGround(more, 'gravel').ok).toBe(true);
    expect(g.parkPopularity()).toBe(pop0 + 1);
  });

  it('조경 지면은 유일한 길을 덮지 못한다 (입구 열) · 스냅샷 왕복에 지면이 남는다', () => {
    const g = new Game(22); g.money = 50000; const base = g.decorGroundTiles();
    const gt = g.gate;
    // P40 D52: 마당은 어디든 걷는다 — 입구 앞 한 줄을 덮어도 돌아갈 수 있어 거절되지 않는다(봉쇄는 입구 세 이웃을 다 막을 때만)
    expect(g.canPaintGround(gt.i - 16, gt.j + 18, 'flowerbed').ok).toBe(true); // P48-b3: 서쪽 잔디 // P45-a: 정문 아래는 출입동 복도 — 마당 통로 옆 잔디로
    expect(g.paintGround([{ i: gt.i + 13, j: gt.j + 12 }], 'gravel').ok).toBe(true);
    const h = Game.fromSnapshot(g.toSnapshot());
    expect(h.grid.at(gt.i + 13, gt.j + 12)).toBe(FLOOR.gravel);
    expect(h.decorGroundTiles()).toBe(base + 1);
  });
});

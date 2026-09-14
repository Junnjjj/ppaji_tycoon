import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { FLOOR, isIndoorCode } from './grid.js';
import { buildField } from './nav.js';
import { kitIndoorRect } from './startkit.js';

/** P39 D49 → P45-a D63 — 벽은 실내 바닥의 외곽선. 문은 **복도(hall)가 건물 밖 통로에 닿는 변마다** 난다(복도 없으면 통로가 닿은 변 하나). 벽은 이동을 막고 손님은 문으로만 든다 */
describe('P39 벽·문', () => {
  it('새 판 출입동 20×30(P45-a) — 정문 칸을 감싼 덩어리 하나 · 문 둘(정문 변 · 마당 변, 복도 양 끝) · 벽은 못 넘고 문은 넘는다 · 매표소에 길이 닿는다', () => {
    const g = new Game(39);
    const gt = g.gate; const room = kitIndoorRect(gt);
    let n = 0; for (let j = 0; j < g.grid.h; j++) for (let i = 0; i < g.grid.w; i++) if (isIndoorCode(g.grid.at(i, j))) n++;
    expect(n).toBe(room.w * room.h - 1); // 정문 칸만 포장
    expect(g.grid.at(gt.i, gt.j)).toBe(FLOOR.path);
    for (let j = 1; j < room.h; j++) expect(g.grid.at(gt.i, gt.j + j)).toBe(FLOOR.hall);
    expect(g.grid.blobAt(room.i0 + 1, room.j0 + 1)).toBe(g.grid.blobAt(gt.i, gt.j + 10));
    expect(g.grid.blobAt(room.i0 + 1, room.j0 + 1)).toBe(g.grid.blobAt(room.i0 + room.w - 1, room.j0 + room.h - 1));
    const doors = g.grid.doors(); expect(doors.length).toBe(2);
    expect(doors).toContainEqual({ i: gt.i, j: gt.j + 1, oi: gt.i, oj: gt.j }); // 정문 변
    expect(doors).toContainEqual({ i: gt.i, j: room.j0 + room.h - 1, oi: gt.i, oj: room.j0 + room.h }); // 마당 변
    expect(g.grid.wallBetween(gt.i, gt.j + 1, gt.i, gt.j)).toBe(false);
    expect(g.grid.wallBetween(gt.i + 1, gt.j, gt.i, gt.j)).toBe(true); // 정문 칸 옆 실내와 정문 칸 사이는 벽(정문은 포장, 건물 밖)
    const sx = room.i0 + 4, sy = room.j0 + room.h - 1;
    expect(g.grid.wallBetween(sx, sy, sx, sy + 1)).toBe(true); // 남쪽 변(복도 아닌 칸)은 벽
    expect(g.grid.canCross(room.i0, room.j0 + 5, room.i0 - 1, room.j0 + 5)).toBe(false); // 서쪽 변
    for (const id of ['indoor_shop', 'toilet', 'ticket']) expect(g.facilityHasPath(g.facilities.all.find((x) => x.defId === id)!.uid)).toBe(true);
    // 거리장: 마당은 마당 문을 지나서만 — 마당 문 바깥 칸의 다음 칸은 복도 끝
    const field = buildField(g.grid, [{ i: gt.i, j: gt.j }], (i, j) => g.guests.walkable(i, j));
    expect(field.next(gt.i, room.j0 + room.h)).toEqual({ i: gt.i, j: room.j0 + room.h - 1 });
    expect(field.next(sx, sy + 1)).not.toEqual({ i: sx, j: sy });
  });
  it('잔디 위 건물엔 통로가 닿기 전엔 문이 없다 · 길을 이으면 문이 나고 안의 시설에 길이 닿는다 · 실내 바닥 위의 길은 복도(출구마다 문)', () => {
    const g = new Game(39); g.money = 100000; g.unlocked.facilities.add('office');
    const gt = g.gate; const b = { i0: gt.i - 18, j0: gt.j + 14 }; // P48-b3: 서쪽 잔디(열 30~33 · 행 22~25) — 둘레가 잔디뿐(물가 산책로는 열 38 부터)
    const t = []; for (let j = b.j0; j < b.j0 + 4; j++) for (let i = b.i0; i < b.i0 + 4; i++) t.push({ i, j });
    expect(g.paintIndoor(t).ok).toBe(true);
    const blob = g.grid.blobAt(b.i0 + 1, b.j0 + 1); expect(blob).toBeGreaterThan(0);
    expect(g.grid.doors().some((d) => g.grid.blobAt(d.i, d.j) === blob)).toBe(false); // 둘레가 잔디뿐 — 문이 없다
    const r = g.placeFacility('office', b.i0 + 1, b.j0 + 1, 0, { autoPath: false }); expect(r.ok).toBe(true);
    expect(g.facilityHasPath(r.uid!)).toBe(false);
    const corridor = []; for (let i = b.i0; i < gt.i; i++) corridor.push({ i, j: b.j0 - 1 }); // P48-b3: 건물 북변을 따라 입구 열(마당 통로)까지
    expect(g.paintPath(corridor).ok).toBe(true);
    expect(g.grid.doors().filter((d) => g.grid.blobAt(d.i, d.j) === blob).length).toBe(1);
    expect(g.facilityHasPath(r.uid!)).toBe(true);
    // 실내 바닥 위에 길을 깔면 복도가 되고, 복도가 건물 밖 통로에 닿는 변마다 문이 난다
    expect(g.paintPath([{ i: b.i0 + 3, j: b.j0 + 3 }, { i: b.i0 + 2, j: b.j0 + 3 }]).ok).toBe(true); // 사무실(2×2, 줄 +1~+2) 아래 줄
    expect(g.grid.at(b.i0 + 3, b.j0 + 3)).toBe(FLOOR.hall);
    expect(g.paintPath([{ i: b.i0 + 4, j: b.j0 + 3 }]).ok).toBe(true); // 동쪽 바깥에 통로
    expect(g.grid.doors().filter((d) => g.grid.blobAt(d.i, d.j) === blob).length).toBe(1); // 복도 출구가 생기면 그것이 문(폴백 문은 물러난다)
    expect(g.grid.doors().some((d) => d.i === b.i0 + 3 && d.j === b.j0 + 3 && d.oi === b.i0 + 4)).toBe(true);
    const h = new Game(39); h.money = 100000; h.unlocked.facilities.add('office');
    expect(h.paintIndoor(t).ok).toBe(true);
    const r2 = h.placeFacility('office', b.i0 + 1, b.j0 + 1, 0); expect(r2.ok).toBe(true); // autoPath → 둘레까지 통로 → 문
    expect(h.facilityHasPath(r2.uid!)).toBe(true);
  });
});

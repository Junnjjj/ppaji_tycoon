import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { FLOOR, isWaterCode, BEND, shoreRow } from './grid.js';

/** P1 — 수역: 부표 치기·걷기 · 데크 · 시작 킷 */
describe('P1 수역', () => {
  it('시작 킷 수역 20칸은 데크 링이 둘러싼 물이고, 데크 16 이 강가에 있다', () => {
    const g = new Game(1);
    const p = g.pools.all[0]!;
    expect(p.tiles.length).toBe(20);
    for (const k of p.tiles) { const j = Math.floor(k / g.grid.w); expect(j >= BEND.head.j0 && j < BEND.head.j0 + BEND.head.h).toBe(true); } // P48-b2: 킷 빠지는 못 안
    let deck = 0, deckRiver = 0; for (let k = 0; k < g.grid.floor.length; k++) if (g.grid.floor[k] === FLOOR.deck) { deck++; if (isWaterCode(g.grid.natural[k] as number)) deckRiver++; }
    expect(deck).toBe(19); expect(deckRiver).toBe(19); // P15 링 16 + P48-b2 본류 잔교 3 — 전부 자연 물 위(P48-b3)
    // 손님이 물에 들어간다
    g.step(900);
    expect(g.guests.all.some((x) => x.state === 'swim')).toBe(true);
  });

  it('강은 내 토지 열 안에서만 칠 수 있고, 걷으면 강/여울로 돌아간다', () => {
    const g = new Game(2, undefined, { kit: false });
    g.money = 100000;
    const land = g.land;
    const i = g.gate.i + 9, j = shoreRow(g.gate.i + 9) + 3; // 물가 가까운 강 줄 — 허가 창(깊이 7) 안. P48-b3: 링 동쪽 물가
    expect(g.canDig(i, j).ok).toBe(true);
    expect(g.canDig(land.i0 - 2, j).ok).toBe(false);
    expect(g.canDig(i, shoreRow(i) + 12).ok).toBe(false); // P15 D23 → P48-b3: 허가 깊이(7) 밖의 강
    // 수역은 뭍·데크에 닿아야 한다(손님 입수) — 여울 줄(토지 위 잔디에 닿음)에서 위로 이어 친다
    const jEdge = shoreRow(i); // 여울(물가)
    expect(g.digPool([{ i, j: jEdge }, { i, j: jEdge + 1 }, { i, j: jEdge + 2 }]).ok).toBe(true);
    expect(g.grid.at(i, jEdge + 1)).toBe(FLOOR.pool);
    // 닿지 않는 강 한가운데 홀로는 거절
    expect(g.digPool([{ i: i + 4, j }, { i: i + 5, j }]).ok).toBe(false);
    expect(g.fillPool([{ i, j: jEdge + 1 }, { i, j: jEdge }]).ok).toBe(true);
    expect(g.grid.at(i, jEdge + 1)).toBe(g.grid.naturalAt(i, jEdge + 1)); // 자연 바닥(북안 둘째 줄은 여울)
    expect(g.grid.at(i, jEdge)).toBe(FLOOR.shallow);
    // P49-b D59: 뭍(잔디)에는 풀을 파지 않는다 — 빠지는 물 위에 데크로 두른다 (실내 온수풀만 실내 바닥)
    const land2 = g.canDig(g.gate.i + 3, g.gate.j + 3);
    expect(land2.ok).toBe(false);
    if (!land2.ok) expect(land2.reason).toContain('뭍에는 풀을 파지 않습니다');
  });

  it('데크는 강 위에, 뭍이나 데크에 이어서만 — 걷으면 강으로 돌아가고 시설 아래는 못 걷는다', () => {
    const g = new Game(3, undefined, { kit: false });
    g.money = 100000;
    const gt = g.gate;
    const j0 = shoreRow(gt.i + 2); // 여울(물가) — P48-b3: 열마다 다르다
    expect(g.canPaintDeck(gt.i + 2, j0).ok).toBe(true); // 아래 뭍(잔디)에 이어짐
    expect(g.canPaintDeck(gt.i + 2, j0 + 2).ok).toBe(false); // 떨어진 강 가운데
    expect(g.canPaintDeck(gt.i + 2, gt.j + 2).ok).toBe(false); // 잔디 위
    const money = g.money;
    expect(g.paintDeck([{ i: gt.i + 2, j: j0 }, { i: gt.i + 2, j: j0 + 1 }]).ok).toBe(true); // 이어서 두 칸
    expect(g.money).toBe(money - g.deckCost([{ i: 0, j: 0 }, { i: 0, j: 0 }]));
    expect(g.grid.at(gt.i + 2, j0 + 1)).toBe(FLOOR.deck);
    expect(g.placeFacility('lifering', gt.i + 2, j0 + 1, 0).ok).toBe(true);
    expect(g.unpaintDeck([{ i: gt.i + 2, j: j0 + 1 }]).ok).toBe(false); // 시설 아래
    const bridge = g.unpaintDeck([{ i: gt.i + 2, j: j0 }]);
    expect(bridge.ok).toBe(false); // 그 데크가 구명함으로 가는 유일한 길 — 다리 노릇
    if (!bridge.ok) expect(bridge.reason).toContain('끊깁니다');
    const uid = g.facilities.all.find((f) => f.defId === 'lifering')!.uid;
    expect(g.removeFacility(uid).ok).toBe(true);
    expect(g.unpaintDeck([{ i: gt.i + 2, j: j0 + 1 }, { i: gt.i + 2, j: j0 }]).ok).toBe(true);
    expect(g.grid.at(gt.i + 2, j0)).toBe(FLOOR.shallow);
    expect(g.grid.at(gt.i + 2, j0 + 1)).toBe(g.grid.naturalAt(gt.i + 2, j0 + 1)); // 자연 바닥(북안 둘째 줄은 여울)
  });
});

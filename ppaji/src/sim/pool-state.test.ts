import { describe, it, expect } from 'vitest';
import { TICKS_PER_DAY } from './clock.js';
import { Game, ITEM_DEFS } from './game.js';
import { makeTestPpaji } from './test-helpers.js';
import { sizeScale } from './pool-state.js';

describe('풀 파생 상태', () => {
  it('sizeScale — √size, 상한 6', () => {
    expect(sizeScale(1)).toBe(1);
    expect(sizeScale(4)).toBe(2);
    expect(sizeScale(16)).toBe(4);
    expect(sizeScale(100)).toBe(6);
  });
  it('딸기를 넣으면 핑크 · 베리 · 온도 −2 · 봄이라 인기 보너스', () => {
    const g = new Game(1, undefined, { kit: false });
    const pp = makeTestPpaji(g, 2, 2); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로. 안 물 2×2 = 옛 뭍 풀과 같은 4칸 — 딸기 하나로 핑크가 되는 농도 분모를 지킨다
    const id = pp.id!;
    const before = g.poolState(id)!;
    expect(before.color).toBe('clear');
    expect(g.putItem(id, 'strawberry').ok).toBe(true);
    const st = g.poolState(id)!;
    expect(st.color).toBe('pink');
    expect(st.scent).toBe('berry');
    expect(st.temp).toBe(before.temp + (ITEM_DEFS.get('strawberry')!.tempDelta));
    expect(st.popularity).toBeGreaterThan(before.popularity); // 봄: pink 5 + berry 2
    expect(st.seasonBonus).toBe(7);
  });
  it('아이템은 시간이 지나면 사라진다', () => {
    const g = new Game(1, undefined, { kit: false });
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    const id = pp.id!;
    g.putItem(id, 'lemon');
    const days = ITEM_DEFS.get('lemon')!.days;
    g.step(days * TICKS_PER_DAY); // 7일째 폐장까지 산다
    expect(g.pools.byId(id)!.items.length).toBe(1);
    g.step(TICKS_PER_DAY);
    expect(g.pools.byId(id)!.items.length).toBe(0);
    expect(g.poolState(id)!.color).toBe('clear');
  });
  it('20개 상한 · 잠긴 아이템 거절', () => {
    const g = new Game(1, undefined, { kit: false });
    g.money = 1_000_000;
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    const id = pp.id!;
    expect(g.putItem(id, 'coconut').ok).toBe(false);
    for (let k = 0; k < 20; k++) expect(g.putItem(id, 'lemon').ok).toBe(true);
    expect(g.putItem(id, 'lemon').ok).toBe(false);
  });
  it('인접한 제트풀이 SE 를, 핫텁이 열을 준다', () => {
    const g = new Game(1, undefined, { kit: false });
    const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
    const id = pp.id!;
    const base = g.poolState(id)!;
    // P49-b D59: 인접 시설은 링(데크) 위에 — 안 물에 4이웃으로 닿는 칸은 링뿐이다(뭍은 링 윗줄 너머라 안 닿는다). 윗줄은 뭍에 붙어 있어 3×1 을 놓아도 링이 안 끊긴다
    const { i: a, j: b } = pp.tiles[0]!; // 안 물 좌상단 — 윗줄 b−1 · 아랫줄 b+5
    g.unlocked.facilities.add('footbath'); // P49-a1: 다이빙대는 rig(데크 위에만)가 됐다 — SE 를 주는 시설은 족욕탕(se 5)
    expect(g.placeFacility('footbath', a, b - 1).ok).toBe(true); // 윗줄(링) 위 3×1
    const withJet = g.poolState(id)!;
    expect(withJet.se).toBeGreaterThan(base.se);
    g.unlocked.facilities.add('footbath');
    expect(g.placeFacility('footbath', a, b + 5).ok).toBe(true); // 아랫줄(링) 위 3×1 — 양 끝 칸이 남아 옆 벽으로 이어진다
    expect(g.poolState(id)!.temp).toBe(withJet.temp + 4);
  });
});

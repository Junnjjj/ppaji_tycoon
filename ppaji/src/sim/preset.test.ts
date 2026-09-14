import { describe, it, expect } from 'vitest';
import { TICKS_PER_DAY } from './clock.js';
import { Game, ITEM_DEFS, MAX_PRESETS } from './game.js';
import { makeTestPpaji } from './test-helpers.js';

const setup = () => {
  const g = new Game(1, undefined, { kit: false });
  const pp = makeTestPpaji(g); // P49-b D59: 뭍 풀 금지 — 빠지(데크 링)로
  const id = pp.id!;
  return { g, id };
};

describe('풀 프리셋 (G12)', () => {
  it('빈 풀은 저장 거절 · 아이템이 있으면 살아 있는 것만 담는다', () => {
    const { g, id } = setup();
    expect(g.savePreset(id).ok).toBe(false);
    expect(g.putItem(id, 'lemon').ok).toBe(true);
    g.step(TICKS_PER_DAY); // 레몬을 하루 먼저 넣고
    g.unlocked.items.add('melon'); // 멜론은 상점 아이템 — 테스트라 직접 연다
    expect(g.putItem(id, 'melon').ok).toBe(true);
    // G42 원작 규칙: 나중 아이템은 먼저 것의 만료를 물려받는다 — 둘 다 살아 있는 동안 저장하면 둘 다 담긴다
    expect(g.savePreset(id).ok).toBe(true);
    expect(g.presets[0]!.items).toEqual(['lemon', 'melon']);
    g.step(ITEM_DEFS.get('lemon')!.days * TICKS_PER_DAY); // 같이 만료
    expect(g.pools.byId(id)!.items.filter((it) => it.expiresTick > g.day * TICKS_PER_DAY + g.tick).length).toBe(0);
  });
  it('복원은 아이템을 다시 사서 넣는다 (돈 차감 · 개수 증가) · 상한이면 오래된 것부터 밀린다', () => {
    const { g, id } = setup();
    g.putItem(id, 'strawberry');
    g.putItem(id, 'strawberry');
    expect(g.savePreset(id).ok).toBe(true);
    g.step((ITEM_DEFS.get('strawberry')!.days + 1) * TICKS_PER_DAY);
    expect(g.pools.byId(id)!.items.length).toBe(0);
    const before = g.money;
    expect(g.applyPreset(id, 0).ok).toBe(true);
    expect(g.pools.byId(id)!.items.length).toBe(2);
    expect(before - g.money).toBe(g.presetCost(0));
    for (let k = 0; k < MAX_PRESETS + 2; k++) g.savePreset(id);
    expect(g.presets.length).toBe(MAX_PRESETS);
    expect(g.presets[0]!.name).not.toBe('프리셋 1');
  });
  it('돈이 모자라면 하나도 안 넣고 거절 · 스냅샷 왕복', () => {
    const { g, id } = setup();
    g.putItem(id, 'strawberry');
    g.savePreset(id);
    g.money = 0;
    const r = g.applyPreset(id, 0);
    expect(r.ok).toBe(false);
    expect(g.pools.byId(id)!.items.length).toBe(1);
    const back = Game.fromSnapshot(g.toSnapshot());
    expect(back.presets).toEqual(g.presets);
    expect(JSON.stringify(back.toSnapshot())).toBe(JSON.stringify(g.toSnapshot()));
  });
});

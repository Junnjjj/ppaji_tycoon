import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { GEAR_FAIL_PICK, GEAR_DEFS, PART_DEFS } from './workshop.js';
import { courseEquipment } from './course/course.js';

/** P7 — 기구 공방: 부품 → 기구 발견 = 소유 · 실패작 · Lv 스릴 소급 · 스냅샷 왕복 */
describe('P7 기구 공방', () => {
  it('시작 부품으로 닿는 기구를 만들면 그 기구를 갖게 되고, 다시 만들면 first 가 아니다', () => {
    const g = new Game(1);
    g.money = 50000;
    const before = g.courses.ownedEquipment.size;
    // 시작 부품 7 에는 엔진이 없어(성장 축) 장날 부품을 싼 것부터 사 모으면 어느 기구엔 닿는다
    const reach = (): typeof GEAR_DEFS[number] | undefined => GEAR_DEFS.filter((r) => r.unlock === 'cook' && !g.workshop.known.has(r.id) && g.workshop.fillFor(r.id) !== null).sort((a, b) => a.id.localeCompare(b.id))[0];
    const shopParts = PART_DEFS.filter((p) => p.unlock === 'shop').sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    let target = reach();
    let bought = 0;
    while (!target && bought < shopParts.length) { expect(g.buyPart((shopParts[bought] as { id: string }).id).ok).toBe(true); bought++; target = reach(); }
    expect(target, '장날 부품을 사 모으면 닿는 기구가 있어야 한다').toBeTruthy();
    if (!target) return;
    const ids = g.workshop.fillFor(target.id) as string[];
    const r = g.craft(ids);
    expect(r.ok && r.first && r.recipe.id === target.id).toBe(true);
    expect(g.courses.ownedEquipment.has(target.id)).toBe(true);
    expect(g.courses.ownedEquipment.size).toBe(before + 1);
    expect(courseEquipment(target.id)).toBeTruthy();
    for (const id of new Set(ids)) g.workshop.grantIngredient(id, 5); // P56-c: 조합이 부품 재고를 썼다 — 다시 만들려면 채운다
    const again = g.craft(ids);
    expect(again.ok && !again.first).toBe(true);
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.workshop.known.has(target.id)).toBe(true);
    expect(h.workshop.exp).toBe(g.workshop.exp);
    expect(h.courses.ownedEquipment.has(target.id)).toBe(true);
  });

  it('실패작은 부품 계열로 갈리고 기구가 되지 않는다', () => {
    expect(GEAR_FAIL_PICK(['tube', 'tube'])).toBe('flat_tube');
    expect(GEAR_FAIL_PICK(['tube', 'rope'])).toBe('tangled_rope');
    expect(GEAR_FAIL_PICK(['seat', 'fun'])).toBe('sunk_board');
    for (const id of ['flat_tube', 'tangled_rope', 'sunk_board']) expect(courseEquipment(id)).toBeUndefined();
    const g = new Game(2);
    g.money = 50000;
    const tubes = PART_DEFS.filter((p) => p.unlock === 'start' && p.class === 'tube').map((p) => p.id);
    const seat = PART_DEFS.find((p) => p.unlock === 'start' && p.class === 'seat')?.id;
    const fun = PART_DEFS.find((p) => p.unlock === 'start' && p.class === 'fun')?.id;
    // 시트+재미 부품 둘만은 어느 기구 키에도 없어야 실패작이 나온다 — 있으면 그 기구가 나온 것이니 둘 다 허용
    const r = g.craft([seat as string, fun as string, ...tubes.slice(0, 1)]);
    expect(r.ok).toBe(true);
    if (r.ok && r.via === 'fail') expect(['flat_tube', 'tangled_rope', 'sunk_board']).toContain(r.recipe.id);
  });

  it('공방 Lv 는 놓인 코스의 스릴에 소급된다', () => {
    const g = new Game(1);
    g.money = 100000;
    const s = g.suggestCourse();
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const r = g.placeCourse(s.draft);
    expect(r.ok).toBe(true);
    const base = g.evaluateCourse(1)?.thrill ?? 0;
    g.workshop.exp = 2320; // Lv10
    expect(g.workshop.level).toBe(10);
    const boosted = g.evaluateCourse(1)?.thrill ?? 0;
    expect(boosted).toBeGreaterThanOrEqual(base);
    expect(boosted).toBeLessThanOrEqual(100);
    expect(boosted).toBe(Math.min(100, base * g.workshop.thrillMult));
  });
});

/**
 * 사건 해금 (K41) — 의뢰 보상이 실제로 열리고, 저장을 살아남는가.
 */
import { describe, expect, it } from 'vitest';
import { UnlockStore } from './unlocks.js';
import { ProgressStore, questStatuses, requiredGrade } from './progress.js';
import { PlacementGrid } from './placement.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';

describe('UnlockStore', () => {
  it('골격은 등급에서, 사건은 grant 에서 — isUnlocked 하나로 묻는다', () => {
    const u = new UnlockStore();
    expect(u.isUnlocked('toilet', 1)).toBe(true); // 1등급 골격
    expect(u.isUnlocked('slide_small', 1)).toBe(false); // 2등급 골격
    expect(u.isUnlocked('slide_small', 2)).toBe(true);
    expect(u.isUnlocked('sikhye', 5)).toBe(false); // 의뢰 보상 — 등급으로는 영원히 안 열린다
    expect(requiredGrade('sikhye')).toBe(99);
    expect(u.grant('sikhye')).toBe(true);
    expect(u.grant('sikhye')).toBe(false); // 두 번 축하하지 않는다
    expect(u.isUnlocked('sikhye', 1)).toBe(true);
  });

  it('세이브를 살아남는다 — 보상 몰수 금지', () => {
    const u = new UnlockStore();
    u.grant('sikhye');
    u.grant('turtle_island');
    const back = UnlockStore.fromSnapshot(u.toSnapshot());
    expect(back.isUnlocked('sikhye', 1)).toBe(true);
    expect(back.isUnlocked('turtle_island', 1)).toBe(true);
    // 빈 스냅샷(v6 이하 세이브)도 안전하다
    expect(UnlockStore.fromSnapshot(undefined).grantedIds).toEqual([]);
  });

  it('의뢰를 완수하면 claim 이 보상 시설을 돌려주고, grant 로 시트가 열린다', () => {
    // 전부 포장된 평지 — progress.test 의 flat() 과 같은 수법
    const size = 30;
    const t = new KairoTerrain(size, size);
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'path_stone');
    const w = new WallGrid(size, size);
    const p = new PlacementGrid(size, size);
    const gate = { i: 0, j: 0 };
    // 먹거리 2개 — food_stall 의뢰의 조건. 골격 1등급 시설로만 채운다 (교착 없음의 실증)
    expect(p.place(t, w, gate, 'vending_out', 5, 5).ok).toBe(true);
    expect(p.place(t, w, gate, 'snackbar', 8, 5).ok).toBe(true);

    const progress = new ProgressStore();
    const claim = progress.claim(questStatuses(p, null));
    expect(claim.facilities).toContain('sikhye');
    const u = new UnlockStore();
    for (const f of claim.facilities) u.grant(f);
    expect(u.isUnlocked('sikhye', 1)).toBe(true);
    // 같은 의뢰를 다시 청구해도 시설이 두 번 오지 않는다
    expect(progress.claim(questStatuses(p, null)).facilities).toEqual([]);
  });
});

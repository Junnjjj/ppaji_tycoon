import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { STORY_BEATS, StoryDirector, type StoryState } from './story.js';
import { carryoverOf, applyCarryover, type Carryover } from './endgame.js';
import { RIG_UPGRADES } from './rig-upgrade.js';
import { COMBO_DEFS, activeCombos } from './combos.js';
import { makeTestPpaji } from './test-helpers.js';
import { FLOOR } from './grid.js';

const fresh = (seed = 1): Game => { const g = new Game(seed); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if (d.buildable !== false) g.unlocked.facilities.add(d.id); return g; };
// Deprecated legacy definitions are not NG+ upgrade rewards.
const upgradedIds = new Set(RIG_UPGRADES.map((up) => up.to));
const base = (): StoryState => ({ pools: 1, poolTiles: 20, visitors: 0, likes: 0, wishes: 0, certs: 0, rank: 0, year: 1, areas: 1, recipes: 0, money: 0, hallSales: 0, ended: false, rigs: 0, rigPath: 0, rigGrade: 0, gearsKnown: 0, vestRentals: 0, rigUpgrades: 0 });

describe('P53-b 스토리·이월·엔딩', () => {
  it('비트 33 — 빠지 축 트리거 6종이 데이터에 있고(9 비트) `first_pool` 은 28 · 화자는 셋 안에서', () => {
    expect(STORY_BEATS.length).toBe(33);
    const kinds = new Set(STORY_BEATS.map((b) => b.trigger.kind));
    for (const k of ['rigs', 'rigPath', 'rigGrade', 'gearsKnown', 'vestRentals', 'rigUpgrades']) expect(kinds.has(k as never), k).toBe(true);
    expect(STORY_BEATS.find((b) => b.id === 'first_pool')!.trigger).toEqual({ kind: 'poolTiles', min: 28 });
    const rigBeats = ['first_rig', 'rig_chain2', 'vest_first', 'first_workshop', 'first_convert', 'rig_grade2', 'rig_chain4', 'signature', 'rigs12'];
    for (const id of rigBeats) expect(STORY_BEATS.some((b) => b.id === id), id).toBe(true);
    for (const b of STORY_BEATS) { expect(['president', 'nana', 'judge']).toContain(b.speaker); expect(b.lines.length).toBeGreaterThan(0); }
  });

  it('트리거 6 이 실제 값으로 발화한다 — 기구를 놓고 이으면 first_rig · rig_chain2, 개조하면 first_convert, 공방 도감 3 이면 first_workshop', () => {
    const d = new StoryDirector();
    d.check(base()); // intro 소비
    expect(d.check({ ...base(), rigs: 1 }).map((b) => b.id)).toEqual(['first_rig']);
    expect(d.check({ ...base(), rigs: 1, rigPath: 2 }).map((b) => b.id)).toEqual(['rig_chain2']);
    expect(d.check({ ...base(), rigs: 1, rigPath: 4 }).map((b) => b.id)).toEqual(['rig_chain4']);
    expect(d.check({ ...base(), gearsKnown: 3 }).map((b) => b.id)).toEqual(['first_workshop']);
    expect(d.check({ ...base(), vestRentals: 1 }).map((b) => b.id)).toEqual(['vest_first']);
    expect(d.check({ ...base(), rigUpgrades: 1 }).map((b) => b.id)).toEqual(['first_convert']);
    expect(d.check({ ...base(), rigGrade: 2 }).map((b) => b.id)).toEqual(['rig_grade2']);
    expect(d.check({ ...base(), rigGrade: 4 }).map((b) => b.id)).toEqual(['signature']);
    expect(d.check({ ...base(), rigs: 12 }).map((b) => b.id)).toEqual(['rigs12']);
    // 판에서 — 킷 빠지에 기구 둘을 이어 놓고 판정하면 first_rig · rig_chain2 가 한 번에 (같은 프레임이면 순서대로)
    const g = fresh();
    g.checkStory(true);
    expect(g.placeFacility('rig_stepstone', 51, 24, 0).ok).toBe(true);
    expect(g.placeFacility('rig_stepstone', 51, 25, 0).ok).toBe(true);
    g.checkStory(true);
    const seen = g.story.toSnapshot();
    expect(seen).toContain('first_rig');
    expect(seen).toContain('rig_chain2');
  });

  it('이월 v2 — 개조 도감·EXP·부품이 넘어가고 왕복이 같다 · v1 프로필(`tiles` 든 것)은 읽고 버린다', () => {
    const g = fresh(2);
    const up = RIG_UPGRADES[0]!;
    g.rigs.known.add(up.id); g.rigs.exp = 77; g.rigs.grantIngredient('float_drum');
    const c = carryoverOf(g, null);
    expect(c.version).toBe(2);
    expect(c.rigUpgrades).toContain(up.id); expect(c.rigExp).toBe(77); expect(c.rigParts).toContain('float_drum');
    const rt = JSON.parse(JSON.stringify(c)) as Carryover;
    expect(rt).toEqual(c);
    // 프로필 저장소 왕복은 save/save.test.ts (불변식 1 — sim 검사는 save/ 를 import 하지 않는다)
    const n = fresh(3);
    applyCarryover(n, rt);
    expect(n.rigs.known.has(up.id)).toBe(true); expect(n.rigs.exp).toBe(77); expect(n.rigs.owned.has('float_drum')).toBe(true);
    const v1: Carryover = { version: 1, recipes: [], cookingExp: 0, facilities: [], gifts: [], tiles: ['pink', 'blue'], ticketBase: 200, bestScore: 0, runs: 1 };
    const m = fresh(4);
    const known0 = m.rigs.known.size; // 시작 레시피 3 (P51)
    expect(() => applyCarryover(m, v1)).not.toThrow();
    expect(m.rigs.known.size).toBe(known0);
    expect(m.facilities.all.some((f) => upgradedIds.has(f.defId))).toBe(false); // 개조 도감이 없으면 개조판도 없다
  });

  it('NG+ — 이월한 개조 도감이 있으면 첫 tick 에 개조판 한 채가 킷 빠지에 서 있다 (값 0 · 개조 통계 0)', () => {
    const g = fresh(5);
    const c: Carryover = { version: 2, recipes: [], cookingExp: 0, facilities: [], gifts: [], ticketBase: 200, bestScore: 0, runs: 1, rigUpgrades: [RIG_UPGRADES[0]!.id, RIG_UPGRADES[1]!.id] };
    const money = g.money;
    applyCarryover(g, c);
    const converted = g.facilities.all.filter((f) => upgradedIds.has(f.defId));
    expect(converted.length).toBe(1);
    expect(g.money).toBe(money);
    expect(g.stats.converts ?? 0).toBe(0);
    const pool = [...g.pools.all].sort((a, b) => b.tiles.length - a.tiles.length)[0]!;
    const f = converted[0]!;
    expect(pool.tiles.includes(f.j * g.grid.w + f.i)).toBe(true);
    g.step(1);
    expect(g.facilities.all.filter((x) => upgradedIds.has(x.defId)).length).toBe(1);
  });

  it('콤보 — 기구·링 시설이 든 쌍마다 성립하는 배치가 존재한다 (반경 안에 둘을 놓으면 activeCombos 에 뜬다)', () => {
    const isRig = (id: string): boolean => { const d = FACILITY_DEFS.get(id); return !!d && (d.class === 'rig' || d.onRing === true); };
    const pairs = COMBO_DEFS.filter((c) => c.pair.some(isRig));
    expect(pairs.length).toBeGreaterThanOrEqual(8);
    const failed: string[] = [];
    for (const combo of pairs) {
      // 킷 빠지(4×5)엔 거북섬 8×6·에어바운스 6×5 가 안 들어간다 — 검사용 큰 빠지(10×8) 를 강 띠가 받는 자리에 두르고 그 링·안 물·위 뭍을 훑는다
      let g = fresh(11); let pp: ReturnType<typeof makeTestPpaji> | null = null;
      for (const di of [-22, -26, -30, 12, 16, 20, -18]) { g = fresh(11); g.openLand(5); /* ★5 허가·토지 */ try { pp = makeTestPpaji(g, 10, 8, di); break; } catch { pp = null; } }
      if (!pp) throw new Error('큰 검사 빠지를 둘 자리가 없다');
      // 링을 두 칸 폭으로 — 링 위 2×2(대여 카약·다이빙대)는 플레이어가 데크를 한 겹 더 깔아야 선다(원작·우리 다 같다)
      { const ii0 = pp.ring.map((t) => t.i), jj0 = pp.ring.map((t) => t.j); const bi0 = Math.min(...ii0), bi1 = Math.max(...ii0), bj0 = Math.min(...jj0), bj1 = Math.max(...jj0);
        for (const t of pp.ring) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const i = t.i + di, j = t.j + dj; if (i >= bi0 && i <= bi1 && j >= bj0 && j <= bj1) continue; const code = g.grid.at(i, j); if (code === FLOOR.river || code === FLOOR.shallow) g.paintDeck([{ i, j }]); } }
      const [a, b] = combo.pair;
      let ok = false;
      const tiles: { i: number; j: number }[] = [];
      const ii = pp.ring.map((t) => t.i), jj = pp.ring.map((t) => t.j);
      const i0 = Math.min(...ii) - 5, i1 = Math.max(...ii) + 5, j0 = Math.min(...jj) - 5, j1 = Math.max(...jj) + 3;
      for (let j = Math.max(0, j0); j <= j1; j++) for (let i = Math.max(0, i0); i <= i1; i++) tiles.push({ i, j });
      for (const ta of tiles) {
        if (ok) break;
        for (const fa of [0, 1] as const) {
          if (ok) break;
          const ra = g.placeFacility(a, ta.i, ta.j, fa);
          if (!ra.ok || ra.uid === undefined) continue;
          for (const tb of tiles) {
            if (Math.abs(tb.i - ta.i) > combo.radius + 9 || Math.abs(tb.j - ta.j) > combo.radius + 9) continue; // 발자국(최대 8×6)까지 품는 창
            for (const fb of [0, 1] as const) {
              const rb = g.placeFacility(b, tb.i, tb.j, fb);
              if (!rb.ok || rb.uid === undefined) continue;
              if (activeCombos(g.facilities.all, (f) => g.facilities.defOf(f)).some((x) => x.def.id === combo.id)) { ok = true; break; }
              g.removeFacility(rb.uid);
            }
            if (ok) break;
          }
          if (!ok) g.removeFacility(ra.uid);
        }
      }
      if (!ok) failed.push(combo.id);
    }
    expect(failed, `성립 배치가 없는 쌍: ${failed.join(', ')}`).toEqual([]);
  }, 120000);
});

import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { makeTestPpaji } from './test-helpers.js';
import { COMPOSITES, compositeDeckTiles, isComposite } from './rig.js';
import { RIG_UPGRADES } from './rig-upgrade.js';
import { RIG_PART_DEFS } from './game.js';
import { FacilityStore } from './facility.js';

/**
 * 승인 조합 시설(2026-09-19) — 발자국은 **열린 수면까지** 예약한다.
 * 여기서 재는 것: ① 발자국 전체를 `walkOn` 으로 켜지 않는다 (손님이 물 위를 걷지 않는다)
 * ② 폐기된 구성품은 정의가 남아 옛 세이브가 그대로 열린다 ③ 조합으로 **자동 변환하지 않는다**.
 */
const fresh = (): Game => { const g = new Game(1); g.money = 1e6; g.rank = 5; g.openLand(5); for (const d of FACILITY_DEFS.values()) if (d.buildable !== false) g.unlocked.facilities.add(d.id); return g; }; // ★5 — 8×6 조합은 수면 허가가 넓어야 들어간다

describe('승인 조합 시설 — 시뮬', () => {
  it('walkOn 은 **데크 칸만** — 예약한 열린 수면은 손님이 못 걷는다 (음성 대조군: 발자국 전체를 켜면 48칸)', () => {
    const g = fresh();
    const { ring } = makeTestPpaji(g, 8, 8, 11); // 킷 링 동쪽 빈 물가에 8×8 안쪽 물 — 8×6 조합이 들어간다
    expect(ring.length).toBeGreaterThan(0);
    const def = FACILITY_DEFS.get('ppaji_slide')!;
    let placed: { i: number; j: number; uid: number } | null = null;
    for (let i = g.gate.i + 8; i <= g.gate.i + 22 && !placed; i++) for (let j = 0; j < g.grid.h && !placed; j++) {
      const r = g.placeFacility('ppaji_slide', i, j, 0);
      if (r.ok) placed = { i, j, uid: r.uid! };
    }
    expect(placed, '8×6 조합을 놓을 자리').not.toBeNull();
    const fp = FacilityStore.footprint(def, placed!.i, placed!.j, 0);
    expect(fp.length).toBe(48);
    const deck = compositeDeckTiles('ppaji_slide', placed!.i, placed!.j, 0);
    expect(deck.length).toBe(18);
    const on = fp.filter((t) => g.rigState.walkOn[t.j * g.grid.w + t.i] === 1);
    expect(on.length, '켜진 칸은 데크뿐이다').toBe(deck.length);
    const key = new Set(deck.map((t) => `${t.i}|${t.j}`));
    for (const t of on) expect(key.has(`${t.i}|${t.j}`), `${t.i},${t.j}`).toBe(true);
    expect(on.length).toBeLessThan(fp.length); // 대조군 — 발자국 전체였다면 48
  });

  it('폐기 구성품은 **정의가 남는다** — 옛 세이브의 인스턴스가 살아 돌아오고, 조합으로 자동 변환되지 않는다', () => {
    const g = fresh();
    const dep = [...FACILITY_DEFS.values()].filter((d) => d.deprecated === true);
    // ⚠ 총수를 박지 않는다 — 어느 구성품까지 폐기할지는 밸런스 결정이고 바뀔 수 있다.
    // 여기서 지키는 것은 「조합이 흡수한 것은 반드시 폐기됐다」와 「폐기의 뜻이 한결같다」 둘뿐이다.
    const absorbed = COMPOSITES.flatMap((c) => c.components).filter((m) => FACILITY_DEFS.has(m) && !COMPOSITES.some((c) => c.id === m));
    expect(absorbed.length).toBeGreaterThanOrEqual(9);
    for (const m of absorbed) expect(FACILITY_DEFS.get(m)!.deprecated, `${m} 은 조합의 구성품이다`).toBe(true);
    expect(dep.length).toBeGreaterThanOrEqual(absorbed.length);
    for (const d of dep) {
      expect(d.buildable, d.id).toBe(false);          // 건설 목록에 없다
      expect(d.unlock.source, d.id).toBe('craft');    // 레시피가 없으므로 새로 얻을 길이 없다
      expect(isComposite(d.id), d.id).toBe(false);
    }
    // 개조 레시피는 폐기 원종을 가리키지 않는다 (새로 만들 수 없다) · 레시피의 부품은 실재해야 한다
    const deps = new Set(dep.map((d) => d.id));
    const parts = new Set(RIG_PART_DEFS.map((x) => x.id));
    for (const r of RIG_UPGRADES) {
      expect(deps.has(r.from), r.id).toBe(false); expect(deps.has(r.to), r.id).toBe(false);
      for (const k of [...r.key.split('+'), ...r.add]) expect(parts.has(k) || k.startsWith('@'), `${r.id} 부품 ${k}`).toBe(true);
    }
    // 옛 세이브 왕복 — 폐기 시설이 놓인 판을 저장했다 불러오면 그대로 있다 (발자국도 그대로)
    const { tiles } = makeTestPpaji(g, 4, 5, -6);
    const r = g.placeFacility('rig_bridge', tiles[0]!.i, tiles[0]!.j, 0);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const snap = JSON.parse(JSON.stringify(g.toSnapshot())) as ReturnType<Game['toSnapshot']>;
    const back = Game.fromSnapshot(snap);
    const f = back.facilities.byUid(r.uid!)!;
    expect(f.defId).toBe('rig_bridge');
    expect(FacilityStore.footprint(back.facilities.defOf(f), f.i, f.j, f.facing).length).toBe(2); // 1×2 그대로 — 조합(48칸)으로 커지지 않았다
  });

  it('조합 정의는 데이터다 — id·크기·구성품이 `composites.json` 과 시설 정의에서 한 번만 나온다', () => {
    expect(COMPOSITES.map((c) => c.id)).toEqual(['ppaji_slide', 'ppaji_playground', 'boarding_dock']);
    // 승하선 데크는 발자국 전체가 데크라 walkOn 이 예전과 같다 — 그래도 같은 등록부에 둬야 화면·sim 이 한 곳에서 자리를 읽는다
    expect(compositeDeckTiles('boarding_dock', 5, 5, 0).length).toBe(2);
    for (const c of COMPOSITES) {
      const def = FACILITY_DEFS.get(c.id)!;
      expect([def.w, def.d], c.id).toEqual(c.size);
      expect(isComposite(c.id)).toBe(true);
      // 구성품이 게임 시설이면 정의가 남아 있어야 한다 (폐기돼도 세이브가 열린다). 저자 모듈 이름(boarding_deck_2x1)은 게임 시설이 아니다
      for (const m of c.components) if (m.startsWith('rig_') || ['waterwalk', 'trampoline_w'].includes(m)) expect(FACILITY_DEFS.get(m), `${c.id} ${m}`).toBeDefined();
    }
    expect(isComposite('rig_bridge')).toBe(false);
  });
});

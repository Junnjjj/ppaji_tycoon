import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Game, FACILITY_DEFS } from './game.js';
import { chainScale, CHAIN_KINDS, ppajiGrade, CHAIN_BASE, CHAIN_CAP } from './rig.js';
import { capacityOf } from './facility.js';
import { runBot } from './bot.js';

const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if (d.class === 'rig' || d.onRing) g.unlocked.facilities.add(d.id); return g; };

describe('P50-b1 사슬·등급 값', () => {
  it('chainScale 항등 표 — len 1·2·4·8 → ×1·1·1.41·2.0 (base 2 · cap 2.0 은 데이터) · 계열 셋 · 등급 문턱 5', () => {
    expect(CHAIN_BASE).toBe(2); expect(CHAIN_CAP).toBe(2);
    expect([1, 2, 4, 8].map((n) => Number(chainScale(n).toFixed(2)))).toEqual([1, 1, 1.41, 2]);
    expect(chainScale(32)).toBe(2); // 상한
    expect(CHAIN_KINDS).toEqual(['obstacle', 'slide', 'rest']);
    const chains = new Set([...FACILITY_DEFS.values()].map((d) => d.chain).filter((c): c is string => !!c));
    expect([...chains].sort()).toEqual([...CHAIN_KINDS].sort());
    const g0 = new Game(1);
    expect([...FACILITY_DEFS.values()].filter((d) => d.chain === 'obstacle' && g0.isUnlocked(d.id)).length).toBe(3); // **시작** obstacle 계열 정확히 3종(에어바운스는 뒤에 열린다) → CHAIN_KINDS_FOR_GRADE3
    // 등급 문턱 5 (코드)
    expect(ppajiGrade({ n: 1, kinds: 1, chain: 0, chainKinds: 0, lights: 0 })).toBe(0);
    expect(ppajiGrade({ n: 2, kinds: 1, chain: 0, chainKinds: 0, lights: 0 })).toBe(1);
    expect(ppajiGrade({ n: 5, kinds: 3, chain: 0, chainKinds: 0, lights: 0 })).toBe(2);
    expect(ppajiGrade({ n: 9, kinds: 3, chain: 4, chainKinds: 3, lights: 0 })).toBe(3);
    expect(ppajiGrade({ n: 9, kinds: 5, chain: 0, chainKinds: 0, lights: 0 })).toBe(3);
    expect(ppajiGrade({ n: 9, kinds: 4, chain: 4, chainKinds: 2, lights: 0 })).toBe(2); // 사슬 종 수 2 는 못 넘는다(도배 방지)
    expect(ppajiGrade({ n: 14, kinds: 6, chain: 0, chainKinds: 0, lights: 1 })).toBe(4);
    expect(ppajiGrade({ n: 14, kinds: 6, chain: 0, chainKinds: 0, lights: 0 })).toBe(3); // 조명 없으면 시그니처 아님
  });

  it('사슬 = 켜진 같은 계열 4이웃 컴포넌트 — chainLen·chainKinds 가 그 크기·종 수, 정원은 capacityOf 에만 × chainScale · 다른 계열은 안 이어진다', () => {
    const g = fresh();
    // 킷 빠지 안(열 51~54 행 24~28): obstacle 계열 징검다리(1×1)를 열 51 에 세로로 넷 — 첫 칸이 서쪽 링(열 50)에 닿아 켜진다
    const uids: number[] = [];
    for (const j of [24, 25, 26, 27]) { const r = g.placeFacility('rig_stepstone', 51, j, 0); expect(r.ok, JSON.stringify(r)).toBe(true); uids.push(r.uid!); }
    for (const u of uids) { expect(g.rigState.lit.has(u)).toBe(true); expect(g.rigState.chainLen.get(u)).toBe(4); expect(g.rigState.chainKinds.get(u)).toBe(1); }
    const f0 = g.facilities.byUid(uids[0]!)!;
    expect(f0.chainLen).toBe(4);
    const def = g.facilities.defOf(f0);
    expect(capacityOf(def, f0)).toBe(Math.round(def.capacity * chainScale(4))); // ×1.41
    expect(capacityOf(def, { level: 1 })).toBe(def.capacity); // chainLen 없으면 ×1
    // 같은 계열 다른 종(다리 1×2, facing 1 = 가로) 을 (52,27)(53,27) 에 — (51,27) 에 닿아 사슬 5 · 종 2
    const b = g.placeFacility('rig_bridge', 52, 27, 1); expect(b.ok, JSON.stringify(b)).toBe(true);
    expect(g.rigState.chainLen.get(uids[0]!)).toBe(5); expect(g.rigState.chainKinds.get(uids[0]!)).toBe(2);
    // 다른 계열(rest 해먹 2×3 → facing 1 = 3×2)은 닿아도 안 이어진다 — 자기 사슬 1
    const h = g.placeFacility('rig_hammock', 52, 24, 1); expect(h.ok, JSON.stringify(h)).toBe(true); // (52~54, 24~25) — 여울용이라 행 24~25
    expect(g.rigState.lit.has(h.uid!)).toBe(true);
    expect(g.rigState.chainLen.get(h.uid!)).toBe(1);
    expect(g.rigState.chainLen.get(uids[0]!)).toBe(5);
    // 등급: n 6 · 종 3 → 2 · chain 5
    expect(g.ppajiGradeOf(g.pools.all[0]!.id)).toBe(2);
    // 스릴·인기엔 안 곱한다 — popOf/thrill 은 def 값 그대로 (chainScale 호출부는 capacityOf 뿐: 정적 항)
  });

  it('정적 — chainScale 호출부는 facility.ts 의 capacityOf 하나 (rig.ts 정의 · 검사 제외) · chainLen 은 스냅샷에 0건, 로드 뒤 다시 선다', () => {
    const dir = new URL('./', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'rig.ts');
    const callers = files.filter((f) => /\bchainScale\(/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(callers).toEqual(['facility.ts']);
    const g = fresh();
    for (const j of [24, 25, 26]) expect(g.placeFacility('rig_stepstone', 51, j, 0).ok).toBe(true);
    const snap = g.toSnapshot();
    expect(JSON.stringify(snap)).not.toContain('chainLen');
    const b = Game.fromSnapshot(JSON.parse(JSON.stringify(snap)) as typeof snap);
    expect([...b.rigState.chainLen.values()]).toEqual([...g.rigState.chainLen.values()]);
    expect(b.facilities.all.map((f) => f.chainLen ?? 0)).toEqual(g.facilities.all.map((f) => f.chainLen ?? 0));
  });

  it('A/B 같은 시드 — 켜진 빠지(등급 2)의 인기 ≥ 기구 0 판 × 1.5 (배율 [1,1.4,1.9,2.6,3.5] 은 데이터)', () => {
    const a = fresh(), b = fresh();
    const pid = a.pools.all[0]!.id;
    for (const j of [24, 25, 26, 27]) expect(b.placeFacility('rig_stepstone', 51, j, 0).ok).toBe(true);
    expect(b.placeFacility('rig_bridge', 52, 27, 1).ok).toBe(true); // (51,27) 에 닿아 켜진다
    expect(b.placeFacility('rig_hammock', 52, 24, 1).ok).toBe(true); // 여울 행 24~25
    expect(b.ppajiGradeOf(pid)).toBe(2);
    expect(b.b.ppajiGradePopMul).toEqual([1, 1.4, 1.9, 2.6, 3.5]);
    expect(b.poolState(pid)!.popularity).toBeGreaterThanOrEqual(a.poolState(pid)!.popularity * 1.5);
  });

  it('봇 — `--no-rig` 대조군은 기구 0 (rigsDistinct 0 → 밴드 빨강), 기본 봇은 32일에 기구 ≥ 3종 · 사슬 ≥ 2', () => {
    const off = runBot(new Game(2), 32, { reserve: 3000, digPerDay: 4, poolTarget: 24, facilityPerTiles: 3, useItems: true, persona: 'balanced', noRig: true });
    expect(off.rigsDistinct).toBe(0);
    const on = runBot(new Game(2), 32);
    expect(on.rigsDistinct).toBeGreaterThanOrEqual(3);
    expect(on.rigChainMax).toBeGreaterThanOrEqual(2);
    expect(on.ppajiSpendShare).toBeGreaterThan(0);
  }, 60000);
});

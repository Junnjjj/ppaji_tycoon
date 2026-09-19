import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Game, FACILITY_DEFS } from './game.js';
import { chainScale, CHAIN_KINDS, ppajiGrade, CHAIN_BASE, CHAIN_CAP } from './rig.js';
import { capacityOf } from './facility.js';
import { runBot } from './bot.js';

const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if (d.class === 'rig' || d.onRing) g.unlocked.facilities.add(d.id); return g; };

describe('P50-b1 사슬·등급 값', () => {
  it('chainScale 항등 표 — len 1·2·4·8 → ×1·1·1.41·2.0 (base 2 · cap 2.0 은 데이터) · 계열 셋 · 등급 문턱(P60-d 부터 balance.ppajiGradeThresholds)', () => {
    expect(CHAIN_BASE).toBe(2); expect(CHAIN_CAP).toBe(2);
    expect([1, 2, 4, 8].map((n) => Number(chainScale(n).toFixed(2)))).toEqual([1, 1, 1.41, 2]);
    expect(chainScale(32)).toBe(2); // 상한
    expect(CHAIN_KINDS).toEqual(['obstacle', 'slide', 'rest']);
    const chains = new Set([...FACILITY_DEFS.values()].map((d) => d.chain).filter((c): c is string => !!c));
    expect([...chains].sort()).toEqual([...CHAIN_KINDS].sort());
    const g0 = new Game(1);
    // 2026-09-19 조합 채택: 밸런스 빔이 빠지 놀이터에 흡수돼 **시작** obstacle 계열이 3 → 2 종이다 (에어바운스는 뒤에 열린다).
    // 계열 자체(obstacle·slide·rest)는 그대로 셋이고 시작부터 obstacle·slide 둘이 열려 있다 — 값을 줄이는 대신 그 구성을 못박는다
    expect([...FACILITY_DEFS.values()].filter((d) => d.chain === 'obstacle' && g0.isUnlocked(d.id)).map((d) => d.id)).toEqual(['rig_bridge', 'rig_stepstone']);
    expect([...new Set([...FACILITY_DEFS.values()].filter((d) => d.chain && g0.isUnlocked(d.id) && d.deprecated !== true).map((d) => d.chain))].sort()).toEqual(['obstacle', 'slide']);
    // 등급 문턱 — 값은 데이터(`ppajiGradeThresholds`), 규칙은 코드. p60d.test 가 옛 상수와의 회귀를 잰다
    expect(ppajiGrade({ n: 1, kinds: 1, chain: 0, chainKinds: 0, lights: 0 })).toBe(0);
    expect(ppajiGrade({ n: 2, kinds: 1, chain: 0, chainKinds: 0, lights: 0 })).toBe(1);
    expect(ppajiGrade({ n: 5, kinds: 3, chain: 0, chainKinds: 0, lights: 0 })).toBe(2);
    expect(ppajiGrade({ n: 9, kinds: 3, chain: 4, chainKinds: 3, lights: 0 })).toBe(3);
    expect(ppajiGrade({ n: 9, kinds: 5, chain: 0, chainKinds: 0, lights: 0 })).toBe(3);
    expect(ppajiGrade({ n: 9, kinds: 4, chain: 4, chainKinds: 2, lights: 0 })).toBe(2); // 사슬 종 수 2 는 못 넘는다(도배 방지)
    expect(ppajiGrade({ n: 14, kinds: 6, chain: 0, chainKinds: 0, lights: 1 })).toBe(4);
    expect(ppajiGrade({ n: 14, kinds: 6, chain: 0, chainKinds: 0, lights: 0 })).toBe(3); // 조명 없으면 시그니처 아님
  });

  it('P60-d: 사슬은 경로에 흡수 — chainLen = 입수구에서 몇 번째(경로 순번) · chainKinds = 그 수역 경로 안 종 수, 정원은 capacityOf 에만 × chainScale · 다른 계열도 경로에 든다', () => {
    const g = fresh();
    // 킷 빠지 안(열 51~54 행 24~28): 징검다리(1×1)를 열 51 에 세로로 넷 — (51,24) 가 뭍 둑(51,23)·입수구 데크(50,24)에 닿아 씨앗, 아래로 1·2·3·4번째
    const uids: number[] = [];
    for (const j of [24, 25, 26, 27]) { const r = g.placeFacility('rig_stepstone', 51, j, 0); expect(r.ok, JSON.stringify(r)).toBe(true); uids.push(r.uid!); }
    const pid = g.pools.all[0]!.id;
    expect(g.pathOf(pid)).toEqual(uids);
    uids.forEach((u, k) => { expect(g.rigState.lit.has(u)).toBe(true); expect(g.rigState.chainLen.get(u)).toBe(k + 1); expect(g.rigState.chainKinds.get(u)).toBe(1); });
    const f3 = g.facilities.byUid(uids[3]!)!;
    expect(f3.chainLen).toBe(4);
    const def = g.facilities.defOf(f3);
    expect(capacityOf(def, f3)).toBe(Math.round(def.capacity * chainScale(4))); // 4번째 ×1.41
    expect(capacityOf(def, { level: 1 })).toBe(def.capacity); // chainLen 없으면 ×1
    // 같은 계열 다른 종(다리 1×2, facing 1 = 가로) 을 (52,27)(53,27) 에 — (51,27) 뒤라 5번째 · 경로 종 2
    const b = g.placeFacility('rig_bridge', 52, 27, 1); expect(b.ok, JSON.stringify(b)).toBe(true);
    expect(g.rigState.chainLen.get(b.uid!)).toBe(5); expect(g.rigState.chainKinds.get(uids[0]!)).toBe(2);
    // 2026-09-19: 해먹(rest)이 조합에 흡수됐다. 살아 있는 rest 는 거북섬 8×6 뿐이라 킷 빠지(안 물 4×5)에 안 들어간다 —
    // 대신 **계열이 없는**(chain null) 블롭 점프로 잰다. 「계열이 다른 기구도 같은 경로에 든다」는 뜻은 그대로고,
    // chainKinds 가 3 으로 오르는 것(= 경로 안 종 수)도 그대로다. ⚠ 한계: 시작 근처에서 rest 계열을 섞는 경로는 더 이상 못 만든다
    const h = g.placeFacility('rig_blob', 52, 26, 0); expect(h.ok, JSON.stringify(h)).toBe(true); // (52~54, 26) — 깊은 물(강) 3×1
    expect(g.rigState.lit.has(h.uid!)).toBe(true);
    expect(g.pathOf(pid)).toEqual([uids[0], uids[1], uids[2], uids[3], h.uid, b.uid]);
    expect(g.rigState.chainLen.get(h.uid!)).toBe(5);
    expect(g.rigState.chainLen.get(uids[3]!)).toBe(4); expect(g.rigState.chainKinds.get(h.uid!)).toBe(3);
    expect(g.pathCompleteOf(pid)).toBe(false); // 끝이 다리(obstacle)라 미완성
    // 등급: n 6 · 종 3 → 2 · 경로 6
    expect(g.ppajiGradeOf(pid)).toBe(2);
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
    expect(b.placeFacility('rig_blob', 52, 26, 0).ok).toBe(true); // 2026-09-19: 해먹 폐기 → 블롭 점프(깊은 물 3×1, 행 26)
    expect(b.ppajiGradeOf(pid)).toBe(2);
    expect(b.b.ppajiGradePopMul).toEqual([1, 1.4, 1.9, 2.6, 3.5]);
    expect(b.poolState(pid)!.popularity).toBeGreaterThanOrEqual(a.poolState(pid)!.popularity * 1.5);
  });

  it('봇 — `--no-rig` 대조군은 기구 0 (rigsDistinct 0 → 밴드 빨강), 기본 봇은 32일에 기구 ≥ 3종 · 사슬 ≥ 2', () => {
    const off = runBot(new Game(2), 32, { reserve: 3000, digPerDay: 4, poolTarget: 24, facilityPerTiles: 3, persona: 'balanced', noRig: true });
    expect(off.rigsDistinct).toBe(0);
    const on = runBot(new Game(2), 32);
    expect(on.rigsDistinct).toBeGreaterThanOrEqual(3);
    expect(on.rigChainMax).toBeGreaterThanOrEqual(2); // P60-d: 뜻은 경로 순번 최대 = 최장 경로
    expect(on.ppajiSpendShare).toBeGreaterThan(0);
  }, 60000);
});

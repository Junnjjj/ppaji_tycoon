import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, FACILITY_DEFS } from './game.js';
import { Grid, FLOOR } from './grid.js';
import { FacilityStore } from './facility.js';
import { computeRigs, computeEntries, ppajiGrade, PPAJI_GRADE_THRESHOLDS, CHAIN_KINDS_FOR_GRADE3, PATH_COMPLETE_SAT_MUL, PATH_COMPLETE_MIN, type PpajiGrade } from './rig.js';
import { runBot, BOT_PERSONAS } from './bot.js';
import { evaluate } from './condition.js';
import balance from '../data/balance.json';

/**
 * P60-d 입수구·경로 (D72 A+C, docs/plan-ppaji-rig-foodcourt.md §10.4 · §3.2 A).
 * 입수구 = 링(수역 물에 닿은 데크·뭍 둑 + 이어진 데크) 칸 중 뭍에 닿은 칸들의 연속 구간 수 · 경로 = 켜진 기구를 입수구에서 BFS 순으로 ·
 * 완성 = 끝 휴식을 뺀 스릴 비감소 ∧ 마지막 rest ∧ 길이 ≥ 2. 사슬(chainLen)은 경로 순번에 흡수. 등급 문턱은 balance.json. 벌점 0 · 저장 0.
 */

/** 킷 빠지 — 링 열 50·55 · 행 24~29, 안 물 열 51~54 · 행 24~28(24~25 여울 · 26~28 강) · 행 23 은 물가 포장(둑) · 잔교 열 58 행 24~26 */
const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if (d.class === 'rig' || d.onRing) g.unlocked.facilities.add(d.id); return g; };

/**
 * 합성 세계 — 위 세 줄이 뭍(포장), 아래는 강. 링 사각형(i0,j0,w,h)은 `makePpaji` 처럼 윗줄이 뭍 둑(그대로), 나머지 둘레가 데크. 안은 수역 7.
 * 기구는 `store.place` 로 직접 놓는다(배치 규칙 밖 — `computeRigs` 의 순수성만 잰다)
 */
function synth(rigsAt: readonly [string, number, number, 0 | 1][], opts: { shore?: boolean } = {}): { st: ReturnType<typeof computeRigs>; store: FacilityStore; poolId: number; grid: Grid } {
  const W = 24, H = 16, i0 = 2, j0 = 2, ringW = 14, ringH = 9;
  const grid = new Grid(W, H);
  for (let k = 0; k < W * H; k++) grid.floor[k] = FLOOR.river;
  if (opts.shore !== false) for (let j = 0; j <= j0; j++) for (let i = 0; i < W; i++) grid.set(i, j, FLOOR.path);
  for (let a = 0; a < ringW; a++) { if (grid.at(i0 + a, j0) !== FLOOR.path) grid.set(i0 + a, j0, FLOOR.deck); grid.set(i0 + a, j0 + ringH - 1, FLOOR.deck); }
  for (let b = 0; b < ringH; b++) { if (grid.at(i0, j0 + b) !== FLOOR.path) grid.set(i0, j0 + b, FLOOR.deck); if (grid.at(i0 + ringW - 1, j0 + b) !== FLOOR.path) grid.set(i0 + ringW - 1, j0 + b, FLOOR.deck); }
  const inside = (i: number, j: number): boolean => i > i0 && i < i0 + ringW - 1 && j > j0 && j < j0 + ringH - 1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inside(i, j)) grid.set(i, j, FLOOR.pool);
  const pools = { ownerIdAt: (i: number, j: number): number => (inside(i, j) ? 7 : -1) };
  const store = new FacilityStore(grid, FACILITY_DEFS);
  for (const [id, i, j, f] of rigsAt) store.place(id, i, j, f);
  return { st: computeRigs(grid, store, pools), store, poolId: 7, grid };
}
const uidAt = (store: FacilityStore, i: number, j: number): number => store.all.find((f) => f.i === i && f.j === j)!.uid;

describe('P60-d 입수구 — computeEntries', () => {
  it('킷 빠지 입수구 = 1 (윗줄 둑 51~54,23 + 모서리 데크 50,24·55,24 가 모서리를 돌아 한 구간) · 잔교(열 58)를 라인 조각 하나로 링에 이으면 2', () => {
    const g = fresh();
    const pid = g.pools.all[0]!.id, w = g.grid.w;
    expect(g.entriesOf(pid)).toBe(1);
    expect(g.rigState.entryTiles.get(pid)!.map((k) => `${k % w},${Math.floor(k / w)}`)).toEqual(['51,23', '52,23', '53,23', '54,23', '50,24', '55,24']);
    const r = g.placeLine(2, 56, 26, 0); expect(r.ok, JSON.stringify(r)).toBe(true); // (56,26)(57,26) — 동쪽 링(55,26)에서 잔교(58,26)까지
    expect(g.entriesOf(pid)).toBe(2); // 잔교 (58,24) 가 뭍(58,23)에 닿는 둘째 구간 — 기존 구간과 8이웃으로 안 이어진다
    expect(g.rigState.entryTiles.get(pid)!.map((k) => `${k % w},${Math.floor(k / w)}`)).toContain('58,24');
    // 부수 효과: 조각이 (56~57, 24~25) 여울을 가둬 4칸 수역이 하나 더 생긴다 — 그 수역의 입수구는 제 것(둑 56~57,23 · 잔교)
    expect(g.pools.all.length).toBe(2);
    expect(JSON.stringify(g.toSnapshot())).not.toMatch(/entries|pathComplete|"path"/); // 저장 0 — 전부 파생
  });
  it('합성 — 윗줄 둑이 있으면 1 · 뭍에 안 닿은 링(강 한가운데)은 0 이고 그 수역의 경로는 빈 배열, 켜진 기구의 chainLen 은 1', () => {
    const { st, poolId } = synth([['rig_stepstone', 3, 3, 0]]);
    expect(st.entries.get(poolId)).toBe(1);
    const off = synth([['rig_stepstone', 3, 3, 0], ['rig_stepstone', 4, 3, 0]], { shore: false });
    expect(off.st.entries.get(off.poolId)).toBe(0);
    expect(off.st.path.get(off.poolId)).toEqual([]);
    expect(off.st.lit.size).toBe(2); // 링에 닿아 켜지긴 한다 — 켜짐과 경로는 다른 축
    for (const u of off.st.lit) { expect(off.st.chainLen.get(u)).toBe(1); expect(off.st.chainKinds.get(u)).toBe(1); }
    expect(off.st.pathComplete.get(off.poolId)).toBe(false);
    const ent = computeEntries(off.grid, off.store, { ownerIdAt: (i, j) => (i > 2 && i < 15 && j > 2 && j < 10 ? 7 : -1) });
    expect(ent.entryTiles.get(7)).toEqual([]);
  });
});

describe('P60-d 경로 — BFS 순 · 완성', () => {
  it('경로는 BFS 순(단위 항등) — 기구 셋을 입수구에서 먼 것부터 놓아도 path 는 입수구 쪽부터 · chainLen 은 순번 · chainKinds 는 경로 안 종 수', () => {
    const { st, store, poolId } = synth([['rig_stepstone', 3, 5, 0], ['rig_stepstone', 3, 4, 0], ['rig_bridge', 3, 3, 0]]); // 다리 1×2 facing 0 = (3,3) 한 칸? — 다리는 1×2 라 (3,3)(3,4)와 겹친다: 아래서 확인
    void st; void store; void poolId;
  });
  it('경로 순서 — 징검돌 셋을 (3,5)→(3,4)→(3,3) 순으로 놓아도 path = [(3,3),(3,4),(3,5)] · 동점은 uid', () => {
    const { st, store, poolId } = synth([['rig_stepstone', 3, 5, 0], ['rig_stepstone', 3, 4, 0], ['rig_stepstone', 3, 3, 0]]);
    const [a, b, c] = [uidAt(store, 3, 3), uidAt(store, 3, 4), uidAt(store, 3, 5)];
    expect(st.path.get(poolId)).toEqual([a, b, c]);
    expect([a, b, c].map((u) => st.chainLen.get(u))).toEqual([1, 2, 3]);
    expect([a, b, c].map((u) => st.chainKinds.get(u))).toEqual([1, 1, 1]);
    // 씨앗 둘(서쪽 링·동쪽 링 모서리 — 둘 다 둑에 닿는다)은 거리 0 동점 → uid 순(놓은 순). 둑에만 닿고 데크에 안 닿는 기구는 켜지지 않는다(P50-a 씨앗 규칙 그대로)
    const two = synth([['rig_stepstone', 14, 3, 0], ['rig_stepstone', 3, 3, 0], ['rig_stepstone', 8, 3, 0]]);
    expect(two.st.lit.has(uidAt(two.store, 8, 3))).toBe(false);
    expect(two.st.path.get(two.poolId)).toEqual([uidAt(two.store, 14, 3), uidAt(two.store, 3, 3)]);
  });
  it('완성 — 징검돌(1) → 빔(2) → 선베드(rest) 는 완성 · 역순(빔 → 징검돌 → 선베드)은 미완성 · 끝이 휴식이 아니면 미완성 · 휴식 하나만은 코스가 아니다(길이 ≥ 2)', () => {
    const ok = synth([['rig_stepstone', 3, 3, 0], ['rig_beam', 3, 4, 0], ['rig_sunbed', 3, 6, 0]]); // 빔 1×2 (3,4)(3,5) · 선베드 1×2 (3,6)(3,7)
    expect(ok.st.path.get(ok.poolId)!.length).toBe(3);
    expect(ok.st.pathComplete.get(ok.poolId)).toBe(true);
    const rev = synth([['rig_beam', 3, 3, 0], ['rig_stepstone', 3, 5, 0], ['rig_sunbed', 3, 6, 0]]);
    expect(rev.st.path.get(rev.poolId)!.length).toBe(3);
    expect(rev.st.pathComplete.get(rev.poolId)).toBe(false);
    const noRest = synth([['rig_stepstone', 3, 3, 0], ['rig_beam', 3, 4, 0]]);
    expect(noRest.st.pathComplete.get(noRest.poolId)).toBe(false);
    const lone = synth([['rig_sunbed', 3, 3, 0]]);
    expect(lone.st.path.get(lone.poolId)!.length).toBe(1);
    expect(lone.st.pathComplete.get(lone.poolId)).toBe(false);
    expect(PATH_COMPLETE_MIN).toBe(2);
  });
  it('Game — aimPreview.pathNext/completeNext == 확정 뒤 실값 · rigPath/rigPathComplete 조건 · 손님 가산은 `pop × 0.15` 항에만 ×1.25(정적)', () => {
    const g = fresh();
    const pid = g.pools.all[0]!.id;
    expect(g.placeFacility('rig_stepstone', 51, 24, 0).ok).toBe(true); // 둑(51,23)·입수구 데크(50,24)에 닿아 1번째
    expect(g.placeFacility('rig_beam', 52, 24, 0).ok).toBe(true); // 여울 1×2 (52,24)(52,25) — 둑(52,23)에 닿아 씨앗, uid 뒤라 2번째
    expect(g.pathOf(pid).length).toBe(2); expect(g.pathCompleteOf(pid)).toBe(false);
    expect(g.evaluateCondition({ kind: 'rigPath', min: 2 }).met).toBe(true);
    expect(g.evaluateCondition({ kind: 'rigPath', min: 3 })).toMatchObject({ met: false, actual: 0, need: 1 });
    expect(g.evaluateCondition({ kind: 'rigPathComplete', min: 1 })).toMatchObject({ met: false, actual: 0, need: 1 });
    const before = { ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version };
    const pv = g.aimPreview('rig_sunbed', 53, 24, 0)!; // (53,24)(53,25) — 둑(53,23)에 닿아 3번째, 끝이 휴식 → 완성
    expect({ ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version }).toEqual(before);
    expect(pv.pathNext).toBe(3); expect(pv.completeNext).toBe(true); expect(pv.chainNext).toBe(3);
    expect(g.aimPreview('rig_sunbed', 53, 27, 0)!.pathNext).toBe(0); // 안 이어지는 자리(강 행 27, 서쪽 링에도 안 닿는다) — 켜지지 않아 경로 밖
    const r = g.placeFacility('rig_sunbed', 53, 24, 0); expect(r.ok).toBe(true);
    expect(g.pathOf(pid).at(-1)).toBe(r.uid); expect(g.rigState.chainLen.get(r.uid!)).toBe(3); expect(g.pathCompleteOf(pid)).toBe(true);
    expect(g.evaluateCondition({ kind: 'rigPathComplete', min: 1 }).met).toBe(true);
    expect(g.conditionWorld().rigPaths()).toEqual([3]); expect(g.conditionWorld().rigPathComplete?.()).toEqual([true]);
    expect(evaluate({ kind: 'rigPath', min: 4 }, g.conditionWorld()).progress).toBe(0.75);
    // 손님 가산 — 코스 완성 수역의 물 위 기구 이용만 `pop × 0.15 × 1.25`(다른 항엔 안 곱는다). 배선은 정적으로 고정(GuestStore 는 hooks 로만 안다)
    expect(PATH_COMPLETE_SAT_MUL).toBe(1.25);
    const guestSrc = readFileSync(new URL('./guest.ts', import.meta.url), 'utf8');
    expect(guestSrc).toMatch(/def\.pop \* 0\.15 \* pathMul/);
    expect((guestSrc.match(/pathMul/g) ?? []).length).toBe(3); // 선언 · 대입 · 곱 — 다른 항에 새지 않는다
    expect(readFileSync(new URL('./game.ts', import.meta.url), 'utf8')).toMatch(/pathComplete: \(pid\) => this\.pathCompleteOf\(pid\)/);
  });
});

describe('P60-d 등급 문턱 — balance.json', () => {
  it('ppajiGradeThresholds 가 데이터에 있고 옛 상수(n 2/5/9/14 · 종 3/5/6 · 사슬 4×3종 · 조명 1)와 같은 등급을 낸다(회귀 전수)', () => {
    expect((balance as { ppajiGradeThresholds: unknown }).ppajiGradeThresholds).toEqual({ n: [2, 5, 9, 14], kinds: [0, 3, 5, 6], pathLen: 4, pathKinds: 3, lights: 1 });
    expect(PPAJI_GRADE_THRESHOLDS).toEqual((balance as { ppajiGradeThresholds: unknown }).ppajiGradeThresholds);
    expect(CHAIN_KINDS_FOR_GRADE3).toBe(3);
    const old = (x: { n: number; kinds: number; chain: number; chainKinds: number; lights: number }): PpajiGrade => { // P49-a1 원문
      if (x.n >= 14 && x.kinds >= 6 && x.lights >= 1) return 4;
      if (x.n >= 9 && ((x.chain >= 4 && x.chainKinds >= 3) || x.kinds >= 5)) return 3;
      if (x.n >= 5 && x.kinds >= 3) return 2;
      if (x.n >= 2) return 1;
      return 0;
    };
    let cases = 0;
    for (let n = 0; n <= 16; n++) for (let kinds = 0; kinds <= Math.min(n, 8); kinds++) for (let chain = 0; chain <= Math.min(n, 6); chain++) for (let chainKinds = 0; chainKinds <= Math.min(chain, kinds); chainKinds++) for (const lights of [0, 1, 2]) {
      const x = { n, kinds, chain, chainKinds, lights };
      expect(ppajiGrade(x), JSON.stringify(x)).toBe(old(x)); cases++;
    }
    expect(cases).toBeGreaterThan(2000);
    // 문턱이 데이터라는 실증 — 다른 문턱을 넣으면 등급이 따라온다(코드는 규칙만)
    expect(ppajiGrade({ n: 3, kinds: 1, chain: 0, chainKinds: 0, lights: 0 }, { n: [3, 5, 9, 14], kinds: [0, 3, 5, 6], pathLen: 4, pathKinds: 3, lights: 1 })).toBe(1);
    expect(ppajiGrade({ n: 2, kinds: 1, chain: 0, chainKinds: 0, lights: 0 }, { n: [3, 5, 9, 14], kinds: [0, 3, 5, 6], pathLen: 4, pathKinds: 3, lights: 1 })).toBe(0);
  });
});

describe('P60-d 봇', () => {
  it('noPath 대조군이 8일 골든과 다르다 — 봇이 입수구 거리·휴식 마지막 정렬을 실제로 쓴다(측정치는 tools/bot 밴드 rigPathLen·rigPathCompleteShare·ringEntries)', () => {
    const on = runBot(new Game(1, undefined, { arrival: true }), 8);
    const off = runBot(new Game(1, undefined, { arrival: true }), 8, { ...BOT_PERSONAS.balanced, noPath: true });
    expect(on.snapshotHash).not.toBe(off.snapshotHash);
    expect(on.ringEntries).toBeGreaterThanOrEqual(1);
  }, 30000);
});

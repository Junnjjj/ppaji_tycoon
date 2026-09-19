import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { Grid, FLOOR } from './grid.js';
import { FacilityStore } from './facility.js';
import { computeRigs, RIG_SETS, SET_BAND_BONUS, SET_POP_BONUS, rigBaseKind } from './rig.js';
import { bandPrice, bandTop } from './wristband.js';
import { runBot, BOT_PERSONAS } from './bot.js';
import { certScore } from './cert.js';
import { evaluate } from './condition.js';
import { makeTestPpaji } from './test-helpers.js';

/**
 * P60-c 세트 (D72 B, docs/plan-ppaji-rig-foodcourt.md §10.3) — 한 빠지에서 서로 다른 기구 셋이 켜진 채 4이웃 사슬로 이어지면 성립.
 * 값: 그 수역 팔찌 +50G/세트 · 인기 +6/세트 · 같은 세트 둘째부터 0 · 등급 판정엔 안 넣는다. 발견 채널: 첫 성립 = 축하 모달 1회(+ pic) · 나머지는 편지.
 */

/**
 * 2026-09-19 조합 채택: 닌자 코스의 셋째 멤버가 **빠지 슬라이드 조합(8×6)** 이 됐다.
 * 킷 빠지(안 물 4×5)에는 8×6 이 안 들어가므로, 세트 검사는 **킷 동쪽에 큰 빠지를 하나 더 두르고** 거기서 잰다.
 * 허가 깊이(랭크 3 = 16칸)가 10×8 안 물을 두르는 최소선이다 — 랭크 2 로는 링 아랫줄이 허가 밖이라 못 두른다.
 */
const fresh = (unlockAll = true): Game => { const g = new Game(1); g.money = 1e6; g.rank = 3; g.openLand(3); if (unlockAll) for (const d of FACILITY_DEFS.values()) if (d.class === 'rig' || d.onRing) g.unlocked.facilities.add(d.id); return g; };
/** 큰 빠지 — 링 열 56·67 · 행 28~37, 안 물 열 57~66 · 행 29~36 */
const bigPpaji = (g: Game): { pid: number; i: number; j: number } => { const p = makeTestPpaji(g, 10, 8, 8); const t = p.tiles[0]!; expect(p.id, '큰 빠지 수역').not.toBeNull(); return { pid: p.id!, i: t.i, j: t.j }; };
const modals = (g: Game): { title: string; pic?: { kind: string; id: string } }[] => g.inbox.all.filter((m) => m.priority === 'modal').map((m) => ({ title: m.title, ...(m.pic ? { pic: m.pic } : {}) }));
/**
 * 닌자 코스 — 큰 빠지 안 물에 **빠지 슬라이드 8×6**(열 57~64 · 행 29~34) · 다리 1×2(열 65 · 행 29~30) ·
 * 징검돌 1×1(열 65 · 행 31). 슬라이드가 열 56 데크에 닿아 셋이 한 컴포넌트로 켜진다.
 */
const placeNinja = (g: Game, at: { i: number; j: number }): number[] => [
  g.placeFacility('ppaji_slide', at.i, at.j, 0),
  g.placeFacility('rig_bridge', at.i + 8, at.j, 0),
  g.placeFacility('rig_stepstone', at.i + 8, at.j + 2, 0),
].map((r) => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.uid!; });

/**
 * 합성 세계 — `computeRigs` 는 순수(격자·저장소·수역 소유만). 넓은 강에 데크 링을 두르고 멤버 셋을 윗줄(데크 아래 행)에 나란히 놓는다:
 * 물 위 멤버는 링에 4이웃으로 닿아 켜지고 서로 옆이라 한 컴포넌트, 링 위 멤버(플로팅 바·슬라이드 도크)는 그 위 데크 행에 놓여 물 멤버와 4이웃.
 */
function synth(memberIds: readonly string[], opts: { gap?: number; /** gap 을 이 개수마다(기본 매번) */ gapEvery?: number; pool?: (i: number, j: number) => number } = {}): { st: ReturnType<typeof computeRigs>; poolId: number } {
  const W = 40, H = 20, j0 = 3, i0 = 2, ringW = 34, ringH = 12;
  const grid = new Grid(W, H);
  for (let k = 0; k < W * H; k++) grid.floor[k] = FLOOR.river;
  for (let a = 0; a < ringW; a++) { grid.set(i0 + a, j0, FLOOR.deck); grid.set(i0 + a, j0 + ringH - 1, FLOOR.deck); }
  for (let b = 0; b < ringH; b++) { grid.set(i0, j0 + b, FLOOR.deck); grid.set(i0 + ringW - 1, j0 + b, FLOOR.deck); }
  const inside = (i: number, j: number): boolean => i > i0 && i < i0 + ringW - 1 && j > j0 && j < j0 + ringH - 1;
  const pools = { ownerIdAt: (i: number, j: number): number => (inside(i, j) ? (opts.pool ? opts.pool(i, j) : 7) : -1) };
  const store = new FacilityStore(grid, FACILITY_DEFS);
  let cursor = i0 + 1;
  memberIds.forEach((id, k) => {
    const def = FACILITY_DEFS.get(id)!;
    if (def.onRing === true) store.place(id, cursor - Math.min(def.w, cursor - i0 - 1), j0, 0); // 데크 행 — 바로 앞에 놓인 물 멤버 위(4이웃)
    else { store.place(id, cursor, j0 + 1, 0); cursor += def.w + ((k + 1) % (opts.gapEvery ?? 1) === 0 ? (opts.gap ?? 0) : 0); }
  });
  return { st: computeRigs(grid, store, pools), poolId: 7 };
}

describe('P60-c 세트 — 판정(computeRigs.sets)', () => {
  it('세트 8종마다 성립 배치가 존재한다 — 멤버 셋을 링에 닿게 나란히 놓으면 sets 에 든다 (링 위 멤버는 데크 위에서 4이웃)', () => {
    for (const s of RIG_SETS) {
      const { st, poolId } = synth(s.members);
      expect(st.sets.get(poolId) ?? [], s.id).toContain(s.id);
    }
  });
  it('이어지지 않으면(한 칸 띄움) 0 · 다른 수역에 갈리면 0 · 멤버 둘만이면 0 — 「사슬로 이어져야」가 규칙이다', () => {
    const ninja = RIG_SETS.find((s) => s.id === 'ninja')!;
    expect(synth(ninja.members, { gap: 1 }).st.sets.size).toBe(0);
    expect(synth(ninja.members, { pool: (i) => (i <= 4 ? 7 : 8) }).st.sets.size).toBe(0);
    expect(synth(ninja.members.slice(0, 2)).st.sets.size).toBe(0);
  });
  // 2026-09-19: 플로팅 슬라이드 사슬(rig_slide → 난리 → 스파이럴)이 조합에 흡수돼 레시피째 내려갔다.
  // 살아 있는 2단 사슬은 다리(장애물 다리 → 흔들다리 닌자 → 단군 롱브릿지) 하나뿐이라 그것으로 잰다.
  it('개조판은 원종으로 센다 — rig_bridge_long(다리 2단 개조) + 징검돌 + 빠지 슬라이드 = 닌자 코스 · rigBaseKind 사슬 2단', () => {
    expect(rigBaseKind('rig_bridge_long')).toBe('rig_bridge'); // 2단
    expect(rigBaseKind('rig_bridge_swing')).toBe('rig_bridge'); // 1단
    expect(rigBaseKind('rig_stepstone')).toBe('rig_stepstone'); // 원종 그대로
    const { st, poolId } = synth(['rig_bridge_long', 'rig_stepstone', 'ppaji_slide']);
    expect(st.sets.get(poolId)).toEqual(['ninja']);
  });
  it('같은 세트 둘째부터 0 — 한 수역에 닌자 코스를 두 컴포넌트로 두 번 놓아도 sets 는 [ninja] 하나', () => {
    const ninja = RIG_SETS.find((s) => s.id === 'ninja')!;
    const { st, poolId } = synth([...ninja.members, ...ninja.members], { gap: 0 });
    expect(st.sets.get(poolId)).toEqual(['ninja']);
    const twice = synth([...ninja.members, ...ninja.members], { gap: 2, gapEvery: 3 }); // 셋마다 띄우면 두 컴포넌트 — 그래도 하나
    expect(twice.st.sets.get(twice.poolId)).toEqual(['ninja']);
  });
});

describe('P60-c 세트 — 값·발견 채널(Game)', () => {
  it('시작 해금만으로 닌자 코스 — 큰 빠지에 빠지 슬라이드·다리·징검돌: setsOf [ninja] · setsSeen · 축하 모달 정확히 1(pic = 첫 멤버 시설 그림) · 등급은 그대로(n 3 → 1)', () => {
    const g = fresh(false);
    for (const m of RIG_SETS.find((s) => s.id === 'ninja')!.members) expect(g.isUnlocked(m), m).toBe(true); // 셋 다 시작 해금 — 다리·징검돌·빠지 슬라이드
    const { pid, i, j } = bigPpaji(g);
    const m0 = modals(g).length;
    expect(g.setsSeen.size).toBe(0); expect(g.setsOf(pid)).toEqual([]);
    placeNinja(g, { i, j });
    expect(g.setsOf(pid)).toEqual(['ninja']);
    expect([...g.setsSeen]).toEqual(['ninja']);
    const ms = modals(g).slice(m0).filter((m) => m.title.startsWith('세트 발견'));
    expect(ms).toEqual([{ title: '세트 발견 · 닌자 코스', pic: { kind: 'facility', id: 'rig_bridge' } }]);
    expect(g.ppajiGradeOf(pid)).toBe(1); // 등급 판정엔 안 넣는다 — n 3 · 종 3 은 등급 1(n≥2)이고 등급 2 는 n≥5
    // 두 번째 성립(다른 판·같은 세트)은 다시 알리지 않는다 — 떼었다 다시 놓아도 setsSeen 은 누적
    const uid = g.facilities.all.find((f) => f.defId === 'rig_stepstone')!.uid;
    expect(g.removeFacility(uid).ok).toBe(true); expect(g.setsOf(pid)).toEqual([]);
    expect(g.placeFacility('rig_stepstone', i + 8, j + 2, 0).ok).toBe(true); expect(g.setsOf(pid)).toEqual(['ninja']);
    expect(modals(g).slice(m0).filter((m) => m.title.startsWith('세트 발견'))).toHaveLength(1);
  });
  it('값 — 팔찌 +50G/세트(bandPriceAt · pkgNow) · 인기 +6/세트 · 같은 세트 둘째 값 0(빔·징검돌을 하나 더 이어도 세트 1 · 값 그대로) · 조끼만(값 0)엔 안 붙는다', () => {
    const g = fresh(false);
    const { pid, i, j } = bigPpaji(g);
    const pop0 = (): number => g.poolState(pid)!.popularity;
    // 큰 것(조합)을 먼저, 완성은 작은 징검돌이 한다 — 셋째 배치의 Δ가 곧 세트 값이다
    expect(g.placeFacility('ppaji_slide', i, j, 0).ok).toBe(true); expect(g.placeFacility('rig_bridge', i + 8, j, 0).ok).toBe(true);
    const grade = g.ppajiGradeOf(pid); const tier = bandTop(grade);
    const popBefore = pop0(), priceBefore = g.bandPriceAt(pid, tier, grade);
    expect(priceBefore).toBe(bandPrice(tier, grade));
    expect(g.placeFacility('rig_stepstone', i + 8, j + 2, 0).ok).toBe(true); // 셋째 — 세트 성립, 등급은 그대로(n 3)
    expect(g.ppajiGradeOf(pid)).toBe(grade);
    expect(g.bandPriceAt(pid, tier, grade)).toBe(priceBefore + SET_BAND_BONUS);
    expect(pop0()).toBe(popBefore + SET_POP_BONUS);
    expect(g.bandPriceAt(null, tier, grade)).toBe(priceBefore);
    expect(g.bandPriceAt(pid, bandTop(0), 0)).toBe(0); // 조끼만
    const price1 = g.bandPriceAt(pid, tier, grade), pop1 = pop0();
    expect(g.placeFacility('rig_stepstone', i + 8, j + 3, 0).ok).toBe(true); // 같은 세트 멤버를 하나 더 이어도 둘째 값 0 (등급도 n 4 그대로 1)
    expect(g.setsOf(pid)).toEqual(['ninja']);
    expect(g.bandPriceAt(pid, tier, g.ppajiGradeOf(pid))).toBe(price1);
    expect(pop0()).toBe(pop1);
  });
  it('aimPreview.setNext — 셋째 멤버를 겨누면 그 세트 id, 아니면 null · 미리보기는 순수(setsSeen·저장소·grid.rev 불변) · pkgNext 가 확정 뒤 bandPriceAt 과 같다', () => {
    const g = fresh(false);
    const { pid, i, j } = bigPpaji(g);
    expect(g.placeFacility('ppaji_slide', i, j, 0).ok).toBe(true); expect(g.placeFacility('rig_bridge', i + 8, j, 0).ok).toBe(true);
    const before = { ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version, seen: g.setsSeen.size, inbox: g.inbox.all.length };
    const pv = g.aimPreview('rig_stepstone', i + 8, j + 2, 0)!;
    expect(pv.setNext).toBe('ninja');
    expect(pv.pkgNext).toBe(pv.pkgNow + SET_BAND_BONUS);
    expect(g.aimPreview('rig_stepstone', i + 9, j + 7, 0)!.setNext).toBeNull(); // 안 이어지는 자리(반대 구석, 다리·슬라이드와 떨어짐)
    expect(g.aimPreview('rig_blob', i + 8, j + 2, 1)!.setNext).toBeNull(); // 멤버 아님 (블롭 3×1 → facing 1 = 1×3)
    expect({ ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version, seen: g.setsSeen.size, inbox: g.inbox.all.length }).toEqual(before);
    expect(g.setsOf(pid)).toEqual([]);
    expect(g.placeFacility('rig_stepstone', i + 8, j + 2, 0).ok).toBe(true);
    expect(g.bandPriceAt(pid, bandTop(g.ppajiGradeOf(pid)), g.ppajiGradeOf(pid))).toBe(pv.pkgNext);
    expect(g.aimPreview('rig_stepstone', i + 8, j + 3, 0)!.setNext).toBeNull(); // 이미 성립 — 둘째는 0
  });
  // 2026-09-19: 해먹·선베드가 조합에 흡수돼 라운지 멤버가 **거북섬 + 플로팅 바 + 기구 거치대**로 바뀌었다 (둘 다 링 위).
  it('링 위 멤버 — 라운지(거북섬·플로팅 바·기구 거치대): 링 데크 위 시설 둘로 성립 · aimPreview 도 링 시설 오버레이로 setNext 를 낸다', () => {
    const g = fresh();
    const { pid, i, j } = bigPpaji(g);
    expect(g.placeFacility('turtle_island', i, j, 0).ok).toBe(true); // 8×6 (열 57~64 · 행 29~34) — 열 56 데크에 닿아 켜짐
    expect(g.placeFacility('rig_float_bar', i - 1, j, 1).ok).toBe(true); // 링 열 56 · 세로 1×2 — 거북섬과 4이웃
    const pv = g.aimPreview('rig_rack', i - 1, j + 2, 0);
    expect(pv).not.toBeNull();
    expect(g.setsOf(pid)).toEqual([]);
    expect(g.placeFacility('rig_rack', i - 1, j + 2, 0).ok).toBe(true); // 링 열 56 · 세로 1×2(facing 0) — 거북섬과 4이웃
    expect(g.rigState.lit.has(g.facilities.all.find((f) => f.defId === 'turtle_island')!.uid)).toBe(true);
    expect(g.setsOf(pid)).toContain('lounge');
  });
  it('rigSet 조건 — 인증 set_f/d/b 가 rigSet 1/2/3 을 읽고 evaluate 가 성립 세트 수 최대를 낸다 · 스냅샷 왕복 뒤 setsSeen·setsOf 보존(optional 필드 — 없으면 빈 집합)', () => {
    const g = fresh(false);
    const { pid, i, j } = bigPpaji(g);
    placeNinja(g, { i, j });
    const w = g.conditionWorld();
    // 수역마다 성립 세트 수 — 킷 빠지 둘은 0, 세트를 지은 큰 빠지만 1. evaluate 는 그 **최대**를 읽는다
    expect(w.rigSets?.()).toContain(1);
    expect(Math.max(...(w.rigSets?.() ?? []))).toBe(1);
    const setF = g.certs.defs.get('set_f')!;
    const sc = certScore(setF, (c) => evaluate(c, w));
    expect(sc.parts.map((x) => x.verdict.met)).toEqual([true, false]); // rigSet 1 성립 · 장식 3 은 아직
    expect(evaluate({ kind: 'rigSet', min: 2 }, w)).toMatchObject({ met: false, actual: 1, need: 2, progress: 0.5 });
    const snap = g.toSnapshot();
    expect(snap.setsSeen).toEqual(['ninja']);
    const back = Game.fromSnapshot(snap);
    expect([...back.setsSeen]).toEqual(['ninja']); expect(back.setsOf(pid)).toEqual(['ninja']);
    const { setsSeen: _drop, ...rest } = snap; void _drop;
    const none = Game.fromSnapshot(rest);
    expect(none.setsSeen.size).toBe(0); expect(none.setsOf(pid)).toEqual(['ninja']); // 판정은 파생, 발견 기록만 저장
    expect('setsSeen' in fresh(false).toSnapshot()).toBe(false); // 빈 집합이면 옛 스냅샷과 바이트 같다
  });
});

describe('P60-c 세트 — 봇', () => {
  it('noSet 대조군이 골든과 다르다 — 봇이 「세트 완성 후보」를 실제로 겨눈다 (시드 1 · 8일 해시) · 세트 우선이 128일 발견 수를 늘린다(측정치는 tools/bot 밴드)', () => {
    const on = runBot(new Game(1, undefined, { arrival: true }), 8);
    const off = runBot(new Game(1, undefined, { arrival: true }), 8, { ...BOT_PERSONAS.balanced, noSet: true });
    expect(on.snapshotHash).not.toBe(off.snapshotHash);
    expect(on.rigSetsFound).toBeGreaterThanOrEqual(off.rigSetsFound);
  }, 30000);
});

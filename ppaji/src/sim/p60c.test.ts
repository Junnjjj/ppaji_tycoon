import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { Grid, FLOOR } from './grid.js';
import { FacilityStore } from './facility.js';
import { computeRigs, RIG_SETS, SET_BAND_BONUS, SET_POP_BONUS, rigBaseKind } from './rig.js';
import { bandPrice, bandTop } from './wristband.js';
import { runBot, BOT_PERSONAS } from './bot.js';
import { certScore } from './cert.js';
import { evaluate } from './condition.js';

/**
 * P60-c 세트 (D72 B, docs/plan-ppaji-rig-foodcourt.md §10.3) — 한 빠지에서 서로 다른 기구 셋이 켜진 채 4이웃 사슬로 이어지면 성립.
 * 값: 그 수역 팔찌 +50G/세트 · 인기 +6/세트 · 같은 세트 둘째부터 0 · 등급 판정엔 안 넣는다. 발견 채널: 첫 성립 = 축하 모달 1회(+ pic) · 나머지는 편지.
 */

/** 킷 빠지 — 링 열 50·55 · 행 24~29, 안 물 열 51~54 · 행 24~28(24~25 여울 · 26~28 강) */
const fresh = (unlockAll = true): Game => { const g = new Game(1); g.money = 1e6; if (unlockAll) for (const d of FACILITY_DEFS.values()) if (d.class === 'rig' || d.onRing) g.unlocked.facilities.add(d.id); return g; };
const modals = (g: Game): { title: string; pic?: { kind: string; id: string } }[] => g.inbox.all.filter((m) => m.priority === 'modal').map((m) => ({ title: m.title, ...(m.pic ? { pic: m.pic } : {}) }));
/** 닌자 코스 — 여울 행 24~25: 다리(51,24)↓ · 빔(52,24)↓ · 징검돌(53,24) 이 한 줄로 이어진다(다리가 열 50 데크에 닿아 셋 다 켜진다) */
const placeNinja = (g: Game, i0 = 51): number[] => [g.placeFacility('rig_bridge', i0, 24, 0), g.placeFacility('rig_beam', i0 + 1, 24, 0), g.placeFacility('rig_stepstone', i0 + 2, 24, 0)].map((r) => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.uid!; });

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
  it('개조판은 원종으로 센다 — rig_bridge_long(다리 2단 개조) + 빔 + 징검돌 = 닌자 코스 · rigBaseKind 사슬 2단', () => {
    expect(rigBaseKind('rig_bridge_long')).toBe('rig_bridge'); expect(rigBaseKind('rig_slide3')).toBe('rig_slide'); expect(rigBaseKind('rig_stepstone')).toBe('rig_stepstone');
    const { st, poolId } = synth(['rig_bridge_long', 'rig_beam', 'rig_stepstone']);
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
  it('시작 7종만으로 닌자 코스 — 킷 빠지에 다리·빔·징검돌: setsOf [ninja] · setsSeen · 축하 모달 정확히 1(pic = 첫 멤버 시설 그림) · 등급은 그대로(n 3 → 1)', () => {
    const g = fresh(false);
    for (const m of RIG_SETS.find((s) => s.id === 'ninja')!.members) expect(g.isUnlocked(m), m).toBe(true);
    const pid = g.pools.all[0]!.id;
    const m0 = modals(g).length;
    expect(g.setsSeen.size).toBe(0); expect(g.setsOf(pid)).toEqual([]);
    placeNinja(g);
    expect(g.setsOf(pid)).toEqual(['ninja']);
    expect([...g.setsSeen]).toEqual(['ninja']);
    const ms = modals(g).slice(m0).filter((m) => m.title.startsWith('세트 발견'));
    expect(ms).toEqual([{ title: '세트 발견 · 닌자 코스', pic: { kind: 'facility', id: 'rig_bridge' } }]);
    expect(g.ppajiGradeOf(pid)).toBe(1); // 등급 판정엔 안 넣는다 — n 3 · 종 3 은 등급 1(n≥2)이고 등급 2 는 n≥5
    // 두 번째 성립(다른 판·같은 세트)은 다시 알리지 않는다 — 떼었다 다시 놓아도 setsSeen 은 누적
    const uid = g.facilities.all.find((f) => f.defId === 'rig_stepstone')!.uid;
    expect(g.removeFacility(uid).ok).toBe(true); expect(g.setsOf(pid)).toEqual([]);
    expect(g.placeFacility('rig_stepstone', 53, 24, 0).ok).toBe(true); expect(g.setsOf(pid)).toEqual(['ninja']);
    expect(modals(g).slice(m0).filter((m) => m.title.startsWith('세트 발견'))).toHaveLength(1);
  });
  it('값 — 팔찌 +50G/세트(bandPriceAt · pkgNow) · 인기 +6/세트 · 같은 세트 둘째 값 0(빔·징검돌을 하나 더 이어도 세트 1 · 값 그대로) · 조끼만(값 0)엔 안 붙는다', () => {
    const g = fresh(false);
    const pid = g.pools.all[0]!.id;
    const pop0 = (): number => g.poolState(pid)!.popularity;
    expect(g.placeFacility('rig_bridge', 51, 24, 0).ok).toBe(true); expect(g.placeFacility('rig_beam', 52, 24, 0).ok).toBe(true);
    const grade = g.ppajiGradeOf(pid); const tier = bandTop(grade);
    const popBefore = pop0(), priceBefore = g.bandPriceAt(pid, tier, grade);
    expect(priceBefore).toBe(bandPrice(tier, grade));
    expect(g.placeFacility('rig_stepstone', 53, 24, 0).ok).toBe(true); // 셋째 — 세트 성립, 등급은 그대로(n 3)
    expect(g.ppajiGradeOf(pid)).toBe(grade);
    expect(g.bandPriceAt(pid, tier, grade)).toBe(priceBefore + SET_BAND_BONUS);
    expect(pop0()).toBe(popBefore + SET_POP_BONUS);
    expect(g.bandPriceAt(null, tier, grade)).toBe(priceBefore);
    expect(g.bandPriceAt(pid, bandTop(0), 0)).toBe(0); // 조끼만
    const price1 = g.bandPriceAt(pid, tier, grade), pop1 = pop0();
    expect(g.placeFacility('rig_stepstone', 54, 24, 0).ok).toBe(true); // 같은 세트 멤버를 하나 더 이어도 둘째 값 0 (등급도 n 4 그대로 1)
    expect(g.setsOf(pid)).toEqual(['ninja']);
    expect(g.bandPriceAt(pid, tier, g.ppajiGradeOf(pid))).toBe(price1);
    expect(pop0()).toBe(pop1);
  });
  it('aimPreview.setNext — 셋째 멤버를 겨누면 그 세트 id, 아니면 null · 미리보기는 순수(setsSeen·저장소·grid.rev 불변) · pkgNext 가 확정 뒤 bandPriceAt 과 같다', () => {
    const g = fresh(false);
    const pid = g.pools.all[0]!.id;
    expect(g.placeFacility('rig_bridge', 51, 24, 0).ok).toBe(true); expect(g.placeFacility('rig_beam', 52, 24, 0).ok).toBe(true);
    const before = { ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version, seen: g.setsSeen.size, inbox: g.inbox.all.length };
    const pv = g.aimPreview('rig_stepstone', 53, 24, 0)!;
    expect(pv.setNext).toBe('ninja');
    expect(pv.pkgNext).toBe(pv.pkgNow + SET_BAND_BONUS);
    expect(g.aimPreview('rig_stepstone', 53, 27, 0)!.setNext).toBeNull(); // 안 이어지는 자리(강 행 27, 빔과 떨어짐)
    expect(g.aimPreview('rig_seesaw', 53, 24, 0)!.setNext).toBeNull(); // 멤버 아님
    expect({ ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version, seen: g.setsSeen.size, inbox: g.inbox.all.length }).toEqual(before);
    expect(g.setsOf(pid)).toEqual([]);
    expect(g.placeFacility('rig_stepstone', 53, 24, 0).ok).toBe(true);
    expect(g.bandPriceAt(pid, bandTop(g.ppajiGradeOf(pid)), g.ppajiGradeOf(pid))).toBe(pv.pkgNext);
    expect(g.aimPreview('rig_stepstone', 54, 24, 0)!.setNext).toBeNull(); // 이미 성립 — 둘째는 0
  });
  it('링 위 멤버 — 라운지(해먹·선베드·플로팅 바): 플로팅 바를 링 데크에 놓아 성립 · aimPreview 도 링 시설 오버레이로 setNext 를 낸다', () => {
    const g = fresh();
    const pid = g.pools.all[0]!.id;
    expect(g.placeFacility('rig_hammock', 51, 24, 1).ok).toBe(true); // 해먹은 여울용 2×3 — 세로로 놓으면 강 행 26 에 걸리니 facing 1 (3×2, 열 51~53 · 행 24~25, 열 50 데크에 닿아 켜짐)
    expect(g.placeFacility('rig_sunbed', 54, 24, 0).ok).toBe(true); // 1×2 (54,24)(54,25) — 열 55 데크에 닿아 켜짐
    const pv = g.aimPreview('rig_float_bar', 55, 24, 0);
    expect(pv).not.toBeNull();
    expect(g.setsOf(pid)).toEqual([]);
    expect(g.placeFacility('rig_float_bar', 55, 24, 1).ok).toBe(true); // 링 열 55 · 세로 1×2 (55,24)(55,25) — 선베드와 4이웃
    expect(g.rigState.lit.has(g.facilities.all.find((f) => f.defId === 'rig_hammock')!.uid)).toBe(true);
    expect(g.setsOf(pid)).toContain('lounge');
  });
  it('rigSet 조건 — 인증 set_f/d/b 가 rigSet 1/2/3 을 읽고 evaluate 가 성립 세트 수 최대를 낸다 · 스냅샷 왕복 뒤 setsSeen·setsOf 보존(optional 필드 — 없으면 빈 집합)', () => {
    const g = fresh(false);
    const pid = g.pools.all[0]!.id;
    placeNinja(g);
    const w = g.conditionWorld();
    expect(w.rigSets?.()).toEqual([1]);
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

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from './game.js';
import { FLOOR } from './grid.js';
import { computeRigs } from './rig.js';
import { makeTestPpaji } from './test-helpers.js';

/** 킷 빠지 — 링 열 50~55 · 안 물 열 51~54 행 24~28 (행 24~25 여울 · 26~28 강). 데크에 4이웃으로 닿는 물 칸은 열 51·54 와 행 24·28 */
const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const id of ['rig_stepstone', 'rig_bridge', 'rig_beam', 'rig_blob', 'rig_disc', 'watchtower', 'rig_float_bar', 'rescue_dock']) g.unlocked.facilities.add(id); return g; };
const fail = (g: Game, id: string, i: number, j: number, facing: 0 | 1 = 0): string => g.facilities.probeForTest(id, i, j, facing, g.land, g.gate, g.permitDepth, g.waterRules);

describe('P50-a 물 위 배치 · 켜짐 · open · 술어 하나', () => {
  it('WaterRules — 물 위 기구는 빠지 안 물에만(잔디·데크·본류 not-on-ppaji) · 깊이 불일치 · 링 시설은 링(데크 ∨ 물가 뭍)에만 · 링 시설의 깊이는 4이웃 물', () => {
    const g = fresh();
    expect(fail(g, 'rig_stepstone', 30, 22)).toBe('not-on-ppaji'); // 잔디
    expect(fail(g, 'rig_stepstone', 50, 26)).toBe('not-on-ppaji'); // 링 데크
    expect(fail(g, 'rig_stepstone', 57, 27)).toBe('not-on-ppaji'); // 본류 — 허가 안이어도 빠지 밖
    expect(fail(g, 'rig_stepstone', 51, 26)).toBe('ok');
    expect(fail(g, 'rig_beam', 51, 24, 1)).toBe('ok'); // 여울용 1×2 세로 — 행 24~25 여울
    expect(fail(g, 'rig_beam', 51, 26, 1)).toBe('depth-mismatch'); // 행 26~27 강
    expect(fail(g, 'rig_blob', 51, 27)).toBe('ok'); // 깊은 물용 3×1 — 행 27 강
    expect(fail(g, 'rig_blob', 51, 25)).toBe('depth-mismatch');
    expect(fail(g, 'rig_blob', 51, 24, 1)).toBe('depth-mismatch'); // 세로 1×3 이 여울(24~25)과 강(26)에 걸친다 — 전 칸 일치라야
    expect(fail(g, 'watchtower', 30, 22)).toBe('not-on-ring'); // 잔디(물에 안 닿음)
    expect(fail(g, 'watchtower', 50, 26)).toBe('ok'); // 링 데크
    expect(fail(g, 'watchtower', 51, 23)).toBe('ok'); // 링 위 뭍(행 23, 아래가 물)
    expect(fail(g, 'watchtower', 52, 26)).toBe('not-on-ring'); // 빠지 안 물
    const m = { ...g.facilities.defById('rescue_dock')! };
    expect(m.onRing).toBe(true); // 링 시설의 깊이 규칙은 `depth` 가 있는 링 시설에만 — 데이터엔 없어 4이웃 검사는 통과(회귀 자리)
  });

  it('computeRigs 켜짐 항등 — 링에 4이웃으로 닿은 기구만 씨앗, 켜진 기구끼리 BFS, 떼어 내면 꺼지고 그 위 손님은 뭍으로(evictFrom) · walkOn = 켜진 발자국', () => {
    const g = fresh();
    const a = g.placeFacility('rig_stepstone', 51, 26, 0); expect(a.ok).toBe(true); // 열 50 데크에 닿는다 → 켜짐
    const c = g.placeFacility('rig_stepstone', 53, 27, 0); expect(c.ok).toBe(true); // 고립 → 꺼짐
    expect(g.rigState.lit.has(a.uid!)).toBe(true);
    expect(g.rigState.lit.has(c.uid!)).toBe(false);
    expect(g.facilities.isWalkOn(51, 26)).toBe(true); expect(g.facilities.isWalkOn(53, 27)).toBe(false);
    expect(g.guests.walkable(51, 26)).toBe(true); expect(g.guests.walkable(53, 27)).toBe(false); // 술어 하나 — 켜진 기구 위만 선다
    const b = g.placeFacility('rig_bridge', 52, 26, 0); expect(b.ok).toBe(true); // 1×2 가로 (52,26)(53,26) — a 에 닿고 c 에 닿는다 → 셋 다 켜짐
    expect([a.uid, b.uid, c.uid].every((u) => g.rigState.lit.has(u!))).toBe(true);
    expect(g.rigState.byPool.get(g.pools.all[0]!.id)?.length).toBe(3);
    expect(g.ppajiGradeOf(g.pools.all[0]!.id)).toBe(1); // n 3 · 종 2 → 등급 1 (n≥2) — 등급 2 는 n≥5·종≥3
    // 순수 함수 항등: 저장소를 안 만지고 같은 답
    const st = computeRigs(g.grid, g.facilities, g.pools);
    expect([...st.lit].sort()).toEqual([...g.rigState.lit].sort());
    expect(st.walkOn.reduce((n, v) => n + v, 0)).toBe(4); // 발자국 1 + 2 + 1
    // 다리를 떼면 c 가 꺼진다 — 그 위 손님은 뭍으로
    expect(g.removeFacility(b.uid!).ok).toBe(true);
    expect(g.rigState.lit.has(c.uid!)).toBe(false);
    expect(g.facilities.isWalkOn(53, 27)).toBe(false);
  });

  it('open — 기구 밑 물은 유영·입수·유입에서 빠지고(totalOpenTiles) 인기·허가는 tiles 그대로 · 기구가 수역을 가로질러도 수역 수·칸 수 불변 · 기구 0개 판은 불일치 칸 0', () => {
    const g = fresh();
    const p = g.pools.all[0]!;
    expect(p.tiles.every((k) => g.pools.isOpenK(k))).toBe(true);
    expect(g.pools.totalOpenTiles()).toBe(20);
    const used0 = g.permitUsed, pop0 = g.poolState(p.id)!.popularity;
    expect(g.placeFacility('rig_blob', 51, 27, 0).ok).toBe(true); // 3×1 이 안 물을 가로지른다 (열 51~53, 행 27)
    expect(g.pools.all.length).toBe(1);
    expect(g.pools.totalTiles()).toBe(20);
    expect(g.pools.totalOpenTiles()).toBe(17);
    expect(g.pools.isOpenAt(52, 27)).toBe(false); expect(g.pools.isOpenAt(52, 26)).toBe(true);
    expect(g.pools.openTilesOf(p).length).toBe(17);
    expect(g.permitUsed).toBe(used0); // 허가는 tiles
    expect(g.poolState(p.id)!.popularity).toBeGreaterThanOrEqual(pop0); // 인기는 tiles(× 등급 배율) — 덮어도 안 줄어든다
  });

  it('예외 자리 — 기구·링 시설은 간격(tooClose)·접면(frontage)·자동 길 면제 · 랜드마크 maxPerPark 는 canPlace 한 줄 · 복도 곁 링 점포는 passBy 집합에 안 든다', () => {
    const g = fresh();
    expect(g.canPlace('rig_stepstone', 54, 26, 0, { frontage: true }).ok).toBe(true); // 물 위엔 길이 안 닿는데도 접면 면제
    expect(g.autoPathFor('rig_stepstone', 54, 26, 0)).toBe(0);
    const r = g.placeFacility('rig_stepstone', 54, 26, 0); expect(r.ok).toBe(true); // 동쪽 링(열 55)에 닿는다 — 서쪽 링 열 50 은 아래에서 링 시설 둘이 쓴다(켜진 기구가 링 시설에 가려지면 「손님 길이 막힙니다」가 맞다)
    expect(g.ensurePath(r.uid!)).toBe(0);
    // 링 위 식당(rig_float_bar 2×1)과 링 위 편의(rescue_dock)는 건물류지만 붙어도 된다 — 킷 링 윗줄(행 23 은 뭍·행 24 는 데크): 열 50 데크 세로 두 칸에 나란히
    expect(g.placeFacility('rig_float_bar', 50, 27, 1).ok).toBe(true); // 2×1 을 facing 1 로 세워 (50,27)(50,28) 링 데크
    expect(g.canPlace('rescue_dock', 55, 27, 0).ok).toBe(true); // 건너편 링 (1×2 는 facing 0 이 세로) — 붙지 않았지만 규칙상 면제라 어디든 된다
    const r2 = g.placeFacility('rescue_dock', 50, 25, 0); expect(r2.ok, JSON.stringify(r2)).toBe(true); // (50,25)(50,26) — 식당(50,27) 과 변이 닿는다 → D58 이면 거절이었을 자리
    // 랜드마크
    expect(g.placeFacility('rig_disc', 51, 27, 0).ok).toBe(true); // 2×2 깊은 물 (51~52, 27~28)
    const dup = g.canPlace('rig_disc', 53, 27, 0); expect(dup.ok).toBe(false); expect(why(dup)).toContain('판에 1개까지');
    // passBy — 링 위 점포의 진입 칸은 데크·물이라 실내 코드가 아니다 → 집합 밖
    const sets = (g as unknown as { passBySets: { enter: Set<number>; leave: Set<number> } }).passBySets;
    const bar = g.facilities.all.find((f) => f.defId === 'rig_float_bar')!;
    expect(sets.enter.has(bar.uid) || sets.leave.has(bar.uid)).toBe(false);
  });

  it('정적 — 「손님이 설 수 있는 칸」 술어는 guestWalkable 하나: guest.ts · game.ts ×2 가 같은 문자열로 부르고 옛 복사본(isWalkFloor ∧ !occupied)은 0', () => {
    const guest = readFileSync(new URL('./guest.ts', import.meta.url), 'utf8');
    const game = readFileSync(new URL('./game.ts', import.meta.url), 'utf8');
    const call = 'guestWalkable(this.grid, this.facilities, i, j)';
    expect(guest.split(call).length - 1).toBe(1);
    expect(game.split(call).length - 1).toBe(2);
    const old = /isWalkFloor\(f\) && !this\.facilities\.occupied\(i, j\)/g;
    expect((guest.match(old) ?? []).length + (game.match(old) ?? []).length).toBe(0);
  });

  it('로드 뒤 켜짐·walkOn 이 다시 선다(저장 0) · notePackages ≤ 1ms', () => {
    const g = fresh();
    expect(g.placeFacility('rig_stepstone', 51, 26, 0).ok).toBe(true);
    const snap = JSON.parse(JSON.stringify(g.toSnapshot())) as Record<string, unknown>;
    expect(JSON.stringify(snap)).not.toContain('walkOn');
    const b = Game.fromSnapshot(snap as unknown as Parameters<typeof Game.fromSnapshot>[0]);
    expect([...b.rigState.lit]).toEqual([...g.rigState.lit]);
    expect(b.facilities.isWalkOn(51, 26)).toBe(true);
    expect(b.pools.totalOpenTiles()).toBe(19);
    const np = (g as unknown as { notePackages: () => void }).notePackages.bind(g);
    for (let k = 0; k < 5; k++) np();
    const t0 = process.hrtime.bigint();
    for (let k = 0; k < 20; k++) np();
    expect(Number(process.hrtime.bigint() - t0) / 1e6 / 20).toBeLessThan(1.0 * 4); // CI 여유 ×4
    void makeTestPpaji; void FLOOR;
  });
});
const why = (r: { ok: boolean; reason?: string }): string => (r.ok ? '' : r.reason ?? '');

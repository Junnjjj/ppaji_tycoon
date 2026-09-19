import modules from '../data/ppaji-modules.json';
import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS, RIG_PART_DEFS, RNG_SALTS } from './game.js';
import { ppajiGrade, CHAIN_KINDS_FOR_GRADE3 } from './rig.js';
import { RigStore, RIG_WORDS, RIG_UPGRADES } from './rig-upgrade.js';
import { makeTestPpaji } from './test-helpers.js';
import { Rng } from './rng.js';
import { goalNum } from '../../tools/goal-num.js';
import ranks from '../data/ranks.json';
import certs from '../data/certs.json';

/**
 * P49-a1 골격 (§14 §4.0~4.3·§4.5·§5 소유 첫 행) — 데이터·유니언·필드·키·플래그 전부 + 등급이 인기를 대체(스텁). 기구는 아직 데크 위에만 놓인다(P50-a 가 물 위 규칙을 낸다).
 */
const defs = [...FACILITY_DEFS.values()];
const rigs = defs.filter((d) => d.class === 'rig' && d.buildable !== false); // P51: 개조판(buildable:false)은 따로 센다
const converted = defs.filter((d) => d.buildable === false);
const ring = defs.filter((d) => d.onRing === true && d.class !== 'rig' && d.buildable !== false);

describe('P49-a1 골격', () => {
  // 2026-09-19 승인 조합 채택(정본 29종 폐기): 구성품 14종이 빠지 슬라이드/빠지 놀이터에 흡수되고,
  // 거기 걸려 있던 개조판 14종과 옛 선착장(`dock`, 승하선 데크로 대체)이 같이 내려갔다 = 29.
  // 정의는 남는다 — 옛 세이브의 인스턴스가 조용히 사라지면 지도가 깨진다.
  it('기구 — 살아 있는 rig 10 · buildable:false 35(개조판 6 + 폐기 29) · 링 위 비-rig 11(승하선 데크 포함) · deep 4 전부 needsVest (⇔)', () => {
    expect(rigs.map((d) => d.id)).toEqual(['diving', 'turtle_island', 'ppaji_slide', 'airbounce', 'rig_bridge', 'rig_stepstone', 'rig_blob', 'rig_iceberg', 'rig_jump_tower', 'ppaji_playground', ...modules.filter(m => m.source !== 'rig_led_buoy').map(m => m.id)]);
    expect(defs.filter((d) => d.deprecated === true).length).toBe(29);
    expect(converted.length).toBe(35); // 살아 있는 개조판 6 + 폐기 29 — 둘 다 건설 목록 밖
    expect(ring.map((d) => d.id)).toEqual(['boarding_dock', 'rent_sup', 'rent_duck', 'rent_pedal', 'rent_kayak', 'slide_tube', 'float_deck', 'watchtower', 'rig_rack', 'rig_float_bar', 'rescue_dock', 'module_rig_led_buoy']);
    const deep = rigs.filter((d) => d.depth === 'deep');
    expect(deep.map((d) => d.id)).toEqual(['diving', 'rig_blob', 'rig_iceberg', 'rig_jump_tower', 'module_trampoline_w', 'module_rig_totem', 'module_rig_disc']);
    for (const d of rigs) expect(d.needsVest === true, d.id).toBe(d.depth === 'deep');
  });
  it('해금 분포 — `rig_*`/망루/구조정 9종: 시작 3 · 랭크 5(ranks.json unlocks 와 일치) · 인증 1(id 존재) · 소원 0 · craft 35', () => {
    const news = defs.filter((d) => d.buildable !== false && (d.id.startsWith('rig_') || ['watchtower', 'rescue_dock'].includes(d.id)));
    expect(news.map((d) => d.id)).toEqual(['rig_bridge', 'rig_stepstone', 'watchtower', 'rig_blob', 'rig_rack', 'rig_float_bar', 'rescue_dock', 'rig_iceberg', 'rig_jump_tower']);
    expect(news.filter((d) => d.unlock.source === 'start').map((d) => d.id)).toEqual(['rig_bridge', 'rig_stepstone', 'watchtower']);
    const byRank = news.filter((d) => d.unlock.source === 'rank');
    expect(byRank.length).toBe(5);
    for (const d of byRank) { const r = (ranks as { star: number; unlocks?: string[] }[]).find((x) => x.star === d.unlock.rank)!; expect(r.unlocks, d.id).toContain(d.id); }
    const byCert = news.filter((d) => d.unlock.source === 'cert');
    expect(byCert.map((d) => d.id)).toEqual(['rig_iceberg']);
    for (const d of byCert) expect((certs as { id: string }[]).some((c) => c.id === d.unlock.ref), d.id).toBe(true);
    // 2026-09-19: 소원이 주던 워터 토템이 빠지 놀이터에 흡수됐다 — 이제 `rig_*` 중 소원 해금은 0 이고,
    // 그 자리는 조합 둘(시작 · 랭크 3)이 대신한다. 조합이 살아 있는 해금 경로인지도 같이 못박는다.
    expect(news.filter((d) => d.unlock.source === 'wish').map((d) => d.id)).toEqual([]);
    for (const [id, want] of [['ppaji_slide', { source: 'start' }], ['ppaji_playground', { source: 'rank', rank: 3 }]] as const) {
      const c = defs.find((d) => d.id === id)!;
      expect(c.deprecated, id).toBeUndefined(); expect(c.buildable, id).not.toBe(false); expect(c.unlock, id).toEqual(want);
    }
    expect(defs.filter((d) => d.unlock.source === 'craft').length).toBe(35); // 살아 있는 개조판 6 + 폐기 29 — 폐기는 레시피조차 없어 새로 얻을 길이 없다
  });
  it('값 유도 — cost = round100(pop×90) · maint ≈ pop×5.3 · safe = 2 − floor(thrill/2) · 새 기구 hpΔ 규칙', () => {
    for (const d of rigs) {
      expect(d.cost / d.pop, d.id).toBeGreaterThanOrEqual(60); expect(d.cost / d.pop, d.id).toBeLessThanOrEqual(140);
      expect(Math.abs(d.maint - d.pop * 5.3) / (d.pop * 5.3), d.id).toBeLessThanOrEqual(0.3);
      expect(d.safe, d.id).toBe(2 - Math.floor((d.thrill ?? 0) / 2));
      // 승인 조합은 **열린 수면까지 예약**하므로 칸당 인기 밀도 규칙 밖이다 (빠지 슬라이드 30/48 · 빠지 놀이터 205/240 — 값은 구성품 합에서 유도했다)
      if (!d.id.startsWith('ppaji_')) expect(d.pop / (d.w * d.d), d.id).toBeGreaterThanOrEqual(2.8);
      if (d.capacity >= 6) expect(d.w * d.d, d.id).toBeGreaterThanOrEqual(6);
      if (d.id.startsWith('rig_')) { expect(d.cost, d.id).toBe(Math.round((d.pop * 90) / 100) * 100 || d.cost); expect(d.hpDelta, d.id).toBe(d.useTicks >= 12 ? 25 : (d.thrill ?? 0) === 0 ? 0 : -(4 + 2 * (d.thrill ?? 0))); }
    }
    // 2026-09-19: 「빠지마다 하나」·「팔찌 값 2」가 회전 원반 → **빠지 놀이터**로 옮겼다 (원반은 폐기, 필드는 화석으로 남는다)
    expect(rigs.filter((d) => d.maxPerPark !== undefined).map((d) => d.id)).toEqual(['ppaji_playground']);
    expect(rigs.filter((d) => d.bandCost === 2).map((d) => d.id)).toEqual(['ppaji_playground']);
    expect(defs.find((d) => d.id === 'rig_float_bar')!.menuSlots).toBe(5);
    expect(defs.find((d) => d.id === 'gear_rack')!.rentKind).toBe('pkg');
  });
  // 2026-09-19: 개조 레시피가 20 → 6 으로 줄면서 아무 레시피도 안 쓰는 부품 4종(미끄럼 왁스·스프레이 노즐·2인 안장·LED 부표 갈래)이 은퇴해 13 → 9 다.
  // **죽은 열쇠 0** 은 아래 「쓰이지 않는 부품이 없다」가 지킨다 — 개수를 줄이는 것만으로 검사가 헐거워지지 않게.
  it('부품 9 — 연차 전용 3(y5·y5·y6) · 죽은 부품 0 · RigStore 가 부품을 받고 왕복한다 · rng.rig 스트림이 있다', () => {
    expect(RIG_PART_DEFS.length).toBe(9);
    expect(RIG_PART_DEFS.filter((p) => p.unlock === 'year').map((p) => p.year)).toEqual([5, 5, 6]);
    const used = new Set(RIG_UPGRADES.flatMap((r) => [...r.key.split('+'), ...r.add]));
    for (const part of RIG_PART_DEFS) expect(used.has(part.id), `${part.id} 을 쓰는 개조가 없다`).toBe(true);
    expect(RIG_WORDS.item).toBe('부품');
    const s = new RigStore([], RIG_PART_DEFS, new Rng(1));
    expect(s.grantIngredient('pump_motor')).toBe(true);
    const g = new Game(1); g.grant({ kind: 'rigPart', id: 'float_drum' });
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.rigs.toSnapshot().owned).toContain('float_drum');
    expect(RNG_SALTS.accident).toBe(10); expect(RNG_SALTS.rig).toBe(11); expect(RNG_SALTS.night).toBe(12);
  });
  it('등급 함수 — 문턱 5개 · 사슬 종 3 이 등급 3 의 문턱', () => {
    expect(ppajiGrade({ n: 0, kinds: 0, chain: 0, chainKinds: 0, lights: 0 })).toBe(0);
    expect(ppajiGrade({ n: 2, kinds: 1, chain: 0, chainKinds: 0, lights: 0 })).toBe(1);
    expect(ppajiGrade({ n: 5, kinds: 3, chain: 0, chainKinds: 0, lights: 0 })).toBe(2);
    expect(ppajiGrade({ n: 9, kinds: 3, chain: 4, chainKinds: CHAIN_KINDS_FOR_GRADE3, lights: 0 })).toBe(3);
    expect(ppajiGrade({ n: 9, kinds: 5, chain: 0, chainKinds: 0, lights: 0 })).toBe(3);
    expect(ppajiGrade({ n: 14, kinds: 6, chain: 0, chainKinds: 0, lights: 1 })).toBe(4);
    expect(ppajiGrade({ n: 14, kinds: 6, chain: 0, chainKinds: 0, lights: 0 })).toBe(3);
  });
  it('등급 인기 항등 — 기구 0개 판의 수역 인기는 옛 「칸 수 × 표준」과 같다(배율[0] = 1) · 스텁 등급은 링 위 시설을 센다', () => {
    const g = new Game(1); g.money = 1e6;
    const p = g.pools.all[0]!;
    expect(g.ppajiGradeOf(p.id)).toBe(0);
    const st = g.poolState(p.id)!;
    expect(st.popularity).toBeGreaterThanOrEqual(p.tiles.length * 4); // tilePopStandard 4 + 계절 보너스
    g.unlocked.facilities.add('watchtower'); g.unlocked.facilities.add('rig_stepstone');
    const { id } = makeTestPpaji(g); // 서쪽 헬퍼 빠지(열 44~49 · 행 24~30) — 윗줄(행 24)이 뭍(행 23)에 붙어 있어 윗줄 칸을 막아도 링이 안 끊긴다(킷 링은 위 두 끝만 뭍이라 막는 시설이 하나만 선다)
    const pop0 = g.poolState(id!)!.popularity;
    const r = g.placeFacility('watchtower', 45, 24, 0); expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(g.poolOfFacility(r.uid!)).toBe(id);
    expect(g.ppajiGradeOf(id!)).toBe(0); // n 1
    const r2 = g.placeFacility('rig_stepstone', 48, 25, 0); expect(r2.ok, JSON.stringify(r2)).toBe(true); // P50-a: 물 위(링 동쪽 열 49 데크에 4이웃 → 켜짐)
    expect(g.ppajiGradeOf(id!)).toBe(1); // n 2
    expect(g.poolState(id!)!.popularity).toBeGreaterThan(pop0); // 배율 1.15
    expect(g.ppajiGradeOf(p.id)).toBe(0); // 킷 빠지는 그대로
  });
  it('poolOfFacility — 발자국 소유 수역 → 없으면 4이웃 최다(동점 id 작은 쪽) → 없으면 null', () => {
    const g = new Game(1); g.money = 1e6;
    const { id } = makeTestPpaji(g); expect(id).not.toBeNull();
    const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row' && f.i < g.gate.i)!;
    expect(g.poolOfFacility(seat.uid)).toBeNull();
    g.unlocked.facilities.add('watchtower');
    const r = g.placeFacility('watchtower', 49, 26, 0); expect(r.ok).toBe(true); // 헬퍼 링(44~49) 동벽 — 킷 링(50)과 사이 — 양쪽에 붙는다
    expect(g.poolOfFacility(r.uid!)).toBe(id); // 4이웃 물은 헬퍼 빠지 안쪽뿐(킷 링 쪽은 벽 데크)
  });
  it('기구 배치(P49-a1 스텁 → P50-a WaterRules) — 잔디·데크·본류는 not-on-ppaji, 빠지 안 물은 ok · 링 위 시설은 잔디에서 not-on-ring · 조건 DSL 4 가 평가된다', () => {
    const g = new Game(1); g.money = 1e6;
    for (const id of ['rig_slide', 'rig_stepstone', 'watchtower']) g.unlocked.facilities.add(id);
    const W = g.waterRules;
    expect(g.facilities.probeForTest('rig_stepstone', 30, 22, 0, g.land, g.gate, g.permitDepth, W)).toBe('not-on-ppaji'); // 잔디
    expect(g.facilities.probeForTest('rig_stepstone', 57, 27, 0, g.land, g.gate, g.permitDepth, W)).toBe('not-on-ppaji'); // 본류(허가 안이라도 링 밖)
    expect(g.facilities.probeForTest('rig_stepstone', 50, 26, 0, g.land, g.gate, g.permitDepth, W)).toBe('not-on-ppaji'); // 킷 링 데크 — P50-a 부터 물 위에만
    expect(g.facilities.probeForTest('watchtower', 30, 22, 0, g.land, g.gate, g.permitDepth, W)).toBe('not-on-ring');
    expect(g.facilities.probeForTest('rig_stepstone', 51, 26, 0, g.land, g.gate, g.permitDepth, W)).toBe('ok'); // 킷 빠지 안 물
    expect(g.evaluateCondition({ kind: 'rigCount', min: 1 }).met).toBe(false);
    expect(g.placeFacility('rig_stepstone', 51, 26, 0).ok).toBe(true);
    expect(g.evaluateCondition({ kind: 'rigCount', min: 1 }).met).toBe(true);
    expect(g.evaluateCondition({ kind: 'rigGrade', min: 1 }).met).toBe(false);
    expect(g.evaluateCondition({ kind: 'rigPath', min: 1 }).met).toBe(false);
    expect(g.evaluateCondition({ kind: 'rigGuarded', min: 1 }).met).toBe(false);
    makeTestPpaji(g); // 서쪽 헬퍼 빠지(열 44~49) — 윗줄이 뭍에 붙어 있어 망루를 세워도 링이 안 끊긴다
    expect(g.placeFacility('watchtower', 45, 24, 0).ok).toBe(true); // 징검다리(51,26)까지 체비셰프 6 — 반경 안
    expect(g.evaluateCondition({ kind: 'rigGuarded', min: 1 }).met).toBe(true);
    expect(g.evaluateCondition({ kind: 'rigGrade', min: 1 }).label).toContain('등급');
  });
  it('goalNum(p49a1) = 149.11', () => { expect(goalNum('p49a1')).toBeCloseTo(149.11, 6); });
});

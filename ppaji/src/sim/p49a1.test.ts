import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS, RIG_PART_DEFS, RNG_SALTS } from './game.js';
import { ppajiGrade, CHAIN_KINDS_FOR_GRADE3 } from './rig.js';
import { RigStore, RIG_WORDS } from './rig-upgrade.js';
import { makeTestPpaji } from './test-helpers.js';
import { Rng } from './rng.js';
import { goalNum } from '../../tools/goal-num.js';
import ranks from '../data/ranks.json';
import wishes from '../data/wishes.json';
import certs from '../data/certs.json';

/**
 * P49-a1 골격 (§14 §4.0~4.3·§4.5·§5 소유 첫 행) — 데이터·유니언·필드·키·플래그 전부 + 등급이 인기를 대체(스텁). 기구는 아직 데크 위에만 놓인다(P50-a 가 물 위 규칙을 낸다).
 */
const defs = [...FACILITY_DEFS.values()];
const rigs = defs.filter((d) => d.class === 'rig' && d.buildable !== false); // P51: 개조판(buildable:false)은 따로 센다
const converted = defs.filter((d) => d.buildable === false);
const ring = defs.filter((d) => d.onRing === true && d.class !== 'rig' && d.buildable !== false);

describe('P49-a1 골격', () => {
  it('기구 21종 + 이전 12 — rig 22(새 17 + 이전 5) · 링 위 비-rig 4 + 이전 7 · deep 7 전부 needsVest (⇔)', () => {
    expect(rigs.length).toBe(22); expect(converted.length).toBe(20); // P51 개조판 20(기구 19 + 망루 1)
    expect(ring.length).toBe(11);
    const deep = rigs.filter((d) => d.depth === 'deep');
    expect(deep.length).toBe(7);
    for (const d of rigs) expect(d.needsVest === true, d.id).toBe(d.depth === 'deep');
  });
  it('해금 분포 — 시작 8 · 랭크 9(ranks.json unlocks 와 일치) · 인증 3(id 존재) · 소원 1(famous_painter/2 가 준다) · 개조판(craft) 20(P51)', () => {
    const news = defs.filter((d) => d.buildable !== false && (d.id.startsWith('rig_') || ['watchtower', 'rescue_dock'].includes(d.id)));
    expect(news.length).toBe(21);
    expect(news.filter((d) => d.unlock.source === 'start').length).toBe(8);
    const byRank = news.filter((d) => d.unlock.source === 'rank');
    expect(byRank.length).toBe(9);
    for (const d of byRank) { const r = (ranks as { star: number; unlocks?: string[] }[]).find((x) => x.star === d.unlock.rank)!; expect(r.unlocks, d.id).toContain(d.id); }
    const byCert = news.filter((d) => d.unlock.source === 'cert');
    expect(byCert.length).toBe(3);
    for (const d of byCert) expect((certs as { id: string }[]).some((c) => c.id === d.unlock.ref), d.id).toBe(true);
    const byWish = news.filter((d) => d.unlock.source === 'wish');
    expect(byWish.map((d) => d.id)).toEqual(['rig_totem']);
    expect((wishes as { friendId: string; idx: number; reward: { kind: string; id?: string } }[]).find((w) => w.friendId === 'famous_painter' && w.idx === 2)!.reward).toEqual({ kind: 'facility', id: 'rig_totem' });
    expect(defs.filter((d) => d.unlock.source === 'craft').length).toBe(20); // P51: 개조판 20 은 craft — 건설 목록에 없다
  });
  it('값 유도 — cost = round100(pop×90) · maint ≈ pop×5.3 · safe = 2 − floor(thrill/2) · 새 기구 hpΔ 규칙', () => {
    for (const d of rigs) {
      expect(d.cost / d.pop, d.id).toBeGreaterThanOrEqual(60); expect(d.cost / d.pop, d.id).toBeLessThanOrEqual(140);
      expect(Math.abs(d.maint - d.pop * 5.3) / (d.pop * 5.3), d.id).toBeLessThanOrEqual(0.3);
      expect(d.safe, d.id).toBe(2 - Math.floor((d.thrill ?? 0) / 2));
      expect(d.pop / (d.w * d.d), d.id).toBeGreaterThanOrEqual(2.8);
      if (d.capacity >= 6) expect(d.w * d.d, d.id).toBeGreaterThanOrEqual(6);
      if (d.id.startsWith('rig_')) { expect(d.cost, d.id).toBe(Math.round((d.pop * 90) / 100) * 100 || d.cost); expect(d.hpDelta, d.id).toBe(d.useTicks >= 12 ? 25 : (d.thrill ?? 0) === 0 ? 0 : -(4 + 2 * (d.thrill ?? 0))); }
    }
    expect(rigs.filter((d) => d.maxPerPark !== undefined).map((d) => d.id)).toEqual(['rig_disc']);
    expect(rigs.filter((d) => d.bandCost === 2).length).toBeLessThanOrEqual(1);
    expect(defs.find((d) => d.id === 'rig_float_bar')!.menuSlots).toBe(5);
    expect(defs.find((d) => d.id === 'gear_rack')!.rentKind).toBe('pkg');
  });
  it('부품 13 — 연차 전용 4(y5·y5·y6·y7) · 진열 랭크 · RigStore 가 부품을 받고 왕복한다 · rng.rig 스트림이 있다', () => {
    expect(RIG_PART_DEFS.length).toBe(13);
    expect(RIG_PART_DEFS.filter((p) => p.unlock === 'year').map((p) => p.year)).toEqual([5, 5, 6, 7]);
    expect(RIG_WORDS.item).toBe('부품');
    const s = new RigStore([], RIG_PART_DEFS, new Rng(1));
    expect(s.grantIngredient('pump_motor')).toBe(true);
    const g = new Game(1); g.grant({ kind: 'rigPart', id: 'slip_wax' });
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot())));
    expect(h.rigs.toSnapshot().owned).toContain('slip_wax');
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
    expect(g.evaluateCondition({ kind: 'rigChain', min: 1 }).met).toBe(false);
    expect(g.evaluateCondition({ kind: 'rigGuarded', min: 1 }).met).toBe(false);
    makeTestPpaji(g); // 서쪽 헬퍼 빠지(열 44~49) — 윗줄이 뭍에 붙어 있어 망루를 세워도 링이 안 끊긴다
    expect(g.placeFacility('watchtower', 45, 24, 0).ok).toBe(true); // 징검다리(51,26)까지 체비셰프 6 — 반경 안
    expect(g.evaluateCondition({ kind: 'rigGuarded', min: 1 }).met).toBe(true);
    expect(g.evaluateCondition({ kind: 'rigGrade', min: 1 }).label).toContain('등급');
  });
  it('goalNum(p49a1) = 149.11', () => { expect(goalNum('p49a1')).toBeCloseTo(149.11, 6); });
});

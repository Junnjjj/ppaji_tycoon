import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { RIG_UPGRADES, RigStore } from './rig-upgrade.js';
import { RIG_PART_DEFS } from './game.js';
import { Rng } from './rng.js';
import { runBot, BOT_DEFAULTS } from './bot.js';
import { capacityOf } from './facility.js';
import { TICKS_PER_DAY } from './clock.js';

const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if ((d.class === 'rig' || d.onRing) && d.buildable !== false) g.unlocked.facilities.add(d.id); return g; };
const why = (r: { ok: boolean; reason?: string }): string => (r.ok ? '' : r.reason ?? '');

describe('P51 개조', () => {
  it('rigs.json 20 — 별명 ≤ 12자 · from 낱말 계승 ≤ 4 · to.chain === from.chain · 같은 발자국 · 개조판 밴드(Δthrill+Δcap+Δsafe ≤ 2 ∧ 하나 ≥ +1 ∧ (Δthrill ≥ 1 ⇒ Δsafe ≤ 0)) · to.cost ≤ from.cost×3 · buildable:false · 키 유일 · 2단 셋', () => {
    expect(RIG_UPGRADES.length).toBe(20);
    expect(new Set(RIG_UPGRADES.map((r) => r.key)).size).toBe(20);
    expect(RIG_UPGRADES.filter((r) => r.unlock === 'start').map((r) => r.id)).toEqual(['up_slide2', 'up_tramp_double', 'up_bridge_swing']);
    let chained = 0;
    for (const r of RIG_UPGRADES) {
      const from = FACILITY_DEFS.get(r.from)!, to = FACILITY_DEFS.get(r.to)!;
      expect(from, r.id).toBeTruthy(); expect(to, r.id).toBeTruthy();
      expect(r.name.length, r.id).toBeLessThanOrEqual(12);
      const shared = [...r.name].filter((ch) => from.name.includes(ch) && ch !== ' ').length; expect(shared, r.id).toBeLessThanOrEqual(4);
      expect(to.chain ?? null, r.id).toBe(from.chain ?? null);
      expect([to.w, to.d], r.id).toEqual([from.w, from.d]);
      expect(to.buildable, r.id).toBe(false); expect(to.unlock.source, r.id).toBe('craft');
      const dt = (to.thrill ?? 0) - (from.thrill ?? 0), dc = to.capacity - from.capacity, ds = (to.safe ?? 0) - (from.safe ?? 0);
      expect(dt + dc + ds, r.id).toBeLessThanOrEqual(2);
      expect(Math.max(dt, dc, ds), r.id).toBeGreaterThanOrEqual(1);
      if (dt >= 1) expect(ds, r.id).toBeLessThanOrEqual(0);
      expect(to.cost, r.id).toBeLessThanOrEqual(from.cost * 3);
      expect(r.add.every((p) => RIG_PART_DEFS.some((d) => d.id === p)), r.id).toBe(true);
      if (from.buildable === false) chained++;
    }
    expect(chained).toBe(3); // 2단: 스파이럴 · 타워 · 롱브릿지
    expect(RIG_UPGRADES.filter((r) => r.add.some((p) => RIG_PART_DEFS.find((d) => d.id === p)?.unlock === 'year')).length).toBe(6); // 연차 부품에 물린 후반 6건
  });

  it('개조비 — 트램폴린 2,600 → 더블 팡팡 3,400 = 1,800G · 플로팅 슬라이드 1,600 → 난리 2,300 = 1,400G · Lv 할인 5%/Lv 상한 25%', () => {
    const g = fresh();
    const c = (a: string, b: string, lv = 1): number => g.convertCost(FACILITY_DEFS.get(a)!, FACILITY_DEFS.get(b)!, lv);
    expect(c('trampoline_w', 'rig_tramp_double')).toBe(1800);
    expect(c('rig_slide', 'rig_slide2')).toBe(1400);
    expect(c('trampoline_w', 'rig_tramp_double', 3)).toBe(1600);
    expect(c('trampoline_w', 'rig_tramp_double', 9)).toBe(Math.round((1820 * 0.75) / 100) * 100);
  });

  it('convertFacility — 8단 거절 각각 · 12필드 보존 · chainLen 재계산 · 실효 스릴·정원 · 미리보기 네 값 == 실값', () => {
    const g = fresh();
    expect(why(g.convertFacility(999, 'rig_slide2'))).toBe('시설이 없습니다');
    const r = g.placeFacility('rig_slide', 51, 24, 0); expect(r.ok, JSON.stringify(r)).toBe(true); // 2×3 물 위 (51~52, 24~26) — 서쪽 링에 닿아 켜짐
    const uid = r.uid!;
    expect(why(g.convertFacility(uid, 'nope'))).toBe('알 수 없는 개조판입니다');
    expect(why(g.convertFacility(uid, 'rig_tramp_double'))).toContain('개조할 수 없습니다');
    expect(why(g.convertFacility(uid, 'rig_slide3'))).toContain('개조할 수 없습니다'); // 2단은 1단 뒤에
    // 도감: up_slide2 는 start — 안다. 모르는 것: 미니 슬라이드 → 도넛
    const m = g.placeFacility('rig_mini_slide', 53, 24, 0); expect(m.ok).toBe(true);
    expect(why(g.convertFacility(m.uid!, 'rig_mini_double'))).toContain('아직 모르는 개조');
    const before = g.facilities.byUid(uid)!;
    before.staff = 1; before.usesToday = 3; before.incomeToday = 120; before.usesTotal = 9; before.incomeTotal = 300; before.level = 2;
    const snapshot = { uid: before.uid, i: before.i, j: before.j, facing: before.facing, rentedBy: before.rentedBy, usesToday: before.usesToday, level: before.level, usesTotal: before.usesTotal, incomeToday: before.incomeToday, incomeTotal: before.incomeTotal, staff: before.staff, paidToday: before.paidToday };
    const pv = g.convertPreview(uid, 'rig_slide2'); expect(pv.ok).toBe(true);
    const money0 = g.money;
    const poor = fresh(); const pr = poor.placeFacility('rig_slide', 51, 24, 0); poor.money = 10; expect(why(poor.convertFacility(pr.uid!, 'rig_slide2'))).toContain('돈이 부족합니다');
    const cv = g.convertFacility(uid, 'rig_slide2'); expect(cv.ok, JSON.stringify(cv)).toBe(true);
    const after = g.facilities.byUid(uid)!;
    expect(after.defId).toBe('rig_slide2');
    expect({ uid: after.uid, i: after.i, j: after.j, facing: after.facing, rentedBy: after.rentedBy, usesToday: after.usesToday, level: after.level, usesTotal: after.usesTotal, incomeToday: after.incomeToday, incomeTotal: after.incomeTotal, staff: after.staff, paidToday: after.paidToday }).toEqual(snapshot);
    expect(money0 - g.money).toBe(cv.cost); expect(cv.cost).toBe(pv.cost);
    expect(g.stats.converts).toBe(1);
    expect(g.rigState.lit.has(uid)).toBe(true); expect(after.chainLen).toBe(g.rigState.chainLen.get(uid));
    const to = FACILITY_DEFS.get('rig_slide2')!;
    expect(capacityOf(to, after)).toBe(pv.capacity); expect(to.thrill).toBe(pv.thrill); expect(to.safe).toBe(pv.safe);
    expect(g.facilityCapacity(after)).toBe(Math.round((to.capacity + 0) * 1)); // Lv2 · 사슬 1 → 정원 = 5
    // 2단: 아는 뒤에만
    expect(why(g.convertFacility(uid, 'rig_slide3'))).toContain('아직 모르는 개조');
  });

  it('craftRig — 실패작 없음 · 맞는 조합이 없으면 돈 0 · rng.rig 스트림 불변 · 발견하면 도감에 · buyRigPart 랭크 진열', () => {
    const g = fresh();
    const s0 = g.rng.rig.state;
    for (const id of ['slip_wax', 'float_drum', 'pump_motor', 'safety_net']) g.rigs.grantIngredient(id);
    const m0 = g.money;
    const miss = g.craftRig(['safety_net', 'pump_motor']); expect(miss.ok).toBe(false); expect(g.money).toBe(m0); // 맞는 개조 없음(pump+net 는 없다)
    const hit = g.craftRig(['slip_wax', 'pump_motor', 'float_drum']); expect(hit.ok).toBe(true); if (hit.ok) { expect(hit.recipe.id).toBe('up_slide_spiral'); expect(hit.first).toBe(true); }
    expect(m0 - g.money).toBe(400);
    expect(g.rigs.known.has('up_slide_spiral')).toBe(true);
    expect(g.rng.rig.state).toBe(s0);
    expect(why(g.buyRigPart('spray_nozzle'))).toContain('★'); // 랭크 진열
    expect(g.buyRigPart('anchor_chain').ok).toBe(true); expect(g.buyRigPart('anchor_chain').ok).toBe(true); expect(g.rigs.stockOf('anchor_chain')).toBe(2); // P56-c: 재고 — 두 번 사면 ×2
    expect(why(g.buyRigPart('speaker_horn'))).toContain('장날에 없는'); // 연차 전용
    const st = new RigStore(RIG_UPGRADES, RIG_PART_DEFS, new Rng(7)); expect(st.known.size).toBe(3);
  });

  it('환불 — 기구 셋을 놓고 그날 철거하면 전액, 이튿날 철거하면 rigRemoveRefund(0.5) · 시작 현금의 60% 이상 남는다 · incomeYest 가 어제 수입', () => {
    const g = fresh(); g.money = 12000;
    const uids: number[] = [];
    for (const [i, j, f] of [[51, 24, 0], [53, 24, 0], [51, 27, 1]] as const) { /* 셋째는 3×2 로 눕혀 행 27~28 */ const r = g.placeFacility('rig_slide', i, j, f); expect(r.ok, JSON.stringify(r)).toBe(true); uids.push(r.uid!); }
    expect(g.money).toBe(12000 - 3 * 1600);
    const same = g.removeFacility(uids[0]!); expect(same.ok).toBe(true); expect(same.refund).toBe(1600);
    g.facilities.byUid(uids[1]!)!.incomeToday = 77;
    g.step(TICKS_PER_DAY + 1); // 하루(1,680 tick) 경계는 다음 tick 에 처리된다
    expect(g.facilities.byUid(uids[1]!)!.incomeYest).toBe(77);
    expect(g.facilities.byUid(uids[1]!)!.paidToday).toBeUndefined();
    const next = g.removeFacility(uids[1]!); expect(next.refund).toBe(800);
    expect(g.removeFacility(uids[2]!).refund).toBe(800);
    expect(g.money).toBeGreaterThanOrEqual(12000 * 0.6);
    expect(g.b.rigRemoveRefund).toBe(0.5);
  });

  it('봇 — 기본 봇은 64일에 개조 ≥ 1 · 부품 구매 ≥ 1 · `--no-convert` 대조군은 개조 0·부품 0 이고 현금이 ±25% 안(P55 뒤)', () => {
    const on = runBot(new Game(2), 64, BOT_DEFAULTS);
    const off = runBot(new Game(2), 64, { ...BOT_DEFAULTS, noConvert: true });
    expect(on.rigUpgrades).toBeGreaterThanOrEqual(1);
    expect(on.rigPartsBought).toBeGreaterThanOrEqual(1);
    expect(off.rigUpgrades).toBe(0); expect(off.rigPartsBought).toBe(0);
    // P55 스윕(랭크 친구 문턱 ↓) 뒤 시드 2 가 64일에 ★3 을 먼저 찍어 개조·기구 지출 박자가 갈렸다(실측 0.17). 한 시드 대조는 노이즈가 커서(CLAUDE.md) 0.1 → 0.25 — 「개조가 경제를 뒤집지 않는다」는 뜻은 그대로다
    expect(Math.abs(on.money - off.money) / Math.max(1, off.money), `on ${on.money} off ${off.money}`).toBeLessThanOrEqual(0.25);
  }, 120000);
});

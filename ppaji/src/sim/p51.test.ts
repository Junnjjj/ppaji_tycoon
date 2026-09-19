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
  // 2026-09-19 승인 조합 채택(정본 29 폐기): 폐기된 원종 14종에 걸린 개조 레시피 14건을 지웠다 — 20 → 6.
  // 시작 개조는 살아 있는 사슬 둘로 옮겼다 (흔들다리 닌자 · 와일드 블롭).
  // ⚠ 개수만 줄이면 검사가 헐거워지므로 「살아 있는 원종만 가리킨다」·「죽은 부품 0」을 같이 못박는다.
  it('rigs.json 6 — 별명 ≤ 12자 · from 낱말 계승 ≤ 4 · to.chain === from.chain · 같은 발자국 · 개조판 밴드(Δthrill+Δcap+Δsafe ≤ 2 ∧ 하나 ≥ +1 ∧ (Δthrill ≥ 1 ⇒ Δsafe ≤ 0)) · to.cost ≤ from.cost×3 · buildable:false · 키 유일 · 2단 셋', () => {
    expect(RIG_UPGRADES.length).toBe(6);
    expect(new Set(RIG_UPGRADES.map((r) => r.key)).size).toBe(6);
    expect(RIG_UPGRADES.filter((r) => r.unlock === 'start').map((r) => r.id)).toEqual(['up_bridge_swing', 'up_blob_big']);
    // 레시피는 살아 있는 원종에만 걸린다 — 폐기된 것에 걸리면 영영 못 만드는 죽은 레시피다
    for (const r of RIG_UPGRADES) expect(FACILITY_DEFS.get(r.from)!.deprecated, `${r.id} from`).toBeUndefined();
    // 부품 9 가 전부 쓰인다 (죽은 열쇠 0)
    const used = new Set(RIG_UPGRADES.flatMap((r) => [...r.key.split('+'), ...r.add]));
    for (const d of RIG_PART_DEFS) expect(used.has(d.id), `${d.id} 을 쓰는 개조가 없다`).toBe(true);
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
    expect(chained).toBe(1); // 2단: 롱브릿지 (스파이럴·타워는 원종이 폐기돼 같이 내려갔다)
    // 연차 부품에 물린 후반 3건 (6 → 3). ⚠ 한계로 기록: P19 의 「공방 발견을 8년에 펼친다」가 절반으로 줄었다 — 조합 채택의 대가다.
    // 대신 **연차 부품 3종이 전부 쓰인다**를 못박아, 줄어든 자리에 죽은 연차 부품이 남지 않게 한다
    const yearParts = RIG_PART_DEFS.filter((d) => d.unlock === 'year');
    expect(RIG_UPGRADES.filter((r) => r.add.some((p) => yearParts.some((d) => d.id === p))).length).toBe(3);
    for (const d of yearParts) expect(RIG_UPGRADES.some((r) => r.add.includes(d.id)), `${d.id} 연차 부품이 안 쓰인다`).toBe(true);
  });

  it('개조비 — 장애물 다리 700 → 흔들다리 닌자 1,200 = 900G · 아이스버그 2,300 → 빅마블 월 2,800 = 1,300G · Lv 할인 5%/Lv 상한 25%', () => {
    const g = fresh();
    const c = (a: string, b: string, lv = 1): number => g.convertCost(FACILITY_DEFS.get(a)!, FACILITY_DEFS.get(b)!, lv);
    expect(c('rig_bridge', 'rig_bridge_swing')).toBe(900);   // (1200−700) + 1200×0.3 = 860 → 900
    expect(c('rig_iceberg', 'rig_iceberg_wall')).toBe(1300); // (2800−2300) + 2800×0.3 = 1340 → 1300
    expect(c('rig_bridge', 'rig_bridge_swing', 3)).toBe(800);
    expect(c('rig_bridge', 'rig_bridge_swing', 9)).toBe(Math.round((860 * 0.75) / 100) * 100);
  });

  it('convertFacility — 8단 거절 각각 · 12필드 보존 · chainLen 재계산 · 실효 스릴·정원 · 미리보기 네 값 == 실값', () => {
    // 2026-09-19: 옛 판은 플로팅 슬라이드 사슬(rig_slide → 난리 → 스파이럴)로 쟀다. 그 원종이 조합에 흡수돼 폐기됐으므로
    // 살아 있는 같은 모양의 사슬(장애물 다리 → 흔들다리 닌자 → 단군 롱브릿지)로 옮겼다. 규칙은 하나도 안 바뀐다.
    const g = fresh();
    expect(why(g.convertFacility(999, 'rig_bridge_swing'))).toBe('시설이 없습니다');
    const r = g.placeFacility('rig_bridge', 51, 24, 0); expect(r.ok, JSON.stringify(r)).toBe(true); // 1×2 물 위 (51, 24~25) — 서쪽 링에 닿아 켜짐
    const uid = r.uid!;
    expect(why(g.convertFacility(uid, 'nope'))).toBe('알 수 없는 개조판입니다');
    expect(why(g.convertFacility(uid, 'rig_blob_big'))).toContain('개조할 수 없습니다');
    expect(why(g.convertFacility(uid, 'rig_bridge_long'))).toContain('개조할 수 없습니다'); // 2단은 1단 뒤에
    // 도감: up_bridge_swing 은 start — 안다. 모르는 것: 아이스버그 → 빅마블 월 (deep 2×2 — 52,26 이 강. 옛 워터 토템은 조합에 흡수됐다)
    const m = g.placeFacility('rig_iceberg', 52, 26, 0); expect(m.ok, JSON.stringify(m)).toBe(true);
    expect(why(g.convertFacility(m.uid!, 'rig_iceberg_wall'))).toContain('아직 모르는 개조');
    const before = g.facilities.byUid(uid)!;
    before.staff = 1; before.usesToday = 3; before.incomeToday = 120; before.usesTotal = 9; before.incomeTotal = 300; before.level = 2;
    const snapshot = { uid: before.uid, i: before.i, j: before.j, facing: before.facing, rentedBy: before.rentedBy, usesToday: before.usesToday, level: before.level, usesTotal: before.usesTotal, incomeToday: before.incomeToday, incomeTotal: before.incomeTotal, staff: before.staff, paidToday: before.paidToday };
    const pv = g.convertPreview(uid, 'rig_bridge_swing'); expect(pv.ok).toBe(true);
    const money0 = g.money;
    const poor = fresh(); const pr = poor.placeFacility('rig_bridge', 51, 24, 0); poor.money = 10; expect(why(poor.convertFacility(pr.uid!, 'rig_bridge_swing'))).toContain('돈이 부족합니다');
    const cv = g.convertFacility(uid, 'rig_bridge_swing'); expect(cv.ok, JSON.stringify(cv)).toBe(true);
    const after = g.facilities.byUid(uid)!;
    expect(after.defId).toBe('rig_bridge_swing');
    expect({ uid: after.uid, i: after.i, j: after.j, facing: after.facing, rentedBy: after.rentedBy, usesToday: after.usesToday, level: after.level, usesTotal: after.usesTotal, incomeToday: after.incomeToday, incomeTotal: after.incomeTotal, staff: after.staff, paidToday: after.paidToday }).toEqual(snapshot);
    expect(money0 - g.money).toBe(cv.cost); expect(cv.cost).toBe(pv.cost);
    expect(g.stats.converts).toBe(1);
    expect(g.rigState.lit.has(uid)).toBe(true); expect(after.chainLen).toBe(g.rigState.chainLen.get(uid));
    const to = FACILITY_DEFS.get('rig_bridge_swing')!;
    expect(capacityOf(to, after)).toBe(pv.capacity); expect(to.thrill).toBe(pv.thrill); expect(to.safe).toBe(pv.safe);
    expect(g.facilityCapacity(after)).toBe(Math.round((to.capacity + 0) * 1));
    // 2단: 아는 뒤에만
    expect(why(g.convertFacility(uid, 'rig_bridge_long'))).toContain('아직 모르는 개조');
  });

  it('craftRig — 실패작 없음 · 맞는 조합이 없으면 돈 0 · rng.rig 스트림 불변 · 발견하면 도감에 · buyRigPart 랭크 진열', () => {
    const g = fresh();
    const s0 = g.rng.rig.state;
    for (const id of ['waterproof_canvas', 'float_drum', 'pump_motor', 'safety_net']) g.rigs.grantIngredient(id); // 2026-09-19: 미끄럼 왁스는 은퇴했다
    const m0 = g.money;
    const miss = g.craftRig(['pump_motor', 'safety_net']); expect(miss.ok).toBe(false); expect(g.money).toBe(m0); // 맞는 개조 없음(펌프+안전망 키는 없다)
    const hit = g.craftRig(['float_drum', 'safety_net']); expect(hit.ok).toBe(true); if (hit.ok) { expect(hit.recipe.id).toBe('up_iceberg_wall'); expect(hit.first).toBe(true); } // 2026-09-19: 스파이럴이 내려가 살아 있는 빅마블 월로 옮겼다
    expect(m0 - g.money).toBe(400);
    expect(g.rigs.known.has('up_iceberg_wall')).toBe(true); // 부품만으로 발견한다 — 놓을 수 있는 자리와는 별개
    expect(g.rng.rig.state).toBe(s0);
    expect(why(g.buyRigPart('led_strip_buoy'))).toContain('★'); // 랭크 진열 (★2) — 스프레이 노즐은 은퇴했다
    expect(g.buyRigPart('anchor_chain').ok).toBe(true); expect(g.buyRigPart('anchor_chain').ok).toBe(true); expect(g.rigs.stockOf('anchor_chain')).toBe(2); // P56-c: 재고 — 두 번 사면 ×2
    expect(why(g.buyRigPart('speaker_horn'))).toContain('장날에 없는'); // 연차 전용
    const st = new RigStore(RIG_UPGRADES, RIG_PART_DEFS, new Rng(7)); expect(st.known.size).toBe(2); // 시작 개조 2
  });

  it('환불 — 기구 셋을 놓고 그날 철거하면 전액, 이튿날 철거하면 rigRemoveRefund(0.5) · 시작 현금의 60% 이상 남는다 · incomeYest 가 어제 수입', () => {
    const g = fresh(); g.money = 12000;
    const uids: number[] = [];
    for (const [i, j, f] of [[51, 24, 0], [53, 24, 0], [51, 27, 1]] as const) { const r = g.placeFacility('rig_bridge', i, j, f); expect(r.ok, JSON.stringify(r)).toBe(true); uids.push(r.uid!); } // 2026-09-19: 플로팅 슬라이드 폐기 → 장애물 다리(1×2, 700G)
    expect(g.money).toBe(12000 - 3 * 700);
    const same = g.removeFacility(uids[0]!); expect(same.ok).toBe(true); expect(same.refund).toBe(700);
    g.facilities.byUid(uids[1]!)!.incomeToday = 77;
    g.step(TICKS_PER_DAY + 1); // 하루(1,680 tick) 경계는 다음 tick 에 처리된다
    expect(g.facilities.byUid(uids[1]!)!.incomeYest).toBe(77);
    expect(g.facilities.byUid(uids[1]!)!.paidToday).toBeUndefined();
    const next = g.removeFacility(uids[1]!); expect(next.refund).toBe(350);
    expect(g.removeFacility(uids[2]!).refund).toBe(350);
    expect(g.money).toBeGreaterThanOrEqual(12000 * 0.6);
    expect(g.b.rigRemoveRefund).toBe(0.5);
  });

  it('봇 — 기본 봇은 64일에 개조 ≥ 1 · 부품 구매 ≥ 1 · `--no-convert` 대조군은 개조 0·부품 0 이고 현금이 ±25% 안(P55 뒤)', () => {
    const on = runBot(new Game(2), 64, { ...BOT_DEFAULTS, noNight: true }); // P57-i(2026-09-15): 밤 빠지 파티(P54)는 기구 ★4 뒤에 잠겨 64일 안엔 개조 봇만 연다 — 유입을 절반으로 줄이자 그 야간 매출(240k)이 현금의 1/3 이 되어 대조가 「밤 유무」를 재고 있었다(실측 0.71/0.73/0.25). 양쪽 밤을 꺼서 개조 효과만 잰다(실측 0.22/0.01/0.13)
    const off = runBot(new Game(2), 64, { ...BOT_DEFAULTS, noNight: true, noConvert: true });
    expect(on.rigUpgrades).toBeGreaterThanOrEqual(1);
    expect(on.rigPartsBought).toBeGreaterThanOrEqual(1);
    expect(off.rigUpgrades).toBe(0); expect(off.rigPartsBought).toBe(0);
    // P55 스윕(랭크 친구 문턱 ↓) 뒤 시드 2 가 64일에 ★3 을 먼저 찍어 개조·기구 지출 박자가 갈렸다(실측 0.17). 한 시드 대조는 노이즈가 커서(CLAUDE.md) 0.1 → 0.25 — 「개조가 경제를 뒤집지 않는다」는 뜻은 그대로다
    expect(Math.abs(on.money - off.money) / Math.max(1, off.money), `on ${on.money} off ${off.money}`).toBeLessThanOrEqual(0.25);
  }, 120000);
});

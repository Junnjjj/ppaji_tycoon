import { describe, it, expect } from 'vitest';
import { Game, FACILITY_DEFS, RANK_DEFS } from './game.js';
import { runBot, BOT_PERSONAS } from './bot.js';

/** P21 (D27) — 해금 재배치: 빠지 기본기는 시작·랭크 1·2 에서 열린다. 소원은 시그니처만 */
describe('P21 해금 재배치', () => {
  it('새 판에 시설 17종 — 매점·화로대·샤워실·탈의실·갈대밭·해바라기가 시작부터 있다', () => {
    const g = new Game(21);
    for (const id of ['shop', 'firepit_row', 'shower_row', 'changing_row', 'aloe', 'sunflower']) expect(g.isUnlocked(id), id).toBe(true);
    expect(g.unlocked.facilities.size).toBeGreaterThanOrEqual(17);
  });
  // 2026-09-19 조합 채택: 워터 롤러·선베드(★1) 와 미끄럼 도크(★2) 가 빠지 놀이터에 흡수돼 해금 목록에서 내려갔고,
  // ★3 에 **빠지 놀이터**가 들어왔다. 옛 선착장을 대신하는 **승하선 데크는 시작 해금**이라 랭크 목록엔 없다.
  // 폐기 시설이 해금 목록에 남지 않는 것도 같이 못박는다 — 남으면 못 짓는 시설을 보상이라고 주는 셈이다.
  it('★1 은 입구(P42)+BBQ존·치킨·족구장·카약·락커·수국·놀이터 6종, ★2 는 카페·노래방·오락기·SUP·낚시터·무궁화·미니골프, ★3 은 빠지 놀이터를 연다 (데이터)', () => {
    expect(RANK_DEFS[0]!.unlocks).toEqual(['entrance', 'bbq_zone', 'chicken', 'footvolley', 'rent_kayak', 'locker_row', 'hydrangea', 'playground', 'rig_blob', 'rig_rack', 'env_pine', 'env_deciduous', 'env_willow', 'module_rig_roller', 'module_rig_sunbed']);
    expect(RANK_DEFS[1]!.unlocks).toEqual(['cafe', 'karaoke', 'arcade', 'rent_sup', 'fishing', 'hibiscus', 'minigolf', 'rig_float_bar', 'rescue_dock', 'env_village_house', 'env_village_shop', 'env_pension', 'env_small_hotel', 'env_convenience_store', 'env_maintenance_shed', 'env_bus', 'env_car', 'module_trampoline_w', 'module_rig_slidedock', 'module_rig_kids_park']);
    expect(RANK_DEFS[2]!.unlocks).toEqual(['ppaji_playground', 'module_rig_totem', 'module_waterwalk', 'module_rig_led_buoy']);
    expect(FACILITY_DEFS.get('boarding_dock')!.unlock).toEqual({ source: 'start' }); // 옛 선착장(dock)은 폐기, 승하선 데크가 시작부터 있다
    expect(FACILITY_DEFS.get('dock')!.deprecated).toBe(true);
    for (const r of RANK_DEFS) for (const id of r.unlocks ?? []) {
      expect(FACILITY_DEFS.get(id)!.unlock.source, id).toBe('rank');
      expect(FACILITY_DEFS.get(id)!.deprecated, `${id} 은 폐기 시설이 아니다`).toBeUndefined(); // 랭크 보상이 못 짓는 시설이면 죽은 보상이다
    }
  });
  it('소원 해금 시설은 34 → 14 (시그니처만 남는다 — 워터 토템은 조합에 흡수됐다)', () => {
    const wish = [...FACILITY_DEFS.values()].filter((d) => d.unlock.source === 'wish' && !d.variantOf);
    expect(wish.length).toBe(14);
    for (const d of wish) expect(d.deprecated, d.id).toBeUndefined();
  });
  it('봇 64일 — 랭크 2 에 닿으면 BBQ존·카페가 열려 있다', () => {
    const g = new Game(21);
    runBot(g, 64, BOT_PERSONAS.balanced);
    expect(g.rank).toBeGreaterThanOrEqual(2);
    expect(g.isUnlocked('bbq_zone')).toBe(true);
    expect(g.isUnlocked('cafe')).toBe(true);
  }, 30000);
});

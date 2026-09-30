import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot } from './bot.js';
import defaultBalance from '../data/balance.json';

/** P60-b (D73 B1, docs/plan-ppaji-rig-foodcourt.md §10.2) — 기구도 배를 곯린다 */
describe('P60-b 기구 배고픔', () => {
  it('balance.hungerPerRig 가 있고(12) 0 이면 동작 0 — 골든 시드 1 의 16일 해시가 배고픔 없는 판의 고정값과 같다(대조군)', () => {
    expect(defaultBalance.hungerPerRig).toBe(12);
    const off = runBot(new Game(1, { ...defaultBalance, hungerPerRig: 0 }, { arrival: true }), 16);
    expect(off.snapshotHash).toBe(2284310567); // 2026-09-25: mandatory preparation and facility spacing, hunger-off control remeasured.
  }, 20000);
  it('the same completed rig visit adds hunger only when enabled, and food clears it', () => {
    // Admission order now changes visit duration and purchase mix. Total park sales
    // are not a causal hunger assertion; hold the guest and completed visit fixed.
    for(const enabled of [false,true]){
      const game=new Game(1,{...defaultBalance,hungerPerRig:enabled?12:0},{kit:false});
      const rig=game.facilities.place('rig_beam',50,25,0),guest=game.guests.spawn();
      guest.state='use';guest.target={kind:'facility',uid:rig.uid};guest.stateTicks=10000;guest.hunger=0;
      game.guests.step();
      expect(rig.usesToday).toBe(1);expect(guest.hunger).toBe(enabled?24:0);
      const shop=game.facilities.place('indoor_shop',45,11,0);
      guest.state='use';guest.target={kind:'facility',uid:shop.uid};guest.stateTicks=10000;
      game.guests.step();expect(shop.usesToday).toBe(1);expect(guest.hunger).toBe(0);
    }
  });
});

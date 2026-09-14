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
  it('★1 은 입구(P42)+BBQ존·치킨·족구장·카약·락커·수국·놀이터 8종, ★2 는 카페·노래방·오락기·SUP·낚시터·무궁화·미니골프 7종을 연다 (데이터)', () => {
    expect(RANK_DEFS[0]!.unlocks).toEqual(['entrance', 'bbq_zone', 'chicken', 'footvolley', 'rent_kayak', 'locker_row', 'hydrangea', 'playground', 'rig_blob', 'rig_roller', 'rig_sunbed', 'rig_rack']); // P49-a1 기구 4
    expect(RANK_DEFS[1]!.unlocks).toEqual(['cafe', 'karaoke', 'arcade', 'rent_sup', 'fishing', 'hibiscus', 'minigolf', 'rig_slidedock', 'rig_float_bar', 'rescue_dock']); // P49-a1 기구 3
    for (const id of [...RANK_DEFS[0]!.unlocks!, ...RANK_DEFS[1]!.unlocks!]) expect(FACILITY_DEFS.get(id)!.unlock.source, id).toBe('rank');
  });
  it('소원 해금 시설은 34 → 14 (시그니처만 남는다) + P49-a1 워터 토템 = 15', () => {
    const wish = [...FACILITY_DEFS.values()].filter((d) => d.unlock.source === 'wish');
    expect(wish.length).toBe(15);
  });
  it('봇 64일 — 랭크 2 에 닿으면 BBQ존·카페가 열려 있다', () => {
    const g = new Game(21);
    runBot(g, 64, BOT_PERSONAS.balanced);
    expect(g.rank).toBeGreaterThanOrEqual(2);
    expect(g.isUnlocked('bbq_zone')).toBe(true);
    expect(g.isUnlocked('cafe')).toBe(true);
  }, 30000);
});

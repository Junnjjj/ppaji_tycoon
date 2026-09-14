import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';
import defaultBalance from '../data/balance.json';

/** P45-c D63 밤 분기 — 폐장 뒤 남는 팀이 실내 객실에 묵고, 자기 전에 밤 시설(찜질방·무대)에 들른다 · 거치대에서 빌리면 기구 패키지 */
describe('P45-c 밤 분기', () => {
  it('실내 객실은 등급 문턱 없이 1박(지붕 = 그늘) · 찜질방에 밤 이용이 난다 · nightChance 0 이면 밤 이용 0', () => {
    const run = (on: boolean): Game => {
      const b = on ? defaultBalance : { ...defaultBalance, nightChance: 0 };
      const g = new Game(45, b); g.money = 200000; g.rank = 2; g.openLand(2);
      for (const id of ['room_ondol', 'jjimjilbang', 'stage_hall']) g.unlocked.facilities.add(id);
      const gt = g.gate;
      expect(g.placeFacility('room_ondol', gt.i - 8, gt.j + 3, 0).ok).toBe(true);
      expect(g.placeFacility('room_ondol', gt.i - 8, gt.j + 6, 0).ok).toBe(true);
      expect(g.placeFacility('jjimjilbang', gt.i + 5, gt.j + 9, 0).ok).toBe(true); // P48-b1: 출입동 20×13 안(킷 화장실 (50,16) 오른쪽)
      expect(g.seatGradeOf(g.facilities.all.find((f) => f.defId === 'room_ondol')!.uid).shade).toBe(true);
      g.step(TICKS_PER_DAY);
      return g;
    };
    const a = run(true), z = run(false);
    expect(a.nightForTest().length).toBe(1);
    expect(a.stats.overnight ?? 0).toBeGreaterThan(0);
    expect(a.stats.nightUses ?? 0).toBeGreaterThan(0);
    expect(z.stats.nightUses ?? 0).toBe(0);
    const h = Game.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    expect(h.stats.nightUses).toBe(a.stats.nightUses);
  }, 60000);
  it('기구 거치대를 쓰면 기구 패키지(선착장 ×4)가 생기고 집계된다', () => {
    const g = new Game(46); g.money = 100000; g.unlocked.facilities.add('gear_rack');
    const gt = g.gate;
    expect(g.placeFacility('gear_rack', gt.i + 1, gt.j + 6, 0).ok).toBe(true);
    g.step(TICKS_PER_DAY);
    expect(g.stats.gearRentals ?? 0).toBeGreaterThan(0);
  }, 60000);
});

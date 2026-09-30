import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from './game.js';
import { applyArrivalLayout, arrivalRoom, canAdoptArrival } from './arrival-layout.js';
import { FLOOR, isIndoorCode } from './grid.js';
import { FacilityStore } from './facility.js';

describe('approved initial arrival layout', () => {
  const create = () => new Game(20260902, undefined, { arrival: true });
  it('keeps the main room and adds a compact annex with working exterior doors', () => {
    expect(readFileSync('src/data/arrival-presentation.json').equals(readFileSync('../src/data/kairo-arrival-presentation.json'))).toBe(true);
    const g = create();
    expect(arrivalRoom(g.gate)).toEqual({ i0: 38, j0: 8, w: 20, h: 13 }); // P57-c 절충: 출입동은 옛 킷 20×13
    expect(Array.from(g.grid.floor).filter(isIndoorCode)).toHaveLength(300); // 본 실내 260 + 준비실 40
    expect(g.grid.doors()).toEqual([{ i: 48, j: 3, oi: 48, oj: 2 }, { i: 48, j: 20, oi: 48, oj: 21 }, { i: 49, j: 20, oi: 49, oj: 21 }]);
    expect(g.money).toBe(12000);
    expect(g.facilities.all.some(f => ['pyeongsang_row', 'pingpong'].includes(f.defId))).toBe(false);
    expect(g.facilities.all.filter(f => f.defId.startsWith('env_'))).toHaveLength(16); // 20×13 건물에선 정문 옆 화분 2(보도 위)·동쪽 바위 1·물가 산책로 위 셋(벤치·화단·가로등)이 자리를 못 찾는다
  });
  it('reserves actual decoration footprints while keeping the 3-cell patio aisle open', () => {
    const g = create(); const occupied = new Set<string>();
    for (const f of g.facilities.all) for (const t of FacilityStore.footprint(g.facilities.defOf(f), f.i, f.j, f.facing)) {
      const key = `${t.i},${t.j}`; expect(occupied.has(key)).toBe(false); occupied.add(key);
      if (f.defId.startsWith('env_')) { expect(isIndoorCode(g.grid.at(t.i, t.j))).toBe(false); expect(g.facilities.occupied(t.i, t.j)).toBe(true); }
    }
    for (let j = 21; j <= 23; j++) for (let i = 47; i <= 49; i++) { expect(g.grid.at(i, j)).toBe(FLOOR.path); expect(g.guests.walkable(i, j)).toBe(true); }
    expect(g.canPlace('env_flower_pot', 48, 12).ok).toBe(false);
    expect(g.guests.walkable(48, 9)).toBe(true); expect(g.facilities.occupied(48, 1)).toBe(true);
    expect(g.guests.walkable(49, 1)).toBe(false);
  });
  it('preserves the system shoreline, heights, pools and dock', () => {
    const g = create(), old = new Game(g.seed);
    expect(g.grid.natural).toEqual(old.grid.natural); expect(g.grid.levels).toEqual(old.grid.levels);
    expect(g.pools.toSnapshot()).toEqual(old.pools.toSnapshot());
    const oldDock = old.facilities.all.find(f => f.defId === 'dock')!;
    const dock = g.facilities.byUid(oldDock.uid)!;
    expect(dock).toMatchObject({ ...oldDock, defId: 'boarding_dock', i: 58, j: 25, facing: 1 });
    expect(FacilityStore.footprint(g.facilities.defOf(dock), dock.i, dock.j, dock.facing)).toContainEqual({ i: oldDock.i, j: oldDock.j });
  });
  it('walks every ticket/indoor cell in order on entry and exit without teleporting', () => {
    const g = create(), guest = g.guests.spawn(), visited: string[] = [];
    let prev = { i: guest.i, j: guest.j };
    for (let tick = 0; tick < 800 && guest.state !== 'wander'; tick++) {
      g.guests.step(); expect(Math.abs(guest.i - prev.i) + Math.abs(guest.j - prev.j)).toBeLessThanOrEqual(1);
      if (guest.progress === 1 && visited.at(-1) !== `${guest.i},${guest.j}`) visited.push(`${guest.i},${guest.j}`);
      prev = { i: guest.i, j: guest.j };
    }
    expect(guest.state).toBe('wander'); expect(visited.slice(0,3)).toEqual(['48,1','48,2','48,3']); expect(guest.preparationStep).toBe(3); expect(visited.at(-1)).toBe('48,21');
    guest.state = 'leave';
    for (let tick = 0; tick < 220 && g.guests.count; tick++) {
      g.guests.step(); expect(Math.abs(guest.i - prev.i) + Math.abs(guest.j - prev.j)).toBeLessThanOrEqual(1); prev = { i: guest.i, j: guest.j };
    }
    expect(g.guests.count).toBe(0); expect([guest.i, guest.j]).toEqual([48, 0]);
  });
  it('round-trips an in-flight entry and keeps the same simulation trajectory', () => {
    const g = create(); g.guests.spawn(); for (let n = 0; n < 15; n++) g.guests.step();
    const restored = Game.fromSnapshot(g.toSnapshot());
    for (let n = 0; n < 100; n++) { g.guests.step(); restored.guests.step(); }
    expect(restored.guests.toSnapshot()).toEqual(g.guests.toSnapshot());
    expect(restored.toSnapshot().arrivalRevision).toBe(3);
    expect(restored.guests.walkable(48, 9)).toBe(true);
  });
  it('adopts only an untouched baseline and leaves edited or occupied parks alone', () => {
    const original = new Game(1), g = Game.fromSnapshot(original.toSnapshot());
    g.money = 82902; g.day = 7; expect(canAdoptArrival(g, original)).toBe(true);
    applyArrivalLayout(g); expect(g.money).toBe(82902); expect(g.day).toBe(7);
    const once = g.toSnapshot(); applyArrivalLayout(g); expect(g.toSnapshot()).toEqual(once);
    const edited = new Game(1); edited.grid.set(40, 10, FLOOR.path); expect(canAdoptArrival(edited, original)).toBe(false);
    const live = new Game(1); live.guests.spawn(); expect(canAdoptArrival(live, original)).toBe(false);
    const upgraded = new Game(1); upgraded.facilities.all[0]!.level = 2; expect(canAdoptArrival(upgraded, original)).toBe(false);
  });
  it('keeps the annex partition solid except its two doors and allows upper wing expansion', () => {
    const g=create();
    for(let i=44;i<52;i++) expect(g.grid.canCross(i,7,i,8)).toBe(i===48 || i===49);
    expect(g.ownsTile(40,4)).toBe(true);
    expect(g.ownsTile(40,0)).toBe(false);
    expect(g.canPaintIndoor(40,4).ok).toBe(true);
    const expansion = [{i:43,j:4},{i:52,j:4}];
    expect(g.paintIndoor(expansion).ok).toBe(true);
    expect(g.grid.canCross(43,4,44,4)).toBe(false);
    expect(g.grid.canCross(51,4,52,4)).toBe(false);
    for(let j=0;j<3;j++) expect(g.guests.walkable(48,j)).toBe(true);
    expect(g.facilities.all.find(f=>f.defId==='compact_shower')).toMatchObject({i:49,j:5});
    const restored=Game.fromSnapshot(g.toSnapshot());
    expect(restored.grid.canCross(44,7,44,8)).toBe(false);
    expect(restored.gate).toEqual({i:48,j:0});
  });
  it('does not reinterpret the gate or floor of a revision 2 save', () => {
    const old=new Game(8);old.arrivalRevision=2;const snapshot=old.toSnapshot();
    const restored=Game.fromSnapshot(snapshot);
    expect(restored.gate).toEqual({i:48,j:8});
    expect(restored.grid.floor).toEqual(old.grid.floor);
    expect(restored.land.j0).toBe(8);
    expect(canAdoptArrival(restored,new Game(8))).toBe(false);
  });

});

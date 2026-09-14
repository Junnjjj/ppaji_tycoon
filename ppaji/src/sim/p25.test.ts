import { describe, it, expect } from 'vitest';
import { Game, PACKAGES, FACILITY_DEFS } from './game.js';

/** P25 (D31) — 패키지는 손님 취향이 아니라 자리 반경의 구성으로 성립한다. 발견은 판당 1회 알림, 재료가 빠지면 사라진다 */
describe('P25 패키지 = 배치로 발견', () => {
  it('데이터 5종 — 고기{food} · 기구{dock} · 수영{water} · 1박{lodging,fire} · 자유이용권{ppaji}(P50-b2)', () => {
    expect(PACKAGES.map((p) => p.id)).toEqual(['meat', 'gear', 'swim', 'stay', 'ppaji']); // P50-b2: 빠지 자유이용권(값만 — 발급은 P52-a)
    expect(PACKAGES.find((p) => p.id === 'stay')!.needsInRadius).toEqual(['lodging', 'fire']);
    expect(FACILITY_DEFS.get('firepit_row')!.fire).toBe(true);
  });
  it('킷 평상(물가)에는 수영만 — 반경에 자판기를 놓으면 고기가 발견되고(P29 킷 미완성), 뭍 안쪽 평상엔 없음 — 자판기를 철거하면 고기가 사라진다', () => {
    const g = new Game(25); g.money = 100000;
    const seats = g.facilities.all.filter((f) => f.defId === 'pyeongsang_row');
    for (const s of seats) expect(g.seatPackages(s.uid).map((p) => p.id)).toEqual(['swim']);
    expect(g.packagesSeen.has('swim') && !g.packagesSeen.has('meat')).toBe(true);
    const gt = g.gate;
    const near = g.placeFacility('vending_out', gt.i + 4, gt.j + 13, 0); expect(near.ok).toBe(true); // P48-b2: 첫 평상은 못 북안(gt.i+4, j+15) — 산책로 위쪽 반경 3 안
    expect(g.seatPackages(seats[0]!.uid).map((p) => p.id).sort()).toEqual(['meat', 'swim']);
    expect(g.packagesSeen.has('meat')).toBe(true);
    const far = g.placeFacility('pyeongsang_row', gt.i - 18, gt.j + 14, 0); expect(far.ok).toBe(true); // P48-b3: 북서 잔디 — 물 반경 3 밖 // P48-b1: 마당 가운데가 물굽이라 좌표를 뭍(서쪽 안쪽)으로 // 블록(5,2) — 물(26) 반경 밖 · 접한 블록에 매점 없음 (P35: (4,2)는 킷 먹거리 블록(4,1)과 접한다)
    expect(g.seatPackages(far.uid!)).toEqual([]);
    expect(g.removeFacility(near.uid!).ok).toBe(true);
    for (const s of seats) expect(g.seatPackages(s.uid).map((p) => p.id)).toEqual(['swim']);
    const items = ((g.inbox as unknown as { items?: { title: string }[]; all?: { title: string }[] }).items ?? (g.inbox as unknown as { all: { title: string }[] }).all);
    expect(items.some((x) => x.title.includes('고기 패키지 가 사라졌다'))).toBe(true);
    expect(items.filter((x) => x.title.startsWith('패키지 발견')).length).toBe(2);
  });
  it('팀원은 자리의 패키지 중 취향 순으로 하나를 산다 · 화로대가 붙은 캠핑 자리에선 1박 패키지', () => {
    const g = new Game(25); g.money = 200000; g.rank = 2; g.openLand(2); g.unlocked.facilities.add('camp_site');
    const gt = g.gate;
    const camp = g.placeFacility('camp_site', gt.i - 14, gt.j + 19, 0); expect(camp.ok).toBe(true); // P48-b3: 서쪽 물가(열 34 · 행 27)
    const fire = g.placeFacility('firepit_row', gt.i - 14, gt.j + 17, 0); expect(fire.ok).toBe(true); // P48-b3: 캠핑 자리 바로 위
    expect(g.seatPackages(camp.uid!).map((p) => p.id)).toContain('stay');
    const s = g.guests.spawn(); s.teamId = 999; s.taste = { water: 0.5, thrill: 0.5, food: 0.5, rest: 2, tempBias: 0 };
    s.target = { kind: 'facility', uid: camp.uid! }; s.state = 'walk'; s.stateTicks = 0;
    g.step(300);
    expect(s.pkg).toBe('stay');
    const h = Game.fromSnapshot(g.toSnapshot());
    expect(h.packagesSeen.has('stay')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

/** P27 (D33) — 욕구의 위치성: 물에서 나오면 배고픔이 차서 가까운 먹거리를 먼저 찾는다 · 걸어온 손님도 2~4명 팀 */
describe('P27 욕구의 위치성 · 걸어온 팀', () => {
  it('첫날 걸어온 손님이 팀 번호를 갖고(2~4명 무리) 자리를 잡는다', () => {
    const g = new Game(27);
    g.step(TICKS_PER_DAY - 200);
    const teams = new Map<number, number>();
    for (const x of g.guests.all) if (x.teamId !== null) teams.set(x.teamId, (teams.get(x.teamId) ?? 0) + 1);
    expect(g.stats.teamGuests).toBeGreaterThan(10);
    expect([...teams.values()].every((n) => n <= 4)).toBe(true);
    expect(g.stats.teamSeated).toBeGreaterThan(0);
  });
  it('수영을 마치면 배고픔 +30 · 식당을 쓰면 0 · 배고픈 손님은 식당 가중이 ×3 에 감쇠가 좁아진다', () => {
    const g = new Game(27); g.money = 100000;
    const s = g.guests.spawn();
    expect(s.hunger).toBe(0);
    const pool = g.pools.all[0]!;
    s.target = { kind: 'pool', id: pool.id }; s.state = 'walk'; s.stateTicks = 0;
    let left = 0;
    for (let k = 0; k < 400 && !left; k++) { g.step(1); if (s.hunger > 0) left = k; }
    expect(s.hunger).toBe(30); // balance.hungerPerSwim
    const vend = g.facilities.all.find((f) => f.defId === 'vending_out')!;
    s.target = { kind: 'facility', uid: vend.uid }; s.state = 'walk'; s.stateTicks = 0; s.hunger = 60;
    let ate = false;
    for (let k = 0; k < 300 && !ate; k++) { g.step(1); if (s.hunger === 0) ate = true; }
    expect(ate).toBe(true); // 먹으면 0 (그 뒤 다시 수영하면 오를 수 있다)
    const h = Game.fromSnapshot(g.toSnapshot());
    expect(h.guests.all.find((x) => x.uid === s.uid)!.hunger).toBe(0);
  });
  it('매점 위치 민감도 — 같은 시드 3일, 자리·물가 옆 매점 이용 ≥ 외진 왼쪽 구석 × 1.5 (전: 어디든 같았다 85~106)', () => {
    const run = (at: (g: Game) => [number, number]): number => { const g = new Game(7); g.money = 100000; g.rank = 1; g.openLand(1); /* P32: ★0 토지가 16칸이라 「외진 구석」이 없다 — ★1(28칸)에서 잰다 */ const [i, j] = at(g); const r = g.placeFacility('shop', i, j, 0); expect(r.ok).toBe(true); g.step(TICKS_PER_DAY * 3); return g.facilities.byUid(r.uid!)!.usesTotal; };
    const near = run((g) => [g.gate.i + 1, g.gate.j + 14]); // P48-b2: 만 북안 평상(gt.i+3, j+14)·킷 빠지 옆·마당 문 바로 아래 — 실측 128 vs 52
    const far = run((g) => [g.land.i0 + 1, g.gate.j + 12]); // 외진 왼쪽 가장자리 — 실측 33
    expect(near).toBeGreaterThanOrEqual(far * 1.5);
  }, 60000);
});

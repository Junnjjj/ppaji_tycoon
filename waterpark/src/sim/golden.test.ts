import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import { runBot, hashSnapshot } from './bot.js';

/**
 * 골든 — 시드 3개 × 16일. 해시가 바뀌면 **밸런스나 규칙이 바뀐 것**이다: 의도한 변경이면
 * 아래 표를 갱신하고 그 이유를 커밋에 적는다. 의도하지 않았으면 어디서 결정론이 깨졌는지 찾는다.
 */
const GOLDEN: Record<number, { hash: number; visitors: number }> = {
  1: { hash: 0, visitors: 0 },
  2: { hash: 0, visitors: 0 },
  3: { hash: 0, visitors: 0 },
};

describe('골든 시나리오', () => {
  it('같은 시드는 두 번 돌려도 같은 해시 (결정론)', () => {
    for (const seed of [1, 2, 3]) {
      const a = runBot(new Game(seed), 16);
      const b = runBot(new Game(seed), 16);
      expect(a.snapshotHash).toBe(b.snapshotHash);
      expect(a.visitors).toBeGreaterThan(0);
    }
  });
  it('스냅샷 왕복 뒤 이어 돌려도 같은 해시', () => {
    const a = new Game(4);
    runBot(a, 8);
    const b = Game.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    runBot(a, 8);
    runBot(b, 8);
    expect(hashSnapshot(a.toSnapshot())).toBe(hashSnapshot(b.toSnapshot()));
  });
  it('골든 표와 일치한다 (표가 0 이면 아직 안 박은 것 — 값을 출력한다)', () => {
    for (const seed of [1, 2, 3]) {
      const m = runBot(new Game(seed), 16);
      const g = GOLDEN[seed]!;
      if (g.hash === 0) {
        console.log(`GOLDEN[${seed}] = { hash: ${m.snapshotHash}, visitors: ${m.visitors} }`);
        continue;
      }
      expect(m.snapshotHash, `seed ${seed}`).toBe(g.hash);
      expect(m.visitors).toBe(g.visitors);
    }
  });
});

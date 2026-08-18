import { describe, it, expect } from 'vitest';
import { Rng } from '../sim/rng.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid, EDGE_SOLID, DIR_J_MINUS } from '../sim/kairo/walls.js';
import { PlacementGrid } from '../sim/kairo/placement.js';
import { GuestStore } from '../sim/kairo/guests.js';
import { WeekRunner } from '../sim/kairo/week.js';
import { ProgressStore, questStatuses } from '../sim/kairo/progress.js';
import {
  packKairo,
  restoreKairo,
  migrateKairo,
  KairoSaveError,
  KAIRO_SAVE_VERSION,
  type KairoSaveInput,
} from './kairo.js';

/**
 * 카이로 세이브 왕복 — **세이브 없이 기본 씬이 되면 폰에서 새로고침마다 다 날아간다.**
 *
 * 이 테스트가 못박는 것은 두 가지다:
 *   1. 저장 → JSON 문자열 → 복원이 같은 상태를 낸다 (JSON 을 실제로 거친다 —
 *      객체를 그대로 넘기면 직렬화 불가능한 값을 못 잡는다)
 *   2. 복원한 요약으로 등급·의뢰 판정이 그대로 돈다
 */

const GRID_W = 40;
const GRID_H = 32;
const GATE = { i: 2, j: 2 };

function build(): KairoSaveInput {
  const rng = new Rng(4242);
  const terrain = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1));
  /* 육지를 포장한다 — K32-B 부터 잔디는 손님이 못 지나간다 (길 규칙은 별도 테스트가 본다) */
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) if (terrain.isWalkable(i, j)) terrain.paint(i, j, 'path_stone');
  }
  const walls = new WallGrid(GRID_W, GRID_H);
  const placement = new PlacementGrid(GRID_W, GRID_H);
  // 벽부착 시설을 놓을 수 있게 경계를 준다 (K25: 벽은 타일이 아니라 경계에 있다)
  for (let i = 10; i < 20; i++) walls.setEdge(i, 5, DIR_J_MINUS, EDGE_SOLID);
  placement.place(terrain, walls, GATE, 'ticket', 4, 2);
  placement.place(terrain, walls, GATE, 'shop', 8, 3);
  placement.place(terrain, walls, GATE, 'pyeongsang_row', 8, 8);

  const guests = new GuestStore(terrain, walls, placement, GATE);
  const week = new WeekRunner(terrain, placement, guests);
  const weekRng = new Rng(31337);
  const rep = week.run(weekRng, { season: 'summer' });
  week.spend(1_000_000);

  const progress = new ProgressStore();
  const summary = {
    visitors: rep.visitors,
    turnedAway: rep.turnedAway,
    profit: rep.profit,
    exitSatisfaction: rep.exitSatisfaction,
  };
  progress.claim(questStatuses(placement, summary));

  return {
    seed: 4242,
    gate: GATE,
    terrain,
    walls,
    placement,
    progress,
    week: week.toSnapshot(),
    weekRngState: weekRng.state,
    season: 'summer',
    lastSummary: summary,
  };
}

describe('카이로 세이브', () => {
  const input = build();
  // ★ JSON 을 실제로 거친다 — 객체를 그대로 넘기면 직렬화 못 되는 값을 놓친다
  const round = restoreKairo(JSON.parse(JSON.stringify(packKairo(input, 1_700_000_000_000))));

  it('지형이 칸 단위로 같다', () => {
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        expect(round.terrain.kindAt(i, j)).toBe(input.terrain.kindAt(i, j));
      }
    }
  });

  it('벽이 같다', () => {
    let same = 0;
    for (let i = 10; i < 20; i++) {
      expect(round.walls.mask(i, 5)).toBe(input.walls.mask(i, 5));
      same++;
    }
    expect(same).toBe(10);
  });

  it('시설 3개가 같은 자리에 있다', () => {
    expect(round.placement.count).toBe(3);
    for (const item of input.placement.all()) {
      const hit = round.placement.at(item.i, item.j);
      expect(hit?.defId).toBe(item.defId);
    }
  });

  it('현금·주차가 같다 — 건설비를 쓴 뒤의 잔액이어야 한다', () => {
    expect(round.week.cash).toBe(input.week.cash);
    expect(round.week.week).toBe(input.week.week);
    expect(round.week.cash).toBeLessThan(5_000_000);
  });

  it('RNG 상태가 같다 — 같은 세이브가 같은 다음 주를 낸다', () => {
    expect(round.weekRngState).toBe(input.weekRngState);
    const a = Rng.fromState(round.weekRngState);
    const b = Rng.fromState(input.weekRngState);
    expect(a.next()).toBe(b.next());
  });

  it('받은 의뢰가 다시 지급되지 않는다', () => {
    expect(round.progress.claimedCount).toBe(input.progress.claimedCount);
    const again = round.progress.claim(questStatuses(round.placement, round.lastSummary));
    expect(again.cash).toBe(0);
  });

  it('복원한 요약으로 의뢰 판정이 돈다 — 히트맵을 저장하지 않아도 된다', () => {
    const st = questStatuses(round.placement, round.lastSummary);
    expect(st.length).toBeGreaterThan(0);
    expect(st.some((x) => x.detail.includes('/'))).toBe(true);
  });

  it('복원한 시뮬로 다음 주가 계속 돈다', () => {
    const guests = new GuestStore(round.terrain, round.walls, round.placement, round.gate);
    const week = new WeekRunner(round.terrain, round.placement, guests);
    week.restore(round.week);
    const rep = week.run(Rng.fromState(round.weekRngState), { season: round.season });
    expect(rep.week).toBe(round.week.week + 1);
  });

  it('버전이 미래면 거부한다 — 조용히 열면 상태가 깨진 채로 돈다', () => {
    const future = { ...packKairo(input, 0), version: KAIRO_SAVE_VERSION + 1 };
    expect(() => migrateKairo(future)).toThrow(KairoSaveError);
  });

  it('필수 항목이 없으면 거부한다', () => {
    const broken = { ...packKairo(input, 0) } as Record<string, unknown>;
    delete broken['placement'];
    expect(() => migrateKairo(broken)).toThrow(KairoSaveError);
  });
});

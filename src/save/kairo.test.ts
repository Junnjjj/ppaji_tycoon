import { describe, it, expect } from 'vitest';
import { Rng } from '../sim/rng.js';
import { KairoTerrain, groundIndex } from '../sim/kairo/terrain.js';
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
  /*
   * ⚠ 한 주 수입보다 **큰** 금액을 쓴다. 100만이면 입장료(K36-B②)가 들어온 뒤로
   * 그 주 손익이 그걸 넘어서서, 아래 "잔액이 줄었다" 검사가 통과할 수 없다 —
   * 검사의 뜻은 "건설비가 반영됐다"이지 "매출이 적다"가 아니다.
   */
  week.spend(3_000_000);

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

/*
 * ─────────────────────────────────────────────────────────────────────────
 * K36 — 격자가 64×48 → 96×72 로 넓어졌다.
 *
 * **이 테스트의 이유:** `fromSnapshot` 셋이 전부 **저장된 크기**를 그대로 쓴다. 상수만
 * 올리고 마이그레이션을 안 하면, 새로 생긴 영역이 "잔디처럼 보이지만 영원히 죽은 칸"이
 * 된다 — `paint` 실패 · `outside` · 플로우필드 밖. 렌더는 그것도 그려 준다.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('★ 세이브 v3 → 최신 — 격자가 넓어져도 판이 살아남는다', () => {
  const BAND = KairoTerrain.CITY_BAND;

  /** 옛 64×48 세이브를 손으로 짓는다 — 실제로 나갔던 모양 */
  function oldSave(): Record<string, unknown> {
    const OW = 64;
    const OH = 48;
    const lawn = groundIndex('lawn');
    const water = groundIndex('water_edge');
    const kinds = new Array<number>(OW * OH).fill(lawn);
    // 아래 절반은 물 — 강이 이어지는지 볼 수 있어야 한다
    for (let j = 30; j < OH; j++) for (let i = 0; i < OW; i++) kinds[j * OW + i] = water;
    return {
      version: 3,
      savedAtMs: 0,
      seed: 7,
      gate: { i: 0, j: 0 },
      terrain: { w: OW, h: OH, kinds },
      walls: { w: OW, h: OH, ei: [], ej: [] },
      placement: {
        w: OW,
        h: OH,
        next: 4,
        items: [
          { handle: 1, defId: 'shop', i: 5, j: 5, level: 1 },
          { handle: 2, defId: 'ticket', i: 9, j: 5, level: 1 },
          { handle: 3, defId: 'cafe', i: 5, j: 9, level: 1 },
        ],
      },
      progress: { claimed: [], history: [] },
      week: { week: 3, cash: 4_200_000 },
      weekRngState: 1,
      season: 'summer',
      lastSummary: null,
      courses: {
        nextHandle: 2,
        courses: [
          {
            handle: 1,
            presetId: 'shuttle',
            equipId: 'peanut',
            vehicles: 1,
            dock: { x: 4, y: 31 },
            handles: [
              { x: 4, y: 35 },
              { x: 4, y: 40 },
            ],
          },
        ],
      },
    };
  }

  it('시설이 하나도 안 사라지고 상대 배치가 그대로다', () => {
    const m = migrateKairo(oldSave()) as unknown as {
      version: number;
      placement: { w: number; h: number; items: { defId: string; i: number; j: number }[] };
    };
    expect(m.version).toBe(KAIRO_SAVE_VERSION);
    expect(m.placement.items).toHaveLength(3);
    expect(m.placement.w).toBe(KairoTerrain.WIDTH);
    expect(m.placement.h).toBe(KairoTerrain.HEIGHT);
    // 가로는 그대로, 세로만 도시 띠만큼 내려간다 — 상대 배치가 보존된다
    const byId = new Map(m.placement.items.map((x) => [x.defId, x]));
    expect(byId.get('shop')).toMatchObject({ i: 5, j: 5 + BAND });
    expect(byId.get('ticket')).toMatchObject({ i: 9, j: 5 + BAND });
    expect(byId.get('cafe')).toMatchObject({ i: 5, j: 9 + BAND });
  });

  it('★ 새로 생긴 영역이 죽은 칸이 아니다 — 강이 이어지고 도시 띠가 생긴다', () => {
    const m = migrateKairo(oldSave()) as unknown as {
      terrain: { w: number; h: number; kinds: number[] };
    };
    const t = KairoTerrain.fromSnapshot({ w: m.terrain.w, h: m.terrain.h, kinds: m.terrain.kinds });
    expect(t.width).toBe(KairoTerrain.WIDTH);
    expect(t.height).toBe(KairoTerrain.HEIGHT);

    // 위 8줄은 도시 띠 — 못 짓는다
    for (let j = 0; j < BAND; j++) expect(t.isBuildable(3, j), `j=${j}`).toBe(false);
    // 입구 열은 뚫려 있다 (손님이 들어올 길)
    expect(t.isGuestWalkable(KairoTerrain.ENTRY_I, BAND - 1)).toBe(true);

    // 옛 격자 밖(오른쪽·아래)도 살아 있다 — 가장자리를 이어 붙였다
    expect(t.kindAt(90, 20)).toBe('lawn');
    expect(t.isWater(90, 60)).toBe(true); // 강이 오른쪽·아래로 이어진다
    // 그리고 실제로 칠할 수 있다 (죽은 칸이 아니다)
    expect(t.paint(90, 20, 'path_stone')).toBe(true);
  });

  it('코스도 같이 내려간다 — 안 내리면 선착장이 육지로 올라간다', () => {
    const m = migrateKairo(oldSave()) as unknown as {
      courses: { courses: { dock: { x: number; y: number }; handles: { y: number }[] }[] };
    };
    const c = m.courses.courses[0]!;
    expect(c.dock).toEqual({ x: 4, y: 31 + BAND });
    expect(c.handles.map((h) => h.y)).toEqual([35 + BAND, 40 + BAND]);
  });

  it('게이트가 새 입구로 옮겨간다 — 옛 (0,0) 은 이제 차도다', () => {
    const m = migrateKairo(oldSave()) as unknown as { gate: { i: number; j: number } };
    expect(m.gate).toEqual(KairoTerrain.parkGate());
  });

  it('⚠ 음성 대조군 — 마이그레이션이 없으면 새 영역이 죽은 칸이다', () => {
    /*
     * 옛 스냅샷을 **그대로** 복원하면 크기가 64×48 로 남는다. 새 상수(96×72)를 믿는
     * 렌더는 6,912장을 그리지만, 그중 3,840칸은 `paint` 조차 안 된다.
     */
    const old = oldSave();
    const t = KairoTerrain.fromSnapshot(
      old['terrain'] as { w: number; h: number; kinds: number[] },
    );
    expect(t.width).toBe(64);
    expect(t.paint(90, 20, 'path_stone')).toBe(false);
  });
});

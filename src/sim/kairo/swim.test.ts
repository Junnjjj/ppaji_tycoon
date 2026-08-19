import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import {
  poolZones,
  riverZones,
  permitUsed,
  deckKey,
  POOL_MIN_TILES,
  ZONE_HANDLE_BASE,
  swimRiskPoints,
  nightPools,
} from './swim.js';
import { evaluateCombos } from './combos.js';

/**
 * 수영 구역 (S1) — "바닥이 곧 방"의 물 버전.
 *
 * 지켜야 할 성질:
 *   · 수영장 = pool_water 덩어리 4칸+. 3칸은 장식 웅덩이 (음성)
 *   · 강 구역 = 덱으로 **밀폐된** 물. 열린 강에 닿으면 구역이 아니다 (음성: ㄷ자)
 *   · 구역은 저장이 아니라 파생 — 덱 하나를 빼면 사라지고 다시 놓으면 되살아난다
 *   · 허가 회계: 강 구역만 permitArea 를 소비하고, 넘기는 밀폐는 거절된다
 */

const GATE = { i: 0, j: 0 };

/** 위 8줄 땅(포장) + 아래 8줄 물. 물이 아래 가장자리에 닿아 "열린 강"이다 */
function shore(w = 16, h = 16): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) t.paint(i, j, j < 8 ? 'path_stone' : 'water_edge');
  }
  return t;
}

function pool(t: KairoTerrain, i0: number, j0: number, w: number, h: number): void {
  for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) t.paint(i, j, 'pool_water');
}

const alwaysStand = (): boolean => true;

describe('수영장 (땅) — pool_water 덩어리', () => {
  it('4칸 덩어리가 수영장이고 인접 포장이 입수점이다', () => {
    const t = shore();
    pool(t, 4, 3, 2, 2);
    const p = new PlacementGrid(t.width, t.height);
    const zones = poolZones(t, guestWalkable(t, p));
    expect(zones).toHaveLength(1);
    expect(zones[0]?.kind).toBe('pool');
    expect(zones[0]?.area).toBe(4);
    // 사방이 포장이라 입수점이 있다 — 문이 포장 닿은 쪽에 나는 규칙과 같다 (K32-B)
    expect(zones[0]?.entries.length).toBeGreaterThan(0);
  });

  it(`음성 — ${POOL_MIN_TILES - 1}칸은 장식 웅덩이다`, () => {
    const t = shore();
    pool(t, 4, 3, 3, 1);
    expect(poolZones(t, alwaysStand)).toHaveLength(0);
  });

  it('음성 — 잔디로 둘러싸이면 입수점이 없다 (no-entry 처방 대상)', () => {
    const t = shore();
    // 수영장 주변을 잔디(guestWalk: false)로
    for (let j = 2; j < 7; j++) for (let i = 3; i < 8; i++) t.paint(i, j, 'lawn');
    pool(t, 4, 3, 2, 2);
    const p = new PlacementGrid(t.width, t.height);
    const zones = poolZones(t, guestWalkable(t, p));
    expect(zones).toHaveLength(1);
    expect(zones[0]?.entries).toHaveLength(0);
  });

  it('떨어진 덩어리는 각자 수영장이다', () => {
    const t = shore();
    pool(t, 2, 2, 2, 2);
    pool(t, 8, 2, 2, 3);
    const zones = poolZones(t, alwaysStand);
    expect(zones.map((z) => z.area).sort()).toEqual([4, 6]);
  });
});

/** (4..7, 8..11) 테두리에 덱 12장 — 안쪽 (5..6, 9..10) 2×2 가 밀폐된다 */
function ringKeys(skip?: [number, number]): Set<number> {
  const out = new Set<number>();
  for (let i = 4; i <= 7; i++) {
    for (const j of [8, 11]) {
      if (skip && skip[0] === i && skip[1] === j) continue;
      out.add(deckKey(i, j));
    }
  }
  for (const j of [9, 10]) {
    for (const i of [4, 7]) {
      if (skip && skip[0] === i && skip[1] === j) continue;
      out.add(deckKey(i, j));
    }
  }
  return out;
}

describe('수영 구역 (강) — 덱 밀폐', () => {
  it('덱 고리로 둘러싸면 안쪽 물이 구역이 된다', () => {
    const t = shore();
    const zones = riverZones(t, ringKeys(), alwaysStand);
    expect(zones).toHaveLength(1);
    expect(zones[0]?.kind).toBe('river');
    expect(zones[0]?.area).toBe(4);
    // 입수점 = 구역에 인접한 덱 (2×2 의 사방 테두리 중 변에 접한 8장)
    expect(zones[0]?.entries.length).toBeGreaterThan(0);
  });

  it('음성 — 뭍으로만 둘러싸인 자연 연못은 구역이 아니다 (덱 0장)', () => {
    const t = shore();
    // 땅 한가운데 물 2×2 — 밀폐지만 덱이 없다
    for (let j = 3; j < 5; j++) for (let i = 3; i < 5; i++) t.paint(i, j, 'water_edge');
    expect(riverZones(t, new Set(), alwaysStand)).toHaveLength(0);
  });

  it('음성 — 한 장이 빠지면(ㄷ자) 열린 강과 이어져 구역이 아니다', () => {
    const t = shore();
    expect(riverZones(t, ringKeys([5, 11]), alwaysStand)).toHaveLength(0);
  });

  it('파생 왕복 — 덱을 빼면 사라지고 다시 놓으면 되살아난다 (희망 ≠ 상태)', () => {
    const t = shore();
    const broken = ringKeys([5, 11]);
    expect(riverZones(t, broken, alwaysStand)).toHaveLength(0);
    broken.add(deckKey(5, 11));
    expect(riverZones(t, broken, alwaysStand)).toHaveLength(1);
  });

  it('허가 회계 — 강 구역만 소비하고 수영장은 소비하지 않는다', () => {
    const t = shore();
    pool(t, 2, 2, 2, 2);
    const river = riverZones(t, ringKeys(), alwaysStand);
    const land = poolZones(t, alwaysStand);
    expect(permitUsed([...river, ...land])).toBe(4);
  });
});

describe('permit-over — 밀폐를 완성하는 배치가 허가를 넘으면 거절 (S1)', () => {
  /** 고리의 마지막 한 장(6,11)만 남기고 전부 실제로 놓는다 */
  function ringAllButLast(t: KairoTerrain): { p: PlacementGrid; w: WallGrid } {
    const p = new PlacementGrid(t.width, t.height);
    const w = new WallGrid(t.width, t.height);
    const order: [number, number][] = [
      // 윗줄부터 — 뭍(j=7)에 접해 requiresShoreOrDeck 를 사슬로 만족시킨다
      [4, 8], [5, 8], [6, 8], [7, 8],
      [4, 9], [7, 9], [4, 10], [7, 10],
      [4, 11], [5, 11], [7, 11],
    ];
    for (const [i, j] of order) {
      const r = p.place(t, w, GATE, 'float_deck', i, j);
      expect(r.ok, `덱 (${i},${j})`).toBe(true);
    }
    return { p, w };
  }

  it('허가가 모자라면 마지막 한 장이 거절된다 — 처방은 등급', () => {
    const t = shore();
    const { p, w } = ringAllButLast(t);
    const r = p.check(t, w, GATE, 'float_deck', 6, 11, { permitArea: 3 });
    expect(r.ok).toBe(false);
    expect(r.fail).toBe('permit-over');
  });

  it('허가가 충분하면 같은 배치가 통과한다 (음성 대조군)', () => {
    const t = shore();
    const { p, w } = ringAllButLast(t);
    expect(p.check(t, w, GATE, 'float_deck', 6, 11, { permitArea: 4 }).ok).toBe(true);
  });

  it('밀폐를 만들지 않는 덱은 허가 0 이어도 통과한다', () => {
    const t = shore();
    const p = new PlacementGrid(t.width, t.height);
    const w = new WallGrid(t.width, t.height);
    expect(p.check(t, w, GATE, 'float_deck', 10, 8, { permitArea: 0 }).ok).toBe(true);
  });

  it('permitArea 를 안 주면 기존 동작 그대로다 (하위호환)', () => {
    const t = shore();
    const { p, w } = ringAllButLast(t);
    expect(p.check(t, w, GATE, 'float_deck', 6, 11).ok).toBe(true);
  });
});

describe('수영 활동 (S2) — 손님이 실제로 들어가 헤엄치고 나온다', () => {
  /** 포장 세계 + 수영장 3×2. 다른 시설이 없어 손님의 유일한 목적지가 구역이다 */
  function poolWorld(): { t: KairoTerrain; g: GuestStore } {
    const t = new KairoTerrain(16, 16);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) t.paint(i, j, 'path_stone');
    pool(t, 6, 6, 3, 2);
    const w = new WallGrid(16, 16);
    const p = new PlacementGrid(16, 16);
    const g = new GuestStore(t, w, p, GATE, { ...OPEN_GATE_DEFAULTS, wantUses: 1 });
    return { t, g };
  }

  it('구역이 목적지가 되고, 헤엄치는 동안 pose 가 swim 이며 물칸 위에 있다', () => {
    const { t, g } = poolWorld();
    const rng = new Rng(7);
    const guest = g.spawn(rng);
    expect(guest).not.toBeNull();
    let sawSwim = false;
    for (let k = 0; k < 400 && guest!.state !== 'gone'; k++) {
      g.tick(rng);
      if (guest!.pose === 'swim' && guest!.state === 'using') {
        sawSwim = true;
        expect(guest!.usingHandle).toBeGreaterThanOrEqual(ZONE_HANDLE_BASE);
        expect(t.kindAt(guest!.i, guest!.j)).toBe('pool_water');
      }
    }
    expect(sawSwim).toBe(true);
  });

  it('나올 때 입수점(설 수 있는 칸)으로 올라와 갇히지 않는다 · play 요금이 걷힌다', () => {
    const { g } = poolWorld();
    const rng = new Rng(7);
    const guest = g.spawn(rng);
    for (let k = 0; k < 800 && guest!.state !== 'gone'; k++) g.tick(rng);
    // wantUses 1 — 수영 한 번이 이용 한 번으로 세어져 나간다 (갇히면 gone 이 못 된다)
    expect(guest!.state).toBe('gone');
    const w = g.takeFinished();
    expect(w.feeByNeed.get('play') ?? 0).toBeGreaterThan(0);
  });

  it('음성 대조군 — 수영장이 없으면 swim 목적지도 play 요금도 없다', () => {
    const t = new KairoTerrain(16, 16);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) t.paint(i, j, 'path_stone');
    const g = new GuestStore(t, new WallGrid(16, 16), new PlacementGrid(16, 16), GATE, {
      ...OPEN_GATE_DEFAULTS,
      wantUses: 1,
    });
    const rng = new Rng(7);
    const guest = g.spawn(rng);
    for (let k = 0; k < 400 && guest!.state !== 'gone'; k++) {
      g.tick(rng);
      expect(guest!.pose).not.toBe('swim');
    }
    expect(g.swimZones()).toHaveLength(0);
  });

  it('위험 기여 — 구역 수 × 2 (코스 위험과 같은 축)', () => {
    const { g } = poolWorld();
    expect(swimRiskPoints(g.swimZones())).toBe(2);
  });
});

describe('zone 콤보 + 나이트풀 (S4)', () => {
  it('풀 파티 — 수영장 반경 3 안의 DJ 부스로 발동. 구역을 안 주면 조용히 0 (음성)', () => {
    const t = shore();
    pool(t, 4, 3, 2, 2);
    const p = new PlacementGrid(t.width, t.height);
    const w = new WallGrid(t.width, t.height);
    const r = p.place(t, w, GATE, 'dj_booth', 7, 3);
    expect(r.ok).toBe(true);
    const zones = poolZones(t, alwaysStand);
    const withZones = evaluateCombos(p, undefined, zones);
    expect(withZones.active.some((c) => c.id === 'medium_pool_party')).toBe(true);
    // 음성 ① — 구역을 안 넘기면 발동하지 않는다 (호출부가 빠뜨리면 이 모양이 된다)
    expect(evaluateCombos(p).active.some((c) => c.id === 'medium_pool_party')).toBe(false);
    // 음성 ② — DJ 가 멀면 발동하지 않는다
    const p2 = new PlacementGrid(t.width, t.height);
    p2.place(t, w, GATE, 'dj_booth', 13, 6);
    expect(
      evaluateCombos(p2, undefined, zones).active.some((c) => c.id === 'medium_pool_party'),
    ).toBe(false);
  });

  it('나이트풀 — DJ 부스가 붙은 수영장 수. 저녁 부스트로 수영 만족이 더 오른다', () => {
    const t = shore();
    pool(t, 4, 3, 2, 2);
    const zones = poolZones(t, alwaysStand);
    expect(nightPools(zones, [{ x: 6, y: 3 }])).toBe(1);
    expect(nightPools(zones, [{ x: 12, y: 7 }])).toBe(0); // 음성 — 멀다

    // 부스트 유무로 같은 시드를 두 번 — 퇴장 만족 합이 갈라져야 한다
    const run = (boost: boolean): number => {
      const t2 = new KairoTerrain(16, 16);
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) t2.paint(i, j, 'path_stone');
      pool(t2, 6, 6, 2, 2);
      const g = new GuestStore(t2, new WallGrid(16, 16), new PlacementGrid(16, 16), GATE, {
        ...OPEN_GATE_DEFAULTS,
        wantUses: 1,
      });
      g.swimBoost = boost;
      const rng = new Rng(11);
      const guest = g.spawn(rng);
      let last = 0;
      for (let k = 0; k < 600 && guest!.state !== 'gone'; k++) {
        g.tick(rng);
        last = guest!.satisfaction;
      }
      return last;
    };
    expect(run(true)).toBe(run(false) + 5);
  });

  /**
   * P1-A — 파생 구역으로도 성립하나. `combos.test.ts` 는 구역을 평문으로 만들어 곡선을
   * 재고, 여기선 **실제로 판 수영장**의 `area` 가 그 곡선에 꽂히는지를 본다.
   * ⚠ 둘 중 하나만 있으면 "면적은 맞는데 파생이 틀렸다"를 못 잡는다.
   */
  it('면적 비례 — 실제로 판 수영장이 클수록 풀 파티가 커지고 상한에서 멈춘다', () => {
    const bonus = (pw: number, ph: number): number => {
      const t = shore();
      const p = new PlacementGrid(t.width, t.height);
      const wl = new WallGrid(t.width, t.height);
      // DJ 는 풀 서쪽 뭍에 — 어느 크기에서도 반경 3 안이고 풀에 안 잠긴다
      expect(p.place(t, wl, GATE, 'dj_booth', 2, 2).ok).toBe(true);
      pool(t, 4, 1, pw, ph);
      const zones = poolZones(t, guestWalkable(t, p));
      expect(zones).toHaveLength(1);
      expect(zones[0]!.area).toBe(pw * ph);
      const hits = evaluateCombos(p, undefined, zones).active.filter(
        (c) => c.id === 'medium_pool_party',
      );
      expect(hits).toHaveLength(1);
      return hits[0]!.satisfaction;
    };
    const min = bonus(2, 2); // 4칸 — 기준(8) 미만이라 예전 상수 그대로
    const mid = bonus(3, 6); // 18칸 — sqrt(18/8) = 1.5
    const big = bonus(6, 6); // 36칸 — 32칸을 넘어 상한 ×2
    expect(mid).toBeCloseTo(min * 1.5, 6);
    expect(big).toBeCloseTo(min * 2, 6);
  });

  it('빠지 오리지널 — 강 구역 + 스릴 2 + 구명함', () => {
    const t = shore();
    const p = new PlacementGrid(t.width, t.height);
    const w = new WallGrid(t.width, t.height);
    // 고리 덱을 실제로 놓는다 (permit 검사 절과 같은 순서) + 마지막 장
    const order: [number, number][] = [
      [4, 8], [5, 8], [6, 8], [7, 8],
      [4, 9], [7, 9], [4, 10], [7, 10],
      [4, 11], [5, 11], [7, 11], [6, 11],
    ];
    for (const [i, j] of order) expect(p.place(t, w, GATE, 'float_deck', i, j).ok).toBe(true);
    // 구역 인접 스릴 2 (다이빙대 2×2 — 고리 동쪽에 덱 스퍼를 내고 붙인다) + 구명함
    expect(p.place(t, w, GATE, 'float_deck', 8, 8).ok).toBe(true);
    expect(p.place(t, w, GATE, 'diving', 8, 9).ok).toBe(true);
    expect(p.place(t, w, GATE, 'float_deck', 3, 8).ok).toBe(true);
    expect(p.place(t, w, GATE, 'diving', 2, 9).ok).toBe(true);
    expect(p.place(t, w, GATE, 'lifering', 5, 7).ok).toBe(true);
    const zones = riverZones(t, p.waterBarrierKeys(), guestWalkable(t, p));
    expect(zones).toHaveLength(1);
    const r = evaluateCombos(p, undefined, zones);
    expect(r.active.some((c) => c.id === 'medium_ppaji_original')).toBe(true);
  });
});

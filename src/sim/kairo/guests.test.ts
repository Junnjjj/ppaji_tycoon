import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import {
  WallGrid,
  EDGE_SOLID,
  EDGE_DOOR,
  DIR_I_PLUS,
  DIR_J_MINUS,
} from './walls.js';
import { BuildingStore } from './building.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, GUEST_DEFAULTS, STUCK_LIMIT, type GuestTunables } from './guests.js';

const GATE = { i: 0, j: 0 };

function flat(w: number, h: number): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'lawn');
  return t;
}

interface World {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  g: GuestStore;
}

function world(tun: Partial<GuestTunables> = {}, size = 16): World {
  const t = flat(size, size);
  const w = new WallGrid(size, size);
  const p = new PlacementGrid(size, size);
  const g = new GuestStore(t, w, p, GATE, { ...GUEST_DEFAULTS, ...tun });
  return { t, w, p, g };
}

/** 손님이 다 나갈 때까지, 또는 상한까지 돌린다 */
function run(g: GuestStore, ticks: number, rng: Rng, spawnEvery = 0): void {
  for (let k = 0; k < ticks; k++) {
    if (spawnEvery > 0 && k % spawnEvery === 0) g.spawn(rng);
    g.tick(rng);
  }
}

describe('입장', () => {
  it('게이트에서 생긴다', () => {
    const { g } = world();
    const guest = g.spawn(new Rng(1));
    expect(guest).not.toBeNull();
    expect(guest!.i).toBe(GATE.i);
    expect(guest!.j).toBe(GATE.j);
    expect(g.count).toBe(1);
  });

  it('상한을 넘지 않는다 — 동시 60명', () => {
    const { g } = world({ maxGuests: 5 });
    const rng = new Rng(1);
    for (let k = 0; k < 20; k++) g.spawn(rng);
    expect(g.count).toBe(5);
  });

  it('기본 상한이 60 이다', () => {
    expect(GUEST_DEFAULTS.maxGuests).toBe(60);
  });

  it('게이트가 못 걷는 칸이면 입장 실패', () => {
    const { t, g } = world();
    t.paint(GATE.i, GATE.j, 'water_edge');
    expect(g.spawn(new Rng(1))).toBeNull();
  });
});

describe('시설로 걸어가 이용한다', () => {
  it('시설이 없으면 아무도 이용하지 못하고 결국 나간다', () => {
    const { g } = world({ patienceTicks: 20 });
    const rng = new Rng(2);
    g.spawn(rng);
    run(g, 200, rng);
    const s = g.stats();
    expect(s.exited).toBe(1);
    expect(s.gaveUp).toBe(1);
    expect(s.exitSatisfaction).toBeLessThan(50);
  });

  it('시설이 있으면 걸어가 이용하고 만족도가 오른다', () => {
    const { t, w, p, g } = world({ wantUses: 1, useTicks: 5 });
    expect(p.place(t, w, GATE, 'shop', 6, 6).ok).toBe(true);
    g.invalidate();
    const rng = new Rng(3);
    g.spawn(rng);
    run(g, 400, rng);
    const s = g.stats();
    expect(s.exited).toBe(1);
    expect(s.gaveUp).toBe(0);
    expect(s.exitSatisfaction).toBeGreaterThan(50);
  });

  it('정원을 넘겨 동시에 이용하지 않는다 — 슬롯 계약', () => {
    const { t, w, p, g } = world({ maxGuests: 20, useTicks: 200, wantUses: 9 });
    const r = p.place(t, w, GATE, 'shop', 6, 6); // capacity 2
    expect(r.ok).toBe(true);
    g.invalidate();
    const rng = new Rng(4);
    const handle = r.placed!.handle;
    let maxSeen = 0;
    for (let k = 0; k < 600; k++) {
      if (k % 5 === 0) g.spawn(rng);
      g.tick(rng);
      const occupied = g.occupancy(handle).filter((x) => x !== 0).length;
      maxSeen = Math.max(maxSeen, occupied);
      expect(occupied).toBeLessThanOrEqual(2);
    }
    expect(maxSeen).toBeGreaterThan(0);
  });

  it('다중칸 시설은 칸 수만큼 동시에 찬다 — 카이로의 영리한 설계', () => {
    const { t, w, p, g } = world({ maxGuests: 30, useTicks: 300, wantUses: 9 }, 20);
    /*
     * 코인락커 열 4×1 은 **실내 시설**이다 (K25 검토 ①) — 방을 먼저 짓는다.
     * 벽에 접하기만 해서는 안 된다.
     */
    const b = new BuildingStore();
    expect(b.place(t, w, GATE, { i: 4, j: 5, w: 7, h: 3 }).ok).toBe(true);
    const r = p.place(t, w, GATE, 'locker_row', 5, 6, { indoor: (i, j) => b.isIndoor(i, j) });
    expect(r.ok).toBe(true);
    g.invalidate();
    const rng = new Rng(5);
    let maxSeen = 0;
    for (let k = 0; k < 900; k++) {
      if (k % 4 === 0) g.spawn(rng);
      g.tick(rng);
      maxSeen = Math.max(maxSeen, g.occupancy(r.placed!.handle).filter((x) => x !== 0).length);
    }
    expect(maxSeen).toBe(4);
  });

  it('시설을 지우면 이용 중이던 손님이 풀려난다', () => {
    const { t, w, p, g } = world({ useTicks: 500, wantUses: 9 });
    const r = p.place(t, w, GATE, 'shop', 4, 4);
    g.invalidate();
    const rng = new Rng(6);
    g.spawn(rng);
    run(g, 200, rng);
    expect(g.occupancy(r.placed!.handle).some((x) => x !== 0)).toBe(true);
    p.remove(r.placed!.handle);
    g.invalidate();
    g.tick(rng);
    expect(g.occupancy(r.placed!.handle).filter((x) => x !== 0)).toHaveLength(0);
    expect(g.all[0]?.usingHandle).toBe(0);
  });
});

describe('길찾기', () => {
  it('벽으로 막힌 시설로는 못 간다 — 참다가 나간다', () => {
    const { t, w, p, g } = world({ patienceTicks: 30 }, 14);
    /*
     * 시설을 구석에 놓고 그 구석을 벽으로 봉한다 (배치 후 봉해야 unreachable 검사를 통과).
     * 경계 벽이므로 칸이 아니라 **칸과 칸 사이**를 막는다.
     */
    const r = p.place(t, w, GATE, 'shop', 11, 11);
    expect(r.ok).toBe(true);
    for (let i = 9; i < 14; i++) w.setEdge(i, 10, DIR_J_MINUS, EDGE_SOLID);
    for (let j = 10; j < 14; j++) w.setEdge(9, j, DIR_I_PLUS, EDGE_SOLID);
    g.invalidate();
    const rng = new Rng(7);
    g.spawn(rng);
    run(g, 300, rng);
    expect(g.stats().gaveUp).toBe(1);
  });

  it('문을 내면 갈 수 있게 된다', () => {
    const { t, w, p, g } = world({ patienceTicks: 400, wantUses: 1, useTicks: 5 }, 14);
    const r = p.place(t, w, GATE, 'shop', 11, 11);
    expect(r.ok).toBe(true);
    for (let i = 9; i < 14; i++) w.setEdge(i, 10, DIR_J_MINUS, EDGE_SOLID);
    for (let j = 10; j < 14; j++) w.setEdge(9, j, DIR_I_PLUS, EDGE_SOLID);
    w.setEdge(10, 10, DIR_J_MINUS, EDGE_DOOR); // 문
    g.invalidate();
    const rng = new Rng(8);
    g.spawn(rng);
    run(g, 600, rng);
    expect(g.stats().gaveUp).toBe(0);
    expect(g.stats().exited).toBe(1);
  });

  it('손님이 실제로 움직인다', () => {
    const { t, w, p, g } = world();
    p.place(t, w, GATE, 'shop', 8, 8);
    g.invalidate();
    const rng = new Rng(9);
    const guest = g.spawn(rng)!;
    const start = { i: guest.i, j: guest.j };
    run(g, 60, rng);
    const live = g.all[0];
    expect(live).toBeDefined();
    expect(live!.i !== start.i || live!.j !== start.j).toBe(true);
  });

  it('걷는 방향이 이동에 맞게 정해진다', () => {
    const { t, w, p, g } = world();
    p.place(t, w, GATE, 'shop', 8, 0); // +X 쪽
    g.invalidate();
    const rng = new Rng(10);
    g.spawn(rng);
    run(g, 40, rng);
    const live = g.all[0];
    expect(live).toBeDefined();
    expect(['+X', '+Z', '-X', '-Z']).toContain(live!.facing);
  });
});

describe('표정·이모트', () => {
  it('표정은 만족도에서 파생된다 — 따로 관리하면 두 값이 어긋난다', () => {
    const { t, w, p, g } = world({ wantUses: 3, useTicks: 3 });
    p.place(t, w, GATE, 'cafe', 5, 5);
    g.invalidate();
    const rng = new Rng(11);
    g.spawn(rng);
    run(g, 300, rng);
    // 만족한 손님이 나갔다면 퇴장 만족도가 높다
    expect(g.stats().exitSatisfaction).toBeGreaterThan(50);
  });

  it('이모트가 떴다가 사라진다', () => {
    const { t, w, p, g } = world({ wantUses: 1, useTicks: 3, emoteTicks: 5 });
    p.place(t, w, GATE, 'shop', 3, 3);
    g.invalidate();
    const rng = new Rng(12);
    g.spawn(rng);
    let sawEmote = false;
    for (let k = 0; k < 200; k++) {
      g.tick(rng);
      if (g.all[0]?.emote) sawEmote = true;
    }
    expect(sawEmote).toBe(true);
  });

  it('갈 곳이 없으면 불만 이모트가 뜬다', () => {
    const { g } = world({ patienceTicks: 500, emoteTicks: 20 });
    const rng = new Rng(13);
    g.spawn(rng);
    let sawNeutral = false;
    for (let k = 0; k < 200; k++) {
      g.tick(rng);
      if (g.all[0]?.emote === 'neutral') sawNeutral = true;
    }
    expect(sawNeutral).toBe(true);
  });
});

describe('퇴장 만족도가 평판의 기반 — "현재 평균"은 함정이다', () => {
  it('할 게 없으면 퇴장 만족도가 낮다', () => {
    const { g } = world({ patienceTicks: 20 });
    const rng = new Rng(14);
    run(g, 400, rng, 10);
    const s = g.stats();
    expect(s.exited).toBeGreaterThan(3);
    expect(s.exitSatisfaction).toBeLessThan(40);
  });

  it('시설이 많으면 퇴장 만족도가 높다 — 배치가 결과를 바꾼다', () => {
    const { t, w, p, g } = world({ wantUses: 2, useTicks: 10, patienceTicks: 400 }, 20);
    for (const [i, j] of [
      [5, 5],
      [9, 5],
      [5, 9],
      [9, 9],
    ] as const) {
      expect(p.place(t, w, GATE, 'shop', i, j).ok).toBe(true);
    }
    g.invalidate();
    const rng = new Rng(15);
    run(g, 900, rng, 12);
    const s = g.stats();
    expect(s.exited).toBeGreaterThan(3);
    expect(s.exitSatisfaction).toBeGreaterThan(55);
  });
});

describe('결정론 — 헤드리스 밸런싱의 전제', () => {
  it('같은 시드·같은 배치는 같은 결과를 낸다', () => {
    const shot = (seed: number): string => {
      const { t, w, p, g } = world({}, 18);
      p.place(t, w, GATE, 'shop', 6, 6);
      p.place(t, w, GATE, 'cafe', 10, 6);
      g.invalidate();
      const rng = new Rng(seed);
      run(g, 500, rng, 8);
      const s = g.stats();
      return JSON.stringify({
        s,
        pos: g.all.map((x) => [x.i, x.j, x.state, x.pose, x.palette]),
      });
    };
    expect(shot(100)).toBe(shot(100));
  });

  it('다른 시드는 다른 결과를 낸다', () => {
    const shot = (seed: number): string => {
      const { t, w, p, g } = world({}, 18);
      p.place(t, w, GATE, 'shop', 6, 6);
      p.place(t, w, GATE, 'cafe', 10, 6);
      g.invalidate();
      const rng = new Rng(seed);
      run(g, 500, rng, 8);
      return JSON.stringify(g.all.map((x) => [x.i, x.j, x.palette]));
    };
    expect(shot(100)).not.toBe(shot(999));
  });

  it('Math.random 을 쓰지 않는다 — 소스에 없다', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/sim/kairo/guests.ts', 'utf8'),
    );
    expect(src).not.toContain('Math.random');
    expect(src).not.toContain('Date.now');
  });
});

describe('렌더 보간 — 시뮬 상태를 바꾸지 않는다', () => {
  it('progress 가 0→1 로 차오른다', () => {
    const { t, w, p, g } = world();
    p.place(t, w, GATE, 'shop', 8, 8);
    g.invalidate();
    const rng = new Rng(16);
    g.spawn(rng);
    run(g, 10, rng);
    const guest = g.all[0]!;
    guest.progress = 0;
    g.advanceRenderProgress(0.05);
    expect(guest.progress).toBeGreaterThan(0);
    g.advanceRenderProgress(10);
    expect(guest.progress).toBe(1);
  });

  it('보간은 타일 좌표를 바꾸지 않는다', () => {
    const { t, w, p, g } = world();
    p.place(t, w, GATE, 'shop', 8, 8);
    g.invalidate();
    const rng = new Rng(17);
    g.spawn(rng);
    run(g, 20, rng);
    const before = g.all.map((x) => [x.i, x.j]);
    g.advanceRenderProgress(1);
    expect(g.all.map((x) => [x.i, x.j])).toEqual(before);
  });
});

describe('갇힌 손님 — 판이 얼어붙지 않는다', () => {
  /**
   * ⚠ 배치 검사는 **지형과 벽만** 본다 (`reachable(terrain, walls, gate)`) — 다른 시설은
   * 보지 않으므로 시설로 걸을 수 있는 구역이 막힐 수 있다. 그러면 그 안의 손님은 게이트로
   * 갈 길이 없고, 거리장이 −1 이라 한 걸음도 못 뗀다.
   *
   * 안전 밸브가 없으면: 퇴장이 없으니 정원이 영원히 차 있고 → 주간 입장 0 →
   * 퇴장 만족도 0(퇴장 없음) → 등급 1 → 상한 30 → 그 30 이 갇힌 손님으로 차 있어
   * **돌아올 길이 없다.** 312주 실측에서 12판 중 4판이 이 상태로 끝났다
   * (현금 5,569만 · 직원 15.4명 · 개선 5.00 인데 만족도 0 — 돈 문제가 아니었다).
   */
  it('길이 없으면 결국 사라진다 — 안 그러면 정원이 영원히 찬다', () => {
    const t = new KairoTerrain(20, 20);
    // 물 바다에 잔디 두 조각: 게이트 쪽과 고립된 쪽
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) t.paint(i, j, 'water_edge');
    t.paint(1, 1, 'lawn');
    t.paint(15, 15, 'lawn'); // 고립된 칸
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    const g = new GuestStore(t, w, p, { i: 1, j: 1 }, GUEST_DEFAULTS);
    g.invalidate();

    const guest = g.spawn(new Rng(1), 'summer');
    expect(guest).not.toBeNull();
    // 고립된 칸으로 옮긴다 — 시설이 구역을 끊은 상황을 흉내낸다
    const target = guest as NonNullable<typeof guest>;
    target.i = 15;
    target.j = 15;
    target.fromI = 15;
    target.fromJ = 15;
    target.state = 'leaving';

    const rng = new Rng(2);
    for (let tick = 0; tick < STUCK_LIMIT * 6; tick++) g.tick(rng);

    expect(g.count).toBe(0); // 정원이 비었다
    expect(g.stats().exited).toBe(1);
  });

  it('길이 있으면 갇힘 판정이 안 걸린다 — 멀쩡한 손님을 내보내면 안 된다', () => {
    const t = new KairoTerrain(20, 20);
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) t.paint(i, j, 'lawn');
    const w = new WallGrid(20, 20);
    const p = new PlacementGrid(20, 20);
    p.place(t, w, { i: 1, j: 1 }, 'shop', 8, 8);
    const g = new GuestStore(t, w, p, { i: 1, j: 1 }, GUEST_DEFAULTS);
    g.invalidate();
    const rng = new Rng(3);
    for (let k = 0; k < 6; k++) g.spawn(rng, 'summer');
    // 몇 tick 만 돌린다 — 아직 아무도 나갈 이유가 없다
    for (let tick = 0; tick < 40; tick++) g.tick(rng);
    expect(g.count).toBe(6);
    expect(g.stats().exited).toBe(0);
  });
});

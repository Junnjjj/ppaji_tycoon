import { describe, it, expect, afterEach } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  guestWalkable,
  SPECIALTY_LEVEL,
} from './placement.js';
import {
  GuestStore,
  OPEN_GATE_DEFAULTS,
  STUCK_LIMIT,
  setSlotRestoreFaultForTest,
  type Guest,
} from './guests.js';

/**
 * **손님이 슬롯 칸 위에 선다** + **이용을 마치면 안 갇힌다** (K52 5단계).
 *
 * 두 가지가 한 쌍인 이유가 이 파일의 요지다. 슬롯 칸은 발자국 안이라 **여전히 못 걷는
 * 칸**이고(`guestWalkable` 은 한 글자도 안 바꿨다) — 그러니 앉히는 것과 되돌리는 것은
 * 같은 배선의 앞뒤다. 되돌리기가 없던 시절이 E① 이었다: 이용 종료 복원이 **수영 구역
 * 분기 안에만** 있어서, 슬라이드를 탄 손님이 출구에 남아 거리장 `UNREACHABLE` →
 * "길이 막혔다" 분기에서 `STUCK_LIMIT`(200) × `ticksPerStep`(4) = **800 tick** 얼었다.
 *
 * ⚠ **손님을 실제로 굴려서 잰다** (`ride.test.ts`·`entry.test.ts` 와 같은 방식).
 * `slotTileOf` 를 두 번 불러 같은지 보는 검사는 배선이 통째로 빠져도 통과한다 —
 * 앉은 칸은 **손님에게서** 읽는다.
 */

const GATE = { i: 0, j: 0 };
const SIZE = 24;

interface World {
  t: KairoTerrain;
  walls: WallGrid;
  p: PlacementGrid;
}

/** 사방이 포장된 평지 — 걸을 수 있는 칸이 격자 전체라 "발자국 안"만이 변수다 */
function paved(): World {
  const t = new KairoTerrain(SIZE, SIZE);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) t.paint(i, j, 'path_stone');
  }
  return { t, walls: new WallGrid(SIZE, SIZE), p: new PlacementGrid(SIZE, SIZE) };
}

/** 앞쪽 절반이 물인 지형 + 덱 한 줄 — 슬라이드를 놓을 수 있는 세계 (`ride.test.ts` 와 같다) */
function deckedWorld(): World {
  const t = new KairoTerrain(32, 32);
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) t.paint(i, j, j >= 10 ? 'water_edge' : 'path_stone');
  }
  const walls = new WallGrid(32, 32);
  const p = new PlacementGrid(32, 32);
  for (let j = 10; j < 20; j++) p.place(t, walls, GATE, 'float_deck', 4, j);
  return { t, walls, p };
}

/** `'using'` 에 들어선 순간의 손님 — 자리·포즈·방향은 여기서만 읽는다 */
interface Seat {
  handle: number;
  slot: number;
  i: number;
  j: number;
  pose: string;
  facing: string;
}

/** 이용을 마친 뒤 유예 tick 이 지난 시점의 손님 — 갇혔는지 여기서만 읽는다 */
interface Freed {
  i: number;
  j: number;
  stand: boolean;
  stuckTicks: number;
}

interface Observed {
  seats: Seat[];
  freed: Freed[];
}

/**
 * 손님을 굴리면서 **이용 시작**과 **이용 종료 + 유예 tick 뒤**를 관찰한다.
 *
 * 유예는 `ticksPerStep * 2` 다 — 복원은 종료와 **같은 tick** 에 일어나므로 한 걸음이면
 * 충분하고, 두 걸음이면 "우연히 한 tick 늦었다"까지 덮는다.
 */
function observe(world: World, ticks = 2400, spawnEvery = 8): Observed {
  const { t, walls, p } = world;
  const tun = { ...OPEN_GATE_DEFAULTS, wantUses: 2, useTicks: 6, patienceTicks: 900 };
  const g = new GuestStore(t, walls, p, GATE, tun);
  const stand = guestWalkable(t, p);
  const grace = tun.ticksPerStep * 2;
  const rng = new Rng(52);

  const seats: Seat[] = [];
  const freed: Freed[] = [];
  /** 이용을 마친 손님 — `tick` 에 검사한다 */
  const due: { id: number; tick: number }[] = [];

  for (let k = 0; k < ticks; k++) {
    if (k % spawnEvery === 0) g.spawn(rng);
    const before = new Map<number, string>();
    for (const x of g.all) before.set(x.id, x.state);
    g.tick(rng);

    const live = new Map<number, Guest>();
    for (const x of g.all) live.set(x.id, x);

    for (const x of g.all) {
      const was = before.get(x.id);
      if (x.state === 'using' && was !== 'using' && was !== undefined) {
        seats.push({
          handle: x.usingHandle,
          slot: x.usingSlot,
          i: x.i,
          j: x.j,
          pose: x.pose,
          facing: x.facing,
        });
      }
      if (was === 'using' && x.state !== 'using') due.push({ id: x.id, tick: k + grace });
    }
    while (due.length > 0 && (due[0] as { tick: number }).tick <= k) {
      const d = due.shift() as { id: number; tick: number };
      const x = live.get(d.id);
      // 이미 퇴장한 손님은 검사 대상이 아니다 (갇힌 채 사라진 것은 아래 stuck 검사가 잡는다)
      if (!x) continue;
      freed.push({ i: x.i, j: x.j, stand: stand(x.i, x.j), stuckTicks: x.stuckTicks });
    }
  }
  return { seats, freed };
}

afterEach(() => setSlotRestoreFaultForTest(false));

describe('이용을 마친 손님이 안 갇힌다 (K52 5단계 — E①)', () => {
  /** 슬라이드 — 출구가 발자국 **안**이라 예전엔 여기서 800 tick 얼었다 */
  function slideWorld(): World {
    const w = deckedWorld();
    const r = w.p.place(w.t, w.walls, GATE, 'slide_large', 5, 11);
    expect(r.ok, '슬라이드가 놓인다').toBe(true);
    return w;
  }

  /** 일반 시설 — 슬롯 칸이 발자국 안이라 앉히는 순간 같은 문제가 생길 수 있었다 */
  function bbqWorld(): World {
    const w = paved();
    const r = w.p.place(w.t, w.walls, GATE, 'bbq_zone', 10, 10);
    expect(r.ok, 'bbq_zone 이 놓인다').toBe(true);
    return w;
  }

  it('★ 슬라이드 — 탑승을 마친 손님이 걸을 수 있는 칸에 있고 stuckTicks 가 0 이다', () => {
    const { freed } = observe(slideWorld());
    expect(freed.length, '탑승이 실제로 끝났다').toBeGreaterThan(0);
    for (const f of freed) {
      expect(f.stand, `(${f.i},${f.j}) 가 못 걷는 칸이다`).toBe(true);
      expect(f.stuckTicks, `(${f.i},${f.j}) 에서 길이 막혔다`).toBe(0);
    }
  });

  it('★ 일반 시설 — 이용을 마친 손님이 걸을 수 있는 칸에 있고 stuckTicks 가 0 이다', () => {
    const { freed } = observe(bbqWorld());
    expect(freed.length, '이용이 실제로 끝났다').toBeGreaterThan(0);
    for (const f of freed) {
      expect(f.stand, `(${f.i},${f.j}) 가 못 걷는 칸이다`).toBe(true);
      expect(f.stuckTicks).toBe(0);
    }
  });

  it('★ 음성 대조군 — 복원을 끄면 슬라이드 손님이 못 걷는 칸에 남는다', () => {
    setSlotRestoreFaultForTest(true);
    const { freed } = observe(slideWorld());
    expect(freed.length, '탑승이 실제로 끝났다').toBeGreaterThan(0);
    // 위 검사가 **실패한다** — 그래야 그 검사가 정말 복원을 재고 있는 것이다
    const trapped = freed.filter((f) => !f.stand);
    expect(trapped.length, '갇힌 손님이 하나도 없다면 복원 검사는 아무것도 안 잰다').toBeGreaterThan(
      0,
    );
  });

  /**
   * 탑승이 끝난 tick 부터 그 손님이 판에서 사라질 때까지의 tick.
   *
   * ⚠ **`stuckTicks` 만 보면 E① 의 크기를 못 잰다.** 못 걷는 칸에 남은 손님은 먼저
   * `pickTarget` 이 아무것도 못 골라(`distAt < 0`) **인내** 경로로 빠지고, 인내가 다
   * 닳아 `'leaving'` 이 된 뒤에야 "길이 막혔다"가 세기 시작한다 — 그래서 종료 직후
   * 몇 tick 만 보면 0 이다. 얼음의 크기는 **퇴장까지 걸린 시간**으로만 드러난다.
   */
  function exitLatency(fault: boolean): number[] {
    setSlotRestoreFaultForTest(fault);
    const { t, walls, p } = slideWorld();
    // `wantUses: 1` — 탑승이 끝나면 곧바로 `'leaving'` 이라 인내 경로가 안 섞인다
    const g = new GuestStore(t, walls, p, GATE, {
      ...OPEN_GATE_DEFAULTS,
      wantUses: 1,
      useTicks: 6,
      patienceTicks: 900,
    });
    const rng = new Rng(52);
    const doneAt = new Map<number, number>();
    const out: number[] = [];
    let alive = new Set<number>();
    for (let k = 0; k < 3000; k++) {
      if (k % 10 === 0) g.spawn(rng);
      const before = new Map<number, string>();
      for (const x of g.all) before.set(x.id, x.state);
      g.tick(rng);
      const now = new Set<number>();
      for (const x of g.all) {
        now.add(x.id);
        if (before.get(x.id) === 'using' && x.state !== 'using') doneAt.set(x.id, k);
      }
      for (const id of alive) {
        if (now.has(id)) continue;
        const at = doneAt.get(id);
        if (at !== undefined) out.push(k - at);
      }
      alive = now;
    }
    return out;
  }

  it('★ 800 tick 얼음이 사라졌다 — 탑승 종료부터 퇴장까지', () => {
    const fixed = exitLatency(false);
    expect(fixed.length, '탑승하고 나간 손님이 있다').toBeGreaterThan(3);
    // 슬라이드에서 게이트까지 걸어 나가는 시간뿐이다 (판이 32×32 · 4 tick/칸)
    expect(Math.max(...fixed), '아직 얼어 있는 손님이 있다').toBeLessThan(200);
  });

  it('★ 음성 대조군 — 복원을 끄면 STUCK_LIMIT × ticksPerStep 만큼 얼어 있다', () => {
    const frozen = exitLatency(true);
    expect(frozen.length, '탑승하고 나간 손님이 있다').toBeGreaterThan(3);
    // 200 걸음 시도 × 4 tick = 800 — 안전 밸브가 손님을 치울 때까지의 시간이다
    expect(Math.min(...frozen), '얼음이 안 재현됐다면 위 검사는 아무것도 안 잰다').toBeGreaterThan(
      STUCK_LIMIT * OPEN_GATE_DEFAULTS.ticksPerStep - 1,
    );
  });

  it('★ 이용 **중**에는 stuckTicks 가 안 오른다 — 슬롯 칸이 갇힘으로 읽히면 안 된다', () => {
    const { t, walls, p } = bbqWorld();
    const g = new GuestStore(t, walls, p, GATE, {
      ...OPEN_GATE_DEFAULTS,
      wantUses: 2,
      // 이용을 길게 잡아야 "이용 중 tick" 이 충분히 쌓인다
      useTicks: 60,
      patienceTicks: 900,
    });
    const rng = new Rng(7);
    let usingTicks = 0;
    let worst = 0;
    for (let k = 0; k < 1200; k++) {
      if (k % 8 === 0) g.spawn(rng);
      g.tick(rng);
      for (const x of g.all) {
        if (x.state !== 'using') continue;
        usingTicks++;
        worst = Math.max(worst, x.stuckTicks);
      }
    }
    expect(usingTicks, '이용 중인 tick 이 실제로 쌓였다').toBeGreaterThan(500);
    expect(worst, '이용 중에 "길이 막혔다"가 셌다').toBe(0);
  });
});

describe('손님이 슬롯 칸 위에 선다 (K52 5단계)', () => {
  /** 이 시설을 이용한 손님들이 실제로 선 칸·포즈·방향 */
  function seatsOf(defId: string, i: number, j: number, facing: 0 | 1 = 0): Seat[] {
    const w = paved();
    const r = w.p.place(w.t, w.walls, GATE, defId, i, j, { facing });
    expect(r.ok, `${defId} 가 놓인다 (${JSON.stringify(r)})`).toBe(true);
    const seats = observe(w).seats;
    expect(seats.length, `${defId} 이용이 실제로 일어났다`).toBeGreaterThan(0);
    return seats;
  }

  /** 데이터가 낸 그 자리인가 — 비교 대상은 `slotTileOf` 하나다 (전치 산수를 두 벌 만들지 않는다) */
  function expectOnSlot(seats: Seat[], defId: string, i: number, j: number, facing: 0 | 1): void {
    const def = facilityDef(defId)!;
    for (const s of seats) {
      const want = PlacementGrid.slotTileOf(def, i, j, facing, s.slot)!;
      expect(`${s.i},${s.j}`, `슬롯 ${s.slot} 의 칸`).toBe(`${want.tile[0]},${want.tile[1]}`);
      expect(s.pose, `슬롯 ${s.slot} 의 포즈`).toBe(want.pose);
      expect(s.facing, `슬롯 ${s.slot} 의 방향`).toBe(want.facing);
    }
  }

  it('★ bbq_zone 3×3 — 앉은 칸이 전부 발자국 **안**이고 슬롯과 일치한다', () => {
    const seats = seatsOf('bbq_zone', 10, 10);
    expectOnSlot(seats, 'bbq_zone', 10, 10, 0);
    // 발자국 안이라는 것의 실질 — 예전에는 전부 발자국 **밖**(입구 칸)이었다
    const foot = new Set(
      PlacementGrid.footprintTiles(facilityDef('bbq_zone')!, 10, 10, 0).map((t) => `${t[0]},${t[1]}`),
    );
    for (const s of seats) expect(foot.has(`${s.i},${s.j}`), `${s.i},${s.j}`).toBe(true);
    // 슬롯이 하나가 아니라 여러 개 쓰인다 — 한 자리만 쓰면 modulo 검사가 무의미해진다
    expect(new Set(seats.map((s) => s.slot)).size).toBeGreaterThan(1);
  });

  it('★ 회전판 — facing=1 에서도 앉은 칸이 슬롯과 일치한다 (전치가 반영됐다)', () => {
    const seats = seatsOf('minigolf', 10, 10, 1);
    expectOnSlot(seats, 'minigolf', 10, 10, 1);
    // 회전이 실제로 다른 칸을 낸다 — 같으면 위 검사가 아무것도 안 재는 것이 된다
    const def = facilityDef('minigolf')!;
    const f0 = PlacementGrid.slotTileOf(def, 10, 10, 0, 1)!;
    const f1 = PlacementGrid.slotTileOf(def, 10, 10, 1, 1)!;
    expect(`${f1.tile[0]},${f1.tile[1]}`).not.toBe(`${f0.tile[0]},${f0.tile[1]}`);
  });

  it('★ 음성 대조군 — 배선을 끄면 손님이 발자국 **밖**(들어온 칸)에 선다', () => {
    setSlotRestoreFaultForTest(true);
    const seats = seatsOf('bbq_zone', 10, 10);
    const foot = new Set(
      PlacementGrid.footprintTiles(facilityDef('bbq_zone')!, 10, 10, 0).map((t) => `${t[0]},${t[1]}`),
    );
    for (const s of seats) expect(foot.has(`${s.i},${s.j}`), `${s.i},${s.j}`).toBe(false);
  });

  it('★ 매표소는 안 옮긴다 — 지나가는 곳이지 앉는 곳이 아니다', () => {
    /*
     * `pickTicket` 은 슬롯을 안 잡으므로 `usingSlot === -1` 이다. 데이터에는 `ticket` 도
     * 슬롯이 둘 있지만(정원 2), 입장 수속은 그 자리에 앉는 것이 아니다.
     */
    const w = paved();
    const r = w.p.place(w.t, w.walls, GATE, 'ticket', 10, 10);
    expect(r.ok, '매표소가 놓인다').toBe(true);
    const g = new GuestStore(w.t, w.walls, w.p, GATE, {
      ...OPEN_GATE_DEFAULTS,
      requireTicket: true,
      wantUses: 1,
      useTicks: 6,
      patienceTicks: 900,
    });
    const foot = new Set(
      PlacementGrid.footprintTiles(facilityDef('ticket')!, 10, 10, 0).map((t) => `${t[0]},${t[1]}`),
    );
    const rng = new Rng(52);
    let admitting = 0;
    for (let k = 0; k < 1200; k++) {
      if (k % 8 === 0) g.spawn(rng);
      g.tick(rng);
      for (const x of g.all) {
        if (x.state !== 'using' || x.usingSlot !== -1) continue;
        admitting++;
        expect(foot.has(`${x.i},${x.j}`), `표를 사는 손님이 매표소 위에 올라갔다`).toBe(false);
      }
    }
    expect(admitting, '입장 수속이 실제로 일어났다').toBeGreaterThan(0);
  });
});

describe('포즈는 데이터가 정한다 — `poseFor()` 는 삭제됐다 (K52 5단계)', () => {
  /**
   * 삭제된 `poseFor()` 는 시설 id 문자열 매칭(`def.id.includes('sunbed')`)이었고 계약과
   * **17종이 어긋나 있었다**. 함수가 사라졌다는 것은 **바뀐 종에서** 재야 증명된다 —
   * 안 바뀐 종으로 재면 두 규칙이 같은 답을 내서 조용히 통과한다.
   */
  function poseAt(defId: string, i: number, j: number): Set<string> {
    const w = paved();
    const r = w.p.place(w.t, w.walls, GATE, defId, i, j);
    expect(r.ok, `${defId} 가 놓인다`).toBe(true);
    const seats = observe(w).seats;
    expect(seats.length, `${defId} 이용이 실제로 일어났다`).toBeGreaterThan(0);
    return new Set(seats.map((s) => s.pose));
  }

  it("★ bbq_zone — 옛 규칙은 'idle', 데이터는 'sit'", () => {
    // `def.id.includes('cafe'|'pyeongsang'|'sauna')` 중 아무것에도 안 걸려 'idle' 이었다
    expect([...poseAt('bbq_zone', 10, 10)]).toEqual(['sit']);
  });

  it("★ parasol 1×1 — 슬롯 둘이 같은 칸이고 옛 규칙은 'idle' 이었다", () => {
    expect([...poseAt('parasol', 10, 10)]).toEqual(['sit']);
    // 한 칸에 둘 — 시뮬은 같은 칸에 세우고 **화면이** 인원수에서 파생해 흩는다 (K52-⑦)
    const slots = facilityDef('parasol')!.slots!;
    expect(slots).toHaveLength(2);
    expect(slots[0]!.tile).toEqual(slots[1]!.tile);
  });

  it('★ 17종이 옛 규칙과 어긋난다 — 그래서 함수가 남아 있으면 안 됐다', () => {
    /** 삭제된 `poseFor()` 의 산수 그대로 (여기가 그 코드의 마지막 사본이다) */
    const old = (def: { id: string; layer: string }): string => {
      if (def.layer === 'water') return 'float';
      if (def.id.includes('pool')) return 'swim';
      if (def.id.includes('sunbed') || def.id.includes('jjimjil')) return 'lie';
      if (def.id.includes('cafe') || def.id.includes('pyeongsang') || def.id.includes('sauna')) {
        return 'sit';
      }
      return 'idle';
    };
    const bad: string[] = [];
    for (const def of allFacilityDefs()) {
      const slots = def.slots ?? [];
      if (slots.length === 0) continue;
      const set = new Set(slots.map((s) => s.pose));
      if (set.size !== 1 || !set.has(old(def))) bad.push(def.id);
    }
    expect(bad.sort()).toEqual(
      [
        'bbq_zone',
        'camp_site',
        'firepit_row',
        'footbath',
        'footvolley',
        'lookout',
        'massage_row',
        'minigolf',
        'mongol_tent',
        'parasol',
        'pavilion',
        'photozone',
        'playground',
        'pool_lazy',
        'shade_net',
        'ticket',
        'vending_out',
      ].sort(),
    );
  });
});

describe('정원이 슬롯보다 많을 때 — 최대 2명 (P1.5 회전 특화)', () => {
  it('★ 넘친 손님이 modulo 자리에 서고 포즈가 idle 이다', () => {
    const w = paved();
    const r = w.p.place(w.t, w.walls, GATE, 'vending_out', 10, 10);
    expect(r.ok).toBe(true);
    const handle = r.placed!.handle;
    // 5단계까지 올리고 회전 특화 → 정원 1 + 2 = 3, 슬롯은 데이터 고정 1개
    while ((w.p.all().find((f) => f.handle === handle)?.level ?? 1) < 5) {
      expect(w.p.upgrade(handle)).toBe(true);
    }
    expect(SPECIALTY_LEVEL).toBeLessThanOrEqual(5);
    expect(w.p.chooseSpecialty(handle, 'capacity')).toBe(true);
    expect(w.p.capacityOf(handle)).toBe(3);
    expect(facilityDef('vending_out')!.slots).toHaveLength(1);

    const seats = observe(w).seats.filter((s) => s.handle === handle);
    expect(seats.length, '이용이 실제로 일어났다').toBeGreaterThan(0);
    // 슬롯 번호 1·2 가 실제로 나왔다 — 안 나오면 아래 modulo 검사가 아무것도 안 잰다
    expect(new Set(seats.map((s) => s.slot)).size, '슬롯 번호가 하나뿐이다').toBeGreaterThan(1);

    const only = PlacementGrid.slotTileOf(facilityDef('vending_out')!, 10, 10, 0, 0)!;
    for (const s of seats) {
      expect(`${s.i},${s.j}`, `슬롯 ${s.slot}`).toBe(`${only.tile[0]},${only.tile[1]}`);
      // 데이터가 정한 자세를 흉내 낼 자리가 없다 — 넘친 손님은 그냥 선다
      expect(s.pose, `슬롯 ${s.slot} 의 포즈`).toBe(s.slot === 0 ? only.pose : 'idle');
    }
  });
});

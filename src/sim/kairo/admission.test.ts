import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import {
  GuestStore,
  GUEST_DEFAULTS,
  OPEN_GATE_DEFAULTS,
  TICKET_DEF_ID,
  type GuestTunables,
} from './guests.js';
import { WeekRunner } from './week.js';

/**
 * 입장료와 매표소 — 설계 §13.1 의 첫 줄 (K36-B②).
 *
 * ## 왜 별도 파일인가
 *
 * `guests.test.ts` 는 도시 띠가 없는 16×16 세계에서 길찾기·슬롯을 잰다. 입장 수속은
 * **정류장이 있는 실제 격자**에서만 뜻이 있으므로 여기서 96×72 로 따로 본다.
 *
 * ## 대조군이 절반이다
 *
 * 새 규칙이 실제로 무언가를 **막는지** 보이지 않으면, 검사는 조용히 통과만 한다
 * (이 저장소에서 여덟 번 실측된 실패 모양이다). 그래서 항목마다 짝을 이룬다:
 *   · 매표소가 있으면 들어오고 입장료가 걷힌다 ↔ 없으면 한 명도 못 들어온다
 *   · 경유를 켜면 막힌다 ↔ 끄면(`requireTicket:false`) 그대로 들어온다
 */

const GRID_W = KairoTerrain.WIDTH;
const GRID_H = KairoTerrain.HEIGHT;
const GATE = KairoTerrain.parkGate();
const STOP = KairoTerrain.busStop();
const FEE = GUEST_DEFAULTS.admissionFee;

interface World {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  g: GuestStore;
  r: WeekRunner;
}

/**
 * 실제 격자 한 판. 육지를 통째로 포장한다 — 잔디는 손님이 못 지나가므로(K32-B)
 * 길 설계가 변수로 끼어들면 재려는 것(입장 수속)이 흐려진다. 골든과 같은 방식이다.
 */
function world(
  facilities: readonly [string, number, number][] = [],
  tun: Partial<GuestTunables> = {},
): World {
  const t = KairoTerrain.generate(GRID_W, GRID_H, new Rng(4242).fork(1));
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) if (t.isWalkable(i, j)) t.paint(i, j, 'path_stone');
  }
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  for (const [id, i, j] of facilities) p.place(t, w, GATE, id, i, j);
  const g = new GuestStore(t, w, p, GATE, { ...GUEST_DEFAULTS, ...tun });
  g.invalidate();
  return { t, w, p, g, r: new WeekRunner(t, p, g) };
}

/** 입구 바로 아래 매표소 하나 + 놀거리 몇 개 — "정상적인 판" */
const OPEN_PARK: readonly [string, number, number][] = [
  [TICKET_DEF_ID, GATE.i - 1, GATE.j + 2],
  ['shop', GATE.i - 5, GATE.j + 6],
  ['pyeongsang_row', GATE.i + 3, GATE.j + 6],
  ['snackbar', GATE.i - 5, GATE.j + 10],
  ['sunbed_row', GATE.i + 3, GATE.j + 10],
];

/** 매표소만 빼고 똑같은 판 — 대조군의 기준선이다 */
const CLOSED_PARK = OPEN_PARK.filter(([id]) => id !== TICKET_DEF_ID);

describe('손님은 정류장에 내린다 — 게이트에 툭 나타나지 않는다', () => {
  it('정류장 칸에서 `arriving` 으로 시작한다', () => {
    const { g } = world(OPEN_PARK);
    const guest = g.spawn(new Rng(1));
    expect(guest).not.toBeNull();
    expect(g.stopIsGate).toBe(false);
    expect([guest!.i, guest!.j]).toEqual([STOP.i, STOP.j]);
    expect(guest!.state).toBe('arriving');
  });

  it('⚠ 대조군 — 도시 띠가 없는 격자에서는 게이트에서 시작한다', () => {
    // 16×16 세계에는 정류장 칸(48,3)이 아예 없다. 단위 검사들이 쓰는 세계다
    const t = new KairoTerrain(16, 16);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) t.paint(i, j, 'path_stone');
    const g = new GuestStore(t, new WallGrid(16, 16), new PlacementGrid(16, 16), { i: 0, j: 0 });
    expect(g.stopIsGate).toBe(true);
    expect(g.busStop).toEqual({ i: 0, j: 0 });
  });
});

describe('매표소를 지나야 입장이다', () => {
  it('매표소가 있으면 들어오고 입장료가 걷힌다', () => {
    const { r } = world(OPEN_PARK);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.visitors).toBeGreaterThan(0);
    expect(rep.noTicket).toBe(0);
    // 입장료는 **정찰가**다 — 지갑 배율을 안 타므로 인원과 정확히 맞아야 한다
    expect(rep.admission).toBe(rep.visitors * FEE);
    expect(rep.revenue).toBeGreaterThanOrEqual(rep.admission);
  });

  it('⚠ 매표소가 없으면 한 명도 못 들어온다 — `noTicket` 이 센다', () => {
    const { r } = world(CLOSED_PARK);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.visitors).toBe(0);
    expect(rep.admission).toBe(0);
    expect(rep.noTicket).toBeGreaterThan(0);
    // 만석과 갈라져 있어야 처방이 갈린다
    expect(rep.turnedAway).toBe(0);
  });

  it('⚠ 못 들어간 손님은 퇴장 만족도에 안 섞인다 — 원인이 흐려진다', () => {
    const { r, g } = world(CLOSED_PARK);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.exitSatisfaction).toBe(0);
    expect(g.stats().exited).toBe(0);
    expect(g.stats().noTicket).toBe(rep.noTicket);
  });

  it('⚠ 대조군 — 경유를 끄면 매표소 없이 들어온다', () => {
    const { r } = world(CLOSED_PARK, OPEN_GATE_DEFAULTS);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.visitors).toBeGreaterThan(0);
    expect(rep.noTicket).toBe(0);
    // 경유가 없으면 표도 없다 — 무료 입장이다
    expect(rep.admission).toBe(0);
  });

  it('⚠ 길이 안 닿는 매표소는 없는 것과 같다', () => {
    /*
     * 매표소를 놓은 **뒤에** 둘레를 잔디로 되돌린다 (잔디는 손님이 못 지나간다, K32-B).
     * "있다"만 보고 통과시키면 이 판이 조용히 지나가고, 실제 게임에서는 손님이 안
     * 들어오는데 결산이 아무 말도 안 하게 된다.
     */
    const { t, w, p } = world([[TICKET_DEF_ID, GATE.i - 1, GATE.j + 4]]);
    expect(p.all().some((x) => x.defId === TICKET_DEF_ID)).toBe(true);
    for (let j = GATE.j + 3; j <= GATE.j + 6; j++) {
      for (let i = GATE.i - 2; i <= GATE.i + 2; i++) {
        if (p.handleAt(i, j) === 0) t.paint(i, j, 'lawn');
      }
    }

    const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
    g.invalidate();
    const rep = new WeekRunner(t, p, g).run(new Rng(7), { season: 'summer' });
    expect(rep.visitors).toBe(0);
    expect(rep.noTicket).toBeGreaterThan(0);
  });
});

describe('표는 놀이가 아니다', () => {
  it('입장 수속은 `wantUses` 에 안 센다 — 매표소만 있는 판은 헛걸음이다', () => {
    const { r, g } = world([[TICKET_DEF_ID, GATE.i - 1, GATE.j + 2]]);
    const rep = r.run(new Rng(11), { season: 'summer' });
    expect(rep.visitors).toBeGreaterThan(0);
    /*
     * 표를 이용 1회로 세면 손님이 셋만 쓰고 나가고, 시설이 없는 판에서도 만족도가 오른다.
     * 여기서는 아무것도 못 하고 나가야 한다.
     */
    expect(rep.gaveUp).toBeGreaterThan(0);
    for (const guest of g.all) expect(guest.used).toBe(0);
  });

  it('매표소는 놀러 갈 목적지가 아니다 — 손님이 표를 두 번 사지 않는다', () => {
    const { g } = world([[TICKET_DEF_ID, GATE.i - 1, GATE.j + 2]]);
    const rng = new Rng(13);
    const guest = g.spawn(rng);
    expect(guest).not.toBeNull();
    let admitted = false;
    for (let k = 0; k < 600; k++) {
      g.tick(rng);
      if (guest!.state === 'walking' || guest!.state === 'leaving') admitted = true;
      // 입장한 뒤로는 다시 매표소를 이용하지 않는다
      if (admitted) expect(guest!.admitting).toBe(false);
      if (guest!.state === 'gone') break;
    }
    expect(admitted).toBe(true);
    expect(guest!.used).toBe(0);
  });
});

describe('걷기 감점은 입장 뒤부터', () => {
  it('정류장 → 매표소 구간에서는 만족도가 안 깎인다', () => {
    /*
     * ⚠ 이 구간은 도시 띠 폭이 정하는 **고정 거리**다 (K36 이 8줄로 벌렸다).
     * 플레이어가 줄일 수 없으므로 여기서 깎으면 못 고치는 벌점이 된다.
     */
    const { g } = world([[TICKET_DEF_ID, GATE.i - 1, GATE.j + 8]]);
    const rng = new Rng(17);
    const guest = g.spawn(rng);
    expect(guest).not.toBeNull();
    let steps = 0;
    for (let k = 0; k < 400 && guest!.state === 'arriving'; k++) {
      const before = { i: guest!.i, j: guest!.j };
      g.tick(rng);
      if (guest!.i !== before.i || guest!.j !== before.j) steps++;
    }
    // 실제로 여러 칸을 걸었는데도 만족도가 그대로여야 한다
    expect(steps).toBeGreaterThan(6);
    expect(guest!.satisfaction).toBe(GUEST_DEFAULTS.startSatisfaction);
  });

  it('⚠ 대조군 — 입장한 뒤에는 걷는 만큼 깎인다', () => {
    // 입장 직후와 첫 이용 직전을 잰다 — 그 사이는 **걷기만** 한 구간이다
    const { g } = world([
      [TICKET_DEF_ID, GATE.i - 1, GATE.j + 2],
      ['shop', GATE.i - 6, GATE.j + 20],
    ]);
    const rng = new Rng(19);
    const guest = g.spawn(rng);
    expect(guest).not.toBeNull();
    let atAdmission: number | null = null;
    let atUse: number | null = null;
    for (let k = 0; k < 600; k++) {
      g.tick(rng);
      if (atAdmission === null && guest!.state === 'walking') atAdmission = guest!.satisfaction;
      if (atAdmission !== null && atUse === null && guest!.state === 'using') {
        atUse = guest!.satisfaction;
        break;
      }
    }
    expect(atAdmission).toBe(GUEST_DEFAULTS.startSatisfaction);
    expect(atUse).not.toBeNull();
    expect(atUse!).toBeLessThan(atAdmission!);
  });
});

describe('입장료도 요금 슬라이더를 탄다 (§15.9)', () => {
  it('140% 면 ₩14,000 을 받는다', () => {
    const base = world(OPEN_PARK).r.run(new Rng(23), { season: 'summer', priceMult: 1 });
    const up = world(OPEN_PARK).r.run(new Rng(23), { season: 'summer', priceMult: 1.4 });
    expect(base.admission).toBe(base.visitors * FEE);
    expect(up.admission).toBe(up.visitors * Math.round(FEE * 1.4));
    expect(up.admission).toBeGreaterThan(base.admission);
  });

  it('절반값이면 절반만 받는다 — 방향이 반대로 붙지 않았다', () => {
    const down = world(OPEN_PARK).r.run(new Rng(23), { season: 'summer', priceMult: 0.5 });
    expect(down.admission).toBe(down.visitors * Math.round(FEE * 0.5));
  });

  it('⚠ 식음 직원 배율·카드 매출 배율은 표값에 안 붙는다 — 표는 매점이 안 판다', () => {
    /*
     * 섞으면 결산의 입장료 줄이 "왜 이 숫자인지" 설명할 수 없는 값이 된다. 두 배율을
     * **동시에** 켜고도 `입장객 × 정가` 가 정확히 나와야 한다.
     */
    const { r, p } = world(OPEN_PARK);
    const rep = r.run(new Rng(23), {
      season: 'summer',
      priceMult: 1,
      staff: { wages: 0, satisfactionDelta: 0, foodMult: 0.5, idle: new Set<number>() },
      modifiers: {
        arrivalMult: 1,
        revenueMult: 1.5,
        crowdMult: 1,
        satisfactionDelta: 0,
        reputationDelta: 0,
        accidentMult: 1,
        closed: false,
      },
    });
    expect(p.count).toBeGreaterThan(0);
    expect(rep.admission).toBe(rep.visitors * FEE);
    // 그런데도 나머지 매출에는 배율이 붙어 있어야 한다 (대조군이 아니라 짝 확인)
    expect(rep.revenue - rep.admission).toBeGreaterThan(0);
  });
});

describe('정원은 공원 안 인원이다', () => {
  it('정류장에서 걸어오는 손님은 정원을 안 먹는다', () => {
    /*
     * 먹게 두면 플레이어가 못 바꾸는 다섯 칸이 정원을 깎는다 — 매표소를 멀리 두면
     * 그만큼 입장이 줄어드는데, 그건 판단이 아니라 세금이다.
     */
    const { g } = world([[TICKET_DEF_ID, GATE.i - 1, GATE.j + 8]], { maxGuests: 3 });
    const rng = new Rng(29);
    for (let k = 0; k < 12; k++) g.spawn(rng);
    expect(g.count).toBe(12);
    expect(g.stats().arriving).toBe(12);
  });

  it('⚠ 대조군 — 입장한 뒤에는 정원이 막는다', () => {
    const { g } = world([[TICKET_DEF_ID, GATE.i - 1, GATE.j + 2]], {
      ...OPEN_GATE_DEFAULTS,
      maxGuests: 3,
    });
    const rng = new Rng(29);
    for (let k = 0; k < 12; k++) g.spawn(rng);
    expect(g.count).toBe(3);
  });
});

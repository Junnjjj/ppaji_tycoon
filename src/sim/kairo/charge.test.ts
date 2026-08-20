import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import {
  PlacementGrid,
  allFacilityDefs,
  facilityDef,
  chargesOnUse,
  SPECIALTY_LEVEL,
  type KairoFacilityDef,
} from './placement.js';
import { GuestStore, GUEST_DEFAULTS, OPEN_GATE_DEFAULTS, TICKET_DEF_ID } from './guests.js';
import { WeekRunner } from './week.js';

/**
 * 과금 구조 (P6) — **입장권 하나로 빠지를 쓰고, 음식·대여만 따로 산다.**
 *
 * 사용자 요청 그대로다: "입장권엔 빠지 시설이 포함되어 있어서 … 입장비에 포함된
 * 부분들은 빼줘도 된다. 음식이나 뭐 그런 거에 돈 써달란 거였다."
 *
 * 예전에는 시설 75종이 **전부** 이용마다 돈을 받았다 — 화장실이 매점만큼 벌었고,
 * 결산의 "매출"이 무엇을 뜻하는지 플레이어가 알 수 없었다.
 *
 * ## 대조군이 절반이다
 *
 * 분류를 데이터에 적어 놓고 코드가 안 읽으면 검사는 조용히 통과만 한다 (이 저장소가
 * 여덟 번 실측한 실패 모양). 그래서 `chargeFaultForTest` 로 분류를 **일부러 어긋내고**
 * 수입 구성이 실제로 뒤집히는지 본다:
 *   · `'all-sale'` 전부 유료 (P6 이전) ↔ 기본 (포함은 0)
 *   · `'invert'`   포함↔판매를 뒤집으면 두 줄이 자리를 바꾼다
 */

const GRID_W = KairoTerrain.WIDTH;
const GRID_H = KairoTerrain.HEIGHT;
const GATE = KairoTerrain.parkGate();
/** 16×16 단위 세계의 게이트 — 실제 격자의 입구는 그 안에 없다 (`guests.test.ts` 와 같다) */
const SMALL_GATE = { i: 0, j: 0 };

const defs = allFacilityDefs();
/** `need` 는 `KairoFacilityDef` 에 없다 — 이 저장소는 어디서나 이렇게 읽는다 */
const needOf = (id: string): string | undefined =>
  (facilityDef(id) as { need?: string } | undefined)?.need;
const included = (d: KairoFacilityDef): boolean => d.charge === 'included';
const idsWhere = (f: (d: KairoFacilityDef) => boolean): string[] =>
  defs.filter(f).map((d) => d.id).sort();

describe('과금 방식은 데이터가 정한다 (불변식 3)', () => {
  it('75종 전부가 `charge` 를 명시한다 — 안 적으면 조용히 유료가 된다', () => {
    const missing = defs.filter((d) => d.charge === undefined).map((d) => d.id);
    expect(missing).toEqual([]);
    // 값은 둘뿐이다. 셋째("반값" 따위)가 생기면 결산 줄이 늘어난다
    const bad = defs.filter((d) => d.charge !== 'included' && d.charge !== 'sale');
    expect(bad.map((d) => d.id)).toEqual([]);
  });

  it('양쪽 다 비어 있지 않다 — 한쪽이 0 이면 분류가 아니라 스위치다', () => {
    expect(idsWhere(included).length).toBeGreaterThan(20);
    expect(idsWhere((d) => !included(d)).length).toBeGreaterThan(20);
  });

  it('실제 빠지의 상식과 맞는다 — 위생·온열·경관·운영은 표에 들었다', () => {
    const alwaysIncluded = ['hygiene', 'warm', 'scenery', 'service'];
    for (const need of alwaysIncluded) {
      const paid = idsWhere((d) => (d as { need?: string }).need === need && !included(d));
      expect(paid, `${need} 는 입장권에 포함이어야 한다`).toEqual([]);
    }
    // 대표 시설 몇 개는 이름으로 못박는다 — 축이 통째로 뒤집히면 위 검사도 같이 통과한다
    for (const id of ['toilet', 'shower_row', 'slide_large', 'pool_lazy', 'lookout']) {
      expect(facilityDef(id)?.charge, id).toBe('included');
    }
  });

  it('음식·숙박은 전부 따로 산다 — 표에 밥값이 들어 있으면 안 된다', () => {
    for (const need of ['food', 'stay']) {
      const free = idsWhere((d) => (d as { need?: string }).need === need && included(d));
      expect(free, `${need} 는 별도 구매여야 한다`).toEqual([]);
    }
    expect(idsWhere((d) => (d as { need?: string }).need === 'food')).toHaveLength(10);
  });

  it('⚠ `need` 축과 과금 축은 **독립**이다 — 대여소는 스릴인데 파는 것이다', () => {
    /*
     * 이 검사가 이 파일의 핵심이다. 코드가 `need === 'food'` 같은 식으로 가르고 싶어지는데,
     * 그러면 카약 대여소(need: thrill)가 공짜가 되고 카페(need: rest)도 공짜가 된다.
     * 실제 빠지에서 보트는 표에 안 들어 있다.
     */
    for (const id of ['rent_kayak', 'rent_pedal', 'rent_sup']) {
      expect(needOf(id), id).toBe('thrill');
      expect(facilityDef(id)?.charge, id).toBe('sale');
    }
    expect(needOf('rent_duck')).toBe('play');
    expect(facilityDef('rent_duck')?.charge).toBe('sale');
    expect(needOf('cafe')).toBe('rest');
    expect(facilityDef('cafe')?.charge).toBe('sale');
    // 반대 방향 — 같은 need 안에 포함도 있다. 그래서 need 하나로는 못 가른다
    expect(needOf('pool_lazy')).toBe('play');
    expect(facilityDef('pool_lazy')?.charge).toBe('included');
    expect(needOf('slide_large')).toBe('thrill');
    expect(facilityDef('slide_large')?.charge).toBe('included');

    // 두 축이 섞이는 need 가 실제로 존재한다 (하나도 없으면 위 항목이 우연히 참이 된다)
    const mixed = ['play', 'thrill', 'rest'].filter((need) => {
      const inNeed = defs.filter((d) => (d as { need?: string }).need === need);
      return inNeed.some(included) && inNeed.some((d) => !included(d));
    });
    expect(mixed.sort()).toEqual(['play', 'rest', 'thrill']);
  });
});

describe('요금은 `feeOf` 하나가 정한다', () => {
  const grid = (): PlacementGrid => new PlacementGrid(16, 16);
  /** 16×16 포장 세계에 시설 하나 — 요금만 본다 */
  function put(defId: string): { p: PlacementGrid; handle: number } {
    const t = new KairoTerrain(16, 16);
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) t.paint(i, j, 'path_stone');
    }
    const p = grid();
    const r = p.place(t, new WallGrid(16, 16), SMALL_GATE, defId, 4, 4);
    expect(r.ok, `${defId} 배치 실패`).toBe(true);
    return { p, handle: r.ok && r.placed ? r.placed.handle : 0 };
  }

  it('입장권에 포함된 시설은 이용해도 0 · 파는 시설은 정가를 받는다', () => {
    const free = put('lookout');
    expect(free.p.feeOf(free.handle)).toBe(0);
    expect(facilityDef('lookout')?.fee).toBeGreaterThan(0); // 정가는 데이터에 남아 있다

    const paid = put('shop');
    expect(paid.p.feeOf(paid.handle)).toBe(facilityDef('shop')?.fee);
  });

  it('개선해도·수익 특화를 골라도 포함은 0 이다 — 0 에 배수를 곱해도 0', () => {
    const { p, handle } = put('lookout');
    for (let k = 1; k < SPECIALTY_LEVEL; k++) p.upgrade(handle);
    p.chooseSpecialty(handle, 'revenue');
    expect(p.specialtyOf(handle)).toBe('revenue');
    expect(p.feeOf(handle)).toBe(0);
  });

  it('⚠ 대조군 — `all-sale` 을 켜면 포함 시설도 걷는다 (P6 이전 세계)', () => {
    const { p, handle } = put('lookout');
    expect(p.feeOf(handle)).toBe(0);
    p.chargeFaultForTest = 'all-sale';
    expect(p.feeOf(handle)).toBe(facilityDef('lookout')?.fee);
  });

  it('⚠ 대조군 — `invert` 를 켜면 파는 시설이 0 이 된다', () => {
    const { p, handle } = put('shop');
    expect(p.feeOf(handle)).toBeGreaterThan(0);
    p.chargeFaultForTest = 'invert';
    expect(p.feeOf(handle)).toBe(0);
  });

  it('`chargesOnUse` 가 판정의 정본이다 — 없으면 유료(옛 동작)', () => {
    expect(chargesOnUse(facilityDef('shop'))).toBe(true);
    expect(chargesOnUse(facilityDef('toilet'))).toBe(false);
    expect(chargesOnUse(undefined)).toBe(true);
    // 필드를 지운 사본 — 안 적힌 시설이 옛 동작(유료)으로 읽히는지
    const noField = { ...(facilityDef('toilet') as KairoFacilityDef) } as Record<string, unknown>;
    delete noField['charge'];
    expect(chargesOnUse(noField as unknown as KairoFacilityDef)).toBe(true);
  });
});

/* ────────────── 주 단위 — 결산의 두 줄 ────────────── */

interface World {
  p: PlacementGrid;
  g: GuestStore;
  r: WeekRunner;
}

/**
 * 실제 격자 한 판. 육지를 통째로 포장한다 (`admission.test.ts` 와 같은 방식) —
 * 길 설계가 변수로 끼어들면 재려는 것(수입 구성)이 흐려진다.
 */
function world(facilities: readonly [string, number, number][]): World {
  const t = KairoTerrain.generate(GRID_W, GRID_H, new Rng(4242).fork(1));
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) if (t.isWalkable(i, j)) t.paint(i, j, 'path_stone');
  }
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  for (const [id, i, j] of facilities) {
    const r = p.place(t, w, GATE, id, i, j);
    expect(r.ok, `${id} 배치 실패`).toBe(true);
  }
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  g.invalidate();
  return { p, g, r: new WeekRunner(t, p, g) };
}

/** 매표소 + **포함 시설만** — 표값 말고는 한 푼도 안 들어와야 하는 판 */
const FREE_PARK: readonly [string, number, number][] = [
  [TICKET_DEF_ID, GATE.i - 1, GATE.j + 2],
  ['playground', GATE.i - 6, GATE.j + 6],
  ['pavilion', GATE.i + 3, GATE.j + 6],
  ['lookout', GATE.i - 6, GATE.j + 11],
  ['info', GATE.i + 3, GATE.j + 11],
];

/** 매표소 + **파는 시설만** — 표값 위에 매점 매출이 얹혀야 하는 판 */
const SHOP_PARK: readonly [string, number, number][] = [
  [TICKET_DEF_ID, GATE.i - 1, GATE.j + 2],
  ['shop', GATE.i - 5, GATE.j + 6],
  ['snackbar', GATE.i + 3, GATE.j + 6],
  ['cafe', GATE.i - 5, GATE.j + 10],
  ['pyeongsang_row', GATE.i + 3, GATE.j + 10],
];

describe('결산이 입장료와 별도 구매를 가른다', () => {
  it('총수입 = 입장료 + 별도 구매 + 코스 — 장부는 한 벌이다', () => {
    const { r } = world(SHOP_PARK);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.revenue).toBe(rep.admission + rep.sales + rep.courseRevenue);
  });

  it('코스 매출은 별도 구매가 아니다 — 세 줄이 각자 자기 몫만 갖는다', () => {
    /*
     * 위 항목만이면 `sales` 가 뺄셈으로 정의돼 있어 항등이 공짜다. 코스를 켜서
     * **세 줄이 실제로 갈리는지** 본다 — 코스 매출이 매점 줄에 새면 "음식이 돈이 된다"가
     * 거짓이 된다 (코스는 `장비×프리셋 적합도`라는 자기 축을 이미 갖는다).
     */
    const at = (courses?: { revenue: number; upkeep: number; riders: number }) =>
      world(SHOP_PARK).r.run(new Rng(7), { season: 'summer', ...(courses ? { courses } : {}) });
    const plain = at();
    const withCourse = at({ revenue: 400_000, upkeep: 0, riders: 40 });
    expect(plain.courseRevenue).toBe(0);
    expect(withCourse.courseRevenue).toBeGreaterThan(0);
    // 코스를 켜도 매점 줄은 한 원도 안 움직인다
    expect(withCourse.sales).toBe(plain.sales);
    expect(withCourse.revenue).toBe(plain.revenue + withCourse.courseRevenue);
  });

  it('포함 시설만 있는 판은 별도 구매가 **0** 이다 (입장료는 걷힌다)', () => {
    const { r } = world(FREE_PARK);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.visitors).toBeGreaterThan(0);
    expect(rep.admission).toBe(rep.visitors * GUEST_DEFAULTS.admissionFee);
    expect(rep.sales).toBe(0);
    // 그래도 손님은 놀았다 — 공짜라서 안 쓰는 것이 아니다 (아래 만족도 검사도 볼 것)
    expect(rep.exitSatisfaction).toBeGreaterThan(0);
  });

  it('파는 시설만 있는 판은 별도 구매가 표값 위에 얹힌다', () => {
    const { r } = world(SHOP_PARK);
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.sales).toBeGreaterThan(0);
    expect(rep.revenue).toBeGreaterThan(rep.admission);
  });

  it('⚠ 대조군 — 분류를 뒤집으면 두 줄이 자리를 바꾼다', () => {
    /*
     * 같은 시드·같은 배치로 네 판을 돌려 **구성이 실제로 뒤집히는지** 본다.
     * 요금은 손님의 판단에 안 들어가므로 입장객 수는 네 판이 같다 — 달라지는 것은
     * 오직 "얼마를 어디서 받았나"다.
     */
    const runWith = (
      park: readonly [string, number, number][],
      fault: 'all-sale' | 'invert' | null,
    ): { sales: number; visitors: number } => {
      const { p, r } = world(park);
      p.chargeFaultForTest = fault;
      const rep = r.run(new Rng(7), { season: 'summer' });
      return { sales: rep.sales, visitors: rep.visitors };
    };

    const freePlain = runWith(FREE_PARK, null);
    const freeInverted = runWith(FREE_PARK, 'invert');
    const shopPlain = runWith(SHOP_PARK, null);
    const shopInverted = runWith(SHOP_PARK, 'invert');

    // 뒤집으면 0 이던 줄에 돈이 들어오고, 돈이 들던 줄이 0 이 된다
    expect(freePlain.sales).toBe(0);
    expect(freeInverted.sales).toBeGreaterThan(0);
    expect(shopPlain.sales).toBeGreaterThan(0);
    expect(shopInverted.sales).toBe(0);
    // 입장객은 넷 다 같다 — 뒤집힌 것은 수입 구성뿐이다
    expect(freeInverted.visitors).toBe(freePlain.visitors);
    expect(shopInverted.visitors).toBe(shopPlain.visitors);
  });

  it('요금 슬라이더의 힘은 구성과 무관하다 — 표값과 시설 요금에 똑같이 곱해진다', () => {
    /*
     * 입장료 비중이 16% → 62% 로 커졌으니 "슬라이더가 세졌나"를 물어야 한다. 답은
     * **아니오**다: `priceMult` 는 `admIn` 과 `collectFees` 양쪽에 곱해지므로 총수입
     * 대 슬라이더의 기울기가 구성과 무관하다.
     *
     * 그래서 **극단으로 갈라진 두 판**(표값만 · 매점만)에서 같은 비율이 나오는지 본다.
     * 한 판만 재면 비율이 1.2 인지만 알지 "구성이 바뀌면 달라지나"는 못 잰다.
     */
    const ratio = (park: readonly [string, number, number][]): number => {
      const at = (mult: number): number =>
        world(park).r.run(new Rng(7), { season: 'summer', priceMult: mult }).revenue;
      return at(1.2) / at(1);
    };
    const free = ratio(FREE_PARK);
    const shop = ratio(SHOP_PARK);
    expect(free).toBeCloseTo(1.2, 3);
    expect(shop).toBeCloseTo(1.2, 3);
    expect(Math.abs(free - shop)).toBeLessThan(0.001);
  });

  it('⚠ 대조군 — `all-sale` 이면 포함 시설 판에서도 매출이 난다 (P6 이전)', () => {
    const { p, r } = world(FREE_PARK);
    p.chargeFaultForTest = 'all-sale';
    const rep = r.run(new Rng(7), { season: 'summer' });
    expect(rep.sales).toBeGreaterThan(0);
  });
});

describe('공짜라서 안 쓰는 것이 아니다 — 목적지는 `need` 로 고른다', () => {
  /**
   * 요금은 목적지 선택(`pickTarget`)에 **안 들어간다**. 들어가면 "포함으로 바꿨더니
   * 손님이 더/덜 간다"가 되어 이 변경이 밸런스를 몰래 흔든 것이 된다.
   *
   * 그래서 **비트 단위로 같음**을 요구한다 — 과금은 RNG 를 안 쓰므로 같은 시드면
   * 손님의 궤적이 완전히 같아야 한다.
   */
  const behaviour = (
    park: readonly [string, number, number][],
    fault: 'all-sale' | 'invert' | null,
  ): Record<string, number> => {
    const { p, r } = world(park);
    p.chargeFaultForTest = fault;
    const rep = r.run(new Rng(7), { season: 'summer' });
    return {
      visitors: rep.visitors,
      exitSatisfaction: rep.exitSatisfaction,
      gaveUp: rep.gaveUp,
      turnedAway: rep.turnedAway,
      peak: rep.days.reduce((a, d) => a + d.peak, 0),
    };
  };

  it('포함 판의 손님 행동이 `all-sale` 대조군과 완전히 같다', () => {
    expect(behaviour(FREE_PARK, null)).toEqual(behaviour(FREE_PARK, 'all-sale'));
  });

  it('파는 판도 분류를 뒤집은 대조군과 완전히 같다', () => {
    expect(behaviour(SHOP_PARK, null)).toEqual(behaviour(SHOP_PARK, 'invert'));
  });

  it('수영 구역도 표에 포함이다 — 이용은 세고 요금은 0 (대조군: 켜면 걷힌다)', () => {
    /**
     * 수영이야말로 입장권의 본체다. 물놀이 값을 표에 담아 놓고 물에서 또 받으면
     * 분류가 뒤집힌 것이다.
     *
     * ⚠ 구역은 시설이 아니라 `swim.ts` 의 `zoneFee` 가 정가를 갖는다. 그래서 분류
     * 스위치를 **시설과 같은 것**으로 묶어 뒀다 (`placement.chargeFaultForTest`) —
     * 스위치가 둘이면 한쪽만 켠 채 재게 된다.
     */
    const swimFee = (fault: 'all-sale' | null): number => {
      const N = 16;
      const t = new KairoTerrain(N, N);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) t.paint(i, j, 'path_stone');
      }
      for (let j = 6; j < 8; j++) for (let i = 6; i < 9; i++) t.paint(i, j, 'pool_water');
      const p = new PlacementGrid(N, N);
      p.chargeFaultForTest = fault;
      const g = new GuestStore(t, new WallGrid(N, N), p, SMALL_GATE, {
        ...OPEN_GATE_DEFAULTS,
        wantUses: 1,
      });
      const rng = new Rng(7);
      const guest = g.spawn(rng);
      for (let k = 0; k < 800 && guest?.state !== 'gone'; k++) g.tick(rng);
      expect(guest?.state).toBe('gone');
      const fin = g.takeFinished();
      // 이용 자체는 세어졌다 — 아래 0 이 "안 갔다"가 아니라 "공짜다"라는 확인
      expect(fin.feeByNeed.has('play')).toBe(true);
      return fin.feeByNeed.get('play') ?? -1;
    };
    expect(swimFee(null)).toBe(0);
    expect(swimFee('all-sale')).toBeGreaterThan(0);
  });

  it('수요 충족도 그대로다 — 공짜 시설도 `used` 를 채운다', () => {
    const t = new KairoTerrain(16, 16);
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) t.paint(i, j, 'path_stone');
    }
    const w = new WallGrid(16, 16);
    const p = new PlacementGrid(16, 16);
    expect(p.place(t, w, SMALL_GATE, 'playground', 6, 6).ok).toBe(true);
    const g = new GuestStore(t, w, p, SMALL_GATE, { ...OPEN_GATE_DEFAULTS, wantUses: 1 });
    const rng = new Rng(7);
    const guest = g.spawn(rng);
    expect(guest).not.toBeNull();
    for (let k = 0; k < 600 && guest?.state !== 'gone'; k++) g.tick(rng);
    expect(guest?.used).toBe(1);
    expect(guest?.usedNeeds).toContain('play');
    // 이용은 했는데 돈은 0 — 그것이 "표에 포함"이다
    expect(g.takeFinished().feeByNeed.get('play') ?? -1).toBe(0);
  });
});

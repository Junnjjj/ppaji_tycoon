import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import {
  PlacementGrid,
  allFacilityDefs,
  facilityDef,
  FACILITY_MAX_LEVEL,
  FACILITY_SPECIALTIES,
  LEVEL_FEE_STEP,
  SPECIALTY_FEE_BONUS,
  SPECIALTY_LEVEL,
  SPECIALTY_SATISFACTION_BONUS,
  type FacilitySpecialty,
} from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';

/**
 * 시설 개선의 **분기화** (P1.5) — PSS 의 "그릇 속의 그릇"을 새 시스템 없이.
 *
 * 지키려는 성질 셋:
 *   1. 특화 셋이 **서로 다른 자원**을 움직인다 (정원 · 요금 · 만족). 합쳐지면
 *      스탯 하나와 같아져 고를 이유가 사라진다
 *   2. **음성 대조군** — 안 고른 시설은 P1.5 이전과 **완전히** 같다.
 *      이게 깨지면 봇(`tools/kairo-sim.ts`)이 모르는 사이 밸런스가 움직인다
 *   3. 무엇을 고를 수 있는지는 **데이터**가 정한다 (불변식 3)
 */

const GATE = { i: 2, j: 2 };

function park(n = 10): { t: KairoTerrain; w: WallGrid; p: PlacementGrid; g: GuestStore } {
  const t = new KairoTerrain(40, 32);
  for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
  const w = new WallGrid(40, 32);
  const p = new PlacementGrid(40, 32);
  for (let k = 0; k < n; k++) {
    p.place(t, w, GATE, 'shop', 6 + (k % 8) * 3, 8 + Math.floor(k / 8) * 3);
  }
  const g = new GuestStore(t, w, p, GATE, OPEN_GATE_DEFAULTS);
  g.invalidate();
  return { t, w, p, g };
}

/** 모든 시설을 `level` 까지 올리고, 주면 특화까지 고른다 */
function grow(
  fx: ReturnType<typeof park>,
  level: number,
  spec?: FacilitySpecialty,
): ReturnType<typeof park> {
  for (const it of fx.p.all()) {
    while (fx.p.levelOf(it.handle) < level) fx.p.upgrade(it.handle);
    if (spec) expect(fx.p.chooseSpecialty(it.handle, spec)).toBe(true);
  }
  fx.g.invalidate();
  return fx;
}

const runWeek = (fx: ReturnType<typeof park>): ReturnType<WeekRunner['run']> =>
  new WeekRunner(fx.t, fx.p, fx.g).run(new Rng(4321), { season: 'summer' });

describe('특화 데이터 (불변식 3)', () => {
  it('모든 시설의 특화 목록이 알려진 값만 담는다', () => {
    for (const def of allFacilityDefs()) {
      for (const s of def.specialties ?? []) {
        expect(FACILITY_SPECIALTIES).toContain(s);
      }
      // 중복은 UI 에 버튼 두 개로 나온다
      expect(new Set(def.specialties ?? []).size).toBe((def.specialties ?? []).length);
    }
  });

  it('정원 0 인 분위기·기반 시설에는 특화가 없다 — 손님이 슬롯을 안 잡는다', () => {
    let ambience = 0;
    for (const def of allFacilityDefs()) {
      if (def.capacity !== 0) continue;
      ambience++;
      expect(PlacementGrid.specialtiesFor(def.id)).toEqual([]);
    }
    // 대조군: 그런 시설이 실제로 있어야 이 검사가 무언가를 잰다
    expect(ambience).toBeGreaterThan(5);
  });

  it('대다수 시설은 셋 다 고를 수 있다 — 갈림길이 드물면 축이 아니다', () => {
    const three = allFacilityDefs().filter((d) => (d.specialties ?? []).length === 3);
    expect(three.length).toBeGreaterThan(40);
  });

  it('매표소는 회전 하나뿐 — 게이트라 요금·이용 만족이 안 붙는다', () => {
    expect(PlacementGrid.specialtiesFor('ticket')).toEqual(['capacity']);
  });

  it('데이터가 막은 특화는 못 고른다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
    // shop 은 셋 다 되지만, 데이터가 하나만 준 매표소로 대조한다
    const { t, w, p: p2 } = park(0);
    p2.place(t, w, GATE, 'ticket', 10, 10);
    const th = p2.all()[0]!.handle;
    while (p2.levelOf(th) < SPECIALTY_LEVEL) p2.upgrade(th);
    expect(p2.chooseSpecialty(th, 'revenue')).toBe(false);
    expect(p2.chooseSpecialty(th, 'reputation')).toBe(false);
    expect(p2.specialtyOf(th)).toBeNull();
    expect(p2.chooseSpecialty(th, 'capacity')).toBe(true);
  });
});

describe('특화를 고르는 시점', () => {
  it(`${SPECIALTY_LEVEL}단계 전에는 못 고른다`, () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    for (let lv = 1; lv < SPECIALTY_LEVEL; lv++) {
      expect(p.canChooseSpecialty(h)).toBe(false);
      expect(p.chooseSpecialty(h, 'revenue')).toBe(false);
      p.upgrade(h);
    }
    expect(p.canChooseSpecialty(h)).toBe(true);
  });

  it('한 번 고르면 안 바뀐다 — 물리면 갈림길이 아니라 슬라이더다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
    expect(p.chooseSpecialty(h, 'revenue')).toBe(true);
    expect(p.chooseSpecialty(h, 'capacity')).toBe(false);
    expect(p.specialtyOf(h)).toBe('revenue');
  });

  it('⚠ 개선 자체는 안 막는다 — 막으면 특화를 모르는 봇이 3단계에 갇힌다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    for (let k = 1; k < FACILITY_MAX_LEVEL; k++) expect(p.upgrade(h)).toBe(true);
    expect(p.levelOf(h)).toBe(FACILITY_MAX_LEVEL);
    expect(p.specialtyOf(h)).toBeNull();
  });
});

describe('특화 셋이 서로 다른 자원을 움직인다', () => {
  it('회전 — 정원이 +1 늘고, 요금·만족은 그대로다', () => {
    const { p } = park(4);
    const base = p.totalCapacity();
    for (const it of p.all()) while (p.levelOf(it.handle) < SPECIALTY_LEVEL) p.upgrade(it.handle);
    // 단조 개선은 정원을 안 늘린다 (기존 결정) — 늘리는 것은 특화뿐이다
    expect(p.totalCapacity()).toBe(base);
    const feesAtL3 = p.all().map((it) => p.feeOf(it.handle));
    for (const it of p.all()) expect(p.chooseSpecialty(it.handle, 'capacity')).toBe(true);
    expect(p.totalCapacity()).toBe(base + 4);
    expect(p.all().map((it) => p.feeOf(it.handle))).toEqual(feesAtL3);
    for (const it of p.all()) expect(p.satisfactionBonusOf(it.handle)).toBe(0);
  });

  it('수익 — 요금이 +25%, 정원·만족은 그대로다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
    const fee = facilityDef('shop')!.fee;
    const plain = 1 + (SPECIALTY_LEVEL - 1) * LEVEL_FEE_STEP;
    expect(p.feeOf(h)).toBe(Math.round(fee * plain));
    const cap = p.capacityOf(h);
    expect(p.chooseSpecialty(h, 'revenue')).toBe(true);
    expect(p.feeOf(h)).toBe(Math.round(fee * (plain + SPECIALTY_FEE_BONUS)));
    expect(p.capacityOf(h)).toBe(cap);
    expect(p.satisfactionBonusOf(h)).toBe(0);
  });

  it('평판 — 이용 만족 이득이 늘고, 요금·정원은 그대로다', () => {
    const { p } = park(1);
    const h = p.all()[0]!.handle;
    while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
    const fee = p.feeOf(h);
    const cap = p.capacityOf(h);
    expect(p.satisfactionBonusOf(h)).toBe(0);
    expect(p.chooseSpecialty(h, 'reputation')).toBe(true);
    expect(p.satisfactionBonusOf(h)).toBe(SPECIALTY_SATISFACTION_BONUS);
    expect(p.feeOf(h)).toBe(fee);
    expect(p.capacityOf(h)).toBe(cap);
  });

  it(`${FACILITY_MAX_LEVEL}단계에서 효과가 두 배 — 3에서 고른 갈림길이 후반까지 산다`, () => {
    for (const s of FACILITY_SPECIALTIES) {
      const { p } = park(1);
      const h = p.all()[0]!.handle;
      while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
      p.chooseSpecialty(h, s);
      const at3 = { cap: p.capacityOf(h), sat: p.satisfactionBonusOf(h), scale: p.specialtyScale(h) };
      while (p.levelOf(h) < FACILITY_MAX_LEVEL) p.upgrade(h);
      expect(at3.scale).toBe(1);
      expect(p.specialtyScale(h)).toBe(2);
      if (s === 'capacity') expect(p.capacityOf(h)).toBe(at3.cap + 1);
      if (s === 'reputation') expect(p.satisfactionBonusOf(h)).toBe(at3.sat * 2);
    }
  });
});

describe('한 주를 돌려서 잰다 — 수치가 실제로 다르다', () => {
  const atL3 = (spec?: FacilitySpecialty): ReturnType<WeekRunner['run']> =>
    runWeek(grow(park(), SPECIALTY_LEVEL, spec));

  const plain = atL3();

  it('음성 대조군 — 특화를 안 고르면 결산이 한 항목도 안 움직인다', () => {
    const again = atL3();
    expect(again.revenue).toBe(plain.revenue);
    expect(again.exitSatisfaction).toBe(plain.exitSatisfaction);
    expect(again.visitors).toBe(plain.visitors);
  });

  it('수익 특화는 매출을 올린다', () => {
    expect(atL3('revenue').revenue).toBeGreaterThan(plain.revenue);
  });

  it('평판 특화는 퇴장 만족도를 올린다 — 매출이 아니라', () => {
    const rep = atL3('reputation');
    expect(rep.exitSatisfaction).toBeGreaterThan(plain.exitSatisfaction);
  });

  it('회전 특화는 동시 수용 인원을 올린다 — 손님 슬롯이 실제로 늘어난다', () => {
    const fx = grow(park(), SPECIALTY_LEVEL, 'capacity');
    const before = park();
    for (const it of before.p.all()) while (before.p.levelOf(it.handle) < SPECIALTY_LEVEL) before.p.upgrade(it.handle);
    expect(fx.p.totalCapacity()).toBe(before.p.totalCapacity() + before.p.count);
    // 슬롯이 늘었는지는 손님 쪽에서 본다 (`slotsOf` 가 def.capacity 를 읽으면 여기서 걸린다)
    const rep = runWeek(fx);
    expect(rep.visitors).toBeGreaterThan(0);
    expect(fx.g.slotCountForTest(fx.p.all()[0]!.handle)).toBe(
      (facilityDef('shop')?.capacity ?? 0) + 1,
    );
  });

  it('수익과 평판이 **반대 방향**으로 갈린다 — 합쳐지면 스탯 하나와 같아진다', () => {
    const rev = atL3('revenue');
    const rep = atL3('reputation');
    expect(rev.revenue).toBeGreaterThan(rep.revenue);
    expect(rep.exitSatisfaction).toBeGreaterThan(rev.exitSatisfaction);
  });
});

describe('스냅샷 (세이브의 sim 쪽 절반)', () => {
  it('특화가 스냅샷을 왕복해도 남는다 — 잃으면 고른 것이 새로고침으로 지워진다', () => {
    const { p } = park(3);
    const handles = p.all().map((it) => it.handle);
    for (const [k, h] of handles.entries()) {
      while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
      expect(p.chooseSpecialty(h, FACILITY_SPECIALTIES[k % 3] as FacilitySpecialty)).toBe(true);
    }
    const back = PlacementGrid.fromSnapshot(JSON.parse(JSON.stringify(p.toSnapshot())));
    for (const [k, h] of handles.entries()) {
      expect(back.specialtyOf(h)).toBe(FACILITY_SPECIALTIES[k % 3]);
      expect(back.feeOf(h)).toBe(p.feeOf(h));
      expect(back.capacityOf(h)).toBe(p.capacityOf(h));
    }
  });

  it('⚠ 필드가 없는 옛 스냅샷이 그대로 열린다 — 마이그레이션이 필요 없는 이유', () => {
    const { p } = park(3);
    for (const it of p.all()) while (p.levelOf(it.handle) < SPECIALTY_LEVEL) p.upgrade(it.handle);
    const raw = JSON.parse(JSON.stringify(p.toSnapshot())) as {
      items: Record<string, unknown>[];
    };
    // 옛 세이브에는 이 키가 아예 없다 — optional 이라 `packKairo` 가 안 담는다
    for (const it of raw.items) expect('specialty' in it).toBe(false);
    const back = PlacementGrid.fromSnapshot(raw as never);
    for (const it of back.all()) {
      expect(back.specialtyOf(it.handle)).toBeNull();
      expect(back.capacityOf(it.handle)).toBe(facilityDef(it.defId)?.capacity);
      expect(back.canChooseSpecialty(it.handle)).toBe(true);
    }
  });

  it('데이터가 안 허용하는 특화는 불러올 때 지운다 — 세이브가 데이터를 이기면 안 된다', () => {
    const { t, w, p } = park(0);
    p.place(t, w, GATE, 'ticket', 10, 10);
    const h = p.all()[0]!.handle;
    while (p.levelOf(h) < SPECIALTY_LEVEL) p.upgrade(h);
    const snap = JSON.parse(JSON.stringify(p.toSnapshot())) as {
      items: { specialty?: string }[];
    };
    snap.items[0]!.specialty = 'revenue'; // 손으로 고친 세이브
    const back = PlacementGrid.fromSnapshot(snap as never);
    expect(back.specialtyOf(h)).toBeNull();
  });
});

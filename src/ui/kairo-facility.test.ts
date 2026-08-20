import { describe, it, expect } from 'vitest';
import { facilityInfo } from './kairo-facility.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid } from '../sim/kairo/walls.js';
import {
  PlacementGrid,
  FACILITY_MAX_LEVEL,
  SPECIALTY_DOUBLE_LEVEL,
  SPECIALTY_LEVEL,
  allFacilityDefs,
  facilityDef,
} from '../sim/kairo/placement.js';

/**
 * 시설 인스턴스 정보가 **실제 값**을 말하나 (K49).
 *
 * ⚠ 이 파일은 **값의 규칙**만 잰다 (정원·개선·특화·요금이 sim 과 같은가). 그 글자가
 * 화면에 뜨는지는 브라우저 검사가 진짜 터치로 본다 — 여기서 DOM 을 흉내내면 "규칙은
 * 맞는데 화면은 그대로"를 놓친다 (`panels.test.ts`·`kairo-exam.test.ts` 와 같은 태도).
 *
 * 음성 대조군은 **코드로** 둔다 — 과금 분류를 뒤집는 스위치가 이미 sim 에 있다
 * (`PlacementGrid.chargeFaultForTest`, K49). 손으로 주입해 확인한 것은 다음 사람에게
 * 안 남는다 (K38 아키텍처 점검).
 */

const SIZE = 40;

/**
 * 평평한 포장 지면 위의 시설 하나. 격자만 있으면 되므로 지형은 최소로 만든다.
 * 실내 시설(`requiresIndoor`)이면 바닥을 실내로 깐다 — 실내 여부의 정본은 지형이다 (K27).
 */
function place(defId: string): { p: PlacementGrid; handle: number } {
  const t = new KairoTerrain(SIZE, SIZE);
  const kind = facilityDef(defId)?.placement.requiresIndoor ? 'floor_indoor' : 'path_stone';
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) t.paint(i, j, kind);
  const w = new WallGrid(SIZE, SIZE);
  const p = new PlacementGrid(SIZE, SIZE);
  const r = p.place(t, w, { i: 0, j: 0 }, defId, 6, 6);
  if (!r.ok || !r.placed) throw new Error(`${defId} 를 못 놓았다: ${r.fail}`);
  return { p, handle: r.placed.handle };
}

describe('요금 — 입장권에 포함인가, 따로 사는 것인가 (K49)', () => {
  it('★ 별도 구매 시설은 이용 요금을 말한다 — 매점', () => {
    const { p, handle } = place('shop');
    const info = facilityInfo(p, handle)!;
    expect(info.charge).toBe('sale');
    expect(info.fee).toBe(p.feeOf(handle));
    expect(info.fee).toBeGreaterThan(0);
    /*
     * ⚠ **눈금은 게임 눈금 하나다** — 명목가(×10)로 쓰지 않는다.
     *
     * 요금만 열 배로 쓰면 같은 시트의 `개선 21만` 과 자가 어긋나, 이 화면에서 실제로 하는
     * 계산("몇 번 팔아야 개선비를 뽑나")이 262회 → 26회로 열 배 틀린다. 개선을 누를지가
     * 그 숫자로 갈리므로 미관이 아니라 결정의 문제다. 실측으로 걸렸다.
     */
    const shown = Number(info.chargeLabel.replace(/[^\d]/g, ''));
    expect(shown).toBe(p.feeOf(handle));
  });

  it('★ 포함 시설은 요금이 아니라 **포함**이라고 말한다 — 화장실', () => {
    const { p, handle } = place('toilet');
    const info = facilityInfo(p, handle)!;
    expect(info.charge).toBe('included');
    // 데이터의 `fee` 는 800 이지만 **실제로 걷히는 돈은 0** 이다 (`feeOf` 가 정본)
    expect(facilityDef('toilet')?.fee).toBe(800);
    expect(info.fee).toBe(0);
    expect(info.chargeLabel).toBe('입장권에 포함');
    expect(info.chargeLabel).not.toContain('₩');
  });

  it('★ 음성 대조군 — 분류를 뒤집으면 표시도 뒤집힌다', () => {
    /*
     * 표시가 `charge` 를 **실제로** 읽고 있나. 분류가 죽어도 "매점은 유료, 화장실은
     * 무료"라는 상식이 우연히 맞아 통과하는 것을 막는다 — 그게 이 대조군의 존재 이유다.
     */
    const shop = place('shop');
    const toilet = place('toilet');
    shop.p.chargeFaultForTest = 'invert';
    toilet.p.chargeFaultForTest = 'invert';

    /*
     * ⚠ 요금뿐 아니라 **분류 표시까지** 뒤집혀야 한다. 표시가 데이터의 `charge` 를 따로
     * 읽으면 "라벨은 포함인데 손님은 ₩9,000 을 낸다"가 되는데, 그게 실제로 이 대조군을
     * 켜고 나온 첫 모양이었다 (K49 실측). 그래서 표시를 `feeOf` 에서 유도한다 —
     * `feeOf` 가 "이용마다 돈을 받나"의 유일한 관문이라고 sim 이 스스로 못박아 뒀다.
     */
    const s = facilityInfo(shop.p, shop.handle)!;
    expect(s.fee).toBe(0);
    expect(s.charge).toBe('included');
    expect(s.chargeLabel).toBe('입장권에 포함');

    const t = facilityInfo(toilet.p, toilet.handle)!;
    expect(t.fee).toBeGreaterThan(0);
    expect(t.charge).toBe('sale');
    expect(t.chargeLabel).toContain('₩');

    // 되돌리면 원래대로 — 대조군이 남아 다음 검사를 오염시키지 않는다
    shop.p.chargeFaultForTest = null;
    expect(facilityInfo(shop.p, shop.handle)!.charge).toBe('sale');
  });

  it('표시 분류가 데이터의 `charge` 와 어긋나지 않는다 — 놓을 수 있는 것 전부', () => {
    /*
     * `feeOf` 에서 유도한 표시가 데이터 계약과 같은 답을 내나. 갈라지는 순간
     * ("`sale` 인데 걷히는 돈이 0") 화면이 조용히 거짓말을 시작한다.
     *
     * ⚠ **데이터의 `fee` 를 그대로 보면 안 된다.** 포함 시설 42종도 `fee` 는 0 이 아니다
     * (정가가 적혀 있고 `feeOf` 가 0 으로 만든다) — 이 검사를 처음 그렇게 썼다가 42건이
     * 어긋난 것으로 나왔다. 실제로 재야 하는 것은 **인스턴스에서 걷히는 돈**이다.
     *
     * 물 위·펜션·계절 시설은 지형 제약이 있어 이 최소 판에 못 놓는다 — 놓인 것만 센다.
     */
    const checked: string[] = [];
    const bad: string[] = [];
    for (const d of allFacilityDefs()) {
      const kind = d.placement.requiresIndoor ? 'floor_indoor' : 'path_stone';
      const t = new KairoTerrain(SIZE, SIZE);
      for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) t.paint(i, j, kind);
      const p = new PlacementGrid(SIZE, SIZE);
      const r = p.place(t, new WallGrid(SIZE, SIZE), { i: 0, j: 0 }, d.id, 6, 6);
      if (!r.placed) continue;
      checked.push(d.id);
      const info = facilityInfo(p, r.placed.handle)!;
      const want = (d.charge ?? 'sale') === 'sale' ? 'sale' : 'included';
      if (info.charge !== want) bad.push(`${d.id} data=${want} 화면=${info.charge}`);
    }
    expect(bad).toEqual([]);
    // 표본이 말라 버리면 이 검사는 아무것도 안 재고 통과한다 (실측 기준선)
    expect(checked.length).toBeGreaterThan(30);
  });

  it('요금은 **개선·특화가 반영된 실효값**이다 — 데이터 정가가 아니다', () => {
    const { p, handle } = place('shop');
    const base = facilityInfo(p, handle)!.fee;
    p.upgrade(handle);
    const up = facilityInfo(p, handle)!.fee;
    expect(up).toBeGreaterThan(base);
    expect(up).toBe(p.feeOf(handle));
    // 수익 특화를 고르면 또 오른다 (25%)
    while (p.levelOf(handle) < SPECIALTY_LEVEL) p.upgrade(handle);
    expect(p.chooseSpecialty(handle, 'revenue')).toBe(true);
    expect(facilityInfo(p, handle)!.fee).toBe(p.feeOf(handle));
    expect(facilityInfo(p, handle)!.fee).toBeGreaterThan(up);
  });
});

describe('정원·개선·특화가 sim 과 같은 값이다', () => {
  it('★ 정원은 `capacityOf` — 회전 특화가 반영된 실효값이다', () => {
    const { p, handle } = place('shop');
    const base = facilityDef('shop')!.capacity;
    expect(facilityInfo(p, handle)!.capacity).toBe(base);
    expect(facilityInfo(p, handle)!.baseCapacity).toBe(base);

    while (p.levelOf(handle) < SPECIALTY_LEVEL) p.upgrade(handle);
    expect(p.chooseSpecialty(handle, 'capacity')).toBe(true);
    const info = facilityInfo(p, handle)!;
    expect(info.capacity).toBe(p.capacityOf(handle));
    expect(info.capacity).toBe(base + 1);
    // 기본값도 같이 낸다 — 둘을 견줘야 "특화로 늘었다"가 화면에서 읽힌다
    expect(info.baseCapacity).toBe(base);
  });

  it('★ 개선 단계와 특화 ×2 (5단계)', () => {
    const { p, handle } = place('shop');
    expect(facilityInfo(p, handle)!.level).toBe(1);
    expect(facilityInfo(p, handle)!.atMaxLevel).toBe(false);
    expect(facilityInfo(p, handle)!.upgradeCost).toBe(p.upgradeCost(handle));

    while (p.levelOf(handle) < SPECIALTY_LEVEL) p.upgrade(handle);
    p.chooseSpecialty(handle, 'reputation');
    const mid = facilityInfo(p, handle)!;
    expect(mid.specialty?.id).toBe('reputation');
    expect(mid.specialty?.doubled).toBe(false);
    expect(mid.choices.length).toBe(0); // 이미 골랐다 — 다시 고를 수 없다

    while (p.levelOf(handle) < FACILITY_MAX_LEVEL) p.upgrade(handle);
    const top = facilityInfo(p, handle)!;
    expect(top.level).toBe(SPECIALTY_DOUBLE_LEVEL);
    expect(top.atMaxLevel).toBe(true);
    expect(top.upgradeCost).toBe(0);
    expect(top.specialty?.doubled).toBe(true);
  });

  it('3단계에 닿으면 고를 수 있는 특화를 낸다 (데이터가 정한다)', () => {
    const { p, handle } = place('shop');
    expect(facilityInfo(p, handle)!.choices.length).toBe(0);
    while (p.levelOf(handle) < SPECIALTY_LEVEL) p.upgrade(handle);
    expect(facilityInfo(p, handle)!.choices).toEqual(PlacementGrid.specialtiesFor('shop'));
  });

  it('발자국은 **회전을 반영한다** — 비정사각이 뒤집혀 보이면 안 된다 (K45)', () => {
    /*
     * ⚠ 시설 ID 를 박지 않는다 — 데이터가 바뀌면 검사가 조용히 썩는다 (불변식 3).
     * 야외에 제약 없이 놓을 수 있는 비정사각을 데이터에서 **유도**해 고른다.
     */
    const oblong = allFacilityDefs().find(
      (d) =>
        d.size[0] !== d.size[1] &&
        d.layer === 'land' &&
        Object.keys(d.placement).length === 0,
    );
    if (!oblong) throw new Error('비정사각 야외 시설이 데이터에 없다 — 이 규칙을 잴 수 없다');

    const t = new KairoTerrain(SIZE, SIZE);
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) t.paint(i, j, 'path_stone');
    const w = new WallGrid(SIZE, SIZE);
    const p = new PlacementGrid(SIZE, SIZE);
    const a = p.place(t, w, { i: 0, j: 0 }, oblong.id, 4, 4);
    const b = p.place(t, w, { i: 0, j: 0 }, oblong.id, 20, 20, { facing: 1 });
    if (!a.placed || !b.placed) throw new Error(`비정사각 시설을 못 놓았다 (${a.fail}/${b.fail})`);
    const [w0, d0] = oblong.size;
    expect(facilityInfo(p, a.placed.handle)!.size).toBe(`${w0}×${d0}`);
    // ⚠ 회전하면 w↔h 가 바뀐다. 데이터 순서를 그대로 쓰면 4×1 샤워실이 뒤집혀 보인다
    expect(facilityInfo(p, b.placed.handle)!.size).toBe(`${d0}×${w0}`);
  });
});

describe('한 줄 설명 (K49) — 데이터가 갖는다 (불변식 3)', () => {
  it('★ 75종 전부 설명이 있다 — 빈 것이 있으면 그 시설만 화면이 허전해진다', () => {
    const empty = allFacilityDefs()
      .filter((d) => (d.desc ?? '').trim().length === 0)
      .map((d) => d.id);
    expect(empty).toEqual([]);
    expect(allFacilityDefs().length).toBe(75);
  });

  it('⚠ 설명이 스탯을 다시 적지 않는다 — 정원·요금은 화면이 실측값으로 띄운다', () => {
    /*
     * 데이터의 글이 숫자를 품으면 밸런싱으로 그 숫자를 바꿀 때마다 조용히 거짓말이 된다.
     * "정원 4명" "₩8,000" "유지비" 같은 스탯 낱말을 금지어로 못박는다.
     */
    const BANNED = /정원|유지비|₩|요금 \d|\d+ ?명이 동시/;
    const bad = allFacilityDefs()
      .filter((d) => BANNED.test(d.desc ?? ''))
      .map((d) => `${d.id}: ${d.desc}`);
    expect(bad).toEqual([]);
  });

  it('설명이 화면 값으로 온다', () => {
    const { p, handle } = place('shop');
    expect(facilityInfo(p, handle)!.desc).toBe(facilityDef('shop')!.desc);
    expect(facilityInfo(p, handle)!.desc.length).toBeGreaterThan(6);
  });
});

describe('가게 메뉴 (K49) — 표시 전용', () => {
  it('★ 메뉴 평균이 `fee` 와 정확히 같다 — 갈리면 화면이 결산과 다른 돈을 말한다', () => {
    const withMenu = allFacilityDefs().filter((d) => (d.menu?.length ?? 0) > 0);
    expect(withMenu.length).toBeGreaterThan(5); // 표본이 마르면 이 검사는 아무것도 안 잰다
    const bad: string[] = [];
    for (const d of withMenu) {
      const m = d.menu!;
      const avg = m.reduce((s, x) => s + x.price, 0) / m.length;
      if (avg !== d.fee) bad.push(`${d.id} 평균 ${avg} ≠ fee ${d.fee}`);
    }
    expect(bad).toEqual([]);
  });

  it('★ 메뉴는 **파는 시설에만** 있다 — 입장권 포함 시설에 있으면 "여기도 파나?"가 된다', () => {
    const bad = allFacilityDefs()
      .filter((d) => (d.menu?.length ?? 0) > 0 && (d.charge ?? 'sale') !== 'sale')
      .map((d) => d.id);
    expect(bad).toEqual([]);
  });

  it('★ 매점은 메뉴가 뜨고, 화장실은 안 뜬다', () => {
    const s = place('shop');
    const menu = facilityInfo(s.p, s.handle)!.menu;
    expect(menu.length).toBeGreaterThan(2);
    expect(menu.every((m) => m.name.length > 0 && m.price > 0)).toBe(true);
    const t = place('toilet');
    expect(facilityInfo(t.p, t.handle)!.menu).toEqual([]);
  });

  it('⚠ sim 에 배선되지 않았다 — 메뉴가 있어도 걷히는 돈은 `feeOf` 뿐이다 (P3-E 의 몫)', () => {
    /*
     * 지금 메뉴를 sim 에 물리면 밸런스가 왜 움직였는지 못 가린다. 이 검사가 그 경계다 —
     * 언젠가 P3-E 가 배선하면 **여기가 먼저 빨개져야** 한다 (그때 스펙을 보라는 신호).
     */
    const { p, handle } = place('shop');
    expect(p.feeOf(handle)).toBe(facilityDef('shop')!.fee);
  });
});

describe('개선 예고 (K49) — 앞이 안 보이면 개선할 이유가 안 생긴다', () => {
  it('★ 1단계에서도 3단계에 열릴 갈래를 낸다 — 데이터가 정한 것만', () => {
    const { p, handle } = place('shop');
    const info = facilityInfo(p, handle)!;
    expect(info.level).toBe(1);
    expect(info.choices).toEqual([]); // 아직 못 고른다
    expect(info.possible).toEqual(PlacementGrid.specialtiesFor('shop'));
    expect(info.possible.length).toBe(3);
  });

  it('★ 셋을 고정으로 그리면 안 된다 — 매표소는 하나, 분위기 시설은 없다', () => {
    const t = place('ticket');
    expect(facilityInfo(t.p, t.handle)!.possible).toEqual(['capacity']);
    // 정원 0 인 분위기 시설은 갈래가 아예 없다 (데이터의 빈 배열)
    const noneId = allFacilityDefs().find(
      (d) => (d.specialties?.length ?? 0) === 0 && d.layer === 'land',
    )?.id;
    if (noneId) {
      const n = place(noneId);
      expect(facilityInfo(n.p, n.handle)!.possible).toEqual([]);
    }
  });
});

describe('나머지 표시', () => {
  it('수요 종류는 한글 이름이다 — 심사 화면과 같은 표를 쓴다', () => {
    const s = place('shop');
    expect(facilityInfo(s.p, s.handle)!.need).toBe('먹거리');
    const t = place('toilet');
    expect(facilityInfo(t.p, t.handle)!.need).toBe('위생');
  });

  it('이용 중 인원은 바깥에서 준다 — 손님을 몰라도 이 화면은 성립한다', () => {
    const { p, handle } = place('shop');
    expect(facilityInfo(p, handle)!.using).toBeNull();
    expect(facilityInfo(p, handle, 2)!.using).toBe(2);
  });

  it('없는 핸들이면 null — 방금 철거된 시설을 탭한 경우다', () => {
    const { p, handle } = place('shop');
    expect(p.remove(handle)).toBe(true);
    expect(facilityInfo(p, handle)).toBeNull();
  });

  it('유지비는 데이터 그대로다 — 결산과 같은 눈금이어야 두 화면이 안 갈라진다', () => {
    const { p, handle } = place('shop');
    expect(facilityInfo(p, handle)!.upkeep).toBe(facilityDef('shop')!.upkeep);
  });
});

describe('입출구 — 놓은 뒤에도 알 수 있다 (K51)', () => {
  /** 물 위에 덱을 한 줄 깔고 그 옆에 슬라이드를 놓는다 (`requiresDeck` = 덱에 접함) */
  function placeSlide(facing: 0 | 1): { p: PlacementGrid; handle: number } {
    const t = new KairoTerrain(SIZE, SIZE);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) t.paint(i, j, j >= 10 ? 'water_edge' : 'path_stone');
    }
    const w = new WallGrid(SIZE, SIZE);
    const p = new PlacementGrid(SIZE, SIZE);
    for (let j = 10; j < 20; j++) p.place(t, w, { i: 0, j: 0 }, 'float_deck', 4, j);
    const r = p.place(t, w, { i: 0, j: 0 }, 'slide_large', 5, 11, { facing });
    if (!r.ok || !r.placed) throw new Error(`슬라이드를 못 놓았다: ${r.fail}`);
    return { p, handle: r.placed.handle };
  }

  it('★ 정보 화면의 입출구가 손님이 쓰는 그 칸이다 — 회전한 것도', () => {
    for (const facing of [0, 1] as const) {
      const { p, handle } = placeSlide(facing);
      const info = facilityInfo(p, handle)!;
      const truth = PlacementGrid.rideTilesOf(facilityDef('slide_large')!, 5, 11, facing)!;
      expect(info.ride, `facing ${facing}`).toEqual(truth);
      // 발자국 안이어야 한다 — 밖이면 화면이 시설 바깥을 가리킨다
      const foot = new Set(
        PlacementGrid.footprintTiles(facilityDef('slide_large')!, 5, 11, facing).map(
          (x) => `${x[0]},${x[1]}`,
        ),
      );
      expect(foot.has(`${info.ride!.entry[0]},${info.ride!.entry[1]}`)).toBe(true);
      expect(foot.has(`${info.ride!.exit[0]},${info.ride!.exit[1]}`)).toBe(true);
    }
  });

  it('회전하면 정보 화면의 입출구도 같이 돈다', () => {
    const flat = placeSlide(0);
    const turned = placeSlide(1);
    const a = facilityInfo(flat.p, flat.handle)!;
    const b = facilityInfo(turned.p, turned.handle)!;
    expect(a.ride).not.toEqual(b.ride);
  });

  it('ride 가 없는 시설은 null — 화장실에 입출구 줄이 뜨면 안 된다', () => {
    const { p, handle } = place('shop');
    expect(facilityInfo(p, handle)!.ride).toBeNull();
  });

  it('입출구를 가진 시설은 데이터의 4종뿐이다 — 줄이 아무 데나 안 뜬다', () => {
    expect(allFacilityDefs().filter((d) => d.ride).map((d) => d.id).sort()).toEqual(
      ['slide_large', 'slide_small', 'slide_tube', 'snow_sled'],
    );
  });
});

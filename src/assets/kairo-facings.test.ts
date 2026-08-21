import { describe, it, expect, afterEach } from 'vitest';
import {
  KAIRO_SIM,
  FACILITY_DIR_NAMES,
  allSimFacilities,
  assetFileToId,
  assetIdToFile,
  facilityFacings,
  facilitySpriteId,
  kairoAssetSizes,
  kairoSpriteIndex,
  kairoSpriteSpecs,
  validateContracts,
} from './kairo-contract.js';
import { KairoProceduralProvider } from './kairo-procedural.js';

/**
 * **에셋 쪽 4방향 배선** (K53) — 계약이 `facings: 4` 를 만나면 `dir` 축으로 편다.
 *
 * ⚠ 데이터에는 아직 4가 하나도 없다 (이번 커밋은 배선만). 그래서 이 파일은 `KAIRO_SIM`
 * 항목 하나를 **잠깐 4로 바꿔** 배선이 실제로 도는지 본다 — 데이터에 4를 미리 적어 두면
 * 그림이 없는 ID 를 아틀라스·게이트가 요구하게 된다.
 *
 * ⚠ 모듈 상태를 만지므로 `afterEach` 로 반드시 되돌린다. `kairoSpriteSpecs()` 가 부팅
 * 시점의 `simBySprite` 를 쓰지만 그 Map 은 **같은 객체를 가리키므로** 속성 변경이 보인다.
 */

const VICTIM = 'shop';

function setFacings(n: 2 | 4 | undefined): void {
  const sim = KAIRO_SIM[VICTIM]!;
  if (n === undefined) delete (sim as { facings?: 2 | 4 }).facings;
  else (sim as { facings?: 2 | 4 }).facings = n;
}

describe('데이터가 2 일 때 — 오늘과 완전히 같다', () => {
  it('모든 시설이 `dir` 축 없이 한 장이고 색인이 129장이다', () => {
    const facilities = kairoSpriteSpecs().filter((s) => s.category === 'facility');
    expect(facilities).toHaveLength(75);
    expect(facilities.filter((s) => s.variants?.dir)).toHaveLength(0);
    expect(kairoSpriteIndex().size).toBe(129);
    expect(kairoAssetSizes().size).toBe(144);
    expect(new KairoProceduralProvider().ids).toHaveLength(129);
  });

  it('75종 전부 `facilitySpriteId` 가 방향과 무관하게 base 를 준다', () => {
    /*
     * ⚠ **불변식 1 때문에 이 검사가 여기 산다.** `sim/` 은 `assets/` 를 import 할 수
     * 없으므로 (`facings.test.ts` 가 그 이유로 lint 에 걸렸다) 스프라이트 ID 쪽 대조는
     * 언제나 assets 쪽 파일이 한다.
     */
    for (const sim of allSimFacilities()) {
      expect(facilityFacings(sim.id), sim.id).toBe(2);
      for (const f of [0, 1, 2, 3]) expect(facilitySpriteId(sim.id, f), sim.id).toBe(sim.sprite);
    }
    expect(facilitySpriteId(VICTIM, 2)).toBe('facility/shop');
  });
});

describe('데이터를 4 로 바꾸면 — 그 시설만 네 장이 된다', () => {
  afterEach(() => setFacings(undefined));

  it('스프라이트 명세에 `dir` 축이 붙고 색인이 3장 는다', () => {
    setFacings(4);
    const spec = kairoSpriteSpecs().find((s) => s.id === 'facility/shop')!;
    expect(spec.variants?.dir).toEqual([...FACILITY_DIR_NAMES]);
    // 129 − 1(base) + 4 = 132. `alt` 만 폈던 옛 색인은 여기서 **129 로 남았다**
    expect(kairoSpriteIndex().size).toBe(132);
    expect(kairoAssetSizes().size).toBe(147);
  });

  it('절차 프로바이더가 **같은 전개**를 낸다 (색인과 갈라지지 않는다)', () => {
    setFacings(4);
    const ids = new KairoProceduralProvider().ids;
    expect(ids).toHaveLength(132);
    expect(new Set(ids)).toEqual(new Set(kairoSpriteIndex().keys()));
  });

  it('네 방향의 ID 가 서로 다르고 파일명이 왕복한다', () => {
    setFacings(4);
    const ids = [0, 1, 2, 3].map((f) => facilitySpriteId(VICTIM, f));
    expect(ids).toEqual([
      'facility/shop:d0',
      'facility/shop:d1',
      'facility/shop:d2',
      'facility/shop:d3',
    ]);
    for (const id of ids) {
      expect(assetIdToFile(id)).toBe(`${id.replace(':', '__').replace('/', '__')}.png`);
      expect(assetFileToId(assetIdToFile(id))).toBe(id);
    }
    expect(assetIdToFile('facility/shop:d2')).toBe('facility__shop__d2.png');
  });

  it('캔버스 크기는 네 장이 같다 — 회전은 `(w+d)` 를 안 바꾼다', () => {
    setFacings(4);
    const sizes = kairoAssetSizes();
    const want = sizes.get('facility/shop:d0');
    expect(want).toBeDefined();
    for (const f of FACILITY_DIR_NAMES) expect(sizes.get(`facility/shop:${f}`)).toEqual(want);
  });

  it('정합 검사는 그대로 통과한다 (계약이 방향을 안다)', () => {
    setFacings(4);
    expect(validateContracts()).toEqual([]);
  });

  it('2·4 가 아닌 값은 정합 검사가 잡는다 — 음성 대조군', () => {
    (KAIRO_SIM[VICTIM] as unknown as { facings: number }).facings = 3;
    expect(validateContracts().join('\n')).toContain('facings 3');
  });
});

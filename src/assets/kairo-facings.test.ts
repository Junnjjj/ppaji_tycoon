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
 * 승인된 20종은 라이브에서 이미 4방향이다. 이 파일은 그 정확한 생산 수를 고정하고,
 * 아직 2방향인 시설 하나를 **잠깐 4로 바꿔** 다음 채택도 같은 전개를 타는지 본다.
 *
 * ⚠ 모듈 상태를 만지므로 `afterEach` 로 반드시 되돌린다. `kairoSpriteSpecs()` 가 부팅
 * 시점의 `simBySprite` 를 쓰지만 그 Map 은 **같은 객체를 가리키므로** 속성 변경이 보인다.
 */

const VICTIM = 'ticket';
const LIVE_FOUR_WAY = new Set([
  'arcade', 'cafe', 'changing_row', 'chicken', 'icecream', 'infirmary', 'info', 'karaoke',
  'locker_row', 'nursing', 'office', 'pingpong', 'shop', 'shower_row', 'sikhye', 'snackbar',
  'storage', 'toilet', 'vending_in', 'washbasin_row',
]);

function setFacings(n: 2 | 4 | undefined): void {
  const sim = KAIRO_SIM[VICTIM]!;
  if (n === undefined) delete (sim as { facings?: 2 | 4 }).facings;
  else (sim as { facings?: 2 | 4 }).facings = n;
}

describe('라이브 데이터 — 승인된 20종만 4방향', () => {
  it('20종만 `dir` 축이고 색인은 189장이다', () => {
    const facilities = kairoSpriteSpecs().filter((s) => s.category === 'facility');
    expect(facilities).toHaveLength(75);
    expect(facilities.filter((s) => s.variants?.dir)).toHaveLength(20);
    expect(kairoSpriteIndex().size).toBe(189);
    expect(kairoAssetSizes().size).toBe(204);
    expect(new KairoProceduralProvider().ids).toHaveLength(189);
  });

  it('승인 20종은 d0–d3, 나머지는 방향과 무관한 base를 준다', () => {
    /*
     * ⚠ **불변식 1 때문에 이 검사가 여기 산다.** `sim/` 은 `assets/` 를 import 할 수
     * 없으므로 (`facings.test.ts` 가 그 이유로 lint 에 걸렸다) 스프라이트 ID 쪽 대조는
     * 언제나 assets 쪽 파일이 한다.
     */
    for (const sim of allSimFacilities()) {
      if (LIVE_FOUR_WAY.has(sim.id)) {
        expect(facilityFacings(sim.id), sim.id).toBe(4);
        for (const f of [0, 1, 2, 3]) {
          expect(facilitySpriteId(sim.id, f), sim.id).toBe(`${sim.sprite}:d${f}`);
        }
      } else {
        expect(facilityFacings(sim.id), sim.id).toBe(2);
        for (const f of [0, 1, 2, 3]) expect(facilitySpriteId(sim.id, f), sim.id).toBe(sim.sprite);
      }
    }
    expect(facilitySpriteId(VICTIM, 2)).toBe('facility/ticket');
  });
});

describe('데이터를 4 로 바꾸면 — 그 시설만 네 장이 된다', () => {
  afterEach(() => setFacings(undefined));

  it('스프라이트 명세에 `dir` 축이 붙고 색인이 3장 는다', () => {
    setFacings(4);
    const spec = kairoSpriteSpecs().find((s) => s.id === 'facility/ticket')!;
    expect(spec.variants?.dir).toEqual([...FACILITY_DIR_NAMES]);
    expect(kairoSpriteIndex().size).toBe(192);
    expect(kairoAssetSizes().size).toBe(207);
  });

  it('절차 프로바이더가 **같은 전개**를 낸다 (색인과 갈라지지 않는다)', () => {
    setFacings(4);
    const ids = new KairoProceduralProvider().ids;
    expect(ids).toHaveLength(192);
    expect(new Set(ids)).toEqual(new Set(kairoSpriteIndex().keys()));
  });

  it('네 방향의 ID 가 서로 다르고 파일명이 왕복한다', () => {
    setFacings(4);
    const ids = [0, 1, 2, 3].map((f) => facilitySpriteId(VICTIM, f));
    expect(ids).toEqual([
      'facility/ticket:d0',
      'facility/ticket:d1',
      'facility/ticket:d2',
      'facility/ticket:d3',
    ]);
    for (const id of ids) {
      expect(assetIdToFile(id)).toBe(`${id.replace(':', '__').replace('/', '__')}.png`);
      expect(assetFileToId(assetIdToFile(id))).toBe(id);
    }
    expect(assetIdToFile('facility/ticket:d2')).toBe('facility__ticket__d2.png');
  });

  it('캔버스 크기는 네 장이 같다 — 회전은 `(w+d)` 를 안 바꾼다', () => {
    setFacings(4);
    const sizes = kairoAssetSizes();
    const want = sizes.get('facility/ticket:d0');
    expect(want).toBeDefined();
    for (const f of FACILITY_DIR_NAMES) expect(sizes.get(`facility/ticket:${f}`)).toEqual(want);
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

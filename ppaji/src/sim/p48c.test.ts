import { describe, it, expect, expectTypeOf } from 'vitest';
import { Game, FACILITY_DEFS } from './game.js';
import { staffable, STAFFABLE_CLASSES } from './facility.js';
import { tasteWeight } from './guest.js';
import type { FacilityClass, FacilityDef } from '../data/schema.js';
import { goalNum } from '../../tools/goal-num.js';

/**
 * P48-c (§14 R3) — 동작 0 리팩터 ②: `class:'rig'` 를 닫힌 유니언에 넣고 소비처 전부(한글 이름·비용/인기 띠·그림 기본값·취향·이모트·간격 규칙·패키지 반경 'ppaji')를
 * 한 커밋에 잇는다. **기구 정의는 아직 0개**라 골든·바닥이 바이트 동일해야 한다 — 골든 표를 다시 굽지 않은 것이 그 증거다.
 */
describe('P48-c rig 유니언', () => {
  it('유니언은 닫혀 있고 rig 가 들어 있다 · 기구 정의 22(P49-a1 뒤) · 조합 2(2026-09-19)', () => {
    expectTypeOf<'rig'>().toMatchTypeOf<FacilityClass>();
    expect([...FACILITY_DEFS.values()].filter((d) => d.class === 'rig').length).toBe(56); // P48-c 시점 0 → P49-a1 이 새 17 + 이전 5 를 넣었다 · P51 개조판 19(망루 개조판은 utility) · 2026-09-19 승인 조합 2(빠지 슬라이드·빠지 놀이터). 폐기된 9종은 **정의가 남는다**(옛 세이브 호환)
  });
  it('기구는 알바를 안 쓰고(staffable false) 건물 간격 규칙 밖이다(isBuildingClass false)', () => {
    const rig = { class: 'rig', capacity: 4 } as Pick<FacilityDef, 'class' | 'capacity'>;
    expect(STAFFABLE_CLASSES).not.toContain('rig');
    expect(staffable(rig)).toBe(false);
    expect(Game.isBuildingClass({ class: 'rig', lodging: false } as FacilityDef)).toBe(false);
  });
  it('취향 — 기구는 스릴 가중치를 탄다 · 조건 라벨에 「기구」', () => {
    const taste = { thrill: 1.7, relax: 0.8, food: 1, kids: 1 } as unknown as Parameters<typeof tasteWeight>[2];
    expect(tasteWeight('rig', 0, taste)).toBe(tasteWeight('attraction', 0, taste));
    expect(new Game(1).evaluateCondition({ kind: 'facilityClass', class: 'rig', count: 2 }).label).toContain('기구');
  });
  it('패키지 반경 has.ppaji — 킷 빠지 옆 자리는 등급 1 부터 참(P50-b2), 북서 잔디는 거짓', () => {
    const g = new Game(1);
    const seat = g.facilities.all.find((f) => f.defId === 'pyeongsang_row' && f.i > g.gate.i)!; // 만 북안 평상 — 킷 빠지가 반경 3 안
    const far = g.facilities.all.find((f) => f.defId === 'pyeongsang_row' && f.i < g.gate.i)!;
    expect(g.seatPackages(seat.uid).map((p) => p.id)).toEqual(['swim']);
    expect(g.seatPackages(far.uid).map((p) => p.id)).toEqual(['swim']);
    expect(g.radiusNeedsOf(seat.uid)?.ppaji).toBe(false); // P50-b2: 등급 0(꺼진 수역)은 아직 「빠지」 가 아니다 — 첫 등급 상승과 같은 tick 에 참이 된다
    g.money = 1e6; for (const id of ['rig_stepstone', 'rig_bridge']) g.unlocked.facilities.add(id);
    expect(g.placeFacility('rig_stepstone', 51, 26, 0).ok).toBe(true); expect(g.placeFacility('rig_bridge', 52, 26, 1).ok).toBe(true); // n 2 → 등급 1
    expect(g.radiusNeedsOf(seat.uid)?.ppaji).toBe(true);
    expect(g.seatPackages(seat.uid).map((p) => p.id)).toEqual(['swim', 'ppaji']); // 자유이용권이 발견된다(값만 — 발급은 P52-a)
    expect(g.radiusNeedsOf(far.uid)?.ppaji).toBe(false);
  });
  it('goalNum(p48c) = 148.3 — b2(148.22) 뒤', () => { expect(goalNum('p48c')).toBeCloseTo(148.3, 6); expect(goalNum('p48c')).toBeGreaterThan(goalNum('p48b2')); });
});
